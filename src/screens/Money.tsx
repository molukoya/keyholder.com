import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import type { BankName, Expense } from '../data/types';
import { usePhase, useStore } from '../data/store';
import { enabled } from '../data/phases';
import { addDays, addPeriods, fmtDate, fmtMonthShort, periodOf } from '../lib/dates';
import { picture, rentalPortion, taxPack, verdict, verdictTag, worthIt } from '../lib/finance';
import { BANK_CHECK_HOURS, OTHER_BANKS, POPULAR_BANKS, RETURN_PRESETS, category, regionData, type Band } from '../lib/jurisdiction';
import { fmt, fmt0, pct } from '../lib/money';
import { ExpenseForm } from '../components/forms';
import { Drawer, Empty, Field, Figure, PhaseLocked, Seg, Term, embedded } from '../components/ui';
import { BankStatus } from '../components/domain';
import { Icon } from '../components/Icon';

export function Money() {
  const { tab = 'expenses' } = useParams();
  const phase = usePhase();
  const tabs = [
    { id: 'expenses', label: 'Expenses', phase: 1 },
    { id: 'bank', label: 'Rent tracking', phase: 1 },
    { id: 'summary', label: 'Summary', phase: 1 },
    { id: 'worth-it', label: 'Worth it?', phase: 2 },
    { id: 'tax', label: 'Taxes', phase: 3 },
  ].filter((t) => t.phase <= phase);
  return (
    <div className="page">
      <div className="page-head"><div><h1>{tabs.find((t) => t.id === tab)?.label ?? 'Money'}</h1></div></div>
      <nav className="tabs" aria-label="Money sections">
        {tabs.map((t) => <NavLink key={t.id} to={`/money/${t.id}`} className={tab === t.id ? 'active' : ''}>{t.label}</NavLink>)}
      </nav>
      {tab === 'expenses' && <Expenses />}
      {tab === 'bank' && <Bank />}
      {(tab === 'summary' || tab === 'picture') && <ThePicture />}
      {tab === 'worth-it' && (enabled('worth-it', phase) ? <WorthItPage /> : <PhaseLocked phase={2} what="The Worth-It reading" />)}
      {tab === 'tax' && (enabled('tax-pack', phase) ? <TaxPackPage /> : <PhaseLocked phase={3} what="The Tax Pack" />)}
    </div>
  );
}

// =====================================================================================
function Expenses() {
  const { state } = useStore();
  const phase = usePhase();
  const [form, setForm] = useState<Expense | 'new' | null>(null);
  const [prop, setProp] = useState('all');
  const [kind, setKind] = useState<'all' | 'current' | 'capital'>('all');
  const list = state.expenses.filter((e) => (prop === 'all' || e.propertyId === prop) && (kind === 'all' || e.kind === kind));
  const total = list.reduce((a, e) => a + rentalPortion(e, state.properties.find((p) => p.id === e.propertyId)?.rentalSharePct ?? 100), 0);
  const months = new Map<string, Expense[]>();
  for (const e of list) { const k = periodOf(e.date); months.set(k, [...(months.get(k) ?? []), e]); }

  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="btn-row">
          <select className="input" style={{ width: 'auto' }} value={prop} onChange={(e) => setProp(e.target.value)} aria-label="Property filter">
            <option value="all">All properties</option>
            {state.properties.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
          {enabled('repair-or-improvement', phase) && <Seg label="Kind" value={kind} onChange={setKind} options={[{ id: 'all', label: 'All' }, { id: 'current', label: 'Running costs' }, { id: 'capital', label: 'Improvements' }]} />}
        </div>
        <button className="btn primary" onClick={() => setForm('new')}><Icon name="camera" size={16} />Snap a receipt</button>
      </div>
      {list.length === 0 ? (
        <div className="sheet"><Empty title="No receipts yet this month." action={<button className="btn primary" onClick={() => setForm('new')}>Snap the first one</button>}>Snap the next one when you get it.</Empty></div>
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
                      <td style={{ width: 48 }}>{e.receiptImage ? <img src={e.receiptImage} alt="" className="thumb" /> : <span className="tiny faint" title="No receipt photo">no photo</span>}</td>
                      <td><strong>{e.vendor || 'Unknown vendor'}</strong><div className="tiny soft">{category(e.category).label} · {p?.nickname}{e.unitId ? ` · Unit ${state.units.find((u) => u.id === e.unitId)?.label}` : ''}{e.note ? ` · ${e.note}` : ''}</div></td>
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
function Bank() {
  const { state, act } = useStore();
  const [connect, setConnect] = useState(false);
  const deposits = state.txns.filter((t) => t.amount > 0 && t.status !== 'ignored').slice(0, 20);
  const manual = !state.bank;

  return (
    <>
      <p className="lead">How should Keyholder know rent has arrived?</p>
      <div className="choices two" role="radiogroup" aria-label="How rent is tracked">
        <button role="radio" aria-checked={manual} className="choice big" onClick={() => !manual && act.useManualTracking()}>
          <Icon name="check" size={28} />
          <span className="t">I'll mark it myself</span>
          <span className="s">Tap "Mark paid" when rent comes in.</span>
        </button>
        <button role="radio" aria-checked={!manual} className="choice big" onClick={() => manual && setConnect(true)}>
          <Icon name="bank" size={28} />
          <span className="t">Check my bank for me</span>
          <span className="s">Any Canadian bank or credit union. Checked every {BANK_CHECK_HOURS} hours.</span>
        </button>
      </div>

      {state.bank && (
        <div className="sheet" style={{ marginTop: 24 }}>
          <BankStatus />
          {state.bank.status === 'needs-reauth' && <div className="callout warn">Your bank needs you to sign in again. <button className="btn small" onClick={act.reauthBank}>Sign in</button></div>}
          <p className="small soft" style={{ marginTop: 12 }}>View only. Keyholder can see deposits. It can never move money.</p>
        </div>
      )}

      {state.bank && (
        <section className="section" style={{ marginTop: 24 }}>
          <h2 className="section-title">Rent found in your bank</h2>
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
                    : <Link className="btn small primary" to="/todo">Confirm</Link>}
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
      <div className="callout pine" style={{ marginTop: 16 }}>You sign in on your bank's own page. Keyholder never sees your password and can never move money.</div>
      <p className="tiny soft">Preview only: no real bank is contacted.</p>
    </Drawer>
  );
}

// =====================================================================================
// The picture — "See the math" (PRD 7.10)
// =====================================================================================
function ThePicture() {
  const { state, today } = useStore();
  const phase = usePhase();
  const [range, setRange] = useState<'month' | 'ytd' | 't12'>('t12');
  const [prop, setProp] = useState<string>('all');
  const from = range === 'month' ? `${periodOf(today)}-01` : range === 'ytd' ? `${today.slice(0, 4)}-01-01` : addDays(today, -364);
  const pic = useMemo(() => picture(state, from, today, { phase, propertyId: prop === 'all' ? undefined : prop }), [state, from, today, phase, prop]);
  const months = Array.from({ length: 12 }, (_, i) => addPeriods(periodOf(today), i - 11));
  const monthly = months.map((m) => {
    const end = m === periodOf(today) ? today : addDays(`${addPeriods(m, 1)}-01`, -1);
    return { m, p: picture(state, `${m}-01`, end, { phase, propertyId: prop === 'all' ? undefined : prop }) };
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
            {phase >= 3 && pic.hasMortgageData && row('Mortgage interest', pic.mortgageInterest, { neg: true, note: 'Deductible' })}
            {phase >= 3 && pic.hasMortgageData && row('Mortgage paid off', pic.mortgagePrincipal, { neg: true, note: 'This builds what you own' })}
            {phase === 2 && pic.hasMortgageData && row('Mortgage payments (approx.)', pic.mortgageInterest, { neg: true })}
            {pic.capital > 0 && row('Upgrades', pic.capital, { neg: true })}
            {row('Left over', pic.kept, { strong: true })}
          </tbody></table>
          <ul className="plain-facts">
            {pic.rentCollected > 0 && <li>Running costs take <strong>{pic.expenseRatio.toFixed(0)}%</strong> of the rent.</li>}
            {phase >= 3 && pic.hasMortgageData && pic.mortgageInterest + pic.mortgagePrincipal > 0 && <li>Rent covers the mortgage <strong>{(pic.noi / (pic.mortgageInterest + pic.mortgagePrincipal)).toFixed(1)} times</strong>. Banks like to see 1.2 or more.</li>}
          </ul>
          {phase < 3 && <p className="tiny soft" style={{ marginTop: 12 }}>{phase === 1 ? 'Before mortgage. ' : ''}The full mortgage split into interest and principal arrives in phase 3.</p>}
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

function WorthItPage() {
  const { state, today } = useStore();
  const phase = usePhase();
  const [prop, setProp] = useState<string>('all');
  const w = useMemo(() => worthIt(state, today, { phase, propertyId: prop === 'all' ? undefined : prop }), [state, today, phase, prop]);
  const tag = verdictTag(w);
  const p = state.properties.find((x) => x.id === prop) ?? state.properties[0];
  const region = p ? regionData(p.province, p.city) : null;
  const pic = picture(state, addDays(today, -364), today, { phase, propertyId: prop === 'all' ? undefined : prop });
  const units = state.units.filter((u) => prop === 'all' || u.propertyId === prop);
  const potential = units.reduce((a, u) => a + u.rent * 12, 0);
  const vacancy = potential ? ((pic.vacancyLoss + pic.arrearsLoss) / potential) * 100 : 0;
  const grossYield = w.value ? (pic.rentCollected / (w.value || 1)) * 100 : 0;
  const props = state.properties.filter((x) => !x.archived);

  return (
    <>
      {props.length > 1 && (
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <select className="input" style={{ width: 'auto' }} value={prop} onChange={(e) => setProp(e.target.value)} aria-label="Property">
            <option value="all">All properties</option>
            {props.map((x) => <option key={x.id} value={x.id}>{x.nickname}</option>)}
          </select>
        </div>
      )}
      <div className="sheet">
        {tag && <span className={`status ${tag.tone === 'good' ? 'paid' : tag.tone === 'bad' ? 'late' : 'due'}`} style={{ marginBottom: 12 }}>{tag.text}</span>}
        <p className="pulse" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', margin: '0 0 8px' }}>{verdict(w)}</p>
        {w.returnPct !== null && <BenchmarkRuler value={w.returnPct} compact />}
        {w.missing.length > 0 && <div className="callout warn">Add what {w.missing.join(' and ').replace(/a value for /g, '')} is worth on its Value tab.</div>}
      </div>

      <details className="more">
        <summary>See how</summary>
        <div className="more-body">
          <table className="ledger"><tbody>
            <tr><td>Rent left over after costs</td><td className="num">{fmt0(w.cashFlow)}</td></tr>
            {phase >= 3 && <tr><td>Mortgage paid off</td><td className="num">{fmt0(w.principalPaid)}</td></tr>}
            <tr><td>Change in value{w.appreciationEstimated ? ' (estimated)' : ''}</td><td className="num">{fmt0(w.appreciation)}</td></tr>
            <tr><td><strong>Total gain this year</strong></td><td className="num"><strong>{fmt0(w.total)}</strong></td></tr>
            <tr><td>Your money in the property<div className="tiny soft">Worth {fmt0(w.value)}, less {fmt0(w.debt)} owed</div></td><td className="num">{fmt0(w.equity)}</td></tr>
            <tr><td><strong>Gain ÷ your money</strong></td><td className="num"><strong>{w.returnPct === null ? '—' : pct(w.returnPct)}</strong></td></tr>
          </tbody></table>
          {state.properties.some((x) => x.ownerOccupied) && <p className="tiny soft" style={{ marginTop: 8 }}>For a home you live in, only the rented part counts.</p>}
        </div>
      </details>

      {region && (
        <details className="more">
          <summary>Compare with {region.fallback ? 'Canada' : p.city}</summary>
          <div className="more-body">
            <BenchmarkRuler title="Empty or unpaid rent" value={vacancy} band={region.vacancy} higherIsBetter={false} compact />
            <BenchmarkRuler title="Yearly rent ÷ value" value={grossYield} band={region.grossYield} compact />
            <BenchmarkRuler title="Costs as a share of rent" value={pic.expenseRatio} band={region.expenseRatio} higherIsBetter={false} compact />
            <p className="tiny soft">Sample figures for now. Real local figures come from CMHC and CREA later.</p>
          </div>
        </details>
      )}
    </>
  );
}

// =====================================================================================
// Phase 3 — Tax Pack (T776)
// =====================================================================================
function TaxPackPage() {
  const { state, today } = useStore();
  const phase = usePhase();
  const props = state.properties.filter((p) => !p.archived);
  const [pid, setPid] = useState(props[0]?.id ?? '');
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(Number(today.slice(5, 7)) <= 4 ? thisYear - 1 : thisYear);
  const p = props.find((x) => x.id === pid);
  const pack = useMemo(() => (p ? taxPack(state, p, year, phase) : null), [state, p, year, phase]);
  if (!p || !pack) return <div className="sheet"><Empty title="Add a property to build a Tax Pack." /></div>;
  const fixes = pack.preflight.filter((x) => x.severity === 'fix').length;

  const exportCsv = () => {
    const rows = [['Line', 'Description', 'Amount']];
    rows.push(['8141', 'Gross rents', (pack.grossRents / 100).toFixed(2)]);
    for (const l of pack.lines) rows.push([l.t776, l.craLabel, (l.amount / 100).toFixed(2)]);
    rows.push(['9936', 'Capital cost allowance', (pack.ccaClaimed / 100).toFixed(2)]);
    rows.push(['', 'Net income', (pack.netIncome / 100).toFixed(2)]);
    rows.push([], ['Date', 'Vendor', 'Category', 'T776 line', 'Kind', 'Amount', 'Rental portion']);
    for (const e of state.expenses.filter((x) => x.propertyId === p.id && x.date.startsWith(String(year)))) {
      const c = category(e.category);
      rows.push([e.date, e.vendor, c.label, c.t776, e.kind, (e.amount / 100).toFixed(2), (rentalPortion(e, p.rentalSharePct) / 100).toFixed(2)]);
    }
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `keyholder-tax-pack-${p.nickname.replace(/\W+/g, '-')}-${year}.csv`; a.click();
  };

  const fixList = pack.preflight;
  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="btn-row">
          {props.length > 1 && <select className="input" style={{ width: 'auto' }} value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Property">{props.map((x) => <option key={x.id} value={x.id}>{x.nickname}</option>)}</select>}
          <Seg label="Tax year" value={year} onChange={setYear} options={[{ id: thisYear - 1, label: String(thisYear - 1) }, { id: thisYear, label: `${thisYear} so far` }]} />
        </div>
        {!embedded && <div className="btn-row"><button className="btn" onClick={exportCsv}><Icon name="download" size={16} />Spreadsheet</button><button className="btn primary" onClick={() => window.print()}><Icon name="print" size={16} />Print for accountant</button></div>}
      </div>

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
        {fixes > 0 && <Link to="/money/expenses" className="btn" style={{ marginTop: 12 }}>Go to expenses</Link>}
      </div>

      <div className="sheet print-me">
        <h2 style={{ marginBottom: 4 }}>{year} rental income · {p.nickname}</h2>
        <p className="small soft" style={{ marginTop: 0 }}>Line numbers are for your accountant (CRA form T776).</p>
        <table className="ledger tax-totals">
          <tbody>
            <tr><td>Rent received</td><td className="line">8141</td><td className="num">{fmt(pack.grossRents)}</td></tr>
            <tr><td>Expenses</td><td className="line" /><td className="num">−{fmt(pack.totalExpenses)}</td></tr>
            <tr><td><Term def="Capital Cost Allowance: a yearly deduction for wear on the building and appliances">Depreciation (CCA)</Term>{!p.claimCCA && <span className="tiny soft"> · not claimed</span>}</td><td className="line">9936</td><td className="num">−{fmt(pack.ccaClaimed)}</td></tr>
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

        {pack.cca.length > 0 && (
          <details className="more">
            <summary>Depreciation details</summary>
            <div className="more-body table-scroll">
              <table className="ledger">
                <thead><tr><th>Class</th><th className="num">Start of year</th><th className="num">Added</th><th className="num">Rate</th><th className="num">Claimed</th><th className="num">End of year</th></tr></thead>
                <tbody>{pack.cca.map((r) => <tr key={r.cls}><td>{r.label}</td><td className="num">{fmt(r.opening)}</td><td className="num">{fmt(r.additions)}</td><td className="num">{r.ratePct}%</td><td className="num">{fmt(r.claimed)}</td><td className="num">{fmt(r.closing)}</td></tr>)}</tbody>
              </table>
              <p className="tiny soft">Only half the rate applies in the year something is bought. Depreciation can't create a loss. Claiming it can mean paying some back when you sell.</p>
            </div>
          </details>
        )}
        <p className="tiny soft" style={{ marginTop: 16 }}>Keyholder prepares the numbers. It doesn't file your return or give tax advice.</p>
      </div>
    </>
  );
}
