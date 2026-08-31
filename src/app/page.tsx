import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  CURRENT_FILE_VERSION,
  type Schedule,
  type ScheduleFormValues,
  type DoctorProfile,
  type ScheduleEntry,
  type AppFileData,
  type SerializedDoctorFormFieldInput,
  type DoctorFormFieldInput,
  type Unit,
  type UnitCoverage,
  type ExcelMetadataPayload,
} from '@/lib/types';
import { computeUnitCoverageForDate } from '@/lib/schedule-generator';
import { extractExcelMetadata } from '@/lib/export-excel';
import { ENABLE_EXCEL } from '@/lib/features';
import { type UseFormReturn } from 'react-hook-form';
import DataInputForm from '@/components/rotawise/data-input-form';
const ScheduleCalendarView = lazy(() => import('@/components/rotawise/schedule-calendar-view'));
const ScheduleSummaryTable = lazy(() => import('@/components/rotawise/schedule-summary-table'));
const MonthlyWorkloadSummaryTable = lazy(() => import('@/components/rotawise/MonthlyWorkloadSummaryTable'));
const StartupScreen = lazy(() => import('@/components/rotawise/startup-screen'));
const BrowserNotSupported = lazy(() => import('@/components/rotawise/browser-not-supported'));
import LanguageSelector from '@/components/rotawise/language-selector';
import { InfoBarList } from '@/components/rotawise/info-bar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn, generateId, deduplicateEntries } from '@/lib/utils';
import {
  Users,
  CalendarDays,
  BarChart2,
  LayoutGrid,
  FileText,
  Trash2,
  UserX,
  History,
  AlertTriangle,
  File,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Download,
  Sheet,
  HelpCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { format, isSameDay, differenceInCalendarDays, startOfMonth, endOfMonth, type Locale } from 'date-fns';
import { useLanguage } from '@/context/language-context';
import { useFileSystem } from '@/context/file-system-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { type ScheduleWarning, analyzeBrokenConstraints, analyzeUnitCoverage } from '@/lib/schedule-generator';
import { useScheduleWorker } from '@/hooks/use-schedule-worker';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { useInfoBar, type InfoBarMessage } from '@/hooks/use-info-bar';
import { useHistory } from '@/hooks/use-history';
import { useMetadataModeTour } from '@/hooks/use-metadata-mode-tour';
import { type ActiveFilter } from '@/components/rotawise/calendar-filter-bar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveTab = 'config' | 'calendar' | 'weekly' | 'monthly';

// ---------------------------------------------------------------------------
// Warning derivation
// ---------------------------------------------------------------------------

function computeScheduleWarnings(
  schedule: Schedule | null,
  doctorsProfiles: DoctorProfile[],
  units: Unit[],
  currentMinInterval: number,
  language: string,
  currentDateFnsLocale: Locale,
  t: (key: string, params?: Record<string, any>) => string,
  holidays: Date[] = [],
): string[] {
  if (!schedule) return [];

  const rawWarnings: ScheduleWarning[] = [];

  rawWarnings.push(
    ...analyzeBrokenConstraints(
      schedule.entries,
      doctorsProfiles,
      currentMinInterval,
      schedule.globalMonthlyShiftLimit,
      schedule.startDate,
      schedule.endDate,
      language,
    ),
  );

  rawWarnings.push(
    ...analyzeUnitCoverage(
      schedule.entries,
      doctorsProfiles,
      units,
      schedule.startDate,
      schedule.endDate,
      holidays,
    ),
  );

  const preAssignedByDate = new Map<string, ScheduleEntry[]>();
  for (const entry of schedule.entries) {
    if (entry.assignment === 'Pre-assigned') {
      const key = format(entry.date, 'yyyy-MM-dd');
      const list = preAssignedByDate.get(key) ?? [];
      list.push(entry);
      preAssignedByDate.set(key, list);
    }
  }
  for (const [, entries] of preAssignedByDate) {
    if (entries.length > 1) {
      const doctors = entries
        .map((e) => doctorsProfiles.find((p) => p.id === e.doctorId)?.name)
        .filter((n): n is string => !!n)
        .join(', ');
      rawWarnings.push({
        key: 'warnings.multiplePreAssignedInput',
        params: { date: entries[0].date, doctors },
      });
    }
  }

  const anyDoctorPotentiallyAvailable = doctorsProfiles.some(
    (d) => !d.isExcludedFromAutomaticAssignment,
  );
  if (anyDoctorPotentiallyAvailable) {
    const coveredDates = new Set<string>();
    for (const entry of schedule.entries) {
      if (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned') {
        coveredDates.add(format(entry.date, 'yyyy-MM-dd'));
      }
    }
    const cursor = new Date(schedule.startDate);
    const end = new Date(schedule.endDate);
    while (cursor <= end) {
      if (!coveredDates.has(format(cursor, 'yyyy-MM-dd'))) {
        rawWarnings.push({
          key: 'warnings.uncoveredDay',
          params: { date: new Date(cursor) },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return rawWarnings.map((warning) => {
    const params: Record<string, any> = { ...(warning.params || {}) };
    const dateFields = ['date', 'date1', 'date2'];
    dateFields.forEach((field) => {
      if (params[field] && params[field] instanceof Date) {
        params[field] = format(params[field], 'P', { locale: currentDateFnsLocale });
      }
    });
    return t(warning.key, params);
  });
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

// Parse a date string that may be date-only (from xlsx metadata) or
// an ISO 8601 datetime (from .rw files).  Date-only strings like
// "2024-01-15" must be treated as LOCAL midnight so they match the
// calendar and Excel visible sheets, which both use local-time dates.
// ISO strings (which contain 'T') are handled correctly by `new Date`.
const toLocalDate = (s: string): Date =>
  s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');

function deserializeAppFileData(data: AppFileData): {
  schedule: Schedule | null;
  doctorsProfiles: DoctorProfile[];
  formValues: Partial<ScheduleFormValues> | null;
  scheduleWarnings: string[];
  currentMinInterval: number;
} {
  let schedule: Schedule | null = null;
  let doctorsProfiles: DoctorProfile[] = [];
  let formValues: Partial<ScheduleFormValues> | null = null;
  const scheduleWarnings: string[] = data.scheduleWarnings || [];
  const currentMinInterval = data.currentMinInterval || 1;

  // Only deserialize if there's meaningful data: either a schedule with entries, or form values with doctors
  const hasScheduleData = data.schedule?.startDate && (data.schedule?.entries?.length ?? 0) > 0;
  const hasDoctorData = (data.doctorsProfiles?.length ?? 0) > 0 || (data.formValues?.doctors?.length ?? 0) > 0;

  if (hasScheduleData || hasDoctorData) {
    // Deserialize schedule entries
    const entries: ScheduleEntry[] = (data.schedule?.entries || []).map((e) => {
      const date = toLocalDate(e.date);
      return {
        ...e,
        date,
        dayOfWeek: e.dayOfWeek || date.toLocaleDateString('en-US', { weekday: 'long' }),
      };
    });

    if (data.schedule?.startDate && (data.schedule?.entries?.length ?? 0) > 0) {
      schedule = {
        ...data.schedule,
        startDate: toLocalDate(data.schedule.startDate),
        endDate: toLocalDate(data.schedule.endDate),
        minIntervalBetweenWorkDays: data.schedule.minIntervalBetweenWorkDays || 1,
        globalMonthlyShiftLimit: data.schedule.globalMonthlyShiftLimit,
        entries,
      };
    }

    // Deserialize doctor profiles
    if (data.doctorsProfiles) {
      doctorsProfiles = data.doctorsProfiles.map((p) => ({
        ...p,
        freeDates: (p.freeDates || []).map((d: string) => toLocalDate(d)),
        preAssignedWorkDates: (p.preAssignedWorkDates || []).map((d: string) => toLocalDate(d)),
        excludedDates: (p.excludedDates || []).map((d: string) => toLocalDate(d)),
        isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
      }));
    }

    // Deserialize form values
    if (data.formValues) {
      const formDoctors = (data.formValues.doctors || []).map((doc: SerializedDoctorFormFieldInput) => ({
        id: doc.id,
        name: doc.name,
        freeDates: (doc.freeDates || []).map((d: string) => toLocalDate(d)),
        preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d: string) => toLocalDate(d)),
        excludedDates: (doc.excludedDates || []).map((d: string) => toLocalDate(d)),
        isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
        unitId: doc.unitId || '',
      }));

      formValues = {
        numberOfDoctors: data.formValues.numberOfDoctors,
        startDate: data.formValues.startDate ? toLocalDate(data.formValues.startDate) : new Date(),
        endDate: data.formValues.endDate ? toLocalDate(data.formValues.endDate) : new Date(),
        minIntervalBetweenWorkDays: data.formValues.minIntervalBetweenWorkDays || 1,
        globalMonthlyShiftLimit: data.formValues.globalMonthlyShiftLimit,
        doctors: formDoctors,
        units: (data.formValues.units || []).map((u) => ({
          id: u.id,
          name: u.name,
          minPostCallCoverage: u.minPostCallCoverage,
        })),
      };
    }
  }

  return { schedule, doctorsProfiles, formValues, scheduleWarnings, currentMinInterval };
}

function buildAppFileData(
  schedule: Schedule | null,
  doctorsProfiles: DoctorProfile[],
  formValues: Partial<ScheduleFormValues> | null,
  scheduleWarnings: string[],
  currentMinInterval: number,
  versions: AppFileData['versions'],
): AppFileData {
  // If there are no doctors, clear the schedule to avoid orphaned data
  const hasDoctors = (doctorsProfiles?.length ?? 0) > 0 || (formValues?.doctors?.length ?? 0) > 0;

  const serializedSchedule: AppFileData['schedule'] = hasDoctors && schedule
    ? {
        ...schedule,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        entries: schedule.entries.map((e) => ({ ...e, date: e.date.toISOString() })),
      }
    : {
        entries: [],
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      };

  const serializedDoctors: AppFileData['doctorsProfiles'] = (doctorsProfiles?.length ?? 0) > 0
    ? doctorsProfiles.map((p) => ({
        ...p,
        freeDates: p.freeDates.map((d) => d.toISOString()),
        preAssignedWorkDates: p.preAssignedWorkDates.map((d) => d.toISOString()),
        excludedDates: (p.excludedDates || []).map((d) => d.toISOString()),
        isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
      }))
    : [];

  const serializedFormValues: AppFileData['formValues'] = {
    numberOfDoctors: formValues?.numberOfDoctors || 0,
    startDate: formValues?.startDate ? formValues.startDate.toISOString() : new Date().toISOString(),
    endDate: formValues?.endDate ? formValues.endDate.toISOString() : new Date().toISOString(),
    minIntervalBetweenWorkDays: formValues?.minIntervalBetweenWorkDays || 1,
    globalMonthlyShiftLimit: formValues?.globalMonthlyShiftLimit,
    doctors: (formValues?.doctors || []).map((doc: DoctorFormFieldInput) => ({
      ...doc,
      id: doc.id || generateId(),
      freeDates: (doc.freeDates || []).map((d) => d.toISOString()),
      preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d) => d.toISOString()),
      excludedDates: (doc.excludedDates || []).map((d) => d.toISOString()),
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
      unitId: doc.unitId || undefined,
    })),
    units: ((formValues as { units?: Unit[] } | undefined)?.units ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      minPostCallCoverage: u.minPostCallCoverage,
    })),
    holidays: ((formValues as { holidays?: Date[] } | undefined)?.holidays ?? []).map(
      (d) => (d instanceof Date ? d.toISOString() : (d as string)),
    ),
  } as unknown as AppFileData['formValues'];

  return {
    fileVersion: CURRENT_FILE_VERSION,
    versions,
    schedule: serializedSchedule,
    doctorsProfiles: serializedDoctors,
    formValues: serializedFormValues,
    scheduleWarnings,
    currentMinInterval,
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function RotawisePage() {
  const { t, currentDateFnsLocale, language } = useLanguage();
  const {
    fileHandle,
    fileName,
    isSupported,
    launchQueueData,
    clearLaunchQueueData,
    openFile,
    setFileHandle,
    saveToFile,
    saveExcelMetadata,
  } = useFileSystem();
  const { messages, addMessage, dismissMessage } = useInfoBar();
  const { push: historyPush, undo: historyUndo, canUndo } = useHistory();
  const { generate } = useScheduleWorker();
  const startMetadataModeTour = useMetadataModeTour();

  // Core schedule state
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [doctorsProfiles, setDoctorsProfiles] = useState<DoctorProfile[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [holidays, setHolidays] = useState<Date[]>([]);
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);
  const [warningsCollapsed, setWarningsCollapsed] = useState(true);
  const [calendarFilters, setCalendarFilters] = useState<ActiveFilter[]>([]);
  const [currentMinInterval, setCurrentMinInterval] = useState<number>(1);
  const [loadedFormValues, setLoadedFormValues] = useState<Partial<ScheduleFormValues> | null>(null);

  // UI state
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [dataInputFormKey, setDataInputFormKey] = useState(0);
  const [numDoctorsInForm, setNumDoctorsInForm] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('config');
  const [isFileSessionActive, setIsFileSessionActive] = useState(false);
  const [showClearScheduleDialog, setShowClearScheduleDialog] = useState(false);

  // Metadata mode: opened from an .xlsx export. The app enters a
  // restricted mode (no sidebar, no auto-generation, no day locks). The
  // .xlsx is autosaved on every change with a 1s debounce.
  const [isMetadataMode, setIsMetadataMode] = useState(false);
  // Status of the latest autosave write. 'saving' shows the spinner
  // indicator in the header; 'saved' flashes "Saved" briefly;
  // 'error' shows a red toast.
  const [autosaveStatus, setAutosaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [showClearDoctorDetailsDialog, setShowClearDoctorDetailsDialog] = useState(false);

  // Refs
  const formRef = useRef<UseFormReturn<ScheduleFormValues> | null>(null);

  // Versions (still localStorage-backed via schedule-storage)
  const [fileVersions] = useState<AppFileData['versions']>([]);

  const [stableDefaultFormValues] = useState<Partial<ScheduleFormValues>>(() => ({
    numberOfDoctors: 0,
    startDate: undefined,
    endDate: undefined,
    minIntervalBetweenWorkDays: 1,
    doctors: [],
  }));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Handle PWA launchQueue file (file opened via OS file association)
  useEffect(() => {
    if (!launchQueueData) return;
    hydrateFromFileData(launchQueueData);
    setIsFileSessionActive(true);
    clearLaunchQueueData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchQueueData]);

  // ---------------------------------------------------------------------------
  // Derive warnings from current schedule (covers generation + manual changes)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setScheduleWarnings(
      computeScheduleWarnings(
        schedule,
        doctorsProfiles,
        units,
        currentMinInterval,
        language,
        currentDateFnsLocale,
        t,
        holidays,
      ),
    );
  }, [schedule, doctorsProfiles, units, currentMinInterval, language, currentDateFnsLocale, t, holidays]);

  // ---------------------------------------------------------------------------
  // Auto-save to file (debounced)
  // ---------------------------------------------------------------------------

  const debouncedSaveToFile = useDebouncedCallback(
    async (data: AppFileData) => {
      if (!fileHandle) return;
      try {
        await saveToFile(data);
      } catch (err) {
        console.error('[Page] Auto-save failed:', err);
        addMessage({ severity: 'error', title: t('file.saveError'), autoDismissMs: 5000 });
      }
    },
    500,
  );

  useEffect(() => {
    if (!isMounted || !fileHandle) return;

    // Sync doctorsProfiles with formValues.doctors before saving
    const formDoctorIds = new Set((loadedFormValues?.doctors || []).map((d) => d.id).filter(Boolean));
    const syncedProfiles = formDoctorIds.size === 0
      ? []
      : doctorsProfiles.filter((p) => formDoctorIds.has(p.id));

    const data = buildAppFileData(
      schedule,
      syncedProfiles,
      loadedFormValues,
      scheduleWarnings,
      currentMinInterval,
      fileVersions,
    );
    debouncedSaveToFile(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, doctorsProfiles, scheduleWarnings, currentMinInterval, loadedFormValues, fileHandle, isMounted]);

  // ---------------------------------------------------------------------------
  // File hydration
  // ---------------------------------------------------------------------------

  const hydrateFromFileData = useCallback((data: AppFileData) => {
    const { schedule: s, doctorsProfiles: dp, formValues: fv, scheduleWarnings: sw, currentMinInterval: cmi } =
      deserializeAppFileData(data);
    const hasEntries = !!s && s.entries.length > 0;
    setSchedule(s);
    setDoctorsProfiles(hasEntries ? dp : []);
    setUnits((fv?.units as Unit[] | undefined) ?? []);
    setHolidays(
      ((fv as { holidays?: Date[] | string[] } | undefined)?.holidays ?? []).map(
        (d) => (d instanceof Date ? d : toLocalDate(d)),
      ),
    );
    setScheduleWarnings(sw);
    setCurrentMinInterval(cmi);
    if (fv) {
      setLoadedFormValues(fv);
      setNumDoctorsInForm(fv.numberOfDoctors || 0);
      setDataInputFormKey((prev) => prev + 1);
    }
    if (hasEntries) setActiveTab('calendar');
    else setActiveTab('config');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileReady = useCallback((data: AppFileData, _convertedFromJson?: boolean, isExcel?: boolean) => {
    if (isExcel && !ENABLE_EXCEL) return;
    hydrateFromFileData(data);
    setIsFileSessionActive(true);
    if (isExcel) {
      setIsMetadataMode(true);
      setActiveTab('calendar');
    }
    addMessage({ severity: 'success', title: t('file.opened'), autoDismissMs: 3000 });
  }, [hydrateFromFileData, addMessage, t]);

  // Autosave effect: in metadata mode, write the current state to the
  // .xlsx file 1 second after the last change. The 1s debounce is long
  // enough to collapse rapid changes (e.g. dragging a doctor through
  // multiple days) into a single write, but short enough that the file
  // stays in sync with what the user sees.
  useEffect(() => {
    if (!isMetadataMode) return;
    if (!schedule) return;
    setAutosaveStatus('saving');
    const handle = setTimeout(() => {
      let cancelled = false;
      void saveExcelMetadata(
        schedule as unknown as Parameters<typeof saveExcelMetadata>[0],
        doctorsProfiles,
        units,
        holidays,
        currentDateFnsLocale,
      )
        .then(() => {
          if (cancelled) return;
          setAutosaveStatus('saved');
          setTimeout(() => {
            if (!cancelled) setAutosaveStatus('idle');
          }, 2000);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setAutosaveStatus('error');
          addMessage({
            severity: 'error',
            title: t('page.toast.errorSavingExcel.title'),
            description: err.message,
            autoDismissMs: 5000,
          });
        });
      return () => {
        cancelled = true;
      };
    }, 1000);
    return () => {
      clearTimeout(handle);
    };
  }, [isMetadataMode, schedule, doctorsProfiles, units, holidays, currentDateFnsLocale, saveExcelMetadata, addMessage, t]);

  // beforeunload: warn the user if the autosave is still in progress.
  useEffect(() => {
    if (!isMetadataMode) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (autosaveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isMetadataMode, autosaveStatus]);

  // Drag-and-drop: global handler for .xlsx files (works everywhere, not
  // just on the startup screen). .rw / .json drops trigger the file picker.
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      if (ENABLE_EXCEL && file.name.toLowerCase().endsWith('.xlsx')) {
        const item = e.dataTransfer?.items?.[0];
        const handlePromise: Promise<FileSystemFileHandle | null> =
          item && 'getAsFileSystemHandle' in item
            ? (item as DataTransferItem & { getAsFileSystemHandle: () => Promise<FileSystemFileHandle | null> }).getAsFileSystemHandle().catch(() => null)
            : Promise.resolve(null);
        void handlePromise.then((fh) => openAndLoadExcelFromFile(file, fh ?? undefined));
      } else if (
        file.name.toLowerCase().endsWith('.rw') ||
        file.name.toLowerCase().endsWith('.json')
      ) {
        void openFile();
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile]);

  const openAndLoadExcelFromFile = useCallback(
    async (file: File, draggedHandle?: FileSystemFileHandle) => {
      if (!ENABLE_EXCEL) return;
      try {
        const buffer = await file.arrayBuffer();
        const payload = await extractExcelMetadata(buffer);
        if (!payload) {
          addMessage({
            severity: 'error',
            title: t('page.toast.invalidExcel.title'),
            description: t('page.toast.invalidExcel.noMetadata'),
            autoDismissMs: 5000,
          });
          return;
        }
        if (payload.fileVersion !== 3) {
          addMessage({
            severity: 'error',
            title: t('page.toast.invalidExcel.title'),
            description: `Unsupported fileVersion: ${payload.fileVersion}`,
            autoDismissMs: 5000,
          });
          return;
        }
        const deserializedSchedule: Schedule = {
          ...payload.schedule,
          startDate: toLocalDate(payload.schedule.startDate),
          endDate: toLocalDate(payload.schedule.endDate),
          entries: payload.schedule.entries.map((e) => {
            const date = toLocalDate(e.date);
            return {
              ...e,
              date,
              dayOfWeek: e.dayOfWeek || date.toLocaleDateString('en-US', { weekday: 'long' }),
              isFixed: false,
            };
          }),
        };
        const deserializedDoctors: DoctorProfile[] = payload.doctorsProfiles.map(
          (d) => ({
            ...d,
            freeDates: d.freeDates.map((v) => toLocalDate(v)),
            preAssignedWorkDates: (d.preAssignedWorkDates ?? []).map((v) => toLocalDate(v)),
            excludedDates: (d.excludedDates ?? []).map((v) => toLocalDate(v)),
          }),
        );
        setSchedule(deserializedSchedule);
        setDoctorsProfiles(deserializedDoctors);
        setUnits(payload.units);
        setHolidays(payload.holidays.map((d) => toLocalDate(d)));
        setCurrentMinInterval(payload.formValues.minIntervalBetweenWorkDays);
        setLoadedFormValues({
          minIntervalBetweenWorkDays: payload.formValues.minIntervalBetweenWorkDays,
          numberOfDoctors: deserializedDoctors.length,
          doctors: [],
        });
        setDataInputFormKey((k) => k + 1);
        if (draggedHandle) setFileHandle(draggedHandle);
        setIsMetadataMode(true);
        setIsFileSessionActive(true);
        setActiveTab('calendar');
        addMessage({
          severity: 'success',
          title: t('file.opened'),
          autoDismissMs: 4000,
        });
      } catch (err) {
        addMessage({
          severity: 'error',
          title: t('page.toast.invalidExcel.title'),
          description: (err as Error).message,
          autoDismissMs: 5000,
        });
      }
    },
    [addMessage, setFileHandle, t],
  );

  const handleFileError = useCallback((msg: string) => {
    addMessage({ severity: 'error', title: msg, autoDismissMs: 5000 });
  }, [addMessage]);

  // ---------------------------------------------------------------------------
  // Schedule generation
  // ---------------------------------------------------------------------------

  const handleSubmitForm = async (data: ScheduleFormValues) => {
    // Save current state to history before overwriting
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });
    setIsLoading(true);
    setScheduleWarnings([]);
    setCurrentMinInterval(data.minIntervalBetweenWorkDays || 1);

    const profiles: DoctorProfile[] = data.doctors.map((doc) => ({
      id: doc.id,
      name: doc.name,
      freeDates: doc.freeDates,
      preAssignedWorkDates: doc.preAssignedWorkDates,
      excludedDates: doc.excludedDates || [],
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
      unitId: doc.unitId || undefined,
    }));
    setDoctorsProfiles(profiles);
    const formUnits: Unit[] = ((data as { units?: Unit[] }).units ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      minPostCallCoverage: u.minPostCallCoverage,
    }));
    setUnits(formUnits);

    const existingFixedEntries = schedule?.entries.filter((e) => e.isFixed) || [];
    const result = await generate(data, existingFixedEntries);
    setIsLoading(false);

    if (result.error) {
      addMessage({
        severity: 'error',
        title: t('page.toast.errorGenerating.title'),
        description: result.error,
        autoDismissMs: 5000,
      });
      setSchedule(null);
    } else if (result.schedule) {
      const rawEntries = result.schedule.entries.map((e) => ({ ...e, date: new Date(e.date) }));
      const processedSchedule: Schedule = {
        ...result.schedule,
        startDate: result.schedule.startDate,
        endDate: result.schedule.endDate,
        entries: deduplicateEntries(rawEntries),
      };
      setSchedule(processedSchedule);
      addMessage({
        severity: 'success',
        title: t('page.toast.scheduleGenerated.title'),
        description: t('page.toast.scheduleGenerated.description'),
        autoDismissMs: 3000,
      });
    }
  };

  // Trigger form submission from outside the form (e.g. header action button).
  // Works regardless of which tab is active because it goes through react-hook-form,
  // not the HTML form element which is only mounted inside the config tab.
  const handleGenerateClick = () => {
    if (!formRef.current) return;
    void formRef.current.handleSubmit(handleSubmitForm)();
  };

  // ---------------------------------------------------------------------------
  // Schedule entry updates
  // ---------------------------------------------------------------------------

  const handleArbitraryScheduleEntry = useCallback((updatedEntry: ScheduleEntry) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    // Arbitrary assignments: only remove direct conflicts on the same date, keep entries from other dates
    const newEntries = schedule.entries.filter((e) => {
      if (isSameDay(e.date, updatedEntry.date)) {
        // Remove the old entry for this doctor on the same date
        if (e.doctorId === updatedEntry.doctorId &&
            (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
            (updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned')) {
          return false;
        }
        if ((updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned') &&
            (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
            e.doctorId !== updatedEntry.doctorId) {
          return false; // Remove conflicting Work/Pre-assigned from other doctor on same date
        }
        if ((updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned') &&
            e.doctorId === 'system' && e.assignment === 'Off') {
          return false; // Remove system 'Off' entry on same date
        }
      }
      return true;
    });

    newEntries.push(updatedEntry);
    const updatedSchedule = { ...schedule, entries: deduplicateEntries(newEntries) };
    setSchedule(updatedSchedule);
  }, [schedule, historyPush, deduplicateEntries]);

  const handleSwapScheduleEntries = useCallback((entry1: ScheduleEntry, entry2: ScheduleEntry, oldDate1?: Date, oldDate2?: Date) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    // Filter: remove entries from old positions and add swapped ones
    const newEntries = schedule.entries.filter((e) => {
      // Remove entry1 from its old date if provided
      if (oldDate1 && isSameDay(e.date, oldDate1) && e.doctorId === entry1.doctorId &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
          (entry1.assignment === 'Work' || entry1.assignment === 'Pre-assigned')) {
        return false;
      }

      // Remove entry2 from its old date if provided
      if (oldDate2 && isSameDay(e.date, oldDate2) && e.doctorId === entry2.doctorId &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
          (entry2.assignment === 'Work' || entry2.assignment === 'Pre-assigned')) {
        return false;
      }

      // If old dates not provided, fall back to removing in new dates
      if (!oldDate1 && isSameDay(e.date, entry1.date) && e.doctorId === entry1.doctorId &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
          (entry1.assignment === 'Work' || entry1.assignment === 'Pre-assigned')) {
        return false;
      }

      if (!oldDate2 && isSameDay(e.date, entry2.date) && e.doctorId === entry2.doctorId &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
          (entry2.assignment === 'Work' || entry2.assignment === 'Pre-assigned')) {
        return false;
      }

      return true;
    });

    // Add the swapped entries
    newEntries.push(entry1, entry2);

    const effectiveMinInterval = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
    const doctorProfile1 = doctorsProfiles.find((dp) => dp.id === entry1.doctorId);
    const doctorProfile2 = doctorsProfiles.find((dp) => dp.id === entry2.doctorId);

    // Collect validation messages
    const pendingMessages: Omit<InfoBarMessage, 'id'>[] = [];

    // Validate entry1
    if (doctorProfile1 && (entry1.assignment === 'Work' || entry1.assignment === 'Pre-assigned')) {
      const otherWorkEntries = newEntries.filter(
        (e) =>
          e.doctorId === entry1.doctorId &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
          !isSameDay(e.date, entry1.date),
      );

      const before = otherWorkEntries
        .filter((e) => e.date < entry1.date)
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

      const after = otherWorkEntries
        .filter((e) => e.date > entry1.date)
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

      if (before && differenceInCalendarDays(entry1.date, before.date) <= effectiveMinInterval) {
        pendingMessages.push({
          severity: 'warning',
          title: t('page.toast.minIntervalWarning.title'),
          description: t('page.toast.minIntervalWarning.description', {
            doctorName: doctorProfile1.name,
            interval: effectiveMinInterval,
          }),
          autoDismissMs: 5000,
        });
      }
      if (after && differenceInCalendarDays(after.date, entry1.date) <= effectiveMinInterval) {
        pendingMessages.push({
          severity: 'warning',
          title: t('page.toast.minIntervalWarning.title'),
          description: t('page.toast.minIntervalWarning.description', {
            doctorName: doctorProfile1.name,
            interval: effectiveMinInterval,
          }),
          autoDismissMs: 5000,
        });
      }
    }

    // Validate entry2
    if (doctorProfile2 && (entry2.assignment === 'Work' || entry2.assignment === 'Pre-assigned')) {
      const otherWorkEntries = newEntries.filter(
        (e) =>
          e.doctorId === entry2.doctorId &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
          !isSameDay(e.date, entry2.date),
      );

      const before = otherWorkEntries
        .filter((e) => e.date < entry2.date)
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

      const after = otherWorkEntries
        .filter((e) => e.date > entry2.date)
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

      if (before && differenceInCalendarDays(entry2.date, before.date) <= effectiveMinInterval) {
        pendingMessages.push({
          severity: 'warning',
          title: t('page.toast.minIntervalWarning.title'),
          description: t('page.toast.minIntervalWarning.description', {
            doctorName: doctorProfile2.name,
            interval: effectiveMinInterval,
          }),
          autoDismissMs: 5000,
        });
      }
      if (after && differenceInCalendarDays(after.date, entry2.date) <= effectiveMinInterval) {
        pendingMessages.push({
          severity: 'warning',
          title: t('page.toast.minIntervalWarning.title'),
          description: t('page.toast.minIntervalWarning.description', {
            doctorName: doctorProfile2.name,
            interval: effectiveMinInterval,
          }),
          autoDismissMs: 5000,
        });
      }
    }

    setSchedule({ ...schedule, entries: deduplicateEntries(newEntries) });
    pendingMessages.forEach((msg) => addMessage(msg));
  }, [schedule, historyPush, doctorsProfiles, currentMinInterval, addMessage, t, deduplicateEntries]);

  const handleUpdateScheduleEntry = useCallback((updatedEntry: ScheduleEntry, oldDate?: Date) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    // Compute new entries imperatively (outside state updater to avoid StrictMode double-invoke)
    let newEntries: ScheduleEntry[];

    if (updatedEntry.assignment === 'Off') {
      newEntries = schedule.entries.filter((e) => {
        if (isSameDay(e.date, updatedEntry.date)) {
          return e.assignment === 'Free';
        }
        return true;
      });
      if (!newEntries.some((e) => isSameDay(e.date, updatedEntry.date) && e.doctorId === 'system' && e.assignment === 'Off')) {
        newEntries.push(updatedEntry);
      }
    } else {
      newEntries = schedule.entries.filter((e) => {
        // Remove the entry from its old date if provided (for moves)
        if (oldDate && isSameDay(e.date, oldDate) && e.doctorId === updatedEntry.doctorId &&
            (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
            (updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned')) {
          return false;
        }

        if (isSameDay(e.date, updatedEntry.date)) {
          // Remove the old entry for this doctor on the target date
          if (e.doctorId === updatedEntry.doctorId) {
            if ((e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
                (updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned')) {
              return false; // Remove old entry same doctor on same date
            }
          }
          // Remove conflicting Work/Pre-assigned entries from other doctors
          if ((updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned') &&
              (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
              e.doctorId !== updatedEntry.doctorId) {
            return false; // Remove conflicting Work/Pre-assigned from other doctor
          }
          if ((updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned') &&
              e.doctorId === 'system' && e.assignment === 'Off') {
            return false; // Remove system 'Off' entry
          }
        }
        return true;
      });
      newEntries.push(updatedEntry);
    }

    const effectiveMinInterval = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
    const doctorProfile = doctorsProfiles.find((dp) => dp.id === updatedEntry.doctorId);

    // Collect validation messages — called after setSchedule to avoid double-fire
    const pendingMessages: Omit<InfoBarMessage, 'id'>[] = [];

    if (doctorProfile && (updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned')) {
      const otherWorkEntries = newEntries.filter(
        (e) =>
          e.doctorId === updatedEntry.doctorId &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
          !isSameDay(e.date, updatedEntry.date),
      );

      const before = otherWorkEntries
        .filter((e) => e.date < updatedEntry.date)
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

      const after = otherWorkEntries
        .filter((e) => e.date > updatedEntry.date)
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

      if (before && differenceInCalendarDays(updatedEntry.date, before.date) <= effectiveMinInterval) {
        pendingMessages.push({
          severity: 'warning',
          title: t('page.toast.minIntervalWarning.title'),
          description: t('page.toast.minIntervalWarning.description', {
            doctorName: doctorProfile.name,
            interval: effectiveMinInterval,
          }),
          autoDismissMs: 5000,
        });
      }
      if (after && differenceInCalendarDays(after.date, updatedEntry.date) <= effectiveMinInterval) {
        pendingMessages.push({
          severity: 'warning',
          title: t('page.toast.minIntervalWarning.title'),
          description: t('page.toast.minIntervalWarning.description', {
            doctorName: doctorProfile.name,
            interval: effectiveMinInterval,
          }),
          autoDismissMs: 5000,
        });
      }

      if (updatedEntry.assignment === 'Work') {
        if (doctorProfile.freeDates.some((vd) => isSameDay(vd, updatedEntry.date))) {
          pendingMessages.push({
            severity: 'error',
            title: t('page.toast.scheduleWarning.title'),
            description: t('page.toast.scheduleWarning.description', { doctorName: doctorProfile.name }),
            autoDismissMs: 5000,
          });
        }
        if ((doctorProfile.excludedDates || []).some((ed) => isSameDay(ed, updatedEntry.date))) {
          pendingMessages.push({
            severity: 'warning',
            title: t('page.toast.scheduleWarning.title'),
            description: t('page.toast.excludedDayWarning.description', { doctorName: doctorProfile.name }),
            autoDismissMs: 5000,
          });
        }
      }
    }

    newEntries.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      return diff !== 0 ? diff : a.doctorId.localeCompare(b.doctorId);
    });

    const updatedSchedule = { ...schedule, entries: deduplicateEntries(newEntries) };
    setSchedule(updatedSchedule);
    pendingMessages.forEach((msg) => addMessage(msg));
  }, [schedule, historyPush, doctorsProfiles, currentMinInterval, addMessage, t, language, currentDateFnsLocale]);

  // ---------------------------------------------------------------------------
  // Toggle month fixed
  // ---------------------------------------------------------------------------

  const handleToggleMonthFixed = useCallback((month: Date, isFixed: boolean) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const updatedEntries = schedule.entries.map((entry) => {
      const d = new Date(entry.date);
      if (
        d >= monthStart &&
        d <= monthEnd &&
        (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')
      ) {
        return { ...entry, isFixed };
      }
      return entry;
    });

    setSchedule({ ...schedule, entries: updatedEntries });
    addMessage({
      severity: 'success',
      title: isFixed ? t('page.toast.monthFixed.title') : t('page.toast.monthUnfixed.title'),
      description: isFixed
        ? t('page.toast.monthFixed.description', { month: format(month, 'MMMM yyyy', { locale: currentDateFnsLocale }) })
        : t('page.toast.monthUnfixed.description', { month: format(month, 'MMMM yyyy', { locale: currentDateFnsLocale }) }),
      autoDismissMs: 3000,
    });
  }, [schedule, historyPush, addMessage, t, currentDateFnsLocale]);

  // ---------------------------------------------------------------------------
  // Toggle isFixed on a single entry
  // ---------------------------------------------------------------------------

  const handleToggleEntryFixed = useCallback((entry: ScheduleEntry, isFixed: boolean) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    const updatedEntries = schedule.entries.map((e) => {
      if (
        isSameDay(e.date, entry.date) &&
        e.doctorId === entry.doctorId &&
        e.assignment === entry.assignment
      ) {
        return { ...e, isFixed };
      }
      return e;
    });

    setSchedule({ ...schedule, entries: updatedEntries });
  }, [schedule, historyPush]);

  // ---------------------------------------------------------------------------
  // Remove all Work entries for a specific date
  // ---------------------------------------------------------------------------

  const handleRemoveWorkEntriesForDate = useCallback((targetDate: Date) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    const newEntries = schedule.entries.filter(
      (e) => !(e.assignment === 'Work' && isSameDay(e.date, targetDate)),
    );

    setSchedule({ ...schedule, entries: newEntries });
  }, [schedule, historyPush]);

  // ---------------------------------------------------------------------------
  // Toggle free day from calendar
  // ---------------------------------------------------------------------------

  const handleToggleFreeDay = useCallback((date: Date, doctorId: string) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    const dateStr = date.toISOString().split('T')[0];
    const doctor = doctorsProfiles.find(d => d.id === doctorId);
    if (!doctor) return;

    const hasFreeEntry = schedule.entries.some(
      e => e.doctorId === doctorId && isSameDay(e.date, date) && e.assignment === 'Free'
    );

    if (hasFreeEntry) {
      setSchedule(prev => prev ? {
        ...prev,
        entries: prev.entries.filter(e =>
          !(isSameDay(e.date, date) && e.doctorId === doctorId && e.assignment === 'Free')
        ),
      } : prev);

      setDoctorsProfiles(prev => prev.map(d =>
        d.id === doctorId
          ? { ...d, freeDates: d.freeDates.filter(fd => !isSameDay(fd, date)) }
          : d
      ));

      setLoadedFormValues(prev => prev ? {
        ...prev,
        doctors: prev.doctors?.map(d =>
          d.id === doctorId
            ? { ...d, freeDates: (d.freeDates || []).filter((fd: Date | string) => !isSameDay(new Date(fd), date)) }
            : d
        ) ?? [],
      } : prev);
    } else {
      setSchedule(prev => prev ? {
        ...prev,
        entries: [...prev.entries, {
          date,
          doctorId,
          assignment: 'Free' as const,
          dayOfWeek: format(date, 'EEEE'),
        }],
      } : prev);

      setDoctorsProfiles(prev => prev.map(d =>
        d.id === doctorId
          ? { ...d, freeDates: [...d.freeDates, date] }
          : d
      ));

      setLoadedFormValues(prev => prev ? {
        ...prev,
        doctors: prev.doctors?.map(d =>
          d.id === doctorId
            ? { ...d, freeDates: [...(d.freeDates || []), date] }
            : d
        ) ?? [],
      } : prev);
    }

    // Force the templates form to remount so it picks up the new freeDates
    setDataInputFormKey((k) => k + 1);
  }, [schedule, doctorsProfiles, scheduleWarnings, currentMinInterval, historyPush, setDataInputFormKey]);

  // ---------------------------------------------------------------------------
  // Clear actions
  // ---------------------------------------------------------------------------

  const handleClearSchedule = () => {
    setSchedule(null);
    setScheduleWarnings([]);
    setActiveTab('config');
    if (fileHandle) {
      saveToFile(buildAppFileData(null, doctorsProfiles, loadedFormValues, [], currentMinInterval, fileVersions))
        .catch(console.error);
    }
    addMessage({
      severity: 'success',
      title: t('page.toast.scheduleCleared.title'),
      description: t('page.toast.scheduleCleared.description'),
      autoDismissMs: 3000,
    });
    setShowClearScheduleDialog(false);
  };

  const handleClearDoctorDetails = () => {
    if (formRef.current) {
      const current = formRef.current.getValues();
      const reset: ScheduleFormValues = { ...current, numberOfDoctors: 0, doctors: [] };
      formRef.current.reset(reset);
      setNumDoctorsInForm(0);
      setLoadedFormValues(reset);
      setDoctorsProfiles([]);
      if (fileHandle) {
        saveToFile(buildAppFileData(schedule, [], reset, scheduleWarnings, currentMinInterval, fileVersions))
          .catch(console.error);
      }
      addMessage({
        severity: 'success',
        title: t('page.toast.clearedDoctorItems.title'),
        description: t('page.toast.clearedDoctorItems.description'),
        autoDismissMs: 3000,
      });
    }
    setShowClearDoctorDetailsDialog(false);
  };

  // ---------------------------------------------------------------------------
  // Live form values change
  // ---------------------------------------------------------------------------

  const handleLiveFormValuesChange = useCallback((values: ScheduleFormValues) => {
    if (typeof values.numberOfDoctors === 'number') {
      setNumDoctorsInForm(values.numberOfDoctors);
    }
    setLoadedFormValues(values);

    // Sync doctorsProfiles with the form's doctors. We must do a full
    // update (not just a filter-by-id) so that fields like `unitId`,
    // `freeDates`, etc. propagate to the coverage/dots computation
    // immediately when the user edits the roster.
    const formDoctorsById = new Map<string, DoctorFormFieldInput>(
      values.doctors.filter((d) => !!d.id).map((d) => [d.id as string, d]),
    );
    if (formDoctorsById.size === 0) {
      setDoctorsProfiles([]);
    } else {
      setDoctorsProfiles((prev) => {
        // Keep the existing profile for each form doctor (to preserve order
        // and avoid churn) but refresh all mutable fields from the form.
        const refreshed: DoctorProfile[] = [];
        const seen = new Set<string>();
        for (const formDoc of values.doctors) {
          if (!formDoc.id) continue;
          seen.add(formDoc.id);
          refreshed.push({
            id: formDoc.id,
            name: formDoc.name,
            freeDates: formDoc.freeDates,
            preAssignedWorkDates: formDoc.preAssignedWorkDates,
            excludedDates: formDoc.excludedDates || [],
            isExcludedFromAutomaticAssignment: formDoc.isExcludedFromAutomaticAssignment || false,
            unitId: formDoc.unitId || undefined,
          });
        }
        // Preserve any profile from prev that was in the form (safety net).
        for (const p of prev) {
          if (seen.has(p.id)) continue;
          if (formDoctorsById.has(p.id)) {
            seen.add(p.id);
            refreshed.push(p);
          }
        }

        return refreshed;
      });
    }

    // Sync units so coverage/dots reflect the latest list.
    const formUnits: Unit[] = ((values as { units?: Unit[] }).units ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      minPostCallCoverage: u.minPostCallCoverage,
    }));
    setUnits(formUnits);

    // Sync holidays the same way units are synced: the form is the source
    // of truth, and we need them in state for `computeScheduleWarnings`,
    // `buildAppFileData`, and the calendar's coverage memo.
    const rawFormHolidays = (values as { holidays?: Date[] | string[] }).holidays ?? [];
    setHolidays(
      rawFormHolidays.map((d) => (d instanceof Date ? d : new Date(d))),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  const handleExportWord = async () => {
    if (!schedule || !doctorsProfiles.length) {
      addMessage({
        severity: 'error',
        title: t('page.toast.noScheduleToExport.title'),
        description: t('page.toast.noScheduleToExport.description'),
        autoDismissMs: 4000,
      });
      return;
    }
    setIsExportingWord(true);
    try {
      const { exportWord } = await import('@/lib/export-word');
      await exportWord({
        schedule,
        doctorsProfiles,
        holidays,
        fileName,
        locale: currentDateFnsLocale,
      });
    } catch (err) {
      addMessage({
        severity: 'error',
        title: t('page.toast.errorSavingWord.title'),
        description: (err as Error).message,
        autoDismissMs: 5000,
      });
    } finally {
      setIsExportingWord(false);
    }
  };

  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleExportExcel = async () => {
    if (!ENABLE_EXCEL) return;
    if (!schedule || !doctorsProfiles.length) {
      addMessage({
        severity: 'error',
        title: t('page.toast.noScheduleToExport.title'),
        description: t('page.toast.noScheduleToExport.description'),
        autoDismissMs: 4000,
      });
      return;
    }
    setIsExportingExcel(true);
    try {
      const { exportExcel } = await import('@/lib/export-excel');
      await exportExcel({
        schedule,
        doctorsProfiles,
        units,
        holidays,
        fileName,
        locale: currentDateFnsLocale,
      });
    } catch (err) {
      addMessage({
        severity: 'error',
        title: t('page.toast.errorSavingExcel.title'),
        description: (err as Error).message,
        autoDismissMs: 5000,
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Undo history
  // ---------------------------------------------------------------------------

  const handleUndoHistory = () => {
    const prev = historyUndo();
    if (!prev) return;
    setSchedule(prev.schedule);
    setDoctorsProfiles(prev.doctorsProfiles);
    setScheduleWarnings(prev.scheduleWarnings);
    setCurrentMinInterval(prev.currentMinInterval);
    if (prev.schedule) {
      setActiveTab('calendar');
    }
    addMessage({ severity: 'info', title: t('page.toast.undone'), autoDismissMs: 2000 });
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!isSupported) {
    return (
      <Suspense fallback={null}>
        <BrowserNotSupported />
      </Suspense>
    );
  }

  // ---------------------------------------------------------------------------
  // Sidebar nav items
  // ---------------------------------------------------------------------------

  const hasScheduleEntries = !!schedule && schedule.entries.length > 0;

  const navItems: { id: ActiveTab; icon: React.ElementType; labelKey: string; disabled?: boolean }[] = [
    { id: 'config', icon: Users, labelKey: 'nav.config' },
    { id: 'calendar', icon: CalendarDays, labelKey: 'nav.calendar', disabled: !schedule },
    { id: 'weekly', icon: BarChart2, labelKey: 'nav.weeklySummary', disabled: !hasScheduleEntries },
    { id: 'monthly', icon: LayoutGrid, labelKey: 'nav.monthlySummary', disabled: !hasScheduleEntries },
  ];

  const isBusy = isLoading || isExportingWord;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {!isFileSessionActive ? (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-[#0f172a]" />}>
          <StartupScreen
            onFileReady={handleFileReady}
            onError={handleFileError}
          />
        </Suspense>
      ) : (
        <>
      <div className={`app-shell ${isMetadataMode ? 'metadata-mode' : ''}`}>
        {/* Sidebar — hidden in metadata mode */}
        {!isMetadataMode && (
        <aside className="app-sidebar">
          {/* Logo */}
          <div className="sidebar-logo flex items-center gap-2 px-3 py-4 border-b border-white/10">
            <img src="/favicon.svg" alt="Rotawise" className="h-7 w-7 shrink-0 drop-shadow-[0_2px_8px_rgba(37,99,235,0.6)]" />
            <span className="text-sm font-semibold text-white hidden md:block truncate">
              Rota<span className="text-blue-400 font-normal">wise</span>
            </span>
          </div>

          {/* Nav items */}
          <nav className="flex flex-col gap-1 p-2 flex-1">
            {navItems.map(({ id, icon: Icon, labelKey, disabled }) => (
              <button
                key={id}
                type="button"
                onClick={() => !disabled && setActiveTab(id)}
                disabled={disabled}
                title={t(labelKey as Parameters<typeof t>[0])}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 w-full text-left',
                  'disabled:opacity-30 disabled:cursor-not-allowed',
                  activeTab === id && !disabled
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-white/10 hover:text-slate-100',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(labelKey as Parameters<typeof t>[0])}</span>
              </button>
            ))}
          </nav>

          {/* Bottom controls */}
          <div className="sidebar-bottom-controls border-t border-white/10 p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <LanguageSelector />
              <ThemeToggle />
            </div>
          </div>
        </aside>
        )}

        {/* Main body */}
        <div className="app-body">
          {/* Command bar */}
          <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0 shadow-sm">
            {/* File info */}
            <div className="flex items-center gap-2 min-w-0" data-tour="metadata-header">
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground truncate">
                {fileName ?? t('file.noFileOpen')}
              </span>
              {fileName && !fileName.endsWith('.rw') && !fileName.endsWith('.xlsx') && (
                <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-medium shrink-0">
                  .json
                </span>
              )}
              {/* Autosave status indicator — only visible in metadata mode */}
              {isMetadataMode && autosaveStatus !== 'idle' && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 inline-flex items-center gap-1 ${
                    autosaveStatus === 'saving'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      : autosaveStatus === 'saved'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                  }`}
                >
                  {autosaveStatus === 'saving' && (
                    <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                  )}
                  {t(`page.${autosaveStatus}`)}
                </span>
              )}
            </div>

            {/* Guided tour launcher — only visible in metadata mode */}
            {isMetadataMode && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void startMetadataModeTour();
                  }}
                  title={t('page.metadataTour.tooltip')}
                >
                  <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                  <span className="hidden md:inline">{t('page.metadataTour.button')}</span>
                </Button>
              </div>
            )}

            {/* Action buttons — desktop/tablet. Hidden in metadata mode
                (the autosave handles persistence; no generate / save / etc.). */}
            {!isMetadataMode && (
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              {/* Generate schedule */}
              <Button
                onClick={handleGenerateClick}
                size="sm"
                disabled={
                  !loadedFormValues?.doctors?.length ||
                  loadedFormValues.doctors.every((d) => !d.name?.trim()) ||
                  isBusy
                }
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-current rounded-full" />
                    {t('form.generatingButton')}
                  </>
                ) : (
                  t('form.generateButton')
                )}
              </Button>

              {/* Undo */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleUndoHistory}
                disabled={!canUndo || isBusy}
                title={t('nav.undo')}
              >
                <History className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">{t('nav.undo')}</span>
              </Button>

              {/* Export (Word / Excel) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!schedule || isBusy}
                    title={t('page.export')}
                  >
                    {isExportingWord || isExportingExcel ? (
                      <span className="h-3.5 w-3.5 mr-1.5 animate-spin rounded-full border-t-2 border-b-2 border-primary" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    <span className="hidden md:inline">{t('page.export')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleExportWord}
                    disabled={isBusy || isExportingWord}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {t('page.exportWord')}
                  </DropdownMenuItem>
                  {ENABLE_EXCEL && (
                  <DropdownMenuItem
                    onClick={handleExportExcel}
                    disabled={isBusy || isExportingExcel}
                  >
                    <Sheet className="h-4 w-4 mr-2" />
                    {t('page.exportExcel')}
                  </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Separator orientation="vertical" className="h-5" />

              {/* Clear schedule */}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowClearScheduleDialog(true)}
                disabled={!schedule || isBusy}
                title={t('page.clearSchedule')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>

              {/* Clear doctors */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowClearDoctorDetailsDialog(true)}
                disabled={
                  !loadedFormValues?.doctors?.length ||
                  loadedFormValues.doctors.every((d) => !d.name?.trim()) ||
                  isBusy
                }
                title={t('page.clearDoctorDetails.button')}
              >
                <UserX className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

            {/* Action buttons — mobile */}
            <div className="flex sm:hidden items-center gap-2 shrink-0">
              {/* Generate schedule */}
              <Button
                onClick={handleGenerateClick}
                size="sm"
                disabled={
                  !loadedFormValues?.doctors?.length ||
                  loadedFormValues.doctors.every((d) => !d.name?.trim()) ||
                  isBusy
                }
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin mr-1.5 h-4 w-4 border-t-2 border-b-2 border-current rounded-full" />
                    {t('form.generatingButton')}
                  </>
                ) : (
                  t('form.generateButton')
                )}
              </Button>

              {/* Secondary actions dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" title={t('page.moreActions')}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={handleUndoHistory} disabled={!canUndo || isBusy}>
                    <History className="h-4 w-4 mr-2" />
                    {t('nav.undo')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportWord} disabled={!schedule || isBusy}>
                    <FileText className="h-4 w-4 mr-2" />
                    {t('page.exportWord')}
                  </DropdownMenuItem>
                  {ENABLE_EXCEL && (
                  <DropdownMenuItem onClick={handleExportExcel} disabled={!schedule || isBusy}>
                    <Sheet className="h-4 w-4 mr-2" />
                    {t('page.exportExcel')}
                  </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowClearScheduleDialog(true)}
                    disabled={!schedule || isBusy}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('page.clearSchedule')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowClearDoctorDetailsDialog(true)}
                    disabled={
                      !loadedFormValues?.doctors?.length ||
                      loadedFormValues.doctors.every((d) => !d.name?.trim()) ||
                      isBusy
                    }
                    className="text-destructive focus:text-destructive"
                  >
                    <UserX className="h-4 w-4 mr-2" />
                    {t('page.clearDoctorDetails.button')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Schedule warnings banner — hidden in metadata mode
              (warnings are still computed internally for coverage, but
              showing them in metadata mode would be confusing: the user
              cannot regenerate the schedule to fix them). */}
          {scheduleWarnings.length > 0 && activeTab !== 'config' && !isMetadataMode && (
            <div className="flex items-start gap-2 mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => setWarningsCollapsed(!warningsCollapsed)}
                  className="flex items-center gap-1.5 font-medium w-full text-left"
                >
                  {t('page.section.scheduleWarnings.title')}
                  <span className="inline-flex items-center justify-center rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                    {scheduleWarnings.length}
                  </span>
                  {warningsCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </button>
                {!warningsCollapsed && (
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 max-h-48 overflow-y-auto">
                    {scheduleWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Tab content */}
          <main className="app-main">
            {/* DataInputForm is always mounted (not conditionally rendered) so
                that formRef.current stays populated across tabs. This lets the
                "Generate schedule" header button work on every tab, not only
                on the config tab. Visibility is toggled via the `hidden` attr. */}
            <div className={cn('p-4 md:p-6 w-full max-w-5xl mx-auto', activeTab !== 'config' && 'hidden')}>
              <DataInputForm
                key={dataInputFormKey}
                ref={formRef}
                onSubmit={handleSubmitForm}
                isLoading={isLoading}
                initialValues={loadedFormValues || stableDefaultFormValues}
                onValuesChange={handleLiveFormValuesChange}
              />
            </div>

            {activeTab === 'calendar' && schedule && (
              <div className="p-4 md:p-6">
                <Suspense fallback={null}>
                  <ScheduleCalendarView
                    schedule={schedule}
                    doctors={doctorsProfiles}
                    units={units}
                    holidays={holidays}
                    onUpdateScheduleEntry={handleUpdateScheduleEntry}
                    onSwapScheduleEntries={handleSwapScheduleEntries}
                    onArbitraryScheduleEntry={handleArbitraryScheduleEntry}
                    minIntervalBetweenWorkDays={currentMinInterval}
                    allScheduleEntries={schedule.entries}
                    onToggleMonthFixed={handleToggleMonthFixed}
                    onToggleEntryFixed={handleToggleEntryFixed}
                    onRemoveWorkEntriesForDate={handleRemoveWorkEntriesForDate}
                    onNotify={addMessage}
                    onToggleFreeDay={handleToggleFreeDay}
                    activeFilters={calendarFilters}
                    onFiltersChange={setCalendarFilters}
                    isMetadataMode={isMetadataMode}
                  />
                </Suspense>
              </div>
            )}

            {activeTab === 'weekly' && schedule && (
              <div className="p-4 md:p-6">
                <Suspense fallback={null}>
                  <ScheduleSummaryTable schedule={schedule} doctors={doctorsProfiles} />
                </Suspense>
              </div>
            )}

            {activeTab === 'monthly' && schedule && (
              <div className="p-4 md:p-6">
                <Suspense fallback={null}>
                  <MonthlyWorkloadSummaryTable schedule={schedule} doctors={doctorsProfiles} />
                </Suspense>
              </div>
            )}

            {/* Empty state when tab requires schedule but none exists */}
            {(activeTab === 'calendar' || activeTab === 'weekly' || activeTab === 'monthly') && !schedule && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-5">
                  <CalendarDays className="h-8 w-8 opacity-50" />
                </div>
                <p className="text-lg font-medium text-foreground">{t('page.noSchedule.title')}</p>
                <p className="text-sm mt-1 max-w-md">{t('page.noSchedule.description')}</p>
                <Button variant="outline" className="mt-5" onClick={() => setActiveTab('config')}>
                  <Users className="h-4 w-4 mr-2" />
                  {t('nav.config')}
                </Button>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Clear schedule confirmation */}
      <AlertDialog open={showClearScheduleDialog} onOpenChange={setShowClearScheduleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.confirmClearSchedule.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('page.confirmClearSchedule.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('page.confirmClearSchedule.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearSchedule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('page.confirmClearSchedule.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear doctor details confirmation */}
      <AlertDialog open={showClearDoctorDetailsDialog} onOpenChange={setShowClearDoctorDetailsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.confirmClearDoctorDetails.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('page.confirmClearDoctorDetails.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('page.confirmClearDoctorDetails.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearDoctorDetails}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('page.confirmClearDoctorDetails.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}

      {/* Floating notifications — fixed position, does not affect layout */}
      <InfoBarList messages={messages} onDismiss={dismissMessage} />
    </>
  );
}
