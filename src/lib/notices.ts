import type { AppState, Cents, ISODate, Lease, Notice, Period, Property } from '../data/types';
import { addDays, addMonths, daysBetween, fmtDate } from './dates';
import { leaseLedger } from './finance';
import { PACK_VERIFIED, province } from './jurisdiction';
import { formById, formsFor, type FormDef } from './forms';

// Notices and forms. PLACEHOLDER RULES — verify every period against the official source before launch.

/** Ontario N4 minimum period: reportedly 7 days for notices given on or after Sept 21, 2026; 14 before. */
export function n4NoticeDays(serveDate: ISODate): number {
  return serveDate >= '2026-09-21' ? 7 : 14;
}

/** Extra days when served by mail (Ontario rule; used as a cautious default elsewhere). */
export const MAIL_EXTRA_DAYS = 5;

/** Earliest date a notice can take effect. Undefined when the owner must enter it. */
export function terminationDate(serveDate: ISODate, method: Notice['serveMethod'], form?: FormDef): ISODate | undefined {
  const days = !form || form.id === 'on-n4' ? n4NoticeDays(serveDate) : form.noticeDays;
  if (days === undefined) return undefined;
  return addDays(serveDate, days + (method === 'mail' ? MAIL_EXTRA_DAYS : 0));
}

/** Rent owing for periods already due. Rent only — never late fees or other charges. */
export function arrears(state: AppState, lease: Lease, today: ISODate): { total: Cents; periods: { period: Period; owing: Cents }[] } {
  const periods = leaseLedger(lease, state.payments, today)
    .filter((l) => l.due < today && l.paid < l.charge)
    .map((l) => ({ period: l.period, owing: l.charge - l.paid }));
  return { total: periods.reduce((a, p) => a + p.owing, 0), periods };
}

export const propertyOf = (state: AppState, lease: Lease): Property | undefined =>
  state.properties.find((p) => p.id === state.units.find((u) => u.id === lease.unitId)?.propertyId);

export interface Check { ok: boolean; text: string; warn?: boolean }

/** Checks before a form can be approved. A failed check holds it (never a one-click legal notice). */
export function formChecks(state: AppState, lease: Lease, form: FormDef, method: Notice['serveMethod'], today: ISODate, details: Record<string, string> = {}): Check[] {
  const tenant = state.tenants.find((t) => t.id === lease.tenantId);
  const prop = propertyOf(state, lease);
  const out: Check[] = [];
  if (form.situation === 'late-rent') {
    const a = arrears(state, lease, today);
    out.push({ ok: a.total > 0, text: a.total > 0 ? 'Rent owing matches your ledger' : 'No rent is owing, so this is not needed' });
    out.push({ ok: true, text: 'Only rent is claimed, no late fees or other charges' });
  }
  if (form.situation === 'rent-increase') {
    const newRent = Number(details.newRent || 0) * 100;
    const eff = details.effective || '';
    const lastIncrease = state.notices.filter((n) => n.leaseId === lease.id && formById(n.formId)?.situation === 'rent-increase').map((n) => n.details?.effective ?? '').sort().pop();
    const since = lastIncrease || lease.start;
    const guide = province(prop?.province ?? 'ON').rentIncreaseGuidelinePct;
    out.push({ ok: newRent > lease.rent, text: newRent > lease.rent ? `New rent is higher than ${(lease.rent / 100).toFixed(2)}` : 'Enter a new rent higher than the current rent' });
    out.push({ ok: !!eff && daysBetween(since, eff) >= 365, text: eff && daysBetween(since, eff) >= 365 ? 'At least 12 months since the tenancy started or the last increase' : 'Must be at least 12 months after the tenancy started or the last increase' });
    if (form.noticeDays) out.push({ ok: !!eff && daysBetween(today, eff) >= form.noticeDays, text: `At least ${form.noticeDays} days' notice before the increase` });
    if (guide && newRent > lease.rent) {
      const pct = ((newRent - lease.rent) / lease.rent) * 100;
      out.push({ ok: true, warn: pct > guide, text: pct > guide ? `${pct.toFixed(1)}% is above the ${guide}% guideline. Allowed only for exempt units or with approval.` : `${pct.toFixed(1)}% is within the ${guide}% guideline` });
    }
  }
  if (form.situation === 'damage') out.push({ ok: (details.what ?? '').trim().length > 10, text: 'What happened is described with dates' });
  if (form.situation === 'own-use') out.push({ ok: !!details.who?.trim(), text: 'Who will move in is named' });
  if (form.situation === 'end-agreement') out.push({ ok: !!details.endDate, text: 'An end date both of you agree to' });
  out.push({ ok: !!tenant?.names.length && !!prop?.address, text: 'Tenant names and the rental address are filled in' });
  out.push({ ok: !!state.profile.name, text: state.profile.name ? `Signed by ${state.profile.name}` : 'Add your name in Settings so the form can be signed' });
  if (form.kind === 'notice') out.push({ ok: method !== 'email' || !!tenant?.emailConsent, text: method === 'email' ? (tenant?.emailConsent ? 'Tenant agreed to notices by email' : 'Tenant has not agreed to email notices. Deliver it by hand or mail') : 'Delivery method is allowed' });
  const daysSince = daysBetween(PACK_VERIFIED, today);
  out.push({ ok: daysSince <= 120, text: `${form.official ? 'Form version' : 'Template'} checked ${fmtDate(PACK_VERIFIED)}` });
  return out;
}

/** What to do next about late rent for this lease, using the province's forms. */
export function nextNotice(state: AppState, lease: Lease, today: ISODate): { form: FormDef; reason: string } | null {
  const a = arrears(state, lease, today);
  if (a.total <= 0) return null;
  const prov = propertyOf(state, lease)?.province ?? 'ON';
  const forms = formsFor(prov, 'late-rent');
  const mine = state.notices.filter((n) => n.leaseId === lease.id && forms.some((f) => f.id === n.formId));
  const served = mine.filter((n) => n.status === 'served').sort((x, y) => (y.servedOn ?? '').localeCompare(x.servedOn ?? ''))[0];
  const notice = forms.find((f) => f.kind === 'notice');
  const app = forms.find((f) => f.kind === 'application');
  if (!served && notice) return { form: notice, reason: 'Rent is still unpaid after reminders' };
  if (app && !mine.some((n) => n.formId === app.id)) {
    if (!notice) return { form: app, reason: 'Rent is still unpaid' };
    if (served && (!served.terminationDate || served.terminationDate < today)) return { form: app, reason: served.terminationDate ? `The notice date (${fmtDate(served.terminationDate)}) has passed and rent is still owing` : 'Rent is still owing after your notice' };
  }
  return null;
}

/** Earliest allowed rent increase date for a lease (12-month rule and the form's notice period). */
export function earliestIncrease(state: AppState, lease: Lease, today: ISODate, form?: FormDef): ISODate {
  const last = state.notices.filter((n) => n.leaseId === lease.id && formById(n.formId)?.situation === 'rent-increase').map((n) => n.details?.effective ?? '').sort().pop();
  let d = addMonths(last || lease.start, 12);
  const minByNotice = addDays(today, form?.noticeDays ?? 90);
  while (d < minByNotice) d = addMonths(d, 12);
  return d;
}
