import { test, expect } from './fixtures';
import {
  createTestFileJson,
  mockFileSystemAccess,
  openAppAndLoadFile,
  openFileFromMenu,
  goToTab,
  navButton,
} from './helpers';

/** Dr. Ada works on 1 Oct; Dr. Bob and Dr. Cy are free. */
function octoberFile() {
  return createTestFileJson({
    units: [],
    doctors: [
      { id: 'd1', name: 'Dr. Ada' },
      { id: 'd2', name: 'Dr. Bob' },
      { id: 'd3', name: 'Dr. Cy' },
    ],
    scheduleRange: { start: '2026-10-01', end: '2026-10-14' },
    preAssignedWork: [{ doctorId: 'd1', date: '2026-10-01' }],
  });
}

function collectPageErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('Roster edits with an existing schedule', () => {
  test('removing a doctor who has shifts keeps the app alive and flags the orphan shifts', async ({ page }) => {
    const errors = collectPageErrors(page);
    await mockFileSystemAccess(page, JSON.parse(octoberFile()));
    await openAppAndLoadFile(page);

    await navButton(page, 'Roster').click();
    await page.getByRole('button', { name: 'Remove Dr. Ada' }).click();
    await expect(page.getByRole('button', { name: 'Remove Dr. Ada' })).toHaveCount(0);

    await goToTab(page, 'Calendar');
    await expect(page.locator('.grid-cols-7').last()).toBeVisible();
    await expect(page.getByText('Removed doctor').first()).toBeVisible();
    await page.getByRole('button', { name: /Important schedule warnings/ }).click();
    await expect(page.getByText(/no longer on the roster/)).toBeVisible();

    await goToTab(page, 'Weekly Summary');
    await expect(page.getByRole('table').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Undo and redo', () => {
  test('redo re-applies an undone assignment, from the button and the keyboard', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(octoberFile()));
    await openAppAndLoadFile(page);

    const grid = page.locator('.grid-cols-7').last();
    const redo = page.getByRole('button', { name: 'Redo' });
    await expect(redo).toBeDisabled();

    await page.getByText('Select doctor').first().click();
    await page.getByRole('option', { name: 'Dr. Bob' }).click();
    await expect(grid.getByText('Dr. Bob')).toHaveCount(1);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(grid.getByText('Dr. Bob')).toHaveCount(0);

    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(grid.getByText('Dr. Bob')).toHaveCount(1);

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(grid.getByText('Dr. Bob')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(grid.getByText('Dr. Bob')).toHaveCount(1);
  });
});

test.describe('Doctor picker', () => {
  test('works from the keyboard and closes with Escape', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(octoberFile()));
    await openAppAndLoadFile(page);
    const grid = page.locator('.grid-cols-7').last();

    await page.getByText('Select doctor').first().click();
    const search = page.getByRole('combobox', { name: 'Search doctors…' });
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await page.getByText('Select doctor').first().click();
    await search.fill('cy');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(grid.getByText('Dr. Cy')).toHaveCount(1);
  });

  test('doctors resting after a shift cannot be picked for the next day', async ({ page }) => {
    await mockFileSystemAccess(page, JSON.parse(octoberFile()));
    await openAppAndLoadFile(page);

    // First empty day is 2 Oct, the day after Dr. Ada's shift.
    await page.getByText('Select doctor').first().click();
    await expect(page.getByRole('option', { name: /Dr\. Ada/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('option', { name: /Dr\. Bob/ })).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('Phone layout', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('shows the month as an agenda and offers language and theme in the More menu', async ({ page }) => {
    const errors = collectPageErrors(page);
    await mockFileSystemAccess(page, JSON.parse(octoberFile()));
    await page.goto('/');
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await openFileFromMenu(page);
    await navButton(page, 'Calendar').click();

    const agenda = page.getByRole('list', { name: /October/i });
    await expect(agenda).toBeVisible();
    await expect(agenda.getByText('Dr. Ada')).toBeVisible();
    await expect(page.locator('.grid-cols-7')).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Language, theme and more' }).click();
    await page.getByRole('menuitem', { name: 'Español' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(errors).toEqual([]);
  });
});

test.describe('Document metadata', () => {
  test('?lang=es renders Spanish and is self-canonical', async ({ page }) => {
    await page.goto('/?lang=es');
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\?lang=es$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
});

test.describe('Starting from scratch', () => {
  test('typing a roster enables Generate, which points at the missing period and then works', async ({ page }) => {
    test.setTimeout(45_000);
    const errors = collectPageErrors(page);
    await page.goto('/?lang=en');
    await page.locator('aside.app-sidebar').waitFor({ state: 'visible', timeout: 15_000 });

    const generate = page.getByRole('button', { name: 'Generate schedule' });
    await expect(generate).toBeDisabled();

    for (const name of ['Dr. Ada', 'Dr. Bob', 'Dr. Cy']) {
      await page.getByRole('button', { name: 'Add doctor' }).click();
      await page.getByLabel('Name').last().fill(name);
    }
    await expect(generate).toBeEnabled();

    // No period yet: the form explains what is missing instead of generating.
    await generate.click();
    await expect(page.getByText('Fix the highlighted fields before generating.')).toBeVisible();
    const period = page.locator('[aria-invalid="true"]').first();
    await expect(period).toBeInViewport();

    await period.click();
    await page.getByRole('gridcell', { name: '3', exact: true }).first().click();
    await page.getByRole('gridcell', { name: '24', exact: true }).last().click();
    await page.keyboard.press('Escape');

    await generate.click();
    await expect(page.getByText('Schedule generated')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Fix the highlighted fields before generating.')).toHaveCount(0);
    await expect(page.locator('.grid-cols-7').last().getByText(/Dr\. (Ada|Bob|Cy)/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Official holidays', () => {
  const officialCalendar = [
    { date: '2026/10/12', descripcionEs: 'Fiesta Nacional', municipalityEs: 'CAE', territory: 'Todos/denak', municipalitycode: null },
    { date: '2026/10/05', descripcionEs: 'Fiesta local', municipalityEs: 'Donostia-San Sebastian  ', territory: 'Gipuzkoa', municipalitycode: 69 },
    { date: '2026/10/07', descripcionEs: 'Otra', municipalityEs: 'Zarautz', territory: 'Gipuzkoa', municipalitycode: 79 },
    { date: '2026/12/25', descripcionEs: 'Navidad', municipalityEs: 'CAE', territory: 'Todos/denak', municipalitycode: null },
  ];

  test('are imported only on demand and stay editable', async ({ page }) => {
    const requests: string[] = [];
    await page.route('https://opendata.euskadi.eus/**', async (route) => {
      requests.push(route.request().url());
      await route.fulfill({ json: officialCalendar, headers: { 'access-control-allow-origin': '*' } });
    });
    await mockFileSystemAccess(page, JSON.parse(octoberFile()));
    await openAppAndLoadFile(page);
    await navButton(page, 'Roster').click();

    const list = page.getByRole('list', { name: 'Selected holidays' });
    await expect(list).toHaveCount(0);
    expect(requests).toEqual([]);

    await page.getByRole('button', { name: /Import official holidays/ }).click();
    await expect(page.getByText('2 holiday(s) added, 0 already on the list.')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('calendario_laboral_2026');
    // Only the days of the city inside the period (1–14 Oct).
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).toContainText('5 Oct 2026');
    await expect(list).toContainText('12 Oct 2026');

    // Imported days are ordinary holidays: remove one, add another by hand.
    await list.getByRole('button', { name: /Remove .*5 Oct 2026/ }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(page.locator('#form-holidays')).toHaveText('1 holiday(s) selected');
    await page.locator('#form-holidays').click();
    await page.getByRole('gridcell', { name: '8', exact: true }).first().click();
    await page.keyboard.press('Escape');
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list).toContainText('8 Oct 2026');

    // Importing again restores the removed day without duplicating the rest.
    await page.getByRole('button', { name: /Import official holidays/ }).click();
    await expect(page.getByText('1 holiday(s) added, 1 already on the list.')).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(3);

    await goToTab(page, 'Calendar');
    await expect(page.locator('.grid-cols-7').last()).toBeVisible();
  });

  test('a failed download leaves the holidays untouched', async ({ page }) => {
    await page.route('https://opendata.euskadi.eus/**', (route) => route.abort());
    await mockFileSystemAccess(page, JSON.parse(octoberFile()));
    await openAppAndLoadFile(page);
    await navButton(page, 'Roster').click();

    await page.getByRole('button', { name: /Import official holidays/ }).click();
    await expect(page.getByText('Could not download the official calendar.', { exact: false })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Selected holidays' })).toHaveCount(0);
  });
});
