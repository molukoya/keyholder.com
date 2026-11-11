import { loadConfig } from './config';
import { migrate, openDb } from './db';
import { startWorker } from './jobs';

// The background sender and daily jobs on their own (for a separate Render worker). Not needed while
// the web service runs them itself (WORKER=inline, the default).

async function main() {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) throw new Error('A separate worker needs DATABASE_URL (a shared Postgres).');
  const db = await openDb({ url: cfg.databaseUrl });
  await migrate(db);
  const stop = startWorker(cfg, db, (m) => console.log(new Date().toISOString(), m));
  const end = async () => { stop(); await db.close(); process.exit(0); };
  process.on('SIGTERM', () => void end());
  process.on('SIGINT', () => void end());
  console.log('worker started');
}

main().catch((e) => { console.error(e); process.exit(1); });
