import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for rota-wise E2E tests.
 *
 * The webServer block starts `bun run dev` before the tests run and tears
 * it down when they finish. The tests are designed to run against the dev
 * server (port 5173) with the file-system-access API mocked via
 * `e2e/helpers.ts`.
 */
export default defineConfig({
  // Match the Playwright-specific pattern (.playwright.ts) so bun test
  // (which only looks for *.test.ts / *.spec.ts) doesn't try to load these
  // files and trip over the @playwright/test import.
  testDir: './e2e',
  testMatch: /.*\.playwright\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
