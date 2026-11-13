import { cn } from '@/lib/utils';
import type { UnitCoverage } from '@/lib/types';
import { useLanguage } from '@/context/language-context';
import { COVERAGE_DOT_CLASS, coverageLevel } from './chips';

export function CoverageDots({ coverage }: { coverage: UnitCoverage[] }) {
  const { t } = useLanguage();
  if (coverage.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-1" role="group" aria-label={t('calendar.coverage.legend')}>
      {coverage.map((c) => {
        const level = coverageLevel(c);
        const params = { unit: c.unitName, available: c.available, min: c.min };
        const base =
          level === 'ignored'
            ? t('calendar.coverage.tooltipUntracked', params)
            : level === 'covered'
              ? t('calendar.coverage.tooltipCovered', params)
              : level === 'partial'
                ? t('calendar.coverage.tooltipPartial', params)
                : t('calendar.coverage.tooltipUncovered', params);
        const allies = c.alliedUnitNames?.length
          ? ` (${t('calendar.coverage.tooltipAllies', { allies: c.alliedUnitNames.join(', ') })})`
          : '';
        const tooltip = base + allies;
        return (
          <span
            key={c.unitId}
            role="img"
            title={tooltip}
            aria-label={tooltip}
            // The dot is 8×8px; the invisible halo gives it a usable hover target.
            className={cn(
              "relative inline-flex h-2 w-2 cursor-help ring-1 ring-black/5 dark:ring-white/10",
              "before:absolute before:inset-[-6px] before:content-['']",
              COVERAGE_DOT_CLASS[level],
            )}
          />
        );
      })}
    </div>
  );
}
