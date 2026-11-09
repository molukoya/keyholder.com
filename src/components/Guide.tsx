import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useStore } from '../data/store';
import { fmt0 } from '../lib/money';

// Small helpers that make the app explain itself: page subtitles, the sample banner,
// status pills you can tap for a meaning, and a five-step guided tour.

/** One line under a page title: what this page is for. */
export function PageSub({ children }: { children: React.ReactNode }) {
  return <p className="page-sub">{children}</p>;
}

/** Shown while the app holds the sample properties. */
export function SampleBanner() {
  const { state, act } = useStore();
  const nav = useNavigate();
  if (!state.profile.sample || !state.properties.length) return null;
  const admin = state.profile.account?.provider === 'admin';
  return (
    <div className="sample-banner" role="status">
      <span><strong>{admin ? 'Admin:' : 'Demo:'}</strong> you're looking at sample properties. Click around, nothing here is real.</span>
      <span className="btn-row">
        {admin
          ? <button className="btn small ghost" onClick={() => nav('/support')}>Back to support</button>
          : <button className="btn small ghost" onClick={() => act.setProfile({ tourDone: false })}>Show me around</button>}
        <button className="btn small" onClick={() => { act.signOut(); nav('/welcome'); }}>Sign out</button>
      </span>
    </div>
  );
}

const MEANING: Record<string, string> = {
  paid: 'Rent for this month is in. Send a receipt so your tenant has a record.',
  late: 'The due date has passed and the full rent has not arrived. Start with a friendly reminder.',
  due: 'Rent is coming up or a payment needs a quick look. Nothing is late yet.',
  vacant: 'Nobody lives here right now. Share the application link to find a tenant.',
};

/** A status pill that explains itself when tapped. */
export function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const text = MEANING[tone];
  if (!text) return <span className={`status ${tone}`}>{children}</span>;
  return (
    <span className="pill-wrap">
      <button type="button" className={`status ${tone} pill-btn`} aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} title="What does this mean?">{children}</button>
      {open && <span className="pill-tip" role="tooltip">{text}</span>}
    </span>
  );
}

// ---------- The guided tour ----------
const STEPS: { sel: string; title: string; body: string; path?: string }[] = [
  { sel: '[data-tour="rent"]', title: 'Your rent, at a glance', body: 'Each unit shows who has paid. The one button beside it is the next thing to do: send a receipt, send a reminder, or review applications.', path: '/today' },
  { sel: '[data-tour="score"]', title: 'Your setup progress', body: 'It rises as you set things up. Pick any item from the list below to raise it, or hide the ones you don\'t care about.', path: '/today' },
  { sel: '[data-tour="portfolio"]', title: 'Is it worth it?', body: 'Portfolio shows what your properties are worth, what you earn a year, and how that compares with a GIC and the stock market.' },
  { sel: '[data-tour="rentals"]', title: 'Your rentals', body: 'Properties, units, tenants, applications and notices. Rent increase suggestions show up here too.' },
  { sel: '[data-tour="receipt"]', title: 'Snap a receipt', body: 'Add a receipt any time. Bills from your connected banks are filed for you; you just confirm.' },
];

export function Tour() {
  const { state, act } = useStore();
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const active = !!state.profile.onboarded && state.properties.length > 0 && state.profile.tourDone === false;
  const step = STEPS[i];

  useEffect(() => { if (active) { setI(0); nav('/today'); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!active) return;
    const find = () => {
      const el = [...document.querySelectorAll<HTMLElement>(step.sel)].find((e) => e.offsetParent !== null || e.getClientRects().length);
      if (el) {
        const r0 = el.getBoundingClientRect();
        if (r0.top < 0 || r0.bottom > window.innerHeight) el.scrollIntoView({ block: r0.height > window.innerHeight * 0.5 ? 'start' : 'center', behavior: 'instant' as ScrollBehavior });
        setRect(el.getBoundingClientRect());
      } else setRect(null);
    };
    find();
    const t = setTimeout(find, 60);
    window.addEventListener('resize', find);
    window.addEventListener('scroll', find, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener('resize', find); window.removeEventListener('scroll', find); };
  }, [active, i, step.sel]);

  useEffect(() => {
    if (!active) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  if (!active) return null;
  const done = () => act.setProfile({ tourDone: true });
  const last = i === STEPS.length - 1;
  const pad = 8;
  // Put the card below the highlight, else above it, else pinned to the bottom of the screen.
  const room = 240;
  const place = !rect ? 'middle' : window.innerHeight - rect.bottom > room ? 'below' : rect.top > room ? 'above' : 'bottom';
  const cardTop = place === 'below' ? rect!.bottom + pad + 12 : place === 'above' ? rect!.top - pad - 12 : undefined;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? <div className="tour-hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="tour-dim" />}
      <div className={`tour-card ${place}`} style={cardTop !== undefined ? { top: cardTop } : undefined}>
        <p className="tiny soft">Step {i + 1} of {STEPS.length}</p>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="btn-row">
          <button className="btn ghost" onClick={done}>Skip tour</button>
          {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn primary" autoFocus onClick={() => (last ? done() : setI(i + 1))}>{last ? 'Got it' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

/** Phone only: pages reached from the "More" menu get a way back to it. */
export function BackToMore() {
  return <Link to="/more" className="crumb phone-only"><Icon name="back" size={16} />Back to More</Link>;
}

// ---------- Plain meanings for words a new landlord may not know ----------
export const GLOSSARY: Record<string, string> = {
  GIC: 'A GIC is a safe savings deposit at a bank. You lock money in for a set time and earn a fixed rate.',
  T776: 'T776 is the form for rental income on your Canadian tax return. Keyholder fills in the numbers for you.',
  N4: "N4 is Ontario's form telling a tenant they owe rent. It is the first official step when rent is late.",
  arrears: 'Rent that is owed and late.',
  depreciation: 'Spreading the cost of something big, like a new roof, over several years on your taxes.',
  'cost base': 'What you paid for the property, plus buying costs and big improvements. Used to work out tax when you sell.',
  tribunal: 'The provincial office that handles disagreements between landlords and tenants.',
  'net worth': 'What your properties are worth, minus what you still owe on them.',
};

/** A word with a dotted underline. Tap it for a one-line meaning. */
export function Term({ t, children }: { t: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const text = GLOSSARY[t];
  if (!text) return <>{children ?? t}</>;
  return (
    <span className="term-wrap">
      <button type="button" className="term" aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>{children ?? t}</button>
      {open && <span className="pill-tip term-tip" role="tooltip">{text}</span>}
    </span>
  );
}

// ---------- Help: plain answers, always one tap away ----------
const HELP: [string, string][] = [
  ['What should I do first?', 'Look at Home. Each tenant has one button beside them: that is the next thing to do. Tap it.'],
  ['How do I mark rent as paid?', 'On Home, tap "Mark paid" next to the tenant. If your bank is connected, Keyholder marks it for you.'],
  ['What if rent is late?', 'Tap "Send reminder" first. If it is still not paid, Keyholder shows the next step for your province, one at a time.'],
  ['How do I save a receipt for a cost?', 'Tap the camera button (on phones it is in the middle of the bottom bar). Take a photo and pick what it was for.'],
  ['What is "Setup progress"?', 'It shows how much of your setup is done. Each item you finish makes your numbers more accurate. It is optional.'],
  ['What do Bronze, Silver and Gold mean?', 'Your property card gets more useful as you add details, like what you paid. It is always free.'],
  ['Can Keyholder move my money?', 'No. It can only look at deposits and bills. It never sees your bank password.'],
];
export function HelpButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { act } = useStore();
  const nav = useNavigate();
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open]);
  return (
    <>
      <button className={compact ? 'btn ghost small help-btn' : 'nav-link help-btn'} onClick={() => setOpen(true)}><Icon name="info" size={compact ? 18 : 20} />Help</button>
      {open && createPortal(
        <div className="acct-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div className="scrim" onClick={() => setOpen(false)} />
          <div className="acct-modal-card help-card">
            <div className="acct-modal-head"><Icon name="info" size={18} /><span>Help</span><button className="btn ghost small" onClick={() => setOpen(false)} aria-label="Close help"><Icon name="close" size={18} /></button></div>
            <h2 id="help-title">How can we help?</h2>
            <div className="help-list">{HELP.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => { setOpen(false); act.setProfile({ tourDone: false }); nav('/today'); }}>Show me around again</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------- "Since your last visit" ----------
export function SinceLastVisit({ since, needs }: { since: string; needs: number }) {
  const { state } = useStore();
  const pays = state.payments.filter((p) => p.date >= since);
  const total = pays.reduce((n, p) => n + p.amount, 0);
  const bills = state.expenses.filter((e) => e.date >= since).length;
  const names = [...new Set(pays.map((p) => { const l = state.leases.find((x) => x.id === p.leaseId); const t = l && state.tenants.find((x) => x.id === l.tenantId); return t?.names[0].split(' ')[0]; }).filter(Boolean))] as string[];
  const parts: string[] = [];
  if (pays.length) parts.push(names.slice(0, 2).join(' and ') + (names.length > 2 ? ' and ' + (names.length - 2) + ' more' : '') + ' paid ' + fmt0(total));
  if (bills) parts.push(bills + (bills > 1 ? ' bills saved' : ' bill saved'));
  parts.push(needs ? needs + (needs > 1 ? ' things need you' : ' thing needs you') : 'nothing needs you');
  return (
    <div className="since" role="status">
      <span className="since-k">Since your last visit</span>
      <span className="since-v">{parts.join(' · ')}</span>
    </div>
  );
}
