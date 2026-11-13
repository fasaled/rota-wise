# Architecture

Rota-Wise is a **Vite 6 + React 19 SPA**. There is no SSR, no API, and no
application backend. The scheduler, the file format, IndexedDB, and Word
export all run in the client (a browser tab or an installed PWA).

Entry: `src/main.tsx` → `src/rotawise-page.tsx`. The same `dist/` output runs
in any modern browser and as an installable PWA.

Path alias: `@/*` → `src/*`.

---

## Module map

```
src/
├── main.tsx                     Providers (theme, language, file system), error boundary, render
├── rotawise-page.tsx            Orchestrator: wires the hooks below to the UI
├── components/rotawise/         App shell, command bar, banners, summaries
│   ├── calendar/                Day cell, pickers, coverage dots, drag-and-drop, chip styles
│   ├── form/                    Doctor / unit cards, date pickers, cover editor, field errors
│   └── app-error-boundary.tsx   Last-resort screen; the roster stays in IndexedDB
├── components/ui/               shadcn/ui (do not edit by hand)
├── context/                     Language, theme, File System Access
├── hooks/
│   ├── use-schedule-document.ts     Single source of truth + undo / redo
│   ├── use-document-persistence.ts  Debounced save to IndexedDB and the bound file
│   ├── use-schedule-worker.ts       Promise API over the scheduling worker
│   ├── use-history.ts               Generic undo / redo stacks
│   ├── use-undo-shortcuts.ts        Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y
│   ├── use-file-drop.ts             Drag a .rw file onto the window
│   └── use-media-query.ts, use-debounced-callback.ts, use-info-bar.ts
├── lib/
│   ├── schedule-generator.ts    Attempts: greedy pass + repair, best-of-N
│   ├── schedule-eligibility.ts  Per-doctor hard rules (generator + calendar picker)
│   ├── schedule-coverage.ts     Post-call, alliances, availability
│   ├── schedule-analyze.ts      Warnings after generation / edits
│   ├── schedule-edits.ts        Pure calendar mutations
│   ├── schedule-interval.ts     Neighbour / min-interval helpers
│   ├── schedule-storage.ts      .rw validate / serialize / deserialize / migrate
│   ├── schedule-warnings.ts     Warning keys → translated strings
│   ├── schedule-form-schema.ts  Zod form schema (messages are i18n keys)
│   ├── dates.ts                 Calendar-day keys and parsing (`yyyy-MM-dd`)
│   ├── random.ts                Seedable PRNG
│   ├── i18n.ts                  Typed translation keys, `translate`, language detection
│   ├── theme.ts                 Theme storage and resolution
│   ├── browser-storage.ts       IndexedDB working copy
│   ├── export-word.ts           Lazy-loaded .docx
│   └── types.ts                 Domain types + CURRENT_FILE_VERSION
├── workers/schedule.worker.ts   Off-main-thread generateSchedule
├── locales/                     en.json, es.json (flat keys, same set in both)
└── sw.ts                        Workbox injectManifest service worker
public/
└── theme-init.js                Theme + lang before first paint (external because of the CSP)
```

Pure functions live in `src/lib/` so the algorithm and file format can be
tested without the DOM.

### One document, everything else derived

`useScheduleDocument` holds exactly three things: `schedule`, `formValues` and
`currentMinInterval`. Doctors, units, holidays, warnings and the saved file are
**derived** from them with `useMemo`; nothing else is stored. This is what
keeps the calendar, the summaries, the warnings and the `.rw` file from ever
disagreeing with the roster form.

The form is uncontrolled (react-hook-form). It reports every change with a
**snapshot** of its values (react-hook-form mutates its own object in place),
and is re-mounted with a new `key` only when something other than typing
replaces the roster: open, new, undo/redo of a change that touched the roster.

---

## Runtime data flow

1. Hydration: PWA `launchQueue` file, else IndexedDB working copy, else empty roster.
2. Roster tab edits flow through react-hook-form + Zod into
   `useScheduleDocument.setFormValues` (not recorded in history).
3. **Generate** validates the form, then posts
   `{ formValues, existingFixedEntries, options: { attempts: 24 } }` to the worker.
4. The worker returns `{ schedule, warnings?, seed?, error? }`. On error the
   previous schedule is kept and the error is shown.
5. The page commits the schedule (one undo step) and navigates to Calendar.
6. Calendar edits go through `src/lib/schedule-edits.ts` and are committed the
   same way. Warnings are recomputed from the document by
   `buildScheduleWarnings`; they are never stored.
7. `useDocumentPersistence` saves the derived `AppFileData` 500 ms after the
   last change (IndexedDB always; disk if a file handle is bound), and flushes
   immediately when the tab is hidden or closed.

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
`generateSchedule` directly. Requests carry an id, so overlapping calls
resolve independently. If the worker crashes, every pending request is settled
with an error and a fresh worker is created on the next request; there is no
synchronous fallback — worker availability is required.

### ADR 3 — Dual persistence (IndexedDB + optional file)

**Context.** Chromium implements the File System Access API; Firefox and Safari
do not (or not enough for a bound, auto-saved handle). Users still need a
working copy between visits.

**Decision.**

- Always write a working copy to IndexedDB (`rotawise` / `kv` / `workingCopy`).
- When the user picks **Save to file** in a supporting browser, bind a
  `FileSystemFileHandle` and auto-save on change (500 ms debounce).
- Elsewhere, **Save** downloads a `.rw` blob. **Open** uses `<input type="file">`.

- Opening, dropping or starting a new roster **suspends** persistence until the
  new document and its file binding are both in place, so the old roster can
  never be written into the newly opened file.
- If the browser revokes write permission, auto-save to the file pauses
  (`FilePermissionError`) and the command bar offers to re-enable it; the
  IndexedDB copy keeps being written meanwhile.
- Files are validated before they replace anything (`RotawiseFileError`).

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
`autoUpdate`. Generated `public/sw.js` is gitignored. The worker does nothing
else: no push, no background sync. Store screenshots and OS-only icons are
left out of the precache.

A tab still running an old bundle after an update can ask for a chunk that no
longer exists; `main.tsx` listens for `vite:preloadError` and reloads once.

**Consequences.** Offline works for the app shell and JS. Roster data is
already local, so offline scheduling works. Manifest file handlers let the OS
open `.rw` files into the PWA (`launchQueue`).

### ADR 8 — English / Spanish in a React context

**Context.** The original users are bilingual (ES/EN). A full i18n framework is
heavier than two JSON files.

**Decision.** `language-context.tsx` plus `src/locales/{en,es}.json`, with the
framework-free parts in `src/lib/i18n.ts`. The initial language is `?lang=` in
the URL, then the stored preference, then the browser language. Algorithm
`dayOfWeek` stays English; the UI translates. The provider keeps
`<html lang>`, the title, the description and the canonical link in step with
the active language.

**Consequences.** Every new string needs both files. Keys are flat and typed
(`TranslationKey = keyof en.json`), so a missing or misspelt key is a compile
error, and a unit test checks both files have the same keys and placeholders.
Warning and validation keys are stable ids, not display text.

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
Prefer extending `e2e/core-journeys.playwright.ts`,
`e2e/coverage-derivation.playwright.ts` or `e2e/regressions.playwright.ts`
(one test per fixed bug: roster edits with a schedule, redo, keyboard picker,
phone layout) over adding enzyme-style tests.

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

### ADR 13 — Undo and redo are in-memory only

**Context.** Users need to revert a bad drag or regenerate. Persisting a full
history stack into `.rw` would grow files and complicate merge semantics.

**Decision.** `useHistory` keeps up to 50 snapshots in RAM, with a redo stack
that is cleared by any new change. A snapshot holds the schedule and, only for
changes that also touched the roster (for example "clear doctor details"), the
form values. Typing in the roster form is not an undo step. History is empty
after reload. Persistence always stores the *current* roster.

**Consequences.** Document this in the UI mental model: undo is a session tool,
not a version control system. The `.rw` `versions[]` field exists for named
snapshots but the current UI does not expose a version manager
(`fileVersions` stays `[]`).

---

### ADR 14 — Strict Content-Security-Policy

**Context.** The app handles staff rosters and has no reason to talk to any
other origin or run any script it did not ship.

**Decision.** `vercel.json` sends
`default-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; …`
plus `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS and
`X-Frame-Options: DENY`.

**Consequences.** No inline scripts: the pre-paint theme script is
`public/theme-init.js` and the service-worker registration is the external
`registerSW.js`. `style-src` keeps `'unsafe-inline'` because Radix and
`style` attributes need it. Adding a third-party script, font or API means
changing the policy on purpose. Other hosts must send equivalent headers
themselves.

---

## Hosting

Static `dist/` after `bun run build`. `vercel.json` sets the security headers
above, `Cache-Control: public, max-age=0, must-revalidate` for `sw.js`,
`registerSW.js`, `theme-init.js` and `manifest.json` so clients pick up
updates, and a one-year `immutable` cache for the hashed files in `/assets/`.

SEO is static: `index.html` carries the title, description, Open Graph /
Twitter tags, `hreflang` links for `/?lang=en` and `/?lang=es`, JSON-LD
(`WebApplication`) and a no-JavaScript message; `public/robots.txt` points at
`public/sitemap.xml`.

The same `dist/` is the installable PWA — point `PWABuilder` (or any static
host) at `dist/`; no second build target.
