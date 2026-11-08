import { useState } from 'react';
import type { Mortgage, MortgageFrequency, Property } from '../data/types';
import { uid, useStore } from '../data/store';
import { addMonths } from '../lib/dates';
import { levelInfo, nextStep, propertyLevel, type Level } from '../lib/levels';
import { mortgagePayment } from '../lib/finance';
import { fmt } from '../lib/money';
import { Drawer, Field, MoneyInput, Seg } from './ui';
import { Icon } from './Icon';

// ---------- Badge: three key marks, filled up to the level ----------
export function LevelBadge({ level, plain }: { level: Level; plain?: boolean }) {
  const info = levelInfo(level);
  return (
    <span className={`level-badge ${level}`} title={`${info.name}: ${info.gives}`}>
      <span className="keys" aria-hidden>
        {[1, 2, 3].map((n) => (
          <svg key={n} width="14" height="14" viewBox="0 0 24 24" className={n <= info.rank ? 'on' : ''}>
            <circle cx="8" cy="12" r="5" fill="none" strokeWidth="3" />
            <path d="M13 12h9M19 12v4" strokeWidth="3" fill="none" />
          </svg>
        ))}
      </span>
      {!plain && <span>{info.name}</span>}
    </span>
  );
}

// ---------- The one suggested next step ----------
export function NextStepCard({ propertyId }: { propertyId?: string }) {
  const { state } = useStore();
  const [open, setOpen] = useState<Property | null>(null);
  const props = state.properties.filter((p) => !p.archived && (!propertyId || p.id === propertyId));
  const p = props.find((x) => nextStep(state, x));
  if (!p) return null;
  const step = nextStep(state, p)!;
  return (
    <>
      <div className={`next-step ${step.to}`}>
        <div className="next-step-text">
          <div className="next-step-level"><LevelBadge level={propertyLevel(state, p)} /> <Icon name="next" size={14} /> <LevelBadge level={step.to} /></div>
          <div className="what">{step.title}</div>
          <div className="why">{step.why} About 1 minute.</div>
        </div>
        <button className="btn primary" onClick={() => setOpen(p)}>{step.action}</button>
      </div>
      {open && <LevelUpForm property={open} to={step.to} onClose={() => setOpen(null)} />}
    </>
  );
}

// ---------- A locked tab, shown as an invitation ----------
export function LevelInvite({ property, to, title, points }: { property: Property; to: Level; title: string; points: string[] }) {
  const [open, setOpen] = useState(false);
  const step = nextStep(useStore().state, property);
  return (
    <div className="sheet invite">
      <LevelBadge level={to} />
      <h2>{title}</h2>
      <ul>{points.map((x) => <li key={x}>{x}</li>)}</ul>
      <button className="btn primary" onClick={() => setOpen(true)}>{step?.to === to ? step.action : to === 'gold' ? 'Add what I paid first' : 'Add details'}</button>
      {open && <LevelUpForm property={property} to={step?.to ?? to} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ---------- Short forms that move a property up one level ----------
export function LevelUpForm({ property, to, onClose }: { property: Property; to: Level; onClose: () => void }) {
  return to === 'gold' ? <GoldForm property={property} onClose={onClose} /> : <SilverForm property={property} onClose={onClose} />;
}

function SilverForm({ property, onClose }: { property: Property; onClose: () => void }) {
  const { act, today } = useStore();
  const [date, setDate] = useState(property.purchaseDate ?? '');
  const [price, setPrice] = useState(property.purchasePrice);
  const [owed, setOwed] = useState(property.approxMortgageBalance);
  const [pay, setPay] = useState(property.approxMortgagePayment);
  const ok = !!date && !!price;
  return (
    <Drawer title="What you paid" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ok} onClick={() => { act.saveProperty({ ...property, purchaseDate: date, purchasePrice: price, approxMortgageBalance: owed, approxMortgagePayment: pay }); onClose(); }}>Save</button></>}>
      <p className="soft" style={{ marginTop: 0 }}>{property.nickname}</p>
      <div className="grid2">
        <Field label="Price you paid" htmlFor="sv-price"><MoneyInput id="sv-price" value={price} onChange={setPrice} autoFocus /></Field>
        <Field label="Date you bought it" htmlFor="sv-date"><input id="sv-date" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <h3 style={{ margin: '8px 0 4px' }}>Mortgage, roughly <span className="soft small">(optional)</span></h3>
      <p className="small soft" style={{ marginTop: 0 }}>A rough number is fine. It shows what's yours after the mortgage.</p>
      <div className="grid2">
        <Field label="Still owed" htmlFor="sv-owed"><MoneyInput id="sv-owed" value={owed} onChange={setOwed} /></Field>
        <Field label="Monthly payment" htmlFor="sv-pay"><MoneyInput id="sv-pay" value={pay} onChange={setPay} /></Field>
      </div>
    </Drawer>
  );
}

function GoldForm({ property, onClose }: { property: Property; onClose: () => void }) {
  const { state, act, today } = useStore();
  const existing = state.mortgages.find((m) => m.propertyId === property.id);
  const [closing, setClosing] = useState(property.closingCosts);
  const [ltt, setLtt] = useState(property.landTransferTax);
  const [has, setHas] = useState<'yes' | 'no'>(property.mortgageFree ? 'no' : 'yes');
  const [m, setM] = useState<Mortgage>(() => existing ?? {
    id: uid('m'), propertyId: property.id, lender: '', principal: property.approxMortgageBalance ?? 0, startDate: today,
    ratePct: 4.5, amortYears: 25, termEnd: addMonths(today, 60), frequency: 'monthly',
  });
  const set = (x: Partial<Mortgage>) => setM((o) => ({ ...o, ...x }));
  const ok = closing !== undefined && ltt !== undefined && (has === 'no' || (!!m.lender && m.principal > 0));
  const save = () => {
    act.saveProperty({ ...property, closingCosts: closing, landTransferTax: ltt, mortgageFree: has === 'no' });
    if (has === 'yes') act.saveMortgage(m);
    onClose();
  };
  return (
    <Drawer title="Mortgage and purchase costs" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ok} onClick={save}>Save</button></>}>
      <p className="soft" style={{ marginTop: 0 }}>{property.nickname}</p>
      <h3 style={{ marginBottom: 8 }}>Costs when you bought</h3>
      <p className="small soft" style={{ marginTop: 0 }}>On your lawyer's statement. Enter 0 if none.</p>
      <div className="grid2">
        <Field label="Closing costs" htmlFor="gd-cc" hint="Lawyer, inspection, title insurance"><MoneyInput id="gd-cc" value={closing} onChange={setClosing} autoFocus /></Field>
        <Field label="Land transfer tax" htmlFor="gd-ltt"><MoneyInput id="gd-ltt" value={ltt} onChange={setLtt} /></Field>
      </div>
      <Field label="Is there a mortgage?"><Seg label="Mortgage" value={has} onChange={setHas} options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No, it is paid off' }]} /></Field>
      {has === 'yes' && (
        <>
          <p className="small soft" style={{ marginTop: 0 }}>From your latest mortgage statement or renewal letter.</p>
          <Field label="Bank or lender" htmlFor="gd-l"><input id="gd-l" className="input" value={m.lender} onChange={(e) => set({ lender: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="Amount owed at your last renewal" htmlFor="gd-p"><MoneyInput id="gd-p" value={m.principal || undefined} onChange={(c) => set({ principal: c ?? 0 })} /></Field>
            <Field label="Renewal date" htmlFor="gd-s"><input id="gd-s" type="date" className="input" value={m.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
            <Field label="Interest rate (%)" htmlFor="gd-r"><input id="gd-r" type="number" step="0.01" className="input" value={m.ratePct} onChange={(e) => set({ ratePct: Number(e.target.value) })} /></Field>
            <Field label="Years left to pay" htmlFor="gd-a"><input id="gd-a" type="number" min={1} max={40} className="input" value={m.amortYears} onChange={(e) => set({ amortYears: Number(e.target.value) || 25 })} /></Field>
            <Field label="Next renewal" htmlFor="gd-t"><input id="gd-t" type="date" className="input" value={m.termEnd} onChange={(e) => set({ termEnd: e.target.value })} /></Field>
            <Field label="Pay every" htmlFor="gd-f">
              <select id="gd-f" className="input" value={m.frequency} onChange={(e) => set({ frequency: e.target.value as MortgageFrequency })}>
                <option value="monthly">Month</option><option value="semi-monthly">Half month</option><option value="biweekly">Two weeks</option><option value="weekly">Week</option>
              </select>
            </Field>
          </div>
          {m.principal > 0 && <p className="small soft">Payment works out to about <strong className="mono">{fmt(mortgagePayment(m.principal, m.ratePct, m.amortYears, m.frequency))}</strong>.</p>}
        </>
      )}
    </Drawer>
  );
}
