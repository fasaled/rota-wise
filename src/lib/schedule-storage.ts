import { CURRENT_FILE_VERSION } from './types';
import type {
  ScheduleFormValues,
  Schedule,
  SerializedScheduleFormValues,
  SerializedSchedule,
  AppFileData,
  DoctorProfile,
  DoctorFormFieldInput,
  SerializedDoctorFormFieldInput,
  Unit,
  UnitCoverAssignment,
  SerializedUnitCoverAssignment,
} from './types';
import { generateId } from './utils';

// Parse a date string that may be date-only ("2024-01-15") or an ISO 8601
// datetime. Date-only strings must be treated as local midnight so they
// match calendar dates. ISO strings (which contain 'T') are handled by
// `new Date`.
export const toLocalDate = (s: string): Date =>
  s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');

export function serializeCoverAssignments(
  raw: UnitCoverAssignment[] | undefined,
): SerializedUnitCoverAssignment[] {
  return (raw ?? []).map((a) => ({
    id: a.id,
    targetUnitId: a.targetUnitId,
    startDate: a.startDate instanceof Date ? a.startDate.toISOString() : (a.startDate as unknown as string),
    endDate: a.endDate instanceof Date ? a.endDate.toISOString() : (a.endDate as unknown as string),
  }));
}

export function deserializeCoverAssignments(
  raw: SerializedUnitCoverAssignment[] | undefined,
): UnitCoverAssignment[] {
  return (raw ?? []).map((a) => ({
    id: a.id,
    targetUnitId: a.targetUnitId,
    startDate: toLocalDate(a.startDate),
    endDate: toLocalDate(a.endDate),
  }));
}

export function normalizeUnit(u: {
  id: string;
  name: string;
  minPostCallCoverage: number;
  alliedUnitIds?: string[];
}): Unit {
  return {
    id: u.id,
    name: u.name,
    minPostCallCoverage: u.minPostCallCoverage,
    alliedUnitIds: u.alliedUnitIds ?? [],
  };
}

export function serializeScheduleFormValues(
  values: ScheduleFormValues,
): SerializedScheduleFormValues {
  const holidays = (values.holidays ?? []).map(
    (d) => (d instanceof Date ? d.toISOString() : (d as string)),
  );
  return {
    ...values,
    startDate:
      values.startDate instanceof Date
        ? values.startDate.toISOString()
        : (values.startDate as string),
    endDate:
      values.endDate instanceof Date
        ? values.endDate.toISOString()
        : (values.endDate as string),
    holidays,
    units: (values.units ?? []).map(normalizeUnit),
    doctors: values.doctors.map((d) => ({
      ...d,
      freeDates: d.freeDates.map((date) =>
        date instanceof Date ? date.toISOString() : (date as string),
      ),
      preAssignedWorkDates: d.preAssignedWorkDates.map((date) =>
        date instanceof Date ? date.toISOString() : (date as string),
      ),
      excludedDates: d.excludedDates.map((date) =>
        date instanceof Date ? date.toISOString() : (date as string),
      ),
      coverAssignments: serializeCoverAssignments(d.coverAssignments),
    })),
  } as SerializedScheduleFormValues;
}

export function deserializeScheduleFormValues(
  values: SerializedScheduleFormValues,
): ScheduleFormValues {
  return {
    ...values,
    startDate: toLocalDate(values.startDate),
    endDate: toLocalDate(values.endDate),
    units: (values.units ?? []).map(normalizeUnit),
    // fileVersion 1 files do not have holidays; default to [] for backward compat.
    holidays: (values.holidays ?? []).map((s) => toLocalDate(s)),
    doctors: values.doctors.map((d) => {
      const freeDatesRaw: string[] =
        ((d as unknown as Record<string, unknown>).freeDates as string[]) ??
        ((d as unknown as Record<string, unknown>).vacationDates as string[]) ??
        [];
      return {
        ...d,
        // fileVersion 1 files do not have unitId; default to '' for backward compat.
        unitId: d.unitId ?? '',
        coverAssignments: deserializeCoverAssignments(d.coverAssignments),
        freeDates: freeDatesRaw.map((s: string) => toLocalDate(s)),
        preAssignedWorkDates: d.preAssignedWorkDates.map((s: string) => toLocalDate(s)),
        excludedDates: d.excludedDates.map((s: string) => toLocalDate(s)),
      };
    }),
  } as ScheduleFormValues;
}

export function serializeSchedule(schedule: Schedule): SerializedSchedule {
  return {
    ...schedule,
    startDate: schedule.startDate.toISOString(),
    endDate: schedule.endDate.toISOString(),
    entries: schedule.entries.map((e) => ({
      ...e,
      date: e.date.toISOString(),
    })),
  };
}

export function deserializeSchedule(schedule: SerializedSchedule): Schedule {
  return {
    ...schedule,
    startDate: toLocalDate(schedule.startDate),
    endDate: toLocalDate(schedule.endDate),
    entries: schedule.entries.map((e) => {
      const date = toLocalDate(e.date);
      return {
        ...e,
        date,
        dayOfWeek: e.dayOfWeek || date.toLocaleDateString('en-US', { weekday: 'long' }),
        // Backward compat for old files with 'Vacation' assignment
        assignment: (e.assignment as string) === 'Vacation' ? 'Free' : e.assignment,
      };
    }),
  };
}

/** Parse a .rw / .json payload, including legacy vacation → free-day migration. */
export function parseAppFileJson(text: string): AppFileData {
  const parsed: Record<string, unknown> = JSON.parse(text);

  if (Array.isArray(parsed.doctorsProfiles)) {
    parsed.doctorsProfiles = (parsed.doctorsProfiles as Record<string, unknown>[]).map((d) => {
      if ('vacationDates' in d && !('freeDates' in d)) {
        d.freeDates = d.vacationDates;
        delete d.vacationDates;
      }
      return d;
    });
  }
  if (
    parsed.formValues &&
    typeof parsed.formValues === 'object' &&
    Array.isArray((parsed.formValues as Record<string, unknown>).doctors)
  ) {
    (parsed.formValues as Record<string, unknown>).doctors = (
      (parsed.formValues as Record<string, unknown>).doctors as Record<string, unknown>[]
    ).map((d) => {
      if ('vacationDates' in d && !('freeDates' in d)) {
        d.freeDates = d.vacationDates;
        delete d.vacationDates;
      }
      return d;
    });
  }
  if (
    parsed.schedule &&
    typeof parsed.schedule === 'object' &&
    Array.isArray((parsed.schedule as Record<string, unknown>).entries)
  ) {
    (parsed.schedule as Record<string, unknown>).entries = (
      (parsed.schedule as Record<string, unknown>).entries as Record<string, unknown>[]
    ).map((e) => {
      if (e.assignment === 'Vacation') e.assignment = 'Free';
      return e;
    });
  }

  return {
    fileVersion: (parsed.fileVersion as number) ?? CURRENT_FILE_VERSION,
    versions: [],
    ...parsed,
  } as unknown as AppFileData;
}

export function emptyFormValues(): Partial<ScheduleFormValues> {
  return {
    numberOfDoctors: 0,
    startDate: undefined,
    endDate: undefined,
    minIntervalBetweenWorkDays: 1,
    doctors: [],
  };
}

export function makeEmptyAppFileData(): AppFileData {
  return buildAppFileData(null, [], emptyFormValues(), [], 1, []);
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

export function deserializeAppFileData(data: AppFileData): {
  schedule: Schedule | null;
  doctorsProfiles: DoctorProfile[];
  formValues: Partial<ScheduleFormValues> | null;
  scheduleWarnings: string[];
  currentMinInterval: number;
} {
  let schedule: Schedule | null = null;
  let doctorsProfiles: DoctorProfile[] = [];
  let formValues: Partial<ScheduleFormValues> | null = null;
  const scheduleWarnings: string[] = data.scheduleWarnings || [];
  const currentMinInterval = data.currentMinInterval || 1;

  const hasScheduleData = data.schedule?.startDate && (data.schedule?.entries?.length ?? 0) > 0;
  const hasDoctorData = (data.doctorsProfiles?.length ?? 0) > 0 || (data.formValues?.doctors?.length ?? 0) > 0;

  if (hasScheduleData || hasDoctorData) {
    const entries = (data.schedule?.entries || []).map((e) => {
      const date = toLocalDate(e.date);
      return {
        ...e,
        date,
        dayOfWeek: e.dayOfWeek || date.toLocaleDateString('en-US', { weekday: 'long' }),
      };
    });

    if (data.schedule?.startDate && (data.schedule?.entries?.length ?? 0) > 0) {
      schedule = {
        ...data.schedule,
        startDate: toLocalDate(data.schedule.startDate),
        endDate: toLocalDate(data.schedule.endDate),
        minIntervalBetweenWorkDays: data.schedule.minIntervalBetweenWorkDays || 1,
        globalMonthlyShiftLimit: data.schedule.globalMonthlyShiftLimit,
        entries,
      };
    }

    if (data.doctorsProfiles) {
      doctorsProfiles = data.doctorsProfiles.map((p) => ({
        ...p,
        freeDates: (p.freeDates || []).map((d: string) => toLocalDate(d)),
        preAssignedWorkDates: (p.preAssignedWorkDates || []).map((d: string) => toLocalDate(d)),
        excludedDates: (p.excludedDates || []).map((d: string) => toLocalDate(d)),
        isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
        coverAssignments: deserializeCoverAssignments(p.coverAssignments),
      }));
    }

    if (data.formValues) {
      const formDoctors = (data.formValues.doctors || []).map((doc: SerializedDoctorFormFieldInput) => ({
        id: doc.id,
        name: doc.name,
        freeDates: (doc.freeDates || []).map((d: string) => toLocalDate(d)),
        preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d: string) => toLocalDate(d)),
        excludedDates: (doc.excludedDates || []).map((d: string) => toLocalDate(d)),
        isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
        unitId: doc.unitId || '',
        coverAssignments: deserializeCoverAssignments(doc.coverAssignments),
      }));

      formValues = {
        numberOfDoctors: data.formValues.numberOfDoctors,
        startDate: data.formValues.startDate ? toLocalDate(data.formValues.startDate) : new Date(),
        endDate: data.formValues.endDate ? toLocalDate(data.formValues.endDate) : new Date(),
        minIntervalBetweenWorkDays: data.formValues.minIntervalBetweenWorkDays || 1,
        globalMonthlyShiftLimit: data.formValues.globalMonthlyShiftLimit,
        doctors: formDoctors,
        units: (data.formValues.units || []).map(normalizeUnit),
        holidays: (data.formValues.holidays || []).map((d: string) => toLocalDate(d)),
      };
    }
  }

  return { schedule, doctorsProfiles, formValues, scheduleWarnings, currentMinInterval };
}

export function buildAppFileData(
  schedule: Schedule | null,
  doctorsProfiles: DoctorProfile[],
  formValues: Partial<ScheduleFormValues> | null,
  scheduleWarnings: string[],
  currentMinInterval: number,
  versions: AppFileData['versions'],
): AppFileData {
  const hasDoctors = (doctorsProfiles?.length ?? 0) > 0 || (formValues?.doctors?.length ?? 0) > 0;

  const serializedSchedule: AppFileData['schedule'] = hasDoctors && schedule
    ? {
        ...schedule,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        entries: schedule.entries.map((e) => ({ ...e, date: e.date.toISOString() })),
      }
    : {
        entries: [],
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      };

  const serializedDoctors: AppFileData['doctorsProfiles'] = (doctorsProfiles?.length ?? 0) > 0
    ? doctorsProfiles.map((p) => ({
        ...p,
        freeDates: p.freeDates.map((d) => d.toISOString()),
        preAssignedWorkDates: p.preAssignedWorkDates.map((d) => d.toISOString()),
        excludedDates: (p.excludedDates || []).map((d) => d.toISOString()),
        isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
        coverAssignments: serializeCoverAssignments(p.coverAssignments),
      }))
    : [];

  const serializedFormValues: AppFileData['formValues'] = {
    numberOfDoctors: formValues?.numberOfDoctors || 0,
    startDate: formValues?.startDate ? formValues.startDate.toISOString() : new Date().toISOString(),
    endDate: formValues?.endDate ? formValues.endDate.toISOString() : new Date().toISOString(),
    minIntervalBetweenWorkDays: formValues?.minIntervalBetweenWorkDays || 1,
    globalMonthlyShiftLimit: formValues?.globalMonthlyShiftLimit,
    doctors: (formValues?.doctors || []).map((doc: DoctorFormFieldInput) => ({
      ...doc,
      id: doc.id || generateId(),
      freeDates: (doc.freeDates || []).map((d) => d.toISOString()),
      preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d) => d.toISOString()),
      excludedDates: (doc.excludedDates || []).map((d) => d.toISOString()),
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
      unitId: doc.unitId || undefined,
      coverAssignments: serializeCoverAssignments(doc.coverAssignments),
    })),
    units: (formValues?.units ?? []).map(normalizeUnit),
    holidays: (formValues?.holidays ?? []).map(
      (d) => (d instanceof Date ? d.toISOString() : (d as string)),
    ),
  } as unknown as AppFileData['formValues'];

  return {
    fileVersion: CURRENT_FILE_VERSION,
    versions,
    schedule: serializedSchedule,
    doctorsProfiles: serializedDoctors,
    formValues: serializedFormValues,
    scheduleWarnings,
    currentMinInterval,
  };
}
