import { useEffect, useRef } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Ctrl/Cmd+Z → undo, Ctrl/Cmd+Shift+Z or Ctrl+Y → redo. Ignored while the
 * focus is in a text field, where the browser's own undo must keep working.
 */
export function useUndoShortcuts(onUndo: () => void, onRedo: () => void, enabled = true): void {
  const handlers = useRef({ onUndo, onRedo });
  useEffect(() => {
    handlers.current = { onUndo, onRedo };
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handlers.current.onRedo();
        else handlers.current.onUndo();
      } else if (key === 'y' && !e.shiftKey) {
        e.preventDefault();
        handlers.current.onRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
