import { useEffect, useCallback } from 'react';
import type { Schedule, ScheduleFormValues, DoctorProfile } from '@/lib/types';
import {
  serializeScheduleData,
  deserializeScheduleData,
  serializeFormData,
  deserializeFormData,
  type SerializedLiveFormData
} from '@/lib/schedule-serialization';

const LOCAL_STORAGE_KEY = 'rotawiseAppState';
const FORM_INPUT_LOCAL_STORAGE_KEY = 'rotawiseFormInputState';

interface UseScheduleStorageProps {
  isMounted: boolean;
  onScheduleLoaded?: (data: {
    schedule: Schedule;
    doctorsProfiles: DoctorProfile[];
    formValues: ScheduleFormValues;
    scheduleWarnings: string[];
    currentMinInterval: number;
  }) => void;
  onFormLoaded?: (formValues: Partial<ScheduleFormValues>) => void;
  onLoadError?: (error: string) => void;
}

/**
 * Custom hook to manage schedule persistence in localStorage
 * Optimized with memoized callbacks and separated concerns
 */
export function useScheduleStorage({
  isMounted,
  onScheduleLoaded,
  onFormLoaded,
  onLoadError,
}: UseScheduleStorageProps) {

  // Load schedule from localStorage
  const loadSchedule = useCallback(() => {
    if (!isMounted) return false;

    try {
      const persistedStateString = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!persistedStateString) return false;

      const loadedData = JSON.parse(persistedStateString);

      if (!loadedData.schedule || !loadedData.doctorsProfiles || !loadedData.formValues) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return false;
      }

      const deserializedData = deserializeScheduleData(loadedData);
      onScheduleLoaded?.(deserializedData);

      // Sync to form input localStorage
      try {
        const serializableFormData = serializeFormData(deserializedData.formValues);
        localStorage.setItem(FORM_INPUT_LOCAL_STORAGE_KEY, JSON.stringify(serializableFormData));
      } catch (syncError) {
        console.warn("Failed to sync full schedule form values to form input localStorage:", syncError);
      }

      return true;
    } catch (error) {
      console.error("Failed to load full schedule state from localStorage:", error);
      onLoadError?.("Error restoring schedule state");
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return false;
    }
  }, [isMounted, onScheduleLoaded, onLoadError]);

  // Load form input from localStorage
  const loadFormInput = useCallback(() => {
    if (!isMounted) return false;

    try {
      const persistedFormInputString = localStorage.getItem(FORM_INPUT_LOCAL_STORAGE_KEY);
      if (!persistedFormInputString) return false;

      const loadedFormInput = JSON.parse(persistedFormInputString) as SerializedLiveFormData;
      const deserializedFormValues = deserializeFormData(loadedFormInput);

      if (typeof deserializedFormValues.numberOfDoctors !== 'number') {
        console.warn("Loaded form input state was invalid, discarding.");
        localStorage.removeItem(FORM_INPUT_LOCAL_STORAGE_KEY);
        return false;
      }

      onFormLoaded?.(deserializedFormValues);
      return true;
    } catch (error) {
      console.error("Failed to load form input state from localStorage:", error);
      localStorage.removeItem(FORM_INPUT_LOCAL_STORAGE_KEY);
      return false;
    }
  }, [isMounted, onFormLoaded]);

  // Save schedule to localStorage
  const saveSchedule = useCallback((
    schedule: Schedule,
    doctorsProfiles: DoctorProfile[],
    scheduleWarnings: string[],
    currentMinInterval: number
  ) => {
    if (!isMounted || !schedule || doctorsProfiles.length === 0) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }

    try {
      const dataToPersist = serializeScheduleData(
        schedule,
        doctorsProfiles,
        scheduleWarnings,
        currentMinInterval
      );
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToPersist));
    } catch (error) {
      console.error("Failed to save state to localStorage:", error);
      onLoadError?.("Error persisting schedule state");
    }
  }, [isMounted, onLoadError]);

  // Save form input to localStorage
  const saveFormInput = useCallback((data: ScheduleFormValues) => {
    try {
      const serializableFormData = serializeFormData(data);
      localStorage.setItem(FORM_INPUT_LOCAL_STORAGE_KEY, JSON.stringify(serializableFormData));
    } catch (error) {
      console.error("Failed to save form input state to localStorage:", error);
    }
  }, []);

  // Clear all storage
  const clearStorage = useCallback(() => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(FORM_INPUT_LOCAL_STORAGE_KEY);
  }, []);

  // Load on mount
  useEffect(() => {
    if (!isMounted) return;

    const fullScheduleLoaded = loadSchedule();
    if (!fullScheduleLoaded) {
      loadFormInput();
    }
  }, [isMounted, loadSchedule, loadFormInput]);

  return {
    saveSchedule,
    saveFormInput,
    loadSchedule,
    loadFormInput,
    clearStorage,
  };
}
