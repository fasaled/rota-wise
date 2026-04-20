import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { useInfoBar } from '../hooks/use-info-bar';
import type { InfoBarSeverity } from '../hooks/use-info-bar';

describe('useInfoBar', () => {
  describe('initial state', () => {
    it('starts with no messages', () => {
      const { result } = renderHook(() => useInfoBar());
      expect(result.current.messages).toHaveLength(0);
    });
  });

  describe('addMessage', () => {
    it('adds a message to the list', () => {
      const { result } = renderHook(() => useInfoBar());

      act(() => {
        result.current.addMessage({ severity: 'info', title: 'Hello' });
      });

      expect(result.current.messages).toHaveLength(1);
    });

    it('returns a non-empty string id', () => {
      const { result } = renderHook(() => useInfoBar());
      let id = '';

      act(() => {
        id = result.current.addMessage({ severity: 'info', title: 'Test' });
      });

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('the returned id matches the message id in the list', () => {
      const { result } = renderHook(() => useInfoBar());
      let id = '';

      act(() => {
        id = result.current.addMessage({ severity: 'success', title: 'Done' });
      });

      expect(result.current.messages[0].id).toBe(id);
    });

    it('stores the severity correctly', () => {
      const { result } = renderHook(() => useInfoBar());
      const severities: InfoBarSeverity[] = ['success', 'warning', 'error', 'info'];

      for (const severity of severities) {
        act(() => {
          result.current.addMessage({ severity, title: 'Test' });
        });
        const last = result.current.messages[result.current.messages.length - 1];
        expect(last.severity).toBe(severity);
      }
    });

    it('stores the title and description', () => {
      const { result } = renderHook(() => useInfoBar());

      act(() => {
        result.current.addMessage({
          severity: 'warning',
          title: 'Watch out',
          description: 'Something happened',
        });
      });

      const msg = result.current.messages[0];
      expect(msg.title).toBe('Watch out');
      expect(msg.description).toBe('Something happened');
    });

    it('accumulates multiple messages', () => {
      const { result } = renderHook(() => useInfoBar());

      act(() => {
        result.current.addMessage({ severity: 'info', title: 'A' });
        result.current.addMessage({ severity: 'error', title: 'B' });
        result.current.addMessage({ severity: 'success', title: 'C' });
      });

      expect(result.current.messages).toHaveLength(3);
    });

    it('returns unique ids for each message', () => {
      const { result } = renderHook(() => useInfoBar());
      const ids: string[] = [];

      act(() => {
        ids.push(result.current.addMessage({ severity: 'info', title: 'A' }));
        ids.push(result.current.addMessage({ severity: 'info', title: 'B' }));
        ids.push(result.current.addMessage({ severity: 'info', title: 'C' }));
      });

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('dismissMessage', () => {
    it('removes the message with the matching id', () => {
      const { result } = renderHook(() => useInfoBar());
      let id = '';

      act(() => {
        id = result.current.addMessage({ severity: 'info', title: 'Remove me' });
      });

      act(() => {
        result.current.dismissMessage(id);
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('only removes the targeted message', () => {
      const { result } = renderHook(() => useInfoBar());
      let idA = '';

      act(() => {
        idA = result.current.addMessage({ severity: 'info', title: 'A' });
        result.current.addMessage({ severity: 'info', title: 'B' });
      });

      act(() => {
        result.current.dismissMessage(idA);
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].title).toBe('B');
    });

    it('does nothing when id is not found', () => {
      const { result } = renderHook(() => useInfoBar());

      act(() => {
        result.current.addMessage({ severity: 'info', title: 'Keep me' });
      });

      act(() => {
        result.current.dismissMessage('nonexistent-id');
      });

      expect(result.current.messages).toHaveLength(1);
    });
  });

  describe('autoDismiss', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('auto-dismisses a message after the specified delay', () => {
      const { result } = renderHook(() => useInfoBar());

      act(() => {
        result.current.addMessage({
          severity: 'success',
          title: 'Auto-dismiss me',
          autoDismissMs: 1000,
        });
      });

      expect(result.current.messages).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('does not dismiss before the delay has elapsed', () => {
      const { result } = renderHook(() => useInfoBar());

      act(() => {
        result.current.addMessage({
          severity: 'info',
          title: 'Wait for it',
          autoDismissMs: 2000,
        });
      });

      act(() => {
        jest.advanceTimersByTime(999);
      });

      expect(result.current.messages).toHaveLength(1);
    });

    it('messages without autoDismissMs are not auto-removed', () => {
      const { result } = renderHook(() => useInfoBar());

      act(() => {
        result.current.addMessage({ severity: 'error', title: 'Persistent' });
      });

      act(() => {
        jest.advanceTimersByTime(60000);
      });

      expect(result.current.messages).toHaveLength(1);
    });
  });
});
