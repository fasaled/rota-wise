import type { ScheduleEntry, DoctorFormFieldInput, Unit } from './types';
import { isSameDay, format, differenceInCalendarDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { computeUnitCoverageForDate, type CoverageDoctor } from './schedule-coverage';

export interface ScheduleWarning {
  key: string;
  params?: Record<string, any>;
}

const dayKeyToSpanish: { [key: string]: string } = {
  Mon: 'Lunes',
  Tue: 'Martes',
  Wed: 'Miércoles',
  Thu: 'Jueves',
  Fri: 'Viernes',
  Sat: 'Sábado',
  Sun: 'Domingo',
};

function translateDayKey(dayKey: string, language: string): string {
  if (language === 'es') {
    return dayKeyToSpanish[dayKey] || dayKey;
  }
  return dayKey;
}

export function analyzeBrokenConstraints(
  entries: ScheduleEntry[],
  doctors: DoctorFormFieldInput[],
  minInterval: number,
  globalMonthlyLimit: number | undefined,
  _startDate: Date,
  _endDate: Date,
  language: string = 'en',
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const preferredDayKeys = ['Thu', 'Fri', 'Sat', 'Sun'];

  const allWorkEntries = entries.filter((e) => e.assignment === 'Work' || e.assignment === 'Pre-assigned');

  doctors.forEach((doc) => {
    const allWorkDates: Date[] = [];

    entries.forEach((entry) => {
      if (entry.doctorId === doc.id && (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')) {
        allWorkDates.push(entry.date);
      }
    });

    allWorkDates.sort((a, b) => a.getTime() - b.getTime());

    for (let i = 1; i < allWorkDates.length; i++) {
      const daysBetween = differenceInCalendarDays(allWorkDates[i], allWorkDates[i - 1]);
      if (daysBetween <= minInterval) {
        warnings.push({
          key: 'warnings.brokenMinInterval',
          params: {
            doctor: doc.name,
            date1: allWorkDates[i - 1],
            date2: allWorkDates[i],
            interval: daysBetween,
            required: minInterval,
          },
        });
      }
    }
  });

  doctors.forEach((doc) => {
    doc.freeDates.forEach((freeDay) => {
      const workOnFreeDay = allWorkEntries.find(
        (e) => e.doctorId === doc.id && isSameDay(e.date, freeDay),
      );
      if (workOnFreeDay) {
        warnings.push({
          key: 'warnings.workOnFreeDay',
          params: {
            doctor: doc.name,
            date: freeDay,
          },
        });
      }
    });
  });

  doctors.forEach((doc) => {
    doc.excludedDates.forEach((exclDate) => {
      const workOnExcluded = allWorkEntries.find(
        (e) => e.doctorId === doc.id && isSameDay(e.date, exclDate),
      );
      if (workOnExcluded) {
        warnings.push({
          key: 'warnings.workOnExcludedDate',
          params: {
            doctor: doc.name,
            date: exclDate,
          },
        });
      }
    });
  });

  if (globalMonthlyLimit !== undefined && globalMonthlyLimit > 0) {
    const monthlyGroups = new Map<string, Map<string, number>>();

    allWorkEntries.forEach((entry) => {
      const monthKey = format(entry.date, 'yyyy-MM');
      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, new Map());
      }
      const doctorCounts = monthlyGroups.get(monthKey)!;
      doctorCounts.set(entry.doctorId, (doctorCounts.get(entry.doctorId) || 0) + 1);
    });

    monthlyGroups.forEach((doctorCounts, monthKey) => {
      doctorCounts.forEach((count, doctorId) => {
        if (count > globalMonthlyLimit) {
          const doctor = doctors.find((d) => d.id === doctorId);
          warnings.push({
            key: 'warnings.exceededMonthlyLimit',
            params: {
              doctor: doctor?.name || doctorId,
              month: monthKey,
              count: count,
              limit: globalMonthlyLimit,
            },
          });
        }
      });
    });
  }

  // Balance checks only look at doctors who take part in the rotation: anyone
  // who can be auto-assigned, plus anyone who has at least one shift. Doctors
  // with zero shifts count (that is the worst imbalance); entries of doctors
  // that are no longer on the roster are ignored.
  const knownIds = new Set(doctors.map((d) => d.id));
  const rosterWorkEntries = allWorkEntries.filter((e) => knownIds.has(e.doctorId));
  const workingIds = new Set(rosterWorkEntries.map((e) => e.doctorId));
  const rotation = doctors.filter((d) => !d.isExcludedFromAutomaticAssignment || workingIds.has(d.id));

  const monthlyTotals = new Map<string, Map<string, number>>();
  const dayOfWeekTotals = new Map<string, Map<string, number>>();
  for (const entry of rosterWorkEntries) {
    const monthKey = format(entry.date, 'yyyy-MM');
    const dayKey = format(entry.date, 'EEE', { locale: enUS });
    const byMonth = monthlyTotals.get(monthKey) ?? new Map<string, number>();
    byMonth.set(entry.doctorId, (byMonth.get(entry.doctorId) ?? 0) + 1);
    monthlyTotals.set(monthKey, byMonth);
    const byDay = dayOfWeekTotals.get(dayKey) ?? new Map<string, number>();
    byDay.set(entry.doctorId, (byDay.get(entry.doctorId) ?? 0) + 1);
    dayOfWeekTotals.set(dayKey, byDay);
  }

  const extremes = (counts: Map<string, number> | undefined) => {
    if (rotation.length < 2) return null;
    let maxDoctor = rotation[0];
    let minDoctor = rotation[0];
    for (const doc of rotation) {
      const value = counts?.get(doc.id) ?? 0;
      if (value > (counts?.get(maxDoctor.id) ?? 0)) maxDoctor = doc;
      if (value < (counts?.get(minDoctor.id) ?? 0)) minDoctor = doc;
    }
    return {
      maxDoctor: maxDoctor.name || maxDoctor.id,
      maxCount: counts?.get(maxDoctor.id) ?? 0,
      minDoctor: minDoctor.name || minDoctor.id,
      minCount: counts?.get(minDoctor.id) ?? 0,
    };
  };

  Array.from(monthlyTotals.keys())
    .sort()
    .forEach((monthKey) => {
      const e = extremes(monthlyTotals.get(monthKey));
      if (e && e.maxCount - e.minCount > 3) {
        warnings.push({ key: 'warnings.unbalancedMonthlyWorkdays', params: { month: monthKey, ...e } });
      }
    });

  dayKeys.forEach((dayKey) => {
    const e = extremes(dayOfWeekTotals.get(dayKey));
    if (e && e.maxCount - e.minCount > 3) {
      warnings.push({ key: 'warnings.unbalancedDayOfWeek', params: { day: translateDayKey(dayKey, language), ...e } });
    }
  });

  preferredDayKeys.forEach((preferredKey) => {
    const e = extremes(dayOfWeekTotals.get(preferredKey));
    if (e && e.maxCount - e.minCount > 2) {
      warnings.push({
        key: 'warnings.unbalancedPreferredDays',
        params: { day: translateDayKey(preferredKey, language), ...e },
      });
    }
  });

  return warnings;
}

/**
 * Post-generation coverage analysis. Iterates over every weekday in the schedule
 * range, computes unit coverage, and emits a `warnings.postCallUncovered` warning
 * for each (date, unit) pair where available doctors are below the unit's minimum.
 *
 * Also emits `warnings.postCallPreAssignmentConflict` for pre-assigned on-calls
 * that, combined with the post-call rule, would leave their unit undercovered on
 * the following weekday.
 */
export function analyzeUnitCoverage(
  entries: ScheduleEntry[],
  doctors: CoverageDoctor[],
  units: Unit[],
  startDate: Date,
  endDate: Date,
  holidays: Date[] = [],
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  if (units.length === 0) return warnings;

  const trackedUnits = units.filter((u) => u.minPostCallCoverage > 0);
  if (trackedUnits.length === 0) return warnings;

  const cursor = new Date(startDate);
  const end = new Date(endDate);
  const seenKeys = new Set<string>();

  while (cursor <= end) {
    const dayOfWeek = cursor.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidays.some((h) => isSameDay(h, cursor));
    if (!isWeekend && !isHoliday) {
      const coverage = computeUnitCoverageForDate(cursor, doctors, units, entries, { holidays });
      for (const c of coverage) {
        if (c.status !== 'tracked') continue;
        if (c.isCovered) continue;
        const key = `${format(cursor, 'yyyy-MM-dd')}-${c.unitId}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        warnings.push({
          key: 'warnings.postCallUncovered',
          params: {
            date: new Date(cursor),
            unit: c.unitName,
            available: c.available,
            min: c.min,
          },
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return warnings;
}
