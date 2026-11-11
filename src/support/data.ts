import type { ISODate, Province } from '../data/types';
import { addDays, todayISO } from '../lib/dates';
import { PACK_VERIFIED, PROVINCES } from '../lib/jurisdiction';

// Sample support data for the admin dashboard (Stage 1). Generated the same way every time from a fixed
// seed, dated relative to today. In Stage 2 every list here comes from the backend instead.

export type Plan = 'starter' | 'landlord';
export type Health = 'good' | 'watch' | 'risk';
export type BankLink = { bank: string; status: 'ok' | 'failing' };
export interface Customer {
  id: string; name: string; email: string; phone: string; province: Province; city: string;
  plan: Plan; units: number; properties: number; tenants: number;
  signedUp: ISODate; lastActive: ISODate; banks: BankLink[]; emailBounces: number;
  paymentStatus: 'ok' | 'failed' | 'none'; trialEnds?: ISODate; credit: number;
  /** What this subscriber pays per unit a month (the price when they subscribed). */
  unitPrice?: number;
  source: string; receiptsSent: number; deleted?: boolean; notes: string[];
}
export type TicketStatus = 'open' | 'waiting' | 'solved';
export type Priority = 'urgent' | 'high' | 'normal' | 'low';
export interface TicketMsg { from: 'customer' | 'agent' | 'note'; who: string; at: string; text: string }
export interface Ticket { id: string; customerId: string; subject: string; category: string; priority: Priority; status: TicketStatus; created: string; assignee: string; messages: TicketMsg[] }
export interface Invoice { id: string; customerId: string; date: ISODate; amount: number; status: 'paid' | 'failed' | 'refunded' }
export interface DataRequest { id: string; customerId: string; kind: 'copy' | 'delete'; received: ISODate; status: 'to do' | 'done' }
export type TeamRole = 'Super user' | 'Admin' | 'Support';
export interface Member { id: string; name: string; email: string; role: TeamRole }
/** A promo code for the Landlord plan (applied at checkout once card payments are on). */
export interface Promotion { id: string; code: string; kind: 'percent' | 'amount'; value: number; months: number; endsOn?: ISODate; maxUses?: number; uses: number; status: 'active' | 'paused' | 'ended'; created: string }
/** The super user's settings: the Landlord plan price, promotions, and which banks can be connected. */
export interface Platform { unitCents: number; promotions: Promotion[]; banks: { enabled: boolean; off: string[] } }
export const DEFAULT_UNIT_CENTS = 800;
export interface Reply { id: string; title: string; text: string }
export interface AuditEntry { id: string; at: string; who: string; action: string; detail: string }
export interface Announcement { id: string; text: string; where: 'website' | 'app' | 'both'; tone: 'info' | 'warning'; active: boolean; created: string }
export interface RuleStatus { code: Province; status: 'verified' | 'checking'; lastChecked: ISODate }
export interface SysError { id: string; at: string; area: string; message: string; count: number }

export const BANKS = ['RBC', 'TD', 'BMO', 'Scotiabank', 'CIBC', 'Desjardins', 'Tangerine', 'National Bank'];
export const SLA_HOURS: Record<Priority, number> = { urgent: 4, high: 8, normal: 24, low: 72 };

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FIRST = ['Amara', 'Ben', 'Chloe', 'Daniel', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isla', 'Jamal', 'Kate', 'Liam', 'Maya', 'Noah', 'Olivia', 'Priya', 'Quinn', 'Ravi', 'Sofia', 'Tom', 'Uma', 'Victor', 'Wen', 'Yara', 'Zoe', 'Arjun', 'Brigitte', 'Carlos', 'Dana', 'Émile', 'Fatima', 'Gabriel', 'Hannah', 'Ivan', 'Julie', 'Kwame', 'Lucie', 'Marc', 'Nadia', 'Owen'];
const LAST = ['Tremblay', 'Singh', 'Chen', 'MacDonald', 'Okafor', 'Gagnon', 'Patel', 'Nguyen', 'Roy', 'Wilson', 'Kowalski', 'Haddad', 'Leblanc', 'Martin', 'Ahmed', 'Campbell', 'Côté', 'Brown', 'Lee', 'Fraser', 'Morin', 'Kaur', 'Taylor', 'Bouchard', 'Walsh', 'Ito', 'Mensah', 'Novak', 'Reid', 'Silva'];
const SOURCES = ['Google search', 'A friend', 'Facebook group', 'Reddit', 'Landlord association', 'Other'];
// Where landlords are, roughly.
const WEIGHT: [Province, number][] = [['ON', 44], ['BC', 15], ['AB', 12], ['QC', 10], ['MB', 4], ['SK', 3], ['NS', 4], ['NB', 3], ['NL', 2], ['PE', 1], ['YT', 1], ['NT', 0.5], ['NU', 0.5]];
const TOPICS: [string, string, string][] = [
  ['bank', "My bank stopped connecting", "Keyholder says it can't check my TD account since yesterday. Rent is due this week, what should I do?"],
  ['billing', 'I was charged twice this month', 'I see two charges for my Keyholder plan on my credit card statement. Can you check?'],
  ['notices', 'Which notice do I give for late rent?', 'My tenant is 10 days late. Keyholder suggests an N4, is that the right one for Ontario?'],
  ['receipts', 'My tenant did not get the receipt', 'I sent the rent receipt but my tenant says nothing arrived. Can you resend it?'],
  ['account', "I can't sign in", "The sign-in link in my email doesn't open anything. I'm on my phone."],
  ['bug', 'The tax summary total looks wrong', 'My insurance shows twice in the tax summary. I only entered it once.'],
  ['question', 'Can I add my co-owner?', 'My sister owns half the house with me. Can she see the dashboard too?'],
  ['billing', 'How do I cancel?', "I sold my rental and won't need Keyholder after this month."],
  ['bank', 'A deposit was matched to the wrong tenant', 'Rent from Unit B was marked as paid by Unit A. How do I fix it?'],
  ['question', 'Do you work in Quebec?', 'I have a duplex in Gatineau. Are the TAL forms included?'],
  ['receipts', 'Can receipts show my company name?', 'I own the building through a numbered company. Can the receipt show it?'],
  ['account', 'Change my email address', 'I am switching from Hotmail to Gmail. How do I update my sign-in email?'],
];

export interface SupportBase {
  today: ISODate; customers: Customer[]; tickets: Ticket[]; invoices: Invoice[]; requests: DataRequest[];
  team: Member[]; replies: Reply[]; audit: AuditEntry[]; announcements: Announcement[]; rules: RuleStatus[]; errors: SysError[];
  platform: Platform;
  /** Who is looking: the super user, an admin or support staff. */
  myRole?: 'super' | 'admin' | 'support';
}

export function generateSupport(today: ISODate = todayISO()): SupportBase {
  const r = rng(20261109);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const prov = () => { let x = r() * WEIGHT.reduce((a, [, w]) => a + w, 0); for (const [p, w] of WEIGHT) { if ((x -= w) <= 0) return p; } return 'ON' as Province; };
  const customers: Customer[] = [];
  for (let i = 0; i < 240; i++) {
    const first = pick(FIRST), last = pick(LAST);
    // More signups recently: the product is growing.
    const ago = Math.floor(Math.pow(r(), 1.25) * 365);
    const signedUp = addDays(today, -ago);
    const units = r() < 0.45 ? 1 : 2 + Math.floor(Math.pow(r(), 1.5) * 9);
    const plan: Plan = units > 1 && r() < 0.85 ? 'landlord' : 'starter';
    const quiet = r();
    const lastActive = addDays(today, -Math.min(ago, Math.floor(quiet < 0.7 ? quiet * 6 : quiet < 0.9 ? 10 + quiet * 20 : 35 + quiet * 60)));
    const province = prov();
    const nBanks = r() < 0.25 ? 0 : r() < 0.7 ? 1 : 2;
    const banks: BankLink[] = Array.from({ length: nBanks }, () => ({ bank: province === 'QC' && r() < 0.5 ? 'Desjardins' : pick(BANKS), status: r() < 0.07 ? 'failing' : 'ok' }));
    customers.push({
      id: `c${1000 + i}`, name: `${first} ${last}`, email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[^a-z.]/g, '') + (i % 3 ? '@gmail.com' : '@outlook.com'),
      phone: `${pick(['416', '647', '905', '604', '403', '514', '613', '902'])}-555-0${String(100 + i).slice(-3)}`,
      province, city: pick(PROVINCES.find((p) => p.code === province)!.cities.filter((c) => c !== 'Other').concat([PROVINCES.find((p) => p.code === province)!.cities[0]])),
      plan, units, properties: Math.max(1, Math.ceil(units / (2 + Math.floor(r() * 3)))), tenants: Math.max(0, units - (r() < 0.2 ? 1 : 0)),
      signedUp, lastActive, banks, emailBounces: r() < 0.05 ? 1 + Math.floor(r() * 3) : 0,
      paymentStatus: plan === 'landlord' ? (r() < 0.05 ? 'failed' : 'ok') : 'none', credit: 0,
      trialEnds: plan === 'landlord' && ago < 30 ? addDays(signedUp, 30) : undefined,
      source: pick(SOURCES), receiptsSent: Math.floor((ago / 30) * units * (0.6 + r() * 0.4)), notes: [],
    });
  }
  customers.sort((a, b) => b.signedUp.localeCompare(a.signedUp));

  const invoices: Invoice[] = [];
  for (const c of customers.filter((x) => x.plan === 'landlord')) {
    for (let m = 0; m < 6; m++) {
      const date = addDays(today, -m * 30 - 3);
      if (date < addDays(c.signedUp, 30)) break;
      invoices.push({ id: `inv-${c.id}-${m}`, customerId: c.id, date, amount: c.units * 800, status: m === 0 && c.paymentStatus === 'failed' ? 'failed' : r() < 0.01 ? 'refunded' : 'paid' });
    }
  }

  const team: Member[] = [
    { id: 'm1', name: 'You', email: 'admin', role: 'Super user' },
    { id: 'm2', name: 'Nadia Rahman', email: 'nadia@keyholder.ca', role: 'Admin' },
    { id: 'm3', name: 'Leo Tremblay', email: 'leo@keyholder.ca', role: 'Support' },
  ];
  const platform: Platform = {
    unitCents: DEFAULT_UNIT_CENTS,
    promotions: [
      { id: 'pr1', code: 'WELCOME3', kind: 'percent', value: 50, months: 3, maxUses: 200, uses: 37, status: 'active', created: `${addDays(today, -40)}T14:00:00.000Z` },
      { id: 'pr2', code: 'SPRING10', kind: 'amount', value: 1000, months: 1, endsOn: addDays(today, -20), uses: 12, status: 'ended', created: `${addDays(today, -120)}T14:00:00.000Z` },
    ],
    banks: { enabled: true, off: [] },
  };
  const now = Date.parse(`${today}T15:00:00`);
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString();
  const tickets: Ticket[] = [];
  const pr: Priority[] = ['urgent', 'high', 'high', 'normal', 'normal', 'normal', 'normal', 'low'];
  for (let i = 0; i < 28; i++) {
    const [category, subject, text] = TOPICS[i % TOPICS.length];
    const c = customers[Math.floor(r() * 120)];
    const status: TicketStatus = i < 12 ? 'open' : i < 18 ? 'waiting' : 'solved';
    const priority: Priority = category === 'bank' && i < 6 ? 'urgent' : pick(pr);
    const hoursAgo = status === 'solved' ? 30 + r() * 200 : r() * (SLA_HOURS[priority] * 1.6);
    const messages: TicketMsg[] = [{ from: 'customer', who: c.name, at: iso(hoursAgo), text }];
    if (status !== 'open') messages.push({ from: 'agent', who: pick(['Nadia Rahman', 'Leo Tremblay']), at: iso(hoursAgo - 1.5), text: `Hi ${c.name.split(' ')[0]}, thanks for writing. We're looking into this and will update you shortly.` });
    if (status === 'solved') messages.push({ from: 'customer', who: c.name, at: iso(hoursAgo - 20), text: 'That fixed it, thank you!' });
    tickets.push({ id: `T-${2400 + i}`, customerId: c.id, subject, category, priority, status, created: iso(hoursAgo), assignee: status === 'open' && r() < 0.4 ? '' : pick(['Nadia Rahman', 'Leo Tremblay', 'You']), messages });
  }

  const requests: DataRequest[] = [
    { id: 'dr1', customerId: customers[40].id, kind: 'copy', received: addDays(today, -26), status: 'to do' },
    { id: 'dr2', customerId: customers[77].id, kind: 'delete', received: addDays(today, -12), status: 'to do' },
    { id: 'dr3', customerId: customers[15].id, kind: 'copy', received: addDays(today, -3), status: 'to do' },
    { id: 'dr4', customerId: customers[150].id, kind: 'delete', received: addDays(today, -45), status: 'done' },
  ];
  const replies: Reply[] = [
    { id: 'r1', title: 'Bank reconnect', text: 'Banks sometimes ask you to sign in again. Open Settings → Rent tracking and tap "Reconnect" next to the bank. Rent keeps being tracked from where it left off.' },
    { id: 'r2', title: 'Resend a receipt', text: "I've resent the receipt. It can take a few minutes, and it's worth checking the tenant's spam folder." },
    { id: 'r3', title: 'Which notice (Ontario)', text: 'For late rent in Ontario the first notice is the N4. Keyholder fills it in from your ledger; open the tenant and tap "Late rent options".' },
    { id: 'r4', title: 'Double charge', text: "Sorry about that. I can see the second charge and I've refunded it. It will show on your card in 3 to 5 business days." },
    { id: 'r5', title: 'Cancel plan', text: "I've switched you to the free Starter plan at the end of this billing month. Your records stay available, and you can export them any time from Settings." },
  ];
  const audit: AuditEntry[] = [
    { id: 'a1', at: iso(26), who: 'Nadia Rahman', action: 'Refund issued', detail: `$${(customers[3].units * 8).toFixed(2)} to ${customers[3].name}` },
    { id: 'a2', at: iso(50), who: 'Leo Tremblay', action: 'Sign-in link resent', detail: customers[9].email },
    { id: 'a3', at: iso(80), who: 'You', action: 'Province rules checked', detail: 'Ontario' },
  ];
  const announcements: Announcement[] = [
    { id: 'an1', text: 'Planned maintenance Sunday 2 to 3 a.m. Eastern. Bank checks pause during this hour.', where: 'app', tone: 'info', active: false, created: iso(120) },
  ];
  const rules: RuleStatus[] = PROVINCES.map((p) => ({ code: p.code, status: p.tier === 1 ? 'verified' : 'checking', lastChecked: p.tier === 1 ? PACK_VERIFIED : addDays(PACK_VERIFIED, -40 - p.tier * 10) }));
  const errors: SysError[] = [
    { id: 'e1', at: iso(2), area: 'Bank checks', message: 'TD: sign-in expired for some accounts', count: customers.filter((c) => c.banks.some((b) => b.bank === 'TD' && b.status === 'failing')).length || 3 },
    { id: 'e2', at: iso(9), area: 'Email', message: 'Receipts bounced: mailbox full or address wrong', count: customers.reduce((a, c) => a + c.emailBounces, 0) },
    { id: 'e3', at: iso(30), area: 'Forms', message: 'N4 preview took over 5 seconds', count: 4 },
  ];
  return { today, customers, tickets, invoices, requests, team, replies, audit, announcements, rules, errors, platform, myRole: 'super' };
}
