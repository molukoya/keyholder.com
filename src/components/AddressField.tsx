import { useEffect, useRef, useState } from 'react';
import { api, getConn } from '../data/api';
import { Icon } from './Icon';

// A street-address box that suggests Canadian addresses as you type (Google Places, through the Keyholder
// server, which keeps the key). Picking one fills in the city, province, postal code and map position.
// Without a key it is a plain box. The browser-only preview suggests from a few sample addresses.

export type PickedAddress = { street: string; city: string; province: string; postalCode: string; lat: number | null; lng: number | null };
type Suggestion = { id: string; main: string; secondary: string };

/** Address suggestions are on: always in the preview; on the live site once the super user adds the key. */
export const addressLookupOn = () => getConn().mode !== 'server' || !!getConn().config?.addressLookup;

// Public buildings (city halls and landmarks) for the preview, so no one's home is used as an example.
const SAMPLES: (Suggestion & PickedAddress)[] = [
  { id: 's1', main: '100 Queen St W', secondary: 'Toronto, ON M5H 2N2', street: '100 Queen St W', city: 'Toronto', province: 'ON', postalCode: 'M5H 2N2', lat: 43.6535, lng: -79.3841 },
  { id: 's2', main: '301 Front St W', secondary: 'Toronto, ON M5V 2T6', street: '301 Front St W', city: 'Toronto', province: 'ON', postalCode: 'M5V 2T6', lat: 43.6426, lng: -79.3871 },
  { id: 's3', main: '110 Laurier Ave W', secondary: 'Ottawa, ON K1P 1J1', street: '110 Laurier Ave W', city: 'Ottawa', province: 'ON', postalCode: 'K1P 1J1', lat: 45.4207, lng: -75.69 },
  { id: 's4', main: '453 W 12th Ave', secondary: 'Vancouver, BC V5Y 1V4', street: '453 W 12th Ave', city: 'Vancouver', province: 'BC', postalCode: 'V5Y 1V4', lat: 49.2609, lng: -123.1139 },
  { id: 's5', main: '800 Macleod Trail SE', secondary: 'Calgary, AB T2G 2M3', street: '800 Macleod Trail SE', city: 'Calgary', province: 'AB', postalCode: 'T2G 2M3', lat: 51.0453, lng: -114.0581 },
  { id: 's6', main: '1 Sir Winston Churchill Sq', secondary: 'Edmonton, AB T5J 2R7', street: '1 Sir Winston Churchill Sq', city: 'Edmonton', province: 'AB', postalCode: 'T5J 2R7', lat: 53.5444, lng: -113.4909 },
  { id: 's7', main: '275 Notre-Dame St E', secondary: 'Montréal, QC H2Y 1C6', street: '275 Notre-Dame St E', city: 'Montréal', province: 'QC', postalCode: 'H2Y 1C6', lat: 45.5088, lng: -73.554 },
  { id: 's8', main: '510 Main St', secondary: 'Winnipeg, MB R3B 1B9', street: '510 Main St', city: 'Winnipeg', province: 'MB', postalCode: 'R3B 1B9', lat: 49.8994, lng: -97.1378 },
  { id: 's9', main: '2476 Victoria Ave', secondary: 'Regina, SK S4P 3C8', street: '2476 Victoria Ave', city: 'Regina', province: 'SK', postalCode: 'S4P 3C8', lat: 50.4488, lng: -104.615 },
  { id: 's10', main: '1841 Argyle St', secondary: 'Halifax, NS B3J 3A5', street: '1841 Argyle St', city: 'Halifax', province: 'NS', postalCode: 'B3J 3A5', lat: 44.6488, lng: -63.5752 },
];
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const newSession = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

export function AddressField({ id, value, onChange, onPick }: { id: string; value: string; onChange: (v: string) => void; onPick: (a: PickedAddress) => void }) {
  const on = addressLookupOn();
  const preview = getConn().mode !== 'server';
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false);
  const session = useRef(newSession());
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  // Ask for suggestions a moment after typing stops (3+ characters).
  useEffect(() => {
    if (!on || !typed) return;
    const q = value.trim();
    if (q.length < 3) { setItems([]); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      let list: Suggestion[] = [];
      if (preview) {
        const words = fold(q).split(/[\s,]+/).filter(Boolean);
        list = SAMPLES.filter((x) => { const hay = fold(`${x.main} ${x.secondary}`); return words.every((w) => hay.includes(w)); }).slice(0, 5);
      } else {
        try { list = (await api<{ suggestions: Suggestion[] }>('GET', `/api/address/suggest?q=${encodeURIComponent(q)}&session=${session.current}`)).suggestions; } catch { list = []; }
      }
      if (n !== seq.current) return; // a newer search is on its way
      setItems(list); setActive(-1); setOpen(list.length > 0);
    }, preview ? 120 : 250);
    return () => clearTimeout(t);
  }, [value, typed, on, preview]);
  useEffect(() => {
    const k = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', k); return () => document.removeEventListener('mousedown', k);
  }, []);

  const pick = async (s: Suggestion) => {
    setOpen(false); setTyped(false);
    let a: PickedAddress | null = null;
    if (preview) a = SAMPLES.find((x) => x.id === s.id) ?? null;
    else {
      try { a = await api<PickedAddress & { country: string }>('GET', `/api/address/details?id=${encodeURIComponent(s.id)}&session=${session.current}`); } catch { a = null; }
      session.current = newSession(); // one session per address picked (how Google bills it)
    }
    if (a) onPick(a); else onChange(s.main);
  };
  const listId = `${id}-list`;
  return (
    <div className="addr" ref={box}>
      <input id={id} className="input" value={value} autoComplete={on ? 'off' : 'street-address'}
        role={on ? 'combobox' : undefined} aria-expanded={on ? open : undefined} aria-controls={on ? listId : undefined} aria-autocomplete={on ? 'list' : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={on ? 'Start typing, then pick the address' : undefined}
        onChange={(e) => { onChange(e.target.value); setTyped(true); }}
        onFocus={() => { if (items.length && typed) setOpen(true); }}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); void pick(items[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && (
        <ul className="addr-list" id={listId} role="listbox">
          {items.map((s, i) => (
            <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(s)}>
                <Icon name="pin" size={16} /><span><strong>{s.main}</strong><span>{s.secondary}</span></span>
              </button>
            </li>
          ))}
          <li className="addr-foot" aria-hidden>{preview ? 'Preview: sample addresses' : 'powered by Google'}</li>
        </ul>
      )}
    </div>
  );
}
