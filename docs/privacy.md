# Privacy

Rota-Wise is designed so that **staff rosters never need to leave the device**.

This is not a legal privacy policy for a hosted deployment. If you deploy the
app on your own domain, you are responsible for that site’s policy. The notes
below describe what the **application code** does.

---

## No application backend

The repo is a static SPA. There are no API routes, no user accounts, and no
first-party analytics in the source.

A host (Vercel, Netlify, GitHub Pages, …) will still see ordinary HTTPS
requests for static assets (HTML, JS, CSS, fonts, icons). That is hosting
telemetry, not roster data.

---

## What is stored locally

| Location | Contents |
|---|---|
| IndexedDB `rotawise` | Working copy of the `.rw` JSON (doctors, units, schedule, warnings) |
| File System Access handle (Chromium) | Optional path to a `.rw` file the user chose; subsequent edits auto-save |
| `localStorage` | UI chrome only: language (`rotawise` language key) and theme (`rotawise-theme` / legacy `theme`) |
| `sessionStorage` | Dismissal of the “no disk auto-save” banner |
| Downloads | `.rw` JSON and `.docx` Word calendars the user explicitly exports |

Clearing site data in the browser removes the working copy. **New schedule**
also clears the IndexedDB copy and unbinds any file handle (the file on disk
is not deleted).

---

## What is not collected

The application code does not send doctor names, dates, or schedules to a
server. Word export and schedule generation run in the tab (generation inside
a Web Worker).

Third-party scripts are the npm dependencies bundled at build time (React,
date-fns, Radix, `docx`, Workbox, …), not runtime calls to those vendors.

---

## Service worker

`src/sw.ts` precaches the app shell so the UI works offline. It does not upload
IndexedDB contents. Empty `push` / `sync` / `periodicsync` listeners exist for
PWA completeness; the app does not register a push subscription.

---

## Medical / operational disclaimer

Rota-Wise is a planning aid. It is **not** a certified medical device and does
not replace departmental rules or human review. Generated rotas can leave days
uncovered or violate soft fairness targets; warnings exist so a person can
fix them.

Do not commit real rosters to the repository. Use synthetic names in tests
and screenshots.
