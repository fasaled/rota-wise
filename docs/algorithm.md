# Scheduling algorithm

This is the specification of the generator implemented in
`src/lib/schedule-generator.ts`, with the per-doctor rules in
`src/lib/schedule-eligibility.ts`, coverage helpers in
`src/lib/schedule-coverage.ts` and post-generation analysis in
`src/lib/schedule-analyze.ts`.

One **attempt** is a **greedy day-by-day pass** followed by a small **repair
pass**. For each date the greedy pass either preserves a pinned assignment,
records pre-assignments and free days, or picks one eligible doctor with a
**seeded weighted random sample** biased toward a fairness score. The repair
pass then tries to fill days the greedy pass left uncovered.

The generator builds **several attempts** (24 in the app) and keeps the one
with the lowest cost (section 7.2).

It is **not** a global optimiser (no ILP, no full backtracking). Hard
constraints filter eligibility. Soft factors only affect the score.
Regenerating the same inputs produces a different valid roster because each
run draws a new seed; the same inputs **with the same seed** always produce the
same roster.

---

## 1. Inputs

### 1.1 Global parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `startDate` | Date | Yes | First day of the planning period |
| `endDate` | Date | Yes | Last day of the planning period (must be ≥ `startDate`) |
| `minIntervalBetweenWorkDays` | integer 0–30 | No (default 1) | Minimum calendar-day gap **between** two work assignments for the same doctor. With `1`, consecutive days are forbidden. With `0`, consecutive days are allowed. **This is a hard eligibility filter**, not only a scoring hint. |
| `globalMonthlyShiftLimit` | integer 0–31 | No | Cap on work shifts per doctor per calendar month. `0` or omitted means no cap. By default it is **soft**: a doctor at the cap gets a score penalty, and exceeding it produces a warning. |
| `enforceMonthlyLimit` | boolean | No (default `false`) | Makes the monthly limit **hard** for automatic assignment: a doctor at the cap is not eligible, even if the day stays uncovered. Pinned and pre-assigned shifts can still exceed it (and are warned about). |
| `units` | `Unit[]` | No (default `[]`) | Medical units used for post-call coverage. File version 1 files omit this field. |
| `holidays` | Date[] | No (default `[]`) | Dates treated like weekends for coverage: no unit-coverage requirement. A holiday shift still produces a post-call day on the next calendar day. |

### 1.2 Units

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable identifier |
| `name` | string | Display name |
| `minPostCallCoverage` | integer 0–20 | Minimum doctors who must be present on weekdays (not weekends, not holidays). `0` = untracked (typical for outpatient clinics); the calendar still shows a neutral grey dot. |
| `alliedUnitIds` | string[] | Other units that share a post-call pool. Alliances are an **undirected connected component**: A↔B and B↔C means A, B, and C share a pool. Each unit keeps its own minimum; minima are **not** summed. |

### 1.3 Doctors (up to 20)

| Field | Type | Description |
|---|---|---|
| `id` | string | Internal identifier |
| `name` | string | Display name (required, non-empty) |
| `freeDates` | Date[] | Days off. Emit a `Free` entry. Do **not** count as work. Legacy files used `vacationDates` / assignment `Vacation`; both are migrated on load. |
| `preAssignedWorkDates` | Date[] | Shifts already committed. Count as work for statistics, interval, and post-call. |
| `excludedDates` | Date[] | Doctor cannot be auto-assigned that day. No calendar entry is created for the exclusion itself. The doctor **still counts** toward unit coverage that day. |
| `isExcludedFromAutomaticAssignment` | boolean | Never auto-assigned. May still appear via pre-assignments, pinned entries, or manual edits. Still counts toward unit coverage. |
| `unitId` | string? | Home unit. Omitted = “free agent”: not counted toward any unit’s coverage. |
| `coverAssignments` | `{ targetUnitId, startDate, endDate }[]` | Temporary reassignment. During the inclusive range the doctor counts **only** toward `targetUnitId`, not the home unit. |

### 1.4 Pinned entries (`existingFixedEntries`)

Optional `ScheduleEntry[]` with `isFixed === true`. Manual (or “fix month”)
assignments the generator must keep. They are copied in before the main loop
and seed statistics.

---

## 2. Output

Each day can produce **several** entries (free days for many doctors plus one
work assignment).

| Field | Values |
|---|---|
| `date` | The calendar day |
| `doctorId` | Doctor id, or `"system"` for uncovered days |
| `assignment` | `Work` · `Pre-assigned` · `Free` · `Off` · `Excluded` |
| `dayOfWeek` | English full name (`"Monday"`). The UI translates. |
| `isFixed` | When `true`, regeneration preserves the entry |

Semantics:

- **Work** — automatic assignment.
- **Pre-assigned** — from `preAssignedWorkDates`.
- **Free** — doctor is off that day.
- **Off** — no coverage (`doctorId: "system"`). Not rendered on the calendar.
- **Excluded** — used by the UI for excluded-date markers; the generator does not emit these.

Each day receives **at most one** work assignment (automatic, pre-assigned, or
pinned). If any pre-assignment already covers the day, the generator does not
auto-assign a second doctor.

---

## 3. Per-doctor statistics

Maintained as the loop walks the range:

| Statistic | Meaning |
|---|---|
| `totalWorkdays` | Work + pre-assigned shifts so far |
| `workloadByDayOfWeek` | Counts keyed `Mon` … `Sun` |
| `monthlyWorkdays` | Counts keyed `yyyy-MM` |
| `weekendDaysThisMonth` | Friday + Saturday + Sunday counts per month |
| `lastWorkDay` | Most recent work/pre-assigned date (idle-time score) |

Seeded from:

- Pinned work/pre-assigned entries inside the range
- Pre-assigned (and pinned) work dates **before** `startDate` (only for `lastWorkDay`)

Preferred weekdays for scoring: **Thursday, Friday, Saturday, Sunday**.
Weekend for scoring: **Friday, Saturday, Sunday**.

---

## 4. Day loop

Chronological, `startDate` … `endDate`:

```
For each day D:

  1. If D has a pinned Work / Pre-assigned entry
       → keep it, update lastWorkDay, skip auto-assignment for D.

  2. For every doctor with D in preAssignedWorkDates
       and no pinned entry of their own on D:
       → emit Pre-assigned, update statistics.
       If any pre-assignment exists, skip auto-assignment for D.

  3. For every doctor with D in freeDates:
       → emit Free (does not block a different doctor from working).

  4. If D still has no work coverage and the roster is non-empty:
       a. Filter eligible doctors (section 5).
       b. If any: score them (section 6) and pick with weighted sampling
          (section 7). Emit Work, update statistics.
       c. If none: emit Off (the repair pass may still fill it).

  5. If the roster is empty: emit Off, no warning.
```

### 4.1 Repair pass

The greedy pass cannot look back, so an early choice can leave a later day
with nobody eligible. For every `Off` day, in order, and for every doctor not
blocked there by a free day, an excluded date or the auto-assignment flag:

1. Collect the doctor's own shifts that block the day (interval or post-call).
   Skip the doctor if there are none, more than **two**, or if any of them is
   pinned or pre-assigned (only automatic shifts of this run can move).
2. Tentatively remove those shifts and check that the doctor is now fully
   eligible for the uncovered day (all of section 5, coverage look-ahead
   included).
3. Hand each removed shift to another doctor who is fully eligible for it.
4. If every step succeeds the day becomes `Work`; otherwise everything is
   rolled back and the next doctor is tried.

The repair pass never breaks a hard constraint: it only accepts moves that
pass the same eligibility test as the greedy pass.

### 4.2 After the best attempt is chosen

1. `warnings.uncoveredDay` for every day still `Off`, if at least one doctor
   is not globally excluded from automatic assignment. (If every doctor is
   excluded, `Off` is silent.)
2. `analyzeBrokenConstraints` — interval, free-day clashes, monthly cap, balance.
3. `analyzeUnitCoverage` — weekday post-call undercoverage.

---

## 5. Hard constraints (eligibility)

A doctor is eligible for automatic assignment on D only if **all** hold.

Rules 5.2–5.5 live in `getAssignmentBlockReason`
(`src/lib/schedule-eligibility.ts`), which returns the first reason that blocks
a doctor: `freeDay`, `excluded`, `interval` or `postCall`. The calendar's
doctor picker calls the same function, so a doctor the generator would never
place on a day is shown disabled there, with the reason next to the name.

### 5.1 Not excluded from automatic assignment

`isExcludedFromAutomaticAssignment === false`.

### 5.2 Not on a free day

D is not in `freeDates`.

### 5.3 Not on an excluded date

D is not in `excludedDates`.

### 5.4 Minimum interval (hard)

Let `allWorkDates` be the union of:

- that doctor’s `preAssignedWorkDates` (including dates after D)
- pinned Work / Pre-assigned entries for that doctor
- Work / Pre-assigned entries already emitted in this run

For every such date W, **unless W itself is a holiday**:

```
|D − W|  (calendar days)  >  minIntervalBetweenWorkDays
```

If `|D − W| <= minIntervalBetweenWorkDays`, the doctor is ineligible.

Holidays are skipped in this check so a holiday pre-assignment is treated as a
free day for spacing, not as a work day that consumes the interval.

### 5.5 Post-call (hard, independent of the interval)

Post-call of a shift is **the next calendar day**, including holidays.
**Saturday’s post-call is Monday** (Sunday is skipped).

```
getPostCallDate(workDate):
  Saturday → +2 days
  otherwise → +1 day
```

Ineligible if:

- D is the post-call day of any existing work date, or
- the doctor already has a shift on `getPostCallDate(D)` (assigning today
  would collide with that future/pre-assigned shift).

### 5.6 Unit coverage look-ahead (hard)

If putting this doctor on call today would leave **any tracked unit in their
effective alliance** under its minimum on the post-call day, they are dropped.

Effective unit on the post-call date = active cover assignment, else home
`unitId`. Alliance = undirected connected component of `alliedUnitIds`.

`computeUnitCoverageForDate` returns no rows on weekends and holidays, so the
look-ahead never blocks a Friday/Saturday/holiday assignment for coverage
reasons.

Coverage counting rules (see also `src/lib/schedule-coverage.ts`):

- The on-call doctor **on the coverage date itself** still counts as present.
- A doctor on post-call that date does **not** count.
- Free days do not count.
- Excluded dates **do** count.
- Doctors excluded from automatic assignment **do** count.
- Doctors with no `unitId` (and no cover assignment) never count.

### 5.7 Strict monthly limit (only when `enforceMonthlyLimit` is on)

The doctor has fewer than `globalMonthlyShiftLimit` work shifts (automatic,
pre-assigned or pinned) in D's calendar month.

---

## 6. Soft score

Computed only for eligible doctors. Higher is better. Every deficit is
"average over the whole roster minus this doctor's count", so a doctor below
the average scores higher.

```
totalDeficit      = avg(totalWorkdays)            − doctor.totalWorkdays
dayDeficit        = avg(count on this weekday)    − doctor count on this weekday
weekendDeficit    = avg(weekend days this month)  − doctor weekend days this month
monthlyDeficit    = avg(workdays this month)      − doctor workdays this month
idleDays          = min(14, days since lastWorkDay)     (14 if never worked)

score = totalDeficit   * 1.0
      + dayDeficit     * 1.0
      + dayDeficit     * 1.5      (only on Thu, Fri, Sat, Sun)
      + weekendDeficit * 0.8      (only on Fri, Sat, Sun)
      + monthlyDeficit * 0.6
      + idleDays       * 0.05
      − 4                         (soft monthly limit reached, see below)
```

| Factor | Weight | Notes |
|---|---|---|
| Total workload | 1.0 | Keeps totals level across the whole period |
| Day-of-week balance | 1.0 | |
| Preferred-day bonus | 1.5 × the day-of-week deficit | Thu–Sun |
| Weekend distribution | 0.8 | Applied on Fri–Sun only, per calendar month |
| Monthly load | 0.6 | Compared with the average **of the same month** |
| Idle time | 0.05 per day, capped at 14 days | Tie-breaker; the cap stops a long absence from outweighing fairness |
| Soft monthly limit | −4 | When `globalMonthlyShiftLimit` is set, not strict, and the doctor already reached it this month |

With the strict limit (section 5.7) the penalty is not needed: the doctor is
simply not eligible.

---

## 7. Sampling, seeds and attempts

### 7.1 Weighted sampling

The highest score does **not** always win. Every eligible doctor can be chosen,
but the probability falls exponentially with the distance to the best score
(softmax, temperature 0.5):

```
weights[i] = exp((score[i] − max(scores)) / 0.5)
pick from [0, sum(weights)) with the seeded generator
```

A doctor one point behind the best is about 7 times less likely to be picked;
two points behind, about 55 times. This keeps variety between runs without
letting clearly worse candidates win often.

### 7.2 Seed and best-of-N

Randomness comes from a small seeded generator (`mulberry32`,
`src/lib/random.ts`), never from `Math.random()` directly.

```
generateSchedule(data, fixedEntries, { seed?, attempts? })
```

- `seed` — omitted: a fresh random seed. Given: fully reproducible output.
- `attempts` — how many candidate rosters to build (default 1; the worker
  asks for 24). Attempt *n* uses a seed derived from the base seed.

Each attempt gets a cost; the lowest wins, and the loop stops early at cost 0:

```
cost = uncovered days                          × 10 000
     + undercovered unit-days                  ×    500
     + doctor-months above the monthly limit   ×    200
     + spread of total workdays                ×     10
     + Σ months spread of weekend days         ×      6
     + Σ months spread of workdays             ×      3
     + Σ weekdays spread of per-weekday counts ×      1
```

"Spread" is max − min among doctors who take part in automatic assignment.
Coverage therefore always beats fairness, and fairness of totals beats the
finer balances.

The seed of the winning attempt is returned as `seed` and stored in
`schedule.seed` (and in the `.rw` file), so a roster can be reproduced from
its inputs.

---

## 8. Warnings

Returned alongside the schedule. The UI translates `key` via i18n.

### 8.1 During generation

| Key | When |
|---|---|
| `warnings.multiplePreAssignedInput` | Two or more doctors list the same date in `preAssignedWorkDates` |
| `warnings.uncoveredDay` | Auto-assignment failed and at least one doctor could in principle be assigned |

### 8.2 `analyzeBrokenConstraints`

| Key | When |
|---|---|
| `warnings.brokenMinInterval` | Two work days for the same doctor have calendar gap ≤ `minInterval` |
| `warnings.workOnFreeDay` | Work / pre-assigned on a free date |
| `warnings.workOnExcludedDate` | Work / pre-assigned on an excluded date |
| `warnings.exceededMonthlyLimit` | Work days in a month > `globalMonthlyShiftLimit` (when the limit is set and > 0) |
| `warnings.unbalancedMonthlyWorkdays` | In a month, max − min work days among doctors > 3 |
| `warnings.unbalancedDayOfWeek` | For a weekday, max − min > 3 |
| `warnings.unbalancedPreferredDays` | For a preferred weekday, max − min > 2 |

Balance warnings ignore doctors with 0 on that slice when computing the min.

Entries whose `doctorId` is no longer on the roster are skipped by these
checks. The page reports them separately (`buildScheduleWarnings` in
`schedule-warnings.ts`) as `warnings.removedDoctorShifts`, and the calendar
shows them as "Removed doctor" until they are reassigned or the schedule is
regenerated.

### 8.3 `analyzeUnitCoverage`

| Key | When |
|---|---|
| `warnings.postCallUncovered` | On a weekday that is not a holiday, a tracked unit has `available < min` |

`warnings.postCallPreAssignmentConflict` exists in the locale files and in a
comment in `schedule-analyze.ts` but is **not emitted** by the current
analyzer. Pre-assignment vs coverage clashes surface as `postCallUncovered`
after generation (and as look-ahead ineligibility during generation).

---

## 9. Special cases

**Empty roster.** Every day is `Off`, no uncovered-day warning.

**Everyone on free/excluded/interval/post-call/coverage-blocked.** `Off`.
Uncovered-day warning only if someone is not globally excluded from auto-assignment.

**Pinned vs pre-assigned on the same doctor/day.** The pinned entry wins; the
pre-assignment is not duplicated.

**Pre-assigned days** count in every balance statistic as if they were
algorithm-assigned work.

**Holidays**

- No unit-coverage requirement (same as weekend).
- A holiday shift still creates post-call on the next calendar day.
- A holiday date in `preAssignedWorkDates` is skipped when checking min-interval
  against other days.

---

## 10. Validation (form schema)

| Field | Rule |
|---|---|
| Number of doctors | 0–20 |
| `startDate`, `endDate` | both required to generate |
| `endDate` | ≥ `startDate` |
| `minIntervalBetweenWorkDays` | integer 0–30, default 1 |
| `globalMonthlyShiftLimit` | integer 0–31, optional |
| Unit name | non-empty |
| `minPostCallCoverage` | integer 0–20 |
| Doctor name | non-empty |

---

## 11. Implementation notes

- **Dates** are compared at calendar-day precision (`date-fns` `isSameDay` /
  `differenceInCalendarDays`). Persistence uses date-only `yyyy-MM-dd` strings
  (`toDateKey` / `parseDateValue` in `src/lib/dates.ts`), read back as local
  midnight, so a file means the same days in every time zone.
- **Partial regeneration.** Pass current `isFixed` entries as
  `existingFixedEntries`. The UI asks whether to keep pins when the user
  regenerates.
- **Worker.** `generateSchedule` runs in `src/workers/schedule.worker.ts` via
  `useScheduleWorker`, which asks for 24 attempts. Tests may call it on the
  main thread. If generation fails, the previous schedule is kept.
- **One work assignment per day.** The model is a single on-call doctor, plus
  any number of free-day markers.
