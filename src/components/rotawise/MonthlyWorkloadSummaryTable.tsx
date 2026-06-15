


import type React from 'react';
import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Schedule, DoctorProfile } from '@/lib/types';
import { format, startOfMonth, eachMonthOfInterval } from 'date-fns';
import { useLanguage } from '@/context/language-context';
import { BarChartHorizontalBig } from 'lucide-react'; // Using a different icon
import { cn } from '@/lib/utils';

interface MonthlyWorkloadSummaryTableProps {
  schedule: Schedule | null;
  doctors: DoctorProfile[];
}

interface DoctorMonthlyStats {
  doctorId: string;
  doctorName: string;
  monthlyWorkdays: Map<string, number>; // Key: 'yyyy-MM', Value: count
  totalWorkdaysAcrossMonths: number;
}

function getHeatClass(value: number, max: number): string {
  if (value === 0 || max === 0) return '';
  const ratio = value / max;
  if (ratio < 0.4) return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300';
  if (ratio < 0.75) return 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
  return 'bg-blue-200 dark:bg-blue-800/60 text-blue-900 dark:text-blue-100 font-medium';
}

const MonthlyWorkloadSummaryTable: React.FC<MonthlyWorkloadSummaryTableProps> = ({ schedule, doctors }) => {
  const { t, currentDateFnsLocale } = useLanguage();

  const { monthsInSchedule, summaryData, monthlyTotals } = useMemo(() => {
    if (!schedule || !doctors.length) {
      return { monthsInSchedule: [], summaryData: [], monthlyTotals: new Map() };
    }

    const scheduleMonths = eachMonthOfInterval({
      start: schedule.startDate,
      end: schedule.endDate,
    }).map(monthDate => startOfMonth(monthDate)); // Ensure we have the start of each month

    const doctorStatsMap = new Map<string, DoctorMonthlyStats>();

    doctors.forEach(doctor => {
      doctorStatsMap.set(doctor.id, {
        doctorId: doctor.id,
        doctorName: doctor.name,
        monthlyWorkdays: new Map<string, number>(),
        totalWorkdaysAcrossMonths: 0,
      });
    });

    schedule.entries.forEach(entry => {
      if ((entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')) {
        const doctorStat = doctorStatsMap.get(entry.doctorId);
        if (doctorStat) {
          const monthKey = format(entry.date, 'yyyy-MM');
          const currentMonthCount = doctorStat.monthlyWorkdays.get(monthKey) || 0;
          doctorStat.monthlyWorkdays.set(monthKey, currentMonthCount + 1);
          doctorStat.totalWorkdaysAcrossMonths++;
        }
      }
    });

    const calculatedMonthlyTotals = new Map<string, number>();
    scheduleMonths.forEach(monthDate => {
        const monthKey = format(monthDate, 'yyyy-MM');
        let totalForMonth = 0;
        doctorStatsMap.forEach(stat => {
            totalForMonth += (stat.monthlyWorkdays.get(monthKey) || 0);
        });
        calculatedMonthlyTotals.set(monthKey, totalForMonth);
    });


    return {
      monthsInSchedule: scheduleMonths,
      summaryData: Array.from(doctorStatsMap.values()),
      monthlyTotals: calculatedMonthlyTotals,
    };
  }, [schedule, doctors]);

  if (!schedule || !summaryData.length) {
    return null;
  }

  const maxValue = Math.max(
    ...summaryData.flatMap(s =>
      monthsInSchedule.map(m => s.monthlyWorkdays.get(format(m, 'yyyy-MM')) ?? 0)
    )
  );

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <BarChartHorizontalBig className="w-5 h-5 text-primary shrink-0" /> {t('monthlySummaryTable.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">{t('monthlySummaryTable.doctorHeader')}</TableHead>
                {monthsInSchedule.map(monthDate => {
                  const label = format(monthDate, 'MMM yyyy', { locale: currentDateFnsLocale });
                  return (
                    <TableHead key={format(monthDate, 'yyyy-MM')} className="text-center min-w-[100px]">
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </TableHead>
                  );
                })}
                <TableHead className="text-center min-w-[60px]">{t('monthlySummaryTable.totalHeader')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryData.map((doctorStat) => (
                <TableRow key={doctorStat.doctorId} className="[&:hover>td]:!bg-primary/15">
                  <TableCell className="font-medium">{doctorStat.doctorName}</TableCell>
                  {monthsInSchedule.map(monthDate => {
                    const monthKey = format(monthDate, 'yyyy-MM');
                    const value = doctorStat.monthlyWorkdays.get(monthKey) ?? 0;
                    return (
                      <TableCell
                        key={`${doctorStat.doctorId}-${monthKey}`}
                        className={cn("text-center tabular-nums", getHeatClass(value, maxValue))}
                      >
                        {value}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-semibold tabular-nums">{doctorStat.totalWorkdaysAcrossMonths}</TableCell>
                </TableRow>
              ))}
               <TableRow className="bg-muted/70 font-semibold border-t-2">
                 <TableCell>{t('monthlySummaryTable.totalHeader')}</TableCell>
                 {monthsInSchedule.map(monthDate => {
                    const monthKey = format(monthDate, 'yyyy-MM');
                    return (
                        <TableCell key={`total-${monthKey}`} className="text-center tabular-nums">
                            {monthlyTotals.get(monthKey) || 0}
                        </TableCell>
                    );
                 })}
                 <TableCell className="text-center tabular-nums">
                    {Array.from(monthlyTotals.values()).reduce((acc, curr) => acc + curr, 0)}
                 </TableCell>
               </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default MonthlyWorkloadSummaryTable;
