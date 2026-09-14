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

Run `lint → typecheck → test` in that order to verify.

## Runtime

- **Bun** is the package manager and runtime (not npm). Use `bun install`, not `npm install`.
- `bun test` uses the built-in test runner with happy-dom, not jest.
- `bunfig.toml` preloads `src/__tests__/setup.ts`; handles TS paths natively.

## Architecture

Vite 6 + React 19 SPA. **No SSR, no API routes, no backend.** Fully client-side.

- Entry: `src/main.tsx` → `src/rotawise-page.tsx` (form, schedule, persistence, undo).
- Path alias: `@/*` → `src/*`.
- **Scheduling runs in a Web Worker** (`src/workers/schedule.worker.ts`) via `useScheduleWorker`. Never call `generateSchedule` from the main thread.
- Heavy components (calendar, summaries) and export (`docx`) are **lazy-loaded**. Wrap new heavy imports in `React.lazy` + `Suspense`.
- Pure helpers: `src/lib/` (`schedule-generator`, `schedule-coverage`, `schedule-analyze`, `schedule-storage`, `schedule-warnings`, `schedule-edits`, `schedule-interval`). Types: `src/lib/types.ts`.
- App UI: `src/components/rotawise/` (roster form, calendar, summaries, shell). Do not edit `src/components/ui/` by hand (shadcn/ui).

Full spec: `docs/algorithm.md`. Short version:

- **Hard (eligibility):** free days, excluded dates, auto-assignment exclusion, min interval, post-call (next calendar day; Saturday → Monday), unit coverage look-ahead.
- **Soft (score only):** day-of-week balance, preferred days (Thu–Sun), weekend fairness, monthly load, idle time.
- **Selection:** weighted random sampling over the score (higher score = higher weight).
- **Units (optional):** weekday `minPostCallCoverage`, allied pools, temporary cover assignments.

## Conventions

- **i18n:** EN/ES via `src/context/language-context.tsx`. Every new user-facing string goes in both `src/locales/en.json` and `src/locales/es.json`.
- **Tests:** `src/__tests__/` (algorithm, storage, warnings, hooks, language). UI is not unit-tested; Playwright journeys live in `e2e/`.
- **Persistence:** IndexedDB working copy always; optional `.rw` via File System Access API (auto-save). Other browsers: `<input type="file">` and download. Word export is lazy `docx`.
- **PWA:** `vite-plugin-pwa` generates `public/sw.js` and `public/workbox-*.js` at build time. Gitignored — do not commit or edit them.

## Documentation

All docs are English. If behaviour changes, update the matching file in `docs/`:

- `docs/algorithm.md` — scheduler
- `docs/architecture.md` — ADRs / module map
- `docs/usability.md` / `docs/ui-reference.md` — UX
- `docs/file-format.md` — `.rw` shape (`CURRENT_FILE_VERSION`)
- `docs/privacy.md` — local data handling
