import { PageSub } from '../components/Guide';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import type { Applicant, Lease, Listing, Notice, Tenant, Unit } from '../data/types';
import { currentLine, unitTenant, useStore } from '../data/store';
import { activeLeases, byRoom, hasSpace, openRooms, roomsLine } from '../lib/finance';
import { applicantPeople } from '../lib/people';
import { addDays, daysBetween, fmtDate, fmtDay, fmtPeriod } from '../lib/dates';
import { arrears, earliestIncrease, nextNotice, propertyOf } from '../lib/notices';
import { rentVsMarket } from '../lib/silver';
import { AUTHORITY_URL, formsFor } from '../lib/forms';
import { FormWizard } from '../components/FormWizard';
import { reminderStage, trayItems } from '../lib/tray';
import { province } from '../lib/jurisdiction';
import { fmt, fmt0 } from '../lib/money';
import { propertyLevel } from '../lib/levels';
import { byValue } from '../lib/score';
import { PaymentForm, PropertyForm, TenancyForm, UnitForm } from '../components/forms';
import { Drawer, Empty, Field, MoneyInput, Seg, Stamp } from '../components/ui';
import { Icon } from '../components/Icon';
import { ReminderDrawer } from './Tray';
import { SceneEmptyHome } from '../components/Art';

// Rentals: every property and unit, and everything about running them.

export function Rentals() {
  const { state, today } = useStore();
  const [addProp, setAddProp] = useState(false);
  const props = byValue(state, today);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="title-ic"><span className="tile-ic sky" aria-hidden><Icon name="home" size={22} /></span>Rentals</h1><PageSub>Your properties, units and tenants. Find tenants, raise rent and send notices here.</PageSub></div>
        <button className="btn" onClick={() => setAddProp(true)}><Icon name="plus" size={16} />Add property</button>
      </div>
      {!props.length && <div className="sheet"><Empty title="No properties yet." art={<SceneEmptyHome />} action={<button className="btn primary" onClick={() => setAddProp(true)}>Add your first property</button>}>Start with the address. Units and tenants come next.</Empty></div>}
      {props.map((p) => <PropertyBlock key={p.id} propertyId={p.id} />)}
      {addProp && <PropertyForm onClose={() => setAddProp(false)} />}
    </div>
  );
}

function PropertyBlock({ propertyId }: { propertyId: string }) {
  const { state } = useStore();
  const p = state.properties.find((x) => x.id === propertyId)!;
  const units = state.units.filter((u) => u.propertyId === p.id);
  return (
    <section className="section">
      <Link to={`/rent/property/${p.id}`} className={`prop-strip ${propertyLevel(state, p)}`}>
        <span><strong>{p.nickname}</strong><span>{p.address}, {p.city}</span></span>
        <span className="prop-strip-go">Open <Icon name="next" size={18} /></span>
      </Link>
      <div className="sheet tight">
        {units.length === 0 ? <Empty title="No units yet." action={<Link className="btn" to={`/rent/property/${p.id}`}>Add a unit</Link>} /> : (
          <ul className="unit-list">{units.map((u) => <UnitRow key={u.id} unit={u} />)}</ul>
        )}
      </div>
    </section>
  );
}

/**
 * One row per unit: who lives there, this month's rent, and the one action that matters.
 * A unit rented by the room gets a row per rented room, and one for its free rooms.
 */
export function UnitRow({ unit }: { unit: Unit }) {
  const { state, today } = useStore();
  if (!byRoom(unit)) {
    const { lease, tenant } = unitTenant(state, unit.id, today);
    return lease && tenant ? <LeaseRow unit={unit} lease={lease} tenant={tenant} /> : <VacantRow unit={unit} />;
  }
  const free = openRooms(state, unit, today);
  return (
    <>
      {activeLeases(state, unit.id, today).map((l) => {
        const t = state.tenants.find((x) => x.id === l.tenantId);
        return t ? <LeaseRow key={l.id} unit={unit} lease={l} tenant={t} /> : null;
      })}
      {free.length > 0 && <VacantRow unit={unit} free={free} />}
    </>
  );
}

/** An empty unit, or the free rooms of a unit rented by the room. */
function VacantRow({ unit, free }: { unit: Unit; free?: string[] }) {
  const { state, today } = useStore();
  const nav = useNavigate();
  const listing = state.listings.find((l) => l.unitId === unit.id);
  const apps = state.applicants.filter((a) => a.unitId === unit.id && (a.status === 'new' || a.status === 'shortlisted' || a.status === 'offered'));
  const since = listing?.vacantSince ?? state.leases.filter((l) => l.unitId === unit.id && l.end).map((l) => l.end!).sort().pop();
  const days = since ? Math.max(0, daysBetween(since, today)) : 0;
  const lost = Math.round((unit.rent * (free?.length ?? 1) * 12 * days) / 365);
  const what = !free ? 'Empty' : free.length === 1 ? `${free[0]} is free` : `${free.length} rooms are free`;
  return (
    <li className="unit-row vacant">
      <span className={`unit-label${unit.label.length > 2 ? ' long' : ''}`}>{unit.label}</span>
      <span className="unit-who"><strong>{what}{days ? ` for ${days} days` : ''}</strong><span>{free ? `${roomsLine(state, unit, today)} · ` : ''}{listing ? `Asking ${fmt0(listing.askingRent)}` : `Last rent ${fmt0(unit.rent)}`}{days ? ` · about ${fmt0(lost)} rent lost` : ''}</span></span>
      <span className="unit-state">{apps.length ? <span className="status due">{apps.length} application{apps.length > 1 ? 's' : ''}</span> : <span className="status vacant">No applications</span>}</span>
      <button className="btn primary" onClick={() => nav(`/rent/property/${unit.propertyId}/find`)}>Find a tenant</button>
    </li>
  );
}

/** A lease: the whole unit's (one or several people), or one room's. */
function LeaseRow({ unit, lease, tenant }: { unit: Unit; lease: Lease; tenant: Tenant }) {
  const { state, today } = useStore();
  const nav = useNavigate();
  const [pay, setPay] = useState(false);
  const [late, setLate] = useState<Lease | null>(null);
  const [raise, setRaise] = useState(false);
  const line = currentLine(state, lease, today)!;
  // A deposit waiting to be confirmed for this tenant: show it instead of "late".
  const found = trayItems(state, today).some((t) => t.kind === 'match' && t.suggestion?.leaseId === lease.id);
  const isLate = !found && (line.state === 'late' || (line.state === 'partial' && line.daysLate > 0));
  return (
    <li className={`unit-row ${isLate ? 'late' : ''}`}>
      <span className={`unit-label${unit.label.length > 2 ? ' long' : ''}`}>{unit.label}</span>
      <Link to={`/rent/tenant/${tenant.id}`} className="unit-who"><strong>{tenant.names.join(' & ')}</strong><span>{lease.room ? `${lease.room} · ` : ''}{fmt(lease.rent)} a month{tenant.names.length > 1 ? ' · shared lease' : ''}</span></Link>
      <span className="unit-state">
        {line.state === 'paid' && <span className="status paid"><Icon name="check" size={16} />Paid</span>}
        {isLate && <span className="status late">Late · {line.daysLate} days</span>}
        {(line.state === 'due' || line.state === 'upcoming') && <span className="status due">{line.state === 'due' ? 'Due today' : `Due ${fmtDay(line.due)}`}</span>}
        {found && line.state !== 'paid' && <span className="status due">Payment found</span>}
      </span>
      <span className="row-act">
        {found && line.state !== 'paid' ? <button className="btn primary" onClick={() => nav('/today')}>Confirm</button> : isLate ? <button className="btn primary" onClick={() => setLate(lease)}>Late rent options</button>
          : line.state !== 'paid' ? <button className="btn" onClick={() => setPay(true)}>Mark paid</button> : null}
        <UnitMenu onRaise={() => setRaise(true)} />
      </span>
      <RaiseRentSuggestion lease={lease} unit={unit} onRaise={() => setRaise(true)} />
      {raise && <RaiseRent lease={lease} onClose={() => setRaise(false)} />}
      {pay && <PaymentForm leaseId={lease.id} onClose={() => setPay(false)} />}
      {late && <LateRentDrawer lease={late} onClose={() => setLate(null)} />}
    </li>
  );
}

// =====================================================================================
// Units and tenants tab (property page)
// =====================================================================================
export function UnitsTab({ propertyId }: { propertyId: string }) {
  const { state, today } = useStore();
  const [unitEdit, setUnitEdit] = useState<string | 'new' | null>(null);
  const [addTenant, setAddTenant] = useState(false);
  const units = state.units.filter((u) => u.propertyId === propertyId);
  return (
    <>
      <section className="section">
        <h2 className="section-title">Units and tenants <span className="btn-row"><button className="btn small ghost" onClick={() => setUnitEdit('new')}><Icon name="plus" size={14} />Add unit</button>{units.length > 0 && <button className="btn small" onClick={() => setAddTenant(true)}><Icon name="plus" size={14} />Add tenant</button>}</span></h2>
        <div className="sheet tight">
          {units.length ? <ul className="unit-list">{units.map((u) => <UnitRow key={u.id} unit={u} />)}</ul> : <Empty title="No units yet." action={<button className="btn" onClick={() => setUnitEdit('new')}>Add a unit</button>}>A whole house counts as one unit.</Empty>}
        </div>
        {units.length > 0 && <div className="btn-row" style={{ marginTop: 8 }}>{units.map((u) => <button key={u.id} className="btn small ghost" onClick={() => setUnitEdit(u.id)}>Edit unit {u.label}</button>)}</div>}
      </section>
      {unitEdit && <UnitForm propertyId={propertyId} unit={unitEdit === 'new' ? undefined : state.units.find((u) => u.id === unitEdit)} onClose={() => setUnitEdit(null)} />}
      {addTenant && <TenancyForm unitId={units.find((u) => hasSpace(state, u, today))?.id} onClose={() => setAddTenant(false)} />}
    </>
  );
}

// =====================================================================================
// Find a tenant: listing, application form link, applications
// =====================================================================================
const SAFE_DECLINE = ['The unit has been rented to another applicant', 'Income does not meet the rent-to-income guideline', 'Could not verify references', 'Move-in date does not work'];

export function FindTenantTab({ propertyId }: { propertyId: string }) {
  const { state, today } = useStore();
  const empty = state.units.filter((u) => u.propertyId === propertyId && hasSpace(state, u, today));
  if (!empty.length) return <div className="sheet"><Empty title="Every unit is rented.">When a unit or a room is free, you can list it and send the application form from here.</Empty></div>;
  return <>{empty.map((u) => <FindTenantUnit key={u.id} unit={u} />)}</>;
}

function FindTenantUnit({ unit }: { unit: Unit }) {
  const { state, act, today } = useStore();
  const existing = state.listings.find((l) => l.unitId === unit.id);
  const [l, setL] = useState<Listing>(existing ?? { unitId: unit.id, askingRent: unit.rent, available: addDays(today, 14), notes: '', vacantSince: today, slug: `${unit.propertyId}-${unit.label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
  const [send, setSend] = useState(false);
  const [preview, setPreview] = useState(false);
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState<Applicant | null>(null);
  const apps = state.applicants.filter((a) => a.unitId === unit.id).sort((a, b) => b.submitted.localeCompare(a.submitted));
  const live = apps.filter((a) => a.status !== 'declined');
  const link = `https://keyholder.ca/apply/${l.slug}`;
  const days = Math.max(0, daysBetween(l.vacantSince, today));
  const free = byRoom(unit) ? openRooms(state, unit, today) : null;
  const what = !free ? 'empty' : free.length === 1 ? `${free[0]} free` : `${free.length} rooms free`;

  return (
    <section className="section">
      <h2 className="section-title">Unit {unit.label} · {what} for {days} days <span className="small urgent">about {fmt0(Math.round((unit.rent * (free?.length ?? 1) * 12 * days) / 365))} rent lost so far</span></h2>
      {free && <p className="small soft" style={{ margin: '-8px 0 16px' }}>Rented by the room: {roomsLine(state, unit, today)}. Each room gets its own tenant, lease and rent, and applications stay open until every room is taken.</p>}
      <div className="split">
        <div className="sheet">
          <h3 style={{ marginBottom: 12 }}>1. Your listing</h3>
          <div className="grid2">
            <Field label="Asking rent" htmlFor={`ls-r-${unit.id}`}><MoneyInput id={`ls-r-${unit.id}`} value={l.askingRent} onChange={(c) => setL({ ...l, askingRent: c ?? 0 })} /></Field>
            <Field label="Available from" htmlFor={`ls-d-${unit.id}`}><input id={`ls-d-${unit.id}`} type="date" className="input" value={l.available} onChange={(e) => setL({ ...l, available: e.target.value })} /></Field>
          </div>
          <Field label={free ? 'About the room' : 'About the unit'} htmlFor={`ls-n-${unit.id}`}><textarea id={`ls-n-${unit.id}`} className="input" style={{ minHeight: 80 }} value={l.notes} onChange={(e) => setL({ ...l, notes: e.target.value })} placeholder="Bedrooms, laundry, parking, what's nearby" /></Field>
          <button className="btn" onClick={() => act.saveListing(l)}>Save listing</button>
        </div>
        <div className="sheet">
          <h3 style={{ marginBottom: 8 }}>2. Send the application form</h3>
          <p className="small soft" style={{ marginTop: 0 }}>People fill it in on their phone. No account needed.</p>
          <div className="copy-row"><code>{link}</code></div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => setSend(true)}><Icon name="mail" size={16} />Send by email or text</button>
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(link).catch(() => undefined); }}>Copy link</button>
            <button className="btn ghost" onClick={() => setPreview(true)}>See the form</button>
          </div>
          <QR text={link} />
        </div>
      </div>

      <div className="sheet tight" style={{ marginTop: 16 }}>
        <div className="sheet-head"><h3>3. Applications ({live.length})</h3>{live.length > 1 && <button className="btn small" onClick={() => setCompare(true)}>Compare side by side</button>}</div>
        {apps.length === 0 ? <Empty title="No applications yet.">Send the form to people who ask about the unit.</Empty> : (
          <ul className="unit-list">{apps.map((a) => (
            <li key={a.id} className="unit-row">
              <span className="unit-label"><Icon name="user" /></span>
              <button className="unit-who as-link" onClick={() => setOpen(a)}><strong>{a.names.join(' & ')}</strong><span>Applied {fmtDate(a.submitted)} · {a.names.length > 1 ? 'household income' : 'income'} {fmt0(a.monthlyIncome)}/mo ({(a.monthlyIncome / l.askingRent).toFixed(1)}× rent)</span></button>
              <span className="unit-state"><span className={`status ${a.status === 'declined' ? 'vacant' : a.status === 'offered' || a.status === 'accepted' ? 'paid' : 'due'}`}>{({ new: 'New', shortlisted: 'Shortlisted', declined: 'Declined', offered: 'Offer sent', accepted: 'Accepted' })[a.status]}</span></span>
              <button className="btn" onClick={() => setOpen(a)}>Review</button>
            </li>
          ))}</ul>
        )}
      </div>

      {send && <SendFormDrawer unit={unit} link={link} onClose={() => setSend(false)} />}
      {preview && <ApplicationFormPreview unit={unit} listing={l} onClose={() => setPreview(false)} />}
      {open && <ApplicantDrawer applicant={open} listing={l} onClose={() => setOpen(null)} />}
      {compare && (
        <Drawer title="Compare applications" onClose={() => setCompare(false)} wide>
          <div className="table-scroll"><table className="ledger">
            <tbody>
              {([['Applicants', (a: Applicant) => a.names.join(' & ')], ['People living there', (a: Applicant) => String(a.occupants ?? '—')], ['Move-in', (a: Applicant) => fmtDate(a.moveIn)], ['Rent as % of income', (a: Applicant) => `${Math.round((l.askingRent / (a.monthlyIncome + (a.otherIncome ?? 0))) * 100)}%`], ['Work', (a: Applicant) => (a.people?.length ? a.people.map((x) => `${x.name.split(' ')[0]}: ${x.jobTitle ? `${x.jobTitle}, ` : ''}${x.employer} (${fmt0(x.monthlyIncome)})`).join(' · ') : `${a.jobTitle ?? ''} ${a.employer} · ${a.employedYears ?? '?'} yrs`)], ['Current home', (a: Applicant) => `${a.yearsAtAddress} yrs · rent ${a.currentRent ? fmt0(a.currentRent) : '—'}`], ['Why moving', (a: Applicant) => a.reasonLeaving ?? '—'], ['Landlord reference', (a: Applicant) => (a.assessment?.landlordRef ? 'Checked' : 'Not yet')], ['Employer confirmed', (a: Applicant) => (a.assessment?.employerRef ? 'Yes' : 'Not yet')], ['Credit score', (a: Applicant) => (a.assessment?.creditScore ? String(a.assessment.creditScore) : '—')], ['Documents', (a: Applicant) => a.documents?.join(', ') || 'None'], ['Pets / smoking', (a: Applicant) => `${a.pets ? 'Pets' : 'No pets'} · ${a.smoking ? 'Smokes' : 'Non-smoking'}`], ['Your rating', (a: Applicant) => (a.assessment?.rating ? `${a.assessment.rating} / 5` : '—')]] as [string, (a: Applicant) => string][]).map(([k, f]) => (
                <tr key={k}><td className="soft">{k}</td>{live.map((a) => <td key={a.id}>{f(a)}</td>)}</tr>
              ))}
            </tbody>
          </table></div>
          <p className="tiny soft">Tip: many landlords look for income of about 3× the rent. In Ontario a "no pets" clause in a lease can't be enforced, so decide on pets before you sign.</p>
        </Drawer>
      )}
    </section>
  );
}

function QR({ text }: { text: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#1B2421', light: '#FFFDF8' } }).then(setSvg).catch(() => setSvg('')); }, [text]);
  if (!svg) return null;
  return (
    <div className="qr"><div className="qr-img" dangerouslySetInnerHTML={{ __html: svg }} /><span className="small soft">QR code for a sign at the door or in the window.</span></div>
  );
}

function SendFormDrawer({ unit, link, onClose }: { unit: Unit; link: string; onClose: () => void }) {
  const { act } = useStore();
  const [to, setTo] = useState('');
  const [how, setHow] = useState<'email' | 'text'>('email');
  return (
    <Drawer title={`Send the form for Unit ${unit.label}`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!to.trim()} onClick={() => { act.sendApplicationLink(unit.label, to); onClose(); }}>Send</button></>}>
      <Field label="Send by"><Seg label="Send by" value={how} onChange={setHow} options={[{ id: 'email', label: 'Email' }, { id: 'text', label: 'Text message' }]} /></Field>
      <Field label={how === 'email' ? 'Their email' : 'Their mobile number'} htmlFor="sf-to"><input id="sf-to" className="input" type={how === 'email' ? 'email' : 'tel'} value={to} onChange={(e) => setTo(e.target.value)} autoFocus /></Field>
      <div className="letter"><div className="body">{`Hi,\n\nThanks for your interest in Unit ${unit.label}. You can apply here, it takes about 5 minutes:\n${link}\n\nThanks!`}</div></div>
      <p className="tiny soft" style={{ marginTop: 8 }}>Preview only: nothing is sent yet.</p>
    </Drawer>
  );
}

function ApplicationFormPreview({ unit, listing, onClose }: { unit: Unit; listing: Listing; onClose: () => void }) {
  const { state } = useStore();
  const p = state.properties.find((x) => x.id === unit.propertyId);
  const sections: [string, string[]][] = [
    ['People', ['Legal name, email and phone of every adult who will live there', 'How many people will live in the unit', 'Emergency contact']],
    ['Where you live now', ['Address and how long', 'Rent you pay now', 'Current landlord name and phone', 'Why you are moving']],
    ['Before that', ['Previous address and how long (going back 3 years)']],
    ['Work and income', ['Employer, job title and how long', 'Employer contact for verification', 'Monthly income before tax', 'Other income: amount and source']],
    ['The tenancy', ['Move-in date', 'How long you would like to stay', 'Vehicles needing parking', 'Pets: type and number', 'Smoking: yes or no']],
    ['References', ['One more reference (optional)']],
    ['Documents', ['Photo ID', 'Proof of income: recent pay stubs or an employment letter', 'Credit report, if you have one']],
    ['Consent', ['I agree the landlord may contact my references and employer', 'I agree to a credit check (your SIN is optional and never required)', 'Declined applications are deleted after 90 days']],
  ];
  return (
    <Drawer title="The application form" onClose={onClose} wide>
      <div className="letter">
        <div className="serif" style={{ fontSize: 'var(--t-20)' }}>Apply for Unit {unit.label}, {p?.address}</div>
        <p className="small">{fmt0(listing.askingRent)} a month · available {fmtDate(listing.available)}</p>
        {sections.map(([h, qs]) => <div key={h} style={{ marginBottom: 12 }}><strong>{h}</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{qs.map((q) => <li key={q}>{q}</li>)}</ul></div>)}
      </div>
      <div className="callout" style={{ marginTop: 16 }}><strong>Fair by design.</strong> The form never asks about family status, children, age, religion, ethnicity, place of origin, disability or receipt of public assistance, which the Ontario Human Rights Code protects. Questions can't be added.</div>
    </Drawer>
  );
}

function ApplicantDrawer({ applicant, listing, onClose }: { applicant: Applicant; listing: Listing; onClose: () => void }) {
  const { state, act, today } = useStore();
  const a = state.applicants.find((x) => x.id === applicant.id) ?? applicant; // live, so checklist ticks show at once
  const [mode, setMode] = useState<'view' | 'decline' | 'accept'>('view');
  const [reason, setReason] = useState(SAFE_DECLINE[0]);
  const [start, setStart] = useState(a.moveIn > today ? a.moveIn : addDays(today, 7));
  const [rent, setRent] = useState<number | undefined>(listing.askingRent);
  const unit = state.units.find((u) => u.id === a.unitId);
  const free = unit && byRoom(unit) ? openRooms(state, unit, today) : [];
  const [room, setRoom] = useState(free[0] ?? '');
  const lastRoom = free.length <= 1;
  return (
    <Drawer title={a.names.join(' & ')} onClose={onClose} footer={mode === 'view' ? (
      <>
        {a.status !== 'declined' && a.status !== 'accepted' && <button className="btn ghost danger" onClick={() => setMode('decline')}>Decline</button>}
        {a.status === 'new' && <button className="btn" onClick={() => { act.setApplicantStatus(a.id, 'shortlisted'); onClose(); }}>Shortlist</button>}
        {(a.status === 'new' || a.status === 'shortlisted') && <button className="btn" onClick={() => { act.setApplicantStatus(a.id, 'offered'); onClose(); }}>Send offer</button>}
        {a.status !== 'declined' && a.status !== 'accepted' && <button className="btn primary" onClick={() => setMode('accept')}>Accept</button>}
      </>
    ) : mode === 'decline' ? (
      <><button className="btn ghost" onClick={() => setMode('view')}>Back</button><button className="btn primary" onClick={() => { act.setApplicantStatus(a.id, 'declined'); onClose(); }}>Send decline</button></>
    ) : (
      <><button className="btn ghost" onClick={() => setMode('view')}>Back</button><button className="btn primary" disabled={!rent || (free.length > 0 && !room)} onClick={() => { act.acceptApplicant(a.id, start, rent!, room || undefined); onClose(); }}>Make them the tenant</button></>
    )}>
      {mode === 'view' && <ApplicantDetails a={a} rent={listing.askingRent} />}
      {mode === 'decline' && (
        <>
          <Field label="Reason (only fair reasons are offered)">
            <div className="stack">{SAFE_DECLINE.map((r) => <label key={r} className="check"><input type="radio" name="decline" checked={reason === r} onChange={() => setReason(r)} />{r}</label>)}</div>
          </Field>
          <div className="letter"><div className="body">{`Hi ${a.names[0].split(' ')[0]},\n\nThank you for applying. ${reason}, so we won't be moving forward with your application this time.\n\nWe wish you the best in your search.`}</div></div>
        </>
      )}
      {mode === 'accept' && (
        <>
          <p style={{ marginTop: 0 }}>{free.length
            ? `${a.names.join(' & ')} ${a.names.length > 1 ? 'rent' : 'rents'} ${room || 'a room'}, with their own lease. ${lastRoom ? 'That fills the last room, so other applicants get a polite decline.' : 'Other applications stay open for the rooms still free.'}`
            : `${a.names.join(' & ')} become the tenants. A lease is drafted with these terms, and other applicants get a polite decline.`}</p>
          {free.length > 1 && <Field label="Which room?"><Seg label="Which room?" value={room} onChange={setRoom} options={free.map((r) => ({ id: r, label: r }))} /></Field>}
          <div className="grid2">
            <Field label="Lease starts" htmlFor="ac-s"><input id="ac-s" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Monthly rent" htmlFor="ac-r"><MoneyInput id="ac-r" value={rent} onChange={setRent} /></Field>
          </div>
        </>
      )}
    </Drawer>
  );
}

// =====================================================================================
// Late rent: reminder → notice (N4) → tribunal application (L1)
// =====================================================================================
export function LateRentDrawer({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const { state, today } = useStore();
  const [step, setStep] = useState<'menu' | 'reminder' | string>('menu');
  const tenant = state.tenants.find((t) => t.id === lease.tenantId)!;
  const prop = propertyOf(state, lease)!;
  const a = arrears(state, lease, today);
  const next = nextNotice(state, lease, today);
  const line = currentLine(state, lease, today)!;
  const st = reminderStage(Math.max(1, line.daysLate), state.profile.graceDays, state.profile.reminderTone);
  const forms = formsFor(prop.province, 'late-rent');
  const done = state.notices.filter((n) => n.leaseId === lease.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  if (step === 'reminder') return <ReminderDrawer lease={lease} period={a.periods[a.periods.length - 1]?.period ?? line.period} tone={st?.tone ?? 'gentle'} onClose={onClose} />;
  if (step !== 'menu') return <FormWizard lease={lease} formId={step} onClose={onClose} />;
  return (
    <Drawer title={`Late rent · ${tenant.names.join(' & ')}`} onClose={onClose}>
      <p style={{ marginTop: 0 }}><strong>{fmt(a.total)} owing</strong> for {a.periods.map((p) => fmtPeriod(p.period)).join(', ')}.</p>
      <ol className="late-steps">
        <li>
          <div><strong>Send a reminder</strong><span>Most late rent is paid after a friendly note.</span></div>
          <button className="btn" onClick={() => setStep('reminder')}>Write reminder</button>
        </li>
        {forms.map((f) => {
          const isNext = next?.form.id === f.id;
          const used = done.find((n) => n.formId === f.id);
          return (
            <li key={f.id} className={isNext ? '' : 'muted'}>
              <div><strong>{f.code} · {f.title}</strong><span>{f.plain}</span></div>
              {isNext ? <button className="btn primary" onClick={() => setStep(f.id)}>Prepare</button> : <span className="small soft">{used ? (used.status === 'voided-by-payment' ? 'Paid' : 'Done') : 'Not yet'}</span>}
            </li>
          );
        })}
      </ol>
      {done.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 8px' }}>Notices so far</h3>
          <ul className="rows">{done.map((n) => <li key={n.id} className="row"><span className="margin">{n.servedOn ? fmtDate(n.servedOn) : '—'}</span><span>{n.kind}{n.arrears ? ` · ${fmt(n.arrears)}` : ''}{n.terminationDate ? ` · by ${fmtDate(n.terminationDate)}` : ''}</span><Stamp kind={n.status === 'voided-by-payment' ? 'superseded' : 'served'}>{statusLabel(n.status)}</Stamp></li>)}</ul>
        </>
      )}
      <p className="tiny soft" style={{ marginTop: 16 }}>{province(prop.province).name} · {province(prop.province).tribunal}. Keyholder prepares documents; you decide and sign. <a href={AUTHORITY_URL[prop.province]} target="_blank" rel="noopener noreferrer">Official site</a></p>
    </Drawer>
  );
}

export const statusLabel = (s: Notice['status']) => ({ served: 'Served', 'voided-by-payment': 'Paid', filed: 'Ready', signed: 'Signed' })[s];

// =====================================================================================
// Notices tab (property page)
// =====================================================================================
export function NoticesTab({ propertyId }: { propertyId: string }) {
  const { state, today } = useStore();
  const [late, setLate] = useState<Lease | null>(null);
  const unitIds = state.units.filter((u) => u.propertyId === propertyId).map((u) => u.id);
  const leases = state.leases.filter((l) => unitIds.includes(l.unitId));
  const owing = leases.filter((l) => arrears(state, l, today).total > 0);
  const notices = state.notices.filter((n) => leases.some((l) => l.id === n.leaseId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <section className="section">
        <h2 className="section-title">Rent owing</h2>
        <div className="sheet">
          {owing.length === 0 ? <p className="soft" style={{ margin: 0 }}>No one owes rent. Nothing to do.</p> : (
            <ul className="rows">{owing.map((l) => {
              const t = state.tenants.find((x) => x.id === l.tenantId)!;
              const a = arrears(state, l, today);
              return <li key={l.id} className="row" style={{ gridTemplateColumns: '1fr auto' }}><span><span className="title">{t.names.join(' & ')}</span><span className="sub" style={{ display: 'block' }}>{fmt(a.total)} owing</span></span><button className="btn primary" onClick={() => setLate(l)}>Late rent options</button></li>;
            })}</ul>
          )}
        </div>
      </section>
      <section className="section">
        <h2 className="section-title">Notices served</h2>
        <div className="sheet">
          {notices.length === 0 ? <p className="soft" style={{ margin: 0 }}>No notices yet.</p> : (
            <ul className="rows">{notices.map((n) => {
              const t = state.tenants.find((x) => x.id === n.tenantId);
              return <li key={n.id} className="row"><span className="margin">{n.servedOn ? fmtDate(n.servedOn) : '—'}</span><span><span className="title">{n.kind} · {t?.names.join(' & ')}</span><span className="sub" style={{ display: 'block' }}>{fmt(n.arrears)} · {n.serveMethod} by {n.servedBy}{n.terminationDate ? ` · pay by ${fmtDate(n.terminationDate)}` : ''}</span></span><Stamp kind={n.status === 'voided-by-payment' ? 'superseded' : 'served'}>{statusLabel(n.status)}</Stamp></li>;
            })}</ul>
          )}
        </div>
      </section>
      {late && <LateRentDrawer lease={late} onClose={() => setLate(null)} />}
    </>
  );
}

const money = (c?: number) => (c ? fmt0(c) : '—');

function PersonKV({ label, name, contact }: { label: string; name: string; contact: string }) {
  return <><div>{label}</div><div style={{ fontFamily: 'inherit' }}>{name}{contact && <><br /><span className="soft">{contact}</span></>}</div></>;
}

function ApplicantDetails({ a, rent }: { a: Applicant; rent: number }) {
  const { act } = useStore();
  const income = a.monthlyIncome + (a.otherIncome ?? 0);
  const pct = income ? Math.round((rent / income) * 100) : 0;
  const as = a.assessment ?? {};
  const setA = (p: Partial<NonNullable<Applicant['assessment']>>) => act.updateApplicant(a.id, { assessment: { ...as, ...p } });
  const checks: [keyof NonNullable<Applicant['assessment']>, string][] = [['landlordRef', 'Landlord reference checked'], ['employerRef', 'Employer confirmed income'], ['idSeen', 'Photo ID seen'], ['docsReceived', 'Proof of income received'], ['creditChecked', 'Credit checked']];
  return (
    <>
      <div className="assess-top">
        <div><span className="small soft">Rent is</span><strong className={pct > 40 ? 'urgent' : ''}>{pct}% of income</strong></div>
        <div><span className="small soft">At current home</span><strong>{a.yearsAtAddress} yrs</strong></div>
        <div><span className="small soft">In current job</span><strong>{a.employedYears ?? '—'} yrs</strong></div>
      </div>
      <h3 style={{ margin: '16px 0 6px' }}>People</h3>
      <div className="kv">
        <div>People living there</div><div>{a.occupants ?? '—'}</div>
        {applicantPeople(a).map((x, i) => (
          <PersonKV key={i} label={a.names.length > 1 ? `Applicant ${i + 1}` : 'Applicant'} name={x.name} contact={[x.email, x.phone].filter(Boolean).join(' · ')} />
        ))}
        <div>Emergency contact</div><div style={{ fontFamily: 'inherit' }}>{a.emergencyContact ?? '—'}</div>
      </div>
      <h3 style={{ margin: '16px 0 6px' }}>Rental history</h3>
      <div className="kv">
        <div>Lives at</div><div style={{ fontFamily: 'inherit' }}>{a.currentAddress} · {a.yearsAtAddress} yrs</div>
        <div>Rent there</div><div>{money(a.currentRent)}</div>
        <div>Landlord</div><div style={{ fontFamily: 'inherit' }}>{a.landlordName ? `${a.landlordName}, ${a.landlordPhone ?? ''}` : a.references}</div>
        <div>Why moving</div><div style={{ fontFamily: 'inherit' }}>{a.reasonLeaving ?? '—'}</div>
        <div>Before that</div><div style={{ fontFamily: 'inherit' }}>{a.previousAddress ? `${a.previousAddress} · ${a.previousYears ?? '?'} yrs` : '—'}</div>
      </div>
      <h3 style={{ margin: '16px 0 6px' }}>Work and income</h3>
      <div className="kv">
        {a.people?.length ? a.people.map((x) => (
          <PersonKV key={x.name} label={x.name.split(' ')[0]} name={`${x.jobTitle ? `${x.jobTitle} · ` : ''}${x.employer}`} contact={`${fmt0(x.monthlyIncome)} a month`} />
        )) : <><div>Work</div><div style={{ fontFamily: 'inherit' }}>{a.jobTitle ? `${a.jobTitle} · ` : ''}{a.employer}</div></>}
        <div>How long</div><div>{a.employedYears ? `${a.employedYears} yrs` : '—'}</div>
        <div>Employer contact</div><div style={{ fontFamily: 'inherit' }}>{a.employerContact ?? '—'}</div>
        <div>{a.people && a.people.length > 1 ? 'Household income' : 'Monthly income'}</div><div>{fmt0(a.monthlyIncome)}{a.otherIncome ? ` + ${fmt0(a.otherIncome)} (${a.otherIncomeSource})` : ''}</div>
      </div>
      <h3 style={{ margin: '16px 0 6px' }}>The tenancy</h3>
      <div className="kv">
        <div>Move in</div><div>{fmtDate(a.moveIn)}</div>
        <div>Wants to stay</div><div style={{ fontFamily: 'inherit' }}>{a.leaseTerm ?? '—'}</div>
        <div>Vehicles</div><div>{a.vehicles ?? '—'}</div>
        <div>Pets / smoking</div><div>{a.pets ? `Yes${a.notes ? ` (${a.notes})` : ''}` : 'No pets'} · {a.smoking ? 'Smokes' : 'Non-smoking'}</div>
        <div>Other reference</div><div style={{ fontFamily: 'inherit' }}>{a.references}</div>
        <div>Documents</div><div style={{ fontFamily: 'inherit' }}>{a.documents?.join(', ') || 'None yet'}</div>
        <div>Credit check</div><div>{a.creditConsent ? 'Consent given' : 'No consent'}</div>
      </div>
      <h3 style={{ margin: '20px 0 6px' }}>Your assessment</h3>
      <div className="assess-checks">{checks.map(([k, label]) => (
        <label key={k} className="check"><input type="checkbox" checked={!!as[k]} onChange={(e) => setA({ [k]: e.target.checked })} />{label}</label>
      ))}</div>
      <div className="grid2">
        <Field label="Credit score" htmlFor={`cs-${a.id}`}><input id={`cs-${a.id}`} className="input" inputMode="numeric" value={as.creditScore ?? ''} onChange={(e) => setA({ creditScore: e.target.value ? Number(e.target.value) : undefined })} placeholder="e.g. 720" /></Field>
        <div className="field"><span className="label">Your rating</span><div className="btn-row">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`btn small${(as.rating ?? 0) >= n ? ' primary' : ''}`} onClick={() => setA({ rating: n })} aria-label={`${n} out of 5`}>{n}</button>)}</div></div>
      </div>
      <Field label="Your notes" htmlFor={`an-${a.id}`}><textarea id={`an-${a.id}`} className="input" style={{ minHeight: 70 }} value={as.notes ?? ''} onChange={(e) => setA({ notes: e.target.value })} placeholder="Called the landlord: always paid on time" /></Field>
      <p className="tiny soft">Look at the whole picture: rental history, references and income together. Income alone can't be the reason to say no.</p>
    </>
  );
}

// =====================================================================================
// Raising the rent: a suggestion when rent is below the local estimate, and always one tap away
// =====================================================================================
export function RaiseRent({ lease, onClose }: { lease: Lease; onClose: () => void }) {
  const { state } = useStore();
  const prop = propertyOf(state, lease)!;
  return <FormWizard lease={lease} formId={formsFor(prop.province, 'rent-increase')[0].id} onClose={onClose} />;
}

function UnitMenu({ onRaise }: { onRaise: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="row-menu">
      <button className="btn ghost small dots" aria-label="More options" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && <span className="row-menu-pop" role="menu"><button role="menuitem" onClick={() => { setOpen(false); onRaise(); }}>Raise rent</button></span>}
    </span>
  );
}

/** The rent suggestion: shown only when the rent is meaningfully below what similar units rent for nearby. */
export function rentSuggestion(state: ReturnType<typeof useStore>['state'], lease: Lease, unit: Unit, today: string) {
  const prop = propertyOf(state, lease);
  if (!prop || lease.end) return null;
  const mk = rentVsMarket(prop, unit);
  if (mk.gap <= 5000) return null;
  const form = formsFor(prop.province, 'rent-increase')[0];
  const effective = earliestIncrease(state, lease, today, form);
  const noticeBy = addDays(effective, -(form.noticeDays ?? 90));
  const guide = province(prop.province).rentIncreaseGuidelinePct;
  const capped = guide ? Math.round(lease.rent * (1 + guide / 100)) : undefined;
  return { mk, form, effective, noticeBy, guide, capped, prov: prop.province, beds: unit.bedrooms };
}

function RaiseRentSuggestion({ lease, unit, onRaise }: { lease: Lease; unit: Unit; onRaise: () => void }) {
  const { state, today } = useStore();
  const sg = rentSuggestion(state, lease, unit, today);
  if (!sg) return null;
  return (
    <div className="suggest">
      <div>
        <strong>Rent is about {fmt0(sg.mk.gap)} below similar {sg.beds}-bedrooms nearby ({fmt0(sg.mk.market)}).</strong>
        <span> You can raise it from {fmtDate(sg.effective)}{sg.capped ? `, up to ${fmt(sg.capped)} with the ${sg.guide}% guideline` : ''}. Give notice by {fmtDate(sg.noticeBy)}.</span>
        <span className="tiny soft"> Area rents are estimates.</span>
      </div>
      <button className="btn" onClick={onRaise}>Raise rent</button>
    </div>
  );
}
