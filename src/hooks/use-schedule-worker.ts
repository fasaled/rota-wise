import { useEffect, useRef, useCallback } from 'react';
import { generateSchedule, type ScheduleWarning } from '@/lib/schedule-generator';
import type { ScheduleFormValues, ScheduleEntry, Schedule } from '@/lib/types';

export type GenerateResult = {
  schedule?: Schedule;
  error?: string;
  warnings?: ScheduleWarning[];
};

export function useScheduleWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/schedule.worker.ts', import.meta.url),
      { type: 'module' },
    );
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const generate = useCallback(
    (formValues: ScheduleFormValues, existingFixedEntries: ScheduleEntry[]): Promise<GenerateResult> => {
      const worker = workerRef.current;
      if (!worker) {
        return Promise.resolve(generateSchedule(formValues, existingFixedEntries));
      }
      return new Promise((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<GenerateResult>) => resolve(e.data);
        worker.onerror = reject;
        worker.postMessage({ formValues, existingFixedEntries });
      });
    },
    [],
  );

  return { generate };
}
