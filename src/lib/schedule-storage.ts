import { z } from 'zod';
import { CURRENT_FILE_VERSION } from './types';
import type {
  ScheduleFormValues,
  Schedule,
  ScheduleEntry,
  AppFileData,
  DoctorFormFieldInput,
  SerializedDoctorFormFieldInput,
  SerializedScheduleEntry,
  Unit,
  UnitCoverAssignment,
  SerializedUnitCoverAssignment,
} from './types';
import { generateId } from './utils';
import { isValidDate, parseDateValue, toDateKey } from './dates';

/**
 * Parse a persisted calendar day (`yyyy-MM-dd`, or a legacy ISO datetime) as
 * local midnight. See `parseDateValue` for the legacy rules.
 */
export const toLocalDate = parseDateValue;

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

export type RotawiseFileErrorCode = 'invalidJson' | 'notRotawiseFile' | 'newerVersion' | 'invalidData';

/** Thrown by `parseAppFileJson` when a payload cannot be opened safely. */
export class RotawiseFileError extends Error {
  readonly code: RotawiseFileErrorCode;
  readonly detail?: string;

  constructor(code: RotawiseFileErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RotawiseFileError';
    this.code = code;
    this.detail = detail;
  }
}

/** Thrown when the bound file cannot be written because permission was not granted. */
export class FilePermissionError extends Error {
  constructor() {
    super('Write permission to the bound file was not granted');
    this.name = 'FilePermissionError';
  }
}

const dateString = z.string().refine((s) => isValidDate(parseDateValue(s)), { message: 'invalid date' });
const dateList = z.array(dateString).nullish();

const fileUnitSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    minPostCallCoverage: z.number().int().min(0),
    alliedUnitIds: z.array(z.string()).nullish(),
  })
  .passthrough();

const fileCoverSchema = z
  .object({
    id: z.string().nullish(),
    targetUnitId: z.string(),
    startDate: dateString,
    endDate: dateString,
  })
  .passthrough();

const fileDoctorSchema = z
  .object({
    id: z.string().nullish(),
    name: z.string().nullish(),
    freeDates: dateList,
    vacationDates: dateList,
    preAssignedWorkDates: dateList,
    excludedDates: dateList,
    isExcludedFromAutomaticAssignment: z.boolean().nullish(),
    unitId: z.string().nullish(),
    coverAssignments: z.array(fileCoverSchema).nullish(),
  })
  .passthrough();

const fileEntrySchema = z
  .object({
    date: dateString,
    doctorId: z.string(),
    assignment: z.enum(['Work', 'Free', 'Pre-assigned', 'Off', 'Excluded', 'Vacation']),
    dayOfWeek: z.string().nullish(),
    isFixed: z.boolean().nullish(),
  })
  .passthrough();

const fileScheduleSchema = z
  .object({
    startDate: dateString.nullish(),
    endDate: dateString.nullish(),
    entries: z.array(fileEntrySchema).nullish(),
    minIntervalBetweenWorkDays: z.number().nullish(),
    globalMonthlyShiftLimit: z.number().nullish(),
    seed: z.number().nullish(),
  })
  .passthrough();

const fileFormValuesSchema = z
  .object({
    numberOfDoctors: z.number().nullish(),
    startDate: dateString.nullish(),
    endDate: dateString.nullish(),
    minIntervalBetweenWorkDays: z.number().nullish(),
    globalMonthlyShiftLimit: z.number().nullish(),
    enforceMonthlyLimit: z.boolean().nullish(),
    doctors: z.array(fileDoctorSchema).nullish(),
    units: z.array(fileUnitSchema).nullish(),
    holidays: dateList,
  })
  .passthrough();

const appFileSchema = z
  .object({
    fileVersion: z.number().nullish(),
    schedule: fileScheduleSchema.nullish(),
    doctorsProfiles: z.array(fileDoctorSchema).nullish(),
    formValues: fileFormValuesSchema.nullish(),
    currentMinInterval: z.number().nullish(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Small (de)serialisation helpers
// ---------------------------------------------------------------------------

const dateToString = (d: Date | string): string => (d instanceof Date ? toDateKey(d) : toDateKey(parseDateValue(d)));
const datesToStrings = (dates: (Date | string)[] | null | undefined): string[] =>
  (dates ?? []).map(dateToString);
const stringsToDates = (dates: string[] | null | undefined): Date[] =>
  (dates ?? []).map(parseDateValue).filter(isValidDate);

export function serializeCoverAssignments(
  raw: UnitCoverAssignment[] | undefined,
): SerializedUnitCoverAssignment[] {
  return (raw ?? []).map((a) => ({
    id: a.id,
    targetUnitId: a.targetUnitId,
    startDate: dateToString(a.startDate),
    endDate: dateToString(a.endDate),
  }));
}

export function deserializeCoverAssignments(
  raw: SerializedUnitCoverAssignment[] | null | undefined,
): UnitCoverAssignment[] {
  return (raw ?? []).map((a) => ({
    id: a.id || generateId(),
    targetUnitId: a.targetUnitId,
    startDate: parseDateValue(a.startDate),
    endDate: parseDateValue(a.endDate),
  }));
}

export function normalizeUnit(u: {
  id: string;
  name: string;
  minPostCallCoverage: number;
  alliedUnitIds?: string[] | null;
}): Unit {
  return {
    id: u.id,
    name: u.name,
    minPostCallCoverage: u.minPostCallCoverage,
    alliedUnitIds: u.alliedUnitIds ?? [],
  };
}

function serializeDoctor(doc: DoctorFormFieldInput): SerializedDoctorFormFieldInput {
  return {
    id: doc.id || generateId(),
    name: doc.name ?? '',
    freeDates: datesToStrings(doc.freeDates),
    preAssignedWorkDates: datesToStrings(doc.preAssignedWorkDates),
    excludedDates: datesToStrings(doc.excludedDates),
    isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    unitId: doc.unitId || undefined,
    coverAssignments: serializeCoverAssignments(doc.coverAssignments),
  };
}

function deserializeDoctor(doc: SerializedDoctorFormFieldInput): DoctorFormFieldInput {
  const legacy = doc as unknown as { vacationDates?: string[] };
  return {
    id: doc.id || generateId(),
    name: doc.name ?? '',
    freeDates: stringsToDates(doc.freeDates ?? legacy.vacationDates),
    preAssignedWorkDates: stringsToDates(doc.preAssignedWorkDates),
    excludedDates: stringsToDates(doc.excludedDates),
    isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    // fileVersion 1 files do not have unitId; '' means "no unit".
    unitId: doc.unitId || '',
    coverAssignments: deserializeCoverAssignments(doc.coverAssignments),
  };
}

function deserializeEntry(e: SerializedScheduleEntry): ScheduleEntry {
  const date = parseDateValue(e.date);
  return {
    ...e,
    date,
    dayOfWeek: e.dayOfWeek || date.toLocaleDateString('en-US', { weekday: 'long' }),
    // Backward compat for old files with the 'Vacation' assignment.
    assignment: (e.assignment as string) === 'Vacation' ? 'Free' : e.assignment,
  };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse and validate a .rw / .json payload. Throws `RotawiseFileError` when the
 * text is not JSON, is not a Rotawise file, was written by a newer version of
 * the app, or contains malformed data. Legacy `vacationDates` / `Vacation`
 * values are migrated in place.
 */
export function parseAppFileJson(text: string): AppFileData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RotawiseFileError('invalidJson');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RotawiseFileError('notRotawiseFile');
  }
  const raw = parsed as Record<string, unknown>;
  if (raw.schedule == null && raw.formValues == null && raw.doctorsProfiles == null) {
    throw new RotawiseFileError('notRotawiseFile');
  }
  if (typeof raw.fileVersion === 'number' && raw.fileVersion > CURRENT_FILE_VERSION) {
    throw new RotawiseFileError('newerVersion', String(raw.fileVersion));
  }

  const result = appFileSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new RotawiseFileError('invalidData', `${issue.path.join('.')}: ${issue.message}`);
  }

  const migrateDoctor = (d: Record<string, unknown>) => {
    if ('vacationDates' in d && !('freeDates' in d)) {
      d.freeDates = d.vacationDates;
      delete d.vacationDates;
    }
    return d;
  };

  if (Array.isArray(raw.doctorsProfiles)) {
    raw.doctorsProfiles = (raw.doctorsProfiles as Record<string, unknown>[]).map(migrateDoctor);
  }
  const formValues = (raw.formValues ?? {}) as Record<string, unknown>;
  formValues.doctors = Array.isArray(formValues.doctors)
    ? (formValues.doctors as Record<string, unknown>[]).map(migrateDoctor)
    : [];
  const schedule = (raw.schedule ?? {}) as Record<string, unknown>;
  schedule.entries = Array.isArray(schedule.entries)
    ? (schedule.entries as Record<string, unknown>[]).map((e) => {
        if (e.assignment === 'Vacation') e.assignment = 'Free';
        return e;
      })
    : [];

  return {
    ...raw,
    fileVersion: typeof raw.fileVersion === 'number' ? raw.fileVersion : CURRENT_FILE_VERSION,
    versions: Array.isArray(raw.versions) ? raw.versions : [],
    schedule,
    formValues,
    doctorsProfiles: Array.isArray(raw.doctorsProfiles) ? raw.doctorsProfiles : [],
  } as unknown as AppFileData;
}

// ---------------------------------------------------------------------------
// App state <-> file payload
// ---------------------------------------------------------------------------

export function emptyFormValues(): Partial<ScheduleFormValues> {
  return {
    numberOfDoctors: 0,
    startDate: undefined,
    endDate: undefined,
    minIntervalBetweenWorkDays: 1,
    doctors: [],
    units: [],
    holidays: [],
  };
}

export function makeEmptyAppFileData(): AppFileData {
  return buildAppFileData({ schedule: null, formValues: emptyFormValues(), currentMinInterval: 1 });
}

/** True when the payload has no user-entered roster, units, or generated entries. */
export function isEmptyAppFileData(data: AppFileData | null | undefined): boolean {
  if (!data) return true;
  const doctors = data.formValues?.doctors ?? [];
  const hasNamedDoctor = doctors.some((d) => Boolean(d.name?.trim()));
  const hasDoctorSlots = doctors.length > 0 || (data.formValues?.numberOfDoctors ?? 0) > 0;
  const hasEntries = (data.schedule?.entries?.length ?? 0) > 0;
  const hasUnits = (data.formValues?.units?.length ?? 0) > 0;
  const hasProfiles = (data.doctorsProfiles?.length ?? 0) > 0;
  return !hasNamedDoctor && !hasDoctorSlots && !hasEntries && !hasUnits && !hasProfiles;
}

export interface DeserializedAppData {
  schedule: Schedule | null;
  formValues: Partial<ScheduleFormValues>;
  /** Min interval the stored schedule was generated with. */
  currentMinInterval: number;
}

export function deserializeAppFileData(data: AppFileData): DeserializedAppData {
  const fv = data.formValues;

  // The roster lives in `formValues.doctors`. Very old files only carried
  // `doctorsProfiles`, so fall back to it when the form list is empty.
  const serializedDoctors: SerializedDoctorFormFieldInput[] =
    (fv?.doctors?.length ?? 0) > 0
      ? fv.doctors
      : ((data.doctorsProfiles ?? []) as unknown as SerializedDoctorFormFieldInput[]);
  const doctors = serializedDoctors.map(deserializeDoctor);

  const formValues: Partial<ScheduleFormValues> = {
    numberOfDoctors: doctors.length,
    startDate: fv?.startDate ? parseDateValue(fv.startDate) : undefined,
    endDate: fv?.endDate ? parseDateValue(fv.endDate) : undefined,
    minIntervalBetweenWorkDays: fv?.minIntervalBetweenWorkDays ?? 1,
    globalMonthlyShiftLimit: fv?.globalMonthlyShiftLimit ?? undefined,
    enforceMonthlyLimit: fv?.enforceMonthlyLimit ?? false,
    doctors,
    units: (fv?.units ?? []).map(normalizeUnit),
    holidays: stringsToDates(fv?.holidays),
  };

  let schedule: Schedule | null = null;
  const stored = data.schedule;
  if (stored?.startDate && stored.endDate && (stored.entries?.length ?? 0) > 0) {
    schedule = {
      entries: stored.entries.map(deserializeEntry).filter((e) => isValidDate(e.date)),
      startDate: parseDateValue(stored.startDate),
      endDate: parseDateValue(stored.endDate),
      minIntervalBetweenWorkDays: stored.minIntervalBetweenWorkDays ?? 1,
      globalMonthlyShiftLimit: stored.globalMonthlyShiftLimit ?? undefined,
      seed: stored.seed ?? undefined,
    };
  }

  const currentMinInterval =
    data.currentMinInterval ?? schedule?.minIntervalBetweenWorkDays ?? formValues.minIntervalBetweenWorkDays ?? 1;

  return { schedule, formValues, currentMinInterval };
}

export interface BuildAppFileInput {
  schedule: Schedule | null;
  formValues: Partial<ScheduleFormValues> | null;
  currentMinInterval: number;
  versions?: AppFileData['versions'];
}

export function buildAppFileData({
  schedule,
  formValues,
  currentMinInterval,
  versions = [],
}: BuildAppFileInput): AppFileData {
  const doctors = (formValues?.doctors ?? []).map((doc) => serializeDoctor(doc as DoctorFormFieldInput));
  const hasDoctors = doctors.length > 0;

  const serializedSchedule: AppFileData['schedule'] =
    hasDoctors && schedule
      ? {
          startDate: toDateKey(schedule.startDate),
          endDate: toDateKey(schedule.endDate),
          minIntervalBetweenWorkDays: schedule.minIntervalBetweenWorkDays,
          globalMonthlyShiftLimit: schedule.globalMonthlyShiftLimit,
          seed: schedule.seed,
          entries: schedule.entries.map((e) => ({ ...e, date: toDateKey(e.date) })),
        }
      : { entries: [] };

  const serializedFormValues: AppFileData['formValues'] = {
    numberOfDoctors: doctors.length,
    startDate: formValues?.startDate ? dateToString(formValues.startDate) : undefined,
    endDate: formValues?.endDate ? dateToString(formValues.endDate) : undefined,
    minIntervalBetweenWorkDays: formValues?.minIntervalBetweenWorkDays ?? 1,
    globalMonthlyShiftLimit: formValues?.globalMonthlyShiftLimit,
    enforceMonthlyLimit: formValues?.enforceMonthlyLimit ?? false,
    doctors,
    units: (formValues?.units ?? []).map(normalizeUnit),
    holidays: datesToStrings(formValues?.holidays),
  };

  return {
    fileVersion: CURRENT_FILE_VERSION,
    versions,
    schedule: serializedSchedule,
    // Kept for readers of file versions 1–3; always mirrors `formValues.doctors`.
    doctorsProfiles: doctors.map((d) => ({ ...d, coverAssignments: d.coverAssignments ?? [] })),
    formValues: serializedFormValues,
    currentMinInterval,
  };
}
