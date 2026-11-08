import { useEffect, useId, useState } from 'react';

// Keyholder's own logo: a K whose upright is a key (notches at the foot), and three wordmark versions.
// The chosen version is remembered in this browser until one is picked for good.

export type WordmarkId = 'a' | 'b' | 'c';
export const WORDMARKS: { id: WordmarkId; name: string; note: string }[] = [
  { id: 'a', name: 'Key K', note: 'The K is drawn as a key: its upright ends in notches.' },
  { id: 'b', name: 'Key ring', note: 'Lowercase, with the first “o” drawn as the key ring.' },
  { id: 'c', name: 'Badge', note: 'The K-key badge with a wide, confident wordmark.' },
];
const KEY = 'keyholder:wordmark';
const listeners = new Set<(v: WordmarkId) => void>();
function readChoice(): WordmarkId { try { const v = localStorage.getItem(KEY); return v === 'b' || v === 'c' ? v : 'a'; } catch { return 'a'; } }
export function setWordmark(v: WordmarkId) { try { localStorage.setItem(KEY, v); } catch { /* storage blocked */ } listeners.forEach((f) => f(v)); }
export function useWordmark() {
  const [v, setV] = useState<WordmarkId>(readChoice);
  useEffect(() => { listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}

/** The app icon: the K-key on an indigo-to-violet tile. */
export function KeyMark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="keymark">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4F46E5" /><stop offset=".6" stopColor="#7C3AED" /><stop offset="1" stopColor="#38BDF8" /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#g${id})`} />
      <KGlyph x={8.6} y={7} h={18} color="#fff" />
    </svg>
  );
}

/** The K-key glyph: key shaft with two notches, and the K's arms. Drawn in a box of height h. */
function KGlyph({ x, y, h, color }: { x: number; y: number; h: number; color: string }) {
  const s = h / 19, w = 4.6 * s;
  return (
    <g fill={color} transform={`translate(${x} ${y})`}>
      <rect x={0} y={0} width={w} height={h} rx={1.2 * s} />
      <rect x={-3.2 * s} y={11.4 * s} width={3.6 * s} height={3 * s} rx={.8 * s} />
      <rect x={-3.2 * s} y={15.8 * s} width={3.6 * s} height={3.2 * s} rx={.8 * s} />
      <path d={`M${w - .4 * s} ${9.4 * s} L${11.6 * s} 0 L${17.4 * s} 0 L${w + 5 * s} ${8.4 * s} L${17.6 * s} ${h} L${11.8 * s} ${h} L${w + .8 * s} ${12.2 * s} Z`} />
    </g>
  );
}

/** Inline K-key letter that sits in a line of text (for wordmark A). */
function KLetter() {
  return (
    <svg className="wm-k" viewBox="-3.4 0 21.2 19" aria-hidden><KGlyph x={0} y={0} h={19} color="currentColor" /></svg>
  );
}
/** The key ring "o" (for wordmark B). */
function RingO() {
  return (
    <svg className="wm-o" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="7" fill="none" stroke="url(#wm-grad)" strokeWidth="3.8" />
      <circle cx="10" cy="10" r="1.9" fill="currentColor" />
      <defs><linearGradient id="wm-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4F46E5" /><stop offset="1" stopColor="#7C3AED" /></linearGradient></defs>
    </svg>
  );
}

export function Wordmark({ variant }: { variant: WordmarkId }) {
  if (variant === 'a') return <span className="wm wm-a" aria-label="Keyholder"><KLetter /><span aria-hidden>eyholder</span></span>;
  if (variant === 'b') return <span className="wm wm-b" aria-label="Keyholder"><span aria-hidden>keyh</span><RingO /><span aria-hidden>lder</span></span>;
  return <span className="wm wm-c" aria-label="Keyholder">KEYHOLDER</span>;
}

/** Logo as used across the product: icon + wordmark (A carries its own K, so no icon). */
export function Brand({ size = 26, variant }: { size?: number; variant?: WordmarkId }) {
  const chosen = useWordmark();
  const v = variant ?? chosen;
  return <span className={`brand-lockup bl-${v}`} style={{ ['--bs' as string]: `${size}px` }}>{v !== 'a' && <KeyMark size={size} />}<Wordmark variant={v} /></span>;
}
