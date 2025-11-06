import type { Schedule, ScheduleFormValues, DoctorProfile, SerializedDoctorFormFieldInput, PersistedScheduleData } from './types';

/**
 * Serialization utilities for schedule data
 * Optimized for localStorage persistence
 */

export type SerializedLiveFormData = Omit<ScheduleFormValues, 'startDate' | 'endDate' | 'doctors'> & {
  startDate?: string;
  endDate?: string;
  doctors: SerializedDoctorFormFieldInput[];
};

/**
 * Serialize schedule data for localStorage
 */
export function serializeScheduleData(
  schedule: Schedule,
  doctorsProfiles: DoctorProfile[],
  scheduleWarnings: string[],
  currentMinInterval: number
): PersistedScheduleData {
  return {
    schedule: {
      ...schedule,
      startDate: schedule.startDate.toISOString(),
      endDate: schedule.endDate.toISOString(),
      minIntervalBetweenWorkDays: schedule.minIntervalBetweenWorkDays || currentMinInterval,
      entries: schedule.entries.map(entry => ({
        ...entry,
        date: entry.date.toISOString(),
      })),
    },
    doctorsProfiles: doctorsProfiles.map(profile => ({
      ...profile,
      vacationDates: profile.vacationDates.map(d => d.toISOString()),
      preAssignedWorkDates: profile.preAssignedWorkDates.map(d => d.toISOString()),
      excludedDates: (profile.excludedDates || []).map(d => d.toISOString()),
      isExcludedFromAutomaticAssignment: profile.isExcludedFromAutomaticAssignment || false,
    })),
    formValues: {
      numberOfDoctors: doctorsProfiles.length,
      startDate: schedule.startDate.toISOString(),
      endDate: schedule.endDate.toISOString(),
      minIntervalBetweenWorkDays: schedule.minIntervalBetweenWorkDays || currentMinInterval,
      doctors: doctorsProfiles.map(p => ({
        id: p.id,
        name: p.name,
        vacationDates: p.vacationDates.map(d => d.toISOString()),
        preAssignedWorkDates: p.preAssignedWorkDates.map(d => d.toISOString()),
        excludedDates: (p.excludedDates || []).map(d => d.toISOString()),
        isExcludedFromAutomaticAssignment: p.isExcludedFromAutomaticAssignment || false,
      })),
    },
    scheduleWarnings: scheduleWarnings,
    currentMinInterval: currentMinInterval,
  };
}

/**
 * Deserialize schedule data from localStorage
 */
export function deserializeScheduleData(loadedData: PersistedScheduleData) {
  const deserializedScheduleEntries = loadedData.schedule.entries.map(entry => ({
    ...entry,
    date: new Date(entry.date),
  }));

  const finalSchedule: Schedule = {
    ...loadedData.schedule,
    startDate: new Date(loadedData.schedule.startDate),
    endDate: new Date(loadedData.schedule.endDate),
    minIntervalBetweenWorkDays: loadedData.schedule.minIntervalBetweenWorkDays || 1,
    entries: deserializedScheduleEntries,
  };

  const deserializedDoctorsProfiles = loadedData.doctorsProfiles.map(profile => ({
    ...profile,
    vacationDates: profile.vacationDates.map((d: string) => new Date(d)),
    preAssignedWorkDates: profile.preAssignedWorkDates.map((d: string) => new Date(d)),
    excludedDates: (profile.excludedDates || []).map((d: string) => new Date(d)),
  }));

  const deserializedFormValuesDoctors = loadedData.formValues.doctors.map((doc: SerializedDoctorFormFieldInput) => ({
    id: doc.id,
    name: doc.name,
    vacationDates: doc.vacationDates.map((d: string) => new Date(d)),
    preAssignedWorkDates: doc.preAssignedWorkDates.map((d: string) => new Date(d)),
    excludedDates: (doc.excludedDates || []).map((d: string) => new Date(d)),
    isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
  }));

  const finalFormValues: ScheduleFormValues = {
    numberOfDoctors: loadedData.formValues.numberOfDoctors,
    startDate: new Date(loadedData.formValues.startDate),
    endDate: new Date(loadedData.formValues.endDate),
    minIntervalBetweenWorkDays: loadedData.formValues.minIntervalBetweenWorkDays || 1,
    doctors: deserializedFormValuesDoctors
  };

  return {
    schedule: finalSchedule,
    doctorsProfiles: deserializedDoctorsProfiles,
    formValues: finalFormValues,
    scheduleWarnings: loadedData.scheduleWarnings || [],
    currentMinInterval: loadedData.currentMinInterval || 1,
  };
}

/**
 * Serialize form data for localStorage
 */
export function serializeFormData(data: ScheduleFormValues): SerializedLiveFormData {
  return {
    ...data,
    startDate: data.startDate ? data.startDate.toISOString() : undefined,
    endDate: data.endDate ? data.endDate.toISOString() : undefined,
    doctors: data.doctors.map(doc => ({
      ...doc,
      vacationDates: doc.vacationDates.map(d => d.toISOString()),
      preAssignedWorkDates: doc.preAssignedWorkDates.map(d => d.toISOString()),
      excludedDates: (doc.excludedDates || []).map(d => d.toISOString()),
    })),
  };
}

/**
 * Deserialize form data from localStorage
 */
export function deserializeFormData(loadedFormInput: SerializedLiveFormData): Partial<ScheduleFormValues> {
  return {
    numberOfDoctors: loadedFormInput.numberOfDoctors,
    startDate: loadedFormInput.startDate ? new Date(loadedFormInput.startDate) : undefined,
    endDate: loadedFormInput.endDate ? new Date(loadedFormInput.endDate) : undefined,
    minIntervalBetweenWorkDays: loadedFormInput.minIntervalBetweenWorkDays || 1,
    doctors: loadedFormInput.doctors.map((doc: SerializedDoctorFormFieldInput) => ({
      id: doc.id || crypto.randomUUID(),
      name: doc.name || '',
      vacationDates: (doc.vacationDates || []).map((d: string) => new Date(d)),
      preAssignedWorkDates: (doc.preAssignedWorkDates || []).map((d: string) => new Date(d)),
      excludedDates: (doc.excludedDates || []).map((d: string) => new Date(d)),
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
    }))
  };
}
