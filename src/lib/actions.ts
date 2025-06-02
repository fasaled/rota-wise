
"use server";

import type { ScheduleFormValues, Schedule, ScheduleEntry, DoctorFormFieldInput } from "./types";
import { parse, isSameDay, format, differenceInCalendarDays, subDays } from 'date-fns';

function isDateInArray(date: Date, dateArray: Date[]): boolean {
  return dateArray.some(d => isSameDay(d, date));
}

export async function generateScheduleAction(
  data: ScheduleFormValues
): Promise<{ schedule?: Schedule; error?: string }> {
  try {
    const { doctors: doctorInputs, startDate, endDate, minIntervalBetweenWorkDays = 1 } = data;
    
    const doctorsWithIds: DoctorFormFieldInput[] = doctorInputs.map(doc => ({
        ...doc,
        id: doc.id || `doc-${Math.random().toString(36).substr(2, 9)}` 
    }));

    const mockEntries: ScheduleEntry[] = [];
    let currentDate = new Date(startDate);
    const finalEndDate = new Date(endDate);
    let workDoctorIndex = 0; 
    
    // Track the last work day for each doctor
    const doctorLastWorkDay: { [doctorId: string]: Date | null } = {};
    doctorsWithIds.forEach(doc => doctorLastWorkDay[doc.id] = null);

    // Populate initial last work days from pre-assignments *before* the schedule start date
    // This is a simplified approach; a more robust solution might need to look further back.
    for (const doctor of doctorsWithIds) {
        let latestPreAssignmentBeforeStart: Date | null = null;
        for (const preAssignedDate of doctor.preAssignedWorkDates) {
            if (preAssignedDate < startDate) {
                if (!latestPreAssignmentBeforeStart || preAssignedDate > latestPreAssignmentBeforeStart) {
                    latestPreAssignmentBeforeStart = preAssignedDate;
                }
            }
        }
        if (latestPreAssignmentBeforeStart) {
            doctorLastWorkDay[doctor.id] = latestPreAssignmentBeforeStart;
        }
    }


    while (currentDate <= finalEndDate) {
      const dayOfWeek = format(currentDate, 'EEEE'); 
      let dayHasAssignment = false;
      let assignedDoctorOnDay: string | null = null;

      // Process pre-assignments first
      for (const doctor of doctorsWithIds) {
        if (isDateInArray(currentDate, doctor.preAssignedWorkDates)) {
          // Check min interval for pre-assignments IF they are not the very first assignment
          const lastWorkDay = doctorLastWorkDay[doctor.id];
          if (lastWorkDay && differenceInCalendarDays(currentDate, lastWorkDay) <= minIntervalBetweenWorkDays) {
             // This pre-assignment violates the interval. For now, we'll log and potentially skip,
             // or the business rule might be that pre-assignments override this.
             // For this implementation, pre-assignments will override the interval but this is a point for refinement.
             // console.warn(`Doctor ${doctor.name} pre-assigned on ${format(currentDate, 'yyyy-MM-dd')} violates min interval.`);
          }
          
          mockEntries.push({
            date: new Date(currentDate),
            doctorId: doctor.id,
            assignment: 'Pre-assigned',
            dayOfWeek,
          });
          doctorLastWorkDay[doctor.id] = new Date(currentDate);
          dayHasAssignment = true; 
          assignedDoctorOnDay = doctor.id;
          break; // Assume only one doctor can be pre-assigned to work on a given day
        }
      }
      
      // Process vacations (these don't set dayHasAssignment to true for work purposes)
      for (const doctor of doctorsWithIds) {
         if (isDateInArray(currentDate, doctor.vacationDates)) {
          mockEntries.push({
            date: new Date(currentDate),
            doctorId: doctor.id,
            assignment: 'Vacation',
            dayOfWeek,
          });
        }
      }

      if (!dayHasAssignment && doctorsWithIds.length > 0) {
        let assignedWork = false;
        let attempts = 0;
        // Try to assign work, respecting vacations, exclusions, and min interval
        // Rotate through doctors ensuring fairness
        const startingDoctorIndex = workDoctorIndex % doctorsWithIds.length; 
        
        for (let i = 0; i < doctorsWithIds.length; i++) {
            const currentDoctorAttemptIndex = (startingDoctorIndex + i) % doctorsWithIds.length;
            const doctorToAssign = doctorsWithIds[currentDoctorAttemptIndex];

            const isDoctorOnVacation = isDateInArray(currentDate, doctorToAssign.vacationDates);
            const isDoctorExcluded = isDateInArray(currentDate, doctorToAssign.excludedDates);
            
            const lastWorkDay = doctorLastWorkDay[doctorToAssign.id];
            let respectsMinInterval = true;
            if (lastWorkDay) {
                // Interval is number of full days *between* work days. So difference must be > interval.
                respectsMinInterval = differenceInCalendarDays(currentDate, lastWorkDay) > minIntervalBetweenWorkDays;
            }

            if (!isDoctorOnVacation && !isDoctorExcluded && respectsMinInterval) {
                mockEntries.push({
                date: new Date(currentDate),
                doctorId: doctorToAssign.id,
                assignment: 'Work',
                dayOfWeek,
                });
                doctorLastWorkDay[doctorToAssign.id] = new Date(currentDate);
                assignedWork = true;
                assignedDoctorOnDay = doctorToAssign.id;
                workDoctorIndex = currentDoctorAttemptIndex + 1; // Next attempt starts after this doctor
                break; 
            }
        }


        if (!assignedWork) { 
            mockEntries.push({
                date: new Date(currentDate),
                doctorId: 'system', 
                assignment: 'Off',
                dayOfWeek,
            });
        }
      } else if (doctorsWithIds.length === 0 && !dayHasAssignment) {
         mockEntries.push({
            date: new Date(currentDate),
            doctorId: 'system',
            assignment: 'Off',
            dayOfWeek,
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
