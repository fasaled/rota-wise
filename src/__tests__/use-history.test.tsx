import { describe, it, expect } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from '../hooks/use-history';
import type { HistoryState } from '../hooks/use-history';

const makeState = (overrides: Partial<Omit<HistoryState, 'timestamp'>> = {}): Omit<HistoryState, 'timestamp'> => ({
  schedule: null,
  doctorsProfiles: [],
  scheduleWarnings: [],
  currentMinInterval: 1,
  ...overrides,
});

describe('useHistory', () => {
  describe('initial state', () => {
    it('starts with an empty stack', () => {
      const { result } = renderHook(() => useHistory());
      expect(result.current.stack).toHaveLength(0);
    });

    it('canUndo is false when stack is empty', () => {
      const { result } = renderHook(() => useHistory());
      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('push', () => {
    it('adds an entry to the stack', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.push(makeState());
      });

      expect(result.current.stack).toHaveLength(1);
    });

    it('sets canUndo to true after push', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.push(makeState());
      });

      expect(result.current.canUndo).toBe(true);
    });

    it('adds a timestamp to each entry', () => {
      const { result } = renderHook(() => useHistory());
      const before = new Date();

      act(() => {
        result.current.push(makeState());
      });

      const after = new Date();
      const entry = result.current.stack[0];
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('stores state fields correctly', () => {
      const { result } = renderHook(() => useHistory());
      const state = makeState({ currentMinInterval: 5, scheduleWarnings: ['warn'] });

      act(() => {
        result.current.push(state);
      });

      expect(result.current.stack[0].currentMinInterval).toBe(5);
      expect(result.current.stack[0].scheduleWarnings).toEqual(['warn']);
    });

    it('accumulates multiple entries', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.push(makeState({ currentMinInterval: 1 }));
        result.current.push(makeState({ currentMinInterval: 2 }));
        result.current.push(makeState({ currentMinInterval: 3 }));
      });

      expect(result.current.stack).toHaveLength(3);
    });

    it('enforces a maximum of 20 entries', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        for (let i = 0; i < 25; i++) {
          result.current.push(makeState({ currentMinInterval: i }));
        }
      });

      expect(result.current.stack).toHaveLength(20);
    });

    it('keeps the most recent entries when limit is exceeded', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        for (let i = 0; i < 25; i++) {
          result.current.push(makeState({ currentMinInterval: i }));
        }
      });

      // The last 20 entries (indices 5-24) should be kept
      const intervals = result.current.stack.map((s) => s.currentMinInterval);
      expect(intervals[0]).toBe(5);
      expect(intervals[19]).toBe(24);
    });
  });

  describe('undo', () => {
    it('returns null when stack is empty', () => {
      const { result } = renderHook(() => useHistory());

      let undone: ReturnType<typeof result.current.undo>;
      act(() => {
        undone = result.current.undo();
      });

      expect(undone!).toBeNull();
    });

    it('returns the most recent state', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.push(makeState({ currentMinInterval: 1 }));
        result.current.push(makeState({ currentMinInterval: 2 }));
      });

      let undone: ReturnType<typeof result.current.undo>;
      act(() => {
        undone = result.current.undo();
      });

      expect(undone!.currentMinInterval).toBe(2);
    });

    it('removes the entry from the stack after undo', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.push(makeState());
        result.current.push(makeState());
      });

      act(() => {
        result.current.undo();
      });

      expect(result.current.stack).toHaveLength(1);
    });

    it('sets canUndo to false after undoing the last entry', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.push(makeState());
      });

      act(() => {
        result.current.undo();
      });

      expect(result.current.canUndo).toBe(false);
    });

    it('returns states in LIFO order', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.push(makeState({ currentMinInterval: 1 }));
        result.current.push(makeState({ currentMinInterval: 2 }));
        result.current.push(makeState({ currentMinInterval: 3 }));
      });

      const results: number[] = [];
      act(() => {
        results.push(result.current.undo()!.currentMinInterval);
        results.push(result.current.undo()!.currentMinInterval);
        results.push(result.current.undo()!.currentMinInterval);
      });

      expect(results).toEqual([3, 2, 1]);
    });

    it('subsequent undo returns null after stack is exhausted', () => {
      const { result } = renderHook(() => useHistory());

      act(() => {
        result.current.push(makeState());
      });

      act(() => {
        result.current.undo();
      });

      let undone: ReturnType<typeof result.current.undo>;
      act(() => {
        undone = result.current.undo();
      });

      expect(undone!).toBeNull();
    });
  });
});
