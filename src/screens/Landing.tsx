import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Province } from '../data/types';
import { useStore } from '../data/store';
import { Icon } from '../components/Icon';
import { Brand, KeyMark, WORDMARKS, setWordmark, useWordmark } from '../components/Brand';
import { POPULAR_BANKS, RETURN_PRESETS, province } from '../lib/jurisdiction';
import { AUTHORITY_URL, formsFor } from '../lib/forms';

// The public site. Colour has a job:
//   night navy  = the big moments (hero, proof, call to action, footer)
//   white/grey  = explaining
//   indigo      = things you can tap
//   gradient    = one highlight per page

const PAGES = [
  { id: '', label: 'Overview' },
  { id: 'features', label: 'Features' },
  { id: 'provinces', label: 'Provinces' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'questions', label: 'Questions' },
] as const;
type PageId = (typeof PAGES)[number]['id'];
const href = (id: string) => (id ? `/welcome/${id}` : '/welcome');

/** Adds "shown" to every .reveal element as it scrolls into view. */
function useReveal(key: string) {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.lp .reveal')];
    if (!('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.classList.add('shown')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('shown'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]);
}

export function Landing() {
  const { state, act } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const [solid, setSolid] = useState(false);
  const seg = loc.pathname.split('/').filter(Boolean);
  const raw = seg[0] === 'welcome' ? seg[1] ?? '' : seg[0] ?? '';
  const logo = raw === 'logo';
  const page: PageId = (PAGES.find((p) => p.id === raw)?.id ?? '') as PageId;
  const idx = logo ? -1 : PAGES.findIndex((p) => p.id === page);
  const signedIn = state.profile.onboarded;
  const demo = () => { act.startDemo(); nav('/today'); };
  const start = () => nav(signedIn ? '/today' : '/start');

  useEffect(() => { const on = () => setSolid(window.scrollY > 24); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [page, logo]);
  useEffect(() => { document.title = logo ? 'Logo options · Keyholder' : idx === 0 ? 'Keyholder · Your rental, handled' : `${PAGES[idx].label} · Keyholder`; }, [idx, logo]);
  useEffect(() => { document.body.style.overflow = menu ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menu]);
  useReveal(logo ? 'logo' : page);

  const ctas = signedIn
    ? <Link className="btn primary" to="/today">Open my dashboard</Link>
    : <><button className="btn ghost" onClick={demo}>See it in action</button><button className="btn primary" onClick={start}>Get started</button></>;
  const next = PAGES[idx + 1];
  const prev = PAGES[idx - 1];

  return (
    <div className="lp">
      <header className={`lp-nav${solid || menu ? ' solid' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <Link to="/welcome" className="lp-brand" aria-label="Keyholder home"><Brand size={28} /></Link>
          <nav aria-label="Site" className="lp-links">
            {PAGES.map((p) => <NavLink key={p.id} end to={href(p.id)} className={({ isActive }) => (isActive ? 'on' : '')}>{p.label}</NavLink>)}
          </nav>
          <div className="btn-row lp-nav-cta">{ctas}</div>
          <button className="btn lp-burger" aria-expanded={menu} aria-controls="lp-menu" onClick={() => setMenu((m) => !m)}><Icon name={menu ? 'close' : 'menu'} size={20} /><span>Menu</span></button>
        </div>
        {menu && (
          <div className="lp-menu" id="lp-menu">
            {PAGES.map((p) => <Link key={p.id} to={href(p.id)} className={p.id === page && !logo ? 'on' : ''}>{p.label}<Icon name="next" size={18} /></Link>)}
            <div className="btn-row">{ctas}</div>
          </div>
        )}
      </header>

      <main>
        {logo && <LogoOptions />}
        {!logo && page === '' && <Overview start={start} demo={demo} signedIn={signedIn} />}
        {!logo && page === 'features' && <Features />}
        {!logo && page === 'provinces' && <Provinces />}
        {!logo && page === 'pricing' && <Pricing start={start} />}
        {!logo && page === 'questions' && <Questions />}

        {!logo && (
          <nav className="lp-sec lp-pager-sec" aria-label="Pages">
            <div className="lp-wrap lp-pager">
              {prev ? <Link to={href(prev.id)} className="lp-pg prev"><span>Back</span>{prev.label}</Link> : <span />}
              {next ? <Link to={href(next.id)} className="lp-pg next"><span>Next</span>{next.label}</Link> : <button className="lp-pg next" onClick={start}><span>Ready?</span>{signedIn ? 'Open my dashboard' : 'Get started'}</button>}
            </div>
          </nav>
        )}

        <section className="lp-dark lp-cta-band">
          <div className="lp-wrap lp-cta-in reveal">
            <div>
              <h2 className="lp-h2">Get your weekends back.</h2>
              <p className="lp-lede">Six quick questions, about two minutes. No card needed.</p>
            </div>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Get started, free'}</button>
              {!signedIn && <button className="btn lp-big lp-on-dark" onClick={demo}>See it in action</button>}
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-dark lp-foot">
        <div className="lp-wrap lp-foot-grid">
          <div><Brand size={26} /><p className="lp-foot-tag">Rent, paperwork and the numbers, handled for Canadian landlords.</p></div>
          <nav aria-label="Footer">
            <p>Product</p>{PAGES.map((p) => <Link key={p.id} to={href(p.id)}>{p.label}</Link>)}
          </nav>
          <nav aria-label="Get started">
            <p>Start</p><Link to="/start">Sign up</Link><button className="lp-link" onClick={demo}>Try the sample</button><Link to="/welcome/logo">Logo options</Link>
          </nav>
          <p className="lp-legal">Keyholder prepares documents and information. It does not give legal or tax advice, file returns, or hold or move money. Notice periods, forms and rates in this preview are being verified with each province. © 2026 Keyholder.</p>
        </div>
      </footer>
    </div>
  );
}

/** Dark header band used by every inner page. */
function PageHead({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="lp-dark lp-pagehead">
      <div className="lp-spot" aria-hidden />
      <div className="lp-wrap reveal">
        <p className="lp-kicker">{kicker}</p>
        <h1 className="lp-h1">{title}</h1>
        {children && <p className="lp-lede">{children}</p>}
      </div>
    </section>
  );
}

function SecHead({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="lp-sechead reveal">
      <p className="lp-kicker">{kicker}</p>
      <h2 className="lp-h2">{title}</h2>
      {children && <p className="lp-lede">{children}</p>}
    </div>
  );
}

/** Counts up from 0 when it scrolls into view. */
function CountUp({ to, decimals = 0, prefix = '', suffix = '' }: { to: number; decimals?: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setV(0);
    let raf = 0;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => { const k = Math.min(1, (t - t0) / 1100); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{prefix}{v.toFixed(decimals)}{suffix}</span>;
}

// ================================================================ Overview
function Overview({ start, demo, signedIn }: { start: () => void; demo: () => void; signedIn: boolean }) {
  return (
    <>
      <section className="lp-dark lp-hero">
        <div className="lp-spot big" aria-hidden />
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker">For Canadian landlords with 1 to 10 units</p>
            <h1 className="lp-hero-h">Your rental, <em>handled.</em></h1>
            <p className="lp-lede">Keyholder tracks rent, sends receipts and reminders, prepares late-rent notices for your province, and tells you plainly whether your property is worth it.</p>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Get started, free'}</button>
              {!signedIn && <button className="btn lp-big lp-on-dark" onClick={demo}>See it in action</button>}
            </div>
            <ul className="lp-ticks"><li>No card needed</li><li>You approve everything</li><li>Never moves your money</li></ul>
          </div>
          <div className="lp-hero-visual">
            <LiveDemo />
            <div className="lp-stat" aria-hidden><span>Return this year</span><strong>10.1%</strong><em>GIC 3.6%</em></div>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <SecHead kicker="How it works" title="Set up in fifteen minutes." />
          <ol className="lp-steps">
            {[
              ['home', 'Add your property', 'The address, the units and your tenants. A home with a rented basement works too.'],
              ['bank', 'Connect your banks', 'View only, any Canadian bank. Or skip it and tap "Mark paid" yourself.'],
              ['check', 'Approve the next step', 'Each tenant gets one button: receipt, reminder or notice. Nothing goes out without you.'],
            ].map(([ic, t, d], i) => (
              <li key={t} className="lp-step reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                <span className="lp-step-ic"><Icon name={ic} size={22} /></span>
                <span className="lp-step-n">Step {i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-dark lp-sec lp-proof">
        <div className="lp-wrap lp-two">
          <div className="reveal">
            <p className="lp-kicker">The question that matters</p>
            <h2 className="lp-h2">Is your property beating a GIC?</h2>
            <p className="lp-lede">Rent left over, mortgage paid down and value growth, added up and compared with savings, a GIC and the stock market. One honest number, explained in plain words.</p>
            <Link to="/welcome/features" className="lp-arrow">See how it is worked out</Link>
          </div>
          <div className="lp-panel reveal"><CompareBars /></div>
        </div>
      </section>

      <section className="lp-sec lp-alt">
        <div className="lp-wrap">
          <SecHead kicker="What it does" title="Everything a small landlord does, in one place." />
          <div className="lp-grid3">
            {FEATURES.map((f, i) => (
              <Link key={f.t} to="/welcome/features" className="lp-card reveal" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                <span className="lp-card-ic"><Icon name={f.icon} size={20} /></span>
                <h3>{f.t}</h3>
                <p>{f.short}</p>
              </Link>
            ))}
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
      <p className="lp-panel-k">Return a year</p>
      {rows.map((r, i) => <div key={r.l} className={`lp-bar${r.you ? ' you' : ''}`}><span>{r.l}</span><strong><CountUp to={r.v} decimals={1} suffix="%" /></strong><i style={{ ['--w' as string]: `${(r.v / 10.1) * 100}%`, transitionDelay: `${150 + i * 110}ms` }} /></div>)}
    </div>
  );
}

// ================================================================ Features (tabs)
const FEATURES: { t: string; icon: string; short: string; d: string; art: React.ReactNode }[] = [
  { t: 'Get paid, without chasing', icon: 'rent', short: 'Paid, Late or Due for every unit, with receipts in one tap.', d: 'Every unit shows Paid, Late or Due. Rent from your bank is spotted on its own. Receipts go out with one tap, and reminders stop the moment rent lands.', art: <div className="art-rows"><div><span>Maya</span><b className="status paid">Paid</b></div><div><span>Jordan</span><b className="status late">Late</b></div><div><span>Sam</span><b className="status due">Found</b></div></div> },
  { t: 'Late rent, the legal way', icon: 'paper', short: "Your province's notice, with the dates worked out.", d: "When reminders aren't enough, Keyholder prepares your province's notice, like Ontario's N4 or BC's RTB-30, with the dates worked out and every detail checked before you approve.", art: <div className="art-sheet"><b>N4</b><i /><i /><i className="s" /><span className="stamp served">Served</span></div> },
  { t: 'Fill an empty unit faster', icon: 'user', short: 'An application link, side-by-side applicants, one-step lease.', d: 'Share an application link or QR code. Compare applicants side by side, check references, and turn your pick into a tenant and a lease in one step.', art: <div className="art-apps"><div><b>Daniel</b><i style={{ width: '70%' }} /></div><div className="pick"><b>Lena &amp; Tom</b><i style={{ width: '90%' }} /></div></div> },
  { t: 'Bills and mortgage from your banks', icon: 'bank', short: 'Several banks at once. Bills filed, mortgage ticked off.', d: 'Connect as many banks as you like. Gas, property tax and hardware-store bills are filed to the right property. Mortgage payments are ticked off on their own.', art: <div className="art-receipts"><span>Enbridge · $212</span><span>City tax · $1,300</span><span>RBC mortgage · ✓</span></div> },
  { t: 'Know if it is worth it', icon: 'chart', short: 'Your return next to a GIC, savings and stocks.', d: 'Your net worth in property, what you earn a year including value growth, and how that compares with a GIC, savings and the stock market.', art: <div className="art-bars"><i style={{ ['--h' as string]: '92%' }} className="you" /><i style={{ ['--h' as string]: '30%' }} /><i style={{ ['--h' as string]: '38%' }} /><i style={{ ['--h' as string]: '70%' }} /></div> },
  { t: 'Tax time, already done', icon: 'print', short: 'A T776 summary that builds itself as you go.', d: 'A CRA T776 rental summary that builds itself as you go, with depreciation, mortgage interest and a checklist of anything missing.', art: <div className="art-sheet"><b>T776</b><i /><i /><i /><span className="stamp paid">Ready</span></div> },
];

function Features() {
  const [tab, setTab] = useState(0);
  const f = FEATURES[tab];
  return (
    <>
      <PageHead kicker="Features" title={<>Everything a small landlord does, <em>in one calm place.</em></>}>Six jobs Keyholder takes off your plate. Pick one to see how it works.</PageHead>
      <section className="lp-sec">
        <div className="lp-wrap lp-tabs">
          <div className="lp-tablist" role="tablist" aria-label="Features" aria-orientation="vertical">
            {FEATURES.map((x, i) => (
              <button key={x.t} role="tab" id={`ft-${i}`} aria-selected={tab === i} aria-controls="ft-panel" tabIndex={tab === i ? 0 : -1} className={`lp-tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}
                onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setTab((tab + 1) % FEATURES.length); } if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setTab((tab + FEATURES.length - 1) % FEATURES.length); } }}>
                <span className="lp-tab-ic"><Icon name={x.icon} size={18} /></span>
                <span><strong>{x.t}</strong><span>{x.short}</span></span>
              </button>
            ))}
          </div>
          <div className="lp-tabpanel" role="tabpanel" id="ft-panel" aria-labelledby={`ft-${tab}`} key={tab}>
            <div className="lp-art" aria-hidden>{f.art}</div>
            <h2>{f.t}</h2>
            <p>{f.d}</p>
          </div>
        </div>
      </section>
      <section className="lp-sec lp-alt">
        <div className="lp-wrap">
          <SecHead kicker="Bronze · Silver · Gold" title="Starts simple. Gets smarter as you add more.">Nothing is required beyond the rent. Each property's card turns from bronze to silver to gold as you add detail.</SecHead>
          <div className="lp-grid3">
            <LevelCard level="bronze" title="Bronze" need="Your property, tenants and rent" gives={['Rent tracking, receipts, reminders', 'Expenses and a tax summary', 'A rough idea of what you earn']} />
            <LevelCard level="silver" title="Silver" need="What you paid and when" gives={['Your gain since you bought it', 'Return compared with a GIC', 'Rent compared with the area', 'Room to borrow']} />
            <LevelCard level="gold" title="Gold" need="Your mortgage and purchase costs" gives={['Mortgage tracking from your bank', 'Full taxes with depreciation', 'Exact gain and cost base']} />
          </div>
        </div>
      </section>
    </>
  );
}

function LevelCard({ level, title, need, gives }: { level: string; title: string; need: string; gives: string[] }) {
  return (
    <div className={`pcard ${level} lp-level reveal`}>
      <div className="pcard-light" aria-hidden />
      <span className="pcard-stage">{title}</span>
      <span className="pcard-title">{need}</span>
      <ul>{gives.map((g) => <li key={g}>{g}</li>)}</ul>
    </div>
  );
}

// ================================================================ Provinces
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
      <PageHead kicker="Provinces" title={<>Built for every province <em>and territory.</em></>}>Rules for rent increases and notices differ across Canada. Keyholder knows the difference.</PageHead>
      <section className="lp-sec">
        <div className="lp-wrap">
          <SecHead kicker="Forms by province" title="Tap a province to see its forms." />
          <div className="lp-map reveal">
            <div className="lp-tiles" role="radiogroup" aria-label="Province">
              {TILES.map(([p, c, r]) => <button key={p} role="radio" aria-checked={sel === p} aria-label={province(p).name} className={`lp-tile${sel === p ? ' on' : ''}`} style={{ gridColumn: c, gridRow: r }} onClick={() => setSel(p)}>{p}</button>)}
            </div>
            <div className="lp-map-info" aria-live="polite">
              <div key={sel} className="lp-swap">
                <p className="lp-kicker">{info.tribunal}</p>
                <h3>{info.name}</h3>
                <dl>
                  <dt>Late rent</dt><dd>{late.map((f) => f.code).join(' → ') || '—'}</dd>
                  <dt>Rent increase</dt><dd>{inc.map((f) => f.code).join(', ') || '—'}{info.rentIncreaseGuidelinePct ? ` · guideline ${info.rentIncreaseGuidelinePct}%` : ''}</dd>
                  <dt>Lease</dt><dd>{lease.map((f) => f.code).join(', ') || '—'}</dd>
                </dl>
                <a className="lp-arrow" href={AUTHORITY_URL[sel]} target="_blank" rel="noopener noreferrer">Official site</a>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="lp-sec lp-alt">
        <div className="lp-wrap">
          <SecHead kicker="Banks" title="Works with your bank. All of them, at once." />
          <ul className="lp-chips reveal">{POPULAR_BANKS.map((b) => <li key={b}>{b}</li>)}<li>Most credit unions</li></ul>
        </div>
      </section>
    </>
  );
}

// ================================================================ Pricing
function Pricing({ start }: { start: () => void }) {
  return (
    <>
      <PageHead kicker="Pricing · early access" title={<>Simple pricing. <em>Free to start.</em></>}>Early-access prices are not final and will be confirmed before you are ever charged.</PageHead>
      <section className="lp-sec">
        <div className="lp-wrap lp-prices">
          <div className="lp-price reveal">
            <h3>Starter</h3>
            <p className="lp-amt">Free</p><p className="lp-per">For one rental unit</p>
            <ul><li>Rent tracking and receipts</li><li>Reminders</li><li>Expenses and receipt photos</li><li>Tax summary</li></ul>
            <button className="btn lp-big" onClick={start}>Start free</button>
          </div>
          <div className="lp-price best reveal">
            <span className="lp-flag">Most landlords pick this</span>
            <h3>Landlord</h3>
            <p className="lp-amt"><CountUp to={8} prefix="$" /><span>per unit, a month</span></p><p className="lp-per">For 2 to 10 units</p>
            <ul><li>Everything in Starter</li><li>Several banks: rent, bills and mortgage read for you</li><li>Notices and forms for your province</li><li>Applications and tenant screening tools</li><li>Silver and Gold insights, full tax pack</li></ul>
            <button className="btn primary lp-big" onClick={start}>Get started</button>
          </div>
        </div>
      </section>
      <section className="lp-sec lp-alt">
        <div className="lp-wrap">
          <SecHead kicker="Trust" title="You stay in charge." />
          <div className="lp-grid4">
            {[
              ['lock', 'View-only bank access', 'Keyholder can see deposits and bills. It can never move money.'],
              ['check', 'You approve everything', 'Every receipt, reminder and notice is shown to you first.'],
              ['home', 'Your data, in Canada', 'Built for Canadian privacy law, with data kept in Canada.'],
              ['info', 'Plain words, large text', 'One button per task and a clear explanation for every number.'],
            ].map(([ic, t, d], i) => <div key={t} className="lp-card static reveal" style={{ transitionDelay: `${i * 60}ms` }}><span className="lp-card-ic"><Icon name={ic} size={20} /></span><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>
    </>
  );
}

// ================================================================ Questions
const FAQ: [string, string][] = [
  ['Is this legal or tax advice?', 'No. Keyholder prepares documents and numbers for you; you make the decisions. For legal notices we suggest checking with a paralegal the first time, and an accountant at tax time.'],
  ['Which banks work?', 'RBC, TD, BMO, Scotiabank, CIBC, National Bank, Desjardins, Tangerine and most credit unions. Connect as many as you like, view only.'],
  ['I rent out part of my own home. Does that work?', 'Yes. Tell Keyholder what share you rent out, and shared costs like heat and property tax are split for you.'],
  ['Will my tenant need an account?', 'No. Tenants get receipts and reminders by email, and can apply through a simple link.'],
  ["What if I don't want to connect my bank?", 'That is fine. Tap "Mark paid" when rent comes in. Everything else still works.'],
  ['Can I try it before adding my own properties?', 'Yes. "See it in action" opens Keyholder with two sample properties so you can click around. You can leave the sample at any time.'],
  ['Can I change my mind during signup?', 'Yes. Every question has Back and Exit, and nothing is saved until the last step.'],
];
function Questions() {
  return (
    <>
      <PageHead kicker="Questions" title={<>Questions people <em>ask us.</em></>}>Straight answers. If yours isn't here, try the sample: nothing you do there is real.</PageHead>
      <section className="lp-sec">
        <div className="lp-wrap lp-narrow lp-faqs reveal">
          {FAQ.map(([q, a]) => <details key={q} className="lp-faq"><summary>{q}</summary><p>{a}</p></details>)}
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
      <div className="lp-demo-head"><span>Rent · November</span><span className="lp-demo-try">Try it</span></div>
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

// ================================================================ Logo options (pick one)
function LogoOptions() {
  const cur = useWordmark();
  return (
    <>
      <PageHead kicker="Logo options" title={<>Pick your <em>Keyholder</em> logo.</>}>Tap one to use it across the site and the app, then tell me which you chose.</PageHead>
      <section className="lp-sec">
        <div className="lp-wrap lp-logos">
          {WORDMARKS.map((w, i) => (
            <button key={w.id} className={`lp-logo-card reveal${cur === w.id ? ' on' : ''}`} aria-pressed={cur === w.id} onClick={() => setWordmark(w.id)}>
              <span className="lp-logo-stage light"><Brand size={44} variant={w.id} /></span>
              <span className="lp-logo-stage dark"><Brand size={44} variant={w.id} /></span>
              <span className="lp-logo-stage icon-row">{[56, 40, 28, 20].map((n) => <KeyMark key={n} size={n} variant={w.id} />)}</span>
              <span className="lp-logo-meta"><b>{String.fromCharCode(65 + i)} · {w.name}</b><span>{w.note}</span><em>{cur === w.id ? 'In use' : 'Use this one'}</em></span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
