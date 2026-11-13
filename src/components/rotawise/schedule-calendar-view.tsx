import { useCallback, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';
import { CalendarDays, ChevronLeft, ChevronRight, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExcludedIcon, FreeDayIcon, PreAssignedIcon, WorkIcon } from '@/components/icons';
import type { DoctorProfile, Schedule, ScheduleEntry, Unit, UnitCoverage } from '@/lib/types';
import { computeUnitCoverageForDate, isDateInArray } from '@/lib/schedule-coverage';
import { toDateKey } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { InfoBarMessage } from '@/hooks/use-info-bar';
import { CalendarFilterBar, type ActiveFilter } from './calendar-filter-bar';
import { CHIP_CLASS, COVERAGE_DOT_CLASS, isWorkLike } from './calendar/chips';
import { DayCell, type DayModel } from './calendar/day-cell';
import { useShiftDragAndDrop } from './calendar/use-shift-dnd';

interface ScheduleCalendarViewProps {
  schedule: Schedule;
  doctors: DoctorProfile[];
  units: Unit[];
  holidays: Date[];
  /** Interval the schedule was generated with; drives the doctor picker rules. */
  minIntervalBetweenWorkDays: number;
  onUpdateScheduleEntry: (updatedEntry: ScheduleEntry, oldDate?: Date) => void;
  onSwapScheduleEntries: (entry1: ScheduleEntry, entry2: ScheduleEntry, oldDate1?: Date, oldDate2?: Date) => void;
  onToggleMonthFixed: (month: Date, isFixed: boolean) => void;
  onToggleEntryFixed: (entry: ScheduleEntry, isFixed: boolean) => void;
  onRemoveWorkEntriesForDate: (date: Date) => void;
  onToggleFreeDay: (date: Date, doctorId: string) => void;
  onNotify: (msg: Omit<InfoBarMessage, 'id'>) => void;
  activeFilters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export default function ScheduleCalendarView({
  schedule,
  doctors,
  units,
  holidays,
  minIntervalBetweenWorkDays,
  onUpdateScheduleEntry,
  onSwapScheduleEntries,
  onToggleMonthFixed,
  onToggleEntryFixed,
  onRemoveWorkEntriesForDate,
  onToggleFreeDay,
  onNotify,
  activeFilters,
  onFiltersChange,
}: ScheduleCalendarViewProps) {
  const { t, currentDateFnsLocale } = useLanguage();
  const isPhone = useMediaQuery('(max-width: 639px)');

  // The visible month follows the schedule: a new period jumps to its first month.
  const [monthState, setMonthState] = useState(() => ({
    period: schedule.startDate.getTime(),
    month: startOfMonth(schedule.startDate),
  }));
  let currentMonth = monthState.month;
  if (monthState.period !== schedule.startDate.getTime()) {
    currentMonth = startOfMonth(schedule.startDate);
    setMonthState({ period: schedule.startDate.getTime(), month: currentMonth });
  }
  const shiftMonth = (delta: number) => setMonthState((s) => ({ ...s, month: addMonths(s.month, delta) }));

  const doctorFilterIds = useMemo(
    () => activeFilters.filter((f) => f.type === 'doctor').map((f) => f.value),
    [activeFilters],
  );
  const assignmentFilter = useMemo(
    () => activeFilters.filter((f) => f.type === 'assignment').map((f) => f.value),
    [activeFilters],
  );

  const doctorMap = useMemo(() => new Map(doctors.map((doc) => [doc.id, doc])), [doctors]);

  // Index the schedule once instead of scanning it for every cell.
  const { entriesByDay, workDatesByDoctor } = useMemo(() => {
    const byDay = new Map<string, ScheduleEntry[]>();
    const workDates = new Map<string, Date[]>();
    for (const entry of schedule.entries) {
      const key = toDateKey(entry.date);
      const list = byDay.get(key);
      if (list) list.push(entry);
      else byDay.set(key, [entry]);
      if (isWorkLike(entry.assignment)) {
        const dates = workDates.get(entry.doctorId);
        if (dates) dates.push(entry.date);
        else workDates.set(entry.doctorId, [entry.date]);
      }
    }
    return { entriesByDay: byDay, workDatesByDoctor: workDates };
  }, [schedule.entries]);

  const coverageByDay = useMemo(() => {
    const map = new Map<string, UnitCoverage[]>();
    if (units.length === 0) return map;
    for (const date of eachDayOfInterval({ start: schedule.startDate, end: schedule.endDate })) {
      const weekday = date.getDay();
      if (weekday === 0 || weekday === 6 || isDateInArray(date, holidays)) continue;
      map.set(toDateKey(date), computeUnitCoverageForDate(date, doctors, units, schedule.entries, { holidays }));
    }
    return map;
  }, [units, doctors, schedule.entries, schedule.startDate, schedule.endDate, holidays]);

  const days = useMemo((): DayModel[] => {
    const monthStart = startOfMonth(currentMonth);
    const rangeStart = startOfDay(schedule.startDate);
    const rangeEnd = startOfDay(schedule.endDate);
    const today = new Date();
    const allowsType = (type: string) => assignmentFilter.length === 0 || assignmentFilter.includes(type);
    const allowsDoctor = (id: string) => doctorFilterIds.length === 0 || doctorFilterIds.includes(id);
    const rosterOrder = new Map(doctors.map((d, i) => [d.id, i]));

    return eachDayOfInterval({
      start: startOfWeek(monthStart, { locale: currentDateFnsLocale }),
      end: endOfWeek(endOfMonth(monthStart), { locale: currentDateFnsLocale }),
    }).map((date) => {
      const key = toDateKey(date);
      const entries = entriesByDay.get(key) ?? [];
      const inRange = date >= rangeStart && date <= rangeEnd;
      const work = entries.find((e) => isWorkLike(e.assignment)) ?? null;
      const weekday = date.getDay();

      return {
        date,
        key,
        inMonth: isSameMonth(date, monthStart),
        inRange,
        isToday: isSameDay(date, today),
        isWeekend: weekday === 0 || weekday === 6,
        isHoliday: isDateInArray(date, holidays),
        work,
        workVisible: !!work && allowsDoctor(work.doctorId) && allowsType(work.assignment),
        canAssign: inRange && !work && allowsType('Work') && doctors.length > 0,
        free: entries
          .filter((e) => e.assignment === 'Free' && allowsDoctor(e.doctorId) && allowsType('Free'))
          .sort((a, b) => (rosterOrder.get(a.doctorId) ?? 999) - (rosterOrder.get(b.doctorId) ?? 999)),
        canEditFree: inRange && allowsType('Free') && doctors.length > 0,
        excluded:
          inRange && allowsType('Excluded')
            ? doctors.filter((doc) => allowsDoctor(doc.id) && isDateInArray(date, doc.excludedDates))
            : [],
        coverage: coverageByDay.get(key) ?? [],
      };
    });
  }, [
    currentMonth,
    schedule.startDate,
    schedule.endDate,
    entriesByDay,
    coverageByDay,
    doctors,
    holidays,
    assignmentFilter,
    doctorFilterIds,
    currentDateFnsLocale,
  ]);

  const handleSelectDoctor = useCallback(
    (date: Date, doctorId: string) => {
      const current = schedule.entries.find((e) => isSameDay(e.date, date) && isWorkLike(e.assignment));
      onUpdateScheduleEntry(
        {
          date,
          doctorId,
          assignment: 'Work',
          // Always English: `dayOfWeek` is data, not UI.
          dayOfWeek: format(date, 'EEEE'),
          isFixed: current?.isFixed ?? false,
        },
        current?.date,
      );
    },
    [schedule.entries, onUpdateScheduleEntry],
  );

  const hasDoctorFilter = doctorFilterIds.length > 0;
  const dnd = useShiftDragAndDrop({
    schedule,
    doctors,
    hasDoctorFilter,
    onUpdateScheduleEntry,
    onSwapScheduleEntries,
    onNotify,
    t,
    locale: currentDateFnsLocale,
  });

  const weekDays = useMemo(() => {
    const first = startOfWeek(new Date(), { locale: currentDateFnsLocale });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(first, i);
      return {
        short: format(d, 'EEE', { locale: currentDateFnsLocale }).replace(/\.$/, ''),
        long: format(d, 'EEEE', { locale: currentDateFnsLocale }),
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      };
    });
  }, [currentDateFnsLocale]);

  const monthLabel = capitalize(format(currentMonth, 'LLLL yyyy', { locale: currentDateFnsLocale }));

  const monthShifts = useMemo(
    () => schedule.entries.filter((e) => isWorkLike(e.assignment) && isSameMonth(e.date, currentMonth)),
    [schedule.entries, currentMonth],
  );
  const monthAllFixed = monthShifts.length > 0 && monthShifts.every((e) => e.isFixed);

  const cellProps = {
    doctors,
    doctorMap,
    workDatesByDoctor,
    minInterval: minIntervalBetweenWorkDays,
    holidays,
    canDrag: !hasDoctorFilter,
    onSelectDoctor: handleSelectDoctor,
    onClearDay: onRemoveWorkEntriesForDate,
    onToggleEntryFixed,
    onToggleFreeDay,
  };

  const agendaDays = days.filter((d) => d.inMonth && d.inRange);
  const draggedName = dnd.draggedEntry
    ? (doctorMap.get(dnd.draggedEntry.doctorId)?.name ?? t('calendar.removedDoctor'))
    : '';

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> {t('calendar.title')}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label={t('calendar.previousMonth')}>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
              <span className="text-lg font-semibold w-44 text-center shrink-0 tabular-nums" aria-live="polite">
                {monthLabel}
              </span>
              <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label={t('calendar.nextMonth')}>
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
            <Button
              variant={monthAllFixed ? 'default' : 'outline'}
              size="sm"
              disabled={monthShifts.length === 0}
              aria-pressed={monthAllFixed}
              onClick={() => onToggleMonthFixed(currentMonth, !monthAllFixed)}
            >
              {monthAllFixed ? (
                <Unlock className="mr-1 h-4 w-4" aria-hidden="true" />
              ) : (
                <Lock className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              {monthAllFixed ? t('calendar.unfixMonth') : t('calendar.fixMonth')}
            </Button>
          </div>
        </div>
        <CalendarFilterBar doctors={doctors} activeFilters={activeFilters} onFiltersChange={onFiltersChange} />
      </CardHeader>

      <CardContent className="p-2 sm:p-4">
        {isPhone ? (
          agendaDays.length > 0 ? (
            <ul className="space-y-1.5" aria-label={monthLabel}>
              {agendaDays.map((day) => (
                <DayCell key={day.key} day={day} variant="agenda" {...cellProps} />
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('calendar.monthOutsidePeriod')}</p>
          )
        ) : (
          <DndContext
            sensors={dnd.sensors}
            collisionDetection={pointerWithin}
            onDragStart={dnd.onDragStart}
            onDragEnd={dnd.onDragEnd}
            onDragCancel={dnd.onDragCancel}
          >
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-7 gap-1 text-center font-semibold uppercase tracking-wider text-muted-foreground text-[11px] mb-2">
                  {weekDays.map((day) => (
                    <div key={day.long} className={cn(day.isWeekend && 'text-muted-foreground/70')}>
                      <abbr title={day.long} className="no-underline">
                        {day.short}
                      </abbr>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {days.map((day) => (
                    <DayCell key={day.key} day={day} variant="grid" {...cellProps} />
                  ))}
                </div>
              </div>
            </div>
            <DragOverlay>
              {dnd.draggedEntry ? (
                <div className={cn('flex rotate-3 items-center gap-1 rounded-md p-1.5 text-xs opacity-90 shadow-lg', CHIP_CLASS.Work)}>
                  <WorkIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{draggedName}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        <ul className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-xs" aria-label={t('calendar.legend.label')}>
          <li className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1', CHIP_CLASS.Work)}>
            <WorkIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {t('calendar.legend.work')}
          </li>
          <li className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1', CHIP_CLASS['Pre-assigned'])}>
            <PreAssignedIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {t('calendar.legend.preAssigned')}
          </li>
          <li className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1', CHIP_CLASS.Free)}>
            <FreeDayIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {t('calendar.legend.freeDay')}
          </li>
          <li className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1', CHIP_CLASS.Excluded)}>
            <ExcludedIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {t('calendar.legend.excluded')}
          </li>
          {units.length > 0 &&
            (
              [
                ['covered', 'calendar.legend.covered'],
                ['partial', 'calendar.legend.partial'],
                ['none', 'calendar.legend.uncovered'],
              ] as const
            ).map(([level, labelKey]) => (
              <li key={level} className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className={cn('inline-block h-2 w-2', COVERAGE_DOT_CLASS[level])} aria-hidden="true" />
                {t(labelKey)}
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}
