import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import type {
  Schedule,
  ScheduleFormValues,
  DoctorProfile,
  ScheduleEntry,
  AppFileData,
  SerializedDoctorFormFieldInput,
  DoctorFormFieldInput,
} from '@/lib/types';
import { type UseFormReturn } from 'react-hook-form';
import DataInputForm from '@/components/rotawise/data-input-form';
const ScheduleCalendarView = lazy(() => import('@/components/rotawise/schedule-calendar-view'));
const ScheduleSummaryTable = lazy(() => import('@/components/rotawise/schedule-summary-table'));
const MonthlyWorkloadSummaryTable = lazy(() => import('@/components/rotawise/MonthlyWorkloadSummaryTable'));
const StartupScreen = lazy(() => import('@/components/rotawise/startup-screen'));
import LanguageSelector from '@/components/rotawise/language-selector';
import { InfoBarList } from '@/components/rotawise/info-bar';
import { ThemeIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
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
import { cn, generateId } from '@/lib/utils';
import {
  Settings,
  CalendarDays,
  BarChart2,
  LayoutGrid,
  FileDown,
  Trash2,
  UserX,
  History,
  AlertTriangle,
  File,
  Download,
} from 'lucide-react';
import { format, isSameDay, differenceInCalendarDays, startOfMonth, endOfMonth } from 'date-fns';
import { useLanguage } from '@/context/language-context';
import { useFileSystem } from '@/context/file-system-context';
import { ThemeToggle } from '@/components/theme-toggle';
import type { ScheduleWarning } from '@/lib/schedule-generator';
import { useScheduleWorker } from '@/hooks/use-schedule-worker';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { useInfoBar, type InfoBarMessage } from '@/hooks/use-info-bar';
import { useHistory } from '@/hooks/use-history';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveTab = 'config' | 'calendar' | 'weekly' | 'monthly';

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

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
    const entries: ScheduleEntry[] = (data.schedule?.entries || []).map((e) => ({
      ...e,
      date: new Date(e.date),
    }));

    if (data.schedule?.startDate && (data.schedule?.entries?.length ?? 0) > 0) {
      schedule = {
        ...data.schedule,
        startDate: new Date(data.schedule.startDate),
        endDate: new Date(data.schedule.endDate),
        minIntervalBetweenWorkDays: data.schedule.minIntervalBetweenWorkDays || 1,
        globalMonthlyShiftLimit: data.schedule.globalMonthlyShiftLimit,
        entries,
      };
    }

    // Deserialize doctor profiles
    if (data.doctorsProfiles) {
      doctorsProfiles = data.doctorsProfiles.map((p) => ({
        ...p,
        vacationDates: (p.vacationDates || []).map((d: string) => new Date(d)),
        preAssignedWorkDates: (p.preAssignedWorkDates || []).map((d: string) => new Date(d)),
        excludedDates: (p.excludedDates || []).map((d: string) => new Date(d)),
        isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
      }));
    }

    // Deserialize form values
    if (data.formValues) {
      const formDoctors = (data.formValues.doctors || []).map((doc: SerializedDoctorFormFieldInput) => ({
        id: doc.id,
        name: doc.name,
        vacationDates: (doc.vacationDates || []).map((d: string) => new Date(d)),
        preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d: string) => new Date(d)),
        excludedDates: (doc.excludedDates || []).map((d: string) => new Date(d)),
        isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
      }));

      formValues = {
        numberOfDoctors: data.formValues.numberOfDoctors,
        startDate: data.formValues.startDate ? new Date(data.formValues.startDate) : new Date(),
        endDate: data.formValues.endDate ? new Date(data.formValues.endDate) : new Date(),
        minIntervalBetweenWorkDays: data.formValues.minIntervalBetweenWorkDays || 1,
        globalMonthlyShiftLimit: data.formValues.globalMonthlyShiftLimit,
        doctors: formDoctors,
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
        vacationDates: p.vacationDates.map((d) => d.toISOString()),
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
      vacationDates: (doc.vacationDates || []).map((d) => d.toISOString()),
      preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d) => d.toISOString()),
      excludedDates: (doc.excludedDates || []).map((d) => d.toISOString()),
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    })),
  } as AppFileData['formValues'];

  return {
    fileVersion: 1,
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
  const { t, currentDateFnsLocale } = useLanguage();
  const {
    fileHandle,
    fileName,
    isSupported,
    launchQueueData,
    clearLaunchQueueData,
    saveToFile,
    downloadFallback,
  } = useFileSystem();
  const { messages, addMessage, dismissMessage } = useInfoBar();
  const { push: historyPush, undo: historyUndo, canUndo } = useHistory();
  const { generate } = useScheduleWorker();

  // Core schedule state
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [doctorsProfiles, setDoctorsProfiles] = useState<DoctorProfile[]>([]);
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);
  const [currentMinInterval, setCurrentMinInterval] = useState<number>(1);
  const [loadedFormValues, setLoadedFormValues] = useState<Partial<ScheduleFormValues> | null>(null);

  // UI state
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [dataInputFormKey, setDataInputFormKey] = useState(0);
  const [numDoctorsInForm, setNumDoctorsInForm] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('config');
  const [isFileSessionActive, setIsFileSessionActive] = useState(false);
  const [showClearScheduleDialog, setShowClearScheduleDialog] = useState(false);
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

  const handleFileReady = useCallback((data: AppFileData) => {
    hydrateFromFileData(data);
    setIsFileSessionActive(true);
    addMessage({ severity: 'success', title: t('file.opened'), autoDismissMs: 3000 });
  }, [hydrateFromFileData, addMessage, t]);

  const handleFileError = useCallback((msg: string) => {
    addMessage({ severity: 'error', title: msg, autoDismissMs: 5000 });
  }, [addMessage]);

  // ---------------------------------------------------------------------------
  // Load as pre-assigned (file input)
  // ---------------------------------------------------------------------------

  // Called from StartupScreen when user picks a file to import as pre-assigned
  const handleLoadAsPreassigned = useCallback((rawData: AppFileData) => {
    try {
      if (!rawData.schedule || !rawData.doctorsProfiles) throw new Error('Invalid file format');

      // Convert Work → Pre-assigned
      const workDatesByDoctor = new Map<string, Date[]>();
      const entries: ScheduleEntry[] = rawData.schedule.entries.map((entry) => {
        const date = new Date(entry.date);
        if (entry.assignment === 'Work' && entry.doctorId !== 'system') {
          const existing = workDatesByDoctor.get(entry.doctorId) || [];
          workDatesByDoctor.set(entry.doctorId, [...existing, date]);
          return { ...entry, date, assignment: 'Pre-assigned' as const };
        }
        return { ...entry, date };
      });

      const doctors: DoctorProfile[] = rawData.doctorsProfiles.map((p) => {
        const workDates = workDatesByDoctor.get(p.id) || [];
        const existing = (p.preAssignedWorkDates || []).map((d: string) => new Date(d));
        const allPre = [...existing, ...workDates];
        const unique = Array.from(new Set(allPre.map((d) => d.getTime()))).map((ts) => new Date(ts));
        return {
          ...p,
          vacationDates: (p.vacationDates || []).map((d: string) => new Date(d)),
          preAssignedWorkDates: unique,
          excludedDates: (p.excludedDates || []).map((d: string) => new Date(d)),
          isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
        };
      });

      const finalSchedule: Schedule = {
        ...rawData.schedule,
        startDate: new Date(rawData.schedule.startDate),
        endDate: new Date(rawData.schedule.endDate),
        minIntervalBetweenWorkDays: rawData.schedule.minIntervalBetweenWorkDays || 1,
        globalMonthlyShiftLimit: rawData.schedule.globalMonthlyShiftLimit,
        entries,
      };

      setSchedule(finalSchedule);
      setDoctorsProfiles(doctors);
      setScheduleWarnings(rawData.scheduleWarnings || []);
      setCurrentMinInterval(rawData.schedule.minIntervalBetweenWorkDays || 1);

      if (rawData.formValues) {
        const fv: Partial<ScheduleFormValues> = {
          numberOfDoctors: doctors.length,
          startDate: new Date(rawData.formValues.startDate),
          endDate: new Date(rawData.formValues.endDate),
          minIntervalBetweenWorkDays: rawData.formValues.minIntervalBetweenWorkDays || 1,
          globalMonthlyShiftLimit: rawData.formValues.globalMonthlyShiftLimit,
          doctors: doctors.map((d) => ({
            id: d.id,
            name: d.name,
            vacationDates: d.vacationDates,
            preAssignedWorkDates: d.preAssignedWorkDates,
            excludedDates: d.excludedDates,
            isExcludedFromAutomaticAssignment: d.isExcludedFromAutomaticAssignment,
          })),
        };
        setLoadedFormValues(fv);
        setNumDoctorsInForm(doctors.length);
        setDataInputFormKey((prev) => prev + 1);
      }

      setIsFileSessionActive(true);
      setActiveTab('calendar');
      addMessage({
        severity: 'success',
        title: t('page.toast.scheduleLoadedAsPreassigned.description'),
        autoDismissMs: 3000,
      });
    } catch (err) {
      addMessage({
        severity: 'error',
        title: t('page.toast.errorLoading.title'),
        description: (err as Error).message,
        autoDismissMs: 5000,
      });
    }
  }, [addMessage, t]);

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
      vacationDates: doc.vacationDates,
      preAssignedWorkDates: doc.preAssignedWorkDates,
      excludedDates: doc.excludedDates || [],
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    }));
    setDoctorsProfiles(profiles);

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
      const processedSchedule: Schedule = {
        ...result.schedule,
        startDate: result.schedule.startDate,
        endDate: result.schedule.endDate,
        entries: result.schedule.entries.map((e) => ({ ...e, date: new Date(e.date) })),
      };
      setSchedule(processedSchedule);
      addMessage({
        severity: 'success',
        title: t('page.toast.scheduleGenerated.title'),
        description: t('page.toast.scheduleGenerated.description'),
        autoDismissMs: 3000,
      });
      setActiveTab('calendar');

      if (result.warnings && result.warnings.length > 0) {
        const translatedWarnings = result.warnings.map((warning: ScheduleWarning) => {
          const params = { ...warning.params };
          if (params.date && params.date instanceof Date) {
            params.date = format(params.date, 'PPP', { locale: currentDateFnsLocale });
          }
          return t(warning.key, params);
        });
        setScheduleWarnings(translatedWarnings);
        translatedWarnings.forEach((w) =>
          addMessage({
            severity: 'warning',
            title: t('page.toast.scheduleWarning.title'),
            description: w,
            autoDismissMs: 10000,
          }),
        );
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Schedule entry updates
  // ---------------------------------------------------------------------------

  const handleArbitraryScheduleEntry = useCallback((updatedEntry: ScheduleEntry) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    // Arbitrary assignments: only remove direct conflicts on the same date, keep entries from other dates
    const newEntries = schedule.entries.filter((e) => {
      // Only remove conflicting Work/Pre-assigned entries on the exact same date and different doctor
      if (isSameDay(e.date, updatedEntry.date)) {
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
    setSchedule({ ...schedule, entries: newEntries });
    // Note: No validation messages for arbitrary assignments - warnings are shown in the dialog
  }, [schedule, historyPush]);

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

    setSchedule({ ...schedule, entries: newEntries });
    pendingMessages.forEach((msg) => addMessage(msg));
  }, [schedule, historyPush, doctorsProfiles, currentMinInterval, addMessage, t]);

  const handleUpdateScheduleEntry = useCallback((updatedEntry: ScheduleEntry, oldDate?: Date) => {
    if (!schedule) return;
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

    // Compute new entries imperatively (outside state updater to avoid StrictMode double-invoke)
    let newEntries: ScheduleEntry[];

    if (updatedEntry.assignment === 'Off') {
      newEntries = schedule.entries.filter((e) => {
        if (isSameDay(e.date, updatedEntry.date)) {
          return e.assignment === 'Vacation';
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
        if (doctorProfile.vacationDates.some((vd) => isSameDay(vd, updatedEntry.date))) {
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

    setSchedule({ ...schedule, entries: newEntries });
    pendingMessages.forEach((msg) => addMessage(msg));
  }, [schedule, historyPush, doctorsProfiles, currentMinInterval, addMessage, t]);

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

    // Immediately sync doctorsProfiles with form doctors
    const formDoctorIds = new Set(values.doctors.map((d) => d.id).filter(Boolean));
    if (formDoctorIds.size === 0) {
      setDoctorsProfiles([]);
    } else {
      setDoctorsProfiles((prev) => prev.filter((p) => formDoctorIds.has(p.id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  const handleExportPdf = async () => {
    if (!schedule || !doctorsProfiles.length) {
      addMessage({
        severity: 'error',
        title: t('page.toast.noScheduleToExport.title'),
        description: t('page.toast.noScheduleToExport.description'),
        autoDismissMs: 4000,
      });
      return;
    }
    setIsExportingPdf(true);
    try {
      const { exportPdf } = await import('@/lib/export-pdf');
      await exportPdf({
        schedule,
        doctorsProfiles,
        scheduleWarnings,
        currentMinInterval,
        t,
        locale: currentDateFnsLocale,
      });
    } catch (err) {
      addMessage({
        severity: 'error',
        title: t('page.toast.errorSavingPdf.title'),
        description: (err as Error).message,
        autoDismissMs: 5000,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

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
        scheduleWarnings,
        currentMinInterval,
        t,
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

  // Manual download (Firefox fallback)
  const handleManualSave = () => {
    const data = buildAppFileData(
      schedule,
      doctorsProfiles,
      loadedFormValues,
      scheduleWarnings,
      currentMinInterval,
      fileVersions,
    );
    downloadFallback(data, fileName || 'schedule.rw');
    addMessage({ severity: 'success', title: t('file.saved'), autoDismissMs: 3000 });
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Sidebar nav items
  // ---------------------------------------------------------------------------

  const hasScheduleEntries = !!schedule && schedule.entries.length > 0;

  const navItems: { id: ActiveTab; icon: React.ElementType; labelKey: string; disabled?: boolean }[] = [
    { id: 'config', icon: Settings, labelKey: 'nav.config' },
    { id: 'calendar', icon: CalendarDays, labelKey: 'nav.calendar', disabled: !schedule },
    { id: 'weekly', icon: BarChart2, labelKey: 'nav.weeklySummary', disabled: !hasScheduleEntries },
    { id: 'monthly', icon: LayoutGrid, labelKey: 'nav.monthlySummary', disabled: !hasScheduleEntries },
  ];

  const isBusy = isLoading || isExportingPdf || isExportingWord;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Startup screen — shown when no file session is active */}
      {!isFileSessionActive && (
        <Suspense fallback={null}>
          <StartupScreen
            onFileReady={handleFileReady}
            onLoadAsPreassigned={handleLoadAsPreassigned}
            onError={handleFileError}
          />
        </Suspense>
      )}

      {/* Main app shell — hidden until file session is active */}
      <div className={cn('app-shell', !isFileSessionActive && 'hidden')}>
        {/* Sidebar */}
        <aside className="app-sidebar">
          {/* Logo */}
          <div className="sidebar-logo flex items-center gap-2 px-3 py-4 border-b border-border">
            <ThemeIcon className="h-7 w-7 shrink-0 text-primary" />
            <span className="text-sm font-semibold text-foreground hidden sidebar-expanded:block truncate">
              Rota-Wise
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
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors w-full text-left',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  activeTab === id && !disabled
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(labelKey as Parameters<typeof t>[0])}</span>
              </button>
            ))}
          </nav>

          {/* Bottom controls */}
          <div className="sidebar-bottom-controls border-t border-border p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <LanguageSelector />
              <ThemeToggle />
            </div>
          </div>
        </aside>

        {/* Main body */}
        <div className="app-body">
          {/* Command bar */}
          <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
            {/* File info */}
            <div className="flex items-center gap-2 min-w-0">
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground truncate">
                {fileName ?? t('file.noFileOpen')}
              </span>
              {fileName && !fileName.endsWith('.rw') && (
                <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-medium shrink-0">
                  .json
                </span>
              )}
              {!isSupported && (
                <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded font-medium shrink-0">
                  {t('startup.unsupportedBrowser')}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Firefox: manual save */}
              {!isSupported && (
                <Button size="sm" variant="outline" onClick={handleManualSave} disabled={isBusy}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {t('file.save')}
                </Button>
              )}

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

              {/* Export PDF */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportPdf}
                disabled={!schedule || isBusy}
                title={t('page.exportPdf')}
              >
                {isExportingPdf ? (
                  <span className="h-3.5 w-3.5 mr-1.5 animate-spin rounded-full border-t-2 border-b-2 border-primary" />
                ) : (
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />
                )}
                <span className="hidden md:inline">{t('page.exportPdf')}</span>
              </Button>

              {/* Export Word */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportWord}
                disabled={!schedule || isBusy}
                title={t('page.exportWord')}
              >
                {isExportingWord ? (
                  <span className="h-3.5 w-3.5 mr-1.5 animate-spin rounded-full border-t-2 border-b-2 border-primary" />
                ) : (
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />
                )}
                <span className="hidden md:inline">{t('page.exportWord')}</span>
              </Button>

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
          </header>

          {/* Schedule warnings banner */}
          {scheduleWarnings.length > 0 && activeTab !== 'config' && (
            <div className="flex items-start gap-2 mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium">{t('page.section.scheduleWarnings.title')}</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {scheduleWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Tab content */}
          <main className="app-main">
            {activeTab === 'config' && (
              <div className="p-4 md:p-6">
                <DataInputForm
                  key={dataInputFormKey}
                  ref={formRef}
                  onSubmit={handleSubmitForm}
                  isLoading={isLoading}
                  initialValues={loadedFormValues || stableDefaultFormValues}
                  onValuesChange={handleLiveFormValuesChange}
                />
              </div>
            )}

            {activeTab === 'calendar' && schedule && (
              <div className="p-4 md:p-6">
                <Suspense fallback={null}>
                  <ScheduleCalendarView
                    schedule={schedule}
                    doctors={doctorsProfiles}
                    onUpdateScheduleEntry={handleUpdateScheduleEntry}
                    onSwapScheduleEntries={handleSwapScheduleEntries}
                    onArbitraryScheduleEntry={handleArbitraryScheduleEntry}
                    minIntervalBetweenWorkDays={currentMinInterval}
                    allScheduleEntries={schedule.entries}
                    onToggleMonthFixed={handleToggleMonthFixed}
                    onNotify={addMessage}
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
                <CalendarDays className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">{t('page.noSchedule.title')}</p>
                <p className="text-sm mt-1">{t('page.noSchedule.description')}</p>
                <Button variant="outline" className="mt-4" onClick={() => setActiveTab('config')}>
                  <Settings className="h-4 w-4 mr-2" />
                  {t('nav.config')}
                </Button>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Floating notifications — fixed position, does not affect layout */}
      <InfoBarList messages={messages} onDismiss={dismissMessage} />

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
  );
}
