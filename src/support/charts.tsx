import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';

// Small, quiet charts for the support dashboard: one series each (the title names it, so no legend box),
// 2px lines, bars no thicker than 24px with rounded ends, hairline grids, a hover tooltip on every mark,
// and the numbers as a table underneath for anyone who prefers to read them.

/** The chart's real width in pixels, so text and marks keep their size on any screen. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export const C = { series: '#4F46E5', second: '#0891B2', wash: 'rgba(79,70,229,.10)', grid: '#EAECF0', ink: '#101828', soft: '#475467' };

/** A tiny trend line for number tiles. */
export function Spark({ values, w = 96, h = 28 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="sp-spark">
      <path d={`${d} L${x(values.length - 1)} ${h} L${x(0)} ${h} Z`} fill={C.wash} />
      <path d={d} fill="none" stroke={C.series} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3.5" fill={C.series} stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

function NumbersTable({ rows, fmt, head }: { rows: { label: string; value: number }[]; fmt: (v: number) => string; head: [string, string] }) {
  return (
    <details className="sp-numbers"><summary>See the numbers</summary>
      <div className="table-scroll"><table className="ledger"><thead><tr><th>{head[0]}</th><th className="num">{head[1]}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{fmt(r.value)}</td></tr>)}</tbody></table></div>
    </details>
  );
}

/** A line over time, with a soft wash under it, a crosshair and a tooltip on hover. */
export function LineChart({ points, fmt, label, head = ['Date', 'Value'] }: { points: { label: string; value: number }[]; fmt: (v: number) => string; label: string; head?: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = 200, L = 44, R = 12, T = 12, B = 26;
  const max = Math.max(...points.map((p) => p.value), 1) * 1.1;
  const x = (i: number) => L + (i / Math.max(1, points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [...new Set([0, max / 2, max].map((v) => Math.round(v)))];
  const every = Math.ceil(points.length / Math.max(2, Math.floor(W / 110)));
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((px - L) / (W - L - R)) * (points.length - 1)))));
  };
  const h = hover !== null ? points[hover] : null;
  return (
    <div className="sp-chart">
      <div className="sp-plot" ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={C.grid} /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="sp-axis">{fmt(t)}</text></g>)}
          {points.map((p, i) => ((i % every === 0 && points.length - 1 - i >= every / 2) || i === points.length - 1) && <text key={p.label} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="sp-axis">{p.label}</text>)}
          <path d={`${d} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={C.wash} />
          <path d={d} fill="none" stroke={C.series} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && <><line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={C.soft} strokeWidth="1" /><circle cx={x(hover)} cy={y(points[hover].value)} r="4.5" fill={C.series} stroke="#fff" strokeWidth="2" /></>}
          {hover === null && <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r="4.5" fill={C.series} stroke="#fff" strokeWidth="2" />}
        </svg>
        {h && <div className="sp-tip" style={{ left: `${(x(hover!) / W) * 100}%` }}><strong>{fmt(h.value)}</strong><span>{h.label}</span></div>}
      </div>
      <NumbersTable rows={points} fmt={fmt} head={head} />
    </div>
  );
}

/** Columns from one baseline, at most 24px thick, rounded at the top, with a tooltip on hover. */
export function BarChart({ bars, fmt, label, head = ['Period', 'Value'] }: { bars: { label: string; value: number }[]; fmt: (v: number) => string; label: string; head?: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = 200, L = 44, R = 8, T = 18, B = 26;
  const max = Math.max(...bars.map((b) => b.value), 1) * 1.12;
  const slot = (W - L - R) / bars.length, bw = Math.min(24, slot - 2);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, max / 2, max].map((v) => Math.round(v));
  const every = Math.ceil(bars.length / Math.max(2, Math.floor(W / 70)));
  const top = (cx: number, v: number) => { const yy = y(v), base = y(0), r = Math.min(4, (base - yy) / 2, bw / 2); return `M${cx - bw / 2} ${base} V${yy + r} Q${cx - bw / 2} ${yy} ${cx - bw / 2 + r} ${yy} H${cx + bw / 2 - r} Q${cx + bw / 2} ${yy} ${cx + bw / 2} ${yy + r} V${base} Z`; };
  return (
    <div className="sp-chart">
      <div className="sp-plot" ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={C.grid} /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="sp-axis">{fmt(t)}</text></g>)}
          {bars.map((b, i) => {
            const cx = L + slot * i + slot / 2;
            return (
              <g key={b.label} onMouseEnter={() => setHover(i)}>
                <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent" />
                {b.value > 0 && <path d={top(cx, b.value)} fill={C.series} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {(i % every === 0 || i === bars.length - 1) && <text x={cx} y={H - 6} textAnchor="middle" className="sp-axis">{b.label}</text>}
              </g>
            );
          })}
          {/* Label only the latest bar */}
          <text x={L + slot * (bars.length - 1) + slot / 2} y={y(bars[bars.length - 1].value) - 6} textAnchor="middle" className="sp-val">{fmt(bars[bars.length - 1].value)}</text>
        </svg>
        {hover !== null && <div className="sp-tip" style={{ left: `${((L + slot * hover + slot / 2) / W) * 100}%` }}><strong>{fmt(bars[hover].value)}</strong><span>{bars[hover].label}</span></div>}
      </div>
      <NumbersTable rows={bars} fmt={fmt} head={head} />
    </div>
  );
}

/** Horizontal bars with the label above each bar and the value at its end (funnels, sources, plan mix). */
export function HBars({ rows, fmt = (v) => v.toLocaleString('en-CA'), color = C.series }: { rows: { label: string; value: number; sub?: string }[]; fmt?: (v: number) => string; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="sp-hbars">{rows.map((r) => (
      <li key={r.label} title={`${r.label}: ${fmt(r.value)}`}>
        <div className="sp-hbar-top"><span>{r.label}</span><strong>{fmt(r.value)}{r.sub && <em> {r.sub}</em>}</strong></div>
        <div className="sp-hbar-track"><i style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: color }} /></div>
      </li>
    ))}</ul>
  );
}

/** A status with a light, an icon and a word: never colour alone. */
export function Status({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'off'; children: React.ReactNode }) {
  const icon = tone === 'good' ? 'check' : tone === 'off' ? 'pause' : 'alert';
  return <span className={`sp-status ${tone}`}><Icon name={icon} size={13} />{children}</span>;
}
