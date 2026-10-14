// Game-engine export: one .glb (glTF 2.0, PBR metallic-roughness, textures embedded) + engine helpers, zipped.
// - Buildings are exported at full detail (LOD0), tiled ~160 m so engines can stream / cull per tile.
// - The app's single texture-array material is split into standard PBR materials per layer; per-building
//   tints are clustered (<= 6 per layer) into baseColorFactor variants (no vertex-colour dependence).
// - Shader-only details (road markings) are rebuilt as real geometry.
// - Collision: simplified meshes (building tier boxes + roofs, prop cylinders/boxes) + the ground mesh,
//   named per engine convention (Godot suffixes, COL_ prefix + setup scripts for Unity / Unreal).
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { zipSync, strToU8 } from 'fflate';
import { GeoBuilder } from '../city/GeoBuilder.js';
import { buildDetailed, roofPolys } from '../city/BuildingGenerator.js';
import { buildGround, lampGeometry, carGeometry } from '../city/Streets.js';
import { CURB_H } from '../city/CityLayout.js';
import { LAYER_DEFS } from '../materials/layers.js';
import * as G2 from '../core/geom2d.js';
import { UNITY_SCRIPT, UNREAL_SCRIPT, exportReadme } from './engineScripts.js';

const TILE = 160;
const CAR_COLORS = [0xe8e8e8, 0x1a1a1a, 0x8a1010, 0x16305e, 0x707478, 0xb0b4b8, 0x2c4a30, 0xc9a227, 0x4a2a1a, 0xffffff];

/* ---------------- textures ---------------- */
function genLayers(layers, size, onProgress) {
  const out = new Map(), queue = layers.slice(), n = size >= 4096 ? 1 : 2;
  let done = 0;
  const run = (w) => new Promise((resolve, reject) => {
    const next = () => {
      if (!queue.length) { w.terminate(); resolve(); return; }
      const layer = queue.shift();
      w.onerror = (e) => { w.terminate(); reject(e); };
      w.onmessage = (e) => {
        if (e.data.type === 'progress') return;
        if (e.data.type === 'error') { w.terminate(); reject(new Error(e.data.msg)); return; }
        out.set(layer, e.data); done++; onProgress(done / layers.length); next();
      };
      w.postMessage({ id: layer, kind: 'layer', layer, size, seed: 1 });
    };
    next();
  });
  const workers = Array.from({ length: n }, () => new Worker(new URL('../textures/texture.worker.js', import.meta.url), { type: 'module' }));
  return Promise.all(workers.map(run)).then(() => out);
}

function canvasTex(size, fill, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  fill(img.data); g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; // data row 0 = v 0 = top of the glTF image (same mapping as in the app)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/** baseColor (pre-scaled by the layer's brightest tint), normal (glTF/OpenGL), ORM; height for the zip */
function layerTextures(layer, raw, size, scale) {
  const { alb, nrm } = raw, metal = LAYER_DEFS[layer].metal * 255;
  const base = canvasTex(size, (d) => { for (let i = 0; i < d.length; i += 4) { d[i] = alb[i] * scale; d[i + 1] = alb[i + 1] * scale; d[i + 2] = alb[i + 2] * scale; d[i + 3] = 255; } }, true);
  const normal = canvasTex(size, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const x = nrm[i] / 127.5 - 1, y = nrm[i + 1] / 127.5 - 1, z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      // three's derivative tangent frame has +Y opposite to glTF's (GLTFLoader negates normalScale.y)
      d[i] = nrm[i]; d[i + 1] = 255 - nrm[i + 1]; d[i + 2] = (z * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }, false);
  base.userData.mimeType = 'image/jpeg'; // colour tolerates JPEG; normal / ORM stay lossless PNG
  const orm = canvasTex(size, (d) => { for (let i = 0; i < d.length; i += 4) { d[i] = nrm[i + 3]; d[i + 1] = nrm[i + 2]; d[i + 2] = metal; d[i + 3] = 255; } }, false);
  const height = document.createElement('canvas'); height.width = height.height = size;
  { const g = height.getContext('2d'), img = g.createImageData(size, size), d = img.data; for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = alb[i + 3]; d[i + 3] = 255; } g.putImageData(img, 0, 0); }
  return { base, normal, orm, height };
}

/* ---------------- geometry soup -> PBR submeshes ---------------- */
const soupOf = (G) => ({ p: G.p, n: G.n, uv: G.uv, l: G.l, t: G.t, idx: G.i, ni: G.ni, nv: G.nv });
const soupOfGeometry = (g) => ({ p: g.attributes.position.array, n: g.attributes.normal.array, uv: g.attributes.uv.array, l: g.attributes.aLayer.array, t: g.attributes.aTint.array, idx: g.index.array, ni: g.index.count, nv: g.attributes.position.count });
const tintKey = (t, i) => `${Math.round(t[i * 3] / 0.08)},${Math.round(t[i * 3 + 1] / 0.08)},${Math.round(t[i * 3 + 2] / 0.08)}`;

/** pick up to K representative tints per layer from all soups */
function clusterTints(soups, K = 6) {
  const stats = new Map(); // layer -> Map(key -> {n, sum})
  for (const s of soups) for (let k = 0; k < s.ni; k += 3) {
    const v = s.idx[k], L = s.l[v] | 0;
    if (!stats.has(L)) stats.set(L, new Map());
    const m = stats.get(L), key = tintKey(s.t, v);
    const e = m.get(key) || { n: 0, c: [s.t[v * 3], s.t[v * 3 + 1], s.t[v * 3 + 2]] };
    e.n++; m.set(key, e);
  }
  const res = new Map();
  for (const [L, m] of stats) {
    const entries = [...m.values()].sort((a, b) => b.n - a.n), centers = [];
    for (const e of entries) {
      if (centers.length >= K) break;
      if (centers.every((c) => Math.hypot(c[0] - e.c[0], c[1] - e.c[1], c[2] - e.c[2]) > 0.07)) centers.push(e.c);
    }
    const scale = Math.max(1, ...centers.flat());
    const assign = new Map();
    for (const [key, e] of m) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => { const d = Math.hypot(c[0] - e.c[0], c[1] - e.c[1], c[2] - e.c[2]); if (d < bd) { bd = d; bi = i; } });
      assign.set(key, bi);
    }
    res.set(L, { centers, scale, assign });
  }
  return res;
}

/** build a multi-material BufferGeometry from a soup; keepTri(i0,i1,i2) optional filter */
function splitSoup(s, clusters, matFor, keepTri) {
  const buckets = new Map();
  for (let k = 0; k < s.ni; k += 3) {
    const a = s.idx[k], b = s.idx[k + 1], c = s.idx[k + 2];
    if (keepTri && !keepTri(a, b, c)) continue;
    const L = s.l[a] | 0, ci = clusters.get(L).assign.get(tintKey(s.t, a)) || 0, key = L * 16 + ci;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(a, b, c);
  }
  if (!buckets.size) return null;
  const remap = new Int32Array(s.nv).fill(-1), P = [], N = [], UV = [], I = [], mats = [];
  const g = new THREE.BufferGeometry();
  for (const [key, tris] of buckets) {
    const L = key >> 4, start = I.length, meters = LAYER_DEFS[L].meters;
    for (const v of tris) {
      if (remap[v] < 0) {
        remap[v] = P.length / 3;
        P.push(s.p[v * 3], s.p[v * 3 + 1], s.p[v * 3 + 2]); N.push(s.n[v * 3], s.n[v * 3 + 1], s.n[v * 3 + 2]);
        UV.push(s.uv[v * 2] / meters, s.uv[v * 2 + 1] / meters);
      }
      I.push(remap[v]);
    }
    g.addGroup(start, tris.length, mats.length); mats.push(matFor(L, key & 15));
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(new THREE.Uint32BufferAttribute(I, 1));
  return { geometry: g, materials: mats };
}

/* ---------------- road markings as geometry ---------------- */
function buildMarkings(chains, inRegion) {
  const W = new GeoBuilder(1 << 14), Y = new GeoBuilder(1 << 12), y = 0.015;
  const strip = (G, ch, a, b, u, w) => {
    if (b - a < 0.05) return;
    const pts = [a, ...ch.pl.between(a, b).map((v) => v.s), b];
    for (let i = 0; i < pts.length - 1; i++) {
      const s0 = pts[i], s1 = pts[i + 1], p0 = ch.pl.at(s0), p1 = ch.pl.at(s1), t = ch.pl.tangent((s0 + s1) / 2), n = G2.inward(t);
      const q = (p, o) => [p[0] + n[0] * o, y, p[1] + n[1] * o];
      G.quad(q(p0, u + w / 2), q(p1, u + w / 2), q(p1, u - w / 2), q(p0, u - w / 2), [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  };
  const dashes = (G, ch, a, b, u, w, period, len, phase) => {
    for (let s = Math.floor((a - ch.s0 - phase) / period) * period + phase; s < b - ch.s0; s += period) {
      const d0 = Math.max(a, ch.s0 + s), d1 = Math.min(b, ch.s0 + s + len);
      if (d1 > d0) strip(G, ch, d0, d1, u, w);
    }
  };
  for (const ch of chains) {
    if (ch.s1 - ch.s0 < 1 || !inRegion(ch.pl.at((ch.s0 + ch.s1) / 2), ch.pl.length / 2)) continue;
    const hw = ch.w / 2, park = ch.w >= 11 ? 2.5 : 0, laneW = (hw - park) / ch.lanes;
    const a = ch.s0 + (ch.cross.a ? 5.2 : 0), b = ch.s1 - (ch.cross.b ? 5.2 : 0);
    if (b > a) {
      if (ch.avenue) { strip(Y, ch, a, b, 0.2, 0.12); strip(Y, ch, a, b, -0.2, 0.12); }
      else dashes(Y, ch, a, b, 0, 0.14, 9, 3.42, 0);
      for (let k = 1; k < ch.lanes; k++) for (const sg of [1, -1]) dashes(W, ch, a, b, sg * k * laneW, 0.13, 9, 2.97, -2.7);
      if (park) for (const sg of [1, -1]) strip(W, ch, a, b, sg * (hw - park), 0.12);
    }
    for (const [on, sgn, base] of [[ch.cross.a, 1, ch.s0], [ch.cross.b, -1, ch.s1]]) {
      if (!on) continue;
      const d = (x) => base + sgn * x, lo = (x0, x1) => [Math.min(d(x0), d(x1)), Math.max(d(x0), d(x1))];
      for (let m = Math.ceil((-hw + 0.5) / 1.1); m * 1.1 <= hw - 0.5; m++) { const [s0, s1] = lo(0.8, 3.9); strip(W, ch, s0, s1, m * 1.1, 0.55); }
      const [s0, s1] = lo(4.53, 4.97), side = sgn > 0 ? -1 : 1, ext = hw - park - 0.1; // approach side (right-hand traffic)
      if (ext > 0) strip(W, ch, s0, s1, side * (0.1 + ext / 2), ext);
    }
  }
  return { white: W.nv ? W.build() : null, yellow: Y.nv ? Y.build() : null };
}

/* ---------------- collision ---------------- */
function buildingCollision(G, b) {
  G.setTransform(b.matrix);
  for (const t of b.tiers) G.box(t.ox, (t.y0 + t.y1) / 2, t.oz, t.w, t.y1 - t.y0, t.d);
  const R = roofPolys(b);
  if (R) { for (const s of R.slopes) G.poly(s, () => [0, 0]); if (R.top) G.poly(R.top, () => [0, 0]); }
}
const posOnly = (g) => {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position')); out.setAttribute('normal', g.getAttribute('normal')); out.setIndex(g.index);
  return out;
};

// tile names without '-' (Godot reads '-xxx' name suffixes as import hints)
const tileKey = (x, z) => [Math.floor(x / TILE), Math.floor(z / TILE)].map((v) => (v < 0 ? 'm' + -v : 'p' + v)).join('_');

/** three r160 writes textureInfo.channel instead of texCoord; rewrite the GLB JSON chunk to valid glTF */
function fixGlb(ab) {
  const u8 = new Uint8Array(ab), dv = new DataView(ab), jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jsonLen)));
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if ('index' in o && 'channel' in o) { if (o.channel) o.texCoord = o.channel; delete o.channel; }
    for (const v of Object.values(o)) walk(v);
  };
  walk(json.materials);
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (js.length % 4)) % 4;
  if (pad) { const p = new Uint8Array(js.length + pad); p.set(js); p.fill(0x20, js.length); js = p; }
  const rest = u8.subarray(20 + jsonLen), out = new Uint8Array(12 + 8 + js.length + rest.length), o = new DataView(out.buffer);
  out.set(u8.subarray(0, 12)); o.setUint32(8, out.length, true);
  o.setUint32(12, js.length, true); o.setUint32(16, 0x4e4f534a, true); out.set(js, 20); out.set(rest, 20 + js.length);
  return out;
}

/* ---------------- main ---------------- */
export async function exportCity({ city, trees, opts, onStatus }) {
  const t0 = performance.now(), L = city.layout, target = opts.target;
  const status = (msg, f) => onStatus && onStatus(msg, f);
  const c = opts.center, R = opts.region === 'all' ? Infinity : opts.radius;
  const inRegion = (p, pad = 0) => R === Infinity || Math.hypot(p[0] - c.x, p[1] - c.z) <= R + pad;
  const buildings = L.buildings.filter((b) => !b.demolished && inRegion([b.cx, b.cz]));

  // 1. geometry (LOD0) per tile
  status('توليد الهندسة التفصيلية…', 0.02);
  const tiles = new Map();
  for (const b of buildings) {
    const k = tileKey(b.cx, b.cz);
    if (!tiles.has(k)) tiles.set(k, { key: k, G: new GeoBuilder(1 << 16), Gg: new GeoBuilder(1 << 13), C: new GeoBuilder(1 << 12), list: [] });
    const T = tiles.get(k); T.list.push(b);
  }
  let i = 0;
  for (const T of tiles.values()) {
    for (const b of T.list) { buildDetailed(b, T.G, T.Gg); if (opts.collision) buildingCollision(T.C, b); }
    status('توليد الهندسة التفصيلية…', 0.02 + 0.2 * (++i / tiles.size));
    await new Promise((r) => setTimeout(r, 0));
  }
  const groundGeo = buildGround(L), groundSoup = soupOfGeometry(groundGeo);
  const keepGround = R === Infinity ? null : (a, b2, c2) => {
    const P = groundSoup.p, x = (P[a * 3] + P[b2 * 3] + P[c2 * 3]) / 3, z = (P[a * 3 + 2] + P[b2 * 3 + 2] + P[c2 * 3 + 2]) / 3;
    return Math.hypot(x - c.x, z - c.z) <= R + 25;
  };
  const soups = [...[...tiles.values()].map((T) => soupOf(T.G)), groundSoup];
  const clusters = clusterTints(soups);

  // 2. textures for the layers in use
  const used = [...clusters.keys()].sort((a, b) => a - b);
  status(`توليد الخامات (${used.length} طبقة، ${opts.texRes}px)…`, 0.25);
  const raw = await genLayers(used, opts.texRes, (f) => status(`توليد الخامات (${used.length} طبقة، ${opts.texRes}px)…`, 0.25 + f * 0.35));
  const tex = new Map(), heights = {};
  for (const l of used) {
    const T = layerTextures(l, raw.get(l), opts.texRes, clusters.get(l).scale);
    tex.set(l, T); heights[LAYER_DEFS[l].key] = T.height;
  }
  const matCache = new Map();
  const matFor = (l, ci) => {
    const key = l * 16 + ci;
    if (matCache.has(key)) return matCache.get(key);
    const C = clusters.get(l), T = tex.get(l), f = C.centers[ci] || [1, 1, 1];
    const m = new THREE.MeshStandardMaterial({
      name: `M_${LAYER_DEFS[l].key}_${ci}`, color: new THREE.Color(f[0] / C.scale, f[1] / C.scale, f[2] / C.scale),
      map: T.base, normalMap: T.normal, roughnessMap: T.orm, metalnessMap: T.orm, aoMap: T.orm, roughness: 1, metalness: 1,
    });
    matCache.set(key, m); return m;
  };

  // 3. scene graph
  status('بناء المشهد…', 0.62);
  const scene = new THREE.Scene(), root = new THREE.Group(); root.name = 'AAA_City'; scene.add(root);
  root.userData = { generator: 'AAA Procedural City', seed: L.seed, units: 'meters', upAxis: 'Y', target };
  const colName = (base) => (target === 'godot' ? `${base}-colonly` : `COL_${base}`);
  const colMat = new THREE.MeshStandardMaterial({ name: 'M_Collision', color: 0xff00ff });
  const addCol = (geo, name) => {
    const m = new THREE.Mesh(posOnly(geo), colMat); m.name = colName(name); m.userData = { collision: true }; root.add(m); return m;
  };
  const glassMats = new Map();
  const glassMat = (mirror, tint) => {
    const k = mirror.toFixed(2) + tint.map((x) => x.toFixed(2)).join();
    if (!glassMats.has(k)) {
      const col = new THREE.Color(0.015, 0.018, 0.02).lerp(new THREE.Color(tint[0] * 0.28, tint[1] * 0.28, tint[2] * 0.28), mirror);
      glassMats.set(k, new THREE.MeshStandardMaterial({ name: `M_Glass_${glassMats.size}`, color: col, roughness: 0.05, metalness: mirror * 0.85 }));
    }
    return glassMats.get(k);
  };
  const tileGroup = new THREE.Group(); tileGroup.name = 'Buildings'; root.add(tileGroup);
  for (const T of tiles.values()) {
    const sp = splitSoup(soupOf(T.G), clusters, matFor);
    if (sp) { const m = new THREE.Mesh(sp.geometry, sp.materials); m.name = `Buildings_${T.key}`; m.userData = { kind: 'buildings', buildings: T.list.map((b) => b.id) }; tileGroup.add(m); }
    if (T.Gg.nv) { // glass grouped by (mirror, tint)
      const s = soupOf(T.Gg), byMat = new Map();
      for (let k = 0; k < s.ni; k += 3) {
        const v = s.idx[k], mat = glassMat(s.l[v], [s.t[v * 3], s.t[v * 3 + 1], s.t[v * 3 + 2]]);
        if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(s.idx[k], s.idx[k + 1], s.idx[k + 2]);
      }
      const g = new THREE.BufferGeometry(), I = [], mats = [];
      for (const [mat, tris] of byMat) { g.addGroup(I.length, tris.length, mats.length); mats.push(mat); I.push(...tris); }
      g.setAttribute('position', new THREE.BufferAttribute(s.p.slice(0, s.nv * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(s.n.slice(0, s.nv * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(s.uv.slice(0, s.nv * 2), 2)); g.setIndex(new THREE.Uint32BufferAttribute(I, 1));
      const m = new THREE.Mesh(g, mats); m.name = `Glass_${T.key}`; tileGroup.add(m);
    }
  }
  const gsp = splitSoup(groundSoup, clusters, matFor, keepGround);
  if (gsp) {
    const ground = new THREE.Mesh(gsp.geometry, gsp.materials);
    ground.name = target === 'godot' && opts.collision ? 'Ground-col' : 'Ground'; ground.userData = { kind: 'ground' };
    root.add(ground);
    if (opts.collision && target !== 'godot') addCol(gsp.geometry, 'Ground');
  }
  if (opts.markings) {
    const mk = buildMarkings(L.chains, inRegion);
    const paint = (g, name, col) => { if (!g) return; const m = new THREE.Mesh(posOnly(g), new THREE.MeshStandardMaterial({ name: `M_${name}`, color: col, roughness: 0.55 })); m.name = name; root.add(m); };
    paint(mk.white, 'Markings_White', new THREE.Color(0.82, 0.82, 0.78)); paint(mk.yellow, 'Markings_Yellow', new THREE.Color(0.8, 0.56, 0.1));
  }

  // props: shared meshes, one node per instance
  const propCol = new Map(); // tile -> GeoBuilder
  const pc = (x, z) => { const k = tileKey(x, z); if (!propCol.has(k)) propCol.set(k, new GeoBuilder(1 << 12)); return propCol.get(k).identity(); };
  if (opts.trees && trees) {
    const g = new THREE.Group(); g.name = 'Trees'; root.add(g);
    const bark = new THREE.MeshStandardMaterial({ name: 'M_Bark', map: trees.barkMat.map, normalMap: trees.barkMat.normalMap, roughness: 0.92 });
    const leaf = new THREE.MeshStandardMaterial({ name: 'M_Leaves', map: trees.leafMat.map, alphaTest: 0.42, roughness: 0.8, side: THREE.DoubleSide });
    let n = 0;
    for (const V of trees.variants) {
      if (!V.lods) continue;
      const tg = V.lods[0].trunk.geometry, lg = V.lods[0].leaves.geometry;
      for (const it of V.items) {
        if (!inRegion([it.x, it.z])) continue;
        const node = new THREE.Group(); node.name = `Tree_${n++}`;
        node.position.set(it.x, it.y ?? CURB_H, it.z); node.rotation.y = it.ry; node.scale.setScalar(it.s);
        const tm = new THREE.Mesh(tg, bark), lm = new THREE.Mesh(lg, leaf); tm.name = `${V.sp}_${V.v}_trunk`; lm.name = `${V.sp}_${V.v}_leaves`;
        node.add(tm, lm); g.add(node);
        if (opts.collision) pc(it.x, it.z).cylinder(it.x, it.y ?? CURB_H, it.z, 0.28 * it.s, 3.2 * it.s, 8);
      }
    }
  }
  if (opts.props) {
    const lg = new THREE.Group(); lg.name = 'StreetLamps'; root.add(lg);
    const lgeo = lampGeometry(), lmat = new THREE.MeshStandardMaterial({ name: 'M_LampPost', color: 0x24272a, metalness: 0.75, roughness: 0.4 });
    L.lamps.forEach((l, k) => {
      if (!inRegion([l.x, l.z])) return;
      const m = new THREE.Mesh(lgeo, lmat); m.name = `Lamp_${k}`; m.position.set(l.x, CURB_H, l.z); m.rotation.y = l.ry; lg.add(m);
      if (opts.collision) pc(l.x, l.z).cylinder(l.x, CURB_H, l.z, 0.18, 7.5, 6);
    });
    const cg = new THREE.Group(); cg.name = 'ParkedCars'; root.add(cg);
    const cgeo = carGeometry(); cgeo.deleteAttribute('aEmit');
    const cmats = CAR_COLORS.map((c, k) => new THREE.MeshStandardMaterial({ name: `M_Car_${k}`, color: c, vertexColors: true, metalness: 0.6, roughness: 0.3 }));
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    L.parked.forEach((p, k) => {
      if (!inRegion([p.x, p.z])) return;
      const m = new THREE.Mesh(cgeo, cmats[Math.floor(rnd() * cmats.length)]); m.name = `Car_${k}`; m.position.set(p.x, 0, p.z); m.rotation.y = p.ry; cg.add(m);
      if (opts.collision) { m.updateMatrix(); pc(p.x, p.z).setTransform(m.matrix).box(0, 0.75, 0, 1.9, 1.5, 4.5); }
    });
  }
  if (opts.collision) {
    for (const T of tiles.values()) if (T.C.nv) addCol(T.C.build(), `Buildings_${T.key}`);
    for (const [k, G] of propCol) if (G.nv) addCol(G.build(), `Props_${k}`);
  }

  // 4. glTF
  status('كتابة ملف glTF…', 0.7);
  const glb = fixGlb(await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 8192 }));
  status('ضغط ملف ZIP…', 0.92);
  const files = { 'city.glb': [glb, { level: 0 }] };
  for (const [k, cv] of Object.entries(heights)) {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    files[`textures_height/${k}_height.png`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  const meta = {
    seed: L.seed, params: L.params, units: 'meters', region: R === Infinity ? 'all' : { center: [c.x, c.z], radius: R },
    buildings: buildings.map((b) => ({ id: b.id, style: b.style, floors: b.floors, position: [b.cx, 0, b.cz], angleRad: b.angle, size: [b.w, b.H + b.roofH, b.d], tiers: b.tiers })),
  };
  files['city.json'] = strToU8(JSON.stringify(meta, null, 1));
  files['README_EXPORT.md'] = strToU8(exportReadme(target));
  if (target === 'unity') files['Unity/Editor/AAACitySetup.cs'] = strToU8(UNITY_SCRIPT);
  if (target === 'unreal') files['Unreal/aaa_city_setup.py'] = strToU8(UNREAL_SCRIPT);
  const zip = zipSync(files);
  // free GPU/CPU resources created for the export
  for (const T of tex.values()) { T.base.dispose(); T.normal.dispose(); T.orm.dispose(); }
  // only geometry created for the export (tree meshes are shared with the running app)
  scene.traverse((o) => { if (o.isMesh && !o.parent?.parent?.name?.startsWith('Trees')) o.geometry.dispose(); });
  groundGeo.dispose();
  return { zip, stats: { buildings: buildings.length, tiles: tiles.size, materials: matCache.size + glassMats.size, glbMB: glb.byteLength / 1048576, seconds: (performance.now() - t0) / 1000 } };
}
