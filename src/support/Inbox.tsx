import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHead } from '../screens/Support';
import { Status } from './charts';
import { customerOf, health, HEALTH_LABEL, sup, timeLeft, useSupport } from './store';
import type { Priority, TicketStatus } from './data';

const PRIORITY: Record<Priority, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
const STATUS: Record<TicketStatus, string> = { open: 'To answer', waiting: 'Waiting on them', solved: 'Solved' };
const when = (iso: string) => new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function PriorityChip({ p }: { p: Priority }) { return <span className={`sp-pri ${p}`}>{PRIORITY[p]}</span>; }

export function Inbox() {
  const s = useSupport();
  const [tab, setTab] = useState<TicketStatus | 'all'>('open');
  const [who, setWho] = useState<'all' | 'mine' | 'nobody'>('all');
  const list = s.tickets
    .filter((t) => (tab === 'all' || t.status === tab) && (who === 'all' || (who === 'mine' ? t.assignee === 'You' : !t.assignee)))
    .sort((a, b) => (a.status === 'open' && b.status === 'open' ? Date.parse(a.created) + s.sla[a.priority] * 3600e3 - (Date.parse(b.created) + s.sla[b.priority] * 3600e3) : Date.parse(b.created) - Date.parse(a.created)));
  const count = (st: TicketStatus) => s.tickets.filter((t) => t.status === st).length;
  return (
    <>
      <PageHead eyebrow="Support" title="Inbox" sub="Most urgent first" />
      <div className="sp-filters">
        <div className="seg" role="group" aria-label="Show">
          {(['open', 'waiting', 'solved', 'all'] as const).map((k) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{k === 'all' ? 'All' : STATUS[k]}{k !== 'all' && <span className="sp-segn">{count(k)}</span>}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Assigned to">
          {([['all', 'Everyone'], ['mine', 'Mine'], ['nobody', 'Unassigned']] as const).map(([k, l]) => <button key={k} aria-pressed={who === k} onClick={() => setWho(k)}>{l}</button>)}
        </div>
      </div>
      <div className="sp-card tight">
        {list.length === 0 ? <p className="sp-empty"><Status tone="good">Inbox zero</Status></p> : (
          <ul className="sp-tickets">{list.map((t) => {
            const c = customerOf(s, t.customerId);
            const tl = timeLeft(s, t);
            return (
              <li key={t.id}><Link to={`/support/inbox/${t.id}`}>
                <PriorityChip p={t.priority} />
                <span className="sp-t-main"><strong>{t.subject}</strong><span>{c?.name ?? 'Deleted'} · {t.category} · {t.id}</span></span>
                <span className="sp-t-side">
                  {t.status === 'open' ? <span className={`sp-due${tl.overdue ? ' over' : tl.soon ? ' soon' : ''}`}><Icon name="clock" size={13} />{tl.text}</span> : <span className="sp-muted">{STATUS[t.status]}</span>}
                  <span className="sp-muted">{t.assignee || 'Unassigned'}</span>
                </span>
              </Link></li>
            );
          })}</ul>
        )}
      </div>
    </>
  );
}

export function TicketPage() {
  const { id } = useParams();
  const s = useSupport();
  const nav = useNavigate();
  const t = s.tickets.find((x) => x.id === id);
  const [text, setText] = useState('');
  const [note, setNote] = useState(false);
  if (!t) return <p className="sp-empty">Request not found. <Link to="/support/inbox">Inbox</Link></p>;
  const c = customerOf(s, t.customerId);
  const tl = timeLeft(s, t);
  const set = (patch: Partial<typeof t>, action: string, msg: string) => sup((d) => { Object.assign(d.tickets.find((x) => x.id === t.id)!, patch); }, { action, detail: `${t.id} · ${t.subject}` }, msg);
  const send = () => {
    if (!text.trim()) return;
    sup((d) => { const x = d.tickets.find((y) => y.id === t.id)!; x.messages.push({ from: note ? 'note' : 'agent', who: 'You', at: new Date().toISOString(), text: text.trim() }); if (!note) { x.status = 'waiting'; x.assignee ||= 'You'; } },
      { action: note ? 'Team note added' : 'Reply sent', detail: `${t.id} · ${c?.name ?? ''}` }, note ? 'Note saved' : `Sent to ${c?.name.split(' ')[0] ?? 'them'}`);
    setText(''); setNote(false);
  };
  const others = s.tickets.filter((x) => x.customerId === t.customerId && x.id !== t.id);
  return (
    <>
      <Link to="/support/inbox" className="crumb"><Icon name="back" size={16} />Inbox</Link>
      <PageHead eyebrow={`${t.id} · ${t.category}`} title={t.subject} sub={`${STATUS[t.status]}${t.status === 'open' ? ` · ${tl.text}` : ''}`}>
        {t.status !== 'solved' ? <button className="btn" onClick={() => set({ status: 'solved' }, 'Request solved', 'Solved.')}><Icon name="check" size={16} />Solved</button>
          : <button className="btn" onClick={() => set({ status: 'open' }, 'Request reopened', 'Reopened.')}>Reopen</button>}
      </PageHead>
      <div className="sp-split">
        <div>
          <ol className="sp-thread">{t.messages.map((m, i) => (
            <li key={i} className={m.from}><div className="sp-msg-head"><strong>{m.from === 'note' ? `Private note · ${m.who}` : m.who}</strong><span>{when(m.at)}</span></div><p>{m.text}</p></li>
          ))}</ol>
          <div className="sp-card sp-reply">
            <div className="seg" role="group" aria-label="Write">
              <button aria-pressed={!note} onClick={() => setNote(false)}>Reply</button>
              <button aria-pressed={note} onClick={() => setNote(true)}>Team note</button>
            </div>
            <label htmlFor="sp-reply" className="sr-only">{note ? 'Private note' : 'Reply'}</label>
            <textarea id="sp-reply" className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={note ? 'Only your team sees this' : `Reply to ${c?.name.split(' ')[0] ?? 'them'}`} />
            <div className="sp-reply-foot">
              <label className="sp-inline"><span className="sr-only">Saved replies</span>
                <select className="input" value="" onChange={(e) => { const r = s.replies.find((x) => x.id === e.target.value); if (r) setText((x) => (x ? `${x}\n\n` : `Hi ${c?.name.split(' ')[0] ?? 'there'},\n\n`) + r.text); }}>
                  <option value="">Saved replies</option>{s.replies.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </label>
              <button className="btn primary" disabled={!text.trim()} onClick={send}>{note ? 'Save note' : 'Send'}</button>
            </div>
          </div>
        </div>
        <aside className="sp-side">
          <div className="sp-card">
            <h2 className="sp-h3">Details</h2>
            <label className="field"><span className="label">Priority</span>
              <select className="input" value={t.priority} onChange={(e) => set({ priority: e.target.value as Priority }, 'Priority changed', `Priority set to ${PRIORITY[e.target.value as Priority]}.`)}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span className="label">Assigned to</span>
              <select className="input" value={t.assignee} onChange={(e) => set({ assignee: e.target.value }, 'Request assigned', e.target.value ? `Assigned to ${e.target.value}.` : 'Unassigned.')}><option value="">Nobody</option>{s.team.filter((m) => m.role !== 'Read-only').map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}</select></label>
          </div>
          {c && (
            <div className="sp-card">
              <h2 className="sp-h3">{c.name}</h2>
              <p className="sp-kv"><span>Email</span>{c.email}</p>
              <p className="sp-kv"><span>Plan</span>{c.plan === 'landlord' ? `Paid · ${c.units} units` : 'Free'}</p>
              <p className="sp-kv"><span>Where</span>{c.city}, {c.province}</p>
              <p className="sp-kv"><span>Banks</span>{c.banks.length ? c.banks.map((b) => `${b.bank}${b.status === 'failing' ? ' (down)' : ''}`).join(', ') : 'None'}</p>
              <p className="sp-kv"><span>Health</span><Status tone={health(s, c) === 'good' ? 'good' : health(s, c) === 'watch' ? 'warn' : 'bad'}>{HEALTH_LABEL[health(s, c)]}</Status></p>
              <button className="btn small" onClick={() => nav(`/support/customers/${c.id}`)}>Customer page</button>
              {others.length > 0 && <><h3 className="sp-h4">Other requests</h3><ul className="sp-mini">{others.map((o) => <li key={o.id}><Link to={`/support/inbox/${o.id}`}>{o.subject}</Link> <span className="sp-muted">{STATUS[o.status]}</span></li>)}</ul></>}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
