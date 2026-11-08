import { useState } from 'react';
import type { Lease, Tone } from '../data/types';
import { useStore } from '../data/store';
import { fmtPeriod } from '../lib/dates';
import { activeLease, leaseLedger } from '../lib/finance';
import { fmt } from '../lib/money';
import { reminderDraft, TONES } from '../lib/templates';
import type { TrayItem } from '../lib/tray';
import { Letterhead } from '../components/domain';
import { Drawer, Empty, Seg } from '../components/ui';
import { Icon } from '../components/Icon';

// Drawers used by Home's journey cards: writing a reminder, and matching a deposit to a tenant.

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

export function MatchDrawer({ item, onClose }: { item: Extract<TrayItem, { kind: 'match' }>; onClose: () => void }) {
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
