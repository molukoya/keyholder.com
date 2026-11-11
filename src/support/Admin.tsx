import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHead } from '../screens/Support';
import { addDays, daysBetween, fmtDate } from '../lib/dates';
import { Status } from './charts';
import { customerOf, isLive, resetSupport, sup, useSupport } from './store';
import type { Member, Priority } from './data';

export function Privacy() {
  const s = useSupport();
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  const todo = s.requests.filter((r) => r.status === 'to do').sort((a, b) => a.received.localeCompare(b.received));
  const done = s.requests.filter((r) => r.status === 'done');
  const people = [...new Set(s.audit.map((a) => a.who))];
  const term = q.trim().toLowerCase();
  const log = s.audit.filter((a) => (!who || a.who === who) && (!term || `${a.action} ${a.detail}`.toLowerCase().includes(term)));
  return (
    <>
      <PageHead eyebrow="Admin" title="Privacy & audit" sub="Data requests (30-day limit) and team activity" />
      <section className="sp-card sp-sec"><h2 className="sp-h3">Data requests</h2>
        {todo.length === 0 ? <p className="sp-empty"><Status tone="good">All done</Status></p> : (
          <ul className="sp-rows">{todo.map((r) => {
            const c = customerOf(s, r.customerId); const due = addDays(r.received, 30); const left = daysBetween(s.today, due);
            return (
              <li key={r.id}><span><strong>{r.kind === 'copy' ? 'Copy of data' : 'Delete account'}</strong><span>{c ? <Link to={`/support/customers/${c.id}`}>{c.name}</Link> : 'Unknown'} · due {fmtDate(due)}</span></span>
                <span className="btn-row"><Status tone={left < 0 ? 'bad' : left <= 7 ? 'warn' : 'good'}>{left < 0 ? `${-left} days late` : `${left} days left`}</Status>
                  <button className="btn small primary" onClick={() => sup((d) => { d.requests.find((x) => x.id === r.id)!.status = 'done'; if (r.kind === 'delete') { const cc = d.customers.find((x) => x.id === r.customerId); if (cc) cc.deleted = true; } }, { action: r.kind === 'copy' ? 'Data copy sent' : 'Account deleted on request', detail: c?.name ?? r.customerId }, r.kind === 'copy' ? 'Data sent' : 'Account deleted')}>{r.kind === 'copy' ? 'Send data' : 'Delete'}</button></span></li>
            );
          })}</ul>
        )}
        {done.length > 0 && <p className="sp-muted sp-small">{done.length} done</p>}
      </section>
      <section className="sp-card sp-sec">
        <div className="sp-card-head"><h2 className="sp-h3">Audit log</h2>
          <div className="sp-filters tight">
            <label className="sp-filter-q"><Icon name="search" size={16} /><span className="sr-only">Search the log</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></label>
            <select className="input" aria-label="Person" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}</select>
          </div></div>
        <div className="table-scroll"><table className="ledger"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
          <tbody>{log.slice(0, 100).map((a) => <tr key={a.id}><td className="date">{new Date(a.at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td>{a.who}</td><td><strong>{a.action}</strong></td><td>{a.detail}</td></tr>)}</tbody></table></div>
        {log.length === 0 && <p className="sp-muted">No matches</p>}
      </section>
    </>
  );
}

const ROLE_NOTE: Record<Member['role'], string> = { Owner: 'Full access', Support: 'Inbox, customers, banners', 'Read-only': 'View only' };
export function Team() {
  const s = useSupport();
  const [m, setM] = useState({ name: '', email: '', role: 'Support' as Member['role'] });
  const [reply, setReply] = useState({ title: '', text: '' });
  const [sla, setSla] = useState(s.sla);
  return (
    <>
      <PageHead eyebrow="Admin" title="Team & settings" sub="Access, reply targets, saved replies" />
      <section className="sp-card sp-sec"><h2 className="sp-h3">Team</h2>
        <ul className="sp-rows">{s.team.map((t) => (
          <li key={t.id}><span><strong>{t.name}</strong><span>{t.email} · {ROLE_NOTE[t.role]}</span></span>
            <span className="btn-row">
              {t.role === 'Owner' ? <Status tone="good">Owner</Status> : <>
                <select className="input sp-inline-select" aria-label={`Role for ${t.name}`} value={t.role} onChange={(e) => sup((d) => { d.team.find((x) => x.id === t.id)!.role = e.target.value as Member['role']; }, { action: 'Role changed', detail: `${t.name} → ${e.target.value}` }, 'Role changed')}><option>Support</option><option>Read-only</option></select>
                <button className="btn small ghost" onClick={() => sup((d) => { d.team = d.team.filter((x) => x.id !== t.id); }, { action: 'Team member removed', detail: t.name }, `${t.name} removed`)}>Remove</button></>}
            </span></li>
        ))}</ul>
        <form className="sp-addform" onSubmit={(e) => { e.preventDefault(); sup((d) => { d.team.push({ id: `m${Date.now()}`, ...m, name: m.name.trim(), email: m.email.trim() }); }, { action: 'Team member invited', detail: `${m.name.trim()} (${m.role})` }, `Invite sent to ${m.email.trim()}`); setM({ name: '', email: '', role: 'Support' }); }}>
          <label className="field"><span className="label">Name</span><input className="input" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></label>
          <label className="field"><span className="label">Email</span><input className="input" type="email" value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} /></label>
          <label className="field"><span className="label">Role</span><select className="input" value={m.role} onChange={(e) => setM({ ...m, role: e.target.value as Member['role'] })}><option>Support</option><option>Read-only</option></select></label>
          <button className="btn primary" disabled={!m.name.trim() || !/\S+@\S+\.\S+/.test(m.email)}>Invite</button>
        </form>
      </section>
      <section className="sp-card sp-sec"><h2 className="sp-h3" title="Past these, a request is overdue">Reply targets (hours)</h2>
        <div className="sp-sla">{(['urgent', 'high', 'normal', 'low'] as Priority[]).map((p) => (
          <label key={p} className="field"><span className="label">{p[0].toUpperCase() + p.slice(1)}</span><input className="input" type="number" min={1} max={168} value={sla[p]} onChange={(e) => setSla({ ...sla, [p]: Math.max(1, Number(e.target.value) || 1) })} /></label>
        ))}</div>
        <button className="btn" onClick={() => sup((d) => { d.sla = sla; }, { action: 'Reply-time targets changed', detail: Object.entries(sla).map(([k, v]) => `${k} ${v}h`).join(', ') }, 'Saved')}>Save</button>
      </section>
      <section className="sp-card sp-sec"><h2 className="sp-h3">Saved replies</h2>
        <ul className="sp-rows">{s.replies.map((r) => (
          <li key={r.id}><span><strong>{r.title}</strong><span>{r.text}</span></span><button className="btn small ghost" aria-label={`Delete saved reply ${r.title}`} onClick={() => sup((d) => { d.replies = d.replies.filter((x) => x.id !== r.id); }, { action: 'Saved reply deleted', detail: r.title }, 'Deleted')}><Icon name="trash" size={14} /></button></li>
        ))}</ul>
        <form className="sp-stackform" onSubmit={(e) => { e.preventDefault(); sup((d) => { d.replies.push({ id: `r${Date.now()}`, title: reply.title.trim(), text: reply.text.trim() }); }, { action: 'Saved reply added', detail: reply.title.trim() }, 'Added'); setReply({ title: '', text: '' }); }}>
          <label className="field"><span className="label">Title</span><input className="input" value={reply.title} onChange={(e) => setReply({ ...reply, title: e.target.value })} /></label>
          <label className="field"><span className="label">Reply</span><textarea className="input" rows={3} value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} /></label>
          <button className="btn" disabled={!reply.title.trim() || !reply.text.trim()}>Add reply</button>
        </form>
      </section>
      <section className="sp-card sp-sec"><h2 className="sp-h3">Security</h2>
        <p className="sp-small">Preview login (admin / admin) is in the site's code: a lock, not real security. With the backend, each person gets their own login and a second sign-in step.</p>
        {isLive() ? <button className="btn" onClick={resetSupport}>Refresh</button> : <button className="btn ghost danger" onClick={resetSupport}>Reset sample data</button>}
      </section>
    </>
  );
}
