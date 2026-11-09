import { describe, expect, it } from 'vitest';
import { seedState } from '../data/seed';
import { activeLeases, currentLeases, hasSpace, openRooms, roomsLine } from './finance';
import { journeyCards } from './journey';
import { applicantPeople, tenantEmails, withPeople } from './people';

const today = '2026-11-08';

describe('several tenants in one unit', () => {
  it('gives a unit rented by the room a lease per room, and shows the free rooms', () => {
    const s = seedState(undefined, today);
    const bsmt = s.units.find((u) => u.id === 'u-bsmt')!;
    expect(activeLeases(s, bsmt.id, today).map((l) => l.room)).toEqual(['Room 1', 'Room 2']);
    expect(openRooms(s, bsmt, today)).toEqual(['Room 3']);
    expect(roomsLine(s, bsmt, today)).toBe('2 of 3 rooms rented');
    expect(hasSpace(s, bsmt, today)).toBe(true);
    // Each room's tenant has their own steps, and the free room has a "find a tenant" card.
    const cards = journeyCards(s, today);
    expect(cards.find((c) => c.id === 'lease-l-sam')?.subtitle).toContain('Room 1');
    expect(cards.find((c) => c.id === 'unit-u-bsmt')?.title).toBe('Unit Basement: Room 3 is free');
  });

  it('keeps a shared lease as one lease and one rent, with receipts to everyone', () => {
    const s = seedState(undefined, today);
    const b = s.units.find((u) => u.id === 'u-b')!;
    expect(activeLeases(s, b.id, today)).toHaveLength(1);
    expect(hasSpace(s, b, today)).toBe(false);
    expect(tenantEmails(s.tenants.find((t) => t.id === 't-patel')!)).toEqual(['jpatel@example.com', 'priya.patel@example.com']);
  });

  it("counts every rented room in the month's rent", () => {
    const s = seedState(undefined, today);
    expect(currentLeases(s, today).map((l) => l.id).sort()).toEqual(['l-grace', 'l-maya', 'l-patel', 'l-sam']);
  });

  it('keeps names, email and phone in step with the people on a lease', () => {
    const s = seedState(undefined, today);
    const t = withPeople(s.tenants[0], [{ name: ' Ana Silva ', email: 'ana@example.com', phone: '1' }, { name: '', email: 'x', phone: '' }, { name: 'Ben Silva', email: '', phone: '2' }]);
    expect(t.names).toEqual(['Ana Silva', 'Ben Silva']);
    expect(t.email).toBe('ana@example.com');
    expect(tenantEmails(t)).toEqual(['ana@example.com']);
  });

  it('lists each co-applicant with their own job and income', () => {
    const s = seedState(undefined, today);
    const novaks = applicantPeople(s.applicants.find((a) => a.id === 'ap-2')!);
    expect(novaks.map((p) => p.employer)).toEqual(['City of Hamilton', 'Novak Plumbing']);
    expect(novaks.reduce((n, p) => n + p.monthlyIncome, 0)).toBe(780_000);
  });
});
