"use client";

import type React from 'react';
import { useState, useMemo } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Users, CalendarDays as CalendarIconLucide, FilterIcon } from 'lucide-react';
import type { Schedule, DoctorProfile, DayDetails, ScheduleEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { VacationIcon, PreAssignedIcon, WorkIcon } from '@/components/icons';
import ManualAdjustmentDialog from './manual-adjustment-dialog';
import { useLanguage } from '@/context/language-context';
import { useToast } from "@/hooks/use-toast";

interface ScheduleCalendarViewProps {
  schedule: Schedule;
  doctors: DoctorProfile[];
  onUpdateScheduleEntry: (updatedEntry: ScheduleEntry) => void;
  minIntervalBetweenWorkDays: number;
  allScheduleEntries: ScheduleEntry[]; 
}

const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
    schedule,
    doctors,
    onUpdateScheduleEntry,
    minIntervalBetweenWorkDays,
    allScheduleEntries,
}) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(schedule.startDate || new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const { toast } = useToast();

  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [selectedEntryForAdjustment, setSelectedEntryForAdjustment] = useState<ScheduleEntry | null>(null);
  const [selectedDateForAdjustment, setSelectedDateForAdjustment] = useState<Date | null>(null);

  const handleOpenAdjustmentDialog = (entry: ScheduleEntry | null, date: Date) => {
    if (entry && entry.assignment === 'Vacation') {
      toast({
        title: t('calendar.toast.vacationUneditable.title'),
        description: t('calendar.toast.vacationUneditable.description'),
        variant: "default",
      });
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
    const cellBaseClasses = "h-28 md:h-32 lg:h-36 p-1.5 border flex flex-col overflow-hidden rounded-md";
    const dateTextClasses = day.isCurrentMonth ? "font-medium" : "text-muted-foreground/70";
    const todayMarkerClasses = day.isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "";

    return (
      <div
        key={day.date.toString()}
        className={cn(
          cellBaseClasses,
          day.isCurrentMonth ? 'bg-card' : 'bg-muted/30',
          "cursor-pointer hover:shadow-md transition-shadow duration-200"
        )}
        onClick={() => handleOpenAdjustmentDialog(null, day.date)}
        role="button"
        tabIndex={0}
        aria-label={t('calendar.scheduleFor', { date: format(day.date, 'PPP', { locale: currentDateFnsLocale }) })}
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
            let bgColor = 'bg-opacity-20';
            let textColor = '';
            let assignmentText = t(`assignmentType.${entry.assignment}` as any);


            switch (entry.assignment) {
              case 'Vacation': 
                IconComponent = VacationIcon;
                bgColor = 'bg-accent';
                textColor = 'text-accent-foreground';
                break;
              case 'Pre-assigned':
                IconComponent = PreAssignedIcon;
                bgColor = 'bg-primary/80';
                textColor = 'text-primary-foreground';
                break;
              case 'Work':
                IconComponent = WorkIcon;
                bgColor = 'bg-blue-200 dark:bg-blue-800';
                textColor = 'text-blue-700 dark:text-blue-300';
                break;
              case 'Off': 
                return null;
              default: 
                return null; 
            }

            const assignmentTextClasses = "text-xs";
            const assignmentPadding = "p-1.5";
            const doctorNameSpanClasses = "truncate";
            const iconClasses = cn("shrink-0", "w-3 h-3");
            const itemGap = "gap-1";

            return (
              <div
                key={`${entry.doctorId}-${entry.assignment}-${index}`}
                className={cn(
                  "rounded-md flex items-center",
                  itemGap,
                  assignmentPadding,
                  assignmentTextClasses,
                  bgColor,
                  textColor,
                  "cursor-pointer"
                )}
                onClick={(e) => { e.stopPropagation(); handleOpenAdjustmentDialog(entry, day.date);}}
                title={`${doctor?.name || entry.doctorId}: ${assignmentText}`}
              >
                {IconComponent && <IconComponent className={iconClasses} />}
                <span className={doctorNameSpanClasses}>{doctor?.name || entry.doctorId}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const nextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const prevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));

  const weekDays = useMemo(() => {
    const firstDayOfWeek = startOfWeek(new Date(), { locale: currentDateFnsLocale });
    return Array.from({ length: 7 }).map((_, i) => format(addDays(firstDayOfWeek, i), 'EEE', { locale: currentDateFnsLocale }));
  }, [currentDateFnsLocale]);


  return (
    <Card className="shadow-xl mt-8">
      <CardHeader className="flex flex-col md:flex-row justify-between items-center gap-4 p-4">
        <CardTitle className="text-2xl font-bold text-primary flex items-center gap-2">
          <CalendarIconLucide /> {t('calendar.title')}
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
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-center font-medium text-muted-foreground text-sm mb-2">
          {weekDays.map(day => <div key={day}>{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {daysInMonth.map(renderDayCell)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1"><WorkIcon className="w-3 h-3 text-blue-700 dark:text-blue-300"/> <span className="p-0.5 rounded-sm bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300">{t('calendar.legend.work')}</span></div>
            <div className="flex items-center gap-1"><PreAssignedIcon className="w-3 h-3 text-primary-foreground"/> <span className="p-0.5 rounded-sm bg-primary/80 text-primary-foreground">{t('calendar.legend.preAssigned')}</span></div>
            <div className="flex items-center gap-1"><VacationIcon className="w-3 h-3 text-accent-foreground"/> <span className="p-0.5 rounded-sm bg-accent text-accent-foreground">{t('calendar.legend.vacation')}</span></div>
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
          minIntervalBetweenWorkDays={minIntervalBetweenWorkDays}
          allScheduleEntries={allScheduleEntries}
        />
      )}
    </Card>
  );
};

export default ScheduleCalendarView;
