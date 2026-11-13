import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { Controller, useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Building2, Flag, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, Clock3Icon, DoctorsIcon } from '@/components/icons';
import type { ScheduleFormValues, Unit } from '@/lib/types';
import { scheduleFormSchema } from '@/lib/schedule-form-schema';
import { cn, generateId } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DoctorCard } from './form/doctor-card';
import { FieldError } from './form/field-error';
import { FIELD_LABEL } from './form/styles';
import { HolidayTools } from './form/holiday-tools';
import { MultiDatePicker } from './form/multi-date-picker';
import { UnitCard } from './form/unit-card';

interface DataInputFormProps {
  /** Values the form starts with. Re-mount (new `key`) to load other values. */
  initialValues?: Partial<ScheduleFormValues>;
  /** Called with the full form values after every change. */
  onValuesChange?: (values: ScheduleFormValues) => void;
}

function toDefaultValues(initial?: Partial<ScheduleFormValues>): Partial<ScheduleFormValues> {
  return {
    numberOfDoctors: initial?.doctors?.length ?? 0,
    startDate: initial?.startDate,
    endDate: initial?.endDate,
    minIntervalBetweenWorkDays: initial?.minIntervalBetweenWorkDays ?? 1,
    globalMonthlyShiftLimit: initial?.globalMonthlyShiftLimit,
    enforceMonthlyLimit: initial?.enforceMonthlyLimit ?? false,
    doctors: (initial?.doctors ?? []).map((doc) => ({
      id: doc.id || generateId(),
      name: doc.name ?? '',
      freeDates: doc.freeDates ?? [],
      preAssignedWorkDates: doc.preAssignedWorkDates ?? [],
      excludedDates: doc.excludedDates ?? [],
      isExcludedFromAutomaticAssignment: doc.isExcludedFromAutomaticAssignment ?? false,
      unitId: doc.unitId ?? '',
      coverAssignments: doc.coverAssignments ?? [],
    })),
    units: (initial?.units ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      minPostCallCoverage: u.minPostCallCoverage,
      alliedUnitIds: u.alliedUnitIds ?? [],
    })),
    holidays: initial?.holidays ?? [],
  };
}

function SectionTitle({ icon, children, count }: { icon: React.ReactNode; children: React.ReactNode; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
      {icon}
      {children}
      {count !== undefined && count > 0 && (
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{count}</span>
      )}
    </h2>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="my-1 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

const ADD_BUTTON_CLASS =
  'mt-4 h-11 w-full border-2 border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground';

const DataInputForm = forwardRef<UseFormReturn<ScheduleFormValues>, DataInputFormProps>(
  ({ initialValues, onValuesChange }, ref) => {
    const { t, currentDateFnsLocale } = useLanguage();
    const twoMonths = useMediaQuery('(min-width: 768px)');

    const form = useForm<ScheduleFormValues>({
      resolver: zodResolver(scheduleFormSchema),
      defaultValues: toDefaultValues(initialValues),
    });
    const { control } = form;
    useImperativeHandle(ref, () => form, [form]);

    const doctorsArray = useFieldArray({ control, name: 'doctors' });
    const unitsArray = useFieldArray({ control, name: 'units' });

    const [startDate, endDate, monthlyLimit] = useWatch({
      control,
      name: ['startDate', 'endDate', 'globalMonthlyShiftLimit'],
    });
    const units = (useWatch({ control, name: 'units' }) ?? []) as Unit[];
    const errors = form.formState.errors;

    // Report every change to the page, which derives the calendar, the
    // warnings and the saved file from these values.
    // react-hook-form mutates its value object in place while the user types,
    // so the page gets a snapshot: derived data (memoised on identity) and
    // undo history must never share references with the live form.
    const notify = useCallback(() => {
      onValuesChange?.(structuredClone(form.getValues()));
    }, [onValuesChange, form]);

    useEffect(() => {
      const subscription = form.watch(() => notify());
      return () => subscription.unsubscribe();
    }, [form, notify]);

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const from = doctorsArray.fields.findIndex((f) => f.id === active.id);
      const to = doctorsArray.fields.findIndex((f) => f.id === over.id);
      if (from === -1 || to === -1) return;
      doctorsArray.move(from, to);
      notify();
    };

    const addDoctor = () => {
      doctorsArray.append({
        id: generateId(),
        name: '',
        freeDates: [],
        preAssignedWorkDates: [],
        excludedDates: [],
        isExcludedFromAutomaticAssignment: false,
        unitId: '',
        coverAssignments: [],
      });
      notify();
    };

    const removeUnit = (index: number) => {
      const current = (form.getValues('units') ?? []) as Unit[];
      const removedId = current[index]?.id;
      if (removedId) {
        // Drop every reference to the unit before removing it.
        current.forEach((u, i) => {
          if (i !== index && u.alliedUnitIds?.includes(removedId)) {
            form.setValue(`units.${i}.alliedUnitIds`, u.alliedUnitIds.filter((id) => id !== removedId));
          }
        });
        (form.getValues('doctors') ?? []).forEach((doc, i) => {
          if (doc.unitId === removedId) form.setValue(`doctors.${i}.unitId`, '');
          if (doc.coverAssignments?.some((a) => a.targetUnitId === removedId)) {
            form.setValue(
              `doctors.${i}.coverAssignments`,
              doc.coverAssignments.filter((a) => a.targetUnitId !== removedId),
            );
          }
        });
      }
      unitsArray.remove(index);
      notify();
    };

    const toggleAlly = (unitIndex: number, otherId: string, allied: boolean) => {
      const current = (form.getValues('units') ?? []) as Unit[];
      const thisId = current[unitIndex]?.id;
      if (!thisId) return;
      const withLink = (u: Unit, id: string): Unit => {
        const set = new Set(u.alliedUnitIds ?? []);
        if (allied) set.add(id);
        else set.delete(id);
        return { ...u, alliedUnitIds: [...set] };
      };
      form.setValue(
        'units',
        current.map((u) => (u.id === thisId ? withLink(u, otherId) : u.id === otherId ? withLink(u, thisId) : u)),
        { shouldDirty: true },
      );
      notify();
    };

    const hasRange = Boolean(startDate || endDate);
    const formatDay = (d?: Date) => (d ? format(d, 'PP', { locale: currentDateFnsLocale }) : '…');

    return (
      <Card className="shadow-sm">
        <CardContent>
          <form
            id="schedule-form"
            noValidate
            className="space-y-8 pt-6"
            onSubmit={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              // Enter in a text field must not submit; generation has its own button.
              if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
            }}
          >
            <section aria-labelledby="form-params-title">
              <div id="form-params-title">
                <SectionTitle icon={<CalendarIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}>
                  {t('form.title')}
                </SectionTitle>
              </div>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">{t('form.description')}</p>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <Label htmlFor="schedule-period" className={cn(FIELD_LABEL, 'flex h-7 items-center')}>
                    {t('form.dateRange')}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="schedule-period"
                        type="button"
                        variant="outline"
                        aria-invalid={Boolean(errors.startDate || errors.endDate)}
                        className={cn('mt-1 w-full justify-start text-left font-normal', !hasRange && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                        {hasRange ? `${formatDay(startDate)} → ${formatDay(endDate)}` : t('form.pickDateRange')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="range"
                        selected={{ from: startDate, to: endDate } as DateRange}
                        onSelect={(r: DateRange | undefined) => {
                          form.setValue('startDate', r?.from as Date, { shouldValidate: true, shouldDirty: true });
                          form.setValue('endDate', r?.to as Date, { shouldValidate: true, shouldDirty: true });
                        }}
                        locale={currentDateFnsLocale}
                        defaultMonth={startDate}
                        numberOfMonths={twoMonths ? 2 : 1}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FieldError message={errors.startDate?.message ?? errors.endDate?.message} />
                </div>

                <div>
                  <Label htmlFor="minIntervalBetweenWorkDays" className={cn(FIELD_LABEL, 'flex h-7 items-center gap-1.5')}>
                    <Clock3Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {t('form.minInterval')}
                  </Label>
                  <Controller
                    name="minIntervalBetweenWorkDays"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="minIntervalBetweenWorkDays"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={30}
                        value={field.value ?? 1}
                        onBlur={field.onBlur}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          field.onChange(Number.isNaN(val) ? 0 : val);
                        }}
                        aria-describedby="minInterval-help"
                        className="mt-1"
                      />
                    )}
                  />
                  <p id="minInterval-help" className="mt-1 text-[11px] text-muted-foreground">
                    {t('form.minIntervalHelp')}
                  </p>
                  <FieldError message={errors.minIntervalBetweenWorkDays?.message} />
                </div>

                <div>
                  <Label htmlFor="globalMonthlyShiftLimit" className={cn(FIELD_LABEL, 'flex h-7 items-center')}>
                    {t('form.globalMonthlyLimit')}
                  </Label>
                  <Controller
                    name="globalMonthlyShiftLimit"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="globalMonthlyShiftLimit"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={31}
                        value={field.value ?? ''}
                        onBlur={field.onBlur}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          field.onChange(Number.isNaN(val) ? undefined : val);
                        }}
                        placeholder={t('form.globalMonthlyLimitPlaceholder')}
                        className="mt-1"
                      />
                    )}
                  />
                  <Controller
                    name="enforceMonthlyLimit"
                    control={control}
                    render={({ field }) => (
                      <div className="mt-2 flex items-start gap-2">
                        <Checkbox
                          id="enforceMonthlyLimit"
                          checked={Boolean(field.value)}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          disabled={!monthlyLimit}
                          aria-describedby="enforceMonthlyLimit-help"
                          className="mt-0.5 bg-background"
                        />
                        <div>
                          <Label htmlFor="enforceMonthlyLimit" className="text-xs font-medium">
                            {t('form.enforceMonthlyLimit')}
                          </Label>
                          <p id="enforceMonthlyLimit-help" className="text-[11px] text-muted-foreground">
                            {t('form.enforceMonthlyLimitHelp')}
                          </p>
                        </div>
                      </div>
                    )}
                  />
                  <FieldError message={errors.globalMonthlyShiftLimit?.message} />
                </div>

                <div className="md:col-span-2 lg:col-span-4">
                  <Label htmlFor="form-holidays" className={cn(FIELD_LABEL, 'flex h-7 items-center gap-1.5')}>
                    <Flag className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {t('form.holidays.label')}
                  </Label>
                  <Controller
                    name="holidays"
                    control={control}
                    render={({ field }) => (
                      <>
                        <MultiDatePicker
                          id="form-holidays"
                          value={field.value}
                          onChange={field.onChange}
                          min={startDate}
                          max={endDate}
                          emptyLabel={t('form.holidays.pick')}
                          selectedLabel={(count) => t('form.holidays.selected', { count })}
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">{t('form.holidays.help')}</p>
                        <HolidayTools
                          value={field.value}
                          onChange={field.onChange}
                          startDate={startDate}
                          endDate={endDate}
                        />
                      </>
                    )}
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section aria-labelledby="form-doctors-title">
              <div id="form-doctors-title">
                <SectionTitle
                  icon={<DoctorsIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  count={doctorsArray.fields.length}
                >
                  {t('form.doctorDetails')}
                </SectionTitle>
              </div>
              {doctorsArray.fields.length > 0 ? (
                <p className="mb-4 mt-1 text-xs text-muted-foreground">{t('form.shiftClickTip')}</p>
              ) : (
                <div className="mt-4">
                  <EmptyState
                    icon={<DoctorsIcon className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
                    title={t('form.noDoctors.title')}
                    description={t('form.noDoctors.description')}
                  />
                </div>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={doctorsArray.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-5">
                    {doctorsArray.fields.map((field, index) => (
                      <DoctorCard
                        key={field.id}
                        fieldId={field.id}
                        index={index}
                        control={control}
                        units={units}
                        startDate={startDate}
                        endDate={endDate}
                        onChanged={notify}
                        onRemove={() => {
                          doctorsArray.remove(index);
                          notify();
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <FieldError message={errors.doctors?.message ?? errors.doctors?.root?.message} />
              <Button type="button" variant="outline" className={ADD_BUTTON_CLASS} onClick={addDoctor}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('form.addDoctor')}
              </Button>
            </section>

            <Separator />

            <section aria-labelledby="form-units-title">
              <div id="form-units-title">
                <SectionTitle
                  icon={<Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  count={unitsArray.fields.length}
                >
                  {t('form.units.title')}
                </SectionTitle>
              </div>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">{t('form.units.description')}</p>
              {unitsArray.fields.length === 0 && (
                <EmptyState
                  icon={<Building2 className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
                  title={t('form.units.empty.title')}
                  description={t('form.units.empty.description')}
                />
              )}
              <div className="space-y-3">
                {unitsArray.fields.map((field, index) => (
                  <UnitCard
                    key={field.id}
                    index={index}
                    control={control}
                    units={units}
                    onRemove={() => removeUnit(index)}
                    onToggleAlly={(otherId, allied) => toggleAlly(index, otherId, allied)}
                  />
                ))}
              </div>
              <FieldError message={errors.units?.message ?? errors.units?.root?.message} />
              <Button
                type="button"
                variant="outline"
                className={ADD_BUTTON_CLASS}
                onClick={() => {
                  unitsArray.append({ id: generateId(), name: '', minPostCallCoverage: 1, alliedUnitIds: [] });
                  notify();
                }}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('form.units.add')}
              </Button>
            </section>
          </form>
        </CardContent>
      </Card>
    );
  },
);

DataInputForm.displayName = 'DataInputForm';

export default DataInputForm;
