import ExcelJS, { type WorksheetProtection } from 'exceljs';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  isSameMonth as isSameMonthDateFns,
  isWithinInterval,
} from 'date-fns';
import type { Locale } from 'date-fns';
import type {
  Schedule,
  DoctorProfile,
  SerializedUnit,
  SerializedScheduleEntry,
  SerializedDoctorProfile,
  ExcelMetadataPayload,
  ScheduleEntry,
} from './types';

interface ExportExcelParams {
  schedule: Schedule;
  doctorsProfiles: DoctorProfile[];
  units: SerializedUnit[];
  holidays?: Date[];
  fileName: string | null;
  locale: Locale;
}

const HEADER_BG     = 'FFF1F5F9';
const ROW_ALT_BG    = 'FFF8FAFC';
const WEEKEND_BG    = 'FFEEEEEE';
const HOLIDAY_BG    = 'FFFFF4E5'; // amber-50
const C_UNASSIGNED  = 'FF94A3B8'; // slate-400
const C_WEEKEND_DAY = 'FF475569'; // slate-600 — readable on WEEKEND_BG
const C_WEEKEND_DOC = 'FF334155'; // slate-700 — doctor name on weekend

function getDoctorNameById(doctorsProfiles: DoctorProfile[], id: string): string {
  return doctorsProfiles.find((d) => d.id === id)?.name || id;
}

function getOnCallForDay(
  schedule: Schedule,
  doctorsProfiles: DoctorProfile[],
  day: Date,
): string {
  const work = schedule.entries.filter(
    (e) =>
      isSameDay(e.date instanceof Date ? e.date : new Date(e.date), day) &&
      (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
      e.doctorId !== 'system',
  );
  // We only care about who is ON CALL (Work / Pre-assigned). Vacations,
  // excluded dates, and Off entries are intentionally excluded.
  return work.map((e) => getDoctorNameById(doctorsProfiles, e.doctorId)).join(', ');
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isHoliday(d: Date, holidays: Date[]): boolean {
  return holidays.some(
    (h) =>
      h.getFullYear() === d.getFullYear() &&
      h.getMonth() === d.getMonth() &&
      h.getDate() === d.getDate(),
  );
}

function borderAll() {
  const side = { style: 'thin' as const, color: { argb: 'FFE2E8F0' } };
  return {
    top: side,
    left: side,
    right: side,
    bottom: side,
  };
}

function populateMonthlySheets(
  workbook: ExcelJS.Workbook,
  schedule: Schedule,
  doctorsProfiles: DoctorProfile[],
  holidays: Date[],
  locale: Locale,
): void {
  const monthStarts = (() => {
    const out: Date[] = [];
    let cursor = startOfMonth(schedule.startDate);
    const end = startOfMonth(schedule.endDate);
    while (cursor <= end) {
      out.push(new Date(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return out;
  })();

  for (const monthStart of monthStarts) {
    const sheetName = format(monthStart, 'MMM yyyy', { locale });
    const sheet = workbook.addWorksheet(sheetName);

    for (let c = 1; c <= 7; c++) {
      const col = sheet.getColumn(c);
      col.width = 18;
      col.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    }

    const calStart = startOfWeek(monthStart, { locale });
    const calEnd = endOfMonth(monthStart);
    const lastDayOfGrid = endOfWeek(calEnd, { locale });

    // Header row (Mon..Sun)
    const headerRow = sheet.getRow(1);
    for (let i = 0; i < 7; i++) {
      const cell = headerRow.getCell(i + 1);
      cell.value = format(addDays(calStart, i), 'EEE', { locale }).replace(/\.$/, '');
      cell.font = { bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
      cell.alignment = { horizontal: 'center' };
      cell.border = borderAll();
    }
    headerRow.height = 20;

    // Body rows — two rows per week: day numbers (row) + doctor names (row+1).
    // Using separate rows avoids `\n` in cell values, which would otherwise
    // trigger an Excel repair warning "String properties from sharedStrings.xml"
    // because the OOXML shared strings table does not add xml:space="preserve"
    // for strings containing newlines.
    let weekIndex = 0;
    let dayIter = new Date(calStart);
    while (dayIter <= lastDayOfGrid) {
      const dayRow = sheet.getRow(2 + weekIndex * 2);
      dayRow.height = 20;

      for (let col = 0; col < 7; col++) {
        const cell = dayRow.getCell(col + 1);
        const day = addDays(calStart, weekIndex * 7 + col);
        const inMonth = isSameMonthDateFns(day, monthStart);
        const inRange = isWithinInterval(day, { start: schedule.startDate, end: schedule.endDate });

        if (inMonth && inRange) {
          const dayNum = day.getDate();
          const onCall = getOnCallForDay(schedule, doctorsProfiles, day);
          const weekend = isWeekend(day);
          const holiday = isHoliday(day, holidays);

          cell.value = dayNum;
          cell.alignment = { horizontal: 'left', vertical: 'top' };

          if (holiday) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOLIDAY_BG } };
            cell.font = { bold: true, color: { argb: 'FF92400E' } };
          } else if (weekend) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WEEKEND_BG } };
            cell.font = { color: { argb: C_WEEKEND_DAY } };
          } else {
            const altBg = weekIndex % 2 === 1;
            cell.fill = altBg
              ? { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT_BG } }
              : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            if (!onCall) {
              cell.font = { color: { argb: C_UNASSIGNED }, italic: true };
            }
          }
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        }
        cell.border = borderAll();
      }

      // Doctor name row
      const nameRow = sheet.getRow(2 + weekIndex * 2 + 1);
      nameRow.height = 20;

      for (let col = 0; col < 7; col++) {
        const cell = nameRow.getCell(col + 1);
        const day = addDays(calStart, weekIndex * 7 + col);
        const inMonth = isSameMonthDateFns(day, monthStart);
        const inRange = isWithinInterval(day, { start: schedule.startDate, end: schedule.endDate });

        if (inMonth && inRange) {
          const onCall = getOnCallForDay(schedule, doctorsProfiles, day);
          const weekend = isWeekend(day);
          const holiday = isHoliday(day, holidays);

          cell.value = onCall || '—';
          cell.alignment = { horizontal: 'left', vertical: 'top' };

          if (holiday) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOLIDAY_BG } };
            cell.font = { bold: true, color: { argb: 'FF92400E' } };
          } else if (weekend) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WEEKEND_BG } };
            cell.font = onCall
              ? { color: { argb: C_WEEKEND_DOC } }
              : { color: { argb: 'FF64748B' }, italic: true };
          } else {
            const altBg = weekIndex % 2 === 1;
            cell.fill = altBg
              ? { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT_BG } }
              : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            cell.font = onCall
              ? { color: { argb: 'FF0F172A' } }
              : { color: { argb: C_UNASSIGNED }, italic: true };
          }
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        }
        cell.border = borderAll();
      }

      weekIndex++;
      dayIter = addDays(dayIter, 7);
    }
  }
}

// --- Hidden metadata sheets for re-opening the schedule in Rotawise ---
const META_SHEET = '_rw_meta';
const SCHEDULE_SHEET = '_rw_schedule';
const DOCTORS_SHEET = '_rw_doctors';
const ENTRIES_SHEET = '_rw_entries';
const UNITS_SHEET = '_rw_units';
const HOLIDAYS_SHEET = '_rw_holidays';

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function datesStr(dates: Date[]): string {
  return dates.map(dateStr).join(', ');
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function parseDates(s: string): Date[] {
  if (!s) return [];
  return s.split(',').map((d) => parseDate(d.trim()));
}

function populateMetadataSheets(
  workbook: ExcelJS.Workbook,
  schedule: Schedule,
  doctorsProfiles: DoctorProfile[],
  units: SerializedUnit[],
  holidays: Date[],
): void {
  // _rw_meta — scalar values
  const hidden = { state: 'veryHidden' as const };
  {
    const sheet = workbook.addWorksheet(META_SHEET, hidden);
    sheet.getCell('A1').value = 'key';
    sheet.getCell('B1').value = 'value';
    sheet.getCell('A2').value = 'fileVersion';
    sheet.getCell('B2').value = 3;
    sheet.getCell('A3').value = 'minIntervalBetweenWorkDays';
    sheet.getCell('B3').value = schedule.minIntervalBetweenWorkDays ?? 1;
    sheet.getCell('A4').value = 'globalMonthlyShiftLimit';
    sheet.getCell('B4').value = schedule.globalMonthlyShiftLimit ?? '';
  }

  // _rw_schedule
  {
    const sheet = workbook.addWorksheet(SCHEDULE_SHEET, hidden);
    sheet.getCell('A1').value = 'startDate';
    sheet.getCell('B1').value = 'endDate';
    sheet.getCell('A2').value = dateStr(schedule.startDate);
    sheet.getCell('B2').value = dateStr(schedule.endDate);
  }

  // _rw_doctors — fields needed for coverage calculation and visible sheet display.
  // `freeDates` is stored because the coverage check subtracts doctors on free days.
  {
    const sheet = workbook.addWorksheet(DOCTORS_SHEET, hidden);
    const h = ['id', 'name', 'unitId', 'freeDates'];
    h.forEach((col, i) => { sheet.getRow(1).getCell(i + 1).value = col; });
    doctorsProfiles.forEach((d, i) => {
      const row = sheet.getRow(i + 2);
      row.getCell(1).value = d.id;
      row.getCell(2).value = d.name;
      row.getCell(3).value = d.unitId ?? '';
      row.getCell(4).value = datesStr(d.freeDates);
    });
  }

  // _rw_entries — only fields needed for coverage calculation and visible sheet display
  {
    const sheet = workbook.addWorksheet(ENTRIES_SHEET, hidden);
    const h = ['date', 'doctorId', 'assignment'];
    h.forEach((col, i) => { sheet.getRow(1).getCell(i + 1).value = col; });
    schedule.entries.forEach((e, i) => {
      const row = sheet.getRow(i + 2);
      row.getCell(1).value = dateStr(e.date);
      row.getCell(2).value = e.doctorId;
      row.getCell(3).value = e.assignment;
    });
  }

  // _rw_units
  {
    const sheet = workbook.addWorksheet(UNITS_SHEET, hidden);
    const h = ['id', 'name', 'minPostCallCoverage'];
    h.forEach((col, i) => { sheet.getRow(1).getCell(i + 1).value = col; });
    units.forEach((u, i) => {
      const row = sheet.getRow(i + 2);
      row.getCell(1).value = u.id;
      row.getCell(2).value = u.name;
      row.getCell(3).value = u.minPostCallCoverage;
    });
  }

  // _rw_holidays
  {
    const sheet = workbook.addWorksheet(HOLIDAYS_SHEET, hidden);
    sheet.getCell('A1').value = 'date';
    holidays.forEach((h, i) => {
      sheet.getCell(`A${i + 2}`).value = dateStr(h);
    });
  }
}

/**
 * Extract the Rotawise metadata stored in hidden Excel sheets.
 * Returns the full payload or null if the metadata sheets are absent.
 */
export async function extractExcelMetadata(
  buffer: ArrayBuffer,
  _locale?: Locale,
): Promise<ExcelMetadataPayload | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const metaSheet = workbook.getWorksheet(META_SHEET);
  if (!metaSheet) return null;

  const cellVal = (r: number, c: number) => metaSheet.getCell(r, c).value as string | number | undefined;

  // Read scalar values from _rw_meta
  const readMeta = (key: string): string | number | undefined => {
    for (let r = 2; r <= metaSheet.rowCount; r++) {
      if (cellVal(r, 1) === key) return cellVal(r, 2);
    }
    return undefined;
  };

  const fileVersion = readMeta('fileVersion');
  if (fileVersion !== 3) return null;

  const minIntervalBetweenWorkDays = (readMeta('minIntervalBetweenWorkDays') as number) ?? 1;
  const gmsl = readMeta('globalMonthlyShiftLimit');

  // Read schedule dates
  const schedSheet = workbook.getWorksheet(SCHEDULE_SHEET);
  if (!schedSheet) return null;
  const startDate = dateStr(parseDate(schedSheet.getCell('A2').value as string));
  const endDate = dateStr(parseDate(schedSheet.getCell('B2').value as string));

  // Read entries — only date, doctorId, assignment stored
  const entries: SerializedScheduleEntry[] = [];
  const entriesSheet = workbook.getWorksheet(ENTRIES_SHEET);
  if (entriesSheet) {
    entriesSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      entries.push({
        date: row.getCell(1).value as string,
        doctorId: row.getCell(2).value as string,
        assignment: row.getCell(3).value as ScheduleEntry['assignment'],
      });
    });
  }

  // Read doctors — only id, name, unitId, freeDates stored
  const doctorsProfiles: SerializedDoctorProfile[] = [];
  const doctorsSheet = workbook.getWorksheet(DOCTORS_SHEET);
  if (doctorsSheet) {
    doctorsSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      doctorsProfiles.push({
        id: row.getCell(1).value as string,
        name: row.getCell(2).value as string,
        unitId: (row.getCell(3).value as string) || undefined,
        freeDates: parseDates(row.getCell(4).value as string).map(dateStr),
        preAssignedWorkDates: [],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
      });
    });
  }

  // Read units
  const units: SerializedUnit[] = [];
  const unitsSheet = workbook.getWorksheet(UNITS_SHEET);
  if (unitsSheet) {
    unitsSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      units.push({
        id: row.getCell(1).value as string,
        name: row.getCell(2).value as string,
        minPostCallCoverage: row.getCell(3).value as number,
      });
    });
  }

  // Read holidays
  const holidays: string[] = [];
  const holidaysSheet = workbook.getWorksheet(HOLIDAYS_SHEET);
  if (holidaysSheet) {
    holidaysSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      holidays.push(row.getCell(1).value as string);
    });
  }

  return {
    fileVersion: 3,
    schedule: {
      startDate,
      endDate,
      entries,
      minIntervalBetweenWorkDays,
      ...(gmsl !== undefined && gmsl !== ''
        ? { globalMonthlyShiftLimit: gmsl as number }
        : {}),
    },
    doctorsProfiles,
    units,
    holidays,
    formValues: { minIntervalBetweenWorkDays },
  };
}

/**
 * Derive a deterministic password from the schedule data so that cells
 * cannot be modified directly in Excel. The password is a deterrent, not
 * security — the same input always produces the same output, so Rotawise
 * can regenerate valid xlsx files without knowing a user-chosen secret.
 */
export function deriveProtectPassword(
  schedule: Schedule,
  doctorsProfiles: DoctorProfile[],
  units: SerializedUnit[],
): string {
  const data = [
    schedule.startDate.toISOString(),
    schedule.endDate.toISOString(),
    schedule.entries.length.toString(),
    doctorsProfiles.map((d) => `${d.id}:${d.unitId ?? ''}`).join(','),
    units.map((u) => `${u.id}:${u.minPostCallCoverage}`).join(','),
  ].join('|');
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h) + data.charCodeAt(i);
    h |= 0;
  }
  return `rw${h.toString(36)}`;
}

/**
 * Build the .xlsx as an in-memory ArrayBuffer. The workbook contains
 * monthly calendar sheets plus hidden metadata sheets for re-opening
 * the schedule in Rotawise. All sheets are protected so cells cannot
 * be edited directly — users must use Rotawise to modify data.
 */
export async function buildWorkbookBuffer(
  schedule: Schedule,
  doctorsProfiles: DoctorProfile[],
  units: SerializedUnit[],
  holidays: Date[],
  locale: Locale,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rotawise';
  workbook.modified = new Date();
  workbook.lastModifiedBy = 'Rotawise';
  populateMonthlySheets(workbook, schedule, doctorsProfiles, holidays, locale);
  populateMetadataSheets(workbook, schedule, doctorsProfiles, units, holidays);

  const password = deriveProtectPassword(schedule, doctorsProfiles, units);
  const protectOptions: Partial<WorksheetProtection> = {
    selectLockedCells: true,
    selectUnlockedCells: true,
    spinCount: 10000,
  };
  const promises: Promise<void>[] = [];
  workbook.eachSheet((sheet) => {
    promises.push(sheet.protect(password, protectOptions));
  });
  await Promise.all(promises);

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/**
 * Public helper for useFileSystem.saveExcelMetadata: build the workbook
 * and write it to the given FileSystemFileHandle.
 */
export async function writeExcelToHandle(
  handle: FileSystemFileHandle,
  schedule: Schedule,
  doctorsProfiles: DoctorProfile[],
  units: SerializedUnit[],
  holidays: Date[],
  locale: Locale,
): Promise<void> {
  const buffer = await buildWorkbookBuffer(
    schedule,
    doctorsProfiles,
    units,
    holidays,
    locale,
  );
  const writable = await handle.createWritable();
  await writable.write(buffer);
  await writable.close();
}

/**
 * Export the schedule as a multi-sheet Excel workbook. One sheet per
 * month, each rendering a 7-column calendar grid. Only the on-call
 * doctor (Work / Pre-assigned) is listed — vacations, excluded dates
 * and "Off" days are intentionally omitted. Weekends get a grey
 * background, holidays get an amber background, and unassigned days
 * are rendered with a muted fallback doctor name.
 */
export async function exportExcel({
  schedule,
  doctorsProfiles,
  units,
  holidays = [],
  fileName,
  locale,
}: ExportExcelParams): Promise<void> {
  const buffer = await buildWorkbookBuffer(
    schedule,
    doctorsProfiles,
    units,
    holidays,
    locale,
  );
  const baseName = fileName?.replace(/\.(rw|json)$/, '') ?? null;
  const xlsxName = baseName
    ? `${baseName}.xlsx`
    : `rotawise-schedule_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = xlsxName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
