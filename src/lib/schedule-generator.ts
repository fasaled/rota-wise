import type { ScheduleFormValues, Schedule, ScheduleEntry, DoctorFormFieldInput, Unit } from "./types";
import { isSameDay, format, differenceInCalendarDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  isDateInArray,
  ensureDateArray,
  ensureCoverAssignments,
  getPostCallDate,
  getEffectiveUnitId,
  getAlliedUnitIds,
  computeUnitCoverageForDate,
  isPostCallOf,
} from './schedule-coverage';
import { type ScheduleWarning, analyzeUnitCoverage, analyzeBrokenConstraints } from './schedule-analyze';

export type { ScheduleWarning } from './schedule-analyze';
export type { CoverageDoctor } from './schedule-coverage';
export {
  getPostCallDate,
  getEffectiveUnitId,
  getAlliedUnitIds,
  isDoctorAvailableOnDate,
  computeUnitCoverageForDate,
} from './schedule-coverage';
export { analyzeBrokenConstraints, analyzeUnitCoverage } from './schedule-analyze';

interface DoctorWorkloadStats {
  totalWorkdays: number;
  workloadByDayOfWeek: { [dayKey: string]: number };
  monthlyWorkdays: { [monthKey: string]: number };
}

export function generateSchedule(
  data: ScheduleFormValues,
  existingFixedEntries?: ScheduleEntry[]
): { schedule?: Schedule; error?: string; warnings?: ScheduleWarning[] } {
  try {
    const { doctors: doctorInputs, startDate, endDate, minIntervalBetweenWorkDays = 1, globalMonthlyShiftLimit } = data;
    // Units are optional in the form (fileVersion 1 files don't have them). Default to [].
    const rawUnits = data.units ?? [];
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
        unitId: doc.unitId || undefined,
        coverAssignments: ensureCoverAssignments(doc.coverAssignments),
    }));

    const rawHolidays = data.holidays ?? [];
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

    const currentDateLoopVar = new Date(startDate);
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
      const dayHasFixedAssignment = !!existingFixedEntry;

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
