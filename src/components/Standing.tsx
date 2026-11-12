import { useState } from 'react';
import { useStore } from '../data/store';
import { currentLeases, leaseLedger } from '../lib/finance';
import { fmtPeriod, periodOf, periodRange, addMonths } from '../lib/dates';
import type { AppState, ISODate, Lease } from '../data/types';
import { Field, Seg } from './ui';
import { Icon } from './Icon';

// A tenant who was renting before the landlord started Keyholder: Keyholder counts rent from the lease
// start, so without an answer they look like they owe every month since. Ask once, plainly: are they in
// good standing, and when was the last rent they paid?

/** Leases older than Keyholder that show unpaid months from before the landlord started, and were not asked yet. */
export function standingToAsk(state: AppState, today: ISODate): Lease[] {
  if (state.profile.sample) return [];
  const started = periodOf(state.profile.account?.created ?? today);
  return currentLeases(state, today).filter((l) => !l.standingChecked && periodOf(l.start) < started
    && leaseLedger(l, state.payments, today).some((x) => x.period < started && x.paid < x.charge));
}

export function StandingCheck({ leaseId }: { leaseId?: string }) {
  const { state, today } = useStore();
  const leases = standingToAsk(state, today).filter((l) => !leaseId || l.id === leaseId).slice(0, 3);
  if (!leases.length) return null;
  return <div className="standing-list">{leases.map((l) => <StandingCard key={l.id} lease={l} />)}</div>;
}

function StandingCard({ lease }: { lease: Lease }) {
  const { state, act, today } = useStore();
  const t = state.tenants.find((x) => x.id === lease.tenantId);
  const first = t?.names[0]?.split(' ')[0] ?? 'This tenant';
  const thisPeriod = periodOf(today);
  const lastDue = today >= `${thisPeriod}-${String(Math.min(lease.dueDay, 28)).padStart(2, '0')}` ? thisPeriod : periodOf(addMonths(today, -1));
  const months = periodRange(periodOf(lease.start), thisPeriod).reverse();
  const [standing, setStanding] = useState<'yes' | 'no'>('yes');
  const [pick, setPick] = useState('');
  const chosen = pick || (standing === 'yes' ? (months.includes(lastDue) ? lastDue : months[0]) : '');
  const id = `standing-${lease.id}`;
  return (
    <section className="sheet standing-q" aria-labelledby={`${id}-h`} id={id}>
      <div className="standing-head"><span className="tile-ic sky" aria-hidden><Icon name="user" size={18} /></span>
        <div>
          <h2 id={`${id}-h`}>Is {first} in good standing?</h2>
          <p className="small soft">{t?.names.join(' & ')} has rented since {fmtPeriod(periodOf(lease.start))}, before you started Keyholder. Without your answer, every month since then shows as owing.</p>
        </div>
      </div>
      <Seg label={`Is ${first} in good standing?`} value={standing} onChange={(v) => { setStanding(v); setPick(''); }} options={[{ id: 'yes', label: 'Yes, all rent is paid' }, { id: 'no', label: 'No, they owe rent' }]} />
      <Field label="Last month they paid rent in full" htmlFor={`${id}-m`} hint="Rent up to and including this month counts as paid. Keyholder tracks rent from the month after.">
        <select id={`${id}-m`} className="input" value={chosen} onChange={(e) => setPick(e.target.value)}>
          {standing === 'no' && <option value="" disabled>Choose a month</option>}
          {months.map((m) => <option key={m} value={m}>{fmtPeriod(m)}</option>)}
          {standing === 'no' && <option value="none">None: they owe every month</option>}
        </select>
      </Field>
      <div className="btn-row">
        <button className="btn primary" disabled={!chosen} onClick={() => act.setStanding(lease.id, chosen === 'none' ? null : chosen)}>Save</button>
      </div>
    </section>
  );
}
