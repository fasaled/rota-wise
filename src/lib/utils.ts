import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { isSameDay } from "date-fns"
import type { ScheduleEntry } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Deduplicates schedule entries so each doctor has at most one Work entry per date.
 * Keeps the last occurrence (most recent edit) when duplicates exist.
 */
export function deduplicateEntries(entries: ScheduleEntry[]): ScheduleEntry[] {
  const result: ScheduleEntry[] = [];
  // Process in reverse so later entries (most recent edits) win
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.assignment !== 'Work') {
      result.push(entry);
      continue;
    }
    const hasDuplicate = result.some(
      (e) => e.assignment === 'Work' && e.doctorId === entry.doctorId && isSameDay(e.date, entry.date),
    );
    if (!hasDuplicate) {
      result.push(entry);
    }
  }
  // Restore original chronological order
  result.sort((a, b) => {
    const diff = a.date.getTime() - b.date.getTime();
    return diff !== 0 ? diff : a.doctorId.localeCompare(b.doctorId);
  });
  return result;
}
