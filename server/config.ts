import { z } from 'zod';

// Every setting comes from environment variables, with safe defaults for running on a laptop.
// Production (Render) sets them in render.yaml or the dashboard. See docs/BACKEND.md for the full list.

const bool = (def: boolean) => z.string().optional().transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase())));

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  /** Public address of the site, used in email links and to check where requests come from. */
  APP_URL: z.string().url().optional(),
  /** Postgres connection string. Without it the server uses an embedded Postgres (PGlite) on disk. */
  DATABASE_URL: z.string().optional(),
  /** Where the embedded Postgres keeps its files; "memory://" keeps nothing (tests). */
  PGLITE_DIR: z.string().default('./.data/pglite'),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  /** "log" keeps emails in the outbox only (shown in the support dashboard); "resend" or "postmark" sends them. */
  EMAIL_PROVIDER: z.enum(['log', 'resend', 'postmark']).default('log'),
  EMAIL_FROM: z.string().default('Keyholder <hello@keyholder.ca>'),
  RESEND_API_KEY: z.string().optional(),
  POSTMARK_TOKEN: z.string().optional(),
  /** The first admin. Created (or promoted) at start-up when both are set. */
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(10).optional(),
  ADMIN_NAME: z.string().default('Keyholder Admin'),
  /** test / test (demo) and admin / admin (sample support dashboard) on the Sign in form. Sample data only. */
  PREVIEW_LOGINS: bool(true),
  /** Lets local tools read sent emails at /api/dev/outbox. Never on in production. */
  DEV_TOOLS: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** "inline" runs the email sender and daily jobs inside the web process; "off" leaves them to `npm run worker`. */
  WORKER: z.enum(['inline', 'off']).default('inline'),
  /** Hour of the day (server time zone) for reminders and the daily summary email. */
  DAILY_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  TRUST_PROXY: bool(false),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const e = Env.parse(env);
  const production = e.NODE_ENV === 'production';
  const appUrl = (e.APP_URL ?? `http://localhost:${e.PORT}`).replace(/\/$/, '');
  if (production && e.DEV_TOOLS === 'on') throw new Error('DEV_TOOLS cannot be on in production.');
  if (e.EMAIL_PROVIDER === 'resend' && !e.RESEND_API_KEY) throw new Error('EMAIL_PROVIDER=resend needs RESEND_API_KEY.');
  if (e.EMAIL_PROVIDER === 'postmark' && !e.POSTMARK_TOKEN) throw new Error('EMAIL_PROVIDER=postmark needs POSTMARK_TOKEN.');
  return {
    production,
    port: e.PORT,
    host: e.HOST,
    appUrl,
    /** Secure cookies whenever the site is served over https. */
    cookieSecure: appUrl.startsWith('https://'),
    databaseUrl: e.DATABASE_URL || undefined,
    pgliteDir: e.PGLITE_DIR,
    sessionDays: e.SESSION_DAYS,
    email: { provider: e.EMAIL_PROVIDER, from: e.EMAIL_FROM, resendKey: e.RESEND_API_KEY, postmarkToken: e.POSTMARK_TOKEN },
    admin: e.ADMIN_EMAIL && e.ADMIN_PASSWORD ? { email: e.ADMIN_EMAIL, password: e.ADMIN_PASSWORD, name: e.ADMIN_NAME } : undefined,
    previewLogins: e.PREVIEW_LOGINS,
    devTools: e.DEV_TOOLS ? e.DEV_TOOLS === 'on' : !production,
    google: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } : undefined,
    worker: e.WORKER,
    dailyHour: e.DAILY_HOUR,
    trustProxy: e.TRUST_PROXY || production,
    logLevel: e.LOG_LEVEL,
  };
}
