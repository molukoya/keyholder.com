import { BackToMore, PageSub } from '../components/Guide';
import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isPreviewUser, useStore } from '../data/store';

import { RentTracking } from './Money';
import { PACK_VERIFIED, PACK_VERSION, PROVINCES, province } from '../lib/jurisdiction';
import { fmtDate } from '../lib/dates';
import { TONES } from '../lib/templates';
import { Field, Seg, SlideToConfirm } from '../components/ui';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Art';
import { ServerAccount, ServerData } from '../components/ServerAccount';
import { useConn } from '../data/api';

export function Settings() {
  const { state, act } = useStore();
  const p = state.profile;
  const admin = isPreviewUser(state);
  const loc = useLocation();
  const nav = useNavigate();
  const conn = useConn();
  // With the Keyholder server, a landlord's real account (not the demo or admin preview).
  const live = conn.mode === 'server' && !!conn.user && conn.user.role === 'owner' && !admin && !!p.account;
  useEffect(() => { if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView(); }, [loc.hash]);

  return (
    <div className="page">
      <BackToMore /><div className="page-head"><div><div className="eyebrow">Settings</div><h1 className="title-ic"><span className="tile-ic mint" aria-hidden><Icon name="settings" size={22} /></span>Your Keyholder</h1><PageSub>Your profile, rent tracking, reminders, display</PageSub></div></div>

      <section className="section" id="profile">
        <h2 className="section-title">Your profile</h2>
        <div className="sheet">
          <div className="profile-head"><Avatar name={p.name || p.account?.name || 'You'} size={56} /><div><strong>{p.name || p.account?.name || 'Your name'}</strong><div className="small soft">{p.email || p.account?.email || 'Add your email'}</div></div></div>
          <div className="grid2">
            <Field label="Name on receipts" htmlFor="st-n" hint={p.name.trim() && !/\s/.test(p.name.trim()) ? 'Add your last name: receipts and letters show your full name' : 'First and last name'}><input id="st-n" className="input" value={p.name} onChange={(e) => act.setProfile({ name: e.target.value })} /></Field>
            <Field label="Email" htmlFor="st-e" hint="Tenant replies go here"><input id="st-e" type="email" className="input" value={p.email} onChange={(e) => act.setProfile({ email: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="st-ph" hint="Optional: shown on receipts and letters"><input id="st-ph" type="tel" className="input" value={p.phone ?? ''} onChange={(e) => act.setProfile({ phone: e.target.value || undefined })} autoComplete="tel" /></Field>
            <Field label="Province" htmlFor="st-p" hint={`Rules pack ${PACK_VERSION}, last verified ${fmtDate(PACK_VERIFIED)}`}>
              <select id="st-p" className="input" value={p.province} onChange={(e) => act.setProfile({ province: e.target.value as typeof p.province, city: province(e.target.value as typeof p.province).cities[0] })}>{PROVINCES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
            </Field>
            <Field label="City" htmlFor="st-c"><select id="st-c" className="input" value={p.city} onChange={(e) => act.setProfile({ city: e.target.value })}>{province(p.province).cities.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <div id="account" className="profile-account">
            {admin ? (
              <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div><strong>{p.account?.provider === 'admin' ? 'Admin' : 'Demo'} (test login)</strong><div className="small soft">Sample properties only. Nothing here is real.</div></div>
                <button className="btn" onClick={() => { act.signOut(); nav('/welcome'); }}>Sign out</button>
              </div>
            ) : live ? <ServerAccount /> : p.account ? (
              <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div><strong>{p.account.name || p.name}</strong><div className="small soft">{p.account.email} · signed in with {p.account.provider === 'google' ? 'Google' : 'an email link'}</div></div>
                <button className="btn" onClick={() => { act.signOut(); nav('/welcome'); }}>Sign out</button>
              </div>
            ) : (
              <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div><strong>No account yet</strong><div className="small soft">Saved in this browser only.</div></div>
              </div>
            )}
          </div>
          <label className="check" style={{ marginTop: 14 }}><input type="checkbox" checked={!!p.emailUpdates} onChange={(e) => act.setProfile({ emailUpdates: e.target.checked })} />{live ? 'Email me when something needs me (one short email a day at most)' : 'Email me on rent day, plus a monthly summary'} {!live ? <span className="soft small">(preview: no emails are sent yet)</span> : !conn.config?.emailDelivery && <span className="soft small">(email sending is not switched on yet)</span>}</label>
        </div>
      </section>

      <section className="section" id="rent-tracking">
        <h2 className="section-title">Rent tracking</h2>
        <RentTracking />
      </section>

      <section className="section">
        <h2 className="section-title">Receipts and reminders</h2>
        <div className="sheet">
          <Field label="Reminder tone"><Seg label="Tone" value={p.reminderTone} onChange={(reminderTone) => act.setProfile({ reminderTone })} options={TONES.map((t) => ({ id: t.id, label: t.label }))} /></Field>
          <Field label="Grace period (days)" htmlFor="st-g" hint="Rent is legally late the day after it's due. The firm reminder waits until this ends.">
            <input id="st-g" type="number" min={1} max={15} className="input" style={{ maxWidth: 120 }} value={p.graceDays} onChange={(e) => act.setProfile({ graceDays: Math.max(1, Number(e.target.value) || 5) })} />
          </Field>
          <label className="check"><input type="checkbox" checked={p.autoSend} onChange={(e) => act.setAutoSend(e.target.checked)} />
            <span>Send receipts and reminders automatically<span className="tiny soft" style={{ display: 'block' }}>Off: every message waits for you. Legal notices always do.</span></span>
          </label>
        </div>
      </section>


      <section className="section">
        <h2 className="section-title">Appearance</h2>
        <div className="sheet">
          <Field label="Theme"><Seg label="Theme" value={p.theme} onChange={(theme) => act.setProfile({ theme })} options={[{ id: 'system', label: 'Match device' }, { id: 'light', label: 'Paper' }, { id: 'dark', label: 'Night Ledger' }]} /></Field>
          <label className="check"><input type="checkbox" checked={p.paperGrain} onChange={(e) => act.setProfile({ paperGrain: e.target.checked })} />Paper grain texture</label>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Data</h2>
        <div className="sheet stack">
          {live ? <ServerData /> : <p className="small soft">Everything is saved in this browser. Clearing browser data clears Keyholder.</p>}
          <div className="btn-row">
            {admin && <button className="btn" onClick={act.resetDemo}>Restore sample data</button>}
            {admin && <button className="btn" onClick={() => { act.signOut(); nav('/start'); }}>Replay the signup questions</button>}
            <button className="btn" onClick={() => { act.setProfile({ tourDone: false }); nav('/today'); }}>Show the tour again</button>
            <Link className="btn ghost" to="/welcome">What is Keyholder?</Link>
          </div>
          <div className="callout warn">This deletes every property, tenant, payment and expense. It can't be undone.</div>
          <SlideToConfirm label="Slide to clear all data" onConfirm={act.clearAll} />
        </div>
      </section>
    </div>
  );
}
