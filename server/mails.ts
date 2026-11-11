import type { AppState, Message } from '../src/data/types';
import { fmt } from '../src/lib/money';
import { fmtPeriod } from '../src/lib/dates';
import type { Mail } from './email';

// The words in every email Keyholder sends. Plain text: it reads well everywhere, including old phones.

const sign = '\n\n— Keyholder\nRental automation for Canadian landlords';

export const welcomeMail = (to: string, name: string, verifyUrl: string): Mail => ({
  kind: 'welcome', to, toName: name, subject: 'Welcome to Keyholder',
  text: `Hi ${first(name)},\n\nYour Keyholder account is ready. Please confirm this is your email address:\n\n${verifyUrl}\n\nThe link works for 7 days. If you did not sign up, you can ignore this email.${sign}`,
});

export const resetMail = (to: string, name: string, url: string): Mail => ({
  kind: 'reset', to, toName: name, subject: 'Reset your Keyholder password',
  text: `Hi ${first(name)},\n\nSomeone (hopefully you) asked to reset your Keyholder password. Choose a new one here:\n\n${url}\n\nThe link works for 1 hour and only once. If you did not ask, ignore this email: your password stays the same.${sign}`,
});

export const inviteMail = (to: string, name: string, by: string, url: string): Mail => ({
  kind: 'invite', to, toName: name, subject: 'You have been added to the Keyholder support team',
  text: `Hi ${first(name)},\n\n${by} added you to the Keyholder support team. Choose your password here to sign in:\n\n${url}\n\nThe link works for 7 days.${sign}`,
});

export const ticketAckMail = (to: string, name: string, subject: string): Mail => ({
  kind: 'ticket-ack', to, toName: name, subject: `We got your message: ${subject}`,
  text: `Hi ${first(name)},\n\nThanks for writing. A person on our team will reply by email, usually within one business day.\n\nYour message: "${subject}"${sign}`,
});

export const ticketReplyMail = (to: string, name: string, subject: string, text: string, agent: string): Mail => ({
  kind: 'ticket-reply', to, toName: name, subject: `Re: ${subject}`,
  text: `Hi ${first(name)},\n\n${text}\n\n${agent}, Keyholder support${sign}`,
});

export const newTicketAdminMail = (to: string, from: string, subject: string, text: string, url: string): Mail => ({
  kind: 'ticket-new', to, subject: `New support request: ${subject}`,
  text: `${from} wrote:\n\n${text}\n\nReply in the support inbox: ${url}${sign}`,
});

export const digestMail = (to: string, name: string, lines: string[], url: string): Mail => ({
  kind: 'digest', to, toName: name, subject: lines.length === 1 ? `1 thing needs you today` : `${lines.length} things need you today`,
  text: `Hi ${first(name)},\n\nHere is what needs you in Keyholder today:\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\nOpen Keyholder: ${url}\n\nYou get this email because "Email me updates" is on. Turn it off in Settings.${sign}`,
});

const first = (name: string) => name.trim().split(/\s+/)[0] || 'there';

/** The tenant's email for a receipt or reminder the landlord sent from the app (one per person on the lease). */
export function tenantMails(state: AppState, m: Message, accountId: string): Mail[] {
  const tenant = state.tenants.find((t) => t.id === m.tenantId);
  if (!tenant) return [];
  const people = tenant.people?.length ? tenant.people : [{ name: tenant.names[0] ?? '', email: tenant.email }];
  const owner = state.profile.name || state.profile.account?.name || 'Your landlord';
  const replyTo = state.profile.account?.email || state.profile.email || undefined;
  let subject = m.subject || 'A message from your landlord';
  let text = m.body;
  if (m.kind === 'receipt') {
    const r = state.receipts.find((x) => x.id === m.receiptId);
    const pay = state.payments.find((p) => p.id === r?.paymentId);
    const lease = state.leases.find((l) => l.id === m.leaseId);
    const unit = state.units.find((u) => u.id === lease?.unitId);
    const prop = state.properties.find((p) => p.id === unit?.propertyId);
    if (!r || !pay) return [];
    subject = `Rent receipt #${r.number}${pay.period ? ` for ${fmtPeriod(pay.period)}` : ''}`;
    text = [
      `Hi ${tenant.names.map((n) => n.split(' ')[0]).join(' & ')},`, '',
      `Thank you. This is your receipt for rent.`, '',
      `Receipt number: ${r.number}`,
      `Received from: ${tenant.names.join(' & ')}`,
      `Amount: ${fmt(pay.amount)}`,
      `For rent of: ${pay.period ? fmtPeriod(pay.period) : '—'}`,
      `Paid on: ${pay.date}${pay.method ? ` (${pay.method === 'etransfer' ? 'e-Transfer' : pay.method})` : ''}`,
      prop ? `Rental: ${prop.address}${unit ? `, ${lease?.room ?? (/^[A-Z0-9]{1,3}$/i.test(unit.label) ? `Unit ${unit.label}` : unit.label)}` : ''}` : '',
      r.note ? `Note: ${r.note}` : '', '',
      `Keep this email for your records.`, '', owner,
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  }
  if (!text.trim()) return [];
  return people.filter((p) => p.email).map((p) => ({
    kind: m.kind, to: p.email!, toName: p.name, replyTo, accountId, subject,
    text: `${text}\n\n—\nSent for ${owner} by Keyholder. Reply to this email to reach your landlord.`,
    dedupeKey: `msg:${accountId}:${m.id}:${p.email!.toLowerCase()}`,
  }));
}
