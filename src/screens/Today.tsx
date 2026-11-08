import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { fmtDate, fmtDay, fmtPeriod, fmtWeekday, periodOf } from '../lib/dates';
import { activeLease, leaseLedger } from '../lib/finance';
import { fmt } from '../lib/money';
import { ScoreChip } from '../components/levels';
import { NeedsYouNow, ScoreNext } from '../components/Journey';
import { trayItems } from '../lib/tray';
import { PaymentForm } from '../components/forms';
import { BankStatus } from '../components/domain';
import type { Lease, Tenant, Unit } from '../data/types';
import type { LedgerLine } from '../lib/finance';
import { Icon } from '../components/Icon';

// Today answers one question: "Am I okay?" — who has paid, what is left over, and what needs me.

export function Today() {
  const { state, today } = useStore();
  const [payLease, setPayLease] = useState<string | null>(null);
  const p = periodOf(today);
  const todo = useMemo(() => trayItems(state, today), [state, today]);
  const pending = new Set(todo.flatMap((t) => (t.kind === 'match' && t.suggestion ? [t.suggestion.leaseId] : [])));
  const units = state.units.filter((u) => state.properties.some((x) => x.id === u.propertyId && !x.archived));

  if (!state.properties.length) {
    return (
      <div className="page">
        <h1 style={{ marginBottom: 24 }}>Welcome{state.profile.name ? `, ${state.profile.name.split(' ')[0]}` : ''}.</h1>
        <div className="sheet">
          <h2 style={{ marginBottom: 12 }}>Let's get you set up</h2>
          <ul className="rows">
            <li className="row"><span className="margin">Step 1</span><span className="title">Add your property</span><Link className="btn primary" to="/rentals">Add</Link></li>
            <li className="row"><span className="margin">Step 2</span><span className="title soft">Add your tenant</span><span /></li>
            <li className="row"><span className="margin">Step 3</span><span className="title soft">Choose how rent is tracked</span><Link className="btn" to="/settings#rent-tracking">Choose</Link></li>
          </ul>
        </div>
      </div>
    );
  }

  type Row = { unit: Unit; vacant: true } | { unit: Unit; vacant: false; line: LedgerLine; lease: Lease; tenant: Tenant };
  const rows: Row[] = units.flatMap((u): Row[] => {
    const l = activeLease(state, u.id, today);
    if (!l) return [{ unit: u, vacant: true }];
    const line = leaseLedger(l, state.payments, today).find((x) => x.period === p);
    const t = state.tenants.find((x) => x.id === l.tenantId)!;
    return line ? [{ unit: u, vacant: false, line, lease: l, tenant: t }] : [];
  });
  const occupied = rows.filter((r): r is Extract<Row, { vacant: false }> => !r.vacant);
  const paid = occupied.filter((r) => r.line.state === 'paid').length;
  const late = occupied.filter((r) => !pending.has(r.lease.id) && (r.line.state === 'late' || (r.line.state === 'partial' && r.line.daysLate > 0)));
  const notDue = occupied.length > 0 && occupied.every((r) => r.line.due > today);

  let headline: React.ReactNode;
  if (notDue) headline = <>Rent is due {fmtDay(occupied[0].line.due)}.</>;
  else if (!late.length && pending.size) headline = <>{paid} of {occupied.length} paid. Please confirm {pending.size === 1 ? 'one payment' : `${pending.size} payments`}.</>;
  else if (!late.length) headline = <><em>All rent is in.</em> You're all set.</>;
  else headline = <>{paid} of {occupied.length} paid. <span className="bad">{late.length === 1 ? `${firstName(late[0])} is late.` : `${late.length} tenants are late.`}</span></>;

  return (
    <div className="page">
      <h1 className="sr-only">Home</h1>
      <div className="today-top"><span className="eyebrow-line">{fmtWeekday(today)}, {fmtDate(today)}</span><ScoreChip /></div>
      <p className="pulse">{headline}</p>
      <div className="track-top"><BankStatus /></div>

      <section className="section">
        <h2 className="section-title">Rent for {fmtPeriod(p)}</h2>
        <div className="sheet tight">
          <ul className="rent-list">
            {rows.map((r) => r.vacant ? (
              <li key={r.unit.id} className="rent-row">
                <div><div className="who">Unit {r.unit.label}</div><div className="where">{propName(r.unit.propertyId)}</div></div>
                <span className="status vacant">Empty</span>
                <Link className="btn" to={`/rent/property/${r.unit.propertyId}/find`}>Find a tenant</Link>
              </li>
            ) : (
              pending.has(r.lease.id) && r.line.state !== 'paid' ? (
              <li key={r.unit.id} className="rent-row due">
                <Link to={`/rent/tenant/${r.tenant.id}`} className="who-link">
                  <div className="who">{r.tenant.names.join(' & ')}</div>
                  <div className="where">{propName(r.unit.propertyId)} · Unit {r.unit.label} · {fmt(r.line.charge)}</div>
                </Link>
                <span className="status due">Payment found</span>
                <Link className="btn primary" to="/today">Confirm</Link>
              </li>
              ) :
              <li key={r.unit.id} className={`rent-row ${r.line.state}`}>
                <Link to={`/rent/tenant/${r.tenant.id}`} className="who-link">
                  <div className="who">{r.tenant.names.join(' & ')}</div>
                  <div className="where">{propName(r.unit.propertyId)} · Unit {r.unit.label} · {fmt(r.line.charge)}</div>
                </Link>
                <span className={`status ${r.line.state}`}>
                  {r.line.state === 'paid' && <><Icon name="check" size={18} />Paid</>}
                  {r.line.state === 'late' && <>Late · {r.line.daysLate} day{r.line.daysLate === 1 ? '' : 's'}</>}
                  {r.line.state === 'partial' && <>{fmt(r.line.charge - r.line.paid)} still owed</>}
                  {r.line.state === 'due' && <>Due today</>}
                  {r.line.state === 'upcoming' && <>Due {fmtDay(r.line.due)}</>}
                </span>
                {r.line.state === 'paid'
                  ? <span className="paid-on">{fmtDay(r.line.payments[r.line.payments.length - 1].date)}</span>
                  : <button className="btn primary" onClick={() => setPayLease(r.lease.id)}>Mark paid</button>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <NeedsYouNow />
      <ScoreNext />

      {payLease && <PaymentForm leaseId={payLease} onClose={() => setPayLease(null)} />}
    </div>
  );

  function propName(id: string) { return state.properties.find((x) => x.id === id)?.nickname ?? ''; }
}

function firstName(r: { tenant?: { names: string[] } }) { return r.tenant?.names[0].split(' ')[0] ?? 'A tenant'; }


