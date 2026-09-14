import { z } from 'zod';
import { generateId } from '@/lib/utils';

const unitSchema = z.object({
  id: z.string().default(() => generateId()),
  name: z.string().min(1, { message: "Unit name is required." }),
  minPostCallCoverage: z.coerce.number().int().min(0, "Minimum coverage cannot be negative.").max(20, "Minimum coverage cannot exceed 20.").default(0),
  alliedUnitIds: z.array(z.string()).optional(),
});

const coverAssignmentSchema = z.object({
  id: z.string().default(() => generateId()),
  targetUnitId: z.string().default(''),
  startDate: z.date(),
  endDate: z.date(),
});

const doctorSchema = z.object({
  id: z.string().default(() => generateId()),
  name: z.string().min(1, { message: "Name is required." }),
  freeDates: z.array(z.date()).default([]),
  preAssignedWorkDates: z.array(z.date()).default([]),
  excludedDates: z.array(z.date()).default([]),
  isExcludedFromAutomaticAssignment: z.boolean().optional().default(false),
  unitId: z.string().optional(),
  coverAssignments: z.array(coverAssignmentSchema).optional(),
});

export const scheduleFormSchema = z.object({
  numberOfDoctors: z.union([
    z.string().transform((val) => val === "" ? 0 : parseInt(val, 10)),
    z.number()
  ]).refine((val) => !isNaN(val) && val >= 0 && val <= 20, {
    message: "Number of doctors must be between 0 and 20, or empty (treated as 0)."
  }),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date({ required_error: "End date is required." }),
  minIntervalBetweenWorkDays: z.coerce.number().int().min(0, "Minimum interval cannot be negative.").max(30, "Interval cannot exceed 30 days.").optional().default(1),
  globalMonthlyShiftLimit: z.coerce.number().int().min(0, "Monthly shift limit cannot be negative.").max(31, "Limit cannot exceed 31 days.").optional(),
  doctors: z.array(doctorSchema).min(0, "Doctor details array cannot be negative."),
  units: z.array(unitSchema).default([]),
  holidays: z.array(z.date()).default([]),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before start date.",
  path: ["endDate"],
});
