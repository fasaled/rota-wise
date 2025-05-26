import type { z } from 'zod';
import type { scheduleFormSchema } from '@/components/equischedule/data-input-form';

export interface Doctor {
  id: string;
  name: string;
}

// Stored doctor data, used for displaying schedule
export interface DoctorProfile extends Doctor {
  vacationDates: Date[];
  preAssignedWorkDates: Date[];
}

// Input for a single doctor in the form
export interface DoctorFormFieldInput {
  id: string; // Frontend unique key for react-hook-form field array
  name: string;
  vacationDates: Date[];
  preAssignedWorkDates: Date[];
}

// Full form input schema type
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export interface ScheduleEntry {
  date: Date;
  doctorId: string; // ID of the assigned doctor
  assignment: 'Work' | 'Vacation' | 'Pre-assigned' | 'Off';
  dayOfWeek: string; // e.g., "Monday"
}

export interface Schedule {
  entries: ScheduleEntry[];
  startDate: Date;
  endDate: Date;
}

export interface DayDetails {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  assignments: ScheduleEntry[];
}
