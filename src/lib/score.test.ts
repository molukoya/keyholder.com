import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { byValue, keyholderScore, propertyCompletion } from './score';

const today = '2026-11-08';

describe('Keyholder score', () => {
  it('is between 0 and 100 and lists what to do, biggest gain first', () => {
    const s = seedState(undefined, '2026-11-08');
    const { score, todo } = keyholderScore(s, today);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
    const gains = todo.map((i) => i.points - i.earned);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  });

  it('goes up when a property gets its purchase price', () => {
    const s = seedState(undefined, '2026-11-08');
    const before = keyholderScore(s, today).score;
    const birch = s.properties.find((p) => p.id === 'p-birch')!;
    const pctBefore = propertyCompletion(s, birch, today);
    birch.purchasePrice = 108_000_000; birch.purchaseDate = '2021-09-01';
    expect(keyholderScore(s, today).score).toBeGreaterThan(before);
    expect(propertyCompletion(s, birch, today)).toBeGreaterThan(pctBefore);
  });

  it('orders properties by value, most valuable first', () => {
    const s = seedState(undefined, '2026-11-08');
    const order = byValue(s, today).map((p) => p.id);
    expect(order[0]).toBe('p-maple'); // $700k+ duplex vs a ~$460k rent-based basement estimate
    s.properties.find((p) => p.id === 'p-birch')!.purchasePrice = 200_000_000;
    s.properties.find((p) => p.id === 'p-birch')!.purchaseDate = '2025-11-01';
    expect(byValue(s, today)[0].id).toBe('p-birch');
  });
});
