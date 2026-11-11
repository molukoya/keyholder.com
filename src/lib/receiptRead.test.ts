import { describe, expect, it } from 'vitest';
import { amountsIn, findDate, findStore, findTotal, readReceipt } from './receiptRead';

const TODAY = '2026-11-10';

describe('reading a receipt photo', () => {
  it('reads money amounts, including French style and misread digits', () => {
    expect(amountsIn('TOTAL $86.45')).toEqual([8645]);
    expect(amountsIn('Total 1,234.56')).toEqual([123456]);
    expect(amountsIn('MONTANT 86,45 $')).toEqual([8645]);
    expect(amountsIn('VISA 8O.15')).toEqual([8015]);
    expect(amountsIn('2 @ 4.99   9.98')).toEqual([499, 998]);
  });

  it('takes the total from the total line, not the subtotal, tax or savings', () => {
    const lines = ['HOME DEPOT #7011', 'SUBTOTAL 76.50', 'HST 13% 9.95', 'TOTAL 86.45', 'YOU SAVED 12.00', 'VISA 86.45'];
    expect(findTotal(lines)).toBe(8645);
  });

  it('uses the amount on the next line when the total line has none', () => {
    expect(findTotal(['Amount due', '$212.40'])).toBe(21240);
  });

  it('falls back to what was paid by card, ignoring change', () => {
    expect(findTotal(['LUMBER 2X4', '12.99', 'DEBIT 41.20', 'CHANGE 0.00'])).toBe(4120);
  });

  it('never guesses a total when the receipt does not say one', () => {
    expect(findTotal(['NAILS 4.99', 'SCREWS 7.49', 'TAPE 3.29'])).toBeUndefined();
  });

  it('reads dates in the usual Canadian formats, and the most recent reading of an ambiguous one', () => {
    expect(findDate('Date: 2026-11-09 14:02', TODAY)).toBe('2026-11-09');
    expect(findDate('11/09/2026', TODAY)).toBe('2026-11-09'); // 11 Sep or 9 Nov: 9 Nov is more recent
    expect(findDate('25/10/2026', TODAY)).toBe('2026-10-25');
    expect(findDate('Nov 3, 2026', TODAY)).toBe('2026-11-03');
    expect(findDate('3 nov. 2026', TODAY)).toBe('2026-11-03');
    expect(findDate('10/11/26', TODAY)).toBe('2026-11-10');
  });

  it('ignores dates in the future or long ago', () => {
    expect(findDate('2027-01-05', TODAY)).toBeUndefined();
    expect(findDate('2019-05-01', TODAY)).toBeUndefined();
  });

  it('knows common stores and billers, and their expense type', () => {
    expect(findStore(['THE HOME DEPOT', 'STORE 7011'])).toEqual({ vendor: 'Home Depot', category: 'repairs' });
    expect(findStore(['Enbridge Gas Inc.', 'Your bill'])).toEqual({ vendor: 'Enbridge', category: 'utilities' });
    expect(findStore(['PETRO-CANADA', 'PUMP 4'])).toEqual({ vendor: 'Petro-Canada', category: 'vehicle' });
  });

  it('otherwise uses the first name-like line, and the type from words on the receipt', () => {
    expect(findStore(['WELCOME', 'SMITH PLUMBING LTD', 'Tel 905-555-0100', 'Repair kitchen sink'])).toEqual({ vendor: 'Smith Plumbing Ltd', category: 'repairs' });
  });

  it('puts it all together, and leaves out what it could not find', () => {
    const r = readReceipt('RONA\n123 Main St\n2026/11/08\nPAINT 1GAL 54.99\nSUBTOTAL 54.99\nHST 7.15\nTOTAL 62.14\nMASTERCARD 62.14', TODAY);
    expect(r).toMatchObject({ amount: 6214, date: '2026-11-08', vendor: 'RONA', category: 'repairs' });
    expect(r.found).toEqual(['amount', 'date', 'vendor', 'category']);
    const blank = readReceipt('~~ blurry ~~', TODAY);
    expect(blank.found).toEqual([]);
  });
});
