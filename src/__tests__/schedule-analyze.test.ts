import { describe, it, expect } from 'bun:test';
import { analyzeBrokenConstraints } from '../lib/schedule-analyze';
import type { DoctorFormFieldInput, ScheduleEntry } from '../lib/types';

const doctor = (id: string, name: string): DoctorFormFieldInput => ({
  id,
  name,
  freeDates: [],
  preAssignedWorkDates: [],
  excludedDates: [],
  isExcludedFromAutomaticAssignment: false,
});

const work = (doctorId: string, date: string): ScheduleEntry => ({
  date: new Date(`${date}T00:00:00`),
  doctorId,
  assignment: 'Work',
  dayOfWeek: '',
});

describe('analyzeBrokenConstraints weekday balance', () => {
  const doctors = [doctor('doc1', 'Dr. A'), doctor('doc2', 'Dr. B')];
  const start = new Date('2024-01-01T00:00:00');
  const end = new Date('2024-01-31T00:00:00');

  it('warns when weekday work counts differ by more than 3 (EEE keys)', () => {
    // January 2024 Mondays: 1, 8, 15, 22, 29
    const entries = [
      work('doc1', '2024-01-01'),
      work('doc1', '2024-01-08'),
      work('doc1', '2024-01-15'),
      work('doc1', '2024-01-22'),
      work('doc1', '2024-01-29'),
      work('doc2', '2024-01-01'),
    ];
    const warnings = analyzeBrokenConstraints(entries, doctors, 1, undefined, start, end, 'en');
    const weekday = warnings.find((w) => w.key === 'warnings.unbalancedDayOfWeek');
    expect(weekday).toBeDefined();
    expect(weekday!.params?.day).toBe('Mon');
    expect(weekday!.params?.maxCount).toBe(5);
    expect(weekday!.params?.minCount).toBe(1);
  });

  it('translates weekday names in Spanish warnings', () => {
    const entries = [
      work('doc1', '2024-01-01'),
      work('doc1', '2024-01-08'),
      work('doc1', '2024-01-15'),
      work('doc1', '2024-01-22'),
      work('doc1', '2024-01-29'),
      work('doc2', '2024-01-01'),
    ];
    const warnings = analyzeBrokenConstraints(entries, doctors, 1, undefined, start, end, 'es');
    const weekday = warnings.find((w) => w.key === 'warnings.unbalancedDayOfWeek');
    expect(weekday?.params?.day).toBe('Lunes');
  });

  it('warns when preferred-day counts differ by more than 2', () => {
    // January 2024 Thursdays: 4, 11, 18, 25
    const entries = [
      work('doc1', '2024-01-04'),
      work('doc1', '2024-01-11'),
      work('doc1', '2024-01-18'),
      work('doc1', '2024-01-25'),
      work('doc2', '2024-01-04'),
    ];
    const warnings = analyzeBrokenConstraints(entries, doctors, 1, undefined, start, end, 'en');
    const preferred = warnings.find((w) => w.key === 'warnings.unbalancedPreferredDays');
    expect(preferred).toBeDefined();
    expect(preferred!.params?.day).toBe('Thu');
    expect(preferred!.params?.maxCount).toBe(4);
  });
});
