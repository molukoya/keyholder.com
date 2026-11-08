import type { AppState, BankTxn, Lease, Message, Tone } from '../data/types';
import { daysBetween } from './dates';
import { activeLease, leaseLedger, type LedgerLine } from './finance';
import { suggestMatch, type Suggestion } from './matching';

// The approval tray (PRD §12): everything that needs a decision. Its count is the only badge in the app.

export type TrayItem =
  | { kind: 'message'; id: string; message: Message }
  | { kind: 'reminder'; id: string; lease: Lease; line: LedgerLine; tone: Tone; stage: string }
  | { kind: 'match'; id: string; txn: BankTxn; suggestion: Suggestion | null };

export function reminderStage(daysLate: number, grace: number, base: Tone): { tone: Tone; stage: string } | null {
  if (daysLate < 1) return null;
  if (daysLate >= grace) return { tone: 'firm', stage: 'End of grace period' };
  if (daysLate >= 3) return { tone: base === 'gentle' ? 'standard' : base, stage: 'Day 3' };
  return { tone: base, stage: 'Day after due' };
}

export function trayItems(state: AppState, today: string): TrayItem[] {
  const items: TrayItem[] = [];
  for (const m of state.messages) if (m.status === 'draft') items.push({ kind: 'message', id: m.id, message: m });

  // Don't nag a tenant whose deposit is already sitting in the tray waiting to be matched.
  const pendingDeposits = state.txns.filter((t) => t.status === 'new' && t.amount > 0).map((t) => suggestMatch(state, t, today)?.leaseId);
  for (const unit of state.units) {
    const lease = activeLease(state, unit.id, today);
    if (!lease) continue;
    const tenant = state.tenants.find((t) => t.id === lease.tenantId);
    if (!tenant || tenant.remindersPaused || pendingDeposits.includes(lease.id)) continue;
    for (const line of leaseLedger(lease, state.payments, today)) {
      if (line.state !== 'late' && !(line.state === 'partial' && line.daysLate > 0)) continue;
      if (line.daysLate > 45) continue; // beyond reminders — that is notice territory
      const st = reminderStage(line.daysLate, state.profile.graceDays, state.profile.reminderTone);
      if (!st) continue;
      const already = state.messages.some(
        (m) => m.kind === 'reminder' && m.leaseId === lease.id && m.period === line.period &&
          (m.tone === st.tone || (m.sentAt && daysBetween(m.sentAt.slice(0, 10), today) < 2)),
      );
      if (already) continue;
      items.push({ kind: 'reminder', id: `rem-${lease.id}-${line.period}-${st.tone}`, lease, line, ...st });
    }
  }

  for (const t of state.txns) {
    if (t.status !== 'new') continue;
    if (t.amount > 0) items.push({ kind: 'match', id: t.id, txn: t, suggestion: suggestMatch(state, t, today) });
  }
  return items;
}
