import { useSyncExternalStore } from 'react';
import { embedded } from '../components/ui';

// Talking to the Keyholder server (Stage 2). The same app runs in two ways:
//  • "server": served by the Keyholder server (npm start). Accounts, passwords and data live on the server.
//  • "local": no server answers (the Claude preview, a static host). Everything stays in this browser, as in Stage 1.
// The mode is decided once at start-up, before the first screen is drawn.

export type ServerUser = { id: string; email: string; name: string; role: 'owner' | 'admin' | 'support'; emailVerified: boolean; hasPassword: boolean; google: boolean };
export type ServerConfig = { google: boolean; emailDelivery: boolean; version: string };
export type Conn = { mode: 'local' | 'server'; user: ServerUser | null; config: ServerConfig | null };

let conn: Conn = { mode: 'local', user: null, config: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const getConn = () => conn;
export const serverMode = () => conn.mode === 'server';
export const isStaff = (u: ServerUser | null = conn.user) => !!u && (u.role === 'admin' || u.role === 'support');
export function setUser(user: ServerUser | null) { conn = { ...conn, user }; emit(); }
export function useConn(): Conn {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getConn, getConn);
}

/** Asks the page's own server who is signed in. No answer (or not JSON) means local mode. */
export async function detectServer(timeoutMs = 3000): Promise<Conn> {
  if (embedded || typeof window === 'undefined' || !/^https?:$/.test(location.protocol)) return conn;
  // The Keyholder server marks the page it serves. Static hosts (GitHub Pages, `vite preview`) don't, so
  // the app stays in browser-only mode without making a request. `npm run dev` asks anyway (it proxies /api).
  if (!document.querySelector('meta[name="keyholder-server"]') && !import.meta.env.DEV) return conn;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctl.signal, cache: 'no-store' });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('application/json')) {
      const b = (await r.json()) as { user: ServerUser | null; config: ServerConfig };
      if (b && b.config) conn = { mode: 'server', user: b.user, config: b.config };
    }
  } catch { /* no server: local mode */ } finally { clearTimeout(t); }
  emit();
  return conn;
}

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Calls the API. Errors carry the server's plain-language message. */
export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Keyholder': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Keyholder could not reach the internet. Check your connection and try again.');
  }
  let data: unknown = null;
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) {
    if (r.status === 401 && conn.user) setUser(null);
    throw new ApiError(r.status, (data as { error?: string } | null)?.error ?? 'Something went wrong. Please try again.');
  }
  return data as T;
}

/** Saves a file the server sends (Download my data). */
export async function download(path: string, fallbackName: string) {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'X-Keyholder': '1' } });
  if (!r.ok) throw new ApiError(r.status, 'The download did not work. Please try again.');
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await r.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
