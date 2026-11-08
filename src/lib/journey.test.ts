import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { allJourneyCards, journeyCards, prefKey } from './journey';
import { keyholderScore, scoreKey } from './score';

const today = '2026-11-08';

describe('tenant journey', () => {
  it("gives one card per tenant, unit or property, in the owner's order", () => {
    const s = seedState(undefined, today);
    const cards = journeyCards(s, today);
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // one card each
    const kinds = cards.map((c) => c.step.kind);
    expect(kinds[0]).toBe('confirm-payment'); // rent that came in first
    expect(kinds.indexOf('send-receipt')).toBeLessThan(kinds.indexOf('reminder'));
    expect(kinds.indexOf('review')).toBeLessThan(kinds.indexOf('mortgage'));
    expect(kinds[kinds.length - 1]).toBe('mortgage'); // mortgage renewal last
  });

  it('moves the same card to the next step', () => {
    const s = seedState(undefined, today);
    const sam = journeyCards(s, today).find((c) => c.id === 'lease-l-sam')!;
    expect(sam.step.kind).toBe('confirm-payment');
    // Confirming the payment logs it and drafts a receipt; the card then asks to send it.
    s.payments.push({ id: 'pay-x', leaseId: 'l-sam', period: '2026-11', date: today, amount: 150_000, method: 'etransfer', source: 'bank', createdAt: today });
    s.receipts.push({ id: 'r-x', number: 9999, paymentId: 'pay-x', status: 'draft', createdAt: today });
    s.messages.push({ id: 'msg-x', kind: 'receipt', tenantId: 't-sam', leaseId: 'l-sam', period: '2026-11', receiptId: 'r-x', subject: '', body: '', status: 'draft', edited: false, createdAt: today });
    s.txns.find((t) => t.id === 'tx-sam')!.status = 'matched';
    const next = journeyCards(s, today).find((c) => c.id === 'lease-l-sam')!;
    expect(next.step.kind).toBe('send-receipt');
  });

  it('hides and ignores per step, and ignored score items stop counting', () => {
    const s = seedState(undefined, today);
    const first = journeyCards(s, today)[0];
    s.todoPrefs[prefKey(first)] = { hiddenUntil: '2026-11-15' };
    expect(journeyCards(s, today).some((c) => c.id === first.id)).toBe(false);
    expect(allJourneyCards(s, today).some((c) => c.id === first.id)).toBe(true);
    const before = keyholderScore(s, today);
    s.todoPrefs[scoreKey(before.todo[0])] = { ignored: true };
    expect(keyholderScore(s, today).score).toBeGreaterThan(before.score);
  });
});
