// Organised city layout: hierarchical road grid (avenues every third road), districts by distance to the
// centre, perimeter-block lots facing the streets, parks, and placement data for markings and street props.
// Grid + block / free-region idea ported from Road_Forge_2D (blocks = faces between road bands).
import { mulberry32, weightedPick } from '../core/rng.js';
import { STYLES, makeBuilding } from './BuildingGenerator.js';

export const ROAD = { AVENUE: 20, STREET: 12, SIDEWALK: 4.5, CURB_H: 0.15 };

const DISTRICTS = {
  downtown: { tower: 6, office: 3 },
  midtown: { office: 3, haussmann: 5, brick: 2 },
  residential: { brick: 5, haussmann: 3, townhouse: 2 },
  suburb: { townhouse: 7, brick: 2 },
};

export function generateLayout({ seed = 2026, blocksX = 8, blocksZ = 8, heightScale = 1 } = {}) {
  const r = mulberry32(seed);
  const roadW = (i) => (i % 3 === 0 ? ROAD.AVENUE : ROAD.STREET);
  const bw = Array.from({ length: blocksX }, () => r.range(74, 104));
  const bd = Array.from({ length: blocksZ }, () => r.range(64, 92));
  const totX = bw.reduce((a, b) => a + b, 0) + Array.from({ length: blocksX + 1 }, (_, i) => roadW(i)).reduce((a, b) => a + b, 0);
  const totZ = bd.reduce((a, b) => a + b, 0) + Array.from({ length: blocksZ + 1 }, (_, i) => roadW(i)).reduce((a, b) => a + b, 0);

  const roadsX = [], roadsZ = []; // roadsX run along Z (constant x band); roadsZ run along X
  const colX = [], rowZ = [];
  let x = -totX / 2;
  for (let i = 0; i <= blocksX; i++) {
    roadsX.push({ x0: x, x1: x + roadW(i), w: roadW(i), avenue: i % 3 === 0 }); x += roadW(i);
    if (i < blocksX) { colX.push([x, x + bw[i]]); x += bw[i]; }
  }
  let z = -totZ / 2;
  for (let j = 0; j <= blocksZ; j++) {
    roadsZ.push({ z0: z, z1: z + roadW(j), w: roadW(j), avenue: j % 3 === 0 }); z += roadW(j);
    if (j < blocksZ) { rowZ.push([z, z + bd[j]]); z += bd[j]; }
  }

  const halfX = totX / 2, halfZ = totZ / 2;
  const blocks = [], buildings = [];
  let bid = 0;
  const parkSlots = new Set();
  // one central park + a few scattered ones (never in the very centre)
  const cpI = Math.min(blocksX - 1, Math.floor(blocksX * 0.7)), cpJ = Math.max(0, Math.floor(blocksZ * 0.3));
  parkSlots.add(cpI + ',' + cpJ);
  for (let i = 0; i < blocksX; i++) for (let j = 0; j < blocksZ; j++) if (r() < 0.05) parkSlots.add(i + ',' + j);

  for (let i = 0; i < blocksX; i++) for (let j = 0; j < blocksZ; j++) {
    const [x0, x1] = colX[i], [z0, z1] = rowZ[j], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const dn = Math.hypot(cx / halfX, cz / halfZ) + (r() - 0.5) * 0.12;
    const district = dn < 0.34 ? 'downtown' : dn < 0.68 ? 'midtown' : dn < 1.0 ? 'residential' : 'suburb';
    const park = parkSlots.has(i + ',' + j) && district !== 'downtown';
    const block = { i, j, x0, x1, z0, z1, cx, cz, district, park, buildings: [] };
    blocks.push(block);
    if (park) continue;

    const sw = ROAD.SIDEWALK, ix0 = x0 + sw, ix1 = x1 - sw, iz0 = z0 + sw, iz1 = z1 - sw;
    const depth = iz1 - iz0;
    const rows = depth > 2 * 13 ? [{ face: 1, zEdge: iz1, maxD: depth / 2 - 1 }, { face: -1, zEdge: iz0, maxD: depth / 2 - 1 }] : [{ face: 1, zEdge: iz1, maxD: depth - 1 }];
    const hsDistrict = district === 'downtown' ? 1.35 - dn * 0.8 : 1;

    for (const row of rows) {
      let cur = ix0; const lots = [];
      while (ix1 - cur > 7) {
        const style = weightedPick(r, DISTRICTS[district]);
        const S = STYLES[style];
        let w = r.range(S.lot[0], S.lot[1]);
        if (ix1 - cur - w < S.lot[0] * 0.6) w = ix1 - cur; // absorb the remainder
        w = Math.min(w, ix1 - cur);
        const gap = S.contiguous ? 0.3 : r.range(3, 7);
        lots.push({ style, x0: cur, w: Math.max(6, w - (S.contiguous ? 0.3 : gap)), contiguous: S.contiguous });
        cur += w;
      }
      lots.forEach((lot, k) => {
        const S = STYLES[lot.style];
        const setback = S.contiguous ? 0 : r.range(2, 5);
        const d = Math.min(row.maxD - setback, r.range(S.depth[0], S.depth[1]));
        if (d < 7 || lot.w < 6) return;
        const bcx = lot.x0 + lot.w / 2, bcz = row.zEdge - row.face * (setback + d / 2);
        const prev = lots[k - 1], next = lots[k + 1];
        const minusX = !!(prev && prev.contiguous && lot.contiguous), plusX = !!(next && next.contiguous && lot.contiguous);
        const rot = row.face > 0 ? 0 : 2;
        const b = makeBuilding({
          id: bid++, seed: (seed * 7349 + bid * 977) >>> 0, style: lot.style, cx: bcx, cz: bcz, rot, w: lot.w, d,
          heightScale: (lot.style === 'tower' ? hsDistrict : 1) * heightScale,
          blankLeft: rot === 0 ? minusX : plusX, blankRight: rot === 0 ? plusX : minusX,
        });
        b.block = block; block.buildings.push(b); buildings.push(b);
      });
    }
  }

  /* ---------- street furniture & markings ---------- */
  const lamps = [], trees = [], parked = [], marks = [], lanes = [];
  for (const b of blocks) {
    const inset = 0.8, ex0 = b.x0 + inset, ex1 = b.x1 - inset, ez0 = b.z0 + inset, ez1 = b.z1 - inset;
    const edges = [[ex0, ez1, ex1, ez1, 0], [ex1, ez1, ex1, ez0, Math.PI / 2], [ex1, ez0, ex0, ez0, Math.PI], [ex0, ez0, ex0, ez1, -Math.PI / 2]];
    const treeDistrict = b.park || b.district === 'residential' || b.district === 'midtown' || b.district === 'suburb';
    for (const [ax, az, bx, bz, ry] of edges) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor((len - 12) / 30));
      for (let k = 0; k <= n; k++) {
        const t = (6 + k * ((len - 12) / n)) / len;
        lamps.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, ry });
      }
      if (treeDistrict) {
        const m = Math.floor((len - 10) / 10);
        for (let k = 0; k < m; k++) {
          const t = (8 + 15 / 2 + k * 10) / len; if (t > 0.94) break;
          if (k % 3 === 1) continue;
          trees.push({ x: ax + (bx - ax) * t + (bz - az) / len * 0.6, z: az + (bz - az) * t - (bx - ax) / len * 0.6, s: r.range(0.8, 1.25) });
        }
      }
    }
    if (b.park) {
      const n = Math.round((b.x1 - b.x0) * (b.z1 - b.z0) / 120);
      for (let k = 0; k < n; k++) trees.push({ x: r.range(b.x0 + 8, b.x1 - 8), z: r.range(b.z0 + 8, b.z1 - 8), s: r.range(0.9, 1.6) });
    }
  }

  const addMark = (cx, cz, along, len, wid, yellow) => marks.push({ x: cx, z: cz, ry: along === 'z' ? 0 : Math.PI / 2, len, wid, yellow });
  const segX = (rd, za, zb) => { // road band along z between za..zb (x centre)
    const cx = (rd.x0 + rd.x1) / 2, L = zb - za;
    if (rd.avenue) { addMark(cx - 0.15, (za + zb) / 2, 'z', L - 9, 0.12, 1); addMark(cx + 0.15, (za + zb) / 2, 'z', L - 9, 0.12, 1); }
    const dashOff = rd.avenue ? [-3.75, 3.75] : [0];
    for (const o of dashOff) for (let s = za + 6; s < zb - 6; s += 9) addMark(cx + o, s + 1.5, 'z', 3, 0.14, rd.avenue ? 0 : 1);
    const half = rd.w / 2 - 2.4;
    for (const end of [za + 2.2, zb - 2.2]) for (let o = -half + 0.4; o < half; o += 1.0) addMark(cx + o, end, 'z', 3, 0.5, 0);
    addMark(cx - half / 2, zb - 4.4, 'x', half, 0.4, 0); addMark(cx + half / 2, za + 4.4, 'x', half, 0.4, 0);
    const lanesO = rd.avenue ? [[-1.9, 1], [-5.6, 1], [1.9, -1], [5.6, -1]] : [[-2, 1], [2, -1]];
    for (const [o, dir] of lanesO) lanes.push({ axis: 'z', c: cx + o, dir, a: -totZ / 2, b: totZ / 2 });
    for (const side of [-1, 1]) for (let s = za + 9; s < zb - 9; s += 6.2) if (r() < 0.35) parked.push({ x: cx + side * (rd.w / 2 - 1.25), z: s, ry: side > 0 ? Math.PI : 0 });
  };
  const segZ = (rd, xa, xb) => {
    const cz = (rd.z0 + rd.z1) / 2, L = xb - xa;
    if (rd.avenue) { addMark((xa + xb) / 2, cz - 0.15, 'x', L - 9, 0.12, 1); addMark((xa + xb) / 2, cz + 0.15, 'x', L - 9, 0.12, 1); }
    const dashOff = rd.avenue ? [-3.75, 3.75] : [0];
    for (const o of dashOff) for (let s = xa + 6; s < xb - 6; s += 9) addMark(s + 1.5, cz + o, 'x', 3, 0.14, rd.avenue ? 0 : 1);
    const half = rd.w / 2 - 2.4;
    for (const end of [xa + 2.2, xb - 2.2]) for (let o = -half + 0.4; o < half; o += 1.0) addMark(end, cz + o, 'x', 3, 0.5, 0);
    addMark(xb - 4.4, cz + half / 2, 'z', half, 0.4, 0); addMark(xa + 4.4, cz - half / 2, 'z', half, 0.4, 0);
    const lanesO = rd.avenue ? [[1.9, 1], [5.6, 1], [-1.9, -1], [-5.6, -1]] : [[2, 1], [-2, -1]];
    for (const [o, dir] of lanesO) lanes.push({ axis: 'x', c: cz + o, dir, a: -totX / 2, b: totX / 2 });
    for (const side of [-1, 1]) for (let s = xa + 9; s < xb - 9; s += 6.2) if (r() < 0.35) parked.push({ x: s, z: cz + side * (rd.w / 2 - 1.25), ry: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
  };
  roadsX.forEach((rd) => rowZ.forEach(([za, zb]) => segX(rd, za, zb)));
  roadsZ.forEach((rd) => colX.forEach(([xa, xb]) => segZ(rd, xa, xb)));
  // lanes are registered once per segment; keep unique lanes
  const seen = new Set(), uniqLanes = lanes.filter((l) => { const k = l.axis + l.c.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true; });

  return { seed, blocksX, blocksZ, totX, totZ, roadsX, roadsZ, colX, rowZ, blocks, buildings, lamps, trees, parked, marks, lanes: uniqLanes };
}
