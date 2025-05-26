"use client";

import { useState, useEffect } from 'react';
import type { Schedule, ScheduleFormValues, DoctorProfile, ScheduleEntry } from '@/lib/types';
import DataInputForm from '@/components/equischedule/data-input-form';
import ScheduleCalendarView from '@/components/equischedule/schedule-calendar-view';
import { generateScheduleAction } from '@/lib/actions';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from "@/hooks/use-toast";
import { ThemeIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';

export default function EquiSchedulePage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [doctorsProfiles, setDoctorsProfiles] = useState<DoctorProfile[]>([]);
  const { toast } = useToast();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSubmitForm = async (data: ScheduleFormValues) => {
    setIsLoading(true);
    // Map form doctor data to DoctorProfile for storing/displaying
    const profiles: DoctorProfile[] = data.doctors.map(doc => ({
      id: doc.id, // Ensure ID is carried over
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
      // Ensure dates from action are proper Date objects
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

      // Filter out the old entry if it exists (match by date and original doctorId if it was not an 'Off' day)
      // Or, if it's a new assignment for a day that previously had no specific entry for this doctor.
      const newEntries = prevSchedule.entries.filter(e => 
        !(e.date.getTime() === updatedEntry.date.getTime() && e.doctorId === (updatedEntry.assignment === 'Off' ? e.doctorId : updatedEntry.doctorId)) // More robustly find specific entry to update
      );
      
      // Add the updated/new entry
      newEntries.push(updatedEntry);

      // Simple check for equity (example: warn if a doctor is assigned work on a known vacation day)
      // This is a placeholder for more complex validation logic
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
  
  // Initial values for the form, can be persisted or loaded from settings
  const initialFormValues: Partial<ScheduleFormValues> = {
    numberOfDoctors: 2,
    startDate: new Date(),
    endDate: new Date(new Date().setDate(new Date().getDate() + 29)), // Approx 1 month
    doctors: [
      { id: crypto.randomUUID(), name: 'Dr. Alice', vacationDates: [], preAssignedWorkDates: [] },
      { id: crypto.randomUUID(), name: 'Dr. Bob', vacationDates: [], preAssignedWorkDates: [] },
    ]
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
              <h1 className="text-3xl md:text-4xl font-bold text-primary">EquiSchedule</h1>
              <p className="text-sm text-muted-foreground">Fair and Balanced Doctor Scheduling</p>
            </div>
          </div>
          {/* Dark mode toggle could go here if needed */}
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-8 space-y-8">
        <DataInputForm onSubmit={handleSubmitForm} isLoading={isLoading} initialValues={initialFormValues} />

        {schedule ? (
          <ScheduleCalendarView schedule={schedule} doctors={doctorsProfiles} onUpdateScheduleEntry={handleUpdateScheduleEntry} />
        ) : (
          <Card className="mt-8 shadow-lg text-center">
            <CardHeader>
              <CardTitle>No Schedule Generated Yet</CardTitle>
              <CardDescription>Enter the parameters above and click "Generate Schedule" to begin.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center p-6 min-h-[200px]">
                <Image 
                    src="https://placehold.co/300x200.png" // Placeholder for a relevant image
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
        © {new Date().getFullYear()} EquiSchedule. All rights reserved.
      </footer>
    </div>
  );
}
