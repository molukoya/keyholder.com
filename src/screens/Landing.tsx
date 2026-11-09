import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Province } from '../data/types';
import { useStore } from '../data/store';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';
import { Term } from '../components/Guide';
import { Avatar, Bust, LOOKS, SceneAddHome, SceneBank, SceneTap, SceneWelcome } from '../components/Art';
import { POPULAR_BANKS, RETURN_PRESETS, province } from '../lib/jurisdiction';
import { AUTHORITY_URL, formsFor } from '../lib/forms';
import heroPhoto from '../assets/photos/home-hero.webp';
import keysPhoto from '../assets/photos/keys.webp';
import livingPhoto from '../assets/photos/living-room.webp';
import aptPhoto from '../assets/photos/apartment.webp';

// The public site: bright and friendly. White pages built from cards, real photos of homes,
// illustrations for how things work, indigo only for things you can tap.

const PAGES = [
  { id: '', label: 'Overview', icon: 'home' },
  { id: 'features', label: 'Features', icon: 'sparkle' },
  { id: 'provinces', label: 'Provinces', icon: 'map' },
  { id: 'pricing', label: 'Pricing', icon: 'cash' },
  { id: 'questions', label: 'Questions', icon: 'message' },
] as const;
type PageId = (typeof PAGES)[number]['id'];
const href = (id: string) => (id ? `/welcome/${id}` : '/welcome');

/** Adds "shown" to every .reveal element as it scrolls into view. */
function useReveal(key: string) {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.lp .reveal')];
    if (!('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.classList.add('shown')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('shown'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
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
  const page: PageId = (PAGES.find((p) => p.id === raw)?.id ?? '') as PageId;
  const idx = PAGES.findIndex((p) => p.id === page);
  const signedIn = state.profile.onboarded && !(state.profile.account && !state.profile.account.signedIn);
  const demo = () => { act.startDemo(); nav('/today'); };
  const start = () => nav(signedIn ? '/today' : '/start');

  useEffect(() => { const on = () => setSolid(window.scrollY > 12); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [page]);
  useEffect(() => { document.title = idx === 0 ? 'Keyholder · Your rental, handled' : `${PAGES[idx].label} · Keyholder`; }, [idx]);
  useEffect(() => { document.body.style.overflow = menu ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menu]);
  useReveal(page);

  const ctas = signedIn
    ? <Link className="btn primary" to="/today">Open my dashboard</Link>
    : <><Link className="btn ghost" to="/signin">Sign in</Link><button className="btn primary" onClick={start}>Start free</button></>;
  const next = PAGES[idx + 1];
  const prev = PAGES[idx - 1];

  return (
    <div className={`lp${signedIn ? '' : ' has-sticky'}`}>
      <header className={`lp-nav${solid || menu ? ' solid' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <Link to="/welcome" className="lp-brand" aria-label="Keyholder home"><Brand size={28} /></Link>
          <nav aria-label="Site" className="lp-links">
            {PAGES.map((p) => <NavLink key={p.id} end to={href(p.id)} className={({ isActive }) => (isActive ? 'on' : '')}>{p.label}</NavLink>)}
          </nav>
          <div className="btn-row lp-nav-cta">{ctas}</div>
          <button className="btn lp-burger" aria-expanded={menu} aria-controls="lp-menu" onClick={() => setMenu((m) => !m)}><Icon name={menu ? 'close' : 'menu'} size={20} /><span>Menu</span></button>
        </div>
      </header>
      {/* Outside the header on purpose: the header's frosted-glass effect would trap a full-screen menu inside its 72px. */}
      {menu && (
        <div className="lp-menu" id="lp-menu">
          {PAGES.map((p) => <Link key={p.id} to={href(p.id)} className={p.id === page ? 'on' : ''}><span className="lp-menu-ic"><Icon name={p.icon} size={20} /></span>{p.label}<Icon name="next" size={18} /></Link>)}
          <div className="btn-row">{ctas}</div>
        </div>
      )}

      <main>
        {page === '' && <Overview start={start} demo={demo} signedIn={signedIn} />}
        {page === 'features' && <Features />}
        {page === 'provinces' && <Provinces />}
        {page === 'pricing' && <Pricing start={start} />}
        {page === 'questions' && <Questions demo={demo} signedIn={signedIn} />}

        <nav className="lp-pager-sec" aria-label="Pages">
          <div className="lp-wrap lp-pager">
            {prev ? <Link to={href(prev.id)} className="lp-pg prev"><span>Back</span>{prev.label}</Link> : <span />}
            {next ? <Link to={href(next.id)} className="lp-pg next"><span>Next</span>{next.label}</Link> : <button className="lp-pg next" onClick={start}><span>Ready?</span>{signedIn ? 'Open my dashboard' : 'Get started'}</button>}
          </div>
        </nav>

        <section className="lp-sec lp-cta-sec">
          <div className="lp-wrap">
            <div className="lp-cta-card reveal">
              <div className="lp-cta-copy">
                <h2 className="lp-h2">Get your weekends back.</h2>
                <p className="lp-lede">Answer 6 quick questions, about 2 minutes. Free for 1 rental unit, no card needed.</p>
                <div className="btn-row">
                  <button className="btn lp-big lp-on-grad" onClick={start}>{signedIn ? 'Open my dashboard' : 'Start free'}</button>
                  {!signedIn && <button className="btn lp-big lp-on-grad-ghost" onClick={demo}>Try a demo first</button>}
                </div>
              </div>
              <div className="lp-cta-art"><SceneWelcome /></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-grid">
          <div><Brand size={26} /><p className="lp-foot-tag">Rent, paperwork and the numbers, handled for Canadian landlords.</p></div>
          <nav aria-label="Footer">
            <p>Product</p>{PAGES.map((p) => <Link key={p.id} to={href(p.id)}>{p.label}</Link>)}
          </nav>
          <nav aria-label="Get started">
            <p>Start</p><Link to="/start">Create a free account</Link><Link to="/signin">Sign in</Link><button className="lp-link" onClick={demo}>Try a demo</button>
          </nav>
          <p className="lp-legal">Keyholder prepares documents and information. It does not give legal or tax advice, file returns, or hold or move money. Notice periods, forms and rates in this preview are being verified with each province. Photos from Unsplash. © 2026 Keyholder.</p>
        </div>
      </footer>

      {!signedIn && !menu && (
        <div className="lp-sticky" role="region" aria-label="Get started">
          <button className="btn primary" onClick={start}>Start free</button>
          <button className="btn" onClick={demo}>Try a demo</button>
        </div>
      )}
    </div>
  );
}

/** Light page header: words on the left, a photo or picture on the right. */
function PageHead({ kicker, icon, title, children, aside }: { kicker: string; icon: string; title: React.ReactNode; children?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="lp-pagehead">
      <div className="lp-wrap lp-pagehead-grid">
        <div className="reveal">
          <p className="lp-pill"><Icon name={icon} size={16} />{kicker}</p>
          <h1 className="lp-h1">{title}</h1>
          {children && <p className="lp-lede">{children}</p>}
        </div>
        {aside && <div className="lp-pagehead-aside reveal">{aside}</div>}
      </div>
    </section>
  );
}

function SecHead({ kicker, title, children, center }: { kicker: string; title: React.ReactNode; children?: React.ReactNode; center?: boolean }) {
  return (
    <div className={`lp-sechead reveal${center ? ' center' : ''}`}>
      <p className="lp-kicker">{kicker}</p>
      <h2 className="lp-h2">{title}</h2>
      {children && <p className="lp-lede">{children}</p>}
    </div>
  );
}

const Photo = ({ src, alt, className = '' }: { src: string; alt: string; className?: string }) => (
  <figure className={`lp-photo ${className}`}><img src={src} alt={alt} loading="lazy" decoding="async" /></figure>
);

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
const TONES = ['lilac', 'mint', 'sky', 'peach', 'sun', 'rose'] as const;

function Overview({ start, demo, signedIn }: { start: () => void; demo: () => void; signedIn: boolean }) {
  return (
    <>
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-pill"><Icon name="home" size={16} />For Canadian landlords with 1 to 10 units</p>
            <h1 className="lp-hero-h">Your rental, <em>handled.</em></h1>
            <p className="lp-lede">Keyholder keeps track of your rent, writes receipts and reminders for you, and keeps every bill in one place. You stay in charge.</p>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Start free'}</button>
              {!signedIn && <button className="btn lp-big" onClick={demo}>Try a demo first, no sign-up</button>}
            </div>
            <ul className="lp-ticks"><li>Free for 1 rental unit</li><li>No card needed</li><li>About 15 minutes to set up</li></ul>
          </div>
          <div className="lp-hero-visual">
            <Photo src={heroPhoto} alt="A brick house with a blue roof on a quiet tree-lined street" className="hero" />
            <div className="lp-chip-float" aria-hidden><Avatar name="Maya Chen" size={36} /><span><strong>Maya paid $1,650</strong><span>Receipt sent for you</span></span></div>
            <div className="lp-hero-demo"><LiveDemo /></div>
          </div>
        </div>
      </section>

      <section className="lp-trust-strip" aria-label="Why landlords trust Keyholder">
        <div className="lp-wrap lp-trust-row">
          {[['lock', 'View-only bank access'], ['map', 'Every province and territory'], ['shield', 'Data kept in Canada'], ['check', 'You approve everything']].map(([ic, t], i) => (
            <div key={t} className="lp-trust-item reveal" style={{ transitionDelay: `${i * 60}ms` }}><span className={`lp-tile-ic ${TONES[i]}`}><Icon name={ic} size={18} /></span>{t}</div>
          ))}
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <SecHead kicker="How it works" title="Set up in about fifteen minutes." center />
          <ol className="lp-steps">
            {[
              [<SceneAddHome key="a" />, 'Add your property', 'The address, the units and your tenants. A home with a rented basement works too.'],
              [<SceneBank key="b" />, 'Connect your bank, or skip it', 'Keyholder can only look, never move your money. Or skip this and tap "Mark paid" yourself.'],
              [<SceneTap key="c" />, 'Tap the next step', 'Each tenant gets one button, like "Send receipt". Nothing is sent until you tap it.'],
            ].map(([art, t, d], i) => (
              <li key={t as string} className="lp-step reveal" style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="lp-step-art">{art}</div>
                <span className="lp-step-n">Step {i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
          <div className="lp-need reveal"><span className="lp-tile-ic sun"><Icon name="info" size={18} /></span><p><strong>What you need:</strong> your rental's address, your tenant's name and rent amount, and about 15 minutes.</p></div>
        </div>
      </section>

      <section className="lp-sec lp-alt">
        <div className="lp-wrap">
          <SecHead kicker="Who it's for" title="Made for everyday landlords.">These are examples of the people Keyholder is built for, not real customers.</SecHead>
          <div className="lp-grid3">
            {PEOPLE.map((p, i) => (
              <article key={p.name} className="lp-person reveal" style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="lp-person-top"><Bust look={p.look} size={64} bg={p.bg} /><div><span className="lp-example">Example</span><h3>{p.name}</h3><p>{p.where}</p></div></div>
                <p className="lp-person-need">{p.need}</p>
                <ul>{p.helps.map((h) => <li key={h}><Icon name="check" size={16} />{h}</li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <SecHead kicker="The question that matters" title="Is your rental really making you money?">
            Keyholder adds up the rent you keep, the mortgage you have paid off, and how much your home has gone up in value. Then it compares that with leaving the money in savings, a <Term t="GIC" />, or the stock market.
          </SecHead>
          <div className="lp-money">
            <Photo src={livingPhoto} alt="A bright, cozy living room in a rental apartment with plants" className="money reveal" />
            <div className="lp-panel reveal"><CompareBars /><Link to="/welcome/features" className="lp-arrow">See how it is worked out</Link></div>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-alt">
        <div className="lp-wrap">
          <SecHead kicker="What it does" title="Everything a landlord does, in one place." />
          <div className="lp-grid3">
            {FEATURES.map((f, i) => (
              <Link key={f.t} to="/welcome/features" className="lp-card reveal" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
                <span className={`lp-tile-ic big ${TONES[i % TONES.length]}`}><Icon name={f.icon} size={22} /></span>
                <h3>{f.t}</h3>
                <p>{f.short}</p>
                <span className="lp-card-more">Learn more<Icon name="next" size={16} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

const PEOPLE = [
  { name: 'Priya', where: 'Basement suite · Hamilton, ON', look: LOOKS.priya, bg: '#FFE4E8', need: 'Rents out her basement to help with the mortgage. Wants rent on time without awkward chats.', helps: ['Knows the moment rent arrives', 'Receipts sent with one tap', 'Shared heat and hydro split for her taxes'] },
  { name: 'Marcus', where: 'Duplex · Winnipeg, MB', look: LOOKS.marcus, bg: '#D3F8DF', need: 'Owns a duplex and lives in one half. Wants to know if it pays off compared with savings.', helps: ['Return compared with a GIC', 'Bills filed from his bank', 'Mortgage payments checked off'] },
  { name: 'Hélène', where: 'Two condos · Montréal, QC', look: LOOKS.helene, bg: '#E0F2FE', need: 'Has two condos and a full-time job. Wants paperwork done right for Quebec, without the stress.', helps: ['Quebec forms, in French and English', 'One button per tenant', 'Tax numbers ready in spring'] },
];

function CompareBars() {
  const rows = [{ l: 'Your property (example)', v: 10.1, you: true }, { l: RETURN_PRESETS.labels[0], v: RETURN_PRESETS.low }, { l: RETURN_PRESETS.labels[1], v: RETURN_PRESETS.typical }, { l: RETURN_PRESETS.labels[2], v: RETURN_PRESETS.high }];
  return (
    <div className="lp-compare" role="img" aria-label={rows.map((r) => `${r.l} ${r.v}%`).join(', ')}>
      <p className="lp-panel-k">What you earn in a year</p>
      {rows.map((r, i) => <div key={r.l} className={`lp-bar${r.you ? ' you' : ''}`}><span>{r.l}</span><strong><CountUp to={r.v} decimals={1} suffix="%" /></strong><i style={{ ['--w' as string]: `${(r.v / 10.1) * 100}%`, transitionDelay: `${150 + i * 110}ms` }} /></div>)}
    </div>
  );
}

// ================================================================ Features (tabs)
const FEATURES: { t: string; icon: string; short: string; d: string; art: React.ReactNode }[] = [
  { t: 'Get paid, without chasing', icon: 'cash', short: 'Paid, Late or Due for every unit, with receipts in one tap.', d: 'Every unit shows Paid, Late or Due. Rent from your bank is spotted on its own. Receipts go out with one tap, and reminders stop the moment rent lands.', art: <div className="art-rows"><div><Avatar name="Maya Chen" size={30} /><span>Maya</span><b className="status paid">Paid</b></div><div><Avatar name="Jordan Patel" size={30} /><span>Jordan</span><b className="status late">Late</b></div><div><Avatar name="Sam Okafor" size={30} /><span>Sam</span><b className="status due">Found</b></div></div> },
  { t: 'Late rent, the legal way', icon: 'paper', short: 'The right official notice, with the dates worked out.', d: "If a reminder doesn't work, Keyholder fills in your province's official notice for unpaid rent (in Ontario, that's the N4 form). It works out the dates and checks every detail before you send it.", art: <div className="art-sheet"><b>N4</b><i /><i /><i className="s" /><span className="stamp served">Served</span></div> },
  { t: 'Fill an empty unit faster', icon: 'users', short: 'People apply online. You compare and pick.', d: 'Share a link for people to apply. See everyone side by side, check references, and turn your pick into a tenant and a lease in one step.', art: <div className="art-apps"><div><Bust look={LOOKS.sam} size={34} bg="#FEF7C3" /><b>Daniel</b><i style={{ width: '70%' }} /></div><div className="pick"><Bust look={LOOKS.lena} size={34} bg="#EBE9FE" /><b>Lena &amp; Tom</b><i style={{ width: '90%' }} /></div></div> },
  { t: 'Bills and mortgage from your banks', icon: 'receipt', short: 'Bills sorted for you. Mortgage payments checked off.', d: 'Connect one bank or several. Bills like gas and property tax are saved to the right property for you, and mortgage payments are checked off on their own.', art: <div className="art-receipts"><span><i className="lp-tile-ic peach"><Icon name="flame" size={14} /></i>Enbridge gas · $212</span><span><i className="lp-tile-ic sky"><Icon name="home" size={14} /></i>City tax · $1,300</span><span><i className="lp-tile-ic mint"><Icon name="check" size={14} /></i>RBC mortgage · paid</span></div> },
  { t: 'Know if it is worth it', icon: 'trend', short: 'See if your rental makes money, in plain words.', d: 'See what your property is worth, what you keep each year, and how that compares with putting the money in a savings account or the stock market.', art: <div className="art-bars"><i style={{ ['--h' as string]: '92%' }} className="you" /><i style={{ ['--h' as string]: '30%' }} /><i style={{ ['--h' as string]: '38%' }} /><i style={{ ['--h' as string]: '70%' }} /></div> },
  { t: 'Tax time, already done', icon: 'print', short: 'Your tax numbers, ready when you need them.', d: 'Every rent payment and cost is saved as you go. At tax time, Keyholder shows the numbers for the rental part of your tax return (CRA form T776), plus a list of anything missing.', art: <div className="art-sheet"><b>T776</b><i /><i /><i /><span className="stamp paid">Ready</span></div> },
];

function Features() {
  const [tab, setTab] = useState(0);
  const f = FEATURES[tab];
  return (
    <>
      <PageHead kicker="Features" icon="sparkle" title={<>Everything a small landlord does, <em>in one calm place.</em></>} aside={<div className="lp-aside-art"><SceneTap /></div>}>Six jobs Keyholder takes off your plate. Pick one to see how it works.</PageHead>
      <section className="lp-sec lp-sec-top0">
        <div className="lp-wrap lp-tabs">
          <div className="lp-tablist" role="tablist" aria-label="Features" aria-orientation="vertical">
            {FEATURES.map((x, i) => (
              <button key={x.t} role="tab" id={`ft-${i}`} aria-selected={tab === i} aria-controls="ft-panel" tabIndex={tab === i ? 0 : -1} className={`lp-tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}
                onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setTab((tab + 1) % FEATURES.length); } if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setTab((tab + FEATURES.length - 1) % FEATURES.length); } }}>
                <span className={`lp-tile-ic ${TONES[i % TONES.length]}`}><Icon name={x.icon} size={18} /></span>
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
          <SecHead kicker="Bronze · Silver · Gold" title="Starts simple. Gets smarter as you add more.">You only need the rent to start. Your property card turns from bronze to silver to gold as you add more details. It's always free: these are not paid levels.</SecHead>
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
      <PageHead kicker="Provinces" icon="map" title={<>Built for every province <em>and territory.</em></>} aside={<Photo src={aptPhoto} alt="A bright rental apartment with a sofa and big windows" className="aside" />}>Each province has its own rules for leases, rent increases and late rent. Keyholder uses the right forms for where your rental is.</PageHead>
      <section className="lp-sec lp-sec-top0">
        <div className="lp-wrap">
          <SecHead kicker="Forms by province" title="Tap your province to see its forms." />
          <div className="lp-map reveal">
            <div className="lp-map-card">
              <div className="lp-tiles" role="radiogroup" aria-label="Province">
                {TILES.map(([p, c, r]) => <button key={p} role="radio" aria-checked={sel === p} aria-label={province(p).name} className={`lp-tile${sel === p ? ' on' : ''}`} style={{ gridColumn: c, gridRow: r }} onClick={() => setSel(p)}>{p}</button>)}
              </div>
              <p className="lp-map-hint"><Icon name="pin" size={16} />Selected: <strong>{info.name}</strong></p>
            </div>
            <div className="lp-map-info" aria-live="polite">
              <div key={sel} className="lp-swap">
                <p className="lp-kicker">Rules set by: {info.tribunal}</p>
                <h3>{info.name}</h3>
                <dl>
                  <dt>When rent is late</dt><dd>{late.length ? <ol>{late.map((f) => <li key={f.id}>{f.title} <code>{f.code}</code></li>)}</ol> : '—'}</dd>
                  <dt>Raising the rent</dt><dd>{inc.length ? inc.map((f) => <span key={f.id}>{f.title} <code>{f.code}</code></span>) : '—'}{info.rentIncreaseGuidelinePct ? <span className="lp-dd-note">Most rents can go up {info.rentIncreaseGuidelinePct}% this year</span> : null}</dd>
                  <dt>Lease</dt><dd>{lease.length ? lease.map((f) => <span key={f.id}>{f.title} <code>{f.code}</code></span>) : '—'}</dd>
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
          <ul className="lp-chips reveal">{POPULAR_BANKS.map((b, i) => <li key={b}><span className={`lp-tile-ic ${TONES[i % TONES.length]}`}><Icon name="bank" size={16} /></span>{b}</li>)}<li><span className="lp-tile-ic lilac"><Icon name="users" size={16} /></span>Most credit unions</li></ul>
        </div>
      </section>
    </>
  );
}

// ================================================================ Pricing
function Pricing({ start }: { start: () => void }) {
  return (
    <>
      <PageHead kicker="Pricing · early access" icon="cash" title={<>Simple pricing. <em>Free to start.</em></>} aside={<Photo src={keysPhoto} alt="House keys next to a small model house on a table" className="aside" />}>Early-access prices are not final and will be confirmed before you are ever charged.</PageHead>
      <section className="lp-sec lp-sec-top0">
        <div className="lp-wrap lp-prices">
          <div className="lp-price reveal">
            <span className="lp-tile-ic big mint"><Icon name="home" size={22} /></span>
            <h3>Starter</h3>
            <p className="lp-amt">Free</p><p className="lp-per">For one rental unit</p>
            <ul><li>Rent tracking and receipts</li><li>Reminders</li><li>Expenses and receipt photos</li><li>Tax summary</li></ul>
            <button className="btn lp-big" onClick={start}>Start free</button>
          </div>
          <div className="lp-price best reveal">
            <span className="lp-flag">Most landlords pick this</span>
            <span className="lp-tile-ic big lilac"><Icon name="users" size={22} /></span>
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
              ['shield', 'Your data, in Canada', 'Built for Canadian privacy law, with data kept in Canada.'],
              ['heart', 'Plain words, large text', 'One button per task and a clear explanation for every number.'],
            ].map(([ic, t, d], i) => <div key={t} className="lp-card static reveal" style={{ transitionDelay: `${i * 60}ms` }}><span className={`lp-tile-ic big ${TONES[i]}`}><Icon name={ic} size={22} /></span><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>
    </>
  );
}

// ================================================================ Questions
const FAQ: [string, string, string][] = [
  ['heart', "I'm new to being a landlord. Is this for me?", 'Yes. Keyholder was made for people with one or a few rentals. It explains each step in plain words and tells you what to do next.'],
  ['cash', 'What does it cost?', 'Free for one rental unit. For 2 to 10 units, it is planned at $8 per unit a month. Early-access prices are not final, and you will never be charged without agreeing first.'],
  ['lock', 'Is my bank information safe?', 'Yes. Keyholder can only look at deposits and bills. It can never move money, and it never sees your bank password.'],
  ['info', 'Is this legal or tax advice?', 'No. Keyholder fills in forms and numbers for you, and you make the decisions. The first time you send a legal notice, it is a good idea to check with a paralegal. At tax time, an accountant can review your numbers.'],
  ['bank', 'Which banks work?', 'RBC, TD, BMO, Scotiabank, CIBC, National Bank, Desjardins, Tangerine and most credit unions. Connect as many as you like, view only.'],
  ['home', 'I rent out part of my own home. Does that work?', 'Yes. Tell Keyholder what share you rent out, and shared costs like heat and property tax are split for you.'],
  ['users', 'Will my tenant need an account?', 'No. Tenants get receipts and reminders by email, and can apply through a simple link.'],
  ['check', "What if I don't want to connect my bank?", 'That is fine. Tap "Mark paid" when rent comes in. Everything else still works.'],
  ['sparkle', 'Can I try it before adding my own properties?', 'Yes. "Try a demo first" opens Keyholder with two sample properties so you can click around. You can leave the sample at any time.'],
  ['back', 'Can I change my mind during signup?', 'Yes. Every question has Back and Exit, and nothing is saved until the last step.'],
];
function Questions({ demo, signedIn }: { demo: () => void; signedIn: boolean }) {
  return (
    <>
      <PageHead kicker="Questions" icon="message" title={<>Questions people <em>ask us.</em></>} aside={<div className="lp-faces" aria-hidden><Bust look={LOOKS.priya} size={88} bg="#FFE4E8" /><Bust look={LOOKS.marcus} size={88} bg="#D3F8DF" /><Bust look={LOOKS.helene} size={88} bg="#E0F2FE" /><span className="lp-faces-bubble"><Icon name="message" size={22} /></span></div>}>Straight answers in plain words.</PageHead>
      <section className="lp-sec lp-sec-top0">
        <div className="lp-wrap lp-narrow lp-faqs reveal">
          {FAQ.map(([ic, q, a], i) => <details key={q} className="lp-faq"><summary><span className={`lp-tile-ic ${TONES[i % TONES.length]}`}><Icon name={ic} size={18} /></span>{q}</summary><p>{a}</p></details>)}
          {!signedIn && (
            <div className="lp-help-card">
              <div><h3>Still unsure?</h3><p>Try Keyholder with two sample properties. Nothing you do there is real.</p></div>
              <button className="btn primary" onClick={demo}>Try a demo</button>
            </div>
          )}
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
          {r.id === 'unitc' ? <span className="lp-demo-ic"><Icon name="door" size={18} /></span> : <Avatar name={r.who} size={36} />}
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
