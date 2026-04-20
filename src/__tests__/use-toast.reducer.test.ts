import { describe, it, expect } from 'bun:test';
import { reducer } from '../hooks/use-toast';

// Minimal toast shape for testing the reducer
const makeToast = (id: string, open = true) =>
  ({
    id,
    title: `Toast ${id}`,
    description: `Description for ${id}`,
    open,
  }) as Parameters<typeof reducer>[0]['toasts'][number];

describe('useToast reducer', () => {
  describe('ADD_TOAST', () => {
    it('adds a toast to an empty state', () => {
      const state = { toasts: [] };
      const next = reducer(state, { type: 'ADD_TOAST', toast: makeToast('1') });
      expect(next.toasts).toHaveLength(1);
      expect(next.toasts[0].id).toBe('1');
    });

    it('new toast appears at the front', () => {
      const state = { toasts: [makeToast('old')] };
      const next = reducer(state, { type: 'ADD_TOAST', toast: makeToast('new') });
      expect(next.toasts[0].id).toBe('new');
    });

    it('respects TOAST_LIMIT of 1 (evicts oldest)', () => {
      const state = { toasts: [makeToast('existing')] };
      const next = reducer(state, { type: 'ADD_TOAST', toast: makeToast('fresh') });
      expect(next.toasts).toHaveLength(1);
      expect(next.toasts[0].id).toBe('fresh');
    });

    it('does not mutate the input state', () => {
      const state = { toasts: [] };
      reducer(state, { type: 'ADD_TOAST', toast: makeToast('1') });
      expect(state.toasts).toHaveLength(0);
    });
  });

  describe('UPDATE_TOAST', () => {
    it('updates a matching toast by id', () => {
      const state = { toasts: [makeToast('1')] };
      const next = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated title' },
      });
      expect(next.toasts[0].title).toBe('Updated title');
    });

    it('does not modify non-matching toasts', () => {
      const state = { toasts: [makeToast('1'), makeToast('2')] };
      const next = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Changed' },
      });
      expect(next.toasts[1].title).toBe('Toast 2');
    });

    it('merges partial updates (preserves other fields)', () => {
      const state = {
        toasts: [{ ...makeToast('1'), description: 'Original desc' }],
      };
      const next = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'New title' },
      });
      expect(next.toasts[0].description).toBe('Original desc');
    });

    it('does nothing when id is not found', () => {
      const state = { toasts: [makeToast('1')] };
      const next = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: 'ghost', title: 'X' },
      });
      expect(next.toasts[0].title).toBe('Toast 1');
    });
  });

  describe('DISMISS_TOAST', () => {
    it('sets open to false for a specific toast id', () => {
      const state = { toasts: [makeToast('1'), makeToast('2')] };
      const next = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' });
      expect(next.toasts[0].open).toBe(false);
    });

    it('does not close other toasts when dismissing by id', () => {
      const state = { toasts: [makeToast('1'), makeToast('2')] };
      const next = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' });
      expect(next.toasts[1].open).toBe(true);
    });

    it('closes all toasts when no toastId provided', () => {
      const state = { toasts: [makeToast('1'), makeToast('2')] };
      const next = reducer(state, { type: 'DISMISS_TOAST' });
      expect(next.toasts.every((t) => t.open === false)).toBe(true);
    });

    it('keeps toasts in the list after dismiss (does not remove)', () => {
      const state = { toasts: [makeToast('1'), makeToast('2')] };
      const next = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' });
      expect(next.toasts).toHaveLength(2);
    });
  });

  describe('REMOVE_TOAST', () => {
    it('removes a specific toast by id', () => {
      const state = { toasts: [makeToast('1'), makeToast('2')] };
      const next = reducer(state, { type: 'REMOVE_TOAST', toastId: '1' });
      expect(next.toasts).toHaveLength(1);
      expect(next.toasts[0].id).toBe('2');
    });

    it('removes all toasts when no toastId given', () => {
      const state = { toasts: [makeToast('1'), makeToast('2')] };
      const next = reducer(state, { type: 'REMOVE_TOAST' });
      expect(next.toasts).toHaveLength(0);
    });

    it('does nothing when id is not found', () => {
      const state = { toasts: [makeToast('1')] };
      const next = reducer(state, { type: 'REMOVE_TOAST', toastId: 'ghost' });
      expect(next.toasts).toHaveLength(1);
    });

    it('does not mutate the input state', () => {
      const state = { toasts: [makeToast('1')] };
      reducer(state, { type: 'REMOVE_TOAST', toastId: '1' });
      expect(state.toasts).toHaveLength(1);
    });
  });
});
