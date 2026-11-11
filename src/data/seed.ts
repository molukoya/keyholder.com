import type { AppState, Expense, Lease, Message, Payment, Profile, Province, Receipt } from './types';
import { addDays, addMonths, dueDate, periodOf, periodRange, todayISO } from '../lib/dates';

// Sample portfolio, dated relative to today so the demo always looks current.
// Two properties: a Hamilton triplex (Unit B is a couple on one shared lease, Unit C is empty with
// applications) and a Toronto home whose basement suite is rented by the room (2 of 3 rooms rented;
// the owner lives upstairs, 35% rental share).

export const STATE_VERSION = 12;

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
    phase: 3,
    theme: 'system',
    paperGrain: true,
  };
}

export function emptyState(profile?: Profile): AppState {
  return {
    version: STATE_VERSION,
    profile: profile ?? defaultProfile(),
    properties: [], units: [], tenants: [], leases: [], payments: [], receipts: [], messages: [],
    banks: [], txns: [], expenses: [], valuations: [], comparables: [], mortgages: [], listings: [], applicants: [], notices: [], todoPrefs: {}, audit: [],
  };
}

/**
 * Demo data: one personal-and-rental home and one investment property.
 * `asOf` pins the dates (tests); `provinceSamples` adds a one-unit rental in every other province (tests only).
 */
export function seedState(profile?: Profile, asOf?: string, provinceSamples = false): AppState {
  const today = asOf ?? todayISO();
  const thisPeriod = periodOf(today);
  const s = emptyState(profile);
  const now = new Date().toISOString();

  s.properties = [
    {
      id: 'p-maple', nickname: 'Maple triplex', address: '48 Maple Ave', city: 'Hamilton', province: 'ON', type: 'triplex',
      rentalSharePct: 100, ownerOccupied: false, ownershipPct: 100,
      purchaseDate: '2019-06-14', purchasePrice: 61_500_000, approxMortgageBalance: 40_400_000, approxMortgagePayment: 230_500,
      closingCosts: 350_000, landTransferTax: 865_000, improvementsAtPurchase: 1_200_000, landValuePct: 30,
      annualPropertyTax: 520_000, annualInsurance: 216_000, claimCCA: true,
    },
    {
      id: 'p-birch', nickname: 'Home + basement suite', address: '17 Birchmount Rd', city: 'Toronto', province: 'ON', type: 'house',
      rentalSharePct: 35, ownerOccupied: true, ownershipPct: 100, claimCCA: false,
      // Bronze on purpose: only rent is known, so its value is estimated from the rent.
    },
  ];

  s.units = [
    { id: 'u-a', propertyId: 'p-maple', label: 'A', rent: 165_000, bedrooms: 2, utilitiesIncluded: ['Water'], status: 'occupied' },
    { id: 'u-b', propertyId: 'p-maple', label: 'B', rent: 145_000, bedrooms: 1, utilitiesIncluded: ['Water', 'Heat'], status: 'occupied' },
    { id: 'u-c', propertyId: 'p-maple', label: 'C', rent: 155_000, bedrooms: 2, utilitiesIncluded: ['Water'], status: 'vacant' },
    { id: 'u-bsmt', propertyId: 'p-birch', label: 'Basement', rent: 85_000, bedrooms: 3, utilitiesIncluded: ['Water', 'Heat', 'Hydro', 'Internet'], status: 'occupied', rentedBy: 'room', rooms: 3 },
  ];

  s.tenants = [
    { id: 't-maya', unitId: 'u-a', names: ['Maya Chen'], email: 'maya.chen@example.com', phone: '905-555-0142', noticeMethod: 'email', emailConsent: true, emailConsentDate: '2025-02-20', aliases: [] },
    // A shared lease: two people, one rent. Receipts and reminders go to both.
    { id: 't-patel', unitId: 'u-b', names: ['Jordan Patel', 'Priya Patel'], email: 'jpatel@example.com', phone: '905-555-0178', noticeMethod: 'email', emailConsent: true, emailConsentDate: '2024-07-15', aliases: [],
      people: [{ name: 'Jordan Patel', email: 'jpatel@example.com', phone: '905-555-0178' }, { name: 'Priya Patel', email: 'priya.patel@example.com', phone: '905-555-0186' }] },
    // The basement suite is rented by the room: each room has its own tenant, lease and rent.
    { id: 't-sam', unitId: 'u-bsmt', names: ['Sam Okafor'], email: 'sam.okafor@example.com', phone: '416-555-0110', noticeMethod: 'hand', emailConsent: false, aliases: [] },
    { id: 't-grace', unitId: 'u-bsmt', names: ['Grace Liu'], email: 'grace.liu@example.com', phone: '416-555-0137', noticeMethod: 'email', emailConsent: true, emailConsentDate: addMonths(`${thisPeriod}-01`, -4), aliases: [] },
  ];

  const leases: Lease[] = [
    { id: 'l-maya', unitId: 'u-a', tenantId: 't-maya', start: '2025-03-01', rent: 165_000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 160_000, utilities: 'Tenant pays hydro', parking: true, pets: false, emailNoticeConsent: true },
    { id: 'l-patel', unitId: 'u-b', tenantId: 't-patel', start: '2024-08-01', rent: 145_000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 140_000, utilities: 'Tenant pays hydro', parking: false, pets: true, emailNoticeConsent: true },
    { id: 'l-sam', unitId: 'u-bsmt', tenantId: 't-sam', room: 'Room 1', start: addMonths(`${thisPeriod}-01`, -9), rent: 90_000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 90_000, utilities: 'All included', parking: false, pets: false, emailNoticeConsent: false },
    { id: 'l-grace', unitId: 'u-bsmt', tenantId: 't-grace', room: 'Room 2', start: addMonths(`${thisPeriod}-01`, -4), rent: 85_000, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: 85_000, utilities: 'All included', parking: false, pets: false, emailNoticeConsent: true },
  ];
  // Test-only: one small rental in every other province and territory, to exercise each province's forms.
  const PROVINCE_SAMPLES: [Province, string, string, string, string, number, string, boolean][] = [
    ['BC', 'Vancouver', '2215 Commercial Dr', 'Commercial Drive suite', 'Main', 2_150_00, 'Arjun Mehta', true],
    ['AB', 'Calgary', '1408 Kensington Rd NW', 'Kensington condo', '1408', 1_750_00, 'Chloe Tremblay', true],
    ['QC', 'Montréal', '4521 rue Saint-Denis', 'Plateau duplex', '2e', 1_450_00, 'Mathieu Gagnon', true],
    ['MB', 'Winnipeg', '88 Wolseley Ave', 'Wolseley house', 'Upper', 1_350_00, 'Grace Kowalski', true],
    ['SK', 'Saskatoon', '312 Broadway Ave', 'Broadway apartment', '2', 1_250_00, 'Liam Bear', false],
    ['NS', 'Halifax', '5670 North St', 'North End flat', 'Lower', 1_800_00, 'Fatima Haddad', false],
    ['NB', 'Moncton', '45 Archibald St', 'Archibald duplex', 'A', 1_300_00, 'Owen LeBlanc', false],
    ['PE', 'Charlottetown', '19 Fitzroy St', 'Fitzroy townhouse', '1', 1_400_00, 'Hannah MacDonald', false],
    ['NL', "St. John's", '77 Gower St', 'Gower Street row house', 'Main', 1_350_00, 'Noah Walsh', false],
    ['YT', 'Whitehorse', '503 Wood St', 'Wood Street suite', 'Suite', 1_700_00, 'Ella Smith', false],
    ['NT', 'Yellowknife', '4910 50th Ave', 'Old Town apartment', '3', 1_900_00, 'Jacob Lafferty', false],
    ['NU', 'Iqaluit', '1085 Mivvik St', 'Mivvik Street unit', 'B', 2_400_00, 'Mary Kilabuk', false],
  ];
  const lateSamples = new Set<string>();
  const sampleLeases = new Set<string>();
  (provinceSamples ? PROVINCE_SAMPLES : []).forEach(([prov, city, address, nickname, label, rent, tenant, late], i) => {
    const pid = `p-${prov.toLowerCase()}`, uid2 = `u-${prov.toLowerCase()}`, tid = `t-${prov.toLowerCase()}`, lid = `l-${prov.toLowerCase()}`;
    s.properties.push({ id: pid, nickname, address, city, province: prov, type: 'other', rentalSharePct: 100, ownerOccupied: false, ownershipPct: 100, claimCCA: false });
    s.units.push({ id: uid2, propertyId: pid, label, rent, bedrooms: 2, utilitiesIncluded: ['Water'], status: 'occupied' });
    const first = tenant.split(' ')[0].toLowerCase();
    s.tenants.push({ id: tid, unitId: uid2, names: [tenant], email: `${first}@example.com`, phone: '', noticeMethod: 'email', emailConsent: i % 3 !== 2, emailConsentDate: i % 3 !== 2 ? addMonths(`${thisPeriod}-01`, -14) : undefined, aliases: [] });
    leases.push({ id: lid, unitId: uid2, tenantId: tid, start: addMonths(`${thisPeriod}-01`, -14), rent, dueDay: 1, paymentMethod: 'etransfer', lmrDeposit: rent, utilities: 'Tenant pays hydro', parking: false, pets: false, emailNoticeConsent: i % 3 !== 2 });
    sampleLeases.add(lid);
    if (late) lateSamples.add(lid);
  });
  s.leases = leases;

  // Payments for the last 14 months, through last month; this month is set up for the demo.
  const payments: Payment[] = [];
  const receipts: Receipt[] = [];
  const messages: Message[] = [];
  let rn = 1001;
  const from = addMonths(`${thisPeriod}-01`, -36).slice(0, 7); // back to each lease's start (up to 3 years)
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
  // Grace paid on the 1st; her receipt went out then.
  const graceId = `pay-l-grace-${thisPeriod}`;
  payments.push({ id: graceId, leaseId: 'l-grace', period: thisPeriod, date: mayaDate, amount: 85_000, method: 'etransfer', source: 'bank', createdAt: `${mayaDate}T09:00:00.000Z` });
  receipts.push({ id: `rcpt-${graceId}`, number: rn++, paymentId: graceId, status: 'sent', createdAt: `${mayaDate}T09:05:00.000Z`, sentAt: `${mayaDate}T09:05:00.000Z` });
  // Province samples: this month paid on the 1st unless the sample is meant to be late.
  for (const l of leases.filter((x) => sampleLeases.has(x.id) && !lateSamples.has(x.id))) {
    const due = dueDate(thisPeriod, 1);
    if (due > today) continue;
    const id = `pay-${l.id}-${thisPeriod}`;
    payments.push({ id, leaseId: l.id, period: thisPeriod, date: due, amount: l.rent, method: 'etransfer', source: 'manual', createdAt: `${due}T09:00:00.000Z` });
    receipts.push({ id: `rcpt-${id}`, number: rn++, paymentId: id, status: 'sent', createdAt: `${due}T09:05:00.000Z`, sentAt: `${due}T09:05:00.000Z` });
  }
  s.payments = payments;
  s.receipts = receipts;
  s.messages = messages;

  // Bank connected; Sam's deposit came from a joint account and needs a look.
  const synced = new Date(Date.now() - 3 * 3600_000).toISOString();
  s.banks = [
    { id: 'bank-1', bank: 'RBC', accountMask: '•••• 4417', status: 'connected', lastSync: synced },
    { id: 'bank-2', bank: 'TD', accountMask: '•••• 9031', status: 'connected', lastSync: synced },
  ];
  s.txns = [
    { id: 'tx-maya', source: 'bank', date: mayaDate, amount: 165_000, payer: 'MAYA CHEN', memo: 'rent unit A', status: 'matched', paymentId: mayaId },
    { id: 'tx-grace', source: 'bank', date: mayaDate, amount: 85_000, payer: 'GRACE LIU', memo: 'room 2 rent', status: 'matched', paymentId: graceId },
    { id: 'tx-sam', source: 'bank', date: addDays(dueDate(thisPeriod, 1), 1) <= today ? addDays(dueDate(thisPeriod, 1), 1) : today, amount: 90_000, payer: 'S OKAFOR-BELL', memo: '', status: 'new' },
    { id: 'tx-payroll', source: 'bank', date: addDays(today, -3), amount: 412_500, payer: 'ACME PAYROLL', memo: 'Salary', status: 'ignored' },
    // Withdrawals the banks found this month, waiting to be sorted (expenses and mortgage payments).
    { id: 'tx-tax', source: 'bank', bankId: 'bank-1', date: addDays(today, -5), amount: -130_000, payer: 'CITY OF HAMILTON TAX', memo: 'Pre-authorized debit', status: 'new' },
    { id: 'tx-enb', source: 'bank', bankId: 'bank-2', date: addDays(today, -4), amount: -21_240, payer: 'ENBRIDGE GAS', memo: 'Pre-authorized debit', status: 'new' },
    { id: 'tx-hd', source: 'bank', bankId: 'bank-1', date: addDays(today, -2), amount: -8_645, payer: 'HOME DEPOT #7011', memo: 'Debit purchase', status: 'new' },
    { id: 'tx-rbcm', source: 'bank', bankId: 'bank-1', date: `${thisPeriod}-01`, amount: -230_069, payer: 'RBC MORTGAGE PMT', memo: 'Mortgage payment', status: 'new' },
    { id: 'tx-tdm', source: 'bank', bankId: 'bank-2', date: `${thisPeriod}-01`, amount: -445_000, payer: 'TD MORTGAGE PMT', memo: 'Mortgage payment', status: 'new' },
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
  ];
  s.comparables = [
    { id: 'c-1', propertyId: 'p-maple', address: '61 Maple Ave', saleDate: addMonths(today, -4), price: 70_500_000, bedrooms: 3, similarity: 'similar' },
    { id: 'c-2', propertyId: 'p-maple', address: '12 Kenilworth Ave N', saleDate: addMonths(today, -7), price: 67_900_000, bedrooms: 3, similarity: 'less' },
  ];

  // Phase 3
  s.mortgages = [
    { id: 'm-maple', propertyId: 'p-maple', lender: 'RBC Royal Bank', principal: 49_200_000, startDate: '2019-07-01', ratePct: 2.89, amortYears: 25, termEnd: addDays(today, 110), frequency: 'monthly' },
  ];

  // An empty unit with a listing and two applications (one from a couple applying together),
  // and the basement's free room with one application.
  const vacantSince = addMonths(`${thisPeriod}-01`, -1);
  s.listings = [
    { unitId: 'u-c', askingRent: 155_000, available: addDays(today, 7), notes: 'Freshly painted 2-bedroom on the top floor. Laundry in the basement.', vacantSince, slug: 'maple-c' },
    { unitId: 'u-bsmt', askingRent: 85_000, available: addDays(today, 10), notes: 'Furnished room in a shared basement suite, near Kennedy station. Heat, hydro and internet included.', vacantSince, slug: 'birch-room' },
  ];
  s.applicants = [
    { id: 'ap-1', unitId: 'u-c', names: ['Daniel Osei'], email: 'd.osei@example.com', phone: '905-555-0191', submitted: addDays(today, -4), moveIn: addDays(today, 14),
      currentAddress: '210 King St E, Hamilton', yearsAtAddress: 3, employer: 'McMaster University (lab technician)', monthlyIncome: 520_000, references: 'Former employer reference: Dr. K. Singh', pets: false, notes: '', status: 'new',
      occupants: 1, emergencyContact: 'Ama Osei (sister), 905-555-0122', currentRent: 135_000, landlordName: 'R. Fischer', landlordPhone: '905-555-0110', reasonLeaving: 'Building is being sold',
      previousAddress: '88 Bay St N, Hamilton', previousYears: 2, jobTitle: 'Lab technician', employedYears: 4, employerContact: 'HR, 905-555-0100', otherIncome: 0, leaseTerm: '1 year, then month to month',
      vehicles: 1, smoking: false, creditConsent: true, documents: ['Photo ID', 'Employment letter', 'Credit report'] },
    { id: 'ap-2', unitId: 'u-c', names: ['Lena Novak', 'Tom Novak'], email: 'lena.novak@example.com', phone: '289-555-0163', submitted: addDays(today, -2), moveIn: addDays(today, 24),
      people: [
        { name: 'Lena Novak', email: 'lena.novak@example.com', phone: '289-555-0163', employer: 'City of Hamilton', jobTitle: 'Planner', monthlyIncome: 460_000 },
        { name: 'Tom Novak', email: 'tom.novak@example.com', phone: '289-555-0168', employer: 'Novak Plumbing', jobTitle: 'Plumber (self-employed)', monthlyIncome: 320_000 },
      ],
      currentAddress: '15 James St S, Hamilton', yearsAtAddress: 5, employer: 'City of Hamilton; Novak Plumbing', monthlyIncome: 780_000, references: 'Personal: Mark Chen, 289-555-0140', pets: true, notes: 'One cat', status: 'new',
      occupants: 2, emergencyContact: 'Eva Novak (mother), 289-555-0199', currentRent: 160_000, landlordName: 'Sandra Lee', landlordPhone: '905-555-0175', reasonLeaving: 'Want a second bedroom',
      previousAddress: '402 Main St E, Hamilton', previousYears: 3, jobTitle: 'Planner; plumber (self-employed)', employedYears: 6, employerContact: 'City HR, 905-555-0150', otherIncome: 40_000, otherIncomeSource: 'Rental parking spot',
      leaseTerm: '2 years', vehicles: 2, smoking: false, creditConsent: true, documents: ['Photo ID', 'Pay stubs'] },
    { id: 'ap-3', unitId: 'u-bsmt', names: ['Kofi Mensah'], email: 'kofi.mensah@example.com', phone: '647-555-0129', submitted: addDays(today, -3), moveIn: addDays(today, 18),
      currentAddress: '55 Gerrard St W, Toronto', yearsAtAddress: 1, employer: 'Scarborough Health Network', monthlyIncome: 360_000, references: 'Current landlord: P. Russo, 416-555-0191', pets: false, notes: 'Works night shifts', status: 'new',
      occupants: 1, emergencyContact: 'Efua Mensah (mother), 905-555-0177', currentRent: 95_000, landlordName: 'P. Russo', landlordPhone: '416-555-0191', reasonLeaving: 'Closer to work',
      jobTitle: 'Personal support worker', employedYears: 2, employerContact: 'HR, 416-555-0140', otherIncome: 0, leaseTerm: '1 year', vehicles: 0, smoking: false, creditConsent: true, documents: ['Photo ID', 'Pay stubs'] },
  ];

  s.audit = [{ id: 'a-0', at: now, action: 'Sample data loaded', detail: 'Two properties, four leases (one shared, two by the room), a year of history' }];
  return s;
}
