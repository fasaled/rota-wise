import type { ScheduleEntry, Unit, UnitCoverage, UnitCoverAssignment } from './types';
import { isSameDay, differenceInCalendarDays, addDays } from 'date-fns';

export function isDateInArray(date: Date, dateArray: Date[]): boolean {
  return dateArray.some((d) => d instanceof Date && isSameDay(d, date));
}

export const ensureDateArray = (dates: (Date | string)[] | undefined): Date[] => {
  if (!dates) return [];
  return dates.map((d) => (d instanceof Date ? d : new Date(d))).filter((d) => !isNaN(d.getTime()));
};

function isDateInInclusiveRange(date: Date, start: Date, end: Date): boolean {
  return differenceInCalendarDays(date, start) >= 0 && differenceInCalendarDays(date, end) <= 0;
}

export function ensureCoverAssignments(
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
 * Day the doctor is on post-call after working `workDate`.
 * Always the next calendar day, including holidays and Sunday.
 * Special case: Saturday's post-call is the following Monday (Sunday is skipped).
 */
export function getPostCallDate(workDate: Date): Date {
  if (workDate.getDay() === 6) return addDays(workDate, 2);
  return addDays(workDate, 1);
}

export function isPostCallOf(workDate: Date, date: Date): boolean {
  return isSameDay(getPostCallDate(workDate), date);
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

/**
 * A doctor is "available" on a given date when they are:
 *   - not on vacation on that date
 *   - not in a free day
 *   - not on post-call after a Work / Pre-assigned shift (see getPostCallDate)
 *   - not "skip" status (isExcludedFromAutomaticAssignment is intentionally NOT
 *     checked here: a doctor marked as excluded can still be available to satisfy
 *     unit coverage, the algorithm will simply never auto-pick them).
 *
 * Excluded dates are intentionally NOT checked: a doctor can be excluded from
 * assignment on a given day but still count towards unit coverage.
 *
 * `entries` is the current schedule. `doctor.preAssignedWorkDates` is also
 * consulted for the post-call check so the helper works correctly when called
 * directly (without the full schedule having been generated yet).
 */
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
