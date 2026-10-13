// Weighted Voronoi (power diagram) fracture of convex volumes, ported from rock-strike v22:
// each cell = the volume clipped by the bisector plane toward every nearer seed; caps become interior faces.
// Seeds are biased toward the impact so pieces get smaller near the blast.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { GeoBuilder } from '../city/GeoBuilder.js';
import { sideFrames, bayGrid, facadeOf, buildingVolumes } from '../city/BuildingGenerator.js';
import { L } from '../materials/layers.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const EPS = 1e-6;

/** clip convex polyhedron (list of faces) by plane n.p <= d, adding the cap face */
export function clipPoly(faces, n, d) {
  const out = [], cap = [];
  let cut = false;
  for (const f of faces) {
    const V = f.verts, res = [];
    for (let i = 0; i < V.length; i++) {
      const a = V[i], b = V[(i + 1) % V.length], da = dot(n, a) - d, db = dot(n, b) - d;
      if (da <= EPS) res.push(a); else cut = true;
      if (Math.abs(da) <= EPS) cap.push(a);
      if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
        const t = da / (da - db), p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        res.push(p); cap.push(p);
      }
    }
    if (res.length >= 3) out.push({ verts: res, tag: f.tag });
  }
  if (!cut) return faces;
  if (cap.length >= 3) {
    const c = [0, 0, 0]; cap.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); c[0] /= cap.length; c[1] /= cap.length; c[2] /= cap.length;
    const nl = Math.hypot(n[0], n[1], n[2]), nn = [n[0] / nl, n[1] / nl, n[2] / nl];
    const ref = Math.abs(nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [nn[1] * ref[2] - nn[2] * ref[1], nn[2] * ref[0] - nn[0] * ref[2], nn[0] * ref[1] - nn[1] * ref[0]];
    const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const v = [nn[1] * u[2] - nn[2] * u[1], nn[2] * u[0] - nn[0] * u[2], nn[0] * u[1] - nn[1] * u[0]];
    const sorted = cap.map((p) => { const q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; return { p, a: Math.atan2(dot(q, v), dot(q, u)) }; }).sort((x, y) => x.a - y.a);
    const poly = [];
    for (const s of sorted) { const l = poly[poly.length - 1]; if (!l || Math.hypot(l[0] - s.p[0], l[1] - s.p[1], l[2] - s.p[2]) > 1e-4) poly.push(s.p); }
    if (poly.length > 2 && Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1], poly[0][2] - poly[poly.length - 1][2]) < 1e-4) poly.pop();
    if (poly.length >= 3) out.push({ verts: poly, tag: { kind: 'interior' } });
  }
  return out.length >= 4 ? out : null;
}

export function polyVolume(faces) {
  let vol = 0; const cen = [0, 0, 0], o = faces[0].verts[0];
  for (const f of faces) {
    const V = f.verts;
    for (let k = 1; k < V.length - 1; k++) {
      const a = V[0], b = V[k], c = V[k + 1];
      const ax = a[0] - o[0], ay = a[1] - o[1], az = a[2] - o[2], bx = b[0] - o[0], by = b[1] - o[1], bz = b[2] - o[2], cx = c[0] - o[0], cy = c[1] - o[1], cz = c[2] - o[2];
      const v = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      vol += v; cen[0] += v * (o[0] + a[0] + b[0] + c[0]) / 4; cen[1] += v * (o[1] + a[1] + b[1] + c[1]) / 4; cen[2] += v * (o[2] + a[2] + b[2] + c[2]) / 4;
    }
  }
  if (Math.abs(vol) < 1e-9) return { vol: 0, cen: o.slice() };
  return { vol: Math.abs(vol), cen: [cen[0] / vol, cen[1] / vol, cen[2] / vol] };
}

/** fracture all volumes of a building; impactLocal = impact point in building space */
export function fractureBuilding(b, impactLocal, opts = {}) {
  const r = mulberry32((b.seed ^ 0x9e3779b9) + (opts.salt || 0));
  const vols = buildingVolumes(b);
  const totalVol = vols.reduce((a, v) => a + (v.max[0] - v.min[0]) * (v.max[1] - v.min[1]) * (v.max[2] - v.min[2]), 0);
  const N = Math.round(THREE.MathUtils.clamp(totalVol / 120, 30, opts.maxCells || 150));
  const Rc = opts.radius || 10;
  const cells = [];
  for (const vol of vols) {
    const vv = (vol.max[0] - vol.min[0]) * (vol.max[1] - vol.min[1]) * (vol.max[2] - vol.min[2]);
    const n = Math.max(1, Math.round(N * vv / totalVol));
    const spacing = Math.cbrt(vv / n);
    const seeds = [], W = [];
    const cl = (x, i) => Math.min(vol.max[i] - 0.05, Math.max(vol.min[i] + 0.05, x));
    for (let k = 0; k < n; k++) {
      let p;
      if (k < n * 0.55 && impactLocal) { // impact-biased
        const a = r() * Math.PI * 2, z = r() * 2 - 1, rr = Rc * Math.pow(r(), 1.7), s = Math.sqrt(1 - z * z);
        p = [cl(impactLocal[0] + Math.cos(a) * s * rr, 0), cl(impactLocal[1] + z * rr, 1), cl(impactLocal[2] + Math.sin(a) * s * rr, 2)];
      } else {
        p = [vol.min[0] + r() * (vol.max[0] - vol.min[0]), vol.min[1] + r() * (vol.max[1] - vol.min[1]), vol.min[2] + r() * (vol.max[2] - vol.min[2])];
      }
      seeds.push(p); W.push(r() * spacing * spacing * 0.25);
    }
    for (let i = 0; i < seeds.length; i++) {
      const Si = seeds[i];
      const order = seeds.map((s, j) => ({ j, d: (s[0] - Si[0]) ** 2 + (s[1] - Si[1]) ** 2 + (s[2] - Si[2]) ** 2 })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d);
      let faces = vol.faces, maxR = 0;
      const upd = () => { maxR = 0; for (const f of faces) for (const p of f.verts) maxR = Math.max(maxR, Math.hypot(p[0] - Si[0], p[1] - Si[1], p[2] - Si[2])); };
      upd();
      for (const { j, d } of order) {
        if (Math.sqrt(d) * 0.5 > maxR + spacing) break;
        const Sj = seeds[j], nrm = [Sj[0] - Si[0], Sj[1] - Si[1], Sj[2] - Si[2]];
        const off = (dot(Sj, Sj) - dot(Si, Si) - W[j] + W[i]) / 2;
        const nf = clipPoly(faces, nrm, off);
        if (!nf) { faces = null; break; }
        if (nf !== faces) { faces = nf; upd(); }
      }
      if (!faces) continue;
      const { vol: cv, cen } = polyVolume(faces);
      if (cv < 0.05) continue;
      cells.push({ faces, vol: cv, cen });
    }
  }
  return cells;
}

/** mesh geometry for a cell (vertices relative to its centroid, in building orientation) */
export function cellGeometry(b, cell) {
  const G = new GeoBuilder(256), c = cell.cen;
  const frames = b.tiers.map((t) => sideFrames(t));
  const NOFAC = [0, 0, 0, 0];
  for (const f of cell.faces) {
    const tag = f.tag, V = f.verts.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
    let uvFn;
    if (tag.kind === 'side') {
      const F = frames[tag.tier][tag.side], { us } = bayGrid(F.len, b.bay);
      const cy = f.verts.reduce((a, p) => a + p[1], 0) / f.verts.length;
      G.set(tag.tier === 0 && cy < b.gh ? b.base : b.wall, b.tint, facadeOf(b, tag.side, tag.tier), b.seedF + tag.side * 0.37);
      uvFn = (q) => { const x = q[0] + c[0] - F.o[0], z = q[2] + c[2] - F.o[2]; return [(x * F.t[0] + z * F.t[2]) * us, q[1] + c[1]]; };
    } else {
      const layer = tag.kind === 'interior' ? L.RUBBLE : tag.kind === 'bottom' ? L.PRECAST : b.roofLayer;
      G.set(layer, tag.kind === 'interior' ? [0.95, 0.93, 0.9] : [1, 1, 1], NOFAC, 0);
      // planar projection on the dominant axis
      const a = f.verts[0], bb = f.verts[1], cc = f.verts[2];
      const n = [(bb[1] - a[1]) * (cc[2] - a[2]) - (bb[2] - a[2]) * (cc[1] - a[1]), (bb[2] - a[2]) * (cc[0] - a[0]) - (bb[0] - a[0]) * (cc[2] - a[2]), (bb[0] - a[0]) * (cc[1] - a[1]) - (bb[1] - a[1]) * (cc[0] - a[0])];
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      uvFn = ay >= ax && ay >= az ? (q) => [q[0] + c[0], q[2] + c[2]] : ax >= az ? (q) => [q[2] + c[2], q[1] + c[1]] : (q) => [q[0] + c[0], q[1] + c[1]];
    }
    G.poly(V, uvFn);
  }
  const geo = G.build();
  // unique hull vertices for collisions
  const seen = new Map(), hull = [];
  for (const f of cell.faces) for (const p of f.verts) {
    const k = `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
    if (!seen.has(k)) { seen.set(k, 1); hull.push(p[0] - c[0], p[1] - c[1], p[2] - c[2]); }
  }
  return { geo, hull: new Float32Array(hull) };
}
