import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      // Desktop packages the SPA inside a local webview; a service worker there
      // would cache loopback assets and fight the bundled files.
      disable: mode === 'desktop',
      registerType: 'autoUpdate',
      manifest: false,
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 10_000_000,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(rootDir, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
            return 'react';
          }
          if (id.includes('/node_modules/react/')) {
            return 'react';
          }
        },
      },
    },
  },
}));
