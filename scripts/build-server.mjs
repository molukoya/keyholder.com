// Bundles the server (server/index.ts and server/worker.ts, plus the shared code they use from src/)
// into server-dist/, for `npm start` in production. Packages in node_modules stay outside the bundle.
import { build } from 'esbuild';

await build({
  entryPoints: { index: 'server/index.ts', worker: 'server/worker.ts' },
  outdir: 'server-dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
