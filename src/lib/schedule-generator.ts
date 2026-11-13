import type { ScheduleFormValues, Schedule, ScheduleEntry, DoctorFormFieldInput, Unit } from './types';
import { isSameDay, format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  isDateInArray,
  ensureDateArray,
  ensureCoverAssignments,
  getPostCallDate,
  getEffectiveUnitId,
  getAlliedUnitIds,
  isPostCallOf,
} from './schedule-coverage';
import { type ScheduleWarning, analyzeUnitCoverage, analyzeBrokenConstraints } from './schedule-analyze';
import { getAssignmentBlockReason } from './schedule-eligibility';
import { createRng, deriveSeed, randomSeed, type Rng } from './random';
import { toDateKey } from './dates';

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

export interface GenerateOptions {
  /** Seed for the weighted sampling. Same inputs + same seed = same roster. */
  seed?: number;
  /**
   * Number of candidate rosters to build. The one with the lowest cost
   * (uncovered days, then unit undercoverage, then workload spread) is kept.
   * Defaults to 1.
   */
  attempts?: number;
}

export interface GenerateResult {
  schedule?: Schedule;
  error?: string;
  warnings?: ScheduleWarning[];
  /** Seed of the attempt that produced `schedule`. */
  seed?: number;
}

const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKEND_DAY_KEYS = ['Fri', 'Sat', 'Sun'];
const PREFERRED_DAY_KEYS = ['Thu', 'Fri', 'Sat', 'Sun'];

// Score weights (see docs/algorithm.md §6).
const W_TOTAL = 1;
const W_DAY_OF_WEEK = 1;
const W_PREFERRED_DAY = 1.5;
const W_WEEKEND = 0.8;
const W_MONTHLY = 0.6;
const W_IDLE = 0.05;
const IDLE_CAP_DAYS = 14;
const SOFT_LIMIT_PENALTY = 4;
/** Softmax temperature: lower = the best-scored doctor wins more often. */
const SAMPLING_TEMPERATURE = 0.5;
/** Repair only looks at doctors blocked by at most this many of their own shifts. */
const MAX_REPAIR_CONFLICTS = 2;

interface DoctorStats {
  totalWorkdays: number;
  workloadByDayOfWeek: Record<string, number>;
  monthlyWorkdays: Record<string, number>;
  weekendDaysByMonth: Record<string, number>;
  lastWorkDay: Date | null;
}

interface Context {
  doctors: DoctorFormFieldInput[];
  units: Unit[];
  trackedUnits: Unit[];
  alliedIdsByUnit: Map<string, string[]>;
  holidays: Date[];
  startDate: Date;
  endDate: Date;
  minInterval: number;
  monthlyLimit: number | undefined;
  enforceMonthlyLimit: boolean;
  fixedEntries: ScheduleEntry[];
}

interface Attempt {
  entries: ScheduleEntry[];
  uncoveredDates: Date[];
  cost: number;
}

const isWorkLike = (assignment: ScheduleEntry['assignment']) =>
  assignment === 'Work' || assignment === 'Pre-assigned';

const dayKeyOf = (date: Date) => format(date, 'EEE', { locale: enUS });
const monthKeyOf = (date: Date) => format(date, 'yyyy-MM');

function spread(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

/**
 * One greedy day-by-day pass plus a repair pass. Pure function of the context
 * and the RNG.
 */
function runAttempt(ctx: Context, rng: Rng): Attempt {
  const { doctors, holidays, startDate, endDate, minInterval, monthlyLimit, enforceMonthlyLimit } = ctx;
  const entries: ScheduleEntry[] = [];

  // Every shift of each doctor, inside and outside the range, past and future.
  const work = new Map<string, Date[]>();
  const stats = new Map<string, DoctorStats>();
  // Automatically assigned (movable) shifts and uncovered days, by date key.
  const autoWorkByKey = new Map<string, ScheduleEntry>();
  const offByKey = new Map<string, ScheduleEntry>();

  const strictLimit = enforceMonthlyLimit && monthlyLimit !== undefined && monthlyLimit > 0;
  const softLimit = !enforceMonthlyLimit && monthlyLimit !== undefined && monthlyLimit > 0;

  for (const doc of doctors) {
    work.set(doc.id, [...doc.preAssignedWorkDates]);
    const byDay: Record<string, number> = {};
    DAY_KEYS.forEach((key) => (byDay[key] = 0));
    stats.set(doc.id, {
      totalWorkdays: 0,
      workloadByDayOfWeek: byDay,
      monthlyWorkdays: {},
      weekendDaysByMonth: {},
      lastWorkDay: null,
    });
  }

  const countShift = (doctorId: string, date: Date, delta: 1 | -1) => {
    const s = stats.get(doctorId);
    if (!s) return;
    const dayKey = dayKeyOf(date);
    const monthKey = monthKeyOf(date);
    s.totalWorkdays += delta;
    s.workloadByDayOfWeek[dayKey] += delta;
    s.monthlyWorkdays[monthKey] = (s.monthlyWorkdays[monthKey] || 0) + delta;
    if (WEEKEND_DAY_KEYS.includes(dayKey)) {
      s.weekendDaysByMonth[monthKey] = (s.weekendDaysByMonth[monthKey] || 0) + delta;
    }
  };

  // --- Seed from pinned entries ------------------------------------------------
  for (const entry of ctx.fixedEntries) {
    const entryDate = new Date(entry.date);
    const inRange = entryDate >= startDate && entryDate <= endDate;
    if (inRange) entries.push({ ...entry, date: entryDate, isFixed: true });
    if (!isWorkLike(entry.assignment)) continue;
    work.get(entry.doctorId)?.push(entryDate);
    if (inRange) countShift(entry.doctorId, entryDate, 1);
  }
  for (const doc of doctors) {
    const before = (work.get(doc.id) ?? []).filter((d) => d < startDate);
    if (before.length > 0) {
      stats.get(doc.id)!.lastWorkDay = before.reduce((a, b) => (a > b ? a : b));
    }
  }

  // --- Coverage helpers --------------------------------------------------------
  const isCoverageDay = (date: Date) => {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false;
    return !holidays.some((h) => isSameDay(h, date));
  };
  const isAvailableForCoverage = (doc: DoctorFormFieldInput, date: Date) =>
    !isDateInArray(date, doc.freeDates) && !(work.get(doc.id) ?? []).some((w) => isPostCallOf(w, date));

  /** Available doctors per tracked unit on `date` (allied pools included). */
  const availableByUnit = (date: Date): Map<string, number> => {
    const result = new Map<string, number>();
    if (ctx.trackedUnits.length === 0 || !isCoverageDay(date)) return result;
    const availableByEffectiveUnit = new Map<string, number>();
    for (const doc of doctors) {
      const unitId = getEffectiveUnitId(doc, date);
      if (!unitId || !isAvailableForCoverage(doc, date)) continue;
      availableByEffectiveUnit.set(unitId, (availableByEffectiveUnit.get(unitId) ?? 0) + 1);
    }
    for (const unit of ctx.trackedUnits) {
      let total = 0;
      for (const id of ctx.alliedIdsByUnit.get(unit.id) ?? [unit.id]) {
        total += availableByEffectiveUnit.get(id) ?? 0;
      }
      result.set(unit.id, total);
    }
    return result;
  };

  /**
   * Look-ahead: would putting `doc` on call on `date` leave a tracked unit of
   * their alliance under its minimum on the post-call day?
   */
  const wouldUndercover = (
    doc: DoctorFormFieldInput,
    postCallDate: Date,
    postCallAvailability: Map<string, number>,
  ): boolean => {
    if (postCallAvailability.size === 0) return false;
    const unitId = getEffectiveUnitId(doc, postCallDate);
    if (!unitId) return false;
    const countedNow = isAvailableForCoverage(doc, postCallDate) ? 1 : 0;
    for (const alliedId of ctx.alliedIdsByUnit.get(unitId) ?? getAlliedUnitIds(unitId, ctx.units)) {
      const available = postCallAvailability.get(alliedId);
      if (available === undefined) continue;
      const unit = ctx.trackedUnits.find((u) => u.id === alliedId);
      if (unit && available - countedNow < unit.minPostCallCoverage) return true;
    }
    return false;
  };

  const isEligible = (
    doc: DoctorFormFieldInput,
    date: Date,
    postCallDate: Date,
    postCallAvailability: Map<string, number>,
  ): boolean => {
    if (doc.isExcludedFromAutomaticAssignment) return false;
    if (getAssignmentBlockReason(doc, date, work.get(doc.id) ?? [], minInterval, holidays)) return false;
    if (strictLimit && (stats.get(doc.id)?.monthlyWorkdays[monthKeyOf(date)] ?? 0) >= monthlyLimit!) return false;
    return !wouldUndercover(doc, postCallDate, postCallAvailability);
  };

  const eligibleDoctorsFor = (date: Date): DoctorFormFieldInput[] => {
    const postCallDate = getPostCallDate(date);
    const postCallAvailability = availableByUnit(postCallDate);
    return doctors.filter((doc) => isEligible(doc, date, postCallDate, postCallAvailability));
  };

  // --- Scoring -----------------------------------------------------------------
  const pickDoctor = (eligible: DoctorFormFieldInput[], date: Date): DoctorFormFieldInput => {
    const dayKey = dayKeyOf(date);
    const monthKey = monthKeyOf(date);
    const isWeekend = WEEKEND_DAY_KEYS.includes(dayKey);
    const isPreferred = PREFERRED_DAY_KEYS.includes(dayKey);
    const n = doctors.length;

    let sumTotal = 0;
    let sumDay = 0;
    let sumMonth = 0;
    let sumWeekend = 0;
    for (const doc of doctors) {
      const s = stats.get(doc.id)!;
      sumTotal += s.totalWorkdays;
      sumDay += s.workloadByDayOfWeek[dayKey] || 0;
      sumMonth += s.monthlyWorkdays[monthKey] || 0;
      sumWeekend += s.weekendDaysByMonth[monthKey] || 0;
    }

    const scores = eligible.map((doc) => {
      const s = stats.get(doc.id)!;
      const monthly = s.monthlyWorkdays[monthKey] || 0;
      const dayDeficit = sumDay / n - (s.workloadByDayOfWeek[dayKey] || 0);
      const idleDays = s.lastWorkDay
        ? Math.min(IDLE_CAP_DAYS, Math.max(0, Math.round((date.getTime() - s.lastWorkDay.getTime()) / 86_400_000)))
        : IDLE_CAP_DAYS;

      let score =
        (sumTotal / n - s.totalWorkdays) * W_TOTAL +
        dayDeficit * W_DAY_OF_WEEK +
        (isPreferred ? dayDeficit * W_PREFERRED_DAY : 0) +
        (isWeekend ? (sumWeekend / n - (s.weekendDaysByMonth[monthKey] || 0)) * W_WEEKEND : 0) +
        (sumMonth / n - monthly) * W_MONTHLY +
        idleDays * W_IDLE;
      if (softLimit && monthly >= monthlyLimit!) score -= SOFT_LIMIT_PENALTY;
      return score;
    });

    // Softmax sampling: every eligible doctor can win, but the weight drops
    // exponentially with the distance to the best score.
    const maxScore = Math.max(...scores);
    const weights = scores.map((s) => Math.exp((s - maxScore) / SAMPLING_TEMPERATURE));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let pick = rng() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return eligible[i];
    }
    return eligible[eligible.length - 1];
  };

  const assign = (doc: DoctorFormFieldInput, date: Date, entry: ScheduleEntry) => {
    entry.doctorId = doc.id;
    work.get(doc.id)!.push(date);
    countShift(doc.id, date, 1);
  };
  const unassign = (doctorId: string, date: Date) => {
    const dates = work.get(doctorId)!;
    const idx = dates.findIndex((d) => isSameDay(d, date));
    if (idx !== -1) dates.splice(idx, 1);
    countShift(doctorId, date, -1);
  };

  // --- Day loop ----------------------------------------------------------------
  const anyDoctorPotentiallyAvailable = doctors.some((doc) => !doc.isExcludedFromAutomaticAssignment);
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const currentDate = new Date(cursor);
    const dayOfWeek = format(currentDate, 'EEEE', { locale: enUS });
    const fixedToday = entries.filter((e) => e.isFixed && isSameDay(e.date, currentDate));
    const pinnedWork = fixedToday.filter((e) => isWorkLike(e.assignment));
    for (const pinned of pinnedWork) {
      const s = stats.get(pinned.doctorId);
      if (s) s.lastWorkDay = currentDate;
    }

    let hasPreAssignment = false;
    for (const doc of doctors) {
      if (!isDateInArray(currentDate, doc.preAssignedWorkDates)) continue;
      if (fixedToday.some((e) => e.doctorId === doc.id)) continue;
      entries.push({ date: currentDate, doctorId: doc.id, assignment: 'Pre-assigned', dayOfWeek });
      hasPreAssignment = true;
      countShift(doc.id, currentDate, 1);
      stats.get(doc.id)!.lastWorkDay = currentDate;
    }

    for (const doc of doctors) {
      if (isDateInArray(currentDate, doc.freeDates)) {
        entries.push({ date: currentDate, doctorId: doc.id, assignment: 'Free', dayOfWeek });
      }
    }

    if (!hasPreAssignment && pinnedWork.length === 0) {
      const eligible = doctors.length > 0 ? eligibleDoctorsFor(currentDate) : [];
      if (eligible.length > 0) {
        const chosen = pickDoctor(eligible, currentDate);
        const entry: ScheduleEntry = { date: currentDate, doctorId: chosen.id, assignment: 'Work', dayOfWeek };
        entries.push(entry);
        assign(chosen, currentDate, entry);
        stats.get(chosen.id)!.lastWorkDay = currentDate;
        autoWorkByKey.set(toDateKey(currentDate), entry);
      } else {
        const off: ScheduleEntry = { date: currentDate, doctorId: 'system', assignment: 'Off', dayOfWeek };
        entries.push(off);
        offByKey.set(toDateKey(currentDate), off);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  // --- Repair pass -------------------------------------------------------------
  // The greedy pass cannot look back. For every uncovered day, try to free a
  // doctor who is only blocked by one or two of their own automatic shifts, by
  // handing those shifts to a colleague who is fully eligible for them.
  if (anyDoctorPotentiallyAvailable) {
    for (const [key, off] of Array.from(offByKey)) {
      const date = off.date;
      for (const doc of doctors) {
        if (doc.isExcludedFromAutomaticAssignment) continue;
        if (isDateInArray(date, doc.freeDates) || isDateInArray(date, doc.excludedDates)) continue;

        const own = work.get(doc.id) ?? [];
        const conflicts = own.filter(
          (w) => getAssignmentBlockReason({ freeDates: [], excludedDates: [] }, date, [w], minInterval, holidays) !== null,
        );
        if (conflicts.length === 0 || conflicts.length > MAX_REPAIR_CONFLICTS) continue;
        const movable = conflicts.map((w) => autoWorkByKey.get(toDateKey(w)));
        if (movable.some((entry) => !entry || entry.doctorId !== doc.id || entry.isFixed)) continue;

        // Tentatively move `doc` from the conflicting shifts to the uncovered day.
        conflicts.forEach((w) => unassign(doc.id, w));
        const undo: Array<() => void> = [];
        let ok = eligibleDoctorsFor(date).some((d) => d.id === doc.id);
        if (ok) {
          assign(doc, date, off);
          undo.push(() => {
            unassign(doc.id, date);
            off.doctorId = 'system';
          });
          for (const entry of movable as ScheduleEntry[]) {
            const replacement = eligibleDoctorsFor(entry.date).find((d) => d.id !== doc.id);
            if (!replacement) {
              ok = false;
              break;
            }
            assign(replacement, entry.date, entry);
            undo.push(() => unassign(replacement.id, entry.date));
          }
        }

        if (ok) {
          off.assignment = 'Work';
          offByKey.delete(key);
          autoWorkByKey.set(key, off);
          break;
        }
        undo.reverse().forEach((fn) => fn());
        conflicts.forEach((w, i) => assign(doc, w, movable[i] as ScheduleEntry));
      }
    }
  }

  // --- Cost (used to compare attempts) -----------------------------------------
  const uncoveredDates = anyDoctorPotentiallyAvailable ? Array.from(offByKey.values()).map((e) => e.date) : [];

  let undercovered = 0;
  if (ctx.trackedUnits.length > 0) {
    const day = new Date(startDate);
    while (day <= endDate) {
      const availability = availableByUnit(day);
      for (const unit of ctx.trackedUnits) {
        const available = availability.get(unit.id);
        if (available !== undefined && available < unit.minPostCallCoverage) undercovered++;
      }
      day.setDate(day.getDate() + 1);
    }
  }

  const rotation = doctors.filter((doc) => !doc.isExcludedFromAutomaticAssignment).map((doc) => stats.get(doc.id)!);
  const monthKeys = new Set<string>();
  rotation.forEach((s) => Object.keys(s.monthlyWorkdays).forEach((k) => monthKeys.add(k)));
  let monthSpread = 0;
  let weekendSpread = 0;
  let overLimit = 0;
  for (const monthKey of monthKeys) {
    monthSpread += spread(rotation.map((s) => s.monthlyWorkdays[monthKey] || 0));
    weekendSpread += spread(rotation.map((s) => s.weekendDaysByMonth[monthKey] || 0));
    if (monthlyLimit !== undefined && monthlyLimit > 0) {
      overLimit += rotation.filter((s) => (s.monthlyWorkdays[monthKey] || 0) > monthlyLimit).length;
    }
  }
  const daySpread = DAY_KEYS.reduce((sum, key) => sum + spread(rotation.map((s) => s.workloadByDayOfWeek[key])), 0);

  const cost =
    uncoveredDates.length * 10_000 +
    undercovered * 500 +
    overLimit * 200 +
    spread(rotation.map((s) => s.totalWorkdays)) * 10 +
    weekendSpread * 6 +
    monthSpread * 3 +
    daySpread;

  return { entries, uncoveredDates, cost };
}

export function generateSchedule(
  data: ScheduleFormValues,
  existingFixedEntries?: ScheduleEntry[],
  options: GenerateOptions = {},
): GenerateResult {
  try {
    const { doctors: doctorInputs, startDate, endDate, globalMonthlyShiftLimit } = data;
    const minIntervalBetweenWorkDays = data.minIntervalBetweenWorkDays ?? 1;
    // Units are optional in the form (fileVersion 1 files don't have them). Default to [].
    const units: Unit[] = (data.units ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      minPostCallCoverage: u.minPostCallCoverage,
      alliedUnitIds: u.alliedUnitIds ?? [],
    }));

    const doctors: DoctorFormFieldInput[] = doctorInputs.map((doc, index) => ({
      ...doc,
      id: doc.id || `doc-${index + 1}`,
      freeDates: ensureDateArray(doc.freeDates),
      preAssignedWorkDates: ensureDateArray(doc.preAssignedWorkDates),
      excludedDates: ensureDateArray(doc.excludedDates),
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
      unitId: doc.unitId || undefined,
      coverAssignments: ensureCoverAssignments(doc.coverAssignments),
    }));

    const holidays: Date[] = (data.holidays ?? []).map((d) => (d instanceof Date ? d : new Date(d)));
    const finalEndDate = new Date(endDate);

    const ctx: Context = {
      doctors,
      units,
      trackedUnits: units.filter((u) => u.minPostCallCoverage > 0),
      alliedIdsByUnit: new Map(units.map((u) => [u.id, getAlliedUnitIds(u.id, units)])),
      holidays,
      startDate,
      endDate: finalEndDate,
      minInterval: minIntervalBetweenWorkDays,
      monthlyLimit: globalMonthlyShiftLimit,
      enforceMonthlyLimit: data.enforceMonthlyLimit ?? false,
      fixedEntries: (existingFixedEntries ?? []).filter((e) => e.isFixed),
    };

    const baseSeed = options.seed ?? randomSeed();
    const attempts = Math.max(1, Math.floor(options.attempts ?? 1));
    let best: Attempt | null = null;
    let bestSeed = baseSeed;
    for (let i = 0; i < attempts; i++) {
      const seed = deriveSeed(baseSeed, i);
      const attempt = runAttempt(ctx, createRng(seed));
      if (!best || attempt.cost < best.cost) {
        best = attempt;
        bestSeed = seed;
      }
      if (best.cost === 0) break;
    }
    const { entries, uncoveredDates } = best!;

    const warnings: ScheduleWarning[] = [];

    const preAssignedByDate = new Map<string, { doctors: string[]; date: Date }>();
    for (const doctor of doctors) {
      for (const date of doctor.preAssignedWorkDates) {
        const key = toDateKey(date);
        const bucket = preAssignedByDate.get(key) ?? { doctors: [], date };
        bucket.doctors.push(doctor.name);
        preAssignedByDate.set(key, bucket);
      }
    }
    preAssignedByDate.forEach((value) => {
      if (value.doctors.length > 1) {
        warnings.push({
          key: 'warnings.multiplePreAssignedInput',
          params: { date: value.date, doctors: value.doctors.join(', ') },
        });
      }
    });

    uncoveredDates
      .sort((a, b) => a.getTime() - b.getTime())
      .forEach((date) => warnings.push({ key: 'warnings.uncoveredDay', params: { date: new Date(date) } }));

    warnings.push(
      ...analyzeBrokenConstraints(entries, doctors, minIntervalBetweenWorkDays, globalMonthlyShiftLimit, startDate, finalEndDate),
    );
    warnings.push(...analyzeUnitCoverage(entries, doctors, units, startDate, finalEndDate, holidays));

    return {
      schedule: {
        entries,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        minIntervalBetweenWorkDays,
        globalMonthlyShiftLimit,
        seed: bestSeed,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      seed: bestSeed,
    };
  } catch (e) {
    console.error('Error generating schedule:', e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred while generating the schedule.';
    return { error: errorMessage };
  }
}
