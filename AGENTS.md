# AGENTS.md — rota-wise

## Commands

| Action | Command |
|---|---|
| Dev server | `bun run dev` (http://localhost:5173) |
| Build | `bun run build` → `dist/` |
| Preview | `bun run preview` |
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` (app + node + tests) |
| Test | `bun test` |
| Test (watch) | `bun test --watch` |
| Test (coverage) | `bun test --coverage` |
| Test (single file) | `bun test src/__tests__/schedule-generator.test.ts` |
| E2E (web) | `bun run e2e` (Playwright + Vite dev) |

Run `lint → typecheck → test` in that order to verify.

## Runtime

- **Bun** is the package manager and runtime (not npm). Use `bun install`, not `npm install`.
- `bun test` uses the built-in test runner with happy-dom, not jest.
- `bunfig.toml` preloads `src/__tests__/setup.ts`; handles TS paths natively.

## Architecture

Vite 6 + React 19 SPA. **No SSR, no API routes, no backend.** Fully client-side. The only external request is the user-triggered holiday import (`src/lib/holiday-import.ts`, Open Data Euskadi, Donostia only for now); a new source needs its origin in `connect-src` (`vercel.json`) and a line in `docs/privacy.md`.

- Entry: `src/main.tsx` → `src/rotawise-page.tsx` (wires the hooks below to the UI).
- **One source of truth:** `useScheduleDocument` holds `{ schedule, formValues, currentMinInterval }` plus undo/redo. Doctors, units, holidays, warnings and the saved file are derived with `useMemo` — never store a copy of them. Saving is `useDocumentPersistence` (suspend/resume around open/new).
- Path alias: `@/*` → `src/*`.
- **Scheduling runs in a Web Worker** (`src/workers/schedule.worker.ts`) via `useScheduleWorker`. Never call `generateSchedule` from the main thread.
- Heavy components (calendar, summaries) and export (`docx`) are **lazy-loaded**. Wrap new heavy imports in `React.lazy` + `Suspense`.
- Pure helpers: `src/lib/` (`schedule-generator`, `schedule-eligibility`, `schedule-coverage`, `schedule-analyze`, `schedule-storage`, `schedule-warnings`, `schedule-edits`, `schedule-interval`, `dates`, `random`, `i18n`). Types: `src/lib/types.ts`.
- App UI: `src/components/rotawise/` (shell, summaries; `calendar/` and `form/` hold the pieces of the calendar and the roster form). Do not edit `src/components/ui/` by hand (shadcn/ui).
- **Dates are calendar days.** Use `toDateKey` / `parseDateValue` (`src/lib/dates.ts`) for keys and persistence; never `toISOString()`.
- **No inline scripts, no third-party origins:** `vercel.json` sends a strict CSP (`script-src 'self'`). Pre-paint code goes in `public/theme-init.js`.

Full spec: `docs/algorithm.md`. Short version:

- **Hard (eligibility):** free days, excluded dates, auto-assignment exclusion, min interval, post-call (next calendar day; Saturday → Monday), unit coverage look-ahead, monthly limit when "strict" is on. The per-doctor rules live in `getAssignmentBlockReason` and are shared with the calendar's doctor picker.
- **Soft (score only):** total workload, day-of-week balance, preferred days (Thu–Sun), weekend fairness, monthly load, idle time, monthly limit when not strict.
- **Selection:** seeded softmax sampling over the score, then a repair pass for uncovered days. The worker builds 24 attempts and keeps the cheapest; same inputs + same seed = same roster.
- **Units (optional):** weekday `minPostCallCoverage`, allied pools, temporary cover assignments.

## Conventions

- **i18n:** EN/ES via `src/context/language-context.tsx` (+ `src/lib/i18n.ts`). Every new user-facing string goes in both `src/locales/en.json` and `src/locales/es.json`. Keys are flat and typed (`TranslationKey`); a test enforces parity. Zod messages are i18n keys.
- **Tests:** `src/__tests__/` (algorithm, storage, warnings, hooks, language). UI is not unit-tested; Playwright journeys live in `e2e/` — add a case to `e2e/regressions.playwright.ts` when fixing a UI bug.
- **Persistence:** IndexedDB working copy always; optional `.rw` via File System Access API (auto-save). Other browsers: `<input type="file">` and download. Word export is lazy `docx`.
- **PWA:** `vite-plugin-pwa` generates `public/sw.js` and `public/workbox-*.js` at build time. Gitignored — do not commit or edit them. The app runs as an installable PWA — same `dist/`, no separate desktop target.

## Documentation

All docs are English. If behaviour changes, update the matching file in `docs/`:

- `docs/algorithm.md` — scheduler
- `docs/architecture.md` — ADRs / module map
- `docs/usability.md` / `docs/ui-reference.md` — UX
- `docs/file-format.md` — `.rw` shape (`CURRENT_FILE_VERSION`)
- `docs/privacy.md` — local data handling
