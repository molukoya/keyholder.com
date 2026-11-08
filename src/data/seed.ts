import type { AppState, Expense, Lease, Message, Payment, Profile, Receipt } from './types';
import { addDays, addMonths, dueDate, periodOf, periodRange, todayISO } from '../lib/dates';

// Sample portfolio, dated relative to today so the demo always looks current.
// Two properties: a Hamilton duplex (fully rented) and a Toronto home with a basement suite
// (owner lives upstairs, 35% rental share).

export const STATE_VERSION = 3;

export function defaultProfile(): Profile {
  return {
    onboarded: false,
    name: '',
    email: '',
    province: 'ON',
    city: 'Toronto',
    setup: 'few',
    rentMethod: 'etransfer',
    dreads: [],
    taxWorries: [],
    goal: 'no-chasing',
    rentArrival: 'bank',
    reminderTone: 'gentle',
    graceDays: 5,
    autoSend: false,
    approvedUnchanged: 0,
    autoSendOffered: false,
    forwardingAddress: `rent-${Math.random().toString(36).slice(2, 8)}@in.keyholder.ca`,
    phase: 1,
    theme: 'system',
    paperGrain: true,
  };
}

export function emptyState(profile?: Profile): AppState {
  return {
    version: STATE_VERSION,
    profile: profile ?? defaultProfile(),
    properties: [], units: [], tenants: [], leases: [], payments: [], receipts: [], messages: [],
    txns: [], expenses: [], valuations: [], comparables: [], mortgages: [], audit: [],
  };
}

export function seedState(profile?: Profile): AppState {
  const today = todayISO();
  const thisPeriod = periodOf(today);
  const s = emptyState(profile);
  const now = new Date().toISOString();

  s.properties = [
    {
      id: 'p-maple', nickname: 'Maple duplex', address: '48 Maple Ave', city: 'Hamilton', province: 'ON', type: 'duplex',
      rentalSharePct: 100, ownerOccupied: false, ownershipPct: 100,
      purchaseDate: '2019-06-14', purchasePrice: 61_500_000, approxMortgageBalance: 40_400_000, approxMortgagePayment: 230_500,
      closingCosts: 350_000, landTransferTax: 865_000, improvementsAtPurchase: 1_200_000, landValuePct: 30,
      annualPropertyTax: 520_000, annualInsurance: 216_000, claimCCA: true,
    },
    {
      id: 'p-birch', nickname: 'Home + basement suite', address: '17 Birchmount Rd', city: 'Toronto', province: 'ON', type: 'house',
      rentalSharePct: 35, ownerOccupied: true, ownershipPct: 100,
      purchaseDate: '2021-09-01', purchasePrice: 108_000_000, approxMortgageBalance: 76_800_000, approxMortgagePayment: 445_000,
      closingCosts: 420_000, landTransferTax: 3_247_500, landValuePct: 55,
      annualPropertyTax: 740_000, annualInsurance: 288_000, claimCCA: false,
    },
  ];

  s.units = [
    { id: 'u-a', propertyId: 'p-maple', label: 'A', rent: 165_000, bedrooms: 2, utilitiesIncluded: ['Water'], status: 'occupied' },
    { id: 'u-b', propertyId: 'p-maple', label: 'B', rent: 145_000, bedrooms: 1, utilitiesIncluded: ['Water', 'Heat'], status: 'occupied' },
    { id: 'u-bsmt', propertyId: 'p-birch', label: 'Basement', rent: 150_000, bedrooms: 1, utilitiesIncluded: ['Water', 'Heat', 'Hydro', 'Internet'], status: 'occupied' },
  ];

  s.tenants = [
    { id: 't-maya', unitId: 'u-a', names: ['Maya Chen'], email: 'maya.chen@example.com', phone: '905-555-0142', noticeMethod: 'email', emailConsent: true, emailConsentDate: '2025-02-20', aliases: [] },
    { id: 't-patel', unitId: 'u-b', names: ['Jordan Patel', 'Priya Patel'], email: 'jpatel@example.com', phone: '905-555-0178', noticeMethod: 'email', emailConsent: true, emailConsentDate: '2024-07-15', aliases: [] },
    { id: 't-sam', unitId: 'u-bsmt', names: ['Sam Okafor'], email: 'sam.okafor@example.com', phone: '416-555-0110', noticeMethod: 'hand', emailConsent: false, aliases: [] },
  ];

  const leases: Lease[] = [
    { id: 'l-maya', unitId: 'u-a', tenantId: 't-maya', start: '2025-03-01', rent: 165_000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 160_000, utilities: 'Tenant pays hydro', parking: true, pets: false, emailNoticeConsent: true },
    { id: 'l-patel', unitId: 'u-b', tenantId: 't-patel', start: '2024-08-01', rent: 145_000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 140_000, utilities: 'Tenant pays hydro', parking: false, pets: true, emailNoticeConsent: true },
    { id: 'l-sam', unitId: 'u-bsmt', tenantId: 't-sam', start: addMonths(`${thisPeriod}-01`, -9), rent: 150_000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 150_000, utilities: 'All included', parking: false, pets: false, emailNoticeConsent: false },
  ];
  s.leases = leases;

  // Payments for the last 14 months, through last month; this month is set up for the demo.
  const payments: Payment[] = [];
  const receipts: Receipt[] = [];
  const messages: Message[] = [];
  let rn = 1001;
  const from = addMonths(`${thisPeriod}-01`, -14).slice(0, 7);
  const lastPeriod = addMonths(`${thisPeriod}-01`, -1).slice(0, 7);
  for (const l of leases) {
    for (const p of periodRange(from < periodOf(l.start) ? periodOf(l.start) : from, lastPeriod)) {
      const late = l.id === 'l-patel' && p === addMonths(`${thisPeriod}-01`, -3).slice(0, 7);
      const date = addDays(dueDate(p, l.dueDay), late ? 6 : l.id === 'l-maya' ? -1 : 0);
      const id = `pay-${l.id}-${p}`;
      payments.push({ id, leaseId: l.id, period: p, date, amount: l.rent, method: 'etransfer', source: 'bank', createdAt: `${date}T09:00:00.000Z` });
      const rid = `rcpt-${id}`;
      receipts.push({ id: rid, number: rn++, paymentId: id, status: 'sent', createdAt: `${date}T09:05:00.000Z`, sentAt: `${date}T09:05:00.000Z` });
    }
  }
  // This month: Maya paid on the 1st, receipt drafted and waiting for approval (co-pilot).
  const mayaId = `pay-l-maya-${thisPeriod}`;
  const mayaDate = dueDate(thisPeriod, 1) <= today ? dueDate(thisPeriod, 1) : today;
  payments.push({ id: mayaId, leaseId: 'l-maya', period: thisPeriod, date: mayaDate, amount: 165_000, method: 'etransfer', source: 'bank', createdAt: now });
  receipts.push({ id: `rcpt-${mayaId}`, number: rn++, paymentId: mayaId, status: 'draft', createdAt: now });
  messages.push({
    id: `msg-${mayaId}`, kind: 'receipt', tenantId: 't-maya', leaseId: 'l-maya', period: thisPeriod, receiptId: `rcpt-${mayaId}`,
    subject: 'Your rent receipt', body: '', status: 'draft', edited: false, createdAt: now,
  });
  s.payments = payments;
  s.receipts = receipts;
  s.messages = messages;

  // Bank connected; Sam's deposit came from a joint account and needs a look.
  s.bank = { id: 'bank-1', bank: 'RBC', accountMask: '•••• 4417', status: 'connected', lastSync: now };
  s.txns = [
    { id: 'tx-maya', source: 'bank', date: mayaDate, amount: 165_000, payer: 'MAYA CHEN', memo: 'rent unit A', status: 'matched', paymentId: mayaId },
    { id: 'tx-sam', source: 'bank', date: addDays(dueDate(thisPeriod, 1), 1) <= today ? addDays(dueDate(thisPeriod, 1), 1) : today, amount: 150_000, payer: 'S OKAFOR-BELL', memo: '', status: 'new' },
    { id: 'tx-payroll', source: 'bank', date: addDays(today, -3), amount: 412_500, payer: 'ACME PAYROLL', memo: 'Salary', status: 'ignored' },
    { id: 'tx-hydro', source: 'bank', date: addDays(today, -4), amount: -9_640, payer: 'ALECTRA UTILITIES', memo: 'Pre-authorized debit', status: 'new' },
  ];

  // Expenses across the last year.
  const e = (o: Partial<Expense> & Pick<Expense, 'propertyId' | 'date' | 'amount' | 'vendor' | 'category'>, i: number): Expense => ({
    id: `exp-${i}`, kind: 'current', scope: 'shared', createdAt: now, ...o,
  });
  const m = (n: number, day = 10) => addDays(addMonths(`${thisPeriod}-01`, -n), day - 1);
  const ex: Expense[] = [];
  let i = 1;
  for (let k = 0; k < 12; k++) {
    if (m(k) > today) continue;
    ex.push(e({ propertyId: 'p-maple', date: m(k, 14), amount: 6_800 + (k % 3) * 900, vendor: 'Hamilton Water', category: 'utilities' }, i++));
    ex.push(e({ propertyId: 'p-birch', date: m(k, 18), amount: 18_500 + (k % 4) * 2_100, vendor: 'Enbridge Gas', category: 'utilities' }, i++));
  }
  for (const k of [0, 3, 6, 9]) {
    if (m(k) > today) continue;
    ex.push(e({ propertyId: 'p-maple', date: m(k, 2), amount: 130_000, vendor: 'City of Hamilton', category: 'property-tax', note: 'Instalment' }, i++));
    ex.push(e({ propertyId: 'p-birch', date: m(k, 3), amount: 185_000, vendor: 'City of Toronto', category: 'property-tax', note: 'Instalment' }, i++));
  }
  ex.push(e({ propertyId: 'p-maple', date: m(7, 1), amount: 216_000, vendor: 'Square One Insurance', category: 'insurance', note: 'Annual landlord policy', recurring: true }, i++));
  ex.push(e({ propertyId: 'p-birch', date: m(5, 1), amount: 288_000, vendor: 'Intact Insurance', category: 'insurance', note: 'Home policy with suite endorsement', recurring: true }, i++));
  ex.push(e({ propertyId: 'p-maple', date: addDays(today, -6) >= `${thisPeriod}-01` ? addDays(today, -6) : `${thisPeriod}-01`, amount: 42_000, vendor: 'Steeltown Heating', category: 'repairs', note: 'Furnace igniter replaced', unitId: 'u-b' }, i++));
  ex.push(e({ propertyId: 'p-maple', date: m(2, 22), amount: 129_900, vendor: 'Best Buy', category: 'repairs', kind: 'capital', scope: 'direct', unitId: 'u-a', ccaClass: '8', note: 'New fridge for unit A' }, i++));
  ex.push(e({ propertyId: 'p-maple', date: m(4, 12), amount: 18_000, vendor: 'GreenEdge Lawn', category: 'repairs', note: 'Spring clean-up' }, i++));
  ex.push(e({ propertyId: 'p-birch', date: m(3, 8), amount: 38_500, vendor: 'Roto-Rooter', category: 'repairs', scope: 'direct', unitId: 'u-bsmt', note: 'Basement drain cleared' }, i++));
  ex.push(e({ propertyId: 'p-birch', date: m(8, 15), amount: 860_000, vendor: 'Northline Renovations', category: 'repairs', kind: 'capital', scope: 'direct', unitId: 'u-bsmt', note: 'Egress window and new flooring' }, i++));
  ex.push(e({ propertyId: 'p-maple', date: m(6, 20), amount: 45_000, vendor: 'Kim & Associates CPA', category: 'professional', scope: 'direct', note: 'Tax return preparation' }, i++));
  ex.push(e({ propertyId: 'p-maple', date: m(1, 5), amount: 2_400, vendor: 'Canada Post', category: 'other', scope: 'direct' }, i++));
  s.expenses = ex.sort((a, b) => b.date.localeCompare(a.date));

  // Phase 2
  s.valuations = [
    { id: 'v-1', propertyId: 'p-maple', date: '2019-06-14', source: 'purchase', low: 61_500_000, likely: 61_500_000, high: 61_500_000, confidence: 'high', note: 'Purchase price' },
    { id: 'v-2', propertyId: 'p-maple', date: addMonths(today, -13), source: 'owner', low: 69_000_000, likely: 72_000_000, high: 75_000_000, confidence: 'medium', note: 'My estimate after a neighbour sold' },
    { id: 'v-3', propertyId: 'p-birch', date: '2021-09-01', source: 'purchase', low: 108_000_000, likely: 108_000_000, high: 108_000_000, confidence: 'high', note: 'Purchase price' },
  ];
  s.comparables = [
    { id: 'c-1', propertyId: 'p-maple', address: '61 Maple Ave', saleDate: addMonths(today, -4), price: 70_500_000, bedrooms: 3, similarity: 'similar' },
    { id: 'c-2', propertyId: 'p-maple', address: '12 Kenilworth Ave N', saleDate: addMonths(today, -7), price: 67_900_000, bedrooms: 3, similarity: 'less' },
  ];

  // Phase 3
  s.mortgages = [
    { id: 'm-maple', propertyId: 'p-maple', lender: 'RBC Royal Bank', principal: 49_200_000, startDate: '2019-07-01', ratePct: 2.89, amortYears: 25, termEnd: addDays(today, 110), frequency: 'monthly' },
    { id: 'm-birch', propertyId: 'p-birch', lender: 'TD Canada Trust', principal: 80_500_000, startDate: '2024-10-01', ratePct: 4.39, amortYears: 22, termEnd: '2029-10-01', frequency: 'monthly' },
  ];

  s.audit = [{ id: 'a-0', at: now, action: 'Sample data loaded', detail: 'Two properties, three tenants, a year of history' }];
  return s;
}
