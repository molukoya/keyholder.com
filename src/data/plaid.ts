import { api } from './api';

// Plaid's bank sign-in window (Plaid Link), loaded from Plaid only when a landlord connects a bank.
// The landlord signs in at their bank inside Plaid's window; Keyholder never sees the bank password.

type Handler = { open: () => void; destroy: () => void };
type PlaidGlobal = { create: (o: { token: string; onSuccess: (publicToken: string, meta: { institution?: { name?: string; institution_id?: string } | null }) => void; onExit: (err: { display_message?: string; error_message?: string } | null) => void }) => Handler };
declare global { interface Window { Plaid?: PlaidGlobal } }

let loading: Promise<PlaidGlobal> | null = null;
function loadLink(): Promise<PlaidGlobal> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.async = true;
    s.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error('The bank window did not load.')));
    s.onerror = () => { loading = null; reject(new Error('The bank window did not load. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Connect a bank (or, with itemId, sign in again to one). Resolves with the bank's name when done, or null if
 * the landlord closed the window.
 */
export async function connectWithPlaid(itemId?: string): Promise<{ bank: string; added: number } | null> {
  const [{ linkToken }, Plaid] = await Promise.all([api<{ linkToken: string }>('POST', '/api/bank/link-token', itemId ? { itemId } : {}), loadLink()]);
  return new Promise((resolve, reject) => {
    const h = Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, meta) => {
        h.destroy();
        // Signing in again keeps the same connection: just read what is new.
        if (itemId) { api<{ added: number }>('POST', '/api/bank/sync').then((r) => resolve({ bank: meta.institution?.name ?? 'Your bank', added: r.added }), reject); return; }
        api<{ bank: string; added: number }>('POST', '/api/bank/exchange', { publicToken, institution: meta.institution ?? null }).then(resolve, reject);
      },
      onExit: (err) => { h.destroy(); if (err) reject(new Error(err.display_message || err.error_message || 'The bank sign-in did not finish.')); else resolve(null); },
    });
    h.open();
  });
}
