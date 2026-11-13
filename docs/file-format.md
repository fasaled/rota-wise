# File format (`.rw`)

Rota-Wise stores a roster as UTF-8 JSON with the extension `.rw`. The MIME type
used by the PWA file handler is `application/x-rotawise`.

Legacy `.json` files with the same shape are accepted on open. On Chromium, a
successful open of `.json` prompts **Save As** `.rw`.

There is no encryption. Anyone with the file can read doctor names and dates.
Treat `.rw` files like any other staff roster.

Current on-disk version: **`fileVersion: 4`**
(`CURRENT_FILE_VERSION` in `src/lib/types.ts`).

---

## Top-level object (`AppFileData`)

```json
{
  "fileVersion": 4,
  "versions": [],
  "schedule": { "...": "SerializedSchedule" },
  "doctorsProfiles": [ "...SerializedDoctorProfile" ],
  "formValues": { "...": "SerializedScheduleFormValues" },
  "currentMinInterval": 1
}
```

| Field | Role |
|---|---|
| `fileVersion` | Format generation. Missing values are treated as current on parse. |
| `versions` | Reserved named snapshots (`ScheduleVersion[]`). The UI currently persists this as `[]`. |
| `schedule` | Generated (and manually edited) entries. |
| `doctorsProfiles` | Copy of `formValues.doctors`, written only so readers of versions 1–3 keep working. The app reads `formValues.doctors` and falls back to this list only when that one is empty. |
| `formValues` | Roster-tab form, including units and holidays. **The source of truth for the roster.** |
| `currentMinInterval` | Interval used for edit-time checks. |

Warnings are not stored: they are recomputed from the schedule and the roster
every time the file is loaded or edited, in the current language. Files from
versions 1–3 may carry a `scheduleWarnings` array; it is ignored.

### Dates

Every date is a **calendar day** written as `yyyy-MM-dd` and read as local
midnight, so a file means the same days in every time zone.

Versions 1–3 wrote full ISO datetimes (`2026-01-05T23:00:00.000Z`, local
midnight expressed in UTC). They are still accepted: the instant is snapped to
the nearest UTC midnight, which recovers the intended calendar day whatever
time zone wrote the file (offsets up to ±12 h).

---

## `formValues`

```json
{
  "numberOfDoctors": 2,
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "minIntervalBetweenWorkDays": 1,
  "globalMonthlyShiftLimit": 6,
  "enforceMonthlyLimit": false,
  "holidays": ["2026-01-01"],
  "units": [
    {
      "id": "unit-ward-a",
      "name": "Ward A",
      "minPostCallCoverage": 2,
      "alliedUnitIds": ["unit-ward-b"]
    }
  ],
  "doctors": [
    {
      "id": "doc-1",
      "name": "Dr. Smith",
      "freeDates": [],
      "preAssignedWorkDates": [],
      "excludedDates": [],
      "isExcludedFromAutomaticAssignment": false,
      "unitId": "unit-ward-a",
      "coverAssignments": [
        {
          "id": "cover-1",
          "targetUnitId": "unit-ward-b",
          "startDate": "2026-02-01",
          "endDate": "2026-02-14"
        }
      ]
    }
  ]
}
```

`globalMonthlyShiftLimit`, `enforceMonthlyLimit`, `units`, `holidays`,
`unitId`, and `coverAssignments` are optional for older files.
`enforceMonthlyLimit` makes the monthly limit a hard rule for automatic
assignment (see `docs/algorithm.md`, section 5.7).

---

## `schedule`

```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "minIntervalBetweenWorkDays": 1,
  "globalMonthlyShiftLimit": 6,
  "seed": 2891336453,
  "entries": [
    {
      "date": "2026-01-05",
      "doctorId": "doc-1",
      "assignment": "Work",
      "dayOfWeek": "Monday",
      "isFixed": false
    }
  ]
}
```

`assignment` is one of `Work`, `Pre-assigned`, `Free`, `Off`, `Excluded`.
On load, legacy `"Vacation"` is rewritten to `"Free"`.

`doctorId` `"system"` is used for `Off` (uncovered) days.

`seed` is the seed of the generation run that produced the roster (optional;
absent in older files and never required). Entries can reference a `doctorId`
that is no longer on the roster; the app keeps them, shows them as "Removed
doctor" and warns about them.

When the roster has no doctors, `schedule` is written as `{ "entries": [] }`.

---

## Named versions (reserved)

```json
{
  "id": "uuid",
  "name": "March draft",
  "description": "optional",
  "createdAt": "ISO",
  "lastModified": "ISO",
  "parameters": { "...formValues" },
  "generatedSchedule": { "...schedule" },
  "warnings": []
}
```

The field is written through `buildAppFileData` so future UI can fill it
without a format bump. Readers should tolerate an empty or missing array.

---

## Validation on open

`parseAppFileJson` in `src/lib/schedule-storage.ts` validates the payload
before anything reaches the app, and throws a `RotawiseFileError` with one of
these codes (shown to the user as `file.error.<code>`):

| Code | When |
|---|---|
| `invalidJson` | The text is not JSON |
| `notRotawiseFile` | Not an object, or none of `schedule`, `formValues`, `doctorsProfiles` is present |
| `newerVersion` | `fileVersion` is greater than the version this build understands |
| `invalidData` | A field has the wrong type or an unparseable date (`detail` carries the path) |

A rejected file leaves the open roster untouched.

---

## Migrations applied on parse

After validation:

| Old | New |
|---|---|
| `vacationDates` on a doctor (no `freeDates`) | `freeDates` |
| `assignment: "Vacation"` | `"Free"` |
| missing `units` | `[]` |
| missing `holidays` | `[]` |
| missing `unitId` | `""` |
| missing `coverAssignments` | `[]` |
| missing `alliedUnitIds` | `[]` |
| missing `versions` | `[]` |
| missing `fileVersion` | current version |
| ISO datetime dates (versions 1–3) | local calendar day |
| `scheduleWarnings` | dropped |

Version history:

| Version | Change |
|---|---|
| 1–3 | Earlier formats: ISO datetimes; units, alliances, cover assignments and holidays were added along the way |
| 4 | Date-only strings, `enforceMonthlyLimit`, `schedule.seed`, no stored warnings, validation on open |

Bump `CURRENT_FILE_VERSION` when the on-disk shape changes, and extend this
table in the same PR.

---

## IndexedDB working copy

Not a second format. The same `AppFileData` object is stored under:

- Database: `rotawise`
- Store: `kv`
- Key: `workingCopy`

alongside session metadata (`mode: "browser" | "file"`, `fileName`).
A file handle, when the API exists, is stored under `fileHandle`.
