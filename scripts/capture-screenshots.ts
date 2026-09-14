/**
 * Regenerates public/screenshots/{desktop,mobile}.png from a synthetic June
 * 2026 rota (no real names). Requires the Vite dev server on :5173.
 *
 *   bun run dev
 *   bun scripts/capture-screenshots.ts
 */
import { chromium } from '@playwright/test';
import { generateSchedule } from '../src/lib/schedule-generator';
import { buildAppFileData } from '../src/lib/schedule-storage';
import type { DoctorFormFieldInput, DoctorProfile } from '../src/lib/types';
import path from 'node:path';

const OUT = path.resolve(import.meta.dir, '../public/screenshots');
const BASE = 'http://localhost:5173';

const doctors: DoctorFormFieldInput[] = ['Ada', 'Beau', 'Cam', 'Drew', 'Eve', 'Fay'].map(
  (name, i) => ({
    id: `d${i}`,
    name: `Dr. ${name}`,
    freeDates: [],
    preAssignedWorkDates: [],
    excludedDates: [],
    isExcludedFromAutomaticAssignment: false,
  }),
);

const startDate = new Date('2026-06-01T00:00:00');
const endDate = new Date('2026-06-30T00:00:00');

const generated = generateSchedule({
  numberOfDoctors: doctors.length,
  startDate,
  endDate,
  minIntervalBetweenWorkDays: 1,
  doctors,
  units: [],
  holidays: [],
});

if (!generated.schedule) {
  throw new Error(generated.error ?? 'generateSchedule failed');
}

const profiles: DoctorProfile[] = doctors.map((d) => ({
  ...d,
  coverAssignments: [],
}));

const fileData = buildAppFileData(
  generated.schedule,
  profiles,
  {
    numberOfDoctors: doctors.length,
    startDate,
    endDate,
    minIntervalBetweenWorkDays: 1,
    doctors,
    units: [],
    holidays: [],
  },
  [],
  1,
  [],
);

const payload = JSON.stringify(fileData);

async function dismissToasts(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: /dismiss/i });
  const n = await dismiss.count();
  for (let i = 0; i < n; i++) {
    await dismiss.nth(0).click({ timeout: 1_000 }).catch(() => {});
  }
}

async function loadCalendar(page: import('@playwright/test').Page) {
  await page.addInitScript((json: string) => {
    localStorage.setItem('rotawise-language', 'en');
    localStorage.setItem('rotawise-theme', 'light');
    const blob = new Blob([json], { type: 'application/json' });
    const handle = {
      name: 'june-2026.rw',
      kind: 'file' as const,
      getFile: async () => new File([blob], 'june-2026.rw', { type: 'application/json' }),
      queryPermission: async () => 'granted' as const,
      requestPermission: async () => 'granted' as const,
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
        abort: async () => {},
      }),
    };
    (window as unknown as { showOpenFilePicker: () => Promise<typeof handle[]> }).showOpenFilePicker =
      async () => [handle];
    (window as unknown as { showSaveFilePicker: () => Promise<typeof handle> }).showSaveFilePicker =
      async () => handle;
  }, payload);

  await page.goto(BASE);
  await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  const calendarNav = page.locator('button[title="Calendar"]').first();
  await calendarNav.waitFor({ state: 'visible' });
  await calendarNav.click();
  await page.getByText('Generated schedule').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('Dr. Ada').filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await dismissToasts(page);
}

async function main() {
  const browser = await chromium.launch();

  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  const desktopPage = await desktop.newPage();
  await loadCalendar(desktopPage);
  await desktopPage.screenshot({ path: path.join(OUT, 'desktop.png') });
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await loadCalendar(mobilePage);
  await mobilePage.screenshot({ path: path.join(OUT, 'mobile.png') });
  await mobile.close();

  await browser.close();
  console.log('Wrote', path.join(OUT, 'desktop.png'), 'and', path.join(OUT, 'mobile.png'));
}

await main();
