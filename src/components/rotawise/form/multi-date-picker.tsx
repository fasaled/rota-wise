import { useState } from 'react';
import { eachDayOfInterval, isAfter, isBefore, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';

const TONE_CLASS = {
  neutral: '',
  free: 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50',
  preassigned:
    'border-amber-200 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 dark:hover:bg-amber-950/50',
  excluded: 'border-dashed border-muted-foreground/30 bg-muted/50 hover:bg-muted/70',
} as const;

const TONE_SELECTED_CLASS = {
  neutral: 'text-foreground',
  free: 'text-emerald-700 dark:text-emerald-400',
  preassigned: 'text-amber-700 dark:text-amber-400',
  excluded: 'text-foreground',
} as const;

interface MultiDatePickerProps {
  id?: string;
  value: Date[] | undefined;
  onChange: (dates: Date[]) => void;
  /** Selectable period (inclusive). */
  min?: Date;
  max?: Date;
  tone?: keyof typeof TONE_CLASS;
  emptyLabel: string;
  selectedLabel: (count: number) => string;
}

/** Pick any number of days. Shift+click extends from the last clicked day. */
export function MultiDatePicker({
  id,
  value,
  onChange,
  min,
  max,
  tone = 'neutral',
  emptyLabel,
  selectedLabel,
}: MultiDatePickerProps) {
  const { currentDateFnsLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Date | null>(null);
  const selected = value ?? [];

  const outOfRange = (date: Date) =>
    (min !== undefined && isBefore(date, startOfDay(min))) || (max !== undefined && isAfter(date, startOfDay(max)));

  const handleSelect = (next: Date[] | undefined, clicked: Date, shiftKey: boolean) => {
    if (shiftKey && anchor) {
      const [start, end] = anchor <= clicked ? [anchor, clicked] : [clicked, anchor];
      const byTime = new Map(selected.map((d) => [startOfDay(d).getTime(), startOfDay(d)]));
      for (const day of eachDayOfInterval({ start, end })) {
        if (!outOfRange(day)) byTime.set(day.getTime(), day);
      }
      onChange([...byTime.values()].sort((a, b) => a.getTime() - b.getTime()));
    } else {
      onChange(next ?? []);
    }
    setAnchor(clicked);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setAnchor(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            'mt-1 w-full justify-start text-left font-normal',
            TONE_CLASS[tone],
            selected.length ? TONE_SELECTED_CLASS[tone] : 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          {selected.length ? selectedLabel(selected.length) : emptyLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="multiple"
          selected={selected}
          onSelect={(days, day, _modifiers, event) => handleSelect(days, day, event.shiftKey)}
          locale={currentDateFnsLocale}
          disabled={outOfRange}
          defaultMonth={selected[0] ?? min}
          fromDate={min}
          toDate={max}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
