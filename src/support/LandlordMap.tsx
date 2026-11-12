import { useMemo, useState } from 'react';
import { PROVINCES } from '../lib/jurisdiction';
import { cityPoint } from '../lib/cities';
import { CANADA_VIEW, PROVINCE_PATHS, project } from './canadaMap';
import type { Customer } from './data';

// Overview → where the landlords' rentals are: a map of Canada with one dot per city (bigger = more
// landlords). City level only, on purpose: the team never needs anyone's street address for this.

type Place = { key: string; name: string; province: string; x: number; y: number; count: number };
const provName = (code: string) => PROVINCES.find((p) => p.code === code)?.name ?? code;
const plural = (n: number) => `${n} landlord${n === 1 ? '' : 's'}`;

export function LandlordMap({ customers }: { customers: Customer[] }) {
  const { places, byProv, total } = useMemo(() => {
    const m = new Map<string, Place>();
    const prov = new Map<string, number>();
    for (const c of customers) {
      const list = c.places?.length ? c.places : [{ city: c.city, province: c.province }];
      const seen = new Set<string>(); const provs = new Set<string>();
      for (const pl of list) {
        const pt = cityPoint(pl.province, pl.city);
        if (!pt) continue;
        const key = `${pl.province}|${pt.exact ? pt.name : '*'}`;
        provs.add(pl.province);
        if (seen.has(key)) continue;
        seen.add(key);
        const [x, y] = project(pt.lng, pt.lat);
        const e = m.get(key) ?? { key, name: pt.exact ? pt.name : `Elsewhere in ${provName(pl.province)}`, province: pl.province, x, y, count: 0 };
        e.count++; m.set(key, e);
      }
      for (const p of provs) prov.set(p, (prov.get(p) ?? 0) + 1);
    }
    return { places: [...m.values()].sort((a, b) => b.count - a.count), byProv: prov, total: customers.length };
  }, [customers]);
  const [on, setOn] = useState<string | null>(null);
  const max = places[0]?.count ?? 1;
  const shown = places.find((p) => p.key === on) ?? null;
  const r = (n: number) => 7 + 20 * Math.sqrt(n / max);
  return (
    <div className="sp-lmap">
      <div className="sp-lmap-art">
        <svg viewBox={`0 0 ${CANADA_VIEW.w} ${CANADA_VIEW.h}`} role="img" aria-label={`Map of Canada: landlords in ${places.length} places`}>
          {Object.entries(PROVINCE_PATHS).map(([code, d]) => (
            <path key={code} d={d} className={`sp-lmap-prov${byProv.get(code) ? ' has' : ''}`}><title>{`${provName(code)}: ${plural(byProv.get(code) ?? 0)}`}</title></path>
          ))}
          {/* Biggest first, so the smaller dots stay on top and can be pointed at. */}
          {places.map((p) => (
            <circle key={p.key} cx={p.x} cy={p.y} r={r(p.count)} className={`sp-lmap-dot${on === p.key ? ' on' : ''}`} tabIndex={0}
              onMouseEnter={() => setOn(p.key)} onMouseLeave={() => setOn(null)} onFocus={() => setOn(p.key)} onBlur={() => setOn(null)}>
              <title>{`${p.name}, ${p.province} · ${plural(p.count)}`}</title>
            </circle>
          ))}
        </svg>
        <p className="sp-lmap-caption" aria-live="polite">{shown ? <><strong>{shown.name}, {shown.province}</strong> · {plural(shown.count)}</> : 'Point at a dot to see the city'}</p>
      </div>
      <div className="sp-lmap-side">
        <p className="sp-lmap-total"><strong>{total}</strong> landlords in <strong>{places.length}</strong> {places.length === 1 ? 'place' : 'places'}</p>
        <ul className="sp-lmap-top">{places.slice(0, 7).map((p) => (
          <li key={p.key} onMouseEnter={() => setOn(p.key)} onMouseLeave={() => setOn(null)} className={on === p.key ? 'on' : ''}>
            <span className="sp-lmap-dot-key" aria-hidden />{p.name}, {p.province}<strong>{p.count}</strong>
          </li>
        ))}</ul>
        <p className="sp-small sp-muted">City level only: street addresses are never shown here.</p>
      </div>
    </div>
  );
}
