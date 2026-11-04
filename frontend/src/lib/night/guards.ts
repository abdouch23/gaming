// Gendarmes: a two-man patrol (crossroads ⇄ culvert, hand lantern, pauses) and a post guard sweeping ±70°.
// Vision: 15 m, 90° cone + line of sight. Suspicion rises with visibility and gravel noise.
import * as THREE from "three";
import { makeGendarme } from "@/lib/night/figures";
import { groundAt, CROSSROADS, type V2 } from "@/lib/night/world";
import { makeGlowSprite } from "@/lib/lighting";

export const VIEW_RANGE = 15;
export const VIEW_HALF = Math.PI / 4;

const PATROL: V2[] = [[4, 12.4], [-8, 14.2], [-23.6, 17.7]];
const SPEED = 0.75;
const PAUSE_END = 35; // smoking at the culvert
const PAUSE_START = 25; // at the crossroads

export interface Stimulus {
  player: THREE.Vector3; // chest position
  visibility: number; // 0..1.3 (light × posture)
  concealed: boolean; // crouched in shadow — invisible beyond 3 m
  noise: number; // hearing radius in metres (0 = silent)
  los: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
}

export class Guard {
  group: THREE.Group;
  pos = new THREE.Vector3();
  yaw = 0;
  suspicion = 0;
  private cone: THREE.Mesh;
  private coneMat: THREE.MeshBasicMaterial;
  private heard = 0;
  lookAt: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene, cigarette = false) {
    const g = makeGendarme(cigarette);
    this.group = g.group;
    scene.add(this.group);
    this.coneMat = new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false });
    const geo = new THREE.CircleGeometry(VIEW_RANGE, 28, Math.PI / 2 - VIEW_HALF, VIEW_HALF * 2);
    geo.rotateX(-Math.PI / 2);
    this.cone = new THREE.Mesh(geo, this.coneMat);
    this.cone.renderOrder = 2;
    scene.add(this.cone);
  }

  eye() {
    return this.pos.clone().setY(this.pos.y + 1.62);
  }

  place() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.cone.position.copy(this.pos).setY(this.pos.y + 0.08);
    // circle sector opens around +X after rotateX; turn so it faces the guard's forward (sin yaw, cos yaw)
    this.cone.rotation.y = this.yaw + Math.PI;
    const s = Math.min(1, this.suspicion);
    this.coneMat.color.setRGB(1, 0.69 - s * 0.55, 0.44 - s * 0.38);
    this.coneMat.opacity = 0.045 + s * 0.09;
  }

  /** returns true when the guard catches the player */
  sense(st: Stimulus, dt: number) {
    const to = st.player.clone().sub(this.eye());
    const dist = Math.hypot(to.x, to.z);
    let gain = 0;
    if (dist < VIEW_RANGE) {
      const fwd = Math.atan2(to.x, to.z);
      const d = Math.abs(Math.atan2(Math.sin(fwd - this.yaw), Math.cos(fwd - this.yaw)));
      const concealed = st.concealed && dist > 3;
      if (d < VIEW_HALF && !concealed && st.los(this.eye(), st.player)) {
        gain += st.visibility * (1.45 - dist / VIEW_RANGE) * 0.9;
        this.lookAt = st.player.clone();
      }
    }
    if (st.noise > 0 && dist < st.noise) {
      gain += 0.32;
      this.heard = 1.5;
      this.lookAt = st.player.clone();
    }
    if (dist < 1.6) gain += 2; // bumping into a gendarme
    this.heard -= dt;
    this.suspicion = gain > 0 ? this.suspicion + gain * dt : Math.max(0, this.suspicion - 0.18 * dt);
    if (this.suspicion < 0.3 && this.heard <= 0) this.lookAt = null;
    return this.suspicion >= 1;
  }

  /** turn toward whatever caught the guard's attention */
  faceAttention(dt: number) {
    if (!this.lookAt || this.suspicion < 0.25) return false;
    const target = Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z);
    const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    this.yaw += diff * Math.min(1, dt * 3);
    return true;
  }

  reset() {
    this.suspicion = 0;
    this.lookAt = null;
    this.heard = 0;
  }
}

function pathPoint(s: number) {
  let rem = s;
  for (let i = 0; i < PATROL.length - 1; i++) {
    const [ax, az] = PATROL[i], [bx, bz] = PATROL[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (rem <= len || i === PATROL.length - 2) {
      const t = Math.min(1, rem / len);
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dir: Math.atan2(bx - ax, bz - az) };
    }
    rem -= len;
  }
  return { x: PATROL[0][0], z: PATROL[0][1], dir: 0 };
}
const PATH_LEN = PATROL.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - PATROL[i][0], p[1] - PATROL[i][1]), 0);

export class Gendarmerie {
  guards: Guard[] = [];
  private patrol: Guard[];
  private post: Guard;
  private s = 0;
  private dir = 1;
  private pause = 0;
  private postBase = -Math.PI / 2 - 0.25; // facing west down the path toward the culvert
  readonly handLantern: THREE.PointLight;
  private lanternGlow: THREE.Sprite;

  constructor(scene: THREE.Scene) {
    this.patrol = [new Guard(scene, true), new Guard(scene)];
    this.post = new Guard(scene);
    this.guards = [...this.patrol, this.post];
    this.post.pos.set(CROSSROADS.x + 3.2, groundAt(CROSSROADS.x + 3.2, CROSSROADS.z - 0.6).y, CROSSROADS.z - 0.6);
    this.handLantern = new THREE.PointLight(0xffa24a, 7, 11, 2);
    this.lanternGlow = makeGlowSprite(0xffb066, 1.4, 1.0);
    scene.add(this.handLantern, this.lanternGlow);
    this.reset();
  }

  reset() {
    this.s = 0;
    this.dir = 1;
    this.pause = 8;
    this.guards.forEach((g) => g.reset());
    this.update(0, 0, null);
  }

  /** Where the patrol leader stands (for observation objective). */
  patrolPos() {
    return this.patrol[0].pos;
  }

  update(dt: number, t: number, st: Stimulus | null) {
    let caught = false;
    const alerted = this.patrol.some((g) => g.suspicion > 0.25);
    if (!alerted) {
      if (this.pause > 0) this.pause -= dt;
      else {
        this.s += this.dir * SPEED * dt;
        if (this.s >= PATH_LEN) {
          this.s = PATH_LEN;
          this.dir = -1;
          this.pause = PAUSE_END;
        } else if (this.s <= 0) {
          this.s = 0;
          this.dir = 1;
          this.pause = PAUSE_START;
        }
      }
    }
    this.patrol.forEach((g, i) => {
      const s = THREE.MathUtils.clamp(this.s - this.dir * i * 1.4, 0, PATH_LEN);
      const p = pathPoint(s);
      const side = i === 0 ? 0.35 : -0.35;
      const x = p.x + Math.cos(p.dir) * side, z = p.z - Math.sin(p.dir) * side;
      g.pos.set(x, groundAt(x, z).y, z);
      if (st && g.faceAttention(dt)) {
        /* turned toward stimulus */
      } else if (this.pause > 0) {
        // idle: look around slowly while resting
        g.yaw = p.dir + (this.dir > 0 ? 0 : Math.PI) + Math.sin(t * 0.3 + i * 2) * 0.9;
      } else g.yaw = p.dir + (this.dir > 0 ? 0 : Math.PI);
      g.group.position.y = g.pos.y;
      if (st && g.sense(st, dt)) caught = true;
      g.place();
      // walk bob
      if (this.pause <= 0 && !alerted) g.group.position.y += Math.abs(Math.sin(t * 5 + i)) * 0.03;
    });
    const lead = this.patrol[0];
    const hand = new THREE.Vector3(0.32, 0.95, 0.18).applyAxisAngle(new THREE.Vector3(0, 1, 0), lead.yaw).add(lead.pos);
    this.handLantern.position.copy(hand);
    this.lanternGlow.position.copy(hand);
    this.handLantern.intensity = 7 * (0.9 + 0.1 * Math.sin(t * 13) * Math.sin(t * 3.1));

    // post guard sweeps ±70°
    const p = this.post;
    if (!(st && p.faceAttention(dt))) p.yaw = this.postBase + Math.sin(t * ((Math.PI * 2) / 14)) * (70 * Math.PI / 180);
    if (st && p.sense(st, dt)) caught = true;
    p.place();
    return caught;
  }

  maxSuspicion() {
    return Math.max(...this.guards.map((g) => g.suspicion));
  }
}
