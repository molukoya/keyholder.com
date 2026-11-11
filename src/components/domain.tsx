import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppState, Message, Receipt, Unit } from '../data/types';
import { currentLine, unitTenant, useStore } from '../data/store';
import { addPeriods, daysBetween, fmtDate, fmtMonthShort, fmtPeriod, periodOf } from '../lib/dates';
import { leaseLedger, type ChargeState } from '../lib/finance';
import { fmt, fmt0 } from '../lib/money';
import { messageBody } from '../lib/templates';
import { tenantEmails, toLine } from '../lib/people';
import { Icon } from './Icon';
import { Stamp, embedded } from './ui';
import { Link } from 'react-router-dom';
import { BANK_CHECK_HOURS } from '../lib/jurisdiction';

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? '' : 's'} ago`;
}

// ---------- How rent is tracked: one line that says it plainly ----------
export function BankStatus({ compact }: { compact?: boolean }) {
  const { state, act } = useStore();
  const banks = (state.banks ?? []).filter((x) => x.status === 'connected');
  const b = banks.map((x) => x).sort((p, q) => p.lastSync.localeCompare(q.lastSync))[0];
  if (!b) {
    return (
      <div className={`track-line${compact ? ' compact' : ''}`}>
        <Icon name="check" size={18} />
        <span>You mark rent paid yourself.</span>
        <Link to="/settings#rent-tracking">Check my bank automatically instead</Link>
      </div>
    );
  }
  return (
    <div className={`track-line${compact ? ' compact' : ''}`}>
      <Icon name="bank" size={18} />
      <span><strong>{banks.map((x) => x.bank).join(' and ')}</strong> checked every {BANK_CHECK_HOURS} h · last {ago(b.lastSync)}</span>
      <button className="btn small" onClick={() => act.syncBank()}>Check now</button>
    </div>
  );
}

const STATE_LABEL: Record<ChargeState, string> = { paid: 'Paid', late: 'Late', partial: 'Partial', due: 'Due', upcoming: 'Upcoming' };

// ---------- Door plate ----------
export function DoorPlate({ unit }: { unit: Unit }) {
  const { state, today } = useStore();
  const nav = useNavigate();
  const prop = state.properties.find((p) => p.id === unit.propertyId);
  const { lease, tenant } = unitTenant(state, unit.id, today);
  const line = currentLine(state, lease, today);
  if (!tenant || !lease) {
    // Vacancy cost counter (RA-8): lost rent since the unit emptied.
    const last = state.leases.filter((l) => l.unitId === unit.id && l.end).sort((a, b) => (b.end ?? '').localeCompare(a.end ?? ''))[0];
    const days = last?.end ? Math.max(0, daysBetween(last.end, today)) : 0;
    return (
      <button className="plate vacant" onClick={() => nav(`/rent/property/${unit.propertyId}`)} aria-label={`Unit ${unit.label}, vacant`}>
        <div className="plate-inner"><div className="plate-face">
          <svg className="keyghost" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 15a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 11h9M18 11v3M21 11v2" /></svg>
          <div className="num">{unit.label}</div>
          <div className="prop">{prop?.nickname}</div>
          <div className="who">
            <span className="tiny soft">{days ? `Empty ${days} days · ${fmt0(Math.round((unit.rent * 12 * days) / 365))} lost` : 'Ready for a tenant'}</span>
            <Stamp kind="vacant">Vacant</Stamp>
          </div>
        </div></div>
      </button>
    );
  }
  return (
    <button className="plate" onClick={() => nav(`/rent/tenant/${tenant.id}`)} aria-label={`Unit ${unit.label}, ${tenant.names.join(' and ')}, ${line ? STATE_LABEL[line.state] : ''}`}>
      <div className="plate-inner">
        <div className="plate-face">
          <div className="spread" style={{ alignItems: 'flex-start' }}><div className="num">{unit.label}</div>{line && <Stamp kind={line.state}>{STATE_LABEL[line.state]}</Stamp>}</div>
          <div className="prop">{prop?.nickname}</div>
          <div className="who" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
            <strong>{tenant.names.join(' & ')}</strong>
            <span className="mono small soft">{fmt(lease.rent)} a month</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

// ---------- Rent Roll strip: 12 months, one row per unit ----------
export function RentRoll({ propertyId }: { propertyId?: string }) {
  const { state, today } = useStore();
  const nav = useNavigate();
  const end = periodOf(today);
  const months = Array.from({ length: 12 }, (_, i) => addPeriods(end, i - 11));
  const units = state.units.filter((u) => (!propertyId || u.propertyId === propertyId) && state.properties.find((p) => p.id === u.propertyId && !p.archived));
  if (!units.length) return null;
  return (
    <div className="rentroll" role="table" aria-label="Rent roll, last 12 months">
      <div className="rr-row rr-head" role="row"><span role="columnheader" /> {months.map((m) => <span key={m} role="columnheader">{fmtMonthShort(m)[0]}</span>)}</div>
      {units.map((u) => {
        const leases = state.leases.filter((l) => l.unitId === u.id);
        const lines = new Map<string, { state: ChargeState; tenantId: string }>();
        for (const l of leases) for (const line of leaseLedger(l, state.payments, today)) lines.set(line.period, { state: line.state, tenantId: l.tenantId });
        const prop = state.properties.find((p) => p.id === u.propertyId);
        return (
          <div className="rr-row" role="row" key={u.id}>
            <span className="rr-label" role="rowheader">{propertyId ? `Unit ${u.label}` : `${prop?.nickname.split(' ')[0]} ${u.label}`}</span>
            {months.map((m) => {
              const c = lines.get(m);
              if (!c) return <span key={m} className="cell none" role="cell" aria-label={`${fmtPeriod(m)}: no lease`} />;
              return <button key={m} role="cell" className={`cell ${c.state === 'upcoming' ? '' : c.state}`} title={`${fmtPeriod(m)}: ${STATE_LABEL[c.state]}`} aria-label={`${fmtPeriod(m)}: ${STATE_LABEL[c.state]}`} onClick={() => nav(`/rent/tenant/${c.tenantId}`)} />;
            })}
          </div>
        );
      })}
      <div className="legend">
        <span><i style={{ background: 'var(--pine)' }} />Paid</span>
        <span><i style={{ background: 'repeating-linear-gradient(45deg, var(--brass) 0 2px, transparent 2px 4px)', border: '1px solid var(--brass)' }} />Partial</span>
        <span><i style={{ border: '2px solid var(--rust)' }} />Late</span>
        <span><i style={{ border: '1px solid var(--rule)' }} />Upcoming</span>
      </div>
    </div>
  );
}

// ---------- Letters: receipts and messages previewed as paper ----------
export function Letterhead({ state }: { state: AppState }) {
  return (
    <div className="lh">
      <div>
        <div className="serif">{state.profile.name || 'Your name'}</div>
        <div className="tiny" style={{ color: '#55605B' }}>{state.profile.email || 'you@example.com'}{state.profile.phone ? ` · ${state.profile.phone}` : ''}</div>
      </div>
      <div className="tiny" style={{ textAlign: 'right', color: '#55605B' }}>Prepared with Keyholder</div>
    </div>
  );
}

export function ReceiptLetter({ receipt }: { receipt: Receipt }) {
  const { state, today } = useStore();
  const pay = state.payments.find((p) => p.id === receipt.paymentId);
  if (!pay) return null;
  const lease = state.leases.find((l) => l.id === pay.leaseId)!;
  const tenant = state.tenants.find((t) => t.id === lease.tenantId)!;
  const unit = state.units.find((u) => u.id === lease.unitId)!;
  const prop = state.properties.find((p) => p.id === unit.propertyId)!;
  const line = leaseLedger(lease, state.payments, today).find((l) => l.period === pay.period);
  const balance = line ? line.balance : 0;
  return (
    <div className="letter print-me">
      <Letterhead state={state} />
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="serif" style={{ fontSize: 'var(--t-28)' }}>Rent receipt</div>
          <div className="mono tiny">No. {receipt.number}{receipt.supersedes ? ` · replaces No. ${state.receipts.find((r) => r.id === receipt.supersedes)?.number}` : ''}</div>
        </div>
        <Stamp kind={receipt.status === 'superseded' ? 'superseded' : 'paid'}>{receipt.status === 'superseded' ? 'Superseded' : 'Paid'}</Stamp>
      </div>
      <table>
        <tbody>
          <tr><td>Received from</td><td>{tenant.names.join(' & ')}</td></tr>
          <tr><td>Rental unit</td><td>Unit {unit.label}, {prop.address}, {prop.city}</td></tr>
          <tr><td>For the period</td><td>{fmtPeriod(pay.period)}</td></tr>
          <tr><td>Amount</td><td>{fmt(pay.amount)}</td></tr>
          <tr><td>Date received</td><td>{fmtDate(pay.date)}</td></tr>
          <tr><td>Method</td><td>{methodLabel(pay.method)}</td></tr>
          <tr><td>Balance after this payment</td><td>{balance <= 0 ? (balance < 0 ? `${fmt(-balance)} credit` : 'Paid in full') : `${fmt(balance)} owing`}</td></tr>
        </tbody>
      </table>
      <p className="tiny" style={{ color: '#55605B' }}>Received with thanks by {state.profile.name || 'the landlord'}.</p>
    </div>
  );
}

export const methodLabel = (m: string) => ({ etransfer: 'Interac e-Transfer', cheque: 'Cheque', cash: 'Cash', 'direct-deposit': 'Direct deposit', other: 'Other' } as Record<string, string>)[m] ?? m;

export function MessageEditor({ message, onDone }: { message: Message; onDone: () => void }) {
  const { state, act, today } = useStore();
  const base = messageBody(state, message, today);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(base.subject);
  const [body, setBody] = useState(base.body);
  const tenant = state.tenants.find((t) => t.id === message.tenantId);
  const receipt = message.receiptId ? state.receipts.find((r) => r.id === message.receiptId) : undefined;
  const changed = subject !== base.subject || body !== base.body;
  const canEmail = !!tenant && tenantEmails(tenant).length > 0;
  return (
    <div className="stack">
      <div className="small soft to-line">To: {toLine(tenant)}</div>
      <div className="letter">
        <Letterhead state={state} />
        {editing ? (
          <>
            <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ fontWeight: 600, marginBottom: 8 }} />
            <textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} />
          </>
        ) : (
          <>
            <p><strong>{subject}</strong></p>
            <div className="body">{body}</div>
          </>
        )}
      </div>
      {receipt && <ReceiptLetter receipt={receipt} />}
      <div className="letter-foot">
        {message.kind === 'reminder' ? 'Sends now. Further reminders stop automatically when payment arrives.' : 'Sends now, with the receipt attached as a PDF. A copy is kept in Paperwork.'}
      </div>
      {!canEmail && <div className="callout warn">No email for this tenant. Print the receipt, or add an email.</div>}
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={() => { act.discardMessage(message.id); onDone(); }}>Don't send</button>
        <button className="btn" onClick={() => setEditing((e) => !e)}><Icon name="edit" size={16} />{editing ? 'Preview' : 'Edit wording'}</button>
        {receipt && !embedded && <button className="btn" onClick={() => window.print()}><Icon name="print" size={16} />Print</button>}
        <button className="btn primary" disabled={!canEmail} onClick={() => { act.approveMessage(message.id, changed ? { subject, body } : undefined); onDone(); }}>
          <Icon name="check" size={16} />Approve and send
        </button>
      </div>
    </div>
  );
}
