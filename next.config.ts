
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

let finalConfig: NextConfig = baseNextConfig;

if (!isDev) {
  // Only load and apply PWA settings for non-development (production) environments
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const withPWAInit = require('@ducanh2912/next-pwa').default;
  const withPWA = withPWAInit({
    dest: 'public',
    register: true,
    skipWaiting: true,
    // PWA is enabled by default in production, no need for disable: false
    workboxOptions: {
      maximumFileSizeToCacheInBytes: 10_000_000, // Production build value
      exclude: [], // Production-specific exclusions, if any
    },
    fallbacks: {
      // document: '/offline', // Example: Custom offline page
    },
    cacheStartUrl: true,
    dynamicStartUrl: true,
    reloadOnOnline: true,
  });
  finalConfig = withPWA(baseNextConfig);
}

export default finalConfig;
