import {
  describe,
  it,
  expect,
} from 'bun:test';
import {
  serializeScheduleFormValues,
  deserializeScheduleFormValues,
  serializeSchedule,
  deserializeSchedule,
  buildAppFileData,
  deserializeAppFileData,
  toLocalDate,
  parseAppFileJson,
  isEmptyAppFileData,
  makeEmptyAppFileData,
} from '../lib/schedule-storage';
import type {
  ScheduleFormValues,
  Schedule,
  Unit,
  AppFileData,
} from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeFormValues = (): ScheduleFormValues =>
  ({
    numberOfDoctors: 2,
    startDate: new Date('2024-01-01T00:00:00.000Z'),
    endDate: new Date('2024-01-31T00:00:00.000Z'),
    minIntervalBetweenWorkDays: 1,
    doctors: [
      {
        id: 'doc1',
        name: 'Dr. Smith',
        freeDates: [new Date('2024-01-15T00:00:00.000Z')],
        preAssignedWorkDates: [new Date('2024-01-10T00:00:00.000Z')],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
      },
    ],
  }) as unknown as ScheduleFormValues;

const makeSchedule = (): Schedule => ({
  startDate: new Date('2024-01-01T00:00:00.000Z'),
  endDate: new Date('2024-01-31T00:00:00.000Z'),
  entries: [
    {
      date: new Date('2024-01-01T00:00:00.000Z'),
      doctorId: 'doc1',
      assignment: 'Work',
      dayOfWeek: 'Monday',
    },
    {
      date: new Date('2024-01-02T00:00:00.000Z'),
      doctorId: 'doc2',
      assignment: 'Free',
      dayOfWeek: 'Tuesday',
      isFixed: true,
    },
  ],
  minIntervalBetweenWorkDays: 1,
  globalMonthlyShiftLimit: 10,
});

// ---------------------------------------------------------------------------
// Serialization: serializeScheduleFormValues / deserializeScheduleFormValues
// ---------------------------------------------------------------------------

describe('serializeScheduleFormValues', () => {
  it('converts startDate Date to ISO string', () => {
    const values = makeFormValues();
    const serialized = serializeScheduleFormValues(values);
    expect(typeof serialized.startDate).toBe('string');
    expect(serialized.startDate).toBe('2024-01-01T00:00:00.000Z');
  });

  it('converts endDate Date to ISO string', () => {
    const values = makeFormValues();
    const serialized = serializeScheduleFormValues(values);
    expect(typeof serialized.endDate).toBe('string');
    expect(serialized.endDate).toBe('2024-01-31T00:00:00.000Z');
  });

  it('converts doctor freeDates to ISO strings', () => {
    const values = makeFormValues();
    const serialized = serializeScheduleFormValues(values);
    expect(serialized.doctors[0].freeDates.every((d) => typeof d === 'string')).toBe(true);
    expect(serialized.doctors[0].freeDates[0]).toBe('2024-01-15T00:00:00.000Z');
  });

  it('converts doctor preAssignedWorkDates to ISO strings', () => {
    const values = makeFormValues();
    const serialized = serializeScheduleFormValues(values);
    expect(serialized.doctors[0].preAssignedWorkDates.every((d) => typeof d === 'string')).toBe(true);
  });

  it('converts doctor excludedDates to ISO strings (empty array)', () => {
    const values = makeFormValues();
    const serialized = serializeScheduleFormValues(values);
    expect(serialized.doctors[0].excludedDates).toEqual([]);
  });

  it('preserves non-date scalar fields', () => {
    const values = makeFormValues();
    const serialized = serializeScheduleFormValues(values);
    expect(serialized.numberOfDoctors).toBe(2);
    expect(serialized.minIntervalBetweenWorkDays).toBe(1);
    expect(serialized.doctors[0].id).toBe('doc1');
    expect(serialized.doctors[0].name).toBe('Dr. Smith');
    expect(serialized.doctors[0].isExcludedFromAutomaticAssignment).toBe(false);
  });

  it('handles already-serialized string dates without throwing', () => {
    const values = {
      ...makeFormValues(),
      startDate: '2024-01-01T00:00:00.000Z' as unknown as Date,
    };
    const serialized = serializeScheduleFormValues(values);
    expect(serialized.startDate).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('deserializeScheduleFormValues', () => {
  it('converts startDate string to Date', () => {
    const serialized = serializeScheduleFormValues(makeFormValues());
    const deserialized = deserializeScheduleFormValues(serialized);
    expect(deserialized.startDate).toBeInstanceOf(Date);
    expect(deserialized.startDate.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('converts endDate string to Date', () => {
    const serialized = serializeScheduleFormValues(makeFormValues());
    const deserialized = deserializeScheduleFormValues(serialized);
    expect(deserialized.endDate).toBeInstanceOf(Date);
  });

  it('converts doctor date strings to Date objects', () => {
    const serialized = serializeScheduleFormValues(makeFormValues());
    const deserialized = deserializeScheduleFormValues(serialized);
    const doc = deserialized.doctors[0];
    expect(doc.freeDates.every((d) => d instanceof Date)).toBe(true);
    expect(doc.preAssignedWorkDates.every((d) => d instanceof Date)).toBe(true);
    expect(doc.excludedDates.every((d) => d instanceof Date)).toBe(true);
  });

  it('round-trips startDate correctly', () => {
    const original = makeFormValues();
    const roundTripped = deserializeScheduleFormValues(serializeScheduleFormValues(original));
    expect(roundTripped.startDate.getTime()).toBe(original.startDate.getTime());
  });

  it('round-trips doctor vacation dates correctly', () => {
    const original = makeFormValues();
    const roundTripped = deserializeScheduleFormValues(serializeScheduleFormValues(original));
    expect(roundTripped.doctors[0].freeDates[0].getTime()).toBe(
      original.doctors[0].freeDates[0].getTime(),
    );
  });

  it('round-trips non-date fields correctly', () => {
    const original = makeFormValues();
    const roundTripped = deserializeScheduleFormValues(serializeScheduleFormValues(original));
    expect(roundTripped.numberOfDoctors).toBe(2);
    expect(roundTripped.doctors[0].name).toBe('Dr. Smith');
  });
});

// ---------------------------------------------------------------------------
// Serialization: serializeSchedule / deserializeSchedule
// ---------------------------------------------------------------------------

describe('serializeSchedule', () => {
  it('converts startDate to ISO string', () => {
    const schedule = makeSchedule();
    const serialized = serializeSchedule(schedule);
    expect(typeof serialized.startDate).toBe('string');
    expect(serialized.startDate).toBe('2024-01-01T00:00:00.000Z');
  });

  it('converts endDate to ISO string', () => {
    const schedule = makeSchedule();
    const serialized = serializeSchedule(schedule);
    expect(typeof serialized.endDate).toBe('string');
  });

  it('converts all entry dates to ISO strings', () => {
    const schedule = makeSchedule();
    const serialized = serializeSchedule(schedule);
    expect(serialized.entries.every((e) => typeof e.date === 'string')).toBe(true);
  });

  it('preserves entry assignment and doctorId fields', () => {
    const schedule = makeSchedule();
    const serialized = serializeSchedule(schedule);
    expect(serialized.entries[0].assignment).toBe('Work');
    expect(serialized.entries[0].doctorId).toBe('doc1');
    expect(serialized.entries[1].assignment).toBe('Free');
  });

  it('preserves isFixed flag on entries', () => {
    const schedule = makeSchedule();
    const serialized = serializeSchedule(schedule);
    expect(serialized.entries[1].isFixed).toBe(true);
  });

  it('preserves minIntervalBetweenWorkDays', () => {
    const schedule = makeSchedule();
    const serialized = serializeSchedule(schedule);
    expect(serialized.minIntervalBetweenWorkDays).toBe(1);
  });

  it('preserves globalMonthlyShiftLimit', () => {
    const schedule = makeSchedule();
    const serialized = serializeSchedule(schedule);
    expect(serialized.globalMonthlyShiftLimit).toBe(10);
  });
});

describe('deserializeSchedule', () => {
  it('converts startDate to Date', () => {
    const serialized = serializeSchedule(makeSchedule());
    const deserialized = deserializeSchedule(serialized);
    expect(deserialized.startDate).toBeInstanceOf(Date);
  });

  it('converts all entry dates to Date objects', () => {
    const serialized = serializeSchedule(makeSchedule());
    const deserialized = deserializeSchedule(serialized);
    expect(deserialized.entries.every((e) => e.date instanceof Date)).toBe(true);
  });

  it('round-trips startDate correctly', () => {
    const original = makeSchedule();
    const roundTripped = deserializeSchedule(serializeSchedule(original));
    expect(roundTripped.startDate.getTime()).toBe(original.startDate.getTime());
  });

  it('round-trips entry dates correctly', () => {
    const original = makeSchedule();
    const roundTripped = deserializeSchedule(serializeSchedule(original));
    expect(roundTripped.entries[0].date.getTime()).toBe(original.entries[0].date.getTime());
  });

  it('round-trips isFixed flag correctly', () => {
    const original = makeSchedule();
    const roundTripped = deserializeSchedule(serializeSchedule(original));
    expect(roundTripped.entries[1].isFixed).toBe(true);
  });

  it('round-trips schedule metadata correctly', () => {
    const original = makeSchedule();
    const roundTripped = deserializeSchedule(serializeSchedule(original));
    expect(roundTripped.minIntervalBetweenWorkDays).toBe(1);
    expect(roundTripped.globalMonthlyShiftLimit).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Units and fileVersion 2 migration
// ---------------------------------------------------------------------------

describe('serializeScheduleFormValues with units', () => {
  it('preserves the units array', () => {
    const values = {
      ...makeFormValues(),
      units: [
        { id: 'u1', name: 'Planta A', minPostCallCoverage: 1 },
        { id: 'u2', name: 'Consulta', minPostCallCoverage: 0 },
      ],
    } as unknown as ScheduleFormValues;
    const serialized = serializeScheduleFormValues(values);
    expect(serialized.units).toHaveLength(2);
    expect(serialized.units![0]).toEqual({ id: 'u1', name: 'Planta A', minPostCallCoverage: 1, alliedUnitIds: [] });
    expect(serialized.units![1]).toEqual({ id: 'u2', name: 'Consulta', minPostCallCoverage: 0, alliedUnitIds: [] });
  });

  it('preserves the unitId on each doctor', () => {
    const values = {
      ...makeFormValues(),
      units: [{ id: 'u1', name: 'Planta A', minPostCallCoverage: 1 }],
      doctors: [
        {
          id: 'doc1',
          name: 'Dr. Smith',
          freeDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
          unitId: 'u1',
        },
      ],
    } as unknown as ScheduleFormValues;
    const serialized = serializeScheduleFormValues(values);
    expect(serialized.doctors[0].unitId).toBe('u1');
  });
});

describe('deserializeScheduleFormValues with units', () => {
  it('round-trips units correctly', () => {
    const values = {
      ...makeFormValues(),
      units: [{ id: 'u1', name: 'Planta A', minPostCallCoverage: 1 }],
    } as unknown as ScheduleFormValues;
    const roundTripped = deserializeScheduleFormValues(serializeScheduleFormValues(values));
    expect(roundTripped.units).toHaveLength(1);
    expect((roundTripped.units as { id: string }[])[0].id).toBe('u1');
  });

  it('defaults units to empty array when missing (fileVersion 1 migration)', () => {
    const serialized = {
      ...serializeScheduleFormValues(makeFormValues()),
      units: undefined,
    } as unknown as Parameters<typeof deserializeScheduleFormValues>[0];
    const deserialized = deserializeScheduleFormValues(serialized);
    expect(deserialized.units).toEqual([]);
  });

  it('round-trips alliedUnitIds and coverAssignments', () => {
    const values = {
      ...makeFormValues(),
      units: [
        { id: 'u1', name: 'Planta A', minPostCallCoverage: 1, alliedUnitIds: ['u2'] },
        { id: 'u2', name: 'Planta B', minPostCallCoverage: 1, alliedUnitIds: ['u1'] },
      ],
      doctors: [
        {
          id: 'doc1',
          name: 'Dr. Smith',
          freeDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
          unitId: 'u1',
          coverAssignments: [
            {
              id: 'c1',
              targetUnitId: 'u2',
              startDate: new Date('2024-01-08T00:00:00.000Z'),
              endDate: new Date('2024-01-12T00:00:00.000Z'),
            },
          ],
        },
      ],
    } as unknown as ScheduleFormValues;
    const roundTripped = deserializeScheduleFormValues(serializeScheduleFormValues(values));
    expect((roundTripped.units as Unit[])[0].alliedUnitIds).toEqual(['u2']);
    expect(roundTripped.doctors[0].coverAssignments).toHaveLength(1);
    expect(roundTripped.doctors[0].coverAssignments![0].targetUnitId).toBe('u2');
    expect(roundTripped.doctors[0].coverAssignments![0].startDate).toBeInstanceOf(Date);
  });

  it('defaults alliedUnitIds and coverAssignments when missing (fileVersion 2 migration)', () => {
    const serialized = {
      ...serializeScheduleFormValues(makeFormValues()),
      units: [{ id: 'u1', name: 'Planta A', minPostCallCoverage: 1 }],
    } as unknown as Parameters<typeof deserializeScheduleFormValues>[0];
    const deserialized = deserializeScheduleFormValues(serialized);
    expect((deserialized.units as Unit[])[0].alliedUnitIds).toEqual([]);
    expect(deserialized.doctors[0].coverAssignments).toEqual([]);
  });

  it('defaults each doctor unitId to empty string when missing', () => {
    // Build a serialized form values object where each doctor omits unitId
    // (fileVersion 1 legacy).
    const legacySerialized = {
      numberOfDoctors: 1,
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-01-31T00:00:00.000Z',
      doctors: [
        {
          id: 'doc1',
          name: 'Dr. Smith',
          freeDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
        },
      ],
    } as unknown as Parameters<typeof deserializeScheduleFormValues>[0];
    const deserialized = deserializeScheduleFormValues(legacySerialized);
    expect(deserialized.doctors[0].unitId).toBe('');
  });
});

describe('toLocalDate', () => {
  it('parses date-only strings as local midnight', () => {
    const d = toLocalDate('2024-01-15');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  it('parses ISO datetimes via Date', () => {
    const d = toLocalDate('2024-01-15T00:00:00.000Z');
    expect(d.toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });
});

describe('buildAppFileData / deserializeAppFileData', () => {
  it('round-trips a schedule with doctors and form values', () => {
    const schedule = makeSchedule();
    const formValues = makeFormValues();
    const profiles = [
      {
        id: 'doc1',
        name: 'Dr. Smith',
        freeDates: [new Date('2024-01-15T00:00:00.000Z')],
        preAssignedWorkDates: [new Date('2024-01-10T00:00:00.000Z')],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
      },
    ];
    const built = buildAppFileData(schedule, profiles, formValues, ['warn'], 2, []);
    expect(built.fileVersion).toBe(3);
    expect(built.currentMinInterval).toBe(2);
    expect(built.scheduleWarnings).toEqual(['warn']);
    expect(typeof built.schedule.startDate).toBe('string');

    const restored = deserializeAppFileData(built);
    expect(restored.schedule?.entries).toHaveLength(2);
    expect(restored.schedule?.entries[0].date).toBeInstanceOf(Date);
    expect(restored.doctorsProfiles).toHaveLength(1);
    expect(restored.formValues?.doctors?.[0].name).toBe('Dr. Smith');
    expect(restored.currentMinInterval).toBe(2);
    expect(restored.scheduleWarnings).toEqual(['warn']);
  });

  it('clears schedule serialization when there are no doctors', () => {
    const built = buildAppFileData(makeSchedule(), [], { numberOfDoctors: 0, doctors: [] } as Partial<ScheduleFormValues>, [], 1, []);
    expect(built.schedule.entries).toEqual([]);
  });
});

describe('parseAppFileJson', () => {
  it('migrates vacationDates and Vacation assignment', () => {
    const raw = JSON.stringify({
      fileVersion: 1,
      doctorsProfiles: [{ id: 'd1', name: 'Ada', vacationDates: ['2024-01-02'] }],
      formValues: { doctors: [{ id: 'd1', name: 'Ada', vacationDates: ['2024-01-02'] }] },
      schedule: { entries: [{ date: '2024-01-02', doctorId: 'd1', assignment: 'Vacation' }] },
    });
    const parsed = parseAppFileJson(raw);
    expect((parsed.doctorsProfiles[0] as { freeDates: string[] }).freeDates).toEqual(['2024-01-02']);
    expect((parsed.formValues.doctors[0] as { freeDates: string[] }).freeDates).toEqual(['2024-01-02']);
    expect(parsed.schedule.entries[0].assignment).toBe('Free');
  });
});

describe('isEmptyAppFileData', () => {
  it('treats makeEmptyAppFileData as empty', () => {
    expect(isEmptyAppFileData(makeEmptyAppFileData())).toBe(true);
  });

  it('is not empty when a named doctor exists', () => {
    const data = makeEmptyAppFileData();
    data.formValues.doctors = [{ id: 'd1', name: 'Ada' } as AppFileData['formValues']['doctors'][number]];
    data.formValues.numberOfDoctors = 1;
    expect(isEmptyAppFileData(data)).toBe(false);
  });
});
