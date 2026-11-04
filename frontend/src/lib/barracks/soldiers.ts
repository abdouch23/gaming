// The garrison: gendarmes in the village and soldiers in the barracks.
// Calm → suspicious → investigate → alert (shout, 2.6 s to raise the siren) → hunt/search, plus bodies,
// diversions, sleepers pouring out of the barracks and a reinforcement truck. Pure logic + figures;
// the level renders searchlights, tracers and HUD from the state exposed here.
import * as THREE from "three";
import { makeGendarme } from "@/lib/night/figures";
import {
  findPath, groundAt, lineClear, COMPOUND_Y, DV, TOWER_H, TOWERS, INFORMER, CHECKPOINT, DIVERSION_FIRE, BUILDINGS, insideCompound,
  type V2,
} from "@/lib/barracks/map";

export type Role = "informer" | "gendarme" | "post" | "patrol" | "tower" | "officer" | "sleeper" | "reinforce";
export type AIState = "calm" | "investigate" | "alert" | "hunt" | "search" | "divert" | "down" | "inactive";
export type Zone = "village" | "compound";

export interface Stimulus {
  player: THREE.Vector3; // chest
  feet: THREE.Vector3;
  visibility: number; // 0..1.4
  concealed: boolean; // crouched in deep shadow (invisible beyond 3 m)
  noise: number; // hearing radius (m)
  armed: boolean;
  crouch: boolean;
  moving: boolean;
  vis: "hidden" | "shadow" | "lit";
}

interface Def {
  id: string; role: Role; zone: Zone; x: number; z: number; yaw: number;
  route?: V2[]; pauses?: Record<number, number>; pingPong?: boolean; sweep?: number; follow?: string; lantern?: boolean;
  tower?: number; divert?: boolean; speed?: number; delay?: number;
}

const FACE = (dx: number, dz: number) => Math.atan2(dx, dz); // forward = (sin yaw, cos yaw)

// A* is the only expensive AI call: cap it per frame so a siren (20 soldiers repathing) never spikes a frame
let pathBudget = 0;
function budgetedPath(fx: number, fz: number, tx: number, tz: number): V2[] | null | undefined {
  if (pathBudget <= 0) return undefined;
  pathBudget--;
  return findPath(fx, fz, tx, tz);
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const DEFS: Def[] = [
  // ---- village (Chapter beat 1: escape the surveillance) ----
  { id: "informer", role: "informer", zone: "village", x: INFORMER.x, z: INFORMER.z, yaw: FACE(1, 0.35), sweep: 1.05 },
  { id: "gp1", role: "gendarme", zone: "village", x: 36 + DV.x, z: 62 + DV.z, yaw: 0, lantern: true, speed: 1.05,
    route: ([[36, 62], [8, 59.6], [-20, 58.6], [-21, 75], [4, 78.2], [16, 77.8], [33, 83], [37, 72]] as V2[]).map(([x, z]) => [x + DV.x, z + DV.z] as V2), pauses: { 2: 6, 6: 8 } },
  { id: "gp2", role: "gendarme", zone: "village", x: 37 + DV.x, z: 63 + DV.z, yaw: 0, follow: "gp1" },
  { id: "gpost", role: "gendarme", zone: "village", x: -17.5 + DV.x, z: 70.5 + DV.z, yaw: FACE(1, 0.2), sweep: 1.25, lantern: true },
  // a two-man gendarme patrol walks the track between the dachra and the town
  { id: "tp1", role: "gendarme", zone: "village", x: -120, z: 515, yaw: 0, lantern: true, speed: 0.95,
    route: [[-128, 528], [-70, 482], [-10, 430], [60, 380], [-10, 430], [-70, 482]], pauses: { 0: 10, 3: 12 } },
  { id: "tp2", role: "gendarme", zone: "village", x: -121, z: 516, yaw: 0, follow: "tp1" },
  { id: "chk1", role: "gendarme", zone: "village", x: CHECKPOINT.x - 1.6, z: CHECKPOINT.z, yaw: 0, sweep: 0.6 },
  { id: "chk2", role: "gendarme", zone: "village", x: CHECKPOINT.x + 1.6, z: CHECKPOINT.z - 0.6, yaw: Math.PI, sweep: 0.6 },
  // ---- compound ----
  { id: "gate1", role: "post", zone: "compound", x: -3.2, z: -23.3, yaw: 0, sweep: 0.7, divert: true },
  { id: "gate2", role: "post", zone: "compound", x: 3.2, z: -23.3, yaw: 0, sweep: 0.7, divert: true },
  { id: "officer", role: "officer", zone: "compound", x: 14, z: -34.3, yaw: Math.PI, sweep: 0.5 },
  { id: "yard1", role: "patrol", zone: "compound", x: -10, z: -38, yaw: 0, speed: 1.1, divert: true,
    route: [[-10, -38], [10, -38], [12, -55], [10, -71.5], [-10, -71.5], [-12, -55]], pauses: { 3: 6, 5: 5 } },
  { id: "yard2", role: "patrol", zone: "compound", x: -11, z: -37, yaw: 0, follow: "yard1", divert: true },
  { id: "perim", role: "patrol", zone: "compound", x: -31, z: -30, yaw: Math.PI, speed: 0.95, lantern: true,
    route: [[-31.2, -30], [-31.2, -60], [-31.2, -84.5], [-8, -85], [14, -85.2], [30, -85]], pauses: { 2: 5, 5: 7 }, pingPong: true },
  { id: "armory", role: "post", zone: "compound", x: 24, z: -74.6, yaw: 0, sweep: 0.9 },
  { id: "motor", role: "post", zone: "compound", x: 31.6, z: -56, yaw: FACE(-1, 0), sweep: 1.2 },
  { id: "hqdoor", role: "post", zone: "compound", x: -1.9, z: -74.3, yaw: 0, sweep: 0.8 },
  // the duty clerk walks the HQ corridor at night
  { id: "planton", role: "patrol", zone: "compound", x: 0, z: -77.6, yaw: 0, speed: 0.9,
    route: [[0, -77.6], [-6.5, -79], [-0.5, -80.8], [6.5, -77.2], [0.5, -77.6]], pauses: { 1: 7, 3: 6 } },
  { id: "tower1", role: "tower", zone: "compound", x: TOWERS[1][0], z: TOWERS[1][1], yaw: FACE(-1, -0.4), tower: 1 },
  { id: "tower2", role: "tower", zone: "compound", x: TOWERS[2][0], z: TOWERS[2][1], yaw: FACE(-1, 0.3), tower: 2 },
  // ---- sleepers (wake on the siren) and the reinforcement truck ----
  ...BUILDINGS.filter((b) => b.kind === "barracks").map((b, i): Def => ({
    id: `sleep${i + 1}`, role: "sleeper", zone: "compound", x: b.x + (b.door === "e" ? b.w / 2 + 1 : -b.w / 2 - 1), z: b.z, yaw: 0, delay: 3 + i * 1.6,
  })),
  ...[0, 1, 2, 3].map((i): Def => ({ id: `rf${i + 1}`, role: "reinforce", zone: "compound", x: -2 + i * 1.4, z: -6 - i * 0.8, yaw: Math.PI, delay: i * 0.6 })),
];

export class Soldier {
  readonly def: Def;
  readonly group: THREE.Group;
  pos = new THREE.Vector3();
  yaw = 0;
  baseYaw = 0;
  state: AIState = "calm";
  suspicion = 0;
  hp = 100;
  tagged = false;
  tagProgress = 0;
  lookAt: THREE.Vector3 | null = null;
  path: V2[] = [];
  routeIdx = 0;
  routeDir = 1;
  pause = 0;
  timer = 0;
  shout = -1;
  fireCd = 1;
  aim = 0;
  repath = 0;
  goal: V2 | null = null;
  seesPlayer = false;
  heard = 0;
  phase = Math.random() * 10;
  walkPhase = 0;
  lastWalk = 0;
  lantern: THREE.PointLight | null = null;
  dozing = false;
  keyTaken = false;
  bodySeen = false;
  sinceSeen = 99;
  token = false;
  mateScan = 0;
  mateTarget: THREE.Vector3 | null = null;

  constructor(def: Def, scene: THREE.Scene) {
    this.def = def;
    const fig = makeGendarme(def.id === "gpost" || def.id === "gate2");
    this.group = fig.group;
    if (def.zone === "compound") {
      // army khaki instead of gendarmerie green; reinforcements wear helmets (kepi kept for silhouette)
      this.group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && m.color && m.color.getHex() === 0x1f2a24) {
          const c = m.clone();
          c.color.set(def.role === "reinforce" ? 0x2e3322 : 0x3a3626);
          (o as THREE.Mesh).material = c;
        }
      });
    }
    if (def.role === "informer") {
      // civilian: no kepi/rifle, sitting hunched in a burnous
      this.group.children.slice(-3).forEach((c) => (c.visible = false));
      this.group.scale.set(1, 0.92, 1);
    }
    if (def.lantern) {
      // the light lives in the scene, not the figure: hiding a parent would change the light count and recompile every shader
      this.lantern = new THREE.PointLight(0xffa152, 7, 10, 2);
      scene.add(this.lantern);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.17, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa555, emissiveIntensity: 5 }));
      glass.position.set(0.28, 0.9, 0.18);
      this.group.add(glass);
    }
    scene.add(this.group);
    this.reset();
  }

  get alive() {
    return this.state !== "down" && this.state !== "inactive";
  }
  get role() {
    return this.def.role;
  }
  eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + (this.role === "informer" || this.role === "officer" ? 1.2 : 1.62), this.pos.z);
  }

  reset() {
    const d = this.def;
    this.pos.set(d.x, 0, d.z);
    this.pos.y = this.role === "tower" ? COMPOUND_Y + TOWER_H : groundAt(d.x, d.z).y;
    this.yaw = this.baseYaw = d.yaw;
    this.state = this.role === "sleeper" || this.role === "reinforce" ? "inactive" : "calm";
    this.suspicion = 0;
    this.hp = 100;
    this.path = [];
    this.routeIdx = 0;
    this.routeDir = 1;
    this.pause = d.route ? 4 : 0;
    this.shout = -1;
    this.lookAt = null;
    this.goal = null;
    this.timer = d.delay ?? 0;
    this.dozing = this.role === "officer";
    this.bodySeen = false;
    this.group.visible = this.state !== "inactive";
    this.group.rotation.set(0, this.yaw, 0);
    this.place();
  }

  place() {
    this.group.position.copy(this.pos);
    if (this.lantern) {
      this.lantern.position.set(this.pos.x + Math.cos(this.yaw) * 0.28 + Math.sin(this.yaw) * 0.18, this.pos.y + 0.9, this.pos.z - Math.sin(this.yaw) * 0.28 + Math.cos(this.yaw) * 0.18);
      if (!this.group.visible || this.state === "down") this.lantern.intensity = 0;
    }
    if (this.state === "down") {
      this.group.rotation.set(-Math.PI / 2, this.yaw, 0, "YXZ");
      this.group.position.y += 0.18;
    } else {
      const sit = this.role === "informer" || (this.role === "officer" && this.dozing);
      this.group.rotation.set(sit ? 0.12 : 0, this.yaw, 0, "YXZ");
      if (sit) this.group.position.y -= 0.42;
    }
  }
}

export interface ShotEvent { from: THREE.Vector3; to: THREE.Vector3; hit: boolean; dmg: number; shooter: Soldier | null; atMate?: boolean }
export interface GarrisonEvents {
  onCaught?: (by: Soldier) => void;
  onAlarm?: (level: number, reason: string) => void;
  onShout?: (s: Soldier) => void;
  onShot?: (e: ShotEvent) => void;
  onBody?: (s: Soldier) => void;
}

export interface Beam { tower: number; origin: THREE.Vector3; target: THREE.Vector3; on: boolean; owner: Soldier }

export class Garrison {
  soldiers: Soldier[];
  alarm = 0; // 0 calm · 1 searching (body/noise) · 2 siren
  lastKnown = new THREE.Vector3();
  lastKnownAge = 999;
  beams: Beam[] = [];
  diversion = 0; // seconds remaining
  reinforceIn = -1;
  phoneCut = false;
  zoneActive: Record<Zone, boolean> = { village: true, compound: true };
  coverAt: { x: number; z: number; r: number }[] = []; // ally covering fire suppresses accuracy here
  /** squad positions (chest height); hunters who lose the player fire at them instead (they always duck in time) */
  mates: THREE.Vector3[] = [];
  private ev: GarrisonEvents;
  private byId = new Map<string, Soldier>();
  private sweepT = 0;

  constructor(scene: THREE.Scene, ev: GarrisonEvents) {
    this.ev = ev;
    this.soldiers = DEFS.map((d) => new Soldier(d, scene));
    for (const s of this.soldiers) this.byId.set(s.def.id, s);
    // patrol routes are nav-pathed once so they never clip a building
    for (const s of this.soldiers) {
      const r = s.def.route;
      if (!r) continue;
      const full: V2[] = [];
      const pauses: Record<number, number> = {};
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        full.push(a);
        if (s.def.pauses?.[i]) pauses[full.length - 1] = s.def.pauses[i];
        if (s.def.pingPong && i === r.length - 1) break;
        const p = findPath(a[0], a[1], b[0], b[1]);
        if (p) full.push(...p.slice(0, -1));
      }
      s.def.route = full;
      s.def.pauses = pauses;
    }
    for (const s of this.soldiers) {
      if (s.role !== "tower") continue;
      const [tx, tz] = TOWERS[s.def.tower!];
      this.beams.push({ tower: s.def.tower!, origin: new THREE.Vector3(tx, COMPOUND_Y + TOWER_H + 1.5, tz), target: new THREE.Vector3(), on: true, owner: s });
    }
  }

  get(id: string) {
    return this.byId.get(id)!;
  }

  maxSuspicion(zone?: Zone) {
    let m = 0;
    for (const s of this.soldiers) if (s.alive && (!zone || s.def.zone === zone) && this.zoneActive[s.def.zone]) m = Math.max(m, s.state === "alert" || s.state === "hunt" ? 1 : s.suspicion);
    return m;
  }
  shoutProgress() {
    let p = 0;
    for (const s of this.soldiers) if (s.alive && s.shout >= 0) p = Math.max(p, 1 - s.shout / 2.6);
    return p;
  }

  raise(level: number, reason: string, at?: THREE.Vector3) {
    if (at) {
      this.lastKnown.copy(at);
      this.lastKnownAge = 0;
    }
    if (level <= this.alarm) return;
    this.alarm = level;
    if (level >= 2) {
      for (const s of this.soldiers) {
        if (s.def.zone !== "compound") continue;
        if (s.state === "inactive" && s.role === "sleeper") s.timer = s.def.delay ?? 3;
        else if (s.alive && s.role !== "tower") this.toHunt(s);
        s.dozing = false;
      }
      if (!this.phoneCut && this.reinforceIn < 0) this.reinforceIn = 42;
    } else {
      for (const s of this.soldiers) if (s.def.zone === "compound" && s.alive && s.state === "calm") s.dozing = false;
    }
    this.ev.onAlarm?.(level, reason);
  }

  private toHunt(s: Soldier) {
    s.state = "hunt";
    s.goal = null;
    s.repath = 0;
    s.shout = -1;
  }

  startDiversion(seconds: number) {
    this.diversion = seconds;
    for (const s of this.soldiers) {
      if (!s.def.divert || !s.alive || s.state !== "calm") continue;
      s.state = "divert";
      s.goal = [DIVERSION_FIRE.x + (Math.random() - 0.5) * 5, DIVERSION_FIRE.z - 2 - Math.random() * 3];
      s.path = [];
      s.repath = 0;
    }
  }

  /** player shot / takedown damage */
  damage(s: Soldier, dmg: number, loud: boolean) {
    if (!s.alive) return false;
    s.hp -= dmg;
    if (s.hp <= 0) {
      s.state = "down";
      s.shout = -1;
      s.suspicion = 0;
      if (s.lantern) s.lantern.intensity = 0;
      s.place();
      return true;
    }
    if (loud) {
      s.state = "alert";
      s.suspicion = 1;
    }
    return false;
  }

  /** a gunshot or explosion heard by everyone within radius */
  loudNoise(at: THREE.Vector3, radius: number, byPlayer: boolean) {
    let heard = false;
    for (const s of this.soldiers) {
      if (!s.alive || !this.zoneActive[s.def.zone]) continue;
      if (s.pos.distanceTo(at) > radius) continue;
      heard = true;
      s.dozing = false;
      if (s.state === "calm" || s.state === "divert" || s.state === "search" || s.state === "investigate") {
        s.state = "hunt";
        s.goal = null;
      }
    }
    if (heard && byPlayer) this.raise(insideCompound(at.x, at.z, 30) ? 2 : 1, "gunshot", at);
  }

  /** silent takedown from behind */
  takedownTarget(p: THREE.Vector3, crouchOrSlow: boolean) {
    let best: Soldier | null = null, bd = 1.9;
    for (const s of this.soldiers) {
      if (!s.alive || s.role === "tower" || !this.zoneActive[s.def.zone]) continue;
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (d > bd || Math.abs(s.pos.y - p.y) > 1) continue;
      const toPlayer = FACE(p.x - s.pos.x, p.z - s.pos.z);
      const behind = Math.abs(wrap(toPlayer - s.yaw)) > 1.75;
      const unaware = s.state !== "alert" && s.state !== "hunt" && s.suspicion < 0.6;
      if ((behind || (s.dozing && crouchOrSlow)) && unaware) {
        best = s;
        bd = d;
      }
    }
    return best;
  }

  /** ray hit test against soldier capsules; returns hit soldier + headshot flag */
  rayHit(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    let best: { s: Soldier; t: number; head: boolean } | null = null;
    for (const s of this.soldiers) {
      if (!s.alive) continue;
      const c = s.pos;
      const ox = origin.x - c.x, oz = origin.z - c.z;
      const a = dir.x * dir.x + dir.z * dir.z, b = 2 * (ox * dir.x + oz * dir.z), cc = ox * ox + oz * oz - 0.34 * 0.34;
      const disc = b * b - 4 * a * cc;
      if (disc < 0 || a < 1e-6) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > maxDist || (best && t > best.t)) continue;
      const y = origin.y + dir.y * t - c.y;
      const tall = s.role === "informer" || (s.role === "officer" && s.dozing) ? 1.35 : 1.85;
      if (y < 0 || y > tall) continue;
      best = { s, t, head: y > tall - 0.3 };
    }
    return best;
  }

  private beamUpdate(b: Beam, dt: number, st: Stimulus) {
    const s = b.owner;
    b.on = s.alive && this.zoneActive.compound;
    if (!b.on) return;
    const [tx, tz] = TOWERS[b.tower];
    const hunting = this.alarm >= 2 || s.state === "alert";
    let gx: number, gz: number;
    if (hunting && this.lastKnownAge < 12) {
      gx = this.lastKnown.x;
      gz = this.lastKnown.z;
    } else {
      // slow figure-eight sweep over the approach fields, faster when searching
      const k = this.sweepT * (this.alarm >= 1 ? 0.2 : 0.13) + b.tower * 2.1;
      const out = b.tower === 1 ? [-1, -1] : [-1, 1];
      const ang = Math.atan2(out[1], out[0]) + Math.sin(k) * 1.15;
      const r = 20 + 12 * Math.sin(k * 2.3 + 1);
      gx = tx + Math.cos(ang) * r;
      gz = tz + Math.sin(ang) * r;
    }
    const lerp = 1 - Math.exp(-dt * (hunting ? 2.2 : 0.8));
    b.target.x += (gx - b.target.x) * lerp;
    b.target.z += (gz - b.target.z) * lerp;
    b.target.y = groundAt(b.target.x, b.target.z).y;
    s.yaw = FACE(b.target.x - s.pos.x, b.target.z - s.pos.z);
    // a player caught in the pool of light is seen at once
    const d = Math.hypot(st.feet.x - b.target.x, st.feet.z - b.target.z);
    if (d < 3.8 && lineClear(b.origin.x, b.origin.y, b.origin.z, st.player.x, st.player.y, st.player.z)) {
      s.suspicion += dt * 2.6 * Math.max(0.5, st.visibility);
      s.lookAt = st.player.clone();
    }
  }

  inBeam(p: THREE.Vector3) {
    return this.beams.some((b) => b.on && Math.hypot(p.x - b.target.x, p.z - b.target.z) < 3.8);
  }

  update(dt: number, st: Stimulus, bodiesVisible = true) {
    this.sweepT += dt;
    pathBudget = 4;
    // attack tokens: only the nearest few soldiers who can see the player may shoot at once
    const shooters = this.soldiers.filter((s) => s.alive && s.seesPlayer && (s.state === "alert" || s.state === "hunt" || s.role === "tower"));
    shooters.sort((a, b) => a.pos.distanceToSquared(st.feet) - b.pos.distanceToSquared(st.feet));
    const tokens = st.vis === "hidden" ? 2 : 3;
    for (const s of this.soldiers) s.token = false;
    shooters.slice(0, tokens).forEach((s) => (s.token = true));
    this.lastKnownAge += dt;
    if (this.diversion > 0) {
      this.diversion -= dt;
      if (this.diversion <= 0) for (const s of this.soldiers) if (s.state === "divert") s.state = "calm";
    }
    if (this.reinforceIn > 0) {
      this.reinforceIn -= dt;
      if (this.reinforceIn <= 0) {
        for (const s of this.soldiers) if (s.role === "reinforce" && s.state === "inactive") {
          s.state = "hunt";
          s.group.visible = true;
        }
        this.ev.onAlarm?.(3, "reinforcements");
      }
    }
    for (const b of this.beams) this.beamUpdate(b, dt, st);

    for (const s of this.soldiers) {
      if (!this.zoneActive[s.def.zone]) {
        s.group.visible = false;
        if (s.lantern) s.lantern.intensity = 0;
        continue;
      }
      if (s.state === "down") continue;
      if (s.state === "inactive") {
        if (this.alarm >= 2 && s.role === "sleeper") {
          s.timer -= dt;
          if (s.timer <= 0) {
            s.group.visible = true;
            this.toHunt(s);
          }
        }
        continue;
      }
      s.group.visible = true;
      this.sense(s, st, dt, bodiesVisible);
      this.act(s, st, dt);
      s.place();
      // walk bob
      const legs = s.group.children;
      const walking = s.walkPhase !== s.lastWalk;
      s.lastWalk = s.walkPhase;
      const sw = walking && (s.state as AIState) !== "down" ? Math.sin(s.walkPhase) * 0.35 : 0;
      if (legs[0] && legs[1]) {
        legs[0].rotation.x = sw;
        legs[1].rotation.x = -sw;
      }
      if (s.lantern) s.lantern.intensity = 7 * (0.92 + 0.08 * Math.sin(s.phase + this.sweepT * 13) * Math.sin(this.sweepT * 3.1));
    }
  }

  private visionRange(s: Soldier) {
    const base = s.role === "tower" ? 24 : s.role === "informer" ? 16 : 17;
    return base * (this.alarm >= 1 ? 1.2 : 1) * (s.dozing ? 0.5 : 1);
  }

  private sense(s: Soldier, st: Stimulus, dt: number, bodiesVisible: boolean) {
    const eye = s.eye();
    const dx = st.player.x - eye.x, dz = st.player.z - eye.z;
    const dist = Math.hypot(dx, dz);
    const combat = s.state === "alert" || s.state === "hunt";
    const range = this.visionRange(s) * (combat ? 2.2 : 1);
    const half = combat ? 1.2 : s.role === "tower" ? 0.65 : 0.85;
    let gain = 0;
    s.seesPlayer = false;
    if (dist < range) {
      const d = Math.abs(wrap(FACE(dx, dz) - s.yaw));
      const close = dist < (combat ? 9 : 2.2);
      const concealed = st.concealed && dist > 3 && !combat;
      if ((d < half || close) && !concealed && lineClear(eye.x, eye.y, eye.z, st.player.x, st.player.y, st.player.z)) {
        const v = combat ? Math.max(0.6, st.visibility) : st.visibility;
        if (v > 0.12) {
          s.seesPlayer = true;
          gain += v * (1.5 - dist / range) * (s.dozing ? 0.35 : 1) * (this.alarm >= 1 ? 1.3 : 1);
          s.lookAt = st.player.clone();
        }
      }
    }
    if (st.noise > 0 && dist < st.noise) {
      gain += 0.35;
      s.heard = 1.5;
      s.lookAt = st.feet.clone();
      if (s.dozing && st.noise > 5) s.dozing = false;
    }
    if (dist < 1.3) gain += 2.5;
    s.heard -= dt;
    if (s.seesPlayer) s.sinceSeen = 0;
    else s.sinceSeen += dt;

    // bodies
    if (bodiesVisible && !combat && s.state !== "investigate" && s.role !== "informer") {
      for (const o of this.soldiers) {
        if (o.state !== "down" || o.bodySeen) continue;
        const bx = o.pos.x - eye.x, bz = o.pos.z - eye.z, bd = Math.hypot(bx, bz);
        if (bd > 15 || Math.abs(wrap(FACE(bx, bz) - s.yaw)) > 0.9) continue;
        if (!lineClear(eye.x, eye.y, eye.z, o.pos.x, o.pos.y + 0.3, o.pos.z)) continue;
        o.bodySeen = true;
        s.state = "investigate";
        s.goal = [o.pos.x, o.pos.z];
        s.repath = 0;
        s.timer = 1.6;
        s.dozing = false;
        this.ev.onBody?.(s);
        break;
      }
    }

    if (combat) {
      if (s.seesPlayer) {
        this.lastKnown.copy(st.feet);
        this.lastKnownAge = 0;
      }
      return;
    }
    s.suspicion = gain > 0 ? s.suspicion + gain * dt : Math.max(0, s.suspicion - 0.16 * dt);
    if (s.suspicion < 0.3 && s.heard <= 0) s.lookAt = null;
    if (s.suspicion >= 1) {
      s.suspicion = 1;
      if (!st.armed) {
        this.ev.onCaught?.(s);
        return;
      }
      s.state = "alert";
      s.dozing = false;
      this.lastKnown.copy(st.feet);
      this.lastKnownAge = 0;
      if (this.alarm < 2 && s.def.zone === "compound") {
        s.shout = 2.6;
        this.ev.onShout?.(s);
      } else if (this.alarm < 2) this.raise(1, "spotted", st.feet);
    } else if (s.suspicion > 0.55 && s.state === "calm" && s.lookAt && s.role !== "tower" && s.role !== "informer") {
      // walk over to see what that was
      s.state = "investigate";
      s.goal = [s.lookAt.x, s.lookAt.z];
      s.repath = 0;
      s.timer = 4;
    }
  }

  private moveAlong(s: Soldier, dt: number, speed: number) {
    if (!s.path.length) return true;
    const [tx, tz] = s.path[0];
    const dx = tx - s.pos.x, dz = tz - s.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.25) {
      s.path.shift();
      return !s.path.length;
    }
    const step = Math.min(d, speed * dt);
    s.pos.x += (dx / d) * step;
    s.pos.z += (dz / d) * step;
    s.pos.y = groundAt(s.pos.x, s.pos.z, s.pos.y).y;
    this.turn(s, FACE(dx, dz), dt, 5);
    s.walkPhase += dt * speed * 3.2;
    return false;
  }

  private turn(s: Soldier, target: number, dt: number, rate: number) {
    s.yaw += wrap(target - s.yaw) * Math.min(1, dt * rate);
  }

  private goTo(s: Soldier, gx: number, gz: number, dt: number, speed: number) {
    s.repath -= dt;
    if (!s.goal || Math.hypot(s.goal[0] - gx, s.goal[1] - gz) > 3 || s.repath <= 0 || !s.path.length) {
      if (s.repath <= 0 || !s.goal || Math.hypot(s.goal[0] - gx, s.goal[1] - gz) > 3) {
        s.goal = [gx, gz];
        const p = budgetedPath(s.pos.x, s.pos.z, gx, gz);
        if (p === undefined) {
          s.repath = 0.05;
          s.goal = null;
          return this.moveAlong(s, dt, speed);
        }
        s.path = p ?? [[gx, gz]];
        s.repath = 1.6 + Math.random() * 0.8;
      }
    }
    return this.moveAlong(s, dt, speed);
  }

  private act(s: Soldier, st: Stimulus, dt: number) {
    if (s.shout >= 0) {
      s.shout -= dt;
      if (s.shout < 0) this.raise(2, "shout", this.lastKnown);
    }
    if (s.role === "tower") {
      if (s.state === "alert" || this.alarm >= 2) this.shoot(s, st, dt, 0.7);
      else if (s.suspicion >= 1) s.state = "alert";
      return;
    }
    const st8 = s.state;
    if (st8 === "alert" || st8 === "hunt") {
      if (s.seesPlayer) {
        this.turn(s, FACE(st.player.x - s.pos.x, st.player.z - s.pos.z), dt, 6);
        this.shoot(s, st, dt, 1);
        // keep a fighting distance
        const d = s.pos.distanceTo(st.feet);
        if (d > 22) this.goTo(s, st.feet.x, st.feet.z, dt, 3.2);
      } else if (this.fireAtMates(s, dt)) {
        // pinned by the squad: holds position and trades fire
      } else if (this.lastKnownAge < 40) {
        s.aim = 0;
        const off = (s.phase % 1) * 6 - 3;
        const arrived = this.goTo(s, this.lastKnown.x + off, this.lastKnown.z - off * 0.5, dt, 3.4);
        if (arrived) {
          s.state = "search";
          s.timer = 14;
        }
      } else if (s.state === "alert" && this.alarm < 2) {
        s.state = "search";
        s.timer = 10;
      } else {
        // siren still up: sweep the compound in small loops
        s.state = "search";
        s.timer = 12;
      }
      return;
    }
    if (st8 === "search") {
      s.timer -= dt;
      s.repath -= dt;
      if (s.repath <= 0 && (!s.path.length || s.timer % 4 < dt)) {
        s.repath = 1.5;
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 8;
        const cx = this.lastKnownAge < 60 ? this.lastKnown.x : s.def.x, cz = this.lastKnownAge < 60 ? this.lastKnown.z : s.def.z;
        s.path = budgetedPath(s.pos.x, s.pos.z, cx + Math.cos(a) * r, cz + Math.sin(a) * r) ?? [];
      }
      this.moveAlong(s, dt, 1.8);
      if (s.timer <= 0) {
        s.state = this.alarm >= 2 ? "hunt" : "calm";
        s.suspicion = this.alarm >= 1 ? 0.2 : 0;
        if (s.state === "calm") s.path = budgetedPath(s.pos.x, s.pos.z, s.def.x, s.def.z) ?? [];
      }
      return;
    }
    if (st8 === "investigate") {
      if (s.goal && this.goTo(s, s.goal[0], s.goal[1], dt, 1.7)) {
        s.timer -= dt;
        s.yaw += dt * 1.2;
        if (s.timer <= 0) {
          if (s.bodySeen || this.soldiers.some((o) => o.state === "down" && o.pos.distanceTo(s.pos) < 3)) {
            this.raise(1, "body", s.pos);
            s.state = "search";
            s.timer = 25;
            s.bodySeen = true;
          } else {
            s.state = "calm";
            s.suspicion = Math.min(s.suspicion, 0.3);
            s.path = budgetedPath(s.pos.x, s.pos.z, s.def.x, s.def.z) ?? [];
          }
        }
      }
      return;
    }
    if (st8 === "divert") {
      if (s.goal) {
        if (this.goTo(s, s.goal[0], s.goal[1], dt, 2.6)) this.turn(s, FACE(DIVERSION_FIRE.x - s.pos.x, DIVERSION_FIRE.z - s.pos.z), dt, 2);
      }
      return;
    }
    // calm
    if (s.def.follow) {
      const lead = this.get(s.def.follow);
      if (!lead.alive || lead.state !== "calm") {
        if (lead.alive && lead.state === "investigate") {
          s.state = "investigate";
          s.goal = lead.goal;
          s.timer = 4;
        }
        return;
      }
      const back = new THREE.Vector3(-Math.sin(lead.yaw) * 1.4 + Math.cos(lead.yaw) * 0.6, 0, -Math.cos(lead.yaw) * 1.4 - Math.sin(lead.yaw) * 0.6);
      const tx = lead.pos.x + back.x, tz = lead.pos.z + back.z;
      const d = Math.hypot(tx - s.pos.x, tz - s.pos.z);
      if (d > 0.15) {
        const sp = Math.min(d * 2, 1.6);
        s.pos.x += ((tx - s.pos.x) / d) * sp * dt;
        s.pos.z += ((tz - s.pos.z) / d) * sp * dt;
        s.pos.y = groundAt(s.pos.x, s.pos.z, s.pos.y).y;
        s.walkPhase += dt * sp * 3.2;
      }
      this.turn(s, s.lookAt && s.suspicion > 0.25 ? FACE(s.lookAt.x - s.pos.x, s.lookAt.z - s.pos.z) : lead.yaw + 0.15, dt, 3);
      return;
    }
    if (s.lookAt && s.suspicion > 0.25) {
      this.turn(s, FACE(s.lookAt.x - s.pos.x, s.lookAt.z - s.pos.z), dt, 3);
      return;
    }
    const r = s.def.route;
    if (r) {
      if (s.path.length) {
        this.moveAlong(s, dt, (s.def.speed ?? 1) * (this.alarm >= 1 ? 1.3 : 1));
        return;
      }
      if (s.pause > 0) {
        s.pause -= dt;
        s.yaw += Math.sin(s.phase + s.pause * 0.6) * dt * 0.5;
        return;
      }
      const target = r[s.routeIdx];
      if (Math.hypot(target[0] - s.pos.x, target[1] - s.pos.z) < 0.3) {
        s.pause = s.def.pauses?.[s.routeIdx] ?? 0;
        if (s.def.pingPong) {
          if (s.routeIdx + s.routeDir >= r.length || s.routeIdx + s.routeDir < 0) s.routeDir *= -1;
          s.routeIdx += s.routeDir;
        } else s.routeIdx = (s.routeIdx + 1) % r.length;
        return;
      }
      s.path = [target];
      return;
    }
    // posts: return home, then sweep
    if (Math.hypot(s.def.x - s.pos.x, s.def.z - s.pos.z) > 0.5) {
      s.repath -= dt;
      if (!s.path.length && s.repath <= 0) {
        s.repath = 1.5;
        const p = budgetedPath(s.pos.x, s.pos.z, s.def.x, s.def.z);
        if (p !== undefined) s.path = p ?? [[s.def.x, s.def.z]];
        else s.repath = 0.05;
      }
      this.moveAlong(s, dt, 1.2);
      return;
    }
    const sweep = s.def.sweep ?? 0.6;
    const period = s.dozing ? 30 : 15;
    this.turn(s, s.baseYaw + Math.sin((this.sweepT + s.phase * 3) * ((Math.PI * 2) / period)) * sweep, dt, 2);
    if (s.role === "officer" && s.dozing) {
      // he wakes now and then and looks around
      const cyc = (this.sweepT + s.phase) % 24;
      s.dozing = !(cyc > 18 && cyc < 22);
      if (!s.dozing && cyc > 21.9) s.dozing = true;
    }
  }

  private fireAtMates(s: Soldier, dt: number) {
    if (!this.mates.length) return false;
    s.mateScan -= dt;
    if (s.mateScan <= 0) {
      s.mateScan = 0.5;
      const eye = s.eye();
      s.mateTarget = this.mates.find((m) => m.distanceTo(eye) < 30 && lineClear(eye.x, eye.y, eye.z, m.x, m.y, m.z)) ?? null;
    }
    const m = s.mateTarget;
    if (!m) return false;
    this.turn(s, FACE(m.x - s.pos.x, m.z - s.pos.z), dt, 5);
    s.fireCd -= dt;
    if (s.fireCd <= 0) {
      s.fireCd = 1.6 + Math.random() * 1.4;
      const from = s.eye().add(new THREE.Vector3(Math.sin(s.yaw) * 0.5, -0.12, Math.cos(s.yaw) * 0.5));
      const to = m.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6));
      this.ev.onShot?.({ from, to, hit: false, dmg: 0, shooter: s, atMate: true });
    }
    return true;
  }

  private shoot(s: Soldier, st: Stimulus, dt: number, accMul: number) {
    if (!s.seesPlayer) {
      s.aim = 0;
      return;
    }
    s.aim += dt;
    s.fireCd -= dt;
    if (s.aim < 1.1 || s.fireCd > 0 || !s.token) return;
    s.fireCd = 1.7 + Math.random() * 1.2;
    const eye = s.eye();
    const dist = eye.distanceTo(st.player);
    let p = 0.5 - dist / 65;
    if (st.crouch) p *= 0.7;
    if (st.moving) p *= 0.72;
    p *= st.vis === "hidden" ? 0.45 : st.vis === "shadow" ? 0.75 : 1;
    if (this.coverAt.some((c) => Math.hypot(st.feet.x - c.x, st.feet.z - c.z) < c.r)) p *= 0.55;
    p = THREE.MathUtils.clamp(p * accMul, 0.04, 0.62);
    const hit = Math.random() < p;
    const to = st.player.clone();
    if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.3) * 1.6, (Math.random() - 0.5) * 2.4));
    const from = eye.clone().add(new THREE.Vector3(Math.sin(s.yaw) * 0.5, -0.12, Math.cos(s.yaw) * 0.5));
    this.ev.onShot?.({ from, to, hit, dmg: hit ? 10 + Math.random() * 7 : 0, shooter: s });
    this.loudNoise(eye, 50, false);
  }

  snapshot() {
    return {
      alarm: this.alarm,
      phoneCut: this.phoneCut,
      soldiers: this.soldiers.map((s) => ({ id: s.def.id, down: s.state === "down", x: s.pos.x, z: s.pos.z, y: s.pos.y, yaw: s.yaw, tagged: s.tagged, keyTaken: s.keyTaken, bodySeen: s.bodySeen })),
    };
  }

  restore(snap: ReturnType<Garrison["snapshot"]>, alarm: number) {
    this.alarm = 0;
    this.reinforceIn = -1;
    this.diversion = 0;
    this.lastKnownAge = 999;
    this.phoneCut = snap.phoneCut;
    for (const r of snap.soldiers) {
      const s = this.get(r.id);
      s.reset();
      s.tagged = r.tagged;
      s.keyTaken = r.keyTaken;
      if (r.down) {
        s.pos.set(r.x, r.y, r.z);
        s.yaw = r.yaw;
        s.state = "down";
        s.bodySeen = r.bodySeen;
        s.group.visible = true;
        if (s.lantern) s.lantern.intensity = 0;
        s.place();
      }
    }
    if (alarm > 0) this.raise(alarm, "checkpoint");
  }
}
