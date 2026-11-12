import { useState } from 'react';
import type { HomeFacts, Property } from '../data/types';
import { useStore } from '../data/store';
import { askValue, avmOn, guessType, homeFacts, missingFacts, POSTAL, useAvmChoices, useAvmStatus } from '../data/avm';
import { latestAvm } from '../lib/finance';
import { fmtDate } from '../lib/dates';
import { fmtShort } from '../lib/money';
import { Field } from './ui';
import { Icon } from './Icon';

/**
 * The home's market value from the connected provider (Repliers Estimates), on the property's Value page. Shown
 * as soon as the home's facts are in, with or without a purchase price or mortgage. If the provider cannot value
 * the home, its reason is shown with "Try again". Nothing shows on the browser-only preview.
 */
export function HomeValuePanel({ p }: { p: Property }) {
  const { state, today, act } = useStore();
  const st = useAvmStatus(p.id);
  const [editing, setEditing] = useState(false);
  if (!avmOn()) return null;
  const v = latestAvm(state, p.id, today);
  const missing = missingFacts(state, p);
  const part = p.rentalSharePct < 100;

  if (editing || (!v && missing.length && st?.state !== 'asking')) {
    return <HomeFactsForm p={p} first={!v && !editing} onDone={() => setEditing(false)} />;
  }
  return (
    <div className="sheet home-value" id="home-value">
      {v ? (
        <>
          <div className="small soft">{part ? 'The whole home is worth about' : 'Worth about'}</div>
          <div className="figure" style={{ margin: '4px 0 2px' }}>{fmtShort(v.likely)}</div>
          <div className="small">Likely between {fmtShort(v.low)} and {fmtShort(v.high)}</div>
          {part && <p className="small" style={{ margin: '8px 0 0' }}>The part you rent out ({p.rentalSharePct}%): about <strong>{fmtShort(Math.round((v.likely * p.rentalSharePct) / 100))}</strong></p>}
          <p className="tiny soft hv-source" style={{ margin: '8px 0 0' }}>Source: {v.note ?? 'Automated valuation'} · {fmtDate(v.date)}{v.errorPct ? ` · usually within about ${Math.round(v.errorPct)}%` : ''} · refreshed monthly</p>
        </>
      ) : st?.state === 'asking' ? (
        <p className="small" style={{ margin: 0 }}><Icon name="sync" size={16} /> Asking Repliers for this home's value…</p>
      ) : null}
      {st?.state === 'error' && (
        <div className="hv-error" role="alert">
          <p className="small" style={{ margin: '8px 0 4px' }}><strong>Repliers could not value this home{v ? ' again' : ''}.</strong> {st.message}</p>
        </div>
      )}
      <div className="btn-row" style={{ marginTop: 12 }}>
        {st?.state === 'error' && <button className="btn small primary" onClick={() => void askValue(state, p, act.addValuation)}><Icon name="sync" size={14} />Try again</button>}
        <button className="btn small" onClick={() => setEditing(true)}><Icon name="edit" size={14} />Edit home details</button>
      </div>
    </div>
  );
}

/** The few facts Repliers needs about the whole home. Type and style come from the MLS board's own list. */
function HomeFactsForm({ p, first, onDone }: { p: Property; first: boolean; onDone: () => void }) {
  const { state, act } = useStore();
  const { choices, error } = useAvmChoices();
  const h0 = homeFacts(state, p);
  const [postal, setPostal] = useState(p.postalCode ?? '');
  const [h, setH] = useState<HomeFacts>(h0);
  const [tried, setTried] = useState(false);
  const set = (x: Partial<HomeFacts>) => setH((o) => ({ ...o, ...x }));
  const types = choices?.propertyTypes ?? [], styles = choices?.styles ?? [];
  const mlsType = h.mlsType ?? guessType(types, p.type) ?? '';
  const style = h.style ?? '';
  const num = (s: string) => (s === '' ? undefined : Math.max(0, Math.round(Number(s))));
  const bad = {
    postal: !POSTAL.test(postal.trim()) ? 'Like K8N 2A1' : '',
    bedrooms: h.bedrooms === undefined ? 'Needed' : '',
    bathrooms: !h.bathrooms ? 'Needed' : '',
    sqft: !h.sqft || h.sqft < 200 ? 'The whole home, e.g. 1600' : '',
    type: !mlsType ? 'Choose one' : '',
    style: !style ? 'Choose one' : '',
  };
  const ok = Object.values(bad).every((x) => !x);
  const save = () => {
    setTried(true);
    if (!ok) return;
    const year = h.yearBuilt && h.yearBuilt >= 1700 && h.yearBuilt <= 2100 ? h.yearBuilt : undefined;
    const next: Property = { ...p, postalCode: postal.trim().toUpperCase().replace(/^(\w{3})\s*(\w{3})$/, '$1 $2'), home: { ...h, mlsType, style, yearBuilt: year } };
    act.saveProperty(next);
    void askValue({ ...state, properties: state.properties.map((x) => (x.id === p.id ? next : x)) }, next, act.addValuation);
    onDone();
  };
  const err = (k: keyof typeof bad) => (tried && bad[k] ? bad[k] : undefined);
  return (
    <div className="sheet home-facts" id="home-facts">
      <h3 style={{ marginTop: 0 }}>{first ? "Get this home's value from Repliers" : 'Home details for its value'}</h3>
      <p className="small soft" style={{ marginTop: 0 }}>About the whole home{p.rentalSharePct < 100 ? ', including the part you live in' : ''}. No purchase price needed. Repliers values it from these and nearby sales, then again each month.</p>
      {error && <p className="small acct-error" role="alert">Repliers' list of home types did not load: {error}</p>}
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Postal code" htmlFor="hf-postal" error={err('postal')}><input id="hf-postal" className="input" value={postal} maxLength={7} autoComplete="postal-code" onChange={(e) => setPostal(e.target.value.toUpperCase())} /></Field>
        <Field label="Square feet" htmlFor="hf-sqft" error={err('sqft')}><input id="hf-sqft" className="input" inputMode="numeric" value={h.sqft ?? ''} onChange={(e) => set({ sqft: num(e.target.value.replace(/\D/g, '')) })} placeholder="1600" /></Field>
        <Field label="Bedrooms" htmlFor="hf-beds" error={err('bedrooms')}><input id="hf-beds" className="input" type="number" min={0} max={30} value={h.bedrooms ?? ''} onChange={(e) => set({ bedrooms: num(e.target.value) })} /></Field>
        <Field label="Bathrooms" htmlFor="hf-baths" error={err('bathrooms')}><input id="hf-baths" className="input" type="number" min={1} max={30} value={h.bathrooms ?? ''} onChange={(e) => set({ bathrooms: num(e.target.value) })} /></Field>
        <Field label="Property type" htmlFor="hf-type" error={err('type')}>
          <select id="hf-type" className="input" value={mlsType} onChange={(e) => set({ mlsType: e.target.value || undefined })} disabled={!types.length}>
            <option value="">{types.length ? 'Choose…' : 'Loading…'}</option>
            {[...new Set([...(h.mlsType && !types.includes(h.mlsType) ? [h.mlsType] : []), ...types])].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Style" htmlFor="hf-style" error={err('style')} hint="As the MLS listing would say it">
          <select id="hf-style" className="input" value={style} onChange={(e) => set({ style: e.target.value || undefined })} disabled={!styles.length}>
            <option value="">{styles.length ? 'Choose…' : 'Loading…'}</option>
            {[...new Set([...(h.style && !styles.includes(h.style) ? [h.style] : []), ...styles])].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Year built" htmlFor="hf-year" hint="Optional"><input id="hf-year" className="input" inputMode="numeric" maxLength={4} value={h.yearBuilt ?? ''} onChange={(e) => set({ yearBuilt: num(e.target.value.replace(/\D/g, '')) })} /></Field>
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn primary" id="hf-save" onClick={save}><Icon name="check" size={16} />Get the value</button>
        {!first && <button className="btn ghost" onClick={onDone}>Cancel</button>}
      </div>
    </div>
  );
}
