// Lightweight rigid-body solver for debris (approach from rock-strike v22: semi-implicit Euler, quaternion
// integration, impulse contacts with friction, spatial-hash broadphase, sleeping).
// Narrow phase: hull vertices vs ground / intact building boxes, spheres between fragments.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3();
const _a = new THREE.Vector3(), _iq = new THREE.Quaternion(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
const _vr = new THREE.Vector3(), _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _J = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export const STATIC = 0, DYNAMIC = 1, SLEEP = 2;

export class Body {
  constructor(o) {
    this.p = o.p.clone(); this.q = o.q.clone();
    this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
    this.m = o.mass; this.invM = 0; this.state = STATIC; this.sleepT = 0;
    this.hull = o.hull; this.r = o.radius; this.R = o.bound;
    const e = o.extent; // local half extents -> box inertia approximation
    const k = o.mass / 3;
    this.invI0 = new THREE.Vector3(1 / (k * (e.y * e.y + e.z * e.z)), 1 / (k * (e.x * e.x + e.z * e.z)), 1 / (k * (e.x * e.x + e.y * e.y)));
    this.invI = new THREE.Vector3();
    this.mesh = o.mesh || null; this.user = o.user || null;
    this.id = Body._id++;
  }
  release() { if (this.state === STATIC) { this.state = DYNAMIC; this.invM = 1 / this.m; this.invI.copy(this.invI0); this.sleepT = 0; } else if (this.state === SLEEP) this.wake(); }
  wake() { if (this.state === SLEEP) { this.state = DYNAMIC; this.sleepT = 0; } }
  invIw(vec, out) { // world inverse inertia * vec
    _iq.copy(this.q).invert();
    out.copy(vec).applyQuaternion(_iq).multiply(this.invI).applyQuaternion(this.q);
    return out;
  }
  applyImpulse(J, r) {
    if (this.invM === 0) return;
    this.v.addScaledVector(J, this.invM);
    this.w.add(this.invIw(_a.crossVectors(r, J), _w));
  }
}
Body._id = 0;

export class RigidWorld {
  constructor() {
    this.bodies = []; this.gravity = 13; this.cell = 10; this.hash = new Map();
    this.onBreak = null; // (staticBody, impactSpeed) -> void
    this.onImpact = null; // (point, speed, mass) -> void
    this._boxes = [];
  }
  add(b) { this.bodies.push(b); return b; }
  remove(b) { const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1); }
  get activeCount() { let n = 0; for (const b of this.bodies) if (b.state === DYNAMIC) n++; return n; }

  _contactStatic(b, point, n, e, mu) { // body vs immovable world
    _r.subVectors(point, b.p);
    _vr.crossVectors(b.w, _r).add(b.v);
    const vn = _vr.dot(n);
    if (vn >= 0) return 0;
    const k = b.invM + n.dot(_a.crossVectors(b.invIw(_t.crossVectors(_r, n), _w), _r));
    const j = (-(1 + (vn < -2 ? e : 0)) * vn) / k;
    b.applyImpulse(_J.copy(n).multiplyScalar(j), _r);
    // friction
    _vr.crossVectors(b.w, _r).add(b.v);
    _t.copy(_vr).addScaledVector(n, -_vr.dot(n));
    const vt = _t.length();
    if (vt > 1e-5) {
      _t.multiplyScalar(1 / vt);
      const kt = b.invM + _t.dot(_a.crossVectors(b.invIw(_c.crossVectors(_r, _t), _w), _r));
      const jt = Math.min(vt / kt, mu * j);
      b.applyImpulse(_J.copy(_t).multiplyScalar(-jt), _r);
    }
    return -vn;
  }

  step(dt, colliderQuery) {
    const B = this.bodies, g = this.gravity;
    // integrate
    for (const b of B) {
      if (b.state !== DYNAMIC) continue;
      b.v.y -= g * dt;
      b.v.multiplyScalar(Math.exp(-0.05 * dt)); b.w.multiplyScalar(Math.exp(-0.6 * dt));
      b.p.addScaledVector(b.v, dt);
      const wx = b.w.x * dt * 0.5, wy = b.w.y * dt * 0.5, wz = b.w.z * dt * 0.5, q = b.q;
      const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      q.set(qx + wx * qw + wy * qz - wz * qy, qy + wy * qw + wz * qx - wx * qz, qz + wz * qw + wx * qy - wy * qx, qw - wx * qx - wy * qy - wz * qz).normalize();
    }
    // broadphase
    const H = this.hash, cs = this.cell; H.clear();
    const key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    for (const b of B) {
      const k = key(Math.floor(b.p.x / cs), Math.floor(b.p.y / cs), Math.floor(b.p.z / cs));
      let a = H.get(k); if (!a) H.set(k, (a = [])); a.push(b);
    }
    // sphere pairs (dynamic vs anything)
    for (const a of B) {
      if (a.state !== DYNAMIC) continue;
      const cx = Math.floor(a.p.x / cs), cy = Math.floor(a.p.y / cs), cz = Math.floor(a.p.z / cs);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const arr = H.get(key(cx + i, cy + j, cz + k)); if (!arr) continue;
        for (const o of arr) {
          if (o === a || (o.state === DYNAMIC && o.id < a.id)) continue;
          this._pair(a, o);
        }
      }
    }
    // hull vs ground and intact buildings
    const boxes = this._boxes;
    for (const b of B) {
      if (b.state !== DYNAMIC) continue;
      const hv = b.hull, nv = hv.length / 3;
      if (b.p.y - b.R < 0.2) {
        const pts = [];
        for (let i = 0; i < nv; i++) {
          _v.set(hv[i * 3], hv[i * 3 + 1], hv[i * 3 + 2]).applyQuaternion(b.q).add(b.p);
          if (_v.y < 0) pts.push(_v.clone());
        }
        if (pts.length) {
          pts.sort((x, y) => x.y - y.y);
          const maxPen = -pts[0].y;
          let sp = 0;
          for (let i = 0; i < Math.min(4, pts.length); i++) sp = Math.max(sp, this._contactStatic(b, pts[i], UP, 0.18, 0.75));
          b.p.y += Math.max(0, maxPen - 0.005) * 0.8;
          if (sp > 4 && this.onImpact) this.onImpact(pts[0], sp, b.m);
        }
      }
      if (colliderQuery) {
        colliderQuery(b.p.x, b.p.z, b.R, boxes);
        for (const bx of boxes) {
          if (b.p.x + b.R < bx.min.x || b.p.x - b.R > bx.max.x || b.p.z + b.R < bx.min.z || b.p.z - b.R > bx.max.z || b.p.y - b.R > bx.max.y) continue;
          let best = null, bestPen = 0, bestN = null;
          for (let i = 0; i < nv; i++) {
            _v.set(hv[i * 3], hv[i * 3 + 1], hv[i * 3 + 2]).applyQuaternion(b.q).add(b.p);
            if (_v.x <= bx.min.x || _v.x >= bx.max.x || _v.z <= bx.min.z || _v.z >= bx.max.z || _v.y >= bx.max.y || _v.y <= bx.min.y) continue;
            const pens = [[_v.x - bx.min.x, -1, 0, 0], [bx.max.x - _v.x, 1, 0, 0], [_v.z - bx.min.z, 0, 0, -1], [bx.max.z - _v.z, 0, 0, 1], [bx.max.y - _v.y, 0, 1, 0]];
            pens.sort((x, y) => x[0] - y[0]);
            const [pen, nx, ny, nz] = pens[0];
            if (pen > bestPen) { bestPen = pen; best = _v.clone(); bestN = new THREE.Vector3(nx, ny, nz); }
          }
          if (best) { this._contactStatic(b, best, bestN, 0.1, 0.5); b.p.addScaledVector(bestN, Math.min(bestPen, 2) * 0.8); }
        }
      }
      // sleep
      if (b.v.lengthSq() < 0.06 && b.w.lengthSq() < 0.08) { b.sleepT += dt; if (b.sleepT > 0.7) { b.state = SLEEP; b.v.set(0, 0, 0); b.w.set(0, 0, 0); } }
      else b.sleepT = 0;
      if (b.p.y < -40) { b.state = SLEEP; b.v.set(0, 0, 0); b.w.set(0, 0, 0); }
    }
    for (const b of B) if (b.mesh && b.state !== STATIC) { b.mesh.position.copy(b.p); b.mesh.quaternion.copy(b.q); }
  }

  _pair(a, o) {
    _n.subVectors(o.p, a.p);
    const d = _n.length(), rs = a.r + o.r;
    if (d >= rs || d < 1e-6) return;
    _n.multiplyScalar(1 / d);
    const pen = rs - d;
    _ra.copy(_n).multiplyScalar(a.r); _rb.copy(_n).multiplyScalar(-o.r);
    const va = _v.crossVectors(a.w, _ra).add(a.v), vb = _c.crossVectors(o.w, _rb).add(o.v);
    const vn = _vr.subVectors(vb, va).dot(_n);
    const imA = a.invM, imB = o.state === DYNAMIC ? o.invM : 0;
    if (imA + imB === 0) return;
    if (vn < 0) {
      if (o.state === STATIC && this.onBreak && -vn > 7 && a.m > o.m * 0.12) this.onBreak(o, -vn);
      else if (o.state === SLEEP && -vn > 2.5) o.wake();
      const j = (-(1.15) * vn) / (imA + imB);
      _t.copy(_n).multiplyScalar(j);
      a.v.addScaledVector(_t, -imA);
      if (imB) o.v.addScaledVector(_t, imB);
      // spin from tangential slip
      _vr.addScaledVector(_n, -vn);
      a.w.addScaledVector(_a.crossVectors(_ra, _vr), 0.08 / (a.r * a.r + 0.1));
    }
    const corr = Math.max(0, pen - 0.02) * 0.5 / (imA + imB);
    a.p.addScaledVector(_n, -corr * imA);
    if (imB) o.p.addScaledVector(_n, corr * imB);
  }
}
