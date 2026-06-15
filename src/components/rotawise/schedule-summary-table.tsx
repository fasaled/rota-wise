


import type React from 'react';
import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Schedule, DoctorProfile } from '@/lib/types';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale'; // For consistent internal day key generation
import { useLanguage } from '@/context/language-context';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';


interface ScheduleSummaryTableProps {
  schedule: Schedule | null;
  doctors: DoctorProfile[];
}

interface DoctorSummaryStats {
  doctorId: string;
  doctorName: string;
  daysOfWeek: { [key: string]: number }; // Mon, Tue, etc.
  totalWorkdays: number;
}

const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekendKeys = new Set(['Sat', 'Sun']);

function getHeatClass(value: number, max: number): string {
  if (value === 0 || max === 0) return '';
  const ratio = value / max;
  if (ratio < 0.4) return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300';
  if (ratio < 0.75) return 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
  return 'bg-blue-200 dark:bg-blue-800/60 text-blue-900 dark:text-blue-100 font-medium';
}

const ScheduleSummaryTable: React.FC<ScheduleSummaryTableProps> = ({ schedule, doctors }) => {
  const { t } = useLanguage();

  const summaryData = useMemo(() => {
    if (!schedule || !doctors.length) {
      return [];
    }

    const doctorStatsMap = new Map<string, DoctorSummaryStats>();

    doctors.forEach(doctor => {
      const initialDaysOfWeek: { [key: string]: number } = {};
      dayKeys.forEach(key => initialDaysOfWeek[key] = 0);
      doctorStatsMap.set(doctor.id, {
        doctorId: doctor.id,
        doctorName: doctor.name,
        daysOfWeek: initialDaysOfWeek,
        totalWorkdays: 0,
      });
    });

    schedule.entries.forEach(entry => {
      if ((entry.assignment === 'Work' || entry.assignment === 'Pre-assigned')) {
        const doctorStat = doctorStatsMap.get(entry.doctorId);
        if (doctorStat) { // Ensure doctor is in the current profiles (e.g., not 'system')
          const dayKey = format(entry.date, 'EEE', { locale: enUS }); // Consistent key like 'Mon'
          if (dayKeys.includes(dayKey)) {
            doctorStat.daysOfWeek[dayKey]++;
          }
          doctorStat.totalWorkdays++;
        }
      }
    });

    return Array.from(doctorStatsMap.values());
  }, [schedule, doctors]);

  if (!schedule || !summaryData.length) {
    return null;
  }

  const maxValue = Math.max(
    ...summaryData.flatMap(s => dayKeys.map(k => s.daysOfWeek[k] ?? 0))
  );

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <BarChart3 className="w-5 h-5 text-primary shrink-0" /> {t('summaryTable.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">{t('summaryTable.doctorHeader')}</TableHead>
                {dayKeys.map(dayKey => (
                  <TableHead
                    key={dayKey}
                    className={cn(
                      "text-center min-w-[50px]",
                      weekendKeys.has(dayKey) && "bg-muted/40"
                    )}
                  >
                    {t(`summaryTable.${dayKey.toLowerCase()}Header` as any)}
                  </TableHead>
                ))}
                <TableHead className="text-center min-w-[60px]">{t('summaryTable.totalHeader')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryData.map((doctorStat) => (
                <TableRow key={doctorStat.doctorId} className="[&:hover>td]:!bg-primary/15">
                  <TableCell className="font-medium">{doctorStat.doctorName}</TableCell>
                  {dayKeys.map(dayKey => {
                    const value = doctorStat.daysOfWeek[dayKey];
                    return (
                      <TableCell
                        key={dayKey}
                        className={cn(
                          "text-center tabular-nums",
                          weekendKeys.has(dayKey) && "bg-muted/40",
                          getHeatClass(value, maxValue)
                        )}
                      >
                        {value}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-semibold tabular-nums">{doctorStat.totalWorkdays}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/70 font-semibold border-t-2">
                <TableCell>{t('summaryTable.totalHeader')}</TableCell>
                {dayKeys.map(dayKey => (
                  <TableCell
                    key={dayKey}
                    className={cn("text-center tabular-nums", weekendKeys.has(dayKey) && "bg-muted/40")}
                  >
                    {summaryData.reduce((sum, s) => sum + (s.daysOfWeek[dayKey] ?? 0), 0)}
                  </TableCell>
                ))}
                <TableCell className="text-center tabular-nums">
                  {summaryData.reduce((sum, s) => sum + s.totalWorkdays, 0)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScheduleSummaryTable;
