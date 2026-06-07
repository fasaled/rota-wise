

import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO, addDays, differenceInCalendarDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, CalendarDays as CalendarIconLucide, Lock, Unlock, X, Check, Briefcase } from 'lucide-react';
import { CalendarFilterBar, type ActiveFilter } from './calendar-filter-bar';
import type { Schedule, DoctorProfile, DayDetails, ScheduleEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { VacationIcon, PreAssignedIcon, WorkIcon, ExcludedIcon } from '@/components/icons';
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
  onUpdateScheduleEntry: (updatedEntry: ScheduleEntry, oldDate?: Date) => void;
  onSwapScheduleEntries?: (entry1: ScheduleEntry, entry2: ScheduleEntry, oldDate1?: Date, oldDate2?: Date) => void;
  onArbitraryScheduleEntry?: (updatedEntry: ScheduleEntry) => void;
  minIntervalBetweenWorkDays: number;
  allScheduleEntries: ScheduleEntry[];
  onToggleMonthFixed?: (month: Date, isFixed: boolean) => void;
  onToggleEntryFixed?: (entry: ScheduleEntry, isFixed: boolean) => void;
  onRemoveWorkEntriesForDate?: (date: Date) => void;
  onNotify?: (msg: Omit<InfoBarMessage, 'id'>) => void;
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
    case 'Vacation':
      return {
        backgroundColor: 'var(--chip-vacation-bg)',
        color: 'var(--chip-vacation-text)',
        border: '1px solid var(--chip-vacation-border)',
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
}) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const triggerButtonRef = useRef<HTMLDivElement>(null);

  const dateTextClasses = day.isCurrentMonth ? "font-medium" : "text-muted-foreground/70";
  const todayMarkerClasses = day.isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "";
  const workEntryForDay = day.assignments.find((e) => e.assignment === 'Work' || e.assignment === 'Pre-assigned') ?? null;
  const selectorKey = format(day.date, 'yyyy-MM-dd');
  const isSelectorOpen = openSelectorDate === selectorKey;
  const isPreAssigned = workEntryForDay?.assignment === 'Pre-assigned';
  const isDayFixed = workEntryForDay?.isFixed ?? false;
  const isEditable = !isDayFixed;

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
        onDayClick={(e) => e.stopPropagation()}
      >
        {/* Top line: date number and lock button */}
        <div className="text-xs md:text-sm mb-1 flex items-center justify-between gap-1">
          <span className={cn(dateTextClasses, todayMarkerClasses, "shrink-0")}>
            {format(day.date, 'd')}
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
        {/* List of additional chips (Vacation, Excluded) - scrollable when overflowing */}
        {day.assignments.length > 0 && (
          <div className="flex-1 min-h-0 mt-1 space-y-1 overflow-y-auto">
            {day.assignments.map((entry) => {
              if (entry.assignment !== 'Vacation' && entry.assignment !== 'Excluded') {
                return null;
              }
              const doctor = doctorMap.get(entry.doctorId);
              if (entry.assignment === 'Excluded') {
                return (
                  <div
                    key={`${entry.doctorId}-${format(day.date, 'yyyy-MM-dd')}-${entry.assignment}`}
                    className="w-full rounded-sm flex items-center p-1.5 text-xs cursor-default bg-muted/50 border border-dashed border-muted-foreground/30 text-muted-foreground"
                    title={doctor?.name || entry.doctorId}
                  >
                    <ExcludedIcon className="shrink-0 w-3 h-3 mr-1" />
                    <span className="truncate">{doctor?.name || entry.doctorId}</span>
                  </div>
                );
              }
              return (
                <div
                  key={`${entry.doctorId}-${format(day.date, 'yyyy-MM-dd')}-${entry.assignment}`}
                  className="w-full rounded-sm flex items-center p-1.5 text-xs cursor-default opacity-80"
                  style={getChipStyle(entry.assignment)}
                  title={doctor?.name || entry.doctorId}
                >
                  <VacationIcon className="shrink-0 w-3 h-3 mr-1" />
                  <span className="truncate">{doctor?.name || entry.doctorId}</span>
                </div>
              );
            })}
          </div>
        )}
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
  // Only allow dragging 'Work' assignments that are not fixed, and only when viewing all doctors
  const isDraggable = entry.assignment === 'Work' && !entry.isFixed && !isFilteredByDoctor;
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
  children: React.ReactNode;
  onDayClick: (e: React.MouseEvent) => void;
}

const DroppableDayCell: React.FC<DroppableDayCellProps> = ({ day, children, onDayClick }) => {
  const dropId = `day-${day.date.getTime()}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: {
      type: 'day',
      date: day.date,
    },
  });

  const cellBaseClasses = "h-28 md:h-32 lg:h-36 p-1.5 border flex flex-col overflow-hidden rounded-md";
  const dateTextClasses = day.isCurrentMonth ? "font-medium" : "text-muted-foreground/70";
  const todayMarkerClasses = day.isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "";

  return (
    <div
      ref={setNodeRef}
      key={day.date.toString()}
      className={cn(
        cellBaseClasses,
        day.isCurrentMonth ? 'bg-card' : 'bg-muted/30',
        "cursor-pointer hover:shadow-md transition-shadow duration-200",
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
  if (doctor.vacationDates.some(vacDate => isSameDay(vacDate, date))) {
    return { available: false, reason: 'vacation' };
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
                      {reason === 'vacation' && t('calendar.daySelector.reason.vacation')}
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

const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
    schedule,
    doctors,
    onUpdateScheduleEntry,
    onSwapScheduleEntries,
    onArbitraryScheduleEntry,
    minIntervalBetweenWorkDays,
    allScheduleEntries,
    onToggleMonthFixed,
    onToggleEntryFixed,
    onRemoveWorkEntriesForDate,
    onNotify,
    activeFilters,
    onFiltersChange,
  }) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(schedule.startDate || new Date());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedEntry, setDraggedEntry] = useState<ScheduleEntry | null>(null);

  const [openSelectorDate, setOpenSelectorDate] = useState<string | null>(null);

  const isDoctorBlockedOnDate = (doctorId: string, date: Date): { blocked: boolean; reason: string | undefined } => {
    const doctor = doctors.find(d => d.id === doctorId);
    if (!doctor) return { blocked: false, reason: undefined };

    const isVacation = doctor.vacationDates.some(vacDate => isSameDay(vacDate, date));
    if (isVacation) {
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
    if (draggedEntry.assignment !== 'Work' || draggedEntry.isFixed) {
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
        // Apply doctor filter to excluded entries
        .filter(doc => doctorIds.length === 0 || doctorIds.includes(doc.id))
        .map(doc => ({
          date,
          doctorId: doc.id,
          assignment: 'Excluded' as const,
          dayOfWeek: format(date, 'EEEE', { locale: currentDateFnsLocale }),
          isFixed: false,
        }));

      // Only include excluded entries if 'Excluded' is in the assignment filter,
      // or if no assignment filter is active
      const excludedEntriesToShow = assignmentTypes.length === 0 || assignmentTypes.includes('Excluded')
        ? excludedEntriesForDay
        : [];

      entriesForDay = [...entriesForDay, ...excludedEntriesToShow];

      entriesForDay.sort((a, b) => {
        const order: { [key: string]: number } = { 'Work': 0, 'Pre-assigned': 1, 'Vacation': 2, 'Excluded': 3 };
        return (order[a.assignment] ?? 99) - (order[b.assignment] ?? 99);
      });

      return {
        date,
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isSameDay(date, new Date()),
        assignments: entriesForDay,
      };
    });
  }, [currentMonth, schedule.entries, activeFilters, currentDateFnsLocale, doctors]);

  const nextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const prevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));

  const weekDays = useMemo(() => {
    const firstDayOfWeek = startOfWeek(new Date(), { locale: currentDateFnsLocale });
    return Array.from({ length: 7 }).map((_, i) => format(addDays(firstDayOfWeek, i), 'EEE', { locale: currentDateFnsLocale }));
  }, [currentDateFnsLocale]);

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
    <Card className="shadow-xl mt-8">
      <CardHeader className="flex flex-col gap-3 p-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <CalendarIconLucide className="w-5 h-5 text-primary shrink-0" /> {t('calendar.title')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth} aria-label={t('calendar.previousMonth')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-lg font-semibold w-44 text-center shrink-0">
              {format(currentMonth, 'MMMM yyyy', { locale: currentDateFnsLocale })}
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
              <div className="grid grid-cols-7 gap-1 text-center font-medium text-muted-foreground text-sm mb-2">
                {weekDays.map(day => <div key={day}>{day}</div>)}
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
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1">
            <WorkIcon className="w-3 h-3" style={{ color: 'var(--chip-work-text)' }} />
            <span className="p-0.5 rounded-sm" style={getChipStyle('Work')}>{t('calendar.legend.work')}</span>
          </div>
          <div className="flex items-center gap-1">
            <PreAssignedIcon className="w-3 h-3" style={{ color: 'var(--chip-preassigned-text)' }} />
            <span className="p-0.5 rounded-sm" style={getChipStyle('Pre-assigned')}>{t('calendar.legend.preAssigned')}</span>
          </div>
          <div className="flex items-center gap-1">
            <VacationIcon className="w-3 h-3" style={{ color: 'var(--chip-vacation-text)' }} />
            <span className="p-0.5 rounded-sm" style={getChipStyle('Vacation')}>{t('calendar.legend.vacation')}</span>
          </div>
          <div className="flex items-center gap-1">
            <ExcludedIcon className="w-3 h-3 text-muted-foreground" />
            <span className="p-0.5 rounded-sm bg-muted/50 border border-dashed border-muted-foreground/30 text-muted-foreground">{t('calendar.legend.excluded')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScheduleCalendarView;
