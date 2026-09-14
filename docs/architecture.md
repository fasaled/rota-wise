# Architecture

Rota-Wise is a **Vite 6 + React 19 SPA**. There is no SSR, no API, and no
application backend. The scheduler, the file format, IndexedDB, and Word
export all run in the client (a browser tab, a PWA, or a Deno Desktop
webview).

Entry: `src/main.tsx` → `src/rotawise-page.tsx`. Desktop packaging:
`desktop/main.ts` serves `dist/` and opens a native window.

Path alias: `@/*` → `src/*`.

---

## Module map

```
src/
├── main.tsx                     Providers (theme, language, file system) + render
├── rotawise-page.tsx            Orchestrator: form, schedule, persistence, undo
├── components/rotawise/         App shell, config form, calendar, summaries
├── components/ui/               shadcn/ui (do not edit by hand)
├── context/                     Language, theme, File System Access
├── hooks/                       Worker, history, debounce, info-bar
├── lib/
│   ├── schedule-generator.ts    Day-by-day assignment
│   ├── schedule-coverage.ts     Post-call, alliances, availability
│   ├── schedule-analyze.ts      Warnings after generation / edits
│   ├── schedule-edits.ts        Pure calendar mutations
│   ├── schedule-interval.ts     Neighbour / min-interval helpers
│   ├── schedule-storage.ts      .rw serialize / deserialize / migrate
│   ├── schedule-warnings.ts     Warning keys → translated strings
│   ├── schedule-form-schema.ts  Zod form schema
│   ├── browser-storage.ts       IndexedDB working copy
│   ├── export-word.ts           Lazy-loaded .docx
│   └── types.ts                 Domain types + CURRENT_FILE_VERSION
├── workers/schedule.worker.ts   Off-main-thread generateSchedule
├── locales/                     en.json, es.json
└── sw.ts                        Workbox injectManifest service worker

desktop/main.ts                  Deno Desktop window + static server for dist/
```

`rotawise-page.tsx` owns session state. Pure functions live in `src/lib/` so
the algorithm and file format can be tested without the DOM.

---

## Runtime data flow

1. Hydration: PWA `launchQueue` file, else IndexedDB working copy, else empty roster.
2. Roster tab writes `ScheduleFormValues` through react-hook-form + Zod.
3. **Generate** posts `{ formValues, existingFixedEntries }` to the worker.
4. The worker returns `{ schedule, warnings?, error? }`.
5. The page stores the schedule, pushes an undo snapshot, navigates to Calendar,
   and debounces a persist (IndexedDB always; disk if a file handle is bound).
6. Calendar edits go through `src/lib/schedule-edits.ts`, then warnings are
   recomputed with `computeScheduleWarnings`.

---

## Architectural decisions

### ADR 1 — Fully client-side

**Context.** The app schedules named clinicians. Roster files are sensitive
enough that a server copy is a liability, and many users work on hospital
networks or offline.

**Decision.** Ship a static SPA. Persistence is IndexedDB plus an optional
local `.rw` file. Export is generated in the browser (`docx`).

**Consequences.** No accounts, no sync, no multi-device collaboration. A
refresh on a new browser is an empty roster unless the user opens a file.
Hosting is any static CDN (Vercel, Netlify, GitHub Pages). The project is
licensed under the GNU AGPL v3 (or later): a hosted modified copy must offer
Corresponding Source to its users (section 13). The sidebar “Source code”
link (`SOURCE_CODE_URL` in `src/lib/source.ts`) is that offer for this
repository; forks that change the program must point it at *their* source.

### ADR 2 — Scheduler in a Web Worker

**Context.** A year-long roster with 20 doctors and unit look-ahead is enough
work to jank the UI if it runs on the main thread.

**Decision.** `generateSchedule` is only called from
`src/workers/schedule.worker.ts`, wrapped by `useScheduleWorker`.

**Consequences.** Dates crossing the worker boundary must survive structured
clone (they do: `Date` is cloneable). Unit tests may still import
`generateSchedule` directly. If the worker fails to start, the hook currently
does not fall back to sync generation — treat worker availability as required
in supported browsers.

### ADR 3 — Dual persistence (IndexedDB + optional file)

**Context.** Chromium implements the File System Access API; Firefox and Safari
do not (or not enough for a bound, auto-saved handle). Users still need a
working copy between visits.

**Decision.**

- Always write a working copy to IndexedDB (`rotawise` / `kv` / `workingCopy`).
- When the user picks **Save to file** in a supporting browser, bind a
  `FileSystemFileHandle` and auto-save on change (500 ms debounce).
- Elsewhere, **Save** downloads a `.rw` blob. **Open** uses `<input type="file">`.

**Consequences.** “Browser only” is a first-class mode, not an error. A banner
explains missing disk auto-save. Unlinking a file does not delete it on disk.
See [file-format.md](file-format.md) and [usability.md](usability.md).

### ADR 4 — Greedy score + weighted sample, not a solver

**Context.** Hospital rotas have hard rest rules and soft fairness. A MIP
solver would need WASM weight, a modelling layer, and still a review UI.

**Decision.** One chronological pass, hard filters, then weighted random
sampling over a fairness score (see [algorithm.md](algorithm.md)).

**Consequences.** The same inputs can yield different valid rotas — useful when
the first draw feels unfair. There is no completeness guarantee; uncovered days
become `Off` plus a warning. Users pin days and regenerate around them.

### ADR 5 — Hard filters vs soft warnings

**Context.** Blocking every fairness preference would leave holes. Ignoring rest
rules would produce illegal rotas.

**Decision.** Eligibility is only: free/excluded/auto-exclude, min interval,
post-call, and unit coverage look-ahead. Monthly caps, weekday balance, and
idle time only change the score and/or post-hoc warnings. Manual edits may
violate soft (and some hard) rules; the UI warns instead of refusing, except
for free-day work which is blocked.

**Consequences.** A generated roster can still show amber warnings. That is
intentional: the human remains the authority.

### ADR 6 — Units, alliances, and post-call coverage

**Context.** After an on-call shift the doctor is typically not on the ward the
next working day. Departments need a minimum headcount, and neighbouring wards
sometimes cover each other.

**Decision.** Model `Unit` with `minPostCallCoverage` and `alliedUnitIds`.
Post-call is next calendar day, except Saturday → Monday. Coverage is required
on weekdays that are not holidays. Alliances are an undirected connected
component; each unit keeps its own minimum. Temporary `coverAssignments` move a
doctor’s effective unit for a date range.

**Consequences.** The calendar shows per-unit dots (green / amber / red / grey).
The generator look-ahead refuses an assignment that would uncover an alliance
tomorrow. Outpatient-style units use minimum `0` and are not tracked.

### ADR 7 — PWA with `injectManifest`

**Context.** Users open the app on duty phones and expect it to work offline
after the first visit. The default Workbox generateSW flow is harder to audit.

**Decision.** `vite-plugin-pwa` + `injectManifest` with `src/sw.ts`. Precache
all hashed assets. Navigation falls back to `index.html`. `registerType` is
`autoUpdate`. Generated `public/sw.js` is gitignored.

**Consequences.** Offline works for the app shell and JS. Roster data is
already local, so offline scheduling works. Manifest file handlers let the OS
open `.rw` files into the PWA (`launchQueue`).

### ADR 8 — English / Spanish in a React context

**Context.** The original users are bilingual (ES/EN). A full i18n framework is
heavier than two JSON files.

**Decision.** `language-context.tsx` plus `src/locales/{en,es}.json`. Preference
in `localStorage`. Algorithm `dayOfWeek` stays English; the UI translates.

**Consequences.** Every new string needs both files. Tests cover the language
toggle. Warning keys (`warnings.*`) are stable ids, not display text.

### ADR 9 — shadcn/ui primitives are generated

**Context.** Consistent Radix + Tailwind controls without a design-system repo.

**Decision.** `src/components/ui/` is owned by the shadcn CLI (`components.json`).
App-specific UI lives in `src/components/rotawise/`.

**Consequences.** Hand-edits to `ui/` are overwritten on regenerate. Theming is
CSS variables in `src/styles/globals.css`.

### ADR 10 — Tests: bun unit + Playwright journeys

**Context.** The cost of a wrong interval or coverage rule is a bad clinical
rota. The cost of snapshot-testing every shadcn button is noise.

**Decision.** `bun test` + happy-dom for algorithm, storage, warnings, hooks,
theme, language. Playwright in `e2e/` for journeys. No Jest. File pattern
`*.playwright.ts` so bun test does not load Playwright files.

**Consequences.** UI regressions that are not in a journey can slip through.
Prefer extending `e2e/core-journeys.playwright.ts` or
`e2e/coverage-derivation.playwright.ts` over adding enzyme-style tests.

### ADR 11 — Word export, not spreadsheets

**Context.** Earlier versions opened/exported Excel. Cell-level spreadsheet
edits fought the constraint model and inflated the bundle.

**Decision.** The only document export is a lazily imported `.docx` calendar
(`src/lib/export-word.ts`). The source of truth remains `.rw` JSON.

**Consequences.** Round-tripping through Word is not supported. Print/share
workflows use the Word file; further generation uses `.rw`.

### ADR 12 — Lazy-load heavy surfaces

**Context.** The calendar, two summary tables, and `docx` are large relative to
the config form.

**Decision.** Those components (and the export module) load via `React.lazy` /
dynamic `import()`. Rollup also splits `react` / `react-dom` into a manual
chunk.

**Consequences.** First paint of Roster is smaller. The service worker still
precaches the extra chunks, so they are available offline after install.

### ADR 13 — Undo is in-memory only

**Context.** Users need to revert a bad drag or regenerate. Persisting a full
history stack into `.rw` would grow files and complicate merge semantics.

**Decision.** `useHistory` keeps schedule snapshots in RAM. Undo is disabled
after reload. Persistence always stores the *current* roster.

**Consequences.** Document this in the UI mental model: undo is a session tool,
not a version control system. The `.rw` `versions[]` field exists for named
snapshots but the current UI does not expose a version manager
(`fileVersions` stays `[]`).

### ADR 14 — Dual target: web PWA and Deno Desktop

**Context.** The same roster tool is useful in a browser (hospital network,
shared PC, phone) and as a local desktop app (offline laptop, no install of
Chrome as a PWA). `deno desktop` (Deno 2.9+, experimental) wraps a Vite SPA
in a native webview and a loopback HTTP server.

**Decision.**

- Keep **Bun + Vite** as the web toolchain (`bun run dev` / `bun run build`).
- Add **Deno only as a packager**. The scheduler still runs in
  `schedule.worker.ts` inside the webview, never in the Deno process.
- `bun run desktop:dev` → `deno desktop --hmr .` (Vite detection, Vite HMR).
- `bun run desktop:build` → `vite build --mode desktop` then
  `deno desktop desktop/main.ts`. Mode `desktop` disables the PWA plugin so
  the webview does not register a service worker against loopback.
- Native binaries land in `release/`, not `dist/` (Vite owns `dist/`).
- Default backend is OS webview (`webview`). CEF (`--backend cef`) is opt-in
  when identical Chromium behaviour is required.

**Consequences.** File System Access auto-save remains Chromium-only
(WebView2 on Windows may have it; macOS/Linux WebKit typically does not).
The existing `<input type="file">` / download fallbacks cover desktop. Deno
Desktop is experimental; packaging flags may change. CI stays Bun-only.

End-to-end coverage of the desktop target is `bun run e2e:desktop`. That
launches `deno desktop --backend cef` (CDP exists only on CEF, not OS
webview) and attaches Playwright via `chromium.connectOverCDP`. The runner
must use **Node** for Playwright: Bun's WebSocket client never finishes the
CEF handshake. Tests share one window, so they run sequentially with
storage cleared between cases. The default `bun run e2e` suite is unchanged
(Vite dev + a fresh Chromium).

---

## Hosting

Static `dist/` after `bun run build`. `vercel.json` sets `sw.js` /
`registerSW.js` to `Cache-Control: public, max-age=0, must-revalidate` so
clients pick up worker updates.

Desktop binaries are not hosted. Build them with `bun run desktop:build`
(requires Deno ≥ 2.9). The compiled app binds only to `127.0.0.1`.
