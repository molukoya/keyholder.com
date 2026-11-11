import { PageSub } from '../components/Guide';
import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import type { BankName, BankTxn, Expense, ExpenseCategory, Property } from '../data/types';
import { bankToSort, readWithdrawal } from '../lib/bankrules';
import { useStore } from '../data/store';
import { propertyLevel } from '../lib/levels';
import { addDays, addPeriods, fmtDate, fmtMonthShort, periodOf } from '../lib/dates';
import { picture, recordsStart, rentalPortion, taxPack } from '../lib/finance';
import { BANK_CHECK_HOURS, CATEGORIES, OTHER_BANKS, POPULAR_BANKS, RETURN_PRESETS, category, type Band } from '../lib/jurisdiction';
import { banksOn } from '../data/api';
import { fmt, fmt0 } from '../lib/money';
import { ExpenseForm, MortgageForm } from '../components/forms';
import { Drawer, Empty, Field, Figure, Seg, Term, embedded } from '../components/ui';
import { Icon } from '../components/Icon';
import { CategoryIcon, SceneReceipts } from '../components/Art';

export function Money() {
  const { tab = 'expenses' } = useParams();
  const tabs = [{ id: 'expenses', label: 'Expenses' }, { id: 'cash-flow', label: 'Cash flow' }];
  const cur = tab === 'summary' || tab === 'picture' ? 'cash-flow' : tab;
  return (
    <div className="page">
      <div className="page-head"><h1>Money</h1></div>
      <nav className="tabs" aria-label="Money sections">
        {tabs.map((t) => <NavLink key={t.id} to={`/money/${t.id}`} className={cur === t.id ? 'active' : ''}>{t.label}</NavLink>)}
      </nav>
      {cur === 'cash-flow' ? <ThePicture /> : <Expenses />}
    </div>
  );
}

/** Taxes: its own tab. */
/** Expenses (its own page in the menu): every bill and receipt, and "Add an expense" with the camera. */
export function ExpensesPage() {
  const [adding, setAdding] = useState(false);
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="title-ic"><span className="tile-ic peach" aria-hidden><Icon name="receipt" size={22} /></span>Expenses</h1><PageSub>Bills and receipts, sorted for tax time</PageSub></div>
        <button className="btn primary add-expense" data-tour="add-expense" onClick={() => setAdding(true)}><Icon name="camera" size={18} />Add an expense</button></div>
      <Expenses />
      {adding && <ExpenseForm onClose={() => setAdding(false)} />}
    </div>
  );
}

// =====================================================================================
/** Withdrawals from connected banks, waiting to be sorted: expense (which property, which type) or mortgage. */
export function BankReview() {
  const { state, act, today } = useStore();
  const list = bankToSort(state);
  const [setup, setSetup] = useState<{ pid: string; txn: BankTxn } | null>(null);
  if (!list.length) return null;
  const props = state.properties.filter((p) => !p.archived);
  return (
    <section className="section" id="bank">
      <h2 className="section-title">From your banks · {list.length} to sort</h2>
      <div className="sheet tight"><ul className="unit-list">{list.map((t) => {
        const r = readWithdrawal(state, t);
        const bank = state.banks.find((b) => b.id === t.bankId)?.bank;
        return <BankRow key={t.id} t={t} r={r} bank={bank} props={props} onSetup={(pid) => setSetup({ pid, txn: t })} onFile={(pid, cat) => act.fileBankExpense(t.id, pid, cat, true)} onMortgage={(mid) => act.reconcileMortgage(t.id, mid)} onIgnore={() => act.ignoreTxn(t.id)} />;
      })}</ul></div>
      <p className="tiny soft" style={{ marginTop: 8 }}>Once you file a vendor, its future payments file themselves. Checked {today}.</p>
      {setup && <MortgageForm propertyId={setup.pid} prefill={{ lender: state.banks.find((b) => b.id === setup.txn.bankId)?.bank ?? setup.txn.payer.split(' ')[0], paymentOverride: -setup.txn.amount, frequency: 'monthly' }} onClose={() => setSetup(null)} />}
    </section>
  );
}

function BankRow({ t, r, bank, props, onFile, onMortgage, onSetup, onIgnore }: { t: BankTxn; r: ReturnType<typeof readWithdrawal>; bank?: string; props: Property[]; onFile: (pid: string, cat: ExpenseCategory) => void; onMortgage: (mid: string) => void; onSetup: (pid: string) => void; onIgnore: () => void }) {
  const [pid, setPid] = useState(r.propertyId ?? props[0]?.id ?? '');
  const [cat, setCat] = useState<ExpenseCategory>(r.category ?? 'other');
  const name = props.find((p) => p.id === r.propertyId)?.nickname;
  return (
    <li className="unit-row bank-row">
      <span className="unit-label long">{bank ?? 'Bank'}</span>
      <span className="unit-who"><strong>{fmt(-t.amount)} to {t.payer}</strong><span>{fmtDate(t.date)} · {r.kind === 'mortgage' ? (r.mortgageId ? `${r.why} (${name})` : r.why) : r.why}</span></span>
      {r.kind === 'expense' ? (
        <span className="bank-choose">
          <select className="input" aria-label="Property" value={pid} onChange={(e) => setPid(e.target.value)}>{props.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}</select>
          <select className="input" aria-label="Type" value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory)}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        </span>
      ) : <span />}
      <span className="row-act">
        {r.kind === 'expense' && <button className="btn primary" disabled={!pid} onClick={() => onFile(pid, cat)}>Add expense</button>}
        {r.kind === 'mortgage' && r.mortgageId && <button className="btn primary" onClick={() => onMortgage(r.mortgageId!)}>{r.matchesSchedule ? 'Tick off' : 'Tick off anyway'}</button>}
        {r.kind === 'mortgage' && !r.mortgageId && <button className="btn primary" disabled={!r.propertyId && !pid} onClick={() => onSetup(r.propertyId ?? pid)}>Set up mortgage</button>}
        <button className="btn ghost" onClick={onIgnore}>Not rental</button>
      </span>
    </li>
  );
}

export function Expenses() {
  const { state } = useStore();
  const [form, setForm] = useState<Expense | 'new' | null>(null);
  const [prop, setProp] = useState('all');
  const [kind, setKind] = useState<'all' | 'current' | 'capital'>('all');
  const list = state.expenses.filter((e) => (prop === 'all' || e.propertyId === prop) && (kind === 'all' || e.kind === kind));
  const total = list.reduce((a, e) => a + rentalPortion(e, state.properties.find((p) => p.id === e.propertyId)?.rentalSharePct ?? 100), 0);
  const months = new Map<string, Expense[]>();
  for (const e of list) { const k = periodOf(e.date); months.set(k, [...(months.get(k) ?? []), e]); }

  return (
    <>
      <BankReview />
      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="btn-row">
          <select className="input" style={{ width: 'auto' }} value={prop} onChange={(e) => setProp(e.target.value)} aria-label="Property filter">
            <option value="all">All properties</option>
            {state.properties.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
          {<Seg label="Kind" value={kind} onChange={setKind} options={[{ id: 'all', label: 'All' }, { id: 'current', label: 'Running costs' }, { id: 'capital', label: 'Improvements' }]} />}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="sheet"><Empty title="No receipts yet this month." art={<SceneReceipts />} action={<button className="btn primary" onClick={() => setForm('new')}><Icon name="camera" size={16} />Add an expense</button>}>Take a photo of a receipt: Keyholder reads it and fills in the details.</Empty></div>
      ) : (
        <>
          <p className="small soft">{list.length} entries · <strong className="mono">{fmt(total)}</strong> counted toward the rental{state.properties.some((p) => p.rentalSharePct < 100) ? ' (after rental-share split)' : ''}</p>
          {[...months.entries()].map(([m, es]) => (
            <section className="section" key={m}>
              <h2 className="section-title">{fmtMonthShort(m)} {m.slice(0, 4)} <span className="mono">{fmt(es.reduce((a, e) => a + e.amount, 0))}</span></h2>
              <div className="sheet tight table-scroll"><table className="ledger">
                <tbody>{es.map((e) => {
                  const p = state.properties.find((x) => x.id === e.propertyId);
                  const portion = rentalPortion(e, p?.rentalSharePct ?? 100);
                  return (
                    <tr key={e.id} className="click" onClick={() => setForm(e)} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setForm(e)}>
                      <td className="date">{fmtDate(e.date)}</td>
                      <td style={{ width: 48 }}>{e.receiptImage ? <img src={e.receiptImage} alt="" className="thumb" /> : e.cashNoReceipt ? <span className="tiny soft" title="Paid in cash, no receipt: this entry is the record">cash</span> : <span className="tiny faint" title="No receipt photo">no photo</span>}</td>
                      <td><span className="exp-cell"><CategoryIcon id={e.category} /><span><strong>{e.vendor || 'Unknown vendor'}</strong><span className="tiny soft" style={{ display: 'block' }}>{category(e.category).label} · {p?.nickname}{e.unitId ? ` · Unit ${state.units.find((u) => u.id === e.unitId)?.label}` : ''}{e.note ? ` · ${e.note}` : ''}</span></span></span></td>
                      <td>{e.kind === 'capital' && <span className="pill" style={{ borderColor: 'var(--brass)', color: 'var(--brass)' }}>Improvement</span>}{e.scope === 'personal' && <span className="pill">Personal</span>}</td>
                      <td className="num">{fmt(e.amount)}{portion !== e.amount && <div className="tiny soft">{fmt(portion)} rental</div>}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            </section>
          ))}
        </>
      )}
      {form && <ExpenseForm expense={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
    </>
  );
}

// =====================================================================================
// How rent is tracked: two choices only — mark it yourself, or connect a bank that is checked every 4 hours.
// =====================================================================================
/** How rent is tracked (shown in Settings). */
export function RentTracking() {
  const { state, act } = useStore();
  const [connect, setConnect] = useState(false);
  const banks = state.banks ?? [];
  const deposits = state.txns.filter((t) => t.amount > 0 && t.status !== 'ignored').slice(0, 20);
  const manual = banks.length === 0;
  const soon = !banksOn();

  return (
    <>
      <p className="lead">How do we know rent arrived?</p>
      <div className="choices two" role="radiogroup" aria-label="How rent is tracked">
        <button role="radio" aria-checked={manual} className="choice big" onClick={() => !manual && act.useManualTracking()}>
          <Icon name="check" size={28} />
          <span className="t">I'll mark it myself</span>
          <span className="s">Tap "Mark paid" when rent comes in.</span>
        </button>
        <button role="radio" aria-checked={!manual} className={`choice big${soon ? ' soon' : ''}`} disabled={soon} onClick={() => manual && setConnect(true)}>
          <Icon name="bank" size={28} />
          <span className="t">Check my banks for me{soon && <span className="soon-tag">Coming soon</span>}</span>
          <span className="s">{soon ? 'Keyholder will spot rent, bills and mortgage payments in your bank. Until then, tap "Mark paid" when rent comes in.' : `Any Canadian banks or credit unions. Rent, bills and mortgage payments, every ${BANK_CHECK_HOURS} hours.`}</span>
        </button>
      </div>

      {!manual && (
        <div className="sheet" style={{ marginTop: 24 }}>
          <div className="spread" style={{ marginBottom: 8 }}><h3>Connected banks</h3><button className="btn small" onClick={() => setConnect(true)}><Icon name="plus" size={14} />Add another bank</button></div>
          <ul className="rows">{banks.map((b) => (
            <li key={b.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span><span className="title">{b.bank} {b.accountMask}</span><span className="sub" style={{ display: 'block' }}>{b.status === 'connected' ? `Last checked ${new Date(b.lastSync).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Needs you to sign in again'}</span></span>
              <span className="row-act">
                {b.status === 'needs-reauth' && <button className="btn small primary" onClick={() => act.reauthBank(b.id)}>Sign in</button>}
                <button className="btn small ghost" onClick={() => act.disconnectBank(b.id)}>Disconnect</button>
              </span>
            </li>
          ))}</ul>
          <div className="btn-row" style={{ marginTop: 8 }}><button className="btn" onClick={() => act.syncBank()}><Icon name="sync" size={16} />Check all now</button></div>
          <p className="small soft" style={{ marginTop: 12 }}>View only. Keyholder sees deposits and payments, and can never move money.</p>
        </div>
      )}

      {!manual && (
        <section className="section" style={{ marginTop: 24 }}>
          <h2 className="section-title">Rent found in your banks</h2>
          {deposits.length === 0 ? <div className="sheet"><Empty title="No rent found yet.">The next check is automatic.</Empty></div> : (
            <div className="sheet"><ul className="rows">{deposits.map((t) => {
              const pay = state.payments.find((p) => p.id === t.paymentId);
              const lease = state.leases.find((l) => l.id === pay?.leaseId);
              const ten = state.tenants.find((x) => x.id === lease?.tenantId);
              return (
                <li key={t.id} className="row">
                  <span className="margin">{fmtDate(t.date)}</span>
                  <span><span className="title">{fmt(t.amount)} from {t.payer}</span>
                    <span className="sub" style={{ display: 'block' }}>{t.status === 'matched' ? `Marked as ${ten?.names[0]}'s rent` : 'Needs you to confirm'}</span></span>
                  {t.status === 'matched'
                    ? <button className="btn small ghost" onClick={() => pay && act.voidPayment(pay.id)}>Undo</button>
                    : <Link className="btn small primary" to="/today">Confirm</Link>}
                </li>
              );
            })}</ul></div>
          )}
        </section>
      )}
      {connect && <ConnectBank onClose={() => setConnect(false)} />}
    </>
  );
}

function ConnectBank({ onClose }: { onClose: () => void }) {
  const { act } = useStore();
  const [bank, setBank] = useState<BankName | null>(null);
  const [q, setQ] = useState('');
  const [working, setWorking] = useState(false);
  const matches = q.trim() ? [...POPULAR_BANKS, ...OTHER_BANKS].filter((b) => b.toLowerCase().includes(q.trim().toLowerCase())) : [];
  if (working) return <Drawer title="Connecting" onClose={onClose}><Empty title={`Connecting to ${bank}…`}>This takes a few seconds.</Empty></Drawer>;
  return (
    <Drawer title="Which bank gets your rent?" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!bank} onClick={() => { setWorking(true); setTimeout(() => { act.connectBank(bank!); onClose(); }, 900); }}>{bank ? `Connect ${bank}` : 'Choose a bank'}</button></>}>
      <div className="choices">{POPULAR_BANKS.map((b) => <button key={b} className="choice" aria-pressed={bank === b} onClick={() => setBank(b)}><span className="t">{b}</span></button>)}</div>
      <Field label="Somewhere else?" htmlFor="cb-q"><input id="cb-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type your bank or credit union" /></Field>
      {matches.length > 0 && <div className="choices">{matches.slice(0, 6).map((b) => <button key={b} className="choice" aria-pressed={bank === b} onClick={() => setBank(b)}><span className="t">{b}</span></button>)}</div>}
      <div className="callout pine" style={{ marginTop: 16 }}>You sign in on your bank's page. We never see your password or move money.</div>
      <p className="tiny soft">Preview only: no real bank is contacted.</p>
    </Drawer>
  );
}

// =====================================================================================
// The picture — "See the math" (PRD 7.10)
// =====================================================================================
export function ThePicture() {
  const { state, today } = useStore();
  const [range, setRange] = useState<'month' | 'ytd' | 't12'>('t12');
  const [prop, setProp] = useState<string>('all');
  const from = range === 'month' ? `${periodOf(today)}-01` : range === 'ytd' ? `${today.slice(0, 4)}-01-01` : addDays(today, -364);
  const pic = useMemo(() => picture(state, from, today, { propertyId: prop === 'all' ? undefined : prop }), [state, from, today, prop]);
  const months = Array.from({ length: 12 }, (_, i) => addPeriods(periodOf(today), i - 11));
  const monthly = months.map((m) => {
    const end = m === periodOf(today) ? today : addDays(`${addPeriods(m, 1)}-01`, -1);
    return { m, p: picture(state, `${m}-01`, end, { propertyId: prop === 'all' ? undefined : prop }) };
  });
  const max = Math.max(1, ...monthly.map((x) => Math.max(x.p.rentCollected, x.p.opex + x.p.capital + x.p.mortgageInterest + x.p.mortgagePrincipal)));

  const row = (label: React.ReactNode, v: number, opts: { strong?: boolean; neg?: boolean; note?: string } = {}) => (
    <tr><td>{opts.strong ? <strong>{label}</strong> : label}{opts.note && <div className="tiny soft">{opts.note}</div>}</td><td className="num">{opts.neg && v ? '−' : ''}{opts.strong ? <strong>{fmt(Math.abs(v))}</strong> : fmt(Math.abs(v))}</td></tr>
  );

  return (
    <>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        <Seg label="Range" value={range} onChange={setRange} options={[{ id: 'month', label: 'This month' }, { id: 'ytd', label: 'Year to date' }, { id: 't12', label: 'Last 12 months' }]} />
        <select className="input" style={{ width: 'auto' }} value={prop} onChange={(e) => setProp(e.target.value)} aria-label="Property">
          <option value="all">Whole portfolio</option>
          {state.properties.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
        </select>
      </div>
      <div className="figures four" style={{ marginBottom: 24 }}>
        <div><div className="label">Money in</div><Figure cents={pic.rentCollected} size="sm" className="in" /></div>
        <div><div className="label">Money out</div><Figure cents={pic.opex + pic.capital + pic.mortgageInterest + pic.mortgagePrincipal} size="sm" /></div>
        <div><div className="label">Left over</div><Figure cents={pic.kept} size="sm" className={pic.kept < 0 ? 'urgent' : ''} /></div>
        <div><div className="label">Left from each $1,000 of rent</div><span className="figure sm">{fmt0(Math.max(0, pic.keptPer1000) * 100)}</span></div>
      </div>
      <div className="split">
        <div className="sheet">
          <h2 style={{ marginBottom: 12 }}>Month by month</h2>
          <div className="bars" role="img" aria-label="Monthly rent in and money out, last 12 months">
            {monthly.map(({ m, p }) => {
              const out = p.opex + p.capital + p.mortgageInterest + p.mortgagePrincipal;
              return (
                <div key={m} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, alignItems: 'end', height: '100%' }} title={`${m}: in ${fmt(p.rentCollected)}, out ${fmt(out)}, kept ${fmt(p.kept)}`}>
                  <div className="bar" style={{ height: `${(p.rentCollected / max) * 100}%` }} />
                  <div className="bar out" style={{ height: `${(out / max) * 100}%` }} />
                </div>
              );
            })}
          </div>
          <div className="bar-labels">{monthly.map(({ m }) => <span key={m}>{fmtMonthShort(m)[0]}</span>)}</div>
          <div className="legend"><span><i style={{ background: 'var(--pine)' }} />Rent in</span><span><i style={{ background: 'var(--ink-soft)' }} />Money out</span></div>
          <details style={{ marginTop: 16 }}><summary className="small">Show as a table</summary>
            <table className="ledger"><thead><tr><th>Month</th><th className="num">In</th><th className="num">Out</th><th className="num">Kept</th></tr></thead>
              <tbody>{monthly.map(({ m, p }) => <tr key={m}><td>{fmtMonthShort(m)} {m.slice(0, 4)}</td><td className="num">{fmt(p.rentCollected)}</td><td className="num">{fmt(p.opex + p.capital + p.mortgageInterest + p.mortgagePrincipal)}</td><td className="num">{fmt(p.kept)}</td></tr>)}</tbody></table>
          </details>
        </div>
        <div className="sheet">
          <h2 style={{ marginBottom: 8 }}>How it adds up</h2>
          <table className="ledger"><tbody>
            {row('Rent collected', pic.rentCollected)}
            {pic.arrearsLoss > 0 && row('Rent still owing', pic.arrearsLoss, { note: 'Not counted above until it arrives' })}
            {pic.vacancyLoss > 0 && row('Lost to vacancy', pic.vacancyLoss)}
            {row('Running costs', pic.opex, { neg: true, note: 'Repairs, utilities, property tax, insurance' })}
            {row('Left before the mortgage', pic.noi, { strong: true })}
            {pic.hasMortgageData && !pic.mortgageIsRough && row('Mortgage interest', pic.mortgageInterest, { neg: true, note: 'Deductible' })}
            {pic.hasMortgageData && !pic.mortgageIsRough && row('Mortgage paid off', pic.mortgagePrincipal, { neg: true, note: 'This builds what you own' })}
            {pic.mortgageIsRough && row('Mortgage payments (rough)', pic.mortgageInterest + pic.mortgagePrincipal, { neg: true })}
            {pic.capital > 0 && row('Upgrades', pic.capital, { neg: true })}
            {row('Left over', pic.kept, { strong: true })}
          </tbody></table>
          <ul className="plain-facts">
            {pic.rentCollected > 0 && <li>Running costs take <strong>{pic.expenseRatio.toFixed(0)}%</strong> of the rent.</li>}
            {pic.hasMortgageData && !pic.mortgageIsRough && pic.mortgageInterest + pic.mortgagePrincipal > 0 && <li>Rent covers the mortgage <strong>{(pic.noi / (pic.mortgageInterest + pic.mortgagePrincipal)).toFixed(1)} times</strong>. Banks like to see 1.2 or more.</li>}
          </ul>
          {!pic.hasMortgageData && <p className="tiny soft" style={{ marginTop: 12 }}>No mortgage yet. Add it on the property's Mortgage tab.</p>}
        </div>
      </div>
    </>
  );
}

// =====================================================================================
// Phase 2 — Worth-It reading and the Benchmark Guide
// =====================================================================================
export function BenchmarkRuler({ value, band, unit = '%', compact, labels, higherIsBetter = true, title }: {
  value: number; band?: Band; unit?: string; compact?: boolean; labels?: [string, string, string]; higherIsBetter?: boolean; title?: string;
}) {
  const b = band ?? RETURN_PRESETS;
  const lbl = labels ?? (band ? ['Low', 'Typical', 'High'] : RETURN_PRESETS.labels);
  const lo = Math.min(b.low, value) - Math.abs(b.high - b.low) * 0.4;
  const hi = Math.max(b.high, value) + Math.abs(b.high - b.low) * 0.4;
  const x = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  const good = higherIsBetter ? value >= b.typical : value <= b.typical;
  const gapL = Math.min(value, b.typical), gapR = Math.max(value, b.typical);
  return (
    <div className="ruler" aria-label={`${title ?? 'Measure'}: ${value.toFixed(1)}${unit}; low ${b.low}, typical ${b.typical}, high ${b.high}`}>
      {title && <div className="ruler-head"><strong>{title}</strong><span className="mono">{value.toFixed(1)}{unit}</span></div>}
      <div className="ruler-track">
        <div className="line" />
        <div className="band" style={{ left: x(b.low), width: `calc(${x(b.high)} - ${x(b.low)})` }} />
        <div className={`gap ${good ? '' : 'below'}`} style={{ left: x(gapL), width: `calc(${x(gapR)} - ${x(gapL)})` }} />
        {[b.low, b.typical, b.high].map((v, i) => <div key={i} className="tick" style={{ left: x(v) }}>{!compact && <span>{lbl[i]} {v}{unit}</span>}{compact && i === 1 && <span>{lbl[1]} {v}{unit}</span>}</div>)}
        <div className={`dot ${good ? '' : 'below'}`} style={{ left: x(value) }} />
      </div>
    </div>
  );
}

// =====================================================================================
// Regular costs landlords often forget, many of them paid in cash. One tap adds one, marked
// "paid in cash, no receipt" (the entry is the record), except driving, which needs a trip log.
const REGULAR: { label: string; cat: ExpenseCategory; how: string; cash: boolean }[] = [
  { label: 'Snow removal', cat: 'repairs', how: 'Each visit, or the season', cash: true },
  { label: 'Lawn care and yard work', cat: 'repairs', how: 'Mowing, leaves, weeding', cash: true },
  { label: 'Cleaning between tenants', cat: 'repairs', how: 'Move-out clean', cash: true },
  { label: 'Small repairs and handyman', cat: 'repairs', how: 'Fixed like for like', cash: true },
  { label: 'Pest control', cat: 'repairs', how: 'Visits and traps', cash: true },
  { label: 'Garbage and junk removal', cat: 'repairs', how: 'Dump runs, bulky pickup', cash: true },
  { label: 'Keys and lock changes', cat: 'repairs', how: 'New keys for a new tenant', cash: true },
  { label: 'Smoke alarm batteries and filters', cat: 'supplies', how: 'Batteries, furnace filters, bulbs', cash: true },
  { label: 'Stamps and printing', cat: 'office', how: 'Notices and letters', cash: true },
  { label: 'Driving to the property', cat: 'vehicle', how: 'Keep a trip log: date, km, why', cash: false },
];

function RegularCosts({ prop, year }: { prop: Property; year: number }) {
  const { state, today } = useStore();
  const [add, setAdd] = useState<(typeof REGULAR)[number] | null>(null);
  const [all, setAll] = useState(false);
  const mine = state.expenses.filter((e) => e.propertyId === prop.id && e.date.startsWith(String(year)));
  return (
    <section className="sheet regular-costs" aria-labelledby="rc-title">
      <h2 id="rc-title" style={{ marginBottom: 4 }}>Regular costs you may be missing</h2>
      <p className="small soft" style={{ marginTop: 0 }}>Paid someone in cash? It still counts if you keep a record. Tap one to add it.</p>
      <ul className="rc-list">{REGULAR.slice(0, all ? REGULAR.length : 6).map((r) => {
        const n = mine.filter((e) => e.category === r.cat && e.vendor.toLowerCase().startsWith(r.label.toLowerCase())).length;
        return (
          <li key={r.label}><button className="rc-item" onClick={() => setAdd(r)}>
            <CategoryIcon id={r.cat} />
            <span><strong>{r.label}</strong><span className="tiny soft">{r.how}</span></span>
            <span className={`rc-n${n ? ' done' : ''}`}>{n ? <><Icon name="check" size={14} />{n}</> : <Icon name="plus" size={16} />}</span>
          </button></li>
        );
      })}</ul>
      {!all && <button className="btn ghost small" onClick={() => setAll(true)}>Show {REGULAR.length - 6} more</button>}
      <p className="tiny soft" style={{ marginBottom: 0 }}>For each one, keep the date, who you paid, what for and how much: Keyholder saves that as your record. A short signed note from the person you paid is best. Not sure if something counts? Ask your accountant.</p>
      {add && <ExpenseForm onClose={() => setAdd(null)} prefill={{ propertyId: prop.id, vendor: add.label, category: add.cat, scope: category(add.cat).sharedByDefault ? 'shared' : 'direct', ...(add.cash ? { cashNoReceipt: true } : {}), ...(String(year) < today.slice(0, 4) ? { date: `${year}-12-31` } : {}) }} />}
    </section>
  );
}

// =====================================================================================
// Phase 3 — Tax Pack (T776)
// =====================================================================================
export function TaxPackPage() {
  const { state, today } = useStore();
  const props = state.properties.filter((p) => !p.archived);
  const [pid, setPid] = useState(props[0]?.id ?? '');
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(Number(today.slice(5, 7)) <= 4 ? thisYear - 1 : thisYear);
  const p = props.find((x) => x.id === pid);
  // Started part way through the year? The spreadsheet covers from the first day with records (changeable).
  const [fromPick, setFromPick] = useState('');
  const yearStart = `${year}-01-01`, yearEnd = `${year}-12-31`;
  const started = p ? recordsStart(state, p, year) : yearStart;
  const from = fromPick && fromPick.startsWith(String(year)) ? fromPick : started;
  // Only worth a note when records start more than a month into the year.
  const partYear = from >= `${year}-02-01`;
  const until = year === thisYear ? today : yearEnd;
  const pack = useMemo(() => (p ? taxPack(state, p, year, from) : null), [state, p, year, from]);
  if (!p || !pack) return <div className="sheet"><Empty title="Add a property to build a Tax Pack." /></div>;
  const fixes = pack.preflight.filter((x) => x.severity === 'fix').length;

  const exportCsv = () => {
    const units = new Set(state.units.filter((u) => u.propertyId === p.id).map((u) => u.id));
    const leases = state.leases.filter((l) => units.has(l.unitId));
    const rows: string[][] = [
      ['Keyholder tax spreadsheet', p.nickname],
      ['Covers', `${from} to ${until}`],
    ];
    if (partYear) rows.push(['Note', `Records in Keyholder start on ${from}. Rent and costs before that date are not included.`]);
    rows.push([], ['Line', 'Description', 'Amount']);
    rows.push(['8141', 'Gross rents', (pack.grossRents / 100).toFixed(2)]);
    for (const l of pack.lines) rows.push([l.t776, l.craLabel, (l.amount / 100).toFixed(2)]);
    rows.push(['9936', 'Capital cost allowance', (pack.ccaClaimed / 100).toFixed(2)]);
    rows.push(['', 'Net income', (pack.netIncome / 100).toFixed(2)]);
    rows.push([], ['Rent received'], ['Date', 'Tenant', 'For', 'Amount']);
    for (const pay of state.payments.filter((x) => !x.voided && leases.some((l) => l.id === x.leaseId) && x.date >= from && x.date <= yearEnd).sort((a, b) => a.date.localeCompare(b.date))) {
      const t = state.tenants.find((x) => x.id === leases.find((l) => l.id === pay.leaseId)?.tenantId);
      rows.push([pay.date, t?.names.join(' & ') ?? '', pay.period, (pay.amount / 100).toFixed(2)]);
    }
    rows.push([], ['Costs'], ['Date', 'Paid to', 'Category', 'T776 line', 'Kind', 'Amount', 'Rental portion', 'Record']);
    for (const e of state.expenses.filter((x) => x.propertyId === p.id && x.date >= from && x.date <= yearEnd).sort((a, b) => a.date.localeCompare(b.date))) {
      const c = category(e.category);
      rows.push([e.date, e.vendor, c.label, c.t776, e.kind, (e.amount / 100).toFixed(2), (rentalPortion(e, p.rentalSharePct) / 100).toFixed(2),
        e.receiptImage ? 'Receipt photo' : e.cashNoReceipt ? 'Paid in cash, no receipt (this entry is the record)' : 'No receipt yet']);
    }
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `keyholder-tax-${p.nickname.replace(/\W+/g, '-')}-${from}-to-${until}.csv`; a.click();
  };

  const fixList = pack.preflight;
  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="btn-row">
          {props.length > 1 && <select className="input" style={{ width: 'auto' }} value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Property">{props.map((x) => <option key={x.id} value={x.id}>{x.nickname}</option>)}</select>}
          <Seg label="Tax year" value={year} onChange={setYear} options={[{ id: thisYear - 1, label: String(thisYear - 1) }, { id: thisYear, label: `${thisYear} so far` }]} />
        </div>
        <div className="btn-row tax-tools">
          <label className="tax-from" htmlFor="tax-from">From<input id="tax-from" type="date" className="input" value={from} min={yearStart} max={yearEnd} onChange={(e) => setFromPick(e.target.value)} /></label>
          <button className="btn" onClick={exportCsv} disabled={embedded} title={embedded ? 'Downloads work on the Keyholder website' : undefined}><Icon name="download" size={16} />Spreadsheet</button>
          {!embedded && <button className="btn primary" onClick={() => window.print()}><Icon name="print" size={16} />Print for accountant</button>}
        </div>
      </div>
      {partYear && (
        <div className="callout tax-start" role="note">
          <Icon name="calendar" size={18} />
          <p><strong>Started part way through the year? That's fine.</strong> Your spreadsheet starts on {fmtDate(from)}{year === thisYear ? '' : ` and ends ${fmtDate(until)}`}, the day your records start. Costs from before then count too: add them any time with their real date{fromPick ? '' : ', and the start moves back'}.</p>
        </div>
      )}

      <div className="sheet">
        <h2 style={{ marginBottom: 8 }}>{fixes ? `${fixes} thing${fixes > 1 ? 's' : ''} to fix` : fixList.length ? 'Almost ready' : 'Ready for your accountant'}</h2>
        {fixList.length === 0 ? <p className="soft" style={{ margin: 0 }}>Nothing missing.</p> : (
          <ul className="rows">{fixList.map((x) => (
            <li key={x.id} className="row" style={{ gridTemplateColumns: '32px 1fr' }}>
              <span className={x.severity === 'fix' ? 'urgent' : 'soft'}><Icon name={x.severity === 'fix' ? 'alert' : 'info'} size={20} /></span>
              <span>{x.text}</span>
            </li>
          ))}</ul>
        )}
        {fixes > 0 && <Link to="/expenses" className="btn" style={{ marginTop: 12 }}>Go to expenses</Link>}
      </div>

      <RegularCosts prop={p} year={year} />

      <div className="sheet print-me">
        <h2 style={{ marginBottom: 4 }}>{year} rental income · {p.nickname}</h2>
        {partYear && <p className="small" style={{ margin: '0 0 4px' }}>From {fmtDate(from)} (when your records start)</p>}
        <p className="small soft" style={{ marginTop: 0 }}>Line numbers match CRA form T776.</p>
        <table className="ledger tax-totals">
          <tbody>
            <tr><td>Rent received</td><td className="line">8141</td><td className="num">{fmt(pack.grossRents)}</td></tr>
            <tr><td>Expenses</td><td className="line" /><td className="num">−{fmt(pack.totalExpenses)}</td></tr>
            {propertyLevel(state, p) === 'gold' && <tr><td><Term def="Capital Cost Allowance: a yearly deduction for wear on the building and appliances">Depreciation (CCA)</Term>{!p.claimCCA && <span className="tiny soft"> · not claimed</span>}</td><td className="line">9936</td><td className="num">−{fmt(pack.ccaClaimed)}</td></tr>}
          </tbody>
          <tfoot><tr><td>Taxable rental income{p.ownershipPct < 100 && <span className="tiny soft"> · your {p.ownershipPct}%: {fmt(pack.ownerShare)}</span>}</td><td className="line" /><td className={`num ${pack.netIncome < 0 ? 'urgent' : ''}`}>{fmt(pack.netIncome)}</td></tr></tfoot>
        </table>

        <details className="more" open={false}>
          <summary>Expenses by type</summary>
          <div className="more-body">
            <table className="ledger tax-totals"><tbody>
              {pack.lines.map((l) => <tr key={l.t776}><td>{l.label}</td><td className="line">{l.t776}</td><td className="num">{fmt(l.amount)}</td></tr>)}
            </tbody></table>
            {p.rentalSharePct < 100 && <p className="tiny soft">Shared costs counted at {p.rentalSharePct}%, the part you rent out.</p>}
          </div>
        </details>

        {pack.cca.length > 0 && propertyLevel(state, p) === 'gold' && (
          <details className="more">
            <summary>Depreciation details</summary>
            <div className="more-body table-scroll">
              <table className="ledger">
                <thead><tr><th>Class</th><th className="num">Start of year</th><th className="num">Added</th><th className="num">Rate</th><th className="num">Claimed</th><th className="num">End of year</th></tr></thead>
                <tbody>{pack.cca.map((r) => <tr key={r.cls}><td>{r.label}</td><td className="num">{fmt(r.opening)}</td><td className="num">{fmt(r.additions)}</td><td className="num">{r.ratePct}%</td><td className="num">{fmt(r.claimed)}</td><td className="num">{fmt(r.closing)}</td></tr>)}</tbody>
              </table>
              <p className="tiny soft">Half rate in the year you buy. It can't create a loss, and some may be paid back when you sell.</p>
            </div>
          </details>
        )}
        {propertyLevel(state, p) !== 'gold' && <p className="small" style={{ marginTop: 16 }}><strong>Missing mortgage interest and depreciation.</strong> <Link to={`/rent/property/${p.id}/mortgage`}>Reach Gold for {p.nickname}</Link> to include them. They usually lower your tax.</p>}
        <p className="tiny soft" style={{ marginTop: 16 }}>We prepare the numbers. We don't file returns or give tax advice.</p>
      </div>
    </>
  );
}
