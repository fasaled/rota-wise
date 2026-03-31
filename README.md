# Rota-Wise

A web application for fair and balanced doctor shift scheduling. Rota-Wise solves the complex problem of generating equitable work schedules while respecting vacations, rest intervals, pre-assignments, and workload distribution across days and months.

## Features

- **Smart scheduling algorithm** — automatically generates optimal schedules with configurable constraints
- **Interactive calendar** — color-coded monthly view with click-to-edit and entry locking
- **Fairness guarantees** — balanced distribution by weekday, month, and weekend shifts
- **Global monthly shift limit** — configurable cap on shifts per doctor per month
- **Summary tables** — workdays by day-of-week and by month for each doctor
- **Export** — professional PDF and Word (.docx) reports
- **Save/load** — persist full schedules as JSON; reload as-is or convert to pre-assigned
- **Internationalization** — English and Spanish support
- **Dark/light theme**

## Tech Stack

- **Next.js 16** / **React 19** / **TypeScript**
- **Tailwind CSS** + **Radix UI** components
- **date-fns**, **react-hook-form** + **Zod**, **@tanstack/react-query**
- **jspdf** + **jspdf-autotable** for PDF export
- **docx** for Word export
- **PWA** support via `@ducanh2912/next-pwa`

## Getting Started

**Prerequisites:** Node.js v18+

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | Lint code |
| `npm run typecheck` | TypeScript validation |
| `npm run test` | Run tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with coverage report |

## Project Structure

```
src/
├── app/                  # Next.js pages and layout
├── components/
│   ├── rotawise/         # Schedule-specific components
│   └── ui/               # Reusable UI primitives
├── context/              # React contexts
├── hooks/                # Custom hooks
├── lib/
│   ├── schedule-generator.ts  # Core scheduling algorithm
│   ├── types.ts               # TypeScript types
│   └── utils.ts               # Utilities
├── locales/              # i18n translations (EN/ES)
└── __tests__/            # Test suites
```

## Algorithm Overview

The scheduling algorithm scores eligible doctors for each day based on:

- **Hard constraints**: minimum rest interval, vacation dates, excluded dates, pre-assigned dates, fixed entries, global monthly shift limit
- **Soft constraints**: total workdays balance, day-of-week distribution, monthly workload, weekend fairness, idle time since last shift

## Test Coverage

- Statement: ~95% | Branch: ~87% | Function: ~94% | Line: ~96%

## Deployment

The app can be deployed to any Node.js-compatible platform:

- **Vercel** — recommended for Next.js
- **Netlify**, **AWS Amplify**, **DigitalOcean App Platform**
- **Custom server** — Node.js + a process manager (e.g. PM2) and a reverse proxy (e.g. Nginx)

For all providers, set build command to `npm run build` and start command to `npm run start`.
