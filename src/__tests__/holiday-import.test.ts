import { describe, it, expect } from 'bun:test';
import {
  HOLIDAY_CITIES,
  HolidayImportError,
  euskadiCalendarUrl,
  fetchOfficialHolidays,
  mergeHolidayDates,
  parseEuskadiCalendar,
} from '../lib/holiday-import';
import { toDateKey } from '../lib/dates';

const donostia = HOLIDAY_CITIES[0];
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

/** Rows shaped like the published files, including their year-to-year quirks. */
const calendar = (year: number) => [
  // Whole Basque Country
  { date: `${year}/01/01`, descripcionEs: 'Año Nuevo', municipalityEs: 'CAE', territory: 'Todos/denak', municipalitycode: null },
  { date: `${year}/1/6`, descriptionEs: 'Epifanía', municipalityEs: 'CAE', territory: 'Todos/denak', municipalitycode: '' },
  // Territory-wide
  { date: `${year}/7/31`, descripcionEs: 'San Ignacio', municipalityEs: 'Gipuzkoa', territory: 'Gipuzkoa', municipalitycode: null },
  { date: `${year}/7/25`, descripcionEs: 'Santiago', municipalityEs: 'Bizkaia', territory: 'Bizkaia', municipalitycode: null },
  // Local: padded name, code as float
  { date: `${year}/01/20`, descripcionEs: 'San Sebastián', municipalityEs: 'Donostia-San Sebastian  ', territory: 'Gipuzkoa', municipalitycode: 69.0 },
  // Same code in another territory, and another town of the same territory
  { date: `${year}/8/5`, descripcionEs: 'Fiesta local', municipalityEs: 'Vitoria-Gasteiz', territory: 'Álava - Araba', municipalitycode: 69 },
  { date: `${year}/6/29`, descripcionEs: 'San Pedro', municipalityEs: 'Zarautz', territory: 'Gipuzkoa', municipalitycode: 79 },
  // Junk
  { date: 'not a date', municipalityEs: 'CAE', territory: 'Todos/denak' },
  { date: `${year}/02/31`, municipalityEs: 'CAE', territory: 'Todos/denak' },
];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('parseEuskadiCalendar', () => {
  it('keeps the Basque, territory and local holidays of the city, sorted', () => {
    const result = parseEuskadiCalendar(calendar(2026), donostia);
    expect(result.map((h) => toDateKey(h.date))).toEqual(['2026-01-01', '2026-01-06', '2026-01-20', '2026-07-31']);
    expect(result.map((h) => h.name)).toEqual(['Año Nuevo', 'Epifanía', 'San Sebastián', 'San Ignacio']);
  });

  it('matches the city by name when the code is missing', () => {
    const rows = [
      { date: '2027/1/20', municipalityEs: 'Donostia-San Sebastian', territory: 'Gipuzkoa', municipalitycode: '' },
    ];
    expect(parseEuskadiCalendar(rows, donostia)).toHaveLength(1);
  });

  it('rejects payloads that are not a calendar', () => {
    expect(() => parseEuskadiCalendar({ error: true }, donostia)).toThrow(HolidayImportError);
    expect(() => parseEuskadiCalendar([{ foo: 1 }], donostia)).toThrow(HolidayImportError);
  });
});

describe('fetchOfficialHolidays', () => {
  it('asks for every year of the period and keeps only days inside it', async () => {
    const asked: string[] = [];
    const result = await fetchOfficialHolidays(donostia, day(2026, 7, 1), day(2027, 1, 10), async (url) => {
      asked.push(url);
      return jsonResponse(calendar(Number(/_(\d{4})\.json$/.exec(url)![1])));
    });
    expect(asked).toEqual([euskadiCalendarUrl(2026), euskadiCalendarUrl(2027)]);
    expect(result.holidays.map((h) => toDateKey(h.date))).toEqual(['2026-07-31', '2027-01-01', '2027-01-06']);
    expect(result.missingYears).toEqual([]);
  });

  it('sends no credentials and no referrer', async () => {
    let init: RequestInit | undefined;
    await fetchOfficialHolidays(donostia, day(2026, 1, 1), day(2026, 1, 31), async (_url, i) => {
      init = i;
      return jsonResponse(calendar(2026));
    });
    expect(init?.credentials).toBe('omit');
    expect(init?.referrerPolicy).toBe('no-referrer');
  });

  it('reports years that are not published yet and still imports the others', async () => {
    const result = await fetchOfficialHolidays(donostia, day(2026, 12, 1), day(2027, 1, 31), async (url) =>
      url.includes('2027') ? jsonResponse('not found', 404) : jsonResponse(calendar(2026)),
    );
    expect(result.missingYears).toEqual([2027]);
    expect(result.holidays).toEqual([]);
  });

  it('accepts a byte-order mark', async () => {
    const result = await fetchOfficialHolidays(donostia, day(2026, 1, 1), day(2026, 1, 31), async () =>
      jsonResponse(String.fromCharCode(0xfeff) + JSON.stringify(calendar(2026))),
    );
    expect(result.holidays).toHaveLength(3);
  });

  it('turns failures into typed errors', async () => {
    const run = (impl: () => Promise<Response>) =>
      fetchOfficialHolidays(donostia, day(2026, 1, 1), day(2026, 1, 31), impl).then(
        () => 'ok',
        (e: HolidayImportError) => e.code,
      );
    expect(await run(async () => { throw new TypeError('Failed to fetch'); })).toBe('network');
    expect(await run(async () => jsonResponse('oops', 500))).toBe('network');
    expect(await run(async () => jsonResponse('<html>'))).toBe('invalidData');
  });
});

describe('mergeHolidayDates', () => {
  it('adds only new days and keeps the manual ones', () => {
    const { dates, added } = mergeHolidayDates([day(2026, 1, 20), day(2026, 3, 3)], [day(2026, 1, 1), day(2026, 1, 20)]);
    expect(added).toBe(1);
    expect(dates.map(toDateKey)).toEqual(['2026-01-01', '2026-01-20', '2026-03-03']);
  });
});
