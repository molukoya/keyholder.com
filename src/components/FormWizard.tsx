import { useMemo, useState } from 'react';
import type { Lease, Notice } from '../data/types';
import { useStore } from '../data/store';
import { addDays, fmtDate, fmtPeriod } from '../lib/dates';
import { AUTHORITY_URL, SITUATIONS, formById, formsFor, type FormDef, type Situation } from '../lib/forms';
import { province } from '../lib/jurisdiction';
import { fmt } from '../lib/money';
import { MAIL_EXTRA_DAYS, arrears, earliestIncrease, formChecks, n4NoticeDays, propertyOf, terminationDate } from '../lib/notices';
import { Letterhead } from './domain';
import { Drawer, Field, Seg, SlideToConfirm, Stamp } from './ui';
import { Icon } from './Icon';

// One screen for every form in every province: pre-filled from Keyholder's records, checked, approved
// with a deliberate slide, and recorded with how and when it was delivered (proof of service).

const ROOMS = ['Entrance and hallway', 'Kitchen', 'Living room', 'Bathroom', 'Bedroom 1', 'Bedroom 2', 'Windows and blinds', 'Smoke and CO alarms'];

export function FormWizard({ lease, formId, onClose }: { lease: Lease; formId: string; onClose: () => void }) {
  const { state, act, today } = useStore();
  const form = formById(formId)!;
  const tenant = state.tenants.find((t) => t.id === lease.tenantId)!;
  const unit = state.units.find((u) => u.id === lease.unitId)!;
  const prop = propertyOf(state, lease)!;
  const prov = province(prop.province);
  const guide = prov.rentIncreaseGuidelinePct;
  const [method, setMethod] = useState<Notice['serveMethod']>(form.kind === 'notice' ? (tenant.emailConsent ? 'email' : 'hand') : 'signed');
  const [servedOn, setServedOn] = useState(today);
  const [servedBy, setServedBy] = useState(state.profile.name);
  const [d, setD] = useState<Record<string, string>>(() => ({
    newRent: guide ? ((lease.rent * (1 + guide / 100)) / 100).toFixed(2) : ((lease.rent * 1.03) / 100).toFixed(2),
    effective: earliestIncrease(state, lease, today, form),
    endDate: addDays(today, 30),
    terminationDate: addDays(today, 14),
    moveType: 'Move-in',
  }));
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const a = arrears(state, lease, today);
  const checks = useMemo(() => formChecks(state, lease, form, method, today, d), [state, lease, form, method, today, d]);
  const ok = checks.every((c) => c.ok) && (form.kind !== 'notice' || !!servedBy.trim());
  const ends = form.kind === 'notice' && !form.noEnd && (form.situation === 'late-rent' || form.situation === 'damage' || form.situation === 'own-use');
  const auto = ends ? terminationDate(servedOn, method, form) : undefined;
  const end = ends ? auto ?? d.terminationDate : undefined;
  const fr = prop.province === 'QC';

  const approve = () => {
    act.serveNotice({
      formId: form.id, kind: form.code, leaseId: lease.id, tenantId: tenant.id,
      arrears: form.situation === 'late-rent' ? a.total : 0, periods: form.situation === 'late-rent' ? a.periods.map((p) => p.period) : [],
      serveMethod: method, servedOn, servedBy, terminationDate: end, details: d,
    });
    onClose();
  };

  return (
    <Drawer title={`${form.code} · ${form.title}`} onClose={onClose} wide>
      <p className="soft" style={{ marginTop: 0 }}>{form.plain}{form.note ? ` ${form.note}` : ''}</p>

      {/* What this form needs from you */}
      {form.situation === 'rent-increase' && (
        <div className="grid2">
          <Field label="New monthly rent" htmlFor="fw-rent" hint={`Now ${fmt(lease.rent)}${guide ? ` · ${guide}% guideline = ${fmt(Math.round(lease.rent * (1 + guide / 100)))}` : ''}`}><input id="fw-rent" className="input money" inputMode="decimal" value={d.newRent} onChange={(e) => set('newRent', e.target.value)} /></Field>
          <Field label="Starts on" htmlFor="fw-eff" hint="Earliest allowed date is filled in"><input id="fw-eff" type="date" className="input" value={d.effective} onChange={(e) => set('effective', e.target.value)} /></Field>
        </div>
      )}
      {form.situation === 'damage' && <Field label="What happened, with dates" htmlFor="fw-what"><textarea id="fw-what" className="input" value={d.what ?? ''} onChange={(e) => set('what', e.target.value)} placeholder="On Oct 3 the bathroom door was broken. Repair quote $420." /></Field>}
      {form.situation === 'own-use' && (
        <div className="grid2">
          <Field label="Who will live there" htmlFor="fw-who"><input id="fw-who" className="input" value={d.who ?? ''} onChange={(e) => set('who', e.target.value)} placeholder="Me / my daughter, Ana Morgan" /></Field>
          <Field label="Compensation owed to tenant" htmlFor="fw-comp" hint="Usually one month's rent"><input id="fw-comp" className="input" readOnly value={fmt(lease.rent)} /></Field>
        </div>
      )}
      {form.situation === 'end-agreement' && <Field label="Agreed last day" htmlFor="fw-end"><input id="fw-end" type="date" className="input" value={d.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>}
      {ends && !auto && (
        <Field label="Date the tenancy would end" htmlFor="fw-term" hint={`Check ${prov.name}'s minimum notice period before choosing.`}><input id="fw-term" type="date" className="input" value={d.terminationDate} onChange={(e) => set('terminationDate', e.target.value)} /></Field>
      )}
      {form.situation === 'inspection' && (
        <>
          <Field label="Inspection"><Seg label="Inspection" value={d.moveType} onChange={(v) => set('moveType', v)} options={[{ id: 'Move-in', label: 'Move-in' }, { id: 'Move-out', label: 'Move-out' }]} /></Field>
          <div className="sheet tight" style={{ marginBottom: 16 }}><table className="ledger"><tbody>{ROOMS.map((r) => (
            <tr key={r}><td>{r}</td><td style={{ width: 160 }}><select className="input" aria-label={`${r} condition`} value={d[r] ?? 'Good'} onChange={(e) => set(r, e.target.value)}><option>Good</option><option>Fair</option><option>Damaged</option></select></td></tr>
          ))}</tbody></table></div>
        </>
      )}

      {/* The prepared document */}
      <div className="letter">
        <Letterhead state={state} />
        <div className="spread"><div className="serif" style={{ fontSize: 'var(--t-20)' }}>{form.code}</div><Stamp kind="draft">Preview</Stamp></div>
        <div className="small" style={{ marginBottom: 8 }}>{form.title}</div>
        <table><tbody>
          <tr><td>{fr ? 'Locataire / Tenant' : 'Tenant'}</td><td>{tenant.names.join(' & ')}</td></tr>
          <tr><td>{fr ? 'Locateur / Landlord' : 'Landlord'}</td><td>{state.profile.name || '—'}</td></tr>
          <tr><td>{fr ? 'Logement / Rental unit' : 'Rental unit'}</td><td>Unit {unit.label}, {prop.address}, {prop.city}, {prop.province}</td></tr>
          {form.situation === 'late-rent' && a.periods.map((p) => <tr key={p.period}><td>Rent owing, {fmtPeriod(p.period)}</td><td>{fmt(p.owing)}</td></tr>)}
          {form.situation === 'late-rent' && <tr><td><strong>Total rent owing</strong></td><td><strong>{fmt(a.total)}</strong></td></tr>}
          {form.situation === 'rent-increase' && <><tr><td>Current rent</td><td>{fmt(lease.rent)}</td></tr><tr><td>New rent</td><td>${d.newRent}</td></tr><tr><td>Starting</td><td>{d.effective ? fmtDate(d.effective) : '—'}</td></tr></>}
          {form.situation === 'damage' && <tr><td>Reason</td><td>{d.what || '—'}</td></tr>}
          {form.situation === 'own-use' && <tr><td>Will move in</td><td>{d.who || '—'}</td></tr>}
          {form.situation === 'end-agreement' && <tr><td>Last day of tenancy</td><td>{fmtDate(d.endDate)}</td></tr>}
          {form.situation === 'lease' && <><tr><td>Start</td><td>{fmtDate(lease.start)}</td></tr><tr><td>Rent</td><td>{fmt(lease.rent)} due on day {lease.dueDay}</td></tr><tr><td>Deposit</td><td>{fmt(lease.lmrDeposit)}</td></tr><tr><td>Notices by email</td><td>{lease.emailNoticeConsent ? 'Agreed' : 'Not agreed'}</td></tr></>}
          {form.situation === 'inspection' && <tr><td>Inspection</td><td>{d.moveType} · {ROOMS.filter((r) => (d[r] ?? 'Good') !== 'Good').map((r) => `${r}: ${d[r]}`).join('; ') || 'All rooms in good condition'}</td></tr>}
          {end && <tr><td>{form.situation === 'late-rent' ? 'Pay by / termination date' : 'Termination date'}</td><td>{fmtDate(end)}</td></tr>}
        </tbody></table>
        <p className="tiny" style={{ color: '#55605B' }}>{form.official ? `Preview. The official ${prov.tribunal} form is filled in when Keyholder's backend is ready.` : `Keyholder template for ${prov.name}. Check it against the official rules.`} <a href={AUTHORITY_URL[prop.province]} target="_blank" rel="noopener noreferrer">Official site</a></p>
      </div>

      <h3 style={{ margin: '20px 0 8px' }}>Checks</h3>
      <ul className="checks">{checks.map((c) => <li key={c.text} className={!c.ok ? 'bad' : c.warn ? 'warn' : 'ok'}><Icon name={c.ok && !c.warn ? 'check' : 'alert'} size={18} />{c.text}</li>)}</ul>

      {form.kind === 'notice' && (
        <>
          <h3 style={{ margin: '20px 0 8px' }}>How it is delivered</h3>
          <Seg label="Delivery" value={method} onChange={setMethod} options={[{ id: 'email', label: 'Email' }, { id: 'hand', label: 'By hand' }, { id: 'mail-slot', label: 'Mail slot' }, { id: 'mail', label: 'Mail' }]} />
          <p className="small soft">{method === 'mail' ? `Mail adds ${MAIL_EXTRA_DAYS} days.` : form.id === 'on-n4' ? `At least ${n4NoticeDays(servedOn)} days' notice is given.` : form.noticeDays ? `At least ${form.noticeDays} days' notice.` : ''}</p>
          <div className="grid2">
            <Field label="Date delivered" htmlFor="fw-d"><input id="fw-d" type="date" className="input" value={servedOn} onChange={(e) => setServedOn(e.target.value)} /></Field>
            <Field label="Delivered by" htmlFor="fw-b"><input id="fw-b" className="input" value={servedBy} onChange={(e) => setServedBy(e.target.value)} /></Field>
          </div>
          <p className="small soft">Recorded as your proof of service.</p>
        </>
      )}
      {(form.kind === 'agreement' || form.kind === 'report') && <p className="small soft" style={{ marginTop: 16 }}>Both you and the tenant sign. Keyholder keeps the signed copy with the lease.</p>}

      <div className="callout warn" style={{ marginTop: 16 }}><strong>Before you approve:</strong> this is a legal document. Read it through. Keyholder prepares it; you make the decision.</div>
      {ok ? <SlideToConfirm label={form.kind === 'application' ? 'Slide to prepare the application' : form.kind === 'notice' ? 'Slide to approve and record' : 'Slide to approve'} onConfirm={approve} />
        : <p className="urgent small">Fix the checks above before approving.</p>}
    </Drawer>
  );
}

/** Pick a situation, then the right form for the property's province. */
export function SituationPicker({ lease, onClose, only }: { lease: Lease; onClose: () => void; only?: Situation }) {
  const { state } = useStore();
  const [sit, setSit] = useState<Situation | null>(only ?? null);
  const [form, setForm] = useState<FormDef | null>(null);
  const prop = propertyOf(state, lease)!;
  const tenant = state.tenants.find((t) => t.id === lease.tenantId)!;
  if (form) return <FormWizard lease={lease} formId={form.id} onClose={onClose} />;
  return (
    <Drawer title={sit ? SITUATIONS.find((s) => s.id === sit)!.label : `Forms for ${tenant.names[0]}`} onClose={onClose}>
      {!sit ? (
        <>
          <p className="soft" style={{ marginTop: 0 }}>What is happening? Keyholder picks the right {province(prop.province).name} form.</p>
          <div className="choices">{SITUATIONS.map((s) => <button key={s.id} className="choice" onClick={() => setSit(s.id)}><span className="t">{s.label}</span><span className="s">{s.hint}</span></button>)}</div>
        </>
      ) : (
        <>
          {!only && <button className="btn ghost small" onClick={() => setSit(null)} style={{ marginBottom: 12 }}><Icon name="back" size={14} />All situations</button>}
          <div className="stack">{formsFor(prop.province, sit).map((f) => (
            <button key={f.id} className="choice" onClick={() => setForm(f)}>
              <span className="t">{f.code} · {f.title}</span>
              <span className="s">{f.plain}</span>
              <span className="s">{f.official ? 'Official form' : 'Keyholder template'}{f.kind === 'application' ? ' · application to the tribunal' : ''}</span>
            </button>
          ))}</div>
        </>
      )}
    </Drawer>
  );
}
