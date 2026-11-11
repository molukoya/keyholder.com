import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PREVIEW_LOGINS, useStore } from '../data/store';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Brand';
import { SceneWelcome } from '../components/Art';
import { api, ApiError, getConn, isStaff, serverMode, setUser, useConn, type ServerUser } from '../data/api';
import * as sync from '../data/sync';

// Sign up / sign in. With the Keyholder server (Stage 2), accounts are real: email and password (or Google,
// when it is set up on the server), and the data is saved to the account. Without a server (the Claude
// preview) it works as in Stage 1: "Continue with Google" opens a stand-in picker and the email link is simulated.

export type Who = { provider: 'google' | 'email'; email: string; name: string };

const nameFromEmail = (e: string) => e.split('@')[0].split(/[._-]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Google sign-in: the stand-in picker without a server; with a server, only when Google is set up there. */
export const googleOn = () => !serverMode() || !!getConn().config?.google;
/** Real Google sign-in: leaves for Google and comes back to #/auth/google. */
export function startGoogle(intent: 'signin' | 'signup') { window.location.assign(`/api/auth/google/start?intent=${intent}`); }
/** Signup answers wait here while the visitor is at Google. */
export const PENDING_SIGNUP = 'kh:pending-signup';

/** After a real sign-in: the team goes to the support dashboard; a landlord gets their data from the server. */
export async function afterSignIn(user: ServerUser, act: ReturnType<typeof useStore>['act'], nav: (to: string) => void) {
  setUser(user);
  if (isStaff(user)) { act.signInPreview('admin'); nav('/support'); return; }
  const r = await sync.hydrate();
  nav(r === 'empty' ? '/start' : '/today');
}

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
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(
    <div className="acct-modal" role="dialog" aria-modal="true" aria-labelledby="gp-title">
      <div className="scrim" onClick={onClose} />
      <div className="acct-modal-card">
        <div className="acct-modal-head"><span className="acct-preview-tag">Preview</span><span>Stand-in for Google sign-in</span><button className="btn ghost small" onClick={onClose} aria-label="Cancel"><Icon name="close" size={18} /></button></div>
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
    </div>,
    document.body,
  );
}

/** "Continue with email". With the server: name, email and a password create the account. Without: a simulated email link. */
export function EmailLink(props: { cta?: string; askName?: boolean; defaultName?: string; onDone: (w: Who) => void }) {
  return serverMode() ? <ServerSignup defaultName={props.defaultName ?? ''} onDone={props.onDone} /> : <LocalEmailLink {...props} />;
}

function ServerSignup({ defaultName, onDone }: { defaultName: string; onDone: (w: Who) => void }) {
  const { user } = useConn();
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; signIn?: boolean } | null>(null);
  if (user && user.role === 'owner') return (
    <div className="acct-sent" role="status">
      <Icon name="check" size={22} />
      <div><strong>Signed in as {user.email}</strong><p className="small soft">Save your plan to your account.</p>
        <div className="btn-row"><button className="btn primary" onClick={() => onDone({ provider: user.google && !user.hasPassword ? 'google' : 'email', email: user.email, name: user.name || name })}>Save my plan</button></div>
      </div>
    </div>
  );
  const ready = validEmail(email) && !!name.trim() && pass.length >= 8;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ user: ServerUser }>('POST', '/api/auth/signup', { name: name.trim(), email: email.trim(), password: pass });
      setUser(r.user);
      onDone({ provider: 'email', email: r.user.email, name: r.user.name });
    } catch (x) {
      setErr({ text: (x as Error).message, signIn: x instanceof ApiError && x.status === 409 });
    } finally { setBusy(false); }
  };
  return (
    <form className="acct-email" onSubmit={submit}>
      <label htmlFor="ob-name" className="sr-only">Your name</label>
      <input id="ob-name" className="input acct-name" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <label htmlFor="ob-email" className="sr-only">Email</label>
      <input id="ob-email" type="email" className="input" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} autoComplete="email" />
      <label htmlFor="ob-pass" className="sr-only">Create a password</label>
      <span className="acct-pass">
        <input id="ob-pass" type={show ? 'text' : 'password'} className="input" placeholder="Create a password (8+ characters)" value={pass} onChange={(e) => { setPass(e.target.value); setErr(null); }} autoComplete="new-password" />
        <button type="button" className="btn ghost small" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
      </span>
      {err && <p className="small acct-error" role="alert">{err.text} {err.signIn && <Link to="/signin">Sign in</Link>}</p>}
      <button className="btn" disabled={!ready || busy}>{busy ? 'Creating your account…' : 'Create my account'}</button>
    </form>
  );
}

function LocalEmailLink({ cta = 'Continue with email', askName = false, defaultName = '', onDone }: { cta?: string; askName?: boolean; defaultName?: string; onDone: (w: Who) => void }) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const ready = validEmail(email) && (!askName || !!name.trim());
  if (sent) return (
    <div className="acct-sent" role="status">
      <Icon name="mail" size={22} />
      <div><strong>Check your email</strong><p className="small soft">We sent a sign-in link to {email}. Tap it to finish. No password needed.</p>
        <div className="btn-row"><button className="btn primary" onClick={() => onDone({ provider: 'email', email: email.trim(), name: name.trim() || nameFromEmail(email) })}>Open the link (preview)</button><button className="btn ghost" onClick={() => setSent(false)}>Use a different email</button></div>
      </div>
    </div>
  );
  return (
    <form className="acct-email" onSubmit={(e) => { e.preventDefault(); if (ready) setSent(true); }}>
      {askName && <>
        <label htmlFor="ob-name" className="sr-only">Your name</label>
        <input id="ob-name" className="input acct-name" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </>}
      <label htmlFor="ob-email" className="sr-only">Email</label>
      <input id="ob-email" type="email" className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <button className="btn" disabled={!ready}>{cta}</button>
    </form>
  );
}

/** The Sign in page (#/signin). */
export function SignIn() {
  const { state, act } = useStore();
  const nav = useNavigate();
  const [picker, setPicker] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const params = new URLSearchParams(useLocation().search);
  const googleFailed = params.get('error') === 'google';
  const expired = params.get('expired') === '1';
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const acct = state.profile.account;
  const done = (w: Who) => {
    setPicker(false);
    if (acct && acct.email.toLowerCase() === w.email.toLowerCase()) { act.signIn(); nav('/today'); }
    else setUnknown(w.email);
  };
  return (
    <div className="acct-page">
      <div className="acct-top"><Link to="/welcome" aria-label="Keyholder home"><Brand size={28} /></Link><Link className="btn ghost" to="/welcome"><Icon name="back" size={16} />Back<span className="hide-xs"> to website</span></Link></div>
      <div className="acct-card">
        <div className="acct-art" aria-hidden><SceneWelcome /></div>
        <h1>Welcome back</h1>
        <p className="soft">Sign in to see your rent, bills and paperwork.</p>
        {unknown ? (
          <div className="callout warn" role="alert">
            <p style={{ margin: 0 }}><strong>No Keyholder account for {unknown} yet.</strong> It takes 2 minutes to set one up.</p>
            <div className="btn-row" style={{ marginTop: 12 }}><Link className="btn primary" to="/start">Answer 6 quick questions</Link><button className="btn ghost" onClick={() => setUnknown(null)}>Try another account</button></div>
          </div>
        ) : (
          <>
            {googleFailed && <p className="small acct-error" role="alert">Google sign-in did not work. Try again, or use your email.</p>}
            {expired && <p className="callout" role="status">You were signed out. Sign in again: your changes are kept on this device.</p>}
            {googleOn() && <>
              <GoogleButton onClick={() => (serverMode() ? startGoogle('signin') : setPicker(true))} />
              <div className="acct-or"><span>or</span></div>
            </>}
            <CentralLogin onAccount={(email) => done({ provider: 'email', email, name: '' })} />
          </>
        )}
        <p className="small soft acct-switch">New to Keyholder? <Link to="/start">Create a free account</Link></p>
      </div>
      {picker && <GooglePicker onPick={done} onClose={() => setPicker(false)} />}
    </div>
  );
}

/**
 * One sign-in form for everyone. test / test opens the demo (sample properties), admin / admin opens the
 * sample support dashboard. Those two are a lock, not security (they sit in the website's code) and only
 * ever show sample data. Everything else is a real sign-in: with the server, email and password are checked
 * there (and the Keyholder team lands on the live support dashboard; "admin" with the team's own password
 * works too); without one (the Claude preview), it opens the account saved in this browser.
 */
function CentralLogin({ onAccount }: { onAccount: (email: string) => void }) {
  const { act } = useStore();
  const nav = useNavigate();
  const [user, setUserName] = useState('');
  const [pass, setPass] = useState('');
  const [wrong, setWrong] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const server = serverMode();
  const preview = !server || !!getConn().config?.previewLogins;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const u = user.trim().toLowerCase();
    if (preview) for (const kind of ['demo', 'admin'] as const) {
      if (u !== PREVIEW_LOGINS[kind].username) continue;
      if (pass === PREVIEW_LOGINS[kind].password) { act.signInPreview(kind); nav(kind === 'admin' ? '/support' : '/today'); return; }
      // With the server, "admin" and the team's own password is the real team login (live dashboard).
      if (server && kind === 'admin') break;
      setWrong(true); return;
    }
    if (!validEmail(u) && !(server && u === 'admin')) { setWrong(true); return; }
    if (!server) { onAccount(user.trim()); return; }
    setBusy(true); setErr('');
    try {
      const r = await api<{ user: ServerUser }>('POST', '/api/auth/login', { email: user.trim(), password: pass });
      await afterSignIn(r.user, act, nav);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const edit = (f: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { f(e.target.value); setWrong(false); setErr(''); };
  if (forgot) return <ForgotPassword email={user.includes('@') ? user.trim() : ''} onBack={() => setForgot(false)} />;
  return (
    <form className="acct-login" onSubmit={submit}>
      <div className="field"><label htmlFor="login-user">Email{preview ? ' or username' : ''}</label><input id="login-user" className="input" value={user} onChange={edit(setUserName)} autoComplete="username" autoCapitalize="none" placeholder="you@example.com" /></div>
      <div className="field"><label htmlFor="login-pass">Password</label><input id="login-pass" type="password" className="input" value={pass} onChange={edit(setPass)} autoComplete="current-password" /></div>
      {wrong && <p className="small acct-error" role="alert">That email, username or password is not right.</p>}
      {err && <p className="small acct-error" role="alert">{err}</p>}
      <button className="btn primary acct-login-btn" disabled={!user.trim() || !pass || busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {server && <button type="button" className="btn ghost small acct-forgot" onClick={() => setForgot(true)}>Forgot your password?</button>}
    </form>
  );
}

/** "Forgot your password?": the server emails a link that works for one hour. */
function ForgotPassword({ email: start, onBack }: { email: string; onBack: () => void }) {
  const [email, setEmail] = useState(start);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (sent) return (
    <div className="acct-sent" role="status"><Icon name="mail" size={22} />
      <div><strong>Check your email</strong><p className="small soft">If there is a Keyholder account for {email}, we sent a link to choose a new password. It works for 1 hour.</p>
        <div className="btn-row"><button className="btn ghost" onClick={onBack}>Back to sign in</button></div></div>
    </div>
  );
  return (
    <form className="acct-login" onSubmit={async (e) => {
      e.preventDefault(); if (!validEmail(email) || busy) return;
      setBusy(true); setErr('');
      try { await api('POST', '/api/auth/forgot', { email: email.trim() }); setSent(true); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
    }}>
      <p className="small soft" style={{ margin: 0 }}>Type your email. We will send you a link to choose a new password.</p>
      <div className="field"><label htmlFor="forgot-email">Email</label><input id="forgot-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus /></div>
      {err && <p className="small acct-error" role="alert">{err}</p>}
      <div className="btn-row"><button className="btn primary" disabled={!validEmail(email) || busy}>Send the link</button><button type="button" className="btn ghost" onClick={onBack}>Back</button></div>
    </form>
  );
}
