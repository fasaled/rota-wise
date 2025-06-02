
import type { z } from 'zod';
import type { scheduleFormSchema } from '@/components/rotawise/data-input-form'; // Updated path

export interface Doctor {
  id: string;
  name: string;
}

// Stored doctor data, used for displaying schedule
export interface DoctorProfile extends Doctor {
  vacationDates: Date[];
  preAssignedWorkDates: Date[];
  excludedDates: Date[];
}

// Input for a single doctor in the form
export interface DoctorFormFieldInput {
  id: string; // Frontend unique key for react-hook-form field array
  name: string;
  vacationDates: Date[];
  preAssignedWorkDates: Date[];
  excludedDates: Date[];
}

// Full form input schema type
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema> & {
  minIntervalBetweenWorkDays?: number;
};

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
  minIntervalBetweenWorkDays?: number; // Added to carry context
}

export interface DayDetails {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  assignments: ScheduleEntry[];
}

// --- Types for JSON Serialization/Deserialization ---

export interface SerializedScheduleEntry extends Omit<ScheduleEntry, 'date'> {
  date: string; // ISO date string
}

export interface SerializedSchedule extends Omit<Schedule, 'startDate' | 'endDate' | 'entries' | 'minIntervalBetweenWorkDays'> {
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  entries: SerializedScheduleEntry[];
  minIntervalBetweenWorkDays?: number;
}

export interface SerializedDoctorProfile extends Omit<DoctorProfile, 'vacationDates' | 'preAssignedWorkDates' | 'excludedDates'> {
  vacationDates: string[]; // Array of ISO date strings
  preAssignedWorkDates: string[]; // Array of ISO date strings
  excludedDates: string[]; // Array of ISO date strings
}

export interface SerializedDoctorFormFieldInput extends Omit<DoctorFormFieldInput, 'vacationDates' | 'preAssignedWorkDates' | 'excludedDates'> {
  vacationDates: string[]; // Array of ISO date strings
  preAssignedWorkDates: string[]; // Array of ISO date strings
  excludedDates: string[]; // Array of ISO date strings
}

export interface SerializedScheduleFormValues extends Omit<ScheduleFormValues, 'startDate' | 'endDate' | 'doctors' | 'minIntervalBetweenWorkDays'> {
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  doctors: SerializedDoctorFormFieldInput[];
  minIntervalBetweenWorkDays?: number;
}

export interface PersistedScheduleData {
  schedule: SerializedSchedule;
  doctorsProfiles: SerializedDoctorProfile[];
  formValues: SerializedScheduleFormValues;
}
