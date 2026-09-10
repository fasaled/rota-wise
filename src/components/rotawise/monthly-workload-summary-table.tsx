


import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { Schedule, DoctorProfile } from '@/lib/types';
import { format, isBefore, isAfter, isWithinInterval, startOfDay, endOfDay, startOfMonth, eachMonthOfInterval } from 'date-fns';
import { useLanguage } from '@/context/language-context';
import { BarChartHorizontalBig, CalendarIcon, X } from 'lucide-react'; // Using a different icon
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

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
  const [filterRange, setFilterRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (schedule) {
      setFilterRange({ from: schedule.startDate, to: schedule.endDate });
    }
  }, [schedule]);

  const isFilterActive = !!schedule && !!filterRange && !!filterRange.from && !!filterRange.to && (
    filterRange.from.getTime() !== startOfDay(schedule.startDate).getTime() ||
    filterRange.to.getTime() !== endOfDay(schedule.endDate).getTime()
  );

  const { monthsInSchedule, summaryData, monthlyTotals } = useMemo(() => {
    if (!schedule || !doctors.length) {
      return { monthsInSchedule: [], summaryData: [], monthlyTotals: new Map() };
    }

    const rangeStart = filterRange?.from ?? schedule.startDate;
    const rangeEnd = filterRange?.to ?? schedule.endDate;
    const interval = filterRange?.from && filterRange.to
      ? { start: startOfDay(filterRange.from), end: endOfDay(filterRange.to) }
      : null;

    const scheduleMonths = eachMonthOfInterval({
      start: rangeStart,
      end: rangeEnd,
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
        if (interval && !isWithinInterval(entry.date, interval)) return;
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
  }, [schedule, doctors, filterRange]);

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
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "font-normal",
                  isFilterActive && "border-primary/40 bg-primary/5 text-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filterRange?.from && filterRange.to ? (
                  <span>
                    {format(filterRange.from, 'PP', { locale: currentDateFnsLocale })}
                    {' → '}
                    {format(filterRange.to, 'PP', { locale: currentDateFnsLocale })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('summary.filter.pickRange')}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
              <Calendar
                mode="range"
                selected={filterRange}
                onSelect={setFilterRange}
                locale={currentDateFnsLocale}
                disabled={(date) => isBefore(date, startOfDay(schedule.startDate)) || isAfter(date, endOfDay(schedule.endDate))}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {isFilterActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterRange({ from: schedule.startDate, to: schedule.endDate })}
            >
              <X className="h-3 w-3 mr-1" /> {t('summary.filter.reset')}
            </Button>
          )}
        </div>
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
