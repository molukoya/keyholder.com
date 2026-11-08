import { useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import type { Message, Receipt } from '../data/types';
import { useStore } from '../data/store';
import { fmtDate, fmtPeriod, fmtTime } from '../lib/dates';
import { fmt } from '../lib/money';
import { messageBody } from '../lib/templates';
import { Letterhead, ReceiptLetter, methodLabel } from '../components/domain';
import { Drawer, Empty, Stamp, embedded } from '../components/ui';
import { Icon } from '../components/Icon';

export function Paperwork() {
  const { tab = 'receipts' } = useParams();
  const tabs = [{ id: 'receipts', label: 'Receipts' }, { id: 'letters', label: 'Letters sent' }, { id: 'leases', label: 'Leases' }, { id: 'log', label: 'Activity log' }];
  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">Paperwork</div><h1>{tabs.find((t) => t.id === tab)?.label}</h1></div></div>
      <nav className="tabs" aria-label="Paperwork sections">{tabs.map((t) => <NavLink key={t.id} to={`/paperwork/${t.id}`} className={tab === t.id ? 'active' : ''}>{t.label}</NavLink>)}</nav>
      {tab === 'receipts' && <Receipts />}
      {tab === 'letters' && <Letters />}
      {tab === 'leases' && <Leases />}
      {tab === 'log' && <Log />}
      <div className="callout" style={{ marginTop: 32 }}>
        <strong>Coming to Paperwork:</strong> Ontario N4, N1 and L1 notices with the approval gate, vacancy listings and the rental application form. They are in the PRD's v1 but not in your three phases yet — see <Link to="/settings#phase">the phase plan</Link>.
      </div>
    </div>
  );
}

function Receipts() {
  const { state } = useStore();
  const [open, setOpen] = useState<Receipt | null>(null);
  const rs = [...state.receipts].sort((a, b) => b.number - a.number);
  if (!rs.length) return <div className="sheet"><Empty title="No receipts yet.">Every rent payment you confirm creates one automatically.</Empty></div>;
  return (
    <>
      <div className="sheet tight table-scroll"><table className="ledger">
        <thead><tr><th>No.</th><th>Tenant</th><th>Period</th><th>Received</th><th className="num">Amount</th><th>Status</th></tr></thead>
        <tbody>{rs.slice(0, 200).map((r) => {
          const p = state.payments.find((x) => x.id === r.paymentId);
          const l = state.leases.find((x) => x.id === p?.leaseId);
          const t = state.tenants.find((x) => x.id === l?.tenantId);
          if (!p) return null;
          return (
            <tr key={r.id} className="click" onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}>
              <td className="date">#{r.number}</td><td>{t?.names.join(' & ')}</td><td>{fmtPeriod(p.period)}</td><td className="date">{fmtDate(p.date)} · {methodLabel(p.method)}</td><td className="num">{fmt(p.amount)}</td>
              <td><Stamp kind={r.status}>{r.status}</Stamp></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {open && <Drawer title={`Receipt #${open.number}`} onClose={() => setOpen(null)} wide footer={embedded ? undefined : <button className="btn" onClick={() => window.print()}><Icon name="print" size={16} />Print or save PDF</button>}><ReceiptLetter receipt={open} /></Drawer>}
    </>
  );
}

function Letters() {
  const { state, today } = useStore();
  const [open, setOpen] = useState<Message | null>(null);
  const ms = state.messages.filter((m) => m.status === 'sent').sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
  if (!ms.length) return <div className="sheet"><Empty title="Nothing sent yet.">Every receipt and reminder is kept here, exactly as it went out.</Empty></div>;
  return (
    <>
      <div className="sheet"><ul className="rows">{ms.slice(0, 100).map((m) => {
        const t = state.tenants.find((x) => x.id === m.tenantId);
        return (
          <li key={m.id} className="row link" onClick={() => setOpen(m)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(m)}>
            <span className="margin">{fmtDate(m.sentAt!.slice(0, 10))}</span>
            <span><span className="title">{messageBody(state, m, today).subject}</span><span className="sub" style={{ display: 'block' }}>To {t?.names.join(' & ')} · {fmtTime(m.sentAt!)}</span></span>
            <Stamp kind="sent">{m.kind}</Stamp>
          </li>
        );
      })}</ul></div>
      {open && (
        <Drawer title="Letter" onClose={() => setOpen(null)} wide>
          <div className="letter"><Letterhead state={state} /><p><strong>{messageBody(state, open, today).subject}</strong></p><div className="body">{messageBody(state, open, today).body}</div></div>
          <p className="letter-foot">Sent {fmtDate(open.sentAt!.slice(0, 10))} at {fmtTime(open.sentAt!)}{open.edited ? ' · edited before sending' : ''}</p>
        </Drawer>
      )}
    </>
  );
}

function Leases() {
  const { state } = useStore();
  if (!state.leases.length) return <div className="sheet"><Empty title="No leases yet.">Add a tenant to create the first lease record.</Empty></div>;
  return (
    <div className="sheet tight table-scroll"><table className="ledger">
      <thead><tr><th>Tenant</th><th>Unit</th><th>Term</th><th className="num">Rent</th><th className="num">LMR deposit</th><th>Email notices</th></tr></thead>
      <tbody>{state.leases.map((l) => {
        const t = state.tenants.find((x) => x.id === l.tenantId); const u = state.units.find((x) => x.id === l.unitId); const p = state.properties.find((x) => x.id === u?.propertyId);
        return (
          <tr key={l.id}><td><Link to={`/rent/tenant/${t?.id}`}>{t?.names.join(' & ')}</Link></td><td>{p?.nickname} · {u?.label}</td><td className="date">{fmtDate(l.start)} → {l.end ? fmtDate(l.end) : 'month-to-month'}</td><td className="num">{fmt(l.rent)}</td><td className="num">{fmt(l.lmrDeposit)}</td><td>{l.emailNoticeConsent ? 'Consented' : 'Paper only'}</td></tr>
        );
      })}</tbody>
    </table></div>
  );
}

function Log() {
  const { state } = useStore();
  return (
    <div className="sheet">
      <p className="small soft">Append-only record of every change. In stage 2 this is stored server-side and cannot be edited.</p>
      <ul className="rows">{state.audit.slice(0, 150).map((a) => (
        <li key={a.id} className="row"><span className="margin">{fmtDate(a.at.slice(0, 10))}<br />{fmtTime(a.at)}</span><span><span className="title">{a.action}</span><span className="sub" style={{ display: 'block' }}>{a.detail}</span></span><span /></li>
      ))}</ul>
    </div>
  );
}
