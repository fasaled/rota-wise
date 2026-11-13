# UI reference

Describes the web UI as implemented. Interaction rationale lives in
[usability.md](usability.md).

---

## 1. Global layout

Two-column shell (`app-shell`): a narrow left sidebar and a scrollable main
body. No page footer. The page has one visually hidden `<h1>`; each tab's
sections use `<h2>`.

Under 640 px the sidebar becomes a bottom navigation bar (respecting the
device safe area) and the calendar switches to an agenda list (section 6.2).

The shell is visible after a short hydration spinner. An empty roster is shown
unless a previous IndexedDB working copy (or a PWA `launchQueue` file) is
restored.

### 1.1 Sidebar (`AppSidebar`)

Fixed-width column. Three bands, top to bottom:

**Logo** — favicon + “Rotawise” wordmark.

**Navigation** — icon + label:

| Tab (label) | Internal id | Disabled when |
|---|---|---|
| Roster | `config` | Never |
| Calendar | `calendar` | No schedule |
| Weekly summary | `weekly` | No schedule or 0 entries |
| Monthly summary | `monthly` | No schedule or 0 entries |

**Bottom** — language selector (EN / ES), theme toggle (light / dark / system),
and a “Source code” link (AGPL corresponding-source offer). On phones this band
is hidden and the same three controls live in a **More** menu at the end of
the bottom bar.

The active tab carries `aria-current="page"`.

### 1.2 Main body

1. **Command bar** — sticky header, never scrolls with content.
2. **File-system banner** — only when File System Access is missing; session-dismissible.
3. **Warnings banner** — non-Roster tabs, when there are warnings.
4. **Tab content** — one panel at a time.

---

## 2. Session start

1. If PWA `launchQueue` provides a `.rw` file, load it.
2. Else if IndexedDB has a working copy, restore it (toast “Welcome Back” when non-empty).
3. Else Roster tab, empty roster.

**File menu** (command bar, left): New schedule, Open, Save to file / Save as.

- **New schedule** — confirm, then clear roster, calendar, undo history, IndexedDB copy, and unbind any handle (disk file is not deleted).
- **Open** — File System Access picker when available, otherwise `<input type="file">`. Confirms if the current copy is not empty. A `.rw` file can also be **dropped** anywhere on the window (same confirmation).
- A file that is not valid (not JSON, not a Rotawise file, written by a newer version, or with unreadable data) is rejected with a specific message and the current roster is left untouched.
- **Save to file** — Chromium: save picker, bind handle, later edits auto-save. Other browsers: download `.rw`, stay in browser-only mode.

**Browser only** badge: no bound handle.

**PWA launchQueue:** opening `.rw` from the OS hydrates that file.

**Legacy `.json`:** opening `.json` in a supporting picker may prompt Save As `.rw`.

---

## 3. Command bar

Left: file menu (icon + file name or “No file open” + chevron). Blue “Browser only” badge when unbound.

Right, all `size="sm"`. Busy state (generating or exporting) disables actions.

| Button | Enabled when | Action |
|---|---|---|
| Generate | At least one named doctor, not busy | Validates the roster form. If something is missing, switches to Roster, scrolls to the first field with an error and shows a toast. Otherwise runs the worker; if pinned entries exist, asks Keep pinned / From scratch. This is the only Generate button. |
| Undo | History non-empty, not busy | Restores the previous snapshot. Also `Ctrl/Cmd+Z`. |
| Redo | Something was undone, not busy | Re-applies it. Also `Ctrl/Cmd+Shift+Z` or `Ctrl+Y`. |
| Export | A schedule exists | Menu → “Export as Word”: lazy-imports `export-word.ts`, downloads `.docx`. |
| Clear doctors | Doctors exist | Confirmation, then empties the doctor list (undoable). |

The keyboard shortcuts are ignored while the focus is in a text field, so the
browser's own undo keeps working there.

If the bound file can no longer be written (the browser revoked permission),
an **Auto-save paused** button appears next to the file name; pressing it asks
for permission again and saves. The browser copy keeps being saved meanwhile.

If generation fails, the previous schedule stays in place.

Export shows a spinner while `docx` runs. Labels hide on small screens
(`hidden md:inline`).

---

## 4. Warnings banner

Visible when there is at least one warning **and** the active tab is not Roster.

Amber bar: icon, title, count, collapsible bulleted list (starts collapsed;
the toggle exposes `aria-expanded`).

Warnings are always computed from the current roster and schedule, in the
current language. Shifts of doctors who were removed from the roster are
reported here too.

Strings come from algorithm keys (`warnings.*`) translated in the locale files,
plus coverage warnings (`warnings.postCallUncovered`).

---

## 5. Roster tab

`DataInputForm` in a padded container. Always enabled. Sidebar label: “Roster”.

### 5.1 Global parameters

| Field | Control | Default | Validation |
|---|---|---|---|
| Start / end dates | Popover calendar (range) | — | Required; end ≥ start |
| Min interval | number | 1 | 0–30 |
| Monthly shift limit | number | empty | 0–31, optional |
| Strict limit | checkbox | off | When on, the generator never exceeds the monthly limit, even if a day stays unassigned |
| Holidays | Multi-select calendar | none | Units need no minimum staffing on these dates (like a weekend); the on-call shift is still assigned |

Below the holiday picker:

- The selected holidays as chips, each with a remove button.
- **Import official holidays · Donostia / San Sebastián** — downloads the
  official work calendar from Open Data Euskadi for every year of the schedule
  period and adds the days that apply to the city (Basque Country, Gipuzkoa and
  local holidays) and fall inside the period. Disabled until a period is set.
  Nothing is downloaded until the button is pressed. Imported days are merged
  with the ones already there and are ordinary holidays afterwards: they can
  be removed from the chips or edited in the picker, and importing again never
  duplicates them. A status line says how many were added, whether a year is
  not published yet, or that the download failed (the list is left untouched).

### 5.2 Units (optional)

Card list. Each unit: name, `minPostCallCoverage` (0 = untracked), allied-unit
checkboxes. Removing a unit also removes it from other units' alliances and
from the doctors who belonged to it or covered it. “Add unit” appends an empty card. Empty-state copy explains that
units can be skipped.

### 5.3 Doctor cards

Reorderable with `@dnd-kit` from the **drag handle** in the header only (8 px
threshold; keyboard: focus the handle, Space, arrows), so text can be selected
and fields used normally. Each card:

- Header: handle, number, name + delete.
- Name (required) and “Exclude from automatic assignment”.
- Unit select (`No unit` = free agent).
- Free dates / Pre-assigned dates / Excluded dates — buttons opening a
  multi-select calendar limited to `[startDate, endDate]`. Shift+click selects
  a range.
- Optional cover-assignment rows: destination unit + date range.

“Add doctor” appends a card. Validation messages appear under the field they
refer to, in the current language.

Editing the roster while a schedule exists is safe: the calendar, summaries
and warnings follow the form immediately. Shifts of a removed doctor stay on
the calendar as “Removed doctor” until they are reassigned or the schedule is
regenerated.

After a successful generate: history snapshot, navigate to Calendar, persist
(debounced 500 ms).

---

## 6. Calendar tab

`ScheduleCalendarView`.

### 6.1 Header

Title “Generated schedule”. Controls:

- Filter bar (`CalendarFilterBar`) — additive filters by doctor and/or
  assignment type (Work, Free, Pre-assigned, Excluded).
- Previous / next month.
- Fix / Unfix month — pins or unpins all Work and Pre-assigned entries in the
  visible month. Vacations/free days and Off are unchanged.

### 6.2 Grid

Seven columns, locale-abbreviated weekday headers. Weekend and holiday cells
use distinct styling; holidays show a flag marker + tooltip. Days outside the
schedule period are read-only.

**Phones (under 640 px):** the month is an agenda — one row per day of the
period with the weekday, the day number and the same chips and pickers. Drag
and drop is off there; shifts are changed through the pickers.

Each cell:

- Day number (today = primary badge).
- Unit coverage dots on weekdays that are not holidays (see usability doc).
  Each level has its own shape as well as colour, so it does not rely on
  colour alone.
- Assignment chips. `Off` / `system` entries are not rendered.
- Empty cells are click targets to assign a doctor.

### 6.3 Chips

| Type | Appearance |
|---|---|
| Work | Blue chip, doctor name |
| Pre-assigned | Orange chip |
| Free | Emerald chip |
| Excluded | Dashed muted chip (marker, not a shift) |

Pinned Work entries show a lock control on the cell.

### 6.4 Drag and drop

Only **non-fixed Work** chips are draggable (8 px threshold). Disabled while a
doctor filter is active (info-bar hint).

| Drop target | Result |
|---|---|
| Empty cell | Move the doctor |
| Cell with a non-fixed Work chip | Swap |
| Pinned target | Blocked, error toast |
| Free / excluded for that doctor | Blocked, error toast |

### 6.5 Other clicks

- Empty cell / Work chip: day selector (searchable doctor list) or clear
  assignment. The list is a keyboard-operable listbox: type to filter,
  arrows / Home / End to move, Enter to choose, Escape to close. Doctors who
  cannot take that day are shown disabled with the reason (free day, excluded,
  adjacent shift, post-call) — the same rules the generator applies.
- Free chip: not edited here when the toast path is used; free days can also be
  toggled from the calendar via `applyToggleFreeDayOnSchedule`.
- Lock control: toggle `isFixed` on that day’s work assignment.

### 6.6 Legend

Work, Free, Pre-assigned, Excluded, plus coverage colours (OK / partial / none).

### 6.7 Empty state

If the tab is active with no schedule: icon, copy, button to Roster.

---

## 7. Weekly summary

`ScheduleSummaryTable`. Rows = doctors, columns = Mon–Sun + total.
Counts Work + Pre-assigned. Optional date-range filter; Reset restores the
full schedule span.

---

## 8. Monthly summary

`MonthlyWorkloadSummaryTable`. Rows = doctors, columns = months + total, plus a
totals row. Same date-range filter as weekly.

---

## 9. Notifications (`InfoBarList`)

Fixed bottom-right stack (above the navigation bar on phones). Errors are
announced as alerts, everything else as polite status messages. Severities: success (emerald), warning (amber),
error (red), info (blue). Optional auto-dismiss.

Used for generate/load/save, drag results, interval warnings on manual edits,
and blocked actions.

---

## 10. Confirmation dialogs

| Dialog | Trigger |
|---|---|
| New schedule | File menu |
| Replace current schedule | Open while a non-empty copy exists |
| Clear doctor details | Command bar |
| Regenerate | Generate while pinned entries exist (Keep pinned / From scratch) |

---

## 11. Word export

Lazy `import('@/lib/export-word')`. Filename matches the bound `.rw` base name,
or `rotawise-schedule_<yyyy-MM-dd>.docx`. Content: title from the file name
(or a translated default when no file is bound),
then monthly calendar tables, two months per page, localized weekday headers,
Inter-like sizing defined in `export-word.ts`. Not round-tripped back into the app.

---

## 12. Persistence (user-visible)

| Event | Storage |
|---|---|
| Any roster change | IndexedDB working copy (debounced 500 ms; flushed when the tab is hidden or closed) |
| Same, with a bound handle | Also write the `.rw` file |
| Unsupported File System Access | Manual download via Save |
| PWA file association | `launchQueue` on launch |

Undo / redo history is **not** persisted.

If the app hits an unexpected error it shows a recovery screen with a reload
button; the working copy in IndexedDB is not affected.
