import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCallback } from '../hooks/use-debounced-callback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a function', () => {
    const { result } = renderHook(() => useDebouncedCallback(() => {}, 300));
    expect(typeof result.current).toBe('function');
  });

  it('does not call the callback immediately', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('arg');
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('calls the callback after the wait period', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('hello');
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('hello');
  });

  it('passes arguments correctly to the callback', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 200));

    act(() => {
      result.current('a', 'b', 'c');
    });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(callback).toHaveBeenCalledWith('a', 'b', 'c');
  });

  it('debounces multiple rapid calls (only fires once)', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('first');
      result.current('second');
      result.current('third');
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('uses the arguments from the last call', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('first');
      result.current('second');
      result.current('last');
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(callback).toHaveBeenCalledWith('last');
  });

  it('resets the timer when called again before the wait expires', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    act(() => {
      result.current('first');
    });

    // Advance partway through the wait, then call again
    act(() => {
      jest.advanceTimersByTime(200);
    });

    act(() => {
      result.current('second');
    });

    // Only 200 ms have passed since the second call — callback should not fire
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(callback).not.toHaveBeenCalled();

    // Now advance past the wait from the second call
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('second');
  });

  it('does not call callback after component unmount', () => {
    const callback = jest.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current('arg');
    });

    // Unmount before the timer fires — cleanup should cancel the timer
    unmount();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('fires independently across separate render instances', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();

    const { result: r1 } = renderHook(() => useDebouncedCallback(cb1, 300));
    const { result: r2 } = renderHook(() => useDebouncedCallback(cb2, 300));

    act(() => {
      r1.current('a');
      r2.current('b');
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(cb1).toHaveBeenCalledWith('a');
    expect(cb2).toHaveBeenCalledWith('b');
  });
});
