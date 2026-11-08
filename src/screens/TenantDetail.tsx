import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Payment, Receipt } from '../data/types';
import { useStore } from '../data/store';
import { fmtDate, fmtPeriod, fmtTime } from '../lib/dates';
import { leaseBalance, leaseLedger } from '../lib/finance';
import { fmt } from '../lib/money';
import { Letterhead, ReceiptLetter, methodLabel, ordinal } from '../components/domain';
import { PaymentForm } from '../components/forms';
import { LateRentDrawer } from './Rentals';
import { SituationPicker } from '../components/FormWizard';
import { Drawer, Empty, Field, SlideToConfirm, Stamp, embedded } from '../components/ui';
import { Icon } from '../components/Icon';

export function TenantDetail() {
  const { id } = useParams();
  const { state, act, today } = useStore();
  const [pay, setPay] = useState(false);
  const [correct, setCorrect] = useState<Payment | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [statement, setStatement] = useState(false);
  const [pause, setPause] = useState(false);
  const [end, setEnd] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [late, setLate] = useState(false);
  const [forms, setForms] = useState(false);
  const t = state.tenants.find((x) => x.id === id);
  if (!t) return <div className="page"><Empty title="That tenant isn't here." action={<Link to="/rentals" className="btn">Back to Rent</Link>} /></div>;
  const lease = state.leases.filter((l) => l.tenantId === t.id).sort((a, b) => b.start.localeCompare(a.start))[0];
  const unit = state.units.find((u) => u.id === lease?.unitId);
  const prop = state.properties.find((p) => p.id === unit?.propertyId);
  const lines = lease ? leaseLedger(lease, state.payments, today).reverse() : [];
  const bal = lease ? leaseBalance(lease, state.payments, today) : 0;
  const msgs = state.messages.filter((m) => m.tenantId === t.id && m.status === 'sent').sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
  const voided = state.payments.filter((p) => p.leaseId === lease?.id && p.voided);

  return (
    <div className="page">
      <Link to={prop ? `/rent/property/${prop.id}` : "/rentals"} className="crumb"><Icon name="back" size={16} />{prop?.nickname ?? "Rentals"}</Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">{prop?.nickname} · Unit {unit?.label}</div>
          <h1>{t.names.join(' & ')}</h1>
          <div className="soft small">{t.email || 'No email'} · {t.phone || 'No phone'}</div>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setStatement(true)}><Icon name="print" size={16} />Statement</button>
          {lease && <button className="btn" onClick={() => setForms(true)}>Forms and notices</button>}
          {bal > 0 && lease && !lease.end && <button className="btn danger" onClick={() => setLate(true)}>Late rent options</button>}
          {lease && !lease.end && <button className="btn primary" onClick={() => setPay(true)}><Icon name="check" size={16} />Confirm rent</button>}
        </div>
      </div>

      <div className="split">
        <div>
          <div className="figures" style={{ marginBottom: 24 }}>
            <div><div className="label">Balance</div><span className={bal > 0 ? 'urgent' : ''}>{bal > 0 ? <span className="figure sm">{fmt(bal)}</span> : <span className="figure sm">{bal < 0 ? `${fmt(-bal)} cr` : 'Paid up'}</span>}</span></div>
            <div><div className="label">Rent</div><span className="figure sm">{fmt(lease?.rent ?? 0)}</span><div className="tiny soft">Due the {ordinal(lease?.dueDay ?? 1)}</div></div>
            <div><div className="label">On time, 12 mo</div><span className="figure sm">{(() => { const l12 = lines.slice(0, 12).filter((l) => l.due < today); const ok = l12.filter((l) => l.payments.length && l.payments[0].date <= l.due).length; return l12.length ? `${ok}/${l12.length}` : '—'; })()}</span></div>
          </div>

          <section className="section">
            <h2 className="section-title">Ledger</h2>
            {lines.length === 0 ? <div className="sheet"><Empty title="The lease hasn't started yet." /></div> : (
              <div className="sheet tight table-scroll">
                <table className="ledger">
                  <thead><tr><th>Due</th><th>Period</th><th className="num">Charge</th><th>Received</th><th className="num">Paid</th><th className="num">Balance</th><th>State</th></tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.period}>
                        <td className="date">{fmtDate(l.due)}</td>
                        <td>{fmtPeriod(l.period)}</td>
                        <td className="num">{fmt(l.charge)}</td>
                        <td className="small">
                          {l.payments.map((p) => {
                            const r = state.receipts.find((x) => x.paymentId === p.id && x.status !== 'superseded');
                            return (
                              <div key={p.id} className="spread" style={{ gap: 6, justifyContent: 'flex-start' }}>
                                <span className="mono">{fmtDate(p.date)}</span><span className="soft">{methodLabel(p.method)}{p.source !== 'manual' ? ` · ${p.source === 'bank' ? 'bank' : 'email'}` : ''}</span>
                                {r && <button className="btn small ghost" onClick={() => setReceipt(r)}>#{r.number}{r.status === 'draft' ? ' (draft)' : ''}</button>}
                                <button className="btn small ghost" onClick={() => setCorrect(p)} aria-label="Correct payment"><Icon name="edit" size={14} /></button>
                              </div>
                            );
                          })}
                        </td>
                        <td className="num">{l.paid ? fmt(l.paid) : '—'}</td>
                        <td className={`num ${l.balance > 0 ? 'urgent' : ''}`}>{fmt(l.balance)}</td>
                        <td><Stamp kind={l.state}>{l.state === 'late' ? `Late ${l.daysLate}d` : l.state}</Stamp></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {voided.length > 0 && <p className="tiny soft" style={{ marginTop: 8 }}>{voided.length} voided entr{voided.length === 1 ? 'y' : 'ies'} kept in the audit trail.</p>}
          </section>

          <section className="section">
            <h2 className="section-title">Messages sent</h2>
            <div className="sheet">
              {msgs.length === 0 ? <p className="soft small">Nothing sent yet. Every receipt and reminder will be listed here automatically.</p> : (
                <ul className="rows">{msgs.slice(0, 12).map((m) => (
                  <li key={m.id} className="row"><span className="margin">{fmtDate(m.sentAt!.slice(0, 10))}</span>
                    <span><span className="title">{m.kind === 'receipt' ? 'Rent receipt' : `${m.tone ?? ''} reminder`}</span><span className="sub" style={{ display: 'block' }}>{m.period ? fmtPeriod(m.period) : ''} · sent {fmtTime(m.sentAt!)}</span></span>
                    <Stamp kind="sent">Sent</Stamp></li>
                ))}</ul>
              )}
            </div>
          </section>
        </div>

        <aside>
          <div className="sheet">
            <div className="spread" style={{ marginBottom: 8 }}><h2>Lease</h2></div>
            {lease && (
              <div className="kv">
                <div>Start</div><div>{fmtDate(lease.start)}</div>
                {lease.end && <><div>Ended</div><div>{fmtDate(lease.end)}</div></>}
                <div>Paid by</div><div>{methodLabel(lease.paymentMethod)}</div>
                <div>Last month's rent</div><div>{fmt(lease.lmrDeposit)}</div>
                <div>Utilities</div><div style={{ fontFamily: 'inherit' }}>{lease.utilities || '—'}</div>
                <div>Parking / pets</div><div>{lease.parking ? 'Yes' : 'No'} / {lease.pets ? 'Yes' : 'No'}</div>
                <div>Email notices</div><div>{t.emailConsent ? `Consented ${t.emailConsentDate ? fmtDate(t.emailConsentDate) : ''}` : 'Not consented'}</div>
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn small" onClick={() => setEditContact(true)}>Edit contact</button>
              {lease && !lease.end && <button className="btn small ghost danger" onClick={() => setEnd(true)}>End tenancy</button>}
            </div>
          </div>
          <div className="sheet">
            <h2 style={{ marginBottom: 8 }}>Reminders</h2>
            {t.remindersPaused ? (
              <><p className="small">Paused: <em>{t.remindersPaused}</em></p><button className="btn small" onClick={() => act.setPause(t.id)}><Icon name="play" size={14} />Resume reminders</button></>
            ) : (
              <><p className="small soft">{state.profile.reminderTone[0].toUpperCase() + state.profile.reminderTone.slice(1)} tone. Drafted the day after rent is due, again on day 3, and firm at the end of your {state.profile.graceDays}-day grace period.</p>
                <button className="btn small" onClick={() => setPause(true)}><Icon name="pause" size={14} />Pause for this tenant</button></>
            )}
          </div>
          {t.aliases.length > 0 && (
            <div className="sheet"><h2 style={{ marginBottom: 8 }}>Known payers</h2><p className="small soft">Deposits from these names match {t.names[0].split(' ')[0]} automatically:</p><p className="mono small">{t.aliases.join(', ')}</p></div>
          )}
        </aside>
      </div>

      {pay && lease && <PaymentForm leaseId={lease.id} onClose={() => setPay(false)} />}
      {correct && <PaymentForm correct={correct} onClose={() => setCorrect(null)} />}
      {receipt && (
        <Drawer title={`Receipt #${receipt.number}`} onClose={() => setReceipt(null)} wide
          footer={<>{receipt.status !== 'superseded' && <button className="btn ghost danger" onClick={() => { act.voidPayment(receipt.paymentId); setReceipt(null); }}>Undo this payment</button>}{!embedded && <button className="btn" onClick={() => window.print()}><Icon name="print" size={16} />Print or save PDF</button>}</>}>
          <ReceiptLetter receipt={receipt} />
          <p className="letter-foot">{receipt.status === 'sent' ? `Sent ${fmtDate(receipt.sentAt!.slice(0, 10))} at ${fmtTime(receipt.sentAt!)}` : receipt.status === 'draft' ? 'Draft — waiting for your approval in the tray' : 'Superseded by a corrected receipt'}</p>
        </Drawer>
      )}
      {statement && lease && (
        <Drawer title="Tenant ledger statement" onClose={() => setStatement(false)} wide footer={embedded ? undefined : <button className="btn primary" onClick={() => window.print()}><Icon name="print" size={16} />Print or save PDF</button>}>
          <div className="letter print-me" style={{ maxWidth: 'none' }}>
            <Letterhead state={state} />
            <div className="serif" style={{ fontSize: 'var(--t-20)' }}>Ledger statement — {t.names.join(' & ')}</div>
            <p className="tiny">Unit {unit?.label}, {prop?.address}, {prop?.city} · prepared {fmtDate(today)}</p>
            <table>
              <tbody>
                <tr><td><strong>Due date</strong></td><td><strong>Received</strong></td><td><strong>Amount</strong></td><td><strong>Balance</strong></td></tr>
                {lines.slice().reverse().map((l) => (
                  <tr key={l.period}><td>{fmtDate(l.due)} · {fmt(l.charge)}</td><td>{l.payments.map((p) => fmtDate(p.date)).join(', ') || '—'}</td><td>{l.paid ? fmt(l.paid) : '—'}</td><td>{fmt(l.balance)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="tiny">Shows due date, date received, amount and allocation for each period, as tribunals expect for arrears and persistent-late-payment claims.</p>
          </div>
        </Drawer>
      )}
      {pause && <PauseDrawer onClose={() => setPause(false)} onSave={(r) => { act.setPause(t.id, r); setPause(false); }} />}
      {end && lease && (
        <EndDrawer onClose={() => setEnd(false)} onConfirm={(d) => { act.endTenancy(lease.id, d); setEnd(false); }} name={t.names.join(' & ')} />
      )}
      {editContact && <ContactDrawer onClose={() => setEditContact(false)} />}
      {late && lease && <LateRentDrawer lease={lease} onClose={() => setLate(false)} />}
      {forms && lease && <SituationPicker lease={lease} onClose={() => setForms(false)} />}
    </div>
  );

  function ContactDrawer({ onClose }: { onClose: () => void }) {
    const [email, setEmail] = useState(t!.email);
    const [phone, setPhone] = useState(t!.phone);
    const [consent, setConsent] = useState(t!.emailConsent);
    return (
      <Drawer title="Contact details" onClose={onClose} footer={<button className="btn primary" onClick={() => { act.saveTenant({ ...t!, email, phone, emailConsent: consent && !!email, emailConsentDate: consent && !t!.emailConsent ? today : t!.emailConsentDate, noticeMethod: consent && email ? 'email' : 'hand' }); onClose(); }}>Save</button>}>
        <Field label="Email" htmlFor="cd-e"><input id="cd-e" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone" htmlFor="cd-p"><input id="cd-p" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Consents to notices by email<span className="tiny soft" style={{ display: 'block' }}>Withdrawing consent switches legal notices to print and hand delivery.</span></span></label>
      </Drawer>
    );
  }
}

function PauseDrawer({ onClose, onSave }: { onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState('Agreed payment arrangement');
  return (
    <Drawer title="Pause reminders" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!reason.trim()} onClick={() => onSave(reason)}>Pause</button></>}>
      <Field label="Why?" htmlFor="pz-r" hint="Kept with the tenant file, so you remember later"><input id="pz-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <p className="small soft">The ledger keeps counting. Only the reminder drafts stop.</p>
    </Drawer>
  );
}

function EndDrawer({ onClose, onConfirm, name }: { onClose: () => void; onConfirm: (d: string) => void; name: string }) {
  const { today } = useStore();
  const [d, setD] = useState(today);
  return (
    <Drawer title="End tenancy" onClose={onClose}>
      <Field label="Last day of the tenancy" htmlFor="et-d"><input id="et-d" type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      <div className="callout warn">
        <strong>What happens:</strong> no further rent is charged to {name} after this date, the unit is marked vacant and the vacancy counter starts. The ledger and all receipts are kept.
      </div>
      <SlideToConfirm label="Slide to end tenancy" onConfirm={() => onConfirm(d)} />
    </Drawer>
  );
}
