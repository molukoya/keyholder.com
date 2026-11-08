import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { usePhase, useStore } from '../data/store';
import { enabled } from '../data/phases';
import { addDays, daysBetween, fmtDate, todayISO, yearOf } from '../lib/dates';
import {
  adjustedCostBase, amortization, blendedValue, comparablesEstimate, indexEstimate, mortgageBalanceAt, mortgagePaidBetween, picture,
} from '../lib/finance';
import { province, regionData } from '../lib/jurisdiction';
import { fmt, fmt0, fmtShort, pct } from '../lib/money';
import { DoorPlate, RentRoll } from '../components/domain';
import { ComparableForm, MortgageForm, OwnerEstimateForm, PropertyForm, UnitForm } from '../components/forms';
import { Empty, Figure, PhaseLocked } from '../components/ui';
import { Icon } from '../components/Icon';

export function PropertyDetail() {
  const { id, tab = 'overview' } = useParams();
  const { state } = useStore();
  const phase = usePhase();
  const [edit, setEdit] = useState(false);
  const p = state.properties.find((x) => x.id === id);
  if (!p) return <div className="page"><Empty title="That property isn't here." action={<Link to="/rent" className="btn">Back to Rent</Link>} /></div>;

  return (
    <div className="page">
      <Link to="/rent" className="crumb"><Icon name="back" size={16} />Rent</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">{p.type} · {province(p.province).name}{p.ownerOccupied ? ' · you live here' : ''}</div>
          <h1>{p.nickname}</h1>
          <div className="soft">{p.address}, {p.city}</div>
        </div>
        <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" size={16} />Edit details</button>
      </div>
      <nav className="tabs" aria-label="Property sections">
        <NavLink end to={`/rent/property/${p.id}`} className={tab === 'overview' ? 'active' : ''}>Overview</NavLink>
        {phase >= 2 && <NavLink to={`/rent/property/${p.id}/value`}>Value</NavLink>}
        {phase >= 3 && <NavLink to={`/rent/property/${p.id}/mortgage`}>Mortgage</NavLink>}
      </nav>
      {tab === 'overview' && <Overview id={p.id} />}
      {tab === 'value' && (enabled('valuation', phase) ? <ValueTab id={p.id} /> : <PhaseLocked phase={2} what="Property value" />)}
      {tab === 'mortgage' && (enabled('mortgage', phase) ? <MortgageTab id={p.id} /> : <PhaseLocked phase={3} what="Purchase details and the mortgage" />)}
      {edit && <PropertyForm property={p} onClose={() => setEdit(false)} />}
    </div>
  );
}

function Overview({ id }: { id: string }) {
  const { state, today } = useStore();
  const phase = usePhase();
  const [unitEdit, setUnitEdit] = useState<string | 'new' | null>(null);
  const p = state.properties.find((x) => x.id === id)!;
  const units = state.units.filter((u) => u.propertyId === id);
  const yr = useMemo(() => picture(state, addDays(today, -364), today, { propertyId: id, phase }), [state, today, id, phase]);
  return (
    <>
      <section className="section">
        <h2 className="section-title">Units <button className="btn small ghost" onClick={() => setUnitEdit('new')}><Icon name="plus" size={14} />Add unit</button></h2>
        {units.length ? <div className="plates">{units.map((u) => <div key={u.id}><DoorPlate unit={u} /><button className="btn small ghost" onClick={() => setUnitEdit(u.id)} style={{ marginTop: 4 }}>Edit unit {u.label}</button></div>)}</div>
          : <div className="sheet"><Empty title="No units yet." action={<button className="btn" onClick={() => setUnitEdit('new')}>Add a unit</button>} /></div>}
      </section>
      {units.length > 0 && <section className="section"><h2 className="section-title">Rent roll</h2><div className="sheet"><RentRoll propertyId={id} /></div></section>}
      <section className="section">
        <h2 className="section-title">Last 12 months</h2>
        <div className="figures four">
          <div><div className="label">Rent in</div><Figure cents={yr.rentCollected} size="sm" className="in" /></div>
          <div><div className="label">Expenses</div><Figure cents={yr.opex} size="sm" /></div>
          <div><div className="label">Before mortgage</div><Figure cents={yr.noi} size="sm" /></div>
          <div><div className="label">Kept</div><Figure cents={yr.kept} size="sm" className={yr.kept < 0 ? 'urgent' : ''} /></div>
        </div>
        {p.rentalSharePct < 100 && <p className="small soft" style={{ marginTop: 8 }}>Shared costs counted at your {p.rentalSharePct}% rental share.</p>}
      </section>
      {unitEdit && <UnitForm propertyId={id} unit={unitEdit === 'new' ? undefined : state.units.find((u) => u.id === unitEdit)} onClose={() => setUnitEdit(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------------
// Phase 2 — Value: purchase price, open-data index, comparables, owner estimates
// ---------------------------------------------------------------------------------
function ValueTab({ id }: { id: string }) {
  const { state, today, act } = useStore();
  const phase = usePhase();
  const [form, setForm] = useState<'owner' | 'comp' | null>(null);
  const p = state.properties.find((x) => x.id === id)!;
  const vals = state.valuations.filter((v) => v.propertyId === id).sort((a, b) => b.date.localeCompare(a.date));
  const comps = state.comparables.filter((c) => c.propertyId === id);
  const idx = indexEstimate(p, today);
  const cmp = comparablesEstimate(comps, today);
  const blend = blendedValue(vals, today);
  const region = regionData(p.province, p.city);
  const m = state.mortgages.find((x) => x.propertyId === id);
  const debt = phase >= 3 && m ? mortgageBalanceAt(m, today) : p.approxMortgageBalance ?? 0;
  const value = blend?.likely ?? p.purchasePrice ?? 0;
  const equity = value - debt;

  if (!p.purchasePrice || !p.purchaseDate) {
    return <div className="sheet"><Empty title="Start with what you paid." action={<p>Tap <strong>Edit details</strong> and add the purchase date and price.</p>} /></div>;
  }
  const change = ((value - p.purchasePrice) / p.purchasePrice) * 100;

  return (
    <>
      <div className="sheet">
        <div className="small soft">Worth about</div>
        <div className="figure" style={{ margin: '4px 0 8px' }}>{blend ? `${fmtShort(blend.low)} – ${fmtShort(blend.high)}` : fmtShort(value)}</div>
        <p style={{ margin: 0 }}>Bought for {fmt0(p.purchasePrice)} in {yearOf(p.purchaseDate)}. <span className={change >= 0 ? 'in' : 'urgent'}>{change >= 0 ? 'Up' : 'Down'} {Math.abs(change).toFixed(0)}%.</span></p>
        <hr className="hr" style={{ margin: '16px 0' }} />
        <div className="spread">
          <div><div className="small soft">Yours after the mortgage</div><Figure cents={equity} size="sm" /></div>
          <div className="btn-row">
            <button className="btn" onClick={() => setForm('comp')}><Icon name="plus" size={16} />Add a nearby sale</button>
            <button className="btn" onClick={() => setForm('owner')}><Icon name="edit" size={16} />Add my own estimate</button>
          </div>
        </div>
      </div>

      <details className="more">
        <summary>How we worked this out</summary>
        <div className="more-body">
          <p className="small soft">We combine up to three estimates and show a range, because no estimate is exact.</p>
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
              <span><span className="title">{fmtShort(v.likely)}</span><span className="sub" style={{ display: 'block' }}>{({ purchase: 'What you paid', owner: 'Your estimate', index: 'Local price trend', comparables: 'Nearby sales', assessment: 'Appraisal' })[v.source]}{v.note && v.source !== 'purchase' ? ` · ${v.note}` : ''}</span></span><span /></li>
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
// Phase 3 — Purchase details, mortgage and amortization
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
