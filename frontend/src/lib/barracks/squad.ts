// The fawj (squad): three AI mujahideen who move with the player.
// Stealth contract: before the siren the garrison never perceives them (the player carries the stealth);
// they mirror the player's posture, hold on command, execute silent strikes on marked soldiers,
// and trade fire once the shooting starts. Built so a slot could later be driven by a human player.
import * as THREE from "three";
import { makeMujahid } from "@/lib/night/mujahid";
import { findPath, groundAt, solidAt, lineClear, type V2 } from "@/lib/barracks/map";
import type { Garrison, Soldier } from "@/lib/barracks/soldiers";

export { makeMujahid };

export type MateId = "laghrour" | "adjoul" | "azawi";
export type MateState = "follow" | "hold" | "strike" | "fight";

const FACE = (dx: number, dz: number) => Math.atan2(dx, dz);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// formation slots behind the player (x = right, z = back)
const SLOTS: V2[] = [[-1.3, 1.7], [1.4, 1.9], [0.1, 3.2]];

export class Mate {
  readonly id: MateId;
  readonly group: THREE.Group;
  pos = new THREE.Vector3();
  yaw = 0;
  state: MateState = "follow";
  joined = false;
  crouch = false;
  path: V2[] = [];
  repath = 0;
  holdAt = new THREE.Vector3();
  target: Soldier | null = null;
  fireCd = 1 + Math.random();
  walk = 0;
  moving = false;
  slot: V2;
  chest = new THREE.Vector3();

  constructor(id: MateId, group: THREE.Group, slot: V2) {
    this.id = id;
    this.group = group;
    this.slot = slot;
    this.pos.copy(group.position);
    this.yaw = group.rotation.y;
  }

  place() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const k = this.crouch ? 0.66 : 1;
    this.group.scale.y += (k - this.group.scale.y) * 0.25;
    const sw = this.moving ? Math.sin(this.walk) * (this.crouch ? 0.2 : 0.35) : 0;
    this.group.children[0].rotation.x = sw;
    this.group.children[1].rotation.x = -sw;
    this.chest.set(this.pos.x, this.pos.y + (this.crouch ? 0.8 : 1.3), this.pos.z);
  }

  teleport(x: number, z: number, yaw: number) {
    this.pos.set(x, groundAt(x, z).y, z);
    this.yaw = yaw;
    this.path = [];
    this.place();
  }
}

export interface SquadEvents {
  onStrike?: (m: Mate, s: Soldier) => void;
  onShot?: (from: THREE.Vector3, to: THREE.Vector3) => void;
  onBark?: (id: MateId, ar: string, en: string) => void;
}

export class Squad {
  mates: Mate[] = [];
  order: "follow" | "hold" = "follow";
  strikeCd = 0;
  strikes = 0;
  kills = 0;
  private ev: SquadEvents;

  constructor(ev: SquadEvents) {
    this.ev = ev;
  }

  add(id: MateId, group: THREE.Group) {
    const m = new Mate(id, group, SLOTS[this.mates.length % SLOTS.length]);
    this.mates.push(m);
    return m;
  }
  get(id: MateId) {
    return this.mates.find((m) => m.id === id)!;
  }
  joined() {
    return this.mates.filter((m) => m.joined);
  }

  setOrder(o: "follow" | "hold") {
    this.order = o;
    for (const m of this.joined()) {
      if (m.state === "strike") continue;
      m.state = o;
      m.path = [];
      if (o === "hold") {
        m.holdAt.copy(m.pos);
        m.crouch = true;
      }
    }
  }

  /** gather the squad around the player (checkpoint restore, cutscene exit) */
  regroup(p: THREE.Vector3, yaw: number) {
    this.joined().forEach((m) => {
      const [sx, sz] = m.slot;
      const x = p.x + Math.cos(yaw) * sx + Math.sin(yaw) * sz, z = p.z - Math.sin(yaw) * sx + Math.cos(yaw) * sz;
      const free = !solidAt(x, z, groundAt(x, z).y, false);
      m.teleport(free ? x : p.x, free ? z : p.z, yaw);
      m.state = "follow";
      m.target = null;
    });
    this.order = "follow";
  }

  /** order the nearest free mate to silently take down a marked, unaware soldier */
  strike(s: Soldier) {
    if (this.strikeCd > 0) return null;
    const free = this.joined().filter((m) => m.state === "follow" || m.state === "hold");
    if (!free.length) return null;
    free.sort((a, b) => a.pos.distanceToSquared(s.pos) - b.pos.distanceToSquared(s.pos));
    const m = free[0];
    if (m.pos.distanceTo(s.pos) > 40) return null;
    m.state = "strike";
    m.target = s;
    m.path = [];
    m.repath = 0;
    this.strikeCd = 20;
    return m;
  }

  private moveAlong(m: Mate, dt: number, speed: number) {
    m.moving = false;
    if (!m.path.length) return true;
    const [tx, tz] = m.path[0];
    const dx = tx - m.pos.x, dz = tz - m.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.2) {
      m.path.shift();
      return !m.path.length;
    }
    const step = Math.min(d, speed * dt);
    m.pos.x += (dx / d) * step;
    m.pos.z += (dz / d) * step;
    m.pos.y = groundAt(m.pos.x, m.pos.z, m.pos.y).y;
    m.yaw += wrap(FACE(dx, dz) - m.yaw) * Math.min(1, dt * 7);
    m.walk += dt * speed * 3.4;
    m.moving = true;
    return false;
  }

  private go(m: Mate, x: number, z: number, dt: number, speed: number) {
    m.repath -= dt;
    const end = m.path[m.path.length - 1];
    if (m.repath <= 0 && (!end || Math.hypot(end[0] - x, end[1] - z) > 1.2)) {
      m.repath = 0.6 + Math.random() * 0.3;
      const direct = lineClear(m.pos.x, m.pos.y + 0.5, m.pos.z, x, groundAt(x, z).y + 0.5, z, false) && Math.hypot(x - m.pos.x, z - m.pos.z) < 6;
      m.path = direct ? [[x, z]] : findPath(m.pos.x, m.pos.z, x, z) ?? [[x, z]];
    }
    return this.moveAlong(m, dt, speed);
  }

  update(dt: number, player: { pos: THREE.Vector3; yaw: number; crouch: boolean; speed: number }, garrison: Garrison) {
    this.strikeCd = Math.max(0, this.strikeCd - dt);
    const combat = garrison.alarm >= 2;
    for (const m of this.mates) {
      if (!m.joined) {
        m.place();
        continue;
      }
      // posture: copy the player, crawl spaces force a crouch
      const mustCrouch = solidAt(m.pos.x, m.pos.z, m.pos.y, false, 0.25) && !solidAt(m.pos.x, m.pos.z, m.pos.y, true, 0.25);
      if (m.state === "follow") m.crouch = player.crouch || mustCrouch;
      else if (m.state === "strike") m.crouch = true;
      else if (m.state === "hold") m.crouch = true;
      if (mustCrouch) m.crouch = true;

      if (m.state === "strike") this.updateStrike(m, dt, garrison);
      else if (m.state === "hold") {
        if (m.pos.distanceTo(m.holdAt) > 0.6) this.go(m, m.holdAt.x, m.holdAt.z, dt, 2.2);
        else m.moving = false;
      } else {
        // follow: slot behind the player, rotated by the player's heading
        const [sx, sz] = m.slot;
        const yaw = player.yaw;
        const gx = player.pos.x + Math.cos(yaw) * sx + Math.sin(yaw) * sz, gz = player.pos.z - Math.sin(yaw) * sx + Math.cos(yaw) * sz;
        const d = Math.hypot(gx - m.pos.x, gz - m.pos.z);
        if (d > 55) m.teleport(player.pos.x + Math.sin(yaw) * 2, player.pos.z + Math.cos(yaw) * 2, yaw);
        else if (d > 1.0) {
          const sp = THREE.MathUtils.clamp(player.speed + (d - 1.5) * 0.9, m.crouch ? 1.2 : 1.8, m.crouch ? 2.4 : 5.6);
          this.go(m, gx, gz, dt, sp);
        } else {
          m.moving = false;
          m.path = [];
          m.yaw += wrap(yaw + Math.PI - m.yaw) * Math.min(1, dt * 2); // player yaw faces −z; mates look the same way
        }
      }
      if (combat && m.state !== "strike") this.fight(m, dt, garrison);
      m.place();
    }
    garrison.mates = this.joined().map((m) => m.chest);
  }

  private updateStrike(m: Mate, dt: number, garrison: Garrison) {
    const s = m.target;
    if (!s || !s.alive || s.state === "alert" || s.state === "hunt" || garrison.alarm >= 2) {
      if (s && s.alive && m.state === "strike") this.ev.onBark?.(m.id, "أُلغيت — لقد انتبه!", "Aborted — he's alert!");
      m.state = this.order;
      m.holdAt.copy(m.pos);
      m.target = null;
      return;
    }
    // approach from behind
    const bx = s.pos.x - Math.sin(s.yaw) * 0.9, bz = s.pos.z - Math.cos(s.yaw) * 0.9;
    const d = Math.hypot(s.pos.x - m.pos.x, s.pos.z - m.pos.z);
    if (d < 1.25) {
      garrison.damage(s, 999, false);
      this.strikes++;
      this.ev.onStrike?.(m, s);
      m.state = this.order;
      m.holdAt.copy(m.pos);
      m.target = null;
      return;
    }
    this.go(m, bx, bz, dt, d > 6 ? 3.4 : 1.6);
  }

  private fight(m: Mate, dt: number, garrison: Garrison) {
    m.fireCd -= dt;
    if (m.fireCd > 0) return;
    m.fireCd = 1.6 + Math.random() * 1.6;
    const eye = m.chest.clone().setY(m.pos.y + 1.45);
    let best: Soldier | null = null, bd = 34;
    for (const s of garrison.soldiers) {
      if (!s.alive || s.state === "inactive") continue;
      const d = s.pos.distanceTo(m.pos);
      if (d < bd && lineClear(eye.x, eye.y, eye.z, s.pos.x, s.pos.y + 1.3, s.pos.z)) {
        best = s;
        bd = d;
      }
    }
    if (!best) return;
    m.yaw = FACE(best.pos.x - m.pos.x, best.pos.z - m.pos.z);
    const hit = Math.random() < 0.3 - bd / 200;
    const to = best.pos.clone().setY(best.pos.y + 1.2);
    if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
    this.ev.onShot?.(eye, to);
    if (hit && garrison.damage(best, 999, true)) this.kills++;
  }

  snapshot() {
    return { order: this.order, joined: this.mates.map((m) => m.joined), strikes: this.strikes, kills: this.kills };
  }
  restore(s: ReturnType<Squad["snapshot"]>) {
    this.mates.forEach((m, i) => (m.joined = s.joined[i]));
    this.strikes = s.strikes;
    this.kills = s.kills;
    this.strikeCd = 0;
  }
}
