
"use client";

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
import type { ScheduleEntry, DoctorProfile } from '@/lib/types';
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from '@/context/language-context';

interface ManualAdjustmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null; 
  date: Date; 
  doctors: DoctorProfile[];
  onSave: (updatedEntry: ScheduleEntry) => void;
}

const ManualAdjustmentDialog: React.FC<ManualAdjustmentDialogProps> = ({
  isOpen,
  onClose,
  entry,
  date,
  doctors,
  onSave,
}) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(entry?.doctorId || '');
  const [assignmentType, setAssignmentType] = useState<ScheduleEntry['assignment']>(entry?.assignment || 'Work');
  const { toast } = useToast();

  useEffect(() => {
    if (entry) {
      setSelectedDoctorId(entry.doctorId);
      setAssignmentType(entry.assignment);
    } else {
      setSelectedDoctorId(doctors.length > 0 ? doctors[0].id : '');
      setAssignmentType('Work');
    }
  }, [entry, doctors, isOpen]); 

  const handleSave = () => {
    if (!selectedDoctorId && (assignmentType === 'Work' || assignmentType === 'Pre-assigned' || assignmentType === 'Vacation')) {
        toast({
            title: t('dialog.toast.validationError.title'),
            description: t('dialog.toast.validationError.description'),
            variant: "destructive",
        });
        return;
    }
    
    const updatedEntry: ScheduleEntry = {
      date: date,
      doctorId: selectedDoctorId || (assignmentType === 'Off' ? 'system' : ''), 
      assignment: assignmentType,
      dayOfWeek: format(date, 'EEEE', { locale: currentDateFnsLocale }), 
    };

    const doctor = doctors.find(d => d.id === selectedDoctorId);
    if (doctor) {
        const isVacationDayForDoctor = doctor.vacationDates.some(vacDate => 
            vacDate.getFullYear() === date.getFullYear() &&
            vacDate.getMonth() === date.getMonth() &&
            vacDate.getDate() === date.getDate()
        );

        if (isVacationDayForDoctor && (assignmentType === 'Work' || assignmentType === 'Pre-assigned')) {
            toast({
                title: t('dialog.toast.adjustmentWarning.title'),
                description: t('dialog.toast.adjustmentWarning.description', { doctorName: doctor.name }),
                variant: "destructive",
            });
            return; 
        }

        const isExcludedDayForDoctor = doctor.excludedDates.some(exDate =>
            exDate.getFullYear() === date.getFullYear() &&
            exDate.getMonth() === date.getMonth() &&
            exDate.getDate() === date.getDate()
        );

        if (isExcludedDayForDoctor && (assignmentType === 'Work' || assignmentType === 'Pre-assigned')) {
            toast({
                title: t('dialog.toast.adjustmentWarning.title'), // Use same title or create a new one
                description: t('dialog.toast.excludedDayWarning.description', { doctorName: doctor.name }),
                variant: "destructive",
            });
            return;
        }
    }
    
    onSave(updatedEntry);
    onClose();
    const formattedDate = format(date, 'PPP', { locale: currentDateFnsLocale });
    toast({
        title: t('dialog.toast.scheduleUpdated.title'),
        description: entry 
            ? t('dialog.toast.scheduleUpdated.description.modified', { date: formattedDate })
            : t('dialog.toast.scheduleUpdated.description.added', { date: formattedDate }),
    });
  };

  const assignmentTypes: ScheduleEntry['assignment'][] = ['Work', 'Vacation', 'Pre-assigned', 'Off'];

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
              disabled={assignmentType === 'Off'}
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
            <Label htmlFor="assignment" className="text-right">
              {t('dialog.assignmentLabel')}
            </Label>
            <Select value={assignmentType} onValueChange={(value) => setAssignmentType(value as ScheduleEntry['assignment'])}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('dialog.selectAssignmentPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {assignmentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`assignmentType.${type}` as any)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{t('dialog.cancelButton')}</Button>
          </DialogClose>
          <Button type="button" onClick={handleSave}>{t('dialog.saveButton')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManualAdjustmentDialog;
