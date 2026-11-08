import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Province } from '../data/types';
import { useStore } from '../data/store';
import { KeyMark, Icon } from '../components/Icon';
import { POPULAR_BANKS, RETURN_PRESETS, province } from '../lib/jurisdiction';
import { AUTHORITY_URL, formsFor } from '../lib/forms';

// The public site: five short pages under one menu. Overview · Features · Provinces · Pricing · Questions.

const PAGES = [
  { id: '', label: 'Overview' },
  { id: 'features', label: 'Features' },
  { id: 'provinces', label: 'Provinces' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'questions', label: 'Questions' },
] as const;
type PageId = (typeof PAGES)[number]['id'];
const href = (id: string) => (id ? `/welcome/${id}` : '/welcome');

export function Landing() {
  const { state, act } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const seg = loc.pathname.split('/').filter(Boolean);
  const raw = seg[0] === 'welcome' ? seg[1] ?? '' : seg[0] ?? '';
  const page: PageId = (PAGES.find((p) => p.id === raw)?.id ?? '') as PageId;
  const idx = PAGES.findIndex((p) => p.id === page);
  const signedIn = state.profile.onboarded;
  const demo = () => { act.startDemo(); nav('/today'); };
  const start = () => nav(signedIn ? '/today' : '/start');
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [page]);
  useEffect(() => { document.title = `${PAGES[idx].label === 'Overview' ? 'Keyholder · Your rental, handled' : `${PAGES[idx].label} · Keyholder`}`; }, [idx]);

  const ctas = signedIn
    ? <Link className="btn primary" to="/today">Open my dashboard</Link>
    : <><button className="btn ghost" onClick={demo}>See it in action</button><button className="btn primary" onClick={start}>Get started</button></>;
  const next = PAGES[idx + 1];

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link to="/welcome" className="lp-brand"><KeyMark size={26} /><span>Keyholder</span></Link>
          <nav aria-label="Site" className="lp-links">
            {PAGES.map((p) => <NavLink key={p.id} end to={href(p.id)} className={({ isActive }) => (isActive || (p.id === '' && page === '') ? 'on' : '')}>{p.label}</NavLink>)}
          </nav>
          <div className="btn-row lp-nav-cta">{ctas}</div>
          <button className="btn lp-burger" aria-expanded={menu} aria-controls="lp-menu" onClick={() => setMenu((m) => !m)}><Icon name={menu ? 'close' : 'menu'} size={20} /><span>Menu</span></button>
        </div>
        {menu && (
          <div className="lp-menu" id="lp-menu">
            {PAGES.map((p, i) => <Link key={p.id} to={href(p.id)} className={p.id === page ? 'on' : ''}><em>0{i + 1}</em>{p.label}</Link>)}
            <div className="btn-row">{ctas}</div>
          </div>
        )}
      </header>

      <main className="lp-main">
        {page === '' && <Overview start={start} demo={demo} signedIn={signedIn} />}
        {page === 'features' && <Features />}
        {page === 'provinces' && <Provinces />}
        {page === 'pricing' && <Pricing start={start} />}
        {page === 'questions' && <Questions start={start} demo={demo} signedIn={signedIn} />}

        <nav className="lp-wrap lp-pager" aria-label="Pages">
          {idx > 0 ? <Link to={href(PAGES[idx - 1].id)} className="lp-pg prev"><span>Back</span>{PAGES[idx - 1].label}</Link> : <span />}
          {next ? <Link to={href(next.id)} className="lp-pg next"><span>Next · 0{idx + 2}</span>{next.label}</Link> : <button className="lp-pg next" onClick={start}><span>Ready?</span>{signedIn ? 'Open my dashboard' : 'Get started'}</button>}
        </nav>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-grid">
          <div className="lp-wordmark" aria-hidden>Keyholder</div>
          <nav aria-label="Footer">{PAGES.map((p) => <Link key={p.id} to={href(p.id)}>{p.label}</Link>)}<Link to="/start">Sign up</Link></nav>
          <p className="tiny">Keyholder prepares documents and information. It does not give legal or tax advice, file returns, or hold or move money. Notice periods, forms and rates in this preview are being verified with each province. © 2026 Keyholder.</p>
        </div>
      </footer>
    </div>
  );
}

function PageHead({ n, kicker, title, children }: { n: number; kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="lp-wrap lp-grid lp-pagehead">
      <p className="lp-label"><span className="lp-num">0{n}</span>{kicker}</p>
      <div className="lp-body"><h1 className="lp-h1">{title}</h1>{children && <p className="lp-lede">{children}</p>}</div>
    </div>
  );
}

// ================================================================ 01 Overview
function Overview({ start, demo, signedIn }: { start: () => void; demo: () => void; signedIn: boolean }) {
  return (
    <>
      <section className="lp-hero">
        <div className="lp-wrap lp-grid">
          <p className="lp-label"><span className="lp-num">01</span>For Canadian landlords with 1 to 10 units</p>
          <h1 className="lp-hero-h">Your rental, <em>handled.</em></h1>
          <div className="lp-hero-aside">
            <p className="lp-lede">Rent tracked. Receipts and reminders sent. Late-rent notices prepared for your province. Every receipt kept. And a plain answer to whether your property is worth it.</p>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Get started, free'}</button>
              {!signedIn && <button className="btn lp-big" onClick={demo}>See it in action</button>}
            </div>
            <p className="tiny lp-fine">No card needed · You approve everything · Never moves your money</p>
          </div>
        </div>
        <div className="lp-wrap lp-grid lp-demo-row">
          <p className="lp-margin">Try it. Tap a button, the way you would on the first of the month.</p>
          <LiveDemo />
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap lp-grid">
          <p className="lp-label">How it works</p>
          <div className="lp-body"><h2 className="lp-h2">Fifteen minutes to set up. Minutes a month after that.</h2></div>
        </div>
        <ol className="lp-wrap lp-rows">
          {[
            ['Add your property', 'The address, the units, the tenants. A home with a rented basement works too.'],
            ['Connect your banks, or tap "Mark paid"', 'Any Canadian bank or credit union, view only. Keyholder checks every 4 hours for rent, bills and mortgage payments.'],
            ['Approve the next step', 'Each tenant gets one button: send the receipt, send a reminder, prepare the notice. Nothing goes out without you.'],
          ].map(([t, d], i) => (
            <li key={t} className="lp-row"><span className="lp-row-n">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="lp-sec lp-band">
        <div className="lp-wrap lp-grid lp-gic">
          <div className="lp-gic-bars"><CompareBars /></div>
          <div className="lp-gic-text">
            <p className="lp-label lp-label-inline">The question that matters</p>
            <h2 className="lp-h2">Is your property beating a GIC?</h2>
            <p>Rent left over, mortgage paid down and value growth, added up and set against savings, a GIC and the stock market. One honest number.</p>
            <Link to="/welcome/features" className="lp-arrow">See everything it does</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function CompareBars() {
  const rows = [{ l: 'Your property (example)', v: 10.1, you: true }, { l: RETURN_PRESETS.labels[0], v: RETURN_PRESETS.low }, { l: RETURN_PRESETS.labels[1], v: RETURN_PRESETS.typical }, { l: RETURN_PRESETS.labels[2], v: RETURN_PRESETS.high }];
  return (
    <div className="lp-compare" role="img" aria-label={rows.map((r) => `${r.l} ${r.v}%`).join(', ')}>
      {rows.map((r) => <div key={r.l} className={`lp-bar${r.you ? ' you' : ''}`}><span>{r.l}</span><strong>{r.v.toFixed(1)}%</strong><i style={{ ['--w' as string]: `${(r.v / 10.1) * 100}%` }} /></div>)}
    </div>
  );
}

// ================================================================ 02 Features
const FEATURES: { t: string; d: string; art: React.ReactNode }[] = [
  { t: 'Get paid, without chasing', d: 'Every unit shows Paid, Late or Due. Rent from your bank is spotted on its own. Receipts go out with one tap, and reminders stop the moment rent lands.', art: <div className="art-rows"><div><span>Maya</span><b className="status paid">Paid</b></div><div><span>Jordan</span><b className="status late">Late</b></div><div><span>Sam</span><b className="status due">Found</b></div></div> },
  { t: 'Late rent, the legal way', d: "When reminders aren't enough, Keyholder prepares your province's notice, like Ontario's N4 or BC's RTB-30, with the dates worked out and every detail checked before you approve.", art: <div className="art-sheet"><b>N4</b><i /><i /><i className="s" /><span className="stamp served">Served</span></div> },
  { t: 'Fill an empty unit faster', d: 'Share an application link or QR code. Compare applicants side by side, check references, and turn your pick into a tenant and a lease in one step.', art: <div className="art-apps"><div><b>Daniel</b><i style={{ width: '70%' }} /></div><div className="pick"><b>Lena &amp; Tom</b><i style={{ width: '90%' }} /></div></div> },
  { t: 'Bills and mortgage, straight from your banks', d: 'Connect as many banks as you like. Gas, property tax and hardware-store bills are filed to the right property. Mortgage payments are ticked off on their own.', art: <div className="art-receipts"><span>Enbridge · $212</span><span>City tax · $1,300</span><span>RBC mortgage · ✓</span></div> },
  { t: 'Know if it is worth it', d: 'Your net worth in property, what you earn a year including value growth, and how that compares with a GIC, savings and the stock market.', art: <div className="art-bars"><i style={{ height: '92%' }} className="you" /><i style={{ height: '30%' }} /><i style={{ height: '38%' }} /><i style={{ height: '70%' }} /></div> },
  { t: 'Tax time, already done', d: 'A CRA T776 rental summary that builds itself as you go, with depreciation, mortgage interest and a checklist of anything missing.', art: <div className="art-sheet"><b>T776</b><i /><i /><i /><span className="stamp paid">Ready</span></div> },
];

function Features() {
  return (
    <>
      <PageHead n={2} kicker="Features" title={<>Everything a small landlord does, <em>in one calm place.</em></>}>Six jobs Keyholder takes off your plate. Each one works on its own, so start with the one that hurts most.</PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-feats">
          {FEATURES.map((f, i) => (
            <article key={f.t} className={`lp-feat${i % 2 ? ' flip' : ''}`}>
              <span className="lp-feat-n">{String(i + 1).padStart(2, '0')}</span>
              <div className="lp-feat-text"><h2>{f.t}</h2><p>{f.d}</p></div>
              <div className="lp-art" aria-hidden>{f.art}</div>
            </article>
          ))}
        </div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap lp-grid">
          <p className="lp-label">Bronze · Silver · Gold</p>
          <div className="lp-body"><h2 className="lp-h2">Starts simple. Gets smarter as you add more.</h2><p className="lp-lede">Nothing is required beyond the rent. Each property's card turns from bronze to silver to gold as you add detail.</p></div>
        </div>
        <div className="lp-wrap lp-levels">
          <TiltCard level="bronze" title="Bronze" need="Your property, tenants and rent" gives={['Rent tracking, receipts, reminders', 'Expenses and a tax summary', 'A rough idea of what you earn']} />
          <TiltCard level="silver" title="Silver" need="What you paid and when" gives={['Your gain since you bought it', 'Return compared with a GIC', 'Rent compared with the area', 'Room to borrow, if you sold today']} />
          <TiltCard level="gold" title="Gold" need="Your mortgage and purchase costs" gives={['Mortgage tracking from your bank', 'Full taxes with depreciation', 'Exact gain and cost base']} />
        </div>
      </section>
    </>
  );
}

function TiltCard({ level, title, need, gives }: { level: string; title: string; need: string; gives: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !ref.current) return;
    const r = ref.current.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--ry', `${(x - 0.5) * 12}deg`); ref.current.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
    ref.current.style.setProperty('--mx', `${x * 100}%`); ref.current.style.setProperty('--my', `${y * 100}%`);
  };
  return (
    <div ref={ref} className={`pcard ${level} lp-level`} onPointerMove={move} onPointerLeave={() => { ref.current?.style.setProperty('--rx', '0deg'); ref.current?.style.setProperty('--ry', '0deg'); }}>
      <div className="pcard-light" aria-hidden />
      <span className="pcard-stage">{title}</span>
      <span className="pcard-title">{need}</span>
      <ul>{gives.map((g) => <li key={g}>{g}</li>)}</ul>
    </div>
  );
}

// ================================================================ 03 Provinces
const TILES: [Province, number, number][] = [
  ['YT', 1, 1], ['NT', 2, 1], ['NU', 3, 1],
  ['BC', 1, 2], ['AB', 2, 2], ['SK', 3, 2], ['MB', 4, 2], ['ON', 5, 2], ['QC', 6, 2], ['NL', 7, 2],
  ['NB', 6, 3], ['PE', 7, 3], ['NS', 7, 4],
];
function Provinces() {
  const [sel, setSel] = useState<Province>('ON');
  const info = province(sel);
  const late = formsFor(sel, 'late-rent'), inc = formsFor(sel, 'rent-increase'), lease = formsFor(sel, 'lease');
  return (
    <>
      <PageHead n={3} kicker="Provinces" title={<>Built for every province <em>and territory.</em></>}>Rules for rent increases and notices differ across Canada. Keyholder knows the difference. Tap a province to see its forms.</PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-map">
          <div className="lp-tiles" role="radiogroup" aria-label="Province">
            {TILES.map(([p, c, r]) => <button key={p} role="radio" aria-checked={sel === p} aria-label={province(p).name} className={`lp-tile${sel === p ? ' on' : ''}`} style={{ gridColumn: c, gridRow: r }} onClick={() => setSel(p)}>{p}</button>)}
          </div>
          <div className="lp-map-info" aria-live="polite">
            <p className="lp-label lp-label-inline">{info.tribunal}</p>
            <h2>{info.name}</h2>
            <dl>
              <dt>Late rent</dt><dd>{late.map((f) => f.code).join(' → ') || '—'}</dd>
              <dt>Rent increase</dt><dd>{inc.map((f) => f.code).join(', ') || '—'}{info.rentIncreaseGuidelinePct ? ` · guideline ${info.rentIncreaseGuidelinePct}%` : ''}</dd>
              <dt>Lease</dt><dd>{lease.map((f) => f.code).join(', ') || '—'}</dd>
            </dl>
            <a className="lp-arrow" href={AUTHORITY_URL[sel]} target="_blank" rel="noopener noreferrer">Official site</a>
          </div>
        </div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap lp-grid">
          <p className="lp-label">Banks</p>
          <div className="lp-body">
            <h2 className="lp-h2">Works with your bank. All of them, at once.</h2>
            <ul className="lp-banks">{POPULAR_BANKS.map((b) => <li key={b}>{b}</li>)}<li>and most credit unions</li></ul>
          </div>
        </div>
      </section>
    </>
  );
}

// ================================================================ 04 Pricing
function Pricing({ start }: { start: () => void }) {
  return (
    <>
      <PageHead n={4} kicker="Pricing · early access" title={<>Simple pricing. <em>Free to start.</em></>}>Early-access prices are not final and will be confirmed before you are ever charged.</PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-prices">
          <div className="lp-price">
            <p className="lp-label lp-label-inline">Starter</p>
            <p className="lp-amt">Free</p><p className="lp-per">For one rental unit</p>
            <ul><li>Rent tracking and receipts</li><li>Reminders</li><li>Expenses and receipt photos</li><li>Tax summary</li></ul>
            <button className="btn" onClick={start}>Start free</button>
          </div>
          <div className="lp-price best">
            <p className="lp-label lp-label-inline">Landlord · most landlords pick this</p>
            <p className="lp-amt">$8<span>per unit, a month</span></p><p className="lp-per">For 2 to 10 units</p>
            <ul><li>Everything in Starter</li><li>Several banks: rent, bills and mortgage read for you</li><li>Notices and forms for your province</li><li>Applications and tenant screening tools</li><li>Silver and Gold insights, full tax pack</li></ul>
            <button className="btn primary" onClick={start}>Get started</button>
          </div>
        </div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap lp-grid">
          <p className="lp-label">You stay in charge</p>
          <dl className="lp-body lp-trust">
            <div><dt><Icon name="lock" size={20} />View-only bank access</dt><dd>Keyholder can see deposits and bills. It can never move money.</dd></div>
            <div><dt><Icon name="check" size={20} />You approve everything</dt><dd>Every receipt, reminder and notice is shown to you first. Notices always need your sign-off.</dd></div>
            <div><dt><Icon name="home" size={20} />Your data, in Canada</dt><dd>Built for Canadian privacy law, with data kept in Canada.</dd></div>
            <div><dt><Icon name="info" size={20} />Plain words, large text</dt><dd>One button per task and a clear explanation for every number.</dd></div>
          </dl>
        </div>
      </section>
    </>
  );
}

// ================================================================ 05 Questions
const FAQ: [string, string][] = [
  ['Is this legal or tax advice?', 'No. Keyholder prepares documents and numbers for you; you make the decisions. For legal notices we suggest checking with a paralegal the first time, and an accountant at tax time.'],
  ['Which banks work?', 'RBC, TD, BMO, Scotiabank, CIBC, National Bank, Desjardins, Tangerine and most credit unions. Connect as many as you like, view only.'],
  ['I rent out part of my own home. Does that work?', 'Yes. Tell Keyholder what share you rent out, and shared costs like heat and property tax are split for you.'],
  ['Will my tenant need an account?', 'No. Tenants get receipts and reminders by email, and can apply through a simple link.'],
  ["What if I don't want to connect my bank?", 'That is fine. Tap "Mark paid" when rent comes in. Everything else still works.'],
  ['Can I try it before adding my own properties?', 'Yes. "See it in action" opens Keyholder with two sample properties so you can click around. You can leave the sample at any time.'],
  ['Can I change my mind during signup?', 'Yes. Every question has Back and Exit, and nothing is saved until the last step.'],
];
function Questions({ start, demo, signedIn }: { start: () => void; demo: () => void; signedIn: boolean }) {
  return (
    <>
      <PageHead n={5} kicker="Questions" title={<>Questions people <em>ask us.</em></>} />
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-grid">
          <p className="lp-label">Still unsure? Try the sample first. Nothing you do there is real.</p>
          <div className="lp-body lp-faqs">
            {FAQ.map(([q, a]) => <details key={q} className="lp-faq"><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>
      <section className="lp-sec lp-band lp-final">
        <div className="lp-wrap lp-grid">
          <h2 className="lp-hero-h lp-final-h">Get your weekends <em>back.</em></h2>
          <div className="lp-hero-aside">
            <p className="lp-lede">Two minutes to answer six questions. No card needed.</p>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Get started, free'}</button>
              {!signedIn && <button className="btn lp-big" onClick={demo}>See it in action</button>}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ================================================================ The live mini demo
function LiveDemo() {
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const rows = [
    { id: 'maya', who: 'Maya Chen', where: 'Unit A · $1,650', status: 'Paid', tone: 'paid', btn: 'Send receipt', done: 'Receipt sent' },
    { id: 'jordan', who: 'Jordan Patel', where: 'Unit B · $1,450', status: 'Late · 7 days', tone: 'late', btn: 'Send reminder', done: 'Reminder sent' },
    { id: 'unitc', who: 'Unit C', where: 'Empty for 38 days', status: '2 applications', tone: 'due', btn: 'Review', done: 'Daniel chosen' },
  ];
  return (
    <div className="lp-demo" aria-label="Try it: a sample rent list">
      <div className="lp-demo-head"><span>Rent · November</span><span className="tiny">3 units</span></div>
      <ul>{rows.map((r) => (
        <li key={r.id} className={sent[r.id] ? 'done' : ''}>
          <div><strong>{r.who}</strong><span>{r.where}</span></div>
          <span className={`status ${sent[r.id] ? 'paid' : r.tone}`}>{sent[r.id] ? r.done : r.status}</span>
          {sent[r.id] ? <span className="stamp sent press">Done</span> : <button className="btn primary small" onClick={() => setSent((s) => ({ ...s, [r.id]: true }))}>{r.btn}</button>}
        </li>
      ))}</ul>
      {sent.maya && <div className="lp-receipt" aria-live="polite"><strong>Rent receipt #1042</strong><span>Maya Chen · $1,650.00 · Nov 1</span><span className="stamp paid">Paid</span></div>}
      <div className="lp-demo-foot"><Icon name="bank" size={16} /> Checking RBC and TD every 4 hours</div>
    </div>
  );
}
