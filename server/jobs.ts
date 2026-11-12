import type { AppState } from '../src/data/types';
import { todayISO } from '../src/lib/dates';
import { fmt } from '../src/lib/money';
import { reminderDraft } from '../src/lib/templates';
import { trayItems } from '../src/lib/tray';
import type { Config } from './config';
import type { Db } from './db';
import { queueMail, recordError, sendDue } from './email';
import { Keys } from './keys';
import { digestMail } from './mails';
import { readState, writeState } from './services';
import { saveGic } from './support';

// Background work. With WORKER=inline (the default) the web process runs it; on a bigger setup a
// separate `npm run worker` process can. Everything here is safe to run twice: jobs claim their day
// in the job_runs table, emails are de-duplicated, and the email queue uses row locks.

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

/** Claims a job for a key (e.g. today's date). Returns false if another process already ran it. */
async function claim(db: Db, job: string, key: string): Promise<boolean> {
  const rows = await db.query(
    `insert into job_runs (job, last_run_at, detail) values ($1, now(), $2)
     on conflict (job) do update set last_run_at = now(), detail = excluded.detail where job_runs.detail <> excluded.detail returning job`, [job, key]);
  return rows.length > 0;
}

/**
 * The daily run, at DAILY_HOUR: for landlords who turned on automatic sending, late-rent reminders go out
 * by themselves (the same reminders the app suggests, with the same wording); for landlords who asked for
 * email updates, one short email lists what needs them today.
 */
export async function dailyRun(cfg: Config, db: Db, today = todayISO()) {
  const rows = await db.query<{ account_id: string; email: string; name: string }>(
    `select s.account_id, u.email, u.name from account_state s join accounts a on a.id = s.account_id join users u on u.id = a.owner_id
     where u.disabled_at is null and (s.summary->>'autoSend' = 'true' or s.summary->>'emailUpdates' = 'true')`);
  let reminders = 0, digests = 0;
  for (const r of rows) {
    try {
      const cur = await readState(db, r.account_id);
      if (!cur.data || cur.data.profile.sample) continue;
      let state: AppState = cur.data;
      if (state.profile.autoSend) {
        const due = trayItems(state, today).filter((i) => i.kind === 'reminder');
        if (due.length) {
          const next = structuredClone(state);
          const now = new Date().toISOString();
          for (const item of due) {
            if (item.kind !== 'reminder') continue;
            const draft = reminderDraft(next, item.lease, item.line.period, item.tone, today);
            next.messages.push({ id: uid('msg'), kind: 'reminder', tenantId: item.lease.tenantId, leaseId: item.lease.id, period: item.line.period, tone: item.tone, subject: draft.subject, body: draft.body, status: 'sent', edited: false, createdAt: now, sentAt: now });
            const t = next.tenants.find((x) => x.id === item.lease.tenantId);
            next.audit.unshift({ id: uid('a'), at: now, action: 'Reminder sent automatically', detail: `${item.tone} to ${t?.names.join(' & ') ?? 'tenant'} for ${item.line.period}` });
            reminders++;
          }
          state = (await writeState(db, r.account_id, cur.revision, next, 'automation')).data;
        }
      }
      if (state.profile.emailUpdates) {
        const lines = trayItems(state, today).map((i) => {
          const name = (leaseId: string) => { const l = state.leases.find((x) => x.id === leaseId); return state.tenants.find((t) => t.id === l?.tenantId)?.names.join(' & ') ?? 'a tenant'; };
          if (i.kind === 'message') return i.message.kind === 'receipt' ? `A receipt for ${name(i.message.leaseId)} is ready to send` : `A message to ${name(i.message.leaseId)} is waiting for your OK`;
          if (i.kind === 'reminder') return `Rent from ${name(i.lease.id)} is ${i.line.daysLate} day${i.line.daysLate === 1 ? '' : 's'} late: a reminder is ready`;
          return `A deposit of ${fmt(i.txn.amount)} needs a tenant`;
        });
        if (lines.length) { await queueMail(db, { ...digestMail(r.email, r.name, lines.slice(0, 10), `${cfg.appUrl}/#/today`), accountId: r.account_id, dedupeKey: `digest:${r.account_id}:${today}` }); digests++; }
      }
    } catch (e) {
      await recordError(db, 'Daily run', (e as Error).message);
    }
  }
  return { accounts: rows.length, reminders, digests };
}

export async function cleanup(db: Db) {
  await db.query(`delete from sessions where expires_at < now()`);
  await db.query(`delete from auth_tokens where expires_at < now() - interval '7 days'`);
}

// The Bank of Canada's weekly figure for the big banks' posted 5-year GIC rate (Valet API, free, no key).
export const GIC_SERIES = 'V80691341';
/** Reads the latest 5-year GIC rate and saves it for the app. Returns it, or throws with the reason. */
export async function refreshGic(cfg: Config, db: Db, fetcher: typeof fetch = fetch) {
  const r = await fetcher(`${cfg.bocBaseUrl ?? 'https://www.bankofcanada.ca'}/valet/observations/${GIC_SERIES}/json?recent=1`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Bank of Canada answered ${r.status}`);
  const b = (await r.json()) as { observations?: { d: string; [k: string]: unknown }[] };
  const o = b.observations?.[0];
  const pct = Number((o?.[GIC_SERIES] as { v?: string } | undefined)?.v);
  if (!o || !/^\d{4}-\d{2}-\d{2}$/.test(o.d) || !Number.isFinite(pct) || pct < 0 || pct > 25) throw new Error('Bank of Canada sent no usable 5-year GIC rate');
  await saveGic(db, pct, o.d);
  return { pct, asOf: o.d };
}

/** Starts the background loop: the email queue every 10 s, the daily run and clean-up once an hour. */
export function startWorker(cfg: Config, db: Db, log: (msg: string) => void, keys = new Keys(cfg)) {
  let stopped = false, busy = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const r = await sendDue(cfg, db, 20, keys);
      if (r.sent || r.failed) log(`email: ${r.sent} delivered, ${r.failed} failed`);
    } catch (e) { log(`email queue error: ${(e as Error).message}`); } finally { busy = false; }
  };
  const hourly = async () => {
    if (stopped) return;
    try {
      await cleanup(db);
      const today = todayISO();
      if (new Date().getHours() >= cfg.dailyHour && (await claim(db, 'daily', today))) log(`daily run: ${JSON.stringify(await dailyRun(cfg, db, today))}`);
    } catch (e) { log(`hourly job error: ${(e as Error).message}`); }
    await gic();
  };
  // Once a day (and soon after starting); a failed read is tried again the next hour.
  const gic = async () => {
    if (stopped) return;
    try {
      if (!(await claim(db, 'gic', todayISO()))) return;
      const g = await refreshGic(cfg, db);
      log(`5-year GIC rate: ${g.pct}% (week of ${g.asOf})`);
    } catch (e) {
      await db.query(`update job_runs set detail = 'retry' where job = 'gic'`).catch(() => {});
      await recordError(db, 'Comparison rates', `The 5-year GIC rate could not be read: ${(e as Error).message}`).catch(() => {});
      log(`GIC rate error: ${(e as Error).message}`);
    }
  };
  const a = setInterval(tick, 10_000);
  const b = setInterval(hourly, 60 * 60_000);
  setTimeout(tick, 1000);
  setTimeout(hourly, 5000);
  return () => { stopped = true; clearInterval(a); clearInterval(b); };
}
