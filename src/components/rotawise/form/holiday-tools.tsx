import { useState } from 'react';
import { format } from 'date-fns';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/language-context';
import {
  HOLIDAY_CITIES,
  HolidayImportError,
  fetchOfficialHolidays,
  mergeHolidayDates,
} from '@/lib/holiday-import';
import { cn } from '@/lib/utils';

interface HolidayToolsProps {
  value: Date[] | undefined;
  onChange: (dates: Date[]) => void;
  startDate?: Date;
  endDate?: Date;
}

type Status = { tone: 'info' | 'error'; text: string } | null;

// Only one city is available for now; a selector goes here when there are more.
const CITY = HOLIDAY_CITIES[0];

/**
 * Everything below the holiday picker: the on-demand import of official
 * holidays and the list of selected days, each removable. Imported days are
 * ordinary holidays afterwards — they can be removed here or edited in the
 * picker like any other.
 */
export function HolidayTools({ value, onChange, startDate, endDate }: HolidayToolsProps) {
  const { t, currentDateFnsLocale } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const selected = [...(value ?? [])].sort((a, b) => a.getTime() - b.getTime());
  const hasPeriod = Boolean(startDate && endDate && startDate <= endDate);

  const runImport = async () => {
    if (!startDate || !endDate || loading) return;
    setLoading(true);
    setStatus(null);
    try {
      const result = await fetchOfficialHolidays(CITY, startDate, endDate);
      const { dates, added } = mergeHolidayDates(
        value ?? [],
        result.holidays.map((h) => h.date),
      );
      if (added > 0) onChange(dates);

      const parts: string[] = [];
      if (result.holidays.length === 0 && result.missingYears.length === 0) {
        parts.push(t('form.holidays.import.none'));
      } else if (result.holidays.length > 0) {
        parts.push(t('form.holidays.import.added', { added, existing: result.holidays.length - added }));
      }
      if (result.missingYears.length > 0) {
        parts.push(t('form.holidays.import.missingYears', { years: result.missingYears.join(', ') }));
      }
      setStatus({ tone: result.missingYears.length > 0 ? 'error' : 'info', text: parts.join(' ') });
    } catch (err) {
      const invalid = err instanceof HolidayImportError && err.code === 'invalidData';
      setStatus({
        tone: 'error',
        text: t(invalid ? 'form.holidays.import.invalid' : 'form.holidays.import.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('form.holidays.list')}>
          {selected.map((date) => {
            const label = format(date, 'EEE d MMM yyyy', { locale: currentDateFnsLocale });
            return (
              <li
                key={date.getTime()}
                className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-2 pr-0.5 text-xs"
              >
                <span className="tabular-nums">{label}</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('form.holidays.remove', { date: label })}
                  title={t('form.holidays.remove', { date: label })}
                  onClick={() => onChange(selected.filter((d) => d.getTime() !== date.getTime()))}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void runImport()}
          disabled={!hasPeriod || loading}
          aria-busy={loading}
        >
          {loading ? (
            <span
              className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-b-2 border-t-2 border-primary"
              aria-hidden="true"
            />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          {t('form.holidays.import', { city: CITY.name })}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {hasPeriod ? t('form.holidays.import.source', { source: CITY.sourceName }) : t('form.holidays.import.needPeriod')}
        </span>
      </div>

      <p
        role="status"
        className={cn('text-xs', status?.tone === 'error' ? 'text-destructive' : 'text-muted-foreground', !status && 'sr-only')}
      >
        {status?.text}
      </p>
    </div>
  );
}
