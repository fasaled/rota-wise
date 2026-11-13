/**
 * On-demand import of official public holidays for a city.
 *
 * Source: Open Data Euskadi (Basque Government), "Calendario laboral" — one
 * JSON file per year listing the holidays of the Basque Country, of each
 * territory and of each municipality. Nothing is requested until the user
 * asks for an import, and nothing about the roster is sent: it is a plain GET
 * of a public file.
 *
 * Only Donostia / San Sebastián is wired up for now; adding a Basque city is
 * one more entry in `HOLIDAY_CITIES`. A city served by another publisher
 * needs its own fetcher and its origin in the `connect-src` of the CSP
 * (`vercel.json`).
 */
import { isValidDate } from './dates';

export interface HolidayCity {
  id: string;
  /** Proper name, shown as is in every language. */
  name: string;
  /** Publisher of the data, shown next to the import button. */
  sourceName: string;
  /** Territory (province) as written in the dataset, lower-cased. */
  territory: string;
  /** Municipality code within the territory. */
  municipalityCode: number;
  /** Lower-cased fragment of the municipality name, used if the code is missing. */
  nameIncludes: string;
}

export const HOLIDAY_CITIES: readonly HolidayCity[] = [
  {
    id: 'donostia',
    name: 'Donostia / San Sebastián',
    sourceName: 'Open Data Euskadi',
    territory: 'gipuzkoa',
    municipalityCode: 69,
    nameIncludes: 'donostia',
  },
];

export interface OfficialHoliday {
  date: Date;
  /** Spanish description from the dataset. */
  name: string;
}

export type HolidayImportErrorCode = 'network' | 'invalidData';

export class HolidayImportError extends Error {
  readonly code: HolidayImportErrorCode;

  constructor(code: HolidayImportErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'HolidayImportError';
    this.code = code;
  }
}

export function euskadiCalendarUrl(year: number): string {
  return `https://opendata.euskadi.eus/contenidos/ds_eventos/calendario_laboral_${year}/opendata/calendario_laboral_${year}.json`;
}

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** The dataset's field names change case and spelling between years. */
function field(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const key of Object.keys(row)) {
    if (names.includes(key.toLowerCase())) return row[key];
  }
  return undefined;
}

/** `2026/01/20` or `2026/1/20` → local midnight. */
function parseDatasetDate(value: unknown): Date | null {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [year, month, dayOfMonth] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, dayOfMonth);
  const sameDay = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === dayOfMonth;
  return isValidDate(date) && sameDay ? date : null;
}

/**
 * Holidays that apply in `city`: those of the whole Basque Country, those of
 * its territory and the local ones of the municipality. Sorted by date,
 * without duplicates.
 */
export function parseEuskadiCalendar(payload: unknown, city: HolidayCity): OfficialHoliday[] {
  if (!Array.isArray(payload)) throw new HolidayImportError('invalidData', 'not a list');

  const byTime = new Map<number, OfficialHoliday>();
  let recognised = 0;

  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const date = parseDatasetDate(field(row, 'date'));
    if (!date) continue;
    recognised++;

    const territory = normalize(field(row, 'territory'));
    const municipality = normalize(field(row, 'municipalityes'));
    const code = Number(field(row, 'municipalitycode'));

    const wholeCountry = territory.startsWith('todos') || municipality === 'cae';
    const inTerritory = territory === city.territory;
    const territoryWide = inTerritory && municipality === city.territory;
    const local =
      inTerritory &&
      ((Number.isFinite(code) && code === city.municipalityCode && municipality !== city.territory && municipality !== '') ||
        municipality.includes(city.nameIncludes));

    if (!wholeCountry && !territoryWide && !local) continue;
    if (!byTime.has(date.getTime())) {
      byTime.set(date.getTime(), {
        date,
        name: String(field(row, 'descripciones', 'descriptiones') ?? '').trim(),
      });
    }
  }

  if (recognised === 0) throw new HolidayImportError('invalidData', 'no dated rows');
  return [...byTime.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface HolidayImportResult {
  /** Official holidays inside `[start, end]`. */
  holidays: OfficialHoliday[];
  /** Years of the period whose calendar is not published yet. */
  missingYears: number[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Download the official calendars for every year touched by `[start, end]`
 * and keep the holidays of `city` that fall inside the period.
 */
export async function fetchOfficialHolidays(
  city: HolidayCity,
  start: Date,
  end: Date,
  fetchImpl: FetchLike = fetch,
): Promise<HolidayImportResult> {
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const holidays: OfficialHoliday[] = [];
  const missingYears: number[] = [];

  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    let response: Response;
    try {
      response = await fetchImpl(euskadiCalendarUrl(year), {
        // A public file: no cookies, and the publisher does not learn which
        // page asked for it.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-cache',
      });
    } catch (err) {
      throw new HolidayImportError('network', err instanceof Error ? err.message : undefined);
    }
    if (response.status === 404) {
      missingYears.push(year);
      continue;
    }
    if (!response.ok) throw new HolidayImportError('network', `HTTP ${response.status}`);

    let payload: unknown;
    try {
      const text = await response.text();
      // Some years are published with a byte-order mark.
      payload = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch {
      throw new HolidayImportError('invalidData', 'not JSON');
    }
    for (const holiday of parseEuskadiCalendar(payload, city)) {
      const time = holiday.date.getTime();
      if (holiday.date.getFullYear() === year && time >= from && time <= to) holidays.push(holiday);
    }
  }

  return { holidays, missingYears };
}

/** Union of `current` and `imported`, by calendar day, sorted. */
export function mergeHolidayDates(current: Date[], imported: Date[]): { dates: Date[]; added: number } {
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const byTime = new Map(current.map((d) => [dayStart(d).getTime(), dayStart(d)]));
  const before = byTime.size;
  for (const date of imported) byTime.set(dayStart(date).getTime(), dayStart(date));
  return {
    dates: [...byTime.values()].sort((a, b) => a.getTime() - b.getTime()),
    added: byTime.size - before,
  };
}
