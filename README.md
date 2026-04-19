# Rota-Wise

A PWA for fair and balanced doctor shift scheduling. Generates equitable schedules while respecting vacations, rest intervals, pre-assignments, and workload distribution across days and months. Fully client-side — no backend required.

## Features

- **Smart scheduling algorithm** — generates optimal schedules with configurable hard and soft constraints
- **Interactive calendar** — color-coded monthly view with drag-and-drop, click-to-edit, and entry locking
- **Fairness guarantees** — balanced distribution by weekday, month, and weekend shifts
- **Global monthly shift limit** — configurable cap on shifts per doctor per month
- **Summary tables** — workdays by day-of-week and by month for each doctor
- **Export** — PDF and Word (.docx) reports, generated on demand
- **Save/load** — persist full schedules as `.rw` files (JSON); reload as-is or import as pre-assigned
- **Offline-ready** — Workbox PWA with full precaching; all assets available without network
- **Internationalization** — English and Spanish
- **Dark/light theme**

## Tech Stack

- **Next.js 16** / **React 19** / **TypeScript**
- **Tailwind CSS** + **Radix UI** (shadcn/ui)
- **date-fns**, **react-hook-form** + **Zod**
- **jspdf** + **jspdf-autotable** — PDF export (lazy-loaded)
- **docx** — Word export (lazy-loaded)
- **@ducanh2912/next-pwa** + **Workbox** — PWA/offline
- **Bun** — package manager, runtime, test runner

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) v1.0+

```bash
bun install
bun run dev        # http://localhost:3000
```

## Commands

| Command | Description |
|---|---|
| `bun run dev` | Development server (Turbopack) |
| `bun run build` | Production build (webpack, required by next-pwa) |
| `bun run start` | Production server |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript check |
| `bun test` | Run tests |
| `bun test --watch` | Tests in watch mode |
| `bun test --coverage` | Tests with coverage report |

## Project Structure

```
src/
├── app/                        # Next.js app router (layout, page)
├── components/
│   ├── rotawise/               # Schedule-specific components
│   └── ui/                     # shadcn/ui primitives (Radix UI + Tailwind)
├── context/                    # React contexts (language, file system, theme)
├── hooks/                      # Custom hooks (debounce, history, info-bar, schedule worker)
├── lib/
│   ├── schedule-generator.ts   # Core scheduling algorithm
│   ├── export-pdf.ts           # PDF export (jspdf)
│   ├── export-word.ts          # Word export (docx)
│   ├── types.ts                # TypeScript types
│   └── utils.ts                # Utilities
├── locales/                    # i18n translations (en.ts, es.ts)
├── workers/
│   └── schedule.worker.ts      # Web Worker — runs generateSchedule off the main thread
└── __tests__/                  # Test suites (bun test, 36 tests)
```

## Architecture

The app is a single-page React client. Key design decisions:

- **Scheduling runs in a Web Worker** (`src/workers/schedule.worker.ts` via `useScheduleWorker` hook) to keep the UI responsive during generation.
- **Heavy components are lazy-loaded** (`next/dynamic`) — calendar, summary tables, and startup screen load on demand.
- **Export libraries are lazy-imported** — jspdf and docx are fetched from SW cache only when the user clicks export, reducing initial bundle size.
- **All state is client-side** — localStorage for auto-save, File System Access API for `.rw` files, no backend.

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

36 tests across 2 files covering the scheduling algorithm (`src/__tests__/`). Tests run with `bun test` — no configuration needed, TypeScript handled natively.

```bash
bun test                                           # all tests
bun test src/__tests__/schedule-generator.test.ts  # single file
```

## Deployment

Static export deployable to any CDN or Node.js host:

- **Vercel** — recommended (`bun run build` + `bun run start`)
- **Netlify**, **Cloudflare Pages**, **GitHub Pages**
- **App stores** — PWA packaged via [PWABuilder](https://www.pwabuilder.com/) for Microsoft Store / Google Play

All JS chunks are precached by the service worker at install time — the app works fully offline after the first load.

## Documentation

- [`docs/algorithm.md`](docs/algorithm.md) — Complete scheduling algorithm specification
- [`docs/ui-reference.md`](docs/ui-reference.md) — UI component and interaction reference
- [`CLAUDE.md`](CLAUDE.md) — Development guidance for Claude Code
