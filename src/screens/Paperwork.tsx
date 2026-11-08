import { useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import type { Lease, Message, Province, Receipt } from '../data/types';
import { AUTHORITY_URL, SITUATIONS, formsFor } from '../lib/forms';
import { FormWizard, SituationPicker } from '../components/FormWizard';
import { useStore } from '../data/store';
import { addDays, addMonths, fmtDate, fmtPeriod, fmtTime } from '../lib/dates';
import { PROVINCES, province } from '../lib/jurisdiction';
import { Expenses } from './Money';
import { fmt } from '../lib/money';
import { messageBody } from '../lib/templates';
import { Letterhead, ReceiptLetter, methodLabel } from '../components/domain';
import { Drawer, Empty, Stamp, embedded } from '../components/ui';
import { Icon } from '../components/Icon';

export function Paperwork() {
  const { tab = 'expenses' } = useParams();
  const tabs = [{ id: 'expenses', label: 'Expense receipts' }, { id: 'income', label: 'Rental income' }, { id: 'leases', label: 'Leases' }, { id: 'notices', label: 'Notices and letters' }, { id: 'forms', label: 'Forms' }];
  const cur = tab === 'receipts' ? 'income' : tab === 'letters' || tab === 'log' ? 'notices' : tab;
  return (
    <div className="page">
      <div className="page-head"><h1>Paperwork</h1></div>
      <nav className="tabs" aria-label="Paperwork sections">{tabs.map((t) => <NavLink key={t.id} to={`/paperwork/${t.id}`} className={cur === t.id ? 'active' : ''}>{t.label}</NavLink>)}</nav>
      {cur === 'expenses' && <Expenses />}
      {cur === 'income' && <Income />}
      {cur === 'leases' && <Leases />}
      {cur === 'forms' && <FormsLibrary />}
      {cur === 'notices' && <><NoticesLog /><section className="section"><h2 className="section-title">Receipts and reminders sent</h2><Letters /></section><section className="section"><h2 className="section-title">History of changes</h2><Log /></section></>}
    </div>
  );
}

/** Rental income log: every payment received, with its receipt. */
function Income() {
  const { state } = useStore();
  const [open, setOpen] = useState<Receipt | null>(null);
  const [prop, setProp] = useState('all');
  const years = [...new Set(state.payments.map((p) => p.date.slice(0, 4)))].sort().reverse();
  const [year, setYear] = useState(years[0] ?? '');
  const rows = state.payments.filter((p) => !p.voided && p.date.startsWith(year)).filter((p) => {
    if (prop === 'all') return true;
    const l = state.leases.find((x) => x.id === p.leaseId); return state.units.find((u) => u.id === l?.unitId)?.propertyId === prop;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((a, p) => a + p.amount, 0);
  if (!state.payments.length) return <div className="sheet"><Empty title="No rent received yet.">Every payment you mark paid, or the bank finds, is listed here.</Empty></div>;
  return (
    <>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        <select className="input" style={{ width: 'auto' }} value={prop} onChange={(e) => setProp(e.target.value)} aria-label="Property"><option value="all">All properties</option>{state.properties.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}</select>
        <select className="input" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select>
        <span className="soft">{rows.length} payments · <strong className="mono">{fmt(total)}</strong></span>
      </div>
      <div className="sheet tight table-scroll"><table className="ledger">
        <thead><tr><th>Received</th><th>Tenant</th><th>Unit</th><th>For</th><th>How</th><th className="num">Amount</th><th>Receipt</th></tr></thead>
        <tbody>{rows.map((p) => {
          const l = state.leases.find((x) => x.id === p.leaseId); const t = state.tenants.find((x) => x.id === l?.tenantId); const u = state.units.find((x) => x.id === l?.unitId); const pr = state.properties.find((x) => x.id === u?.propertyId);
          const r = state.receipts.find((x) => x.paymentId === p.id && x.status !== 'superseded');
          return (
            <tr key={p.id}>
              <td className="date">{fmtDate(p.date)}</td><td>{t?.names.join(' & ')}</td><td>{pr?.nickname.split(' ')[0]} · {u?.label}</td><td>{fmtPeriod(p.period)}</td><td className="small">{methodLabel(p.method)}{p.source !== 'manual' ? ' · bank' : ''}</td><td className="num in">{fmt(p.amount)}</td>
              <td>{r ? <button className="btn small ghost" onClick={() => setOpen(r)}>#{r.number}{r.status === 'draft' ? ' (not sent)' : ''}</button> : '—'}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {open && <Drawer title={`Receipt #${open.number}`} onClose={() => setOpen(null)} wide footer={embedded ? undefined : <button className="btn" onClick={() => window.print()}><Icon name="print" size={16} />Print or save PDF</button>}><ReceiptLetter receipt={open} /></Drawer>}
    </>
  );
}

/** Notices served, with proof of service. */
function NoticesLog() {
  const { state } = useStore();
  const ns = [...state.notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="section">
      <h2 className="section-title">Notices</h2>
      <div className="sheet">
        {ns.length === 0 ? <p className="soft" style={{ margin: 0 }}>No notices served. Late-rent notices are prepared from a tenant's page or Rentals.</p> : (
          <ul className="rows">{ns.map((n) => {
            const t = state.tenants.find((x) => x.id === n.tenantId);
            return <li key={n.id} className="row"><span className="margin">{n.servedOn ? fmtDate(n.servedOn) : '—'}</span><span><span className="title">{n.kind} · {t?.names.join(' & ')}</span><span className="sub" style={{ display: 'block' }}>{fmt(n.arrears)} · delivered {n.serveMethod} by {n.servedBy}{n.terminationDate ? ` · pay by ${fmtDate(n.terminationDate)}` : ''}</span></span><Stamp kind={n.status === 'voided-by-payment' ? 'superseded' : 'served'}>{({ served: 'Served', 'voided-by-payment': 'Paid', filed: 'Ready', signed: 'Signed' } as Record<string, string>)[n.status]}</Stamp></li>;
          })}</ul>
        )}
      </div>
    </section>
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

/** 12-month rule: rent can rise once every 12 months, with 90 days' written notice (N1 in Ontario). */
function increaseText(start: string, prov: string, today: string): string {
  let next = addMonths(start, 12);
  while (next < today) next = addMonths(next, 12);
  const g = province(prov as never).rentIncreaseGuidelinePct;
  return `From ${fmtDate(next)}${g ? `, up to ${g}%` : ''} · give notice by ${fmtDate(addDays(next, -90))}`;
}

function Leases() {
  const { state, today } = useStore();
  const [inc, setInc] = useState<Lease | null>(null);
  if (!state.leases.length) return <div className="sheet"><Empty title="No leases yet.">Add a tenant to create the first lease record.</Empty></div>;
  return (
    <>
    <div className="sheet tight table-scroll"><table className="ledger">
      <thead><tr><th>Tenant</th><th>Unit</th><th>Term</th><th className="num">Rent</th><th className="num">Last month's deposit</th><th>Email notices</th><th>Next rent increase</th></tr></thead>
      <tbody>{state.leases.map((l) => {
        const t = state.tenants.find((x) => x.id === l.tenantId); const u = state.units.find((x) => x.id === l.unitId); const p = state.properties.find((x) => x.id === u?.propertyId);
        return (
          <tr key={l.id}><td><Link to={`/rent/tenant/${t?.id}`}>{t?.names.join(' & ')}</Link></td><td>{p?.nickname} · {u?.label}</td><td className="date">{fmtDate(l.start)} → {l.end ? fmtDate(l.end) : 'month-to-month'}</td><td className="num">{fmt(l.rent)}</td><td className="num">{fmt(l.lmrDeposit)}</td><td>{l.emailNoticeConsent ? 'Consented' : 'Paper only'}</td><td className="small">{l.end ? '—' : <>{increaseText(l.start, p?.province ?? 'ON', today)}<br /><button className="btn small" style={{ marginTop: 6 }} onClick={() => setInc(l)}>Prepare rent increase</button></>}</td></tr>
        );
      })}</tbody>
    </table></div>
    {inc && <SituationPicker lease={inc} only="rent-increase" onClose={() => setInc(null)} />}
    </>
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

/** Forms library: every situation and its form, for any province. Prepare works for your own properties. */
function FormsLibrary() {
  const { state, today } = useStore();
  const props = state.properties.filter((p) => !p.archived);
  const [prov, setProv] = useState<Province>(props[0]?.province ?? state.profile.province);
  const [pick, setPick] = useState<{ lease: Lease; formId: string } | null>(null);
  const [choose, setChoose] = useState<string | null>(null);
  const leases = state.leases.filter((l) => {
    const pr = state.properties.find((x) => x.id === state.units.find((u) => u.id === l.unitId)?.propertyId);
    return pr && !pr.archived && pr.province === prov && (!l.end || l.end >= today);
  });
  const info = province(prov);
  const own = new Set(props.map((p) => p.province));
  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <label className="btn-row"><span className="small">Show forms for</span>
          <select className="input" style={{ width: 'auto' }} value={prov} onChange={(e) => setProv(e.target.value as Province)} aria-label="Province">
            {PROVINCES.map((x) => <option key={x.code} value={x.code}>{x.name}{own.has(x.code) ? ' (your properties)' : ''}</option>)}
          </select>
        </label>
        <span className="small soft">{info.tribunal} · <a href={AUTHORITY_URL[prov]} target="_blank" rel="noopener noreferrer">official site</a></span>
      </div>
      {!leases.length && <div className="callout">You have no tenants in {info.name}, so these forms are for reading. Prepare is available for provinces where you have a rental.</div>}
      {SITUATIONS.map((s) => (
        <section key={s.id} className="section">
          <h2 className="section-title">{s.label}</h2>
          <div className="sheet tight"><ul className="unit-list">{formsFor(prov, s.id).map((f) => (
            <li key={f.id} className="unit-row form-row">
              <span className="form-code">{f.code}</span>
              <span className="unit-who"><strong>{f.title}</strong><span>{f.plain}</span></span>
              <span className="unit-state"><span className={`status ${f.official ? 'paid' : 'vacant'}`}>{f.official ? 'Official form' : 'Template'}</span></span>
              {leases.length ? <button className="btn" onClick={() => (leases.length === 1 ? setPick({ lease: leases[0], formId: f.id }) : setChoose(f.id))}>Prepare</button> : <span />}
            </li>
          ))}</ul></div>
        </section>
      ))}
      {choose && (
        <Drawer title="For which tenant?" onClose={() => setChoose(null)}>
          <div className="stack">{leases.map((l) => { const t = state.tenants.find((x) => x.id === l.tenantId); const u = state.units.find((x) => x.id === l.unitId); const pr = state.properties.find((x) => x.id === u?.propertyId); return <button key={l.id} className="choice" onClick={() => { setPick({ lease: l, formId: choose }); setChoose(null); }}><span className="t">{t?.names.join(' & ')}</span><span className="s">{pr?.nickname} · Unit {u?.label}</span></button>; })}</div>
        </Drawer>
      )}
      {pick && <FormWizard lease={pick.lease} formId={pick.formId} onClose={() => setPick(null)} />}
    </>
  );
}
