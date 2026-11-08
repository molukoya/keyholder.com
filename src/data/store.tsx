import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AppState, BankName, BankTxn, Comparable, Expense, Lease, Mortgage, Payment, Profile, Property, Tenant, Tone, Unit, Valuation,
} from './types';
import { emptyState, seedState, STATE_VERSION, defaultProfile } from './seed';
import { addDays, dueDate, periodOf, todayISO } from '../lib/dates';
import { activeLease, leaseLedger } from '../lib/finance';
import { suggestMatch } from '../lib/matching';
import { reminderDraft } from '../lib/templates';
import { fmt } from '../lib/money';

// Stage 1 store: all data lives in the browser (localStorage). In stage 2 each action below
// becomes an API call; the action names are the contract for the backend.

const KEY = 'keyholder:v1';
export const uid = (p = 'id') => `${p}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s.version === STATE_VERSION) return s;
    }
  } catch { /* fall through */ }
  return seedState();
}

function save(s: AppState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked: keep working in memory */ }
}

type Mut = (fn: (d: AppState) => void) => void;

function audit(d: AppState, action: string, detail = '') {
  d.audit.unshift({ id: uid('a'), at: new Date().toISOString(), action, detail });
  if (d.audit.length > 500) d.audit.length = 500;
}

const tenantName = (d: AppState, leaseId: string) => {
  const l = d.leases.find((x) => x.id === leaseId);
  const t = d.tenants.find((x) => x.id === l?.tenantId);
  return t?.names.join(' & ') ?? 'tenant';
};

function makeActions(mut: Mut, toast: (s: string) => void) {
  const today = () => todayISO();

  /** Record a payment, draft (or send) its receipt, and cancel reminders it makes moot (AR-3). */
  function recordPayment(d: AppState, p: Omit<Payment, 'id' | 'createdAt'>): Payment {
    const pay: Payment = { ...p, id: uid('pay'), createdAt: new Date().toISOString() };
    d.payments.push(pay);
    const number = Math.max(1000, ...d.receipts.map((r) => r.number)) + 1;
    const rid = uid('rcpt');
    const lease = d.leases.find((l) => l.id === p.leaseId)!;
    const auto = d.profile.autoSend;
    const nowIso = new Date().toISOString();
    d.receipts.push({ id: rid, number, paymentId: pay.id, status: auto ? 'sent' : 'draft', createdAt: nowIso, sentAt: auto ? nowIso : undefined });
    d.messages.push({
      id: uid('msg'), kind: 'receipt', tenantId: lease.tenantId, leaseId: lease.id, period: p.period, receiptId: rid,
      subject: 'Your rent receipt', body: '', status: auto ? 'sent' : 'draft', edited: false, createdAt: nowIso, sentAt: auto ? nowIso : undefined,
    });
    const line = leaseLedger(lease, d.payments, today()).find((l) => l.period === p.period);
    if (line && line.paid >= line.charge) {
      for (const m of d.messages) if (m.kind === 'reminder' && m.leaseId === lease.id && m.period === p.period && m.status === 'draft') m.status = 'cancelled';
    }
    audit(d, 'Payment logged', `${fmt(p.amount)} from ${tenantName(d, lease.id)} for ${p.period} (${p.source})`);
    return pay;
  }

  function autoMatch(d: AppState, t: BankTxn) {
    const s = suggestMatch(d, t, today());
    if (s?.confidence === 'high') {
      const lease = d.leases.find((l) => l.id === s.leaseId)!;
      const pay = recordPayment(d, { leaseId: s.leaseId, period: s.period, amount: t.amount, date: t.date, method: lease.paymentMethod, source: t.source });
      t.status = 'matched'; t.paymentId = pay.id;
      return true;
    }
    return false;
  }

  return {
    // ---- Profile & onboarding ----
    completeOnboarding(p: Partial<Profile>, withSample: boolean) {
      mut((d) => {
        const profile = { ...d.profile, ...p, onboarded: true };
        const next = withSample ? seedState(profile) : emptyState(profile);
        if (!withSample) next.bank = undefined;
        Object.assign(d, next);
        audit(d, 'Signed up', `Province ${profile.province}, ${withSample ? 'with sample data' : 'starting empty'}`);
      });
    },
    setProfile(p: Partial<Profile>) { mut((d) => { Object.assign(d.profile, p); }); },
    resetDemo() { mut((d) => { const prof = { ...d.profile }; Object.assign(d, seedState(prof)); }); toast('Sample data restored.'); },
    clearAll() { mut((d) => { Object.assign(d, emptyState({ ...d.profile })); }); toast('All data cleared. Start by adding a property.'); },
    restartOnboarding() { mut((d) => { Object.assign(d, seedState({ ...defaultProfile(), phase: d.profile.phase })); }); },

    // ---- Properties & units ----
    saveProperty(p: Property) {
      mut((d) => {
        const i = d.properties.findIndex((x) => x.id === p.id);
        if (i >= 0) { d.properties[i] = p; audit(d, 'Property updated', p.nickname); }
        else {
          d.properties.push(p); audit(d, 'Property added', p.nickname);
          if (p.purchasePrice && p.purchaseDate) d.valuations.push({ id: uid('v'), propertyId: p.id, date: p.purchaseDate, source: 'purchase', low: p.purchasePrice, likely: p.purchasePrice, high: p.purchasePrice, confidence: 'high', note: 'Purchase price' });
        }
      });
    },
    archiveProperty(id: string) { mut((d) => { const p = d.properties.find((x) => x.id === id); if (p) { p.archived = true; audit(d, 'Property archived', p.nickname); } }); },
    saveUnit(u: Unit) {
      mut((d) => {
        const i = d.units.findIndex((x) => x.id === u.id);
        if (i >= 0) d.units[i] = u; else d.units.push(u);
        audit(d, i >= 0 ? 'Unit updated' : 'Unit added', u.label);
      });
    },
    removeUnit(id: string) { mut((d) => { d.units = d.units.filter((u) => u.id !== id); audit(d, 'Unit removed', id); }); },

    // ---- Tenants & leases ----
    addTenancy(t: Tenant, l: Lease) {
      mut((d) => {
        d.tenants.push(t); d.leases.push(l);
        const u = d.units.find((x) => x.id === l.unitId); if (u) { u.status = 'occupied'; u.rent = l.rent; }
        audit(d, 'Tenant added', `${t.names.join(' & ')}, lease from ${l.start}`);
      });
      toast(`${t.names[0]} added. Rent of ${fmt(l.rent)} is now on the ledger.`);
    },
    saveTenant(t: Tenant) { mut((d) => { const i = d.tenants.findIndex((x) => x.id === t.id); if (i >= 0) d.tenants[i] = t; audit(d, 'Tenant updated', t.names.join(' & ')); }); },
    saveLease(l: Lease) { mut((d) => { const i = d.leases.findIndex((x) => x.id === l.id); if (i >= 0) d.leases[i] = l; audit(d, 'Lease updated', l.id); }); },
    endTenancy(leaseId: string, end: string) {
      mut((d) => {
        const l = d.leases.find((x) => x.id === leaseId); if (!l) return;
        l.end = end;
        const t = d.tenants.find((x) => x.id === l.tenantId); if (t) t.movedOut = end;
        const u = d.units.find((x) => x.id === l.unitId); if (u) u.status = 'vacant';
        audit(d, 'Tenancy ended', `${tenantName(d, leaseId)} on ${end}`);
      });
    },
    setPause(tenantId: string, reason?: string) {
      mut((d) => { const t = d.tenants.find((x) => x.id === tenantId); if (t) { t.remindersPaused = reason || undefined; audit(d, reason ? 'Reminders paused' : 'Reminders resumed', `${t.names[0]}${reason ? `: ${reason}` : ''}`); } });
    },

    // ---- Payments & receipts ----
    logPayment(p: Omit<Payment, 'id' | 'createdAt'>) {
      let auto = false;
      mut((d) => { recordPayment(d, p); auto = d.profile.autoSend; });
      toast(auto ? `Payment of ${fmt(p.amount)} logged. Receipt sent.` : `Payment of ${fmt(p.amount)} logged. Receipt drafted for your approval.`);
    },
    /** Edits never overwrite silently (RL-5): void the old payment, log a new one, supersede the receipt. */
    correctPayment(paymentId: string, changes: Partial<Pick<Payment, 'amount' | 'date' | 'period' | 'method' | 'note'>>) {
      mut((d) => {
        const old = d.payments.find((p) => p.id === paymentId); if (!old) return;
        old.voided = true;
        const oldR = d.receipts.find((r) => r.paymentId === paymentId && r.status !== 'superseded');
        const next = recordPayment(d, { ...old, ...changes, source: old.source });
        const newR = d.receipts.find((r) => r.paymentId === next.id)!;
        if (oldR) { oldR.status = 'superseded'; newR.supersedes = oldR.id; newR.note = `Replaces receipt #${oldR.number}`; }
        audit(d, 'Payment corrected', `Receipt #${oldR?.number ?? '—'} superseded`);
      });
      toast('Payment corrected. The old receipt is marked superseded.');
    },
    voidPayment(paymentId: string) {
      mut((d) => {
        const p = d.payments.find((x) => x.id === paymentId); if (!p) return;
        p.voided = true;
        for (const r of d.receipts) if (r.paymentId === paymentId) r.status = 'superseded';
        for (const t of d.txns) if (t.paymentId === paymentId) { t.status = 'new'; t.paymentId = undefined; }
        audit(d, 'Payment voided', `${fmt(p.amount)} for ${p.period}`);
      });
      toast('Payment undone. If it came from the bank feed, it is back in the tray.');
    },
    approveMessage(id: string, edit?: { subject: string; body: string }) {
      let text = '';
      mut((d) => {
        const m = d.messages.find((x) => x.id === id); if (!m) return;
        if (edit) { m.subject = edit.subject; m.body = edit.body; m.edited = true; }
        m.status = 'sent'; m.sentAt = new Date().toISOString();
        if (m.receiptId) { const r = d.receipts.find((x) => x.id === m.receiptId); if (r) { r.status = 'sent'; r.sentAt = m.sentAt; } }
        if (!edit) d.profile.approvedUnchanged += 1;
        const pay = d.payments.find((p) => p.id === d.receipts.find((r) => r.id === m.receiptId)?.paymentId);
        text = m.kind === 'receipt' ? `Receipt for ${fmt(pay?.amount ?? 0)} sent to ${tenantName(d, m.leaseId)}.` : `Reminder sent to ${tenantName(d, m.leaseId)}.`;
        audit(d, m.kind === 'receipt' ? 'Receipt sent' : 'Reminder sent', tenantName(d, m.leaseId));
      });
      toast(text);
    },
    sendReminder(lease: Lease, period: string, tone: Tone, edit?: { subject: string; body: string }) {
      mut((d) => {
        const draft = edit ?? reminderDraft(d, lease, period, tone, today());
        const now = new Date().toISOString();
        d.messages.push({ id: uid('msg'), kind: 'reminder', tenantId: lease.tenantId, leaseId: lease.id, period, tone, subject: draft.subject, body: draft.body, status: 'sent', edited: !!edit, createdAt: now, sentAt: now });
        if (!edit) d.profile.approvedUnchanged += 1;
        audit(d, 'Reminder sent', `${tone} to ${tenantName(d, lease.id)} for ${period}`);
      });
      toast(`Reminder sent. It stops the moment the payment is logged.`);
    },
    skipReminder(lease: Lease, period: string, tone: Tone) {
      mut((d) => { d.messages.push({ id: uid('msg'), kind: 'reminder', tenantId: lease.tenantId, leaseId: lease.id, period, tone, subject: '', body: '', status: 'cancelled', edited: false, createdAt: new Date().toISOString() }); });
    },
    discardMessage(id: string) { mut((d) => { const m = d.messages.find((x) => x.id === id); if (m) m.status = 'cancelled'; }); },
    setAutoSend(on: boolean) { mut((d) => { d.profile.autoSend = on; d.profile.autoSendOffered = true; audit(d, on ? 'Automatic receipts and reminders on' : 'Back to approving each message'); }); },

    // ---- Bank & email ----
    connectBank(bank: BankName) {
      mut((d) => {
        d.bank = { id: uid('bank'), bank, accountMask: `•••• ${Math.floor(1000 + Math.random() * 8999)}`, status: 'connected', lastSync: new Date().toISOString() };
        d.profile.rentArrival = 'bank';
        audit(d, 'Bank connected', `${bank} (read-only)`);
      });
      toast(`${bank} connected, read-only. Keyholder can see deposits but can never move money.`);
    },
    disconnectBank() { mut((d) => { audit(d, 'Bank disconnected', d.bank?.bank ?? ''); d.bank = undefined; }); },
    reauthBank() { mut((d) => { if (d.bank) { d.bank.status = 'connected'; d.bank.lastSync = new Date().toISOString(); } }); toast('Connection renewed.'); },
    /** Simulates a sync: deposits for some unpaid rent arrive, plus a bill. */
    syncBank() {
      let matched = 0, review = 0;
      mut((d) => {
        if (!d.bank) return;
        const t = today();
        const fresh: BankTxn[] = [];
        for (const u of d.units) {
          const l = activeLease(d, u.id, t); if (!l) continue;
          const open = leaseLedger(l, d.payments, t).filter((x) => x.paid < x.charge && x.due <= addDays(t, 3));
          const already = d.txns.some((x) => x.status === 'new' && x.amount === l.rent);
          if (!open.length || already || Math.random() < 0.35) continue;
          const ten = d.tenants.find((x) => x.id === l.tenantId)!;
          fresh.push({ id: uid('tx'), source: 'bank', date: t, amount: open[0].charge - open[0].paid, payer: ten.names[0].toUpperCase(), memo: 'rent', status: 'new' });
        }
        if (Math.random() < 0.6) fresh.push({ id: uid('tx'), source: 'bank', date: t, amount: -Math.round(4000 + Math.random() * 20000), payer: 'HOME DEPOT #7011', memo: 'Debit purchase', status: 'new' });
        for (const x of fresh) { d.txns.unshift(x); if (x.amount > 0) { if (autoMatch(d, x)) matched++; else review++; } }
        d.bank.lastSync = new Date().toISOString();
        audit(d, 'Bank synced', `${fresh.length} new transaction(s)`);
      });
      toast(matched + review === 0 ? 'Synced. No new rent deposits.' : `Synced. ${matched} matched automatically${review ? `, ${review} need a look` : ''}.`);
    },
    /** e-Transfer email forwarding path. */
    receiveTransferEmail(t: { payer: string; amount: number; memo: string; date: string }) {
      let ok = false;
      mut((d) => {
        const txn: BankTxn = { id: uid('tx'), source: 'email', ...t, status: 'new' };
        d.txns.unshift(txn);
        ok = autoMatch(d, txn);
        audit(d, 'e-Transfer email received', `${fmt(t.amount)} from ${t.payer}`);
      });
      toast(ok ? `${fmt(t.amount)} from ${t.payer} matched and logged.` : `${fmt(t.amount)} from ${t.payer} is in the tray for a look.`);
    },
    confirmMatch(txnId: string, leaseId: string, period: string, learnAlias: boolean) {
      mut((d) => {
        const t = d.txns.find((x) => x.id === txnId); if (!t) return;
        const lease = d.leases.find((l) => l.id === leaseId)!;
        const pay = recordPayment(d, { leaseId, period, amount: t.amount, date: t.date, method: lease.paymentMethod, source: t.source });
        t.status = 'matched'; t.paymentId = pay.id;
        if (learnAlias) {
          const ten = d.tenants.find((x) => x.id === lease.tenantId);
          if (ten && !ten.aliases.includes(t.payer) && !ten.names.some((n) => n.toLowerCase() === t.payer.toLowerCase())) ten.aliases.push(t.payer);
        }
      });
      toast('Matched. Payment logged and receipt drafted.');
    },
    ignoreTxn(id: string) { mut((d) => { const t = d.txns.find((x) => x.id === id); if (t) t.status = 'ignored'; }); },
    unignoreTxn(id: string) { mut((d) => { const t = d.txns.find((x) => x.id === id); if (t) t.status = 'new'; }); },

    // ---- Expenses ----
    saveExpense(e: Expense, fromTxn?: string) {
      mut((d) => {
        const i = d.expenses.findIndex((x) => x.id === e.id);
        if (i >= 0) d.expenses[i] = e; else d.expenses.unshift(e);
        d.expenses.sort((a, b) => b.date.localeCompare(a.date));
        if (fromTxn) { const t = d.txns.find((x) => x.id === fromTxn); if (t) { t.status = 'expense'; t.expenseId = e.id; } }
        audit(d, i >= 0 ? 'Expense updated' : 'Expense filed', `${fmt(e.amount)} ${e.vendor}`);
      });
      toast(`Filed: ${fmt(e.amount)} at ${e.vendor || 'unknown vendor'}.`);
    },
    deleteExpense(id: string) { mut((d) => { const e = d.expenses.find((x) => x.id === id); d.expenses = d.expenses.filter((x) => x.id !== id); for (const t of d.txns) if (t.expenseId === id) { t.status = 'new'; t.expenseId = undefined; } if (e) audit(d, 'Expense deleted', `${fmt(e.amount)} ${e.vendor}`); }); },

    // ---- Phase 2 ----
    addValuation(v: Omit<Valuation, 'id'>) { mut((d) => { d.valuations.push({ ...v, id: uid('v') }); audit(d, 'Valuation recorded', `${v.source} ${fmt(v.likely)}`); }); toast('Valuation saved to the history.'); },
    removeValuation(id: string) { mut((d) => { d.valuations = d.valuations.filter((v) => v.id !== id); }); },
    saveComparable(c: Comparable) { mut((d) => { const i = d.comparables.findIndex((x) => x.id === c.id); if (i >= 0) d.comparables[i] = c; else d.comparables.push(c); }); },
    removeComparable(id: string) { mut((d) => { d.comparables = d.comparables.filter((c) => c.id !== id); }); },

    // ---- Phase 3 ----
    saveMortgage(m: Mortgage) { mut((d) => { const i = d.mortgages.findIndex((x) => x.id === m.id); if (i >= 0) d.mortgages[i] = m; else d.mortgages.push(m); audit(d, 'Mortgage saved', `${m.lender} ${fmt(m.principal)}`); }); toast('Mortgage saved. Payments are now split into principal and interest.'); },
    removeMortgage(id: string) { mut((d) => { d.mortgages = d.mortgages.filter((m) => m.id !== id); audit(d, 'Mortgage removed'); }); },
  };
}

export type Actions = ReturnType<typeof makeActions>;

interface Ctx { state: AppState; act: Actions; today: string; toasts: { id: number; text: string }[] }
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const n = useRef(0);
  useEffect(() => save(state), [state]);

  const toast = useCallback((text: string) => {
    const id = ++n.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const mut: Mut = useCallback((fn) => setState((s) => { const d = structuredClone(s); fn(d); return d; }), []);
  const act = useMemo(() => makeActions(mut, toast), [mut, toast]);
  const today = todayISO();
  const value = useMemo(() => ({ state, act, today, toasts }), [state, act, today, toasts]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}

export function usePhase() {
  return useStore().state.profile.phase;
}

// Small selectors used across screens.
export function unitTenant(state: AppState, unitId: string, today: string) {
  const lease = activeLease(state, unitId, today);
  const tenant = lease ? state.tenants.find((t) => t.id === lease.tenantId) : undefined;
  return { lease, tenant };
}

export function currentLine(state: AppState, lease: Lease | undefined, today: string) {
  if (!lease) return undefined;
  const p = periodOf(today);
  return leaseLedger(lease, state.payments, today).find((l) => l.period === p) ?? { period: p, due: dueDate(p, lease.dueDay), charge: lease.rent, paid: 0, payments: [], state: 'upcoming' as const, daysLate: 0, balance: 0 };
}
