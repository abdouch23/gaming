// Procedural city layout driven by user parameters.
// 1) road graph: grid (optionally rotated / jittered / curved = organic) or radial (rings + spokes)
// 2) blocks = graph faces inset by half road widths, rounded corners, sidewalks, lots
// 3) buildings placed along block frontage (any shape) with containment + overlap tests
// 4) road chains (polylines between intersections) for road surfaces, markings, parking and traffic
import { mulberry32, weightedPick } from '../core/rng.js';
import { STYLES, makeBuilding } from './BuildingGenerator.js';
import * as G2 from '../core/geom2d.js';

export const CURB_H = 0.15;

export const DEFAULT_PARAMS = {
  seed: 2026, type: 'grid', size: 8, blockSize: 88, blockAspect: 0.85,
  avenueW: 20, streetW: 12, avenueEvery: 3, sidewalk: 4.5, cornerR: 4.5,
  rotation: 0, jitter: 0, curve: 0,
  downtown: 0.34, towerDensity: 1, heightScale: 1, density: 1, parks: 0.05,
  trees: 1, cars: 1, lampSpacing: 30,
  styles: { haussmann: true, brick: true, office: true, tower: true, townhouse: true },
};

export const PRESETS = {
  manhattan: { label: 'مانهاتن', type: 'grid', size: 10, blockSize: 92, blockAspect: 0.6, avenueW: 22, streetW: 12, avenueEvery: 2, sidewalk: 4.5, cornerR: 3, rotation: 0, jitter: 0, curve: 0, downtown: 0.55, towerDensity: 1.8, heightScale: 1.5, density: 1, parks: 0.03, trees: 0.6, cars: 1.4, lampSpacing: 28, styles: { haussmann: false, brick: true, office: true, tower: true, townhouse: false } },
  paris: { label: 'باريس (دائرية)', type: 'radial', size: 8, blockSize: 82, blockAspect: 0.9, avenueW: 24, streetW: 12, avenueEvery: 2, sidewalk: 5, cornerR: 4, rotation: 0, jitter: 0, curve: 0, downtown: 0.12, towerDensity: 0.4, heightScale: 1, density: 1, parks: 0.06, trees: 1.4, cars: 1, lampSpacing: 26, styles: { haussmann: true, brick: false, office: true, tower: true, townhouse: false } },
  barcelona: { label: 'برشلونة', type: 'grid', size: 9, blockSize: 105, blockAspect: 1, avenueW: 20, streetW: 16, avenueEvery: 4, sidewalk: 5, cornerR: 15, rotation: 45, jitter: 0, curve: 0, downtown: 0.2, towerDensity: 0.5, heightScale: 0.9, density: 1, parks: 0.04, trees: 1.5, cars: 1, lampSpacing: 30, styles: { haussmann: true, brick: true, office: true, tower: false, townhouse: false } },
  oldtown: { label: 'مدينة قديمة', type: 'organic', size: 9, blockSize: 62, blockAspect: 0.9, avenueW: 14, streetW: 9, avenueEvery: 4, sidewalk: 3, cornerR: 2.5, rotation: 12, jitter: 0.32, curve: 0.75, downtown: 0, towerDensity: 0, heightScale: 0.8, density: 1, parks: 0.05, trees: 1, cars: 0.6, lampSpacing: 22, styles: { haussmann: true, brick: true, office: false, tower: false, townhouse: true } },
  suburb: { label: 'ضاحية', type: 'organic', size: 8, blockSize: 70, blockAspect: 0.8, avenueW: 16, streetW: 10, avenueEvery: 4, sidewalk: 3.5, cornerR: 6, rotation: 0, jitter: 0.12, curve: 0.45, downtown: 0, towerDensity: 0, heightScale: 1, density: 0.75, parks: 0.12, trees: 2, cars: 0.7, lampSpacing: 34, styles: { haussmann: false, brick: false, office: false, tower: false, townhouse: true } },
};

const DISTRICTS = {
  downtown: { tower: 6, office: 3 },
  midtown: { office: 3, haussmann: 5, brick: 2 },
  residential: { brick: 5, haussmann: 3, townhouse: 2 },
  suburb: { townhouse: 7, brick: 2 },
};

/* ------------------------------------------------------------------ graph */
class Graph {
  constructor() { this.nodes = []; this.edges = new Map(); }
  node(x, z) { this.nodes.push([x, z]); return this.nodes.length - 1; }
  key(a, b) { return a < b ? a + ',' + b : b + ',' + a; }
  edge(a, b, w, avenue) { this.edges.set(this.key(a, b), { a, b, w, avenue }); }
  get(a, b) { return this.edges.get(this.key(a, b)); }
}

function buildGrid(p, r) {
  const g = new Graph(), n = Math.max(2, Math.round(p.size)), nz = Math.max(2, Math.round(p.size));
  const roadW = (i) => (i % p.avenueEvery === 0 ? p.avenueW : p.streetW);
  const bw = Array.from({ length: n }, () => p.blockSize * r.range(0.85, 1.15));
  const bd = Array.from({ length: nz }, () => p.blockSize * p.blockAspect * r.range(0.85, 1.15));
  const lines = (sizes, count) => { // road centre-line coordinates
    const xs = []; let x = 0;
    for (let i = 0; i <= count; i++) { xs.push(x); if (i < count) x += roadW(i) / 2 + sizes[i] + roadW(i + 1) / 2; }
    const c = x / 2; return xs.map((v) => v - c);
  };
  const xs = lines(bw, n), zs = lines(bd, nz), rot = (p.rotation * Math.PI) / 180, cs = Math.cos(rot), sn = Math.sin(rot);
  const J = p.jitter * p.blockSize, id = [];
  for (let i = 0; i <= n; i++) {
    id.push([]);
    for (let j = 0; j <= nz; j++) {
      const x = xs[i] + (r() - 0.5) * J, z = zs[j] + (r() - 0.5) * J;
      id[i].push(g.node(x * cs - z * sn, x * sn + z * cs));
    }
  }
  for (let i = 0; i <= n; i++) for (let j = 0; j <= nz; j++) {
    if (i < n) g.edge(id[i][j], id[i + 1][j], roadW(j), j % p.avenueEvery === 0);
    if (j < nz) g.edge(id[i][j], id[i][j + 1], roadW(i), i % p.avenueEvery === 0);
  }
  const faces = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < nz; j++) faces.push({ nodes: [id[i][j], id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]] });
  return { g, faces };
}

function buildRadial(p, r) {
  const g = new Graph(), NA = 96, rings = Math.max(2, Math.round(p.size / 2) + 1), rot = (p.rotation * Math.PI) / 180;
  const ringW = (k) => (k % p.avenueEvery === 0 ? p.avenueW : p.streetW);
  const R = [Math.max(30, p.blockSize * 0.45)];
  for (let k = 0; k < rings; k++) R.push(R[k] + ringW(k) / 2 + p.blockSize * p.blockAspect * r.range(0.9, 1.1) + ringW(k + 1) / 2);
  const id = R.map((rad) => Array.from({ length: NA }, (_, a) => { const t = (a / NA) * Math.PI * 2 + rot; return g.node(Math.cos(t) * rad, Math.sin(t) * rad); }));
  for (let k = 0; k <= rings; k++) for (let a = 0; a < NA; a++) g.edge(id[k][a], id[k][(a + 1) % NA], ringW(k), k % p.avenueEvery === 0);
  const DIV = [6, 8, 12, 16, 24, 32, 48], faces = [];
  faces.push({ nodes: id[0].slice(), park: true, plaza: true });
  for (let k = 0; k < rings; k++) {
    const rm = (R[k] + R[k + 1]) / 2, want = (2 * Math.PI * rm) / (p.blockSize * 1.1);
    const S = DIV.reduce((best, d) => (Math.abs(d - want) < Math.abs(best - want) ? d : best), 6), step = NA / S;
    for (let s = 0; s < S; s++) {
      const a0 = s * step, a1 = a0 + step;
      g.edge(id[k][a0 % NA], id[k + 1][a0 % NA], a0 % (NA / 6) === 0 ? p.avenueW : p.streetW, a0 % (NA / 6) === 0);
      const nodes = [];
      for (let a = a0; a <= a1; a++) nodes.push(id[k][a % NA]);
      for (let a = a1; a >= a0; a--) nodes.push(id[k + 1][a % NA]);
      faces.push({ nodes });
    }
  }
  return { g, faces };
}

/** curved streets: split each edge into short segments displaced sideways by a sine arch */
function curveEdges(G, faces, amp, r) {
  const { g } = G;
  for (const e of [...g.edges.values()]) {
    const A = g.nodes[e.a], B = g.nodes[e.b], L = G2.dist(A, B), k = Math.max(2, Math.ceil(L / 14));
    const nrm = G2.inward(G2.norm(G2.sub(B, A))), off = (r() - 0.5) * 2 * amp * L * 0.12;
    const ids = [e.a];
    for (let i = 1; i < k; i++) {
      const t = i / k, s = Math.sin(Math.PI * t) * off;
      ids.push(g.node(A[0] + (B[0] - A[0]) * t + nrm[0] * s, A[1] + (B[1] - A[1]) * t + nrm[1] * s));
    }
    ids.push(e.b);
    g.edges.delete(g.key(e.a, e.b));
    for (let i = 0; i < ids.length - 1; i++) g.edge(ids[i], ids[i + 1], e.w, e.avenue);
    G.subs = G.subs || new Map(); G.subs.set(g.key(e.a, e.b), ids); // for face expansion
  }
  for (const f of faces) {
    const out = [];
    for (let i = 0; i < f.nodes.length; i++) {
      const a = f.nodes[i], b = f.nodes[(i + 1) % f.nodes.length], ids = G.subs.get(g.key(a, b));
      if (!ids) { out.push(a); continue; }
      const seq = ids[0] === a ? ids : ids.slice().reverse();
      for (let k = 0; k < seq.length - 1; k++) out.push(seq[k]);
    }
    f.nodes = out;
  }
}

/* ------------------------------------------------------------------ chains */
function buildChains(g) {
  const adj = new Map();
  const push = (n, e) => { if (!adj.has(n)) adj.set(n, []); adj.get(n).push(e); };
  for (const e of g.edges.values()) { push(e.a, e); push(e.b, e); }
  const seen = new Set(), chains = [];
  const walk = (start, e0) => {
    const nodes = [start]; let cur = start, e = e0;
    for (;;) {
      seen.add(e); const nx = e.a === cur ? e.b : e.a; nodes.push(nx); cur = nx;
      const list = adj.get(cur);
      if (list.length !== 2 || nx === start) break;
      const ne = list[0] === e ? list[1] : list[0];
      if (seen.has(ne)) break;
      e = ne;
    }
    return { nodes, w: e0.w, avenue: e0.avenue };
  };
  for (const [n, list] of adj) if (list.length !== 2) for (const e of list) if (!seen.has(e)) chains.push(walk(n, e));
  for (const e of g.edges.values()) if (!seen.has(e)) chains.push(walk(e.a, e)); // pure loops
  return { chains, adj };
}

/* ------------------------------------------------------------------ main */
export function generateLayout(params = {}) {
  const p = { ...DEFAULT_PARAMS, ...params, styles: { ...DEFAULT_PARAMS.styles, ...(params.styles || {}) } };
  const seed = p.seed | 0, r = mulberry32(seed);
  p.avenueEvery = Math.max(1, Math.round(p.avenueEvery));

  const G = p.type === 'radial' ? buildRadial(p, r) : buildGrid({ ...p, jitter: p.type === 'organic' ? Math.max(p.jitter, 0.18) : p.jitter }, r);
  const curve = p.type === 'organic' ? Math.max(p.curve, 0.35) : p.curve;
  if (curve > 0 && p.type !== 'radial') curveEdges(G, G.faces, curve, r);
  const g = G.g, nodes = g.nodes;

  let radius = 0; for (const n of nodes) radius = Math.max(radius, G2.len(n));
  const t1 = p.downtown, t2 = p.downtown + (1 - p.downtown) * 0.4, t3 = p.downtown + (1 - p.downtown) * 0.8;
  const enabled = Object.keys(STYLES).filter((s) => p.styles[s]);
  const stylePick = (district) => {
    const tbl = {};
    for (const [s, w] of Object.entries(DISTRICTS[district])) if (p.styles[s]) tbl[s] = w * (s === 'tower' ? p.towerDensity : 1);
    if (!Object.keys(tbl).length || Object.values(tbl).every((v) => v <= 0)) for (const s of enabled) tbl[s] = 1;
    return Object.keys(tbl).length ? weightedPick(r, tbl) : null;
  };

  /* ---------- blocks ---------- */
  const blocks = [], buildings = [], trees = [], lamps = [];
  let bid = 0;
  const parkPick = Math.floor(r() * G.faces.length);
  G.faces.forEach((f, fi) => {
    let ids = f.nodes.slice();
    let P = ids.map((i) => nodes[i]);
    if (G2.area(P) < 0) { ids.reverse(); P.reverse(); }
    const W = ids.map((a, i) => { const e = g.get(a, ids[(i + 1) % ids.length]); return e ? e.w / 2 : p.streetW / 2; });
    const outer = G2.inset(P, W);
    if (G2.area(outer) < 150) return;
    const curb = G2.roundCorners(outer, p.cornerR);
    const inner = G2.inset(curb, 0.3);
    const lot = G2.inset(curb, p.sidewalk);
    if (G2.area(lot) < 60) return;
    const c = G2.centroid(outer), dn = G2.len(c) / (radius || 1) + (r() - 0.5) * 0.1;
    const district = dn < t1 ? 'downtown' : dn < t2 ? 'midtown' : dn < t3 ? 'residential' : 'suburb';
    const park = !!f.park || (district !== 'downtown' && (r() < p.parks || (p.parks > 0.02 && fi === parkPick)));
    const block = { id: blocks.length, outer, curb, inner, lot, cx: c[0], cz: c[1], district, park, plaza: !!f.plaza, buildings: [], paths: [], lawn: park || district !== 'downtown' };
    blocks.push(block);
    if (park) { parkContents(block, r, p, trees); return; }

    // frontage runs: split the lot outline where the direction deviates > 30 deg
    const n = lot.length, rects = [];
    const runs = []; let run = [lot[0]], dir0 = G2.norm(G2.sub(lot[1], lot[0]));
    for (let i = 1; i <= n; i++) {
      const a = lot[i - 1], b = lot[i % n], t = G2.norm(G2.sub(b, a));
      if (G2.dot(t, dir0) < 0.866 && run.length > 1) { runs.push(run); run = [a]; dir0 = t; }
      run.push(b);
    }
    runs.push(run);
    for (const rp of runs) {
      const pl = new G2.Polyline(rp);
      if (pl.length < 7) continue;
      const placed = [];
      let s = 0;
      while (pl.length - s > 6) {
        const style = stylePick(district); if (!style) break;
        const S = STYLES[style];
        let w = r.range(S.lot[0], S.lot[1]);
        if (pl.length - s - w < S.lot[0] * 0.6) w = pl.length - s;
        w = Math.min(w, pl.length - s);
        const gap = S.contiguous ? 0.15 : r.range(2.5, 6);
        if (r() > p.density) { s += w; continue; }
        const bw2 = Math.max(6, w - (S.contiguous ? 0.3 : gap));
        const a = pl.at(s + (w - bw2) / 2), b = pl.at(s + (w + bw2) / 2), ax = G2.norm(G2.sub(b, a)), inw = G2.inward(ax);
        let front = 0; // sagitta: frontage curving into the lot
        for (const v of pl.between(s, s + w)) front = Math.max(front, G2.dot(G2.sub(v.p, a), inw));
        const setback = S.contiguous ? 0 : r.range(1.5, 4.5);
        const mid = G2.mul(G2.add(a, b), 0.5);
        let ok = null;
        for (const k of [1, 0.75, 0.55]) {
          const d = r.range(S.depth[0], S.depth[1]) * k; if (d < 7) break;
          const ctr = G2.add(mid, G2.mul(inw, front + setback + d / 2));
          const corners = G2.rectCorners(ctr, ax, bw2, d), test = G2.rectCorners(ctr, ax, bw2 - 0.4, d - 0.4);
          if (!test.every((q) => G2.pointInPoly(q, lot))) continue;
          if (rects.some((o) => G2.convexOverlap(test, o))) continue;
          ok = { ctr, corners, d }; break;
        }
        if (!ok) { s += 3; continue; }
        rects.push(ok.corners);
        const nOut = G2.mul(inw, -1);
        placed.push({ style, w: bw2, d: ok.d, ctr: ok.ctr, ax, angle: Math.atan2(nOut[0], nOut[1]), contiguous: S.contiguous, s0: s, s1: s + w });
        s += w;
      }
      // neighbouring row houses share blank party walls
      placed.forEach((q, k) => {
        const lx = [Math.cos(q.angle), -Math.sin(q.angle)]; // building local +x in world x/z
        const nb = [placed[k - 1], placed[k + 1]].filter((o) => o && o.contiguous && q.contiguous && Math.abs(o.angle - q.angle) < 0.06 && G2.dist(o.ctr, q.ctr) < (o.w + q.w) / 2 + 0.8);
        let left = false, right = false;
        for (const o of nb) { if (G2.dot(G2.sub(o.ctr, q.ctr), lx) > 0) right = true; else left = true; }
        const hs = q.style === 'tower' ? Math.max(0.6, 1.35 - dn * 0.8) : 1;
        const b = makeBuilding({ id: bid++, seed: (seed * 7349 + bid * 977) >>> 0, style: q.style, cx: q.ctr[0], cz: q.ctr[1], angle: q.angle, w: q.w, d: q.d, heightScale: hs * p.heightScale, blankLeft: left, blankRight: right });
        b.block = block; block.buildings.push(b); buildings.push(b);
      });
    }
    // courtyard / garden trees
    if (block.lawn && p.trees > 0) {
      const A = G2.area(lot), want = Math.round((A / 380) * p.trees * (district === 'suburb' ? 1.4 : 0.8));
      const box = bbox(lot);
      for (let k = 0, tries = 0; k < want && tries < want * 8; tries++) {
        const q = [r.range(box[0], box[2]), r.range(box[1], box[3])];
        if (!G2.pointInPoly(q, lot) || G2.distToPoly(q, lot) < 1.5) continue;
        if (rects.some((rc) => G2.pointInPoly(q, rc) || G2.distToPoly(q, rc) < 3)) continue;
        trees.push({ x: q[0], z: q[1], s: r.range(0.75, 1.2), species: r() < 0.4 ? 'round' : r() < 0.3 ? 'conifer' : 'broad', y: CURB_H + 0.1 }); k++;
      }
    }
  });

  /* ---------- street furniture along every curb ---------- */
  for (const b of blocks) {
    const pl = new G2.Polyline(b.curb, true), L = pl.length;
    const corner = (s) => G2.dot(pl.tangent((s - 5 + L) % L), pl.tangent((s + 5) % L)) < 0.9;
    const lampS = [];
    for (let s = p.lampSpacing * 0.5; s < L - 4; s += p.lampSpacing) {
      if (corner(s)) { s += 4 - p.lampSpacing; continue; }
      const q = pl.at(s), t = pl.tangent(s), nIn = G2.inward(t), pos = G2.add(q, G2.mul(nIn, 0.55));
      lamps.push({ x: pos[0], z: pos[1], ry: Math.atan2(-nIn[0], -nIn[1]) }); lampS.push(s);
    }
    const prob = (b.district === 'downtown' ? 0.5 : 1) * p.trees * (b.park ? 1 : 0.85);
    for (let s = 6; s < L - 4; s += 9.5) {
      if (corner(s) || lampS.some((ls) => Math.abs(ls - s) < 3) || r() > prob) continue;
      const q = pl.at(s), nIn = G2.inward(pl.tangent(s)), pos = G2.add(q, G2.mul(nIn, 1.0));
      trees.push({ x: pos[0], z: pos[1], s: r.range(0.85, 1.2), species: b.district === 'suburb' && r() < 0.5 ? 'round' : 'broad', y: CURB_H });
    }
  }

  /* ---------- road chains, intersections, parking, traffic ---------- */
  const { chains: raw, adj } = buildChains(g);
  const nodeChains = new Map();
  const chains = raw.map((c, ci) => {
    const pts = c.nodes.map((i) => nodes[i]), pl = new G2.Polyline(pts);
    const ch = { id: ci, a: c.nodes[0], b: c.nodes[c.nodes.length - 1], pl, w: c.w, avenue: c.avenue, trimA: 0, trimB: 0 };
    for (const [n, end] of [[ch.a, 'a'], [ch.b, 'b']]) { if (!nodeChains.has(n)) nodeChains.set(n, []); nodeChains.get(n).push({ ch, end }); }
    return ch;
  });
  const endDir = (ref) => (ref.end === 'a' ? ref.ch.pl.tangent(0) : G2.mul(ref.ch.pl.tangent(ref.ch.pl.length), -1)); // pointing away from node
  for (const [, refs] of nodeChains) {
    for (const ref of refs) {
      if (refs.length < 3) continue; // straight continuation / dead end: no intersection
      const d0 = endDir(ref);
      let trim = 0;
      for (const o of refs) {
        if (o === ref) continue;
        const s = Math.abs(G2.cross(d0, endDir(o)));
        if (s < 0.25) continue;
        trim = Math.max(trim, Math.min((o.ch.w / 2) / s, o.ch.w * 1.5));
      }
      trim += p.cornerR * 0.8 + 0.5;
      if (ref.end === 'a') ref.ch.trimA = trim; else ref.ch.trimB = trim;
    }
  }
  for (const ch of chains) { // very short chains: shrink trims proportionally
    const tot = ch.trimA + ch.trimB, L = ch.pl.length;
    if (tot > L - 1) { const k = Math.max(0, L - 1) / tot; ch.trimA *= k; ch.trimB *= k; }
    ch.s0 = ch.trimA; ch.s1 = L - ch.trimB;
    ch.park = ch.w >= 11 ? 2.5 : 0;
    ch.lanes = Math.max(1, Math.floor((ch.w / 2 - ch.park) / 3.2));
    ch.laneW = (ch.w / 2 - ch.park) / ch.lanes;
    ch.cross = { a: (nodeChains.get(ch.a) || []).length >= 3, b: (nodeChains.get(ch.b) || []).length >= 3 };
  }
  const intersections = [];
  for (const [n, refs] of nodeChains) {
    if (refs.length < 3) continue;
    const pts = [];
    for (const ref of refs) {
      const s = ref.end === 'a' ? ref.ch.s0 : ref.ch.s1, q = ref.ch.pl.at(s), nr = G2.inward(ref.ch.pl.tangent(s)), hw = ref.ch.w / 2;
      pts.push(G2.add(q, G2.mul(nr, hw)), G2.sub(q, G2.mul(nr, hw)));
    }
    pts.push(nodes[n]);
    intersections.push({ node: n, poly: G2.convexHull(pts) });
  }
  const parked = [];
  for (const ch of chains) {
    if (!ch.park) continue;
    for (const side of [1, -1]) for (let s = ch.s0 + 6; s < ch.s1 - 6; s += 6.2) {
      if (r() > 0.35 * p.cars) continue;
      const q = ch.pl.at(s), t = ch.pl.tangent(s), nr = G2.inward(t), off = side * (ch.w / 2 - ch.park / 2 - 0.1);
      const dir = side > 0 ? G2.mul(t, -1) : t; // cars park facing their lane's traffic direction
      parked.push({ x: q[0] - nr[0] * off, z: q[1] - nr[1] * off, ry: Math.atan2(dir[0], dir[1]) });
    }
  }

  const hull = G2.convexHull(nodes);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const n of nodes) { minX = Math.min(minX, n[0]); maxX = Math.max(maxX, n[0]); minZ = Math.min(minZ, n[1]); maxZ = Math.max(maxZ, n[1]); }
  void adj;
  return {
    params: p, seed, nodes, blocks, buildings, chains, nodeChains, intersections, parked, lamps, trees, hull, radius,
    bounds: { minX, maxX, minZ, maxZ }, totX: maxX - minX + p.avenueW, totZ: maxZ - minZ + p.avenueW, maxW: Math.max(p.avenueW, p.streetW),
  };
}

function bbox(P) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const q of P) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); }
  return [a, b, c, d];
}

function parkContents(block, r, p, trees) {
  const lot = block.lot, c = G2.centroid(lot), box = bbox(lot);
  // two crossing gravel paths through the centre
  const a0 = r() * Math.PI;
  for (const a of [a0, a0 + Math.PI / 2]) {
    const d = [Math.cos(a), Math.sin(a)], ends = [];
    for (const sgn of [1, -1]) {
      let lo = 0, hi = 2000;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (G2.pointInPoly(G2.add(c, G2.mul(d, sgn * m)), lot)) lo = m; else hi = m; }
      ends.push(G2.add(c, G2.mul(d, sgn * Math.max(0, lo - 0.5))));
    }
    block.paths.push({ a: ends[0], b: ends[1], w: block.plaza ? 5 : 3 });
  }
  if (block.plaza) block.paths.push({ ring: true, c, r: Math.min(box[2] - box[0], box[3] - box[1]) * 0.22 });
  const A = G2.area(lot), want = Math.round((A / 140) * Math.max(0.2, p.trees));
  for (let k = 0, tries = 0; k < want && tries < want * 6; tries++) {
    const q = [r.range(box[0], box[2]), r.range(box[1], box[3])];
    if (!G2.pointInPoly(q, lot) || G2.distToPoly(q, lot) < 2) continue;
    if (block.paths.some((pa) => (pa.ring ? Math.abs(G2.dist(q, pa.c) - pa.r) < 4 || G2.dist(q, pa.c) < pa.r * 0.6 : segDist(q, pa.a, pa.b) < pa.w / 2 + 2.5))) continue;
    const rr = r();
    trees.push({ x: q[0], z: q[1], s: r.range(0.85, 1.45), species: rr < 0.45 ? 'broad' : rr < 0.75 ? 'conifer' : 'round', y: CURB_H + 0.1 }); k++;
  }
}
function segDist(p, a, b) {
  const ab = G2.sub(b, a), t = Math.max(0, Math.min(1, G2.dot(G2.sub(p, a), ab) / (G2.dot(ab, ab) || 1)));
  return G2.dist(p, G2.add(a, G2.mul(ab, t)));
}
