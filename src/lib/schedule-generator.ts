import type { ScheduleFormValues, Schedule, ScheduleEntry, DoctorFormFieldInput, Unit, UnitCoverage, UnitCoverAssignment } from "./types";
import { isSameDay, format, differenceInCalendarDays, eachDayOfInterval as eachDayOfIntervalDateFns, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale';

const dayKeyToSpanish: { [key: string]: string } = {
  Mon: 'Lunes',
  Tue: 'Martes',
  Wed: 'Miércoles',
  Thu: 'Jueves',
  Fri: 'Viernes',
  Sat: 'Sábado',
  Sun: 'Domingo'
};

function translateDayKey(dayKey: string, language: string): string {
  if (language === 'es') {
    return dayKeyToSpanish[dayKey] || dayKey;
  }
  return dayKey;
}

function isDateInArray(date: Date, dateArray: Date[]): boolean {
  return dateArray.some(d => d instanceof Date && isSameDay(d, date));
}

const ensureDateArray = (dates: (Date | string)[] | undefined): Date[] => {
    if (!dates) return [];
    return dates.map(d => d instanceof Date ? d : new Date(d)).filter(d => !isNaN(d.getTime()));
};

interface DoctorWorkloadStats {
  totalWorkdays: number;
  workloadByDayOfWeek: { [dayKey: string]: number };
  monthlyWorkdays: { [monthKey: string]: number };
}

export interface ScheduleWarning {
  key: string;
  params?: Record<string, any>;
}

// A doctor is "available" on a given date when they are:
//   - not on vacation on that date
//   - not in a free day
//   - not on post-call after a Work / Pre-assigned shift (see getPostCallDate)
//   - not "skip" status (isExcludedFromAutomaticAssignment is intentionally NOT
//     checked here: a doctor marked as excluded can still be available to satisfy
//     unit coverage, the algorithm will simply never auto-pick them).
//
// Excluded dates are intentionally NOT checked: a doctor can be excluded from
// assignment on a given day but still count towards unit coverage.
//
// `entries` is the current schedule. `doctor.preAssignedWorkDates` is also
// consulted for the post-call check so the helper works correctly when called
// directly (without the full schedule having been generated yet).

/**
 * Day the doctor is on post-call after working `workDate`.
 * Always the next calendar day, including holidays and Sunday.
 * Special case: Saturday's post-call is the following Monday (Sunday is skipped).
 */
export function getPostCallDate(workDate: Date): Date {
  if (workDate.getDay() === 6) return addDays(workDate, 2);
  return addDays(workDate, 1);
}

function isPostCallOf(workDate: Date, date: Date): boolean {
  return isSameDay(getPostCallDate(workDate), date);
}
function isDateInInclusiveRange(date: Date, start: Date, end: Date): boolean {
  return differenceInCalendarDays(date, start) >= 0 && differenceInCalendarDays(date, end) <= 0;
}

function ensureCoverAssignments(
  raw: UnitCoverAssignment[] | undefined,
): UnitCoverAssignment[] {
  if (!raw) return [];
  return raw
    .map((a) => ({
      id: a.id,
      targetUnitId: a.targetUnitId,
      startDate: a.startDate instanceof Date ? a.startDate : new Date(a.startDate),
      endDate: a.endDate instanceof Date ? a.endDate : new Date(a.endDate),
    }))
    .filter(
      (a) =>
        !!a.targetUnitId &&
        !isNaN(a.startDate.getTime()) &&
        !isNaN(a.endDate.getTime()),
    );
}

/**
 * Unit the doctor counts toward on `date`: an active vacation-cover
 * assignment if one exists, otherwise their home `unitId`.
 */
export function getEffectiveUnitId(
  doctor: { unitId?: string; coverAssignments?: UnitCoverAssignment[] },
  date: Date,
): string | undefined {
  for (const assignment of ensureCoverAssignments(doctor.coverAssignments)) {
    if (isDateInInclusiveRange(date, assignment.startDate, assignment.endDate)) {
      return assignment.targetUnitId;
    }
  }
  return doctor.unitId || undefined;
}

/**
 * Undirected connected component of units allied for post-call coverage,
 * including `unitId` itself.
 */
export function getAlliedUnitIds(unitId: string, units: Unit[]): string[] {
  const adj = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    let set = adj.get(id);
    if (!set) {
      set = new Set<string>();
      adj.set(id, set);
    }
    return set;
  };
  for (const unit of units) {
    ensure(unit.id);
    for (const other of unit.alliedUnitIds ?? []) {
      ensure(unit.id).add(other);
      ensure(other).add(unit.id);
    }
  }
  if (!adj.has(unitId)) return [unitId];
  const visited = new Set<string>();
  const stack = [unitId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }
  return Array.from(visited);
}

export type CoverageDoctor = {
  id: string;
  unitId?: string;
  freeDates: Date[];
  preAssignedWorkDates?: Date[];
  coverAssignments?: UnitCoverAssignment[];
};

export function isDoctorAvailableOnDate(
  doctor: CoverageDoctor,
  date: Date,
  entries: ScheduleEntry[],
  _holidays: Date[] = [],
): boolean {
  if (isDateInArray(date, doctor.freeDates)) return false;

  const onPostCall =
    entries.some(
      (e) =>
        e.doctorId === doctor.id &&
        (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
        isPostCallOf(e.date, date),
    ) ||
    (doctor.preAssignedWorkDates ?? []).some((d) => isPostCallOf(d, date));
  if (onPostCall) return false;

  return true;
}

/**
 * Compute per-unit coverage status for a single date. Only weekdays (Mon-Fri) are
 * considered; weekends return an empty array. The on-call doctor for the same day
 * is still counted as available in their unit (they are "present" in the unit, just
 * also on call). Doctors on post-call (next calendar day, or Monday after a
 * Saturday shift) are excluded. A shift on a holiday still produces post-call
 * on the following calendar day; holidays never skip or delay that day.
 *
 * If `subtractDoctorId` is provided, that doctor is removed from the count — used
 * by the algorithm to look ahead one day: "if I put X on call today, will X's unit
 * still meet coverage tomorrow?"
 */
export function computeUnitCoverageForDate(
  date: Date,
  doctors: CoverageDoctor[],
  units: Unit[],
  entries: ScheduleEntry[],
  options: { subtractDoctorId?: string; holidays?: Date[] } = {},
): UnitCoverage[] {
  const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) return [];
  // Holidays are treated like weekends for coverage purposes: no coverage
  // is required. The check uses day-level (not time-level) comparison.
  if (options.holidays?.some((h) => isSameDay(h, date))) return [];

  const result: UnitCoverage[] = [];
  for (const unit of units) {
    const status: 'tracked' | 'ignored' = unit.minPostCallCoverage > 0 ? 'tracked' : 'ignored';
    const groupIds = new Set(getAlliedUnitIds(unit.id, units));
    const alliedUnitNames = units
      .filter((u) => u.id !== unit.id && groupIds.has(u.id))
      .map((u) => u.name);
    const countsForUnit = (doctor: CoverageDoctor) => {
      const effective = getEffectiveUnitId(doctor, date);
      return !!effective && groupIds.has(effective);
    };

    if (status === 'ignored') {
      // Still emit a row so the calendar can show a neutral dot for untracked units.
      result.push({
        unitId: unit.id,
        unitName: unit.name,
        min: unit.minPostCallCoverage,
        available: doctors.filter(countsForUnit).length,
        isCovered: true,
        status: 'ignored',
        alliedUnitNames: alliedUnitNames.length > 0 ? alliedUnitNames : undefined,
      });
      continue;
    }

    let available = 0;
    for (const doctor of doctors) {
      if (!countsForUnit(doctor)) continue;
      if (options.subtractDoctorId && doctor.id === options.subtractDoctorId) continue;
      if (isDoctorAvailableOnDate(doctor, date, entries, options.holidays)) available++;
    }

    result.push({
      unitId: unit.id,
      unitName: unit.name,
      min: unit.minPostCallCoverage,
      available,
      isCovered: available >= unit.minPostCallCoverage,
      status: 'tracked',
      alliedUnitNames: alliedUnitNames.length > 0 ? alliedUnitNames : undefined,
    });
  }
  return result;
}

export function generateSchedule(
  data: ScheduleFormValues,
  existingFixedEntries?: ScheduleEntry[]
): { schedule?: Schedule; error?: string; warnings?: ScheduleWarning[] } {
  try {
    const { doctors: doctorInputs, startDate, endDate, minIntervalBetweenWorkDays = 1, globalMonthlyShiftLimit } = data;
    // Units are optional in the form (fileVersion 1 files don't have them). Default to [].
    const rawUnits = (data as { units?: Unit[] }).units ?? [];
    const units: Unit[] = rawUnits.map((u) => ({
      id: u.id,
      name: u.name,
      minPostCallCoverage: u.minPostCallCoverage,
      alliedUnitIds: u.alliedUnitIds ?? [],
    }));
    const unitsById: Map<string, Unit> = new Map(units.map((u) => [u.id, u]));
    const warnings: ScheduleWarning[] = [];

    const doctorsWithIds: DoctorFormFieldInput[] = doctorInputs.map(doc => ({
        ...doc,
        id: doc.id || `doc-${Math.random().toString(36).substring(2, 9)}`,
        freeDates: ensureDateArray(doc.freeDates),
        preAssignedWorkDates: ensureDateArray(doc.preAssignedWorkDates),
        excludedDates: ensureDateArray(doc.excludedDates),
        isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
        unitId: (doc as { unitId?: string }).unitId || undefined,
        coverAssignments: ensureCoverAssignments(doc.coverAssignments),
    }));

    const rawHolidays = (data as { holidays?: Date[] }).holidays ?? [];
    const holidays: Date[] = rawHolidays.map((d) => (d instanceof Date ? d : new Date(d)));

    const preAssignmentCalendarDateConflicts = new Map<string, { doctors: string[]; conflictDate: Date }>();
    doctorsWithIds.forEach(doctor => {
        doctor.preAssignedWorkDates.forEach(paDate => {
            const dateKey = format(paDate, 'yyyy-MM-dd');
            if (!preAssignmentCalendarDateConflicts.has(dateKey)) {
                preAssignmentCalendarDateConflicts.set(dateKey, { doctors: [], conflictDate: paDate });
            }
            preAssignmentCalendarDateConflicts.get(dateKey)!.doctors.push(doctor.name);
        });
    });

    preAssignmentCalendarDateConflicts.forEach((value) => {
        if (value.doctors.length > 1) {
            warnings.push({
                key: 'warnings.multiplePreAssignedInput',
                params: {
                    date: value.conflictDate,
                    doctors: value.doctors.join(', ')
                }
            });
        }
    });

    const mockEntries: ScheduleEntry[] = [];

    if (existingFixedEntries) {
      existingFixedEntries.forEach(entry => {
        const entryDate = new Date(entry.date);
        if (entryDate >= startDate && entryDate <= endDate && entry.isFixed) {
          mockEntries.push({
            ...entry,
            date: new Date(entryDate),
            isFixed: true
          });
        }
      });
    }

    let currentDateLoopVar = new Date(startDate);
    const finalEndDate = new Date(endDate);

    const doctorStats: { [doctorId: string]: DoctorWorkloadStats } = {};
    const doctorLastWorkDay: { [doctorId: string]: Date | null } = {};
    const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekendDayKeys = ['Fri', 'Sat', 'Sun'];
    const preferredDayKeys = ['Thu', 'Fri', 'Sat', 'Sun'];
    const doctorWeekendDaysThisMonth: { [doctorId: string]: { [monthKey: string]: number } } = {};

    doctorsWithIds.forEach(doc => {
      doctorLastWorkDay[doc.id] = null;
      doctorWeekendDaysThisMonth[doc.id] = {};
      const initialWorkloadByDay: { [dayKey: string]: number } = {};
      dayKeys.forEach(key => initialWorkloadByDay[key] = 0);

      doctorStats[doc.id] = {
        totalWorkdays: 0,
        workloadByDayOfWeek: initialWorkloadByDay,
        monthlyWorkdays: {},
      };

      const workDatesBeforeStart: Date[] = [];
      workDatesBeforeStart.push(...doc.preAssignedWorkDates.filter(d => d < startDate));

      if (existingFixedEntries) {
        const fixedWorkDatesBeforeStart = existingFixedEntries
          .filter(entry => entry.doctorId === doc.id &&
                         (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned') &&
                         entry.date < startDate)
          .map(entry => new Date(entry.date));
        workDatesBeforeStart.push(...fixedWorkDatesBeforeStart);
      }

      if (workDatesBeforeStart.length > 0) {
        const sortedWorkDates = workDatesBeforeStart.sort((a, b) => b.getTime() - a.getTime());
        doctorLastWorkDay[doc.id] = sortedWorkDates[0];
      }
    });

    if (existingFixedEntries) {
      existingFixedEntries.forEach(entry => {
        const entryDate = new Date(entry.date);
        if (entryDate >= startDate && entryDate <= endDate && entry.isFixed &&
            (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')) {
          const doctorId = entry.doctorId;
          const dayOfWeekKey = format(entryDate, 'EEE', { locale: enUS });
          const monthKey = format(entryDate, 'yyyy-MM');
          const isWeekend = weekendDayKeys.includes(dayOfWeekKey);

          if (doctorStats[doctorId]) {
            doctorStats[doctorId].totalWorkdays++;
            doctorStats[doctorId].workloadByDayOfWeek[dayOfWeekKey]++;
            doctorStats[doctorId].monthlyWorkdays[monthKey] = (doctorStats[doctorId].monthlyWorkdays[monthKey] || 0) + 1;

            if (isWeekend) {
              doctorWeekendDaysThisMonth[doctorId][monthKey] = (doctorWeekendDaysThisMonth[doctorId][monthKey] || 0) + 1;
            }
          }

          if (entryDate <= startDate && (!doctorLastWorkDay[doctorId] || entryDate > doctorLastWorkDay[doctorId])) {
            doctorLastWorkDay[doctorId] = new Date(entryDate);
          }
        }
      });
    }

    while (currentDateLoopVar <= finalEndDate) {
      const currentDate = new Date(currentDateLoopVar);
      const dayOfWeekFullName = format(currentDate, 'EEEE', { locale: enUS });
      const dayOfWeekKey = format(currentDate, 'EEE', { locale: enUS });
      const currentMonthKey = format(currentDate, 'yyyy-MM');
      const isCurrentDayWeekend = weekendDayKeys.includes(dayOfWeekKey);
      const isPreferredDay = preferredDayKeys.includes(dayOfWeekKey);

      const existingFixedEntry = mockEntries.find(entry =>
        isSameDay(entry.date, currentDate) && entry.isFixed
      );

      if (existingFixedEntry && (existingFixedEntry.assignment === 'Work' || existingFixedEntry.assignment === 'Pre-assigned')) {
        doctorLastWorkDay[existingFixedEntry.doctorId] = new Date(currentDate);
      }

      let dayHasAnyPreAssignment = false;
      let dayHasFixedAssignment = !!existingFixedEntry;

      for (const doctor of doctorsWithIds) {
          if (isDateInArray(currentDate, doctor.preAssignedWorkDates)) {
              const doctorHasFixedEntryOnDate = mockEntries.some(entry =>
                  isSameDay(entry.date, currentDate) &&
                  entry.doctorId === doctor.id &&
                  entry.isFixed
              );

              if (!doctorHasFixedEntryOnDate) {
                  mockEntries.push({
                      date: new Date(currentDate),
                      doctorId: doctor.id,
                      assignment: 'Pre-assigned',
                      dayOfWeek: dayOfWeekFullName,
                  });
                  dayHasAnyPreAssignment = true;

                  doctorLastWorkDay[doctor.id] = new Date(currentDate);
                  if (doctorStats[doctor.id]) {
                      doctorStats[doctor.id].totalWorkdays++;
                      doctorStats[doctor.id].workloadByDayOfWeek[dayOfWeekKey]++;
                      doctorStats[doctor.id].monthlyWorkdays[currentMonthKey] = (doctorStats[doctor.id].monthlyWorkdays[currentMonthKey] || 0) + 1;
                  }
                  if (isCurrentDayWeekend) {
                      doctorWeekendDaysThisMonth[doctor.id][currentMonthKey] = (doctorWeekendDaysThisMonth[doctor.id][currentMonthKey] || 0) + 1;
                  }
              }
          }
      }

      for (const doctor of doctorsWithIds) {
          if (isDateInArray(currentDate, doctor.freeDates)) {
              mockEntries.push({
                  date: new Date(currentDate),
                  doctorId: doctor.id,
                  assignment: 'Free',
                  dayOfWeek: dayOfWeekFullName,
              });
          }
      }

      let automaticallyAssignedDoctorThisDay = false;
      if (!dayHasAnyPreAssignment && !dayHasFixedAssignment && doctorsWithIds.length > 0) {
        const eligibleDoctors = doctorsWithIds.filter(doc => {
            if (doc.isExcludedFromAutomaticAssignment) return false;
            if (isDateInArray(currentDate, doc.freeDates)) return false;
            if (isDateInArray(currentDate, doc.excludedDates)) return false;

            const allWorkDates: Date[] = [];
            allWorkDates.push(...doc.preAssignedWorkDates);

            if (existingFixedEntries) {
              const fixedWorkDates = existingFixedEntries
                .filter(entry => entry.doctorId === doc.id &&
                               (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned'))
                .map(entry => new Date(entry.date));
              allWorkDates.push(...fixedWorkDates);
            }

            const currentlyAssignedWorkDates = mockEntries
              .filter(entry => entry.doctorId === doc.id &&
                             (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned'))
              .map(entry => new Date(entry.date));
            allWorkDates.push(...currentlyAssignedWorkDates);

            for (const workDate of allWorkDates) {
              // A holiday is not a "work day" for the min-interval check:
              // it's a free day, so the gap between a shift and a holiday
              // pre-assignment does not violate the spacing rule.
              if (holidays.some((h) => isSameDay(h, workDate))) continue;
              const daysDiff = Math.abs(differenceInCalendarDays(currentDate, workDate));
              if (daysDiff <= minIntervalBetweenWorkDays) {
                return false;
              }
            }

            // Post-call hard rule (independent of minInterval): cannot be on
            // call on the post-call day of an existing shift. Post-call is the
            // next calendar day (including holidays); Saturday → Monday.
            if (allWorkDates.some((d) => isPostCallOf(d, currentDate))) return false;

            // Pre-assignment conflict: if the doctor already has a shift on
            // today's post-call day, assigning them today would clash with it.
            const postCallDate = getPostCallDate(currentDate);
            if (allWorkDates.some((d) => isSameDay(d, postCallDate))) return false;

            // Unit coverage look-ahead: if putting this doctor on call today
            // would leave any tracked unit in their (effective) alliance under
            // minimum on the post-call day, drop them. Coverage itself is not
            // required on weekends/holidays (computeUnitCoverageForDate returns []).
            const effectiveUnitIdOnPostCall = getEffectiveUnitId(doc, postCallDate);
            if (effectiveUnitIdOnPostCall) {
              const alliedIds = getAlliedUnitIds(effectiveUnitIdOnPostCall, units);
              const postCallCoverage = computeUnitCoverageForDate(
                postCallDate,
                doctorsWithIds,
                units,
                mockEntries,
                { subtractDoctorId: doc.id, holidays },
              );
              const wouldUndercover = alliedIds.some((uid) => {
                const unit = unitsById.get(uid);
                if (!unit || unit.minPostCallCoverage <= 0) return false;
                const cov = postCallCoverage.find((c) => c.unitId === uid);
                return !!cov && cov.available < unit.minPostCallCoverage;
              });
              if (wouldUndercover) return false;
            }

            return true;
        });

        if (eligibleDoctors.length > 0) {
            const globalTotalWorkdays = doctorsWithIds.reduce((sum, doc) => {
              const stats = doctorStats[doc.id];
              return sum + (stats?.totalWorkdays || 0);
            }, 0);
            const globalAvgWorkdays = doctorsWithIds.length > 0 ? globalTotalWorkdays / doctorsWithIds.length : 0;

            const globalDayOfWeekTotals: { [key: string]: number } = {};
            dayKeys.forEach(key => globalDayOfWeekTotals[key] = 0);
            doctorsWithIds.forEach(doc => {
              dayKeys.forEach(key => {
                globalDayOfWeekTotals[key] += doctorStats[doc.id]?.workloadByDayOfWeek[key] || 0;
              });
            });

            const globalAvgPerDayOfWeek: { [key: string]: number } = {};
            dayKeys.forEach(key => {
              globalAvgPerDayOfWeek[key] = doctorsWithIds.length > 0 ? globalDayOfWeekTotals[key] / doctorsWithIds.length : 0;
            });

            const scoredDoctors = eligibleDoctors.map(doc => {
              const stats = doctorStats[doc.id];
              const monthKey = currentMonthKey;

              const totalWorkdays = stats?.totalWorkdays || 0;
              const monthlyWorkdays = stats?.monthlyWorkdays[monthKey] || 0;

              const dayOfWeekCount = stats?.workloadByDayOfWeek[dayOfWeekKey] || 0;
              const globalAvgDayCount = globalAvgPerDayOfWeek[dayOfWeekKey] || 0;
              const dayOfWeekDeficit = globalAvgDayCount - dayOfWeekCount;

              const dayOfWeekPreferredBonus = isPreferredDay ? (globalAvgDayCount - dayOfWeekCount) * 1.5 : 0;

              const weekendDaysThisMonth = doctorWeekendDaysThisMonth[doc.id]?.[monthKey] || 0;
              const globalAvgWeekendPerMonth = doctorsWithIds.reduce((sum, d) => sum + (doctorWeekendDaysThisMonth[d.id]?.[monthKey] || 0), 0) / doctorsWithIds.length;
              const weekendDeficit = globalAvgWeekendPerMonth - weekendDaysThisMonth;

              const monthlyDeficit = globalAvgWorkdays - monthlyWorkdays;

              const lastWorkDay = doctorLastWorkDay[doc.id];
              let daysSinceLastWork = 999;
              if (lastWorkDay) {
                daysSinceLastWork = differenceInCalendarDays(currentDate, lastWorkDay);
              }

              const score =
                dayOfWeekDeficit +
                dayOfWeekPreferredBonus +
                weekendDeficit * 0.8 +
                monthlyDeficit * 0.6 +
                daysSinceLastWork * 0.1;

              return { doctor: doc, score };
            });

            // Weighted sampling: every eligible doctor can win, but higher
            // scores are still favoured. We map scores to non-negative weights
            // (shift by the min so the worst candidate can still be picked) and
            // sample proportionally. This produces visibly different schedules
            // on consecutive runs while keeping hard constraints intact and
            // preserving fairness preferences encoded in the score.
            const scores = scoredDoctors.map(d => d.score);
            const minScore = Math.min(...scores);
            const weights = scores.map(s => Math.max(0, s - minScore) + 1);
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let pick = Math.random() * totalWeight;
            let chosenIdx = 0;
            for (let i = 0; i < weights.length; i++) {
              pick -= weights[i];
              if (pick <= 0) { chosenIdx = i; break; }
            }
            const doctorToAssign = scoredDoctors[chosenIdx]?.doctor;
            if (doctorToAssign) {
                mockEntries.push({
                    date: new Date(currentDate),
                    doctorId: doctorToAssign.id,
                    assignment: 'Work',
                    dayOfWeek: dayOfWeekFullName,
                });
                doctorLastWorkDay[doctorToAssign.id] = new Date(currentDate);
                if (doctorStats[doctorToAssign.id]) {
                    doctorStats[doctorToAssign.id].totalWorkdays++;
                    doctorStats[doctorToAssign.id].workloadByDayOfWeek[dayOfWeekKey]++;
                    doctorStats[doctorToAssign.id].monthlyWorkdays[currentMonthKey] = (doctorStats[doctorToAssign.id].monthlyWorkdays[currentMonthKey] || 0) + 1;
                }
                if (isCurrentDayWeekend) {
                    doctorWeekendDaysThisMonth[doctorToAssign.id][currentMonthKey] = (doctorWeekendDaysThisMonth[doctorToAssign.id][currentMonthKey] || 0) + 1;
                }
                automaticallyAssignedDoctorThisDay = true;
            }
        }

        if (!automaticallyAssignedDoctorThisDay && !dayHasAnyPreAssignment && !dayHasFixedAssignment) {
             const anyDoctorPotentiallyAvailable = doctorsWithIds.some(doc => !doc.isExcludedFromAutomaticAssignment);

             if (anyDoctorPotentiallyAvailable) {
                  mockEntries.push({
                     date: new Date(currentDate),
                     doctorId: 'system',
                     assignment: 'Off',
                     dayOfWeek: dayOfWeekFullName,
                 });
                  warnings.push({
                      key: 'warnings.uncoveredDay',
                      params: { date: new Date(currentDate) }
                  });
             } else {
                  mockEntries.push({
                     date: new Date(currentDate),
                     doctorId: 'system',
                     assignment: 'Off',
                     dayOfWeek: dayOfWeekFullName,
                 });
             }
        }

      } else if (!dayHasAnyPreAssignment && !dayHasFixedAssignment && doctorsWithIds.length === 0) {
         mockEntries.push({
            date: new Date(currentDate),
            doctorId: 'system',
            assignment: 'Off',
            dayOfWeek: dayOfWeekFullName,
        });
      }

      currentDateLoopVar.setDate(currentDateLoopVar.getDate() + 1);
    }

    const brokenConstraints = analyzeBrokenConstraints(mockEntries, doctorsWithIds, minIntervalBetweenWorkDays, globalMonthlyShiftLimit, startDate, finalEndDate);
    warnings.push(...brokenConstraints);

    const coverageWarnings = analyzeUnitCoverage(mockEntries, doctorsWithIds, units, startDate, finalEndDate, holidays);
    warnings.push(...coverageWarnings);

    return {
      schedule: {
        entries: mockEntries,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        minIntervalBetweenWorkDays: minIntervalBetweenWorkDays,
        globalMonthlyShiftLimit: globalMonthlyShiftLimit,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (e) {
    console.error("Error generating schedule:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred while generating the schedule.";
    return { error: errorMessage };
  }
}

export function analyzeBrokenConstraints(
  entries: ScheduleEntry[],
  doctors: DoctorFormFieldInput[],
  minInterval: number,
  globalMonthlyLimit: number | undefined,
  startDate: Date,
  endDate: Date,
  language: string = 'en'
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekendDayKeys = ['Fri', 'Sat', 'Sun'];
  const preferredDayKeys = ['Thu', 'Fri', 'Sat', 'Sun'];

  const allWorkEntries = entries.filter(e => e.assignment === 'Work' || e.assignment === 'Pre-assigned');

  doctors.forEach(doc => {
    const allWorkDates: Date[] = [];

    entries.forEach(entry => {
      if (entry.doctorId === doc.id && (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')) {
        allWorkDates.push(entry.date);
      }
    });

    allWorkDates.sort((a, b) => a.getTime() - b.getTime());

    for (let i = 1; i < allWorkDates.length; i++) {
      const daysBetween = differenceInCalendarDays(allWorkDates[i], allWorkDates[i - 1]);
      if (daysBetween <= minInterval) {
        warnings.push({
          key: 'warnings.brokenMinInterval',
          params: {
            doctor: doc.name,
            date1: allWorkDates[i - 1],
            date2: allWorkDates[i],
            interval: daysBetween,
            required: minInterval
          }
        });
      }
    }
  });

  doctors.forEach(doc => {
    doc.freeDates.forEach(freeDay => {
      const workOnFreeDay = allWorkEntries.find(
        e => e.doctorId === doc.id && isSameDay(e.date, freeDay)
      );
      if (workOnFreeDay) {
        warnings.push({
          key: 'warnings.workOnFreeDay',
          params: {
            doctor: doc.name,
            date: freeDay
          }
        });
      }
    });
  });

  doctors.forEach(doc => {
    doc.excludedDates.forEach(exclDate => {
      const workOnExcluded = allWorkEntries.find(
        e => e.doctorId === doc.id && isSameDay(e.date, exclDate)
      );
      if (workOnExcluded) {
        warnings.push({
          key: 'warnings.workOnExcludedDate',
          params: {
            doctor: doc.name,
            date: exclDate
          }
        });
      }
    });
  });

  if (globalMonthlyLimit !== undefined && globalMonthlyLimit > 0) {
    const monthlyGroups = new Map<string, Map<string, number>>();

    allWorkEntries.forEach(entry => {
      const monthKey = format(entry.date, 'yyyy-MM');
      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, new Map());
      }
      const doctorCounts = monthlyGroups.get(monthKey)!;
      doctorCounts.set(entry.doctorId, (doctorCounts.get(entry.doctorId) || 0) + 1);
    });

    monthlyGroups.forEach((doctorCounts, monthKey) => {
      doctorCounts.forEach((count, doctorId) => {
        if (count > globalMonthlyLimit) {
          const doctor = doctors.find(d => d.id === doctorId);
          warnings.push({
            key: 'warnings.exceededMonthlyLimit',
            params: {
              doctor: doctor?.name || doctorId,
              month: monthKey,
              count: count,
              limit: globalMonthlyLimit
            }
          });
        }
      });
    });
  }

  const doctorMonthlyTotals: { [doctorId: string]: { [monthKey: string]: number } } = {};
  doctors.forEach(doc => {
    doctorMonthlyTotals[doc.id] = {};
  });

  allWorkEntries.forEach(entry => {
    const monthKey = format(entry.date, 'yyyy-MM');
    doctorMonthlyTotals[entry.doctorId][monthKey] = (doctorMonthlyTotals[entry.doctorId][monthKey] || 0) + 1;
  });

  const allMonthKeys = new Set<string>();
  allWorkEntries.forEach(entry => {
    allMonthKeys.add(format(entry.date, 'yyyy-MM'));
  });

  allMonthKeys.forEach(monthKey => {
    const monthTotals = doctors.map(doc => doctorMonthlyTotals[doc.id][monthKey] || 0);
    const maxMonth = Math.max(...monthTotals);
    const minMonth = Math.min(...monthTotals.filter(t => t > 0));
    if (maxMonth - minMonth > 3) {
      const maxDoctor = doctors.find(doc => doctorMonthlyTotals[doc.id][monthKey] === maxMonth);
      const minDoctor = doctors.find(doc => doctorMonthlyTotals[doc.id][monthKey] === minMonth);
      warnings.push({
        key: 'warnings.unbalancedMonthlyWorkdays',
        params: {
          month: monthKey,
          maxDoctor: maxDoctor?.name || maxDoctor?.id,
          maxCount: maxMonth,
          minDoctor: minDoctor?.name || minDoctor?.id,
          minCount: minMonth
        }
      });
    }
  });

  const doctorDayOfWeekTotals: { [doctorId: string]: { [dayKey: string]: number } } = {};
  doctors.forEach(doc => {
    doctorDayOfWeekTotals[doc.id] = {};
    dayKeys.forEach(key => doctorDayOfWeekTotals[doc.id][key] = 0);
  });

  allWorkEntries.forEach(entry => {
    const dayKey = format(entry.date, 'EEEE', { locale: enUS });
    doctorDayOfWeekTotals[entry.doctorId][dayKey] = (doctorDayOfWeekTotals[entry.doctorId][dayKey] || 0) + 1;
  });

  dayKeys.forEach(dayKey => {
    const dayTotals = doctors.map(doc => doctorDayOfWeekTotals[doc.id][dayKey] || 0);
    const maxCount = Math.max(...dayTotals);
    const minCount = Math.min(...dayTotals.filter(t => t > 0));
    if (maxCount - minCount > 3) {
      const maxDoctor = doctors.find(doc => doctorDayOfWeekTotals[doc.id][dayKey] === maxCount);
      const minDoctor = doctors.find(doc => doctorDayOfWeekTotals[doc.id][dayKey] === minCount);
      warnings.push({
        key: 'warnings.unbalancedDayOfWeek',
        params: {
          day: translateDayKey(dayKey, language),
          maxDoctor: maxDoctor?.name || maxDoctor?.id,
          maxCount: maxCount,
          minDoctor: minDoctor?.name || minDoctor?.id,
          minCount: minCount
        }
      });
    }
  });

  preferredDayKeys.forEach(preferredKey => {
    const dayTotals = doctors.map(doc => doctorDayOfWeekTotals[doc.id][preferredKey] || 0);
    const maxCount = Math.max(...dayTotals);
    const minCount = Math.min(...dayTotals.filter(t => t > 0));
    if (maxCount - minCount > 2) {
      const maxDoctor = doctors.find(doc => doctorDayOfWeekTotals[doc.id][preferredKey] === maxCount);
      const minDoctor = doctors.find(doc => doctorDayOfWeekTotals[doc.id][preferredKey] === minCount);
      warnings.push({
        key: 'warnings.unbalancedPreferredDays',
        params: {
          day: translateDayKey(preferredKey, language),
          maxDoctor: maxDoctor?.name || maxDoctor?.id,
          maxCount: maxCount,
          minDoctor: minDoctor?.name || minDoctor?.id,
          minCount: minCount
        }
      });
    }
  });

  return warnings;
}

/**
 * Post-generation coverage analysis. Iterates over every weekday in the schedule
 * range, computes unit coverage, and emits a `warnings.postCallUncovered` warning
 * for each (date, unit) pair where available doctors are below the unit's minimum.
 *
 * Also emits `warnings.postCallPreAssignmentConflict` for pre-assigned on-calls
 * that, combined with the post-call rule, would leave their unit undercovered on
 * the following weekday.
 */
export function analyzeUnitCoverage(
  entries: ScheduleEntry[],
  doctors: CoverageDoctor[],
  units: Unit[],
  startDate: Date,
  endDate: Date,
  holidays: Date[] = [],
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  if (units.length === 0) return warnings;

  const trackedUnits = units.filter((u) => u.minPostCallCoverage > 0);
  if (trackedUnits.length === 0) return warnings;

  const cursor = new Date(startDate);
  const end = new Date(endDate);
  const seenKeys = new Set<string>();

  while (cursor <= end) {
    const dayOfWeek = cursor.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidays.some((h) => isSameDay(h, cursor));
    if (!isWeekend && !isHoliday) {
      const coverage = computeUnitCoverageForDate(cursor, doctors, units, entries, { holidays });
      for (const c of coverage) {
        if (c.status !== 'tracked') continue;
        if (c.isCovered) continue;
        const key = `${format(cursor, 'yyyy-MM-dd')}-${c.unitId}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        warnings.push({
          key: 'warnings.postCallUncovered',
          params: {
            date: new Date(cursor),
            unit: c.unitName,
            available: c.available,
            min: c.min,
          },
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return warnings;
}