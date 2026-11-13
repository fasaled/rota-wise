import { useCallback, useMemo, useRef, useState } from 'react';
import type { DoctorProfile, Schedule, ScheduleFormValues, Unit } from '@/lib/types';
import { emptyFormValues, normalizeUnit } from '@/lib/schedule-storage';
import { toDoctorProfile } from '@/lib/schedule-edits';
import { useHistory } from '@/hooks/use-history';

export interface DocumentState {
  schedule: Schedule | null;
  /** The roster form. Single source of truth for doctors, units and holidays. */
  formValues: Partial<ScheduleFormValues>;
  /** Min interval the current schedule was generated with. */
  currentMinInterval: number;
}

/** `formValues` is only recorded for actions that change the roster form. */
interface Snapshot {
  schedule: Schedule | null;
  currentMinInterval: number;
  formValues?: Partial<ScheduleFormValues>;
}

const emptyDocument = (): DocumentState => ({
  schedule: null,
  formValues: emptyFormValues(),
  currentMinInterval: 1,
});

/**
 * The open document (schedule + roster form) with undo / redo.
 *
 * Doctors, units and holidays are always derived from `formValues`, so the
 * calendar, the summaries, the warnings and the saved file can never disagree
 * with what the form shows.
 */
export function useScheduleDocument() {
  const [doc, setDoc] = useState<DocumentState>(emptyDocument);
  // The form is uncontrolled: it is re-mounted (new key) with these values
  // whenever something other than the user typing changes the roster.
  const [formSeed, setFormSeed] = useState(() => ({ key: 0, values: doc.formValues }));
  const docRef = useRef(doc);
  const history = useHistory<Snapshot>();
  const { push: historyPush, undo: historyUndo, redo: historyRedo, clear: historyClear } = history;

  const apply = useCallback((next: DocumentState, reseedForm = false) => {
    docRef.current = next;
    setDoc(next);
    if (reseedForm) setFormSeed((s) => ({ key: s.key + 1, values: next.formValues }));
  }, []);

  /** Replace the whole document (open / restore / new). Clears history. */
  const load = useCallback(
    (next: DocumentState) => {
      historyClear();
      apply(next, true);
    },
    [historyClear, apply],
  );

  const reset = useCallback(() => load(emptyDocument()), [load]);

  /** Live edits typed into the form. Not recorded in history. */
  const setFormValues = useCallback(
    (formValues: Partial<ScheduleFormValues>) => apply({ ...docRef.current, formValues }),
    [apply],
  );

  /** Record an undoable change to the schedule. */
  const commitSchedule = useCallback(
    (schedule: Schedule | null, currentMinInterval?: number) => {
      const cur = docRef.current;
      historyPush({ schedule: cur.schedule, currentMinInterval: cur.currentMinInterval });
      apply({ ...cur, schedule, currentMinInterval: currentMinInterval ?? cur.currentMinInterval });
    },
    [historyPush, apply],
  );

  /** Record an undoable change that also rewrites the roster form. */
  const commitWithForm = useCallback(
    (schedule: Schedule | null, formValues: Partial<ScheduleFormValues>) => {
      const cur = docRef.current;
      historyPush({
        schedule: cur.schedule,
        currentMinInterval: cur.currentMinInterval,
        formValues: cur.formValues,
      });
      apply({ ...cur, schedule, formValues }, true);
    },
    [historyPush, apply],
  );

  const travel = useCallback(
    (step: typeof historyUndo): boolean => {
      const cur = docRef.current;
      const restored = step((target) => ({
        schedule: cur.schedule,
        currentMinInterval: cur.currentMinInterval,
        formValues: target.formValues ? cur.formValues : undefined,
      }));
      if (!restored) return false;
      apply(
        {
          schedule: restored.schedule,
          currentMinInterval: restored.currentMinInterval,
          formValues: restored.formValues ?? cur.formValues,
        },
        Boolean(restored.formValues),
      );
      return true;
    },
    [apply],
  );

  const undo = useCallback(() => travel(historyUndo), [travel, historyUndo]);
  const redo = useCallback(() => travel(historyRedo), [travel, historyRedo]);

  const { formValues } = doc;
  const doctors = useMemo<DoctorProfile[]>(
    () => (formValues.doctors ?? []).filter((d) => Boolean(d?.id)).map(toDoctorProfile),
    [formValues.doctors],
  );
  const units = useMemo<Unit[]>(() => (formValues.units ?? []).map(normalizeUnit), [formValues.units]);
  const holidays = useMemo<Date[]>(
    () => (formValues.holidays ?? []).filter((d): d is Date => d instanceof Date),
    [formValues.holidays],
  );

  return {
    ...doc,
    /** Latest state, readable from callbacks without re-creating them. */
    docRef,
    doctors,
    units,
    holidays,
    formSeed,
    load,
    reset,
    setFormValues,
    commitSchedule,
    commitWithForm,
    undo,
    redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  };
}
