"use client";

import React from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, DoctorsIcon, PreferencesIcon, VacationIcon, PreAssignedIcon, CalendarXIcon, Clock3Icon } from '@/components/icons';
import { format, eachDayOfInterval } from 'date-fns';
import type { ScheduleFormValues } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

// Schema for a single doctor
const doctorSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Doctor's name is required."),
  vacationDates: z.array(z.date()).default([]),
  preAssignedWorkDates: z.array(z.date()).default([]),
  excludedDates: z.array(z.date()).default([]),
  isExcludedFromAutomaticAssignment: z.boolean().optional().default(false),
});

// Main form schema
export const scheduleFormSchema = z.object({
  numberOfDoctors: z.coerce.number().min(1, "At least one doctor is required.").max(20, "Maximum of 20 doctors allowed."),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date({ required_error: "End date is required." })
    .refine((data) => data >= new Date(new Date().setHours(0,0,0,0)), {
      message: "End date must be today or a future date.",
    }),
  minIntervalBetweenWorkDays: z.coerce.number().int().min(0, "Minimum interval cannot be negative.").max(30, "Interval cannot exceed 30 days.").optional().default(1),
  doctors: z.array(doctorSchema).min(1, "At least one doctor's details must be provided."),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before start date.",
  path: ["endDate"],
});

interface DataInputFormProps {
  onSubmit: (data: ScheduleFormValues) => void;
  isLoading: boolean;
  initialValues?: Partial<ScheduleFormValues>;
  onValuesChange?: (values: ScheduleFormValues) => void;
}

const DataInputForm: React.FC<DataInputFormProps> = ({ onSubmit, isLoading, initialValues, onValuesChange }) => {
  const { t, currentDateFnsLocale } = useLanguage();
  const [anchorDates, setAnchorDates] = React.useState<Record<string, Date | null>>({});

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      numberOfDoctors: initialValues?.numberOfDoctors || 1,
      startDate: initialValues?.startDate,
      endDate: initialValues?.endDate,
      minIntervalBetweenWorkDays: initialValues?.minIntervalBetweenWorkDays || 1,
      doctors: initialValues?.doctors && initialValues.doctors.length > 0
                 ? initialValues.doctors.map(doc => ({
                     id: doc.id || crypto.randomUUID(),
                     name: doc.name || '',
                     vacationDates: doc.vacationDates || [],
                     preAssignedWorkDates: doc.preAssignedWorkDates || [],
                     excludedDates: doc.excludedDates || [],
                     isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
                   }))
                 : [{ id: crypto.randomUUID(), name: '', vacationDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "doctors",
  });

  const numberOfDoctorsWatched = form.watch('numberOfDoctors');

  React.useEffect(() => {
    const currentDoctorCount = fields.length;
    const targetDoctorCount = Math.max(1, isNaN(numberOfDoctorsWatched) ? 1 : numberOfDoctorsWatched);


    if (targetDoctorCount > currentDoctorCount) {
      for (let i = 0; i < targetDoctorCount - currentDoctorCount; i++) {
        append({ id: crypto.randomUUID(), name: '', vacationDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false });
      }
    } else if (targetDoctorCount < currentDoctorCount) {
      for (let i = 0; i < currentDoctorCount - targetDoctorCount; i++) {
        remove(currentDoctorCount - 1 - i);
      }
    }
    if (form.getValues('numberOfDoctors') < 1 || isNaN(form.getValues('numberOfDoctors'))) {
      form.setValue('numberOfDoctors', 1, { shouldValidate: true });
    }

  }, [numberOfDoctorsWatched, fields.length, append, remove, form]);

  // Define a stable default for a single doctor to avoid re-creating it on every render
  const stableDefaultDoctorValue = React.useMemo(() => ({
    id: crypto.randomUUID(),
    name: '',
    vacationDates: [] as Date[],
    preAssignedWorkDates: [] as Date[],
    excludedDates: [] as Date[],
    isExcludedFromAutomaticAssignment: false
  }), []);

  React.useEffect(() => {
    if (initialValues) {
      const numDocsFromInitial = initialValues.numberOfDoctors !== undefined && initialValues.numberOfDoctors >= 1
                                   ? initialValues.numberOfDoctors
                                   : 1; // Default to 1 if not provided or invalid

      let doctorsArrayForReset: Array<typeof stableDefaultDoctorValue> = [];

      if (initialValues.doctors && initialValues.doctors.length > 0) {
        doctorsArrayForReset = initialValues.doctors.slice(0, numDocsFromInitial).map(doc => ({
          ...stableDefaultDoctorValue, // Spread default structure first
          ...(doc || {}), // Spread loaded doctor data
          id: doc?.id || crypto.randomUUID(), // Ensure ID
          name: doc?.name || '',
          // Ensure dates are Date objects
          vacationDates: (doc?.vacationDates || []).map(d => d instanceof Date ? d : new Date(d)),
          preAssignedWorkDates: (doc?.preAssignedWorkDates || []).map(d => d instanceof Date ? d : new Date(d)),
          excludedDates: (doc?.excludedDates || []).map(d => d instanceof Date ? d : new Date(d)),
          isExcludedFromAutomaticAssignment: doc?.isExcludedFromAutomaticAssignment || false,
        }));
      }

      // If numDocsFromInitial is greater than what initialValues.doctors provided, fill with defaults
      if (doctorsArrayForReset.length < numDocsFromInitial) {
        for (let i = doctorsArrayForReset.length; i < numDocsFromInitial; i++) {
          doctorsArrayForReset.push({
            ...stableDefaultDoctorValue,
            id: crypto.randomUUID(), // New ID for new default doctor
            // Ensure date arrays are new instances and correctly typed
            vacationDates: [] as Date[],
            preAssignedWorkDates: [] as Date[],
            excludedDates: [] as Date[],
          });
        }
      }
      
      const resetData = {
        numberOfDoctors: numDocsFromInitial,
        startDate: initialValues.startDate, // Assumed to be Date object or undefined from parent
        endDate: initialValues.endDate,     // Assumed to be Date object or undefined from parent
        minIntervalBetweenWorkDays: initialValues.minIntervalBetweenWorkDays !== undefined 
                                      ? initialValues.minIntervalBetweenWorkDays 
                                      : 1, // Default minInterval
        doctors: doctorsArrayForReset,
      };

      form.reset(resetData);
    }
  }, [initialValues, form, stableDefaultDoctorValue]);

  // Effect to call onValuesChange when form values change (debounced)
  React.useEffect(() => {
    if (!onValuesChange) return;

    const subscription = form.watch((values) => {
      // The `values` object from watch might contain functions if not careful with how fields are registered.
      // We need to ensure we're passing a clean data object.
      // However, getValues() should provide the clean, current state of the form.
      onValuesChange(form.getValues() as ScheduleFormValues);
    });

    return () => subscription.unsubscribe();
  }, [form, onValuesChange]);

  const handleDateSelectionWithShiftSupport = (
    currentSelectionFromFormField: Date[] | undefined,
    rdpCalculatedNewSelection: Date[] | undefined,
    clickedDate: Date,
    event: React.MouseEvent,
    fieldOnChange: (dates: Date[]) => void,
    anchorKey: string
  ) => {
    const actualCurrentSelection = currentSelectionFromFormField || [];
    const currentAnchorDate = anchorDates[anchorKey];

    if (event.shiftKey && currentAnchorDate) {
      const rangeDates = eachDayOfInterval({
        start: new Date(Math.min(currentAnchorDate.getTime(), clickedDate.getTime())),
        end: new Date(Math.max(currentAnchorDate.getTime(), clickedDate.getTime())),
      });

      const newSelectedTimestamps = new Set(actualCurrentSelection.map(d => new Date(d).setHours(0,0,0,0)));

      rangeDates.forEach(dateInRange => {
        newSelectedTimestamps.add(new Date(dateInRange).setHours(0,0,0,0));
      });
      
      const finalDatesArray = Array.from(newSelectedTimestamps).map(time => new Date(time));
      finalDatesArray.sort((a,b) => a.getTime() - b.getTime());
      
      fieldOnChange(finalDatesArray);
      setAnchorDates(prev => ({ ...prev, [anchorKey]: clickedDate }));
    } else {
      fieldOnChange(rdpCalculatedNewSelection || []);
      setAnchorDates(prev => ({ ...prev, [anchorKey]: clickedDate }));
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <PreferencesIcon className="text-primary" /> {t('form.title')}
        </CardTitle>
        <CardDescription>{t('form.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <Label htmlFor="numberOfDoctors" className="font-semibold min-h-7 block">{t('form.numDoctors')}</Label>
              <Controller
                name="numberOfDoctors"
                control={form.control}
                render={({ field }) => (
                  <Input
                    id="numberOfDoctors"
                    type="number"
                    min="1" max="20"
                    {...field}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      field.onChange(isNaN(val) ? 1 : val);
                    }}
                    className="mt-1"
                  />
                )}
              />
              {form.formState.errors.numberOfDoctors && <p className="text-sm text-destructive mt-1">{form.formState.errors.numberOfDoctors.message}</p>}
            </div>
            <div>
              <Label htmlFor="startDate" className="font-semibold min-h-7 block">{t('form.startDate')}</Label>
              <Controller
                name="startDate"
                control={form.control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !field.value && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, 'PPP', { locale: currentDateFnsLocale }) : <span>{t('form.pickDate')}</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        locale={currentDateFnsLocale}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {form.formState.errors.startDate && <p className="text-sm text-destructive mt-1">{form.formState.errors.startDate.message}</p>}
            </div>
            <div>
              <Label htmlFor="endDate" className="font-semibold min-h-7 block">{t('form.endDate')}</Label>
              <Controller
                name="endDate"
                control={form.control}
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !field.value && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, 'PPP', { locale: currentDateFnsLocale }) : <span>{t('form.pickDate')}</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                       <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        locale={currentDateFnsLocale}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {form.formState.errors.endDate && <p className="text-sm text-destructive mt-1">{form.formState.errors.endDate.message}</p>}
            </div>
            <div>
              <Label htmlFor="minIntervalBetweenWorkDays" className="font-semibold flex items-center gap-1 min-h-7">
                <Clock3Icon className="w-4 h-4 text-primary"/>
                {t('form.minInterval')}
              </Label>
              <Controller
                name="minIntervalBetweenWorkDays"
                control={form.control}
                render={({ field }) => (
                  <Input
                    id="minIntervalBetweenWorkDays"
                    type="number"
                    min="0" max="30"
                    {...field}
                     onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      field.onChange(isNaN(val) ? 1 : val);
                    }}
                    className="mt-1"
                  />
                )}
              />
              {form.formState.errors.minIntervalBetweenWorkDays && <p className="text-sm text-destructive mt-1">{form.formState.errors.minIntervalBetweenWorkDays.message}</p>}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <DoctorsIcon className="text-primary"/> {t('form.doctorDetails')}
            </h3>
            {fields.map((item, index) => (
              <Card key={item.id} className="mb-6 p-2 md:p-4 bg-secondary/30 shadow-md">
                <CardHeader className="p-2 md:p-4">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">{t('form.doctorNum', { index: index + 1 })}</CardTitle>
                    {fields.length > 1 && (
                       <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const currentNumDoctors = form.getValues('numberOfDoctors');
                          if (currentNumDoctors > 1) {
                            form.setValue('numberOfDoctors', currentNumDoctors - 1, { shouldValidate: true });
                          } else {
                             form.setValue('numberOfDoctors', 1, { shouldValidate: true }); 
                          }
                          remove(index);
                        }}
                        className="text-destructive hover:text-destructive-foreground hover:bg-destructive/90"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-2 md:p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                      <Label htmlFor={`doctors.${index}.name`} className="font-medium">{t('form.doctorNameLabel')}</Label>
                      <Controller
                        name={`doctors.${index}.name`}
                        control={form.control}
                        render={({ field }) => <Input {...field} id={`doctors.${index}.name`} placeholder={t('form.doctorNamePlaceholder')} className="mt-1 bg-background"/>}
                      />
                      {form.formState.errors.doctors?.[index]?.name && <p className="text-sm text-destructive mt-1">{form.formState.errors.doctors[index]?.name?.message}</p>}
                    </div>
                    <div>
                      <Controller
                        name={`doctors.${index}.isExcludedFromAutomaticAssignment`}
                        control={form.control}
                        render={({ field }) => (
                          <div className="flex items-center space-x-2 mt-2 md:mt-0 md:justify-start">
                            <Checkbox
                              id={`doctors.${index}.isExcludedFromAutomaticAssignment`}
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="bg-background"
                            />
                            <Label htmlFor={`doctors.${index}.isExcludedFromAutomaticAssignment`} className="font-medium text-sm">
                              {t('form.excludeFromAutoAssignment')}
                            </Label>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`doctors.${index}.vacationDates`} className="font-medium flex items-center gap-1"><VacationIcon className="w-4 h-4 text-accent"/>{t('form.vacationDates')}</Label>
                      <Controller
                        name={`doctors.${index}.vacationDates`}
                        control={form.control}
                        render={({ field }) => (
                           <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 bg-background", !field.value?.length && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.length ? t('form.datesSelected', { count: field.value.length }) : <span>{t('form.selectDates')}</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                              <Calendar
                                mode="multiple"
                                selected={field.value}
                                onSelect={(newDays, dayClicked, modifiers, event) => {
                                  handleDateSelectionWithShiftSupport(
                                    field.value,
                                    newDays,
                                    dayClicked,
                                    event as unknown as React.MouseEvent,
                                    field.onChange,
                                    `${item.id}-vacationDates`
                                  );
                                }}
                                locale={currentDateFnsLocale}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`doctors.${index}.preAssignedWorkDates`} className="font-medium flex items-center gap-1"><PreAssignedIcon className="w-4 h-4 text-primary"/>{t('form.preAssignedWorkDates')}</Label>
                       <Controller
                        name={`doctors.${index}.preAssignedWorkDates`}
                        control={form.control}
                        render={({ field }) => (
                           <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 bg-background", !field.value?.length && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.length ? t('form.datesSelected', { count: field.value.length }) : <span>{t('form.selectDates')}</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                               <Calendar
                                mode="multiple"
                                selected={field.value}
                                onSelect={(newDays, dayClicked, modifiers, event) => {
                                  handleDateSelectionWithShiftSupport(
                                    field.value,
                                    newDays,
                                    dayClicked,
                                    event as unknown as React.MouseEvent,
                                    field.onChange,
                                    `${item.id}-preAssignedWorkDates`
                                  );
                                }}
                                locale={currentDateFnsLocale}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`doctors.${index}.excludedDates`} className="font-medium flex items-center gap-1"><CalendarXIcon className="w-4 h-4 text-destructive"/>{t('form.excludedDates')}</Label>
                       <Controller
                        name={`doctors.${index}.excludedDates`}
                        control={form.control}
                        render={({ field }) => (
                           <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 bg-background", !field.value?.length && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.length ? t('form.datesSelected', { count: field.value.length }) : <span>{t('form.selectDates')}</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                               <Calendar
                                mode="multiple"
                                selected={field.value}
                                onSelect={(newDays, dayClicked, modifiers, event) => {
                                  handleDateSelectionWithShiftSupport(
                                    field.value,
                                    newDays,
                                    dayClicked,
                                    event as unknown as React.MouseEvent,
                                    field.onChange,
                                    `${item.id}-excludedDates`
                                  );
                                }}
                                locale={currentDateFnsLocale}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(form.formState.errors.doctors && typeof form.formState.errors.doctors.message === 'string') && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.doctors.message}</p>
            )}
             {form.formState.errors.doctors?.root && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.doctors.root.message}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end gap-4 pt-6">
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto sm:flex-grow-0 max-w-md">
              {isLoading ? (
                <><span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-white rounded-full"></span>{t('form.generatingButton')}</>
              ) : (
                t('form.generateButton')
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default DataInputForm;
