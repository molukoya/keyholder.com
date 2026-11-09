import { useSyncExternalStore } from 'react';
import type { ISODate } from '../data/types';
import { daysBetween } from '../lib/dates';
import { generateSupport, SLA_HOURS, type Announcement, type Customer, type Health, type Priority, type SupportBase, type Ticket } from './data';

// The support dashboard's own little store (Stage 1: this browser only). Every admin action is written to
// the audit log. In Stage 2 these become API calls, with the audit log kept on the server.

export type SupportState = SupportBase & { sla: Record<Priority, number> };
const KEY = 'keyholder:support:v1';
/** Announcements are also kept on their own, so the website can show them without loading the rest. */
const ANNOUNCE_KEY = 'keyholder:announcements';
let loaded: SupportState | null = null;
const get = () => (loaded ??= load());
const subs = new Set<() => void>();
let toasts: { id: number; text: string }[] = [];
const toastSubs = new Set<() => void>();
let n = 0;

function load(): SupportState {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as SupportState; } catch { /* fall through */ }
  return { ...generateSupport(), sla: { ...SLA_HOURS } };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(get())); localStorage.setItem(ANNOUNCE_KEY, JSON.stringify(get().announcements)); } catch { /* storage full: keep in memory */ }
}
const emit = () => subs.forEach((f) => f());

export function useSupport(): SupportState {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, get, get);
}
let annCache: { raw: string | null; list: Announcement[] } = { raw: null, list: [] };
function readAnnouncements(): Announcement[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(ANNOUNCE_KEY); } catch { /* blocked */ }
  if (raw !== annCache.raw) { try { annCache = { raw, list: raw ? JSON.parse(raw) : [] }; } catch { annCache = { raw, list: [] }; } }
  return annCache.list;
}
/** Live announcements for the website or the app, without loading the support data. */
export function useAnnouncements(): Announcement[] {
  return useSyncExternalStore((f) => { subs.add(f); window.addEventListener('storage', f); return () => { subs.delete(f); window.removeEventListener('storage', f); }; }, readAnnouncements, readAnnouncements);
}
export function useSupportToasts() {
  return useSyncExternalStore((f) => { toastSubs.add(f); return () => toastSubs.delete(f); }, () => toasts, () => toasts);
}
export function toast(text: string) {
  const id = ++n; toasts = [...toasts.slice(-2), { id, text }]; toastSubs.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); toastSubs.forEach((f) => f()); }, 4200);
}

/** Change the support data. With `log`, the change is recorded in the audit log (who, what, when). */
export function sup(fn: (d: SupportState) => void, log?: { action: string; detail: string }, message?: string) {
  const d = structuredClone(get());
  fn(d);
  if (log) d.audit.unshift({ id: `a${Date.now()}${++n}`, at: new Date().toISOString(), who: 'You', ...log });
  loaded = d; save(); emit();
  if (message) toast(message);
}
export function resetSupport() { loaded = { ...generateSupport(), sla: { ...SLA_HOURS } }; save(); emit(); toast('Sample support data reset.'); }

// ---------------- Derived numbers ----------------
export const live = (s: SupportState) => s.customers.filter((c) => !c.deleted);
export const mrr = (c: Customer) => (c.plan === 'landlord' && !c.deleted ? c.units * 800 : 0);
export const fmtMoney = (cents: number, digits = 0) => (cents / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: digits, maximumFractionDigits: digits });
export const customerOf = (s: SupportState, id: string) => s.customers.find((c) => c.id === id);

/** When a reply is due: the request's time plus the reply-time target for its priority. */
export const dueAt = (s: SupportState, t: Ticket) => Date.parse(t.created) + s.sla[t.priority] * 3600_000;
export function timeLeft(s: SupportState, t: Ticket, now = Date.now()) {
  const ms = dueAt(s, t) - now;
  const h = Math.abs(ms) / 3600_000;
  const text = h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
  return { overdue: ms < 0, soon: ms >= 0 && ms < 2 * 3600_000, text: ms < 0 ? `${text} overdue` : `${text} left` };
}

/** Customer health: at risk if inactive a month, a failed payment or a failing bank; watch if quiet or waiting on us. */
export function health(s: SupportState, c: Customer): Health {
  const quiet = daysBetween(c.lastActive, s.today);
  if (quiet > 30 || c.paymentStatus === 'failed' || c.banks.some((b) => b.status === 'failing')) return 'risk';
  if (quiet > 14 || c.emailBounces > 0 || s.tickets.some((t) => t.customerId === c.id && t.status === 'open')) return 'watch';
  return 'good';
}
export const HEALTH_LABEL: Record<Health, string> = { good: 'Healthy', watch: 'Keep an eye', risk: 'At risk' };

export const within = (d: ISODate, today: ISODate, days: number) => daysBetween(d, today) < days && d <= today;
