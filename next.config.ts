import type {NextConfig} from 'next';

const isDev = process.env.NODE_ENV === 'development';

const baseNextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: isDev, // Let the PWA plugin itself handle disabling in dev mode
  workboxOptions: {
    maximumFileSizeToCacheInBytes: 10_000_000,
    exclude: [], 
  },
  fallbacks: {
    document: '/_offline.html', // Example: Custom offline page in public/_offline.html
  },
  cacheStartUrl: true,
  dynamicStartUrl: true,
  reloadOnOnline: true,
});

export default withPWA(baseNextConfig);
