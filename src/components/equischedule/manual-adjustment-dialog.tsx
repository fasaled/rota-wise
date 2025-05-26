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

interface ManualAdjustmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null; // Existing entry to edit, or null if creating new
  date: Date; // The date for which adjustment is being made
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
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(entry?.doctorId || '');
  const [assignmentType, setAssignmentType] = useState<ScheduleEntry['assignment']>(entry?.assignment || 'Work');
  const { toast } = useToast();

  useEffect(() => {
    if (entry) {
      setSelectedDoctorId(entry.doctorId);
      setAssignmentType(entry.assignment);
    } else {
      // Reset for new entry
      setSelectedDoctorId(doctors.length > 0 ? doctors[0].id : '');
      setAssignmentType('Work');
    }
  }, [entry, doctors, isOpen]); // Re-initialize when dialog opens or entry changes

  const handleSave = () => {
    if (!selectedDoctorId && (assignmentType === 'Work' || assignmentType === 'Pre-assigned' || assignmentType === 'Vacation')) {
        toast({
            title: "Validation Error",
            description: "Please select a doctor for this assignment type.",
            variant: "destructive",
        });
        return;
    }
    
    // Create a new entry object. If editing, it replaces the old one.
    // If 'entry' is null, this is a new assignment.
    // The actual replacement logic (finding by date and original doctorId if necessary) happens in the parent component.
    const updatedEntry: ScheduleEntry = {
      date: date,
      doctorId: selectedDoctorId || (assignmentType === 'Off' ? 'system' : ''), // 'system' or similar for 'Off' if no doctor context
      assignment: assignmentType,
      dayOfWeek: format(date, 'EEEE'), // e.g., "Monday"
    };

    // Basic validation: A doctor on vacation cannot be assigned Work or Pre-assigned.
    const doctor = doctors.find(d => d.id === selectedDoctorId);
    if (doctor) {
        const isVacationDayForDoctor = doctor.vacationDates.some(vacDate => 
            vacDate.getFullYear() === date.getFullYear() &&
            vacDate.getMonth() === date.getMonth() &&
            vacDate.getDate() === date.getDate()
        );

        if (isVacationDayForDoctor && (assignmentType === 'Work' || assignmentType === 'Pre-assigned')) {
            toast({
                title: "Adjustment Warning",
                description: `${doctor.name} is on vacation on this day. Cannot assign Work or Pre-assigned.`,
                variant: "destructive",
            });
            return; // Prevent saving
        }
    }
    
    onSave(updatedEntry);
    onClose();
     toast({
        title: "Schedule Updated",
        description: `Assignment for ${format(date, 'PPP')} has been ${entry ? 'modified' : 'added'}.`,
    });
  };

  const assignmentTypes: ScheduleEntry['assignment'][] = ['Work', 'Vacation', 'Pre-assigned', 'Off'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adjust Schedule for {format(date, 'PPP')}</DialogTitle>
          <DialogDescription>
            {entry ? 'Modify the assignment for this day.' : 'Add a new assignment for this day.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="doctor" className="text-right">
              Doctor
            </Label>
            <Select
              value={selectedDoctorId}
              onValueChange={setSelectedDoctorId}
              disabled={assignmentType === 'Off'}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select Doctor" />
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
              Assignment
            </Label>
            <Select value={assignmentType} onValueChange={(value) => setAssignmentType(value as ScheduleEntry['assignment'])}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select Assignment Type" />
              </SelectTrigger>
              <SelectContent>
                {assignmentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="button" onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManualAdjustmentDialog;
