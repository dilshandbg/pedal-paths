import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { ridesApiPlugin, segmentsApiPlugin } from './server/vitePlugin';

export default defineConfig({
  // The segment and ride APIs (ADR-0009, ADR-0013) run on the dev and preview servers; Vitest
  // tests them directly.
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST ? [] : [segmentsApiPlugin(), ridesApiPlugin()]),
  ],
  worker: {
    format: 'es',
  },
  // The import worker's dependencies are pre-bundled so the dev server doesn't discover them on the
  // first upload and force a full page reload.
  optimizeDeps: {
    include: ['fflate', '@garmin/fitsdk'],
  },
  build: {
    rollupOptions: {
      output: {
        // Map libraries change rarely: separate chunks cache well across app releases.
        manualChunks: {
          maplibre: ['maplibre-gl'],
          deckgl: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/mapbox'],
        },
      },
    },
    // MapLibre alone is ~1 MB minified. It is lazy-loaded with the map, never part of the first paint.
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'tests/server/**/*.test.ts',
    ],
    restoreMocks: true,
  },
});
