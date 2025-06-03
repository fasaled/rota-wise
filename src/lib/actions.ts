
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
    const translations = currentLang === 'es' ? esTranslations : enTranslations;
    const tAction = (key: string, replacements?: Record<string, string | number>): string => {
      let translationPath = key.split('.');
      let translation: any = translations;
      for (const part of translationPath) {
        if (translation && typeof translation === 'object' && part in translation) {
          translation = translation[part];
        } else {
          translation = undefined;
          break;
        }
      }

      if (translation === undefined) return key; // Fallback to key if not found
      
      let result = String(translation);
      if (replacements && typeof result === 'string') {
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

    const mockEntries: ScheduleEntry[] = [];
    let currentDateLoopVar = new Date(startDate); 
    const finalEndDate = new Date(endDate);
    
    const doctorStats: { [doctorId: string]: DoctorWorkloadStats } = {};
    const doctorLastWorkDay: { [doctorId: string]: Date | null } = {};
    const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekendDayKeys = ['Fri', 'Sat', 'Sun']; 

    const doctorHasWorkedThisWeekend: { [doctorId: string]: boolean } = {};
    

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
                    const isExcluded = isDateInArray(dayInMonth, doc.excludedDates);
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
      doctorHasWorkedThisWeekend[doc.id] = false;
      const initialWorkloadByDay: { [dayKey: string]: number } = {};
      dayKeys.forEach(key => initialWorkloadByDay[key] = 0);
      doctorStats[doc.id] = {
        totalWorkdays: 0,
        workloadByDayOfWeek: initialWorkloadByDay,
        monthlyWorkdays: {}, 
      };

      const preAssignmentsBeforeStart = doc.preAssignedWorkDates
        .filter(d => d < startDate)
        .sort((a, b) => b.getTime() - a.getTime()); 
      if (preAssignmentsBeforeStart.length > 0) {
        doctorLastWorkDay[doc.id] = preAssignmentsBeforeStart[0];
      }
    });

    let previousDayWasSunday = false;

    while (currentDateLoopVar <= finalEndDate) {
      const currentDate = new Date(currentDateLoopVar); 
      const dayOfWeekFullName = format(currentDate, 'EEEE', { locale: enUS }); 
      const dayOfWeekKey = format(currentDate, 'EEE', { locale: enUS }); 
      const currentMonthKey = format(currentDate, 'yyyy-MM');
      const isCurrentDayWeekend = weekendDayKeys.includes(dayOfWeekKey);

      if (dayOfWeekKey === 'Mon' && previousDayWasSunday) {
        Object.keys(doctorHasWorkedThisWeekend).forEach(docId => {
            doctorHasWorkedThisWeekend[docId] = false;
        });
      }

      let dayHasAnyPreAssignment = false;
      const preAssignedDoctorsNamesForThisDay: string[] = [];

      for (const doctor of doctorsWithIds) {
          if (isDateInArray(currentDate, doctor.preAssignedWorkDates)) {
              preAssignedDoctorsNamesForThisDay.push(doctor.name);
              doctorLastWorkDay[doctor.id] = new Date(currentDate);
              if (doctorStats[doctor.id]) { 
                  doctorStats[doctor.id].totalWorkdays++;
                  doctorStats[doctor.id].workloadByDayOfWeek[dayOfWeekKey]++;
                  doctorStats[doctor.id].monthlyWorkdays[currentMonthKey] = (doctorStats[doctor.id].monthlyWorkdays[currentMonthKey] || 0) + 1;
              }
              if (isCurrentDayWeekend) {
                  doctorHasWorkedThisWeekend[doctor.id] = true;
              }
            
              mockEntries.push({ 
                  date: new Date(currentDate),
                  doctorId: doctor.id,
                  assignment: 'Pre-assigned',
                  dayOfWeek: dayOfWeekFullName,
              });
              dayHasAnyPreAssignment = true; 
          }
      }

      if (preAssignedDoctorsNamesForThisDay.length > 1) {
        const warningMessage = tAction('warnings.multiplePreAssigned', {
            date: format(currentDate, 'PPP', { locale: currentLocaleForFormatting }),
            doctors: preAssignedDoctorsNamesForThisDay.join(', ')
        });
        if (!warnings.includes(warningMessage)) {
            warnings.push(warningMessage);
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
            
            const lastWork = doctorLastWorkDay[doc.id];
            let respectsMinInterval = true;
            if (lastWork) {
                respectsMinInterval = differenceInCalendarDays(currentDate, lastWork) > minIntervalBetweenWorkDays;
            }
            return !isDoctorOnVacation && !isDoctorExcludedOnDate && respectsMinInterval && !isFullyExcludedFromAuto;
        });

        if (eligibleDoctors.length > 0) {
            eligibleDoctors.sort((a, b) => {
                const statsA = doctorStats[a.id];
                const statsB = doctorStats[b.id];

                if (isCurrentDayWeekend) {
                    const aHasWorkedWknd = doctorHasWorkedThisWeekend[a.id] ? 1 : 0;
                    const bHasWorkedWknd = doctorHasWorkedThisWeekend[b.id] ? 1 : 0;
                    if (aHasWorkedWknd !== bHasWorkedWknd) {
                        return aHasWorkedWknd - bHasWorkedWknd; 
                    }
                }
                
                const workdaysInCurrentMonthA = statsA?.monthlyWorkdays[currentMonthKey] || 0;
                const workdaysInCurrentMonthB = statsB?.monthlyWorkdays[currentMonthKey] || 0;
                
                const availableDaysThisMonthA = availableDaysPerDoctorPerMonth.get(a.id)?.get(currentMonthKey) ?? 0;
                const availableDaysThisMonthB = availableDaysPerDoctorPerMonth.get(b.id)?.get(currentMonthKey) ?? 0;

                const percentageWorkedA = (availableDaysThisMonthA > 0) ? workdaysInCurrentMonthA / availableDaysThisMonthA : (workdaysInCurrentMonthA > 0 ? Infinity : 0);
                const percentageWorkedB = (availableDaysThisMonthB > 0) ? workdaysInCurrentMonthB / availableDaysThisMonthB : (workdaysInCurrentMonthB > 0 ? Infinity : 0);
                
                const diffPercentage = Math.abs(percentageWorkedA - percentageWorkedB);

                if (diffPercentage > 0.02) { 
                    return percentageWorkedA - percentageWorkedB;
                }
                
                const dayOfWeekComparison = (statsA?.workloadByDayOfWeek[dayOfWeekKey] ?? 0) - (statsB?.workloadByDayOfWeek[dayOfWeekKey] ?? 0);
                if (dayOfWeekComparison !== 0) {
                    return dayOfWeekComparison;
                }

                if (percentageWorkedA !== percentageWorkedB) { 
                    return percentageWorkedA - percentageWorkedB;
                }
                
                const totalWorkdaysComparison = (statsA?.totalWorkdays ?? 0) - (statsB?.totalWorkdays ?? 0);
                if (totalWorkdaysComparison !== 0) return totalWorkdaysComparison;

                const lastWorkA_Time = doctorLastWorkDay[a.id]?.getTime();
                const lastWorkB_Time = doctorLastWorkDay[b.id]?.getTime();
                if (lastWorkA_Time === undefined && lastWorkB_Time !== undefined) return -1; 
                if (lastWorkA_Time !== undefined && lastWorkB_Time === undefined) return 1;  
                if (lastWorkA_Time === undefined && lastWorkB_Time === undefined) return 0; 
                return (lastWorkA_Time || 0) - (lastWorkB_Time || 0); 
            });

            const doctorToAssign = eligibleDoctors[0];
            if (doctorToAssign) { // Ensure a doctor was actually selected after sorting
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
                    doctorHasWorkedThisWeekend[doctorToAssign.id] = true;
                }
                automaticallyAssignedDoctorThisDay = true;
            }
        }
        
        if (!automaticallyAssignedDoctorThisDay && !dayHasAnyPreAssignment) {
             mockEntries.push({
                date: new Date(currentDate),
                doctorId: 'system', 
                assignment: 'Off',
                dayOfWeek: dayOfWeekFullName,
            });
             const anyDoctorPotentiallyAvailable = doctorsWithIds.some(doc => {
                const isDoctorOnVacation = isDateInArray(currentDate, doc.vacationDates);
                const isDoctorExcludedOnDate = isDateInArray(currentDate, doc.excludedDates);
                const isFullyExcludedFromAuto = doc.isExcludedFromAutomaticAssignment;
                return !isDoctorOnVacation && !isDoctorExcludedOnDate && !isFullyExcludedFromAuto;
            });
            if (anyDoctorPotentiallyAvailable) {
                 const warningMessage = tAction('warnings.uncoveredDay', { date: format(currentDate, 'PPP', { locale: currentLocaleForFormatting }) });
                 if (!warnings.includes(warningMessage)) {
                    warnings.push(warningMessage);
                 }
            }
        }

      } else if (!dayHasAnyPreAssignment) { 
         mockEntries.push({
            date: new Date(currentDate),
            doctorId: 'system', 
            assignment: 'Off',
            dayOfWeek: dayOfWeekFullName,
        });
      }
      
      previousDayWasSunday = (dayOfWeekKey === 'Sun');
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

