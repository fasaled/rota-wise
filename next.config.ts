
import type {NextConfig} from 'next';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const withPWAInit = require('@ducanh2912/next-pwa').default;

const isDev = process.env.NODE_ENV === 'development';

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: isDev,
  // Solution for "WorkboxError: bad-precaching-response"
  // See: https://github.com/DuCanhGH/next-pwa/issues/549
  workboxOptions: {
    maximumFileSizeToCacheInBytes: isDev ? 15_000_000 : 10_000_000,
    // Exclude files that often change in development and cause issues with caching.
    // You might need to adjust this based on your project's specific needs.
    exclude: isDev ? [
        // Exclude dev-specific hot-reload files
        /\/_next\/static\/webpack\/pages\//, 
        /\/_next\/static\/webpack\/app\//,
        /\/_next\/static\/css\//, // Often changes with HMR for styles
        // Add other patterns if needed
      ] : [],
  },
  fallbacks: {
    // You can add custom fallbacks here if needed.
    // document: '/offline', // Example: Custom offline page
  },
  cacheStartUrl: true,
  dynamicStartUrl: true,
  reloadOnOnline: true,
});


const nextConfig: NextConfig = {
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

export default withPWA(nextConfig);
