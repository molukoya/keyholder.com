import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Province } from '../data/types';
import { useStore } from '../data/store';
import { KeyMark, Icon } from '../components/Icon';
import { POPULAR_BANKS, RETURN_PRESETS, province } from '../lib/jurisdiction';
import { AUTHORITY_URL, formsFor } from '../lib/forms';

// The landing page: what Keyholder is, the problems it solves, and a way in (start, or try the demo).

export function Landing() {
  const { state, act } = useStore();
  const nav = useNavigate();
  const signedIn = state.profile.onboarded;
  const demo = () => { act.startDemo(); nav('/today'); };
  const start = () => nav(signedIn ? '/today' : '/start');

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="#top" className="lp-brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><KeyMark size={30} /> Keyholder</a>
          <nav aria-label="Sections" className="lp-links">
            <a href="#how" onClick={jump('how')}>How it works</a>
            <a href="#features" onClick={jump('features')}>What it does</a>
            <a href="#provinces" onClick={jump('provinces')}>Provinces</a>
            <a href="#pricing" onClick={jump('pricing')}>Pricing</a>
            <a href="#faq" onClick={jump('faq')}>Questions</a>
          </nav>
          <div className="btn-row">
            {signedIn ? <Link className="btn primary" to="/today">Open my dashboard</Link> : <><button className="btn ghost" onClick={demo}>See it in action</button><button className="btn primary" onClick={start}>Get started</button></>}
          </div>
        </div>
      </header>

      {/* 1. Hero */}
      <section className="lp-hero" id="top">
        <div className="lp-wrap lp-hero-grid">
          <div>
            <p className="lp-kicker">For Canadian landlords with 1 to 10 units</p>
            <h1 className="lp-h1">Your rental,<br /><em>handled.</em></h1>
            <p className="lp-lede">Keyholder tracks rent, sends receipts and reminders, prepares late-rent notices for your province, keeps every receipt, and tells you plainly whether your property is worth it. Minutes a month, not weekends.</p>
            <div className="btn-row lp-cta">
              <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Get started, free'}</button>
              {!signedIn && <button className="btn lp-big" onClick={demo}>See it in action</button>}
            </div>
            <p className="small soft">No card needed · You approve everything · Never moves your money</p>
          </div>
          <LiveDemo />
        </div>
      </section>

      {/* 2. The problem */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <h2 className="lp-h2">Being a landlord shouldn't eat your weekends.</h2>
          <p className="lp-sub">We asked small landlords what hurts. Three answers came up again and again.</p>
          <div className="lp-pains">
            <figure><blockquote>“I never know who has paid until I check the bank three times.”</blockquote><figcaption>Chasing rent</figcaption></figure>
            <figure><blockquote>“My receipts are in a shoebox, my phone and my email. Tax time is a nightmare.”</blockquote><figcaption>Lost paperwork</figcaption></figure>
            <figure><blockquote>“Is this place even making me money once the mortgage and repairs are counted?”</blockquote><figcaption>Not knowing if it pays</figcaption></figure>
          </div>
        </div>
      </section>

      {/* 3. How it works */}
      <section className="lp-sec lp-alt" id="how">
        <div className="lp-wrap">
          <h2 className="lp-h2">Set up in fifteen minutes.</h2>
          <ol className="lp-steps">
            <li><span className="lp-step-n">1</span><h3>Add your property</h3><p>The address, your units and your tenants. A home with a rented basement works too.</p></li>
            <li><span className="lp-step-n">2</span><h3>Connect your banks, or mark rent paid</h3><p>Link any Canadian bank or credit union (view only), or just tap "Mark paid". Keyholder checks every 4 hours.</p></li>
            <li><span className="lp-step-n">3</span><h3>Keyholder does the paperwork</h3><p>Each tenant gets one clear next step: send the receipt, send a reminder, prepare the notice. You tap to approve.</p></li>
          </ol>
        </div>
      </section>

      {/* 4. What it does */}
      <section className="lp-sec" id="features">
        <div className="lp-wrap">
          <h2 className="lp-h2">Everything a small landlord does, in one calm place.</h2>
          <div className="lp-features">
            <Feature title="Get paid, without chasing" art={<ArtRent />}>See every unit as Paid, Late or Due. Rent from your bank is spotted automatically. Receipts go out with one tap; reminders stop the moment rent lands.</Feature>
            <Feature title="Late rent, the legal way" art={<ArtNotice />}>When reminders aren't enough, Keyholder prepares your province's notice, like Ontario's N4 or BC's RTB-30, with the dates worked out and every detail checked before you approve.</Feature>
            <Feature title="Fill an empty unit faster" art={<ArtApply />}>Share an application link or QR code. Compare applicants side by side, check references, and turn your pick into a tenant and lease in one step.</Feature>
            <Feature title="Never lose a receipt" art={<ArtReceipts />}>Snap a photo, or let your bank feed fill it in. Bills like gas and property tax are recognised and filed to the right property automatically.</Feature>
            <Feature title="Know if it's worth it" art={<ArtCompare />}>Your net worth in property, what you earn a year including value growth, and how it compares with a GIC, savings and the stock market.</Feature>
            <Feature title="Tax time, already done" art={<ArtTax />}>A CRA T776 rental summary that builds itself as you go, with depreciation, mortgage interest and a checklist of anything missing.</Feature>
          </div>
        </div>
      </section>

      {/* 5. Compared with a GIC */}
      <section className="lp-sec lp-dark">
        <div className="lp-wrap lp-two">
          <div>
            <p className="lp-kicker">The question that matters</p>
            <h2 className="lp-h2">Is your property beating a GIC?</h2>
            <p className="lp-sub">Keyholder adds up rent left over, mortgage paid down and value growth, then compares your return with what your money would earn elsewhere. One honest number, explained in plain words.</p>
          </div>
          <div className="lp-compare" role="img" aria-label="Example: property 10.1% a year, high-interest savings 2.75%, 5-year GIC 3.6%, stock index fund 7.5%">
            {[{ l: 'Your property (example)', v: 10.1, you: true }, { l: RETURN_PRESETS.labels[0], v: RETURN_PRESETS.low }, { l: RETURN_PRESETS.labels[1], v: RETURN_PRESETS.typical }, { l: RETURN_PRESETS.labels[2], v: RETURN_PRESETS.high }].map((r) => (
              <div key={r.l} className={`lp-bar${r.you ? ' you' : ''}`}><span>{r.l}</span><i style={{ ['--w' as string]: `${(r.v / 10.1) * 100}%` }} /><strong>{r.v.toFixed(1)}%</strong></div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Bronze, Silver, Gold */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <h2 className="lp-h2">Starts simple. Gets smarter as you add more.</h2>
          <p className="lp-sub">Nothing is required beyond the rent. Each property's card turns from bronze to silver to gold as you add detail, and unlocks more.</p>
          <div className="lp-levels">
            <TiltCard level="bronze" title="Bronze" need="Your property, tenants and rent" gives={['Rent tracking, receipts, reminders', 'Expenses and a tax summary', 'A rough idea of what you earn']} />
            <TiltCard level="silver" title="Silver" need="What you paid and when" gives={['Your gain since you bought it', 'Return compared with a GIC', 'Rent compared with the area', 'Room to borrow, if you sold today']} />
            <TiltCard level="gold" title="Gold" need="Your mortgage and purchase costs" gives={['Mortgage tracking from your bank', 'Full taxes with depreciation', 'Exact gain and cost base']} />
          </div>
        </div>
      </section>

      {/* 7. Provinces */}
      <section className="lp-sec lp-alt" id="provinces">
        <div className="lp-wrap">
          <h2 className="lp-h2">Built for every province and territory.</h2>
          <p className="lp-sub">Rules for rent increases and notices differ across Canada. Keyholder knows the difference. Tap a province.</p>
          <ProvinceMap />
          <div className="lp-banks"><span className="small soft">Works with</span>{POPULAR_BANKS.map((b) => <span key={b} className="lp-chip">{b}</span>)}<span className="lp-chip">and credit unions</span></div>
        </div>
      </section>

      {/* 8. Trust */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <h2 className="lp-h2">You stay in charge.</h2>
          <div className="lp-trust">
            <div><Icon name="lock" size={26} /><h3>View-only bank access</h3><p>Keyholder can see deposits and bills. It can never move money.</p></div>
            <div><Icon name="check" size={26} /><h3>You approve everything</h3><p>Every receipt, reminder and notice is shown to you first. Notices always need your sign-off.</p></div>
            <div><Icon name="home" size={26} /><h3>Your data, in Canada</h3><p>Built for Canadian privacy law, with data kept in Canada.</p></div>
            <div><Icon name="info" size={26} /><h3>Plain words, no jargon</h3><p>Large text, one button per task, and a clear explanation for every number.</p></div>
          </div>
        </div>
      </section>

      {/* 9. Pricing */}
      <section className="lp-sec lp-alt" id="pricing">
        <div className="lp-wrap">
          <h2 className="lp-h2">Simple pricing. <span className="lp-tag">Early access</span></h2>
          <div className="lp-prices">
            <div className="lp-price">
              <h3>Starter</h3><p className="lp-amt">Free</p><p className="soft">For one rental unit</p>
              <ul><li>Rent tracking and receipts</li><li>Reminders</li><li>Expenses and receipt photos</li><li>Tax summary</li></ul>
              <button className="btn" onClick={start}>Start free</button>
            </div>
            <div className="lp-price best">
              <h3>Landlord</h3><p className="lp-amt">$8<span>/unit a month</span></p><p className="soft">For 2 to 10 units</p>
              <ul><li>Everything in Starter</li><li>Bank links, expenses and mortgage from your banks</li><li>Notices and forms for your province</li><li>Applications and tenant screening tools</li><li>Silver and Gold insights, full Tax Pack</li></ul>
              <button className="btn primary" onClick={start}>Get started</button>
            </div>
          </div>
          <p className="small soft" style={{ textAlign: 'center' }}>Early-access prices are not final and will be confirmed before you're ever charged.</p>
        </div>
      </section>

      {/* 10. FAQ */}
      <section className="lp-sec" id="faq">
        <div className="lp-wrap lp-narrow">
          <h2 className="lp-h2">Questions people ask</h2>
          {[
            ['Is this legal or tax advice?', 'No. Keyholder prepares documents and numbers for you; you make the decisions. For legal notices we recommend checking with a paralegal the first time, and an accountant at tax time.'],
            ['Which banks work?', 'RBC, TD, BMO, Scotiabank, CIBC, National Bank, Desjardins, Tangerine and most credit unions. Connect as many as you like, view only.'],
            ['I rent out part of my own home. Does that work?', 'Yes. Tell Keyholder what share you rent out, and shared costs like heat and property tax are split for you.'],
            ['Will my tenant need an account?', 'No. Tenants get receipts and reminders by email, and can apply through a simple link.'],
            ['What if I don\'t want to connect my bank?', 'That\'s fine. Tap "Mark paid" when rent comes in. Everything else still works.'],
            ['Can I try it before adding my own properties?', 'Yes. "See it in action" opens Keyholder with two sample properties so you can click around.'],
          ].map(([q, a]) => <details key={q} className="more lp-faq"><summary>{q}</summary><div className="more-body"><p>{a}</p></div></details>)}
        </div>
      </section>

      {/* Final call to action */}
      <section className="lp-sec lp-dark lp-final">
        <div className="lp-wrap lp-narrow" style={{ textAlign: 'center' }}>
          <h2 className="lp-h2">Get your weekends back.</h2>
          <p className="lp-sub">Two minutes to set up your plan. No card needed.</p>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <button className="btn primary lp-big" onClick={start}>{signedIn ? 'Open my dashboard' : 'Get started, free'}</button>
            {!signedIn && <button className="btn lp-big lp-light" onClick={demo}>See it in action</button>}
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span className="lp-brand"><KeyMark size={22} /> Keyholder</span>
          <p className="tiny soft">Keyholder prepares documents and information; it does not give legal or tax advice, file returns, or hold or move money. Notice periods, forms and rates shown in this preview are being verified with each province. © 2026 Keyholder.</p>
        </div>
      </footer>
    </div>
  );
}

const jump = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

function Feature({ title, art, children }: { title: string; art: React.ReactNode; children: React.ReactNode }) {
  return <article className="lp-feature"><div className="lp-art" aria-hidden>{art}</div><h3>{title}</h3><p>{children}</p></article>;
}

// ---------- The live mini demo in the hero ----------
function LiveDemo() {
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const rows = [
    { id: 'maya', who: 'Maya Chen', where: 'Unit A · $1,650', status: 'Paid', tone: 'paid', btn: 'Send receipt', done: 'Receipt sent' },
    { id: 'jordan', who: 'Jordan Patel', where: 'Unit B · $1,450', status: 'Late · 7 days', tone: 'late', btn: 'Send reminder', done: 'Reminder sent' },
    { id: 'unitc', who: 'Unit C', where: 'Empty for 38 days', status: '2 applications', tone: 'due', btn: 'Review', done: 'Daniel chosen' },
  ];
  return (
    <div className="lp-demo" aria-label="Try it: a sample rent list">
      <div className="lp-demo-head"><span>Rent for November</span><span className="tiny soft">Try it, tap a button</span></div>
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

// ---------- Small illustrations built from app pieces ----------
const ArtRent = () => <div className="art-rows"><div><span>Maya</span><b className="status paid">Paid</b></div><div><span>Jordan</span><b className="status late">Late</b></div><div><span>Sam</span><b className="status due">Found</b></div></div>;
const ArtNotice = () => <div className="art-sheet"><b>N4</b><i /><i /><i className="s" /><span className="stamp served">Served</span></div>;
const ArtApply = () => <div className="art-apps"><div><b>Daniel</b><i style={{ width: '70%' }} /></div><div className="pick"><b>Lena &amp; Tom</b><i style={{ width: '90%' }} /></div></div>;
const ArtReceipts = () => <div className="art-receipts"><span>Enbridge · $212</span><span>City tax · $1,300</span><span>Home Depot · $86</span></div>;
const ArtCompare = () => <div className="art-bars"><i style={{ height: '92%' }} className="you" /><i style={{ height: '30%' }} /><i style={{ height: '38%' }} /><i style={{ height: '70%' }} /></div>;
const ArtTax = () => <div className="art-sheet"><b>T776</b><i /><i /><i /><span className="stamp paid">Ready</span></div>;

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

// ---------- A tile map of Canada: tap a province to see its forms ----------
const TILES: [Province, number, number][] = [
  ['YT', 1, 1], ['NT', 2, 1], ['NU', 3, 1],
  ['BC', 1, 2], ['AB', 2, 2], ['SK', 3, 2], ['MB', 4, 2], ['ON', 5, 2], ['QC', 6, 2], ['NL', 7, 2],
  ['NB', 6, 3], ['PE', 7, 3], ['NS', 7, 4],
];
function ProvinceMap() {
  const [sel, setSel] = useState<Province>('ON');
  const info = province(sel);
  const late = formsFor(sel, 'late-rent'), inc = formsFor(sel, 'rent-increase'), lease = formsFor(sel, 'lease');
  return (
    <div className="lp-map">
      <div className="lp-tiles" role="radiogroup" aria-label="Province">
        {TILES.map(([p, c, r]) => <button key={p} role="radio" aria-checked={sel === p} aria-label={province(p).name} className={`lp-tile${sel === p ? ' on' : ''}`} style={{ gridColumn: c, gridRow: r }} onClick={() => setSel(p)}>{p}</button>)}
      </div>
      <div className="lp-map-info">
        <h3>{info.name}</h3>
        <p className="small soft">{info.tribunal}{info.rentIncreaseGuidelinePct ? ` · rent increase guideline ${info.rentIncreaseGuidelinePct}%` : ''}</p>
        <ul>
          <li><b>Late rent:</b> {late.map((f) => f.code).join(' → ')}</li>
          <li><b>Rent increase:</b> {inc.map((f) => f.code).join(', ')}</li>
          <li><b>Lease:</b> {lease.map((f) => f.code).join(', ')}</li>
        </ul>
        <a className="small" href={AUTHORITY_URL[sel]} target="_blank" rel="noopener noreferrer">Official site</a>
      </div>
    </div>
  );
}
