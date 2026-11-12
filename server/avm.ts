// Property values from an automated valuation model (AVM). The super user picks the provider and saves its
// key on Connections; the server asks the provider (the key never reaches the browser) and keeps each answer
// for 30 days per home, so the same home is not paid for twice in a month.
//
// Repliers (https://docs.repliers.io/reference/create-an-estimate):
//   POST https://api.repliers.io/estimates, API key in the REPLIERS-API-KEY header. The Estimates add-on must be
//   on for the key (403 otherwise). Required: address.city, streetName, streetNumber, zip, and details.numBedrooms,
//   numBathrooms, propertyType, sqft, style. propertyType and style must be values from the account's own MLS data,
//   listed by GET /listings?listings=false&aggregates=details.propertyType,details.style. boardId is needed when the
//   key covers more than one MLS board. The answer: estimate, estimateLow, estimateHigh (dollars) and confidence,
//   the predicted error (0.135 = about 13.5%, lower is better).
// Teranet and RPS publish their APIs to clients only: they are connected once their documentation is in hand.

/** What Repliers needs to value a home (the landlord fills in what Keyholder does not already know). */
export type AvmHome = {
  street: string; city: string; province: string; postalCode: string;
  propertyType: string; style: string; bedrooms: number; bathrooms: number; sqft: number; yearBuilt?: number;
};
export type AvmEstimate = { likely: number; low: number; high: number; confidence: 'low' | 'medium' | 'high'; errorPct: number | null; provider: string };
export type AvmOptions = { propertyTypes: string[]; styles: string[]; boards: string[] };
export class AvmError extends Error { constructor(message: string, public status = 502) { super(message); } }

export const PROVIDER_NAME: Record<string, string> = { repliers: 'Repliers Estimates', teranet: 'Teranet', rps: 'RPS Real Property Solutions' };
const BASE = 'https://api.repliers.io';

export async function avmEstimate(provider: string, key: string, fetcher: typeof fetch, home: AvmHome, opts: { base?: string; boardId?: string } = {}): Promise<AvmEstimate> {
  if (provider === 'repliers') return repliers(key, fetcher, home, opts.base ?? BASE, opts.boardId);
  throw notYet(provider);
}

/** The property types and styles the provider accepts (Repliers: the values in the account's MLS data). */
export async function avmOptions(provider: string, key: string, fetcher: typeof fetch, opts: { base?: string; boardId?: string } = {}): Promise<AvmOptions> {
  if (provider !== 'repliers') throw notYet(provider);
  const q = new URLSearchParams({ listings: 'false', aggregates: 'details.propertyType,details.style,boardId' });
  if (opts.boardId) q.set('boardId', opts.boardId);
  const r = await fetcher(`${opts.base ?? BASE}/listings?${q}`, { headers: { 'REPLIERS-API-KEY': key, Accept: 'application/json' } });
  const text = await r.text();
  let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) throw new AvmError(`Repliers: ${why(r.status, j, text)} (${r.status}).`, r.status === 401 || r.status === 403 ? 400 : 502);
  const ag = (j as { aggregates?: Record<string, unknown> } | null)?.aggregates ?? {};
  const details = (ag.details ?? {}) as Record<string, unknown>;
  const byCount = (o: unknown) => Object.entries((o ?? {}) as Record<string, number>).filter(([k]) => k && k !== 'null').sort((a, b) => (b[1] || 0) - (a[1] || 0)).map(([k]) => k);
  return { propertyTypes: byCount(details.propertyType), styles: byCount(details.style), boards: byCount(ag.boardId ?? ag.resource) };
}

const notYet = (provider: string) =>
  new AvmError(`${PROVIDER_NAME[provider] ?? provider} shares its API only with signed-up clients: send its API documentation to the Keyholder team to connect it. Repliers works now.`, 501);

// Street types as MLS boards write them ("160 Wellington Street" → number 160, name "Wellington", suffix "St").
const SUFFIX: Record<string, string> = {
  street: 'St', st: 'St', avenue: 'Ave', ave: 'Ave', av: 'Ave', road: 'Rd', rd: 'Rd', drive: 'Dr', dr: 'Dr', crescent: 'Cres', cres: 'Cres',
  court: 'Crt', crt: 'Crt', ct: 'Crt', boulevard: 'Blvd', blvd: 'Blvd', lane: 'Lane', ln: 'Lane', way: 'Way', place: 'Pl', pl: 'Pl',
  circle: 'Circ', circ: 'Circ', cir: 'Circ', trail: 'Trail', trl: 'Trail', terrace: 'Terr', terr: 'Terr', parkway: 'Pkwy', pkwy: 'Pkwy',
  square: 'Sq', sq: 'Sq', gate: 'Gate', line: 'Line', highway: 'Hwy', hwy: 'Hwy', grove: 'Grve', heights: 'Hts', hts: 'Hts', path: 'Path', row: 'Row',
};
const DIRECTION = /^(n|s|e|w|north|south|east|west|ne|nw|se|sw)\.?$/i;

/** "12-100 Queen St W" → unit 12, number 100, name "Queen", suffix "St" (the direction is left out: Repliers has no field for it). */
export function splitStreet(street: string) {
  const m = /^\s*(?:([A-Za-z0-9]+)\s*-\s*)?(\d+[A-Za-z]?)\s+(.+?)\s*$/.exec(street.replace(/[\r\n]+/g, ' '));
  if (!m) return { unitNumber: undefined, streetNumber: '', streetName: street.trim(), streetSuffix: undefined };
  const words = m[3].replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length > 1 && DIRECTION.test(words[words.length - 1])) words.pop();
  const last = words.length > 1 ? SUFFIX[words[words.length - 1].toLowerCase().replace(/\.$/, '')] : undefined;
  if (last) words.pop();
  return { unitNumber: m[1] || undefined, streetNumber: m[2], streetName: words.join(' '), streetSuffix: last };
}

async function repliers(key: string, fetcher: typeof fetch, h: AvmHome, base: string, boardId?: string): Promise<AvmEstimate> {
  const s = splitStreet(h.street);
  const clean = (v: string) => v.replace(/[\r\n]+/g, ' ').trim(); // no value may contain a newline
  const body = {
    address: { streetNumber: s.streetNumber, streetName: clean(s.streetName), ...(s.streetSuffix ? { streetSuffix: s.streetSuffix } : {}), ...(s.unitNumber ? { unitNumber: s.unitNumber } : {}), city: clean(h.city), zip: clean(h.postalCode).toUpperCase() },
    details: { numBedrooms: h.bedrooms, numBathrooms: h.bathrooms, propertyType: clean(h.propertyType), style: clean(h.style), sqft: Math.round(h.sqft), ...(h.yearBuilt ? { yearBuilt: h.yearBuilt } : {}) },
    ...(boardId && /^\d+$/.test(boardId) ? { boardId: Number(boardId) } : {}),
  };
  const r = await fetcher(`${base}/estimates`, { method: 'POST', headers: { 'REPLIERS-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) throw new AvmError(`Repliers: ${why(r.status, j, text)} (${r.status}).`, r.status === 401 || r.status === 403 ? 400 : r.status === 400 || r.status === 422 ? 422 : 502);
  const o = (j ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN);
  const value = num(o.estimate);
  if (!Number.isFinite(value) || value <= 0) throw new AvmError(`Repliers answered without a value: ${text.slice(0, 200)}`);
  const low = num(o.estimateLow), high = num(o.estimateHigh), err = num(o.confidence);
  const errorPct = Number.isFinite(err) ? Math.round((err > 1 ? err : err * 100) * 10) / 10 : null;
  const confidence: AvmEstimate['confidence'] = errorPct === null ? 'medium' : errorPct <= 10 ? 'high' : errorPct <= 20 ? 'medium' : 'low';
  const cents = (d: number) => Math.round(d * 100);
  return { likely: cents(value), low: cents(Number.isFinite(low) ? low : value * 0.92), high: cents(Number.isFinite(high) ? high : value * 1.08), confidence, errorPct, provider: PROVIDER_NAME.repliers };
}

// Repliers' errors: [[{ param, msg }]] (400, 401), or a message.
const FIELD: Record<string, string> = {
  'address.zip': 'Postal code', 'address.streetNumber': 'Street number', 'address.streetName': 'Street name', 'address.city': 'City',
  'details.propertyType': 'Property type', 'details.style': 'Style', 'details.sqft': 'Square feet', 'details.numBedrooms': 'Bedrooms',
  'details.numBathrooms': 'Bathrooms', 'details.yearBuilt': 'Year built', boardId: 'Board ID',
};
function why(status: number, j: unknown, text: string): string {
  if (status === 403) return 'the Estimates add-on is not on for this API key (ask Repliers support to turn it on)';
  if (status === 401) return 'the API key is not recognized, or not active';
  const flat: { param?: string; msg?: string; message?: string }[] = [];
  const walk = (x: unknown) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') flat.push(x as never); };
  walk(j);
  const parts = flat.map((e) => {
    const m = e.msg ?? e.message ?? (e as { error?: string }).error;
    if (!m) return '';
    return e.param ? `${FIELD[e.param] ?? e.param}: ${m}` : String(m);
  }).filter(Boolean);
  return parts.length ? parts.join('; ') : text.slice(0, 200) || 'no answer';
}
