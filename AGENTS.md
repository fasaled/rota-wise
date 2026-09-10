# AGENTS.md — rota-wise

## Commands

| Action | Command |
|---|---|
| Dev server | `bun run dev` (http://localhost:5173) |
| Build | `bun run build` → `dist/` |
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` (app + node + tests) |
| Test | `bun test` |
| Test (watch) | `bun test --watch` |
| Test (single file) | `bun test src/__tests__/schedule-generator.test.ts` |

Run `lint → typecheck → test` in that order to verify.

## Runtime

- **Bun** is the package manager and runtime (not npm). Use `bun install`, not `npm install`.
- `bun test` uses the built-in test runner with happy-dom, not jest.
- `bunfig.toml` preloads `src/__tests__/setup.ts`; handles TS paths natively.

## Architecture

- Vite 6 + React 19 SPA. **No SSR, no API routes, no backend.** Fully client-side.
- Entry: `src/main.tsx` → `src/rotawise-page.tsx`.
- Path alias: `@/*` → `src/*`.
- **Scheduling runs in a Web Worker** (`src/workers/schedule.worker.ts`) via `useScheduleWorker` hook. Never call `generateSchedule` from the main thread.
- Heavy components (calendar, summaries) and export (`docx`) are **lazy-loaded**. Wrap new heavy imports in `React.lazy` + `Suspense`.

## Conventions

- **`src/components/ui/`** — shadcn/ui primitives. Do not edit directly; regenerate via shadcn CLI.
- **i18n**: EN/ES via context (`src/context/language-context.tsx`). Every new user-facing string must be added to both `src/locales/en.json` and `src/locales/es.json`.
- **Tests** live in `src/__tests__/` (algorithm, storage, warnings, hooks, language). UI components are not unit-tested; Playwright covers journeys in `e2e/`.
- All state is client-side: IndexedDB working copy by default; optional `.rw` file via File System Access API (auto-save). Browsers without that API still work (open via `<input type="file">`, save as download).

## PWA

- `vite-plugin-pwa` generates `public/sw.js` and `public/workbox-*.js` at build time. These are gitignored — do not commit or edit them.
