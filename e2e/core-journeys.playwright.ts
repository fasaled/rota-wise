import { test, expect } from '@playwright/test';
import {
  createTestFileJson,
  mockFileSystemAccess,
  openAppAndLoadFile,
  openAppOnRoster,
  goToTab,
  navButton,
} from './helpers';

function twoDoctorJanuaryFile(opts?: { withPreAssigned?: boolean; end?: string }) {
  return createTestFileJson({
    units: [],
    doctors: [
      { id: 'd1', name: 'Dr. Ada' },
      { id: 'd2', name: 'Dr. Bob' },
    ],
    scheduleRange: { start: '2026-10-01', end: opts?.end ?? '2026-10-14' },
    preAssignedWork: opts?.withPreAssigned === false
      ? []
      : [{ doctorId: 'd1', date: '2026-10-01' }],
  });
}

test.describe('Startup', () => {
  test('shows open and create actions', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await page.goto('/');
    await expect(page.getByRole('button', { name: /open file/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create new file/i })).toBeVisible();
    await expect(page.getByText(/open a schedule file to get started/i)).toBeVisible();
  });

  test('opening a file shows the roster and file name', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppOnRoster(page);

    await expect(page.getByText('test.rw')).toBeVisible();
    await expect(navButton(page, 'Roster')).toBeVisible();
    await expect(page.getByLabel('Name').first()).toHaveValue('Dr. Ada');
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Dr. Bob');
  });

  test('creating a new file lands on an empty roster', async ({ page }) => {
    await mockFileSystemAccess(
      page,
      JSON.parse(
        createTestFileJson({
          units: [],
          doctors: [],
          scheduleRange: { start: '2024-01-01', end: '2024-01-31' },
        }),
      ),
    );
    await page.goto('/');
    await page.getByRole('button', { name: /create new file/i }).click();
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByText('No doctors on the roster yet')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Add doctor' })).toBeVisible();
    await expect(navButton(page, 'Weekly Summary')).toBeDisabled();
    await expect(navButton(page, 'Monthly Summary')).toBeDisabled();
  });
});

test.describe('Schedule generation', () => {
  test('generate fills the calendar and enables summary tabs', async ({ page }) => {
    test.setTimeout(45_000);
    await mockFileSystemAccess(
      page,
      JSON.parse(twoDoctorJanuaryFile({ withPreAssigned: false })),
    );
    await openAppOnRoster(page);

    const generate = page.getByRole('button', { name: 'Generate schedule' });
    await expect(generate).toBeEnabled();
    await generate.click();

    await expect(page.getByText('Schedule generated')).toBeVisible({ timeout: 20_000 });
    await expect(navButton(page, 'Calendar')).toBeEnabled();
    await expect(navButton(page, 'Weekly Summary')).toBeEnabled();
    await expect(navButton(page, 'Monthly Summary')).toBeEnabled();

    await goToTab(page, 'Calendar');
    const grid = page.locator('.grid-cols-7').last();
    await expect(grid.getByText('Dr. Ada').first()).toBeVisible();
    await expect(grid.getByText('Dr. Bob').first()).toBeVisible();
  });
});

test.describe('Calendar', () => {
  test('shows seeded assignments and can change month', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppAndLoadFile(page);

    const grid = page.locator('.grid-cols-7').last();
    await expect(grid.getByText('Dr. Ada').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();

    const monthLabel = page.locator('span.w-44.tabular-nums');
    await expect(monthLabel).toContainText(/October|octubre/i);

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(monthLabel).toContainText(/November|noviembre/i);
  });

  test('assigning a doctor on an empty day can be undone', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppAndLoadFile(page);

    const grid = page.locator('.grid-cols-7').last();
    await expect(grid.getByText('Dr. Ada')).toHaveCount(1);

    await page.getByText('Select doctor').first().click();
    await page.locator('.fixed.z-\\[1000\\]').getByText('Dr. Bob', { exact: true }).click();
    await expect(grid.getByText('Dr. Bob')).toHaveCount(1);

    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.getByText('Change undone')).toBeVisible();
    await expect(grid.getByText('Dr. Bob')).toHaveCount(0);
  });
});

test.describe('Summaries', () => {
  test('weekly and monthly tables list the doctors', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppAndLoadFile(page);

    await goToTab(page, 'Weekly Summary');
    await expect(page.getByText('Workdays summary (by day of week)')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Dr. Ada' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Dr. Bob' })).toBeVisible();

    await goToTab(page, 'Monthly Summary');
    await expect(page.getByText('Monthly workload summary')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Dr. Ada' })).toBeVisible();
  });
});

test.describe('Command bar', () => {
  test('clear schedule asks for confirmation and disables calendar', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppAndLoadFile(page);

    await page.getByRole('button', { name: 'Clear schedule' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Clear Schedule' }).click();

    await expect(page.getByText('Schedule cleared')).toBeVisible();
    await expect(navButton(page, 'Calendar')).toBeDisabled();
  });

  test('export Word downloads a .docx file', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppAndLoadFile(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: 'Export as Word' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.docx$/i);
  });
});

test.describe('Theme', () => {
  test('dark mode persists across reload and system follows the OS', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppOnRoster(page);

    const htmlHasDark = () =>
      page.locator('html').evaluate((el) => el.classList.contains('dark'));

    const toggle = page.getByRole('button', { name: 'Toggle theme' });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    await expect.poll(htmlHasDark).toBe(true);
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('rotawise-theme')))
      .toBe('dark');

    await page.reload();
    await expect.poll(htmlHasDark).toBe(true);

    await page.getByRole('button', { name: /open file/i }).click();
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });

    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.getByRole('menuitem', { name: 'Light' }).click();
    await expect.poll(htmlHasDark).toBe(false);

    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.getByRole('menuitem', { name: 'System' }).click();

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(htmlHasDark).toBe(true);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(htmlHasDark).toBe(false);
  });
});

test.describe('Language', () => {
  test('switching to Spanish updates navigation labels', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppOnRoster(page);

    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('menuitem', { name: 'Español' }).click();

    await expect(navButton(page, 'Planilla')).toBeVisible();
    await expect(navButton(page, 'Calendario')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar horario' })).toBeVisible();
  });
});

test.describe('Unsupported browser', () => {
  test('blocks the app when the File System Access API is missing', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('rotawise-language', 'en');
      delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
    await page.goto('/');
    await expect(page.getByText('Browser not supported')).toBeVisible();
    await expect(page.getByText('Google Chrome (version 86 or later)')).toBeVisible();
    await expect(page.getByRole('button', { name: /open file/i })).toHaveCount(0);
  });
});
