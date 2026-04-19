import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
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

export async function exportWord({
  schedule,
  doctorsProfiles,
  scheduleWarnings,
  currentMinInterval,
  t,
  locale,
}: ExportWordParams): Promise<void> {
  const getDoctorNameById = (id: string) => doctorsProfiles.find((d) => d.id === id)?.name || id;

  const getDoctorForDay = (day: Date) => {
    const entries = schedule.entries.filter(
      (e) => isSameDay(e.date, day) && (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && e.doctorId !== 'system',
    );
    return entries.map((e) => getDoctorNameById(e.doctorId)).join(', ');
  };

  const allMonths = eachMonthOfInterval({ start: schedule.startDate, end: schedule.endDate }).map((m) => startOfMonth(m));
  const children: (Paragraph | Table)[] = [];

  const borderDef = { style: BorderStyle.SINGLE, size: 1 };
  const tableBorders = { top: borderDef, bottom: borderDef, left: borderDef, right: borderDef, insideHorizontal: borderDef, insideVertical: borderDef };

  // Title
  children.push(new Paragraph({ children: [new TextRun({ text: t('pdf.reportTitle'), bold: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { after: 240 } }));

  // Period
  children.push(new Paragraph({
    children: [new TextRun({ text: t('pdf.schedulePeriod', { startDate: format(schedule.startDate, 'PPP', { locale }), endDate: format(schedule.endDate, 'PPP', { locale }) }), size: 20 })],
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
  }));

  // Min interval
  const intervalToDisplay = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
  children.push(new Paragraph({ children: [new TextRun({ text: t('pdf.minIntervalInfo', { interval: intervalToDisplay }), size: 20 })], alignment: AlignmentType.CENTER, spacing: { after: 240 } }));

  // Warnings
  if (scheduleWarnings.length > 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: t('pdf.warningsTitle'), bold: true, size: 24 })], heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }));
    scheduleWarnings.forEach((w) => children.push(new Paragraph({ children: [new TextRun({ text: `• ${w}`, size: 18 })], spacing: { after: 60 } })));
  }

  // Monthly calendar grids
  for (const monthStart of allMonths) {
    const monthTitle = format(monthStart, 'MMMM yyyy', { locale });
    children.push(new Paragraph({ children: [new TextRun({ text: monthTitle, bold: true, size: 24 })], heading: HeadingLevel.HEADING_2, spacing: { before: 480, after: 240 } }));

    const lastDay = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart, { locale });
    const calEnd = endOfWeek(lastDay, { locale });

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
      if (isSameMonthDateFns(dayIter, monthStart) && isWithinInterval(dayIter, { start: schedule.startDate, end: schedule.endDate })) {
        const doctorName = getDoctorForDay(dayIter);
        cellContent = format(dayIter, 'd');
        if (doctorName) cellContent += `\n${doctorName}`;
      } else if (isSameMonthDateFns(dayIter, monthStart)) {
        cellContent = format(dayIter, 'd');
      }
      currentWeekRow.push(cellContent);
      if (currentWeekRow.length === 7 || isSameDay(dayIter, calEnd)) { monthMatrixBody.push([...currentWeekRow]); currentWeekRow = []; }
      dayIter = addDays(dayIter, 1);
    }

    children.push(new Table({
      rows: [
        new TableRow({ children: weekDayHeaders.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })], alignment: AlignmentType.CENTER })], width: { size: 14.28, type: WidthType.PERCENTAGE } })) }),
        ...monthMatrixBody.map((row) => new TableRow({ children: row.map((cell) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, size: 16 })], alignment: AlignmentType.LEFT })], width: { size: 14.28, type: WidthType.PERCENTAGE } })) })),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
    }));
  }

  // Doctor details
  for (const doctor of doctorsProfiles) {
    children.push(new Paragraph({ children: [new TextRun({ text: t('pdf.doctorDetailsTitle', { doctorName: doctor.name }), bold: true, size: 24 })], heading: HeadingLevel.HEADING_2, spacing: { before: 480, after: 240 } }));
    if (doctor.isExcludedFromAutomaticAssignment) {
      children.push(new Paragraph({ children: [new TextRun({ text: t('pdf.doctorIsExcludedFromAuto'), italics: true, size: 16 })], spacing: { after: 120 } }));
    }

    const getFormattedDates = (dates: Date[]) => dates.length > 0 ? dates.map((d) => format(d, 'PPP', { locale })).join(', ') : t('pdf.none');
    const workDatesSet = new Set<number>();
    doctor.preAssignedWorkDates.forEach((d) => workDatesSet.add(d.getTime()));
    schedule.entries.forEach((e) => { if (e.doctorId === doctor.id && e.assignment === 'Work') workDatesSet.add(e.date.getTime()); });
    const allWorkDates = Array.from(workDatesSet).map((ts) => new Date(ts)).sort((a, b) => a.getTime() - b.getTime());

    children.push(new Table({
      rows: [
        new TableRow({ children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t('pdf.workDaysHeader'), bold: true, size: 18 })], alignment: AlignmentType.CENTER })], width: { size: 25, type: WidthType.PERCENTAGE } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t('pdf.datesHeader'), bold: true, size: 18 })], alignment: AlignmentType.CENTER })], width: { size: 75, type: WidthType.PERCENTAGE } }),
        ] }),
        new TableRow({ children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t('pdf.workDays'), size: 16 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: getFormattedDates(allWorkDates), size: 16 })] })] }),
        ] }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
    }));
  }

  // Workdays summary
  children.push(new Paragraph({ children: [new TextRun({ text: t('pdf.workdaysSummary.title'), bold: true, size: 24 })], heading: HeadingLevel.HEADING_2, spacing: { before: 480, after: 240 } }));

  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const summaryData = doctorsProfiles.map((doctor) => {
    const row: Record<string, string | number> = { doctorName: doctor.name };
    dayKeys.forEach((k) => (row[k] = 0));
    row['Total'] = 0;
    schedule.entries.filter((e) => e.doctorId === doctor.id && (e.assignment === 'Work' || e.assignment === 'Pre-assigned')).forEach((e) => {
      const k = format(e.date, 'EEE', { locale: enUS });
      if (dayKeys.includes(k)) { (row[k] as number)++; (row['Total'] as number)++; }
    });
    return row;
  });

  children.push(new Table({
    rows: [
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t('pdf.workdaysSummary.doctorHeader'), bold: true, size: 18 })], alignment: AlignmentType.CENTER })] }),
        ...dayKeys.map((k) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t(`pdf.workdaysSummary.${k.toLowerCase()}Header` as Parameters<typeof t>[0]), bold: true, size: 18 })], alignment: AlignmentType.CENTER })] })),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t('pdf.workdaysSummary.totalHeader'), bold: true, size: 18 })], alignment: AlignmentType.CENTER })] }),
      ] }),
      ...summaryData.map((s) => new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.doctorName), size: 16 })] })] }),
        ...dayKeys.map((k) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s[k]), size: 16 })], alignment: AlignmentType.CENTER })] })),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.Total), size: 16 })], alignment: AlignmentType.CENTER })] }),
      ] })),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
  }));

  // Monthly workload summary
  children.push(new Paragraph({ children: [new TextRun({ text: t('pdf.monthlyWorkloadSummary.title'), bold: true, size: 24 })], heading: HeadingLevel.HEADING_2, spacing: { before: 480, after: 240 } }));

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
      schedule.entries.forEach((e) => { if (e.doctorId === doctor.id && (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && isSameMonthDateFns(e.date, month)) count++; });
      row.push(count);
      doctorTotal += count;
      monthTotals.set(key, (monthTotals.get(key) || 0) + count);
    }
    row.push(doctorTotal);
    grandTotal += doctorTotal;
    monthlyBody.push(row);
  }

  const totalsRow: (string | number)[] = [t('pdf.monthlyWorkloadSummary.totalHeader')];
  allMonths.forEach((m) => totalsRow.push(monthTotals.get(format(m, 'yyyy-MM')) || 0));
  totalsRow.push(grandTotal);
  monthlyBody.push(totalsRow);

  children.push(new Table({
    rows: [
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t('pdf.monthlyWorkloadSummary.doctorHeader'), bold: true, size: 18 })], alignment: AlignmentType.CENTER })] }),
        ...monthHeaders.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })], alignment: AlignmentType.CENTER })] })),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t('pdf.monthlyWorkloadSummary.totalHeader'), bold: true, size: 18 })], alignment: AlignmentType.CENTER })] }),
      ] }),
      ...monthlyBody.map((row) => new TableRow({ children: row.map((cell, idx) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 16 })], alignment: idx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER })] })) })),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
  }));

  // Footer
  children.push(new Paragraph({ children: [new TextRun({ text: t('pdf.generatedOn', { date: format(new Date(), 'PPP p', { locale }) }), size: 16, italics: true })], alignment: AlignmentType.CENTER, spacing: { before: 480 } }));

  // Generate and download
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${t('pdf.reportTitle')}_${format(new Date(), 'yyyy-MM-dd')}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
