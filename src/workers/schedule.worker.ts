/// <reference lib="webworker" />
import { generateSchedule } from '@/lib/schedule-generator';
import type { WorkerRequest, WorkerResponse } from './schedule-worker-types';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, formValues, existingFixedEntries, options } = event.data;
  const result = generateSchedule(formValues, existingFixedEntries, options);
  (self as unknown as Worker).postMessage({ ...result, id } satisfies WorkerResponse);
};
