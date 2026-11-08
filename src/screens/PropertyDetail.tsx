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
import { Empty, Figure, PhaseLocked, Term } from '../components/ui';
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
          <div><div className="label"><Term def="Net operating income: rent minus running costs, before the mortgage">NOI</Term></div><Figure cents={yr.noi} size="sm" /></div>
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
    return <div className="sheet"><Empty title="Start with what you paid." action={<p className="small">Add the purchase date and price under <strong>Edit details</strong>. Keyholder grows it with local price data to give a first estimate.</p>} /></div>;
  }

  const saveIdx = () => idx && act.addValuation({ propertyId: id, ...idx });
  const saveCmp = () => cmp && act.addValuation({ propertyId: id, ...cmp });

  return (
    <>
      <div className="sheet">
        <div className="spread">
          <div>
            <div className="label mono tiny soft">ESTIMATED VALUE TODAY</div>
            {blend ? (
              <>
                <div className="figure" style={{ margin: '8px 0' }}>{fmtShort(blend.low)} – {fmtShort(blend.high)}</div>
                <div className="soft">Most likely <strong className="mono">{fmt0(blend.likely)}</strong> · <span className={`pill conf-${blend.confidence}`}>{blend.confidence} confidence</span></div>
              </>
            ) : <div className="figure">—</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="label mono tiny soft">YOUR EQUITY</div>
            <Figure cents={equity} size="sm" />
            <div className="tiny soft">Value minus {phase >= 3 && m ? 'mortgage balance' : 'approx. mortgage balance'} {fmt0(debt)}</div>
          </div>
        </div>
        <p className="small soft" style={{ marginTop: 12 }}>A range, never a single precise number — automated estimates can be far off in small markets. Bought for {fmt0(p.purchasePrice)} on {fmtDate(p.purchaseDate)} ({pct(((value - p.purchasePrice) / p.purchasePrice) * 100)} since).</p>
      </div>

      <h2 className="section-title">Ways to estimate</h2>
      <div className="grid2" style={{ gap: 16 }}>
        <div className="sheet">
          <h3>Local price index</h3>
          <p className="small soft">Your purchase price grown by the published home price index for {p.city}{region.fallback ? ' (national figures — no city data yet)' : ''}.</p>
          {idx && <><div className="figure sm">{fmtShort(idx.low)} – {fmtShort(idx.high)}</div><p className="tiny soft">1 yr {pct(region.priceGrowth.y1)} · 5 yr avg {pct(region.priceGrowth.y5)}/yr · 10 yr avg {pct(region.priceGrowth.y10)}/yr<br />{region.priceGrowth.source}, {region.priceGrowth.asOf}</p></>}
          <button className="btn small" onClick={saveIdx}>Save today's index estimate</button>
        </div>
        <div className="sheet">
          <h3>Comparable sales</h3>
          <p className="small soft">Recent sales near you, adjusted for how they compare.</p>
          {cmp ? <><div className="figure sm">{fmtShort(cmp.low)} – {fmtShort(cmp.high)}</div><p className="tiny soft">{cmp.note} · {cmp.confidence} confidence</p></> : <p className="small">No sales in the last 12 months yet.</p>}
          <div className="btn-row"><button className="btn small" onClick={() => setForm('comp')}><Icon name="plus" size={14} />Add a sale</button>{cmp && <button className="btn small" onClick={saveCmp}>Save estimate</button>}</div>
        </div>
      </div>
      <div className="btn-row" style={{ marginBottom: 24 }}>
        <button className="btn" onClick={() => setForm('owner')}><Icon name="edit" size={16} />Record my own estimate or an appraisal</button>
      </div>

      {comps.length > 0 && (
        <section className="section">
          <h2 className="section-title">Nearby sales</h2>
          <div className="sheet tight table-scroll"><table className="ledger">
            <thead><tr><th>Sold</th><th>Address</th><th>Beds</th><th>Compared</th><th className="num">Price</th><th /></tr></thead>
            <tbody>{comps.map((c) => (
              <tr key={c.id}><td className="date">{fmtDate(c.saleDate)}</td><td>{c.address}</td><td>{c.bedrooms}</td><td>{c.similarity === 'less' ? 'Less desirable' : c.similarity === 'more' ? 'Nicer' : 'Similar'}</td><td className="num">{fmt0(c.price)}</td>
                <td><button className="btn small ghost" onClick={() => act.removeComparable(c.id)} aria-label="Remove sale"><Icon name="trash" size={14} /></button></td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Valuation history</h2>
        <ValueChart vals={vals} />
        <div className="sheet tight table-scroll"><table className="ledger">
          <thead><tr><th>Date</th><th>Source</th><th className="num">Low</th><th className="num">Likely</th><th className="num">High</th><th>Note</th></tr></thead>
          <tbody>{vals.map((v) => (
            <tr key={v.id}><td className="date">{fmtDate(v.date)}</td><td>{({ purchase: 'Purchase price', owner: 'My estimate', index: 'Price index', comparables: 'Comparables', assessment: 'Appraisal' })[v.source]}</td>
              <td className="num">{fmtShort(v.low)}</td><td className="num"><strong>{fmtShort(v.likely)}</strong></td><td className="num">{fmtShort(v.high)}</td><td className="small soft">{v.note}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
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
  const [showAll, setShowAll] = useState(false);
  const p = state.properties.find((x) => x.id === id)!;
  const m = state.mortgages.find((x) => x.propertyId === id);
  const rows = useMemo(() => (m ? amortization(m) : []), [m]);
  const acb = adjustedCostBase(state, p);
  const blend = blendedValue(state.valuations.filter((v) => v.propertyId === id), today);
  const value = blend?.likely ?? p.purchasePrice ?? 0;
  const sellCost = Math.round(value * 0.05);
  const gain = value - sellCost - acb;
  const capex = state.expenses.filter((e) => e.propertyId === id && e.kind === 'capital');

  return (
    <>
      <div className="split">
        <div>
          <section className="section">
            <h2 className="section-title">Mortgage {m ? <button className="btn small ghost" onClick={() => setEdit(m.id)}><Icon name="edit" size={14} />Edit</button> : null}</h2>
            {!m ? (
              <div className="sheet"><Empty title="No mortgage recorded." action={<button className="btn primary" onClick={() => setEdit('new')}>Add the mortgage</button>}>Add it to split each payment into principal (your savings) and interest (deductible).</Empty></div>
            ) : (() => {
              const bal = mortgageBalanceAt(m, today, rows);
              const ytd = mortgagePaidBetween(m, `${today.slice(0, 4)}-01-01`, today, rows);
              const daysToRenew = daysBetween(today, m.termEnd);
              const next = rows.find((r) => r.date > today);
              return (
                <>
                  {daysToRenew >= 0 && daysToRenew <= 120 && <div className="callout brass"><strong>Renewal in {daysToRenew} days</strong> ({fmtDate(m.termEnd)}). Lenders can offer renewal terms up to 120 days early — a good time to compare rates.</div>}
                  <div className="figures">
                    <div><div className="label">Balance today</div><Figure cents={bal} size="sm" /></div>
                    <div><div className="label">Interest this year</div><Figure cents={ytd.interest} size="sm" /><div className="tiny soft">Deductible{p.rentalSharePct < 100 ? ` at ${p.rentalSharePct}%` : ''}</div></div>
                    <div><div className="label">Principal this year</div><Figure cents={ytd.principal} size="sm" className="in" /><div className="tiny soft">Savings, not an expense</div></div>
                  </div>
                  <div className="kv" style={{ marginTop: 16 }}>
                    <div>Lender</div><div>{m.lender}</div>
                    <div>Rate</div><div>{m.ratePct.toFixed(2)}% fixed</div>
                    <div>Payment</div><div>{fmt(rows[0]?.payment ?? 0)} {m.frequency}</div>
                    <div>Next payment</div><div>{next ? `${fmtDate(next.date)} · ${fmt(next.interest)} interest / ${fmt(next.principal)} principal` : '—'}</div>
                    <div>Term ends</div><div>{fmtDate(m.termEnd)}</div>
                    <div>Paid off</div><div>{rows.length ? fmtDate(rows[rows.length - 1].date) : '—'}</div>
                  </div>
                </>
              );
            })()}
          </section>
          {m && (
            <section className="section">
              <h2 className="section-title">Amortization schedule <button className="btn small ghost" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show next 12' : 'Show all'}</button></h2>
              <div className="sheet tight table-scroll"><table className="ledger">
                <thead><tr><th>#</th><th>Date</th><th className="num">Payment</th><th className="num">Interest</th><th className="num">Principal</th><th className="num">Balance</th></tr></thead>
                <tbody>{(showAll ? rows : rows.filter((r) => r.date > today).slice(0, 12)).map((r) => (
                  <tr key={r.n}><td className="date">{r.n}</td><td className="date">{fmtDate(r.date)}</td><td className="num">{fmt(r.payment)}</td><td className="num">{fmt(r.interest)}</td><td className="num in">{fmt(r.principal)}</td><td className="num">{fmt(r.balance)}</td></tr>
                ))}</tbody>
              </table></div>
            </section>
          )}
        </div>
        <aside>
          <div className="sheet">
            <h2 style={{ marginBottom: 12 }}>Cost base</h2>
            <div className="kv">
              <div>Purchase price</div><div>{fmt0(p.purchasePrice ?? 0)}</div>
              <div>Closing costs</div><div>{fmt0(p.closingCosts ?? 0)}</div>
              <div>Land transfer tax</div><div>{fmt0(p.landTransferTax ?? 0)}</div>
              <div>Improvements at purchase</div><div>{fmt0(p.improvementsAtPurchase ?? 0)}</div>
              <div>Capital spending since ({capex.length})</div><div>{fmt0(capex.reduce((a, e) => a + e.amount, 0))}</div>
              <div><strong><Term def="Adjusted cost base: what the property cost you, including improvements. Used to work out capital gain.">Adjusted cost base</Term></strong></div><div><strong>{fmt0(acb)}</strong></div>
            </div>
          </div>
          <div className="sheet">
            <h2 style={{ marginBottom: 8 }}>If you sold today</h2>
            <div className="kv">
              <div>Estimated value</div><div>{fmt0(value)}</div>
              <div>Selling costs (≈5%)</div><div>−{fmt0(sellCost)}</div>
              <div>Cost base</div><div>−{fmt0(acb)}</div>
              <div><strong>Capital gain</strong></div><div><strong>{fmt0(gain)}</strong></div>
            </div>
            <p className="tiny soft" style={{ marginTop: 8 }}>{p.ownerOccupied ? `The part you live in may be covered by the principal-residence exemption; the rented ${p.rentalSharePct}% generally is not. ` : ''}An estimate, not tax advice. Recapture of CCA claimed would also apply.</p>
          </div>
        </aside>
      </div>
      {edit && <MortgageForm propertyId={id} mortgage={edit === 'new' ? undefined : m} onClose={() => setEdit(null)} />}
    </>
  );
}
