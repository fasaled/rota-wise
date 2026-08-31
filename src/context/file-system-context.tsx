

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import ExcelJS from 'exceljs';
import type { Locale } from 'date-fns';
import {
  CURRENT_FILE_VERSION,
  type AppFileData,
  type ExcelMetadataPayload,
  type Unit,
  type Schedule,
  type SerializedSchedule,
  type DoctorProfile,
} from '@/lib/types';
import { writeExcelToHandle, extractExcelMetadata } from '@/lib/export-excel';
import { ENABLE_EXCEL } from '@/lib/features';

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
  /** Open an existing .rw, .json, or .xlsx file via the system file picker.
   *  Automatically detects the file type and routes to the correct handler. */
  openAnyFile: () => Promise<{
    data: AppFileData;
    isExcel: boolean;
    handle?: FileSystemFileHandle;
    convertedFromJson?: boolean;
  } | null>;
  /** Open an existing .rw or .json file via the system file picker.
   *  If the opened file is .json, the user is prompted to save a copy as .rw. */
  openFile: () => Promise<{ handle: FileSystemFileHandle; data: AppFileData; convertedFromJson?: boolean } | null>;
  /** Open an existing .xlsx file (metadata mode). Reads the hidden
   *  `_metadata` sheet, parses the JSON payload, and returns it. */
  openExcelMetadata: () => Promise<{ handle: FileSystemFileHandle; payload: ExcelMetadataPayload } | null>;
  /** Create a new .rw file via the system save picker */
  createNewFile: () => Promise<{ handle: FileSystemFileHandle; data: AppFileData } | null>;
  /** Write data to the current file handle */
  saveToFile: (data: AppFileData) => Promise<void>;
  /** Write the calendar state to the currently-open .xlsx handle. The
   *  underlying ExcelJS workbook is rebuilt from scratch with the new
   *  state, so the call is relatively expensive. */
  saveExcelMetadata: (
    schedule: SerializedSchedule,
    doctorsProfiles: DoctorProfile[],
    units: Unit[],
    holidays: Date[],
    locale: Locale,
  ) => Promise<void>;
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
          if (!ENABLE_EXCEL && handle.name.toLowerCase().endsWith('.xlsx')) return;
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

  const openAnyFile = useCallback(async () => {
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
              'application/x-rotawise': ENABLE_EXCEL
                ? ['.rw', '.xlsx']
                : ['.rw'],
              'application/json': ['.json'],
            },
          },
        ],
        multiple: false,
      });

      const fileName = handle.name.toLowerCase();

      if (fileName.endsWith('.xlsx')) {
        if (!ENABLE_EXCEL) {
          throw new Error('Opening .xlsx files is disabled.');
        }
        // XLSX path — extract metadata, return without setting handle (no auto-save)
        const file = await handle.getFile();
        const buffer = await file.arrayBuffer();
        const payload = await extractExcelMetadata(buffer);
        if (!payload) throw new Error('The selected .xlsx does not contain Rotawise metadata.');
        if (payload.fileVersion !== 3) {
          throw new Error(`Unsupported .xlsx metadata fileVersion: ${payload.fileVersion}. Expected 3.`);
        }
        const data: AppFileData = {
          fileVersion: CURRENT_FILE_VERSION,
          versions: [],
          schedule: {
            ...payload.schedule,
            entries: payload.schedule.entries.map((e) => ({
              ...e,
              isFixed: false,
            })),
          },
          doctorsProfiles: payload.doctorsProfiles,
          formValues: {
            numberOfDoctors: payload.doctorsProfiles.length,
            startDate: payload.schedule.startDate,
            endDate: payload.schedule.endDate,
            minIntervalBetweenWorkDays: payload.formValues.minIntervalBetweenWorkDays,
            globalMonthlyShiftLimit: payload.schedule.globalMonthlyShiftLimit,
            doctors: payload.doctorsProfiles.map((d) => ({
              id: d.id,
              name: d.name,
              freeDates: d.freeDates,
              preAssignedWorkDates: d.preAssignedWorkDates ?? [],
              excludedDates: d.excludedDates ?? [],
              isExcludedFromAutomaticAssignment: d.isExcludedFromAutomaticAssignment ?? false,
              unitId: d.unitId ?? '',
            })),
            units: payload.units,
            holidays: payload.holidays,
          } as unknown as AppFileData['formValues'],
          scheduleWarnings: [],
        };
        setFileHandleState(handle);
        return { handle, data, isExcel: true };
      }

      // RW / JSON path — same as openFile
      const perm = await (handle as FileSystemFileHandle & { requestPermission: (d: { mode: string }) => Promise<string> })
        .requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        console.warn('[FileSystem] Write permission not granted; auto-save will be unavailable.');
      }

      const file = await handle.getFile();
      const data = await readFileData(file);

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
          return { handle: rwHandle, data, isExcel: false, convertedFromJson: true };
        } catch (saveErr: unknown) {
          if ((saveErr as { name?: string }).name !== 'AbortError') throw saveErr;
          setFileHandleState(handle);
          return { handle, data, isExcel: false, convertedFromJson: false };
        }
      }

      setFileHandleState(handle);
      return { handle, data, isExcel: false };
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return null;
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

  const openExcelMetadata = useCallback(async () => {
    if (!ENABLE_EXCEL) return null;
    if (!isSupported) return null;
    const win = window as typeof window & {
      showOpenFilePicker: (opts?: object) => Promise<FileSystemFileHandle[]>;
    };
    try {
      const [handle] = await win.showOpenFilePicker({
        types: [
          {
            description: 'Rotawise calendar (.xlsx)',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            },
          },
        ],
        multiple: false,
      });
      const perm = await (handle as FileSystemFileHandle & { requestPermission: (d: { mode: string }) => Promise<string> })
        .requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        console.warn('[FileSystem] Write permission not granted; auto-save will be unavailable.');
      }
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      const payload = await extractExcelMetadata(buffer);
      if (!payload) {
        throw new Error('The selected .xlsx does not contain Rotawise metadata.');
      }
      if (payload.fileVersion !== 3) {
        throw new Error(
          `Unsupported .xlsx metadata fileVersion: ${payload.fileVersion}. Expected 3.`,
        );
      }
      setFileHandleState(handle);
      return { handle, payload };
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return null;
      throw err;
    }
  }, [isSupported]);

  const saveExcelMetadata = useCallback(
    async (
      schedule: SerializedSchedule,
      doctorsProfiles: DoctorProfile[],
      units: Unit[],
      holidays: Date[],
      locale: Locale,
    ) => {
      if (!ENABLE_EXCEL) return;
      if (!fileHandle) return;
      // writeExcelToHandle expects a `Schedule` (with Date objects) but
      // we receive a `SerializedSchedule` from the metadata payload; the
      // structure is identical except entries.date is a string instead of
      // a Date, which `buildWorkbookBuffer` does not read. Coerce to a
      // structurally-compatible type via `unknown` to keep the call site
      // type-safe without a public conversion helper.
      await writeExcelToHandle(
        fileHandle,
        schedule as unknown as Schedule,
        doctorsProfiles,
        units,
        holidays,
        locale,
      );
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
          openAnyFile,
          openFile,
          openExcelMetadata,
          createNewFile,
          saveToFile,
          saveExcelMetadata,
          setFileHandle,
        }}
      >
      {children}
    </FileSystemContext.Provider>
  );
}
