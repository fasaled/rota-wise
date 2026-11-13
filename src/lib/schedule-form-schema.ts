import { z } from 'zod';

// Validation messages are i18n keys (see `validation.*` in src/locales).
import { generateId } from '@/lib/utils';

const unitSchema = z.object({
  id: z.string().default(() => generateId()),
  name: z.string().min(1, { message: "validation.unitNameRequired" }),
  minPostCallCoverage: z.coerce.number().int().min(0, "validation.coverageNegative").max(20, "validation.coverageMax").default(0),
  alliedUnitIds: z.array(z.string()).optional(),
});

const coverAssignmentSchema = z.object({
  id: z.string().default(() => generateId()),
  targetUnitId: z.string().default(''),
  startDate: z.date(),
  endDate: z.date(),
}).refine((a) => a.endDate >= a.startDate, {
  message: "validation.endBeforeStart",
  path: ["endDate"],
});

const doctorSchema = z.object({
  id: z.string().default(() => generateId()),
  name: z.string().min(1, { message: "validation.nameRequired" }),
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
    message: "validation.numberOfDoctors"
  }),
  startDate: z.date({ required_error: "validation.startDateRequired" }),
  endDate: z.date({ required_error: "validation.endDateRequired" }),
  minIntervalBetweenWorkDays: z.coerce.number().int().min(0, "validation.intervalNegative").max(30, "validation.intervalMax").optional().default(1),
  globalMonthlyShiftLimit: z.coerce.number().int().min(0, "validation.limitNegative").max(31, "validation.limitMax").optional(),
  enforceMonthlyLimit: z.boolean().optional(),
  doctors: z.array(doctorSchema).min(0, "validation.doctorsInvalid"),
  units: z.array(unitSchema).default([]),
  holidays: z.array(z.date()).default([]),
}).refine(data => data.endDate >= data.startDate, {
  message: "validation.endBeforeStart",
  path: ["endDate"],
});
