

import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO, addDays, differenceInCalendarDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, CalendarDays as CalendarIconLucide, Lock, Unlock, X, Check, Briefcase, Star } from 'lucide-react';
import { CalendarFilterBar, type ActiveFilter } from './calendar-filter-bar';
import type { Schedule, DoctorProfile, DayDetails, ScheduleEntry, Unit, UnitCoverage } from '@/lib/types';
import { computeUnitCoverageForDate } from '@/lib/schedule-coverage';
import { cn } from '@/lib/utils';
import { FreeDayIcon, PreAssignedIcon, WorkIcon, ExcludedIcon } from '@/components/icons';
import { useLanguage } from '@/context/language-context';
import type { InfoBarMessage } from '@/hooks/use-info-bar';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';

interface ScheduleCalendarViewProps {
  schedule: Schedule;
  doctors: DoctorProfile[];
  units: Unit[];
  holidays?: Date[];
  onUpdateScheduleEntry: (updatedEntry: ScheduleEntry, oldDate?: Date) => void;
  onSwapScheduleEntries?: (entry1: ScheduleEntry, entry2: ScheduleEntry, oldDate1?: Date, oldDate2?: Date) => void;
  onArbitraryScheduleEntry?: (updatedEntry: ScheduleEntry) => void;
  minIntervalBetweenWorkDays: number;
  allScheduleEntries: ScheduleEntry[];
  onToggleMonthFixed?: (month: Date, isFixed: boolean) => void;
  onToggleEntryFixed?: (entry: ScheduleEntry, isFixed: boolean) => void;
  onRemoveWorkEntriesForDate?: (date: Date) => void;
  onNotify?: (msg: Omit<InfoBarMessage, 'id'>) => void;
  onToggleFreeDay?: (date: Date, doctorId: string) => void;
  activeFilters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

const doctorChipBaseClass = "w-full rounded-sm flex items-center p-1.5 text-xs";

function getChipStyle(assignment: ScheduleEntry['assignment']): React.CSSProperties {
  switch (assignment) {
    case 'Work':
      return {
        backgroundColor: 'var(--chip-work-bg)',
        color: 'var(--chip-work-text)',
        border: '1px solid var(--chip-work-border)',
      };
    case 'Pre-assigned':
      return {
        backgroundColor: 'var(--chip-preassigned-bg)',
        color: 'var(--chip-preassigned-text)',
        border: '1px solid var(--chip-preassigned-border)',
      };
    case 'Free':
      return {
        backgroundColor: 'var(--chip-free-bg)',
        color: 'var(--chip-free-text)',
        border: '1px solid var(--chip-free-border)',
      };
    case 'Excluded':
      return {
        backgroundColor: 'var(--muted)',
        color: 'var(--muted-foreground)',
        border: '2px dashed var(--foreground)',
      };
    default:
      return {};
  }
}

interface DayCellProps {
  day: DayDetails;
  doctors: DoctorProfile[];
  doctorMap: Map<string, DoctorProfile>;
  activeFilters: ActiveFilter[];
  allScheduleEntries: ScheduleEntry[];
  onToggleEntryFixed?: (entry: ScheduleEntry, isFixed: boolean) => void;
  onSelectDoctor: (date: Date, doctorId: string) => void;
  onClearDayAssignment: (date: Date) => void;
  minIntervalBetweenWorkDays: number;
  openSelectorDate: string | null;
  onOpenSelectorChange: (key: string | null) => void;
  unitCoverageForDay: UnitCoverage[];
  isHoliday: boolean;
  freeDayOpenDate: string | null;
  onFreeDayOpenChange: (key: string | null) => void;
  onToggleFreeDay?: (date: Date, doctorId: string) => void;
  allDoctors: DoctorProfile[];
}

// One cell of the calendar grid. Extracted as a real React component so that
// `useRef` for the dropdown trigger is a legitimate hook (the previous inline
// `renderDayCell` function called `useRef` from inside a .map, which violated
// the Rules of Hooks and crashed the whole app when month changed).
const DayCell: React.FC<DayCellProps> = ({
  day,
  doctors,
  doctorMap,
  activeFilters,
  allScheduleEntries,
  onToggleEntryFixed,
  onSelectDoctor,
  onClearDayAssignment,
  minIntervalBetweenWorkDays,
  openSelectorDate,
  onOpenSelectorChange,
  unitCoverageForDay,
  isHoliday,
  freeDayOpenDate,
  onFreeDayOpenChange,
  onToggleFreeDay,
  allDoctors,
}) => {
  const { t } = useLanguage();
  const triggerButtonRef = useRef<HTMLDivElement>(null);
  const freeDayTriggerRef = useRef<HTMLDivElement>(null);

  const dateTextClasses = day.isCurrentMonth ? "font-medium" : "text-muted-foreground/70";
  const todayMarkerClasses = day.isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "";
  const workEntryForDay = day.assignments.find((e) => e.assignment === 'Work' || e.assignment === 'Pre-assigned') ?? null;
  const selectorKey = format(day.date, 'yyyy-MM-dd');
  const isSelectorOpen = openSelectorDate === selectorKey;
  const isFreeDayOpen = freeDayOpenDate === selectorKey;
  const isPreAssigned = workEntryForDay?.assignment === 'Pre-assigned';
  const isDayFixed = workEntryForDay?.isFixed ?? false;
  const isEditable = !isDayFixed;

  const freeDayEntries = day.assignments.filter((e) => e.assignment === 'Free');
  const excludedEntries = day.assignments.filter((e) => e.assignment === 'Excluded');

  // Check if the current filter allows showing the doctor selector for this day
  const assignmentTypeFilters = activeFilters.filter(f => f.type === 'assignment').map(f => f.value);
  const filterAllowsWork = assignmentTypeFilters.length === 0 || assignmentTypeFilters.includes('Work');
  // Day has ANY Work/Pre-assigned entry in the unfiltered schedule?
  const hasAnyWorkEntry = allScheduleEntries.some(e =>
    isSameDay(e.date, day.date) &&
    (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
  );
  // Day has a Pre-assigned entry? (Pre-assigned days never show the empty selector)
  const hasPreAssignedEntry = allScheduleEntries.some(e =>
    isSameDay(e.date, day.date) && e.assignment === 'Pre-assigned'
  );
  const showEmptySelector = !workEntryForDay && !hasAnyWorkEntry && !hasPreAssignedEntry && filterAllowsWork;

  const workChipStyle = getChipStyle('Work');
  const currentDoctor = workEntryForDay ? doctorMap.get(workEntryForDay.doctorId) : null;

  return (
    <Fragment>
      <DroppableDayCell
        day={day}
        isHoliday={isHoliday}
        onDayClick={(e) => e.stopPropagation()}
      >
        {/* Top line: date number and lock button */}
        <div className="text-xs md:text-sm mb-1 flex items-center justify-between gap-1">
          <span className={cn(dateTextClasses, todayMarkerClasses, "shrink-0 flex items-center gap-0.5")}>
            {format(day.date, 'd')}
            {isHoliday && (
              <span
                className="inline-flex shrink-0"
                title={t('calendar.holiday.tooltip')}
                aria-label={t('calendar.holiday.tooltip')}
              >
                <Star className="h-3 w-3 text-amber-500" />
              </span>
            )}
          </span>
          {workEntryForDay && !isPreAssigned && onToggleEntryFixed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleEntryFixed(workEntryForDay, !workEntryForDay.isFixed);
              }}
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
              title={isDayFixed ? t('calendar.toggleFixed.tooltip.unlock') : t('calendar.toggleFixed.tooltip.lock')}
            >
              {isDayFixed ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            </button>
          )}
        </div>
        {/* Unit coverage dots: hidden on weekends AND on holidays. Holidays
            are like weekends for coverage purposes, so we don't render
            the dots — the day already shows visually as a holiday via the
            star icon + background. */}
        {!isHoliday && unitCoverageForDay.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-1" aria-label={t('calendar.coverage.legend')}>
            {unitCoverageForDay.map((c) => {
              // Three states for a tracked unit: full coverage (green),
              // partial coverage (amber — some doctors available but not
              // enough), or no coverage at all (red). Ignored units (min=0)
              // are always neutral grey.
              const color =
                c.status === 'ignored'
                  ? 'bg-zinc-300 dark:bg-zinc-600'
                  : c.available === 0
                    ? 'bg-rose-500'
                    : c.isCovered
                      ? 'bg-emerald-500'
                      : 'bg-amber-500';
              // The tooltip is just the available/minimum ratio. The dot
              // colour (green / amber / red / grey) already conveys the
              // status; adding explanatory text on top of that is redundant.
              const allies =
                c.alliedUnitNames && c.alliedUnitNames.length > 0
                  ? ` (${t('calendar.coverage.tooltipAllies', { allies: c.alliedUnitNames.join(', ') })})`
                  : '';
              const tooltip =
                (c.status === 'ignored'
                  ? t('calendar.coverage.tooltipUntracked', { unit: c.unitName })
                  : t(
                      c.isCovered
                        ? 'calendar.coverage.tooltipCovered'
                        : 'calendar.coverage.tooltipUncovered',
                      { unit: c.unitName, available: c.available, min: c.min },
                    )) + allies;
              return (
                <span
                  key={c.unitId}
                  // The dot itself is only 8×8px which is hard to hover; the
                  // `p-1` halo and `cursor-help` give the user a generous hit
                  // target and signal that the dot is informational, without
                  // changing the visual size of the dot.
                  className={cn(
                    "relative inline-flex h-2 w-2 cursor-help items-center justify-center rounded-full ring-1 ring-black/5 dark:ring-white/10",
                    "before:absolute before:inset-[-6px] before:content-['']",
                    color,
                  )}
                  title={tooltip}
                  aria-label={tooltip}
                />
              );
            })}
          </div>
        )}
        {/* Second line: doctor name as chip */}
        {workEntryForDay ? (
          isPreAssigned ? (
            <div
              ref={triggerButtonRef}
              className={doctorChipBaseClass}
              style={getChipStyle('Pre-assigned')}
            >
              <Briefcase className="shrink-0 w-3 h-3 mr-1" />
              <span className="truncate">{currentDoctor?.name}</span>
            </div>
          ) : isEditable ? (
            <DraggableWorkEntry
              entry={workEntryForDay}
              doctor={currentDoctor ?? undefined}
              IconComponent={Briefcase}
              chipStyle={workChipStyle}
              assignmentText={t(`assignmentType.${workEntryForDay.assignment}` as any)}
              onEdit={(e) => { e.stopPropagation(); onOpenSelectorChange(isSelectorOpen ? null : selectorKey); }}
              isFilteredByDoctor={activeFilters.some(f => f.type === 'doctor')}
              externalRef={triggerButtonRef}
            />
          ) : (
            <div
              ref={triggerButtonRef}
              className={doctorChipBaseClass}
              style={workChipStyle}
            >
              <Briefcase className="shrink-0 w-3 h-3 mr-1" />
              <span className="truncate">{currentDoctor?.name}</span>
            </div>
          )
        ) : showEmptySelector ? (
          <DayDoctorTriggerButton
            ref={triggerButtonRef}
            isOpen={isSelectorOpen}
            onClick={(e) => { e.stopPropagation(); onOpenSelectorChange(isSelectorOpen ? null : selectorKey); }}
            placeholder={t('calendar.daySelector.placeholder')}
            isPreAssigned={false}
          />
        ) : null}
        {/* Scrollable area for free days + excluded days */}
        <div className="flex-1 min-h-0 mt-1 overflow-y-auto space-y-0.5">
          {/* Free day chips — clickable to open multi-select */}
          <div
            ref={freeDayTriggerRef}
            className="space-y-0.5 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onFreeDayOpenChange(isFreeDayOpen ? null : selectorKey); }}
          >
            {freeDayEntries.length > 0 ? (
              freeDayEntries.map((entry) => {
                const doctor = doctorMap.get(entry.doctorId);
                return (
                  <div
                    key={entry.doctorId}
                    className="flex items-center gap-1 rounded-sm p-1.5 text-xs"
                    style={getChipStyle(entry.assignment)}
                  >
                    <FreeDayIcon className="shrink-0 w-3 h-3" />
                    <span className="truncate">{doctor?.name || entry.doctorId}</span>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center gap-1 rounded-sm p-1.5 text-muted-foreground italic text-xs border border-dashed border-muted-foreground/20">
                <FreeDayIcon className="shrink-0 w-3 h-3 opacity-50" />
                <span>{t('calendar.freeDay.add')}</span>
              </div>
            )}
          </div>

          {/* Excluded chips — same format, read-only */}
          {excludedEntries.length > 0 && (
            <div className="space-y-0.5">
              {excludedEntries.map((entry) => {
                const doctor = doctorMap.get(entry.doctorId);
                return (
                  <div
                    key={entry.doctorId}
                    className="flex items-center gap-1 rounded-sm p-1.5 text-xs bg-muted/50 text-muted-foreground border border-muted-foreground/15"
                  >
                    <ExcludedIcon className="shrink-0 w-3 h-3" />
                    <span className="truncate">{doctor?.name || entry.doctorId}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DroppableDayCell>
      <DayDoctorDropdown
        doctors={doctors}
        scheduleEntries={allScheduleEntries}
        date={day.date}
        currentEntry={workEntryForDay}
        isOpen={isSelectorOpen}
        triggerRef={triggerButtonRef}
        onOpenChange={(open) => onOpenSelectorChange(open ? selectorKey : null)}
        onSelect={(doctorId) => onSelectDoctor(day.date, doctorId)}
        onClear={() => onClearDayAssignment(day.date)}
        minIntervalBetweenWorkDays={minIntervalBetweenWorkDays}
      />
      <FreeDayDoctorSelector
        doctors={allDoctors}
        date={day.date}
        freeDayDoctorIds={new Set(freeDayEntries.map((e) => e.doctorId))}
        isOpen={isFreeDayOpen}
        triggerRef={freeDayTriggerRef}
        onOpenChange={(open) => onFreeDayOpenChange(open ? selectorKey : null)}
        onToggleFreeDay={(doctorId) => onToggleFreeDay?.(day.date, doctorId)}
      />
    </Fragment>
  );
};

interface DraggableWorkEntryProps {
  entry: ScheduleEntry;
  doctor: DoctorProfile | undefined;
  IconComponent: React.ComponentType<{ className?: string }>;
  chipStyle: React.CSSProperties;
  assignmentText: string;
  onEdit?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  isFilteredByDoctor?: boolean;
  externalRef?: React.RefObject<HTMLDivElement | null>;
}

const DraggableWorkEntry: React.FC<DraggableWorkEntryProps> = ({
  entry,
  doctor,
  IconComponent,
  chipStyle,
  assignmentText,
  onEdit,
  isFilteredByDoctor,
  externalRef,
}) => {
  // Only allow dragging 'Work' (or 'Pre-assigned' in metadata mode) that are not fixed, and only when viewing all doctors
  const isDraggable = !entry.isFixed && !isFilteredByDoctor;
  // Every chip needs a unique id — sharing 'non-draggable' across chips confuses dnd-kit
  const dragId = `chip-${entry.doctorId}-${entry.date.getTime()}-${entry.assignment}`;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: dragId,
    disabled: !isDraggable,
    data: {
      type: 'work-entry',
      entry,
    },
  });

  // Combine external ref with dnd ref
  const setNodeRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    if (externalRef) {
      (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
  };

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 1000 : undefined,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...chipStyle,
      }}
      className={cn(
        doctorChipBaseClass,
        !onEdit ? "cursor-default" : isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "shadow-lg"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onEdit?.(e);
      }}
      title={`${doctor?.name || entry.doctorId}: ${assignmentText}${entry.isFixed ? ' (Fixed)' : ''}${isDraggable ? ' (Draggable)' : ''}${isFilteredByDoctor ? ' (Filtering active)' : ''}`}
      {...(isDraggable ? { ...attributes, ...listeners } : {})}
    >
      {IconComponent && <IconComponent className="shrink-0 w-3 h-3 mr-1" />}
      <span className="truncate">{doctor?.name || entry.doctorId}</span>
    </div>
  );
};

interface DroppableDayCellProps {
  day: DayDetails;
  isHoliday: boolean;
  children: React.ReactNode;
  onDayClick: (e: React.MouseEvent) => void;
}

const DroppableDayCell: React.FC<DroppableDayCellProps> = ({ day, isHoliday, children, onDayClick }) => {
  const dropId = `day-${day.date.getTime()}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: {
      type: 'day',
      date: day.date,
    },
  });

  const cellBaseClasses = "h-28 md:h-32 lg:h-36 p-1.5 border flex flex-col overflow-hidden rounded-md";
  const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

  return (
    <div
      ref={setNodeRef}
      key={day.date.toString()}
      className={cn(
        cellBaseClasses,
        day.isCurrentMonth
          ? isWeekend || isHoliday ? 'bg-muted/40' : 'bg-card'
          : 'bg-muted/30 [&>*]:opacity-60',
        day.isToday && 'border-primary/50 ring-1 ring-primary/30',
        "cursor-pointer hover:border-primary/40 hover:shadow-sm transition-[border-color,box-shadow] duration-200",
        isOver && "ring-2 ring-blue-500 ring-opacity-50 bg-blue-50 dark:bg-blue-900/20"
      )}
      onClick={onDayClick}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  );
};

interface DayDoctorDropdownProps {
  doctors: DoctorProfile[];
  scheduleEntries: ScheduleEntry[];
  date: Date;
  currentEntry: ScheduleEntry | null;
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onSelect: (doctorId: string) => void;
  onClear: () => void;
  minIntervalBetweenWorkDays: number;
}

function isDoctorAvailable(
  doctor: DoctorProfile,
  date: Date,
  scheduleEntries: ScheduleEntry[],
  minInterval: number,
): { available: boolean; reason?: string } {
  if (doctor.freeDates.some(freeDay => isSameDay(freeDay, date))) {
    return { available: false, reason: 'freeDay' };
  }
  if ((doctor.excludedDates || []).some(exDate => isSameDay(exDate, date))) {
    return { available: false, reason: 'excluded' };
  }

  const dayBefore = addDays(date, -1);
  const dayAfter = addDays(date, 1);

  const hasWorkNear = (d: Date) => scheduleEntries.some(e =>
    e.doctorId === doctor.id &&
    (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
    isSameDay(e.date, d)
  );

  if (minInterval > 0) {
    if (hasWorkNear(date)) {
      return { available: false, reason: 'interval' };
    }
    for (let i = 1; i <= minInterval; i++) {
      if (hasWorkNear(addDays(date, -i)) || hasWorkNear(addDays(date, i))) {
        return { available: false, reason: 'interval' };
      }
    }
  } else {
    if (hasWorkNear(dayBefore) || hasWorkNear(dayAfter)) {
      return { available: false, reason: 'interval' };
    }
  }

  return { available: true };
}

interface DayDoctorDropdownProps {
  doctors: DoctorProfile[];
  scheduleEntries: ScheduleEntry[];
  date: Date;
  currentEntry: ScheduleEntry | null;
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onSelect: (doctorId: string) => void;
  onClear: () => void;
  minIntervalBetweenWorkDays: number;
}

interface DayDoctorTriggerButtonProps {
  isOpen: boolean;
  onClick: (e: React.MouseEvent) => void;
  placeholder: string;
  isPreAssigned: boolean;
}

const DayDoctorTriggerButton = React.forwardRef<HTMLDivElement, DayDoctorTriggerButtonProps>(
  ({ isOpen, onClick, placeholder }, ref) => {
    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-1 p-1.5 rounded-sm text-xs mb-1 border border-dashed border-muted-foreground/30 text-muted-foreground italic cursor-pointer hover:opacity-80 transition-opacity",
          isOpen && "ring-1 ring-ring",
        )}
      >
        <Briefcase className="h-3 w-3 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
        <span className="truncate flex-1">{placeholder}</span>
      </div>
    );
  }
);
DayDoctorTriggerButton.displayName = 'DayDoctorTriggerButton';

const DayDoctorDropdown: React.FC<DayDoctorDropdownProps> = ({
  doctors,
  scheduleEntries,
  date,
  currentEntry,
  isOpen,
  triggerRef,
  onOpenChange,
  onSelect,
  onClear,
}) => {
  const { t } = useLanguage();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchText, setSearchText] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number; width: number; placement: 'top' | 'bottom' } | null>(null);

  useLayoutEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placement: 'top' | 'bottom' = spaceAbove > spaceBelow && spaceAbove > dropdownHeight ? 'top' : 'bottom';

      setPosition({
        top: placement === 'top' ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 200),
        placement,
      });
    } else {
      setPosition(null);
    }
  }, [isOpen, searchText, triggerRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        onOpenChange(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onOpenChange, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e: Event) => {
      // Don't close if scrolling inside the dropdown
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen, onOpenChange]);

  const minInterval = useMemo(() => {
    const dates = scheduleEntries
      .filter(e => e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      .map(e => e.date);
    if (dates.length < 2) return 0;
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    let minDiff = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      const diff = differenceInCalendarDays(sorted[i], sorted[i - 1]);
      if (diff < minDiff) minDiff = diff;
    }
    return Number.isFinite(minDiff) ? Math.max(0, minDiff - 1) : 0;
  }, [scheduleEntries]);

  const annotated = useMemo(() => {
    return doctors.map(doc => {
      const { available, reason } = isDoctorAvailable(doc, date, scheduleEntries, minInterval);
      return { doc, available, reason };
    });
  }, [doctors, date, scheduleEntries, minInterval]);

  const filtered = annotated.filter(a =>
    a.doc.name.toLowerCase().includes(searchText.toLowerCase())
  );

  if (!isOpen || !position) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[1000] rounded-md border bg-popover shadow-lg text-popover-foreground"
      style={{
        top: position.placement === 'top' ? position.top - 4 : position.top,
        left: position.left,
        width: position.width,
        transform: position.placement === 'top' ? 'translateY(-100%)' : undefined,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="px-2 py-1.5 border-b">
        <input
          autoFocus
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder={t('calendar.daySelector.searchPlaceholder')}
          className="w-full text-xs outline-none bg-transparent placeholder:text-muted-foreground"
        />
      </div>
      <div className="overflow-y-auto max-h-64">
        <div className="py-1">
          {currentEntry && (
            <button
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-destructive hover:bg-muted transition-colors border-b"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
                onOpenChange(false);
              }}
            >
              <X className="h-3 w-3" />
              {t('calendar.daySelector.clear')}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('calendar.daySelector.noResults')}</p>
          ) : (
            filtered.map(({ doc, available, reason }) => {
              const isCurrent = currentEntry?.doctorId === doc.id;
              return (
                <button
                  key={doc.id}
                  disabled={!available && !isCurrent}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-xs transition-colors text-left",
                    isCurrent ? "bg-accent" : available ? "hover:bg-muted" : "opacity-50 cursor-not-allowed",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (available || isCurrent) {
                      onSelect(doc.id);
                      onOpenChange(false);
                    }
                  }}
                >
                  <span className="truncate">{doc.name}</span>
                  {isCurrent ? (
                    <Check className="h-3 w-3 text-primary shrink-0" />
                  ) : !available && reason ? (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {reason === 'freeDay' && t('calendar.daySelector.reason.freeDay')}
                      {reason === 'excluded' && t('calendar.daySelector.reason.excluded')}
                      {reason === 'interval' && t('calendar.daySelector.reason.interval')}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

interface FreeDayDoctorSelectorProps {
  doctors: DoctorProfile[];
  date: Date;
  freeDayDoctorIds: Set<string>;
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onToggleFreeDay: (doctorId: string) => void;
}

const FreeDayDoctorSelector: React.FC<FreeDayDoctorSelectorProps> = ({
  doctors,
  date: _date,
  freeDayDoctorIds,
  isOpen,
  triggerRef,
  onOpenChange,
  onToggleFreeDay,
}) => {
  const { t } = useLanguage();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchText, setSearchText] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number; width: number; placement: 'top' | 'bottom' } | null>(null);

  useLayoutEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placement: 'top' | 'bottom' = spaceAbove > spaceBelow && spaceAbove > dropdownHeight ? 'top' : 'bottom';

      setPosition({
        top: placement === 'top' ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 200),
        placement,
      });
    } else {
      setPosition(null);
    }
  }, [isOpen, searchText, triggerRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        onOpenChange(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onOpenChange, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen, onOpenChange]);

  const filtered = useMemo(() => {
    return doctors.filter(doc =>
      doc.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [doctors, searchText]);

  if (!isOpen || !position) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[1000] rounded-md border bg-popover shadow-lg text-popover-foreground"
      style={{
        top: position.placement === 'top' ? position.top - 4 : position.top,
        left: position.left,
        width: position.width,
        transform: position.placement === 'top' ? 'translateY(-100%)' : undefined,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="px-2 py-1.5 border-b">
        <input
          autoFocus
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder={t('calendar.daySelector.searchPlaceholder')}
          className="w-full text-xs outline-none bg-transparent placeholder:text-muted-foreground"
        />
      </div>
      <div className="overflow-y-auto max-h-64">
        <div className="py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('calendar.daySelector.noResults')}</p>
          ) : (
            filtered.map((doc) => {
              const isFree = freeDayDoctorIds.has(doc.id);
              return (
                <label
                  key={doc.id}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs transition-colors cursor-pointer hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={isFree}
                    onChange={() => onToggleFreeDay(doc.id)}
                    className="h-3.5 w-3.5 accent-primary shrink-0"
                  />
                  <span className="truncate">{doc.name}</span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
    schedule,
    doctors,
    units,
    holidays = [],
    onUpdateScheduleEntry,
    onSwapScheduleEntries,
    onArbitraryScheduleEntry: _onArbitraryScheduleEntry,
    minIntervalBetweenWorkDays,
    allScheduleEntries,
    onToggleMonthFixed,
    onToggleEntryFixed,
    onRemoveWorkEntriesForDate,
    onNotify,
    onToggleFreeDay,
    activeFilters,
    onFiltersChange,
  }) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(schedule.startDate || new Date());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedEntry, setDraggedEntry] = useState<ScheduleEntry | null>(null);

  const [openSelectorDate, setOpenSelectorDate] = useState<string | null>(null);
  const [freeDayOpenDate, setFreeDayOpenDate] = useState<string | null>(null);

  const isDoctorBlockedOnDate = (doctorId: string, date: Date): { blocked: boolean; reason: string | undefined } => {
    const doctor = doctors.find(d => d.id === doctorId);
    if (!doctor) return { blocked: false, reason: undefined };

    const isFreeDay = doctor.freeDates.some(freeDay => isSameDay(freeDay, date));
    if (isFreeDay) {
      return { blocked: true, reason: t('calendar.toast.cannotSwapExcludedDay.description', { doctorName: doctor.name, targetDate: format(date, 'PPP', { locale: currentDateFnsLocale }) }) };
    }

    const isExcluded = (doctor.excludedDates || []).some(exDate => isSameDay(exDate, date));
    if (isExcluded) {
      return { blocked: true, reason: t('calendar.toast.cannotSwapExcludedDay.description', { doctorName: doctor.name, targetDate: format(date, 'PPP', { locale: currentDateFnsLocale }) }) };
    }

    return { blocked: false, reason: undefined };
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(String(active.id));
    
    if (active.data.current?.type === 'work-entry') {
      setDraggedEntry(active.data.current.entry);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setDraggedEntry(null);

    if (!over || !active.data.current?.entry) {
      return;
    }

    // Don't allow drag-drop when filtering by a specific doctor
    if (activeFilters.some(f => f.type === 'doctor')) {
      onNotify?.({ severity: 'error', title: t('calendar.toast.filterDisablesDrag.title'), description: t('calendar.toast.filterDisablesDrag.description'), autoDismissMs: 4000 });
      return;
    }

    const draggedEntry = active.data.current.entry as ScheduleEntry;
    const targetDate = over.data.current?.date as Date;

    if (!targetDate || isSameDay(draggedEntry.date, targetDate)) {
      return;
    }

    // If the same doctor is already assigned on the target date, no change needed
    const sameDocOnTarget = schedule.entries.find(entry =>
      isSameDay(entry.date, targetDate) &&
      entry.doctorId === draggedEntry.doctorId &&
      (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')
    );
    if (sameDocOnTarget) {
      return;
    }

    // Check if the dragged entry is a 'Work' assignment and not fixed (only these can be dragged)
    const canDragAssignment = draggedEntry.assignment === 'Work';
    if (!canDragAssignment || draggedEntry.isFixed) {
      onNotify?.({ severity: 'error', title: t('calendar.toast.onlyWorkDraggable.title'), description: t('calendar.toast.onlyWorkDraggable.description'), autoDismissMs: 4000 });
      return;
    }

    // Check if target date has a fixed assignment that would conflict
    const existingFixedEntryOnTarget = schedule.entries.find(entry =>
      isSameDay(entry.date, targetDate) &&
      entry.isFixed &&
      (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')
    );

    if (existingFixedEntryOnTarget) {
      onNotify?.({ severity: 'error', title: t('calendar.toast.cannotMoveToFixed.title'), description: t('calendar.toast.cannotMoveToFixed.description'), autoDismissMs: 4000 });
      return;
    }

    // Find if there's already a work/pre-assigned entry on the target date
    const existingEntryOnTarget = schedule.entries.find(entry =>
      isSameDay(entry.date, targetDate) &&
      (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned') &&
      entry.doctorId !== draggedEntry.doctorId
    );

    if (existingEntryOnTarget) {
      // Prevent swapping with fixed entries
      if (existingEntryOnTarget.isFixed) {
        onNotify?.({ severity: 'error', title: t('calendar.toast.cannotSwapWithFixed.title'), description: t('calendar.toast.cannotSwapWithFixed.description'), autoDismissMs: 4000 });
        return;
      }

      // Prevent swapping with pre-assigned entries
      if (existingEntryOnTarget.assignment === 'Pre-assigned') {
        onNotify?.({ severity: 'error', title: t('calendar.toast.cannotSwapWithFixed.title'), description: t('calendar.toast.cannotSwapWithFixed.description'), autoDismissMs: 4000 });
        return;
      }

      // Prevent swap if either doctor would be assigned to an excluded/vacation day
      const draggedDoctorBlocked = isDoctorBlockedOnDate(draggedEntry.doctorId, targetDate);
      if (draggedDoctorBlocked.blocked) {
        onNotify?.({ severity: 'error', title: t('calendar.toast.cannotSwapExcludedDay.title'), description: draggedDoctorBlocked.reason, autoDismissMs: 5000 });
        return;
      }

      const targetDoctorBlocked = isDoctorBlockedOnDate(existingEntryOnTarget.doctorId, draggedEntry.date);
      if (targetDoctorBlocked.blocked) {
        onNotify?.({ severity: 'error', title: t('calendar.toast.cannotSwapExcludedDay.title'), description: targetDoctorBlocked.reason, autoDismissMs: 5000 });
        return;
      }

      // Swap the doctors
      const updatedDraggedEntry: ScheduleEntry = {
        ...draggedEntry,
        date: targetDate,
        dayOfWeek: format(targetDate, 'EEEE'),
      };

      const updatedExistingEntry: ScheduleEntry = {
        ...existingEntryOnTarget,
        date: draggedEntry.date,
        dayOfWeek: format(draggedEntry.date, 'EEEE'),
      };

      // Use atomic swap if available, otherwise fallback to two updates
      if (onSwapScheduleEntries) {
        // Pass old dates: draggedEntry was in draggedEntry.date, existingEntryOnTarget was in targetDate
        onSwapScheduleEntries(updatedDraggedEntry, updatedExistingEntry, draggedEntry.date, targetDate);
      } else {
        onUpdateScheduleEntry(updatedDraggedEntry);
        onUpdateScheduleEntry(updatedExistingEntry);
      }

      onNotify?.({ severity: 'success', title: t('calendar.toast.doctorsSwapped.title'), description: t('calendar.toast.doctorsSwapped.description'), autoDismissMs: 3000 });
    } else {
      // Prevent move to a date with a pre-assigned entry
      const preAssignedOnTarget = schedule.entries.find(entry =>
        isSameDay(entry.date, targetDate) && entry.assignment === 'Pre-assigned'
      );
      if (preAssignedOnTarget) {
        onNotify?.({ severity: 'error', title: t('calendar.toast.cannotSwapWithFixed.title'), description: t('calendar.toast.cannotSwapWithFixed.description'), autoDismissMs: 4000 });
        return;
      }

      // Prevent move if doctor would be assigned to an excluded/vacation day
      const doctorBlocked = isDoctorBlockedOnDate(draggedEntry.doctorId, targetDate);
      if (doctorBlocked.blocked) {
        onNotify?.({ severity: 'error', title: t('calendar.toast.cannotSwapExcludedDay.title'), description: doctorBlocked.reason, autoDismissMs: 5000 });
        return;
      }

      // Just move the doctor to the new date
      const updatedEntry: ScheduleEntry = {
        ...draggedEntry,
        date: targetDate,
        dayOfWeek: format(targetDate, 'EEEE'),
      };

      onUpdateScheduleEntry(updatedEntry, draggedEntry.date);

      onNotify?.({ severity: 'success', title: t('calendar.toast.doctorMoved.title'), description: t('calendar.toast.doctorMoved.description'), autoDismissMs: 3000 });
    }
  };

  const handleSelectDoctor = (date: Date, doctorId: string) => {
    const currentEntry = schedule.entries.find(e =>
      isSameDay(e.date, date) &&
      (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
    );
    const updatedEntry: ScheduleEntry = {
      date,
      doctorId,
      assignment: 'Work',
      dayOfWeek: format(date, 'EEEE', { locale: currentDateFnsLocale }),
      isFixed: currentEntry?.isFixed ?? false,
    };
    onUpdateScheduleEntry(updatedEntry, currentEntry ? currentEntry.date : undefined);
  };

  const handleClearDayAssignment = (date: Date) => {
    onRemoveWorkEntriesForDate?.(date);
  };

  const doctorMap = useMemo(() => {
    return new Map(doctors.map(doc => [doc.id, doc]));
  }, [doctors]);

    // Pre-compute per-day unit coverage. Keyed by yyyy-MM-dd.
    // The helper handles the post-call subtraction (a doctor who worked yesterday
    // is on post-call today and is not counted as available for their unit).
    // For dynamic recalculation, we depend on the schedule entries, the doctors
    // list, the units list, and the holidays list.
    const unitCoverageByDate = useMemo(() => {
      const map = new Map<string, UnitCoverage[]>();
      if (units.length === 0) return map;
      const cursor = new Date(schedule.startDate);
      const end = new Date(schedule.endDate);
      // Use allScheduleEntries for the post-call check, since that is the full set.
      while (cursor <= end) {
        const dayOfWeek = cursor.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = holidays.some((h) => isSameDay(h, cursor));
        if (!isWeekend && !isHoliday) {
          const coverage = computeUnitCoverageForDate(
            cursor,
            doctors,
            units,
            allScheduleEntries,
            { holidays },
          );
          map.set(format(cursor, 'yyyy-MM-dd'), coverage);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return map;
    }, [units, doctors, allScheduleEntries, schedule.startDate, schedule.endDate, holidays]);

  const daysInMonth = useMemo(() : DayDetails[] => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDateCal = startOfWeek(monthStart, { locale: currentDateFnsLocale });
    const endDateCal = endOfWeek(monthEnd, { locale: currentDateFnsLocale });

    return eachDayOfInterval({ start: startDateCal, end: endDateCal }).map(date => {
      let entriesForDay = schedule.entries.filter(entry =>
        isSameDay(entry.date instanceof Date ? entry.date : parseISO(entry.date as unknown as string), date)
      );

      const doctorIds = activeFilters.filter(f => f.type === 'doctor').map(f => f.value);
      const assignmentTypes = activeFilters.filter(f => f.type === 'assignment').map(f => f.value);

      if (doctorIds.length > 0)
        entriesForDay = entriesForDay.filter(e => doctorIds.includes(e.doctorId));

      entriesForDay = entriesForDay.filter(entry =>
          !(entry.doctorId === 'system' && entry.assignment === 'Off')
      );

      // Filter by assignment type: include entries whose assignment is in the filter
      // If no assignment filter is active, include all
      entriesForDay = entriesForDay.filter(e => {
        if (assignmentTypes.length === 0) return true;
        return assignmentTypes.includes(e.assignment);
      });

      const excludedEntriesForDay = doctors
            .filter(doc => doc.excludedDates?.some(exDate => isSameDay(exDate, date)))
            .filter(doc => doctorIds.length === 0 || doctorIds.includes(doc.id))
            .map(doc => ({
              date,
              doctorId: doc.id,
              assignment: 'Excluded' as const,
              dayOfWeek: format(date, 'EEEE', { locale: currentDateFnsLocale }),
              isFixed: false,
            }));

      const excludedEntriesToShow = assignmentTypes.length === 0 || assignmentTypes.includes('Excluded')
        ? excludedEntriesForDay
        : [];

      entriesForDay = [...entriesForDay, ...excludedEntriesToShow];

      entriesForDay.sort((a, b) => {
        const order: { [key: string]: number } = { 'Work': 0, 'Pre-assigned': 1, 'Free': 2, 'Excluded': 3 };
        return (order[a.assignment] ?? 99) - (order[b.assignment] ?? 99);
      });

      return {
        date,
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isSameDay(date, new Date()),
        assignments: entriesForDay,
        unitCoverage: unitCoverageByDate.get(format(date, 'yyyy-MM-dd')),
      };
    });
  }, [currentMonth, schedule.entries, activeFilters, currentDateFnsLocale, doctors, unitCoverageByDate]);

  const nextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const prevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));

  const weekDays = useMemo(() => {
    const firstDayOfWeek = startOfWeek(new Date(), { locale: currentDateFnsLocale });
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(firstDayOfWeek, i);
      return {
        label: format(d, 'EEE', { locale: currentDateFnsLocale }),
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      };
    });
  }, [currentDateFnsLocale]);

  const monthLabel = useMemo(() => {
    const label = format(currentMonth, 'MMMM yyyy', { locale: currentDateFnsLocale });
    // date-fns lowercases month names in Spanish; capitalize for display
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [currentMonth, currentDateFnsLocale]);

  const monthAllFixed = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const monthEntries = schedule.entries.filter(entry => {
      const entryDate = entry.date instanceof Date ? entry.date : parseISO(entry.date as unknown as string);
      return entryDate >= monthStart && entryDate <= monthEnd &&
             (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned');
    });
    if (monthEntries.length === 0) return false;
    return monthEntries.every(entry => entry.isFixed);
  }, [currentMonth, schedule.entries]);

  const handleToggleMonthFixed = () => {
    if (onToggleMonthFixed) {
      onToggleMonthFixed(currentMonth, !monthAllFixed);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-3 p-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <CalendarIconLucide className="w-5 h-5 text-primary shrink-0" /> {t('calendar.title')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth} aria-label={t('calendar.previousMonth')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-lg font-semibold w-44 text-center shrink-0 tabular-nums">
              {monthLabel}
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth} aria-label={t('calendar.nextMonth')}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            {onToggleMonthFixed && (
              <Button
                variant={monthAllFixed ? "default" : "outline"}
                size="sm"
                onClick={handleToggleMonthFixed}
                className="ml-2 w-36 justify-start"
                title={monthAllFixed ? t('calendar.unfixMonth') : t('calendar.fixMonth')}
              >
                {monthAllFixed ? <Unlock className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                {monthAllFixed ? t('calendar.unfixMonth') : t('calendar.fixMonth')}
              </Button>
            )}
          </div>
        </div>
        <CalendarFilterBar
          doctors={doctors}
          activeFilters={activeFilters}
          onFiltersChange={onFiltersChange}
        />
      </CardHeader>
      <CardContent className="p-2 sm:p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto">
            <div className="min-w-[448px]">
              <div className="grid grid-cols-7 gap-1 text-center font-semibold uppercase tracking-wider text-muted-foreground text-[11px] mb-2">
                {weekDays.map(day => (
                  <div key={day.label} className={cn(day.isWeekend && "text-muted-foreground/60")}>
                    {day.label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {daysInMonth.map((day) => (
                  <DayCell
                    key={day.date.toString()}
                    day={day}
                    doctors={doctors}
                    doctorMap={doctorMap}
                    activeFilters={activeFilters}
                    allScheduleEntries={allScheduleEntries}
                    onToggleEntryFixed={onToggleEntryFixed}
                    onSelectDoctor={handleSelectDoctor}
                    onClearDayAssignment={handleClearDayAssignment}
                    minIntervalBetweenWorkDays={minIntervalBetweenWorkDays}
                    openSelectorDate={openSelectorDate}
                    onOpenSelectorChange={setOpenSelectorDate}
                    unitCoverageForDay={day.unitCoverage ?? []}
                    isHoliday={holidays.some((h) => isSameDay(h, day.date))}
                    freeDayOpenDate={freeDayOpenDate}
                    onFreeDayOpenChange={setFreeDayOpenDate}
                    onToggleFreeDay={onToggleFreeDay}
                    allDoctors={doctors}
                  />
                ))}
              </div>
            </div>
          </div>
          <DragOverlay>
            {activeId && draggedEntry ? (
              <div
                style={getChipStyle('Work')}
                className="rounded-md flex items-center gap-1 p-1.5 text-xs shadow-lg opacity-90 rotate-3"
              >
                <WorkIcon className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {doctorMap.get(draggedEntry.doctorId)?.name || draggedEntry.doctorId}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md" style={getChipStyle('Work')}>
            <WorkIcon className="w-3 h-3 shrink-0" />
            {t('calendar.legend.work')}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md" style={getChipStyle('Pre-assigned')}>
            <PreAssignedIcon className="w-3 h-3 shrink-0" />
            {t('calendar.legend.preAssigned')}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md" style={getChipStyle('Free')}>
            <FreeDayIcon className="w-3 h-3 shrink-0" />
            {t('calendar.legend.freeDay')}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-dashed border-muted-foreground/30 text-muted-foreground">
            <ExcludedIcon className="w-3 h-3 shrink-0" />
            {t('calendar.legend.excluded')}
          </span>
          {units.length > 0 && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {t('calendar.legend.covered')}
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                {t('calendar.legend.partial')}
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                {t('calendar.legend.uncovered')}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ScheduleCalendarView;
