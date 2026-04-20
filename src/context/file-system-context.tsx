

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { AppFileData } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileSystemContextValue {
  /** Currently open file handle, or null if no file is open */
  fileHandle: FileSystemFileHandle | null;
  /** Display name of the current file */
  fileName: string | null;
  /** True if the File System Access API is available in this browser */
  isSupported: boolean;
  /** File data received via PWA launchQueue file association */
  launchQueueData: AppFileData | null;
  clearLaunchQueueData: () => void;
  /** Open an existing .rw or .json file via the system file picker.
   *  If the opened file is .json, the user is prompted to save a copy as .rw. */
  openFile: () => Promise<{ handle: FileSystemFileHandle; data: AppFileData; convertedFromJson?: boolean } | null>;
  /** Create a new .rw file via the system save picker */
  createNewFile: () => Promise<{ handle: FileSystemFileHandle; data: AppFileData } | null>;
  /** Write data to the current file handle */
  saveToFile: (data: AppFileData) => Promise<void>;
  /** Fallback: trigger a browser download for browsers without File System Access API */
  downloadFallback: (data: AppFileData, suggestedName?: string) => void;
  /** Set the file handle (e.g. after saving a new file) */
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// NOTE: Do NOT evaluate this at module level — it runs on the server (window undefined → false)
// and causes a React hydration mismatch. Instead, detect inside a useEffect (see FileSystemProvider).
function detectFileSystemSupport(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

function makeEmptyFileData(): AppFileData {
  return {
    fileVersion: 1,
    versions: [],
    schedule: {
      entries: [],
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
    },
    doctorsProfiles: [],
    formValues: {
      numberOfDoctors: 2,
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      doctors: [],
    } as unknown as AppFileData['formValues'],
    scheduleWarnings: [],
  };
}

async function readFileData(file: File): Promise<AppFileData> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  // Migrate old format: add missing fields so both .json and .rw work
  return {
    fileVersion: 1,
    versions: [],
    ...parsed,
  } as AppFileData;
}

async function writeFileData(
  handle: FileSystemFileHandle,
  data: AppFileData,
): Promise<void> {
  // Check permission before writing; skip silently if not yet granted (user will be prompted on next save)
  const perm = await (handle as FileSystemFileHandle & { queryPermission: (d: { mode: string }) => Promise<string> })
    .queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    console.warn('[FileSystem] Skipping write — readwrite permission not granted.');
    return;
  }
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

function downloadFile(data: AppFileData, name = 'schedule.rw') {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  // Start as false (matches SSR), update after mount to avoid hydration mismatch
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(detectFileSystemSupport());

    // Register service worker manually so it works in both dev (Turbopack) and production.
    // next-pwa only injects the registration script during `next build --webpack`, not during
    // `next dev` (Turbopack). The /sw.js generated by the last production build is still served
    // as a static file, so we register it here to ensure installability in all modes.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[PWA] Service worker registration failed:', err);
      });
    }
  }, []);

  const setFileHandle = useCallback((handle: FileSystemFileHandle | null) => {
    setFileHandleState(handle);
  }, []);

  const clearLaunchQueueData = useCallback(() => {
    setLaunchQueueData(null);
  }, []);

  // Register PWA file handler via launchQueue
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('launchQueue' in window)) return;

    (window as typeof window & { launchQueue: { setConsumer: (cb: (params: { files: FileSystemFileHandle[] }) => void) => void } })
      .launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.files || launchParams.files.length === 0) return;
        try {
          const handle = launchParams.files[0];
          const file = await handle.getFile();
          const data = await readFileData(file);
          setFileHandleState(handle);
          setLaunchQueueData(data);
        } catch (err) {
          console.error('[FileSystem] Error reading file from launchQueue', err);
        }
      });
  }, []);

  const openFile = useCallback(async () => {
    if (!isSupported) {
      // Fallback: handled by the caller via a hidden <input type="file">
      return null;
    }
    const win = window as typeof window & {
      showOpenFilePicker: (opts?: object) => Promise<FileSystemFileHandle[]>;
      showSaveFilePicker: (opts?: object) => Promise<FileSystemFileHandle>;
    };
    try {
      const [handle] = await win.showOpenFilePicker({
        types: [
          {
            description: 'Rotawise files',
            accept: {
              'application/x-rotawise': ['.rw'],
              'application/json': ['.json'],
            },
          },
        ],
        multiple: false,
      });
      // Request write permission immediately while still inside the user gesture
      const perm = await (handle as FileSystemFileHandle & { requestPermission: (d: { mode: string }) => Promise<string> })
        .requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        console.warn('[FileSystem] Write permission not granted; auto-save will be unavailable.');
      }

      const file = await handle.getFile();
      const data = await readFileData(file);

      // If a legacy .json file was opened, save a copy as .rw and use that handle
      if (handle.name.endsWith('.json')) {
        const suggestedName = handle.name.replace(/\.json$/, '.rw');
        try {
          const rwHandle = await win.showSaveFilePicker({
            suggestedName,
            types: [
              {
                description: 'Rotawise file',
                accept: { 'application/x-rotawise': ['.rw'] },
              },
            ],
          });
          await writeFileData(rwHandle, data);
          setFileHandleState(rwHandle);
          return { handle: rwHandle, data, convertedFromJson: true };
        } catch (saveErr: unknown) {
          // User cancelled the save-as dialog — continue with the original .json handle
          if ((saveErr as { name?: string }).name !== 'AbortError') throw saveErr;
          setFileHandleState(handle);
          return { handle, data, convertedFromJson: false };
        }
      }

      setFileHandleState(handle);
      return { handle, data };
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return null; // user cancelled open picker
      throw err;
    }
  }, [isSupported]);

  const createNewFile = useCallback(async () => {
    if (!isSupported) {
      // Return empty data for the fallback path
      const data = makeEmptyFileData();
      return { handle: null as unknown as FileSystemFileHandle, data };
    }
    try {
      const handle = await (window as typeof window & { showSaveFilePicker: (opts?: object) => Promise<FileSystemFileHandle> })
        .showSaveFilePicker({
          suggestedName: 'schedule.rw',
          types: [
            {
              description: 'Rotawise file',
              accept: { 'application/x-rotawise': ['.rw'] },
            },
          ],
        });
      const data = makeEmptyFileData();
      await writeFileData(handle, data);
      setFileHandleState(handle);
      return { handle, data };
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return null;
      throw err;
    }
  }, [isSupported]);

  const saveToFile = useCallback(
    async (data: AppFileData) => {
      if (!fileHandle) return;
      await writeFileData(fileHandle, data);
    },
    [fileHandle],
  );

  const downloadFallback = useCallback(
    (data: AppFileData, suggestedName = 'schedule.rw') => {
      downloadFile(data, suggestedName);
    },
    [],
  );

  const fileName = fileHandle?.name ?? null;

  return (
    <FileSystemContext.Provider
      value={{
        fileHandle,
        fileName,
        isSupported,
        launchQueueData,
        clearLaunchQueueData,
        openFile,
        createNewFile,
        saveToFile,
        downloadFallback,
        setFileHandle,
      }}
    >
      {children}
    </FileSystemContext.Provider>
  );
}
