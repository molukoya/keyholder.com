import type {
  AppState, Cents, Comparable, Expense, ISODate, Lease, Mortgage, MortgageFrequency, Payment, Period,
  Phase, Property, Valuation,
} from '../data/types';
import { addDays, addMonths, daysBetween, dueDate, periodOf, periodRange, yearsBetween } from './dates';
import { CATEGORIES, CCA_CLASSES, RETURN_PRESETS, regionData } from './jurisdiction';

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

export function activeLease(state: AppState, unitId: string, today: ISODate): Lease | undefined {
  return state.leases
    .filter((l) => l.unitId === unitId && l.start <= addDays(today, 60) && (!l.end || l.end >= today))
    .sort((a, b) => b.start.localeCompare(a.start))[0];
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
  for (let k = 1; bal > 0 && k <= m.amortYears * n + 1; k++) {
    const interest = Math.round(bal * i);
    let principal = pay - interest;
    if (principal <= 0) break; // payment does not cover interest; schedule never ends
    if (principal > bal) principal = bal;
    bal -= principal;
    rows.push({ n: k, date: paymentDate(m.startDate, k, m.frequency), payment: interest + principal, interest, principal, balance: bal });
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
}

export function picture(state: AppState, from: ISODate, to: ISODate, opts: { propertyId?: string; phase: Phase }): Picture {
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

  let mortgageInterest = 0, mortgagePrincipal = 0, hasMortgageData = false;
  if (opts.phase >= 3) {
    for (const m of state.mortgages) {
      const prop = props.find((p) => p.id === m.propertyId);
      if (!prop) continue;
      hasMortgageData = true;
      const paid = mortgagePaidBetween(m, from, to);
      mortgageInterest += Math.round((paid.interest * prop.rentalSharePct) / 100);
      mortgagePrincipal += Math.round((paid.principal * prop.rentalSharePct) / 100);
    }
  } else if (opts.phase === 2) {
    // Phase 2 has only an approximate monthly payment; treat it as one combined figure.
    const months = Math.max(0, periodRange(periodOf(from), periodOf(to)).length);
    for (const prop of props) {
      if (!prop.approxMortgagePayment) continue;
      hasMortgageData = true;
      mortgageInterest += Math.round((prop.approxMortgagePayment * months * prop.rentalSharePct) / 100);
    }
  }

  const noi = rentCollected - opex;
  const kept = noi - mortgageInterest - mortgagePrincipal - capital;
  return {
    from, to, rentCollected, rentExpected, arrearsLoss, vacancyLoss, opex, noi,
    mortgageInterest, mortgagePrincipal, capital, kept, hasMortgageData,
    keptPer1000: rentCollected > 0 ? Math.round((kept / rentCollected) * 1000) : 0,
    expenseRatio: rentCollected > 0 ? (opex / rentCollected) * 100 : 0,
  };
}

// =====================================================================================
// Valuation (Phase 2) — never a falsely precise number (VA-3)
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

export interface WorthIt {
  value: Cents; debt: Cents; equity: Cents;
  cashFlow: Cents; principalPaid: Cents; appreciation: Cents;
  total: Cents;
  returnPct: number | null;
  benchmarkPct: number;
  diffPts: number | null;
  appreciationEstimated: boolean;
  missing: string[];
}

export function worthIt(state: AppState, today: ISODate, opts: { propertyId?: string; phase: Phase }): WorthIt {
  const from = addDays(addMonths(today, -12), 1);
  const props = state.properties.filter((p) => !p.archived && (!opts.propertyId || p.id === opts.propertyId));
  const missing: string[] = [];
  let value = 0, debt = 0, principalPaid = 0, appreciation = 0, cashFlow = 0;
  let appreciationEstimated = false;

  for (const prop of props) {
    const share = (prop.rentalSharePct / 100) * (prop.ownershipPct / 100);
    const vals = state.valuations.filter((v) => v.propertyId === prop.id);
    const blend = blendedValue(vals, today);
    const v = blend?.likely ?? prop.purchasePrice ?? 0;
    if (!v) missing.push(`a value for ${prop.nickname}`);
    value += Math.round(v * share);

    const m = state.mortgages.find((x) => x.propertyId === prop.id);
    if (opts.phase >= 3 && m) {
      const rows = amortization(m);
      debt += Math.round(mortgageBalanceAt(m, today, rows) * share);
      principalPaid += Math.round(mortgagePaidBetween(m, from, today, rows).principal * share);
    } else if (prop.approxMortgageBalance) {
      debt += Math.round(prop.approxMortgageBalance * share);
    }

    // Appreciation: from valuation history when it spans ~a year, otherwise the regional 5-year rate.
    const year = [...vals].filter((x) => x.date <= from).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (blend && year) appreciation += Math.round((blend.likely - year.likely) * share);
    else { appreciation += Math.round(v * share * (regionData(prop.province, prop.city).priceGrowth.y5 / 100)); appreciationEstimated = true; }

    cashFlow += Math.round(picture(state, from, today, { propertyId: prop.id, phase: opts.phase }).kept * (prop.ownershipPct / 100));
  }

  const equity = value - debt;
  const total = cashFlow + principalPaid + appreciation;
  const returnPct = equity > 0 ? (total / equity) * 100 : null;
  return {
    value, debt, equity, cashFlow, principalPaid, appreciation, total, returnPct,
    benchmarkPct: RETURN_PRESETS.typical,
    diffPts: returnPct === null ? null : returnPct - RETURN_PRESETS.typical,
    appreciationEstimated, missing,
  };
}

export function verdict(w: WorthIt): string {
  if (w.returnPct === null) return 'Add what the property is worth to see this.';
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
// Tax Pack (Phase 3) — T776-structured summary, CCA schedule, pre-flight
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

export function taxPack(state: AppState, prop: Property, year: number, phase: Phase): TaxPack {
  const from = `${year}-01-01`, to = `${year}-12-31`;
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
  if (phase >= 3 && m) {
    const interest = Math.round((mortgagePaidBetween(m, from, to).interest * prop.rentalSharePct) / 100);
    const line = byLine.get('8710') ?? { t776: '8710', label: '', craLabel: 'Interest and bank charges', amount: 0, count: 0 };
    line.amount += interest;
    line.label = 'Mortgage interest and bank fees';
    byLine.set('8710', line);
  }
  const lines = [...byLine.values()].sort((a, b) => a.t776.localeCompare(b.t776));
  const totalExpenses = lines.reduce((a, l) => a + l.amount, 0);
  const netBeforeCCA = grossRents - totalExpenses;
  const cca = ccaSchedule(state, prop, year, netBeforeCCA);
  const ccaClaimed = cca.reduce((a, r) => a + r.claimed, 0);
  const netIncome = netBeforeCCA - ccaClaimed;

  // Pre-flight checklist (TX-3)
  const preflight: TaxPack['preflight'] = [];
  const noReceipt = exps.filter((e) => !e.receiptImage);
  if (noReceipt.length) preflight.push({ id: 'receipts', text: `${noReceipt.length} expense${noReceipt.length > 1 ? 's have' : ' has'} no receipt photo`, severity: 'fix' });
  const noClass = exps.filter((e) => e.kind === 'capital' && !e.ccaClass);
  if (noClass.length) preflight.push({ id: 'cca-class', text: `${noClass.length} upgrade${noClass.length > 1 ? 's need' : ' needs'} a depreciation type`, severity: 'fix' });
  const other = exps.filter((e) => e.category === 'other');
  if (other.length) preflight.push({ id: 'other', text: `${other.length} expense${other.length > 1 ? 's are' : ' is'} marked "Something else". Pick a type.`, severity: 'check' });
  if (!exps.some((e) => e.category === 'property-tax')) preflight.push({ id: 'ptax', text: 'No property tax added this year', severity: 'check' });
  if (!exps.some((e) => e.category === 'insurance')) preflight.push({ id: 'ins', text: 'No insurance added this year', severity: 'check' });
  if (phase >= 3 && !m) preflight.push({ id: 'mortgage', text: 'No mortgage added. Skip this if it is paid off.', severity: 'check' });
  if (phase >= 3 && m) preflight.push({ id: 'mstatement', text: "Check the interest matches your bank's yearly mortgage statement", severity: 'check' });
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
