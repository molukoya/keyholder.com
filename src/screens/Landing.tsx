import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Province } from '../data/types';
import { useStore } from '../data/store';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';
import { Avatar, Bust, LOOKS, SceneAddHome, SceneBank, SceneTap, SceneWelcome } from '../components/Art';
import { province } from '../lib/jurisdiction';
import { AUTHORITY_URL, formsFor } from '../lib/forms';
import heroPhoto from '../assets/photos/home-hero.webp';
import keysPhoto from '../assets/photos/keys.webp';
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
          {PAGES.map((p) => <Link key={p.id} to={href(p.id)} className={p.id === page ? 'on' : ''} onClick={() => { setMenu(false); if (p.id === page) window.scrollTo(0, 0); }}><span className="lp-menu-ic"><Icon name={p.icon} size={20} /></span>{p.label}<Icon name="next" size={18} /></Link>)}
          <div className="btn-row">{ctas}</div>
        </div>
      )}

      <main>
        {page === '' && <Overview start={start} demo={demo} signedIn={signedIn} />}
        {page === 'features' && <Features />}
        {page === 'provinces' && <Provinces />}
        {page === 'pricing' && <Pricing start={start} />}
        {page === 'questions' && <Questions />}

        <section className="lp-sec lp-cta-sec">
          <div className="lp-wrap">
            <div className="lp-cta-card reveal">
              <div className="lp-cta-copy">
                <h2 className="lp-h2">Ready to automate your rental?</h2>
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
          <div><Brand size={26} /><p className="lp-foot-tag">Rental automation for Canadian landlords: receipts, reminders, tracking, valuation and taxes.</p></div>
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
const AUTO: [string, string, string][] = [['receipt', 'Receipts', 'mint'], ['bell', 'Reminders', 'peach'], ['trend', 'Valuation', 'lilac'], ['print', 'Taxes', 'sun']];
const ModeBadge = ({ mode }: { mode: 'auto' | 'approve' }) => <span className={`mode-badge ${mode}`}><Icon name={mode === 'auto' ? 'sparkle' : 'check'} size={13} />{mode === 'auto' ? 'Automatic' : 'You approve'}</span>;

function Overview({ start, demo, signedIn }: { start: () => void; demo: () => void; signedIn: boolean }) {
  return (
    <>
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-pill"><Icon name="home" size={16} />For Canadian landlords with 1 to 10 units</p>
            <h1 className="lp-hero-h">Rental automation that gives you your <em>weekends back.</em></h1>
            <p className="lp-lede">Keyholder automates the busywork of renting: receipts, reminders, rent tracking, valuation and taxes. You approve, it does the rest.</p>
            <ul className="lp-auto" aria-label="What Keyholder automates">
              {AUTO.map(([ic, label, tone]) => <li key={label}><span className={`lp-tile-ic ${tone}`}><Icon name={ic} size={16} /></span>{label}</li>)}
            </ul>
            <div className="btn-row">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Start free'}</button>
              {!signedIn && <button className="btn lp-big" onClick={demo}>Try a demo first, no sign-up</button>}
            </div>
            <ul className="lp-ticks"><li>Free for 1 rental unit</li><li>View-only bank access</li><li>You approve everything</li></ul>
          </div>
          <div className="lp-hero-visual">
            <Photo src={heroPhoto} alt="A brick house with a blue roof on a quiet tree-lined street" className="hero" />
            <div className="lp-chip-float" aria-hidden><Avatar name="Maya Chen" size={36} /><span><strong>Maya paid $1,650</strong><span>Receipt sent for you</span></span></div>
            <div className="lp-hero-demo"><LiveDemo /></div>
          </div>
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
        </div>
      </section>

    </>
  );
}

// ================================================================ Features (tabs)
const FEATURES: { t: string; icon: string; mode: 'auto' | 'approve'; short: string; d: string; art: React.ReactNode }[] = [
  { t: 'Rent tracking', icon: 'bank', mode: 'auto', short: 'Your banks are checked every 4 hours. Rent is matched to the right tenant.', d: 'Keyholder checks your banks every 4 hours (view only) and matches each deposit to the right tenant and month. Every unit shows Paid, Late or Due at a glance. No bank? Tap "Mark paid" instead.', art: <div className="art-rows"><div><Avatar name="Maya Chen" size={30} /><span>Maya</span><b className="status paid">Paid</b></div><div><Avatar name="Jordan Patel" size={30} /><span>Jordan</span><b className="status late">Late</b></div><div><Avatar name="Sam Okafor" size={30} /><span>Sam</span><b className="status due">Found</b></div></div> },
  { t: 'Rent receipts', icon: 'receipt', mode: 'auto', short: 'A receipt is written for every payment. Send it with one tap, or automatically.', d: 'Every payment gets a proper rent receipt, numbered and dated. Send it with one tap, or switch on automatic sending once you trust it. Every receipt is kept for you and your tenant.', art: <div className="art-sheet"><b>Receipt</b><i /><i /><i className="s" /><span className="stamp paid">Sent</span></div> },
  { t: 'Friendly reminders', icon: 'bell', mode: 'auto', short: 'Written the day after rent is due. They stop the moment rent arrives.', d: 'If rent is late, a polite reminder is written for you the day after it is due, in the tone you choose. It stops the moment rent arrives, so you never chase someone who already paid.', art: <div className="art-msgs"><p className="out">Hi Jordan, a friendly reminder that November rent of $1,450 was due on the 1st.</p><p className="in">Sorry! Sent it just now.</p><span className="status paid">Paid</span></div> },
  { t: 'Bills and mortgage', icon: 'cash', mode: 'auto', short: 'Bills are filed to the right property. Mortgage payments are checked off.', d: 'Connect one bank or several. Bills like gas and property tax are saved to the right property, learned from what you filed before, and mortgage payments are checked off on their own.', art: <div className="art-receipts"><span><i className="lp-tile-ic peach"><Icon name="flame" size={14} /></i>Enbridge gas · $212</span><span><i className="lp-tile-ic sky"><Icon name="home" size={14} /></i>City tax · $1,300</span><span><i className="lp-tile-ic mint"><Icon name="check" size={14} /></i>RBC mortgage · paid</span></div> },
  { t: 'Property valuation', icon: 'trend', mode: 'auto', short: 'A value estimate every month, and your return next to a GIC.', d: 'Keyholder estimates what your property is worth each month, shows what you have gained, and compares your yearly return with savings, a GIC and the stock market. Estimates, clearly labelled with their source.', art: <div className="art-bars"><i style={{ ['--h' as string]: '92%' }} className="you" /><i style={{ ['--h' as string]: '30%' }} /><i style={{ ['--h' as string]: '38%' }} /><i style={{ ['--h' as string]: '70%' }} /></div> },
  { t: 'Tax summary', icon: 'print', mode: 'auto', short: 'Your rental tax numbers build themselves as you go.', d: 'Every rent payment and cost is sorted as it happens. At tax time, the numbers for the rental part of your return (CRA form T776) are ready, with a list of anything missing. Keyholder does not file for you.', art: <div className="art-sheet"><b>T776</b><i /><i /><i /><span className="stamp paid">Ready</span></div> },
  { t: 'Late-rent notices', icon: 'paper', mode: 'approve', short: 'The right official notice, filled in. Nothing is served without you.', d: "If reminders don't work, Keyholder fills in your province's official notice for unpaid rent (in Ontario, the N4) and works out the dates. Legal notices always wait for your sign-off.", art: <div className="art-sheet"><b>N4</b><i /><i /><i className="s" /><span className="stamp served">Ready to sign</span></div> },
  { t: 'Finding tenants', icon: 'users', mode: 'approve', short: 'People apply online. You compare and choose.', d: 'Share a link for people to apply. See everyone side by side and check references. You make the choice, and Keyholder turns it into a tenant and a lease in one step.', art: <div className="art-apps"><div><Bust look={LOOKS.sam} size={34} bg="#FEF7C3" /><b>Daniel</b><i style={{ width: '70%' }} /></div><div className="pick"><Bust look={LOOKS.lena} size={34} bg="#EBE9FE" /><b>Lena &amp; Tom</b><i style={{ width: '90%' }} /></div></div> },
];

function Features() {
  const [tab, setTab] = useState(0);
  const f = FEATURES[tab];
  return (
    <>
      <PageHead kicker="Features" icon="sparkle" title={<>What Keyholder <em>automates.</em></>} aside={<div className="lp-aside-art"><SceneTap /></div>}>Eight jobs taken off your plate. Six run on their own; the two that need a decision always wait for you. Pick one to see how it works.</PageHead>
      <section className="lp-sec lp-sec-top0">
        <div className="lp-wrap lp-tabs">
          <div className="lp-tablist" role="tablist" aria-label="Features" aria-orientation="vertical">
            {FEATURES.map((x, i) => (
              <button key={x.t} role="tab" id={`ft-${i}`} aria-selected={tab === i} aria-controls="ft-panel" tabIndex={tab === i ? 0 : -1} className={`lp-tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}
                onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setTab((tab + 1) % FEATURES.length); } if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setTab((tab + FEATURES.length - 1) % FEATURES.length); } }}>
                <span className={`lp-tile-ic ${TONES[i % TONES.length]}`}><Icon name={x.icon} size={18} /></span>
                <span><strong>{x.t} <ModeBadge mode={x.mode} /></strong><span>{x.short}</span></span>
              </button>
            ))}
          </div>
          <div className="lp-tabpanel" role="tabpanel" id="ft-panel" aria-labelledby={`ft-${tab}`} key={tab}>
            <div className="lp-art" aria-hidden>{f.art}</div>
            <div className="lp-panel-head"><h2>{f.t}</h2><ModeBadge mode={f.mode} /></div>
            <p>{f.d}</p>
          </div>
        </div>
      </section>
    </>
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
        <div className="lp-wrap"><div className="lp-prices">
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
