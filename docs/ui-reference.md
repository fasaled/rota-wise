# UI Reference — Rota-Wise

This document describes the current web UI as implemented, without interpretation.

---

## 1. Layout global

The app uses a two-column shell layout (`app-shell` CSS class): a narrow left sidebar and a scrollable main body. There is no page footer.

The shell is hidden until a file session is active; before that, only the `StartupScreen` is visible.

### 1.1 Sidebar (`<aside class="app-sidebar">`)

Fixed-width column on the left. Contains three areas, top to bottom:

**Logo area** — `ThemeIcon` + "Rota-Wise" label, separated from nav by a border.

**Navigation** — vertical stack of icon+label buttons:

| Button | Icon | Disabled when |
|---|---|---|
| Config | Settings | Never |
| Calendar | CalendarDays | No schedule |
| Weekly summary | BarChart2 | No schedule or schedule has 0 entries |
| Monthly summary | LayoutGrid | No schedule or schedule has 0 entries |

Active tab: `bg-primary text-primary-foreground`. Inactive: `text-muted-foreground`. Disabled: `opacity-40 cursor-not-allowed`.

**Bottom controls** — `LanguageSelector` (EN/ES) and `ThemeToggle` (light/dark), separated from nav by a border.

### 1.2 Main body (`div.app-body`)

Fills the remaining width. Three vertical zones:

1. **Command bar** (`<header>`) — fixed at the top, never scrolls.
2. **Warnings banner** — below the command bar, visible only on non-config tabs when warnings exist.
3. **Tab content** (`<main class="app-main">`) — scrollable area; renders one panel at a time.

---

## 2. Startup screen

Component: `StartupScreen`. Shown fullscreen (`fixed inset-0 z-50`) when no file session is active, i.e., before the user picks or creates a file. The main app shell is hidden (`display: none`) during this phase.

The startup screen shows three action cards:

| Action | Icon | Description |
|---|---|---|
| Open existing file | FolderOpen | Opens `.rw` or `.json` via File System Access API (or `<input type="file">` fallback) |
| Create new file | FilePlus2 | Opens the system save picker, creates an empty `.rw` file |
| Import as pre-assigned | Layers | Picks any `.rw`/`.json` and converts all `Work` entries to `Pre-assigned` |

**Browser compatibility warning**: if `window.showOpenFilePicker` is not available (e.g. Firefox), an amber banner is shown and file operations fall back to `<input type="file">` / browser download. A badge is also shown in the command bar for the duration of the session.

**PWA launchQueue**: if the app is installed and the user opens a `.rw` file from the OS, the file is read via `launchQueue.setConsumer` and the startup screen is bypassed automatically.

**Legacy `.json` migration**: opening a `.json` file via the supported picker triggers a second "Save As" dialog to save a `.rw` copy. If the user cancels, the original `.json` handle is used.

---

## 3. Command bar

`<header>` inside `app-body`. Always visible. Two zones: left (file info) and right (action buttons).

### 3.1 File info (left)

- File icon + file name (or "No file open" if none).
- If the open file ends in `.json` (not `.rw`): amber badge `.json`.
- If File System Access API is not supported: blue badge "unsupported browser".

### 3.2 Action buttons (right)

All buttons are `size="sm"`. Busy state (`isBusy`) = generating OR exporting — disables all buttons.

| Button | Icon | Variant | Condition to enable | Action |
|---|---|---|---|---|
| Save (Firefox only) | Download | outline | API not supported | Downloads file via browser |
| Undo | History | outline | `canUndo && !isBusy` | Reverts to previous schedule snapshot |
| Export | FileText | outline | Schedule exists | Lazy-imports `export-word.ts`, generates .docx named after the open `.rw` file |
| Clear schedule | Trash2 | destructive | Schedule exists | Opens confirmation dialog |
| Clear doctors | UserX | outline | Doctors with names exist | Opens confirmation dialog |

Export buttons show a spinner (animated `border-t-2 border-b-2 border-primary` circle) in place of the icon while processing. Labels are hidden on small screens (`hidden md:inline`).

---

## 4. Warnings banner

Visible when `scheduleWarnings.length > 0` **and** active tab is not `config`.

Amber banner below the command bar:
- `AlertTriangle` icon.
- Bold title.
- Bulleted list of warning messages.

Possible warnings (translated from algorithm output):
- `warnings.multiplePreAssignedInput` — two doctors share the same pre-assigned date.
- `warnings.uncoveredDay` — a day has no eligible doctor due to interval/monthly constraints.

---

## 5. Config tab

Renders `DataInputForm` inside a padded container. Always accessible (never disabled).

### 5.1 Global parameters

Grid of 5 fields (1 col mobile → 2 col tablet → 5 col desktop):

| # | Field | Control | Default | Validation |
|---|---|---|---|---|
| 1 | Number of doctors | `<input type="number">` | 0 | 0–20 |
| 2 | Start date | Button → Popover with Calendar | — | Required |
| 3 | End date | Button → Popover with Calendar | — | ≥ start date |
| 4 | Min interval | `<input type="number">` | 1 | 0–30 |
| 5 | Monthly shift limit | `<input type="number">` | empty | 0–31, optional |

"Number of doctors" syncs the doctor list on `onBlur`. Increasing adds empty cards; decreasing removes from the end.

### 5.2 Doctor cards

Reorderable via `@dnd-kit` drag & drop (8px threshold, keyboard supported). Each card:

- **Header**: "Doctor N" label + red delete button. Deleting decrements the count.
- **Row 1** (2 cols): Name `TextBox` (required) + "Exclude from auto-assignment" `Checkbox`.
- **Row 2** (3 cols): Vacation dates / Pre-assigned dates / Excluded dates — each a button that shows the count and opens a `Popover` with a multi-select `Calendar`.

Multi-select calendar behavior:
- Only allows dates within `[startDate, endDate]`.
- Shift+click selects a range from the last clicked date to the current one.
- Only one popover open at a time.

### 5.3 Generate button

Primary button, right-aligned, below the doctor list. Text: "Generate Schedule". Shows spinner + "Generating…" while running. Disabled if no valid doctors or if busy.

Schedule generation runs in a **Web Worker** (`src/workers/schedule.worker.ts` via `useScheduleWorker` hook), keeping the UI responsive. Falls back to synchronous execution if the worker is unavailable.

After generation:
- Schedule state is updated.
- History snapshot is saved (enables undo).
- App auto-navigates to the `calendar` tab.
- File is auto-saved to the open handle (debounced 500ms).

---

## 6. Calendar tab

Component: `ScheduleCalendarView`. Padded container.

### 6.1 Calendar header

Two rows (responsive: one row on desktop):

**Left**: calendar icon + "Guardias Calendar" title.

**Right** (controls):
- Doctor filter `Select` ("All doctors" + each doctor by name).
- Assignment type filter `Select` ("All", "Work only", "Vacations only").
- `◀` month back / month label (fixed width, centered) / `▶` month forward.
- **Fix/Unfix month** button: locks icon if month has fixed entries, unlock icon otherwise. `default` variant when fixed, `outline` otherwise.

### 6.2 Calendar grid

7-column grid. Header row: abbreviated day names by locale.

Each day cell (fixed height ~112–144px):
- `bg-card` if in current month; `bg-muted/30` if outside.
- Hover: `hover:shadow-md`.
- Drop target highlight: `ring-2 ring-blue-500`.
- Day number top-left. Today: circular primary badge.
- Entries listed below the number, with vertical scroll if needed.
- `Off` (system) entries are never rendered.

### 6.3 Assignment chips

Each entry is a rounded chip with icon + truncated doctor name:

| Type | Light bg | Dark bg | Light text | Dark text |
|---|---|---|---|---|
| `Work` | `bg-blue-200` | `bg-blue-800` | `text-blue-700` | `text-blue-300` |
| `Pre-assigned` | `bg-orange-200` | `bg-orange-800` | `text-orange-700` | `text-orange-300` |
| `Vacation` | `bg-emerald-200` | `bg-emerald-800` | `text-emerald-700` | `text-emerald-300` |

Fixed entries (`isFixed = true`): `ring-2 ring-orange-500 ring-opacity-75` + 🔒 at end of name.

### 6.4 Drag & drop

Only `Work` chips without `isFixed` are draggable (8px threshold).

During drag: source chip `opacity: 0.5`; `DragOverlay` shows a copy (rotated 3°, large shadow); drop target highlighted.

On drop:
- **Empty cell**: doctor moves to new date.
- **Cell with non-fixed doctor**: doctors swap dates.
- **Fixed entry target**: blocked; InfoBar error notification.
- Fixed chips cannot be dragged.

Result notified via `InfoBarList`.

### 6.5 Click interactions

- **Empty cell area**: opens `ManualAdjustmentDialog` to add a new assignment.
- **Work/Pre-assigned chip**: opens `ManualAdjustmentDialog` to edit.
- **Vacation chip**: shows InfoBar info notification (vacations not editable here).

### 6.6 Fix/unfix month

"Fix month" sets `isFixed = true` on all `Work` and `Pre-assigned` entries in the visible month. "Unfix month" sets them to `false`. `Vacation` and `Off` entries are not affected.

### 6.7 Legend

Three chips at the bottom: Work (blue) / Pre-assigned (orange) / Vacation (emerald).

### 6.8 Empty state

If the calendar tab is active but no schedule exists, a centered empty state is shown with icon, message, and a button to go to Config.

---

## 7. Manual adjustment dialog

Component: `ManualAdjustmentDialog`. Radix UI `Dialog`, max-width 425px.

### 7.1 Header

- Title: "Adjust Assignment — [date formatted with locale]"
- Description: "Modify existing assignment" or "Add new assignment for this day".

### 7.2 Form

Grid layout (label 1 col, control 3 cols):

**Doctor** — `Select` of all doctors. Disabled if type is `Off`. Initial: existing doctor or first in list.

**Assignment type** — `Select` with two options: `Work` and `Off`. `Pre-assigned` cannot be set here; if existing entry was `Pre-assigned`, it displays as `Work`.

**Mark as fixed** — `Checkbox` ("Preserve on regeneration"). Initial: existing `isFixed` value, or `false` for new.

### 7.3 Validations (on Save)

| Validation | Blocks save | Notification |
|---|---|---|
| `Work` with no doctor | Yes | Error |
| Doctor on vacation that day | Yes | Error |
| Doctor has that date in `excludedDates` | No (warns) | Warning |
| Min interval violated (previous shift too close) | No (warns) | Warning |
| Min interval violated (next shift too close) | No (warns) | Warning |

Notifications appear via `InfoBarList`, not inline in the form.

### 7.4 Footer

- Cancel (outline) — closes without saving.
- Save (primary) — validates and applies; closes on success with success notification.

### 7.5 Save logic

`Work` save: replaces any existing `Work`/`Pre-assigned` for that day, removes `system/Off` entries for that day.

`Off` save: removes `Work` and `Pre-assigned` for that day, preserves `Vacation`, adds `{doctorId: 'system', assignment: 'Off'}`.

---

## 8. Weekly summary tab

Component: `ScheduleSummaryTable`. Only accessible when schedule has entries.

Card with scroll-x table:

| Doctor | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |
|---|---|---|---|---|---|---|---|---|
| Dr. García | 2 | 1 | 3 | … | | | | **N** |

Counts only `Work` and `Pre-assigned`; ignores `system`. No column totals row.

---

## 9. Monthly summary tab

Component: `MonthlyWorkloadSummaryTable`. Only accessible when schedule has entries.

Card with scroll-x table:

| Doctor | Jan 2026 | Feb 2026 | … | Total |
|---|---|---|---|---|
| Dr. García | 5 | 4 | … | **15** |
| **Total** | **9** | **9** | … | **29** |

Last row (column totals) has `bg-muted/50` background and `font-semibold` text.

---

## 10. Persistence

All persistence is file-based. No `localStorage` keys for schedule data.

| When | What | How |
|---|---|---|
| Schedule generated, entry changed, undo | Full app state | Auto-saved to open file handle (debounced 500ms). Silently skipped if write permission not granted. |
| Firefox / unsupported API | Full app state | Manual download via "Save" button in command bar |
| PWA file association | On app launch | `launchQueue` API reads the file and hydrates state |

File format: `.rw` (JSON, `fileVersion: 1`). Also accepts legacy `.json` with automatic conversion prompt.

---

## 11. Undo history

`useHistory` hook (in-memory stack, not persisted). Each schedule mutation (generate, manual edit, swap, fix/unfix) pushes a snapshot. The Undo button in the command bar reverts to the previous snapshot. `canUndo` controls button enabled state.

After undo, the app navigates to the `calendar` tab (if the restored state has a schedule).

---

## 12. Notifications (`InfoBarList`)

Component: `InfoBarList` (custom, not shadcn Toaster). Fixed position: `bottom-4 right-4`, max-width `sm`, stacks vertically, slides in from the right.

Four severity levels:

| Severity | Icon | Color |
|---|---|---|
| `success` | CheckCircle2 | Emerald |
| `warning` | AlertTriangle | Amber |
| `error` | XCircle | Red |
| `info` | Info | Blue |

Each notification has: icon + title + optional description (smaller text) + dismiss (X) button. Auto-dismisses after `autoDismissMs` if set.

---

## 13. Confirmation dialogs

Two `AlertDialog` components (Radix UI) for destructive actions:

**Clear schedule** — triggered by the Trash2 button. Clears schedule state and auto-saves the empty state to the file. Does not affect form values.

**Clear doctors** — triggered by the UserX button. Sets `numberOfDoctors` to 0 and empties the doctor array. Resets the form.

---

## 14. Export — Word (.docx)

Lazy-imported on demand (`await import('@/lib/export-word')`). Button shows a spinner while processing.

Generated file matches the open `.rw` file's base name (e.g. if the file is `march_2026_schedule.rw`, the export is `march_2026_schedule.docx`). If no file is open, falls back to `rotawise-schedule_<yyyy-MM-dd>.docx`. Content begins with a centered title derived from the file name (`march_2026_schedule.rw` → `march 2026 schedule`; underscores and hyphens are replaced by spaces, extension stripped), followed by the monthly calendar tables. Visual style: minimalist — day cells with no assigned doctor carry a subtle light-blue (`#eff6ff`) tint, assigned days are clean white with a bold primary-blue day number; light-gray (`#f1f5f9`) weekday header row with bold dark uppercase letters; large font sizes (26pt day number, 22pt doctor name, 20pt weekday header, 28pt month title, 40pt document title), all set in **Inter** for a modern look. Month titles are capitalized in both English and Spanish (e.g. "Enero 2026"). A thin horizontal divider line (light gray, 0.5pt) sits between the two months that share a page. Page margins are reduced (0.25in left/right, 0.75in top/bottom) so the calendar tables span almost the full page width. Two months per page — a page break is inserted before every 3rd, 5th, 7th, etc. month. The first month on each page is pushed down (≈120pt of extra top spacing) so the two months sit closer to the vertical center of the page. The page break is emitted as a separate empty paragraph so the spacing is preserved on every page, not just the first. for readability. Page break before the 4th, 7th, 10th, etc. month enforces the 3-per-page layout. Weekday headers are localized.
