# Rota-Wise: Explicación del Proyecto

## ¿Qué es Rota-Wise?

**Rota-Wise** (también conocido como **EquiSchedule**) es una aplicación web sofisticada diseñada para crear horarios de trabajo justos y equilibrados para médicos. Es una solución completa para la gestión de turnos médicos que garantiza una distribución equitativa del trabajo respetando todas las restricciones y preferencias de los profesionales de la salud.

## Tecnologías Utilizadas

### Stack Principal
- **Framework**: Next.js 15.2.3 (React 18.3.1)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS con componentes personalizados
- **UI**: Biblioteca de componentes Radix UI
- **Backend**: Firebase (autenticación y hosting)

### Bibliotecas Clave
- **date-fns**: Manejo avanzado de fechas
- **react-hook-form**: Gestión de formularios con validación Zod
- **@tanstack/react-query**: Gestión de estado y datos asíncronos
- **@dnd-kit**: Funcionalidad de arrastrar y soltar
- **jspdf + jspdf-autotable**: Exportación a PDF
- **docx**: Exportación a Word
- **recharts**: Gráficos y visualizaciones

## Características Principales

### 1. **Entrada de Datos**
Los usuarios pueden ingresar:
- Número de médicos
- Rango de fechas para el horario (fecha de inicio y fin)
- Intervalo mínimo entre días de trabajo para cada médico (1-30 días)
- Para cada médico:
  - Nombre
  - Fechas de vacaciones
  - Fechas de trabajo pre-asignadas
  - Fechas excluidas (no disponibles)
  - Opción para excluir del sistema de asignación automática

### 2. **Algoritmo Inteligente de Programación**

El sistema utiliza un algoritmo sofisticado que:

#### Restricciones Respetadas (Obligatorias)
- **Intervalo mínimo entre días de trabajo**: Los médicos deben tener al menos N días entre asignaciones
- **Vacaciones**: Los médicos no pueden trabajar en sus días de vacaciones
- **Fechas excluidas**: Respeta las fechas donde el médico no está disponible
- **Pre-asignaciones**: Honra todas las fechas de trabajo pre-asignadas
- **Entradas fijas**: Preserva ajustes manuales previos durante la regeneración

#### Principios de Equidad Implementados
- **Distribución de carga de trabajo**: Distribuye el trabajo de manera justa entre todos los médicos
- **Balance por día de semana**: Asegura que cada médico trabaje una proporción equilibrada de lunes, martes, miércoles, etc.
- **Balance mensual**: Distribuye el trabajo de manera uniforme a lo largo de los meses
- **Balance de fines de semana**: Reparte equitativamente los turnos de sábado y domingo
- **Tiempo de inactividad**: Considera el tiempo desde el último turno al asignar nuevos

### 3. **Visualización del Horario**

#### Vista de Calendario
- Calendario mensual interactivo
- Código de colores para diferentes tipos de asignaciones:
  - Trabajo (verde)
  - Pre-asignado (azul)
  - Vacaciones (naranja)
  - Libre/Off (gris)
- Navegación entre meses
- Capacidad para fijar/desfijar meses completos

#### Edición Manual
- Click en cualquier día para cambiar la asignación
- Sistema de advertencias si se violan restricciones
- Validación en tiempo real
- Capacidad de marcar entradas como "fijas" para protegerlas durante regeneraciones

### 4. **Tablas de Resumen**

#### Resumen de Días de Trabajo
Muestra para cada médico:
- Total de días trabajados por día de semana (Lun-Dom)
- Total general de días trabajados
- Permite identificar desequilibrios rápidamente

#### Resumen Mensual de Carga de Trabajo
Muestra para cada médico:
- Días trabajados por mes
- Total por médico
- Total por mes
- Total general del período

### 5. **Sistema de Advertencias**

El sistema genera advertencias cuando:
- No hay médicos disponibles para un día específico
- Existen conflictos en pre-asignaciones (múltiples médicos para el mismo día)
- Se violan restricciones al hacer ajustes manuales
- Hay problemas con intervalos mínimos

### 6. **Persistencia de Datos**

#### Guardado Automático
- Los datos del formulario se guardan automáticamente en localStorage
- El horario completo se guarda cuando está generado
- Recuperación automática al recargar la página

#### Exportación/Importación Manual
- **Guardar parámetros**: Exporta solo la configuración de médicos (JSON)
- **Guardar horario completo**: Exporta todo (configuración + horario generado + advertencias)
- **Cargar como está**: Importa un horario manteniendo Work/Pre-asignado
- **Cargar como pre-asignado**: Convierte todos los días de "Work" a "Pre-asignado" para usarlos como base

### 7. **Exportación de Reportes**

#### Exportación a PDF
Genera un reporte profesional con:
- Título y período del horario
- Información del intervalo mínimo
- Sección de advertencias (si las hay)
- Calendarios mensuales visuales
- Detalles de cada médico
- Tabla de resumen de días de trabajo
- Tabla de carga mensual
- Paginación automática
- Pies de página con fecha de generación

#### Exportación a Word (.docx)
Mismo contenido que el PDF pero en formato editable de Word

### 8. **Internacionalización (i18n)**

- Soporte para múltiples idiomas (Inglés y Español)
- Selector de idioma en la interfaz
- Todas las etiquetas, mensajes y exportaciones respetan el idioma seleccionado
- Formatos de fecha localizados

### 9. **Temas**

- Modo claro y oscuro
- Toggle para cambiar entre temas
- Persistencia de preferencia de tema

### 10. **Gestión de Estado**

- **Múltiples niveles de persistencia**:
  - localStorage para datos del formulario en vivo (se guarda mientras editas)
  - localStorage para horario completo generado
  - Sincronización entre ambos niveles

- **Acciones disponibles**:
  - Limpiar solo el horario (mantiene parámetros de médicos)
  - Limpiar todos los detalles de médicos (mantiene configuración básica)
  - Diálogos de confirmación para acciones destructivas

## Arquitectura del Código

### Estructura de Directorios

```
src/
├── app/                    # Páginas de Next.js
│   ├── page.tsx           # Página principal de la aplicación
│   ├── layout.tsx         # Layout principal
│   └── globals.css        # Estilos globales
├── components/            # Componentes React
│   ├── rotawise/         # Componentes específicos de Rota-Wise
│   ├── ui/               # Componentes UI reutilizables
│   └── theme-toggle.tsx  # Toggle de tema
├── context/              # Contextos de React
│   └── language-context  # Contexto de idioma
├── hooks/                # Custom hooks
├── lib/                  # Lógica de negocio
│   ├── schedule-generator.ts  # Algoritmo de generación
│   ├── types.ts          # Definiciones de tipos TypeScript
│   └── utils.ts          # Funciones utilitarias
├── locales/              # Archivos de traducción
└── __tests__/            # Tests unitarios y de integración
```

### Componentes Clave

1. **DataInputForm**: Formulario para ingresar médicos y sus restricciones
2. **ScheduleCalendarView**: Vista de calendario interactivo
3. **ScheduleSummaryTable**: Tabla de resumen de días trabajados
4. **MonthlyWorkloadSummaryTable**: Tabla de carga mensual

### Algoritmo de Generación (`schedule-generator.ts`)

El archivo contiene la lógica central:
- Función `generateSchedule()`: Punto de entrada principal
- Validación de restricciones
- Algoritmo de asignación equitativa
- Sistema de puntuación para seleccionar el mejor médico
- Generación de advertencias

## Testing

El proyecto tiene una suite de pruebas integral:

### Cobertura de Código
- **Statement Coverage**: 95.29%
- **Branch Coverage**: 87.19%
- **Function Coverage**: 93.93%
- **Line Coverage**: 96.36%

### Tipos de Pruebas
1. **Pruebas de restricciones**: Verifican que se respeten todas las reglas
2. **Pruebas de equidad**: Aseguran distribución justa del trabajo
3. **Pruebas de casos extremos**: Escenarios complejos y límites
4. **Pruebas de rendimiento**: Verifican que el algoritmo escale bien
5. **Pruebas de validación**: Verifican la integridad de los datos

## Casos de Uso

### Caso 1: Hospital Pequeño
- 5 médicos
- Horario de 3 meses
- Vacaciones distribuidas
- Intervalo mínimo: 2 días

### Caso 2: Clínica Grande
- 15 médicos
- Horario anual completo
- Múltiples períodos de vacaciones
- Algunos médicos con disponibilidad limitada
- Intervalo mínimo: 3-4 días

### Caso 3: Actualización de Horario
- Cargar horario existente
- Fijar meses ya trabajados
- Agregar nuevos médicos
- Regenerar solo los meses futuros

## Flujo de Trabajo Típico

1. **Configuración Inicial**
   - Usuario ingresa número de médicos
   - Define rango de fechas
   - Establece intervalo mínimo

2. **Detalles de Médicos**
   - Para cada médico: nombre, vacaciones, pre-asignaciones, exclusiones
   - Los datos se auto-guardan mientras se editan

3. **Generación**
   - Click en "Generar Horario"
   - El algoritmo procesa las restricciones
   - Genera el horario óptimo
   - Muestra advertencias si las hay

4. **Revisión y Ajuste**
   - Revisar el calendario visual
   - Revisar tablas de resumen
   - Hacer ajustes manuales si es necesario
   - Fijar entradas que no deben cambiar

5. **Refinamiento**
   - Si es necesario, regenerar (respeta entradas fijas)
   - Continuar ajustando hasta satisfacción

6. **Exportación**
   - Guardar horario completo (JSON)
   - Exportar reporte profesional (PDF/Word)
   - Compartir con el equipo

## Ventajas del Sistema

1. **Equidad Garantizada**: El algoritmo asegura que ningún médico tenga carga desproporcionada
2. **Flexibilidad**: Permite pre-asignaciones y ajustes manuales
3. **Transparencia**: Tablas de resumen muestran claramente la distribución
4. **Facilidad de Uso**: Interfaz intuitiva con validación en tiempo real
5. **Profesional**: Reportes exportables de alta calidad
6. **Confiabilidad**: Alta cobertura de pruebas (>95%)
7. **Multilingüe**: Soporta diferentes idiomas
8. **Accesible**: Temas claro/oscuro para mejor legibilidad

## Instalación y Desarrollo

### Prerrequisitos
- Node.js v18.x o superior
- npm o yarn

### Instalación
```bash
# Clonar el repositorio
git clone <repo-url>
cd rota-wise

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev

# Acceder a la aplicación
# Abrir http://localhost:3000 en el navegador
```

### Comandos Disponibles
```bash
npm run dev        # Servidor de desarrollo
npm run build      # Build de producción
npm run start      # Servidor de producción
npm run lint       # Linter
npm run test       # Ejecutar tests
npm run test:watch # Tests en modo watch
npm run test:coverage # Tests con cobertura
npm run typecheck  # Verificación de tipos TypeScript
```

## Despliegue

### Firebase App Hosting
El proyecto está configurado para Firebase App Hosting (ver `apphosting.yaml`)

### Otras Plataformas
También puede desplegarse en:
- Vercel (recomendado para Next.js)
- Netlify
- AWS Amplify
- DigitalOcean App Platform
- Servidor propio con Node.js

## Futuras Mejoras Potenciales

1. **Notificaciones**: Sistema de notificaciones por email/SMS
2. **Calendario Sincronizado**: Integración con Google Calendar, Outlook
3. **Multi-departamento**: Soporte para múltiples departamentos/especialidades
4. **Reportes Avanzados**: Más métricas y análisis estadísticos
5. **App Móvil**: Aplicación nativa para iOS/Android
6. **Permisos**: Sistema de roles (admin, médico, visualizador)
7. **Historial**: Seguimiento de cambios y versiones de horarios
8. **IA Predictiva**: Predicción de necesidades de personal basada en datos históricos

## Conclusión

Rota-Wise es una solución completa, robusta y bien testeada para la gestión de horarios médicos. Combina un algoritmo inteligente de asignación con una interfaz amigable y características profesionales de exportación. Es ideal para hospitales, clínicas y cualquier organización que necesite gestionar turnos de manera equitativa y eficiente.
