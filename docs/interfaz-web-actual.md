# Interfaz Web Actual — Documentación Exacta

Este documento describe la interfaz de usuario de la aplicación web Rota-Wise tal y como está implementada, sin interpretaciones ni adaptaciones.

---

## 1. Layout global

La aplicación es una **Single Page Application** sin pestañas ni navegación lateral. Todo el contenido se muestra en una sola columna vertical con scroll.

### 1.1 Cabecera (`<header>`)

Barra fija en la parte superior con fondo de card y borde inferior. Contiene:
- **Izquierda**: icono de tema (ThemeIcon) + título "Rota-Wise" en grande + subtítulo descriptivo en pequeño.
- **Derecha**: selector de idioma (EN/ES) + botón toggle de tema claro/oscuro.

### 1.2 Contenido principal (`<main>`)

Sección con padding y espacio vertical entre bloques. Los bloques aparecen de arriba a abajo en este orden:

1. **Formulario de entrada de datos** — siempre visible.
2. **Barra de botones de acción** — siempre visible, debajo del formulario.
3. **Tarjeta de avisos** — visible solo si hay avisos tras generar el horario.
4. **Calendario** — visible solo si hay horario generado.
5. **Tabla resumen por día de la semana** — visible solo si hay horario generado.
6. **Tabla resumen mensual** — visible solo si hay horario generado.

### 1.3 Pie de página (`<footer>`)

Línea de copyright centrada, texto pequeño en color muted.

---

## 2. Formulario de entrada de datos

Componente: `DataInputForm`. Se renderiza dentro de una `Card` con sombra.

### 2.1 Cabecera del formulario

- Icono de preferencias + título "Configuración del Horario".
- Descripción breve debajo del título.

### 2.2 Fila de parámetros globales

Grid de 5 columnas (responsive: 1 columna en móvil, 2 en tablet, 5 en desktop). Cada campo tiene label encima y el control debajo:

| Nº | Campo | Control | Valor por defecto | Validación |
|---|---|---|---|---|
| 1 | Número de médicos | `<input type="number">` | 0 | 0–20 |
| 2 | Fecha de inicio | Botón que abre `Popover` con `Calendar` (selección simple) | — | Obligatorio |
| 3 | Fecha de fin | Botón que abre `Popover` con `Calendar` (selección simple) | — | ≥ hoy, ≥ fecha inicio |
| 4 | Intervalo mínimo entre guardias | `<input type="number">` con icono reloj en label | 1 | 0–30 |
| 5 | Límite mensual global | `<input type="number">` con placeholder | vacío | 0–31, opcional |

**Comportamiento del campo "Número de médicos"**: la lista de médicos se sincroniza al perder el foco (`onBlur`), no en cada pulsación. Si se aumenta, se añaden cards vacías; si se reduce, se eliminan las últimas.

**Selección de fecha**: al hacer clic en el botón se abre un popover con un calendario mensual. La fecha seleccionada se muestra formateada en el botón.

### 2.3 Separador visual

`<Separator>` horizontal entre los parámetros globales y la lista de médicos.

### 2.4 Sección de médicos

Encabezado con icono de médicos y texto "Detalles de los Médicos".

La lista de cards de médicos es **reordenable mediante drag & drop** (biblioteca `@dnd-kit`). El drag se activa tras mover el puntero 8px; también funciona con teclado. Durante el arrastre la card arrastrada se vuelve semitransparente (opacity 0.5).

**Card de cada médico:**

- Cabecera de la card: "Médico 1", "Médico 2", etc. + botón de papelera (rojo) en la esquina derecha para eliminar ese médico. Al eliminar, el contador de "Número de médicos" se decrementa automáticamente.
- Contenido de la card (`CardContent`), dos filas:

  **Fila 1** — grid de 2 columnas:
  - `TextBox` con placeholder para el nombre del médico. Obligatorio, no puede estar vacío.
  - `Checkbox` con label "Excluir de asignación automática". Alineado a la derecha en desktop, debajo del nombre en móvil.

  **Fila 2** — grid de 3 columnas:
  - **Vacaciones** (icono sol, color accent): botón que muestra "N fechas seleccionadas" o "Seleccionar fechas". Al hacer clic abre un `Popover` con `Calendar` en modo selección múltiple.
  - **Fechas pre-asignadas** (icono calendario con check, color primary): mismo patrón de botón + popover.
  - **Fechas excluidas** (icono calendario con X, color destructive): mismo patrón de botón + popover.

**Comportamiento del calendario de selección múltiple:**
- Solo permite seleccionar fechas dentro del rango `[startDate, endDate]`.
- Soporte de **Shift+clic** para seleccionar un rango: al mantener Shift y hacer clic en una fecha, se añaden al conjunto todas las fechas entre el último clic y el actual.
- Solo un popover puede estar abierto a la vez.

### 2.5 Botón de generación

Botón primario alineado a la derecha, texto "Generar Horario". Muestra un spinner animado y el texto "Generando..." mientras está en curso. Deshabilitado si no hay médicos o todos tienen nombre vacío, o si está procesando.

**No hay botón "Guardar parámetros" dentro del formulario.** El guardado es implícito: cada cambio en el formulario se persiste automáticamente en `localStorage` con un debounce de 500ms.

---

## 3. Barra de botones de acción

Fila de botones centrada, horizontal con wrap, entre el formulario y el calendario. Todos son variante `outline` excepto "Borrar horario" que es `destructive`.

| Botón | Icono | Condición de habilitación | Acción |
|---|---|---|---|
| Guardar datos | `FileDown` | Hay horario O hay médicos con nombre | Descarga JSON (`rotawise-schedule.json` o `rotawise-parameters.json`) |
| Cargar datos | `Upload` | Siempre | Abre selector de archivo `.json`; carga parámetros+horario tal cual |
| Cargar como pre-asignado | `Layers` | Siempre | Abre selector de archivo `.json`; convierte todas las guardias `Work` en `Pre-assigned` al cargar |
| Exportar PDF | `FileDown` | Hay horario generado | Genera y descarga `rotawise-report.pdf` |
| Exportar Word | `FileDown` | Hay horario generado | Genera y descarga `.docx` con el nombre del informe + fecha |
| Borrar horario | `Trash2` | Hay horario generado | Abre diálogo de confirmación; borra el horario pero conserva los datos del formulario |
| Borrar datos de médicos | `UserX` | Hay médicos con nombre | Abre diálogo de confirmación; pone a 0 el número de médicos y vacía la lista |

**Exportar PDF** y **Exportar Word** muestran spinner inline en el botón mientras procesan. El resto de botones se deshabilitan durante esas operaciones.

---

## 4. Tarjeta de avisos del algoritmo

Visible solo cuando `scheduleWarnings.length > 0`. Card con borde rojo (`border-destructive`).

- Encabezado: icono de triángulo de advertencia (rojo) + título en rojo.
- Contenido: lista (`<ul>`) de avisos, cada uno como `<li>` en texto rojo.

Tipos de aviso posibles:
- `warnings.multiplePreAssignedInput` — dos médicos tienen la misma fecha pre-asignada.
- `warnings.uncoveredDay` — un día quedó sin cobertura porque todos los elegibles estaban bloqueados por restricciones.

---

## 5. Vista de calendario

Componente: `ScheduleCalendarView`. Card con sombra grande.

### 5.1 Cabecera del calendario

Dos filas (responsive: una fila en desktop, apilado en móvil):

**Izquierda**: icono de calendario + título "Calendario de Guardias".

**Derecha** (controles):
- `Select` (desplegable) para filtrar por médico: opciones "Todos los médicos" + cada médico por nombre.
- `Select` para filtrar por tipo de asignación: "Todos", "Solo guardias", "Solo vacaciones".
- Botón `◀` (chevron izquierda) para ir al mes anterior.
- Texto con el mes y año actual (e.g. "marzo 2026"), ancho fijo de 32 (8rem), centrado.
- Botón `▶` (chevron derecha) para ir al mes siguiente.
- Botón **"Fijar mes" / "Desfijar mes"**: muestra icono candado cerrado si el mes ya tiene entradas fijas, candado abierto si no. Variante `default` (acento) cuando está fijado, `outline` cuando no.

### 5.2 Cuadrícula del calendario

Grid de 7 columnas.

**Fila de cabecera**: nombres de días abreviados según el locale del usuario (Lun, Mar, etc.), texto pequeño en color muted.

**Celdas de día**: altura fija (~112–144px según breakpoint). Cada celda es un `div` rectangular redondeado con:
- Fondo `bg-card` si el día es del mes actual; fondo `bg-muted/30` si es de otro mes.
- Al hover: sombra suave (`hover:shadow-md`).
- Resaltado azul (`ring-2 ring-blue-500`) cuando se arrastra algo encima (zona de drop).
- Número de día en la esquina superior izquierda. Si es hoy: fondo de color primario, texto blanco, forma circular.
- Lista de entradas debajo del número, con scroll vertical si hay muchas.

**Las entradas de tipo `Off` (sistema) nunca se renderizan visualmente.**

### 5.3 Chips de asignación dentro de cada celda

Cada asignación se muestra como un chip redondeado con icono + nombre del médico truncado:

| Tipo | Fondo (claro/oscuro) | Texto | Icono |
|---|---|---|---|
| `Work` | `bg-blue-200` / `bg-blue-800` | `text-blue-700` / `text-blue-300` | WorkIcon |
| `Pre-assigned` | `bg-orange-200` / `bg-orange-800` | `text-orange-700` / `text-orange-300` | PreAssignedIcon |
| `Vacation` | `bg-emerald-200` / `bg-emerald-800` | `text-emerald-700` / `text-emerald-300` | VacationIcon |

Si la entrada tiene `isFixed = true`: borde naranja (`ring-2 ring-orange-500 ring-opacity-75`) + emoji 🔒 al final del nombre.

### 5.4 Drag & drop entre celdas

**Solo** los chips de tipo `Work` **sin** `isFixed` son arrastrables. El drag se activa al mover el puntero 8px (evita drags accidentales).

Durante el drag:
- El chip origen se vuelve semitransparente (`opacity: 0.5`).
- Se muestra un `DragOverlay` (copia visual del chip, ligeramente rotado 3°, sombra grande).
- La celda de destino se resalta en azul al pasar por encima.

Al soltar:
- **Celda vacía (sin guardia)**: el médico se mueve a la nueva fecha.
- **Celda con otro médico no fijo**: los dos médicos intercambian fechas.
- **Celda con entrada fija**: bloqueado, se muestra toast de error.
- **Entrada fija como origen**: imposible arrastrar.

Resultado mostrado mediante `toast` en la esquina.

### 5.5 Clic en celda o chip → Diálogo de ajuste manual

- Clic en **zona vacía de la celda**: abre el diálogo para **agregar** una nueva asignación en esa fecha (`entry = null`).
- Clic en **chip de `Work` o `Pre-assigned`**: abre el diálogo para **modificar** esa entrada.
- Clic en **chip de `Vacation`**: no abre el diálogo; muestra un toast informando que las vacaciones no son editables aquí.

### 5.6 Fijar/desfijar mes completo

El botón "Fijar mes" marca como `isFixed = true` todas las entradas `Work` y `Pre-assigned` del mes visible. El botón "Desfijar mes" las pone a `false`. Esto no afecta a `Vacation` ni a `Off`.

### 5.7 Leyenda

Tres chips de colores al pie del calendario:
- 🔵 Guardia (Draggable)
- 🟠 Pre-asignada
- 🟢 Vacaciones

---

## 6. Diálogo de ajuste manual

Componente: `ManualAdjustmentDialog`. Modal centrado (`Dialog` de Radix UI), ancho máximo 425px.

### 6.1 Cabecera

- **Título**: "Ajustar Asignación — [fecha formateada con locale]"
- **Descripción**: "Modifica la asignación existente para este día." o "Añade una nueva asignación para este día."

### 6.2 Cuerpo del formulario

Grid de filas, cada fila con label a la derecha (1 columna) y control a la izquierda (3 columnas):

**Campo: Médico**
- `Select` desplegable con la lista completa de médicos.
- Se deshabilita si el tipo de asignación es `Off`.
- Estado inicial al abrir: el médico de la entrada existente, o el primer médico de la lista si es nueva.

**Campo: Tipo de asignación**
- `Select` con solo dos opciones: `Work` ("Guardia") y `Off` ("Libre").
- No se permite seleccionar `Pre-assigned` desde aquí (las pre-asignadas se gestionan desde el formulario de configuración).
- Si la entrada existente era `Pre-assigned`, el diálogo la muestra como `Work`.
- Estado inicial: el tipo de la entrada existente (o `Work` si es nueva / si era Pre-assigned).

**Campo: Marcar como fija**
- `Checkbox` + label "Preservar al regenerar el horario."
- Si está marcada, esta entrada no se sobreescribe cuando se vuelve a generar el horario.
- Estado inicial: el valor `isFixed` de la entrada existente, o `false` si es nueva.

### 6.3 Validaciones

Las validaciones se ejecutan al pulsar "Guardar" (`handleSave`). Se muestran como **toasts** (notificaciones emergentes en la esquina), no como mensajes inline en el formulario:

| Validación | Bloquea el guardado | Mensaje toast |
|---|---|---|
| Tipo `Work` sin médico seleccionado | **Sí** | Error de validación |
| Médico de vacaciones en esa fecha | **Sí** | No se puede asignar guardia en día de vacaciones |
| Médico con esa fecha en `excludedDates` | **No** (solo avisa) | Advertencia de fecha excluida |
| Intervalo mínimo violado (guardia previa demasiado cercana) | **No** (solo avisa) | Advertencia de intervalo mínimo |
| Intervalo mínimo violado (guardia siguiente demasiado cercana) | **No** (solo avisa) | Advertencia de intervalo mínimo |

### 6.4 Pie del diálogo

- Botón "Cancelar" (outline) — cierra sin guardar.
- Botón "Guardar" (primario) — ejecuta validaciones y, si pasan las bloqueantes, aplica el cambio, cierra el diálogo y muestra toast de confirmación.

### 6.5 Lógica de guardado

Al guardar con tipo `Work`: reemplaza cualquier entrada `Work`/`Pre-assigned` existente de ese día (para ese médico o para cualquier otro), y elimina entradas `system/Off` del día.

Al guardar con tipo `Off`: elimina las entradas `Work` y `Pre-assigned` del día, conserva las de `Vacation`, y añade una entrada `{doctorId: 'system', assignment: 'Off'}`.

---

## 7. Tabla resumen por día de la semana

Componente: `ScheduleSummaryTable`. Card con sombra, solo visible si hay horario generado.

- Encabezado: icono de gráfico de barras + título "Resumen de Guardias por Día".
- Tabla con scroll horizontal si el contenido no cabe.

**Estructura de la tabla:**

| Médico | Lun | Mar | Mié | Jue | Vie | Sáb | Dom | Total |
|---|---|---|---|---|---|---|---|---|
| Dr. García | 2 | 1 | 3 | ... | | | | **N** |

- Cabeceras de columna: nombre del médico + 7 días abreviados + "Total".
- Filas: una por médico. Solo cuenta entradas `Work` y `Pre-assigned`; ignora `system`.
- Columna "Total" en negrita (`font-semibold`).
- No hay fila de totales por columna en esta tabla.

---

## 8. Tabla resumen mensual

Componente: `MonthlyWorkloadSummaryTable`. Card con sombra, solo visible si hay horario generado.

- Encabezado: icono de gráfico horizontal + título "Carga de Trabajo Mensual".
- Tabla con scroll horizontal.

**Estructura de la tabla:**

| Médico | Ene 2026 | Feb 2026 | ... | Total |
|---|---|---|---|---|
| Dr. García | 5 | 4 | ... | **15** |
| **Total** | **9** | **9** | ... | **29** |

- Columnas: nombre del médico + una columna por mes natural del periodo + "Total".
- Última fila: totales por mes (fondo diferenciado `bg-muted/50`, texto `font-semibold`).
- Solo cuenta entradas `Work` y `Pre-assigned`; ignora `system`.

---

## 9. Persistencia automática

La aplicación guarda el estado automáticamente en `localStorage` sin que el usuario tenga que hacer nada:

| Clave | Contenido | Cuándo se guarda |
|---|---|---|
| `rotawiseAppState` | Horario completo + perfiles de médicos + valores del formulario + avisos | Cada vez que cambia el horario o los perfiles |
| `rotawiseFormInputState` | Solo los valores del formulario (sin horario) | Cada cambio en el formulario, con debounce 500ms |

Al cargar la app, primero intenta restaurar `rotawiseAppState`; si no existe, intenta `rotawiseFormInputState`.

---

## 10. Diálogos de confirmación

Dos diálogos de confirmación (`AlertDialog` de Radix UI) para acciones destructivas:

**"¿Borrar horario generado?"**
- Se activa desde el botón "Borrar horario".
- Botones: Cancelar / Confirmar (destructivo).
- Efecto: borra el horario de estado y de `localStorage`, conserva el formulario.

**"¿Borrar datos de médicos?"**
- Se activa desde el botón "Borrar datos de médicos".
- Botones: Cancelar / Confirmar (destructivo).
- Efecto: pone `numberOfDoctors` a 0 y vacía el array de médicos en el formulario.

---

## 11. Sistema de notificaciones (toasts)

Componente `Toaster` de shadcn/ui. Las notificaciones emergen en la esquina inferior derecha (comportamiento por defecto). Cada toast tiene un título, descripción y variante:

- **Default** (sin variante): confirmaciones de acciones exitosas.
- **Destructive**: errores y validaciones bloqueantes.
- Los avisos del algoritmo se muestran como toasts individuales con duración de 10 segundos (frente a los ~3s por defecto).

---

## 12. Exportación PDF

Descarga directa del archivo `rotawise-report.pdf`. Estructura del PDF:

1. **Encabezado**: título del informe (centrado, azul), periodo del horario, intervalo mínimo.
2. **Línea separadora** horizontal.
3. **Sección de avisos** (si los hay): listados en texto.
4. **Calendarios mensuales**: uno por mes, grid 7×N con número de día + nombre del médico en cada celda.
5. **Detalle por médico**: tabla con todas sus fechas de guardia.
6. **Tabla resumen por día de la semana**.
7. **Tabla resumen mensual**.
8. **Pie de página** en cada hoja: fecha de generación (izquierda) + número de página (derecha).

---

## 13. Exportación Word (.docx)

Misma estructura que el PDF pero en formato Word:
1. Título centrado en negrita.
2. Periodo y parámetros.
3. Avisos (si los hay).
4. Calendarios mensuales como tablas Word de 7 columnas.
5. Detalle por médico como tablas.
6. Tabla resumen por día.
7. Tabla resumen mensual.
8. Pie con fecha de generación en cursiva.

Nombre del archivo: `[título del informe]_[fecha actual].docx`.
