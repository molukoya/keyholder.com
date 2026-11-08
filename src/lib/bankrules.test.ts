import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { bankToSort, readWithdrawal, vendorKey } from './bankrules';

const today = '2026-11-08';

describe('reading bank withdrawals', () => {
  const s = seedState(undefined, today);
  const r = (id: string) => readWithdrawal(s, s.txns.find((t) => t.id === id)!);

  it('recognises bills and guesses the property from the city', () => {
    expect(r('tx-tax')).toMatchObject({ kind: 'expense', category: 'property-tax', propertyId: 'p-maple' });
    expect(r('tx-enb')).toMatchObject({ kind: 'expense', category: 'utilities' });
    expect(r('tx-hd')).toMatchObject({ kind: 'expense', category: 'repairs' });
  });

  it('matches a mortgage payment to the mortgage on record, and offers setup when there is none', () => {
    expect(r('tx-rbcm')).toMatchObject({ kind: 'mortgage', mortgageId: 'm-maple', matchesSchedule: true });
    expect(r('tx-tdm')).toMatchObject({ kind: 'mortgage', propertyId: 'p-birch' });
    expect(r('tx-tdm').mortgageId).toBeUndefined();
  });

  it('remembers a vendor once it has been filed', () => {
    s.profile.vendorRules = { [vendorKey('HOME DEPOT #7011')]: { propertyId: 'p-birch', category: 'repairs' } };
    expect(readWithdrawal(s, { ...s.txns.find((t) => t.id === 'tx-hd')!, payer: 'HOME DEPOT #9022' })).toMatchObject({ propertyId: 'p-birch', why: 'You filed this vendor before' });
    expect(bankToSort(s).length).toBe(5);
  });
});
