import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHead, Tile } from '../screens/Support';
import { daysBetween, fmtDate } from '../lib/dates';
import { PACK_VERSION, PROVINCES } from '../lib/jurisdiction';
import { formsFor } from '../lib/forms';
import { Seg } from '../components/ui';
import { BarChart, HBars, Status } from './charts';
import { live, sup, useSupport } from './store';
import { BANKS, type Announcement } from './data';

export function Health() {
  const s = useSupport();
  const cs = live(s);
  const banks = BANKS.map((bank) => {
    const links = cs.flatMap((c) => c.banks.filter((b) => b.bank === bank).map((b) => ({ ...b, c })));
    const failing = links.filter((l) => l.status === 'failing');
    const rate = links.length ? failing.length / links.length : 0;
    return { bank, linked: links.length, failing, tone: (rate === 0 ? 'good' : rate < 0.1 ? 'warn' : 'bad') as 'good' | 'warn' | 'bad' };
  }).filter((b) => b.linked);
  const bounced = cs.reduce((a, c) => a + c.emailBounces, 0);
  const active = cs.filter((c) => daysBetween(c.lastActive, s.today) < 30);
  const sent = Math.round(active.reduce((a, c) => a + c.units, 0) * 0.9);
  const autos = [
    { label: 'Bank checks run', value: active.filter((c) => c.banks.length).length * 6 * 7 },
    { label: 'Receipts sent', value: Math.round(sent * 0.6) },
    { label: 'Reminders sent', value: Math.round(sent * 0.12) },
    { label: 'Notices prepared', value: Math.round(sent * 0.015) },
    { label: 'Applications received', value: Math.round(sent * 0.04) },
  ];
  const days = Array.from({ length: 7 }, (_, i) => ({ label: new Date(Date.parse(`${s.today}T12:00:00`) - (6 - i) * 864e5).toLocaleString('en-CA', { weekday: 'short' }), value: Math.round((sent / 7) * (i === 6 ? 0.4 : 0.8 + ((i * 37) % 10) / 25)) }));
  return (
    <>
      <PageHead eyebrow="Platform" title="System health" sub="Banks, email and the automations landlords rely on. Problems first." />
      <div className="sp-tiles">
        <Tile label="Website and app" value="99.98%" note="Up in the last 30 days" />
        <Tile label="Banks connecting" value={`${banks.reduce((a, b) => a + b.linked - b.failing.length, 0)} of ${banks.reduce((a, b) => a + b.linked, 0)}`} note="Linked bank accounts" />
        <Tile label="Emails delivered" value={`${(100 - (bounced / Math.max(1, sent)) * 100).toFixed(1)}%`} note={`${bounced} bounced this week`} />
        <Tile label="Problems to look at" value={String(s.errors.length)} good={false} />
      </div>
      {s.errors.length > 0 && (
        <section className="sp-card sp-sec"><h2 className="sp-h3">Problems</h2>
          <ul className="sp-rows">{s.errors.map((e) => (
            <li key={e.id}><span><strong>{e.message}</strong><span>{e.area} · {e.count} affected · since {new Date(e.at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
              <button className="btn small" onClick={() => sup((d) => { d.errors = d.errors.filter((x) => x.id !== e.id); }, { action: 'Problem marked fixed', detail: e.message }, 'Marked as fixed.')}><Icon name="check" size={14} />Mark fixed</button></li>
          ))}</ul>
        </section>
      )}
      <section className="sp-sec"><h2 className="sp-h2">Banks</h2>
        <div className="sp-banks">{banks.map((b) => (
          <div key={b.bank} className="sp-bank">
            <div className="sp-bank-top"><strong>{b.bank}</strong><Status tone={b.tone}>{b.tone === 'good' ? 'Working' : b.tone === 'warn' ? 'Some failing' : 'Many failing'}</Status></div>
            <p>{b.linked} linked · {b.failing.length} not connecting</p>
            {b.failing.length > 0 && <p className="sp-small">{b.failing.slice(0, 3).map((f, i) => <span key={f.c.id}>{i ? ', ' : ''}<Link to={`/support/customers/${f.c.id}`}>{f.c.name}</Link></span>)}{b.failing.length > 3 ? ` and ${b.failing.length - 3} more` : ''}</p>}
          </div>
        ))}</div>
      </section>
      <div className="sp-two">
        <section className="sp-card"><h2 className="sp-h3">Receipts and reminders sent, last 7 days</h2><BarChart bars={days} fmt={(v) => String(v)} label="Receipts and reminders sent per day, last 7 days" head={['Day', 'Sent']} /></section>
        <section className="sp-card"><h2 className="sp-h3">Automations this week</h2><HBars rows={autos} /></section>
      </div>
    </>
  );
}

export function Rules() {
  const s = useSupport();
  const byProv = live(s).reduce<Record<string, number>>((a, c) => ({ ...a, [c.province]: (a[c.province] ?? 0) + 1 }), {});
  return (
    <>
      <PageHead eyebrow="Platform" title="Province rules" sub={`Forms, notice periods and rent rules for each province and territory. Rules pack ${PACK_VERSION}.`} />
      <div className="sp-card tight table-scroll">
        <table className="ledger sp-table">
          <thead><tr><th>Province</th><th className="num">Landlords</th><th>Late rent</th><th>Rent increase</th><th>Lease</th><th>Status</th><th /></tr></thead>
          <tbody>{PROVINCES.map((p) => {
            const r = s.rules.find((x) => x.code === p.code)!;
            const forms = (k: 'late-rent' | 'rent-increase' | 'lease') => formsFor(p.code, k).map((f) => f.code).join(', ') || '—';
            return (
              <tr key={p.code}>
                <td><strong>{p.name}</strong><span className="sp-muted sp-block">{p.tribunal}{p.rentIncreaseGuidelinePct ? ` · ${p.rentIncreaseGuidelinePct}% guideline` : ''}</span></td>
                <td className="num">{byProv[p.code] ?? 0}</td>
                <td>{forms('late-rent')}</td><td>{forms('rent-increase')}</td><td>{forms('lease')}</td>
                <td><Status tone={r.status === 'verified' ? 'good' : 'warn'}>{r.status === 'verified' ? 'Verified' : 'Being checked'}</Status><span className="sp-muted sp-block">Last checked {fmtDate(r.lastChecked)}</span></td>
                <td><button className="btn small" onClick={() => sup((d) => { const x = d.rules.find((y) => y.code === p.code)!; x.status = 'verified'; x.lastChecked = d.today; }, { action: 'Province rules checked', detail: p.name }, `${p.name} marked as checked today.`)}>Checked today</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="sp-muted sp-small">Mark a province "checked" after comparing its forms and notice periods with the official source. Landlords see the date in Settings.</p>
    </>
  );
}

const WHERE: Record<Announcement['where'], string> = { website: 'Website', app: 'Landlord app', both: 'Both' };
export function Announcements() {
  const s = useSupport();
  const [text, setText] = useState('');
  const [where, setWhere] = useState<Announcement['where']>('app');
  const [tone, setTone] = useState<Announcement['tone']>('info');
  const add = () => {
    sup((d) => { d.announcements.unshift({ id: `an${Date.now()}`, text: text.trim(), where, tone, active: true, created: new Date().toISOString() }); }, { action: 'Announcement posted', detail: `${WHERE[where]}: ${text.trim().slice(0, 60)}` }, 'Posted. It shows right away.');
    setText('');
  };
  return (
    <>
      <PageHead eyebrow="Platform" title="Announcements" sub="A short message at the top of the website or the landlord app: maintenance, a new feature, a known problem." />
      <section className="sp-card sp-sec">
        <h2 className="sp-h3">New message</h2>
        <label className="field"><span className="label">Message</span><textarea className="input" rows={2} maxLength={160} value={text} onChange={(e) => setText(e.target.value)} placeholder="Bank checks for TD are paused for 30 minutes while TD updates its system." /><span className="hint">{160 - text.length} characters left. Keep it to one sentence.</span></label>
        <div className="sp-two tight">
          <div className="field"><span className="label">Show on</span><Seg label="Show on" value={where} onChange={setWhere} options={[{ id: 'app', label: 'Landlord app' }, { id: 'website', label: 'Website' }, { id: 'both', label: 'Both' }]} /></div>
          <div className="field"><span className="label">Kind</span><Seg label="Kind" value={tone} onChange={setTone} options={[{ id: 'info', label: 'News' }, { id: 'warning', label: 'Problem' }]} /></div>
        </div>
        {text.trim() && <div className={`announce ${tone} preview`}><Icon name={tone === 'warning' ? 'alert' : 'info'} size={16} /><span>{text}</span></div>}
        <button className="btn primary" disabled={!text.trim()} onClick={add}>Post message</button>
      </section>
      <section className="sp-card sp-sec"><h2 className="sp-h3">All messages</h2>
        {s.announcements.length === 0 ? <p className="sp-muted">None yet.</p> : (
          <ul className="sp-rows">{s.announcements.map((a) => (
            <li key={a.id}><span><strong>{a.text}</strong><span>{WHERE[a.where]} · {a.tone === 'warning' ? 'Problem' : 'News'} · {new Date(a.created).toLocaleString('en-CA', { month: 'short', day: 'numeric' })}</span></span>
              <span className="btn-row"><Status tone={a.active ? 'good' : 'off'}>{a.active ? 'Showing' : 'Hidden'}</Status>
                <button className="btn small" onClick={() => sup((d) => { const x = d.announcements.find((y) => y.id === a.id)!; x.active = !x.active; }, { action: a.active ? 'Announcement hidden' : 'Announcement shown', detail: a.text.slice(0, 60) }, a.active ? 'Hidden.' : 'Showing again.')}>{a.active ? 'Hide' : 'Show'}</button>
                <button className="btn small ghost" aria-label="Delete message" onClick={() => sup((d) => { d.announcements = d.announcements.filter((y) => y.id !== a.id); }, { action: 'Announcement deleted', detail: a.text.slice(0, 60) }, 'Deleted.')}><Icon name="trash" size={14} /></button></span></li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
