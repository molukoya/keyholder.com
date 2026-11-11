import { loadConfig } from './config';
import { migrate, openDb } from './db';
import { buildApp } from './app';
import { startWorker } from './jobs';
import { ensureAdmin } from './services';

// Starts Keyholder: database (and its migrations), the first admin, the web server (API + website)
// and, unless WORKER=off, the background sender and daily jobs. Stops cleanly on SIGTERM (Render deploys).

async function main() {
  const cfg = loadConfig();
  const db = await openDb({ url: cfg.databaseUrl, pgliteDir: cfg.pgliteDir });
  const applied = await migrate(db);
  const admin = await ensureAdmin(db, cfg);
  const app = await buildApp({ cfg, db });
  if (admin === 'updated') app.log.info('team password changed from ADMIN_PASSWORD; old sign-ins ended');
  if (applied.length) app.log.info(`migrations applied: ${applied.join(', ')}`);
  if (!cfg.databaseUrl) app.log.warn(`no DATABASE_URL: using the embedded Postgres in ${cfg.pgliteDir}`);
  if (cfg.email.provider === 'log') app.log.warn('EMAIL_PROVIDER=log: emails are kept in the outbox, not sent');
  const stopWorker = cfg.worker === 'inline' ? startWorker(cfg, db, (m) => app.log.info(m)) : () => {};
  await app.listen({ port: cfg.port, host: cfg.host });
  let closing = false;
  const stop = async (sig: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`${sig}: shutting down`);
    stopWorker();
    await app.close().catch(() => {});
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

main().catch((e) => { console.error(e); process.exit(1); });
