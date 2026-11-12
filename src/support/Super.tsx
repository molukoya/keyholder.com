import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHead } from '../screens/Support';
import { fmtDate } from '../lib/dates';
import { OTHER_BANKS, POPULAR_BANKS } from '../lib/jurisdiction';
import { api } from '../data/api';
import { Status } from './charts';
import { fmtMoney, isLive, isSuper, live, sup, toast, useSupport } from './store';
import { DEFAULT_UNIT_CENTS, type Promotion } from './data';
import { KEY_FIELDS, OPTION_LABEL, SERVICES, STATE_LABEL, type ServiceId, type ServiceInfo, type ServiceState } from './connections';

// The super user's pages: the Landlord plan price and promotions, which banks can be connected, and the
// API keys for the services Keyholder connects to. Admins and support staff can look but not change
// (the server checks this too).

const CODE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const promoText = (p: Promotion) => `${p.kind === 'percent' ? `${p.value}% off` : `${fmtMoney(p.value, 2)} off a month`} for ${plural(p.months, 'month')}`;
const PROMO_TONE: Record<Promotion['status'], 'good' | 'off' | 'bad'> = { active: 'good', paused: 'off', ended: 'bad' };
const PROMO_LABEL: Record<Promotion['status'], string> = { active: 'Active', paused: 'Paused', ended: 'Ended' };

function OnlySuper() {
  return <p className="sp-small sp-muted"><Icon name="lock" size={14} /> Only the super user can change this.</p>;
}

// ---------------- Price & promotions ----------------
export function Pricing() {
  const s = useSupport();
  const canEdit = isSuper(s);
  const cur = s.platform.unitCents;
  const [price, setPrice] = useState((cur / 100).toFixed(2));
  const cents = Math.round(Number(price.replace(/[$,\s]/g, '')) * 100);
  const okPrice = Number.isFinite(cents) && cents >= 0 && cents <= 100_000;
  // Subscribers by the price they pay (the price when they subscribed).
  const groups = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of live(s).filter((x) => x.plan === 'landlord')) m.set(c.unitPrice ?? DEFAULT_UNIT_CENTS, (m.get(c.unitPrice ?? DEFAULT_UNIT_CENTS) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [s]);
  const [p, setP] = useState({ code: '', kind: 'percent' as Promotion['kind'], value: '', months: '3', endsOn: '', maxUses: '' });
  const code = p.code.trim().toUpperCase();
  const value = p.kind === 'percent' ? Math.round(Number(p.value)) : Math.round(Number(p.value) * 100);
  const months = Math.round(Number(p.months));
  const taken = s.platform.promotions.some((x) => x.code.toUpperCase() === code);
  const okPromo = CODE.test(code) && !taken && Number.isFinite(value) && value >= 1 && (p.kind === 'amount' || value <= 100) && months >= 1 && months <= 36 && (!p.maxUses || Number(p.maxUses) >= 1);

  const savePrice = (e: FormEvent) => {
    e.preventDefault(); if (!okPrice || cents === cur) return;
    sup((d) => { d.platform.unitCents = cents; }, { action: 'Price changed', detail: `Landlord plan: ${fmtMoney(cur, 2)} → ${fmtMoney(cents, 2)} per unit a month (new subscribers)` }, 'Price saved. New subscribers pay the new price.');
  };
  const addPromo = (e: FormEvent) => {
    e.preventDefault(); if (!okPromo) return;
    const promo: Promotion = { id: `pr${Date.now()}`, code, kind: p.kind, value, months, endsOn: p.endsOn || undefined, maxUses: p.maxUses ? Math.round(Number(p.maxUses)) : undefined, uses: 0, status: 'active', created: new Date().toISOString() };
    sup((d) => { d.platform.promotions.unshift(promo); }, { action: 'Promotion added', detail: `${code}: ${promoText(promo)}` }, `${code} added`);
    setP({ code: '', kind: 'percent', value: '', months: '3', endsOn: '', maxUses: '' });
  };
  const setStatus = (x: Promotion, status: Promotion['status'], verb: string) =>
    sup((d) => { d.platform.promotions.find((y) => y.id === x.id)!.status = status; }, { action: `Promotion ${verb}`, detail: x.code }, `${x.code} ${verb}`);

  return (
    <>
      <PageHead eyebrow="Super user" title="Price & promotions" sub="The Landlord plan price and promo codes" />
      <section className="sp-card sp-sec" id="price">
        <h2 className="sp-h3">Landlord plan price</h2>
        <p className="sp-price-now"><strong>{fmtMoney(cur, 2)}</strong> per unit, a month</p>
        <p className="sp-small">Shown on the website's Pricing page. A new price applies to new subscribers only: everyone else keeps the price they signed up at.</p>
        {groups.length > 0 && <ul className="sp-mini">{groups.map(([c, n]) => <li key={c}>{plural(n, 'subscriber')} at {fmtMoney(c, 2)}</li>)}</ul>}
        {canEdit ? (
          <form className="sp-inline-form" onSubmit={savePrice}>
            <label className="field"><span className="label">New price per unit, a month ($)</span><input id="sp-price" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
            <button className="btn primary" disabled={!okPrice || cents === cur}>Save price</button>
          </form>
        ) : <OnlySuper />}
      </section>

      <section className="sp-card sp-sec" id="promotions">
        <h2 className="sp-h3">Promotions</h2>
        {s.platform.promotions.length === 0 ? <p className="sp-muted">No promo codes yet.</p> : (
          <ul className="sp-rows">{s.platform.promotions.map((x) => (
            <li key={x.id}>
              <span><strong className="sp-code">{x.code}</strong><span>{promoText(x)} · {x.uses}{x.maxUses ? ` of ${x.maxUses}` : ''} used{x.endsOn ? ` · ends ${fmtDate(x.endsOn)}` : ''}</span></span>
              <span className="btn-row">
                <Status tone={PROMO_TONE[x.status]}>{PROMO_LABEL[x.status]}</Status>
                {canEdit && x.status === 'active' && <button className="btn small ghost" onClick={() => setStatus(x, 'paused', 'paused')}>Pause</button>}
                {canEdit && x.status === 'paused' && <button className="btn small ghost" onClick={() => setStatus(x, 'active', 'resumed')}>Resume</button>}
                {canEdit && x.status !== 'ended' && <button className="btn small ghost" onClick={() => setStatus(x, 'ended', 'ended')}>End</button>}
              </span>
            </li>
          ))}</ul>
        )}
        {canEdit ? (
          <form className="sp-promo-form" onSubmit={addPromo}>
            <label className="field"><span className="label">Code</span><input id="promo-code" className="input" value={p.code} onChange={(e) => setP({ ...p, code: e.target.value.toUpperCase() })} placeholder="SPRING25" maxLength={24} /></label>
            <label className="field"><span className="label">Discount</span><select id="promo-kind" className="input" value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value as Promotion['kind'] })}><option value="percent">% off</option><option value="amount">$ off a month</option></select></label>
            <label className="field"><span className="label">{p.kind === 'percent' ? 'Percent' : 'Dollars'}</span><input id="promo-value" className="input" inputMode="decimal" value={p.value} onChange={(e) => setP({ ...p, value: e.target.value })} placeholder={p.kind === 'percent' ? '25' : '5.00'} /></label>
            <label className="field"><span className="label">For (months)</span><input id="promo-months" className="input" inputMode="numeric" value={p.months} onChange={(e) => setP({ ...p, months: e.target.value })} /></label>
            <label className="field"><span className="label">Ends on (optional)</span><input id="promo-ends" className="input" type="date" value={p.endsOn} onChange={(e) => setP({ ...p, endsOn: e.target.value })} /></label>
            <label className="field"><span className="label">Most uses (optional)</span><input id="promo-max" className="input" inputMode="numeric" value={p.maxUses} onChange={(e) => setP({ ...p, maxUses: e.target.value })} /></label>
            <button className="btn primary" disabled={!okPromo}>Add code</button>
            {taken && <p className="sp-small acct-error">That code already exists.</p>}
          </form>
        ) : <OnlySuper />}
        <p className="sp-small">Landlords enter a code when they upgrade to the Landlord plan. Codes start working at checkout once card payments (Stripe) are on.</p>
      </section>
    </>
  );
}

// ---------------- Banks ----------------
export function Banks() {
  const s = useSupport();
  const canEdit = isSuper(s);
  const b = s.platform.banks;
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const list = [...POPULAR_BANKS, ...OTHER_BANKS].filter((x) => !term || x.toLowerCase().includes(term));
  const toggleAll = () => sup((d) => { d.platform.banks.enabled = !b.enabled; },
    { action: b.enabled ? 'Bank connection turned off' : 'Bank connection turned on', detail: 'For everyone' }, b.enabled ? 'Bank connection is off for everyone' : 'Bank connection is on');
  const toggle = (name: string, off: boolean) => sup((d) => { d.platform.banks.off = off ? d.platform.banks.off.filter((x) => x !== name) : [...d.platform.banks.off, name]; },
    { action: off ? 'Bank turned on' : 'Bank turned off', detail: name }, `${name} ${off ? 'turned on' : 'turned off'}`);
  return (
    <>
      <PageHead eyebrow="Super user" title="Banks" sub="Which banks landlords can connect" />
      <section className="sp-card sp-sec">
        <div className="sp-card-head"><h2 className="sp-h3">Bank connection</h2><Status tone={b.enabled ? 'good' : 'bad'}>{b.enabled ? 'On' : 'Off for everyone'}</Status></div>
        <p className="sp-small">{isLive()
          ? 'Landlords see "Coming soon" until the bank service (Flinks) is connected. These switches are kept and apply from then.'
          : 'Preview: the sample app simulates bank connections, and follows these switches.'}</p>
        {canEdit ? <button id="banks-all" className={`btn${b.enabled ? ' ghost danger' : ' primary'}`} onClick={toggleAll}>{b.enabled ? 'Turn off for everyone' : 'Turn on for everyone'}</button> : <OnlySuper />}
      </section>
      <section className="sp-card sp-sec">
        <div className="sp-card-head"><h2 className="sp-h3">Banks{b.off.length ? ` · ${b.off.length} turned off` : ''}</h2>
          <label className="sp-filter-q"><Icon name="search" size={16} /><span className="sr-only">Find a bank</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a bank" /></label></div>
        <ul className="sp-rows sp-bank-list">{list.map((name) => {
          const off = b.off.includes(name);
          return (
            <li key={name}>
              <span><strong>{name}</strong><span>{!b.enabled ? 'Off (bank connection is off for everyone)' : off ? 'Turned off: landlords see "Not available right now"' : 'Available'}</span></span>
              <span className="btn-row">{canEdit ? <button className="btn small ghost" onClick={() => toggle(name, off)}>{off ? 'Turn on' : 'Turn off'}</button> : <Status tone={off ? 'off' : 'good'}>{off ? 'Off' : 'On'}</Status>}</span>
            </li>
          );
        })}</ul>
      </section>
    </>
  );
}

// ---------------- Connections (API keys) ----------------
type Field = { name: string; label: string; secret: boolean; options?: string[]; hint?: string; env: string; optional?: boolean; source: 'dashboard' | 'render' | 'none' | 'unreadable'; value?: string; last4?: string; updatedAt?: string; updatedBy?: string };
type Service = ServiceInfo & { state: ServiceState; fields: Field[] };
type ConnData = { canSave: boolean; services: Service[] };
const SOURCE: Record<Field['source'], [string, 'good' | 'warn' | 'off' | 'bad']> = {
  dashboard: ['Saved here', 'good'], render: ['From Render', 'good'], none: ['Not set', 'off'], unreadable: ['Cannot be read (KEYS_SECRET changed?)', 'bad'],
};
const STATE_TONE: Record<ServiceState, 'good' | 'warn' | 'off'> = { connected: 'good', saved: 'good', off: 'warn', none: 'off' };
const GROUPS: { id: ServiceInfo['group']; title: string; sub: string }[] = [
  { id: 'now', title: 'In use', sub: 'Working in Keyholder today, as soon as their keys are set.' },
  { id: 'coming', title: 'Coming', sub: 'Being built. Keys can be saved now; they are used once each feature is ready.' },
];
/** Browser-only preview: the same list with sample statuses (there is no server, so nothing can be saved). */
const PREVIEW_STATE: Record<ServiceId, ServiceState> = { google: 'connected', email: 'off', places: 'none', stripe: 'none', flinks: 'none', avm: 'none' };
const previewData = (): ConnData => ({
  canSave: false,
  services: SERVICES.map((svc) => ({
    ...svc, state: PREVIEW_STATE[svc.id],
    fields: KEY_FIELDS.filter((f) => f.service === svc.id).map((f) => {
      const on = PREVIEW_STATE[svc.id] !== 'none' && !f.optional;
      return { ...f, source: on ? 'render' as const : 'none' as const, value: on && !f.secret ? (f.options ? f.options[0] : 'sample') : undefined, last4: on && f.secret ? 'a1b2' : undefined };
    }),
  })),
});

export function Connections() {
  const s = useSupport();
  const preview = !isLive();
  const [data, setData] = useState<ConnData | null>(preview ? previewData() : null);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<Record<string, { ok: boolean | null; message: string } | 'testing'>>({});
  useEffect(() => { if (!preview && isSuper(s)) api<ConnData>('GET', '/api/admin/connections').then(setData).catch((e) => setErr((e as Error).message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const changes = Object.keys(edit).length;
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!changes || !password || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await api<ConnData & { saved: number }>('PUT', '/api/admin/connections', { password, values: Object.fromEntries(Object.entries(edit).map(([k, v]) => [k, v.trim() || null])) });
      setData(r); setEdit({}); setPassword(''); toast(`Saved (${plural(r.saved, 'change')}).`);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const test = async (id: string) => {
    setTests((t) => ({ ...t, [id]: 'testing' }));
    try { const r = await api<{ ok: boolean | null; message: string }>('POST', '/api/admin/connections/test', { service: id }); setTests((t) => ({ ...t, [id]: r })); }
    catch (x) { setTests((t) => ({ ...t, [id]: { ok: false, message: (x as Error).message } })); }
  };

  const head = <PageHead eyebrow="Super user" title="Connections" sub="Every outside service Keyholder uses, and its API keys" />;
  if (!preview && !isSuper(s)) return <>{head}<section className="sp-card sp-sec"><OnlySuper /></section></>;
  if (!data) return <>{head}<section className="sp-card sp-sec">{err ? <p className="acct-error">{err}</p> : <p className="sp-muted">Loading…</p>}</section></>;
  const editable = !preview && data.canSave;
  const card = (svc: Service) => {
    const t = tests[svc.id];
    return (
      <section key={svc.id} className="sp-card sp-sec sp-conn" id={`conn-${svc.id}`}>
        <div className="sp-card-head"><h2 className="sp-h3">{svc.name}</h2><Status tone={STATE_TONE[svc.state]}>{STATE_LABEL[svc.state]}{svc.state === 'saved' ? ' · being built' : ''}</Status></div>
        <p className="sp-small">{svc.what}</p>
        <details className="sp-howto"><summary>How to get the keys</summary><p className="sp-small">{svc.howTo}</p></details>
        <div className="sp-keys">{svc.fields.map((f) => {
          const [label, tone] = SOURCE[f.source];
          const id = `key-${f.name.replace('.', '-')}`;
          // A choice that is not set uses its default: email sending off.
          const now = f.secret ? (f.last4 ? `•••• ${f.last4}` : '') : f.options ? OPTION_LABEL[f.value ?? (f.name === 'email.provider' ? 'log' : '')] ?? f.value ?? '' : (f.value ?? '');
          return (
            <div key={f.name} className="sp-key">
              <div className="sp-key-now">
                <label htmlFor={id}><strong>{f.label}</strong></label>
                <span><Status tone={tone}>{label}</Status>{now && <code>{now}</code>}{f.updatedBy && f.updatedAt && <span className="sp-muted"> · {f.updatedBy}, {fmtDate(f.updatedAt.slice(0, 10))}</span>}</span>
              </div>
              <div className="sp-key-edit">
                {f.options
                  ? <select id={id} className="input" value={edit[f.name] ?? f.value ?? ''} disabled={!editable} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })}><option value="" disabled>Choose</option>{f.options.map((o) => <option key={o} value={o}>{OPTION_LABEL[o] ?? o}</option>)}</select>
                  : <input id={id} className="input" type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={f.source === 'none' ? (f.hint ?? 'Paste it here') : 'Paste a new value to replace it'} value={edit[f.name] ?? ''} disabled={!editable} onChange={(e) => { const v = e.target.value; setEdit((x) => { const n = { ...x }; if (v) n[f.name] = v; else delete n[f.name]; return n; }); }} />}
                {editable && f.source === 'dashboard' && !(f.name in edit) && <button type="button" className="btn small ghost" onClick={() => setEdit({ ...edit, [f.name]: '' })} title={`Use Render's ${f.env} instead`}>Remove</button>}
                {f.name in edit && edit[f.name] === '' && <span className="sp-small sp-muted">Will be removed</span>}
              </div>
            </div>
          );
        })}</div>
        {!preview && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn small" onClick={() => test(svc.id)} disabled={t === 'testing'}><Icon name="bolt" size={14} />{t === 'testing' ? 'Testing…' : 'Test'}</button>
            {t && t !== 'testing' && <span className={`sp-small sp-test ${t.ok === true ? 'ok' : t.ok === false ? 'bad' : 'info'}`} role="status"><Icon name={t.ok === true ? 'check' : t.ok === false ? 'alert' : 'info'} size={14} />{t.message}</span>}
          </div>
        )}
      </section>
    );
  };
  return (
    <>
      {head}
      {preview && <section className="sp-card sp-sec callout" id="conn-preview"><strong>Preview: sample statuses.</strong> <span className="sp-small">There is no server here, so nothing can be saved or tested. On the live site you add and change these keys on this page.</span></section>}
      {!preview && !data.canSave && (
        <section className="sp-card sp-sec callout warn" id="keys-secret">
          <strong>One step first: add KEYS_SECRET in Render.</strong>
          <p className="sp-small">Keys saved here are locked with it. In Render: your Keyholder service → Environment → Add variable → Name <code>KEYS_SECRET</code>, Value: a long random password (32+ characters, keep a copy somewhere safe). Save, wait for the restart, then come back. Until then keys can only be set in Render.</p>
        </section>
      )}
      <form onSubmit={save}>
        {GROUPS.map((g) => (
          <div key={g.id} className="sp-conn-group" id={`group-${g.id}`}>
            <h2 className="sp-h2">{g.title}</h2>
            <p className="sp-small sp-muted">{g.sub}</p>
            {data.services.filter((svc) => svc.group === g.id).map(card)}
          </div>
        ))}
        {!preview && (
          <section className={`sp-card sp-sec sp-conn-save${changes ? ' on' : ''}`}>
            <p className="sp-small">Keys you save here take over from Render's. Saving asks for your password, and every change is in Privacy &amp; audit.</p>
            <div className="sp-inline-form">
              <label className="field"><span className="label">Your password</span><input id="conn-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!changes} /></label>
              <button className="btn primary" disabled={!changes || !password || busy || !data.canSave}>{busy ? 'Saving…' : changes ? `Save ${plural(changes, 'change')}` : 'No changes'}</button>
            </div>
            {err && <p className="sp-small acct-error" role="alert">{err}</p>}
          </section>
        )}
      </form>
    </>
  );
}
