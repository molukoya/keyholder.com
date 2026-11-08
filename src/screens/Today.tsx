import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { fmtDate, fmtDay, fmtWeekday, periodOf } from '../lib/dates';
import { activeLease, leaseLedger } from '../lib/finance';
import { ScoreChip } from '../components/levels';
import { RentRows, ScoreList } from '../components/Journey';
import { trayItems } from '../lib/tray';
import { PaymentForm } from '../components/forms';
import { BankStatus } from '../components/domain';
import type { Lease, Tenant, Unit } from '../data/types';
import type { LedgerLine } from '../lib/finance';

// Today answers one question: "Am I okay?" — who has paid, what is left over, and what needs me.

export function Today() {
  const { state, today } = useStore();
  const [payLease, setPayLease] = useState<string | null>(null);
  const p = periodOf(today);
  const todo = useMemo(() => trayItems(state, today), [state, today]);
  const pending = new Set(todo.flatMap((t) => (t.kind === 'match' && t.suggestion ? [t.suggestion.leaseId] : [])));
  const units = state.units.filter((u) => state.properties.some((x) => x.id === u.propertyId && !x.archived));

  if (!state.properties.length || !state.tenants.length) {
    // Start here: three steps with a progress bar, for people starting with their own data.
    const steps = [
      { done: state.properties.length > 0, title: 'Add your property', sub: 'The address and how many units.', to: '/rentals', btn: 'Add property' },
      { done: state.tenants.length > 0, title: 'Add your tenant', sub: 'Their name, rent and the day it is due.', to: state.properties[0] ? `/rent/property/${state.properties[0].id}` : '/rentals', btn: 'Add tenant' },
      { done: state.banks.some((b) => b.status === 'connected') || state.profile.rentArrival === 'manual', title: 'Choose how rent is tracked', sub: 'Connect your banks, or tap "Mark paid" yourself.', to: '/settings#rent-tracking', btn: 'Choose' },
    ];
    const n = steps.filter((x) => x.done).length;
    const next = steps.findIndex((x) => !x.done);
    return (
      <div className="page">
        <h1 style={{ marginBottom: 8 }}>Welcome{state.profile.name ? `, ${state.profile.name.split(' ')[0]}` : ''}.</h1>
        <p className="page-sub">Three steps and Keyholder starts tracking your rent for you.</p>
        <div className="sheet start-here">
          <div className="start-head"><h2>Start here</h2><span className="small soft">{n} of 3 done</span></div>
          <div className="start-bar" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={n}><i style={{ width: `${(n / 3) * 100}%` }} /></div>
          <ol className="start-steps">{steps.map((x, i) => (
            <li key={x.title} className={x.done ? 'done' : i === next ? 'now' : ''}>
              <span className="start-n">{x.done ? '✓' : i + 1}</span>
              <span><strong>{x.title}</strong><span className="small soft">{x.sub}</span></span>
              {!x.done && <Link className={`btn${i === next ? ' primary' : ''}`} to={x.to}>{x.btn}</Link>}
            </li>
          ))}</ol>
          <p className="small soft">Want to look around first? <Link to="/welcome">See what Keyholder does</Link></p>
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

      <RentRows />
      <ScoreList />

      {payLease && <PaymentForm leaseId={payLease} onClose={() => setPayLease(null)} />}
    </div>
  );

}

function firstName(r: { tenant?: { names: string[] } }) { return r.tenant?.names[0].split(' ')[0] ?? 'A tenant'; }


