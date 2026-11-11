import { randomUUID } from 'node:crypto';
import type { AppState } from '../src/data/types';
import { STATE_VERSION } from '../src/data/seed';
import type { Config } from './config';
import type { Db, Q } from './db';
import { queueMail } from './email';
import { tenantMails } from './mails';
import { merge3 } from './merge';
import { hashPassword, newToken, normEmail, sha256, verifyPassword } from './security';

// The server's building blocks: people, sign-in sessions, email-link tokens, the audit log and each
// landlord's saved data. Routes (server/app.ts) and jobs (server/jobs.ts) call these.

export type Role = 'owner' | 'admin' | 'support';
export interface User { id: string; email: string; name: string; role: Role; password_hash: string | null; google_sub: string | null; email_verified_at: Date | null; created_at: Date; disabled_at: Date | null }
export const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role, emailVerified: !!u.email_verified_at, hasPassword: !!u.password_hash, google: !!u.google_sub });

// ---------------- Audit log ----------------
export interface AuditIn { actor: string; actorId?: string | null; accountId?: string | null; scope: 'auth' | 'app' | 'admin' | 'system'; action: string; detail?: string; ip?: string | null }
export async function audit(q: Q, a: AuditIn) {
  await q.query(`insert into audit_log (actor, actor_id, account_id, scope, action, detail, ip) values ($1, $2, $3, $4, $5, $6, $7)`,
    [a.actor, a.actorId ?? null, a.accountId ?? null, a.scope, a.action, (a.detail ?? '').slice(0, 500), a.ip ?? null]);
}

// ---------------- Users ----------------
export const userByEmail = (q: Q, email: string) => q.one<User>('select * from users where lower(email) = $1', [normEmail(email)]);
export const userById = (q: Q, id: string) => q.one<User>('select * from users where id = $1', [id]);

export async function createUser(q: Q, u: { email: string; name: string; password?: string; role?: Role; googleSub?: string; verified?: boolean }): Promise<User> {
  const id = randomUUID();
  const hash = u.password ? await hashPassword(u.password) : null;
  const rows = await q.query<User>(
    `insert into users (id, email, name, password_hash, role, google_sub, email_verified_at) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [id, u.email.trim(), u.name.trim().slice(0, 120), hash, u.role ?? 'owner', u.googleSub ?? null, u.verified ? new Date() : null]);
  return rows[0];
}

/** Every landlord has one account that holds their data. Admins and support staff have none. */
export async function accountFor(q: Q, userId: string): Promise<string> {
  const a = await q.one<{ id: string }>('select id from accounts where owner_id = $1', [userId]);
  if (a) return a.id;
  const id = randomUUID();
  await q.query('insert into accounts (id, owner_id) values ($1, $2) on conflict (owner_id) do nothing', [id, userId]);
  return (await q.one<{ id: string }>('select id from accounts where owner_id = $1', [userId]))!.id;
}

/**
 * Make sure the admin from ADMIN_EMAIL / ADMIN_PASSWORD exists, is an admin, and has that password.
 * Changing ADMIN_PASSWORD (e.g. in Render) changes the team password at the next start and signs out old
 * sessions. A password changed later in the dashboard stays, until ADMIN_PASSWORD is changed again: the
 * server remembers (as a scrypt hash, in settings) which ADMIN_PASSWORD it last applied.
 */
export async function ensureAdmin(db: Db, cfg: Config): Promise<'created' | 'updated' | 'unchanged' | 'off'> {
  if (!cfg.admin) return 'off';
  const pw = cfg.admin.password;
  const applied = (await db.one<{ value: string }>(`select value #>> '{}' as value from settings where key = 'admin.password-applied'`))?.value;
  const remember = async (q: Q) => q.query(`insert into settings (key, value) values ('admin.password-applied', to_jsonb($1::text))
    on conflict (key) do update set value = excluded.value, updated_at = now()`, [await hashPassword(pw)]);
  const u = await userByEmail(db, cfg.admin.email);
  if (!u) {
    await createUser(db, { email: cfg.admin.email, name: cfg.admin.name, password: pw, role: 'admin', verified: true });
    await remember(db);
    await audit(db, { actor: 'system', scope: 'system', action: 'Admin created', detail: cfg.admin.email });
    return 'created';
  }
  if (u.role !== 'admin') {
    await db.query(`update users set role = 'admin' where id = $1`, [u.id]);
    await audit(db, { actor: 'system', scope: 'system', action: 'Admin role given', detail: cfg.admin.email });
  }
  // The same ADMIN_PASSWORD as last time: leave the password alone (it may have been changed in the dashboard).
  if (applied && (await verifyPassword(pw, applied))) return 'unchanged';
  // A new ADMIN_PASSWORD (or the first start with this rule): it becomes the team password.
  if (await verifyPassword(pw, u.password_hash)) { await remember(db); return 'unchanged'; }
  await db.tx(async (q) => {
    await q.query('update users set password_hash = $2 where id = $1', [u.id, await hashPassword(pw)]);
    await endAllSessions(q, u.id);
    await remember(q);
    await audit(q, { actor: 'system', actorId: u.id, scope: 'system', action: 'Team password set from ADMIN_PASSWORD', detail: cfg.admin!.email });
  });
  return 'updated';
}

// ---------------- Sessions ----------------
export const SESSION_COOKIE = 'kh_session';
export async function createSession(q: Q, userId: string, days: number, meta: { ip?: string; ua?: string }) {
  const token = newToken();
  await q.query(`insert into sessions (token_hash, user_id, expires_at, ip, user_agent) values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
    [sha256(token), userId, String(days), meta.ip ?? null, (meta.ua ?? '').slice(0, 300)]);
  await q.query('update users set last_login_at = now(), last_seen_at = now() where id = $1', [userId]);
  return token;
}

/** The signed-in person for a session cookie, or nothing. Sessions slide: each visit extends them. */
export async function sessionUser(db: Q, token: string | undefined, days: number): Promise<User | undefined> {
  if (!token || token.length > 100) return undefined;
  const row = await db.one<User & { s_last: Date }>(
    `select u.*, s.last_seen_at as s_last from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.disabled_at is null`, [sha256(token)]);
  if (!row) return undefined;
  // Write at most once every 10 minutes per session, not on every request.
  if (Date.now() - new Date(row.s_last).getTime() > 10 * 60_000) {
    await db.query(`update sessions set last_seen_at = now(), expires_at = now() + ($2 || ' days')::interval where token_hash = $1`, [sha256(token), String(days)]);
    await db.query('update users set last_seen_at = now() where id = $1', [row.id]);
  }
  const { s_last: _s, ...u } = row;
  return u as User;
}
export const endSession = (q: Q, token: string) => q.query('delete from sessions where token_hash = $1', [sha256(token)]);
export const endAllSessions = (q: Q, userId: string, except?: string) =>
  q.query('delete from sessions where user_id = $1 and token_hash <> $2', [userId, except ? sha256(except) : '']);

// ---------------- Email-link tokens (confirm email, reset password, team invite) ----------------
export async function createLinkToken(q: Q, userId: string, purpose: 'verify' | 'reset' | 'invite', hours: number) {
  const token = newToken();
  if (purpose !== 'verify') await q.query(`update auth_tokens set used_at = now() where user_id = $1 and purpose = $2 and used_at is null`, [userId, purpose]);
  await q.query(`insert into auth_tokens (token_hash, user_id, purpose, expires_at) values ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
    [sha256(token), userId, purpose, String(hours)]);
  return token;
}
/** Uses a link token once. Returns the user it belongs to, or nothing if it is wrong, used or expired. */
export async function useLinkToken(q: Q, token: string, purposes: string[]): Promise<{ userId: string; purpose: string } | undefined> {
  const r = await q.one<{ user_id: string; purpose: string }>(
    `update auth_tokens set used_at = now() where token_hash = $1 and purpose = any($2) and used_at is null and expires_at > now() returning user_id, purpose`,
    [sha256(token), purposes]);
  return r ? { userId: r.user_id, purpose: r.purpose } : undefined;
}

// ---------------- Each landlord's data ----------------
export interface Saved { revision: number; data: AppState | null; updatedAt?: Date }
export async function readState(q: Q, accountId: string): Promise<Saved> {
  const r = await q.one<{ revision: number; data: AppState; updated_at: Date }>('select revision, data, updated_at from account_state where account_id = $1', [accountId]);
  return r ? { revision: r.revision, data: r.data, updatedAt: r.updated_at } : { revision: 0, data: null };
}

/** Saved versions kept per account (for merging two devices, and for support to undo a mistake). */
const HISTORY_KEEP = 50;

/**
 * Saves a landlord's data. `baseRevision` is the version the device started from. If someone else saved
 * in between, the two are merged (server/merge.ts) and the merged copy is returned for the device to use.
 * Receipts and reminders that became "sent" in this save are queued as emails to the tenants.
 */
export async function writeState(db: Db, accountId: string, baseRevision: number, incoming: AppState, by: string): Promise<{ revision: number; merged: boolean; data: AppState }> {
  return db.tx(async (q) => {
    const cur = await q.one<{ revision: number; data: AppState }>('select revision, data from account_state where account_id = $1 for update', [accountId]);
    let data = incoming, merged = false;
    if (cur && cur.revision !== baseRevision) {
      const base = baseRevision > 0 ? (await q.one<{ data: AppState }>('select data from account_state_history where account_id = $1 and revision = $2', [accountId, baseRevision]))?.data : undefined;
      data = merge3(base, cur.data, incoming) as AppState;
      merged = true;
    }
    const revision = (cur?.revision ?? 0) + 1;
    const summary = summarize(data);
    if (cur) await q.query(`update account_state set revision = $2, schema_version = $3, data = $4::jsonb, summary = $5::jsonb, updated_at = now(), updated_by = $6 where account_id = $1`,
      [accountId, revision, data.version, JSON.stringify(data), JSON.stringify(summary), by]);
    else await q.query(`insert into account_state (account_id, revision, schema_version, data, summary, updated_by) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [accountId, revision, data.version, JSON.stringify(data), JSON.stringify(summary), by]);
    await q.query(`insert into account_state_history (account_id, revision, data, saved_by) values ($1, $2, $3::jsonb, $4)`, [accountId, revision, JSON.stringify(data), by]);
    await q.query(`delete from account_state_history where account_id = $1 and revision <= $2`, [accountId, revision - HISTORY_KEEP]);
    await queueNewlySent(q, accountId, cur?.data ?? null, data);
    return { revision, merged, data };
  });
}

/** Emails for receipts and reminders that turned "sent" since the last save (each one only once). */
export async function queueNewlySent(q: Q, accountId: string, prev: AppState | null, next: AppState) {
  if (next.profile?.sample || !prev) return 0; // never email from sample data, nor replay history on first upload
  const before = new Map(prev.messages.map((m) => [m.id, m.status]));
  let n = 0;
  for (const m of next.messages) {
    if (m.status !== 'sent' || before.get(m.id) === 'sent' || !m.sentAt) continue;
    if (Date.now() - Date.parse(m.sentAt) > 48 * 3600_000) continue; // old news: do not email it now
    const fresh = await q.query(`insert into message_deliveries (account_id, message_id) values ($1, $2) on conflict do nothing returning message_id`, [accountId, m.id]);
    if (!fresh.length) continue;
    const tenant = next.tenants.find((t) => t.id === m.tenantId);
    if (tenant && tenant.noticeMethod !== 'email' && !tenant.emailConsent) continue; // this tenant gets paper, not email
    for (const mail of tenantMails(next, m, accountId)) { await queueMail(q, mail); n++; }
  }
  return n;
}

/** A few numbers about an account, kept next to its data for the support dashboard. */
export function summarize(s: AppState) {
  const today = new Date().toISOString().slice(0, 10);
  const live = (s.leases ?? []).filter((l) => !l.end || l.end >= today);
  const props = (s.properties ?? []).filter((p) => !p.archived);
  return {
    properties: props.length,
    units: (s.units ?? []).filter((u) => props.some((p) => p.id === u.propertyId)).length,
    tenants: live.length,
    monthlyRent: live.reduce((n, l) => n + (l.rent || 0), 0),
    banks: (s.banks ?? []).map((b) => ({ bank: b.bank, status: b.status === 'connected' ? 'ok' : 'failing' })),
    receiptsSent: (s.messages ?? []).filter((m) => m.kind === 'receipt' && m.status === 'sent').length,
    province: s.profile?.province ?? 'ON',
    city: s.profile?.city ?? '',
    onboarded: !!s.profile?.onboarded,
    autoSend: !!s.profile?.autoSend,
    emailUpdates: !!s.profile?.emailUpdates,
  };
}
export type Summary = ReturnType<typeof summarize>;

/** Checks the shape of saved data before it is stored (the app's own format, current version). */
export function stateProblem(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'Data must be an object.';
  const d = s as Record<string, unknown>;
  if (d.version !== STATE_VERSION) return `Data version ${String(d.version)} is not the current version ${STATE_VERSION}. Reload the page.`;
  if (!d.profile || typeof d.profile !== 'object') return 'Missing profile.';
  for (const k of ['properties', 'units', 'tenants', 'leases', 'payments', 'receipts', 'messages', 'expenses']) if (!Array.isArray(d[k])) return `Missing list: ${k}.`;
  if ((d.profile as { sample?: boolean }).sample) return 'Sample data is never saved to an account.';
  return null;
}
