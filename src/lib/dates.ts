import type { ISODate, Period } from '../data/types';

// All dates are calendar dates (no time zone drift): we work in local YYYY-MM-DD strings.

export function todayISO(now = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function toISO(d: Date): ISODate {
  return todayISO(d);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISO(d);
  x.setDate(x.getDate() + n);
  return toISO(x);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = parseISO(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return toISO(x);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

export function periodOf(d: ISODate): Period {
  return d.slice(0, 7);
}

export function addPeriods(p: Period, n: number): Period {
  return periodOf(addMonths(`${p}-01`, n));
}

export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  let p = from;
  let guard = 0;
  while (p <= to && guard++ < 600) {
    out.push(p);
    p = addPeriods(p, 1);
  }
  return out;
}

/** Due date for a period given the lease's due day (clamped to month length). */
export function dueDate(p: Period, dueDay: number): ISODate {
  const [y, m] = p.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${p}-${String(Math.min(dueDay, last)).padStart(2, '0')}`;
}

const monthLong = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('en-CA', { month: 'short' });
const dayFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' });
const fullFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
const weekday = new Intl.DateTimeFormat('en-CA', { weekday: 'short' });

export const fmtPeriod = (p: Period) => monthLong.format(parseISO(`${p}-01`));
export const fmtMonthShort = (p: Period) => monthShort.format(parseISO(`${p}-01`));
export const fmtDay = (d: ISODate) => dayFmt.format(parseISO(d));
export const fmtDate = (d: ISODate) => fullFmt.format(parseISO(d));
export const fmtWeekday = (d: ISODate) => weekday.format(parseISO(d));

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

export function yearOf(d: ISODate): number {
  return Number(d.slice(0, 4));
}

/** Fractional years between two dates. */
export function yearsBetween(a: ISODate, b: ISODate): number {
  return daysBetween(a, b) / 365.25;
}
