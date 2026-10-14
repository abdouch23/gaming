// First-person walk mode: pointer-lock mouse look, WASD, sprint, crouch, jump, gravity.
// Collides with rotated building tiers, tree trunks, lamp posts, parked cars and debris cells,
// steps up curbs and climbs rubble piles (debris spheres act as walkable ground).
import * as THREE from 'three';
import * as G2 from '../core/geom2d.js';
import { CURB_H } from '../city/CityLayout.js';

const EYE = 1.65, CROUCH_EYE = 1.0, HEIGHT = 1.8, R = 0.32, STEP = 0.55;
const SPEED = { walk: 4.5, sprint: 8.5, crouch: 2.0 };

export class FirstPerson {
  constructor(camera, dom, audio) {
    this.camera = camera; this.dom = dom; this.audio = audio;
    this.active = false; this.locked = false; this.sens = 0.0022;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.onGround = true; this.eye = EYE; this.camY = 0;
    this.bob = 0; this.stepIdx = 0; this.dip = 0; this.onLockChange = null;
    this.saved = null; this.blocks = []; this.circles = [];
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * this.sens, -1.52, 1.52);
    });
  }

  /** static colliders of a freshly generated city */
  setWorld(city, demolition) {
    this.city = city; this.demo = demolition;
    this.blocks = city.layout.blocks.map((b) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const q of b.curb) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[1]); }
      return { b, x0, z0, x1, z1 };
    });
    const C = [];
    for (const t of city.layout.trees) C.push({ x: t.x, z: t.z, r: 0.28 * t.s, top: 3 });
    for (const l of city.layout.lamps) C.push({ x: l.x, z: l.z, r: 0.2, top: 7.5 });
    for (const c of city.layout.parked) { // two circles along the car
      const f = [Math.sin(c.ry), Math.cos(c.ry)];
      for (const k of [-1.2, 1.2]) C.push({ x: c.x + f[0] * k, z: c.z + f[1] * k, r: 1.0, top: 1.5 });
    }
    this.circles = C;
    if (this.active) this.teleport(this.pos.x, this.pos.z);
  }

  lock() {
    try { const p = this.dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* user gesture required */ }
  }

  enter(controls) {
    const cam = this.camera;
    this.saved = { pos: cam.position.clone(), target: controls.target.clone(), fov: cam.fov, near: cam.near };
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z); this.pitch = 0;
    // start on the sidewalk nearest to the orbit target (next to the closest street lamp)
    const t = controls.target; let best = null, bd = Infinity;
    for (const l of this.city.layout.lamps) { const d = (l.x - t.x) ** 2 + (l.z - t.z) ** 2; if (d < bd) { bd = d; best = l; } }
    if (best) this.teleport(best.x - Math.sin(best.ry) * 1.6, best.z - Math.cos(best.ry) * 1.6);
    else this.teleport(t.x, t.z);
    controls.enabled = false;
    cam.fov = 72; cam.near = 0.12; cam.rotation.order = 'YXZ'; cam.updateProjectionMatrix();
    this.active = true; this.vel.set(0, 0, 0);
    this._apply(0);
  }

  exit(controls) {
    const cam = this.camera, s = this.saved;
    this.active = false;
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
    cam.rotation.order = 'XYZ';
    if (s) {
      cam.fov = s.fov; cam.near = s.near;
      // orbit around where the player stood
      const off = s.pos.clone().sub(s.target);
      controls.target.set(this.pos.x, Math.max(2, this.pos.y + 1.5), this.pos.z);
      cam.position.copy(controls.target).add(off.setLength(Math.min(off.length(), 160)));
    }
    cam.updateProjectionMatrix(); controls.enabled = true; controls.update();
  }

  teleport(x, z) {
    this.pos.set(x, 0, z);
    const head = () => this.pos.y + HEIGHT;
    for (let i = 0; i < 12; i++) this._collide(this.pos, this.pos.y, head());
    this.pos.y = this._groundAt(this.pos.x, this.pos.z, 50);
    this.camY = this.pos.y + this.eye; this.vel.set(0, 0, 0);
  }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  /* ---------- world queries ---------- */
  _groundAt(x, z, feet) {
    let h = 0;
    for (const k of this.blocks) {
      if (x < k.x0 || x > k.x1 || z < k.z0 || z > k.z1) continue;
      if (!G2.pointInPoly([x, z], k.b.curb)) continue;
      h = CURB_H;
      if (k.b.lawn && G2.pointInPoly([x, z], k.b.lot)) h = CURB_H + 0.1;
      break;
    }
    if (this.demo) for (const b of this.demo.world.bodies) { // rubble surfaces
      const dx = x - b.p.x, dz = z - b.p.z, rr = b.r * 0.92, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const top = b.p.y + Math.sqrt(rr * rr - d2);
      if (top <= feet + STEP && top > h) h = top;
    }
    return h;
  }

  _collide(p, feet, head) {
    const bs = this.city.layout.buildings;
    for (let it = 0; it < 2; it++) {
      for (const b of bs) {
        if (b.demolished) continue;
        const bx = b.box;
        if (p.x < bx.min.x - R || p.x > bx.max.x + R || p.z < bx.min.z - R || p.z > bx.max.z + R) continue;
        const c = Math.cos(b.angle), s = Math.sin(b.angle), dx = p.x - b.cx, dz = p.z - b.cz;
        let lx = dx * c - dz * s, lz = dx * s + dz * c, hit = false;
        for (const t of b.tiers) {
          if (feet >= t.y1 - 0.01 || head <= t.y0) continue;
          const hx = t.w / 2, hz = t.d / 2;
          let qx = lx - t.ox, qz = lz - t.oz;
          const cx = Math.max(-hx, Math.min(hx, qx)), cz = Math.max(-hz, Math.min(hz, qz));
          const ex = qx - cx, ez = qz - cz, d2 = ex * ex + ez * ez;
          if (d2 === 0) { // centre inside the footprint: leave through the nearest side
            const px = hx - Math.abs(qx), pz = hz - Math.abs(qz);
            if (px < pz) qx = Math.sign(qx || 1) * (hx + R); else qz = Math.sign(qz || 1) * (hz + R);
          } else if (d2 < R * R) {
            const d = Math.sqrt(d2); qx = cx + (ex / d) * R; qz = cz + (ez / d) * R;
          } else continue;
          lx = qx + t.ox; lz = qz + t.oz; hit = true;
        }
        if (hit) { p.x = b.cx + lx * c + lz * s; p.z = b.cz - lx * s + lz * c; }
      }
      for (const o of this.circles) {
        if (feet > o.top) continue;
        const dx = p.x - o.x, dz = p.z - o.z, rr = o.r + R, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2); p.x = o.x + (dx / d) * rr; p.z = o.z + (dz / d) * rr;
      }
      if (this.demo) for (const b of this.demo.world.bodies) {
        const rr = b.r * 0.92;
        if (b.p.y + rr <= feet + STEP || b.p.y - rr >= head) continue; // walkable or overhead
        const dx = p.x - b.p.x, dz = p.z - b.p.z, lim = rr + R, d2 = dx * dx + dz * dz;
        if (d2 >= lim * lim || d2 < 1e-8) continue;
        const d = Math.sqrt(d2); p.x = b.p.x + (dx / d) * lim; p.z = b.p.z + (dz / d) * lim;
      }
    }
  }

  /* ---------- per frame ---------- */
  update(dt, keys) {
    if (!this.active) return;
    const crouch = keys.has('KeyC') || keys.has('ControlLeft');
    const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !crouch;
    const speed = crouch ? SPEED.crouch : sprint ? SPEED.sprint : SPEED.walk;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = 0, wz = 0;
    if (this.locked) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) { wx -= sy; wz -= cy; }
      if (keys.has('KeyS') || keys.has('ArrowDown')) { wx += sy; wz += cy; }
      if (keys.has('KeyD') || keys.has('ArrowRight')) { wx += cy; wz -= sy; }
      if (keys.has('KeyA') || keys.has('ArrowLeft')) { wx -= cy; wz += sy; }
    }
    const wl = Math.hypot(wx, wz); if (wl > 0) { wx = (wx / wl) * speed; wz = (wz / wl) * speed; }
    const k = 1 - Math.exp(-(this.onGround ? 12 : 2.5) * dt);
    this.vel.x += (wx - this.vel.x) * k; this.vel.z += (wz - this.vel.z) * k;
    if (this.locked && keys.has('Space') && this.onGround) { this.vel.y = 6.2; this.onGround = false; }
    this.vel.y -= 20 * dt;

    const wasGround = this.onGround, vyBefore = this.vel.y, p = this.pos;
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.25));
    for (let i = 0; i < steps; i++) {
      p.x += (this.vel.x * dt) / steps; p.z += (this.vel.z * dt) / steps;
      this._collide(p, p.y + 0.05, p.y + (crouch ? 1.2 : HEIGHT));
    }
    p.y += this.vel.y * dt;
    const g = this._groundAt(p.x, p.z, p.y);
    if (p.y <= g || (wasGround && this.vel.y <= 0 && p.y - g < STEP)) { // land / step up / follow curbs down
      if (!wasGround && vyBefore < -7) this.dip = Math.min(0.3, -vyBefore * 0.025);
      p.y = g; this.vel.y = 0; this.onGround = true;
    } else this.onGround = false;
    this._apply(dt, crouch, sprint);
  }

  _apply(dt, crouch = false, sprint = false) {
    this.eye += ((crouch ? CROUCH_EYE : EYE) - this.eye) * (1 - Math.exp(-10 * dt));
    const target = this.pos.y + this.eye;
    this.camY = this.onGround ? this.camY + (target - this.camY) * (1 - Math.exp(-18 * dt)) : target; // smooth curb steps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let bobY = 0, roll = 0;
    if (this.onGround && hs > 0.4) {
      this.bob += hs * dt * 1.75;
      const amp = Math.min(1.4, hs / SPEED.walk);
      bobY = Math.sin(this.bob * 2) * 0.035 * amp; roll = Math.sin(this.bob) * 0.006 * amp;
      const idx = Math.floor(this.bob / Math.PI);
      if (idx !== this.stepIdx) { this.stepIdx = idx; if (this.audio) this.audio.footstep(sprint ? 1.4 : crouch ? 0.5 : 1); }
    }
    this.dip *= Math.exp(-8 * dt);
    this.camera.position.set(this.pos.x, this.camY + bobY - this.dip, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, roll, 'YXZ');
    this.camera.updateMatrixWorld();
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
}
