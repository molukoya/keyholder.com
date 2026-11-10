import { PageSub } from '../components/Guide';
import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { addDays, fmtDate, yearOf } from '../lib/dates';
import { netWorthHistory, portfolio, worthIt } from '../lib/finance';
import { fmt0, fmtShort } from '../lib/money';
import { PropertyCard } from '../components/levels';
import { PropertyForm } from '../components/forms';
import { Empty, Figure } from '../components/ui';
import { ThePicture } from './Money';
import { portfolioReturn } from '../lib/silver';
import { SceneEmptyHome } from '../components/Art';
import { Icon } from '../components/Icon';

// Portfolio: what you own and whether it is working, at a glance.

export function Portfolio() {
  const { tab = 'overview' } = useParams();
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="title-ic"><span className="tile-ic lilac" aria-hidden><Icon name="chart" size={22} /></span>Portfolio</h1><PageSub>Value, earnings, and how they compare with a GIC</PageSub></div></div>
      <nav className="tabs" aria-label="Portfolio sections">
        <NavLink end to="/portfolio" className={tab === 'overview' ? 'active' : ''}>Overview</NavLink>
        <NavLink to="/portfolio/cash-flow">Cash flow</NavLink>
      </nav>
      {tab === 'cash-flow' ? <ThePicture /> : <Overview />}
    </div>
  );
}

function Overview() {
  const { state, today } = useStore();
  const [addProp, setAddProp] = useState(false);
  const [table, setTable] = useState(false);
  const pf = useMemo(() => portfolio(state, today), [state, today]);
  const w = useMemo(() => worthIt(state, today), [state, today]);
  const history = useMemo(() => netWorthHistory(state, today), [state, today]);
  const pr = useMemo(() => portfolioReturn(state, today), [state, today]);
  const cmpMax = Math.max(pr.pct ?? 0, ...pr.rows.map((r) => r.pct), 1);

  if (!pf.rows.length) {
    return (
      <div>
        <div className="sheet"><Empty title="No properties yet." art={<SceneEmptyHome />} action={<button className="btn primary" onClick={() => setAddProp(true)}>Add your first property</button>}>Start with the address. Tenants come next.</Empty></div>
        {addProp && <PropertyForm onClose={() => setAddProp(false)} />}
      </div>
    );
  }

  const parts = [
    { label: 'Rent left over', v: w.cashFlow, cls: 'rent' },
    { label: 'Value growth', v: w.appreciation, cls: 'growth' },
    { label: 'Mortgage paid off', v: w.principalPaid, cls: 'paid' },
  ].filter((p) => p.v !== 0);
  const pos = parts.reduce((a, p) => a + Math.max(0, p.v), 0) || 1;

  return (
    <div>

      <div className="pf-hero">
        <div className="sheet pf-worth">
          <div className="small soft">Your net worth in property</div>
          <Figure cents={pf.yours} size="lg" />
          <p className="soft" style={{ margin: '4px 0 0' }}>Worth {fmtShort(pf.value)} − owed {fmtShort(pf.owed)}</p>
          {pf.notCounted.length > 0 && <p className="small" style={{ margin: '8px 0 0' }}>Not counted yet: {pf.notCounted.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link to={`/rent/property/${p.id}/mortgage`}>{p.nickname}</Link></span>)}. Add what is owed on it to include it.</p>}
        </div>
        <div className="sheet pf-return">
          <div className="small soft">Earned, last 12 months</div>
          <Figure cents={w.total} className={w.total < 0 ? 'urgent' : 'in'} />
          {pr.pct !== null && <p style={{ margin: '4px 0 0' }}><strong>{pr.pct.toFixed(1)}% a year</strong> <span className="soft">on your money{pr.missing.length ? ` (${pr.included.map((p) => p.nickname).join(', ')})` : ''}</span></p>}
          <div className="split-bar" role="img" aria-label={parts.map((p) => `${p.label} ${fmt0(p.v)}`).join(', ')}>
            {parts.filter((p) => p.v > 0).map((p) => <span key={p.label} className={p.cls} style={{ width: `${(p.v / pos) * 100}%` }} />)}
          </div>
          <ul className="split-legend">{parts.map((p) => <li key={p.label}><i className={p.cls} />{p.label}<span className="mono">{fmt0(p.v)}</span></li>)}</ul>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Your money compared</h2>
        <div className="sheet compare">
          <ul className="bars-h big">
            <li className="you"><span>{pr.included.length > 1 || !pr.missing.length ? 'Your properties' : pr.included[0]?.nickname ?? 'Your properties'}</span><i style={{ width: `${pr.pct === null ? 0 : (Math.max(0, pr.pct) / cmpMax) * 100}%` }} /><strong>{pr.pct === null ? '—' : `${pr.pct.toFixed(1)}%`}</strong></li>
            {pr.rows.map((r) => <li key={r.label}><span>{r.label}</span><i style={{ width: `${(r.pct / cmpMax) * 100}%` }} /><strong>{r.pct.toFixed(1)}%</strong></li>)}
          </ul>
          <p className="small" style={{ margin: '12px 0 0' }}>
            {pr.pct === null ? 'Add what you paid and what is owed on a property to compare it.' : pr.pct >= pr.rows[1].pct ? `Your properties are beating a 5-year GIC by ${(pr.pct - pr.rows[1].pct).toFixed(1)} points.` : `A 5-year GIC is ahead by ${(pr.rows[1].pct - pr.pct).toFixed(1)} points this year.`}
            {pr.missing.length > 0 && <> {' '}<span className="soft">Not included yet: {pr.missing.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link to={`/rent/property/${p.id}/value`}>{p.nickname}</Link></span>)} (add what you paid).</span></>}
          </p>
          <p className="tiny soft" style={{ margin: '6px 0 0' }}>Rent left over, mortgage paid down and value growth, divided by your money in it. Comparison rates are estimates.</p>
        </div>
      </section>

      {history.length > 1 && (
        <section className="section">
          <h2 className="section-title">Net worth over time</h2>
          <div className="sheet"><NetWorthChart points={history} /></div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Your properties <button className="btn small ghost" onClick={() => setTable((t) => !t)}>{table ? 'Show cards' : 'Compare in a table'}</button></h2>
        {table ? (
          <div className="sheet tight table-scroll">
            <table className="ledger">
              <thead><tr><th>Property</th><th className="num">Worth</th><th className="num">Owed</th><th className="num">Yours</th><th className="num">Earned, 12 mo</th><th className="num">Return a year</th></tr></thead>
              <tbody>{pf.rows.map((r) => (
                <tr key={r.property.id}>
                  <td><Link to={`/rent/property/${r.property.id}`}>{r.property.nickname}</Link></td>
                  <td className="num">{r.valueInfo.basis === 'rent' ? '~' : ''}{fmt0(r.value)}</td>
                  <td className="num">{r.owedKnown ? fmt0(r.owed) : '—'}</td>
                  <td className="num">{r.owedKnown ? fmt0(r.yours) : '—'}</td>
                  <td className="num">{fmt0(r.earned)}</td>
                  <td className="num">{r.returnPct === null ? '—' : `${r.returnPct.toFixed(1)}%`}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td>Total</td><td className="num">{fmt0(pf.value)}</td><td className="num">{fmt0(pf.owed)}</td><td className="num">{fmt0(pf.yours)}</td><td className="num">{fmt0(w.total)}</td><td className="num">{w.returnPct === null ? '—' : `${w.returnPct.toFixed(1)}%`}</td></tr></tfoot>
            </table>
          </div>
        ) : (
          <div className="pcards">{pf.rows.map((r) => <PropertyCard key={r.property.id} property={r.property} />)}</div>
        )}
        {pf.estimates > 0 && <p className="small soft" style={{ marginTop: 12 }}>Values are estimates. Add your own or nearby sales on the Value tab. <Link to="/today">Complete details on Home</Link></p>}
      </section>
      {addProp && <PropertyForm onClose={() => setAddProp(false)} />}
    </div>
  );
}

function NetWorthChart({ points }: { points: { date: string; yours: number; value: number; owed: number }[] }) {
  const W = 720, H = 220, L = 56, R = 16, T = 16, B = 28;
  const max = Math.max(...points.map((p) => p.value)) * 1.05;
  const t0 = new Date(points[0].date).getTime(), t1 = new Date(points[points.length - 1].date).getTime();
  const x = (d: string) => L + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / (max || 1)) * (H - T - B);
  const line = (k: 'yours' | 'value') => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const area = `${line('yours')} L${x(points[points.length - 1].date)},${y(0)} L${x(points[0].date)},${y(0)} Z`;
  const ticks = [0, 0.5, 1].map((k) => Math.round((max * k) / 100) * 100);
  const last = points[points.length - 1];
  return (
    <div className="table-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Net worth grew from ${fmt0(points[0].yours)} in ${yearOf(points[0].date)} to ${fmt0(last.yours)} today`} style={{ minWidth: 320 }}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--rule)" /><text x={L - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-mono)">{fmtShort(t)}</text></g>)}
        <path d={area} fill="var(--pine-tint)" />
        <path d={line('value')} fill="none" stroke="var(--ink-faint)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={line('yours')} fill="none" stroke="var(--pine)" strokeWidth="2.5" />
        {points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.yours)} r={p === last ? 5 : 3} fill="var(--pine)" />)}
        {points.filter((_, i) => i === 0 || i === points.length - 1 || points.length < 9 || i % 2 === 0).map((p) => <text key={p.date} x={x(p.date)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-mono)">{p === last ? 'Today' : yearOf(p.date)}</text>)}
      </svg>
      <div className="legend"><span><i style={{ background: 'var(--pine)' }} />What's yours</span><span><i style={{ border: '1px dashed var(--ink-faint)' }} />What it's worth</span><span>Values estimated · mortgage balances from your mortgage · {fmtDate(addDays(last.date, 0))}</span></div>
    </div>
  );
}
