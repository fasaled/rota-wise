# Arquitectura MVVM — Rota-Wise para WinUI 3

Este documento propone la estructura completa de clases, ViewModels, servicios y navegación para implementar Rota-Wise en C# con WinUI 3 y el patrón MVVM usando `CommunityToolkit.Mvvm`.

---

## 1. Estructura de carpetas del proyecto

```
RotaWise/
├── Models/
│   ├── Doctor.cs
│   ├── ScheduleEntry.cs
│   ├── Schedule.cs
│   ├── ScheduleParameters.cs
│   ├── ScheduleVersion.cs
│   └── Enums.cs
├── ViewModels/
│   ├── MainViewModel.cs
│   ├── ConfigurationViewModel.cs
│   ├── DoctorViewModel.cs
│   ├── CalendarViewModel.cs
│   ├── WeeklySummaryViewModel.cs
│   ├── MonthlySummaryViewModel.cs
│   ├── ManualAdjustmentViewModel.cs
│   └── VersionManagerViewModel.cs
├── Views/
│   ├── MainWindow.xaml / .cs
│   ├── ConfigurationPage.xaml / .cs
│   ├── CalendarPage.xaml / .cs
│   ├── WeeklySummaryPage.xaml / .cs
│   ├── MonthlySummaryPage.xaml / .cs
│   └── Dialogs/
│       ├── ManualAdjustmentDialog.xaml / .cs
│       ├── SaveVersionDialog.xaml / .cs
│       ├── VersionManagerDialog.xaml / .cs
│       └── DatePickerDialog.xaml / .cs
├── Services/
│   ├── IScheduleGeneratorService.cs / ScheduleGeneratorService.cs
│   ├── IPersistenceService.cs / PersistenceService.cs
│   ├── IVersionService.cs / VersionService.cs
│   ├── IExportService.cs / ExportService.cs
│   └── INavigationService.cs / NavigationService.cs
├── Converters/
│   ├── AssignmentTypeToColorConverter.cs
│   ├── AssignmentTypeToIconConverter.cs
│   ├── BoolToVisibilityConverter.cs
│   ├── DateOnlyToStringConverter.cs
│   └── CountToTextConverter.cs
├── Helpers/
│   └── WindowHelper.cs
└── App.xaml / .cs
```

---

## 2. Modelos (capa de datos)

Los modelos son simples records o clases inmutables sin lógica de presentación.

```csharp
// Models/Enums.cs
public enum AssignmentType { Work, PreAssigned, Vacation, Off }

// Models/Doctor.cs
public record Doctor(string Id, string Name);

// Models/ScheduleEntry.cs
public record ScheduleEntry(
    DateOnly Date,
    string DoctorId,
    AssignmentType Assignment,
    string DayOfWeek,
    bool IsFixed = false
);

// Models/Schedule.cs
public record Schedule(
    DateOnly StartDate,
    DateOnly EndDate,
    List<ScheduleEntry> Entries,
    int MinIntervalBetweenWorkDays = 1,
    int? GlobalMonthlyShiftLimit = null
);

// Models/ScheduleParameters.cs
public record ScheduleParameters(
    int NumberOfDoctors,
    DateOnly StartDate,
    DateOnly EndDate,
    int MinIntervalBetweenWorkDays,
    int? GlobalMonthlyShiftLimit,
    List<DoctorProfile> Doctors
);

// Models/DoctorProfile.cs
public record DoctorProfile(
    string Id,
    string Name,
    List<DateOnly> VacationDates,
    List<DateOnly> PreAssignedWorkDates,
    List<DateOnly> ExcludedDates,
    bool IsExcludedFromAutomaticAssignment = false
);

// Models/ScheduleVersion.cs
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

---

## 3. Servicios

Los servicios encapsulan la lógica de negocio y las operaciones de I/O. Los ViewModels solo consumen servicios, nunca acceden a disco o generan el horario directamente.

### 3.1 IScheduleGeneratorService

Encapsula el algoritmo de asignación (ver `01-algoritmo-asignacion.md`).

```csharp
public interface IScheduleGeneratorService
{
    (Schedule? Schedule, List<string> Warnings, string? Error) Generate(
        ScheduleParameters parameters,
        IEnumerable<ScheduleEntry>? existingFixedEntries = null
    );
}
```

La implementación es una traducción directa del algoritmo documentado. Es **síncrona** (el algoritmo en la web lo es) pero se llama desde el ViewModel envuelta en `Task.Run` para no bloquear la UI.

### 3.2 IPersistenceService

Gestiona el guardado/carga automático del estado de sesión.

```csharp
public interface IPersistenceService
{
    Task SaveStateAsync(Schedule schedule, List<DoctorProfile> profiles, ScheduleParameters parameters, List<string> warnings);
    Task<(Schedule? Schedule, List<DoctorProfile> Profiles, ScheduleParameters? Parameters, List<string> Warnings)?> LoadStateAsync();
    Task ClearStateAsync();

    Task SaveParametersOnlyAsync(ScheduleParameters parameters);
    Task<ScheduleParameters?> LoadParametersOnlyAsync();

    // Import/Export de archivos JSON
    Task ExportToFileAsync(StorageFile file, Schedule schedule, List<DoctorProfile> profiles, ScheduleParameters parameters, List<string> warnings);
    Task ExportParametersToFileAsync(StorageFile file, ScheduleParameters parameters);
    Task<(FileFormat Format, object Data)> ImportFromFileAsync(StorageFile file);
}

public enum FileFormat { FullSchedule, ParametersOnly }
```

**Almacenamiento interno**: `ApplicationData.Current.LocalFolder` → `rotawise-state.json` para el estado de sesión. El auto-guardado usa un `DispatcherTimer` con debounce de 500ms.

### 3.3 IVersionService

Gestiona las versiones guardadas manualmente.

```csharp
public interface IVersionService
{
    Task<List<ScheduleVersion>> GetAllVersionsAsync();
    Task<string> SaveVersionAsync(string name, string? description, ScheduleParameters parameters, Schedule? schedule, List<string>? warnings);
    Task<ScheduleVersion?> GetVersionAsync(string id);
    Task<bool> UpdateVersionAsync(string id, string? name = null, string? description = null, ScheduleParameters? parameters = null, Schedule? schedule = null, List<string>? warnings = null);
    Task<bool> DeleteVersionAsync(string id);
}
```

**Almacenamiento**: archivos individuales en `%LOCALAPPDATA%\RotaWise\Versions\{id}.json`. Un archivo `index.json` en la misma carpeta mantiene la lista ordenada (id, name, lastModified) para cargar el listado sin leer todos los archivos.

### 3.4 IExportService

Genera PDF y Word.

```csharp
public interface IExportService
{
    Task ExportPdfAsync(StorageFile file, Schedule schedule, List<DoctorProfile> profiles, List<string> warnings);
    Task ExportWordAsync(StorageFile file, Schedule schedule, List<DoctorProfile> profiles, List<string> warnings);
}
```

### 3.5 INavigationService

Abstrae la navegación entre páginas del `NavigationView`.

```csharp
public interface INavigationService
{
    void NavigateTo(PageKey page);
    PageKey CurrentPage { get; }
}

public enum PageKey { Configuration, Calendar, WeeklySummary, MonthlySummary }
```

---

## 4. ViewModels

Todos los ViewModels heredan de `ObservableObject` (CommunityToolkit.Mvvm).

### 4.1 MainViewModel

El ViewModel raíz, ligado a `MainWindow`. Actúa como **estado global compartido** entre todas las pestañas. Es el único lugar donde viven el horario activo y los perfiles de médicos.

```csharp
public partial class MainViewModel : ObservableObject
{
    // Estado global compartido
    [ObservableProperty] private Schedule? _activeSchedule;
    [ObservableProperty] private List<DoctorProfile> _doctorProfiles = [];
    [ObservableProperty] private List<string> _scheduleWarnings = [];
    [ObservableProperty] private bool _hasUnsavedChanges;
    [ObservableProperty] private bool _isLoading;
    [ObservableProperty] private bool _isExporting;

    // Servicios (inyectados)
    private readonly IPersistenceService _persistenceService;
    private readonly IVersionService _versionService;
    private readonly IExportService _exportService;
    private readonly INavigationService _navigationService;

    // Comandos de la CommandBar global
    [RelayCommand] private async Task SaveDataAsync() { ... }
    [RelayCommand] private async Task LoadDataAsync() { ... }
    [RelayCommand] private async Task LoadAsPreAssignedAsync() { ... }
    [RelayCommand(CanExecute = nameof(HasSchedule))] private async Task ExportPdfAsync() { ... }
    [RelayCommand(CanExecute = nameof(HasSchedule))] private async Task ExportWordAsync() { ... }
    [RelayCommand(CanExecute = nameof(HasSchedule))] private void ClearSchedule() { ... }
    [RelayCommand] private void ClearDoctorDetails() { ... }
    [RelayCommand] private async Task OpenVersionManagerAsync() { ... }

    private bool HasSchedule => ActiveSchedule != null;

    // Llamado desde ConfigurationViewModel tras generar
    public void OnScheduleGenerated(Schedule schedule, List<DoctorProfile> profiles, List<string> warnings) { ... }

    // Llamado desde CalendarViewModel tras ajuste manual
    public void OnScheduleEntryUpdated(ScheduleEntry updatedEntry) { ... }

    // Auto-guardado con debounce
    private DispatcherTimer _autoSaveTimer;
    partial void OnActiveScheduleChanged(Schedule? value) => ResetAutoSaveTimer();
}
```

**Importante**: las sub-páginas no tienen instancias propias del horario. Reciben una referencia o se enlazan a propiedades de `MainViewModel` a través de inyección de dependencias o un localizador de servicios.

### 4.2 ConfigurationViewModel

Ligado a `ConfigurationPage`. Gestiona el formulario de entrada.

```csharp
public partial class ConfigurationViewModel : ObservableObject
{
    // Referencia al estado global
    private readonly MainViewModel _mainViewModel;
    private readonly IScheduleGeneratorService _generatorService;

    // Parámetros del formulario
    [ObservableProperty] private int _numberOfDoctors;
    [ObservableProperty] private DateOnly? _startDate;
    [ObservableProperty] private DateOnly? _endDate;
    [ObservableProperty] private int _minIntervalBetweenWorkDays = 1;
    [ObservableProperty] private int? _globalMonthlyShiftLimit;

    // Lista de médicos como ViewModels
    public ObservableCollection<DoctorViewModel> Doctors { get; } = [];

    // Sincronización del número de médicos
    partial void OnNumberOfDoctorsChanged(int value) => SynchronizeDoctorList(value);

    // Comandos
    [RelayCommand(CanExecute = nameof(CanGenerate))] private async Task GenerateScheduleAsync() { ... }
    [RelayCommand] private void AddDoctor() { ... }
    [RelayCommand] private void RemoveDoctor(DoctorViewModel doctor) { ... }
    [RelayCommand] private void MoveDoctor(object param) { ... }  // param: (doctor, newIndex)

    private bool CanGenerate => Doctors.Any(d => !string.IsNullOrWhiteSpace(d.Name))
                                && StartDate.HasValue && EndDate.HasValue;

    // Carga de estado externo (desde MainViewModel al restaurar sesión)
    public void LoadFromParameters(ScheduleParameters parameters) { ... }

    // Obtener parámetros actuales para guardar/generar
    public ScheduleParameters GetCurrentParameters() { ... }
}
```

### 4.3 DoctorViewModel

ViewModel de un único médico dentro de la lista de configuración.

```csharp
public partial class DoctorViewModel : ObservableObject
{
    [ObservableProperty] private string _id = Guid.NewGuid().ToString();
    [ObservableProperty] private string _name = string.Empty;
    [ObservableProperty] private bool _isExcludedFromAutomaticAssignment;

    // Listas de fechas como colecciones observables
    public ObservableCollection<DateOnly> VacationDates { get; } = [];
    public ObservableCollection<DateOnly> PreAssignedWorkDates { get; } = [];
    public ObservableCollection<DateOnly> ExcludedDates { get; } = [];

    // Propiedades derivadas para mostrar conteo en los botones
    public string VacationDatesText => VacationDates.Count > 0 ? $"{VacationDates.Count} fechas" : "Seleccionar fechas";
    public string PreAssignedDatesText => PreAssignedWorkDates.Count > 0 ? $"{PreAssignedWorkDates.Count} fechas" : "Seleccionar fechas";
    public string ExcludedDatesText => ExcludedDates.Count > 0 ? $"{ExcludedDates.Count} fechas" : "Seleccionar fechas";

    // Notificar cambios en los textos cuando cambian las colecciones
    public DoctorViewModel()
    {
        VacationDates.CollectionChanged += (_, _) => OnPropertyChanged(nameof(VacationDatesText));
        PreAssignedWorkDates.CollectionChanged += (_, _) => OnPropertyChanged(nameof(PreAssignedDatesText));
        ExcludedDates.CollectionChanged += (_, _) => OnPropertyChanged(nameof(ExcludedDatesText));
    }

    // Conversión a modelo
    public DoctorProfile ToModel() =>
        new(Id, Name,
            VacationDates.ToList(), PreAssignedWorkDates.ToList(), ExcludedDates.ToList(),
            IsExcludedFromAutomaticAssignment);
}
```

### 4.4 CalendarViewModel

Ligado a `CalendarPage`.

```csharp
public partial class CalendarViewModel : ObservableObject
{
    private readonly MainViewModel _mainViewModel;

    // Mes visible
    [ObservableProperty] private DateOnly _currentMonth;

    // Filtros
    [ObservableProperty] private DoctorProfile? _selectedDoctorFilter;  // null = todos
    [ObservableProperty] private AssignmentFilter _assignmentFilter = AssignmentFilter.All;

    // Computed: si el mes visible tiene entradas fijas
    public bool CurrentMonthHasFixedEntries { ... }

    // Colección de celdas del mes (7 * N filas)
    public ObservableCollection<CalendarDayViewModel> DaysInMonth { get; } = [];

    // Comandos
    [RelayCommand] private void PreviousMonth() => CurrentMonth = CurrentMonth.AddMonths(-1);
    [RelayCommand] private void NextMonth() => CurrentMonth = CurrentMonth.AddMonths(1);
    [RelayCommand] private void ToggleMonthFixed() { ... }
    [RelayCommand] private async Task OpenAdjustmentDialogAsync(CalendarDayViewModel day) { ... }
    [RelayCommand] private void MoveEntry(MoveEntryArgs args) { ... }  // drag & drop

    partial void OnCurrentMonthChanged(DateOnly value) => RebuildDays();

    private void RebuildDays() { /* recalcular DaysInMonth según el mes y los filtros */ }

    // Escuchar cambios en el horario del MainViewModel
    public void RefreshFromSchedule() => RebuildDays();
}

public partial class CalendarDayViewModel : ObservableObject
{
    public DateOnly Date { get; init; }
    public bool IsCurrentMonth { get; init; }
    public bool IsToday { get; init; }
    public ObservableCollection<ScheduleEntryViewModel> Entries { get; } = [];
}

public partial class ScheduleEntryViewModel : ObservableObject
{
    public ScheduleEntry Entry { get; init; }
    public string DoctorName { get; init; }
    public bool IsDraggable => Entry.Assignment == AssignmentType.Work && !Entry.IsFixed;
}

public enum AssignmentFilter { All, WorkOnly, VacationOnly }
```

### 4.5 ManualAdjustmentViewModel

Ligado a `ManualAdjustmentDialog`. Se crea nuevo para cada apertura del diálogo.

```csharp
public partial class ManualAdjustmentViewModel : ObservableObject
{
    public DateOnly Date { get; init; }
    public List<DoctorProfile> Doctors { get; init; }
    public int MinIntervalBetweenWorkDays { get; init; }
    public IReadOnlyList<ScheduleEntry> AllEntries { get; init; }

    [ObservableProperty] private string _selectedDoctorId = string.Empty;
    [ObservableProperty] private AssignmentType _assignmentType = AssignmentType.Work;
    [ObservableProperty] private bool _isFixed;

    // Resultado tras guardar
    public ScheduleEntry? ResultEntry { get; private set; }

    // Mensajes de validación para InfoBar
    [ObservableProperty] private string? _errorMessage;
    [ObservableProperty] private string? _warningMessage;

    // Se llama al pulsar "Guardar" antes de cerrar el diálogo
    public bool TryValidateAndBuild()
    {
        ErrorMessage = null;
        WarningMessage = null;

        // Validaciones bloqueantes
        if (AssignmentType == AssignmentType.Work && string.IsNullOrEmpty(SelectedDoctorId)) {
            ErrorMessage = "Debe seleccionar un médico para una guardia.";
            return false;
        }
        // ... resto de validaciones (ver 05-reglas-de-negocio.md)

        ResultEntry = BuildEntry();
        return true;
    }

    partial void OnAssignmentTypeChanged(AssignmentType value)
    {
        if (value == AssignmentType.Off) SelectedDoctorId = string.Empty;
        TryValidateAndBuild();  // Actualizar validaciones en tiempo real
    }
    partial void OnSelectedDoctorIdChanged(string value) => TryValidateAndBuild();
}
```

### 4.6 WeeklySummaryViewModel y MonthlySummaryViewModel

ViewModels simples que calculan las estadísticas a partir del horario del `MainViewModel`.

```csharp
public partial class WeeklySummaryViewModel : ObservableObject
{
    // Filas de la tabla: una por médico
    public ObservableCollection<WeeklyDoctorSummary> Rows { get; } = [];

    public void RefreshFromSchedule(Schedule schedule, List<DoctorProfile> profiles) { ... }
}

public record WeeklyDoctorSummary(
    string DoctorName,
    int Mon, int Tue, int Wed, int Thu, int Fri, int Sat, int Sun,
    int Total
);

public partial class MonthlySummaryViewModel : ObservableObject
{
    public List<DateOnly> Months { get; private set; } = [];
    public ObservableCollection<MonthlyDoctorSummary> Rows { get; } = [];
    public MonthlyDoctorSummary? TotalsRow { get; private set; }

    public void RefreshFromSchedule(Schedule schedule, List<DoctorProfile> profiles) { ... }
}
```

### 4.7 VersionManagerViewModel

Ligado a `VersionManagerDialog`.

```csharp
public partial class VersionManagerViewModel : ObservableObject
{
    private readonly IVersionService _versionService;
    private readonly MainViewModel _mainViewModel;

    public ObservableCollection<ScheduleVersion> Versions { get; } = [];
    [ObservableProperty] private ScheduleVersion? _selectedVersion;

    [RelayCommand] private async Task SaveCurrentVersionAsync() { ... }
    [RelayCommand(CanExecute = nameof(HasSelection))] private async Task LoadSelectedVersionAsync() { ... }
    [RelayCommand(CanExecute = nameof(HasSelection))] private async Task DeleteSelectedVersionAsync() { ... }
    [RelayCommand(CanExecute = nameof(HasSelection))] private async Task OverwriteSelectedVersionAsync() { ... }
    [RelayCommand(CanExecute = nameof(HasSelection))] private void BeginEditSelectedVersion() { ... }
    [RelayCommand] private async Task SaveVersionEditAsync() { ... }

    private bool HasSelection => SelectedVersion != null;

    public async Task LoadVersionsAsync() { /* carga y puebla Versions */ }
}
```

---

## 5. Comunicación entre ViewModels

Se usa el **messenger** de CommunityToolkit.Mvvm (`WeakReferenceMessenger`) para eventos que cruzan pestañas:

```csharp
// Mensajes
public record ScheduleGeneratedMessage(Schedule Schedule, List<DoctorProfile> Profiles, List<string> Warnings);
public record ScheduleEntryUpdatedMessage(ScheduleEntry UpdatedEntry);
public record ScheduleEntryMovedMessage(ScheduleEntry Source, DateOnly TargetDate);
public record MonthFixedMessage(DateOnly Month, bool IsFixed);
public record VersionLoadedMessage(ScheduleParameters Parameters, Schedule? Schedule, List<string>? Warnings);
```

**Flujo principal:**

```
Usuario pulsa "Generar"
  → ConfigurationViewModel llama a IScheduleGeneratorService.Generate()
  → Envía ScheduleGeneratedMessage
  → MainViewModel recibe el mensaje → actualiza ActiveSchedule y DoctorProfiles
  → CalendarViewModel recibe el mensaje → llama RefreshFromSchedule()
  → WeeklySummaryViewModel recibe el mensaje → llama RefreshFromSchedule()
  → MonthlySummaryViewModel recibe el mensaje → llama RefreshFromSchedule()
```

---

## 6. Inyección de dependencias

Configurar en `App.xaml.cs` usando `Microsoft.Extensions.DependencyInjection`:

```csharp
private static IServiceProvider ConfigureServices()
{
    var services = new ServiceCollection();

    // Servicios (singleton: una sola instancia en toda la app)
    services.AddSingleton<IScheduleGeneratorService, ScheduleGeneratorService>();
    services.AddSingleton<IPersistenceService, PersistenceService>();
    services.AddSingleton<IVersionService, VersionService>();
    services.AddSingleton<IExportService, ExportService>();
    services.AddSingleton<INavigationService, NavigationService>();

    // ViewModels (singleton los que viven toda la sesión)
    services.AddSingleton<MainViewModel>();
    services.AddSingleton<ConfigurationViewModel>();
    services.AddSingleton<CalendarViewModel>();
    services.AddSingleton<WeeklySummaryViewModel>();
    services.AddSingleton<MonthlySummaryViewModel>();

    // ViewModels de diálogos (transient: nueva instancia cada vez)
    services.AddTransient<ManualAdjustmentViewModel>();
    services.AddTransient<VersionManagerViewModel>();

    return services.BuildServiceProvider();
}

public static T GetService<T>() where T : class
    => (Current as App)!.Services.GetRequiredService<T>();
```

---

## 7. Navegación

`MainWindow` contiene el `NavigationView`. Cada pestaña carga su página correspondiente:

```csharp
// NavigationService.cs
public void NavigateTo(PageKey page)
{
    var pageType = page switch
    {
        PageKey.Configuration  => typeof(ConfigurationPage),
        PageKey.Calendar       => typeof(CalendarPage),
        PageKey.WeeklySummary  => typeof(WeeklySummaryPage),
        PageKey.MonthlySummary => typeof(MonthlySummaryPage),
        _ => throw new ArgumentOutOfRangeException()
    };
    _frame.Navigate(pageType);
}
```

Las páginas obtienen su ViewModel en el constructor:
```csharp
public ConfigurationPage()
{
    InitializeComponent();
    DataContext = App.GetService<ConfigurationViewModel>();
}
```

---

## 8. Resumen de responsabilidades

| Capa | Responsabilidad | No debe hacer |
|---|---|---|
| **Model** | Estructura de datos pura | Lógica de UI o negocio |
| **ViewModel** | Estado de UI, comandos, validación de presentación | Acceder a disco, generar horario directamente |
| **Service** | Lógica de negocio, I/O, algoritmo | Conocer la UI |
| **View** | Renderizar el ViewModel, capturar input | Lógica de negocio o estado |
| **MainViewModel** | Estado global compartido entre pestañas | Renderizar |
