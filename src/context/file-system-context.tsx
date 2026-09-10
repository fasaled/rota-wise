
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { type AppFileData } from '@/lib/types';
import { parseAppFileJson } from '@/lib/schedule-storage';
import {
  clearPersistedFileHandle,
  loadPersistedFileHandle,
  savePersistedFileHandle,
  type PersistenceMode,
} from '@/lib/browser-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenFileResult {
  handle: FileSystemFileHandle | null;
  data: AppFileData;
  fileName: string;
  convertedFromJson?: boolean;
}

export interface SaveFileResult {
  handle: FileSystemFileHandle | null;
  fileName: string;
  downloaded: boolean;
}

interface FileSystemContextValue {
  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;
  persistenceMode: PersistenceMode;
  /** True if showOpenFilePicker / showSaveFilePicker exist (Chromium). */
  isFileSystemAccessSupported: boolean;
  launchQueueData: AppFileData | null;
  clearLaunchQueueData: () => void;
  openFile: () => Promise<OpenFileResult | null>;
  saveAsFile: (data: AppFileData) => Promise<SaveFileResult | null>;
  saveToFile: (data: AppFileData) => Promise<void>;
  clearBinding: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectFileSystemSupport(): boolean {
  return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
}

const RW_OPEN_TYPES = [
  {
    description: 'Rotawise files',
    accept: {
      'application/x-rotawise': ['.rw'],
      'application/json': ['.json'],
    },
  },
];

const RW_SAVE_TYPES = [
  {
    description: 'Rotawise file',
    accept: { 'application/x-rotawise': ['.rw'] },
  },
];

async function writeFileData(handle: FileSystemFileHandle, data: AppFileData): Promise<void> {
  const perm = await (
    handle as FileSystemFileHandle & { queryPermission: (d: { mode: string }) => Promise<string> }
  ).queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    console.warn('[FileSystem] Skipping write — readwrite permission not granted.');
    return;
  }
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

function pickFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rw,.json,application/json,application/x-rotawise';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

function downloadRwFile(data: AppFileData, suggestedName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName.endsWith('.rw') ? suggestedName : `${suggestedName}.rw`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function permissionGranted(handle: FileSystemFileHandle, request: boolean): Promise<boolean> {
  const withPerm = handle as FileSystemFileHandle & {
    queryPermission: (d: { mode: string }) => Promise<string>;
    requestPermission: (d: { mode: string }) => Promise<string>;
  };
  const current = await withPerm.queryPermission({ mode: 'readwrite' });
  if (current === 'granted') return true;
  if (!request) return false;
  return (await withPerm.requestPermission({ mode: 'readwrite' })) === 'granted';
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FileSystemContext = createContext<FileSystemContextValue | null>(null);

export function useFileSystem(): FileSystemContextValue {
  const ctx = useContext(FileSystemContext);
  if (!ctx) throw new Error('useFileSystem must be used inside FileSystemProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function FileSystemProvider({ children }: { children: ReactNode }) {
  const [fileHandle, setFileHandleState] = useState<FileSystemFileHandle | null>(null);
  const [launchQueueData, setLaunchQueueData] = useState<AppFileData | null>(null);
  const [isFileSystemAccessSupported, setIsFileSystemAccessSupported] = useState(false);

  useEffect(() => {
    setIsFileSystemAccessSupported(detectFileSystemSupport());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const handle = await loadPersistedFileHandle();
        if (!handle || cancelled) return;
        if (await permissionGranted(handle, false)) {
          setFileHandleState(handle);
        } else {
          await clearPersistedFileHandle();
        }
      } catch (err) {
        console.warn('[FileSystem] Could not restore persisted file handle', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bindHandle = useCallback(async (handle: FileSystemFileHandle | null) => {
    setFileHandleState(handle);
    try {
      if (handle) await savePersistedFileHandle(handle);
      else await clearPersistedFileHandle();
    } catch (err) {
      console.warn('[FileSystem] Could not persist file handle', err);
    }
  }, []);

  const clearLaunchQueueData = useCallback(() => {
    setLaunchQueueData(null);
  }, []);

  useEffect(() => {
    if (!('launchQueue' in window)) return;

    (
      window as typeof window & {
        launchQueue: { setConsumer: (cb: (params: { files: FileSystemFileHandle[] }) => void) => void };
      }
    ).launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files || launchParams.files.length === 0) return;
      try {
        const handle = launchParams.files[0];
        const file = await handle.getFile();
        const data = parseAppFileJson(await file.text());
        await bindHandle(handle);
        setLaunchQueueData(data);
      } catch (err) {
        console.error('[FileSystem] Error reading file from launchQueue', err);
      }
    });
  }, [bindHandle]);

  const openFile = useCallback(async (): Promise<OpenFileResult | null> => {
    const win = window as typeof window & {
      showOpenFilePicker: (opts?: object) => Promise<FileSystemFileHandle[]>;
      showSaveFilePicker: (opts?: object) => Promise<FileSystemFileHandle>;
    };

    if (isFileSystemAccessSupported) {
      try {
        const [handle] = await win.showOpenFilePicker({
          types: RW_OPEN_TYPES,
          multiple: false,
        });
        const granted = await permissionGranted(handle, true);
        if (!granted) {
          console.warn('[FileSystem] Write permission not granted; auto-save will be unavailable.');
        }

        const file = await handle.getFile();
        const data = parseAppFileJson(await file.text());

        if (handle.name.endsWith('.json')) {
          const suggestedName = handle.name.replace(/\.json$/, '.rw');
          try {
            const rwHandle = await win.showSaveFilePicker({
              suggestedName,
              types: RW_SAVE_TYPES,
            });
            await writeFileData(rwHandle, data);
            await bindHandle(rwHandle);
            return { handle: rwHandle, data, fileName: rwHandle.name, convertedFromJson: true };
          } catch (saveErr: unknown) {
            if ((saveErr as { name?: string }).name !== 'AbortError') throw saveErr;
            await bindHandle(handle);
            return { handle, data, fileName: handle.name, convertedFromJson: false };
          }
        }

        await bindHandle(handle);
        return { handle, data, fileName: handle.name };
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') return null;
        throw err;
      }
    }

    const file = await pickFileViaInput();
    if (!file) return null;
    const data = parseAppFileJson(await file.text());
    await bindHandle(null);
    return { handle: null, data, fileName: file.name };
  }, [isFileSystemAccessSupported, bindHandle]);

  const saveAsFile = useCallback(
    async (data: AppFileData): Promise<SaveFileResult | null> => {
      if (isFileSystemAccessSupported) {
        try {
          const handle = await (
            window as typeof window & { showSaveFilePicker: (opts?: object) => Promise<FileSystemFileHandle> }
          ).showSaveFilePicker({
            suggestedName: fileHandle?.name ?? 'schedule.rw',
            types: RW_SAVE_TYPES,
          });
          await writeFileData(handle, data);
          await bindHandle(handle);
          return { handle, fileName: handle.name, downloaded: false };
        } catch (err: unknown) {
          if ((err as { name?: string }).name === 'AbortError') return null;
          throw err;
        }
      }

      const name = fileHandle?.name ?? 'schedule.rw';
      downloadRwFile(data, name);
      return { handle: null, fileName: name, downloaded: true };
    },
    [isFileSystemAccessSupported, fileHandle, bindHandle],
  );

  const saveToFile = useCallback(
    async (data: AppFileData) => {
      if (!fileHandle) return;
      await writeFileData(fileHandle, data);
    },
    [fileHandle],
  );

  const clearBinding = useCallback(async () => {
    await bindHandle(null);
  }, [bindHandle]);

  const fileName = fileHandle?.name ?? null;
  const persistenceMode: PersistenceMode = fileHandle ? 'file' : 'browser';

  return (
    <FileSystemContext.Provider
      value={{
        fileHandle,
        fileName,
        persistenceMode,
        isFileSystemAccessSupported,
        launchQueueData,
        clearLaunchQueueData,
        openFile,
        saveAsFile,
        saveToFile,
        clearBinding,
      }}
    >
      {children}
    </FileSystemContext.Provider>
  );
}
