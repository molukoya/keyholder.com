import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Mortgage, Property } from '../data/types';
import { useStore } from '../data/store';
import { levelInfo, nextStep, propertyLevel, type Level } from '../lib/levels';
import { keyholderScore } from '../lib/score';
import { portfolio } from '../lib/finance';
import { monthChange } from '../lib/silver';
import { RETURN_PRESETS } from '../lib/jurisdiction';
import { fmtShort } from '../lib/money';
import { Drawer, Field, MoneyInput, Seg } from './ui';
import { MortgageFields, newMortgage } from './forms';

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

// Remember each card's last stage across renders so an upgrade can play its glow once.
const seenStage = new Map<string, Level>();

// ---------- The living property card: its metal shows the property's stage ----------
export function PropertyCard({ property, active, banner }: { property: Property; active?: boolean; banner?: boolean }) {
  const { state, today } = useStore();
  const nav = useNavigate();
  const level = propertyLevel(state, property);
  const row = useMemo(() => portfolio(state, today).rows.find((r) => r.property.id === property.id), [state, today, property.id]);
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
    const k = banner ? 0.35 : 1;
    ref.current.style.setProperty('--ry', `${(x - 0.5) * 12 * k}deg`);
    ref.current.style.setProperty('--rx', `${(0.5 - y) * 10 * k}deg`);
    ref.current.style.setProperty('--mx', `${x * 100}%`);
    ref.current.style.setProperty('--my', `${y * 100}%`);
  };
  const onLeave = () => { ref.current?.style.setProperty('--rx', '0deg'); ref.current?.style.setProperty('--ry', '0deg'); };
  if (!row) return null;
  const rough = row.valueInfo.basis === 'rent';
  const month = monthChange(state, property, today);

  return (
    <div ref={ref} className={`pcard ${level}${active ? ' active' : ''}${upgraded ? ' upgraded' : ''}${banner ? ' banner' : ''}`}
      onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="pcard-light" aria-hidden />
      <button className="pcard-name" onClick={() => !banner && nav(`/rent/property/${property.id}`)} tabIndex={banner ? -1 : 0}>
        <span className="pcard-stage">{levelInfo(level).name}</span>
        <span className="pcard-title">{property.nickname}</span>
        <span className="pcard-addr">{property.address}, {property.city}</span>
      </button>
      <div className="pcard-figs">
        <div><span>Worth about</span><strong>{rough ? '~' : ''}{fmtShort(row.value)}</strong></div>
        <div><span>Yours</span><strong>{row.owedKnown ? fmtShort(row.yours) : '—'}</strong></div>
        <div><span>Return a year</span><strong>{row.returnPct === null ? '—' : `${row.returnPct.toFixed(1)}%`}</strong>{row.returnPct !== null && <em className="vs-gic">GIC {RETURN_PRESETS.typical}%</em>}</div>
      </div>
      <div className="pcard-source">{month !== null && level !== 'bronze' ? <><strong>{month >= 0 ? '+' : '−'}{fmtShort(Math.abs(month))} this month</strong> · </> : null}{row.valueInfo.source}</div>
    </div>
  );
}

// ---------- Keyholder score chip: the only score in the app. Opens To do. ----------
export function ScoreChip() {
  const { state, today } = useStore();
  const nav = useNavigate();
  const { score, todo } = useMemo(() => keyholderScore(state, today), [state, today]);
  const shown = useCountUp(score);
  const prev = useRef(score);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (score > prev.current) { setBump(true); const t = setTimeout(() => setBump(false), 1200); prev.current = score; return () => clearTimeout(t); }
    prev.current = score;
  }, [score]);
  const next = todo[0];
  return (
    <button data-tour="score" className={`score-chip${bump ? ' bump' : ''}`} onClick={() => { if (location.hash.includes('/today')) document.getElementById('score')?.scrollIntoView({ behavior: 'smooth' }); else nav('/today'); }} aria-label={`Setup progress ${score} percent. See what is left.`}>
      <ScoreRing score={shown} />
      <span className="score-label">Setup progress</span>
      {next && <span className="score-next">+{next.points - next.earned} next</span>}
    </button>
  );
}

export function ScoreRing({ score, big }: { score: number; big?: boolean }) {
  return <span className={`score-ring${big ? ' big' : ''}`} style={{ ['--p' as string]: `${score}` }}><span>{score}</span></span>;
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

// ---------- A locked tab, shown as an invitation ----------
export function LevelInvite({ property, to, title, points }: { property: Property; to: Level; title: string; points: string[] }) {
  const [open, setOpen] = useState(false);
  const step = nextStep(useStore().state, property);
  return (
    <div className="sheet invite">
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
  const [m, setM] = useState<Mortgage>(() => existing ?? newMortgage(property.id, today, property.approxMortgageBalance ?? 0));
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
      {has === 'yes' && <MortgageFields m={m} onChange={setM} isNew={!existing} />}
    </Drawer>
  );
}
