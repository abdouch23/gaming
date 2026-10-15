// Procedural buildings: split-grammar facades (floors -> bays -> openings) ported from Building_Generator_AAA,
// extended with five city styles, a cheap LOD1 (shader windows) and convex volumes for Voronoi fracture.
import * as THREE from 'three';
import { L } from '../materials/layers.js';
import { mulberry32 } from '../core/rng.js';

// window fractions (of bay width / floor height). Must match facadeWindow() in CityMaterials.js
export const WIN = {
  ground: { ww: 0.8, wh: 0.72, sill: 0.06 },
  1: { ww: 0.46, wh: 0.56, sill: 0.28 },
  2: { ww: 0.88, wh: 0.46, sill: 0.3 },
  3: { ww: 0.96, wh: 0.8, sill: 0.1 },
};

export const STYLES = {
  haussmann: { wall: L.LIMESTONE, base: L.RUSTIC, roof: L.ZINC, roofType: 'mansard', fh: [3.0, 3.3], gh: [4.0, 4.6], bay: [2.7, 3.1], floors: [5, 7], win: 1, depth: [14, 18], lot: [14, 24], contiguous: true },
  brick: { wall: L.BRICK, base: L.PRECAST, roof: L.GRAVEL, roofType: 'flat', fh: [2.9, 3.2], gh: [3.8, 4.4], bay: [2.8, 3.4], floors: [4, 9], win: 1, depth: [14, 20], lot: [12, 22], contiguous: true },
  office: { wall: L.PRECAST, base: L.PRECAST, roof: L.GRAVEL, roofType: 'flat', fh: [3.5, 3.9], gh: [4.8, 5.6], bay: [3.0, 3.6], floors: [7, 16], win: 2, depth: [18, 26], lot: [22, 36], contiguous: false },
  tower: { wall: L.METAL, base: L.PRECAST, roof: L.GRAVEL, roofType: 'flat', fh: [3.7, 4.0], gh: [5.5, 6.5], bay: [2.6, 3.0], floors: [16, 46], win: 3, depth: [24, 32], lot: [26, 38], contiguous: false },
  townhouse: { wall: L.PLASTER, base: L.PLASTER, roof: L.CLAY, roofType: 'hip', fh: [2.9, 3.1], gh: [3.1, 3.4], bay: [2.8, 3.2], floors: [2, 4], win: 1, depth: [10, 13], lot: [8, 13], contiguous: true },
};

const PLASTER_TINTS = [[1.02, 0.97, 0.86], [1.05, 0.88, 0.7], [1.0, 0.8, 0.74], [0.86, 0.93, 1.0], [0.88, 0.98, 0.88], [1.04, 1.02, 0.98], [0.98, 0.86, 0.62]];
const GLASS_TINTS = [[0.35, 0.55, 0.75], [0.35, 0.6, 0.55], [0.6, 0.48, 0.35], [0.62, 0.66, 0.7], [0.3, 0.42, 0.62]];
const SHUTTER_TINTS = [[0.55, 1.2, 0.7], [0.6, 0.8, 1.4], [1.3, 0.75, 0.55], [1.6, 1.6, 1.55], [0.9, 0.7, 0.5]];
const AWNING_TINTS = [[1.1, 0.25, 0.2], [0.25, 0.45, 0.3], [0.2, 0.3, 0.6], [1.0, 0.85, 0.5], [0.25, 0.25, 0.25]];

const NOFAC = [0, 0, 0, 0];

/* ---------- building record ---------- */
export function makeBuilding(o) {
  const S = STYLES[o.style], r = mulberry32(o.seed);
  const fh = r.range(...S.fh), gh = r.range(...S.gh), bay = r.range(...S.bay);
  let floors = Math.round(r.range(S.floors[0], S.floors[1]) * (o.heightScale || 1));
  floors = Math.max(Math.max(1, S.floors[0] - 1), Math.min(floors, Math.round(S.floors[1] * 1.6) + 4));
  if (o.floors) floors = Math.max(1, Math.round(o.floors));
  const yAt = (f) => (f <= 0 ? 0 : gh + (f - 1) * fh);
  const H = yAt(floors);
  const w = o.w, d = o.d;
  const tiers = [{ w, d, ox: 0, oz: 0, y0: 0, y1: H }];
  if (o.style === 'tower' && floors > 20 && Math.min(w, d) > 22) { // setbacks
    const f1 = Math.round(floors * r.range(0.35, 0.5)), f2 = Math.round(floors * r.range(0.72, 0.85));
    const i1 = r.range(1.8, 3.5), i2 = i1 + r.range(1.8, 3.5);
    tiers.length = 0;
    tiers.push({ w, d, ox: 0, oz: 0, y0: 0, y1: yAt(f1) });
    tiers.push({ w: w - 2 * i1, d: d - 2 * i1, ox: 0, oz: 0, y0: yAt(f1), y1: yAt(f2) });
    if (w - 2 * i2 > 10 && d - 2 * i2 > 10) tiers.push({ w: w - 2 * i2, d: d - 2 * i2, ox: 0, oz: 0, y0: yAt(f2), y1: H });
    else tiers[1].y1 = H;
  }
  let tint = [1, 1, 1];
  if (o.style === 'townhouse') tint = r.pick(PLASTER_TINTS);
  else if (o.style === 'brick') { const k = r.range(0.85, 1.12); tint = [k * r.range(0.95, 1.05), k, k * r.range(0.9, 1.05)]; }
  else if (o.style === 'haussmann') { const k = r.range(0.93, 1.05); tint = [k, k * 0.99, k * r.range(0.94, 1.0)]; }
  else if (o.style === 'office') { const k = r.range(0.8, 1.15); tint = [k, k, k * r.range(0.96, 1.04)]; }
  const roofH = S.roofType === 'mansard' ? fh * 1.25 : S.roofType === 'hip' ? Math.min(w, d) * 0.32 : 0;
  const b = {
    id: o.id, seed: o.seed, style: o.style, cx: o.cx, cz: o.cz, angle: o.angle || 0, w, d, opts: { ...o },
    floors, fh, gh, bay, tiers, H, roofType: S.roofType, roofH,
    wall: S.wall, base: S.base, roofLayer: S.roof, win: S.win, tint,
    glassTint: o.style === 'tower' ? r.pick(GLASS_TINTS) : [0.55, 0.62, 0.66],
    mirror: o.style === 'tower' ? 0.38 : o.style === 'office' ? 0.18 : 0,
    shutter: r.pick(SHUTTER_TINTS), awning: r.chance(0.6) ? r.pick(AWNING_TINTS) : null,
    blank: { left: !!o.blankLeft, right: !!o.blankRight },
    antenna: o.style === 'tower' && r.chance(0.55),
    seedF: ((o.id * 7.31) % 50),
    demolished: false,
  };
  b.matrix = new THREE.Matrix4().makeRotationY(b.angle).setPosition(o.cx, 0, o.cz);
  b.inverse = b.matrix.clone().invert();
  const box = new THREE.Box3();
  for (const t of tiers) for (const sx of [-1, 1]) for (const sz of [-1, 1]) box.expandByPoint(new THREE.Vector3(t.ox + sx * t.w / 2, t.y1, t.oz + sz * t.d / 2).applyMatrix4(b.matrix));
  box.min.y = 0; box.max.y = H + roofH;
  b.box = box;
  b.top = H + roofH + (b.antenna ? 30 : 0);
  return b;
}

// facade frames of a tier box: origin corner, tangent (= up x normal), outward normal, length
export function sideFrames(t) {
  const hw = t.w / 2, hd = t.d / 2;
  return [
    { side: 0, o: [t.ox - hw, 0, t.oz + hd], t: [1, 0, 0], n: [0, 0, 1], len: t.w },
    { side: 1, o: [t.ox + hw, 0, t.oz + hd], t: [0, 0, -1], n: [1, 0, 0], len: t.d },
    { side: 2, o: [t.ox + hw, 0, t.oz - hd], t: [-1, 0, 0], n: [0, 0, -1], len: t.w },
    { side: 3, o: [t.ox - hw, 0, t.oz - hd], t: [0, 0, 1], n: [-1, 0, 0], len: t.d },
  ];
}
export const bayGrid = (len, bay) => { const nb = Math.max(1, Math.round(len / bay)); return { nb, be: len / nb, us: bay / (len / nb) }; };
const isBlank = (b, side, ti) => ti === 0 && ((side === 3 && b.blank.left) || (side === 1 && b.blank.right));
export const facadeOf = (b, side, ti) => (isBlank(b, side, ti) ? NOFAC : [b.bay, b.fh, b.gh, b.win]);
const P = (F, u, y, off) => [F.o[0] + F.t[0] * u + F.n[0] * off, y, F.o[2] + F.t[2] * u + F.n[2] * off];

/* ---------- roof shapes (convex) ---------- */
export function roofPolys(b) {
  const t = b.tiers[b.tiers.length - 1], H = t.y1, hw = t.w / 2, hd = t.d / 2, ox = t.ox, oz = t.oz;
  if (b.roofType === 'mansard') {
    const m = Math.min(1.6, Math.min(hw, hd) * 0.3), y1 = H + b.roofH;
    const B = [[ox - hw, H, oz + hd], [ox + hw, H, oz + hd], [ox + hw, H, oz - hd], [ox - hw, H, oz - hd]];
    const T = [[ox - hw + m, y1, oz + hd - m], [ox + hw - m, y1, oz + hd - m], [ox + hw - m, y1, oz - hd + m], [ox - hw + m, y1, oz - hd + m]];
    return { kind: 'mansard', B, T, slopes: [[B[0], B[1], T[1], T[0]], [B[1], B[2], T[2], T[1]], [B[2], B[3], T[3], T[2]], [B[3], B[0], T[0], T[3]]], top: [T[0], T[1], T[2], T[3]], bottom: [B[3], B[2], B[1], B[0]] };
  }
  if (b.roofType === 'hip') {
    const o = 0.45, y1 = H + b.roofH, ew = hw + o, ed = hd + o;
    const B = [[ox - ew, H, oz + ed], [ox + ew, H, oz + ed], [ox + ew, H, oz - ed], [ox - ew, H, oz - ed]];
    const along = ew >= ed, rl = Math.max(0.01, along ? ew - ed : ed - ew);
    const R0 = along ? [ox - rl, y1, oz] : [ox, y1, oz + rl], R1 = along ? [ox + rl, y1, oz] : [ox, y1, oz - rl];
    const slopes = along
      ? [[B[0], B[1], R1, R0], [B[1], B[2], R1], [B[2], B[3], R0, R1], [B[3], B[0], R0]]
      : [[B[0], B[1], R0], [B[1], B[2], R1, R0], [B[2], B[3], R1], [B[3], B[0], R0, R1]];
    return { kind: 'hip', B, slopes, top: null, bottom: [B[3], B[2], B[1], B[0]] };
  }
  return null;
}
const slopeUV = (poly) => { // u along the eave, v up the slope (metres)
  const a = poly[0], b = poly[1], ex = [b[0] - a[0], 0, b[2] - a[2]], el = Math.hypot(ex[0], ex[2]) || 1;
  const t = [ex[0] / el, 0, ex[2] / el];
  return (q) => { const dx = q[0] - a[0], dz = q[2] - a[2]; const u = dx * t[0] + dz * t[2]; const h = Math.hypot(dx - t[0] * u, dz - t[2] * u); return [u, Math.hypot(h, q[1] - a[1])]; };
};

/* ---------- convex volumes for fracture (building-local) ---------- */
export function buildingVolumes(b) {
  const vols = [];
  b.tiers.forEach((t, ti) => {
    const fr = sideFrames(t), faces = [];
    for (const F of fr) faces.push({ verts: [P(F, 0, t.y0, 0), P(F, F.len, t.y0, 0), P(F, F.len, t.y1, 0), P(F, 0, t.y1, 0)], tag: { kind: 'side', side: F.side, tier: ti } });
    const hw = t.w / 2, hd = t.d / 2;
    faces.push({ verts: [[t.ox - hw, t.y1, t.oz + hd], [t.ox + hw, t.y1, t.oz + hd], [t.ox + hw, t.y1, t.oz - hd], [t.ox - hw, t.y1, t.oz - hd]], tag: { kind: 'top' } });
    faces.push({ verts: [[t.ox - hw, t.y0, t.oz - hd], [t.ox + hw, t.y0, t.oz - hd], [t.ox + hw, t.y0, t.oz + hd], [t.ox - hw, t.y0, t.oz + hd]], tag: { kind: 'bottom' } });
    vols.push({ faces, min: [t.ox - hw, t.y0, t.oz - hd], max: [t.ox + hw, t.y1, t.oz + hd] });
  });
  const R = roofPolys(b);
  if (R) {
    const faces = R.slopes.map((s) => ({ verts: s, tag: { kind: 'roof' } }));
    if (R.top) faces.push({ verts: R.top, tag: { kind: 'roof' } });
    faces.push({ verts: R.bottom, tag: { kind: 'bottom' } });
    const t = b.tiers[b.tiers.length - 1];
    const ex = R.kind === 'hip' ? 0.45 : 0;
    vols.push({ faces, min: [t.ox - t.w / 2 - ex, t.y1, t.oz - t.d / 2 - ex], max: [t.ox + t.w / 2 + ex, t.y1 + b.roofH, t.oz + t.d / 2 + ex] });
  }
  return vols;
}

/* ---------- LOD1: boxes + shader windows ---------- */
export function buildSimple(b, G) {
  G.setTransform(b.matrix);
  b.tiers.forEach((t, ti) => {
    for (const F of sideFrames(t)) {
      const { us } = bayGrid(F.len, b.bay), fac = facadeOf(b, F.side, ti), seed = b.seedF + F.side * 0.37;
      if (ti === 0) {
        G.set(b.base, b.tint, fac, seed); G.facadeRect(F, 0, F.len, 0, b.gh, 0, us);
        G.set(b.wall, b.tint, fac, seed); G.facadeRect(F, 0, F.len, b.gh, t.y1, 0, us);
      } else { G.set(b.wall, b.tint, fac, seed); G.facadeRect(F, 0, F.len, t.y0, t.y1, 0, us); }
    }
    const hw = t.w / 2, hd = t.d / 2;
    G.set(b.roofLayer, [1, 1, 1], NOFAC);
    if (ti < b.tiers.length - 1 || !b.roofType || b.roofType === 'flat') G.quad([t.ox - hw, t.y1, t.oz + hd], [t.ox + hw, t.y1, t.oz + hd], [t.ox + hw, t.y1, t.oz - hd], [t.ox - hw, t.y1, t.oz - hd], [-hw, -hd, hw, -hd, hw, hd, -hw, hd]);
  });
  addRoofShape(b, G);
}

function addRoofShape(b, G) {
  const R = roofPolys(b); if (!R) return;
  G.set(b.roofLayer, [1, 1, 1], NOFAC);
  for (const s of R.slopes) G.poly(s, slopeUV(s));
  if (R.top) G.poly(R.top, (q) => [q[0], -q[2]]);
  if (R.kind === 'hip') G.poly(R.bottom, (q) => [q[0], q[2]]);
}

/* ---------- LOD0: detailed facades ---------- */
export function buildDetailed(b, G, Gg) {
  G.setTransform(b.matrix); Gg.setTransform(b.matrix);
  const r = mulberry32(b.seed ^ 0x5bd1e995);
  b.tiers.forEach((t, ti) => {
    for (const F of sideFrames(t)) detailedSide(b, G, Gg, t, ti, F, r);
    if (ti < b.tiers.length - 1 || b.roofType === 'flat') flatRoof(b, G, t, ti, r);
  });
  if (b.roofType === 'mansard') mansard(b, G, Gg, r);
  if (b.roofType === 'hip') { addRoofShape(b, G); chimneys(b, G, r, b.H + b.roofH * 0.55, 1); }
  // haussmann: main cornice under the mansard
  if (b.style === 'haussmann') band(b, G, b.tiers[0], b.H - 0.55, 0.55, 0.45, L.LIMESTONE);
}

function band(b, G, t, y, h, prot, layer, tint = b.tint) { // horizontal ring moulding around a tier
  G.set(layer, tint, NOFAC);
  const hw = t.w / 2, hd = t.d / 2;
  G.box(t.ox, y + h / 2, t.oz + hd + prot / 2, t.w + 2 * prot, h, prot, ['nz']);
  G.box(t.ox, y + h / 2, t.oz - hd - prot / 2, t.w + 2 * prot, h, prot, ['pz']);
  G.box(t.ox + hw + prot / 2, y + h / 2, t.oz, prot, h, t.d, ['nx', 'pz', 'nz']);
  G.box(t.ox - hw - prot / 2, y + h / 2, t.oz, prot, h, t.d, ['px', 'pz', 'nz']);
}

const BAR_SKIP = ['py', 'ny'];
function frameBox(G, F, u, y, off, w, h, dep, bar) { // box aligned to a facade frame, centre (u, y), protruding 'dep' from offset 'off'
  const c = P(F, u, y, off + dep / 2), sk = bar ? BAR_SKIP : undefined;
  if (F.n[2] !== 0) G.box(c[0], c[1], c[2], w, h, dep, sk); else G.box(c[0], c[1], c[2], dep, h, w, sk);
}

function detailedSide(b, G, Gg, t, ti, F, r) {
  const { nb, be } = bayGrid(F.len, b.bay), blank = isBlank(b, F.side, ti), seed = b.seedF + F.side * 0.37;
  const rows = [];
  if (ti === 0) rows.push({ y0: 0, y1: b.gh, idx: 0 });
  let f = ti === 0 ? 1 : Math.round((t.y0 - b.gh) / b.fh) + 1;
  for (let y = Math.max(t.y0, b.gh); y < t.y1 - 0.01; y += b.fh, f++) rows.push({ y0: y, y1: Math.min(t.y1, y + b.fh), idx: f });
  const lastIdx = rows[rows.length - 1].idx;
  const tower = b.style === 'tower';

  for (const row of rows) {
    const ground = row.idx === 0, layer = ground ? b.base : b.wall, rh = row.y1 - row.y0;
    if (blank) { G.set(layer, b.tint, NOFAC); G.facadeRect(F, 0, F.len, row.y0, row.y1); continue; }
    if (tower && !ground) { curtainRow(b, G, Gg, F, row, nb, be, seed); continue; }
    const spec = ground ? WIN.ground : WIN[b.win];
    const doorBay = ground ? (b.style === 'brick' ? nb - 1 : Math.floor(nb / 2)) : -1;
    for (let k = 0; k < nb; k++) {
      const u0 = k * be, u1 = u0 + be;
      const isDoor = k === doorBay && F.side === 0;
      let ww = spec.ww * be, wh = spec.wh * rh, sill = spec.sill * rh;
      if (isDoor) { ww = Math.min(be * 0.62, 2.0); wh = Math.min(rh - 0.5, 3.0); sill = 0; }
      const wl = u0 + (be - ww) / 2, wr = wl + ww, wb = row.y0 + sill, wt = wb + wh;
      const dp = ground ? 0.32 : tower ? 0.08 : 0.24;
      G.set(layer, b.tint, NOFAC);
      G.facadeRect(F, u0, wl, row.y0, row.y1); G.facadeRect(F, wr, u1, row.y0, row.y1);
      if (sill > 0.001) G.facadeRect(F, wl, wr, row.y0, wb);
      G.facadeRect(F, wl, wr, wt, row.y1);
      // reveals
      G.quad(P(F, wl, wb, 0), P(F, wl, wb, -dp), P(F, wl, wt, -dp), P(F, wl, wt, 0), [0, wb, dp, wb, dp, wt, 0, wt]);
      G.quad(P(F, wr, wb, -dp), P(F, wr, wb, 0), P(F, wr, wt, 0), P(F, wr, wt, -dp), [0, wb, dp, wb, dp, wt, 0, wt]);
      G.quad(P(F, wl, wb, 0), P(F, wr, wb, 0), P(F, wr, wb, -dp), P(F, wl, wb, -dp), [wl, 0, wr, 0, wr, dp, wl, dp]);
      G.quad(P(F, wl, wt, -dp), P(F, wr, wt, -dp), P(F, wr, wt, 0), P(F, wl, wt, 0), [wl, 0, wr, 0, wr, dp, wl, dp]);
      if (isDoor) {
        G.set(L.WOOD, [0.55, 0.42, 0.35], NOFAC);
        G.quad(P(F, wl, wb, -dp), P(F, wr, wb, -dp), P(F, wr, wt, -dp), P(F, wl, wt, -dp), [wl, wb, wr, wb, wr, wt, wl, wt]);
        continue;
      }
      // glass with interior mapping
      Gg.set(b.mirror, b.glassTint, [k, row.idx, ww, wh], seed);
      Gg.quad(P(F, wl, wb, -dp), P(F, wr, wb, -dp), P(F, wr, wt, -dp), P(F, wl, wt, -dp), [0, 0, 1, 0, 1, 1, 0, 1]);
      // frame ring + mullion
      const fl = b.style === 'haussmann' || b.style === 'townhouse' ? L.WOOD : L.METAL;
      const ft = fl === L.WOOD ? [1.9, 1.85, 1.75] : [1, 1, 1], fw = 0.06, fo = -dp + 0.03;
      G.set(fl, ft, NOFAC);
      G.facadeRect(F, wl, wr, wb, wb + fw, fo); G.facadeRect(F, wl, wr, wt - fw, wt, fo);
      G.facadeRect(F, wl, wl + fw, wb, wt, fo); G.facadeRect(F, wr - fw, wr, wb, wt, fo);
      if (!ground && ww > 0.9) G.facadeRect(F, (wl + wr) / 2 - fw / 2, (wl + wr) / 2 + fw / 2, wb, wt, fo);
      if (!ground && wh > 1.3) G.facadeRect(F, wl, wr, wt - wh * 0.28, wt - wh * 0.28 + fw, fo);
      ornaments(b, G, F, row, ground, { wl, wr, wb, wt, ww, wh, u0, u1 }, r);
    }
    if (b.style === 'haussmann' && !ground && (row.idx === 2 || row.idx === lastIdx) && F.side !== 1 && F.side !== 3) balcony(b, G, F, row.y0, 0, F.len, 0.95);
    if (b.style === 'haussmann' && row.idx >= 2) { G.set(L.LIMESTONE, b.tint, NOFAC); frameBox(G, F, F.len / 2, row.y0 + 0.08, 0, F.len, 0.16, 0.1); }
    if (b.style === 'office' && !ground) { G.set(L.PRECAST, b.tint, NOFAC); frameBox(G, F, F.len / 2, row.y0 + 0.2, 0, F.len, 0.4, 0.12); }
  }
  // ground floor cornice / sign band
  if (!blank && ti === 0) {
    if (b.style === 'haussmann') { G.set(L.LIMESTONE, b.tint, NOFAC); frameBox(G, F, F.len / 2, b.gh - 0.2, 0, F.len, 0.4, 0.28); }
    if (b.style === 'brick' && F.side === 0) { G.set(L.METAL, [1.6, 1.6, 1.6], NOFAC); frameBox(G, F, F.len / 2, b.gh - 0.35, 0, F.len, 0.6, 0.12); }
    if (b.style === 'office' || b.style === 'tower') { G.set(L.METAL, [1, 1, 1], NOFAC); frameBox(G, F, F.len / 2, b.gh - 0.3, 0, F.len, 0.6, 0.25); }
  }
  if (!blank && b.style === 'office') { // vertical fins
    G.set(L.PRECAST, b.tint, NOFAC);
    for (let k = 0; k <= nb; k++) frameBox(G, F, Math.min(Math.max(k * be, 0.15), F.len - 0.15), (Math.max(t.y0, b.gh) + t.y1) / 2, 0, 0.3, t.y1 - Math.max(t.y0, b.gh), 0.35);
  }
}

function ornaments(b, G, F, row, ground, w, r) {
  if (ground) {
    if (b.style === 'brick' && b.awning && F.side === 0) { // fabric awning
      G.set(L.PLASTER, b.awning, NOFAC);
      const y = w.wt + 0.15, ext = 1.1;
      G.quad(P(F, w.wl - 0.15, y - 0.75, ext), P(F, w.wr + 0.15, y - 0.75, ext), P(F, w.wr + 0.15, y, 0.02), P(F, w.wl - 0.15, y, 0.02), [w.wl, 0, w.wr, 0, w.wr, 1.3, w.wl, 1.3]);
      G.quad(P(F, w.wl - 0.15, y - 1.0, ext), P(F, w.wr + 0.15, y - 1.0, ext), P(F, w.wr + 0.15, y - 0.75, ext), P(F, w.wl - 0.15, y - 0.75, ext), [w.wl, 0, w.wr, 0, w.wr, 0.25, w.wl, 0.25]);
    }
    return;
  }
  if (b.style === 'haussmann') {
    G.set(L.LIMESTONE, b.tint, NOFAC);
    frameBox(G, F, w.wl - 0.08, (w.wb + w.wt) / 2, 0, 0.16, w.wh, 0.06);
    frameBox(G, F, w.wr + 0.08, (w.wb + w.wt) / 2, 0, 0.16, w.wh, 0.06);
    frameBox(G, F, (w.wl + w.wr) / 2, w.wt + 0.12, 0, w.ww + 0.5, 0.24, 0.12);
    frameBox(G, F, (w.wl + w.wr) / 2, w.wb - 0.06, 0, w.ww + 0.3, 0.12, 0.12);
    if (row.idx !== 2 && r() < 0.5) balcony(b, G, F, w.wb, w.wl - 0.2, w.wr + 0.2, 0.0); // french balconette
  } else if (b.style === 'brick') {
    G.set(L.PRECAST, [1.05, 1.03, 1], NOFAC);
    frameBox(G, F, (w.wl + w.wr) / 2, w.wb - 0.05, 0, w.ww + 0.16, 0.1, 0.07);
    frameBox(G, F, (w.wl + w.wr) / 2, w.wt + 0.11, 0, w.ww + 0.2, 0.22, 0.02);
  } else if (b.style === 'townhouse') {
    G.set(L.WOOD, b.shutter, NOFAC);
    frameBox(G, F, w.wl - w.ww * 0.26, (w.wb + w.wt) / 2, 0.02, w.ww * 0.5, w.wh, 0.04);
    frameBox(G, F, w.wr + w.ww * 0.26, (w.wb + w.wt) / 2, 0.02, w.ww * 0.5, w.wh, 0.04);
    G.set(L.PLASTER, [1.05, 1.05, 1.05], NOFAC);
    frameBox(G, F, (w.wl + w.wr) / 2, w.wb - 0.05, 0, w.ww + 0.2, 0.1, 0.08);
  }
}

function balcony(b, G, F, y, u0, u1, depth) { // slab + wrought iron railing
  const len = u1 - u0, cu = (u0 + u1) / 2, dep = Math.max(depth, 0.25);
  G.set(L.LIMESTONE, b.tint, NOFAC); frameBox(G, F, cu, y - 0.09, 0, len, 0.18, dep);
  G.set(L.METAL, [1, 1, 1], NOFAC);
  frameBox(G, F, cu, y + 1.0, dep - 0.05, len, 0.05, 0.05); // top rail
  frameBox(G, F, cu, y + 0.12, dep - 0.05, len, 0.03, 0.03);
  const n = Math.max(2, Math.round(len / 0.22));
  for (let i = 0; i <= n; i++) frameBox(G, F, u0 + (len * i) / n, y + 0.5, dep - 0.04, 0.02, 1.0, 0.02, true);
  if (depth > 0) for (const uu of [u0 + 0.02, u1 - 0.02]) { // returns
    for (let k = 1; k < 4; k++) { const c = P(F, uu, y + 0.5, (dep * k) / 4); G.box(c[0], c[1], c[2], 0.02, 1.0, 0.02, ['py', 'ny']); }
  }
}

function curtainRow(b, G, Gg, F, row, nb, be, seed) {
  const rh = row.y1 - row.y0, spand = rh * (1 - WIN[3].wh);
  G.set(L.METAL, [1.4, 1.45, 1.5], NOFAC); // spandrel panel
  G.facadeRect(F, 0, F.len, row.y0, row.y0 + spand, -0.05);
  for (let k = 0; k < nb; k++) {
    const u0 = k * be, wl = u0 + be * 0.02, wr = u0 + be * 0.98, wb = row.y0 + spand, wt = row.y1;
    Gg.set(b.mirror, b.glassTint, [k, row.idx, wr - wl, wt - wb], seed);
    Gg.quad(P(F, wl, wb, -0.05), P(F, wr, wb, -0.05), P(F, wr, wt, -0.05), P(F, wl, wt, -0.05), [0, 0, 1, 0, 1, 1, 0, 1]);
  }
  // horizontal transom
  G.set(L.METAL, [1, 1, 1], NOFAC); frameBox(G, F, F.len / 2, row.y0 + spand, -0.05, F.len, 0.1, 0.12);
  for (let k = 0; k <= nb; k++) frameBox(G, F, Math.min(Math.max(k * be, 0.06), F.len - 0.06), (row.y0 + row.y1) / 2, -0.05, 0.12, rh, 0.22); // mullions
}

function flatRoof(b, G, t, ti, r) {
  const hw = t.w / 2, hd = t.d / 2, y = t.y1;
  G.set(b.roofLayer, [1, 1, 1], NOFAC);
  G.quad([t.ox - hw, y, t.oz + hd], [t.ox + hw, y, t.oz + hd], [t.ox + hw, y, t.oz - hd], [t.ox - hw, y, t.oz - hd], [-hw, -hd, hw, -hd, hw, hd, -hw, hd]);
  // parapet + coping
  const ph = b.style === 'tower' ? 1.4 : 1.0, th = 0.3, wl = b.style === 'tower' ? L.METAL : b.wall;
  G.set(wl, b.tint, NOFAC);
  G.box(t.ox, y + ph / 2, t.oz + hd - th / 2, t.w, ph, th, ['ny']);
  G.box(t.ox, y + ph / 2, t.oz - hd + th / 2, t.w, ph, th, ['ny']);
  G.box(t.ox + hw - th / 2, y + ph / 2, t.oz, th, ph, t.d - 2 * th, ['ny', 'pz', 'nz']);
  G.box(t.ox - hw + th / 2, y + ph / 2, t.oz, th, ph, t.d - 2 * th, ['ny', 'pz', 'nz']);
  G.set(L.PRECAST, [1.1, 1.1, 1.1], NOFAC);
  G.box(t.ox, y + ph + 0.05, t.oz + hd - th / 2, t.w + 0.1, 0.1, th + 0.1, ['ny']);
  G.box(t.ox, y + ph + 0.05, t.oz - hd + th / 2, t.w + 0.1, 0.1, th + 0.1, ['ny']);
  if (ti < b.tiers.length - 1) return;
  // rooftop equipment
  const ac = r.int(1, 3 + (b.style === 'office' ? 3 : 0));
  G.set(L.METAL, [3.2, 3.2, 3.2], NOFAC);
  for (let i = 0; i < ac; i++) {
    const sx = r.range(1.4, 2.6), sz = r.range(1.2, 2.2), sy = r.range(1.0, 1.8);
    G.box(t.ox + r.range(-hw + 2, hw - 2) * 0.8, y + sy / 2, t.oz + r.range(-hd + 2, hd - 2) * 0.8, sx, sy, sz, ['ny']);
  }
  if (b.style === 'brick') { // timber water tank on steel legs
    const cx = t.ox + r.range(-hw, hw) * 0.4, cz = t.oz + r.range(-hd, hd) * 0.4, rr = r.range(1.3, 1.9);
    G.set(L.METAL, [1, 1, 1], NOFAC);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) G.box(cx + dx * rr * 0.6, y + 1.1, cz + dz * rr * 0.6, 0.15, 2.2, 0.15);
    G.set(L.WOOD, [0.9, 0.85, 0.8], NOFAC); G.cylinder(cx, y + 2.2, cz, rr, 3.0, 12, false);
    G.set(L.ZINC, [0.7, 0.7, 0.7], NOFAC);
    const pts = []; for (let k = 11; k >= 0; k--) { const a = (k / 12) * Math.PI * 2; pts.push([cx + Math.cos(a) * rr * 1.05, y + 5.2, cz + Math.sin(a) * rr * 1.05]); }
    for (let k = 0; k < 12; k++) { const a = pts[k], c = pts[(k + 1) % 12]; G.poly([a, c, [cx, y + 6.0, cz]], (q) => [q[0] + q[2], q[1]]); }
  }
  if (b.style === 'office' || b.style === 'tower') { // mechanical penthouse
    const pw = t.w * r.range(0.3, 0.5), pd = t.d * r.range(0.3, 0.5), ph2 = r.range(3, 5);
    G.set(L.PRECAST, [0.9, 0.9, 0.92], NOFAC); G.box(t.ox, y + ph2 / 2, t.oz, pw, ph2, pd, ['ny']);
    G.set(L.METAL, [1, 1, 1], NOFAC);
    for (let i = 0; i < Math.round(pw / 1.2); i++) G.box(t.ox - pw / 2 + 0.6 + i * 1.2, y + ph2 / 2, t.oz + pd / 2 + 0.03, 0.08, ph2, 0.06);
    if (b.antenna) { G.cylinder(t.ox, y + ph2, t.oz, 0.35, 30, 8); G.cylinder(t.ox, y + ph2, t.oz, 0.9, 6, 8); }
  }
}

function mansard(b, G, Gg, r) {
  addRoofShape(b, G);
  const t = b.tiers[b.tiers.length - 1], H = t.y1, mh = b.roofH;
  // dormers on long sides, one per bay
  for (const F of sideFrames(t)) {
    if (F.side === 1 || F.side === 3) continue;
    const { nb, be } = bayGrid(F.len, b.bay), seed = b.seedF + F.side * 0.37;
    for (let k = 0; k < nb; k++) {
      if (r() < 0.15) continue;
      const cu = (k + 0.5) * be, dw = Math.min(1.3, be * 0.5), dh = mh * 0.72, y0 = H + 0.12;
      G.set(L.LIMESTONE, b.tint, NOFAC);
      frameBox(G, F, cu, y0 + dh / 2, -1.0, dw + 0.3, dh, 1.0);
      G.set(L.ZINC, [1, 1, 1], NOFAC); // small pitched cap
      const a = P(F, cu - dw / 2 - 0.25, y0 + dh, 0.05), c = P(F, cu + dw / 2 + 0.25, y0 + dh, 0.05), top = P(F, cu, y0 + dh + 0.5, 0.05);
      const a2 = P(F, cu - dw / 2 - 0.25, y0 + dh, -1.2), c2 = P(F, cu + dw / 2 + 0.25, y0 + dh, -1.2), top2 = P(F, cu, y0 + dh + 0.5, -1.2);
      G.quad(a, top, top2, a2, [0, 0, 0.8, 0, 0.8, 1.2, 0, 1.2]);
      G.quad(top, c, c2, top2, [0, 0, 0.8, 0, 0.8, 1.2, 0, 1.2]);
      G.poly([a, c, top], (q) => [q[0] + q[2], q[1]]);
      Gg.set(0, b.glassTint, [k, b.floors + 1, dw - 0.3, dh - 0.5], seed);
      Gg.quad(P(F, cu - dw / 2 + 0.15, y0 + 0.25, 0.005), P(F, cu + dw / 2 - 0.15, y0 + 0.25, 0.005), P(F, cu + dw / 2 - 0.15, y0 + dh - 0.25, 0.005), P(F, cu - dw / 2 + 0.15, y0 + dh - 0.25, 0.005), [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  }
  chimneys(b, G, r, H + mh, 0);
}

function chimneys(b, G, r, y, hip) {
  const t = b.tiers[b.tiers.length - 1], n = r.int(2, 3);
  for (let i = 0; i < n; i++) {
    const x = t.ox + (i / (n - 1 || 1) - 0.5) * t.w * 0.6, z = t.oz + (hip ? 0 : r.range(-1, 1) * t.d * 0.15), h = r.range(1.4, 2.2);
    G.set(L.BRICK, [0.95, 0.9, 0.85], NOFAC); G.box(x, y + h / 2 - 0.5, z, 0.9, h + 1, 0.6, ['ny']);
    G.set(L.PRECAST, [1, 1, 1], NOFAC); G.box(x, y + h + 0.55, z, 1.05, 0.12, 0.75);
    G.set(L.CLAY, [1, 1, 1], NOFAC); G.cylinder(x - 0.2, y + h + 0.6, z, 0.11, 0.45, 6); G.cylinder(x + 0.2, y + h + 0.6, z, 0.11, 0.45, 6);
  }
}
