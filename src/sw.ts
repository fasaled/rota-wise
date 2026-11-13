/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// New versions take over immediately; open tabs that still run the old bundle
// recover through the `vite:preloadError` reload in `main.tsx`.
self.skipWaiting();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Single-page app: every navigation is answered with the precached shell,
// which is what makes the app work offline.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/sitemap\.xml$/, /^\/robots\.txt$/],
  }),
);
