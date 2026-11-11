import type { AppState, Property } from '../data/types';
import { propertyValue } from './finance';
import { activeLeases, byRoom, roomLabels } from './finance';
import { tenantPeople } from './people';
import { hasSilver } from './levels';

// Keyholder score: how complete the owner's records are, 0–100. Each item is worth points;
// some give partial credit (e.g. receipt photos). Property items count toward that property's %.

export interface ScoreItem {
  id: string;
  text: string;
  points: number;
  earned: number;
  propertyId?: string;
  /** Where to go to complete it. */
  to: string;
  /** Opens the level-up form for this property instead of navigating. */
  levelUp?: 'silver' | 'gold';
}

/** Properties, most valuable first. Suggestions follow this order. */
export function byValue(state: AppState, today: string): Property[] {
  return state.properties.filter((p) => !p.archived)
    .map((p) => ({ p, v: propertyValue(state, p, today).value }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.p);
}

export function scoreItems(state: AppState, today: string): ScoreItem[] {
  const items: ScoreItem[] = [];
  const pr = state.profile;
  const add = (i: Omit<ScoreItem, 'earned'> & { done: boolean | number }) => {
    const earned = typeof i.done === 'number' ? Math.round(i.points * Math.max(0, Math.min(1, i.done))) : i.done ? i.points : 0;
    const { done: _ignored, ...rest } = i; void _ignored;
    items.push({ ...rest, earned });
  };

  add({ id: 'name', text: 'Add your name and email for receipts', points: 4, done: !!pr.name && !!pr.email, to: '/settings' });
  add({ id: 'bank', text: 'Connect your bank to spot rent automatically', points: 8, done: (state.banks ?? []).length > 0, to: '/settings#rent-tracking' });

  for (const p of byValue(state, today)) {
    const units = state.units.filter((u) => u.propertyId === p.id);
    const leases = units.flatMap((u) => activeLeases(state, u.id, today));
    const tenants = leases.map((l) => state.tenants.find((t) => t.id === l.tenantId)).filter((t): t is NonNullable<typeof t> => !!t);
    // Each unit is one place to fill, or one per room when it is rented by the room.
    const places = units.reduce((n, u) => n + (byRoom(u) ? roomLabels(u).length : 1), 0);
    add({ id: `${p.id}-tenants`, text: `Add the tenants at ${p.nickname}`, points: 4, done: places ? Math.min(1, leases.length / places) : 0, propertyId: p.id, to: '/rent' });
    for (const t of tenants) {
      // Everyone on a shared lease gets receipts, so each person needs an email.
      tenantPeople(t).forEach((x, i) => {
        const first = x.name.split(' ')[0];
        add({ id: i ? `${t.id}-email-${i}` : `${t.id}-email`, text: `Add ${first}'s email so receipts can be sent`, points: i ? 1 : 3, done: !!x.email, propertyId: p.id, to: `/rent/tenant/${t.id}` });
        add({ id: i ? `${t.id}-phone-${i}` : `${t.id}-phone`, text: `Add ${first}'s phone number`, points: 1, done: !!x.phone, propertyId: p.id, to: `/rent/tenant/${t.id}` });
      });
    }
    add({ id: `${p.id}-paid`, text: `Add what you paid for ${p.nickname}`, points: 10, done: hasSilver(p), propertyId: p.id, to: `/rent/property/${p.id}`, levelUp: 'silver' });
    add({ id: `${p.id}-costs`, text: `Add closing costs and land transfer tax for ${p.nickname}`, points: 4, done: p.closingCosts !== undefined && p.landTransferTax !== undefined, propertyId: p.id, to: `/rent/property/${p.id}/mortgage`, levelUp: 'gold' });
    add({ id: `${p.id}-mortgage`, text: `Add the mortgage for ${p.nickname}`, points: 6, done: !!p.mortgageFree || state.mortgages.some((m) => m.propertyId === p.id), propertyId: p.id, to: `/rent/property/${p.id}/mortgage`, levelUp: 'gold' });
    const exps = state.expenses.filter((e) => e.propertyId === p.id);
    if (exps.length) {
      const withPhoto = exps.filter((e) => e.receiptImage || e.cashNoReceipt).length;
      add({ id: `${p.id}-photos`, text: `Add photos to ${exps.length - withPhoto} receipt${exps.length - withPhoto === 1 ? '' : 's'} at ${p.nickname}`, points: 4, done: withPhoto / exps.length, propertyId: p.id, to: '/expenses' });
      const typed = exps.filter((e) => e.category !== 'other').length;
      add({ id: `${p.id}-types`, text: `Pick a type for ${exps.length - typed} expense${exps.length - typed === 1 ? '' : 's'} at ${p.nickname}`, points: 2, done: typed / exps.length, propertyId: p.id, to: '/expenses' });
    }
  }
  return items;
}

export const scoreKey = (i: ScoreItem) => `score:${i.id}`;

export function keyholderScore(state: AppState, today: string): { score: number; todo: ScoreItem[] } {
  // Ignored items no longer count against the score; hidden ones still count but are not suggested.
  const prefs = state.todoPrefs ?? {};
  const all = scoreItems(state, today);
  const items = all.filter((i) => !prefs[scoreKey(i)]?.ignored);
  const total = items.reduce((a, i) => a + i.points, 0);
  const earned = items.reduce((a, i) => a + i.earned, 0);
  // Biggest gain first; ties keep the property-value order they were built in.
  const hidden = (i: ScoreItem) => { const h = prefs[scoreKey(i)]?.hiddenUntil; return !!h && h > today; };
  const todo = items.filter((i) => i.earned < i.points && !hidden(i)).map((i, n) => ({ i, n })).sort((a, b) => (b.i.points - b.i.earned) - (a.i.points - a.i.earned) || a.n - b.n).map((x) => x.i);
  return { score: total ? Math.round((earned / total) * 100) : 0, todo };
}

/** How complete one property's records are, 0–100. */
export function propertyCompletion(state: AppState, p: Property, today: string): number {
  const items = scoreItems(state, today).filter((i) => i.propertyId === p.id);
  const total = items.reduce((a, i) => a + i.points, 0);
  return total ? Math.round((items.reduce((a, i) => a + i.earned, 0) / total) * 100) : 0;
}
