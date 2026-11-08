import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/styles.css';
import './styles/landing.css';

// Design style for the preview (A, B or C), remembered in this browser.
document.documentElement.dataset.style = document.documentElement.dataset.style || 'a';
try { const st = localStorage.getItem('keyholder:style'); if (st === 'a' || st === 'b' || st === 'c') document.documentElement.dataset.style = st; } catch { /* storage blocked */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
