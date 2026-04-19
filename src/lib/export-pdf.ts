import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  format,
  startOfMonth,
  addMonths,
  isSameDay,
  differenceInCalendarDays,
  eachMonthOfInterval,
  isSameMonth as isSameMonthDateFns,
  eachDayOfInterval as eachDayOfIntervalFns,
  endOfMonth,
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  addDays,
} from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import type { Schedule, DoctorProfile } from './types';

interface ExportPdfParams {
  schedule: Schedule;
  doctorsProfiles: DoctorProfile[];
  scheduleWarnings: string[];
  currentMinInterval: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
}

export async function exportPdf({
  schedule,
  doctorsProfiles,
  scheduleWarnings,
  currentMinInterval,
  t,
  locale,
}: ExportPdfParams): Promise<void> {
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  // --- Design tokens (aligned with app palette) ---
  const PRIMARY:       [number, number, number] = [37,  99,  235]; // #2563eb — electric blue
  const PRIMARY_LIGHT: [number, number, number] = [219, 234, 254]; // #dbeafe — assigned cell tint
  const NAVY:          [number, number, number] = [15,  23,  42];  // #0f172a — sidebar dark
  const BG_TOTAL:      [number, number, number] = [241, 245, 249]; // #f1f5f9 — totals row
  const TEXT_DARK:     [number, number, number] = [15,  23,  42];  // #0f172a
  const TEXT_MUTED:    [number, number, number] = [100, 116, 139]; // slate-500
  const TEXT_WHITE:    [number, number, number] = [255, 255, 255];
  const TEXT_BLUE:     [number, number, number] = [29,  78,  216]; // #1d4ed8
  const BORDER:        [number, number, number] = [226, 232, 240]; // #e2e8f0

  const FONT_TITLE          = 20;
  const FONT_SUBTITLE       = 10;
  const FONT_SECTION_HEADER = 13;
  const FONT_TABLE_HEADER   = 9;
  const FONT_BODY           = 8;
  const FONT_FOOTER         = 7;
  const BASE_FONT = 'helvetica';

  const pdfWidth  = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pdfWidth - 2 * margin;
  const HEADER_H = 38; // cover banner height
  let currentY = HEADER_H + 10;
  let pageNumber = 1;

  // --- Footer with rule ---
  const addPageFooter = () => {
    pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    pdf.setLineWidth(0.3);
    pdf.line(margin, pdfHeight - margin, pdfWidth - margin, pdfHeight - margin);
    pdf.setFont(BASE_FONT, 'normal');
    pdf.setFontSize(FONT_FOOTER);
    pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    const genStr  = t('pdf.generatedOn', { date: format(new Date(), 'PPP p', { locale }) });
    const pageStr = `${pageNumber}`;
    pdf.text(genStr,  margin, pdfHeight - margin + 4);
    pdf.text(pageStr, pdfWidth - margin, pdfHeight - margin + 4, { align: 'right' });
  };

  const addNewPageWithFooter = () => {
    addPageFooter();
    pdf.addPage();
    pageNumber++;
    currentY = margin + 4;
  };

  // --- Section header helper: accent bar + dark title ---
  const drawSectionHeader = (title: string) => {
    // Vertical accent bar
    pdf.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    pdf.rect(margin, currentY - 4.5, 3, FONT_SECTION_HEADER * 0.55, 'F');
    pdf.setFont(BASE_FONT, 'bold');
    pdf.setFontSize(FONT_SECTION_HEADER);
    pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    pdf.text(title, margin + 6, currentY);
    currentY += FONT_SECTION_HEADER * 0.65 + 4;
  };

  // ----------------------------------------------------------------
  // Cover header banner
  // ----------------------------------------------------------------
  // Dark navy background
  pdf.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.rect(0, 0, pdfWidth, HEADER_H, 'F');
  // Blue accent bottom stripe
  pdf.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  pdf.rect(0, HEADER_H - 4, pdfWidth, 4, 'F');

  // Title
  pdf.setFont(BASE_FONT, 'bold');
  pdf.setFontSize(FONT_TITLE);
  pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
  pdf.text(t('pdf.reportTitle'), pdfWidth / 2, 15, { align: 'center' });

  // Period subtitle
  pdf.setFont(BASE_FONT, 'normal');
  pdf.setFontSize(FONT_SUBTITLE);
  pdf.setTextColor(PRIMARY_LIGHT[0], PRIMARY_LIGHT[1], PRIMARY_LIGHT[2]);
  pdf.text(
    t('pdf.schedulePeriod', {
      startDate: format(schedule.startDate, 'PPP', { locale }),
      endDate:   format(schedule.endDate,   'PPP', { locale }),
    }),
    pdfWidth / 2, 24, { align: 'center' },
  );

  const intervalToDisplay = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
  pdf.text(
    t('pdf.minIntervalInfo', { interval: intervalToDisplay }),
    pdfWidth / 2, 31, { align: 'center' },
  );

  // ----------------------------------------------------------------
  // Warnings
  // ----------------------------------------------------------------
  if (scheduleWarnings.length > 0) {
    const sectionTitle = t('pdf.warningsTitle');
    const estimatedH   = 10 + scheduleWarnings.length * FONT_BODY * 1.5;
    if (currentY + estimatedH > pdfHeight - margin - 15) addNewPageWithFooter();

    drawSectionHeader(sectionTitle);

    pdf.setFont(BASE_FONT, 'normal');
    pdf.setFontSize(FONT_BODY);
    pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    for (const warn of scheduleWarnings) {
      const split = pdf.splitTextToSize(`• ${warn}`, contentWidth - 4);
      if (currentY + split.length * FONT_BODY * 0.5 > pdfHeight - margin - 15) {
        addNewPageWithFooter();
        drawSectionHeader(sectionTitle);
        pdf.setFont(BASE_FONT, 'normal');
        pdf.setFontSize(FONT_BODY);
        pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
      }
      pdf.text(split, margin + 2, currentY);
      currentY += split.length * FONT_BODY * 0.5 + 2;
    }
    currentY += 8;
  }

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

  // ----------------------------------------------------------------
  // Monthly calendar grids
  // ----------------------------------------------------------------
  for (const monthStartDate of allMonths) {
    const monthTitle = format(monthStartDate, 'MMMM yyyy', { locale });
    const lastDay    = endOfMonth(monthStartDate);
    const calStart   = startOfWeek(monthStartDate, { locale });
    const calEnd     = endOfWeek(lastDay, { locale });

    const weekDayHeaders = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(calStart, i);
      const key = format(day, 'EEE', { locale: enUS }).toLowerCase();
      return t(`pdf.workdaysSummary.${key}Header` as Parameters<typeof t>[0]);
    });

    const monthMatrixBody: string[][] = [];
    let currentWeekRow: string[] = [];
    let dayIter = new Date(calStart);

    const numWeeks        = Math.ceil(differenceInCalendarDays(calEnd, calStart) / 7) + 1;
    const estimatedGridH  = numWeeks * 18 + 10;
    const titleH          = FONT_SECTION_HEADER * 0.65 + 8;

    if (currentY + titleH + estimatedGridH > pdfHeight - margin - 15) addNewPageWithFooter();

    drawSectionHeader(monthTitle);

    while (dayIter <= calEnd) {
      let cellContent = '';
      if (
        isSameMonthDateFns(dayIter, monthStartDate) &&
        isWithinInterval(dayIter, { start: schedule.startDate, end: schedule.endDate })
      ) {
        const doctorName = getDoctorForDay(dayIter);
        cellContent = format(dayIter, 'd');
        if (doctorName) cellContent += `\n\n${doctorName}`;
      } else if (isSameMonthDateFns(dayIter, monthStartDate)) {
        cellContent = format(dayIter, 'd');
      }
      currentWeekRow.push(cellContent);
      if (currentWeekRow.length === 7 || isSameDay(dayIter, calEnd)) {
        monthMatrixBody.push([...currentWeekRow]);
        currentWeekRow = [];
      }
      dayIter = addDays(dayIter, 1);
    }

    if (monthMatrixBody.length > 0) {
      autoTable(pdf, {
        startY: currentY,
        head:   [weekDayHeaders],
        body:   monthMatrixBody,
        theme:  'grid',
        styles: {
          font: BASE_FONT,
          fontSize: FONT_BODY - 1,
          cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
          valign: 'top',
          halign: 'left',
          minCellHeight: 16,
          overflow: 'linebreak',
          textColor: TEXT_DARK,
        },
        headStyles: {
          fillColor: NAVY,
          textColor: TEXT_WHITE,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          fontSize: FONT_TABLE_HEADER,
        },
        columnStyles: Object.fromEntries(
          Array.from({ length: 7 }, (_, i) => [i, { cellWidth: contentWidth / 7 }]),
        ),
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const raw = String(data.cell.raw ?? '');
            if (raw.includes('\n\n')) {
              // Day with doctor assignment — light blue tint
              data.cell.styles.fillColor = PRIMARY_LIGHT;
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = TEXT_BLUE;
            } else if (!raw.trim()) {
              // Outside month — very subtle gray
              data.cell.styles.fillColor = [248, 250, 252];
            }
          }
        },
        didDrawPage: (data) => {
          addPageFooter();
          currentY = data.cursor?.y ?? currentY;
          if (data.pageNumber > pageNumber) pageNumber = data.pageNumber;
        },
      });
      currentY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    } else {
      currentY += 5;
    }
  }

  // ----------------------------------------------------------------
  // Doctor details
  // ----------------------------------------------------------------
  for (const doctor of doctorsProfiles) {
    const sectionTitle = t('pdf.doctorDetailsTitle', { doctorName: doctor.name });
    if (currentY + 40 > pdfHeight - margin - 15) addNewPageWithFooter();

    drawSectionHeader(sectionTitle);

    if (doctor.isExcludedFromAutomaticAssignment) {
      pdf.setFont(BASE_FONT, 'italic');
      pdf.setFontSize(FONT_BODY - 1);
      pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      pdf.text(t('pdf.doctorIsExcludedFromAuto'), margin + 6, currentY);
      currentY += FONT_BODY * 0.55;
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

    autoTable(pdf, {
      startY: currentY,
      head:   [[t('pdf.workDaysHeader'), t('pdf.datesHeader')]],
      body:   [[t('pdf.workDays'), getFormattedDates(allWorkDates)]],
      theme:  'striped',
      styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 3, overflow: 'linebreak', textColor: TEXT_DARK },
      headStyles: { fillColor: NAVY, textColor: TEXT_WHITE, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: contentWidth - 55 } },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => {
        addPageFooter();
        currentY = data.cursor?.y ?? currentY;
        if (data.pageNumber > pageNumber) pageNumber = data.pageNumber;
      },
    });
    currentY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // ----------------------------------------------------------------
  // Workdays summary
  // ----------------------------------------------------------------
  if (currentY + 50 > pdfHeight - margin - 15) addNewPageWithFooter();

  drawSectionHeader(t('pdf.workdaysSummary.title'));

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

  autoTable(pdf, {
    startY: currentY,
    head: [[
      t('pdf.workdaysSummary.doctorHeader'),
      ...dayKeys.map((k) => t(`pdf.workdaysSummary.${k.toLowerCase()}Header` as Parameters<typeof t>[0])),
      t('pdf.workdaysSummary.totalHeader'),
    ]],
    body: summaryData.map((s) => [s.doctorName, s.Mon, s.Tue, s.Wed, s.Thu, s.Fri, s.Sat, s.Sun, s.Total]),
    theme: 'striped',
    styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 3, textColor: TEXT_DARK },
    headStyles: { fillColor: NAVY, textColor: TEXT_WHITE, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
    columnStyles: {
      0: { halign: 'left' },
      ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, { halign: 'center' }])),
    },
    didParseCell: (data) => {
      // Highlight Total column
      if (data.section === 'body' && data.column.index === 8) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = TEXT_BLUE;
      }
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      addPageFooter();
      currentY = data.cursor?.y ?? currentY;
      if (data.pageNumber > pageNumber) pageNumber = data.pageNumber;
    },
  });
  currentY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ----------------------------------------------------------------
  // Monthly workload summary
  // ----------------------------------------------------------------
  if (currentY + 60 > pdfHeight - margin - 15) addNewPageWithFooter();

  drawSectionHeader(t('pdf.monthlyWorkloadSummary.title'));

  const scheduleMonths  = eachMonthOfInterval({ start: schedule.startDate, end: schedule.endDate }).map((m) => startOfMonth(m));
  const monthHeaders    = scheduleMonths.map((m) => format(m, 'MMM yy', { locale }));
  const monthlyBody: (string | number)[][] = [];
  const monthTotals     = new Map<string, number>();
  scheduleMonths.forEach((m) => monthTotals.set(format(m, 'yyyy-MM'), 0));
  let grandTotal = 0;

  for (const doctor of doctorsProfiles) {
    const row: (string | number)[] = [doctor.name];
    let doctorTotal = 0;
    for (const month of scheduleMonths) {
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
  scheduleMonths.forEach((m) => totalsRow.push(monthTotals.get(format(m, 'yyyy-MM')) ?? 0));
  totalsRow.push(grandTotal);
  monthlyBody.push(totalsRow);

  const lastRowIndex = monthlyBody.length - 1;

  autoTable(pdf, {
    startY: currentY,
    head: [[
      t('pdf.monthlyWorkloadSummary.doctorHeader'),
      ...monthHeaders,
      t('pdf.monthlyWorkloadSummary.totalHeader'),
    ]],
    body: monthlyBody,
    theme: 'striped',
    styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 3, textColor: TEXT_DARK },
    headStyles: { fillColor: NAVY, textColor: TEXT_WHITE, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
    columnStyles: {
      0: { halign: 'left' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        // Totals row
        if (data.row.index === lastRowIndex) {
          data.cell.styles.fillColor = BG_TOTAL;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = TEXT_DARK;
        }
        // Total column (last column)
        if (data.column.index === scheduleMonths.length + 1) {
          data.cell.styles.fontStyle = 'bold';
          if (data.row.index !== lastRowIndex) data.cell.styles.textColor = TEXT_BLUE;
        }
      }
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      addPageFooter();
      currentY = data.cursor?.y ?? currentY;
      if (data.pageNumber > pageNumber) pageNumber = data.pageNumber;
    },
  });

  addPageFooter();
  pdf.save('rotawise-report.pdf');
}
