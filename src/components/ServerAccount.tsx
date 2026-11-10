import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download, setUser, useConn } from '../data/api';
import { useSyncStatus, wipe } from '../data/sync';
import { useStore } from '../data/store';
import { Icon } from './Icon';

// Settings → Your account, when the app runs with the Keyholder server: who is signed in, whether the
// data is saved, the password, a copy of all data, and deleting the account.

const ago = (t?: number) => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : 'earlier today'; };

export function SaveStatus() {
  const st = useSyncStatus();
  const text = st.state === 'saving' ? 'Saving to your account…' : st.state === 'saved' ? `Saved to your account · ${ago(st.at)}` : st.state === 'offline' || st.state === 'error' || st.state === 'signed-out' ? st.message : 'Saved to your account';
  return <p className={`small save-status ${st.state}`} role="status"><Icon name={st.state === 'offline' || st.state === 'error' ? 'alert' : 'check'} size={14} />{text}</p>;
}

export function ServerAccount() {
  const { state, act } = useStore();
  const { user, config } = useConn();
  const nav = useNavigate();
  const [sentVerify, setSentVerify] = useState(false);
  const [pw, setPw] = useState(false);
  if (!user) return null;
  const p = state.profile;
  return (
    <>
      <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div><strong>{user.name || p.name}</strong><div className="small soft">{user.email} · {user.google && !user.hasPassword ? 'signs in with Google' : 'email and password'}</div></div>
        <button className="btn" onClick={() => { act.signOut(); nav('/welcome'); }}>Sign out</button>
      </div>
      <SaveStatus />
      {!user.emailVerified && config?.emailDelivery && (
        <div className="callout" style={{ marginTop: 12 }}>
          <strong>Please confirm your email.</strong> We sent a link to {user.email}.{' '}
          {sentVerify ? <span className="soft">Sent again.</span> : <button className="btn small ghost" onClick={() => api('POST', '/api/auth/resend-verify').then(() => setSentVerify(true)).catch(() => setSentVerify(true))}>Send it again</button>}
        </div>
      )}
      {user.hasPassword && (pw ? <ChangePassword onDone={() => setPw(false)} /> : <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setPw(true)}>Change password</button>)}
    </>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await api('POST', '/api/auth/password', { current: cur, next }); setMsg({ ok: true, text: 'Password changed. Other devices were signed out.' }); setCur(''); setNext(''); }
    catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
  };
  return (
    <form className="stack" style={{ marginTop: 12, maxWidth: 420 }} onSubmit={submit}>
      <div className="field"><label htmlFor="pw-cur">Current password</label><input id="pw-cur" type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></div>
      <div className="field"><label htmlFor="pw-new">New password</label><input id="pw-new" type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></div>
      {msg && <p className={`small ${msg.ok ? 'soft' : 'acct-error'}`} role="status">{msg.text}</p>}
      <div className="btn-row"><button className="btn primary" disabled={!cur || next.length < 8}>Save password</button><button type="button" className="btn ghost" onClick={onDone}>Close</button></div>
    </form>
  );
}

/** Settings → Data, with the server: a copy of everything, and deleting the account for good. */
export function ServerData() {
  const { user } = useConn();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  if (!user) return null;
  const remove = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await api('DELETE', '/api/account', user.hasPassword ? { password: confirm } : { email: confirm });
      wipe();
      setUser(null);
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* blocked */ }
      nav('/welcome');
      window.location.reload();
    } catch (x) { setErr((x as Error).message); }
  };
  return (
    <>
      <p className="small soft">Everything is saved to your Keyholder account, and a copy is kept on this device so it opens fast.</p>
      <div className="btn-row">
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await download('/api/account/export', 'keyholder-data.json'); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}><Icon name="download" size={16} />Download my data</button>
        {!del && <button className="btn ghost danger" onClick={() => setDel(true)}><Icon name="trash" size={16} />Delete my account</button>}
      </div>
      {del && (
        <form className="callout warn stack" onSubmit={remove}>
          <p style={{ margin: 0 }}><strong>Delete your account for good?</strong> Every property, tenant, payment, receipt and expense is deleted from Keyholder. Download your data first if you may need it. This can't be undone.</p>
          <div className="field"><label htmlFor="del-confirm">{user.hasPassword ? 'Your password' : 'Type your email to confirm'}</label>
            <input id="del-confirm" type={user.hasPassword ? 'password' : 'email'} className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete={user.hasPassword ? 'current-password' : 'email'} /></div>
          <div className="btn-row"><button className="btn danger" disabled={!confirm}>Delete my account</button><button type="button" className="btn ghost" onClick={() => { setDel(false); setConfirm(''); setErr(''); }}>Cancel</button></div>
        </form>
      )}
      {err && <p className="small acct-error" role="alert">{err}</p>}
    </>
  );
}
