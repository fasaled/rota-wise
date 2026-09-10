import type { ScheduleWarning } from '@/lib/schedule-analyze';
import type { ScheduleFormValues, ScheduleEntry, Schedule } from '@/lib/types';

export interface WorkerRequest {
  formValues: ScheduleFormValues;
  existingFixedEntries: ScheduleEntry[];
}

export interface WorkerResponse {
  schedule?: Schedule;
  error?: string;
  warnings?: ScheduleWarning[];
}
