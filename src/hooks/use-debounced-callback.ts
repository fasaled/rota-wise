import { useEffect, useMemo, useRef } from 'react';

export interface DebouncedCallback<A extends unknown[]> {
  (...args: A): void;
  /** Run the pending call now, if there is one. */
  flush: () => void;
  /** Drop the pending call, if there is one. */
  cancel: () => void;
}

/**
 * Trailing-edge debounce. The returned function is stable across renders and
 * always invokes the latest `callback` with the latest arguments.
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  wait: number,
): DebouncedCallback<A> {
  const callbackRef = useRef(callback);
  const argsRef = useRef<A | undefined>(undefined);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    callbackRef.current = callback;
  });

  const debounced = useMemo(() => {
    const cancel = () => {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = undefined;
      argsRef.current = undefined;
    };
    const flush = () => {
      const args = argsRef.current;
      if (!timeout.current || !args) return;
      cancel();
      callbackRef.current(...args);
    };
    const fn = ((...args: A) => {
      argsRef.current = args;
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(flush, wait);
    }) as DebouncedCallback<A>;
    fn.flush = flush;
    fn.cancel = cancel;
    return fn;
  }, [wait]);

  useEffect(() => debounced.cancel, [debounced]);

  return debounced;
}
