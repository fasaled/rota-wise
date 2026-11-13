/**
 * Calendar-date helpers.
 *
 * Rotawise works with calendar days, never with instants. In memory a day is a
 * `Date` at local midnight; on disk it is a `yyyy-MM-dd` string, which reads
 * the same in every timezone.
 */

const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar day as `yyyy-MM-dd`. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a persisted calendar day into a `Date` at local midnight.
 *
 * - `yyyy-MM-dd` (file version 4+) is taken literally.
 * - ISO datetimes (file versions 1–3) were written as "local midnight of the
 *   author, expressed in UTC". The author's offset is unknown, so the instant
 *   is snapped to the nearest UTC calendar day, which recovers the intended
 *   day for every offset between UTC−11 and UTC+12 regardless of the reader's
 *   timezone.
 *
 * Returns an Invalid Date when the string cannot be parsed.
 */
export function parseDateValue(value: string): Date {
  const match = DATE_ONLY.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return instant;
  const snapped = new Date(instant.getTime() + HALF_DAY_MS);
  return new Date(snapped.getUTCFullYear(), snapped.getUTCMonth(), snapped.getUTCDate());
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
