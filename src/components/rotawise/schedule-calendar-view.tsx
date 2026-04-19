

import type React from 'react';
import { useState, useMemo } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Users, CalendarDays as CalendarIconLucide, FilterIcon, Lock, Unlock } from 'lucide-react';
import type { Schedule, DoctorProfile, DayDetails, ScheduleEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { VacationIcon, PreAssignedIcon, WorkIcon } from '@/components/icons';
import ManualAdjustmentDialog from './manual-adjustment-dialog';
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
  onNotify?: (msg: Omit<InfoBarMessage, 'id'>) => void;
}

function getChipStyle(assignment: ScheduleEntry['assignment']): React.CSSProperties {
  switch (assignment) {
    case 'Work':
      return {
        backgroundColor: 'var(--chip-work-bg)',
        color: 'var(--chip-work-text)',
        border: 'none',
      };
    case 'Pre-assigned':
      return {
        backgroundColor: 'var(--chip-preassigned-bg)',
        color: 'var(--chip-preassigned-text)',
        border: 'none',
      };
    case 'Vacation':
      return {
        backgroundColor: 'var(--chip-vacation-bg)',
        color: 'var(--chip-vacation-text)',
        border: 'none',
      };
    default:
      return {};
  }
}

interface DraggableWorkEntryProps {
  entry: ScheduleEntry;
  doctor: DoctorProfile | undefined;
  IconComponent: React.ComponentType<{ className?: string }>;
  chipStyle: React.CSSProperties;
  assignmentText: string;
  onEdit: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  isFilteredByDoctor?: boolean;
}

const DraggableWorkEntry: React.FC<DraggableWorkEntryProps> = ({
  entry,
  doctor,
  IconComponent,
  chipStyle,
  assignmentText,
  onEdit,
  isFilteredByDoctor,
}) => {
  // Only allow dragging 'Work' assignments that are not fixed, and only when viewing all doctors
  const isDraggable = entry.assignment === 'Work' && !entry.isFixed && !isFilteredByDoctor;
  // Every chip needs a unique id — sharing 'non-draggable' across chips confuses dnd-kit
  const dragId = `chip-${entry.doctorId}-${entry.date.getTime()}-${entry.assignment}`;

  const {
    attributes,
    listeners,
    setNodeRef,
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

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 1000 : undefined,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  const assignmentTextClasses = "text-xs";
  const assignmentPadding = "p-1.5";
  const doctorNameSpanClasses = "truncate";
  const iconClasses = cn("shrink-0", "w-3 h-3");
  const itemGap = "gap-1";

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...chipStyle,
      }}
      className={cn(
        "w-full rounded-sm flex items-center",
        itemGap,
        assignmentPadding,
        assignmentTextClasses,
        isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "shadow-lg"
      )}
      onClick={onEdit}
      title={`${doctor?.name || entry.doctorId}: ${assignmentText}${entry.isFixed ? ' (Fixed)' : ''}${isDraggable ? ' (Draggable)' : ''}${isFilteredByDoctor ? ' (Filtering active)' : ''}`}
      {...(isDraggable ? { ...attributes, ...listeners } : {})}
    >
      {IconComponent && <IconComponent className={iconClasses} />}
      <span className={doctorNameSpanClasses}>{doctor?.name || entry.doctorId}</span>
      {entry.isFixed && <span className="text-xs ml-1">🔒</span>}
    </div>
  );
};

interface DroppableDayCellProps {
  day: DayDetails;
  children: React.ReactNode;
  onDayClick: () => void;
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

const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
    schedule,
    doctors,
    onUpdateScheduleEntry,
    onSwapScheduleEntries,
    onArbitraryScheduleEntry,
    minIntervalBetweenWorkDays,
    allScheduleEntries,
    onToggleMonthFixed,
    onNotify,
}) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(schedule.startDate || new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedEntry, setDraggedEntry] = useState<ScheduleEntry | null>(null);

  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [selectedEntryForAdjustment, setSelectedEntryForAdjustment] = useState<ScheduleEntry | null>(null);
  const [selectedDateForAdjustment, setSelectedDateForAdjustment] = useState<Date | null>(null);

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
    if (selectedDoctorId !== 'all') {
      onNotify?.({ severity: 'error', title: t('calendar.toast.filterDisablesDrag.title'), description: t('calendar.toast.filterDisablesDrag.description'), autoDismissMs: 4000 });
      return;
    }

    const draggedEntry = active.data.current.entry as ScheduleEntry;
    const targetDate = over.data.current?.date as Date;

    if (!targetDate || isSameDay(draggedEntry.date, targetDate)) {
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

  const handleOpenAdjustmentDialog = (entry: ScheduleEntry | null, date: Date) => {
    if (entry && entry.assignment === 'Vacation') {
      onNotify?.({ severity: 'info', title: t('calendar.toast.vacationUneditable.title'), description: t('calendar.toast.vacationUneditable.description'), autoDismissMs: 4000 });
      return;
    }
    setSelectedEntryForAdjustment(entry);
    setSelectedDateForAdjustment(date);
    setIsAdjustmentDialogOpen(true);
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
      
      entriesForDay = entriesForDay.filter(entry => 
        selectedDoctorId === 'all' || entry.doctorId === selectedDoctorId
      );

      if (assignmentFilter === 'workOnly') {
        entriesForDay = entriesForDay.filter(entry => entry.assignment === 'Work' || entry.assignment === 'Pre-assigned');
      } else if (assignmentFilter === 'vacationOnly') {
        entriesForDay = entriesForDay.filter(entry => entry.assignment === 'Vacation');
      }
      
      entriesForDay = entriesForDay.filter(entry => 
          !(entry.doctorId === 'system' && entry.assignment === 'Off')
      );
      
      return {
        date,
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isSameDay(date, new Date()),
        assignments: entriesForDay,
      };
    });
  }, [currentMonth, schedule.entries, selectedDoctorId, currentDateFnsLocale, assignmentFilter]);

  const renderDayCell = (day: DayDetails) => {
    const dateTextClasses = day.isCurrentMonth ? "font-medium" : "text-muted-foreground/70";
    const todayMarkerClasses = day.isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "";

    return (
      <DroppableDayCell 
        key={day.date.toString()}
        day={day} 
        onDayClick={() => handleOpenAdjustmentDialog(null, day.date)}
      >
        <div className={cn("text-xs md:text-sm mb-1", dateTextClasses)}>
          <span className={todayMarkerClasses}>{format(day.date, 'd')}</span>
        </div>
        <div className="space-y-1 overflow-y-auto flex-grow">
          {day.assignments.map((entry, index) => {
            if (entry.doctorId === 'system' && entry.assignment === 'Off') {
              return null;
            }

            const doctor = doctorMap.get(entry.doctorId);
            let IconComponent;
            const assignmentText = t(`assignmentType.${entry.assignment}` as any);
            const chipStyle = getChipStyle(entry.assignment);

            switch (entry.assignment) {
              case 'Vacation':
                IconComponent = VacationIcon;
                break;
              case 'Pre-assigned':
                IconComponent = PreAssignedIcon;
                break;
              case 'Work':
                IconComponent = WorkIcon;
                break;
              case 'Off':
                return null;
              default:
                return null;
            }

            // Use DraggableWorkEntry for Work assignments, regular div for others
            if (entry.assignment === 'Work') {
              return (
                <DraggableWorkEntry
                  key={`${entry.doctorId}-${entry.assignment}-${index}`}
                  entry={entry}
                  doctor={doctor}
                  IconComponent={IconComponent}
                  chipStyle={chipStyle}
                  assignmentText={assignmentText}
                  onEdit={(e) => { e.stopPropagation(); handleOpenAdjustmentDialog(entry, day.date); }}
                  isFilteredByDoctor={selectedDoctorId !== 'all'}
                />
              );
            } else {
              // Non-draggable entries (Vacation, Pre-assigned)
              return (
                <div
                  key={`${entry.doctorId}-${entry.assignment}-${index}`}
                  style={chipStyle}
                  className="w-full rounded-sm flex items-center gap-1 p-1.5 text-xs cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); handleOpenAdjustmentDialog(entry, day.date); }}
                  title={`${doctor?.name || entry.doctorId}: ${assignmentText}${entry.isFixed ? ' (Fixed)' : ''}`}
                >
                  {IconComponent && <IconComponent className="shrink-0 w-3 h-3" />}
                  <span className="truncate">{doctor?.name || entry.doctorId}</span>
                  {entry.isFixed && <span className="text-xs ml-1">🔒</span>}
                </div>
              );
            }
          })}
        </div>
      </DroppableDayCell>
    );
  };

  const nextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const prevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));

  const weekDays = useMemo(() => {
    const firstDayOfWeek = startOfWeek(new Date(), { locale: currentDateFnsLocale });
    return Array.from({ length: 7 }).map((_, i) => format(addDays(firstDayOfWeek, i), 'EEE', { locale: currentDateFnsLocale }));
  }, [currentDateFnsLocale]);

  const monthHasFixedEntries = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return schedule.entries.some(entry => {
      const entryDate = entry.date instanceof Date ? entry.date : parseISO(entry.date as unknown as string);
      return entry.isFixed && entryDate >= monthStart && entryDate <= monthEnd;
    });
  }, [currentMonth, schedule.entries]);

  const handleToggleMonthFixed = () => {
    if (onToggleMonthFixed) {
      onToggleMonthFixed(currentMonth, !monthHasFixedEntries);
    }
  };


  return (
    <Card className="shadow-xl mt-8">
      <CardHeader className="flex flex-col md:flex-row justify-between items-center gap-4 p-4">
        <CardTitle className="text-xl font-semibold flex items-center gap-2">
          <CalendarIconLucide className="w-5 h-5 text-primary shrink-0" /> {t('calendar.title')}
        </CardTitle>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
            <Select value={selectedDoctorId} onValueChange={(value) => setSelectedDoctorId(value as string)}>
                <SelectTrigger className="w-full sm:w-[180px] bg-card">
                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('calendar.filterDoctorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="all">{t('calendar.allDoctors')}</SelectItem>
                {doctors.map(doc => (
                    <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>
                ))}
                </SelectContent>
            </Select>
            <Select value={assignmentFilter} onValueChange={(value) => setAssignmentFilter(value as string)}>
                <SelectTrigger className="w-full sm:w-[180px] bg-card">
                <FilterIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('calendar.filterAssignmentPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">{t('calendar.filterAssignment.all')}</SelectItem>
                    <SelectItem value="workOnly">{t('calendar.filterAssignment.workOnly')}</SelectItem>
                    <SelectItem value="vacationOnly">{t('calendar.filterAssignment.vacationOnly')}</SelectItem>
                </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={prevMonth} aria-label={t('calendar.previousMonth')}>
                <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-lg font-semibold w-32 text-center">
                {format(currentMonth, 'MMMM yyyy', { locale: currentDateFnsLocale })}
                </span>
                <Button variant="outline" size="icon" onClick={nextMonth} aria-label={t('calendar.nextMonth')}>
                <ChevronRight className="h-5 w-5" />
                </Button>
                {onToggleMonthFixed && (
                  <Button 
                    variant={monthHasFixedEntries ? "default" : "outline"} 
                    size="sm" 
                    onClick={handleToggleMonthFixed}
                    className="ml-2"
                    title={monthHasFixedEntries ? t('calendar.unfixMonth') : t('calendar.fixMonth')}
                  >
                    {monthHasFixedEntries ? <Unlock className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                    {monthHasFixedEntries ? t('calendar.unfixMonth') : t('calendar.fixMonth')}
                  </Button>
                )}
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 sm:p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-7 gap-1 text-center font-medium text-muted-foreground text-sm mb-2">
            {weekDays.map(day => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {daysInMonth.map(renderDayCell)}
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
        </div>
      </CardContent>
       {selectedDateForAdjustment && (
        <ManualAdjustmentDialog
          isOpen={isAdjustmentDialogOpen}
          onClose={() => setIsAdjustmentDialogOpen(false)}
          entry={selectedEntryForAdjustment}
          date={selectedDateForAdjustment}
          doctors={doctors}
          onSave={onUpdateScheduleEntry}
          onSaveArbitrary={onArbitraryScheduleEntry}
          minIntervalBetweenWorkDays={minIntervalBetweenWorkDays}
          allScheduleEntries={allScheduleEntries}
          onNotify={onNotify}
        />
      )}
    </Card>
  );
};

export default ScheduleCalendarView;
