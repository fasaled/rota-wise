/// <reference lib="webworker" />
import { generateSchedule } from '@/lib/schedule-generator';
import type { ScheduleFormValues, ScheduleEntry } from '@/lib/types';
import type { ScheduleWarning } from '@/lib/schedule-generator';
import type { Schedule } from '@/lib/types';

export interface WorkerRequest {
  formValues: ScheduleFormValues;
  existingFixedEntries: ScheduleEntry[];
}

export interface WorkerResponse {
  schedule?: Schedule;
  error?: string;
  warnings?: ScheduleWarning[];
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { formValues, existingFixedEntries } = event.data;
  const result = generateSchedule(formValues, existingFixedEntries);
  (self as unknown as Worker).postMessage(result satisfies WorkerResponse);
};
