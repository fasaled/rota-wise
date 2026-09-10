# Rota-Wise

A PWA for fair and balanced doctor shift scheduling. Generates equitable schedules while respecting vacations, rest intervals, pre-assignments, and workload distribution across days and months. Fully client-side — no backend required.

## Features

- **Smart scheduling algorithm** — generates optimal schedules with configurable hard and soft constraints
- **Interactive calendar** — color-coded monthly view with drag-and-drop, click-to-edit, and entry locking
- **Fairness guarantees** — balanced distribution by weekday, month, and weekend shifts
- **Global monthly shift limit** — configurable cap on shifts per doctor per month
- **Summary tables** — workdays by day-of-week and by month for each doctor
- **Export** — Word (.docx) report, generated on demand
- **Save/load** — persist full schedules as `.rw` files (JSON); reload as-is or import as pre-assigned
- **Offline-ready** — Workbox PWA with full precaching; all assets available without network
- **Internationalization** — English and Spanish
- **Dark/light theme**

## Tech Stack

- **Vite 6** / **React 19** / **TypeScript**
- **Tailwind CSS** + **Radix UI** (shadcn/ui)
- **date-fns**, **react-hook-form** + **Zod**
- **docx** — Word export (lazy-loaded)
- **vite-plugin-pwa** + **Workbox** — PWA/offline
- **Bun** — package manager, runtime, test runner

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) v1.0+

```bash
bun install
bun run dev        # http://localhost:5173
```

## Commands

| Command | Description |
|---|---|
| `bun run dev` | Development server (Vite HMR) |
| `bun run build` | Production build (Rollup + Workbox) |
| `bun run preview` | Serve production build locally |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript check |
| `bun test` | Run tests |
| `bun test --watch` | Tests in watch mode |
| `bun test --coverage` | Tests with coverage report |

## Project Structure

```
src/
├── main.tsx                    # React entry point (providers + root render)
├── rotawise-page.tsx           # Root orchestrator (app shell, tabs)
├── styles/globals.css          # Global styles + Tailwind + CSS variables
├── components/
│   ├── rotawise/               # Schedule-specific components
│   └── ui/                     # shadcn/ui primitives (Radix UI + Tailwind)
├── context/                    # React contexts (language, file system)
├── hooks/                      # Custom hooks (debounce, history, info-bar, schedule worker)
├── lib/
│   ├── schedule-generator.ts   # Core scheduling algorithm
│   ├── schedule-coverage.ts    # Unit coverage helpers (used by calendar + generator)
│   ├── schedule-analyze.ts     # Post-generation constraint analysis
│   ├── schedule-storage.ts     # .rw serialize/deserialize
│   ├── export-word.ts          # Word export (docx)
│   ├── types.ts                # TypeScript types
│   └── utils.ts                # Utilities
├── locales/                    # i18n translations (en.json, es.json)
├── workers/
│   └── schedule.worker.ts      # Web Worker — runs generateSchedule off the main thread
└── __tests__/                  # bun test (algorithm, storage, warnings, hooks)
```

## Architecture

The app is a single-page React client. Key design decisions:

- **Scheduling runs in a Web Worker** (`src/workers/schedule.worker.ts` via `useScheduleWorker` hook) to keep the UI responsive during generation.
- **Heavy components are lazy-loaded** (`React.lazy` + `Suspense`) — calendar, summary tables, and startup screen load on demand.
- **Export libraries are lazy-imported** — docx is fetched from SW cache only when the user clicks export, reducing initial bundle size.
- **All state is client-side** — File System Access API for `.rw` files (auto-save), no backend.

## Algorithm

Selection criteria (in priority order) for each unassigned day:

1. Fewest total shifts globally
2. Most underrepresented for that day-of-week
3. Fewest weekend shifts this month (weekends only)
4. Fewest shifts on this specific weekday
5. Lowest monthly workload ratio (shifts / available days)
6. Longest idle time since last shift
7. Random tiebreaker

Full specification: [`docs/algorithm.md`](docs/algorithm.md)

## Testing

Unit tests in `src/__tests__/` cover the scheduling algorithm, file serialization, warnings, and hooks. Playwright journeys live in `e2e/`. Tests run with `bun test`.

```bash
bun test                                           # all tests
bun test src/__tests__/schedule-generator.test.ts  # single file
```

## Deployment

Static export deployable to any CDN or Node.js host:

- **Vercel** — recommended (`bun run build` → deploy `dist/`)
- **Netlify**, **Cloudflare Pages**, **GitHub Pages**
- **App stores** — PWA packaged via [PWABuilder](https://www.pwabuilder.com/) for Microsoft Store / Google Play

All JS chunks are precached by the service worker at install time — the app works fully offline after the first load.

## Documentation

- [`docs/algorithm.md`](docs/algorithm.md) — Complete scheduling algorithm specification
- [`docs/ui-reference.md`](docs/ui-reference.md) — UI component and interaction reference
- [`CLAUDE.md`](CLAUDE.md) — Development guidance for Claude Code
