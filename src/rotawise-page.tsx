import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { format, isSameDay } from 'date-fns';
import { Users, CalendarDays, BarChart2, LayoutGrid } from 'lucide-react';
import type { Schedule, ScheduleFormValues, ScheduleEntry, AppFileData } from '@/lib/types';
import { cn, deduplicateEntries } from '@/lib/utils';
import type { TFunction, LooseTFunction } from '@/lib/i18n';
import { useLanguage } from '@/context/language-context';
import { useFileSystem } from '@/context/file-system-context';
import { useScheduleWorker } from '@/hooks/use-schedule-worker';
import { useInfoBar, type InfoBarMessage } from '@/hooks/use-info-bar';
import { useScheduleDocument } from '@/hooks/use-schedule-document';
import { useDocumentPersistence } from '@/hooks/use-document-persistence';
import { useUndoShortcuts } from '@/hooks/use-undo-shortcuts';
import { useFileDrop } from '@/hooks/use-file-drop';
import {
  RotawiseFileError,
  buildAppFileData,
  deserializeAppFileData,
  isEmptyAppFileData,
  makeEmptyAppFileData,
  parseAppFileJson,
} from '@/lib/schedule-storage';
import { loadWorkingCopy, saveWorkingCopy } from '@/lib/browser-storage';
import { computeScheduleWarnings } from '@/lib/schedule-warnings';
import { findNearestWorkNeighbors, violatesMinInterval } from '@/lib/schedule-interval';
import {
  applyRemoveWorkEntriesForDate,
  applySwapScheduleEntries,
  applyToggleEntryFixed,
  applyToggleFreeDayOnSchedule,
  applyToggleMonthFixed,
  applyUpdateScheduleEntry,
} from '@/lib/schedule-edits';
import { InfoBarList } from '@/components/rotawise/info-bar';
import { type ActiveFilter } from '@/components/rotawise/calendar-filter-bar';
import { AppSidebar, type AppTab } from '@/components/rotawise/app-sidebar';
import { CommandBar } from '@/components/rotawise/command-bar';
import { ScheduleWarningsBanner } from '@/components/rotawise/schedule-warnings-banner';
import { ConfirmDialogs } from '@/components/rotawise/confirm-dialogs';
import { FileSystemBanner } from '@/components/rotawise/file-system-banner';

const DataInputForm = lazy(() => import('@/components/rotawise/data-input-form'));
const ScheduleCalendarView = lazy(() => import('@/components/rotawise/schedule-calendar-view'));
const ScheduleSummaryTable = lazy(() => import('@/components/rotawise/schedule-summary-table'));
const MonthlyWorkloadSummaryTable = lazy(
  () => import('@/components/rotawise/monthly-workload-summary-table'),
);

type Notice = Omit<InfoBarMessage, 'id'>;

function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center py-16', className)} role="status">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
    </div>
  );
}

/** Human-readable reason for a file that could not be opened. */
function fileErrorText(err: unknown, t: TFunction): string {
  if (err instanceof RotawiseFileError) {
    return t(`file.error.${err.code}` as const);
  }
  return t('file.openError');
}

/** Toasts for a manual edit that leaves a doctor with too little rest. */
function minIntervalNotices(
  entries: ScheduleEntry[],
  entry: ScheduleEntry,
  minInterval: number,
  doctorName: string | undefined,
  t: TFunction,
): Notice[] {
  if (!doctorName || (entry.assignment !== 'Work' && entry.assignment !== 'Pre-assigned')) return [];
  const { before, after } = findNearestWorkNeighbors(entries, entry.doctorId, entry.date);
  const broken =
    (before && violatesMinInterval(before.date, entry.date, minInterval)) ||
    (after && violatesMinInterval(entry.date, after.date, minInterval));
  if (!broken) return [];
  return [
    {
      severity: 'warning',
      title: t('page.toast.minIntervalWarning.title'),
      description: t('page.toast.minIntervalWarning.description', { doctorName, interval: minInterval }),
      autoDismissMs: 5000,
    },
  ];
}

export default function RotawisePage() {
  const { t, currentDateFnsLocale, language } = useLanguage();
  const {
    fileHandle,
    fileName,
    persistenceMode,
    isFileSystemAccessSupported,
    launchQueueData,
    launchError,
    clearLaunchQueueData,
    openFile,
    saveAsFile,
    saveToFile,
    requestWritePermission,
    clearBinding,
  } = useFileSystem();
  const { messages, addMessage, dismissMessage } = useInfoBar();
  const { generate } = useScheduleWorker();
  const {
    schedule,
    formValues,
    currentMinInterval,
    doctors,
    units,
    holidays,
    formSeed,
    docRef,
    load,
    reset,
    setFormValues,
    commitSchedule,
    commitWithForm,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useScheduleDocument();

  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('config');
  const [warningsCollapsed, setWarningsCollapsed] = useState(true);
  const [calendarFilters, setCalendarFilters] = useState<ActiveFilter[]>([]);
  const [showNewScheduleDialog, setShowNewScheduleDialog] = useState(false);
  const [showOpenReplaceDialog, setShowOpenReplaceDialog] = useState(false);
  const [showClearDoctorDetailsDialog, setShowClearDoctorDetailsDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);

  const formRef = useRef<UseFormReturn<ScheduleFormValues> | null>(null);
  /** File dropped on the window while waiting for the "replace?" confirmation. */
  const pendingDropRef = useRef<File | null>(null);

  // ---------------------------------------------------------------- derived

  const scheduleWarnings = useMemo(
    () =>
      computeScheduleWarnings(
        schedule,
        doctors,
        units,
        currentMinInterval,
        language,
        currentDateFnsLocale,
        t as LooseTFunction,
        holidays,
      ),
    [schedule, doctors, units, currentMinInterval, language, currentDateFnsLocale, t, holidays],
  );

  const fileData = useMemo<AppFileData>(
    () => buildAppFileData({ schedule, formValues, currentMinInterval }),
    [schedule, formValues, currentMinInterval],
  );

  // ------------------------------------------------------------ persistence

  const onBrowserPersistError = useCallback(
    (err: unknown) => {
      console.error('[Page] Browser persist failed:', err);
      addMessage({ severity: 'error', title: t('page.toast.errorPersistingState.title'), autoDismissMs: 5000 });
    },
    [addMessage, t],
  );
  const onFilePersistError = useCallback(
    (err: unknown) => {
      console.error('[Page] Auto-save failed:', err);
      addMessage({ severity: 'error', title: t('file.saveError'), autoDismissMs: 5000 });
    },
    [addMessage, t],
  );

  const persistence = useDocumentPersistence({
    data: fileData,
    enabled: isHydrated,
    fileHandle,
    fileName,
    saveToFile,
    requestWritePermission,
    onBrowserError: onBrowserPersistError,
    onFileError: onFilePersistError,
  });

  const hydrateFromFileData = useCallback(
    (data: AppFileData) => {
      const next = deserializeAppFileData(data);
      load(next);
      setCalendarFilters([]);
      setActiveTab(next.schedule ? 'calendar' : 'config');
    },
    [load],
  );

  // Restore the working copy once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const copy = await loadWorkingCopy();
        if (cancelled) return;
        if (copy?.data) {
          hydrateFromFileData(copy.data);
          if (!isEmptyAppFileData(copy.data)) {
            addMessage({
              severity: 'success',
              title: t('page.toast.stateRestored.title'),
              description: t('page.toast.stateRestored.description'),
              autoDismissMs: 3000,
            });
          }
        }
      } catch (err) {
        console.error('[Page] Restore failed:', err);
        addMessage({
          severity: 'error',
          title: t('page.toast.errorRestoringState.title'),
          description: t('page.toast.errorRestoringState.description'),
          autoDismissMs: 5000,
        });
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // File opened from the OS (PWA file handler).
  useEffect(() => {
    if (!isHydrated) return;
    if (launchQueueData) {
      hydrateFromFileData(launchQueueData);
      clearLaunchQueueData();
      addMessage({ severity: 'success', title: t('file.opened'), autoDismissMs: 3000 });
    } else if (launchError) {
      addMessage({ severity: 'error', title: fileErrorText(launchError, t), autoDismissMs: 6000 });
      clearLaunchQueueData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchQueueData, launchError, isHydrated]);

  // ------------------------------------------------------------- file menu

  const hasUserWork = useCallback(() => !isEmptyAppFileData(fileData), [fileData]);

  const performOpenFile = useCallback(async () => {
    // Flush pending edits to the current file, then keep quiet until the new
    // document is in place: the binding changes before the data does.
    persistence.suspend();
    try {
      const result = await openFile();
      if (!result) return;
      hydrateFromFileData(result.data);
      addMessage({ severity: 'success', title: t('file.opened'), autoDismissMs: 3000 });
    } catch (err) {
      addMessage({ severity: 'error', title: fileErrorText(err, t), autoDismissMs: 6000 });
    } finally {
      persistence.resume();
    }
  }, [persistence, openFile, hydrateFromFileData, addMessage, t]);

  const performOpenDroppedFile = useCallback(
    async (file: File) => {
      let data: AppFileData;
      try {
        data = parseAppFileJson(await file.text());
      } catch (err) {
        addMessage({ severity: 'error', title: fileErrorText(err, t), autoDismissMs: 6000 });
        return;
      }
      // A dropped file has no handle: unlink the current file first so the
      // new document is never auto-saved over it.
      persistence.suspend();
      try {
        await clearBinding();
        hydrateFromFileData(data);
        addMessage({ severity: 'success', title: t('file.opened'), autoDismissMs: 3000 });
      } finally {
        persistence.resume();
      }
    },
    [persistence, clearBinding, hydrateFromFileData, addMessage, t],
  );

  const handleOpenFileRequest = useCallback(() => {
    pendingDropRef.current = null;
    if (hasUserWork()) setShowOpenReplaceDialog(true);
    else void performOpenFile();
  }, [hasUserWork, performOpenFile]);

  useFileDrop((file) => {
    if (isLoading) return;
    if (hasUserWork()) {
      pendingDropRef.current = file;
      setShowOpenReplaceDialog(true);
    } else {
      void performOpenDroppedFile(file);
    }
  });

  const resetToEmpty = useCallback(async () => {
    persistence.cancelPending();
    persistence.suspend();
    try {
      await clearBinding();
      reset();
      setActiveTab('config');
      setCalendarFilters([]);
      await saveWorkingCopy(makeEmptyAppFileData(), { mode: 'browser', fileName: null });
    } finally {
      persistence.resume();
    }
  }, [persistence, clearBinding, reset]);

  const handleNewScheduleRequest = useCallback(() => {
    if (hasUserWork() || fileHandle) setShowNewScheduleDialog(true);
    else void resetToEmpty();
  }, [hasUserWork, fileHandle, resetToEmpty]);

  const handleSaveToFile = useCallback(async () => {
    try {
      const result = await saveAsFile(fileData);
      if (!result) return;
      addMessage({
        severity: 'success',
        title: result.downloaded ? t('file.downloaded') : t('file.savedSuccessfully'),
        autoDismissMs: 3000,
      });
    } catch {
      addMessage({ severity: 'error', title: t('file.createError'), autoDismissMs: 5000 });
    }
  }, [saveAsFile, fileData, addMessage, t]);

  const handleReactivateAutoSave = useCallback(async () => {
    if (await persistence.reactivate()) {
      addMessage({ severity: 'success', title: t('file.autoSaveResumed'), autoDismissMs: 3000 });
    }
  }, [persistence, addMessage, t]);

  // -------------------------------------------------------------- generate

  const handleSubmitForm = async (data: ScheduleFormValues, keepFixed = true) => {
    if (isLoading) return;
    setIsLoading(true);
    const fixedEntries = keepFixed ? (docRef.current.schedule?.entries.filter((e) => e.isFixed) ?? []) : [];
    const result = await generate(data, fixedEntries);
    setIsLoading(false);

    if (result.error || !result.schedule) {
      // The previous schedule, if any, is left untouched.
      addMessage({
        severity: 'error',
        title: t('page.toast.errorGenerating.title'),
        description: result.error,
        autoDismissMs: 6000,
      });
      return;
    }

    const generated: Schedule = {
      ...result.schedule,
      entries: deduplicateEntries(result.schedule.entries.map((e) => ({ ...e, date: new Date(e.date) }))),
    };
    commitSchedule(generated, data.minIntervalBetweenWorkDays ?? 1);
    setActiveTab('calendar');
    addMessage({
      severity: 'success',
      title: t('page.toast.scheduleGenerated.title'),
      description: t('page.toast.scheduleGenerated.description'),
      autoDismissMs: 3000,
    });
  };

  const validationToastRef = useRef<string | null>(null);

  const runGenerate = (keepFixed: boolean) => {
    if (!formRef.current) return;
    if (validationToastRef.current) dismissMessage(validationToastRef.current);
    validationToastRef.current = null;
    void formRef.current.handleSubmit(
      (data) => handleSubmitForm({ ...data, numberOfDoctors: data.doctors.length }, keepFixed),
      () => {
        // The errors are shown next to each field in the roster form.
        setActiveTab('config');
        validationToastRef.current = addMessage({
          severity: 'error',
          title: t('validation.fixErrors'),
          autoDismissMs: 5000,
        });
        // Bring the first offending field into view once the form tab is shown.
        window.setTimeout(() => {
          const target = document.querySelector<HTMLElement>(
            '.app-main [aria-invalid="true"], .app-main [role="alert"]',
          );
          target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (target?.matches('[aria-invalid="true"]')) target.focus({ preventScroll: true });
        }, 50);
      },
    )();
  };

  const handleGenerateClick = () => {
    if (schedule?.entries.some((e) => e.isFixed)) setShowRegenerateDialog(true);
    else runGenerate(true);
  };

  // ------------------------------------------------------- schedule editing

  const doctorName = useCallback((id: string) => doctors.find((d) => d.id === id)?.name, [doctors]);

  const handleSwapScheduleEntries = useCallback(
    (entry1: ScheduleEntry, entry2: ScheduleEntry, oldDate1?: Date, oldDate2?: Date) => {
      const current = docRef.current.schedule;
      if (!current) return;
      const updated = applySwapScheduleEntries(current, entry1, entry2, oldDate1, oldDate2);
      const minInterval = current.minIntervalBetweenWorkDays ?? docRef.current.currentMinInterval;
      commitSchedule(updated);
      [entry1, entry2]
        .flatMap((e) => minIntervalNotices(updated.entries, e, minInterval, doctorName(e.doctorId), t))
        .forEach(addMessage);
    },
    [docRef, commitSchedule, doctorName, addMessage, t],
  );

  const handleUpdateScheduleEntry = useCallback(
    (updatedEntry: ScheduleEntry, oldDate?: Date) => {
      const current = docRef.current.schedule;
      if (!current) return;
      const updated = applyUpdateScheduleEntry(current, updatedEntry, oldDate);
      const minInterval = current.minIntervalBetweenWorkDays ?? docRef.current.currentMinInterval;
      const doctor = doctors.find((d) => d.id === updatedEntry.doctorId);
      const notices = minIntervalNotices(updated.entries, updatedEntry, minInterval, doctor?.name, t);

      if (doctor && updatedEntry.assignment === 'Work') {
        if (doctor.freeDates.some((d) => isSameDay(d, updatedEntry.date))) {
          notices.push({
            severity: 'error',
            title: t('page.toast.scheduleWarning.title'),
            description: t('page.toast.scheduleWarning.description', { doctorName: doctor.name }),
            autoDismissMs: 5000,
          });
        }
        if (doctor.excludedDates.some((d) => isSameDay(d, updatedEntry.date))) {
          notices.push({
            severity: 'warning',
            title: t('page.toast.scheduleWarning.title'),
            description: t('page.toast.excludedDayWarning.description', { doctorName: doctor.name }),
            autoDismissMs: 5000,
          });
        }
      }

      commitSchedule(updated);
      notices.forEach(addMessage);
    },
    [docRef, commitSchedule, doctors, addMessage, t],
  );

  const handleToggleMonthFixed = useCallback(
    (month: Date, isFixed: boolean) => {
      const current = docRef.current.schedule;
      if (!current) return;
      commitSchedule(applyToggleMonthFixed(current, month, isFixed));
      const monthLabel = format(month, 'LLLL yyyy', { locale: currentDateFnsLocale });
      addMessage({
        severity: 'success',
        title: isFixed ? t('page.toast.monthFixed.title') : t('page.toast.monthUnfixed.title'),
        description: isFixed
          ? t('page.toast.monthFixed.description', { month: monthLabel })
          : t('page.toast.monthUnfixed.description', { month: monthLabel }),
        autoDismissMs: 3000,
      });
    },
    [docRef, commitSchedule, addMessage, t, currentDateFnsLocale],
  );

  const handleToggleEntryFixed = useCallback(
    (entry: ScheduleEntry, isFixed: boolean) => {
      const current = docRef.current.schedule;
      if (current) commitSchedule(applyToggleEntryFixed(current, entry, isFixed));
    },
    [docRef, commitSchedule],
  );

  const handleRemoveWorkEntriesForDate = useCallback(
    (targetDate: Date) => {
      const current = docRef.current.schedule;
      if (current) commitSchedule(applyRemoveWorkEntriesForDate(current, targetDate));
    },
    [docRef, commitSchedule],
  );

  const handleToggleFreeDay = useCallback(
    (date: Date, doctorId: string) => {
      const { schedule: current, formValues: form } = docRef.current;
      if (!current || !form.doctors?.some((d) => d.id === doctorId)) return;

      const isFree = current.entries.some(
        (e) => e.doctorId === doctorId && e.assignment === 'Free' && isSameDay(e.date, date),
      );
      const nextForm: Partial<ScheduleFormValues> = {
        ...form,
        doctors: form.doctors.map((d) =>
          d.id === doctorId
            ? {
                ...d,
                freeDates: isFree
                  ? (d.freeDates ?? []).filter((fd) => !isSameDay(fd, date))
                  : [...(d.freeDates ?? []), date],
              }
            : d,
        ),
      };
      commitWithForm(applyToggleFreeDayOnSchedule(current, date, doctorId, !isFree), nextForm);
    },
    [docRef, commitWithForm],
  );

  const handleClearDoctorDetails = () => {
    const { schedule: current, formValues: form } = docRef.current;
    commitWithForm(current, { ...form, numberOfDoctors: 0, doctors: [] });
    addMessage({
      severity: 'success',
      title: t('page.toast.clearedDoctorItems.title'),
      description: t('page.toast.clearedDoctorItems.description'),
      autoDismissMs: 3000,
    });
    setShowClearDoctorDetailsDialog(false);
  };

  // ------------------------------------------------------------ undo / redo

  const isBusy = isLoading || isExportingWord;

  const handleUndo = useCallback(() => {
    if (isBusy || !undo()) return;
    addMessage({ severity: 'info', title: t('page.toast.undone'), autoDismissMs: 2000 });
  }, [isBusy, undo, addMessage, t]);

  const handleRedo = useCallback(() => {
    if (isBusy || !redo()) return;
    addMessage({ severity: 'info', title: t('page.toast.redone'), autoDismissMs: 2000 });
  }, [isBusy, redo, addMessage, t]);

  useUndoShortcuts(handleUndo, handleRedo, isHydrated);

  // ----------------------------------------------------------------- export

  const handleExportWord = async () => {
    if (!schedule || !doctors.length) {
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
        doctorsProfiles: doctors,
        holidays,
        fileName,
        locale: currentDateFnsLocale,
        defaultTitle: t('export.defaultTitle'),
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

  // ----------------------------------------------------------------- render

  if (!isHydrated) {
    return <Spinner className="min-h-screen items-center bg-background py-0" />;
  }

  const hasScheduleEntries = !!schedule && schedule.entries.length > 0;
  const hasDoctors = doctors.some((d) => d.name.trim());
  // A schedule tab can be left selected after an undo removes the schedule.
  const visibleTab: AppTab = !schedule && activeTab !== 'config' ? 'config' : activeTab;

  const navItems = [
    { id: 'config' as const, icon: Users, labelKey: 'nav.config' as const },
    { id: 'calendar' as const, icon: CalendarDays, labelKey: 'nav.calendar' as const, disabled: !schedule },
    { id: 'weekly' as const, icon: BarChart2, labelKey: 'nav.weeklySummary' as const, disabled: !hasScheduleEntries },
    { id: 'monthly' as const, icon: LayoutGrid, labelKey: 'nav.monthlySummary' as const, disabled: !hasScheduleEntries },
  ];

  return (
    <>
      <div className="app-shell">
        <AppSidebar navItems={navItems} activeTab={visibleTab} onTabChange={setActiveTab} />

        <div className="app-body">
          <CommandBar
            fileName={fileName}
            persistenceMode={persistenceMode}
            autoSaveBlocked={persistence.autoSaveBlocked}
            canGenerate={hasDoctors}
            canUndo={canUndo}
            canRedo={canRedo}
            hasSchedule={!!schedule}
            hasDoctors={(formValues.doctors?.length ?? 0) > 0}
            isBusy={isBusy}
            isLoading={isLoading}
            isExportingWord={isExportingWord}
            onGenerate={handleGenerateClick}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onExportWord={handleExportWord}
            onClearDoctors={() => setShowClearDoctorDetailsDialog(true)}
            onNewSchedule={handleNewScheduleRequest}
            onOpenFile={handleOpenFileRequest}
            onSaveToFile={() => void handleSaveToFile()}
            onReactivateAutoSave={() => void handleReactivateAutoSave()}
          />

          {!isFileSystemAccessSupported && <FileSystemBanner />}

          {scheduleWarnings.length > 0 && visibleTab !== 'config' && (
            <ScheduleWarningsBanner
              warnings={scheduleWarnings}
              collapsed={warningsCollapsed}
              onToggleCollapsed={() => setWarningsCollapsed((c) => !c)}
            />
          )}

          <main className="app-main">
            <h1 className="sr-only">{t('meta.title')}</h1>
            {/* The roster form stays mounted so its state survives tab changes. */}
            <div className={cn('p-4 md:p-6 w-full max-w-5xl mx-auto', visibleTab !== 'config' && 'hidden')}>
              <Suspense fallback={<Spinner />}>
                <DataInputForm
                  key={formSeed.key}
                  ref={formRef}
                  initialValues={formSeed.values}
                  onValuesChange={setFormValues}
                />
              </Suspense>
            </div>

            {visibleTab === 'calendar' && schedule && (
              <div className="p-2 sm:p-4 md:p-6">
                <Suspense fallback={<Spinner />}>
                  <ScheduleCalendarView
                    schedule={schedule}
                    doctors={doctors}
                    units={units}
                    holidays={holidays}
                    minIntervalBetweenWorkDays={schedule.minIntervalBetweenWorkDays ?? currentMinInterval}
                    onUpdateScheduleEntry={handleUpdateScheduleEntry}
                    onSwapScheduleEntries={handleSwapScheduleEntries}
                    onToggleMonthFixed={handleToggleMonthFixed}
                    onToggleEntryFixed={handleToggleEntryFixed}
                    onRemoveWorkEntriesForDate={handleRemoveWorkEntriesForDate}
                    onToggleFreeDay={handleToggleFreeDay}
                    onNotify={addMessage}
                    activeFilters={calendarFilters}
                    onFiltersChange={setCalendarFilters}
                  />
                </Suspense>
              </div>
            )}

            {visibleTab === 'weekly' && schedule && (
              <div className="p-2 sm:p-4 md:p-6">
                <Suspense fallback={<Spinner />}>
                  <ScheduleSummaryTable schedule={schedule} doctors={doctors} />
                </Suspense>
              </div>
            )}

            {visibleTab === 'monthly' && schedule && (
              <div className="p-2 sm:p-4 md:p-6">
                <Suspense fallback={<Spinner />}>
                  <MonthlyWorkloadSummaryTable schedule={schedule} doctors={doctors} />
                </Suspense>
              </div>
            )}

          </main>
        </div>
      </div>

      <ConfirmDialogs
        showNewSchedule={showNewScheduleDialog}
        showOpenReplace={showOpenReplaceDialog}
        showClearDoctors={showClearDoctorDetailsDialog}
        showRegenerate={showRegenerateDialog}
        onShowNewScheduleChange={setShowNewScheduleDialog}
        onShowOpenReplaceChange={(open) => {
          setShowOpenReplaceDialog(open);
          if (!open) pendingDropRef.current = null;
        }}
        onShowClearDoctorsChange={setShowClearDoctorDetailsDialog}
        onShowRegenerateChange={setShowRegenerateDialog}
        onConfirmNewSchedule={() => {
          setShowNewScheduleDialog(false);
          void resetToEmpty();
        }}
        onConfirmOpenReplace={() => {
          const dropped = pendingDropRef.current;
          pendingDropRef.current = null;
          setShowOpenReplaceDialog(false);
          if (dropped) void performOpenDroppedFile(dropped);
          else void performOpenFile();
        }}
        onConfirmClearDoctors={handleClearDoctorDetails}
        onConfirmRegenerateKeepFixed={() => {
          setShowRegenerateDialog(false);
          runGenerate(true);
        }}
        onConfirmRegenerateFromScratch={() => {
          setShowRegenerateDialog(false);
          runGenerate(false);
        }}
      />

      <InfoBarList messages={messages} onDismiss={dismissMessage} />
    </>
  );
}
