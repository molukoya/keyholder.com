import { useEffect, useMemo, useState } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './data/store';
import { PHASES } from './data/phases';
import { trayItems } from './lib/tray';
import { Icon, KeyMark } from './components/Icon';
import { ExpenseForm, PaymentForm } from './components/forms';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Rent } from './screens/Rent';
import { PropertyDetail } from './screens/PropertyDetail';
import { TenantDetail } from './screens/TenantDetail';
import { Money } from './screens/Money';
import { Paperwork } from './screens/Paperwork';
import { Settings } from './screens/Settings';
import { Tray } from './screens/Tray';

export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Root />
      </HashRouter>
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
  const count = useMemo(() => trayItems(state, today).length, [state, today]);
  const phase = PHASES.find((p) => p.id === state.profile.phase)!;

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  // Desktop keyboard shortcuts (PRD §12): P = log a payment, E = add an expense, T = open the tray.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || document.querySelector('.drawer')) return;
      if (e.key === 'p') { e.preventDefault(); setPay(true); }
      if (e.key === 'e') { e.preventDefault(); setCapture(true); }
      if (e.key === 't') { e.preventDefault(); window.location.hash = '#/tray'; }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const nav = [
    { to: '/today', label: 'Today', icon: 'today' },
    { to: '/rent', label: 'Rent', icon: 'rent' },
    { to: '/money', label: 'Money', icon: 'money' },
    { to: '/paperwork', label: 'Paperwork', icon: 'paper' },
  ];

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <Link to="/today" className="brand"><KeyMark />Keyholder</Link>
        {nav.map((n) => <NavLink key={n.to} to={n.to} className="nav-link"><Icon name={n.icon} />{n.label}</NavLink>)}
        <NavLink to="/tray" className="nav-link"><Icon name="tray" />Tray{count > 0 && <span className="badge" aria-label={`${count} items`}>{count}</span>}</NavLink>
        <div style={{ height: 16 }} />
        <button className="btn primary" onClick={() => setCapture(true)}><Icon name="camera" size={18} />Snap a receipt</button>
        <button className="btn" onClick={() => setPay(true)}><Icon name="check" size={18} />Confirm rent</button>
        <div className="rail-foot">
          <NavLink to="/settings" className="nav-link"><Icon name="settings" />Settings</NavLink>
          <Link to="/settings#phase" className="phase-chip">Preview: <strong>Phase {phase.id}</strong><br />{phase.name}</Link>
          <span className="tiny faint" style={{ padding: '0 8px' }}>Shortcuts: P payment · E expense · T tray</span>
        </div>
      </aside>

      <div className="main">
        <div className="mobile-top">
          <Link to="/today" className="brand" style={{ margin: 0 }}><KeyMark size={24} />Keyholder</Link>
          <div className="btn-row">
            <Link to="/settings#phase" className="pill">Phase {phase.id}</Link>
            <Link to="/settings" className="btn ghost" aria-label="Settings"><Icon name="user" /></Link>
          </div>
        </div>
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<Today onPay={() => setPay(true)} onCapture={() => setCapture(true)} />} />
            <Route path="/rent" element={<Rent />} />
            <Route path="/rent/property/:id" element={<PropertyDetail />} />
            <Route path="/rent/property/:id/:tab" element={<PropertyDetail />} />
            <Route path="/rent/tenant/:id" element={<TenantDetail />} />
            <Route path="/money" element={<Money />} />
            <Route path="/money/:tab" element={<Money />} />
            <Route path="/paperwork" element={<Paperwork />} />
            <Route path="/paperwork/:tab" element={<Paperwork />} />
            <Route path="/tray" element={<Tray />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </main>
      </div>

      <nav className="bottombar" aria-label="Main">
        <NavLink to="/today"><Icon name="today" />Today{count > 0 && <span className="badge">{count}</span>}</NavLink>
        <NavLink to="/rent"><Icon name="rent" />Rent</NavLink>
        <a href="#" className="capture" onClick={(e) => { e.preventDefault(); setCapture(true); }} aria-label="Snap a receipt"><span className="disc"><Icon name="camera" size={24} /></span>Capture</a>
        <NavLink to="/money"><Icon name="money" />Money</NavLink>
        <NavLink to="/paperwork"><Icon name="paper" />Paperwork</NavLink>
      </nav>

      {capture && <ExpenseForm onClose={() => setCapture(false)} />}
      {pay && <PaymentForm onClose={() => setPay(false)} />}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}>{t.text}</div>)}</div>
    </div>
  );
}
