import { Controller, useFormState, useWatch, type Control } from 'react-hook-form';
import { Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ScheduleFormValues, Unit } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';
import { FieldError } from './field-error';
import { ACCENT_BORDERS, FIELD_LABEL } from './styles';

interface UnitCardProps {
  index: number;
  control: Control<ScheduleFormValues>;
  /** Every unit, as currently typed in the form. */
  units: Unit[];
  onRemove: () => void;
  /** Link or unlink this unit and `otherId` (alliances are symmetric). */
  onToggleAlly: (otherId: string, allied: boolean) => void;
}

export function UnitCard({ index, control, units, onRemove, onToggleAlly }: UnitCardProps) {
  const { t } = useLanguage();
  const base = `units.${index}` as const;
  const unit = useWatch({ control, name: base }) as Unit | undefined;
  const { errors } = useFormState({ control, name: base });
  const unitErrors = errors.units?.[index];
  const displayName = unit?.name?.trim() || t('form.units.num', { index: index + 1 });
  const others = units.filter((u) => u.id !== unit?.id);

  return (
    <Card
      role="group"
      aria-label={displayName}
      className={cn('border border-l-[5px] border-border/70 shadow-sm', ACCENT_BORDERS[index % ACCENT_BORDERS.length])}
    >
      <div className="flex items-center gap-3 border-b border-border bg-muted/65 px-4 py-1.5">
        <span className="shrink-0 select-none font-mono text-xs font-bold tabular-nums text-muted-foreground" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {unit?.name?.trim() || <span className="font-normal text-muted-foreground">{t('form.units.name')}</span>}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={t('form.units.remove', { name: displayName })}
          title={t('form.units.remove', { name: displayName })}
          className="h-7 w-7 shrink-0 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      <CardContent className="space-y-3 p-3 md:p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label htmlFor={`${base}.name`} className={FIELD_LABEL}>
              {t('form.units.name')}
            </Label>
            <Controller
              name={`${base}.name`}
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id={`${base}.name`}
                  autoComplete="off"
                  placeholder={t('form.units.namePlaceholder')}
                  aria-invalid={Boolean(unitErrors?.name)}
                  className="mt-1"
                />
              )}
            />
            <FieldError message={unitErrors?.name?.message} />
          </div>
          <div>
            <Label htmlFor={`${base}.minPostCallCoverage`} className={FIELD_LABEL}>
              {t('form.units.minPostCallCoverage')}
            </Label>
            <Controller
              name={`${base}.minPostCallCoverage`}
              control={control}
              render={({ field }) => (
                <Input
                  id={`${base}.minPostCallCoverage`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={20}
                  value={field.value ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    field.onChange(Number.isNaN(val) ? 0 : val);
                  }}
                  aria-describedby={`${base}.minPostCallCoverage-help`}
                  className="mt-1"
                />
              )}
            />
            <p id={`${base}.minPostCallCoverage-help`} className="mt-1 text-[11px] text-muted-foreground">
              {t('form.units.minPostCallCoverageHelp')}
            </p>
            <FieldError message={unitErrors?.minPostCallCoverage?.message} />
          </div>
        </div>

        {others.length > 0 ? (
          <fieldset>
            <legend className={cn(FIELD_LABEL, 'flex items-center gap-1.5')}>
              <Link2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {t('form.units.alliedUnits')}
            </legend>
            <p className="mb-2 mt-1 text-[11px] text-muted-foreground">{t('form.units.alliedUnitsHelp')}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {others.map((other) => (
                <label key={other.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={(unit?.alliedUnitIds ?? []).includes(other.id)}
                    onCheckedChange={(checked) => onToggleAlly(other.id, checked === true)}
                  />
                  <span>{other.name || t('form.units.name')}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t('form.units.alliedUnitsEmpty')}</p>
        )}
      </CardContent>
    </Card>
  );
}
