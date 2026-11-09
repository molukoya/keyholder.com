import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Photos and screenshots stay separate files on the website (they load only when needed);
  // scripts/build-artifact.mjs embeds them when it packs the single-file Claude preview.
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
