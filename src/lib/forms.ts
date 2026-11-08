import type { Province } from '../data/types';

// Forms registry (PRD LF-1): every form a landlord commonly needs, by province and situation.
// PLACEHOLDER CONTENT for Stage 1: codes, titles and periods are as understood in Nov 2026 and MUST be verified
// against each official source before launch. Provinces without an entry use the shared templates (province '*').

export type Situation = 'late-rent' | 'rent-increase' | 'damage' | 'own-use' | 'end-agreement' | 'lease' | 'inspection';
export type FormKind = 'notice' | 'application' | 'agreement' | 'report';

export interface FormDef {
  id: string;
  province: Province | '*';
  code: string;
  title: string;
  /** Plain-words description of when to use it. */
  plain: string;
  situation: Situation;
  kind: FormKind;
  /** True when this is the province's official form; false for a Keyholder template that follows the law. */
  official: boolean;
  /** Minimum days' notice, if fixed. Undefined = owner enters the date and checks the provincial rule. */
  noticeDays?: number;
  /** Step order within a situation (e.g. notice before application). */
  step: number;
  note?: string;
  /** True for a notice that does not end the tenancy (e.g. Quebec's formal demand). */
  noEnd?: boolean;
}

export const SITUATIONS: { id: Situation; label: string; hint: string }[] = [
  { id: 'late-rent', label: 'Rent is late', hint: 'Notices and applications for unpaid rent' },
  { id: 'rent-increase', label: 'Raise the rent', hint: 'Written notice of a rent increase' },
  { id: 'damage', label: 'Damage or behaviour', hint: 'Damage, disturbing others, other breaches' },
  { id: 'own-use', label: 'I or family will move in', hint: "Ending a tenancy for the landlord's own use" },
  { id: 'end-agreement', label: 'End by agreement', hint: 'You and the tenant agree to end the tenancy' },
  { id: 'lease', label: 'New lease', hint: 'The written tenancy agreement' },
  { id: 'inspection', label: 'Move-in or move-out inspection', hint: 'Condition report signed by both' },
];

const F = (f: FormDef) => f;

export const FORMS: FormDef[] = [
  // ---------------- Ontario (Landlord and Tenant Board) ----------------
  F({ id: 'on-n4', province: 'ON', code: 'N4', title: 'Notice to End your Tenancy Early for Non-payment of Rent', plain: 'Rent is late. The tenancy can end if it is not paid by the date on the notice.', situation: 'late-rent', kind: 'notice', official: true, step: 1, note: 'Notice period: 7 days for notices given on or after Sept 21, 2026 (14 before); +5 days by mail.' }),
  F({ id: 'on-l1', province: 'ON', code: 'L1', title: 'Application to Evict a Tenant for Non-payment of Rent and to Collect Rent Owing', plain: 'The N4 date has passed and rent is still owing.', situation: 'late-rent', kind: 'application', official: true, step: 2 }),
  F({ id: 'on-l9', province: 'ON', code: 'L9', title: 'Application to Collect Rent the Tenant Owes', plain: 'Collect unpaid rent without ending the tenancy.', situation: 'late-rent', kind: 'application', official: true, step: 3 }),
  F({ id: 'on-n1', province: 'ON', code: 'N1', title: 'Notice of Rent Increase', plain: 'Raise the rent. Once every 12 months, with at least 90 days\' notice, within the guideline for most units.', situation: 'rent-increase', kind: 'notice', official: true, noticeDays: 90, step: 1 }),
  F({ id: 'on-n5', province: 'ON', code: 'N5', title: 'Notice to End your Tenancy for Interfering with Others, Damage or Overcrowding', plain: 'The tenant damaged the unit or is disturbing others. They have 7 days to fix it.', situation: 'damage', kind: 'notice', official: true, noticeDays: 20, step: 1 }),
  F({ id: 'on-l2', province: 'ON', code: 'L2', title: 'Application to End a Tenancy and Evict a Tenant', plain: 'Apply to end the tenancy for reasons other than unpaid rent (after an N5, N12 and others).', situation: 'damage', kind: 'application', official: true, step: 2 }),
  F({ id: 'on-n12', province: 'ON', code: 'N12', title: "Notice to End your Tenancy Because the Landlord, a Purchaser or a Family Member Requires the Rental Unit", plain: 'You or a close family member will live in the unit. At least 60 days, ending on the last day of a rental period. One month\'s rent compensation is owed.', situation: 'own-use', kind: 'notice', official: true, noticeDays: 60, step: 1 }),
  F({ id: 'on-n11', province: 'ON', code: 'N11', title: 'Agreement to End the Tenancy', plain: 'You and the tenant both agree to end the tenancy on a date.', situation: 'end-agreement', kind: 'agreement', official: true, step: 1 }),
  F({ id: 'on-lease', province: 'ON', code: '2229E', title: 'Residential Tenancy Agreement (Standard Form of Lease)', plain: 'Required for most residential tenancies in Ontario.', situation: 'lease', kind: 'agreement', official: true, step: 1 }),

  // ---------------- British Columbia (Residential Tenancy Branch) ----------------
  F({ id: 'bc-30', province: 'BC', code: 'RTB-30', title: '10 Day Notice to End Tenancy for Unpaid Rent or Utilities', plain: 'Rent is late. If paid within 5 days of receiving it, the notice is cancelled.', situation: 'late-rent', kind: 'notice', official: true, noticeDays: 10, step: 1 }),
  F({ id: 'bc-7', province: 'BC', code: 'RTB-7', title: 'Notice of Rent Increase', plain: 'Raise the rent once every 12 months, with 3 full months\' notice, up to the annual limit.', situation: 'rent-increase', kind: 'notice', official: true, noticeDays: 90, step: 1 }),
  F({ id: 'bc-33', province: 'BC', code: 'RTB-33', title: 'One Month Notice to End Tenancy for Cause', plain: 'Damage, disturbing others, repeated late rent or another serious breach.', situation: 'damage', kind: 'notice', official: true, noticeDays: 30, step: 1 }),
  F({ id: 'bc-32', province: 'BC', code: 'RTB-32', title: "Two Month Notice to End Tenancy for Landlord's Use of Property", plain: 'You or a close family member will live in the unit. One month\'s rent compensation is owed.', situation: 'own-use', kind: 'notice', official: true, noticeDays: 60, step: 1, note: 'Check the current BC notice period; it has changed in recent years.' }),
  F({ id: 'bc-8', province: 'BC', code: 'RTB-8', title: 'Mutual Agreement to End a Tenancy', plain: 'You and the tenant both agree to end the tenancy.', situation: 'end-agreement', kind: 'agreement', official: true, step: 1 }),
  F({ id: 'bc-1', province: 'BC', code: 'RTB-1', title: 'Residential Tenancy Agreement', plain: 'The standard BC tenancy agreement.', situation: 'lease', kind: 'agreement', official: true, step: 1 }),
  F({ id: 'bc-27', province: 'BC', code: 'RTB-27', title: 'Condition Inspection Report', plain: 'Required at move-in and move-out, signed by both.', situation: 'inspection', kind: 'report', official: true, step: 1 }),

  // ---------------- Alberta (no mandatory forms; RTDRS hears disputes) ----------------
  F({ id: 'ab-14', province: 'AB', code: 'AB 14-day', title: '14-Day Notice to Terminate for Non-payment of Rent', plain: 'Rent is late. Template that follows the Residential Tenancies Act.', situation: 'late-rent', kind: 'notice', official: false, noticeDays: 14, step: 1 }),
  F({ id: 'ab-rtdrs', province: 'AB', code: 'RTDRS', title: 'Application to the Residential Tenancy Dispute Resolution Service', plain: 'Ask the RTDRS for possession and rent owing.', situation: 'late-rent', kind: 'application', official: true, step: 2 }),
  F({ id: 'ab-inc', province: 'AB', code: 'AB increase', title: 'Notice of Rent Increase', plain: 'Once every 12 months; 3 months\' notice for a monthly tenancy. No cap.', situation: 'rent-increase', kind: 'notice', official: false, noticeDays: 90, step: 1 }),
  F({ id: 'ab-breach', province: 'AB', code: 'AB breach', title: '14-Day Notice for Substantial Breach', plain: 'Damage, disturbing others or another substantial breach.', situation: 'damage', kind: 'notice', official: false, noticeDays: 14, step: 1 }),
  F({ id: 'ab-insp', province: 'AB', code: 'AB inspection', title: 'Move-in / Move-out Inspection Report', plain: 'Required within a week of move-in and move-out to keep a deposit claim.', situation: 'inspection', kind: 'report', official: false, step: 1 }),

  // ---------------- Quebec (Tribunal administratif du logement) ----------------
  F({ id: 'qc-lease', province: 'QC', code: 'Bail / Lease', title: 'Lease of a Dwelling (mandatory TAL form) · Bail de logement', plain: 'The mandatory Quebec lease form, in French or English.', situation: 'lease', kind: 'agreement', official: true, step: 1 }),
  F({ id: 'qc-mod', province: 'QC', code: 'Avis de modification', title: 'Notice of Modification of the Lease · Avis de modification du bail', plain: 'Raise the rent or change a condition at renewal: 3 to 6 months before the lease ends (12-month lease).', situation: 'rent-increase', kind: 'notice', official: false, noticeDays: 90, step: 1 }),
  F({ id: 'qc-tal', province: 'QC', code: 'TAL application', title: 'Application to the TAL for Unpaid Rent · Demande au TAL', plain: 'In Quebec you cannot end a tenancy for late rent by notice. Apply to the TAL to recover rent; cancelling the lease needs more than 3 weeks late.', situation: 'late-rent', kind: 'application', official: true, step: 1 }),
  F({ id: 'qc-demand', province: 'QC', code: 'Mise en demeure', title: 'Formal Demand for Rent Owing · Mise en demeure', plain: 'A formal written demand before applying to the TAL. Optional, but often settles it.', situation: 'late-rent', kind: 'notice', official: false, step: 0, noEnd: true }),

  // ---------------- Shared templates (every other province and territory) ----------------
  F({ id: 'gen-late', province: '*', code: 'Notice', title: 'Notice of Rent Owing and Termination for Non-payment', plain: 'Rent is late. Template; check your province\'s minimum notice period and official form.', situation: 'late-rent', kind: 'notice', official: false, step: 1 }),
  F({ id: 'gen-apply', province: '*', code: 'Application', title: 'Application to the Residential Tenancy Office', plain: 'If rent is still owing after the notice date, apply to the province\'s tenancy office.', situation: 'late-rent', kind: 'application', official: false, step: 2 }),
  F({ id: 'gen-inc', province: '*', code: 'Notice', title: 'Notice of Rent Increase', plain: 'Written notice of a rent increase. Check the province\'s notice period and any cap.', situation: 'rent-increase', kind: 'notice', official: false, step: 1 }),
  F({ id: 'gen-breach', province: '*', code: 'Notice', title: 'Notice to End Tenancy for Breach', plain: 'Damage, disturbing others or another breach.', situation: 'damage', kind: 'notice', official: false, step: 1 }),
  F({ id: 'gen-own', province: '*', code: 'Notice', title: "Notice to End Tenancy for Landlord's Own Use", plain: 'You or a family member will live in the unit.', situation: 'own-use', kind: 'notice', official: false, step: 1 }),
  F({ id: 'gen-agree', province: '*', code: 'Agreement', title: 'Agreement to End the Tenancy', plain: 'You and the tenant both agree to end the tenancy.', situation: 'end-agreement', kind: 'agreement', official: false, step: 1 }),
  F({ id: 'gen-lease', province: '*', code: 'Lease', title: 'Residential Lease', plain: 'A written lease. Some provinces have a standard form; check before using.', situation: 'lease', kind: 'agreement', official: false, step: 1 }),
  F({ id: 'gen-insp', province: '*', code: 'Report', title: 'Move-in / Move-out Inspection Report', plain: 'Record the unit\'s condition, signed by both.', situation: 'inspection', kind: 'report', official: false, step: 1 }),
];

/** Official forms page for each province's tenancy authority (verify links before launch). */
export const AUTHORITY_URL: Record<Province, string> = {
  ON: 'https://tribunalsontario.ca/ltb/forms/',
  BC: 'https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies',
  AB: 'https://www.alberta.ca/landlords-and-tenants',
  QC: 'https://www.tal.gouv.qc.ca/',
  MB: 'https://www.gov.mb.ca/cca/rtb/',
  SK: 'https://www.saskatchewan.ca/',
  NS: 'https://novascotia.ca/',
  NB: 'https://www2.gnb.ca/',
  NL: 'https://www.gov.nl.ca/',
  PE: 'https://irac.pe.ca/',
  YT: 'https://yukon.ca/',
  NT: 'https://www.gov.nt.ca/',
  NU: 'https://www.gov.nu.ca/',
};

/** Forms for a province and situation: the province's own forms, or the shared templates where it has none. */
export function formsFor(p: Province, situation: Situation): FormDef[] {
  const own = FORMS.filter((f) => f.province === p && f.situation === situation);
  const list = own.length ? own : FORMS.filter((f) => f.province === '*' && f.situation === situation);
  return list.sort((a, b) => a.step - b.step);
}

export const formById = (id: string) => FORMS.find((f) => f.id === id);
