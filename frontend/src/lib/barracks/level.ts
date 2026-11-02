// Chapter II engine — «ليلة الفاتح · Night of the First».
// Loop: escape the watched village → secret meeting (cemetery) → optional recon from the Kef →
// password + planning at the olive mill → infiltrate the barracks → seize the armory → fighting escape to the mountains.
import * as THREE from "three";
import { mulberry32, makeGlowSprite, makeParticleField, createPostFX, Flicker, NOISE_GLSL, type PostFX } from "@/lib/lighting";
import { createGreenKit } from "@/lib/ported/greenworld";
import { buildHouses } from "@/lib/night/houses";
import { makeAmmar, makeZahra } from "@/lib/night/figures";
import type { Surface } from "@/lib/night/audio";
import type { BarracksAudio } from "@/lib/barracks/audio";
import {
  MAP, BOXES, BUILDINGS, TOWERS, TOWER_H, TRUCKS, CRATES, DRUMS, FLAG, VILLAGE, COMPOUND, COMPOUND_Y, GATE, WIRE, DRAIN, GENERATOR,
  ARMORY, ARMORY_DOOR, RACKS, SPAWN, CEMETERY, MESSAOUD, KEF, KEF_TOP, MILL, RABAH_DOOR, LAKHDAR, TABLE, RALLY, CHECKPOINT,
  DIVERSION_FIRE, PHONE_POLE, OUED, MOON_DIR_ARR,
  terrainHeight, splatAt, groundAt, solidAt, lineClear, zoneAt, roadDist, ouedDepth, insideCompound, rebuildNav,
  type Zone, type Building,
} from "@/lib/barracks/map";
import { Garrison, type Soldier, type Stimulus, type ShotEvent } from "@/lib/barracks/soldiers";

export type Stage = "escape" | "meet" | "to_mill" | "plan" | "infiltrate" | "armory" | "exfil" | "ended";
export type Entry = "drain" | "wire" | "gate";
export type Diversion = "fire" | "phone" | "cover";
export interface Plan { entry: Entry; diversion: Diversion }
export type Who = "messaoud" | "rabah";

export interface HudState {
  clock: string;
  stage: Stage;
  objAr: string; objEn: string;
  subAr?: string; subEn?: string;
  suspicion: number;
  shout: number;
  visibility: "hidden" | "shadow" | "lit";
  prompt: { ar: string; en: string; hold: boolean; blocked?: boolean } | null;
  hold: number;
  health: number;
  weapon: { name: string; mag: number; reserve: number; reloading: boolean } | null;
  alarm: number;
  reinforceIn: number;
  tagged: number;
  tagTotal: number;
  tagProgress: number;
  binoculars: boolean;
  hasBinoculars: boolean;
  rifles: number;
  hasKey: boolean;
  generatorOff: boolean;
  signal: "ready" | "used" | null;
  takedown: boolean;
  crawl: boolean;
}
export interface Ending {
  ghost: boolean; rifles: number; kills: number; takedowns: number; deaths: number; tagged: number; tagTotal: number;
  clock: string; plan: Plan | null; alarmBeforeArmory: boolean; passwordOk: boolean;
}
export interface MapState {
  player: { x: number; z: number; yaw: number };
  soldiers: { x: number; z: number; yaw: number; state: string; role: string }[];
  allies: { x: number; z: number }[];
  beams: { x: number; z: number }[];
  objective: { x: number; z: number } | null;
  wireCut: boolean; doorOpen: boolean; generatorOff: boolean;
}

export interface LevelOptions {
  lowPower: boolean;
  audio?: BarracksAudio;
  onHud?: (h: HudState) => void;
  onDialogue?: (who: Who) => void;
  onCaught?: (reason: "caught" | "killed") => void;
  onEnding?: (e: Ending) => void;
  onCheckpoint?: (name: string) => void;
  onReady?: () => void;
  onZone?: (z: Zone | null) => void;
  onActiveChange?: (active: boolean) => void;
  onStep?: (surface: Surface, loudness: number) => void;
  onToast?: (ar: string, en: string) => void;
  onDamage?: (dirAngle: number) => void;
}

const OBJ: Record<Stage, [string, string]> = {
  escape: ["اخرج من البيت المراقَب والتحق بمسعود في المقبرة", "Slip out of the watched house and reach Messaoud at the cemetery"],
  meet: ["التقِ مسعود عند ضريح سيدي عبد الله", "Meet Messaoud by the marabout"],
  to_mill: ["اتبع الوادي إلى معصرة الزيتون", "Follow the oued to the olive mill"],
  plan: ["ضع الخطة مع سي لخضر", "Make the plan with Si Lakhdar"],
  infiltrate: ["ادخل الثكنة واصل إلى مخزن السلاح", "Get inside the barracks and reach the armory"],
  armory: ["خذ البنادق من الرفوف", "Take the rifles from the racks"],
  exfil: ["احمل السلاح إلى مسلك الجبل", "Carry the weapons to the mountain trail"],
  ended: ["", ""],
};
const START_MIN = 1 * 60 + 10;
const SEC_PER_MIN = 2.5;
const MOON_DIR = new THREE.Vector3(...MOON_DIR_ARR).normalize();
const HORIZON = new THREE.Color().setRGB(0.035, 0.07, 0.1);
const EYE_STAND = 1.65, EYE_CROUCH = 0.95, RADIUS = 0.3;
const WEAPONS = {
  pistol: { ar: "مسدس", en: "Pistol", mag: 8, dmg: 55, head: 200, rate: 0.28, spread: 0.012, reload: 1.5 },
  rifle: { ar: "بندقية MAS-36", en: "MAS-36 rifle", mag: 5, dmg: 120, head: 250, rate: 0.95, spread: 0.004, reload: 2.4 },
} as const;
type WeaponId = keyof typeof WEAPONS;

const SKY_FRAG = /* glsl */ `
uniform vec3 uMoonDir; uniform float uTime; uniform vec3 uHorizon; uniform float uGlow;
varying vec3 vDir;
${NOISE_GLSL}
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 zen = vec3(0.003, 0.007, 0.016);
  vec3 col = mix(uHorizon, zen, pow(smoothstep(-0.02, 0.65, h), 0.6));
  float m = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.25, 0.4, 0.62) * pow(m, 10.0) * 0.22 + vec3(0.5, 0.7, 1.0) * pow(m, 180.0) * 0.5;
  // the burning barracks glow on the low clouds once the fight starts
  col += vec3(0.5, 0.18, 0.05) * uGlow * smoothstep(0.35, -0.05, h) * max(0.0, -d.z);
  vec2 uv = d.xz / (d.y + 0.18) * 1.4 + vec2(uTime * 0.004, uTime * 0.001);
  float c = smoothstep(0.48, 0.82, fbm(uv * 1.2));
  float lit = 0.35 + 1.6 * pow(m, 5.0);
  col = mix(col, vec3(0.045, 0.08, 0.12) * lit, c * 0.75 * smoothstep(0.0, 0.25, h));
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Lamp { pos: THREE.Vector3; radius: number; power: number; grid: boolean; glow: THREE.Sprite; haze: THREE.Sprite; head: THREE.MeshStandardMaterial | null; flicker: Flicker; warm: boolean; on: boolean }
interface BeamFx { light: THREE.SpotLight; cone: THREE.Mesh; mat: THREE.ShaderMaterial; head: THREE.Object3D }
interface Tracer { line: THREE.Line; life: number; mat: THREE.LineBasicMaterial }
interface Ally { id: string; group: THREE.Group; pos: THREE.Vector3; fireCd: number; active: boolean; covering: boolean }
interface Act { id: string; ar: string; en: string; hold?: number; run?: () => void; noise?: number; blocked?: boolean; x: number; z: number }

const boxGeo = (w: number, h: number, d: number, s = 2.2) => {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, (uv.getX(k) * dims[f][0]) / s, (uv.getY(k) * dims[f][1]) / s);
  }
  return g;
};

/** gabled roof, ridge along local X */
function gableGeo(len: number, span: number, rise: number) {
  const L = len / 2, S = span / 2;
  const v = [
    -L, 0, S, L, 0, S, L, rise, 0, -L, 0, S, L, rise, 0, -L, rise, 0, // south slope
    L, 0, -S, -L, 0, -S, -L, rise, 0, L, 0, -S, -L, rise, 0, L, rise, 0, // north slope
    L, 0, S, L, 0, -S, L, rise, 0, -L, 0, -S, -L, 0, S, -L, rise, 0, // gables
  ];
  const uv = [0, 0, len, 0, len, S, 0, 0, len, S, 0, S, 0, 0, len, 0, len, S, 0, 0, len, S, 0, S, 0, 0, span, 0, S, rise, 0, 0, span, 0, S, rise].map((x) => x / 1.6);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function signTexture(text: string, sub = "") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const x = c.getContext("2d")!;
  x.fillStyle = "#1a1d1b";
  x.fillRect(0, 0, 256, 96);
  x.strokeStyle = "#8d8a7a";
  x.lineWidth = 4;
  x.strokeRect(6, 6, 244, 84);
  x.fillStyle = "#d8d2bf";
  x.font = "bold 40px system-ui, sans-serif";
  x.textAlign = "center";
  x.fillText(text, 128, sub ? 52 : 62);
  if (sub) {
    x.font = "18px system-ui, sans-serif";
    x.fillText(sub, 128, 80);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripes(color: string, line: string, n: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = line;
  for (let i = 0; i < n; i++) x.fillRect((i * 64) / n, 0, 64 / n / 3, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BEAM_VERT = /* glsl */ `varying float vY; varying vec3 vN; varying vec3 vV;
void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BEAM_FRAG = /* glsl */ `uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV;
void main(){ float rim = pow(abs(dot(vN, vV)), 1.6); float a = uI * rim * (0.15 + 0.85 * vY) * 0.16; gl_FragColor = vec4(vec3(0.85,0.92,1.0)*a, a); }`;

export class BarracksLevel {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private fx: PostFX;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private opts: LevelOptions;
  private low: boolean;
  private canvas: HTMLCanvasElement;
  private overlay: CanvasRenderingContext2D | null = null;

  private moon!: THREE.DirectionalLight;
  private skyGroup = new THREE.Group();
  private skyMat!: THREE.ShaderMaterial;
  private dust!: ReturnType<typeof makeParticleField>;
  private green: ReturnType<typeof createGreenKit>;
  private kit!: ReturnType<typeof buildHouses>["kit"];
  private patches = new Map<string, { lv: number; meshes: THREE.Mesh[] }>();
  private grassTimer = 0;

  // lights
  private lamps: Lamp[] = [];
  private pool: THREE.PointLight[] = [];
  private poolTimer = 0;
  private beamsFx: BeamFx[] = [];
  private fireLight!: THREE.PointLight;
  private fireSprites: THREE.Sprite[] = [];
  private fireFlicker = new Flicker(2.5, 0.5);
  private flash!: THREE.PointLight;
  private tracers: Tracer[] = [];
  private flashes: { s: THREE.Sprite; life: number }[] = [];

  // player
  readonly pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private velY = 0;
  private onGround = true;
  private yaw = SPAWN.yaw;
  private pitch = -0.05;
  private crouchAmt = 0;
  private stepPhase = 0;
  private lastStep = 0;
  private keys = new Set<string>();
  private jumpQueued = false;
  private active = false;
  readonly isTouch: boolean;
  private moveTouch: { id: number; x: number; y: number } | null = null;
  private lookTouch: { id: number; x: number; y: number } | null = null;
  private touchMove = new THREE.Vector2();
  private touchBtn = { fire: false, interact: false, binoc: false };
  private crouchToggle = false;
  private zoneTimer = 0;
  private zoneId: string | null = "__init";
  private readyFired = false;
  private fovBase = 68;
  private recoil = 0;
  private mouseFire = false;
  private mouseBinoc = false;

  // viewmodel
  private viewGroup = new THREE.Group();
  private pistolMesh!: THREE.Group;
  private rifleMesh!: THREE.Group;

  // game
  private garrison!: Garrison;
  private allies: Ally[] = [];
  private npc: Record<"messaoud" | "rabah" | "lakhdar" | "said", THREE.Group> = {} as never;
  private armoryDoor!: THREE.Object3D;
  private wireLines!: THREE.Object3D;
  private genLamp!: THREE.MeshStandardMaterial;
  private rackRifles: THREE.Group[] = [];
  private fireGroup = new THREE.Group();
  readonly game = {
    stage: "escape" as Stage,
    elapsed: 0,
    health: 100,
    hurtT: 99,
    armed: false,
    binoculars: false,
    weapon: null as WeaponId | null,
    ammo: { pistol: { mag: 0, reserve: 0 }, rifle: { mag: 0, reserve: 0 } },
    reloading: 0,
    fireCd: 0,
    plan: null as Plan | null,
    passwordOk: true,
    hasKey: false,
    wireCut: false,
    doorOpen: false,
    generatorOff: false,
    racks: [false, false, false],
    rifles: 0,
    kills: 0,
    takedowns: 0,
    deaths: 0,
    signal: null as "ready" | "used" | null,
    inside: false,
    alarmBeforeArmory: false,
    sirenCause: null as string | null,
    discoveryT: -1,
    diversionStarted: -1,
    assaultT: -1,
  };
  private checkpoint: { x: number; z: number; yaw: number; game: string; garrison: ReturnType<Garrison["snapshot"]>; alarm: number } | null = null;
  private frozen = false;
  private failT = 0;
  private hold = { id: "", t: 0 };
  private act: Act | null = null;
  private hudTimer = 0;
  private stim!: Stimulus;
  private visState: HudState["visibility"] = "shadow";
  private tagProgress = 0;
  private tagTarget: Soldier | null = null;
  private crawlHint = false;
  private noiseT = 0;
  private glow = 0;

  constructor(canvas: HTMLCanvasElement, opts: LevelOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.low = opts.lowPower;
    this.isTouch = window.matchMedia("(pointer: coarse)").matches;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.low ? 1 : 1.5));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = new THREE.FogExp2(HORIZON.clone(), 0.017);
    this.fovBase = w < h ? 80 : 68;
    this.camera = new THREE.PerspectiveCamera(this.fovBase, w / h, 0.05, 800);
    this.scene.add(this.camera);

    this.green = createGreenKit({
      height: terrainHeight, splat: splatAt, quality: this.low ? 0.3 : 0.6, sunDir: MOON_DIR,
      skyTop: new THREE.Color().setRGB(0.003, 0.007, 0.016), skyHor: HORIZON.clone(), wind: 0.9,
    });
    rebuildNav();
    this.buildEnvironment();
    this.buildSky();
    this.buildTerrain();
    this.buildVillage();
    this.buildCompound();
    this.buildFence();
    this.buildTowers();
    this.buildProps();
    this.buildVegetation();
    this.buildLights();
    this.buildPeople();
    this.buildViewmodel();
    this.buildFx();
    this.garrison = new Garrison(this.scene, {
      onCaught: () => this.fail("caught"),
      onShout: (s) => {
        this.opts.audio?.shout(this.panOf(s.pos));
        this.opts.onToast?.("يصرخ لإطلاق الإنذار — أسكته!", "He's shouting the alarm — silence him!");
      },
      onAlarm: (lvl, reason) => this.onAlarm(lvl, reason),
      onShot: (e) => this.onEnemyShot(e),
      onBody: () => this.opts.onToast?.("عثروا على جثّة", "A body was found"),
    });
    this.dust = makeParticleField(this.low ? 600 : 1400, new THREE.Vector3(50, 16, 50), [
      { color: 0xb5d4ff, weight: 0.82, gain: 0.55 },
      { color: 0x6fb4ff, weight: 0.12, gain: 0.6 },
      { color: 0xffc27a, weight: 0.06, gain: 0.5 },
    ], this.renderer.getPixelRatio());
    this.dust.mat.uniforms.uWind.value.set(0.6, -0.05, 0.2);
    this.scene.add(this.dust.points);
    this.fx = createPostFX(this.renderer, this.scene, this.camera, { low: this.low, bloom: [0.8, 0.7, 0.22], vignette: 0.14 });

    this.pos.set(SPAWN.x, groundAt(SPAWN.x, SPAWN.z).y, SPAWN.z);
    this.stim = this.computeStimulus({ hs: 0, crouch: false, run: false, surface: "dirt" });
    this.saveCheckpoint("start", true);
    this.updateGrass(Infinity);
    this.bindInput();
    (window as unknown as { __barracks?: BarracksLevel }).__barracks = this;
    this.loop();
  }

  // ======================= builders =======================
  private add<T extends THREE.Object3D>(o: T, cast = true, receive = true) {
    o.traverse((c) => {
      c.castShadow = cast;
      c.receiveShadow = receive;
    });
    this.scene.add(o);
    return o;
  }
  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, parent?: THREE.Object3D) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    (parent ?? this.scene).add(m);
    return m;
  }

  private buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color().setRGB(0.01, 0.02, 0.035);
    const moonPanel = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9cc4ff).multiplyScalar(4) }));
    moonPanel.position.copy(MOON_DIR).multiplyScalar(30);
    moonPanel.lookAt(0, 0, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: HORIZON.clone().multiplyScalar(2.5), side: THREE.BackSide }));
    env.add(moonPanel, band);
    const rt = pmrem.fromScene(env, 0.04);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
  }

  private buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uMoonDir: { value: MOON_DIR }, uTime: { value: 0 }, uHorizon: { value: new THREE.Vector3(HORIZON.r, HORIZON.g, HORIZON.b) }, uGlow: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), this.skyMat);
    dome.renderOrder = -10;
    this.skyGroup.add(dome);
    const rng = mulberry32(9);
    const n = 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * Math.PI * 2, y = 0.06 + Math.pow(rng(), 0.7) * 0.94, r = Math.sqrt(1 - y * y);
      p.set([Math.cos(u) * r * 480, y * 480, Math.sin(u) * r * 480], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.skyGroup.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(0xa8c4ea).multiplyScalar(0.9), size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false, fog: false })));
    const moon = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdbe8ff).multiplyScalar(5), fog: false }));
    moon.position.copy(MOON_DIR).multiplyScalar(420);
    moon.lookAt(0, 0, 0);
    const corona = makeGlowSprite(0x7fa8e8, 0.55, 110, false);
    corona.position.copy(moon.position);
    this.skyGroup.add(moon, corona);
    const ridge = (radius: number, amp: number, base: number, col: THREE.Color, seed: number) => {
      const r = mulberry32(seed), N = 160, ph = [r() * 6, r() * 6, r() * 6];
      const pos: number[] = [], idx: number[] = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        let hgt = base + amp * (0.5 + 0.5 * Math.sin(a * 3 + ph[0])) + amp * 0.45 * Math.sin(a * 7 + ph[1]) + amp * 0.18 * Math.sin(a * 19 + ph[2]);
        hgt += amp * 0.9 * Math.max(0, -Math.sin(a)); // the Aurès rise behind the barracks (north)
        pos.push(Math.cos(a) * radius, -30, Math.sin(a) * radius, Math.cos(a) * radius, hgt, Math.sin(a) * radius);
        if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, fog: false, side: THREE.DoubleSide }));
    };
    this.skyGroup.add(ridge(320, 40, 14, new THREE.Color().setRGB(0.018, 0.034, 0.05), 21));
    this.skyGroup.add(ridge(220, 24, 6, new THREE.Color().setRGB(0.008, 0.015, 0.024), 22));
    this.scene.add(this.skyGroup);
  }

  private buildTerrain() {
    const seg = this.low ? 1.5 : 0.9;
    const W = MAP.maxX - MAP.minX + 40, D = MAP.maxZ - MAP.minZ + 40;
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / seg), Math.round(D / seg));
    geo.rotateX(-Math.PI / 2);
    geo.translate((MAP.minX + MAP.maxX) / 2, 0, (MAP.minZ + MAP.maxZ) / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const n = geo.attributes.normal as THREE.BufferAttribute;
    const splat = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) splat.set(splatAt(p.getX(i), p.getZ(i), n.getY(i)), i * 4);
    geo.setAttribute("aSplat", new THREE.BufferAttribute(splat, 4));
    const mesh = new THREE.Mesh(geo, this.green.tMat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // parade ground: packed, raked earth with a painted border
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshStandardMaterial({ color: 0x4a4539, roughness: 1, map: stripes("#4a4539", "#433f34", 24) }));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(0, COMPOUND_Y + 0.02, -55);
    yard.receiveShadow = true;
    this.scene.add(yard);
  }

  private updateGrass(budget: number) {
    const k = this.green, G = k.G;
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const seen = new Set<string>();
    let built = 0;
    for (let pz = Math.floor(MAP.minZ / G) - 1; pz <= Math.floor(MAP.maxZ / G); pz++) {
      for (let px = Math.floor(MAP.minX / G) - 1; px <= Math.floor(MAP.maxX / G); px++) {
        const x0 = px * G, z0 = pz * G;
        const dn = Math.hypot(Math.max(x0 - cx, 0, cx - x0 - G), Math.max(z0 - cz, 0, cz - z0 - G));
        const lv = dn < k.LV[0] ? 0 : dn < k.LV[1] ? 1 : dn < k.LV[2] && !this.low ? 2 : -1;
        if (lv < 0) continue;
        const key = px + "," + pz;
        seen.add(key);
        const ex = this.patches.get(key);
        if ((ex && ex.lv === lv) || built >= budget) continue;
        built++;
        this.removePatch(key);
        const gd = k.sampleGrid(px, pz);
        const B = k.buildBlades(px, pz, lv, gd);
        const meshes: THREE.Mesh[] = [];
        if (B.count > 0) {
          const m = new THREE.Mesh(k.instGeo(k.TUFT[lv], B, gd, px, pz, ["position", "normal", "aH"]), k.grassMats[lv]);
          m.receiveShadow = true;
          this.scene.add(m);
          meshes.push(m);
        }
        if (lv === 0) {
          for (const sc of k.SCAT) {
            const F = k.buildScatter(px, pz, gd, sc.salt, sc.n(this.low ? 0.3 : 0.6), sc.pf);
            if (F.count > 0) {
              const m = new THREE.Mesh(k.instGeo(sc.T, F, gd, px, pz, ["position", "normal", "aH", "aK"]), k.flowerMat);
              this.scene.add(m);
              meshes.push(m);
            }
          }
        }
        this.patches.set(key, { lv, meshes });
      }
    }
    for (const key of Array.from(this.patches.keys())) if (!seen.has(key)) this.removePatch(key);
  }
  private removePatch(key: string) {
    const p = this.patches.get(key);
    if (!p) return;
    for (const m of p.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.patches.delete(key);
  }

  private buildVillage() {
    const { kit } = buildHouses(this.scene, VILLAGE, this.low, terrainHeight);
    this.kit = kit;
    const k = kit;
    // safe-house courtyard + cemetery walls from the collision boxes
    for (const b of BOXES) {
      if (b.id !== "court" && b.id !== "cemetery") continue;
      const w = b.x1 - b.x0, d = b.z1 - b.z0, h = b.top - b.y0;
      this.mesh(k.U(boxGeo(w, h, d), 1), b.id === "court" ? k.A : k.S, (b.x0 + b.x1) / 2, b.y0 + h / 2, (b.z0 + b.z1) / 2);
    }
    // marabout: whitewashed cube with a dome
    const g = terrainHeight(CEMETERY.x - 1.5, CEMETERY.z - 2);
    this.mesh(boxGeo(4, 3.4, 4), k.Lm, CEMETERY.x - 1.5, g + 1.7, CEMETERY.z - 2);
    const dome = this.mesh(new THREE.SphereGeometry(1.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), k.Lm, CEMETERY.x - 1.5, g + 3.4, CEMETERY.z - 2);
    dome.scale.y = 1.1;
    this.mesh(new THREE.BoxGeometry(0.8, 1.6, 0.05), new THREE.MeshStandardMaterial({ color: 0x050403 }), CEMETERY.x - 1.5, g + 0.8, CEMETERY.z + 0.01);
    // graves
    const rng = mulberry32(77);
    const graves = new THREE.InstancedMesh(boxGeo(0.35, 0.6, 0.12), k.S, 34);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 34; i++) {
      const x = CEMETERY.x - 6.5 + rng() * 13, z = CEMETERY.z - 5.5 + rng() * 11.5;
      if (Math.hypot(x - CEMETERY.x + 1.5, z - CEMETERY.z + 2) < 3.4 || Math.hypot(x - MESSAOUD.x, z - MESSAOUD.z) < 1.5) {
        i--;
        continue;
      }
      dummy.position.set(x, terrainHeight(x, z) + 0.2, z);
      dummy.rotation.set((rng() - 0.5) * 0.25, rng() * 0.4, (rng() - 0.5) * 0.2);
      dummy.updateMatrix();
      graves.setMatrixAt(i, dummy.matrix);
    }
    graves.castShadow = graves.receiveShadow = true;
    this.scene.add(graves);
    // café terrace: table + stool where the informer watches the street
    const wood = k.Wo;
    const tg = terrainHeight(-1.5, 54);
    this.mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), wood, -1.4, tg + 0.72, 53.6);
    this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6), wood, -1.4, tg + 0.36, 53.6);
    // olive press stone at the mill
    const mg = terrainHeight(MILL.x + 6, MILL.z + 4);
    this.mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.6, 20), k.S, MILL.x + 6.5, mg + 0.3, MILL.z + 4.5);
    this.mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.45, 18), k.S, MILL.x + 6.5, mg + 0.9, MILL.z + 4.5).rotation.z = Math.PI / 2;
    // the planning table
    const tb = terrainHeight(TABLE.x, TABLE.z);
    this.mesh(boxGeo(1.6, 0.06, 1.0), wood, TABLE.x, tb + 0.78, TABLE.z);
    for (const [sx, sz] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) this.mesh(new THREE.BoxGeometry(0.06, 0.78, 0.06), wood, TABLE.x + sx, tb + 0.39, TABLE.z + sz);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshStandardMaterial({ color: 0xcfc3a0, roughness: 1, map: signTexture("⌂ ⌂ ⌂", "plan") }));
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(TABLE.x, tb + 0.815, TABLE.z);
    this.scene.add(paper);
  }

  private buildingMesh(b: Building) {
    const k = this.kit;
    const y0 = COMPOUND_Y;
    const grp = new THREE.Group();
    grp.position.set(b.x, y0, b.z);
    this.scene.add(grp);
    const wallMat = b.kind === "armory" || b.kind === "shed" ? k.S : b.kind === "hq" ? k.A : k.Lm;
    const winDark = new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.3, metalness: 0.2 });
    const winLit = new THREE.MeshStandardMaterial({ color: 0x0a0705, emissive: 0xffa24a, emissiveIntensity: 1.4 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2b2318, roughness: 0.85 });
    if (b.kind !== "armory") {
      this.mesh(k.U(boxGeo(b.w, b.h, b.d), 1), wallMat, 0, b.h / 2, 0, 0, grp);
      // plinth
      this.mesh(boxGeo(b.w + 0.12, 0.45, b.d + 0.12), k.S, 0, 0.22, 0, 0, grp);
    }
    // roof
    if (b.kind === "hq") {
      this.mesh(boxGeo(b.w + 0.3, 0.5, b.d + 0.3), k.A, 0, b.h + 0.25, 0, 0, grp);
    } else {
      const roofMat = new THREE.MeshStandardMaterial({ color: b.kind === "armory" ? 0x4a3a2c : 0x3c3f3d, roughness: 0.55, metalness: 0.55, map: stripes("#5b5f5c", "#3b3d3c", 10), side: THREE.DoubleSide });
      const r = this.mesh(gableGeo(b.w + 0.7, b.d + 0.9, b.kind === "shed" ? 0.7 : 1.5), roofMat, 0, b.h, 0, 0, grp);
      r.castShadow = true;
    }
    // windows on the long walls
    const nWin = Math.max(1, Math.floor(b.w / 3));
    if (b.kind !== "armory" && b.kind !== "shed") {
      for (let i = 0; i < nWin; i++) {
        const x = -b.w / 2 + (b.w / nWin) * (i + 0.5);
        for (const side of [-1, 1]) {
          const lit = (b.kind === "guard" || b.kind === "hq" || (b.kind === "barracks" && (i + (side > 0 ? 1 : 0) + b.x) % 3 === 0)) && side > 0;
          const win = this.mesh(new THREE.PlaneGeometry(1.0, 0.9), lit ? winLit : winDark, x, b.h * 0.58, side * (b.d / 2 + 0.01), side > 0 ? 0 : Math.PI, grp);
          win.castShadow = false;
          const sill = this.mesh(new THREE.BoxGeometry(1.2, 0.08, 0.14), k.S, x, b.h * 0.58 - 0.5, side * (b.d / 2 + 0.05), 0, grp);
          sill.castShadow = false;
        }
      }
    }
    // door + sign facing the yard
    const dir = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[b.door];
    const ry = Math.atan2(dir[0], dir[1]);
    const off = dir[0] ? b.w / 2 : b.d / 2;
    if (b.kind !== "armory") {
      const door = this.mesh(new THREE.PlaneGeometry(1.2, 2.1), doorMat, dir[0] * (off + 0.02), 1.05, dir[1] * (off + 0.02), ry, grp);
      door.castShadow = false;
    }
    const labels: Record<string, [string, string]> = {
      hq: ["P.C.", "COMMANDEMENT"], mess: ["MESS", "ORDINAIRE"], guard: ["POSTE", "DE GARDE"], armory: ["ARMURERIE", "ACCÈS INTERDIT"], gen: ["GROUPE", "ÉLECTROGÈNE"],
    };
    const lab = labels[b.id] ?? (b.kind === "barracks" ? [b.id.slice(1), "CHAMBRÉE"] : null);
    if (lab) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshStandardMaterial({ map: signTexture(lab[0], lab[1]), roughness: 0.8 }));
      sign.position.set(dir[0] * (off + 0.04) + (dir[1] ? 1.4 : 0), 2.55, dir[1] * (off + 0.04) + (dir[0] ? 1.4 : 0));
      sign.rotation.y = ry;
      grp.add(sign);
    }
    return grp;
  }

  private buildCompound() {
    const k = this.kit;
    for (const b of BUILDINGS) this.buildingMesh(b);
    // armory shell: stone walls with a real doorway, dark interior, racks of rifles
    {
      const { x, z, w, d } = ARMORY, H = 3.4, y0 = COMPOUND_Y;
      for (const bx of BOXES.filter((q) => q.id === "armory")) {
        const ww = bx.x1 - bx.x0, dd = bx.z1 - bx.z0;
        this.mesh(k.U(boxGeo(ww, H, dd), 1), k.S, (bx.x0 + bx.x1) / 2, y0 + H / 2, (bx.z0 + bx.z1) / 2);
      }
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.8, d - 0.8), new THREE.MeshStandardMaterial({ color: 0x2b2924, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(x, y0 + 0.03, z);
      floor.receiveShadow = true;
      this.scene.add(floor);
      const ceil = this.mesh(boxGeo(w, 0.25, d), k.S, x, y0 + H + 0.1, z);
      ceil.castShadow = true;
      // swinging plank door, hinged at its west edge
      const hinge = new THREE.Group();
      hinge.position.set(ARMORY_DOOR.x - 0.9, y0, ARMORY_DOOR.z);
      const door = this.mesh(boxGeo(1.8, 2.3, 0.1), k.Wo, 0.9, 1.15, 0, 0, hinge);
      door.castShadow = true;
      for (const yy of [0.5, 1.8]) this.mesh(new THREE.BoxGeometry(1.82, 0.08, 0.12), k.iron, 0.9, yy, 0, 0, hinge);
      this.mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), k.iron, 1.55, 1.1, 0.1, 0, hinge);
      this.scene.add(hinge);
      this.armoryDoor = hinge;
      const rifleMat = new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.6 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4, metalness: 0.8 });
      RACKS.forEach(([rx, rz]) => {
        const rack = new THREE.Group();
        rack.position.set(rx, y0, rz);
        this.mesh(boxGeo(1.7, 0.12, 0.5), k.W, 0, 0.12, 0, 0, rack);
        this.mesh(boxGeo(1.7, 0.08, 0.2), k.W, 0, 1.45, -0.15, 0, rack);
        const guns = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const gx = -0.6 + i * 0.4;
          this.mesh(new THREE.BoxGeometry(0.06, 1.25, 0.09), rifleMat, gx, 0.8, 0.02, 0, guns).rotation.x = -0.1;
          this.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), steel, gx, 1.55, -0.05, 0, guns);
        }
        rack.add(guns);
        this.scene.add(rack);
        this.rackRifles.push(guns);
      });
      for (const [cx, cz] of [[x - 2.8, z + 1.2], [x + 2.9, z + 1.4]]) this.mesh(boxGeo(1.0, 0.6, 0.6), k.W, cx, y0 + 0.3, cz);
    }
    // generator
    const gen = new THREE.Group();
    gen.position.set(GENERATOR.x, COMPOUND_Y, GENERATOR.z - 1.6);
    this.mesh(boxGeo(2, 1.1, 1), new THREE.MeshStandardMaterial({ color: 0x2f3b2c, roughness: 0.6, metalness: 0.4 }), 0, 0.55, 1.75, 0, gen);
    this.genLamp = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x6dff7a, emissiveIntensity: 4 });
    this.mesh(new THREE.SphereGeometry(0.05, 8, 6), this.genLamp, 0.7, 1.15, 2.26, 0, gen);
    this.scene.add(gen);
    // flag plaza: pole + tricolour
    this.mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.35, 20), k.S, FLAG.x, COMPOUND_Y + 0.17, FLAG.z);
    this.mesh(new THREE.CylinderGeometry(0.05, 0.07, 9, 8), k.iron, FLAG.x, COMPOUND_Y + 4.5, FLAG.z);
    const fc = document.createElement("canvas");
    fc.width = 96;
    fc.height = 64;
    const fx = fc.getContext("2d")!;
    ["#23305e", "#d9d6cc", "#a3262a"].forEach((c, i) => {
      fx.fillStyle = c;
      fx.fillRect(i * 32, 0, 32, 64);
    });
    const ft = new THREE.CanvasTexture(fc);
    ft.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2, 12, 4), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.9 }));
    flag.geometry.translate(0.9, 0, 0);
    flag.position.set(FLAG.x + 0.05, COMPOUND_Y + 8.3, FLAG.z);
    flag.name = "flag";
    this.scene.add(flag);
    // gate: posts, barrier pole, sentry box, sandbags
    const red = new THREE.MeshStandardMaterial({ map: stripes("#d8d2c2", "#a02a26", 6), roughness: 0.7 });
    for (const sx of [-1, 1]) this.mesh(boxGeo(0.5, 2.9, 0.5), k.S, GATE.x + sx * (GATE.half + 0.25), COMPOUND_Y + 1.45, GATE.z);
    const pole = this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.6, 8), red, GATE.x, COMPOUND_Y + 1.05, GATE.z + 0.4);
    pole.rotation.z = Math.PI / 2;
    this.mesh(boxGeo(1.5, 2.4, 1.5), k.W, GATE.x + 6.8, COMPOUND_Y + 1.2, GATE.z + 1.4);
    const sand = new THREE.MeshStandardMaterial({ color: 0x5a4e39, roughness: 1 });
    for (const b of BOXES.filter((q) => q.id === "sandbag")) {
      const w = b.x1 - b.x0, d = b.z1 - b.z0, rows = Math.round((b.top - b.y0 - 0.6) / 0.3);
      for (let i = 0; i < rows; i++) {
        const m = this.mesh(new THREE.CapsuleGeometry(0.17, Math.max(w, d) - 0.4, 3, 8), sand, (b.x0 + b.x1) / 2, b.y0 + 0.77 + i * 0.3, (b.z0 + b.z1) / 2);
        if (w > d) m.rotation.z = Math.PI / 2;
        else m.rotation.x = Math.PI / 2;
      }
    }
    // drain culvert mouth under the west fence
    const pipe = this.mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.6, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x4f4c45, roughness: 0.95, side: THREE.DoubleSide }), DRAIN.x, COMPOUND_Y + 0.5, DRAIN.z);
    pipe.rotation.z = Math.PI / 2;
  }

  private buildFence() {
    const { minX, maxX, minZ, maxZ } = COMPOUND;
    const posts: THREE.Vector3[] = [];
    const lines: number[] = [];
    const wireLines: number[] = [];
    const edge = (ax: number, az: number, bx: number, bz: number, target: number[]) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i <= n; i++) posts.push(new THREE.Vector3(ax + ((bx - ax) * i) / n, COMPOUND_Y, az + ((bz - az) * i) / n));
      for (const h of [0.35, 0.95, 1.55, 2.15, 2.7]) target.push(ax, COMPOUND_Y + h, az, bx, COMPOUND_Y + h, bz);
      // concertina zig-zag on top
      for (let i = 0; i < len * 2; i++) {
        const t0 = i / (len * 2), t1 = (i + 1) / (len * 2), s = i % 2 ? 0.25 : -0.25;
        target.push(ax + (bx - ax) * t0, COMPOUND_Y + 2.85 + s, az + (bz - az) * t0, ax + (bx - ax) * t1, COMPOUND_Y + 2.85 - s, az + (bz - az) * t1);
      }
    };
    edge(minX, maxZ, GATE.x - GATE.half, maxZ, lines);
    edge(GATE.x + GATE.half, maxZ, maxX, maxZ, lines);
    edge(minX, minZ, WIRE.x - 1.6, minZ, lines);
    edge(WIRE.x - 1.6, minZ, WIRE.x + 1.6, minZ, wireLines);
    edge(WIRE.x + 1.6, minZ, maxX, minZ, lines);
    edge(minX, minZ, minX, DRAIN.z - 1, lines);
    edge(minX, DRAIN.z + 1, minX, maxZ, lines);
    edge(maxX, minZ, maxX, maxZ, lines);
    const wm = new THREE.LineBasicMaterial({ color: 0x8a8f94, transparent: true, opacity: 0.55 });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    this.scene.add(new THREE.LineSegments(lg, wm));
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(wireLines, 3));
    this.wireLines = new THREE.LineSegments(wg, wm);
    this.scene.add(this.wireLines);
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 3, 6), new THREE.MeshStandardMaterial({ color: 0x3a3833, roughness: 0.7, metalness: 0.5 }), posts.length);
    const d = new THREE.Object3D();
    posts.forEach((p, i) => {
      d.position.set(p.x, p.y + 1.5, p.z);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.castShadow = true;
    this.scene.add(inst);
  }

  private buildTowers() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.9 });
    TOWERS.forEach(([tx, tz], ti) => {
      const g = new THREE.Group();
      g.position.set(tx, COMPOUND_Y, tz);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = this.mesh(new THREE.BoxGeometry(0.22, TOWER_H + 2.2, 0.22), wood, sx * 1.1, (TOWER_H + 2.2) / 2, sz * 1.1, 0, g);
        leg.castShadow = true;
      }
      for (const y of [1.8, 4]) {
        for (const r of [0, Math.PI / 2]) {
          const brace = this.mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), wood, Math.sin(r) * 1.1, y, Math.cos(r) * 1.1, r, g);
          brace.rotation.z = 0.7;
          const b2 = this.mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), wood, -Math.sin(r) * 1.1, y, -Math.cos(r) * 1.1, r, g);
          b2.rotation.z = -0.7;
        }
      }
      this.mesh(boxGeo(3, 0.18, 3), wood, 0, TOWER_H, 0, 0, g);
      for (const r of [0, 1, 2, 3]) this.mesh(new THREE.BoxGeometry(3, 1.0, 0.08), wood, Math.sin((r * Math.PI) / 2) * 1.45, TOWER_H + 0.55, Math.cos((r * Math.PI) / 2) * 1.45, (r * Math.PI) / 2, g);
      const roof = this.mesh(new THREE.ConeGeometry(2.4, 1.1, 4), new THREE.MeshStandardMaterial({ color: 0x33302b, roughness: 0.7, metalness: 0.4 }), 0, TOWER_H + 2.75, 0, Math.PI / 4, g);
      roof.castShadow = true;
      this.scene.add(g);
      if (ti === 1 || ti === 2) {
        const head = new THREE.Group();
        head.position.set(tx, COMPOUND_Y + TOWER_H + 1.5, tz);
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x1b1d1f, metalness: 0.7, roughness: 0.4 }));
        housing.rotation.x = Math.PI / 2;
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xeaf2ff, emissiveIntensity: 9 }));
        lens.position.z = 0.26;
        head.add(housing, lens);
        this.scene.add(head);
        const light = new THREE.SpotLight(0xf2f0e6, 320, 80, 0.12, 0.5, 1.6);
        light.position.copy(head.position);
        this.scene.add(light, light.target);
        const mat = new THREE.ShaderMaterial({ uniforms: { uI: { value: 1 } }, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        // narrow end at the lamp (local z 0), wide pool at the target (z 1); uv.y = 1 at the lamp
        const geo = new THREE.CylinderGeometry(0.22, 3.6, 1, 24, 1, true);
        geo.translate(0, -0.5, 0);
        geo.rotateX(-Math.PI / 2);
        const cone = new THREE.Mesh(geo, mat);
        cone.frustumCulled = false;
        this.scene.add(cone);
        const glow = makeGlowSprite(0xdfe9ff, 1.4, 2.4);
        glow.position.copy(head.position);
        this.scene.add(glow);
        this.beamsFx.push({ light, cone, mat, head });
      }
    });
  }

  private buildProps() {
    const k = this.kit;
    const olive = new THREE.MeshStandardMaterial({ color: 0x343a28, roughness: 0.85 });
    const canvasMat = new THREE.MeshStandardMaterial({ color: 0x4c4a36, roughness: 1, side: THREE.DoubleSide });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.9 });
    for (const t of TRUCKS) {
      const g = new THREE.Group();
      g.position.set(t.x, terrainHeight(t.x, t.z), t.z);
      g.rotation.y = t.rot;
      this.mesh(boxGeo(2.2, 0.5, 6.2), olive, 0, 0.9, 0, 0, g);
      this.mesh(boxGeo(2.2, 1.4, 1.7), olive, 0, 1.8, -2.2, 0, g);
      this.mesh(new THREE.PlaneGeometry(1.9, 0.6), new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.2, metalness: 0.5 }), 0, 2.1, -3.06, Math.PI, g);
      const cover = this.mesh(new THREE.CylinderGeometry(1.15, 1.15, 4.2, 14, 1, true, -Math.PI / 2, Math.PI), canvasMat, 0, 1.6, 0.9, 0, g);
      cover.rotation.x = Math.PI / 2;
      for (const [wx, wz] of [[-1.05, -2.1], [1.05, -2.1], [-1.05, 1.5], [1.05, 1.5], [-1.05, 2.5], [1.05, 2.5]]) {
        const w = this.mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.32, 14), tyre, wx, 0.48, wz, 0, g);
        w.rotation.z = Math.PI / 2;
      }
      this.scene.add(g);
    }
    for (const [x, z] of CRATES) {
      this.mesh(k.U(boxGeo(2.2, 0.95, 1.2), 1), k.W, x, terrainHeight(x, z) + 0.475, z);
      this.mesh(k.U(boxGeo(1.1, 0.95, 1.1), 1), k.Wo, x + 0.4, terrainHeight(x, z) + 1.43, z - 0.05, 0.2);
    }
    const drum = new THREE.MeshStandardMaterial({ color: 0x2c3a2d, roughness: 0.5, metalness: 0.6 });
    for (const [x, z] of DRUMS) for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.3], [-0.3, 0.38], [0.36, 0.34]]) this.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), drum, x + dx, terrainHeight(x, z) + 0.45, z + dz);
    // telephone line from the road into the HQ (Saïd cuts it in the "phone" plan)
    const pm = new THREE.MeshStandardMaterial({ color: 0x241b12, roughness: 0.9 });
    const polePts: THREE.Vector3[] = [];
    for (const [x, z] of [[PHONE_POLE.x, 30], [PHONE_POLE.x, 5], [PHONE_POLE.x, PHONE_POLE.z], [-12, -28], [-6, -74]] as const) {
      const gy = terrainHeight(x, z);
      this.mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 7), pm, x, gy + 3, z);
      polePts.push(new THREE.Vector3(x, gy + 5.7, z));
    }
    const pg = new THREE.BufferGeometry().setFromPoints(polePts);
    this.scene.add(new THREE.Line(pg, new THREE.LineBasicMaterial({ color: 0x141414 })));
    // checkpoint chicane on the road
    const red = new THREE.MeshStandardMaterial({ map: stripes("#d8d2c2", "#a02a26", 6), roughness: 0.7 });
    const bar = this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 8), red, CHECKPOINT.x, terrainHeight(CHECKPOINT.x, CHECKPOINT.z) + 1, CHECKPOINT.z + 1.4);
    bar.rotation.z = Math.PI / 2;
    // stones lining the oued
    const rng = mulberry32(31);
    const rocks = [0, 1, 2].map((v) => this.green.mkRock(v * 9.1 + 4, 18, 12));
    const dummy = new THREE.Object3D();
    rocks.forEach((geo, gi) => {
      const n = this.low ? 40 : 80;
      const inst = new THREE.InstancedMesh(geo, this.green.rockMat, n);
      for (let i = 0; i < n; i++) {
        const seg = Math.floor(rng() * (OUED.length - 1)), t = rng();
        const [ax, az] = OUED[seg], [bx, bz] = OUED[seg + 1];
        const side = (rng() - 0.5) * 9;
        const nx = -(bz - az), nz = bx - ax, nl = Math.hypot(nx, nz);
        const x = ax + (bx - ax) * t + (nx / nl) * side, z = az + (bz - az) * t + (nz / nl) * side;
        const sc = 0.2 + Math.pow(rng(), 2) * (gi === 0 ? 1.2 : 0.7);
        dummy.position.set(x, terrainHeight(x, z) - 0.15 * sc, z);
        dummy.rotation.set(0, rng() * 6, 0);
        dummy.scale.set(sc * 1.2, sc * 0.7, sc);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.castShadow = inst.receiveShadow = true;
      this.scene.add(inst);
    });
    // boulders on the Kef crest
    const kefInst = new THREE.InstancedMesh(rocks[0], this.green.rockMat, 14);
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, r = 3 + rng() * 8;
      const x = KEF.x + Math.cos(a) * r * 1.2, z = KEF.z + Math.sin(a) * r;
      if (Math.hypot(x - KEF_TOP.x, z - KEF_TOP.z) < 2.5) continue;
      const sc = 0.8 + rng() * 1.4;
      dummy.position.set(x, terrainHeight(x, z) - 0.3, z);
      dummy.scale.set(sc, sc * 0.7, sc);
      dummy.updateMatrix();
      kefInst.setMatrixAt(i, dummy.matrix);
    }
    kefInst.castShadow = kefInst.receiveShadow = true;
    this.scene.add(kefInst);
  }

  private buildVegetation() {
    const rng = mulberry32(1954);
    const k = this.green;
    const ok = (x: number, z: number) => {
      if (x < MAP.minX + 2 || x > MAP.maxX - 2 || z < MAP.minZ + 2 || z > MAP.maxZ - 2) return false;
      if (insideCompound(x, z, 9) || roadDist(x, z) < 3 || ouedDepth(x, z) > 0.4) return false;
      if (Math.hypot(x - KEF_TOP.x, z - KEF_TOP.z) < 4 || Math.hypot(x - CEMETERY.x, z - CEMETERY.z) < 9) return false;
      if (Math.hypot(x - MILL.x, z - MILL.z) < 9 || Math.hypot(x - CHECKPOINT.x, z - CHECKPOINT.z) < 8) return false;
      return !BOXES.some((b) => x > b.x0 - 2.5 && x < b.x1 + 2.5 && z > b.z0 - 2.5 && z < b.z1 + 2.5);
    };
    const pick = (n: number, near?: { x: number; z: number; r: number }) => {
      const out: { x: number; z: number }[] = [];
      let guard = 0;
      while (out.length < n && guard++ < n * 80) {
        const x = near ? near.x + (rng() - 0.5) * near.r * 2 : MAP.minX + rng() * (MAP.maxX - MAP.minX);
        const z = near ? near.z + (rng() - 0.5) * near.r * 2 : MAP.minZ + rng() * (MAP.maxZ - MAP.minZ);
        if (ok(x, z)) out.push({ x, z });
      }
      return out;
    };
    const species = [
      { c: false, seed: 11, P: { ...k.OAK, H: 6, wob: 0.45 }, bark: 0, leaf: 0, s: [0.45, 0.65] }, // olives
      { c: false, seed: 37, P: { ...k.OAK, H: 8.5, wob: 0.3, n0: 6 }, bark: 0, leaf: 0, s: [0.5, 0.7] },
      { c: true, seed: 7, P: k.CONI, bark: 2, leaf: 4, s: [0.55, 0.85] },
      { c: false, seed: 3, P: k.BUSH, bark: 0, leaf: 0, s: [0.8, 1.3] },
    ];
    const lists = [
      [...pick(this.low ? 14 : 26, { x: -60, z: -15, r: 22 }), ...pick(10, { x: -30, z: 30, r: 16 }), ...pick(8, { x: 40, z: 30, r: 20 })], // olive groves
      pick(this.low ? 16 : 28),
      [...pick(this.low ? 10 : 18, { x: -70, z: -85, r: 20 }), ...pick(8, { x: 60, z: -80, r: 25 })], // cedars on the mountain side
      [...pick(this.low ? 30 : 55), ...pick(16, { x: -45, z: -40, r: 14 })], // scrub — cover on the approach
    ];
    const dummy = new THREE.Object3D();
    species.forEach((sp, si) => {
      const list = lists[si];
      if (!list.length) return;
      const T = sp.c ? k.genConifer(sp.seed, sp.P) : k.genBroad(sp.seed, sp.P);
      const bark = new THREE.InstancedMesh((this.low ? T.b1 : T.b0).geo(false), k.barkMats[sp.bark], list.length);
      const leafLod = this.low && !sp.c ? sp.leaf + 1 : sp.leaf;
      const leaves = new THREE.InstancedMesh((this.low ? T.l1 : T.l0).geo(true), k.leafMats[leafLod], list.length);
      leaves.customDepthMaterial = k.depthMats[leafLod];
      list.forEach((t, i) => {
        const g = terrainHeight(t.x, t.z);
        dummy.position.set(t.x, g - 0.2, t.z);
        dummy.rotation.set(0, rng() * Math.PI * 2, 0);
        dummy.scale.setScalar(sp.s[0] + rng() * (sp.s[1] - sp.s[0]));
        dummy.updateMatrix();
        bark.setMatrixAt(i, dummy.matrix);
        leaves.setMatrixAt(i, dummy.matrix);
        if (si !== 3) BOXES.push({ x0: t.x - 0.3, x1: t.x + 0.3, z0: t.z - 0.3, z1: t.z + 0.3, y0: g - 0.5, top: g + 2.6, kind: "solid", id: "tree" });
        else BOXES.push({ x0: t.x - 0.7, x1: t.x + 0.7, z0: t.z - 0.7, z1: t.z + 0.7, y0: g + 0.15, top: g + 1.05, kind: "cover", id: "bush" });
      });
      bark.castShadow = leaves.castShadow = true;
      bark.receiveShadow = leaves.receiveShadow = true;
      this.scene.add(bark, leaves);
    });
    rebuildNav();
  }

  private addLamp(p: THREE.Vector3, power: number, radius: number, grid: boolean, warm = true, post = true) {
    const k = this.kit;
    let head: THREE.MeshStandardMaterial | null = null;
    if (post) {
      const gy = groundAt(p.x, p.z).y;
      this.mesh(new THREE.CylinderGeometry(0.06, 0.09, p.y - gy + 0.3, 8), k.iron, p.x, (p.y + gy) / 2 + 0.15, p.z);
      head = new THREE.MeshStandardMaterial({ color: 0, emissive: warm ? 0xffb066 : 0xfff1d6, emissiveIntensity: 6 });
      this.mesh(new THREE.SphereGeometry(0.13, 10, 8), head, p.x, p.y, p.z).castShadow = false;
      this.mesh(new THREE.ConeGeometry(0.32, 0.18, 12, 1, true), k.iron, p.x, p.y + 0.14, p.z).castShadow = false;
    }
    const glow = makeGlowSprite(warm ? 0xffb066 : 0xfff0d0, 1.5, 1.3);
    glow.position.copy(p);
    const haze = makeGlowSprite(warm ? 0xff8a3a : 0xffe2a8, 0.22, 8);
    haze.position.copy(p);
    this.scene.add(glow, haze);
    this.lamps.push({ pos: p.clone(), radius, power, grid, glow, haze, head, flicker: new Flicker(grid ? 0.25 : 0.8, grid ? 0.15 : 0.35), warm, on: true });
  }

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0x0b1a2c, 0.5));
    this.scene.add(new THREE.HemisphereLight(0x2a4d78, 0x07080a, 0.6));
    const moon = new THREE.DirectionalLight(0x9dbdff, 1.2);
    moon.castShadow = true;
    const s = this.low ? 1024 : 2048;
    moon.shadow.mapSize.set(s, s);
    const cam = moon.shadow.camera;
    cam.left = cam.bottom = -34;
    cam.right = cam.top = 34;
    cam.near = 1;
    cam.far = 170;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.04;
    this.scene.add(moon, moon.target);
    this.moon = moon;
    const y = COMPOUND_Y;
    // compound grid lamps (all fed by the generator)
    for (const [x, z] of [[-4.6, -24.6], [4.6, -24.6], [-12, -40], [12, -40], [-12, -70], [12, -70], [-2, -74.6], [24, -75.9], [14, -34.9], [31, -63]] as const) this.addLamp(new THREE.Vector3(x, y + 3.6, z), 22, 15, true, false, !(x === 24 || x === -2 || x === 14));
    // village and mill (oil lamps)
    this.addLamp(new THREE.Vector3(-2.6, terrainHeight(-2.6, 53) + 2.4, 53.1), 9, 9, false, true, false);
    this.addLamp(new THREE.Vector3(8.5, terrainHeight(8.5, 57.4) + 3, 57.4), 12, 12, false);
    this.addLamp(new THREE.Vector3(24, terrainHeight(24, 66.6) + 2.3, 66.6), 7, 8, false, true, false);
    this.addLamp(new THREE.Vector3(CHECKPOINT.x + 3, terrainHeight(CHECKPOINT.x + 3, CHECKPOINT.z) + 2.8, CHECKPOINT.z + 1), 14, 12, false);
    this.addLamp(new THREE.Vector3(TABLE.x, terrainHeight(TABLE.x, TABLE.z) + 1.05, TABLE.z), 5, 6, false, true, false);
    this.addLamp(new THREE.Vector3(CEMETERY.x - 1.5, terrainHeight(CEMETERY.x, CEMETERY.z) + 0.4, CEMETERY.z + 0.3), 2.5, 3.5, false, true, false);
    const n = this.low ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffa858, 0, 15, 2);
      this.scene.add(l);
      this.pool.push(l);
    }
  }

  private buildPeople() {
    const at = (g: THREE.Group, x: number, z: number, yaw: number) => {
      g.position.set(x, groundAt(x, z).y, z);
      g.rotation.y = yaw;
      g.traverse((c) => (c.castShadow = true));
      this.scene.add(g);
      return g;
    };
    this.npc.messaoud = at(makeAmmar(), MESSAOUD.x, MESSAOUD.z, Math.PI * 0.2);
    this.npc.rabah = at(makeAmmar(), RABAH_DOOR.x, RABAH_DOOR.z, Math.PI / 2);
    this.npc.lakhdar = at(makeAmmar(), LAKHDAR.x, LAKHDAR.z, Math.PI * 0.75);
    this.npc.said = at(makeAmmar(), TABLE.x + 1.4, TABLE.z + 0.6, -Math.PI / 2);
    this.npc.rabah.scale.setScalar(1.04);
    this.npc.said.scale.setScalar(0.95);
    const z = makeZahra(); // a woman of the network keeps watch at the mill door
    at(z, MILL.x + 4.4, MILL.z - 2.6, Math.PI);
    for (const [id, g] of [["rabah", this.npc.rabah], ["said", this.npc.said]] as const) {
      this.allies.push({ id, group: g, pos: g.position.clone(), fireCd: 2, active: false, covering: false });
    }
  }

  private buildViewmodel() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.85 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 0.65 });
    const hand = new THREE.MeshStandardMaterial({ color: 0x5a4434, roughness: 0.9 });
    this.pistolMesh = new THREE.Group();
    this.pistolMesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.2), steel));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.045), wood);
    grip.position.set(0, -0.06, 0.07);
    grip.rotation.x = 0.25;
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), hand);
    fist.position.set(0, -0.07, 0.08);
    fist.scale.set(1, 1.3, 1.1);
    this.pistolMesh.add(grip, fist);
    this.pistolMesh.position.set(0.17, -0.17, -0.38);
    this.rifleMesh = new THREE.Group();
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.75), wood);
    stock.position.z = 0.05;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.55);
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), steel);
    bolt.position.set(0.04, 0.04, 0.05);
    const f2 = fist.clone();
    f2.position.set(-0.02, -0.05, -0.25);
    const f3 = fist.clone();
    f3.position.set(0.01, -0.05, 0.2);
    this.rifleMesh.add(stock, barrel, bolt, f2, f3);
    this.rifleMesh.position.set(0.16, -0.2, -0.45);
    this.viewGroup.add(this.pistolMesh, this.rifleMesh);
    this.viewGroup.visible = false;
    this.viewGroup.traverse((o) => ((o as THREE.Mesh).renderOrder = 5));
    this.camera.add(this.viewGroup);
  }

  private buildFx() {
    this.flash = new THREE.PointLight(0xffc27a, 0, 14, 2);
    this.scene.add(this.flash);
    this.fireLight = new THREE.PointLight(0xff7a2a, 0, 26, 1.6);
    this.fireLight.position.set(DIVERSION_FIRE.x, terrainHeight(DIVERSION_FIRE.x, DIVERSION_FIRE.z) + 1.6, DIVERSION_FIRE.z);
    this.scene.add(this.fireLight);
    this.fireGroup.position.copy(this.fireLight.position).setY(this.fireLight.position.y - 1.4);
    for (let i = 0; i < 7; i++) {
      const s = makeGlowSprite(i % 2 ? 0xff6a1f : 0xffb347, 1.4, 1.6 + i * 0.35);
      s.position.set((Math.random() - 0.5) * 1.6, 0.4 + i * 0.32, (Math.random() - 0.5) * 1.6);
      this.fireGroup.add(s);
      this.fireSprites.push(s);
    }
    const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x3e3220, roughness: 1 }));
    hay.position.y = 0.45;
    this.fireGroup.add(hay);
    this.fireGroup.visible = false;
    this.scene.add(this.fireGroup);
    const mat = () => new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const m = mat();
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), m);
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0, mat: m });
    }
    for (let i = 0; i < 8; i++) {
      const s = makeGlowSprite(0xffc070, 2.2, 0.9);
      s.visible = false;
      this.scene.add(s);
      this.flashes.push({ s, life: 0 });
    }
  }

  // ======================= input =======================
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.code;
    if (e.repeat && k === "KeyE") return;
    this.keys.add(k);
    if (!this.active) return;
    if (k === "KeyE") this.interact();
    if (k === "KeyF") this.takedown();
    if (k === "KeyR") this.reload();
    if (k === "KeyG") this.signal();
    if (k === "Space") {
      this.jumpQueued = true;
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseMove = (e: MouseEvent) => {
    if (!this.active || this.isTouch) return;
    const s = this.binocActive() ? 0.0007 : 0.0021;
    this.yaw -= e.movementX * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * s, -1.45, 1.45);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.active || this.isTouch) return;
    if (e.button === 0) {
      this.mouseFire = true;
      this.fire();
    }
    if (e.button === 2) this.mouseBinoc = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseFire = false;
    if (e.button === 2) this.mouseBinoc = false;
  };
  private onContext = (e: Event) => e.preventDefault();
  private onLockChange = () => this.setActive(document.pointerLockElement === this.canvas);
  private onTouchStart = (e: TouchEvent) => {
    if (!this.active) return;
    for (const t of Array.from(e.changedTouches)) {
      if ((t.target as HTMLElement | null)?.closest?.("button")) continue;
      if (t.clientX < window.innerWidth / 2 && !this.moveTouch) this.moveTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      else if (!this.lookTouch) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  private onTouchMove = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (this.moveTouch && t.identifier === this.moveTouch.id) {
        this.touchMove.set((t.clientX - this.moveTouch.x) / 55, (t.clientY - this.moveTouch.y) / 55);
        if (this.touchMove.length() > 1) this.touchMove.normalize();
      } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
        const s = this.binocActive() ? 0.002 : 0.0055;
        this.yaw -= (t.clientX - this.lookTouch.x) * s;
        this.pitch = THREE.MathUtils.clamp(this.pitch - (t.clientY - this.lookTouch.y) * s, -1.4, 1.4);
        this.lookTouch.x = t.clientX;
        this.lookTouch.y = t.clientY;
      }
    }
  };
  private onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (this.moveTouch && t.identifier === this.moveTouch.id) {
        this.moveTouch = null;
        this.touchMove.set(0, 0);
      }
      if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
    }
  };
  private onResize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    this.fovBase = w < h ? 80 : 68;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.fx.setSize(w, h);
    if (this.overlay) {
      this.overlay.canvas.width = w;
      this.overlay.canvas.height = h;
    }
  };

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("contextmenu", this.onContext);
    document.addEventListener("pointerlockchange", this.onLockChange);
    window.addEventListener("touchstart", this.onTouchStart, { passive: true });
    window.addEventListener("touchmove", this.onTouchMove, { passive: true });
    window.addEventListener("touchend", this.onTouchEnd);
    window.addEventListener("touchcancel", this.onTouchEnd);
    window.addEventListener("resize", this.onResize);
  }

  private setActive(v: boolean) {
    if (this.active === v) return;
    this.active = v;
    if (!v) {
      this.keys.clear();
      this.moveTouch = this.lookTouch = null;
      this.touchMove.set(0, 0);
      this.mouseFire = this.mouseBinoc = false;
    }
    this.opts.onActiveChange?.(v);
  }

  enter() {
    if (this.isTouch) {
      this.setActive(true);
      return;
    }
    const req = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (req && typeof req.catch === "function") req.catch(() => this.setActive(true));
  }
  pause() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setActive(false);
  }
  setOverlay(c: HTMLCanvasElement | null) {
    this.overlay = c?.getContext("2d") ?? null;
    if (c) {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    }
  }
  setCrouchToggle(v: boolean) {
    this.crouchToggle = v;
  }
  setTouchButton(b: "fire" | "interact" | "binoc", down: boolean) {
    this.touchBtn[b] = down;
    if (down && b === "fire") this.fire();
    if (down && b === "interact") this.interact();
  }
  teleport(x: number, z: number, yaw?: number, pitch = 0) {
    this.pos.set(x, groundAt(x, z).y, z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = pitch;
  }

  // ======================= gameplay =======================
  private binocActive() {
    return this.game.binoculars && (this.keys.has("KeyB") || this.mouseBinoc || this.touchBtn.binoc) && this.active;
  }
  private panOf(p: THREE.Vector3) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const d = p.clone().sub(this.pos).normalize();
    return THREE.MathUtils.clamp(d.dot(right), -1, 1);
  }
  private chest(crouch: boolean) {
    return this.pos.clone().setY(this.pos.y + (crouch ? 0.8 : 1.3));
  }

  private computeStimulus(pl: { hs: number; crouch: boolean; run: boolean; surface: Surface }): Stimulus {
    const chest = this.chest(pl.crouch);
    let lit = false;
    for (const l of this.lamps) {
      if (!l.on) continue;
      const d = l.pos.distanceTo(chest);
      if (d < l.radius * 0.5 && lineClear(l.pos.x, l.pos.y, l.pos.z, chest.x, chest.y, chest.z, false)) {
        lit = true;
        break;
      }
    }
    if (!lit && this.garrison) {
      lit = this.garrison.inBeam(this.pos) || this.garrison.soldiers.some((s) => s.lantern && s.alive && s.pos.distanceTo(chest) < 4.5);
    }
    if (!lit && this.game.diversionStarted >= 0 && this.fireLight.position.distanceTo(chest) < 9) lit = true;
    const shadow = !lit && !lineClear(chest.x, chest.y, chest.z, chest.x + MOON_DIR.x * 40, chest.y + MOON_DIR.y * 40, chest.z + MOON_DIR.z * 40);
    this.visState = lit ? "lit" : shadow ? (pl.crouch ? "hidden" : "shadow") : pl.crouch ? "shadow" : "lit";
    let vis = lit ? 1.15 : shadow ? 0.3 : 0.62;
    vis *= pl.crouch ? 0.45 : pl.run ? 1.3 : 1;
    if (!lit && ouedDepth(this.pos.x, this.pos.z) > 1.4) vis *= 0.6;
    const moving = pl.hs > 0.3;
    const loud = pl.surface === "gravel";
    const noise = !moving ? 0 : pl.crouch ? 0 : loud ? (pl.run ? 13 : 5.5) : pl.run ? 6 : 0;
    return {
      player: chest, feet: this.pos.clone(), visibility: vis, concealed: pl.crouch && (shadow || this.visState === "hidden"),
      noise: Math.max(noise, this.noiseT > 0 ? 9 : 0), armed: this.game.armed, crouch: pl.crouch, moving, vis: this.visState,
    };
  }

  private saveCheckpoint(name: string, silent = false) {
    this.checkpoint = {
      x: this.pos.x, z: this.pos.z, yaw: this.yaw,
      game: JSON.stringify(this.game),
      garrison: this.garrison ? this.garrison.snapshot() : { alarm: 0, phoneCut: false, soldiers: [] },
      alarm: this.garrison?.alarm ?? 0,
    };
    if (!silent) this.opts.onCheckpoint?.(name);
  }

  private restoreCheckpoint() {
    const c = this.checkpoint!;
    const deaths = this.game.deaths, kills = this.game.kills, takedowns = this.game.takedowns;
    Object.assign(this.game, JSON.parse(c.game));
    Object.assign(this.game, { deaths, kills, takedowns, health: 100, hurtT: 99, reloading: 0, fireCd: 0, discoveryT: this.game.discoveryT > 0 ? 20 : this.game.discoveryT });
    if (c.garrison.soldiers.length) this.garrison.restore(c.garrison, c.alarm);
    this.opts.audio?.setSiren(this.garrison.alarm >= 2);
    this.applyWorldFlags();
    this.teleport(c.x, c.z, c.yaw);
  }

  /** world state that follows game flags (doors, wire, lamps, racks, allies) */
  private applyWorldFlags() {
    const g = this.game;
    for (const b of BOXES) {
      if (b.id === "wire") b.off = g.wireCut;
      if (b.id === "armory-door") b.off = g.doorOpen;
    }
    this.wireLines.visible = !g.wireCut;
    this.armoryDoor.rotation.y = g.doorOpen ? -1.9 : 0;
    for (const l of this.lamps) if (l.grid) l.on = !g.generatorOff;
    this.genLamp.emissiveIntensity = g.generatorOff ? 0 : 4;
    g.racks.forEach((t, i) => (this.rackRifles[i].visible = !t));
    this.garrison.zoneActive.village = !g.armed;
    this.fireGroup.visible = g.diversionStarted >= 0;
    this.placeAllies();
    rebuildNav();
  }

  private placeAllies() {
    const plan = this.game.plan;
    const set = (id: string, x: number, z: number, yaw: number, covering: boolean) => {
      const a = this.allies.find((q) => q.id === id)!;
      a.pos.set(x, groundAt(x, z).y, z);
      a.group.position.copy(a.pos);
      a.group.rotation.y = yaw;
      a.active = true;
      a.covering = covering;
    };
    this.garrison.coverAt = [];
    if (!plan || !this.game.armed) return;
    this.npc.lakhdar.visible = plan.entry !== "gate";
    const rab = plan.entry === "drain" ? [DRAIN.x - 9, DRAIN.z + 1.5] : plan.entry === "wire" ? [WIRE.x - 3, WIRE.z - 9] : [GATE.x - 7, GATE.z + 15];
    set("rabah", rab[0], rab[1], Math.atan2(DRAIN.x - rab[0], -55 - rab[1]), true);
    this.garrison.coverAt.push({ x: rab[0], z: rab[1], r: 16 });
    const said = plan.diversion === "fire" ? [DIVERSION_FIRE.x - 6, DIVERSION_FIRE.z + 6] : plan.diversion === "phone" ? [PHONE_POLE.x - 2, PHONE_POLE.z + 3] : [-64, -76];
    set("said", said[0], said[1], Math.PI, plan.diversion === "cover");
    if (plan.diversion === "cover") this.garrison.coverAt.push({ x: said[0], z: said[1], r: 22 });
    if (plan.entry === "gate") {
      this.npc.lakhdar.position.set(GATE.x + 7, groundAt(GATE.x + 7, GATE.z + 14).y, GATE.z + 14);
      this.npc.lakhdar.rotation.y = Math.PI;
      this.npc.lakhdar.visible = true;
      const l = this.allies.find((q) => q.id === "lakhdar");
      if (l) l.pos.copy(this.npc.lakhdar.position);
      else this.allies.push({ id: "lakhdar", group: this.npc.lakhdar, pos: this.npc.lakhdar.position.clone(), fireCd: 1, active: true, covering: true });
    }
  }

  private fail(reason: "caught" | "killed") {
    if (this.frozen) return;
    this.frozen = true;
    this.game.deaths++;
    this.failT = 2.8;
    this.opts.onCaught?.(reason);
  }

  private onAlarm(level: number, reason: string) {
    if (level === 3) {
      this.opts.onToast?.("وصلت شاحنة التعزيزات!", "Reinforcements have arrived!");
      this.opts.audio?.shot(70, 0);
      return;
    }
    if (level >= 2) {
      this.opts.audio?.setSiren(true);
      if (!this.game.sirenCause && reason !== "checkpoint") this.game.sirenCause = reason;
      if (this.game.stage === "infiltrate" || this.game.stage === "armory") this.game.alarmBeforeArmory = true;
      this.opts.onToast?.("صفّارة الإنذار! الثكنة استيقظت", "Siren! The barracks is awake");
      if (this.game.plan?.diversion === "phone") this.opts.onToast?.("الهاتف مقطوع — لا تعزيزات", "Phone line cut — no reinforcements");
    } else if (level === 1 && reason !== "checkpoint") this.opts.onToast?.("الجنود يبحثون…", "The soldiers are searching…");
  }

  private onEnemyShot(e: ShotEvent) {
    this.tracer(e.from, e.to, 0x9fd0ff);
    this.muzzle(e.from);
    const d = e.from.distanceTo(this.pos);
    this.opts.audio?.shot(d, this.panOf(e.from));
    if (e.hit && !this.frozen) {
      this.game.health -= e.dmg;
      this.game.hurtT = 0;
      this.opts.audio?.hurt();
      const ang = Math.atan2(e.from.x - this.pos.x, e.from.z - this.pos.z);
      this.opts.onDamage?.(ang - this.yaw);
      if (this.game.health <= 0) this.fail("killed");
    }
  }

  private tracer(a: THREE.Vector3, b: THREE.Vector3, color: number) {
    const t = this.tracers.find((q) => q.life <= 0) ?? this.tracers[0];
    const p = t.line.geometry.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, a.x, a.y, a.z);
    p.setXYZ(1, b.x, b.y, b.z);
    p.needsUpdate = true;
    t.line.geometry.computeBoundingSphere();
    t.mat.color.set(color);
    t.life = 0.07;
  }
  private muzzle(p: THREE.Vector3) {
    const f = this.flashes.find((q) => q.life <= 0) ?? this.flashes[0];
    f.s.position.copy(p);
    f.s.visible = true;
    f.life = 0.06;
    this.flash.position.copy(p);
    this.flash.intensity = 40;
  }

  /** E — instant interactions (hold ones are driven by the loop) */
  interact() {
    if (!this.active || this.frozen) return;
    const a = this.act;
    if (a && !a.hold && !a.blocked) a.run?.();
  }

  resolveMessaoud() {
    const g = this.game;
    g.stage = "to_mill";
    g.binoculars = true;
    this.frozen = false;
    this.opts.onToast?.("أخذت المنظار — اضغط B أو الزر الأيمن للمراقبة", "Binoculars taken — hold B / right mouse to observe & mark");
    this.saveCheckpoint("meet");
  }
  resolveRabah(correct: boolean) {
    this.game.passwordOk = correct;
    this.game.stage = "plan";
  }
  /** called when the planning board is confirmed */
  applyPlan(plan: Plan) {
    const g = this.game;
    g.plan = plan;
    g.stage = "infiltrate";
    g.armed = true;
    g.weapon = "pistol";
    g.ammo.pistol = { mag: 8, reserve: 16 };
    g.signal = plan.diversion === "fire" || plan.entry === "gate" ? "ready" : null;
    this.garrison.phoneCut = plan.diversion === "phone";
    this.frozen = false;
    this.applyWorldFlags();
    this.saveCheckpoint("plan");
  }
  endDialogue() {
    this.frozen = false;
  }

  taggedCount() {
    const comp = this.garrison.soldiers.filter((s) => s.def.zone === "compound" && s.role !== "sleeper" && s.role !== "reinforce");
    return { tagged: comp.filter((s) => s.tagged).length, total: comp.length };
  }

  mapState(): MapState {
    const obj = this.targetFor();
    return {
      player: { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
      soldiers: this.garrison.soldiers.filter((s) => s.tagged && s.state !== "inactive").map((s) => ({ x: s.pos.x, z: s.pos.z, yaw: s.yaw, state: s.state, role: s.role })),
      allies: this.allies.filter((a) => a.active).map((a) => ({ x: a.pos.x, z: a.pos.z })),
      beams: this.garrison.beams.filter((b) => b.on).map((b) => ({ x: b.target.x, z: b.target.z })),
      objective: obj ? { x: obj.x, z: obj.z } : null,
      wireCut: this.game.wireCut, doorOpen: this.game.doorOpen, generatorOff: this.game.generatorOff,
    };
  }

  takedown() {
    if (!this.game.armed || this.frozen) return;
    const crouch = this.crouchAmt > 0.5 || Math.hypot(this.vel.x, this.vel.z) < 1.5;
    const s = this.garrison.takedownTarget(this.pos, crouch);
    if (!s) return;
    this.garrison.damage(s, 999, false);
    this.game.takedowns++;
    this.opts.audio?.thud();
    this.noiseT = 0.4;
  }

  private reload() {
    const g = this.game;
    if (!g.weapon || g.reloading > 0) return;
    const a = g.ammo[g.weapon], W = WEAPONS[g.weapon];
    if (a.mag >= W.mag || a.reserve <= 0) return;
    g.reloading = W.reload;
    this.opts.audio?.reload();
  }

  private fire() {
    const g = this.game;
    if (!this.active || this.frozen || !g.weapon || g.reloading > 0 || g.fireCd > 0 || this.binocActive()) return;
    const W = WEAPONS[g.weapon], a = g.ammo[g.weapon];
    if (a.mag <= 0) {
      this.opts.audio?.click();
      this.reload();
      return;
    }
    a.mag--;
    g.fireCd = W.rate;
    this.recoil = g.weapon === "rifle" ? 0.06 : 0.035;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.6;
    const spread = W.spread * (moving ? 2.5 : 1) * (this.crouchAmt > 0.5 ? 0.6 : 1);
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread * 2;
    dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
    // nearest wall hit along the ray
    let wall = 120;
    for (let t = 0.5; t < 120; t += 0.5) {
      const p = origin.clone().addScaledVector(dir, t);
      if (p.y < terrainHeight(p.x, p.z) || !lineClear(origin.x, origin.y, origin.z, p.x, p.y, p.z, false)) {
        wall = t;
        break;
      }
    }
    const hit = this.garrison.rayHit(origin, dir, wall);
    const end = origin.clone().addScaledVector(dir, hit ? hit.t : wall);
    const muzzle = origin.clone().addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.12, 0));
    this.tracer(muzzle, end, 0xffd9a0);
    this.muzzle(muzzle);
    this.opts.audio?.shot(0, 0, g.weapon === "rifle");
    if (hit) {
      const killed = this.garrison.damage(hit.s, hit.head ? W.head : W.dmg, true);
      if (killed) {
        g.kills++;
        this.opts.onToast?.(hit.head ? "إصابة في الرأس" : "سقط", hit.head ? "Headshot" : "Down");
      }
    }
    this.garrison.loudNoise(this.pos, 55, true);
  }

  private signal() {
    const g = this.game;
    if (g.signal !== "ready" || !g.plan || this.frozen) return;
    g.signal = "used";
    this.opts.audio?.signal();
    window.setTimeout(() => {
      if (this.disposed) return;
      if (g.plan?.diversion === "fire") {
        g.diversionStarted = g.elapsed;
        this.fireGroup.visible = true;
        this.garrison.startDiversion(75);
        this.opts.audio?.setFire(0.5);
        this.opts.onToast?.("سعيد أشعل النار عند الطريق — الحرّاس يتحرّكون", "Saïd lit the fire by the road — the guards are moving");
      }
      if (g.plan?.entry === "gate") {
        g.assaultT = 0;
        this.opts.onToast?.("الهجوم على الباب! ادخل الآن", "The gate assault begins — go in now!");
        this.garrison.raise(2, "assault", new THREE.Vector3(GATE.x, COMPOUND_Y, GATE.z + 4));
      }
    }, 2200);
  }

  private targetFor(): { x: number; z: number } | null {
    const g = this.game;
    switch (g.stage) {
      case "escape": return CEMETERY;
      case "meet": return MESSAOUD;
      case "to_mill": return RABAH_DOOR;
      case "plan": return TABLE;
      case "infiltrate":
        if (!g.inside) {
          const e = g.plan?.entry;
          return e === "drain" ? DRAIN : e === "wire" ? { x: WIRE.x, z: WIRE.z - 1 } : GATE;
        }
        return ARMORY_DOOR;
      case "armory": {
        const i = g.racks.findIndex((t) => !t);
        return i >= 0 ? { x: RACKS[i][0], z: RACKS[i][1] + 1 } : ARMORY_DOOR;
      }
      case "exfil": return RALLY;
      default: return null;
    }
  }

  private findAct(): Act | null {
    const g = this.game, p = this.pos;
    const near = (x: number, z: number, r = 2) => Math.hypot(p.x - x, p.z - z) < r;
    if (g.stage === "meet" && near(MESSAOUD.x, MESSAOUD.z, 2.4))
      return { id: "messaoud", ar: "تحدّث مع مسعود", en: "Talk to Messaoud", x: MESSAOUD.x, z: MESSAOUD.z, run: () => this.talk("messaoud") };
    if (g.stage === "to_mill" && near(RABAH_DOOR.x, RABAH_DOOR.z, 2.6))
      return { id: "rabah", ar: "اقترب من الحارس", en: "Approach the sentry", x: RABAH_DOOR.x, z: RABAH_DOOR.z, run: () => this.talk("rabah") };
    if (!g.armed) return null;
    if (!g.wireCut && near(WIRE.x, WIRE.z + (p.z < WIRE.z ? -0.8 : 0.8), 2.2)) {
      if (g.plan?.entry !== "wire") return { id: "wire", ar: "تحتاج مقصّ أسلاك", en: "You need wire cutters", x: WIRE.x, z: WIRE.z, blocked: true };
      return { id: "wire", ar: "اقطع السلك", en: "Cut the wire", hold: 4, x: WIRE.x, z: WIRE.z, run: () => {
        g.wireCut = true;
        this.applyWorldFlags();
      } };
    }
    if (!g.generatorOff && near(GENERATOR.x, GENERATOR.z + 0.4, 2.2))
      return { id: "gen", ar: "عطّل المولّد", en: "Sabotage the generator", hold: 3, noise: 4, x: GENERATOR.x, z: GENERATOR.z, run: () => {
        g.generatorOff = true;
        this.applyWorldFlags();
        this.opts.onToast?.("انطفأت أضواء الثكنة", "The barracks lights are out");
        this.garrison.raise(1, "power", undefined);
      } };
    const off = this.garrison.get("officer");
    if (!g.hasKey && near(off.pos.x, off.pos.z, 1.8) && (off.state === "down" || (off.dozing && off.suspicion < 0.4 && off.state === "calm")))
      return { id: "key", ar: off.state === "down" ? "خذ المفتاح" : "اسرق المفتاح من حزامه", en: off.state === "down" ? "Take the key" : "Lift the key from his belt", x: off.pos.x, z: off.pos.z, run: () => {
        g.hasKey = true;
        off.keyTaken = true;
        this.opts.onToast?.("مفتاح مخزن السلاح معك", "You have the armory key");
      } };
    if (!g.doorOpen && near(ARMORY_DOOR.x, ARMORY_DOOR.z + 0.6, 1.9)) {
      if (g.hasKey) return { id: "door", ar: "افتح بالمفتاح", en: "Unlock the door", x: ARMORY_DOOR.x, z: ARMORY_DOOR.z, run: () => this.openArmory() };
      return { id: "door", ar: "اكسر القفل (يُحدث ضجيجاً)", en: "Force the lock (noisy)", hold: 6, noise: 10, x: ARMORY_DOOR.x, z: ARMORY_DOOR.z, run: () => this.openArmory() };
    }
    if (g.doorOpen) {
      for (let i = 0; i < RACKS.length; i++) {
        if (g.racks[i]) continue;
        if (near(RACKS[i][0], RACKS[i][1] + 0.8, 1.3))
          return { id: `rack${i}`, ar: "خذ البنادق", en: "Take the rifles", hold: 2, x: RACKS[i][0], z: RACKS[i][1], run: () => this.takeRack(i) };
      }
    }
    return null;
  }

  private talk(who: Who) {
    this.frozen = true;
    this.vel.set(0, 0, 0);
    this.opts.onDialogue?.(who);
  }

  private openArmory() {
    this.game.doorOpen = true;
    this.applyWorldFlags();
    if (this.game.stage === "infiltrate") this.game.stage = "armory";
  }

  private takeRack(i: number) {
    const g = this.game;
    g.racks[i] = true;
    g.rifles += 4;
    this.rackRifles[i].visible = false;
    if (g.weapon !== "rifle") {
      g.weapon = "rifle";
      g.ammo.rifle = { mag: 5, reserve: 20 };
      this.opts.onToast?.("بندقية MAS-36 في يدك", "MAS-36 rifle in hand");
    } else g.ammo.rifle.reserve += 10;
    if (g.stage !== "exfil") {
      g.stage = "exfil";
      this.saveCheckpoint("armory");
    }
  }

  private updateGame(dt: number, pl: { hs: number; crouch: boolean; run: boolean; surface: Surface }, sim: boolean) {
    const g = this.game;
    if (this.failT > 0) {
      this.failT -= dt;
      if (this.failT <= 0) {
        this.restoreCheckpoint();
        this.frozen = false;
      }
    }
    if (!sim) return;
    g.elapsed += dt;
    this.noiseT -= dt;
    if (g.fireCd > 0) g.fireCd -= dt;
    if (g.reloading > 0) {
      g.reloading -= dt;
      if (g.reloading <= 0 && g.weapon) {
        const a = g.ammo[g.weapon], need = WEAPONS[g.weapon].mag - a.mag, take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
    g.hurtT += dt;
    if (g.hurtT > 5 && g.health < 100) g.health = Math.min(100, g.health + dt * 9);

    this.stim = this.computeStimulus(pl);
    this.garrison.update(dt, this.stim);

    // stage triggers
    if (g.stage === "escape" && Math.hypot(this.pos.x - CEMETERY.x, this.pos.z - CEMETERY.z) < 8) g.stage = "meet";
    if (g.armed && !g.inside && insideCompound(this.pos.x, this.pos.z, -0.6)) {
      g.inside = true;
      this.saveCheckpoint("inside");
    }
    if (g.stage === "exfil" && g.discoveryT < 0 && Math.hypot(this.pos.x - ARMORY.x, this.pos.z - ARMORY.z) > 7) g.discoveryT = 25;
    if (g.discoveryT > 0) {
      g.discoveryT -= dt;
      if (g.discoveryT <= 0 && this.garrison.alarm < 2) {
        this.opts.onToast?.("الرقيب اكتشف المخزن الفارغ!", "The sergeant found the empty armory!");
        this.garrison.raise(2, "armory", new THREE.Vector3(ARMORY.x, COMPOUND_Y, ARMORY.z));
      }
    }
    if (g.stage === "exfil" && Math.hypot(this.pos.x - RALLY.x, this.pos.z - RALLY.z) < 7) this.finish();

    // gate assault: the cell takes the sentries first
    if (g.assaultT >= 0) {
      g.assaultT += dt;
      for (const [id, t] of [["gate1", 1.2], ["gate2", 2.6]] as const) {
        const s = this.garrison.get(id);
        if (s.alive && g.assaultT > t) {
          const ally = this.allies.find((a) => a.active) ?? this.allies[0];
          this.allyShoot(ally, s, true);
        }
      }
    }
    // allies give covering fire once the shooting starts
    if (this.garrison.alarm >= 2 || g.assaultT >= 0) {
      for (const a of this.allies) {
        if (!a.active) continue;
        a.fireCd -= dt;
        if (a.fireCd > 0) continue;
        a.fireCd = 2 + Math.random() * 1.5;
        const eye = a.pos.clone().setY(a.pos.y + 1.4);
        let best: Soldier | null = null, bd = a.covering ? 38 : 28;
        for (const s of this.garrison.soldiers) {
          if (!s.alive || (s.state !== "hunt" && s.state !== "alert" && s.state !== "search")) continue;
          const d = s.pos.distanceTo(a.pos);
          if (d < bd && lineClear(eye.x, eye.y, eye.z, s.pos.x, s.pos.y + 1.3, s.pos.z)) {
            best = s;
            bd = d;
          }
        }
        if (best) this.allyShoot(a, best, Math.random() < 0.32);
      }
    }
    // diversion fire
    if (g.diversionStarted >= 0) {
      const v = this.fireFlicker.update(g.elapsed, dt);
      this.fireLight.intensity = 60 * v;
      this.fireSprites.forEach((s, i) => {
        s.position.y = 0.4 + ((i * 0.32 + g.elapsed * 0.8) % 2.2);
        (s.material as THREE.SpriteMaterial).opacity = v * (1 - s.position.y / 2.8);
      });
      this.opts.audio?.setFire(Math.max(0.05, 1 - this.pos.distanceTo(this.fireLight.position) / 60));
    }
    this.glow += ((this.garrison.alarm >= 2 ? 1 : 0) - this.glow) * dt * 0.3;

    // interaction & holds
    this.act = this.findAct();
    const a = this.act;
    const holding = this.keys.has("KeyE") || this.touchBtn.interact;
    if (a && a.hold && !a.blocked && holding) {
      if (this.hold.id !== a.id) this.hold = { id: a.id, t: 0 };
      this.hold.t += dt;
      if (a.noise && Math.floor(this.hold.t / 0.6) !== Math.floor((this.hold.t - dt) / 0.6)) {
        this.noiseT = 0.35;
        if (a.id === "door") this.opts.audio?.scrape();
        if (a.id === "wire") this.opts.audio?.snip();
      }
      if (a.id === "wire" && Math.floor(this.hold.t / 0.8) !== Math.floor((this.hold.t - dt) / 0.8)) this.opts.audio?.snip();
      if (this.hold.t >= a.hold) {
        this.hold = { id: "", t: 0 };
        a.run?.();
      }
    } else this.hold = { id: "", t: 0 };
    if (this.noiseT > 0 && a?.noise) this.stim.noise = Math.max(this.stim.noise, a.noise);

    // binocular marking
    if (this.binocActive()) {
      const origin = this.camera.getWorldPosition(new THREE.Vector3());
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      let best: Soldier | null = null, ba = 0.035;
      for (const s of this.garrison.soldiers) {
        if (s.tagged || !s.alive || !this.garrison.zoneActive[s.def.zone] || s.def.zone !== "compound") continue;
        const c = s.pos.clone().setY(s.pos.y + 1.1).sub(origin);
        const d = c.length();
        if (d > 130) continue;
        const ang = c.normalize().angleTo(dir);
        if (ang < ba && lineClear(origin.x, origin.y, origin.z, s.pos.x, s.pos.y + 1.2, s.pos.z)) {
          best = s;
          ba = ang;
        }
      }
      if (best !== this.tagTarget) this.tagProgress = 0;
      this.tagTarget = best;
      if (best) {
        this.tagProgress += dt / 0.7;
        if (this.tagProgress >= 1) {
          best.tagged = true;
          this.tagProgress = 0;
          this.opts.audio?.click();
        }
      }
    } else {
      this.tagTarget = null;
      this.tagProgress = 0;
    }
    this.crawlHint = BOXES.some((b) => b.kind === "crawl" && Math.hypot(this.pos.x - (b.x0 + b.x1) / 2, this.pos.z - (b.z0 + b.z1) / 2) < 2.2);
  }

  private allyShoot(a: Ally, s: Soldier, kill: boolean) {
    const from = a.pos.clone().setY(a.pos.y + 1.35);
    const to = s.pos.clone().setY(s.pos.y + 1.2);
    if (!kill) to.add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
    this.tracer(from, to, 0xffd9a0);
    this.muzzle(from);
    this.opts.audio?.shot(from.distanceTo(this.pos), this.panOf(from));
    if (kill) this.garrison.damage(s, 999, true);
    else if (s.state === "hunt" || s.state === "search") {
      // they turn on whoever is shooting at them
      this.garrison.lastKnown.copy(a.pos);
      this.garrison.lastKnownAge = Math.min(this.garrison.lastKnownAge, 5);
    }
  }

  private finish() {
    const g = this.game;
    g.stage = "ended";
    this.frozen = true;
    const t = this.taggedCount();
    this.opts.audio?.setSiren(false);
    this.opts.onEnding?.({
      // ghost: the only siren was the scripted discovery of the empty armory, and nobody died
      ghost: (g.sirenCause === null || g.sirenCause === "armory") && g.kills === 0, rifles: g.rifles, kills: g.kills, takedowns: g.takedowns, deaths: g.deaths,
      tagged: t.tagged, tagTotal: t.total, clock: this.clockString(), plan: g.plan, alarmBeforeArmory: g.alarmBeforeArmory, passwordOk: g.passwordOk,
    });
    this.pause();
  }

  clockString() {
    const m = Math.floor(START_MIN + this.game.elapsed / SEC_PER_MIN);
    return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  private hud(): HudState {
    const g = this.game, t = this.taggedCount();
    let [objAr, objEn] = OBJ[g.stage];
    let subAr: string | undefined, subEn: string | undefined;
    switch (g.stage) {
      case "escape":
        subAr = "المخبر يراقب الباب، والدورية تمرّ في الزقاق الخلفي. الظل والانحناء يخفيانك.";
        subEn = "The informer watches the door; a patrol walks the back lane.";
        break;
      case "to_mill":
        subAr = t.tagged ? `علّمت ${t.tagged}/${t.total} من الحرّاس` : "اختياري: راقب الثكنة من كاف الغراب بالمنظار (B) وعلّم الحرّاس";
        subEn = t.tagged ? `Marked ${t.tagged}/${t.total} guards` : "Optional: watch the barracks from Crow's Kef with binoculars (B) and mark guards";
        break;
      case "infiltrate": {
        const e = g.plan?.entry;
        if (!g.inside) {
          subAr = e === "drain" ? "ازحف منحنياً (C) عبر قناة الصرف تحت السياج الغربي" : e === "wire" ? "اقطع السلك الشمالي خلف المخزن (امسك E)" : g.assaultT >= 0 ? "ادخل من الباب وسط الاشتباك" : "اضغط G لإعطاء إشارة الهجوم على الباب";
          subEn = e === "drain" ? "Crawl (C) through the drain under the west fence" : e === "wire" ? "Cut the north wire behind the armory (hold E)" : g.assaultT >= 0 ? "Go through the gate in the firefight" : "Press G to signal the gate assault";
        } else if (!g.hasKey) {
          subAr = "مفتاح المخزن مع الضابط النائم أمام غرفة الحرس — أو اكسر القفل";
          subEn = "The officer dozing outside the guardroom has the key — or force the lock";
        } else {
          subAr = "المفتاح معك";
          subEn = "You have the key";
        }
        if (g.signal === "ready" && g.plan?.diversion === "fire") {
          subAr += " · G: إشارة سعيد لإشعال النار";
          subEn += " · G: signal Saïd's fire";
        }
        break;
      }
      case "exfil":
        subAr = g.rifles < 12 && Math.hypot(this.pos.x - ARMORY.x, this.pos.z - ARMORY.z) < 7 ? `معك ${g.rifles} بندقية — خذ المزيد أو انسحب` : "اتبع الوادي شمالاً-غرباً إلى الجبل";
        subEn = g.rifles < 12 && Math.hypot(this.pos.x - ARMORY.x, this.pos.z - ARMORY.z) < 7 ? `${g.rifles} rifles — take more or pull out` : "Follow the oued north-west into the mountains";
        if (g.discoveryT > 0 && this.garrison.alarm < 2) {
          subAr += ` · سيُكتشف المخزن بعد ${Math.ceil(g.discoveryT)} ث`;
          subEn += ` · discovery in ${Math.ceil(g.discoveryT)}s`;
        }
        break;
      case "plan":
        objAr = OBJ.plan[0];
        objEn = OBJ.plan[1];
        break;
    }
    const a = this.act;
    const W = g.weapon ? WEAPONS[g.weapon] : null;
    const tk = g.armed && !this.frozen ? this.garrison.takedownTarget(this.pos, this.crouchAmt > 0.5 || Math.hypot(this.vel.x, this.vel.z) < 1.5) : null;
    return {
      clock: this.clockString(), stage: g.stage, objAr, objEn, subAr, subEn,
      suspicion: this.garrison.maxSuspicion(), shout: this.garrison.shoutProgress(), visibility: this.visState,
      prompt: a ? { ar: a.ar, en: a.en, hold: !!a.hold, blocked: a.blocked } : null,
      hold: a?.hold && this.hold.id === a.id ? this.hold.t / a.hold : 0,
      health: Math.max(0, g.health),
      weapon: W && g.weapon ? { name: `${W.ar} · ${W.en}`, mag: g.ammo[g.weapon].mag, reserve: g.ammo[g.weapon].reserve, reloading: g.reloading > 0 } : null,
      alarm: this.garrison.alarm, reinforceIn: this.garrison.reinforceIn > 0 ? Math.ceil(this.garrison.reinforceIn) : -1,
      tagged: t.tagged, tagTotal: t.total, tagProgress: this.tagProgress, binoculars: this.binocActive(), hasBinoculars: g.binoculars,
      rifles: g.rifles, hasKey: g.hasKey, generatorOff: g.generatorOff, signal: g.signal, takedown: !!tk, crawl: this.crawlHint,
    };
  }

  // ======================= player =======================
  private blockedAt(x: number, z: number, crouch: boolean) {
    if (x < MAP.minX || x > MAP.maxX || z < MAP.minZ || z > MAP.maxZ) return true;
    const foot = this.pos.y;
    if (solidAt(x, z, foot, crouch, RADIUS)) return true;
    return groundAt(x, z, foot).y > foot + (this.onGround ? 0.55 : 0.35);
  }

  private updatePlayer(dt: number) {
    const k = this.keys;
    let f = 0, s = 0;
    if (this.active && !this.frozen) {
      if (k.has("KeyW") || k.has("ArrowUp")) f += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) f -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) s += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) s -= 1;
      f -= this.touchMove.y;
      s += this.touchMove.x;
    }
    let crouch = this.active && (this.crouchToggle || k.has("KeyC") || k.has("ControlLeft") || k.has("ControlRight"));
    // can't stand up inside the drain
    if (!crouch && solidAt(this.pos.x, this.pos.z, this.pos.y, false, RADIUS) && !solidAt(this.pos.x, this.pos.z, this.pos.y, true, RADIUS)) crouch = true;
    const run = this.active && (k.has("ShiftLeft") || k.has("ShiftRight")) && !crouch;
    this.crouchAmt += ((crouch ? 1 : 0) - this.crouchAmt) * (1 - Math.exp(-dt * 9));
    const load = this.game.rifles > 0 ? 0.9 : 1;
    const speed = (crouch ? 1.4 : run ? 5.4 : 2.7) * load * (this.binocActive() ? 0.4 : 1);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    this.vel.lerp(wish, 1 - Math.exp(-dt * (this.onGround ? 10 : 2)));
    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    if (!this.blockedAt(this.pos.x + dx, this.pos.z, crouch)) this.pos.x += dx;
    else this.vel.x = 0;
    if (!this.blockedAt(this.pos.x, this.pos.z + dz, crouch)) this.pos.z += dz;
    else this.vel.z = 0;
    const ground = groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.jumpQueued && this.onGround && this.active && !crouch) this.velY = 4.4;
    this.jumpQueued = false;
    this.velY -= 14 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= ground.y || (this.velY <= 0 && this.pos.y - ground.y < 0.3 && this.onGround)) {
      if (!this.onGround && this.velY < -3) this.opts.onStep?.(ground.surface, 1.2);
      this.pos.y = ground.y;
      this.velY = 0;
      this.onGround = true;
    } else this.onGround = false;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.2) {
      this.stepPhase += dt * hs * (run ? 1.9 : 2.3);
      const step = Math.floor(this.stepPhase / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.opts.onStep?.(ground.surface, crouch ? 0.35 : run ? 1.3 : 0.8);
      }
    }
    return { hs, crouch, run, surface: ground.surface };
  }

  // ======================= frame =======================
  private drawOverlay() {
    const c = this.overlay;
    if (!c) return;
    const W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    if (!this.active && this.game.stage !== "ended") return;
    const v = new THREE.Vector3();
    const project = (x: number, y: number, z: number) => {
      v.set(x, y, z).project(this.camera);
      if (v.z > 1) return null;
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: false };
    };
    // marked soldiers (seen through walls)
    for (const s of this.garrison.soldiers) {
      if (!s.tagged || s.state === "inactive" || !this.garrison.zoneActive[s.def.zone]) continue;
      const p = project(s.pos.x, s.pos.y + 2.15, s.pos.z);
      if (!p) continue;
      const d = s.pos.distanceTo(this.pos);
      const a = THREE.MathUtils.clamp(1.2 - d / 120, 0.35, 1);
      if (s.state === "down") {
        c.fillStyle = `rgba(160,160,160,${a * 0.6})`;
        c.font = "12px system-ui";
        c.fillText("✕", p.x - 4, p.y + 4);
        continue;
      }
      const hot = s.state === "alert" || s.state === "hunt";
      const warm = s.suspicion > 0.3 || s.state === "investigate" || s.state === "search";
      c.save();
      c.translate(p.x, p.y);
      c.globalAlpha = a;
      c.fillStyle = hot ? "#ff4a3d" : warm ? "#ffc14a" : "#e9e2cf";
      c.beginPath();
      c.moveTo(0, 6);
      c.lineTo(-5, -3);
      c.lineTo(5, -3);
      c.closePath();
      c.fill();
      if (!hot && s.suspicion > 0.02) {
        c.strokeStyle = "#ffc14a";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(0, 0, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.suspicion));
        c.stroke();
      }
      if (s.shout >= 0) {
        c.fillStyle = "#ff4a3d";
        c.font = "bold 14px system-ui";
        c.fillText("!", -2, -10);
      }
      c.restore();
    }
    // tag reticle in binoculars
    if (this.tagTarget) {
      const s = this.tagTarget, p = project(s.pos.x, s.pos.y + 1.0, s.pos.z);
      if (p) {
        c.strokeStyle = "rgba(255,220,150,0.9)";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(p.x, p.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.tagProgress);
        c.stroke();
      }
    }
    // allies
    for (const a of this.allies) {
      if (!a.active) continue;
      const p = project(a.pos.x, a.pos.y + 2.1, a.pos.z);
      if (!p) continue;
      c.fillStyle = "rgba(140,230,170,0.85)";
      c.beginPath();
      c.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    // objective diamond
    const o = this.targetFor();
    if (o && !this.frozen) {
      const gy = groundAt(o.x, o.z).y + 1.6;
      v.set(o.x, gy, o.z).project(this.camera);
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (v.z > 1) {
        x = W - x;
        y = H - 40;
      }
      x = THREE.MathUtils.clamp(x, 30, W - 30);
      y = THREE.MathUtils.clamp(y, 40, H - 40);
      const d = Math.hypot(o.x - this.pos.x, o.z - this.pos.z);
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      c.strokeStyle = "rgba(255,225,170,0.85)";
      c.fillStyle = "rgba(255,210,140,0.18)";
      c.lineWidth = 1.2;
      c.fillRect(-6, -6, 12, 12);
      c.strokeRect(-6, -6, 12, 12);
      c.restore();
      c.fillStyle = "rgba(255,235,200,0.75)";
      c.font = "10px system-ui";
      c.textAlign = "center";
      c.fillText(`${Math.round(d)} m`, x, y + 20);
      c.textAlign = "left";
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const sim = this.active && !this.frozen;
    const pl = sim ? this.updatePlayer(dt) : { hs: 0, crouch: this.crouchAmt > 0.5, run: false, surface: "dirt" as Surface };
    this.updateGame(dt, pl, sim);
    this.green.UT.value = t;
    this.grassTimer -= dt;
    if (this.grassTimer <= 0) {
      this.grassTimer = 0.25;
      this.updateGrass(2);
    }
    // camera
    const hs = pl.hs;
    const bobAmp = Math.min(hs / 5, 1) * (1 - this.crouchAmt * 0.5);
    const eye = THREE.MathUtils.lerp(EYE_STAND, EYE_CROUCH, this.crouchAmt);
    this.recoil *= Math.exp(-dt * 12);
    this.camera.position.set(this.pos.x + Math.cos(this.stepPhase) * 0.03 * bobAmp, this.pos.y + eye + Math.abs(Math.sin(this.stepPhase)) * 0.06 * bobAmp + Math.sin(t * 1.1) * 0.012, this.pos.z);
    this.camera.rotation.set(this.pitch + this.recoil + Math.sin(t * 0.7) * 0.003, this.yaw + Math.sin(t * 0.43) * 0.003, Math.cos(this.stepPhase) * 0.006 * bobAmp, "YXZ");
    const binoc = this.binocActive();
    const fov = binoc ? 18 : this.fovBase;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 10));
      this.camera.updateProjectionMatrix();
    }
    // viewmodel
    const g = this.game;
    this.viewGroup.visible = !!g.weapon && !binoc && !this.frozen;
    this.pistolMesh.visible = g.weapon === "pistol";
    this.rifleMesh.visible = g.weapon === "rifle";
    const rl = g.reloading > 0 ? Math.sin(Math.min(1, g.reloading) * Math.PI) * 0.25 : 0;
    this.viewGroup.position.set(Math.cos(this.stepPhase) * 0.008 * bobAmp, -Math.abs(Math.sin(this.stepPhase)) * 0.01 * bobAmp - rl * 0.3, this.recoil * 0.8);
    this.viewGroup.rotation.set(this.recoil * 2 - rl, 0, rl * 0.6);

    this.moon.position.copy(this.pos).addScaledVector(MOON_DIR, 80);
    this.moon.target.position.copy(this.pos);
    this.skyGroup.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.skyMat.uniforms.uTime.value = t;
    this.skyMat.uniforms.uGlow.value = this.glow * 0.6;

    // lamp light pool: real lights go to the nearest switched-on lamps
    this.poolTimer -= dt;
    if (this.poolTimer <= 0) {
      this.poolTimer = 0.3;
      const on = this.lamps.filter((l) => l.on).sort((a, b) => a.pos.distanceToSquared(this.pos) - b.pos.distanceToSquared(this.pos));
      this.pool.forEach((p, i) => {
        const l = on[i];
        p.userData.lamp = l ?? null;
        if (l) {
          p.position.copy(l.pos);
          p.distance = l.radius;
          p.color.set(l.warm ? 0xffa858 : 0xffe2b8);
        } else p.intensity = 0;
      });
    }
    for (const l of this.lamps) {
      const v = l.on ? l.flicker.update(t, dt) : 0;
      (l.glow.material as THREE.SpriteMaterial).opacity = v;
      (l.haze.material as THREE.SpriteMaterial).opacity = v * 0.8;
      if (l.head) l.head.emissiveIntensity = 6 * v;
      l.glow.userData.v = v;
    }
    for (const p of this.pool) {
      const l = p.userData.lamp as Lamp | null;
      p.intensity = l ? l.power * (l.glow.userData.v as number) : 0;
    }
    // searchlights
    this.garrison.beams.forEach((b, i) => {
      const f = this.beamsFx[i];
      if (!f) return;
      f.cone.visible = b.on;
      f.light.intensity = b.on ? 320 : 0; // never toggle .visible on lights (shader recompiles)
      f.light.target.position.copy(b.target);
      f.head.lookAt(b.target);
      f.cone.position.copy(b.origin);
      f.cone.lookAt(b.target);
      f.cone.scale.set(1, 1, b.origin.distanceTo(b.target));
      f.mat.uniforms.uI.value = b.on ? 1 : 0;
    });
    // flag
    const flag = this.scene.getObjectByName("flag") as THREE.Mesh | undefined;
    if (flag) {
      const p = flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, Math.sin(x * 3 - t * 4) * 0.12 * x);
      }
      p.needsUpdate = true;
    }
    // fx
    for (const tr of this.tracers) {
      if (tr.life > 0) tr.life -= dt;
      tr.mat.opacity = Math.max(0, tr.life / 0.07) * 0.9;
    }
    for (const f of this.flashes) {
      if (f.life > 0) f.life -= dt;
      f.s.visible = f.life > 0;
    }
    this.flash.intensity *= Math.exp(-dt * 40);
    this.dust.mat.uniforms.uTime.value = t;
    this.dust.mat.uniforms.uCenter.value.copy(this.camera.position);

    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) {
      this.zoneTimer = 0.3;
      const z = zoneAt(this.pos.x, this.pos.z);
      const id = z?.id ?? null;
      if (id !== this.zoneId) {
        this.zoneId = id;
        this.opts.onZone?.(z);
      }
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.opts.onHud?.(this.hud());
    }
    this.fx.render(dt, t);
    this.drawOverlay();
    if (!this.readyFired) {
      this.readyFired = true;
      this.opts.onReady?.();
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("contextmenu", this.onContext);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    window.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("touchend", this.onTouchEnd);
    window.removeEventListener("touchcancel", this.onTouchEnd);
    window.removeEventListener("resize", this.onResize);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.scene.environment?.dispose();
    this.fx.dispose();
    this.renderer.dispose();
    // trees/bushes were appended to the shared collision list
    for (let i = BOXES.length - 1; i >= 0; i--) if (BOXES[i].id === "tree" || BOXES[i].id === "bush") BOXES.splice(i, 1);
    for (const b of BOXES) b.off = false;
    delete (window as unknown as { __barracks?: BarracksLevel }).__barracks;
  }

  /** test hook: advance gameplay logic deterministically (no rendering) */
  simulate(seconds: number, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) {
      const sim = this.active && !this.frozen;
      const pl = sim ? this.updatePlayer(dt) : { hs: 0, crouch: this.crouchAmt > 0.5, run: false, surface: "dirt" as Surface };
      this.updateGame(dt, pl, sim);
    }
    this.opts.onHud?.(this.hud());
    return this.debug().game.stage;
  }
  /** test hooks */
  debug() {
    return { garrison: this.garrison, game: this.game, act: this.act };
  }
  skipTo(stage: "mill" | "plan" | "inside" | "armory") {
    const g = this.game;
    g.binoculars = true;
    if (stage === "mill") {
      g.stage = "to_mill";
      this.teleport(RABAH_DOOR.x + 1.5, RABAH_DOOR.z, Math.PI / 2);
    } else {
      if (!g.plan) this.applyPlan({ entry: "drain", diversion: "fire" });
      if (stage === "inside") this.teleport(DRAIN.x + 3, DRAIN.z, -Math.PI / 2);
      if (stage === "armory") {
        g.hasKey = true;
        g.inside = true;
        this.teleport(ARMORY_DOOR.x, ARMORY_DOOR.z + 2.5, 0);
      }
    }
  }
  /** used by the planning UI to draw the static plan */
  static layout() {
    return { BUILDINGS, TOWERS, COMPOUND, GATE, WIRE, DRAIN, GENERATOR, ARMORY, RALLY, DIVERSION_FIRE, PHONE_POLE, OUED, KEF, MILL, CHECKPOINT, VILLAGE, CEMETERY, SPAWN };
  }
}
