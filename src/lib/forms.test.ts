import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { formsFor } from './forms';
import { nextNotice, terminationDate } from './notices';

const today = '2026-11-08';

describe('forms registry', () => {
  it('gives each province its own forms and falls back to shared templates', () => {
    expect(formsFor('ON', 'late-rent').map((f) => f.code)).toEqual(['N4', 'L1', 'L9']);
    expect(formsFor('BC', 'late-rent')[0].code).toBe('RTB-30');
    expect(formsFor('NU', 'rent-increase')[0].province).toBe('*');
    for (const p of ['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU'] as const) {
      expect(formsFor(p, 'late-rent').length).toBeGreaterThan(0);
      expect(formsFor(p, 'rent-increase').length).toBeGreaterThan(0);
    }
  });

  it('uses each form\'s notice period', () => {
    const bc = formsFor('BC', 'late-rent')[0];
    expect(terminationDate('2026-11-08', 'hand', bc)).toBe('2026-11-18');
    expect(terminationDate('2026-11-08', 'hand', formsFor('MB', 'late-rent')[0])).toBeUndefined(); // owner enters the date
  });

  it('suggests the province\'s next late-rent step', () => {
    const s = seedState(undefined, today);
    const next = (id: string) => nextNotice(s, s.leases.find((l) => l.id === id)!, today)?.form.code;
    expect(next('l-patel')).toBe('N4');
    expect(next('l-bc')).toBe('RTB-30');
    expect(next('l-ab')).toBe('AB 14-day');
    expect(next('l-qc')).toBe('Mise en demeure'); // Quebec: formal demand, then TAL application — no eviction notice
    expect(next('l-sk')).toBeUndefined(); // paid
  });
});
