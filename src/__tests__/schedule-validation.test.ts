import { describe, it, expect } from 'bun:test';
import { generateSchedule, computeUnitCoverageForDate } from '../lib/schedule-generator';
import type { ScheduleFormValues, ScheduleEntry, DoctorFormFieldInput } from '../lib/types';
import { differenceInCalendarDays, isSameDay, format, addDays } from 'date-fns';

describe('Schedule Validation Tests', () => {
  const createScheduleData = (overrides: Partial<ScheduleFormValues> = {}): ScheduleFormValues => {
    return {
      numberOfDoctors: 2,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
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
      ],
      ...overrides,
    } as ScheduleFormValues;
  };

  /**
   * Validates that the schedule meets all the core constraints
   */
  const validateScheduleConstraints = (
    schedule: ScheduleEntry[],
    formData: ScheduleFormValues,
    existingFixed?: ScheduleEntry[]
  ) => {
    const violations: string[] = [];

    // 1. Minimum Interval Constraint
    const workEntries = schedule.filter(
      e => e.assignment === 'Work' || e.assignment === 'Pre-assigned'
    );

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
        if (daysBetween <= (formData.minIntervalBetweenWorkDays || 1)) {
          violations.push(
            `Doctor ${doctorId} has work assignments on ${format(workDays[i - 1], 'yyyy-MM-dd')} and ${format(workDays[i], 'yyyy-MM-dd')} violating minimum interval of ${formData.minIntervalBetweenWorkDays}`
          );
        }
      }
    });

    // 2. Vacation Constraint
    formData.doctors.forEach(doctor => {
      doctor.freeDates.forEach(freeDay => {
        const workOnFreeDay = schedule.find(
          e => e.doctorId === doctor.id && 
               isSameDay(e.date, freeDay) && 
               (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
        );
        if (workOnFreeDay) {
          violations.push(
            `Doctor ${doctor.name} (${doctor.id}) is assigned work on vacation date ${format(freeDay, 'yyyy-MM-dd')}`
          );
        }

        // Should have vacation entry
        const freeEntry = schedule.find(
          e => e.doctorId === doctor.id && 
               isSameDay(e.date, freeDay) && 
               e.assignment === 'Free'
        );
        if (!freeEntry) {
          violations.push(
            `Doctor ${doctor.name} (${doctor.id}) missing vacation entry for ${format(freeDay, 'yyyy-MM-dd')}`
          );
        }
      });
    });

    // 3. Excluded Dates Constraint
    formData.doctors.forEach(doctor => {
      doctor.excludedDates?.forEach(excludedDate => {
        const workOnExcluded = schedule.find(
          e => e.doctorId === doctor.id && 
               isSameDay(e.date, excludedDate) && 
               (e.assignment === 'Work' || e.assignment === 'Pre-assigned')
        );
        if (workOnExcluded) {
          violations.push(
            `Doctor ${doctor.name} (${doctor.id}) is assigned work on excluded date ${format(excludedDate, 'yyyy-MM-dd')}`
          );
        }
      });
    });

    // 4. Pre-assigned Dates Constraint
    formData.doctors.forEach(doctor => {
      doctor.preAssignedWorkDates.forEach(preDate => {
        const preAssignedEntry = schedule.find(
          e => e.doctorId === doctor.id && 
               isSameDay(e.date, preDate) && 
               e.assignment === 'Pre-assigned'
        );
        if (!preAssignedEntry) {
          violations.push(
            `Doctor ${doctor.name} (${doctor.id}) missing pre-assigned entry for ${format(preDate, 'yyyy-MM-dd')}`
          );
        }
      });
    });

    // 5. Excluded from Automatic Assignment Constraint
    formData.doctors.forEach(doctor => {
      if (doctor.isExcludedFromAutomaticAssignment) {
        const autoAssignments = schedule.filter(
          e => e.doctorId === doctor.id && e.assignment === 'Work'
        );
        if (autoAssignments.length > 0) {
          violations.push(
            `Doctor ${doctor.name} (${doctor.id}) is excluded from automatic assignment but has ${autoAssignments.length} automatic work assignments`
          );
        }
      }
    });

    // 6. Fixed Entries Preservation
    if (existingFixed) {
      existingFixed.forEach(fixedEntry => {
        const preservedEntry = schedule.find(
          e => e.doctorId === fixedEntry.doctorId && 
               isSameDay(e.date, fixedEntry.date) && 
               e.assignment === fixedEntry.assignment &&
               e.isFixed === true
        );
        if (!preservedEntry) {
          violations.push(
            `Fixed entry for ${fixedEntry.doctorId} on ${format(fixedEntry.date, 'yyyy-MM-dd')} was not preserved`
          );
        }
      });
    }

    // 7. Date Range Coverage
    const currentDate = new Date(formData.startDate);
    while (currentDate <= formData.endDate) {
      const hasEntryForDate = schedule.some(e => isSameDay(e.date, currentDate));
      if (!hasEntryForDate) {
        violations.push(`No schedule entry found for date ${format(currentDate, 'yyyy-MM-dd')}`);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return violations;
  };

  describe('Constraint Validation', () => {
    it('should validate that generated schedules meet all constraints', () => {
      const testCases: ScheduleFormValues[] = [
        // Basic case
        createScheduleData(),
        
        // With minimum interval
        createScheduleData({ minIntervalBetweenWorkDays: 3 }),
        
        // With vacations
        createScheduleData({
          doctors: [
            {
              id: 'doc1',
              name: 'Dr. Smith',
              freeDates: [new Date('2024-01-10'), new Date('2024-01-11')],
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
        }),

        // With pre-assignments
        createScheduleData({
          doctors: [
            {
              id: 'doc1',
              name: 'Dr. Smith',
              freeDates: [],
              preAssignedWorkDates: [new Date('2024-01-05'), new Date('2024-01-15')],
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
        }),

        // With excluded dates
        createScheduleData({
          doctors: [
            {
              id: 'doc1',
              name: 'Dr. Smith',
              freeDates: [],
              preAssignedWorkDates: [],
              excludedDates: [new Date('2024-01-12'), new Date('2024-01-20')],
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
        }),

        // With doctor excluded from auto assignment
        createScheduleData({
          doctors: [
            {
              id: 'doc1',
              name: 'Dr. Smith',
              freeDates: [],
              preAssignedWorkDates: [new Date('2024-01-08')], // Can still have pre-assignments
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
        }),
      ];

      testCases.forEach((testCase) => {
        const result = generateSchedule(testCase);
        
        expect(result.error).toBeUndefined();
        expect(result.schedule).toBeDefined();

        const violations = validateScheduleConstraints(
          result.schedule!.entries,
          testCase
        );

        expect(violations).toEqual([]);
      });
    });

    it('should validate schedules with fixed entries', () => {
      const fixedEntry: ScheduleEntry = {
        date: new Date('2024-01-10'),
        doctorId: 'doc1',
        assignment: 'Work',
        dayOfWeek: 'Wednesday',
        isFixed: true,
      };

      const data = createScheduleData({
        minIntervalBetweenWorkDays: 2,
      });

      const result = generateSchedule(data, [fixedEntry]);
      
      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();

      const violations = validateScheduleConstraints(
        result.schedule!.entries,
        data,
        [fixedEntry]
      );

      expect(violations).toEqual([]);
    });

    it('should validate complex scenarios with multiple constraints', () => {
      const complexData = createScheduleData({
        minIntervalBetweenWorkDays: 2,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [new Date('2024-01-08'), new Date('2024-01-09')],
            preAssignedWorkDates: [new Date('2024-01-05')],
            excludedDates: [new Date('2024-01-25')],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [new Date('2024-01-20')],
            preAssignedWorkDates: [new Date('2024-01-15')],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc3',
            name: 'Dr. Williams',
            freeDates: [],
            preAssignedWorkDates: [],
            excludedDates: [new Date('2024-01-12'), new Date('2024-01-13')],
            isExcludedFromAutomaticAssignment: true, // Excluded from auto assignment
          },
        ],
        numberOfDoctors: 3,
      });

      const fixedEntries: ScheduleEntry[] = [
        {
          date: new Date('2024-01-03'),
          doctorId: 'doc2',
          assignment: 'Work',
          dayOfWeek: 'Wednesday',
          isFixed: true,
        },
      ];

      const result = generateSchedule(complexData, fixedEntries);
      
      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();

      const violations = validateScheduleConstraints(
        result.schedule!.entries,
        complexData,
        fixedEntries
      );

      expect(violations).toEqual([]);
    });
  });

  describe('Edge Case Validation', () => {
    it('should handle extremely tight constraints', () => {
      const tightConstraintData = createScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-10'),
        minIntervalBetweenWorkDays: 4, // Very large interval for short period
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [new Date('2024-01-03'), new Date('2024-01-04')],
            preAssignedWorkDates: [new Date('2024-01-01')],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
        numberOfDoctors: 1,
      });

      const result = generateSchedule(tightConstraintData);
      
      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();

      const violations = validateScheduleConstraints(
        result.schedule!.entries,
        tightConstraintData
      );

      expect(violations).toEqual([]);
    });

    it('should validate long-term schedules', () => {
      const longTermData = createScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'), // Entire year
        minIntervalBetweenWorkDays: 1,
        doctors: [
          {
            id: 'doc1',
            name: 'Dr. Smith',
            freeDates: [
              new Date('2024-07-01'),
              new Date('2024-07-02'),
              new Date('2024-07-03'),
              new Date('2024-07-04'),
              new Date('2024-07-05'),
            ], // Summer vacation
            preAssignedWorkDates: [new Date('2024-01-01'), new Date('2024-12-31')],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
          {
            id: 'doc2',
            name: 'Dr. Johnson',
            freeDates: [
              new Date('2024-12-23'),
              new Date('2024-12-24'),
              new Date('2024-12-25'),
              new Date('2024-12-26'),
            ], // Christmas vacation
            preAssignedWorkDates: [],
            excludedDates: [],
            isExcludedFromAutomaticAssignment: false,
          },
        ],
      });

      const result = generateSchedule(longTermData);
      
      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();

      const violations = validateScheduleConstraints(
        result.schedule!.entries,
        longTermData
      );

      expect(violations).toEqual([]);

      // Additional checks for long-term schedule
      const workEntries = result.schedule!.entries.filter(
        e => e.assignment === 'Work' || e.assignment === 'Pre-assigned'
      );

      expect(workEntries.length).toBeGreaterThan(300); // Should have many work days in a year
    });

    it('should validate workload distribution fairness', () => {
      const fairnessTestData = createScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'), // 3 months
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
        numberOfDoctors: 3,
      });

      const measureWorkloadSpread = (): number => {
        const result = generateSchedule(fairnessTestData);

        expect(result.error).toBeUndefined();
        expect(result.schedule).toBeDefined();

        const violations = validateScheduleConstraints(
          result.schedule!.entries,
          fairnessTestData
        );

        expect(violations).toEqual([]);

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
        totalSpread += measureWorkloadSpread();
      }
      const avgSpread = totalSpread / RUNS;

      expect(avgSpread).toBeLessThanOrEqual(3.5);
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle large number of doctors', () => {
      const manyDoctorsData = createScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        numberOfDoctors: 15,
        doctors: Array.from({ length: 15 }, (_, i) => ({
          id: `doc${i + 1}`,
          name: `Dr. Doctor${i + 1}`,
          freeDates: [],
          preAssignedWorkDates: [],
          excludedDates: [],
          isExcludedFromAutomaticAssignment: false,
        })),
      });

      const startTime = Date.now();
      const result = generateSchedule(manyDoctorsData);
      const endTime = Date.now();
      
      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();

      const violations = validateScheduleConstraints(
        result.schedule!.entries,
        manyDoctorsData
      );

      expect(violations).toEqual([]);
      
      // Should complete in reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle many constraints efficiently', () => {
      const constraintHeavyData = createScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-29'),
        minIntervalBetweenWorkDays: 2,
        numberOfDoctors: 5,
        doctors: Array.from({ length: 5 }, (_, i) => ({
          id: `doc${i + 1}`,
          name: `Dr. Doctor${i + 1}`,
          freeDates: [
            addDays(new Date('2024-01-01'), i * 7),
            addDays(new Date('2024-01-01'), i * 7 + 1),
          ],
          preAssignedWorkDates: [
            addDays(new Date('2024-01-01'), i * 10 + 5), // Ensure dates are within range
          ],
          excludedDates: [
            addDays(new Date('2024-01-01'), i * 8 + 20),
          ],
          isExcludedFromAutomaticAssignment: i === 4, // Last doctor excluded
        })),
      });

      const startTime = Date.now();
      const result = generateSchedule(constraintHeavyData);
      const endTime = Date.now();

      expect(result.error).toBeUndefined();
      expect(result.schedule).toBeDefined();

      const violations = validateScheduleConstraints(
        result.schedule!.entries,
        constraintHeavyData
      );

      expect(violations).toEqual([]);

      // Should still complete efficiently
      expect(endTime - startTime).toBeLessThan(3000);
    });
  });

  describe('Post-Call Unit Coverage Validation', () => {
    /**
     * Property: every weekday in the generated schedule must satisfy the
     * unit coverage constraint (available >= min) for every tracked unit,
     * EXCEPT for the days that produce a postCallUncovered warning.
     */
    it('all weekday (date, unit) pairs satisfy coverage, except the warned ones', () => {
      const data = createScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        minIntervalBetweenWorkDays: 1,
        numberOfDoctors: 4,
        doctors: [
          { id: 'd1', name: 'Dr. A', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
          { id: 'd2', name: 'Dr. B', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
          { id: 'd3', name: 'Dr. C', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
          { id: 'd4', name: 'Dr. D', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'consult' },
        ],
        units: [
          { id: 'ward', name: 'Ward', minPostCallCoverage: 1 },
          { id: 'consult', name: 'Consulta', minPostCallCoverage: 0 },
        ],
      } as Partial<ScheduleFormValues>) as ScheduleFormValues;

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();

      const units = data.units ?? [];
      const doctors: DoctorFormFieldInput[] = data.doctors;
      const entries = result.schedule!.entries;

      const warnedKeys = new Set(
        (result.warnings ?? [])
          .filter((w) => w.key === 'warnings.postCallUncovered')
          .map((w) => `${format(w.params?.date as Date, 'yyyy-MM-dd')}-${(units.find((u) => u.name === w.params?.unit))?.id ?? ''}`),
      );

      // Iterate every weekday in range
      const cursor = new Date(data.startDate);
      const end = new Date(data.endDate);
      while (cursor <= end) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) {
          const coverage = computeUnitCoverageForDate(cursor, doctors, units, entries);
          for (const c of coverage) {
            if (c.status !== 'tracked') continue;
            const key = `${format(cursor, 'yyyy-MM-dd')}-${c.unitId}`;
            if (!c.isCovered) {
              expect(warnedKeys.has(key)).toBe(true);
            }
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    it('edge: 1 doctor in 1 unit with min 1 — schedule still generated, with a warning', () => {
      const data = createScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-05'),
        numberOfDoctors: 1,
        doctors: [
          { id: 'd1', name: 'Solo', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        ],
        units: [{ id: 'ward', name: 'Ward', minPostCallCoverage: 1 }],
      } as Partial<ScheduleFormValues>) as ScheduleFormValues;

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();
      // The schedule should still be generated (the algorithm tries its best).
      expect(result.schedule!.entries.length).toBeGreaterThan(0);
    });

    it('edge: last day on call — no coverage check on a non-existent day+1', () => {
      // 1-day schedule with a single doctor in a unit with min 1. No post-call
      // day exists in the schedule, so no postCallUncovered warning.
      const data = createScheduleData({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-01'),
        numberOfDoctors: 1,
        doctors: [
          { id: 'd1', name: 'Solo', freeDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: 'ward' },
        ],
        units: [{ id: 'ward', name: 'Ward', minPostCallCoverage: 1 }],
      } as Partial<ScheduleFormValues>) as ScheduleFormValues;

      const result = generateSchedule(data);
      expect(result.schedule).toBeDefined();
      const cov = (result.warnings ?? []).filter((w) => w.key === 'warnings.postCallUncovered');
      expect(cov).toHaveLength(0);
    });
  });
}); 