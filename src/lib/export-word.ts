import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType,
} from 'docx';
import {
  format,
  startOfMonth,
  endOfMonth,
  isSameDay,
  eachMonthOfInterval,
  isSameMonth as isSameMonthDateFns,
  startOfWeek,
  endOfWeek,
  addDays,
  isWithinInterval,
} from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import type { Schedule, DoctorProfile } from './types';

interface ExportWordParams {
  schedule: Schedule;
  doctorsProfiles: DoctorProfile[];
  scheduleWarnings: string[];
  currentMinInterval: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
}

// Design tokens (hex without #)
const C_NAVY        = '0f172a'; // sidebar dark
const C_PRIMARY     = '2563eb'; // electric blue
const C_PRIMARY_LT  = 'dbeafe'; // assigned-cell tint
const C_TOTAL_BG    = 'f1f5f9'; // totals row background
const C_STRIPE      = 'f8fafc'; // alternate row
const C_WHITE       = 'ffffff';
const C_TEXT        = '0f172a'; // body text
const C_TEXT_BLUE   = '1d4ed8'; // numeric emphasis

const navyShading  = { type: ShadingType.CLEAR, color: 'auto', fill: C_NAVY };
const blueShading  = { type: ShadingType.CLEAR, color: 'auto', fill: C_PRIMARY_LT };
const totalShading = { type: ShadingType.CLEAR, color: 'auto', fill: C_TOTAL_BG };
const stripeShading = { type: ShadingType.CLEAR, color: 'auto', fill: C_STRIPE };

const borderDef    = { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' };
const tableBorders = {
  top: borderDef, bottom: borderDef, left: borderDef, right: borderDef,
  insideHorizontal: borderDef, insideVertical: borderDef,
};

// Helper: header cell (navy bg, white bold text)
function headerCell(text: string, widthPct?: number): TableCell {
  return new TableCell({
    shading: navyShading,
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, size: 18, color: C_WHITE })],
    })],
  });
}

// Helper: data cell
function dataCell(
  text: string,
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; shading?: Record<string, string>; color?: string; size?: number } = {},
): TableCell {
  return new TableCell({
    shading: opts.shading,
    children: [new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      children: [new TextRun({
        text,
        bold: opts.bold ?? false,
        size: opts.size ?? 16,
        color: opts.color ?? C_TEXT,
      })],
    })],
  });
}

export async function exportWord({
  schedule,
  doctorsProfiles,
  scheduleWarnings,
  currentMinInterval,
  t,
  locale,
}: ExportWordParams): Promise<void> {
  const getDoctorNameById = (id: string) =>
    doctorsProfiles.find((d) => d.id === id)?.name || id;

  const getDoctorForDay = (day: Date) => {
    const entries = schedule.entries.filter(
      (e) =>
        isSameDay(e.date, day) &&
        (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
        e.doctorId !== 'system',
    );
    return entries.map((e) => getDoctorNameById(e.doctorId)).join(', ');
  };

  const allMonths = eachMonthOfInterval({ start: schedule.startDate, end: schedule.endDate })
    .map((m) => startOfMonth(m));

  const children: (Paragraph | Table)[] = [];

  // ----------------------------------------------------------------
  // Cover / header section
  // ----------------------------------------------------------------
  children.push(new Paragraph({
    children: [new TextRun({ text: t('pdf.reportTitle'), bold: true, size: 36, color: C_NAVY })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({
      text: t('pdf.schedulePeriod', {
        startDate: format(schedule.startDate, 'PPP', { locale }),
        endDate:   format(schedule.endDate,   'PPP', { locale }),
      }),
      size: 20, color: '475569',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }));

  const intervalToDisplay = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
  children.push(new Paragraph({
    children: [new TextRun({ text: t('pdf.minIntervalInfo', { interval: intervalToDisplay }), size: 18, color: '64748b' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
  }));

  // Divider paragraph (simulated by top border)
  children.push(new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY } },
    spacing: { after: 320 },
  }));

  // ----------------------------------------------------------------
  // Warnings
  // ----------------------------------------------------------------
  if (scheduleWarnings.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: t('pdf.warningsTitle'), bold: true, size: 24, color: C_NAVY })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
    }));
    scheduleWarnings.forEach((w) =>
      children.push(new Paragraph({
        children: [new TextRun({ text: `• ${w}`, size: 18, color: C_TEXT })],
        spacing: { after: 60 },
      })),
    );
  }

  // ----------------------------------------------------------------
  // Monthly calendar grids
  // ----------------------------------------------------------------
  for (const monthStart of allMonths) {
    const monthTitle = format(monthStart, 'MMMM yyyy', { locale });

    children.push(new Paragraph({
      children: [new TextRun({ text: monthTitle, bold: true, size: 26, color: C_NAVY })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 480, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_PRIMARY } },
    }));

    const lastDay  = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart, { locale });
    const calEnd   = endOfWeek(lastDay, { locale });

    const weekDayHeaders = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(calStart, i);
      const key = format(day, 'EEE', { locale: enUS }).toLowerCase();
      return t(`pdf.workdaysSummary.${key}Header` as Parameters<typeof t>[0]);
    });

    const monthMatrixBody: string[][] = [];
    let currentWeekRow: string[] = [];
    let dayIter = new Date(calStart);

    while (dayIter <= calEnd) {
      let cellContent = '';
      if (
        isSameMonthDateFns(dayIter, monthStart) &&
        isWithinInterval(dayIter, { start: schedule.startDate, end: schedule.endDate })
      ) {
        const doctorName = getDoctorForDay(dayIter);
        cellContent = format(dayIter, 'd');
        if (doctorName) cellContent += `\n${doctorName}`;
      } else if (isSameMonthDateFns(dayIter, monthStart)) {
        cellContent = format(dayIter, 'd');
      }
      currentWeekRow.push(cellContent);
      if (currentWeekRow.length === 7 || isSameDay(dayIter, calEnd)) {
        monthMatrixBody.push([...currentWeekRow]);
        currentWeekRow = [];
      }
      dayIter = addDays(dayIter, 1);
    }

    children.push(new Table({
      rows: [
        // Header row
        new TableRow({
          children: weekDayHeaders.map((h) => headerCell(h, 14.28)),
          tableHeader: true,
        }),
        // Data rows
        ...monthMatrixBody.map((row) =>
          new TableRow({
            children: row.map((cell) => {
              const [dayNum, ...rest] = cell.split('\n');
              const doctorName = rest.join(' ').trim();
              const hasDoctor = Boolean(doctorName);

              return new TableCell({
                shading: hasDoctor ? blueShading : undefined,
                width: { size: 14.28, type: WidthType.PERCENTAGE },
                children: [new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 0 },
                  children: [
                    new TextRun({ text: dayNum, bold: hasDoctor, size: 16, color: hasDoctor ? C_PRIMARY : C_TEXT }),
                    ...(hasDoctor
                      ? [new TextRun({ text: `\n${doctorName}`, size: 14, color: C_TEXT, bold: false })]
                      : []),
                  ],
                })],
              });
            }),
          }),
        ),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
    }));
  }

  // ----------------------------------------------------------------
  // Doctor details
  // ----------------------------------------------------------------
  for (const doctor of doctorsProfiles) {
    children.push(new Paragraph({
      children: [new TextRun({ text: t('pdf.doctorDetailsTitle', { doctorName: doctor.name }), bold: true, size: 24, color: C_NAVY })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 480, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_PRIMARY } },
    }));

    if (doctor.isExcludedFromAutomaticAssignment) {
      children.push(new Paragraph({
        children: [new TextRun({ text: t('pdf.doctorIsExcludedFromAuto'), italics: true, size: 16, color: '64748b' })],
        spacing: { after: 120 },
      }));
    }

    const getFormattedDates = (dates: Date[]) =>
      dates.length > 0
        ? dates.map((d) => format(d, 'PPP', { locale })).join(', ')
        : t('pdf.none');

    const workDatesSet = new Set<number>();
    doctor.preAssignedWorkDates.forEach((d) => workDatesSet.add(d.getTime()));
    schedule.entries.forEach((e) => {
      if (e.doctorId === doctor.id && e.assignment === 'Work') workDatesSet.add(e.date.getTime());
    });
    const allWorkDates = Array.from(workDatesSet)
      .map((ts) => new Date(ts))
      .sort((a, b) => a.getTime() - b.getTime());

    children.push(new Table({
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell(t('pdf.workDaysHeader'), 25),
            headerCell(t('pdf.datesHeader'), 75),
          ],
        }),
        new TableRow({
          children: [
            dataCell(t('pdf.workDays'), { bold: true }),
            dataCell(getFormattedDates(allWorkDates)),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
    }));
  }

  // ----------------------------------------------------------------
  // Workdays summary
  // ----------------------------------------------------------------
  children.push(new Paragraph({
    children: [new TextRun({ text: t('pdf.workdaysSummary.title'), bold: true, size: 24, color: C_NAVY })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 480, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_PRIMARY } },
  }));

  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const summaryData = doctorsProfiles.map((doctor) => {
    const row: Record<string, string | number> = { doctorName: doctor.name };
    dayKeys.forEach((k) => (row[k] = 0));
    row['Total'] = 0;
    schedule.entries
      .filter((e) => e.doctorId === doctor.id && (e.assignment === 'Work' || e.assignment === 'Pre-assigned'))
      .forEach((e) => {
        const k = format(e.date, 'EEE', { locale: enUS });
        if (dayKeys.includes(k)) {
          (row[k] as number)++;
          (row['Total'] as number)++;
        }
      });
    return row;
  });

  children.push(new Table({
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell(t('pdf.workdaysSummary.doctorHeader')),
          ...dayKeys.map((k) => headerCell(t(`pdf.workdaysSummary.${k.toLowerCase()}Header` as Parameters<typeof t>[0]))),
          headerCell(t('pdf.workdaysSummary.totalHeader')),
        ],
      }),
      ...summaryData.map((s, rowIdx) =>
        new TableRow({
          children: [
            dataCell(String(s.doctorName), { shading: rowIdx % 2 === 1 ? stripeShading : undefined }),
            ...dayKeys.map((k) => dataCell(String(s[k]), {
              align: AlignmentType.CENTER,
              shading: rowIdx % 2 === 1 ? stripeShading : undefined,
            })),
            dataCell(String(s.Total), {
              align: AlignmentType.CENTER,
              bold: true,
              color: C_TEXT_BLUE,
              shading: rowIdx % 2 === 1 ? stripeShading : undefined,
            }),
          ],
        }),
      ),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
  }));

  // ----------------------------------------------------------------
  // Monthly workload summary
  // ----------------------------------------------------------------
  children.push(new Paragraph({
    children: [new TextRun({ text: t('pdf.monthlyWorkloadSummary.title'), bold: true, size: 24, color: C_NAVY })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 480, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_PRIMARY } },
  }));

  const monthHeaders = allMonths.map((m) => format(m, 'MMM yy', { locale }));
  const monthlyBody: (string | number)[][] = [];
  const monthTotals = new Map<string, number>();
  allMonths.forEach((m) => monthTotals.set(format(m, 'yyyy-MM'), 0));
  let grandTotal = 0;

  for (const doctor of doctorsProfiles) {
    const row: (string | number)[] = [doctor.name];
    let doctorTotal = 0;
    for (const month of allMonths) {
      const key = format(month, 'yyyy-MM');
      let count = 0;
      schedule.entries.forEach((e) => {
        if (
          e.doctorId === doctor.id &&
          (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
          isSameMonthDateFns(e.date, month)
        ) count++;
      });
      row.push(count);
      doctorTotal += count;
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + count);
    }
    row.push(doctorTotal);
    grandTotal += doctorTotal;
    monthlyBody.push(row);
  }

  const totalsRow: (string | number)[] = [t('pdf.monthlyWorkloadSummary.totalHeader')];
  allMonths.forEach((m) => totalsRow.push(monthTotals.get(format(m, 'yyyy-MM')) ?? 0));
  totalsRow.push(grandTotal);
  monthlyBody.push(totalsRow);

  const lastBodyRowIdx = monthlyBody.length - 1;

  children.push(new Table({
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell(t('pdf.monthlyWorkloadSummary.doctorHeader')),
          ...monthHeaders.map((h) => headerCell(h)),
          headerCell(t('pdf.monthlyWorkloadSummary.totalHeader')),
        ],
      }),
      ...monthlyBody.map((row, rowIdx) => {
        const isTotalRow = rowIdx === lastBodyRowIdx;
        const rowShading = isTotalRow ? totalShading : (rowIdx % 2 === 1 ? stripeShading : undefined);
        return new TableRow({
          children: row.map((cell, colIdx) =>
            dataCell(String(cell), {
              align: colIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
              bold: isTotalRow || colIdx === row.length - 1,
              color: (colIdx === row.length - 1 && !isTotalRow) ? C_TEXT_BLUE : C_TEXT,
              shading: rowShading,
            }),
          ),
        });
      }),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
  }));

  // ----------------------------------------------------------------
  // Footer
  // ----------------------------------------------------------------
  children.push(new Paragraph({
    children: [new TextRun({
      text: t('pdf.generatedOn', { date: format(new Date(), 'PPP p', { locale }) }),
      size: 16, italics: true, color: '94a3b8',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 480 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' } },
  }));

  // ----------------------------------------------------------------
  // Generate and download
  // ----------------------------------------------------------------
  const doc  = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `${t('pdf.reportTitle')}_${format(new Date(), 'yyyy-MM-dd')}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
