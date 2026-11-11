import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Goal, Profile, Province, RentMethod, SetupKind, Tone } from '../data/types';
import { useStore } from '../data/store';
import { PROVINCES, province } from '../lib/jurisdiction';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';
import { EmailSignup, GoogleButton, GooglePicker, googleOn, startGoogle, type Who } from './Account';
import { banksOn, serverMode } from '../data/api';
import { QGoal, QHard, QPay, QTax, QWhat, QWhere, SceneWelcome } from '../components/Art';

// Signup: first the account (Google, or name, email and password), then six short questions in plain words
// (one per screen, using your first name), then the plan and "Go to dashboard".
// Addresses: /start (account), /start/1 to /start/6 (questions), /start/7 (plan).

const HARD = [
  { id: 'who-paid', label: 'Knowing who has paid' },
  { id: 'chasing', label: 'Asking for late rent' },
  { id: 'which-notice', label: "Knowing what to do when rent is late" },
  { id: 'receipts', label: 'Writing rent receipts' },
  { id: 'awkward', label: 'Uncomfortable talks with tenants' },
  { id: 'none', label: 'Nothing, it goes fine' },
];
const TAX = [
  { id: 'scattered', label: 'I lose receipts or keep them in different places' },
  { id: 'deduct', label: "I don't know what costs I can claim" },
  { id: 'repair-or-reno', label: "I'm not sure how to count a repair vs an upgrade" },
  { id: 'accountant', label: 'My accountant keeps asking me for things' },
  { id: 'none', label: 'Nothing, taxes are fine' },
];
const GOALS: { id: Goal; label: string; sub: string }[] = [
  { id: 'no-chasing', label: 'Getting paid on time', sub: 'Receipts and reminders done for me' },
  { id: 'makes-money', label: 'Knowing if I make money', sub: 'What I keep after all the costs' },
  { id: 'fill-unit', label: 'Finding a good tenant', sub: 'Applications in one place' },
  { id: 'tax-ready', label: 'Being ready for taxes', sub: 'Every cost saved as I go' },
];

export function Onboarding() {
  const { state, act } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  // The step lives in the address (/start/2) so the browser's back button goes to the previous question.
  // Step 0 creates the account; steps 1 to 6 are the questions.
  const step = Math.max(0, Number(loc.pathname.split('/')[2]) || 0);
  const setStep = (n: number) => (n < 0 ? nav('/welcome') : nav(n === 0 ? '/start' : `/start/${n}`));
  const acct = state.profile.account;
  const hasAccount = !!acct?.signedIn && !state.profile.sample && (acct.provider === 'google' || acct.provider === 'email');
  // Leaving after the account exists signs out; the next sign-in opens the questions again. Nothing is drawn
  // while leaving, so signing out cannot send the page back to the account step on its way to the website.
  const [leaving, setLeaving] = useState(false);
  const exit = () => { setLeaving(true); nav('/welcome'); if (hasAccount) act.signOut(); };
  // Each question starts at the top, including when arriving from a scrolled page.
  useEffect(() => { window.scrollTo(0, 0); }, [step]);
  const [a, setA] = useState<Partial<Profile>>({ province: 'ON', city: 'Toronto', dreads: [], taxWorries: [] });
  const set = (p: Partial<Profile>) => setA((x) => ({ ...x, ...p }));
  // Province: the four biggest are buttons; the others appear in a list only after tapping "Others".
  const [others, setOthers] = useState(false);
  const toggle = (k: 'dreads' | 'taxWorries', id: string) => {
    const cur = a[k] ?? [];
    if (id === 'none') return set({ [k]: cur.includes('none') ? [] : ['none'] });
    set({ [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.filter((x) => x !== 'none'), id] });
  };

  const tone: Tone = a.dreads?.includes('awkward') ? 'gentle' : a.dreads?.includes('chasing') ? 'standard' : 'gentle';
  const answers = (): Partial<Profile> => ({ ...a, reminderTone: tone, rentArrival: banksOn() && (a.rentMethod === 'etransfer' || a.rentMethod === 'mix') ? 'bank' : 'manual' });
  // The questions greet by first name (from Google or the signup form); receipts and letters use the full name.
  const first = (state.profile.name || acct?.name || '').trim().split(/\s+/)[0] ?? '';

  const steps: { q: string; why: string; hint?: string; ok: boolean; pic: React.ReactNode; body: React.ReactNode }[] = [
    {
      q: 'Where is your rental property?', why: 'Each province has its own rules for rent and notices. We set them up for you.', ok: !!a.province, pic: <QWhere />,
      body: (
        <>
          <div className="choices" role="radiogroup" aria-label="Province">
            {PROVINCES.slice(0, 4).map((p) => (
              <button key={p.code} role="radio" className="choice" aria-checked={!others && a.province === p.code} onClick={() => { setOthers(false); set({ province: p.code, city: p.cities[0] }); }}>
                <span className="t">{p.name}</span>
              </button>
            ))}
            <button role="radio" className="choice" aria-checked={others} onClick={() => { if (!others) { setOthers(true); set({ province: undefined, city: undefined }); } }}>
              <span className="t">Others</span><span className="s">Another province or territory</span>
            </button>
          </div>
          <div className="grid2" style={{ marginTop: 16 }}>
            {others && <div className="field"><label htmlFor="ob-prov">Province or territory</label>
              <select id="ob-prov" className="input" value={a.province ?? ''} onChange={(e) => set({ province: e.target.value as Province, city: province(e.target.value as Province).cities[0] })} autoFocus>
                <option value="" disabled>Choose one</option>
                {PROVINCES.slice(4).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>}
            {a.province && <div className="field"><label htmlFor="ob-city">City</label>
              <select id="ob-city" className="input" value={a.city} onChange={(e) => set({ city: e.target.value })}>
                {province(a.province ?? 'ON').cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>}
          </div>
        </>
      ),
    },
    {
      q: 'What are you renting out?', why: 'So the home screen fits what you have.', ok: !!a.setup, pic: <QWhat />,
      body: (
        <div className="choices" role="radiogroup" aria-label="What you rent out">
          {([['part-home', 'Part of my own home', 'Like a basement or upstairs unit'], ['single', 'One house or condo', 'I live somewhere else'], ['few', '2 to 5 rental units', 'Like a duplex or a few condos'], ['many', '6 or more units', '']] as [SetupKind, string, string][]).map(([id, label, sub]) => (
            <button key={id} role="radio" className="choice" aria-checked={a.setup === id} onClick={() => set({ setup: id })}><span className="t">{label}</span>{sub && <span className="s">{sub}</span>}</button>
          ))}
        </div>
      ),
    },
    {
      q: 'How do your tenants pay you?', why: 'So we know how to spot rent when it comes in.', ok: !!a.rentMethod, pic: <QPay />,
      body: (
        <div className="choices" role="radiogroup" aria-label="How tenants pay">
          {([['etransfer', 'Interac e-Transfer', 'Money sent to your bank account'], ['cheque', 'Cheque', ''], ['cash', 'Cash', ''], ['mix', 'A mix of these', '']] as [RentMethod, string, string][]).map(([id, label, sub]) => (
            <button key={id} role="radio" className="choice" aria-checked={a.rentMethod === id} onClick={() => set({ rentMethod: id })}><span className="t">{label}</span>{sub && <span className="s">{sub}</span>}</button>
          ))}
        </div>
      ),
    },
    {
      q: "What's the hardest part of being a landlord?", why: 'We will help with these first.', hint: 'Pick as many as you like.', ok: (a.dreads?.length ?? 0) > 0, pic: <QHard />,
      body: (
        <div className="choices">
          {HARD.map((d) => <button key={d.id} className="choice" aria-pressed={a.dreads?.includes(d.id)} onClick={() => toggle('dreads', d.id)}><span className="t">{d.label}</span></button>)}
        </div>
      ),
    },
    {
      q: "What's hard about taxes for you?", why: 'So we can keep the right records for tax time.', hint: 'Pick as many as you like.', ok: (a.taxWorries?.length ?? 0) > 0, pic: <QTax />,
      body: (
        <div className="choices">
          {TAX.map((d) => <button key={d.id} className="choice" aria-pressed={a.taxWorries?.includes(d.id)} onClick={() => toggle('taxWorries', d.id)}><span className="t">{d.label}</span></button>)}
        </div>
      ),
    },
    {
      q: 'What do you want help with most?', why: 'This goes at the top of your home screen.', hint: 'Pick one.', ok: !!a.goal, pic: <QGoal />,
      body: (
        <div className="choices" role="radiogroup" aria-label="Main goal">
          {GOALS.map((g) => <button key={g.id} role="radio" className="choice" aria-checked={a.goal === g.id} onClick={() => set({ goal: g.id })}><span className="t">{g.label}</span><span className="s">{g.sub}</span></button>)}
        </div>
      ),
    },
  ];

  if (leaving) return null;
  // The account comes first: with one, the questions; without one, the account step.
  if (step === 0) return hasAccount ? <Navigate to="/start/1" replace />
    : <AccountStep total={steps.length} onExit={exit} onAccount={(w) => { act.createAccount(w); nav('/start/1'); }} />;
  if (!hasAccount) return <Navigate to="/start" replace />;
  if (step > steps.length) return <SavePlan a={a} first={first} onBack={() => setStep(steps.length)} onExit={exit}
    onDone={(emails) => { act.completeSignup({ ...answers(), emailUpdates: emails }); nav('/today'); }} />;
  const q = step - 1;
  const s = steps[q];
  // A few words of encouragement, by name, along the way.
  const cheer = !first ? '' : q === 0 ? `Nice to meet you, ${first}! ` : q === 2 ? `Halfway there, ${first}. ` : q === steps.length - 1 ? `Last one, ${first}! ` : '';
  return (
    <div className="q-wrap">
      <div className="q-top">
        <span className="brand" style={{ margin: 0 }}><Brand /></span>
        <button className="btn ghost q-exit" onClick={exit} aria-label="Exit signup and go back to the Keyholder website"><Icon name="close" size={18} />Exit</button>
        <div className="q-lines" aria-hidden>
          {steps.map((_, i) => <span key={i} className={i < q ? 'done' : i === q ? 'now' : ''} />)}
        </div>
      </div>
      <div className="q-head">
        <div>
          <p className="q-count">{cheer}Question {q + 1} of {steps.length}</p>
          <h1 className="q-question">{s.q}</h1>
          <p className="q-aside"><Icon name="info" size={16} />{s.why}{s.hint ? ` ${s.hint}` : ''}</p>
        </div>
        <div className="q-pic">{s.pic}</div>
      </div>
      {s.body}
      <div className="q-foot">
        {q > 0 ? <button className="btn ghost" onClick={() => setStep(step - 1)}><Icon name="back" size={16} />Back</button> : <span />}
        <button className="btn primary" onClick={() => setStep(step + 1)} disabled={!s.ok}>{q === steps.length - 1 ? 'See my plan' : 'Next'}</button>
      </div>
      <p className="tiny faint" style={{ marginTop: 'auto', paddingTop: 48 }}>About 2 minutes. You can change any answer later in Settings.</p>
    </div>
  );
}

/** Step 0: the account. Google (finished before any question) or first and last name, email and password. */
function AccountStep({ total, onExit, onAccount }: { total: number; onExit: () => void; onAccount: (w: Who) => void }) {
  const [picker, setPicker] = useState(false);
  return (
    <div className="q-wrap">
      <div className="q-top">
        <span className="brand" style={{ margin: 0 }}><Brand /></span>
        <button className="btn ghost q-exit" onClick={onExit} aria-label="Exit signup and go back to the Keyholder website"><Icon name="close" size={18} />Exit</button>
        <div className="q-lines" aria-hidden>{Array.from({ length: total }, (_, i) => <span key={i} />)}</div>
      </div>
      <div className="q-head">
        <div>
          <p className="q-count">Let's get started</p>
          <h1 className="q-question">Create your free account</h1>
          <p className="q-aside"><Icon name="info" size={16} />Then {total} quick questions about your rental, and Keyholder sets itself up for you. Free for one rental unit. No card needed.</p>
        </div>
        <div className="q-pic"><SceneWelcome /></div>
      </div>
      <div className="sheet acct-save acct-first">
        {googleOn() && <>
          <GoogleButton onClick={() => (serverMode() ? startGoogle('signup') : setPicker(true))} />
          <div className="acct-or"><span>or</span></div>
        </>}
        <EmailSignup onDone={onAccount} />
        <p className="small soft acct-switch">Already have an account? <Link to="/signin">Sign in</Link></p>
      </div>
      <div className="q-foot">
        <button type="button" className="btn ghost" onClick={onExit}><Icon name="back" size={16} />Back to website</button>
      </div>
      {picker && <GooglePicker onPick={(w) => { setPicker(false); onAccount(w); }} onClose={() => setPicker(false)} />}
    </div>
  );
}

function SavePlan({ a, first, onBack, onExit, onDone }: { a: Partial<Profile>; first: string; onBack: () => void; onExit: () => void; onDone: (emails: boolean) => void }) {
  const [emails, setEmails] = useState(true);
  const d = a.dreads ?? [];
  const prov = province(a.province ?? 'ON');
  const bank = banksOn() && (a.rentMethod === 'etransfer' || a.rentMethod === 'mix');
  // Six things Keyholder will do, each one plain sentence, chosen from the answers.
  type Item = [icon: string, text: string];
  const notice = d.includes('which-notice') || d.includes('chasing') || a.goal === 'no-chasing';
  const core: Item[] = [
    bank ? ['bank', 'Spots rent in your bank every 4 hours and marks it paid, so you always know who has paid.'] : ['check', 'Keeps track of who has paid: one tap marks rent paid when cash or a cheque comes in.'],
    ['receipt', 'Sends each tenant a numbered receipt the moment their rent is in.'],
    ['bell', 'Sends friendly reminders when rent is late, and stops them as soon as the money arrives.'],
    ['camera', 'Files every receipt and bill to the right property: take a photo and it fills in the details.'],
    ['print', 'Totals your rental income and costs for your tax return (T776), ready for your accountant.'],
  ];
  const extras: Item[] = [
    ...(notice ? [['paper', `Prepares ${prov.name}'s official late-rent notice with the right dates, for you to approve.`] as Item] : []),
    ...(a.setup === 'part-home' ? [['home', 'Splits shared costs like heat and hydro between your home and the rental.'] as Item] : []),
    ...(a.goal === 'makes-money' ? [['trend', 'Shows what your rental is worth and how much you keep each month, next to a GIC.'] as Item] : []),
    ...(a.goal === 'fill-unit' ? [['users', 'Collects tenant applications in one place, so you can compare them side by side.'] as Item] : []),
    ['paper', `Prepares ${prov.name}'s official late-rent notice with the right dates, for you to approve.`],
  ];
  const items: Item[] = [...core, extras[0]];
  // Their main goal goes first.
  const lead = a.goal === 'tax-ready' ? 4 : a.goal === 'no-chasing' ? 2 : -1;
  if (lead > 0) items.unshift(...items.splice(lead, 1));
  const SETUP: Record<string, string> = { 'part-home': 'Part of your home', single: 'One house or condo', few: '2 to 5 units', many: '6 or more units' };
  const PAY: Record<string, string> = { etransfer: 'paid by e-Transfer', cheque: 'paid by cheque', cash: 'paid in cash', mix: 'paid a mix of ways' };
  const summary = [`${prov.name}${a.city ? `, ${a.city}` : ''}`, a.setup && SETUP[a.setup], a.rentMethod && PAY[a.rentMethod]].filter(Boolean).join(' · ');

  return (
    <div className="q-wrap plan-page">
      <div className="q-top"><span className="brand" style={{ margin: 0 }}><Brand /></span><button className="btn ghost q-exit" onClick={onExit} aria-label="Exit signup and go back to the Keyholder website"><Icon name="close" size={18} />Exit</button></div>
      <div className="plan-main">
        <p className="q-count">Your plan is ready</p>
        <h1 className="q-question">{first ? `${first}, here's` : "Here's"} what Keyholder will automate for you</h1>
        <p className="plan-summary">{summary}</p>
        <ul className="plan-six">{items.map(([ic, text]) => <li key={text}><span className="plan-ic" aria-hidden><Icon name={ic} size={18} /></span><span>{text}</span></li>)}</ul>
        <label className="check plan-emails"><input type="checkbox" checked={emails} onChange={(e) => setEmails(e.target.checked)} />Email me when something needs me</label>
        <div className="q-foot plan-foot">
          <button className="btn ghost" onClick={onBack}><Icon name="back" size={16} />Back</button>
          <button className="btn primary plan-go" onClick={() => onDone(emails)}>Go to dashboard<Icon name="next" size={18} /></button>
        </div>
      </div>
    </div>
  );
}
