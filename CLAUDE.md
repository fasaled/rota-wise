# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start dev server at http://localhost:5173 (Vite HMR)
bun run build        # Production build (Vite/Rollup + Workbox PWA) → dist/
bun run preview      # Serve production build locally
bun run lint         # ESLint
bun run typecheck    # TypeScript check (app + node + tests)
bun test             # Run tests (bun test runner, no jest)
bun test --watch     # Tests in watch mode
bun test --coverage  # Tests with coverage report
```

To run a single test file:
```bash
bun test src/__tests__/schedule-generator.test.ts
```

## Architecture

Rota-Wise is a Vite + React SPA for scheduling medical doctors fairly across a time period while respecting hard and soft constraints. Entry point: `src/main.tsx` → `src/rotawise-page.tsx`. No SSR, no API routes, fully client-side.

### Core Algorithm (`src/lib/schedule-generator.ts`)

The heart of the application. Given a list of doctors with their constraints and a date range, it produces a schedule. Key concepts:

- **Hard constraints**: vacations, minimum rest intervals between shifts, excluded dates, pre-assigned dates, fixed entries
- **Soft constraints**: total workdays target, day-of-week distribution fairness, monthly workload balance, weekend shift fairness
- **Selection**: Each day, eligible doctors are scored; the lowest-scoring eligible doctor is selected
- **Warnings**: Generated for conflicts (unavailable on assigned date, uncovered days, etc.)

Types are in `src/lib/types.ts`: `DoctorProfile`, `ScheduleEntry`, `Schedule`, `ScheduleFormValues`.

### Application Layer (`src/rotawise-page.tsx`)

Orchestrator component. Manages:
- Form state (via react-hook-form + Zod)
- Generated schedule state
- File persistence: IndexedDB working copy always; optional `.rw` via File System Access API (auto-save on change)
- Undo history (`useHistory` hook)
- Coordination between all child components

Pure helpers live in `src/lib/` (`schedule-storage`, `schedule-warnings`, `schedule-edits`, `schedule-interval`). Coverage and post-generation analysis are in `schedule-coverage.ts` / `schedule-analyze.ts`.

### Components (`src/components/rotawise/`)

- `data-input-form.tsx` — Doctor data entry (names, vacations, excluded dates, pre-assignments, target workdays)
- `schedule-calendar-view.tsx` — Visual monthly calendar with color-coded assignments
- `schedule-summary-table.tsx` — Workload by day-of-week
- `monthly-workload-summary-table.tsx` — Month-by-month breakdown
- `app-sidebar.tsx` / `command-bar.tsx` — App shell
- `language-selector.tsx` — EN/ES toggle

### i18n (`src/context/language-context.tsx`, `src/locales/`)

English/Spanish support via a React context. Translation files in `src/locales/`. Language preference persisted in localStorage.

### UI Components (`src/components/ui/`)

40+ shadcn/ui components (Radix UI primitives + Tailwind). Do not modify these directly — regenerate via shadcn CLI if needed.

### Data Persistence

All persistence is client-side. A working copy is always stored in IndexedDB. When a `.rw` file is bound (Chromium File System Access API), changes also auto-save to disk. Other browsers can open files and download a `.rw` copy. No backend/database. Word export uses `docx` (lazy-imported on demand).

## Key Constraints

- This is a pure client-side app (no API routes, no server actions). All logic runs in the browser.
- The scheduling algorithm runs in a Web Worker (`src/workers/schedule.worker.ts`) via `useScheduleWorker` hook — do not call `generateSchedule` directly from the main thread.
- Tests live in `src/__tests__/` (algorithm, storage, warnings, hooks, language). UI components are not unit-tested.
- The app supports two languages (EN/ES); when adding user-facing strings, add translations to both locale files.
