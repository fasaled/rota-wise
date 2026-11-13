import { useMemo } from 'react';
import { eachMonthOfInterval, format } from 'date-fns';
import { BarChartHorizontalBig } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Schedule, DoctorProfile } from '@/lib/types';
import { useLanguage } from '@/context/language-context';
import { cn } from '@/lib/utils';
import { SummaryRangeFilter } from './summary-range';
import { getHeatClass, useSummaryRange } from './use-summary-range';

interface MonthlyWorkloadSummaryTableProps {
  schedule: Schedule;
  doctors: DoctorProfile[];
}

const monthKey = (date: Date) => format(date, 'yyyy-MM');

export default function MonthlyWorkloadSummaryTable({ schedule, doctors }: MonthlyWorkloadSummaryTableProps) {
  const { t, currentDateFnsLocale } = useLanguage();
  const range = useSummaryRange(schedule);

  const { months, rows } = useMemo(() => {
    const months = eachMonthOfInterval({ start: range.start, end: range.end }).map((date) => {
      const label = format(date, 'LLL yyyy', { locale: currentDateFnsLocale });
      return { key: monthKey(date), label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
    const byDoctor = new Map(doctors.map((d) => [d.id, { doctor: d, perMonth: new Map<string, number>(), total: 0 }]));
    for (const entry of schedule.entries) {
      if (entry.assignment !== 'Work' && entry.assignment !== 'Pre-assigned') continue;
      if (!range.contains(entry.date)) continue;
      const row = byDoctor.get(entry.doctorId);
      if (!row) continue; // 'system' or a doctor no longer on the roster
      const key = monthKey(entry.date);
      row.perMonth.set(key, (row.perMonth.get(key) ?? 0) + 1);
      row.total++;
    }
    return { months, rows: [...byDoctor.values()] };
  }, [schedule.entries, doctors, range, currentDateFnsLocale]);

  if (rows.length === 0) return null;

  const count = (row: (typeof rows)[number], key: string) => row.perMonth.get(key) ?? 0;
  const maxValue = Math.max(0, ...rows.flatMap((r) => months.map((m) => count(r, m.key))));
  const monthTotal = (key: string) => rows.reduce((sum, r) => sum + count(r, key), 0);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <BarChartHorizontalBig className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{' '}
          {t('monthlySummaryTable.title')}
        </CardTitle>
        <SummaryRangeFilter schedule={schedule} range={range} />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="min-w-[150px]">
                  {t('summaryTable.doctorHeader')}
                </TableHead>
                {months.map((m) => (
                  <TableHead key={m.key} scope="col" className="min-w-[100px] text-center">
                    {m.label}
                  </TableHead>
                ))}
                <TableHead scope="col" className="min-w-[60px] text-center">
                  {t('summaryTable.totalHeader')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.doctor.id} className="[&:hover>td]:!bg-primary/15">
                  <TableCell className="font-medium">{row.doctor.name}</TableCell>
                  {months.map((m) => (
                    <TableCell
                      key={m.key}
                      className={cn('text-center tabular-nums', getHeatClass(count(row, m.key), maxValue))}
                    >
                      {count(row, m.key)}
                    </TableCell>
                  ))}
                  <TableCell className="text-center font-semibold tabular-nums">{row.total}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/70 font-semibold">
                <TableCell>{t('summaryTable.totalHeader')}</TableCell>
                {months.map((m) => (
                  <TableCell key={m.key} className="text-center tabular-nums">
                    {monthTotal(m.key)}
                  </TableCell>
                ))}
                <TableCell className="text-center tabular-nums">{rows.reduce((sum, r) => sum + r.total, 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
