import { StatusPill } from './Guide';
import { Avatar } from './Art';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Lease, Unit } from '../data/types';
import { currentLine, useStore } from '../data/store';
import { addDays, addMonths, fmtDay, fmtPeriod, periodOf } from '../lib/dates';
import { activeLease } from '../lib/finance';
import { allJourneyCards, isHidden, prefKey, propertySteps, unitStep, type JourneyCard } from '../lib/journey';
import { keyholderScore, scoreKey } from '../lib/score';
import { hasSilver, type Level } from '../lib/levels';
import { fmt } from '../lib/money';
import { bankToSort } from '../lib/bankrules';
import { FormWizard } from './FormWizard';
import { LevelUpForm, ScoreRing } from './levels';
import { PaymentForm } from './forms';
import { Icon } from './Icon';
import { MatchDrawer } from '../screens/Tray';
import { LateRentDrawer } from '../screens/Rentals';

// Home: one row per unit with a status and ONE button for the next step. The tenant journey
// (applied → approved → lease → moved in → paying → renewal → moving out) is tracked behind the scenes.

/** "⋯" menu: hide for a while, or ignore for good. */
function RowMenu({ k }: { k: string }) {
  const { act, today } = useStore();
  const [open, setOpen] = useState(false);
  const pick = (pref: { hiddenUntil?: string; ignored?: boolean }) => { act.setTodoPref(k, pref); setOpen(false); };
  return (
    <span className="row-menu">
      <button className="btn ghost small dots" aria-label="More options" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <span className="row-menu-pop" role="menu">
          <button role="menuitem" onClick={() => pick({ hiddenUntil: addDays(today, 1) })}>Hide for a day</button>
          <button role="menuitem" onClick={() => pick({ hiddenUntil: addDays(today, 7) })}>Hide for a week</button>
          <button role="menuitem" onClick={() => pick({ hiddenUntil: `${periodOf(addMonths(today, 1))}-01` })}>Hide until next month</button>
          <button role="menuitem" onClick={() => pick({ ignored: true })}>Ignore</button>
        </span>
      )}
    </span>
  );
}

const shortLabel = (c: JourneyCard): string => {
  const s = c.step;
  switch (s.kind) {
    case 'confirm-payment': return 'Confirm';
    case 'send-receipt': return 'Send receipt';
    case 'reminder': return 'Send reminder';
    case 'form': return /inspection/i.test(s.text) ? 'Inspection' : /lease/i.test(s.text) ? 'Prepare lease' : c.stage === 'renewal' ? 'Raise rent' : s.text;
    case 'deposit': return 'Settle deposit';
    case 'list-unit': return 'List unit';
    case 'send-form': return 'Send form';
    case 'review': return 'Review';
    case 'make-tenant': return 'Set up tenant';
    case 'mortgage': return 'See mortgage';
  }
};

/** Runs a journey step: inline when it can, otherwise opens the right form or page. */
export function StepButton({ c }: { c: JourneyCard }) {
  const { act } = useStore();
  const nav = useNavigate();
  const [form, setForm] = useState(false);
  const [match, setMatch] = useState(false);
  const s = c.step;
  const run = () => {
    switch (s.kind) {
      case 'confirm-payment': if (s.leaseId) act.confirmMatch(s.txn.id, s.leaseId, s.period, true); else setMatch(true); break;
      case 'send-receipt': act.approveMessage(s.message.id); break;
      case 'reminder': act.sendReminder(s.lease, s.line.period, s.tone); break;
      case 'form': setForm(true); break;
      case 'deposit': act.markDepositReturned(s.lease.id); break;
      case 'list-unit': case 'send-form': case 'review': case 'make-tenant': nav(`/rent/property/${s.unit.propertyId}/find`); break;
      case 'mortgage': nav(`/rent/property/${s.mortgage.propertyId}/mortgage`); break;
    }
  };
  return (
    <>
      <button className={`btn ${c.urgent || s.kind !== 'mortgage' ? 'primary' : ''}`} onClick={run}>{shortLabel(c)}</button>
      {form && s.kind === 'form' && <FormWizard lease={s.lease} formId={s.formId} onClose={() => setForm(false)} />}
      {match && s.kind === 'confirm-payment' && <MatchDrawer item={{ kind: 'match', id: s.txn.id, txn: s.txn, suggestion: null }} onClose={() => setMatch(false)} />}
    </>
  );
}

function statusFor(state: ReturnType<typeof useStore>['state'], lease: Lease | undefined, c: JourneyCard | null, today: string): { label: string; tone: string } {
  if (!lease) {
    if (c?.step.kind === 'review') return { label: `${c.step.count} application${c.step.count > 1 ? 's' : ''}`, tone: 'due' };
    if (c?.step.kind === 'make-tenant') return { label: 'Offer accepted', tone: 'paid' };
    if (c?.step.kind === 'send-form') return { label: 'Empty · listed', tone: 'vacant' };
    return { label: 'Empty', tone: 'vacant' };
  }
  if (c?.stage === 'lease' || c?.stage === 'moved-in') return { label: 'Moving in', tone: 'due' };
  if (c?.stage === 'moving-out') return { label: 'Moving out', tone: 'due' };
  if (c?.step.kind === 'confirm-payment') return { label: 'Payment found', tone: 'due' };
  const line = currentLine(state, lease, today)!;
  if (line.state === 'paid') return { label: 'Paid', tone: 'paid' };
  if (line.state === 'late') return { label: `Late · ${line.daysLate} day${line.daysLate === 1 ? '' : 's'}`, tone: 'late' };
  if (line.state === 'partial') return { label: `${fmt(line.charge - line.paid)} owed`, tone: line.daysLate > 0 ? 'late' : 'partial' };
  if (line.state === 'due') return { label: 'Due today', tone: 'due' };
  return { label: `Due ${fmtDay(line.due)}`, tone: 'due' };
}

function UnitLine({ unit }: { unit: Unit }) {
  const { state, today } = useStore();
  const [pay, setPay] = useState(false);
  const [late, setLate] = useState(false);
  const lease = activeLease(state, unit.id, today);
  const tenant = lease ? state.tenants.find((t) => t.id === lease.tenantId) : undefined;
  const prop = state.properties.find((p) => p.id === unit.propertyId);
  const card = unitStep(state, unit, today);
  const visible = card && !isHidden(state, prefKey(card), today) ? card : null;
  const st = statusFor(state, lease, card, today);
  const line = lease ? currentLine(state, lease, today) : undefined;
  // Fallback when nothing is due or the step is hidden: the plain rent action.
  let fallback: React.ReactNode = null;
  if (!visible && lease && line) {
    if (line.state === 'late' || (line.state === 'partial' && line.daysLate > 0)) fallback = <button className="btn" onClick={() => setLate(true)}>Late rent options</button>;
    else if (line.state !== 'paid') fallback = <button className="btn" onClick={() => setPay(true)}>Mark paid</button>;
    else fallback = <span className="paid-on">{fmtDay(line.payments[line.payments.length - 1]?.date ?? line.due)}</span>;
  }
  return (
    <li className={`rent-row ${st.tone === 'late' ? 'late' : ''}`}>
      {tenant ? (
        <Link to={`/rent/tenant/${tenant.id}`} className="who-link">
          <Avatar name={tenant.names.join(' & ')} size={42} />
          <span className="who-text"><span className="who">{tenant.names.join(' & ')}</span>
          <span className="where">{prop?.nickname} · Unit {unit.label} · {fmt(lease!.rent)}</span></span>
        </Link>
      ) : (
        <Link to={`/rent/property/${unit.propertyId}/find`} className="who-link">
          <span className="unit-ic" aria-hidden><Icon name="door" size={20} /></span>
          <span className="who-text"><span className="who">Unit {unit.label}</span>
          <span className="where">{prop?.nickname} · empty</span></span>
        </Link>
      )}
      <StatusPill tone={st.tone}>{st.tone === 'paid' && <Icon name="check" size={16} />}{st.label}</StatusPill>
      <span className="row-act">
        {visible ? <StepButton c={visible} /> : fallback}
        {visible && <RowMenu k={prefKey(visible)} />}
      </span>
      {pay && lease && <PaymentForm leaseId={lease.id} onClose={() => setPay(false)} />}
      {late && lease && <LateRentDrawer lease={lease} onClose={() => setLate(false)} />}
    </li>
  );
}

/** Home's rent list: one row per unit, plus property lines (mortgage) and a way back to hidden steps. */
export function RentRows() {
  const { state, act, today } = useStore();
  const units = state.units.filter((u) => state.properties.some((x) => x.id === u.propertyId && !x.archived));
  const props = propertySteps(state, today);
  const tucked = allJourneyCards(state, today).filter((c) => isHidden(state, prefKey(c), today));
  const [showTucked, setShowTucked] = useState(false);
  return (
    <section className="section" data-tour="rent">
      <h2 className="section-title">Rent for {fmtPeriod(periodOf(today))}</h2>
      <div className="sheet tight">
        <ul className="rent-list">{units.map((u) => <UnitLine key={u.id} unit={u} />)}</ul>
        {props.filter((c) => !isHidden(state, prefKey(c), today)).map((c) => (
          <div key={c.id} className="prop-line">
            <span><Icon name="bank" size={18} /> {c.subtitle} mortgage renews in {c.text.match(/\d+/)?.[0]} days</span>
            <span className="row-act"><StepButton c={c} /><RowMenu k={prefKey(c)} /></span>
          </div>
        ))}
        {bankToSort(state).length > 0 && (
          <div className="prop-line">
            <span><Icon name="bank" size={18} /> {bankToSort(state).length} bank transaction{bankToSort(state).length > 1 ? 's' : ''} to sort (bills, mortgage)</span>
            <span className="row-act"><Link className="btn primary" to="/paperwork/expenses">Review</Link></span>
          </div>
        )}
      </div>
      {tucked.length > 0 && (
        <p className="small soft" style={{ marginTop: 10 }}>{tucked.length} hidden or ignored · <button className="linkish" onClick={() => setShowTucked((x) => !x)}>{showTucked ? 'Done' : 'Show'}</button></p>
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

/** Keyholder score: a list to choose from — top items first, the rest one tap away. */
export function ScoreList() {
  const { state, today } = useStore();
  const nav = useNavigate();
  const { score, todo } = useMemo(() => keyholderScore(state, today), [state, today]);
  const [all, setAll] = useState(false);
  const [form, setForm] = useState<{ to: Level; pid: string } | null>(null);
  const p = form ? state.properties.find((x) => x.id === form.pid) : undefined;
  return (
    <section className="section" id="score">
      <h2 className="section-title">Finish setting up · {score}% done</h2>
      <div className="sheet">
        <div className="score-hero"><ScoreRing score={score} big /><p style={{ margin: 0 }}>{score >= 100 ? 'Everything is set up.' : 'Optional. Each one makes your numbers more accurate. Pick any.'}</p></div>
        {todo.length > 0 && <ul className="rows">{(all ? todo : todo.slice(0, 3)).map((i) => {
          const pr = i.propertyId ? state.properties.find((x) => x.id === i.propertyId) : undefined;
          return (
            <li key={i.id} className="row" style={{ gridTemplateColumns: '48px 1fr auto' }}>
              <span className="pts">+{i.points - i.earned}</span>
              <span className="title">{i.text}</span>
              <span className="row-act">
                <button className="btn small" onClick={() => { if (i.levelUp && pr) setForm({ pid: pr.id, to: i.levelUp === 'gold' && !hasSilver(pr) ? 'silver' : i.levelUp }); else nav(i.to); }}>Do it</button>
                <RowMenu k={scoreKey(i)} />
              </span>
            </li>
          );
        })}</ul>}
        {todo.length > 3 && <button className="btn ghost small" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${todo.length}`}</button>}
      </div>
      {form && p && <LevelUpForm property={p} to={form.to} onClose={() => setForm(null)} />}
    </section>
  );
}
