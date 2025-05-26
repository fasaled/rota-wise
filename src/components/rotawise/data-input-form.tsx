"use client";

import React from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, DoctorsIcon, PreferencesIcon, VacationIcon, PreAssignedIcon } from '@/components/icons';
import { format, parseISO } from 'date-fns';
import type { ScheduleFormValues, DoctorFormFieldInput } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PlusCircle, Trash2, UserPlus, Users } from 'lucide-react';

// Schema for a single doctor
const doctorSchema = z.object({
  id: z.string(), // For react-hook-form key
  name: z.string().min(1, "Doctor's name is required."),
  vacationDates: z.array(z.date()).default([]),
  preAssignedWorkDates: z.array(z.date()).default([]),
});

// Main form schema
export const scheduleFormSchema = z.object({
  numberOfDoctors: z.coerce.number().min(1, "At least one doctor is required.").max(20, "Maximum of 20 doctors allowed."),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date({ required_error: "End date is required." })
    .refine((data) => data > new Date(new Date().setDate(new Date().getDate() -1)), { // Ensure end date is today or in future
      message: "End date must be today or a future date.", // Custom message if needed
    }),
  doctors: z.array(doctorSchema).min(1, "At least one doctor's details must be provided."),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before start date.",
  path: ["endDate"],
});

interface DataInputFormProps {
  onSubmit: (data: ScheduleFormValues) => void;
  isLoading: boolean;
  initialValues?: Partial<ScheduleFormValues>;
}

const DataInputForm: React.FC<DataInputFormProps> = ({ onSubmit, isLoading, initialValues }) => {
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      numberOfDoctors: initialValues?.numberOfDoctors || 1,
      startDate: initialValues?.startDate || new Date(),
      endDate: initialValues?.endDate || new Date(new Date().setDate(new Date().getDate() + 30)),
      doctors: initialValues?.doctors || [{ id: crypto.randomUUID(), name: '', vacationDates: [], preAssignedWorkDates: [] }],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "doctors",
  });

  const numberOfDoctors = form.watch('numberOfDoctors');

  React.useEffect(() => {
    const currentDoctorCount = fields.length;
    if (numberOfDoctors > currentDoctorCount) {
      for (let i = 0; i < numberOfDoctors - currentDoctorCount; i++) {
        append({ id: crypto.randomUUID(), name: '', vacationDates: [], preAssignedWorkDates: [] });
      }
    } else if (numberOfDoctors < currentDoctorCount && numberOfDoctors > 0) {
      for (let i = 0; i < currentDoctorCount - numberOfDoctors; i++) {
        remove(currentDoctorCount - 1 - i);
      }
    } else if (numberOfDoctors <= 0 && currentDoctorCount > 0) {
       // Prevent removing all doctors if number becomes 0 or less, reset to 1 doctor
       form.setValue('numberOfDoctors', 1);
       if (currentDoctorCount > 1) {
         for (let i = 0; i < currentDoctorCount - 1; i++) {
           remove(currentDoctorCount - 1 - i);
         }
       }
    }
  }, [numberOfDoctors, fields.length, append, remove, form]);


  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <PreferencesIcon className="text-primary" /> Schedule Parameters
        </CardTitle>
        <CardDescription>Define the doctors and date range for the schedule.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label htmlFor="numberOfDoctors" className="font-semibold">Number of Doctors</Label>
              <Controller
                name="numberOfDoctors"
                control={form.control}
                render={({ field }) => (
                  <Input
                    id="numberOfDoctors"
                    type="number"
                    min="1" max="20"
                    {...field}
                    onChange={e => field.onChange(parseInt(e.target.value, 10))}
                    className="mt-1"
                  />
                )}
              />
              {form.formState.errors.numberOfDoctors && <p className="text-sm text-destructive mt-1">{form.formState.errors.numberOfDoctors.message}</p>}
            </div>
            <div>
              <Label htmlFor="startDate" className="font-semibold">Schedule Start Date</Label>
              <Controller
                name="startDate"
                control={form.control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !field.value && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {form.formState.errors.startDate && <p className="text-sm text-destructive mt-1">{form.formState.errors.startDate.message}</p>}
            </div>
            <div>
              <Label htmlFor="endDate" className="font-semibold">Schedule End Date</Label>
              <Controller
                name="endDate"
                control={form.control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !field.value && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {form.formState.errors.endDate && <p className="text-sm text-destructive mt-1">{form.formState.errors.endDate.message}</p>}
            </div>
          </div>
          
          <Separator />

          <div>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <DoctorsIcon className="text-primary"/> Doctor Details
            </h3>
            {fields.map((item, index) => (
              <Card key={item.id} className="mb-6 p-2 md:p-4 bg-secondary/30 shadow-md">
                <CardHeader className="p-2 md:p-4">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">Doctor {index + 1}</CardTitle>
                    {fields.length > 1 && (
                       <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive hover:text-destructive-foreground hover:bg-destructive/90">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-2 md:p-4">
                  <div>
                    <Label htmlFor={`doctors.${index}.name`} className="font-medium">Name</Label>
                    <Controller
                      name={`doctors.${index}.name`}
                      control={form.control}
                      render={({ field }) => <Input {...field} id={`doctors.${index}.name`} placeholder="e.g., Dr. Smith" className="mt-1 bg-background"/>}
                    />
                    {form.formState.errors.doctors?.[index]?.name && <p className="text-sm text-destructive mt-1">{form.formState.errors.doctors?.[index]?.name?.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`doctors.${index}.vacationDates`} className="font-medium flex items-center gap-1"><VacationIcon className="w-4 h-4 text-accent"/>Vacation Dates</Label>
                      <Controller
                        name={`doctors.${index}.vacationDates`}
                        control={form.control}
                        render={({ field }) => (
                           <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 bg-background", !field.value?.length && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.length ? `${field.value.length} date(s) selected` : <span>Select dates</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar mode="multiple" selected={field.value} onSelect={field.onChange} min={0} />
                            </PopoverContent>
                          </Popover>
                        )}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`doctors.${index}.preAssignedWorkDates`} className="font-medium flex items-center gap-1"><PreAssignedIcon className="w-4 h-4 text-primary"/>Pre-assigned Work Dates</Label>
                       <Controller
                        name={`doctors.${index}.preAssignedWorkDates`}
                        control={form.control}
                        render={({ field }) => (
                           <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 bg-background", !field.value?.length && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.length ? `${field.value.length} date(s) selected` : <span>Select dates</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar mode="multiple" selected={field.value} onSelect={field.onChange} min={0} />
                            </PopoverContent>
                          </Popover>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {form.formState.errors.doctors && typeof form.formState.errors.doctors === 'string' && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.doctors.message}</p>
            )}
             {form.formState.errors.doctors?.root &&  (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.doctors.root.message}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading} size="lg" className="min-w-[200px]">
              {isLoading ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </div>
              ) : 'Generate Schedule'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default DataInputForm;
