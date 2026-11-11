import type { Cents } from '../data/types';

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const cad0 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

/** $1,650.00 */
export function fmt(c: Cents): string {
  return cad.format(c / 100);
}

/** $1,650 — whole dollars, for prose and big figures. */
export function fmt0(c: Cents): string {
  return cad0.format(Math.round(c / 100));
}

/** Short form for charts and tight spaces: $1.2k, $640k, $1.1M */
export function fmtShort(c: Cents): string {
  const d = c / 100;
  const a = Math.abs(d);
  const s = d < 0 ? '−' : '';
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${s}$${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}k`;
  return `${s}$${Math.round(a)}`;
}

/** Parse what a person types ("1,650", "$1650.5") into cents. Returns NaN when unreadable. */
export function parseMoney(input: string): Cents {
  const cleaned = input.replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '-') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function toInput(c: Cents | undefined): string {
  if (c === undefined || Number.isNaN(c)) return '';
  return (c / 100).toFixed(2).replace(/\.00$/, '');
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}
