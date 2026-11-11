import type { Applicant, ApplicantPerson, Person, Tenant } from '../data/types';

// Several people can share one lease (a couple, or roommates) or one application. Each person has their
// own contact details; `names`, `email` and `phone` on the record stay in step (first person's contact).

/** Everyone on a lease, with their contact details. Older records only kept the first person's. */
export function tenantPeople(t: Tenant): Person[] {
  if (t.people?.length) return t.people;
  return t.names.map((name, i) => ({ name, email: i === 0 ? t.email : '', phone: i === 0 ? t.phone : '' }));
}

/** Set the people on a lease, keeping names, email and phone in step. Blank rows are dropped. */
export function withPeople(t: Tenant, people: Person[]): Tenant {
  const ps = people.map((p) => ({ name: p.name.trim(), email: p.email.trim(), phone: p.phone.trim() })).filter((p) => p.name);
  return { ...t, people: ps, names: ps.map((p) => p.name), email: ps[0]?.email ?? '', phone: ps[0]?.phone ?? '' };
}

/** Every address a receipt or reminder goes to: one per person on the lease. */
export function tenantEmails(t: Tenant): string[] {
  return [...new Set(tenantPeople(t).map((p) => p.email).filter(Boolean))];
}

/** Everyone on an application, each with their own job and income. */
export function applicantPeople(a: Applicant): ApplicantPerson[] {
  if (a.people?.length) return a.people;
  return a.names.map((name, i) => (i === 0
    ? { name, email: a.email, phone: a.phone, employer: a.employer, jobTitle: a.jobTitle, monthlyIncome: a.monthlyIncome }
    : { name, email: '', phone: '', employer: '', monthlyIncome: 0 }));
}

/** "Lena and Tom Novak" style: everyone's name, joined for a sentence. */
export function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The To: line of a receipt or reminder: every person on the lease, each with their own email. */
export function toLine(t: Tenant | undefined): string {
  if (!t) return '';
  return tenantPeople(t).map((p) => `${p.name} <${p.email || 'no email on file'}>`).join(', ');
}
