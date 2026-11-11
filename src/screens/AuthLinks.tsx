import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { api, getConn, isStaff, serverMode, type ServerUser } from '../data/api';
import { Brand } from '../components/Brand';
import { Icon } from '../components/Icon';
import { SceneWelcome } from '../components/Art';
import { afterSignIn, PENDING_SIGNUP } from './Account';
import type { Profile } from '../data/types';

// Pages opened from emails and from Google (Stage 2, with the server):
//   #/reset?token=…            choose a new password (also a team invitation: &invite=1)
//   #/verify?token=…           confirm an email address
//   #/auth/google?intent=…     back from Google sign-in

export function AuthLinks() {
  const loc = useLocation();
  const q = new URLSearchParams(loc.search);
  const page = loc.pathname.startsWith('/reset') ? <Reset token={q.get('token') ?? ''} invite={q.get('invite') === '1'} />
    : loc.pathname.startsWith('/verify') ? <Verify token={q.get('token') ?? ''} />
    : <GoogleReturn intent={q.get('intent') === 'signup' ? 'signup' : 'signin'} />;
  return (
    <div className="acct-page">
      <div className="acct-top"><Link to="/welcome" aria-label="Keyholder home"><Brand size={28} /></Link><Link className="btn ghost" to="/welcome"><Icon name="back" size={16} />Back<span className="hide-xs"> to website</span></Link></div>
      <div className="acct-card">
        <div className="acct-art" aria-hidden><SceneWelcome /></div>
        {serverMode() ? page : <><h1>This link needs the Keyholder server</h1><p className="soft">Open it on the Keyholder website.</p></>}
      </div>
    </div>
  );
}

function Reset({ token, invite }: { token: string; invite: boolean }) {
  const { act } = useStore();
  const nav = useNavigate();
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pass.length < 8 || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await api<{ user: ServerUser }>('POST', '/api/auth/reset', { token, password: pass });
      await afterSignIn(r.user, act, nav);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <h1>{invite ? 'Welcome to the team' : 'Choose a new password'}</h1>
      <p className="soft">{invite ? 'Choose a password to sign in to the Keyholder support dashboard.' : 'At least 8 characters. A short sentence works well.'}</p>
      <form className="acct-login" onSubmit={submit}>
        <div className="field"><label htmlFor="new-pass">New password</label>
          <span className="acct-pass"><input id="new-pass" type={show ? 'text' : 'password'} className="input" value={pass} onChange={(e) => { setPass(e.target.value); setErr(''); }} autoComplete="new-password" autoFocus />
            <button type="button" className="btn ghost small" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button></span></div>
        {err && <p className="small acct-error" role="alert">{err} {/expired|used/.test(err) && <Link to="/signin">Ask for a new link</Link>}</p>}
        <button className="btn primary acct-login-btn" disabled={pass.length < 8 || busy || !token}>{busy ? 'Saving…' : 'Save and sign in'}</button>
      </form>
    </>
  );
}

function Verify({ token }: { token: string }) {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [err, setErr] = useState('');
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return; once.current = true;
    api('POST', '/api/auth/verify', { token }).then(() => setState('done')).catch((x) => { setErr((x as Error).message); setState('failed'); });
  }, [token]);
  const signedIn = !!getConn().user;
  return state === 'working' ? <h1>Confirming your email…</h1> : state === 'done' ? (
    <>
      <h1>Your email is confirmed</h1>
      <p className="soft">Thank you. Receipts and reminders can now go out from your account.</p>
      <Link className="btn primary" to={signedIn ? '/today' : '/signin'}>{signedIn ? 'Open Keyholder' : 'Sign in'}</Link>
    </>
  ) : (
    <>
      <h1>That link did not work</h1>
      <p className="soft">{err} You can ask for a new one in Settings.</p>
      <Link className="btn" to={signedIn ? '/settings' : '/signin'}>{signedIn ? 'Open Settings' : 'Sign in'}</Link>
    </>
  );
}

function GoogleReturn({ intent }: { intent: 'signin' | 'signup' }) {
  const { act } = useStore();
  const nav = useNavigate();
  const once = useRef(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (once.current) return; once.current = true;
    const user = getConn().user;
    if (!user) { nav('/signin?error=google', { replace: true }); return; }
    let pending: { profile: Partial<Profile>; name: string } | null = null;
    try { const raw = sessionStorage.getItem(PENDING_SIGNUP); pending = raw ? JSON.parse(raw) : null; sessionStorage.removeItem(PENDING_SIGNUP); } catch { /* blocked */ }
    if (pending && intent === 'signup' && !isStaff(user)) {
      // Back from Google at the end of signup: the answers waited in this tab. Save the plan.
      act.signUp(pending.profile, { provider: 'google', email: user.email, name: pending.name || user.name });
      nav('/today', { replace: true });
      return;
    }
    afterSignIn(user, act, (to) => nav(to, { replace: true })).catch((x) => setErr((x as Error).message));
  }, [act, intent, nav]);
  return err ? <><h1>Something went wrong</h1><p className="soft">{err}</p><Link className="btn" to="/signin">Back to sign in</Link></> : <h1>Signing you in…</h1>;
}
