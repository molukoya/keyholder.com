import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Config } from './config';
import type { Q } from './db';
import { fieldOf, KEY_FIELDS, SERVICES, type ServiceId, type ServiceState } from '../src/support/connections';

// API keys for the services Keyholder connects to (the list: src/support/connections.ts). They can be set in
// Render (environment variables) or, by the super user, on the dashboard's Connections page. Keys saved on
// the dashboard are stored encrypted (AES-256-GCM, locked with KEYS_SECRET, which stays in Render), are never
// sent back to the browser in full, and take over from Render's. Every change is in the audit log.

export { fieldOf, KEY_FIELDS, SERVICES, type ServiceId } from '../src/support/connections';

type Meta = { last4: string; updatedBy: string; updatedAt: string };

/** The keys in effect: the dashboard's (decrypted) first, then Render's environment variables. */
export class Keys {
  private saved = new Map<string, string>();
  private meta = new Map<string, Meta>();
  private unreadable = new Set<string>();
  private loadedAt = 0;
  constructor(private cfg: Config, private env: Record<string, string | undefined> = cfg.keysEnv) {}

  /** Saving keys on the dashboard needs KEYS_SECRET (set in Render). */
  get canSave() { return !!this.cfg.keysSecret; }

  private key() {
    if (!this.cfg.keysSecret) throw new Error('KEYS_SECRET is not set.');
    return createHash('sha256').update(`keyholder-keys:${this.cfg.keysSecret}`).digest();
  }
  encrypt(text: string) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join('.');
  }
  decrypt(box: string) {
    const [v, iv, tag, data] = box.split('.');
    if (v !== 'v1') throw new Error('unknown format');
    const d = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  }

  /** Reads the saved keys again (at most every 30 seconds unless forced, so other processes catch up). */
  async refresh(q: Q, force = false) {
    if (!force && Date.now() - this.loadedAt < 30_000) return;
    const rows = await q.query<{ name: string; ciphertext: string; last4: string; updated_by: string; updated_at: Date }>('select name, ciphertext, last4, updated_by, updated_at from secrets');
    const saved = new Map<string, string>(); const meta = new Map<string, Meta>(); const bad = new Set<string>();
    for (const r of rows) {
      meta.set(r.name, { last4: r.last4, updatedBy: r.updated_by, updatedAt: new Date(r.updated_at).toISOString() });
      try { if (this.cfg.keysSecret) saved.set(r.name, this.decrypt(r.ciphertext)); else bad.add(r.name); } catch { bad.add(r.name); }
    }
    this.saved = saved; this.meta = meta; this.unreadable = bad; this.loadedAt = Date.now();
  }

  envValue(name: string) { const f = fieldOf(name); const v = f ? this.env[f.env] : undefined; return v && v.trim() ? v.trim() : undefined; }
  get(name: string): string | undefined { return this.saved.get(name) ?? this.envValue(name); }
  source(name: string): 'dashboard' | 'render' | 'none' { return this.saved.has(name) ? 'dashboard' : this.envValue(name) ? 'render' : 'none'; }

  /** Google sign-in, when both halves are set. */
  google() { const clientId = this.get('google.clientId'), clientSecret = this.get('google.clientSecret'); return clientId && clientSecret ? { clientId, clientSecret } : undefined; }
  /** Google Places (address lookup), when its key is set. */
  places() { return this.get('places.apiKey'); }
  /** How each service stands, for the Connections page. */
  state(id: ServiceId): ServiceState {
    const has = (n: string) => !!this.get(n);
    if (id === 'google') return this.google() ? 'connected' : 'none';
    if (id === 'email') return this.email().provider !== 'log' ? 'connected' : has('email.resendKey') || has('email.postmarkToken') ? 'off' : 'none';
    if (id === 'places') return has('places.apiKey') ? 'connected' : 'none';
    if (id === 'stripe') return has('stripe.secretKey') && has('stripe.publishableKey') ? 'saved' : 'none';
    if (id === 'plaid') return has('plaid.clientId') && has('plaid.secret') ? 'saved' : 'none';
    return has('avm.provider') && has('avm.apiKey') ? 'saved' : 'none';
  }
  /** How email is sent right now. A provider without its key falls back to keeping emails in the outbox. */
  email(): Config['email'] {
    const provider = (this.get('email.provider') ?? 'log') as Config['email']['provider'];
    const resendKey = this.get('email.resendKey'), postmarkToken = this.get('email.postmarkToken');
    const ok = provider === 'resend' ? !!resendKey : provider === 'postmark' ? !!postmarkToken : provider === 'log';
    return { provider: ok ? provider : 'log', from: this.get('email.from') ?? this.cfg.email.from, resendKey, postmarkToken };
  }

  /** What the Connections page shows: never a secret in full. */
  describe() {
    return SERVICES.map((s) => ({
      ...s,
      state: this.state(s.id),
      fields: KEY_FIELDS.filter((f) => f.service === s.id).map((f) => {
        const source = this.unreadable.has(f.name) ? 'unreadable' as const : this.source(f.name);
        const value = this.get(f.name);
        const m = this.meta.get(f.name);
        return {
          name: f.name, label: f.label, secret: f.secret, options: f.options, hint: f.hint, env: f.env, optional: f.optional, source,
          value: !f.secret && value ? value : undefined,
          last4: f.secret && value ? value.slice(-4) : undefined,
          updatedAt: source === 'dashboard' ? m?.updatedAt : undefined, updatedBy: source === 'dashboard' ? m?.updatedBy : undefined,
        };
      }),
    }));
  }

  /** Saves (or, with an empty value, removes) keys. Returns the audit lines. */
  async save(q: Q, values: Record<string, string | null>, by: string): Promise<string[]> {
    const lines: string[] = [];
    for (const [name, raw] of Object.entries(values)) {
      const f = fieldOf(name); if (!f) continue;
      const v = (raw ?? '').trim();
      if (!v) { await q.query('delete from secrets where name = $1', [name]); lines.push(`${f.service}: ${f.label} removed (Render's value is used, if set)`); continue; }
      const last4 = f.secret ? v.slice(-4) : '';
      await q.query(`insert into secrets (name, ciphertext, last4, updated_by) values ($1, $2, $3, $4)
        on conflict (name) do update set ciphertext = excluded.ciphertext, last4 = excluded.last4, updated_by = excluded.updated_by, updated_at = now()`, [name, this.encrypt(v), last4, by]);
      lines.push(`${f.service}: ${f.label} ${f.secret ? `changed (…${last4})` : `set to ${v.slice(0, 80)}`}`);
    }
    this.loadedAt = 0;
    return lines;
  }

  /** Checks a service with the keys in effect, without changing anything. */
  async test(service: ServiceId, fetcher: typeof fetch, appUrl: string): Promise<{ ok: boolean | null; message: string }> {
    try {
      if (service === 'google') {
        const g = this.google(); if (!g) return { ok: false, message: 'Not set: add the Client ID and Client secret.' };
        // A made-up code: Google answers "invalid_grant" when the client is right and "invalid_client" when not.
        const r = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: 'keyholder-test', client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: `${appUrl}/api/auth/google/callback`, grant_type: 'authorization_code' }) });
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        if (b.error === 'invalid_client' || b.error === 'unauthorized_client') return { ok: false, message: 'Google does not accept this Client ID and secret.' };
        return { ok: true, message: 'Google accepts these keys. Check that the redirect URI in Google Cloud is ' + `${appUrl}/api/auth/google/callback.` };
      }
      if (service === 'email') {
        const e = this.email();
        if (e.provider === 'log') return { ok: true, message: 'Sending is off: emails are kept in the outbox, not sent.' };
        if (e.provider === 'resend') {
          const r = await fetcher('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${e.resendKey}` } });
          if (!r.ok) return { ok: false, message: `Resend does not accept this key (${r.status}).` };
          const domains = ((await r.json()) as { data?: { name: string; status: string }[] }).data ?? [];
          const fromDomain = /@([^>\s]+)/.exec(e.from)?.[1]?.toLowerCase();
          const d = domains.find((x) => x.name.toLowerCase() === fromDomain);
          return d && d.status === 'verified' ? { ok: true, message: `Resend accepts the key and ${d.name} is verified.` } : { ok: false, message: `Resend accepts the key, but ${fromDomain ?? 'the From domain'} is not verified there yet.` };
        }
        const r = await fetcher('https://api.postmarkapp.com/server', { headers: { 'X-Postmark-Server-Token': e.postmarkToken!, Accept: 'application/json' } });
        return r.ok ? { ok: true, message: 'Postmark accepts this token.' } : { ok: false, message: `Postmark does not accept this token (${r.status}).` };
      }
      if (service === 'stripe') {
        const key = this.get('stripe.secretKey'); if (!key) return { ok: false, message: 'Not set: add the Secret key.' };
        const r = await fetcher('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${key}` } });
        const mode = key.includes('_test_') ? 'test mode' : 'live mode';
        return r.ok ? { ok: true, message: `Stripe accepts the secret key (${mode}).` } : { ok: false, message: `Stripe does not accept this key (${r.status}).` };
      }
      if (service === 'places') {
        const key = this.places(); if (!key) return { ok: false, message: 'Not set: add the API key.' };
        const r = await fetcher('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
          body: JSON.stringify({ input: '100 Queen St W, Toronto', includedRegionCodes: ['ca'] }) });
        if (r.ok) return { ok: true, message: 'Google accepts this key: address suggestions are on.' };
        const b = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
        return { ok: false, message: `Google does not accept this key (${r.status}). ${b.error?.message ?? 'Check that "Places API (New)" is turned on and the key is allowed to use it.'}`.trim() };
      }
      if (service === 'plaid') {
        const id = this.get('plaid.clientId'), secret = this.get('plaid.secret'), env = this.get('plaid.env') === 'production' ? 'production' : 'sandbox';
        if (!id || !secret) return { ok: false, message: 'Not set: add the Client ID and Secret.' };
        // Lists one Canadian bank: works with any valid keys, changes nothing.
        const r = await fetcher(`https://${env}.plaid.com/institutions/get`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: id, secret, count: 1, offset: 0, country_codes: ['CA'] }) });
        return r.ok ? { ok: true, message: `Plaid accepts these keys (${env}).` } : { ok: false, message: `Plaid does not accept these keys (${r.status}). Check that the secret matches the environment.` };
      }
      if (this.state('avm') === 'none') return { ok: false, message: 'Not set: choose a provider and add its API key.' };
      return { ok: null, message: 'Saved. These keys are checked once property values are connected.' };
    } catch (e) {
      return { ok: false, message: `Could not reach the service: ${(e as Error).message}` };
    }
  }
}
