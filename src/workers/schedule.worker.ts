/// <reference lib="webworker" />
import { generateSchedule } from '@/lib/schedule-generator';
import type { WorkerRequest, WorkerResponse } from './schedule-worker-types';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { formValues, existingFixedEntries } = event.data;
  const result = generateSchedule(formValues, existingFixedEntries);
  (self as unknown as Worker).postMessage(result satisfies WorkerResponse);
};
