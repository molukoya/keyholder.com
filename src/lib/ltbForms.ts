import type { AppState, ISODate, Lease } from '../data/types';
import { addDays, addMonths, dueDate } from './dates';
import { leaseLedger } from './finance';
import { province } from './jurisdiction';

// Ontario's official Landlord and Tenant Board (LTB) forms, filled in with Keyholder's records.
// The forms are Tribunals Ontario's own PDFs (tribunalsontario.ca/ltb/forms), kept unchanged in server/forms/ltb;
// the server fills their fields (the only change the forms allow) and keeps them locked against other edits.
// This file says what goes in each field. Field names are the PDFs' own.

export type PdfValue = string | true | { radio: string };
export interface OfficialForm {
  /** File in server/forms/ltb. */
  file: string;
  /** As printed at the foot of the form. */
  version: string;
  /** What the tenant gets (the first pages of some forms are the landlord's checklist). */
  tenantPages: string;
}

export const OFFICIAL: Record<string, OfficialForm> = {
  'on-n4': { file: 'N4.pdf', version: 'N4 (2026/09)', tenantPages: 'Give the tenant pages 2 to 4. Page 1 is your checklist.' },
  'on-n1': { file: 'N1.pdf', version: 'N1 (v. 01/04/2022)', tenantPages: 'Give the tenant both pages.' },
  'on-n2': { file: 'N2.pdf', version: 'N2 (v. 01/04/2022)', tenantPages: 'Give the tenant the page.' },
  'on-n5': { file: 'N5.pdf', version: 'N5 (2026/09)', tenantPages: 'Give the tenant pages 3 to 6. Pages 1 and 2 are your checklist.' },
  'on-n12': { file: 'N12.pdf', version: 'N12 (2026/10)', tenantPages: 'Give the tenant pages 3 to 5. Pages 1 and 2 are your checklist.' },
  'on-n11': { file: 'N11.pdf', version: 'N11 (v. 01/04/2022)', tenantPages: 'You and the tenant both sign page 2. Each keeps a copy.' },
};
export const hasOfficialForm = (formId: string) => formId in OFFICIAL;

// ---------- Formats the forms ask for ----------
/** dd/mm/yyyy */
export const ltbDate = (d: ISODate | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
/** 1,845.00 */
export const ltbMoney = (cents: number) => (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** For the forms' boxed amounts (one character a box, with the decimal point printed): "  1845.00". */
export const boxedMoney = (cents: number, boxes = 9) => (cents / 100).toFixed(2).padStart(boxes, ' ').slice(-boxes);
/** For the boxed phone number: "(613)555-0101". */
export function boxedPhone(p: string | undefined) {
  const d = (p ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}` : '';
}
/** "Alex Morgan" → first and last names (the last word is the last name). */
export function splitName(full: string) {
  const w = full.trim().split(/\s+/).filter(Boolean);
  return w.length < 2 ? { first: w[0] ?? '', last: '' } : { first: w.slice(0, -1).join(' '), last: w[w.length - 1] };
}
/** "12-160 Wellington Street" → unit 12, number 160, street "Wellington Street". */
export function splitAddress(street: string) {
  const m = /^\s*(?:([A-Za-z0-9]+)\s*-\s*)?(\d+[A-Za-z]?)\s+(.+?)\s*$/.exec(street);
  return m ? { unit: m[1] ?? '', number: m[2], name: m[3] } : { unit: '', number: '', name: street.trim() };
}

/** The last day of the rental period that ends on or after a date (N12: the tenancy must end on such a day). */
export function endOfRentalPeriod(onOrAfter: ISODate, dueDay: number): ISODate {
  // A period runs from the due day to the day before the next one.
  let start = dueDate(onOrAfter.slice(0, 7), dueDay);
  if (start > onOrAfter) start = dueDate(addMonths(onOrAfter, -1).slice(0, 7), dueDay);
  return addDays(dueDate(addMonths(start, 1).slice(0, 7), dueDay), -1);
}

/** The N4's rent table: up to three rows; earlier unpaid periods are combined into the first row. */
export function rentRows(state: AppState, lease: Lease, today: ISODate) {
  const lines = leaseLedger(lease, state.payments, today).filter((l) => l.due < today && l.paid < l.charge);
  const rows = lines.map((l) => ({ from: l.due, to: addDays(dueDate(addMonths(l.due, 1).slice(0, 7), lease.dueDay), -1), charged: l.charge, paid: l.paid }));
  if (rows.length <= 3) return rows;
  const early = rows.slice(0, rows.length - 2);
  return [{ from: early[0].from, to: early[early.length - 1].to, charged: early.reduce((a, r) => a + r.charged, 0), paid: early.reduce((a, r) => a + r.paid, 0) }, ...rows.slice(-2)];
}

export interface LtbInput {
  formId: string;
  state: AppState;
  lease: Lease;
  /** The wizard's answers (new rent, reasons, events…). */
  details: Record<string, string>;
  servedOn: ISODate;
  /** Termination date (N4: pay by; N5, N12: move out by). */
  end?: ISODate;
  today: ISODate;
}

/** Every field Keyholder fills on the official form, by the PDF's own field names. */
export function ltbValues(i: LtbInput): Record<string, PdfValue> {
  const { state, lease, details: d } = i;
  const tenant = state.tenants.find((t) => t.id === lease.tenantId);
  const unit = state.units.find((u) => u.id === lease.unitId);
  const prop = state.properties.find((p) => p.id === unit?.propertyId);
  const names = tenant?.names.filter(Boolean) ?? [];
  const landlord = state.profile.name.trim();
  const { first, last } = splitName(landlord);
  const phone = state.profile.phone ?? '';
  const addr = splitAddress(prop?.address ?? '');
  const unitLabel = addr.unit || (lease.room ? `${unit?.label ?? ''} ${lease.room}`.trim() : unit?.label ?? '');
  const unitLine = `${unitLabel ? `Unit ${unitLabel}, ` : ''}${addr.number} ${addr.name}, ${prop?.city ?? ''}, ${prop?.province ?? 'ON'} ${prop?.postalCode ?? ''}`.replace(/\s+/g, ' ').trim();
  const mailing = (d.mailing ?? state.profile.mailingAddress ?? '').trim();
  const served = ltbDate(i.servedOn);
  const out: Record<string, PdfValue> = {};

  // The notice forms (N4, N5, N12) share the parties, the address and the signature block.
  const S = 'form1[0].sfrmForm[0].';
  const parties = () => {
    out[`${S}PartyAddressInfo[0].txtTenant[0]`] = names.join('\n');
    out[`${S}PartyAddressInfo[0].txtLandlord[0]`] = landlord;
    out[`${S}PartyAddressInfo[0].txtNumber[0]`] = addr.number;
    out[`${S}PartyAddressInfo[0].txtName[0]`] = addr.name;
    out[`${S}PartyAddressInfo[0].txtUnit[0]`] = unitLabel;
    out[`${S}PartyAddressInfo[0].txtCity[0]`] = prop?.city ?? '';
    out[`${S}PartyAddressInfo[0].txtProvince[0]`] = 'ON';
    out[`${S}PartyAddressInfo[0].txtPostalCode[0]`] = prop?.postalCode ?? '';
    out[`${S}Signature[0].PartyType[0]`] = { radio: '1' }; // Landlord
    out[`${S}Signature[0].txtFirstName[0]`] = first;
    out[`${S}Signature[0].txtLastName[0]`] = last;
    out[`${S}Signature[0].txtPhone1[0]`] = phone;
    out[`${S}Signature[0].Signature[0]`] = landlord;
    out[`${S}Signature[0].dptSignDate[0]`] = served;
  };

  if (i.formId === 'on-n4') {
    parties();
    const rows = rentRows(state, lease, i.today);
    const total = rows.reduce((a, r) => a + r.charged - r.paid, 0);
    out[`${S}InfofromLandlord1[0].txtOweMeAmount[0]`] = ltbMoney(total);
    out[`${S}InfofromLandlord1[0].dptPayDate[0]`] = ltbDate(i.end);
    rows.forEach((r, k) => {
      const R = `${S}InfofromLandlord2[0].RentOwing[0].Row${k + 1}[0].`;
      out[`${R}DateFrom${k + 1}[0]`] = ltbDate(r.from);
      out[`${R}DateTo${k + 1}[0]`] = ltbDate(r.to);
      out[`${R}Charged${k + 1}[0]`] = ltbMoney(r.charged);
      out[`${R}Paid${k + 1}[0]`] = ltbMoney(r.paid);
      out[`${R}Owing${k + 1}[0]`] = ltbMoney(r.charged - r.paid);
    });
    out[`${S}InfofromLandlord2[0].TotalRentOwing[0]`] = ltbMoney(total);
  }

  if (i.formId === 'on-n5') {
    parties();
    out[`${S}InfofromLandlord1[0].TerminationDate[0]`] = ltbDate(i.end);
    const second = d.n5Second === 'yes';
    const R = `${S}Reasons[0].`;
    if (d.n5Reason === 'interfere') { out[`${R}Reason1[0].Reason1[0]`] = true; out[`${R}Reason1[0].Reason1_1[0]`] = { radio: second ? '2' : '1' }; }
    if (d.n5Reason === 'damage') {
      out[`${R}Reason2[0].Reason2[0]`] = true;
      if (second) out[`${R}Reason2[0].Reason2_2[0]`] = { radio: '1' };
      else {
        out[`${R}Reason2[0].Reason2_1[0]`] = { radio: '1' };
        if (Number(d.repairCost) > 0) out[`${R}Reason2[0].PayMe1[0]`] = ltbMoney(Math.round(Number(d.repairCost) * 100));
        if (Number(d.replaceCost) > 0) out[`${R}Reason2[0].PayMe2[0]`] = ltbMoney(Math.round(Number(d.replaceCost) * 100));
      }
    }
    if (d.n5Reason === 'overcrowd') {
      out[`${R}Reason3[0].Reason3[0]`] = true;
      if (second) out[`${R}Reason3[0].Reason3_2[0]`] = { radio: '1' };
      else { out[`${R}Reason3[0].Reason3_1[0]`] = { radio: '1' }; out[`${R}Reason3[0].Reason3Explain[0]`] = d.people ?? ''; }
    }
    for (const k of [1, 2, 3]) {
      const when = d[`ev${k}When`]?.trim(), what = d[`ev${k}What`]?.trim();
      if (!when && !what) continue;
      out[`${S}Details[0].Table1[0].Row${k}[0].EventDateTime${k}[0]`] = when ?? '';
      out[`${S}Details[0].Table1[0].Row${k}[0].Event${k}[0]`] = what ?? '';
    }
  }

  if (i.formId === 'on-n12') {
    parties();
    out[`${S}InfofromLandlord1[0].TerminationDate[0]`] = ltbDate(i.end);
    const n = d.n12Reason === 'purchaser' ? 2 : 1;
    const box = (REL as readonly string[]).indexOf(d.relation ?? 'self') + 1;
    const R = `${S}Reasons[0].Reason${n}[0].`;
    out[`${R}Reason${n}[0]`] = { radio: '1' };
    out[`${R}Reason${n}A[0].NameReason${n}[0]`] = d.who ?? '';
    if (d.caregiver === 'yes') { out[`${R}Reason${n}B[0].Reason${n}_B[0]`] = true; if (box) out[`${R}Reason${n}B[0].Reason${n}_B${box}[0]`] = true; }
    else if (box) out[`${R}Reason${n}A[0].Reason${n}_A${box}[0]`] = true;
  }

  if (i.formId === 'on-n1' || i.formId === 'on-n2') {
    const F = 'form1[0].#subform[0].';
    const newRent = Math.round(Number(d.newRent || 0) * 100);
    out[`${F}Notice_Name_And_Address_1[0].To_TenantName[0]`] = `${names.join(' & ')}\n${unitLine}`;
    out[`${F}Notice_Name_And_Address_1[0].From_LandlordName[0]`] = mailing ? `${landlord}\n${mailing}` : landlord;
    out[`${F}Notice_Name_And_Address_1[0].RentUnitAddress[0]`] = unitLine;
    out[`${F}${i.formId === 'on-n2' ? 'StratDate' : 'StartDate'}[0]`] = ltbDate(d.effective);
    out[`${F}RentIncAmount1[0]`] = boxedMoney(newRent);
    out[`${F}period[0].PaymentPeriodM[0]`] = { radio: '1' }; // per month
    const G = i.formId === 'on-n2' ? F : 'form1[0].#subform[5].';
    out[`${G}SelectSign[0]`] = { radio: '1' }; // Landlord
    out[`${G}SignatureN1ToN3[0].SignName[0]`] = landlord;
    out[`${G}SignatureN1ToN3[0].SignPhoneNum[0]`] = phone;
    out[`${G}SignatureN1ToN3[0].Signature[0]`] = landlord;
    out[`${G}SignatureN1ToN3[0].SignDate[0]`] = served;
    if (i.formId === 'on-n1') {
      const up = newRent - lease.rent;
      const pct = lease.rent ? (up / lease.rent) * 100 : 0;
      out[`${F}RentIncAmount2[0]`] = boxedMoney(up);
      out[`${F}period[1].PaymentPeriodM[0]`] = { radio: '1' };
      out[`${F}RentIncPercent[0]`] = (Math.round(pct * 100) / 100).toString();
      const guide = province('ON').rentIncreaseGuidelinePct ?? 0;
      if (pct <= guide + 1e-9) out[`${F}Check1[0]`] = { radio: '1' };
      else {
        out[`${F}Check2[0]`] = { radio: '1' };
        out[d.aboveGuideline === 'applied' ? `${F}Check_2_2[0]` : `${F}Check_2_1[0]`] = true;
      }
    }
  }

  if (i.formId === 'on-n11') {
    const F = 'form1[0].#subform[0].', G = 'form1[0].#subform[2].';
    out[`${F}TO_TenameName[0]`] = names.join(' & ');
    out[`${F}From_LandlordName[0]`] = landlord;
    out[`${F}RentalUnitAddress[0]`] = unitLine;
    out[`${F}EndDate[0]`] = ltbDate(d.endDate);
    // The landlord's signature block (the second one); the tenant signs the first.
    out[`${G}RFirstName[1]`] = first;
    out[`${G}RLastName[1]`] = last;
    out[`${G}RDayPhone[1]`] = boxedPhone(phone);
    out[`${G}Signature[1]`] = landlord;
    out[`${G}SignDate[1]`] = served;
  }
  return out;
}

/** Who will move in (N12), in the form's order of boxes. */
export const REL = ['self', 'spouse', 'child', 'parent', 'spouseChild', 'spouseParent'] as const;
export const REL_LABEL: Record<(typeof REL)[number], { own: string; buyer: string }> = {
  self: { own: 'Me', buyer: 'The buyer' }, spouse: { own: 'My spouse', buyer: "The buyer's spouse" }, child: { own: 'My child', buyer: "The buyer's child" },
  parent: { own: 'My parent', buyer: "The buyer's parent" }, spouseChild: { own: "My spouse's child", buyer: "The buyer's spouse's child" }, spouseParent: { own: "My spouse's parent", buyer: "The buyer's spouse's parent" },
};
