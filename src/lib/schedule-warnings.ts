import { format, type Locale } from 'date-fns';
import type { LooseTFunction } from './i18n';
import type { DoctorProfile, Schedule, ScheduleEntry, Unit } from './types';
import { type ScheduleWarning, analyzeBrokenConstraints, analyzeUnitCoverage } from './schedule-analyze';

export function computeScheduleWarnings(
  schedule: Schedule | null,
  doctorsProfiles: DoctorProfile[],
  units: Unit[],
  currentMinInterval: number,
  language: string,
  currentDateFnsLocale: Locale,
  t: LooseTFunction,
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

  // Shifts whose doctor was removed from the roster after generation.
  const rosterIds = new Set(doctorsProfiles.map((d) => d.id));
  const orphanShifts = schedule.entries.filter(
    (e) => (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && !rosterIds.has(e.doctorId),
  ).length;
  if (orphanShifts > 0) {
    rawWarnings.push({ key: 'warnings.removedDoctorShifts', params: { count: orphanShifts } });
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
    // Month keys travel as `yyyy-MM`; show them as a localized month name.
    if (typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)) {
      const [year, month] = params.month.split('-').map(Number);
      params.month = format(new Date(year, month - 1, 1), 'LLLL yyyy', { locale: currentDateFnsLocale });
    }
    return t(warning.key, params);
  });
}
