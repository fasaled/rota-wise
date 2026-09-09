import { type Page } from '@playwright/test';
import { CURRENT_FILE_VERSION, type AppFileData } from '../src/lib/types';

// First weekday of 2024-01-01 — a Monday. We use it as a stable seed for
// the pre-assigned-work entries in every test scenario so the schedule has
// at least one entry on load (which means the Calendar tab is enabled
// immediately and we don't have to wait for the Web Worker).
export const FIRST_WEEKDAY = '2024-01-01';

// ---------------------------------------------------------------------------
// Test-data builders
// ---------------------------------------------------------------------------

export interface TestUnit {
  id: string;
  name: string;
  minPostCallCoverage: number;
  alliedUnitIds?: string[];
}

export interface TestCoverAssignment {
  id: string;
  targetUnitId: string;
  startDate: string;
  endDate: string;
}

export interface TestDoctor {
  id: string;
  name: string;
  unitId?: string;
  freeDates?: string[];
  excludedDates?: string[];
  preAssignedWorkDates?: string[];
  isExcludedFromAutomaticAssignment?: boolean;
  coverAssignments?: TestCoverAssignment[];
}

export interface TestPreAssigned {
  doctorId: string;
  date: string;
}

export interface CreateTestFileOptions {
  units: TestUnit[];
  doctors: TestDoctor[];
  scheduleRange: { start: string; end: string };
  preAssignedWork?: TestPreAssigned[];
  minIntervalBetweenWorkDays?: number;
  holidays?: string[];
}

/**
 * Build the JSON payload that the File System Access mock will hand back to
 * the app. The app's `readFileData` parses this verbatim and then
 * `deserializeAppFileData` converts the ISO strings back to `Date` objects.
 * So this helper MUST emit ISO strings, not `Date` objects.
 */
export function createTestFileJson(opts: CreateTestFileOptions): string {
  const toIso = (d: string) => new Date(d).toISOString();
  const startIso = toIso(opts.scheduleRange.start);
  const endIso = toIso(opts.scheduleRange.end);

    const preAssignedByDoctor = new Map<string, string[]>();
  for (const p of opts.preAssignedWork ?? []) {
    const arr = preAssignedByDoctor.get(p.doctorId) ?? [];
    arr.push(toIso(p.date));
    preAssignedByDoctor.set(p.doctorId, arr);
  }

  const holidays = (opts.holidays ?? []).map((d) => toIso(d));

  const payload: AppFileData = {
    fileVersion: CURRENT_FILE_VERSION,
    versions: [],
    schedule: {
      startDate: startIso,
      endDate: endIso,
      minIntervalBetweenWorkDays: opts.minIntervalBetweenWorkDays ?? 1,
      entries: (opts.preAssignedWork ?? []).map((p) => ({
        date: toIso(p.date),
        doctorId: p.doctorId,
        assignment: 'Pre-assigned',
        dayOfWeek: '',
      })),
    },
    doctorsProfiles: opts.doctors.map((d) => ({
      id: d.id,
      name: d.name,
      freeDates: (d.freeDates ?? []).map(toIso),
      preAssignedWorkDates: preAssignedByDoctor.get(d.id) ?? [],
      excludedDates: (d.excludedDates ?? []).map(toIso),
      isExcludedFromAutomaticAssignment: d.isExcludedFromAutomaticAssignment ?? false,
      unitId: d.unitId,
      coverAssignments: (d.coverAssignments ?? []).map((a) => ({
        id: a.id,
        targetUnitId: a.targetUnitId,
        startDate: toIso(a.startDate),
        endDate: toIso(a.endDate),
      })),
    })),
    formValues: {
      numberOfDoctors: opts.doctors.length,
      startDate: startIso,
      endDate: endIso,
      minIntervalBetweenWorkDays: opts.minIntervalBetweenWorkDays ?? 1,
      doctors: opts.doctors.map((d) => ({
        id: d.id,
        name: d.name,
        freeDates: (d.freeDates ?? []).map(toIso),
        preAssignedWorkDates: preAssignedByDoctor.get(d.id) ?? [],
        excludedDates: (d.excludedDates ?? []).map(toIso),
        isExcludedFromAutomaticAssignment: d.isExcludedFromAutomaticAssignment ?? false,
        unitId: d.unitId ?? '',
        coverAssignments: (d.coverAssignments ?? []).map((a) => ({
          id: a.id,
          targetUnitId: a.targetUnitId,
          startDate: toIso(a.startDate),
          endDate: toIso(a.endDate),
        })),
      })),
      units: opts.units.map((u) => ({
        id: u.id,
        name: u.name,
        minPostCallCoverage: u.minPostCallCoverage,
        alliedUnitIds: u.alliedUnitIds ?? [],
      })),
      holidays,
    },
    scheduleWarnings: [],
    currentMinInterval: opts.minIntervalBetweenWorkDays ?? 1,
  };

  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------------
// File System Access API mock
// ---------------------------------------------------------------------------

/**
 * Install a `window.showOpenFilePicker` shim and a writable shim that
 * capture the last saved payload into `window.__lastSavedData`. The shim is
 * installed via `addInitScript` so it runs before the app's own JS, which
 * is exactly the timing the production code assumes.
 */
export async function mockFileSystemAccess(page: Page, fileData: AppFileData) {
  const serialized = JSON.stringify(fileData);

  await page.addInitScript((payload) => {
    localStorage.setItem('rotawise-language', 'en');
    const blob = new Blob([payload], { type: 'application/json' });

    // Expose the data for tests to inspect.
    (window as unknown as { __testFileData: string }).__testFileData = payload;
    (window as unknown as { __lastSavedData: string | null }).__lastSavedData = null;

    const fileHandle = {
      name: 'test.rw',
      kind: 'file' as const,
      getFile: async () =>
        new File([blob], 'test.rw', { type: 'application/json' }),
      queryPermission: async () => 'granted' as const,
      requestPermission: async () => 'granted' as const,
      createWritable: async () => {
        const writable = {
          write: async (data: string | Blob | ArrayBuffer) => {
            const text =
              typeof data === 'string'
                ? data
                : data instanceof Blob
                  ? await data.text()
                  : new TextDecoder().decode(data);
            (window as unknown as { __lastSavedData: string }).__lastSavedData = text;
          },
          close: async () => {},
          abort: async () => {},
        };
        return writable;
      },
    };

    (window as unknown as { showOpenFilePicker: () => Promise<typeof fileHandle[]> }).showOpenFilePicker =
      async () => [fileHandle];
    (window as unknown as { showSaveFilePicker: () => Promise<typeof fileHandle> }).showSaveFilePicker =
      async () => fileHandle;
  }, serialized);
}

// ---------------------------------------------------------------------------
// App interactions
// ---------------------------------------------------------------------------

/**
 * Open the app, load the mocked file, and switch to the Calendar tab.
 *
 * The test scenarios seed the schedule with a pre-assigned entry so the
 * Calendar tab is enabled immediately after hydration. This avoids having
 * to wait for the Web Worker to generate the schedule, which is flaky in
 * the headless Chromium test environment.
 */
export async function openAppAndLoadFile(page: Page) {
  // Capture browser console + page errors for easier debugging.
  const messages: string[] = [];
  page.on('console', (msg) => messages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => messages.push(`[pageerror] ${err.message}`));
  (page as unknown as { __e2eMessages: string[] }).__e2eMessages = messages;

  await page.goto('/');
  await page.getByRole('button', { name: /open file/i }).click();

  // The nav items are <button> elements with a translated `title`
  // attribute ("Calendar" in en, "Calendario" in es).
  const calendarNav = page.locator('button[title="Calendar"], button[title="Calendario"]').first();
  await calendarNav.waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => {
      const btn = document.querySelector(
        'button[title="Calendar"], button[title="Calendario"]',
      ) as HTMLButtonElement | null;
      return !!btn && !btn.disabled;
    },
    { timeout: 5_000 },
  );
  await calendarNav.click();
  // Give the calendar a moment to render its first batch of days.
  await page.waitForTimeout(500);
}

/** Open the mocked file and wait until the app shell (sidebar) is visible. */
export async function openAppOnRoster(page: Page) {
  page.on('console', (msg) => {
    const bag = (page as unknown as { __e2eMessages?: string[] }).__e2eMessages;
    bag?.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    const bag = (page as unknown as { __e2eMessages?: string[] }).__e2eMessages;
    bag?.push(`[pageerror] ${err.message}`);
  });
  (page as unknown as { __e2eMessages: string[] }).__e2eMessages = [];

  await page.goto('/');
  await page.getByRole('button', { name: /open file/i }).click();
  await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
  await navButton(page, 'Roster').click();
  await page.getByText('Schedule parameters').waitFor({ state: 'visible', timeout: 15_000 });
}

export function navButton(page: Page, title: string) {
  return page.locator(`aside.app-sidebar button[title="${title}"]`).first();
}

export async function goToTab(page: Page, title: string) {
  const btn = navButton(page, title);
  await btn.waitFor({ state: 'visible' });
  await page.waitForFunction(
    (tabTitle) => {
      const btn = document.querySelector(
        `aside.app-sidebar button[title="${tabTitle}"]`,
      ) as HTMLButtonElement | null;
      return !!btn && !btn.disabled;
    },
    title,
    { timeout: 20_000 },
  );
  await btn.click();
}

// ---------------------------------------------------------------------------
// Coverage assertions
// ---------------------------------------------------------------------------

export interface CoverageCounts {
  red: number;
  green: number;
  grey: number;
  warnings: number;
}

/**
 * Read the coverage state from the rendered calendar and the warnings
 * banner. Uses stable selectors (`bg-emerald-500`, `bg-rose-500`,
 * `bg-zinc-300`) that match the `DayCell` dot rendering. The legend at
 * the bottom of the calendar also uses these classes, so we scope the
 * counts to the calendar grid via a stable ancestor.
 */
export async function readCoverageState(page: Page): Promise<CoverageCounts> {
  // Give the calendar a moment to render after navigation / data changes.
  await page.waitForTimeout(150);

  // The warnings banner starts collapsed — expand it so the <li> items
  // are in the DOM and getByText can match them.
  const bannerToggle = page.getByRole('button', { name: /important schedule warnings/i });
  if (await bannerToggle.isVisible().catch(() => false)) {
    const expanded = await bannerToggle.getAttribute('aria-expanded').catch(() => null);
    if (expanded !== 'true') {
      await bannerToggle.click();
      await page.waitForTimeout(100);
    }
  }

  // Scope the dot counts to the month grid. The grid is the LAST
  // `.grid-cols-7` on the page (the first one is the weekday-headers
  // row "Sun / Mon / ..."). This excludes the legend (which uses the
  // same bg-* classes) and any other incidental uses.
  const grid = page.locator('.grid-cols-7').last();
  await grid.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});

  const [red, green, grey, warnings] = await Promise.all([
    grid.locator('.bg-rose-500').count(),
    grid.locator('.bg-emerald-500').count(),
    grid.locator('.bg-zinc-300').count(),
    page.getByText(/is undercovered on/i).count(),
  ]);

  return { red, green, grey, warnings };
}

/**
 * Wait until the last persisted file payload (captured by the writable
 * shim) contains a `formValues.doctors[*].unitId` matching the predicate.
 * Useful for tests that want to assert the auto-save flushed a specific
 * value.
 */
export async function waitForSavedFileMatching(
  page: Page,
  predicate: (parsed: AppFileData) => boolean,
  timeoutMs = 5000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const raw = await page.evaluate(() => (window as unknown as { __lastSavedData: string | null }).__lastSavedData);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AppFileData;
        if (predicate(parsed)) return parsed;
      } catch {
        // ignore parse errors (partial writes)
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Saved file did not match predicate within ${timeoutMs}ms`);
}
