import type { Cents, ExpenseCategory, ISODate } from '../data/types';

// Turns the text read from a receipt photo into the expense form's fields: total, date, store and type.
// Rules: only fill what the receipt says. The total comes from a line that says it is the total (or what
// was paid by card or cash), never from "the biggest number". A date in the future or more than three
// years ago is ignored. Anything not found is left empty for the landlord to type.

export interface ReceiptGuess { amount?: Cents; date?: ISODate; vendor?: string; category?: ExpenseCategory; found: ('amount' | 'date' | 'vendor' | 'category')[] }

const MONEY = /(?:\$\s*)?(\d{1,3}(?:[ ,]\d{3})+|\d+)\s?[.,]\s?(\d{2})(?!\d)\s*\$?/g;

/** Every money amount on a line, in cents, left to right. Handles "1,234.56", "86.45", "86,45 $" (French). */
export function amountsIn(line: string): Cents[] {
  const out: Cents[] = [];
  // Common misreads inside numbers: O → 0, l / I → 1, S → 5 (only when surrounded by digits).
  const clean = line.replace(/(?<=\d)[Oo](?=[\d.,])|(?<=\d[.,])[Oo]|(?<=[.,]\d)[Oo]/g, '0').replace(/(?<=\d)[lI](?=[\d.,])|(?<=\d[.,])[lI]|(?<=[.,]\d)[lI]/g, '1').replace(/(?<=\d)S(?=\d)/g, '5');
  for (const m of clean.matchAll(MONEY)) {
    const whole = m[1].replace(/[ ,]/g, '');
    const cents = Number(whole) * 100 + Number(m[2]);
    if (Number.isFinite(cents)) out.push(cents);
  }
  return out;
}

const TOTAL = /\b(grand\s*total|total\s*(?:due|amount|à\s*payer|a\s*payer|payable)?|amount\s*(?:due|paid)|balance\s*(?:due)?|montant(?:\s*(?:total|dû|du|payé))?|net\s*total|total\s*cad)\b/i;
const NOT_TOTAL = /sub\s*-?\s*total|sous\s*-?\s*total|saving|discount|rabais|économ|\btax(es)?\b|\bhst\b|\bgst\b|\bpst\b|\bqst\b|\btps\b|\btvq\b|items?\b|articles?\b|qty|points|before\s+tax|avant\s+tax|tip\b|pourboire/i;
const PAID = /\b(visa|master\s*card|mastercard|mc\b|debit|débit|interac|amex|american\s*express|cash\s*tend\w*|tendered|comptant|paid\s+by|payé)\b/i;
const CHANGE = /\b(change|monnaie|rendu)\b/i;

/** The receipt's total: from total lines; failing that, from what was paid. Nothing if neither is there. */
export function findTotal(lines: string[]): Cents | undefined {
  const totals: Cents[] = [];
  lines.forEach((l, i) => {
    if (!TOTAL.test(l) || NOT_TOTAL.test(l)) return;
    const here = amountsIn(l);
    const v = here.length ? here[here.length - 1] : amountsIn(lines[i + 1] ?? '')[0];
    if (v) totals.push(v);
  });
  const ok = (c: Cents) => c > 0 && c < 10_000_000;
  if (totals.filter(ok).length) return Math.max(...totals.filter(ok));
  const paid = lines.filter((l) => PAID.test(l) && !CHANGE.test(l)).flatMap((l) => amountsIn(l)).filter(ok);
  return paid.length ? Math.max(...paid) : undefined;
}

const MONTHS: [RegExp, number][] = [
  [/^(jan|janv)/i, 1], [/^(feb|fév|fev)/i, 2], [/^(mar)/i, 3], [/^(apr|avr)/i, 4], [/^(may|mai)/i, 5], [/^(jun|juin)/i, 6],
  [/^(jul|juil)/i, 7], [/^(aug|aoû|aou)/i, 8], [/^(sep)/i, 9], [/^(oct)/i, 10], [/^(nov)/i, 11], [/^(dec|déc)/i, 12],
];
const monthNo = (w: string) => MONTHS.find(([re]) => re.test(w))?.[1];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function real(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** The purchase date. Day/month order is ambiguous in Canada (10/11/2026): the most recent possible date wins. */
export function findDate(text: string, today: ISODate): ISODate | undefined {
  const cands: ISODate[] = [];
  const add = (y: number, m: number, d: number) => { if (y < 100) y += 2000; if (real(y, m, d)) cands.push(iso(y, m, d)); };
  for (const m of text.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) add(+m[1], +m[2], +m[3]);
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.]((?:20)?\d{2})\b/g)) { add(+m[3], +m[2], +m[1]); add(+m[3], +m[1], +m[2]); }
  for (const m of text.matchAll(/\b([A-Za-zÀ-ÿ]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g)) { const mo = monthNo(m[1]); if (mo) add(+m[3], mo, +m[2]); }
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,9})\.?,?\s+(20\d{2})\b/g)) { const mo = monthNo(m[2]); if (mo) add(+m[3], mo, +m[1]); }
  const earliest = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
  const ok = cands.filter((d) => d <= today && d >= earliest).sort();
  return ok.length ? ok[ok.length - 1] : undefined;
}

/** Well-known Canadian stores and billers, with the expense type they usually are. */
const STORES: [RegExp, string, ExpenseCategory][] = [
  [/home\s*depot/i, 'Home Depot', 'repairs'], [/lowe'?s/i, "Lowe's", 'repairs'], [/\brona\b/i, 'RONA', 'repairs'], [/home\s*hardware/i, 'Home Hardware', 'repairs'],
  [/canadian\s*tire/i, 'Canadian Tire', 'repairs'], [/princess\s*auto/i, 'Princess Auto', 'repairs'], [/\bkent\b/i, 'Kent', 'repairs'], [/sherwin/i, 'Sherwin-Williams', 'repairs'],
  [/benjamin\s*moore/i, 'Benjamin Moore', 'repairs'], [/\btimber\s*mart/i, 'Timber Mart', 'repairs'], [/castle\s*building/i, 'Castle Building Centres', 'repairs'],
  [/walmart/i, 'Walmart', 'supplies'], [/costco/i, 'Costco', 'supplies'], [/dollarama/i, 'Dollarama', 'supplies'], [/\bikea\b/i, 'IKEA', 'supplies'],
  [/best\s*buy/i, 'Best Buy', 'supplies'], [/amazon/i, 'Amazon', 'supplies'], [/giant\s*tiger/i, 'Giant Tiger', 'supplies'],
  [/staples|bureau\s*en\s*gros/i, 'Staples', 'office'], [/canada\s*post|postes\s*canada/i, 'Canada Post', 'office'], [/ups\s*store/i, 'The UPS Store', 'office'],
  [/enbridge/i, 'Enbridge', 'utilities'], [/hydro\s*one/i, 'Hydro One', 'utilities'], [/toronto\s*hydro/i, 'Toronto Hydro', 'utilities'], [/alectra/i, 'Alectra', 'utilities'],
  [/hydro\s*ottawa/i, 'Hydro Ottawa', 'utilities'], [/bc\s*hydro/i, 'BC Hydro', 'utilities'], [/hydro[-\s]*qu[ée]bec/i, 'Hydro-Québec', 'utilities'], [/fortis/i, 'FortisBC', 'utilities'],
  [/epcor/i, 'EPCOR', 'utilities'], [/enmax/i, 'ENMAX', 'utilities'], [/\batco\b/i, 'ATCO', 'utilities'], [/saskpower/i, 'SaskPower', 'utilities'], [/manitoba\s*hydro/i, 'Manitoba Hydro', 'utilities'],
  [/nb\s*power/i, 'NB Power', 'utilities'], [/nova\s*scotia\s*power/i, 'Nova Scotia Power', 'utilities'], [/\brogers\b/i, 'Rogers', 'utilities'], [/\bbell\b/i, 'Bell', 'utilities'],
  [/telus/i, 'TELUS', 'utilities'], [/\bshaw\b/i, 'Shaw', 'utilities'], [/vid[ée]otron/i, 'Vidéotron', 'utilities'],
  [/\bshell\b/i, 'Shell', 'vehicle'], [/\besso\b/i, 'Esso', 'vehicle'], [/petro[-\s]*canada/i, 'Petro-Canada', 'vehicle'], [/ultramar/i, 'Ultramar', 'vehicle'], [/\bhusky\b/i, 'Husky', 'vehicle'], [/\bchevron\b/i, 'Chevron', 'vehicle'],
  [/intact\s*insurance/i, 'Intact Insurance', 'insurance'], [/\baviva\b/i, 'Aviva', 'insurance'], [/co-?operators/i, 'The Co-operators', 'insurance'], [/square\s*one\s*insurance/i, 'Square One', 'insurance'],
  [/kijiji/i, 'Kijiji', 'advertising'], [/rentals\.ca/i, 'Rentals.ca', 'advertising'],
];
const KEYWORDS: [RegExp, ExpenseCategory][] = [
  [/property\s*tax|tax\s*bill|taxes\s*fonci|interim\s*tax|final\s*tax/i, 'property-tax'],
  [/insurance|assurance|policy\s*(no|number)/i, 'insurance'],
  [/hydro|electricit|natural\s*gas|water\s*(bill|service)|kwh|m3\b/i, 'utilities'],
  [/plumb|electrician|furnace|hvac|roof|drywall|paint|lumber|hardware|repair|handyman|snow|lawn|landscap|pest|exterminat|locksmith|clean/i, 'repairs'],
  [/postage|stamp|printing|toner|ink\b|envelope/i, 'office'],
  [/gasoline|essence|diesel|fuel|parking|stationnement/i, 'vehicle'],
  [/advertis|listing\s*fee/i, 'advertising'],
  [/lawyer|paralegal|notar|accountant|cpa\b|legal\s*fee/i, 'professional'],
];
const NOT_NAME = /receipt|reçu|welcome|bienvenue|thank|merci|store\s*#|magasin|\btel\b|phone|www\.|http|\.com|invoice|facture|date|cashier|caissi|order|commande|hst|gst|tps|tvq|^\W*\d|transaction|terminal|approved|approuv/i;

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-zà-ÿ])/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim();
}

/** Store name and expense type: a known store anywhere in the text, else the first name-like line at the top. */
export function findStore(lines: string[]): { vendor?: string; category?: ExpenseCategory } {
  const text = lines.join('\n');
  for (const [re, name, cat] of STORES) if (re.test(text)) return { vendor: name, category: cat };
  const top = lines.slice(0, 5).map((l) => l.trim()).find((l) => {
    const letters = (l.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    return letters >= 4 && letters / l.replace(/\s/g, '').length > 0.7 && !NOT_NAME.test(l) && l.length <= 40;
  });
  const category = KEYWORDS.find(([re]) => re.test(text))?.[1];
  return { vendor: top ? titleCase(top.replace(/[^A-Za-zÀ-ÿ0-9&'.\- ]/g, ' ')) : undefined, category };
}

/** Everything at once, from the text read off the photo. */
export function readReceipt(text: string, today: ISODate): ReceiptGuess {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const amount = findTotal(lines);
  const date = findDate(text, today);
  const { vendor, category } = findStore(lines);
  const found: ReceiptGuess['found'] = [];
  if (amount) found.push('amount');
  if (date) found.push('date');
  if (vendor) found.push('vendor');
  if (category) found.push('category');
  return { amount, date, vendor, category, found };
}
