import { useMemo, useState } from 'react';
import { endOfDay, isSameDay, startOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import type { Schedule } from '@/lib/types';

/** Background intensity for a count relative to the largest count in the table. */
export function getHeatClass(value: number, max: number): string {
  if (value === 0 || max === 0) return '';
  const ratio = value / max;
  if (ratio < 0.4) return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300';
  if (ratio < 0.75) return 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
  return 'bg-blue-200 dark:bg-blue-800/60 text-blue-900 dark:text-blue-100 font-medium';
}

export interface SummaryRange {
  /** What the picker shows (may be half-selected). */
  selection: DateRange | undefined;
  setSelection: (range: DateRange | undefined) => void;
  /** Effective period: the selection when complete, the whole schedule otherwise. */
  start: Date;
  end: Date;
  /** The effective period is narrower than the schedule. */
  isFiltered: boolean;
  reset: () => void;
  contains: (date: Date) => boolean;
}

/** Date-range filter shared by the summary tables. Resets when the schedule period changes. */
export function useSummaryRange(schedule: Schedule): SummaryRange {
  const periodKey = `${schedule.startDate.getTime()}-${schedule.endDate.getTime()}`;
  const [state, setState] = useState<{ periodKey: string; selection: DateRange | undefined }>({
    periodKey,
    selection: undefined,
  });
  const selection = state.periodKey === periodKey ? state.selection : undefined;

  return useMemo(() => {
    const complete = selection?.from && selection.to ? { from: selection.from, to: selection.to } : null;
    const start = startOfDay(complete?.from ?? schedule.startDate);
    const end = endOfDay(complete?.to ?? schedule.endDate);
    return {
      selection: selection ?? { from: schedule.startDate, to: schedule.endDate },
      setSelection: (range) => setState({ periodKey, selection: range }),
      start,
      end,
      isFiltered: !isSameDay(start, schedule.startDate) || !isSameDay(end, schedule.endDate),
      reset: () => setState({ periodKey, selection: undefined }),
      contains: (date) => date >= start && date <= end,
    };
  }, [selection, periodKey, schedule.startDate, schedule.endDate]);
}
