// Streets: asphalt, raised sidewalks with granite curbs, park lawns, worn road markings (instanced),
// street lamps with night light pools, trees, parked + moving cars (instanced).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './GeoBuilder.js';
import { L } from '../materials/layers.js';
import { ROAD } from './CityLayout.js';
import { mulberry32 } from '../core/rng.js';

const NOFAC = [0, 0, 0, 0];

function roundedRect(x0, z0, x1, z1, rc, seg = 5) {
  const pts = [], c = [[x1 - rc, z1 - rc, 0], [x1 - rc, z0 + rc, -Math.PI / 2], [x0 + rc, z0 + rc, Math.PI], [x0 + rc, z1 - rc, Math.PI / 2]];
  for (const [cx, cz, a0] of c) for (let k = 0; k <= seg; k++) { const a = a0 + Math.PI / 2 - (k / seg) * (Math.PI / 2); pts.push([cx + Math.cos(a) * rc, cz + Math.sin(a) * rc]); }
  return pts; // clockwise in x/z  => counter-clockwise seen from above (+y)
}

export function buildGround(layout) {
  const G = new GeoBuilder(1 << 16), m = 30;
  const X = layout.totX / 2 + m, Z = layout.totZ / 2 + m;
  G.set(L.ASPHALT, [1, 1, 1], NOFAC);
  G.quad([-X, 0, Z], [X, 0, Z], [X, 0, -Z], [-X, 0, -Z], [-X, -Z, X, -Z, X, Z, -X, Z]);
  const h = ROAD.CURB_H;
  for (const b of layout.blocks) {
    const outer = roundedRect(b.x0, b.z0, b.x1, b.z1, 4.5), inner = roundedRect(b.x0 + 0.3, b.z0 + 0.3, b.x1 - 0.3, b.z1 - 0.3, 4.2);
    // curb faces
    G.set(L.CURB, [1, 1, 1], NOFAC);
    let acc = 0;
    for (let k = 0; k < outer.length; k++) {
      const a = outer[k], c = outer[(k + 1) % outer.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      G.quad([a[0], 0, a[1]], [c[0], 0, c[1]], [c[0], h, c[1]], [a[0], h, a[1]], [acc, 0, acc + len, 0, acc + len, h, acc, h]);
      // granite top band
      const ia = inner[k], ic = inner[(k + 1) % inner.length];
      G.quad([a[0], h, a[1]], [c[0], h, c[1]], [ic[0], h, ic[1]], [ia[0], h, ia[1]], [acc, 0, acc + len, 0, acc + len, 0.3, acc, 0.3]);
      acc += len;
    }
    G.set(L.PAVERS, [1, 1, 1], NOFAC);
    G.poly(inner.map((p) => [p[0], h, p[1]]), (q) => [q[0], -q[2]], [0, 1, 0]);
    // lawn / courtyard
    const lawn = b.park || b.district === 'residential' || b.district === 'suburb';
    if (lawn) {
      const sw = ROAD.SIDEWALK, lx0 = b.x0 + sw, lx1 = b.x1 - sw, lz0 = b.z0 + sw, lz1 = b.z1 - sw, lh = h + 0.1;
      G.set(L.CURB, [0.9, 0.9, 0.9], NOFAC);
      G.box((lx0 + lx1) / 2, lh / 2 + h / 2, (lz0 + lz1) / 2, lx1 - lx0, lh - h, lz1 - lz0, ['py', 'ny']);
      G.set(L.GRASS, [1, 1, 1], NOFAC);
      G.quad([lx0, lh, lz1], [lx1, lh, lz1], [lx1, lh, lz0], [lx0, lh, lz0], [lx0, -lz1, lx1, -lz1, lx1, -lz0, lx0, -lz0]);
    }
  }
  return G.build();
}

export function buildFarGround() {
  const G = new GeoBuilder(16);
  G.set(L.GRASS, [0.85, 0.9, 0.8], NOFAC);
  const S = 4000;
  G.quad([-S, -0.03, S], [S, -0.03, S], [S, -0.03, -S], [-S, -0.03, -S], [-S, -S, S, -S, S, S, -S, S]);
  return G.build();
}

/* ---------- markings ---------- */
export function buildMarkings(layout, lib) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, alphaTest: 0.32, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  lib.onChange((l) => { mat.alphaMap = l.grime; mat.needsUpdate = true; });
  mat.onBeforeCompile = (s) => { // world-space wear so every dash is worn differently
    s.vertexShader = s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_ALPHAMAP
      vAlphaMapUv = (modelMatrix * instanceMatrix * vec4(position, 1.)).xz * .09;
      #endif`);
  };
  const n = layout.marks.length, im = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const white = new THREE.Color(0.9, 0.9, 0.86), yellow = new THREE.Color(0.95, 0.68, 0.1);
  layout.marks.forEach((mk, i) => {
    q.setFromAxisAngle(up, mk.ry); s.set(mk.wid, 1, mk.len); p.set(mk.x, 0.012, mk.z);
    im.setMatrixAt(i, m4.compose(p, q, s)); im.setColorAt(i, mk.yellow ? yellow : white);
  });
  im.receiveShadow = true; im.userData.noAO = true;
  return im;
}

/* ---------- props ---------- */
function paint(g, rgb, emit = 0) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3), e = new Float32Array(n);
  for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; e[i] = emit; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aEmit', new THREE.BufferAttribute(e, 1));
  return g;
}
const flat = (g) => (g.index ? g.toNonIndexed() : g);
function lampGeometry() {
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 7.6, 8).translate(0, 3.8, 0);
  const base = new THREE.CylinderGeometry(0.18, 0.22, 0.6, 8).translate(0, 0.3, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.9).translate(0, 7.45, 0.9);
  const head = new THREE.BoxGeometry(0.42, 0.14, 0.8).translate(0, 7.4, 1.85);
  return mergeGeometries([pole, base, arm, head].map(flat));
}
function treeGeometries(seed) {
  const r = mulberry32(seed);
  const trunk = new THREE.CylinderGeometry(0.12, 0.22, 3.4, 7).translate(0, 1.7, 0);
  const blobs = [];
  for (let k = 0; k < 4; k++) {
    let g = new THREE.IcosahedronGeometry(1.5 + r() * 0.9, 3);
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { // lumpy leaf clusters
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.16 * Math.sin(x * 3.1 + z * 2.3) * Math.cos(y * 2.7 + x) + 0.08 * Math.sin(x * 9.3 - y * 7.1 + z * 8.7);
      p.setXYZ(i, x * n, y * n * 0.85, z * n);
    }
    g.translate((r() - 0.5) * 2.2, 4.4 + r() * 1.6, (r() - 0.5) * 2.2); g.computeVertexNormals(); blobs.push(g);
  }
  const canopy = mergeGeometries(blobs);
  return { trunk, canopy };
}
function carGeometry() {
  const parts = [
    paint(new THREE.BoxGeometry(1.85, 0.62, 4.4).translate(0, 0.62, 0), [1, 1, 1]),
    paint(new THREE.BoxGeometry(1.62, 0.6, 2.3).translate(0, 1.22, -0.25), [0.05, 0.06, 0.07]),
    paint(new THREE.BoxGeometry(1.66, 0.08, 2.0).translate(0, 1.55, -0.25), [1, 1, 1]),
    paint(new THREE.BoxGeometry(0.4, 0.14, 0.05).translate(-0.62, 0.72, 2.21), [1, 1, 0.9], 1),
    paint(new THREE.BoxGeometry(0.4, 0.14, 0.05).translate(0.62, 0.72, 2.21), [1, 1, 0.9], 1),
    paint(new THREE.BoxGeometry(0.45, 0.12, 0.05).translate(-0.6, 0.78, -2.21), [0.8, 0.05, 0.03], 2),
    paint(new THREE.BoxGeometry(0.45, 0.12, 0.05).translate(0.6, 0.78, -2.21), [0.8, 0.05, 0.03], 2),
  ];
  for (const [x, z] of [[-0.86, 1.4], [0.86, 1.4], [-0.86, -1.35], [0.86, -1.35]]) parts.push(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10).rotateZ(Math.PI / 2).translate(x, 0.34, z), [0.04, 0.04, 0.04]));
  return mergeGeometries(parts.map(flat));
}

const CAR_COLORS = [0xe8e8e8, 0x1a1a1a, 0x8a1010, 0x16305e, 0x707478, 0xb0b4b8, 0x2c4a30, 0xc9a227, 0x4a2a1a, 0xffffff];

export class StreetProps {
  constructor(layout, lighting) {
    this.group = new THREE.Group();
    this.night = lighting.uniforms.uNight;
    const r = mulberry32(layout.seed + 77), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), col = new THREE.Color();

    // lamps
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x24272a, metalness: 0.75, roughness: 0.4 });
    const lamps = new THREE.InstancedMesh(lampGeometry(), lampMat, layout.lamps.length);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc27a, emissiveIntensity: 0 });
    const bulbs = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.7).rotateX(Math.PI / 2).translate(0, 7.32, 1.85), this.bulbMat, layout.lamps.length);
    const poolTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), this.poolMat, layout.lamps.length);
    layout.lamps.forEach((l, i) => {
      q.setFromAxisAngle(up, l.ry); p.set(l.x, ROAD.CURB_H, l.z); m4.compose(p, q, s);
      lamps.setMatrixAt(i, m4); bulbs.setMatrixAt(i, m4);
      const off = new THREE.Vector3(0, 0, 2.2).applyQuaternion(q);
      pools.setMatrixAt(i, new THREE.Matrix4().makeTranslation(l.x + off.x, 0.2, l.z + off.z));
    });
    lamps.castShadow = true; lamps.receiveShadow = true; pools.userData.noAO = true; pools.renderOrder = 2;
    this.group.add(lamps, bulbs, pools);

    // trees
    const tg = treeGeometries(layout.seed);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.5 });
    const trunks = new THREE.InstancedMesh(tg.trunk, trunkMat, layout.trees.length);
    const leaves = new THREE.InstancedMesh(tg.canopy, leafMat, layout.trees.length);
    layout.trees.forEach((t, i) => {
      q.setFromAxisAngle(up, r() * 6.28); s.setScalar(t.s); p.set(t.x, ROAD.CURB_H, t.z); m4.compose(p, q, s);
      trunks.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, col.setHSL(0.2 + r() * 0.1, 0.35 + r() * 0.2, 0.09 + r() * 0.07));
    });
    s.set(1, 1, 1);
    for (const im of [trunks, leaves]) { im.castShadow = true; im.receiveShadow = true; }
    this.group.add(trunks, leaves);

    // cars (parked + moving share one instanced mesh)
    const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32 });
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
    const moving = [];
    for (const lane of layout.lanes) {
      const n = Math.floor((lane.b - lane.a) / 120);
      for (let k = 0; k < n; k++) moving.push({ lane, s: lane.a + (k + r()) * ((lane.b - lane.a) / n), v: r.range(8, 14) });
    }
    this.moving = moving;
    const total = layout.parked.length + moving.length;
    const cars = this.cars = new THREE.InstancedMesh(carGeometry(), carMat, total);
    layout.parked.forEach((c, i) => {
      q.setFromAxisAngle(up, c.ry); p.set(c.x, 0, c.z); cars.setMatrixAt(i, m4.compose(p, q, s));
      cars.setColorAt(i, col.set(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]));
    });
    this.movingOffset = layout.parked.length;
    moving.forEach((c, i) => cars.setColorAt(this.movingOffset + i, col.set(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)])));
    cars.castShadow = true; cars.receiveShadow = true; cars.frustumCulled = false;
    this.group.add(cars);
    this._m4 = m4; this._q = q; this._p = p; this._s = s; this._up = up;
    this.update(0);
  }

  update(dt) {
    const n = this.night.value;
    this.bulbMat.emissiveIntensity = 0.05 + n * 9;
    this.poolMat.opacity = n * 0.55;
    const { _m4: m4, _q: q, _p: p, _s: s, _up: up } = this;
    this.moving.forEach((c, i) => {
      const L = c.lane, span = L.b - L.a;
      c.s += c.v * dt * L.dir; if (c.s > L.b) c.s -= span; if (c.s < L.a) c.s += span;
      if (L.axis === 'z') { p.set(L.c, 0, c.s); q.setFromAxisAngle(up, L.dir > 0 ? 0 : Math.PI); }
      else { p.set(c.s, 0, L.c); q.setFromAxisAngle(up, L.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
      this.cars.setMatrixAt(this.movingOffset + i, m4.compose(p, q, s));
    });
    this.cars.instanceMatrix.needsUpdate = true;
  }
}
