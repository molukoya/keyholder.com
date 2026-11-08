import type { AppState, BankTxn, ISODate, Lease, Message, Mortgage, Tone, Unit } from '../data/types';
import { addDays, daysBetween, fmtDate, periodOf } from './dates';
import { activeLease } from './finance';
import { formById, formsFor } from './forms';
import { arrears, earliestIncrease, nextNotice, propertyOf } from './notices';
import { trayItems } from './tray';
import { rentVsMarket } from './silver';
import { hasSilver } from './levels';
import { province } from './jurisdiction';
import type { LedgerLine } from './finance';

// The tenant journey: one card per tenant, empty unit or property, showing only the current step.
// Finishing a step moves the same card to the next one. Hide/Ignore work per step.

export type Stage = 'applied' | 'approved' | 'lease' | 'moved-in' | 'paying' | 'renewal' | 'moving-out';

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'applied', label: 'Applied' },
  { id: 'approved', label: 'Approved' },
  { id: 'lease', label: 'Lease signed' },
  { id: 'moved-in', label: 'Moved in' },
  { id: 'paying', label: 'Paying rent' },
  { id: 'renewal', label: 'Renewal' },
  { id: 'moving-out', label: 'Moving out' },
];

export type Step =
  | { kind: 'confirm-payment'; txn: BankTxn; leaseId: string; period: string }
  | { kind: 'send-receipt'; message: Message }
  | { kind: 'reminder'; lease: Lease; line: LedgerLine; tone: Tone }
  | { kind: 'form'; lease: Lease; formId: string; text: string }
  | { kind: 'deposit'; lease: Lease }
  | { kind: 'list-unit'; unit: Unit }
  | { kind: 'send-form'; unit: Unit }
  | { kind: 'review'; unit: Unit; count: number }
  | { kind: 'make-tenant'; unit: Unit; applicantId: string; name: string }
  | { kind: 'mortgage'; mortgage: Mortgage };

export interface JourneyCard {
  /** Stable per tenant / unit / property. */
  id: string;
  /** Stable per step, for Hide/Ignore. */
  stepKey: string;
  title: string;
  subtitle: string;
  stage: Stage | null;
  text: string;
  detail?: string;
  /** Lower comes first: rent that came in, receipts, late rent, units, renewals, mortgage. */
  priority: number;
  urgent?: boolean;
  step: Step;
  progress?: string;
}

const firstName = (n?: string) => n?.split(' ')[0] ?? 'the tenant';

function tenantCard(state: AppState, lease: Lease, today: ISODate): JourneyCard | null {
  const tenant = state.tenants.find((t) => t.id === lease.tenantId);
  const unit = state.units.find((u) => u.id === lease.unitId);
  const prop = propertyOf(state, lease);
  if (!tenant || !unit || !prop) return null;
  const who = firstName(tenant.names[0]);
  const base = { id: `lease-${lease.id}`, title: tenant.names.join(' & '), subtitle: `${prop.nickname} · Unit ${unit.label}` };
  const tray = trayItems(state, today);

  // Moving out
  if (lease.end && lease.end <= addDays(today, 60)) {
    const outDone = state.notices.some((n) => n.leaseId === lease.id && formById(n.formId)?.situation === 'inspection' && n.details?.moveType === 'Move-out');
    if (!outDone) {
      const f = formsFor(prop.province, 'inspection')[0];
      return { ...base, stepKey: 'move-out-inspection', stage: 'moving-out', text: `Do the move-out inspection with ${who}`, detail: `Last day ${fmtDate(lease.end)}`, priority: 3.5, step: { kind: 'form', lease, formId: f.id, text: 'Start inspection' }, progress: 'Step 1 of 2' };
    }
    if (!lease.depositReturned) return { ...base, stepKey: 'deposit', stage: 'moving-out', text: `Settle ${who}'s last month's deposit`, detail: 'Apply it to the last month, or return it with interest owed', priority: 3.5, step: { kind: 'deposit', lease }, progress: 'Step 2 of 2' };
    return null;
  }

  // New tenancy: lease, then move-in inspection (only for recent or future starts)
  if (daysBetween(lease.start, today) <= 45) {
    const leaseDone = state.notices.some((n) => n.leaseId === lease.id && formById(n.formId)?.situation === 'lease');
    if (!leaseDone) {
      const f = formsFor(prop.province, 'lease')[0];
      return { ...base, stepKey: 'lease', stage: 'lease', text: `Prepare ${who}'s lease`, detail: `${f.code} · starts ${fmtDate(lease.start)}`, priority: 3.5, step: { kind: 'form', lease, formId: f.id, text: 'Prepare lease' }, progress: 'Step 1 of 2' };
    }
    const inDone = state.notices.some((n) => n.leaseId === lease.id && formById(n.formId)?.situation === 'inspection' && n.details?.moveType !== 'Move-out');
    if (!inDone) {
      const f = formsFor(prop.province, 'inspection')[0];
      return { ...base, stepKey: 'move-in-inspection', stage: 'moved-in', text: `Do the move-in inspection with ${who}`, detail: 'Record each room, both of you sign', priority: 3.5, step: { kind: 'form', lease, formId: f.id, text: 'Start inspection' }, progress: 'Step 2 of 2' };
    }
  }

  // Paying rent: payment came in → receipt; or late → reminder → notice → tribunal
  const match = tray.find((t) => t.kind === 'match' && t.suggestion?.leaseId === lease.id);
  if (match && match.kind === 'match' && match.suggestion) {
    return { ...base, stepKey: `confirm-${match.txn.id}`, stage: 'paying', text: `${(match.txn.amount / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })} came in from ${match.txn.payer}. Is this ${who}'s rent?`, priority: 1, step: { kind: 'confirm-payment', txn: match.txn, leaseId: lease.id, period: match.suggestion.period }, progress: 'Step 1 of 2' };
  }
  const receipt = tray.find((t) => t.kind === 'message' && t.message.leaseId === lease.id && t.message.kind === 'receipt');
  if (receipt && receipt.kind === 'message') {
    const pay = state.payments.find((p) => p.id === state.receipts.find((r) => r.id === receipt.message.receiptId)?.paymentId);
    return { ...base, stepKey: `receipt-${receipt.message.id}`, stage: 'paying', text: `Send ${who}'s receipt`, detail: pay ? `${(pay.amount / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })} received ${fmtDate(pay.date)}` : undefined, priority: 2, step: { kind: 'send-receipt', message: receipt.message }, progress: 'Step 2 of 2' };
  }
  const reminder = tray.find((t) => t.kind === 'reminder' && t.lease.id === lease.id);
  const owing = arrears(state, lease, today);
  if (owing.total > 0) {
    const daysLate = Math.max(0, ...owing.periods.map((p) => daysBetween(`${p.period}-${String(lease.dueDay).padStart(2, '0')}`, today)));
    const owed = (owing.total / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
    if (reminder && reminder.kind === 'reminder') {
      return { ...base, stepKey: `reminder-${reminder.line.period}-${reminder.tone}`, stage: 'paying', urgent: true, text: `${who}'s rent is ${daysLate} day${daysLate === 1 ? '' : 's'} late. Send a ${reminder.tone} reminder`, detail: `${owed} owing`, priority: 3, step: { kind: 'reminder', lease, line: reminder.line, tone: reminder.tone }, progress: reminder.tone === 'firm' ? 'Late rent · step 2' : 'Late rent · step 1' };
    }
    const nn = nextNotice(state, lease, today);
    if (nn && daysLate >= state.profile.graceDays) {
      return { ...base, stepKey: `notice-${nn.form.id}`, stage: 'paying', urgent: true, text: `Still unpaid: prepare the ${nn.form.code}`, detail: `${owed} owing · ${nn.reason}`, priority: 3, step: { kind: 'form', lease, formId: nn.form.id, text: `Prepare ${nn.form.code}` }, progress: nn.form.kind === 'application' ? 'Late rent · step 4' : 'Late rent · step 3' };
    }
    return null;
  }

  // Renewal: a rent increase is allowed soon
  const inc = formsFor(prop.province, 'rent-increase')[0];
  const effective = earliestIncrease(state, lease, today, inc);
  const noticeBy = addDays(effective, -(inc.noticeDays ?? 90));
  if (daysBetween(today, noticeBy) <= 30 && daysBetween(today, noticeBy) >= 0) {
    const mk = rentVsMarket(prop, unit);
    const guide = province(prop.province).rentIncreaseGuidelinePct;
    const market = hasSilver(prop) ? ` · similar units rent for about ${(mk.market / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}${guide ? `; the ${guide}% guideline allows ${(Math.round(lease.rent * (1 + guide / 100)) / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })}` : ''}` : '';
    return { ...base, stepKey: `increase-${effective}`, stage: 'renewal', text: `You can raise ${who}'s rent from ${fmtDate(effective)}`, detail: `Give notice by ${fmtDate(noticeBy)}${market}`, priority: 5, step: { kind: 'form', lease, formId: inc.id, text: `Prepare ${inc.code}` } };
  }
  return null;
}

function unitCard(state: AppState, unit: Unit, today: ISODate): JourneyCard | null {
  if (activeLease(state, unit.id, today)) return null;
  const prop = state.properties.find((p) => p.id === unit.propertyId);
  if (!prop || prop.archived) return null;
  const base = { id: `unit-${unit.id}`, title: `Unit ${unit.label} is empty`, subtitle: prop.nickname, stage: 'applied' as Stage, priority: 4 };
  const listing = state.listings.find((l) => l.unitId === unit.id);
  const apps = state.applicants.filter((a) => a.unitId === unit.id);
  const offered = apps.find((a) => a.status === 'offered');
  if (offered) return { ...base, stage: 'approved', stepKey: `make-${offered.id}`, text: `Make ${offered.names.join(' & ')} the tenant`, detail: 'They accepted? Set the move-in date and rent', step: { kind: 'make-tenant', unit, applicantId: offered.id, name: offered.names[0] }, progress: 'Step 4 of 4' };
  const fresh = apps.filter((a) => a.status === 'new' || a.status === 'shortlisted');
  if (fresh.length) return { ...base, stepKey: `review-${fresh.length}`, text: `Review ${fresh.length} application${fresh.length > 1 ? 's' : ''}`, detail: 'Check references, then send an offer', step: { kind: 'review', unit, count: fresh.length }, progress: 'Step 3 of 4' };
  if (!listing) return { ...base, stepKey: 'list', text: 'List the unit', detail: 'Asking rent, date available, a short description', step: { kind: 'list-unit', unit }, progress: 'Step 1 of 4' };
  return { ...base, stepKey: 'send', text: 'Send the application form to people who ask', detail: 'By email, text, or a QR code on a sign', step: { kind: 'send-form', unit }, progress: 'Step 2 of 4' };
}

function mortgageCard(state: AppState, m: Mortgage, today: ISODate): JourneyCard | null {
  const n = daysBetween(today, m.termEnd);
  if (n < 0 || n > 120) return null;
  const prop = state.properties.find((p) => p.id === m.propertyId);
  return { id: `mortgage-${m.id}`, stepKey: `renew-${m.termEnd}`, title: 'Mortgage renewal', subtitle: prop?.nickname ?? '', stage: null, text: `Renews in ${n} days with ${m.lender}`, detail: 'Compare rates, then enter the new rate and term', priority: 6, step: { kind: 'mortgage', mortgage: m } };
}

/** Every journey card, in the owner's preferred order, before Hide/Ignore. */
export function allJourneyCards(state: AppState, today: ISODate): JourneyCard[] {
  const cards: JourneyCard[] = [];
  for (const u of state.units) {
    const l = activeLease(state, u.id, today) ?? state.leases.find((x) => x.unitId === u.id && x.end && x.end >= addDays(today, -30) && x.end <= addDays(today, 60));
    const c = l ? tenantCard(state, l, today) : null;
    if (c) cards.push(c);
    const uc = unitCard(state, u, today);
    if (uc) cards.push(uc);
  }
  for (const m of state.mortgages) { const c = mortgageCard(state, m, today); if (c) cards.push(c); }
  // Unmatched deposits that look like nobody's rent
  for (const t of trayItems(state, today)) {
    if (t.kind === 'match' && !t.suggestion) cards.push({ id: `txn-${t.txn.id}`, stepKey: 'who', title: 'Money came in', subtitle: t.txn.payer, stage: null, text: `${(t.txn.amount / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })} from ${t.txn.payer}. Whose rent is it?`, priority: 1, step: { kind: 'confirm-payment', txn: t.txn, leaseId: '', period: periodOf(today) } });
  }
  return cards.sort((a, b) => a.priority - b.priority);
}

export const prefKey = (c: { id: string; stepKey: string }) => `${c.id}:${c.stepKey}`;

export function isHidden(state: AppState, key: string, today: ISODate): boolean {
  const p = state.todoPrefs?.[key];
  return !!p && (!!p.ignored || (!!p.hiddenUntil && p.hiddenUntil > today));
}

/** The cards Home shows: one per tenant / unit / property, current step only, minus hidden and ignored. */
export function journeyCards(state: AppState, today: ISODate): JourneyCard[] {
  return allJourneyCards(state, today).filter((c) => !isHidden(state, prefKey(c), today));
}
