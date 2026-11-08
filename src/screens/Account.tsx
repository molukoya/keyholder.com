import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';

// Sign up / sign in. Stage 1 is a preview: "Continue with Google" opens a stand-in account picker
// and the email link is simulated. Real Google sign-in arrives with the backend (Stage 2).

export type Who = { provider: 'google' | 'email'; email: string; name: string };

const nameFromEmail = (e: string) => e.split('@')[0].split(/[._-]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** The standard multicolour "G", used on the Continue with Google button. */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ label = 'Continue with Google', onClick }: { label?: string; onClick: () => void }) {
  return <button type="button" className="btn acct-google" onClick={onClick}><GoogleG />{label}</button>;
}

/** Stand-in for Google's account chooser (preview only). Asks for no password. */
export function GooglePicker({ onPick, onClose }: { onPick: (w: Who) => void; onClose: () => void }) {
  const { state } = useStore();
  const [other, setOther] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const known = state.profile.account?.provider === 'google' ? [{ name: state.profile.account.name, email: state.profile.account.email }] : [];
  const choices = known.length ? known : [{ name: 'Alex Morgan', email: 'alex.morgan@gmail.com' }];
  return (
    <div className="acct-modal" role="dialog" aria-modal="true" aria-labelledby="gp-title">
      <div className="scrim" onClick={onClose} />
      <div className="acct-modal-card">
        <div className="acct-modal-head"><GoogleG /><span>Sign in with Google</span><button className="btn ghost small" onClick={onClose} aria-label="Cancel"><Icon name="close" size={18} /></button></div>
        <h2 id="gp-title">Choose an account</h2>
        <p className="small soft">to continue to Keyholder</p>
        {!other ? (
          <ul className="acct-list">
            {choices.map((c) => (
              <li key={c.email}><button onClick={() => onPick({ provider: 'google', email: c.email, name: c.name })}>
                <span className="acct-av" aria-hidden>{c.name[0]}</span><span><strong>{c.name}</strong><span>{c.email}</span></span>
              </button></li>
            ))}
            <li><button onClick={() => setOther(true)}><span className="acct-av other" aria-hidden><Icon name="user" size={18} /></span><span><strong>Use another account</strong></span></button></li>
          </ul>
        ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (validEmail(email)) onPick({ provider: 'google', email: email.trim(), name: name.trim() || nameFromEmail(email) }); }}>
            <div className="field"><label htmlFor="gp-name">Your name</label><input id="gp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus /></div>
            <div className="field"><label htmlFor="gp-email">Gmail address</label><input id="gp-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
            <div className="btn-row"><button type="button" className="btn ghost" onClick={() => setOther(false)}>Back</button><button className="btn primary" disabled={!validEmail(email)}>Continue</button></div>
          </form>
        )}
        <p className="tiny faint acct-note">Preview: this stands in for Google sign-in. Nothing is sent to Google yet, and Keyholder never asks for your Google password.</p>
      </div>
    </div>
  );
}

/** "Continue with email": type an email, then open the sign-in link (simulated). */
export function EmailLink({ cta = 'Continue with email', onDone }: { cta?: string; onDone: (w: Who) => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  if (sent) return (
    <div className="acct-sent" role="status">
      <Icon name="mail" size={22} />
      <div><strong>Check your email</strong><p className="small soft">We sent a sign-in link to {email}. Tap it to finish. No password needed.</p>
        <div className="btn-row"><button className="btn primary" onClick={() => onDone({ provider: 'email', email: email.trim(), name: nameFromEmail(email) })}>Open the link (preview)</button><button className="btn ghost" onClick={() => setSent(false)}>Use a different email</button></div>
      </div>
    </div>
  );
  return (
    <form className="acct-email" onSubmit={(e) => { e.preventDefault(); if (validEmail(email)) setSent(true); }}>
      <label htmlFor="ob-email" className="sr-only">Email</label>
      <input id="ob-email" type="email" className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <button className="btn" disabled={!validEmail(email)}>{cta}</button>
    </form>
  );
}

/** The Sign in page (#/signin). */
export function SignIn() {
  const { state, act } = useStore();
  const nav = useNavigate();
  const [picker, setPicker] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const acct = state.profile.account;
  const done = (w: Who) => {
    setPicker(false);
    if (acct && acct.email.toLowerCase() === w.email.toLowerCase()) { act.signIn(); nav('/today'); }
    else setUnknown(w.email);
  };
  return (
    <div className="acct-page">
      <div className="acct-top"><Link to="/welcome" aria-label="Keyholder home"><Brand size={28} /></Link><Link className="btn ghost" to="/welcome"><Icon name="back" size={16} />Back to website</Link></div>
      <div className="acct-card">
        <h1>Welcome back</h1>
        <p className="soft">Sign in to see your rent, bills and paperwork.</p>
        {unknown ? (
          <div className="callout warn" role="alert">
            <p style={{ margin: 0 }}><strong>No Keyholder account for {unknown} yet.</strong> It takes 2 minutes to set one up.</p>
            <div className="btn-row" style={{ marginTop: 12 }}><Link className="btn primary" to="/start">Answer 6 quick questions</Link><button className="btn ghost" onClick={() => setUnknown(null)}>Try another account</button></div>
          </div>
        ) : (
          <>
            <GoogleButton onClick={() => setPicker(true)} />
            <div className="acct-or"><span>or</span></div>
            <EmailLink cta="Email me a sign-in link" onDone={done} />
          </>
        )}
        <p className="small soft acct-switch">New to Keyholder? <Link to="/start">Create a free account</Link></p>
      </div>
      {picker && <GooglePicker onPick={done} onClose={() => setPicker(false)} />}
    </div>
  );
}
