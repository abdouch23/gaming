// Pursuers on the mountain: a two-man gendarme patrol on the valley bank, their tracking dog,
// and an observer at the valley head. The dog follows the player's scent trail; walking in water erases it.
import * as THREE from "three";
import { makeGendarme } from "@/lib/night/figures";
import { groundAt, lineClear, coverAt, PATROL, OBSERVER, type V2 } from "@/lib/mountain/world";

const FACE = (dx: number, dz: number) => Math.atan2(dx, dz);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface Stim {
  chest: THREE.Vector3;
  feet: THREE.Vector3;
  visibility: number;
  concealed: boolean; // crouched in a bush or deep shadow: invisible beyond 3 m
  noise: number;
  crouch: boolean;
  moving: boolean;
}
export type GState = "calm" | "suspicious" | "investigate" | "alert" | "search" | "down";

export class Guard {
  group: THREE.Group;
  pos = new THREE.Vector3();
  yaw = 0;
  state: GState = "calm";
  suspicion = 0;
  hp = 100;
  route: V2[];
  idx = 1;
  dir = 1;
  pause = 0;
  goal: THREE.Vector3 | null = null;
  timer = 0;
  fireCd = 1.5;
  aim = 0;
  sees = false;
  lantern: THREE.PointLight | null;
  walk = 0;
  readonly home: THREE.Vector3;
  readonly id: string;
  readonly range: number;
  readonly half: number;
  readonly static_: boolean;
  constructor(scene: THREE.Scene, id: string, x: number, z: number, route: V2[], lantern: boolean, range: number, half: number, static_ = false) {
    this.id = id;
    this.range = range;
    this.half = half;
    this.static_ = static_;
    this.group = makeGendarme(id === "p2").group;
    scene.add(this.group);
    this.route = route;
    this.pos.set(x, groundAt(x, z), z);
    this.home = this.pos.clone();
    this.lantern = null;
    if (lantern) {
      this.lantern = new THREE.PointLight(0xffa152, 6, 11, 2);
      scene.add(this.lantern);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.17, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa555, emissiveIntensity: 5 }));
      glass.position.set(0.28, 0.9, 0.18);
      this.group.add(glass);
    }
  }
  get alive() {
    return this.state !== "down";
  }
  eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.62, this.pos.z);
  }
  place() {
    this.group.position.copy(this.pos);
    if (this.state === "down") {
      this.group.rotation.set(-Math.PI / 2, this.yaw, 0, "YXZ");
      this.group.position.y += 0.18;
    } else this.group.rotation.set(0, this.yaw, 0, "YXZ");
    const sw = Math.sin(this.walk) * 0.35;
    this.group.children[0].rotation.x = sw;
    this.group.children[1].rotation.x = -sw;
    if (this.lantern) {
      this.lantern.position.set(this.pos.x + Math.cos(this.yaw) * 0.28, this.pos.y + 0.9, this.pos.z - Math.sin(this.yaw) * 0.28);
      this.lantern.intensity = this.state === "down" ? 0 : 6;
    }
  }
}

/** a lean, low tracking dog (the design doc's missing SM_Dog, built procedurally) */
function makeDog() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x2b241c, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.62, 4, 10), fur);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.55, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.32), fur);
  head.position.set(0, 0.74, 0.5);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.16), fur);
  snout.position.set(0, 0.69, 0.71);
  const ears = [-0.07, 0.07].map((x) => {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), fur);
    e.position.set(x, 0.88, 0.45);
    return e;
  });
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.4, 5), fur);
  tail.position.set(0, 0.7, -0.5);
  tail.rotation.x = -0.9;
  const legs = [[-0.1, 0.32], [0.1, 0.32], [-0.1, -0.3], [0.1, -0.3]].map(([x, z]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.46, 5), fur);
    l.position.set(x, 0.23, z);
    return l;
  });
  g.add(body, head, snout, ...ears, tail, ...legs);
  g.traverse((o) => (o.castShadow = true));
  return { group: g, legs, tail };
}

export class Dog {
  group: THREE.Group;
  pos = new THREE.Vector3();
  yaw = 0;
  state: "heel" | "track" | "bark" | "down" = "heel";
  barkCd = 0;
  barking = 0;
  private legs: THREE.Mesh[];
  private tail: THREE.Mesh;
  private walk = 0;
  constructor(scene: THREE.Scene) {
    const d = makeDog();
    this.group = d.group;
    this.legs = d.legs;
    this.tail = d.tail;
    scene.add(this.group);
  }
  place(t: number) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const sw = Math.sin(this.walk) * 0.5;
    this.legs.forEach((l, i) => (l.rotation.x = i % 2 ? sw : -sw));
    this.tail.rotation.z = Math.sin(t * (this.state === "track" ? 14 : 5)) * 0.4;
    if (this.state === "down") this.group.rotation.z = Math.PI / 2;
  }
  step(dx: number, dz: number, speed: number, dt: number) {
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const s = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
    this.pos.y = groundAt(this.pos.x, this.pos.z);
    this.yaw += wrap(FACE(dx, dz) - this.yaw) * Math.min(1, dt * 8);
    this.walk += s * 5;
  }
}

export interface PursuitEvents {
  onCaught?: () => void;
  onShot?: (from: THREE.Vector3, to: THREE.Vector3, hit: boolean, dmg: number) => void;
  onBark?: (at: THREE.Vector3) => void;
  onAlarm?: (why: string) => void;
}

/** scent breadcrumbs (x, z, time) */
export class Scent {
  pts: { x: number; z: number; t: number }[] = [];
  add(x: number, z: number, t: number) {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 1.5) return;
    this.pts.push({ x, z, t });
    if (this.pts.length > 400) this.pts.shift();
  }
  clear() {
    this.pts.length = 0;
  }
}

export class Pursuers {
  guards: Guard[];
  dog: Dog;
  alarm = 0; // 0 calm · 1 searching · 2 shooting
  lastKnown = new THREE.Vector3();
  lastAge = 999;
  reinforce = -1;
  scent = new Scent();
  private trailIdx = -1;
  private ev: PursuitEvents;
  private t = 0;

  constructor(scene: THREE.Scene, ev: PursuitEvents) {
    this.ev = ev;
    this.guards = [
      new Guard(scene, "p1", PATROL[0][0], PATROL[0][1], PATROL, true, 26, 0.85),
      new Guard(scene, "p2", PATROL[0][0] + 1.2, PATROL[0][1] - 1, PATROL, false, 24, 0.85),
      new Guard(scene, "obs", OBSERVER.x, OBSERVER.z, [], false, 30, 0.6, true),
      // the pursuers that gunfire brings up from the town
      new Guard(scene, "r1", 6, 60, [], true, 26, 0.9),
      new Guard(scene, "r2", -6, 62, [], false, 26, 0.9),
    ];
    this.guards[2].yaw = FACE(-1, 0.9);
    for (const id of ["r1", "r2"]) this.get(id).group.visible = false;
    this.get("r1").state = this.get("r2").state = "down";
    this.dog = new Dog(scene);
    this.dog.pos.copy(this.guards[0].pos).add(new THREE.Vector3(-1, 0, 1.5));
  }
  get(id: string) {
    return this.guards.find((g) => g.id === id)!;
  }
  maxSuspicion() {
    return this.guards.reduce((m, g) => (g.alive ? Math.max(m, g.state === "alert" ? 1 : g.suspicion) : m), 0);
  }
  /** a gunshot anywhere on the mountain: everyone hears it, and the town sends two more */
  gunshot(at: THREE.Vector3) {
    for (const g of this.guards) {
      if (!g.alive) continue;
      if (g.pos.distanceTo(at) < 140) {
        g.state = g.static_ ? "alert" : "search";
        g.goal = at.clone();
        g.timer = 30;
      }
    }
    this.lastKnown.copy(at);
    this.lastAge = 0;
    if (this.reinforce < 0) {
      this.reinforce = 25;
      this.ev.onAlarm?.("gunshot");
    }
    this.alarm = Math.max(this.alarm, 1);
  }
  damage(g: Guard, dmg: number) {
    if (!g.alive) return false;
    g.hp -= dmg;
    if (g.hp > 0) return false;
    g.state = "down";
    g.place();
    return true;
  }
  rayHit(o: THREE.Vector3, d: THREE.Vector3, max: number) {
    let best: { g: Guard; t: number; head: boolean } | null = null;
    for (const g of this.guards) {
      if (!g.alive || !g.group.visible) continue;
      const ox = o.x - g.pos.x, oz = o.z - g.pos.z;
      const a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - 0.34 * 0.34;
      const disc = b * b - 4 * a * c;
      if (disc < 0 || a < 1e-6) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > max || (best && t > best.t)) continue;
      const y = o.y + d.y * t - g.pos.y;
      if (y < 0 || y > 1.85) continue;
      best = { g, t, head: y > 1.55 };
    }
    return best;
  }

  update(dt: number, st: Stim | null, inWaterNow: boolean) {
    this.t += dt;
    this.lastAge += dt;
    if (st && !inWaterNow && st.moving) this.scent.add(st.feet.x, st.feet.z, this.t);
    if (inWaterNow && this.scent.pts.length) {
      // water erases the trail: the dog loses it
      this.scent.clear();
      this.trailIdx = -1;
    }
    if (this.reinforce > 0) {
      this.reinforce -= dt;
      if (this.reinforce <= 0) {
        for (const id of ["r1", "r2"]) {
          const g = this.get(id);
          g.state = "search";
          g.hp = 100;
          g.group.visible = true;
          g.goal = this.lastKnown.clone();
          g.timer = 60;
        }
        this.ev.onAlarm?.("reinforcements");
      }
    }
    for (const g of this.guards) {
      if (!g.alive) continue;
      if (st) this.sense(g, st, dt);
      this.act(g, st, dt);
      g.place();
    }
    this.updateDog(dt, st);
  }

  private sense(g: Guard, st: Stim, dt: number) {
    const eye = g.eye();
    const dx = st.chest.x - eye.x, dz = st.chest.z - eye.z, dist = Math.hypot(dx, dz);
    const alert = g.state === "alert";
    const range = g.range * (alert ? 1.8 : 1);
    g.sees = false;
    let gain = 0;
    if (dist < range) {
      const ang = Math.abs(wrap(FACE(dx, dz) - g.yaw));
      const concealed = st.concealed && dist > 3 && !alert;
      if ((ang < (alert ? 1.3 : g.half) || dist < 2.5) && !concealed && lineClear(eye.x, eye.y, eye.z, st.chest.x, st.chest.y, st.chest.z, st.crouch)) {
        g.sees = true;
        gain += Math.max(0.15, st.visibility) * (1.5 - dist / range) * (alert ? 2 : 1);
      }
    }
    if (st.noise > 0 && dist < st.noise) {
      gain += 0.3;
      if (g.state === "calm") {
        g.state = "suspicious";
        g.goal = st.feet.clone();
      }
    }
    if (g.sees) {
      this.lastKnown.copy(st.feet);
      this.lastAge = 0;
    }
    if (alert) return;
    g.suspicion = gain > 0 ? g.suspicion + gain * dt : Math.max(0, g.suspicion - 0.14 * dt);
    if (g.suspicion > 0.5 && (g.state === "calm" || g.state === "suspicious") && !g.static_) {
      g.state = "investigate";
      g.goal = st.feet.clone();
      g.timer = 8;
    }
    if (g.suspicion >= 1) {
      g.state = "alert";
      g.suspicion = 1;
      this.alarm = 2;
      this.ev.onAlarm?.("spotted");
    }
  }

  private walkTo(g: Guard, x: number, z: number, speed: number, dt: number) {
    const dx = x - g.pos.x, dz = z - g.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    const s = Math.min(d, speed * dt);
    g.pos.x += (dx / d) * s;
    g.pos.z += (dz / d) * s;
    g.pos.y = groundAt(g.pos.x, g.pos.z);
    g.yaw += wrap(FACE(dx, dz) - g.yaw) * Math.min(1, dt * 5);
    g.walk += s * 3.3;
    return false;
  }

  private act(g: Guard, st: Stim | null, dt: number) {
    if (g.state === "alert" && st) {
      g.yaw += wrap(FACE(st.feet.x - g.pos.x, st.feet.z - g.pos.z) - g.yaw) * Math.min(1, dt * 6);
      if (g.sees) {
        g.aim += dt;
        g.fireCd -= dt;
        if (g.aim > 1.2 && g.fireCd <= 0) {
          g.fireCd = 1.8 + Math.random() * 1.2;
          const dist = g.pos.distanceTo(st.feet);
          let p = 0.45 - dist / 70;
          if (st.crouch) p *= 0.7;
          if (st.moving) p *= 0.75;
          p = THREE.MathUtils.clamp(p, 0.05, 0.55);
          const hit = Math.random() < p;
          const to = st.chest.clone();
          if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.3) * 1.4, (Math.random() - 0.5) * 2.4));
          this.ev.onShot?.(g.eye().add(new THREE.Vector3(Math.sin(g.yaw) * 0.5, -0.1, Math.cos(g.yaw) * 0.5)), to, hit, hit ? 12 + Math.random() * 8 : 0);
          this.gunshot(g.pos.clone());
        }
        if (!g.static_ && dist2(g.pos, st.feet) > 64) this.walkTo(g, st.feet.x, st.feet.z, 2.6, dt);
        if (!g.static_ && dist2(g.pos, st.feet) < 2.6) this.ev.onCaught?.();
      } else {
        g.aim = 0;
        if (!g.static_) {
          if (this.walkTo(g, this.lastKnown.x, this.lastKnown.z, 2.8, dt) || this.lastAge > 25) {
            g.state = "search";
            g.timer = 25;
            g.goal = this.lastKnown.clone();
          }
        } else if (this.lastAge > 20) g.state = "calm";
      }
      return;
    }
    if (g.state === "investigate" || g.state === "suspicious" || g.state === "search") {
      if (g.static_) {
        if (g.goal) g.yaw += wrap(FACE(g.goal.x - g.pos.x, g.goal.z - g.pos.z) - g.yaw) * Math.min(1, dt * 2);
        g.timer -= dt;
        if (g.timer <= 0 && g.state !== "search") g.state = "calm";
        return;
      }
      if (g.goal && !this.walkTo(g, g.goal.x, g.goal.z, g.state === "search" ? 2.2 : 1.4, dt)) return;
      g.timer -= dt;
      g.yaw += dt * 1.1;
      if (g.state === "search" && g.timer > 0 && Math.random() < dt * 0.4) {
        const a = Math.random() * Math.PI * 2;
        g.goal = this.lastKnown.clone().add(new THREE.Vector3(Math.cos(a) * 8, 0, Math.sin(a) * 8));
      }
      if (g.timer <= 0) {
        g.state = "calm";
        g.suspicion = Math.min(g.suspicion, 0.2);
        g.goal = null;
      }
      return;
    }
    // calm
    if (g.static_ || !g.route.length) {
      if (!g.static_) {
        this.walkTo(g, g.home.x, g.home.z, 1.4, dt);
        return;
      }
      g.yaw = FACE(-1, 0.9) + Math.sin(this.t * 0.25) * 0.45; // the observer sweeps the valley exit
      return;
    }
    if (g.id === "p2") {
      // walks a pace behind his partner
      const lead = this.get("p1");
      if (lead.state !== "calm") return;
      const bx = lead.pos.x - Math.sin(lead.yaw) * 1.5 + Math.cos(lead.yaw) * 0.7, bz = lead.pos.z - Math.cos(lead.yaw) * 1.5 - Math.sin(lead.yaw) * 0.7;
      this.walkTo(g, bx, bz, 1.6, dt);
      g.yaw += wrap(lead.yaw + 0.2 - g.yaw) * Math.min(1, dt * 2);
      return;
    }
    if (g.pause > 0) {
      g.pause -= dt;
      g.yaw += Math.sin(this.t * 0.7) * dt * 0.6;
      return;
    }
    const [tx, tz] = g.route[g.idx];
    if (this.walkTo(g, tx, tz, 1.2, dt)) {
      g.pause = 4 + Math.random() * 3;
      if (g.idx + g.dir >= g.route.length || g.idx + g.dir < 0) g.dir *= -1;
      g.idx += g.dir;
    }
  }

  private updateDog(dt: number, st: Stim | null) {
    const d = this.dog, handler = this.get("p1");
    if (d.state === "down") return;
    d.barkCd -= dt;
    // fresh scent within reach of the dog's nose?
    if (this.trailIdx < 0) {
      for (let i = this.scent.pts.length - 1; i >= 0; i--) {
        const p = this.scent.pts[i];
        if (this.t - p.t > 70) break;
        if (Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 18) {
          this.trailIdx = i;
          d.state = "track";
          break;
        }
      }
    }
    if (d.state === "track" && this.trailIdx >= 0) {
      const p = this.scent.pts[this.trailIdx];
      if (!p) {
        this.trailIdx = -1;
        d.state = "heel";
      } else {
        d.step(p.x - d.pos.x, p.z - d.pos.z, 2.4, dt);
        if (Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 0.8) this.trailIdx = Math.min(this.trailIdx + 1, this.scent.pts.length - 1);
        // the handlers follow their dog
        for (const g of [handler, this.get("p2")]) {
          if (!g.alive || g.state === "alert") continue;
          g.state = "investigate";
          g.goal = d.pos.clone();
          g.timer = 6;
        }
      }
    } else if (d.state !== "bark") {
      const h = handler.alive ? handler.pos : d.pos;
      const tx = h.x - Math.sin(handler.yaw) * 0.2 - Math.cos(handler.yaw) * 1.2, tz = h.z - Math.cos(handler.yaw) * 0.2 + Math.sin(handler.yaw) * 1.2;
      if (Math.hypot(tx - d.pos.x, tz - d.pos.z) > 0.6) d.step(tx - d.pos.x, tz - d.pos.z, 2, dt);
      d.state = "heel";
    }
    // close enough to smell or see the player: bark, and the patrol comes running
    if (st) {
      const dist = Math.hypot(st.feet.x - d.pos.x, st.feet.z - d.pos.z);
      const sniff = dist < 9 || (dist < 16 && d.state === "track");
      const see = dist < 14 && lineClear(d.pos.x, d.pos.y + 0.6, d.pos.z, st.chest.x, st.chest.y, st.chest.z) && !coverAt(st.feet.x, st.feet.z);
      if ((sniff || see) && d.barkCd <= 0) {
        d.barkCd = 1.4;
        d.barking = 1;
        this.ev.onBark?.(d.pos.clone());
        for (const g of this.guards) {
          if (!g.alive || g.static_ || g.id.startsWith("r")) continue;
          g.suspicion = Math.min(1, g.suspicion + (see ? 0.45 : 0.25));
          if (g.state !== "alert") {
            g.state = "investigate";
            g.goal = st.feet.clone();
            g.timer = 10;
          }
        }
        this.lastKnown.copy(st.feet);
        this.lastAge = 0;
        this.alarm = Math.max(this.alarm, 1);
      }
    }
    d.barking = Math.max(0, d.barking - dt);
    d.place(this.t);
  }

  snapshot() {
    return this.guards.map((g) => ({ id: g.id, down: g.state === "down", x: g.pos.x, z: g.pos.z, yaw: g.yaw }));
  }
  reset(snap?: ReturnType<Pursuers["snapshot"]>) {
    this.alarm = 0;
    this.lastAge = 999;
    this.reinforce = -1;
    this.scent.clear();
    this.trailIdx = -1;
    for (const g of this.guards) {
      const s = snap?.find((q) => q.id === g.id);
      const reserve = g.id.startsWith("r");
      g.state = reserve || s?.down ? "down" : "calm";
      g.suspicion = 0;
      g.hp = 100;
      g.aim = 0;
      g.goal = null;
      g.pause = 0;
      g.idx = 1;
      g.dir = 1;
      if (!s || !s.down) g.pos.copy(g.home);
      g.group.visible = !reserve;
      if (g.id === "obs") g.yaw = FACE(-1, 0.9);
      g.place();
    }
    this.dog.state = "heel";
    this.dog.pos.copy(this.guards[0].pos).add(new THREE.Vector3(-1, 0, 1.5));
  }
}
const dist2 = (a: THREE.Vector3, b: THREE.Vector3) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
