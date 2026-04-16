import type {
  ScheduleVersion,
  ScheduleFormValues,
  Schedule,
  SerializedScheduleFormValues,
  SerializedSchedule,
} from './types';

const VERSIONS_STORAGE_KEY = 'rotawiseVersions';

// ---------------------------------------------------------------------------
// localStorage-backed CRUD (used while no file is open)
// ---------------------------------------------------------------------------

export function loadScheduleVersions(): ScheduleVersion[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VERSIONS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScheduleVersion[];
  } catch {
    return [];
  }
}

function persistVersions(versions: ScheduleVersion[]): void {
  localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(versions));
}

export function saveScheduleVersion(
  name: string,
  description: string,
  parameters: ScheduleFormValues,
  schedule?: Schedule,
  warnings?: string[],
): string {
  const versions = loadScheduleVersions();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const version: ScheduleVersion = {
    id,
    name,
    description,
    createdAt: now,
    lastModified: now,
    parameters: serializeScheduleFormValues(parameters),
    generatedSchedule: schedule ? serializeSchedule(schedule) : undefined,
    warnings,
  };
  versions.unshift(version);
  persistVersions(versions);
  return id;
}

export function updateScheduleVersion(
  id: string,
  updates: Partial<Omit<ScheduleVersion, 'id' | 'createdAt'>>,
): boolean {
  const versions = loadScheduleVersions();
  const idx = versions.findIndex((v) => v.id === id);
  if (idx === -1) return false;
  versions[idx] = {
    ...versions[idx],
    ...updates,
    lastModified: new Date().toISOString(),
  };
  persistVersions(versions);
  return true;
}

export function deleteScheduleVersion(id: string): boolean {
  const versions = loadScheduleVersions();
  const next = versions.filter((v) => v.id !== id);
  if (next.length === versions.length) return false;
  persistVersions(next);
  return true;
}

export function getScheduleVersion(id: string): ScheduleVersion | undefined {
  return loadScheduleVersions().find((v) => v.id === id);
}

// ---------------------------------------------------------------------------
// Pure array helpers (used by file-backed operations in page.tsx)
// ---------------------------------------------------------------------------

export function createVersionInArray(
  versions: ScheduleVersion[],
  name: string,
  description: string,
  parameters: ScheduleFormValues,
  schedule?: Schedule,
  warnings?: string[],
): { versions: ScheduleVersion[]; id: string } {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const version: ScheduleVersion = {
    id,
    name,
    description,
    createdAt: now,
    lastModified: now,
    parameters: serializeScheduleFormValues(parameters),
    generatedSchedule: schedule ? serializeSchedule(schedule) : undefined,
    warnings,
  };
  return { versions: [version, ...versions], id };
}

export function updateVersionInArray(
  versions: ScheduleVersion[],
  id: string,
  updates: Partial<Omit<ScheduleVersion, 'id' | 'createdAt'>>,
): ScheduleVersion[] {
  return versions.map((v) =>
    v.id === id
      ? { ...v, ...updates, lastModified: new Date().toISOString() }
      : v,
  );
}

export function deleteVersionFromArray(
  versions: ScheduleVersion[],
  id: string,
): ScheduleVersion[] {
  return versions.filter((v) => v.id !== id);
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

export function serializeScheduleFormValues(
  values: ScheduleFormValues,
): SerializedScheduleFormValues {
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
    doctors: values.doctors.map((d) => ({
      ...d,
      vacationDates: d.vacationDates.map((date) =>
        date instanceof Date ? date.toISOString() : (date as string),
      ),
      preAssignedWorkDates: d.preAssignedWorkDates.map((date) =>
        date instanceof Date ? date.toISOString() : (date as string),
      ),
      excludedDates: d.excludedDates.map((date) =>
        date instanceof Date ? date.toISOString() : (date as string),
      ),
    })),
  } as SerializedScheduleFormValues;
}

export function deserializeScheduleFormValues(
  values: SerializedScheduleFormValues,
): ScheduleFormValues {
  return {
    ...values,
    startDate: new Date(values.startDate),
    endDate: new Date(values.endDate),
    doctors: values.doctors.map((d) => ({
      ...d,
      vacationDates: d.vacationDates.map((s) => new Date(s)),
      preAssignedWorkDates: d.preAssignedWorkDates.map((s) => new Date(s)),
      excludedDates: d.excludedDates.map((s) => new Date(s)),
    })),
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
    startDate: new Date(schedule.startDate),
    endDate: new Date(schedule.endDate),
    entries: schedule.entries.map((e) => ({
      ...e,
      date: new Date(e.date),
    })),
  };
}
