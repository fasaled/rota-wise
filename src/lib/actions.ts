"use server";

import type { ScheduleFormValues, Schedule, ScheduleEntry, DoctorFormFieldInput } from "./types";
import { parse, isSameDay, format } from 'date-fns';

// In a real scenario, this would import and call an AI flow:
// import { scheduleOptimizerFlow } from "@/ai/flows/schedule-optimizer";

function isDateInArray(date: Date, dateArray: Date[]): boolean {
  return dateArray.some(d => isSameDay(d, date));
}

export async function generateScheduleAction(
  data: ScheduleFormValues
): Promise<{ schedule?: Schedule; error?: string }> {
  try {
    // const result = await scheduleOptimizerFlow.run(data); // Call to actual AI flow

    // Mock implementation:
    const { doctors: doctorInputs, startDate, endDate } = data;
    
    // Ensure doctorInputs have IDs, assuming they are passed with unique IDs from the form
    const doctorsWithIds: DoctorFormFieldInput[] = doctorInputs.map(doc => ({
        ...doc,
        id: doc.id || `doc-${Math.random().toString(36).substr(2, 9)}` // Fallback ID if not provided
    }));


    const mockEntries: ScheduleEntry[] = [];
    let currentDate = new Date(startDate);
    const finalEndDate = new Date(endDate);
    let workDoctorIndex = 0; // For round-robin assignment of 'Work'

    while (currentDate <= finalEndDate) {
      const dayOfWeek = format(currentDate, 'EEEE'); // E.g., "Monday"
      let dayHasAssignment = false;

      // Process pre-assignments and vacations first
      for (const doctor of doctorsWithIds) {
        if (isDateInArray(currentDate, doctor.preAssignedWorkDates)) {
          mockEntries.push({
            date: new Date(currentDate),
            doctorId: doctor.id,
            assignment: 'Pre-assigned',
            dayOfWeek,
          });
          dayHasAssignment = true; 
          // For simplicity, assume one pre-assignment takes precedence for the day.
          // Real system might allow multiple doctors or have complex rules.
        } else if (isDateInArray(currentDate, doctor.vacationDates)) {
          mockEntries.push({
            date: new Date(currentDate),
            doctorId: doctor.id,
            assignment: 'Vacation',
            dayOfWeek,
          });
          // Note: This doctor is on vacation. They shouldn't be assigned 'Work'.
        }
      }

      // If no pre-assignment for the day, assign 'Work' based on round-robin
      // This naive mock doesn't perfectly ensure fairness or avoid assigning work to a doctor on vacation.
      // The actual AI flow would handle this.
      if (!dayHasAssignment && doctorsWithIds.length > 0) {
        let assignedWork = false;
        let attempts = 0;
        while(!assignedWork && attempts < doctorsWithIds.length) {
          const doctorToAssign = doctorsWithIds[workDoctorIndex % doctorsWithIds.length];
          const isDoctorOnVacation = isDateInArray(currentDate, doctorToAssign.vacationDates);
          const isDoctorPreassigned = isDateInArray(currentDate, doctorToAssign.preAssignedWorkDates);

          if (!isDoctorOnVacation && !isDoctorPreassigned) {
            mockEntries.push({
              date: new Date(currentDate),
              doctorId: doctorToAssign.id,
              assignment: 'Work',
              dayOfWeek,
            });
            assignedWork = true;
          }
          workDoctorIndex++;
          attempts++;
        }
        if(!assignedWork) {
           // If all doctors are on vacation or pre-assigned, mark day as 'Off' or handle as per logic
            mockEntries.push({
                date: new Date(currentDate),
                doctorId: 'system', // No specific doctor
                assignment: 'Off',
                dayOfWeek,
            });
        }
      } else if (doctorsWithIds.length === 0) {
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
      },
    };
  } catch (e) {
    console.error("Error generating schedule:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred while generating the schedule.";
    return { error: errorMessage };
  }
}
