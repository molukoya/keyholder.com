import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppState } from '../data/types';
import { useStore } from '../data/store';
import { Icon } from './Icon';
import { SceneCelebrate } from './Art';
import { currentLeases, leaseLedger, picture } from '../lib/finance';
import { addDays, addMonths, addPeriods, daysBetween, fmtPeriod, periodOf } from '../lib/dates';
import { fmt0 } from '../lib/money';
import { allJourneyCards, isHidden, prefKey } from '../lib/journey';
import { earliestIncrease } from '../lib/notices';
import { trayItems } from '../lib/tray';
import { StepButton } from './Journey';

// Home, organised around "this month": one answer per card, details one tap away.

/** "Good morning, Alex" with today's date. */
export function Greeting() {
  const { state, today } = useStore();
  const h = new Date().getHours();
  const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = state.profile.name?.split(' ')[0];
  return (
    <div className="greet">
      <p className="greet-date">{new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${today}T12:00:00`))}</p>
      <h2 className="greet-hi">{hello}{first ? `, ${first}` : ''}</h2>
    </div>
  );
}

function monthRent(state: AppState, today: string) {
  const p = periodOf(today);
  // Payments Keyholder found but the owner has not confirmed yet are "to confirm", not late.
  const pending = new Set(trayItems(state, today).flatMap((t) => (t.kind === 'match' && t.suggestion ? [t.suggestion.leaseId] : [])));
  let expected = 0, collected = 0, paid = 0, late = 0, due = 0, confirm = 0, dueDate = '';
  for (const l of currentLeases(state, today)) {
    const u = state.units.find((x) => x.id === l.unitId);
    if (!u || !state.properties.some((x) => x.id === u.propertyId && !x.archived)) continue;
    const line = leaseLedger(l, state.payments, today).find((x) => x.period === p); if (!line) continue;
    expected += line.charge; collected += Math.min(line.paid, line.charge);
    if (line.state === 'paid') paid++; else if (pending.has(l.id)) confirm++; else if (line.daysLate > 0) late++; else due++;
    if (!dueDate || line.due < dueDate) dueDate = line.due;
  }
  return { expected, collected, paid, late, due, confirm, dueDate, period: p };
}

/** The one number landlords check: how much of this month's rent is in. */
export function RentCard({ headline }: { headline: React.ReactNode }) {
  const { state, today } = useStore();
  const m = useMemo(() => monthRent(state, today), [state, today]);
  const pctIn = m.expected ? Math.round((m.collected / m.expected) * 100) : 0;
  const allIn = m.expected > 0 && m.collected >= m.expected;
  return (
    <section className={`rent-card${allIn ? ' all-in-card' : ''}`} aria-label={`Rent for ${fmtPeriod(m.period)}`}>
      <div className="rent-card-main">
        <p className="rent-card-k">Rent for {fmtPeriod(m.period)}</p>
        <p className="pulse">{headline}</p>
        <div className="rent-meter" role="img" aria-label={`${fmt0(m.collected)} of ${fmt0(m.expected)} collected`}>
          <div className="rent-meter-nums"><strong>{fmt0(m.collected)}</strong><span>of {fmt0(m.expected)} collected</span></div>
          <div className="rent-bar"><i style={{ width: `${pctIn}%` }} /></div>
        </div>
      </div>
      {allIn && <div className="rent-card-art" aria-hidden><SceneCelebrate /></div>}
    </section>
  );
}

/** The single most important thing to do right now. */
export function NextStep() {
  const { state, today } = useStore();
  const card = useMemo(() => allJourneyCards(state, today).filter((c) => !isHidden(state, prefKey(c), today)).sort((a, b) => a.priority - b.priority)[0], [state, today]);
  if (!card) return (
    <section className="next-card done">
      <span className="tile-ic mint big"><Icon name="check" size={24} /></span>
      <div><p className="next-k">All caught up</p><h3>Nothing needs you right now.</h3></div>
    </section>
  );
  return (
    <section className={`next-card${card.urgent ? ' urgent' : ''}`}>
      <span className={`tile-ic big ${card.urgent ? 'rose' : 'lilac'}`}><Icon name={card.urgent ? 'bell' : 'sparkle'} size={24} /></span>
      <div className="next-body">
        <p className="next-k">Your next step</p>
        <h3>{card.title.split(' & ').map((n) => n.split(' ')[0]).join(' & ')}</h3>
        <p className="next-text">{card.text}</p>
      </div>
      <div className="next-act"><StepButton c={card} /></div>
    </section>
  );
}

/** Four things people do most. */
export function QuickActions({ onPay, onReceipt }: { onPay: () => void; onReceipt: () => void }) {
  const nav = useNavigate();
  const items: [string, string, string, () => void][] = [
    ['cash', 'Mark rent paid', 'mint', onPay],
    ['camera', 'Add a receipt', 'peach', onReceipt],
    ['home', 'Add a property', 'sky', () => nav('/rentals')],
    ['print', 'Tax summary', 'sun', () => nav('/taxes')],
  ];
  return (
    <section className="side-card" aria-label="Quick actions">
      <h2 className="side-title">Quick actions</h2>
      <div className="quick-grid">
        {items.map(([ic, label, tone, run]) => <button key={label} className="quick" onClick={run}><span className={`tile-ic ${tone}`}><Icon name={ic} size={20} /></span>{label}</button>)}
      </div>
    </section>
  );
}

type Ev = { date: string; title: string; sub: string; icon: string; tone: string; to?: string };
const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
function upcoming(state: AppState, today: string): Ev[] {
  const out: Ev[] = [];
  const horizon = addDays(today, 120);
  const rent = new Map<string, { who: string[]; total: number; ids: string[] }>();
  const raise = new Map<string, string[]>();
  const running = new Set(currentLeases(state, today).map((l) => l.id));
  for (const l of state.leases) {
    if (l.end && l.end < today) continue;
    if (!running.has(l.id)) continue;
    const t = state.tenants.find((x) => x.id === l.tenantId); const name = t?.names[0].split(' ')[0] ?? 'Tenant';
    const next = leaseLedger(l, state.payments, today, addPeriods(periodOf(today), 1)).find((x) => x.due >= today && x.state !== 'paid');
    if (next) { const g = rent.get(next.due) ?? { who: [], total: 0, ids: [] }; g.who.push(name); g.total += next.charge - next.paid; g.ids.push(l.tenantId); rent.set(next.due, g); }
    if (l.end && l.end <= horizon) out.push({ date: l.end, title: `${name}'s lease ends`, sub: 'Renew or plan the move-out', icon: 'calendar', tone: 'sky', to: `/rent/tenant/${l.tenantId}` });
    const inc = earliestIncrease(state, l, today);
    if (inc <= horizon) raise.set(inc, [...(raise.get(inc) ?? []), name]);
  }
  for (const [date, g] of rent) out.push({ date, title: `Rent due from ${names(g.who)}`, sub: fmt0(g.total), icon: 'cash', tone: 'mint', to: g.ids.length === 1 ? `/rent/tenant/${g.ids[0]}` : '/rentals' });
  for (const [date, who] of raise) out.push({ date, title: `Rent increase possible for ${names(who)}`, sub: 'From this date, with written notice', icon: 'trend', tone: 'lilac', to: '/rentals' });
  for (const m of state.mortgages) {
    if (m.termEnd >= today && m.termEnd <= addDays(today, 200)) {
      const p = state.properties.find((x) => x.id === m.propertyId);
      out.push({ date: m.termEnd, title: `${p?.nickname ?? 'Mortgage'} mortgage renews`, sub: `${m.lender} · compare rates early`, icon: 'bank', tone: 'peach', to: `/rent/property/${m.propertyId}/mortgage` });
    }
  }
  const y = Number(today.slice(0, 4)); const tax = `${today >= `${y}-04-30` ? y + 1 : y}-04-30`;
  out.push({ date: tax, title: 'Tax return due', sub: 'Your rental numbers are ready in Taxes', icon: 'print', tone: 'sun', to: '/taxes' });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 5);
}

/** What's coming in the next few months. */
export function ComingUp() {
  const { state, today } = useStore();
  const evs = useMemo(() => upcoming(state, today), [state, today]);
  return (
    <section className="side-card" aria-label="Coming up">
      <h2 className="side-title">Coming up</h2>
      <ul className="timeline">
        {evs.map((e, i) => {
          const d = new Date(`${e.date}T12:00:00`);
          const inDays = daysBetween(today, e.date);
          const body = (
            <>
              <span className="tl-date"><b>{new Intl.DateTimeFormat('en-CA', { month: 'short' }).format(d)}</b>{d.getDate()}</span>
              <span className={`tile-ic sm ${e.tone}`}><Icon name={e.icon} size={16} /></span>
              <span className="tl-text"><strong>{e.title}</strong><span>{e.sub}{inDays >= 0 && inDays <= 14 ? ` · in ${inDays === 0 ? 'today' : `${inDays} day${inDays === 1 ? '' : 's'}`}` : ''}</span></span>
            </>
          );
          return <li key={`${e.date}-${i}`}>{e.to ? <Link to={e.to}>{body}</Link> : <div>{body}</div>}</li>;
        })}
      </ul>
    </section>
  );
}

/** Last month at a glance, compared with the month before: a reason to come back each month. */
export function MonthReview() {
  const { state, today } = useStore();
  const r = useMemo(() => {
    const first = `${periodOf(today)}-01`;
    const last1 = addDays(first, -1), from1 = `${periodOf(last1)}-01`;
    const last2 = addDays(from1, -1), from2 = `${periodOf(last2)}-01`;
    return { p: picture(state, from1, last1), prev: picture(state, from2, last2), label: fmtPeriod(periodOf(last1)) };
  }, [state, today]);
  if (!r.p.rentExpected && !r.p.opex) return null;
  const diff = r.p.kept - r.prev.kept;
  return (
    <section className="side-card" aria-label={`${r.label} in review`}>
      <h2 className="side-title">{r.label.split(' ')[0]} in review</h2>
      <div className="review-grid">
        <div><span>Rent in</span><strong>{fmt0(r.p.rentCollected)}</strong></div>
        <div><span>Costs</span><strong>{fmt0(r.p.opex)}</strong></div>
        <div className="kept"><span>You kept</span><strong>{fmt0(r.p.kept)}</strong></div>
      </div>
      {r.prev.rentExpected > 0 && <p className={`review-diff ${diff >= 0 ? 'up' : 'down'}`}><Icon name="trend" size={16} />{diff >= 0 ? `${fmt0(diff)} more than the month before` : `${fmt0(-diff)} less than the month before`}</p>}
      <Link className="side-link" to="/portfolio/cash-flow">See the full picture<Icon name="next" size={16} /></Link>
    </section>
  );
}

/** Small milestones that build the habit. */
export function Milestones() {
  const { state, today } = useStore();
  const items = useMemo(() => {
    const sent = state.receipts.filter((r) => r.status === 'sent').length;
    const months = new Set(state.payments.map((p) => p.period)).size;
    const tenure = state.properties.length ? Math.max(...state.properties.map((p) => (p.purchaseDate ? daysBetween(p.purchaseDate, today) : 0))) : 0;
    return [
      { icon: 'receipt', label: 'First receipt sent', done: sent > 0, tone: 'mint' },
      { icon: 'camera', label: '10 costs saved', done: state.expenses.length >= 10, tone: 'peach' },
      { icon: 'calendar', label: '3 months of rent tracked', done: months >= 3, tone: 'sky' },
      { icon: 'star', label: 'A year with your rental', done: tenure >= 365 || addMonths(today, -12) >= (state.leases.map((l) => l.start).sort()[0] ?? today), tone: 'sun' },
    ];
  }, [state, today]);
  const n = items.filter((i) => i.done).length;
  return (
    <section className="side-card" aria-label="Milestones">
      <h2 className="side-title">Milestones <span className="side-count">{n} of {items.length}</span></h2>
      <ul className="badges">{items.map((i) => <li key={i.label} className={i.done ? 'on' : ''}><span className={`tile-ic sm ${i.done ? i.tone : 'off'}`}><Icon name={i.done ? i.icon : 'lock'} size={16} /></span>{i.label}</li>)}</ul>
    </section>
  );
}
