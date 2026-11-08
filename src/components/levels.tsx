import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Mortgage, MortgageFrequency, Property } from '../data/types';
import { uid, useStore } from '../data/store';
import { addMonths } from '../lib/dates';
import { hasSilver, levelInfo, nextStep, propertyLevel, type Level } from '../lib/levels';
import { byValue, keyholderScore, propertyCompletion } from '../lib/score';
import { mortgagePayment, propertyValue, worthIt } from '../lib/finance';
import { fmt, fmtShort } from '../lib/money';
import { Drawer, Field, MoneyInput, Seg } from './ui';

// ---------- Stage chip: a small metal swatch with the stage name ----------
export function LevelBadge({ level, plain }: { level: Level; plain?: boolean }) {
  const info = levelInfo(level);
  return (
    <span className={`level-badge ${level}`} title={`${info.name}: ${info.gives}`}>
      <span className="swatch" aria-hidden />
      {!plain && <span>{info.name}</span>}
    </span>
  );
}

// ---------- % ring ----------
function Ring({ pct, size = 52 }: { pct: number; size?: number }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{pct}%</text>
    </svg>
  );
}

// Remember each card's last stage across renders so an upgrade can play its glow once.
const seenStage = new Map<string, Level>();

// ---------- The living property card: metal changes with its stage ----------
export function PropertyCard({ property, suggested, active, compact }: { property: Property; suggested?: boolean; active?: boolean; compact?: boolean }) {
  const { state, today } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const level = propertyLevel(state, property);
  const pct = propertyCompletion(state, property, today);
  const pv = propertyValue(state, property, today);
  const earned = worthIt(state, today, { propertyId: property.id }).total;
  // This property's biggest missing item (same list as the Keyholder score).
  const item = keyholderScore(state, today).todo.find((i) => i.propertyId === property.id);
  const formTo: Level | null = item?.levelUp ? (item.levelUp === 'gold' && !hasSilver(property) ? 'silver' : item.levelUp) : null;
  const ref = useRef<HTMLDivElement>(null);
  const [upgraded, setUpgraded] = useState(false);

  useEffect(() => {
    const was = seenStage.get(property.id);
    seenStage.set(property.id, level);
    if (was && levelInfo(level).rank > levelInfo(was).rank) {
      setUpgraded(true);
      const t = setTimeout(() => setUpgraded(false), 2600);
      return () => clearTimeout(t);
    }
  }, [level, property.id]);

  // 3D tilt toward the pointer, with a moving highlight. Mouse and pen only; touch keeps the card flat.
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
    ref.current.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
    ref.current.style.setProperty('--mx', `${x * 100}%`);
    ref.current.style.setProperty('--my', `${y * 100}%`);
  };
  const onLeave = () => { ref.current?.style.setProperty('--rx', '0deg'); ref.current?.style.setProperty('--ry', '0deg'); };

  return (
    <>
      <div ref={ref} className={`pcard ${level}${suggested ? ' suggested' : ''}${active ? ' active' : ''}${upgraded ? ' upgraded' : ''}${compact ? ' compact' : ''}`}
        onPointerMove={onMove} onPointerLeave={onLeave}>
        <div className="pcard-light" aria-hidden />
        <div className="pcard-top">
          <button className="pcard-name" onClick={() => nav(`/rent/property/${property.id}`)}>
            <span className="pcard-stage">{levelInfo(level).name}{suggested ? ' · Suggested next' : ''}</span>
            <span className="pcard-title">{property.nickname}</span>
            <span className="pcard-addr">{property.address}, {property.city}</span>
          </button>
          <Ring pct={pct} />
        </div>
        <div className="pcard-figs">
          <div><span>Worth about</span><strong>{pv.basis === 'rent' ? '~' : ''}{fmtShort(pv.value)}</strong></div>
          <div><span>Earned, 12 months</span><strong>{fmtShort(earned)}</strong></div>
        </div>
        {item && !compact && (
          <div className="pcard-next">
            <span>{item.text.replace(` for ${property.nickname}`, '').replace(` at ${property.nickname}`, '')} <em>+{item.points - item.earned} points</em></span>
            <button className="btn small" onClick={() => (formTo ? setOpen(true) : nav(item.to))}>Add</button>
          </div>
        )}
        {!item && !compact && <div className="pcard-next done"><span>Every detail added. Nice work.</span></div>}
      </div>
      {open && formTo && <LevelUpForm property={property} to={formTo} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Property cards, most valuable first; the first one still missing details is marked "Suggested next". */
export function PropertyCards() {
  const { state, today } = useStore();
  const props = byValue(state, today);
  const todo = keyholderScore(state, today).todo;
  const suggested = props.find((p) => todo.some((i) => i.propertyId === p.id));
  if (!props.length) return null;
  return <div className="pcards">{props.map((p) => <PropertyCard key={p.id} property={p} suggested={p.id === suggested?.id} />)}</div>;
}

// ---------- Keyholder score: small chip, opens what to do next ----------
export function ScoreChip() {
  const { state, today } = useStore();
  const { score, todo } = useMemo(() => keyholderScore(state, today), [state, today]);
  const [open, setOpen] = useState(false);
  const shown = useCountUp(score);
  const prev = useRef(score);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (score > prev.current) { setBump(true); const t = setTimeout(() => setBump(false), 1200); prev.current = score; return () => clearTimeout(t); }
    prev.current = score;
  }, [score]);
  const next = todo[0];
  return (
    <>
      <button className={`score-chip${bump ? ' bump' : ''}`} onClick={() => setOpen(true)} aria-label={`Keyholder score ${score} out of 100. See how to raise it.`}>
        <span className="score-ring" style={{ ['--p' as string]: `${score}` }}><span>{shown}</span></span>
        <span className="score-label">Keyholder score</span>
        {next && <span className="score-next">+{next.points - next.earned} next</span>}
      </button>
      {open && <ScoreDrawer onClose={() => setOpen(false)} />}
    </>
  );
}

function useCountUp(target: number) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current, d = target - start;
    if (!d || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); from.current = target; return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / 600); setV(Math.round(start + d * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); else from.current = target; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function ScoreDrawer({ onClose }: { onClose: () => void }) {
  const { state, today } = useStore();
  const nav = useNavigate();
  const { score, todo } = keyholderScore(state, today);
  const [form, setForm] = useState<{ p: Property; to: Level } | null>(null);
  return (
    <Drawer title="Keyholder score" onClose={onClose}>
      <div className="score-hero"><span className="score-ring big" style={{ ['--p' as string]: `${score}` }}><span>{score}</span></span>
        <p style={{ margin: 0 }}>{score >= 100 ? 'Everything is complete.' : 'Complete these to raise your score. Bigger wins first.'}</p></div>
      <ul className="rows">{todo.slice(0, 12).map((i) => (
        <li key={i.id} className="row" style={{ gridTemplateColumns: '56px 1fr auto' }}>
          <span className="pts">+{i.points - i.earned}</span>
          <span className="title">{i.text}</span>
          <button className="btn small" onClick={() => {
            const p = state.properties.find((x) => x.id === i.propertyId);
            if (i.levelUp && p) setForm({ p, to: i.levelUp === 'gold' && !hasSilver(p) ? 'silver' : i.levelUp });
            else { onClose(); nav(i.to); }
          }}>Do it</button>
        </li>
      ))}</ul>
      {form && <LevelUpForm property={form.p} to={form.to} onClose={() => setForm(null)} />}
    </Drawer>
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
