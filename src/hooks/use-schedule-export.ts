import { useState, useCallback } from 'react';
import type { Schedule, DoctorProfile } from '@/lib/types';
import { format } from 'date-fns';

interface UseScheduleExportProps {
  onSuccess?: (type: 'pdf' | 'word') => void;
  onError?: (error: string, type: 'pdf' | 'word') => void;
}

/**
 * Custom hook for schedule export functionality
 * Uses dynamic imports to reduce initial bundle size
 */
export function useScheduleExport({ onSuccess, onError }: UseScheduleExportProps = {}) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);

  /**
   * Export schedule as PDF
   * Dynamically imports jsPDF and autoTable only when needed
   */
  const exportAsPDF = useCallback(async (
    schedule: Schedule,
    doctorsProfiles: DoctorProfile[],
    currentDateFnsLocale: any,
    t: (key: string) => string
  ) => {
    setIsExportingPdf(true);
    try {
      // Dynamic import - only load when needed
      const [jsPDFModule, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);

      const { jsPDF } = jsPDFModule;
      const doc = new jsPDF();

      const startDateFormatted = format(schedule.startDate, 'P', { locale: currentDateFnsLocale });
      const endDateFormatted = format(schedule.endDate, 'P', { locale: currentDateFnsLocale });

      doc.setFontSize(18);
      doc.text(t('export.pdf.title'), 14, 20);
      doc.setFontSize(11);
      doc.text(`${t('export.pdf.period')}: ${startDateFormatted} - ${endDateFormatted}`, 14, 30);

      const doctorIdToName = new Map(
        doctorsProfiles.map(doc => [doc.id, doc.name])
      );

      const tableRows = schedule.entries
        .filter(entry => entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')
        .map(entry => [
          format(entry.date, 'P', { locale: currentDateFnsLocale }),
          entry.dayOfWeek,
          doctorIdToName.get(entry.doctorId) || t('export.pdf.unknown'),
          entry.assignment === 'Pre-assigned' ? '✓' : '',
        ]);

      autoTableModule.default(doc, {
        head: [[
          t('export.pdf.date'),
          t('export.pdf.dayOfWeek'),
          t('export.pdf.doctorAssigned'),
          t('export.pdf.preAssigned')
        ]],
        body: tableRows,
        startY: 35,
      });

      doc.save(`${t('export.pdf.fileName')}.pdf`);
      onSuccess?.('pdf');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      onError?.(error instanceof Error ? error.message : 'Unknown error', 'pdf');
    } finally {
      setIsExportingPdf(false);
    }
  }, [onSuccess, onError]);

  /**
   * Export schedule as Word document
   * Dynamically imports docx library only when needed
   */
  const exportAsWord = useCallback(async (
    schedule: Schedule,
    doctorsProfiles: DoctorProfile[],
    currentDateFnsLocale: any,
    t: (key: string) => string
  ) => {
    setIsExportingWord(true);
    try {
      // Dynamic import - only load when needed
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        WidthType,
        AlignmentType,
        HeadingLevel,
        BorderStyle
      } = await import('docx');

      const startDateFormatted = format(schedule.startDate, 'P', { locale: currentDateFnsLocale });
      const endDateFormatted = format(schedule.endDate, 'P', { locale: currentDateFnsLocale });

      const doctorIdToName = new Map(
        doctorsProfiles.map(doc => [doc.id, doc.name])
      );

      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            children: [new Paragraph({ text: t('export.word.date'), alignment: AlignmentType.CENTER })],
            shading: { fill: "CCCCCC" },
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: t('export.word.dayOfWeek'), alignment: AlignmentType.CENTER })],
            shading: { fill: "CCCCCC" },
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: t('export.word.doctorAssigned'), alignment: AlignmentType.CENTER })],
            shading: { fill: "CCCCCC" },
            width: { size: 40, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: t('export.word.preAssigned'), alignment: AlignmentType.CENTER })],
            shading: { fill: "CCCCCC" },
            width: { size: 10, type: WidthType.PERCENTAGE },
          }),
        ],
      });

      const dataRows = schedule.entries
        .filter(entry => entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')
        .map(entry => new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph(format(entry.date, 'P', { locale: currentDateFnsLocale }))],
              width: { size: 25, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph(entry.dayOfWeek)],
              width: { size: 25, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph(doctorIdToName.get(entry.doctorId) || t('export.word.unknown'))],
              width: { size: 40, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ text: entry.assignment === 'Pre-assigned' ? '✓' : '', alignment: AlignmentType.CENTER })],
              width: { size: 10, type: WidthType.PERCENTAGE },
            }),
          ],
        }));

      const table = new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
      });

      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              text: t('export.word.title'),
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `${t('export.word.period')}: `, bold: true }),
                new TextRun(`${startDateFormatted} - ${endDateFormatted}`),
              ],
              spacing: { after: 300 },
            }),
            table,
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${t('export.word.fileName')}.docx`;
      link.click();
      URL.revokeObjectURL(url);

      onSuccess?.('word');
    } catch (error) {
      console.error('Error exporting Word:', error);
      onError?.(error instanceof Error ? error.message : 'Unknown error', 'word');
    } finally {
      setIsExportingWord(false);
    }
  }, [onSuccess, onError]);

  return {
    exportAsPDF,
    exportAsWord,
    isExportingPdf,
    isExportingWord,
  };
}
