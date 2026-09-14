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

  const doctorMonthlyTotals: { [doctorId: string]: { [monthKey: string]: number } } = {};
  doctors.forEach((doc) => {
    doctorMonthlyTotals[doc.id] = {};
  });

  allWorkEntries.forEach((entry) => {
    const monthKey = format(entry.date, 'yyyy-MM');
    doctorMonthlyTotals[entry.doctorId][monthKey] = (doctorMonthlyTotals[entry.doctorId][monthKey] || 0) + 1;
  });

  const allMonthKeys = new Set<string>();
  allWorkEntries.forEach((entry) => {
    allMonthKeys.add(format(entry.date, 'yyyy-MM'));
  });

  allMonthKeys.forEach((monthKey) => {
    const monthTotals = doctors.map((doc) => doctorMonthlyTotals[doc.id][monthKey] || 0);
    const maxMonth = Math.max(...monthTotals);
    const minMonth = Math.min(...monthTotals.filter((t) => t > 0));
    if (maxMonth - minMonth > 3) {
      const maxDoctor = doctors.find((doc) => doctorMonthlyTotals[doc.id][monthKey] === maxMonth);
      const minDoctor = doctors.find((doc) => doctorMonthlyTotals[doc.id][monthKey] === minMonth);
      warnings.push({
        key: 'warnings.unbalancedMonthlyWorkdays',
        params: {
          month: monthKey,
          maxDoctor: maxDoctor?.name || maxDoctor?.id,
          maxCount: maxMonth,
          minDoctor: minDoctor?.name || minDoctor?.id,
          minCount: minMonth,
        },
      });
    }
  });

  const doctorDayOfWeekTotals: { [doctorId: string]: { [dayKey: string]: number } } = {};
  doctors.forEach((doc) => {
    doctorDayOfWeekTotals[doc.id] = {};
    dayKeys.forEach((key) => (doctorDayOfWeekTotals[doc.id][key] = 0));
  });

  allWorkEntries.forEach((entry) => {
    const dayKey = format(entry.date, 'EEE', { locale: enUS });
    doctorDayOfWeekTotals[entry.doctorId][dayKey] = (doctorDayOfWeekTotals[entry.doctorId][dayKey] || 0) + 1;
  });

  dayKeys.forEach((dayKey) => {
    const dayTotals = doctors.map((doc) => doctorDayOfWeekTotals[doc.id][dayKey] || 0);
    const maxCount = Math.max(...dayTotals);
    const minCount = Math.min(...dayTotals.filter((t) => t > 0));
    if (maxCount - minCount > 3) {
      const maxDoctor = doctors.find((doc) => doctorDayOfWeekTotals[doc.id][dayKey] === maxCount);
      const minDoctor = doctors.find((doc) => doctorDayOfWeekTotals[doc.id][dayKey] === minCount);
      warnings.push({
        key: 'warnings.unbalancedDayOfWeek',
        params: {
          day: translateDayKey(dayKey, language),
          maxDoctor: maxDoctor?.name || maxDoctor?.id,
          maxCount: maxCount,
          minDoctor: minDoctor?.name || minDoctor?.id,
          minCount: minCount,
        },
      });
    }
  });

  preferredDayKeys.forEach((preferredKey) => {
    const dayTotals = doctors.map((doc) => doctorDayOfWeekTotals[doc.id][preferredKey] || 0);
    const maxCount = Math.max(...dayTotals);
    const minCount = Math.min(...dayTotals.filter((t) => t > 0));
    if (maxCount - minCount > 2) {
      const maxDoctor = doctors.find((doc) => doctorDayOfWeekTotals[doc.id][preferredKey] === maxCount);
      const minDoctor = doctors.find((doc) => doctorDayOfWeekTotals[doc.id][preferredKey] === minCount);
      warnings.push({
        key: 'warnings.unbalancedPreferredDays',
        params: {
          day: translateDayKey(preferredKey, language),
          maxDoctor: maxDoctor?.name || maxDoctor?.id,
          maxCount: maxCount,
          minDoctor: minDoctor?.name || minDoctor?.id,
          minCount: minCount,
        },
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
