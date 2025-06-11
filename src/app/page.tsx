"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Schedule, ScheduleFormValues, DoctorProfile, ScheduleEntry, PersistedScheduleData, SerializedDoctorFormFieldInput, DoctorFormFieldInput } from '@/lib/types';
import { type UseFormReturn } from 'react-hook-form';
import DataInputForm from '@/components/rotawise/data-input-form';
import ScheduleCalendarView from '@/components/rotawise/schedule-calendar-view';
import LanguageSelector from '@/components/rotawise/language-selector';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from "@/hooks/use-toast";
import { ThemeIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import Image from 'next/image';
import { Save, Upload, FileDown, Layers, AlertTriangle, Trash2, UserX } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import { format, startOfMonth, addMonths, isSameDay, differenceInCalendarDays, subDays, eachMonthOfInterval, isSameMonth as isSameMonthDateFns, eachDayOfInterval as eachDayOfIntervalFns, endOfMonth, isWithinInterval, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { useLanguage } from '@/context/language-context';
import { ThemeToggle } from '@/components/theme-toggle';
import ScheduleSummaryTable from '@/components/rotawise/schedule-summary-table';
import MonthlyWorkloadSummaryTable from '@/components/rotawise/MonthlyWorkloadSummaryTable';
import { generateSchedule, type ScheduleWarning } from '@/lib/schedule-generator';

type LoadMode = 'as-is' | 'as-pre-assigned';

const LOCAL_STORAGE_KEY = 'rotawiseAppState';
const FORM_INPUT_LOCAL_STORAGE_KEY = 'rotawiseFormInputState'; // New key for live form input

// Type for the data stored in FORM_INPUT_LOCAL_STORAGE_KEY
type SerializedLiveFormData = Omit<ScheduleFormValues, 'startDate' | 'endDate' | 'doctors'> & { 
  startDate?: string; 
  endDate?: string; 
  doctors: SerializedDoctorFormFieldInput[]; 
};

// Debounce hook
function useDebouncedCallback<A extends any[]>(
  callback: (...args: A) => void,
  wait: number
) {
  const argsRef = useRef<A>();
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  function cleanup() {
    if (timeout.current) {
      clearTimeout(timeout.current);
    }
  }

  useEffect(() => cleanup, []); // Cleanup on unmount

  return function debouncedCallback(...args: A) {
    argsRef.current = args;
    cleanup();
    timeout.current = setTimeout(() => {
      if (argsRef.current) {
        callback(...argsRef.current);
      }
    }, wait);
  };
}

export default function RotawisePage() {
  const { t, language, currentDateFnsLocale } = useLanguage();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [doctorsProfiles, setDoctorsProfiles] = useState<DoctorProfile[]>([]);
  const { toast } = useToast();
  const [isMounted, setIsMounted] = useState(false);
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);

  const [currentMinInterval, setCurrentMinInterval] = useState<number>(1);
  const [loadedFormValues, setLoadedFormValues] = useState<Partial<ScheduleFormValues> | null>(null);
  const [dataInputFormKey, setDataInputFormKey] = useState(0);
  const [numDoctorsInForm, setNumDoctorsInForm] = useState<number>(0);
  
  // Confirmation dialog states
  const [showClearScheduleDialog, setShowClearScheduleDialog] = useState(false);
  const [showClearDoctorDetailsDialog, setShowClearDoctorDetailsDialog] = useState(false);

  const formRef = useRef<UseFormReturn<ScheduleFormValues> | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load state from localStorage on initial mount
  useEffect(() => {
    if (!isMounted) return;

    // First, try to load the full schedule state (higher priority)
    let fullScheduleLoaded = false;
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
          setNumDoctorsInForm(finalFormValues.numberOfDoctors);
          setDataInputFormKey(prevKey => prevKey + 1); // Re-initialize form

          setScheduleWarnings(loadedData.scheduleWarnings || []);
          setCurrentMinInterval(loadedData.currentMinInterval || 1);

          // Sync the full schedule's form values to the form input localStorage
          try {
            const serializableFormData: SerializedLiveFormData = {
              ...finalFormValues,
              startDate: finalFormValues.startDate ? finalFormValues.startDate.toISOString() : undefined,
              endDate: finalFormValues.endDate ? finalFormValues.endDate.toISOString() : undefined,
              doctors: finalFormValues.doctors.map(doc => ({
                ...doc,
                vacationDates: (doc.vacationDates || []).map(d => d.toISOString()),
                preAssignedWorkDates: (doc.preAssignedWorkDates || []).map(d => d.toISOString()),
                excludedDates: (doc.excludedDates || []).map(d => d.toISOString()),
              })),
            };
            localStorage.setItem(FORM_INPUT_LOCAL_STORAGE_KEY, JSON.stringify(serializableFormData));
          } catch (syncError) {
            console.warn("Failed to sync full schedule form values to form input localStorage:", syncError);
          }

          fullScheduleLoaded = true;
          toast({
            title: t('page.toast.stateRestored.title'),
            description: t('page.toast.stateRestored.description'),
          });
        } else {
          localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear invalid/incomplete data
        }
      }
    } catch (error) {
      console.error("Failed to load full schedule state from localStorage:", error);
      toast({
        title: t('page.toast.errorRestoringState.title'),
        description: t('page.toast.errorRestoringState.description'),
        variant: "destructive",
      });
      localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear corrupted data
    }

    // If no full schedule was loaded, try to load form input state as fallback
    if (!fullScheduleLoaded) {
      try {
        const persistedFormInputString = localStorage.getItem(FORM_INPUT_LOCAL_STORAGE_KEY);
        if (persistedFormInputString) {
          const loadedFormInput = JSON.parse(persistedFormInputString) as SerializedLiveFormData; 
          
          // Attempt to deserialize and set form values
          const deserializedFormValues: Partial<ScheduleFormValues> = {
              numberOfDoctors: loadedFormInput.numberOfDoctors,
              startDate: loadedFormInput.startDate ? new Date(loadedFormInput.startDate) : undefined,
              endDate: loadedFormInput.endDate ? new Date(loadedFormInput.endDate) : undefined,
              minIntervalBetweenWorkDays: loadedFormInput.minIntervalBetweenWorkDays || 1,
              doctors: loadedFormInput.doctors.map((doc: SerializedDoctorFormFieldInput) => ({
                  id: doc.id || crypto.randomUUID(),
                  name: doc.name || '',
                  vacationDates: (doc.vacationDates || []).map((d: string) => new Date(d)),
                  preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d: string) => new Date(d)),
                  excludedDates: (doc.excludedDates || []).map((d: string) => new Date(d)),
                  isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
              }))
          };
          // Validate if the loaded data makes sense, e.g., has numberOfDoctors
          if (typeof deserializedFormValues.numberOfDoctors === 'number') {
              setLoadedFormValues(deserializedFormValues);
              setDataInputFormKey(prevKey => prevKey + 1);
              setNumDoctorsInForm(deserializedFormValues.numberOfDoctors);
          } else {
              console.warn("Loaded form input state was invalid, discarding.");
              localStorage.removeItem(FORM_INPUT_LOCAL_STORAGE_KEY);
          }
        }
      } catch (error) {
          console.error("Failed to load form input state from localStorage:", error);
          localStorage.removeItem(FORM_INPUT_LOCAL_STORAGE_KEY); // Clear corrupted data
      }
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

  const handleSaveParameters = (data: ScheduleFormValues) => {

    try {
      // Serialize form data (convert dates to ISO strings)
      const serializableFormData: Omit<ScheduleFormValues, 'startDate' | 'endDate' | 'doctors'> & { startDate?: string; endDate?: string; doctors: SerializedDoctorFormFieldInput[] } = {
        ...data,
        startDate: data.startDate ? data.startDate.toISOString() : undefined,
        endDate: data.endDate ? data.endDate.toISOString() : undefined,
        doctors: data.doctors.map(doc => ({
          ...doc,
          vacationDates: doc.vacationDates.map(d => d.toISOString()),
          preAssignedWorkDates: doc.preAssignedWorkDates.map(d => d.toISOString()),
          excludedDates: (doc.excludedDates || []).map(d => d.toISOString()),
        })),
      };

      const jsonString = JSON.stringify(serializableFormData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rotawise-parameters.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: t('page.toast.parametersSaved.title'),
        description: t('page.toast.parametersSaved.description'),
      });
    } catch (error) {
      console.error("Error saving parameters:", error);
      toast({
        title: t('page.toast.errorSavingParameters.title'),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const [stableDefaultPageFormValues] = useState<Partial<ScheduleFormValues>>(() => ({
    numberOfDoctors: 0,
    startDate: undefined,
    endDate: undefined,
    minIntervalBetweenWorkDays: 1,
    doctors: []
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

    // Call the client-side function
    // Get existing fixed entries if regenerating
    const existingFixedEntries = schedule?.entries.filter(entry => entry.isFixed) || [];
    const result = generateSchedule(data, existingFixedEntries);
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
        // Dates are already Date objects from generateSchedule
        startDate: result.schedule.startDate,
        endDate: result.schedule.endDate,
        minIntervalBetweenWorkDays: result.schedule.minIntervalBetweenWorkDays,
        entries: result.schedule.entries.map(entry => ({
          ...entry,
          // Ensure date is a Date object, though generateSchedule should already do this
          date: new Date(entry.date), 
          // Potentially re-format entry.dayOfWeek here if it was stored with enUS from generator
          // and needs to match currentLocaleFnsLocale for display consistency if not handled by calendar.
          // For now, assuming calendar or direct display handles formatting.
        })),
      };
      setSchedule(processedSchedule);
      toast({
        title: t('page.toast.scheduleGenerated.title'),
        description: t('page.toast.scheduleGenerated.description'),
      });

      if (result.warnings && result.warnings.length > 0) {
        const translatedWarnings = result.warnings.map((warning: ScheduleWarning) => {
          const params = { ...warning.params };
          if (params.date && params.date instanceof Date) {
            params.date = format(params.date, 'PPP', { locale: currentDateFnsLocale });
          }
          // Potentially format other params if needed
          return t(warning.key, params);
        });

        setScheduleWarnings(translatedWarnings); 
        
        translatedWarnings.forEach(warningMsg => {
          toast({ 
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

      let newEntries: ScheduleEntry[];

      if (updatedEntry.assignment === 'Off') {
        // When 'Off' is selected, updatedEntry.doctorId is 'system'.
        // Remove 'Work'/'Pre-assigned' for the day, keep 'Vacation', and add a 'system/Off'.
        newEntries = prevSchedule.entries.filter(e => {
          if (isSameDay(e.date, updatedEntry.date)) {
            // Keep if it's a Vacation entry.
            // Remove if it's Work, Pre-assigned, or an existing system/Off.
            return e.assignment === 'Vacation';
          }
          return true; // Keep entries for other dates.
        });

        // Add the new system 'Off' entry.
        // Ensure no duplicate system 'Off' if one was somehow kept by filter (unlikely with above logic but safe).
        if (!newEntries.some(e => isSameDay(e.date, updatedEntry.date) && e.doctorId === 'system' && e.assignment === 'Off')) {
            newEntries.push(updatedEntry); // updatedEntry is { date, doctorId: 'system', assignment: 'Off', dayOfWeek }
        }

      } else { // For 'Work', 'Pre-assigned', 'Vacation' for a specific doctor (updatedEntry.doctorId is a real ID)
        newEntries = prevSchedule.entries.filter(e => {
          if (isSameDay(e.date, updatedEntry.date)) {
            // Rule 1: Remove any existing entry for the *same doctor* (it will be replaced by updatedEntry).
            if (e.doctorId === updatedEntry.doctorId) return false;
            
            // Rule 2: If the new assignment is Work/Pre-assigned, additional cleanup is needed for the day:
            if (updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned') {
              // Remove any *other doctor's* Work/Pre-assigned entry (conflict).
              if (e.assignment === 'Work' || e.assignment === 'Pre-assigned') return false;
              // Remove any 'system/Off' entry (specific assignment overrides it).
              if (e.doctorId === 'system' && e.assignment === 'Off') return false;
            }
            // Keep other entries (e.g., another doctor's vacation on the same day).
            return true;
          }
          return true; // Keep all entries for other dates.
        });
        newEntries.push(updatedEntry);
      }

      // Min interval validation for the updated/added entry if it's a work assignment
      const doctorProfile = doctorsProfiles.find(dp => dp.id === updatedEntry.doctorId);
      const effectiveMinInterval = prevSchedule.minIntervalBetweenWorkDays ?? currentMinInterval;

      if (doctorProfile && (updatedEntry.assignment === 'Work' || updatedEntry.assignment === 'Pre-assigned')) {
        const workOrPreassignedEntriesForValidation = newEntries.filter(
          e => e.doctorId === updatedEntry.doctorId && 
               (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && 
               !isSameDay(e.date, updatedEntry.date) // Exclude the entry being currently processed
        );
        
        const closestWorkDayBefore = workOrPreassignedEntriesForValidation
          .filter(e => e.date < updatedEntry.date)
          .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

        const closestWorkDayAfter = workOrPreassignedEntriesForValidation
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
            // Potentially revert or prevent the change if it's a hard rule, 
            // or just warn like it does now. Current logic only warns.
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
            // Potentially revert or prevent.
          }
        }
      }
      
      // Vacation/Excluded day validation for 'Work' assignments
      if (doctorProfile && updatedEntry.assignment === 'Work') {
        const isVacation = doctorProfile.vacationDates.some(vd =>
          isSameDay(vd, updatedEntry.date)
        );
        if (isVacation) {
          toast({
            title: t('page.toast.scheduleWarning.title'),
            description: t('page.toast.scheduleWarning.description', { doctorName: doctorProfile.name }), // This message seems generic, might need "on vacation" specific message
            variant: "destructive",
          });
        }
        const isExcluded = (doctorProfile.excludedDates || []).some(ed =>
          isSameDay(ed, updatedEntry.date)
        );
        if (isExcluded) {
          toast({
            title: t('page.toast.scheduleWarning.title'), // Consider a more specific title
            description: t('page.toast.excludedDayWarning.description', { doctorName: doctorProfile.name }),
            variant: "destructive",
          });
        }
      }
      
      // Sort entries by date and then doctorId for consistent order
      newEntries.sort((a,b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        return a.doctorId.localeCompare(b.doctorId);
      });

      return { ...prevSchedule, entries: newEntries };
    });
  };

  const handleSaveSchedule = () => {
    const noScheduleData = !schedule;
    // Check loadedFormValues for parameters if no schedule exists.
    // Allow saving even with 0 doctors, but check if dates are provided
    const noFormData = !loadedFormValues || (!loadedFormValues.startDate && !loadedFormValues.endDate);

    if (noScheduleData && noFormData) {
      toast({
        title: t('page.toast.nothingToSave.title'),
        description: t('page.toast.nothingToSave.description'),
        variant: "destructive"
      });
      return;
    }

    if (!noScheduleData && schedule) { // If schedule exists, save full PersistedScheduleData
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
        // Form values at the time of schedule generation are already part of PersistedScheduleData if loaded from an older file
        // or can be sourced from doctorsProfiles and schedule if not directly available in loadedData.formValues
        // For a fresh save, it should reflect the state that generated this schedule.
        // The existing structure for PersistedScheduleData.formValues seems to derive it appropriately.
      formValues: {
            numberOfDoctors: doctorsProfiles.length, // Assuming doctorsProfiles is up-to-date
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        minIntervalBetweenWorkDays: schedule.minIntervalBetweenWorkDays || currentMinInterval,
            doctors: doctorsProfiles.map(p => ({ // Use doctorsProfiles as the source of truth for form values when schedule exists
          id: p.id,
          name: p.name,
          vacationDates: p.vacationDates.map(d => d.toISOString()),
          preAssignedWorkDates: p.preAssignedWorkDates.map(d => d.toISOString()),
          excludedDates: (p.excludedDates || []).map(d => d.toISOString()),
          isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
        }))
        },
        scheduleWarnings: scheduleWarnings, // Save current warnings with the schedule
        currentMinInterval: currentMinInterval, // Save current interval
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
    } else if (noScheduleData && !noFormData && loadedFormValues) { // No schedule, but form data exists
        try {
            const dataToSave: SerializedLiveFormData = {
              numberOfDoctors: loadedFormValues.numberOfDoctors || 1,
              startDate: loadedFormValues.startDate ? loadedFormValues.startDate.toISOString() : undefined,
              endDate: loadedFormValues.endDate ? loadedFormValues.endDate.toISOString() : undefined,
              minIntervalBetweenWorkDays: loadedFormValues.minIntervalBetweenWorkDays || 1,
              doctors: (loadedFormValues.doctors || []).map(doc => ({
                id: doc.id || crypto.randomUUID(),
                name: doc.name || '',
                vacationDates: (doc.vacationDates || []).map(d => d instanceof Date ? d.toISOString() : d), // Handle if dates are already strings or Date objects
                preAssignedWorkDates: (doc.preAssignedWorkDates || []).map(d => d instanceof Date ? d.toISOString() : d),
                excludedDates: (doc.excludedDates || []).map(d => d instanceof Date ? d.toISOString() : d),
                isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
              })),
            };

            const jsonString = JSON.stringify(dataToSave, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'rotawise-parameters.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast({
                title: t('page.toast.parametersSaved.title'),
                description: t('page.toast.parametersSaved.description'),
            });
        } catch (error) {
            console.error("Error saving parameters only:", error);
            toast({
                title: t('page.toast.errorSavingParameters.title'), // You might need this key if it was removed
                description: error instanceof Error ? error.message : String(error),
                variant: "destructive",
            });
        }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, mode: LoadMode) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Clear main schedule localStorage; form input persistence will be updated by new content.
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.warn("Could not clear main schedule localStorage before file upload:", error);
    }

    // Reset relevant states before loading new data
    setSchedule(null);
    setScheduleWarnings([]);
    setDoctorsProfiles([]);
    // loadedFormValues will be set by the loaded file content or cleared if error.
    // dataInputFormKey will be updated to re-render the form.
    
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          throw new Error("Failed to read file content.");
        }
        const loadedRawData = JSON.parse(text); // Parse first, then check structure

        // Check if it's a full PersistedScheduleData (has 'schedule' and 'formValues')
        if (loadedRawData && typeof loadedRawData === 'object' && 'schedule' in loadedRawData && 'formValues' in loadedRawData) {
          const loadedData = loadedRawData as PersistedScheduleData;

          // Basic validation for full schedule data
          if (!loadedData.doctorsProfiles) { // doctorsProfiles is also essential
            throw new Error("Invalid schedule file format. Missing doctorsProfiles data.");
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
              id: doc.id || crypto.randomUUID(),
              name: doc.name || '',
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
          setScheduleWarnings(loadedData.scheduleWarnings || []); // Load warnings from schedule file

          // Synchronize FORM_INPUT_LOCAL_STORAGE_KEY with the loaded form values
          try {
            const serializableFormData: SerializedLiveFormData = {
              ...finalFormValues,
              startDate: finalFormValues.startDate ? finalFormValues.startDate.toISOString() : undefined,
              endDate: finalFormValues.endDate ? finalFormValues.endDate.toISOString() : undefined,
              doctors: finalFormValues.doctors.map(doc => ({
                ...doc,
                id: doc.id || crypto.randomUUID(),
                vacationDates: (doc.vacationDates || []).map(d => d.toISOString()),
                preAssignedWorkDates: (doc.preAssignedWorkDates || []).map(d => d.toISOString()),
                excludedDates: (doc.excludedDates || []).map(d => d.toISOString()),
              })),
            };
            localStorage.setItem(FORM_INPUT_LOCAL_STORAGE_KEY, JSON.stringify(serializableFormData));
          } catch (lsError) {
            console.error("Failed to save loaded schedule's form values to form input localStorage:", lsError);
          }

        toast({
          title: t('page.toast.scheduleLoaded.title'),
          description: mode === 'as-pre-assigned'
            ? t('page.toast.scheduleLoadedAsPreassigned.description')
            : t('page.toast.scheduleLoaded.description')
        });

        // Check if it's a parameters-only file (SerializedLiveFormData structure)
        } else if (loadedRawData && typeof loadedRawData === 'object' && 'doctors' in loadedRawData && 'numberOfDoctors' in loadedRawData && !('schedule' in loadedRawData)) {
          const loadedParams = loadedRawData as SerializedLiveFormData;
          // console.log("[RotawisePage] Loaded Parameters File (raw loadedParams):", JSON.parse(JSON.stringify(loadedParams)));

          // Deserialize parameters
          const deserializedFormValues: Partial<ScheduleFormValues> = {
            numberOfDoctors: loadedParams.numberOfDoctors,
            startDate: loadedParams.startDate ? new Date(loadedParams.startDate) : undefined,
            endDate: loadedParams.endDate ? new Date(loadedParams.endDate) : undefined,
            minIntervalBetweenWorkDays: loadedParams.minIntervalBetweenWorkDays || 1,
            doctors: loadedParams.doctors.map((doc: SerializedDoctorFormFieldInput) => ({
                id: doc.id || crypto.randomUUID(),
                name: doc.name || '',
                vacationDates: (doc.vacationDates || []).map((d: string) => new Date(d)),
                preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d: string) => new Date(d)),
                excludedDates: (doc.excludedDates || []).map((d: string) => new Date(d)),
                isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
            }))
          };
          // console.log("[RotawisePage] Deserialized Form Values (for parameters-only file):", JSON.parse(JSON.stringify(deserializedFormValues)));

          // Validate if the loaded data makes sense
          if (typeof deserializedFormValues.numberOfDoctors !== 'number' || !Array.isArray(deserializedFormValues.doctors)) {
              throw new Error(t('page.toast.errorLoadingParameters.title') + ": Invalid parameters file format.");
          }

          setSchedule(null); // Clear any existing schedule
          setScheduleWarnings([]); // Clear any warnings
          
          const newDoctorProfiles: DoctorProfile[] = (deserializedFormValues.doctors || []).map(doc => ({
            id: doc.id!, // id is guaranteed by deserialization logic or crypto.randomUUID()
            name: doc.name!,
            vacationDates: doc.vacationDates || [],
            preAssignedWorkDates: doc.preAssignedWorkDates || [],
            excludedDates: doc.excludedDates || [],
            isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
          }));
          setDoctorsProfiles(newDoctorProfiles);
          
          setCurrentMinInterval(deserializedFormValues.minIntervalBetweenWorkDays || 1);
          setLoadedFormValues(deserializedFormValues);
          setDataInputFormKey(prevKey => prevKey + 1);

          // Save loaded parameters to FORM_INPUT_LOCAL_STORAGE_KEY for persistence
          try {
            // loadedParams is already in SerializedLiveFormData format
            localStorage.setItem(FORM_INPUT_LOCAL_STORAGE_KEY, JSON.stringify(loadedParams));
          } catch (lsError) {
            console.error("Failed to save loaded parameters to form input localStorage:", lsError);
          }

          toast({
            title: t('page.toast.parametersLoaded.title'),
            description: t('page.toast.parametersLoaded.description'),
          });

        } else {
          // Unrecognized file format
          throw new Error("Invalid file format. Unrecognized structure.");
        }

      } catch (err) {
        console.error("Error loading file:", err);
        // Distinguish error source if possible, default to general loading error
        const isParametersError = (err as Error).message.includes(t('page.toast.errorLoadingParameters.title'));
        toast({
          title: isParametersError ? t('page.toast.errorLoadingParameters.title') : t('page.toast.errorLoading.title'),
          description: (err as Error).message,
          variant: "destructive"
        });
        // Clear form values if loading failed to avoid inconsistent state
        setLoadedFormValues(null); 
        setDataInputFormKey(prevKey => prevKey + 1);
        localStorage.removeItem(FORM_INPUT_LOCAL_STORAGE_KEY); // Also clear persisted form input
      } finally {
        setIsLoading(false);
        if (event.target) {
          event.target.value = ""; // Reset file input
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
                    // Add spacing to center the doctor name vertically while keeping day number at top
                    cellContent += `\n\n${doctorNameOnDay}`;
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
                    fontSize: FONT_BODY - 1, // Slightly smaller for calendar cells
                    cellPadding: { top: 1, right: 1, bottom: 1, left: 1 },
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
            ? dates.map(d => format(d, 'PPP', { locale: currentDateFnsLocale })).join(', ') 
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

  const handleExportWord = async () => {
    if (!schedule || !doctorsProfiles.length) {
      toast({
        title: t('page.toast.noScheduleToExport.title'),
        description: t('page.toast.noScheduleToExport.description'),
        variant: "destructive"
      });
      return;
    }
    setIsExportingWord(true);

    try {
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

      const children = [];

      // Document title
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: t('pdf.reportTitle'),
              bold: true,
              size: 28,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
        })
      );

      // Schedule period
      const schedulePeriodText = t('pdf.schedulePeriod', {
        startDate: format(schedule.startDate, 'PPP', { locale: currentDateFnsLocale }),
        endDate: format(schedule.endDate, 'PPP', { locale: currentDateFnsLocale })
      });
      children.push(
        new Paragraph({
          children: [new TextRun({ text: schedulePeriodText, size: 20 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        })
      );

      // Min interval info
      const intervalToDisplay = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
      const minIntervalText = t('pdf.minIntervalInfo', { interval: intervalToDisplay });
      children.push(
        new Paragraph({
          children: [new TextRun({ text: minIntervalText, size: 20 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
        })
      );

      // Schedule warnings section
      if (scheduleWarnings.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: t('pdf.warningsTitle'),
                bold: true,
                size: 24,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
          })
        );

        scheduleWarnings.forEach(warning => {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `• ${warning}`, size: 18 })],
              spacing: { after: 60 },
            })
          );
        });
      }

      // Monthly calendar grids
      for (const monthStartDate of allMonthsToExport) {
        const monthTitle = format(monthStartDate, 'MMMM yyyy', { locale: currentDateFnsLocale });
        
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: monthTitle,
                bold: true,
                size: 24,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 480, after: 240 },
          })
        );

        const firstDayOfCurrentMonth = monthStartDate;
        const lastDayOfCurrentMonth = endOfMonth(firstDayOfCurrentMonth);
        const calGridStartDate = startOfWeek(firstDayOfCurrentMonth, { locale: currentDateFnsLocale });
        const calGridEndDate = endOfWeek(lastDayOfCurrentMonth, { locale: currentDateFnsLocale });

        // Create weekday headers
        const weekDayHeaders: string[] = [];
        for (let i = 0; i < 7; i++) {
          const dayInWeek = addDays(calGridStartDate, i);
          const dayKey = format(dayInWeek, 'EEE', { locale: enUS }).toLowerCase();
          weekDayHeaders.push(t(`pdf.workdaysSummary.${dayKey}Header` as any));
        }

        // Build calendar grid data
        const monthMatrixBody: string[][] = [];
        let currentWeekRow: string[] = [];
        let dayIterator = new Date(calGridStartDate);
        
        while (dayIterator <= calGridEndDate) {
          let cellContent = "";
          if (isSameMonthDateFns(dayIterator, firstDayOfCurrentMonth) && 
              isWithinInterval(dayIterator, { start: schedule.startDate, end: schedule.endDate })) {
            const dayNumber = format(dayIterator, 'd');
            const doctorNameOnDay = getDoctorForDay(dayIterator);
            cellContent = dayNumber;
            if (doctorNameOnDay) {
              cellContent += `\n${doctorNameOnDay}`;
            }
          } else if (isSameMonthDateFns(dayIterator, firstDayOfCurrentMonth)) {
            cellContent = format(dayIterator, 'd');
          }
          currentWeekRow.push(cellContent);

          if (currentWeekRow.length === 7 || isSameDay(dayIterator, calGridEndDate)) {
            monthMatrixBody.push([...currentWeekRow]);
            currentWeekRow = [];
          }
          dayIterator = addDays(dayIterator, 1);
        }

        // Create table
        const tableRows = [
          new TableRow({
            children: weekDayHeaders.map(header => 
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: header, bold: true, size: 18 })],
                  alignment: AlignmentType.CENTER,
                })],
                width: { size: 14.28, type: WidthType.PERCENTAGE },
              })
            ),
          }),
          ...monthMatrixBody.map(row => 
            new TableRow({
              children: row.map(cellContent => 
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: cellContent, size: 16 })],
                    alignment: AlignmentType.LEFT,
                  })],
                  width: { size: 14.28, type: WidthType.PERCENTAGE },
                })
              ),
            })
          ),
        ];

        children.push(
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1 },
              bottom: { style: BorderStyle.SINGLE, size: 1 },
              left: { style: BorderStyle.SINGLE, size: 1 },
              right: { style: BorderStyle.SINGLE, size: 1 },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
              insideVertical: { style: BorderStyle.SINGLE, size: 1 },
            },
          })
        );
             }

       // Doctor Details Section
       for (const doctor of doctorsProfiles) {
         children.push(
           new Paragraph({
             children: [
               new TextRun({
                 text: t('pdf.doctorDetailsTitle', { doctorName: doctor.name }),
                 bold: true,
                 size: 24,
               }),
             ],
             heading: HeadingLevel.HEADING_2,
             spacing: { before: 480, after: 240 },
           })
         );

         if (doctor.isExcludedFromAutomaticAssignment) {
           children.push(
             new Paragraph({
               children: [
                 new TextRun({
                   text: t('pdf.doctorIsExcludedFromAuto'),
                   italics: true,
                   size: 16,
                 }),
               ],
               spacing: { after: 120 },
             })
           );
         }

         const getFormattedDates = (dates: Date[]) => dates.length > 0 
           ? dates.map(d => format(d, 'PPP', { locale: currentDateFnsLocale })).join(', ') 
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

         const doctorDetailsRows = [
           new TableRow({
             children: [
               new TableCell({
                 children: [new Paragraph({
                   children: [new TextRun({ text: t('pdf.workDaysHeader'), bold: true, size: 18 })],
                   alignment: AlignmentType.CENTER,
                 })],
                 width: { size: 25, type: WidthType.PERCENTAGE },
               }),
               new TableCell({
                 children: [new Paragraph({
                   children: [new TextRun({ text: t('pdf.datesHeader'), bold: true, size: 18 })],
                   alignment: AlignmentType.CENTER,
                 })],
                 width: { size: 75, type: WidthType.PERCENTAGE },
               }),
             ],
           }),
           new TableRow({
             children: [
               new TableCell({
                 children: [new Paragraph({
                   children: [new TextRun({ text: t('pdf.workDays'), size: 16 })],
                 })],
               }),
               new TableCell({
                 children: [new Paragraph({
                   children: [new TextRun({ text: getFormattedDates(allWorkDates), size: 16 })],
                 })],
               }),
             ],
           }),
         ];

         children.push(
           new Table({
             rows: doctorDetailsRows,
             width: { size: 100, type: WidthType.PERCENTAGE },
             borders: {
               top: { style: BorderStyle.SINGLE, size: 1 },
               bottom: { style: BorderStyle.SINGLE, size: 1 },
               left: { style: BorderStyle.SINGLE, size: 1 },
               right: { style: BorderStyle.SINGLE, size: 1 },
               insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
               insideVertical: { style: BorderStyle.SINGLE, size: 1 },
             },
           })
         );
       }

       // Workdays summary table
       children.push(
         new Paragraph({
           children: [
             new TextRun({
               text: t('pdf.workdaysSummary.title'),
               bold: true,
               size: 24,
             }),
           ],
           heading: HeadingLevel.HEADING_2,
           spacing: { before: 480, after: 240 },
         })
       );

      const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const workdaySummaryData: any[] = [];

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

      const summaryTableRows = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: t('pdf.workdaysSummary.doctorHeader'), bold: true, size: 18 })],
                alignment: AlignmentType.CENTER,
              })],
            }),
            ...dayKeys.map(key => 
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: t(`pdf.workdaysSummary.${key.toLowerCase()}Header` as any), bold: true, size: 18 })],
                  alignment: AlignmentType.CENTER,
                })],
              })
            ),
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: t('pdf.workdaysSummary.totalHeader'), bold: true, size: 18 })],
                alignment: AlignmentType.CENTER,
              })],
            }),
          ],
        }),
        ...workdaySummaryData.map(summary => 
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: summary.doctorName, size: 16 })],
                })],
              }),
              ...dayKeys.map(key => 
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: summary[key].toString(), size: 16 })],
                    alignment: AlignmentType.CENTER,
                  })],
                })
              ),
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: summary.Total.toString(), size: 16 })],
                  alignment: AlignmentType.CENTER,
                })],
              }),
            ],
          })
        ),
      ];

             children.push(
         new Table({
           rows: summaryTableRows,
           width: { size: 100, type: WidthType.PERCENTAGE },
           borders: {
             top: { style: BorderStyle.SINGLE, size: 1 },
             bottom: { style: BorderStyle.SINGLE, size: 1 },
             left: { style: BorderStyle.SINGLE, size: 1 },
             right: { style: BorderStyle.SINGLE, size: 1 },
             insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
             insideVertical: { style: BorderStyle.SINGLE, size: 1 },
           },
         })
       );

       // Monthly Workload Summary Table
       children.push(
         new Paragraph({
           children: [
             new TextRun({
               text: t('pdf.monthlyWorkloadSummary.title'),
               bold: true,
               size: 24,
             }),
           ],
           heading: HeadingLevel.HEADING_2,
           spacing: { before: 480, after: 240 },
         })
       );

       const scheduleMonthsForWord = eachMonthOfInterval({
         start: schedule.startDate,
         end: schedule.endDate,
       }).map(monthDate => startOfMonth(monthDate));

       const monthHeadersForWord = scheduleMonthsForWord.map(m => format(m, 'MMM yy', { locale: currentDateFnsLocale }));
       const wordMonthlyTableBody: any[] = [];
       const wordMonthlyTotalsRow: any[] = [t('pdf.monthlyWorkloadSummary.totalHeader')];
       const monthTotalsMap = new Map<string, number>();
       scheduleMonthsForWord.forEach(m => monthTotalsMap.set(format(m, 'yyyy-MM'), 0));
       let grandTotalWorkdays = 0;

       for (const doctor of doctorsProfiles) {
         const doctorRow: any[] = [doctor.name];
         let doctorTotalAcrossMonths = 0;
         for (const monthDate of scheduleMonthsForWord) {
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
         wordMonthlyTableBody.push(doctorRow);
       }

       scheduleMonthsForWord.forEach(monthDate => {
         const monthKey = format(monthDate, 'yyyy-MM');
         wordMonthlyTotalsRow.push(monthTotalsMap.get(monthKey) || 0);
       });
       wordMonthlyTotalsRow.push(grandTotalWorkdays);
       wordMonthlyTableBody.push(wordMonthlyTotalsRow);

       const monthlyTableRows = [
         new TableRow({
           children: [
             new TableCell({
               children: [new Paragraph({
                 children: [new TextRun({ text: t('pdf.monthlyWorkloadSummary.doctorHeader'), bold: true, size: 18 })],
                 alignment: AlignmentType.CENTER,
               })],
             }),
             ...monthHeadersForWord.map(month => 
               new TableCell({
                 children: [new Paragraph({
                   children: [new TextRun({ text: month, bold: true, size: 18 })],
                   alignment: AlignmentType.CENTER,
                 })],
               })
             ),
             new TableCell({
               children: [new Paragraph({
                 children: [new TextRun({ text: t('pdf.monthlyWorkloadSummary.totalHeader'), bold: true, size: 18 })],
                 alignment: AlignmentType.CENTER,
               })],
             }),
           ],
         }),
         ...wordMonthlyTableBody.map(row => 
           new TableRow({
             children: row.map((cell: any, index: number) => 
               new TableCell({
                 children: [new Paragraph({
                   children: [new TextRun({ text: cell.toString(), size: 16 })],
                   alignment: index === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
                 })],
               })
             ),
           })
         ),
       ];

       children.push(
         new Table({
           rows: monthlyTableRows,
           width: { size: 100, type: WidthType.PERCENTAGE },
           borders: {
             top: { style: BorderStyle.SINGLE, size: 1 },
             bottom: { style: BorderStyle.SINGLE, size: 1 },
             left: { style: BorderStyle.SINGLE, size: 1 },
             right: { style: BorderStyle.SINGLE, size: 1 },
             insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
             insideVertical: { style: BorderStyle.SINGLE, size: 1 },
           },
         })
       );

       // Footer
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: t('pdf.generatedOn', { date: format(new Date(), 'PPP p', { locale: currentDateFnsLocale }) }),
              size: 16,
              italics: true,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 480 },
        })
      );

      // Create document
      const doc = new Document({
        sections: [{
          children: children,
        }],
      });

      // Generate and download
      const buffer = await Packer.toBuffer(doc);
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${t('pdf.reportTitle')}_${format(new Date(), 'yyyy-MM-dd')}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Error exporting Word document:", error);
      toast({
        title: t('page.toast.errorSavingWord.title'),
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleClearSchedule = () => {
    setSchedule(null);
    // setDoctorsProfiles([]); // Keep doctor profiles (form parameters)
    setScheduleWarnings([]);
    // setLoadedFormValues(stableDefaultPageFormValues); // Do not reset the form to default
    // setDataInputFormKey(prevKey => prevKey + 1); // Do not force re-initialization of the form
    localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear the generated schedule's persisted state
    // localStorage.removeItem(FORM_INPUT_LOCAL_STORAGE_KEY); // Do NOT clear live form input

    toast({
      title: t('page.toast.scheduleCleared.title'),
      description: t('page.toast.scheduleCleared.description'),
    });
  };

  const handleClearScheduleConfirm = () => {
    handleClearSchedule();
    setShowClearScheduleDialog(false);
  };

  const handleClearDoctorDetails = () => {
    if (formRef.current) {
      const currentValues = formRef.current.getValues();
      const newValues: ScheduleFormValues = {
        ...currentValues,
        numberOfDoctors: 0,
        doctors: [],
      };
      formRef.current.reset(newValues);
      debouncedSaveFormInput(newValues);
      setNumDoctorsInForm(0);

      toast({
        title: t('page.toast.clearedDoctorItems.title'),
        description: t('page.toast.clearedDoctorItems.description'),
      });
    }
  };

  const handleClearDoctorDetailsConfirm = () => {
    handleClearDoctorDetails();
    setShowClearDoctorDetailsDialog(false);
  };

  const debouncedSaveFormInput = useDebouncedCallback(
    (data: ScheduleFormValues) => {
      try {
        const serializableFormData: SerializedLiveFormData = {
          ...data,
          startDate: data.startDate ? data.startDate.toISOString() : undefined,
          endDate: data.endDate ? data.endDate.toISOString() : undefined,
          doctors: data.doctors.map(doc => ({
            ...doc,
            id: doc.id || crypto.randomUUID(), // ensure id is present
            vacationDates: (doc.vacationDates || []).map(d => d.toISOString()),
            preAssignedWorkDates: (doc.preAssignedWorkDates || []).map(d => d.toISOString()),
            excludedDates: (doc.excludedDates || []).map(d => d.toISOString()),
          })),
        };
        localStorage.setItem(FORM_INPUT_LOCAL_STORAGE_KEY, JSON.stringify(serializableFormData));
      } catch (error) {
        console.error("Failed to save form input state to localStorage:", error);
        // Optionally, show a muted toast or log this error
      }
    },
    500 // Debounce wait time in milliseconds
  );

  const handleLiveFormValuesChange = (values: ScheduleFormValues) => {
    if (typeof values.numberOfDoctors === 'number') {
      setNumDoctorsInForm(values.numberOfDoctors);
    }
    // The `values` object should now have the correct shape due to Zod schema defaults.
    setLoadedFormValues(values);
    debouncedSaveFormInput(values);
  };

  const handleToggleMonthFixed = (month: Date, isFixed: boolean) => {
    setSchedule(prevSchedule => {
      if (!prevSchedule) return null;

      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      const updatedEntries = prevSchedule.entries.map(entry => {
        const entryDate = new Date(entry.date);
        if (entryDate >= monthStart && entryDate <= monthEnd && 
            (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')) {
          return { ...entry, isFixed };
        }
        return entry;
      });

      toast({
        title: isFixed ? t('page.toast.monthFixed.title') : t('page.toast.monthUnfixed.title'),
        description: isFixed 
          ? t('page.toast.monthFixed.description', { month: format(month, 'MMMM yyyy', { locale: currentDateFnsLocale }) })
          : t('page.toast.monthUnfixed.description', { month: format(month, 'MMMM yyyy', { locale: currentDateFnsLocale }) }),
      });

      return { ...prevSchedule, entries: updatedEntries };
    });
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
          ref={formRef}
          onSubmit={handleSubmitForm}
          isLoading={isLoading}
          initialValues={loadedFormValues || stableDefaultPageFormValues}
          onValuesChange={handleLiveFormValuesChange}
        />

        <div className="flex flex-col sm:flex-row flex-wrap gap-4 mt-6 mb-8 justify-center items-center">
          <Button 
            onClick={handleSaveSchedule} 
            variant="outline" 
            disabled={
              (!schedule && (!loadedFormValues || !loadedFormValues.doctors || loadedFormValues.doctors.length === 0 || loadedFormValues.doctors.every(doc => !doc.name))) || 
              isLoading || 
              isExportingPdf || 
              isExportingWord
            }
            className="w-full sm:w-auto"
          >
            <Save className="mr-2 h-4 w-4" /> {t('page.saveData')}
          </Button>
          <Label htmlFor="load-schedule-input" className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer w-full sm:w-auto flex items-center justify-center", (isLoading || isExportingPdf || isExportingWord) && "opacity-50 cursor-not-allowed")}>
            <Upload className="mr-2 h-4 w-4" /> {t('page.loadData')}
            <input id="load-schedule-input" type="file" accept=".json" className="hidden" onChange={(e) => handleFileUpload(e, 'as-is')} disabled={isLoading || isExportingPdf || isExportingWord}/>
          </Label>
          <Label htmlFor="load-schedule-preassigned-input" className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer w-full sm:w-auto flex items-center justify-center", (isLoading || isExportingPdf || isExportingWord) && "opacity-50 cursor-not-allowed")}>
            <Layers className="mr-2 h-4 w-4" /> {t('page.loadScheduleAsPreassigned')}
            <input id="load-schedule-preassigned-input" type="file" accept=".json" className="hidden" onChange={(e) => handleFileUpload(e, 'as-pre-assigned')} disabled={isLoading || isExportingPdf || isExportingWord}/>
          </Label>
           <Button onClick={handleExportPdf} variant="outline" disabled={!schedule || isLoading || isExportingPdf || isExportingWord} className="w-full sm:w-auto">
            <FileDown className="mr-2 h-4 w-4" />
            {isExportingPdf ? t('page.exportingPdf') : t('page.exportPdf')}
            {isExportingPdf && <span className="animate-spin ml-2 h-4 w-4 border-t-2 border-b-2 border-primary rounded-full"></span>}
          </Button>
          <Button onClick={handleExportWord} variant="outline" disabled={!schedule || isLoading || isExportingPdf || isExportingWord} className="w-full sm:w-auto">
            <FileDown className="mr-2 h-4 w-4" />
            {isExportingWord ? t('page.exportingWord') : t('page.exportWord')}
            {isExportingWord && <span className="animate-spin ml-2 h-4 w-4 border-t-2 border-b-2 border-primary rounded-full"></span>}
          </Button>
          <Button onClick={() => setShowClearScheduleDialog(true)} variant="destructive" disabled={!schedule || isLoading || isExportingPdf || isExportingWord} className="w-full sm:w-auto">
            <Trash2 className="mr-2 h-4 w-4" /> {t('page.clearSchedule')}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowClearDoctorDetailsDialog(true)} 
            disabled={
              !loadedFormValues || 
              !loadedFormValues.doctors || 
              loadedFormValues.doctors.length === 0 || 
              loadedFormValues.doctors.every(doc => !doc.name?.trim()) ||
              isLoading || 
              isExportingPdf || 
              isExportingWord
            }
            className="w-full sm:w-auto"
          >
            <UserX className="mr-2 h-4 w-4" />
            {t('page.clearDoctorDetails.button')}
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

        {schedule && (
          <>
            <div>
              <ScheduleCalendarView
                  schedule={schedule}
                  doctors={doctorsProfiles}
                  onUpdateScheduleEntry={handleUpdateScheduleEntry}
                  minIntervalBetweenWorkDays={currentMinInterval}
                  allScheduleEntries={schedule.entries}
                  onToggleMonthFixed={handleToggleMonthFixed}
              />
            </div>
            <ScheduleSummaryTable schedule={schedule} doctors={doctorsProfiles} />
            <MonthlyWorkloadSummaryTable schedule={schedule} doctors={doctorsProfiles} />
          </>
        )}
      </main>
      <Toaster />
      
      {/* Clear Schedule Confirmation Dialog */}
      <AlertDialog open={showClearScheduleDialog} onOpenChange={setShowClearScheduleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.confirmClearSchedule.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('page.confirmClearSchedule.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowClearScheduleDialog(false)}>
              {t('page.confirmClearSchedule.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleClearScheduleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('page.confirmClearSchedule.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Doctor Details Confirmation Dialog */}
      <AlertDialog open={showClearDoctorDetailsDialog} onOpenChange={setShowClearDoctorDetailsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.confirmClearDoctorDetails.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('page.confirmClearDoctorDetails.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowClearDoctorDetailsDialog(false)}>
              {t('page.confirmClearDoctorDetails.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleClearDoctorDetailsConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('page.confirmClearDoctorDetails.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-12">
        {t('footer.copyright', { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}


    