import { defineConfig } from '@playwright/test';

/**
 * Playwright against the Deno Desktop CEF webview (Chrome DevTools Protocol).
 *
 * Started by `bun run e2e:desktop` (`e2e/run-desktop.ts`), which builds the
 * SPA, launches `deno desktop --backend cef`, and sets E2E_CDP_URL / E2E_ORIGIN.
 *
 * Must run under Node (not Bun): Bun's WebSocket client never finishes the
 * CEF CDP handshake.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.playwright\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_ORIGIN,
    // Real CEF window; do not emulate a Playwright viewport.
    viewport: null,
    acceptDownloads: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
