import { useMemo, useState } from 'react';
import type {
  CCAClass, Comparable, Expense, ExpenseCategory, Lease, Mortgage, MortgageFrequency, PayMethod, Payment, Person, Property, PropertyType, Tenant, Unit, Valuation,
} from '../data/types';
import { uid, useStore } from '../data/store';
import { propertyLevel } from '../lib/levels';
import { addMonths, fmtPeriod, periodOf } from '../lib/dates';
import { activeLeases, byRoom, hasSpace, leaseLedger, mortgagePayment, openRooms, rentalPortion } from '../lib/finance';
import { withPeople } from '../lib/people';
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

      {(

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

      {e.kind === 'capital' && prop && propertyLevel(state, prop) === 'gold' && (
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
// Property (PS-1, PS-3, PS-5) — extra detail is optional and raises the property's level
// =====================================================================================
export function PropertyForm({ onClose, property }: { onClose: () => void; property?: Property }) {
  const { state, act } = useStore();
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

      {property && (
        <details className="more" open={!!p.purchasePrice}>
          <summary>What you paid (for Silver)</summary>
          <div className="grid2" style={{ paddingTop: 4 }}>
            <Field label="Purchase date" htmlFor="pp-pd"><input id="pp-pd" type="date" className="input" value={p.purchaseDate ?? ''} onChange={(e) => set({ purchaseDate: e.target.value || undefined })} /></Field>
            <Field label="Purchase price" htmlFor="pp-pp"><MoneyInput id="pp-pp" value={p.purchasePrice} onChange={(c) => set({ purchasePrice: c })} /></Field>
          </div>
          {!state.mortgages.some((m) => m.propertyId === p.id) && (
            <div className="grid2">
              <Field label="Mortgage still owed (rough)" htmlFor="pp-mb"><MoneyInput id="pp-mb" value={p.approxMortgageBalance} onChange={(c) => set({ approxMortgageBalance: c })} /></Field>
              <Field label="Monthly mortgage payment (rough)" htmlFor="pp-mp"><MoneyInput id="pp-mp" value={p.approxMortgagePayment} onChange={(c) => set({ approxMortgagePayment: c })} /></Field>
            </div>
          )}
        </details>
      )}
      {property && (
        <details className="more" open={p.closingCosts !== undefined}>
          <summary>Purchase costs and taxes (for Gold)</summary>
          <div className="grid2">
            <Field label="Closing costs" htmlFor="pp-cc" hint="Legal fees, title insurance, inspection"><MoneyInput id="pp-cc" value={p.closingCosts} onChange={(c) => set({ closingCosts: c })} /></Field>
            <Field label="Land transfer tax" htmlFor="pp-ltt"><MoneyInput id="pp-ltt" value={p.landTransferTax} onChange={(c) => set({ landTransferTax: c })} /></Field>
            <Field label="Improvements at purchase" htmlFor="pp-imp" hint="Work done before the first tenant"><MoneyInput id="pp-imp" value={p.improvementsAtPurchase} onChange={(c) => set({ improvementsAtPurchase: c })} /></Field>
            <Field label={<><Term def="Land cannot be depreciated, so CCA applies only to the building share of the price">Land share of price</Term> (%)</>} htmlFor="pp-land" hint="Your property tax assessment shows land vs building"><input id="pp-land" type="number" className="input" min={0} max={95} value={p.landValuePct ?? 30} onChange={(e) => set({ landValuePct: Number(e.target.value) })} /></Field>
            <Field label="Annual property tax" htmlFor="pp-tax"><MoneyInput id="pp-tax" value={p.annualPropertyTax} onChange={(c) => set({ annualPropertyTax: c })} /></Field>
            <Field label="Annual insurance" htmlFor="pp-ins"><MoneyInput id="pp-ins" value={p.annualInsurance} onChange={(c) => set({ annualInsurance: c })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={p.claimCCA} onChange={(e) => set({ claimCCA: e.target.checked })} />
            <span>Claim depreciation (CCA) on this property
              <span className="tiny soft" style={{ display: 'block' }}>{p.ownerOccupied ? 'Off for a home you live in. It can affect tax when you sell. Ask your accountant first.' : 'Lowers tax now, but some is usually paid back when you sell.'}</span>
            </span>
          </label>
        </details>
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
  const leases = unit ? activeLeases(state, unit.id, today) : [];
  const occupied = leases.length > 0;
  const rooms = u.rentedBy === 'room';
  // Rooms already rented can't be taken away; a unit with several room leases can't become one lease.
  const minRooms = Math.max(1, ...leases.map((l) => Number(l.room?.replace(/\D/g, '') || 1)));
  const tooFew = rooms && (u.rooms ?? 0) < minRooms;
  const splitLeases = !rooms && leases.length > 1;
  return (
    <Drawer title={unit ? `Unit ${unit.label}` : 'Add a unit'} onClose={onClose}
      footer={<>
        {unit && !occupied && <button className="btn ghost danger" onClick={() => { act.removeUnit(unit.id); onClose(); }}>Remove unit</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!u.label.trim() || tooFew || splitLeases} onClick={() => { act.saveUnit(u); onClose(); }}>Save unit</button>
      </>}>
      <div className="grid2">
        <Field label="Door label" htmlFor="uf-l" hint='"A", "Upper", "Basement"'><input id="uf-l" className="input" value={u.label} onChange={(e) => set({ label: e.target.value })} /></Field>
        <Field label="Bedrooms" htmlFor="uf-b"><input id="uf-b" type="number" min={0} className="input" value={u.bedrooms} onChange={(e) => set({ bedrooms: Number(e.target.value) })} /></Field>
      </div>
      <Field label="How is it rented?" hint={rooms ? 'Each room has its own tenant, lease and rent.' : 'One lease and one rent, shared by everyone on it (a couple, a family or roommates).'}>
        <Seg label="How is it rented?" value={rooms ? 'room' : 'whole'} onChange={(v) => set(v === 'room' ? { rentedBy: 'room', rooms: Math.max(u.rooms ?? u.bedrooms ?? 1, minRooms, 1) } : { rentedBy: 'whole' })} options={[{ id: 'whole', label: 'As a whole' }, { id: 'room', label: 'By the room' }]} />
      </Field>
      {splitLeases && <div className="callout warn">This unit has {leases.length} room leases running. End all but one before renting it as a whole.</div>}
      {rooms && (
        <Field label="Rooms for rent" htmlFor="uf-rooms" hint={tooFew ? `Room ${minRooms} is rented, so keep at least ${minRooms} rooms.` : undefined}>
          <input id="uf-rooms" type="number" min={minRooms} max={12} className="input" value={u.rooms ?? ''} onChange={(e) => set({ rooms: Math.min(12, Number(e.target.value) || 0) })} />
        </Field>
      )}
      <Field label={rooms ? 'Usual rent for one room' : 'Asking or current rent'} htmlFor="uf-r"><MoneyInput id="uf-r" value={u.rent || undefined} onChange={(c) => set({ rent: c ?? 0 })} /></Field>
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
  const free = state.units.filter((u) => hasSpace(state, u, today));
  const [uId, setUId] = useState(unitId ?? free[0]?.id ?? '');
  const unit = state.units.find((u) => u.id === uId);
  const rooms = unit && byRoom(unit) ? openRooms(state, unit, today) : [];
  const [room, setRoom] = useState(rooms[0] ?? '');
  const [people, setPeople] = useState<Person[]>([{ name: '', email: '', phone: '' }]);
  const setPerson = (i: number, x: Partial<Person>) => setPeople((ps) => ps.map((p, j) => (j === i ? { ...p, ...x } : p)));
  const email = people[0].email;
  const [consent, setConsent] = useState(true);
  const [start, setStart] = useState(`${periodOf(addMonths(today, 1))}-01`);
  const [rent, setRent] = useState<number | undefined>(unit?.rent || undefined);
  const [dueDay, setDueDay] = useState(1);
  const [method, setMethod] = useState<PayMethod>('etransfer');
  const [lmr, setLmr] = useState<number | undefined>(unit?.rent || undefined);
  const [parking, setParking] = useState(false);
  const [pets, setPets] = useState(false);
  const [utilities, setUtilities] = useState('');
  const valid = unit && people[0].name.trim() && rent && start && (!byRoom(unit) || room);

  const save = () => {
    if (!unit || !rent) return;
    const tid = uid('t');
    const base: Tenant = { id: tid, unitId: unit.id, names: [], email: '', phone: '', noticeMethod: consent && email ? 'email' : 'hand', emailConsent: consent && !!email, emailConsentDate: consent && email ? today : undefined, aliases: [] };
    const t = withPeople(base, people);
    const l: Lease = { id: uid('l'), unitId: unit.id, tenantId: tid, room: byRoom(unit) ? room : undefined, start, rent, dueDay, paymentMethod: method, lmrDeposit: lmr ?? 0, utilities, parking, pets, emailNoticeConsent: consent && !!email };
    act.addTenancy(t, l);
    onClose();
  };

  if (!state.units.length) return <Drawer title="Add a tenant" onClose={onClose}><p>Add a property and a unit first.</p></Drawer>;

  return (
    <Drawer title="Add a tenant" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid} onClick={save}>Save tenant and lease</button></>}>
      <Field label="Unit" htmlFor="tf-u">
        <select id="tf-u" className="input" value={uId} onChange={(e) => { setUId(e.target.value); const u = state.units.find((x) => x.id === e.target.value); setRent(u?.rent); setLmr(u?.rent); setRoom(u && byRoom(u) ? openRooms(state, u, today)[0] ?? '' : ''); }}>
          {(free.length ? free : state.units).map((u) => <option key={u.id} value={u.id}>{state.properties.find((p) => p.id === u.propertyId)?.nickname} — Unit {u.label}{byRoom(u) ? ` (${openRooms(state, u, today).length} free of ${u.rooms ?? 1} rooms)` : ''}</option>)}
        </select>
      </Field>
      {unit && byRoom(unit) && (rooms.length
        ? <Field label="Which room?"><Seg label="Which room?" value={room} onChange={setRoom} options={rooms.map((r) => ({ id: r, label: r }))} /></Field>
        : <div className="callout warn">Every room in Unit {unit.label} is rented. Add a room in the unit's settings first.</div>)}
      <h3 style={{ margin: '8px 0 4px' }}>Who is on the lease</h3>
      <p className="small soft" style={{ margin: '0 0 12px' }}>{unit && byRoom(unit) ? 'Usually one person per room.' : 'Add everyone who signs: a couple or roommates share one lease and one rent.'} Receipts and reminders go to everyone's email.</p>
      {people.map((p, i) => (
        <fieldset key={i} className="person-fields">
          <legend>{people.length > 1 ? `Person ${i + 1}` : 'Tenant'}{i > 0 && <button type="button" className="btn small ghost" onClick={() => setPeople(people.filter((_, j) => j !== i))} aria-label={`Remove person ${i + 1}`}><Icon name="close" size={14} />Remove</button>}</legend>
          <Field label="Full name" htmlFor={`tf-n${i}`}><input id={`tf-n${i}`} className="input" value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} autoComplete="off" /></Field>
          <div className="grid2">
            <Field label="Email" htmlFor={`tf-e${i}`}><input id={`tf-e${i}`} type="email" className="input" value={p.email} onChange={(e) => setPerson(i, { email: e.target.value })} /></Field>
            <Field label="Phone" htmlFor={`tf-p${i}`}><input id={`tf-p${i}`} type="tel" className="input" value={p.phone} onChange={(e) => setPerson(i, { phone: e.target.value })} /></Field>
          </div>
        </fieldset>
      ))}
      <button className="btn small ghost" onClick={() => setPeople([...people, { name: '', email: '', phone: '' }])} style={{ marginBottom: 16 }}><Icon name="plus" size={14} />Add another person</button>
      <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{people.length > 1 ? 'Everyone on the lease agreed' : 'The tenant agreed'} in the lease to receive notices by email<span className="tiny soft" style={{ display: 'block' }}>Stored with the lease as evidence. Without consent, legal notices fall back to print and hand delivery.</span></span>
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
export function MortgageForm({ propertyId, mortgage, prefill, onClose }: { propertyId: string; mortgage?: Mortgage; prefill?: Partial<Mortgage>; onClose: () => void }) {
  const { act, today } = useStore();
  const [m, setM] = useState<Mortgage>(() => mortgage ?? { ...newMortgage(propertyId, today), ...prefill });
  return (
    <Drawer title={mortgage ? 'Edit mortgage' : 'Add a mortgage'} onClose={onClose}
      footer={<>
        {mortgage && <button className="btn ghost danger" onClick={() => { act.removeMortgage(mortgage.id); onClose(); }}>Remove</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!m.lender || !m.principal} onClick={() => { act.saveMortgage(m); onClose(); }}>Save mortgage</button>
      </>}>
      <MortgageFields m={m} onChange={setM} isNew={!mortgage} />
    </Drawer>
  );
}

export function newMortgage(propertyId: string, today: string, balance = 0): Mortgage {
  return { id: uid('m'), propertyId, lender: '', principal: balance, startDate: today, ratePct: 4.5, amortYears: 25, termEnd: addMonths(today, 60), frequency: 'monthly', rateType: 'fixed', termYears: 5, prepayments: [] };
}

const FREQS: { id: string; label: string; freq: MortgageFrequency; accelerated: boolean }[] = [
  { id: 'monthly', label: 'Every month', freq: 'monthly', accelerated: false },
  { id: 'semi-monthly', label: 'Twice a month', freq: 'semi-monthly', accelerated: false },
  { id: 'biweekly', label: 'Every two weeks', freq: 'biweekly', accelerated: false },
  { id: 'acc-biweekly', label: 'Every two weeks, accelerated', freq: 'biweekly', accelerated: true },
  { id: 'weekly', label: 'Every week', freq: 'weekly', accelerated: false },
  { id: 'acc-weekly', label: 'Every week, accelerated', freq: 'weekly', accelerated: true },
];

/** Shared mortgage fields (Mortgage tab and the Gold step). Plain choices, worked-out dates and payments. */
export function MortgageFields({ m, onChange, isNew }: { m: Mortgage; onChange: (m: Mortgage) => void; isNew?: boolean }) {
  const { today } = useStore();
  const [mode, setMode] = useState<'today' | 'renewal'>(isNew ? 'today' : 'renewal');
  const set = (x: Partial<Mortgage>) => {
    const next = { ...m, ...x };
    if (mode === 'renewal' && (x.startDate || x.termYears)) next.termEnd = addMonths(next.startDate, 12 * (next.termYears ?? 5));
    // Accelerated payments are a share of the monthly payment.
    if (next.accelerated) next.paymentOverride = Math.round(mortgagePayment(next.principal, next.ratePct, next.amortYears, 'monthly') / (next.frequency === 'weekly' ? 4 : 2));
    else if ('accelerated' in x || 'frequency' in x) next.paymentOverride = undefined;
    onChange(next);
  };
  const freqId = FREQS.find((f) => f.freq === m.frequency && f.accelerated === !!m.accelerated)?.id ?? 'monthly';
  const computed = m.principal > 0 ? (m.paymentOverride ?? mortgagePayment(m.principal, m.ratePct, m.amortYears, m.frequency)) : 0;
  const extras = m.prepayments ?? [];
  return (
    <>
      <Field label="Which do you know?">
        <Seg label="Starting point" value={mode} onChange={(v) => { setMode(v); if (v === 'today') onChange({ ...m, startDate: today }); }} options={[{ id: 'today', label: 'What I owe today' }, { id: 'renewal', label: 'What I owed at my last renewal' }]} />
      </Field>
      <Field label="Bank or lender" htmlFor="mf-l"><input id="mf-l" className="input" value={m.lender} onChange={(e) => set({ lender: e.target.value })} placeholder="RBC, TD, a credit union…" /></Field>
      <div className="grid2">
        <Field label={mode === 'today' ? 'Amount owed today' : 'Amount owed at renewal'} htmlFor="mf-p" hint="On your mortgage statement or banking app"><MoneyInput id="mf-p" value={m.principal || undefined} onChange={(c) => set({ principal: c ?? 0 })} /></Field>
        {mode === 'renewal'
          ? <Field label="Renewal date" htmlFor="mf-s"><input id="mf-s" type="date" className="input" value={m.startDate} max={today} onChange={(e) => set({ startDate: e.target.value })} /></Field>
          : <Field label="Years left to pay it off" htmlFor="mf-a" hint="Your amortization"><input id="mf-a" type="number" min={1} max={40} className="input" value={m.amortYears} onChange={(e) => set({ amortYears: Number(e.target.value) || 25 })} /></Field>}
        <Field label="Interest rate (%)" htmlFor="mf-r"><input id="mf-r" type="number" step="0.01" className="input mono" value={m.ratePct} onChange={(e) => set({ ratePct: Number(e.target.value) })} /></Field>
        <Field label="Rate type"><Seg label="Rate type" value={m.rateType ?? 'fixed'} onChange={(rateType) => set({ rateType })} options={[{ id: 'fixed', label: 'Fixed' }, { id: 'variable', label: 'Variable' }]} /></Field>
        {mode === 'renewal' && <Field label="Years left to pay it off (at renewal)" htmlFor="mf-a2"><input id="mf-a2" type="number" min={1} max={40} className="input" value={m.amortYears} onChange={(e) => set({ amortYears: Number(e.target.value) || 25 })} /></Field>}
        <Field label="Term length" htmlFor="mf-tl"><select id="mf-tl" className="input" value={m.termYears ?? 5} onChange={(e) => set({ termYears: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 7, 10].map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}</select></Field>
        <Field label="Next renewal date" htmlFor="mf-t" hint={mode === 'renewal' ? 'Worked out from the term; change it if different' : undefined}><input id="mf-t" type="date" className="input" value={m.termEnd} onChange={(e) => onChange({ ...m, termEnd: e.target.value })} /></Field>
        <Field label="Payments" htmlFor="mf-f">
          <select id="mf-f" className="input" value={freqId} onChange={(e) => { const f = FREQS.find((x) => x.id === e.target.value)!; set({ frequency: f.freq, accelerated: f.accelerated }); }}>
            {FREQS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </Field>
      </div>
      {computed > 0 && <p className="small">Each payment: <strong className="mono">{fmt(computed)}</strong>{m.accelerated ? ' (accelerated pays it off years sooner)' : ''}. <button className="linkish" onClick={() => onChange({ ...m, paymentOverride: computed })}>My bank's amount is different</button></p>}
      {m.paymentOverride !== undefined && !m.accelerated && <Field label="Payment from your statement" htmlFor="mf-pay"><MoneyInput id="mf-pay" value={m.paymentOverride} onChange={(c) => onChange({ ...m, paymentOverride: c })} /></Field>}

      <h3 style={{ margin: '16px 0 8px' }}>Extra payments</h3>
      <p className="small soft" style={{ marginTop: 0 }}>Lump sums go straight to what you owe.</p>
      {extras.map((x, i) => (
        <div key={i} className="grid3" style={{ alignItems: 'end' }}>
          <Field label="Date" htmlFor={`px-d-${i}`}><input id={`px-d-${i}`} type="date" className="input" value={x.date} onChange={(e) => onChange({ ...m, prepayments: extras.map((y, j) => (j === i ? { ...y, date: e.target.value } : y)) })} /></Field>
          <Field label="Amount" htmlFor={`px-a-${i}`}><MoneyInput id={`px-a-${i}`} value={x.amount || undefined} onChange={(c) => onChange({ ...m, prepayments: extras.map((y, j) => (j === i ? { ...y, amount: c ?? 0 } : y)) })} /></Field>
          <div className="field"><button className="btn ghost" onClick={() => onChange({ ...m, prepayments: extras.filter((_, j) => j !== i) })}>Remove</button></div>
        </div>
      ))}
      <button className="btn small" onClick={() => onChange({ ...m, prepayments: [...extras, { date: today, amount: 0 }] })}><Icon name="plus" size={14} />Add an extra payment</button>

      <h3 style={{ margin: '20px 0 8px' }}>Background <span className="small soft">(optional)</span></h3>
      <div className="grid3">
        <Field label="Original amount borrowed" htmlFor="mf-oa"><MoneyInput id="mf-oa" value={m.originalAmount} onChange={(c) => onChange({ ...m, originalAmount: c })} /></Field>
        <Field label="When you first got it" htmlFor="mf-od"><input id="mf-od" type="date" className="input" value={m.originalDate ?? ''} onChange={(e) => onChange({ ...m, originalDate: e.target.value || undefined })} /></Field>
        <Field label="Mortgage insurance" htmlFor="mf-ins"><select id="mf-ins" className="input" value={m.insurer ?? 'None'} onChange={(e) => onChange({ ...m, insurer: e.target.value })}>{['None', 'CMHC', 'Sagen', 'Canada Guaranty'].map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
    </>
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


