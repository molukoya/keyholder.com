import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { detectServer } from './data/api';
import './styles/tokens.css';
import './styles/app.css';
import './styles/styles.css';
import './styles/landing.css';
import './styles/support.css';


// Find out first whether a Keyholder server is behind this page (accounts on the server) or not
// (everything in this browser). It takes one quick request, or nothing in the Claude preview.
void detectServer().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
