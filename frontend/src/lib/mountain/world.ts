// «الطريق إلى الجبل» — world for the mountain level.
// Real Aurès elevation (SRTM-derived, see scripts/fetch_dem.py) is the base; the playable 260 × 180 m is
// carved into it from the design document: town edge (south) → fork rock → valley (east, ~170 m) or
// ridge (west, ~260 m) → shepherd's shelter (north, ~60 m higher). +X east, −Z north.
import { mulberry32 } from "@/lib/lighting";

export type V2 = [number, number];
export interface DemLayer { n: number; spacing: number; min: number; scale: number; data: Uint16Array }
export interface DemMeta { center: [number, number]; source: string; layers: Record<"near" | "far", Omit<DemLayer, "data">> }

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------- layout (from the PDF's top-down plan, origin at the fork rock) ----------------
export const PLAY = { minX: -125, maxX: 125, minZ: -128, maxZ: 48 };
export const TOWN = { x: 0, z: 40 };
export const SPAWN = { x: 0, z: 36, yaw: 0 };
export const LAKHDAR_START = { x: 1.6, z: 35 };
export const LEFT_TOWN = { z: 24 }; // first slope after the last house → mc.left_town
export const FORK = { x: 0, z: 0, r: 2.6, h: 1.5 };
export const SHELTER = { x: 10, z: -118 };
export const FIRE = { x: 11.1, z: -117.3 };
export const LAKHDAR_REST = { x: 8.9, z: -118.3 };
export const VALLEY: V2[] = [[3, -1], [8, -2.5], [26, -6], [44.6, -9.8], [62, -19], [74.6, -31.7], [80, -48], [82.3, -57.8], [79, -75], [73.5, -90.7], [60, -109.7], [40, -116], [22, -117.7], [13, -118]];
export const RIDGE: V2[] = [[-3, -1], [-8, -2.5], [-22, -7], [-37, -12], [-56, -17], [-78, -22], [-93, -36], [-98, -56], [-92, -70], [-84, -84], [-73.7, -95], [-56, -104], [-37, -111], [-20, -116], [-2, -118], [7, -118]];
export const PATROL: V2[] = [[97, -26], [98, -52], [96, -78]];
export const OBSERVER = { x: 84, z: -119 };
export const HILL = { x: 72, z: -108, r: 9, h: 3.4 }; // the small hill that hides you from the observer
export const CACHE_VALLEY = { x: 70, z: -46 };
export const CACHE_RIDGE = { x: -95.6, z: -62 };
export const HOUSES = [{ x: -18, z: 42, w: 7, d: 6 }, { x: 0, z: 46, w: 6, d: 5.5 }, { x: 18, z: 42, w: 7, d: 6 }];

// ---------------- polylines ----------------
interface Poly { pts: V2[]; cum: number[]; len: number }
function poly(pts: V2[]): Poly {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
export const VALLEY_P = poly(VALLEY), RIDGE_P = poly(RIDGE);
/** the stream runs along the west side of the bed; the dry strip under the east bank is the patrol's dead ground */
export const STREAM: V2[] = VALLEY.slice(1, -2).map(([x, z], i, a) => {
  const [nx, nz] = a[Math.min(a.length - 1, i + 1)], [px, pz] = a[Math.max(0, i - 1)];
  const tx = nx - px, tz = nz - pz, tl = Math.hypot(tx, tz) || 1;
  return [x + (tz / tl) * 2.6, z - (tx / tl) * 2.6];
});
export const STREAM_P = poly(STREAM);
/** distance to a polyline and the arclength of the closest point */
export function nearest(p: Poly, x: number, z: number) {
  let best = Infinity, s = 0;
  for (let i = 0; i < p.pts.length - 1; i++) {
    const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) {
      best = d;
      s = p.cum[i] + t * Math.sqrt(L2);
    }
  }
  return { d: best, s };
}
export function pointAt(p: Poly, s: number): V2 {
  s = Math.max(0, Math.min(p.len, s));
  for (let i = 0; i < p.pts.length - 1; i++) {
    if (s <= p.cum[i + 1]) {
      const t = (s - p.cum[i]) / (p.cum[i + 1] - p.cum[i] || 1);
      return [lerp(p.pts[i][0], p.pts[i + 1][0], t), lerp(p.pts[i][1], p.pts[i + 1][1], t)];
    }
  }
  return p.pts[p.pts.length - 1];
}
function inPoly(x: number, z: number, pts: V2[]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// the massif between the two routes (impassable core, kept below the fork→shelter sight line)
const INNER: V2[] = [[-12, -10], [-62, -32], [-72, -60], [-62, -92], [-32, -104], [0, -106], [44, -103], [64, -84], [68, -56], [58, -32], [14, -10]];
export const COLD_ZONES: { pts: V2[]; k: number }[] = [
  { pts: [[-30, -4], [-80, -10], [-112, -34], [-118, -70], [-100, -104], [-50, -126], [-4, -127], [-4, -110], [-48, -98], [-72, -84], [-82, -56], [-72, -32], [-32, -20]], k: 1 },
  { pts: [[40, -80], [100, -80], [100, -128], [30, -128], [30, -110]], k: 0.5 },
];
export const coldAt = (x: number, z: number) => COLD_ZONES.reduce((m, c) => (inPoly(x, z, c.pts) ? Math.max(m, c.k) : m), 0);

// ---------------- DEM ----------------
let NEAR: DemLayer, FAR: DemLayer;
let REF = 0; // DEM elevation (m) that maps to y = 0 (the town edge)
function demAt(L: DemLayer, x: number, z: number) {
  const half = ((L.n - 1) / 2) * L.spacing;
  let u = (x + half) / L.spacing, v = (z + half) / L.spacing;
  u = Math.min(L.n - 1.001, Math.max(0, u));
  v = Math.min(L.n - 1.001, Math.max(0, v));
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, n = L.n, d = L.data;
  const a = d[j * n + i], b = d[j * n + i + 1], c = d[(j + 1) * n + i], e = d[(j + 1) * n + i + 1];
  return L.min + (a + (b - a) * fu + (c - a) * fv + (a - b - c + e) * fu * fv) * L.scale;
}
export const nearRaw = (x: number, z: number) => demAt(NEAR, x, z) - REF;
export const farRaw = (x: number, z: number) => demAt(FAR, x, z) - REF;
export const nearHalf = () => ((NEAR.n - 1) / 2) * NEAR.spacing;
export const farHalf = () => ((FAR.n - 1) / 2) * FAR.spacing;
export const demElevation = (y: number) => y + REF;

export async function loadDem(base = "/terrain") {
  const meta: DemMeta = await (await fetch(`${base}/aures.json`)).json();
  const get = async (k: "near" | "far") => ({ ...meta.layers[k], data: new Uint16Array(await (await fetch(`${base}/aures-${k}.bin`)).arrayBuffer()) });
  const [near, far] = await Promise.all([get("near"), get("far")]);
  return { meta, near, far };
}

// ---------------- noise for auto-generated detail ----------------
function hash(x: number, z: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x: number, z: number, s: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm(x: number, z: number, s: number, o: number) {
  let a = 0.5, f = 1, sum = 0, nr = 0;
  for (let i = 0; i < o; i++) {
    sum += a * vn(x * f + i * 17.3, z * f - i * 9.1, s + i * 7);
    nr += a;
    f *= 2.03;
    a *= 0.5;
  }
  return sum / nr;
}
/** ridged noise: sharp crests for rocky outcrops */
const ridged = (x: number, z: number, s: number) => 1 - Math.abs(fbm(x, z, s, 4) * 2 - 1);

// ---------------- the carved design ----------------
export const PROFILE = { town: 0, fork: 2.2, end: 0, ridgeTop: 0 };
const FIELD = { minX: -320, maxX: 320, minZ: -320, maxZ: 320 };
const FW = FIELD.maxX - FIELD.minX + 1, FD = FIELD.maxZ - FIELD.minZ + 1;
let HF: Float32Array, MASK: Float32Array, WATER: Float32Array;

/** valley bed elevation along its arclength */
export function valleyBed(s: number) {
  // a long gentle bed, then the valley head climbs steeply (≤ 24°) to the shelter shoulder
  const top = VALLEY_P.len - 8, knee = top - 60, kneeY = PROFILE.end - 0.4 * 60;
  if (s <= knee) return lerp(PROFILE.fork, kneeY, s / knee);
  return lerp(kneeY, PROFILE.end, Math.min(1, (s - knee) / 60));
}
/** ridge path elevation along its arclength: steep climb, long cold traverse, gentle drop to the shelter */
export function ridgePath(s: number) {
  const climb = Math.min(PROFILE.ridgeTop, PROFILE.fork + 0.39 * s);
  const tail = smoothstep(RIDGE_P.len - 70, RIDGE_P.len, s);
  return lerp(climb, PROFILE.end, tail) + Math.sin(s * 0.09) * 0.5 * (1 - tail) * smoothstep(20, 60, s);
}
const clampCone = (h: number, path: number, d: number, flat: number, down: number, up: number) => {
  if (d <= flat) return path;
  const e = d - flat;
  return Math.min(Math.max(h, path - down * e), path + up * e);
};

function designAt(x: number, z: number) {
  // baseline: the real slope, rebased; the DEM's own relief kept as micro-terrain
  let h = nearRaw(x, z);
  const inner = inPoly(x, z, INNER);
  // town edge + fork plateau
  const tw = 1 - smoothstep(6, 20, Math.hypot((x - TOWN.x) * 0.6, z - TOWN.z));
  h = lerp(h, PROFILE.town + (TOWN.z - z) * 0.05, tw);
  const fw = 1 - smoothstep(5, 16, Math.hypot(x - FORK.x, z - FORK.z));
  h = lerp(h, PROFILE.fork, fw);
  // town → fork track
  if (Math.abs(x) < 9 && z > -2 && z < 38) {
    const along = lerp(PROFILE.fork, PROFILE.town + 0.1, smoothstep(0, 36, z));
    h = clampCone(h, along, Math.abs(x), 1.6, 0.35, 0.55);
  }
  // central massif: raised, rugged, impassable — but always below the fork-rock → shelter sight line
  const md = inner ? Math.min(nearest(VALLEY_P, x, z).d, nearest(RIDGE_P, x, z).d) : 0;
  if (inner) {
    const t = Math.max(0, Math.min(1, -z / 118));
    const sight = PROFILE.fork + FORK.h + 1.6 + t * (PROFILE.end + 1.6 - (PROFILE.fork + FORK.h + 1.6)) - 2.5;
    const base = lerp(PROFILE.fork, PROFILE.end, t);
    const distLine = Math.abs(x - SHELTER.x * t);
    const bump = (6 + 9 * ridged(x * 0.03, z * 0.03, 77)) * smoothstep(0, 22, md) * (1 - 0.7 * smoothstep(10, 50, x));
    const cap = sight - 3.2 + 16 * smoothstep(10, 34, distLine);
    h = lerp(h, Math.min(base - 2 + bump, cap), smoothstep(0, 10, md));
  }
  // valley (east): 10 m bed, 3.5 m banks, then the patrol bank
  const nv = nearest(VALLEY_P, x, z);
  if (nv.d < 40) {
    const bed = valleyBed(nv.s);
    // the banks open out at the valley head, onto the shelter shoulder
    const bank = 3.6 * smoothstep(5, 9.5, nv.d) * (1 - smoothstep(VALLEY_P.len - 50, VALLEY_P.len - 15, nv.s));
    const low = inner && nv.d > 12 ? h : Math.max(h, bed + bank); // never lift the massif behind the banks
    const hv = Math.min(low, bed + bank + 0.9 * Math.max(0, nv.d - 9.5));
    h = nv.d < 5 ? bed : lerp(hv, h, smoothstep(26, 40, nv.d) * (inner ? 0 : 1));
  }
  // ridge (west): 2.4 m crest path, 40° flanks, cut into the hill where the slope is above it
  const nr = nearest(RIDGE_P, x, z);
  if (nr.d < 45) {
    const crest = ridgePath(nr.s);
    const hr = clampCone(h, crest, nr.d, 1.2, 0.84, 1.1);
    h = lerp(hr, h, smoothstep(30, 45, nr.d));
  }
  // shelter knoll + the hill at the valley head
  const sw = 1 - smoothstep(5, 10, Math.hypot(x - SHELTER.x, z - SHELTER.z));
  h = lerp(h, PROFILE.end, sw);
  h += HILL.h * (1 - smoothstep(2, HILL.r, Math.hypot(x - HILL.x, (z - HILL.z) * 1.4)));
  // auto-generated detail, damped on the walkable lines so paths stay under 25°
  const onPath = Math.max(1 - smoothstep(1.5, 6, nv.d), 1 - smoothstep(1.2, 5, nr.d), fw, tw);
  const rough = inner ? 2.2 * (0.25 + 0.75 * smoothstep(8, 30, Math.abs(x - SHELTER.x * Math.max(0, Math.min(1, -z / 118))))) : 1;
  h += ((fbm(x * 0.08, z * 0.08, 3, 4) - 0.5) * 1.6 * rough + (vn(x * 0.45, z * 0.45, 9) - 0.5) * 0.25) * (1 - onPath * 0.9);
  // sight notch: from the top of the fork rock you always see the shelter (design acceptance check #2)
  const tl = Math.max(0, Math.min(1, -z / 118)), dl = Math.abs(x - SHELTER.x * tl);
  if (dl < 9 && tl > 0.04 && tl < 0.97 && nv.d > 3.5 && nr.d > 2.2) {
    const eye0 = PROFILE.fork + FORK.h + 1.65, eye1 = PROFILE.end + 1.2;
    h = Math.min(h, lerp(eye0, eye1, tl) - 1.4);
  }
  // the stream: a shallow ribbon on the west side of the bed
  const ns = nearest(STREAM_P, x, z);
  const inStream = ns.d < 1.6 && ns.s > 4 && ns.s < STREAM_P.len - 4;
  if (ns.d < 2.2 && ns.s > 3 && ns.s < STREAM_P.len - 3) h -= 0.22 * (1 - smoothstep(1.2, 2.2, ns.d));
  return { h, inner: inner ? smoothstep(4, 9, md) : 0, water: inStream ? 1 : 0 };
}

export function initWorld(near: DemLayer, far: DemLayer) {
  NEAR = near;
  FAR = far;
  REF = demAt(NEAR, TOWN.x, TOWN.z);
  PROFILE.end = Math.round(nearRaw(SHELTER.x, SHELTER.z) + 6);
  PROFILE.ridgeTop = PROFILE.end + 3;
  HF = new Float32Array(FW * FD);
  MASK = new Float32Array(FW * FD);
  WATER = new Float32Array(FW * FD);
  for (let j = 0; j < FD; j++)
    for (let i = 0; i < FW; i++) {
      const x = FIELD.minX + i, z = FIELD.minZ + j, k = j * FW + i;
      const inPlay = x > PLAY.minX - 60 && x < PLAY.maxX + 60 && z > PLAY.minZ - 60 && z < PLAY.maxZ + 60;
      if (!inPlay) {
        HF[k] = nearRaw(x, z) + (fbm(x * 0.05, z * 0.05, 5, 3) - 0.5) * 2.5;
        continue;
      }
      const d = designAt(x, z);
      const edge = Math.max(0, x - PLAY.maxX, PLAY.minX - x, z - PLAY.maxZ, PLAY.minZ - z);
      const w = 1 - smoothstep(10, 60, edge);
      HF[k] = lerp(nearRaw(x, z) + (fbm(x * 0.05, z * 0.05, 5, 3) - 0.5) * 2.5, d.h, w);
      MASK[k] = d.inner * w;
      WATER[k] = d.water;
    }
  // gentle relaxation where the clamps meet (keeps carved transitions from creasing)
  const H2 = HF.slice();
  for (let j = 1; j < FD - 1; j++)
    for (let i = 1; i < FW - 1; i++) {
      const k = j * FW + i;
      const x = FIELD.minX + i, z = FIELD.minZ + j;
      if (nearest(VALLEY_P, x, z).d < 4.5 || nearest(RIDGE_P, x, z).d < 1.3) continue;
      H2[k] = (HF[k] * 4 + HF[k - 1] + HF[k + 1] + HF[k - FW] + HF[k + FW]) / 8;
    }
  HF = H2;
  // bake the auto material once: route searches per vertex were the streaming hitch
  SPL = null;
  const S = new Uint8Array(FW * FD * 3);
  for (let j = 0; j < FD; j++)
    for (let i = 0; i < FW; i++) {
      const x = FIELD.minX + i, z = FIELD.minZ + j;
      const a = bil(HF, x - 1, z) - bil(HF, x + 1, z), b = bil(HF, x, z - 1) - bil(HF, x, z + 1);
      const ny = 2 / Math.hypot(a, 2, b);
      const inPlay = x > PLAY.minX - 70 && x < PLAY.maxX + 70 && z > PLAY.minZ - 70 && z < PLAY.maxZ + 70;
      const w = inPlay ? splatSlow(x, z, ny) : splatAt(x, z, ny);
      const k = (j * FW + i) * 3;
      S[k] = w[0] * 255;
      S[k + 1] = w[1] * 255;
      S[k + 2] = w[2] * 255;
    }
  SPL = S;
}

function bil(F: Float32Array, x: number, z: number) {
  let u = x - FIELD.minX, v = z - FIELD.minZ;
  u = Math.min(FW - 1.001, Math.max(0, u));
  v = Math.min(FD - 1.001, Math.max(0, v));
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const a = F[j * FW + i], b = F[j * FW + i + 1], c = F[(j + 1) * FW + i], d = F[(j + 1) * FW + i + 1];
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}
/** terrain height anywhere: carved field inside ±320 m, raw DEM beyond */
export function terrainHeight(x: number, z: number) {
  if (x > FIELD.minX && x < FIELD.maxX && z > FIELD.minZ && z < FIELD.maxZ) return bil(HF, x, z);
  return nearRaw(x, z);
}
export const innerMask = (x: number, z: number) => bil(MASK, x, z);
export const inWater = (x: number, z: number) => bil(WATER, x, z) > 0.5;
export function slopeAt(x: number, z: number, e = 0.7) {
  const a = terrainHeight(x - e, z) - terrainHeight(x + e, z), b = terrainHeight(x, z - e) - terrainHeight(x, z + e);
  return Math.hypot(a, b) / (2 * e); // tan(angle)
}

let SPL: Uint8Array | null = null; // baked [grass, dirt, rock] × 255 over the field
/** splat [grass, dirt, rock] — baked inside the carved field, cheap rules outside */
export function splatAt(x: number, z: number, ny: number): [number, number, number] {
  if (SPL && x > FIELD.minX && x < FIELD.maxX - 1 && z > FIELD.minZ && z < FIELD.maxZ - 1) {
    const u = x - FIELD.minX, v = z - FIELD.minZ, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const k = (j * FW + i) * 3, k2 = k + FW * 3;
    const out: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const a = SPL[k + c], b = SPL[k + 3 + c], cc = SPL[k2 + c], d = SPL[k2 + 3 + c];
      out[c] = (a + (b - a) * fu + (cc - a) * fv + (a - b - cc + d) * fu * fv) / 255;
    }
    return out;
  }
  const n = fbm(x * 0.07, z * 0.07, 41, 3);
  const rock = Math.max(smoothstep(0.16, 0.38, 1 - ny + (n - 0.5) * 0.12), smoothstep(1880, 2050, terrainHeight(x, z) + REF + (n - 0.5) * 80) * 0.8);
  const dirt = smoothstep(0.62, 0.78, fbm(x * 0.03, z * 0.03, 21, 3)) * 0.8 * (1 - rock);
  return [Math.max(0, 1 - rock - dirt), dirt, rock];
}
function splatSlow(x: number, z: number, ny: number): [number, number, number] {
  const n = fbm(x * 0.07, z * 0.07, 41, 3);
  let rock = smoothstep(0.16, 0.38, 1 - ny + (n - 0.5) * 0.12);
  rock = Math.max(rock, innerMask(x, z) * (0.55 + 0.45 * ridged(x * 0.09, z * 0.09, 12)));
  const y = terrainHeight(x, z) + REF;
  rock = Math.max(rock, smoothstep(1880, 2050, y + (n - 0.5) * 80) * 0.8); // bare summits
  const nv = nearest(VALLEY_P, x, z).d, nr = nearest(RIDGE_P, x, z).d;
  let dirt = Math.max(1 - smoothstep(0.8, 2.4, nr), 1 - smoothstep(4, 7, nv) * 0.85, smoothstep(0.62, 0.78, fbm(x * 0.03, z * 0.03, 21, 3)) * 0.8);
  dirt = Math.max(dirt, 1 - smoothstep(4, 11, Math.hypot(x - FORK.x, z - FORK.z)));
  if (Math.abs(x) < 3 && z > 0 && z < 38) dirt = 1;
  if (Math.hypot(x - SHELTER.x, z - SHELTER.z) < 8) dirt = 1;
  dirt *= 1 - rock;
  return [Math.max(0, 1 - rock - dirt), dirt, rock];
}

// ---------------- colliders ----------------
export type BoxKind = "solid" | "low" | "cover";
export interface Box { x0: number; x1: number; z0: number; z1: number; y0: number; top: number; kind: BoxKind; id?: string }
export const BOXES: Box[] = [];
export function addBox(cx: number, cz: number, w: number, d: number, h: number, kind: BoxKind = "solid", id?: string, y0?: number) {
  const g = y0 ?? terrainHeight(cx, cz);
  const b: Box = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: g - 0.8, top: g + h, kind, id };
  BOXES.push(b);
  return b;
}
export function solidAt(x: number, z: number, footY: number, r = 0.3) {
  for (const b of BOXES) {
    if (b.kind === "cover") continue;
    if (x + r < b.x0 || x - r > b.x1 || z + r < b.z0 || z - r > b.z1) continue;
    if (b.top > footY + 0.45 && b.y0 < footY + 1.7) return true;
  }
  return false;
}
export function groundAt(x: number, z: number, footY = Infinity) {
  let y = terrainHeight(x, z);
  for (const b of BOXES) {
    if (b.kind === "cover" || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (b.top > y && b.top <= footY + 0.5) y = b.top;
  }
  return y;
}
export function coverAt(x: number, z: number) {
  return BOXES.some((b) => b.kind === "cover" && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
}
/** line of sight over terrain and solid boxes */
export function lineClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number, bushes = false) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dz);
  const n = Math.ceil(len / 1.2);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (terrainHeight(ax + dx * t, az + dz * t) > ay + dy * t + 0.05) return false;
  }
  for (const b of BOXES) {
    if (b.kind === "cover" && !bushes) continue;
    let t0 = 0, t1 = 1;
    const slab = (o: number, d: number, lo: number, hi: number) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let u = (lo - o) / d, v = (hi - o) / d;
      if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u);
      t1 = Math.min(t1, v);
      return t0 <= t1;
    };
    if (slab(ax, dx, b.x0, b.x1) && slab(az, dz, b.z0, b.z1) && slab(ay, dy, b.y0, b.top) && t1 > 0.001 && t0 < 0.999) return false;
  }
  return true;
}

/** procedural props: boulders on the massif edge and steep ground, bushes along the valley, trees on gentler slopes */
export interface Prop { x: number; z: number; s: number; r: number; kind: "boulder" | "rock" | "bush" | "cedar" | "oak" | "juniper" }
export function generateProps(low: boolean) {
  const rng = mulberry32(1107);
  const out: Prop[] = [];
  const far = (x: number, z: number, minPath: number) => nearest(VALLEY_P, x, z).d > minPath && nearest(RIDGE_P, x, z).d > minPath * 0.6;
  const clearOf = (x: number, z: number) => Math.hypot(x - FORK.x, z - FORK.z) > 9 && Math.hypot(x - SHELTER.x, z - SHELTER.z) > 12 && !(Math.abs(x) < 26 && z > 26) && !(Math.abs(x) < 5 && z > -2);
  const R = 300, step = low ? 7 : 5;
  for (let z = -R; z < R; z += step)
    for (let x = -R; x < R; x += step) {
      const px = x + rng() * step, pz = z + rng() * step;
      if (!clearOf(px, pz)) continue;
      const sl = slopeAt(px, pz, 1.2), inner = innerMask(px, pz);
      const inPlay = px > PLAY.minX - 8 && px < PLAY.maxX + 8 && pz > PLAY.minZ - 8 && pz < PLAY.maxZ + 8;
      const forest = fbm(px * 0.012 + 5, pz * 0.012, 61, 3);
      const r = rng();
      const nv = nearest(VALLEY_P, px, pz).d;
      if (inner > 0.4 && r < 0.12) out.push({ x: px, z: pz, s: 1.2 + rng() * 2.6, r: rng() * 6, kind: "boulder" });
      else if (sl > 0.75 && r < 0.18 && far(px, pz, 3)) out.push({ x: px, z: pz, s: 0.8 + rng() * 2, r: rng() * 6, kind: "boulder" });
      else if (nv > 4.5 && nv < 16 && r < 0.2) out.push({ x: px, z: pz, s: 0.8 + rng() * 0.6, r: rng() * 6, kind: "bush" });
      else if (sl < 0.7 && forest > 0.5 && r < smoothstep(0.5, 0.7, forest) * (inPlay ? 0.45 : 0.6) && far(px, pz, 6)) out.push({ x: px, z: pz, s: 0.55 + rng() * 0.45, r: rng() * 6, kind: rng() < 0.75 ? "cedar" : "oak" });
      else if (sl < 0.9 && r < 0.035 && far(px, pz, 4)) out.push({ x: px, z: pz, s: 0.7 + rng() * 0.6, r: rng() * 6, kind: "juniper" });
      else if (r < (inPlay ? 0.08 : 0.04) + sl * 0.12 && far(px, pz, 2.5)) out.push({ x: px, z: pz, s: 0.2 + Math.pow(rng(), 2) * 0.9, r: rng() * 6, kind: "rock" });
    }
  // the scarp boulders that make the massif's edge read as a wall
  for (const P of [VALLEY_P, RIDGE_P]) {
    for (let s = 10; s < P.len - 10; s += 4.5) {
      const [x, z] = pointAt(P, s), [x2, z2] = pointAt(P, s + 1);
      const tx = x2 - x, tz = z2 - z, tl = Math.hypot(tx, tz) || 1;
      for (const side of [-1, 1]) {
        const off = P === VALLEY_P ? 10 + rng() * 2 : 3.2 + rng() * 1.5;
        const bx = x - (tz / tl) * off * side, bz = z + (tx / tl) * off * side;
        if (innerMask(bx, bz) < 0.15 && P === VALLEY_P) continue;
        if (rng() < 0.45) out.push({ x: bx, z: bz, s: 1 + rng() * (P === VALLEY_P ? 1.8 : 0.9), r: rng() * 6, kind: "boulder" });
      }
    }
  }
  // brush along the east wall of the bed: cover from eyes, not from the dog's nose
  for (let s = 16; s < VALLEY_P.len - 30; s += 4.5) {
    const [x, z] = pointAt(VALLEY_P, s), [x2, z2] = pointAt(VALLEY_P, s + 1);
    const tx = x2 - x, tz = z2 - z, tl = Math.hypot(tx, tz) || 1, off = 2.4 + rng() * 1.6;
    if (rng() < 0.8) out.push({ x: x - (tz / tl) * off, z: z + (tx / tl) * off, s: 1.05 + rng() * 0.45, r: rng() * 6, kind: "bush" });
  }
  return out;
}
