import type { AppState, Cents, ISODate, Property, Unit } from '../data/types';
import { addMonths } from './dates';
import { indexEstimate, owedAt, propertyValue, worthIt } from './finance';
import { RETURN_PRESETS, regionData } from './jurisdiction';

// Silver: "know what it's worth and what it could do for you". Everything here needs the purchase price.
// All figures are estimates for guidance, not offers or advice.

export const SELLING_COST_PCT = 5;
export const LENDER_MAX_LTV = 80;

/** Value since purchase: the purchase, each year end, and today. */
export function valueHistory(state: AppState, p: Property, today: ISODate): { date: ISODate; value: Cents }[] {
  if (!p.purchaseDate || !p.purchasePrice) return [];
  const out = [{ date: p.purchaseDate, value: p.purchasePrice }];
  for (let y = Number(p.purchaseDate.slice(0, 4)); y < Number(today.slice(0, 4)); y++) {
    const d = `${y}-12-31`;
    if (d > p.purchaseDate) out.push({ date: d, value: indexEstimate(p, d)?.likely ?? p.purchasePrice });
  }
  out.push({ date: today, value: propertyValue(state, p, today).value });
  return out;
}

export function gainSincePurchase(state: AppState, p: Property, today: ISODate) {
  if (!p.purchasePrice) return null;
  const value = propertyValue(state, p, today).value;
  return { value, paid: p.purchasePrice, gain: value - p.purchasePrice, pct: ((value - p.purchasePrice) / p.purchasePrice) * 100 };
}

/** Change in estimated value over the last month (from the local price index). */
export function monthChange(state: AppState, p: Property, today: ISODate): Cents | null {
  const now = indexEstimate(p, today), then = indexEstimate(p, addMonths(today, -1));
  if (!now || !then) return null;
  const v = propertyValue(state, p, today).value;
  return Math.round(v * (1 - then.likely / now.likely));
}

/** The property's return compared with savings, a GIC and a stock fund. */
export function returnComparison(state: AppState, p: Property, today: ISODate) {
  const w = worthIt(state, today, { propertyId: p.id });
  return {
    yours: w.returnPct,
    rows: [
      { label: RETURN_PRESETS.labels[0], pct: RETURN_PRESETS.low },
      { label: RETURN_PRESETS.labels[1], pct: RETURN_PRESETS.typical },
      { label: RETURN_PRESETS.labels[2], pct: RETURN_PRESETS.high },
    ],
    source: RETURN_PRESETS.source,
  };
}

/** Typical rent for a unit like this nearby, and how far the current rent is from it. */
export function rentVsMarket(p: Property, u: Unit) {
  const r = regionData(p.province, p.city).marketRent;
  const beds = Math.max(0, Math.min(3, u.bedrooms)) as 0 | 1 | 2 | 3;
  const market = r[beds];
  return { market, gap: market - u.rent, source: r.source, asOf: r.asOf, fallback: regionData(p.province, p.city).fallback };
}

/** Rough room to borrow against the property: 80% of value minus what is owed. Null if what is owed is unknown. */
export function borrowingRoom(state: AppState, p: Property, today: ISODate): Cents | null {
  const o = owedAt(state, p, today, today);
  if (!o.known) return null;
  const value = propertyValue(state, p, today).value;
  return Math.max(0, Math.round((value * LENDER_MAX_LTV) / 100) - o.owed);
}

/** Rough cash after selling: value minus selling costs minus what is owed. Gold gives the exact figure with tax. */
export function roughSale(state: AppState, p: Property, today: ISODate): { value: Cents; costs: Cents; owed: Cents; net: Cents } | null {
  const o = owedAt(state, p, today, today);
  if (!o.known) return null;
  const value = propertyValue(state, p, today).value;
  const costs = Math.round((value * SELLING_COST_PCT) / 100);
  return { value, costs, owed: o.owed, net: value - costs - o.owed };
}
