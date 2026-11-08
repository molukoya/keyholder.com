import { describe, expect, it } from 'vitest';
import type { AppState, Lease, Mortgage, Payment, Property } from '../data/types';
import {
  amortization, blendedValue, buildingCostBase, ccaSchedule, chargeState, comparablesEstimate, indexEstimate,
  leaseBalance, leaseLedger, mortgageBalanceAt, mortgagePaidBetween, mortgagePayment, periodicRate, rentalPortion,
  rentBasedValue, worthIt,
} from './finance';
import { propertyLevel } from './levels';
import { addMonths, dueDate, periodRange } from './dates';
import { parseMoney } from './money';

const prop = (o: Partial<Property> = {}): Property => ({
  id: 'p1', nickname: 'Test', address: '1 Main', city: 'Hamilton', province: 'ON', type: 'duplex',
  rentalSharePct: 100, ownerOccupied: false, ownershipPct: 100, claimCCA: true, ...o,
});

describe('money', () => {
  it('parses typed amounts into cents', () => {
    expect(parseMoney('1,650')).toBe(165000);
    expect(parseMoney('$1650.5')).toBe(165050);
    expect(parseMoney('')).toBeNaN();
  });
});

describe('dates', () => {
  it('clamps due dates and month additions to month length', () => {
    expect(dueDate('2026-02', 31)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(periodRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('rental share split (PS-6)', () => {
  it('splits shared costs, keeps direct costs whole, drops personal costs', () => {
    expect(rentalPortion({ amount: 100000, scope: 'shared' }, 35)).toBe(35000);
    expect(rentalPortion({ amount: 100000, scope: 'direct' }, 35)).toBe(100000);
    expect(rentalPortion({ amount: 100000, scope: 'personal' }, 35)).toBe(0);
  });
});

describe('rent ledger', () => {
  const lease: Lease = {
    id: 'l1', unitId: 'u1', tenantId: 't1', start: '2026-09-01', rent: 165000, dueDay: 1,
    paymentMethod: 'etransfer', lmrDeposit: 165000, utilities: '', parking: false, pets: false, emailNoticeConsent: true,
  };
  const pay = (period: string, amount: number, date = `${period}-01`): Payment => ({
    id: `${period}-${amount}`, leaseId: 'l1', period, amount, date, method: 'etransfer', source: 'manual', createdAt: date,
  });

  it('is late the day after it is due', () => {
    expect(chargeState(1000, 0, '2026-11-01', '2026-11-01').state).toBe('due');
    expect(chargeState(1000, 0, '2026-11-01', '2026-11-02')).toEqual({ state: 'late', daysLate: 1 });
    expect(chargeState(1000, 500, '2026-11-01', '2026-11-04').state).toBe('partial');
    expect(chargeState(1000, 1000, '2026-11-01', '2026-11-04').state).toBe('paid');
  });

  it('builds one charge per period with a running balance', () => {
    const lines = leaseLedger(lease, [pay('2026-09', 165000), pay('2026-10', 100000)], '2026-11-08');
    expect(lines.map((l) => l.state)).toEqual(['paid', 'partial', 'late']);
    expect(lines[2].balance).toBe(65000 + 165000);
    expect(leaseBalance(lease, [pay('2026-09', 165000), pay('2026-10', 100000)], '2026-11-08')).toBe(230000);
  });

  it('ignores voided payments', () => {
    const p = { ...pay('2026-09', 165000), voided: true };
    expect(leaseLedger(lease, [p], '2026-09-10')[0].state).toBe('late');
  });
});

describe('Canadian mortgage math (semi-annual compounding)', () => {
  const m: Mortgage = {
    id: 'm1', propertyId: 'p1', lender: 'RBC', principal: 40_000_000, startDate: '2026-01-01',
    ratePct: 5, amortYears: 25, termEnd: '2031-01-01', frequency: 'monthly',
  };

  it('derives the periodic rate from semi-annual compounding', () => {
    expect(periodicRate(5, 12)).toBeCloseTo(0.00412392, 7);
  });

  it('matches the standard payment for $400k at 5% over 25 years', () => {
    expect(mortgagePayment(40_000_000, 5, 25, 'monthly')).toBe(232642);
  });

  it('amortises to zero with principal + interest = payment', () => {
    const rows = amortization(m);
    expect(rows.length).toBe(300);
    expect(rows[rows.length - 1].balance).toBe(0);
    expect(rows[0].interest).toBe(Math.round(40_000_000 * periodicRate(5, 12)));
    expect(rows[0].interest + rows[0].principal).toBe(232642);
  });

  it('reports balance and principal/interest paid in a window', () => {
    const rows = amortization(m);
    const paid = mortgagePaidBetween(m, '2026-01-01', '2027-01-01', rows);
    expect(paid.count).toBe(12);
    expect(mortgageBalanceAt(m, '2027-01-01', rows)).toBe(40_000_000 - paid.principal);
    expect(paid.interest + paid.principal).toBe(12 * 232642);
  });

  it('handles accelerated bi-weekly payments', () => {
    const rows = amortization({ ...m, frequency: 'biweekly' });
    expect(rows[1].date).toBe('2026-01-29');
    expect(rows[rows.length - 1].balance).toBe(0);
  });
});

describe('valuation (phase 2)', () => {
  it('grows the purchase price by the regional index and returns a range', () => {
    const v = indexEstimate(prop({ purchasePrice: 50_000_000, purchaseDate: '2025-11-08' }), '2026-11-08')!;
    expect(v.likely).toBeLessThan(50_000_000); // Hamilton 1-year placeholder is negative
    expect(v.low).toBeLessThan(v.likely);
    expect(v.high).toBeGreaterThan(v.likely);
  });

  it('returns null without a purchase price', () => {
    expect(indexEstimate(prop(), '2026-11-08')).toBeNull();
  });

  it('adjusts comparables for similarity and takes the median', () => {
    const v = comparablesEstimate([
      { id: 'a', propertyId: 'p1', address: 'a', saleDate: '2026-06-01', price: 60_000_000, bedrooms: 3, similarity: 'similar' },
      { id: 'b', propertyId: 'p1', address: 'b', saleDate: '2026-06-01', price: 57_000_000, bedrooms: 2, similarity: 'less' },
      { id: 'c', propertyId: 'p1', address: 'c', saleDate: '2024-01-01', price: 10_000_000, bedrooms: 1, similarity: 'similar' },
    ], '2026-11-08')!;
    expect(v.note).toContain('2 sales');
    expect(v.likely).toBe(Math.round((59_850_000 + 60_000_000) / 2));
  });

  it('blends sources and drops stale purchase prices', () => {
    const b = blendedValue([
      { id: '1', propertyId: 'p1', date: '2020-01-01', source: 'purchase', low: 1, likely: 1, high: 1, confidence: 'high' },
      { id: '2', propertyId: 'p1', date: '2026-10-01', source: 'owner', low: 90, likely: 100, high: 110, confidence: 'medium' },
    ], '2026-11-08')!;
    expect(b.likely).toBe(100);
    expect(b.sources.map((s) => s.source)).toEqual(['owner']);
  });
});

describe('CCA (phase 3)', () => {
  const base = prop({ purchasePrice: 60_000_000, purchaseDate: '2026-03-01', closingCosts: 0, landTransferTax: 0, landValuePct: 25 });
  const state = { expenses: [] } as unknown as AppState;

  it('excludes land from the building cost base', () => {
    expect(buildingCostBase(base)).toBe(45_000_000);
  });

  it('applies the half-year rule in the purchase year', () => {
    const [row] = ccaSchedule(state, base, 2026, 10_000_000);
    expect(row.maxCCA).toBe(Math.round(45_000_000 / 2 * 0.04));
    expect(row.claimed).toBe(row.maxCCA);
  });

  it('never creates a rental loss', () => {
    const [row] = ccaSchedule(state, base, 2026, 100_000);
    expect(row.claimed).toBe(100_000);
    const [none] = ccaSchedule(state, base, 2026, -50_000);
    expect(none.claimed).toBe(0);
  });

  it('claims nothing when CCA is off', () => {
    const [row] = ccaSchedule(state, { ...base, claimCCA: false }, 2026, 10_000_000);
    expect(row.claimed).toBe(0);
  });
});

describe('levels and rent-based value (Bronze)', () => {
  const base = (o: Partial<Property> = {}) => prop({ id: 'p1', city: 'Hamilton', ...o });
  const state = (p: Property, extra: Partial<AppState> = {}) => ({
    properties: [p], units: [{ id: 'u1', propertyId: 'p1', label: 'A', rent: 200000, bedrooms: 2, utilitiesIncluded: [], status: 'occupied' }],
    leases: [], payments: [], expenses: [], valuations: [], comparables: [], mortgages: [], tenants: [], ...extra,
  }) as unknown as AppState;

  it('estimates value from rent and the local gross yield', () => {
    // $2,000 × 12 = $24,000 a year ÷ 5.0% Hamilton typical yield = $480,000
    expect(rentBasedValue(state(base()), base())).toBe(48_000_000);
  });

  it('counts estimated value growth even with only rent known', () => {
    const w = worthIt(state(base()), '2026-11-08');
    expect(w.roughValue).toEqual(['Test']);
    expect(w.appreciation).toBe(Math.round(48_000_000 * 0.03)); // 5-year Hamilton trend 3.0%
    expect(w.returnPct).toBeNull(); // no GIC comparison until Silver
  });

  it('moves Bronze → Silver → Gold as details are added', () => {
    const b = base();
    expect(propertyLevel(state(b), b)).toBe('bronze');
    const s = base({ purchasePrice: 50_000_000, purchaseDate: '2020-01-01' });
    expect(propertyLevel(state(s), s)).toBe('silver');
    const g = { ...s, closingCosts: 0, landTransferTax: 600_000, mortgageFree: true };
    expect(propertyLevel(state(g), g)).toBe('gold');
    expect(worthIt(state(s), '2026-11-08').returnPct).not.toBeNull();
  });
});

describe('portfolio and net worth history', () => {
  it('sums worth, owed and yours; history starts when value and mortgage are both known', async () => {
    const { seedState } = await import('../data/seed');
    const { portfolio, netWorthHistory } = await import('./finance');
    const s = seedState(undefined, '2026-11-08');
    const pf = portfolio(s, '2026-11-08');
    expect(pf.yours).toBe(pf.value - pf.owed);
    expect(pf.rows[0].value).toBeGreaterThanOrEqual(pf.rows[1].value);
    const h = netWorthHistory(s, '2026-11-08');
    expect(h[0].date).toBe('2019-12-31'); // Maple duplex: bought June 2019, mortgage from July 2019
    expect(h[h.length - 1].date).toBe('2026-11-08');
    expect(h.every((x) => x.yours === x.value - x.owed)).toBe(true);
  });
});

describe('late-rent notices', () => {
  it('uses the shorter N4 period from Sept 21, 2026 and adds days for mail', async () => {
    const { terminationDate } = await import('./notices');
    expect(terminationDate('2026-09-01', 'hand')).toBe('2026-09-15');
    expect(terminationDate('2026-11-08', 'hand')).toBe('2026-11-15');
    expect(terminationDate('2026-11-08', 'mail')).toBe('2026-11-20');
  });
  it('claims rent only, for periods already due', async () => {
    const { seedState } = await import('../data/seed');
    const { arrears } = await import('./notices');
    const s = seedState(undefined, '2026-11-08');
    const lease = s.leases.find((l) => l.id === 'l-patel')!;
    const a = arrears(s, lease, '2026-11-08');
    expect(a.total).toBe(145_000);
    expect(a.periods.map((p) => p.period)).toEqual(['2026-11']);
  });
});
