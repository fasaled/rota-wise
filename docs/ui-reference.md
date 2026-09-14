# UI reference

Describes the web UI as implemented. Interaction rationale lives in
[usability.md](usability.md).

---

## 1. Global layout

Two-column shell (`app-shell`): a narrow left sidebar and a scrollable main
body. No page footer.

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
and a “Source code” link (AGPL corresponding-source offer).

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
- **Open** — File System Access picker when available, otherwise `<input type="file">`. Confirms if the current copy is not empty.
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
| Generate | At least one named doctor, not busy | Runs the worker. If pinned entries exist, asks Keep pinned / From scratch. |
| Undo | History stack non-empty, not busy | Restores previous schedule snapshot; jumps to Calendar if the snapshot has a schedule. |
| Export | A schedule exists | Lazy-imports `export-word.ts`, downloads `.docx`. |
| Clear doctors | Named doctors exist | Confirmation, then empty the roster form. |

Export shows a spinner while `docx` runs. Labels hide on small screens
(`hidden md:inline`).

---

## 4. Warnings banner

Visible when there is at least one warning **and** the active tab is not Roster.

Amber bar: icon, title, collapsible bulleted list (starts collapsed).

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
| Holidays | Multi-select calendar | none | No coverage required on these dates |

### 5.2 Units (optional)

Card list. Each unit: name, `minPostCallCoverage` (0 = untracked), allied-unit
checkboxes. “Add unit” appends an empty card. Empty-state copy explains that
units can be skipped.

### 5.3 Doctor cards

Reorderable with `@dnd-kit` (8 px threshold, keyboard). Each card:

- Header: “Doctor N” + delete.
- Name (required) and “Exclude from automatic assignment”.
- Unit select (`No unit` = free agent).
- Free dates / Pre-assigned dates / Excluded dates — buttons opening a
  multi-select calendar limited to `[startDate, endDate]`. Shift+click selects
  a range.
- Optional cover-assignment rows: destination unit + date range.

“Add doctor” appends a card. Generate is also available at the bottom of the
form (same worker path as the command bar).

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
use distinct styling; holidays show a marker + tooltip.

Each cell:

- Day number (today = primary badge).
- Unit coverage dots on weekdays that are not holidays (see usability doc).
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

- Empty cell / Work chip: day selector (searchable doctor list) or clear assignment.
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

Fixed bottom-right stack. Severities: success (emerald), warning (amber),
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
or `rotawise-schedule_<yyyy-MM-dd>.docx`. Content: title from the file name,
then monthly calendar tables, two months per page, localized weekday headers,
Inter-like sizing defined in `export-word.ts`. Not round-tripped back into the app.

---

## 12. Persistence (user-visible)

| Event | Storage |
|---|---|
| Any roster change | IndexedDB working copy (debounced 500 ms) |
| Same, with a bound handle | Also write the `.rw` file |
| Unsupported File System Access | Manual download via Save |
| PWA file association | `launchQueue` on launch |

Undo history is **not** persisted.
