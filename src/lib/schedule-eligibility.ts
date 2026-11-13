import { differenceInCalendarDays, isSameDay } from 'date-fns';
import { getPostCallDate, isDateInArray, isPostCallOf } from './schedule-coverage';

/**
 * Why a doctor cannot take a shift on a given day. These are the per-doctor
 * hard rules shared by the generator and the manual selector in the calendar,
 * so both always agree.
 */
export type BlockReason = 'freeDay' | 'excluded' | 'interval' | 'postCall';

export interface EligibilityDoctor {
  freeDates: Date[];
  excludedDates?: Date[];
}

/**
 * @param workDates  Every other shift of the doctor (Work / Pre-assigned),
 *                   past and future. Must not include a shift on `date` itself.
 * @param minInterval Minimum calendar-day gap between two shifts.
 * @param holidays   A shift that falls on a holiday is ignored by the
 *                   min-interval rule (it still produces post-call).
 */
export function getAssignmentBlockReason(
  doctor: EligibilityDoctor,
  date: Date,
  workDates: Date[],
  minInterval: number,
  holidays: Date[] = [],
): BlockReason | null {
  if (isDateInArray(date, doctor.freeDates)) return 'freeDay';
  if (isDateInArray(date, doctor.excludedDates ?? [])) return 'excluded';

  const postCallDate = getPostCallDate(date);
  let intervalBroken = false;

  for (const workDate of workDates) {
    // Cannot work on the post-call day of a shift, nor take a shift whose own
    // post-call day is already a shift.
    if (isPostCallOf(workDate, date) || isSameDay(workDate, postCallDate)) return 'postCall';
    if (intervalBroken) continue;
    if (holidays.some((h) => isSameDay(h, workDate))) continue;
    if (Math.abs(differenceInCalendarDays(date, workDate)) <= minInterval) intervalBroken = true;
  }

  return intervalBroken ? 'interval' : null;
}
