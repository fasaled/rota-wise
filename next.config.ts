import type {NextConfig} from 'next';

const baseNextConfig: NextConfig = {
  // Turbopack used in dev (fast HMR); webpack used in `next build --webpack` (required by next-pwa)
  turbopack: {},
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Always enable PWA — app is fully client-side and must be installable/offline-capable
  workboxOptions: {
    maximumFileSizeToCacheInBytes: 10_000_000,
  },
  fallbacks: {
    document: '/_offline.html',
  },
  cacheStartUrl: true,
  reloadOnOnline: true,
});

export default withPWA(baseNextConfig);
