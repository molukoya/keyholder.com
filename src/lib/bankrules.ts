import type { AppState, BankTxn, ExpenseCategory, ISODate, Mortgage } from '../data/types';
import { amortization } from './finance';

// Reading bank withdrawals: is it a rental expense (which type, which property?) or a mortgage payment?
// Rules are simple and explainable; a vendor the owner has filed once is remembered.

const RULES: [RegExp, ExpenseCategory, string][] = [
  [/ENBRIDGE|UNION GAS|FORTIS|GAZ M/i, 'utilities', 'Gas bill'],
  [/HYDRO|ALECTRA|ENERGY|ELECTRIC(ITY)? (BILL|CO)/i, 'utilities', 'Electricity bill'],
  [/WATER|WASTEWATER/i, 'utilities', 'Water bill'],
  [/CITY OF|TOWN OF|VILLE DE|MUNICIPAL|PROPERTY TAX/i, 'property-tax', 'Property tax'],
  [/INTACT|AVIVA|SQUARE ONE|INSURANCE|ASSURANCE|ECONOMICAL/i, 'insurance', 'Insurance'],
  [/HOME DEPOT|RONA|LOWE'?S|CANADIAN TIRE|HOME HARDWARE|PLUMB|HEATING|HVAC|ROOFING|APPLIANCE/i, 'repairs', 'Repairs or supplies'],
  [/LAWN|SNOW|CLEANING|PEST/i, 'repairs', 'Upkeep'],
];
const MORTGAGE = /MORTGAGE|MTG|HYPOTH|MORT PMT/i;

export const vendorKey = (payer: string) => payer.toUpperCase().replace(/#\s*\d+|\d{3,}/g, '').replace(/\s+/g, ' ').trim();

export interface Reading {
  kind: 'expense' | 'mortgage';
  category?: ExpenseCategory;
  label: string;
  propertyId?: string;
  mortgageId?: string;
  /** For mortgage payments: does it match the payment on record? */
  matchesSchedule?: boolean;
  why: string;
}

function mortgagePaymentAmount(m: Mortgage): number {
  return amortization(m)[0]?.payment ?? 0;
}

/** Best guess for a withdrawal. Never files anything by itself unless the vendor was confirmed before. */
export function readWithdrawal(state: AppState, t: BankTxn): Reading {
  const amount = -t.amount;
  const props = state.properties.filter((p) => !p.archived);
  if (MORTGAGE.test(t.payer)) {
    const lenderWord = t.payer.split(/\s+/)[0].toLowerCase();
    const m = state.mortgages.find((x) => x.lender.toLowerCase().includes(lenderWord)) ?? state.mortgages.find((x) => Math.abs(mortgagePaymentAmount(x) - amount) <= amount * 0.02);
    if (m) {
      const due = mortgagePaymentAmount(m);
      return { kind: 'mortgage', label: 'Mortgage payment', mortgageId: m.id, propertyId: m.propertyId, matchesSchedule: Math.abs(due - amount) <= 100, why: Math.abs(due - amount) <= 100 ? 'Matches the payment on your mortgage' : `Your mortgage shows ${(due / 100).toFixed(2)}; this is ${(amount / 100).toFixed(2)}` };
    }
    const without = props.filter((p) => !p.mortgageFree && !state.mortgages.some((x) => x.propertyId === p.id));
    return { kind: 'mortgage', label: 'Mortgage payment', propertyId: without.length === 1 ? without[0].id : undefined, why: 'Looks like a mortgage payment with no mortgage on record' };
  }
  const learned = state.profile.vendorRules?.[vendorKey(t.payer)];
  if (learned) return { kind: 'expense', category: learned.category, propertyId: learned.propertyId, label: 'Filed before', why: 'You filed this vendor before' };
  const rule = RULES.find(([re]) => re.test(t.payer));
  const city = props.find((p) => t.payer.toUpperCase().includes(p.city.toUpperCase()));
  return {
    kind: 'expense', category: rule?.[1] ?? 'other', label: rule?.[2] ?? 'Possible expense',
    propertyId: city?.id ?? (props.length === 1 ? props[0].id : undefined),
    why: rule ? `${rule[2]}${city ? ` in ${city.city}` : ''}` : 'Not sure yet',
  };
}

/** Withdrawals waiting for the owner to sort. */
export function bankToSort(state: AppState): BankTxn[] {
  return state.txns.filter((t) => t.amount < 0 && t.status === 'new');
}

export const isRecent = (d: ISODate, today: ISODate) => d >= today.slice(0, 7);
