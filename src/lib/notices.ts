import type { AppState, Cents, ISODate, Lease, Notice, Period } from '../data/types';
import { addDays, fmtDate } from './dates';
import { leaseLedger } from './finance';
import { PACK_VERIFIED, province } from './jurisdiction';

// Late-rent notices. Ontario: N4 (notice to end tenancy for non-payment) then L1 (application to the LTB).
// PLACEHOLDER RULES — verify every period against Tribunals Ontario and the RTA before launch (PRD §6, N4-2).

/** Minimum N4 notice period in days. Reportedly 7 days for notices given on or after Sept 21, 2026; 14 before. */
export function n4NoticeDays(serveDate: ISODate): number {
  return serveDate >= '2026-09-21' ? 7 : 14;
}

/** Extra days when served by mail. */
export const MAIL_EXTRA_DAYS = 5;

export function terminationDate(serveDate: ISODate, method: Notice['serveMethod']): ISODate {
  return addDays(serveDate, n4NoticeDays(serveDate) + (method === 'mail' ? MAIL_EXTRA_DAYS : 0));
}

/** Rent owing for periods already due. Rent only — never late fees or other charges (N4-3). */
export function arrears(state: AppState, lease: Lease, today: ISODate): { total: Cents; periods: { period: Period; owing: Cents }[] } {
  const periods = leaseLedger(lease, state.payments, today)
    .filter((l) => l.due < today && l.paid < l.charge)
    .map((l) => ({ period: l.period, owing: l.charge - l.paid }));
  return { total: periods.reduce((a, p) => a + p.owing, 0), periods };
}

export interface Check { ok: boolean; text: string }

/** Checks before a notice can be approved. Any failed check holds the notice (PRD: never a one-click N4). */
export function noticeChecks(state: AppState, lease: Lease, method: Notice['serveMethod'], today: ISODate): Check[] {
  const tenant = state.tenants.find((t) => t.id === lease.tenantId);
  const unit = state.units.find((u) => u.id === lease.unitId);
  const prop = state.properties.find((p) => p.id === unit?.propertyId);
  const a = arrears(state, lease, today);
  const daysSinceVerified = Math.round((Date.parse(today) - Date.parse(PACK_VERIFIED)) / 86_400_000);
  return [
    { ok: a.total > 0, text: a.total > 0 ? 'Rent owing matches your ledger' : 'No rent is owing, so no notice is needed' },
    { ok: true, text: 'Only rent is claimed, no late fees or other charges' },
    { ok: !!tenant && tenant.names.length > 0 && !!prop?.address, text: 'Tenant names and the rental address are filled in' },
    { ok: !!state.profile.name, text: state.profile.name ? `Signed by ${state.profile.name}` : 'Add your name in Settings so the notice can be signed' },
    { ok: method !== 'email' || !!tenant?.emailConsent, text: method === 'email' ? (tenant?.emailConsent ? 'Tenant agreed to notices by email in the lease' : 'Tenant has not agreed to email notices. Deliver it by hand or mail instead') : 'Delivery method is allowed' },
    { ok: daysSinceVerified <= 120, text: `Form version checked ${fmtDate(PACK_VERIFIED)}` },
  ];
}

export function noticeName(kind: Notice['kind'], prov: string): string {
  if (kind === 'N4') return 'N4 · Notice to end your tenancy early for not paying rent';
  if (kind === 'L1') return 'L1 · Application to evict a tenant for not paying rent';
  return `Notice of rent owing · ${province(prov as never).name}`;
}

/** The notice the owner can prepare next for this lease, if any. */
export function nextNotice(state: AppState, lease: Lease, today: ISODate): { kind: Notice['kind']; reason: string } | null {
  const a = arrears(state, lease, today);
  if (a.total <= 0) return null;
  const unit = state.units.find((u) => u.id === lease.unitId);
  const prov = state.properties.find((p) => p.id === unit?.propertyId)?.province ?? 'ON';
  const served = state.notices.filter((n) => n.leaseId === lease.id && n.kind !== 'L1' && n.status === 'served').sort((x, y) => (y.servedOn ?? '').localeCompare(x.servedOn ?? ''))[0];
  if (prov !== 'ON') return served ? null : { kind: 'generic', reason: 'Rent is still unpaid' };
  if (!served) return { kind: 'N4', reason: 'Rent is still unpaid after reminders' };
  const filed = state.notices.some((n) => n.leaseId === lease.id && n.kind === 'L1');
  if (!filed && served.terminationDate && served.terminationDate < today) return { kind: 'L1', reason: `The N4 deadline (${fmtDate(served.terminationDate)}) has passed and rent is still owing` };
  return null;
}
