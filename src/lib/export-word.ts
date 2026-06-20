import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, HeightRule,
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
import type { Locale } from 'date-fns';
import type { Schedule, DoctorProfile } from './types';

interface ExportWordParams {
  schedule: Schedule;
  doctorsProfiles: DoctorProfile[];
  fileName: string | null;
  locale: Locale;
}

const FONT = 'Inter';

const C_TEXT          = '0f172a';
const C_PRIMARY       = '2563eb';
const C_WHITE         = 'ffffff';
const C_HEADER_BG     = 'f1f5f9';
const C_UNASSIGNED_BG = 'eff6ff';

const headerShading     = { type: ShadingType.CLEAR, color: 'auto', fill: C_HEADER_BG };
const whiteShading      = { type: ShadingType.CLEAR, color: 'auto', fill: C_WHITE };
const unassignedShading = { type: ShadingType.CLEAR, color: 'auto', fill: C_UNASSIGNED_BG };

const cellMargins = { top: 80, bottom: 80, left: 100, right: 100 };

const borderDef    = { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' };
const tableBorders = {
  top: borderDef, bottom: borderDef, left: borderDef, right: borderDef,
  insideHorizontal: borderDef, insideVertical: borderDef,
};

const MONTHS_PER_PAGE = 2;
const ROW_MIN_HEIGHT = 500;

function headerCell(text: string, widthPct?: number): TableCell {
  return new TableCell({
    shading: headerShading,
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: cellMargins,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 20, color: C_TEXT, font: FONT })],
    })],
  });
}

export async function exportWord({
  schedule,
  doctorsProfiles,
  fileName,
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

  const title = (fileName?.replace(/\.(rw|json)$/, '').replace(/[_-]+/g, ' ').trim()) || 'Rotawise schedule';

  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 40, color: C_TEXT, font: FONT })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 320 },
  }));

  allMonths.forEach((monthStart, index) => {
    const isFirstOfPage = index % MONTHS_PER_PAGE === 0;

    if (isFirstOfPage && index > 0) {
      children.push(new Paragraph({
        children: [],
        pageBreakBefore: true,
        spacing: { before: 0, after: 0 },
      }));
    }

    const monthTitle = format(monthStart, 'MMMM yyyy', { locale });
    const monthTitleCapped = monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1);

    children.push(new Paragraph({
      children: [new TextRun({ text: monthTitleCapped, bold: true, size: 28, color: C_TEXT, font: FONT })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
    }));

    const lastDay  = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart, { locale });
    const calEnd   = endOfWeek(lastDay, { locale });

    const weekDayHeaders = Array.from({ length: 7 }, (_, i) =>
      format(addDays(calStart, i), 'EEE', { locale }).replace(/\.$/, ''),
    );

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
        new TableRow({
          children: weekDayHeaders.map((h) => headerCell(h, 14.28)),
          tableHeader: true,
        }),
        ...monthMatrixBody.map((row) =>
          new TableRow({
            height: { value: ROW_MIN_HEIGHT, rule: HeightRule.ATLEAST },
            children: row.map((cell) => {
              const [dayNum, ...rest] = cell.split('\n');
              const doctorName = rest.join(' ').trim();
              const hasDoctor = Boolean(doctorName);
              const hasDayNumber = dayNum.length > 0;
              const isUnassigned = !hasDoctor && hasDayNumber;

              return new TableCell({
                shading: isUnassigned ? unassignedShading : whiteShading,
                width: { size: 14.28, type: WidthType.PERCENTAGE },
                margins: cellMargins,
                children: [new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: dayNum,
                      bold: hasDoctor,
                      size: 26,
                      color: hasDoctor ? C_PRIMARY : C_TEXT,
                      font: FONT,
                    }),
                    ...(hasDoctor
                      ? [new TextRun({ text: `\n${doctorName}`, size: 22, color: C_TEXT, bold: false, font: FONT })]
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

    const nextMonthStartsOnNewPage = (index + 1) % MONTHS_PER_PAGE === 0;
    if (index < allMonths.length - 1 && !nextMonthStartsOnNewPage) {
      children.push(new Paragraph({
        children: [],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' } },
        spacing: { before: 240, after: 240 },
      }));
    }
  });

  const baseName = fileName?.replace(/\.(rw|json)$/, '') ?? null;
  const docxName = baseName
    ? `${baseName}.docx`
    : `rotawise-schedule_${format(new Date(), 'yyyy-MM-dd')}.docx`;

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1080,
            bottom: 1080,
            left: 360,
            right: 360,
          },
        },
      },
      children,
    }],
  });
  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = docxName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
