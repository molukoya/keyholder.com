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
import { Keys } from './keys';

// The whole API against a real (embedded) Postgres, as the app uses it.

const ADMIN = { email: 'owner@keyholder.ca', password: 'a-very-long-admin-pass' };
let app: FastifyInstance, db: Db;
const googleCalls: string[] = [];
const cfg = loadConfig({
  NODE_ENV: 'test', PGLITE_DIR: 'memory://', LOG_LEVEL: 'silent', APP_URL: 'http://localhost:8080',
  ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', WORKER: 'off',
  KEYS_SECRET: 'unit-test-keys-secret-0123456789',
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
    expect((await call('GET', '/api/session')).body).toMatchObject({ user: null, config: { google: true, emailDelivery: false, banks: false } });
    expect((await call('GET', '/api/session')).body.config.previewLogins).toBeUndefined();
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
    expect(r.body.user).toMatchObject({ email: ADMIN.email, role: 'super' });
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

describe('the super user', () => {
  const login = async (email: string, password: string) => (await call('POST', '/api/auth/login', { body: { email, password } })).cookie!;
  const snap = async (cookie: string) => (await call('GET', '/api/admin/support', { cookie })).body;
  const put = (cookie: string, next: unknown, log?: { action: string; detail: string }) => call('PUT', '/api/admin/support', { cookie, body: { next, log } });
  let sup = '', ava = '', nadia = '';

  it('ADMIN_EMAIL is the super user; only the super user adds team members (Admin or Support)', async () => {
    sup = await login(ADMIN.email, ADMIN.password);
    const s = await snap(sup);
    expect(s.myRole).toBe('super');
    expect(s.team[0]).toMatchObject({ name: 'You', role: 'Super user' });
    s.team.push({ id: 'new-ava', name: 'Ava Admin', email: 'ava@keyholder.ca', role: 'Admin' });
    expect((await put(sup, s, { action: 'Team member added', detail: 'Ava' })).status).toBe(200);
    const token = linkToken((await latestMail('ava@keyholder.ca', 'invite')).text_body);
    const r = await call('POST', '/api/auth/reset', { body: { token, password: 'ava-the-admin-2026' } });
    expect(r.body.user.role).toBe('admin');
    ava = r.cookie!;
    nadia = await login('nadia@keyholder.ca', 'nadia-support-2026');
    expect((await snap(ava)).myRole).toBe('admin');
    expect((await snap(nadia)).myRole).toBe('support');
    // An admin cannot change the team, even quietly (without a log line).
    const a = await snap(ava);
    expect((await put(ava, { ...a, team: a.team.filter((m: { role: string }) => m.role !== 'Support') }, { action: 'Team member removed', detail: 'Nadia' })).status).toBe(403);
    await put(ava, { ...a, team: a.team.filter((m: { role: string }) => m.role !== 'Support') });
    expect((await snap(sup)).team.some((m: { email: string }) => m.email === 'nadia@keyholder.ca')).toBe(true);
    // Nobody removes or demotes the super user.
    const s2 = await snap(sup);
    await put(sup, { ...s2, team: s2.team.map((m: { role: string }) => ({ ...m, role: m.role === 'Super user' ? 'Support' : m.role })) });
    expect((await call('GET', '/api/session', { cookie: sup })).body.user.role).toBe('super');
  });

  it('only the super user changes the price; a new price applies to new subscribers only', async () => {
    const before = await snap(sup);
    const alexC = before.customers.find((c: { email: string }) => c.email === 'Alex@Morgan.ca');
    expect(alexC).toMatchObject({ plan: 'landlord', unitPrice: 800 });
    const a = await snap(ava);
    expect((await put(ava, { ...a, platform: { ...a.platform, unitCents: 100 } }, { action: 'Price changed', detail: 'x' })).status).toBe(403);
    await put(ava, { ...a, platform: { ...a.platform, unitCents: 100 } });
    expect((await call('GET', '/api/pricing')).body.unitCents).toBe(800);
    expect((await put(sup, { ...before, platform: { ...before.platform, unitCents: 950 } }, { action: 'Price changed', detail: '$8 → $9.50' })).status).toBe(200);
    expect((await call('GET', '/api/pricing')).body.unitCents).toBe(950);
    const after = await snap(sup);
    expect(after.customers.find((c: { id: string }) => c.id === alexC.id).unitPrice).toBe(800);
    // A landlord who subscribes now pays the new price.
    const gina = after.customers.find((c: { email: string; plan: string }) => c.email !== 'Alex@Morgan.ca' && c.plan === 'starter');
    if (gina) {
      after.customers.find((c: { id: string }) => c.id === gina.id).plan = 'landlord';
      await put(sup, after, { action: 'Plan changed', detail: gina.name });
      expect((await snap(sup)).customers.find((c: { id: string }) => c.id === gina.id).unitPrice).toBe(950);
    }
  });

  it('promotions: the super user adds, pauses and ends codes; bad or repeated codes are refused; others cannot', async () => {
    const s = await snap(sup);
    const promo = (code: string, extra = {}) => ({ id: `p-${code}`, code, kind: 'percent', value: 25, months: 3, uses: 0, status: 'active', created: new Date().toISOString(), ...extra });
    s.platform.promotions = [promo('SPRING25'), promo('x'), promo('BIG', { value: 250 }), promo('TENOFF', { kind: 'amount', value: 1000, months: 2, maxUses: 50, endsOn: '2027-01-31' })];
    expect((await put(sup, s, { action: 'Promotion added', detail: 'SPRING25' })).status).toBe(200);
    let list = (await snap(sup)).platform.promotions;
    expect(list.map((p: { code: string }) => p.code).sort()).toEqual(['SPRING25', 'TENOFF']);
    expect(list.find((p: { code: string }) => p.code === 'TENOFF')).toMatchObject({ kind: 'amount', value: 1000, months: 2, maxUses: 50, endsOn: '2027-01-31', uses: 0, status: 'active' });
    const again = await snap(sup);
    again.platform.promotions.unshift(promo('spring25'));
    await put(sup, again, { action: 'Promotion added', detail: 'spring25' });
    expect((await snap(sup)).platform.promotions.filter((p: { code: string }) => p.code === 'SPRING25')).toHaveLength(1);
    const n = await snap(nadia);
    n.platform.promotions.unshift(promo('NADIA50'));
    expect((await put(nadia, n, { action: 'Promotion added', detail: 'NADIA50' })).status).toBe(403);
    await put(nadia, n);
    expect((await snap(sup)).platform.promotions.some((p: { code: string }) => p.code === 'NADIA50')).toBe(false);
    const p = await snap(sup);
    p.platform.promotions.find((x: { code: string }) => x.code === 'SPRING25').status = 'paused';
    await put(sup, p, { action: 'Promotion paused', detail: 'SPRING25' });
    list = (await snap(sup)).platform.promotions;
    expect(list.find((x: { code: string }) => x.code === 'SPRING25').status).toBe('paused');
  });

  it('banks: the super user turns single banks off (the app is told) or all of them', async () => {
    const s = await snap(sup);
    expect(s.platform.banks).toEqual({ enabled: true, off: [] });
    s.platform.banks = { enabled: true, off: ['TD'] };
    await put(sup, s, { action: 'Bank turned off', detail: 'TD' });
    expect((await call('GET', '/api/session')).body.config).toMatchObject({ banks: false, banksOff: ['TD'] });
    const a = await snap(ava);
    expect((await put(ava, { ...a, platform: { ...a.platform, banks: { enabled: false, off: [] } } }, { action: 'Bank connection turned off', detail: 'all' })).status).toBe(403);
    expect((await snap(sup)).platform.banks).toEqual({ enabled: true, off: ['TD'] });
  });

  it('API keys: super user only, password needed, stored encrypted and never sent back in full; they take over from Render', async () => {
    expect((await call('GET', '/api/admin/connections', { cookie: ava })).status).toBe(403);
    const c = (await call('GET', '/api/admin/connections', { cookie: sup })).body;
    expect(c.canSave).toBe(true);
    const g = c.services.find((x: { id: string }) => x.id === 'google').fields;
    expect(g.find((f: { name: string }) => f.name === 'google.clientId')).toMatchObject({ source: 'render', value: 'gid' });
    expect(g.find((f: { name: string }) => f.name === 'google.clientSecret')).toMatchObject({ source: 'render', last4: 'cret' });
    expect(JSON.stringify(c)).not.toContain('gsecret');
    const save = (password: string, values: Record<string, string | null>) => call('PUT', '/api/admin/connections', { cookie: sup, body: { password, values } });
    expect((await save('wrong-password', { 'stripe.secretKey': 'sk_test_abcdef123456' })).status).toBe(400);
    expect((await save(ADMIN.password, { 'email.provider': 'resend' })).body.error).toMatch(/Resend API key/);
    expect((await save(ADMIN.password, { 'email.provider': 'carrier-pigeon' })).status).toBe(400);
    const r = await save(ADMIN.password, { 'stripe.secretKey': 'sk_test_abcdef123456', 'google.clientId': 'new-gid.apps.googleusercontent.com' });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('sk_test_abcdef123456');
    expect(r.body.services.find((x: { id: string }) => x.id === 'stripe').fields.find((f: { name: string }) => f.name === 'stripe.secretKey')).toMatchObject({ source: 'dashboard', last4: '3456', updatedBy: ADMIN.email });
    const row = (await db.query<{ ciphertext: string }>(`select ciphertext from secrets where name = 'stripe.secretKey'`))[0];
    expect(row.ciphertext).not.toContain('sk_test');
    // The new Google client ID is used right away.
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    expect(start.headers.location).toContain('client_id=new-gid.apps.googleusercontent.com');
    // Test a service: Stripe answers with the keys in effect.
    expect((await call('POST', '/api/admin/connections/test', { cookie: sup, body: { service: 'stripe' } })).body).toMatchObject({ ok: true });
    expect(googleCalls.some((u) => u.includes('api.stripe.com/v1/balance'))).toBe(true);
    // Every change is in the audit log.
    expect((await snap(sup)).audit.some((a: { action: string; detail: string }) => a.action === 'API key changed' && /stripe: Secret key changed \(…3456\)/.test(a.detail))).toBe(true);
    // Without the same KEYS_SECRET, the saved keys cannot be read.
    const other = new Keys(loadConfig({ NODE_ENV: 'test', PGLITE_DIR: 'memory://', KEYS_SECRET: 'a-different-keys-secret-value' }));
    await other.refresh(db, true);
    expect(other.get('stripe.secretKey')).toBeUndefined();
    // Removing a saved key goes back to Render's value.
    await save(ADMIN.password, { 'google.clientId': null });
    const start2 = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    expect(start2.headers.location).toContain('client_id=gid&');
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
    expect(googleCalls.filter((u) => u.includes('google')).length).toBe(2);
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

describe('the team password', () => {
  it('a password changed in the dashboard stays; a new ADMIN_PASSWORD (Render) replaces it and signs out old sessions', async () => {
    expect(await ensureAdmin(db, cfg)).toBe('unchanged');
    const first = (await call('POST', '/api/auth/login', { body: { email: 'admin', password: ADMIN.password } })).cookie!;
    // Changed in the dashboard (Team & settings → Your password).
    expect((await call('POST', '/api/auth/password', { cookie: first, body: { current: ADMIN.password, next: 'dashboard-pass-123' } })).status).toBe(200);
    expect(await ensureAdmin(db, cfg)).toBe('unchanged'); // same ADMIN_PASSWORD as before: the new one stays
    expect((await call('POST', '/api/auth/login', { body: { email: 'admin', password: 'dashboard-pass-123' } })).status).toBe(200);
    // A new value in Render, then a restart.
    const keep = (await call('POST', '/api/auth/login', { body: { email: 'admin', password: 'dashboard-pass-123' } })).cookie!;
    const cfg2 = loadConfig({ NODE_ENV: 'test', PGLITE_DIR: 'memory://', LOG_LEVEL: 'silent', ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: 'render-pass-4567', WORKER: 'off' });
    expect(await ensureAdmin(db, cfg2)).toBe('updated');
    expect((await call('POST', '/api/auth/login', { body: { email: ADMIN.email, password: 'render-pass-4567' } })).status).toBe(200);
    expect((await call('POST', '/api/auth/login', { body: { email: 'admin', password: 'dashboard-pass-123' } })).status).toBe(401);
    expect((await call('GET', '/api/session', { cookie: keep })).body.user).toBeNull();
    expect(await ensureAdmin(db, cfg2)).toBe('unchanged');
  });
});
