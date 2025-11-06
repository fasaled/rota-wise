# Rota-Wise: Complete Project Overview

## Executive Summary

**Rota-Wise** (also known as **EquiSchedule**) is a sophisticated web application designed to create fair and balanced work schedules for doctors. It's a comprehensive solution for medical shift management that ensures equitable workload distribution while respecting all constraints and preferences of healthcare professionals.

## What Does This Application Do?

Rota-Wise solves the complex problem of scheduling doctors fairly across a period of time (days, weeks, months, or even a full year) while considering:
- **Vacations and time off**
- **Minimum rest periods between shifts**
- **Pre-assigned work dates**
- **Excluded/unavailable dates**
- **Fair distribution across days of the week**
- **Fair monthly workload balance**
- **Weekend shift fairness**

## Core Features at a Glance

### 1. Smart Scheduling Algorithm
- Automatically generates optimal schedules
- Respects all hard constraints (vacations, minimum intervals, exclusions)
- Balances workload fairly among all doctors
- Considers day-of-week distribution
- Accounts for different availability levels

### 2. Interactive Calendar Interface
- Visual monthly calendar view
- Color-coded assignments (Work, Pre-assigned, Vacation, Off)
- Click to edit any day's assignment
- Real-time validation and warnings
- Ability to "fix" entries to protect them during regeneration

### 3. Comprehensive Data Input
- Configure number of doctors and date range
- Set minimum interval between work days (1-30 days)
- For each doctor:
  - Name
  - Vacation dates
  - Pre-assigned work dates
  - Excluded dates
  - Option to exclude from automatic assignment

### 4. Summary Tables
- **Workdays Summary**: Shows work distribution by day of week (Mon-Sun) for each doctor
- **Monthly Workload Summary**: Shows work distribution by month for each doctor
- Both tables include totals for easy balance verification

### 5. Professional Export
- **PDF Reports**: Beautifully formatted reports with calendars, summaries, and warnings
- **Word Documents**: Editable .docx reports with the same content
- Both exports are professional-grade, ready for distribution

### 6. Data Persistence
- **Auto-save**: Form data automatically saved while editing
- **Full Schedule Save**: Export complete schedule with all settings
- **Load As-Is**: Import previously saved schedules
- **Load As Pre-assigned**: Convert existing Work days to Pre-assigned for building on top

### 7. Internationalization
- English and Spanish support
- Language selector in UI
- All labels, messages, and exports respect selected language
- Localized date formats

### 8. Theme Support
- Light and dark mode
- Theme toggle
- Preference persistence

## Technology Stack

### Frontend
- **Next.js 15.2.3** - React framework with server-side rendering
- **React 18.3.1** - UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives

### Key Libraries
- **date-fns** - Date manipulation
- **react-hook-form + Zod** - Form management with schema validation
- **@tanstack/react-query** - Async state management
- **@dnd-kit** - Drag and drop functionality
- **jspdf + jspdf-autotable** - PDF generation
- **docx** - Word document generation
- **recharts** - Charts and visualizations

### Backend/Hosting
- **Firebase** - Authentication and hosting
- Can also be deployed to Vercel, Netlify, AWS, etc.

## Algorithm Details

The scheduling algorithm implements a sophisticated scoring system that considers:

1. **Hard Constraints** (Must be satisfied):
   - Minimum interval between work days
   - Vacation dates (cannot work)
   - Excluded dates (not available)
   - Pre-assigned dates (must honor)
   - Fixed entries (preserved during regeneration)

2. **Soft Constraints** (Balanced optimally):
   - Total workdays per doctor
   - Day-of-week distribution
   - Monthly workload balance
   - Idle time since last work
   - Weekend work distribution

3. **Selection Process**:
   - For each day, score all eligible doctors
   - Select doctor with best score (needs most work/rest)
   - Update statistics
   - Generate warnings if no doctor available

## Test Coverage

The project has comprehensive test coverage:
- **Statement Coverage**: 95.29%
- **Branch Coverage**: 87.19%
- **Function Coverage**: 93.93%
- **Line Coverage**: 96.36%

### Test Categories
- Core constraint validation
- Fairness verification
- Edge case handling
- Performance benchmarks (handles 15+ doctors, 365+ days efficiently)
- Integration tests

## Project Structure

```
rota-wise/
├── src/
│   ├── app/                      # Next.js pages
│   │   ├── page.tsx             # Main application page
│   │   ├── layout.tsx           # App layout
│   │   └── globals.css          # Global styles
│   ├── components/              # React components
│   │   ├── rotawise/           # Schedule-specific components
│   │   ├── ui/                 # Reusable UI components
│   │   └── theme-toggle.tsx    # Theme switcher
│   ├── context/                # React contexts
│   ├── hooks/                  # Custom hooks
│   ├── lib/                    # Business logic
│   │   ├── schedule-generator.ts  # Core algorithm
│   │   ├── types.ts            # TypeScript types
│   │   └── utils.ts            # Utilities
│   ├── locales/                # i18n translations
│   └── __tests__/              # Test suites
├── public/                      # Static assets
├── docs/                        # Documentation
│   └── blueprint.md            # Original design document
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config
├── tailwind.config.ts          # Tailwind config
├── next.config.ts              # Next.js config
├── jest.config.js              # Jest config
└── README.md                   # Setup instructions
```

## Typical Workflow

1. **Setup**
   - Enter number of doctors
   - Select date range
   - Set minimum interval between work days

2. **Configure Doctors**
   - Add doctor names
   - Mark vacation dates
   - Add pre-assigned work dates (if any)
   - Mark excluded dates (if any)
   - Set automatic assignment preference

3. **Generate Schedule**
   - Click "Generate Schedule"
   - Algorithm creates optimal schedule
   - View any warnings

4. **Review & Adjust**
   - Check calendar visualization
   - Review summary tables
   - Make manual adjustments if needed
   - Fix entries that shouldn't change

5. **Regenerate (if needed)**
   - Fixed entries are preserved
   - Rest of schedule regenerated
   - Continue refining

6. **Export**
   - Save complete schedule (JSON)
   - Export professional report (PDF/Word)
   - Share with team

## Use Cases

### Small Hospital (5 doctors, 3 months)
- Simple vacation management
- Basic workload balancing
- Quick schedule generation

### Large Clinic (15 doctors, full year)
- Complex vacation patterns
- Multiple constraint combinations
- Advanced fairness requirements
- Monthly/quarterly reviews

### Schedule Updates
- Load existing schedule
- Fix past months
- Add new doctors
- Regenerate future months only

## Key Benefits

1. **Fairness**: Algorithm guarantees equitable distribution
2. **Flexibility**: Supports pre-assignments and manual overrides
3. **Transparency**: Summary tables show clear distribution metrics
4. **User-Friendly**: Intuitive interface with real-time validation
5. **Professional**: High-quality exportable reports
6. **Reliable**: 95%+ test coverage ensures correctness
7. **Accessible**: Multi-language and theme support
8. **Efficient**: Handles large schedules quickly

## Development & Deployment

### Local Development
```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open browser
# Navigate to http://localhost:3000
```

### Available Scripts
- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run start` - Production server
- `npm run lint` - Code linting
- `npm run test` - Run tests
- `npm run test:coverage` - Tests with coverage
- `npm run typecheck` - TypeScript validation

### Deployment Options
- **Firebase App Hosting** (configured in `apphosting.yaml`)
- **Vercel** (recommended for Next.js)
- **Netlify**
- **AWS Amplify**
- **DigitalOcean App Platform**
- **Custom server** (Node.js required)

## Future Enhancement Ideas

1. **Notifications**: Email/SMS reminders for shifts
2. **Calendar Integration**: Sync with Google Calendar, Outlook
3. **Multi-Department**: Support multiple departments/specialties
4. **Advanced Analytics**: More metrics and statistical analysis
5. **Mobile App**: Native iOS/Android applications
6. **Role-Based Access**: Admin, doctor, viewer permissions
7. **Change History**: Track schedule versions and changes
8. **AI Predictions**: Predict staffing needs based on historical data
9. **Shift Trading**: Allow doctors to swap shifts with approval
10. **On-Call Management**: Separate on-call from regular shifts

## Warning System

The application includes a comprehensive warning system that alerts users when:
- No doctors are available for a specific day
- Multiple doctors are pre-assigned to the same day
- Manual adjustments violate minimum interval constraints
- Manual adjustments conflict with vacations or exclusions
- Days remain uncovered after schedule generation

Warnings appear as:
- Toast notifications during generation/editing
- Persistent warning card showing all current issues
- Included in exported PDF/Word reports

## Performance Characteristics

The algorithm is optimized for real-world scenarios:
- **Small schedules** (≤5 doctors, ≤3 months): < 1 second
- **Medium schedules** (≤10 doctors, ≤6 months): < 2 seconds
- **Large schedules** (≤15 doctors, ≤12 months): < 5 seconds

## Accessibility Features

- Keyboard navigation support
- Screen reader friendly
- Color-coded with adequate contrast
- Responsive design (works on mobile, tablet, desktop)
- Clear error messages and validation feedback

## Data Privacy

- All data stored locally in browser (localStorage)
- No data sent to external servers (except Firebase if configured)
- Users have full control over their data
- Export/Import allows data portability

## Conclusion

Rota-Wise is a complete, robust, and well-tested solution for medical scheduling. It combines an intelligent assignment algorithm with a user-friendly interface and professional export features. It's ideal for hospitals, clinics, and any organization that needs to manage shifts fairly and efficiently.

The project demonstrates best practices in:
- Software architecture
- Algorithm design
- User experience
- Testing methodology
- Code quality
- Documentation

It's production-ready and actively maintained with a comprehensive test suite ensuring reliability.
