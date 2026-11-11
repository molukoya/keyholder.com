import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // `npm run dev` (website on :5173) talks to `npm run dev:server` (API on :8080).
  server: { proxy: { '/api': 'http://localhost:8080' } },
  // `vite preview` stays a plain static server (the browser-only mode the UX tests use).
  preview: { proxy: {} },
  // Photos and screenshots stay separate files on the website (they load only when needed);
  // scripts/build-artifact.mjs embeds them when it packs the single-file Claude preview.
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 60_000 },
} as never);
