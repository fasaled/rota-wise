import { describe, it, expect } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from '../hooks/use-history';

/** Snapshots are opaque to the hook; numbers keep the tests readable. */
const setup = (max?: number) => renderHook(() => useHistory<number>(max));

describe('useHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const { result } = setup();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.undo(() => 0)).toBeNull();
    expect(result.current.redo(() => 0)).toBeNull();
  });

  it('undo returns snapshots in LIFO order', () => {
    const { result } = setup();
    act(() => {
      result.current.push(1);
      result.current.push(2);
    });
    expect(result.current.canUndo).toBe(true);

    const restored: (number | null)[] = [];
    act(() => {
      restored.push(result.current.undo(() => 3));
    });
    act(() => {
      restored.push(result.current.undo(() => 2));
    });
    expect(restored).toEqual([2, 1]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redo replays what undo reverted', () => {
    const { result } = setup();
    // Document goes 1 → 2 → 3; history holds the states *before* each change.
    act(() => {
      result.current.push(1);
      result.current.push(2);
    });
    let current = 3;
    const step = (fn: typeof result.current.undo) =>
      act(() => {
        const restored = fn(() => current);
        if (restored !== null) current = restored;
      });

    step(result.current.undo);
    expect(current).toBe(2);
    step(result.current.undo);
    expect(current).toBe(1);
    step(result.current.redo);
    expect(current).toBe(2);
    step(result.current.redo);
    expect(current).toBe(3);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it('passes the snapshot being restored to the capture function', () => {
    const { result } = setup();
    act(() => result.current.push(7));
    const seen: number[] = [];
    act(() => {
      result.current.undo((target) => {
        seen.push(target);
        return 8;
      });
    });
    expect(seen).toEqual([7]);
  });

  it('a new change discards the redo stack', () => {
    const { result } = setup();
    act(() => result.current.push(1));
    act(() => {
      result.current.undo(() => 2);
    });
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.push(5));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.redo(() => 0)).toBeNull();
  });

  it('keeps only the most recent entries', () => {
    const { result } = setup(3);
    act(() => {
      for (let i = 1; i <= 5; i++) result.current.push(i);
    });
    const restored: (number | null)[] = [];
    act(() => {
      for (let i = 0; i < 4; i++) restored.push(result.current.undo(() => 0));
    });
    expect(restored).toEqual([5, 4, 3, null]);
  });

  it('defaults to 50 entries', () => {
    const { result } = setup();
    act(() => {
      for (let i = 1; i <= 60; i++) result.current.push(i);
    });
    let count = 0;
    act(() => {
      while (result.current.undo(() => 0) !== null) count++;
    });
    expect(count).toBe(50);
  });

  it('clear empties both stacks', () => {
    const { result } = setup();
    act(() => {
      result.current.push(1);
      result.current.push(2);
    });
    act(() => {
      result.current.undo(() => 3);
    });
    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
