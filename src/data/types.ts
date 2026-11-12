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
/** How Keyholder learns rent has arrived: the owner marks it, or a connected bank is checked every few hours. */
export type RentArrival = 'manual' | 'bank';

export interface Profile {
  onboarded: boolean;
  name: string;
  email: string;
  /** Optional: shown on receipts and letters. */
  phone?: string;
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
  /** Withdrawals the owner has filed before: payer → property and type, so future ones file themselves. */
  vendorRules?: Record<string, { propertyId: string; category: ExpenseCategory }>;
  /** Showing the sample properties (demo). */
  sample?: boolean;
  tourDone?: boolean;
  /** Account (Stage 1: simulated). 'demo' (test / test) opens the sample properties; 'admin' (admin / admin) the support dashboard. */
  account?: { provider: 'google' | 'email' | 'demo' | 'admin'; email: string; name: string; signedIn: boolean; created: ISODate };
  /** Email me on rent day and once a month (preview only: nothing is sent). */
  emailUpdates?: boolean;
  /** Today's visit and the one before, for "Since your last visit". */
  lastVisit?: ISODate;
  prevVisit?: ISODate;
}

export type PropertyType = 'house' | 'duplex' | 'triplex' | 'condo' | 'townhouse' | 'other';

export interface Property {
  id: ID;
  nickname: string;
  address: string;
  city: string;
  province: Province;
  postalCode?: string;
  /** Map position (from the address lookup). Only cities, never exact positions, leave the landlord's account. */
  geo?: { lat: number; lng: number };
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
  /** Owner said there is no mortgage (counts as mortgage details for Gold). */
  mortgageFree?: boolean;
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
  /** 'whole' (default): one lease, shared by everyone on it. 'room': each room has its own tenant, lease and rent. */
  rentedBy?: 'whole' | 'room';
  /** Rooms for rent, when rented by the room. For those units `rent` is the usual rent for one room. */
  rooms?: number;
}

/** One person on a lease or an application, with their own contact details. */
export interface Person {
  name: string;
  email: string;
  phone: string;
}

export type NoticeMethod = 'email' | 'hand' | 'mail';

export interface Tenant {
  id: ID;
  unitId: ID;
  /** Everyone on the lease. Kept in step with `people`; email and phone are the first person's. */
  names: string[];
  email: string;
  phone: string;
  /** Everyone on the lease with their own email and phone. Receipts and reminders go to all of them. */
  people?: Person[];
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
  depositReturned?: boolean;
  utilities: string;
  parking: boolean;
  pets: boolean;
  emailNoticeConsent: boolean;
  /** Units rented by the room: which room this lease is for, e.g. "Room 2". */
  room?: string;
  /**
   * A tenancy older than Keyholder: rent counts as paid up to and including this month (YYYY-MM), from the
   * landlord's answer to "Is this tenant in good standing? When was the last rent they paid?".
   */
  paidThrough?: Period;
  /** The landlord answered that question (also when they said the rent really is owed). */
  standingChecked?: boolean;
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

/** Any Canadian bank or credit union the bank-data provider supports. */
export type BankName = string;

export interface BankConnection {
  id: ID;
  bank: BankName;
  accountMask: string;
  status: 'connected' | 'needs-reauth';
  lastSync: string;
  /** Set for a real connection through Plaid (live site). Without it, a connection on the live site is a practice one. */
  via?: 'plaid';
}

export type TxnStatus = 'new' | 'matched' | 'suggested' | 'ignored' | 'expense' | 'mortgage';

export interface BankTxn {
  id: ID;
  source: 'bank' | 'email';
  date: ISODate;
  amount: Cents; // positive = deposit, negative = withdrawal
  payer: string;
  memo: string;
  status: TxnStatus;
  bankId?: ID;
  paymentId?: ID;
  expenseId?: ID;
  mortgageId?: ID;
  /** Looked at once by the app when it arrived from the bank (matched to rent, or filed by a vendor rule). */
  checked?: boolean;
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
  /** Paid in cash with no store receipt: the expense itself is the record (date, who, what, how much). */
  cashNoReceipt?: boolean;
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
export type ValuationSource = 'purchase' | 'owner' | 'index' | 'comparables' | 'assessment' | 'avm';

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
  rateType?: 'fixed' | 'variable';
  /** Accelerated bi-weekly/weekly: half or a quarter of the monthly payment. */
  accelerated?: boolean;
  termYears?: number;
  /** The mortgage when first taken out (history only). */
  originalAmount?: Cents;
  originalDate?: ISODate;
  insurer?: string; // CMHC, Sagen, Canada Guaranty, none
  /** Extra payments that go straight to principal. */
  prepayments?: { date: ISODate; amount: Cents }[];
}

// ---- Finding a tenant (RA-1 – RA-9) ----
export interface Listing {
  unitId: ID;
  askingRent: Cents;
  available: ISODate;
  notes: string;
  vacantSince: ISODate;
  /** Public link slug for the application form. */
  slug: string;
}

export type ApplicantStatus = 'new' | 'shortlisted' | 'declined' | 'offered' | 'accepted';

/** One person on an application, with their own contact details, job and income. */
export interface ApplicantPerson extends Person {
  employer: string;
  jobTitle?: string;
  monthlyIncome: Cents;
}

export interface Applicant {
  id: ID;
  unitId: ID;
  names: string[];
  email: string;
  phone: string;
  submitted: ISODate;
  moveIn: ISODate;
  currentAddress: string;
  yearsAtAddress: number;
  employer: string;
  monthlyIncome: Cents;
  references: string;
  pets: boolean;
  notes: string;
  status: ApplicantStatus;
  // Fuller application (all optional so older records still load)
  occupants?: number;
  emergencyContact?: string;
  currentRent?: Cents;
  landlordName?: string;
  landlordPhone?: string;
  reasonLeaving?: string;
  previousAddress?: string;
  previousYears?: number;
  jobTitle?: string;
  employedYears?: number;
  employerContact?: string;
  otherIncome?: Cents;
  otherIncomeSource?: string;
  leaseTerm?: string;
  vehicles?: number;
  smoking?: boolean;
  creditConsent?: boolean;
  documents?: string[];
  /**
   * Everyone applying together (a couple or roommates sharing one lease), each with their own job and income.
   * `names`, `email`, `phone`, `employer` and `monthlyIncome` hold the totals and the first person's contact.
   */
  people?: ApplicantPerson[];
  /** The owner's own assessment. */
  assessment?: { landlordRef?: boolean; employerRef?: boolean; idSeen?: boolean; creditChecked?: boolean; creditScore?: number; docsReceived?: boolean; rating?: number; notes?: string };
}

/** Hide or ignore a to-do. Key = card id + step id, so the next step still appears. */
export interface TodoPref { hiddenUntil?: ISODate; ignored?: boolean }

// ---- Forms and notices (any province) ----
export type NoticeStatus = 'served' | 'voided-by-payment' | 'filed' | 'signed';

export interface Notice {
  id: ID;
  /** Form in the registry (src/lib/forms.ts). */
  formId: string;
  /** Short code shown to people, e.g. "N4", "RTB-30". */
  kind: string;
  leaseId: ID;
  tenantId: ID;
  createdAt: string;
  arrears: Cents;
  periods: Period[];
  serveMethod: 'email' | 'hand' | 'mail' | 'mail-slot' | 'signed';
  servedOn?: ISODate;
  servedBy?: string;
  terminationDate?: ISODate;
  status: NoticeStatus;
  /** Form-specific answers (new rent, reason, who moves in, inspection notes…). */
  details?: Record<string, string>;
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
  /** Every connected bank or credit union (view-only). */
  banks: BankConnection[];
  txns: BankTxn[];
  expenses: Expense[];
  valuations: Valuation[];
  comparables: Comparable[];
  mortgages: Mortgage[];
  listings: Listing[];
  applicants: Applicant[];
  notices: Notice[];
  todoPrefs: Record<string, TodoPref>;
  audit: AuditEntry[];
}
