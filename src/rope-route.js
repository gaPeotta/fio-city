import { Vector3 } from '../vendor/three.module.js';

const EPS = .002;

function segmentBlocked(a, b, box) {
  const d = b.clone().sub(a); let lo = EPS, hi = 1 - EPS;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(d[axis]) < 1e-8) { if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) return false; continue; }
    let t0 = (box.min[axis] - a[axis]) / d[axis], t1 = (box.max[axis] - a[axis]) / d[axis];
    if (t0 > t1) [t0, t1] = [t1, t0]; lo = Math.max(lo, t0); hi = Math.min(hi, t1);
    if (lo > hi) return false;
  }
  return true;
}
function clear(a, b, buildings, anchorId) { return !buildings.some(box => box.id !== anchorId && segmentBlocked(a, b, box)); }
function length(points) { let total = 0; for (let i = 1; i < points.length; i++) total += points[i - 1].distanceTo(points[i]); return total; }
function valid(points, buildings, anchorId) { for (let i = 1; i < points.length; i++) if (!clear(points[i - 1], points[i], buildings, anchorId)) return false; return true; }

// The cable is allowed to bend around an expanded building corner. It keeps the
// original endpoint; bends are routing points, never replacement anchors.
export function routeCable(start, end, buildings, anchorId, oldBends = [], clearance = .58) {
  const old = oldBends.map(p => p.clone());
  if (old.length && valid([start, ...old, end], buildings, anchorId)) return old;
  if (clear(start, end, buildings, anchorId)) return [];
  const blockers = buildings.filter(b => b.id !== anchorId && segmentBlocked(start, end, b));
  const box = blockers.sort((a, b) => start.distanceTo(a.min) - start.distanceTo(b.min))[0];
  if (!box) return old;
  const corners = [];
  // Prefer routes around vertical edges at the player's height. Bottom/top
  // corners are retained as a fallback, but should not drag a swinging player
  // into the street or force a needless rooftop detour.
  const edgeY = Math.max(box.min.y + clearance, Math.min(box.max.y - clearance, (start.y + end.y) * .5));
  for (const x of [box.min.x - clearance, box.max.x + clearance]) for (const z of [box.min.z - clearance, box.max.z + clearance]) corners.push(new Vector3(x, edgeY, z));
  for (let i = 0; i < 8; i++) corners.push(new Vector3(
    (i & 1 ? box.max.x : box.min.x) + (i & 1 ? clearance : -clearance),
    (i & 2 ? box.max.y : box.min.y) + (i & 2 ? clearance : -clearance),
    (i & 4 ? box.max.z : box.min.z) + (i & 4 ? clearance : -clearance),
  ));
  let best = null, score = Infinity;
  const consider = bends => { const path = [start, ...bends, end]; if (valid(path, buildings, anchorId)) { const cost = length(path); if (cost < score) { score = cost; best = bends.map(p => p.clone()); } } };
  // Vertical-edge routes first: equal length ties keep them above bottom corners.
  corners.forEach(a => consider([a]));
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) consider([corners[i], corners[j]]);
  return best ?? old;
}

export function cableLength(start, bends, end) { return length([start, ...bends, end]); }
