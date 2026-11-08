import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { DoorPlate } from '../components/domain';
import { PropertyForm, TenancyForm, UnitForm } from '../components/forms';
import { Empty } from '../components/ui';
import { Icon } from '../components/Icon';

export function Rent() {
  const { state } = useStore();
  const [addProp, setAddProp] = useState(false);
  const [addUnitFor, setAddUnitFor] = useState<string | null>(null);
  const [addTenant, setAddTenant] = useState(false);
  const props = state.properties.filter((p) => !p.archived);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Your rentals</h1>
        <div className="btn-row">
          <button className="btn" onClick={() => setAddProp(true)}><Icon name="plus" size={16} />Add property</button>
          <button className="btn primary" onClick={() => setAddTenant(true)} disabled={!state.units.length}><Icon name="plus" size={16} />Add tenant</button>
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
                <span style={{ marginLeft: 12 }}>{p.address}</span>
              </Link>
              <span className="btn-row">
                <Link className="btn small" to={`/rent/property/${p.id}`}>Property details</Link>
              </span>
            </div>
            {units.length ? <div className="plates">{units.map((u) => <DoorPlate key={u.id} unit={u} />)}</div>
              : <div className="sheet"><Empty title="No units yet." action={<button className="btn" onClick={() => setAddUnitFor(p.id)}>Add a unit</button>}>A unit is any door you rent out: a whole house counts as one.</Empty></div>}
          </section>
        );
      })}

      {addProp && <PropertyForm onClose={() => setAddProp(false)} />}
      {addUnitFor && <UnitForm propertyId={addUnitFor} onClose={() => setAddUnitFor(null)} />}
      {addTenant && <TenancyForm onClose={() => setAddTenant(false)} />}
    </div>
  );
}
