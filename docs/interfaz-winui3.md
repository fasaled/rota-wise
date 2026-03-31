# Interfaz WinUI 3 — Especificación de Implementación

Este documento describe cómo implementar la interfaz de Rota-Wise como aplicación nativa de Windows, siguiendo las guías de Fluent Design y los patrones de WinUI 3. Toma como referencia la interfaz web documentada en `interfaz-web-actual.md`.

---

## 1. Diferencia estructural principal: de página única a NavigationView

La app web es una sola página con scroll vertical. En Windows, el equivalente natural es una **`NavigationView`** con paneles separados, lo que elimina el scroll y organiza mejor el espacio.

**Mapeo de secciones web → pestañas Windows:**

| Sección web | Pestaña WinUI 3 | Icono Segoe Fluent |
|---|---|---|
| Formulario de entrada + botones | **Configuración** | `Settings` / `People` |
| Calendario | **Calendario** | `Calendar` |
| Tabla por día de semana | **Resumen semanal** | `BarChart` |
| Tabla mensual | **Resumen mensual** | `CalendarReply` |

**Tipo de NavigationView recomendado:** `Left` (panel lateral colapsable). En ventanas pequeñas colapsa automáticamente a iconos. Esto es preferible al modo `Top` porque las etiquetas de las pestañas son legibles sin hover y el patrón es más familiar en apps de escritorio Windows.

**CommandBar global** en la parte superior (dentro del área de título o debajo del header), persistente en todas las pestañas, con los botones de acción sobre archivos (guardar, cargar, exportar). Ver sección 4.

---

## 2. Pestaña: Configuración

### 2.1 Layout general

La pestaña usa un `ScrollViewer` vertical para acomodar listas largas de médicos. El contenido se organiza en dos zonas:

- **Zona superior**: parámetros globales en una `WrapPanel` o `UniformGrid`.
- **Zona inferior**: lista de médicos.
- **Botón "Generar horario"** fijo al pie de la zona de contenido (no hace scroll), implementado con un `Grid` de dos filas donde la segunda fila tiene altura `Auto`.

### 2.2 Parámetros globales

`StackPanel` horizontal con wrap, o `UniformGrid` de 5 columnas. Cada control lleva un `TextBlock` como label encima:

| Campo | Control WinUI 3 | Notas |
|---|---|---|
| Número de médicos | `NumberBox` (entero, 0–20) | Al confirmar el valor (Enter o perder foco) se sincroniza la lista |
| Fecha de inicio | `CalendarDatePicker` | Obligatorio |
| Fecha de fin | `CalendarDatePicker` | ≥ hoy, ≥ fecha inicio |
| Intervalo mínimo | `NumberBox` (entero, 0–30, defecto 1) | Label con icono de reloj |
| Límite mensual | `NumberBox` (entero, 0–31, opcional) | Placeholder "Sin límite" cuando está vacío |

A diferencia de la web (donde el número de médicos sincroniza la lista al perder el foco), en WinUI 3 se puede añadir un botón "+" y "-" junto al `NumberBox`, o simplemente sincronizar en el evento `ValueChanged` con un pequeño debounce.

### 2.3 Separador

`NavigationViewItemSeparator` o simplemente un `Border` con altura 1 y fondo de recurso `DividerStrokeColorDefaultBrush`.

### 2.4 Lista de médicos

**Contenedor**: `ItemsRepeater` con `StackLayout` vertical, o un `ListView` con `ItemsSource` enlazado a la colección de ViewModels de médicos.

**Reordenado**: `ListView` con `CanReorderItems="True"` y `AllowDrop="True"`. Es la forma nativa en WinUI 3 de lograr drag & drop para reordenar, sin necesidad de bibliotecas externas.

**Card de cada médico**: `Expander` con el nombre del médico como header (cuando está colapsado) o una `Card`-like `Border` con `CornerRadius` y `BorderBrush`. Cada card contiene:

**Fila 1:**
- `TextBox` para el nombre. Validación: borde rojo si está vacío al intentar generar.
- `ToggleSwitch` para "Excluir de asignación automática" (equivale al checkbox de la web; el ToggleSwitch es más nativo en Windows que un checkbox para opciones de comportamiento).
- Botón de eliminar médico: `Button` con `Content="\uE74D"` (icono Delete de Segoe), estilo secundario, al lado del nombre o en la esquina de la card.

**Fila 2 — selectores de fechas múltiples:**

La web usa popovers con calendarios de selección múltiple. En WinUI 3:

- Tres botones, uno por tipo (Vacaciones / Pre-asignadas / Excluidas), cada uno abre un `ContentDialog` con un `CalendarView` en `SelectionMode="Multiple"`.
- El botón muestra el conteo: "3 fechas" o "Seleccionar fechas".
- El `CalendarView` debe tener `MinDate` y `MaxDate` enlazados a las fechas de inicio y fin del periodo.
- **Shift+clic para rangos**: `CalendarView` en WinUI 3 no lo soporta nativamente. Implementar en el código: al detectar la tecla Shift en el evento `SelectedDatesChanged`, calcular el rango manualmente y añadir las fechas al conjunto de selección.
- Cada tipo de fecha con su color identificativo en el botón (icono coloreado).

### 2.5 Botón "Generar Horario"

`Button` con estilo `AccentButtonStyle`, ancho completo o alineado a la derecha. Durante la generación:
- Muestra `ProgressRing` pequeño inline (o el botón se deshabilita y aparece un `ProgressBar` indeterminado encima de la lista).
- Texto cambia a "Generando...".
- Se deshabilita si no hay médicos con nombre.

**La generación es síncrona** (igual que en la web): ejecutar en el hilo de UI envuelto en `Task.Run` para no bloquear la interfaz, o bien en un `BackgroundWorker`. La operación es rápida (<5s) así que un `ProgressRing` es suficiente.

---

## 3. Barra de comandos global (CommandBar)

En la web, los botones de acción están en una fila horizontal entre el formulario y el calendario. En Windows, esto va en una **`CommandBar`** persistente, visible en todas las pestañas.

**Ubicación recomendada**: debajo de la barra de título de la ventana (`TitleBar`), encima del `NavigationView`, o dentro del área de contenido de la primera pestaña. La opción más limpia en WinUI 3 es colocarla en el `NavigationView.Header` o en la barra de título personalizada.

**Botones principales** (`AppBarButton`):

| Botón | Icono Segoe | Condición de habilitación |
|---|---|---|
| Guardar datos | `Save` | Hay horario O hay médicos con nombre |
| Cargar datos | `OpenFile` | Siempre |
| Cargar como pre-asignado | `Import` | Siempre |
| Exportar PDF | `PDF` / `Print` | Hay horario |
| Exportar Word | `Document` | Hay horario |

**Botones secundarios** (en el menú de desbordamiento `...` de la CommandBar):
- Borrar horario (con icono `Delete`, color de advertencia)
- Borrar datos de médicos (con icono `People` + `Delete`)

Separar las acciones destructivas en el menú secundario evita pulsaciones accidentales, lo cual es una mejora respecto a la web donde están al mismo nivel.

---

## 4. Persistencia

La web usa `localStorage`. En WinUI 3:

- **Estado de la sesión** (equivale a `rotawiseAppState`): archivo JSON en `ApplicationData.Current.LocalFolder` → `rotawise-state.json`.
- **Solo parámetros del formulario** (equivale a `rotawiseFormInputState`): `ApplicationData.Current.LocalSettings` para datos pequeños, o un segundo archivo JSON.
- Guardar automáticamente con debounce de 500ms igual que la web, usando un `DispatcherTimer` o `Task.Delay` con `CancellationToken`.

---

## 5. Pestaña: Calendario

### 5.1 Barra de controles

`CommandBar` local (dentro de la pestaña) o `StackPanel` horizontal en la cabecera con:

- `ComboBox` filtro por médico: "Todos los médicos" + lista.
- `ComboBox` filtro por tipo: Todos / Solo guardias / Solo vacaciones.
- `Button` `◀` navegación mes anterior (`AppBarButton` con `Icon="ChevronLeft"`).
- `TextBlock` mes y año (ancho fijo, centrado, estilo `SubtitleTextBlockStyle`).
- `Button` `▶` navegación mes siguiente.
- `ToggleButton` "Fijar mes / Desfijar mes" con icono `Lock`/`Unlock`. Cuando está activo (mes fijado): fondo de acento.

### 5.2 Cuadrícula del calendario

**Implementación**: `ItemsRepeater` con `UniformGridLayout` de 7 columnas, o un `Grid` generado dinámicamente con 7 columnas de igual ancho.

**Cabecera de días**: `ItemsRepeater` con los 7 nombres abreviados de días según la cultura del sistema (`CultureInfo.CurrentCulture`).

**Celda de día** (`DataTemplate`):
- `Border` con `CornerRadius="4"`, altura fija (~120px), fondo `CardBackgroundFillColorDefaultBrush` para días del mes o `SubtleFillColorSecondaryBrush` para días fuera del mes.
- Interactividad: `PointerPressed` para abrir el diálogo de ajuste. En WinUI 3 no hay `cursor:pointer` nativo; la celda debe ser un `Button` con estilo transparente o usar `PointerCursor`.
- Resaltado al hacer drag sobre ella: cambiar fondo y añadir borde azul (`SystemAccentColor`) en el evento `DragOver`.
- Número de día: `TextBlock` pequeño en la esquina superior izquierda. Si es hoy: dentro de una `Ellipse` rellena con `SystemAccentColor`.

**Lista de entradas**: `ItemsControl` vertical dentro de cada celda, con `ScrollViewer` para overflow.

### 5.3 Chips de asignación

Cada chip es un `Border` redondeado (`CornerRadius="4"`) con `StackPanel` horizontal:

| Tipo | Fondo | Texto | Color de fondo sugerido |
|---|---|---|---|
| `Work` | Azul claro | Azul oscuro | `#DBEAFE` / `#1E3A5F` en oscuro |
| `Pre-assigned` | Naranja claro | Naranja oscuro | `#FED7AA` / `#7C2D12` en oscuro |
| `Vacation` | Verde claro | Verde oscuro | `#D1FAE5` / `#064E3B` en oscuro |

- Icono pequeño (16x16) a la izquierda.
- `TextBlock` con nombre del médico truncado (`TextTrimming="CharacterEllipsis"`).
- Si `isFixed`: icono candado (`\uE72E`) y borde naranja adicional.

### 5.4 Drag & drop (solo chips `Work` no fijos)

En WinUI 3, el drag & drop de UI elements usa las propiedades `CanDrag="True"` en el origen y `AllowDrop="True"` en el destino:

- **Origen** (chip `Work` no fijo): `CanDrag="True"`. En `DragStarting`: empaquetar la fecha y doctorId en `DataPackage`.
- **Destino** (celda de día): `AllowDrop="True"`. En `DragOver`: aceptar si el drop es válido (no hay entrada fija en el destino), cambiar cursor y resaltar. En `Drop`: realizar el intercambio o movimiento.
- **DragVisual**: personalizar con `DragUI.SetContentFromDataPackage` o `SetContentFromBitmap` para mostrar una copia del chip.
- Chips no arrastrables (`Pre-assigned`, `Vacation`, fijos): `CanDrag="False"` o sin manejadores de drag.

**Feedback de error**: si el drop es inválido, mostrar `TeachingTip` o `InfoBar` en la parte superior de la pestaña durante 3 segundos.

### 5.5 Clic en celda / chip

- Clic en zona vacía de la celda → abrir diálogo de ajuste para nueva entrada.
- Clic en chip `Work` o `Pre-assigned` → abrir diálogo de ajuste para modificar.
- Clic en chip `Vacation` → mostrar `TeachingTip` informativo ("Las vacaciones se gestionan desde Configuración").

### 5.6 Leyenda

`StackPanel` horizontal al pie del calendario con tres chips de muestra:
- Azul: Guardia
- Naranja: Pre-asignada
- Verde: Vacaciones

---

## 6. Diálogo de ajuste manual

`ContentDialog` modal (WinUI 3 nativo). Ancho fijo ~400px.

### 6.1 Título y subtítulo

- Título: "Ajustar asignación — [fecha]"
- Mensaje secundario dentro del cuerpo: "Modificar asignación" o "Nueva asignación".

### 6.2 Campos

Organizados en `StackPanel` vertical con espaciado de 12px:

**Médico:**
- `ComboBox` con la lista de médicos.
- Se deshabilita cuando el tipo es `Off`.

**Tipo de asignación:**
- `ComboBox` con dos opciones: "Guardia" (`Work`) y "Libre" (`Off`).

**Marcar como fija:**
- `CheckBox` con label "Preservar al regenerar el horario".

### 6.3 Validaciones

A diferencia de la web (que usa toasts para todo), en una app nativa Windows se distingue:

- **Validación bloqueante** (médico requerido, médico de vacaciones): mostrar `InfoBar` con `Severity="Error"` **dentro del diálogo**, encima de los campos. El botón "Guardar" permanece deshabilitado mientras el error esté activo.
- **Validación no bloqueante** (fecha excluida, intervalo mínimo): mostrar `InfoBar` con `Severity="Warning"` dentro del diálogo. El usuario puede guardar igualmente.

Esto es más informativo que los toasts de la web y sigue el patrón Windows de feedback contextual.

### 6.4 Botones del diálogo

```
ContentDialog.SecondaryButtonText = "Cancelar"
ContentDialog.PrimaryButtonText   = "Guardar"
```

El botón primario se deshabilita (`IsPrimaryButtonEnabled = false`) si hay errores bloqueantes.

---

## 7. Pestaña: Resumen semanal

Equivale a `ScheduleSummaryTable`.

**Control recomendado**: `DataGrid` de CommunityToolkit.WinUI (`CommunityToolkit.WinUI.UI.Controls`).

**Columnas**:
- Columna fija "Médico" (`MinWidth=150`).
- 7 columnas de días abreviados, centradas (`MinWidth=50`).
- Columna "Total", centrada, negrita (`FontWeight="SemiBold"`).

**Filas**: una por médico, solo entradas `Work` y `Pre-assigned`. Sin fila de totales (igual que la web).

**Cabecera de la pestaña**: `TextBlock` con icono y título "Resumen por Día de la Semana" en `SubtitleTextBlockStyle`.

---

## 8. Pestaña: Resumen mensual

Equivale a `MonthlyWorkloadSummaryTable`.

**Control recomendado**: `DataGrid` de CommunityToolkit.WinUI.

**Columnas**:
- Columna fija "Médico".
- Una columna por mes natural del periodo (formato "Ene 2026").
- Columna "Total".

**Filas**: una por médico + fila de totales al final con fondo `SubtleFillColorSecondaryBrush` y texto `FontWeight="SemiBold"`.

**Scroll horizontal** automático si el número de meses supera el ancho de la ventana (el `DataGrid` lo gestiona automáticamente).

---

## 9. Tarjeta de avisos del algoritmo

En la web es una card con borde rojo que aparece entre los botones y el calendario. En WinUI 3:

`InfoBar` con `Severity="Warning"` (o `"Error"` si se prefiere más énfasis), colocada:
- En la pestaña **Configuración**: debajo del botón "Generar Horario".
- En la pestaña **Calendario**: en la cabecera, encima de los controles de filtro.

Si hay múltiples avisos, usar un `ListView` dentro del `Content` del `InfoBar`, o una `InfoBar` por aviso apiladas verticalmente.

La `InfoBar` tiene un botón de cierre (`IsClosable="True"`). Al cerrar, los avisos no desaparecen del estado; solo se oculta la barra hasta que se regenere el horario.

---

## 10. Notificaciones de operaciones

En lugar del sistema de toasts de la web (que emerge en la esquina), en WinUI 3 usar:

| Tipo de feedback | Control WinUI 3 | Duración |
|---|---|---|
| Operación exitosa (guardado, carga, etc.) | `InfoBar` en la zona de contenido activa, `Severity="Success"` | Auto-cierre 3s |
| Advertencia no bloqueante | `InfoBar` con `Severity="Warning"`, `IsClosable="True"` | Manual |
| Error | `InfoBar` con `Severity="Error"`, `IsClosable="True"` | Manual |
| Drag & drop inválido | `TeachingTip` anclado al calendario | Auto-cierre 2s |

Evitar `ContentDialog` para mensajes informativos simples: es demasiado intrusivo para feedback de operaciones normales.

---

## 11. Diálogos de confirmación para acciones destructivas

`ContentDialog` con:
- `Title`: nombre de la acción.
- `Content`: descripción de la consecuencia.
- `PrimaryButtonText`: "Confirmar" (o el nombre de la acción).
- `SecondaryButtonText`: "Cancelar".
- `DefaultButton = ContentDialogButton.Secondary` (el foco inicial va a Cancelar, evitando confirmaciones accidentales con Enter).

Acciones que requieren confirmación:
- Borrar horario generado.
- Borrar datos de médicos.
- Sobreescribir una versión guardada.
- Eliminar una versión guardada.

---

## 12. Exportación de archivos

Usar `FileSavePicker` (no `SaveFileDialog` de WinForms/WPF):

```csharp
var picker = new FileSavePicker();
picker.SuggestedStartLocation = PickerLocationId.DocumentsLibrary;
picker.SuggestedFileName = "rotawise-schedule";
picker.FileTypeChoices.Add("JSON", new[] { ".json" });
// Para PDF: picker.FileTypeChoices.Add("PDF", new[] { ".pdf" });
// Para Word: picker.FileTypeChoices.Add("Word", new[] { ".docx" });
```

**Importante**: en WinUI 3 empaquetado, el `FileSavePicker` requiere inicialización con el `WindowHandle`:
```csharp
WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);
```

Para cargar archivos: `FileOpenPicker` con el mismo patrón.

**Exportación PDF**: librería `QuestPDF` (licencia libre para uso no comercial) o `PdfSharpCore`. Misma estructura de contenido que la web: encabezado, calendarios mensuales, detalle por médico, tablas resumen.

**Exportación Word**: `DocumentFormat.OpenXml` (SDK oficial de Microsoft, gratuito). Misma estructura que la web.

---

## 13. Tema claro/oscuro

- Respetar la preferencia del sistema por defecto (`Application.RequestedTheme = ApplicationTheme.Default`).
- Ofrecer override manual: `ToggleButton` en la barra de título con icono sol/luna. Guardar la preferencia en `ApplicationData.Current.LocalSettings`.
- Los colores de los chips del calendario (azul, naranja, verde) deben definirse como recursos con variantes para tema claro y oscuro usando `ResourceDictionary` con `ThemeResource`.

---

## 14. Tamaño de ventana

- **Mínimo recomendado**: 900×600px. Por debajo de este ancho, el calendario de 7 columnas puede quedar muy estrecho.
- Definir en `MainWindow`:
  ```csharp
  appWindow.Resize(new SizeInt32(1200, 800)); // Tamaño inicial
  // Mínimo: usando AppWindowPresenter o Win32 SetWindowPos
  ```
- El `NavigationView` en modo `Left` colapsa automáticamente a iconos (`CompactModeThresholdWidth`) cuando la ventana se estrecha.

---

## 15. Resumen de mejoras respecto a la web

| Aspecto | Web | WinUI 3 |
|---|---|---|
| Navegación | Scroll vertical en una sola página | Pestañas con NavigationView, sin scroll innecesario |
| Botones de acción | Fila horizontal entre secciones | CommandBar persistente, acciones destructivas en menú secundario |
| Selectores de fecha múltiple | Popover con calendario (un solo popover abierto a la vez) | ContentDialog con CalendarView (más espacio, más claro) |
| Validaciones en el diálogo | Toasts emergentes en la esquina | InfoBar contextual dentro del diálogo |
| Notificaciones | Toast en esquina inferior derecha | InfoBar en la zona de contenido activa |
| Reordenado de médicos | Drag & drop con @dnd-kit | ListView con CanReorderItems nativo |
| Persistencia | localStorage | Archivos JSON en LocalFolder |
| Confirmaciones destructivas | AlertDialog con foco en "Confirmar" | ContentDialog con DefaultButton = Cancelar |
