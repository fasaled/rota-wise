"use server";

import type { ScheduleFormValues, Schedule, ScheduleEntry, DoctorFormFieldInput } from "./types";
import { parse, isSameDay, format, differenceInCalendarDays, subDays, getDaysInMonth, eachDayOfInterval as eachDayOfIntervalDateFns, isWithinInterval, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { enUS, es } from 'date-fns/locale';

// Import translations for server-side use
import enTranslations from '@/locales/en.json';
import esTranslations from '@/locales/es.json';

function isDateInArray(date: Date, dateArray: Date[]): boolean {
  return dateArray.some(d => d instanceof Date && isSameDay(d, date));
}

interface DoctorWorkloadStats {
  totalWorkdays: number;
  workloadByDayOfWeek: { [dayKey: string]: number }; // e.g. { 'Mon': 0, 'Tue': 0, ... }
  monthlyWorkdays: { [monthKey: string]: number }; // e.g. { "2024-07": 5 }
}

export async function generateScheduleAction(
  data: ScheduleFormValues,
  currentLang: 'en' | 'es'
): Promise<{ schedule?: Schedule; error?: string; warnings?: string[] }> {
  try {
    const translations = { en: enTranslations, es: esTranslations };
    const currentFileTranslations = translations[currentLang];
    const englishTranslationsFallback = translations.en;

    const tAction = (key: string, replacements?: Record<string, string | number>): string => {
      let translation: string | undefined = (currentFileTranslations as any)[key];

      if (translation === undefined && currentLang !== 'en') {
        translation = (englishTranslationsFallback as any)[key];
      }
      if (translation === undefined) {
        // console.warn(`Translation key "${key}" not found in ${currentLang} or en.`);
        return key; 
      }
      
      let result = String(translation);
      if (replacements) {
        Object.keys(replacements).forEach(placeholder => {
          result = result.replace(new RegExp(`{${placeholder}}`, 'g'), String(replacements[placeholder]));
        });
      }
      return result;
    };
    const currentLocaleForFormatting = currentLang === 'es' ? es : enUS;

    const { doctors: doctorInputs, startDate, endDate, minIntervalBetweenWorkDays = 1 } = data;
    const warnings: string[] = [];
    
    const ensureDateArray = (dates: (Date | string)[] | undefined): Date[] => {
        if (!dates) return [];
        return dates.map(d => d instanceof Date ? d : new Date(d)).filter(d => !isNaN(d.getTime()));
    };

    const doctorsWithIds: DoctorFormFieldInput[] = doctorInputs.map(doc => ({
        ...doc,
        id: doc.id || `doc-${Math.random().toString(36).substr(2, 9)}`,
        vacationDates: ensureDateArray(doc.vacationDates),
        preAssignedWorkDates: ensureDateArray(doc.preAssignedWorkDates),
        excludedDates: ensureDateArray(doc.excludedDates),
        isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    }));

    // Pre-check for multiple doctors pre-assigned to the exact same calendar date from input
    const preAssignmentCalendarDateConflicts = new Map<string, { doctors: string[]; conflictDate: Date }>();
    doctorsWithIds.forEach(doctor => {
        doctor.preAssignedWorkDates.forEach(paDate => {
            const dateKey = format(paDate, 'yyyy-MM-dd'); // Normalize to YYYY-MM-DD to group by calendar day
            if (!preAssignmentCalendarDateConflicts.has(dateKey)) {
                preAssignmentCalendarDateConflicts.set(dateKey, { doctors: [], conflictDate: paDate });
            }
            preAssignmentCalendarDateConflicts.get(dateKey)!.doctors.push(doctor.name);
        });
    });

    preAssignmentCalendarDateConflicts.forEach((value) => {
        if (value.doctors.length > 1) {
            // Adjust the date by 12 hours to ensure correct calendar day display in warnings
            const dateForWarning = new Date(value.conflictDate.valueOf() + 12 * 60 * 60 * 1000);
            const warningMessage = tAction('warnings.multiplePreAssignedInput', {
                date: format(dateForWarning, 'PPP', { locale: currentLocaleForFormatting }),
                doctors: value.doctors.join(', ')
            });
            if (!warnings.includes(warningMessage)) {
                warnings.push(warningMessage);
            }
        }
    });


    const mockEntries: ScheduleEntry[] = [];
    let currentDateLoopVar = new Date(startDate); 
    const finalEndDate = new Date(endDate);
    
    const doctorStats: { [doctorId: string]: DoctorWorkloadStats } = {};
    const doctorLastWorkDay: { [doctorId: string]: Date | null } = {};
    const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekendDayKeys = ['Fri', 'Sat', 'Sun']; 

    // New: Track weekend days (Fri, Sat, Sun) worked per doctor per month
    const doctorWeekendDaysThisMonth: { [doctorId: string]: { [monthKey: string]: number } } = {};
    

    const availableDaysPerDoctorPerMonth: Map<string, Map<string, number>> = new Map();
    const scheduleInterval = { start: new Date(startDate), end: new Date(finalEndDate) };
    const monthsInSchedule = eachMonthOfInterval(scheduleInterval);

    doctorsWithIds.forEach(doc => { 
        const monthlyAvailability = new Map<string, number>();
        monthsInSchedule.forEach(monthDate => {
            const monthKey = format(monthDate, 'yyyy-MM');
            const currentMonthDateStart = startOfMonth(monthDate);
            const currentMonthDateEnd = endOfMonth(monthDate);
            
            let daysInCurrentMonthSegment = 0;
            let unavailableDaysInMonthSegment = 0;

            const daysIterator = eachDayOfIntervalDateFns({ start: currentMonthDateStart, end: currentMonthDateEnd });
            for (const dayInMonth of daysIterator) {
                if (isWithinInterval(dayInMonth, scheduleInterval)) {
                    daysInCurrentMonthSegment++;
                    const isOnVacation = isDateInArray(dayInMonth, doc.vacationDates);
                    const isExcluded = isDateInArray(dayInMonth, doc.excludedDates); // Correctly include excluded dates
                    if (isOnVacation || isExcluded) {
                        unavailableDaysInMonthSegment++;
                    }
                }
            }
            monthlyAvailability.set(monthKey, Math.max(0, daysInCurrentMonthSegment - unavailableDaysInMonthSegment));
        });
        availableDaysPerDoctorPerMonth.set(doc.id, monthlyAvailability);
    });


    doctorsWithIds.forEach(doc => {
      doctorLastWorkDay[doc.id] = null;
      // Initialize doctorWeekendDaysThisMonth for each doctor
      doctorWeekendDaysThisMonth[doc.id] = {};
      const initialWorkloadByDay: { [dayKey: string]: number } = {};
      dayKeys.forEach(key => initialWorkloadByDay[key] = 0);
      
      const initialMonthlyWorkdays: { [monthKey: string]: number } = {};
      monthsInSchedule.forEach(monthDate => {
        const monthKey = format(monthDate, 'yyyy-MM');
        initialMonthlyWorkdays[monthKey] = 0;
        doctorWeekendDaysThisMonth[doc.id][monthKey] = 0; // Initialize weekend counts per month
      });

      doctorStats[doc.id] = {
        totalWorkdays: 0,
        workloadByDayOfWeek: initialWorkloadByDay,
        monthlyWorkdays: initialMonthlyWorkdays, 
      };

      const preAssignmentsBeforeStart = doc.preAssignedWorkDates
        .filter(d => d < startDate)
        .sort((a, b) => b.getTime() - a.getTime()); 
      if (preAssignmentsBeforeStart.length > 0) {
        doctorLastWorkDay[doc.id] = preAssignmentsBeforeStart[0];
      }
    });

    while (currentDateLoopVar <= finalEndDate) {
      const currentDate = new Date(currentDateLoopVar); 
      const dayOfWeekFullName = format(currentDate, 'EEEE', { locale: currentLocaleForFormatting }); // Use currentLocaleForFormatting for display
      const dayOfWeekKey = format(currentDate, 'EEE', { locale: enUS }); // Use enUS for consistent keys
      const currentMonthKey = format(currentDate, 'yyyy-MM');
      const isCurrentDayWeekend = weekendDayKeys.includes(dayOfWeekKey);

      let dayHasAnyPreAssignment = false;
      
      for (const doctor of doctorsWithIds) {
          if (isDateInArray(currentDate, doctor.preAssignedWorkDates)) {
              mockEntries.push({ 
                  date: new Date(currentDate), 
                  doctorId: doctor.id,
                  assignment: 'Pre-assigned',
                  dayOfWeek: dayOfWeekFullName,
              });
              dayHasAnyPreAssignment = true; 

              doctorLastWorkDay[doctor.id] = new Date(currentDate);
              if (doctorStats[doctor.id]) { 
                  doctorStats[doctor.id].totalWorkdays++;
                  doctorStats[doctor.id].workloadByDayOfWeek[dayOfWeekKey]++;
                  doctorStats[doctor.id].monthlyWorkdays[currentMonthKey] = (doctorStats[doctor.id].monthlyWorkdays[currentMonthKey] || 0) + 1;
              }
              if (isCurrentDayWeekend) {
                  // Update new monthly weekend tracking
                  doctorWeekendDaysThisMonth[doctor.id][currentMonthKey] = (doctorWeekendDaysThisMonth[doctor.id][currentMonthKey] || 0) + 1;
              }
          }
      }
      
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
      
      let automaticallyAssignedDoctorThisDay = false;
      if (!dayHasAnyPreAssignment && doctorsWithIds.length > 0) {
        const eligibleDoctors = doctorsWithIds.filter(doc => {
            const isDoctorOnVacation = isDateInArray(currentDate, doc.vacationDates);
            const isDoctorExcludedOnDate = isDateInArray(currentDate, doc.excludedDates);
            const isFullyExcludedFromAuto = doc.isExcludedFromAutomaticAssignment;
            
            // Check interval with the last work day (pre-assigned or automatic)
            const lastWork = doctorLastWorkDay[doc.id];
            let respectsMinIntervalFromLast = true;
            if (lastWork) {
                respectsMinIntervalFromLast = differenceInCalendarDays(currentDate, lastWork) > minIntervalBetweenWorkDays;
            }

            // New: Check interval with the next pre-assigned work day
            let respectsMinIntervalToNextPreAssigned = true;
            // Sort preAssignedWorkDates to easily find the next one
            const sortedPreAssignedDates = [...doc.preAssignedWorkDates].sort((a,b) => a.getTime() - b.getTime());
            const nextPreAssignedDate = sortedPreAssignedDates.find(d => d > currentDate);

            if (nextPreAssignedDate) {
                respectsMinIntervalToNextPreAssigned = differenceInCalendarDays(nextPreAssignedDate, currentDate) > minIntervalBetweenWorkDays;
            }

            return !isDoctorOnVacation && 
                   !isDoctorExcludedOnDate && 
                   respectsMinIntervalFromLast && 
                   respectsMinIntervalToNextPreAssigned && 
                   !isFullyExcludedFromAuto;
        });

        if (eligibleDoctors.length > 0) {
            eligibleDoctors.sort((a, b) => {
                const statsA = doctorStats[a.id];
                const statsB = doctorStats[b.id];
                const monthKeyForSort = currentMonthKey; // Same as currentMonthKey

                // --- Rule 1: Minimize Total Workday Difference ---
                // Prioritize doctor with fewer total workdays.
                if (statsA.totalWorkdays !== statsB.totalWorkdays) {
                    return statsA.totalWorkdays - statsB.totalWorkdays;
                }

                // --- Rule 2: Balance Days of the Week (for the currentDayOfWeekKey) ---
                // Prefer doctor who has worked *this specific day of the week* less often.
                const dayOfWeekCountA = statsA.workloadByDayOfWeek[dayOfWeekKey] || 0;
                const dayOfWeekCountB = statsB.workloadByDayOfWeek[dayOfWeekKey] || 0;
                if (dayOfWeekCountA !== dayOfWeekCountB) {
                    return dayOfWeekCountA - dayOfWeekCountB;
                }

                // --- Rule 3: Proportional Monthly Workload ---
                const workdaysInCurrentMonthA = statsA.monthlyWorkdays[monthKeyForSort] || 0;
                const workdaysInCurrentMonthB = statsB.monthlyWorkdays[monthKeyForSort] || 0;
                const availableDaysThisMonthA = availableDaysPerDoctorPerMonth.get(a.id)?.get(monthKeyForSort) ?? 0;
                const availableDaysThisMonthB = availableDaysPerDoctorPerMonth.get(b.id)?.get(monthKeyForSort) ?? 0;

                const ratioA = availableDaysThisMonthA > 0 ? workdaysInCurrentMonthA / availableDaysThisMonthA : (workdaysInCurrentMonthA > 0 ? Infinity : 0);
                const ratioB = availableDaysThisMonthB > 0 ? workdaysInCurrentMonthB / availableDaysThisMonthB : (workdaysInCurrentMonthB > 0 ? Infinity : 0);

                if (ratioA !== ratioB) {
                    return ratioA - ratioB; // Prefer doctor with a lower ratio (less of their available time filled for the month)
                }
                
                // --- Rule 4: Limit Weekend Work (At most one weekend day [Fri, Sat, Sun] per month, when possible) ---
                if (isCurrentDayWeekend) {
                    const weekendDaysWorkedA = doctorWeekendDaysThisMonth[a.id]?.[monthKeyForSort] || 0;
                    const weekendDaysWorkedB = doctorWeekendDaysThisMonth[b.id]?.[monthKeyForSort] || 0;

                    // If one doctor can still work a weekend this month (has 0) and the other can't (has 1+), prefer the one with 0.
                    const canAWorkWeekendPreferably = weekendDaysWorkedA < 1;
                    const canBWorkWeekendPreferably = weekendDaysWorkedB < 1;

                    if (canAWorkWeekendPreferably && !canBWorkWeekendPreferably) return -1; // A is preferred
                    if (!canAWorkWeekendPreferably && canBWorkWeekendPreferably) return 1;  // B is preferred
                    
                    // If both have 0, or both have 1+, then sort by the actual count (fewer is better).
                    // This also handles cases where both might have >1 if it was unavoidable.
                    if (weekendDaysWorkedA !== weekendDaysWorkedB) {
                        return weekendDaysWorkedA - weekendDaysWorkedB;
                    }
                }

                // --- Tie-breaking: Fallback to longest idle time ---
                const lastWorkA_Time = doctorLastWorkDay[a.id]?.getTime();
                const lastWorkB_Time = doctorLastWorkDay[b.id]?.getTime();

                if (lastWorkA_Time === undefined && lastWorkB_Time !== undefined) return -1; 
                if (lastWorkA_Time !== undefined && lastWorkB_Time === undefined) return 1;  
                if (lastWorkA_Time === undefined && lastWorkB_Time === undefined) return 0; 
                return (lastWorkA_Time || 0) - (lastWorkB_Time || 0); 
            });

            const doctorToAssign = eligibleDoctors[0];
            if (doctorToAssign) { 
                mockEntries.push({
                    date: new Date(currentDate),
                    doctorId: doctorToAssign.id,
                    assignment: 'Work',
                    dayOfWeek: dayOfWeekFullName,
                });
                doctorLastWorkDay[doctorToAssign.id] = new Date(currentDate);
                if (doctorStats[doctorToAssign.id]) { 
                    doctorStats[doctorToAssign.id].totalWorkdays++;
                    doctorStats[doctorToAssign.id].workloadByDayOfWeek[dayOfWeekKey]++;
                    doctorStats[doctorToAssign.id].monthlyWorkdays[currentMonthKey] = (doctorStats[doctorToAssign.id].monthlyWorkdays[currentMonthKey] || 0) + 1;
                }
                if (isCurrentDayWeekend) {
                    // Update new monthly weekend tracking
                    doctorWeekendDaysThisMonth[doctorToAssign.id][currentMonthKey] = (doctorWeekendDaysThisMonth[doctorToAssign.id][currentMonthKey] || 0) + 1;
                }
                automaticallyAssignedDoctorThisDay = true;
            }
        }
        
        if (!automaticallyAssignedDoctorThisDay && !dayHasAnyPreAssignment) {
             const anyDoctorPotentiallyAvailableButConstrained = eligibleDoctors.length === 0 && doctorsWithIds.some(doc => {
                const isDoctorOnVacation = isDateInArray(currentDate, doc.vacationDates);
                const isDoctorExcludedOnDate = isDateInArray(currentDate, doc.excludedDates);
                const isFullyExcludedFromAuto = doc.isExcludedFromAutomaticAssignment;
                return !isDoctorOnVacation && !isDoctorExcludedOnDate && !isFullyExcludedFromAuto;
            });

            if (anyDoctorPotentiallyAvailableButConstrained) {
                 mockEntries.push({
                    date: new Date(currentDate),
                    doctorId: 'system', 
                    assignment: 'Off',
                    dayOfWeek: dayOfWeekFullName,
                });
                 // Adjust the date by 12 hours to ensure correct calendar day display in warnings
                 const dateForWarning = new Date(currentDate.valueOf() + 12 * 60 * 60 * 1000);
                 const warningMessage = tAction('warnings.uncoveredDay', { date: format(dateForWarning, 'PPP', { locale: currentLocaleForFormatting }) });
                 if (!warnings.includes(warningMessage)) {
                    warnings.push(warningMessage);
                 }
            } else if (doctorsWithIds.length > 0 && !dayHasAnyPreAssignment && !automaticallyAssignedDoctorThisDay) { 
                // If no one was pre-assigned, and no one could be auto-assigned, and it wasn't due to constraints (meaning all were on vacation/excluded)
                 mockEntries.push({
                    date: new Date(currentDate),
                    doctorId: 'system', 
                    assignment: 'Off',
                    dayOfWeek: dayOfWeekFullName,
                });
            }
        }

      } else if (!dayHasAnyPreAssignment && doctorsWithIds.length === 0) { 
         mockEntries.push({
            date: new Date(currentDate),
            doctorId: 'system', 
            assignment: 'Off',
            dayOfWeek: dayOfWeekFullName,
        });
      }
      
      currentDateLoopVar.setDate(currentDateLoopVar.getDate() + 1);
    }

    return {
      schedule: {
        entries: mockEntries,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        minIntervalBetweenWorkDays: minIntervalBetweenWorkDays,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (e) {
    console.error("Error generating schedule:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred while generating the schedule.";
    return { error: errorMessage };
  }
}
