import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Message } from '../data/types';
import { useStore } from '../data/store';
import { addDays, addMonths, periodOf } from '../lib/dates';
import { STAGES, allJourneyCards, isHidden, journeyCards, prefKey, type JourneyCard } from '../lib/journey';
import { keyholderScore, scoreKey } from '../lib/score';
import { hasSilver, type Level } from '../lib/levels';
import { MessageEditor } from './domain';
import { FormWizard } from './FormWizard';
import { LevelUpForm, ScoreRing } from './levels';
import { Drawer, Empty } from './ui';
import { MatchDrawer, ReminderDrawer } from '../screens/Tray';

// Home's "Needs you now": one card per tenant, empty unit or property, following the tenant journey.

function HideIgnore({ k, label }: { k: string; label: string }) {
  const { act, today } = useStore();
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <span className="hide-choices" role="group" aria-label={`Hide ${label}`}>
        <span className="small soft">Hide for</span>
        <button className="btn small ghost" onClick={() => act.setTodoPref(k, { hiddenUntil: addDays(today, 1) })}>1 day</button>
        <button className="btn small ghost" onClick={() => act.setTodoPref(k, { hiddenUntil: addDays(today, 7) })}>1 week</button>
        <button className="btn small ghost" onClick={() => act.setTodoPref(k, { hiddenUntil: `${periodOf(addMonths(today, 1))}-01` })}>Until next month</button>
        <button className="btn small ghost" onClick={() => setOpen(false)}>Cancel</button>
      </span>
    );
  }
  return (
    <span className="hide-choices">
      <button className="btn small ghost" onClick={() => setOpen(true)}>Hide</button>
      <button className="btn small ghost" onClick={() => act.setTodoPref(k, { ignored: true })}>Ignore</button>
    </span>
  );
}

function Track({ stage }: { stage: JourneyCard['stage'] }) {
  if (!stage) return null;
  const at = STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="journey-track" aria-label={`Stage: ${STAGES[at].label}`}>
      {STAGES.map((s, i) => <li key={s.id} className={i < at ? 'done' : i === at ? 'now' : ''}><span>{s.label}</span></li>)}
    </ol>
  );
}

function CardView({ c }: { c: JourneyCard }) {
  const { state, act } = useStore();
  const nav = useNavigate();
  const [look, setLook] = useState<Message | null>(null);
  const [remind, setRemind] = useState(false);
  const [form, setForm] = useState(false);
  const [match, setMatch] = useState(false);
  const s = c.step;

  let primary: { label: string; run: () => void } | null = null;
  let secondary: { label: string; run: () => void } | null = null;
  switch (s.kind) {
    case 'confirm-payment':
      if (s.leaseId) { primary = { label: 'Yes', run: () => act.confirmMatch(s.txn.id, s.leaseId, s.period, true) }; secondary = { label: 'Someone else', run: () => setMatch(true) }; }
      else { primary = { label: 'Choose tenant', run: () => setMatch(true) }; secondary = { label: 'Not rent', run: () => act.ignoreTxn(s.txn.id) }; }
      break;
    case 'send-receipt': primary = { label: 'Send receipt', run: () => act.approveMessage(s.message.id) }; secondary = { label: 'Look first', run: () => setLook(s.message) }; break;
    case 'reminder': primary = { label: 'Send reminder', run: () => act.sendReminder(s.lease, s.line.period, s.tone) }; secondary = { label: 'Look first', run: () => setRemind(true) }; break;
    case 'form': primary = { label: s.text, run: () => setForm(true) }; break;
    case 'deposit': primary = { label: 'Mark as settled', run: () => act.markDepositReturned(s.lease.id) }; break;
    case 'list-unit': case 'send-form': case 'review': case 'make-tenant':
      primary = { label: s.kind === 'list-unit' ? 'List it' : s.kind === 'send-form' ? 'Send form' : s.kind === 'review' ? 'Review' : 'Set it up', run: () => nav(`/rent/property/${s.unit.propertyId}/find`) }; break;
    case 'mortgage': primary = { label: 'See mortgage', run: () => nav(`/rent/property/${s.mortgage.propertyId}/mortgage`) }; break;
  }
  const tenantEmail = s.kind === 'send-receipt' || s.kind === 'reminder' ? state.tenants.find((t) => t.id === (s.kind === 'send-receipt' ? s.message.tenantId : s.lease.tenantId))?.email : 'ok';

  return (
    <li className={`jcard${c.urgent ? ' urgent' : ''}`}>
      <div className="jcard-head"><span><strong>{c.title}</strong><span className="soft"> · {c.subtitle}</span></span>{c.progress && <span className="jcard-progress">{c.progress}</span>}</div>
      <Track stage={c.stage} />
      <div className="jcard-step">
        <div><div className="jcard-text">{c.text}</div>{c.detail && <div className="small soft">{c.detail}</div>}</div>
        <div className="btn-row">
          {secondary && <button className="btn ghost" onClick={secondary.run}>{secondary.label}</button>}
          {primary && <button className="btn primary" disabled={!tenantEmail} onClick={primary.run}>{primary.label}</button>}
        </div>
      </div>
      <div className="jcard-foot"><HideIgnore k={prefKey(c)} label={c.title} /></div>
      {look && <Drawer title="Receipt" onClose={() => setLook(null)} wide><MessageEditor message={look} onDone={() => setLook(null)} /></Drawer>}
      {remind && s.kind === 'reminder' && <ReminderDrawer lease={s.lease} period={s.line.period} tone={s.tone} onClose={() => setRemind(false)} />}
      {form && s.kind === 'form' && <FormWizard lease={s.lease} formId={s.formId} onClose={() => setForm(false)} />}
      {match && s.kind === 'confirm-payment' && <MatchDrawer item={{ kind: 'match', id: s.txn.id, txn: s.txn, suggestion: null }} onClose={() => setMatch(false)} />}
    </li>
  );
}

export function NeedsYouNow() {
  const { state, act, today } = useStore();
  const cards = useMemo(() => journeyCards(state, today), [state, today]);
  const all = useMemo(() => allJourneyCards(state, today), [state, today]);
  const tucked = all.filter((c) => isHidden(state, prefKey(c), today));
  const [showTucked, setShowTucked] = useState(false);
  return (
    <section className="section">
      <h2 className="section-title">Needs you now</h2>
      {cards.length === 0 ? <div className="sheet"><Empty title="Nothing needs you right now.">Each tenant's next step shows up here when it's due.</Empty></div>
        : <ul className="jcards">{cards.map((c) => <CardView key={c.id} c={c} />)}</ul>}
      {tucked.length > 0 && (
        <p className="small soft" style={{ marginTop: 12 }}>
          {tucked.length} hidden or ignored · <button className="linkish" onClick={() => setShowTucked((x) => !x)}>{showTucked ? 'Done' : 'Show'}</button>
        </p>
      )}
      {showTucked && (
        <ul className="rows sheet" style={{ padding: '0 16px' }}>{tucked.map((c) => (
          <li key={prefKey(c)} className="row" style={{ gridTemplateColumns: '1fr auto' }}>
            <span><span className="title">{c.text}</span><span className="sub" style={{ display: 'block' }}>{c.title} · {state.todoPrefs[prefKey(c)]?.ignored ? 'Ignored' : `Hidden until ${state.todoPrefs[prefKey(c)]?.hiddenUntil}`}</span></span>
            <button className="btn small" onClick={() => act.setTodoPref(prefKey(c), null)}>Bring back</button>
          </li>
        ))}</ul>
      )}
    </section>
  );
}

/** The Keyholder score, one step at a time: only the next thing to complete. */
export function ScoreNext() {
  const { state, today } = useStore();
  const nav = useNavigate();
  const { score, todo } = useMemo(() => keyholderScore(state, today), [state, today]);
  const [form, setForm] = useState<{ to: Level; pid: string } | null>(null);
  const next = todo[0];
  const p = next?.propertyId ? state.properties.find((x) => x.id === next.propertyId) : undefined;
  return (
    <section className="section" id="score">
      <div className="score-next-card">
        <ScoreRing score={score} />
        <div className="score-next-text">
          <strong>Keyholder score {score}</strong>
          <span>{next ? <>Next: {next.text} <em>+{next.points - next.earned}</em></> : 'Everything is complete.'}</span>
        </div>
        {next && (
          <div className="btn-row">
            <HideIgnore k={scoreKey(next)} label={next.text} />
            <button className="btn primary" onClick={() => { if (next.levelUp && p) setForm({ pid: p.id, to: next.levelUp === 'gold' && !hasSilver(p) ? 'silver' : next.levelUp }); else nav(next.to); }}>Do it</button>
          </div>
        )}
      </div>
      {form && p && <LevelUpForm property={p} to={form.to} onClose={() => setForm(null)} />}
    </section>
  );
}
