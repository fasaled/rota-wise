

import type React from 'react';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { ScheduleEntry, DoctorProfile } from '@/lib/types';
import { format, isSameDay, differenceInCalendarDays } from 'date-fns';
import { useLanguage } from '@/context/language-context';
import type { InfoBarMessage } from '@/hooks/use-info-bar';

interface ManualAdjustmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null;
  date: Date;
  doctors: DoctorProfile[];
  onSave: (updatedEntry: ScheduleEntry) => void;
  onSaveArbitrary?: (updatedEntry: ScheduleEntry) => void;
  minIntervalBetweenWorkDays: number;
  allScheduleEntries: ScheduleEntry[];
  onNotify?: (msg: Omit<InfoBarMessage, 'id'>) => void;
}

const ManualAdjustmentDialog: React.FC<ManualAdjustmentDialogProps> = ({
  isOpen,
  onClose,
  entry,
  date,
  doctors,
  onSave,
  onSaveArbitrary,
  minIntervalBetweenWorkDays,
  allScheduleEntries,
  onNotify,
}) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(entry?.doctorId || '');
  const [assignmentType, setAssignmentType] = useState<ScheduleEntry['assignment']>(entry?.assignment || 'Work');
  const [isFixed, setIsFixed] = useState<boolean>(entry?.isFixed || false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const isDayBlockedForDoctor = (doctorId: string, targetDate: Date): string | null => {
    const doctor = doctors.find(d => d.id === doctorId);
    if (!doctor) return null;

    const isVacation = doctor.vacationDates.some(vacDate => isSameDay(vacDate, targetDate));
    if (isVacation) {
      return t('dialog.toast.cannotAssignOnVacation.description', { doctorName: doctor.name });
    }

    const isExcluded = (doctor.excludedDates || []).some(exDate => isSameDay(exDate, targetDate));
    if (isExcluded) {
      return t('dialog.toast.excludedDayWarning.description', { doctorName: doctor.name });
    }

    return null;
  };

  useEffect(() => {
    if (isOpen) { // Reset state when dialog opens
        if (entry) {
            setSelectedDoctorId(entry.doctorId);
            setIsFixed(entry.isFixed || false);
            setAssignmentType('Work');
        } else {
            setSelectedDoctorId(doctors.length > 0 ? doctors[0].id : '');
            setAssignmentType('Work');
            setIsFixed(false);
        }
    }
  }, [entry, doctors, isOpen]);

  useEffect(() => {
    if (selectedDoctorId) {
      const reason = isDayBlockedForDoctor(selectedDoctorId, date);
      setBlockedReason(reason);
    } else {
      setBlockedReason(null);
    }
  }, [selectedDoctorId, date, doctors]); 

  const handleSave = () => {
    if (blockedReason) {
        onNotify?.({ severity: 'error', title: t('dialog.toast.assignmentBlocked.title'), description: blockedReason, autoDismissMs: 5000 });
        return;
    }

    // Doctor is always required since only Work assignments are allowed
    if (!selectedDoctorId) {
        onNotify?.({ severity: 'error', title: t('dialog.toast.validationError.title'), description: t('dialog.toast.validationError.description'), autoDismissMs: 5000 });
        return;
    }

    const updatedEntryData: ScheduleEntry = {
      date: date,
      doctorId: selectedDoctorId,
      assignment: 'Work',
      dayOfWeek: format(date, 'EEEE', { locale: currentDateFnsLocale }),
      isFixed: isFixed,
    };

    const doctor = doctors.find(d => d.id === selectedDoctorId);

    // Check min interval - show warning but don't prevent assignment
    if (doctor) {
        const doctorsWorkOrPreassignedEntries = allScheduleEntries.filter(
            e => e.doctorId === selectedDoctorId && (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && !isSameDay(e.date, date)
        );

        const closestWorkDayBefore = doctorsWorkOrPreassignedEntries
            .filter(e => e.date < date)
            .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

        const closestWorkDayAfter = doctorsWorkOrPreassignedEntries
            .filter(e => e.date > date)
            .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

        if (closestWorkDayBefore) {
            const diff = differenceInCalendarDays(date, closestWorkDayBefore.date);
            if (diff <= minIntervalBetweenWorkDays) {
                onNotify?.({ severity: 'warning', title: t('page.toast.minIntervalWarning.title'), description: t('page.toast.minIntervalWarning.description', { doctorName: doctor.name, interval: minIntervalBetweenWorkDays }), autoDismissMs: 5000 });
            }
        }
        if (closestWorkDayAfter) {
            const diff = differenceInCalendarDays(closestWorkDayAfter.date, date);
            if (diff <= minIntervalBetweenWorkDays) {
                onNotify?.({ severity: 'warning', title: t('page.toast.minIntervalWarning.title'), description: t('page.toast.minIntervalWarning.description', { doctorName: doctor.name, interval: minIntervalBetweenWorkDays }), autoDismissMs: 5000 });
            }
        }
    }

    // Use arbitrary save if available (manual assignments), otherwise use normal save
    const saveHandler = onSaveArbitrary || onSave;
    saveHandler(updatedEntryData);
    onClose();
    const formattedDate = format(date, 'PPP', { locale: currentDateFnsLocale });
    onNotify?.({
        severity: 'success',
        title: t('dialog.toast.scheduleUpdated.title'),
        description: entry
            ? t('dialog.toast.scheduleUpdated.description.modified', { date: formattedDate })
            : t('dialog.toast.scheduleUpdated.description.added', { date: formattedDate }),
        autoDismissMs: 3000,
    });
  };

  const assignmentTypes: ScheduleEntry['assignment'][] = ['Work']; // Only work assignments allowed

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('dialog.adjustTitle', { date: format(date, 'PPP', { locale: currentDateFnsLocale }) })}</DialogTitle>
          <DialogDescription>
            {entry ? t('dialog.modifyDescription') : t('dialog.addDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="doctor" className="text-right">
              {t('dialog.doctorLabel')}
            </Label>
            <Select
              value={selectedDoctorId}
              onValueChange={setSelectedDoctorId}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('dialog.selectDoctorPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="isFixed" className="text-right">
              {t('dialog.markAsFixedLabel')}
            </Label>
            <div className="col-span-3 flex items-center space-x-2">
              <Checkbox
                id="isFixed"
                checked={isFixed}
                onCheckedChange={(checked) => setIsFixed(checked as boolean)}
              />
              <Label htmlFor="isFixed" className="text-sm text-muted-foreground">
                {t('dialog.markAsFixedDescription')}
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{t('dialog.cancelButton')}</Button>
          </DialogClose>
          <Button type="button" onClick={handleSave} disabled={!!blockedReason}>{t('dialog.saveButton')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManualAdjustmentDialog;
