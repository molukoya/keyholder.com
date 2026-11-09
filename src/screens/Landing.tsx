import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Province } from '../data/types';
import { useStore } from '../data/store';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';
import { Avatar, Bust, LOOKS } from '../components/Art';
import { province } from '../lib/jurisdiction';
import { AUTHORITY_URL, formsFor } from '../lib/forms';
import heroPhoto from '../assets/photos/home-hero.webp';
import keysPhoto from '../assets/photos/keys.webp';
import aptPhoto from '../assets/photos/apartment.webp';
import shotRent from '../assets/screens/rent.webp';
import shotReceipt from '../assets/screens/receipt.webp';
import shotReminder from '../assets/screens/reminder.webp';
import shotBills from '../assets/screens/bills.webp';
import shotValue from '../assets/screens/value.webp';
import shotTaxes from '../assets/screens/taxes.webp';
import shotNotice from '../assets/screens/notice.webp';
import shotTenants from '../assets/screens/tenants.webp';
import SPOTS from '../assets/screens/hotspots.json';

// The public site: light and airy. Plain white pages, thin borders instead of heavy shadows,
// real screens of the app, indigo only for things you can tap.

const PAGES = [
  { id: '', label: 'Overview', icon: 'home' },
  { id: 'features', label: 'Features', icon: 'sparkle' },
  { id: 'provinces', label: 'Provinces', icon: 'map' },
  { id: 'pricing', label: 'Pricing', icon: 'cash' },
  { id: 'questions', label: 'Questions', icon: 'message' },
] as const;
type PageId = (typeof PAGES)[number]['id'];
const href = (id: string) => (id ? `/welcome/${id}` : '/welcome');
/** "Features" is the tour on the Overview page, not a page of its own. */
const toTour = () => requestAnimationFrame(() => document.getElementById('tour')?.scrollIntoView({ block: 'start' }));

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
  // Tapping the page you are already on: back to its top (or to the tour, for Features).
  const same = (id: string) => { setMenu(false); if (id !== page) return; if (id === 'features') toTour(); else window.scrollTo(0, 0); };

  useEffect(() => { const on = () => setSolid(window.scrollY > 12); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  useEffect(() => { setMenu(false); if (page === 'features') toTour(); else window.scrollTo(0, 0); }, [page]);
  useEffect(() => { document.title = idx === 0 ? 'Keyholder · Rental automation for Canadian landlords' : `${PAGES[idx].label} · Keyholder`; }, [idx]);
  useEffect(() => { document.body.style.overflow = menu ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [menu]);
  useReveal(page);

  const ctas = signedIn
    ? <Link className="btn primary" to="/today">Open my dashboard</Link>
    : <><Link className="btn ghost" to="/signin">Sign in</Link><button className="btn primary" onClick={start}>Start free</button></>;

  return (
    <div className={`lp${signedIn ? '' : ' has-sticky'}`}>
      <header className={`lp-nav${solid || menu ? ' solid' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <Link to="/welcome" className="lp-brand" aria-label="Keyholder home" onClick={() => same('')}><Brand size={28} /></Link>
          <nav aria-label="Site" className="lp-links">
            {PAGES.map((p) => <NavLink key={p.id} end to={href(p.id)} onClick={() => same(p.id)} className={({ isActive }) => (isActive ? 'on' : '')}>{p.label}</NavLink>)}
          </nav>
          <div className="btn-row lp-nav-cta">{ctas}</div>
          <button className="btn lp-burger" aria-expanded={menu} aria-controls="lp-menu" onClick={() => setMenu((m) => !m)}><Icon name={menu ? 'close' : 'menu'} size={20} /><span>Menu</span></button>
        </div>
      </header>
      {/* Outside the header on purpose: the header's frosted-glass effect would trap a full-screen menu inside its 72px. */}
      {menu && (
        <div className="lp-menu" id="lp-menu">
          {PAGES.map((p) => <Link key={p.id} to={href(p.id)} className={p.id === page ? 'on' : ''} onClick={() => same(p.id)}><span className="lp-menu-ic"><Icon name={p.icon} size={20} /></span>{p.label}<Icon name="next" size={18} /></Link>)}
          <div className="btn-row">{ctas}</div>
        </div>
      )}

      <main>
        {(page === '' || page === 'features') && <Overview start={start} demo={demo} signedIn={signedIn} />}
        {page === 'provinces' && <Provinces />}
        {page === 'pricing' && <Pricing start={start} />}
        {page === 'questions' && <Questions />}

        <section className="lp-sec lp-cta-sec">
          <div className="lp-wrap">
            <div className="lp-cta-card reveal">
              <div>
                <h2 className="lp-h2">Ready to automate your rental?</h2>
                <p className="lp-lede">Free for 1 rental unit. No card needed.</p>
              </div>
              <div className="btn-row">
                <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Start free'}</button>
                {!signedIn && <button className="btn lp-big lp-cta-ghost" onClick={demo}>Try a demo first</button>}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-grid">
          <div><Brand size={26} /><p className="lp-foot-tag">Rental automation for Canadian landlords: receipts, reminders, tracking, valuation and taxes.</p></div>
          <nav aria-label="Footer">
            <p>Product</p>{PAGES.map((p) => <Link key={p.id} to={href(p.id)} onClick={() => same(p.id)}>{p.label}</Link>)}
          </nav>
          <nav aria-label="Get started">
            <p>Start</p><Link to="/start">Create a free account</Link><Link to="/signin">Sign in</Link><button className="lp-link" onClick={demo}>Try a demo</button>
          </nav>
          <p className="lp-legal">Keyholder prepares documents and information. It does not give legal or tax advice, file returns, or hold or move money. Notice periods, forms and rates in this preview are being verified with each province. Screens show sample properties. Photos from Unsplash. © 2026 Keyholder.</p>
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

function SecHead({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="lp-sechead reveal">
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
const AUTO: [string, string, string][] = [['receipt', 'Receipts', 'mint'], ['bell', 'Reminders', 'peach'], ['trend', 'Valuation', 'lilac'], ['print', 'Taxes', 'sun']];
const ModeBadge = ({ mode }: { mode: 'auto' | 'approve' }) => <span className={`mode-badge ${mode}`}><Icon name={mode === 'auto' ? 'sparkle' : 'check'} size={13} />{mode === 'auto' ? 'Automatic' : 'You approve'}</span>;

/** Sharp line icons for the three set-up steps (24 px grid, even stroke). */
function StepIcon({ name }: { name: 'home' | 'bank' | 'tap' }) {
  const d = {
    home: 'M3.5 10.5 12 3.75l8.5 6.75M5.75 9v11.25h7.5M18.25 9v4.5M18.5 16v5.5M15.75 18.75h5.5',
    bank: 'M3.5 9.25 12 4l8.5 5.25M5.5 10.75v6.5M9.83 10.75v6.5M14.17 10.75v6.5M18.5 10.75v6.5M3.5 20.25h17',
    tap: 'M9.25 9.25 19.75 13l-4.5 1.75-1.75 4.5zM4.5 4.5l2 2M9.25 2.75V5.5M2.75 9.25H5.5M4.75 13.75l1.75-1.75M13.75 4.75 12 6.5',
  }[name];
  return <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
const STEPS: ['home' | 'bank' | 'tap', string, string, string][] = [
  ['home', 'Add your property', 'Address, units and tenants.', 'About 10 min'],
  ['bank', 'Connect your bank', 'View only. Or skip it.', 'About 5 min'],
  ['tap', 'Tap to approve', 'Nothing is sent without you.', 'One tap'],
];

function Overview({ start, demo, signedIn }: { start: () => void; demo: () => void; signedIn: boolean }) {
  return (
    <>
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-pill"><Icon name="home" size={16} />For Canadian landlords with 1 to 10 units</p>
            <h1 className="lp-hero-h">Rental automation that gives you your <em>weekends back.</em></h1>
            <p className="lp-lede lp-hero-lede">Keyholder automates the busywork of renting. You approve, it does the rest.</p>
            <ul className="lp-auto" aria-label="What Keyholder automates">
              {AUTO.map(([ic, label, tone]) => <li key={label}><span className={`lp-tile-ic ${tone}`}><Icon name={ic} size={16} /></span>{label}</li>)}
            </ul>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Start free'}</button>
              {!signedIn && <button className="btn lp-big" onClick={demo}>Try a demo first, no sign-up</button>}
            </div>
          </div>
          <div className="lp-hero-visual">
            <Photo src={heroPhoto} alt="A brick house with a blue roof on a quiet tree-lined street" className="hero" />
            <div className="lp-chip-float" aria-hidden><Avatar name="Maya Chen" size={36} /><span><strong>Maya paid $1,650</strong><span>Receipt sent for you</span></span></div>
            <div className="lp-hero-demo"><LiveDemo /></div>
          </div>
        </div>
      </section>

      <section className="lp-how">
        <div className="lp-wrap">
          <div className="lp-how-panel">
            <SecHead kicker="How it works" title="3 steps. 15 minutes." />
            <ol className="lp-steps">
              {STEPS.map(([ic, t, d, time], i) => (
                <li key={t} className="lp-step reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="lp-step-top"><span className="lp-step-ic"><StepIcon name={ic} /></span><span className="lp-step-n">Step {i + 1}</span></div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                  <span className="lp-step-time"><Icon name={i < 2 ? 'clock' : 'check'} size={14} />{time}</span>
                  {i < STEPS.length - 1 && <span className="lp-step-arrow" aria-hidden><Icon name="next" size={16} /></span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <Tour />
    </>
  );
}

// ================================================================ Take a closer look (the features tour)
type Stop = { id: keyof typeof SPOTS; t: string; icon: string; mode: 'auto' | 'approve'; d: string; spot: string; img: string; alt: string };
const TOUR: Stop[] = [
  { id: 'rent', t: 'Rent tracking', icon: 'bank', mode: 'auto', d: 'See who has paid at a glance. Rent from your bank is matched for you.', spot: 'Send receipt', img: shotRent, alt: 'Keyholder home screen: rent collected this month, with each tenant marked Paid or Late' },
  { id: 'receipt', t: 'Rent receipts', icon: 'receipt', mode: 'auto', d: 'A numbered receipt for every payment, ready to send.', spot: 'Paid in full', img: shotReceipt, alt: 'A rent receipt for Maya Chen, marked Paid' },
  { id: 'reminder', t: 'Friendly reminders', icon: 'bell', mode: 'auto', d: 'Written for you in a friendly tone. Cancelled if rent arrives first.', spot: 'Send now', img: shotReminder, alt: 'A friendly rent reminder written for Jordan and Priya, ready to send' },
  { id: 'bills', t: 'Bills and mortgage', icon: 'cash', mode: 'auto', d: 'Bills from your banks, sorted to the right property.', spot: 'Add expense', img: shotBills, alt: 'Bills found in the bank, such as property tax and gas, ready to file' },
  { id: 'value', t: 'Property valuation', icon: 'trend', mode: 'auto', d: "What it's worth, and your return next to a GIC.", spot: 'Your return', img: shotValue, alt: 'Portfolio: net worth in property and the yearly return compared with savings, a GIC and stocks' },
  { id: 'taxes', t: 'Tax summary', icon: 'print', mode: 'auto', d: 'Your rental tax numbers, ready for your accountant.', spot: 'Print for accountant', img: shotTaxes, alt: 'Taxes page: the year’s rental income and costs, with a list of anything to fix' },
  { id: 'notice', t: 'Late-rent notices', icon: 'paper', mode: 'approve', d: 'The official notice, filled in and checked. You sign off.', spot: 'You approve', img: shotNotice, alt: 'An N4 notice for unpaid rent, filled in and checked, waiting for the landlord to approve' },
  { id: 'tenants', t: 'Finding tenants', icon: 'users', mode: 'approve', d: 'Compare applicants side by side, then choose.', spot: 'Side by side', img: shotTenants, alt: 'Two rental applications compared side by side' },
];

function Tour() {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; moved: boolean } | null>(null);
  const n = TOUR.length;
  const s = TOUR[i];
  const spot = SPOTS[s.id];
  const go = (k: number, focus = false) => {
    const next = (k + n) % n;
    setI(next);
    const tab = list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    tab?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    if (focus) tab?.focus();
  };
  useEffect(() => {
    if (!zoom) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false); };
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [zoom]);

  return (
    <section className="lp-sec lp-tour" id="tour" aria-label="Take a closer look">
      <div className="lp-wrap">
        <SecHead kicker="Take a closer look" title="See Keyholder at work.">Real screens, with sample properties.</SecHead>
        <div className="lp-tour-grid reveal">
          <div className="lp-tour-list" role="tablist" aria-label="Features" ref={list}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(i + 1, true); }
              if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1, true); }
              if (e.key === 'Home') { e.preventDefault(); go(0, true); }
              if (e.key === 'End') { e.preventDefault(); go(n - 1, true); }
            }}>
            {TOUR.map((x, k) => (
              <button key={x.id} role="tab" id={`tour-tab-${x.id}`} aria-selected={k === i} aria-controls="tour-panel" tabIndex={k === i ? 0 : -1} className={`lp-tour-tab${k === i ? ' on' : ''}`} onClick={() => go(k)}>
                <span className={`lp-tile-ic ${TONES[k % TONES.length]}`}><Icon name={x.icon} size={16} /></span>{x.t}
              </button>
            ))}
          </div>
          <div className="lp-tour-stage" role="tabpanel" id="tour-panel" aria-labelledby={`tour-tab-${s.id}`}>
            <div className="mac">
              <div className="mac-bar" aria-hidden><span className="mac-dots"><i /><i /><i /></span><span className="mac-url"><Icon name="lock" size={11} />keyholder.com</span></div>
              <button className="mac-screen" aria-label={`Enlarge screen: ${s.alt}`}
                onClick={() => { if (!touch.current?.moved) setZoom(true); }}
                onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, moved: false }; }}
                onTouchEnd={(e) => { const t = touch.current; if (!t) return; const dx = e.changedTouches[0].clientX - t.x; if (Math.abs(dx) > 40) { t.moved = true; go(dx < 0 ? i + 1 : i - 1); } }}>
                {TOUR.map((x, k) => <img key={x.id} src={x.img} alt={k === i ? x.alt : ''} aria-hidden={k !== i} className={k === i ? 'on' : ''} loading="lazy" decoding="async" width={1600} height={1000} />)}
                <span key={s.id} className="mac-spot" style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, height: `${spot.h}%` }} aria-hidden>
                  <b className={`${spot.y < 14 ? 'below' : ''} ${spot.x + spot.w / 2 > 70 ? 'r' : spot.x + spot.w / 2 < 25 ? 'l' : ''}`}>{s.spot}</b>
                </span>
              </button>
            </div>
            <div className="lp-tour-cap">
              <p aria-live="polite"><ModeBadge mode={s.mode} /><span><strong>{s.t}.</strong> {s.d}</span></p>
              <div className="lp-tour-nav">
                <button onClick={() => go(i - 1)} aria-label="Previous feature"><Icon name="back" size={18} /></button>
                <span className="lp-tour-count">{i + 1} of {n}</span>
                <button onClick={() => go(i + 1)} aria-label="Next feature"><Icon name="next" size={18} /></button>
              </div>
            </div>
            <p className="lp-tour-hint">Tap the screen to enlarge. Swipe for the next one.</p>
          </div>
        </div>
      </div>
      {zoom && createPortal(
        <div className="lp-zoom" role="dialog" aria-modal="true" aria-label={`${s.t}, enlarged`} onClick={() => setZoom(false)}>
          <button className="lp-zoom-close" onClick={() => setZoom(false)} aria-label="Close" autoFocus><Icon name="close" size={22} /></button>
          <div className="lp-zoom-scroll" onClick={(e) => e.stopPropagation()}><img src={s.img} alt={s.alt} /></div>
        </div>,
        document.body,
      )}
    </section>
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
    </>
  );
}

// ================================================================ Pricing
function Pricing({ start }: { start: () => void }) {
  return (
    <>
      <PageHead kicker="Pricing · early access" icon="cash" title={<>Simple pricing. <em>Free to start.</em></>} aside={<Photo src={keysPhoto} alt="House keys next to a small model house on a table" className="aside" />}>Early-access prices are not final and will be confirmed before you are ever charged.</PageHead>
      <section className="lp-sec lp-sec-top0">
        <div className="lp-wrap">
          <div className="lp-prices">
            <div className="lp-price reveal">
              <span className="lp-tile-ic big mint"><Icon name="home" size={22} /></span>
              <h3>Starter</h3>
              <p className="lp-amt">Free</p><p className="lp-per">Automation for one rental unit</p>
              <ul><li>Rent tracking and receipts</li><li>Reminders</li><li>Expenses and receipt photos</li><li>Tax summary</li></ul>
              <button className="btn lp-big" onClick={start}>Start free</button>
            </div>
            <div className="lp-price best reveal">
              <span className="lp-flag">Most landlords pick this</span>
              <span className="lp-tile-ic big lilac"><Icon name="users" size={22} /></span>
              <h3>Landlord</h3>
              <p className="lp-amt"><CountUp to={8} prefix="$" /><span>per unit, a month</span></p><p className="lp-per">Automation for 2 to 10 units</p>
              <ul><li>Everything in Starter</li><li>Several banks: rent, bills and mortgage read for you</li><li>Notices and forms for your province</li><li>Applications and tenant screening tools</li><li>Silver and Gold insights, full tax pack</li></ul>
              <button className="btn primary lp-big" onClick={start}>Get started</button>
            </div>
          </div>
          <div className="lp-trust-row lp-trust-under">
            {[['lock', 'View-only bank access'], ['check', 'You approve everything'], ['shield', 'Data kept in Canada'], ['heart', 'Plain words, large text']].map(([ic, t], i) => (
              <div key={t} className="lp-trust-item reveal" style={{ transitionDelay: `${i * 60}ms` }}><span className={`lp-tile-ic ${TONES[i]}`}><Icon name={ic} size={18} /></span>{t}</div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// ================================================================ Questions
const FAQ: [string, string, string][] = [
  ['sparkle', 'What does Keyholder do automatically?', 'It checks your banks for rent and bills, writes receipts and reminders, files your costs, estimates your property value each month and keeps your tax numbers up to date. Receipts and reminders go out with one tap, or automatically once you switch that on. Legal notices and choosing a tenant always need your approval.'],
  ['heart', "I'm new to being a landlord. Is this for me?", 'Yes. Keyholder is made for people with one or a few rentals, including a basement suite in your own home, where shared costs like heat are split for you. It explains each step in plain words.'],
  ['cash', 'What does it cost?', 'Free for one rental unit. For 2 to 10 units, it is planned at $8 per unit a month. Early-access prices are not final, and you will never be charged without agreeing first.'],
  ['lock', 'Is my bank information safe?', 'Yes. Keyholder can only look at deposits and bills. It can never move money, and it never sees your bank password. You can also skip the bank and tap "Mark paid" yourself.'],
  ['bank', 'Which banks work?', 'RBC, TD, BMO, Scotiabank, CIBC, National Bank, Desjardins, Tangerine and most credit unions. Connect as many as you like, view only.'],
  ['star', 'What do Bronze, Silver and Gold mean?', 'Your property card gets more useful as you add details. Bronze needs only the rent. Silver adds what you paid, so you see your gain and how you compare with a GIC. Gold adds your mortgage and buying costs for full tax numbers. It is always free.'],
  ['info', 'Is this legal or tax advice?', 'No. Keyholder fills in forms and numbers for you, and you make the decisions. The first time you send a legal notice, it is a good idea to check with a paralegal. At tax time, an accountant can review your numbers.'],
  ['users', 'Can I try it first?', 'Yes. "Try a demo first" opens Keyholder with two sample properties so you can click around. Nothing you do there is real.'],
];
function Questions() {
  return (
    <>
      <PageHead kicker="Questions" icon="message" title={<>Questions people <em>ask us.</em></>} aside={<div className="lp-faces" aria-hidden><Bust look={LOOKS.priya} size={88} bg="#FFE4E8" /><Bust look={LOOKS.marcus} size={88} bg="#D3F8DF" /><Bust look={LOOKS.helene} size={88} bg="#E0F2FE" /><span className="lp-faces-bubble"><Icon name="message" size={22} /></span></div>}>Straight answers in plain words.</PageHead>
      <section className="lp-sec lp-sec-top0">
        <div className="lp-wrap lp-narrow lp-faqs reveal">
          {FAQ.map(([ic, q, a], i) => <details key={q} className="lp-faq"><summary><span className={`lp-tile-ic ${TONES[i % TONES.length]}`}><Icon name={ic} size={18} /></span>{q}</summary><p>{a}</p></details>)}
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
