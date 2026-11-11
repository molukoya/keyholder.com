import { useEffect, useId, useState } from 'react';

// Keyholder's logo. Four versions to choose from; the choice is remembered in this browser until one is final.
//   A Keyhole · B House key · C KH monogram · D Keyhole "o" (word only)

export type WordmarkId = 'a' | 'b' | 'c' | 'd';
export const WORDMARKS: { id: WordmarkId; name: string; note: string }[] = [
  { id: 'a', name: 'Keyhole', note: 'A keyhole cut out of the gradient tile. Simple and instantly “key”.' },
  { id: 'b', name: 'House key', note: 'A key whose head is a little house: rental and key in one mark.' },
  { id: 'c', name: 'Monogram', note: 'The H and K of Keyholder share one upright, in a soft circle. A premium initial badge.' },
  { id: 'd', name: 'Keyhole “o”', note: 'Word only. The first “o” carries a keyhole, and doubles as the app icon.' },
];
const listeners = new Set<(v: WordmarkId) => void>();
// Chosen: B (house key). The other versions stay here for reference only.
function readChoice(): WordmarkId { return 'b'; }
export function setWordmark(v: WordmarkId) { listeners.forEach((f) => f(v)); }
export function useWordmark() {
  const [v, setV] = useState<WordmarkId>(readChoice);
  useEffect(() => { listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}

function Grad({ id }: { id: string }) {
  return <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4F46E5" /><stop offset=".6" stopColor="#7C3AED" /><stop offset="1" stopColor="#38BDF8" /></linearGradient>;
}
const KEYHOLE = 'M16 7.6a5 5 0 0 1 2.9 9.1l1.5 7.1a1 1 0 0 1-1 1.2h-6.8a1 1 0 0 1-1-1.2l1.5-7.1A5 5 0 0 1 16 7.6z';

/** The app icon for a given version. */
export function KeyMark({ size = 28, variant }: { size?: number; variant?: WordmarkId }) {
  const chosen = useWordmark();
  const v = variant ?? chosen;
  const g = `g${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={`keymark km-${v}`}>
      <defs><Grad id={g} /></defs>
      {v === 'a' && <><rect width="32" height="32" rx="9" fill={`url(#${g})`} /><path d={KEYHOLE} fill="#fff" /></>}
      {v === 'b' && <>
        <rect width="32" height="32" rx="9" fill={`url(#${g})`} />
        <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 13.2 16 7.4l6.5 5.8v5.4h-13z" />
          <path d="M16 18.6v7.2M16 21.6h3.4M16 24.8h2.4" />
        </g>
        <rect x="14.6" y="14" width="2.8" height="4.6" rx="1.2" fill="#fff" />
      </>}
      {v === 'c' && <>
        <circle cx="16" cy="16" r="16" fill={`url(#${g})`} />
        <g fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 9.5v13M15 9.5v13M9 16h6M15 16l7.2-6.6M17.6 13.8 22.4 22.5" />
        </g>
      </>}
      {v === 'd' && <>
        <rect width="32" height="32" rx="9" fill={`url(#${g})`} />
        <circle cx="16" cy="16" r="9.2" fill="none" stroke="#fff" strokeWidth="3.6" />
        <path d="M16 11.2a2.4 2.4 0 0 1 1.4 4.35l.75 3.75a.6.6 0 0 1-.6.7h-3.1a.6.6 0 0 1-.6-.7l.75-3.75A2.4 2.4 0 0 1 16 11.2z" fill="#fff" />
      </>}
    </svg>
  );
}

/** The keyhole "o" that sits inside the wordmark (version D). */
function KeyholeO() {
  const g = `o${useId().replace(/:/g, '')}`;
  return (
    <svg className="wm-o" viewBox="0 0 20 20" aria-hidden>
      <defs><Grad id={g} /></defs>
      <circle cx="10" cy="10" r="7.3" fill="none" stroke="currentColor" strokeWidth="3.1" />
      <path d="M10 5.3a2.7 2.7 0 0 1 1.55 4.9l.85 3.7a.6.6 0 0 1-.6.75H8.2a.6.6 0 0 1-.6-.75l.85-3.7A2.7 2.7 0 0 1 10 5.3z" fill={`url(#${g})`} />
    </svg>
  );
}

export function Wordmark({ variant }: { variant: WordmarkId }) {
  if (variant === 'd') return <span className="wm wm-d" aria-label="Keyholder"><span aria-hidden>keyh</span><KeyholeO /><span aria-hidden>lder</span></span>;
  if (variant === 'c') return <span className="wm wm-c" aria-label="Keyholder">Keyholder</span>;
  return <span className={`wm wm-${variant}`} aria-label="Keyholder">keyholder</span>;
}

/** Logo as used across the product: icon + wordmark (D is word only). */
export function Brand({ size = 26, variant }: { size?: number; variant?: WordmarkId }) {
  const chosen = useWordmark();
  const v = variant ?? chosen;
  return <span className={`brand-lockup bl-${v}`} style={{ ['--bs' as string]: `${size}px` }}>{v !== 'd' && <KeyMark size={size} variant={v} />}<Wordmark variant={v} /></span>;
}
