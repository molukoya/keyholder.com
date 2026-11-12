import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { hasSpace } from '../lib/finance';
import { FindTenantTab, NoticesTab, UnitsTab } from './Rentals';
import type { Property } from '../data/types';
import { propertyLevel, atLeast } from '../lib/levels';
import { LevelInvite, PropertyCard } from '../components/levels';
import { daysBetween, fmtDate, todayISO, yearOf } from '../lib/dates';
import {
  adjustedCostBase, amortization, blendedValue, comparablesEstimate, indexEstimate, mortgageBalanceAt, mortgagePaidBetween, rentBasedValue, propertyValue,
} from '../lib/finance';
import { regionData } from '../lib/jurisdiction';
import { LENDER_MAX_LTV, SELLING_COST_PCT, borrowingRoom, gainSincePurchase, monthChange, rentVsMarket, returnComparison, roughSale, valueHistory } from '../lib/silver';
import { fmt, fmt0, fmtShort, pct } from '../lib/money';
import { RentRoll } from '../components/domain';
import { ComparableForm, MortgageForm, OwnerEstimateForm, PropertyForm } from '../components/forms';
import { Empty, Figure } from '../components/ui';
import { Icon } from '../components/Icon';

export function PropertyDetail() {
  const { id, tab = 'units' } = useParams();
  const { state, today } = useStore();
  const [edit, setEdit] = useState(false);
  const p = state.properties.find((x) => x.id === id);
  if (!p) return <div className="page"><Empty title="That property isn't here." action={<Link to="/rentals" className="btn">Back to Rentals</Link>} /></div>;
  const hasEmpty = state.units.some((u) => u.propertyId === p.id && hasSpace(state, u, today));
  const cur = tab === 'overview' ? 'units' : tab;
  const base = `/rent/property/${p.id}`;

  return (
    <div className="page">
      <Link to="/rentals" className="crumb"><Icon name="back" size={16} />Back to Rentals</Link>
      <h1 className="sr-only">{p.nickname}</h1>
      <div className="prop-head">
        <PropertyCard property={p} active banner />
        <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" size={16} />Edit details</button>
      </div>
      <nav className="tabs" aria-label="Property sections">
        <NavLink end to={base} className={cur === 'units' ? 'active' : ''}>Units and tenants</NavLink>
        {hasEmpty && <NavLink to={`${base}/find`}>Find a tenant</NavLink>}
        <NavLink to={`${base}/notices`}>Late rent and notices</NavLink>
        <NavLink to={`${base}/value`}>Value</NavLink>
        <NavLink to={`${base}/mortgage`}>Mortgage</NavLink>
      </nav>
      {cur === 'units' && (
        <>
          <UnitsTab propertyId={p.id} />
          {state.units.some((u) => u.propertyId === p.id) && <section className="section"><h2 className="section-title">Rent, last 12 months</h2><div className="sheet"><RentRoll propertyId={p.id} /></div></section>}
        </>
      )}
      {cur === 'find' && <FindTenantTab propertyId={p.id} />}
      {cur === 'notices' && <NoticesTab propertyId={p.id} />}
      {cur === 'value' && <ValueTab id={p.id} />}
      {cur === 'mortgage' && (atLeast(propertyLevel(state, p), 'gold') ? <MortgageTab id={p.id} /> : (
        <LevelInvite property={p} to="gold" title="Track your mortgage" points={['See what you still owe and what you paid off this year', 'Get mortgage interest into your taxes', 'Full tax numbers with depreciation', 'Your gain if you sold']} />
      ))}
      {edit && <PropertyForm property={p} onClose={() => setEdit(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Value: rough from rent (Bronze), then purchase price, price trend, nearby sales, own estimates (Silver)
// ---------------------------------------------------------------------------------
function ValueTab({ id }: { id: string }) {
  const { state, today, act } = useStore();
  const [form, setForm] = useState<'owner' | 'comp' | null>(null);
  const p = state.properties.find((x) => x.id === id)!;
  const vals = state.valuations.filter((v) => v.propertyId === id).sort((a, b) => b.date.localeCompare(a.date));
  const comps = state.comparables.filter((c) => c.propertyId === id);
  const idx = indexEstimate(p, today);
  const cmp = comparablesEstimate(comps, today);
  const blend = blendedValue([...vals, ...(idx ? [{ ...idx, id: 'idx', propertyId: id }] : [])], today);
  const region = regionData(p.province, p.city);
  const m = state.mortgages.find((x) => x.propertyId === id);
  const debt = m ? mortgageBalanceAt(m, today) : p.approxMortgageBalance ?? 0;
  const value = blend?.likely ?? p.purchasePrice ?? 0;
  const equity = value - debt;

  if (!p.purchasePrice || !p.purchaseDate) {
    const rough = rentBasedValue(state, p);
    return (
      <>
        {rough > 0 && (
          <div className="sheet">
            <div className="small soft">{p.rentalSharePct < 100 ? 'The part you rent out is worth roughly' : 'Worth roughly'}</div>
            <div className="figure" style={{ margin: '4px 0 8px' }}>{fmtShort(Math.round(rough * 0.8))} – {fmtShort(Math.round(rough * 1.2))}</div>
            <p className="small soft" style={{ margin: 0 }}>A rough guess from the rent and what homes rent for near {p.city}.</p>
            <p className="tiny soft" style={{ margin: '6px 0 0' }}>Source: {propertyValue(state, p, today).source} · {fmtDate(today)}</p>
            <CheckYourself p={p} />
          </div>
        )}
        <LevelInvite property={p} to="silver" title="See what this property is doing for you" points={["How much you've gained since you bought it", 'What your money earns compared with savings, a GIC and stocks', 'Whether your rent is below what similar units rent for', 'How much you could borrow against it', 'A monthly check on its value', 'Roughly what you would walk away with if you sold']} />
      </>
    );
  }

  return (
    <>
      <GainStory p={p} range={blend ? [blend.low, blend.high] : null} equity={equity} owedKnown={!!m || p.approxMortgageBalance !== undefined || !!p.mortgageFree} />
      <div className="btn-row" style={{ margin: '-8px 0 24px' }}>
        <button className="btn" onClick={() => setForm('comp')}><Icon name="plus" size={16} />Add a nearby sale</button>
        <button className="btn" onClick={() => setForm('owner')}><Icon name="edit" size={16} />Add my own estimate</button>
      </div>
      <SilverInsights p={p} />

      <details className="more">
        <summary>How we worked this out</summary>
        <div className="more-body">
          <p className="small soft">Up to three estimates, shown as a range.</p>
          <div className="grid2" style={{ gap: 16 }}>
            <div className="sheet">
              <h3>Local price trend</h3>
              <p className="small soft">Your purchase price, grown by how prices moved in {p.city}{region.fallback ? ' (Canada-wide figures)' : ''}.</p>
              {idx && <div className="figure sm">{fmtShort(idx.low)} – {fmtShort(idx.high)}</div>}
              <p className="tiny soft">Last year {pct(region.priceGrowth.y1)}. Average over 5 years {pct(region.priceGrowth.y5)} a year. Source: {region.priceGrowth.source}.</p>
              {idx && <button className="btn small" onClick={() => act.addValuation({ propertyId: id, ...idx })}>Save this estimate</button>}
            </div>
            <div className="sheet">
              <h3>Nearby sales</h3>
              {cmp ? <><div className="figure sm">{fmtShort(cmp.low)} – {fmtShort(cmp.high)}</div><p className="tiny soft">From {cmp.note}.</p><button className="btn small" onClick={() => act.addValuation({ propertyId: id, ...cmp })}>Save this estimate</button></>
                : <p className="small">No sales added from the last 12 months.</p>}
              {comps.length > 0 && (
                <ul className="rows" style={{ marginTop: 8 }}>{comps.map((c) => (
                  <li key={c.id} className="row"><span className="margin">{fmtDate(c.saleDate)}</span><span><span className="title">{c.address}</span><span className="sub" style={{ display: 'block' }}>{fmt0(c.price)} · {c.similarity === 'less' ? 'not as nice' : c.similarity === 'more' ? 'nicer' : 'similar'}</span></span>
                    <button className="btn small ghost" onClick={() => act.removeComparable(c.id)} aria-label={`Remove ${c.address}`}><Icon name="trash" size={16} /></button></li>
                ))}</ul>
              )}
            </div>
          </div>
          <h3 style={{ margin: '8px 0 12px' }}>Value over time</h3>
          <ValueChart vals={vals} />
          <ul className="rows sheet" style={{ padding: '0 16px' }}>{vals.map((v) => (
            <li key={v.id} className="row"><span className="margin">{fmtDate(v.date)}</span>
              <span><span className="title">{fmtShort(v.likely)}</span><span className="sub" style={{ display: 'block' }}>{({ avm: 'Automated valuation', purchase: 'What you paid', owner: 'Your estimate', index: 'Local price trend', comparables: 'Nearby sales', assessment: 'Appraisal' })[v.source]}{v.note && v.source !== 'purchase' ? ` · ${v.note}` : ''}</span></span><span /></li>
          ))}</ul>
        </div>
      </details>
      {form === 'owner' && <OwnerEstimateForm propertyId={id} onClose={() => setForm(null)} />}
      {form === 'comp' && <ComparableForm propertyId={id} onClose={() => setForm(null)} />}
    </>
  );
}

function ValueChart({ vals }: { vals: { date: string; low: number; likely: number; high: number }[] }) {
  const pts = [...vals].sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return null;
  const W = 640, H = 160, pad = 28;
  const t0 = new Date(pts[0].date).getTime(), t1 = Math.max(new Date(todayISO()).getTime(), new Date(pts[pts.length - 1].date).getTime());
  const lo = Math.min(...pts.map((p) => p.low)) * 0.97, hi = Math.max(...pts.map((p) => p.high)) * 1.02;
  const x = (d: string) => pad + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  return (
    <div className="sheet" style={{ padding: 16 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Valuation history chart">
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="var(--rule-strong)" />
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.high)}`).join(' ') + pts.slice().reverse().map((p) => `L${x(p.date)},${y(p.low)}`).join(' ') + 'Z'} fill="var(--brass-tint)" />
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.likely)}`).join(' ')} stroke="var(--pine)" strokeWidth="2" fill="none" />
        {pts.map((p) => <rect key={p.date + p.likely} x={x(p.date) - 4} y={y(p.likely) - 4} width="8" height="8" transform={`rotate(45 ${x(p.date)} ${y(p.likely)})`} fill="var(--pine)" />)}
        <text x={pad} y={H - 8} fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-mono)">{yearOf(pts[0].date)}</text>
        <text x={W - pad} y={H - 8} fontSize="11" fill="var(--ink-soft)" textAnchor="end" fontFamily="var(--font-mono)">Today</text>
        <text x={pad} y={14} fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-mono)">{fmtShort(hi)}</text>
      </svg>
      <div className="legend"><span><i style={{ background: 'var(--pine)' }} />Most likely</span><span><i style={{ background: 'var(--brass-tint)' }} />Range</span></div>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Gold — mortgage, payment schedule, cost base
// ---------------------------------------------------------------------------------
function MortgageTab({ id }: { id: string }) {
  const { state, today } = useStore();
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const p = state.properties.find((x) => x.id === id)!;
  const m = state.mortgages.find((x) => x.propertyId === id);
  const rows = useMemo(() => (m ? amortization(m) : []), [m]);
  const acb = adjustedCostBase(state, p);
  const blend = blendedValue(state.valuations.filter((v) => v.propertyId === id), today);
  const value = blend?.likely ?? p.purchasePrice ?? 0;
  const sellCost = Math.round(value * 0.05);
  const gain = value - sellCost - acb;
  const capex = state.expenses.filter((e) => e.propertyId === id && e.kind === 'capital');

  if (!m) {
    return (
      <>
        <div className="sheet"><Empty title="No mortgage added." action={<button className="btn primary" onClick={() => setEdit('new')}>Add mortgage</button>}>Paid off? You can skip this.</Empty></div>
        {edit && <MortgageForm propertyId={id} onClose={() => setEdit(null)} />}
      </>
    );
  }
  const bal = mortgageBalanceAt(m, today, rows);
  const ytd = mortgagePaidBetween(m, `${today.slice(0, 4)}-01-01`, today, rows);
  const daysToRenew = daysBetween(today, m.termEnd);
  const next = rows.find((r) => r.date > today);
  const upcoming = rows.filter((r) => r.date > today);

  return (
    <>
      {daysToRenew >= 0 && daysToRenew <= 120 && <div className="callout brass"><strong>Renews in {daysToRenew} days</strong> ({fmtDate(m.termEnd)}). A good time to compare rates.</div>}
      <div className="figures">
        <div><div className="label">Still owed</div><Figure cents={bal} size="sm" /></div>
        <div><div className="label">Interest this year</div><Figure cents={ytd.interest} size="sm" /></div>
        <div><div className="label">Paid off this year</div><Figure cents={ytd.principal} size="sm" className="in" /></div>
      </div>
      <div className="sheet" style={{ marginTop: 16 }}>
        <div className="spread">
          <div>
            {next && <p style={{ margin: 0 }}><strong>Next payment {fmtDate(next.date)}: {fmt(next.payment)}</strong></p>}
            <p className="small soft" style={{ margin: 0 }}>{m.lender} · {m.ratePct.toFixed(2)}% · renews {fmtDate(m.termEnd)}</p>
          </div>
          <button className="btn" onClick={() => setEdit(m.id)}><Icon name="edit" size={16} />Edit</button>
        </div>
        {p.rentalSharePct < 100 && <p className="small soft" style={{ margin: '12px 0 0' }}>You can deduct {p.rentalSharePct}% of the interest, the part for the rental.</p>}
      </div>

      <details className="more">
        <summary>Show all payments</summary>
        <div className="more-body table-scroll">
          <table className="ledger">
            <thead><tr><th>Date</th><th className="num">Payment</th><th className="num">Interest</th><th className="num">Paid off</th><th className="num">Still owed</th></tr></thead>
            <tbody>{upcoming.map((r) => (
              <tr key={r.n}><td className="date">{fmtDate(r.date)}</td><td className="num">{fmt(r.payment)}</td><td className="num">{fmt(r.interest)}</td><td className="num in">{fmt(r.principal)}</td><td className="num">{fmt(r.balance)}</td></tr>
            ))}</tbody>
          </table>
          <p className="tiny soft">Paid off on {rows.length ? fmtDate(rows[rows.length - 1].date) : '—'} if the rate stays the same.</p>
        </div>
      </details>

      <details className="more">
        <summary>What it cost you, and if you sold</summary>
        <div className="more-body grid2" style={{ gap: 16 }}>
          <div className="sheet">
            <h3 style={{ marginBottom: 8 }}>What it cost you</h3>
            <div className="kv">
              <div>Price</div><div>{fmt0(p.purchasePrice ?? 0)}</div>
              <div>Closing costs</div><div>{fmt0(p.closingCosts ?? 0)}</div>
              <div>Land transfer tax</div><div>{fmt0(p.landTransferTax ?? 0)}</div>
              <div>Upgrades{capex.length ? ` (${capex.length})` : ''}</div><div>{fmt0((p.improvementsAtPurchase ?? 0) + capex.reduce((a, e) => a + e.amount, 0))}</div>
              <div><strong>Total</strong></div><div><strong>{fmt0(acb)}</strong></div>
            </div>
          </div>
          <div className="sheet">
            <h3 style={{ marginBottom: 8 }}>If you sold today</h3>
            <div className="kv">
              <div>Worth about</div><div>{fmt0(value)}</div>
              <div>Selling costs (about 5%)</div><div>−{fmt0(sellCost)}</div>
              <div>What it cost you</div><div>−{fmt0(acb)}</div>
              <div><strong>Gain</strong></div><div><strong>{fmt0(gain)}</strong></div>
            </div>
            <p className="tiny soft" style={{ marginTop: 8 }}>{p.ownerOccupied ? `Your own home part is usually tax-free. The rented ${p.rentalSharePct}% usually is not. ` : ''}An estimate. Ask your accountant before selling.</p>
          </div>
        </div>
      </details>
      {edit && <MortgageForm propertyId={id} mortgage={edit === 'new' ? undefined : m} onClose={() => setEdit(null)} />}
    </>
  );
}

/** Links to public estimate sites so the owner can compare and enter their own number. We never copy data from them. */
function CheckYourself({ p }: { p: Property }) {
  return (
    <p className="small" style={{ margin: '10px 0 0' }}>
      Check it yourself for {p.address}: <a href="https://housesigma.com" target="_blank" rel="noopener noreferrer">HouseSigma</a> · <a href="https://wowa.ca" target="_blank" rel="noopener noreferrer">wowa.ca</a>. Then add your own estimate.
    </p>
  );
}

// ---------------------------------------------------------------------------------
// Silver: what it's worth and what it could do for you
// ---------------------------------------------------------------------------------
function GainStory({ p, range, equity, owedKnown }: { p: Property; range: [number, number] | null; equity: number; owedKnown: boolean }) {
  const { state, today } = useStore();
  const g = gainSincePurchase(state, p, today)!;
  const hist = valueHistory(state, p, today);
  const month = monthChange(state, p, today);
  const up = g.gain >= 0;
  return (
    <div className="sheet gain">
      <div className="gain-grid">
        <div>
          <div className="small soft">Bought for {fmt0(g.paid)} in {yearOf(p.purchaseDate!)} · worth about</div>
          <div className="figure" style={{ margin: '4px 0' }}>{range ? `${fmtShort(range[0])} – ${fmtShort(range[1])}` : fmtShort(g.value)}</div>
          <p className={`gain-line ${up ? 'in' : 'urgent'}`}>You've {up ? 'gained' : 'lost'} about <strong>{fmt0(Math.abs(g.gain))}</strong> ({up ? '+' : '−'}{Math.abs(g.pct).toFixed(0)}%) since you bought it.</p>
          {month !== null && <p className="small" style={{ margin: '4px 0 0' }}>This month: <strong className={month >= 0 ? 'in' : 'urgent'}>{month >= 0 ? '+' : '−'}{fmt0(Math.abs(month))}</strong> <span className="soft">(monthly value check)</span></p>}
          {owedKnown && <p className="small" style={{ margin: '4px 0 0' }}>Yours after the mortgage: <strong className="mono">{fmt0(equity)}</strong></p>}
        </div>
        <Spark points={hist} />
      </div>
      <p className="tiny soft" style={{ margin: '8px 0 0' }}>Source: {propertyValue(state, p, today).source} · {fmtDate(today)}</p>
      <CheckYourself p={p} />
    </div>
  );
}

function Spark({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return null;
  const W = 260, H = 90, P = 6;
  const vs = points.map((x) => x.value), lo = Math.min(...vs) * 0.98, hi = Math.max(...vs) * 1.02;
  const t0 = Date.parse(points[0].date), t1 = Date.parse(points[points.length - 1].date);
  const x = (d: string) => P + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const d = points.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.date).toFixed(1)},${y(pt.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <figure className="spark" aria-label={`Value from ${fmtShort(points[0].value)} to ${fmtShort(last.value)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        <path d={`${d} L${x(last.date)},${H - P} L${x(points[0].date)},${H - P} Z`} fill="var(--pine-tint)" />
        <path d={d} fill="none" stroke="var(--pine)" strokeWidth="2.5" />
        <circle cx={x(last.date)} cy={y(last.value)} r="4" fill="var(--pine)" />
      </svg>
      <figcaption className="tiny soft"><span>{yearOf(points[0].date)}</span><span>Today</span></figcaption>
    </figure>
  );
}

function SilverInsights({ p }: { p: Property }) {
  const { state, today } = useStore();
  const ret = returnComparison(state, p, today);
  const units = state.units.filter((u) => u.propertyId === p.id);
  const room = borrowingRoom(state, p, today);
  const sale = roughSale(state, p, today);
  const max = Math.max(ret.yours ?? 0, ...ret.rows.map((r) => r.pct), 1);
  return (
    <div className="silver-grid">
      <section className="sheet">
        <h3>Your money is earning</h3>
        {ret.yours === null ? <p className="small soft">Add what is owed on the mortgage to see this.</p> : (
          <ul className="bars-h">
            <li className="you"><span>This property</span><i style={{ width: `${(Math.max(0, ret.yours) / max) * 100}%` }} /><strong>{ret.yours.toFixed(1)}%</strong></li>
            {ret.rows.map((r) => <li key={r.label}><span>{r.label}</span><i style={{ width: `${(r.pct / max) * 100}%` }} /><strong>{r.pct.toFixed(1)}%</strong></li>)}
          </ul>
        )}
        <p className="tiny soft">Rent left over, mortgage paid down and value growth, divided by your money in it. Comparison rates are estimates.</p>
      </section>

      <section className="sheet">
        <h3>Rent compared with the area</h3>
        <ul className="rows">{units.map((u) => {
          const r = rentVsMarket(p, u);
          return (
            <li key={u.id} className="row" style={{ gridTemplateColumns: '64px 1fr auto' }}>
              <span className="margin">Unit {u.label}</span>
              <span><span className="title">{fmt0(u.rent)} now · about {fmt0(r.market)} nearby</span><span className="sub" style={{ display: 'block' }}>{u.bedrooms}-bedroom{r.fallback ? ' · Canada-wide average' : ''}</span></span>
              <span className={r.gap > 5000 ? 'in' : 'soft'}>{r.gap > 5000 ? `${fmt0(r.gap)} below` : r.gap < -5000 ? `${fmt0(-r.gap)} above` : 'About right'}</span>
            </li>
          );
        })}</ul>
        <p className="tiny soft">Many provinces limit rent increases. We suggest the allowed amount at renewal.</p>
      </section>

      <section className="sheet">
        <h3>Room to borrow</h3>
        {room === null ? <p className="small soft">Add what is owed on the mortgage to see this.</p> : <>
          <div className="figure sm">{fmt0(room)}</div>
          <p className="small soft">About how much a lender might let you borrow against it ({LENDER_MAX_LTV}% of value, minus what you owe). Useful for a renovation or the next property. An estimate, not an offer.</p>
        </>}
      </section>

      <section className="sheet">
        <h3>If you sold today</h3>
        {sale === null ? <p className="small soft">Add what is owed on the mortgage to see this.</p> : <>
          <div className="figure sm">{fmt0(sale.net)}</div>
          <p className="small soft">Worth {fmt0(sale.value)} − selling costs about {fmt0(sale.costs)} ({SELLING_COST_PCT}%) − mortgage {fmt0(sale.owed)}. Before tax. Gold works out the exact figure, with tax.</p>
        </>}
      </section>
    </div>
  );
}
