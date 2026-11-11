import { useEffect, useMemo, useState } from 'react';
import { HashRouter, MemoryRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { embedded } from './components/ui';
import { StoreProvider, useStore } from './data/store';
import { needsYouCount } from './lib/tray';
import { Icon } from './components/Icon';
import { Brand } from './components/Brand';
import { ExpenseForm, PaymentForm } from './components/forms';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Portfolio } from './screens/Portfolio';
import { PropertyDetail } from './screens/PropertyDetail';
import { TenantDetail } from './screens/TenantDetail';
import { ExpensesPage } from './screens/Money';
import { Rentals } from './screens/Rentals';
import { IncomePage, Paperwork } from './screens/Paperwork';
import { Settings } from './screens/Settings';
import { Landing } from './screens/Landing';
import { SignIn } from './screens/Account';
import { AuthLinks } from './screens/AuthLinks';
import { Support } from './screens/Support';
import { AnnouncementBar } from './support/Announcement';
import { SampleBanner, Tour, PageSub, HelpButton } from './components/Guide';
import { SetupCircle } from './components/Setup';

export function App() {
  return (
    <StoreProvider>
      {embedded ? <MemoryRouter><Root /></MemoryRouter> : <HashRouter><Root /></HashRouter>}
    </StoreProvider>
  );
}

function useTheme() {
  const { state } = useStore();
  useEffect(() => {
    const el = document.documentElement;
    if (state.profile.theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', state.profile.theme);
    document.body.classList.toggle('grain', state.profile.paperGrain);
  }, [state.profile.theme, state.profile.paperGrain]);
}

function Root() {
  const { state } = useStore();
  const loc = useLocation();
  useTheme();
  // The landing page is the front door; /welcome shows it again from inside the app.
  const onStart = loc.pathname === '/start' || loc.pathname.startsWith('/start/');
  // The app opens for a signed-in account (admin sees the sample). Anyone else, including an old demo
  // left in the browser, is a visitor: the website, Sign in and signup all work for them.
  const p = state.profile;
  const signedIn = !!p.account?.signedIn;
  const inApp = p.onboarded && (signedIn || (!p.account && !p.sample));
  if (loc.pathname.startsWith('/welcome')) return <Landing />;
  // Pages opened from emails (reset password, confirm email, team invite) and the return from Google.
  if (/^\/(reset|verify|auth)(\/|$)/.test(loc.pathname)) return <AuthLinks />;
  // admin / admin: the support dashboard. Anyone else asking for it gets their own home instead.
  if (loc.pathname.startsWith('/support') && signedIn && p.account?.provider === 'admin') return <Routes><Route path="/support/*" element={<Support />} /></Routes>;
  if (loc.pathname.startsWith('/signin')) return signedIn ? <Navigate to={p.account?.provider === 'admin' ? '/support' : '/today'} replace /> : <SignIn />;
  // The Keyholder team (with the server) sees only the support dashboard: no landlord app behind it.
  if (signedIn && p.account?.provider === 'admin' && !p.sample) return <Navigate to="/support" replace />;
  // Signed up but the questions are not done yet: back to the questions (the website stays open to them).
  const unfinished = signedIn && !p.onboarded && !p.sample && (p.account?.provider === 'google' || p.account?.provider === 'email');
  if (unfinished) return onStart ? <Onboarding /> : <Navigate to="/start/1" replace />;
  if (!inApp) return onStart ? <Onboarding /> : <Landing />;
  return <Shell />;
}

function Shell() {
  const { state, today, toasts } = useStore();
  const [capture, setCapture] = useState(false);
  const [pay, setPay] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  // Badge on Home = everything under "Needs you now".
  const count = useMemo(() => needsYouCount(state, today), [state, today]);

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  // Remember the visit before today's, for "Since your last visit" on Home.
  const { act } = useStore();
  useEffect(() => { if (state.profile.lastVisit !== today) act.setProfile({ prevVisit: state.profile.lastVisit, lastVisit: today }); }, [today]); // eslint-disable-line react-hooks/exhaustive-deps
  // Desktop keyboard shortcuts (PRD §12): P = log a payment, E = add an expense, T = open the tray.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || document.querySelector('.drawer')) return;
      if (e.key === 'p') { e.preventDefault(); setPay(true); }
      if (e.key === 'e') { e.preventDefault(); setCapture(true); }
      if (e.key === 't') { e.preventDefault(); navigate('/todo'); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  // The menu, in order. Settings sits at the foot of the side menu.
  const nav = [
    { to: '/today', label: 'Home', icon: 'home', badge: true },
    { to: '/portfolio', label: 'Portfolio', icon: 'chart' },
    { to: '/rentals', label: 'Rentals', icon: 'rent' },
    { to: '/income', label: 'Income', icon: 'cash' },
    { to: '/expenses', label: 'Expenses', icon: 'receipt' },
    { to: '/paperwork', label: 'Paperwork', icon: 'paper' },
  ];

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <Link to="/welcome" className="brand" title="About Keyholder"><Brand size={28} /></Link>
        {nav.map((n) => <NavLink key={n.to} to={n.to} data-tour={n.to.slice(1)} className={({ isActive }) => `nav-link${isActive || (n.to === '/rentals' && loc.pathname.startsWith('/rent/')) ? ' active' : ''}`}><Icon name={n.icon} />{n.label}{n.badge && count > 0 && <span className="badge" aria-label={`${count} things need you`}>{count}</span>}</NavLink>)}
        <div className="rail-foot">
          <HelpButton />
        </div>
      </aside>

      <div className="main">
        <div className="mobile-top">
          <Link to="/welcome" className="brand" style={{ margin: 0 }}><Brand size={24} /></Link>
          <span className="top-tools" data-tour="account"><SetupCircle /><SettingsIcon /></span>
        </div>
        <div className="top-tools desk"><span className="top-tools" data-tour="account"><SetupCircle /><SettingsIcon /></span></div>
        <main>
          <AnnouncementBar where="app" />
          <SampleBanner />
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<Today />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/portfolio/:tab" element={<Portfolio />} />
            <Route path="/rentals" element={<Rentals />} />
            <Route path="/rent" element={<Navigate to="/rentals" replace />} />
            <Route path="/income" element={<IncomePage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/taxes" element={<Navigate to="/paperwork/taxes" replace />} />
            <Route path="/money/tax" element={<Navigate to="/paperwork/taxes" replace />} />
            <Route path="/money/worth-it" element={<Navigate to="/portfolio" replace />} />
            <Route path="/money/bank" element={<Navigate to="/settings#rent-tracking" replace />} />
            <Route path="/more" element={<More />} />
            <Route path="/rent/property/:id" element={<Keyed><PropertyDetail /></Keyed>} />
            <Route path="/rent/property/:id/:tab" element={<Keyed><PropertyDetail /></Keyed>} />
            <Route path="/rent/tenant/:id" element={<Keyed><TenantDetail /></Keyed>} />
            <Route path="/money" element={<Navigate to="/expenses" replace />} />
            <Route path="/money/expenses" element={<Navigate to="/expenses" replace />} />
            <Route path="/paperwork/expenses" element={<Navigate to="/expenses" replace />} />
            <Route path="/paperwork/income" element={<Navigate to="/income" replace />} />
            <Route path="/paperwork/receipts" element={<Navigate to="/income" replace />} />
            <Route path="/money/cash-flow" element={<Navigate to="/portfolio/cash-flow" replace />} />
            <Route path="/money/summary" element={<Navigate to="/portfolio/cash-flow" replace />} />
            <Route path="/paperwork" element={<Paperwork />} />
            <Route path="/paperwork/:tab" element={<Paperwork />} />
            <Route path="/todo" element={<Navigate to="/today" replace />} />
            <Route path="/tray" element={<Navigate to="/today" replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </main>
      </div>

      <nav className="bottombar" aria-label="Main">
        <NavLink to="/today"><Icon name="home" />Home{count > 0 && <span className="badge">{count}</span>}</NavLink>
        <NavLink to="/income" data-tour="income"><Icon name="cash" />Income</NavLink>
        <NavLink to="/rentals" data-tour="rentals" className={({ isActive }) => `hub${isActive || loc.pathname.startsWith('/rent/') ? ' active' : ''}`}><span className="disc"><Icon name="rent" size={24} /></span>Rentals</NavLink>
        <NavLink to="/expenses" data-tour="expenses"><Icon name="receipt" />Expenses</NavLink>
        <NavLink to="/more" data-tour="more" className={['/portfolio', '/paperwork', '/settings', '/more'].some((x) => loc.pathname.startsWith(x)) ? 'active' : ''}><Icon name="menu" />More</NavLink>
      </nav>

      {capture && <ExpenseForm onClose={() => setCapture(false)} />}
      {pay && <PaymentForm onClose={() => setPay(false)} />}
      <Tour />
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}>{t.text}</div>)}</div>
    </div>
  );
}

/** Top right in the app: Settings, as an icon; on the Settings page, a small Sign out icon next to it. */
function SettingsIcon() {
  const { act } = useStore();
  const navigate = useNavigate();
  const onSettings = useLocation().pathname.startsWith('/settings');
  return (
    <>
      <NavLink to="/settings" className="icon-btn" aria-label="Settings" title="Settings"><Icon name="settings" size={20} /></NavLink>
      {onSettings && <button className="icon-btn signout-icon" aria-label="Sign out" title="Sign out" onClick={() => { act.signOut(); navigate('/welcome'); }}><Icon name="logout" size={20} /></button>}
    </>
  );
}

/** Phone "More" menu: big, plain buttons for the pages not in the bottom bar. */
function More() {
  const items = [
    { to: '/portfolio', icon: 'chart', label: 'Portfolio', sub: 'What your properties are worth and earn' },
    { to: '/paperwork', icon: 'paper', label: 'Paperwork', sub: 'Leases, notices, forms and taxes' },
    { to: '/settings', icon: 'settings', label: 'Settings', sub: 'Your profile, rent tracking, reminders' },
  ];
  return (
    <div className="page">
      <div className="page-head"><div><h1>More</h1><PageSub>Portfolio, paperwork, settings and help.</PageSub></div></div>
      <div className="more-list">{items.map((i) => (
        <Link key={i.to} to={i.to} className="more-item"><Icon name={i.icon} size={26} /><span><strong>{i.label}</strong><span>{i.sub}</span></span><Icon name="next" /></Link>
      ))}<HelpButton variant="more" /></div>
    </div>
  );
}

/** Re-mount a page when its :id changes, so open panels and form state never carry over to another record. */
function Keyed({ children }: { children: React.ReactNode }) {
  const { id } = useParams();
  return <div key={id}>{children}</div>;
}
