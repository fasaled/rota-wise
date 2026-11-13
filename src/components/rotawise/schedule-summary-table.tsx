import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Schedule, DoctorProfile } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import { useLanguage } from '@/context/language-context';
import { cn } from '@/lib/utils';
import { SummaryRangeFilter } from './summary-range';
import { getHeatClass, useSummaryRange } from './use-summary-range';

interface ScheduleSummaryTableProps {
  schedule: Schedule;
  doctors: DoctorProfile[];
}

/** Monday-first; `Date.getDay()` index of each column. */
const DAY_COLUMNS: { key: TranslationKey; day: number; weekend?: boolean }[] = [
  { key: 'summaryTable.monHeader', day: 1 },
  { key: 'summaryTable.tueHeader', day: 2 },
  { key: 'summaryTable.wedHeader', day: 3 },
  { key: 'summaryTable.thuHeader', day: 4 },
  { key: 'summaryTable.friHeader', day: 5 },
  { key: 'summaryTable.satHeader', day: 6, weekend: true },
  { key: 'summaryTable.sunHeader', day: 0, weekend: true },
];

export default function ScheduleSummaryTable({ schedule, doctors }: ScheduleSummaryTableProps) {
  const { t } = useLanguage();
  const range = useSummaryRange(schedule);

  const rows = useMemo(() => {
    const byDoctor = new Map(doctors.map((d) => [d.id, { doctor: d, perDay: Array<number>(7).fill(0), total: 0 }]));
    for (const entry of schedule.entries) {
      if (entry.assignment !== 'Work' && entry.assignment !== 'Pre-assigned') continue;
      if (!range.contains(entry.date)) continue;
      const row = byDoctor.get(entry.doctorId);
      if (!row) continue; // 'system' or a doctor no longer on the roster
      row.perDay[entry.date.getDay()]++;
      row.total++;
    }
    return [...byDoctor.values()];
  }, [schedule.entries, doctors, range]);

  if (rows.length === 0) return null;

  const maxValue = Math.max(0, ...rows.flatMap((r) => r.perDay));
  const columnTotal = (day: number) => rows.reduce((sum, r) => sum + r.perDay[day], 0);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <BarChart3 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> {t('summaryTable.title')}
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
                {DAY_COLUMNS.map((col) => (
                  <TableHead
                    key={col.day}
                    scope="col"
                    className={cn('min-w-[50px] text-center', col.weekend && 'bg-muted/40')}
                  >
                    {t(col.key)}
                  </TableHead>
                ))}
                <TableHead scope="col" className="min-w-[60px] text-center">
                  {t('summaryTable.totalHeader')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ doctor, perDay, total }) => (
                <TableRow key={doctor.id} className="[&:hover>td]:!bg-primary/15">
                  <TableCell className="font-medium">{doctor.name}</TableCell>
                  {DAY_COLUMNS.map((col) => (
                    <TableCell
                      key={col.day}
                      className={cn(
                        'text-center tabular-nums',
                        col.weekend && 'bg-muted/40',
                        getHeatClass(perDay[col.day], maxValue),
                      )}
                    >
                      {perDay[col.day]}
                    </TableCell>
                  ))}
                  <TableCell className="text-center font-semibold tabular-nums">{total}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/70 font-semibold">
                <TableCell>{t('summaryTable.totalHeader')}</TableCell>
                {DAY_COLUMNS.map((col) => (
                  <TableCell key={col.day} className={cn('text-center tabular-nums', col.weekend && 'bg-muted/40')}>
                    {columnTotal(col.day)}
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
