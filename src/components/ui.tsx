import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { fmt, parseMoney, toInput } from '../lib/money';
import type { Cents, Phase } from '../data/types';
import { FEATURES, type Feature } from '../data/phases';
import { usePhase } from '../data/store';

/** True inside the Claude artifact preview, where printing and file downloads are blocked by the frame. */
export const embedded = typeof window !== 'undefined' && !!(window as unknown as { __KH_EMBED?: boolean }).__KH_EMBED;

// ---------- Stamp: real states only, never decorative ----------
export function Stamp({ kind, children, press }: { kind: string; children?: ReactNode; press?: boolean }) {
  const rot = ((kind.charCodeAt(0) + kind.length) % 5) - 2.5;
  return <span className={`stamp ${kind}${press ? ' press' : ''}`} style={{ ['--rot' as string]: `${rot * 0.7}deg` }}>{children ?? kind}</span>;
}

// ---------- Figure: serif dollars with reduced mono cents ----------
export function Figure({ cents, size, signed, className }: { cents: Cents; size?: 'sm' | 'lg'; signed?: boolean; className?: string }) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-CA');
  const c = String(abs % 100).padStart(2, '0');
  return (
    <span className={`figure ${size ?? ''} ${className ?? ''}`} aria-label={fmt(cents)}>
      {neg ? '−' : signed ? '+' : ''}${dollars}<span className="cents">.{c}</span>
    </span>
  );
}

// ---------- Drawer ----------
export function Drawer({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.close)')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`drawer${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} ref={ref}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="btn ghost close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  );
}

// ---------- Inputs ----------
export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}

export function MoneyInput({ value, onChange, id, placeholder, autoFocus }: { value: Cents | undefined; onChange: (c: Cents | undefined) => void; id?: string; placeholder?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(toInput(value));
  useEffect(() => { if (parseMoney(text) !== value) setText(toInput(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input id={id} className="input money" inputMode="decimal" placeholder={placeholder ?? '0.00'} value={text} autoFocus={autoFocus}
      onChange={(e) => { setText(e.target.value); const c = parseMoney(e.target.value); onChange(Number.isNaN(c) ? undefined : c); }} />
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button type="button" key={String(o.id)} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

// ---------- Term: dotted underline reveals a one-line definition ----------
export function Term({ children, def }: { children: ReactNode; def: string }) {
  return <abbr className="term" title={def}>{children}</abbr>;
}

// ---------- Phase gating ----------
export function PhaseGate({ feature, children, fallback }: { feature: Feature; children: ReactNode; fallback?: ReactNode }) {
  const phase = usePhase();
  return <>{FEATURES[feature].phase <= phase ? children : fallback ?? null}</>;
}

export function PhaseLocked({ phase, what }: { phase: Phase; what: string }) {
  return (
    <div className="sheet empty">
      <div className="serif">{what} arrives in phase {phase}.</div>
      <p>Switch phases in Settings to preview it now.</p>
      <Link className="btn" to="/settings#phase">Open phase settings</Link>
    </div>
  );
}

// ---------- Empty state: a written invitation with one action ----------
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="serif">{title}</div>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

// ---------- Slide to confirm (legal/destructive actions) ----------
export function SlideToConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const drag = useRef<{ start: number } | null>(null);
  const max = () => (track.current?.clientWidth ?? 300) - 76;
  return (
    <div className="slide-confirm" ref={track}
      onPointerMove={(e) => { if (!drag.current) return; setX(Math.max(0, Math.min(max(), e.clientX - drag.current.start))); }}
      onPointerUp={() => { if (x >= max() - 4) onConfirm(); drag.current = null; setX(0); }}
      onPointerLeave={() => { drag.current = null; setX(0); }}>
      <div className="txt">{label}</div>
      <div className="knob" role="button" tabIndex={0} aria-label={`${label} (press Enter to confirm)`} style={{ transform: `translateX(${x}px)` }}
        onPointerDown={(e) => { drag.current = { start: e.clientX - x }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}>
        <Icon name="next" />
      </div>
    </div>
  );
}

export function Initials({ names }: { names: string[] }) {
  return <>{names.map((n) => n.split(' ').map((p) => p[0]).join('')).join(' · ')}</>;
}
