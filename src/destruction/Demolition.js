// Demolition: turns intact buildings into Voronoi cells on impact, applies blast damage, runs structural
// support checks (ground connectivity + storey overhang), progressive collapse, controlled implosion,
// and bakes settled rubble into a single mesh to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fractureBuilding, cellGeometry } from './Fracture.js';
import { RigidWorld, Body, STATIC, DYNAMIC } from './RigidWorld.js';
import { L } from '../materials/layers.js';

const CHIP_COLORS = { [L.BRICK]: new THREE.Color(0.55, 0.28, 0.2), [L.LIMESTONE]: new THREE.Color(0.8, 0.75, 0.65), [L.PLASTER]: new THREE.Color(0.85, 0.82, 0.78) };
const GREY = new THREE.Color(0.58, 0.57, 0.55);

export class Demolition {
  constructor(parent, city, materials, effects, lighting) {
    this.parent = parent; this.city = city; this.mats = materials; this.fx = effects; this.lighting = lighting;
    this.world = new RigidWorld();
    this.damaged = [];
    this.events = [];
    this.trauma = 0;
    this.time = 0;
    this.pendingBreak = new Set();
    this.aoDirty = 0;
    this.world.onBreak = (body) => this.pendingBreak.add(body);
    this._lastImpactSound = 0;
    this.world.onImpact = (p, speed, mass) => {
      if (speed > 9 && mass > 4000 && this.time - this._lastImpactSound > 0.15) {
        this._lastImpactSound = this.time; this.fx.debrisDust(p, Math.min(3, mass / 40000));
      }
    };
    this._colliders = (x, z, r, out) => this.city.collidersNear(x, z, r, out);
  }

  get cellCount() { return this.world.bodies.length; }
  get activeCount() { return this.world.activeCount; }

  /* ---------- fracture ---------- */
  _fracture(b, impactWorld, radius) {
    const local = impactWorld.clone().applyMatrix4(b.inverse);
    const cells = fractureBuilding(b, [local.x, local.y, local.z], { radius, maxCells: b.style === 'tower' ? 170 : 110 });
    this.city.hideBuilding(b);
    const q0 = new THREE.Quaternion().setFromRotationMatrix(b.matrix);
    const group = new THREE.Group(); group.name = 'damaged-' + b.id;
    const db = { b, cells: [], group, baked: null, settleT: 0, box: b.box.clone(), levels: null };
    for (const c of cells) {
      const { geo, hull } = cellGeometry(b, c);
      const mesh = new THREE.Mesh(geo, this.mats.world); mesh.castShadow = mesh.receiveShadow = true;
      const wc = new THREE.Vector3(...c.cen).applyMatrix4(b.matrix);
      mesh.position.copy(wc); mesh.quaternion.copy(q0); group.add(mesh);
      const ext = new THREE.Vector3(); let bound = 0;
      for (let i = 0; i < hull.length; i += 3) { ext.x = Math.max(ext.x, Math.abs(hull[i])); ext.y = Math.max(ext.y, Math.abs(hull[i + 1])); ext.z = Math.max(ext.z, Math.abs(hull[i + 2])); bound = Math.max(bound, Math.hypot(hull[i], hull[i + 1], hull[i + 2])); }
      const mass = c.vol * 450;
      const body = new Body({ p: wc, q: q0, mass, hull, radius: Math.max(0.3, Math.cbrt(c.vol) * 0.42), bound, extent: ext.addScalar(0.05), mesh });
      const aabb = new THREE.Box3();
      for (let i = 0; i < hull.length; i += 3) aabb.expandByPoint(new THREE.Vector3(hull[i], hull[i + 1], hull[i + 2]).applyQuaternion(q0).add(wc));
      const layer = mesh.geometry.attributes.aLayer.array[0];
      const rec = { body, mesh, vol: c.vol, aabb, adj: [], destroyed: false, db, color: CHIP_COLORS[layer] || GREY };
      body.user = rec;
      this.world.add(body); db.cells.push(rec);
    }
    // adjacency from touching bounds
    const ex = new THREE.Box3();
    for (let i = 0; i < db.cells.length; i++) {
      ex.copy(db.cells[i].aabb).expandByScalar(0.08);
      for (let j = i + 1; j < db.cells.length; j++) if (ex.intersectsBox(db.cells[j].aabb)) { db.cells[i].adj.push(db.cells[j]); db.cells[j].adj.push(db.cells[i]); }
    }
    this.parent.add(group);
    this.damaged.push(db);
    return db;
  }

  /* ---------- damage ---------- */
  _destroy(rec) {
    if (rec.destroyed) return;
    rec.destroyed = true;
    rec.mesh.parent && rec.mesh.parent.remove(rec.mesh);
    rec.mesh.geometry.dispose();
    this.world.remove(rec.body);
    const p = rec.body.p, n = Math.round(THREE.MathUtils.clamp(rec.vol * 0.35, 3, 30));
    this.fx.chipsBurst(p, n, THREE.MathUtils.clamp(Math.cbrt(rec.vol) * 0.28, 0.25, 1.3), rec.color, 10);
    this.fx.debrisDust(p, 1.5);
  }

  _release(rec, impulse) {
    const b = rec.body; if (rec.destroyed) return;
    b.release();
    if (impulse) b.v.add(impulse);
    b.w.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(impulse ? Math.min(3, impulse.length() * 0.15) : 0.3));
  }

  _unbake(db) {
    if (!db.baked) return;
    db.group.remove(db.baked); db.baked.geometry.dispose(); db.baked = null;
    for (const c of db.cells) if (!c.destroyed) db.group.add(c.mesh);
    db.settleT = 0;
  }

  /** structural check: everything not connected to the ground falls; a storey that lost most of its cells drops the floors above */
  _support(db, cutY) {
    const alive = db.cells.filter((c) => !c.destroyed);
    if (cutY !== undefined) {
      const span = alive.filter((c) => c.aabb.min.y <= cutY && c.aabb.max.y >= cutY);
      const total = db.cells.filter((c) => c.aabb.min.y <= cutY && c.aabb.max.y >= cutY).length;
      const standing = span.filter((c) => c.body.state === STATIC).length;
      if (total > 0 && standing / total < 0.45) for (const c of alive) if (c.body.state === STATIC && c.aabb.min.y > cutY - 1.5) this._release(c);
    }
    const seen = new Set(), stack = alive.filter((c) => c.body.state === STATIC && c.aabb.min.y < 0.3);
    stack.forEach((c) => seen.add(c));
    while (stack.length) { const c = stack.pop(); for (const a of c.adj) if (!a.destroyed && a.body.state === STATIC && !seen.has(a)) { seen.add(a); stack.push(a); } }
    let released = 0;
    for (const c of alive) if (c.body.state === STATIC && !seen.has(c)) { this._release(c); released++; }
    if (released > 8) { this.fx.audio.rumble(this._camDist(db.box.getCenter(new THREE.Vector3())), 5); }
    return released;
  }

  _camDist(p) { return this.lighting.cam.position.distanceTo(p); }

  /** missile / explosive impact at a world point */
  strike(point, { radius = 11, power = 1 } = {}) {
    const R = radius * power;
    // intact buildings in range get fractured (the hit one is always within range)
    for (const b of this.city.buildingsNear(point, R * 0.45)) this._fracture(b, point, R);
    const dirty = new Set();
    for (const db of this.damaged) {
      if (db.box.distanceToPoint(point) > R * 1.5) continue;
      this._unbake(db); dirty.add(db);
      for (const c of db.cells) {
        if (c.destroyed) continue;
        const d = Math.max(0, c.body.p.distanceTo(point) - c.body.r * 0.6);
        if (d < R * 0.5) this._destroy(c);
        else if (d < R * 1.45) {
          const dir = c.body.p.clone().sub(point).normalize();
          const sp = power * 26 * (1 - d / (R * 1.45)) / Math.max(1, Math.cbrt(c.vol) * 0.35);
          this._release(c, dir.multiplyScalar(sp).add(new THREE.Vector3(0, sp * 0.25, 0)));
        }
      }
    }
    for (const db of dirty) this._support(db, point.y);
    this.fx.explosion(point, Math.min(1.6, power));
    const dist = this._camDist(point);
    this.fx.audio.explosion(dist, Math.min(1.5, power));
    this.trauma = Math.min(1, this.trauma + THREE.MathUtils.clamp(1.15 - dist / 450, 0.15, 0.9) * power);
    this.aoDirty = 2.5;
  }

  /** controlled demolition: timed charges cut the ground floor, the structure folds inward */
  implode(b) {
    if (b.demolished) return;
    const c = b.box.getCenter(new THREE.Vector3()); c.y = b.gh * 0.5;
    const db = this._fracture(b, c, Math.max(b.w, b.d) * 0.5);
    const base = db.cells.filter((x) => x.aabb.min.y < b.gh * 0.9).sort((x, y) => x.body.p.x - y.body.p.x + (x.body.p.z - y.body.p.z) * 0.3);
    const center = b.box.getCenter(new THREE.Vector3());
    const T = 1.4;
    base.forEach((rec, i) => {
      const t = (i / Math.max(1, base.length - 1)) * T;
      this.events.push({ t: this.time + t, fn: () => {
        if (rec.destroyed) return;
        const p = rec.body.p.clone();
        this._destroy(rec);
        this.fx.fire.emit(p, new THREE.Vector3(0, 2, 0), 0.35, 1.5, 4, 1, 2, 2, [5, 3, 1.2], [1, 0.2, 0.05]);
        if (i % 4 === 0) this.fx.audio.explosion(this._camDist(p), 0.35);
      } });
    });
    this.events.push({ t: this.time + T + 0.05, fn: () => {
      this._support(db, b.gh * 0.5);
      for (const rec of db.cells) if (!rec.destroyed && rec.body.state === DYNAMIC) {
        const inward = center.clone().sub(rec.body.p).setY(0).normalize().multiplyScalar(1.2 + Math.random());
        rec.body.v.add(inward);
      }
      this.fx.collapseCloud(b.box);
      this.fx.audio.rumble(this._camDist(center), 7);
      this.trauma = Math.min(1, this.trauma + 0.5);
      this.aoDirty = 6;
    } });
    this.events.push({ t: this.time + T + 2.5, fn: () => this.fx.collapseCloud(b.box) });
  }

  update(dt) {
    this.time += dt;
    for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i].t <= this.time) { const e = this.events[i]; this.events.splice(i, 1); e.fn(); }
    if (this.pendingBreak.size) {
      const dbs = new Set();
      for (const body of this.pendingBreak) { const rec = body.user; if (rec && !rec.destroyed && body.state === STATIC) { this._release(rec); dbs.add(rec.db); } }
      this.pendingBreak.clear();
      for (const db of dbs) this._support(db);
    }
    const sub = 2, h = Math.min(dt, 1 / 30) / sub;
    for (let s = 0; s < sub; s++) this.world.step(h, this._colliders);
    // falling chunks shed dust
    for (const b of this.world.bodies) if (b.state === DYNAMIC && b.v.lengthSq() > 30 && Math.random() < 0.08) this.fx.debrisDust(b.p, 0.4);
    // bake settled buildings
    for (const db of this.damaged) {
      if (db.baked) continue;
      const moving = db.cells.some((c) => !c.destroyed && c.body.state === DYNAMIC);
      db.settleT = moving ? 0 : db.settleT + dt;
      if (db.settleT > 2.5) this._bake(db);
    }
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    if (this.aoDirty > 0) { this.aoDirty -= dt; if (this.aoDirty <= 0) this.lighting.rebuild(); }
  }

  _bake(db) {
    const geos = [];
    for (const c of db.cells) {
      if (c.destroyed) continue;
      c.mesh.updateMatrixWorld();
      geos.push(c.mesh.geometry.clone().applyMatrix4(c.mesh.matrixWorld));
      db.group.remove(c.mesh);
    }
    if (!geos.length) return;
    // indices must share a type before merging
    for (const g of geos) if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
    const merged = mergeGeometries(geos); geos.forEach((g) => g.dispose());
    const m = new THREE.Mesh(merged, this.mats.world); m.castShadow = m.receiveShadow = true; m.userData.damaged = db;
    db.baked = m; db.group.add(m);
    db.box.setFromObject(m);
    this.aoDirty = 0.5;
  }

  /** debris meshes for picking */
  pickables() {
    const out = [];
    for (const db of this.damaged) for (const o of db.group.children) out.push(o);
    return out;
  }

  clear() {
    for (const db of this.damaged) { db.group.traverse((o) => o.geometry && o.geometry.dispose()); this.parent.remove(db.group); }
    this.damaged = []; this.world.bodies.length = 0; this.events = [];
  }
}
