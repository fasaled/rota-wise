# Reglas de Negocio — Fuera del Algoritmo de Asignación

Este documento cubre toda la lógica de negocio de la aplicación que **no** forma parte del algoritmo central de generación de horarios. Son las reglas que se aplican al manipular, cargar, guardar y actualizar el horario ya generado.

---

## 1. Actualización manual de una entrada del horario

Esta es la operación más compleja fuera del algoritmo. Se ejecuta cuando el usuario guarda cambios desde el diálogo de ajuste manual o cuando completa un drag & drop en el calendario.

### 1.1 Reglas de reemplazo al guardar tipo `Work` o `Pre-assigned`

Dado un día D y una nueva entrada `updatedEntry` de tipo `Work` o `Pre-assigned` para el médico M:

```
Para todas las entradas existentes en el día D:
  1. Eliminar cualquier entrada del mismo médico M en D
     (independientemente del tipo que tenía antes)

  2. Eliminar cualquier entrada de OTRO médico en D
     si su tipo era Work o Pre-assigned
     (un día solo puede tener UNA guardia activa)

  3. Eliminar la entrada system/Off si existe en D
     (la guardia nueva la sobreescribe)

  4. Conservar las entradas de Vacation de otros médicos en D
     (las vacaciones de otros no se tocan)

Añadir updatedEntry a la lista de entradas.
```

### 1.2 Reglas de reemplazo al guardar tipo `Off`

Cuando el usuario asigna `Off` para un día D:

```
Para todas las entradas existentes en el día D:
  1. Eliminar entradas de tipo Work o Pre-assigned (de cualquier médico)
  2. Eliminar entradas system/Off previas
  3. Conservar entradas de tipo Vacation

Añadir una nueva entrada: { DoctorId = "system", Assignment = Off, Date = D }
```

### 1.3 En C# (método UpdateScheduleEntry)

```csharp
public Schedule UpdateScheduleEntry(Schedule schedule, ScheduleEntry updatedEntry)
{
    List<ScheduleEntry> newEntries;

    if (updatedEntry.Assignment == AssignmentType.Off)
    {
        // Conservar solo vacaciones, añadir system/Off
        newEntries = schedule.Entries
            .Where(e => !e.Date.Equals(updatedEntry.Date) || e.Assignment == AssignmentType.Vacation)
            .ToList();

        if (!newEntries.Any(e => e.Date.Equals(updatedEntry.Date)
                              && e.DoctorId == "system"
                              && e.Assignment == AssignmentType.Off))
        {
            newEntries.Add(updatedEntry);
        }
    }
    else // Work o Pre-assigned
    {
        newEntries = schedule.Entries.Where(e =>
        {
            if (!e.Date.Equals(updatedEntry.Date)) return true;           // Otro día: conservar
            if (e.DoctorId == updatedEntry.DoctorId) return false;        // Mismo médico: eliminar
            if (e.Assignment is AssignmentType.Work
                             or AssignmentType.PreAssigned) return false; // Guardia de otro médico: eliminar
            if (e.DoctorId == "system" && e.Assignment == AssignmentType.Off) return false; // Off: eliminar
            return true;                                                   // Vacation de otro: conservar
        }).ToList();

        newEntries.Add(updatedEntry);
    }

    // Ordenar por fecha, luego por doctorId para consistencia
    newEntries.Sort((a, b) =>
    {
        int dateCmp = a.Date.CompareTo(b.Date);
        return dateCmp != 0 ? dateCmp : string.Compare(a.DoctorId, b.DoctorId, StringComparison.Ordinal);
    });

    return schedule with { Entries = newEntries };
}
```

---

## 2. Validaciones del diálogo de ajuste manual

Se ejecutan al cambiar campos en tiempo real (para las `InfoBar` de advertencia) y al pulsar "Guardar" (para las bloqueantes).

### 2.1 Validaciones bloqueantes (impiden guardar)

**V1: Médico requerido para guardia**
```
Si assignmentType == Work && doctorId está vacío
→ Error: "Debe seleccionar un médico para asignar una guardia."
→ Botón "Guardar" deshabilitado
```

**V2: Médico de vacaciones en esa fecha**
```
Si assignmentType == Work || assignmentType == PreAssigned
  Y el médico seleccionado tiene la fecha D en su lista VacationDates
→ Error: "El Dr. [Nombre] está de vacaciones el [fecha]. No se puede asignar guardia."
→ Botón "Guardar" deshabilitado
```

### 2.2 Validaciones de advertencia (permiten guardar)

**V3: Fecha excluida**
```
Si assignmentType == Work || assignmentType == PreAssigned
  Y el médico tiene la fecha D en su lista ExcludedDates
→ Advertencia: "El Dr. [Nombre] tiene este día marcado como excluido."
→ Se puede guardar igualmente
```

**V4: Intervalo mínimo violado (guardia previa)**
```
De todas las entradas del médico de tipo Work o Pre-assigned,
buscar la entrada con fecha más cercana anterior a D (sin incluir D).

Si existe y diferencia en días <= minIntervalBetweenWorkDays
→ Advertencia: "El Dr. [Nombre] trabajó el [fecha anterior], violando el intervalo mínimo de [N] días."
```

**V5: Intervalo mínimo violado (guardia siguiente)**
```
De todas las entradas del médico de tipo Work o Pre-assigned,
buscar la entrada con fecha más cercana posterior a D (sin incluir D).

Si existe y diferencia en días <= minIntervalBetweenWorkDays
→ Advertencia: "El Dr. [Nombre] trabaja el [fecha siguiente], violando el intervalo mínimo de [N] días."
```

> **Nota**: las validaciones V4 y V5 son solo informativas. El diálogo permite guardar aunque se viole el intervalo — es el usuario quien decide. El algoritmo de generación sí respeta esta restricción como restricción dura; el ajuste manual es deliberadamente más permisivo.

---

## 3. Drag & drop en el calendario

### 3.1 Restricciones de drag (origen)

Solo se puede arrastrar una entrada si cumple **todas**:
- `Assignment == Work`
- `IsFixed == false`

Las entradas `Pre-assigned`, `Vacation` y las marcadas como fijas nunca son arrastrables.

### 3.2 Restricciones de drop (destino)

Al soltar una entrada arrastrada sobre una celda destino D:

**Drop inválido — no hacer nada + mostrar error:**
```
Si en D existe alguna entrada con IsFixed == true
   Y esa entrada es de tipo Work o Pre-assigned
→ Error: "No se puede mover a una fecha con asignación fija."
```

**Drop válido — mover:**
```
Si D no tiene ninguna entrada Work o Pre-assigned de otro médico
→ Mover la entrada origen a D: cambiar Date y DayOfWeek
→ Eliminar cualquier entrada system/Off en D si existía
```

**Drop válido — intercambio:**
```
Si D tiene una entrada Work o Pre-assigned de otro médico M2,
Y esa entrada de M2 NO es fija (IsFixed == false)
→ Intercambiar fechas: el médico origen va a D, M2 va a la fecha origen
→ Actualizar DayOfWeek de ambas entradas
```

```csharp
public (Schedule UpdatedSchedule, SwapResult Result) ProcessDrop(
    Schedule schedule,
    ScheduleEntry draggedEntry,
    DateOnly targetDate)
{
    // Comprobar entrada fija en destino
    bool targetHasFixed = schedule.Entries.Any(e =>
        e.Date == targetDate && e.IsFixed &&
        e.Assignment is AssignmentType.Work or AssignmentType.PreAssigned);

    if (targetHasFixed)
        return (schedule, SwapResult.BlockedByFixed);

    // Buscar entrada existente en destino (de otro médico)
    var existingOnTarget = schedule.Entries.FirstOrDefault(e =>
        e.Date == targetDate &&
        e.DoctorId != draggedEntry.DoctorId &&
        e.Assignment is AssignmentType.Work or AssignmentType.PreAssigned);

    if (existingOnTarget is not null)
    {
        if (existingOnTarget.IsFixed)
            return (schedule, SwapResult.BlockedByFixed);

        // Intercambio
        var movedDragged = draggedEntry with { Date = targetDate, DayOfWeek = GetDayName(targetDate) };
        var movedExisting = existingOnTarget with { Date = draggedEntry.Date, DayOfWeek = GetDayName(draggedEntry.Date) };

        var updated = UpdateScheduleEntry(schedule, movedDragged);
        updated = UpdateScheduleEntry(updated, movedExisting);
        return (updated, SwapResult.Swapped);
    }
    else
    {
        // Mover sin intercambio
        var movedEntry = draggedEntry with { Date = targetDate, DayOfWeek = GetDayName(targetDate) };
        var updated = UpdateScheduleEntry(schedule, movedEntry);
        return (updated, SwapResult.Moved);
    }
}

public enum SwapResult { Moved, Swapped, BlockedByFixed }
```

---

## 4. Fijar y desfijar un mes completo

Al pulsar "Fijar mes" en el calendario para el mes M:

```
Para cada entrada del horario en el mes M:
  Si entry.Assignment == Work || entry.Assignment == PreAssigned
    → entry.IsFixed = true

Las entradas de Vacation y Off no se modifican.
```

Al pulsar "Desfijar mes":
```
Para cada entrada del horario en el mes M:
  Si entry.Assignment == Work || entry.Assignment == PreAssigned
    → entry.IsFixed = false
```

El botón muestra "Fijar" u "Desfijar" según si **alguna** entrada del mes visible tiene `IsFixed == true`.

```csharp
public Schedule ToggleMonthFixed(Schedule schedule, DateOnly month, bool isFixed)
{
    var monthStart = new DateOnly(month.Year, month.Month, 1);
    var monthEnd = monthStart.AddMonths(1).AddDays(-1);

    var updatedEntries = schedule.Entries.Select(e =>
        e.Date >= monthStart && e.Date <= monthEnd &&
        e.Assignment is AssignmentType.Work or AssignmentType.PreAssigned
            ? e with { IsFixed = isFixed }
            : e
    ).ToList();

    return schedule with { Entries = updatedEntries };
}

public bool MonthHasFixedEntries(Schedule schedule, DateOnly month)
{
    var monthStart = new DateOnly(month.Year, month.Month, 1);
    var monthEnd = monthStart.AddMonths(1).AddDays(-1);

    return schedule.Entries.Any(e =>
        e.Date >= monthStart && e.Date <= monthEnd && e.IsFixed);
}
```

---

## 5. Modo de carga "como pre-asignado"

Al cargar un archivo JSON en modo **"Cargar como pre-asignado"**, antes de restaurar el estado se aplica esta transformación:

**Paso 1**: Recopilar todas las fechas `Work` de cada médico en el horario.

**Paso 2**: Convertir todas las entradas `Work` del horario a `Pre-assigned`.

**Paso 3**: Para cada médico en los perfiles, fusionar sus `preAssignedWorkDates` existentes con las nuevas fechas extraídas del paso 1, eliminando duplicados.

**Paso 4**: El horario resultante tiene solo `Pre-assigned`, `Vacation` y `Off` (ningún `Work`).

**Propósito**: Permite tomar un horario generado anteriormente y usarlo como base fija para el siguiente periodo, de modo que el algoritmo de generación respete esas fechas como compromisos inamovibles.

```csharp
public (Schedule TransformedSchedule, List<DoctorProfile> TransformedProfiles, ScheduleParameters TransformedParams)
    ApplyLoadAsPreAssigned(
        Schedule schedule,
        List<DoctorProfile> profiles,
        ScheduleParameters parameters)
{
    // Recopilar fechas Work por médico
    var workDatesByDoctor = schedule.Entries
        .Where(e => e.Assignment == AssignmentType.Work && e.DoctorId != "system")
        .GroupBy(e => e.DoctorId)
        .ToDictionary(g => g.Key, g => g.Select(e => e.Date).ToList());

    // Transformar entradas del horario
    var transformedEntries = schedule.Entries
        .Select(e => e.Assignment == AssignmentType.Work && e.DoctorId != "system"
            ? e with { Assignment = AssignmentType.PreAssigned }
            : e)
        .ToList();

    // Fusionar preAssignedWorkDates en perfiles
    var transformedProfiles = profiles.Select(p =>
    {
        var additionalDates = workDatesByDoctor.GetValueOrDefault(p.Id, []);
        var mergedDates = p.PreAssignedWorkDates.Union(additionalDates).Distinct().OrderBy(d => d).ToList();
        return p with { PreAssignedWorkDates = mergedDates };
    }).ToList();

    // Igual para los doctors en parameters
    var transformedDoctors = parameters.Doctors.Select(d =>
    {
        var additionalDates = workDatesByDoctor.GetValueOrDefault(d.Id, []);
        var mergedDates = d.PreAssignedWorkDates.Union(additionalDates).Distinct().OrderBy(d => d).ToList();
        return d with { PreAssignedWorkDates = mergedDates };
    }).ToList();

    var transformedSchedule = schedule with { Entries = transformedEntries };
    var transformedParams = parameters with { Doctors = transformedDoctors };

    return (transformedSchedule, transformedProfiles, transformedParams);
}
```

---

## 6. Gestión de versiones guardadas

### 6.1 Guardar una versión nueva

```
Entrada: nombre (obligatorio), descripción (opcional),
         parámetros actuales, horario actual (opcional), avisos actuales

1. Generar un ID único (GUID)
2. Establecer createdAt = DateTime.UtcNow
3. Establecer lastModified = DateTime.UtcNow
4. Serializar a JSON y escribir en: %LOCALAPPDATA%\RotaWise\Versions\{id}.json
5. Actualizar index.json con la nueva entrada {id, name, lastModified}
```

### 6.2 Cargar una versión

```
1. Leer el archivo {id}.json de la carpeta de versiones
2. Deserializar parámetros y horario (si existe)
3. Si se cargó un horario:
   → Restaurar el horario completo y los perfiles de médicos
   → Actualizar el formulario de configuración con los parámetros de la versión
4. Si no hay horario guardado en la versión:
   → Solo restaurar el formulario con los parámetros
   → El usuario deberá generar el horario de nuevo
5. Los avisos de la versión se restauran como avisos activos
```

### 6.3 Sobreescribir una versión existente

```
Actualiza en el archivo {id}.json:
  - parameters: nuevos parámetros actuales
  - generatedSchedule: nuevo horario actual (opcional)
  - warnings: nuevos avisos
  - lastModified: DateTime.UtcNow

NO modifica: id, name, description, createdAt
```

### 6.4 Renombrar/editar descripción de una versión

```
Actualiza en el archivo {id}.json:
  - name: nuevo nombre (si se proporciona)
  - description: nueva descripción (si se proporciona)
  - lastModified: DateTime.UtcNow

NO modifica: id, createdAt, parameters, generatedSchedule, warnings
```

### 6.5 Eliminar una versión

```
1. Eliminar el archivo {id}.json
2. Actualizar index.json eliminando la entrada con ese id
```

### 6.6 Índice de versiones (index.json)

Para evitar leer todos los archivos de versión al mostrar el listado, mantener un índice:

```json
[
  {
    "id": "ver-abc123",
    "name": "Guardia Enero 2026",
    "lastModified": "2026-01-16T08:45:00.000Z"
  },
  {
    "id": "ver-def456",
    "name": "Guardia Febrero 2026",
    "lastModified": "2026-02-01T12:00:00.000Z"
  }
]
```

El listado se ordena por `lastModified` descendente (la más reciente primero).

---

## 7. Auto-guardado del estado de sesión

La sesión activa (horario + parámetros) se guarda automáticamente sin que el usuario lo pida, equivalente al `localStorage` de la web.

### 7.1 Cuándo auto-guardar

- Al generar un nuevo horario.
- Al modificar cualquier entrada del horario (ajuste manual o drag & drop).
- Al fijar/desfijar un mes.
- Al cargar datos desde un archivo.
- Al cargar una versión guardada.
- Nunca al simplemente cambiar el formulario de configuración sin generar (eso lo gestiona el auto-guardado de parámetros).

### 7.2 Auto-guardado de parámetros del formulario

Los cambios en el formulario (nombres de médicos, fechas, etc.) se guardan con un debounce de **500ms** para no escribir en disco en cada pulsación de tecla.

```csharp
// En ConfigurationViewModel
private CancellationTokenSource? _autoSaveCts;

partial void OnDoctorsChanged() => ScheduleAutoSave();

private async void ScheduleAutoSave()
{
    _autoSaveCts?.Cancel();
    _autoSaveCts = new CancellationTokenSource();
    try
    {
        await Task.Delay(500, _autoSaveCts.Token);
        await _persistenceService.SaveParametersOnlyAsync(GetCurrentParameters());
    }
    catch (OperationCanceledException) { /* cancelado por nuevo cambio */ }
}
```

### 7.3 Restauración al arrancar

Al iniciar la aplicación:

```
1. Intentar leer rotawise-state.json (estado completo con horario)
   → Si existe y es válido: restaurar horario + perfiles + formulario + avisos
   → Mostrar un aviso no intrusivo: "Se ha restaurado la sesión anterior."

2. Si no existe o falla, intentar leer rotawise-params.json (solo parámetros)
   → Si existe y es válido: restaurar solo el formulario de configuración
   → No mostrar aviso

3. Si ninguno existe: estado inicial vacío
```

---

## 8. Borrar horario vs. borrar datos de médicos

### 8.1 Borrar horario

```
Efecto:
  - Eliminar el horario activo (ActiveSchedule = null)
  - Limpiar los avisos (ScheduleWarnings = [])
  - Eliminar rotawise-state.json del disco

No afecta:
  - Los datos del formulario de configuración (médicos, fechas, parámetros)
  - El archivo rotawise-params.json
```

### 8.2 Borrar datos de médicos

```
Efecto:
  - Poner numberOfDoctors a 0
  - Vaciar la lista de médicos en el formulario
  - Actualizar rotawise-params.json (o eliminarlo)

No afecta:
  - El horario generado (si existe, permanece)
  - Las fechas de inicio/fin y los parámetros numéricos del formulario
```

---

## 9. Generación del horario con entradas fijas

Al regenerar el horario (el usuario ya tiene uno generado y vuelve a pulsar "Generar"):

```
1. Recopilar todas las entradas marcadas como IsFixed = true del horario actual
2. Llamar al algoritmo de generación pasando esas entradas como existingFixedEntries
3. El algoritmo:
   a. Añade esas entradas fijas al horario antes de empezar el bucle
   b. Inicializa las estadísticas contando las entradas fijas
   c. Al procesar cada día, si ya existe una entrada fija para ese día, la respeta y no asigna automáticamente
4. Resultado: el horario regenerado conserva todas las entradas fijas y reasigna el resto
```

Esto permite que el usuario fije los meses ya acordados (usando "Fijar mes") y regenere solo los meses futuros.
