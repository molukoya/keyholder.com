import { randomUUID } from 'node:crypto';
import type { AppState } from '../src/data/types';
import { DEFAULT_UNIT_CENTS, generateSupport, SLA_HOURS, type Announcement, type Customer, type DataRequest, type Member, type Platform, type Priority, type Promotion, type Reply, type RuleStatus, type SupportBase, type TeamRole, type Ticket, type TicketMsg } from '../src/support/data';
import { addDays, todayISO } from '../src/lib/dates';
import type { Config } from './config';
import type { Db, Q } from './db';
import { queueMail } from './email';
import { inviteMail, resetMail, ticketReplyMail } from './mails';
import { audit, createLinkToken, createUser, isAdmin, userByEmail, type Role, type Summary, type User } from './services';

// The support dashboard on real data. The screens were built on sample data with one shape
// (src/support/data.ts → SupportBase); the server fills the same shape from the database, so the
// screens work unchanged. Saving goes the other way: the server compares what the screen sends with
// what it has and applies only the changes an admin is allowed to make, field by field.

export type SupportSnapshot = SupportBase & { sla: Record<Priority, number>; live: true; me: string };

let cachedDefaults: { replies: Reply[]; rules: RuleStatus[] } | undefined;
const defaults = () => (cachedDefaults ??= (() => { const g = generateSupport(); return { replies: g.replies, rules: g.rules }; })());
async function setting<T>(q: Q, key: string, def: () => T): Promise<T> {
  const r = await q.one<{ value: T }>('select value from settings where key = $1', [key]);
  return r ? r.value : def();
}
const putSetting = (q: Q, key: string, value: unknown) =>
  q.query(`insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);

// ---------------- The super user's settings ----------------
/** The Landlord plan price per unit a month, in cents. A new price applies to new subscribers only. */
export const unitPrice = async (q: Q) => (await setting<{ unitCents: number }>(q, 'plans.landlord', () => ({ unitCents: DEFAULT_UNIT_CENTS }))).unitCents;
/** Bank connection: on for everyone or off, and banks turned off one by one. */
export const bankSettings = (q: Q) => setting<Platform['banks']>(q, 'banks', () => ({ enabled: true, off: [] }));
const TEAM_LABEL: Record<string, TeamRole> = { super: 'Super user', admin: 'Admin', support: 'Support' };
const ROLE_OF: Record<string, Role> = { 'Super user': 'super', Admin: 'admin', Support: 'support', Owner: 'admin' };
type PromoRow = { id: string; code: string; kind: Promotion['kind']; value: number; months: number; ends_on: string | null; max_uses: number | null; uses: number; status: Promotion['status']; created_at: Date };
const promoOut = (p: PromoRow): Promotion => ({ id: p.id, code: p.code, kind: p.kind, value: p.value, months: p.months, endsOn: p.ends_on ?? undefined, maxUses: p.max_uses ?? undefined, uses: p.uses, status: p.status, created: iso(p.created_at) });
/** A promo code: letters, numbers and dashes, 3 to 24 characters. */
const CODE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;
function promoProblem(p: Promotion): string | null {
  if (!CODE.test(String(p.code ?? '').toUpperCase())) return 'code';
  if (p.kind === 'percent' && !(Number.isInteger(p.value) && p.value >= 1 && p.value <= 100)) return 'percent';
  if (p.kind === 'amount' && !(Number.isInteger(p.value) && p.value >= 1 && p.value <= 1_000_000)) return 'amount';
  if (p.kind !== 'percent' && p.kind !== 'amount') return 'kind';
  if (!(Number.isInteger(p.months) && p.months >= 1 && p.months <= 36)) return 'months';
  if (p.endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(p.endsOn)) return 'end date';
  if (p.maxUses !== undefined && p.maxUses !== null && !(Number.isInteger(p.maxUses) && p.maxUses > 0)) return 'uses';
  return null;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : new Date(0).toISOString());
const day = (d: Date | string | null | undefined) => iso(d).slice(0, 10);
/** The admin looking at the dashboard sees themselves as "You", as on the sample. */
const youName = (name: string, me: User) => (name === me.name ? 'You' : name);
const realName = (name: string, me: User) => (name === 'You' ? me.name : name);

export async function snapshot(db: Q, me: User): Promise<SupportSnapshot> {
  const today = todayISO();
  const accts = await db.query<{ id: string; email: string; name: string; plan: 'starter' | 'landlord'; trial_ends: string | null; credit_cents: number; unit_price_cents: number | null; notes: string[]; created_at: Date; last_seen_at: Date | null; summary: Summary | null; bounces: number }>(
    `select a.id, u.email, u.name, a.plan, a.trial_ends::text as trial_ends, a.credit_cents, a.unit_price_cents, a.notes, a.created_at, u.last_seen_at, s.summary,
       (select count(*)::int from outbox o where o.account_id = a.id and o.status = 'failed') as bounces
     from accounts a join users u on u.id = a.owner_id left join account_state s on s.account_id = a.id
     order by a.created_at desc limit 5000`);
  const customers: Customer[] = accts.map((a) => {
    const s = a.summary ?? ({} as Partial<Summary>);
    return {
      id: a.id, name: a.name || a.email.split('@')[0], email: a.email, phone: '', province: (s.province ?? 'ON') as Customer['province'], city: s.city ?? '',
      plan: a.plan, units: s.units ?? 0, properties: s.properties ?? 0, tenants: s.tenants ?? 0,
      signedUp: day(a.created_at), lastActive: day(a.last_seen_at ?? a.created_at),
      banks: (s.banks ?? []).map((b) => ({ bank: b.bank, status: b.status as 'ok' | 'failing' })), emailBounces: a.bounces,
      paymentStatus: 'none', trialEnds: a.trial_ends ?? undefined, credit: a.credit_cents, unitPrice: a.unit_price_cents ?? undefined, source: 'Not asked yet',
      receiptsSent: s.receiptsSent ?? 0, notes: Array.isArray(a.notes) ? a.notes : [],
    };
  });
  const tks = await db.query<{ id: string; account_id: string | null; subject: string; category: string; priority: Priority; status: Ticket['status']; assignee: string; messages: TicketMsg[]; created_at: Date }>(
    `select id, account_id, subject, category, priority, status, assignee, messages, created_at from support_tickets order by created_at desc limit 1000`);
  const tickets: Ticket[] = tks.map((t) => ({
    id: t.id, customerId: t.account_id ?? '', subject: t.subject, category: t.category, priority: t.priority, status: t.status,
    created: iso(t.created_at), assignee: youName(t.assignee, me), messages: t.messages.map((m) => ({ ...m, who: m.from === 'customer' ? m.who : youName(m.who, me) })),
  }));
  const team: Member[] = (await db.query<{ id: string; name: string; email: string; role: string }>(`select id, name, email, role from users where role in ('super', 'admin', 'support') order by role = 'super' desc, created_at`))
    .map((u) => ({ id: u.id, name: u.id === me.id ? 'You' : u.name, email: u.email, role: TEAM_LABEL[u.role] ?? 'Support' }));
  const requests: DataRequest[] = (await db.query<{ id: string; account_id: string | null; kind: 'copy' | 'delete'; received: string; status: 'to do' | 'done' }>(
    `select id, account_id, kind, received::text as received, status from data_requests order by received desc limit 500`))
    .map((r) => ({ id: r.id, customerId: r.account_id ?? '', kind: r.kind, received: r.received, status: r.status }));
  const auditRows = await db.query<{ id: string; at: Date; actor: string; action: string; detail: string }>(
    `select id::text as id, at, actor, action, detail from audit_log where scope in ('admin', 'auth', 'system') order by at desc limit 300`);
  const announcements: Announcement[] = (await db.query<{ id: string; text: string; where_shown: Announcement['where']; tone: Announcement['tone']; active: boolean; created_at: Date }>(
    `select * from announcements order by created_at desc`)).map((a) => ({ id: a.id, text: a.text, where: a.where_shown, tone: a.tone, active: a.active, created: iso(a.created_at) }));
  const errors = (await db.query<{ id: string; last_at: Date; area: string; message: string; count: number }>(
    `select id, last_at, area, message, count from system_errors where resolved_at is null order by last_at desc limit 50`))
    .map((e) => ({ id: e.id, at: iso(e.last_at), area: e.area, message: e.message, count: e.count }));
  const d = defaults();
  // Price, promotions and banks: everyone on the team sees them; only the super user changes them.
  const promotions = (await db.query<PromoRow>(`select id, code, kind, value, months, ends_on::text as ends_on, max_uses, uses, status, created_at from promotions order by created_at desc`)).map(promoOut);
  const platform: Platform = { unitCents: await unitPrice(db), promotions, banks: await bankSettings(db) };
  return {
    live: true, me: me.name, myRole: me.role === 'super' ? 'super' : me.role === 'admin' ? 'admin' : 'support', platform, today, customers, tickets, invoices: [], requests, team,
    replies: await setting<Reply[]>(db, 'support.replies', () => d.replies),
    audit: auditRows.map((a) => ({ id: `a${a.id}`, at: iso(a.at), who: a.actor === me.email ? 'You' : a.actor, action: a.action, detail: a.detail })),
    announcements, rules: await setting<RuleStatus[]>(db, 'support.rules', () => d.rules), errors,
    sla: await setting<Record<Priority, number>>(db, 'support.sla', () => ({ ...SLA_HOURS })),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Applies an admin's change. `next` is the dashboard's data after the change; only the differences
 * from the current data are applied, and only to fields an admin may change. Returns a short list of
 * what was done (for tests and the log).
 */
export async function applyChange(db: Db, cfg: Config, me: User, next: SupportBase & { sla?: Record<Priority, number> }, log: { action: string; detail: string } | undefined, ip: string | null): Promise<string[]> {
  const done: string[] = [];
  const cur = await snapshot(db, me);
  // Support staff answer requests and help landlords; deleting accounts and settings are for admins;
  // the team, the price, promotions and banks are for the super user only.
  if (!isAdmin(me.role)) {
    next = { ...next, sla: cur.sla, rules: cur.rules, requests: cur.requests,
      customers: (next.customers ?? []).map((c) => ({ ...c, deleted: cur.customers.find((x) => x.id === c.id)?.deleted })) };
  }
  if (me.role !== 'super') next = { ...next, team: cur.team, platform: cur.platform };
  await db.tx(async (q) => {
    // Customers: plan, trial, credit, notes; deleted = delete the account for real.
    for (const c of next.customers ?? []) {
      const was = cur.customers.find((x) => x.id === c.id);
      if (!was) continue;
      if (c.deleted && !was.deleted) { await deleteAccount(q, c.id, `admin ${me.email}`); done.push(`deleted ${c.id}`); continue; }
      // Moving to the Landlord plan locks in today's price for this subscriber.
      if (c.plan !== was.plan && (c.plan === 'starter' || c.plan === 'landlord')) { await q.query('update accounts set plan = $2, unit_price_cents = $3 where id = $1', [c.id, c.plan, c.plan === 'landlord' ? await unitPrice(q) : null]); done.push(`plan ${c.id}`); }
      if ((c.trialEnds ?? null) !== (was.trialEnds ?? null) && (!c.trialEnds || /^\d{4}-\d{2}-\d{2}$/.test(c.trialEnds))) { await q.query('update accounts set trial_ends = $2 where id = $1', [c.id, c.trialEnds ?? null]); done.push(`trial ${c.id}`); }
      if (c.credit !== was.credit && Number.isInteger(c.credit) && c.credit >= 0 && c.credit < 10_000_000) { await q.query('update accounts set credit_cents = $2 where id = $1', [c.id, c.credit]); done.push(`credit ${c.id}`); }
      if (!same(c.notes, was.notes) && Array.isArray(c.notes)) { await q.query('update accounts set notes = $2::jsonb where id = $1', [c.id, JSON.stringify(c.notes.map(String).slice(0, 200))]); done.push(`notes ${c.id}`); }
    }
    // Requests: status, assignee, priority; new agent replies are emailed to the landlord.
    for (const t of next.tickets ?? []) {
      const was = cur.tickets.find((x) => x.id === t.id);
      if (!was) continue;
      const patch: string[] = [];
      if (t.status !== was.status && ['open', 'waiting', 'solved'].includes(t.status)) patch.push('status');
      if (t.priority !== was.priority && ['urgent', 'high', 'normal', 'low'].includes(t.priority)) patch.push('priority');
      if (t.assignee !== was.assignee) patch.push('assignee');
      const added = t.messages.slice(was.messages.length).filter((m) => (m.from === 'agent' || m.from === 'note') && typeof m.text === 'string' && m.text.trim());
      if (!patch.length && !added.length) continue;
      const row = await q.one<{ messages: TicketMsg[]; email: string; name: string; subject: string }>('select messages, email, name, subject from support_tickets where id = $1 for update', [t.id]);
      if (!row) continue;
      const msgs = [...row.messages, ...added.map((m) => ({ from: m.from, who: me.name, at: new Date().toISOString(), text: m.text.trim().slice(0, 5000) }))];
      await q.query(`update support_tickets set status = $2, priority = $3, assignee = $4, messages = $5::jsonb, updated_at = now() where id = $1`,
        [t.id, patch.includes('status') ? t.status : was.status, patch.includes('priority') ? t.priority : was.priority, realName(patch.includes('assignee') ? t.assignee : was.assignee, me), JSON.stringify(msgs)]);
      for (const m of added.filter((x) => x.from === 'agent')) await queueMail(q, { ...ticketReplyMail(row.email, row.name, row.subject, m.text.trim(), me.name), accountId: t.customerId || null });
      done.push(`ticket ${t.id}`);
    }
    // Data requests: marking done. A delete request deletes the account.
    for (const r of next.requests ?? []) {
      const was = cur.requests.find((x) => x.id === r.id);
      if (!was || r.status === was.status || r.status !== 'done') continue;
      await q.query(`update data_requests set status = 'done', done_at = now() where id = $1`, [r.id]);
      if (r.kind === 'delete' && was.customerId) await deleteAccount(q, was.customerId, `admin ${me.email}`);
      done.push(`request ${r.id}`);
    }
    // Team (super user only): Admin or Support, removals, invitations. Nobody changes or removes the super user.
    for (const m of cur.team) {
      const n = (next.team ?? []).find((x) => x.id === m.id);
      if (m.id === me.id || m.role === 'Super user') continue;
      if (!n) { await q.query(`update users set role = 'owner' where id = $1 and role in ('admin', 'support')`, [m.id]); await q.query('delete from sessions where user_id = $1', [m.id]); done.push(`removed ${m.id}`); continue; }
      const role = ROLE_OF[n.role];
      if (n.role !== m.role && (role === 'admin' || role === 'support')) { await q.query(`update users set role = $2 where id = $1 and role in ('admin', 'support')`, [m.id, role]); done.push(`role ${m.id}`); }
    }
    for (const n of (next.team ?? []).filter((x) => !cur.team.some((m) => m.id === x.id))) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.email)) continue;
      const role = ROLE_OF[n.role] === 'admin' ? 'admin' : 'support';
      const existing = await userByEmail(q, n.email);
      if (existing?.role === 'super') continue;
      if (existing) { await q.query('update users set role = $2 where id = $1', [existing.id, role]); done.push(`promoted ${existing.id}`); continue; }
      const u = await createUser(q, { email: n.email, name: n.name || n.email.split('@')[0], role });
      const token = await createLinkToken(q, u.id, 'invite', 24 * 7);
      await queueMail(q, inviteMail(u.email, u.name, me.name, `${cfg.appUrl}/#/reset?token=${token}&invite=1`));
      done.push(`invited ${u.id}`);
    }
    // Price, promotions, banks (super user only; others were reset to the current values above).
    const pl = next.platform;
    if (pl && Number.isInteger(pl.unitCents) && pl.unitCents !== cur.platform.unitCents && pl.unitCents >= 0 && pl.unitCents <= 100_000) {
      await putSetting(q, 'plans.landlord', { unitCents: pl.unitCents, since: new Date().toISOString(), by: me.email }); done.push('price');
    }
    for (const p of pl?.promotions ?? []) {
      const was = cur.platform.promotions.find((x) => x.id === p.id);
      if (!was) {
        if (promoProblem(p)) continue;
        const code = p.code.toUpperCase();
        if (await q.one('select 1 from promotions where upper(code) = $1', [code])) continue;
        await q.query(`insert into promotions (id, code, kind, value, months, ends_on, max_uses, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), code, p.kind, p.value, p.months, p.endsOn ?? null, p.maxUses ?? null, me.email]);
        done.push(`promo+ ${code}`);
      } else if (p.status !== was.status && ['active', 'paused', 'ended'].includes(p.status) && was.status !== 'ended') {
        await q.query('update promotions set status = $2 where id = $1', [p.id, p.status]); done.push(`promo ${was.code}`);
      }
    }
    if (pl?.banks && !same(pl.banks, cur.platform.banks) && typeof pl.banks.enabled === 'boolean' && Array.isArray(pl.banks.off)) {
      await putSetting(q, 'banks', { enabled: pl.banks.enabled, off: [...new Set(pl.banks.off.map((x) => String(x).slice(0, 80)))].slice(0, 200) }); done.push('banks');
    }
    if (next.sla && !same(next.sla, cur.sla) && Object.values(next.sla).every((h) => Number.isFinite(h) && h > 0 && h < 1000)) { await putSetting(q, 'support.sla', next.sla); done.push('sla'); }
    if (!same(next.replies, cur.replies) && Array.isArray(next.replies)) { await putSetting(q, 'support.replies', next.replies.slice(0, 100).map((r) => ({ id: String(r.id), title: String(r.title).slice(0, 120), text: String(r.text).slice(0, 4000) }))); done.push('replies'); }
    if (!same(next.rules, cur.rules) && Array.isArray(next.rules)) { await putSetting(q, 'support.rules', next.rules); done.push('rules'); }
    // Announcements: added, changed, removed.
    for (const a of next.announcements ?? []) {
      const was = cur.announcements.find((x) => x.id === a.id);
      if (!['website', 'app', 'both'].includes(a.where) || !['info', 'warning'].includes(a.tone) || !String(a.text ?? '').trim()) continue;
      if (!was) { await q.query(`insert into announcements (id, text, where_shown, tone, active, created_by) values ($1, $2, $3, $4, $5, $6)`, [String(a.id).slice(0, 60) || randomUUID(), a.text.trim().slice(0, 300), a.where, a.tone, !!a.active, me.email]); done.push(`announce+ ${a.id}`); }
      else if (!same(a, was)) { await q.query(`update announcements set text = $2, where_shown = $3, tone = $4, active = $5 where id = $1`, [a.id, a.text.trim().slice(0, 300), a.where, a.tone, !!a.active]); done.push(`announce ${a.id}`); }
    }
    for (const a of cur.announcements) if (!(next.announcements ?? []).some((x) => x.id === a.id)) { await q.query('delete from announcements where id = $1', [a.id]); done.push(`announce- ${a.id}`); }
    // Problems marked fixed.
    for (const e of cur.errors) if (!(next.errors ?? []).some((x) => x.id === e.id)) { await q.query('update system_errors set resolved_at = now() where id = $1', [e.id]); done.push(`fixed ${e.id}`); }
    // Actions that only leave a log line on the sample do something real here.
    if (log?.action === 'Sign-in link resent') {
      const u = await userByEmail(q, log.detail);
      if (u) { const token = await createLinkToken(q, u.id, 'reset', 24); await queueMail(q, resetMail(u.email, u.name, `${cfg.appUrl}/#/reset?token=${token}`)); done.push('reset link'); }
    }
    if (log) await audit(q, { actor: me.email, actorId: me.id, scope: 'admin', action: log.action.slice(0, 100), detail: log.detail, ip });
  });
  return done;
}

/** Deletes an account and everything in it (PIPEDA / Law 25 requests). The audit log keeps a line without personal data. */
export async function deleteAccount(q: Q, accountId: string, by: string) {
  const a = await q.one<{ owner_id: string }>('select owner_id from accounts where id = $1', [accountId]);
  if (!a) return false;
  await q.query('delete from support_tickets where account_id = $1 or user_id = $2', [accountId, a.owner_id]);
  await q.query(`update outbox set to_email = 'deleted', to_name = null, text_body = '', subject = '(deleted)' where account_id = $1`, [accountId]);
  await q.query(`update data_requests set email = 'deleted', account_id = null where account_id = $1`, [accountId]);
  await q.query(`update audit_log set detail = '', ip = null where account_id = $1 or actor_id = $2`, [accountId, a.owner_id]);
  await q.query('delete from accounts where id = $1', [accountId]);
  await q.query('delete from users where id = $1', [a.owner_id]);
  await q.query(`insert into data_requests (id, kind, email, status, done_at) values ($1, 'delete', 'deleted', 'done', now())`, [randomUUID()]);
  await audit(q, { actor: by, scope: 'admin', action: 'Account deleted', detail: `account ${accountId.slice(0, 8)}…` });
  return true;
}

/** A landlord's data for "View as landlord" (read-only). */
export async function customerState(q: Q, accountId: string): Promise<AppState | null> {
  return (await q.one<{ data: AppState }>('select data from account_state where account_id = $1', [accountId]))?.data ?? null;
}

export const trialEnd = (from = todayISO()) => addDays(from, 30);
