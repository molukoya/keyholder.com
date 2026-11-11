import type { AppState, Lease, Message, Tone } from '../data/types';
import { fmtDate, fmtPeriod } from './dates';
import { leaseBalance } from './finance';
import { fmt } from './money';

// Reminder and receipt wording (AR-2). Merge fields: {first}, {amount}, {due}, {unit}, {balance}, {instructions}, {owner}.

export const TONES: { id: Tone; label: string; blurb: string }[] = [
  { id: 'gentle', label: 'Gentle', blurb: 'Friendly nudge. Assumes it slipped their mind.' },
  { id: 'standard', label: 'Standard', blurb: 'Clear and polite. States the amount and date.' },
  { id: 'firm', label: 'Firm', blurb: 'Direct. Says what happens next if it stays unpaid.' },
];

const REMINDER: Record<Tone, { subject: string; body: string }> = {
  gentle: {
    subject: 'Quick reminder: rent for {period}',
    body: `Hi {first},

Just a friendly reminder that rent of {amount} for unit {unit} was due on {due}. If it's already on its way, thank you — please ignore this note.

{instructions}

Thanks,
{owner}`,
  },
  standard: {
    subject: 'Rent for {period} is past due',
    body: `Hi {first},

Our records show rent of {amount} for unit {unit} was due on {due} and hasn't arrived yet. The balance owing is {balance}.

Please send payment as soon as you can. {instructions}

If something has come up, reply to this email and we can talk about it.

{owner}`,
  },
  firm: {
    subject: 'Rent overdue — action needed',
    body: `Hi {first},

Rent of {amount} for unit {unit} was due on {due}. The balance owing is now {balance}.

Please pay the full balance by the end of this week. If it remains unpaid, I will need to take the next formal step under the Residential Tenancies Act.

{instructions}

{owner}`,
  },
};

export function mergeFields(state: AppState, lease: Lease, period: string, today: string): Record<string, string> {
  const tenant = state.tenants.find((t) => t.id === lease.tenantId);
  const unit = state.units.find((u) => u.id === lease.unitId);
  const first = tenant ? tenant.names.map((n) => n.split(' ')[0]).join(' and ') : 'there';
  return {
    first,
    amount: fmt(lease.rent),
    due: fmtDate(`${period}-${String(lease.dueDay).padStart(2, '0')}`),
    unit: unit?.label ?? '',
    balance: fmt(leaseBalance(lease, state.payments, today)),
    period: fmtPeriod(period),
    instructions: lease.paymentMethod === 'etransfer' ? `You can send an Interac e-Transfer to ${state.profile.email || 'my usual email'}.` : '',
    owner: state.profile.name || 'Your landlord',
  };
}

export function fill(template: string, fields: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => fields[k] ?? `{${k}}`);
}

export function reminderDraft(state: AppState, lease: Lease, period: string, tone: Tone, today: string) {
  const f = mergeFields(state, lease, period, today);
  return { subject: fill(REMINDER[tone].subject, f), body: fill(REMINDER[tone].body, f) };
}

export function messageBody(state: AppState, msg: Message, today: string): { subject: string; body: string } {
  if (msg.edited || msg.body) return { subject: msg.subject, body: msg.body };
  const lease = state.leases.find((l) => l.id === msg.leaseId);
  if (!lease) return { subject: msg.subject, body: msg.body };
  if (msg.kind === 'reminder' && msg.period) return reminderDraft(state, lease, msg.period, msg.tone ?? 'gentle', today);
  const f = mergeFields(state, lease, msg.period ?? '', today);
  return {
    subject: `Rent receipt — ${f.period}`,
    body: `Hi ${f.first},\n\nThank you — your rent payment has been received. Your receipt is attached.\n\n${f.owner}`,
  };
}
