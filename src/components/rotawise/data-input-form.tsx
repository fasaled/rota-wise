

import React, { forwardRef, useImperativeHandle } from 'react';
import { useForm, useFieldArray, useWatch, Controller, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, DoctorsIcon, VacationIcon, PreAssignedIcon, CalendarXIcon, Clock3Icon } from '@/components/icons';
import { format, eachDayOfInterval } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import type { ScheduleFormValues, Unit } from '@/lib/types';
import { cn, generateId } from '@/lib/utils';
import { Trash2, Plus, GripVertical, Building2 } from 'lucide-react';
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

// Schema for a single unit
const unitSchema = z.object({
  id: z.string().default(() => generateId()),
  name: z.string().min(1, { message: "Unit name is required." }),
  minPostCallCoverage: z.coerce.number().int().min(0, "Minimum coverage cannot be negative.").max(20, "Minimum coverage cannot exceed 20.").default(0),
});

// Schema for a single doctor
const doctorSchema = z.object({
  id: z.string().default(() => generateId()),
  name: z.string().min(1, { message: "Name is required." }),
  vacationDates: z.array(z.date()).default([]),
  preAssignedWorkDates: z.array(z.date()).default([]),
  excludedDates: z.array(z.date()).default([]),
  isExcludedFromAutomaticAssignment: z.boolean().optional().default(false),
  unitId: z.string().optional().default(''),
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
  units: z.array(unitSchema).default([]),
  holidays: z.array(z.date()).default([]),
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
                     unitId: (doc as { unitId?: string }).unitId || '',
                   }))
                 : [],
      units: (initialValues as { units?: Array<{ id: string; name: string; minPostCallCoverage: number }> } | undefined)?.units ?? [],
      holidays: (initialValues as { holidays?: Date[] } | undefined)?.holidays ?? [],
    },
  });



    useImperativeHandle(ref, () => form, [form]);

    const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "doctors",
  });

    const { fields: unitFields, append: appendUnit, remove: removeUnit, replace: replaceUnits } = useFieldArray({
      control: form.control,
      name: "units",
    });

    // `useFieldArray` does not always pick up the initial values from
    // `defaultValues` on the very first render after a remount (the case
    // when loading a file). This effect forces the field array into sync
    // with the loaded `initialValues.units` so the page's `units` state
    // (which is derived from the form) and the coverage memo are populated
    // immediately, without waiting for the user to interact with the form.
    React.useEffect(() => {
      const incoming = (initialValues as { units?: Unit[] } | undefined)?.units ?? [];
      const current = (form.getValues('units') as Unit[] | undefined) ?? [];
      const sameLength = incoming.length === current.length;
      const sameIds = sameLength && incoming.every((u, i) => u.id === current[i]?.id);
      if (!sameIds) {
        replaceUnits(incoming);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialValues, form, replaceUnits]);

    // `useFieldArray` doesn't always pick up the initial values from
    // `defaultValues` on the very first render after a remount (the form
    // sees a stale empty list until the first interaction). For the doctor
    // unit Select we need the real list synchronously, so we read it
    // directly from the form state via `form.watch`. `unitFields` is still
    // used for the append/remove mutations and for rendering the unit cards.
    // `useWatch` is a hook that subscribes to the `units` field and returns
    // the current value (re-rendering on change), unlike `form.watch('units')`
    // which can return `[]` on the very first render after the form is
    // re-mounted with new `defaultValues` (the case when loading a file).
    const watchedUnitsRaw = useWatch({
      control: form.control,
      name: 'units',
      defaultValue: (initialValues as { units?: Unit[] } | undefined)?.units ?? [],
    });
    const watchedUnits = (Array.isArray(watchedUnitsRaw) ? watchedUnitsRaw : []) as Unit[];
    // Fallback chain: watched value → useFieldArray's tracked fields →
    // initialValues.units. The last fallback ensures the Select has the
    // correct options on the very first render after a remount, even if
    // the form state hasn't fully propagated yet.
    const initialUnitsFallback = (initialValues as { units?: Unit[] } | undefined)?.units ?? [];
    const unitsForSelect =
      watchedUnits.length > 0
        ? watchedUnits
        : unitFields.length > 0
          ? unitFields
          : initialUnitsFallback;

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

    // `useFieldArray` mutations (appendUnit/removeUnit/move) update the internal
    // form state synchronously but the subscription set up via `form.watch(cb)`
    // is not always notified for those structural changes, which means the
    // parent never learns about them and the auto-save never sees the new
    // `units` array. We work around this by calling `onValuesChange` ourselves
    // after every useFieldArray mutation.
    const triggerValuesChange = React.useCallback(() => {
      if (!onValuesChange) return;
      const current = form.getValues() as ScheduleFormValues;
      debouncedOnValuesChange?.(current);
      // Also flush immediately to keep the page's `units` state in sync for
      // the dot rendering in the calendar (no 300ms lag).
      onValuesChange(current);
    }, [onValuesChange, debouncedOnValuesChange, form]);

    React.useEffect(() => {
      if (!debouncedOnValuesChange) return;

      const subscription = form.watch((watchedValues) => {
        // Always notify immediately so the parent recomputes coverage
        // (dots + warnings) the moment the user edits anything in the form
        // — no 300ms lag. The debounced version below still handles the
        // auto-save debounce independently.
        onValuesChange?.(watchedValues as ScheduleFormValues);
        debouncedOnValuesChange(watchedValues as ScheduleFormValues);
      });

      return () => subscription.unsubscribe();
    }, [form, debouncedOnValuesChange, onValuesChange]);

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
    <Card className="shadow-sm">
      <CardContent>
        <form
          id="schedule-form"
          onSubmit={form.handleSubmit((data) => {
            onSubmit({ ...data, numberOfDoctors: fields.length });
          })}
          className="space-y-8 pt-6"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target !== e.currentTarget) {
              // Prevent form submission when Enter is pressed on form elements
              // (except when explicitly targeting the form itself)
              e.preventDefault();
            }
          }}
        >
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
              <CalendarIcon className="w-4 h-4 text-primary shrink-0" /> {t('form.title')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">{t('form.description')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Date range — single calendar, spans 2 columns */}
            {(() => {
              const startDate = form.watch('startDate');
              const endDate = form.watch('endDate');
              const range: DateRange = { from: startDate, to: endDate };
              const hasRange = startDate || endDate;
              return (
                <div className="lg:col-span-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center h-7">{t('form.dateRange')}</Label>
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
              <Label htmlFor="minIntervalBetweenWorkDays" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 h-7">
                <Clock3Icon className="w-3.5 h-3.5 text-primary"/>
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
              <Label htmlFor="globalMonthlyShiftLimit" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center h-7">{t('form.globalMonthlyLimit')}</Label>
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
            <div className="md:col-span-2 lg:col-span-4">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 h-7">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                {t('form.holidays.label')}
              </Label>
              <Controller
                name="holidays"
                control={form.control}
                render={({ field }) => {
                  const pickerKey = 'form-holidays';
                  const selected = (field.value as Date[] | undefined) ?? [];
                  const selectedCount = selected.length;
                  return (
                    <Popover
                      open={openPopoverKey === pickerKey}
                      onOpenChange={(isOpen) => {
                        setOpenPopoverKey(isOpen ? pickerKey : null);
                        if (!isOpen) setAnchorDates((prev) => ({ ...prev, [pickerKey]: null }));
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          onPointerDown={(e) => e.stopPropagation()}
                          className={cn(
                            "w-full justify-start text-left font-normal mt-1",
                            selectedCount ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          {selectedCount
                            ? t('form.holidays.selected', { count: selectedCount })
                            : t('form.holidays.pick')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <div onPointerDown={(e) => e.stopPropagation()}>
                          <Calendar
                            mode="multiple"
                            selected={selected}
                            onSelect={(newDays, _dayClicked, _modifiers, event) => {
                              handleDateSelectionWithShiftSupport(
                                field.value as Date[] | undefined,
                                newDays,
                                _dayClicked,
                                event as unknown as React.MouseEvent,
                                field.onChange as unknown as (dates: Date[]) => void,
                                pickerKey,
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
                              IconRight: () => <ChevronRight className="h-4 w-4" />,
                            }}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">{t('form.holidays.help')}</p>
            </div>
          </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
              <DoctorsIcon className="w-4 h-4 text-primary shrink-0"/> {t('form.doctorDetails')}
              {fields.length > 0 && (
                <span className="ml-auto font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {fields.length}
                </span>
              )}
            </h3>
            {fields.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1 mb-4">{t('form.shiftClickTip')}</p>
            )}
            {fields.length === 0 && (
              <div className="mt-4 mb-1 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <DoctorsIcon className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground">{t('form.noDoctors.title')}</p>
                <p className="text-xs text-muted-foreground max-w-sm">{t('form.noDoctors.description')}</p>
              </div>
            )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={fields.map(field => field.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-5">
                    {fields.map((docField, index) => {
                      const accentColors = [
                        'border-l-blue-400 dark:border-l-blue-500',
                        'border-l-violet-400 dark:border-l-violet-500',
                        'border-l-emerald-400 dark:border-l-emerald-500',
                        'border-l-amber-400 dark:border-l-amber-500',
                        'border-l-rose-400 dark:border-l-rose-500',
                        'border-l-cyan-400 dark:border-l-cyan-500',
                        'border-l-orange-400 dark:border-l-orange-500',
                        'border-l-pink-400 dark:border-l-pink-500',
                      ];
                      const accent = accentColors[index % accentColors.length];
                      return (
                      <SortableDoctorItem key={docField.id} id={docField.id}>
                        <Card className={cn("relative overflow-hidden border border-border/70 shadow-sm border-l-[5px]", accent)}>
                  {/* Doctor card header strip */}
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/65">
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    <span className="font-mono text-xs font-bold text-muted-foreground/60 select-none tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 text-sm font-medium truncate text-foreground min-w-0">
                      {form.watch(`doctors.${index}.name`) || (
                        <span className="text-muted-foreground/50 font-normal">{t('form.doctorNamePlaceholder')}</span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => remove(index)}
                      className="shrink-0 h-7 w-7 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                <CardContent className="space-y-4 p-3 md:p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div>
                      <Label htmlFor={`doctors.${index}.name`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('form.doctorNameLabel')}</Label>
                      <Controller
                        name={`doctors.${index}.name`}
                        control={form.control}
                        render={({ field }) => (
                          <Input
                            {...field}
                            id={`doctors.${index}.name`}
                            placeholder={t('form.doctorNamePlaceholder')}
                            className="mt-1"
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
                  {unitsForSelect.length > 0 && (
                    <div>
                      <Label htmlFor={`doctors.${index}.unitId`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-primary"/>
                        {t('form.doctor.unit')}
                      </Label>
                      <Controller
                        name={`doctors.${index}.unitId`}
                        control={form.control}
                        render={({ field }) => {
                          const selectedUnit = unitsForSelect.find((u) => u.id === field.value);
                          const selectedMin = (selectedUnit as unknown as { minPostCallCoverage?: number } | undefined)?.minPostCallCoverage;
                          return (
                            <div className="mt-1 space-y-1">
                              <Select
                                value={field.value || '__none__'}
                                onValueChange={(v) => {
                                  field.onChange(v === '__none__' ? '' : v);
                                  // `form.watch(callback)` is not always notified
                                  // for field updates triggered by controlled
                                  // components, so we flush immediately so the
                                  // page recomputes the coverage dots/warnings
                                  // without waiting for the 300ms debounce.
                                  triggerValuesChange();
                                }}
                              >
                                <SelectTrigger
                                  id={`doctors.${index}.unitId`}
                                  className="w-full"
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  <SelectValue placeholder={t('form.doctor.noUnit')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">{t('form.doctor.noUnit')}</SelectItem>
                                  {unitsForSelect.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                      {u.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {selectedUnit && typeof selectedMin === 'number' && selectedMin > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                  {t('form.doctor.unitMinHint', { min: selectedMin })}
                                </p>
                              )}
                            </div>
                          );
                        }}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`doctors.${index}.vacationDates`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><VacationIcon className="w-3.5 h-3.5 text-emerald-500"/>{t('form.vacationDates')}</Label>
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
                                          <Button onPointerDown={(e) => e.stopPropagation()} variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50", controllerDateField.value?.length ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
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
                      <Label htmlFor={`doctors.${index}.preAssignedWorkDates`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><PreAssignedIcon className="w-3.5 h-3.5 text-amber-500"/>{t('form.preAssignedWorkDates')}</Label>
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
                                          <Button onPointerDown={(e) => e.stopPropagation()} variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 border-amber-200 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 dark:hover:bg-amber-950/50", controllerDateField.value?.length ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
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
                      <Label htmlFor={`doctors.${index}.excludedDates`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><CalendarXIcon className="w-3.5 h-3.5 text-muted-foreground"/>{t('form.excludedDates')}</Label>
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
                                          <Button onPointerDown={(e) => e.stopPropagation()} variant="outline" className={cn("w-full justify-start text-left font-normal mt-1 border border-dashed border-muted-foreground/30 bg-muted/50 hover:bg-muted/70 dark:border-muted-foreground/30 dark:bg-muted/50 dark:hover:bg-muted/70", controllerDateField.value?.length ? "text-foreground" : "text-muted-foreground")}>
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
              );
            })}
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
              className="mt-4 w-full border-dashed border-2 text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors h-11"
              onClick={() => append({ id: generateId(), name: '', vacationDates: [], preAssignedWorkDates: [], excludedDates: [], isExcludedFromAutomaticAssignment: false, unitId: '' })}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('form.addDoctor')}
            </Button>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
              <Building2 className="w-4 h-4 text-primary shrink-0"/> {t('form.units.title')}
              {unitFields.length > 0 && (
                <span className="ml-auto font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {unitFields.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">{t('form.units.description')}</p>
            {unitFields.length === 0 && (
              <div className="mt-1 mb-1 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Building2 className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground">{t('form.units.empty.title')}</p>
                <p className="text-xs text-muted-foreground max-w-sm">{t('form.units.empty.description')}</p>
              </div>
            )}
            <div className="space-y-3">
              {unitFields.map((unitField, unitIndex) => {
                const unitAccent = [
                  'border-l-blue-400',
                  'border-l-violet-400',
                  'border-l-emerald-400',
                  'border-l-amber-400',
                  'border-l-rose-400',
                  'border-l-cyan-400',
                ];
                const accent = unitAccent[unitIndex % unitAccent.length];
                return (
                  <Card key={unitField.id} className={cn("border border-border/70 shadow-sm border-l-[5px]", accent)}>
                    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/65">
                      <span className="font-mono text-xs font-bold text-muted-foreground/60 select-none tabular-nums shrink-0">
                        {String(unitIndex + 1).padStart(2, '0')}
                      </span>
                      <span className="flex-1 text-sm font-medium truncate text-foreground min-w-0">
                        {form.watch(`units.${unitIndex}.name`) || (
                          <span className="text-muted-foreground/50 font-normal">{t('form.units.name')}</span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          removeUnit(unitIndex);
                          triggerValuesChange();
                        }}
                        className="shrink-0 h-7 w-7 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <CardContent className="space-y-3 p-3 md:p-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                          <Label htmlFor={`units.${unitIndex}.name`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('form.units.name')}</Label>
                          <Controller
                            name={`units.${unitIndex}.name`}
                            control={form.control}
                            render={({ field }) => (
                              <Input
                                {...field}
                                id={`units.${unitIndex}.name`}
                                placeholder={t('form.units.namePlaceholder')}
                                className="mt-1"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }
                                }}
                              />
                            )}
                          />
                          {form.formState.errors.units?.[unitIndex]?.name && <p className="text-sm text-destructive mt-1">{form.formState.errors.units[unitIndex]?.name?.message}</p>}
                        </div>
                        <div>
                          <Label htmlFor={`units.${unitIndex}.minPostCallCoverage`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('form.units.minPostCallCoverage')}</Label>
                          <Controller
                            name={`units.${unitIndex}.minPostCallCoverage`}
                            control={form.control}
                            render={({ field }) => (
                              <Input
                                id={`units.${unitIndex}.minPostCallCoverage`}
                                type="number"
                                min="0" max="20"
                                value={field.value ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  field.onChange(isNaN(val) ? 0 : val);
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
                          <p className="text-[11px] text-muted-foreground mt-1">{t('form.units.minPostCallCoverageHelp')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {(form.formState.errors.units && typeof form.formState.errors.units.message === 'string') && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.units.message}</p>
            )}
            {form.formState.errors.units?.root && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.units.root.message}</p>
            )}

            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full border-dashed border-2 text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors h-11"
              onClick={() => {
                appendUnit({ id: generateId(), name: '', minPostCallCoverage: 1 });
                triggerValuesChange();
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('form.units.add')}
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
