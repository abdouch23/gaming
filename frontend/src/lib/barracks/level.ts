// Chapter II engine — «ليلة الفاتح · Night of the First».
// Loop: escape the watched village → secret meeting (cemetery) → optional recon from the Kef →
// password + planning at the olive mill → infiltrate the barracks → seize the armory → fighting escape to the mountains.
import * as THREE from "three";
import { mulberry32, makeGlowSprite, makeParticleField, createPostFX, Flicker, NOISE_GLSL, type PostFX } from "@/lib/lighting";
import { createGreenKit } from "@/lib/ported/greenworld";
import { buildHouses } from "@/lib/night/houses";
import { makeZahra } from "@/lib/night/figures";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Surface } from "@/lib/night/audio";
import type { BarracksAudio } from "@/lib/barracks/audio";
import {
  MAP, BOXES, BUILDINGS, TOWERS, TOWER_H, TRUCKS, CRATES, DRUMS, FLAG, VILLAGE, COMPOUND, COMPOUND_Y, GATE, WIRE, DRAIN, GENERATOR,
  ARMORY, ARMORY_DOOR, RACKS, SPAWN, CEMETERY, MESSAOUD, KEF, KEF_TOP, MILL, RABAH_DOOR, LAKHDAR, TABLE, RALLY, CHECKPOINT,
  DIVERSION_FIRE, PHONE_POLE, OUED, MOON_DIR_ARR, DV, TOWN, SAFEHOUSE, smoothstep, TOWN_BLOCKS, TOWN_HOUSES, ROAD_SETS, boxesIn, HQ, HQ_DOOR, HQ_WINDOW, HQ_ITEMS, RESTRICT_PAD, CHARGE_TIMER, insideHQ,
  terrainHeight, splatAt, groundAt, solidAt, lineClear, zoneAt, roadDist, ouedDepth, insideCompound, rebuildNav,
  type Zone, type Building,
} from "@/lib/barracks/map";
import { Garrison, type Soldier, type Stimulus, type ShotEvent } from "@/lib/barracks/soldiers";
import { Squad, makeMujahid, type MateId } from "@/lib/barracks/squad";
import { forestAt, ROADS } from "@/lib/barracks/terrain";

export type Stage = "prologue" | "escape" | "meet" | "recon" | "plan" | "infiltrate" | "hq" | "armory" | "sabotage" | "exfil" | "ended";
const STAGE_ORDER: Stage[] = ["prologue", "escape", "meet", "recon", "plan", "infiltrate", "hq", "armory", "sabotage", "exfil", "ended"];
export type Entry = "drain" | "wire" | "gate";
export type Diversion = "fire" | "phone" | "cover";
export interface Plan { entry: Entry; diversion: Diversion }
export type Who = "azawi" | "chihani";
export type CastId = "benboulaid" | "chihani" | "boucetta" | "laghrour" | "adjoul" | "azawi";
export const RECON_REQ = 5;

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
  squad: { id: MateId; state: string }[];
  order: "follow" | "hold";
  strikeReady: boolean;
  strikeCd: number;
  strike: boolean;
  charges: number;
  chargeT: number;
  restrict: number;
  intel: { maps: boolean; key: boolean; records: boolean; radio: boolean };
  reconReq: number;
}
export interface Ending {
  ghost: boolean; rifles: number; kills: number; takedowns: number; deaths: number; tagged: number; tagTotal: number;
  clock: string; plan: Plan | null; passwordTries: number; trust: number; maps: boolean; records: boolean; radioCut: boolean; charges: number;
}
export interface MapState {
  player: { x: number; z: number; yaw: number };
  soldiers: { x: number; z: number; yaw: number; state: string; role: string }[];
  allies: { x: number; z: number }[];
  beams: { x: number; z: number }[];
  objective: { x: number; z: number } | null;
  wireCut: boolean; doorOpen: boolean; generatorOff: boolean;
  charges: boolean[]; exploded: boolean;
}

export interface LevelOptions {
  lowPower: boolean;
  audio?: BarracksAudio;
  onHud?: (h: HudState) => void;
  onDialogue?: (who: Who) => void;
  onCaught?: (reason: "caught" | "killed" | "compromised") => void;
  onEnding?: (e: Ending) => void;
  onCheckpoint?: (name: string) => void;
  onReady?: () => void;
  onZone?: (z: Zone | null) => void;
  onActiveChange?: (active: boolean) => void;
  onStep?: (surface: Surface, loudness: number) => void;
  onToast?: (ar: string, en: string) => void;
  onBark?: (id: CastId | MateId, ar: string, en: string) => void;
  onFinale?: () => void;
  onDamage?: (dirAngle: number) => void;
}

const OBJ: Record<Stage, [string, string]> = {
  prologue: ["", ""],
  escape: ["اخرج من الدشرة دون أن يراك أحد، والتحق بالعزوي في المقبرة", "Slip out of the dachra unseen and reach Azawi at the cemetery"],
  meet: ["اعثر على مرود العزوي عند ضريح سيدي عبد الله", "Find Mroud Al-Azawi by the marabout"],
  recon: ["اصعد إلى كاف الغراب وراقب الثكنة", "Climb Crow's Kef and watch the barracks"],
  plan: ["اتبع الوادي إلى معصرة الزيتون — شيحاني ينتظر", "Follow the oued to the olive mill — Chihani is waiting"],
  infiltrate: ["ادخل الثكنة من المدخل المتّفق عليه", "Get inside the barracks by the agreed entry"],
  hq: ["ادخل مبنى القيادة: الخرائط ومفتاح المخزن", "Get into the HQ: the maps and the armory key"],
  armory: ["افتح مخزن السلاح", "Open the armory"],
  sabotage: ["ازرع العبوات في المركبات الثلاث", "Plant charges on the three vehicles"],
  exfil: ["انسحبوا إلى مسلك الجبل", "Withdraw to the mountain trail"],
  ended: ["", ""],
};
const START_MIN = 22 * 60 + 40;
const SEC_PER_MIN = 10;
// prologue: the meeting in the Ben Chaïba courtyard (Dachra Ouled Moussa)
const MEETING_CENTER = { x: 24 + DV.x, z: 77 + DV.z };
const MEETING: Partial<Record<CastId, { x: number; z: number }>> = Object.fromEntries(
  Object.entries({ benboulaid: [24, 79.3], chihani: [21.8, 78.4], laghrour: [26.2, 78.3], adjoul: [21.7, 75.8], boucetta: [26.3, 75.7] }).map(([k, [x, z]]) => [k, { x: x + DV.x, z: z + DV.z }]),
);
const PLAYER_MEET = { x: 24 + DV.x, z: 74.7 + DV.z };
const MATE_NAMES: Record<MateId, string> = { laghrour: "عباس لغرور", adjoul: "عاجل عجول", azawi: "مرود العزوي" };
const MOON_DIR = new THREE.Vector3(...MOON_DIR_ARR).normalize();
const HORIZON = new THREE.Color().setRGB(0.035, 0.07, 0.1);
const EYE_STAND = 1.65, EYE_CROUCH = 0.95, RADIUS = 0.3;
const FOG = 0.0095, FOG_BINOC = 0.0042;
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

interface Lamp { town?: boolean; pos: THREE.Vector3; radius: number; power: number; grid: boolean; glow: THREE.Sprite; haze: THREE.Sprite; head: THREE.MeshStandardMaterial | null; flicker: Flicker; warm: boolean; on: boolean }
interface BeamFx { light: THREE.SpotLight; cone: THREE.Mesh; mat: THREE.ShaderMaterial; head: THREE.Object3D }
interface Tracer { line: THREE.Line; life: number; mat: THREE.LineBasicMaterial }
interface Ally { id: string; group: THREE.Group; pos: THREE.Vector3; fireCd: number; active: boolean; covering: boolean }
interface TruckFx { x: number; z: number; group: THREE.Group; wreck: THREE.Group; charge: THREE.Group; led: THREE.MeshStandardMaterial }
interface Blast { pos: THREE.Vector3; t: number; i: number }
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
  private squad: Squad;
  private allies: Ally[] = [];
  private npc = {} as Record<CastId, THREE.Group>;
  private armoryDoor!: THREE.Object3D;
  private wireLines!: THREE.Object3D;
  private genLamp!: THREE.MeshStandardMaterial;
  private rackRifles: THREE.Group[] = [];
  private fireGroup = new THREE.Group();
  private mapsProp!: THREE.Object3D;
  private recordsProp!: THREE.Object3D;
  private radioDials!: THREE.MeshStandardMaterial;
  private trucks: TruckFx[] = [];
  private wreckLight!: THREE.PointLight;
  private blasts: Blast[] = [];
  private blastSprites: { fire: THREE.Sprite; smoke: THREE.Sprite[] }[] = [];
  private wreckFires: THREE.Sprite[] = [];
  private cine = { on: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), tpos: new THREE.Vector3(), tlook: new THREE.Vector3(), speed: 1 };
  private lastSpeaker: THREE.Object3D | null = null;
  private shake = 0;
  private strikeTarget: Soldier | null = null;
  private batched = 0;
  private perf = { acc: 0, n: 0, t: 0, ratio: 1, max: 1.5, min: 0.7 };
  readonly game = {
    stage: "prologue" as Stage,
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
    passwordTries: 0,
    trust: 10,
    maps: false,
    hasKey: false,
    records: false,
    radioCut: false,
    wireCut: false,
    doorOpen: false,
    generatorOff: false,
    racks: [false, false, false],
    rifles: 0,
    charges: [false, false, false],
    chargeT: -1,
    exploded: false,
    finaleT: -1,
    kills: 0,
    takedowns: 0,
    deaths: 0,
    signal: null as "ready" | "used" | null,
    inside: false,
    insideHQ: false,
    sirenCause: null as string | null,
    discoveryT: -1,
    diversionStarted: -1,
    assaultT: -1,
    restrictT: 0,
    barks: {} as Record<string, boolean>,
  };
  private checkpoint: { x: number; z: number; yaw: number; game: string; garrison: ReturnType<Garrison["snapshot"]>; alarm: number; squad: ReturnType<Squad["snapshot"]> } | null = null;
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
    this.scene.fog = new THREE.FogExp2(HORIZON.clone(), FOG);
    this.fovBase = w < h ? 80 : 68;
    this.camera = new THREE.PerspectiveCamera(this.fovBase, w / h, 0.05, 1400);
    this.scene.add(this.camera);

    this.green = createGreenKit({
      height: terrainHeight, splat: splatAt, quality: this.low ? 0.3 : 0.6, sunDir: MOON_DIR,
      skyTop: new THREE.Color().setRGB(0.003, 0.007, 0.016), skyHor: HORIZON.clone(), wind: 0.9,
    });
    rebuildNav();
    this.squad = new Squad({
      onStrike: (m) => {
        this.opts.audio?.thud();
        this.opts.onBark?.(m.id, "تمّ. بلا صوت.", "Done. Not a sound.");
      },
      onShot: (from, to) => {
        this.tracer(from, to, 0xffd9a0);
        this.muzzle(from);
        this.opts.audio?.shot(from.distanceTo(this.pos), this.panOf(from));
      },
      onBark: (id, ar, en) => this.opts.onBark?.(id, ar, en),
    });
    this.buildEnvironment();
    this.buildSky();
    this.buildTerrain();
    this.buildVillage();
    this.buildCompound();
    this.buildTown();
    this.buildFence();
    this.buildTowers();
    this.buildProps();
    this.buildVegetation();
    this.buildLights();
    this.buildPeople();
    this.buildViewmodel();
    this.buildFx();
    // static batching: hundreds of building/prop meshes -> a few dozen draw calls (biggest single win against stutter)
    this.batchStatic();
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

    this.pos.set(PLAYER_MEET.x, groundAt(PLAYER_MEET.x, PLAYER_MEET.z).y, PLAYER_MEET.z);
    this.stim = this.computeStimulus({ hs: 0, crouch: false, run: false, surface: "dirt" });
    this.applyWorldFlags();
    this.saveCheckpoint("start", true);
    this.updateGrass(Infinity);
    this.precompile();
    this.perf.max = this.renderer.getPixelRatio();
    this.perf.ratio = this.perf.max;
    this.perf.min = this.low ? 0.6 : 0.75;
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

  // ---------------- streamed terrain (64 m chunks, 4 LODs with skirts) ----------------
  private chunks = new Map<number, { lv: number; mesh: THREE.Mesh }>();
  private chunkTimer = 0;
  private static readonly CH = 64;
  private static readonly TX0 = MAP.minX - 20;
  private static readonly TZ0 = MAP.minZ - 20;
  private static readonly NCX = Math.ceil((MAP.maxX - MAP.minX + 40) / 64);
  private static readonly NCZ = Math.ceil((MAP.maxZ - MAP.minZ + 40) / 64);

  private buildChunkGeo(ci: number, cj: number, lv: number) {
    const CH = BarracksLevel.CH, step = [1, 2, 4, 8][lv], n = CH / step;
    const x0 = BarracksLevel.TX0 + ci * CH, z0 = BarracksLevel.TZ0 + cj * CH;
    const N = (n + 1) * (n + 1), S = 4 * (n + 1);
    const pos = new Float32Array((N + S) * 3), nor = new Float32Array((N + S) * 3), uv = new Float32Array((N + S) * 2), spl = new Float32Array((N + S) * 4);
    const e = Math.max(1, step * 0.5);
    const put = (k: number, x: number, z: number, drop: number) => {
      const y = terrainHeight(x, z);
      const a = terrainHeight(x - e, z) - terrainHeight(x + e, z), b = terrainHeight(x, z - e) - terrainHeight(x, z + e), l = Math.hypot(a, 2 * e, b);
      pos[k * 3] = x;
      pos[k * 3 + 1] = y - drop;
      pos[k * 3 + 2] = z;
      nor[k * 3] = a / l;
      nor[k * 3 + 1] = (2 * e) / l;
      nor[k * 3 + 2] = b / l;
      uv[k * 2] = x / 16;
      uv[k * 2 + 1] = z / 16;
      spl.set(splatAt(x, z, (2 * e) / l), k * 4);
    };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) put(j * (n + 1) + i, x0 + i * step, z0 + j * step, 0);
    const idx: number[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    // skirts hide cracks between neighbouring LODs
    const drop = step * 0.8 + 0.6;
    const edges: number[][] = [[], [], [], []];
    for (let t = 0; t <= n; t++) {
      edges[0].push(t);
      edges[1].push(n * (n + 1) + t);
      edges[2].push(t * (n + 1));
      edges[3].push(t * (n + 1) + n);
    }
    let k = N;
    for (const ed of edges) {
      const base = k;
      for (const v of ed) put(k++, pos[v * 3], pos[v * 3 + 2], drop);
      for (let t = 0; t < n; t++) {
        const a = ed[t], b = ed[t + 1], c = base + t, d = base + t + 1;
        idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("aSplat", new THREE.BufferAttribute(spl, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  private updateTerrain(budget: number) {
    const CH = BarracksLevel.CH, cx = this.camera.position.x, cz = this.camera.position.z;
    const want: { key: number; ci: number; cj: number; lv: number; d: number }[] = [];
    for (let cj = 0; cj < BarracksLevel.NCZ; cj++)
      for (let ci = 0; ci < BarracksLevel.NCX; ci++) {
        const x0 = BarracksLevel.TX0 + ci * CH, z0 = BarracksLevel.TZ0 + cj * CH;
        const d = Math.hypot(Math.max(x0 - cx, 0, cx - x0 - CH), Math.max(z0 - cz, 0, cz - z0 - CH));
        let lv = d < 90 ? 0 : d < 200 ? 1 : d < 380 ? 2 : 3;
        if (this.low) lv = Math.min(3, lv + 1);
        const key = cj * 1000 + ci;
        const c = this.chunks.get(key);
        if (c) c.mesh.visible = d < 560;
        if (!c || c.lv !== lv) want.push({ key, ci, cj, lv, d });
      }
    want.sort((a, b) => a.d - b.d);
    for (const w of want.slice(0, budget)) {
      const geo = this.buildChunkGeo(w.ci, w.cj, w.lv);
      const old = this.chunks.get(w.key);
      if (old) {
        old.mesh.geometry.dispose();
        old.mesh.geometry = geo;
        old.lv = w.lv;
      } else {
        const mesh = new THREE.Mesh(geo, this.green.tMat);
        mesh.receiveShadow = true;
        mesh.userData.dynamic = true;
        this.scene.add(mesh);
        this.chunks.set(w.key, { lv: w.lv, mesh });
      }
    }
  }

  private buildTerrain() {
    this.camera.position.set(this.pos.x || PLAYER_MEET.x, 0, this.pos.z || PLAYER_MEET.z);
    this.updateTerrain(Infinity);
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
    const tg = terrainHeight(-1.5 + DV.x, 54 + DV.z);
    this.mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), wood, -1.4 + DV.x, tg + 0.72, 53.6 + DV.z);
    this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6), wood, -1.4 + DV.x, tg + 0.36, 53.6 + DV.z);
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
    if (b.kind === "hq") return this.buildHQ();
    const y0 = COMPOUND_Y;
    const grp = new THREE.Group();
    grp.position.set(b.x, y0, b.z);
    this.scene.add(grp);
    const wallMat = b.kind === "armory" || b.kind === "shed" ? k.S : k.Lm;
    const winDark = new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.3, metalness: 0.2 });
    const winLit = new THREE.MeshStandardMaterial({ color: 0x0a0705, emissive: 0xffa24a, emissiveIntensity: 1.4 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2b2318, roughness: 0.85 });
    if (b.kind !== "armory") {
      this.mesh(k.U(boxGeo(b.w, b.h, b.d), 1), wallMat, 0, b.h / 2, 0, 0, grp);
      // plinth
      this.mesh(boxGeo(b.w + 0.12, 0.45, b.d + 0.12), k.S, 0, 0.22, 0, 0, grp);
    }
    // roof
    {
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
          const lit = (b.kind === "guard" || (b.kind === "barracks" && (i + (side > 0 ? 1 : 0) + b.x) % 3 === 0)) && side > 0;
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

  /** the P.C. — hollow shell with four rooms, lit by the generator grid */
  private buildHQ() {
    const k = this.kit, Y = COMPOUND_Y, { x, z, w, d, h } = HQ;
    const grp = new THREE.Group();
    this.scene.add(grp);
    for (const b of BOXES.filter((q) => q.id === "hq")) this.mesh(k.U(boxGeo(b.x1 - b.x0, h, b.z1 - b.z0), 1), k.A, (b.x0 + b.x1) / 2, Y + h / 2, (b.z0 + b.z1) / 2, 0, grp);
    const zs = z + d / 2 - 0.15, zn = z - d / 2 + 0.15;
    this.mesh(boxGeo(1.6, h - 2.3, 0.3), k.A, HQ_DOOR.x, Y + 2.3 + (h - 2.3) / 2, zs, 0, grp); // door lintel
    this.mesh(boxGeo(1.6, h - 1.25, 0.3), k.A, HQ_WINDOW.x, Y + 1.25 + (h - 1.25) / 2, zn, 0, grp); // above the breach
    // rubble at the breach
    for (let i = 0; i < 7; i++) this.mesh(new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.06), k.S, HQ_WINDOW.x - 0.9 + i * 0.3, Y + 0.08, zn - 0.5 + (i % 2) * 0.9, i, grp);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), new THREE.MeshStandardMaterial({ color: 0x3a2f24, roughness: 0.85, map: stripes("#3a2f24", "#2c241b", 22) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, Y + 0.03, z);
    floor.receiveShadow = true;
    grp.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), new THREE.MeshStandardMaterial({ color: 0x6a655a, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(x, Y + h - 0.02, z);
    grp.add(ceil);
    this.mesh(boxGeo(w + 0.4, 0.45, d + 0.4), k.A, x, Y + h + 0.22, z, 0, grp).castShadow = true;
    // facade + interior windows
    const winLit = new THREE.MeshStandardMaterial({ color: 0x0a0705, emissive: 0xffa24a, emissiveIntensity: 1.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0b1420, roughness: 0.15, metalness: 0.4, emissive: 0x0d1a2c, emissiveIntensity: 0.6 });
    for (const wx of [-8.2, -5, 5, 8.2]) {
      this.mesh(new THREE.PlaneGeometry(1.1, 1.0), winLit, wx, Y + 2.2, zs + 0.16, 0, grp).castShadow = false;
      this.mesh(new THREE.PlaneGeometry(1.1, 1.0), glass, wx, Y + 2.2, zs - 0.16, Math.PI, grp).castShadow = false;
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: signTexture("P.C.", "COMMANDEMENT"), roughness: 0.8 }));
    sign.position.set(HQ_DOOR.x + 2.2, Y + 2.8, zs + 0.17);
    grp.add(sign);
    // furniture
    const wood = k.W, steel = new THREE.MeshStandardMaterial({ color: 0x2f3a2e, roughness: 0.55, metalness: 0.6 });
    for (const b of BOXES) {
      if (!["desk", "safe", "cabinet", "radio"].includes(b.id ?? "")) continue;
      const bw = b.x1 - b.x0, bd = b.z1 - b.z0, bh = b.top - Y;
      this.mesh(boxGeo(bw, bh, bd), b.id === "desk" || b.id === "radio" ? wood : steel, (b.x0 + b.x1) / 2, Y + bh / 2, (b.z0 + b.z1) / 2, 0, grp);
    }
    // the commander's office: wall map, flag, maps on the desk
    const mapTex = (() => {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 320;
      const g = c.getContext("2d")!;
      g.fillStyle = "#cdbf98";
      g.fillRect(0, 0, 512, 320);
      g.strokeStyle = "#8a7a55";
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.moveTo(0, 20 + i * 22);
        for (let x2 = 0; x2 <= 512; x2 += 32) g.lineTo(x2, 20 + i * 22 + Math.sin(x2 * 0.02 + i) * 9);
        g.stroke();
      }
      g.strokeStyle = "#3b6a8a";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(40, 300);
      g.bezierCurveTo(140, 200, 220, 220, 300, 90);
      g.stroke();
      g.fillStyle = "#a3262a";
      for (const [px, py] of [[120, 90], [260, 140], [380, 70], [420, 220], [200, 250]]) {
        g.beginPath();
        g.arc(px, py, 9, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#2a2418";
      g.font = "bold 24px serif";
      g.fillText("AURÈS — POSTES ET PATROUILLES", 60, 34);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const mapMat = new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.9 });
    const wallMap = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), mapMat);
    wallMap.position.set(-7.5, Y + 2.2, zn + 0.17);
    grp.add(wallMap);
    this.mapsProp = new THREE.Group();
    this.mapsProp.userData.dynamic = true;
    for (let i = 0; i < 3; i++) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), mapMat);
      sheet.rotation.set(-Math.PI / 2, 0, 0.2 * i - 0.2);
      sheet.position.set(-7.6 + i * 0.25, Y + 0.82 + i * 0.004, -81.6);
      this.mapsProp.add(sheet);
    }
    this.scene.add(this.mapsProp);
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
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: ft, roughness: 1 }));
    flag.position.set(x - w / 2 + 0.32, Y + 2.4, -79);
    flag.rotation.y = Math.PI / 2;
    grp.add(flag);
    this.recordsProp = new THREE.Group();
    this.recordsProp.userData.dynamic = true;
    const folder = new THREE.MeshStandardMaterial({ color: 0x8b6a3a, roughness: 1 });
    for (let i = 0; i < 4; i++) this.mesh(boxGeo(0.32, 0.05, 0.42), folder, 9.7 + (i % 2) * 0.05, Y + 0.87 + i * 0.05, -80.2, i * 0.1, this.recordsProp);
    this.mesh(boxGeo(0.9, 0.06, 0.6), wood, 9.7, Y + 0.82, -80.2, 0, this.recordsProp);
    this.scene.add(this.recordsProp);
    // radio set
    this.radioDials = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x7dff9a, emissiveIntensity: 2.5 });
    this.mesh(boxGeo(0.7, 0.45, 0.5), steel, 10.25, Y + 1.08, -77, 0, grp);
    for (let i = 0; i < 3; i++) this.mesh(new THREE.CircleGeometry(0.035, 10), this.radioDials, 9.89, Y + 1.12, -77.15 + i * 0.15, -Math.PI / 2, grp).castShadow = false;
    // hanging bulbs (grid lamps: dark when the generator dies)
    const cord = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const [lx, lz] of [[-7, -79], [0, -79], [7, -77], [7, -81]] as const) {
      this.mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), cord, lx, Y + h - 0.3, lz, 0, grp).castShadow = false;
      this.addLamp(new THREE.Vector3(lx, Y + h - 0.65, lz), 9, 6.5, true, false, false);
    }
    return grp;
  }

  private batchStatic() {
    this.scene.updateMatrixWorld(true);
    const dynamic = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.dynamic || !p.visible) return true;
      return false;
    };
    const buckets = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[] }>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.renderOrder !== 0 || dynamic(m)) return;
      const geo = m.geometry;
      if (Object.keys(geo.morphAttributes).length) return;
      const attrs = Object.keys(geo.attributes).sort().join(",");
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const c = geo.boundingSphere!.center.clone().applyMatrix4(m.matrixWorld);
      const key = `${m.material.uuid}|${attrs}|${geo.index ? 1 : 0}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${Math.floor(c.x / 40)},${Math.floor(c.z / 40)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: m.material, meshes: [] }));
      b.meshes.push(m);
    });
    let removed = 0;
    for (const b of buckets.values()) {
      if (b.meshes.length < 2) continue;
      const geos = b.meshes.map((m) => {
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.meshes[0].castShadow;
      mesh.receiveShadow = b.meshes[0].receiveShadow;
      this.scene.add(mesh);
      for (const m of b.meshes) m.parent?.remove(m);
      removed += b.meshes.length - 1;
    }
    this.batched = removed;
  }

  /** compile every shader up front (including hidden fx) so nothing hitches the first time it appears */
  private precompile() {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      this.renderer.compile(this.scene, this.camera);
    } finally {
      hidden.forEach((o) => (o.visible = false));
    }
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
      hinge.userData.dynamic = true;
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
        guns.userData.dynamic = true;
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
    flag.userData.dynamic = true;
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
        head.userData.dynamic = true;
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
        cone.userData.dynamic = true;
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
    const burnt = new THREE.MeshStandardMaterial({ color: 0x0e0c0a, roughness: 1 });
    for (const t of TRUCKS) {
      const g = new THREE.Group();
      g.userData.dynamic = true;
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
      // the wreck: same silhouette, burnt, sagging
      const wreck = g.clone(true);
      wreck.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = burnt;
      });
      wreck.rotation.z = 0.06;
      wreck.position.y -= 0.25;
      wreck.children.filter((c) => c instanceof THREE.Mesh && (c.geometry as THREE.BufferGeometry).type === "CylinderGeometry" && Math.abs(c.position.y - 1.6) < 0.01).forEach((c) => (c.visible = false));
      wreck.visible = false;
      for (let i = 0; i < 4; i++) {
        const f = makeGlowSprite(i % 2 ? 0xff6a1f : 0xffa040, 1.6, 2 + i * 0.6);
        f.position.set((Math.random() - 0.5) * 1.6, 1.3 + i * 0.4, -2 + i * 1.3);
        wreck.add(f);
        this.wreckFires.push(f);
      }
      this.scene.add(wreck);
      // the charge: a satchel and a blinking timer under the chassis
      const charge = new THREE.Group();
      const led = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2a1a, emissiveIntensity: 4 });
      const bag = new THREE.Mesh(boxGeo(0.34, 0.22, 0.26), new THREE.MeshStandardMaterial({ color: 0x4a3c26, roughness: 1 }));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), led);
      lamp.position.set(-0.18, 0.06, 0);
      charge.add(bag, lamp);
      charge.position.set(-1.2, 0.62, 0.4);
      charge.visible = false;
      g.add(charge);
      this.trucks.push({ x: t.x, z: t.z, group: g, wreck, charge, led });
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

  // ---------------- vegetation: forest from the map file's forestAt(), instanced per 160 m tile with 2 LODs ----------------
  private vegTiles: { x: number; z: number; near: THREE.InstancedMesh[]; far: THREE.InstancedMesh[] }[] = [];
  private vegTimer = 0;
  private buildVegetation() {
    const rng = mulberry32(1954);
    const k = this.green;
    const nearAny = (x: number, z: number, pts: { x: number; z: number }[], r: number) => pts.some((p) => Math.hypot(x - p.x, z - p.z) < r);
    const keepClear = [KEF_TOP, CEMETERY, MILL, CHECKPOINT, RALLY, SAFEHOUSE, MESSAOUD, LAKHDAR];
    const ok = (x: number, z: number, clear: number) => {
      if (x < MAP.minX + 2 || x > MAP.maxX - 2 || z < MAP.minZ + 2 || z > MAP.maxZ - 2) return false;
      if (insideCompound(x, z, 12) || roadDist(x, z) < clear || ouedDepth(x, z) > 0.4) return false;
      if (nearAny(x, z, keepClear, 6)) return false;
      if (Object.values(TOWN).some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 4)) return false;
      return !boxesIn(x - 2.5, z - 2.5, x + 2.5, z + 2.5).length;
    };
    type Sp = { c: boolean; seed: number; P: unknown; bark: number; leaf: number; s: [number, number]; pts: { x: number; z: number; r: number; s: number }[] };
    const sp: Sp[] = [
      { c: false, seed: 11, P: { ...k.OAK, H: 6, wob: 0.45 }, bark: 0, leaf: 0, s: [0.45, 0.65], pts: [] }, // olives
      { c: false, seed: 37, P: { ...k.OAK, H: 8.5, wob: 0.3, n0: 6 }, bark: 0, leaf: 0, s: [0.5, 0.75], pts: [] }, // holm oaks
      { c: true, seed: 7, P: k.CONI, bark: 2, leaf: 4, s: [0.55, 0.9], pts: [] }, // Aurès cedars
      { c: false, seed: 3, P: k.BUSH, bark: 0, leaf: 0, s: [0.8, 1.35], pts: [] }, // scrub
    ];
    const cell = this.low ? 8 : 6;
    const groves = [{ x: MILL.x, z: MILL.z, r: 55 }, { x: SAFEHOUSE.x, z: SAFEHOUSE.z, r: 75 }, { x: CEMETERY.x, z: CEMETERY.z, r: 30 }];
    for (let z = MAP.minZ; z < MAP.maxZ; z += cell)
      for (let x = MAP.minX; x < MAP.maxX; x += cell) {
        const px = x + rng() * cell, pz = z + rng() * cell;
        const f = forestAt(px, pz);
        const grove = groves.some((g) => Math.hypot(px - g.x, pz - g.z) < g.r && Math.hypot(px - g.x, pz - g.z) > 12);
        // scrub on the approach between the Kef and the west fence: the cover the squad crawls through
        const approach = px > -105 && px < -42 && pz > -95 && pz < 10;
        const r = rng();
        let si = -1;
        if (grove && r < 0.3) si = 0;
        else if (r < smoothstep(0.5, 0.72, f) * 0.75) si = pz < -110 || rng() < 0.35 ? 2 : 1;
        else if (r < 0.045 + smoothstep(0.42, 0.6, f) * 0.12 + (approach ? 0.22 : 0)) si = 3;
        else if (r < 0.06 && f > 0.4) si = 1;
        if (si < 0 || !ok(px, pz, si === 3 ? 1.5 : 3)) continue;
        sp[si].pts.push({ x: px, z: pz, r: rng() * Math.PI * 2, s: sp[si].s[0] + rng() * (sp[si].s[1] - sp[si].s[0]) });
      }
    const TS = 160, dummy = new THREE.Object3D();
    const tiles = new Map<number, { x: number; z: number; near: THREE.InstancedMesh[]; far: THREE.InstancedMesh[] }>();
    sp.forEach((s, si) => {
      if (!s.pts.length) return;
      const T = s.c ? k.genConifer(s.seed, s.P) : k.genBroad(s.seed, s.P);
      const g0b = T.b0.geo(false), g0l = T.l0.geo(true), g1b = T.b1.geo(false), g1l = T.l1.geo(true);
      const leafFar = s.c ? s.leaf : s.leaf + 1;
      const byTile = new Map<number, typeof s.pts>();
      for (const p of s.pts) {
        const key = Math.floor((p.z - MAP.minZ) / TS) * 100 + Math.floor((p.x - MAP.minX) / TS);
        if (!byTile.has(key)) byTile.set(key, []);
        byTile.get(key)!.push(p);
        const g = terrainHeight(p.x, p.z);
        if (si !== 3) BOXES.push({ x0: p.x - 0.3, x1: p.x + 0.3, z0: p.z - 0.3, z1: p.z + 0.3, y0: g - 0.5, top: g + 2.6, kind: "solid", id: "tree" });
        else BOXES.push({ x0: p.x - 0.7, x1: p.x + 0.7, z0: p.z - 0.7, z1: p.z + 0.7, y0: g + 0.15, top: g + 1.05, kind: "cover", id: "bush" });
      }
      for (const [key, list] of byTile) {
        let tile = tiles.get(key);
        if (!tile) tiles.set(key, (tile = { x: MAP.minX + ((key % 100) + 0.5) * TS, z: MAP.minZ + (Math.floor(key / 100) + 0.5) * TS, near: [], far: [] }));
        const mk = (bg: THREE.BufferGeometry, lg: THREE.BufferGeometry, leaf: number, near: boolean) => {
          const bark = new THREE.InstancedMesh(bg, k.barkMats[s.bark], list.length);
          const leaves = new THREE.InstancedMesh(lg, k.leafMats[leaf], list.length);
          leaves.customDepthMaterial = k.depthMats[leaf];
          list.forEach((p, i) => {
            dummy.position.set(p.x, terrainHeight(p.x, p.z) - 0.2, p.z);
            dummy.rotation.set(0, p.r, 0);
            dummy.scale.setScalar(p.s);
            dummy.updateMatrix();
            bark.setMatrixAt(i, dummy.matrix);
            leaves.setMatrixAt(i, dummy.matrix);
          });
          for (const m of [bark, leaves]) {
            m.castShadow = near;
            m.receiveShadow = true;
            m.computeBoundingSphere();
            m.userData.dynamic = true;
            m.visible = false;
            this.scene.add(m);
            (near ? tile!.near : tile!.far).push(m);
          }
        };
        if (!this.low) mk(g0b, g0l, s.leaf, true);
        mk(g1b, g1l, leafFar, this.low);
      }
    });
    this.vegTiles = [...tiles.values()];
    this.updateVegetation();
    rebuildNav();
  }
  private updateVegetation() {
    const cx = this.camera.position.x, cz = this.camera.position.z;
    for (const t of this.vegTiles) {
      const d = Math.max(0, Math.hypot(t.x - cx, t.z - cz) - 113);
      const near = t.near.length > 0 && d < 70;
      for (const m of t.near) m.visible = near;
      for (const m of t.far) m.visible = !near && d < 300;
    }
  }

  // ---------------- Khenchela: the other targets of the night, lit in the distance ----------------
  private townGlows: THREE.Sprite[] = [];
  private townEvents: { t: number; x: number; z: number; kind: "shots" | "blast" | "dark" }[] = [];
  private townFlashes: { s: THREE.Sprite; life: number }[] = [];
  private buildTown() {
    const k = this.kit;
    const mats = new Map<number, THREE.MeshStandardMaterial>();
    const mat = (c: number) => mats.get(c) ?? (mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, map: k.A.map ?? null })), mats.get(c)!);
    const winLit = new THREE.MeshStandardMaterial({ color: 0x0a0705, emissive: 0xffb25e, emissiveIntensity: 1.6 });
    for (const b of TOWN_BLOCKS) {
      const g = terrainHeight(b.x, b.z);
      this.mesh(k.U(boxGeo(b.w, b.h + 0.6, b.d), 0.5), mat(b.c), b.x, g - 0.6 + (b.h + 0.6) / 2, b.z);
      if (b.wall || b.h < 4) continue;
      // windows on the long faces + a fog-free glow so the town reads from the hills
      const n = Math.max(1, Math.floor(b.w / 4));
      for (let i = 0; i < n; i++) {
        const x = b.x - b.w / 2 + (b.w / n) * (i + 0.5);
        for (const side of [-1, 1]) {
          for (const y of b.h > 6 ? [2.2, 5.2] : [2.2]) {
            const lit = (i * 7 + y * 3 + side + b.x) % 3 > 0.9;
            const w = this.mesh(new THREE.PlaneGeometry(1.1, 1.2), lit ? winLit : mat(0x0c0e12), x, g + y, b.z + side * (b.d / 2 + 0.02), side > 0 ? 0 : Math.PI);
            w.castShadow = false;
            if (lit && side > 0) {
              const s = makeGlowSprite(0xffb25e, 1.1, 4.5, false);
              s.position.set(x, g + y, b.z + side * (b.d / 2 + 0.4));
              s.userData.dynamic = true;
              this.scene.add(s);
              this.townGlows.push(s);
            }
          }
        }
      }
    }
    // the transformer's pylons and lines feeding the town
    const pyl = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6, metalness: 0.5 });
    const P = TOWN.power;
    const line: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const x = P.x - 40 - i * 62, z = P.z - 30 - i * 44;
      const g = terrainHeight(x, z);
      this.mesh(new THREE.CylinderGeometry(0.12, 0.2, 10, 6), pyl, x, g + 5, z);
      this.mesh(new THREE.BoxGeometry(2.4, 0.15, 0.15), pyl, x, g + 9.6, z);
      line.push(new THREE.Vector3(x, g + 9.6, z));
    }
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: 0x151515 })));
    // lit houses also glow from afar
    for (const h of TOWN_HOUSES) {
      if (!h.lit) continue;
      const s = makeGlowSprite(0xffa04a, 0.9, 3.6, false);
      s.position.set(h.x, terrainHeight(h.x, h.z) + 1.6, h.z);
      s.userData.dynamic = true;
      this.scene.add(s);
      this.townGlows.push(s);
    }
    // street lamps along the town's main roads
    for (const r of ROADS) {
      if (r.t !== "main") continue;
      for (let i = 6; i < r.pts.length; i += 14) {
        const p = r.pts[i];
        if (Math.hypot(p.x - TOWN.hakim.x, p.z - TOWN.hakim.z) > 200 && Math.hypot(p.x - TOWN.police.x, p.z - TOWN.police.z) > 90) continue;
        const q = r.pts[Math.min(r.pts.length - 1, i + 1)], tl = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const x = p.x + ((q.z - p.z) / tl) * (r.hw + 0.8), z = p.z - ((q.x - p.x) / tl) * (r.hw + 0.8);
        this.addLamp(new THREE.Vector3(x, terrainHeight(x, z) + 3.6, z), 14, 13, false, false, true);
        const far = makeGlowSprite(0xffe2b0, 1, 5, false);
        far.position.set(x, terrainHeight(x, z) + 3.6, z);
        far.userData.dynamic = true;
        this.scene.add(far);
        this.townGlows.push(far);
        this.lamps[this.lamps.length - 1].town = true;
      }
    }
    for (let i = 0; i < 6; i++) {
      const s = makeGlowSprite(0xffc070, 3, 1, false);
      s.visible = false;
      this.scene.add(s);
      this.townFlashes.push({ s, life: 0 });
    }
  }
  /** midnight: the other squads strike Khenchela */
  private townAttack() {
    const t0 = this.game.elapsed;
    const T = TOWN;
    for (let i = 0; i < 10; i++) this.townEvents.push({ t: t0 + 1.5 + i * 0.7 + Math.random() * 0.5, x: T.gend.x + (Math.random() - 0.5) * 40, z: T.gend.z + (Math.random() - 0.5) * 30, kind: "shots" });
    for (let i = 0; i < 8; i++) this.townEvents.push({ t: t0 + 3 + i * 0.9 + Math.random() * 0.6, x: T.police.x + (Math.random() - 0.5) * 20, z: T.police.z + (Math.random() - 0.5) * 20, kind: "shots" });
    this.townEvents.push({ t: t0 + 6.5, x: T.power.x, z: T.power.z, kind: "blast" });
    this.townEvents.push({ t: t0 + 7.2, x: T.power.x, z: T.power.z, kind: "dark" });
  }
  private updateTown(dt: number) {
    const now = this.game.elapsed;
    for (let i = this.townEvents.length - 1; i >= 0; i--) {
      const e = this.townEvents[i];
      if (e.t > now) continue;
      this.townEvents.splice(i, 1);
      const p = new THREE.Vector3(e.x, terrainHeight(e.x, e.z) + 2, e.z);
      const d = p.distanceTo(this.pos);
      if (e.kind === "dark") {
        for (const s of this.townGlows) s.visible = false;
        for (const l of this.lamps) if (l.town) l.on = false;
        this.bark("adjoul", "darktown", "انطفأت خنشلة! الإخوة ضربوا المحوّل.", "Khenchela has gone dark! The brothers hit the transformer.");
        continue;
      }
      const f = this.townFlashes.find((q) => q.life <= 0) ?? this.townFlashes[0];
      f.s.position.copy(p);
      f.s.scale.setScalar(e.kind === "blast" ? 40 : 5);
      f.s.visible = true;
      f.life = e.kind === "blast" ? 1.4 : 0.12;
      if (e.kind === "blast") this.opts.audio?.explosion();
      else this.opts.audio?.shot(Math.min(115, d / 4), this.panOf(p));
    }
    for (const f of this.townFlashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.s.visible = f.life > 0;
      (f.s.material as THREE.SpriteMaterial).opacity = Math.min(1, f.life * 3);
    }
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
    this.addLamp(new THREE.Vector3(-2.6 + DV.x, terrainHeight(-2.6 + DV.x, 53 + DV.z) + 2.4, 53.1 + DV.z), 9, 9, false, true, false);
    this.addLamp(new THREE.Vector3(8.5 + DV.x, terrainHeight(8.5 + DV.x, 57.4 + DV.z) + 3, 57.4 + DV.z), 12, 12, false);
    this.addLamp(new THREE.Vector3(24 + DV.x, terrainHeight(24 + DV.x, 66.6 + DV.z) + 2.3, 66.6 + DV.z), 7, 8, false, true, false);
    this.addLamp(new THREE.Vector3(CHECKPOINT.x + 3, terrainHeight(CHECKPOINT.x + 3, CHECKPOINT.z) + 2.8, CHECKPOINT.z + 1), 14, 12, false);
    this.addLamp(new THREE.Vector3(TABLE.x, terrainHeight(TABLE.x, TABLE.z) + 1.05, TABLE.z), 5, 6, false, true, false);
    this.addLamp(new THREE.Vector3(CEMETERY.x - 1.5, terrainHeight(CEMETERY.x, CEMETERY.z) + 0.4, CEMETERY.z + 0.3), 2.5, 3.5, false, true, false);
    this.addLamp(new THREE.Vector3(MEETING_CENTER.x, terrainHeight(MEETING_CENTER.x, MEETING_CENTER.z) + 0.62, MEETING_CENTER.z), 7, 9, false, true, false);
    const n = this.low ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffa858, 0, 15, 2);
      this.scene.add(l);
      this.pool.push(l);
    }
  }

  private buildPeople() {
    // jacket, chèche — loosely after the portrait cards
    const look: Record<CastId, [number, number, number]> = {
      benboulaid: [0x4a4632, 0x8a7d62, 1.03], chihani: [0x4b4a36, 0xb8ab8c, 0.98], boucetta: [0x3e4030, 0x6d6450, 1],
      laghrour: [0x464530, 0x9a8a6a, 1.01], adjoul: [0x52493a, 0xa89676, 1.04], azawi: [0x3f4433, 0x7a7058, 0.99],
    };
    (Object.keys(look) as CastId[]).forEach((id) => {
      const [jacket, scarf, sc] = look[id];
      const g = makeMujahid(jacket, scarf);
      g.scale.setScalar(sc);
      g.userData.dynamic = true;
      this.scene.add(g);
      this.npc[id] = g;
    });
    for (const id of ["laghrour", "adjoul", "azawi"] as const) this.squad.add(id, this.npc[id]);
    this.allies.push({ id: "boucetta", group: this.npc.boucetta, pos: new THREE.Vector3(), fireCd: 2, active: false, covering: false });
    // the meeting: a lantern on a stool, a rug, the crate the rifles came out of
    const k = this.kit;
    const gy = terrainHeight(MEETING_CENTER.x, MEETING_CENTER.z);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), new THREE.MeshStandardMaterial({ map: stripes("#5a2018", "#8a5a2a", 9), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(MEETING_CENTER.x, gy + 0.03, MEETING_CENTER.z);
    rug.receiveShadow = true;
    this.scene.add(rug);
    this.mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.42, 10), k.Wo, MEETING_CENTER.x, gy + 0.21, MEETING_CENTER.z);
    this.mesh(k.U(boxGeo(1.3, 0.45, 0.6), 1), k.Wo, MEETING_CENTER.x + 1.4, gy + 0.23, MEETING_CENTER.z + 2.5, 0.2);
    const z = makeZahra(); // a woman of the network keeps watch at the mill door
    z.position.set(MILL.x + 4.4, groundAt(MILL.x + 4.4, MILL.z - 2.6).y, MILL.z - 2.6);
    z.rotation.y = Math.PI;
    z.userData.dynamic = true;
    this.scene.add(z);
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
    this.viewGroup.userData.dynamic = true;
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
    this.fireGroup.userData.dynamic = true;
    this.scene.add(this.fireGroup);
    // explosions: fireball + smoke per vehicle, and the light of the burning wrecks
    this.wreckLight = new THREE.PointLight(0xff7a2a, 0, 34, 1.6);
    this.wreckLight.position.set(29, COMPOUND_Y + 3, -50);
    this.scene.add(this.wreckLight);
    const smokeTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, "rgba(40,36,32,0.9)");
      gr.addColorStop(1, "rgba(40,36,32,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    for (let i = 0; i < TRUCKS.length; i++) {
      const fire = makeGlowSprite(0xffa040, 2.6, 1);
      fire.visible = false;
      this.scene.add(fire);
      const smoke: THREE.Sprite[] = [];
      for (let j = 0; j < 6; j++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
        sp.visible = false;
        this.scene.add(sp);
        smoke.push(sp);
      }
      this.blastSprites.push({ fire, smoke });
    }
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
    if (k === "KeyQ") this.toggleOrder();
    if (k === "KeyZ") this.orderStrike();
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
      squad: this.squad.snapshot(),
    };
    if (!silent) this.opts.onCheckpoint?.(name);
  }

  private restoreCheckpoint() {
    const c = this.checkpoint!;
    const { deaths, kills, takedowns, barks } = this.game;
    Object.assign(this.game, JSON.parse(c.game));
    Object.assign(this.game, { deaths, kills, takedowns, barks, health: 100, hurtT: 99, reloading: 0, fireCd: 0, restrictT: 0 });
    if (this.game.discoveryT > 0) this.game.discoveryT = Math.max(this.game.discoveryT, 20);
    if (this.game.chargeT > 0) this.game.chargeT = Math.max(this.game.chargeT, CHARGE_TIMER * 0.75);
    if (c.garrison.soldiers.length) this.garrison.restore(c.garrison, c.alarm);
    this.garrison.phoneCut = this.game.radioCut || this.game.plan?.diversion === "phone";
    this.squad.restore(c.squad);
    this.opts.audio?.setSiren(this.garrison.alarm >= 2);
    this.applyWorldFlags();
    this.teleport(c.x, c.z, c.yaw);
    this.squad.regroup(this.pos, this.yaw);
  }

  /** world state that follows game flags (doors, wire, lamps, racks, trucks, NPC placement) */
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
    this.mapsProp.visible = !g.maps;
    this.recordsProp.visible = !g.records;
    this.radioDials.emissiveIntensity = g.radioCut ? 0 : 2.5;
    this.trucks.forEach((t, i) => {
      t.group.visible = !g.exploded;
      t.wreck.visible = g.exploded;
      t.charge.visible = g.charges[i] && !g.exploded;
    });
    this.wreckLight.intensity = g.exploded ? 45 : 0;
    this.garrison.zoneActive.village = !g.armed;
    this.fireGroup.visible = g.diversionStarted >= 0;
    // cast placement follows the story
    const pre = g.stage === "prologue";
    this.npc.benboulaid.visible = pre;
    const at = (id: CastId, x: number, z: number, yaw: number) => {
      const m = this.squad.mates.find((q) => q.id === id);
      if (m) {
        if (!m.joined) m.teleport(x, z, yaw);
        return;
      }
      const o = this.npc[id];
      o.position.set(x, groundAt(x, z).y, z);
      o.rotation.y = yaw;
    };
    if (pre) {
      for (const [id, p] of Object.entries(MEETING)) at(id as CastId, p.x, p.z, Math.atan2(MEETING_CENTER.x - p.x, MEETING_CENTER.z - p.z));
    } else {
      at("chihani", LAKHDAR.x, LAKHDAR.z, Math.PI * 0.75);
      at("boucetta", RABAH_DOOR.x, RABAH_DOOR.z, Math.PI / 2);
    }
    at("azawi", MESSAOUD.x, MESSAOUD.z, Math.PI * 0.2);
    this.placeAllies();
    rebuildNav();
  }

  private placeAllies() {
    const plan = this.game.plan;
    this.garrison.coverAt = [];
    const a = this.allies[0];
    a.active = false;
    if (!plan || !this.game.armed) return;
    const p = plan.diversion === "fire" ? [DIVERSION_FIRE.x - 6, DIVERSION_FIRE.z + 6] : plan.diversion === "phone" ? [PHONE_POLE.x - 2, PHONE_POLE.z + 3] : plan.entry === "gate" ? [GATE.x - 7, GATE.z + 15] : [-92, -112];
    a.pos.set(p[0], groundAt(p[0], p[1]).y, p[1]);
    a.group.position.copy(a.pos);
    a.group.rotation.y = Math.atan2(-p[0], -55 - p[1]);
    a.active = true;
    a.covering = plan.diversion === "cover";
    if (a.covering) this.garrison.coverAt.push({ x: p[0], z: p[1], r: 22 });
  }

  private fail(reason: "caught" | "killed" | "compromised") {
    if (this.frozen) return;
    this.frozen = true;
    this.game.deaths++;
    this.failT = 2.8;
    this.opts.onCaught?.(reason);
  }

  private bark(id: CastId | MateId, key: string, ar: string, en: string) {
    if (this.game.barks[key]) return;
    this.game.barks[key] = true;
    this.opts.onBark?.(id, ar, en);
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
      this.opts.onToast?.("صفّارة الإنذار! الثكنة استيقظت", "Siren! The barracks is awake");
      if (reason !== "explosion" && reason !== "checkpoint") this.bark("adjoul", "alarm", "انكشفنا! غطّوا بعضكم، ولا تتوقّفوا!", "We're blown! Cover each other, keep moving!");
      if (this.garrison.phoneCut) this.opts.onToast?.("الاتصال مقطوع — لا تعزيزات", "Comms cut — no reinforcements");
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
      this.shake = Math.max(this.shake, 0.25);
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
    if (this.flash.intensity < 60) {
      this.flash.position.copy(p);
      this.flash.distance = 14;
      this.flash.intensity = 40;
    }
  }

  /** E — instant interactions (hold ones are driven by the loop) */
  interact() {
    if (!this.active || this.frozen) return;
    const a = this.act;
    if (a && !a.hold && !a.blocked) a.run?.();
  }

  // ---------------- story API (called by the UI) ----------------
  startPrologue() {
    const g = this.game;
    g.stage = "prologue";
    this.frozen = true;
    this.applyWorldFlags();
    this.teleport(PLAYER_MEET.x, PLAYER_MEET.z, 0);
    this.cineCut(new THREE.Vector3(70, 46, 150), new THREE.Vector3(24, 8, 60));
    this.cineTo(new THREE.Vector3(30.5, COMPOUND_Y + 9, 86), new THREE.Vector3(24, terrainHeight(24, 77) + 1, 77), 0.32);
  }
  /** point the cinematic camera at a speaker (over the listener's shoulder) */
  focus(id: CastId | MateId | "you" | "wide") {
    if (!this.cine.on) {
      this.cine.on = true;
      this.cine.pos.copy(this.camera.position);
      this.cine.look.copy(this.camera.position).add(this.camera.getWorldDirection(new THREE.Vector3()));
    }
    const head = (o: THREE.Object3D) => o.position.clone().setY(o.position.y + 1.6);
    const eye = this.pos.clone().setY(this.pos.y + 1.6);
    if (id === "wide") {
      const c = this.game.stage === "prologue" ? new THREE.Vector3(MEETING_CENTER.x, terrainHeight(MEETING_CENTER.x, MEETING_CENTER.z), MEETING_CENTER.z) : this.pos.clone();
      this.cineTo(c.clone().add(new THREE.Vector3(4.5, 3.4, 5)), c.clone().setY(c.y + 1), 1.2);
      return;
    }
    if (id === "you") {
      const t = this.lastSpeaker ? head(this.lastSpeaker) : eye.clone().add(new THREE.Vector3(0, 0, -3));
      const dir = t.clone().sub(eye).setY(0).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      this.cineTo(eye.clone().addScaledVector(dir, -0.9).addScaledVector(perp, 0.55).setY(eye.y + 0.12), t, 1.6);
      return;
    }
    const o = this.cast(id);
    if (!o) return;
    this.lastSpeaker = o;
    const h = head(o);
    const dir = eye.clone().sub(h).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    this.cineTo(h.clone().addScaledVector(dir, 2.1).addScaledVector(perp, 0.75).setY(h.y + 0.05), h.clone().setY(h.y - 0.05), 1.6);
  }
  private cast(id: CastId | MateId) {
    return (this.npc as Record<string, THREE.Object3D | undefined>)[id];
  }
  private cineCut(pos: THREE.Vector3, look: THREE.Vector3) {
    this.cine.on = true;
    this.cine.pos.copy(pos);
    this.cine.tpos.copy(pos);
    this.cine.look.copy(look);
    this.cine.tlook.copy(look);
  }
  private cineTo(pos: THREE.Vector3, look: THREE.Vector3, speed: number) {
    this.cine.tpos.copy(pos);
    this.cine.tlook.copy(look);
    this.cine.speed = speed;
  }
  endCine() {
    this.cine.on = false;
    this.lastSpeaker = null;
  }
  endPrologue() {
    const g = this.game;
    g.stage = "escape";
    this.endCine();
    this.frozen = false;
    this.squad.get("laghrour").joined = true;
    this.squad.get("adjoul").joined = true;
    this.applyWorldFlags();
    this.teleport(PLAYER_MEET.x, PLAYER_MEET.z, Math.PI / 2);
    this.squad.regroup(this.pos, this.yaw);
    this.saveCheckpoint("start", true);
    window.setTimeout(() => this.bark("laghrour", "join", "نحن خلفك. انحنِ نَنحنِ، توقّف نتوقّف. البوشكارة عند المقهى — خذ الزقاق الخلفي.", "We're behind you. Crouch and we crouch. The informer's at the café — take the back lane."), 1200);
  }
  /** Azawi's challenge; returns true when the password is right */
  answerPassword(correct: boolean) {
    const g = this.game;
    g.passwordTries++;
    if (!correct) {
      g.trust = Math.max(0, g.trust - 2);
      return false;
    }
    return true;
  }
  resolveAzawi() {
    const g = this.game;
    const az = this.squad.get("azawi");
    az.joined = true;
    g.binoculars = true;
    g.stage = "recon";
    this.endCine();
    this.frozen = false;
    this.squad.regroup(this.pos, this.yaw);
    this.opts.onToast?.("الفوج اكتمل · المنظار معك — اضغط B أو الزر الأيمن", "The squad is complete · Binoculars: hold B / right mouse");
    this.saveCheckpoint("meet");
  }
  /** called when the planning board is confirmed */
  applyPlan(plan: Plan) {
    const g = this.game;
    g.plan = plan;
    g.stage = "infiltrate";
    g.armed = true;
    g.weapon = "pistol";
    g.ammo.pistol = { mag: 8, reserve: 24 };
    g.signal = plan.diversion === "fire" || plan.entry === "gate" ? "ready" : null;
    this.garrison.phoneCut = plan.diversion === "phone" || g.radioCut;
    this.endCine();
    this.frozen = false;
    this.applyWorldFlags();
    this.squad.regroup(this.pos, this.yaw);
    this.saveCheckpoint("plan");
  }
  endDialogue() {
    this.endCine();
    this.frozen = false;
  }

  taggedCount() {
    const comp = this.garrison.soldiers.filter((s) => s.def.zone === "compound" && s.role !== "sleeper" && s.role !== "reinforce" && s.def.id !== "planton");
    return { tagged: comp.filter((s) => s.tagged).length, total: comp.length };
  }

  mapState(): MapState {
    const obj = this.targetFor();
    return {
      player: { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
      soldiers: this.garrison.soldiers.filter((s) => s.tagged && s.state !== "inactive").map((s) => ({ x: s.pos.x, z: s.pos.z, yaw: s.yaw, state: s.state, role: s.role })),
      allies: [...this.allies.filter((a) => a.active).map((a) => ({ x: a.pos.x, z: a.pos.z })), ...this.squad.joined().map((m) => ({ x: m.pos.x, z: m.pos.z }))],
      beams: this.garrison.beams.filter((b) => b.on).map((b) => ({ x: b.target.x, z: b.target.z })),
      objective: obj ? { x: obj.x, z: obj.z } : null,
      wireCut: this.game.wireCut, doorOpen: this.game.doorOpen, generatorOff: this.game.generatorOff,
      charges: this.game.charges, exploded: this.game.exploded,
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

  /** Q — follow / hold */
  toggleOrder() {
    if (this.frozen || !this.squad.joined().length) return;
    const o = this.squad.order === "follow" ? "hold" : "follow";
    this.squad.setOrder(o);
    this.opts.onToast?.(o === "hold" ? "الفوج: اثبتوا مكانكم" : "الفوج: اتبعوني", o === "hold" ? "Squad: hold position" : "Squad: on me");
  }
  /** Z — send a mate after the marked soldier under the crosshair */
  orderStrike() {
    if (this.frozen) return;
    const s = this.strikeCandidate();
    if (!s) return;
    const m = this.squad.strike(s);
    if (m) this.opts.onBark?.(m.id, "سأتكفّل به.", "I'll take him.");
  }
  private strikeCandidate(): Soldier | null {
    if (!this.game.armed || this.garrison.alarm >= 2 || this.squad.strikeCd > 0 || !this.squad.joined().length) return null;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    let best: Soldier | null = null, ba = 0.06;
    for (const s of this.garrison.soldiers) {
      if (!s.tagged || !s.alive || s.role === "tower" || s.def.zone !== "compound") continue;
      if (s.state === "alert" || s.state === "hunt" || s.suspicion > 0.5) continue;
      const c = s.pos.clone().setY(s.pos.y + 1.1).sub(origin);
      if (c.length() > 45) continue;
      const ang = c.normalize().angleTo(dir);
      if (ang < ba) {
        best = s;
        ba = ang;
      }
    }
    return best;
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
        this.opts.onBark?.("boucetta", "النار مشتعلة عند الطريق. حرّاس الباب يتحرّكون — الآن!", "The fire's lit by the road. The gate guards are moving — now!");
      }
      if (g.plan?.entry === "gate") {
        g.assaultT = 0;
        this.opts.onToast?.("الهجوم على الباب! ادخل الآن", "The gate assault begins — go in now!");
        this.garrison.raise(2, "assault", new THREE.Vector3(GATE.x, COMPOUND_Y, GATE.z + 4));
      }
    }, 2200);
  }

  private stageIndex(s: Stage = this.game.stage) {
    return STAGE_ORDER.indexOf(s);
  }

  private targetFor(): { x: number; z: number } | null {
    const g = this.game;
    switch (g.stage) {
      case "escape": return CEMETERY;
      case "meet": return MESSAOUD;
      case "recon": return KEF_TOP;
      case "plan": return LAKHDAR;
      case "infiltrate": {
        const e = g.plan?.entry;
        return e === "drain" ? DRAIN : e === "wire" ? { x: WIRE.x, z: WIRE.z - 1 } : GATE;
      }
      case "hq":
        if (!g.insideHQ) return { x: HQ_WINDOW.x, z: HQ_WINDOW.z - 1.2 };
        return !g.maps ? HQ_ITEMS.maps : HQ_ITEMS.safe;
      case "armory": {
        if (!g.doorOpen) return ARMORY_DOOR;
        const i = g.racks.findIndex((t) => !t);
        return i >= 0 ? { x: RACKS[i][0], z: RACKS[i][1] + 1 } : ARMORY_DOOR;
      }
      case "sabotage": {
        let best: { x: number; z: number } | null = null, bd = Infinity;
        TRUCKS.forEach((t, i) => {
          if (g.charges[i]) return;
          const d = Math.hypot(t.x - this.pos.x, t.z - this.pos.z);
          if (d < bd) {
            bd = d;
            best = { x: t.x - 1.6, z: t.z };
          }
        });
        return best;
      }
      case "exfil": return RALLY;
      default: return null;
    }
  }

  private squadNear(r: number) {
    const j = this.squad.joined();
    return !j.length || j.some((m) => m.pos.distanceTo(this.pos) < r);
  }

  private findAct(): Act | null {
    const g = this.game, p = this.pos;
    const near = (x: number, z: number, r = 2) => Math.hypot(p.x - x, p.z - z) < r;
    const si = this.stageIndex();
    if (g.stage === "meet" && near(MESSAOUD.x, MESSAOUD.z, 2.6))
      return { id: "azawi", ar: "اقترب من الرجل عند الضريح", en: "Approach the man by the marabout", x: MESSAOUD.x, z: MESSAOUD.z, run: () => this.talk("azawi") };
    if (near(RABAH_DOOR.x, RABAH_DOOR.z, 2.8) || near(LAKHDAR.x, LAKHDAR.z, 2.8)) {
      if (g.stage === "plan") return { id: "chihani", ar: "اجلس مع شيحاني بشير", en: "Sit down with Chihani Bachir", x: LAKHDAR.x, z: LAKHDAR.z, run: () => this.talk("chihani") };
      if (si < this.stageIndex("plan")) {
        const t = this.taggedCount();
        return { id: "mill-early", ar: g.stage === "recon" ? `بوستة: «أين التقرير؟ علّم ${RECON_REQ} حرّاس من كاف الغراب» (${t.tagged}/${RECON_REQ})` : "بوستة: «ليس قبل لقاء العزوي»", en: g.stage === "recon" ? `Boucetta: "Where's the report? Mark ${RECON_REQ} guards from Crow's Kef"` : `Boucetta: "Not before you meet Azawi"`, x: RABAH_DOOR.x, z: RABAH_DOOR.z, blocked: true };
      }
    }
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
    // HQ intel
    if (g.insideHQ) {
      const it = HQ_ITEMS;
      if (!g.maps && near(it.maps.x, it.maps.z, 1.6))
        return { id: "maps", ar: `خذ ${it.maps.ar}`, en: `Take the ${it.maps.en.toLowerCase()}`, hold: 2, x: it.maps.x, z: it.maps.z, run: () => {
          g.maps = true;
          this.applyWorldFlags();
          this.bark("azawi", "maps", "مواقعهم كلّها… المراكز، الدوريات، مستودعات الوقود. بن بولعيد ينتظر هذه منذ سنة.", "Every post they have… patrols, fuel depots. Ben Boulaïd has waited a year for this.");
          this.afterIntel();
        } };
      if (!g.hasKey && near(it.safe.x + 0.9, it.safe.z, 1.5))
        return { id: "safe", ar: `افتح ${it.safe.ar}`, en: `Crack the ${it.safe.en.toLowerCase()}`, hold: 3, noise: 3, x: it.safe.x, z: it.safe.z, run: () => {
          g.hasKey = true;
          this.opts.onToast?.("مفتاح مخزن السلاح معك", "You have the armory key");
          this.afterIntel();
        } };
      if (!g.records && near(it.records.x - 0.6, it.records.z, 1.5))
        return { id: "records", ar: `خذ ${it.records.ar} (اختياري)`, en: `Take the ${it.records.en.toLowerCase()} (optional)`, hold: 2, x: it.records.x, z: it.records.z, run: () => {
          g.records = true;
          this.applyWorldFlags();
          this.bark("laghrour", "records", "أسماء البوشكارة… سيعرف كل دوّار من باعه.", "The informers' names… every village will know who sold it.");
        } };
      if (!g.radioCut && near(it.radio.x, it.radio.z, 1.5))
        return { id: "radio", ar: "عطّل اللاسلكي (اختياري — لا تعزيزات)", en: "Wreck the radio (optional — no reinforcements)", hold: 3, noise: 4, x: it.radio.x, z: it.radio.z, run: () => {
          g.radioCut = true;
          this.garrison.phoneCut = true;
          this.applyWorldFlags();
          this.opts.onToast?.("اللاسلكي معطّل — لن يطلبوا النجدة", "Radio wrecked — they can't call for help");
        } };
    }
    if (!g.doorOpen && near(ARMORY_DOOR.x, ARMORY_DOOR.z + 0.6, 1.9)) {
      if (g.hasKey) return { id: "door", ar: "افتح المخزن بالمفتاح", en: "Unlock the armory", x: ARMORY_DOOR.x, z: ARMORY_DOOR.z, run: () => this.openArmory() };
      return { id: "door", ar: "باب حديدي مقفل — المفتاح في خزنة القائد", en: "Iron door, locked — the key is in the commander's safe", x: ARMORY_DOOR.x, z: ARMORY_DOOR.z, blocked: true };
    }
    if (g.doorOpen) {
      for (let i = 0; i < RACKS.length; i++) {
        if (g.racks[i] || !near(RACKS[i][0], RACKS[i][1] + 0.8, 1.3)) continue;
        if (!this.squadNear(12)) return { id: `rack${i}`, ar: "رفاقك بعيدون — من سيحمل البنادق؟ (Q)", en: "Your squad is too far — who carries the rifles? (Q)", x: RACKS[i][0], z: RACKS[i][1], blocked: true };
        return { id: `rack${i}`, ar: "خذوا البنادق", en: "Take the rifles", hold: 2, x: RACKS[i][0], z: RACKS[i][1], run: () => this.takeRack(i) };
      }
    }
    // vehicles
    if (si >= this.stageIndex("sabotage") && !g.exploded) {
      for (let i = 0; i < TRUCKS.length; i++) {
        const t = TRUCKS[i];
        if (g.charges[i] || Math.abs(p.x - t.x) > 2.6 || Math.abs(p.z - t.z) > 4.2) continue;
        return { id: `charge${i}`, ar: `ازرع العبوة في ${t.ar}`, en: `Plant the charge on the ${t.en}`, hold: 3, noise: 2, x: t.x, z: t.z, run: () => this.plantCharge(i) };
      }
    }
    return null;
  }

  private afterIntel() {
    const g = this.game;
    if (g.stage === "hq" && g.maps && g.hasKey) {
      g.stage = "armory";
      this.saveCheckpoint("hq");
    }
  }

  private talk(who: Who) {
    this.frozen = true;
    this.vel.set(0, 0, 0);
    this.opts.onDialogue?.(who);
  }

  private openArmory() {
    this.game.doorOpen = true;
    this.applyWorldFlags();
  }

  private takeRack(i: number) {
    const g = this.game;
    g.racks[i] = true;
    g.rifles += 4;
    this.rackRifles[i].visible = false;
    if (g.weapon !== "rifle") {
      g.weapon = "rifle";
      g.ammo.rifle = { mag: 5, reserve: 25 };
      this.opts.onToast?.("بندقية MAS-36 في يدك", "MAS-36 rifle in hand");
    } else g.ammo.rifle.reserve += 10;
    if (g.stage === "armory") {
      g.stage = "sabotage";
      this.saveCheckpoint("armory");
      this.bark("laghrour", "sabotage", "السلاح معنا. الآن المركبات — ثلاث عبوات، ولا يلحق بنا أحد.", "We have the guns. Now the vehicles — three charges, and nobody follows us.");
    }
  }

  private plantCharge(i: number) {
    const g = this.game;
    g.charges[i] = true;
    this.trucks[i].charge.visible = true;
    this.opts.audio?.click();
    if (g.charges.every(Boolean) && g.chargeT < 0) {
      g.chargeT = CHARGE_TIMER;
      g.stage = "exfil";
      // whoever walks past the armory now finds it empty
      g.discoveryT = g.discoveryT > 0 ? Math.min(g.discoveryT, 8) : 8;
      this.saveCheckpoint("charges");
      this.bark("laghrour", "armed", `الصواعق تعمل — ${CHARGE_TIMER} ثانية. إلى الجبل!`, `Timers running — ${CHARGE_TIMER} seconds. To the mountains!`);
    }
  }

  private explode() {
    const g = this.game;
    g.exploded = true;
    g.chargeT = -1;
    this.applyWorldFlags();
    this.opts.audio?.explosion();
    this.shake = 1.4;
    let c = new THREE.Vector3();
    this.trucks.forEach((t) => {
      const p = new THREE.Vector3(t.x, terrainHeight(t.x, t.z) + 1.4, t.z);
      c.add(p);
      this.blasts.push({ pos: p, t: 0, i: this.blasts.length });
      const d = this.pos.distanceTo(p);
      if (d < 10) {
        g.health -= 160 * (1 - d / 10);
        g.hurtT = 0;
        if (g.health <= 0) this.fail("killed");
      }
      for (const s of this.garrison.soldiers) if (s.alive && s.pos.distanceTo(p) < 7) this.garrison.damage(s, 999, false);
    });
    c = c.multiplyScalar(1 / this.trucks.length);
    this.flash.position.copy(c);
    this.flash.distance = 90;
    this.flash.intensity = 900;
    // no vehicles, no pursuit: the garrison loses the squad in the smoke
    this.garrison.raise(2, "explosion", c);
    this.garrison.reinforceIn = -1;
    this.garrison.phoneCut = true;
    this.garrison.lastKnownAge = 30;
    this.opts.onFinale?.();
    this.townAttack();
    this.bark("laghrour", "boom", "الله أكبر! في كل الأوراس الآن… الثورة بدأت.", "Allahu akbar! All over the Aurès, right now… the revolution has begun.");
    if (Math.hypot(this.pos.x - RALLY.x, this.pos.z - RALLY.z) < 9) g.finaleT = 5;
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
    if (g.finaleT > 0) {
      g.finaleT -= dt;
      if (g.finaleT <= 0) this.finish();
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
    this.squad.update(dt, { pos: this.pos, yaw: this.yaw, crouch: pl.crouch, speed: pl.hs }, this.garrison);
    if (this.frozen) return; // caught this frame

    const si = this.stageIndex();
    const inside = insideCompound(this.pos.x, this.pos.z, -0.6);
    g.insideHQ = insideHQ(this.pos.x, this.pos.z);
    // ---- gating: the compound is off-limits until there is a plan ----
    if (!g.armed && insideCompound(this.pos.x, this.pos.z, RESTRICT_PAD)) {
      g.restrictT += dt;
      this.bark("adjoul", `restrict${si}`, "ليس الآن! بلا خطة سنموت عند السياج — ونكشف الأوراس كلّه.", "Not now! Without a plan we die at the wire — and expose the whole Aurès.");
      if (g.restrictT > 6) {
        g.restrictT = 0;
        this.fail("compromised");
        return;
      }
    } else g.restrictT = Math.max(0, g.restrictT - dt * 2);

    // ---- travel beats: the squad talks on the long walks ----
    const dist = (p: { x: number; z: number }) => Math.hypot(this.pos.x - p.x, this.pos.z - p.z);
    if (g.stage === "escape" && dist(SAFEHOUSE) > 45) this.bark("adjoul", "leave", "المقبرة جنوباً على طرف الوادي، مئة وخمسون متراً. دورية الدرك تمشي في المسلك شرقاً — لا نقترب منها.", "The cemetery is 150 m south, on the edge of the oued. The gendarme patrol walks the track to the east — keep clear of it.");
    if (g.stage === "recon" && this.pos.z < 300 && this.pos.z > 120) this.bark("laghrour", "town", "انظر شرقاً… أضواء خنشلة. الإخوة هناك ينتظرون منتصف الليل مثلنا: الدرك، الشرطة، المحوّل.", "Look east… the lights of Khenchela. The brothers there wait for midnight like us: the gendarmerie, the police, the transformer.");
    if (g.stage === "recon" && dist(KEF) < 45) this.bark("azawi", "keffoot", "اصعد إلى القمة وانبطح. كشّافاتهم لا تبلغ هنا، لكن المنظار يبلغهم.", "Climb to the top and lie flat. Their searchlights don't reach here — but the binoculars reach them.");
    if (g.stage === "plan" && dist(MILL) < 110) this.bark("adjoul", "millnear", "المعصرة على ضفّة الوادي. بوستة سبقنا بالعبوات.", "The mill is on the bank of the oued. Boucetta got there ahead of us with the charges.");
    if (g.stage === "infiltrate" && dist(MILL) > 70) this.bark("laghrour", "approach", "مئتا متر حتى السياج. الحصى قرب الطريق يفضحنا — نمشي في الوادي، منحنين.", "Two hundred metres to the wire. The gravel by the road gives us away — we walk the oued, crouched.");
    if (g.stage === "exfil" && g.exploded && dist(RALLY) < 130) this.bark("laghrour", "nearrally", "نقطة التفرّق أمامنا. من هناك كل رجل إلى جبله.", "The dispersal point is ahead. From there every man to his mountain.");

    // ---- stage triggers ----
    if (g.stage === "escape" && Math.hypot(this.pos.x - CEMETERY.x, this.pos.z - CEMETERY.z) < 8) g.stage = "meet";
    if (g.stage === "recon") {
      const t = this.taggedCount();
      if (t.tagged >= 3) this.bark("azawi", "recon3", `${t.tagged}… واصل. الحرّاس عند الباب والأبراج أولاً.`, `${t.tagged}… keep going. The gate and the towers first.`);
      if (t.tagged >= RECON_REQ) {
        g.stage = "plan";
        this.bark("laghrour", "recon", "يكفي. نعرف أين يقفون. شيحاني ينتظرنا في المعصرة.", "Enough. We know where they stand. Chihani is waiting at the mill.");
        this.saveCheckpoint("recon");
      }
    }
    if (g.armed && !g.inside && inside) {
      g.inside = true;
      if (g.stage === "infiltrate") g.stage = "hq";
      this.saveCheckpoint("inside");
      this.bark("laghrour", "inside", "القيادة أمامنا. الحارس لا يترك الباب — في الجدار الخلفي ثغرة، ازحف عبرها.", "The HQ is ahead. The sentry never leaves the door — there's a breach in the back wall, crawl through.");
    }
    if (g.insideHQ && g.stage === "hq") this.bark("azawi", "hqin", "مكتب القائد غرباً. انتبه للحاجب في الممرّ.", "The commander's office is west. Watch the clerk in the corridor.");
    if (si >= this.stageIndex("sabotage") && g.discoveryT < 0 && Math.hypot(this.pos.x - ARMORY.x, this.pos.z - ARMORY.z) > 7) g.discoveryT = 90;
    if (g.discoveryT > 0) {
      g.discoveryT -= dt;
      if (g.discoveryT <= 0 && this.garrison.alarm < 2) {
        this.opts.onToast?.("الرقيب اكتشف المخزن الفارغ!", "The sergeant found the empty armory!");
        this.garrison.raise(2, "armory", new THREE.Vector3(ARMORY.x, COMPOUND_Y, ARMORY.z));
      }
    }
    if (g.chargeT > 0) {
      const prev = g.chargeT;
      g.chargeT -= dt;
      if (Math.floor(prev) !== Math.floor(g.chargeT) && g.chargeT < 10) this.opts.audio?.click();
      if (g.chargeT <= 0) this.explode();
    }
    const atRally = Math.hypot(this.pos.x - RALLY.x, this.pos.z - RALLY.z) < 7;
    if (g.stage === "exfil" && atRally && g.exploded && g.finaleT < 0) g.finaleT = 0.8;

    // ---- gate assault: the cell takes the sentries first ----
    const ally = this.allies[0];
    if (g.assaultT >= 0) {
      g.assaultT += dt;
      for (const [id, t] of [["gate1", 1.2], ["gate2", 2.6]] as const) {
        const s = this.garrison.get(id);
        if (s.alive && g.assaultT > t) this.allyShoot(ally, s, true);
      }
    }
    // support gives covering fire once the shooting starts
    if (ally.active && (this.garrison.alarm >= 2 || g.assaultT >= 0)) {
      ally.fireCd -= dt;
      if (ally.fireCd <= 0) {
        ally.fireCd = 2 + Math.random() * 1.5;
        const eye = ally.pos.clone().setY(ally.pos.y + 1.4);
        let best: Soldier | null = null, bd = ally.covering ? 38 : 28;
        for (const s of this.garrison.soldiers) {
          if (!s.alive || (s.state !== "hunt" && s.state !== "alert" && s.state !== "search")) continue;
          const d = s.pos.distanceTo(ally.pos);
          if (d < bd && lineClear(eye.x, eye.y, eye.z, s.pos.x, s.pos.y + 1.3, s.pos.z)) {
            best = s;
            bd = d;
          }
        }
        if (best) this.allyShoot(ally, best, Math.random() < 0.32);
      }
    }
    // ---- diversion fire ----
    if (g.diversionStarted >= 0) {
      const v = this.fireFlicker.update(g.elapsed, dt);
      this.fireLight.intensity = 60 * v;
      this.fireSprites.forEach((s, i) => {
        s.position.y = 0.4 + ((i * 0.32 + g.elapsed * 0.8) % 2.2);
        (s.material as THREE.SpriteMaterial).opacity = v * (1 - s.position.y / 2.8);
      });
      this.opts.audio?.setFire(Math.max(0.05, 1 - this.pos.distanceTo(this.fireLight.position) / 60));
    }
    this.glow += ((this.garrison.alarm >= 2 ? 1 : 0) + (g.exploded ? 1 : 0) - this.glow) * dt * 0.3;

    // ---- interaction & holds ----
    this.act = this.findAct();
    const a = this.act;
    const holding = this.keys.has("KeyE") || this.touchBtn.interact;
    if (a && a.hold && !a.blocked && holding) {
      if (this.hold.id !== a.id) this.hold = { id: a.id, t: 0 };
      this.hold.t += dt;
      const tick = (period: number) => Math.floor(this.hold.t / period) !== Math.floor((this.hold.t - dt) / period);
      if (a.noise && tick(0.6)) {
        this.noiseT = 0.35;
        if (a.id === "safe" || a.id === "radio") this.opts.audio?.scrape();
      }
      if (a.id === "wire" && tick(0.8)) this.opts.audio?.snip();
      if (a.id.startsWith("charge") && tick(0.5)) this.opts.audio?.scrape();
      if (this.hold.t >= a.hold) {
        this.hold = { id: "", t: 0 };
        a.run?.();
      }
    } else this.hold = { id: "", t: 0 };
    if (this.noiseT > 0 && a?.noise) this.stim.noise = Math.max(this.stim.noise, a.noise);

    // ---- binocular marking ----
    if (this.binocActive()) {
      const origin = this.camera.getWorldPosition(new THREE.Vector3());
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      let best: Soldier | null = null, ba = 0.035;
      for (const s of this.garrison.soldiers) {
        if (s.tagged || !s.alive || !this.garrison.zoneActive[s.def.zone] || s.def.zone !== "compound") continue;
        const c = s.pos.clone().setY(s.pos.y + 1.1).sub(origin);
        const d = c.length();
        if (d > 220) continue;
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
    this.strikeTarget = this.binocActive() ? null : this.strikeCandidate();
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
      // ghost: the only siren came from the empty armory / the charges, and nobody was shot
      ghost: (g.sirenCause === null || g.sirenCause === "armory" || g.sirenCause === "explosion") && g.kills === 0 && this.squad.kills === 0,
      rifles: g.rifles, kills: g.kills + this.squad.kills, takedowns: g.takedowns + this.squad.strikes, deaths: g.deaths,
      tagged: t.tagged, tagTotal: t.total, clock: "00:00", plan: g.plan, passwordTries: g.passwordTries, trust: g.trust,
      maps: g.maps, records: g.records, radioCut: g.radioCut, charges: g.charges.filter(Boolean).length,
    });
    this.pause();
  }

  clockString() {
    const m = Math.floor(START_MIN + this.game.elapsed / SEC_PER_MIN);
    if (this.game.exploded || this.game.stage === "ended") return "00:00";
    return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  private hud(): HudState {
    const g = this.game, t = this.taggedCount();
    const [objAr, objEn] = OBJ[g.stage];
    let subAr: string | undefined, subEn: string | undefined;
    const pick = (ar: string, en: string) => {
      subAr = ar;
      subEn = en;
    };
    switch (g.stage) {
      case "escape": pick("البوشكارة يراقب الشارع، ودركيّ بفانوس عند فم الوادي. الظل والانحناء يخفيانك — رفاقك يقلّدونك.", "The informer watches the street; a gendarme with a lantern guards the oued. Shadow and crouching hide you — your squad copies you."); break;
      case "recon": pick(`علّم ${RECON_REQ} حرّاس على الأقل بالمنظار (B) — ${t.tagged}/${RECON_REQ}`, `Mark at least ${RECON_REQ} guards with the binoculars (B) — ${t.tagged}/${RECON_REQ}`); break;
      case "infiltrate": {
        const e = g.plan?.entry;
        if (e === "drain") pick("ازحف منحنياً (C) عبر قناة الصرف تحت السياج الغربي", "Crawl (C) through the drain under the west fence");
        else if (e === "wire") pick("اقطع السلك الشمالي خلف المخزن (امسك E)", "Cut the north wire behind the armory (hold E)");
        else pick(g.assaultT >= 0 ? "ادخل من الباب وسط الاشتباك" : "اضغط G لإعطاء إشارة الهجوم على الباب", g.assaultT >= 0 ? "Go through the gate in the firefight" : "Press G to signal the gate assault");
        if (g.signal === "ready" && g.plan?.diversion === "fire") {
          subAr += " · G: إشارة بوستة لإشعال النار";
          subEn += " · G: signal Boucetta's fire";
        }
        break;
      }
      case "hq":
        pick(`${g.maps ? "✓" : "○"} الخرائط · ${g.hasKey ? "✓" : "○"} مفتاح المخزن · اختياري: سجلّ المخبرين، اللاسلكي`, `${g.maps ? "✓" : "○"} maps · ${g.hasKey ? "✓" : "○"} armory key · optional: informers' register, radio`);
        break;
      case "armory": pick(g.doorOpen ? "خذوا البنادق — رفاقك يحملونها معك" : "المفتاح معك", g.doorOpen ? "Take the rifles — your squad carries them" : "You have the key"); break;
      case "sabotage": {
        const n = g.charges.filter(Boolean).length;
        pick(`العبوات ${n}/3 · امسك E عند كل مركبة${g.rifles < 12 ? " · ما زالت بنادق في المخزن" : ""}`, `Charges ${n}/3 · hold E at each vehicle${g.rifles < 12 ? " · rifles still in the armory" : ""}`);
        break;
      }
      case "exfil":
        if (!g.exploded) pick("ابتعدوا عن المركبات واتجهوا إلى الوادي", "Get clear of the vehicles and head for the oued");
        else pick("اتبع الوادي شمالاً-غرباً إلى الجبل", "Follow the oued north-west into the mountains");
        break;
    }
    if (g.discoveryT > 0 && this.garrison.alarm < 2 && g.stage !== "exfil") {
      subAr += ` · سيُكتشف المخزن بعد ${Math.ceil(g.discoveryT)} ث`;
      subEn += ` · armory discovered in ${Math.ceil(g.discoveryT)}s`;
    }
    const a = this.act;
    const W = g.weapon ? WEAPONS[g.weapon] : null;
    const tk = g.armed && !this.frozen ? this.garrison.takedownTarget(this.pos, this.crouchAmt > 0.5 || Math.hypot(this.vel.x, this.vel.z) < 1.5) : null;
    const st = this.strikeTarget;
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
      squad: this.squad.mates.filter((m) => m.joined).map((m) => ({ id: m.id, state: m.state })),
      order: this.squad.order, strikeReady: this.squad.strikeCd <= 0, strikeCd: Math.ceil(this.squad.strikeCd), strike: !!st,
      charges: g.charges.filter(Boolean).length, chargeT: g.chargeT > 0 ? Math.ceil(g.chargeT) : -1,
      restrict: g.restrictT > 0.05 ? Math.max(0, Math.ceil(6 - g.restrictT)) : -1,
      intel: { maps: g.maps, key: g.hasKey, records: g.records, radio: g.radioCut },
      reconReq: RECON_REQ,
    };
  }

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
    // squad name tags
    for (const m of this.squad.joined()) {
      const p = project(m.pos.x, m.pos.y + (m.crouch ? 1.55 : 2.2), m.pos.z);
      if (!p || this.cine.on) continue;
      const d = m.pos.distanceTo(this.pos);
      c.globalAlpha = THREE.MathUtils.clamp(1.3 - d / 40, 0.35, 0.95);
      c.fillStyle = m.state === "strike" ? "#ffd27a" : "#9cf0b6";
      c.font = "11px system-ui";
      c.textAlign = "center";
      c.fillText(`${MATE_NAMES[m.id]}${m.state === "hold" ? " ⏸" : m.state === "strike" ? " ⚔" : ""}`, p.x, p.y);
      c.textAlign = "left";
      c.globalAlpha = 1;
    }
    // strike target
    if (this.strikeTarget) {
      const s = this.strikeTarget, p = project(s.pos.x, s.pos.y + 1.0, s.pos.z);
      if (p) {
        c.strokeStyle = "rgba(156,240,182,0.85)";
        c.lineWidth = 1.5;
        c.strokeRect(p.x - 14, p.y - 26, 28, 52);
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
      this.grassTimer = 0.2;
      this.updateGrass(1);
    }
    this.chunkTimer -= dt;
    if (this.chunkTimer <= 0) {
      this.chunkTimer = 0.12;
      this.updateTerrain(1);
    }
    this.vegTimer -= dt;
    if (this.vegTimer <= 0) {
      this.vegTimer = 0.5;
      this.updateVegetation();
    }
    // camera
    const hs = pl.hs;
    const bobAmp = Math.min(hs / 5, 1) * (1 - this.crouchAmt * 0.5);
    const eye = THREE.MathUtils.lerp(EYE_STAND, EYE_CROUCH, this.crouchAmt);
    this.recoil *= Math.exp(-dt * 12);
    this.camera.position.set(this.pos.x + Math.cos(this.stepPhase) * 0.03 * bobAmp, this.pos.y + eye + Math.abs(Math.sin(this.stepPhase)) * 0.06 * bobAmp + Math.sin(t * 1.1) * 0.012, this.pos.z);
    this.camera.rotation.set(this.pitch + this.recoil + Math.sin(t * 0.7) * 0.003, this.yaw + Math.sin(t * 0.43) * 0.003, Math.cos(this.stepPhase) * 0.006 * bobAmp, "YXZ");
    const binoc = this.binocActive();
    if (this.cine.on) {
      const k = 1 - Math.exp(-dt * this.cine.speed);
      this.cine.pos.lerp(this.cine.tpos, k);
      this.cine.look.lerp(this.cine.tlook, k);
      this.camera.position.copy(this.cine.pos);
      this.camera.position.x += Math.sin(t * 0.37) * 0.025;
      this.camera.position.y += Math.sin(t * 0.29) * 0.018;
      this.camera.lookAt(this.cine.look);
    }
    if (this.shake > 0.002) {
      const a = this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.rotation.z += (Math.random() - 0.5) * a * 0.3;
      this.shake *= Math.exp(-dt * 2.5);
    }
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density += ((binoc ? FOG_BINOC : FOG) - fog.density) * (1 - Math.exp(-dt * 6));
    this.updateTown(dt);
    const fov = this.cine.on ? 44 : binoc ? 18 : this.fovBase;
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
    this.flash.intensity *= Math.exp(-dt * (this.flash.distance > 30 ? 3 : 40));
    // explosions, burning wrecks, charge timers
    for (const b of this.blasts) {
      b.t += dt;
      const fx = this.blastSprites[b.i];
      if (!fx) continue;
      const f = fx.fire;
      f.visible = b.t < 1.6;
      f.position.copy(b.pos).setY(b.pos.y + 1.5 + b.t * 4);
      f.scale.setScalar(3 + Math.min(1, b.t * 2.5) * 18);
      (f.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - b.t / 1.6);
      fx.smoke.forEach((sp, j) => {
        const tt = b.t - j * 0.35;
        sp.visible = tt > 0 && tt < 14;
        if (!sp.visible) return;
        sp.position.set(b.pos.x + Math.sin(j * 2.1) * 1.2 + tt * 0.35, b.pos.y + 1 + tt * 1.6, b.pos.z + Math.cos(j * 1.7) * 1.2);
        sp.scale.setScalar(4 + tt * 2);
        (sp.material as THREE.SpriteMaterial).opacity = 0.75 * Math.min(1, tt) * (1 - tt / 14);
      });
    }
    if (this.game.exploded) {
      const v = this.fireFlicker.update(t, dt);
      this.wreckLight.intensity = 45 * v;
      this.wreckFires.forEach((f, i) => ((f.material as THREE.SpriteMaterial).opacity = v * (0.7 + 0.3 * Math.sin(t * 9 + i))));
    }
    const fast = this.game.chargeT > 0 && this.game.chargeT < 10;
    for (const tr of this.trucks) tr.led.emissiveIntensity = Math.sin(t * (fast ? 22 : 7)) > 0 ? 6 : 0.4;
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
    this.adaptResolution(dt);
    this.drawOverlay();
    if (!this.readyFired) {
      this.readyFired = true;
      this.opts.onReady?.();
    }
  };

  /** dynamic resolution: keep the frame time steady instead of dropping frames */
  private adaptResolution(dt: number) {
    const P = this.perf;
    P.acc += dt;
    P.n++;
    P.t += dt;
    if (P.t < 1.5) return;
    const avg = P.acc / P.n;
    P.acc = P.n = P.t = 0;
    let r = P.ratio;
    if (avg > 1 / 45 && r > P.min) r = Math.max(P.min, r - 0.15);
    else if (avg < 1 / 58 && r < P.max) r = Math.min(P.max, r + 0.1);
    if (r === P.ratio) return;
    P.ratio = r;
    this.renderer.setPixelRatio(r);
    this.fx.composer.setPixelRatio(r);
    this.fx.setSize(window.innerWidth, window.innerHeight);
  }

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
      // keep the view in sync so view-dependent logic (binoculars, strikes) behaves as in the render loop
      if (!this.cine.on) {
        this.camera.position.set(this.pos.x, this.pos.y + THREE.MathUtils.lerp(EYE_STAND, EYE_CROUCH, this.crouchAmt), this.pos.z);
        this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
        this.camera.updateMatrixWorld();
      }
    }
    this.opts.onHud?.(this.hud());
    return this.debug().game.stage;
  }
  /** test hooks */
  debug() {
    return { garrison: this.garrison, game: this.game, act: this.act, squad: this.squad, batched: this.batched, pixelRatio: this.perf.ratio };
  }
  skipTo(stage: "recon" | "plan" | "inside" | "hq" | "armory" | "sabotage") {
    const g = this.game;
    if (g.stage === "prologue") this.endPrologue();
    this.squad.mates.forEach((m) => (m.joined = true));
    g.binoculars = true;
    if (stage === "recon") {
      g.stage = "recon";
      this.teleport(KEF_TOP.x, KEF_TOP.z, Math.atan2(KEF_TOP.x, KEF_TOP.z + 55));
    } else if (stage === "plan") {
      g.stage = "plan";
      this.teleport(LAKHDAR.x + 1.6, LAKHDAR.z + 0.4, Math.PI / 2);
    } else {
      if (!g.plan) this.applyPlan({ entry: "drain", diversion: "fire" });
      g.inside = stage !== "inside";
      if (stage === "inside") this.teleport(DRAIN.x + 3, DRAIN.z, -Math.PI / 2);
      if (stage === "hq") {
        g.stage = "hq";
        this.teleport(HQ_WINDOW.x, HQ_WINDOW.z + 1.6, Math.PI);
      }
      if (stage === "armory" || stage === "sabotage") {
        g.maps = g.hasKey = true;
        g.stage = "armory";
        this.teleport(ARMORY_DOOR.x, ARMORY_DOOR.z + 2.5, 0);
      }
      if (stage === "sabotage") {
        g.doorOpen = true;
        this.takeRack(0);
        this.teleport(TRUCKS[2].x - 2.2, TRUCKS[2].z, -Math.PI / 2);
      }
    }
    this.applyWorldFlags();
    this.squad.regroup(this.pos, this.yaw);
  }
  /** used by the planning UI to draw the static plan */
  static layout() {
    return { BUILDINGS, TOWERS, COMPOUND, GATE, WIRE, DRAIN, GENERATOR, ARMORY, RALLY, DIVERSION_FIRE, PHONE_POLE, OUED, KEF, MILL, CHECKPOINT, VILLAGE, CEMETERY, SPAWN, HQ, TRUCKS, RESTRICT_PAD, ROAD_SETS, ROADS, TOWN, TOWN_BLOCKS, SAFEHOUSE, KEF_TOP, MAP };
  }
}
