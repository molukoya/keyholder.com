import { useState } from 'react';
import type { Goal, Profile, Province, RentMethod, SetupKind, Tone } from '../data/types';
import { useStore } from '../data/store';
import { PROVINCES, province } from '../lib/jurisdiction';
import { KeyMark } from '../components/Icon';
import { Letterhead } from '../components/domain';

// Signup as a pain-point questionnaire (PRD §5): six questions, one per screen, then the plan letter.

const DREADS = [
  { id: 'who-paid', label: 'Wondering who has paid' },
  { id: 'chasing', label: 'Chasing late rent' },
  { id: 'which-notice', label: "Not knowing which notice to send when it's late" },
  { id: 'receipts', label: 'Writing receipts' },
  { id: 'awkward', label: 'Awkward conversations' },
  { id: 'none', label: "Nothing, I'm fine" },
];
const TAX = [
  { id: 'scattered', label: 'My receipts are scattered (shoebox, phone, email)' },
  { id: 'deduct', label: 'I never know what I can deduct' },
  { id: 'repair-or-reno', label: 'Repair or renovation, which is it?' },
  { id: 'accountant', label: 'My accountant keeps chasing me' },
  { id: 'none', label: "Nothing, I'm organized" },
];
const GOALS: { id: Goal; label: string }[] = [
  { id: 'no-chasing', label: 'Never chasing rent or paperwork again' },
  { id: 'makes-money', label: 'Knowing if the property really makes money' },
  { id: 'fill-unit', label: 'Filling an empty unit faster' },
  { id: 'tax-ready', label: 'Being ready for tax time' },
];

export function Onboarding() {
  const { act } = useStore();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Partial<Profile>>({ province: 'ON', city: 'Toronto', dreads: [], taxWorries: [] });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const set = (p: Partial<Profile>) => setA((x) => ({ ...x, ...p }));
  const toggle = (k: 'dreads' | 'taxWorries', id: string) => {
    const cur = a[k] ?? [];
    if (id === 'none') return set({ [k]: cur.includes('none') ? [] : ['none'] });
    set({ [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.filter((x) => x !== 'none'), id] });
  };

  const tone: Tone = a.dreads?.includes('awkward') ? 'gentle' : a.dreads?.includes('chasing') ? 'standard' : 'gentle';
  const finish = (withSample: boolean) => act.completeOnboarding({
    ...a, name, email, reminderTone: tone,
    rentArrival: a.rentMethod === 'etransfer' || a.rentMethod === 'mix' ? 'bank' : 'manual',
  }, withSample);

  const steps = [
    {
      q: 'Where do your tenants live?', aside: "We'll set the rules for you.", ok: !!a.province,
      body: (
        <>
          <div className="choices" role="radiogroup" aria-label="Province">
            {PROVINCES.slice(0, 4).map((p) => (
              <button key={p.code} role="radio" className="choice" aria-checked={a.province === p.code} onClick={() => set({ province: p.code, city: p.cities[0] })}>
                <span className="t">{p.name}</span>
                <span className="s">{p.tier === 1 ? 'Full support, including notices and forms' : 'Money tools, plus local guidance'}</span>
              </button>
            ))}
          </div>
          <div className="grid2" style={{ marginTop: 16 }}>
            <div className="field"><label htmlFor="ob-prov">Somewhere else</label>
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
      q: "What's your setup?", ok: !!a.setup,
      body: (
        <div className="choices" role="radiogroup">
          {([['single', 'One place, I live elsewhere'], ['part-home', 'I rent out part of my own home'], ['few', 'A few doors (2 to 5)'], ['many', 'More than five']] as [SetupKind, string][]).map(([id, label]) => (
            <button key={id} role="radio" className="choice" aria-checked={a.setup === id} onClick={() => set({ setup: id })}><span className="t">{label}</span></button>
          ))}
        </div>
      ),
    },
    {
      q: 'How does rent reach you today?', ok: !!a.rentMethod,
      body: (
        <div className="choices" role="radiogroup">
          {([['etransfer', 'Interac e-Transfer'], ['cheque', 'Cheques'], ['cash', 'Cash'], ['mix', 'A mix']] as [RentMethod, string][]).map(([id, label]) => (
            <button key={id} role="radio" className="choice" aria-checked={a.rentMethod === id} onClick={() => set({ rentMethod: id })}><span className="t">{label}</span></button>
          ))}
        </div>
      ),
    },
    {
      q: 'What makes you dread the 1st of the month?', aside: 'Pick any.', ok: (a.dreads?.length ?? 0) > 0,
      body: (
        <div className="choices">
          {DREADS.map((d) => <button key={d.id} className="choice" aria-pressed={a.dreads?.includes(d.id)} onClick={() => toggle('dreads', d.id)}><span className="t">{d.label}</span></button>)}
        </div>
      ),
    },
    {
      q: 'What worries you at tax time?', aside: 'Pick any.', ok: (a.taxWorries?.length ?? 0) > 0,
      body: (
        <div className="choices">
          {TAX.map((d) => <button key={d.id} className="choice" aria-pressed={a.taxWorries?.includes(d.id)} onClick={() => toggle('taxWorries', d.id)}><span className="t">{d.label}</span></button>)}
        </div>
      ),
    },
    {
      q: 'What would make this worth it for you?', aside: 'Pick the top one.', ok: !!a.goal,
      body: (
        <div className="choices" role="radiogroup">
          {GOALS.map((g) => <button key={g.id} role="radio" className="choice" aria-checked={a.goal === g.id} onClick={() => set({ goal: g.id })}><span className="t">{g.label}</span></button>)}
        </div>
      ),
    },
  ];

  if (step >= steps.length) return <PlanLetter a={a} name={name} email={email} setName={setName} setEmail={setEmail} onBack={() => setStep(steps.length - 1)} onFinish={finish} />;
  const s = steps[step];
  return (
    <div className="q-wrap">
      <div className="q-top">
        <span className="brand" style={{ margin: 0 }}><KeyMark />Keyholder</span>
        <div className="q-lines" aria-label={`Question ${step + 1} of ${steps.length}`}>
          {steps.map((_, i) => <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
        </div>
      </div>
      <h1 className="q-question">{s.q}</h1>
      <p className="q-aside">{s.aside ?? ' '}</p>
      {s.body}
      <div className="q-foot">
        <button className="btn ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
        <button className="btn primary" onClick={() => setStep(step + 1)} disabled={!s.ok}>Continue</button>
      </div>
      <p className="tiny faint" style={{ marginTop: 'auto', paddingTop: 48 }}>No account needed yet. Answers take about two minutes and set up Keyholder for you.</p>
    </div>
  );
}

function PlanLetter({ a, name, email, setName, setEmail, onBack, onFinish }: {
  a: Partial<Profile>; name: string; email: string; setName: (s: string) => void; setEmail: (s: string) => void; onBack: () => void; onFinish: (sample: boolean) => void;
}) {
  const { state } = useStore();
  const lines: string[] = [];
  const d = a.dreads ?? [];
  if (d.includes('chasing')) lines.push(`You said you dread chasing late rent. Keyholder will draft a ${d.includes('awkward') ? 'gentle' : 'polite'} reminder the day after rent is due and stop the moment it lands.`);
  if (d.includes('who-paid')) lines.push(a.rentMethod === 'etransfer' || a.rentMethod === 'mix' ? 'You said you wonder who has paid. Keyholder will watch for e-Transfers — from your bank or forwarded emails — and tick each unit off as rent arrives.' : 'You said you wonder who has paid. Your Today screen will lead with a rent roll: one glance shows who is paid and who is not.');
  if (d.includes('receipts')) lines.push('You said you hate writing receipts. Every payment gets a receipt drafted automatically. You approve it with one tap, or let Keyholder send them for you once you trust it.');
  if (d.includes('which-notice')) lines.push(`You said you are not sure which notice to send. Keyholder will tell you, in plain steps, what ${province(a.province ?? 'ON').tribunal} expects — notice preparation is on the roadmap.`);
  if (d.includes('awkward')) lines.push('You said the conversations are awkward. Reminders are written for you, in the tone you choose, and you see every word before it goes.');
  const t = a.taxWorries ?? [];
  if (t.includes('scattered')) lines.push('You said your receipts are scattered. Snap each one as it arrives — the capture button is always one tap away.');
  if (t.includes('repair-or-reno')) lines.push('You asked whether it is a repair or a renovation. Each expense asks one plain question and files it the right way.');
  if (t.includes('deduct')) lines.push('You never know what you can deduct. Expenses use plain words and Keyholder maps them to the right tax line for you.');
  if (a.setup === 'part-home') lines.push('You rent out part of your own home. Keyholder will split shared costs, like heat and property tax, by the share you rent.');
  if (a.goal === 'makes-money') lines.push('Most of all you want to know if the property really makes money. You will see what you keep from every $1,000 of rent, and a plain verdict once values are in.');
  if (a.goal === 'tax-ready') lines.push('Most of all you want to be ready for tax time. Every entry lands in your tax summary as you go.');
  const shown = lines.slice(0, 4);
  if (shown.length === 0) shown.push('You seem well organised already. Keyholder will keep the ledger, receipts and expenses in one place so it stays that way.');

  return (
    <div className="q-wrap">
      <div className="q-top"><span className="brand" style={{ margin: 0 }}><KeyMark />Keyholder</span></div>
      <div className="letter" style={{ maxWidth: 720, width: '100%' }}>
        <Letterhead state={{ ...state, profile: { ...state.profile, name: 'Keyholder', email: 'Your plan' } }} />
        <h1 className="serif" style={{ fontSize: 'var(--t-28)', marginBottom: 16 }}>Here's what Keyholder will take off your plate</h1>
        <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>{shown.map((l) => <li key={l} style={{ marginBottom: 10 }}>{l}</li>)}</ol>
        <p style={{ marginTop: 24 }}><strong>Three things to set up</strong> — the rest is asked when it is first needed:</p>
        <ol style={{ paddingLeft: 20 }}><li>Add the property</li><li>Add the tenant</li><li>Choose how rent reaches the app</li></ol>
        <p className="tiny" style={{ color: '#55605B' }}>Rules set for {province(a.province ?? 'ON').name}{a.city ? `, ${a.city}` : ''}.</p>
      </div>
      <div className="sheet" style={{ maxWidth: 720, width: '100%', margin: '24px auto 0' }}>
        <h2 style={{ marginBottom: 12 }}>Save your plan</h2>
        <div className="grid2">
          <div className="field"><label htmlFor="ob-name">Your name</label><input id="ob-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /><span className="hint">Shown on receipts and letters</span></div>
          <div className="field"><label htmlFor="ob-email">Email</label><input id="ob-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        </div>
        <div className="btn-row">
          <button className="btn ghost" onClick={onBack}>Back</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => onFinish(false)}>Start empty</button>
          <button className="btn primary" onClick={() => onFinish(true)}>Explore with sample properties</button>
        </div>
        <p className="tiny faint" style={{ marginTop: 12 }}>Stage 1 preview: nothing leaves this browser. Accounts and sign-in arrive with the backend.</p>
      </div>
    </div>
  );
}
