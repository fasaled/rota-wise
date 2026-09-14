# Usability decisions

This document records **why** the UI behaves as it does. For widget-level
detail see [ui-reference.md](ui-reference.md).

---

## Privacy is the default

The product is a doctor roster. Names, free days, and unit structure must not
quietly leave the device.

- No accounts, analytics, or application server.
- IndexedDB working copy in the current browser profile.
- Optional `.rw` file the user owns.
- Word export is a local download.

The “Browser only” badge is deliberate: it tells the user the roster is **not**
on disk yet. Shared computers should use **New schedule** (clears the working
copy) or a bound file they take with them.

See [privacy.md](privacy.md).

---

## Progressive file support

Chromium can bind a file handle and auto-save. Firefox and Safari cannot.

Rather than blocking those browsers (an earlier experiment), the app:

1. Always hydrates from IndexedDB.
2. Opens files with the picker **or** a hidden `<input type="file">`.
3. Saves as a download when there is no handle.
4. Shows a session-dismissible banner when the File System Access API is missing.

Opening a `.rw` from the OS into the installed PWA uses `launchQueue`.

---

## Generate is a suggestion, humans pin the truth

The algorithm is greedy and stochastic (weighted sample). Users expect to:

- Move a shift (drag a non-pinned Work chip).
- Swap two doctors (drop onto another Work chip).
- Pin a day or a whole month so regeneration keeps it.
- Mark free days from the calendar as well as the form.

Pinned entries (`isFixed`) are the contract with the generator. Regenerating
with pins present asks **Keep pinned** vs **From scratch**.

Manual edits that break the min interval or an excluded date **warn** (info
bar) instead of blocking, because the consultant in front of the calendar
often has information the form does not. Assigning work on a **free day** is
blocked — that is the one edit the UI treats as always wrong.

---

## Coverage must be visible on the calendar

Unit undercoverage is easy to miss in a warning list. Each weekday cell shows
a dot per unit:

| Colour | Meaning |
|---|---|
| Green | Tracked unit at or above its minimum |
| Amber | Some doctors present, below minimum |
| Red | Nobody present |
| Grey | Untracked unit (`minPostCallCoverage === 0`) |

Weekends and holidays hide the dots (no coverage requirement) and use a
holiday marker instead.

Tooltips stay numeric (`Ward A: 2/3`) so colour carries the status. Allied
units are mentioned in the tooltip, not as extra dots.

---

## Warnings are review, not failure

Generation almost always succeeds with a schedule object. Problems become a
banner on Calendar / Weekly / Monthly (not on Roster, where the user is still
editing inputs). The banner starts collapsed so a long list does not hide the
calendar.

Uncovered days are stored as `Off` and omitted from the grid so empty cells
mean “click to assign”, not “system placeholder”.

---

## Regeneration should not feel stuck

Identical inputs + greedy “always pick the max score” produced the same rota
every time. Weighted sampling (every eligible doctor can win, higher scores
more often) lets **Generate** be tried again when the first draw is awkward,
without weakening hard rest/coverage rules.

---

## Roster is an editor, not a wizard

There is no multi-step wizard. One Roster tab holds:

- Period, min interval, optional monthly cap, holidays
- Units (optional)
- Doctor cards (name, unit, free / pre-assigned / excluded dates, cover periods)

Doctors are added with a button and reordered with `@dnd-kit` (pointer +
keyboard). Shift+click on calendars selects a date range — roster entry is
mostly multi-select dates, so range selection is a first-class shortcut.

Units are optional: a user who only needs a fair on-call list never has to
learn coverage. Empty-state copy says so.

---

## Four tabs, disabled until they mean something

| Tab | Enabled |
|---|---|
| Roster | Always |
| Calendar | After a schedule exists |
| Weekly / Monthly summaries | After the schedule has entries |

Summaries can filter by date range so a quarter view is possible without
regenerating. They count Work + Pre-assigned only.

---

## Session undo, not file history

Undo in the command bar walks an in-memory stack (generate, drag, pin, manual
assign). It does not survive reload and is not written to `.rw`.

That matches “I misplaced a shift” rather than “I want named versions”. The
file format still has a `versions` array for a future manager; the current UI
does not expose it.

---

## Language and theme are chrome, not content

EN/ES and light/dark/system live in the sidebar footer so they are reachable
from every tab and never mixed with roster fields. Language preference and
theme are the only `localStorage` keys; roster data is not stored there.

Theme is applied in a tiny inline script in `index.html` before paint to avoid
a flash.

---

## Offline after first visit

The PWA precaches the shell and chunks. After install, generating and editing
a roster does not need the network. The first visit still needs to download
the app.

---

## Export is for sharing, `.rw` is for working

Word calendars are what departments print or email. They are not round-tripped.
The working artefact is `.rw` (JSON). Export is lazy-loaded so the `docx`
library is not on the critical path.

---

## Empty and busy states

- First launch: Roster, empty list, no splash screen (a short hydration
  spinner only).
- Calendar with no schedule: empty state + button back to Roster.
- Generate / export: command-bar actions disable under `isBusy`; the generate
  button shows a spinner.

---

## Accessibility notes (current bar, not a claim of WCAG)

- Icon+label nav; disabled tabs use `disabled` + reduced opacity.
- Doctor cards expose a keyboard drag handle via dnd-kit sensors.
- Coverage dots have `title` and `aria-label`.
- Info-bar messages can be dismissed; some auto-dismiss.
- File menu uses a native-accessible dropdown (`File` / `Archivo`).

Known gaps (not hidden): some calendar chips are pointer-first; coverage dots
are small (hit target padded with a pseudo-element). Improvements welcome.
