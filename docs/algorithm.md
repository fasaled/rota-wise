# Scheduling Algorithm — Complete Specification

This document describes the scheduling algorithm implemented in Rota-Wise (`src/lib/schedule-generator.ts`).

---

## 1. Algorithm Overview

The algorithm uses a **scoring-based approach** to distribute work days among doctors. It distinguishes between:

- **Hard constraints**: Always enforced during assignment. Failure to comply makes a doctor ineligible.
- **Soft restrictions**: Used as scoring factors to guide selection. When violated, they generate warnings but do not block assignment.

**The only absolute hard constraint is: no doctor can be assigned to consecutive work days.**

---

## 2. Algorithm Inputs

### 2.1 Global Schedule Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `startDate` | Date | Yes | First day of the planning period |
| `endDate` | Date | Yes | Last day of the planning period |
| `minIntervalBetweenWorkDays` | Integer ≥ 0 | No (default: 1) | Minimum rest days **between** two consecutive work assignments for the same doctor. With value 1, a doctor cannot work two days in a row. With value 0, consecutive days are allowed. |
| `globalMonthlyShiftLimit` | Integer ≥ 0 | No | **Soft** maximum work shifts per doctor per calendar month. All doctors share this limit. If omitted or 0, no limit applies. |

### 2.2 Doctor List

Up to 20 doctors. Each doctor has:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | Unique string | Yes | Internal doctor identifier |
| `name` | string | Yes | Display name in the schedule |
| `vacationDates` | Date[] | No | Days when the doctor is on vacation. Creates a `Vacation` entry but does NOT count as work. |
| `preAssignedWorkDates` | Date[] | No | Days already assigned to this doctor. Count as work for statistics and interval calculations. |
| `excludedDates` | Date[] | No | Days when the doctor is unavailable. Creates no entry; simply excludes from selection that day. |
| `isExcludedFromAutomaticAssignment` | boolean | No (default: false) | If true, the doctor is never auto-assigned. Can only appear via `preAssignedWorkDates` or manual fixed entries. |

### 2.3 Pre-existing Fixed Entries (`existingFixedEntries`)

Optional list of `ScheduleEntry` marked with `isFixed = true`. These are manual assignments the algorithm preserves unchanged. They are incorporated before the main loop and their statistics are initialized before automatic assignment begins.

---

## 3. Output Data Model

Each day generates one or more `ScheduleEntry`:

| Field | Type | Possible Values |
|---|---|---|
| `date` | Date | Day this entry corresponds to |
| `doctorId` | string | Doctor ID, or `"system"` for uncovered days |
| `assignment` | enum | `Work`, `Pre-assigned`, `Vacation`, `Off` |
| `dayOfWeek` | string | Full day name in English (e.g., `"Monday"`) |
| `isFixed` | boolean | `true` if manually fixed and not to be altered |

**Assignment semantics:**
- `Work` — Automatically assigned shift.
- `Pre-assigned` — Shift from doctor's `preAssignedWorkDates`.
- `Vacation` — Doctor is on vacation that day.
- `Off` — No coverage (no eligible doctor could be assigned).

A single day can have **multiple entries** (e.g., several doctors on vacation plus one working).

---

## 4. Internal Statistics Maintained Per Doctor

During execution, the algorithm maintains real-time statistics for each doctor:

| Statistic | Description |
|---|---|
| `totalWorkdays` | Total work shifts accumulated across the entire period |
| `workloadByDayOfWeek` | Shift count by day of week (`Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`) |
| `monthlyWorkdays` | Shift count by month (`yyyy-MM`) |
| `weekendDaysThisMonth` | Weekend shift count by month (Friday, Saturday, Sunday) |
| `lastWorkDay` | Date of last work shift (for measuring idle time) |

Statistics are initialized considering:
- Fixed entries (`existingFixedEntries`) falling within the period.
- `preAssignedWorkDates` before `startDate` (only for calculating initial `lastWorkDay`).

---

## 5. Main Algorithm Flow

The algorithm iterates **day by day** from `startDate` to `endDate` chronologically.

```
For each day D in [startDate, endDate]:

  1. Check if D has a fixed entry → if so, record it and advance.
  2. Record vacation entries for all doctors with D in vacationDates.
  3. Record Pre-assigned entries for all doctors with D in preAssignedWorkDates
     (update statistics).
  4. If no pre-assignment or fixed entry covers D:
       a. Filter eligible doctors (see section 5).
       b. If there are eligible doctors → score them (see section 6)
          → assign the highest-scoring doctor → update statistics.
       c. If no eligible doctors → record Off entry + generate uncovered day warning.
```

### Note on days with pre-assignments

If a day already has at least one `Pre-assigned` entry, the algorithm **does not** attempt to automatically assign another doctor for that same day. Each day receives exactly **one work assignment** (either automatic, pre-assigned, or fixed), unless no one is available (`Off`).

---

## 6. Hard Constraints (Eligibility Filters)

A doctor is eligible for day D if and only if they pass ALL of:

### 6.1 Not on vacation
D must not be in the doctor's `vacationDates`.

### 6.2 Not excluded that day
D must not be in the doctor's `excludedDates`.

### 6.3 Not excluded from automatic assignment
`isExcludedFromAutomaticAssignment` must be `false`.

### 6.4 No consecutive work days (absolute hard constraint)
The natural day difference between D and **any other committed work day** must be **strictly greater than 1**.

Committed work days include:
- All `preAssignedWorkDates` (including future dates not yet processed).
- All fixed entries `Work` or `Pre-assigned` in `existingFixedEntries`.
- All `Work` or `Pre-assigned` entries already generated in the current schedule.

Formula: `|D - existingWork| > 1` for all existing work days.

---

## 7. Soft Restrictions (Scoring Factors)

The following restrictions are **NOT** enforced as eligibility filters. Instead, they influence the score that determines doctor selection. When violated, they generate **warnings** but do not prevent assignment.

### 7.1 Minimal interval between work days (soft)
The user-configured `minIntervalBetweenWorkDays` is scored as a factor. Doctors who maintain larger intervals score higher.

### 7.2 Global monthly shift limit (soft)
If `globalMonthlyShiftLimit` is set, exceeding it generates a warning but does not block assignment. Doctors approaching or exceeding the limit receive lower scores.

### 7.3 Day-of-week balance (soft)
For the day of week of D (e.g., Monday), the algorithm calculates the global average of shifts on that day. Doctors with the largest **deficit** compared to that average receive higher scores.

```
deficit(doctor, dayOfWeek) = globalAverage(dayOfWeek) - doctorShifts(dayOfWeek)
```

Higher deficit → higher priority.

### 7.4 Preferred day balance (soft, higher weight)
**Thursday, Friday, Saturday, and Sunday** are prioritized. Doctors underrepresented on these preferred days receive a **1.5x bonus** on their day-of-week deficit score.

### 7.5 Weekend distribution fairness (soft)
If D is a weekend day (Friday, Saturday, Sunday), doctors with fewer weekend shifts this month receive higher scores.

### 7.6 Monthly workload balance (soft)
Doctors with fewer total shifts this month receive higher scores.

### 7.7 Idle time (soft)
Doctors who have been inactive longer (older `lastWorkDay`) receive slightly higher scores. Null `lastWorkDay` (never worked) gets maximum idle bonus.

---

## 8. Scoring Formula

For each eligible doctor, the algorithm calculates:

```
score = dayOfWeekDeficit
      + dayOfWeekPreferredBonus (1.5x if preferred day)
      + weekendDeficit * 0.8
      + monthlyDeficit * 0.6
      + idleTimeBonus * 0.1
```

The doctor with the **highest score** is selected. Random tie-breaking is applied when scores are within 0.001.

---

## 9. Warnings Generated

The algorithm returns warnings alongside the schedule:

| Warning Key | Condition | Parameters |
|---|---|---|
| `warnings.multiplePreAssignedInput` | Two or more doctors have the same date in `preAssignedWorkDates` | `date`, `doctors` |
| `warnings.uncoveredDay` | A day has no coverage because all available doctors are blocked by constraints | `date` |
| `warnings.brokenMinInterval` | A doctor has fewer rest days than the minimum interval | `doctor`, `date1`, `date2`, `interval`, `required` |
| `warnings.workOnVacation` | A doctor is assigned work on a vacation day | `doctor`, `date` |
| `warnings.workOnExcludedDate` | A doctor is assigned work on an excluded date | `doctor`, `date` |
| `warnings.exceededMonthlyLimit` | A doctor exceeds the global monthly shift limit | `doctor`, `month`, `count`, `limit` |
| `warnings.unbalancedMonthlyWorkdays` | Monthly work days differ by more than 3 between doctors | `month`, `maxDoctor`, `maxCount`, `minDoctor`, `minCount` |
| `warnings.unbalancedDayOfWeek` | Work days on a specific day of week differ by more than 3 | `day`, `maxDoctor`, `maxCount`, `minDoctor`, `minCount` |
| `warnings.unbalancedPreferredDays` | Preferred day (Mon/Thu/Fri/Sat) distribution differs by more than 2 | `day`, `maxDoctor`, `maxCount`, `minDoctor`, `minCount` |

---

## 10. Decision Priority for Soft Restrictions

When balancing conflicts between soft restrictions, the algorithm applies these weights (higher = more important):

| Priority | Soft Restriction | Weight Factor |
|---|---|---|
| 1 | Day-of-week balance (general) | 1.0 |
| 2 | Preferred day balance (Thu/Fri/Sat/Sun) | 1.5x bonus |
| 3 | Weekend distribution | 0.8 |
| 4 | Monthly workload | 0.6 |
| 5 | Idle time | 0.1 |

---

## 11. Special Cases

### Empty doctor list
If the doctor list is empty, all days generate `Off` entries with no warning.

### Day totally blocked by vacations/exclusions
If all doctors are on vacation or excluded (without being blocked by interval), the day gets no automatic assignment but **does not** generate an uncovered day warning, because no doctor was "potentially available but constrained."

### Fixed entry on a pre-assigned day
If a doctor has that day both in `preAssignedWorkDates` and a fixed entry exists, the fixed entry takes precedence for that specific doctor (no duplication).

---

## 12. Input Validation Constraints

| Field | Validation |
|---|---|
| Number of doctors | 0–20 |
| `endDate` | Must be equal to or after `startDate` |
| `minIntervalBetweenWorkDays` | Integer 0–30, default 1 |
| `globalMonthlyShiftLimit` | Integer 0–31, optional |
| Doctor names | Cannot be empty |

---

## 13. Visual Decision Flow Per Day

```
┌─────────────────────────────────────────┐
│  Day D                                  │
├─────────────────────────────────────────┤
│  Has fixed entry?                       │
│    Yes → Preserve, continue             │
│    No ↓                                 │
│  Record vacations for the day           │
│  Any doctor has D in preAssignedWorkDates? │
│    Yes → Record Pre-assigned(s),       │
│          update stats, continue         │
│    No ↓                                 │
│  Filter eligible doctors               │
│  HARD: Not on vacation, not excluded,  │
│        not excluded from auto,          │
│        no consecutive days             │
│    Any eligible?                        │
│      Yes → Score by soft restrictions   │
│            → Assign highest score       │
│            → Update stats               │
│      No  → Record Off                  │
│            Generate warning if any      │
│              doctor was potentially    │
│              available                 │
└─────────────────────────────────────────┘

After day loop:
  Analyze all soft restriction violations
  Generate warnings for each violation
```

---

## 14. Implementation Notes

- **Dates**: All comparisons are at natural day level. Dates are serialized to ISO 8601 (`yyyy-MM-dd`) in localStorage and `.rw` files.
- **Partial regeneration**: The system supports "fixed entries" (`isFixed`) to preserve manual assignments when regenerating. Passed as `existingFixedEntries`.
- **Languages**: `dayOfWeek` is stored in English internally. The UI translates to the user's language (EN/ES).
- **Web Worker**: The `generateSchedule` function runs in a Web Worker (`src/workers/schedule.worker.ts`) to avoid blocking the main thread during generation.
- **Pre-assigned days**: Count toward ALL balance calculations (day-of-week, monthly, weekend) as if they were algorithm-assigned work days.