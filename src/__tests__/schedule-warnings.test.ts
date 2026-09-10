import { describe, it, expect } from 'bun:test';
import { enUS } from 'date-fns/locale';
import { computeScheduleWarnings } from '../lib/schedule-warnings';
import type { DoctorProfile, Schedule } from '../lib/types';

const t = (key: string, params?: Record<string, any>) => {
  if (!params) return key;
  return `${key}:${JSON.stringify(params)}`;
};

const doctor = (id: string, name: string): DoctorProfile => ({
  id,
  name,
  freeDates: [],
  preAssignedWorkDates: [],
  excludedDates: [],
  isExcludedFromAutomaticAssignment: false,
});

describe('computeScheduleWarnings', () => {
  it('returns empty when there is no schedule', () => {
    expect(computeScheduleWarnings(null, [], [], 1, 'en', enUS, t)).toEqual([]);
  });

  it('warns on uncovered days when a doctor can be assigned', () => {
    const schedule: Schedule = {
      startDate: new Date('2024-01-01T00:00:00'),
      endDate: new Date('2024-01-02T00:00:00'),
      entries: [
        {
          date: new Date('2024-01-01T00:00:00'),
          doctorId: 'doc1',
          assignment: 'Work',
          dayOfWeek: 'Monday',
        },
      ],
    };
    const warnings = computeScheduleWarnings(
      schedule,
      [doctor('doc1', 'Dr. Smith')],
      [],
      1,
      'en',
      enUS,
      t,
    );
    expect(warnings.some((w) => w.startsWith('warnings.uncoveredDay'))).toBe(true);
  });

  it('warns when two pre-assignments land on the same date', () => {
    const date = new Date('2024-01-01T00:00:00');
    const schedule: Schedule = {
      startDate: date,
      endDate: date,
      entries: [
        { date, doctorId: 'doc1', assignment: 'Pre-assigned', dayOfWeek: 'Monday' },
        { date, doctorId: 'doc2', assignment: 'Pre-assigned', dayOfWeek: 'Monday' },
      ],
    };
    const warnings = computeScheduleWarnings(
      schedule,
      [doctor('doc1', 'Dr. A'), doctor('doc2', 'Dr. B')],
      [],
      1,
      'en',
      enUS,
      t,
    );
    expect(warnings.some((w) => w.startsWith('warnings.multiplePreAssignedInput'))).toBe(true);
  });
});
