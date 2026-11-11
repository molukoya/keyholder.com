import { useEffect, useState } from 'react';
import { api, serverMode } from './api';
import { DEFAULT_UNIT_CENTS } from '../support/data';
import { localPlatform } from '../support/store';

// The Landlord plan price per unit a month, set by the super user (Support → Price & promotions).
// The live site asks the server; the browser-only preview uses the sample dashboard's setting.

let cached: number | null = null;
export function useUnitPrice(): number {
  const [cents, setCents] = useState(() => cached ?? (serverMode() ? DEFAULT_UNIT_CENTS : localPlatform()?.unitCents ?? DEFAULT_UNIT_CENTS));
  useEffect(() => {
    if (!serverMode()) return;
    api<{ unitCents: number }>('GET', '/api/pricing').then((r) => { cached = r.unitCents; setCents(r.unitCents); }).catch(() => { /* keep the default */ });
  }, []);
  return cents;
}
/** $8 for whole dollars, $8.50 otherwise. */
export const fmtPrice = (cents: number) => `$${cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)}`;
