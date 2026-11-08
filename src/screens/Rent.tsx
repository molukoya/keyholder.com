import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { currentLine, unitTenant, useStore } from '../data/store';
import { fmtDate } from '../lib/dates';
import { leaseBalance } from '../lib/finance';
import { fmt } from '../lib/money';
import { DoorPlate } from '../components/domain';
import { PropertyForm, TenancyForm, UnitForm } from '../components/forms';
import { Empty, Stamp } from '../components/ui';
import { Icon } from '../components/Icon';

export function Rent() {
  const { state, today } = useStore();
  const nav = useNavigate();
  const [addProp, setAddProp] = useState(false);
  const [addUnitFor, setAddUnitFor] = useState<string | null>(null);
  const [addTenant, setAddTenant] = useState(false);
  const props = state.properties.filter((p) => !p.archived);

  const tenancies = state.leases
    .filter((l) => !l.end || l.end >= today)
    .map((l) => ({ lease: l, tenant: state.tenants.find((t) => t.id === l.tenantId)!, unit: state.units.find((u) => u.id === l.unitId)! }))
    .filter((x) => x.tenant && x.unit);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Rent</div><h1>Units and tenants</h1></div>
        <div className="btn-row">
          <button className="btn" onClick={() => setAddProp(true)}><Icon name="plus" size={16} />Property</button>
          <button className="btn primary" onClick={() => setAddTenant(true)} disabled={!state.units.length}><Icon name="plus" size={16} />Tenant</button>
        </div>
      </div>

      {!props.length && (
        <div className="sheet"><Empty title="No properties yet." action={<button className="btn primary" onClick={() => setAddProp(true)}>Add your first property</button>}>Start with the address. Units and tenants come next.</Empty></div>
      )}

      {props.map((p) => {
        const units = state.units.filter((u) => u.propertyId === p.id);
        return (
          <section className="section" key={p.id}>
            <div className="section-title">
              <Link to={`/rent/property/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="serif" style={{ fontSize: 'var(--t-20)', textTransform: 'none', letterSpacing: 0, color: 'var(--ink)' }}>{p.nickname}</span>
                <span style={{ marginLeft: 12 }}>{p.address}, {p.city}{p.rentalSharePct < 100 ? ` · ${p.rentalSharePct}% rented` : ''}</span>
              </Link>
              <span className="btn-row">
                <button className="btn small ghost" onClick={() => setAddUnitFor(p.id)}><Icon name="plus" size={14} />Unit</button>
                <Link className="btn small" to={`/rent/property/${p.id}`}>Open</Link>
              </span>
            </div>
            {units.length ? <div className="plates">{units.map((u) => <DoorPlate key={u.id} unit={u} />)}</div>
              : <div className="sheet"><Empty title="No units yet." action={<button className="btn" onClick={() => setAddUnitFor(p.id)}>Add a unit</button>}>A unit is any door you rent out: a whole house counts as one.</Empty></div>}
          </section>
        );
      })}

      {tenancies.length > 0 && (
        <section className="section">
          <h2 className="section-title">Tenants</h2>
          <div className="sheet tight table-scroll">
            <table className="ledger">
              <thead><tr><th>Tenant</th><th>Unit</th><th>Since</th><th className="num">Rent</th><th className="num">Balance</th><th>This month</th></tr></thead>
              <tbody>
                {tenancies.map(({ lease, tenant, unit }) => {
                  const line = currentLine(state, lease, today);
                  const bal = leaseBalance(lease, state.payments, today);
                  const prop = state.properties.find((x) => x.id === unit.propertyId);
                  const isCurrent = unitTenant(state, unit.id, today).lease?.id === lease.id;
                  return (
                    <tr key={lease.id} className="click" onClick={() => nav(`/rent/tenant/${tenant.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/rent/tenant/${tenant.id}`)}>
                      <td><strong>{tenant.names.join(' & ')}</strong>{tenant.remindersPaused && <span className="pill" style={{ marginLeft: 8 }}>Reminders paused</span>}</td>
                      <td>{prop?.nickname.split(' ')[0]} · {unit.label}</td>
                      <td className="date">{fmtDate(lease.start)}</td>
                      <td className="num">{fmt(lease.rent)}</td>
                      <td className={`num ${bal > 0 ? 'urgent' : ''}`}>{bal > 0 ? fmt(bal) : bal < 0 ? `${fmt(-bal)} cr` : '—'}</td>
                      <td>{isCurrent && line ? <Stamp kind={line.state}>{line.state === 'upcoming' ? 'Upcoming' : line.state}</Stamp> : <span className="soft small">Starts {fmtDate(lease.start)}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {addProp && <PropertyForm onClose={() => setAddProp(false)} />}
      {addUnitFor && <UnitForm propertyId={addUnitFor} onClose={() => setAddUnitFor(null)} />}
      {addTenant && <TenancyForm onClose={() => setAddTenant(false)} />}
    </div>
  );
}
