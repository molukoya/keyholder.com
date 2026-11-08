import { describe, expect, it } from 'vitest';
import type { AppState } from '../data/types';
import { parseETransferEmail, suggestMatch } from './matching';

const state = {
  units: [
    { id: 'u1', propertyId: 'p', label: 'A', rent: 165000, bedrooms: 2, utilitiesIncluded: [], status: 'occupied' },
    { id: 'u2', propertyId: 'p', label: 'B', rent: 145000, bedrooms: 1, utilitiesIncluded: [], status: 'occupied' },
  ],
  tenants: [
    { id: 't1', unitId: 'u1', names: ['Maya Chen'], email: '', phone: '', noticeMethod: 'email', emailConsent: true, aliases: [] },
    { id: 't2', unitId: 'u2', names: ['Jordan Patel', 'Priya Patel'], email: '', phone: '', noticeMethod: 'email', emailConsent: true, aliases: ['R Singh'] },
  ],
  leases: [
    { id: 'l1', unitId: 'u1', tenantId: 't1', start: '2026-11-01', rent: 165000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 0, utilities: '', parking: false, pets: false, emailNoticeConsent: true },
    { id: 'l2', unitId: 'u2', tenantId: 't2', start: '2026-11-01', rent: 145000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 0, utilities: '', parking: false, pets: false, emailNoticeConsent: true },
  ],
  payments: [],
} as unknown as AppState;

const today = '2026-11-03';

describe('payment matcher', () => {
  it('matches a known tenant paying the exact rent at high confidence', () => {
    const s = suggestMatch(state, { amount: 165000, payer: 'MAYA CHEN', memo: 'Nov rent', date: '2026-11-01' }, today)!;
    expect(s.leaseId).toBe('l1');
    expect(s.period).toBe('2026-11');
    expect(s.confidence).toBe('high');
  });

  it('uses learned aliases (BK-4)', () => {
    const s = suggestMatch(state, { amount: 145000, payer: 'R Singh', memo: '', date: '2026-11-02' }, today)!;
    expect(s.leaseId).toBe('l2');
    expect(s.confidence).toBe('high');
  });

  it('sends an unknown payer with the right amount to the tray, not auto-logged', () => {
    const s = suggestMatch(state, { amount: 145000, payer: 'Northside Holdings', memo: '', date: '2026-11-02' }, today)!;
    expect(s.leaseId).toBe('l2');
    expect(s.confidence).not.toBe('high');
  });

  it('ignores withdrawals and unrelated deposits', () => {
    expect(suggestMatch(state, { amount: -5000, payer: 'Maya Chen', memo: '', date: today }, today)).toBeNull();
    expect(suggestMatch(state, { amount: 1234, payer: 'Payroll Inc', memo: '', date: '2026-10-10' }, today)).toBeNull();
  });
});

describe('e-Transfer email parser', () => {
  it('reads the common Interac deposit notice', () => {
    const p = parseETransferEmail(`INTERAC e-Transfer: MAYA CHEN sent you money.

Hi Landlord,
MAYA CHEN has sent you $1,650.00 (CAD) and the money has been automatically deposited into your bank account.
Message: Nov rent unit A
Reference Number: CA1Xy7Pq`)!;
    expect(p).toEqual({ payer: 'Maya Chen', amount: 165000, memo: 'Nov rent unit A', reference: 'CA1Xy7Pq' });
  });

  it('returns null for unrelated email', () => {
    expect(parseETransferEmail('Your hydro bill is ready')).toBeNull();
  });
});
