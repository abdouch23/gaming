// Khenchela 1954 terrain (from the user's "خنشلة 1954 – مرحلة FPS (1 كم²)" map), baked into 1 m fields.
// World coords = Khenchela coords + KOFF, so the army barracks sits on the existing compound at (0, -55).
// Noise functions are ported verbatim from the map file; heights, roads and the oued are baked once at load
// so every gameplay query (walk height, line of sight, grass, AI) is a constant-time bilinear lookup.
import type { V2 } from "@/lib/barracks/map";

export const KOFF = { x: 250, z: 175 };
export const k2w = (x: number, z: number): V2 => [x + KOFF.x, z + KOFF.z];

// ---- noise (verbatim) ----
function hh(x: number, y: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vn(x: number, y: number, s: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hh(ix, iy, s), b = hh(ix + 1, iy, s), c = hh(ix, iy + 1, s), d = hh(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm2(x: number, y: number, s: number, o: number) {
  let a = 0.5, f = 1, sum = 0, nr = 0;
  for (let i = 0; i < o; i++) {
    sum += a * vn(x * f + i * 17.3, y * f - i * 9.1, s + i * 7);
    nr += a;
    f *= 2.03;
    a *= 0.5;
  }
  return sum / nr;
}
const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const pathC = (z: number) => 26 * Math.sin(z * 0.011 + 0.6) + 9 * Math.sin(z * 0.037);
function pathW(x: number, z: number) {
  const d = Math.abs(x - pathC(z)) + (vn(x * 0.2, z * 0.2, 31) - 0.5) * 1.3;
  return 1 - ss(1.2, 2.6, d);
}
/** raw Khenchela height in Khenchela coordinates */
export function H0(x: number, z: number) {
  return (fbm2(x * 0.0042, z * 0.0042, 3, 3) - 0.5) * 58 + (fbm2(x * 0.019, z * 0.019, 5, 3) - 0.5) * 5.2 + (vn(x * 0.31, z * 0.31, 9) - 0.5) * 0.34 + (vn(x * 1.3, z * 1.3, 11) - 0.5) * 0.1 - 0.2 * pathW(x, z);
}
export const forestAt = (wx: number, wz: number) => fbm2((wx - KOFF.x) * 0.0075 + 13, (wz - KOFF.z) * 0.0075 - 7, 61, 3);

// ---- Catmull-Rom + resample (verbatim logic) ----
type P = { x: number; z: number };
export function catmull(pts: P[], step: number) {
  const out: P[] = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const L = Math.hypot(p2.x - p1.x, p2.z - p1.z), k = Math.max(2, Math.ceil(L / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  out.push({ x: pts[n - 1].x, z: pts[n - 1].z });
  return out;
}
export function resamp(pts: P[], step: number) {
  const out: P[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let L = Math.hypot(b.x - a.x, b.z - a.z);
    while (acc + L >= step && L > 0) {
      const t = (step - acc) / L;
      a = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      out.push(a);
      L = Math.hypot(b.x - a.x, b.z - a.z);
      acc = 0;
    }
    acc += L;
  }
  out.push({ x: pts[pts.length - 1].x, z: pts[pts.length - 1].z });
  return out;
}

// ---- road network of the map file (Khenchela coords), extended with our tracks ----
const NODES: Record<string, V2> = { J: [30, 22], M: [-20, 36], J2: [-75, 26], HS: [-20, 22], PO: [170, 150], GE: [230, -214], AR: [-250, -168], PW: [340, 352], RA: [-392, 372], DI: [-435, -415] };
const DEFS: [string, string, V2[], "main" | "track"][] = [
  ["J", "M", [[5, 32]], "main"], ["M", "J2", [[-50, 34]], "main"], ["M", "HS", [], "main"],
  ["J", "PO", [[100, 60], [115, 105], [125, 150]], "main"], ["J", "GE", [[90, -40], [150, -120], [215, -185]], "main"],
  ["PO", "PW", [[215, 190], [265, 255], [290, 320], [315, 357]], "main"], ["J2", "AR", [[-110, -40], [-170, -110], [-215, -150]], "main"],
  ["J2", "RA", [[-130, 100], [-170, 190], [-290, 270], [-380, 350]], "track"], ["AR", "DI", [[-330, -190], [-335, -260], [-390, -340]], "track"],
];
export interface Road { pts: P[]; hw: number; t: "main" | "track" | "lane" }
export const ROADS: Road[] = [];
const kp = ([x, z]: V2): P => ({ x: x + KOFF.x, z: z + KOFF.z });
for (const [a, b, via, t] of DEFS) ROADS.push({ pts: resamp(catmull([kp(NODES[a]), ...via.map(kp), kp(NODES[b])], 3), 3), hw: t === "main" ? 3.2 : 2.2, t });
/** world-space lanes we add (gate spur, compound ring road, dachra lanes, mill path) */
export function addLane(pts: V2[], hw = 1.6) {
  ROADS.push({ pts: resamp(catmull(pts.map(([x, z]) => ({ x, z })), 3), 3), hw, t: "lane" });
}

// ---- baked fields ----
export const FIELD = { minX: -320, maxX: 670, minZ: -350, maxZ: 660 };
const W = FIELD.maxX - FIELD.minX + 1, D = FIELD.maxZ - FIELD.minZ + 1;
let HF: Float32Array | null = null; // final height
let RF: Float32Array | null = null; // distance to road edge (m, clamped 30)
let OF: Float32Array | null = null; // oued depth

const idx = (i: number, j: number) => j * W + i;
function bil(F: Float32Array, x: number, z: number) {
  let u = x - FIELD.minX, v = z - FIELD.minZ;
  u = Math.min(W - 1.001, Math.max(0, u));
  v = Math.min(D - 1.001, Math.max(0, v));
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const a = F[idx(i, j)], b = F[idx(i + 1, j)], c = F[idx(i, j + 1)], d = F[idx(i + 1, j + 1)];
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}
export const fieldHeight = (x: number, z: number) => bil(HF!, x, z);
export const fieldRoad = (x: number, z: number) => bil(RF!, x, z);
export const fieldOued = (x: number, z: number) => bil(OF!, x, z);

export interface Pad { x: number; z: number; r: number; fall: number; y?: number; rect?: [number, number, number, number] }
export interface Bake {
  pads: Pad[]; // flattened areas (POIs, compound, dachra…) — y = target height (defaults to the raw height at the centre)
  oued: V2[];
  bumps: { x: number; z: number; r: number; h: number; sx?: number }[];
  base: (wx: number, wz: number) => number; // raw height in world coords
}

/** bake the fields once; ~1 M samples */
export function bakeFields(cfg: Bake) {
  const H = new Float32Array(W * D), R = new Float32Array(W * D).fill(30), O = new Float32Array(W * D);
  for (let j = 0; j < D; j++) {
    const z = FIELD.minZ + j;
    for (let i = 0; i < W; i++) H[j * W + i] = cfg.base(FIELD.minX + i, z);
  }
  HF = H;
  // pads: blend toward a flat height
  for (const p of cfg.pads) {
    const y = p.y ?? bil(H, p.x, p.z);
    p.y = y;
    const ext = p.rect ? Math.max(p.rect[1] - p.rect[0], p.rect[3] - p.rect[2]) / 2 + p.fall : p.r + p.fall;
    const i0 = Math.max(0, Math.floor(p.x - ext - FIELD.minX)), i1 = Math.min(W - 1, Math.ceil(p.x + ext - FIELD.minX));
    const j0 = Math.max(0, Math.floor(p.z - ext - FIELD.minZ)), j1 = Math.min(D - 1, Math.ceil(p.z + ext - FIELD.minZ));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = FIELD.minX + i, z = FIELD.minZ + j;
        let d: number;
        if (p.rect) {
          const dx = Math.max(0, p.rect[0] - x, x - p.rect[1]), dz = Math.max(0, p.rect[2] - z, z - p.rect[3]);
          d = Math.hypot(dx, dz);
        } else d = Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r);
        const w = 1 - ss(0, p.fall, d);
        if (w > 0) H[j * W + i] += (y - H[j * W + i]) * w;
      }
  }
  for (const b of cfg.bumps) {
    const ext = b.r * (b.sx ?? 1) + 2;
    for (let j = Math.max(0, Math.floor(b.z - ext - FIELD.minZ)); j <= Math.min(D - 1, Math.ceil(b.z + ext - FIELD.minZ)); j++)
      for (let i = Math.max(0, Math.floor(b.x - ext - FIELD.minX)); i <= Math.min(W - 1, Math.ceil(b.x + ext - FIELD.minX)); i++) {
        const x = FIELD.minX + i, z = FIELD.minZ + j;
        const kd = Math.hypot((x - b.x) / (b.sx ?? 1), z - b.z);
        H[j * W + i] += b.h * (1 - ss(b.r * 0.22, b.r, kd)) + 0.6 * Math.sin(x * 0.7) * Math.sin(z * 0.6) * (1 - ss(0, b.r, kd));
      }
  }
  // roads: smoothed profile along each road (4 passes, ±8 samples, as in the map file), blended in by distance
  const RH = new Float32Array(W * D);
  for (const r of ROADS) {
    let h = r.pts.map((p) => bil(H, p.x, p.z));
    for (let pass = 0; pass < 4; pass++) {
      const g = h.slice();
      for (let i = 0; i < h.length; i++) {
        let s = 0, c = 0;
        for (let k = Math.max(0, i - 8); k <= Math.min(h.length - 1, i + 8); k++) {
          s += h[k];
          c++;
        }
        g[i] = s / c;
      }
      h = g;
    }
    const reach = r.hw + 8;
    r.pts.forEach((p, n) => {
      for (let j = Math.max(0, Math.floor(p.z - reach - FIELD.minZ)); j <= Math.min(D - 1, Math.ceil(p.z + reach - FIELD.minZ)); j++)
        for (let i = Math.max(0, Math.floor(p.x - reach - FIELD.minX)); i <= Math.min(W - 1, Math.ceil(p.x + reach - FIELD.minX)); i++) {
          const k = j * W + i;
          const d = Math.hypot(FIELD.minX + i - p.x, FIELD.minZ + j - p.z) - r.hw;
          if (d < R[k]) {
            R[k] = Math.max(-r.hw, d);
            RH[k] = h[n];
          }
        }
    });
  }
  for (let k = 0; k < H.length; k++) {
    const d = R[k];
    if (d < 6) H[k] += (RH[k] - H[k]) * (1 - ss(1.5, 6, d));
    R[k] = Math.max(0, Math.min(30, d));
  }
  // the oued: a 2.3 m deep dry bed
  const oued = resamp(catmull(cfg.oued.map(([x, z]) => ({ x, z })), 2), 2);
  const OD = new Float32Array(W * D).fill(99);
  for (const p of oued)
    for (let j = Math.max(0, Math.floor(p.z - 7 - FIELD.minZ)); j <= Math.min(D - 1, Math.ceil(p.z + 7 - FIELD.minZ)); j++)
      for (let i = Math.max(0, Math.floor(p.x - 7 - FIELD.minX)); i <= Math.min(W - 1, Math.ceil(p.x + 7 - FIELD.minX)); i++) {
        const k = j * W + i, d = Math.hypot(FIELD.minX + i - p.x, FIELD.minZ + j - p.z);
        if (d < OD[k]) OD[k] = d;
      }
  for (let k = 0; k < H.length; k++) {
    const dep = 2.3 * (1 - ss(2.2, 5.5, OD[k]));
    O[k] = dep;
    H[k] -= dep * (R[k] < 2 ? 0.25 : 1); // shallow ford where a road crosses
  }
  RF = R;
  OF = O;
}
