

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import {
  CURRENT_FILE_VERSION,
  type AppFileData,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileSystemContextValue {
  /** Currently held file handle for auto-save */
  fileHandle: FileSystemFileHandle | null;
  /** Display name of the current file */
  fileName: string | null;
  /** True if the File System Access API is available in this browser. Rotawise does
   *  not function on browsers where this is false — the page renders a blocking
   *  message instead of the app shell. */
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectFileSystemSupport(): boolean {
  return 'showOpenFilePicker' in window;
}

function makeEmptyFileData(): AppFileData {
  return {
    fileVersion: CURRENT_FILE_VERSION,
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
      units: [],
    } as unknown as AppFileData['formValues'],
    scheduleWarnings: [],
  };
}

async function readFileData(file: File): Promise<AppFileData> {
  const text = await file.text();
  const parsed: Record<string, unknown> = JSON.parse(text);

  // Migrate old .rw files where the concept was "vacation" (now "free day").
  // - vacationDates → freeDates in doctorsProfiles and formValues.doctors
  // - assignment: 'Vacation' → assignment: 'Free' in schedule.entries
  if (Array.isArray(parsed.doctorsProfiles)) {
    parsed.doctorsProfiles = (parsed.doctorsProfiles as Record<string, unknown>[]).map((d) => {
      if ('vacationDates' in d && !('freeDates' in d)) {
        d.freeDates = d.vacationDates;
        delete d.vacationDates;
      }
      return d;
    });
  }
  if (
    parsed.formValues &&
    typeof parsed.formValues === 'object' &&
    Array.isArray((parsed.formValues as Record<string, unknown>).doctors)
  ) {
    (parsed.formValues as Record<string, unknown>).doctors = (
      (parsed.formValues as Record<string, unknown>).doctors as Record<string, unknown>[]
    ).map((d) => {
      if ('vacationDates' in d && !('freeDates' in d)) {
        d.freeDates = d.vacationDates;
        delete d.vacationDates;
      }
      return d;
    });
  }
  if (
    parsed.schedule &&
    typeof parsed.schedule === 'object' &&
    Array.isArray((parsed.schedule as Record<string, unknown>).entries)
  ) {
    (parsed.schedule as Record<string, unknown>).entries = (
      (parsed.schedule as Record<string, unknown>).entries as Record<string, unknown>[]
    ).map((e) => {
      if (e.assignment === 'Vacation') e.assignment = 'Free';
      return e;
    });
  }

  return {
    fileVersion: (parsed.fileVersion as number) ?? CURRENT_FILE_VERSION,
    versions: [],
    ...parsed,
  } as unknown as AppFileData;
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
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(detectFileSystemSupport());
  }, []);

  const clearLaunchQueueData = useCallback(() => {
    setLaunchQueueData(null);
  }, []);

  // Register PWA file handler via launchQueue
  useEffect(() => {
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
    if (!isSupported) return null;
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
    if (!isSupported) return null;
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
        }}
      >
      {children}
    </FileSystemContext.Provider>
  );
}
