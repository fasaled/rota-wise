# File format (`.rw`)

Rota-Wise stores a roster as UTF-8 JSON with the extension `.rw`. The MIME type
used by the PWA file handler is `application/x-rotawise`.

Legacy `.json` files with the same shape are accepted on open. On Chromium, a
successful open of `.json` prompts **Save As** `.rw`.

There is no encryption. Anyone with the file can read doctor names and dates.
Treat `.rw` files like any other staff roster.

Current on-disk version: **`fileVersion: 3`**
(`CURRENT_FILE_VERSION` in `src/lib/types.ts`).

---

## Top-level object (`AppFileData`)

```json
{
  "fileVersion": 3,
  "versions": [],
  "schedule": { "...": "SerializedSchedule" },
  "doctorsProfiles": [ "...SerializedDoctorProfile" ],
  "formValues": { "...": "SerializedScheduleFormValues" },
  "scheduleWarnings": ["translated or keyed warning strings"],
  "currentMinInterval": 1
}
```

| Field | Role |
|---|---|
| `fileVersion` | Format generation. Missing values are treated as current on parse. |
| `versions` | Reserved named snapshots (`ScheduleVersion[]`). The UI currently persists this as `[]`. |
| `schedule` | Generated (and manually edited) entries. |
| `doctorsProfiles` | Display/copy of doctor constraints used with the calendar. |
| `formValues` | Roster-tab form, including units and holidays. |
| `scheduleWarnings` | Last computed warning **strings** (already translated). Recomputed on load/edit. |
| `currentMinInterval` | Interval used for edit-time checks. |

Dates are ISO-8601 strings. Date-only values (`YYYY-MM-DD`) are read as **local
midnight** so calendar days do not shift across time zones. Values with `T` use
`new Date`.

---

## `formValues`

```json
{
  "numberOfDoctors": 2,
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-03-31T00:00:00.000Z",
  "minIntervalBetweenWorkDays": 1,
  "globalMonthlyShiftLimit": 6,
  "holidays": ["2026-01-01T00:00:00.000Z"],
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
          "startDate": "2026-02-01T00:00:00.000Z",
          "endDate": "2026-02-14T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

`globalMonthlyShiftLimit`, `units`, `holidays`, `unitId`, and
`coverAssignments` are optional for older files.

---

## `schedule`

```json
{
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-03-31T00:00:00.000Z",
  "minIntervalBetweenWorkDays": 1,
  "globalMonthlyShiftLimit": 6,
  "entries": [
    {
      "date": "2026-01-05T00:00:00.000Z",
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

## Migrations applied on parse

`parseAppFileJson` in `src/lib/schedule-storage.ts`:

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
