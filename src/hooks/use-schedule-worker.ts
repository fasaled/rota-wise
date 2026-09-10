import { useEffect, useRef, useCallback } from 'react';
import type { ScheduleFormValues, ScheduleEntry } from '@/lib/types';
import type { WorkerResponse } from '@/workers/schedule-worker-types';

export type GenerateResult = WorkerResponse;

export function useScheduleWorker() {
  const workerRef = useRef<Worker | null>(null);

  const ensureWorker = () => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/schedule.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return workerRef.current;
  };

  useEffect(() => {
    ensureWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const generate = useCallback(
    async (formValues: ScheduleFormValues, existingFixedEntries: ScheduleEntry[]): Promise<GenerateResult> => {
      const worker = ensureWorker();
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
