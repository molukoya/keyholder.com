import type {
  AppState, Cents, Comparable, Expense, ISODate, Lease, Mortgage, MortgageFrequency, Payment, Period,
  Property, Unit, Valuation,
} from '../data/types';
import { addDays, addMonths, daysBetween, dueDate, periodOf, periodRange, yearsBetween } from './dates';
import { CATEGORIES, CCA_CLASSES, RETURN_PRESETS, regionData } from './jurisdiction';
import { hasGold } from './levels';

// =====================================================================================
// Rental share (PS-5, PS-6)
// =====================================================================================

/** Portion of an expense that counts towards the rental, in cents. */
export function rentalPortion(e: Pick<Expense, 'amount' | 'scope'>, rentalSharePct: number): Cents {
  if (e.scope === 'personal') return 0;
  if (e.scope === 'direct') return e.amount;
  return Math.round((e.amount * clamp(rentalSharePct, 0, 100)) / 100);
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// =====================================================================================
// Rent ledger (RL-1, RL-2)
// =====================================================================================

export type ChargeState = 'upcoming' | 'due' | 'late' | 'partial' | 'paid';

export interface LedgerLine {
  period: Period;
  due: ISODate;
  charge: Cents;
  paid: Cents;
  payments: Payment[];
  state: ChargeState;
  daysLate: number;
  /** Running balance owed after this period (positive = tenant owes). */
  balance: Cents;
}

/** Periods the lease charges for, from its start through `through` (inclusive). */
export function leasePeriods(lease: Lease, through: Period): Period[] {
  const last = lease.end && periodOf(lease.end) < through ? periodOf(lease.end) : through;
  return periodRange(periodOf(lease.start), last);
}

export function chargeState(charge: Cents, paid: Cents, due: ISODate, today: ISODate): { state: ChargeState; daysLate: number } {
  if (paid >= charge) return { state: 'paid', daysLate: 0 };
  const d = daysBetween(due, today);
  if (d < 0) return { state: paid > 0 ? 'partial' : 'upcoming', daysLate: 0 };
  if (d === 0) return { state: paid > 0 ? 'partial' : 'due', daysLate: 0 };
  // Legally late the day after it is due (AR-4).
  return { state: paid > 0 ? 'partial' : 'late', daysLate: d };
}

export function leaseLedger(lease: Lease, payments: Payment[], today: ISODate, through?: Period): LedgerLine[] {
  const live = payments.filter((p) => p.leaseId === lease.id && !p.voided);
  const end = through ?? periodOf(today);
  let balance = 0;
  return leasePeriods(lease, end).map((period) => {
    const due = dueDate(period, lease.dueDay);
    const ps = live.filter((p) => p.period === period).sort((a, b) => a.date.localeCompare(b.date));
    const paid = ps.reduce((a, p) => a + p.amount, 0);
    balance += lease.rent - paid;
    const { state, daysLate } = chargeState(lease.rent, paid, due, today);
    return { period, due, charge: lease.rent, paid, payments: ps, state, daysLate, balance };
  });
}

export function leaseBalance(lease: Lease, payments: Payment[], today: ISODate): Cents {
  // Only charges that have come due count toward what is owed.
  const lines = leaseLedger(lease, payments, today).filter((l) => l.due <= today);
  return lines.reduce((a, l) => a + l.charge - l.paid, 0);
}

/** The lease running on a unit (or starting within 60 days). For a unit rented by the room: the first room's. */
export function activeLease(state: AppState, unitId: string, today: ISODate): Lease | undefined {
  return activeLeases(state, unitId, today)[0];
}

/**
 * Every lease running on a unit: one for a unit rented as a whole (however many people share it),
 * or one per rented room, in room order, for a unit rented by the room.
 */
export function activeLeases(state: AppState, unitId: string, today: ISODate): Lease[] {
  const running = state.leases
    .filter((l) => l.unitId === unitId && l.start <= addDays(today, 60) && (!l.end || l.end >= today))
    .sort((a, b) => b.start.localeCompare(a.start));
  const unit = state.units.find((u) => u.id === unitId);
  if (unit?.rentedBy !== 'room') return running.slice(0, 1);
  const seen = new Set<string>();
  return running
    .filter((l) => { const k = l.room ?? ''; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.room ?? '').localeCompare(b.room ?? '', undefined, { numeric: true }));
}

/** Every lease running now, across all units (each rented room is its own lease). */
export function currentLeases(state: AppState, today: ISODate): Lease[] {
  return state.units.flatMap((u) => activeLeases(state, u.id, today));
}

export const byRoom = (u: Unit | undefined) => u?.rentedBy === 'room';

/** "Room 1", "Room 2"... for a unit rented by the room; none for a unit rented as a whole. */
export function roomLabels(u: Unit): string[] {
  return byRoom(u) ? Array.from({ length: Math.max(1, u.rooms ?? 1) }, (_, i) => `Room ${i + 1}`) : [];
}

/** Rooms nobody rents yet, in a unit rented by the room. */
export function openRooms(state: AppState, unit: Unit, today: ISODate): string[] {
  const taken = new Set(activeLeases(state, unit.id, today).map((l) => l.room));
  return roomLabels(unit).filter((r) => !taken.has(r));
}

/** Room for a new tenant: an empty unit, or a room still free. */
export function hasSpace(state: AppState, unit: Unit, today: ISODate): boolean {
  return byRoom(unit) ? openRooms(state, unit, today).length > 0 : !activeLease(state, unit.id, today);
}

/** "2 of 3 rooms rented", for a unit rented by the room. */
export function roomsLine(state: AppState, unit: Unit, today: ISODate): string {
  const n = roomLabels(unit).length;
  return `${n - openRooms(state, unit, today).length} of ${n} room${n === 1 ? '' : 's'} rented`;
}

/** Where a lease is: "Unit B", or "Unit Basement · Room 2" for a room. */
export function leasePlace(unit: Unit | undefined, lease?: Lease): string {
  if (!unit) return '';
  return `Unit ${unit.label}${lease?.room ? ` · ${lease.room}` : ''}`;
}

// =====================================================================================
// Mortgage (PS-2) — Canadian fixed-rate mortgages compound semi-annually.
// =====================================================================================

export const PERIODS_PER_YEAR: Record<MortgageFrequency, number> = { monthly: 12, 'semi-monthly': 24, biweekly: 26, weekly: 52 };

export function periodicRate(annualPct: number, perYear: number): number {
  return Math.pow(1 + annualPct / 200, 2 / perYear) - 1;
}

export function mortgagePayment(principal: Cents, annualPct: number, amortYears: number, freq: MortgageFrequency): Cents {
  const n = PERIODS_PER_YEAR[freq];
  const i = periodicRate(annualPct, n);
  const N = amortYears * n;
  if (i === 0) return Math.round(principal / N);
  return Math.round((principal * i) / (1 - Math.pow(1 + i, -N)));
}

export interface AmortRow { n: number; date: ISODate; payment: Cents; interest: Cents; principal: Cents; balance: Cents }

function paymentDate(start: ISODate, k: number, freq: MortgageFrequency): ISODate {
  switch (freq) {
    case 'monthly': return addMonths(start, k);
    case 'semi-monthly': return k % 2 === 0 ? addMonths(start, k / 2) : addDays(addMonths(start, (k - 1) / 2), 15);
    case 'biweekly': return addDays(start, 14 * k);
    case 'weekly': return addDays(start, 7 * k);
  }
}

export function amortization(m: Mortgage): AmortRow[] {
  const n = PERIODS_PER_YEAR[m.frequency];
  const i = periodicRate(m.ratePct, n);
  const pay = m.paymentOverride ?? mortgagePayment(m.principal, m.ratePct, m.amortYears, m.frequency);
  const rows: AmortRow[] = [];
  let bal = m.principal;
  const extras = [...(m.prepayments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  let prevDate = m.startDate;
  for (let k = 1; bal > 0 && k <= m.amortYears * n + 1; k++) {
    // Extra payments made since the last regular payment go straight to principal.
    const date = paymentDate(m.startDate, k, m.frequency);
    for (const x of extras) if (x.date > prevDate && x.date <= date) bal = Math.max(0, bal - x.amount);
    prevDate = date;
    if (bal <= 0) break;
    const interest = Math.round(bal * i);
    let principal = pay - interest;
    if (principal <= 0) break; // payment does not cover interest; schedule never ends
    if (principal > bal) principal = bal;
    bal -= principal;
    rows.push({ n: k, date, payment: interest + principal, interest, principal, balance: bal });
  }
  return rows;
}

export function mortgageBalanceAt(m: Mortgage, date: ISODate, rows = amortization(m)): Cents {
  if (date < m.startDate) return 0;
  let bal = m.principal;
  for (const r of rows) {
    if (r.date > date) break;
    bal = r.balance;
  }
  return bal;
}

export function mortgagePaidBetween(m: Mortgage, from: ISODate, to: ISODate, rows = amortization(m)) {
  let interest = 0, principal = 0, count = 0;
  for (const r of rows) {
    if (r.date < from) continue;
    if (r.date > to) break;
    interest += r.interest; principal += r.principal; count++;
  }
  return { interest, principal, payment: interest + principal, count };
}

// =====================================================================================
// Running picture (FP-1, PRD 7.10)
// =====================================================================================

export interface Picture {
  from: ISODate; to: ISODate;
  rentCollected: Cents;
  rentExpected: Cents;
  arrearsLoss: Cents;
  vacancyLoss: Cents;
  opex: Cents;
  noi: Cents;
  mortgageInterest: Cents;
  mortgagePrincipal: Cents;
  capital: Cents;
  kept: Cents;
  /** "You keep $X of every $1,000 of rent" */
  keptPer1000: number;
  expenseRatio: number;
  hasMortgageData: boolean;
  /** True when a Silver property's rough monthly payment was used (no interest/principal split). */
  mortgageIsRough: boolean;
}

export function picture(state: AppState, from: ISODate, to: ISODate, opts: { propertyId?: string } = {}): Picture {
  const props = state.properties.filter((p) => !p.archived && (!opts.propertyId || p.id === opts.propertyId));
  const propIds = new Set(props.map((p) => p.id));
  const units = state.units.filter((u) => propIds.has(u.propertyId));
  const unitIds = new Set(units.map((u) => u.id));
  const leases = state.leases.filter((l) => unitIds.has(l.unitId));
  const leaseIds = new Set(leases.map((l) => l.id));

  const rentCollected = state.payments
    .filter((p) => !p.voided && leaseIds.has(p.leaseId) && p.date >= from && p.date <= to)
    .reduce((a, p) => a + p.amount, 0);

  // Expected rent = charges falling due inside the window.
  let rentExpected = 0;
  let paidForThose = 0;
  for (const l of leases) {
    for (const line of leaseLedger(l, state.payments, to, periodOf(to))) {
      if (line.due >= from && line.due <= to) { rentExpected += line.charge; paidForThose += Math.min(line.paid, line.charge); }
    }
  }
  const arrearsLoss = Math.max(0, rentExpected - paidForThose);

  // Vacancy: months inside the window where a unit had no lease covering it.
  let vacancyLoss = 0;
  for (const u of units) {
    for (const p of periodRange(periodOf(from), periodOf(to))) {
      const d = dueDate(p, 1);
      const covered = state.leases.some((l) => l.unitId === u.id && periodOf(l.start) <= p && (!l.end || periodOf(l.end) >= p));
      if (!covered && d >= from && d <= to && u.status !== 'occupied') vacancyLoss += u.rent;
    }
  }

  let opex = 0, capital = 0;
  for (const e of state.expenses) {
    if (!propIds.has(e.propertyId) || e.date < from || e.date > to) continue;
    const prop = props.find((p) => p.id === e.propertyId)!;
    const portion = rentalPortion(e, prop.rentalSharePct);
    if (e.kind === 'capital') capital += portion; else opex += portion;
  }

  // Mortgage: the full record when there is one (Gold), else the rough monthly payment (Silver), else nothing.
  let mortgageInterest = 0, mortgagePrincipal = 0, hasMortgageData = false, mortgageIsRough = false;
  const months = Math.max(0, periodRange(periodOf(from), periodOf(to)).length);
  for (const prop of props) {
    const m = state.mortgages.find((x) => x.propertyId === prop.id);
    if (m) {
      hasMortgageData = true;
      const paid = mortgagePaidBetween(m, from, to);
      mortgageInterest += Math.round((paid.interest * prop.rentalSharePct) / 100);
      mortgagePrincipal += Math.round((paid.principal * prop.rentalSharePct) / 100);
    } else if (prop.approxMortgagePayment) {
      hasMortgageData = true; mortgageIsRough = true;
      mortgageInterest += Math.round((prop.approxMortgagePayment * months * prop.rentalSharePct) / 100);
    }
  }

  const noi = rentCollected - opex;
  const kept = noi - mortgageInterest - mortgagePrincipal - capital;
  return {
    from, to, rentCollected, rentExpected, arrearsLoss, vacancyLoss, opex, noi,
    mortgageInterest, mortgagePrincipal, capital, kept, hasMortgageData, mortgageIsRough,
    keptPer1000: rentCollected > 0 ? Math.round((kept / rentCollected) * 1000) : 0,
    expenseRatio: rentCollected > 0 ? (opex / rentCollected) * 100 : 0,
  };
}

// =====================================================================================
// Valuation (Silver) — never a falsely precise number (VA-3)
// =====================================================================================

/** Estimate value from the purchase price and a regional price index (open data). */
export function indexEstimate(prop: Property, today: ISODate): Omit<Valuation, 'id' | 'propertyId'> | null {
  if (!prop.purchasePrice || !prop.purchaseDate) return null;
  const r = regionData(prop.province, prop.city);
  const h = Math.max(0, yearsBetween(prop.purchaseDate, today));
  // Most recent year at the 1-year rate, years 2–5 at the 5-year rate, older years at the 10-year rate.
  const g =
    Math.pow(1 + r.priceGrowth.y1 / 100, Math.min(h, 1)) *
    Math.pow(1 + r.priceGrowth.y5 / 100, clamp(h - 1, 0, 4)) *
    Math.pow(1 + r.priceGrowth.y10 / 100, Math.max(h - 5, 0));
  const likely = Math.round(prop.purchasePrice * g);
  const spread = r.fallback ? 0.12 : 0.08;
  return {
    date: today, source: 'index', likely,
    low: Math.round(likely * (1 - spread)), high: Math.round(likely * (1 + spread)),
    confidence: r.fallback ? 'low' : 'medium',
    note: `${r.priceGrowth.source}${r.fallback ? ' (national fallback — no city data)' : ''}`,
  };
}

/** Estimate from owner-entered comparable sales, adjusted for similarity. */
export function comparablesEstimate(comps: Comparable[], today: ISODate): Omit<Valuation, 'id' | 'propertyId'> | null {
  const recent = comps.filter((c) => daysBetween(c.saleDate, today) <= 365);
  if (recent.length === 0) return null;
  const adjusted = recent.map((c) => Math.round(c.price * (c.similarity === 'less' ? 1.05 : c.similarity === 'more' ? 0.95 : 1))).sort((a, b) => a - b);
  const mid = Math.floor(adjusted.length / 2);
  const likely = adjusted.length % 2 ? adjusted[mid] : Math.round((adjusted[mid - 1] + adjusted[mid]) / 2);
  const low = Math.min(adjusted[0], Math.round(likely * 0.95));
  const high = Math.max(adjusted[adjusted.length - 1], Math.round(likely * 1.05));
  return {
    date: today, source: 'comparables', low, likely, high,
    confidence: recent.length >= 5 ? 'high' : recent.length >= 3 ? 'medium' : 'low',
    note: `${recent.length} sale${recent.length === 1 ? '' : 's'} in the last 12 months`,
  };
}

const SOURCE_WEIGHT: Record<Valuation['source'], number> = { comparables: 4, index: 3, owner: 2, assessment: 1, purchase: 1 };
const CONF_WEIGHT = { low: 0.5, medium: 1, high: 1.5 } as const;

/** Blend the latest valuation from each source (within 18 months) into one range. */
export function blendedValue(vals: Valuation[], today: ISODate): { low: Cents; likely: Cents; high: Cents; confidence: 'low' | 'medium' | 'high'; sources: Valuation[] } | null {
  const latest = new Map<string, Valuation>();
  for (const v of [...vals].sort((a, b) => a.date.localeCompare(b.date))) {
    if (daysBetween(v.date, today) > 548 && v.source !== 'purchase') continue;
    latest.set(v.source, v);
  }
  // A purchase price only counts as a valuation for the first year.
  const p = latest.get('purchase');
  if (p && daysBetween(p.date, today) > 365 && latest.size > 1) latest.delete('purchase');
  const sources = [...latest.values()];
  if (sources.length === 0) return null;
  let w = 0, low = 0, likely = 0, high = 0;
  for (const v of sources) {
    const wt = SOURCE_WEIGHT[v.source] * CONF_WEIGHT[v.confidence];
    w += wt; low += v.low * wt; likely += v.likely * wt; high += v.high * wt;
  }
  const independent = sources.filter((s) => s.source !== 'purchase').length;
  return {
    low: Math.round(low / w), likely: Math.round(likely / w), high: Math.round(high / w),
    confidence: independent >= 3 ? 'high' : independent >= 2 ? 'medium' : 'low',
    sources,
  };
}

// =====================================================================================
// Worth-It reading (FP-3) — total return on the owner's equity, rental share only (PS-8)
// =====================================================================================

export type ValueBasis = 'valuation' | 'purchase' | 'rent';

/**
 * Value to use for a property, best source first: recorded valuations, then the purchase price grown by
 * the local price trend, then (Bronze) an estimate from the rent using the local rent-to-price ratio.
 * Rent-based estimates are already the rented part only.
 */
/**
 * Automated valuation model. Stage 1 is a PLACEHOLDER: it grows the purchase price by the local price index,
 * or (no purchase price) divides yearly rent by the local gross yield. Stage 2 swaps in a licensed Canadian
 * AVM (e.g. Opta/SCM iClarify, Teranet Purview, Altus) behind this same function and label.
 */
export const AVM_PROVIDER = 'Sample AVM (placeholder)';

export interface ValueInfo { value: Cents; basis: ValueBasis; source: string; asOf: ISODate }

export function propertyValue(state: AppState, prop: Property, today: ISODate): ValueInfo {
  const vals = state.valuations.filter((v) => v.propertyId === prop.id);
  const idx = indexEstimate(prop, today);
  const own = vals.filter((v) => v.source !== 'purchase').sort((a, b) => b.date.localeCompare(a.date));
  if (own.length) {
    const blend = blendedValue([...vals, ...(idx ? [{ ...idx, id: 'idx', propertyId: prop.id }] : [])], today);
    if (blend) return { value: blend.likely, basis: 'valuation', source: `Automated valuation blended with ${own.length === 1 ? 'your estimate' : 'your estimates and nearby sales'}`, asOf: today };
  }
  if (idx) return { value: idx.likely, basis: 'purchase', source: `Automated valuation · ${AVM_PROVIDER}`, asOf: today };
  return { value: rentBasedValue(state, prop), basis: 'rent', source: `Automated valuation from rent · ${AVM_PROVIDER}`, asOf: today };
}

// =====================================================================================
// Portfolio: net worth (whole property × your ownership) and its history
// =====================================================================================
export interface PortfolioRow { property: Property; value: Cents; owed: Cents; yours: Cents; earned: Cents; returnPct: number | null; valueInfo: ValueInfo; owedKnown: boolean }

/** What is owed on a date. A rough balance (Silver) only counts for today. */
export function owedAt(state: AppState, prop: Property, date: ISODate, today: ISODate = date): { owed: Cents; known: boolean } {
  if (prop.mortgageFree) return { owed: 0, known: true };
  const m = state.mortgages.find((x) => x.propertyId === prop.id);
  if (m) return date >= m.startDate ? { owed: mortgageBalanceAt(m, date), known: true } : { owed: 0, known: false };
  if (prop.approxMortgageBalance !== undefined) return { owed: prop.approxMortgageBalance, known: date === today };
  return { owed: 0, known: false };
}

export function portfolio(state: AppState, today: ISODate) {
  const rows: PortfolioRow[] = state.properties.filter((p) => !p.archived).map((p) => {
    const own = p.ownershipPct / 100;
    const vi = propertyValue(state, p, today);
    // A rent-based value covers only the rented part; scale up to the whole property for net worth.
    const whole = vi.basis === 'rent' && p.rentalSharePct > 0 ? Math.round(vi.value / (p.rentalSharePct / 100)) : vi.value;
    const o = owedAt(state, p, today);
    const w = worthIt(state, today, { propertyId: p.id });
    return { property: p, value: Math.round(whole * own), owed: Math.round(o.owed * own), yours: Math.round((whole - o.owed) * own), earned: w.total, returnPct: w.returnPct, valueInfo: { ...vi, value: whole }, owedKnown: o.known };
  }).sort((a, b) => b.value - a.value);
  // Net worth only counts properties whose mortgage is known (or paid off); others are listed, not guessed.
  const counted = rows.filter((r) => r.owedKnown);
  const total = (k: 'value' | 'owed' | 'yours') => counted.reduce((a, r) => a + r[k], 0);
  return { rows, value: total('value'), owed: total('owed'), yours: total('yours'), estimates: rows.filter((r) => r.valueInfo.basis !== 'valuation').length, notCounted: rows.filter((r) => !r.owedKnown).map((r) => r.property) };
}

/**
 * Net worth over time: one point at each year end since the first purchase, plus today.
 * Uses real data (purchase prices, mortgage balances from the amortization schedule); only value is estimated.
 * A property joins the line once both its value and its mortgage are known at that date.
 */
export function netWorthHistory(state: AppState, today: ISODate): { date: ISODate; yours: Cents; value: Cents; owed: Cents }[] {
  const props = state.properties.filter((p) => !p.archived && p.purchaseDate && p.purchasePrice);
  if (!props.length) return [];
  const first = props.map((p) => p.purchaseDate!).sort()[0];
  const dates: ISODate[] = [];
  for (let y = Number(first.slice(0, 4)); y < Number(today.slice(0, 4)); y++) dates.push(`${y}-12-31`);
  dates.push(today);
  return dates.map((d) => {
    let value = 0, owed = 0;
    for (const p of props) {
      if (p.purchaseDate! > d) continue;
      const o = owedAt(state, p, d, today);
      if (!o.known && d !== today) continue;
      const own = p.ownershipPct / 100;
      const v = d === today ? propertyValue(state, p, today).value : indexEstimate(p, d)?.likely ?? p.purchasePrice!;
      value += Math.round(v * own); owed += Math.round(o.owed * own);
    }
    return { date: d, value, owed, yours: value - owed };
  }).filter((x) => x.value > 0);
}

/** Bronze estimate: yearly rent ÷ the area's typical gross yield. */
export function rentBasedValue(state: AppState, prop: Property): Cents {
  const yearlyRent = state.units.filter((u) => u.propertyId === prop.id).reduce((a, u) => a + u.rent * 12, 0);
  const y = regionData(prop.province, prop.city).grossYield.typical / 100;
  return y > 0 ? Math.round(yearlyRent / y) : 0;
}

export interface WorthIt {
  value: Cents; debt: Cents; equity: Cents;
  cashFlow: Cents; principalPaid: Cents; appreciation: Cents;
  total: Cents;
  /** Return on the owner's money. Null unless every property has at least Silver data (we need what is owed). */
  returnPct: number | null;
  benchmarkPct: number;
  diffPts: number | null;
  appreciationEstimated: boolean;
  /** Properties whose value is only estimated from rent (Bronze). */
  roughValue: string[];
  missing: string[];
}

export function worthIt(state: AppState, today: ISODate, opts: { propertyId?: string } = {}): WorthIt {
  const from = addDays(addMonths(today, -12), 1);
  const props = state.properties.filter((p) => !p.archived && (!opts.propertyId || p.id === opts.propertyId));
  const missing: string[] = [];
  const roughValue: string[] = [];
  let value = 0, debt = 0, principalPaid = 0, appreciation = 0, cashFlow = 0;
  let appreciationEstimated = false;

  for (const prop of props) {
    const own = prop.ownershipPct / 100;
    const pv = propertyValue(state, prop, today);
    // Rent-based values already describe only the rented part; other values are for the whole property.
    const share = pv.basis === 'rent' ? own : (prop.rentalSharePct / 100) * own;
    if (pv.basis === 'rent') { roughValue.push(prop.nickname); missing.push(prop.nickname); }
    value += Math.round(pv.value * share);

    const debtShare = (prop.rentalSharePct / 100) * own;
    const m = state.mortgages.find((x) => x.propertyId === prop.id);
    if (m) {
      const rows = amortization(m);
      debt += Math.round(mortgageBalanceAt(m, today, rows) * debtShare);
      principalPaid += Math.round(mortgagePaidBetween(m, from, today, rows).principal * debtShare);
    } else if (prop.approxMortgageBalance) {
      debt += Math.round(prop.approxMortgageBalance * debtShare);
    }

    // Value growth for one year: today's value × the area's long-run price trend (5-year average).
    // Always an estimate; single-year moves are too noisy for a small landlord's decision.
    appreciation += Math.round(pv.value * share * (regionData(prop.province, prop.city).priceGrowth.y5 / 100));
    appreciationEstimated = true;

    cashFlow += Math.round(picture(state, from, today, { propertyId: prop.id }).kept * own);
  }

  const equity = value - debt;
  const total = cashFlow + principalPaid + appreciation;
  const returnPct = roughValue.length === 0 && equity > 0 ? (total / equity) * 100 : null;
  return {
    value, debt, equity, cashFlow, principalPaid, appreciation, total, returnPct,
    benchmarkPct: RETURN_PRESETS.typical,
    diffPts: returnPct === null ? null : returnPct - RETURN_PRESETS.typical,
    appreciationEstimated, roughValue, missing,
  };
}

export function verdict(w: WorthIt): string {
  if (w.returnPct === null) return 'Add what you paid to compare with a GIC.';
  return `Your property earned ${w.returnPct.toFixed(1)}% this year. A 5-year GIC would have paid ${w.benchmarkPct.toFixed(1)}%.`;
}

/** Short label for the verdict: ahead of, about the same as, or behind a GIC. */
export function verdictTag(w: WorthIt): { text: string; tone: 'good' | 'even' | 'bad' } | null {
  if (w.diffPts === null) return null;
  if (w.diffPts >= 0.25) return { text: 'Ahead of a GIC', tone: 'good' };
  if (w.diffPts <= -0.25) return { text: 'Behind a GIC', tone: 'bad' };
  return { text: 'About the same as a GIC', tone: 'even' };
}

// =====================================================================================
// Tax Pack (basic at Bronze, full at Gold) — T776-structured summary, CCA schedule, pre-flight
// =====================================================================================

export interface CCARow { cls: string; label: string; ratePct: number; opening: Cents; additions: Cents; base: Cents; maxCCA: Cents; claimed: Cents; closing: Cents }

export interface TaxPack {
  year: number;
  grossRents: Cents;
  /** label = plain words for the owner; craLabel = the official T776 wording for the accountant. */
  lines: { t776: string; label: string; craLabel: string; amount: Cents; count: number }[];
  totalExpenses: Cents;
  netBeforeCCA: Cents;
  cca: CCARow[];
  ccaClaimed: Cents;
  netIncome: Cents;
  ownerShare: Cents;
  preflight: { id: string; text: string; severity: 'fix' | 'check' }[];
}

/** Undepreciated capital cost of the building (class 1) at purchase: price minus land, plus acquisition costs and day-one improvements. */
export function buildingCostBase(prop: Property): Cents {
  const price = prop.purchasePrice ?? 0;
  const landPct = prop.landValuePct ?? 30;
  const acq = (prop.closingCosts ?? 0) + (prop.landTransferTax ?? 0);
  const buildingShare = 1 - landPct / 100;
  return Math.round((price + acq) * buildingShare + (prop.improvementsAtPurchase ?? 0));
}

/** Adjusted cost base for capital-gain estimates. */
export function adjustedCostBase(state: AppState, prop: Property): Cents {
  const capex = state.expenses.filter((e) => e.propertyId === prop.id && e.kind === 'capital').reduce((a, e) => a + e.amount, 0);
  return (prop.purchasePrice ?? 0) + (prop.closingCosts ?? 0) + (prop.landTransferTax ?? 0) + (prop.improvementsAtPurchase ?? 0) + capex;
}

export function ccaSchedule(state: AppState, prop: Property, year: number, netBeforeCCA: Cents): CCARow[] {
  const share = prop.rentalSharePct / 100;
  const purchaseYear = prop.purchaseDate ? Number(prop.purchaseDate.slice(0, 4)) : year;
  const rows: CCARow[] = [];
  for (const c of CCA_CLASSES) {
    if (c.ratePct === 0) continue;
    // Assume (stage 1 simplification) maximum CCA was claimed each prior year when CCA is on.
    let ucc = 0;
    for (let y = purchaseYear; y <= year; y++) {
      let additions = state.expenses
        .filter((e) => e.propertyId === prop.id && e.kind === 'capital' && e.ccaClass === c.id && Number(e.date.slice(0, 4)) === y)
        .reduce((a, e) => a + rentalPortion(e, prop.rentalSharePct), 0);
      if (c.id === '1' && y === purchaseYear) additions += Math.round(buildingCostBase(prop) * share);
      const base = ucc + additions / 2; // half-year rule
      const maxCCA = Math.round(base * (c.ratePct / 100));
      if (y === year) {
        rows.push({ cls: c.id, label: c.label, ratePct: c.ratePct, opening: ucc, additions, base: Math.round(base), maxCCA, claimed: 0, closing: ucc + additions });
      } else {
        ucc = ucc + additions - maxCCA;
      }
    }
  }
  // CCA cannot create or increase a rental loss: cap the total at net income before CCA.
  const relevant = rows.filter((r) => r.opening + r.additions > 0);
  const totalMax = relevant.reduce((a, r) => a + r.maxCCA, 0);
  const cap = Math.max(0, netBeforeCCA);
  const factor = totalMax > 0 ? Math.min(1, cap / totalMax) : 0;
  for (const r of relevant) {
    r.claimed = prop.claimCCA ? Math.round(r.maxCCA * factor) : 0;
    r.closing = r.opening + r.additions - r.claimed;
  }
  return relevant;
}

/**
 * The first day of the year with anything recorded for this property (rent or a cost). Someone who starts
 * using Keyholder part way through the year has records from that day; the spreadsheet says so.
 */
export function recordsStart(state: AppState, prop: Property, year: number): ISODate {
  const y0 = `${year}-01-01`, y1 = `${year}-12-31`;
  const units = new Set(state.units.filter((u) => u.propertyId === prop.id).map((u) => u.id));
  const leaseIds = new Set(state.leases.filter((l) => units.has(l.unitId)).map((l) => l.id));
  const dates = [
    ...state.payments.filter((p) => !p.voided && leaseIds.has(p.leaseId)).map((p) => p.date),
    ...state.expenses.filter((e) => e.propertyId === prop.id).map((e) => e.date),
  ].filter((d) => d >= y0 && d <= y1).sort();
  return dates[0] ?? y0;
}

/** The T776 numbers for a property and year; `start` limits them to a later first day (records kept from then). */
export function taxPack(state: AppState, prop: Property, year: number, start?: ISODate): TaxPack {
  const y0 = `${year}-01-01`, to = `${year}-12-31`;
  const from = start && start > y0 && start <= to ? start : y0;
  const units = state.units.filter((u) => u.propertyId === prop.id).map((u) => u.id);
  const leaseIds = new Set(state.leases.filter((l) => units.includes(l.unitId)).map((l) => l.id));
  const grossRents = state.payments.filter((p) => !p.voided && leaseIds.has(p.leaseId) && p.date >= from && p.date <= to).reduce((a, p) => a + p.amount, 0);

  const exps = state.expenses.filter((e) => e.propertyId === prop.id && e.date >= from && e.date <= to);
  const byLine = new Map<string, TaxPack['lines'][number]>();
  for (const e of exps) {
    if (e.kind !== 'current' || e.scope === 'personal') continue;
    const cat = CATEGORIES.find((c) => c.id === e.category)!;
    const line = byLine.get(cat.t776) ?? { t776: cat.t776, label: cat.label, craLabel: cat.t776Label, amount: 0, count: 0 };
    line.amount += rentalPortion(e, prop.rentalSharePct);
    line.count++;
    byLine.set(cat.t776, line);
  }
  const m = state.mortgages.find((x) => x.propertyId === prop.id);
  if (m) {
    const interest = Math.round((mortgagePaidBetween(m, from, to).interest * prop.rentalSharePct) / 100);
    const line = byLine.get('8710') ?? { t776: '8710', label: '', craLabel: 'Interest and bank charges', amount: 0, count: 0 };
    line.amount += interest;
    line.label = 'Mortgage interest and bank fees';
    byLine.set('8710', line);
  }
  const lines = [...byLine.values()].sort((a, b) => a.t776.localeCompare(b.t776));
  const totalExpenses = lines.reduce((a, l) => a + l.amount, 0);
  const netBeforeCCA = grossRents - totalExpenses;
  // Depreciation needs the full purchase picture (Gold).
  const cca = hasGold(state, prop) ? ccaSchedule(state, prop, year, netBeforeCCA) : [];
  const ccaClaimed = cca.reduce((a, r) => a + r.claimed, 0);
  const netIncome = netBeforeCCA - ccaClaimed;

  // Pre-flight checklist (TX-3)
  const preflight: TaxPack['preflight'] = [];
  const noReceipt = exps.filter((e) => !e.receiptImage && !e.cashNoReceipt);
  if (noReceipt.length) preflight.push({ id: 'receipts', text: `${noReceipt.length} expense${noReceipt.length > 1 ? 's have' : ' has'} no receipt photo`, severity: 'fix' });
  const cash = exps.filter((e) => e.cashNoReceipt && !e.receiptImage);
  if (cash.length) preflight.push({ id: 'cash', text: `${cash.length} cost${cash.length > 1 ? 's' : ''} paid in cash with no receipt. The record is kept; a short signed note from the person you paid is even better.`, severity: 'check' });
  const noClass = exps.filter((e) => e.kind === 'capital' && !e.ccaClass);
  if (noClass.length) preflight.push({ id: 'cca-class', text: `${noClass.length} upgrade${noClass.length > 1 ? 's need' : ' needs'} a depreciation type`, severity: 'fix' });
  const other = exps.filter((e) => e.category === 'other');
  if (other.length) preflight.push({ id: 'other', text: `${other.length} expense${other.length > 1 ? 's are' : ' is'} marked "Something else". Pick a type.`, severity: 'check' });
  if (!exps.some((e) => e.category === 'property-tax')) preflight.push({ id: 'ptax', text: 'No property tax added this year', severity: 'check' });
  if (!exps.some((e) => e.category === 'insurance')) preflight.push({ id: 'ins', text: 'No insurance added this year', severity: 'check' });
  if (m) preflight.push({ id: 'mstatement', text: "Check the interest matches your bank's yearly mortgage statement", severity: 'check' });
  // Unusual amounts: more than 3x the median of their category.
  for (const cat of new Set(exps.map((e) => e.category))) {
    const amts = exps.filter((e) => e.category === cat).map((e) => e.amount).sort((a, b) => a - b);
    if (amts.length < 3) continue;
    const med = amts[Math.floor(amts.length / 2)];
    const big = amts.filter((a) => a > med * 3).length;
    if (big) preflight.push({ id: `unusual-${cat}`, text: `${big} large ${CATEGORIES.find((c) => c.id === cat)!.label.toLowerCase()} expense${big > 1 ? 's' : ''}. Was it an upgrade?`, severity: 'check' });
  }
  if (prop.ownerOccupied && prop.claimCCA) preflight.push({ id: 'cca-pre', text: 'Depreciation is on for a home you live in. This can affect tax when you sell. Ask your accountant.', severity: 'check' });

  return { year, grossRents, lines, totalExpenses, netBeforeCCA, cca, ccaClaimed, netIncome, ownerShare: Math.round(netIncome * (prop.ownershipPct / 100)), preflight };
}
