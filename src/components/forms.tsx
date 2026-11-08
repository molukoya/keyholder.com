import { useMemo, useState } from 'react';
import type {
  CCAClass, Comparable, Expense, ExpenseCategory, Lease, Mortgage, MortgageFrequency, PayMethod, Payment, Property, PropertyType, Tenant, Unit, Valuation,
} from '../data/types';
import { uid, unitTenant, usePhase, useStore } from '../data/store';
import { enabled } from '../data/phases';
import { addMonths, fmtPeriod, periodOf } from '../lib/dates';
import { leaseLedger, mortgagePayment, rentalPortion } from '../lib/finance';
import { CATEGORIES, CCA_CLASSES, PROVINCES, category, province } from '../lib/jurisdiction';
import { fmt } from '../lib/money';
import { Icon } from './Icon';
import { Drawer, Field, MoneyInput, Seg, Term } from './ui';

// =====================================================================================
// Log a payment by hand (RL-2)
// =====================================================================================
export function PaymentForm({ leaseId, onClose, correct }: { leaseId?: string; onClose: () => void; correct?: Payment }) {
  const { state, act, today } = useStore();
  const leases = state.leases.filter((l) => !l.end || l.end >= addMonths(today, -3));
  const [lid, setLid] = useState(correct?.leaseId ?? leaseId ?? leases[0]?.id ?? '');
  const lease = state.leases.find((l) => l.id === lid);
  const open = useMemo(() => (lease ? leaseLedger(lease, state.payments.filter((p) => p.id !== correct?.id), today, periodOf(addMonths(today, 1))) : []), [lease, state.payments, today, correct]);
  const firstOpen = open.find((l) => l.paid < l.charge);
  const [period, setPeriod] = useState(correct?.period ?? firstOpen?.period ?? periodOf(today));
  const line = open.find((l) => l.period === period);
  const [amount, setAmount] = useState<number | undefined>(correct?.amount ?? (line ? line.charge - line.paid : lease?.rent));
  const [date, setDate] = useState(correct?.date ?? today);
  const [method, setMethod] = useState<PayMethod>(correct?.method ?? lease?.paymentMethod ?? 'etransfer');
  const [note, setNote] = useState(correct?.note ?? '');
  const owing = line ? line.charge - line.paid : 0;

  const submit = () => {
    if (!lease || !amount) return;
    if (correct) act.correctPayment(correct.id, { amount, date, period, method, note });
    else act.logPayment({ leaseId: lease.id, amount, date, period, method, note: note || undefined, source: 'manual' });
    onClose();
  };

  const [more, setMore] = useState(!!correct);
  return (
    <Drawer title={correct ? 'Fix a payment' : 'Mark rent paid'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!lease || !amount} onClick={submit}>{correct ? 'Save' : 'Mark paid'}</button></>}>
      {correct && <p className="small soft">The old entry is kept and marked as replaced.</p>}
      {!leaseId && !correct && (
        <div className="field">
          <span className="label">Who paid?</span>
          <div className="choices" role="radiogroup">
            {leases.map((l) => {
              const t = state.tenants.find((x) => x.id === l.tenantId); const u = state.units.find((x) => x.id === l.unitId);
              return <button key={l.id} role="radio" aria-checked={lid === l.id} className="choice" onClick={() => { setLid(l.id); setAmount(l.rent); const o = leaseLedger(l, state.payments, today, periodOf(addMonths(today, 1))).find((x) => x.paid < x.charge); if (o) setPeriod(o.period); }}>
                <span className="t">{t?.names.join(' & ')}</span><span className="s">Unit {u?.label}</span>
              </button>;
            })}
          </div>
        </div>
      )}
      {lease && (
        <>
          <div className="grid2">
            <Field label="Amount" htmlFor="pf-amt" hint={amount && owing && amount < owing ? `${fmt(owing - amount)} will still be owed` : undefined}>
              <MoneyInput id="pf-amt" value={amount} onChange={setAmount} />
            </Field>
            <Field label="Date" htmlFor="pf-date"><input id="pf-date" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <Field label="Rent for" htmlFor="pf-period">
            <select id="pf-period" className="input" value={period} onChange={(e) => { setPeriod(e.target.value); const l = open.find((x) => x.period === e.target.value); if (l) setAmount(Math.max(0, l.charge - l.paid) || l.charge); }}>
              {open.slice().reverse().map((l) => <option key={l.period} value={l.period}>{fmtPeriod(l.period)} {l.paid >= l.charge ? '(paid)' : l.paid > 0 ? '(part paid)' : ''}</option>)}
            </select>
          </Field>
          {more ? (
            <>
              <Field label="Paid by"><Seg label="Method" value={method} onChange={setMethod} options={[{ id: 'etransfer', label: 'e-Transfer' }, { id: 'cheque', label: 'Cheque' }, { id: 'cash', label: 'Cash' }, { id: 'direct-deposit', label: 'Deposit' }]} /></Field>
              <Field label="Note" htmlFor="pf-note"><input id="pf-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </>
          ) : <button className="btn ghost small" onClick={() => setMore(true)}>More details</button>}
          <p className="small soft" style={{ marginTop: 16 }}>{state.profile.autoSend ? 'A receipt is sent to the tenant.' : 'A receipt will be ready for you to send.'}</p>
        </>
      )}
    </Drawer>
  );
}

// =====================================================================================
// Expense capture (EX-1, EX-3, EX-5) — under 15 seconds
// =====================================================================================
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } finally { URL.revokeObjectURL(url); }
}

export function ExpenseForm({ onClose, expense, prefill, fromTxn }: { onClose: () => void; expense?: Expense; prefill?: Partial<Expense>; fromTxn?: string }) {
  const { state, act, today } = useStore();
  const phase = usePhase();
  const props = state.properties.filter((p) => !p.archived);
  const [e, setE] = useState<Expense>(() => expense ?? {
    id: uid('exp'), propertyId: props[0]?.id ?? '', date: today, amount: 0, vendor: '', category: 'repairs', kind: 'current',
    scope: category('repairs').sharedByDefault ? 'shared' : 'direct', createdAt: new Date().toISOString(), ...prefill,
  });
  const [flash, setFlash] = useState(false);
  const [step, setStep] = useState<'snap' | 'details'>(expense || prefill ? 'details' : 'snap');
  const [more, setMore] = useState(!!expense?.unitId || !!expense?.note);
  const set = (p: Partial<Expense>) => setE((x) => ({ ...x, ...p }));
  const prop = props.find((p) => p.id === e.propertyId);
  const units = state.units.filter((u) => u.propertyId === e.propertyId);
  const part = prop && prop.rentalSharePct < 100;
  const deductible = prop ? rentalPortion(e, prop.rentalSharePct) : e.amount;

  const onPhoto = async (f?: File) => {
    if (!f) return;
    const data = await compress(f);
    setFlash(true); setTimeout(() => setFlash(false), 320);
    set({ receiptImage: data });
    setStep('details');
  };

  if (!props.length) {
    return <Drawer title="Snap a receipt" onClose={onClose}><p>Add a property first, so Keyholder knows where to file it.</p></Drawer>;
  }

  if (step === 'snap') {
    return (
      <Drawer title="Add a receipt" onClose={onClose}>
        <label className={`capture-frame${flash ? ' flash' : ''}`} style={{ cursor: 'pointer' }}>
          <div className="edges" />
          <div style={{ textAlign: 'center', zIndex: 1 }}>
            <Icon name="camera" size={40} />
            <div style={{ marginTop: 8, fontSize: 'var(--t-20)' }}>Take a photo</div>
          </div>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(ev) => onPhoto(ev.target.files?.[0])} />
        </label>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setStep('details')}>No photo, just type it</button>
        </div>
      </Drawer>
    );
  }

  const valid = e.amount > 0 && e.propertyId && e.date;
  return (
    <Drawer title={expense ? 'Edit expense' : 'Add a receipt'} onClose={onClose}
      footer={<>
        {expense && <button className="btn ghost danger" onClick={() => { act.deleteExpense(expense.id); onClose(); }}><Icon name="trash" size={16} />Delete</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!valid} onClick={() => { act.saveExpense(e, fromTxn); onClose(); }}>Save</button>
      </>}>
      {e.receiptImage ? (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <img src={e.receiptImage} alt="Receipt photo" className="photo" />
          <button className="btn small" style={{ position: 'absolute', right: 8, top: 8 }} onClick={() => set({ receiptImage: undefined })}>Remove photo</button>
        </div>
      ) : (
        <label className="btn" style={{ marginBottom: 16 }}><Icon name="camera" size={16} />Add receipt photo<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(ev) => onPhoto(ev.target.files?.[0])} /></label>
      )}
      <div className="grid2">
        <Field label="Amount" htmlFor="ex-amt"><MoneyInput id="ex-amt" value={e.amount || undefined} onChange={(c) => set({ amount: c ?? 0 })} autoFocus /></Field>
        <Field label="Date" htmlFor="ex-date"><input id="ex-date" type="date" className="input" value={e.date} onChange={(x) => set({ date: x.target.value })} /></Field>
      </div>
      <Field label="Paid to" htmlFor="ex-vendor"><input id="ex-vendor" className="input" value={e.vendor} onChange={(x) => set({ vendor: x.target.value })} placeholder="Home Depot, plumber, city…" /></Field>
      <div className="grid2">
        <Field label="Property" htmlFor="ex-prop">
          <select id="ex-prop" className="input" value={e.propertyId} onChange={(x) => set({ propertyId: x.target.value, unitId: undefined })}>
            {props.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
        </Field>
        <Field label="What for?" htmlFor="ex-cat">
          <select id="ex-cat" className="input" value={e.category} onChange={(x) => { const c = x.target.value as ExpenseCategory; set({ category: c, scope: part ? (category(c).sharedByDefault ? 'shared' : 'direct') : e.scope }); }}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>

      {enabled('repair-or-improvement', phase) && (
        <div className="field">
          <span className="label">Was it a fix or an upgrade?</span>
          <div className="choices two" role="radiogroup">
            <button type="button" role="radio" className="choice" aria-checked={e.kind === 'current'} onClick={() => set({ kind: 'current', ccaClass: undefined })}>
              <span className="t">A fix</span><span className="s">Repaired or replaced like for like</span>
            </button>
            <button type="button" role="radio" className="choice" aria-checked={e.kind === 'capital'} onClick={() => set({ kind: 'capital' })}>
              <span className="t">An upgrade</span><span className="s">Made it better or last longer</span>
            </button>
          </div>
        </div>
      )}

      {e.kind === 'capital' && enabled('cca', phase) && (
        <Field label={<>Which <Term def="Capital Cost Allowance: CRA's depreciation classes for capital items">CCA class</Term>?</>} htmlFor="ex-cca">
          <select id="ex-cca" className="input" value={e.ccaClass ?? ''} onChange={(x) => set({ ccaClass: (x.target.value || undefined) as CCAClass | undefined })}>
            <option value="">Not sure yet</option>
            {CCA_CLASSES.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.ratePct}%) — {c.examples}</option>)}
          </select>
        </Field>
      )}

      {part && (
        <div className="field">
          <span className="label">Who was it for?</span>
          <Seg label="Scope" value={e.scope} onChange={(scope) => set({ scope })} options={[{ id: 'shared', label: 'Whole house' }, { id: 'direct', label: 'Rental only' }, { id: 'personal', label: 'My part only' }]} />
          {e.amount > 0 && <span className="hint">Counts for the rental: <strong className="mono">{fmt(deductible)}</strong></span>}
        </div>
      )}
      {more ? (
        <>
          <Field label="Which unit?" htmlFor="ex-unit">
            <select id="ex-unit" className="input" value={e.unitId ?? ''} onChange={(x) => set({ unitId: x.target.value || undefined })}>
              <option value="">Whole property</option>
              {units.map((u) => <option key={u.id} value={u.id}>Unit {u.label}</option>)}
            </select>
          </Field>
          <Field label="Note" htmlFor="ex-note"><input id="ex-note" className="input" value={e.note ?? ''} onChange={(x) => set({ note: x.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={!!e.recurring} onChange={(x) => set({ recurring: x.target.checked })} /> <span>This bill repeats</span></label>
        </>
      ) : <button className="btn ghost small" onClick={() => setMore(true)}>More details</button>}
    </Drawer>
  );
}

// =====================================================================================
// Property (PS-1, PS-3, PS-5) — fields appear by phase
// =====================================================================================
export function PropertyForm({ onClose, property }: { onClose: () => void; property?: Property }) {
  const { state, act } = useStore();
  const phase = usePhase();
  const [p, setP] = useState<Property>(() => property ?? {
    id: uid('p'), nickname: '', address: '', city: state.profile.city, province: state.profile.province, type: 'house',
    rentalSharePct: state.profile.setup === 'part-home' ? 40 : 100, ownerOccupied: state.profile.setup === 'part-home', ownershipPct: 100, claimCCA: false,
  });
  const [sqRented, setSqRented] = useState<number | ''>('');
  const [sqTotal, setSqTotal] = useState<number | ''>('');
  const set = (x: Partial<Property>) => setP((o) => ({ ...o, ...x }));
  const cities = province(p.province).cities;
  const valid = p.nickname.trim() && p.address.trim();
  return (
    <Drawer title={property ? 'Edit property' : 'Add a property'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={() => { act.saveProperty(p); onClose(); }}>Save property</button></>}>
      <Field label="What do you call it?" htmlFor="pp-nick" hint='For example "Maple duplex" or "Home"'><input id="pp-nick" className="input" value={p.nickname} onChange={(e) => set({ nickname: e.target.value })} /></Field>
      <Field label="Street address" htmlFor="pp-addr"><input id="pp-addr" className="input" value={p.address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" /></Field>
      <div className="grid2">
        <Field label="Province" htmlFor="pp-prov">
          <select id="pp-prov" className="input" value={p.province} onChange={(e) => set({ province: e.target.value as Property['province'], city: province(e.target.value as Property['province']).cities[0] })}>
            {PROVINCES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="City" htmlFor="pp-city">
          <select id="pp-city" className="input" value={cities.includes(p.city) ? p.city : 'Other'} onChange={(e) => set({ city: e.target.value })}>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Type">
        <Seg<PropertyType> label="Type" value={p.type} onChange={(type) => set({ type })} options={[{ id: 'house', label: 'House' }, { id: 'duplex', label: 'Duplex' }, { id: 'triplex', label: 'Triplex' }, { id: 'condo', label: 'Condo' }, { id: 'townhouse', label: 'Town' }]} />
      </Field>
      <label className="check"><input type="checkbox" checked={p.ownerOccupied} onChange={(e) => set({ ownerOccupied: e.target.checked, rentalSharePct: e.target.checked ? Math.min(p.rentalSharePct, 50) : 100, claimCCA: e.target.checked ? false : p.claimCCA })} /><span>I live in part of this property</span></label>
      {p.ownerOccupied && (
        <div className="sheet" style={{ padding: 16 }}>
          <Field label="What share of the property is rented out?" htmlFor="pp-share" hint="Shared costs (mortgage interest, property tax, insurance, heat) are split by this share. You can change it any time.">
            <div className="spread"><input id="pp-share" type="range" min={5} max={95} value={p.rentalSharePct} onChange={(e) => set({ rentalSharePct: Number(e.target.value) })} /><span className="figure sm" style={{ minWidth: 80, textAlign: 'right' }}>{p.rentalSharePct}%</span></div>
          </Field>
          <div className="small soft" style={{ marginBottom: 8 }}>Or work it out from square footage:</div>
          <div className="grid3">
            <Field label="Rented part (sq ft)" htmlFor="pp-sq1"><input id="pp-sq1" className="input" inputMode="numeric" value={sqRented} onChange={(e) => setSqRented(e.target.value ? Number(e.target.value) : '')} /></Field>
            <Field label="Whole home (sq ft)" htmlFor="pp-sq2"><input id="pp-sq2" className="input" inputMode="numeric" value={sqTotal} onChange={(e) => setSqTotal(e.target.value ? Number(e.target.value) : '')} /></Field>
            <div className="field"><span className="label">&nbsp;</span><button className="btn" disabled={!sqRented || !sqTotal || sqRented >= sqTotal} onClick={() => set({ rentalSharePct: Math.round((Number(sqRented) / Number(sqTotal)) * 100) })}>Use {sqRented && sqTotal ? Math.round((Number(sqRented) / Number(sqTotal)) * 100) : '—'}%</button></div>
          </div>
        </div>
      )}
      <Field label="Your ownership share" htmlFor="pp-own" hint="100% unless you co-own it"><input id="pp-own" type="number" min={1} max={100} className="input" value={p.ownershipPct} onChange={(e) => set({ ownershipPct: Number(e.target.value) || 100 })} /></Field>

      {enabled('purchase-price', phase) && (
        <>
          <hr className="hr" />
          <h3 style={{ marginBottom: 12 }}>Purchase <span className="lock">Phase 2</span></h3>
          <div className="grid2">
            <Field label="Purchase date" htmlFor="pp-pd"><input id="pp-pd" type="date" className="input" value={p.purchaseDate ?? ''} onChange={(e) => set({ purchaseDate: e.target.value || undefined })} /></Field>
            <Field label="Purchase price" htmlFor="pp-pp"><MoneyInput id="pp-pp" value={p.purchasePrice} onChange={(c) => set({ purchasePrice: c })} /></Field>
          </div>
          {phase < 3 && (
            <div className="grid2">
              <Field label="Mortgage balance today (approx.)" htmlFor="pp-mb" hint="Used for equity. Phase 3 replaces this with the full mortgage."><MoneyInput id="pp-mb" value={p.approxMortgageBalance} onChange={(c) => set({ approxMortgageBalance: c })} /></Field>
              <Field label="Monthly mortgage payment (approx.)" htmlFor="pp-mp"><MoneyInput id="pp-mp" value={p.approxMortgagePayment} onChange={(c) => set({ approxMortgagePayment: c })} /></Field>
            </div>
          )}
        </>
      )}
      {enabled('purchase-details', phase) && (
        <>
          <hr className="hr" />
          <h3 style={{ marginBottom: 12 }}>Purchase details and carrying costs <span className="lock">Phase 3</span></h3>
          <div className="grid2">
            <Field label="Closing costs" htmlFor="pp-cc" hint="Legal fees, title insurance, inspection"><MoneyInput id="pp-cc" value={p.closingCosts} onChange={(c) => set({ closingCosts: c })} /></Field>
            <Field label="Land transfer tax" htmlFor="pp-ltt"><MoneyInput id="pp-ltt" value={p.landTransferTax} onChange={(c) => set({ landTransferTax: c })} /></Field>
            <Field label="Improvements at purchase" htmlFor="pp-imp" hint="Work done before the first tenant"><MoneyInput id="pp-imp" value={p.improvementsAtPurchase} onChange={(c) => set({ improvementsAtPurchase: c })} /></Field>
            <Field label={<><Term def="Land cannot be depreciated, so CCA applies only to the building share of the price">Land share of price</Term> (%)</>} htmlFor="pp-land" hint="Your property tax assessment shows land vs building"><input id="pp-land" type="number" className="input" min={0} max={95} value={p.landValuePct ?? 30} onChange={(e) => set({ landValuePct: Number(e.target.value) })} /></Field>
            <Field label="Annual property tax" htmlFor="pp-tax"><MoneyInput id="pp-tax" value={p.annualPropertyTax} onChange={(c) => set({ annualPropertyTax: c })} /></Field>
            <Field label="Annual insurance" htmlFor="pp-ins"><MoneyInput id="pp-ins" value={p.annualInsurance} onChange={(c) => set({ annualInsurance: c })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={p.claimCCA} onChange={(e) => set({ claimCCA: e.target.checked })} />
            <span>Claim <Term def="Capital Cost Allowance — yearly depreciation deduction">CCA</Term> on this property
              <span className="tiny soft" style={{ display: 'block' }}>{p.ownerOccupied ? 'Off by default for a home you live in: claiming CCA on the rented part can affect the principal-residence exemption when you sell. Confirm with an accountant first.' : 'Lowers tax now, but CCA claimed is usually taxed back (recapture) when you sell.'}</span>
            </span>
          </label>
        </>
      )}
    </Drawer>
  );
}

// =====================================================================================
// Unit (PS-4)
// =====================================================================================
const UTILS = ['Heat', 'Hydro', 'Water', 'Internet', 'Parking'];
export function UnitForm({ propertyId, unit, onClose }: { propertyId: string; unit?: Unit; onClose: () => void }) {
  const { state, act, today } = useStore();
  const [u, setU] = useState<Unit>(() => unit ?? { id: uid('u'), propertyId, label: '', rent: 0, bedrooms: 1, utilitiesIncluded: ['Water'], status: 'vacant' });
  const set = (x: Partial<Unit>) => setU((o) => ({ ...o, ...x }));
  const occupied = unit ? !!unitTenant(state, unit.id, today).lease : false;
  return (
    <Drawer title={unit ? `Unit ${unit.label}` : 'Add a unit'} onClose={onClose}
      footer={<>
        {unit && !occupied && <button className="btn ghost danger" onClick={() => { act.removeUnit(unit.id); onClose(); }}>Remove unit</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!u.label.trim()} onClick={() => { act.saveUnit(u); onClose(); }}>Save unit</button>
      </>}>
      <div className="grid2">
        <Field label="Door label" htmlFor="uf-l" hint='"A", "Upper", "Basement"'><input id="uf-l" className="input" value={u.label} onChange={(e) => set({ label: e.target.value })} /></Field>
        <Field label="Bedrooms" htmlFor="uf-b"><input id="uf-b" type="number" min={0} className="input" value={u.bedrooms} onChange={(e) => set({ bedrooms: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Asking or current rent" htmlFor="uf-r"><MoneyInput id="uf-r" value={u.rent || undefined} onChange={(c) => set({ rent: c ?? 0 })} /></Field>
      <div className="field"><span className="label">Included in rent</span>
        <div className="btn-row">{UTILS.map((x) => <label key={x} className="check" style={{ paddingRight: 12 }}><input type="checkbox" checked={u.utilitiesIncluded.includes(x)} onChange={(e) => set({ utilitiesIncluded: e.target.checked ? [...u.utilitiesIncluded, x] : u.utilitiesIncluded.filter((y) => y !== x) })} />{x}</label>)}</div>
      </div>
      {!occupied && <Field label="Status"><Seg label="Status" value={u.status} onChange={(status) => set({ status })} options={[{ id: 'vacant', label: 'Vacant' }, { id: 'notice', label: 'Notice given' }]} /></Field>}
    </Drawer>
  );
}

// =====================================================================================
// Tenant + lease (TL-1, TL-2) — includes the email-notice consent the PRD requires
// =====================================================================================
export function TenancyForm({ unitId, onClose }: { unitId?: string; onClose: () => void }) {
  const { state, act, today } = useStore();
  const free = state.units.filter((u) => !unitTenant(state, u.id, today).lease);
  const [uId, setUId] = useState(unitId ?? free[0]?.id ?? '');
  const unit = state.units.find((u) => u.id === uId);
  const [names, setNames] = useState<string[]>(['']);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(true);
  const [start, setStart] = useState(`${periodOf(addMonths(today, 1))}-01`);
  const [rent, setRent] = useState<number | undefined>(unit?.rent || undefined);
  const [dueDay, setDueDay] = useState(1);
  const [method, setMethod] = useState<PayMethod>('etransfer');
  const [lmr, setLmr] = useState<number | undefined>(unit?.rent || undefined);
  const [parking, setParking] = useState(false);
  const [pets, setPets] = useState(false);
  const [utilities, setUtilities] = useState('');
  const valid = unit && names[0].trim() && rent && start;

  const save = () => {
    if (!unit || !rent) return;
    const tid = uid('t');
    const t: Tenant = { id: tid, unitId: unit.id, names: names.map((n) => n.trim()).filter(Boolean), email, phone, noticeMethod: consent && email ? 'email' : 'hand', emailConsent: consent && !!email, emailConsentDate: consent && email ? today : undefined, aliases: [] };
    const l: Lease = { id: uid('l'), unitId: unit.id, tenantId: tid, start, rent, dueDay, paymentMethod: method, lmrDeposit: lmr ?? 0, utilities, parking, pets, emailNoticeConsent: consent && !!email };
    act.addTenancy(t, l);
    onClose();
  };

  if (!state.units.length) return <Drawer title="Add a tenant" onClose={onClose}><p>Add a property and a unit first.</p></Drawer>;

  return (
    <Drawer title="Add a tenant" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>Save tenant and lease</button></>}>
      <Field label="Unit" htmlFor="tf-u">
        <select id="tf-u" className="input" value={uId} onChange={(e) => { setUId(e.target.value); const u = state.units.find((x) => x.id === e.target.value); setRent(u?.rent); setLmr(u?.rent); }}>
          {(free.length ? free : state.units).map((u) => <option key={u.id} value={u.id}>{state.properties.find((p) => p.id === u.propertyId)?.nickname} — Unit {u.label}</option>)}
        </select>
      </Field>
      <h3 style={{ margin: '8px 0 12px' }}>Who lives there</h3>
      {names.map((n, i) => (
        <Field key={i} label={i === 0 ? 'Tenant name' : `Co-tenant ${i}`} htmlFor={`tf-n${i}`}>
          <input id={`tf-n${i}`} className="input" value={n} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} autoComplete="off" />
        </Field>
      ))}
      <button className="btn small ghost" onClick={() => setNames([...names, ''])} style={{ marginBottom: 16 }}><Icon name="plus" size={14} />Add co-tenant</button>
      <div className="grid2">
        <Field label="Email" htmlFor="tf-e" hint="Receipts and reminders go here"><input id="tf-e" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone" htmlFor="tf-p"><input id="tf-p" type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>The tenant agreed in the lease to receive notices by email<span className="tiny soft" style={{ display: 'block' }}>Stored with the lease as evidence. Without consent, legal notices fall back to print and hand delivery.</span></span>
      </label>
      <h3 style={{ margin: '20px 0 12px' }}>Lease</h3>
      <div className="grid2">
        <Field label="Start date" htmlFor="tf-s"><input id="tf-s" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Monthly rent" htmlFor="tf-r"><MoneyInput id="tf-r" value={rent} onChange={setRent} /></Field>
        <Field label="Rent due on day" htmlFor="tf-d"><input id="tf-d" type="number" min={1} max={28} className="input" value={dueDay} onChange={(e) => setDueDay(Number(e.target.value) || 1)} /></Field>
        <Field label={<Term def="Ontario allows a deposit of up to one month's rent, applied to the last month. Interest is owed yearly at the guideline rate.">Last month's rent deposit</Term>} htmlFor="tf-lmr"><MoneyInput id="tf-lmr" value={lmr} onChange={setLmr} /></Field>
      </div>
      <Field label="How will they pay?"><Seg label="Method" value={method} onChange={setMethod} options={[{ id: 'etransfer', label: 'e-Transfer' }, { id: 'cheque', label: 'Cheque' }, { id: 'cash', label: 'Cash' }, { id: 'direct-deposit', label: 'Deposit' }]} /></Field>
      <Field label="Utilities arrangement" htmlFor="tf-ut"><input id="tf-ut" className="input" value={utilities} onChange={(e) => setUtilities(e.target.value)} placeholder="Tenant pays hydro; heat and water included" /></Field>
      <div className="btn-row"><label className="check"><input type="checkbox" checked={parking} onChange={(e) => setParking(e.target.checked)} />Parking</label><label className="check"><input type="checkbox" checked={pets} onChange={(e) => setPets(e.target.checked)} />Pets</label></div>
      <p className="small soft">The rent schedule is created from these terms: one charge per month, due on the {dueDay}{dueDay === 1 ? 'st' : 'th'}.</p>
    </Drawer>
  );
}

// =====================================================================================
// Mortgage (Phase 3, PS-2)
// =====================================================================================
export function MortgageForm({ propertyId, mortgage, onClose }: { propertyId: string; mortgage?: Mortgage; onClose: () => void }) {
  const { act, today } = useStore();
  const [m, setM] = useState<Mortgage>(() => mortgage ?? { id: uid('m'), propertyId, lender: '', principal: 0, startDate: today, ratePct: 4.5, amortYears: 25, termEnd: addMonths(today, 60), frequency: 'monthly' });
  const set = (x: Partial<Mortgage>) => setM((o) => ({ ...o, ...x }));
  const computed = m.principal > 0 ? mortgagePayment(m.principal, m.ratePct, m.amortYears, m.frequency) : 0;
  return (
    <Drawer title={mortgage ? 'Edit mortgage' : 'Add a mortgage'} onClose={onClose}
      footer={<>
        {mortgage && <button className="btn ghost danger" onClick={() => { act.removeMortgage(mortgage.id); onClose(); }}>Remove</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!m.lender || !m.principal} onClick={() => { act.saveMortgage(m); onClose(); }}>Save mortgage</button>
      </>}>
      <div className="callout">Enter the figures from the start of your <strong>current term</strong> (your last renewal, or purchase if you have not renewed). Keyholder works out each payment's principal and interest.</div>
      <Field label="Lender" htmlFor="mf-l"><input id="mf-l" className="input" value={m.lender} onChange={(e) => set({ lender: e.target.value })} placeholder="RBC, TD, a credit union…" /></Field>
      <div className="grid2">
        <Field label="Balance at term start" htmlFor="mf-p"><MoneyInput id="mf-p" value={m.principal || undefined} onChange={(c) => set({ principal: c ?? 0 })} /></Field>
        <Field label="Term start" htmlFor="mf-s"><input id="mf-s" type="date" className="input" value={m.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
        <Field label="Interest rate (%)" htmlFor="mf-r" hint="Fixed-rate, compounded semi-annually"><input id="mf-r" type="number" step="0.01" className="input mono" value={m.ratePct} onChange={(e) => set({ ratePct: Number(e.target.value) })} /></Field>
        <Field label="Years left to pay (amortization)" htmlFor="mf-a"><input id="mf-a" type="number" min={1} max={40} className="input" value={m.amortYears} onChange={(e) => set({ amortYears: Number(e.target.value) || 25 })} /></Field>
        <Field label="Term ends (renewal)" htmlFor="mf-t"><input id="mf-t" type="date" className="input" value={m.termEnd} onChange={(e) => set({ termEnd: e.target.value })} /></Field>
        <Field label="Payment frequency" htmlFor="mf-f">
          <select id="mf-f" className="input" value={m.frequency} onChange={(e) => set({ frequency: e.target.value as MortgageFrequency })}>
            <option value="monthly">Monthly</option><option value="semi-monthly">Twice a month</option><option value="biweekly">Every two weeks</option><option value="weekly">Weekly</option>
          </select>
        </Field>
      </div>
      <Field label="Payment amount" htmlFor="mf-pay" hint={computed ? `Calculated: ${fmt(computed)}. Override only if your statement differs.` : undefined}>
        <MoneyInput id="mf-pay" value={m.paymentOverride ?? (computed || undefined)} onChange={(c) => set({ paymentOverride: c && c !== computed ? c : undefined })} />
      </Field>
    </Drawer>
  );
}

// =====================================================================================
// Valuation entries (Phase 2)
// =====================================================================================
export function OwnerEstimateForm({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const { act, today } = useStore();
  const [likely, setLikely] = useState<number | undefined>();
  const [low, setLow] = useState<number | undefined>();
  const [high, setHigh] = useState<number | undefined>();
  const [source, setSource] = useState<Valuation['source']>('owner');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  return (
    <Drawer title="Record a value" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!likely} onClick={() => {
      if (!likely) return;
      act.addValuation({ propertyId, date, source, likely, low: low ?? Math.round(likely * 0.95), high: high ?? Math.round(likely * 1.05), confidence: source === 'assessment' ? 'medium' : 'low', note: note || undefined });
      onClose();
    }}>Save to history</button></>}>
      <Field label="Where is this number from?"><Seg label="Source" value={source} onChange={setSource} options={[{ id: 'owner', label: 'My estimate' }, { id: 'assessment', label: 'Assessment / appraisal' }]} /></Field>
      <Field label="Most likely value" htmlFor="oe-l"><MoneyInput id="oe-l" value={likely} onChange={setLikely} /></Field>
      <div className="grid2">
        <Field label="Low (optional)" htmlFor="oe-lo"><MoneyInput id="oe-lo" value={low} onChange={setLow} /></Field>
        <Field label="High (optional)" htmlFor="oe-hi"><MoneyInput id="oe-hi" value={high} onChange={setHigh} /></Field>
      </div>
      <Field label="As of" htmlFor="oe-d"><input id="oe-d" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Note" htmlFor="oe-n"><input id="oe-n" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="MPAC 2016 value, bank appraisal at refinance…" /></Field>
      <p className="small soft">Every value is kept as a dated entry. Nothing is overwritten.</p>
    </Drawer>
  );
}

export function ComparableForm({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const { act, today } = useStore();
  const [c, setC] = useState<Comparable>({ id: uid('c'), propertyId, address: '', saleDate: today, price: 0, bedrooms: 3, similarity: 'similar' });
  const set = (x: Partial<Comparable>) => setC((o) => ({ ...o, ...x }));
  return (
    <Drawer title="Add a nearby sale" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!c.address || !c.price} onClick={() => { act.saveComparable(c); onClose(); }}>Add sale</button></>}>
      <Field label="Address" htmlFor="cf-a"><input id="cf-a" className="input" value={c.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Sold for" htmlFor="cf-p"><MoneyInput id="cf-p" value={c.price || undefined} onChange={(v) => set({ price: v ?? 0 })} /></Field>
        <Field label="Sale date" htmlFor="cf-d"><input id="cf-d" type="date" className="input" value={c.saleDate} max={today} onChange={(e) => set({ saleDate: e.target.value })} /></Field>
      </div>
      <Field label="Bedrooms" htmlFor="cf-b"><input id="cf-b" type="number" className="input" value={c.bedrooms} onChange={(e) => set({ bedrooms: Number(e.target.value) })} /></Field>
      <Field label="Compared with yours, it is…"><Seg label="Similarity" value={c.similarity} onChange={(similarity) => set({ similarity })} options={[{ id: 'less', label: 'Less desirable' }, { id: 'similar', label: 'About the same' }, { id: 'more', label: 'Nicer' }]} /></Field>
      <p className="small soft">Find recent sales on your local real estate board, HouseSigma, or ask your agent. Sales older than 12 months are not used.</p>
    </Drawer>
  );
}


