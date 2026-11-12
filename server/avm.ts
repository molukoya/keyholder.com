// Property values from an automated valuation model (AVM). The super user picks the provider and saves its
// key on Connections; the server asks the provider (the key never reaches the browser) and keeps each answer
// for 30 days per address, so the same home is not paid for twice in a month.
//
// Repliers: POST https://api.repliers.io/estimates with the REPLIERS-API-KEY header (the Estimates add-on must
// be on in the Repliers account). The answer is read defensively (value, low/high range, confidence), and any
// error is passed on word for word so it can be fixed from the Connections page's Test button.
// Teranet and RPS publish their APIs to clients only: they are connected once their documentation is in hand.

export type AvmAddress = { street: string; city: string; province: string; postalCode?: string; lat?: number | null; lng?: number | null; type?: string; bedrooms?: number };
export type AvmEstimate = { likely: number; low: number; high: number; confidence: 'low' | 'medium' | 'high'; provider: string };
export class AvmError extends Error { constructor(message: string, public status = 502) { super(message); } }

export const PROVIDER_NAME: Record<string, string> = { repliers: 'Repliers Estimates', teranet: 'Teranet', rps: 'RPS Real Property Solutions' };

export async function avmEstimate(provider: string, key: string, fetcher: typeof fetch, a: AvmAddress, base?: string): Promise<AvmEstimate> {
  if (provider === 'repliers') return repliers(key, fetcher, a, base ?? 'https://api.repliers.io');
  throw new AvmError(`${PROVIDER_NAME[provider] ?? provider} shares its API only with signed-up clients: send its API documentation to the Keyholder team to connect it. Repliers works now.`, 501);
}

const TYPE: Record<string, string> = { house: 'Detached', duplex: 'Duplex', triplex: 'Triplex', condo: 'Condo Apt', townhouse: 'Att/Row/Townhouse' };

async function repliers(key: string, fetcher: typeof fetch, a: AvmAddress, base: string): Promise<AvmEstimate> {
  // "12-100 Queen St W" → unit 12, number 100, street "Queen St W".
  const m = /^\s*(?:([A-Za-z0-9]+)\s*-\s*)?(\d+[A-Za-z]?)\s+(.+?)\s*$/.exec(a.street);
  const body = {
    address: { streetNumber: m?.[2] ?? '', streetName: m?.[3] ?? a.street, unitNumber: m?.[1] ?? undefined, city: a.city, state: a.province, zip: a.postalCode || undefined, country: 'CA' },
    ...(a.lat != null && a.lng != null ? { map: { latitude: a.lat, longitude: a.lng } } : {}),
    details: { propertyType: TYPE[a.type ?? ''] ?? undefined, numBedrooms: a.bedrooms ?? undefined },
  };
  const r = await fetcher(`${base}/estimates`, { method: 'POST', headers: { 'REPLIERS-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) {
    const why = r.status === 403 ? 'the Estimates add-on is not on for this key (turn it on in your Repliers account)' : r.status === 401 ? 'the API key is not right' : message(j) ?? text.slice(0, 160);
    throw new AvmError(`Repliers: ${why} (${r.status}).`, r.status === 401 || r.status === 403 ? 400 : 502);
  }
  const est = pick(j);
  if (!est) throw new AvmError(`Repliers answered without a value: ${text.slice(0, 200)}`);
  return { ...est, provider: PROVIDER_NAME.repliers };
}

const message = (j: unknown): string | undefined => {
  if (!j || typeof j !== 'object') return undefined;
  const o = j as Record<string, unknown>;
  const m = o.message ?? o.error ?? o.errors;
  return typeof m === 'string' ? m : Array.isArray(m) ? m.map((x) => (typeof x === 'string' ? x : (x as { msg?: string; message?: string })?.msg ?? (x as { message?: string })?.message ?? '')).filter(Boolean).join('; ') : undefined;
};

/** Finds the value, range and confidence in the provider's answer (dollars), whatever the nesting. */
function pick(j: unknown): Omit<AvmEstimate, 'provider'> | null {
  const found: Record<'value' | 'high' | 'low' | 'conf', unknown> = { value: undefined, high: undefined, low: undefined, conf: undefined };
  const VALUE = /^(estimate|estimatedValue|estimateValue|value|prediction|predictedValue|price)$/i, HIGH = /^(estimateHigh|high|upper|max|rangeHigh|highEstimate)$/i, LOW = /^(estimateLow|low|lower|min|rangeLow|lowEstimate)$/i, CONF = /confidence/i;
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== 'object' || depth > 5) return;
    if (Array.isArray(o)) { if (o.length) walk(o[0], depth + 1); return; }
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === 'payload') continue; // what was sent, echoed back
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
      if (Number.isFinite(n)) {
        if (found.value === undefined && VALUE.test(k) && n > 1000) found.value = n;
        else if (found.high === undefined && HIGH.test(k) && n > 1000) found.high = n;
        else if (found.low === undefined && LOW.test(k) && n > 1000) found.low = n;
      }
      if (found.conf === undefined && CONF.test(k) && (typeof v === 'number' || typeof v === 'string')) found.conf = v;
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(j, 0);
  const value = found.value as number | undefined;
  if (!value) return null;
  const c = found.conf;
  const confidence: AvmEstimate['confidence'] = typeof c === 'string' ? (/high/i.test(c) ? 'high' : /low/i.test(c) ? 'low' : 'medium')
    : typeof c === 'number' ? ((c > 1 ? c / 100 : c) >= 0.8 ? 'high' : (c > 1 ? c / 100 : c) >= 0.5 ? 'medium' : 'low') : 'medium';
  const cents = (d: number) => Math.round(d * 100);
  return { likely: cents(value), low: cents((found.low as number | undefined) ?? value * 0.92), high: cents((found.high as number | undefined) ?? value * 1.08), confidence };
}
