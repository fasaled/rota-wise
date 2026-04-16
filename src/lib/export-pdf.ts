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

  // --- Styling constants ---
  const PRIMARY_COLOR: [number, number, number] = [41, 128, 185];
  const TEXT_COLOR_DARK: [number, number, number] = [0, 0, 0];
  const TEXT_COLOR_LIGHT: [number, number, number] = [255, 255, 255];
  const TEXT_COLOR_MUTED: [number, number, number] = [100, 100, 100];
  const BORDER_COLOR: [number, number, number] = [200, 200, 200];

  const FONT_TITLE = 22;
  const FONT_SUBTITLE = 12;
  const FONT_SECTION_HEADER = 16;
  const FONT_TABLE_HEADER = 10;
  const FONT_BODY = 9;
  const FONT_FOOTER = 8;
  const BASE_FONT = 'helvetica';

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pdfWidth - 2 * margin;
  let currentY = margin;
  let pageNumber = 1;

  const addPageFooter = () => {
    pdf.setFont(BASE_FONT, 'normal');
    pdf.setFontSize(FONT_FOOTER);
    pdf.setTextColor(TEXT_COLOR_MUTED[0], TEXT_COLOR_MUTED[1], TEXT_COLOR_MUTED[2]);
    const pageStr = `Page ${pageNumber}`;
    const genStr = t('pdf.generatedOn', { date: format(new Date(), 'PPP p', { locale }) });
    pdf.text(genStr, margin, pdfHeight - margin + 5);
    pdf.text(
      pageStr,
      pdfWidth - margin - (pdf.getStringUnitWidth(pageStr) * pdf.getFontSize()) / pdf.internal.scaleFactor,
      pdfHeight - margin + 5,
    );
  };

  const addNewPageWithFooter = () => {
    addPageFooter();
    pdf.addPage();
    pageNumber++;
    currentY = margin;
  };

  // --- Header ---
  pdf.setFont(BASE_FONT, 'bold');
  pdf.setFontSize(FONT_TITLE);
  pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  pdf.text(t('pdf.reportTitle'), pdfWidth / 2, currentY, { align: 'center' });
  currentY += FONT_TITLE * 0.5;

  pdf.setFont(BASE_FONT, 'normal');
  pdf.setFontSize(FONT_SUBTITLE);
  pdf.setTextColor(TEXT_COLOR_DARK[0], TEXT_COLOR_DARK[1], TEXT_COLOR_DARK[2]);
  pdf.text(
    t('pdf.schedulePeriod', {
      startDate: format(schedule.startDate, 'PPP', { locale }),
      endDate: format(schedule.endDate, 'PPP', { locale }),
    }),
    pdfWidth / 2,
    currentY,
    { align: 'center' },
  );
  currentY += FONT_SUBTITLE * 0.5;

  const intervalToDisplay = schedule.minIntervalBetweenWorkDays ?? currentMinInterval;
  pdf.text(t('pdf.minIntervalInfo', { interval: intervalToDisplay }), pdfWidth / 2, currentY, { align: 'center' });
  currentY += FONT_SUBTITLE * 0.7;

  pdf.setDrawColor(BORDER_COLOR[0], BORDER_COLOR[1], BORDER_COLOR[2]);
  pdf.line(margin, currentY, pdfWidth - margin, currentY);
  currentY += 10;

  // --- Warnings ---
  if (scheduleWarnings.length > 0) {
    const sectionTitle = t('pdf.warningsTitle');
    const estimatedWarningHeight = 7 + scheduleWarnings.length * FONT_BODY * 1.5;
    if (currentY + estimatedWarningHeight > pdfHeight - margin - 15) addNewPageWithFooter();

    pdf.setFont(BASE_FONT, 'bold');
    pdf.setFontSize(FONT_SECTION_HEADER);
    pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    pdf.text(sectionTitle, margin, currentY);
    currentY += FONT_SECTION_HEADER * 0.7;

    pdf.setFont(BASE_FONT, 'normal');
    pdf.setFontSize(FONT_BODY);
    pdf.setTextColor(TEXT_COLOR_DARK[0], TEXT_COLOR_DARK[1], TEXT_COLOR_DARK[2]);
    scheduleWarnings.forEach((warn) => {
      const splitText = pdf.splitTextToSize(warn, contentWidth);
      if (currentY + splitText.length * FONT_BODY * 0.5 > pdfHeight - margin - 15) {
        addNewPageWithFooter();
        pdf.setFont(BASE_FONT, 'bold');
        pdf.setFontSize(FONT_SECTION_HEADER);
        pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
        pdf.text(sectionTitle, margin, currentY);
        currentY += FONT_SECTION_HEADER * 0.7;
        pdf.setFont(BASE_FONT, 'normal');
        pdf.setFontSize(FONT_BODY);
        pdf.setTextColor(TEXT_COLOR_DARK[0], TEXT_COLOR_DARK[1], TEXT_COLOR_DARK[2]);
      }
      pdf.text(splitText, margin + 2, currentY);
      currentY += splitText.length * FONT_BODY * 0.5 + 2;
    });
    currentY += 10;
  }

  const getDoctorNameById = (id: string) => doctorsProfiles.find((d) => d.id === id)?.name || id;

  const getDoctorForDay = (day: Date) => {
    const entries = schedule.entries.filter(
      (e) =>
        isSameDay(e.date, day) &&
        (e.assignment === 'Work' || e.assignment === 'Pre-assigned') &&
        e.doctorId !== 'system',
    );
    return entries.map((e) => getDoctorNameById(e.doctorId)).join(', ');
  };

  const allMonths = eachMonthOfInterval({ start: schedule.startDate, end: schedule.endDate }).map(
    (m) => startOfMonth(m),
  );

  // --- Monthly calendar grids ---
  for (const monthStartDate of allMonths) {
    const monthTitle = format(monthStartDate, 'MMMM yyyy', { locale });
    const lastDay = endOfMonth(monthStartDate);
    const calStart = startOfWeek(monthStartDate, { locale });
    const calEnd = endOfWeek(lastDay, { locale });

    const weekDayHeaders = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(calStart, i);
      const key = format(day, 'EEE', { locale: enUS }).toLowerCase();
      return t(`pdf.workdaysSummary.${key}Header` as Parameters<typeof t>[0]);
    });

    const monthMatrixBody: string[][] = [];
    let currentWeekRow: string[] = [];
    let dayIter = new Date(calStart);

    const numWeeks = Math.ceil(differenceInCalendarDays(calEnd, calStart) / 7) + 1;
    const estimatedGridHeight = numWeeks * 18 + 10;
    const titleHeight = FONT_SECTION_HEADER * 0.7 + 5;

    if (currentY + titleHeight + estimatedGridHeight > pdfHeight - margin - 15) addNewPageWithFooter();

    pdf.setFont(BASE_FONT, 'bold');
    pdf.setFontSize(FONT_SECTION_HEADER);
    pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    pdf.text(monthTitle, margin, currentY);
    currentY += titleHeight;

    while (dayIter <= calEnd) {
      let cellContent = '';
      if (isSameMonthDateFns(dayIter, monthStartDate) && isWithinInterval(dayIter, { start: schedule.startDate, end: schedule.endDate })) {
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
        head: [weekDayHeaders],
        body: monthMatrixBody,
        theme: 'grid',
        styles: { font: BASE_FONT, fontSize: FONT_BODY - 1, cellPadding: { top: 1, right: 1, bottom: 1, left: 1 }, valign: 'top', halign: 'left', minCellHeight: 15, overflow: 'linebreak' },
        headStyles: { fillColor: PRIMARY_COLOR, textColor: TEXT_COLOR_LIGHT, fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: FONT_TABLE_HEADER },
        columnStyles: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, { cellWidth: contentWidth / 7 }])),
        margin: { left: margin, right: margin },
        didDrawPage: (data) => { addPageFooter(); currentY = data.cursor?.y || currentY; if (data.pageNumber > pageNumber) pageNumber = data.pageNumber; },
      });
      currentY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    } else {
      currentY += 5;
    }
  }

  // --- Doctor details ---
  for (const doctor of doctorsProfiles) {
    const sectionTitle = t('pdf.doctorDetailsTitle', { doctorName: doctor.name });
    if (currentY + 40 > pdfHeight - margin - 15) addNewPageWithFooter();

    pdf.setFont(BASE_FONT, 'bold');
    pdf.setFontSize(FONT_SECTION_HEADER);
    pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    pdf.text(sectionTitle, margin, currentY);
    currentY += FONT_SECTION_HEADER * 0.7 + 2;

    if (doctor.isExcludedFromAutomaticAssignment) {
      pdf.setFont(BASE_FONT, 'normal');
      pdf.setFontSize(FONT_BODY - 1);
      pdf.setTextColor(TEXT_COLOR_MUTED[0], TEXT_COLOR_MUTED[1], TEXT_COLOR_MUTED[2]);
      pdf.text(t('pdf.doctorIsExcludedFromAuto'), margin, currentY);
      currentY += FONT_BODY * 0.5;
      pdf.setTextColor(TEXT_COLOR_DARK[0], TEXT_COLOR_DARK[1], TEXT_COLOR_DARK[2]);
    }

    const getFormattedDates = (dates: Date[]) =>
      dates.length > 0 ? dates.map((d) => format(d, 'PPP', { locale })).join(', ') : t('pdf.none');

    const workDatesSet = new Set<number>();
    doctor.preAssignedWorkDates.forEach((d) => workDatesSet.add(d.getTime()));
    schedule.entries.forEach((e) => { if (e.doctorId === doctor.id && e.assignment === 'Work') workDatesSet.add(e.date.getTime()); });
    const allWorkDates = Array.from(workDatesSet).map((t) => new Date(t)).sort((a, b) => a.getTime() - b.getTime());

    autoTable(pdf, {
      startY: currentY,
      head: [[t('pdf.workDaysHeader'), t('pdf.datesHeader')]],
      body: [[t('pdf.workDays'), getFormattedDates(allWorkDates)]],
      theme: 'striped',
      styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: PRIMARY_COLOR, textColor: TEXT_COLOR_LIGHT, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: contentWidth - 60 } },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => { addPageFooter(); currentY = data.cursor?.y || currentY; if (data.pageNumber > pageNumber) pageNumber = data.pageNumber; },
    });
    currentY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // --- Workdays summary ---
  if (currentY + 50 > pdfHeight - margin - 15) addNewPageWithFooter();
  pdf.setFont(BASE_FONT, 'bold');
  pdf.setFontSize(FONT_SECTION_HEADER);
  pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  pdf.text(t('pdf.workdaysSummary.title'), margin, currentY);
  currentY += FONT_SECTION_HEADER * 0.7 + 5;

  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const summaryData = doctorsProfiles.map((doctor) => {
    const row: Record<string, string | number> = { doctorName: doctor.name };
    dayKeys.forEach((k) => (row[k] = 0));
    row['Total'] = 0;
    schedule.entries
      .filter((e) => e.doctorId === doctor.id && (e.assignment === 'Work' || e.assignment === 'Pre-assigned'))
      .forEach((e) => {
        const k = format(e.date, 'EEE', { locale: enUS });
        if (dayKeys.includes(k)) { (row[k] as number)++; (row['Total'] as number)++; }
      });
    return row;
  });

  autoTable(pdf, {
    startY: currentY,
    head: [[t('pdf.workdaysSummary.doctorHeader'), ...dayKeys.map((k) => t(`pdf.workdaysSummary.${k.toLowerCase()}Header` as Parameters<typeof t>[0])), t('pdf.workdaysSummary.totalHeader')]],
    body: summaryData.map((s) => [s.doctorName, s.Mon, s.Tue, s.Wed, s.Thu, s.Fri, s.Sat, s.Sun, s.Total]),
    theme: 'striped',
    styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY_COLOR, textColor: TEXT_COLOR_LIGHT, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => { addPageFooter(); currentY = data.cursor?.y || currentY; if (data.pageNumber > pageNumber) pageNumber = data.pageNumber; },
  });
  currentY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // --- Monthly workload summary ---
  if (currentY + 60 > pdfHeight - margin - 15) addNewPageWithFooter();
  pdf.setFont(BASE_FONT, 'bold');
  pdf.setFontSize(FONT_SECTION_HEADER);
  pdf.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  pdf.text(t('pdf.monthlyWorkloadSummary.title'), margin, currentY);
  currentY += FONT_SECTION_HEADER * 0.7 + 5;

  const scheduleMonths = eachMonthOfInterval({ start: schedule.startDate, end: schedule.endDate }).map((m) => startOfMonth(m));
  const monthHeaders = scheduleMonths.map((m) => format(m, 'MMM yy', { locale }));
  const monthlyBody: (string | number)[][] = [];
  const monthTotals = new Map<string, number>();
  scheduleMonths.forEach((m) => monthTotals.set(format(m, 'yyyy-MM'), 0));
  let grandTotal = 0;

  for (const doctor of doctorsProfiles) {
    const row: (string | number)[] = [doctor.name];
    let doctorTotal = 0;
    for (const month of scheduleMonths) {
      const key = format(month, 'yyyy-MM');
      let count = 0;
      schedule.entries.forEach((e) => {
        if (e.doctorId === doctor.id && (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && isSameMonthDateFns(e.date, month)) count++;
      });
      row.push(count);
      doctorTotal += count;
      monthTotals.set(key, (monthTotals.get(key) || 0) + count);
    }
    row.push(doctorTotal);
    grandTotal += doctorTotal;
    monthlyBody.push(row);
  }

  const totalsRow: (string | number)[] = [t('pdf.monthlyWorkloadSummary.totalHeader')];
  scheduleMonths.forEach((m) => totalsRow.push(monthTotals.get(format(m, 'yyyy-MM')) || 0));
  totalsRow.push(grandTotal);
  monthlyBody.push(totalsRow);

  autoTable(pdf, {
    startY: currentY,
    head: [[t('pdf.monthlyWorkloadSummary.doctorHeader'), ...monthHeaders, t('pdf.monthlyWorkloadSummary.totalHeader')]],
    body: monthlyBody,
    theme: 'striped',
    styles: { font: BASE_FONT, fontSize: FONT_BODY, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY_COLOR, textColor: TEXT_COLOR_LIGHT, fontStyle: 'bold', fontSize: FONT_TABLE_HEADER },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => { addPageFooter(); currentY = data.cursor?.y || currentY; if (data.pageNumber > pageNumber) pageNumber = data.pageNumber; },
  });

  addPageFooter();
  pdf.save('rotawise-report.pdf');
}
