import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { Brand } from '../components/Brand';
import { Icon } from '../components/Icon';
import { addDays, daysBetween, fmtDate } from '../lib/dates';
import { BarChart, Spark } from '../support/charts';
import { customerOf, fmtMoney, isLive, isSuper, live, loadLive, mrr, timeLeft, useSupport, useSupportToasts, within, type SupportState } from '../support/store';
import { isStaff, useConn } from '../data/api';
import { Inbox, TicketPage } from '../support/Inbox';
import { CustomerPage, Customers } from '../support/Customers';
import { Growth, Revenue } from '../support/Business';
import { Announcements, Health, Rules } from '../support/Platform';
import { Privacy, Team } from '../support/Admin';
import { Banks, Connections, Pricing } from '../support/Super';
import { LandlordMap } from '../support/LandlordMap';

// The support dashboard. Grouped by how often it is used: Today, Support, Business, Platform, Admin.
// admin / admin shows sample support data; a real team member signed in to the Keyholder server sees
// live data (the same screens, filled by the server).

const NAV: { group: string; only?: (s: SupportState) => boolean; items: { to: string; label: string; icon: string; badge?: (s: SupportState) => number }[] }[] = [
  { group: 'Today', items: [{ to: '/support', label: 'Overview', icon: 'home' }] },
  { group: 'Support', items: [
    { to: '/support/inbox', label: 'Inbox', icon: 'mail', badge: (s) => s.tickets.filter((t) => t.status === 'open').length },
    { to: '/support/customers', label: 'Customers', icon: 'users' },
  ] },
  { group: 'Business', items: [
    { to: '/support/revenue', label: 'Revenue', icon: 'cash' },
    { to: '/support/growth', label: 'Growth', icon: 'trend' },
  ] },
  { group: 'Platform', items: [
    { to: '/support/health', label: 'System health', icon: 'bolt', badge: (s) => s.errors.length },
    { to: '/support/rules', label: 'Province rules', icon: 'map' },
    { to: '/support/announcements', label: 'Announcements', icon: 'bell' },
  ] },
  { group: 'Admin', items: [
    { to: '/support/privacy', label: 'Privacy & audit', icon: 'shield', badge: (s) => s.requests.filter((r) => r.status === 'to do').length },
    { to: '/support/team', label: 'Team & settings', icon: 'settings' },
  ] },
  // The super user's own pages (the ADMIN_EMAIL account; admin / admin in the preview).
  { group: 'Super user', only: isSuper, items: [
    { to: '/support/pricing', label: 'Price & promotions', icon: 'cash' },
    { to: '/support/banks', label: 'Banks', icon: 'bank' },
    { to: '/support/connections', label: 'Connections', icon: 'key' },
  ] },
];

export function Support() {
  const { user } = useConn();
  const staff = isStaff(user);
  const [ready, setReady] = useState(!staff);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!staff) return;
    loadLive().then(() => setReady(true)).catch((e) => setErr((e as Error).message));
  }, [staff]);
  if (!ready) return <div className="sp-loading" role="status">{err ? <><p>{err}</p><button className="btn" onClick={() => window.location.reload()}>Try again</button></> : <p>Loading the support dashboard…</p>}</div>;
  return <SupportShell />;
}

function SupportShell() {
  const s = useSupport();
  const { act } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const toasts = useSupportToasts();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => { document.title = 'Support · Keyholder'; }, []);
  return (
    <div className="sp">
      <aside className="sp-rail" aria-label="Support">
        <Link to="/support" className="sp-brand"><Brand size={26} /><span className="sp-badge-admin">Support</span></Link>
        <nav className="sp-nav">
          {NAV.filter((g) => !g.only || g.only(s)).map((g) => (
            <div key={g.group} className="sp-nav-group">
              <p>{g.group}</p>
              {g.items.map((i) => {
                const n = i.badge?.(s) ?? 0;
                return <NavLink key={i.to} to={i.to} end={i.to === '/support'} className={({ isActive }) => `sp-nav-link${isActive ? ' on' : ''}`}><Icon name={i.icon} size={18} />{i.label}{n > 0 && <span className="sp-count">{n}</span>}</NavLink>;
              })}
            </div>
          ))}
        </nav>
        <div className="sp-rail-foot">
          <button className="btn sp-signout" onClick={() => { act.signOut(); nav('/welcome'); }}><Icon name="logout" size={18} />Sign out</button>
        </div>
      </aside>
      <div className="sp-main">
        <header className="sp-top">
          <Search />
          {isLive() ? <span className="sp-sample live" title="Real accounts on this Keyholder server">Live data</span> : <span className="sp-sample" title="Preview: sign in with a real team account to see live data">Sample data</span>}
        </header>
        <main className="sp-page">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/inbox/:id" element={<TicketPage />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerPage />} />
            <Route path="/revenue" element={<Revenue />} />
            <Route path="/growth" element={<Growth />} />
            <Route path="/health" element={<Health />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/team" element={<Team />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/banks" element={<Banks />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="*" element={<Navigate to="/support" replace />} />
          </Routes>
        </main>
      </div>
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}>{t.text}</div>)}</div>
    </div>
  );
}

/** Find a customer (name or email) or a support request (number or subject) from anywhere. */
function Search() {
  const s = useSupport();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const term = q.trim().toLowerCase();
  const res = useMemo(() => {
    if (term.length < 2) return [];
    const cs = live(s).filter((c) => c.name.toLowerCase().includes(term) || c.email.includes(term)).slice(0, 5).map((c) => ({ to: `/support/customers/${c.id}`, title: c.name, sub: `${c.email} · ${c.city}`, icon: 'user' }));
    const ts = s.tickets.filter((t) => t.id.toLowerCase().includes(term) || t.subject.toLowerCase().includes(term)).slice(0, 4).map((t) => ({ to: `/support/inbox/${t.id}`, title: t.subject, sub: `${t.id} · ${customerOf(s, t.customerId)?.name ?? ''}`, icon: 'mail' }));
    return [...cs, ...ts];
  }, [s, term]);
  useEffect(() => { const k = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', k); return () => document.removeEventListener('mousedown', k); }, []);
  const go = (to: string) => { setOpen(false); setQ(''); nav(to); };
  return (
    <div className="sp-search" ref={box}>
      <Icon name="search" size={16} />
      <label htmlFor="sp-q" className="sr-only">Search customers and support requests</label>
      <input id="sp-q" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) go(res[0].to); if (e.key === 'Escape') setOpen(false); }} placeholder="Search customers or requests" autoComplete="off" />
      {open && term.length >= 2 && (
        <ul className="sp-search-res" role="listbox">
          {res.length ? res.map((r) => <li key={r.to}><button onClick={() => go(r.to)}><Icon name={r.icon} size={16} /><span><strong>{r.title}</strong><span>{r.sub}</span></span></button></li>) : <li className="sp-none">Nothing found for "{q}".</li>}
        </ul>
      )}
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="sp-head">
      <div><p className="sp-eyebrow">{eyebrow}</p><h1>{title}</h1>{sub && <p className="sp-sub">{sub}</p>}</div>
      {children && <div className="btn-row">{children}</div>}
    </div>
  );
}

/** A number tile: the figure, how it changed, and a small trend. */
export function Tile({ label, value, delta, good = true, spark, note }: { label: string; value: string; delta?: number; good?: boolean; spark?: number[]; note?: string }) {
  const up = (delta ?? 0) >= 0;
  const tone = delta === undefined ? '' : up === good ? 'pos' : 'neg';
  return (
    <div className="sp-tile">
      <p className="sp-tile-k">{label}</p>
      <div className="sp-tile-v"><strong>{value}</strong>{spark && <Spark values={spark} />}</div>
      {delta !== undefined && <p className={`sp-delta ${tone}`}>{up ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% <span>vs last 30 days</span></p>}
      {note && <p className="sp-tile-note">{note}</p>}
    </div>
  );
}

const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
/** Counts per week for the last n weeks, oldest first. */
export function weekly(dates: string[], today: string, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const end = addDays(today, -7 * (n - 1 - i)), start = addDays(end, -6);
    return { label: fmtDate(start).replace(/, \d{4}$/, ''), value: dates.filter((d) => d >= start && d <= end).length };
  });
}

function Overview() {
  const s = useSupport();
  const cs = live(s);
  const t = s.today;
  const new30 = cs.filter((c) => within(c.signedUp, t, 30)).length;
  const prev30 = cs.filter((c) => daysBetween(c.signedUp, t) >= 30 && daysBetween(c.signedUp, t) < 60).length;
  const active = cs.filter((c) => within(c.lastActive, t, 30)).length;
  const paying = cs.filter((c) => c.plan === 'landlord');
  const revenue = cs.reduce((a, c) => a + mrr(c), 0);
  const prevRevenue = cs.filter((c) => daysBetween(c.signedUp, t) >= 30).reduce((a, c) => a + mrr(c), 0);
  const units = cs.reduce((a, c) => a + c.units, 0);
  const open = s.tickets.filter((x) => x.status === 'open');
  const overdue = open.filter((x) => timeLeft(s, x).overdue);
  const failingBanks = cs.filter((c) => c.banks.some((b) => b.status === 'failing'));
  const failedPay = cs.filter((c) => c.paymentStatus === 'failed');
  const dueRequests = s.requests.filter((r) => r.status === 'to do' && daysBetween(t, addDays(r.received, 30)) <= 7);
  const bounces = cs.filter((c) => c.emailBounces > 0);
  const weeks = weekly(cs.map((c) => c.signedUp), t);
  const needs = [
    { n: overdue.length, icon: 'clock', tone: 'rose', text: `${overdue.length} request${overdue.length === 1 ? '' : 's'} overdue`, to: '/support/inbox', btn: 'Inbox' },
    { n: open.filter((x) => x.priority === 'urgent').length, icon: 'alert', tone: 'peach', text: `${open.filter((x) => x.priority === 'urgent').length} urgent`, to: '/support/inbox', btn: 'Answer' },
    { n: failingBanks.length, icon: 'bank', tone: 'sun', text: `${failingBanks.length} bank link${failingBanks.length === 1 ? '' : 's'} down`, to: '/support/health', btn: 'Banks' },
    { n: failedPay.length, icon: 'cash', tone: 'peach', text: `${failedPay.length} failed payment${failedPay.length === 1 ? '' : 's'} · ${fmtMoney(failedPay.reduce((a, c) => a + mrr(c), 0))}`, to: '/support/revenue', btn: 'Review' },
    { n: dueRequests.length, icon: 'shield', tone: 'lilac', text: `${dueRequests.length} privacy request${dueRequests.length === 1 ? '' : 's'} due this week`, to: '/support/privacy', btn: 'Handle' },
    { n: bounces.length, icon: 'mail', tone: 'sky', text: `${bounces.length} bounced email${bounces.length === 1 ? '' : 's'}`, to: '/support/health', btn: 'Emails' },
  ].filter((x) => x.n > 0);
  return (
    <>
      <PageHead eyebrow="Today" title="Overview" sub={fmtDate(t)} />
      {/* Top row, half and half: what needs the team now, and where the landlords are. */}
      <div className="sp-two sp-top-row">
        <section className="sp-card sp-needs-card" aria-labelledby="needs">
          <h2 id="needs" className="sp-h3">Needs you now</h2>
          {needs.length ? (
            <ul className="sp-needs">{needs.map((x) => (
              <li key={x.text}><span className={`tile-ic ${x.tone}`} aria-hidden><Icon name={x.icon} size={18} /></span><span>{x.text}</span><Link className="btn small" to={x.to}>{x.btn}</Link></li>
            ))}</ul>
          ) : (
            <div className="sp-allclear" role="status"><span className="tile-ic mint" aria-hidden><Icon name="check" size={22} /></span><strong>All clear</strong><span>Nothing needs you right now.</span></div>
          )}
        </section>
        <section className="sp-card" aria-labelledby="map">
          <h2 id="map" className="sp-h3">Where your landlords are</h2>
          <LandlordMap customers={cs} />
        </section>
      </div>
      <section className="sp-sec" aria-labelledby="nums">
        <h2 id="nums" className="sp-h2">Last 30 days</h2>
        <div className="sp-tiles four">
          <Tile label="New signups" value={String(new30)} delta={pct(new30, prev30)} spark={weeks.map((w) => w.value)} />
          <Tile label="Active landlords" value={String(active)} note={`of ${cs.length} · ${units.toLocaleString('en-CA')} units`} />
          <Tile label="Monthly revenue" value={fmtMoney(revenue)} delta={pct(revenue, prevRevenue)} note={`${paying.length} paying`} />
          <Tile label="Open requests" value={String(open.length)} note={overdue.length ? `${overdue.length} overdue` : 'None overdue'} good={false} />
        </div>
      </section>
      <div className="sp-two">
        <section className="sp-card" aria-labelledby="sg">
          <h2 id="sg" className="sp-h3">Signups per week</h2>
          <BarChart bars={weeks} fmt={(v) => String(v)} label="New signups per week for the last 12 weeks" head={['Week of', 'Signups']} />
        </section>
        <section className="sp-card" aria-labelledby="recent">
          <h2 id="recent" className="sp-h3">Newest landlords</h2>
          <ul className="sp-list">{cs.slice(0, 5).map((c) => (
            <li key={c.id}><Link to={`/support/customers/${c.id}`}><strong>{c.name}</strong><span>{c.city}, {c.province} · {c.units} unit{c.units > 1 ? 's' : ''} · {c.plan === 'landlord' ? 'Paid' : 'Free'}</span></Link><span className="sp-when">{daysBetween(c.signedUp, t) === 0 ? 'Today' : `${daysBetween(c.signedUp, t)}d ago`}</span></li>
          ))}</ul>
          <Link className="sp-more" to="/support/customers">All customers</Link>
        </section>
      </div>
      <section className="sp-card sp-sec" aria-labelledby="act">
        <h2 id="act" className="sp-h3">Recent admin actions</h2>
        <ul className="sp-list">{s.audit.slice(0, 5).map((a) => <li key={a.id}><span><strong>{a.action}</strong><span>{a.detail} · {a.who}</span></span><span className="sp-when">{new Date(a.at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></li>)}</ul>
        <Link className="sp-more" to="/support/privacy">Audit log</Link>
      </section>
    </>
  );
}
