// Street geometry (asphalt road strips with road-space UVs, intersections, granite curbs, sidewalks,
// lawns, park paths) plus lamps and cars. Road markings, tyre tracks and puddles are painted in the
// city shader from the strip UVs (see CityMaterials), so they stay crisp at any distance.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './GeoBuilder.js';
import { L } from '../materials/layers.js';
import { CURB_H } from './CityLayout.js';
import { mulberry32 } from '../core/rng.js';
import * as G2 from '../core/geom2d.js';

const NOFAC = [0, 0, 0, 0];
const world = (x, z) => [x, -z];

export function buildGround(layout) {
  const G = new GeoBuilder(1 << 17), h = CURB_H;
  // fallback asphalt under the whole network (only visible through tiny gaps)
  G.set(L.ASPHALT, [0.8, 0.8, 0.82], NOFAC);
  G.capXZ(G2.inset(layout.hull, -layout.maxW / 2 - 0.5), -0.06, world);

  // road strips: u = across (m, + = right of travel direction), v = along (m from the strip start)
  for (const ch of layout.chains) {
    const len = ch.s1 - ch.s0; if (len < 1) continue;
    const pl = ch.pl, hw = ch.w / 2;
    const pts = [{ p: pl.at(ch.s0), s: ch.s0 }, ...pl.between(ch.s0, ch.s1).map((v) => ({ p: v.p, s: v.s })), { p: pl.at(ch.s1), s: ch.s1 }];
    const R = [], Lf = [];
    pts.forEach((q, i) => {
      let nr;
      if (i === 0 || i === pts.length - 1) nr = G2.inward(pl.tangent(Math.min(q.s, pl.length - 1e-3)));
      else {
        const t1 = G2.norm(G2.sub(q.p, pts[i - 1].p)), t2 = G2.norm(G2.sub(pts[i + 1].p, q.p)), n1 = G2.inward(t1);
        nr = G2.norm(G2.add(n1, G2.inward(t2))); nr = G2.mul(nr, 1 / Math.max(0.5, G2.dot(nr, n1))); // mitre
      }
      R.push(G2.add(q.p, G2.mul(nr, hw))); Lf.push(G2.sub(q.p, G2.mul(nr, hw)));
    });
    const flags = (ch.avenue ? 1 : 0) + (ch.cross.a ? 2 : 0) + (ch.cross.b ? 4 : 0);
    G.set(L.ASPHALT, [1, 1, 1], [len, ch.w, ch.lanes, -1 - flags], (ch.id * 0.618) % 1);
    for (let i = 0; i < pts.length - 1; i++) {
      const v0 = pts[i].s - ch.s0, v1 = pts[i + 1].s - ch.s0;
      G.quad([R[i][0], 0, R[i][1]], [R[i + 1][0], 0, R[i + 1][1]], [Lf[i + 1][0], 0, Lf[i + 1][1]], [Lf[i][0], 0, Lf[i][1]], [hw, v0, hw, v1, -hw, v1, -hw, v0]);
    }
  }
  G.set(L.ASPHALT, [0.86, 0.86, 0.88], NOFAC);
  for (const it of layout.intersections) if (it.poly.length >= 3) G.capXZ(it.poly, 0, world);

  for (const b of layout.blocks) {
    G.set(L.CURB, [1, 1, 1], NOFAC);
    G.wallsXZ(b.curb, -0.06, h);
    // granite curb top band (curb and inner outlines share vertex indices)
    let acc = 0;
    for (let i = 0; i < b.curb.length; i++) {
      const a = b.curb[i], c = b.curb[(i + 1) % b.curb.length], ia = b.inner[i], ic = b.inner[(i + 1) % b.inner.length], len = G2.dist(a, c);
      G.quad([c[0], h, c[1]], [a[0], h, a[1]], [ia[0], h, ia[1]], [ic[0], h, ic[1]], [acc + len, 0, acc, 0, acc, 0.3, acc + len, 0.3]);
      acc += len;
    }
    G.set(L.PAVERS, [1, 1, 1], NOFAC);
    G.capXZ(b.inner, h, world);
    if (b.lawn) {
      const lh = h + 0.1;
      G.set(L.CURB, [0.88, 0.88, 0.88], NOFAC); G.wallsXZ(b.lot, h, lh);
      G.set(L.GRASS, [1, 1, 1], NOFAC); G.capXZ(b.lot, lh, world);
      for (const pa of b.paths) {
        G.set(b.plaza ? L.PAVERS : L.GRAVEL, b.plaza ? [1.05, 1.02, 0.98] : [1.15, 1.08, 0.95], NOFAC);
        if (pa.ring) {
          const ring = [], inr = [];
          for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; ring.push([pa.c[0] + Math.cos(a) * (pa.r + 3), pa.c[1] + Math.sin(a) * (pa.r + 3)]); inr.push([pa.c[0] + Math.cos(a) * pa.r, pa.c[1] + Math.sin(a) * pa.r]); }
          for (let k = 0; k < 48; k++) { const a = ring[k], c = ring[(k + 1) % 48], ia = inr[k], ic = inr[(k + 1) % 48]; G.quad([c[0], lh + 0.02, c[1]], [a[0], lh + 0.02, a[1]], [ia[0], lh + 0.02, ia[1]], [ic[0], lh + 0.02, ic[1]], [c[0], -c[1], a[0], -a[1], ia[0], -ia[1], ic[0], -ic[1]]); }
          continue;
        }
        const d = G2.norm(G2.sub(pa.b, pa.a)), n = G2.mul(G2.inward(d), pa.w / 2);
        const q = [G2.add(pa.a, n), G2.sub(pa.a, n), G2.sub(pa.b, n), G2.add(pa.b, n)];
        G.capXZ(q, lh + 0.015, world);
      }
    }
  }
  return G.build();
}

export function buildFarGround() {
  const G = new GeoBuilder(16);
  G.set(L.GRASS, [0.85, 0.9, 0.8], NOFAC);
  const S = 5000;
  G.quad([-S, -0.09, S], [S, -0.09, S], [S, -0.09, -S], [-S, -0.09, -S], [-S, -S, S, -S, S, S, -S, S]);
  return G.build();
}

/* ---------- props ---------- */
const flat = (g) => (g.index ? g.toNonIndexed() : g);
function paint(g, rgb, emit = 0) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; e[i] = emit; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aEmit', new THREE.BufferAttribute(e, 1));
  return g;
}
function lampGeometry() {
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 7.6, 10).translate(0, 3.8, 0);
  const base = new THREE.CylinderGeometry(0.18, 0.24, 0.7, 10).translate(0, 0.35, 0);
  const ring = new THREE.TorusGeometry(0.12, 0.03, 6, 12).rotateX(Math.PI / 2).translate(0, 0.9, 0);
  const arm = new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6).rotateX(Math.PI / 2).translate(0, 7.45, 0.9);
  const head = new THREE.BoxGeometry(0.42, 0.14, 0.8).translate(0, 7.4, 1.85);
  return mergeGeometries([pole, base, ring, arm, head].map(flat));
}
function carGeometry() {
  const body = new THREE.BoxGeometry(1.85, 0.62, 4.4, 1, 1, 4), p = body.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (Math.abs(z) > 1.9 && y > 0) p.setY(i, y - 0.12); } // sloped bonnet / boot
  body.translate(0, 0.62, 0);
  const cabin = new THREE.BoxGeometry(1.62, 0.6, 2.3), cp = cabin.attributes.position;
  for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 0) { cp.setX(i, cp.getX(i) * 0.9); cp.setZ(i, cp.getZ(i) * 0.82); } // tapered greenhouse
  cabin.translate(0, 1.22, -0.25);
  const parts = [
    paint(body, [1, 1, 1]),
    paint(cabin, [0.05, 0.06, 0.07]),
    paint(new THREE.BoxGeometry(0.4, 0.14, 0.05).translate(-0.62, 0.66, 2.21), [1, 1, 0.9], 1),
    paint(new THREE.BoxGeometry(0.4, 0.14, 0.05).translate(0.62, 0.66, 2.21), [1, 1, 0.9], 1),
    paint(new THREE.BoxGeometry(0.45, 0.12, 0.05).translate(-0.6, 0.74, -2.21), [0.8, 0.05, 0.03], 2),
    paint(new THREE.BoxGeometry(0.45, 0.12, 0.05).translate(0.6, 0.74, -2.21), [0.8, 0.05, 0.03], 2),
  ];
  for (const [x, z] of [[-0.86, 1.4], [0.86, 1.4], [-0.86, -1.35], [0.86, -1.35]]) parts.push(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12).rotateZ(Math.PI / 2).translate(x, 0.34, z), [0.04, 0.04, 0.04]));
  return mergeGeometries(parts.map(flat));
}

const CAR_COLORS = [0xe8e8e8, 0x1a1a1a, 0x8a1010, 0x16305e, 0x707478, 0xb0b4b8, 0x2c4a30, 0xc9a227, 0x4a2a1a, 0xffffff];

export class StreetProps {
  constructor(layout, lighting) {
    this.group = new THREE.Group();
    this.night = lighting.uniforms.uNight;
    this.layout = layout;
    const r = mulberry32(layout.seed + 77), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const nL = Math.max(1, layout.lamps.length);

    // lamps
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x24272a, metalness: 0.75, roughness: 0.4 });
    const lamps = new THREE.InstancedMesh(lampGeometry(), lampMat, nL);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc27a, emissiveIntensity: 0 });
    const bulbs = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.7).rotateX(Math.PI / 2).translate(0, 7.32, 1.85), this.bulbMat, nL);
    const poolTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), this.poolMat, nL);
    lamps.count = bulbs.count = pools.count = layout.lamps.length;
    layout.lamps.forEach((l, i) => {
      q.setFromAxisAngle(up, l.ry); p.set(l.x, CURB_H, l.z); m4.compose(p, q, s);
      lamps.setMatrixAt(i, m4); bulbs.setMatrixAt(i, m4);
      const off = new THREE.Vector3(0, 0, 2.2).applyQuaternion(q);
      pools.setMatrixAt(i, new THREE.Matrix4().makeTranslation(l.x + off.x, 0.2, l.z + off.z));
    });
    lamps.castShadow = true; lamps.receiveShadow = true; pools.userData.noAO = true; pools.renderOrder = 2;
    this.group.add(lamps, bulbs, pools);

    // cars: parked + traffic following the road graph (right-hand traffic, smooth turns)
    const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.28 });
    carMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = this.night;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aEmit; varying float vEmit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vEmit;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (vEmit > .5 && vEmit < 1.5) totalEmissiveRadiance += vec3(1., .92, .75) * (.2 + uNight * 6.);
          else if (vEmit > 1.5) totalEmissiveRadiance += vec3(1., .05, .02) * (.3 + uNight * 3.);`);
    };
    carMat.customProgramCacheKey = () => 'car-v1';
    const cars = (layout.params.cars ?? 1);
    const moving = [];
    for (const ch of layout.chains) {
      const len = ch.s1 - ch.s0; if (len < 8) continue;
      const n = Math.floor((len / 110) * cars + r());
      for (let k = 0; k < n; k++) {
        const dir = r() < 0.5 ? 1 : -1, lane = Math.floor(r() * ch.lanes);
        moving.push({ ch, dir, lane, s: ch.s0 + r() * len, v: r.range(8, 13), turn: null });
      }
    }
    this.moving = moving;
    const total = Math.max(1, layout.parked.length + moving.length);
    this.cars = new THREE.InstancedMesh(carGeometry(), carMat, total);
    this.cars.count = layout.parked.length + moving.length;
    layout.parked.forEach((c, i) => {
      q.setFromAxisAngle(up, c.ry); p.set(c.x, 0, c.z); this.cars.setMatrixAt(i, m4.compose(p, q, s));
      this.cars.setColorAt(i, col.set(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]));
    });
    this.movingOffset = layout.parked.length;
    moving.forEach((c, i) => this.cars.setColorAt(this.movingOffset + i, col.set(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)])));
    this.cars.castShadow = true; this.cars.receiveShadow = true; this.cars.frustumCulled = false;
    this.group.add(this.cars);
    this._m4 = m4; this._q = q; this._p = p; this._s = s; this._up = up; this._r = r;
    this.update(0);
  }

  _lanePos(ch, s, dir, lane) { // world position on a lane
    const q = ch.pl.at(s), t = ch.pl.tangent(s), nr = G2.inward(t), u = dir * (lane + 0.5) * ch.laneW;
    return { p: [q[0] + nr[0] * u, q[1] + nr[1] * u], t: dir > 0 ? t : G2.mul(t, -1) };
  }

  _startTurn(c) {
    const node = c.dir > 0 ? c.ch.b : c.ch.a, refs = this.layout.nodeChains.get(node) || [];
    let opts = refs.filter((ref) => ref.ch !== c.ch && ref.ch.s1 - ref.ch.s0 > 8);
    if (!opts.length) opts = refs.filter((ref) => ref.ch.s1 - ref.ch.s0 > 8); // dead end: U-turn
    if (!opts.length) { c.dir = -c.dir; return; }
    const ref = opts[Math.floor(this._r() * opts.length)];
    const nd = ref.end === 'a' ? 1 : -1, ns = nd > 0 ? ref.ch.s0 : ref.ch.s1, lane = Math.min(c.lane, ref.ch.lanes - 1);
    const A = this._lanePos(c.ch, c.s, c.dir, c.lane), B = this._lanePos(ref.ch, ns, nd, lane);
    // control point: intersection of both lane lines, falling back to the midpoint
    const den = G2.cross(A.t, B.t);
    let C = G2.mul(G2.add(A.p, B.p), 0.5);
    if (Math.abs(den) > 0.2) { const k = G2.cross(G2.sub(B.p, A.p), B.t) / den; if (k > 0 && k < 40) C = G2.add(A.p, G2.mul(A.t, k)); }
    const len = G2.dist(A.p, C) + G2.dist(C, B.p);
    c.turn = { A: A.p, B: B.p, C, t: 0, len: Math.max(1, len), next: { ch: ref.ch, dir: nd, s: ns, lane } };
  }

  update(dt) {
    const n = this.night.value;
    this.bulbMat.emissiveIntensity = 0.05 + n * 9;
    this.poolMat.opacity = n * 0.55;
    const { _m4: m4, _q: q, _p: p, _s: s, _up: up } = this;
    this.moving.forEach((c, i) => {
      let pos, dir;
      if (c.turn) {
        const T = c.turn; T.t += (c.v * 0.7 * dt) / T.len;
        if (T.t >= 1) { Object.assign(c, T.next); c.turn = null; }
        else {
          const t = T.t, u = 1 - t;
          pos = [u * u * T.A[0] + 2 * u * t * T.C[0] + t * t * T.B[0], u * u * T.A[1] + 2 * u * t * T.C[1] + t * t * T.B[1]];
          dir = G2.norm([2 * u * (T.C[0] - T.A[0]) + 2 * t * (T.B[0] - T.C[0]), 2 * u * (T.C[1] - T.A[1]) + 2 * t * (T.B[1] - T.C[1])]);
        }
      }
      if (!c.turn) {
        c.s += c.v * dt * c.dir;
        if ((c.dir > 0 && c.s >= c.ch.s1) || (c.dir < 0 && c.s <= c.ch.s0)) { c.s = Math.max(c.ch.s0, Math.min(c.ch.s1, c.s)); this._startTurn(c); }
        const lp = this._lanePos(c.ch, c.s, c.dir, c.lane); pos = lp.p; dir = lp.t;
      }
      q.setFromAxisAngle(up, Math.atan2(dir[0], dir[1])); p.set(pos[0], 0, pos[1]);
      this.cars.setMatrixAt(this.movingOffset + i, m4.compose(p, q, s));
    });
    this.cars.instanceMatrix.needsUpdate = true;
  }
}
