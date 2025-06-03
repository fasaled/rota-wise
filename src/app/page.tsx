
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
import { Save, Upload, FileDown, Layers } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, addMonths, isSameDay, differenceInCalendarDays, subDays, eachMonthOfInterval, isSameMonth as isSameMonthDateFns } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useLanguage } from '@/context/language-context';
import { ThemeToggle } from '@/components/theme-toggle';
import ScheduleSummaryTable from '@/components/rotawise/schedule-summary-table';
import MonthlyWorkloadSummaryTable from '@/components/rotawise/MonthlyWorkloadSummaryTable';

type LoadMode = 'as-is' | 'as-pre-assigned';

export default function RotaWisePage() {
  const { t, currentDateFnsLocale } = useLanguage();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [doctorsProfiles, setDoctorsProfiles] = useState<DoctorProfile[]>([]);
  const { toast } = useToast();
  const [isMounted, setIsMounted] = useState(false);

  const [currentMinInterval, setCurrentMinInterval] = useState<number>(1);
  const [loadedFormValues, setLoadedFormValues] = useState<Partial<ScheduleFormValues> | null>(null);
  const [dataInputFormKey, setDataInputFormKey] = useState(0);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [pdfExportMonth, setPdfExportMonth] = useState<Date | null>(null);
  const [isPdfExportMode, setIsPdfExportMode] = useState(false);


  useEffect(() => {
    setIsMounted(true);
  }, []);

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

    const result = await generateScheduleAction(data);
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

    setSchedule(null);
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
    setIsPdfExportMode(true);

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pdfWidth - 2 * margin;
    let currentY = margin;

    pdf.setFontSize(20);
    pdf.text(t('pdf.reportTitle'), pdfWidth / 2, currentY + 5, { align: 'center' });
    currentY += 15;

    pdf.setFontSize(12);
    pdf.text(t('pdf.schedulePeriod', {
        startDate: format(schedule.startDate, 'PPP', { locale: currentDateFnsLocale }),
        endDate: format(schedule.endDate, 'PPP', { locale: currentDateFnsLocale })
    }), margin, currentY);
    currentY += 7;
    
    const intervalToDisplay = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
    pdf.text(t('pdf.minIntervalInfo', { interval: intervalToDisplay }), margin, currentY);
    currentY += 10;


    const getMonthsInRange = (start: Date, end: Date): Date[] => {
        const months: Date[] = [];
        let currentIterationDate = startOfMonth(new Date(start));
        const finalMonthStart = startOfMonth(new Date(end));
        while (currentIterationDate <= finalMonthStart) {
            months.push(new Date(currentIterationDate));
            currentIterationDate = addMonths(currentIterationDate, 1);
        }
        return months;
    };

    const allMonthsToExport = getMonthsInRange(schedule.startDate, schedule.endDate);

    for (const month of allMonthsToExport) {
        setPdfExportMonth(month);
        await new Promise(resolve => setTimeout(resolve, 250));

        const calendarElement = calendarRef.current;
        if (!calendarElement) {
            toast({
              title: t('page.toast.errorCapturingCalendarElement.title'),
              description: t('page.toast.errorCapturingCalendarElement.description'),
              variant: "destructive"
            });
            setIsPdfExportMode(false);
            setPdfExportMonth(null);
            setIsExportingPdf(false);
            return;
        }

        const monthTitle = format(month, 'MMMM yyyy', { locale: currentDateFnsLocale });
        const titleHeight = 10;
        const minImageHeight = 100;
        const estimatedSpaceForBlock = titleHeight + minImageHeight + 10;

        if (allMonthsToExport.indexOf(month) > 0 && (currentY + estimatedSpaceForBlock > pdfHeight - margin)) {
            pdf.addPage();
            currentY = margin;
        }
        
        pdf.setFontSize(16);
        pdf.text(monthTitle, margin, currentY);
        currentY += titleHeight;
        
        if (currentY + minImageHeight > pdfHeight - margin && allMonthsToExport.indexOf(month) > 0) {
            pdf.addPage();
            currentY = margin;
            pdf.setFontSize(16);
            pdf.text(monthTitle, margin, currentY);
            currentY += titleHeight;
        }


        try {
            const canvas = await html2canvas(calendarElement, { scale: 3, useCORS: true, logging: false });
            const imgData = canvas.toDataURL('image/png');
            const imgProps = pdf.getImageProperties(imgData);
            let imgHeight = (imgProps.height * contentWidth) / imgProps.width;
            
            const spaceForImageOnCurrentPage = pdfHeight - currentY - margin;

            if (imgHeight > spaceForImageOnCurrentPage ) {
                 imgHeight = spaceForImageOnCurrentPage;
            }


            pdf.addImage(imgData, 'PNG', margin, currentY, contentWidth, imgHeight);
            currentY += imgHeight + 10;

        } catch (captureError) {
            console.error("Error capturing calendar for month:", monthTitle, captureError);
            toast({
              title: t('page.toast.errorCapturingCalendarForMonth.title'),
              description: t('page.toast.errorCapturingCalendarForMonth.description', { month: monthTitle }),
              variant: "destructive"
            });
        }
    }

    setPdfExportMonth(null);
    setIsPdfExportMode(false);

    for (const doctor of doctorsProfiles) {
        if (currentY + 70 > pdfHeight - margin) { // Adjusted estimated height for fewer rows
          pdf.addPage();
          currentY = margin;
        }

        pdf.setFontSize(14);
        pdf.text(t('pdf.doctorDetailsTitle', { doctorName: doctor.name }), margin, currentY);
        currentY += 8;
        
        if (doctor.isExcludedFromAutomaticAssignment) {
            pdf.setFontSize(9);
            pdf.setTextColor(100); // Gray color
            pdf.text(t('pdf.doctorIsExcludedFromAuto'), margin, currentY);
            currentY += 5;
            pdf.setTextColor(0); // Reset color
        }

        const getFormattedDates = (dates: Date[]) => dates.length > 0 ? dates.map(d => format(d, 'PPP', { locale: currentDateFnsLocale })).join('\n') : t('pdf.none');

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
          head: [[t('pdf.assignmentTypeHeader'), t('pdf.datesHeader')]],
          body: [
            [t('pdf.workDays'), getFormattedDates(allWorkDates)],
          ],
          theme: 'grid',
          styles: { fontSize: 9, cellPadding: 1.5, overflow: 'linebreak' },
          headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 1: { cellWidth: 'auto'} },
          margin: { left: margin, right: margin },
        });
        currentY = (pdf as any).lastAutoTable.finalY + 10;
      }

    if (currentY + 50 > pdfHeight - margin) {
        pdf.addPage();
        currentY = margin;
    }
    pdf.setFontSize(16);
    pdf.text(t('pdf.workdaysSummary.title'), margin, currentY);
    currentY += 10;

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
        summary.Mon,
        summary.Tue,
        summary.Wed,
        summary.Thu,
        summary.Fri,
        summary.Sat,
        summary.Sun,
        summary.Total,
    ]);

    autoTable(pdf, {
        startY: currentY,
        head: [[
            t('pdf.workdaysSummary.doctorHeader'),
            t('pdf.workdaysSummary.monHeader'),
            t('pdf.workdaysSummary.tueHeader'),
            t('pdf.workdaysSummary.wedHeader'),
            t('pdf.workdaysSummary.thuHeader'),
            t('pdf.workdaysSummary.friHeader'),
            t('pdf.workdaysSummary.satHeader'),
            t('pdf.workdaysSummary.sunHeader'),
            t('pdf.workdaysSummary.totalHeader'),
        ]],
        body: summaryTableBody,
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 1.5 },
        headStyles: { fillColor: [75, 150, 220], textColor: 255, fontStyle: 'bold' },
        margin: { left: margin, right: margin },
    });
    currentY = (pdf as any).lastAutoTable.finalY + 10;

    // --- Add Monthly Workload Summary to PDF ---
    if (currentY + 60 > pdfHeight - margin) { // Estimate space needed
        pdf.addPage();
        currentY = margin;
    }
    pdf.setFontSize(16);
    pdf.text(t('pdf.monthlyWorkloadSummary.title'), margin, currentY);
    currentY += 10;

    const scheduleMonthsForPdf = eachMonthOfInterval({
      start: schedule.startDate,
      end: schedule.endDate,
    }).map(monthDate => startOfMonth(monthDate));

    const monthHeadersForPdf = scheduleMonthsForPdf.map(m => format(m, 'MMM yyyy', { locale: currentDateFnsLocale }));
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
        styles: { fontSize: 9, cellPadding: 1.5 },
        headStyles: { fillColor: [75, 150, 220], textColor: 255, fontStyle: 'bold' },
        margin: { left: margin, right: margin },
    });
    // currentY = (pdf as any).lastAutoTable.finalY + 10; // Update currentY if more content follows

    // --- End of Monthly Workload Summary for PDF ---

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

        {schedule ? (
          <>
            <div ref={calendarRef}>
              <ScheduleCalendarView
                  schedule={schedule}
                  doctors={doctorsProfiles}
                  onUpdateScheduleEntry={handleUpdateScheduleEntry}
                  forceDisplayMonth={pdfExportMonth}
                  isPdfExportMode={isPdfExportMode}
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

    