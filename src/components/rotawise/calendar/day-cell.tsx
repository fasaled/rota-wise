import { memo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Flag, Lock, Unlock, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ExcludedIcon, FreeDayIcon, PreAssignedIcon, WorkIcon } from '@/components/icons';
import type { DoctorProfile, ScheduleEntry, UnitCoverage } from '@/lib/types';
import { getAssignmentBlockReason } from '@/lib/schedule-eligibility';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';
import { CHIP_BASE, CHIP_CLASS } from './chips';
import { CoverageDots } from './coverage-dots';
import { PickerList, type PickerItem } from './picker-list';

/** Everything the calendar needs to draw one day, after filters. */
export interface DayModel {
  date: Date;
  /** `yyyy-MM-dd` */
  key: string;
  inMonth: boolean;
  /** Inside the schedule period; days outside it are read-only. */
  inRange: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  /** The day's shift, regardless of filters. */
  work: ScheduleEntry | null;
  /** The shift passes the active filters. */
  workVisible: boolean;
  /** No shift, and the filters do not hide shifts: offer to assign one. */
  canAssign: boolean;
  free: ScheduleEntry[];
  canEditFree: boolean;
  excluded: DoctorProfile[];
  coverage: UnitCoverage[];
}

export interface DayCellProps {
  day: DayModel;
  variant: 'grid' | 'agenda';
  doctors: DoctorProfile[];
  doctorMap: Map<string, DoctorProfile>;
  /** Every shift date of each doctor, for the eligibility rules. */
  workDatesByDoctor: Map<string, Date[]>;
  minInterval: number;
  holidays: Date[];
  canDrag: boolean;
  onSelectDoctor: (date: Date, doctorId: string) => void;
  onClearDay: (date: Date) => void;
  onToggleEntryFixed: (entry: ScheduleEntry, isFixed: boolean) => void;
  onToggleFreeDay: (date: Date, doctorId: string) => void;
}

const PICKER_CLASS = 'w-60 p-0';

function DoctorPicker({
  day,
  doctors,
  workDatesByDoctor,
  minInterval,
  holidays,
  onPick,
  onClear,
}: Pick<DayCellProps, 'day' | 'doctors' | 'workDatesByDoctor' | 'minInterval' | 'holidays'> & {
  onPick: (doctorId: string) => void;
  onClear: () => void;
}) {
  const { t } = useLanguage();
  const currentId = day.work?.doctorId;

  const items: PickerItem[] = doctors.map((doc) => {
    const otherShifts = (workDatesByDoctor.get(doc.id) ?? []).filter((d) => !isSameDay(d, day.date));
    const reason = getAssignmentBlockReason(doc, day.date, otherShifts, minInterval, holidays);
    const isCurrent = doc.id === currentId;
    return {
      id: doc.id,
      label: doc.name || t('calendar.unnamedDoctor'),
      selected: isCurrent,
      disabled: Boolean(reason) && !isCurrent,
      hint: reason ? t(`calendar.daySelector.reason.${reason}` as const) : undefined,
    };
  });

  return (
    <PickerList
      label={t('calendar.daySelector.placeholder')}
      items={items}
      onPick={onPick}
      searchPlaceholder={t('calendar.daySelector.searchPlaceholder')}
      emptyText={t('calendar.daySelector.noResults')}
      header={
        day.work ? (
          <button
            type="button"
            onClick={onClear}
            className="flex w-full items-center gap-2 border-b px-2.5 py-1.5 text-sm text-destructive hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {t('calendar.daySelector.clear')}
          </button>
        ) : null
      }
    />
  );
}

/** The day's shift: a chip that opens the doctor picker and can be dragged. */
function WorkSlot(props: DayCellProps & { dateLabel: string }) {
  const { day, doctorMap, canDrag, variant, onSelectDoctor, onClearDay, dateLabel } = props;
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const entry = day.work;
  const editable = !!entry && entry.assignment === 'Work' && !entry.isFixed;
  const draggable = editable && canDrag && variant === 'grid';

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `shift-${day.key}`,
    disabled: !draggable,
    data: { entry },
  });

  if (entry && !day.workVisible) return null;
  if (!entry && !day.canAssign) return null;

  const name = entry ? (doctorMap.get(entry.doctorId)?.name ?? t('calendar.removedDoctor')) : '';
  const Icon = entry?.assignment === 'Pre-assigned' ? PreAssignedIcon : WorkIcon;

  // Pre-assigned and pinned shifts are read-only here.
  if (entry && !editable) {
    return (
      <div
        className={cn(CHIP_BASE, CHIP_CLASS[entry.assignment === 'Pre-assigned' ? 'Pre-assigned' : 'Work'])}
        title={t(`assignmentType.${entry.assignment}` as 'assignmentType.Work')}
      >
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{name}</span>
      </div>
    );
  }

  const pick = (doctorId: string) => {
    setOpen(false);
    if (doctorId !== entry?.doctorId) onSelectDoctor(day.date, doctorId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {entry ? (
          <button
            type="button"
            ref={setNodeRef}
            {...(draggable ? listeners : {})}
            {...(draggable ? { 'aria-roledescription': attributes['aria-roledescription'] } : {})}
            aria-label={t('calendar.shift.change', { doctor: name, date: dateLabel })}
            title={draggable ? t('calendar.shift.dragHint') : undefined}
            className={cn(
              CHIP_BASE,
              CHIP_CLASS.Work,
              draggable ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer',
              isDragging && 'opacity-40',
            )}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{name}</span>
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('calendar.shift.assign', { date: dateLabel })}
            className={cn(
              CHIP_BASE,
              'cursor-pointer border border-dashed border-amber-400/70 bg-amber-50/60 italic text-amber-900 hover:bg-amber-100/70',
              'dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/60',
            )}
          >
            <WorkIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('calendar.daySelector.placeholder')}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_CLASS}>
        <DoctorPicker
          {...props}
          onPick={pick}
          onClear={() => {
            setOpen(false);
            onClearDay(day.date);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Free-day chips of the day; the whole block opens a multi-select of doctors. */
function FreeDaySlot({ day, doctors, doctorMap, onToggleFreeDay, dateLabel }: DayCellProps & { dateLabel: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  if (!day.canEditFree && day.free.length === 0) return null;

  const freeIds = new Set(day.free.map((e) => e.doctorId));
  const chips = day.free.map((entry) => (
    <span key={entry.doctorId} className={cn(CHIP_BASE, CHIP_CLASS.Free)}>
      <FreeDayIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{doctorMap.get(entry.doctorId)?.name ?? t('calendar.removedDoctor')}</span>
    </span>
  ));

  if (!day.canEditFree) return <div className="space-y-0.5">{chips}</div>;

  const items: PickerItem[] = doctors.map((doc) => ({
    id: doc.id,
    label: doc.name || t('calendar.unnamedDoctor'),
    selected: freeIds.has(doc.id),
  }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('calendar.freeDay.edit', { date: dateLabel })}
          className={cn(
            'block w-full cursor-pointer space-y-0.5 rounded-sm text-left',
            day.free.length === 0 && 'reveal-on-hover',
          )}
        >
          {day.free.length > 0 ? (
            chips
          ) : (
            <span className={cn(CHIP_BASE, 'border border-dashed border-muted-foreground/25 italic text-muted-foreground')}>
              <FreeDayIcon className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
              <span className="truncate">{t('calendar.freeDay.add')}</span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={PICKER_CLASS}>
        <PickerList
          label={t('calendar.freeDay.edit', { date: dateLabel })}
          items={items}
          multiple
          onPick={(doctorId) => onToggleFreeDay(day.date, doctorId)}
          searchPlaceholder={t('calendar.daySelector.searchPlaceholder')}
          emptyText={t('calendar.daySelector.noResults')}
        />
      </PopoverContent>
    </Popover>
  );
}

function LockToggle({ entry, onToggle }: { entry: ScheduleEntry; onToggle: DayCellProps['onToggleEntryFixed'] }) {
  const { t } = useLanguage();
  const fixed = Boolean(entry.isFixed);
  const label = fixed ? t('calendar.toggleFixed.tooltip.unlock') : t('calendar.toggleFixed.tooltip.lock');
  return (
    <button
      type="button"
      aria-pressed={fixed}
      aria-label={label}
      title={label}
      onClick={() => onToggle(entry, !fixed)}
      className={cn(
        'shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground',
        fixed ? 'text-foreground' : 'reveal-on-hover',
      )}
    >
      {fixed ? <Lock className="h-3 w-3" aria-hidden="true" /> : <Unlock className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

function DayCellImpl(props: DayCellProps) {
  const { day, variant, onToggleEntryFixed } = props;
  const { t, currentDateFnsLocale } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.key}`,
    disabled: !day.inRange || variant === 'agenda',
    data: { date: day.date },
  });

  const dateLabel = format(day.date, 'PPPP', { locale: currentDateFnsLocale });
  const showLock = day.work && day.workVisible && day.work.assignment === 'Work';

  const holidayMark = day.isHoliday && (
    <span className="inline-flex shrink-0" role="img" title={t('calendar.holiday.tooltip')} aria-label={t('calendar.holiday.tooltip')}>
      <Flag className="h-3 w-3 text-amber-500" aria-hidden="true" />
    </span>
  );

  const body = day.inRange && (
    <>
      {!day.isHoliday && <CoverageDots coverage={day.coverage} />}
      <WorkSlot {...props} dateLabel={dateLabel} />
      <div className={cn('mt-1 space-y-0.5', variant === 'grid' && 'min-h-0 flex-1 overflow-y-auto')}>
        <FreeDaySlot {...props} dateLabel={dateLabel} />
        {day.excluded.map((doctor) => (
          <div
            key={doctor.id}
            className={cn(CHIP_BASE, CHIP_CLASS.Excluded)}
            title={t('calendar.excludedDay.tooltip', { doctorName: doctor.name })}
          >
            <ExcludedIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{doctor.name}</span>
          </div>
        ))}
      </div>
    </>
  );

  if (variant === 'agenda') {
    return (
      <li
        className={cn(
          'group flex gap-3 rounded-md border p-2',
          day.isWeekend || day.isHoliday ? 'bg-muted/40' : 'bg-card',
          day.isToday && 'border-primary/50 ring-1 ring-primary/30',
        )}
      >
        <div className="flex w-11 shrink-0 flex-col items-center gap-0.5 pt-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {format(day.date, 'EEE', { locale: currentDateFnsLocale }).replace(/\.$/, '')}
          </span>
          <time
            dateTime={day.key}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
              day.isToday && 'bg-primary text-primary-foreground',
            )}
          >
            {format(day.date, 'd')}
          </time>
          <span className="flex items-center gap-1">
            {holidayMark}
            {showLock && <LockToggle entry={day.work!} onToggle={onToggleEntryFixed} />}
          </span>
        </div>
        <div className="min-w-0 flex-1">{body}</div>
      </li>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex h-28 flex-col overflow-hidden rounded-md border p-1.5 md:h-32 lg:h-36',
        !day.inRange
          ? 'border-dashed bg-muted/20 text-muted-foreground/50'
          : day.isWeekend || day.isHoliday
            ? 'bg-muted/40'
            : 'bg-card',
        day.inRange && !day.inMonth && 'opacity-60',
        day.inRange && 'transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-sm',
        day.isToday && 'border-primary/50 ring-1 ring-primary/30',
        isOver && 'bg-blue-50 ring-2 ring-blue-500/50 dark:bg-blue-900/20',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-1 text-xs md:text-sm">
        <span className="flex shrink-0 items-center gap-0.5">
          <time
            dateTime={day.key}
            aria-label={dateLabel}
            className={cn(
              day.inMonth && day.inRange && 'font-medium',
              day.isToday && 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground',
            )}
          >
            {format(day.date, 'd')}
          </time>
          {holidayMark}
        </span>
        {showLock && <LockToggle entry={day.work!} onToggle={onToggleEntryFixed} />}
      </div>
      {body}
    </div>
  );
}

export const DayCell = memo(DayCellImpl);
