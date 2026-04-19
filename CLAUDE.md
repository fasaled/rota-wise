# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start dev server at http://localhost:5173 (Vite HMR)
bun run build        # Production build (Vite/Rollup + Workbox PWA) → dist/
bun run preview      # Serve production build locally
bun run lint         # ESLint
bun run typecheck    # TypeScript check (tsc --noEmit, excludes __tests__)
bun test             # Run tests (bun test runner, no jest)
bun test --watch     # Tests in watch mode
bun test --coverage  # Tests with coverage report
```

To run a single test file:
```bash
bun test src/__tests__/schedule-generator.test.ts
```

## Architecture

Rota-Wise is a Vite + React SPA for scheduling medical doctors fairly across a time period while respecting hard and soft constraints. Entry point: `src/main.tsx` → `src/app/page.tsx`. No SSR, no API routes, fully client-side.

### Core Algorithm (`src/lib/schedule-generator.ts`)

The heart of the application. Given a list of doctors with their constraints and a date range, it produces a schedule. Key concepts:

- **Hard constraints**: vacations, minimum rest intervals between shifts, excluded dates, pre-assigned dates, fixed entries
- **Soft constraints**: total workdays target, day-of-week distribution fairness, monthly workload balance, weekend shift fairness
- **Selection**: Each day, eligible doctors are scored; the lowest-scoring eligible doctor is selected
- **Warnings**: Generated for conflicts (unavailable on assigned date, uncovered days, etc.)

Types are in `src/lib/types.ts`: `DoctorProfile`, `ScheduleEntry`, `Schedule`, `ScheduleFormValues`.

### Application Layer (`src/app/page.tsx`)

Large (~1280 lines) orchestrator component. Manages:
- Form state (via react-hook-form + Zod)
- Generated schedule state
- File persistence via File System Access API (`.rw` files, auto-save on change)
- Undo history (`useHistory` hook)
- Coordination between all child components

### Components (`src/components/rotawise/`)

- `data-input-form.tsx` — Doctor data entry (names, vacations, excluded dates, pre-assignments, target workdays)
- `schedule-calendar-view.tsx` — Visual monthly calendar with color-coded assignments
- `schedule-summary-table.tsx` — Workload by day-of-week
- `MonthlyWorkloadSummaryTable.tsx` — Month-by-month breakdown
- `schedule-versions-manager.tsx` — Save/load schedule versions (JSON export/import)
- `manual-adjustment-dialog.tsx` — Edit individual schedule entries with constraint validation
- `language-selector.tsx` — EN/ES toggle

### i18n (`src/context/language-context.tsx`, `src/locales/`)

English/Spanish support via a React context. Translation files in `src/locales/`. Language preference persisted in localStorage.

### UI Components (`src/components/ui/`)

40+ shadcn/ui components (Radix UI primitives + Tailwind). Do not modify these directly — regenerate via shadcn CLI if needed.

### Data Persistence

All persistence is client-side via the File System Access API (`.rw` files). Falls back to browser download on Firefox. No backend/database. PDF and Word export use `jspdf` and `docx` libraries (lazy-imported on demand).

## Key Constraints

- This is a pure client-side app (no API routes, no server actions). All logic runs in the browser.
- The scheduling algorithm runs in a Web Worker (`src/workers/schedule.worker.ts`) via `useScheduleWorker` hook — do not call `generateSchedule` directly from the main thread.
- Tests cover the scheduling algorithm exclusively (`src/__tests__/`). UI components are not tested.
- The app supports two languages (EN/ES); when adding user-facing strings, add translations to both locale files.
