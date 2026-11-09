import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Inline the few photos and pictures so the single-file Claude preview shows them too.
  build: { assetsInlineLimit: 200 * 1024 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
