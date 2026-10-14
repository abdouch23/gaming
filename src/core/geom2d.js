// 2D polygon helpers in the x/z plane. Points are [x, z]. Polygons are normalised to positive
// signed area, so the interior is on the left of each edge and the inward normal is (-tz, tx).

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const inward = (t) => [-t[1], t[0]];

export function area(P) {
  let s = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
export function centroid(P) {
  let cx = 0, cz = 0, A = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], c = a[0] * b[1] - b[0] * a[1];
    A += c; cx += (a[0] + b[0]) * c; cz += (a[1] + b[1]) * c;
  }
  if (Math.abs(A) < 1e-9) return P[0].slice();
  return [cx / (3 * A), cz / (3 * A)];
}

/** offset every edge inward by d (scalar or per-edge array); one output vertex per input vertex */
export function inset(P, d) {
  const n = P.length, D = (i) => (Array.isArray(d) ? d[i] : d), out = [];
  const T = [], N = [];
  for (let i = 0; i < n; i++) { const t = norm(sub(P[(i + 1) % n], P[i])); T.push(t); N.push(inward(t)); }
  for (let i = 0; i < n; i++) {
    const ip = (i - 1 + n) % n;
    const p1 = add(P[i], mul(N[ip], D(ip))), p2 = add(P[i], mul(N[i], D(i)));
    const c = cross(T[ip], T[i]);
    let q;
    if (Math.abs(c) < 1e-3) q = add(P[i], mul(norm(add(N[ip], N[i])), (D(ip) + D(i)) / 2));
    else {
      const s = cross(sub(p2, p1), T[i]) / c;
      q = add(p1, mul(T[ip], s));
      const lim = 4 * Math.max(D(ip), D(i));
      if (dist(q, P[i]) > lim) q = add(P[i], mul(norm(add(N[ip], N[i])), lim)); // spike guard
    }
    out.push(q);
  }
  return out;
}

/** fillet convex corners with radius r (concave corners kept) */
export function roundCorners(P, r, seg = 5) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], p = P[i], b = P[(i + 1) % n];
    const t1 = norm(sub(p, a)), t2 = norm(sub(b, p)), turn = cross(t1, t2);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(t1, t2))));
    if (turn <= 0 || ang < 0.35) { out.push(p); continue; }
    const half = (Math.PI - ang) / 2;
    let d = r / Math.tan(half);
    d = Math.min(d, 0.45 * dist(a, p), 0.45 * dist(p, b));
    const rr = d * Math.tan(half);
    const s = sub(p, mul(t1, d)), c = add(s, mul(inward(t1), rr));
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
    for (let k = 0; k <= seg; k++) { const aa = a0 + (ang * k) / seg; out.push([c[0] + Math.cos(aa) * rr, c[1] + Math.sin(aa) * rr]); }
  }
  return out;
}

export function pointInPoly(p, P) {
  let ins = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}

/** distance from p to the polygon boundary */
export function distToPoly(p, P) {
  let m = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
    m = Math.min(m, dist(p, add(a, mul(ab, t))));
  }
  return m;
}

/** oriented rectangle corners: centre c, unit axis ax (width w), depth d along the perpendicular */
export function rectCorners(c, ax, w, d) {
  const ay = [-ax[1], ax[0]], hx = mul(ax, w / 2), hy = mul(ay, d / 2);
  return [add(add(c, hx), hy), add(sub(c, hx), hy), sub(sub(c, hx), hy), sub(add(c, hx), hy)];
}

/** separating-axis test for two convex polygons */
export function convexOverlap(A, B) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const e = sub(P[(i + 1) % P.length], P[i]), ax = [-e[1], e[0]];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A) { const v = dot(p, ax); a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
    for (const p of B) { const v = dot(p, ax); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}

export function convexHull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const lower = [], upper = [];
  for (const p of P) { while (lower.length >= 2 && cross(sub(lower[lower.length - 1], lower[lower.length - 2]), sub(p, lower[lower.length - 2])) <= 0) lower.pop(); lower.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross(sub(upper[upper.length - 1], upper[upper.length - 2]), sub(p, upper[upper.length - 2])) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper); // counter-clockwise (positive area)
}

/** arc-length parametrised polyline (open or closed) */
export class Polyline {
  constructor(pts, closed = false) {
    this.pts = closed ? pts.concat([pts[0]]) : pts.slice();
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + dist(this.pts[i - 1], this.pts[i]));
    this.length = this.cum[this.cum.length - 1];
  }
  _seg(s) {
    const c = this.cum; let lo = 0, hi = c.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  at(s) {
    s = Math.max(0, Math.min(this.length, s));
    const i = this._seg(s), a = this.pts[i], b = this.pts[i + 1], L = this.cum[i + 1] - this.cum[i] || 1, t = (s - this.cum[i]) / L;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  tangent(s) {
    s = Math.max(0, Math.min(this.length - 1e-6, s));
    const i = this._seg(s);
    return norm(sub(this.pts[i + 1], this.pts[i]));
  }
  /** vertices strictly between s0 and s1 */
  between(s0, s1) { const out = []; for (let i = 0; i < this.pts.length; i++) if (this.cum[i] > s0 && this.cum[i] < s1) out.push({ p: this.pts[i], s: this.cum[i], i }); return out; }
}
