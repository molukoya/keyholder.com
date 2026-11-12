import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import type { AppState, BankTxn } from '../src/data/types';
import type { Db, Q } from './db';
import type { Keys } from './keys';
import { readState, writeState } from './services';

// Bank data through Plaid. Keyholder never asks a bank for fresh data (Plaid bills that per request):
// Plaid keeps its own copy of each bank up to date, and tells Keyholder (a webhook) whenever it has new
// transactions; Keyholder then reads them from Plaid's copy with /transactions/sync, which is included
// in Plaid's monthly fee per connected bank. "Check now" in the app does the same read.
// Access tokens are stored encrypted (KEYS_SECRET). Disconnecting removes the connection at Plaid too,
// so Plaid stops billing for it.

export class PlaidError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

type PlaidTxn = { transaction_id: string; account_id: string; amount: number; date: string; authorized_date?: string | null; name?: string; merchant_name?: string | null; pending: boolean };
type PlaidAccount = { account_id: string; name: string; mask: string | null; subtype: string | null; type: string };

export class Plaid {
  private keyCache = new Map<string, { kty: string; crv: string; x: string; y: string }>();
  constructor(private keys: Keys, private fetcher: typeof fetch, private baseOverride?: string) {}

  /** Plaid is set up: its Client ID and secret, and somewhere safe to keep bank access (KEYS_SECRET). */
  ready() { return !!this.keys.get('plaid.clientId') && !!this.keys.get('plaid.secret') && this.keys.canSave; }
  env() { return this.keys.get('plaid.env') === 'production' ? 'production' : 'sandbox'; }
  private base() { return this.baseOverride ?? `https://${this.env()}.plaid.com`; }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const r = await this.fetcher(`${this.base()}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.keys.get('plaid.clientId'), secret: this.keys.get('plaid.secret'), ...body }),
    });
    const j = (await r.json().catch(() => ({}))) as T & { error_code?: string; error_message?: string; display_message?: string | null };
    if (!r.ok) throw new PlaidError(j.error_code ?? 'PLAID_ERROR', j.display_message || j.error_message || `Plaid error ${r.status}`, r.status);
    return j;
  }

  /** A Link token: opens Plaid's bank sign-in in the app. With an access token: "update mode" (sign in again). */
  async linkToken(userId: string, webhook: string, accessToken?: string, redirectUri?: string) {
    const r = await this.call<{ link_token: string }>('/link/token/create', {
      client_name: 'Keyholder', user: { client_user_id: userId }, country_codes: ['CA'], language: 'en', webhook,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      ...(accessToken ? { access_token: accessToken } : { products: ['transactions'], transactions: { days_requested: 90 } }),
    });
    return r.link_token;
  }
  exchange(publicToken: string) { return this.call<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: publicToken }); }
  accounts(accessToken: string) { return this.call<{ accounts: PlaidAccount[]; item: { institution_id?: string | null } }>('/accounts/get', { access_token: accessToken }); }
  remove(accessToken: string) { return this.call('/item/remove', { access_token: accessToken }); }

  /** Everything new since the last read, from Plaid's copy (never a request to the bank). */
  async sync(accessToken: string, cursor: string | null) {
    const added: PlaidTxn[] = [], removed: string[] = [];
    let next = cursor ?? undefined, more = true, rounds = 0;
    while (more && rounds++ < 20) {
      const r = await this.call<{ added: PlaidTxn[]; modified: PlaidTxn[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean }>('/transactions/sync', {
        access_token: accessToken, count: 500, ...(next ? { cursor: next } : {}),
      });
      added.push(...r.added, ...r.modified);
      removed.push(...r.removed.map((x) => x.transaction_id));
      next = r.next_cursor; more = r.has_more;
    }
    return { added, removed, cursor: next ?? null };
  }

  /** Checks that a webhook really comes from Plaid (signed JWT, recent, and for exactly this body). */
  async verifyWebhook(jwt: string | undefined, rawBody: string): Promise<boolean> {
    try {
      if (!jwt) return false;
      const [h, p, s] = jwt.split('.');
      const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as { alg: string; kid: string };
      if (header.alg !== 'ES256' || !header.kid) return false;
      let jwk = this.keyCache.get(header.kid);
      if (!jwk) {
        const r = await this.call<{ key: { kty: string; crv: string; x: string; y: string } }>('/webhook_verification_key/get', { key_id: header.kid });
        jwk = { kty: r.key.kty, crv: r.key.crv, x: r.key.x, y: r.key.y };
        this.keyCache.set(header.kid, jwk);
      }
      const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
      if (!ok) return false;
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as { iat: number; request_body_sha256: string };
      if (Math.abs(Date.now() / 1000 - claims.iat) > 5 * 60) return false;
      return claims.request_body_sha256 === createHash('sha256').update(rawBody).digest('hex');
    } catch { return false; }
  }
}

// ---------------- Connected banks (one row per bank sign-in, "Item" in Plaid's words) ----------------
export type BankItem = { id: string; account_id: string; item_id: string; access_token: string; institution: string; accounts: { id: string; name: string; mask: string | null }[]; cursor: string | null; status: string };

export const itemsFor = (q: Q, accountId: string) => q.query<BankItem>('select * from bank_items where account_id = $1 order by created_at', [accountId]);
export const itemByPlaidId = (q: Q, itemId: string) => q.one<BankItem>('select * from bank_items where item_id = $1', [itemId]);

/** Reads what is new for one bank and writes it into the landlord's data. Returns how many transactions were added. */
export async function syncItem(db: Db, plaid: Plaid, keys: Keys, item: BankItem): Promise<number> {
  const token = keys.decrypt(item.access_token);
  const r = await plaid.sync(token, item.cursor);
  const n = await applyBankUpdate(db, item.account_id, item, r.added, r.removed);
  await db.query(`update bank_items set cursor = $2, status = 'connected', error = null, last_sync = now() where id = $1`, [item.id, r.cursor]);
  return n;
}

/** The landlord's data gets the bank (connected, last update) and its new transactions, as a saved version. */
export async function applyBankUpdate(db: Db, accountId: string, item: Pick<BankItem, 'id' | 'institution' | 'accounts' | 'status'>, added: PlaidTxn[], removed: string[]): Promise<number> {
  const s = await readState(db, accountId);
  if (!s.data) return 0;
  const d = structuredClone(s.data) as AppState;
  d.banks = d.banks ?? [];
  const masks = item.accounts.map((a) => a.mask).filter(Boolean);
  const conn = { id: item.id, via: 'plaid' as const, bank: item.institution, accountMask: masks.length ? `•••• ${masks.join(', ')}` : '', status: item.status === 'needs-reauth' ? 'needs-reauth' as const : 'connected' as const, lastSync: new Date().toISOString() };
  const at = d.banks.findIndex((b) => b.id === item.id);
  if (at >= 0) d.banks[at] = conn; else d.banks.push(conn);
  d.profile.rentArrival = 'bank';
  const have = new Set(d.txns.map((t) => t.id));
  let n = 0;
  for (const t of added) {
    if (t.pending) continue; // only settled transactions (a pending one comes back settled)
    const id = `pl-${t.transaction_id}`;
    if (have.has(id)) continue;
    const txn: BankTxn = { id, source: 'bank', bankId: item.id, date: t.date, amount: Math.round(-t.amount * 100), // Plaid: positive = money out
      payer: String(t.merchant_name || t.name || 'Bank transaction').slice(0, 80), memo: String(t.name ?? '').slice(0, 120), status: 'new' };
    d.txns.push(txn); have.add(id); n++;
  }
  const gone = new Set(removed.map((x) => `pl-${x}`));
  d.txns = d.txns.filter((t) => !(gone.has(t.id) && t.status === 'new')).sort((a, b) => b.date.localeCompare(a.date));
  if (n) d.audit.unshift({ id: randomUUID(), at: new Date().toISOString(), action: 'Bank transactions received', detail: `${item.institution}: ${n} new` });
  await writeState(db, accountId, s.revision, d, 'Plaid');
  return n;
}

/** A bank disconnected: gone from the landlord's data (filed and matched transactions stay). */
export async function dropBankFromState(db: Db, accountId: string, bankId: string) {
  const s = await readState(db, accountId);
  if (!s.data) return;
  const d = structuredClone(s.data) as AppState;
  const b = (d.banks ?? []).find((x) => x.id === bankId);
  d.banks = (d.banks ?? []).filter((x) => x.id !== bankId);
  d.txns = d.txns.filter((t) => !(t.bankId === bankId && t.status === 'new'));
  if (!d.banks.length) d.profile.rentArrival = 'manual';
  if (b) d.audit.unshift({ id: randomUUID(), at: new Date().toISOString(), action: 'Bank disconnected', detail: b.bank });
  await writeState(db, accountId, s.revision, d, 'Plaid');
}
