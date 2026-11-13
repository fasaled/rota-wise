import { useEffect, useRef, useCallback } from 'react';
import type { ScheduleFormValues, ScheduleEntry } from '@/lib/types';
import type { GenerateOptions, GenerateResult } from '@/lib/schedule-generator';
import type { WorkerRequest, WorkerResponse } from '@/workers/schedule-worker-types';

export type { GenerateResult };

/** Candidate rosters built per run; the best one is kept. */
const DEFAULT_ATTEMPTS = 24;

type Pending = (result: GenerateResult) => void;

export function useScheduleWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const nextIdRef = useRef(1);

  const failAll = useCallback((message: string) => {
    pendingRef.current.forEach((resolve) => resolve({ error: message }));
    pendingRef.current.clear();
  }, []);

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      const worker = new Worker(new URL('../workers/schedule.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, ...result } = e.data;
        const resolve = pendingRef.current.get(id);
        pendingRef.current.delete(id);
        resolve?.(result);
      };
      worker.onerror = (e) => {
        // The worker is in an unknown state: settle every caller and start
        // from a fresh worker on the next request.
        failAll(e.message || 'Schedule worker failed');
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      };
      workerRef.current = worker;
    }
    return workerRef.current;
  }, [failAll]);

  useEffect(() => {
    ensureWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      failAll('Schedule worker stopped');
    };
  }, [ensureWorker, failAll]);

  const generate = useCallback(
    (
      formValues: ScheduleFormValues,
      existingFixedEntries: ScheduleEntry[],
      options: GenerateOptions = {},
    ): Promise<GenerateResult> => {
      const worker = ensureWorker();
      const id = nextIdRef.current++;
      return new Promise((resolve) => {
        pendingRef.current.set(id, resolve);
        const request: WorkerRequest = {
          id,
          formValues,
          existingFixedEntries,
          options: { attempts: DEFAULT_ATTEMPTS, ...options },
        };
        worker.postMessage(request);
      });
    },
    [ensureWorker],
  );

  return { generate };
}
