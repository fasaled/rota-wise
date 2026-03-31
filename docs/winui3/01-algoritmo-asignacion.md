# Algoritmo de Asignación de Guardias — Especificación Completa

Este documento describe con exactitud el algoritmo de generación de horarios de guardias médicas implementado en Rota-Wise, con el objetivo de servir como referencia para reimplementarlo en cualquier plataforma (p. ej. WinUI 3 + MVVM con C#).

---

## 1. Entradas del algoritmo

### 1.1 Parámetros globales del periodo

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `startDate` | Fecha | Sí | Primer día del periodo a planificar |
| `endDate` | Fecha | Sí | Último día del periodo a planificar |
| `minIntervalBetweenWorkDays` | Entero ≥ 0 | No (defecto: 1) | Días mínimos de descanso **entre** dos guardias consecutivas del mismo médico. Con valor 1, un médico no puede hacer guardia dos días seguidos. Con valor 0, puede hacerlas en días consecutivos. Máximo permitido: 30. |
| `globalMonthlyShiftLimit` | Entero ≥ 0 | No | Límite máximo de guardias por médico por mes natural. Se aplica por igual a todos los médicos. Si se omite o es 0, no hay límite mensual. Máximo permitido: 31. |

### 1.2 Lista de médicos

Hasta 20 médicos. Cada médico tiene:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | Cadena única | Sí | Identificador interno del médico |
| `name` | Cadena | Sí | Nombre mostrado en el horario |
| `vacationDates` | Lista de fechas | No | Días en que el médico está de vacaciones. Se registra en el horario como entrada `Vacation` pero **no** cuenta como guardia ni como día de descanso. |
| `preAssignedWorkDates` | Lista de fechas | No | Días que el médico **ya tiene asignados** de antemano (p. ej. guardias de otro servicio). Cuentan como guardia a efectos de estadísticas y restricciones de intervalo. |
| `excludedDates` | Lista de fechas | No | Días en que el médico no está disponible (sin ser vacaciones formales). No genera entrada en el horario; simplemente lo excluye de la selección ese día. |
| `isExcludedFromAutomaticAssignment` | Booleano | No (defecto: false) | Si es `true`, el médico nunca es asignado automáticamente. Puede aparecer en el horario solo a través de `preAssignedWorkDates` o entradas fijas manuales. |

### 1.3 Entradas fijas preexistentes (`existingFixedEntries`)

Lista opcional de `ScheduleEntry` marcadas con `isFixed = true`. Son asignaciones manuales que el algoritmo debe respetar tal cual, sin modificarlas ni sobreescribirlas. Se incorporan al horario antes de comenzar el bucle principal y sus estadísticas se inicializan antes del proceso de asignación automática.

---

## 2. Modelo de datos de salida

Cada día del periodo genera una o más entradas de tipo `ScheduleEntry`:

| Campo | Tipo | Valores posibles |
|---|---|---|
| `date` | Fecha | Día al que corresponde la entrada |
| `doctorId` | Cadena | ID del médico, o `"system"` para días sin cobertura |
| `assignment` | Enumerado | `Work`, `Pre-assigned`, `Vacation`, `Off` |
| `dayOfWeek` | Cadena | Nombre completo del día de la semana en inglés (p. ej. `"Monday"`) |
| `isFixed` | Booleano | `true` si la entrada fue fijada manualmente y no debe alterarse |

**Semántica de `assignment`:**
- `Work` — Guardia asignada automáticamente por el algoritmo.
- `Pre-assigned` — Guardia procedente de `preAssignedWorkDates` del médico.
- `Vacation` — El médico está de vacaciones ese día.
- `Off` — Día sin cobertura (ningún médico elegible pudo ser asignado).

Un mismo día puede tener **múltiples entradas** (p. ej. varios médicos de vacaciones más uno trabajando).

---

## 3. Estadísticas internas mantenidas por médico

Durante la ejecución, el algoritmo mantiene las siguientes estadísticas actualizadas en tiempo real para cada médico:

| Estadística | Descripción |
|---|---|
| `totalWorkdays` | Total de guardias acumuladas en todo el periodo |
| `workloadByDayOfWeek` | Contador de guardias por día de la semana (`Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`) |
| `monthlyWorkdays` | Contador de guardias por mes (`yyyy-MM`) |
| `weekendDaysThisMonth` | Contador de guardias en fin de semana por mes (Viernes, Sábado, Domingo) |
| `lastWorkDay` | Fecha de la última guardia realizada (para medir tiempo de inactividad) |

Las estadísticas se inicializan teniendo en cuenta:
- Las entradas fijas (`existingFixedEntries`) que caen dentro del periodo.
- Las `preAssignedWorkDates` anteriores a `startDate` (solo para calcular `lastWorkDay` inicial).

---

## 4. Flujo principal del algoritmo

El algoritmo itera **día a día** desde `startDate` hasta `endDate` en orden cronológico.

```
Para cada día D en [startDate, endDate]:

  1. Verificar si D tiene una entrada fija → si la hay, registrarla y avanzar.
  2. Registrar entradas de vacaciones de todos los médicos que tengan D en vacationDates.
  3. Registrar entradas Pre-assigned de todos los médicos que tengan D en preAssignedWorkDates
     (actualizar estadísticas).
  4. Si ninguna pre-asignación ni entrada fija cubre D:
       a. Filtrar médicos elegibles (ver sección 5).
       b. Si hay elegibles → ordenarlos por criterios de prioridad (ver sección 6)
          → asignar el primero → actualizar estadísticas.
       c. Si no hay elegibles → registrar entrada Off + generar aviso de día sin cobertura.
```

### Nota importante sobre días con pre-asignaciones

Si un día ya tiene al menos una entrada `Pre-assigned`, el algoritmo **no intenta** asignar automáticamente a otro médico ese mismo día. Cada día recibe exactamente **una guardia** (ya sea automática, pre-asignada o fija), salvo que no haya nadie disponible (`Off`).

---

## 5. Restricciones de elegibilidad (filtros para asignación automática)

Un médico es elegible para un día D si y solo si **cumple todas** las condiciones siguientes:

### 5.1 No está de vacaciones
`D` no debe estar en `vacationDates` del médico.

### 5.2 No está excluido ese día
`D` no debe estar en `excludedDates` del médico.

### 5.3 No está excluido de asignación automática
`isExcludedFromAutomaticAssignment` debe ser `false`.

### 5.4 Respeta el intervalo mínimo entre guardias (restricción dura)
La diferencia en días naturales entre D y **cualquier otra guardia ya comprometida** del médico debe ser **estrictamente mayor** que `minIntervalBetweenWorkDays`.

Las guardias comprometidas incluyen:
- Todas las `preAssignedWorkDates` del médico (incluidas las futuras aún no procesadas).
- Todas las entradas fijas `Work` o `Pre-assigned` en `existingFixedEntries`.
- Todas las entradas `Work` o `Pre-assigned` ya generadas en el horario actual.

Fórmula: `|D - guardiaExistente| > minIntervalBetweenWorkDays` para toda guardia existente.

### 5.5 No supera el límite mensual global (restricción dura)
Si `globalMonthlyShiftLimit` está definido y es mayor que 0, el total de guardias comprometidas del médico en el mes de D no puede alcanzar ni superar dicho límite.

El total comprometido en el mes se calcula como:
```
totalComprometidoMes = (preAssignedWorkDates en ese mes)
                     + (entradas Work ya generadas automáticamente en ese mes)
```

Si `totalComprometidoMes >= globalMonthlyShiftLimit` → médico no elegible.

---

## 6. Criterios de ordenación para selección del médico (prioridades)

Cuando hay varios médicos elegibles, se ordenan de menor a mayor puntuación aplicando los siguientes criterios **en orden de prioridad**. Se selecciona el primero (el de menor carga).

### Prioridad 1 — Total de guardias acumuladas
El médico con menos guardias totales tiene prioridad. Favorece la equidad global a lo largo de todo el periodo.

### Prioridad 2 — Déficit en el día de la semana actual
Para el día de la semana de D (p. ej. lunes), se calcula la media de guardias en ese día para todos los médicos. El médico con mayor déficit respecto a esa media (es decir, el más "subrepresentado" en ese día de la semana) tiene prioridad.

```
déficit(médico, díaSemana) = mediaGlobal(díaSemana) - guardias(médico, díaSemana)
```
Mayor déficit → mayor prioridad.

### Prioridad 3 — Equidad en guardias de fin de semana del mes (solo si D es Viernes/Sábado/Domingo)
Si D cae en fin de semana, se compara el número de guardias en fin de semana que cada médico ha hecho en el mes natural actual. El médico con menos guardias de fin de semana ese mes tiene prioridad.

### Prioridad 4 — Conteo directo en el día de la semana actual
Comparación directa del número de veces que cada médico ha hecho guardia en ese día de la semana específico. Menor conteo → mayor prioridad.

### Prioridad 5 — Ratio de carga mensual ajustado a disponibilidad
```
ratio(médico, mes) = guardiasEnMes / díasDisponiblesEnMes
```
Los días disponibles de un médico en un mes son los días del periodo dentro de ese mes que no son vacaciones ni excluidos. Menor ratio → mayor prioridad.

### Prioridad 6 — Tiempo de inactividad (último día trabajado)
El médico que lleva más tiempo sin trabajar (cuyo `lastWorkDay` es más antiguo o nulo) tiene prioridad. Un `lastWorkDay` nulo (nunca ha trabajado) se considera el caso de mayor inactividad.

### Prioridad 7 — Desempate aleatorio
Si todos los criterios anteriores empatan, se selecciona aleatoriamente.

---

## 7. Avisos (warnings) generados

El algoritmo puede retornar los siguientes avisos junto al horario:

| Clave de aviso | Condición | Parámetros |
|---|---|---|
| `warnings.multiplePreAssignedInput` | Dos o más médicos tienen la misma fecha en `preAssignedWorkDates` | `date`, `doctors` (lista de nombres) |
| `warnings.uncoveredDay` | Un día queda sin cobertura porque todos los médicos disponibles (no de vacaciones, no excluidos, no excluidos de auto) están bloqueados por restricciones de intervalo o límite mensual | `date` |

---

## 8. Casos especiales

### Día sin ningún médico
Si la lista de médicos está vacía, todos los días generan una entrada `Off` sin aviso.

### Día totalmente bloqueado por vacaciones/exclusiones
Si todos los médicos están de vacaciones o excluidos ese día (sin que ninguno esté bloqueado por restricciones de intervalo/límite), el día queda sin asignación automática pero **no** genera aviso de día sin cobertura, porque no hay médico "potencialmente disponible pero restringido".

### Entrada fija en un día pre-asignado
Si un médico tiene ese día tanto en `preAssignedWorkDates` como una entrada fija de otro médico, la entrada fija toma precedencia para ese médico concreto (no se duplica).

---

## 9. Restricciones de validación de entrada

| Campo | Validación |
|---|---|
| Número de médicos | 0–20 |
| `endDate` | Debe ser igual o posterior a `startDate` |
| `minIntervalBetweenWorkDays` | Entero 0–30, defecto 1 |
| `globalMonthlyShiftLimit` | Entero 0–31, opcional |
| Nombres de médico | No pueden estar vacíos |

---

## 10. Resumen visual del flujo de decisión por día

```
┌─────────────────────────────────────────┐
│  Día D                                  │
├─────────────────────────────────────────┤
│  ¿Tiene entrada fija?                   │
│    Sí → Conservar tal cual, continuar   │
│    No ↓                                 │
│  Registrar vacaciones del día           │
│  ¿Algún médico tiene D en              │
│   preAssignedWorkDates?                 │
│    Sí → Registrar Pre-assigned(s),      │
│          actualizar stats, continuar    │
│    No ↓                                 │
│  Filtrar médicos elegibles              │
│  (vacaciones, exclusiones, intervalo,   │
│   límite mensual)                       │
│    ¿Hay elegibles?                      │
│      Sí → Ordenar por prioridades 1–7  │
│            → Asignar el primero         │
│            → Actualizar stats           │
│      No  → Registrar Off               │
│            ¿Alguno disponible pero     │
│             restringido por interval/  │
│             límite?                     │
│              Sí → Emitir warning       │
│              No → Sin warning          │
└─────────────────────────────────────────┘
```

---

## 11. Consideraciones para la implementación en C# / WinUI 3

- **Sin aleatoriedad en producción**: El desempate aleatorio (prioridad 7) puede reemplazarse por orden alfabético de nombre o de ID para resultados deterministas si se desea reproducibilidad.
- **Fechas sin hora**: Todas las comparaciones de fechas son a nivel de día natural (`DateOnly` en C#). No usar `DateTime` con horas para evitar problemas de zona horaria.
- **Persistencia**: El horario generado puede exportarse/importarse como JSON. Las fechas se serializan en formato ISO 8601 (`yyyy-MM-dd`).
- **Regeneración parcial**: El sistema admite "entradas fijas" (`isFixed`) para preservar asignaciones manuales al regenerar el horario. Al regenerar, se pasan estas entradas como `existingFixedEntries`.
- **Idiomas**: Los nombres de día de la semana en la salida (`dayOfWeek`) se almacenan en inglés internamente. La UI los traduce al idioma del usuario.
