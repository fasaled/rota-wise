import { useCallback, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import type { Locale } from 'date-fns';
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import type { DoctorProfile, Schedule, ScheduleEntry } from '@/lib/types';
import type { TFunction } from '@/lib/i18n';
import type { InfoBarMessage } from '@/hooks/use-info-bar';
import { isDateInArray } from '@/lib/schedule-coverage';
import { isWorkLike } from './chips';

type Notify = (msg: Omit<InfoBarMessage, 'id'>) => void;

interface Options {
  schedule: Schedule;
  doctors: DoctorProfile[];
  /** Dragging is disabled while a doctor filter hides part of the roster. */
  hasDoctorFilter: boolean;
  onUpdateScheduleEntry: (entry: ScheduleEntry, oldDate?: Date) => void;
  onSwapScheduleEntries: (a: ScheduleEntry, b: ScheduleEntry, oldDateA?: Date, oldDateB?: Date) => void;
  onNotify: Notify;
  t: TFunction;
  locale: Locale;
}

const moveTo = (entry: ScheduleEntry, date: Date): ScheduleEntry => ({
  ...entry,
  date,
  // Always English: `dayOfWeek` is data, not UI.
  dayOfWeek: format(date, 'EEEE'),
});

/**
 * Drag a shift onto another day to move it, or onto another shift to swap
 * both doctors. Pointer only: keyboard users reassign through the doctor
 * picker, which offers the same result.
 */
export function useShiftDragAndDrop({
  schedule,
  doctors,
  hasDoctorFilter,
  onUpdateScheduleEntry,
  onSwapScheduleEntries,
  onNotify,
  t,
  locale,
}: Options) {
  const [draggedEntry, setDraggedEntry] = useState<ScheduleEntry | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onDragStart = useCallback((event: DragStartEvent) => {
    const entry = event.active.data.current?.entry as ScheduleEntry | undefined;
    setDraggedEntry(entry ?? null);
  }, []);

  const onDragCancel = useCallback(() => setDraggedEntry(null), []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggedEntry(null);
      const dragged = event.active.data.current?.entry as ScheduleEntry | undefined;
      const targetDate = event.over?.data.current?.date as Date | undefined;
      if (!dragged || !targetDate || isSameDay(dragged.date, targetDate)) return;

      const fail = (title: string, description: string) =>
        onNotify({ severity: 'error', title, description, autoDismissMs: 5000 });

      if (hasDoctorFilter) {
        fail(t('calendar.toast.filterDisablesDrag.title'), t('calendar.toast.filterDisablesDrag.description'));
        return;
      }
      if (dragged.assignment !== 'Work' || dragged.isFixed) {
        fail(t('calendar.toast.onlyWorkDraggable.title'), t('calendar.toast.onlyWorkDraggable.description'));
        return;
      }

      const onTarget = schedule.entries.find((e) => isSameDay(e.date, targetDate) && isWorkLike(e.assignment));
      if (onTarget?.doctorId === dragged.doctorId) return;
      if (onTarget && (onTarget.isFixed || onTarget.assignment === 'Pre-assigned')) {
        fail(t('calendar.toast.cannotSwapWithFixed.title'), t('calendar.toast.cannotSwapWithFixed.description'));
        return;
      }

      /** Free and excluded days are never overridden by a drag. */
      const blocked = (doctorId: string, date: Date): boolean => {
        const doctor = doctors.find((d) => d.id === doctorId);
        if (!doctor) return false;
        if (!isDateInArray(date, doctor.freeDates) && !isDateInArray(date, doctor.excludedDates)) return false;
        fail(
          t('calendar.toast.cannotSwapExcludedDay.title'),
          t('calendar.toast.cannotSwapExcludedDay.description', {
            doctorName: doctor.name,
            targetDate: format(date, 'PPP', { locale }),
          }),
        );
        return true;
      };

      if (blocked(dragged.doctorId, targetDate)) return;

      if (onTarget) {
        if (blocked(onTarget.doctorId, dragged.date)) return;
        onSwapScheduleEntries(moveTo(dragged, targetDate), moveTo(onTarget, dragged.date), dragged.date, targetDate);
        onNotify({
          severity: 'success',
          title: t('calendar.toast.doctorsSwapped.title'),
          description: t('calendar.toast.doctorsSwapped.description'),
          autoDismissMs: 3000,
        });
      } else {
        onUpdateScheduleEntry(moveTo(dragged, targetDate), dragged.date);
        onNotify({
          severity: 'success',
          title: t('calendar.toast.doctorMoved.title'),
          description: t('calendar.toast.doctorMoved.description'),
          autoDismissMs: 3000,
        });
      }
    },
    [schedule.entries, doctors, hasDoctorFilter, onUpdateScheduleEntry, onSwapScheduleEntries, onNotify, t, locale],
  );

  return { sensors, draggedEntry, onDragStart, onDragEnd, onDragCancel };
}
