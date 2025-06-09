import type { ScheduleFormValues, Schedule, ScheduleEntry, DoctorFormFieldInput } from "./types";
import { isSameDay, format, differenceInCalendarDays, eachDayOfInterval as eachDayOfIntervalDateFns, isWithinInterval, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { enUS } from 'date-fns/locale'; // For consistent internal keys and default formatting

// Helper function to check if a date is in an array of dates
function isDateInArray(date: Date, dateArray: Date[]): boolean {
  return dateArray.some(d => d instanceof Date && isSameDay(d, date));
}

// Helper function to ensure all dates in an array are Date objects
const ensureDateArray = (dates: (Date | string)[] | undefined): Date[] => {
    if (!dates) return [];
    return dates.map(d => d instanceof Date ? d : new Date(d)).filter(d => !isNaN(d.getTime()));
};

interface DoctorWorkloadStats {
  totalWorkdays: number;
  workloadByDayOfWeek: { [dayKey: string]: number }; // e.g. { 'Mon': 0, 'Tue': 0, ... }
  monthlyWorkdays: { [monthKey: string]: number }; // e.g. { "2024-07": 5 }
}

// Interface for warnings to be returned (key for i18n and params)
export interface ScheduleWarning {
  key: string;
  params?: Record<string, any>;
}

export function generateSchedule(
  data: ScheduleFormValues,
  existingFixedEntries?: ScheduleEntry[]
): { schedule?: Schedule; error?: string; warnings?: ScheduleWarning[] } {
  try {
    const { doctors: doctorInputs, startDate, endDate, minIntervalBetweenWorkDays = 1 } = data;
    const warnings: ScheduleWarning[] = [];
    
    const doctorsWithIds: DoctorFormFieldInput[] = doctorInputs.map(doc => ({
        ...doc,
        id: doc.id || `doc-${Math.random().toString(36).substring(2, 9)}`, // Consistent with original
        vacationDates: ensureDateArray(doc.vacationDates),
        preAssignedWorkDates: ensureDateArray(doc.preAssignedWorkDates),
        excludedDates: ensureDateArray(doc.excludedDates),
        isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    }));

    // Pre-check for multiple doctors pre-assigned to the exact same calendar date from input
    const preAssignmentCalendarDateConflicts = new Map<string, { doctors: string[]; conflictDate: Date }>();
    doctorsWithIds.forEach(doctor => {
        doctor.preAssignedWorkDates.forEach(paDate => {
            const dateKey = format(paDate, 'yyyy-MM-dd');
            if (!preAssignmentCalendarDateConflicts.has(dateKey)) {
                preAssignmentCalendarDateConflicts.set(dateKey, { doctors: [], conflictDate: paDate });
            }
            preAssignmentCalendarDateConflicts.get(dateKey)!.doctors.push(doctor.name);
        });
    });

    preAssignmentCalendarDateConflicts.forEach((value) => {
        if (value.doctors.length > 1) {
            // Note: Date adjustment for warnings (adding 12 hours) is removed here.
            // The raw date is passed; formatting and any timezone adjustments should be handled by the UI.
            warnings.push({
                key: 'warnings.multiplePreAssignedInput',
                params: { 
                    date: value.conflictDate, // Pass the original Date object
                    doctors: value.doctors.join(', ') 
                }
            });
        }
    });

    const mockEntries: ScheduleEntry[] = [];
    
    // Add existing fixed entries first
    if (existingFixedEntries) {
      existingFixedEntries.forEach(entry => {
        const entryDate = new Date(entry.date);
        if (entryDate >= startDate && entryDate <= endDate && entry.isFixed) {
          mockEntries.push({
            ...entry,
            date: new Date(entryDate),
            isFixed: true
          });
        }
      });
    }
    
    let currentDateLoopVar = new Date(startDate); 
    const finalEndDate = new Date(endDate);
    
    const doctorStats: { [doctorId: string]: DoctorWorkloadStats } = {};
    const doctorLastWorkDay: { [doctorId: string]: Date | null } = {};
    const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekendDayKeys = ['Fri', 'Sat', 'Sun']; 
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
      doctorWeekendDaysThisMonth[doc.id] = {};
      const initialWorkloadByDay: { [dayKey: string]: number } = {};
      dayKeys.forEach(key => initialWorkloadByDay[key] = 0);
      
      const initialMonthlyWorkdays: { [monthKey: string]: number } = {};
      monthsInSchedule.forEach(monthDate => {
        const monthKey = format(monthDate, 'yyyy-MM');
        initialMonthlyWorkdays[monthKey] = 0;
        doctorWeekendDaysThisMonth[doc.id][monthKey] = 0;
      });

      doctorStats[doc.id] = {
        totalWorkdays: 0,
        workloadByDayOfWeek: initialWorkloadByDay,
        monthlyWorkdays: initialMonthlyWorkdays, 
      };

      // Find the most recent work day before the schedule start date
      const workDatesBeforeStart: Date[] = [];
      
      // Add pre-assigned work dates before start
      workDatesBeforeStart.push(...doc.preAssignedWorkDates.filter(d => d < startDate));
      
      // Add fixed work assignments before start
      if (existingFixedEntries) {
        const fixedWorkDatesBeforeStart = existingFixedEntries
          .filter(entry => entry.doctorId === doc.id && 
                         (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned') &&
                         entry.date < startDate)
          .map(entry => new Date(entry.date));
        workDatesBeforeStart.push(...fixedWorkDatesBeforeStart);
      }
      
      if (workDatesBeforeStart.length > 0) {
        const sortedWorkDates = workDatesBeforeStart.sort((a, b) => b.getTime() - a.getTime());
        doctorLastWorkDay[doc.id] = sortedWorkDates[0];
      }
    });

    // Initialize doctor statistics based on existing fixed entries
    if (existingFixedEntries) {
      existingFixedEntries.forEach(entry => {
        const entryDate = new Date(entry.date);
        if (entryDate >= startDate && entryDate <= endDate && entry.isFixed && 
            (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')) {
          const doctorId = entry.doctorId;
          const dayOfWeekKey = format(entryDate, 'EEE', { locale: enUS });
          const monthKey = format(entryDate, 'yyyy-MM');
          const isWeekend = weekendDayKeys.includes(dayOfWeekKey);
          
          // Update doctor statistics to account for fixed work assignments
          if (doctorStats[doctorId]) {
            doctorStats[doctorId].totalWorkdays++;
            doctorStats[doctorId].workloadByDayOfWeek[dayOfWeekKey]++;
            doctorStats[doctorId].monthlyWorkdays[monthKey] = (doctorStats[doctorId].monthlyWorkdays[monthKey] || 0) + 1;
            
            if (isWeekend && doctorWeekendDaysThisMonth[doctorId]) {
              doctorWeekendDaysThisMonth[doctorId][monthKey] = (doctorWeekendDaysThisMonth[doctorId][monthKey] || 0) + 1;
            }
          }
          
          // Only update doctorLastWorkDay for fixed entries that are BEFORE the start date
          // or at the start date, since we process chronologically and doctorLastWorkDay
          // should only track work days that have already been "processed"
          if (entryDate <= startDate && (!doctorLastWorkDay[doctorId] || entryDate > doctorLastWorkDay[doctorId])) {
            doctorLastWorkDay[doctorId] = new Date(entryDate);
          }
        }
      });
    }

    while (currentDateLoopVar <= finalEndDate) {
      const currentDate = new Date(currentDateLoopVar); 
      // Using enUS for dayOfWeekFullName for now, UI should format if needed with user's locale
      const dayOfWeekFullName = format(currentDate, 'EEEE', { locale: enUS }); 
      const dayOfWeekKey = format(currentDate, 'EEE', { locale: enUS });
      const currentMonthKey = format(currentDate, 'yyyy-MM');
      const isCurrentDayWeekend = weekendDayKeys.includes(dayOfWeekKey);

      // Check if this day already has a fixed assignment
      const existingFixedEntry = mockEntries.find(entry => 
        isSameDay(entry.date, currentDate) && entry.isFixed
      );
      
      // Update doctorLastWorkDay for fixed work assignments as we encounter them chronologically
      if (existingFixedEntry && (existingFixedEntry.assignment === 'Work' || existingFixedEntry.assignment === 'Pre-assigned')) {
        doctorLastWorkDay[existingFixedEntry.doctorId] = new Date(currentDate);
      }
      
      let dayHasAnyPreAssignment = false;
      let dayHasFixedAssignment = !!existingFixedEntry;
      
      for (const doctor of doctorsWithIds) {
          if (isDateInArray(currentDate, doctor.preAssignedWorkDates)) {
              // Check if this doctor already has a fixed entry on this date
              const doctorHasFixedEntryOnDate = mockEntries.some(entry => 
                  isSameDay(entry.date, currentDate) && 
                  entry.doctorId === doctor.id && 
                  entry.isFixed
              );
              
              // Only add pre-assigned entry if there's no fixed entry for this doctor on this date
              if (!doctorHasFixedEntryOnDate) {
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
                      doctorWeekendDaysThisMonth[doctor.id][currentMonthKey] = (doctorWeekendDaysThisMonth[doctor.id][currentMonthKey] || 0) + 1;
                  }
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
      if (!dayHasAnyPreAssignment && !dayHasFixedAssignment && doctorsWithIds.length > 0) {
        const eligibleDoctors = doctorsWithIds.filter(doc => {
            const isDoctorOnVacation = isDateInArray(currentDate, doc.vacationDates);
            const isDoctorExcludedOnDate = isDateInArray(currentDate, doc.excludedDates);
            const isFullyExcludedFromAuto = doc.isExcludedFromAutomaticAssignment;
            
            // Comprehensive minimum interval checking against ALL work commitments
            let respectsMinInterval = true;
            
            // Get all existing work commitments for this doctor
            const allWorkCommitments: Date[] = [];
            
            // Add pre-assigned work dates
            allWorkCommitments.push(...doc.preAssignedWorkDates);
            
            // Add fixed work assignments
            if (existingFixedEntries) {
              const fixedWorkDates = existingFixedEntries
                .filter(entry => entry.doctorId === doc.id && 
                               (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned'))
                .map(entry => new Date(entry.date));
              allWorkCommitments.push(...fixedWorkDates);
            }
            
            // Add already assigned work entries from current generation (in mockEntries)
            const currentlyAssignedWorkDates = mockEntries
              .filter(entry => entry.doctorId === doc.id && 
                             (entry.assignment === 'Work' || entry.assignment === 'Pre-assigned'))
              .map(entry => new Date(entry.date));
            allWorkCommitments.push(...currentlyAssignedWorkDates);
            
            // Check minimum interval against all work commitments
            for (const workDate of allWorkCommitments) {
              const daysDifference = Math.abs(differenceInCalendarDays(currentDate, workDate));
              if (daysDifference <= minIntervalBetweenWorkDays) {
                respectsMinInterval = false;
                break;
              }
            }

            return !isDoctorOnVacation && 
                   !isDoctorExcludedOnDate && 
                   respectsMinInterval &&
                   !isFullyExcludedFromAuto;
        });

        if (eligibleDoctors.length > 0) {
            eligibleDoctors.sort((a, b) => {
                const statsA = doctorStats[a.id];
                const statsB = doctorStats[b.id];
                const monthKeyForSort = currentMonthKey;

                if (statsA.totalWorkdays !== statsB.totalWorkdays) {
                    return statsA.totalWorkdays - statsB.totalWorkdays;
                }

                const dayOfWeekCountA = statsA.workloadByDayOfWeek[dayOfWeekKey] || 0;
                const dayOfWeekCountB = statsB.workloadByDayOfWeek[dayOfWeekKey] || 0;
                if (dayOfWeekCountA !== dayOfWeekCountB) {
                    return dayOfWeekCountA - dayOfWeekCountB;
                }

                const workdaysInCurrentMonthA = statsA.monthlyWorkdays[monthKeyForSort] || 0;
                const workdaysInCurrentMonthB = statsB.monthlyWorkdays[monthKeyForSort] || 0;
                const availableDaysThisMonthA = availableDaysPerDoctorPerMonth.get(a.id)?.get(monthKeyForSort) ?? 0;
                const availableDaysThisMonthB = availableDaysPerDoctorPerMonth.get(b.id)?.get(monthKeyForSort) ?? 0;

                const ratioA = availableDaysThisMonthA > 0 ? workdaysInCurrentMonthA / availableDaysThisMonthA : (workdaysInCurrentMonthA > 0 ? Infinity : 0);
                const ratioB = availableDaysThisMonthB > 0 ? workdaysInCurrentMonthB / availableDaysThisMonthB : (workdaysInCurrentMonthB > 0 ? Infinity : 0);

                if (ratioA !== ratioB) {
                    return ratioA - ratioB;
                }
                
                if (isCurrentDayWeekend) {
                    const weekendDaysWorkedA = doctorWeekendDaysThisMonth[a.id]?.[monthKeyForSort] || 0;
                    const weekendDaysWorkedB = doctorWeekendDaysThisMonth[b.id]?.[monthKeyForSort] || 0;

                    const canAWorkWeekendPreferably = weekendDaysWorkedA < 1;
                    const canBWorkWeekendPreferably = weekendDaysWorkedB < 1;

                    if (canAWorkWeekendPreferably && !canBWorkWeekendPreferably) return -1;
                    if (!canAWorkWeekendPreferably && canBWorkWeekendPreferably) return 1;
                    
                    if (weekendDaysWorkedA !== weekendDaysWorkedB) {
                        return weekendDaysWorkedA - weekendDaysWorkedB;
                    }
                }

                const lastWorkA_Time = doctorLastWorkDay[a.id]?.getTime();
                const lastWorkB_Time = doctorLastWorkDay[b.id]?.getTime();

                if (lastWorkA_Time === undefined && lastWorkB_Time !== undefined) return -1; 
                if (lastWorkA_Time !== undefined && lastWorkB_Time === undefined) return 1;  
                
                const idleTimeComparison = (lastWorkA_Time || 0) - (lastWorkB_Time || 0);
                if (idleTimeComparison !== 0) {
                    return idleTimeComparison;
                }
                return Math.random() - 0.5;
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
                    doctorWeekendDaysThisMonth[doctorToAssign.id][currentMonthKey] = (doctorWeekendDaysThisMonth[doctorToAssign.id][currentMonthKey] || 0) + 1;
                }
                automaticallyAssignedDoctorThisDay = true;
            }
        }
        
        if (!automaticallyAssignedDoctorThisDay && !dayHasAnyPreAssignment && !dayHasFixedAssignment) {
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
                 warnings.push({
                     key: 'warnings.uncoveredDay',
                     params: { date: new Date(currentDate) } // Pass original Date
                 });
            } else if (doctorsWithIds.length > 0 && !dayHasAnyPreAssignment && !automaticallyAssignedDoctorThisDay && !dayHasFixedAssignment) { 
                 mockEntries.push({
                    date: new Date(currentDate),
                    doctorId: 'system', 
                    assignment: 'Off',
                    dayOfWeek: dayOfWeekFullName,
                });
            }
        }

      } else if (!dayHasAnyPreAssignment && !dayHasFixedAssignment && doctorsWithIds.length === 0) { 
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