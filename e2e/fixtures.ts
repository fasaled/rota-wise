import { test as base, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

export { expect } from '@playwright/test';

const cdpUrl = process.env.E2E_CDP_URL;
const origin = process.env.E2E_ORIGIN;

async function clearOriginStorage(context: BrowserContext, page: Page, siteOrigin: string) {
  const session = await context.newCDPSession(page);
  try {
    await session.send('Storage.clearDataForOrigin', {
      origin: siteOrigin,
      storageTypes: 'all',
    });
  } finally {
    await session.detach().catch(() => {});
  }
}

type WorkerFixtures = { cdpBrowser: Browser };

/**
 * Same tests as the web suite. When `E2E_CDP_URL` is set (Deno Desktop CEF),
 * Playwright attaches to the existing webview instead of launching Chrome.
 */
export const test = cdpUrl
  ? base.extend<object, WorkerFixtures>({
      cdpBrowser: [
        async ({}, use) => {
          const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 30_000 });
          await use(browser);
        },
        { scope: 'worker' },
      ],
      page: async ({ cdpBrowser }, use) => {
        if (!origin) throw new Error('E2E_ORIGIN is not set');
        const context = cdpBrowser.contexts()[0];
        if (!context) throw new Error('Deno Desktop CEF has no browser context');
        const page =
          context.pages().find((p) => p.url().startsWith('http')) ?? context.pages()[0];
        if (!page) throw new Error('Deno Desktop CEF has no page');
        await clearOriginStorage(context, page, origin);

        // A CDP page is not wrapped by Playwright's baseURL helper, so '/'
        // would be sent to CEF as an invalid URL.
        const originalGoto = page.goto.bind(page);
        page.goto = ((url, options) => {
          const href =
            typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
              ? `${origin}${url}`
              : url;
          return originalGoto(href, options);
        }) as typeof page.goto;

        await use(page);
      },
    })
  : base;
