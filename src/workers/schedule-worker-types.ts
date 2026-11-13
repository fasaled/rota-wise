import type { GenerateOptions, GenerateResult } from '@/lib/schedule-generator';
import type { ScheduleFormValues, ScheduleEntry } from '@/lib/types';

export interface WorkerRequest {
  id: number;
  formValues: ScheduleFormValues;
  existingFixedEntries: ScheduleEntry[];
  options?: GenerateOptions;
}

export interface WorkerResponse extends GenerateResult {
  id: number;
}
