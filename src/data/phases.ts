import type { Phase } from './types';

// Single source of truth for what ships in which phase. The UI reads `enabled(feature, phase)`
// so each phase is a complete app on its own, and moving a feature is a one-line change here.

export const PHASES: { id: Phase; name: string; promise: string }[] = [
  { id: 1, name: 'Run the rental', promise: 'Properties, tenants, rent, receipts and expenses — with your bank or by hand.' },
  { id: 2, name: 'Know what it is worth', promise: 'Property value from your purchase price, local price data and comparable sales, plus the Worth-It reading.' },
  { id: 3, name: 'Mortgage, tax and capital', promise: 'Mortgage and purchase details, capital investments, CCA and a tax-ready pack.' },
];

export type Feature =
  // Phase 1
  | 'questionnaire' | 'properties' | 'rental-share' | 'units' | 'tenants' | 'leases'
  | 'rent-ledger' | 'manual-payment' | 'receipts' | 'trust-ramp' | 'reminders'
  | 'email-forwarding' | 'bank-link' | 'matching-tray' | 'expenses' | 'receipt-capture'
  | 'repair-or-improvement' | 'today-pulse' | 'rent-roll' | 'documents'
  // Phase 2
  | 'purchase-price' | 'valuation' | 'comparables' | 'index-estimate' | 'equity-simple'
  | 'worth-it' | 'benchmarks'
  // Phase 3
  | 'purchase-details' | 'mortgage' | 'amortization' | 'mortgage-alerts' | 'cca'
  | 'capital-tracking' | 'tax-pack' | 'capital-gain';

export const FEATURES: Record<Feature, { phase: Phase; label: string; prd: string }> = {
  questionnaire: { phase: 1, label: 'Signup questionnaire and plan letter', prd: '§5' },
  properties: { phase: 1, label: 'Properties', prd: 'PS-1' },
  'rental-share': { phase: 1, label: 'Rental share for part-of-home rentals', prd: 'PS-5, PS-6' },
  units: { phase: 1, label: 'Units and door plates', prd: 'PS-4' },
  tenants: { phase: 1, label: 'Tenants with email-notice consent', prd: 'TL-1' },
  leases: { phase: 1, label: 'Lease records', prd: 'TL-2' },
  'rent-ledger': { phase: 1, label: 'Rent ledger and statement', prd: 'RL-1, RL-6' },
  'manual-payment': { phase: 1, label: 'Confirm rent by hand', prd: 'RL-2' },
  receipts: { phase: 1, label: 'Rent receipts, superseded on edit', prd: 'RL-3, RL-5' },
  'trust-ramp': { phase: 1, label: 'Co-pilot approvals and the trust ramp', prd: '§3.2, RL-4' },
  reminders: { phase: 1, label: 'Gentle, Standard and Firm reminders', prd: 'AR-1 – AR-5' },
  'email-forwarding': { phase: 1, label: 'Forwarded e-Transfer emails', prd: '§7.4' },
  'bank-link': { phase: 1, label: 'Read-only bank connection (big five)', prd: 'BK-1, BK-5' },
  'matching-tray': { phase: 1, label: 'Payment matching and the approval tray', prd: 'BK-2 – BK-4' },
  expenses: { phase: 1, label: 'Expenses in plain words', prd: 'EX-1, EX-2' },
  'receipt-capture': { phase: 1, label: 'Snap a receipt', prd: 'EX-1' },
  'repair-or-improvement': { phase: 1, label: 'Repair or improvement question', prd: 'EX-3' },
  'today-pulse': { phase: 1, label: 'Today: the Pulse, In / Out / Kept', prd: '§12' },
  'rent-roll': { phase: 1, label: 'Rent Roll strip', prd: '§12' },
  documents: { phase: 1, label: 'Paperwork: receipts, leases, letters', prd: '§3' },
  'purchase-price': { phase: 2, label: 'Purchase date and price', prd: 'PS-1' },
  valuation: { phase: 2, label: 'Valuation history as a range', prd: 'VA-1 – VA-3, LT-1' },
  comparables: { phase: 2, label: 'Comparable sales', prd: 'VA-1' },
  'index-estimate': { phase: 2, label: 'Open-data price index estimate', prd: 'VA-1' },
  'equity-simple': { phase: 2, label: 'Equity from an approximate mortgage balance', prd: 'LT-2' },
  'worth-it': { phase: 2, label: 'Worth-It reading', prd: 'FP-3' },
  benchmarks: { phase: 2, label: 'Benchmark Guide rulers', prd: '§7.10' },
  'purchase-details': { phase: 3, label: 'Closing costs, land transfer tax, land value', prd: 'PS-1, PS-3' },
  mortgage: { phase: 3, label: 'Mortgage record', prd: 'PS-2' },
  amortization: { phase: 3, label: 'Amortization schedule, principal and interest', prd: 'PS-2' },
  'mortgage-alerts': { phase: 3, label: 'Renewal alert at 120 days', prd: 'FP-5' },
  cca: { phase: 3, label: 'CCA schedule with half-year rule', prd: 'TX-4, PS-7' },
  'capital-tracking': { phase: 3, label: 'Capital investments and cost base', prd: 'EX-3, LT-6' },
  'tax-pack': { phase: 3, label: 'Tax Pack (T776) with pre-flight checklist', prd: 'TX-1 – TX-3' },
  'capital-gain': { phase: 3, label: 'Capital gain estimate if sold', prd: 'LT-6' },
};

export function enabled(f: Feature, phase: Phase): boolean {
  return FEATURES[f].phase <= phase;
}
