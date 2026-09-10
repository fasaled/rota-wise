import { useState, useCallback, useRef } from 'react';
import type { Schedule, DoctorProfile } from '@/lib/types';

export interface HistoryState {
  schedule: Schedule | null;
  doctorsProfiles: DoctorProfile[];
  scheduleWarnings: string[];
  currentMinInterval: number;
  timestamp: Date;
}

const MAX_HISTORY = 20;

export function useHistory() {
  const [stack, setStack] = useState<HistoryState[]>([]);
  // Keep a ref in sync so undo() can return the state synchronously
  const stackRef = useRef<HistoryState[]>([]);

  const push = useCallback((state: Omit<HistoryState, 'timestamp'>) => {
    const entry: HistoryState = { ...state, timestamp: new Date() };
    setStack((prev) => {
      const next = [...prev.slice(-(MAX_HISTORY - 1)), entry];
      stackRef.current = next;
      return next;
    });
  }, []);

  /** Pop the latest entry and return it. Returns null if history is empty. */
  const undo = useCallback((): HistoryState | null => {
    const current = stackRef.current;
    if (current.length === 0) return null;
    const restored = current[current.length - 1];
    const next = current.slice(0, -1);
    stackRef.current = next;
    setStack(next);
    return restored;
  }, []);

  const clear = useCallback(() => {
    stackRef.current = [];
    setStack([]);
  }, []);

  const canUndo = stack.length > 0;

  return { push, undo, clear, canUndo, stack };
}
