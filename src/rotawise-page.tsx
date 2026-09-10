import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  type Schedule,
  type ScheduleFormValues,
  type DoctorProfile,
  type ScheduleEntry,
  type AppFileData,
  type DoctorFormFieldInput,
  type Unit,
} from '@/lib/types';
import { type UseFormReturn } from 'react-hook-form';
const DataInputForm = lazy(() => import('@/components/rotawise/data-input-form'));
const ScheduleCalendarView = lazy(() => import('@/components/rotawise/schedule-calendar-view'));
const ScheduleSummaryTable = lazy(() => import('@/components/rotawise/schedule-summary-table'));
const MonthlyWorkloadSummaryTable = lazy(
  () => import('@/components/rotawise/monthly-workload-summary-table'),
);
const StartupScreen = lazy(() => import('@/components/rotawise/startup-screen'));
const BrowserNotSupported = lazy(() => import('@/components/rotawise/browser-not-supported'));
import { InfoBarList } from '@/components/rotawise/info-bar';
import { Button } from '@/components/ui/button';
import { cn, deduplicateEntries } from '@/lib/utils';
import { Users, CalendarDays, BarChart2, LayoutGrid } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { useLanguage } from '@/context/language-context';
import { useFileSystem } from '@/context/file-system-context';
import { useScheduleWorker } from '@/hooks/use-schedule-worker';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { useInfoBar, type InfoBarMessage } from '@/hooks/use-info-bar';
import { useHistory } from '@/hooks/use-history';
import { type ActiveFilter } from '@/components/rotawise/calendar-filter-bar';
import {
  buildAppFileData,
  deserializeAppFileData,
  normalizeUnit,
  toLocalDate,
} from '@/lib/schedule-storage';
import { computeScheduleWarnings } from '@/lib/schedule-warnings';
import { findNearestWorkNeighbors, violatesMinInterval } from '@/lib/schedule-interval';
import {
  applyArbitraryScheduleEntry,
  applyRemoveWorkEntriesForDate,
  applySwapScheduleEntries,
  applyToggleEntryFixed,
  applyToggleFreeDayOnSchedule,
  applyToggleMonthFixed,
  applyUpdateScheduleEntry,
  toDoctorProfile,
} from '@/lib/schedule-edits';
import { AppSidebar, type AppTab } from '@/components/rotawise/app-sidebar';
import { CommandBar } from '@/components/rotawise/command-bar';
import { ScheduleWarningsBanner } from '@/components/rotawise/schedule-warnings-banner';
import { ConfirmDialogs } from '@/components/rotawise/confirm-dialogs';

function minIntervalMessages(
  entries: ScheduleEntry[],
  entry: ScheduleEntry,
  minInterval: number,
  doctorName: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): Omit<InfoBarMessage, 'id'>[] {
  if (!doctorName || (entry.assignment !== 'Work' && entry.assignment !== 'Pre-assigned')) {
    return [];
  }
  const { before, after } = findNearestWorkNeighbors(entries, entry.doctorId, entry.date);
  const messages: Omit<InfoBarMessage, 'id'>[] = [];
  const push = () => {
    messages.push({
      severity: 'warning',
      title: t('page.toast.minIntervalWarning.title'),
      description: t('page.toast.minIntervalWarning.description', {
        doctorName,
        interval: minInterval,
      }),
      autoDismissMs: 5000,
    });
  };
  if (before && violatesMinInterval(before.date, entry.date, minInterval)) push();
  if (after && violatesMinInterval(entry.date, after.date, minInterval)) push();
  return messages;
}

export default function RotawisePage() {
  const { t, currentDateFnsLocale, language } = useLanguage();
  const {
    fileHandle,
    fileName,
    isSupported,
    launchQueueData,
    clearLaunchQueueData,
    openFile,
    saveToFile,
  } = useFileSystem();
  const { messages, addMessage, dismissMessage } = useInfoBar();
  const { push: historyPush, undo: historyUndo, canUndo } = useHistory();
  const { generate } = useScheduleWorker();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [doctorsProfiles, setDoctorsProfiles] = useState<DoctorProfile[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [holidays, setHolidays] = useState<Date[]>([]);
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);
  const [warningsCollapsed, setWarningsCollapsed] = useState(true);
  const [calendarFilters, setCalendarFilters] = useState<ActiveFilter[]>([]);
  const [currentMinInterval, setCurrentMinInterval] = useState<number>(1);
  const [loadedFormValues, setLoadedFormValues] = useState<Partial<ScheduleFormValues> | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [dataInputFormKey, setDataInputFormKey] = useState(0);
  const [activeTab, setActiveTab] = useState<AppTab>('config');
  const [isFileSessionActive, setIsFileSessionActive] = useState(false);
  const [showClearScheduleDialog, setShowClearScheduleDialog] = useState(false);
  const [showClearDoctorDetailsDialog, setShowClearDoctorDetailsDialog] = useState(false);

  const formRef = useRef<UseFormReturn<ScheduleFormValues> | null>(null);
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

  useEffect(() => {
    if (!launchQueueData) return;
    hydrateFromFileData(launchQueueData);
    setIsFileSessionActive(true);
    clearLaunchQueueData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchQueueData]);

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

  const debouncedSaveToFile = useDebouncedCallback(async (data: AppFileData) => {
    if (!fileHandle) return;
    try {
      await saveToFile(data);
    } catch (err) {
      console.error('[Page] Auto-save failed:', err);
      addMessage({ severity: 'error', title: t('file.saveError'), autoDismissMs: 5000 });
    }
  }, 500);

  useEffect(() => {
    if (!isMounted || !fileHandle) return;

    const formDoctorIds = new Set((loadedFormValues?.doctors || []).map((d) => d.id).filter(Boolean));
    const syncedProfiles =
      formDoctorIds.size === 0 ? [] : doctorsProfiles.filter((p) => formDoctorIds.has(p.id));

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

  const hydrateFromFileData = useCallback((data: AppFileData) => {
    const { schedule: s, doctorsProfiles: dp, formValues: fv, scheduleWarnings: sw, currentMinInterval: cmi } =
      deserializeAppFileData(data);
    const hasEntries = !!s && s.entries.length > 0;
    setSchedule(s);
    setDoctorsProfiles(hasEntries ? dp : []);
    setUnits(fv?.units ?? []);
    setHolidays((fv?.holidays ?? []).map((d) => (d instanceof Date ? d : toLocalDate(d))));
    setScheduleWarnings(sw);
    setCurrentMinInterval(cmi);
    if (fv) {
      setLoadedFormValues(fv);
      setDataInputFormKey((prev) => prev + 1);
    }
    if (hasEntries) setActiveTab('calendar');
    else setActiveTab('config');
  }, []);

  const handleFileReady = useCallback(
    (data: AppFileData, _convertedFromJson?: boolean) => {
      hydrateFromFileData(data);
      setIsFileSessionActive(true);
      addMessage({ severity: 'success', title: t('file.opened'), autoDismissMs: 3000 });
    },
    [hydrateFromFileData, addMessage, t],
  );

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      if (file.name.toLowerCase().endsWith('.rw') || file.name.toLowerCase().endsWith('.json')) {
        void openFile();
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [openFile]);

  const handleFileError = useCallback(
    (msg: string) => {
      addMessage({ severity: 'error', title: msg, autoDismissMs: 5000 });
    },
    [addMessage],
  );

  const handleSubmitForm = async (data: ScheduleFormValues) => {
    historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });
    setIsLoading(true);
    setScheduleWarnings([]);
    setCurrentMinInterval(data.minIntervalBetweenWorkDays || 1);

    const profiles: DoctorProfile[] = data.doctors.map(toDoctorProfile);
    setDoctorsProfiles(profiles);
    setUnits((data.units ?? []).map(normalizeUnit));

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

  const handleGenerateClick = () => {
    if (!formRef.current) return;
    void formRef.current.handleSubmit(handleSubmitForm)();
  };

  const handleArbitraryScheduleEntry = useCallback(
    (updatedEntry: ScheduleEntry) => {
      if (!schedule) return;
      historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });
      setSchedule(applyArbitraryScheduleEntry(schedule, updatedEntry));
    },
    [schedule, historyPush, doctorsProfiles, scheduleWarnings, currentMinInterval],
  );

  const handleSwapScheduleEntries = useCallback(
    (entry1: ScheduleEntry, entry2: ScheduleEntry, oldDate1?: Date, oldDate2?: Date) => {
      if (!schedule) return;
      historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

      const updated = applySwapScheduleEntries(schedule, entry1, entry2, oldDate1, oldDate2);
      const effectiveMinInterval = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
      const pendingMessages = [
        ...minIntervalMessages(
          updated.entries,
          entry1,
          effectiveMinInterval,
          doctorsProfiles.find((dp) => dp.id === entry1.doctorId)?.name,
          t,
        ),
        ...minIntervalMessages(
          updated.entries,
          entry2,
          effectiveMinInterval,
          doctorsProfiles.find((dp) => dp.id === entry2.doctorId)?.name,
          t,
        ),
      ];

      setSchedule(updated);
      pendingMessages.forEach((msg) => addMessage(msg));
    },
    [schedule, historyPush, doctorsProfiles, scheduleWarnings, currentMinInterval, addMessage, t],
  );

  const handleUpdateScheduleEntry = useCallback(
    (updatedEntry: ScheduleEntry, oldDate?: Date) => {
      if (!schedule) return;
      historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

      const updated = applyUpdateScheduleEntry(schedule, updatedEntry, oldDate);
      const effectiveMinInterval = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
      const doctorProfile = doctorsProfiles.find((dp) => dp.id === updatedEntry.doctorId);
      const pendingMessages = minIntervalMessages(
        updated.entries,
        updatedEntry,
        effectiveMinInterval,
        doctorProfile?.name,
        t,
      );

      if (doctorProfile && updatedEntry.assignment === 'Work') {
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

      setSchedule(updated);
      pendingMessages.forEach((msg) => addMessage(msg));
    },
    [schedule, historyPush, doctorsProfiles, scheduleWarnings, currentMinInterval, addMessage, t],
  );

  const handleToggleMonthFixed = useCallback(
    (month: Date, isFixed: boolean) => {
      if (!schedule) return;
      historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });
      setSchedule(applyToggleMonthFixed(schedule, month, isFixed));
      addMessage({
        severity: 'success',
        title: isFixed ? t('page.toast.monthFixed.title') : t('page.toast.monthUnfixed.title'),
        description: isFixed
          ? t('page.toast.monthFixed.description', {
              month: format(month, 'MMMM yyyy', { locale: currentDateFnsLocale }),
            })
          : t('page.toast.monthUnfixed.description', {
              month: format(month, 'MMMM yyyy', { locale: currentDateFnsLocale }),
            }),
        autoDismissMs: 3000,
      });
    },
    [schedule, historyPush, doctorsProfiles, scheduleWarnings, currentMinInterval, addMessage, t, currentDateFnsLocale],
  );

  const handleToggleEntryFixed = useCallback(
    (entry: ScheduleEntry, isFixed: boolean) => {
      if (!schedule) return;
      historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });
      setSchedule(applyToggleEntryFixed(schedule, entry, isFixed));
    },
    [schedule, historyPush, doctorsProfiles, scheduleWarnings, currentMinInterval],
  );

  const handleRemoveWorkEntriesForDate = useCallback(
    (targetDate: Date) => {
      if (!schedule) return;
      historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });
      setSchedule(applyRemoveWorkEntriesForDate(schedule, targetDate));
    },
    [schedule, historyPush, doctorsProfiles, scheduleWarnings, currentMinInterval],
  );

  const handleToggleFreeDay = useCallback(
    (date: Date, doctorId: string) => {
      if (!schedule) return;
      historyPush({ schedule, doctorsProfiles, scheduleWarnings, currentMinInterval });

      const doctor = doctorsProfiles.find((d) => d.id === doctorId);
      if (!doctor) return;

      const hasFreeEntry = schedule.entries.some(
        (e) => e.doctorId === doctorId && isSameDay(e.date, date) && e.assignment === 'Free',
      );

      setSchedule(applyToggleFreeDayOnSchedule(schedule, date, doctorId, !hasFreeEntry));

      setDoctorsProfiles((prev) =>
        prev.map((d) =>
          d.id === doctorId
            ? {
                ...d,
                freeDates: hasFreeEntry
                  ? d.freeDates.filter((fd) => !isSameDay(fd, date))
                  : [...d.freeDates, date],
              }
            : d,
        ),
      );

      setLoadedFormValues((prev) =>
        prev
          ? {
              ...prev,
              doctors:
                prev.doctors?.map((d) =>
                  d.id === doctorId
                    ? {
                        ...d,
                        freeDates: hasFreeEntry
                          ? (d.freeDates || []).filter((fd: Date | string) => !isSameDay(new Date(fd), date))
                          : [...(d.freeDates || []), date],
                      }
                    : d,
                ) ?? [],
            }
          : prev,
      );

      setDataInputFormKey((k) => k + 1);
    },
    [schedule, doctorsProfiles, scheduleWarnings, currentMinInterval, historyPush],
  );

  const handleClearSchedule = () => {
    setSchedule(null);
    setScheduleWarnings([]);
    setActiveTab('config');
    if (fileHandle) {
      saveToFile(buildAppFileData(null, doctorsProfiles, loadedFormValues, [], currentMinInterval, fileVersions)).catch(
        console.error,
      );
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
      setLoadedFormValues(reset);
      setDoctorsProfiles([]);
      if (fileHandle) {
        saveToFile(
          buildAppFileData(schedule, [], reset, scheduleWarnings, currentMinInterval, fileVersions),
        ).catch(console.error);
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

  const handleLiveFormValuesChange = useCallback((values: ScheduleFormValues) => {
    setLoadedFormValues(values);

    const formDoctorsById = new Map<string, DoctorFormFieldInput>(
      values.doctors.filter((d) => !!d.id).map((d) => [d.id as string, d]),
    );
    if (formDoctorsById.size === 0) {
      setDoctorsProfiles([]);
    } else {
      setDoctorsProfiles((prev) => {
        const refreshed: DoctorProfile[] = [];
        const seen = new Set<string>();
        for (const formDoc of values.doctors) {
          if (!formDoc.id) continue;
          seen.add(formDoc.id);
          refreshed.push(toDoctorProfile(formDoc));
        }
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

    setUnits((values.units ?? []).map(normalizeUnit));
    setHolidays((values.holidays ?? []).map((d) => (d instanceof Date ? d : new Date(d))));
  }, []);

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

  const hasScheduleEntries = !!schedule && schedule.entries.length > 0;
  const hasDoctors =
    !!loadedFormValues?.doctors?.length && !loadedFormValues.doctors.every((d) => !d.name?.trim());
  const isBusy = isLoading || isExportingWord;

  const navItems = [
    { id: 'config' as const, icon: Users, labelKey: 'nav.config' },
    { id: 'calendar' as const, icon: CalendarDays, labelKey: 'nav.calendar', disabled: !schedule },
    { id: 'weekly' as const, icon: BarChart2, labelKey: 'nav.weeklySummary', disabled: !hasScheduleEntries },
    { id: 'monthly' as const, icon: LayoutGrid, labelKey: 'nav.monthlySummary', disabled: !hasScheduleEntries },
  ];

  return (
    <>
      {!isFileSessionActive ? (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-[#0f172a]" />}>
          <StartupScreen onFileReady={handleFileReady} onError={handleFileError} />
        </Suspense>
      ) : (
        <>
          <div className="app-shell">
            <AppSidebar navItems={navItems} activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="app-body">
              <CommandBar
                fileName={fileName}
                canGenerate={hasDoctors}
                canUndo={canUndo}
                hasSchedule={!!schedule}
                hasDoctors={hasDoctors}
                isBusy={isBusy}
                isLoading={isLoading}
                isExportingWord={isExportingWord}
                onGenerate={handleGenerateClick}
                onUndo={handleUndoHistory}
                onExportWord={handleExportWord}
                onClearSchedule={() => setShowClearScheduleDialog(true)}
                onClearDoctors={() => setShowClearDoctorDetailsDialog(true)}
              />

              {scheduleWarnings.length > 0 && activeTab !== 'config' && (
                <ScheduleWarningsBanner
                  warnings={scheduleWarnings}
                  collapsed={warningsCollapsed}
                  onToggleCollapsed={() => setWarningsCollapsed(!warningsCollapsed)}
                />
              )}

              <main className="app-main">
                <div className={cn('p-4 md:p-6 w-full max-w-5xl mx-auto', activeTab !== 'config' && 'hidden')}>
                  <Suspense
                    fallback={
                      <div className="flex justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
                      </div>
                    }
                  >
                    <DataInputForm
                      key={dataInputFormKey}
                      ref={formRef}
                      onSubmit={handleSubmitForm}
                      isLoading={isLoading}
                      initialValues={loadedFormValues || stableDefaultFormValues}
                      onValuesChange={handleLiveFormValuesChange}
                    />
                  </Suspense>
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

          <ConfirmDialogs
            showClearSchedule={showClearScheduleDialog}
            showClearDoctors={showClearDoctorDetailsDialog}
            onShowClearScheduleChange={setShowClearScheduleDialog}
            onShowClearDoctorsChange={setShowClearDoctorDetailsDialog}
            onConfirmClearSchedule={handleClearSchedule}
            onConfirmClearDoctors={handleClearDoctorDetails}
          />
        </>
      )}

      <InfoBarList messages={messages} onDismiss={dismissMessage} />
    </>
  );
}
