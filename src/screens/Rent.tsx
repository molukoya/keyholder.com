import { useState } from 'react';
import { useStore } from '../data/store';
import { DoorPlate } from '../components/domain';
import { PropertyForm, TenancyForm, UnitForm } from '../components/forms';
import { Empty } from '../components/ui';
import { PropertyCard } from '../components/levels';
import { byValue, keyholderScore } from '../lib/score';
import { Icon } from '../components/Icon';

export function Rent() {
  const { state, today } = useStore();
  const [addProp, setAddProp] = useState(false);
  const [addUnitFor, setAddUnitFor] = useState<string | null>(null);
  const [addTenant, setAddTenant] = useState(false);
  const props = byValue(state, today);
  const todo = keyholderScore(state, today).todo;
  const suggested = props.find((p) => todo.some((i) => i.propertyId === p.id));

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
            <div className="rent-prop">
              <PropertyCard property={p} suggested={p.id === suggested?.id} />
              <div>
            {units.length ? <div className="plates">{units.map((u) => <DoorPlate key={u.id} unit={u} />)}</div>
              : <div className="sheet"><Empty title="No units yet." action={<button className="btn" onClick={() => setAddUnitFor(p.id)}>Add a unit</button>}>A unit is any door you rent out: a whole house counts as one.</Empty></div>}
              </div>
            </div>
          </section>
        );
      })}

      {addProp && <PropertyForm onClose={() => setAddProp(false)} />}
      {addUnitFor && <UnitForm propertyId={addUnitFor} onClose={() => setAddUnitFor(null)} />}
      {addTenant && <TenancyForm onClose={() => setAddTenant(false)} />}
    </div>
  );
}
