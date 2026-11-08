import { useEffect, useMemo, useState } from 'react';
import { HashRouter, MemoryRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { embedded } from './components/ui';
import { StoreProvider, useStore } from './data/store';
import { needsYouCount } from './lib/tray';
import { Icon, KeyMark } from './components/Icon';
import { ExpenseForm, PaymentForm } from './components/forms';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Portfolio } from './screens/Portfolio';
import { PropertyDetail } from './screens/PropertyDetail';
import { TenantDetail } from './screens/TenantDetail';
import { Taxes } from './screens/Money';
import { Rentals } from './screens/Rentals';
import { Paperwork } from './screens/Paperwork';
import { Settings } from './screens/Settings';

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
  useTheme();
  if (!state.profile.onboarded) return <Onboarding />;
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

  const nav = [
    { to: '/today', label: 'Home', icon: 'home', badge: true },
    { to: '/portfolio', label: 'Portfolio', icon: 'chart' },
    { to: '/rentals', label: 'Rentals', icon: 'rent' },
    { to: '/taxes', label: 'Taxes', icon: 'print' },
    { to: '/paperwork', label: 'Paperwork', icon: 'paper' },
  ];

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <Link to="/today" className="brand"><KeyMark />Keyholder</Link>
        {nav.map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive || (n.to === '/rentals' && loc.pathname.startsWith('/rent/')) ? ' active' : ''}`}><Icon name={n.icon} />{n.label}{n.badge && count > 0 && <span className="badge" aria-label={`${count} things need you`}>{count}</span>}</NavLink>)}
        <div style={{ height: 16 }} />
        <button className="btn primary" onClick={() => setCapture(true)}><Icon name="camera" size={18} />Add a receipt</button>
        <div className="rail-foot">
          <NavLink to="/settings" className="nav-link"><Icon name="settings" />Settings</NavLink>
        </div>
      </aside>

      <div className="main">
        <div className="mobile-top">
          <Link to="/today" className="brand" style={{ margin: 0 }}><KeyMark size={24} />Keyholder</Link>
        </div>
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<Today />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/portfolio/:tab" element={<Portfolio />} />
            <Route path="/rentals" element={<Rentals />} />
            <Route path="/rent" element={<Navigate to="/rentals" replace />} />
            <Route path="/taxes" element={<Taxes />} />
            <Route path="/money/tax" element={<Navigate to="/taxes" replace />} />
            <Route path="/money/worth-it" element={<Navigate to="/portfolio" replace />} />
            <Route path="/money/bank" element={<Navigate to="/settings#rent-tracking" replace />} />
            <Route path="/more" element={<More />} />
            <Route path="/rent/property/:id" element={<Keyed><PropertyDetail /></Keyed>} />
            <Route path="/rent/property/:id/:tab" element={<Keyed><PropertyDetail /></Keyed>} />
            <Route path="/rent/tenant/:id" element={<Keyed><TenantDetail /></Keyed>} />
            <Route path="/money" element={<Navigate to="/paperwork/expenses" replace />} />
            <Route path="/money/expenses" element={<Navigate to="/paperwork/expenses" replace />} />
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
        <NavLink to="/portfolio"><Icon name="chart" />Portfolio</NavLink>
        <a href="#receipt" className="capture" onClick={(e) => { e.preventDefault(); setCapture(true); }} aria-label="Add a receipt"><span className="disc"><Icon name="camera" size={24} /></span>Receipt</a>
        <NavLink to="/rentals" className={({ isActive }) => (isActive || loc.pathname.startsWith('/rent/') ? 'active' : '')}><Icon name="rent" />Rentals</NavLink>
        <NavLink to="/more" className={['/taxes', '/paperwork', '/settings', '/more'].some((x) => loc.pathname.startsWith(x)) ? 'active' : ''}><Icon name="menu" />More</NavLink>
      </nav>

      {capture && <ExpenseForm onClose={() => setCapture(false)} />}
      {pay && <PaymentForm onClose={() => setPay(false)} />}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}>{t.text}</div>)}</div>
    </div>
  );
}

/** Phone "More" menu: big, plain buttons for the less frequent tabs. */
function More() {
  const items = [
    { to: '/taxes', icon: 'print', label: 'Taxes', sub: 'Your tax summary for the year' },
    { to: '/paperwork', icon: 'paper', label: 'Paperwork', sub: 'Expense receipts, rental income, leases, notices' },
    { to: '/settings', icon: 'settings', label: 'Settings', sub: 'You, rent tracking, reminders' },
  ];
  return (
    <div className="page">
      <div className="page-head"><h1>More</h1></div>
      <div className="more-list">{items.map((i) => (
        <Link key={i.to} to={i.to} className="more-item"><Icon name={i.icon} size={26} /><span><strong>{i.label}</strong><span>{i.sub}</span></span><Icon name="next" /></Link>
      ))}</div>
    </div>
  );
}

/** Re-mount a page when its :id changes, so open panels and form state never carry over to another record. */
function Keyed({ children }: { children: React.ReactNode }) {
  const { id } = useParams();
  return <div key={id}>{children}</div>;
}
