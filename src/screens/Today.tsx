import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePhase, useStore } from '../data/store';
import { enabled } from '../data/phases';
import { addDays, daysBetween, fmtDate, fmtPeriod, fmtWeekday, periodOf } from '../lib/dates';
import { activeLease, leaseLedger, picture, verdict, worthIt } from '../lib/finance';
import { fmt0 } from '../lib/money';
import { trayItems } from '../lib/tray';
import { DoorPlate, RentRoll } from '../components/domain';
import { Empty, Figure } from '../components/ui';
import { Icon } from '../components/Icon';
import { BenchmarkRuler } from './Money';

// Today: answers "Am I okay?" in under five seconds (PRD §2, §12).

export function Today({ onPay, onCapture }: { onPay: () => void; onCapture: () => void }) {
  const { state, today } = useStore();
  const phase = usePhase();
  const p = periodOf(today);
  const monthStart = `${p}-01`;
  const lastStart = `${periodOf(addDays(monthStart, -1))}-01`;
  const lastSameDay = addDays(lastStart, daysBetween(monthStart, today));
  const now = useMemo(() => picture(state, monthStart, today, { phase }), [state, monthStart, today, phase]);
  const prev = useMemo(() => picture(state, lastStart, lastSameDay, { phase }), [state, lastStart, lastSameDay, phase]);
  const tray = useMemo(() => trayItems(state, today), [state, today]);
  const units = state.units.filter((u) => state.properties.some((x) => x.id === u.propertyId && !x.archived));

  if (!state.properties.length) {
    return (
      <div className="page">
        <div className="page-head"><div><div className="eyebrow">{fmtWeekday(today)} · {fmtDate(today)}</div><h1>Welcome{state.profile.name ? `, ${state.profile.name.split(' ')[0]}` : ''}.</h1></div></div>
        <div className="sheet">
          <h2 style={{ marginBottom: 12 }}>Three things to set up</h2>
          <ol className="rows" style={{ counterReset: 'n' }}>
            <li className="row"><span className="margin">1</span><span className="title">Add the property</span><Link className="btn primary" to="/rent">Add property</Link></li>
            <li className="row"><span className="margin">2</span><span className="title soft">Add the tenant</span><span /></li>
            <li className="row"><span className="margin">3</span><span className="title soft">Choose how rent reaches the app</span><Link className="btn" to="/money/bank">Choose</Link></li>
          </ol>
        </div>
      </div>
    );
  }

  // Rent status this month
  const lines = units.flatMap((u) => {
    const l = activeLease(state, u.id, today);
    if (!l) return [];
    const line = leaseLedger(l, state.payments, today).find((x) => x.period === p);
    const t = state.tenants.find((x) => x.id === l.tenantId)!;
    return line ? [{ line, lease: l, tenant: t, unit: u }] : [];
  });
  const due = lines.filter((x) => x.line.due <= today);
  const paid = due.filter((x) => x.line.state === 'paid');
  const late = due.filter((x) => x.line.state === 'late' || x.line.state === 'partial');
  const biggestOut = state.expenses.filter((e) => e.date >= monthStart && e.date <= today && e.scope !== 'personal').sort((a, b) => b.amount - a.amount)[0];
  const delta = now.kept - prev.kept;

  // The Pulse sentence, generated from the numbers.
  let s1: React.ReactNode;
  if (!due.length) s1 = <>Rent isn't due yet this month.</>;
  else if (!late.length) s1 = <>{paid.length === 1 ? 'Rent is in.' : paid.length === 2 ? <>Both units <em>paid</em>.</> : <>All {paid.length} units <em>paid</em>.</>}</>;
  else {
    const l = late[0];
    s1 = <>{paid.length ? `${paid.length} of ${due.length} paid. ` : ''}<span className="bad">{l.tenant.names[0].split(' ')[0]}'s rent is {l.line.daysLate} day{l.line.daysLate === 1 ? '' : 's'} late</span>{late.length > 1 ? `, and ${late.length - 1} more` : ''}.</>;
  }
  const s2 = Math.abs(delta) >= 5000 ? <> You're {fmt0(Math.abs(delta))} {delta > 0 ? 'ahead of' : 'behind'} last month{biggestOut && biggestOut.amount > 20000 ? <>, and the {biggestOut.vendor.toLowerCase().includes('heat') ? 'furnace' : biggestOut.vendor} is the only thing that hurt</> : ''}.</> : biggestOut && biggestOut.amount > 20000 ? <> The biggest cost so far is {biggestOut.vendor} at {fmt0(biggestOut.amount)}.</> : null;

  // 14-day strip
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const events = (d: string) => {
    const out: { text: string; cls: string }[] = [];
    for (const x of lines) {
      for (let k = 0; k < 2; k++) {
        const per = periodOf(addDays(`${p}-01`, 32 * k));
        const dueD = `${per}-${String(x.lease.dueDay).padStart(2, '0')}`;
        if (dueD === d) out.push({ text: `Rent ${x.unit.label}`, cls: 'rent' });
      }
    }
    if (enabled('mortgage-alerts', phase)) for (const m of state.mortgages) if (m.termEnd === d) out.push({ text: 'Renewal', cls: 'late' });
    for (const x of late) if (d === today) out.push({ text: `${x.unit.label} late`, cls: 'late' });
    return out;
  };

  const renewals = enabled('mortgage-alerts', phase) ? state.mortgages.filter((m) => { const n = daysBetween(today, m.termEnd); return n >= 0 && n <= 120; }) : [];

  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">{fmtWeekday(today)} · {fmtDate(today)} · {fmtPeriod(p)}</div></div></div>
      <p className="pulse">{s1}{s2}</p>

      <div className="figures" style={{ marginBottom: 8 }}>
        <div><div className="label">This month in</div><Figure cents={now.rentCollected} className="in" /></div>
        <div><div className="label">This month out</div><Figure cents={now.opex + now.capital + now.mortgageInterest + now.mortgagePrincipal} /></div>
        <div><div className="label">Kept</div><Figure cents={now.kept} className={now.kept < 0 ? 'urgent' : ''} /></div>
      </div>
      <p className="small soft">
        {now.rentCollected > 0 && now.kept < 0 ? <>Costs have run ahead of rent so far this month. </> : now.rentCollected > 0 ? <>You keep <strong className="mono">{fmt0(Math.max(0, now.keptPer1000) * 100)}</strong> of every $1,000 of rent so far this month{phase < 3 && !now.hasMortgageData ? ' (before mortgage)' : ''}. </> : null}
        <Link to="/money/picture">See the math</Link>
      </p>

      <div className="strip14" aria-label="Next 14 days">
        {days.map((d) => (
          <div key={d} className={d === today ? 'today' : ''}>
            <div className="d">{d === today ? 'Today' : `${fmtWeekday(d)[0]} ${Number(d.slice(8))}`}</div>
            {events(d).map((e, i) => <div key={i} className={`ev ${e.cls}`}>{e.text}</div>)}
          </div>
        ))}
      </div>

      <div className="split" style={{ marginTop: 32 }}>
        <div>
          {renewals.map((m) => (
            <div key={m.id} className="callout brass">
              <strong>Mortgage renewal in {daysBetween(today, m.termEnd)} days</strong> — {m.lender}, {state.properties.find((x) => x.id === m.propertyId)?.nickname}. Start comparing rates now. <Link to={`/rent/property/${m.propertyId}/mortgage`}>Open mortgage</Link>
            </div>
          ))}
          <section className="section">
            <h2 className="section-title">Needs a decision <Link to="/tray" className="small">Open tray ({tray.length})</Link></h2>
            {tray.length === 0 ? (
              <div className="sheet"><Empty title="Nothing waiting on you.">Receipts, reminders and bank matches will land here when they need a tap.</Empty></div>
            ) : (
              <div className="tray">
                {tray.slice(0, 3).map((t) => (
                  <Link key={t.id} to="/tray" className={`slip ${t.kind === 'reminder' ? 'urgent' : t.kind === 'match' ? 'info' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div>
                      <div className="what">{t.kind === 'message' ? `Receipt ready for ${state.tenants.find((x) => x.id === t.message.tenantId)?.names[0]}` : t.kind === 'reminder' ? `${state.tenants.find((x) => x.id === t.lease.tenantId)?.names[0]} is ${t.line.daysLate} days late` : t.kind === 'match' ? `Deposit from ${t.txn.payer}` : `Withdrawal: ${t.txn.payer}`}</div>
                      <div className="why">{t.kind === 'message' ? 'Approve and send' : t.kind === 'reminder' ? `${t.tone[0].toUpperCase()}${t.tone.slice(1)} reminder drafted` : t.kind === 'match' ? (t.suggestion ? 'Suggested match — confirm it' : 'No match found') : 'Is this a rental expense?'}</div>
                    </div>
                    <Icon name="next" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h2 className="section-title">Doors <Link to="/rent" className="small">All units</Link></h2>
            <div className="plates">{units.map((u) => <DoorPlate key={u.id} unit={u} />)}</div>
          </section>

          {enabled('rent-roll', phase) && (
            <section className="section">
              <h2 className="section-title">Rent roll · last 12 months</h2>
              <div className="sheet"><RentRoll /></div>
            </section>
          )}
        </div>

        <aside>
          <div className="sheet">
            <h2 style={{ marginBottom: 12 }}>Quick actions</h2>
            <div className="stack">
              <button className="btn primary" style={{ width: '100%' }} onClick={onPay}><Icon name="check" size={18} />Confirm rent received</button>
              <button className="btn" style={{ width: '100%' }} onClick={onCapture}><Icon name="camera" size={18} />Snap a receipt</button>
              <Link className="btn" style={{ width: '100%' }} to="/money/bank"><Icon name="bank" size={18} />{state.bank ? `${state.bank.bank} feed` : 'Connect your bank'}</Link>
            </div>
          </div>
          {enabled('worth-it', phase) ? <WorthItCard /> : (
            <div className="sheet">
              <h2 style={{ marginBottom: 8 }}>Is it worth it?</h2>
              <p className="small soft">Over the last 12 months you kept <strong className="mono">{fmt0(picture(state, addDays(today, -365), today, { phase }).kept)}</strong> after expenses. Property values and the full Worth-It reading arrive in phase 2.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function WorthItCard() {
  const { state, today } = useStore();
  const phase = usePhase();
  const w = useMemo(() => worthIt(state, today, { phase }), [state, today, phase]);
  return (
    <div className="sheet">
      <div className="spread" style={{ marginBottom: 8 }}><h2>The Worth-It reading</h2><span className="pill">Last 12 months</span></div>
      <p className="serif" style={{ fontSize: 'var(--t-20)', lineHeight: 1.3 }}>{verdict(w)}</p>
      {w.returnPct !== null && <BenchmarkRuler value={w.returnPct} unit="%" compact />}
      {w.appreciationEstimated && <p className="tiny soft">Appreciation is estimated from local price data.</p>}
      <Link to="/money/worth-it" className="small">See the breakdown →</Link>
    </div>
  );
}
