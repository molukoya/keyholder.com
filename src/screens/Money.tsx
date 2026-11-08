import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import type { BankName, Expense } from '../data/types';
import { usePhase, useStore } from '../data/store';
import { enabled } from '../data/phases';
import { addDays, addPeriods, fmtDate, fmtMonthShort, fmtTime, periodOf } from '../lib/dates';
import { picture, rentalPortion, taxPack, verdict, worthIt } from '../lib/finance';
import { BANKS, CATEGORIES, RETURN_PRESETS, category, regionData, type Band } from '../lib/jurisdiction';
import { parseETransferEmail } from '../lib/matching';
import { fmt, fmt0, pct } from '../lib/money';
import { ExpenseForm } from '../components/forms';
import { Drawer, Empty, Figure, PhaseLocked, Seg, Term } from '../components/ui';
import { Icon } from '../components/Icon';

export function Money() {
  const { tab = 'expenses' } = useParams();
  const phase = usePhase();
  const tabs = [
    { id: 'expenses', label: 'Expenses' },
    { id: 'bank', label: 'Bank and e-Transfers' },
    { id: 'picture', label: 'The picture' },
    { id: 'worth-it', label: 'Worth it?', phase: 2 },
    { id: 'tax', label: 'Tax Pack', phase: 3 },
  ];
  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">Money</div><h1>{tabs.find((t) => t.id === tab)?.label ?? 'Money'}</h1></div></div>
      <nav className="tabs" aria-label="Money sections">
        {tabs.map((t) => <NavLink key={t.id} to={`/money/${t.id}`} className={tab === t.id ? 'active' : ''}>{t.label} {t.phase && phase < t.phase ? <span className="lock">P{t.phase}</span> : null}</NavLink>)}
      </nav>
      {tab === 'expenses' && <Expenses />}
      {tab === 'bank' && <Bank />}
      {tab === 'picture' && <ThePicture />}
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
// Bank and e-Transfer (two paths, same result)
// =====================================================================================
function Bank() {
  const { state, act } = useStore();
  const [connect, setConnect] = useState(false);
  const [email, setEmail] = useState(false);
  const [expenseFrom, setExpenseFrom] = useState<string | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const txns = state.txns.filter((t) => showIgnored || t.status !== 'ignored');
  const fromTxn = state.txns.find((t) => t.id === expenseFrom);

  return (
    <>
      <div className="grid2" style={{ gap: 16 }}>
        <div className="sheet">
          <div className="spread"><h2><Icon name="bank" /> Connect my bank</h2>{state.bank && <span className={`pill ${state.bank.status === 'connected' ? 'conf-high' : 'conf-low'}`}>{state.bank.status === 'connected' ? 'Connected' : 'Needs attention'}</span>}</div>
          {state.bank ? (
            <>
              <p className="small" style={{ marginTop: 8 }}><strong>{state.bank.bank}</strong> chequing {state.bank.accountMask} · read-only · last checked {fmtTime(state.bank.lastSync)}</p>
              {state.bank.status === 'needs-reauth' && <div className="callout warn">Your bank asks you to sign in again every 90 days. <button className="btn small" onClick={act.reauthBank}>Reconnect</button></div>}
              <div className="btn-row"><button className="btn primary" onClick={act.syncBank}><Icon name="sync" size={16} />Check for new deposits</button><button className="btn ghost" onClick={act.disconnectBank}>Disconnect</button></div>
            </>
          ) : (
            <><p className="small soft" style={{ marginTop: 8 }}>Read-only link for RBC, TD, BMO, Scotiabank or CIBC. Deposits match to rent automatically and withdrawals can become expenses.</p><button className="btn primary" onClick={() => setConnect(true)}>Connect a bank</button></>
          )}
        </div>
        <div className="sheet">
          <h2><Icon name="mail" /> Forward my e-Transfer emails</h2>
          <p className="small soft" style={{ marginTop: 8 }}>No bank access needed. Set a rule in your email to forward Interac deposit notices to your private address:</p>
          <p className="mono small" style={{ background: 'var(--paper-sunk)', padding: 8, wordBreak: 'break-all' }}>{state.profile.forwardingAddress}</p>
          <button className="btn" onClick={() => setEmail(true)}>Try it: paste an e-Transfer email</button>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Activity <label className="check small" style={{ textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} />Show ignored</label></h2>
        {txns.length === 0 ? <div className="sheet"><Empty title="Nothing has come in yet.">Connect a bank or forward an e-Transfer email to see deposits here.</Empty></div> : (
          <div className="sheet tight table-scroll"><table className="ledger">
            <thead><tr><th>Date</th><th>From / to</th><th>Source</th><th className="num">Amount</th><th>What happened</th></tr></thead>
            <tbody>{txns.map((t) => {
              const pay = state.payments.find((p) => p.id === t.paymentId);
              const lease = state.leases.find((l) => l.id === pay?.leaseId);
              const ten = state.tenants.find((x) => x.id === lease?.tenantId);
              return (
                <tr key={t.id}>
                  <td className="date">{fmtDate(t.date)}</td>
                  <td><strong>{t.payer}</strong>{t.memo && <div className="tiny soft">“{t.memo}”</div>}</td>
                  <td className="small soft">{t.source === 'bank' ? state.bank?.bank ?? 'Bank' : 'Email'}</td>
                  <td className={`num ${t.amount > 0 ? 'in' : ''}`}>{t.amount > 0 ? '+' : '−'}{fmt(Math.abs(t.amount))}</td>
                  <td className="small">
                    {t.status === 'matched' && <>Rent from {ten?.names[0]} · <button className="btn small ghost" onClick={() => pay && act.voidPayment(pay.id)}>Undo match</button></>}
                    {t.status === 'expense' && <>Filed as expense</>}
                    {t.status === 'ignored' && <>Ignored · <button className="btn small ghost" onClick={() => act.unignoreTxn(t.id)}>Restore</button></>}
                    {t.status === 'new' && t.amount > 0 && <Link to="/tray">Needs a look →</Link>}
                    {t.status === 'new' && t.amount < 0 && <span className="btn-row"><button className="btn small" onClick={() => setExpenseFrom(t.id)}>File as expense</button><button className="btn small ghost" onClick={() => act.ignoreTxn(t.id)}>Not rental</button></span>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>

      {connect && <ConnectBank onClose={() => setConnect(false)} />}
      {email && <PasteEmail onClose={() => setEmail(false)} />}
      {fromTxn && <ExpenseForm onClose={() => setExpenseFrom(null)} fromTxn={fromTxn.id} prefill={{ amount: Math.abs(fromTxn.amount), date: fromTxn.date, vendor: fromTxn.payer, category: /UTIL|HYDRO|ENBRIDGE|ALECTRA|WATER/i.test(fromTxn.payer) ? 'utilities' : 'repairs' }} />}
    </>
  );
}

function ConnectBank({ onClose }: { onClose: () => void }) {
  const { act } = useStore();
  const [bank, setBank] = useState<BankName | null>(null);
  const [step, setStep] = useState<'pick' | 'consent' | 'working'>('pick');
  return (
    <Drawer title="Connect a bank" onClose={onClose}>
      {step === 'pick' && (
        <>
          <p className="small soft">Choose your bank. You'll sign in on your bank's own page. Keyholder never sees your password.</p>
          <div className="choices">{BANKS.map((b) => <button key={b} className="choice" aria-pressed={bank === b} onClick={() => setBank(b)}><span className="t">{b}</span></button>)}</div>
          <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}><button className="btn primary" disabled={!bank} onClick={() => setStep('consent')}>Continue</button></div>
        </>
      )}
      {step === 'consent' && bank && (
        <>
          <div className="callout pine"><strong>Read-only access.</strong> Keyholder can see balances and transactions. It cannot move money, pay bills or change anything.</div>
          <ul className="small" style={{ lineHeight: 1.8 }}><li>Deposits are matched to rent by payer name, amount, date and message</li><li>Anything uncertain waits in your tray</li><li>Disconnect any time from this screen</li></ul>
          <p className="tiny soft">Stage 1 preview: this simulates the bank-data provider. No real connection is made.</p>
          <div className="btn-row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setStep('pick')}>Back</button><button className="btn primary" onClick={() => { setStep('working'); setTimeout(() => { act.connectBank(bank); onClose(); }, 900); }}>Sign in to {bank}</button></div>
        </>
      )}
      {step === 'working' && <Empty title={`Connecting to ${bank}…`}>Waiting for your bank to confirm.</Empty>}
    </Drawer>
  );
}

const SAMPLE_EMAIL = (name: string, amt: string) => `INTERAC e-Transfer: ${name.toUpperCase()} sent you money.

Hi,
${name.toUpperCase()} has sent you $${amt} (CAD) and the money has been automatically deposited into your bank account.
Message: rent
Reference Number: CA${Math.random().toString(36).slice(2, 10)}`;

function PasteEmail({ onClose }: { onClose: () => void }) {
  const { state, act, today } = useStore();
  const lease = state.leases.find((l) => !l.end && state.payments.filter((p) => p.leaseId === l.id && p.period === periodOf(today) && !p.voided).length === 0);
  const ten = state.tenants.find((t) => t.id === lease?.tenantId);
  const [text, setText] = useState(ten && lease ? SAMPLE_EMAIL(ten.names[0], (lease.rent / 100).toFixed(2)) : SAMPLE_EMAIL('Sam Okafor', '1,500.00'));
  const parsed = parseETransferEmail(text);
  return (
    <Drawer title="Forwarded e-Transfer email" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!parsed} onClick={() => { if (parsed) { act.receiveTransferEmail({ payer: parsed.payer, amount: parsed.amount, memo: parsed.memo, date: today }); onClose(); } }}>Process email</button></>}>
      <p className="small soft">This is what Keyholder receives when your forwarding rule runs. Edit it to test the matcher.</p>
      <textarea className="input mono" style={{ minHeight: 220, fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} aria-label="Email text" />
      <div className="sheet" style={{ marginTop: 16, padding: 16 }}>
        {parsed ? <div className="kv"><div>Payer</div><div>{parsed.payer}</div><div>Amount</div><div>{fmt(parsed.amount)}</div><div>Message</div><div>{parsed.memo || '—'}</div></div> : <p className="urgent small">This doesn't look like an Interac deposit notice.</p>}
      </div>
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
        <div><div className="label">In</div><Figure cents={pic.rentCollected} size="sm" className="in" /></div>
        <div><div className="label">Out</div><Figure cents={pic.opex + pic.capital + pic.mortgageInterest + pic.mortgagePrincipal} size="sm" /></div>
        <div><div className="label">Kept</div><Figure cents={pic.kept} size="sm" className={pic.kept < 0 ? 'urgent' : ''} /></div>
        <div><div className="label">Per $1,000 of rent</div><span className="figure sm">{fmt0(pic.keptPer1000 * 100)}</span></div>
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
          <h2 style={{ marginBottom: 8 }}>See the math</h2>
          <table className="ledger"><tbody>
            {row('Rent collected', pic.rentCollected)}
            {pic.arrearsLoss > 0 && row('Rent still owing', pic.arrearsLoss, { note: 'Not counted above until it arrives' })}
            {pic.vacancyLoss > 0 && row('Lost to vacancy', pic.vacancyLoss)}
            {row('Running costs', pic.opex, { neg: true, note: 'Repairs, utilities, tax, insurance — your rental share' })}
            {row(<Term def="Net operating income: rent minus running costs, before the mortgage">NOI</Term>, pic.noi, { strong: true })}
            {phase >= 3 && pic.hasMortgageData && row('Mortgage interest', pic.mortgageInterest, { neg: true, note: 'Deductible' })}
            {phase >= 3 && pic.hasMortgageData && row('Mortgage principal', pic.mortgagePrincipal, { neg: true, note: 'Savings in the house, not an expense' })}
            {phase === 2 && pic.hasMortgageData && row('Mortgage payments (approx.)', pic.mortgageInterest, { neg: true })}
            {pic.capital > 0 && row('Improvements', pic.capital, { neg: true, note: 'Capital spending' })}
            {row('Kept (cash flow)', pic.kept, { strong: true })}
          </tbody></table>
          <div className="kv" style={{ marginTop: 16 }}>
            <div><Term def="Running costs as a share of rent">Expense ratio</Term></div><div>{pct(pic.expenseRatio)}</div>
            <div><Term def="Share of the year the units must be rented to cover all costs">Break-even occupancy</Term></div><div>{pic.rentCollected ? pct(((pic.opex + pic.mortgageInterest + pic.mortgagePrincipal) / (pic.rentCollected + pic.arrearsLoss || 1)) * 100) : '—'}</div>
            {phase >= 3 && pic.hasMortgageData && <><div><Term def="Debt service coverage: NOI divided by mortgage payments. Lenders like 1.2 or more.">DSCR</Term></div><div>{(pic.noi / Math.max(1, pic.mortgageInterest + pic.mortgagePrincipal)).toFixed(2)}</div></>}
          </div>
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
  const p = state.properties.find((x) => x.id === prop) ?? state.properties[0];
  const region = p ? regionData(p.province, p.city) : null;
  const pic = picture(state, addDays(today, -364), today, { phase, propertyId: prop === 'all' ? undefined : prop });
  const units = state.units.filter((u) => prop === 'all' || u.propertyId === prop);
  const potential = units.reduce((a, u) => a + u.rent * 12, 0);
  const vacancy = potential ? ((pic.vacancyLoss + pic.arrearsLoss) / potential) * 100 : 0;
  const grossYield = w.value ? (pic.rentCollected / (w.value || 1)) * 100 : 0;

  return (
    <>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        <select className="input" style={{ width: 'auto' }} value={prop} onChange={(e) => setProp(e.target.value)} aria-label="Property">
          <option value="all">Whole portfolio</option>
          {state.properties.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.nickname}</option>)}
        </select>
      </div>
      <div className="sheet">
        <p className="pulse" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', marginBottom: 8 }}>{verdict(w)}</p>
        {w.returnPct !== null && <BenchmarkRuler value={w.returnPct} title="Return on your equity, last 12 months" />}
        {w.missing.length > 0 && <div className="callout warn">Missing {w.missing.join(', ')}. Add it on the property's Value tab.</div>}
      </div>
      <div className="split">
        <div className="sheet">
          <h2 style={{ marginBottom: 8 }}>How it adds up</h2>
          <table className="ledger"><tbody>
            <tr><td>Cash flow kept</td><td className="num">{fmt0(w.cashFlow)}</td></tr>
            <tr><td>Mortgage principal paid down{phase < 3 && <div className="tiny soft">Counted from phase 3, once the mortgage is recorded</div>}</td><td className="num">{fmt0(w.principalPaid)}</td></tr>
            <tr><td>Change in value{w.appreciationEstimated && <div className="tiny soft">Estimated from the 5-year local price trend</div>}</td><td className="num">{fmt0(w.appreciation)}</td></tr>
            <tr><td><strong>Total return</strong></td><td className="num"><strong>{fmt0(w.total)}</strong></td></tr>
            <tr><td>Your equity (rental share)<div className="tiny soft">Value {fmt0(w.value)} − mortgage {fmt0(w.debt)}</div></td><td className="num">{fmt0(w.equity)}</td></tr>
            <tr><td><strong>Return on equity</strong></td><td className="num"><strong>{w.returnPct === null ? '—' : pct(w.returnPct)}</strong></td></tr>
          </tbody></table>
          <p className="tiny soft" style={{ marginTop: 8 }}>For a home you live in, only the rented share of value, mortgage and costs is counted.</p>
        </div>
        {region && (
          <div className="sheet">
            <h2 style={{ marginBottom: 4 }}>Benchmark Guide</h2>
            <p className="tiny soft">{p.city}, {p.province}{region.fallback ? ' — national figures, no city data yet' : ''}. Placeholder figures for design; real bands come from CMHC, Statistics Canada and CREA in stage 2.</p>
            <BenchmarkRuler title="Vacancy and arrears" value={vacancy} band={region.vacancy} higherIsBetter={false} compact />
            <p className="tiny soft">Vacancy in your area is {region.vacancyDirection} from last year. {region.vacancy.source}, {region.vacancy.asOf}</p>
            <BenchmarkRuler title="Gross yield" value={grossYield} band={region.grossYield} compact />
            <BenchmarkRuler title="Expense ratio" value={pic.expenseRatio} band={region.expenseRatio} higherIsBetter={false} compact />
            <div className="kv"><div>Local price change, 1 / 5 / 10 yr</div><div>{pct(region.priceGrowth.y1)} / {pct(region.priceGrowth.y5)} / {pct(region.priceGrowth.y10)}</div></div>
          </div>
        )}
      </div>
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
    for (const l of pack.lines) rows.push([l.t776, l.label, (l.amount / 100).toFixed(2)]);
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

  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="btn-row">
          <select className="input" style={{ width: 'auto' }} value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Property">{props.map((x) => <option key={x.id} value={x.id}>{x.nickname}</option>)}</select>
          <Seg label="Tax year" value={year} onChange={setYear} options={[{ id: thisYear - 1, label: String(thisYear - 1) }, { id: thisYear, label: `${thisYear} so far` }]} />
        </div>
        <div className="btn-row"><button className="btn" onClick={exportCsv}><Icon name="download" size={16} />Spreadsheet</button><button className="btn primary" onClick={() => window.print()}><Icon name="print" size={16} />Summary PDF</button></div>
      </div>
      <div className="split">
        <div className="sheet print-me">
          <div className="spread"><h2>Form T776 summary — {year}</h2><span className="pill">{p.nickname}</span></div>
          <p className="tiny soft">Statement of Real Estate Rentals. {p.rentalSharePct < 100 ? `Shared costs at ${p.rentalSharePct}% rental share. ` : ''}Your ownership {p.ownershipPct}%.</p>
          <table className="ledger">
            <thead><tr><th>Line</th><th>Description</th><th className="num">Amount</th></tr></thead>
            <tbody>
              <tr><td className="date">8141</td><td><strong>Gross rents</strong></td><td className="num"><strong>{fmt(pack.grossRents)}</strong></td></tr>
              {pack.lines.map((l) => <tr key={l.t776}><td className="date">{l.t776}</td><td>{l.label}{l.count > 0 && <span className="tiny soft"> · {l.count} entr{l.count === 1 ? 'y' : 'ies'}</span>}</td><td className="num">{fmt(l.amount)}</td></tr>)}
              <tr><td /><td>Total expenses</td><td className="num">{fmt(pack.totalExpenses)}</td></tr>
              <tr><td /><td>Net income before CCA</td><td className="num">{fmt(pack.netBeforeCCA)}</td></tr>
              <tr><td className="date">9936</td><td>Capital cost allowance{!p.claimCCA && <span className="tiny soft"> · not claimed</span>}</td><td className="num">{fmt(pack.ccaClaimed)}</td></tr>
            </tbody>
            <tfoot><tr><td /><td>Net rental income {p.ownershipPct < 100 && `(your ${p.ownershipPct}%: ${fmt(pack.ownerShare)})`}</td><td className={`num ${pack.netIncome < 0 ? 'urgent' : ''}`}>{fmt(pack.netIncome)}</td></tr></tfoot>
          </table>
          {pack.cca.length > 0 && (
            <>
              <h3 style={{ margin: '24px 0 8px' }}>CCA schedule (Area A)</h3>
              <div className="table-scroll"><table className="ledger">
                <thead><tr><th>Class</th><th className="num">Opening UCC</th><th className="num">Additions</th><th className="num">Rate</th><th className="num">Claimed</th><th className="num">Closing UCC</th></tr></thead>
                <tbody>{pack.cca.map((r) => <tr key={r.cls}><td>{r.label}</td><td className="num">{fmt(r.opening)}</td><td className="num">{fmt(r.additions)}</td><td className="num">{r.ratePct}%</td><td className="num">{fmt(r.claimed)}</td><td className="num">{fmt(r.closing)}</td></tr>)}</tbody>
              </table></div>
              <p className="tiny soft">Half-year rule applied to additions. CCA is limited so it does not create a rental loss. Stage 1 assumes the maximum was claimed in earlier years.</p>
            </>
          )}
          <p className="tiny soft" style={{ marginTop: 16 }}>Keyholder prepares information. It does not file returns or give tax advice.</p>
        </div>
        <aside>
          <div className="sheet">
            <h2 style={{ marginBottom: 8 }}>{fixes ? `${fixes} thing${fixes > 1 ? 's' : ''} to fix before you're ready` : pack.preflight.length ? 'Ready, with a few checks' : "You're ready"}</h2>
            <ul className="rows">{pack.preflight.map((x) => (
              <li key={x.id} className="row" style={{ gridTemplateColumns: '28px 1fr' }}>
                <span className={x.severity === 'fix' ? 'urgent' : 'soft'}><Icon name={x.severity === 'fix' ? 'alert' : 'info'} size={18} /></span>
                <span className="small">{x.text}</span>
              </li>
            ))}</ul>
            {pack.preflight.length === 0 && <p className="small soft">Nothing missing. Export the pack for your accountant.</p>}
            <Link to="/money/expenses" className="small">Go to expenses →</Link>
          </div>
          <div className="sheet">
            <h2 style={{ marginBottom: 8 }}>Where the lines come from</h2>
            <p className="small soft">Each plain-word category maps to a T776 line:</p>
            <table className="ledger"><tbody>{CATEGORIES.slice(0, 8).map((c) => <tr key={c.id}><td className="small">{c.label}</td><td className="num tiny">{c.t776}</td></tr>)}</tbody></table>
          </div>
        </aside>
      </div>
    </>
  );
}


