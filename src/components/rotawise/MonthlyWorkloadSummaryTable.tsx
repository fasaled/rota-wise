


import type React from 'react';
import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Schedule, DoctorProfile } from '@/lib/types';
import { format, startOfMonth, eachMonthOfInterval, isSameMonth } from 'date-fns';
import { useLanguage } from '@/context/language-context';
import { BarChartHorizontalBig } from 'lucide-react'; // Using a different icon

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

  return (
    <Card className="mt-8 shadow-lg">
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
                {monthsInSchedule.map(monthDate => (
                  <TableHead key={format(monthDate, 'yyyy-MM')} className="text-center min-w-[100px]">
                    {format(monthDate, 'MMM yyyy', { locale: currentDateFnsLocale })}
                  </TableHead>
                ))}
                <TableHead className="text-center min-w-[60px]">{t('monthlySummaryTable.totalHeader')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryData.map((doctorStat) => (
                <TableRow key={doctorStat.doctorId}>
                  <TableCell className="font-medium">{doctorStat.doctorName}</TableCell>
                  {monthsInSchedule.map(monthDate => {
                    const monthKey = format(monthDate, 'yyyy-MM');
                    return (
                      <TableCell key={`${doctorStat.doctorId}-${monthKey}`} className="text-center">
                        {doctorStat.monthlyWorkdays.get(monthKey) || 0}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-semibold">{doctorStat.totalWorkdaysAcrossMonths}</TableCell>
                </TableRow>
              ))}
               <TableRow className="bg-muted/50 font-semibold">
                 <TableCell>{t('monthlySummaryTable.totalHeader')}</TableCell>
                 {monthsInSchedule.map(monthDate => {
                    const monthKey = format(monthDate, 'yyyy-MM');
                    return (
                        <TableCell key={`total-${monthKey}`} className="text-center">
                            {monthlyTotals.get(monthKey) || 0}
                        </TableCell>
                    );
                 })}
                 <TableCell className="text-center">
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
