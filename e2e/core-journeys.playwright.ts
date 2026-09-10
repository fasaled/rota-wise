import { test, expect } from '@playwright/test';
import {
  createTestFileJson,
  mockFileSystemAccess,
  openAppAndLoadFile,
  openAppOnRoster,
  openFileFromMenu,
  fileMenuButton,
  goToTab,
  navButton,
  waitForSavedFileMatching,
  readWorkingCopy,
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
  test('opens the app on an empty roster', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('rotawise-language', 'en');
    });
    await page.goto('/');
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByText('No doctors on the roster yet')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/open a schedule file to get started/i)).toHaveCount(0);
    await expect(fileMenuButton(page)).toBeVisible();
    await expect(page.getByText('No file open')).toBeVisible();
    await expect(page.getByText('Browser only')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add doctor' })).toBeVisible();
    await expect(navButton(page, 'Calendar')).toBeDisabled();
    await expect(navButton(page, 'Weekly Summary')).toBeDisabled();
    await expect(navButton(page, 'Monthly Summary')).toBeDisabled();
  });

  test('opening a file from empty roster does not ask to replace', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await page.goto('/');
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByText('No doctors on the roster yet')).toBeVisible();

    await openFileFromMenu(page);

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Name').first()).toHaveValue('Dr. Ada');
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Dr. Bob');
    await expect(page.getByText('test.rw')).toBeVisible();
    await expect(page.getByText('Browser only')).toHaveCount(0);
  });

  test('new schedule clears the roster after confirmation and stays empty on reload', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppOnRoster(page);
    await expect(page.getByLabel('Name').first()).toHaveValue('Dr. Ada');

    await fileMenuButton(page).click();
    await page.getByRole('menuitem', { name: 'New schedule' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'New schedule' })).toBeVisible();
    await dialog.getByRole('button', { name: 'New schedule' }).click();

    await expect(page.getByText('No doctors on the roster yet')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No file open')).toBeVisible();
    await expect(page.getByText('Browser only')).toBeVisible();
    await expect(navButton(page, 'Calendar')).toBeDisabled();

    await expect
      .poll(async () => {
        const copy = await readWorkingCopy(page);
        return copy?.formValues?.doctors?.length ?? 0;
      })
      .toBe(0);

    await page.reload();
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByText('No doctors on the roster yet')).toBeVisible();
    await expect(page.getByText('Dr. Ada')).toHaveCount(0);
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

test.describe('Persistence', () => {
  test('edits persist in the browser without a file', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('rotawise-language', 'en');
    });
    await page.goto('/');
    await expect(page.getByText('No doctors on the roster yet')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Add doctor' }).click();
    await page.getByLabel('Name').fill('Dr. Ada');

    await expect
      .poll(async () => {
        const copy = await readWorkingCopy(page);
        return copy?.formValues?.doctors?.some((d) => d.name === 'Dr. Ada') ?? false;
      })
      .toBe(true);

    await page.reload();
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByLabel('Name')).toHaveValue('Dr. Ada');
    await expect(page.getByText('Browser only')).toBeVisible();
    await expect(page.getByText('No file open')).toBeVisible();
  });

  test('reloading restores a roster loaded from a file without opening it again', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await openAppOnRoster(page);
    await expect(page.getByLabel('Name').first()).toHaveValue('Dr. Ada');

    await waitForSavedFileMatching(
      page,
      (parsed) => parsed.formValues?.doctors?.some((d) => d.name === 'Dr. Ada') ?? false,
    );

    await page.reload();
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByLabel('Name').first()).toHaveValue('Dr. Ada');
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Dr. Bob');
  });

  test('opening another file asks to replace and then loads the new roster', async ({ page }) => {
    const first = JSON.parse(twoDoctorJanuaryFile());
    const second = JSON.parse(
      createTestFileJson({
        units: [],
        doctors: [
          { id: 'c1', name: 'Dr. Carol' },
          { id: 'c2', name: 'Dr. Dan' },
        ],
        scheduleRange: { start: '2026-10-01', end: '2026-10-14' },
        preAssignedWork: [{ doctorId: 'c1', date: '2026-10-01' }],
      }),
    );
    await mockFileSystemAccess(page, [first, second]);
    await openAppOnRoster(page);
    await expect(page.getByLabel('Name').first()).toHaveValue('Dr. Ada');

    await openFileFromMenu(page);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Replace current schedule?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Open file' }).click();

    await expect(page.getByLabel('Name').first()).toHaveValue('Dr. Carol');
    await expect(page.getByLabel('Name').nth(1)).toHaveValue('Dr. Dan');
    await expect(page.getByText('Dr. Ada')).toHaveCount(0);
    await expect(page.getByText('other.rw')).toBeVisible();
  });

  test('cancelling replace keeps the current roster', async ({ page }) => {
    const first = JSON.parse(twoDoctorJanuaryFile());
    const second = JSON.parse(
      createTestFileJson({
        units: [],
        doctors: [{ id: 'c1', name: 'Dr. Carol' }],
        scheduleRange: { start: '2026-10-01', end: '2026-10-14' },
      }),
    );
    await mockFileSystemAccess(page, [first, second]);
    await openAppOnRoster(page);

    await openFileFromMenu(page);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: 'Replace current schedule?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByLabel('Name').first()).toHaveValue('Dr. Ada');
    await expect(page.getByText('test.rw')).toBeVisible();
  });

  test('save to file binds the handle and drops the browser-only badge', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(twoDoctorJanuaryFile()));
    await page.addInitScript(() => {
      localStorage.setItem('rotawise-language', 'en');
    });
    await page.goto('/');
    await expect(page.getByText('No doctors on the roster yet')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Browser only')).toBeVisible();

    await page.getByRole('button', { name: 'Add doctor' }).click();
    await page.getByLabel('Name').fill('Dr. Ada');

    await fileMenuButton(page).click();
    await page.getByRole('menuitem', { name: 'Save to file…' }).click();

    await expect(page.getByText('test.rw')).toBeVisible();
    await expect(page.getByText('Browser only')).toHaveCount(0);
    await expect(page.getByText('File saved')).toBeVisible();
  });
});

test.describe('Command bar', () => {

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
  test('still opens the app when the File System Access API is missing', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('rotawise-language', 'en');
      delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
    await page.goto('/');
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.getByText('No disk auto-save in this browser')).toBeVisible();
    await expect(page.getByText('No doctors on the roster yet')).toBeVisible();
    await expect(fileMenuButton(page)).toBeVisible();
    await expect(page.getByText('Browser only')).toBeVisible();

    await fileMenuButton(page).click();
    await expect(page.getByRole('menuitem', { name: 'Open…' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Save to file…' })).toBeVisible();
  });
});
