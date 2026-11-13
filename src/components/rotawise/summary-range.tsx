import { endOfDay, format, isAfter, isBefore, startOfDay } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Schedule } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';
import type { SummaryRange } from './use-summary-range';

export function SummaryRangeFilter({ schedule, range }: { schedule: Schedule; range: SummaryRange }) {
  const { t, currentDateFnsLocale } = useLanguage();
  const { selection } = range;
  const fmt = (d: Date) => format(d, 'PP', { locale: currentDateFnsLocale });

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={t('summary.filter.pickRange')}
            className={cn('font-normal', range.isFiltered && 'border-primary/40 bg-primary/5 text-foreground')}
          >
            <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            {selection?.from ? `${fmt(selection.from)} → ${selection.to ? fmt(selection.to) : '…'}` : t('summary.filter.pickRange')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="range"
            selected={selection}
            onSelect={range.setSelection}
            locale={currentDateFnsLocale}
            defaultMonth={selection?.from ?? schedule.startDate}
            disabled={(date) =>
              isBefore(date, startOfDay(schedule.startDate)) || isAfter(date, endOfDay(schedule.endDate))
            }
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {range.isFiltered && (
        <Button variant="ghost" size="sm" onClick={range.reset}>
          <X className="mr-1 h-3 w-3" aria-hidden="true" /> {t('summary.filter.reset')}
        </Button>
      )}
    </div>
  );
}
