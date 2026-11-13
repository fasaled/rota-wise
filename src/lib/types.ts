import type { z } from 'zod';
import type { scheduleFormSchema } from '@/lib/schedule-form-schema';

// Current file format version. Bump whenever the on-disk shape changes.
export const CURRENT_FILE_VERSION = 4 as const;

export interface Unit {
  id: string;
  name: string;
  minPostCallCoverage: number; // 0 = no coverage check (e.g. consultation); >=1 = required weekday coverage
  // Other units that jointly cover post-call absences with this one.
  // The alliance is an undirected connected component: A↔B and B↔C means
  // A, B and C share a pool. Each unit still keeps its own minimum.
  alliedUnitIds?: string[];
}

/**
 * Temporary reassignment of a doctor to another unit (typically to cover
 * vacations). During [startDate, endDate] the doctor counts only toward
 * `targetUnitId`, not their home `unitId`.
 */
export interface UnitCoverAssignment {
  id: string;
  targetUnitId: string;
  startDate: Date;
  endDate: Date;
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
  coverAssignments?: UnitCoverAssignment[];
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
  coverAssignments?: UnitCoverAssignment[];
}

// Full form input schema type
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

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
  seed?: number; // Seed of the generator run that produced this schedule
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
  // Names of other units in this unit's coverage alliance, if any.
  alliedUnitNames?: string[];
}

// --- Types for JSON Serialization/Deserialization ---
// Calendar days are persisted as `yyyy-MM-dd` strings (file version 4).
// File versions 1–3 used ISO datetimes; `parseDateValue` reads both.

export interface SerializedScheduleEntry extends Omit<ScheduleEntry, 'date' | 'dayOfWeek'> {
  date: string;
  dayOfWeek?: string;
}

export interface SerializedSchedule {
  /** Absent when there is no generated schedule. */
  startDate?: string;
  endDate?: string;
  entries: SerializedScheduleEntry[];
  minIntervalBetweenWorkDays?: number;
  globalMonthlyShiftLimit?: number;
  seed?: number;
}

export interface SerializedUnitCoverAssignment extends Omit<UnitCoverAssignment, 'startDate' | 'endDate'> {
  startDate: string;
  endDate: string;
}

export interface SerializedDoctorFormFieldInput
  extends Omit<DoctorFormFieldInput, 'freeDates' | 'preAssignedWorkDates' | 'excludedDates' | 'coverAssignments'> {
  freeDates: string[];
  preAssignedWorkDates: string[];
  excludedDates: string[];
  coverAssignments?: SerializedUnitCoverAssignment[];
}

/** Same shape as the form doctor; kept as a separate name for file readers. */
export type SerializedDoctorProfile = SerializedDoctorFormFieldInput;

// Units are already JSON-serializable (only primitive fields), so we use the same shape.
export type SerializedUnit = Unit;

export interface SerializedScheduleFormValues {
  numberOfDoctors: number;
  /** Absent until the user picks a period. */
  startDate?: string;
  endDate?: string;
  minIntervalBetweenWorkDays?: number;
  globalMonthlyShiftLimit?: number;
  enforceMonthlyLimit?: boolean;
  doctors: SerializedDoctorFormFieldInput[];
  units?: SerializedUnit[]; // Optional for backward compatibility with fileVersion 1
  holidays?: string[]; // Optional for fileVersion 1 compatibility
}

export interface PersistedScheduleData {
  schedule: SerializedSchedule;
  /** Mirror of `formValues.doctors`, kept for readers of file versions 1–3. */
  doctorsProfiles: SerializedDoctorProfile[];
  formValues: SerializedScheduleFormValues;
  /** @deprecated Written by file versions 1–3. Warnings are always recomputed on load. */
  scheduleWarnings?: string[];
  currentMinInterval?: number; // Min interval the stored schedule was generated with
}

/** Reserved for future named versions of a schedule. Always `[]` today. */
export interface ScheduleVersion {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  lastModified: string;
  parameters: SerializedScheduleFormValues;
  generatedSchedule?: SerializedSchedule;
  warnings?: string[];
}

export interface AppFileData extends PersistedScheduleData {
  fileVersion: number;
  versions: ScheduleVersion[];
}
