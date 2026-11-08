// Core entities (PRD section 8.1). Money is always integer cents; dates are ISO strings (YYYY-MM-DD).
// Fields marked P2 / P3 are only shown in the UI once that phase is enabled, but live on the same
// entities so data entered in an earlier phase carries forward untouched.

export type ID = string;
export type Cents = number;
export type ISODate = string; // YYYY-MM-DD
export type Period = string; // YYYY-MM

export type Phase = 1 | 2 | 3;

export type Province =
  | 'ON' | 'BC' | 'AB' | 'QC' | 'MB' | 'SK' | 'NS' | 'NB' | 'NL' | 'PE' | 'YT' | 'NT' | 'NU';

export type SetupKind = 'single' | 'part-home' | 'few' | 'many';
export type RentMethod = 'etransfer' | 'cheque' | 'cash' | 'mix';
export type Tone = 'gentle' | 'standard' | 'firm';
export type Goal = 'no-chasing' | 'makes-money' | 'fill-unit' | 'tax-ready';
export type RentArrival = 'manual' | 'email' | 'bank';

export interface Profile {
  onboarded: boolean;
  name: string;
  email: string;
  province: Province;
  city: string;
  setup: SetupKind;
  rentMethod: RentMethod;
  dreads: string[];
  taxWorries: string[];
  goal: Goal;
  rentArrival: RentArrival;
  reminderTone: Tone;
  graceDays: number;
  /** Trust ramp (PRD 3.2): co-pilot until the owner opts in to automatic receipts and reminders. */
  autoSend: boolean;
  approvedUnchanged: number;
  autoSendOffered: boolean;
  forwardingAddress: string;
  phase: Phase;
  theme: 'system' | 'light' | 'dark';
  paperGrain: boolean;
}

export type PropertyType = 'house' | 'duplex' | 'triplex' | 'condo' | 'townhouse' | 'other';

export interface Property {
  id: ID;
  nickname: string;
  address: string;
  city: string;
  province: Province;
  type: PropertyType;
  /** Share of the property that is rented out, 0–100 (PS-5). 100 when the owner lives elsewhere. */
  rentalSharePct: number;
  ownerOccupied: boolean;
  ownershipPct: number;
  // P2 — valuation inputs
  purchaseDate?: ISODate;
  purchasePrice?: Cents;
  /** P2 simple mortgage inputs; replaced by the full mortgage record once phase 3 is on. */
  approxMortgageBalance?: Cents;
  approxMortgagePayment?: Cents; // monthly
  // P3 — purchase details and carrying costs
  closingCosts?: Cents;
  landTransferTax?: Cents;
  improvementsAtPurchase?: Cents;
  landValuePct?: number; // share of price that is land (not depreciable)
  annualPropertyTax?: Cents;
  annualInsurance?: Cents;
  claimCCA: boolean;
  archived?: boolean;
}

export type UnitStatus = 'occupied' | 'vacant' | 'notice';

export interface Unit {
  id: ID;
  propertyId: ID;
  label: string; // "A", "Basement", "Upper"
  rent: Cents;
  bedrooms: number;
  utilitiesIncluded: string[];
  status: UnitStatus;
}

export type NoticeMethod = 'email' | 'hand' | 'mail';

export interface Tenant {
  id: ID;
  unitId: ID;
  names: string[];
  email: string;
  phone: string;
  noticeMethod: NoticeMethod;
  emailConsent: boolean;
  emailConsentDate?: ISODate;
  /** Payer names learned from confirmed matches (BK-4). */
  aliases: string[];
  remindersPaused?: string; // reason
  movedOut?: ISODate;
}

export type PayMethod = 'etransfer' | 'cheque' | 'cash' | 'direct-deposit' | 'other';

export interface Lease {
  id: ID;
  unitId: ID;
  tenantId: ID;
  start: ISODate;
  end?: ISODate;
  rent: Cents;
  dueDay: number;
  paymentMethod: PayMethod;
  lmrDeposit: Cents;
  utilities: string;
  parking: boolean;
  pets: boolean;
  emailNoticeConsent: boolean;
}

export type PaymentSource = 'manual' | 'bank' | 'email';

export interface Payment {
  id: ID;
  leaseId: ID;
  date: ISODate;
  amount: Cents;
  method: PayMethod;
  period: Period;
  source: PaymentSource;
  note?: string;
  voided?: boolean;
  createdAt: string;
}

export type ReceiptStatus = 'draft' | 'sent' | 'superseded';

export interface Receipt {
  id: ID;
  number: number;
  paymentId: ID;
  status: ReceiptStatus;
  createdAt: string;
  sentAt?: string;
  supersedes?: ID;
  note?: string;
}

export type BankName = 'RBC' | 'TD' | 'BMO' | 'Scotiabank' | 'CIBC';

export interface BankConnection {
  id: ID;
  bank: BankName;
  accountMask: string;
  status: 'connected' | 'needs-reauth';
  lastSync: string;
}

export type TxnStatus = 'new' | 'matched' | 'suggested' | 'ignored' | 'expense';

export interface BankTxn {
  id: ID;
  source: 'bank' | 'email';
  date: ISODate;
  amount: Cents; // positive = deposit, negative = withdrawal
  payer: string;
  memo: string;
  status: TxnStatus;
  paymentId?: ID;
  expenseId?: ID;
  suggestion?: { leaseId: ID; period: Period; confidence: 'high' | 'medium' | 'low'; reasons: string[] };
}

export type ExpenseCategory =
  | 'repairs' | 'utilities' | 'insurance' | 'property-tax' | 'interest' | 'advertising'
  | 'professional' | 'management' | 'office' | 'travel' | 'vehicle' | 'supplies' | 'other';

export type CCAClass = '1' | '8' | '10' | '13' | '50';

export interface Expense {
  id: ID;
  propertyId: ID;
  unitId?: ID;
  date: ISODate;
  amount: Cents;
  vendor: string;
  category: ExpenseCategory;
  kind: 'current' | 'capital';
  /** Shared costs are split by the rental share; direct costs count 100% (PS-6). */
  scope: 'shared' | 'direct' | 'personal';
  receiptImage?: string; // data URL (stage 1 only)
  note?: string;
  ccaClass?: CCAClass; // P3, capital items
  recurring?: boolean;
  createdAt: string;
}

export type MessageKind = 'receipt' | 'reminder';

export interface Message {
  id: ID;
  kind: MessageKind;
  tenantId: ID;
  leaseId: ID;
  period?: Period;
  receiptId?: ID;
  tone?: Tone;
  subject: string;
  body: string;
  status: 'draft' | 'sent' | 'cancelled';
  edited: boolean;
  createdAt: string;
  sentAt?: string;
}

// ---- Phase 2 ----
export type ValuationSource = 'purchase' | 'owner' | 'index' | 'comparables' | 'assessment';

export interface Valuation {
  id: ID;
  propertyId: ID;
  date: ISODate;
  source: ValuationSource;
  low: Cents;
  likely: Cents;
  high: Cents;
  confidence: 'low' | 'medium' | 'high';
  note?: string;
}

export interface Comparable {
  id: ID;
  propertyId: ID;
  address: string;
  saleDate: ISODate;
  price: Cents;
  bedrooms: number;
  similarity: 'less' | 'similar' | 'more'; // compared with the subject property
}

// ---- Phase 3 ----
export type MortgageFrequency = 'monthly' | 'semi-monthly' | 'biweekly' | 'weekly';

export interface Mortgage {
  id: ID;
  propertyId: ID;
  lender: string;
  principal: Cents; // amount borrowed at startDate
  startDate: ISODate;
  ratePct: number; // nominal annual, compounded semi-annually (Canadian fixed-rate convention)
  amortYears: number;
  termEnd: ISODate;
  frequency: MortgageFrequency;
  /** Optional override when the lender's payment differs from the computed one. */
  paymentOverride?: Cents;
}

export interface AuditEntry {
  id: ID;
  at: string;
  action: string;
  detail: string;
}

export interface AppState {
  version: number;
  profile: Profile;
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  payments: Payment[];
  receipts: Receipt[];
  messages: Message[];
  bank?: BankConnection;
  txns: BankTxn[];
  expenses: Expense[];
  valuations: Valuation[];
  comparables: Comparable[];
  mortgages: Mortgage[];
  audit: AuditEntry[];
}
