import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { borrowingRoom, gainSincePurchase, rentVsMarket, roughSale, valueHistory } from './silver';
import { propertyValue } from './finance';

const today = '2026-11-08';

describe('Silver insights', () => {
  const s = seedState(undefined, today);
  const maple = s.properties.find((p) => p.id === 'p-maple')!;
  const birch = s.properties.find((p) => p.id === 'p-birch')!;

  it('shows the gain since purchase and a value history from the purchase to today', () => {
    const g = gainSincePurchase(s, maple, today)!;
    expect(g.gain).toBe(g.value - 61_500_000);
    const h = valueHistory(s, maple, today);
    expect(h[0]).toEqual({ date: '2019-06-14', value: 61_500_000 });
    expect(h[h.length - 1].date).toBe(today);
    expect(gainSincePurchase(s, birch, today)).toBeNull(); // Bronze: no purchase price
  });

  it('compares rent with the area by bedrooms', () => {
    const unitA = s.units.find((u) => u.id === 'u-a')!; // 2-bed at $1,650 in Hamilton
    const r = rentVsMarket(maple, unitA);
    expect(r.market).toBe(195_000);
    expect(r.gap).toBe(30_000);
  });

  it('works out borrowing room and a rough sale only when what is owed is known', () => {
    const v = propertyValue(s, maple, today).value;
    const room = borrowingRoom(s, maple, today)!;
    const sale = roughSale(s, maple, today)!;
    expect(room).toBe(Math.max(0, Math.round(v * 0.8) - sale.owed));
    expect(sale.net).toBe(v - Math.round(v * 0.05) - sale.owed);
    expect(borrowingRoom(s, birch, today)).toBeNull();
  });
});
