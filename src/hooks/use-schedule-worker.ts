import { useEffect, useRef, useCallback } from 'react';
import type { ScheduleWarning } from '@/lib/schedule-generator';
import type { ScheduleFormValues, ScheduleEntry, Schedule } from '@/lib/types';

export type GenerateResult = {
  schedule?: Schedule;
  error?: string;
  warnings?: ScheduleWarning[];
};

function waitForWorker(ref: { current: Worker | null }, timeoutMs = 8000): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      if (ref.current) {
        resolve(ref.current);
        return;
      }
      if (performance.now() - started > timeoutMs) {
        reject(new Error('Schedule worker failed to start'));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

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
    async (formValues: ScheduleFormValues, existingFixedEntries: ScheduleEntry[]): Promise<GenerateResult> => {
      const worker = await waitForWorker(workerRef);
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
