// Three-way merge for an account's data when two devices saved at nearly the same time.
//
// `base` is the version both devices started from, `remote` is what the server has now, `local` is what
// just arrived. Changes made on only one side are kept. When both sides changed the same field, the
// incoming (local) one wins. Lists of records with an `id` (payments, tenants, receipts…) are merged
// record by record, so a payment logged on the phone and an expense filed on the laptop both survive.
// Nothing is lost silently: the server also keeps every saved version in its history.

type J = unknown;
const isObj = (v: J): v is Record<string, J> => !!v && typeof v === 'object' && !Array.isArray(v);
const hasIds = (v: J): v is { id: string }[] => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');

export function deepEqual(a: J, b: J): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) { const bb = b as J[]; return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i])); }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, J>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, J>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, J>)[k], (b as Record<string, J>)[k]));
}

export function merge3(base: J, remote: J, local: J): J {
  if (deepEqual(local, base)) return remote; // only the server side changed (or nothing did)
  if (deepEqual(remote, base) || deepEqual(remote, local)) return local; // only the incoming side changed
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, J> = {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const v = merge3(b[k], remote[k], local[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (hasIds(local) && hasIds(remote) && (base === undefined || hasIds(base))) return mergeById((base as { id: string }[]) ?? [], remote, local);
  return local; // both changed something that cannot be merged piece by piece: the newest save wins
}

function mergeById(base: { id: string }[], remote: { id: string }[], local: { id: string }[]) {
  const B = new Map(base.map((x) => [x.id, x])), R = new Map(remote.map((x) => [x.id, x])), L = new Map(local.map((x) => [x.id, x]));
  const out: { id: string }[] = [];
  for (const l of local) {
    const r = R.get(l.id), b = B.get(l.id);
    if (r) out.push(merge3(b, r, l) as { id: string });
    else if (b && deepEqual(l, b)) continue; // removed on the server and untouched here: stays removed
    else out.push(l); // new here, or changed here while removed there: keep it
  }
  // Records only the server has: new ones go in next to their neighbours; ones removed here stay removed
  // unless the server changed them since (then keeping them loses nothing).
  remote.forEach((r, i) => {
    if (L.has(r.id)) return;
    const b = B.get(r.id);
    if (b && deepEqual(r, b)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = out.findIndex((x) => x.id === remote[j].id); if (k >= 0) { at = k + 1; break; } }
    out.splice(at, 0, r);
  });
  return out;
}
