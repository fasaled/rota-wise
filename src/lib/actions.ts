
"use server";

import type { ScheduleFormValues, Schedule, ScheduleEntry, DoctorFormFieldInput } from "./types";
import { parse, isSameDay, format, differenceInCalendarDays, subDays } from 'date-fns';
import { enUS } from 'date-fns/locale';

function isDateInArray(date: Date, dateArray: Date[]): boolean {
  return dateArray.some(d => isSameDay(d, date));
}

interface DoctorWorkloadStats {
  totalWorkdays: number;
  workloadByDayOfWeek: { [dayKey: string]: number }; // e.g. { 'Mon': 0, 'Tue': 0, ... }
}

export async function generateScheduleAction(
  data: ScheduleFormValues
): Promise<{ schedule?: Schedule; error?: string }> {
  try {
    const { doctors: doctorInputs, startDate, endDate, minIntervalBetweenWorkDays = 1 } = data;
    
    const doctorsWithIds: DoctorFormFieldInput[] = doctorInputs.map(doc => ({
        ...doc,
        id: doc.id || `doc-${Math.random().toString(36).substr(2, 9)}`,
        excludedDates: doc.excludedDates || [], // Ensure excludedDates is always an array
    }));

    const mockEntries: ScheduleEntry[] = [];
    let currentDate = new Date(startDate);
    const finalEndDate = new Date(endDate);
    
    const doctorStats: { [doctorId: string]: DoctorWorkloadStats } = {};
    const doctorLastWorkDay: { [doctorId: string]: Date | null } = {};
    const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    doctorsWithIds.forEach(doc => {
      doctorLastWorkDay[doc.id] = null;
      const initialWorkloadByDay: { [dayKey: string]: number } = {};
      dayKeys.forEach(key => initialWorkloadByDay[key] = 0);
      doctorStats[doc.id] = {
        totalWorkdays: 0,
        workloadByDayOfWeek: initialWorkloadByDay,
      };

      // Initialize lastWorkDay from pre-assignments *before* the schedule's start date
      const preAssignmentsBeforeStart = doc.preAssignedWorkDates
        .filter(d => d < startDate)
        .sort((a, b) => b.getTime() - a.getTime()); // Sort descending, latest first
      if (preAssignmentsBeforeStart.length > 0) {
        doctorLastWorkDay[doc.id] = preAssignmentsBeforeStart[0];
      }
    });


    while (currentDate <= finalEndDate) {
      const dayOfWeekFullName = format(currentDate, 'EEEE', { locale: enUS }); // For ScheduleEntry
      const dayOfWeekKey = format(currentDate, 'EEE', { locale: enUS }); // For stats, e.g., "Mon"
      let dayHasWorkAssignment = false;

      // Process pre-assignments first for the current day
      for (const doctor of doctorsWithIds) {
        if (isDateInArray(currentDate, doctor.preAssignedWorkDates)) {
          mockEntries.push({
            date: new Date(currentDate),
            doctorId: doctor.id,
            assignment: 'Pre-assigned',
            dayOfWeek: dayOfWeekFullName,
          });
          doctorLastWorkDay[doctor.id] = new Date(currentDate);
          if (doctorStats[doctor.id]) { // Ensure stats exist
            doctorStats[doctor.id].totalWorkdays++;
            if (doctorStats[doctor.id].workloadByDayOfWeek[dayOfWeekKey] !== undefined) {
                doctorStats[doctor.id].workloadByDayOfWeek[dayOfWeekKey]++;
            }
          }
          dayHasWorkAssignment = true; 
          break; // Assume only one doctor can be pre-assigned to work on a given day
        }
      }
      
      // Add vacation entries regardless of work assignments
      for (const doctor of doctorsWithIds) {
         if (isDateInArray(currentDate, doctor.vacationDates)) {
          mockEntries.push({
            date: new Date(currentDate),
            doctorId: doctor.id,
            assignment: 'Vacation',
            dayOfWeek: dayOfWeekFullName,
          });
        }
      }

      // If no pre-assigned work, try to assign work automatically
      if (!dayHasWorkAssignment && doctorsWithIds.length > 0) {
        const eligibleDoctors = doctorsWithIds.filter(doc => {
            const isDoctorOnVacation = isDateInArray(currentDate, doc.vacationDates);
            const isDoctorExcluded = isDateInArray(currentDate, doc.excludedDates || []); // Handle potentially undefined excludedDates
            
            const lastWork = doctorLastWorkDay[doc.id];
            let respectsMinInterval = true;
            if (lastWork) {
                respectsMinInterval = differenceInCalendarDays(currentDate, lastWork) > minIntervalBetweenWorkDays;
            }
            return !isDoctorOnVacation && !isDoctorExcluded && respectsMinInterval;
        });

        if (eligibleDoctors.length > 0) {
            eligibleDoctors.sort((a, b) => {
                const statsA = doctorStats[a.id];
                const statsB = doctorStats[b.id];

                // 1. Fewest shifts on this specific day of the week
                const dayOfWeekComparison = (statsA?.workloadByDayOfWeek[dayOfWeekKey] ?? 0) - (statsB?.workloadByDayOfWeek[dayOfWeekKey] ?? 0);
                if (dayOfWeekComparison !== 0) return dayOfWeekComparison;

                // 2. Fewest total shifts overall
                const totalWorkdaysComparison = (statsA?.totalWorkdays ?? 0) - (statsB?.totalWorkdays ?? 0);
                if (totalWorkdaysComparison !== 0) return totalWorkdaysComparison;

                // 3. Longest since last worked (earlier date is preferred, null is earliest)
                const lastWorkA_Time = doctorLastWorkDay[a.id]?.getTime();
                const lastWorkB_Time = doctorLastWorkDay[b.id]?.getTime();

                if (lastWorkA_Time === undefined && lastWorkB_Time !== undefined) return -1; // a hasn't worked, b has
                if (lastWorkA_Time !== undefined && lastWorkB_Time === undefined) return 1;  // b hasn't worked, a has
                if (lastWorkA_Time === undefined && lastWorkB_Time === undefined) return 0; // both haven't worked (or no record)
                
                return (lastWorkA_Time || 0) - (lastWorkB_Time || 0); // Both have worked, compare timestamps
            });

            const doctorToAssign = eligibleDoctors[0];
            mockEntries.push({
                date: new Date(currentDate),
                doctorId: doctorToAssign.id,
                assignment: 'Work',
                dayOfWeek: dayOfWeekFullName,
            });
            doctorLastWorkDay[doctorToAssign.id] = new Date(currentDate);
            if (doctorStats[doctorToAssign.id]) { // Ensure stats exist
                doctorStats[doctorToAssign.id].totalWorkdays++;
                if (doctorStats[doctorToAssign.id].workloadByDayOfWeek[dayOfWeekKey] !== undefined) {
                    doctorStats[doctorToAssign.id].workloadByDayOfWeek[dayOfWeekKey]++;
                }
            }
            dayHasWorkAssignment = true;
        }
      }
      
      // If no doctor was assigned work (neither pre-assigned nor automatically)
      if (!dayHasWorkAssignment) {
         mockEntries.push({
            date: new Date(currentDate),
            doctorId: 'system', // Placeholder for no specific doctor
            assignment: 'Off',
            dayOfWeek: dayOfWeekFullName,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      schedule: {
        entries: mockEntries,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        minIntervalBetweenWorkDays: minIntervalBetweenWorkDays,
      },
    };
  } catch (e) {
    console.error("Error generating schedule:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred while generating the schedule.";
    return { error: errorMessage };
  }
}
