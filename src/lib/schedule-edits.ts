import { format, isSameDay, startOfMonth, endOfMonth } from 'date-fns';
import type { DoctorFormFieldInput, DoctorProfile, Schedule, ScheduleEntry } from './types';
import { deduplicateEntries } from './utils';

function isWorkLike(assignment: ScheduleEntry['assignment']): boolean {
  return assignment === 'Work' || assignment === 'Pre-assigned';
}

export function toDoctorProfile(doc: DoctorFormFieldInput): DoctorProfile {
  return {
    id: doc.id,
    name: doc.name,
    freeDates: doc.freeDates,
    preAssignedWorkDates: doc.preAssignedWorkDates,
    excludedDates: doc.excludedDates || [],
    isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    unitId: doc.unitId || undefined,
    coverAssignments: doc.coverAssignments ?? [],
  };
}

export function applyArbitraryScheduleEntry(schedule: Schedule, updatedEntry: ScheduleEntry): Schedule {
  const newEntries = schedule.entries.filter((e) => {
    if (isSameDay(e.date, updatedEntry.date)) {
      if (
        e.doctorId === updatedEntry.doctorId &&
        isWorkLike(e.assignment) &&
        isWorkLike(updatedEntry.assignment)
      ) {
        return false;
      }
      if (
        isWorkLike(updatedEntry.assignment) &&
        isWorkLike(e.assignment) &&
        e.doctorId !== updatedEntry.doctorId
      ) {
        return false;
      }
      if (isWorkLike(updatedEntry.assignment) && e.doctorId === 'system' && e.assignment === 'Off') {
        return false;
      }
    }
    return true;
  });

  newEntries.push(updatedEntry);
  return { ...schedule, entries: deduplicateEntries(newEntries) };
}

export function applySwapScheduleEntries(
  schedule: Schedule,
  entry1: ScheduleEntry,
  entry2: ScheduleEntry,
  oldDate1?: Date,
  oldDate2?: Date,
): Schedule {
  const newEntries = schedule.entries.filter((e) => {
    if (
      oldDate1 &&
      isSameDay(e.date, oldDate1) &&
      e.doctorId === entry1.doctorId &&
      isWorkLike(e.assignment) &&
      isWorkLike(entry1.assignment)
    ) {
      return false;
    }

    if (
      oldDate2 &&
      isSameDay(e.date, oldDate2) &&
      e.doctorId === entry2.doctorId &&
      isWorkLike(e.assignment) &&
      isWorkLike(entry2.assignment)
    ) {
      return false;
    }

    if (
      !oldDate1 &&
      isSameDay(e.date, entry1.date) &&
      e.doctorId === entry1.doctorId &&
      isWorkLike(e.assignment) &&
      isWorkLike(entry1.assignment)
    ) {
      return false;
    }

    if (
      !oldDate2 &&
      isSameDay(e.date, entry2.date) &&
      e.doctorId === entry2.doctorId &&
      isWorkLike(e.assignment) &&
      isWorkLike(entry2.assignment)
    ) {
      return false;
    }

    return true;
  });

  newEntries.push(entry1, entry2);
  return { ...schedule, entries: deduplicateEntries(newEntries) };
}

export function applyUpdateScheduleEntry(
  schedule: Schedule,
  updatedEntry: ScheduleEntry,
  oldDate?: Date,
): Schedule {
  let newEntries: ScheduleEntry[];

  if (updatedEntry.assignment === 'Off') {
    newEntries = schedule.entries.filter((e) => {
      if (isSameDay(e.date, updatedEntry.date)) {
        return e.assignment === 'Free';
      }
      return true;
    });
    if (
      !newEntries.some(
        (e) => isSameDay(e.date, updatedEntry.date) && e.doctorId === 'system' && e.assignment === 'Off',
      )
    ) {
      newEntries.push(updatedEntry);
    }
  } else {
    newEntries = schedule.entries.filter((e) => {
      if (
        oldDate &&
        isSameDay(e.date, oldDate) &&
        e.doctorId === updatedEntry.doctorId &&
        isWorkLike(e.assignment) &&
        isWorkLike(updatedEntry.assignment)
      ) {
        return false;
      }

      if (isSameDay(e.date, updatedEntry.date)) {
        if (e.doctorId === updatedEntry.doctorId) {
          if (isWorkLike(e.assignment) && isWorkLike(updatedEntry.assignment)) {
            return false;
          }
        }
        if (
          isWorkLike(updatedEntry.assignment) &&
          isWorkLike(e.assignment) &&
          e.doctorId !== updatedEntry.doctorId
        ) {
          return false;
        }
        if (isWorkLike(updatedEntry.assignment) && e.doctorId === 'system' && e.assignment === 'Off') {
          return false;
        }
      }
      return true;
    });
    newEntries.push(updatedEntry);
  }

  newEntries.sort((a, b) => {
    const diff = a.date.getTime() - b.date.getTime();
    return diff !== 0 ? diff : a.doctorId.localeCompare(b.doctorId);
  });

  return { ...schedule, entries: deduplicateEntries(newEntries) };
}

export function applyToggleMonthFixed(schedule: Schedule, month: Date, isFixed: boolean): Schedule {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const updatedEntries = schedule.entries.map((entry) => {
    const d = new Date(entry.date);
    if (d >= monthStart && d <= monthEnd && isWorkLike(entry.assignment)) {
      return { ...entry, isFixed };
    }
    return entry;
  });
  return { ...schedule, entries: updatedEntries };
}

export function applyToggleEntryFixed(
  schedule: Schedule,
  entry: ScheduleEntry,
  isFixed: boolean,
): Schedule {
  const updatedEntries = schedule.entries.map((e) => {
    if (isSameDay(e.date, entry.date) && e.doctorId === entry.doctorId && e.assignment === entry.assignment) {
      return { ...e, isFixed };
    }
    return e;
  });
  return { ...schedule, entries: updatedEntries };
}

export function applyRemoveWorkEntriesForDate(schedule: Schedule, targetDate: Date): Schedule {
  return {
    ...schedule,
    entries: schedule.entries.filter((e) => !(e.assignment === 'Work' && isSameDay(e.date, targetDate))),
  };
}

export function applyToggleFreeDayOnSchedule(
  schedule: Schedule,
  date: Date,
  doctorId: string,
  adding: boolean,
): Schedule {
  if (adding) {
    return {
      ...schedule,
      entries: [
        ...schedule.entries,
        {
          date,
          doctorId,
          assignment: 'Free' as const,
          dayOfWeek: format(date, 'EEEE'),
        },
      ],
    };
  }
  return {
    ...schedule,
    entries: schedule.entries.filter(
      (e) => !(isSameDay(e.date, date) && e.doctorId === doctorId && e.assignment === 'Free'),
    ),
  };
}
