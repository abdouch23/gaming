// Procedural trees: recursive branch tubes with a generated bark texture + normal map, leaf-card canopies
// textured from a painted leaf atlas (broadleaf, needles, blossom, autumn), canopy-spherical normals for
// soft foliage shading, wind sway + leaf flutter in the vertex shader, and two LODs per variant.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { fbm } from '../textures/synth.js';

// uv cells (canvas textures are flipped in Y: canvas top half = v 0.5..1)
const CELL = { broad: [0, 1], needle: [1, 1], blossom: [0, 0], autumn: [1, 0] };

/* ---------- textures ---------- */
function leafAtlas(size = 2048) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), H = size / 2, r = mulberry32(99);
  const leaf = (x, y, ang, L, W, col, vein) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    const gr = g.createLinearGradient(0, -W, 0, W); gr.addColorStop(0, col[0]); gr.addColorStop(0.5, col[1]); gr.addColorStop(1, col[2]);
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.25, -W, L * 0.75, -W * 0.8, L, 0); g.bezierCurveTo(L * 0.75, W * 0.8, L * 0.25, W, 0, 0); g.fill();
    g.strokeStyle = vein; g.lineWidth = Math.max(1, W * 0.08); g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.95, 0); g.stroke();
    g.lineWidth = Math.max(0.6, W * 0.04);
    for (let k = 1; k < 5; k++) { const t = (k / 5) * L; g.beginPath(); g.moveTo(t, 0); g.lineTo(t + L * 0.12, -W * 0.55); g.moveTo(t, 0); g.lineTo(t + L * 0.12, W * 0.55); g.stroke(); }
    g.restore();
  };
  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  const twigs = (ox, oy, palette, count, Lr, Wr, flowers) => {
    const cx = ox + H / 2, cy = oy + H / 2, tips = [];
    g.strokeStyle = '#4a3a2a'; g.lineCap = 'round';
    const branch = (x, y, a, len, w, depth) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      tips.push([x2, y2, a]); for (let k = 0.3; k < 1; k += 0.25) tips.push([x + (x2 - x) * k, y + (y2 - y) * k, a]);
      if (depth > 0) for (const s of [-1, 1]) branch(x2, y2, a + s * (0.35 + r() * 0.4), len * (0.55 + r() * 0.2), w * 0.65, depth - 1);
    };
    for (let k = 0; k < 5; k++) branch(cx + (r() - 0.5) * H * 0.2, oy + H * 0.97, -Math.PI / 2 + (k - 2) * 0.42, H * 0.3, H * 0.012, 3);
    for (let i = 0; i < count; i++) {
      const t = tips[Math.floor(r() * tips.length)], [h, s, l] = palette(r);
      const L = H * Lr * (0.7 + r() * 0.5), W = L * Wr;
      leaf(t[0] + (r() - 0.5) * 12, t[1] + (r() - 0.5) * 12, t[2] + (r() - 0.5) * 2.2, L, W, [hsl(h, s, l - 6), hsl(h, s + 4, l + 4), hsl(h, s, l - 10)], hsl(h, s - 10, l + 10));
    }
    if (flowers) for (let i = 0; i < count * 0.8; i++) {
      const t = tips[Math.floor(r() * tips.length)], x = t[0] + (r() - 0.5) * 30, y = t[1] + (r() - 0.5) * 30, rr = H * 0.012 * (0.7 + r() * 0.6);
      for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.fillStyle = hsl(340 + r() * 20, 70, 82 + r() * 10); g.beginPath(); g.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, rr * 0.8, 0, 7); g.fill(); }
      g.fillStyle = '#f5d76e'; g.beginPath(); g.arc(x, y, rr * 0.4, 0, 7); g.fill();
    }
    void cx; void cy;
  };
  g.clearRect(0, 0, size, size);
  twigs(0, 0, (rr) => [78 + rr() * 30, 28 + rr() * 18, 17 + rr() * 13], 330, 0.075, 0.42);
  twigs(0, H, (rr) => [85 + rr() * 20, 28 + rr() * 15, 22 + rr() * 12], 160, 0.06, 0.45, true);
  twigs(H, H, (rr) => [10 + rr() * 32, 55 + rr() * 20, 28 + rr() * 14], 300, 0.075, 0.5);
  // needles: dense sprays along twigs
  {
    const ox = H, oy = 0;
    for (let b = 0; b < 7; b++) {
      const x0 = ox + H * 0.5, y0 = oy + H * 0.98, a = -Math.PI / 2 + (b - 3) * 0.28, L = H * (0.6 + r() * 0.3);
      g.strokeStyle = '#4a3a2a'; g.lineWidth = H * 0.008; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L); g.stroke();
      for (let k = 0; k < 140; k++) {
        const t = r(), px = x0 + Math.cos(a) * L * t, py = y0 + Math.sin(a) * L * t, side = r() < 0.5 ? -1 : 1, na = a + side * (0.7 + r() * 0.5), nl = H * 0.05 * (1.2 - t * 0.5);
        g.strokeStyle = hsl(115 + r() * 30, 25 + r() * 18, 13 + r() * 12); g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function barkTextures(N = 512) {
  const H = new Float32Array(N * N), alb = new Uint8ClampedArray(N * N * 4), nrm = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const ridge = 1 - Math.abs(fbm(u, v, 10, 3, 5, 71)), plates = fbm(u, v, 6, 6, 3, 72);
    const h = Math.pow(ridge, 2.2) * 0.8 + 0.2 * (plates * 0.5 + 0.5) + 0.08 * fbm(u, v, 48, 24, 2, 73);
    H[y * N + x] = h;
    const k = 0.45 + 0.6 * h, j = (y * N + x) * 4, moss = Math.max(0, plates - 0.35) * 1.2;
    alb[j] = (0.36 * k - moss * 0.1) * 255; alb[j + 1] = (0.3 * k + moss * 0.05) * 255; alb[j + 2] = (0.24 * k - moss * 0.08) * 255; alb[j + 3] = 255;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)]) * 4, dy = (H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x]) * 4;
    const il = 1 / Math.hypot(dx, dy, 1), j = (y * N + x) * 4;
    nrm[j] = (-dx * il * 0.5 + 0.5) * 255; nrm[j + 1] = (dy * il * 0.5 + 0.5) * 255; nrm[j + 2] = (il * 0.5 + 0.5) * 255; nrm[j + 3] = 255;
  }
  const mk = (d, srgb) => { const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  return { map: mk(alb, true), normalMap: mk(nrm, false) };
}

/* ---------- geometry ---------- */
class TreeBuilder {
  constructor() { this.bp = []; this.bn = []; this.bu = []; this.bi = []; this.lp = []; this.ln = []; this.lu = []; this.li = []; }
  tube(pts, radii, seg) {
    const base = this.bp.length / 3; let ref = new THREE.Vector3(1, 0, 0), vlen = 0;
    const t = new THREE.Vector3(), nA = new THREE.Vector3(), nB = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
      nA.crossVectors(t, ref).normalize(); if (nA.lengthSq() < 0.5) nA.set(0, 0, 1).cross(t).normalize();
      nB.crossVectors(nA, t).normalize(); ref = nB.clone();
      if (i) vlen += pts[i].distanceTo(pts[i - 1]);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2, n = nA.clone().multiplyScalar(Math.cos(a)).addScaledVector(nB, Math.sin(a));
        const p = pts[i].clone().addScaledVector(n, radii[i]);
        this.bp.push(p.x, p.y, p.z); this.bn.push(n.x, n.y, n.z); this.bu.push((k / seg) * 2, vlen / (Math.PI * 2 * 0.25));
      }
    }
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < seg; k++) {
      const a = base + i * (seg + 1) + k, b = a + seg + 1;
      this.bi.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  card(c, size, n, cell, crown, rnd) {
    const up = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(up, n).normalize(), v = new THREE.Vector3().crossVectors(n, u);
    const rot = rnd() * Math.PI * 2, cu = u.clone().multiplyScalar(Math.cos(rot)).addScaledVector(v, Math.sin(rot)), cv = new THREE.Vector3().crossVectors(n, cu);
    const [cx, cy] = CELL[cell], uv0 = [cx * 0.5, cy * 0.5];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const side of [1, -1]) { // two-sided with shared outward normals
      const base = this.lp.length / 3;
      for (const [a, b] of corners) {
        const p = c.clone().addScaledVector(cu, a * size * 0.5).addScaledVector(cv, b * size * 0.5);
        const sn = p.clone().sub(crown).normalize().multiplyScalar(0.75).addScaledVector(n, 0.25 * side).normalize();
        this.lp.push(p.x, p.y, p.z); this.ln.push(sn.x, sn.y, sn.z);
        this.lu.push(uv0[0] + (a * 0.5 + 0.5) * 0.5, uv0[1] + (b * 0.5 + 0.5) * 0.5);
      }
      if (side > 0) this.li.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else this.li.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  build() {
    const mk = (p, n, u, i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(i); g.computeBoundingSphere(); return g;
    };
    return { trunk: mk(this.bp, this.bn, this.bu, this.bi), leaves: mk(this.lp, this.ln, this.lu, this.li) };
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function bentPath(from, dir, len, steps, bend, r) {
  const pts = [from.clone()], d = dir.clone().normalize(), p = from.clone();
  for (let i = 1; i <= steps; i++) {
    d.add(V((r() - 0.5) * bend, (r() - 0.3) * bend * 0.6, (r() - 0.5) * bend)).normalize();
    p.addScaledVector(d, len / steps); pts.push(p.clone());
  }
  return pts;
}

export function generateTree(species, seed, lod) {
  const r = mulberry32(seed), B = new TreeBuilder(), hi = lod === 0;
  const segT = hi ? 9 : 5, segB = hi ? 6 : 3, cardK = hi ? 1 : 0.34, cardS = hi ? 1 : 1.55;
  const cards = (c, n, rad, size, cell, crown) => {
    for (let i = 0; i < n * cardK; i++) {
      const o = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(rad * Math.cbrt(r()));
      const p = c.clone().add(o), nn = p.clone().sub(crown).normalize().add(V(r() - 0.5, r() - 0.2, r() - 0.5)).normalize();
      B.card(p, size * cardS * (0.8 + r() * 0.4), nn, cell, crown, r);
    }
  };
  if (species === 'conifer') {
    const H = 11 + r() * 5, trunk = bentPath(V(0, 0, 0), V(0, 1, 0), H, 8, 0.04, r);
    B.tube(trunk, trunk.map((_, i) => 0.32 * (1 - i / trunk.length * 0.9) * (i === 0 ? 1.3 : 1)), segT);
    const crown = V(0, H * 0.55, 0);
    for (let y = 2.2; y < H - 0.4; y += hi ? 0.55 : 0.9) {
      const k = 1 - (y - 2.2) / (H - 2.2), n = 5 + Math.floor(r() * 3), L = 0.5 + k * 3.6;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + r(), d = V(Math.cos(a), -0.15 - r() * 0.2, Math.sin(a));
        const pts = bentPath(V(0, y, 0), d, L, 3, 0.15, r);
        if (hi) B.tube(pts, pts.map((_, i) => Math.max(0.012, 0.06 * k + 0.03 - i * 0.012)), 3);
        for (let s = 0.35; s <= 1.0001; s += hi ? 0.32 : 0.65) {
          const p = pts[0].clone().lerp(pts[pts.length - 1], s);
          B.card(p.add(V(0, 0.1, 0)), (0.9 + k * 0.6) * cardS, V(d.x * 0.3, 1, d.z * 0.3).normalize(), 'needle', crown, r);
        }
      }
    }
    B.card(V(0, H, 0), 1.2, V(1, 0.3, 0).normalize(), 'needle', crown, r);
    return B.build();
  }
  const round = species === 'round';
  const Ht = round ? 1.6 + r() * 0.6 : 2.8 + r() * 1.4, H = round ? 5 + r() * 1.5 : 9 + r() * 4;
  const cell = species === 'round' ? (r() < 0.5 ? 'blossom' : 'autumn') : 'broad';
  const trunk = bentPath(V(0, 0, 0), V(0, 1, 0), H * (round ? 0.55 : 0.72), 6, 0.12, r);
  B.tube(trunk, trunk.map((_, i) => (round ? 0.2 : 0.34) * (1 - (i / trunk.length) * 0.7) * (i === 0 ? 1.45 : 1)), segT);
  const crown = V(0, round ? H * 0.62 : H * 0.66, 0), crownR = round ? 2.2 + r() * 0.6 : 3.4 + r() * 1.2;
  const nMain = round ? 5 : 6 + Math.floor(r() * 3);
  for (let j = 0; j < nMain; j++) {
    const t = 0.35 + (j / nMain) * 0.6, i0 = Math.min(trunk.length - 1, Math.floor(t * (trunk.length - 1)));
    const from = trunk[i0].clone(); if (from.y < Ht) from.y = Ht + j * 0.3;
    const a = j * 2.39996 + r() * 0.4, el = 0.55 + r() * 0.5;
    const d = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const L = crownR * (0.75 + r() * 0.4);
    const pts = bentPath(from, d, L, 4, 0.25, r);
    B.tube(pts, pts.map((_, i) => (round ? 0.11 : 0.16) * (1 - i / pts.length * 0.8)), segB);
    const tip = pts[pts.length - 1];
    cards(tip, round ? 10 : 9, round ? 1.1 : 1.4, round ? 1.25 : 1.7, cell, crown);
    const nSub = hi ? 3 : 1;
    for (let k = 0; k < nSub; k++) {
      const p0 = pts[1 + Math.floor(r() * (pts.length - 2))], sd = d.clone().add(V(r() - 0.5, r() * 0.6, r() - 0.5)).normalize();
      const sp = bentPath(p0, sd, L * 0.5, 3, 0.3, r);
      if (hi) B.tube(sp, sp.map((_, i) => 0.07 - i * 0.015), 4);
      cards(sp[sp.length - 1], round ? 6 : 6, 1.0, round ? 1.15 : 1.5, cell, crown);
    }
  }
  cards(trunk[trunk.length - 1], round ? 12 : 10, crownR * 0.55, round ? 1.3 : 1.8, cell, crown); // fill the crown top
  return B.build();
}

/* ---------- runtime ---------- */
const SPECIES = ['broad', 'conifer', 'round'], VARIANTS = 3;

export class Trees {
  constructor(layout, lighting) {
    this.group = new THREE.Group(); this.group.name = 'trees';
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
    this.lodDist = 150; this._last = new THREE.Vector3(1e9, 0, 0); this._t = 0;
    const atlas = Trees._atlas || (Trees._atlas = leafAtlas());
    const bark = Trees._bark || (Trees._bark = barkTextures());
    const wind = (leaf) => (s) => {
      Object.assign(s.uniforms, this.uniforms);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { float hh = max(transformed.y, 0.); vec2 ip = vec2(0.);
            #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xz;
            #endif
            float ph = ip.x * .05 + ip.y * .07, k = hh * hh * .0018 * uWind;
            transformed.x += (sin(uTime * 1.3 + ph) * .6 + sin(uTime * 2.3 + ph * 1.7) * .25) * k;
            transformed.z += cos(uTime * 1.1 + ph * 1.3) * k * .7;
            ${leaf ? 'transformed += objectNormal * sin(uTime * 6.5 + dot(position, vec3(3.1, 1.7, 2.3))) * .035 * uWind;' : ''} }`);
      if (leaf) s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * .025;`); // light passing through the leaves
    };
    this.leafMat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.42, roughness: 0.78, metalness: 0, envMapIntensity: 0.55 });
    this.leafMat.onBeforeCompile = wind(true); this.leafMat.customProgramCacheKey = () => 'leaf-v1';
    this.barkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92, envMapIntensity: 0.5 });
    this.barkMat.onBeforeCompile = wind(false); this.barkMat.customProgramCacheKey = () => 'bark-v1';

    // instances per variant
    const r = mulberry32(layout.seed + 5), col = new THREE.Color();
    this.variants = [];
    for (const sp of SPECIES) for (let v = 0; v < VARIANTS; v++) this.variants.push({ sp, v, items: [] });
    for (const t of layout.trees) {
      const list = this.variants.filter((x) => x.sp === t.species);
      list[Math.floor(r() * list.length)].items.push({ ...t, ry: r() * Math.PI * 2, tint: col.setRGB(0.7 + r() * 0.3, 0.72 + r() * 0.25, 0.62 + r() * 0.25).toArray() });
    }
    const geoCache = Trees._geo || (Trees._geo = new Map());
    for (const V0 of this.variants) {
      if (!V0.items.length) continue;
      const n = V0.items.length;
      V0.lods = [0, 1].map((lod) => {
        const key = V0.sp + V0.v + lod;
        if (!geoCache.has(key)) geoCache.set(key, generateTree(V0.sp, 1000 + V0.v * 31 + SPECIES.indexOf(V0.sp) * 7, lod));
        const g = geoCache.get(key);
        const trunk = new THREE.InstancedMesh(g.trunk, this.barkMat, n), leaves = new THREE.InstancedMesh(g.leaves, this.leafMat, n);
        for (const m of [trunk, leaves]) { m.castShadow = true; m.receiveShadow = true; m.count = 0; this.group.add(m); }
        V0.items.forEach((it, i) => leaves.setColorAt(i, col.fromArray(it.tint)));
        return { trunk, leaves };
      });
    }
    lighting.patch(this.group);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }

  get count() { return this.variants.reduce((a, v) => a + v.items.length, 0); }

  update(camera, dt) {
    this.uniforms.uTime.value += dt; this._t += dt;
    if (this._t < 0.25 && camera.position.distanceToSquared(this._last) < 64) return;
    this._t = 0; this._last.copy(camera.position);
    const cp = camera.position, d2 = this.lodDist * this.lodDist, col = new THREE.Color();
    for (const V0 of this.variants) {
      if (!V0.lods) continue;
      const [near, far] = V0.lods, cnt = [0, 0];
      for (const it of V0.items) {
        const dx = it.x - cp.x, dz = it.z - cp.z, lod = dx * dx + dz * dz + cp.y * cp.y * 0.3 < d2 ? 0 : 1, M = lod ? far : near, i = cnt[lod]++;
        this._q.setFromAxisAngle(this._up, it.ry); this._p.set(it.x, it.y ?? 0.15, it.z); this._s.setScalar(it.s);
        this._m.compose(this._p, this._q, this._s);
        M.trunk.setMatrixAt(i, this._m); M.leaves.setMatrixAt(i, this._m); M.leaves.setColorAt(i, col.fromArray(it.tint));
      }
      near.trunk.count = near.leaves.count = cnt[0]; far.trunk.count = far.leaves.count = cnt[1];
      for (const M of V0.lods) { M.trunk.instanceMatrix.needsUpdate = true; M.leaves.instanceMatrix.needsUpdate = true; if (M.leaves.instanceColor) M.leaves.instanceColor.needsUpdate = true; M.trunk.computeBoundingSphere(); M.leaves.computeBoundingSphere(); }
    }
  }

  dispose() { this.group.traverse((o) => o.dispose && o.isInstancedMesh && o.dispose()); }
}
