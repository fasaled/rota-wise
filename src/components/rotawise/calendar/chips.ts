import type { ScheduleEntry, UnitCoverage } from '@/lib/types';

type ChipAssignment = Exclude<ScheduleEntry['assignment'], 'Off'>;

/** Colour tokens live in `globals.css` (`.chip-*`) so both themes stay in one place. */
export const CHIP_CLASS: Record<ChipAssignment, string> = {
  Work: 'chip chip-work',
  'Pre-assigned': 'chip chip-preassigned',
  Free: 'chip chip-free',
  Excluded: 'chip chip-excluded',
};

export const CHIP_BASE = 'w-full rounded-sm flex items-center gap-1 p-1.5 text-xs text-left';

export const isWorkLike = (assignment: ScheduleEntry['assignment']): boolean =>
  assignment === 'Work' || assignment === 'Pre-assigned';

export type CoverageLevel = 'covered' | 'partial' | 'none' | 'ignored';

/**
 * Colour *and* shape: circle = covered, diamond = partial, square = none,
 * so the state does not depend on telling green from red.
 */
export const COVERAGE_DOT_CLASS: Record<CoverageLevel, string> = {
  covered: 'rounded-full bg-emerald-500',
  partial: 'rotate-45 rounded-[1px] bg-amber-500',
  none: 'rounded-none bg-rose-500',
  ignored: 'rounded-full bg-zinc-300 dark:bg-zinc-600',
};

export function coverageLevel(c: UnitCoverage): CoverageLevel {
  if (c.status === 'ignored') return 'ignored';
  if (c.isCovered) return 'covered';
  return c.available === 0 ? 'none' : 'partial';
}
