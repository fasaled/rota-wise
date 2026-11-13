import { useState, useCallback, useRef } from 'react';

const MAX_HISTORY = 50;

/**
 * Undo / redo stacks of opaque snapshots.
 *
 * `push(previous)` records the state as it was *before* a change. `undo` and
 * `redo` return the snapshot to restore (or `null` when there is none). They
 * take a function that, given that snapshot, builds the matching snapshot of
 * the current state, which is parked on the opposite stack.
 */
export function useHistory<T>(maxEntries: number = MAX_HISTORY) {
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const [counts, setCounts] = useState({ past: 0, future: 0 });

  const sync = useCallback(() => {
    setCounts({ past: pastRef.current.length, future: futureRef.current.length });
  }, []);

  const push = useCallback(
    (previous: T) => {
      pastRef.current = [...pastRef.current.slice(-(maxEntries - 1)), previous];
      futureRef.current = [];
      sync();
    },
    [maxEntries, sync],
  );

  const undo = useCallback(
    (captureCurrent: (target: T) => T): T | null => {
      const past = pastRef.current;
      if (past.length === 0) return null;
      const restored = past[past.length - 1];
      pastRef.current = past.slice(0, -1);
      futureRef.current = [...futureRef.current, captureCurrent(restored)];
      sync();
      return restored;
    },
    [sync],
  );

  const redo = useCallback(
    (captureCurrent: (target: T) => T): T | null => {
      const future = futureRef.current;
      if (future.length === 0) return null;
      const restored = future[future.length - 1];
      futureRef.current = future.slice(0, -1);
      pastRef.current = [...pastRef.current.slice(-(maxEntries - 1)), captureCurrent(restored)];
      sync();
      return restored;
    },
    [maxEntries, sync],
  );

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    sync();
  }, [sync]);

  return { push, undo, redo, clear, canUndo: counts.past > 0, canRedo: counts.future > 0 };
}
