import { describe, it, expect } from 'bun:test';
import {
  RotawiseFileError,
  buildAppFileData,
  deserializeAppFileData,
  emptyFormValues,
  isEmptyAppFileData,
  makeEmptyAppFileData,
  parseAppFileJson,
  toLocalDate,
} from '../lib/schedule-storage';
import { CURRENT_FILE_VERSION } from '../lib/types';
import type { AppFileData, Schedule, ScheduleFormValues } from '../lib/types';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const makeFormValues = (): ScheduleFormValues =>
  ({
    numberOfDoctors: 2,
    startDate: day(2024, 1, 1),
    endDate: day(2024, 1, 31),
    minIntervalBetweenWorkDays: 0,
    globalMonthlyShiftLimit: 6,
    enforceMonthlyLimit: true,
    doctors: [
      {
        id: 'doc1',
        name: 'Dr. Smith',
        freeDates: [day(2024, 1, 15)],
        preAssignedWorkDates: [day(2024, 1, 10)],
        excludedDates: [day(2024, 1, 20)],
        isExcludedFromAutomaticAssignment: false,
        unitId: 'u1',
        coverAssignments: [{ id: 'c1', targetUnitId: 'u2', startDate: day(2024, 1, 8), endDate: day(2024, 1, 12) }],
      },
      {
        id: 'doc2',
        name: 'Dr. Jones',
        freeDates: [],
        preAssignedWorkDates: [],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: true,
        unitId: '',
        coverAssignments: [],
      },
    ],
    units: [
      { id: 'u1', name: 'Ward A', minPostCallCoverage: 1, alliedUnitIds: ['u2'] },
      { id: 'u2', name: 'Ward B', minPostCallCoverage: 0, alliedUnitIds: ['u1'] },
    ],
    holidays: [day(2024, 1, 6)],
  }) as ScheduleFormValues;

const makeSchedule = (): Schedule => ({
  startDate: day(2024, 1, 1),
  endDate: day(2024, 1, 31),
  minIntervalBetweenWorkDays: 0,
  globalMonthlyShiftLimit: 6,
  seed: 1234,
  entries: [
    { date: day(2024, 1, 10), doctorId: 'doc1', assignment: 'Pre-assigned', dayOfWeek: 'Wednesday', isFixed: true },
    { date: day(2024, 1, 11), doctorId: 'doc2', assignment: 'Work', dayOfWeek: 'Thursday' },
    { date: day(2024, 1, 15), doctorId: 'doc1', assignment: 'Free', dayOfWeek: 'Monday' },
  ],
});

const build = (overrides: Partial<Parameters<typeof buildAppFileData>[0]> = {}) =>
  buildAppFileData({ schedule: makeSchedule(), formValues: makeFormValues(), currentMinInterval: 0, ...overrides });

describe('buildAppFileData', () => {
  it('writes the current file version and date-only strings', () => {
    const data = build();
    expect(data.fileVersion).toBe(CURRENT_FILE_VERSION);
    expect(data.fileVersion).toBe(4);
    expect(data.schedule.startDate).toBe('2024-01-01');
    expect(data.schedule.endDate).toBe('2024-01-31');
    expect(data.schedule.entries.map((e) => e.date)).toEqual(['2024-01-10', '2024-01-11', '2024-01-15']);
    expect(data.formValues.startDate).toBe('2024-01-01');
    expect(data.formValues.holidays).toEqual(['2024-01-06']);
    expect(data.formValues.doctors[0].freeDates).toEqual(['2024-01-15']);
    expect(data.formValues.doctors[0].coverAssignments).toEqual([
      { id: 'c1', targetUnitId: 'u2', startDate: '2024-01-08', endDate: '2024-01-12' },
    ]);
  });

  it('never writes time-of-day or timezone information', () => {
    expect(JSON.stringify(build())).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps a zero interval instead of turning it into 1', () => {
    const data = build();
    expect(data.currentMinInterval).toBe(0);
    expect(data.formValues.minIntervalBetweenWorkDays).toBe(0);
    expect(data.schedule.minIntervalBetweenWorkDays).toBe(0);
  });

  it('mirrors the form doctors into doctorsProfiles', () => {
    const data = build();
    expect(data.doctorsProfiles.map((d) => d.id)).toEqual(['doc1', 'doc2']);
    expect(data.doctorsProfiles[0].freeDates).toEqual(data.formValues.doctors[0].freeDates);
  });

  it('omits the period when it has not been chosen', () => {
    const data = buildAppFileData({ schedule: null, formValues: emptyFormValues(), currentMinInterval: 1 });
    expect(data.formValues.startDate).toBeUndefined();
    expect(data.formValues.endDate).toBeUndefined();
    expect(data.schedule).toEqual({ entries: [] });
    // Must survive a real JSON round trip (no `""` or `null` dates).
    expect(() => parseAppFileJson(JSON.stringify(data))).not.toThrow();
  });

  it('drops the schedule when the roster is empty', () => {
    const data = build({ formValues: { ...makeFormValues(), doctors: [] } });
    expect(data.schedule.entries).toEqual([]);
    expect(data.doctorsProfiles).toEqual([]);
  });

  it('does not persist warnings (they are recomputed on load)', () => {
    expect('scheduleWarnings' in build()).toBe(false);
  });
});

describe('round trip', () => {
  it('restores the same calendar days, schedule and settings', () => {
    const restored = deserializeAppFileData(parseAppFileJson(JSON.stringify(build())));

    expect(restored.currentMinInterval).toBe(0);
    expect(restored.formValues.minIntervalBetweenWorkDays).toBe(0);
    expect(restored.formValues.enforceMonthlyLimit).toBe(true);
    expect(restored.formValues.globalMonthlyShiftLimit).toBe(6);
    expect(restored.formValues.startDate).toEqual(day(2024, 1, 1));
    expect(restored.formValues.endDate).toEqual(day(2024, 1, 31));
    expect(restored.formValues.holidays).toEqual([day(2024, 1, 6)]);
    expect(restored.formValues.units).toEqual(makeFormValues().units);

    const [smith, jones] = restored.formValues.doctors!;
    expect(smith.freeDates).toEqual([day(2024, 1, 15)]);
    expect(smith.preAssignedWorkDates).toEqual([day(2024, 1, 10)]);
    expect(smith.excludedDates).toEqual([day(2024, 1, 20)]);
    expect(smith.coverAssignments).toEqual(makeFormValues().doctors[0].coverAssignments);
    expect(jones.isExcludedFromAutomaticAssignment).toBe(true);
    expect(jones.unitId).toBe('');

    expect(restored.schedule).not.toBeNull();
    expect(restored.schedule!.seed).toBe(1234);
    expect<unknown>(restored.schedule!.entries.map((e) => [e.date, e.doctorId, e.assignment, e.isFixed ?? false])).toEqual([
      [day(2024, 1, 10), 'doc1', 'Pre-assigned', true],
      [day(2024, 1, 11), 'doc2', 'Work', false],
      [day(2024, 1, 15), 'doc1', 'Free', false],
    ]);
  });

  it('returns no schedule and an empty roster for an empty document', () => {
    const restored = deserializeAppFileData(makeEmptyAppFileData());
    expect(restored.schedule).toBeNull();
    expect(restored.formValues.doctors).toEqual([]);
    expect(restored.formValues.startDate).toBeUndefined();
    expect(restored.currentMinInterval).toBe(1);
  });
});

describe('toLocalDate', () => {
  it('reads a date-only string as local midnight of that day', () => {
    expect(toLocalDate('2024-03-10')).toEqual(day(2024, 3, 10));
  });

  it('keeps the calendar day of legacy ISO datetimes, wherever they were written', () => {
    // Local midnight of 16 Jan written from UTC, UTC+1, UTC+2, UTC-5 and UTC-8.
    for (const iso of [
      '2024-01-16T00:00:00.000Z',
      '2024-01-15T23:00:00.000Z',
      '2024-01-15T22:00:00.000Z',
      '2024-01-16T05:00:00.000Z',
      '2024-01-16T08:00:00.000Z',
    ]) {
      expect(toLocalDate(iso)).toEqual(day(2024, 1, 16));
    }
  });
});

describe('parseAppFileJson', () => {
  const expectCode = (text: string, code: RotawiseFileError['code']) => {
    try {
      parseAppFileJson(text);
    } catch (err) {
      expect(err).toBeInstanceOf(RotawiseFileError);
      expect((err as RotawiseFileError).code).toBe(code);
      return;
    }
    throw new Error(`expected ${code}`);
  };

  it('rejects text that is not JSON', () => expectCode('{nope', 'invalidJson'));

  it('rejects JSON that is not a Rotawise document', () => {
    expectCode('{}', 'notRotawiseFile');
    expectCode('[]', 'notRotawiseFile');
    expectCode('"text"', 'notRotawiseFile');
    expectCode('{"name":"package"}', 'notRotawiseFile');
  });

  it('rejects files written by a newer version', () => {
    expectCode(JSON.stringify({ ...build(), fileVersion: CURRENT_FILE_VERSION + 1 }), 'newerVersion');
  });

  it('rejects malformed data', () => {
    const data = build() as unknown as { schedule: { entries: { date: string }[] } };
    data.schedule.entries[0].date = 'not-a-date';
    expectCode(JSON.stringify(data), 'invalidData');
    expectCode(JSON.stringify({ formValues: { doctors: 'none' } }), 'invalidData');
    expectCode(JSON.stringify({ formValues: { units: [{ id: 'u', name: 'x', minPostCallCoverage: 'many' }] } }), 'invalidData');
  });

  it('reads version 1–3 files (ISO datetimes, vacationDates, Vacation entries)', () => {
    const legacy = {
      fileVersion: 2,
      versions: [],
      schedule: {
        startDate: '2023-12-31T23:00:00.000Z',
        endDate: '2024-01-30T23:00:00.000Z',
        entries: [
          { date: '2024-01-09T23:00:00.000Z', doctorId: 'd1', assignment: 'Work', dayOfWeek: 'Wednesday' },
          { date: '2024-01-14T23:00:00.000Z', doctorId: 'd1', assignment: 'Vacation', dayOfWeek: 'Monday' },
        ],
      },
      doctorsProfiles: [],
      formValues: {
        numberOfDoctors: 1,
        startDate: '2023-12-31T23:00:00.000Z',
        endDate: '2024-01-30T23:00:00.000Z',
        doctors: [
          { id: 'd1', name: 'Dr. Old', vacationDates: ['2024-01-14T23:00:00.000Z'], preAssignedWorkDates: [], excludedDates: [] },
        ],
      },
      scheduleWarnings: ['stale warning'],
    };
    const restored = deserializeAppFileData(parseAppFileJson(JSON.stringify(legacy)));

    expect(restored.schedule!.startDate).toEqual(day(2024, 1, 1));
    expect(restored.schedule!.endDate).toEqual(day(2024, 1, 31));
    expect(restored.schedule!.entries[0].date).toEqual(day(2024, 1, 10));
    expect(restored.schedule!.entries[1].assignment).toBe('Free');
    expect(restored.formValues.doctors![0].freeDates).toEqual([day(2024, 1, 15)]);
    expect(restored.formValues.units).toEqual([]);
    expect(restored.formValues.holidays).toEqual([]);
    expect(restored.currentMinInterval).toBe(1);
  });

  it('falls back to doctorsProfiles when the form has no doctors', () => {
    const data = {
      fileVersion: 1,
      schedule: { entries: [] },
      doctorsProfiles: [{ id: 'd1', name: 'Dr. Profile', freeDates: [], preAssignedWorkDates: [], excludedDates: [] }],
      formValues: { numberOfDoctors: 0, doctors: [] },
    };
    const restored = deserializeAppFileData(parseAppFileJson(JSON.stringify(data)));
    expect(restored.formValues.doctors!.map((d) => d.name)).toEqual(['Dr. Profile']);
  });

  it('fills in missing optional sections', () => {
    const parsed = parseAppFileJson(JSON.stringify({ formValues: { doctors: [] } }));
    expect(parsed.fileVersion).toBe(CURRENT_FILE_VERSION);
    expect(parsed.versions).toEqual([]);
    expect(parsed.schedule.entries).toEqual([]);
    expect(parsed.doctorsProfiles).toEqual([]);
  });
});

describe('isEmptyAppFileData', () => {
  it('is true for a new document and for nothing at all', () => {
    expect(isEmptyAppFileData(makeEmptyAppFileData())).toBe(true);
    expect(isEmptyAppFileData(null)).toBe(true);
    expect(isEmptyAppFileData(undefined)).toBe(true);
  });

  it('is false once there is a doctor, a unit or a schedule', () => {
    expect(isEmptyAppFileData(build())).toBe(false);
    const onlyUnit: AppFileData = buildAppFileData({
      schedule: null,
      formValues: { ...emptyFormValues(), units: [{ id: 'u', name: 'U', minPostCallCoverage: 0, alliedUnitIds: [] }] },
      currentMinInterval: 1,
    });
    expect(isEmptyAppFileData(onlyUnit)).toBe(false);
    const blankDoctor = buildAppFileData({
      schedule: null,
      formValues: { ...emptyFormValues(), doctors: [{ ...makeFormValues().doctors[1], name: '' }] },
      currentMinInterval: 1,
    });
    expect(isEmptyAppFileData(blankDoctor)).toBe(false);
  });
});
