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
import { Checkbox } from '@/components/ui/checkbox';
import type { ScheduleEntry, DoctorProfile } from '@/lib/types';
import { format, isSameDay, differenceInCalendarDays } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from '@/context/language-context';

interface ManualAdjustmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null; 
  date: Date; 
  doctors: DoctorProfile[];
  onSave: (updatedEntry: ScheduleEntry) => void;
  minIntervalBetweenWorkDays: number;
  allScheduleEntries: ScheduleEntry[]; // All entries to check interval against
}

const ManualAdjustmentDialog: React.FC<ManualAdjustmentDialogProps> = ({
  isOpen,
  onClose,
  entry,
  date,
  doctors,
  onSave,
  minIntervalBetweenWorkDays,
  allScheduleEntries,
}) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(entry?.doctorId || '');
  const [assignmentType, setAssignmentType] = useState<ScheduleEntry['assignment']>(entry?.assignment || 'Work');
  const [isFixed, setIsFixed] = useState<boolean>(entry?.isFixed || false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) { // Reset state when dialog opens
        if (entry) {
            setSelectedDoctorId(entry.doctorId);
            setIsFixed(entry.isFixed || false);
            // If existing entry is Work or Off (the only settable types), use that.
            // If it was Pre-assigned, default to Work in the dialog.
            if (entry.assignment === 'Work' || entry.assignment === 'Off') {
                setAssignmentType(entry.assignment);
            } else { // Handles Pre-assigned, or any other type not in the dropdown
                setAssignmentType('Work');
            }
        } else {
            // Default for new entry
            setSelectedDoctorId(doctors.length > 0 ? doctors[0].id : '');
            setAssignmentType('Work');
            setIsFixed(false);
        }
    }
  }, [entry, doctors, isOpen]); 

  const handleSave = () => {
    // Updated validation: doctor required only if assignment is 'Work'
    if (assignmentType === 'Work' && !selectedDoctorId) {
        toast({
            title: t('dialog.toast.validationError.title'),
            description: t('dialog.toast.validationError.description'),
            variant: "destructive",
        });
        return; 
    }
    
    const updatedEntryData: ScheduleEntry = {
      date: date,
      doctorId: selectedDoctorId || (assignmentType === 'Off' ? 'system' : ''), 
      assignment: assignmentType,
      dayOfWeek: format(date, 'EEEE', { locale: currentDateFnsLocale }),
      isFixed: isFixed,
    };

    const doctor = doctors.find(d => d.id === selectedDoctorId);

    if (doctor && (assignmentType === 'Work' || assignmentType === 'Pre-assigned')) {
        const isVacationDayForDoctor = doctor.vacationDates.some(vacDate => 
            isSameDay(vacDate, date)
        );

        if (isVacationDayForDoctor) {
            toast({
                title: t('dialog.toast.cannotAssignOnVacation.title'),
                description: t('dialog.toast.cannotAssignOnVacation.description', { doctorName: doctor.name }),
                variant: "destructive",
            });
            return;
        }

        const isExcludedDayForDoctor = (doctor.excludedDates || []).some(exDate =>
            isSameDay(exDate, date)
        );

        if (isExcludedDayForDoctor) {
            toast({
                title: t('dialog.toast.adjustmentWarning.title'), 
                description: t('dialog.toast.excludedDayWarning.description', { doctorName: doctor.name }),
                variant: "destructive",
            });
        }

        // Check min interval
        const doctorsWorkOrPreassignedEntries = allScheduleEntries.filter(
            e => e.doctorId === selectedDoctorId && (e.assignment === 'Work' || e.assignment === 'Pre-assigned') && !isSameDay(e.date, date)
        );

        const closestWorkDayBefore = doctorsWorkOrPreassignedEntries
            .filter(e => e.date < date)
            .sort((a,b) => b.date.getTime() - a.date.getTime())[0];
        
        const closestWorkDayAfter = doctorsWorkOrPreassignedEntries
            .filter(e => e.date > date)
            .sort((a,b) => a.date.getTime() - b.date.getTime())[0];

        if(closestWorkDayBefore) {
            const diff = differenceInCalendarDays(date, closestWorkDayBefore.date);
            if (diff <= minIntervalBetweenWorkDays) {
                 toast({
                    title: t('page.toast.minIntervalWarning.title'),
                    description: t('page.toast.minIntervalWarning.description', { doctorName: doctor.name, interval: minIntervalBetweenWorkDays }),
                    variant: "destructive",
                });
            }
        }
        if(closestWorkDayAfter) {
            const diff = differenceInCalendarDays(closestWorkDayAfter.date, date);
            if (diff <= minIntervalBetweenWorkDays) {
                 toast({
                    title: t('page.toast.minIntervalWarning.title'),
                    description: t('page.toast.minIntervalWarning.description', { doctorName: doctor.name, interval: minIntervalBetweenWorkDays }),
                    variant: "destructive",
                });
            }
        }
    }
    
    onSave(updatedEntryData);
    onClose();
    const formattedDate = format(date, 'PPP', { locale: currentDateFnsLocale });
    toast({
        title: t('dialog.toast.scheduleUpdated.title'),
        description: entry 
            ? t('dialog.toast.scheduleUpdated.description.modified', { date: formattedDate })
            : t('dialog.toast.scheduleUpdated.description.added', { date: formattedDate }),
    });
  };

  const assignmentTypes: ScheduleEntry['assignment'][] = ['Work', 'Off']; // Limited assignment types

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
          <Button type="button" onClick={handleSave}>{t('dialog.saveButton')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManualAdjustmentDialog;
