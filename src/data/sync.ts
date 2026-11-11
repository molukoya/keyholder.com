import { useSyncExternalStore } from 'react';
import type { AppState } from './types';
import { api, ApiError, getConn, serverMode } from './api';
import { defaultProfile, emptyState } from './seed';

// Keeps a signed-in landlord's data on the server (Stage 2).
//
// The app still works on its copy in this browser (fast, and it keeps working offline). Every change is
// saved to the server a moment later. Each save says which version it started from; if another device
// saved in between, the server merges the two (server/merge.ts) and sends back the merged copy.
// Opening the app, coming back to the tab, and every minute, it checks for changes made elsewhere.

const META = 'keyholder:v1:sync';
type Meta = { userId: string; revision: number; dirty: boolean };
export type SyncStatus = { state: 'off' | 'saving' | 'saved' | 'offline' | 'error' | 'signed-out'; at?: number; message?: string };

let get: () => AppState = () => { throw new Error('sync not attached'); };
let set: (s: AppState) => void = () => {};
let toast: (s: string) => void = () => {};
let meta: Meta | null = readMeta();
/** The state object last loaded from or saved to the server. Anything else is a local change. */
let synced: AppState | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
let retryMs = 0;
let status: SyncStatus = { state: 'off' };
const subs = new Set<() => void>();

function readMeta(): Meta | null { try { const r = localStorage.getItem(META); return r ? (JSON.parse(r) as Meta) : null; } catch { return null; } }
function writeMeta(m: Meta | null) { meta = m; try { if (m) localStorage.setItem(META, JSON.stringify(m)); else localStorage.removeItem(META); } catch { /* storage blocked */ } }
function setStatus(s: SyncStatus) { status = s; subs.forEach((f) => f()); }
export const useSyncStatus = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => status, () => status);

export function attach(g: () => AppState, s: (x: AppState) => void, t: (m: string) => void) { get = g; set = s; toast = t; }

/** This browser's data belongs to the signed-in landlord, so it belongs on the server. */
export function owned(s: AppState): boolean {
  const u = getConn().user;
  const a = s.profile.account;
  return serverMode() && !!u && u.role === 'owner' && !s.profile.sample && s.profile.onboarded && !!a && (a.provider === 'email' || a.provider === 'google') && a.email.toLowerCase() === u.email.toLowerCase();
}

const signedInCopy = (d: AppState): AppState => (d.profile.account && !d.profile.account.signedIn ? { ...d, profile: { ...d.profile, account: { ...d.profile.account, signedIn: true } } } : d);
function adopt(d: AppState) { synced = signedInCopy(d); set(synced); }

/** Called on every change of the app's data. */
export function onState(s: AppState) {
  if (s === synced || !owned(s)) return;
  const u = getConn().user!;
  if (!meta || meta.userId !== u.id) writeMeta({ userId: u.id, revision: meta?.userId === u.id ? meta.revision : 0, dirty: true });
  else if (!meta.dirty) writeMeta({ ...meta, dirty: true });
  schedule(800);
}

function schedule(ms: number) { clearTimeout(timer); timer = setTimeout(() => void push(), ms); }

async function push(): Promise<void> {
  if (inFlight) { await inFlight; if (get() === synced) return; }
  const s = get();
  if (!owned(s) || s === synced) return;
  const u = getConn().user!;
  const base = meta?.userId === u.id ? meta.revision : 0;
  setStatus({ state: 'saving' });
  inFlight = (async () => {
    try {
      const r = await api<{ revision: number; merged: boolean; data?: AppState }>('PUT', '/api/state', { baseRevision: base, data: s });
      const changedSince = get() !== s;
      if (r.merged && r.data) {
        if (!changedSince) { adopt(r.data); writeMeta({ userId: u.id, revision: r.revision, dirty: false }); toast('Updated with changes from your other device.'); }
        // Changed again while saving: keep the old starting point, so the next save merges correctly.
      } else {
        if (!changedSince) synced = s;
        writeMeta({ userId: u.id, revision: r.revision, dirty: changedSince });
      }
      retryMs = 0;
      setStatus({ state: 'saved', at: Date.now() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // The sign-in ended (expired, or signed out on another device). Changes stay on this device and are
        // saved after signing in again (the server merges them).
        setStatus({ state: 'signed-out', message: 'Signed out on the server. Sign in again to keep saving.' });
        const cur = get();
        if (cur.profile.account?.signedIn) {
          set({ ...cur, profile: { ...cur.profile, account: { ...cur.profile.account, signedIn: false } } });
          if (typeof window !== 'undefined') window.location.hash = '#/signin?expired=1';
        }
        return;
      }
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) { setStatus({ state: 'error', message: e.message }); return; }
      retryMs = Math.min(60_000, retryMs ? retryMs * 2 : 5000);
      setStatus({ state: 'offline', message: 'Saved on this device. Keyholder will save to your account when you are back online.' });
      schedule(retryMs);
    } finally { inFlight = null; }
    if (get() !== synced && owned(get())) schedule(300);
  })();
  return inFlight;
}

/** Saves anything not saved yet (before signing out). */
export async function flush() {
  clearTimeout(timer);
  if (owned(get()) && get() !== synced) await push().catch(() => {});
  else if (inFlight) await inFlight;
}

/**
 * Loads the signed-in landlord's data. 'loaded': the server's copy is now in the app; 'pushed': the
 * server had nothing and this browser's copy was saved; 'empty': no data anywhere yet (start signup).
 */
export async function hydrate(): Promise<'loaded' | 'pushed' | 'empty'> {
  const u = getConn().user;
  if (!u || u.role !== 'owner') return 'empty';
  // Signing in again on this device: this copy is signed in again too.
  if (owned(get()) && !get().profile.account!.signedIn) set(signedInCopy(get()));
  const local = get();
  const r = await api<{ revision: number; data: AppState | null }>('GET', '/api/state');
  const mine = owned(local) && meta?.userId === u.id;
  if (r.data) {
    if (mine && meta!.dirty) { await push(); return 'loaded'; } // unsaved local changes: the server merges them in
    if (mine && meta!.revision === r.revision) { synced = local; return 'loaded'; }
    adopt(r.data);
    writeMeta({ userId: u.id, revision: r.revision, dirty: false });
    setStatus({ state: 'saved', at: Date.now() });
    return 'loaded';
  }
  if (owned(local)) { writeMeta({ userId: u.id, revision: 0, dirty: true }); await push(); return 'pushed'; }
  return 'empty';
}

/** Checks for changes saved from another device (tab comes back, every minute). */
export async function pull() {
  const u = getConn().user;
  if (!u || u.role !== 'owner' || !owned(get()) || inFlight || meta?.dirty || meta?.userId !== u.id) return;
  try {
    const m = await api<{ revision: number }>('GET', '/api/state/meta');
    if (m.revision > (meta?.revision ?? 0) && !meta?.dirty && !inFlight) await hydrate();
  } catch { /* offline: try again later */ }
}

/** After signing out: forget this landlord's data in the browser (it is safe on the server). */
export function forget(account: NonNullable<AppState['profile']['account']>) {
  clearTimeout(timer);
  writeMeta(null);
  const s = emptyState({ ...defaultProfile(), name: account.name, email: account.email, onboarded: true, account: { ...account, signedIn: false } });
  s.banks = [];
  synced = s;
  set(s);
  setStatus({ state: 'off' });
}

/** The landlord's account is gone (deleted): nothing of it stays in the browser. */
export function wipe() {
  clearTimeout(timer);
  writeMeta(null);
  synced = null;
  setStatus({ state: 'off' });
}

let started = false;
/** Starts the background checks once (focus, visibility, every minute). */
export function startPulling() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const check = () => { if (document.visibilityState === 'visible') void pull(); };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('online', () => { if (owned(get()) && get() !== synced) schedule(200); });
  setInterval(check, 60_000);
}
