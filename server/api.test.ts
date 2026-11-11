import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AppState } from '../src/data/types';
import { defaultProfile, emptyState, seedState } from '../src/data/seed';
import { loadConfig } from './config';
import { migrate, openDb, type Db } from './db';
import { buildApp } from './app';
import { dailyRun } from './jobs';
import { sendDue } from './email';
import { ensureAdmin } from './services';

// The whole API against a real (embedded) Postgres, as the app uses it.

const ADMIN = { email: 'owner@keyholder.ca', password: 'a-very-long-admin-pass' };
let app: FastifyInstance, db: Db;
const googleCalls: string[] = [];
const cfg = loadConfig({
  NODE_ENV: 'test', PGLITE_DIR: 'memory://', LOG_LEVEL: 'silent', APP_URL: 'http://localhost:8080',
  ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', WORKER: 'off',
});

beforeAll(async () => {
  db = await openDb({ pgliteDir: 'memory://' });
  await migrate(db);
  await ensureAdmin(db, cfg);
  const fakeFetch = (async (url: string) => {
    googleCalls.push(String(url));
    if (String(url).includes('/token')) return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
    return new Response(JSON.stringify({ sub: 'g-123', email: 'gina@gmail.com', email_verified: true, name: 'Gina Lopez' }), { status: 200 });
  }) as typeof fetch;
  app = await buildApp({ cfg, db, fetch: fakeFetch, staticDir: null });
}, 60_000);
afterAll(async () => { await app?.close(); await db?.close(); });

type Res = { status: number; body: any; cookie?: string };
async function call(method: string, url: string, opts: { body?: unknown; cookie?: string; csrf?: boolean; origin?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.csrf !== false) headers['x-keyholder'] = '1';
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  const r = await app.inject({ method: method as 'GET', url, headers, payload: opts.body as object });
  const set = r.headers['set-cookie'];
  const c = (Array.isArray(set) ? set : set ? [set] : []).find((x) => x.startsWith('kh_session='));
  let body: unknown = r.body; try { body = r.json(); } catch { /* not JSON */ }
  return { status: r.statusCode, body, cookie: c ? c.split(';')[0] : undefined };
}
const latestMail = async (to: string, kind?: string) => (await db.query<{ subject: string; text_body: string; status: string; kind: string }>(
  `select subject, text_body, status, kind from outbox where lower(to_email) = lower($1) and ($2 = '' or kind = $2) order by created_at desc limit 1`, [to, kind ?? '']))[0];
const linkToken = (text: string) => text.match(/token=([A-Za-z0-9_-]+)/)![1];

function landlordState(name: string, email: string): AppState {
  const p = { ...defaultProfile(), name, email, onboarded: true, sample: false, account: { provider: 'email' as const, email, name, signedIn: true, created: '2026-01-01' } };
  const s = seedState(p);
  s.profile.sample = false;
  for (const t of s.tenants) { t.email = t.email.replace('@example.com', '@tenants.ca'); for (const x of t.people ?? []) x.email = x.email.replace('@example.com', '@tenants.ca'); }
  return s;
}

let alex = '';
describe('accounts', () => {
  it('reports health and the public settings', async () => {
    expect((await call('GET', '/api/health')).body).toMatchObject({ ok: true, db: 'pglite' });
    expect((await call('GET', '/api/session')).body).toMatchObject({ user: null, config: { previewLogins: true, google: true, emailDelivery: false } });
  });

  it('refuses changes that do not come from the app (cross-site protection)', async () => {
    expect((await call('POST', '/api/auth/login', { body: { email: 'x@y.ca', password: 'x' }, csrf: false })).status).toBe(403);
    expect((await call('POST', '/api/auth/login', { body: { email: 'x@y.ca', password: 'x' }, origin: 'https://evil.example' })).status).toBe(403);
  });

  it('signs up with a name, email and password, and sends a welcome email to confirm it', async () => {
    expect((await call('POST', '/api/auth/signup', { body: { name: 'Alex Morgan', email: 'alex@morgan.ca', password: 'short' } })).status).toBe(400);
    expect((await call('POST', '/api/auth/signup', { body: { name: 'Alex Morgan', email: 'alex@morgan.ca', password: 'password' } })).status).toBe(400);
    const r = await call('POST', '/api/auth/signup', { body: { name: 'Alex Morgan', email: 'Alex@Morgan.ca', password: 'maple-street-48' } });
    expect(r.status).toBe(201);
    expect(r.cookie).toBeTruthy();
    alex = r.cookie!;
    expect(r.body.user).toMatchObject({ email: 'Alex@Morgan.ca', name: 'Alex Morgan', role: 'owner', emailVerified: false });
    expect((await call('POST', '/api/auth/signup', { body: { name: 'A', email: 'alex@morgan.ca', password: 'another-pass-1' } })).status).toBe(409);
    const mail = await latestMail('alex@morgan.ca', 'welcome');
    expect(mail.subject).toBe('Welcome to Keyholder');
    expect((await call('POST', '/api/auth/verify', { body: { token: linkToken(mail.text_body) } })).status).toBe(200);
    expect((await call('GET', '/api/session', { cookie: alex })).body.user.emailVerified).toBe(true);
  });

  it('signs in with the right password only (email in any case)', async () => {
    expect((await call('POST', '/api/auth/login', { body: { email: 'alex@morgan.ca', password: 'wrong-password' } })).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { body: { email: 'nobody@morgan.ca', password: 'wrong-password' } })).status).toBe(401);
    const r = await call('POST', '/api/auth/login', { body: { email: 'ALEX@morgan.ca', password: 'maple-street-48' } });
    expect(r.status).toBe(200);
    expect(r.cookie).toBeTruthy();
  });

  it('signs out', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: 'alex@morgan.ca', password: 'maple-street-48' } });
    expect((await call('POST', '/api/auth/logout', { cookie: r.cookie })).status).toBe(200);
    expect((await call('GET', '/api/session', { cookie: r.cookie })).body.user).toBeNull();
    expect((await call('GET', '/api/state', { cookie: r.cookie })).status).toBe(401);
  });

  it('resets a forgotten password by email link, once, and signs out other devices', async () => {
    const other = (await call('POST', '/api/auth/login', { body: { email: 'alex@morgan.ca', password: 'maple-street-48' } })).cookie;
    expect((await call('POST', '/api/auth/forgot', { body: { email: 'alex@morgan.ca' } })).status).toBe(200);
    expect((await call('POST', '/api/auth/forgot', { body: { email: 'ghost@nowhere.ca' } })).status).toBe(200); // same answer
    const token = linkToken((await latestMail('alex@morgan.ca', 'reset')).text_body);
    const r = await call('POST', '/api/auth/reset', { body: { token, password: 'new-maple-street-48' } });
    expect(r.status).toBe(200);
    expect((await call('POST', '/api/auth/reset', { body: { token, password: 'again-maple-street' } })).status).toBe(400);
    expect((await call('GET', '/api/session', { cookie: other })).body.user).toBeNull();
    expect((await call('POST', '/api/auth/login', { body: { email: 'alex@morgan.ca', password: 'new-maple-street-48' } })).status).toBe(200);
    alex = r.cookie!;
  });

  it('slows down password guessing', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call('POST', '/api/auth/login', { body: { email: 'target@morgan.ca', password: `guess-${i}` } })).status;
    expect(last).toBe(429);
  });
});

describe("a landlord's data", () => {
  let rev = 0;
  it('starts empty, then saves and loads', async () => {
    expect((await call('GET', '/api/state', { cookie: alex })).body).toEqual({ revision: 0, data: null });
    const s = landlordState('Alex Morgan', 'alex@morgan.ca');
    const r = await call('PUT', '/api/state', { cookie: alex, body: { baseRevision: 0, data: s } });
    expect(r.body).toMatchObject({ revision: 1, merged: false });
    rev = 1;
    const back = await call('GET', '/api/state', { cookie: alex });
    expect(back.body.revision).toBe(1);
    expect(back.body.data.properties.length).toBe(s.properties.length);
  });

  it('rejects sample data and old versions', async () => {
    const s = landlordState('Alex', 'alex@morgan.ca');
    expect((await call('PUT', '/api/state', { cookie: alex, body: { baseRevision: rev, data: { ...s, profile: { ...s.profile, sample: true } } } })).status).toBe(422);
    expect((await call('PUT', '/api/state', { cookie: alex, body: { baseRevision: rev, data: { ...s, version: 3 } } })).status).toBe(422);
  });

  it('merges two devices that saved from the same version', async () => {
    const cur = (await call('GET', '/api/state', { cookie: alex })).body;
    const phone: AppState = structuredClone(cur.data); const laptop: AppState = structuredClone(cur.data);
    phone.expenses.unshift({ id: 'exp-phone', propertyId: phone.properties[0].id, date: '2026-11-01', amount: 4200, vendor: 'Home Depot', category: 'repairs', kind: 'current', scope: 'direct', createdAt: new Date().toISOString() } as never);
    laptop.profile.graceDays = 3;
    const a = await call('PUT', '/api/state', { cookie: alex, body: { baseRevision: cur.revision, data: phone } });
    expect(a.body.merged).toBe(false);
    const b = await call('PUT', '/api/state', { cookie: alex, body: { baseRevision: cur.revision, data: laptop } });
    expect(b.body.merged).toBe(true);
    expect(b.body.data.profile.graceDays).toBe(3);
    expect(b.body.data.expenses.some((e: { id: string }) => e.id === 'exp-phone')).toBe(true);
    rev = b.body.revision;
  });

  it('emails a receipt to every tenant on the lease when the landlord sends it, once', async () => {
    const cur = (await call('GET', '/api/state', { cookie: alex })).body;
    const s: AppState = cur.data;
    const lease = s.leases.find((l) => l.tenantId === 't-patel')!;
    const now = new Date().toISOString();
    s.payments.push({ id: 'pay-new', leaseId: lease.id, date: now.slice(0, 10), amount: lease.rent, method: 'etransfer', period: now.slice(0, 7), source: 'manual', createdAt: now });
    s.receipts.push({ id: 'rcpt-new', number: 2001, paymentId: 'pay-new', status: 'sent', createdAt: now, sentAt: now });
    s.messages.push({ id: 'msg-new', kind: 'receipt', tenantId: 't-patel', leaseId: lease.id, period: now.slice(0, 7), receiptId: 'rcpt-new', subject: 'Your rent receipt', body: '', status: 'sent', edited: false, createdAt: now, sentAt: now });
    const r = await call('PUT', '/api/state', { cookie: alex, body: { baseRevision: cur.revision, data: s } });
    expect(r.status).toBe(200);
    const m1 = await latestMail('jpatel@tenants.ca', 'receipt');
    const m2 = await latestMail('priya.patel@tenants.ca', 'receipt');
    expect(m1.subject).toMatch(/^Rent receipt #2001/);
    expect(m1.text_body).toContain('Receipt number: 2001');
    expect(m2).toBeTruthy();
    // Saving again does not send it again.
    await call('PUT', '/api/state', { cookie: alex, body: { baseRevision: r.body.revision, data: s } });
    expect((await db.query(`select count(*)::int as n from outbox where kind = 'receipt' and to_email = 'jpatel@tenants.ca'`))[0]).toEqual({ n: 1 });
    // The sender delivers it (EMAIL_PROVIDER=log keeps it as "logged").
    await sendDue(cfg, db);
    expect((await latestMail('jpatel@tenants.ca', 'receipt')).status).toBe('logged');
  });

  it('downloads all of my data', async () => {
    const r = await call('GET', '/api/account/export', { cookie: alex });
    expect(r.status).toBe(200);
    expect(r.body.account.email).toBe('Alex@Morgan.ca');
    expect(r.body.data.properties.length).toBeGreaterThan(0);
  });
});

describe('automation', () => {
  it('sends late-rent reminders by itself when automatic sending is on, and a daily summary when asked', async () => {
    const cur = (await call('GET', '/api/state', { cookie: alex })).body;
    const s: AppState = cur.data;
    s.profile.autoSend = true; s.profile.emailUpdates = true;
    // Jordan & Priya are late again: the payment logged above is undone.
    for (const p of s.payments) if (p.id === 'pay-new') p.voided = true;
    s.messages = s.messages.filter((m) => !(m.kind === 'reminder' && m.leaseId === 'l-patel'));
    await call('PUT', '/api/state', { cookie: alex, body: { baseRevision: cur.revision, data: s } });
    const r = await dailyRun(cfg, db);
    expect(r.reminders).toBeGreaterThan(0);
    const after = (await call('GET', '/api/state', { cookie: alex })).body.data as AppState;
    expect(after.messages.some((m) => m.kind === 'reminder' && m.status === 'sent' && m.body.length > 20)).toBe(true);
    expect(after.audit[0].action).toBe('Reminder sent automatically');
    expect((await db.query(`select count(*)::int as n from outbox where kind = 'reminder'`))[0]).toMatchObject({ n: expect.any(Number) });
    // Running again the same day sends nothing new.
    expect((await dailyRun(cfg, db)).reminders).toBe(0);
  });
});

describe('support', () => {
  let admin = '';
  it('a landlord writes to support; the team sees it, replies by email and changes the plan', async () => {
    expect((await call('POST', '/api/support/tickets', { cookie: alex, body: { subject: 'Bank not connecting', message: 'TD says sign in again', category: 'bank' } })).status).toBe(201);
    expect((await latestMail('alex@morgan.ca', 'ticket-ack')).subject).toMatch(/We got your message/);
    expect((await call('GET', '/api/admin/support', { cookie: alex })).status).toBe(403);
    admin = (await call('POST', '/api/auth/login', { body: ADMIN })).cookie!;
    const snap = (await call('GET', '/api/admin/support', { cookie: admin })).body;
    expect(snap.live).toBe(true);
    const c = snap.customers.find((x: { email: string }) => x.email === 'Alex@Morgan.ca');
    expect(c).toMatchObject({ properties: 2, plan: 'starter' });
    const t = snap.tickets.find((x: { subject: string }) => x.subject === 'Bank not connecting');
    expect(t).toMatchObject({ priority: 'high', status: 'open', customerId: c.id });
    // Reply, set waiting, change plan, add an announcement.
    const next = structuredClone(snap);
    const tt = next.tickets.find((x: { id: string }) => x.id === t.id);
    tt.messages.push({ from: 'agent', who: 'You', at: new Date().toISOString(), text: 'Please tap Reconnect in Settings.' }); tt.status = 'waiting'; tt.assignee = 'You';
    next.customers.find((x: { id: string }) => x.id === c.id).plan = 'landlord';
    next.announcements.unshift({ id: 'an-live', text: 'New: Keyholder now saves to your account.', where: 'both', tone: 'info', active: true, created: new Date().toISOString() });
    const r = await call('PUT', '/api/admin/support', { cookie: admin, body: { next, log: { action: 'Reply sent', detail: t.id } } });
    expect(r.status).toBe(200);
    expect(r.body.done).toEqual(expect.arrayContaining([`ticket ${t.id}`, `plan ${c.id}`, 'announce+ an-live']));
    expect((await latestMail('alex@morgan.ca', 'ticket-reply')).text_body).toContain('Please tap Reconnect');
    expect((await call('GET', '/api/announcements')).body[0].text).toMatch(/saves to your account/);
    const again = (await call('GET', '/api/admin/support', { cookie: admin })).body;
    expect(again.customers.find((x: { id: string }) => x.id === c.id).plan).toBe('landlord');
    expect(again.tickets.find((x: { id: string }) => x.id === t.id).assignee).toBe('You');
    expect(again.audit.some((a: { action: string }) => a.action === 'Reply sent')).toBe(true);
  });

  it('the team can sign in with the username "admin" and the team password (not with "admin" / "admin")', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: 'admin', password: ADMIN.password } });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: ADMIN.email, role: 'admin' });
    expect((await call('POST', '/api/auth/login', { body: { email: 'Admin', password: 'admin' } })).status).toBe(401);
  });

  it('invites a team member, who sets a password from the email', async () => {
    const snap = (await call('GET', '/api/admin/support', { cookie: admin })).body;
    snap.team.push({ id: 'new', name: 'Nadia Rahman', email: 'nadia@keyholder.ca', role: 'Support' });
    await call('PUT', '/api/admin/support', { cookie: admin, body: { next: snap, log: { action: 'Team member added', detail: 'Nadia' } } });
    const token = linkToken((await latestMail('nadia@keyholder.ca', 'invite')).text_body);
    const r = await call('POST', '/api/auth/reset', { body: { token, password: 'nadia-support-2026' } });
    expect(r.body.user.role).toBe('support');
    expect((await call('GET', '/api/admin/support', { cookie: r.cookie })).status).toBe(200);
  });
});

describe('Google sign-in', () => {
  it('creates the account from Google and opens the app', async () => {
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start?intent=signup' });
    expect(start.statusCode).toBe(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const oauth = (start.headers['set-cookie'] as string).split(';')[0];
    const cb = await app.inject({ method: 'GET', url: `/api/auth/google/callback?code=abc&state=${state}`, headers: { cookie: oauth } });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('http://localhost:8080/#/auth/google?intent=signup');
    const cookie = ([cb.headers['set-cookie']].flat() as string[]).find((c) => c.startsWith('kh_session='))!.split(';')[0];
    expect((await call('GET', '/api/session', { cookie })).body.user).toMatchObject({ email: 'gina@gmail.com', google: true, emailVerified: true });
    expect(googleCalls.length).toBe(2);
  });

  it('refuses a callback with the wrong state', async () => {
    const cb = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=abc&state=forged', headers: { cookie: 'kh_oauth=real.signin' } });
    expect(cb.headers.location).toContain('error=google');
  });
});

describe('deleting an account', () => {
  it('needs the password, then removes everything', async () => {
    expect((await call('DELETE', '/api/account', { cookie: alex, body: { password: 'nope' } })).status).toBe(400);
    expect((await call('DELETE', '/api/account', { cookie: alex, body: { password: 'new-maple-street-48' } })).status).toBe(200);
    expect((await call('GET', '/api/session', { cookie: alex })).body.user).toBeNull();
    expect((await call('POST', '/api/auth/login', { body: { email: 'alex@morgan.ca', password: 'new-maple-street-48' } })).status).toBe(401);
    expect((await db.query(`select count(*)::int as n from account_state`))[0]).toEqual({ n: 0 });
    expect((await db.query(`select count(*)::int as n from support_tickets where email = 'Alex@Morgan.ca'`))[0]).toEqual({ n: 0 });
  });

  it('new empty accounts work too', async () => {
    const r = await call('POST', '/api/auth/signup', { body: { name: 'Bo', email: 'bo@bo.ca', password: 'bo-the-landlord' } });
    const s = emptyState({ ...defaultProfile(), name: 'Bo', onboarded: true });
    expect((await call('PUT', '/api/state', { cookie: r.cookie, body: { baseRevision: 0, data: s } })).body.revision).toBe(1);
  });
});
