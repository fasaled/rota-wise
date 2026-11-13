import { useId } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

interface ScheduleWarningsBannerProps {
  warnings: string[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function ScheduleWarningsBanner({ warnings, collapsed, onToggleCollapsed }: ScheduleWarningsBannerProps) {
  const { t } = useLanguage();
  const listId = useId();

  return (
    <div className="flex items-start gap-2 mx-2 sm:mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : listId}
          className="flex items-center gap-1.5 font-medium w-full text-left"
        >
          {t('page.section.scheduleWarnings.title')}
          <span className="inline-flex items-center justify-center rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-amber-900 dark:bg-amber-800 dark:text-amber-100">
            {warnings.length}
          </span>
          {collapsed ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        {!collapsed && (
          <ul id={listId} className="mt-1 list-disc pl-4 space-y-0.5 max-h-48 overflow-y-auto">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
