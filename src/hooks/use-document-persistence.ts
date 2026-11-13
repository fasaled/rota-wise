import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppFileData } from '@/lib/types';
import { saveWorkingCopy } from '@/lib/browser-storage';
import { FilePermissionError } from '@/lib/schedule-storage';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

const PERSIST_DEBOUNCE_MS = 500;

interface Options {
  /** Current document, already serialized. */
  data: AppFileData;
  /** False until the initial restore has finished. */
  enabled: boolean;
  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;
  saveToFile: (data: AppFileData) => Promise<void>;
  requestWritePermission: () => Promise<boolean>;
  onBrowserError: (err: unknown) => void;
  onFileError: (err: unknown) => void;
}

/**
 * Keeps the IndexedDB working copy (always) and the bound `.rw` file (when
 * there is one) in sync with the document, debounced.
 *
 * - `suspend()` / `resume()` bracket operations that swap the document and
 *   the file binding (open, drop, new) so a stale document is never written
 *   into a newly bound file.
 * - If the browser has revoked write access, auto-save to the file pauses
 *   (`autoSaveBlocked`) until `reactivate()` is called from a user gesture.
 */
export function useDocumentPersistence({
  data,
  enabled,
  fileHandle,
  fileName,
  saveToFile,
  requestWritePermission,
  onBrowserError,
  onFileError,
}: Options) {
  const [autoSaveBlocked, setAutoSaveBlocked] = useState(false);
  const blockedRef = useRef(false);
  const suspendedRef = useRef(false);
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });

  const setBlocked = useCallback((blocked: boolean) => {
    blockedRef.current = blocked;
    setAutoSaveBlocked(blocked);
  }, []);

  // A new binding starts with a clean slate.
  useEffect(() => {
    setBlocked(false);
  }, [fileHandle, setBlocked]);

  const persist = useDebouncedCallback(async (doc: AppFileData, bound: boolean) => {
    if (suspendedRef.current) return;
    try {
      await saveWorkingCopy(doc, { mode: bound ? 'file' : 'browser', fileName });
    } catch (err) {
      onBrowserError(err);
    }
    if (!bound || blockedRef.current) return;
    try {
      await saveToFile(doc);
    } catch (err) {
      if (err instanceof FilePermissionError) setBlocked(true);
      else onFileError(err);
    }
  }, PERSIST_DEBOUNCE_MS);

  useEffect(() => {
    if (!enabled || suspendedRef.current) return;
    persist(data, Boolean(fileHandle));
  }, [data, fileHandle, enabled, persist]);

  // Do not lose the last half second of edits when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => persist.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [persist]);

  /** Write pending edits now and stop persisting until `resume()`. */
  const suspend = useCallback(() => {
    persist.flush();
    suspendedRef.current = true;
  }, [persist]);

  /** Resume persisting; the next document change is saved as usual. */
  const resume = useCallback(() => {
    suspendedRef.current = false;
  }, []);

  /** Ask for write access again (needs a user gesture) and save immediately. */
  const reactivate = useCallback(async (): Promise<boolean> => {
    const granted = await requestWritePermission();
    if (!granted) return false;
    setBlocked(false);
    try {
      await saveToFile(latest.current);
    } catch (err) {
      if (err instanceof FilePermissionError) setBlocked(true);
      else onFileError(err);
      return false;
    }
    return true;
  }, [requestWritePermission, saveToFile, setBlocked, onFileError]);

  return { autoSaveBlocked, suspend, resume, reactivate, cancelPending: persist.cancel };
}
