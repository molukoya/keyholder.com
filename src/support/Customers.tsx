import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHead } from '../screens/Support';
import { addDays, daysBetween, fmtDate } from '../lib/dates';
import { PROVINCES } from '../lib/jurisdiction';
import { Status } from './charts';
import { PriorityChip } from './Inbox';
import { customerOf, fmtMoney, health, HEALTH_LABEL, live, mrr, sup, useSupport, type SupportState } from './store';
import type { Customer, Health } from './data';

const tone = (h: Health) => (h === 'good' ? 'good' : h === 'watch' ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';
const ago = (d: string, today: string) => { const n = daysBetween(d, today); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`; };

export function Customers() {
  const s = useSupport();
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [hl, setHl] = useState('');
  const [prov, setProv] = useState('');
  const [sort, setSort] = useState<'new' | 'active' | 'units' | 'name'>('new');
  const [shown, setShown] = useState(25);
  const term = q.trim().toLowerCase();
  const rows = live(s)
    .filter((c) => (!term || c.name.toLowerCase().includes(term) || c.email.includes(term) || c.city.toLowerCase().includes(term)) && (!plan || c.plan === plan) && (!prov || c.province === prov) && (!hl || health(s, c) === hl))
    .sort((a, b) => (sort === 'new' ? b.signedUp.localeCompare(a.signedUp) : sort === 'active' ? b.lastActive.localeCompare(a.lastActive) : sort === 'units' ? b.units - a.units : a.name.localeCompare(b.name)));
  return (
    <>
      <PageHead eyebrow="Support" title="Customers" sub={`${live(s).length} landlords. Search, filter, then open one to help them.`} />
      <div className="sp-filters">
        <label className="sp-filter-q"><Icon name="search" size={16} /><span className="sr-only">Search customers</span><input className="input" value={q} onChange={(e) => { setQ(e.target.value); setShown(25); }} placeholder="Name, email or city" /></label>
        <select className="input" aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="">All plans</option><option value="landlord">Landlord (paying)</option><option value="starter">Starter (free)</option></select>
        <select className="input" aria-label="Health" value={hl} onChange={(e) => setHl(e.target.value)}><option value="">Any health</option>{(['good', 'watch', 'risk'] as Health[]).map((h) => <option key={h} value={h}>{HEALTH_LABEL[h]}</option>)}</select>
        <select className="input" aria-label="Province" value={prov} onChange={(e) => setProv(e.target.value)}><option value="">All provinces</option>{PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
        <select className="input" aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="new">Newest first</option><option value="active">Recently active</option><option value="units">Most units</option><option value="name">Name A–Z</option></select>
      </div>
      <p className="sp-count-line">{rows.length} shown</p>
      <div className="sp-card tight table-scroll">
        <table className="ledger sp-table">
          <thead><tr><th>Landlord</th><th>Plan</th><th className="num">Units</th><th>Where</th><th>Signed up</th><th>Last active</th><th>Health</th></tr></thead>
          <tbody>{rows.slice(0, shown).map((c) => (
            <tr key={c.id} className="click">
              <td><Link to={`/support/customers/${c.id}`} className="sp-cust"><strong>{c.name}</strong><span>{c.email}</span></Link></td>
              <td>{c.plan === 'landlord' ? 'Landlord' : 'Starter'}{c.trialEnds && c.trialEnds >= s.today ? <span className="sp-muted"> · free period</span> : null}</td>
              <td className="num">{c.units}</td>
              <td>{c.city}, {c.province}</td>
              <td className="date">{fmtDate(c.signedUp)}</td>
              <td className="date">{ago(c.lastActive, s.today)}</td>
              <td><Status tone={tone(health(s, c))}>{HEALTH_LABEL[health(s, c)]}</Status></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {rows.length > shown && <button className="btn sp-showmore" onClick={() => setShown((n) => n + 50)}>Show more ({rows.length - shown} left)</button>}
    </>
  );
}

export function CustomerPage() {
  const { id } = useParams();
  const s = useSupport();
  const nav = useNavigate();
  const c = customerOf(s, id ?? '');
  const [note, setNote] = useState('');
  const [credit, setCredit] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!c) return <p className="sp-empty">That customer isn't here. <Link to="/support/customers">Back to customers</Link></p>;
  const h = health(s, c);
  const change = (fn: (x: Customer) => void, action: string, msg: string, detail = c.name) => sup((d) => fn(d.customers.find((x) => x.id === c.id)!), { action, detail }, msg);
  const invoices = s.invoices.filter((i) => i.customerId === c.id);
  const tickets = s.tickets.filter((t) => t.customerId === c.id);
  const first = c.name.split(' ')[0];
  return (
    <>
      <Link to="/support/customers" className="crumb"><Icon name="back" size={16} />Back to customers</Link>
      <PageHead eyebrow={`Customer · ${c.id}`} title={c.name} sub={`${c.email} · ${c.phone} · ${c.city}, ${c.province}`}>
        <Status tone={c.deleted ? 'off' : tone(h)}>{c.deleted ? 'Deleted' : HEALTH_LABEL[h]}</Status>
      </PageHead>
      {c.deleted ? <div className="callout warn">This account was deleted. Its records are kept only in the audit log.</div> : null}
      <div className="sp-tiles small">
        <div className="sp-fact"><span>Plan</span><strong>{c.plan === 'landlord' ? 'Landlord' : 'Starter (free)'}</strong></div>
        <div className="sp-fact"><span>Units</span><strong>{c.units}</strong></div>
        <div className="sp-fact"><span>Properties · tenants</span><strong>{c.properties} · {c.tenants}</strong></div>
        <div className="sp-fact"><span>Pays a month</span><strong>{fmtMoney(mrr(c))}</strong></div>
        <div className="sp-fact"><span>Receipts sent</span><strong>{c.receiptsSent}</strong></div>
        <div className="sp-fact"><span>Signed up · last active</span><strong>{fmtDate(c.signedUp)} · {ago(c.lastActive, s.today)}</strong></div>
      </div>
      <div className="sp-split">
        <div>
          <section className="sp-card sp-sec"><h2 className="sp-h3">Banks</h2>
            {c.banks.length ? <ul className="sp-mini">{c.banks.map((b, i) => <li key={i}><strong>{b.bank}</strong> <Status tone={b.status === 'ok' ? 'good' : 'bad'}>{b.status === 'ok' ? 'Connecting' : 'Not connecting: needs to sign in again'}</Status></li>)}</ul> : <p className="sp-muted">No bank connected. Rent is marked paid by hand.</p>}
            {c.emailBounces > 0 && <p className="sp-warnline"><Icon name="mail" size={14} />{c.emailBounces} email{c.emailBounces > 1 ? 's' : ''} to their tenants bounced. Ask them to check the tenant's address.</p>}
          </section>
          <section className="sp-card sp-sec"><h2 className="sp-h3">Support requests</h2>
            {tickets.length ? <ul className="sp-mini">{tickets.map((t) => <li key={t.id}><PriorityChip p={t.priority} /> <Link to={`/support/inbox/${t.id}`}>{t.subject}</Link> <span className="sp-muted">{t.status === 'open' ? 'Needs a reply' : t.status === 'waiting' ? 'Waiting on them' : 'Solved'}</span></li>)}</ul> : <p className="sp-muted">No requests yet.</p>}
          </section>
          <section className="sp-card sp-sec"><h2 className="sp-h3">Billing</h2>
            {c.paymentStatus === 'failed' && <div className="callout warn sp-callout">The last payment failed. <button className="btn small" onClick={() => sup((d) => { d.customers.find((x) => x.id === c.id)!.paymentStatus = 'ok'; const inv = d.invoices.find((i) => i.customerId === c.id && i.status === 'failed'); if (inv) inv.status = 'paid'; }, { action: 'Payment retried', detail: c.name }, 'Payment went through.')}>Retry payment</button></div>}
            {c.trialEnds && c.trialEnds >= s.today && <p className="sp-muted">Free period until {fmtDate(c.trialEnds)}.</p>}
            {c.credit > 0 && <p className="sp-muted">Credit on account: {fmtMoney(c.credit, 2)}</p>}
            {invoices.length ? <div className="table-scroll"><table className="ledger"><thead><tr><th>Date</th><th className="num">Amount</th><th>Status</th></tr></thead><tbody>{invoices.map((i) => <tr key={i.id}><td className="date">{fmtDate(i.date)}</td><td className="num">{fmtMoney(i.amount, 2)}</td><td><Status tone={i.status === 'paid' ? 'good' : i.status === 'failed' ? 'bad' : 'off'}>{i.status === 'paid' ? 'Paid' : i.status === 'failed' ? 'Failed' : 'Refunded'}</Status></td></tr>)}</tbody></table></div> : <p className="sp-muted">No invoices: they are on the free plan.</p>}
          </section>
          <section className="sp-card sp-sec"><h2 className="sp-h3">Notes from the team</h2>
            {c.notes.length ? <ul className="sp-mini">{c.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p className="sp-muted">No notes yet. Only your team sees these.</p>}
            <div className="sp-addrow"><label htmlFor="cn" className="sr-only">Add a note</label><input id="cn" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team" /><button className="btn" disabled={!note.trim()} onClick={() => { change((x) => { x.notes.push(`${note.trim()} (You, ${fmtDate(s.today)})`); }, 'Note added', 'Note saved.'); setNote(''); }}>Add</button></div>
          </section>
        </div>
        {!c.deleted && (
          <aside className="sp-side"><div className="sp-card sp-actions">
            <h2 className="sp-h3">Help {first}</h2>
            <button className="btn" onClick={() => change(() => undefined, 'Sign-in link resent', `Sign-in link sent to ${c.email}.`, c.email)}><Icon name="mail" size={16} />Resend sign-in link</button>
            <button className="btn" onClick={() => change((x) => { x.trialEnds = addDays(x.trialEnds && x.trialEnds > s.today ? x.trialEnds : s.today, 30); }, 'Free period extended', 'Free period extended by 30 days.')}><Icon name="calendar" size={16} />Give 30 more free days</button>
            <div className="field"><span className="label">Plan</span>
              <div className="seg" role="group" aria-label="Plan">{(['starter', 'landlord'] as const).map((p) => <button key={p} aria-pressed={c.plan === p} onClick={() => c.plan !== p && change((x) => { x.plan = p; x.paymentStatus = p === 'landlord' ? 'ok' : 'none'; }, 'Plan changed', `Plan changed to ${p === 'landlord' ? 'Landlord' : 'Starter'}.`, `${c.name} → ${p === 'landlord' ? 'Landlord' : 'Starter'}`)}>{p === 'landlord' ? 'Landlord' : 'Starter'}</button>)}</div></div>
            <div className="field"><label className="label" htmlFor="cr">Give a credit</label>
              <div className="sp-addrow"><input id="cr" className="input" inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value.replace(/[^\d.]/g, ''))} placeholder="$ amount" /><button className="btn" disabled={!Number(credit)} onClick={() => { const v = Math.round(Number(credit) * 100); change((x) => { x.credit += v; }, 'Credit given', `${fmtMoney(v, 2)} credit added.`, `${fmtMoney(v, 2)} to ${c.name}`); setCredit(''); }}>Add</button></div></div>
            <button className="btn" onClick={() => change(() => undefined, 'Data export prepared', `A copy of ${first}'s data is ready to send.`)}><Icon name="download" size={16} />Export their data</button>
            <button className="btn" onClick={() => nav('/today')} title="Stage 1 opens the sample landlord app; with the backend this opens their own account, read-only"><Icon name="home" size={16} />View their app (sample)</button>
            {!confirmDelete ? <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} />Delete account</button> : (
              <div className="callout warn sp-callout"><p><strong>Delete {c.name}'s account?</strong> Their properties, tenants and records are removed. This can't be undone.</p>
                <div className="btn-row"><button className="btn danger" onClick={() => { change((x) => { x.deleted = true; }, 'Account deleted', 'Account deleted.'); setConfirmDelete(false); }}>Yes, delete</button><button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button></div></div>
            )}
          </div></aside>
        )}
      </div>
    </>
  );
}

export const healthOf = (s: SupportState, c: Customer) => health(s, c);
