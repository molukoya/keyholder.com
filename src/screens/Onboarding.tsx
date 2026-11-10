import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Goal, Profile, Province, RentMethod, SetupKind, Tone } from '../data/types';
import { useStore } from '../data/store';
import { PROVINCES, province } from '../lib/jurisdiction';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';
import { EmailLink, GoogleButton, GooglePicker, googleOn, PENDING_SIGNUP, startGoogle, type Who } from './Account';
import { serverMode } from '../data/api';
import { QGoal, QHard, QPay, QTax, QWhat, QWhere, SceneWelcome } from '../components/Art';

// Signup: your first name, six short questions in plain words (one per screen, using your name along the way),
// then "Turn on your automation" (Google or email). Addresses: /start (name), /start/1 to /start/6, /start/7 (plan).

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
  const { act } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  // The step lives in the address (/start/2) so the browser's back button goes to the previous question.
  // Step 0 asks for a first name; steps 1 to 6 are the questions.
  const step = Math.max(0, Number(loc.pathname.split('/')[2]) || 0);
  const setStep = (n: number) => (n < 0 ? nav('/welcome') : nav(n === 0 ? '/start' : `/start/${n}`));
  const exit = () => nav('/welcome');
  // Each question starts at the top, including when arriving from a scrolled page.
  useEffect(() => { window.scrollTo(0, 0); }, [step]);
  const [a, setA] = useState<Partial<Profile>>({ province: 'ON', city: 'Toronto', dreads: [], taxWorries: [] });
  const set = (p: Partial<Profile>) => setA((x) => ({ ...x, ...p }));
  const toggle = (k: 'dreads' | 'taxWorries', id: string) => {
    const cur = a[k] ?? [];
    if (id === 'none') return set({ [k]: cur.includes('none') ? [] : ['none'] });
    set({ [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.filter((x) => x !== 'none'), id] });
  };

  const tone: Tone = a.dreads?.includes('awkward') ? 'gentle' : a.dreads?.includes('chasing') ? 'standard' : 'gentle';
  const answers = (): Partial<Profile> => ({ ...a, reminderTone: tone, rentArrival: a.rentMethod === 'etransfer' || a.rentMethod === 'mix' ? 'bank' : 'manual' });
  const first = (a.name ?? '').trim().split(/\s+/)[0] ?? '';
  // A Google account's full name wins when it starts with the name typed here; otherwise keep what they typed.
  const nameFor = (w: Who) => (!first || w.name.toLowerCase().startsWith(first.toLowerCase()) ? w.name : (a.name ?? '').trim());

  const steps: { q: string; why: string; hint?: string; ok: boolean; pic: React.ReactNode; body: React.ReactNode }[] = [
    {
      q: 'Where is your rental property?', why: 'Each province has its own rules for rent and notices. We set them up for you.', ok: !!a.province, pic: <QWhere />,
      body: (
        <>
          <div className="choices" role="radiogroup" aria-label="Province">
            {PROVINCES.slice(0, 4).map((p) => (
              <button key={p.code} role="radio" className="choice" aria-checked={a.province === p.code} onClick={() => set({ province: p.code, city: p.cities[0] })}>
                <span className="t">{p.name}</span>
              </button>
            ))}
          </div>
          <div className="grid2" style={{ marginTop: 16 }}>
            <div className="field"><label htmlFor="ob-prov">Another province or territory</label>
              <select id="ob-prov" className="input" value={a.province} onChange={(e) => set({ province: e.target.value as Province, city: province(e.target.value as Province).cities[0] })}>
                {PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="ob-city">City</label>
              <select id="ob-city" className="input" value={a.city} onChange={(e) => set({ city: e.target.value })}>
                {province(a.province ?? 'ON').cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
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

  if (step === 0) return <NameStep name={a.name ?? ''} onName={(name) => set({ name })} onNext={() => setStep(1)} onBack={exit} onExit={exit} total={steps.length} />;
  if (step > steps.length) return <SavePlan a={a} first={first} onBack={() => setStep(steps.length)} onExit={exit}
    onAccount={(w, emails) => act.signUp({ ...answers(), emailUpdates: emails }, { ...w, name: nameFor(w) })}
    onGoogle={(emails) => { try { sessionStorage.setItem(PENDING_SIGNUP, JSON.stringify({ profile: { ...answers(), emailUpdates: emails }, name: (a.name ?? '').trim() })); } catch { /* blocked */ } startGoogle('signup'); }} />;
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
        <button className="btn ghost" onClick={() => setStep(step - 1)}><Icon name="back" size={16} />Back</button>
        <button className="btn primary" onClick={() => setStep(step + 1)} disabled={!s.ok}>{q === steps.length - 1 ? 'See my plan' : 'Next'}</button>
      </div>
      <p className="tiny faint" style={{ marginTop: 'auto', paddingTop: 48 }}>About 2 minutes. You can change any answer later in Settings.</p>
    </div>
  );
}

/** Step 0: a first name, so the questions and the app can greet people by name. */
function NameStep({ name, onName, onNext, onBack, onExit, total }: { name: string; onName: (n: string) => void; onNext: () => void; onBack: () => void; onExit: () => void; total: number }) {
  const ok = !!name.trim();
  return (
    <div className="q-wrap">
      <div className="q-top">
        <span className="brand" style={{ margin: 0 }}><Brand /></span>
        <button className="btn ghost q-exit" onClick={onExit} aria-label="Exit signup and go back to the Keyholder website"><Icon name="close" size={18} />Exit</button>
        <div className="q-lines" aria-hidden>{Array.from({ length: total }, (_, i) => <span key={i} />)}</div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onNext(); }}>
        <div className="q-head">
          <div>
            <p className="q-count">Let's get started</p>
            <h1 className="q-question">What's your first name?</h1>
            <p className="q-aside"><Icon name="info" size={16} />So we know what to call you. Then {total} quick questions about your rental.</p>
          </div>
          <div className="q-pic"><SceneWelcome /></div>
        </div>
        <label htmlFor="ob-first" className="sr-only">Your first name</label>
        <input id="ob-first" className="input q-name" value={name} onChange={(e) => onName(e.target.value)} placeholder="First name" autoComplete="given-name" autoCapitalize="words" autoFocus />
        <div className="q-foot">
          <button type="button" className="btn ghost" onClick={onBack}><Icon name="back" size={16} />Back to website</button>
          <button className="btn primary" disabled={!ok}>Next</button>
        </div>
      </form>
      <p className="tiny faint" style={{ marginTop: 'auto', paddingTop: 48 }}>About 2 minutes. You can change any answer later in Settings.</p>
    </div>
  );
}

function SavePlan({ a, first, onBack, onExit, onAccount, onGoogle }: { a: Partial<Profile>; first: string; onBack: () => void; onExit: () => void; onAccount: (w: Who, emails: boolean) => void; onGoogle: (emails: boolean) => void }) {
  const [picker, setPicker] = useState(false);
  const [emails, setEmails] = useState(true);
  const d = a.dreads ?? [];
  const prov = province(a.province ?? 'ON');
  const bank = a.rentMethod === 'etransfer' || a.rentMethod === 'mix';
  const taxes = (a.taxWorries ?? []).some((x) => x !== 'none') || a.goal === 'tax-ready';
  // The plan, grouped by when it helps. Each line says what happens, then how.
  type Item = [icon: string, title: string, how: string];
  const groups: [string, Item[]][] = [
    ['Every month', [
      bank ? ['bank', 'Rent spotted in your bank', `We check every ${4} hours and mark rent paid for you.`] : ['check', 'Rent marked paid in one tap', 'Tap "Mark paid" when cash or a cheque comes in.'],
      ['receipt', 'Receipts sent for you', 'A numbered receipt goes out the moment rent is in.'],
      ['bell', 'Friendly reminders', 'Written for you the day after rent is due. Cancelled if rent arrives.'],
      ...(a.setup === 'part-home' ? [['home', 'Shared costs split for you', 'Heat and hydro split between your home and the suite.'] as Item] : []),
    ]],
    ['When rent is late', d.includes('which-notice') || d.includes('chasing') || a.goal === 'no-chasing'
      ? [['paper', `${prov.name}'s official notice, filled in`, 'The right form with the right dates, checked for you. You sign off.']] : []],
    ['At tax time', taxes ? [
      ['camera', 'Every receipt and cost saved', 'Snap a photo, or let your bank find bills. Each is filed to the right property.'],
      ['print', 'Your T776 numbers ready', 'Rental income and costs, totalled for your accountant.'],
    ] : []],
    ['Your money', a.goal === 'makes-money' ? [
      ['trend', 'What your rental is worth', 'A value estimate each month, next to a GIC.'],
      ['cash', 'Are you making money?', 'Rent in, costs out, and what you keep.'],
    ] : []],
    ['Finding tenants', a.goal === 'fill-unit' ? [['users', 'Applications in one place', 'Share one link, then compare applicants side by side.']] : []],
  ];
  const SETUP: Record<string, string> = { 'part-home': 'Part of your home', single: 'One house or condo', few: '2 to 5 units', many: '6 or more units' };
  const PAY: Record<string, string> = { etransfer: 'paid by e-Transfer', cheque: 'paid by cheque', cash: 'paid in cash', mix: 'paid a mix of ways' };
  const summary = [`${prov.name}${a.city ? `, ${a.city}` : ''}`, a.setup && SETUP[a.setup], a.rentMethod && PAY[a.rentMethod]].filter(Boolean).join(' · ');

  return (
    <div className="q-wrap">
      <div className="q-top"><span className="brand" style={{ margin: 0 }}><Brand /></span><button className="btn ghost q-exit" onClick={onExit} aria-label="Exit signup and go back to the Keyholder website"><Icon name="close" size={18} />Exit</button></div>
      <div className="plan-top">
        <div>
          <p className="q-count">Your plan is ready</p>
          <h1 className="q-question">{first ? `${first}, here's` : "Here's"} what Keyholder will automate for you</h1>
          <p className="plan-summary">{summary}</p>
          <div className="plan-groups">{groups.filter(([, items]) => items.length).map(([g, items]) => (
            <section key={g} className="plan-group"><h2>{g}</h2>
              <ul>{items.map(([ic, t, how]) => <li key={t}><span className="plan-ic" aria-hidden><Icon name={ic} size={18} /></span><span><strong>{t}</strong><span>{how}</span></span></li>)}</ul>
            </section>
          ))}</div>
        </div>
        <div className="plan-art" aria-hidden><SceneWelcome /></div>
      </div>

      <div className="sheet acct-save">
        <h2>Turn on your automation</h2>
        <p className="small soft" style={{ marginTop: 4 }}>Free for one rental unit. No card needed.</p>
        {googleOn() && <>
          <GoogleButton onClick={() => (serverMode() ? onGoogle(emails) : setPicker(true))} />
          <div className="acct-or"><span>or</span></div>
        </>}
        <EmailLink askName defaultName={a.name ?? ''} onDone={(w) => onAccount(w, emails)} />
        <label className="check" style={{ marginTop: 14 }}><input type="checkbox" checked={emails} onChange={(e) => setEmails(e.target.checked)} />Email me on rent day and once a month with a summary</label>
      </div>
      <div className="q-foot" style={{ marginTop: 16 }}><button className="btn ghost" onClick={onBack}><Icon name="back" size={16} />Back</button><span /></div>
      {picker && <GooglePicker onPick={(w) => { setPicker(false); onAccount(w, emails); }} onClose={() => setPicker(false)} />}
    </div>
  );
}
