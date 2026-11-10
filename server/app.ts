import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fstatic from '@fastify/static';
import { z, ZodError } from 'zod';
import type { AppState } from '../src/data/types';
import type { Config } from './config';
import type { Db } from './db';
import { queueMail, recordError } from './email';
import { newTicketAdminMail, resetMail, ticketAckMail, welcomeMail } from './mails';
import { burnPasswordCheck, newToken, normEmail, passwordProblem, verifyPassword, hashPassword } from './security';
import {
  accountFor, audit, createLinkToken, createSession, createUser, endAllSessions, endSession, publicUser, readState, sessionUser,
  SESSION_COOKIE, stateProblem, useLinkToken, userByEmail, userById, writeState, type User,
} from './services';
import { applyChange, customerState, deleteAccount, snapshot } from './support';

declare module 'fastify' {
  interface FastifyRequest { user: User | null; sessionToken: string | null }
}

export const VERSION = '2.0.0';

/** Thrown to send a clear message with a status code. */
class Http extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string) => { throw new Http(status, message); };

export interface Deps { cfg: Config; db: Db; fetch?: typeof fetch; staticDir?: string | null }

export async function buildApp({ cfg, db, fetch: fetcher = fetch, staticDir }: Deps) {
  const app = Fastify({
    logger: cfg.logLevel === 'silent' ? false : { level: cfg.logLevel, redact: ['req.headers.cookie', 'req.headers.authorization'] },
    bodyLimit: 12 * 1024 * 1024, // a landlord's data with receipt photos
    trustProxy: cfg.trustProxy,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: cfg.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: cfg.cookieSecure ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', errorResponseBuilder: () => ({ statusCode: 429, error: 'Too many tries. Wait a minute and try again.' }) });

  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  // Who is asking (from the session cookie), and a cross-site check on anything that changes data:
  // the request must come from this site and carry our header (a form on another site cannot add it).
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const sameSite = !origin || origin === cfg.appUrl || (() => { try { return new URL(origin).host === req.headers.host; } catch { return false; } })();
      if (!sameSite || req.headers['x-keyholder'] !== '1') fail(403, 'This request did not come from the Keyholder app.');
    }
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const u = await sessionUser(db, token, cfg.sessionDays);
      if (u) { req.user = u; req.sessionToken = token; }
    }
  });

  app.setErrorHandler(async (err, req, reply) => {
    if (err instanceof Http) return reply.code(err.status).send({ error: err.message });
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Some details are missing or not right.', issues: err.issues.map((i) => i.path.join('.')) });
    const e = err as { statusCode?: number; message: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.statusCode === 413 ? 'That is too big to save.' : e.message });
    req.log.error(err);
    await recordError(db, `API ${req.method} ${req.routeOptions?.url ?? req.url}`, e.message).catch(() => {});
    return reply.code(500).send({ error: 'Something went wrong on our side. Please try again.' });
  });

  const ip = (req: FastifyRequest) => req.ip;
  const need = (req: FastifyRequest): User => req.user ?? fail(401, 'Please sign in again.');
  const needStaff = (req: FastifyRequest): User => { const u = need(req); if (u.role !== 'admin' && u.role !== 'support') fail(403, 'Only the Keyholder team can open this.'); return u; };
  const startSession = async (req: FastifyRequest, reply: FastifyReply, u: User) => {
    const token = await createSession(db, u.id, cfg.sessionDays, { ip: ip(req), ua: req.headers['user-agent'] });
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, path: '/', maxAge: cfg.sessionDays * 86400 });
  };
  const publicConfig = () => ({ previewLogins: cfg.previewLogins, google: !!cfg.google, emailDelivery: cfg.email.provider !== 'log', version: VERSION });
  // Counted per address and email, after the body is read, so one person's typos never lock out another.
  const authLimit = { rateLimit: { hook: 'preHandler' as const, max: 10, timeWindow: '1 minute', keyGenerator: (r: FastifyRequest) => `${r.ip}:${normEmail(String((r.body as { email?: string })?.email ?? ''))}` } };

  // ---------------- Public ----------------
  app.get('/api/health', async () => {
    await db.query('select 1');
    return { ok: true, version: VERSION, db: db.kind };
  });
  app.get('/api/session', async (req) => ({ user: req.user ? publicUser(req.user) : null, config: publicConfig() }));
  app.get('/api/announcements', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    const rows = await db.query<{ id: string; text: string; where_shown: string; tone: string; created_at: Date }>(`select id, text, where_shown, tone, created_at from announcements where active order by created_at desc limit 5`);
    return rows.map((a) => ({ id: a.id, text: a.text, where: a.where_shown, tone: a.tone, active: true, created: new Date(a.created_at).toISOString() }));
  });

  // ---------------- Accounts ----------------
  const Signup = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(200), password: z.string().max(200), emailUpdates: z.boolean().optional() });
  app.post('/api/auth/signup', { config: authLimit }, async (req, reply) => {
    const b = Signup.parse(req.body);
    const bad = passwordProblem(b.password); if (bad) fail(400, bad);
    if (await userByEmail(db, b.email)) fail(409, 'There is already a Keyholder account for this email. Sign in instead.');
    const u = await db.tx(async (q) => {
      const u = await createUser(q, { email: b.email, name: b.name, password: b.password });
      const accountId = await accountFor(q, u.id);
      const token = await createLinkToken(q, u.id, 'verify', 24 * 7);
      await queueMail(q, { ...welcomeMail(u.email, u.name, `${cfg.appUrl}/#/verify?token=${token}`), accountId });
      await audit(q, { actor: u.email, actorId: u.id, accountId, scope: 'auth', action: 'Signed up', detail: 'Email and password', ip: ip(req) });
      return u;
    });
    await startSession(req, reply, u);
    return reply.code(201).send({ user: publicUser(u) });
  });

  const Login = z.object({ email: z.string().trim().max(200), password: z.string().max(200) });
  app.post('/api/auth/login', { config: authLimit }, async (req, reply) => {
    const b = Login.parse(req.body);
    const u = await userByEmail(db, b.email);
    const ok = u && !u.disabled_at ? await verifyPassword(b.password, u.password_hash) : (await burnPasswordCheck(b.password), false);
    if (!ok || !u) {
      if (u) await audit(db, { actor: u.email, actorId: u.id, scope: 'auth', action: 'Sign-in failed', detail: 'Wrong password', ip: ip(req) });
      fail(401, u && !u.password_hash && u.google_sub ? 'This account signs in with Google.' : 'That email or password is not right.');
    }
    await startSession(req, reply, u!);
    await audit(db, { actor: u!.email, actorId: u!.id, scope: 'auth', action: 'Signed in', ip: ip(req) });
    return { user: publicUser(u!) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionToken) await endSession(db, req.sessionToken);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/forgot', { config: authLimit }, async (req) => {
    const { email } = z.object({ email: z.string().trim().email().max(200) }).parse(req.body);
    const u = await userByEmail(db, email);
    if (u && !u.disabled_at) await db.tx(async (q) => {
      const token = await createLinkToken(q, u.id, 'reset', 1);
      await queueMail(q, resetMail(u.email, u.name, `${cfg.appUrl}/#/reset?token=${token}`));
      await audit(q, { actor: u.email, actorId: u.id, scope: 'auth', action: 'Password reset asked', ip: ip(req) });
    });
    return { ok: true }; // the same answer either way: it does not reveal who has an account
  });

  app.post('/api/auth/reset', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = z.object({ token: z.string().min(10).max(100), password: z.string().max(200) }).parse(req.body);
    const bad = passwordProblem(b.password); if (bad) fail(400, bad);
    const hash = await hashPassword(b.password);
    const u = await db.tx(async (q) => {
      const t = await useLinkToken(q, b.token, ['reset', 'invite']);
      if (!t) fail(400, 'This link has expired or was already used. Ask for a new one.');
      await q.query('update users set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()) where id = $1', [t!.userId, hash]);
      await endAllSessions(q, t!.userId);
      const u = (await userById(q, t!.userId))!;
      await audit(q, { actor: u.email, actorId: u.id, scope: 'auth', action: t!.purpose === 'invite' ? 'Team invitation accepted' : 'Password reset', ip: ip(req) });
      return u;
    });
    await startSession(req, reply, u);
    return { user: publicUser(u) };
  });

  app.post('/api/auth/verify', async (req) => {
    const { token } = z.object({ token: z.string().min(10).max(100) }).parse(req.body);
    const t = await useLinkToken(db, token, ['verify']);
    if (!t) fail(400, 'This link has expired or was already used.');
    await db.query('update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1', [t!.userId]);
    return { ok: true };
  });

  app.post('/api/auth/resend-verify', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req) => {
    const u = need(req);
    if (u.email_verified_at) return { ok: true };
    const token = await createLinkToken(db, u.id, 'verify', 24 * 7);
    await queueMail(db, welcomeMail(u.email, u.name, `${cfg.appUrl}/#/verify?token=${token}`));
    return { ok: true };
  });

  app.post('/api/auth/password', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const u = need(req);
    const b = z.object({ current: z.string().max(200).optional(), next: z.string().max(200) }).parse(req.body);
    if (u.password_hash && !(await verifyPassword(b.current ?? '', u.password_hash))) fail(400, 'Your current password is not right.');
    const bad = passwordProblem(b.next); if (bad) fail(400, bad);
    await db.query('update users set password_hash = $2 where id = $1', [u.id, await hashPassword(b.next)]);
    await endAllSessions(db, u.id, req.sessionToken ?? undefined);
    await audit(db, { actor: u.email, actorId: u.id, scope: 'auth', action: 'Password changed', ip: ip(req) });
    return { ok: true };
  });

  // ---------------- Google sign-in (when GOOGLE_CLIENT_ID / SECRET are set) ----------------
  const redirectUri = `${cfg.appUrl}/api/auth/google/callback`;
  app.get('/api/auth/google/start', async (req, reply) => {
    if (!cfg.google) fail(404, 'Google sign-in is not set up.');
    const state = newToken();
    const intent = (req.query as { intent?: string }).intent === 'signup' ? 'signup' : 'signin';
    reply.setCookie('kh_oauth', `${state}.${intent}`, { httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, path: '/api/auth/google', maxAge: 600 });
    const q = new URLSearchParams({ client_id: cfg.google!.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  });
  app.get('/api/auth/google/callback', async (req, reply) => {
    if (!cfg.google) fail(404, 'Google sign-in is not set up.');
    const { code, state } = req.query as { code?: string; state?: string };
    const [want, intent] = String(req.cookies.kh_oauth ?? '').split('.');
    reply.clearCookie('kh_oauth', { path: '/api/auth/google' });
    if (!code || !state || state !== want) return reply.redirect(`${cfg.appUrl}/#/signin?error=google`);
    const tok = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: cfg.google!.clientId, client_secret: cfg.google!.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    if (!tok.ok) { await recordError(db, 'Google sign-in', `token ${tok.status}`); return reply.redirect(`${cfg.appUrl}/#/signin?error=google`); }
    const { access_token } = (await tok.json()) as { access_token: string };
    const info = (await (await fetcher('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } })).json()) as { sub: string; email: string; email_verified: boolean; name?: string };
    if (!info.sub || !info.email || !info.email_verified) return reply.redirect(`${cfg.appUrl}/#/signin?error=google`);
    let isNew = false;
    const u = await db.tx(async (q) => {
      let u = (await q.one<User>('select * from users where google_sub = $1', [info.sub])) ?? (await userByEmail(q, info.email));
      if (u && !u.google_sub) await q.query('update users set google_sub = $2, email_verified_at = coalesce(email_verified_at, now()) where id = $1', [u.id, info.sub]);
      if (!u) {
        isNew = true;
        u = await createUser(q, { email: info.email, name: info.name ?? info.email.split('@')[0], googleSub: info.sub, verified: true });
        await accountFor(q, u.id);
        await audit(q, { actor: u.email, actorId: u.id, scope: 'auth', action: 'Signed up', detail: 'Google', ip: ip(req) });
      } else await audit(q, { actor: u.email, actorId: u.id, scope: 'auth', action: 'Signed in', detail: 'Google', ip: ip(req) });
      return u;
    });
    if (u.disabled_at) return reply.redirect(`${cfg.appUrl}/#/signin?error=google`);
    await startSession(req, reply, u);
    return reply.redirect(`${cfg.appUrl}/#/auth/google?intent=${intent === 'signup' || isNew ? 'signup' : 'signin'}`);
  });

  // ---------------- A landlord's data ----------------
  const ownerAccount = async (req: FastifyRequest) => { const u = need(req); if (u.role !== 'owner') fail(403, 'Team accounts have no rental data.'); return { u, accountId: await accountFor(db, u.id) }; };
  app.get('/api/state', async (req) => { const { accountId } = await ownerAccount(req); const s = await readState(db, accountId); return { revision: s.revision, data: s.data }; });
  app.get('/api/state/meta', async (req) => { const { accountId } = await ownerAccount(req); const s = await readState(db, accountId); return { revision: s.revision, updatedAt: s.updatedAt ?? null }; });
  app.put('/api/state', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { u, accountId } = await ownerAccount(req);
    const b = z.object({ baseRevision: z.number().int().min(0), data: z.unknown() }).parse(req.body);
    const bad = stateProblem(b.data); if (bad) fail(422, bad);
    const r = await writeState(db, accountId, b.baseRevision, b.data as AppState, u.email);
    return { revision: r.revision, merged: r.merged, data: r.merged ? r.data : undefined };
  });

  app.get('/api/account/export', async (req, reply) => {
    const { u, accountId } = await ownerAccount(req);
    const s = await readState(db, accountId);
    const tickets = await db.query('select subject, status, messages, created_at from support_tickets where account_id = $1', [accountId]);
    const log = await db.query('select at, action, detail from audit_log where account_id = $1 or actor_id = $2 order by at desc limit 1000', [accountId, u.id]);
    await db.query(`insert into data_requests (id, account_id, email, kind, status, done_at) values ($1, $2, $3, 'copy', 'done', now())`, [randomUUID(), accountId, u.email]);
    await audit(db, { actor: u.email, actorId: u.id, accountId, scope: 'app', action: 'Data downloaded', ip: ip(req) });
    reply.header('Content-Disposition', `attachment; filename="keyholder-${new Date().toISOString().slice(0, 10)}.json"`);
    return { exported: new Date().toISOString(), account: publicUser(u), data: s.data, revision: s.revision, supportRequests: tickets, activity: log };
  });

  app.delete('/api/account', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { u, accountId } = await ownerAccount(req);
    const b = z.object({ password: z.string().max(200).optional(), email: z.string().max(200).optional() }).parse(req.body ?? {});
    const ok = u.password_hash ? await verifyPassword(b.password ?? '', u.password_hash) : normEmail(b.email ?? '') === normEmail(u.email);
    if (!ok) fail(400, u.password_hash ? 'Your password is not right.' : 'Type your email to confirm.');
    await db.tx((q) => deleteAccount(q, accountId, 'the landlord'));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  // ---------------- Help: a landlord writes to support ----------------
  app.post('/api/support/tickets', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = need(req);
    const b = z.object({ subject: z.string().trim().min(2).max(140), message: z.string().trim().min(2).max(5000), category: z.enum(['question', 'bank', 'billing', 'receipts', 'notices', 'account', 'bug']).default('question') }).parse(req.body);
    const id = `T-${Math.floor(100000 + Math.random() * 900000)}`;
    const accountId = u.role === 'owner' ? await accountFor(db, u.id) : null;
    await db.tx(async (q) => {
      await q.query(`insert into support_tickets (id, account_id, user_id, email, name, subject, category, priority, messages) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [id, accountId, u.id, u.email, u.name, b.subject, b.category, b.category === 'bank' ? 'high' : 'normal',
          JSON.stringify([{ from: 'customer', who: u.name || u.email, at: new Date().toISOString(), text: b.message }])]);
      await queueMail(q, { ...ticketAckMail(u.email, u.name, b.subject), accountId });
      const staff = await q.query<{ email: string }>(`select email from users where role = 'admin' and disabled_at is null limit 5`);
      for (const s of staff) await queueMail(q, newTicketAdminMail(s.email, `${u.name} <${u.email}>`, b.subject, b.message, `${cfg.appUrl}/#/support/inbox`));
      await audit(q, { actor: u.email, actorId: u.id, accountId, scope: 'app', action: 'Support request sent', detail: b.subject, ip: ip(req) });
    });
    return reply.code(201).send({ ok: true });
  });
  app.get('/api/support/tickets', async (req) => {
    const u = need(req);
    const rows = await db.query<{ id: string; subject: string; status: string; created_at: Date; messages: unknown[] }>('select id, subject, status, created_at, messages from support_tickets where user_id = $1 order by created_at desc limit 20', [u.id]);
    return rows.map((r) => ({ id: r.id, subject: r.subject, status: r.status, created: new Date(r.created_at).toISOString(), replies: r.messages.filter((m) => (m as { from: string }).from === 'agent').length }));
  });

  // ---------------- Support dashboard (team only) ----------------
  app.get('/api/admin/support', async (req) => snapshot(db, needStaff(req)));
  app.put('/api/admin/support', async (req) => {
    const me = needStaff(req);
    const b = z.object({ next: z.any(), log: z.object({ action: z.string().max(100), detail: z.string().max(500) }).optional() }).parse(req.body);
    if (!b.next || typeof b.next !== 'object') fail(400, 'Nothing to save.');
    if (me.role === 'support' && b.log && /Role changed|Team member|Account deleted|Reply-time|Province rules/.test(b.log.action)) fail(403, 'Only an owner can do that.');
    const done = await applyChange(db, cfg, me, b.next, b.log, ip(req));
    return { done, snapshot: await snapshot(db, me) };
  });
  app.get('/api/admin/customers/:id/state', async (req) => {
    const me = needStaff(req);
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/.test(id)) fail(404, 'No such account.');
    const data = await customerState(db, id);
    await audit(db, { actor: me.email, actorId: me.id, accountId: id, scope: 'admin', action: 'Viewed landlord account', detail: id.slice(0, 8), ip: ip(req) });
    return { data };
  });
  app.get('/api/admin/email', async (req) => {
    needStaff(req);
    return db.query(`select id, kind, to_email, subject, status, last_error, created_at, sent_at from outbox order by created_at desc limit 200`);
  });

  // ---------------- Local tools (never in production) ----------------
  if (cfg.devTools) {
    app.get('/api/dev/outbox', async (req) => {
      const to = String((req.query as { to?: string }).to ?? '');
      return db.query(`select kind, to_email, subject, text_body, status, created_at from outbox where ($1 = '' or lower(to_email) = lower($1)) order by created_at desc limit 50`, [to]);
    });
  }

  // ---------------- The website and app ----------------
  const dir = staticDir === undefined ? resolve(process.cwd(), 'dist') : staticDir;
  if (dir && existsSync(join(dir, 'index.html'))) {
    await app.register(fstatic, {
      root: dir, wildcard: false, index: ['index.html'],
      setHeaders: (res, path) => res.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    });
  }
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET' || !dir || !existsSync(join(dir, 'index.html'))) return reply.code(404).send({ error: 'Not found.' });
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  });

  return app;
}
