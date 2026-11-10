import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from './config';
import { migrate, openDb, type Db } from './db';
import { buildApp } from './app';

// The server serves the built website: index.html (marked, so the app knows a server is there) for every
// page address, real files from dist/, and JSON 404s under /api.

let app: FastifyInstance, db: Db;
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kh-dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>Keyholder</title></head><body><div id="root"></div></body></html>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  db = await openDb({ pgliteDir: 'memory://' });
  await migrate(db);
  app = await buildApp({ cfg: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', WORKER: 'off' }), db, staticDir: dir });
}, 60_000);
afterAll(async () => { await app?.close(); await db?.close(); });

describe('website files', () => {
  it('marks index.html for the app, on every page address', async () => {
    for (const url of ['/', '/index.html', '/anything/deep']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(200);
      expect(r.body).toContain('<meta name="keyholder-server" content="1" />');
      expect(r.headers['cache-control']).toBe('no-cache');
      expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    }
  });
  it('serves built files with long caching, and JSON 404s for unknown API addresses', async () => {
    const js = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(js.statusCode).toBe(200);
    expect(js.headers['cache-control']).toContain('immutable');
    const api = await app.inject({ method: 'GET', url: '/api/nothing-here' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'Not found.' });
  });
});
