import { describe, it, expect } from 'bun:test';
import { addDays, differenceInCalendarDays, eachDayOfInterval, format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { parseDateValue, toDateKey, isValidDate } from '../lib/dates';
import { createRng, deriveSeed, randomSeed } from '../lib/random';
import { getAssignmentBlockReason } from '../lib/schedule-eligibility';
import { generateSchedule } from '../lib/schedule-generator';
import { analyzeBrokenConstraints } from '../lib/schedule-analyze';
import { computeScheduleWarnings } from '../lib/schedule-warnings';
import type { DoctorProfile, Schedule, ScheduleEntry, ScheduleFormValues } from '../lib/types';
import en from '../locales/en.json';
import es from '../locales/es.json';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const doctor = (id: string, extra: Partial<DoctorProfile> = {}): DoctorProfile => ({
  id,
  name: `Dr. ${id}`,
  freeDates: [],
  preAssignedWorkDates: [],
  excludedDates: [],
  isExcludedFromAutomaticAssignment: false,
  ...extra,
});

const formValues = (count: number, overrides: Partial<ScheduleFormValues> = {}): ScheduleFormValues =>
  ({
    numberOfDoctors: count,
    startDate: day(2024, 1, 1),
    endDate: day(2024, 3, 31),
    minIntervalBetweenWorkDays: 1,
    doctors: Array.from({ length: count }, (_, i) => doctor(`d${i + 1}`)),
    units: [],
    holidays: [],
    ...overrides,
  }) as ScheduleFormValues;

const shifts = (entries: ScheduleEntry[]) =>
  entries.filter((e) => e.assignment === 'Work' || e.assignment === 'Pre-assigned');

const fingerprint = (entries: ScheduleEntry[]) =>
  shifts(entries)
    .map((e) => `${toDateKey(e.date)}:${e.doctorId}`)
    .join('|');

describe('dates', () => {
  it('toDateKey uses the local calendar day', () => {
    expect(toDateKey(new Date(2024, 0, 5, 23, 59))).toBe('2024-01-05');
    expect(toDateKey(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('parseDateValue round-trips toDateKey', () => {
    for (const d of eachDayOfInterval({ start: day(2024, 2, 25), end: day(2024, 4, 5) })) {
      expect(parseDateValue(toDateKey(d))).toEqual(d);
    }
  });

  it('reports unparseable values as invalid dates', () => {
    expect(isValidDate(parseDateValue('nope'))).toBe(false);
    expect(isValidDate(parseDateValue('2024-01-05'))).toBe(true);
    expect(isValidDate('2024-01-05')).toBe(false);
  });
});

describe('random', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('gives different streams for different seeds and attempts', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
    expect(deriveSeed(7, 0)).toBe(7);
    expect(new Set([0, 1, 2, 3].map((n) => deriveSeed(7, n))).size).toBe(4);
    const seed = randomSeed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
  });
});

describe('getAssignmentBlockReason', () => {
  const wed = day(2024, 1, 10);
  const none = doctor('x');

  it('allows a doctor with no conflicts', () => {
    expect(getAssignmentBlockReason(none, wed, [day(2024, 1, 3)], 1)).toBeNull();
  });

  it('blocks free and excluded days first', () => {
    expect(getAssignmentBlockReason(doctor('x', { freeDates: [wed] }), wed, [], 1)).toBe('freeDay');
    expect(getAssignmentBlockReason(doctor('x', { excludedDates: [wed] }), wed, [], 1)).toBe('excluded');
  });

  it('blocks the day after a shift and the day before one (post-call), even with interval 0', () => {
    expect(getAssignmentBlockReason(none, wed, [addDays(wed, -1)], 0)).toBe('postCall');
    expect(getAssignmentBlockReason(none, wed, [addDays(wed, 1)], 0)).toBe('postCall');
    expect(getAssignmentBlockReason(none, wed, [addDays(wed, -2)], 0)).toBeNull();
  });

  it('treats Monday as the post-call day of a Saturday shift', () => {
    const saturday = day(2024, 1, 13);
    const monday = day(2024, 1, 15);
    expect(getAssignmentBlockReason(none, monday, [saturday], 0)).toBe('postCall');
    expect(getAssignmentBlockReason(none, saturday, [monday], 0)).toBe('postCall');
  });

  it('applies the configured minimum interval in both directions', () => {
    expect(getAssignmentBlockReason(none, wed, [addDays(wed, -3)], 3)).toBe('interval');
    expect(getAssignmentBlockReason(none, wed, [addDays(wed, 3)], 3)).toBe('interval');
    expect(getAssignmentBlockReason(none, wed, [addDays(wed, -4)], 3)).toBeNull();
  });

  it('ignores shifts on holidays for the interval rule', () => {
    const holidayShift = addDays(wed, -3);
    expect(getAssignmentBlockReason(none, wed, [holidayShift], 3, [holidayShift])).toBeNull();
  });
});

describe('generateSchedule options', () => {
  it('produces the same roster for the same seed', () => {
    const a = generateSchedule(formValues(6), [], { seed: 99, attempts: 4 });
    const b = generateSchedule(formValues(6), [], { seed: 99, attempts: 4 });
    expect(a.schedule!.seed).toBeDefined();
    expect(a.schedule!.seed).toBe(b.schedule!.seed);
    expect(fingerprint(a.schedule!.entries)).toBe(fingerprint(b.schedule!.entries));
  });

  it('produces different rosters for different seeds', () => {
    const a = generateSchedule(formValues(6), [], { seed: 1 });
    const b = generateSchedule(formValues(6), [], { seed: 2 });
    expect(fingerprint(a.schedule!.entries)).not.toBe(fingerprint(b.schedule!.entries));
  });

  it('keeps total workload within one shift when nothing constrains the roster', () => {
    for (const seed of [1, 2, 3]) {
      const { schedule } = generateSchedule(formValues(7), [], { seed, attempts: 24 });
      const totals = new Map<string, number>();
      for (const e of shifts(schedule!.entries)) totals.set(e.doctorId, (totals.get(e.doctorId) ?? 0) + 1);
      const counts = [...totals.values()];
      expect(counts.length).toBe(7);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('never breaks rest rules, whatever the seed', () => {
    for (const seed of [11, 12, 13, 14]) {
      const data = formValues(5, { minIntervalBetweenWorkDays: 2 });
      const { schedule } = generateSchedule(data, [], { seed, attempts: 6 });
      const byDoctor = new Map<string, Date[]>();
      for (const e of shifts(schedule!.entries)) {
        byDoctor.set(e.doctorId, [...(byDoctor.get(e.doctorId) ?? []), e.date]);
      }
      for (const dates of byDoctor.values()) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(differenceInCalendarDays(dates[i], dates[i - 1])).toBeGreaterThan(2);
        }
      }
    }
  });

  it('covers every day when the roster makes it possible', () => {
    const data = formValues(4, { minIntervalBetweenWorkDays: 2 });
    const { schedule } = generateSchedule(data, [], { seed: 5, attempts: 12 });
    const covered = new Set(shifts(schedule!.entries).map((e) => toDateKey(e.date)));
    expect(covered.size).toBe(differenceInCalendarDays(data.endDate, data.startDate) + 1);
  });

  it('treats the monthly limit as soft by default and strict on request', () => {
    // 2 doctors × 10 shifts cannot cover a 31-day month.
    const base = { endDate: day(2024, 1, 31), minIntervalBetweenWorkDays: 1, globalMonthlyShiftLimit: 10 };
    const count = (entries: ScheduleEntry[]) => {
      const totals = new Map<string, number>();
      for (const e of shifts(entries)) totals.set(e.doctorId, (totals.get(e.doctorId) ?? 0) + 1);
      return totals;
    };

    const soft = generateSchedule(formValues(2, base), [], { seed: 3, attempts: 6 });
    expect(shifts(soft.schedule!.entries).length).toBeGreaterThan(20);

    const strict = generateSchedule(formValues(2, { ...base, enforceMonthlyLimit: true }), [], { seed: 3, attempts: 6 });
    for (const total of count(strict.schedule!.entries).values()) expect(total).toBeLessThanOrEqual(10);
    expect(shifts(strict.schedule!.entries).length).toBeLessThanOrEqual(20);
    expect(strict.schedule!.entries.some((e) => e.assignment === 'Off' && e.doctorId === 'system')).toBe(true);
  });

  it('keeps pinned shifts and does not let pinned non-shift entries block a doctor', () => {
    const pinned: ScheduleEntry[] = [
      { date: day(2024, 1, 10), doctorId: 'd1', assignment: 'Work', dayOfWeek: 'Wednesday', isFixed: true },
    ];
    const { schedule } = generateSchedule(formValues(4), pinned, { seed: 8 });
    const onTheTenth = shifts(schedule!.entries).filter((e) => toDateKey(e.date) === '2024-01-10');
    expect(onTheTenth.map((e) => e.doctorId)).toEqual(['d1']);
    expect(onTheTenth[0].isFixed).toBe(true);
  });

  it('always stores day names in English', () => {
    const { schedule } = generateSchedule(formValues(3), [], { seed: 1 });
    for (const e of schedule!.entries) expect(e.dayOfWeek).toBe(format(e.date, 'EEEE', { locale: enUS }));
  });
});

describe('analysis with a changed roster', () => {
  const schedule: Schedule = {
    startDate: day(2024, 1, 1),
    endDate: day(2024, 1, 4),
    entries: [
      { date: day(2024, 1, 1), doctorId: 'gone', assignment: 'Work', dayOfWeek: 'Monday' },
      { date: day(2024, 1, 2), doctorId: 'a', assignment: 'Work', dayOfWeek: 'Tuesday' },
      { date: day(2024, 1, 3), doctorId: 'gone', assignment: 'Work', dayOfWeek: 'Wednesday' },
      { date: day(2024, 1, 4), doctorId: 'a', assignment: 'Work', dayOfWeek: 'Thursday' },
    ],
  };

  it('does not throw when a shift belongs to a doctor that was removed', () => {
    expect(() => analyzeBrokenConstraints(schedule.entries, [doctor('a')], 1, undefined, schedule.startDate, schedule.endDate, 'en')).not.toThrow();
  });

  it('warns about the orphan shifts', () => {
    const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`;
    const warnings = computeScheduleWarnings(schedule, [doctor('a')], [], 1, 'en', enUS, t);
    expect(warnings.some((w) => w.startsWith('warnings.removedDoctorShifts') && w.includes('"count":2'))).toBe(true);
  });
});

describe('locales', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('have exactly the same keys in English and Spanish', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('only contain flat string values', () => {
    for (const dict of [en, es]) {
      for (const value of Object.values(dict)) expect(typeof value).toBe('string');
    }
  });

  it('use the same placeholders in both languages', () => {
    const esDict = es as Record<string, string>;
    for (const [key, value] of Object.entries(en as Record<string, string>)) {
      expect([key, placeholders(esDict[key])]).toEqual([key, placeholders(value)]);
    }
  });
});
