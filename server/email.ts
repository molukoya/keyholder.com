import { randomUUID } from 'node:crypto';
import type { Config } from './config';
import type { Db, Q } from './db';

// Email goes through an outbox table: whatever creates an email only writes a row (inside its own
// transaction), and the sender delivers queued rows in the background with retries. With
// EMAIL_PROVIDER=log nothing leaves the server; the email is kept and shown in the support dashboard.

export interface Mail { to: string; toName?: string; replyTo?: string; subject: string; text: string; kind: string; accountId?: string | null; dedupeKey?: string; sendAfter?: Date }

/** Addresses that must never get real email: sample data and reserved test domains. */
export const undeliverable = (email: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /@(example\.(com|org|net)|[^@]*\.(test|invalid|example|localhost))$/i.test(email);

export async function queueMail(q: Q, m: Mail): Promise<string | null> {
  const id = randomUUID();
  const skipped = undeliverable(m.to);
  const rows = await q.query<{ id: string }>(
    `insert into outbox (id, account_id, kind, to_email, to_name, reply_to, subject, text_body, status, last_error, dedupe_key, send_after)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (dedupe_key) do nothing returning id`,
    [id, m.accountId ?? null, m.kind, m.to, m.toName ?? null, m.replyTo ?? null, m.subject.slice(0, 300), m.text, skipped ? 'skipped' : 'queued',
      skipped ? 'Test or sample address: not sent' : null, m.dedupeKey ?? null, m.sendAfter ?? new Date()],
  );
  return rows[0]?.id ?? null;
}

type Row = { id: string; to_email: string; to_name: string | null; reply_to: string | null; subject: string; text_body: string; attempts: number };

async function deliver(cfg: Config, m: Row): Promise<{ providerId?: string }> {
  const to = m.to_name ? `${m.to_name.replace(/[<>"]/g, '')} <${m.to_email}>` : m.to_email;
  if (cfg.email.provider === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.email.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.email.from, to: [to], subject: m.subject, text: m.text_body, reply_to: m.reply_to ?? undefined }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { providerId: ((await r.json()) as { id?: string }).id };
  }
  if (cfg.email.provider === 'postmark') {
    const r = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST', headers: { 'X-Postmark-Server-Token': cfg.email.postmarkToken!, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ From: cfg.email.from, To: to, Subject: m.subject, TextBody: m.text_body, ReplyTo: m.reply_to ?? undefined, MessageStream: 'outbound' }),
    });
    if (!r.ok) throw new Error(`Postmark ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { providerId: ((await r.json()) as { MessageID?: string }).MessageID };
  }
  return {};
}

/** Sends what is due. Safe to run from several processes at once (rows are claimed with SKIP LOCKED). */
export async function sendDue(cfg: Config, db: Db, limit = 20): Promise<{ sent: number; failed: number }> {
  const rows = await db.query<Row>(
    `update outbox set status = 'sending', attempts = attempts + 1
     where id in (select id from outbox where status = 'queued' and send_after <= now() order by created_at limit $1 for update skip locked)
     returning id, to_email, to_name, reply_to, subject, text_body, attempts`, [limit]);
  let sent = 0, failed = 0;
  for (const m of rows) {
    try {
      const r = await deliver(cfg, m);
      await db.query(`update outbox set status = $2, provider = $3, provider_id = $4, sent_at = now(), last_error = null where id = $1`,
        [m.id, cfg.email.provider === 'log' ? 'logged' : 'sent', cfg.email.provider, r.providerId ?? null]);
      sent++;
    } catch (e) {
      failed++;
      const msg = (e as Error).message;
      // Try again after 1, 4, 16, 64 minutes; then give up and show it in the support dashboard.
      const giveUp = m.attempts >= 5;
      await db.query(`update outbox set status = $2, last_error = $3, send_after = now() + ($4 || ' minutes')::interval where id = $1`,
        [m.id, giveUp ? 'failed' : 'queued', msg, String(4 ** (m.attempts - 1))]);
      if (giveUp) await recordError(db, 'Email delivery', msg);
    }
  }
  // Rows stuck in "sending" (the process stopped mid-send) go back in the queue after 10 minutes.
  await db.query(`update outbox set status = 'queued' where status = 'sending' and coalesce(sent_at, created_at) < now() - interval '10 minutes' and attempts < 6`);
  return { sent, failed };
}

/** Problems shown under Platform → System health. Repeats of the same problem add to its count. */
export async function recordError(db: Q, area: string, message: string) {
  const msg = message.slice(0, 500);
  const hit = await db.query(`update system_errors set count = count + 1, last_at = now() where area = $1 and message = $2 and resolved_at is null returning id`, [area, msg]);
  if (!hit.length) await db.query(`insert into system_errors (id, area, message) values ($1, $2, $3) on conflict do nothing`, [randomUUID(), area, msg]);
}
