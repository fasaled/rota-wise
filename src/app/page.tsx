"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Schedule, ScheduleFormValues, DoctorProfile, ScheduleEntry, PersistedScheduleData, SerializedDoctorFormFieldInput, DoctorFormFieldInput } from '@/lib/types';
import DataInputForm from '@/components/rotawise/data-input-form';
import ScheduleCalendarView from '@/components/rotawise/schedule-calendar-view';
import LanguageSelector from '@/components/rotawise/language-selector';
import { generateScheduleAction } from '@/lib/actions';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from "@/hooks/use-toast";
import { ThemeIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import { Save, Upload, FileDown, Layers, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, addMonths, isSameDay, differenceInCalendarDays, subDays, eachMonthOfInterval, isSameMonth as isSameMonthDateFns, eachDayOfInterval as eachDayOfIntervalFns, endOfMonth, isWithinInterval, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { useLanguage } from '@/context/language-context';
import { ThemeToggle } from '@/components/theme-toggle';
import ScheduleSummaryTable from '@/components/rotawise/schedule-summary-table';
import MonthlyWorkloadSummaryTable from '@/components/rotawise/MonthlyWorkloadSummaryTable';

type LoadMode = 'as-is' | 'as-pre-assigned';

const LOCAL_STORAGE_KEY = 'rotawiseAppState';

export default function RotawisePage() {
  const { t, language, currentDateFnsLocale } = useLanguage();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [doctorsProfiles, setDoctorsProfiles] = useState<DoctorProfile[]>([]);
  const { toast } = useToast();
  const [isMounted, setIsMounted] = useState(false);
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);

  const [currentMinInterval, setCurrentMinInterval] = useState<number>(1);
  const [loadedFormValues, setLoadedFormValues] = useState<Partial<ScheduleFormValues> | null>(null);
  const [dataInputFormKey, setDataInputFormKey] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load state from localStorage on initial mount
  useEffect(() => {
    if (!isMounted) return;

    try {
      const persistedStateString = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (persistedStateString) {
        const loadedData = JSON.parse(persistedStateString) as PersistedScheduleData;
        
        if (loadedData.schedule && loadedData.doctorsProfiles && loadedData.formValues) {
          // Deserialize schedule
          const deserializedScheduleEntries = loadedData.schedule.entries.map(entry => ({
            ...entry,
            date: new Date(entry.date),
          }));
          const finalSchedule: Schedule = {
            ...loadedData.schedule,
            startDate: new Date(loadedData.schedule.startDate),
            endDate: new Date(loadedData.schedule.endDate),
            minIntervalBetweenWorkDays: loadedData.schedule.minIntervalBetweenWorkDays || 1,
            entries: deserializedScheduleEntries,
          };
          setSchedule(finalSchedule);

          // Deserialize doctor profiles
          const deserializedDoctorsProfiles = loadedData.doctorsProfiles.map(profile => ({
            ...profile,
            vacationDates: profile.vacationDates.map((d: string) => new Date(d)),
            preAssignedWorkDates: profile.preAssignedWorkDates.map((d: string) => new Date(d)),
            excludedDates: (profile.excludedDates || []).map((d: string) => new Date(d)),
          }));
          setDoctorsProfiles(deserializedDoctorsProfiles);
          
          // Deserialize form values
          const deserializedFormValuesDoctors = loadedData.formValues.doctors.map((doc: SerializedDoctorFormFieldInput) => ({
            id: doc.id,
            name: doc.name,
            vacationDates: doc.vacationDates.map((d: string) => new Date(d)),
            preAssignedWorkDates: doc.preAssignedWorkDates.map((d: string) => new Date(d)),
            excludedDates: (doc.excludedDates || []).map((d: string) => new Date(d)),
            isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
          }));
          const finalFormValues: ScheduleFormValues = {
            numberOfDoctors: loadedData.formValues.numberOfDoctors,
            startDate: new Date(loadedData.formValues.startDate),
            endDate: new Date(loadedData.formValues.endDate),
            minIntervalBetweenWorkDays: loadedData.formValues.minIntervalBetweenWorkDays || 1,
            doctors: deserializedFormValuesDoctors
          };
          setLoadedFormValues(finalFormValues);
          setDataInputFormKey(prevKey => prevKey + 1); // Re-initialize form

          setScheduleWarnings(loadedData.scheduleWarnings || []);
          setCurrentMinInterval(loadedData.currentMinInterval || 1);

          toast({
            title: t('page.toast.stateRestored.title'),
            description: t('page.toast.stateRestored.description'),
          });
        } else {
          localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear invalid/incomplete data
        }
      }
    } catch (error) {
      console.error("Failed to load state from localStorage:", error);
      toast({
        title: t('page.toast.errorRestoringState.title'),
        description: t('page.toast.errorRestoringState.description'),
        variant: "destructive",
      });
      localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear corrupted data
    }
  }, [isMounted, t, toast]); // Added t and toast as dependencies

  // Save state to localStorage whenever relevant parts change
  useEffect(() => {
    if (!isMounted) return;

    if (schedule && doctorsProfiles.length > 0) {
      try {
        const dataToPersist: PersistedScheduleData = {
          schedule: {
            ...schedule,
            startDate: schedule.startDate.toISOString(),
            endDate: schedule.endDate.toISOString(),
            minIntervalBetweenWorkDays: schedule.minIntervalBetweenWorkDays || currentMinInterval,
            entries: schedule.entries.map(entry => ({
              ...entry,
              date: entry.date.toISOString(),
            })),
          },
          doctorsProfiles: doctorsProfiles.map(profile => ({
            ...profile,
            vacationDates: profile.vacationDates.map(d => d.toISOString()),
            preAssignedWorkDates: profile.preAssignedWorkDates.map(d => d.toISOString()),
            excludedDates: (profile.excludedDates || []).map(d => d.toISOString()),
            isExcludedFromAutomaticAssignment: profile.isExcludedFromAutomaticAssignment || false,
          })),
          // Use current form values if available, otherwise derive from schedule/profiles
          // This assumes that after schedule generation, doctorsProfiles reflects the input form doctors
          formValues: {
            numberOfDoctors: doctorsProfiles.length,
            startDate: schedule.startDate.toISOString(),
            endDate: schedule.endDate.toISOString(),
            minIntervalBetweenWorkDays: schedule.minIntervalBetweenWorkDays || currentMinInterval,
            doctors: doctorsProfiles.map(p => ({
              id: p.id,
              name: p.name,
              vacationDates: p.vacationDates.map(d => d.toISOString()),
              preAssignedWorkDates: p.preAssignedWorkDates.map(d => d.toISOString()),
              excludedDates: (p.excludedDates || []).map(d => d.toISOString()),
              isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
            })),
          },
          scheduleWarnings: scheduleWarnings,
          currentMinInterval: currentMinInterval,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToPersist));
      } catch (error) {
        console.error("Failed to save state to localStorage:", error);
        toast({
          title: t('page.toast.errorPersistingState.title'),
          description: t('page.toast.errorPersistingState.description'),
          variant: "destructive",
        });
      }
    } else {
      // If there's no schedule or doctors, clear localStorage to avoid loading stale data
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, [schedule, doctorsProfiles, scheduleWarnings, currentMinInterval, isMounted, t, toast]); // Added t and toast

  const [stableDefaultPageFormValues] = useState<Partial<ScheduleFormValues>>(() => ({
    numberOfDoctors: 1,
    startDate: undefined,
    endDate: undefined,
    minIntervalBetweenWorkDays: 1,
    doctors: [
      { id: crypto.randomUUID(), name: '', vacationDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false },
    ]
  }));

  const handleSubmitForm = async (data: ScheduleFormValues) => {
    setIsLoading(true);
    setScheduleWarnings([]); // Clear previous warnings
    setCurrentMinInterval(data.minIntervalBetweenWorkDays || 1);
    const profiles: DoctorProfile[] = data.doctors.map(doc => ({
      id: doc.id,
      name: doc.name,
      vacationDates: doc.vacationDates,
      preAssignedWorkDates: doc.preAssignedWorkDates,
      excludedDates: doc.excludedDates || [],
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    }));
    setDoctorsProfiles(profiles);

    const result = await generateScheduleAction(data, language);
    setIsLoading(false);

    if (result.error) {
      toast({
        title: t('page.toast.errorGenerating.title'),
        description: result.error,
        variant: "destructive",
      });
      setSchedule(null);
    } else if (result.schedule) {
      const processedSchedule: Schedule = {
        ...result.schedule,
        startDate: new Date(result.schedule.startDate),
        endDate: new Date(result.schedule.endDate),
        minIntervalBetweenWorkDays: result.schedule.minIntervalBetweenWorkDays,
        entries: result.schedule.entries.map(entry => ({
          ...entry,
          date: new Date(entry.date),
        })),
      };
      setSchedule(processedSchedule);
      toast({
        title: t('page.toast.scheduleGenerated.title'),
        description: t('page.toast.scheduleGenerated.description'),
      });

      if (result.warnings && result.warnings.length > 0) {
        setScheduleWarnings(result.warnings); // Store warnings for display on page and PDF
        result.warnings.forEach(warningMsg => {
          toast({ // Still show toasts for immediate feedback
            title: t('page.toast.scheduleWarning.title'),
            description: warningMsg,
            duration: 10000, 
          });
        });
      }
    }
  };

 const handleUpdateScheduleEntry = (updatedEntry: ScheduleEntry) => {
    setSchedule(prevSchedule => {
      if (!prevSchedule) return null;

      const doctorProfile = doctorsProfiles.find(dp => dp.id === updatedEntry.doctorId);
      const effectiveMinInterval = prevSchedule.minIntervalBetweenWorkDays ?? currentMinInterval;

      if (doctorProfile && (updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned')) {
        const workOrPreassignedEntries = prevSchedule.entries.filter(
          e => e.doctorId === updatedEntry.doctorId && (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && !isSameDay(e.date, updatedEntry.date)
        );
        
        const closestWorkDayBefore = workOrPreassignedEntries
          .filter(e => e.date < updatedEntry.date)
          .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

        const closestWorkDayAfter = workOrPreassignedEntries
          .filter(e => e.date > updatedEntry.date)
          .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

        if (closestWorkDayBefore) {
          const diff = differenceInCalendarDays(updatedEntry.date, closestWorkDayBefore.date);
          if (diff <= effectiveMinInterval) {
            toast({
              title: t('page.toast.minIntervalWarning.title'),
              description: t('page.toast.minIntervalWarning.description', { doctorName: doctorProfile.name, interval: effectiveMinInterval }),
              variant: "destructive",
            });
          }
        }
        if (closestWorkDayAfter) {
          const diff = differenceInCalendarDays(closestWorkDayAfter.date, updatedEntry.date);
           if (diff <= effectiveMinInterval) {
            toast({
              title: t('page.toast.minIntervalWarning.title'),
              description: t('page.toast.minIntervalWarning.description', { doctorName: doctorProfile.name, interval: effectiveMinInterval }),
              variant: "destructive",
            });
          }
        }
      }


      let newEntries = prevSchedule.entries.filter(e =>
        !(e.date.getTime() === updatedEntry.date.getTime() && e.doctorId === (updatedEntry.assignment === 'Off' ? e.doctorId : updatedEntry.doctorId))
      );

      if (updatedEntry.assignment !== 'Off') {
          const idx = newEntries.findIndex(e => e.date.getTime() === updatedEntry.date.getTime() && e.doctorId === updatedEntry.doctorId);
          if (idx > -1) newEntries.splice(idx, 1);
          
          if (updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned') {
            newEntries = newEntries.filter(e => {
                const isSameDayEntry = e.date.getTime() === updatedEntry.date.getTime();
                if (!isSameDayEntry) return true;
                const isConflictingWork = (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && e.doctorId !== updatedEntry.doctorId;
                return !(e.assignment === 'Off' || isConflictingWork);
            });
          }
          newEntries.push(updatedEntry);
      } else {
          const idx = newEntries.findIndex(e => e.date.getTime() === updatedEntry.date.getTime() && e.doctorId === updatedEntry.doctorId);
          if (idx > -1) newEntries.splice(idx, 1);

          const otherDoctorWorking = newEntries.some(e => e.date.getTime() === updatedEntry.date.getTime() && (e.assignment === 'Work' || e.assignment === 'Pre-assigned'));
          if (!otherDoctorWorking) {
            const systemOffExists = newEntries.some(e => e.date.getTime() === updatedEntry.date.getTime() && e.doctorId === 'system' && e.assignment === 'Off');
            if (!systemOffExists) {
                newEntries.push({
                    date: updatedEntry.date,
                    doctorId: 'system',
                    assignment: 'Off',
                    dayOfWeek: updatedEntry.dayOfWeek,
                });
            }
          }
      }


      if (doctorProfile && updatedEntry.assignment === 'Work') {
        const isVacation = doctorProfile.vacationDates.some(vd =>
          isSameDay(vd, updatedEntry.date)
        );
        if (isVacation) {
          toast({
            title: t('page.toast.scheduleWarning.title'),
            description: t('page.toast.scheduleWarning.description', { doctorName: doctorProfile.name }),
            variant: "destructive",
          });
        }
        const isExcluded = (doctorProfile.excludedDates || []).some(ed =>
          isSameDay(ed, updatedEntry.date)
        );
        if (isExcluded) {
          toast({
            title: t('page.toast.scheduleWarning.title'),
            description: t('page.toast.excludedDayWarning.description', { doctorName: doctorProfile.name }),
            variant: "destructive",
          });
        }
      }
      return { ...prevSchedule, entries: newEntries };
    });
  };

  const handleSaveSchedule = () => {
    if (!schedule || !doctorsProfiles.length) {
      toast({
        title: t('page.toast.nothingToSave.title'),
        description: t('page.toast.nothingToSave.description'),
        variant: "destructive"
      });
      return;
    }

    const dataToSave: PersistedScheduleData = {
      schedule: {
        ...schedule,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        minIntervalBetweenWorkDays: schedule.minIntervalBetweenWorkDays || currentMinInterval,
        entries: schedule.entries.map(entry => ({
          ...entry,
          date: entry.date.toISOString(),
        })),
      },
      doctorsProfiles: doctorsProfiles.map(profile => ({
        ...profile,
        vacationDates: profile.vacationDates.map(d => d.toISOString()),
        preAssignedWorkDates: profile.preAssignedWorkDates.map(d => d.toISOString()),
        excludedDates: (profile.excludedDates || []).map(d => d.toISOString()),
        isExcludedFromAutomaticAssignment: profile.isExcludedFromAutomaticAssignment || false,
      })),
      formValues: {
        numberOfDoctors: doctorsProfiles.length,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        minIntervalBetweenWorkDays: schedule.minIntervalBetweenWorkDays || currentMinInterval,
        doctors: doctorsProfiles.map(p => ({
          id: p.id,
          name: p.name,
          vacationDates: p.vacationDates.map(d => d.toISOString()),
          preAssignedWorkDates: p.preAssignedWorkDates.map(d => d.toISOString()),
          excludedDates: (p.excludedDates || []).map(d => d.toISOString()),
          isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
        }))
      }
    };

    const jsonString = JSON.stringify(dataToSave, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rotawise-schedule.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: t('page.toast.scheduleSaved.title'),
      description: t('page.toast.scheduleSaved.description')
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, mode: LoadMode) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear localStorage before loading from file to prevent conflicts
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.warn("Could not clear localStorage before file upload:", error);
    }

    setSchedule(null);
    setScheduleWarnings([]);
    setDoctorsProfiles([]);
    
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          throw new Error("Failed to read file content.");
        }
        const loadedData = JSON.parse(text) as PersistedScheduleData;

        if (!loadedData.schedule || !loadedData.doctorsProfiles || !loadedData.formValues) {
          throw new Error("Invalid schedule file format. Missing key data.");
        }
        if (typeof loadedData.schedule.startDate !== 'string' || typeof loadedData.schedule.endDate !== 'string') {
          throw new Error("Invalid date format in schedule data.");
        }
        if (typeof loadedData.formValues.startDate !== 'string' || typeof loadedData.formValues.endDate !== 'string') {
             throw new Error("Invalid date format in form values data for schedule.");
        }

        const deserializedScheduleEntries = loadedData.schedule.entries.map(entry => ({
            ...entry,
            date: new Date(entry.date),
        }));
        const deserializedDoctorsProfiles = loadedData.doctorsProfiles.map(profile => ({
            ...profile,
            vacationDates: profile.vacationDates.map((d: string) => new Date(d)),
            preAssignedWorkDates: profile.preAssignedWorkDates.map((d: string) => new Date(d)),
            excludedDates: (profile.excludedDates || []).map((d: string) => new Date(d)),
            isExcludedFromAutomaticAssignment: profile.isExcludedFromAutomaticAssignment || false,
        }));
        const deserializedFormValuesDoctors = loadedData.formValues.doctors.map((doc: SerializedDoctorFormFieldInput) => ({
            id: doc.id,
            name: doc.name,
            vacationDates: doc.vacationDates.map((d: string) => new Date(d)),
            preAssignedWorkDates: doc.preAssignedWorkDates.map((d: string) => new Date(d)),
            excludedDates: (doc.excludedDates || []).map((d: string) => new Date(d)),
            isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
        }));


        let finalScheduleEntries: ScheduleEntry[];
        let finalDoctorsProfiles: DoctorProfile[];
        let finalFormValuesDoctors: DoctorFormFieldInput[];

        if (mode === 'as-pre-assigned') {
            const originalWorkDatesByDoctor = new Map<string, Date[]>();
            deserializedScheduleEntries.forEach(entry => {
              if (entry.assignment === 'Work' && entry.doctorId !== 'system') {
                if (!originalWorkDatesByDoctor.has(entry.doctorId)) {
                  originalWorkDatesByDoctor.set(entry.doctorId, []);
                }
                originalWorkDatesByDoctor.get(entry.doctorId)!.push(entry.date);
              }
            });

            finalScheduleEntries = deserializedScheduleEntries.map(entry => {
              if (entry.assignment === 'Work' && entry.doctorId !== 'system') {
                return { ...entry, assignment: 'Pre-assigned' };
              }
              return entry;
            });
            
            finalDoctorsProfiles = deserializedDoctorsProfiles.map(profile => {
              const workDatesForThisDoctor = originalWorkDatesByDoctor.get(profile.id) || [];
              const allPreAssignedDates = [...profile.preAssignedWorkDates, ...workDatesForThisDoctor];
              const uniquePreAssignedDates = Array.from(new Set(allPreAssignedDates.map(d => d.getTime())))
                                               .map(time => new Date(time));
              return { ...profile, preAssignedWorkDates: uniquePreAssignedDates };
            });

            finalFormValuesDoctors = deserializedFormValuesDoctors.map(doc => {
              const workDatesForThisDoctor = originalWorkDatesByDoctor.get(doc.id) || [];
              const allPreAssignedDates = [...doc.preAssignedWorkDates, ...workDatesForThisDoctor];
              const uniquePreAssignedDates = Array.from(new Set(allPreAssignedDates.map(d => d.getTime())))
                                               .map(time => new Date(time));
              return { ...doc, preAssignedWorkDates: uniquePreAssignedDates };
            });

        } else { // mode === 'as-is'
            finalScheduleEntries = deserializedScheduleEntries;
            finalDoctorsProfiles = deserializedDoctorsProfiles;
            finalFormValuesDoctors = deserializedFormValuesDoctors;
        }

        const finalSchedule: Schedule = {
          ...loadedData.schedule,
          startDate: new Date(loadedData.schedule.startDate),
          endDate: new Date(loadedData.schedule.endDate),
          minIntervalBetweenWorkDays: loadedData.schedule.minIntervalBetweenWorkDays || 1,
          entries: finalScheduleEntries,
        };
        
        const finalFormValues: ScheduleFormValues = {
           numberOfDoctors: loadedData.formValues.numberOfDoctors,
           startDate: new Date(loadedData.formValues.startDate),
           endDate: new Date(loadedData.formValues.endDate),
           minIntervalBetweenWorkDays: loadedData.formValues.minIntervalBetweenWorkDays || 1,
           doctors: finalFormValuesDoctors
        };

        setSchedule(finalSchedule);
        setDoctorsProfiles(finalDoctorsProfiles);
        setCurrentMinInterval(finalFormValues.minIntervalBetweenWorkDays || 1);
        setLoadedFormValues(finalFormValues);
        setDataInputFormKey(prevKey => prevKey + 1);

        toast({
          title: t('page.toast.scheduleLoaded.title'),
          description: mode === 'as-pre-assigned'
            ? t('page.toast.scheduleLoadedAsPreassigned.description')
            : t('page.toast.scheduleLoaded.description')
        });
      } catch (err) {
        console.error("Error loading schedule:", err);
        toast({
          title: t('page.toast.errorLoading.title'),
          description: (err as Error).message,
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
        if (event.target) {
          event.target.value = "";
        }
      }
    };
    reader.readAsText(file);
  };

  const handleExportPdf = async () => {
    if (!schedule || !doctorsProfiles.length) {
      toast({
        title: t('page.toast.noScheduleToExport.title'),
        description: t('page.toast.noScheduleToExport.description'),
        variant: "destructive"
      });
      return;
    }
    setIsExportingPdf(true);

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
    });

    // --- Report Styling Constants ---
    const PRIMARY_COLOR: [number, number, number] = [41, 128, 185]; // A slightly deeper blue
    const ACCENT_COLOR: [number, number, number] = [22, 160, 133]; // Teal for accents if needed
    const TEXT_COLOR_DARK: [number, number, number] = [0, 0, 0]; // Black
    const TEXT_COLOR_LIGHT: [number, number, number] = [255, 255, 255]; // White
    const TEXT_COLOR_MUTED: [number, number, number] = [100, 100, 100]; // Gray
    const BORDER_COLOR: [number, number, number] = [200, 200, 200]; // Light gray for borders

    const FONT_TITLE = 22;
    const FONT_SUBTITLE = 12;
    const FONT_SECTION_HEADER = 16;
    const FONT_TABLE_HEADER = 10;
    const FONT_BODY = 9;
    const FONT_FOOTER = 8;

    const BASE_FONT = 'helvetica'; // Standard PDF font

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 15; // Increased margin for better layout
    const contentWidth = pdfWidth - 2 * margin;
    let currentY = margin;
    let pageNumber = 1;
    const totalPages = { value: 1 }; // Object to pass by reference for total pages

    // Helper function to add footer
    const addPageFooter = () => {
      const footerHeight = 15;
      if (currentY > pdfHeight - footerHeight - margin) { // Ensure footer doesn't overlap content too much
         // This case might be tricky if called mid-autotable. Usually called by didDrawPage.
      }
      pdf.setFont(BASE_FONT, 'normal');
      pdf.setFontSize(FONT_FOOTER);
      pdf.setTextColor(TEXT_COLOR_MUTED[0], TEXT_COLOR_MUTED[1], TEXT_COLOR_MUTED[2]);
      
      const pageStr = `Page ${pageNumber}`;
      const genStr = t('pdf.generatedOn', { date: format(new Date(), 'PPP p', { locale: currentDateFnsLocale }) });
      
      pdf.text(genStr, margin, pdfHeight - margin + 5);
      pdf.text(pageStr, pdfWidth - margin - pdf.getStringUnitWidth(pageStr) * pdf.getFontSize() / pdf.internal.scaleFactor, pdfHeight - margin + 5);
    };
    
    // Helper function to add a new page with footer
    const addNewPageWithFooter = () => {
      addPageFooter(); // Add footer to current page before adding new one
      pdf.addPage();
      pageNumber++;
      currentY = margin;
      // It's complex to calculate totalPages upfront with autoTable, so we'll use a placeholder for now.
      // A more robust solution might involve rendering twice or using a library that supports "Page X of Y" better.
    };

    // --- Report Header ---
    pdf.setFont(BASE_FONT, 'bold');
    pdf.setFontSize(FONT_TITLE);
    pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    pdf.text(t('pdf.reportTitle'), pdfWidth / 2, currentY, { align: 'center' });
    currentY += FONT_TITLE * 0.5; // Adjust spacing based on font size

    pdf.setFont(BASE_FONT, 'normal');
    pdf.setFontSize(FONT_SUBTITLE);
    pdf.setTextColor(TEXT_COLOR_DARK[0], TEXT_COLOR_DARK[1], TEXT_COLOR_DARK[2]);
    const schedulePeriodText = t('pdf.schedulePeriod', {
        startDate: format(schedule.startDate, 'PPP', { locale: currentDateFnsLocale }),
        endDate: format(schedule.endDate, 'PPP', { locale: currentDateFnsLocale })
    });
    pdf.text(schedulePeriodText, pdfWidth / 2, currentY, { align: 'center' });
    currentY += FONT_SUBTITLE * 0.5;

    const intervalToDisplay = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
    const minIntervalText = t('pdf.minIntervalInfo', { interval: intervalToDisplay });
    pdf.text(minIntervalText, pdfWidth / 2, currentY, { align: 'center' });
    currentY += FONT_SUBTITLE * 0.7;

    pdf.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
    pdf.line(margin, currentY, pdfWidth - margin, currentY); // Horizontal line
    currentY += 10;


    // --- Schedule Warnings Section ---
    if (scheduleWarnings.length > 0) {
        const sectionTitle = t('pdf.warningsTitle');
        const titleWidth = pdf.getStringUnitWidth(sectionTitle) * FONT_SECTION_HEADER / pdf.internal.scaleFactor;
        const estimatedWarningHeight = 7 + (scheduleWarnings.length * FONT_BODY * 1.5); // Rough estimate

        if (currentY + estimatedWarningHeight > pdfHeight - margin - 15) { // Check space for section + footer
            addNewPageWithFooter();
        }

        pdf.setFont(BASE_FONT, 'bold');
        pdf.setFontSize(FONT_SECTION_HEADER);
        pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        pdf.text(sectionTitle, margin, currentY);
        currentY += FONT_SECTION_HEADER * 0.7;

        pdf.setFont(BASE_FONT, 'normal');
        pdf.setFontSize(FONT_BODY);
        pdf.setTextColor(TEXT_COLOR_DARK[0], TEXT_COLOR_DARK[1], TEXT_COLOR_DARK[2]);
        scheduleWarnings.forEach(warn => {
            const splitText = pdf.splitTextToSize(warn, contentWidth);
            if (currentY + (splitText.length * FONT_BODY * 0.5) > pdfHeight - margin - 15) {
                addNewPageWithFooter();
                // Redraw section title if it was the first thing on new page
                pdf.setFont(BASE_FONT, 'bold');
                pdf.setFontSize(FONT_SECTION_HEADER);
                pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
                pdf.text(sectionTitle, margin, currentY);
                currentY += FONT_SECTION_HEADER * 0.7;
                pdf.setFont(BASE_FONT, 'normal');
                pdf.setFontSize(FONT_BODY);
                pdf.setTextColor(TEXT_COLOR_DARK[0], TEXT_COLOR_DARK[1], TEXT_COLOR_DARK[2]);
            }
            pdf.text(splitText, margin + 2, currentY); // Indent warnings slightly
            currentY += (splitText.length * FONT_BODY * 0.5) + 2;
        });
        currentY += 10; // Space after warnings section
    }

    const getDoctorNameById = (id: string): string => doctorsProfiles.find(doc => doc.id === id)?.name || id;

    const getDoctorForDay = (day: Date): string => {
      const workingEntries = schedule.entries.filter(entry =>
        isSameDay(entry.date, day) &&
        (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned') &&
        entry.doctorId !== 'system'
      );
      if (workingEntries.length > 0) {
        return workingEntries.map(we => getDoctorNameById(we.doctorId)).join(', ');
      }
      return "";
    };

    const allMonthsToExport = eachMonthOfInterval({
        start: schedule.startDate,
        end: schedule.endDate,
    }).map(m => startOfMonth(m));

    // --- Monthly Calendar Grid Section ---
    for (const monthStartDate of allMonthsToExport) {
        const monthTitle = format(monthStartDate, 'MMMM yyyy', { locale: currentDateFnsLocale });
        const titleHeight = FONT_SECTION_HEADER * 0.7 + 5; // Title + spacing

        const firstDayOfCurrentMonth = monthStartDate;
        const lastDayOfCurrentMonth = endOfMonth(firstDayOfCurrentMonth);
        const calGridStartDate = startOfWeek(firstDayOfCurrentMonth, { locale: currentDateFnsLocale });
        const calGridEndDate = endOfWeek(lastDayOfCurrentMonth, { locale: currentDateFnsLocale });

        const weekDayHeaders: string[] = [];
        for (let i = 0; i < 7; i++) {
            const dayInWeek = addDays(calGridStartDate, i);
            const dayKey = format(dayInWeek, 'EEE', { locale: enUS }).toLowerCase(); // Keep enUS for keys
            weekDayHeaders.push(t(`pdf.workdaysSummary.${dayKey}Header` as any)); // Use translated headers
        }

        const monthMatrixBody: string[][] = [];
        let currentWeekRow: string[] = [];
        let dayIterator = new Date(calGridStartDate);
        
        // Estimate height: (number of weeks * cell height) + header height
        const numWeeks = Math.ceil(differenceInCalendarDays(calGridEndDate, calGridStartDate) / 7) + 1;
        const estimatedGridHeight = (numWeeks * 18) + 10; // Approx cell height 18mm, header 10mm

        if (currentY + titleHeight + estimatedGridHeight > pdfHeight - margin -15) {
            addNewPageWithFooter();
        }
        
        pdf.setFont(BASE_FONT, 'bold');
        pdf.setFontSize(FONT_SECTION_HEADER);
        pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        pdf.text(monthTitle, margin, currentY);
        currentY += titleHeight;
        
        while (dayIterator <= calGridEndDate) {
            let cellContent = "";
            if (isSameMonthDateFns(dayIterator, firstDayOfCurrentMonth) && 
                isWithinInterval(dayIterator, { start: schedule.startDate, end: schedule.endDate })) {
                const dayNumber = format(dayIterator, 'd');
                const doctorNameOnDay = getDoctorForDay(dayIterator);
                cellContent = dayNumber;
                if (doctorNameOnDay) {
                    // Split doctor names if too long for a cell, though autoTable handles overflow
                    const doctorNamesSplit = pdf.splitTextToSize(doctorNameOnDay, (contentWidth / 7) - 4);
                    cellContent += `\n${doctorNamesSplit.join('\n')}`;
                }
            } else if (isSameMonthDateFns(dayIterator, firstDayOfCurrentMonth)) {
                 cellContent = format(dayIterator, 'd'); // Day number for days in month but outside schedule range
            }
            // Else: cellContent remains "" for days outside current month or outside schedule range if preferred
            currentWeekRow.push(cellContent);

            if (currentWeekRow.length === 7 || isSameDay(dayIterator, calGridEndDate)) {
                monthMatrixBody.push([...currentWeekRow]);
                currentWeekRow = [];
            }
            dayIterator = addDays(dayIterator, 1);
        }

        if (monthMatrixBody.length > 0) {
            autoTable(pdf, {
                startY: currentY,
                head: [weekDayHeaders],
                body: monthMatrixBody,
                theme: 'grid',
                styles: {
                    font: BASE_FONT,
                    fontSize: FONT_BODY -1, // Slightly smaller for calendar cells
                    cellPadding: { top: 2, right: 1, bottom: 2, left: 1 },
                    valign: 'top',
                    halign: 'left',
                    minCellHeight: 15, // Ensure cells have enough height for day number + name
                    overflow: 'linebreak',
                },
                headStyles: {
                    fillColor: PRIMARY_COLOR,
                    textColor: TEXT_COLOR_LIGHT,
                    fontStyle: 'bold',
                    halign: 'center',
                    valign: 'middle',
                    fontSize: FONT_TABLE_HEADER,
                },
                columnStyles: { // Ensure equal width for 7 day columns
                  0: { cellWidth: contentWidth / 7 }, 1: { cellWidth: contentWidth / 7 },
                  2: { cellWidth: contentWidth / 7 }, 3: { cellWidth: contentWidth / 7 },
                  4: { cellWidth: contentWidth / 7 }, 5: { cellWidth: contentWidth / 7 },
                  6: { cellWidth: contentWidth / 7 },
                },
                margin: { left: margin, right: margin },
                didDrawPage: (data) => {
                    addPageFooter(); // Add footer after each page draw by autoTable
                    currentY = data.cursor?.y || currentY; // Update Y for next element
                    if (data.pageNumber > pageNumber) pageNumber = data.pageNumber;
                }
            });
            currentY = (pdf as any).lastAutoTable.finalY + 10;
        } else {
            currentY += 5; 
        }
    }
    
    // --- Doctor Details Section ---
    for (const doctor of doctorsProfiles) {
        const sectionTitle = t('pdf.doctorDetailsTitle', { doctorName: doctor.name });
        const estimatedSectionHeight = 40 + (doctor.isExcludedFromAutomaticAssignment ? 5 : 0); // Title + table

        if (currentY + estimatedSectionHeight > pdfHeight - margin - 15) { 
          addNewPageWithFooter();
        }

        pdf.setFont(BASE_FONT, 'bold');
        pdf.setFontSize(FONT_SECTION_HEADER);
        pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        pdf.text(sectionTitle, margin, currentY);
        currentY += FONT_SECTION_HEADER * 0.7 + 2; // Title + spacing
        
        if (doctor.isExcludedFromAutomaticAssignment) {
            pdf.setFont(BASE_FONT, 'normal');
            pdf.setFontSize(FONT_BODY - 1);
            pdf.setTextColor(TEXT_COLOR_MUTED[0], TEXT_COLOR_MUTED[1], TEXT_COLOR_MUTED[2]);
            pdf.text(t('pdf.doctorIsExcludedFromAuto'), margin, currentY);
            currentY += FONT_BODY * 0.5;
            pdf.setTextColor(TEXT_COLOR_DARK[0], TEXT_COLOR_DARK[1], TEXT_COLOR_DARK[2]);
        }

        const getFormattedDates = (dates: Date[]) => dates.length > 0 
            ? dates.map(d => format(d, 'PPP', { locale: currentDateFnsLocale })).join('\n') 
            : t('pdf.none');

        const allWorkDatesSet = new Set<number>();
        doctor.preAssignedWorkDates.forEach(date => allWorkDatesSet.add(date.getTime()));
        schedule.entries.forEach(entry => {
          if (entry.doctorId === doctor.id && entry.assignment === 'Work') {
            allWorkDatesSet.add(entry.date.getTime());
          }
        });
        const allWorkDates = Array.from(allWorkDatesSet)
          .map(time => new Date(time))
          .sort((a, b) => a.getTime() - b.getTime());

        autoTable(pdf, {
          startY: currentY,
          head: [[t('pdf.workDaysHeader'), t('pdf.datesHeader')]],
          body: [
            [t('pdf.workDays'), getFormattedDates(allWorkDates)],
          ],
          theme: 'striped',
          styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 2, overflow: 'linebreak' },
          headStyles: { fillColor: PRIMARY_COLOR, textColor: TEXT_COLOR_LIGHT, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
          columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: contentWidth - 60 } }, // Adjust col widths
          margin: { left: margin, right: margin },
          didDrawPage: (data) => { 
                addPageFooter();
                currentY = data.cursor?.y || currentY;
                if (data.pageNumber > pageNumber) pageNumber = data.pageNumber;
            }
        });
        currentY = (pdf as any).lastAutoTable.finalY + 10;
      }

    // --- Workdays Summary Table ---
    const summaryTitle = t('pdf.workdaysSummary.title');
    if (currentY + 50 > pdfHeight - margin -15 ) { // Estimate height for title + table
        addNewPageWithFooter();
    }
    pdf.setFont(BASE_FONT, 'bold');
    pdf.setFontSize(FONT_SECTION_HEADER);
    pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    pdf.text(summaryTitle, margin, currentY);
    currentY += FONT_SECTION_HEADER * 0.7 + 5;

    const workdaySummaryData: any[] = [];
    const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (const doctor of doctorsProfiles) {
        const doctorSummary: { [key: string]: string | number } = { doctorName: doctor.name };
        dayKeys.forEach(key => doctorSummary[key] = 0);
        doctorSummary['Total'] = 0;

        const workEntries = schedule.entries.filter(
            entry => entry.doctorId === doctor.id && (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')
        );

        for (const entry of workEntries) {
            const dayOfWeekKey = format(entry.date, 'EEE', { locale: enUS });
            if (dayKeys.includes(dayOfWeekKey)) {
                (doctorSummary[dayOfWeekKey] as number)++;
                (doctorSummary['Total'] as number)++;
            }
        }
        workdaySummaryData.push(doctorSummary);
    }

    const summaryTableBody = workdaySummaryData.map(summary => [
        summary.doctorName,
        summary.Mon, summary.Tue, summary.Wed, summary.Thu, summary.Fri, summary.Sat, summary.Sun,
        summary.Total,
    ]);

    autoTable(pdf, {
        startY: currentY,
        head: [[
            t('pdf.workdaysSummary.doctorHeader'),
            ...dayKeys.map(key => t(`pdf.workdaysSummary.${key.toLowerCase()}Header` as any)),
            t('pdf.workdaysSummary.totalHeader'),
        ]],
        body: summaryTableBody,
        theme: 'striped',
        styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 2 },
        headStyles: { fillColor: PRIMARY_COLOR, textColor: TEXT_COLOR_LIGHT, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => { 
            addPageFooter();
            currentY = data.cursor?.y || currentY; 
            if (data.pageNumber > pageNumber) pageNumber = data.pageNumber;
        }
    });
    currentY = (pdf as any).lastAutoTable.finalY + 10;

    // --- Monthly Workload Summary Table ---
    const monthlySummaryTitle = t('pdf.monthlyWorkloadSummary.title');
    if (currentY + 60 > pdfHeight - margin -15) { // Estimate height for title + table
        addNewPageWithFooter();
    }
    pdf.setFont(BASE_FONT, 'bold');
    pdf.setFontSize(FONT_SECTION_HEADER);
    pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    pdf.text(monthlySummaryTitle, margin, currentY);
    currentY += FONT_SECTION_HEADER * 0.7 + 5;

    const scheduleMonthsForPdf = eachMonthOfInterval({
      start: schedule.startDate,
      end: schedule.endDate,
    }).map(monthDate => startOfMonth(monthDate));

    const monthHeadersForPdf = scheduleMonthsForPdf.map(m => format(m, 'MMM yy', { locale: currentDateFnsLocale })); // Shorter month format
    const pdfMonthlyTableHead = [[
        t('pdf.monthlyWorkloadSummary.doctorHeader'),
        ...monthHeadersForPdf,
        t('pdf.monthlyWorkloadSummary.totalHeader')
    ]];

    const pdfMonthlyTableBody: (string | number)[][] = [];
    const pdfMonthlyTotalsRow: (string | number)[] = [t('pdf.monthlyWorkloadSummary.totalHeader')];
    const monthTotalsMap = new Map<string, number>();
    scheduleMonthsForPdf.forEach(m => monthTotalsMap.set(format(m, 'yyyy-MM'), 0));
    let grandTotalWorkdays = 0;

    for (const doctor of doctorsProfiles) {
        const doctorRow: (string | number)[] = [doctor.name];
        let doctorTotalAcrossMonths = 0;
        for (const monthDate of scheduleMonthsForPdf) {
            const monthKey = format(monthDate, 'yyyy-MM');
            let workdaysInMonthForDoctor = 0;
            schedule.entries.forEach(entry => {
                if (entry.doctorId === doctor.id && (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned') && isSameMonthDateFns(entry.date, monthDate)) {
                    workdaysInMonthForDoctor++;
                }
            });
            doctorRow.push(workdaysInMonthForDoctor);
            doctorTotalAcrossMonths += workdaysInMonthForDoctor;
            monthTotalsMap.set(monthKey, (monthTotalsMap.get(monthKey) || 0) + workdaysInMonthForDoctor);
        }
        doctorRow.push(doctorTotalAcrossMonths);
        grandTotalWorkdays += doctorTotalAcrossMonths;
        pdfMonthlyTableBody.push(doctorRow);
    }

    scheduleMonthsForPdf.forEach(monthDate => {
        const monthKey = format(monthDate, 'yyyy-MM');
        pdfMonthlyTotalsRow.push(monthTotalsMap.get(monthKey) || 0);
    });
    pdfMonthlyTotalsRow.push(grandTotalWorkdays);
    pdfMonthlyTableBody.push(pdfMonthlyTotalsRow);


    autoTable(pdf, {
        startY: currentY,
        head: pdfMonthlyTableHead,
        body: pdfMonthlyTableBody,
        theme: 'striped',
        styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 2 },
        headStyles: { fillColor: PRIMARY_COLOR, textColor: TEXT_COLOR_LIGHT, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => { 
            addPageFooter();
            currentY = data.cursor?.y || currentY; 
            if (data.pageNumber > pageNumber) pageNumber = data.pageNumber;
        }
    });
    currentY = (pdf as any).lastAutoTable.finalY + 10; 

    // Final footer for the last page
    addPageFooter();

    try {
      pdf.save('rotawise-report.pdf');
      toast({
        title: t('page.toast.pdfReportExported.title'),
        description: t('page.toast.pdfReportExported.description')
      });
    } catch (error) {
      console.error("Error saving PDF:", error);
      toast({
        title: t('page.toast.errorSavingPdf.title'),
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <header className="py-6 px-4 md:px-8 bg-card border-b shadow-sm">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center">
          <div className="flex items-center gap-3 mb-4 sm:mb-0">
            <ThemeIcon className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary">{t('header.title')}</h1>
              <p className="text-sm text-muted-foreground">{t('header.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-8 space-y-8">
        <DataInputForm
          key={dataInputFormKey}
          onSubmit={handleSubmitForm}
          isLoading={isLoading}
          initialValues={loadedFormValues || stableDefaultPageFormValues}
        />

        <div className="flex flex-col sm:flex-row flex-wrap gap-4 mt-6 mb-8 justify-center items-center">
          <Button onClick={handleSaveSchedule} variant="outline" disabled={!schedule || isLoading || isExportingPdf} className="w-full sm:w-auto">
            <Save className="mr-2 h-4 w-4" /> {t('page.saveSchedule')}
          </Button>
          <Label htmlFor="load-schedule-input" className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer w-full sm:w-auto flex items-center justify-center", (isLoading || isExportingPdf) && "opacity-50 cursor-not-allowed")}>
            <Upload className="mr-2 h-4 w-4" /> {t('page.loadSchedule')}
            <input id="load-schedule-input" type="file" accept=".json" className="hidden" onChange={(e) => handleFileUpload(e, 'as-is')} disabled={isLoading || isExportingPdf}/>
          </Label>
          <Label htmlFor="load-schedule-preassigned-input" className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer w-full sm:w-auto flex items-center justify-center", (isLoading || isExportingPdf) && "opacity-50 cursor-not-allowed")}>
            <Layers className="mr-2 h-4 w-4" /> {t('page.loadScheduleAsPreassigned')}
            <input id="load-schedule-preassigned-input" type="file" accept=".json" className="hidden" onChange={(e) => handleFileUpload(e, 'as-pre-assigned')} disabled={isLoading || isExportingPdf}/>
          </Label>
           <Button onClick={handleExportPdf} variant="outline" disabled={!schedule || isLoading || isExportingPdf} className="w-full sm:w-auto">
            <FileDown className="mr-2 h-4 w-4" />
            {isExportingPdf ? t('page.exportingPdf') : t('page.exportPdf')}
            {isExportingPdf && <span className="animate-spin ml-2 h-4 w-4 border-t-2 border-b-2 border-primary rounded-full"></span>}
          </Button>
        </div>

        {scheduleWarnings.length > 0 && (
          <Card className="mt-8 shadow-md border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2 text-lg md:text-xl">
                <AlertTriangle className="h-5 w-5 md:h-6 md:w-6" /> 
                {t('page.section.scheduleWarnings.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-destructive">
                {scheduleWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {schedule ? (
          <>
            <div>
              <ScheduleCalendarView
                  schedule={schedule}
                  doctors={doctorsProfiles}
                  onUpdateScheduleEntry={handleUpdateScheduleEntry}
                  minIntervalBetweenWorkDays={currentMinInterval}
                  allScheduleEntries={schedule.entries}
              />
            </div>
            <ScheduleSummaryTable schedule={schedule} doctors={doctorsProfiles} />
            <MonthlyWorkloadSummaryTable schedule={schedule} doctors={doctorsProfiles} />
          </>
        ) : (
          <Card className="mt-8 shadow-lg text-center">
            <CardHeader>
              <CardTitle>{t('page.noSchedule.title')}</CardTitle>
              <CardDescription>{t('page.noSchedule.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center p-6 min-h-[200px]">
                <Image
                    src="https://placehold.co/300x200.png"
                    alt="Calendar illustration"
                    width={300}
                    height={200}
                    className="rounded-md opacity-70"
                    data-ai-hint="calendar schedule planning"
                    priority
                />
            </CardContent>
          </Card>
        )}
      </main>
      <Toaster />
      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-12">
        {t('footer.copyright', { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}


    