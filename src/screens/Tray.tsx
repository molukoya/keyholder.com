import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lease, Message, Property, Tone } from '../data/types';
import { keyholderScore } from '../lib/score';
import { nextNotice } from '../lib/notices';
import { hasSilver, type Level } from '../lib/levels';
import { LevelUpForm, ScoreRing } from '../components/levels';
import { useStore } from '../data/store';
import { daysBetween, fmtPeriod } from '../lib/dates';
import { activeLease, leaseLedger } from '../lib/finance';
import { fmt } from '../lib/money';
import { reminderDraft, TONES } from '../lib/templates';
import { trayItems, type TrayItem } from '../lib/tray';
import { Letterhead, MessageEditor } from '../components/domain';
import { Drawer, Empty, Seg } from '../components/ui';
import { Icon } from '../components/Icon';

// The approval tray: a stack of paper slips, one primary and one secondary action each.

/** Everything that needs the owner, shown on Home: "Needs you now" and "Raise your Keyholder score". */
export function TodoSections() {
  const { state, act, today } = useStore();
  const nav = useNavigate();
  const items = useMemo(() => trayItems(state, today), [state, today]);
  const { score, todo } = useMemo(() => keyholderScore(state, today), [state, today]);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<Message | null>(null);
  const [rem, setRem] = useState<Extract<TrayItem, { kind: 'reminder' }> | null>(null);
  const [match, setMatch] = useState<Extract<TrayItem, { kind: 'match' }> | null>(null);
  const [form, setForm] = useState<{ p: Property; to: Level } | null>(null);
  const file = (id: string, fn: () => void) => { setLeaving((s) => new Set(s).add(id)); setTimeout(fn, 280); };
  const p = state.profile;
  const offerAuto = !p.autoSend && !p.autoSendOffered && p.approvedUnchanged >= 10;
  const name = (tenantId?: string) => state.tenants.find((x) => x.id === tenantId)?.names[0] ?? 'Tenant';
  const renewals = state.mortgages.filter((m) => { const n = daysBetween(today, m.termEnd); return n >= 0 && n <= 120; });
  const urgent = items.length + renewals.length;

  const [allScore, setAllScore] = useState(false);
  // Also needs you: new applications and notices whose next step is due.
  const newApps = state.units.map((u) => ({ u, n: state.applicants.filter((a) => a.unitId === u.id && a.status === 'new').length })).filter((x) => x.n > 0);
  const l1Ready = state.leases.filter((l) => nextNotice(state, l, today)?.kind === 'L1');
  const urgentAll = urgent + newApps.length + l1Ready.length;
  return (
    <>
      {offerAuto && (
        <div className="callout pine">
          <p style={{ margin: '0 0 8px' }}><strong>Want Keyholder to send receipts and reminders for you?</strong> You've approved {p.approvedUnchanged} without changes.</p>
          <div className="btn-row"><button className="btn primary" onClick={() => act.setAutoSend(true)}>Yes, send them</button><button className="btn ghost" onClick={() => act.setAutoSend(false)}>No, I'll keep checking</button></div>
        </div>
      )}

      <section className="section">
        <h2 className="section-title">Needs you now</h2>
        {urgentAll === 0 ? <div className="sheet"><Empty title="Nothing needs you right now.">Receipts, reminders, payments to confirm and applications show up here.</Empty></div> : (
          <div className="tray">
            {newApps.map(({ u, n }) => (
              <div key={`apps-${u.id}`} className="slip info">
                <div><div className="what">{n} new application{n > 1 ? 's' : ''} for Unit {u.label}</div><div className="why">{state.properties.find((x) => x.id === u.propertyId)?.nickname}</div></div>
                <div className="btn-row"><button className="btn primary" onClick={() => nav(`/rent/property/${u.propertyId}/find`)}>Review</button></div>
              </div>
            ))}
            {l1Ready.map((l) => (
              <div key={`l1-${l.id}`} className="slip urgent">
                <div><div className="what">{name(l.tenantId)}'s notice deadline has passed</div><div className="why">Rent is still owing. You can apply to the Landlord and Tenant Board.</div></div>
                <div className="btn-row"><button className="btn primary" onClick={() => nav(`/rent/property/${state.units.find((u) => u.id === l.unitId)?.propertyId}/notices`)}>See options</button></div>
              </div>
            ))}
            {renewals.map((m) => (
              <div key={m.id} className="slip urgent">
                <div><div className="what">Mortgage renews in {daysBetween(today, m.termEnd)} days</div><div className="why">{state.properties.find((x) => x.id === m.propertyId)?.nickname} · {m.lender} · compare rates now</div></div>
                <div className="btn-row"><button className="btn primary" onClick={() => nav(`/rent/property/${m.propertyId}/mortgage`)}>See mortgage</button></div>
              </div>
            ))}
            {items.map((it) => {
              const cls = `slip ${it.kind === 'reminder' ? 'urgent' : it.kind === 'match' ? 'info' : ''}${leaving.has(it.id) ? ' leaving' : ''}`;
              if (it.kind === 'message') {
                const t = state.tenants.find((x) => x.id === it.message.tenantId);
                const r = state.receipts.find((x) => x.id === it.message.receiptId);
                const pay = state.payments.find((x) => x.id === r?.paymentId);
                return (
                  <div key={it.id} className={cls}>
                    <div><div className="what">Send {t?.names[0]} a receipt</div><div className="why">{pay ? `${fmt(pay.amount)} for ${fmtPeriod(pay.period)}` : ''}</div></div>
                    <div className="btn-row"><button className="btn ghost" onClick={() => setMsg(it.message)}>Look first</button><button className="btn primary" disabled={!t?.email} onClick={() => file(it.id, () => act.approveMessage(it.message.id))}>Send</button></div>
                  </div>
                );
              }
              if (it.kind === 'reminder') {
                const t = state.tenants.find((x) => x.id === it.lease.tenantId);
                return (
                  <div key={it.id} className={cls}>
                    <div><div className="what">Remind {t?.names[0]} about rent</div><div className="why">{fmt(it.line.charge - it.line.paid)} · {it.line.daysLate} day{it.line.daysLate === 1 ? '' : 's'} late</div></div>
                    <div className="btn-row"><button className="btn ghost" onClick={() => file(it.id, () => act.skipReminder(it.lease, it.line.period, it.tone))}>Not now</button><button className="btn ghost" onClick={() => setRem(it)}>Look first</button><button className="btn primary" disabled={!t?.email} onClick={() => file(it.id, () => act.sendReminder(it.lease, it.line.period, it.tone))}>Send</button></div>
                  </div>
                );
              }
              const sg = it.suggestion;
              const lease = sg ? state.leases.find((l) => l.id === sg.leaseId) : undefined;
              return (
                <div key={it.id} className={cls}>
                  <div><div className="what">{fmt(it.txn.amount)} came in from {it.txn.payer}</div><div className="why">{sg ? `Is this ${name(lease?.tenantId)}'s rent?` : 'Whose rent is this?'}</div></div>
                  <div className="btn-row">
                    {sg ? <><button className="btn ghost" onClick={() => setMatch(it)}>Someone else</button><button className="btn primary" onClick={() => file(it.id, () => act.confirmMatch(it.txn.id, sg.leaseId, sg.period, true))}>Yes</button></>
                      : <><button className="btn ghost" onClick={() => file(it.id, () => act.ignoreTxn(it.txn.id))}>Not rent</button><button className="btn primary" onClick={() => setMatch(it)}>Choose tenant</button></>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="section" id="score">
        <h2 className="section-title">Raise your Keyholder score</h2>
        <div className="sheet">
          <div className="score-hero"><ScoreRing score={score} big /><p style={{ margin: 0 }}>{score >= 100 ? 'Everything is complete. Your numbers are as accurate as they can be.' : 'Each detail makes your numbers more accurate. Most valuable property first.'}</p></div>
          {todo.length > 0 && <ul className="rows">{(allScore ? todo : todo.slice(0, 3)).map((i) => (
            <li key={i.id} className="row" style={{ gridTemplateColumns: '56px 1fr auto' }}>
              <span className="pts">+{i.points - i.earned}</span>
              <span className="title">{i.text}</span>
              <button className="btn small" onClick={() => {
                const pr = state.properties.find((x) => x.id === i.propertyId);
                if (i.levelUp && pr) setForm({ p: pr, to: i.levelUp === 'gold' && !hasSilver(pr) ? 'silver' : i.levelUp });
                else nav(i.to);
              }}>Do it</button>
            </li>
          ))}</ul>}
          {todo.length > 3 && <button className="btn ghost small" onClick={() => setAllScore((x) => !x)}>{allScore ? 'Show fewer' : `Show all ${todo.length}`}</button>}
        </div>
      </section>

      {msg && <Drawer title="Receipt" onClose={() => setMsg(null)} wide><MessageEditor message={msg} onDone={() => setMsg(null)} /></Drawer>}
      {rem && <ReminderDrawer lease={rem.lease} period={rem.line.period} tone={rem.tone} onClose={() => setRem(null)} />}
      {match && <MatchDrawer item={match} onClose={() => setMatch(null)} />}
      {form && <LevelUpForm property={form.p} to={form.to} onClose={() => setForm(null)} />}
    </>
  );
}

export function ReminderDrawer({ lease, period, tone: initial, onClose }: { lease: Lease; period: string; tone: Tone; onClose: () => void }) {
  const { state, act, today } = useStore();
  const [tone, setTone] = useState<Tone>(initial);
  const draft = reminderDraft(state, lease, period, tone, today);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [touched, setTouched] = useState(false);
  const t = state.tenants.find((x) => x.id === lease.tenantId);
  const pick = (x: Tone) => { setTone(x); if (!touched) { const d = reminderDraft(state, lease, period, x, today); setSubject(d.subject); setBody(d.body); } };
  return (
    <Drawer title="Reminder" onClose={onClose} wide footer={<>
      <button className="btn ghost" onClick={() => { act.setPause(lease.tenantId, 'Paused from a reminder'); onClose(); }}><Icon name="pause" size={16} />Pause for {t?.names[0]}</button>
      <button className="btn primary" disabled={!t?.email} onClick={() => { act.sendReminder(lease, period, tone, touched ? { subject, body } : undefined); onClose(); }}>Send now</button>
    </>}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <Seg label="Tone" value={tone} onChange={pick} options={TONES.map((x) => ({ id: x.id, label: x.label }))} />
        <span className="small soft">{TONES.find((x) => x.id === tone)?.blurb}</span>
      </div>
      <div className="small soft" style={{ marginBottom: 8 }}>To: {t?.names.join(' & ')} &lt;{t?.email}&gt;</div>
      <div className="letter">
        <Letterhead state={state} />
        <input aria-label="Subject" value={subject} onChange={(e) => { setSubject(e.target.value); setTouched(true); }} style={{ fontWeight: 600, marginBottom: 8 }} />
        <textarea aria-label="Message" value={body} onChange={(e) => { setBody(e.target.value); setTouched(true); }} />
      </div>
      <p className="letter-foot">Sends now. Cancels automatically if payment arrives first.</p>
      {tone === 'firm' && <div className="callout">A reminder is not a legal notice. If rent stays unpaid, the formal step in Ontario is an N4 — Keyholder will prepare it once notices are added.</div>}
    </Drawer>
  );
}

function MatchDrawer({ item, onClose }: { item: Extract<TrayItem, { kind: 'match' }>; onClose: () => void }) {
  const { state, act, today } = useStore();
  const options = state.units.flatMap((u) => {
    const l = activeLease(state, u.id, today); if (!l) return [];
    const t = state.tenants.find((x) => x.id === l.tenantId)!;
    return leaseLedger(l, state.payments, today).filter((x) => x.paid < x.charge).map((x) => ({ lease: l, tenant: t, unit: u, line: x }));
  });
  const [sel, setSel] = useState(item.suggestion ? `${item.suggestion.leaseId}|${item.suggestion.period}` : options[0] ? `${options[0].lease.id}|${options[0].line.period}` : '');
  const [learn, setLearn] = useState(true);
  const [leaseId, period] = sel.split('|');
  const chosen = options.find((o) => o.lease.id === leaseId);
  return (
    <Drawer title={`${fmt(item.txn.amount)} from ${item.txn.payer}`} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={() => { act.ignoreTxn(item.txn.id); onClose(); }}>Not rent</button>
      <button className="btn primary" disabled={!sel} onClick={() => { act.confirmMatch(item.txn.id, leaseId, period, learn); onClose(); }}>This is their rent</button>
    </>}>
      {options.length === 0 ? <Empty title="No unpaid rent to match against." /> : (
        <div className="stack" role="radiogroup">
          {options.map((o) => {
            const v = `${o.lease.id}|${o.line.period}`;
            return (
              <button key={v} role="radio" aria-checked={sel === v} className="choice" style={{ width: '100%' }} onClick={() => setSel(v)}>
                <span className="t">{o.tenant.names.join(' & ')} — Unit {o.unit.label}</span>
                <span className="s">{fmtPeriod(o.line.period)} · {fmt(o.line.charge - o.line.paid)} owing</span>
              </button>
            );
          })}
        </div>
      )}
      {chosen && !chosen.tenant.names.some((n) => n.toLowerCase() === item.txn.payer.toLowerCase()) && (
        <label className="check" style={{ marginTop: 16 }}><input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} /><span>Next time, match “{item.txn.payer}” to {chosen.tenant.names[0]} automatically</span></label>
      )}
    </Drawer>
  );
}
