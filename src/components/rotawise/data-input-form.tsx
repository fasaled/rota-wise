

import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm, useFieldArray, Controller, UseFormReturn } from 'react-hook-form';
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
import type { DateRange } from 'react-day-picker';
import type { ScheduleFormValues } from '@/lib/types';
import { cn, generateId } from '@/lib/utils';
import { Trash2, Plus } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Schema for a single doctor
const doctorSchema = z.object({
  id: z.string().default(() => generateId()),
  name: z.string().min(1, { message: "Name is required." }),
  vacationDates: z.array(z.date()).default([]),
  preAssignedWorkDates: z.array(z.date()).default([]),
  excludedDates: z.array(z.date()).default([]),
  isExcludedFromAutomaticAssignment: z.boolean().optional().default(false),
});

// Main form schema
export const scheduleFormSchema = z.object({
  numberOfDoctors: z.union([
    z.string().transform((val) => val === "" ? 0 : parseInt(val, 10)),
    z.number()
  ]).refine((val) => !isNaN(val) && val >= 0 && val <= 20, {
    message: "Number of doctors must be between 0 and 20, or empty (treated as 0)."
  }),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date({ required_error: "End date is required." })
    .refine((data) => data >= new Date(new Date().setHours(0,0,0,0)), {
      message: "End date must be today or a future date.",
    }),
  minIntervalBetweenWorkDays: z.coerce.number().int().min(0, "Minimum interval cannot be negative.").max(30, "Interval cannot exceed 30 days.").optional().default(1),
  globalMonthlyShiftLimit: z.coerce.number().int().min(0, "Monthly shift limit cannot be negative.").max(31, "Limit cannot exceed 31 days.").optional(),
  doctors: z.array(doctorSchema).min(0, "Doctor details array cannot be negative."),
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

interface SortableDoctorItemProps {
  id: string;
  children: React.ReactNode;
  isDraggingOverlay?: boolean;
}

const SortableDoctorItem = ({ id, children, isDraggingOverlay }: SortableDoctorItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
    cursor: isDragging ? 'grabbing' : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      {...listeners}
      className={cn("relative", isDraggingOverlay && "shadow-xl")}
      aria-label="Draggable doctor entry. Press space to lift."
      onKeyDown={(e) => {
        // Prevent keyboard dragging when focus is on input elements
        if (e.target !== e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
};

const DataInputForm = forwardRef<UseFormReturn<ScheduleFormValues>, DataInputFormProps>(
  (props, ref) => {
    const { onSubmit, isLoading, initialValues, onValuesChange } = props;
  const { t, currentDateFnsLocale } = useLanguage();
  const [anchorDates, setAnchorDates] = React.useState<Record<string, Date | null>>({});
    const [openPopoverKey, setOpenPopoverKey] = React.useState<string | null>(null);


  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      numberOfDoctors: initialValues?.numberOfDoctors ?? 0,
      startDate: initialValues?.startDate,
      endDate: initialValues?.endDate,
      minIntervalBetweenWorkDays: initialValues?.minIntervalBetweenWorkDays || 1,
      globalMonthlyShiftLimit: initialValues?.globalMonthlyShiftLimit,
      doctors: initialValues?.doctors && initialValues.doctors.length > 0
                 ? initialValues.doctors.map(doc => ({
                     id: doc.id || generateId(),
                     name: doc.name || '',
                     vacationDates: doc.vacationDates || [],
                     preAssignedWorkDates: doc.preAssignedWorkDates || [],
                     excludedDates: doc.excludedDates || [],
                     isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment || false,
                   }))
                 : [],
    },
  });



    useImperativeHandle(ref, () => form, [form]);

    const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "doctors",
  });

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8, // Require minimum 8px movement before starting drag
        },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      })
    );

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = fields.findIndex((field) => field.id === active.id);
        const newIndex = fields.findIndex((field) => field.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          move(oldIndex, newIndex);
        }
      }
    };

    // Effect to call onValuesChange when committed values change (debounced)
    const debouncedOnValuesChange = React.useMemo(() => {
      if (!onValuesChange) return null;
      
      let timeoutId: NodeJS.Timeout;
      return (values: ScheduleFormValues) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          onValuesChange(values);
        }, 300); // 300ms debounce to avoid calling on every keystroke
      };
    }, [onValuesChange]);

    React.useEffect(() => {
      if (!debouncedOnValuesChange) return;

      const subscription = form.watch((watchedValues) => {
        debouncedOnValuesChange(watchedValues as ScheduleFormValues);
      });

      return () => subscription.unsubscribe();
    }, [form, debouncedOnValuesChange]);

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
        <form
          onSubmit={form.handleSubmit((data) => {
            onSubmit({ ...data, numberOfDoctors: fields.length });
          })}
          className="space-y-8"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target !== e.currentTarget) {
              // Prevent form submission when Enter is pressed on form elements
              // (except when explicitly targeting the form itself)
              e.preventDefault();
            }
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Date range — single calendar, spans 2 columns */}
            {(() => {
              const startDate = form.watch('startDate');
              const endDate = form.watch('endDate');
              const range: DateRange = { from: startDate, to: endDate };
              const hasRange = startDate || endDate;
              return (
                <div className="lg:col-span-2">
                  <Label className="font-semibold min-h-7 block">{t('form.dateRange')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        tabIndex={2}
                        className={cn("w-full justify-start text-left font-normal mt-1", !hasRange && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        {hasRange ? (
                          <span>
                            {startDate ? format(startDate, 'PP', { locale: currentDateFnsLocale }) : '…'}
                            {' → '}
                            {endDate ? format(endDate, 'PP', { locale: currentDateFnsLocale }) : '…'}
                          </span>
                        ) : (
                          <span>{t('form.pickDateRange')}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <Calendar
                        mode="range"
                        selected={range}
                        onSelect={(r: DateRange | undefined) => {
                          form.setValue('startDate', r?.from as Date, { shouldValidate: true });
                          form.setValue('endDate', r?.to as Date, { shouldValidate: true });
                        }}
                        locale={currentDateFnsLocale}
                        numberOfMonths={2}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {form.formState.errors.startDate && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.startDate.message}</p>
                  )}
                  {form.formState.errors.endDate && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.endDate.message}</p>
                  )}
                </div>
              );
            })()}
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
                    tabIndex={4}
                    {...field}
                     onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      field.onChange(isNaN(val) ? 1 : val);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    className="mt-1"
                  />
                )}
              />
              {form.formState.errors.minIntervalBetweenWorkDays && <p className="text-sm text-destructive mt-1">{form.formState.errors.minIntervalBetweenWorkDays.message}</p>}
            </div>
            <div>
              <Label htmlFor="globalMonthlyShiftLimit" className="font-semibold min-h-7 block">{t('form.globalMonthlyLimit')}</Label>
              <Controller
                name="globalMonthlyShiftLimit"
                control={form.control}
                render={({ field }) => (
                  <Input
                    id="globalMonthlyShiftLimit"
                    type="number"
                    min="0" max="31"
                    tabIndex={5}
                    {...field}
                    value={field.value ?? ""}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === "") {
                        field.onChange(undefined);
                      } else {
                        const numVal = parseInt(val, 10);
                        field.onChange(isNaN(numVal) ? undefined : numVal);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    className="mt-1"
                    placeholder={t('form.globalMonthlyLimitPlaceholder')}
                  />
                )}
              />
              {form.formState.errors.globalMonthlyShiftLimit && <p className="text-sm text-destructive mt-1">{form.formState.errors.globalMonthlyShiftLimit.message}</p>}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <DoctorsIcon className="text-primary"/> {t('form.doctorDetails')}
            </h3>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={fields.map(field => field.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-6">
                    {fields.map((docField, index) => (
                      <SortableDoctorItem key={docField.id} id={docField.id}>
                        <Card className="relative shadow-md">
                <CardContent className="space-y-4 p-3 md:p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                      <Label htmlFor={`doctors.${index}.name`} className="font-medium">{t('form.doctorNameLabel')}</Label>
                      <div className="flex gap-2 items-center mt-1">
                        <Controller
                          name={`doctors.${index}.name`}
                          control={form.control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              id={`doctors.${index}.name`}
                              placeholder={t('form.doctorNamePlaceholder')}
                              className="bg-background"
                              onPointerDown={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }
                              }}
                            />
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => remove(index)}
                          className="shrink-0 text-destructive hover:text-destructive-foreground hover:bg-destructive/90"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
                                        onPointerDown={(e) => e.stopPropagation()}
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
                                  render={({ field: controllerDateField }) => {
                                    const pickerKey = `${docField.id}-vacationDates`;
                                    return (
                                      <Popover
                                        open={openPopoverKey === pickerKey}
                                        onOpenChange={(isOpen) => {
                                          setOpenPopoverKey(isOpen ? pickerKey : null);
                                          if (!isOpen) {
                                            setAnchorDates(prev => ({ ...prev, [pickerKey]: null }));
                                          }
                                        }}
                                      >
                            <PopoverTrigger asChild>
                                          <Button onPointerDown={(e) => e.stopPropagation()} variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 bg-background", !controllerDateField.value?.length && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                            {controllerDateField.value?.length ? t('form.datesSelected', { count: controllerDateField.value.length }) : <span>{t('form.selectDates')}</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                              <div onPointerDown={(e) => e.stopPropagation()}>
                                <Calendar
                                  mode="multiple"
                                  selected={controllerDateField.value}
                                  onSelect={(newDays, dayClicked, _modifiers, event) => {
                                    handleDateSelectionWithShiftSupport(
                                      controllerDateField.value,
                                      newDays,
                                      dayClicked,
                                      event as unknown as React.MouseEvent,
                                      controllerDateField.onChange,
                                      pickerKey
                                    );
                                  }}
                                  locale={currentDateFnsLocale}
                                  disabled={(date) => {
                                    const startDate = form.getValues('startDate');
                                    const endDate = form.getValues('endDate');
                                    return date < startDate || date > endDate;
                                  }}
                                  fromDate={form.getValues('startDate')}
                                  toDate={form.getValues('endDate')}
                                  initialFocus
                                  components={{
                                    IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                                    IconRight: () => <ChevronRight className="h-4 w-4" />
                                  }}
                                />
                              </div>
                            </PopoverContent>
                          </Popover>
                                    );
                                  }}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`doctors.${index}.preAssignedWorkDates`} className="font-medium flex items-center gap-1"><PreAssignedIcon className="w-4 h-4 text-primary"/>{t('form.preAssignedWorkDates')}</Label>
                       <Controller
                        name={`doctors.${index}.preAssignedWorkDates`}
                        control={form.control}
                                  render={({ field: controllerDateField }) => {
                                    const pickerKey = `${docField.id}-preAssignedWorkDates`;
                                    return (
                                      <Popover
                                        open={openPopoverKey === pickerKey}
                                        onOpenChange={(isOpen) => {
                                          setOpenPopoverKey(isOpen ? pickerKey : null);
                                          if (!isOpen) {
                                            setAnchorDates(prev => ({ ...prev, [pickerKey]: null }));
                                          }
                                        }}
                                      >
                            <PopoverTrigger asChild>
                                          <Button onPointerDown={(e) => e.stopPropagation()} variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 bg-background", !controllerDateField.value?.length && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                            {controllerDateField.value?.length ? t('form.datesSelected', { count: controllerDateField.value.length }) : <span>{t('form.selectDates')}</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                               <div onPointerDown={(e) => e.stopPropagation()}>
                                 <Calendar
                                  mode="multiple"
                                  selected={controllerDateField.value}
                                  onSelect={(newDays, dayClicked, _modifiers, event) => {
                                    handleDateSelectionWithShiftSupport(
                                      controllerDateField.value,
                                      newDays,
                                      dayClicked,
                                      event as unknown as React.MouseEvent,
                                      controllerDateField.onChange,
                                      pickerKey
                                    );
                                  }}
                                  locale={currentDateFnsLocale}
                                  disabled={(date) => {
                                    const startDate = form.getValues('startDate');
                                    const endDate = form.getValues('endDate');
                                    return date < startDate || date > endDate;
                                  }}
                                  fromDate={form.getValues('startDate')}
                                  toDate={form.getValues('endDate')}
                                  initialFocus
                                  components={{
                                    IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                                    IconRight: () => <ChevronRight className="h-4 w-4" />
                                  }}
                                />
                               </div>
                            </PopoverContent>
                          </Popover>
                                    );
                                  }}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`doctors.${index}.excludedDates`} className="font-medium flex items-center gap-1"><CalendarXIcon className="w-4 h-4 text-destructive"/>{t('form.excludedDates')}</Label>
                       <Controller
                        name={`doctors.${index}.excludedDates`}
                        control={form.control}
                                  render={({ field: controllerDateField }) => {
                                    const pickerKey = `${docField.id}-excludedDates`;
                                    return (
                                      <Popover
                                        open={openPopoverKey === pickerKey}
                                        onOpenChange={(isOpen) => {
                                          setOpenPopoverKey(isOpen ? pickerKey : null);
                                          if (!isOpen) {
                                            setAnchorDates(prev => ({ ...prev, [pickerKey]: null }));
                                          }
                                        }}
                                      >
                            <PopoverTrigger asChild>
                                          <Button onPointerDown={(e) => e.stopPropagation()} variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 bg-background", !controllerDateField.value?.length && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                            {controllerDateField.value?.length ? t('form.datesSelected', { count: controllerDateField.value.length }) : <span>{t('form.selectDates')}</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                               <div onPointerDown={(e) => e.stopPropagation()}>
                                 <Calendar
                                  mode="multiple"
                                  selected={controllerDateField.value}
                                  onSelect={(newDays, dayClicked, _modifiers, event) => {
                                    handleDateSelectionWithShiftSupport(
                                      controllerDateField.value,
                                      newDays,
                                      dayClicked,
                                      event as unknown as React.MouseEvent,
                                      controllerDateField.onChange,
                                      pickerKey
                                    );
                                  }}
                                  locale={currentDateFnsLocale}
                                  disabled={(date) => {
                                    const startDate = form.getValues('startDate');
                                    const endDate = form.getValues('endDate');
                                    return date < startDate || date > endDate;
                                  }}
                                  fromDate={form.getValues('startDate')}
                                  toDate={form.getValues('endDate')}
                                  initialFocus
                                  components={{
                                    IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                                    IconRight: () => <ChevronRight className="h-4 w-4" />
                                  }}
                                />
                               </div>
                            </PopoverContent>
                          </Popover>
                                    );
                                  }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
                      </SortableDoctorItem>
            ))}
                  </div>
                </SortableContext>
              </DndContext>
            {(form.formState.errors.doctors && typeof form.formState.errors.doctors.message === 'string') && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.doctors.message}</p>
            )}
             {form.formState.errors.doctors?.root && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.doctors.root.message}</p>
            )}

            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => append({ id: generateId(), name: '', vacationDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false })}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('form.addDoctor')}
            </Button>
          </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-4 pt-6">
              <Button 
                type="submit" 
                disabled={
                  isLoading || 
                  fields.length === 0 || 
                  fields.every(field => !form.getValues(`doctors.${fields.indexOf(field)}.name`)?.trim())
                } 
                className="w-full sm:w-auto sm:flex-grow-0 max-w-md"
              >
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
  }
);

DataInputForm.displayName = 'DataInputForm';

export default DataInputForm;
