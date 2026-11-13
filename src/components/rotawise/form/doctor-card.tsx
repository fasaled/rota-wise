import { Controller, useFormState, useWatch, type Control } from 'react-hook-form';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Building2, GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarXIcon, FreeDayIcon, PreAssignedIcon } from '@/components/icons';
import type { ScheduleFormValues, Unit } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';
import { CoverAssignmentsEditor } from './cover-assignments-editor';
import { FieldError } from './field-error';
import { ACCENT_BORDERS, FIELD_LABEL } from './styles';
import { MultiDatePicker } from './multi-date-picker';

const NO_UNIT = '__none__';

interface DoctorCardProps {
  /** Field-array id: stable across reorders. */
  fieldId: string;
  index: number;
  control: Control<ScheduleFormValues>;
  units: Unit[];
  startDate?: Date;
  endDate?: Date;
  onRemove: () => void;
  onChanged: () => void;
}

export function DoctorCard({ fieldId, index, control, units, startDate, endDate, onRemove, onChanged }: DoctorCardProps) {
  const { t } = useLanguage();
  const base = `doctors.${index}` as const;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: fieldId,
  });
  const name = useWatch({ control, name: `${base}.name` });
  const unitId = useWatch({ control, name: `${base}.unitId` });
  const { errors } = useFormState({ control, name: base });
  const nameError = errors.doctors?.[index]?.name?.message;
  const position = String(index + 1).padStart(2, '0');
  const displayName = name?.trim() || t('form.doctorNum', { index: index + 1 });
  const selectedUnit = units.find((u) => u.id === unitId);
  const datesSelected = (count: number) => t('form.datesSelected', { count });

  const dateField = (
    field: 'freeDates' | 'preAssignedWorkDates' | 'excludedDates',
    label: string,
    tone: 'free' | 'preassigned' | 'excluded',
    icon: React.ReactNode,
  ) => (
    <div>
      <Label htmlFor={`${base}.${field}`} className={cn(FIELD_LABEL, 'flex items-center gap-1.5')}>
        {icon}
        {label}
      </Label>
      <Controller
        name={`${base}.${field}`}
        control={control}
        render={({ field: f }) => (
          <MultiDatePicker
            id={`${base}.${field}`}
            value={f.value}
            onChange={f.onChange}
            min={startDate}
            max={endDate}
            tone={tone}
            emptyLabel={t('form.selectDates')}
            selectedLabel={datesSelected}
          />
        )}
      />
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={cn('relative', isDragging && 'opacity-60')}
    >
      <Card
        role="group"
        aria-label={displayName}
        className={cn(
          'overflow-hidden border border-l-[5px] border-border/70 shadow-sm',
          ACCENT_BORDERS[index % ACCENT_BORDERS.length],
        )}
      >
        <div className="flex items-center gap-2 border-b border-border bg-muted/65 px-2 py-1.5 sm:px-3">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t('form.doctor.reorder', { name: displayName })}
            title={t('form.doctor.reorderHint')}
            className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="select-none font-mono text-xs font-bold tabular-nums text-muted-foreground" aria-hidden="true">
            {position}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {name?.trim() || <span className="font-normal text-muted-foreground">{t('form.doctorNamePlaceholder')}</span>}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={t('form.doctor.remove', { name: displayName })}
            title={t('form.doctor.remove', { name: displayName })}
            className="h-7 w-7 shrink-0 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>

        <CardContent className="space-y-4 p-3 md:p-4">
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor={`${base}.name`} className={FIELD_LABEL}>
                {t('form.doctorNameLabel')}
              </Label>
              <Controller
                name={`${base}.name`}
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id={`${base}.name`}
                    autoComplete="off"
                    placeholder={t('form.doctorNamePlaceholder')}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? `${base}.name-error` : undefined}
                    className="mt-1"
                  />
                )}
              />
              <FieldError id={`${base}.name-error`} message={nameError} />
            </div>
            <Controller
              name={`${base}.isExcludedFromAutomaticAssignment`}
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-2 md:mt-5">
                  <Checkbox
                    id={`${base}.isExcludedFromAutomaticAssignment`}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    className="bg-background"
                  />
                  <Label htmlFor={`${base}.isExcludedFromAutomaticAssignment`} className="text-sm font-medium">
                    {t('form.excludeFromAutoAssignment')}
                  </Label>
                </div>
              )}
            />
          </div>

          {units.length > 0 && (
            <div>
              <Label htmlFor={`${base}.unitId`} className={cn(FIELD_LABEL, 'flex items-center gap-1.5')}>
                <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {t('form.doctor.unit')}
              </Label>
              <Controller
                name={`${base}.unitId`}
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || NO_UNIT}
                    onValueChange={(v) => {
                      field.onChange(v === NO_UNIT ? '' : v);
                      onChanged();
                    }}
                  >
                    <SelectTrigger id={`${base}.unitId`} className="mt-1 w-full">
                      <SelectValue placeholder={t('form.doctor.noUnit')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_UNIT}>{t('form.doctor.noUnit')}</SelectItem>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name || t('form.units.name')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {selectedUnit && selectedUnit.minPostCallCoverage > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('form.doctor.unitMinHint', { min: selectedUnit.minPostCallCoverage })}
                </p>
              )}
            </div>
          )}

          {units.length > 0 && (
            <CoverAssignmentsEditor
              doctorIndex={index}
              doctorUnitId={unitId}
              control={control}
              units={units}
              startDate={startDate}
              endDate={endDate}
              onChanged={onChanged}
            />
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {dateField(
              'freeDates',
              t('form.freeDates'),
              'free',
              <FreeDayIcon className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />,
            )}
            {dateField(
              'preAssignedWorkDates',
              t('form.preAssignedWorkDates'),
              'preassigned',
              <PreAssignedIcon className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />,
            )}
            {dateField(
              'excludedDates',
              t('form.excludedDates'),
              'excluded',
              <CalendarXIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />,
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
