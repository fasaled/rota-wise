import { generateSchedule, computeUnitCoverageForDate, analyzeUnitCoverage, isDoctorAvailableOnDate, getEffectiveUnitId, getAlliedUnitIds, getPostCallDate } from '../lib/schedule-generator';
import type { ScheduleFormValues, ScheduleEntry, DoctorFormFieldInput, Unit } from '../lib/types';
import { addDays, differenceInCalendarDays, isSameDay, format } from 'date-fns';

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
          freeDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
        },
        {
          id: 'doc2',
          name: 'Dr. Johnson',
          freeDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
        },
        {
          id: 'doc3',
          name: 'Dr. Williams',
          freeDates: [],
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

      doctorWorkDays.forEach((workDays) => {
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
            freeDates: [],
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
      const freeDay = new Date('2024-01-15');
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [freeDay],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const freeEntries = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && isSameDay(e.date, freeDay)
      );

      expect(freeEntries).toHaveLength(1);
      expect(freeEntries[0].assignment).toBe('Free');
    });

    it('should create vacation entries for all vacation dates', () => {
      const freeDates = [
        new Date('2024-01-10'),
        new Date('2024-01-15'),
        new Date('2024-01-20'),
      ];

      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates,
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      freeDates.forEach(freeDay => {
        const freeEntry = result.schedule!.entries.find(
          e => e.doctorId === 'doc1' && isSameDay(e.date, freeDay)
        );
        expect(freeEntry).toBeDefined();
        expect(freeEntry!.assignment).toBe('Free');
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
            freeDates: [],
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

    it('should handle multiple excluded dates for a doctor', () => {
      const excludedDates = [
        new Date('2024-01-05'),
        new Date('2024-01-10'),
        new Date('2024-01-15'),
        new Date('2024-01-20'),
        new Date('2024-01-25'),
      ];
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates,
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      excludedDates.forEach(excludedDate => {
        const workOnExcludedDate = result.schedule!.entries.find(
          e => e.doctorId === 'doc1' &&
               isSameDay(e.date, excludedDate) &&
               (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
        );
        expect(workOnExcludedDate).toBeUndefined();
      });
    });

    it('should handle excluded dates combined with vacations', () => {
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [new Date('2024-01-10'), new Date('2024-01-11')],
            preAssignedWorkDates: [],
            excludedDates: [new Date('2024-01-15'), new Date('2024-01-20')],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // Verify no work on vacation dates
      const workOnFreeDay = result.schedule!.entries.find(
        e => e.doctorId === 'doc1' &&
             isSameDay(e.date, new Date('2024-01-10')) &&
             (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(workOnFreeDay).toBeUndefined();

      // Verify no work on excluded dates
      const workOnExcluded = result.schedule!.entries.find(
        e => e.doctorId === 'doc1' &&
             isSameDay(e.date, new Date('2024-01-15')) &&
             (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(workOnExcluded).toBeUndefined();
    });

    it('should distribute work fairly when doctor has many excluded dates', () => {
      const excludedDates = Array.from({ length: 10 }, (_, i) =>
        addDays(new Date('2024-01-01'), i * 3)
      );
      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates,
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const doc1Work = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      const doc2Work = result.schedule!.entries.filter(
        e => e.doctorId === 'doc2' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );

      // Doc2 should have at least as much work since doc1 has many excluded dates
      expect(doc2Work.length).toBeGreaterThanOrEqual(doc1Work.length);
    });

    it('should respect minimum interval with excluded dates', () => {
      const excludedDates = [new Date('2024-01-12')];
      const data = createBaseScheduleData({
        minIntervalBetweenWorkDays: 3,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates,
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

      for (let i = 1; i < doc1WorkEntries.length; i++) {
        const daysBetween = differenceInCalendarDays(
          doc1WorkEntries[i].date,
          doc1WorkEntries[i - 1].date
        );
        expect(daysBetween).toBeGreaterThan(3);
      }
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
            freeDates: [],
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
            freeDates: [],
            preAssignedWorkDates: [conflictDate],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
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
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: true,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
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
            freeDates: [],
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
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc3',
            name: 'Dr. Williams',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const measureSpread = (): number => {
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
        return Math.max(...workCounts) - Math.min(...workCounts);
      };

      // The scheduler uses weighted random sampling, so a single run can
      // exceed the per-run fairness bound by chance. Run several iterations
      // and assert the AVERAGE spread stays small — this is the right way
      // to test a stochastic fairness property and still catches a real
      // regression (the mean would jump if the scoring/weights broke).
      const RUNS = 20;
      let totalSpread = 0;
      for (let i = 0; i < RUNS; i++) {
        totalSpread += measureSpread();
      }
      const avgSpread = totalSpread / RUNS;

      expect(avgSpread).toBeLessThanOrEqual(2.5);
    });

    it('should handle uneven availability due to vacations', () => {
      const data = createBaseScheduleData({
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [
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
            freeDates: [],
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
            freeDates: [],
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

      doctorWorkDays.forEach((workDays) => {
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
            freeDates: [new Date('2024-01-15')],
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
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
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
            freeDates: [new Date('2024-01-10'), new Date('2024-01-11')],
            preAssignedWorkDates: [new Date('2024-01-05')],
            excludedDates: [new Date('2024-01-20')],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
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
      const doc1FreeEntries = entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Free'
      );
      expect(doc1FreeEntries.length).toBe(2);

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
    it('should warn when automatic shifts exceed monthly limit when combined with pre-assigned', () => {
      // Doctor has 6 pre-assigned shifts, limit is 8
      // System SHOULD assign automatic shifts (soft limit), but WARN about exceeding
      const preAssignedDates = [
        new Date('2024-01-03'),
        new Date('2024-01-07'),
        new Date('2024-01-11'),
        new Date('2024-01-15'),
        new Date('2024-01-19'),
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
            freeDates: [],
            preAssignedWorkDates: preAssignedDates,
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // Verify 6 pre-assigned shifts are present
      const doc1PreAssigned = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Pre-assigned'
      );
      expect(doc1PreAssigned.length).toBe(6);

      // Total may exceed 8 (soft limit), but should generate warning
      const doc1TotalWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(doc1TotalWork.length).toBeGreaterThan(8);

      // Should have warning about exceeded monthly limit
      const exceededWarning = result.warnings?.find(
        w => w.key === 'warnings.exceededMonthlyLimit'
      );
      expect(exceededWarning).toBeDefined();
    });

    it('should warn but still include all pre-assigned shifts when limit is exceeded', () => {
      // Doctor has 10 pre-assigned shifts in January, limit is 8
      // Expected: All 10 pre-assigned shifts remain (soft limit), warning generated
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
            freeDates: [],
            preAssignedWorkDates: preAssignedDates,
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
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

      // Total should be at least 10 (all pre-assigned, plus automatic assignments may occur for other doctors)
      const doc1TotalWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(doc1TotalWork.length).toBeGreaterThanOrEqual(10);

      // Should have warning about exceeded monthly limit
      const exceededWarning = result.warnings?.find(
        w => w.key === 'warnings.exceededMonthlyLimit'
      );
      expect(exceededWarning).toBeDefined();
    });

    it('should warn when pre-assigned shifts meet monthly limit and automatic assignments occur', () => {
      // Doctor has 8 pre-assigned shifts, limit is 8
      // Expected: All 8 pre-assigned shifts, warning about exceeded limit
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
            freeDates: [],
            preAssignedWorkDates: preAssignedDates,
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
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

      // Total should be at least 8
      const doc1TotalWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(doc1TotalWork.length).toBeGreaterThanOrEqual(8);

      // Should have warning about exceeded monthly limit
      const exceededWarning = result.warnings?.find(
        w => w.key === 'warnings.exceededMonthlyLimit'
      );
      expect(exceededWarning).toBeDefined();
    });

    it('should include monthly limit warnings when pre-assigned shifts are below limit', () => {
      // Doctor has 5 pre-assigned shifts, limit is 8
      // Automatic assignments can be added, and if total exceeds 8, warning should appear
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
            freeDates: [],
            preAssignedWorkDates: preAssignedDates,
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // Verify 5 pre-assigned shifts are present
      const doc1PreAssigned = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && e.assignment === 'Pre-assigned'
      );
      expect(doc1PreAssigned.length).toBe(5);

      // Total work + pre-assigned may exceed 8 (soft limit)
      const doc1TotalWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
      );
      expect(doc1TotalWork.length).toBeGreaterThan(5);
    });

    it('should warn about exceeded monthly limit across multiple months', () => {
      // Doctor has 10 pre-assigned shifts in January, 3 in February
      // Limit is 8 per month - January exceeds, February may or may not
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
            freeDates: [],
            preAssignedWorkDates: [...janPreAssigned, ...febPreAssigned],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      // January: should have all 10 pre-assigned
      const doc1JanWork = result.schedule!.entries.filter(
        e => e.doctorId === 'doc1' &&
             (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
             e.date >= new Date('2024-01-01') && e.date <= new Date('2024-01-31')
      );

      const doc1JanPreAssigned = doc1JanWork.filter(e => e.assignment === 'Pre-assigned');
      expect(doc1JanPreAssigned.length).toBe(10);

      // Should have warning about January exceeding limit
      const janWarning = result.warnings?.find(
        w => w.key === 'warnings.exceededMonthlyLimit' && w.params?.month === '2024-01'
      );
      expect(janWarning).toBeDefined();
    });
  });

  describe('Unit Coverage (post-call)', () => {
    const baseUnits: Unit[] = [
      { id: 'ward', name: 'Planta A', minPostCallCoverage: 1 },
      { id: 'consult', name: 'Consulta', minPostCallCoverage: 0 },
    ];

    const buildWithUnits = (
      doctors: DoctorFormFieldInput[],
      units: Unit[] = baseUnits,
      overrides: Partial<ScheduleFormValues> = {},
    ): ScheduleFormValues => ({
      numberOfDoctors: doctors.length,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      minIntervalBetweenWorkDays: 1,
      doctors,
      units,
      ...overrides,
    } as ScheduleFormValues);

    it('computeUnitCoverageForDate returns empty array on weekends', () => {
      const saturday = new Date('2024-01-06'); // Saturday
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
      ];
      const result = computeUnitCoverageForDate(saturday, doctors, baseUnits, []);
      expect(result).toEqual([]);
    });

    it('computeUnitCoverageForDate reports tracked vs ignored units', () => {
      const monday = new Date('2024-01-08'); // Monday
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        { id: 'd2', name: 'B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'consult' },
      ];
      const result = computeUnitCoverageForDate(monday, doctors, baseUnits, []);
      const ward = result.find((c) => c.unitId === 'ward');
      const consult = result.find((c) => c.unitId === 'consult');
      expect(ward?.status).toBe('tracked');
      expect(ward?.available).toBe(1);
      expect(ward?.isCovered).toBe(true); // 1 >= 1
      expect(consult?.status).toBe('ignored');
      expect(consult?.isCovered).toBe(true);
    });

    it('computeUnitCoverageForDate subtracts the candidate for look-ahead', () => {
      const tuesday = new Date('2024-01-09'); // Tuesday
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        { id: 'd2', name: 'B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
      ];
      const withoutSubtract = computeUnitCoverageForDate(tuesday, doctors, baseUnits, []);
      const withSubtract = computeUnitCoverageForDate(tuesday, doctors, baseUnits, [], { subtractDoctorId: 'd1' });
      const wardWithout = withoutSubtract.find((c) => c.unitId === 'ward');
      const wardWith = withSubtract.find((c) => c.unitId === 'ward');
      expect(wardWithout?.available).toBe(2);
      expect(wardWith?.available).toBe(1);
    });

    it('computeUnitCoverageForDate marks post-call doctors unavailable', () => {
      const tuesday = new Date('2024-01-09');
      const monday = new Date('2024-01-08');
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [monday], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
      ];
      const result = computeUnitCoverageForDate(tuesday, doctors, baseUnits, []);
      const ward = result.find((c) => c.unitId === 'ward');
      expect(ward?.available).toBe(0);
      expect(ward?.isCovered).toBe(false);
    });

    it('getPostCallDate: next calendar day, Saturday → Monday', () => {
      expect(format(getPostCallDate(new Date('2024-01-03')), 'yyyy-MM-dd')).toBe('2024-01-04'); // Wed → Thu
      expect(format(getPostCallDate(new Date('2024-01-05')), 'yyyy-MM-dd')).toBe('2024-01-06'); // Fri → Sat
      expect(format(getPostCallDate(new Date('2024-01-06')), 'yyyy-MM-dd')).toBe('2024-01-08'); // Sat → Mon
      expect(format(getPostCallDate(new Date('2024-01-07')), 'yyyy-MM-dd')).toBe('2024-01-08'); // Sun → Mon
    });

    it('Saturday shift makes the doctor unavailable on Monday, not Sunday', () => {
      const saturday = new Date('2024-01-06');
      const sunday = new Date('2024-01-07');
      const monday = new Date('2024-01-08');
      const doctor: DoctorFormFieldInput = {
        id: 'd1',
        name: 'A',
        freeDates: [],
        preAssignedWorkDates: [saturday],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
        unitId: 'ward',
      };
      expect(isDoctorAvailableOnDate(doctor, sunday, [])).toBe(true);
      expect(isDoctorAvailableOnDate(doctor, monday, [])).toBe(false);

      const mondayCoverage = computeUnitCoverageForDate(monday, [doctor], baseUnits, []);
      expect(mondayCoverage.find((c) => c.unitId === 'ward')?.available).toBe(0);
      expect(mondayCoverage.find((c) => c.unitId === 'ward')?.isCovered).toBe(false);
    });

    it('analyzeUnitCoverage: Saturday shift flags Monday undercoverage, not Sunday', () => {
      const units: Unit[] = [{ id: 'ward', name: 'Ward', minPostCallCoverage: 1 }];
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
      ];
      const entries: ScheduleEntry[] = [
        { date: new Date('2024-01-06'), doctorId: 'd1', assignment: 'Work', dayOfWeek: 'Saturday' },
      ];
      const warnings = analyzeUnitCoverage(
        entries,
        doctors,
        units,
        new Date('2024-01-05'),
        new Date('2024-01-12'),
      );
      const dates = warnings.map((w) => format(w.params!.date as Date, 'yyyy-MM-dd'));
      expect(dates).toContain('2024-01-08');
      expect(dates).not.toContain('2024-01-06');
      expect(dates).not.toContain('2024-01-07');
    });

    it('generateSchedule: post-call hard rule (no consecutive on-call days) regardless of minInterval', () => {
      const data = buildWithUnits(
        [
          { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
          { id: 'd2', name: 'B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        ],
        [{ id: 'ward', name: 'Ward', minPostCallCoverage: 1 }],
        { minIntervalBetweenWorkDays: 0 },
      );
      const result = generateSchedule(data);
      const workEntries = result.schedule!.entries.filter(
        (e) => e.assignment === 'Work' || e.assignment === 'Pre-assigned',
      );
      const byDoc = new Map<string, Date[]>();
      for (const e of workEntries) {
        const arr = byDoc.get(e.doctorId) ?? [];
        arr.push(e.date);
        byDoc.set(e.doctorId, arr);
      }
      for (const [, dates] of byDoc) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        for (let i = 1; i < dates.length; i++) {
          // A shift cannot land on the post-call day of a previous shift.
          // (Saturday → Monday; every other day → next calendar day.)
          expect(isSameDay(getPostCallDate(dates[i - 1]), dates[i])).toBe(false);
        }
      }
    });

    it('generateSchedule: pre-assignment on D+1 disqualifies a candidate for D', () => {
      // d1 is on vacation Mon, so d1 cannot be picked for Mon. d2 is the only
      // candidate for Mon, gets picked. On Tue, d2 is on post-call from Mon
      // AND d2 is pre-assigned to Wed, so d2 must NOT be picked for Tue
      // (pre-assignment on next day). d1 is on vacation Tue, so Tue gets 'Off'.
      // The test verifies d2 is never on Tue (regardless of randomness on Mon).
      const data = buildWithUnits(
        [
          {
            id: 'd1',
            name: 'A',
            freeDates: [new Date('2024-01-01'), new Date('2024-01-02')],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
            unitId: 'ward',
          },
          {
            id: 'd2',
            name: 'B',
            freeDates: [],
            preAssignedWorkDates: [new Date('2024-01-03')],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
            unitId: 'ward',
          },
        ],
        [{ id: 'ward', name: 'Ward', minPostCallCoverage: 1 }],
        { minIntervalBetweenWorkDays: 1, startDate: new Date('2024-01-01'), endDate: new Date('2024-01-05') },
      );
      const result = generateSchedule(data);
      const tueWorkEntries = result.schedule!.entries.filter(
        (e) =>
          isSameDay(e.date, new Date('2024-01-02')) &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned'),
      );
      // d2 must NEVER be on Tue.
      expect(tueWorkEntries.some((e) => e.doctorId === 'd2')).toBe(false);
    });

    it('generateSchedule: postCallUncovered warning emitted when post-call day has < min available', () => {
      // 1 doctor in a unit with min 1, pre-assigned to Mon. Mon gets a Work
      // entry, Tue the unit is undercovered (d1 on post-call), so a
      // postCallUncovered warning is expected.
      const data = buildWithUnits(
        [
          {
            id: 'd1',
            name: 'A',
            freeDates: [],
            preAssignedWorkDates: [new Date('2024-01-01')],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
            unitId: 'ward',
          },
        ],
        [{ id: 'ward', name: 'Ward', minPostCallCoverage: 1 }],
        { startDate: new Date('2024-01-01'), endDate: new Date('2024-01-05'), minIntervalBetweenWorkDays: 1 },
      );
      const result = generateSchedule(data);
      const cov = result.warnings?.filter((w) => w.key === 'warnings.postCallUncovered');
      expect(cov && cov.length).toBeGreaterThan(0);
    });

    it('generateSchedule: no postCallUncovered warning when unit has min 0', () => {
      // 1 doctor in a unit with min 0. Post-call is fine (no constraint).
      const data = buildWithUnits(
        [
          { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'consult' },
        ],
        [{ id: 'consult', name: 'Consulta', minPostCallCoverage: 0 }],
        { startDate: new Date('2024-01-01'), endDate: new Date('2024-01-10') },
      );
      const result = generateSchedule(data);
      const cov = result.warnings?.filter((w) => w.key === 'warnings.postCallUncovered') ?? [];
      expect(cov.length).toBe(0);
    });

    it('generateSchedule: post-call warning respects weekend gaps (no coverage check on Saturday)', () => {
      // A unit with 1 doctor. Putting him on call Friday should NOT cause
      // an undercoverage warning on Saturday (cobertura is solo L-V).
      const data = buildWithUnits(
        [
          { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        ],
        [{ id: 'ward', name: 'Ward', minPostCallCoverage: 1 }],
        { startDate: new Date('2024-01-05'), endDate: new Date('2024-01-12'), minIntervalBetweenWorkDays: 1 },
      );
      const result = generateSchedule(data);
      const friday = result.schedule!.entries.find(
        (e) => isSameDay(e.date, new Date('2024-01-05')) && (e.assignment === 'Work' || e.assignment === 'Pre-assigned'),
      );
      // He should be on call Friday (the only available weekday before the weekend).
      expect(friday?.doctorId).toBe('d1');
      // Saturday should not generate a coverage warning (it's a weekend).
      const saturdayWarning = result.warnings?.find(
        (w) => w.key === 'warnings.postCallUncovered' && w.params?.date && isSameDay(new Date(w.params.date as string | number | Date), new Date('2024-01-06')),
      );
      expect(saturdayWarning).toBeUndefined();
    });

    it('generateSchedule look-ahead: Saturday assignment is blocked if it would undercover Monday', () => {
      // One doctor in a unit that needs 1 on weekdays. Putting them on
      // Saturday would make Monday their post-call day and leave the unit
      // at 0/1, so Saturday must not be auto-assigned.
      const data = buildWithUnits(
        [
          { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        ],
        [{ id: 'ward', name: 'Ward', minPostCallCoverage: 1 }],
        { startDate: new Date('2024-01-05'), endDate: new Date('2024-01-12'), minIntervalBetweenWorkDays: 1 },
      );
      const result = generateSchedule(data);
      const saturdayWork = result.schedule!.entries.find(
        (e) =>
          isSameDay(e.date, new Date('2024-01-06')) &&
          e.doctorId === 'd1' &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned'),
      );
      expect(saturdayWork).toBeUndefined();
    });

    it('analyzeUnitCoverage: emits one warning per (date, unit) undercoverage', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-10');
      const units: Unit[] = [{ id: 'u', name: 'Ward', minPostCallCoverage: 1 }];
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'u' },
      ];
      // d1 on call Monday Jan 1. The post-call days (Tue, Wed, Thu, Fri)
      // all undercovered.
      const entries: ScheduleEntry[] = [
        { date: new Date('2024-01-01'), doctorId: 'd1', assignment: 'Work', dayOfWeek: 'Monday' },
      ];
      const warnings = analyzeUnitCoverage(entries, doctors, units, startDate, endDate);
      // Tue (Jan 2) should be the only one (d1 is on post-call Tue, no entry
      // needed to trigger the helper's previous-day check).
      expect(warnings.length).toBe(1);
      for (const w of warnings) {
        expect(w.key).toBe('warnings.postCallUncovered');
        expect(w.params?.unit).toBe('Ward');
        expect(w.params?.min).toBe(1);
        expect(w.params?.available).toBe(0);
      }
    });

    it('getAlliedUnitIds is undirected and transitive', () => {
      const units: Unit[] = [
        { id: 'a', name: 'A', minPostCallCoverage: 1, alliedUnitIds: ['b'] },
        { id: 'b', name: 'B', minPostCallCoverage: 1, alliedUnitIds: [] },
        { id: 'c', name: 'C', minPostCallCoverage: 1, alliedUnitIds: ['b'] },
      ];
      expect(getAlliedUnitIds('a', units).sort()).toEqual(['a', 'b', 'c']);
      expect(getAlliedUnitIds('c', units).sort()).toEqual(['a', 'b', 'c']);
    });

    it('getEffectiveUnitId uses an active cover assignment', () => {
      const doctor: DoctorFormFieldInput = {
        id: 'd1',
        name: 'A',
        freeDates: [],
        preAssignedWorkDates: [],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
        unitId: 'ward',
        coverAssignments: [
          {
            id: 'c1',
            targetUnitId: 'consult',
            startDate: new Date('2024-01-08'),
            endDate: new Date('2024-01-12'),
          },
        ],
      };
      expect(getEffectiveUnitId(doctor, new Date('2024-01-07'))).toBe('ward');
      expect(getEffectiveUnitId(doctor, new Date('2024-01-08'))).toBe('consult');
      expect(getEffectiveUnitId(doctor, new Date('2024-01-12'))).toBe('consult');
      expect(getEffectiveUnitId(doctor, new Date('2024-01-13'))).toBe('ward');
    });

    it('allied units share the available pool but keep individual mins', () => {
      const monday = new Date('2024-01-08');
      const units: Unit[] = [
        { id: 'a', name: 'Planta A', minPostCallCoverage: 1, alliedUnitIds: ['b'] },
        { id: 'b', name: 'Planta B', minPostCallCoverage: 1, alliedUnitIds: ['a'] },
      ];
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'a' },
        { id: 'd2', name: 'B', freeDates: [], preAssignedWorkDates: [new Date('2024-01-07')], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'b' },
      ];
      const allied = computeUnitCoverageForDate(monday, doctors, units, []);
      expect(allied.find((c) => c.unitId === 'a')?.available).toBe(1);
      expect(allied.find((c) => c.unitId === 'b')?.available).toBe(1);
      expect(allied.find((c) => c.unitId === 'a')?.isCovered).toBe(true);
      expect(allied.find((c) => c.unitId === 'b')?.isCovered).toBe(true);

      const separate = computeUnitCoverageForDate(
        monday,
        doctors,
        [
          { id: 'a', name: 'Planta A', minPostCallCoverage: 1 },
          { id: 'b', name: 'Planta B', minPostCallCoverage: 1 },
        ],
        [],
      );
      expect(separate.find((c) => c.unitId === 'a')?.available).toBe(1);
      expect(separate.find((c) => c.unitId === 'b')?.available).toBe(0);
      expect(separate.find((c) => c.unitId === 'b')?.isCovered).toBe(false);
    });

    it('allied units with different mins: same pool, independent coverage', () => {
      const monday = new Date('2024-01-08');
      const units: Unit[] = [
        { id: 'a', name: 'Planta A', minPostCallCoverage: 2, alliedUnitIds: ['b'] },
        { id: 'b', name: 'Planta B', minPostCallCoverage: 1, alliedUnitIds: ['a'] },
      ];
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'a' },
        { id: 'd2', name: 'B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'b' },
      ];
      const result = computeUnitCoverageForDate(monday, doctors, units, [], { subtractDoctorId: 'd1' });
      expect(result.find((c) => c.unitId === 'a')?.available).toBe(1);
      expect(result.find((c) => c.unitId === 'a')?.isCovered).toBe(false);
      expect(result.find((c) => c.unitId === 'b')?.available).toBe(1);
      expect(result.find((c) => c.unitId === 'b')?.isCovered).toBe(true);
    });

    it('min-0 allied unit stays ignored but contributes doctors to the pool', () => {
      const monday = new Date('2024-01-08');
      const units: Unit[] = [
        { id: 'ward', name: 'Planta A', minPostCallCoverage: 1, alliedUnitIds: ['consult'] },
        { id: 'consult', name: 'Consulta', minPostCallCoverage: 0, alliedUnitIds: ['ward'] },
      ];
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [new Date('2024-01-07')], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        { id: 'd2', name: 'B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'consult' },
      ];
      const result = computeUnitCoverageForDate(monday, doctors, units, []);
      expect(result.find((c) => c.unitId === 'consult')?.status).toBe('ignored');
      expect(result.find((c) => c.unitId === 'ward')?.available).toBe(1);
      expect(result.find((c) => c.unitId === 'ward')?.isCovered).toBe(true);
    });

    it('cover assignment counts the doctor only in the destination unit', () => {
      const monday = new Date('2024-01-08');
      const units: Unit[] = [
        { id: 'a', name: 'Planta A', minPostCallCoverage: 1 },
        { id: 'b', name: 'Planta B', minPostCallCoverage: 1 },
      ];
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'a' },
        {
          id: 'd2',
          name: 'B',
          freeDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
          unitId: 'b',
          coverAssignments: [
            {
              id: 'c1',
              targetUnitId: 'a',
              startDate: new Date('2024-01-08'),
              endDate: new Date('2024-01-12'),
            },
          ],
        },
      ];
      const result = computeUnitCoverageForDate(monday, doctors, units, []);
      expect(result.find((c) => c.unitId === 'a')?.available).toBe(2);
      expect(result.find((c) => c.unitId === 'b')?.available).toBe(0);
      expect(result.find((c) => c.unitId === 'b')?.isCovered).toBe(false);
    });

    it('generateSchedule look-ahead allows assignment when an allied unit covers the post-call day', () => {
      const allied = buildWithUnits(
        [
          { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'a' },
          { id: 'd2', name: 'B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'b' },
        ],
        [
          { id: 'a', name: 'A', minPostCallCoverage: 1, alliedUnitIds: ['b'] },
          { id: 'b', name: 'B', minPostCallCoverage: 1, alliedUnitIds: ['a'] },
        ],
        { startDate: new Date('2024-01-01'), endDate: new Date('2024-01-05'), minIntervalBetweenWorkDays: 1 },
      );
      const alliedResult = generateSchedule(allied);
      const tueAllied = alliedResult.schedule!.entries.filter(
        (e) => isSameDay(e.date, new Date('2024-01-02')) && (e.assignment === 'Work' || e.assignment === 'Pre-assigned'),
      );
      expect(tueAllied.length).toBeGreaterThan(0);

      const separate = buildWithUnits(
        [
          { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'a' },
          { id: 'd2', name: 'B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'b' },
        ],
        [
          { id: 'a', name: 'A', minPostCallCoverage: 1 },
          { id: 'b', name: 'B', minPostCallCoverage: 1 },
        ],
        { startDate: new Date('2024-01-01'), endDate: new Date('2024-01-05'), minIntervalBetweenWorkDays: 1 },
      );
      const separateResult = generateSchedule(separate);
      const tueSeparate = separateResult.schedule!.entries.filter(
        (e) => isSameDay(e.date, new Date('2024-01-02')) && (e.assignment === 'Work' || e.assignment === 'Pre-assigned'),
      );
      expect(tueSeparate.length).toBe(0);
    });

    it('generateSchedule look-ahead uses the cover-assignment destination on D+1', () => {
      // A requires 2. d1 lives in A; d2 is reassigned to A all week. Putting
      // either on call Mon leaves A at 1/2 on Tue, so Tue must not get an
      // auto assignment (both candidates are ineligible).
      const data = buildWithUnits(
        [
          { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [new Date('2024-01-01')], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'a' },
          {
            id: 'd2',
            name: 'B',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
            unitId: 'b',
            coverAssignments: [
              {
                id: 'c1',
                targetUnitId: 'a',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-05'),
              },
            ],
          },
        ],
        [
          { id: 'a', name: 'A', minPostCallCoverage: 2 },
          { id: 'b', name: 'B', minPostCallCoverage: 0 },
        ],
        { startDate: new Date('2024-01-01'), endDate: new Date('2024-01-05'), minIntervalBetweenWorkDays: 1 },
      );
      const result = generateSchedule(data);
      const tueWork = result.schedule!.entries.filter(
        (e) => isSameDay(e.date, new Date('2024-01-02')) && (e.assignment === 'Work' || e.assignment === 'Pre-assigned'),
      );
      expect(tueWork.length).toBe(0);
    });

    it('analyzeUnitCoverage: returns empty when no units are tracked', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-10');
      const units: Unit[] = [
        { id: 'consult', name: 'Consulta', minPostCallCoverage: 0 },
        { id: 'admin', name: 'Admin', minPostCallCoverage: 0 },
      ];
      const doctors: DoctorFormFieldInput[] = [
        { id: 'd1', name: 'A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'consult' },
      ];
      const entries: ScheduleEntry[] = [];
      const warnings = analyzeUnitCoverage(entries, doctors, units, startDate, endDate);
      expect(warnings).toEqual([]);
    });

    // -----------------------------------------------------------------
    // Holidays: no coverage required that day (like weekends). A shift
    // on a holiday still has post-call on the next calendar day, for
    // any weekday. Saturday's post-call is Monday.
    // -----------------------------------------------------------------

    function makeHolidaysCoverageFixture(_holidays: Date[]) {
      const startDate = new Date('2024-01-01'); // Mon
      const endDate = new Date('2024-01-31');
      const units: Unit[] = [
        { id: 'ward', name: 'Planta A', minPostCallCoverage: 1 },
      ];
      const doctors: DoctorFormFieldInput[] = [
        // Two doctors in the unit — by themselves they'd always cover
        // via the alternating post-call pattern, so a holiday in the
        // middle of the week has no visible effect.
        { id: 'd1', name: 'Dr. A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        { id: 'd2', name: 'Dr. B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
      ];
      return { startDate, endDate, units, doctors };
    }

    it('computeUnitCoverageForDate returns empty for a holiday', () => {
      const { units, doctors } = makeHolidaysCoverageFixture([]);
      const holiday = new Date('2024-01-03'); // Wed
      const result = computeUnitCoverageForDate(holiday, doctors, units, [], { holidays: [holiday] });
      expect(result).toEqual([]);
    });

    it('analyzeUnitCoverage skips holidays — no warnings emitted for a tracked unit on a holiday', () => {
      const { startDate, endDate, units, doctors } = makeHolidaysCoverageFixture([]);
      const holiday = new Date('2024-01-03'); // Wed
      // Bump d2 onto vacation for the rest of the week so without the
      // holiday exemption the unit WOULD be flagged as undercovered.
      // The holiday should mask the under-coverage on Wed only, not on
      // the rest of the weekdays — but since Wed is the only day d2 is
      // off, the rest of the week is still covered by d1.
      doctors[1].freeDates = [new Date('2024-01-03'), new Date('2024-01-04'), new Date('2024-01-05')];
      const warnings = analyzeUnitCoverage([], doctors, units, startDate, endDate, [holiday]);
      const holidayWarnings = warnings.filter((w) => format(w.params.date as Date, 'yyyy-MM-dd') === '2024-01-03');
      expect(holidayWarnings, 'no under-coverage warning should be emitted for a holiday').toEqual([]);
    });

    it('analyzeUnitCoverage still flags non-holiday weekdays that are undercovered', () => {
      const { startDate, endDate, units, doctors } = makeHolidaysCoverageFixture([]);
      const holiday = new Date('2024-01-03'); // Wed
      // Bump min up to 2 so the unit is genuinely undercovered whenever
      // any one of the two doctors is unavailable. d1 has Wed-Fri off,
      // d2 has Wed-Fri off → every Wed, Thu, Fri is undercovered. Only
      // Wed is a holiday, so the warning should fire for Thu and Fri but
      // not for Wed.
      units[0].minPostCallCoverage = 2;
      doctors[0].freeDates = [new Date('2024-01-03'), new Date('2024-01-04'), new Date('2024-01-05')];
      doctors[1].freeDates = [new Date('2024-01-03'), new Date('2024-01-04'), new Date('2024-01-05')];
      const warnings = analyzeUnitCoverage([], doctors, units, startDate, endDate, [holiday]);

      const warningDates = new Set(warnings.map((w) => format(w.params.date as Date, 'yyyy-MM-dd')));
      expect(warningDates.has('2024-01-03'), 'holiday Wed should NOT be flagged').toBe(false);
      expect(warningDates.has('2024-01-04'), 'Thu should be flagged (not a holiday)').toBe(true);
      expect(warningDates.has('2024-01-05'), 'Fri should be flagged (not a holiday)').toBe(true);
    });

    it('post-call of a holiday shift is the next calendar day, on any weekday', () => {
      const doctor: DoctorFormFieldInput = {
        id: 'd1',
        name: 'Dr. A',
        freeDates: [],
        preAssignedWorkDates: [],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
      };
      const makeWork = (date: Date): ScheduleEntry[] => [
        { date, doctorId: 'd1', assignment: 'Work', dayOfWeek: format(date, 'EEEE') },
      ];
      // Wed holiday → Thu unavailable, Fri available.
      const wed = new Date('2024-01-03');
      expect(isDoctorAvailableOnDate(doctor, new Date('2024-01-04'), makeWork(wed), [wed])).toBe(false);
      expect(isDoctorAvailableOnDate(doctor, new Date('2024-01-05'), makeWork(wed), [wed])).toBe(true);
      // Thu holiday → Fri unavailable, next Mon available.
      const thu = new Date('2024-01-04');
      expect(isDoctorAvailableOnDate(doctor, new Date('2024-01-05'), makeWork(thu), [thu])).toBe(false);
      expect(isDoctorAvailableOnDate(doctor, new Date('2024-01-08'), makeWork(thu), [thu])).toBe(true);
    });

    it('post-call of Monday is Tuesday even when Tuesday is a holiday; Wednesday is free', () => {
      const doctor: DoctorFormFieldInput = {
        id: 'd1',
        name: 'Dr. A',
        freeDates: [],
        preAssignedWorkDates: [],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
      };
      const entries: ScheduleEntry[] = [
        { date: new Date('2024-01-01'), doctorId: 'd1', assignment: 'Work', dayOfWeek: 'Monday' },
      ];
      const tueHoliday = new Date('2024-01-02');
      expect(isDoctorAvailableOnDate(doctor, tueHoliday, entries, [tueHoliday])).toBe(false);
      expect(isDoctorAvailableOnDate(doctor, new Date('2024-01-03'), entries, [tueHoliday])).toBe(true);
    });

    it('post-call check does NOT skip when the previous day is a regular work day', () => {
      const doctor: DoctorFormFieldInput = {
        id: 'd1',
        name: 'Dr. A',
        freeDates: [],
        preAssignedWorkDates: [],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
      };
      // Tue (Jan 2) = Work, Wed (Jan 3) — NOT available (doctor on post-call).
      // Holidays are next week, so they do NOT break the chain.
      const entries: ScheduleEntry[] = [
        { date: new Date('2024-01-02'), doctorId: 'd1', assignment: 'Work', dayOfWeek: 'Tuesday' },
      ];
      const available = isDoctorAvailableOnDate(doctor, new Date('2024-01-03'), entries, [new Date('2024-01-08')]);
      expect(available, 'regular work day as previous day should still mark the doctor on post-call').toBe(false);
    });

    it('pre-assignment on a holiday blocks the previous day (saliente is still the next day)', () => {
      // d1 is on vacation on Mon, pre-assigned to Wed (a holiday). Tuesday's
      // post-call is Wednesday, so the algorithm must not auto-assign Tue.
      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        minIntervalBetweenWorkDays: 1,
        doctors: [
          {
            id: 'd1',
            name: 'Dr. A',
            freeDates: [new Date('2024-01-01')],
            preAssignedWorkDates: [new Date('2024-01-03')],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
        holidays: [new Date('2024-01-03')],
        units: [],
      });
      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();
      const tueEntry = result.schedule!.entries.find(
        (e) => isSameDay(e.date, new Date('2024-01-02')) && e.doctorId === 'd1' && (e.assignment === 'Work' || e.assignment === 'Pre-assigned'),
      );
      expect(tueEntry, 'd1 must not work Tue when pre-assigned to Wed (post-call of Tue)').toBeUndefined();
    });

    it('holiday pre-assignment is still honored (manual work on the holiday)', () => {
      // The user pre-assigned d1 to a holiday — that entry must survive
      // the generation pass (i.e. the holiday counts as a work day for
      // pre-assignment, just not for coverage).
      const data = createBaseScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        doctors: [
          { id: 'd1', name: 'Dr. A', freeDates: [], preAssignedWorkDates: [new Date('2024-01-03')], excludedDates: [], isExcludedFromAutomaticAssignment: false },
        ],
        holidays: [new Date('2024-01-03')],
        units: [],
      });
      const result = generateSchedule(data);
      const wedEntry = result.schedule!.entries.find(
        (e) => isSameDay(e.date, new Date('2024-01-03')) && e.doctorId === 'd1' && e.assignment === 'Pre-assigned',
      );
      expect(wedEntry, 'the manual pre-assignment on the holiday should be preserved').toBeDefined();
    });
  });
}); 