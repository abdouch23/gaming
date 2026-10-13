// Accumulates indexed geometry with the city vertex layout:
// position, normal, uv (metres), aLayer, aTint, aFacade (bay, floorH, groundH, windowStyle), aSeed.
import * as THREE from 'three';

const NO_FACADE = [0, 0, 0, 0];

export class GeoBuilder {
  constructor(cap = 4096) {
    this.cap = cap; this.nv = 0; this.ni = 0;
    this.p = new Float32Array(cap * 3); this.n = new Float32Array(cap * 3); this.uv = new Float32Array(cap * 2);
    this.l = new Float32Array(cap); this.t = new Float32Array(cap * 3); this.f = new Float32Array(cap * 4); this.s = new Float32Array(cap);
    this.i = new Uint32Array(cap * 2);
    this.m = new THREE.Matrix4(); this.nm = new THREE.Matrix3();
    this.layer = 0; this.tint = [1, 1, 1]; this.facade = NO_FACADE; this.seed = 0;
    this._v = new THREE.Vector3(); this._n = new THREE.Vector3();
  }
  get vertexCount() { return this.nv; }
  _grow() {
    const c = this.cap * 2, g = (a, k) => { const b = new a.constructor(c * k); b.set(a); return b; };
    this.p = g(this.p, 3); this.n = g(this.n, 3); this.uv = g(this.uv, 2); this.l = g(this.l, 1);
    this.t = g(this.t, 3); this.f = g(this.f, 4); this.s = g(this.s, 1); this.cap = c;
  }
  _idx(...a) {
    if (this.ni + a.length > this.i.length) { const b = new Uint32Array(this.i.length * 2); b.set(this.i); this.i = b; }
    for (const x of a) this.i[this.ni++] = x;
  }
  setTransform(m) { this.m.copy(m); this.nm.getNormalMatrix(m); return this; }
  identity() { this.m.identity(); this.nm.identity(); return this; }
  set(layer, tint = this.tint, facade = NO_FACADE, seed = this.seed) {
    this.layer = layer; this.tint = tint; this.facade = facade; this.seed = seed; return this;
  }

  vert(x, y, z, nx, ny, nz, u, v) {
    if (this.nv >= this.cap) this._grow();
    const e = this.m.elements, q = this.nm.elements, k = this.nv; // hot path: inline affine transform
    const P = this.p, N = this.n, k3 = k * 3;
    P[k3] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[k3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[k3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    const mx = q[0] * nx + q[3] * ny + q[6] * nz, my = q[1] * nx + q[4] * ny + q[7] * nz, mz = q[2] * nx + q[5] * ny + q[8] * nz;
    const il = 1 / (Math.sqrt(mx * mx + my * my + mz * mz) || 1);
    N[k3] = mx * il; N[k3 + 1] = my * il; N[k3 + 2] = mz * il;
    this.uv[k * 2] = u; this.uv[k * 2 + 1] = v; this.l[k] = this.layer; this.s[k] = this.seed;
    const T = this.tint, F = this.facade;
    this.t[k3] = T[0]; this.t[k3 + 1] = T[1]; this.t[k3 + 2] = T[2];
    this.f[k * 4] = F[0]; this.f[k * 4 + 1] = F[1]; this.f[k * 4 + 2] = F[2]; this.f[k * 4 + 3] = F[3];
    return this.nv++;
  }

  /** quad from 4 corners (counter-clockwise seen from the front), flat normal, explicit uvs [u0,v0,...] */
  quad(a, b, c, d, uvs) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const il = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= il; ny *= il; nz *= il;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, uvs[0], uvs[1]);
    this.vert(b[0], b[1], b[2], nx, ny, nz, uvs[2], uvs[3]);
    this.vert(c[0], c[1], c[2], nx, ny, nz, uvs[4], uvs[5]);
    this.vert(d[0], d[1], d[2], nx, ny, nz, uvs[6], uvs[7]);
    this._idx(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  /** planar polygon (convex or simple), uv by projection function (x,y,z)->[u,v] */
  poly(pts, uvFn, normal) {
    let n = normal;
    if (!n) { // Newell normal: robust when leading vertices are collinear
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const il = 1 / (Math.hypot(nx, ny, nz) || 1); n = [nx * il, ny * il, nz * il];
    }
    const base = this.vertexCount;
    for (const q of pts) { const uv = uvFn(q); this.vert(q[0], q[1], q[2], n[0], n[1], n[2], uv[0], uv[1]); }
    for (let k = 1; k < pts.length - 1; k++) this._idx(base, base + k, base + k + 1);
  }

  /** wall rectangle in a facade frame: origin o, tangent t (unit, horizontal), normal nrm; u in [u0,u1], y in [y0,y1], offset along normal */
  facadeRect(F, u0, u1, y0, y1, off = 0, uScale = 1) {
    const ox = F.o[0] + F.n[0] * off, oz = F.o[2] + F.n[2] * off;
    const A = [ox + F.t[0] * u0, y0, oz + F.t[2] * u0], B = [ox + F.t[0] * u1, y0, oz + F.t[2] * u1];
    const C = [B[0], y1, B[2]], D = [A[0], y1, A[2]];
    this.quad(A, B, C, D, [u0 * uScale, y0, u1 * uScale, y0, u1 * uScale, y1, u0 * uScale, y1]);
  }

  /** axis-aligned box in the current transform; uv in metres per face; skip = set of faces to omit ('px','nx','py','ny','pz','nz') */
  box(cx, cy, cz, sx, sy, sz, skip) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    if (!skip || !skip.includes('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, x1, y0, x1, y1, x0, y1]);
    if (!skip || !skip.includes('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [-x1, y0, -x0, y0, -x0, y1, -x1, y1]);
    if (!skip || !skip.includes('px')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [-z1, y0, -z0, y0, -z0, y1, -z1, y1]);
    if (!skip || !skip.includes('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [z0, y0, z1, y0, z1, y1, z0, y1]);
    if (!skip || !skip.includes('py')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0, -z1, x1, -z1, x1, -z0, x0, -z0]);
    if (!skip || !skip.includes('ny')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, z0, x1, z0, x1, z1, x0, z1]);
  }

  /** cylinder along Y (low poly), used for water tanks, poles */
  cylinder(cx, y0, cz, r, h, seg = 10, caps = true) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
      const u0 = a0 * r, u1 = a1 * r;
      this.quad([p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y0 + h, p0[1]], [p1[0], y0 + h, p1[1]], [u1, y0, u0, y0, u0, y0 + h, u1, y0 + h]);
    }
    if (caps) {
      const pts = []; for (let k = seg - 1; k >= 0; k--) { const a = (k / seg) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, y0 + h, cz + Math.sin(a) * r]); }
      this.poly(pts, (q) => [q[0], -q[2]], [0, 1, 0]);
    }
  }

  build() {
    const g = new THREE.BufferGeometry(), n = this.nv, A = (a, k) => new THREE.BufferAttribute(a.slice(0, n * k), k);
    g.setAttribute('position', A(this.p, 3));
    g.setAttribute('normal', A(this.n, 3));
    g.setAttribute('uv', A(this.uv, 2));
    g.setAttribute('aLayer', A(this.l, 1));
    g.setAttribute('aTint', A(this.t, 3));
    g.setAttribute('aFacade', A(this.f, 4));
    g.setAttribute('aSeed', A(this.s, 1));
    const idx = this.i.subarray(0, this.ni);
    g.setIndex(n > 65535 ? new THREE.BufferAttribute(idx.slice(), 1) : new THREE.BufferAttribute(Uint16Array.from(idx), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
