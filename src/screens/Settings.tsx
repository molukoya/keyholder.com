import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { Phase } from '../data/types';
import { useStore } from '../data/store';
import { FEATURES, PHASES } from '../data/phases';
import { PACK_VERIFIED, PACK_VERSION, PROVINCES, province } from '../lib/jurisdiction';
import { fmtDate } from '../lib/dates';
import { TONES } from '../lib/templates';
import { Field, Seg, SlideToConfirm } from '../components/ui';

export function Settings() {
  const { state, act } = useStore();
  const p = state.profile;
  const loc = useLocation();
  useEffect(() => { if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView(); }, [loc.hash]);

  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">Settings</div><h1>Your Keyholder</h1></div></div>

      <section className="section" id="phase">
        <h2 className="section-title">Build phase preview</h2>
        <div className="sheet">
          <p className="small soft">Stage 1 is the full front end for all three phases on sample data. Pick a phase to see exactly what that release would ship — each one works on its own.</p>
          <div className="choices" role="radiogroup" aria-label="Phase">
            {PHASES.map((ph) => (
              <button key={ph.id} role="radio" aria-checked={p.phase === ph.id} className="choice" onClick={() => act.setProfile({ phase: ph.id as Phase })}>
                <span className="mono tiny soft">PHASE {ph.id}</span>
                <span className="t">{ph.name}</span>
                <span className="s">{ph.promise}</span>
              </button>
            ))}
          </div>
          <details style={{ marginTop: 16 }}>
            <summary className="small">What's in each phase ({Object.keys(FEATURES).length} features)</summary>
            <div className="table-scroll"><table className="ledger" style={{ marginTop: 8 }}>
              <thead><tr><th>Phase</th><th>Feature</th><th>PRD ref</th><th>In this preview</th></tr></thead>
              <tbody>{Object.entries(FEATURES).map(([k, f]) => <tr key={k}><td className="date">{f.phase}</td><td>{f.label}</td><td className="mono tiny">{f.prd}</td><td>{f.phase <= p.phase ? 'On' : <span className="soft">Off</span>}</td></tr>)}</tbody>
            </table></div>
          </details>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">You</h2>
        <div className="sheet">
          <div className="grid2">
            <Field label="Name on receipts" htmlFor="st-n"><input id="st-n" className="input" value={p.name} onChange={(e) => act.setProfile({ name: e.target.value })} /></Field>
            <Field label="Email" htmlFor="st-e" hint="Tenant replies go here"><input id="st-e" type="email" className="input" value={p.email} onChange={(e) => act.setProfile({ email: e.target.value })} /></Field>
            <Field label="Province" htmlFor="st-p" hint={`Rules pack ${PACK_VERSION}, last verified ${fmtDate(PACK_VERIFIED)}`}>
              <select id="st-p" className="input" value={p.province} onChange={(e) => act.setProfile({ province: e.target.value as typeof p.province, city: province(e.target.value as typeof p.province).cities[0] })}>{PROVINCES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
            </Field>
            <Field label="City" htmlFor="st-c"><select id="st-c" className="input" value={p.city} onChange={(e) => act.setProfile({ city: e.target.value })}>{province(p.province).cities.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Receipts and reminders</h2>
        <div className="sheet">
          <Field label="Reminder tone"><Seg label="Tone" value={p.reminderTone} onChange={(reminderTone) => act.setProfile({ reminderTone })} options={TONES.map((t) => ({ id: t.id, label: t.label }))} /></Field>
          <Field label="Grace period (days)" htmlFor="st-g" hint="A courtesy. Rent is legally late the day after it is due; the firm reminder waits until the grace period ends.">
            <input id="st-g" type="number" min={1} max={15} className="input" style={{ maxWidth: 120 }} value={p.graceDays} onChange={(e) => act.setProfile({ graceDays: Math.max(1, Number(e.target.value) || 5) })} />
          </Field>
          <label className="check"><input type="checkbox" checked={p.autoSend} onChange={(e) => act.setAutoSend(e.target.checked)} />
            <span>Send receipts and reminders automatically<span className="tiny soft" style={{ display: 'block' }}>Off means co-pilot: every message waits for your tap. Legal notices always wait for you.</span></span>
          </label>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Appearance</h2>
        <div className="sheet">
          <Field label="Theme"><Seg label="Theme" value={p.theme} onChange={(theme) => act.setProfile({ theme })} options={[{ id: 'system', label: 'Match device' }, { id: 'light', label: 'Paper' }, { id: 'dark', label: 'Night Ledger' }]} /></Field>
          <label className="check"><input type="checkbox" checked={p.paperGrain} onChange={(e) => act.setProfile({ paperGrain: e.target.checked })} />Paper grain texture</label>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Data</h2>
        <div className="sheet stack">
          <p className="small soft">Stage 1 keeps everything in this browser only. Clearing your browser data clears Keyholder.</p>
          <div className="btn-row">
            <button className="btn" onClick={act.resetDemo}>Restore sample data</button>
            <button className="btn" onClick={act.restartOnboarding}>Replay the signup questions</button>
          </div>
          <div className="callout warn">Clearing removes every property, tenant, payment and expense in this browser. It cannot be undone.</div>
          <SlideToConfirm label="Slide to clear all data" onConfirm={act.clearAll} />
        </div>
      </section>
    </div>
  );
}
