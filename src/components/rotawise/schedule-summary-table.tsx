
"use client";

import type React from 'react';
import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Schedule, DoctorProfile } from '@/lib/types';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale'; // For consistent internal day key generation
import { useLanguage } from '@/context/language-context';
import { BarChart3 } from 'lucide-react';


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

  return (
    <Card className="mt-8 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
          <BarChart3 className="text-primary h-6 w-6 md:h-7 md:w-7" /> {t('summaryTable.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">{t('summaryTable.doctorHeader')}</TableHead>
                {dayKeys.map(dayKey => (
                  <TableHead key={dayKey} className="text-center min-w-[50px]">{t(`summaryTable.${dayKey.toLowerCase()}Header` as any)}</TableHead>
                ))}
                <TableHead className="text-center min-w-[60px]">{t('summaryTable.totalHeader')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryData.map((doctorStat) => (
                <TableRow key={doctorStat.doctorId}>
                  <TableCell className="font-medium">{doctorStat.doctorName}</TableCell>
                  {dayKeys.map(dayKey => (
                    <TableCell key={dayKey} className="text-center">{doctorStat.daysOfWeek[dayKey]}</TableCell>
                  ))}
                  <TableCell className="text-center font-semibold">{doctorStat.totalWorkdays}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScheduleSummaryTable;
