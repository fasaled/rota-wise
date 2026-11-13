import { useState } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Controller, useFieldArray, useFormState, type Control } from 'react-hook-form';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon } from '@/components/icons';
import type { ScheduleFormValues, Unit } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';
import { FieldError } from './field-error';
import { FIELD_LABEL } from './styles';

interface CoverAssignmentsEditorProps {
  doctorIndex: number;
  doctorUnitId?: string;
  control: Control<ScheduleFormValues>;
  units: Unit[];
  startDate?: Date;
  endDate?: Date;
  onChanged: () => void;
}

/** Periods during which a doctor counts for another unit instead of their own. */
export function CoverAssignmentsEditor({
  doctorIndex,
  doctorUnitId,
  control,
  units,
  startDate,
  endDate,
  onChanged,
}: CoverAssignmentsEditorProps) {
  const { t, currentDateFnsLocale } = useLanguage();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const name = `doctors.${doctorIndex}.coverAssignments` as const;
  const { fields, append, remove } = useFieldArray({ control, name });
  const { errors } = useFormState({ control, name });
  const destinationUnits = units.filter((u) => u.id && u.id !== doctorUnitId);

  if (destinationUnits.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className={`${FIELD_LABEL} flex items-center gap-1.5`}>
        <Link2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {t('form.doctor.coverAssignments')}
      </p>
      <p className="text-[11px] text-muted-foreground">{t('form.doctor.coverAssignmentsHelp')}</p>
      <div className="space-y-2">
        {fields.map((field, row) => {
          const targetId = `${name}.${row}.targetUnitId`;
          const datesId = `${name}.${row}.dates`;
          return (
            <div
              key={field.id}
              className="grid grid-cols-1 items-end gap-2 rounded-md border border-border/70 p-2 md:grid-cols-[1fr_1fr_auto]"
            >
              <div>
                <Label htmlFor={targetId} className="text-[11px] text-muted-foreground">
                  {t('form.doctor.coverAssignments.target')}
                </Label>
                <Controller
                  name={`${name}.${row}.targetUnitId`}
                  control={control}
                  render={({ field: target }) => (
                    <Select
                      value={target.value || ''}
                      onValueChange={(v) => {
                        target.onChange(v);
                        onChanged();
                      }}
                    >
                      <SelectTrigger id={targetId} className="mt-1">
                        <SelectValue placeholder={t('form.doctor.coverAssignments.target')} />
                      </SelectTrigger>
                      <SelectContent>
                        {destinationUnits.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name || t('form.units.name')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label htmlFor={datesId} className="text-[11px] text-muted-foreground">
                  {t('form.doctor.coverAssignments.dates')}
                </Label>
                <Controller
                  name={`${name}.${row}.startDate`}
                  control={control}
                  render={({ field: start }) => (
                    <Controller
                      name={`${name}.${row}.endDate`}
                      control={control}
                      render={({ field: end }) => (
                        <Popover open={openRow === field.id} onOpenChange={(o) => setOpenRow(o ? field.id : null)}>
                          <PopoverTrigger asChild>
                            <Button
                              id={datesId}
                              type="button"
                              variant="outline"
                              className="mt-1 w-full justify-start text-left font-normal"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                              {start.value && end.value
                                ? t('form.doctor.coverAssignments.dateRange', {
                                    start: format(start.value, 'P', { locale: currentDateFnsLocale }),
                                    end: format(end.value, 'P', { locale: currentDateFnsLocale }),
                                  })
                                : t('form.doctor.coverAssignments.pickDates')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="range"
                              selected={{ from: start.value, to: end.value }}
                              onSelect={(range: DateRange | undefined) => {
                                if (range?.from) start.onChange(range.from);
                                const to = range?.to ?? range?.from;
                                if (to) end.onChange(to);
                                onChanged();
                              }}
                              locale={currentDateFnsLocale}
                              defaultMonth={start.value ?? startDate}
                              fromDate={startDate}
                              toDate={endDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    />
                  )}
                />
                <FieldError message={errors.doctors?.[doctorIndex]?.coverAssignments?.[row]?.endDate?.message} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('form.doctor.coverAssignments.remove')}
                title={t('form.doctor.coverAssignments.remove')}
                className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  remove(row);
                  onChanged();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-dashed"
        onClick={() => {
          const day = startDate ?? new Date();
          append({ id: generateId(), targetUnitId: destinationUnits[0]?.id ?? '', startDate: day, endDate: day });
          onChanged();
        }}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {t('form.doctor.coverAssignments.add')}
      </Button>
    </div>
  );
}
