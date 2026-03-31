# Esquema JSON — Formatos de Importación y Exportación

Este documento describe exactamente los formatos JSON que maneja Rota-Wise para guardar y cargar datos. La app Windows debe ser capaz de leer y escribir estos mismos formatos para mantener compatibilidad con los archivos generados por la app web.

---

## Convenciones generales

- Todas las fechas se serializan en formato **ISO 8601 UTC**: `"2026-01-15T00:00:00.000Z"`.
- Los campos opcionales pueden estar ausentes (no incluir la clave) o ser `null` / `undefined` → en C# representar como `T?` (nullable).
- Los IDs de médico son cadenas UUID v4: `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`.
- `doctorId: "system"` es un valor reservado que indica que ningún médico está asignado (`assignment: "Off"`).

---

## Formato 1: Horario completo (`rotawise-schedule.json`)

Se genera al pulsar **Guardar datos** cuando hay un horario generado. Es el formato principal, el más completo.

**Cómo detectarlo al cargar**: el objeto JSON raíz contiene las claves `"schedule"` **y** `"formValues"`.

```json
{
  "schedule": {
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-03-31T00:00:00.000Z",
    "minIntervalBetweenWorkDays": 1,
    "globalMonthlyShiftLimit": null,
    "entries": [
      {
        "date": "2026-01-02T00:00:00.000Z",
        "doctorId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "assignment": "Work",
        "dayOfWeek": "Friday",
        "isFixed": false
      },
      {
        "date": "2026-01-02T00:00:00.000Z",
        "doctorId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "assignment": "Vacation",
        "dayOfWeek": "Friday",
        "isFixed": false
      },
      {
        "date": "2026-01-03T00:00:00.000Z",
        "doctorId": "system",
        "assignment": "Off",
        "dayOfWeek": "Saturday",
        "isFixed": false
      }
    ]
  },
  "doctorsProfiles": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Dr. García",
      "vacationDates": [],
      "preAssignedWorkDates": ["2026-01-10T00:00:00.000Z"],
      "excludedDates": [],
      "isExcludedFromAutomaticAssignment": false
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "Dra. López",
      "vacationDates": ["2026-01-02T00:00:00.000Z", "2026-01-03T00:00:00.000Z"],
      "preAssignedWorkDates": [],
      "excludedDates": ["2026-01-15T00:00:00.000Z"],
      "isExcludedFromAutomaticAssignment": false
    }
  ],
  "formValues": {
    "numberOfDoctors": 2,
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-03-31T00:00:00.000Z",
    "minIntervalBetweenWorkDays": 1,
    "globalMonthlyShiftLimit": null,
    "doctors": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Dr. García",
        "vacationDates": [],
        "preAssignedWorkDates": ["2026-01-10T00:00:00.000Z"],
        "excludedDates": [],
        "isExcludedFromAutomaticAssignment": false
      },
      {
        "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "name": "Dra. López",
        "vacationDates": ["2026-01-02T00:00:00.000Z", "2026-01-03T00:00:00.000Z"],
        "preAssignedWorkDates": [],
        "excludedDates": ["2026-01-15T00:00:00.000Z"],
        "isExcludedFromAutomaticAssignment": false
      }
    ]
  },
  "scheduleWarnings": [
    "El día 15 de enero de 2026 no pudo ser cubierto."
  ],
  "currentMinInterval": 1
}
```

### Descripción de campos — objeto raíz

| Campo | Tipo | Opcional | Descripción |
|---|---|---|---|
| `schedule` | objeto | No | El horario generado serializado |
| `doctorsProfiles` | array | No | Perfiles completos de los médicos |
| `formValues` | objeto | No | Estado del formulario en el momento de guardar |
| `scheduleWarnings` | array de strings | Sí | Lista de avisos del algoritmo ya traducidos |
| `currentMinInterval` | número | Sí | Intervalo mínimo activo en el momento de guardar |

### Descripción de campos — `schedule`

| Campo | Tipo | Opcional | Descripción |
|---|---|---|---|
| `startDate` | string ISO | No | Inicio del periodo |
| `endDate` | string ISO | No | Fin del periodo |
| `minIntervalBetweenWorkDays` | número | Sí | Intervalo mínimo entre guardias |
| `globalMonthlyShiftLimit` | número \| null | Sí | Límite mensual global; null si no hay límite |
| `entries` | array | No | Todas las entradas del horario |

### Descripción de campos — cada entrada en `entries`

| Campo | Tipo | Opcional | Descripción |
|---|---|---|---|
| `date` | string ISO | No | Fecha de la entrada |
| `doctorId` | string | No | ID del médico, o `"system"` para días sin cobertura |
| `assignment` | enum | No | `"Work"`, `"Pre-assigned"`, `"Vacation"`, `"Off"` |
| `dayOfWeek` | string | No | Nombre completo del día en inglés: `"Monday"`, `"Tuesday"`, etc. |
| `isFixed` | boolean | Sí | Si falta, interpretar como `false` |

### Descripción de campos — cada elemento en `doctorsProfiles` y en `formValues.doctors`

| Campo | Tipo | Opcional | Descripción |
|---|---|---|---|
| `id` | string UUID | No | Identificador único del médico |
| `name` | string | No | Nombre del médico |
| `vacationDates` | array de strings ISO | No | Fechas de vacaciones (puede ser vacío `[]`) |
| `preAssignedWorkDates` | array de strings ISO | No | Fechas pre-asignadas (puede ser vacío `[]`) |
| `excludedDates` | array de strings ISO | No | Fechas excluidas (puede ser vacío `[]`) |
| `isExcludedFromAutomaticAssignment` | boolean | No | Si falta en archivos antiguos, interpretar como `false` |

---

## Formato 2: Solo parámetros (`rotawise-parameters.json`)

Se genera al pulsar **Guardar datos** cuando hay datos de médicos en el formulario pero aún no se ha generado el horario.

**Cómo detectarlo al cargar**: el objeto raíz contiene `"doctors"` y `"numberOfDoctors"` pero **NO** contiene `"schedule"`.

```json
{
  "numberOfDoctors": 2,
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-03-31T00:00:00.000Z",
  "minIntervalBetweenWorkDays": 1,
  "globalMonthlyShiftLimit": null,
  "doctors": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Dr. García",
      "vacationDates": [],
      "preAssignedWorkDates": ["2026-01-10T00:00:00.000Z"],
      "excludedDates": [],
      "isExcludedFromAutomaticAssignment": false
    }
  ]
}
```

Al cargar este formato: restaurar el formulario con los parámetros, pero **no hay horario** que mostrar; el usuario deberá generarlo de nuevo.

---

## Formato 3: Versión guardada (almacenada internamente)

Las versiones guardadas en la app web viven en `localStorage` bajo la clave `"rotawiseScheduleVersions"` como un array JSON.

En la app Windows, cada versión se almacena como un archivo JSON independiente en:
```
%LOCALAPPDATA%\RotaWise\Versions\{id}.json
```

### Estructura de una versión

```json
{
  "id": "ver-a1b2c3d4e5f6",
  "name": "Guardia Enero 2026",
  "description": "Primera propuesta con 3 médicos",
  "createdAt": "2026-01-15T10:30:00.000Z",
  "lastModified": "2026-01-16T08:45:00.000Z",
  "parameters": {
    "numberOfDoctors": 3,
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-03-31T00:00:00.000Z",
    "minIntervalBetweenWorkDays": 1,
    "globalMonthlyShiftLimit": null,
    "doctors": [ /* igual que en formato 2 */ ]
  },
  "generatedSchedule": {
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-03-31T00:00:00.000Z",
    "minIntervalBetweenWorkDays": 1,
    "globalMonthlyShiftLimit": null,
    "entries": [ /* igual que en formato 1 */ ]
  },
  "warnings": [
    "El día 15 de enero de 2026 no pudo ser cubierto."
  ]
}
```

| Campo | Tipo | Opcional | Descripción |
|---|---|---|---|
| `id` | string | No | Identificador único de la versión |
| `name` | string | No | Nombre dado por el usuario |
| `description` | string | Sí | Descripción opcional |
| `createdAt` | string ISO | No | Fecha de creación |
| `lastModified` | string ISO | No | Fecha de última modificación |
| `parameters` | objeto | No | Parámetros del formulario (mismo esquema que Formato 2) |
| `generatedSchedule` | objeto | Sí | Horario generado (puede no existir si se guardó antes de generar) |
| `warnings` | array de strings | Sí | Avisos del algoritmo ya traducidos al idioma activo |

---

## Lógica de detección al cargar un archivo

Al abrir un `.json` con la aplicación, distinguir el formato así:

```
¿Contiene la clave "schedule" Y la clave "formValues"?
  → Formato 1 (horario completo)

¿Contiene "doctors" Y "numberOfDoctors" pero NO "schedule"?
  → Formato 2 (solo parámetros)

En cualquier otro caso:
  → Formato desconocido → mostrar error al usuario
```

En C#:
```csharp
using var doc = JsonDocument.Parse(json);
var root = doc.RootElement;

bool hasSchedule  = root.TryGetProperty("schedule",   out _);
bool hasFormValues = root.TryGetProperty("formValues", out _);
bool hasDoctors   = root.TryGetProperty("doctors",    out _);
bool hasNDoctors  = root.TryGetProperty("numberOfDoctors", out _);

if (hasSchedule && hasFormValues)
    return FileFormat.FullSchedule;
else if (hasDoctors && hasNDoctors && !hasSchedule)
    return FileFormat.ParametersOnly;
else
    throw new InvalidDataException("Formato de archivo no reconocido.");
```

---

## Modelos C# equivalentes

```csharp
// Entrada del horario
public record ScheduleEntry(
    DateOnly Date,
    string DoctorId,
    AssignmentType Assignment,   // enum: Work, PreAssigned, Vacation, Off
    string DayOfWeek,
    bool IsFixed = false
);

public enum AssignmentType { Work, PreAssigned, Vacation, Off }

// Horario completo
public record Schedule(
    DateOnly StartDate,
    DateOnly EndDate,
    List<ScheduleEntry> Entries,
    int MinIntervalBetweenWorkDays = 1,
    int? GlobalMonthlyShiftLimit = null
);

// Perfil de médico
public record DoctorProfile(
    string Id,
    string Name,
    List<DateOnly> VacationDates,
    List<DateOnly> PreAssignedWorkDates,
    List<DateOnly> ExcludedDates,
    bool IsExcludedFromAutomaticAssignment = false
);

// Parámetros del formulario
public record ScheduleParameters(
    int NumberOfDoctors,
    DateOnly StartDate,
    DateOnly EndDate,
    int MinIntervalBetweenWorkDays,
    int? GlobalMonthlyShiftLimit,
    List<DoctorProfile> Doctors
);

// Datos completos persistidos
public record PersistedScheduleData(
    Schedule Schedule,
    List<DoctorProfile> DoctorsProfiles,
    ScheduleParameters FormValues,
    List<string>? ScheduleWarnings = null,
    int CurrentMinInterval = 1
);

// Versión guardada
public record ScheduleVersion(
    string Id,
    string Name,
    string? Description,
    DateTime CreatedAt,
    DateTime LastModified,
    ScheduleParameters Parameters,
    Schedule? GeneratedSchedule = null,
    List<string>? Warnings = null
);
```

> **Nota sobre fechas**: usar `DateOnly` en C# en lugar de `DateTime` para evitar problemas de zona horaria. Al serializar a JSON, convertir a `"yyyy-MM-ddT00:00:00.000Z"` para compatibilidad con los archivos web.
