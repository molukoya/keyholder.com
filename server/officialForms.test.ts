import { describe, expect, it } from 'vitest';
import { PDFCheckBox, PDFDocument, PDFRadioGroup, PDFTextField } from '@cantoo/pdf-lib';
import { seedState } from '../src/data/seed';
import { arrears } from '../src/lib/notices';
import { boxedMoney, boxedPhone, endOfRentalPeriod, ltbDate, ltbMoney, ltbValues, OFFICIAL, rentRows, splitAddress, splitName } from '../src/lib/ltbForms';
import { fillOfficial } from './officialForms';

// Ontario's official LTB forms, filled from a landlord's records and read back.
const today = '2026-11-12';
const state = seedState(undefined, today);
state.profile.name = 'Alex Morgan';
state.profile.phone = '613-555-0101';
const late = state.leases.find((l) => arrears(state, l, today).total > 0)!;
const prop = state.properties.find((p) => p.id === state.units.find((u) => u.id === late.unitId)!.propertyId)!;
prop.postalCode = 'M4C 1A1';
const details: Record<string, string> = {
  newRent: ((late.rent * 1.02) / 100).toFixed(2), effective: '2027-03-01', mailing: '12 King St E, Belleville, ON K8N 1A1', endDate: '2027-01-31',
  n5Reason: 'damage', n5Second: 'no', repairCost: '420', ev1When: 'Oct 3, 2026, 11 pm', ev1What: 'The bathroom door was broken off its hinges.',
  n12Reason: 'own', who: 'Ana Morgan', relation: 'child', caregiver: 'no',
};

async function readBack(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf);
  const out: Record<string, string | boolean> = {};
  for (const f of doc.getForm().getFields()) {
    if (f instanceof PDFTextField) out[f.getName()] = f.getText() ?? '';
    else if (f instanceof PDFCheckBox) out[f.getName()] = f.isChecked();
    else if (f instanceof PDFRadioGroup) out[f.getName()] = f.getSelected() ?? '';
  }
  return { doc, out };
}

describe('formats the LTB asks for', () => {
  it('dates, money, phone numbers, names and street addresses', () => {
    expect(ltbDate('2026-11-20')).toBe('20/11/2026');
    expect(ltbMoney(184500)).toBe('1,845.00');
    expect(boxedMoney(184500)).toBe('  1845.00');
    expect(boxedPhone('+1 613-555-0101')).toBe('(613)555-0101');
    expect(splitName('Mary Anne Lee')).toEqual({ first: 'Mary Anne', last: 'Lee' });
    expect(splitAddress('12-160 Wellington Street')).toEqual({ unit: '12', number: '160', name: 'Wellington Street' });
    // N12: the tenancy ends on the last day of a rental period (rent due on the 1st → the end of a month).
    expect(endOfRentalPeriod('2027-01-11', 1)).toBe('2027-01-31');
    expect(endOfRentalPeriod('2027-01-11', 15)).toBe('2027-01-14');
    expect(endOfRentalPeriod('2027-01-20', 15)).toBe('2027-02-14');
  });
  it("the N4's table: up to three rows, earlier periods combined, matching the rent owing", () => {
    const rows = rentRows(state, late, today);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(rows.reduce((a, r) => a + r.charged - r.paid, 0)).toBe(arrears(state, late, today).total);
  });
});

describe("Ontario's official forms, filled in", () => {
  for (const formId of Object.keys(OFFICIAL)) {
    it(`${OFFICIAL[formId].version}: every value lands in its field`, async () => {
      const values = ltbValues({ formId, state, lease: late, details, servedOn: today, end: '2026-11-20', today });
      expect(Object.keys(values).length).toBeGreaterThan(5);
      const pdf = await fillOfficial(formId, values);
      const { out } = await readBack(pdf);
      for (const [name, v] of Object.entries(values)) {
        if (typeof v === 'string') expect(out[name], name).toBe(v);
        else if (v === true) expect(out[name], name).toBe(true);
        else expect(out[name], name).toBe(v.radio);
      }
    }, 30_000);
  }

  it('N4: the tenant, the amount, the pay-by date and the signature', async () => {
    const values = ltbValues({ formId: 'on-n4', state, lease: late, details, servedOn: today, end: '2026-11-20', today });
    const S = 'form1[0].sfrmForm[0].';
    const tenant = state.tenants.find((t) => t.id === late.tenantId)!;
    expect(values[`${S}PartyAddressInfo[0].txtTenant[0]`]).toBe(tenant.names.join('\n'));
    expect(values[`${S}InfofromLandlord1[0].txtOweMeAmount[0]`]).toBe(ltbMoney(arrears(state, late, today).total));
    expect(values[`${S}InfofromLandlord1[0].dptPayDate[0]`]).toBe('20/11/2026');
    expect(values[`${S}PartyAddressInfo[0].txtPostalCode[0]`]).toBe('M4C 1A1');
    expect(values[`${S}Signature[0].PartyType[0]`]).toEqual({ radio: '1' });
    expect(values[`${S}Signature[0].txtLastName[0]`]).toBe('Morgan');
    expect(values[`${S}Signature[0].dptSignDate[0]`]).toBe('12/11/2026');
  });

  it('N1: within the guideline, or above it with the reason; N2 has no guideline part', () => {
    const F = 'form1[0].#subform[0].';
    const within = ltbValues({ formId: 'on-n1', state, lease: late, details, servedOn: today, today });
    expect(within[`${F}Check1[0]`]).toEqual({ radio: '1' });
    expect(within[`${F}StartDate[0]`]).toBe('01/03/2027');
    expect(String(within[`${F}Notice_Name_And_Address_1[0].From_LandlordName[0]`])).toContain('12 King St E');
    const above = ltbValues({ formId: 'on-n1', state, lease: late, details: { ...details, newRent: ((late.rent * 1.2) / 100).toFixed(2), aboveGuideline: 'applied' }, servedOn: today, today });
    expect(above[`${F}Check2[0]`]).toEqual({ radio: '1' });
    expect(above[`${F}Check_2_2[0]`]).toBe(true);
    const n2 = ltbValues({ formId: 'on-n2', state, lease: late, details, servedOn: today, today });
    expect(Object.keys(n2).some((k) => k.includes('Check'))).toBe(false);
    expect(n2[`${F}StratDate[0]`]).toBe('01/03/2027');
  });

  it('N5 and N12: the reason, the details and who moves in', () => {
    const S = 'form1[0].sfrmForm[0].';
    const n5 = ltbValues({ formId: 'on-n5', state, lease: late, details, servedOn: today, end: '2026-12-02', today });
    expect(n5[`${S}Reasons[0].Reason2[0].Reason2[0]`]).toBe(true);
    expect(n5[`${S}Reasons[0].Reason2[0].PayMe1[0]`]).toBe('420.00');
    expect(n5[`${S}Details[0].Table1[0].Row1[0].Event1[0]`]).toContain('bathroom door');
    const n12 = ltbValues({ formId: 'on-n12', state, lease: late, details, servedOn: today, end: '2027-01-31', today });
    expect(n12[`${S}Reasons[0].Reason1[0].Reason1A[0].NameReason1[0]`]).toBe('Ana Morgan');
    expect(n12[`${S}Reasons[0].Reason1[0].Reason1A[0].Reason1_A3[0]`]).toBe(true); // "My child"
  });
});
