import { MIGRATIONS } from './migrations';

// One small interface over two drivers: real Postgres in production (DATABASE_URL, `pg`), and an embedded
// Postgres (PGlite) for laptops and tests. Both speak the same SQL, so the code above never knows which.

export interface Q {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
}
export interface Db extends Q {
  kind: 'postgres' | 'pglite';
  /** Runs `fn` in one transaction: all of it is saved, or none of it. */
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type Raw = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const wrap = (raw: Raw): Q => ({
  async query<T>(sql: string, params: unknown[] = []) { return (await raw(sql, params)).rows as T[]; },
  async one<T>(sql: string, params: unknown[] = []) { return (await raw(sql, params)).rows[0] as T | undefined; },
});

export async function openDb(opts: { url?: string; pgliteDir?: string }): Promise<Db> {
  if (opts.url) {
    const { default: pg } = await import('pg');
    // Render's Postgres needs TLS from outside its network; inside it the internal URL has no TLS.
    const ssl = /sslmode=(require|verify)/.test(opts.url) ? { rejectUnauthorized: false } : undefined;
    const pool = new pg.Pool({ connectionString: opts.url, max: 10, ssl, idleTimeoutMillis: 30_000 });
    pool.on('error', (e) => console.error('[db] idle client error', e.message));
    const base = wrap((sql, params) => pool.query(sql, params as unknown[]));
    return {
      kind: 'postgres', ...base,
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('begin');
          const r = await fn(wrap((sql, params) => c.query(sql, params as unknown[])));
          await c.query('commit');
          return r;
        } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = opts.pgliteDir ?? 'memory://';
  if (dir !== 'memory://') { const { mkdirSync } = await import('node:fs'); mkdirSync(dir, { recursive: true }); }
  const lite = new PGlite(dir === 'memory://' ? undefined : dir);
  await lite.waitReady;
  const base = wrap((sql, params) => lite.query(sql, params as unknown[]));
  return {
    kind: 'pglite', ...base,
    tx: (fn) => lite.transaction((t) => fn(wrap((sql, params) => t.query(sql, params as unknown[])))),
    close: () => lite.close(),
  };
}

/** Applies any migrations not yet applied, in order, each in its own transaction. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(`create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query<{ id: string }>('select id from schema_migrations')).map((r) => r.id));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.tx(async (q) => {
      for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.query(stmt);
      await q.query('insert into schema_migrations (id) values ($1)', [m.id]);
    });
    applied.push(m.id);
  }
  return applied;
}
