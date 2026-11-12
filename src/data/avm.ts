import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AppState, HomeFacts, Property, Valuation } from './types';
import { api, getConn, serverMode } from './api';
import { todayISO } from '../lib/dates';

// Property values from the connected provider (Repliers Estimates), through the server (the key never reaches
// the browser). Repliers values the whole home from its address and a few facts: postal code, bedrooms,
// bathrooms, square feet, and the property type and style as the MLS board writes them. No purchase price needed.

/** The live site with a provider connected on the dashboard's Connections page. */
export const avmOn = () => serverMode() && !!getConn().config?.avm;

export const POSTAL = /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/;

/** The home's facts, with bedrooms from its units until the landlord says otherwise. */
export function homeFacts(state: AppState, p: Property): HomeFacts {
  const unitBeds = state.units.filter((u) => u.propertyId === p.id).reduce((n, u) => n + (u.bedrooms || 0), 0);
  return { ...p.home, bedrooms: p.home?.bedrooms ?? (unitBeds || undefined) };
}

/** What is still needed before the provider can value the home. */
export function missingFacts(state: AppState, p: Property): string[] {
  const h = homeFacts(state, p);
  const out: string[] = [];
  if (!p.address.trim() || !p.city) out.push('address');
  if (!p.postalCode || !POSTAL.test(p.postalCode.trim())) out.push('postal code');
  if (h.bedrooms === undefined) out.push('bedrooms');
  if (!h.bathrooms) out.push('bathrooms');
  if (!h.sqft) out.push('square feet');
  if (!h.mlsType) out.push('property type');
  if (!h.style) out.push('style');
  return out;
}

// ---------- Asking, and what went wrong (kept in this browser, not in the account) ----------
type Status = { state: 'asking' } | { state: 'error'; message: string };
const status = new Map<string, Status>();
const asked = new Set<string>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const useAvmStatus = (propertyId: string) => useSyncExternalStore(subscribe, () => status.get(propertyId), () => status.get(propertyId));
export const askedThisSession = (propertyId: string) => asked.has(propertyId);

type AddValuation = (v: Omit<Valuation, 'id'>, quiet?: boolean) => void;
type Answer = { likely: number; low: number; high: number; confidence: Valuation['confidence']; errorPct: number | null; provider: string; date: string };

/** Asks the provider for the home's value and saves it to the value history. The reason is kept if it fails. */
export async function askValue(state: AppState, p: Property, addValuation: AddValuation, quiet = true): Promise<boolean> {
  if (status.get(p.id)?.state === 'asking') return false;
  asked.add(p.id);
  const h = homeFacts(state, p);
  status.set(p.id, { state: 'asking' }); emit();
  try {
    const r = await api<Answer>('POST', '/api/valuation', {
      street: p.address, city: p.city, province: p.province, postalCode: (p.postalCode ?? '').trim().toUpperCase(),
      propertyType: h.mlsType, style: h.style, bedrooms: h.bedrooms, bathrooms: h.bathrooms, sqft: h.sqft, ...(h.yearBuilt ? { yearBuilt: h.yearBuilt } : {}),
    });
    addValuation({ propertyId: p.id, date: r.date || todayISO(), source: 'avm', low: r.low, likely: r.likely, high: r.high, confidence: r.confidence, note: r.provider, ...(r.errorPct !== null && r.errorPct !== undefined ? { errorPct: r.errorPct } : {}) }, quiet);
    status.delete(p.id); emit();
    return true;
  } catch (e) {
    status.set(p.id, { state: 'error', message: (e as Error).message || 'The value service did not answer.' }); emit();
    return false;
  }
}

// ---------- The property types and styles the provider accepts (from the account's MLS data) ----------
export type AvmChoices = { propertyTypes: string[]; styles: string[] };
let choices: Promise<AvmChoices> | null = null;

export function useAvmChoices(): { choices: AvmChoices | null; error: string | null } {
  const [out, setOut] = useState<{ choices: AvmChoices | null; error: string | null }>({ choices: null, error: null });
  useEffect(() => {
    if (!avmOn()) return;
    let live = true;
    choices ??= api<AvmChoices>('GET', '/api/valuation/options');
    choices.then((c) => live && setOut({ choices: c, error: null }), (e: Error) => { choices = null; if (live) setOut({ choices: null, error: e.message }); });
    return () => { live = false; };
  }, []);
  return out;
}

/** A sensible first pick from the MLS board's list for Keyholder's property type. */
export function guessType(list: string[], type: Property['type']): string | undefined {
  const want: Record<string, RegExp> = { house: /^(detached|house|single)/i, duplex: /duplex/i, triplex: /triplex|multiplex/i, condo: /condo|apartment/i, townhouse: /town|row/i };
  const re = want[type];
  return (re && list.find((x) => re.test(x) && !/semi/i.test(x))) ?? undefined;
}
