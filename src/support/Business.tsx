import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Province } from '../data/types';
import { PageHead, Tile, weekly } from '../screens/Support';
import { addDays, daysBetween, fmtDate } from '../lib/dates';
import { province } from '../lib/jurisdiction';
import { C, HBars, LineChart, Status } from './charts';
import { customerOf, fmtMoney, live, mrr, sup, useSupport, within } from './store';

const monthLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleString('en-CA', { month: 'short', year: '2-digit' });

export function Revenue() {
  const s = useSupport();
  const cs = live(s);
  const [filter, setFilter] = useState<'all' | 'failed' | 'refunded'>('all');
  const total = cs.reduce((a, c) => a + mrr(c), 0);
  const paying = cs.filter((c) => c.plan === 'landlord');
  const failed = cs.filter((c) => c.paymentStatus === 'failed');
  // Monthly revenue at the end of each of the last 12 months: every paying account that had signed up by then.
  const months = Array.from({ length: 12 }, (_, i) => {
    const end = addDays(s.today, -30 * (11 - i));
    return { label: monthLabel(end), value: cs.filter((c) => c.signedUp <= addDays(end, -30)).reduce((a, c) => a + mrr(c), 0) };
  });
  const free = cs.filter((c) => c.trialEnds && c.trialEnds >= s.today).length;
  const invoices = s.invoices.filter((i) => filter === 'all' || i.status === filter).slice(0, 40);
  return (
    <>
      <PageHead eyebrow="Business" title="Revenue" sub="Paid: $8 per unit a month · Free: 1 unit" />
      <div className="sp-tiles">
        <Tile label="Monthly revenue" value={fmtMoney(total)} spark={months.map((m) => m.value)} />
        <Tile label="Paying accounts" value={String(paying.length)} note={`${free} on trial`} />
        <Tile label="Average per account" value={fmtMoney(paying.length ? total / paying.length : 0, 2)} />
        <Tile label="Failed payments" value={String(failed.length)} note={failed.length ? fmtMoney(failed.reduce((a, c) => a + mrr(c), 0)) + ' at risk' : 'None'} />
      </div>
      <div className="sp-two">
        <section className="sp-card"><h2 className="sp-h3">Monthly revenue · 12 months</h2>
          <LineChart points={months} fmt={(v) => fmtMoney(v)} label="Monthly revenue over the last 12 months" head={['Month', 'Monthly revenue']} /></section>
        <section className="sp-card"><h2 className="sp-h3">Plans</h2>
          <HBars rows={[
            { label: 'Paid', value: paying.length - free },
            { label: 'Paid, on trial', value: free },
            { label: 'Free (1 unit)', value: cs.length - paying.length },
          ]} />
        </section>
      </div>
      {failed.length > 0 && (
        <section className="sp-card sp-sec"><h2 className="sp-h3">Failed payments</h2>
          <ul className="sp-rows">{failed.map((c) => (
            <li key={c.id}><Link to={`/support/customers/${c.id}`}><strong>{c.name}</strong><span>{fmtMoney(mrr(c), 2)} · {c.units} units</span></Link>
              <span className="btn-row"><button className="btn small primary" onClick={() => sup((d) => { d.customers.find((x) => x.id === c.id)!.paymentStatus = 'ok'; const inv = d.invoices.find((i) => i.customerId === c.id && i.status === 'failed'); if (inv) inv.status = 'paid'; }, { action: 'Payment retried', detail: c.name }, `${c.name.split(' ')[0]}'s payment went through`)}>Retry payment</button>
                <button className="btn small" onClick={() => sup(() => undefined, { action: 'Card update email sent', detail: c.email }, 'Card update request sent')}>Ask for new card</button></span></li>
          ))}</ul>
        </section>
      )}
      <section className="sp-card sp-sec">
        <div className="sp-card-head"><h2 className="sp-h3">Invoices</h2>
          <div className="seg" role="group" aria-label="Show">{(['all', 'failed', 'refunded'] as const).map((k) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'all' ? 'Recent' : k === 'failed' ? 'Failed' : 'Refunded'}</button>)}</div></div>
        <div className="table-scroll"><table className="ledger"><thead><tr><th>Date</th><th>Landlord</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{invoices.map((i) => { const c = customerOf(s, i.customerId); return (
            <tr key={i.id}><td className="date">{fmtDate(i.date)}</td><td>{c ? <Link to={`/support/customers/${c.id}`}>{c.name}</Link> : 'Deleted'}</td><td className="num">{fmtMoney(i.amount, 2)}</td>
              <td><Status tone={i.status === 'paid' ? 'good' : i.status === 'failed' ? 'bad' : 'off'}>{i.status === 'paid' ? 'Paid' : i.status === 'failed' ? 'Failed' : 'Refunded'}</Status></td>
              <td>{i.status === 'paid' && <button className="btn small ghost" onClick={() => sup((d) => { d.invoices.find((x) => x.id === i.id)!.status = 'refunded'; }, { action: 'Refund issued', detail: `${fmtMoney(i.amount, 2)} to ${c?.name ?? ''}` }, `Refunded ${fmtMoney(i.amount, 2)}`)}>Refund</button>}</td></tr>
          ); })}</tbody></table></div>
        {invoices.length === 0 && <p className="sp-muted">None</p>}
      </section>
    </>
  );
}

const TILES: [Province, number, number][] = [
  ['YT', 1, 1], ['NT', 2, 1], ['NU', 3, 1],
  ['BC', 1, 2], ['AB', 2, 2], ['SK', 3, 2], ['MB', 4, 2], ['ON', 5, 2], ['QC', 6, 2], ['NL', 7, 2],
  ['NB', 6, 3], ['PE', 7, 3], ['NS', 7, 4],
];
// One hue, light to dark, for "how many landlords".
const STEPS = ['#F4F3FF', '#DAD7FE', '#B4ADFB', '#8379F2', '#4F46E5'];

export function Growth() {
  const s = useSupport();
  const cs = live(s);
  const t = s.today;
  const recent = cs.filter((c) => within(c.signedUp, t, 30));
  const n = recent.length;
  const prop = Math.round(n * 0.86), tenant = Math.min(prop, recent.filter((c) => c.tenants > 0).length - Math.round(n * 0.12)), bank = Math.min(tenant, recent.filter((c) => c.banks.length > 0).length - Math.round(n * 0.1));
  const visits = n * 14, started = Math.round(n * 1.9), finished = Math.round(n * 1.25);
  const funnel = [
    { label: 'Visited', value: visits },
    { label: 'Started signup', value: started },
    { label: 'Finished questions', value: finished },
    { label: 'Created account', value: n },
    { label: 'Added property', value: prop },
    { label: 'Added tenant', value: Math.max(0, tenant) },
    { label: 'Connected bank', value: Math.max(0, bank) },
  ].map((r, i, all) => ({ ...r, sub: i ? `· ${Math.round((r.value / all[i - 1].value) * 100)}%` : undefined }));
  const qs = ['Where is your rental?', 'What are you renting out?', 'How do tenants pay?', 'Hardest part', 'Taxes', 'Main goal'];
  const drop = qs.map((q, i) => ({ label: `${i + 1}. ${q}`, value: Math.round(started - ((started - finished) * Math.pow(i + 1, 1.3)) / Math.pow(6, 1.3)) }));
  const sources = Object.entries(cs.reduce<Record<string, number>>((a, c) => ({ ...a, [c.source]: (a[c.source] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const byProv = cs.reduce<Record<string, number>>((a, c) => ({ ...a, [c.province]: (a[c.province] ?? 0) + 1 }), {});
  const maxP = Math.max(...Object.values(byProv));
  const step = (v: number) => (v ? STEPS[Math.min(4, Math.ceil((v / maxP) * 4))] : STEPS[0]);
  const days = Array.from({ length: 90 }, (_, i) => { const d = addDays(t, -(89 - i)); return { label: fmtDate(d).replace(/, \d{4}$/, ''), value: cs.filter((c) => c.signedUp === d).length }; });
  const weeks = weekly(cs.map((c) => c.signedUp), t);
  const prev = cs.filter((c) => daysBetween(c.signedUp, t) >= 30 && daysBetween(c.signedUp, t) < 60).length;
  return (
    <>
      <PageHead eyebrow="Business" title="Growth" sub="Where landlords come from, and where they drop off" />
      <div className="sp-tiles">
        <Tile label="Signups · 30 days" value={String(n)} delta={prev ? ((n - prev) / prev) * 100 : 0} spark={weeks.map((w) => w.value)} />
        <Tile label="Visitors who sign up" value={`${((n / visits) * 100).toFixed(1)}%`} />
        <Tile label="Finished setup" value={`${Math.round((Math.max(0, tenant) / Math.max(1, n)) * 100)}%`} note="Property and tenant added" />
        <Tile label="Connected a bank" value={`${Math.round((Math.max(0, bank) / Math.max(1, n)) * 100)}%`} />
      </div>
      <section className="sp-card sp-sec"><h2 className="sp-h3">Signups per day · 90 days</h2>
        <LineChart points={days} fmt={(v) => String(v)} label="New signups per day over the last 90 days" head={['Day', 'Signups']} /></section>
      <div className="sp-two">
        <section className="sp-card"><h2 className="sp-h3">Visit to setup · 30 days</h2><HBars rows={funnel} /></section>
        <section className="sp-card"><h2 className="sp-h3">Signup drop-off by question</h2><HBars rows={drop} color={C.second} /></section>
      </div>
      <div className="sp-two">
        <section className="sp-card"><h2 className="sp-h3">How they found us</h2><HBars rows={sources} /></section>
        <section className="sp-card"><h2 className="sp-h3">By province</h2>
          <div className="sp-map" role="img" aria-label="Landlords by province">{TILES.map(([p, col, row]) => (
            <div key={p} className="sp-map-tile" style={{ gridColumn: col, gridRow: row, background: step(byProv[p] ?? 0), color: (byProv[p] ?? 0) / maxP > 0.55 ? '#fff' : C.ink }} title={`${province(p).name}: ${byProv[p] ?? 0}`}>
              <strong>{p}</strong><span>{byProv[p] ?? 0}</span></div>
          ))}</div>
          <div className="sp-scale" aria-hidden><span>Fewer</span>{STEPS.map((c) => <i key={c} style={{ background: c }} />)}<span>More</span></div>
        </section>
      </div>
    </>
  );
}
