import type { z } from 'zod';
import type { scheduleFormSchema } from '@/components/rotawise/data-input-form'; // Updated path

// Current file format version. Bump whenever the on-disk shape changes.
export const CURRENT_FILE_VERSION = 2 as const;

export interface Unit {
  id: string;
  name: string;
  minPostCallCoverage: number; // 0 = no coverage check (e.g. consultation); >=1 = required weekday coverage
}

export interface Doctor {
  id: string;
  name: string;
  unitId?: string; // Optional: a doctor without a unit is a "free agent" and is not counted towards unit coverage
}

// Stored doctor data, used for displaying schedule
export interface DoctorProfile extends Doctor {
  freeDates: Date[];
  preAssignedWorkDates: Date[];
  excludedDates: Date[];
  isExcludedFromAutomaticAssignment: boolean;
}

// Input for a single doctor in the form
export interface DoctorFormFieldInput {
  id: string; // Frontend unique key for react-hook-form field array
  name: string;
  freeDates: Date[];
  preAssignedWorkDates: Date[];
  excludedDates: Date[];
  isExcludedFromAutomaticAssignment: boolean;
  unitId?: string;
}

// Full form input schema type
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema> & {
  minIntervalBetweenWorkDays?: number;
};

export interface ScheduleEntry {
  date: Date;
  doctorId: string; // ID of the assigned doctor
  assignment: 'Work' | 'Free' | 'Pre-assigned' | 'Off' | 'Excluded';
  dayOfWeek: string; // e.g., "Monday"
  isFixed?: boolean; // Whether this entry should be preserved when regenerating the schedule
}

export interface Schedule {
  entries: ScheduleEntry[];
  startDate: Date;
  endDate: Date;
  minIntervalBetweenWorkDays?: number; // Added to carry context
  globalMonthlyShiftLimit?: number; // Global monthly shift limit for all doctors
}

export interface DayDetails {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  assignments: ScheduleEntry[];
  // Coverage status for the day, one entry per active unit with minPostCallCoverage > 0.
  // Computed on demand from the schedule + doctor/unit data. Empty array on weekends.
  unitCoverage?: UnitCoverage[];
}

// Per-unit coverage status for a single day. Used by the calendar to render
// the green/red dots.
export interface UnitCoverage {
  unitId: string;
  unitName: string;
  min: number;
  available: number;
  isCovered: boolean;
  // 'tracked' = the unit has minPostCallCoverage > 0, so a red/green dot is shown.
  // 'ignored' = the unit has minPostCallCoverage === 0, so the dot is grey/neutral.
  status: 'tracked' | 'ignored';
}

// --- Types for JSON Serialization/Deserialization ---

export interface SerializedScheduleEntry extends Omit<ScheduleEntry, 'date' | 'dayOfWeek'> {
  date: string; // ISO date string
  dayOfWeek?: string; // optional — not stored in xlsx metadata
}

export interface SerializedSchedule extends Omit<Schedule, 'startDate' | 'endDate' | 'entries' | 'minIntervalBetweenWorkDays' | 'globalMonthlyShiftLimit'> {
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  entries: SerializedScheduleEntry[];
  minIntervalBetweenWorkDays?: number;
  globalMonthlyShiftLimit?: number;
}

export interface SerializedDoctorProfile extends Omit<DoctorProfile, 'freeDates' | 'preAssignedWorkDates' | 'excludedDates'> {
  freeDates: string[]; // Array of ISO date strings
  preAssignedWorkDates: string[]; // Array of ISO date strings
  excludedDates: string[]; // Array of ISO date strings
  isExcludedFromAutomaticAssignment: boolean;
  unitId?: string;
}

export interface SerializedDoctorFormFieldInput extends Omit<DoctorFormFieldInput, 'freeDates' | 'preAssignedWorkDates' | 'excludedDates'> {
  freeDates: string[]; // Array of ISO date strings
  preAssignedWorkDates: string[]; // Array of ISO date strings
  excludedDates: string[]; // Array of ISO date strings
  isExcludedFromAutomaticAssignment: boolean;
  unitId?: string;
}

// Units are already JSON-serializable (only primitive fields), so we use the same shape.
export type SerializedUnit = Unit;

export interface SerializedScheduleFormValues extends Omit<ScheduleFormValues, 'startDate' | 'endDate' | 'doctors' | 'minIntervalBetweenWorkDays' | 'globalMonthlyShiftLimit' | 'units' | 'holidays'> {
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  doctors: SerializedDoctorFormFieldInput[];
  minIntervalBetweenWorkDays?: number;
  globalMonthlyShiftLimit?: number;
  units?: SerializedUnit[]; // Optional for backward compatibility with fileVersion 1
  holidays?: string[]; // ISO date strings, optional for fileVersion 1 compatibility
}

export interface PersistedScheduleData {
  schedule: SerializedSchedule;
  doctorsProfiles: SerializedDoctorProfile[];
  formValues: SerializedScheduleFormValues;
  scheduleWarnings?: string[]; // Optional: Added for persisting warnings
  currentMinInterval?: number; // Optional: Added for persisting min interval context
}

/**
 * Payload stored in the hidden `Metadata` sheet of an exported .xlsx
 * so the calendar can be re-opened by the app. Includes the file version
 * so future migrations are possible.
 */
export interface ExcelMetadataPayload {
  fileVersion: 3;
  schedule: SerializedSchedule;
  doctorsProfiles: SerializedDoctorProfile[];
  units: SerializedUnit[];
  holidays: string[]; // ISO date strings
  formValues: { minIntervalBetweenWorkDays: number };
}

export interface ScheduleVersion {
  id: string;
  name: string;
  description?: string;
  createdAt: string;         // ISO date string
  lastModified: string;      // ISO date string
  parameters: SerializedScheduleFormValues;
  generatedSchedule?: SerializedSchedule;
  warnings?: string[];
}

export interface AppFileData extends PersistedScheduleData {
  fileVersion: number;
  versions: ScheduleVersion[];
}
