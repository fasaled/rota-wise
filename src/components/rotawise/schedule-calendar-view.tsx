"use client";

import type React from 'react';
import { useState, useMemo } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Users, CalendarDays as CalendarIconLucide } from 'lucide-react';
import type { Schedule, DoctorProfile, DayDetails, ScheduleEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { VacationIcon, PreAssignedIcon, WorkIcon } from '@/components/icons';
import ManualAdjustmentDialog from './manual-adjustment-dialog'; // Path is relative to current dir

interface ScheduleCalendarViewProps {
  schedule: Schedule;
  doctors: DoctorProfile[]; // Use DoctorProfile which includes id, name, and possibly other display info
  onUpdateScheduleEntry: (updatedEntry: ScheduleEntry) => void; // Callback to update schedule in parent
}

const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({ schedule, doctors, onUpdateScheduleEntry }) => {
  const [currentMonth, setCurrentMonth] = useState(schedule.startDate || new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | 'all'>('all');
  const [viewMode, setViewMode] = useState<'calendar' | 'doctor' | 'day'>('calendar');
  
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [selectedEntryForAdjustment, setSelectedEntryForAdjustment] = useState<ScheduleEntry | null>(null);
  const [selectedDateForAdjustment, setSelectedDateForAdjustment] = useState<Date | null>(null);


  const handleOpenAdjustmentDialog = (entry: ScheduleEntry | null, date: Date) => {
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
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: startDate, end: endDate }).map(date => {
      // Ensure schedule entries dates are proper Date objects
      const entriesForDay = schedule.entries.filter(entry => 
        isSameDay(entry.date instanceof Date ? entry.date : parseISO(entry.date as unknown as string), date) &&
        (selectedDoctorId === 'all' || entry.doctorId === selectedDoctorId)
      );
      return {
        date,
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isSameDay(date, new Date()),
        assignments: entriesForDay,
      };
    });
  }, [currentMonth, schedule.entries, selectedDoctorId]);

  const renderDayCell = (day: DayDetails) => {
    const cellBaseClasses = "h-28 md:h-32 lg:h-36 p-1.5 border flex flex-col overflow-hidden hover:shadow-md transition-shadow duration-200 rounded-md";
    const dateTextClasses = day.isCurrentMonth ? "font-medium" : "text-muted-foreground/70";
    const todayMarkerClasses = day.isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "";
    
    return (
      <div
        key={day.date.toString()}
        className={cn(
          cellBaseClasses,
          day.isCurrentMonth ? 'bg-card' : 'bg-muted/30',
           "cursor-pointer"
        )}
        onClick={() => handleOpenAdjustmentDialog(null, day.date)} // Allow adding new assignment
        role="button"
        tabIndex={0}
        aria-label={`Schedule for ${format(day.date, 'PPP')}`}
      >
        <div className={cn("text-xs md:text-sm mb-1", dateTextClasses)}>
          <span className={todayMarkerClasses}>{format(day.date, 'd')}</span>
        </div>
        <div className="space-y-1 overflow-y-auto text-xs flex-grow">
          {day.assignments.map((entry, index) => {
            const doctor = doctorMap.get(entry.doctorId);
            let IconComponent;
            let bgColor = 'bg-opacity-20';
            let textColor = '';

            switch (entry.assignment) {
              case 'Vacation':
                IconComponent = VacationIcon;
                bgColor = 'bg-accent';
                textColor = 'text-accent-foreground';
                break;
              case 'Pre-assigned':
                IconComponent = PreAssignedIcon;
                bgColor = 'bg-primary/80'; // More opaque for pre-assigned
                textColor = 'text-primary-foreground';
                break;
              case 'Work':
                IconComponent = WorkIcon;
                bgColor = 'bg-blue-200 dark:bg-blue-800'; // A neutral work color
                textColor = 'text-blue-700 dark:text-blue-300';
                break;
              default: // Off or other
                return (
                  <div key={index} className="p-1 rounded text-muted-foreground italic">
                    {doctor?.name || entry.doctorId}: Off
                  </div>
                );
            }
            return (
              <div 
                key={index} 
                className={cn("p-1.5 rounded-md text-xs flex items-center gap-1", bgColor, textColor, "cursor-pointer")}
                onClick={(e) => { e.stopPropagation(); handleOpenAdjustmentDialog(entry, day.date);}}
              >
                {IconComponent && <IconComponent className="w-3 h-3 shrink-0" />}
                <span className="truncate">{doctor?.name || entry.doctorId}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <Card className="shadow-xl mt-8">
      <CardHeader className="flex flex-col md:flex-row justify-between items-center gap-4 p-4">
        <CardTitle className="text-2xl font-bold text-primary flex items-center gap-2">
          <CalendarIconLucide /> Generated Schedule
        </CardTitle>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
           <Select value={selectedDoctorId} onValueChange={(value) => setSelectedDoctorId(value as string)}>
            <SelectTrigger className="w-full sm:w-[180px] bg-card">
              <Users className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filter by Doctor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Doctors</SelectItem>
              {doctors.map(doc => (
                <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-lg font-semibold w-32 text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Next month">
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
            <div className="flex items-center gap-1"><WorkIcon className="w-3 h-3 text-blue-700 dark:text-blue-300"/> <span className="p-0.5 rounded-sm bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300">Work</span></div>
            <div className="flex items-center gap-1"><VacationIcon className="w-3 h-3 text-accent-foreground"/> <span className="p-0.5 rounded-sm bg-accent text-accent-foreground">Vacation</span></div>
            <div className="flex items-center gap-1"><PreAssignedIcon className="w-3 h-3 text-primary-foreground"/> <span className="p-0.5 rounded-sm bg-primary/80 text-primary-foreground">Pre-assigned</span></div>
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
        />
      )}
    </Card>
  );
};

export default ScheduleCalendarView;
