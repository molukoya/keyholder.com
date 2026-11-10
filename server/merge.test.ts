import { describe, expect, it } from 'vitest';
import { merge3 } from './merge';

describe('merge3: two devices saving at once', () => {
  const base = { profile: { name: 'Alex', graceDays: 5 }, payments: [{ id: 'p1', amount: 100 }], expenses: [{ id: 'e1', amount: 10 }] };

  it('keeps a change made on one side only', () => {
    const remote = structuredClone(base); remote.profile.name = 'Alexandra';
    expect(merge3(base, remote, base)).toEqual(remote);
    expect(merge3(base, base, remote)).toEqual(remote);
  });

  it('keeps both sides when they changed different records', () => {
    const phone = structuredClone(base); phone.payments.push({ id: 'p2', amount: 200 });
    const laptop = structuredClone(base); laptop.expenses.push({ id: 'e2', amount: 20 });
    const m = merge3(base, phone, laptop) as typeof base;
    expect(m.payments.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(m.expenses.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('merges different fields of the same record', () => {
    const a = structuredClone(base); a.profile.name = 'Sam';
    const b = structuredClone(base); b.profile.graceDays = 3;
    expect(merge3(base, a, b)).toMatchObject({ profile: { name: 'Sam', graceDays: 3 } });
  });

  it('lets the newest save win when both changed the same field', () => {
    const a = structuredClone(base); a.profile.name = 'Server';
    const b = structuredClone(base); b.profile.name = 'Device';
    expect((merge3(base, a, b) as typeof base).profile.name).toBe('Device');
  });

  it('respects deletions, but never deletes something the other side just edited', () => {
    const removed = structuredClone(base); removed.expenses = [];
    expect((merge3(base, removed, base) as typeof base).expenses).toEqual([]);
    const edited = structuredClone(base); edited.expenses[0].amount = 99;
    const m = merge3(base, edited, removed) as typeof base; // removed here, edited there
    expect(m.expenses).toEqual([{ id: 'e1', amount: 99 }]);
  });

  it('places records new on the server next to their neighbours', () => {
    const b = { list: [{ id: 'a' }, { id: 'c' }] };
    const r = { list: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    const l = { list: [{ id: 'a' }, { id: 'c' }, { id: 'd' }] };
    expect((merge3(b, r, l) as typeof b).list.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('with no common version, takes the incoming copy and adds the server-only records', () => {
    const r = { list: [{ id: 'x' }] }, l = { list: [{ id: 'y' }] };
    expect((merge3(undefined, r, l) as typeof r).list.map((x) => x.id).sort()).toEqual(['x', 'y']);
  });
});
