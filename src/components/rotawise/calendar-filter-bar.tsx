import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { DoctorProfile } from '@/lib/types';
import { useLanguage } from '@/context/language-context';
import { WorkIcon, FreeDayIcon, PreAssignedIcon, ExcludedIcon } from '@/components/icons';

export interface ActiveFilter {
  type: 'doctor' | 'assignment';
  value: string;
  label: string;
}

interface CalendarFilterBarProps {
  doctors: DoctorProfile[];
  activeFilters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  isMetadataMode?: boolean;
}

type DropdownLevel = 'root' | 'doctor' | 'assignment';

const ASSIGNMENT_OPTIONS = [
  {
    value: 'Work',
    labelKey: 'calendar.filter.assignment.work' as const,
    Icon: WorkIcon,
    chipStyle: { backgroundColor: 'var(--chip-work-bg)', color: 'var(--chip-work-text)', border: '1px solid var(--chip-work-border)' },
  },
  {
    value: 'Free',
    labelKey: 'calendar.filter.assignment.freeDay' as const,
    Icon: FreeDayIcon,
    chipStyle: { backgroundColor: 'var(--chip-free-bg)', color: 'var(--chip-free-text)', border: '1px solid var(--chip-free-border)' },
  },
  {
    value: 'Pre-assigned',
    labelKey: 'calendar.filter.assignment.preassigned' as const,
    Icon: PreAssignedIcon,
    chipStyle: { backgroundColor: 'var(--chip-preassigned-bg)', color: 'var(--chip-preassigned-text)', border: '1px solid var(--chip-preassigned-border)' },
  },
  {
    value: 'Excluded',
    labelKey: 'calendar.filter.assignment.excluded' as const,
    Icon: ExcludedIcon,
    chipStyle: { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', border: '2px dashed var(--foreground)' },
  },
] as const;

export function CalendarFilterBar({ doctors, activeFilters, onFiltersChange, isMetadataMode = false }: CalendarFilterBarProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [level, setLevel] = useState<DropdownLevel>('root');
  const [searchText, setSearchText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredAssignmentOptions = ASSIGNMENT_OPTIONS.filter(
    (o) => !isMetadataMode || (o.value !== 'Pre-assigned' && o.value !== 'Excluded'),
  );

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const close = () => {
    setIsOpen(false);
    setLevel('root');
    setSearchText('');
  };

  const openRoot = () => {
    setLevel('root');
    setSearchText('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const navigateTo = (lvl: DropdownLevel) => {
    setLevel(lvl);
    setSearchText('');
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchText(val);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && searchText === '' && activeFilters.length > 0) {
      if (level !== 'root') {
        navigateTo('root');
      } else {
        onFiltersChange(activeFilters.slice(0, -1));
      }
    }
    if (e.key === 'Escape') close();
  };

  const toggleFilter = (filter: ActiveFilter) => {
    const exists = activeFilters.some(f => f.type === filter.type && f.value === filter.value);
    if (exists) {
      onFiltersChange(activeFilters.filter(f => !(f.type === filter.type && f.value === filter.value)));
    } else {
      onFiltersChange([...activeFilters, filter]);
    }
  };

  const removeFilter = (filter: ActiveFilter, e: React.MouseEvent) => {
    e.stopPropagation();
    onFiltersChange(activeFilters.filter(f => !(f.type === filter.type && f.value === filter.value)));
  };

  const getAssignmentChipStyle = (value: string) =>
    filteredAssignmentOptions.find(o => o.value === value)?.chipStyle;

  const filteredDoctors = doctors.filter(d =>
    d.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const rootOptions = [
    { key: 'doctor' as const, label: t('calendar.filter.typeDoctor') },
    { key: 'assignment' as const, label: t('calendar.filter.typeAssignment') },
  ].filter(o => searchText === '' || o.label.toLowerCase().includes(searchText.toLowerCase()));

  return (
    <div ref={containerRef} className="relative w-full">

      {/* Search bar */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 px-2.5 py-1 min-h-9 rounded-md border bg-card text-sm cursor-text transition-colors",
          isOpen ? "border-ring ring-1 ring-ring" : "border-input hover:border-muted-foreground/50"
        )}
        onClick={openRoot}
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-0.5" />

        {/* Active filter chips */}
        {activeFilters.map(filter => {
          const chipStyle = filter.type === 'assignment' ? getAssignmentChipStyle(filter.value) : undefined;
          const isExcluded = filter.type === 'assignment' && filter.value === 'Excluded';
          return (
            <Badge
              key={`${filter.type}-${filter.value}`}
              variant="outline"
              className={cn(
                "gap-0.5 pr-0.5 h-5 text-xs font-normal cursor-default shrink-0",
                isExcluded && "bg-muted/50 border-dashed border-muted-foreground/30 text-muted-foreground"
              )}
              style={isExcluded ? undefined : chipStyle}
            >
              <span>
                {filter.type === 'doctor'
                  ? `${t('calendar.filter.typeDoctor').toLowerCase()}:${filter.label}`
                  : `${t('calendar.filter.prefix.assignment')}:${filter.label}`}
              </span>
              <button
                onMouseDown={e => removeFilter(filter, e)}
                className="ml-0.5 rounded-full opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          );
        })}

        {/* Text input for optional search/filter */}
        <input
          ref={inputRef}
          value={searchText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          onClick={e => e.stopPropagation()}
          placeholder={activeFilters.length === 0 ? t('calendar.filter.addFilter') : ''}
          className="flex-1 min-w-[80px] outline-none bg-transparent text-sm placeholder:text-muted-foreground"
        />

        {/* Clear all */}
        {activeFilters.length > 0 && (
          <button
            onMouseDown={e => { e.stopPropagation(); onFiltersChange([]); }}
            className="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
            aria-label={t('calendar.filter.clearAll')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown — stopPropagation prevents container onClick from resetting level */}
      {isOpen && (
        <div
          className="absolute top-full left-0 z-50 mt-1 min-w-[220px] rounded-md border bg-popover shadow-md text-popover-foreground"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Root level */}
          {level === 'root' && (
            <div className="py-1">
              {rootOptions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t('calendar.filter.addFilter')}</p>
              ) : (
                rootOptions.map(option => (
                  <button
                    key={option.key}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => navigateTo(option.key === 'doctor' ? 'doctor' : 'assignment')}
                  >
                    <span>{option.label}</span>
                    <ChevronLeft className="h-3.5 w-3.5 rotate-180 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* Doctor level */}
          {level === 'doctor' && (
            <div>
              <button
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground border-b hover:bg-muted transition-colors"
                onClick={() => navigateTo('root')}
              >
                <ChevronLeft className="h-3 w-3" />
                {t('calendar.filter.back')}
              </button>
              {/* Search input inside dropdown */}
              <div className="px-2 py-1.5 border-b">
                <input
                  autoFocus
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder={t('calendar.filter.searchDoctors')}
                  className="w-full text-xs outline-none bg-transparent placeholder:text-muted-foreground"
                />
              </div>
              <div className="overflow-y-auto max-h-52">
                <div className="py-1">
                  {filteredDoctors.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{t('calendar.filter.searchDoctors')}</p>
                  ) : (
                    filteredDoctors.map(doc => {
                      const checked = activeFilters.some(f => f.type === 'doctor' && f.value === doc.id);
                      return (
                        <button
                          key={doc.id}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted transition-colors",
                            checked && "bg-muted/50"
                          )}
                          onClick={() => toggleFilter({ type: 'doctor', value: doc.id, label: doc.name })}
                        >
                          <Checkbox checked={checked} className="h-3.5 w-3.5 pointer-events-none" />
                          <span className="truncate">{doc.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Assignment type level */}
          {level === 'assignment' && (
            <div>
              <button
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground border-b hover:bg-muted transition-colors"
                onClick={() => navigateTo('root')}
              >
                <ChevronLeft className="h-3 w-3" />
                {t('calendar.filter.back')}
              </button>
              <div className="py-1">
                {filteredAssignmentOptions.map(({ value, labelKey, Icon, chipStyle }) => {
                  const label = t(labelKey);
                  const checked = activeFilters.some(f => f.type === 'assignment' && f.value === value);
                  return (
                    <button
                      key={value}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted transition-colors",
                        checked && "bg-muted/50"
                      )}
                      onClick={() => toggleFilter({ type: 'assignment', value, label })}
                    >
                      <Checkbox checked={checked} className="h-3.5 w-3.5 pointer-events-none" />
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-3 w-3" style={{ color: chipStyle.color }} />
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
