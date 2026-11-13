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

The app is intended to be installed as a PWA so the shell and JS can be served
from the device after the first visit. Roster data stays in the browser’s
IndexedDB / a user-chosen `.rw` file in both cases.

---

## What is stored locally

| Location | Contents |
|---|---|
| IndexedDB `rotawise` | Working copy of the `.rw` JSON (doctors, units, schedule) |
| File System Access handle (Chromium) | Optional path to a `.rw` file the user chose; subsequent edits auto-save |
| `localStorage` | UI chrome only: language (`rotawise` language key) and theme (`rotawise-theme` / legacy `theme`) |
| `sessionStorage` | Dismissal of the “no disk auto-save” banner; a one-shot flag used to reload once after an app update |
| Downloads | `.rw` JSON and `.docx` Word calendars the user explicitly exports |

Clearing site data in the browser removes the working copy. **New schedule**
also clears the IndexedDB copy and unbinds any file handle (the file on disk
is not deleted).

---

## The one optional download

**Import official holidays** (Roster tab) fetches the public work calendar
published by Open Data Euskadi (`opendata.euskadi.eus`, Basque Government).

- It happens **only when the button is pressed**, never on load or in the
  background.
- It is a plain `GET` of a public JSON file, one per year of the schedule
  period. No roster data, cookies or referrer are sent; as with any web
  request, the publisher sees the IP address and the year requested.
- The result is filtered and stored locally like any other holiday.

This is the only request the app makes to another origin.

---

## What is not collected

The application code does not send doctor names, dates, or schedules to a
server. Word export and schedule generation run in the tab (generation inside
a Web Worker).

Third-party scripts are the npm dependencies bundled at build time (React,
date-fns, Radix, `docx`, Workbox, …), not runtime calls to those vendors.

---

## Service worker

`src/sw.ts` precaches the app shell so the UI works offline, and does nothing
else: no push, no background sync, no uploads.

---

## Enforced by the browser, not only by intent

The hosted app is served with a Content-Security-Policy
(`default-src 'self'; script-src 'self'; connect-src 'self' https://opendata.euskadi.eus; …`,
see `vercel.json`). The browser therefore refuses to load scripts from any
other origin, and to send requests anywhere except the app itself and the
holiday source above, even if a dependency tried to. The page cannot
be framed by other sites (`frame-ancestors 'none'`), and the `Referrer-Policy`
keeps the address out of outgoing links.

---

## Medical / operational disclaimer

Rota-Wise is a planning aid. It is **not** a certified medical device and does
not replace departmental rules or human review. Generated rotas can leave days
uncovered or violate soft fairness targets; warnings exist so a person can
fix them.

Do not commit real rosters to the repository. Use synthetic names in tests
and screenshots.
