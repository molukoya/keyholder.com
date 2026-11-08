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

// What each menu item's dropdown says. Kept free of the menu labels themselves.
const PREVIEW: Record<string, { lead: string; points: string[] }> = {
  features: { lead: 'Six jobs taken off your plate', points: ['Rent, receipts and reminders', 'Late-rent notices', 'Bills and mortgage from your banks', 'Is it beating a GIC?'] },
  provinces: { lead: 'Rules that match where you rent', points: ['Ontario N4, N1 and the standard lease', 'BC, Alberta, Quebec and every territory', 'Works with your bank'] },
  pricing: { lead: 'Free for one unit', points: ['$8 per unit a month after that', 'Early access, no card needed'] },
  questions: { lead: 'Straight answers', points: ['Is this legal advice?', 'Do tenants need an account?', 'Can I try it first?'] },
};

/** Adds "in" to every .reveal element as it scrolls into view. */
function useReveal(key: string) {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.lp .reveal')];
    if (!('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.classList.add('shown')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('shown'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]);
}

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
  useEffect(() => { document.title = idx === 0 ? 'Keyholder · Your rental, handled' : `${PAGES[idx].label} · Keyholder`; }, [idx]);
  useEffect(() => { document.body.style.overflow = menu ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menu]);
  useReveal(page);

  const ctas = signedIn
    ? <Link className="btn primary" to="/today">Open my dashboard</Link>
    : <><button className="btn ghost" onClick={demo}>See it in action</button><button className="btn primary" onClick={start}>Get started <span aria-hidden className="lp-chev">›</span></button></>;
  const next = PAGES[idx + 1];

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link to="/welcome" className="lp-brand"><KeyMark size={26} /><span>Keyholder</span></Link>
          <nav aria-label="Site" className="lp-links">
            {PAGES.map((p) => (
              <div key={p.id} className="lp-dd-item">
                <NavLink end to={href(p.id)} className={({ isActive }) => (isActive ? 'on' : '')}>{p.label}</NavLink>
                {PREVIEW[p.id] && (
                  <div className="lp-dd" role="presentation">
                    <p className="lp-dd-lead">{PREVIEW[p.id].lead}</p>
                    <ul>{PREVIEW[p.id].points.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="btn-row lp-nav-cta">{ctas}</div>
          <button className="btn lp-burger" aria-expanded={menu} aria-controls="lp-menu" onClick={() => setMenu((m) => !m)}><Icon name={menu ? 'close' : 'menu'} size={20} /><span>Menu</span></button>
        </div>
        {menu && (
          <div className="lp-menu" id="lp-menu">
            {PAGES.map((p, i) => <Link key={p.id} to={href(p.id)} className={p.id === page ? 'on' : ''} style={{ animationDelay: `${i * 40}ms` }}><em>0{i + 1}</em>{p.label}</Link>)}
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
          {next ? <Link to={href(next.id)} className="lp-pg next"><span>Next</span>{next.label}</Link> : <button className="lp-pg next" onClick={start}><span>Ready?</span>{signedIn ? 'Open my dashboard' : 'Get started'}</button>}
        </nav>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-grid">
          <Link to="/welcome" className="lp-brand"><KeyMark size={24} /><span>Keyholder</span></Link>
          <nav aria-label="Footer">{PAGES.map((p) => <Link key={p.id} to={href(p.id)}>{p.label}</Link>)}<Link to="/start">Sign up</Link></nav>
          <p className="tiny">Keyholder prepares documents and information. It does not give legal or tax advice, file returns, or hold or move money. Notice periods, forms and rates in this preview are being verified with each province. © 2026 Keyholder.</p>
        </div>
      </footer>
    </div>
  );
}

const Badge = ({ children }: { children: React.ReactNode }) => <p className="lp-badge"><i aria-hidden />{children}</p>;
const Label = ({ children }: { children: React.ReactNode }) => <p className="lp-label reveal">{children}</p>;

function PageHead({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="lp-pagehead">
      <div className="lp-mesh small" aria-hidden />
      <div className="lp-wrap lp-grid">
        <div className="lp-body-wide reveal"><Badge>{kicker}</Badge><h1 className="lp-h1">{title}</h1>{children && <p className="lp-lede">{children}</p>}</div>
      </div>
    </section>
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
      const tick = (t: number) => { const k = Math.min(1, (t - t0) / 1200); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{prefix}{v.toFixed(decimals)}{suffix}</span>;
}

// ================================================================ 01 Overview
function Overview({ start, demo, signedIn }: { start: () => void; demo: () => void; signedIn: boolean }) {
  const stack = useRef<HTMLDivElement>(null);
  // Gentle parallax: the floating screens drift at different speeds as you scroll.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => stack.current?.style.setProperty('--sy', String(Math.min(window.scrollY, 900)))); };
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);
  return (
    <>
      <section className="lp-hero">
        <div className="lp-mesh" aria-hidden />
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <Badge>Made for Canadian landlords with 1 to 10 units</Badge>
            <h1 className="lp-hero-h">Your rental, <em>handled.</em></h1>
            <p className="lp-lede">Rent tracked. Receipts and reminders sent. Late-rent notices prepared for your province. Every receipt kept. And a plain answer to whether your property is worth it.</p>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Get started, free'} <span aria-hidden className="lp-chev">›</span></button>
              {!signedIn && <button className="btn lp-big lp-quiet" onClick={demo}>See it in action</button>}
            </div>
            <p className="tiny lp-fine">No card needed · You approve everything · Never moves your money</p>
          </div>
          <div className="lp-stack" ref={stack}>
            <div className="lp-float f1"><LiveDemo /></div>
            <div className="lp-float f2 lp-mini" aria-hidden>
              <p className="lp-mini-k">Return this year</p>
              <p className="lp-mini-v">10.1%</p>
              <p className="lp-mini-s">5-year GIC 3.6%</p>
              <div className="lp-mini-bars"><i style={{ height: '100%' }} className="you" /><i style={{ height: '27%' }} /><i style={{ height: '36%' }} /><i style={{ height: '74%' }} /></div>
            </div>
            <div className="lp-float f3 lp-mini" aria-hidden>
              <p className="lp-mini-k">From your banks</p>
              <p className="lp-mini-row"><span>Enbridge Gas</span><b>Filed</b></p>
              <p className="lp-mini-row"><span>RBC mortgage</span><b>Ticked off</b></p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap lp-grid">
          <Label>How it works</Label>
          <div className="lp-body reveal"><h2 className="lp-h2">Fifteen minutes to set up. Minutes a month after that.</h2></div>
        </div>
        <ol className="lp-wrap lp-rows">
          {[
            ['Add your property', 'The address, the units, the tenants. A home with a rented basement works too.'],
            ['Connect your banks, or tap "Mark paid"', 'Any Canadian bank or credit union, view only. Keyholder checks every 4 hours for rent, bills and mortgage payments.'],
            ['Approve the next step', 'Each tenant gets one button: send the receipt, send a reminder, prepare the notice. Nothing goes out without you.'],
          ].map(([t, d], i) => (
            <li key={t} className="lp-row reveal" style={{ transitionDelay: `${i * 90}ms` }}><span className="lp-row-n">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="lp-sec lp-band">
        <div className="lp-wrap lp-grid lp-gic">
          <div className="lp-gic-bars reveal"><CompareBars /></div>
          <div className="lp-gic-text reveal">
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
      {rows.map((r, i) => <div key={r.l} className={`lp-bar${r.you ? ' you' : ''}`}><span>{r.l}</span><strong><CountUp to={r.v} decimals={1} suffix="%" /></strong><i style={{ ['--w' as string]: `${(r.v / 10.1) * 100}%`, transitionDelay: `${200 + i * 120}ms` }} /></div>)}
    </div>
  );
}

// ================================================================ 02 Features
const FEATURES: { t: string; d: string; art: React.ReactNode }[] = [
  { t: 'Get paid, without chasing', d: 'Every unit shows Paid, Late or Due. Rent from your bank is spotted on its own. Receipts go out with one tap, and reminders stop the moment rent lands.', art: <div className="art-rows"><div><span>Maya</span><b className="status paid">Paid</b></div><div><span>Jordan</span><b className="status late">Late</b></div><div><span>Sam</span><b className="status due">Found</b></div></div> },
  { t: 'Late rent, the legal way', d: "When reminders aren't enough, Keyholder prepares your province's notice, like Ontario's N4 or BC's RTB-30, with the dates worked out and every detail checked before you approve.", art: <div className="art-sheet"><b>N4</b><i /><i /><i className="s" /><span className="stamp served">Served</span></div> },
  { t: 'Fill an empty unit faster', d: 'Share an application link or QR code. Compare applicants side by side, check references, and turn your pick into a tenant and a lease in one step.', art: <div className="art-apps"><div><b>Daniel</b><i style={{ width: '70%' }} /></div><div className="pick"><b>Lena &amp; Tom</b><i style={{ width: '90%' }} /></div></div> },
  { t: 'Bills and mortgage, straight from your banks', d: 'Connect as many banks as you like. Gas, property tax and hardware-store bills are filed to the right property. Mortgage payments are ticked off on their own.', art: <div className="art-receipts"><span>Enbridge · $212</span><span>City tax · $1,300</span><span>RBC mortgage · ✓</span></div> },
  { t: 'Know if it is worth it', d: 'Your net worth in property, what you earn a year including value growth, and how that compares with a GIC, savings and the stock market.', art: <div className="art-bars"><i style={{ ['--h' as string]: '92%' }} className="you" /><i style={{ ['--h' as string]: '30%' }} /><i style={{ ['--h' as string]: '38%' }} /><i style={{ ['--h' as string]: '70%' }} /></div> },
  { t: 'Tax time, already done', d: 'A CRA T776 rental summary that builds itself as you go, with depreciation, mortgage interest and a checklist of anything missing.', art: <div className="art-sheet"><b>T776</b><i /><i /><i /><span className="stamp paid">Ready</span></div> },
];

function Features() {
  return (
    <>
      <PageHead kicker="Features" title={<>Everything a small landlord does, <em>in one calm place.</em></>}>Six jobs Keyholder takes off your plate. Each one works on its own, so start with the one that hurts most.</PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-feats">
          {FEATURES.map((f, i) => (
            <article key={f.t} className={`lp-feat reveal${i % 2 ? ' flip' : ''}`}>
              <span className="lp-feat-n">{String(i + 1).padStart(2, '0')}</span>
              <div className="lp-feat-text"><h2>{f.t}</h2><p>{f.d}</p></div>
              <Glow className="lp-art"><div aria-hidden>{f.art}</div></Glow>
            </article>
          ))}
        </div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap lp-grid">
          <Label>Bronze · Silver · Gold</Label>
          <div className="lp-body reveal"><h2 className="lp-h2">Starts simple. Gets smarter as you add more.</h2><p className="lp-lede">Nothing is required beyond the rent. Each property's card turns from bronze to silver to gold as you add detail.</p></div>
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

/** A card with a soft light that follows the pointer. */
function Glow({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--gx', `${e.clientX - r.left}px`); ref.current.style.setProperty('--gy', `${e.clientY - r.top}px`);
  };
  return <div ref={ref} className={`${className} lp-glow`} onPointerMove={move}>{children}</div>;
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
    <div className="lp-level-slot reveal">
      <div ref={ref} className={`pcard ${level} lp-level`} onPointerMove={move} onPointerLeave={() => { ref.current?.style.setProperty('--rx', '0deg'); ref.current?.style.setProperty('--ry', '0deg'); }}>
        <div className="pcard-light" aria-hidden />
        <span className="pcard-stage">{title}</span>
        <span className="pcard-title">{need}</span>
        <ul>{gives.map((g) => <li key={g}>{g}</li>)}</ul>
      </div>
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
      <PageHead kicker="Provinces" title={<>Built for every province <em>and territory.</em></>}>Rules for rent increases and notices differ across Canada. Keyholder knows the difference. Tap a province to see its forms.</PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-map reveal">
          <div className="lp-tiles" role="radiogroup" aria-label="Province">
            {TILES.map(([p, c, r], i) => <button key={p} role="radio" aria-checked={sel === p} aria-label={province(p).name} className={`lp-tile${sel === p ? ' on' : ''}`} style={{ gridColumn: c, gridRow: r, animationDelay: `${i * 35}ms` }} onClick={() => setSel(p)}>{p}</button>)}
          </div>
          <Glow className="lp-map-info">
            <div aria-live="polite" key={sel} className="lp-map-swap">
              <p className="lp-label lp-label-inline">{info.tribunal}</p>
              <h2>{info.name}</h2>
              <dl>
                <dt>Late rent</dt><dd>{late.map((f) => f.code).join(' → ') || '—'}</dd>
                <dt>Rent increase</dt><dd>{inc.map((f) => f.code).join(', ') || '—'}{info.rentIncreaseGuidelinePct ? ` · guideline ${info.rentIncreaseGuidelinePct}%` : ''}</dd>
                <dt>Lease</dt><dd>{lease.map((f) => f.code).join(', ') || '—'}</dd>
              </dl>
              <a className="lp-arrow" href={AUTHORITY_URL[sel]} target="_blank" rel="noopener noreferrer">Official site</a>
            </div>
          </Glow>
        </div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap lp-grid">
          <Label>Banks</Label>
          <div className="lp-body reveal"><h2 className="lp-h2">Works with your bank. All of them, at once.</h2></div>
        </div>
        <div className="lp-marquee" aria-label={`Works with ${POPULAR_BANKS.join(', ')} and most credit unions`}>
          <div className="lp-marquee-track" aria-hidden>
            {[0, 1].map((k) => <span key={k}>{[...POPULAR_BANKS, 'Credit unions'].map((b) => <b key={b}>{b}</b>)}</span>)}
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
      <PageHead kicker="Pricing · early access" title={<>Simple pricing. <em>Free to start.</em></>}>Early-access prices are not final and will be confirmed before you are ever charged.</PageHead>
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-prices">
          <Glow className="lp-price reveal">
            <p className="lp-label lp-label-inline">Starter</p>
            <p className="lp-amt">Free</p><p className="lp-per">For one rental unit</p>
            <ul><li>Rent tracking and receipts</li><li>Reminders</li><li>Expenses and receipt photos</li><li>Tax summary</li></ul>
            <button className="btn" onClick={start}>Start free</button>
          </Glow>
          <Glow className="lp-price best reveal">
            <p className="lp-label lp-label-inline">Landlord · most landlords pick this</p>
            <p className="lp-amt"><CountUp to={8} prefix="$" /><span>per unit, a month</span></p><p className="lp-per">For 2 to 10 units</p>
            <ul><li>Everything in Starter</li><li>Several banks: rent, bills and mortgage read for you</li><li>Notices and forms for your province</li><li>Applications and tenant screening tools</li><li>Silver and Gold insights, full tax pack</li></ul>
            <button className="btn primary" onClick={start}>Get started <span aria-hidden className="lp-chev">›</span></button>
          </Glow>
        </div>
      </section>
      <section className="lp-sec">
        <div className="lp-wrap lp-grid">
          <Label>You stay in charge</Label>
          <dl className="lp-body lp-trust">
            {[
              ['lock', 'View-only bank access', 'Keyholder can see deposits and bills. It can never move money.'],
              ['check', 'You approve everything', 'Every receipt, reminder and notice is shown to you first. Notices always need your sign-off.'],
              ['home', 'Your data, in Canada', 'Built for Canadian privacy law, with data kept in Canada.'],
              ['info', 'Plain words, large text', 'One button per task and a clear explanation for every number.'],
            ].map(([ic, t, d], i) => <div key={t} className="reveal" style={{ transitionDelay: `${i * 70}ms` }}><dt><Icon name={ic} size={20} />{t}</dt><dd>{d}</dd></div>)}
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
      <PageHead kicker="Questions" title={<>Questions people <em>ask us.</em></>} />
      <section className="lp-sec lp-sec-tight">
        <div className="lp-wrap lp-grid">
          <Label>Still unsure? Try the sample first. Nothing you do there is real.</Label>
          <div className="lp-body lp-faqs reveal">
            {FAQ.map(([q, a]) => <details key={q} className="lp-faq"><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>
      <section className="lp-sec lp-band lp-final">
        <div className="lp-wrap lp-grid">
          <h2 className="lp-hero-h lp-final-h reveal">Get your weekends <em>back.</em></h2>
          <div className="lp-final-aside reveal">
            <p className="lp-lede">Two minutes to answer six questions. No card needed.</p>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Get started, free'} <span aria-hidden className="lp-chev">›</span></button>
              {!signedIn && <button className="btn lp-big lp-quiet" onClick={demo}>See it in action</button>}
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
      <div className="lp-demo-head"><span>Rent · November</span><span className="lp-demo-try">Try it, tap a button</span></div>
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
