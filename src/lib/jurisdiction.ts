import type { CCAClass, ExpenseCategory, Province } from '../data/types';

// Jurisdiction pack (PRD section 6). In stage 2 this moves to a versioned, admin-editable
// configuration served by the backend. Every figure here is a PLACEHOLDER for UI work:
// verify against Tribunals Ontario, CRA, CMHC and the other primary sources before launch.

export const PACK_VERSION = 'stage1-mock-2026.11';
export const PACK_VERIFIED = '2026-11-01';

export interface ProvinceInfo {
  code: Province;
  name: string;
  tier: 1 | 2 | 3;
  rentIncreaseGuidelinePct?: number;
  tribunal: string;
  cities: string[];
}

export const PROVINCES: ProvinceInfo[] = [
  { code: 'ON', name: 'Ontario', tier: 1, rentIncreaseGuidelinePct: 2.1, tribunal: 'Landlord and Tenant Board', cities: ['Toronto', 'Ottawa', 'Hamilton', 'Mississauga', 'London', 'Kitchener', 'Windsor', 'Other'] },
  { code: 'BC', name: 'British Columbia', tier: 2, rentIncreaseGuidelinePct: 3.0, tribunal: 'Residential Tenancy Branch', cities: ['Vancouver', 'Victoria', 'Surrey', 'Kelowna', 'Other'] },
  { code: 'AB', name: 'Alberta', tier: 2, tribunal: 'Residential Tenancy Dispute Resolution Service', cities: ['Calgary', 'Edmonton', 'Red Deer', 'Other'] },
  { code: 'QC', name: 'Quebec', tier: 2, tribunal: 'Tribunal administratif du logement', cities: ['Montréal', 'Québec', 'Gatineau', 'Other'] },
  { code: 'MB', name: 'Manitoba', tier: 3, tribunal: 'Residential Tenancies Branch', cities: ['Winnipeg', 'Other'] },
  { code: 'SK', name: 'Saskatchewan', tier: 3, tribunal: 'Office of Residential Tenancies', cities: ['Saskatoon', 'Regina', 'Other'] },
  { code: 'NS', name: 'Nova Scotia', tier: 3, tribunal: 'Residential Tenancies Program', cities: ['Halifax', 'Other'] },
  { code: 'NB', name: 'New Brunswick', tier: 3, tribunal: 'Residential Tenancies Tribunal', cities: ['Moncton', 'Saint John', 'Fredericton', 'Other'] },
  { code: 'NL', name: 'Newfoundland and Labrador', tier: 3, tribunal: 'Residential Tenancies', cities: ["St. John's", 'Other'] },
  { code: 'PE', name: 'Prince Edward Island', tier: 3, tribunal: 'IRAC Rental Office', cities: ['Charlottetown', 'Other'] },
  { code: 'YT', name: 'Yukon', tier: 3, tribunal: 'Residential Tenancies Office', cities: ['Whitehorse', 'Other'] },
  { code: 'NT', name: 'Northwest Territories', tier: 3, tribunal: 'Rental Office', cities: ['Yellowknife', 'Other'] },
  { code: 'NU', name: 'Nunavut', tier: 3, tribunal: 'Rental Office', cities: ['Iqaluit', 'Other'] },
];

export const province = (p: Province) => PROVINCES.find((x) => x.code === p) ?? PROVINCES[0];

// ---- Expense categories: plain words, with the CRA T776 line hidden underneath (EX-2) ----
export const CATEGORIES: { id: ExpenseCategory; label: string; t776: string; t776Label: string; hint: string; sharedByDefault: boolean }[] = [
  { id: 'repairs', label: 'Repairs and upkeep', t776: '8960', t776Label: 'Maintenance and repairs', hint: 'Fixing or maintaining what is already there', sharedByDefault: true },
  { id: 'utilities', label: 'Utilities', t776: '9220', t776Label: 'Utilities', hint: 'Heat, hydro, water you pay for', sharedByDefault: true },
  { id: 'insurance', label: 'Insurance', t776: '8690', t776Label: 'Insurance', hint: 'Home or landlord policy', sharedByDefault: true },
  { id: 'property-tax', label: 'Property tax', t776: '9180', t776Label: 'Property taxes', hint: 'Municipal tax bill', sharedByDefault: true },
  { id: 'interest', label: 'Interest and bank charges', t776: '8710', t776Label: 'Interest and bank charges', hint: 'Mortgage interest, account fees', sharedByDefault: true },
  { id: 'advertising', label: 'Advertising', t776: '8521', t776Label: 'Advertising', hint: 'Listing fees, signs', sharedByDefault: false },
  { id: 'professional', label: 'Legal and accounting', t776: '8860', t776Label: 'Legal, accounting and other professional fees', hint: 'Paralegal, accountant', sharedByDefault: false },
  { id: 'management', label: 'Management and admin', t776: '8871', t776Label: 'Management and administration fees', hint: 'Software, property manager', sharedByDefault: false },
  { id: 'office', label: 'Office', t776: '8810', t776Label: 'Office expenses', hint: 'Stamps, printing', sharedByDefault: false },
  { id: 'travel', label: 'Travel', t776: '9200', t776Label: 'Travel', hint: 'Trips to the property', sharedByDefault: false },
  { id: 'vehicle', label: 'Vehicle', t776: '9281', t776Label: 'Motor vehicle expenses', hint: 'Gas, parking for property visits', sharedByDefault: false },
  { id: 'supplies', label: 'Supplies', t776: '9270', t776Label: 'Other expenses', hint: 'Cleaning, light bulbs, smoke alarms', sharedByDefault: false },
  { id: 'other', label: 'Something else', t776: '9270', t776Label: 'Other expenses', hint: 'Anything that does not fit', sharedByDefault: false },
];

export const category = (id: ExpenseCategory) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export const CCA_CLASSES: { id: CCAClass; label: string; ratePct: number; examples: string }[] = [
  { id: '1', label: 'Class 1 — Building', ratePct: 4, examples: 'The building itself, additions, a new roof' },
  { id: '8', label: 'Class 8 — Appliances and equipment', ratePct: 20, examples: 'Fridge, stove, washer, furniture' },
  { id: '10', label: 'Class 10 — Vehicles', ratePct: 30, examples: 'A vehicle used for the rental' },
  { id: '13', label: 'Class 13 — Leasehold improvements', ratePct: 0, examples: 'Improvements to a leased space' },
  { id: '50', label: 'Class 50 — Computers', ratePct: 55, examples: 'A computer used for the rental' },
];

// ---- Benchmark Guide (P2). Low = 25th percentile, typical = median, high = 75th (PRD 7.10) ----
export interface Band { low: number; typical: number; high: number; source: string; asOf: string }

// ---- What a landlord's money could earn elsewhere (Silver: "Your money is earning") ----
// 5-year GIC: the Bank of Canada's weekly figure for the big banks' posted 5-year GIC rate (Valet series
// V80691341), read by the server each day. High-interest savings and the stock index fund have no official
// rate: the super user sets them on the dashboard (Price & promotions → Comparison rates), with the date.
export interface Benchmark { pct: number; asOf: string; source: string }
export interface Benchmarks { savings: Benchmark; gic: Benchmark; index: Benchmark }
export const BENCHMARK_LABELS = { savings: 'High-interest savings', gic: '5-year GIC', index: 'Broad stock index fund' } as const;
export const GIC_SOURCE = "Bank of Canada: the big banks' posted 5-year GIC rate";
export const DEFAULT_BENCHMARKS: Benchmarks = {
  savings: { pct: 2.75, asOf: '2026-10-01', source: 'Set by Keyholder' },
  gic: { pct: 2.75, asOf: '2026-11-04', source: GIC_SOURCE },
  index: { pct: 7.5, asOf: '2026-10-01', source: 'Long-run yearly average, not a promise' },
};
let liveBenchmarks: Benchmarks | null = null;
/** The rates in effect: the live site's (from the server) or, in the preview, the sample dashboard's. */
export function setBenchmarks(b: Benchmarks | null | undefined) { liveBenchmarks = b ?? null; }
export const benchmarks = (): Benchmarks => liveBenchmarks ?? DEFAULT_BENCHMARKS;
/** The three rates as a band for the ruler: savings, GIC, stock index fund. */
export function returnPresets(): Band & { labels: [string, string, string] } {
  const b = benchmarks();
  return { low: b.savings.pct, typical: b.gic.pct, high: b.index.pct, labels: [BENCHMARK_LABELS.savings, BENCHMARK_LABELS.gic, BENCHMARK_LABELS.index], source: b.gic.source, asOf: b.gic.asOf };
}

export interface RegionData {
  vacancy: Band;
  grossYield: Band;
  expenseRatio: Band;
  rentGrowth: Band;
  /** Annual price change, %, over 1 / 5 / 10 years. Used by the open-data index estimate. */
  priceGrowth: { y1: number; y5: number; y10: number; source: string; asOf: string };
  vacancyDirection: 'up' | 'down' | 'flat';
  /** Typical asking rent by bedrooms (cents). Placeholder — CMHC / Rentals.ca in Stage 2. */
  marketRent: { 0: number; 1: number; 2: number; 3: number; source: string; asOf: string };
}

const REGION_DEFAULT: RegionData = {
  vacancy: { low: 2.0, typical: 3.1, high: 4.5, source: 'Placeholder — CMHC Rental Market Survey (national)', asOf: '2025' },
  grossYield: { low: 3.5, typical: 4.8, high: 6.5, source: 'Placeholder — derived from CMHC rents and CREA prices', asOf: '2026-Q2' },
  expenseRatio: { low: 25, typical: 35, high: 45, source: 'Placeholder — small residential typical range', asOf: '2026' },
  rentGrowth: { low: -3, typical: 1.5, high: 4, source: 'Placeholder — Rentals.ca / CMHC', asOf: '2026-05' },
  priceGrowth: { y1: -1.5, y5: 3.2, y10: 5.8, source: 'Placeholder — CREA MLS® HPI / Teranet–National Bank HPI', asOf: '2026-09' },
  vacancyDirection: 'up',
  marketRent: { 0: 115_000, 1: 140_000, 2: 170_000, 3: 205_000, source: 'Placeholder — Rentals.ca national averages', asOf: '2026-10' },
};

export const REGIONS: Record<string, Partial<RegionData>> = {
  'ON:Toronto': {
    vacancy: { low: 2.5, typical: 3.0, high: 4.0, source: 'Placeholder — CMHC 2026 Mid-Year Rental Market Update', asOf: '2025' },
    grossYield: { low: 3.0, typical: 3.9, high: 4.8, source: 'Placeholder', asOf: '2026-Q2' },
    priceGrowth: { y1: -3.8, y5: 2.1, y10: 5.4, source: 'Placeholder — CREA MLS® HPI, Toronto', asOf: '2026-09' },
    marketRent: { 0: 205_000, 1: 245_000, 2: 320_000, 3: 390_000, source: 'Placeholder — Rentals.ca, Toronto', asOf: '2026-10' },
  },
  'ON:Ottawa': {
    vacancy: { low: 2.0, typical: 3.0, high: 4.0, source: 'Placeholder — CMHC 2026 Mid-Year Rental Market Update', asOf: '2025' },
    priceGrowth: { y1: -0.6, y5: 3.4, y10: 6.1, source: 'Placeholder — CREA MLS® HPI, Ottawa', asOf: '2026-09' },
  },
  'ON:Hamilton': {
    vacancy: { low: 2.2, typical: 3.4, high: 4.6, source: 'Placeholder — CMHC', asOf: '2025' },
    grossYield: { low: 4.0, typical: 5.0, high: 6.2, source: 'Placeholder', asOf: '2026-Q2' },
    priceGrowth: { y1: -2.4, y5: 3.0, y10: 6.6, source: 'Placeholder — CREA MLS® HPI, Hamilton-Burlington', asOf: '2026-09' },
    marketRent: { 0: 135_000, 1: 165_000, 2: 195_000, 3: 235_000, source: 'Placeholder — Rentals.ca, Hamilton', asOf: '2026-10' },
  },
  'BC:Vancouver': {
    vacancy: { low: 1.0, typical: 1.6, high: 2.5, source: 'Placeholder — CMHC', asOf: '2025' },
    grossYield: { low: 2.6, typical: 3.2, high: 4.0, source: 'Placeholder', asOf: '2026-Q2' },
    priceGrowth: { y1: -2.9, y5: 1.8, y10: 4.9, source: 'Placeholder — CREA MLS® HPI, Greater Vancouver', asOf: '2026-09' },
  },
  'AB:Calgary': {
    vacancy: { low: 3.0, typical: 4.5, high: 6.0, source: 'Placeholder — CMHC', asOf: '2025' },
    grossYield: { low: 4.5, typical: 5.6, high: 7.0, source: 'Placeholder', asOf: '2026-Q2' },
    priceGrowth: { y1: 1.2, y5: 6.1, y10: 3.9, source: 'Placeholder — CREA MLS® HPI, Calgary', asOf: '2026-09' },
  },
};

export function regionData(p: Province, city: string): RegionData & { fallback: boolean } {
  const r = REGIONS[`${p}:${city}`];
  return { ...REGION_DEFAULT, ...(r ?? {}), fallback: !r };
}

export const POPULAR_BANKS = ['RBC', 'TD', 'BMO', 'Scotiabank', 'CIBC', 'National Bank', 'Desjardins', 'Tangerine'];
export const OTHER_BANKS = [
  'ATB Financial', 'Simplii Financial', 'EQ Bank', 'HSBC Canada', 'Laurentian Bank', 'Manulife Bank', 'PC Financial',
  'Coast Capital', 'Vancity', 'Meridian', 'Servus', 'Affinity Credit Union', 'Alterna', 'Conexus', 'Steinbach Credit Union',
  'Other credit union',
];
/** How often a connected bank is checked for rent (Stage 2: a scheduled job). */
export const BANK_CHECK_HOURS = 4;
