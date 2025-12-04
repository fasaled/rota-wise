import { generateSchedule } from '../lib/schedule-generator';
import type { ScheduleFormValues, ScheduleEntry, DoctorFormFieldInput } from '../lib/types';
import { addDays, subDays, differenceInCalendarDays, isSameDay, format } from 'date-fns';

describe('Schedule Generator', () => {
  const createBaseScheduleData = (overrides: Partial<ScheduleFormValues> = {}): ScheduleFormValues => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    
    return {
      numberOfDoctors: 3,
      startDate,
      endDate,
      minIntervalBetweenWorkDays: 1,
      doctors: [
        {
          id: 'doc1',
          name: 'Dr. Smith',
          vacationDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
        },
        {
          id: 'doc2',
          name: 'Dr. Johnson',
          vacationDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
        },
        {
          id: 'doc3',
          name: 'Dr. Williams',
          vacationDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
        },
      ],
      ...overrides,
    };
  };

  describe('Basic Functionality', () => {
    it('should generate a schedule with correct date range', () => {
      const data = createBaseScheduleData();
      const result = generateSchedule(data);

      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();
      expect(result.schedule!.startDate).toEqual(data.startDate);
      expect(result.schedule!.endDate).toEqual(data.endDate);
    });

    it('should create entries for all days in the date range', () => {
      const data = createBaseScheduleData();
      const result = generateSchedule(data);

      expect(result.schedule).toBeDefined();
      const entries = result.schedule!.entries;
      
      // Should have entries for 31 days (January 2024) with 3 doctors each
      // Plus vacation entries as needed
      const workOrOffEntries = entries.filter(e => 
        e.assignment === 'Work' || e.assignment === 'Off' || e.assignment === 'Pre-assigned'
      );
      
      // Should have at least one entry per day for work assignments
      const uniqueDates = new Set(entries.map(e => format(e.date, 'yyyy-MM-dd')));
      expect(uniqueDates.size).toBe(31); // All days in January
    });

    it('should handle empty doctor list', () => {
      const data = createBaseScheduleData({
        doctors: [],
        numberOfDoctors: 0,
      });
      const result = generateSchedule(data);

      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();
      
      // All days should be marked as 'Off' when no doctors
      const entries = result.schedule!.entries;
      entries.forEach(entry => {
        expect(entry.assignment).toBe('Off');
        expect(entry.doctorId).toBe('system');
      });
    });
  });

  describe('Minimum Interval Constraint', () => {
    it('should respect minimum interval between work days', () => {
      const data = createBaseScheduleData({
        minIntervalBetweenWorkDays: 2,
      });
      const result = generateSchedule(data);

      expect(result.schedule).toBeDefined();
      const workEntries = result.schedule!.entries.filter(
        e => e.assignment === 'Work' || e.assignment === 'Pre-assigned'
      );

      // Group by doctor and check intervals
      const doctorWorkDays = new Map<string, Date[]>();
      workEntries.forEach(entry => {
        if (!doctorWorkDays.has(entry.doctorId)) {
          doctorWorkDays.set(entry.doctorId, []);
        }
        doctorWorkDays.get(entry.doctorId)!.push(entry.date);
      });

      doctorWorkDays.forEach((workDays, doctorId) => {
        workDays.sort((a, b) => a.getTime() - b.getTime());
        
        for (let i = 1; i < workDays.length; i++) {
          const daysBetween = differenceInCalendarDays(workDays[i], workDays[i - 1]);
          expect(daysBetween).toBeGreaterThan(2); // minInterval = 2
        }
      });
    });

    it('should handle pre-assigned dates with minimum interval', () => {
      const startDate = new Date('2024-01-01');
      const preAssignedDate1 = new Date('2024-01-05');
      const preAssignedDate2 = new Date('2024-01-10');

      const data = createBaseScheduleData({
        startDate,
        endDate: new Date('2024-01-31'),
        minIntervalBetweenWorkDays: 3,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [preAssignedDate1, preAssignedDate2],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const doc1WorkEntries = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );

      doc1WorkEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Check that minimum interval is respected
      for (let i = 1; i < doc1WorkEntries.length; i++) {
        const daysBetween = differenceInCalendarDays(
          doc1WorkEntries[i].date,
          doc1WorkEntries[i - 1].date
        );
        expect(daysBetween).toBeGreaterThan(3);
      }
    });
  });

  describe('Vacation Dates Constraint', () => {
    it('should not assign work on vacation dates', () => {
      const vacationDate = new Date('2024-01-15');
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [vacationDate],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const vacationEntries = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && isSameDay(e.date, vacationDate)
      );

      expect(vacationEntries).toHaveLength(1);
      expect(vacationEntries[0].assignment).toBe('Vacation');
    });

    it('should create vacation entries for all vacation dates', () => {
      const vacationDates = [
        new Date('2024-01-10'),
        new Date('2024-01-15'),
        new Date('2024-01-20'),
      ];

      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates,
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      vacationDates.forEach(vacDate => {
        const vacationEntry = result.schedule!.entries.find(
          e => e.doctorId === 'doc1' && isSameDay(e.date, vacDate)
        );
        expect(vacationEntry).toBeDefined();
        expect(vacationEntry!.assignment).toBe('Vacation');
      });
    });
  });

  describe('Excluded Dates Constraint', () => {
    it('should not assign work on excluded dates', () => {
      const excludedDate = new Date('2024-01-12');
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [excludedDate],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const workOnExcludedDate = result.schedule!.entries.find(
        e => e.doctorId === 'doc1' && 
             isSameDay(e.date, excludedDate) && 
             (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );

      expect(workOnExcludedDate).toBeUndefined();
    });
  });

  describe('Pre-assigned Work Dates', () => {
    it('should honor pre-assigned work dates', () => {
      const preAssignedDate = new Date('2024-01-08');
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [preAssignedDate],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const preAssignedEntry = result.schedule!.entries.find(
        e => e.doctorId === 'doc1' && isSameDay(e.date, preAssignedDate)
      );

      expect(preAssignedEntry).toBeDefined();
      expect(preAssignedEntry!.assignment).toBe('Pre-assigned');
    });

    it('should warn about conflicting pre-assignments', () => {
      const conflictDate = new Date('2024-01-10');
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [conflictDate],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [conflictDate],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      
      const conflictWarning = result.warnings!.find(
        w => w.key === 'warnings.multiplePreAssignedInput'
      );
      expect(conflictWarning).toBeDefined();
    });
  });

  describe('Excluded from Automatic Assignment', () => {
    it('should not automatically assign excluded doctors', () => {
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: true,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const doc1AutoAssignments = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Work'
      );

      expect(doc1AutoAssignments).toHaveLength(0);
    });

    it('should still honor pre-assignments for excluded doctors', () => {
      const preAssignedDate = new Date('2024-01-15');
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [preAssignedDate],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: true,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const preAssignedEntry = result.schedule!.entries.find(
        e => e.doctorId === 'doc1' && isSameDay(e.date, preAssignedDate)
      );

      expect(preAssignedEntry).toBeDefined();
      expect(preAssignedEntry!.assignment).toBe('Pre-assigned');
    });
  });

  describe('Workload Distribution', () => {
    it('should distribute workload fairly among doctors', () => {
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc3',
            name: 'Dr. Williams',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const workEntries = result.schedule!.entries.filter(
        e => e.assignment === 'Work' || e.assignment === 'Pre-assigned'
      );

      const doctorWorkCounts = new Map<string, number>();
      workEntries.forEach(entry => {
        doctorWorkCounts.set(
          entry.doctorId,
          (doctorWorkCounts.get(entry.doctorId) || 0) + 1
        );
      });

      const workCounts = Array.from(doctorWorkCounts.values());
      const maxWork = Math.max(...workCounts);
      const minWork = Math.min(...workCounts);

      // Workload should be fairly distributed (difference shouldn't be too large)
      expect(maxWork - minWork).toBeLessThanOrEqual(2);
    });

    it('should handle uneven availability due to vacations', () => {
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [
              new Date('2024-01-10'),
              new Date('2024-01-11'),
              new Date('2024-01-12'),
              new Date('2024-01-13'),
              new Date('2024-01-14'),
            ],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const doc1WorkEntries = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );

      const doc2WorkEntries = result.schedule!.entries.filter(
        e => e.doctorId === 'doc2' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );

      // Doc2 should have more work days since Doc1 is on vacation
      expect(doc2WorkEntries.length).toBeGreaterThan(doc1WorkEntries.length);
    });
  });

  describe('Fixed Entries Integration', () => {
    it('should preserve existing fixed entries', () => {
      const fixedDate = new Date('2024-01-10');
      const fixedEntry: ScheduleEntry = {
        date: fixedDate,
        doctorId: 'doc1',
        assignment: 'Work',
        dayOfWeek: 'Wednesday',
        isFixed: true,
      };

      const data = createBaseScheduleData();
      const result = generateSchedule(data, [fixedEntry]);

      expect(result.schedule).toBeDefined();

      const preservedEntry = result.schedule!.entries.find(
        e => e.doctorId === 'doc1' && isSameDay(e.date, fixedDate) && e.isFixed
      );

      expect(preservedEntry).toBeDefined();
      expect(preservedEntry!.assignment).toBe('Work');
      expect(preservedEntry!.isFixed).toBe(true);
    });

    it('should consider fixed entries when calculating minimum intervals', () => {
      const fixedDate = new Date('2024-01-05');
      const fixedEntry: ScheduleEntry = {
        date: fixedDate,
        doctorId: 'doc1',
        assignment: 'Work',
        dayOfWeek: 'Friday',
        isFixed: true,
      };

      const data = createBaseScheduleData({
        minIntervalBetweenWorkDays: 3,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data, [fixedEntry]);
      expect(result.schedule).toBeDefined();

      const doc1WorkEntries = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );

      doc1WorkEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Verify minimum interval is respected including the fixed entry
      for (let i = 1; i < doc1WorkEntries.length; i++) {
        const daysBetween = differenceInCalendarDays(
          doc1WorkEntries[i].date,
          doc1WorkEntries[i - 1].date
        );
        expect(daysBetween).toBeGreaterThan(3);
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle single day schedule', () => {
      const singleDate = new Date('2024-01-15');
      const data = createBaseScheduleData({
        startDate: singleDate,
        endDate: singleDate,
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();
      expect(result.schedule!.entries.length).toBeGreaterThan(0);

      const workEntry = result.schedule!.entries.find(
        e => e.assignment === 'Work' || e.assignment === 'Pre-assigned'
      );
      expect(workEntry).toBeDefined();
    });

    it('should handle very large minimum intervals', () => {
      const data = createBaseScheduleData({
        minIntervalBetweenWorkDays: 10,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-15'),
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // With such a large interval, each doctor should work very few times
      const workEntries = result.schedule!.entries.filter(
        e => e.assignment === 'Work' || e.assignment === 'Pre-assigned'
      );

      const doctorWorkCounts = new Map<string, number>();
      workEntries.forEach(entry => {
        doctorWorkCounts.set(
          entry.doctorId,
          (doctorWorkCounts.get(entry.doctorId) || 0) + 1
        );
      });

      // With 15 days and minimum interval of 10, and 3 doctors, each doctor should work at most twice
      doctorWorkCounts.forEach(count => {
        expect(count).toBeLessThanOrEqual(2);
      });

      // Verify minimum intervals are respected
      const doctorWorkDays = new Map<string, Date[]>();
      workEntries.forEach(entry => {
        if (!doctorWorkDays.has(entry.doctorId)) {
          doctorWorkDays.set(entry.doctorId, []);
        }
        doctorWorkDays.get(entry.doctorId)!.push(entry.date);
      });

      doctorWorkDays.forEach((workDays, doctorId) => {
        workDays.sort((a, b) => a.getTime() - b.getTime());
        
        for (let i = 1; i < workDays.length; i++) {
          const daysBetween = differenceInCalendarDays(workDays[i], workDays[i - 1]);
          expect(daysBetween).toBeGreaterThan(10);
        }
      });
    });

    it('should generate warnings when no doctor can be assigned', () => {
      const data = createBaseScheduleData({
        minIntervalBetweenWorkDays: 1,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [new Date('2024-01-15')],
            preAssignedWorkDates: [new Date('2024-01-14'), new Date('2024-01-16')],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // Should have an "Off" entry for Jan 15 since doctor is on vacation
      // and adjacent days violate minimum interval
      const offEntry = result.schedule!.entries.find(
        e => isSameDay(e.date, new Date('2024-01-15')) && e.assignment === 'Off'
      );
      expect(offEntry).toBeDefined();
    });

    it('should handle invalid date ranges gracefully', () => {
      const data = createBaseScheduleData({
        startDate: new Date('2024-01-31'),
        endDate: new Date('2024-01-01'), // End before start
      });

      const result = generateSchedule(data);
      
      // Should still generate a schedule (the function handles this by iterating correctly)
      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();
    });
  });

  describe('Weekend and Day-of-Week Distribution', () => {
    it('should distribute weekend days fairly', () => {
      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'), // Monday
        endDate: new Date('2024-02-29'), // February 29, 2024 (leap year)
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const weekendWorkEntries = result.schedule!.entries.filter(
        e => (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
             (e.dayOfWeek === 'Friday' || e.dayOfWeek === 'Saturday' || e.dayOfWeek === 'Sunday')
      );

      const doctorWeekendCounts = new Map<string, number>();
      weekendWorkEntries.forEach(entry => {
        doctorWeekendCounts.set(
          entry.doctorId,
          (doctorWeekendCounts.get(entry.doctorId) || 0) + 1
        );
      });

      // Weekend work should be distributed fairly
      const weekendCounts = Array.from(doctorWeekendCounts.values());
      if (weekendCounts.length > 1) {
        const maxWeekend = Math.max(...weekendCounts);
        const minWeekend = Math.min(...weekendCounts);
        expect(maxWeekend - minWeekend).toBeLessThanOrEqual(2);
      }
    });

    it('should distribute work across all days of the week', () => {
      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const workEntries = result.schedule!.entries.filter(
        e => e.assignment === 'Work' || e.assignment === 'Pre-assigned'
      );

      const dayOfWeekCounts = new Map<string, number>();
      workEntries.forEach(entry => {
        dayOfWeekCounts.set(
          entry.dayOfWeek,
          (dayOfWeekCounts.get(entry.dayOfWeek) || 0) + 1
        );
      });

      // Should have work assignments for all days of the week
      const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      daysOfWeek.forEach(day => {
        expect(dayOfWeekCounts.has(day)).toBe(true);
        expect(dayOfWeekCounts.get(day)!).toBeGreaterThan(0);
      });
    });
  });

  describe('Complex Constraint Combinations', () => {
    it('should handle multiple constraints simultaneously', () => {
      const data = createBaseScheduleData({
        minIntervalBetweenWorkDays: 2,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [new Date('2024-01-10'), new Date('2024-01-11')],
            preAssignedWorkDates: [new Date('2024-01-05')],
            excludedDates: [new Date('2024-01-20')],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [new Date('2024-01-15')],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // Verify all constraints are respected
      const entries = result.schedule!.entries;

      // Check vacation entries
      const doc1VacationEntries = entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Vacation'
      );
      expect(doc1VacationEntries.length).toBe(2);

      // Check pre-assigned entries
      const preAssignedEntries = entries.filter(
        e => e.assignment === 'Pre-assigned'
      );
      expect(preAssignedEntries.length).toBe(2);

      // Check minimum intervals
      const doc1WorkEntries = entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      doc1WorkEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

      for (let i = 1; i < doc1WorkEntries.length; i++) {
        const daysBetween = differenceInCalendarDays(
          doc1WorkEntries[i].date,
          doc1WorkEntries[i - 1].date
        );
        expect(daysBetween).toBeGreaterThan(2);
      }

      // Check excluded dates
      const doc1WorkOnExcluded = entries.find(
        e => e.doctorId === 'doc1' &&
             isSameDay(e.date, new Date('2024-01-20')) &&
             (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(doc1WorkOnExcluded).toBeUndefined();
    });
  });

  describe('Global Monthly Shift Limit', () => {
    it('should respect pre-assigned shifts and not remove them when limit is exceeded', () => {
      // Doctor has 10 pre-assigned shifts in January, limit is 8
      // Expected: All 10 pre-assigned shifts should remain, no automatic assignments
      const preAssignedDates = [
        new Date('2024-01-02'),
        new Date('2024-01-05'),
        new Date('2024-01-08'),
        new Date('2024-01-11'),
        new Date('2024-01-14'),
        new Date('2024-01-17'),
        new Date('2024-01-20'),
        new Date('2024-01-23'),
        new Date('2024-01-26'),
        new Date('2024-01-29'),
      ];

      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        globalMonthlyShiftLimit: 8,
        minIntervalBetweenWorkDays: 1,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: preAssignedDates,
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // Verify all 10 pre-assigned shifts are present (not removed)
      const doc1PreAssigned = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Pre-assigned'
      );
      expect(doc1PreAssigned.length).toBe(10);

      // Verify doc1 has NO automatic assignments (because limit was exceeded by pre-assignments)
      const doc1AutoAssignments = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Work'
      );
      expect(doc1AutoAssignments.length).toBe(0);

      // Total work + pre-assigned for doc1 should be 10 (all pre-assigned, no automatic)
      const doc1TotalWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(doc1TotalWork.length).toBe(10);
    });

    it('should not add automatic shifts when monthly limit is reached', () => {
      // Doctor has 8 pre-assigned shifts, limit is 8
      // Expected: All 8 pre-assigned shifts, no automatic assignments
      const preAssignedDates = [
        new Date('2024-01-02'),
        new Date('2024-01-05'),
        new Date('2024-01-08'),
        new Date('2024-01-11'),
        new Date('2024-01-14'),
        new Date('2024-01-17'),
        new Date('2024-01-20'),
        new Date('2024-01-23'),
      ];

      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        globalMonthlyShiftLimit: 8,
        minIntervalBetweenWorkDays: 1,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: preAssignedDates,
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // Verify all 8 pre-assigned shifts are present
      const doc1PreAssigned = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Pre-assigned'
      );
      expect(doc1PreAssigned.length).toBe(8);

      // Verify doc1 has NO automatic assignments (limit reached)
      const doc1AutoAssignments = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Work'
      );
      expect(doc1AutoAssignments.length).toBe(0);

      // Total should be exactly 8
      const doc1TotalWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(doc1TotalWork.length).toBe(8);
    });

    it('should allow automatic assignments when pre-assigned shifts are below limit', () => {
      // Doctor has 5 pre-assigned shifts, limit is 8
      // Expected: 5 pre-assigned shifts + up to 3 automatic assignments (respecting interval)
      const preAssignedDates = [
        new Date('2024-01-02'),
        new Date('2024-01-06'),
        new Date('2024-01-10'),
        new Date('2024-01-14'),
        new Date('2024-01-18'),
      ];

      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        globalMonthlyShiftLimit: 8,
        minIntervalBetweenWorkDays: 2,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: preAssignedDates,
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // Verify all 5 pre-assigned shifts are present
      const doc1PreAssigned = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Pre-assigned'
      );
      expect(doc1PreAssigned.length).toBe(5);

      // Total work + pre-assigned should not exceed 8 (the limit)
      const doc1TotalWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(doc1TotalWork.length).toBeLessThanOrEqual(8);
      expect(doc1TotalWork.length).toBeGreaterThan(5); // Should have some automatic assignments
    });

    it('should handle multiple months with global monthly limit', () => {
      // Doctor has 10 pre-assigned shifts in January, 3 in February
      // Limit is 8 per month
      // Expected: All 10 in Jan (exceeds limit, no auto assignments in Jan)
      //           3 in Feb (below limit, can receive auto assignments in Feb)
      const janPreAssigned = [
        new Date('2024-01-02'),
        new Date('2024-01-05'),
        new Date('2024-01-08'),
        new Date('2024-01-11'),
        new Date('2024-01-14'),
        new Date('2024-01-17'),
        new Date('2024-01-20'),
        new Date('2024-01-23'),
        new Date('2024-01-26'),
        new Date('2024-01-29'),
      ];

      const febPreAssigned = [
        new Date('2024-02-02'),
        new Date('2024-02-06'),
        new Date('2024-02-10'),
      ];

      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-29'),
        globalMonthlyShiftLimit: 8,
        minIntervalBetweenWorkDays: 2,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            vacationDates: [],
            preAssignedWorkDates: [...janPreAssigned, ...febPreAssigned],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            vacationDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // January: should have all 10 pre-assigned, no automatic
      const doc1JanWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' &&
             (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
             e.date >= new Date('2024-01-01') && e.date <= new Date('2024-01-31')
      );

      const doc1JanPreAssigned = doc1JanWork.filter(e => e.assignment === 'Pre-assigned');
      const doc1JanAuto = doc1JanWork.filter(e => e.assignment === 'Work');

      expect(doc1JanPreAssigned.length).toBe(10);
      expect(doc1JanAuto.length).toBe(0); // No automatic because limit exceeded

      // February: should have 3 pre-assigned + potential automatic assignments (up to 5 more)
      const doc1FebWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' &&
             (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
             e.date >= new Date('2024-02-01') && e.date <= new Date('2024-02-29')
      );

      const doc1FebPreAssigned = doc1FebWork.filter(e => e.assignment === 'Pre-assigned');

      expect(doc1FebPreAssigned.length).toBe(3);
      expect(doc1FebWork.length).toBeLessThanOrEqual(8); // Should not exceed monthly limit
      expect(doc1FebWork.length).toBeGreaterThan(3); // Should have some automatic assignments
    });
  });
}); 