import { describe, it, expect } from 'bun:test';
import { scheduleFormSchema } from '../lib/schedule-form-schema';

describe('scheduleFormSchema', () => {
  const namedDoctor = {
    id: 'doc1',
    name: 'Dr. Smith',
    freeDates: [],
    preAssignedWorkDates: [],
    excludedDates: [],
    isExcludedFromAutomaticAssignment: false,
  };

  it('accepts a period that ended in the past', () => {
    const result = scheduleFormSchema.safeParse({
      numberOfDoctors: 1,
      startDate: new Date('2020-01-01T00:00:00'),
      endDate: new Date('2020-01-31T00:00:00'),
      minIntervalBetweenWorkDays: 1,
      doctors: [namedDoctor],
      units: [],
      holidays: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    const result = scheduleFormSchema.safeParse({
      numberOfDoctors: 1,
      startDate: new Date('2020-02-01T00:00:00'),
      endDate: new Date('2020-01-01T00:00:00'),
      minIntervalBetweenWorkDays: 1,
      doctors: [namedDoctor],
      units: [],
      holidays: [],
    });
    expect(result.success).toBe(false);
  });
});
