
"use client";

import { useState, useEffect, useRef } from 'react';
import type { Schedule, ScheduleFormValues, DoctorProfile, ScheduleEntry, PersistedScheduleData, SerializedDoctorFormFieldInput } from '@/lib/types';
import DataInputForm from '@/components/rotawise/data-input-form';
import ScheduleCalendarView from '@/components/rotawise/schedule-calendar-view';
import { generateScheduleAction } from '@/lib/actions';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from "@/hooks/use-toast";
import { ThemeIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import { Save, Upload, FileDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, addMonths } from 'date-fns';


export default function RotaWisePage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [doctorsProfiles, setDoctorsProfiles] = useState<DoctorProfile[]>([]);
  const { toast } = useToast();
  const [isMounted, setIsMounted] = useState(false);

  const [loadedFormValues, setLoadedFormValues] = useState<Partial<ScheduleFormValues> | null>(null);
  const [dataInputFormKey, setDataInputFormKey] = useState(0);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [pdfExportMonth, setPdfExportMonth] = useState<Date | null>(null);
  const [isPdfExportMode, setIsPdfExportMode] = useState(false);


  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Default values for the form, used when no data is loaded
  const defaultPageFormValues: Partial<ScheduleFormValues> = {
    numberOfDoctors: 2,
    startDate: new Date(),
    endDate: new Date(new Date().setDate(new Date().getDate() + 29)), // Approx 1 month
    doctors: [
      { id: crypto.randomUUID(), name: 'Dr. Alice', vacationDates: [], preAssignedWorkDates: [] },
      { id: crypto.randomUUID(), name: 'Dr. Bob', vacationDates: [], preAssignedWorkDates: [] },
    ]
  };

  const handleSubmitForm = async (data: ScheduleFormValues) => {
    setIsLoading(true);
    const profiles: DoctorProfile[] = data.doctors.map(doc => ({
      id: doc.id,
      name: doc.name,
      vacationDates: doc.vacationDates,
      preAssignedWorkDates: doc.preAssignedWorkDates,
    }));
    setDoctorsProfiles(profiles);

    const result = await generateScheduleAction(data);
    setIsLoading(false);

    if (result.error) {
      toast({
        title: "Error Generating Schedule",
        description: result.error,
        variant: "destructive",
      });
      setSchedule(null);
    } else if (result.schedule) {
      const processedSchedule: Schedule = {
        ...result.schedule,
        startDate: new Date(result.schedule.startDate),
        endDate: new Date(result.schedule.endDate),
        entries: result.schedule.entries.map(entry => ({
          ...entry,
          date: new Date(entry.date),
        })),
      };
      setSchedule(processedSchedule);
      toast({
        title: "Schedule Generated",
        description: "The schedule has been successfully generated.",
      });
    }
  };

  const handleUpdateScheduleEntry = (updatedEntry: ScheduleEntry) => {
    setSchedule(prevSchedule => {
      if (!prevSchedule) return null;
      const newEntries = prevSchedule.entries.filter(e => 
        !(e.date.getTime() === updatedEntry.date.getTime() && e.doctorId === (updatedEntry.assignment === 'Off' ? e.doctorId : updatedEntry.doctorId))
      );
      
      if (updatedEntry.assignment !== 'Off' || !prevSchedule.entries.find(e => e.date.getTime() === updatedEntry.date.getTime() && e.doctorId === updatedEntry.doctorId)) {
          newEntries.push(updatedEntry);
      }

      const doctorProfile = doctorsProfiles.find(dp => dp.id === updatedEntry.doctorId);
      if (doctorProfile && updatedEntry.assignment === 'Work') {
        const isVacation = doctorProfile.vacationDates.some(vd => 
          vd.getFullYear() === updatedEntry.date.getFullYear() &&
          vd.getMonth() === updatedEntry.date.getMonth() &&
          vd.getDate() === updatedEntry.date.getDate()
        );
        if (isVacation) {
          toast({
            title: "Schedule Warning",
            description: `${doctorProfile.name} is scheduled to work on a vacation day.`,
            variant: "destructive",
          });
        }
      }
      return { ...prevSchedule, entries: newEntries };
    });
  };

  const handleSaveSchedule = () => {
    if (!schedule || !doctorsProfiles.length) {
      toast({ title: "Nothing to save", description: "Generate a schedule and define doctors first.", variant: "destructive" });
      return;
    }

    const dataToSave: PersistedScheduleData = {
      schedule: {
        ...schedule,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        entries: schedule.entries.map(entry => ({
          ...entry,
          date: entry.date.toISOString(),
        })),
      },
      doctorsProfiles: doctorsProfiles.map(profile => ({
        ...profile,
        vacationDates: profile.vacationDates.map(d => d.toISOString()),
        preAssignedWorkDates: profile.preAssignedWorkDates.map(d => d.toISOString()),
      })),
      formValues: {
        numberOfDoctors: doctorsProfiles.length,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        doctors: doctorsProfiles.map(p => ({
          id: p.id,
          name: p.name,
          vacationDates: p.vacationDates.map(d => d.toISOString()),
          preAssignedWorkDates: p.preAssignedWorkDates.map(d => d.toISOString()),
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
    toast({ title: "Schedule Saved", description: "Schedule data saved to rotawise-schedule.json." });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

        const processedSchedule: Schedule = {
          ...loadedData.schedule,
          startDate: new Date(loadedData.schedule.startDate),
          endDate: new Date(loadedData.schedule.endDate),
          entries: loadedData.schedule.entries.map(entry => ({
            ...entry,
            date: new Date(entry.date),
          })),
        };

        const processedDoctorsProfiles: DoctorProfile[] = loadedData.doctorsProfiles.map(profile => ({
          ...profile,
          vacationDates: profile.vacationDates.map((d: string) => new Date(d)),
          preAssignedWorkDates: profile.preAssignedWorkDates.map((d: string) => new Date(d)),
        }));

        const processedFormValues: ScheduleFormValues = {
           numberOfDoctors: loadedData.formValues.numberOfDoctors,
           startDate: new Date(loadedData.formValues.startDate),
           endDate: new Date(loadedData.formValues.endDate),
           doctors: loadedData.formValues.doctors.map((doc: SerializedDoctorFormFieldInput) => ({
              id: doc.id,
              name: doc.name,
              vacationDates: doc.vacationDates.map((d: string) => new Date(d)),
              preAssignedWorkDates: doc.preAssignedWorkDates.map((d: string) => new Date(d)),
           }))
        };

        setSchedule(processedSchedule);
        setDoctorsProfiles(processedDoctorsProfiles);
        setLoadedFormValues(processedFormValues);
        setDataInputFormKey(prevKey => prevKey + 1); // Force re-mount of DataInputForm

        toast({ title: "Schedule Loaded", description: "Schedule data loaded successfully." });
      } catch (err) {
        console.error("Error loading schedule:", err);
        toast({ title: "Error Loading Schedule", description: (err as Error).message, variant: "destructive" });
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
      toast({ title: "No schedule to export", description: "Generate or load a schedule first.", variant: "destructive" });
      return;
    }
    setIsExportingPdf(true);
    setIsPdfExportMode(true);

    const pdf = new jsPDF({
      orientation: 'p', // portrait
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pdfWidth - 2 * margin;
    let currentY = margin;

    pdf.setFontSize(20);
    pdf.text('RotaWise Schedule Report', pdfWidth / 2, currentY + 5, { align: 'center' });
    currentY += 15;

    pdf.setFontSize(12);
    pdf.text(`Schedule Period: ${format(schedule.startDate, 'PPP')} - ${format(schedule.endDate, 'PPP')}`, margin, currentY);
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
        await new Promise(resolve => setTimeout(resolve, 250)); // Wait for re-render

        const calendarElement = calendarRef.current;
        if (!calendarElement) {
            toast({ title: "Error capturing calendar element", description: "Please try again.", variant: "destructive" });
            setIsPdfExportMode(false);
            setPdfExportMonth(null);
            setIsExportingPdf(false);
            return;
        }

        if (currentY + 30 > pdfHeight - margin) { // Check space for month title + image placeholder
            pdf.addPage();
            currentY = margin;
        }

        pdf.setFontSize(16);
        pdf.text(format(month, 'MMMM yyyy'), margin, currentY);
        currentY += 10;

        try {
            const canvas = await html2canvas(calendarElement, { scale: 3, useCORS: true, logging: false }); // Increased scale to 3
            const imgData = canvas.toDataURL('image/png');
            const imgProps = pdf.getImageProperties(imgData);
            let imgHeight = (imgProps.height * contentWidth) / imgProps.width;
            
            const spaceForImage = pdfHeight - currentY - margin;
            if (imgHeight > spaceForImage) {
                 if (spaceForImage < 50 && allMonthsToExport.length > 1 && allMonthsToExport.indexOf(month) < allMonthsToExport.length -1) { // If too little space and not the only/last month, new page
                    pdf.addPage();
                    currentY = margin;
                    pdf.setFontSize(16); // Re-add month title on new page
                    pdf.text(format(month, 'MMMM yyyy'), margin, currentY);
                    currentY += 10;
                    // Recalculate available height on new page
                    imgHeight = Math.min(imgHeight, pdfHeight - margin * 2 - 10); 
                } else {
                   imgHeight = spaceForImage; // Scale down to fit remaining space
                }
            }
            
            pdf.addImage(imgData, 'PNG', margin, currentY, contentWidth, imgHeight);
            currentY += imgHeight + 5; 
             if (allMonthsToExport.indexOf(month) < allMonthsToExport.length -1 && currentY < pdfHeight - margin) {
                currentY += 5; 
            }


        } catch (captureError) {
            console.error("Error capturing calendar for month:", format(month, 'MMMM yyyy'), captureError);
            toast({ title: "Error Capturing Calendar", description: `Failed for ${format(month, 'MMMM yyyy')}. Report may be incomplete.`, variant: "destructive" });
        }
    }
    
    setPdfExportMonth(null);
    setIsPdfExportMode(false);

    // Add Doctor Details Tables
    for (const doctor of doctorsProfiles) {
        if (currentY + 60 > pdfHeight - margin) { 
          pdf.addPage();
          currentY = margin;
        }

        pdf.setFontSize(14);
        pdf.text(`${doctor.name}'s Schedule Details`, margin, currentY);
        currentY += 8;

        const getFormattedDates = (dates: Date[]) => dates.length > 0 ? dates.map(d => format(d, 'PPP')).join('\n') : 'None';
        
        const preAssignedWorkDates = doctor.preAssignedWorkDates;
        const vacationDates = doctor.vacationDates;
        const generatedWorkDates = schedule.entries
          .filter(e => e.doctorId === doctor.id && e.assignment === 'Work')
          .map(e => e.date);

        autoTable(pdf, {
          startY: currentY,
          head: [['Assignment Type', 'Dates']],
          body: [
            ['Pre-assigned Work', getFormattedDates(preAssignedWorkDates)],
            ['Generated Work', getFormattedDates(generatedWorkDates)],
            ['Vacation', getFormattedDates(vacationDates)],
          ],
          theme: 'grid',
          styles: { fontSize: 9, cellPadding: 1.5, overflow: 'linebreak' },
          headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 1: { cellWidth: 'auto'} },
          margin: { left: margin, right: margin },
        });
        // @ts-ignore
        currentY = (pdf as any).lastAutoTable.finalY + 10;
      }

    try {
      pdf.save('rotawise-report.pdf');
      toast({ title: "PDF Report Exported", description: "rotawise-report.pdf has been downloaded." });
    } catch (error) {
      console.error("Error saving PDF:", error);
      toast({ title: "Error Saving PDF", description: (error as Error).message, variant: "destructive" });
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
          <div className="flex items-center gap-3">
            <ThemeIcon className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary">RotaWise</h1>
              <p className="text-sm text-muted-foreground">Fair and Balanced Doctor Scheduling</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-8 space-y-8">
        <DataInputForm
          key={dataInputFormKey}
          onSubmit={handleSubmitForm}
          isLoading={isLoading}
          initialValues={loadedFormValues || defaultPageFormValues}
        />

        <div className="flex flex-col sm:flex-row gap-4 mt-6 mb-8 justify-center items-center">
          <Button onClick={handleSaveSchedule} variant="outline" disabled={!schedule || isLoading || isExportingPdf} className="w-full sm:w-auto">
            <Save className="mr-2 h-4 w-4" /> Save Schedule
          </Button>
          <Label htmlFor="load-schedule-input" className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer w-full sm:w-auto flex items-center justify-center", (isLoading || isExportingPdf) && "opacity-50 cursor-not-allowed")}>
            <Upload className="mr-2 h-4 w-4" /> Load Schedule
            <input id="load-schedule-input" type="file" accept=".json" className="hidden" onChange={handleFileUpload} disabled={isLoading || isExportingPdf}/>
          </Label>
           <Button onClick={handleExportPdf} variant="outline" disabled={!schedule || isLoading || isExportingPdf} className="w-full sm:w-auto">
            <FileDown className="mr-2 h-4 w-4" /> Export PDF Report
            {isExportingPdf && <span className="animate-spin ml-2 h-4 w-4 border-t-2 border-b-2 border-primary rounded-full"></span>}
          </Button>
        </div>

        {schedule ? (
          <div ref={calendarRef}> {/* Wrapper for html2canvas */}
            <ScheduleCalendarView 
                schedule={schedule} 
                doctors={doctorsProfiles} 
                onUpdateScheduleEntry={handleUpdateScheduleEntry}
                forceDisplayMonth={pdfExportMonth}
                isPdfExportMode={isPdfExportMode}
            />
          </div>
        ) : (
          <Card className="mt-8 shadow-lg text-center">
            <CardHeader>
              <CardTitle>No Schedule Generated Yet</CardTitle>
              <CardDescription>Enter parameters and click "Generate Schedule", or load an existing schedule.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center p-6 min-h-[200px]">
                <Image 
                    src="https://placehold.co/300x200.png"
                    alt="Calendar illustration"
                    width={300}
                    height={200}
                    className="rounded-md opacity-70"
                    data-ai-hint="calendar schedule planning"
                />
            </CardContent>
          </Card>
        )}
      </main>
      <Toaster />
      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-12">
        © {new Date().getFullYear()} RotaWise. All rights reserved.
      </footer>
    </div>
  );
}

