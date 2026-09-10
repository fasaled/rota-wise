import { test, expect } from '@playwright/test';
import {
  createTestFileJson,
  mockFileSystemAccess,
  openAppAndLoadFile,
  readCoverageState,
  waitForSavedFileMatching,
  FIRST_WEEKDAY,
} from './helpers';

// ---------------------------------------------------------------------------
// Coverage derivation: dots and warnings must always reflect the current
// roster + units, never go stale, and never claim under-coverage when the
// data actually meets the minimum. These tests would have caught the bug
// the user reported (all dots red + 440 spurious `is undercovered on ...`
// warnings on a freshly loaded file).
//
// To keep the tests independent of the Web Worker (which is flaky in the
// headless Chromium test env), every scenario seeds the schedule with a
// single pre-assigned entry for the first doctor on the first weekday.
// That gives the Calendar tab `entries` immediately on load, so the
// coverage computation has real data to inspect.
// ---------------------------------------------------------------------------

test.describe('Coverage is correctly derived from current state', () => {
  test('loading a file with 2 doctors in a unit with min 1 yields zero red dots and zero coverage warnings', async ({ page }) => {
    // Two doctors in the same unit, one pre-assigned. With the alternating
    // post-call pattern, exactly one doctor is always available on every
    // weekday → coverage = 1 ≥ 1 → all green.
    const file = createTestFileJson({
      units: [{ id: 'u1', name: 'Planta A', minPostCallCoverage: 1 }],
      doctors: [
        { id: 'd1', name: 'Dr. A', unitId: 'u1' },
        { id: 'd2', name: 'Dr. B', unitId: 'u1' },
      ],
      scheduleRange: { start: '2024-01-01', end: '2024-01-31' },
      preAssignedWork: [{ doctorId: 'd1', date: FIRST_WEEKDAY }],
    });

    await mockFileSystemAccess(page, JSON.parse(file));
    await openAppAndLoadFile(page);

    const coverage = await readCoverageState(page);
    expect(coverage.red, 'expected zero red (undercovered) dots').toBe(0);
    expect(coverage.warnings, 'expected zero "is undercovered on ..." warnings').toBe(0);
    expect(coverage.green, 'expected green dots for the unit on weekdays').toBeGreaterThan(0);
  });

  test('unit with minPostCallCoverage=0 shows a neutral dot, never red', async ({ page }) => {
    // A unit with min=0 is "ignored" — the helper renders a grey dot
    // regardless of available count. This is the typical "consultation"
    // pattern: tracked presence, no minimum required.
    const file = createTestFileJson({
      units: [
        { id: 'u1', name: 'Consulta', minPostCallCoverage: 0 },
        { id: 'u2', name: 'Planta A', minPostCallCoverage: 1 },
      ],
      doctors: [
        { id: 'd1', name: 'Dr. A', unitId: 'u1' },
        { id: 'd2', name: 'Dr. B', unitId: 'u2' },
        { id: 'd3', name: 'Dr. C', unitId: 'u2' },
      ],
      scheduleRange: { start: '2024-01-01', end: '2024-01-31' },
      preAssignedWork: [{ doctorId: 'd1', date: FIRST_WEEKDAY }],
    });

    await mockFileSystemAccess(page, JSON.parse(file));
    await openAppAndLoadFile(page);

    const coverage = await readCoverageState(page);
    expect(coverage.red, 'no unit should ever be undercovered in this scenario').toBe(0);
    expect(coverage.warnings, 'no "is undercovered" warnings expected').toBe(0);
    // The consultation unit (u1) shows grey dots on every weekday.
    expect(coverage.grey).toBeGreaterThan(0);
    // The planta unit (u2) shows green dots on every weekday.
    expect(coverage.green).toBeGreaterThan(0);
  });

  test('1 doctor in a unit with min 2 IS undercovered and produces warnings', async ({ page }) => {
    // Negative test: a tracked unit that genuinely cannot meet its minimum
    // must show red dots and emit warnings. This is the "true positive"
    // case that proves the coverage computation isn't trivially always-green.
    const file = createTestFileJson({
      units: [{ id: 'u1', name: 'Planta A', minPostCallCoverage: 2 }],
      doctors: [{ id: 'd1', name: 'Dr. Solo', unitId: 'u1' }],
      scheduleRange: { start: '2024-01-01', end: '2024-01-31' },
      preAssignedWork: [{ doctorId: 'd1', date: FIRST_WEEKDAY }],
    });

    await mockFileSystemAccess(page, JSON.parse(file));
    await openAppAndLoadFile(page);

    const coverage = await readCoverageState(page);
    expect(coverage.red, '1 doctor in a min-2 unit should be red on every weekday').toBeGreaterThan(0);
    expect(coverage.warnings).toBeGreaterThan(0);
  });

  test('partial coverage shows amber dots (not red) when 0 < available < min', async ({ page }) => {
    // 2 doctors in a unit with min=2, 1 on call and 1 on vacation.
    // Coverage is 1, which is > 0 (not red) but < 2 (not green) → amber.
    const file = createTestFileJson({
      units: [{ id: 'u1', name: 'Planta A', minPostCallCoverage: 2 }],
      doctors: [
        { id: 'd1', name: 'Dr. A', unitId: 'u1' },
        { id: 'd2', name: 'Dr. B', unitId: 'u1', freeDates: ['2024-01-01'] },
      ],
      scheduleRange: { start: '2024-01-01', end: '2024-01-12' },
      preAssignedWork: [{ doctorId: 'd1', date: '2024-01-01' }],
    });
    await mockFileSystemAccess(page, JSON.parse(file));
    await openAppAndLoadFile(page);

    // On Mon Jan 1: d1 is on call (pre-assigned), d2 is on vacation.
    // The unit has only d1 available, so available=1, min=2 → partial.
    const grid = page.locator('.grid-cols-7').last();
    await grid.waitFor({ state: 'visible', timeout: 10_000 });
    const amberCount = await grid.locator('.bg-amber-500').count();
    const redCount = await grid.locator('.bg-rose-500').count();
    expect(amberCount, 'partial coverage should produce amber dots').toBeGreaterThan(0);
    expect(redCount, 'partial coverage must NOT be red').toBe(0);
  });

  test('a file with a holiday in a tracked unit does not require coverage on the holiday', async ({ page }) => {
    // 1 doctor, 1 unit with min=1, holiday on Wed Jan 3. We pre-assign
    // d1 on Mon Jan 1 so the schedule has at least one entry (otherwise
    // the Calendar tab stays disabled). Wed should not contribute a red
    // dot / warning (it's a holiday), but the other weekdays should —
    // there's only 1 doctor and the unit requires 1 every weekday, so
    // the post-call pattern can't sustain coverage on non-holiday days.
    const file = createTestFileJson({
      units: [{ id: 'u1', name: 'Planta A', minPostCallCoverage: 1 }],
      doctors: [{ id: 'd1', name: 'Dr. Solo', unitId: 'u1' }],
      scheduleRange: { start: '2024-01-01', end: '2024-01-12' },
      preAssignedWork: [{ doctorId: 'd1', date: '2024-01-01' }],
      holidays: ['2024-01-03'],
    });
    await mockFileSystemAccess(page, JSON.parse(file));
    await openAppAndLoadFile(page);

    // Expand the warnings banner so the <li> elements are queryable.
    const bannerToggle = page.getByRole('button', { name: /important schedule warnings/i });
    if (await bannerToggle.isVisible().catch(() => false)) {
      const expanded = await bannerToggle.getAttribute('aria-expanded').catch(() => null);
      if (expanded !== 'true') {
        await bannerToggle.click();
        await page.waitForTimeout(100);
      }
    }
    const warningDates = await page.locator('text=/is undercovered on/i').allTextContents();
    const flaggedHolidays = warningDates.filter((t) => /01\/03\/2024|1\/3\/2024|3 de enero/i.test(t));
    expect(flaggedHolidays, 'the holiday itself should not be flagged as undercovered').toEqual([]);
    // Sanity: at least one weekday IS flagged (we only have 1 doctor).
    expect(warningDates.length, 'non-holiday weekdays should still be flagged').toBeGreaterThan(0);
  });

  test('a file without any units produces no dots and no coverage warnings', async ({ page }) => {
    // Old / legacy files have no `units` array. The app must show no dots
    // (there's nothing to track) and no warnings.
    const file = createTestFileJson({
      units: [],
      doctors: [
        { id: 'd1', name: 'Dr. A' },
        { id: 'd2', name: 'Dr. B' },
      ],
      scheduleRange: { start: '2024-01-01', end: '2024-01-31' },
      preAssignedWork: [{ doctorId: 'd1', date: FIRST_WEEKDAY }],
    });

    await mockFileSystemAccess(page, JSON.parse(file));
    await openAppAndLoadFile(page);

    const grid = page.locator('.grid-cols-7').last();
    await expect(grid.getByText('Dr. A').first()).toBeVisible();

    const coverage = await readCoverageState(page);
    expect(coverage.red).toBe(0);
    expect(coverage.green).toBe(0);
    expect(coverage.warnings).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: the `unitId` MUST survive a save → load cycle. This catches
// the class of bugs where the field is dropped during serialization
// (e.g. `unitId: doc.unitId || undefined` losing the empty string) or not
// re-applied on the deserialized form value.
// ---------------------------------------------------------------------------

test.describe('unitId round-trip', () => {
  test('loaded unitId is re-saved verbatim (no empty-string collapse)', async ({ page }) => {
    const file = JSON.parse(createTestFileJson({
      units: [{ id: 'u1', name: 'Planta A', minPostCallCoverage: 1 }],
      doctors: [
        { id: 'd1', name: 'Dr. A', unitId: 'u1' },
        { id: 'd2', name: 'Dr. B', unitId: 'u1' },
      ],
      scheduleRange: { start: '2024-01-01', end: '2024-01-31' },
      preAssignedWork: [{ doctorId: 'd1', date: FIRST_WEEKDAY }],
    }));

    await mockFileSystemAccess(page, file);
    await openAppAndLoadFile(page);

    // The app auto-saves 500ms after the form mounts. Wait for the
    // writable shim to receive a payload that preserves every unitId.
    const saved = await waitForSavedFileMatching(
      page,
      (parsed) =>
        parsed.formValues?.doctors?.every((d) => d.unitId === 'u1') ?? false,
    );

    expect(saved.formValues).toBeDefined();
    for (const d of saved.formValues!.doctors) {
      expect(d.unitId, 'each doctor must still be assigned to the unit after re-save').toBe('u1');
    }
    expect(saved.formValues!.units?.length).toBe(1);
    expect(saved.formValues!.units?.[0].id).toBe('u1');
  });
});

test.describe('allied units and vacation cover', () => {
  test('two allied units with min 1 and 2 doctors produce no red dots', async ({ page }) => {
    const file = createTestFileJson({
      units: [
        { id: 'u1', name: 'Planta A', minPostCallCoverage: 1, alliedUnitIds: ['u2'] },
        { id: 'u2', name: 'Planta B', minPostCallCoverage: 1, alliedUnitIds: ['u1'] },
      ],
      doctors: [
        { id: 'd1', name: 'Dr. A', unitId: 'u1' },
        { id: 'd2', name: 'Dr. B', unitId: 'u2' },
      ],
      scheduleRange: { start: '2024-01-01', end: '2024-01-31' },
      preAssignedWork: [{ doctorId: 'd1', date: FIRST_WEEKDAY }],
    });

    await mockFileSystemAccess(page, JSON.parse(file));
    await openAppAndLoadFile(page);

    const coverage = await readCoverageState(page);
    expect(coverage.red, 'allied units should cover each other on the post-call day').toBe(0);
    expect(coverage.green).toBeGreaterThan(0);
  });

  test('vacation cover leaves the origin unit undercovered', async ({ page }) => {
    const file = createTestFileJson({
      units: [
        { id: 'u1', name: 'Planta A', minPostCallCoverage: 1 },
        { id: 'u2', name: 'Planta B', minPostCallCoverage: 1 },
      ],
      doctors: [
        { id: 'd1', name: 'Dr. A', unitId: 'u1' },
        {
          id: 'd2',
          name: 'Dr. B',
          unitId: 'u2',
          coverAssignments: [
            { id: 'c1', targetUnitId: 'u1', startDate: '2024-01-01', endDate: '2024-01-31' },
          ],
        },
      ],
      scheduleRange: { start: '2024-01-01', end: '2024-01-31' },
      preAssignedWork: [{ doctorId: 'd1', date: FIRST_WEEKDAY }],
    });

    await mockFileSystemAccess(page, JSON.parse(file));
    await openAppAndLoadFile(page);

    const coverage = await readCoverageState(page);
    expect(coverage.red, 'origin unit B has nobody after reassignment').toBeGreaterThan(0);
    expect(coverage.warnings).toBeGreaterThan(0);
  });
});


