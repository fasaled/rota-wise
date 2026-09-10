import { format, type Locale } from 'date-fns';
import type { DoctorProfile, Schedule, ScheduleEntry, Unit } from './types';
import { type ScheduleWarning, analyzeBrokenConstraints, analyzeUnitCoverage } from './schedule-analyze';

export function computeScheduleWarnings(
  schedule: Schedule | null,
  doctorsProfiles: DoctorProfile[],
  units: Unit[],
  currentMinInterval: number,
  language: string,
  currentDateFnsLocale: Locale,
  t: (key: string, params?: Record<string, any>) => string,
  holidays: Date[] = [],
): string[] {
  if (!schedule) return [];

  const rawWarnings: ScheduleWarning[] = [];

  rawWarnings.push(
    ...analyzeBrokenConstraints(
      schedule.entries,
      doctorsProfiles,
      currentMinInterval,
      schedule.globalMonthlyShiftLimit,
      schedule.startDate,
      schedule.endDate,
      language,
    ),
  );

  rawWarnings.push(
    ...analyzeUnitCoverage(
      schedule.entries,
      doctorsProfiles,
      units,
      schedule.startDate,
      schedule.endDate,
      holidays,
    ),
  );

  const preAssignedByDate = new Map<string, ScheduleEntry[]>();
  for (const entry of schedule.entries) {
    if (entry.assignment === 'Pre-assigned') {
      const key = format(entry.date, 'yyyy-MM-dd');
      const list = preAssignedByDate.get(key) ?? [];
      list.push(entry);
      preAssignedByDate.set(key, list);
    }
  }
  for (const [, entries] of preAssignedByDate) {
    if (entries.length > 1) {
      const doctors = entries
        .map((e) => doctorsProfiles.find((p) => p.id === e.doctorId)?.name)
        .filter((n): n is string => !!n)
        .join(', ');
      rawWarnings.push({
        key: 'warnings.multiplePreAssignedInput',
        params: { date: entries[0].date, doctors },
      });
    }
  }

  const anyDoctorPotentiallyAvailable = doctorsProfiles.some(
    (d) => !d.isExcludedFromAutomaticAssignment,
  );
  if (anyDoctorPotentiallyAvailable) {
    const coveredDates = new Set<string>();
    for (const entry of schedule.entries) {
      if (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned') {
        coveredDates.add(format(entry.date, 'yyyy-MM-dd'));
      }
    }
    const cursor = new Date(schedule.startDate);
    const end = new Date(schedule.endDate);
    while (cursor <= end) {
      if (!coveredDates.has(format(cursor, 'yyyy-MM-dd'))) {
        rawWarnings.push({
          key: 'warnings.uncoveredDay',
          params: { date: new Date(cursor) },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return rawWarnings.map((warning) => {
    const params: Record<string, any> = { ...(warning.params || {}) };
    const dateFields = ['date', 'date1', 'date2'];
    dateFields.forEach((field) => {
      if (params[field] && params[field] instanceof Date) {
        params[field] = format(params[field], 'P', { locale: currentDateFnsLocale });
      }
    });
    return t(warning.key, params);
  });
}
