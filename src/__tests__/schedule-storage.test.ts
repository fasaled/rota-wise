import {
  describe,
  it,
  expect,
  beforeEach,
} from 'bun:test';
import {
  serializeScheduleFormValues,
  deserializeScheduleFormValues,
  serializeSchedule,
  deserializeSchedule,
  createVersionInArray,
  updateVersionInArray,
  deleteVersionFromArray,
  loadScheduleVersions,
  saveScheduleVersion,
  updateScheduleVersion,
  deleteScheduleVersion,
  getScheduleVersion,
} from '../lib/schedule-storage';
import type {
  ScheduleFormValues,
  Schedule,
  ScheduleVersion,
  Unit,
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

const makeVersion = (id: string, overrides: Partial<ScheduleVersion> = {}): ScheduleVersion => ({
  id,
  name: `Version ${id}`,
  description: 'Test version',
  createdAt: '2024-01-01T00:00:00.000Z',
  lastModified: '2024-01-01T00:00:00.000Z',
  parameters: serializeScheduleFormValues(makeFormValues()),
  ...overrides,
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
// Pure array helpers
// ---------------------------------------------------------------------------

describe('createVersionInArray', () => {
  it('prepends the new version to the array', () => {
    const existing = [makeVersion('old')];
    const { versions } = createVersionInArray(existing, 'New', 'desc', makeFormValues());
    expect(versions).toHaveLength(2);
    expect(versions[0].name).toBe('New');
    expect(versions[1].id).toBe('old');
  });

  it('returns the new version id', () => {
    const { id } = createVersionInArray([], 'Name', 'desc', makeFormValues());
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('works on an empty array', () => {
    const { versions } = createVersionInArray([], 'First', '', makeFormValues());
    expect(versions).toHaveLength(1);
  });

  it('serializes the parameters (startDate becomes string)', () => {
    const { versions } = createVersionInArray([], 'v1', '', makeFormValues());
    expect(typeof versions[0].parameters.startDate).toBe('string');
  });

  it('includes schedule when provided', () => {
    const { versions } = createVersionInArray([], 'v1', '', makeFormValues(), makeSchedule());
    expect(versions[0].generatedSchedule).toBeDefined();
    expect(typeof versions[0].generatedSchedule!.startDate).toBe('string');
  });

  it('omits generatedSchedule when not provided', () => {
    const { versions } = createVersionInArray([], 'v1', '', makeFormValues());
    expect(versions[0].generatedSchedule).toBeUndefined();
  });

  it('stores warnings when provided', () => {
    const { versions } = createVersionInArray([], 'v1', '', makeFormValues(), undefined, ['warn1']);
    expect(versions[0].warnings).toEqual(['warn1']);
  });

  it('does not mutate the original array', () => {
    const original = [makeVersion('x')];
    const copy = [...original];
    createVersionInArray(original, 'New', '', makeFormValues());
    expect(original).toHaveLength(copy.length);
  });
});

describe('updateVersionInArray', () => {
  it('updates name of matching version', () => {
    const versions = [makeVersion('a'), makeVersion('b')];
    const updated = updateVersionInArray(versions, 'a', { name: 'Updated A' });
    expect(updated[0].name).toBe('Updated A');
  });

  it('does not modify non-matching versions', () => {
    const versions = [makeVersion('a'), makeVersion('b')];
    const updated = updateVersionInArray(versions, 'a', { name: 'Changed' });
    expect(updated[1].name).toBe('Version b');
  });

  it('updates lastModified to a recent timestamp', () => {
    const before = new Date();
    const versions = [makeVersion('a')];
    const updated = updateVersionInArray(versions, 'a', { name: 'X' });
    const after = new Date();
    const modifiedAt = new Date(updated[0].lastModified);
    expect(modifiedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(modifiedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('returns same length array', () => {
    const versions = [makeVersion('a'), makeVersion('b')];
    const updated = updateVersionInArray(versions, 'a', { name: 'X' });
    expect(updated).toHaveLength(2);
  });

  it('returns unchanged array when id not found', () => {
    const versions = [makeVersion('a')];
    const updated = updateVersionInArray(versions, 'nonexistent', { name: 'X' });
    expect(updated[0].name).toBe('Version a');
  });

  it('does not mutate the original array', () => {
    const versions = [makeVersion('a')];
    const original_name = versions[0].name;
    updateVersionInArray(versions, 'a', { name: 'Changed' });
    expect(versions[0].name).toBe(original_name);
  });
});

describe('deleteVersionFromArray', () => {
  it('removes the matching version', () => {
    const versions = [makeVersion('a'), makeVersion('b')];
    const result = deleteVersionFromArray(versions, 'a');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('returns same array when id not found', () => {
    const versions = [makeVersion('a')];
    const result = deleteVersionFromArray(versions, 'nonexistent');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when last item is deleted', () => {
    const versions = [makeVersion('a')];
    const result = deleteVersionFromArray(versions, 'a');
    expect(result).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const versions = [makeVersion('a'), makeVersion('b')];
    deleteVersionFromArray(versions, 'a');
    expect(versions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// localStorage-backed CRUD functions
// ---------------------------------------------------------------------------

describe('localStorage-backed schedule versions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadScheduleVersions', () => {
    it('returns empty array when no data in localStorage', () => {
      expect(loadScheduleVersions()).toEqual([]);
    });

    it('returns stored versions', () => {
      const id = saveScheduleVersion('Test', 'desc', makeFormValues());
      const versions = loadScheduleVersions();
      expect(versions).toHaveLength(1);
      expect(versions[0].id).toBe(id);
      expect(versions[0].name).toBe('Test');
    });
  });

  describe('saveScheduleVersion', () => {
    it('returns a string id', () => {
      const id = saveScheduleVersion('v1', 'desc', makeFormValues());
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('prepends new versions (newest first)', () => {
      saveScheduleVersion('first', '', makeFormValues());
      saveScheduleVersion('second', '', makeFormValues());
      const versions = loadScheduleVersions();
      expect(versions[0].name).toBe('second');
      expect(versions[1].name).toBe('first');
    });

    it('stores the description', () => {
      saveScheduleVersion('v1', 'my description', makeFormValues());
      expect(loadScheduleVersions()[0].description).toBe('my description');
    });

    it('stores serialized parameters', () => {
      saveScheduleVersion('v1', '', makeFormValues());
      const stored = loadScheduleVersions()[0];
      expect(typeof stored.parameters.startDate).toBe('string');
    });

    it('stores schedule when provided', () => {
      saveScheduleVersion('v1', '', makeFormValues(), makeSchedule());
      const stored = loadScheduleVersions()[0];
      expect(stored.generatedSchedule).toBeDefined();
    });

    it('stores warnings when provided', () => {
      saveScheduleVersion('v1', '', makeFormValues(), undefined, ['w1', 'w2']);
      const stored = loadScheduleVersions()[0];
      expect(stored.warnings).toEqual(['w1', 'w2']);
    });
  });

  describe('updateScheduleVersion', () => {
    it('returns true when version found and updated', () => {
      const id = saveScheduleVersion('Original', '', makeFormValues());
      const result = updateScheduleVersion(id, { name: 'Updated' });
      expect(result).toBe(true);
    });

    it('returns false when version not found', () => {
      const result = updateScheduleVersion('nonexistent', { name: 'X' });
      expect(result).toBe(false);
    });

    it('persists the name update', () => {
      const id = saveScheduleVersion('Original', '', makeFormValues());
      updateScheduleVersion(id, { name: 'New Name' });
      const stored = loadScheduleVersions().find((v) => v.id === id);
      expect(stored?.name).toBe('New Name');
    });

    it('updates lastModified timestamp', () => {
      const before = new Date();
      const id = saveScheduleVersion('v1', '', makeFormValues());
      updateScheduleVersion(id, { name: 'X' });
      const after = new Date();
      const stored = loadScheduleVersions().find((v) => v.id === id)!;
      const modified = new Date(stored.lastModified);
      expect(modified.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(modified.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('deleteScheduleVersion', () => {
    it('returns true when version deleted', () => {
      const id = saveScheduleVersion('v1', '', makeFormValues());
      expect(deleteScheduleVersion(id)).toBe(true);
    });

    it('returns false when version not found', () => {
      expect(deleteScheduleVersion('nonexistent')).toBe(false);
    });

    it('removes the version from storage', () => {
      const id = saveScheduleVersion('v1', '', makeFormValues());
      deleteScheduleVersion(id);
      expect(loadScheduleVersions().find((v) => v.id === id)).toBeUndefined();
    });

    it('only removes the specified version', () => {
      saveScheduleVersion('keep', '', makeFormValues());
      const id = saveScheduleVersion('delete-me', '', makeFormValues());
      deleteScheduleVersion(id);
      const remaining = loadScheduleVersions();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('keep');
    });
  });

  describe('getScheduleVersion', () => {
    it('returns the version by id', () => {
      const id = saveScheduleVersion('Find Me', '', makeFormValues());
      const found = getScheduleVersion(id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(id);
      expect(found!.name).toBe('Find Me');
    });

  it('returns undefined when id not found', () => {
    expect(getScheduleVersion('nonexistent')).toBeUndefined();
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
});
