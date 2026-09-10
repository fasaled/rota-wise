import { differenceInCalendarDays, isSameDay } from 'date-fns';
import type { ScheduleEntry } from './types';

function isWorkLike(assignment: ScheduleEntry['assignment']): boolean {
  return assignment === 'Work' || assignment === 'Pre-assigned';
}

export function findNearestWorkNeighbors(
  entries: ScheduleEntry[],
  doctorId: string,
  date: Date,
): { before?: ScheduleEntry; after?: ScheduleEntry } {
  const otherWorkEntries = entries.filter(
    (e) => e.doctorId === doctorId && isWorkLike(e.assignment) && !isSameDay(e.date, date),
  );

  const before = otherWorkEntries
    .filter((e) => e.date < date)
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

  const after = otherWorkEntries
    .filter((e) => e.date > date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  return { before, after };
}

export function violatesMinInterval(from: Date, to: Date, minInterval: number): boolean {
  return differenceInCalendarDays(to, from) <= minInterval;
}
