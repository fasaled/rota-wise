import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PickerItem {
  id: string;
  label: string;
  /** Short reason shown on the right, e.g. why the option is disabled. */
  hint?: string;
  disabled?: boolean;
  selected?: boolean;
}

interface PickerListProps {
  /** Accessible name of the list. */
  label: string;
  items: PickerItem[];
  onPick: (id: string) => void;
  searchPlaceholder: string;
  emptyText: string;
  /** Several options can be selected; picking toggles them. */
  multiple?: boolean;
  /** Extra action rendered above the options. */
  header?: ReactNode;
}

/**
 * Searchable listbox used inside the calendar popovers. The search field
 * keeps the focus; arrow keys move the active option and Enter picks it.
 */
export function PickerList({
  label,
  items,
  onPick,
  searchPlaceholder,
  emptyText,
  multiple = false,
  header,
}: PickerListProps) {
  const baseId = useId();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const enabled = useMemo(() => filtered.filter((item) => !item.disabled), [filtered]);
  const active = enabled.find((item) => item.id === activeId) ?? enabled[0] ?? null;
  const optionId = (id: string) => `${baseId}-${id}`;

  useEffect(() => {
    if (active) document.getElementById(`${baseId}-${active.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, baseId]);

  const move = (delta: number) => {
    if (enabled.length === 0) return;
    const index = active ? enabled.indexOf(active) : -1;
    setActiveId(enabled[(index + delta + enabled.length) % enabled.length].id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        if (enabled.length) {
          e.preventDefault();
          setActiveId(enabled[0].id);
        }
        break;
      case 'End':
        if (enabled.length) {
          e.preventDefault();
          setActiveId(enabled[enabled.length - 1].id);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (active) onPick(active.id);
        break;
    }
  };

  return (
    <div className="text-popover-foreground">
      <div className="px-2 py-1.5 border-b">
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={`${baseId}-list`}
          aria-activedescendant={active ? optionId(active.id) : undefined}
          aria-label={searchPlaceholder}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveId(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {header}
      <ul
        id={`${baseId}-list`}
        role="listbox"
        aria-label={label}
        aria-multiselectable={multiple || undefined}
        className="max-h-64 overflow-y-auto py-1"
      >
        {filtered.length === 0 && (
          <li role="presentation" className="px-3 py-2 text-xs text-muted-foreground">
            {emptyText}
          </li>
        )}
        {filtered.map((item) => (
          <li
            key={item.id}
            id={optionId(item.id)}
            role="option"
            aria-selected={Boolean(item.selected)}
            aria-disabled={item.disabled || undefined}
            onClick={() => !item.disabled && onPick(item.id)}
            onMouseMove={() => !item.disabled && setActiveId(item.id)}
            className={cn(
              'flex items-center gap-2 px-2.5 py-1.5 text-sm',
              item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              active?.id === item.id && 'bg-accent text-accent-foreground',
            )}
          >
            <Check
              className={cn('h-3.5 w-3.5 shrink-0 text-primary', !item.selected && 'invisible')}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">{item.label}</span>
            {item.hint && <span className="shrink-0 text-[11px] text-muted-foreground">{item.hint}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
