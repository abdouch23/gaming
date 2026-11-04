// «الطريق إلى الجبل · The Road to the Mountain» — engine (level 2).
// Real Aurès terrain (SRTM-derived DEM) with an auto-generated landscape on top: slope/altitude-driven
// terrain material, procedural rocks, boulders, cedars and brush. Carry the wounded Lakhdar from the
// town edge to the shepherds' shelter, by the watched valley or the freezing ridge.
import * as THREE from "three";
import { mulberry32, makeGlowSprite, makeParticleField, createPostFX, Flicker, NOISE_GLSL, type PostFX } from "@/lib/lighting";
import { createGreenKit } from "@/lib/ported/greenworld";
import { buildHouses } from "@/lib/night/houses";
import { makeMujahid } from "@/lib/night/mujahid";
import type { Surface } from "@/lib/night/audio";
import type { BarracksAudio } from "@/lib/barracks/audio";
import {
  loadDem, initWorld, terrainHeight, splatAt, groundAt, solidAt, lineClear, coverAt, innerMask, inWater, coldAt, slopeAt, generateProps, addBox,
  nearest, pointAt, farRaw, STREAM_P, farHalf, demElevation, BOXES, PLAY, SPAWN, LAKHDAR_START, LEFT_TOWN, FORK, SHELTER, FIRE, LAKHDAR_REST, VALLEY_P, RIDGE_P,
  VALLEY, RIDGE, PATROL, OBSERVER, CACHE_VALLEY, CACHE_RIDGE, HOUSES, COLD_ZONES, PROFILE, smoothstep, type V2,
} from "@/lib/mountain/world";
import { Pursuers, type Stim } from "@/lib/mountain/pursuers";
import { BARKS, type MSpeaker } from "@/lib/mountain/story";

export type MStage = "bridge" | "leave" | "fork" | "route" | "shelter" | "loss" | "dawn" | "ended";
export type Route = "valley" | "ridge";
export interface MHud {
  stage: MStage;
  objAr: string; objEn: string; subAr?: string; subEn?: string;
  carrying: boolean;
  exhaustion: number;
  cold: number;
  health: number;
  suspicion: number;
  dog: boolean;
  alarm: number;
  visibility: "hidden" | "shadow" | "lit";
  prompt: { ar: string; en: string; hold: boolean; blocked?: boolean } | null;
  hold: number;
  ammo: { mag: number; reserve: number } | null;
  route: Route | null;
  water: boolean;
  supplies: number;
}
export interface MEnding { route: Route; exhaustion: number; doubt: number; minutes: number; falls: number; shots: number; supplies: number; detected: boolean }
export interface MMapState { player: { x: number; z: number; yaw: number }; lakhdar: { x: number; z: number }; ammar: { x: number; z: number }; guards: { x: number; z: number; yaw: number; alert: boolean }[]; dog: { x: number; z: number }; route: Route | null }
export interface MOptions {
  lowPower: boolean;
  audio?: BarracksAudio;
  onHud?: (h: MHud) => void;
  onReady?: () => void;
  onActiveChange?: (v: boolean) => void;
  onEvent?: (name: string) => void;
  onBark?: (who: MSpeaker, ar: string, en: string) => void;
  onToast?: (ar: string, en: string) => void;
  onCheckpoint?: (id: string) => void;
  onFail?: (why: "caught" | "killed") => void;
  onDialogue?: (kind: "fork" | "loss") => void;
  onDamage?: () => void;
}

const OBJ: Record<MStage, [string, string]> = {
  bridge: ["", ""],
  leave: ["احمل لخضر واخرج من طرف البلدة نحو السفح", "Carry Lakhdar out of the town edge, up the slope"],
  fork: ["ضع لخضر عند صخرة المفترق، واصعدها لترى الطريقين", "Set Lakhdar down at the fork rock and climb it to read the routes"],
  route: ["احمل لخضر إلى ملجأ الرعاة", "Carry Lakhdar to the shepherds' shelter"],
  shelter: ["ضع لخضر قرب النار", "Lay Lakhdar by the fire"],
  loss: ["", ""],
  dawn: ["", ""],
  ended: ["", ""],
};
const HORIZON = new THREE.Color().setRGB(0.03, 0.055, 0.085);
const DAWN_HORIZON = new THREE.Color().setRGB(0.2, 0.22, 0.26);
const MOON_DIR = new THREE.Vector3(-0.42, 0.5, 0.76).normalize();
const EYE = 1.65, EYE_CROUCH = 0.95, RADIUS = 0.3;
const SLOPE_FREE = Math.tan((36 * Math.PI) / 180), SLOPE_CARRY = Math.tan((28 * Math.PI) / 180), SLOPE_DOWN = Math.tan((48 * Math.PI) / 180);

const SKY_FRAG = /* glsl */ `
uniform vec3 uMoonDir; uniform float uTime; uniform vec3 uHorizon; uniform float uDawn;
varying vec3 vDir;
${NOISE_GLSL}
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 zen = mix(vec3(0.004, 0.008, 0.018), vec3(0.16, 0.2, 0.28), uDawn);
  vec3 col = mix(uHorizon, zen, pow(smoothstep(-0.02, 0.65, h), 0.6));
  float m = max(dot(d, uMoonDir), 0.0);
  col += (vec3(0.25, 0.4, 0.62) * pow(m, 10.0) * 0.22 + vec3(0.5, 0.7, 1.0) * pow(m, 180.0) * 0.5) * (1.0 - uDawn);
  // dawn: a cold pale band in the east
  col += vec3(0.55, 0.5, 0.45) * uDawn * pow(max(0.0, d.x), 2.0) * smoothstep(0.35, -0.05, h);
  vec2 uv = d.xz / (d.y + 0.18) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
  float c = smoothstep(0.42, 0.8, fbm(uv * 1.2));
  float lit = mix(0.35 + 1.6 * pow(m, 5.0), 1.2, uDawn);
  col = mix(col, mix(vec3(0.045, 0.08, 0.12), vec3(0.5, 0.52, 0.56), uDawn) * lit, c * 0.8 * smoothstep(0.0, 0.25, h));
  gl_FragColor = vec4(col, 1.0);
}`;
const FAR_VERT = /* glsl */ `
varying float vH; varying vec3 vN; varying float vD;
uniform float uRef;
void main(){ vH = position.y + uRef; vN = normal; vec4 wp = modelMatrix * vec4(position, 1.0); vD = length(wp.xz - cameraPosition.xz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FAR_FRAG = /* glsl */ `
varying float vH; varying vec3 vN; varying float vD;
uniform vec3 uMoon; uniform vec3 uHorizon; uniform float uDawn; uniform float uFogNear; uniform float uFogFar;
void main(){
  vec3 low = vec3(0.07, 0.075, 0.06), forest = vec3(0.035, 0.05, 0.04), rock = vec3(0.17, 0.16, 0.15), snow = vec3(0.75, 0.78, 0.84);
  vec3 c = mix(low, forest, smoothstep(1150.0, 1400.0, vH));
  c = mix(c, rock, smoothstep(1750.0, 1950.0, vH));
  c = mix(c, snow, smoothstep(2000.0, 2120.0, vH) * smoothstep(0.55, 0.85, vN.y));
  float l = 0.25 + 0.9 * max(0.0, dot(normalize(vN), uMoon));
  vec3 col = c * l * mix(0.55, 1.6, uDawn);
  float f = clamp((vD - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0) * 0.78 + smoothstep(uFogFar, 26000.0, vD) * 0.18;
  col = mix(col, uHorizon, f);
  gl_FragColor = vec4(col, 1.0);
}`;

interface Ammar { group: THREE.Group; pos: THREE.Vector3; yaw: number; trail: V2[]; walk: number; kneel: boolean }

export class MountainLevel {
  static async create(canvas: HTMLCanvasElement, opts: MOptions) {
    const { near, far } = await loadDem();
    initWorld(near, far);
    return new MountainLevel(canvas, opts);
  }

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private fx: PostFX;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private low: boolean;
  private opts: MOptions;
  private canvas: HTMLCanvasElement;
  private overlay: CanvasRenderingContext2D | null = null;

  private green: ReturnType<typeof createGreenKit>;
  private moon!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private skyMat!: THREE.ShaderMaterial;
  private farMat!: THREE.ShaderMaterial;
  private skyGroup = new THREE.Group();
  private stars!: THREE.Points;
  private chunks = new Map<number, { lv: number; mesh: THREE.Mesh }>();
  private chunkTimer = 0;
  private patches = new Map<string, { lv: number; meshes: THREE.Mesh[] }>();
  private grassTimer = 0;
  private trees: { x: number; z: number; near: THREE.Object3D[]; far: THREE.Object3D[] }[] = [];
  private treeTimer = 0;
  private fireLight!: THREE.PointLight;
  private fireSprites: THREE.Sprite[] = [];
  private fireFlicker = new Flicker(2.2, 0.45);
  private flash!: THREE.PointLight;
  private tracers: { line: THREE.Line; mat: THREE.LineBasicMaterial; life: number }[] = [];
  private snow!: ReturnType<typeof makeParticleField>;
  private breath: { s: THREE.Sprite; life: number }[] = [];
  private breathT = 0;
  private viewGroup = new THREE.Group();
  private carryArm!: THREE.Group;
  private rifle!: THREE.Group;

  // player
  readonly pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private velY = 0;
  private onGround = true;
  private yaw = SPAWN.yaw;
  private pitch = 0;
  private crouchAmt = 0;
  private stepPhase = 0;
  private lastStep = 0;
  private keys = new Set<string>();
  private active = false;
  readonly isTouch: boolean;
  private moveTouch: { id: number; x: number; y: number } | null = null;
  private lookTouch: { id: number; x: number; y: number } | null = null;
  private touchMove = new THREE.Vector2();
  private touchInteract = false;
  private crouchToggle = false;
  private climb: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private onRock = false;

  // people
  private lakhdar!: THREE.Group;
  private laghrour!: THREE.Group;
  private ammar!: Ammar;
  private pursuers!: Pursuers;

  // cinematic
  private cine = { on: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), tpos: new THREE.Vector3(), tlook: new THREE.Vector3(), speed: 1 };
  private dawn = 0;
  private dawnTarget = 0;

  readonly game = {
    stage: "bridge" as MStage,
    elapsed: 0,
    carrying: false,
    lakhdar: { x: LAKHDAR_START.x, z: LAKHDAR_START.z },
    exhaustion: 8,
    doubt: 0,
    health: 100,
    hurtT: 99,
    route: null as Route | null,
    climbed: false,
    supplies: [false, false],
    ammo: { mag: 5, reserve: 5 },
    fireCd: 0,
    reloading: 0,
    falls: 0,
    shots: 0,
    detected: false,
    events: [] as string[],
    barks: {} as Record<string, boolean>,
  };
  private checkpoint: { x: number; z: number; yaw: number; game: string; guards: ReturnType<Pursuers["snapshot"]> } | null = null;
  private frozen = true;
  private failT = 0;
  private hold = { id: "", t: 0 };
  private act: { id: string; ar: string; en: string; hold?: number; blocked?: boolean; run?: () => void } | null = null;
  private stim: Stim | null = null;
  private visState: MHud["visibility"] = "shadow";
  private hudTimer = 0;
  private barkCd = 0;
  private lakhdarBarkT = 40;
  private edgeT = 0;

  private constructor(canvas: HTMLCanvasElement, opts: MOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.low = opts.lowPower;
    this.isTouch = window.matchMedia("(pointer: coarse)").matches;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.low ? 0.85 : 1.4));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // linear fog shared with the far-DEM shader, so near hills and distant ridges haze consistently
    this.scene.fog = new THREE.Fog(HORIZON.clone(), 150, 4000);
    this.camera = new THREE.PerspectiveCamera(w < h ? 80 : 68, w / h, 0.05, 60000);
    this.scene.add(this.camera);
    this.green = createGreenKit({
      height: terrainHeight, splat: splatAt, quality: this.low ? 0.28 : 0.55, sunDir: MOON_DIR,
      skyTop: new THREE.Color().setRGB(0.004, 0.008, 0.018), skyHor: HORIZON.clone(), wind: 1.4,
    });
    this.pos.set(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z), SPAWN.z);
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.buildEnvironment();
    this.buildSky();
    this.buildFar();
    this.updateTerrain(Infinity);
    this.buildLights();
    this.buildProps();
    this.buildPlaces();
    this.buildPeople();
    this.buildViewmodel();
    this.buildFx();
    this.pursuers = new Pursuers(this.scene, {
      onCaught: () => this.fail("caught"),
      onShot: (from, to, hit, dmg) => this.enemyShot(from, to, hit, dmg),
      onBark: (at) => {
        this.opts.audio?.dogBark(at.distanceTo(this.pos), this.panOf(at));
        this.bark("ammar", "dog", BARKS.dog.ar, BARKS.dog.en, 25);
      },
      onAlarm: (why) => {
        if (why === "spotted") this.game.detected = true;
        if (why === "gunshot") this.bark("ammar", "gunshot", BARKS.gunshot.ar, BARKS.gunshot.en);
        if (why === "reinforcements") this.bark("ammar", "reinf", BARKS.reinforcements.ar, BARKS.reinforcements.en);
      },
    });
    this.fx = createPostFX(this.renderer, this.scene, this.camera, { low: this.low, bloom: [0.7, 0.7, 0.24], vignette: 0.18 });
    this.updateGrass(Infinity);
    this.updateTrees();
    this.applyLakhdar();
    this.saveCheckpoint("start", true);
    this.bindInput();
    this.renderer.compile(this.scene, this.camera);
    (window as unknown as { __mountain?: MountainLevel }).__mountain = this;
    this.loop();
  }

  // ======================= builders =======================
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
    env.background = new THREE.Color().setRGB(0.012, 0.022, 0.04);
    const panel = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9cc4ff).multiplyScalar(4) }));
    panel.position.copy(MOON_DIR).multiplyScalar(30);
    panel.lookAt(0, 0, 0);
    env.add(panel);
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
  }
  private buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uMoonDir: { value: MOON_DIR }, uTime: { value: 0 }, uHorizon: { value: new THREE.Vector3(HORIZON.r, HORIZON.g, HORIZON.b) }, uDawn: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(40000, 48, 24), this.skyMat);
    dome.renderOrder = -10;
    this.skyGroup.add(dome);
    const rng = mulberry32(31);
    const n = 1800, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * Math.PI * 2, y = 0.05 + Math.pow(rng(), 0.7) * 0.95, r = Math.sqrt(1 - y * y);
      p.set([Math.cos(u) * r * 38000, y * 38000, Math.sin(u) * r * 38000], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xb8cff0, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    this.skyGroup.add(this.stars);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(420, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdbe8ff).multiplyScalar(5), fog: false, transparent: true }));
    moon.position.copy(MOON_DIR).multiplyScalar(33000);
    moon.lookAt(0, 0, 0);
    moon.name = "moon";
    const corona = makeGlowSprite(0x7fa8e8, 0.5, 9000, false);
    corona.position.copy(moon.position);
    this.skyGroup.add(moon, corona);
    this.scene.add(this.skyGroup);
  }
  /** the Aurès all around: 51 km of real elevation at 128 m, hidden under the near terrain */
  private buildFar() {
    const n = 301, half = farHalf();
    const geo = new THREE.PlaneGeometry(half * 2, half * 2, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.max(Math.abs(x), Math.abs(z));
      p.setY(i, farRaw(x, z) - 400 * (1 - smoothstep(740, 840, r))); // sunk under the near terrain
    }
    geo.computeVertexNormals();
    this.farMat = new THREE.ShaderMaterial({
      uniforms: { uMoon: { value: MOON_DIR }, uHorizon: { value: HORIZON.clone() }, uDawn: { value: 0 }, uRef: { value: demElevation(0) }, uFogNear: { value: 150 }, uFogFar: { value: 4000 } },
      vertexShader: FAR_VERT, fragmentShader: FAR_FRAG, fog: false,
    });
    const far = new THREE.Mesh(geo, this.farMat);
    far.renderOrder = -5;
    far.frustumCulled = false;
    this.scene.add(far);
  }

  // streamed near terrain: 64 m chunks over ±640 m, LOD 1/2/4/8 m, skirts
  private chunkGeo(ci: number, cj: number, lv: number) {
    const CH = 64, step = [1, 2, 4, 8][lv], n = CH / step, x0 = -768 + ci * CH, z0 = -768 + cj * CH;
    const N = (n + 1) * (n + 1), S = 4 * (n + 1);
    const pos = new Float32Array((N + S) * 3), nor = new Float32Array((N + S) * 3), uv = new Float32Array((N + S) * 2), spl = new Float32Array((N + S) * 4);
    const e = Math.max(0.8, step * 0.5);
    const put = (k: number, x: number, z: number, drop: number) => {
      const y = terrainHeight(x, z);
      const a = terrainHeight(x - e, z) - terrainHeight(x + e, z), b = terrainHeight(x, z - e) - terrainHeight(x, z + e), l = Math.hypot(a, 2 * e, b);
      pos.set([x, y - drop, z], k * 3);
      nor.set([a / l, (2 * e) / l, b / l], k * 3);
      uv.set([x / 16, z / 16], k * 2);
      spl.set(splatAt(x, z, (2 * e) / l), k * 4);
    };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) put(j * (n + 1) + i, x0 + i * step, z0 + j * step, 0);
    const idx: number[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
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
      for (const v of ed) put(k++, pos[v * 3], pos[v * 3 + 2], step * 0.9 + 0.6);
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
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const want: { key: number; ci: number; cj: number; lv: number; d: number }[] = [];
    for (let cj = 0; cj < 24; cj++)
      for (let ci = 0; ci < 24; ci++) {
        const x0 = -768 + ci * 64, z0 = -768 + cj * 64;
        const d = Math.hypot(Math.max(x0 - cx, 0, cx - x0 - 64), Math.max(z0 - cz, 0, cz - z0 - 64));
        let lv = d < 70 ? 0 : d < 170 ? 1 : d < 340 ? 2 : 3;
        if (this.low) lv = Math.min(3, lv + 1);
        const key = cj * 100 + ci, c = this.chunks.get(key);
        if (!c || c.lv !== lv) want.push({ key, ci, cj, lv, d });
      }
    want.sort((a, b) => a.d - b.d);
    for (const w of want.slice(0, budget)) {
      const geo = this.chunkGeo(w.ci, w.cj, w.lv);
      const old = this.chunks.get(w.key);
      if (old) {
        old.mesh.geometry.dispose();
        old.mesh.geometry = geo;
        old.lv = w.lv;
      } else {
        const mesh = new THREE.Mesh(geo, this.green.tMat);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.chunks.set(w.key, { lv: w.lv, mesh });
      }
    }
  }
  private updateGrass(budget: number) {
    const k = this.green, G = k.G, cx = this.camera.position.x, cz = this.camera.position.z;
    const seen = new Set<string>();
    let built = 0;
    for (let pz = Math.floor((PLAY.minZ - 60) / G); pz <= Math.floor((PLAY.maxZ + 60) / G); pz++)
      for (let px = Math.floor((PLAY.minX - 60) / G); px <= Math.floor((PLAY.maxX + 60) / G); px++) {
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
        this.patches.set(key, { lv, meshes });
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

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0x0c1a2c, 0.55));
    this.hemi = new THREE.HemisphereLight(0x2c4f7a, 0x08090b, 0.65);
    this.scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0xa4c0ff, 1.25);
    moon.castShadow = true;
    const s = this.low ? 1024 : 2048;
    moon.shadow.mapSize.set(s, s);
    const c = moon.shadow.camera;
    c.left = c.bottom = -36;
    c.right = c.top = 36;
    c.near = 1;
    c.far = 220;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.05;
    this.scene.add(moon, moon.target);
    this.moon = moon;
  }

  /** auto-generated landscape: instanced cedars, oaks, junipers, brush, boulders and scree */
  private buildProps() {
    const k = this.green, props = generateProps(this.low), dummy = new THREE.Object3D();
    const rockGeos = [0, 1, 2, 3].map((v) => k.mkRock(v * 13.7 + 3, 22, 16));
    const rockMat = k.rockMat;
    const byKind = (kind: string) => props.filter((p) => p.kind === kind);
    // rocks and boulders: 4 shapes, collision for the big ones
    for (const kind of ["boulder", "rock"] as const) {
      const list = byKind(kind);
      rockGeos.forEach((geo, gi) => {
        const mine = list.filter((_, i) => i % 4 === gi);
        if (!mine.length) return;
        const inst = new THREE.InstancedMesh(geo, rockMat, mine.length);
        mine.forEach((p, i) => {
          const g = terrainHeight(p.x, p.z), sl = slopeAt(p.x, p.z, 1);
          const sx = p.s * (0.9 + 0.4 * Math.sin(p.r * 3)), sy = p.s * (kind === "boulder" ? 0.75 : 0.55), sz = p.s;
          dummy.position.set(p.x, g - sy * 0.25 - sl * p.s * 0.2, p.z);
          dummy.rotation.set(Math.sin(p.r) * 0.2, p.r, Math.cos(p.r) * 0.2);
          dummy.scale.set(sx, sy, sz);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
          if (kind === "boulder" || p.s > 0.7) addBox(p.x, p.z, sx * 1.4, sz * 1.4, sy * 0.75, p.s > 1 ? "solid" : "low", "rock");
        });
        inst.castShadow = inst.receiveShadow = true;
        this.scene.add(inst);
      });
    }
    // vegetation, tiled (100 m) with two LODs
    const species: Record<string, { c: boolean; seed: number; P: unknown; bark: number; leaf: number }> = {
      cedar: { c: true, seed: 19, P: { ...k.CONI, H: 13, rad: 3.8 }, bark: 2, leaf: 4 },
      oak: { c: false, seed: 37, P: { ...k.OAK, H: 7.5, wob: 0.35, n0: 6 }, bark: 0, leaf: 0 },
      juniper: { c: true, seed: 7, P: { ...k.CONI, H: 5, rad: 2.2 }, bark: 2, leaf: 4 },
      bush: { c: false, seed: 3, P: k.BUSH, bark: 0, leaf: 0 },
    };
    const TS = 100, tiles = new Map<number, { x: number; z: number; near: THREE.Object3D[]; far: THREE.Object3D[] }>();
    for (const [kind, sp] of Object.entries(species)) {
      const list = byKind(kind);
      if (!list.length) continue;
      const T = sp.c ? k.genConifer(sp.seed, sp.P) : k.genBroad(sp.seed, sp.P);
      const gb0 = T.b0.geo(false), gl0 = T.l0.geo(true), gb1 = T.b1.geo(false), gl1 = T.l1.geo(true);
      const groups = new Map<number, typeof list>();
      for (const p of list) {
        const key = Math.floor((p.z + 400) / TS) * 100 + Math.floor((p.x + 400) / TS);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
        const g = terrainHeight(p.x, p.z);
        if (kind === "bush") addBox(p.x, p.z, 1.6 * p.s, 1.6 * p.s, 1.1 * p.s, "cover", "bush");
        else addBox(p.x, p.z, 0.6, 0.6, 3, "solid", "tree", g);
      }
      for (const [key, items] of groups) {
        let tile = tiles.get(key);
        if (!tile) tiles.set(key, (tile = { x: ((key % 100) + 0.5) * TS - 400, z: (Math.floor(key / 100) + 0.5) * TS - 400, near: [], far: [] }));
        const mk = (bg: THREE.BufferGeometry, lg: THREE.BufferGeometry, leaf: number, near: boolean) => {
          const bark = new THREE.InstancedMesh(bg, k.barkMats[sp.bark], items.length);
          const leaves = new THREE.InstancedMesh(lg, k.leafMats[leaf], items.length);
          leaves.customDepthMaterial = k.depthMats[leaf];
          items.forEach((p, i) => {
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
            m.visible = false;
            this.scene.add(m);
            (near ? tile!.near : tile!.far).push(m);
          }
        };
        if (!this.low) mk(gb0, gl0, sp.leaf, true);
        mk(gb1, gl1, sp.c ? sp.leaf : sp.leaf + 1, this.low);
      }
    }
    this.trees = [...tiles.values()];
  }
  private updateTrees() {
    const cx = this.camera.position.x, cz = this.camera.position.z;
    for (const t of this.trees) {
      const d = Math.max(0, Math.hypot(t.x - cx, t.z - cz) - 71);
      const near = t.near.length > 0 && d < 55;
      for (const m of t.near) m.visible = near;
      for (const m of t.far) m.visible = !near && d < 420;
    }
  }

  private buildPlaces() {
    // town edge: three houses and the alley
    const { kit } = buildHouses(this.scene, HOUSES.map((h) => ({ ...h, h: 3.3, door: "n" as const, lit: true })), this.low, terrainHeight);
    for (const h of HOUSES) addBox(h.x, h.z, h.w, h.d, 4.2, "solid", "house");
    for (const h of HOUSES) {
      const s = makeGlowSprite(0xffa04a, 0.8, 3, false);
      s.position.set(h.x, terrainHeight(h.x, h.z) + 1.5, h.z - h.d / 2 - 0.3);
      this.scene.add(s);
    }
    const k = kit;
    // the fork rock: a 1.5 m outcrop with a flat top
    const fg = terrainHeight(FORK.x, FORK.z);
    const rock = this.mesh(this.green.mkRock(91, 24, 18), this.green.rockMat, FORK.x, fg + 0.15, FORK.z, 0.4);
    rock.scale.set(FORK.r * 1.15, FORK.h + 0.15, FORK.r);
    addBox(FORK.x, FORK.z, FORK.r * 1.4, FORK.r * 1.2, FORK.h, "solid", "fork", fg);
    // supply caches: a flat stone over a cloth bundle
    for (const c of [CACHE_VALLEY, CACHE_RIDGE]) {
      const g = terrainHeight(c.x, c.z);
      this.mesh(new THREE.BoxGeometry(0.7, 0.12, 0.5), k.S, c.x, g + 0.32, c.z, 0.3);
      this.mesh(new THREE.BoxGeometry(0.45, 0.22, 0.32), k.C, c.x - 0.1, g + 0.12, c.z + 0.05, 0.6);
    }
    // the shepherds' shelter: one half-open stone room against the rock
    const sg = terrainHeight(SHELTER.x, SHELTER.z), S = k.S;
    const W = 5.5, D = 4.2, H = 2.4, t = 0.5;
    const wall = (x: number, z: number, w: number, d: number, h = H) => {
      this.mesh(k.U(new THREE.BoxGeometry(w, h + 0.6, d), 0.7), S, x, sg + h / 2 - 0.3, z);
      addBox(x, z, w, d, h, "solid", "shelter", sg);
    };
    wall(SHELTER.x, SHELTER.z - D / 2, W + t, t); // back, against the rock
    wall(SHELTER.x - W / 2, SHELTER.z, t, D);
    wall(SHELTER.x + W / 2, SHELTER.z - 0.8, t, D - 1.6);
    wall(SHELTER.x - 1.2, SHELTER.z + D / 2, W / 2 - 0.6, t, 1.3); // half front wall
    const roof = this.mesh(k.U(new THREE.BoxGeometry(W + 1.2, 0.28, D * 0.75), 0.7), k.Wo, SHELTER.x, sg + H + 0.1, SHELTER.z - D * 0.12, 0);
    roof.rotation.x = 0.12;
    const back = this.mesh(this.green.mkRock(55, 24, 18), this.green.rockMat, SHELTER.x + 1, sg + 1.2, SHELTER.z - D / 2 - 3.2, 1.2);
    back.scale.set(7, 4.5, 3.4);
    addBox(SHELTER.x + 1, SHELTER.z - D / 2 - 3.2, 11, 5, 5, "solid", "shelter-rock", sg);
    // firewood stack, sheepskins
    for (let i = 0; i < 6; i++) this.mesh(new THREE.CylinderGeometry(0.06, 0.07, 1, 6), k.W, SHELTER.x - 2.1, sg + 0.1 + (i % 3) * 0.13, SHELTER.z - 1.3 + Math.floor(i / 3) * 0.14, 0).rotation.z = Math.PI / 2;
    const skin = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 1 }));
    skin.rotation.x = -Math.PI / 2;
    skin.position.set(LAKHDAR_REST.x, sg + 0.04, LAKHDAR_REST.z);
    this.scene.add(skin);
    // the fire: stones, embers, light (warm — the only warm light on the mountain)
    const fgY = terrainHeight(FIRE.x, FIRE.z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.mesh(new THREE.DodecahedronGeometry(0.13), S, FIRE.x + Math.cos(a) * 0.42, fgY + 0.08, FIRE.z + Math.sin(a) * 0.42, a);
    }
    this.fireLight = new THREE.PointLight(0xff8a3a, 22, 14, 1.8);
    this.fireLight.position.set(FIRE.x, fgY + 0.6, FIRE.z);
    this.scene.add(this.fireLight);
    for (let i = 0; i < 5; i++) {
      const s = makeGlowSprite(i % 2 ? 0xff6a1f : 0xffb347, 0.75, 0.45 + i * 0.12);
      s.position.set(FIRE.x + (Math.random() - 0.5) * 0.3, fgY + 0.2 + i * 0.12, FIRE.z + (Math.random() - 0.5) * 0.3);
      this.scene.add(s);
      this.fireSprites.push(s);
    }
    // the valley stream
    const pts: number[] = [], idx: number[] = [];
    let n = 0;
    for (let s = 4; s < STREAM_P.len - 4; s += 1.5) {
      const [x, z] = pointAt(STREAM_P, s), [x2, z2] = pointAt(STREAM_P, s + 1);
      const tx = x2 - x, tz = z2 - z, tl = Math.hypot(tx, tz) || 1, w = 1.3 + 0.35 * Math.sin(s * 0.21);
      const y = terrainHeight(x, z) + 0.15;
      pts.push(x - (tz / tl) * w, y, z + (tx / tl) * w, x + (tz / tl) * w, y, z - (tx / tl) * w);
      if (n) idx.push((n - 1) * 2, n * 2, (n - 1) * 2 + 1, (n - 1) * 2 + 1, n * 2, n * 2 + 1);
      n++;
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    wg.setIndex(idx);
    wg.computeVertexNormals();
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86, envMapIntensity: 1.6 }));
    water.receiveShadow = true;
    this.scene.add(water);
  }

  private buildPeople() {
    this.lakhdar = makeMujahid(0x45412f, 0xa59473);
    this.scene.add(this.lakhdar);
    const ag = makeMujahid(0x3d3b2c, 0x8d7a58);
    ag.scale.setScalar(1.03);
    this.scene.add(ag);
    // Abbas Laghrour, only for the hand-over at the town edge
    this.laghrour = makeMujahid(0x464530, 0x9a8a6a);
    this.laghrour.position.set(-1.8, terrainHeight(-1.8, 33.5), 33.5);
    this.laghrour.rotation.y = Math.atan2(SPAWN.x + 1.8, SPAWN.z - 33.5);
    this.scene.add(this.laghrour);
    this.ammar = { group: ag, pos: new THREE.Vector3(SPAWN.x - 1.4, 0, SPAWN.z + 1.2), yaw: 0, trail: [], walk: 0, kneel: false };
    this.ammar.pos.y = terrainHeight(this.ammar.pos.x, this.ammar.pos.z);
  }

  private buildViewmodel() {
    const cloth = new THREE.MeshStandardMaterial({ color: 0x45412f, roughness: 1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x5a4434, roughness: 0.9 });
    this.carryArm = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), cloth);
    arm.rotation.z = 1.15;
    arm.position.set(-0.18, -0.2, -0.32);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin);
    hand.position.set(0.06, -0.08, -0.36);
    const myHand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), skin);
    myHand.position.set(-0.3, -0.27, -0.3);
    this.carryArm.add(arm, hand, myHand);
    const steel = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.85 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 0.65 });
    this.rifle = new THREE.Group();
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.75), wood);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.6);
    this.rifle.add(stock, barrel);
    this.rifle.position.set(0.16, -0.2, -0.45);
    this.viewGroup.add(this.carryArm, this.rifle);
    this.viewGroup.traverse((o) => ((o as THREE.Mesh).renderOrder = 5));
    this.camera.add(this.viewGroup);
  }

  private buildFx() {
    this.flash = new THREE.PointLight(0xffc27a, 0, 14, 2);
    this.scene.add(this.flash);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), mat);
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, mat, life: 0 });
    }
    this.snow = makeParticleField(this.low ? 900 : 2200, new THREE.Vector3(40, 18, 40), [{ color: 0xe8f0ff, weight: 1, gain: 0.8 }], this.renderer.getPixelRatio(), 77);
    this.snow.mat.uniforms.uWind.value.set(1.6, -1.1, 0.5);
    this.scene.add(this.snow.points);
    const tex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, "rgba(220,230,240,0.55)");
      gr.addColorStop(1, "rgba(220,230,240,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.camera.add(s);
      this.breath.push({ s, life: 0 });
    }
  }

  // ======================= input =======================
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (!this.active || this.frozen) return;
    if (e.code === "KeyE") this.interact();
    if (e.code === "KeyR") this.reload();
    if (e.code === "Space") e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseMove = (e: MouseEvent) => {
    if (!this.active || this.isTouch || this.cine.on) return;
    this.yaw -= e.movementX * 0.0021;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0021, -1.45, 1.45);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && this.active) this.fire();
  };
  private onLock = () => this.setActive(document.pointerLockElement === this.canvas);
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
        this.yaw -= (t.clientX - this.lookTouch.x) * 0.0055;
        this.pitch = THREE.MathUtils.clamp(this.pitch - (t.clientY - this.lookTouch.y) * 0.0055, -1.4, 1.4);
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
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 80 : 68;
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
    document.addEventListener("pointerlockchange", this.onLock);
    window.addEventListener("touchstart", this.onTouchStart, { passive: true });
    window.addEventListener("touchmove", this.onTouchMove, { passive: true });
    window.addEventListener("touchend", this.onTouchEnd);
    window.addEventListener("touchcancel", this.onTouchEnd);
    window.addEventListener("resize", this.onResize);
  }
  setActive(v: boolean) {
    if (this.active === v) return;
    this.active = v;
    if (!v) {
      this.keys.clear();
      this.moveTouch = this.lookTouch = null;
      this.touchMove.set(0, 0);
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
  setTouchInteract(down: boolean) {
    this.touchInteract = down;
    if (down) this.interact();
  }
  teleport(x: number, z: number, yaw?: number, pitch = 0) {
    this.pos.set(x, groundAt(x, z), z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = pitch;
    this.onRock = false;
  }

  // ======================= story API =======================
  /** the bridge scene at the town edge: Laghrour hands Lakhdar over */
  startBridge() {
    this.game.stage = "bridge";
    this.frozen = true;
    this.cineCut(new THREE.Vector3(30, 40, 120), new THREE.Vector3(0, 20, -60));
    this.cineTo(new THREE.Vector3(5, terrainHeight(0, 40) + 4, 46), new THREE.Vector3(0, terrainHeight(0, 34) + 1, 33), 0.3);
  }
  focus(who: MSpeaker | "wide" | "fork-valley" | "fork-ridge" | "fork-shelter") {
    const eye = this.pos.clone().setY(this.pos.y + 1.6);
    const at = (o: THREE.Vector3, dist: number, side: number, lift = 0.05) => {
      const dir = eye.clone().sub(o).setY(0);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      this.cineTo(o.clone().addScaledVector(dir, dist).addScaledVector(perp, side).setY(o.y + lift), o, 1.5);
    };
    if (!this.cine.on) {
      this.cine.on = true;
      this.cine.pos.copy(this.camera.position);
      this.cine.look.copy(this.camera.position).add(this.camera.getWorldDirection(new THREE.Vector3()));
    }
    const view = (sx: number, sz: number, lift: number) => {
      const p = pointAt(sz > 0 ? VALLEY_P : RIDGE_P, sx);
      return new THREE.Vector3(p[0], terrainHeight(p[0], p[1]) + lift, p[1]);
    };
    if (who === "fork-valley" || who === "fork-ridge") {
      const target = who === "fork-valley" ? view(90, 1, 1) : view(130, -1, 1);
      this.cineTo(new THREE.Vector3(FORK.x, terrainHeight(0, 0) + FORK.h + 2.6, FORK.z + 2), target, 0.9);
      return;
    }
    if (who === "fork-shelter" || who === "wide") {
      const s = new THREE.Vector3(SHELTER.x, terrainHeight(SHELTER.x, SHELTER.z) + 2, SHELTER.z);
      this.cineTo(new THREE.Vector3(FORK.x - 1.5, terrainHeight(0, 0) + FORK.h + 2.4, FORK.z + 3), s, 0.9);
      return;
    }
    if (who === "you") {
      const o = this.ammar.pos.clone().setY(this.ammar.pos.y + 1.55);
      const dir = o.clone().sub(eye).setY(0).normalize();
      this.cineTo(eye.clone().addScaledVector(dir, -0.9).add(new THREE.Vector3(-dir.z * 0.5, 0.15, dir.x * 0.5)), o, 1.5);
      return;
    }
    if (who === "laghrour") {
      at(new THREE.Vector3(-1.8, terrainHeight(-1.8, 33.5) + 1.6, 33.5), 2.2, 0.7);
      return;
    }
    if (who === "lakhdar") {
      const p = this.lakhdar.position.clone().setY(this.lakhdar.position.y + (this.game.carrying ? 1.4 : 0.5));
      at(p, 1.8, 0.6, 0.6);
      return;
    }
    at(this.ammar.pos.clone().setY(this.ammar.pos.y + (this.ammar.kneel ? 1.05 : 1.55)), 2, 0.7);
  }
  private cineCut(p: THREE.Vector3, l: THREE.Vector3) {
    this.cine.on = true;
    this.cine.pos.copy(p);
    this.cine.tpos.copy(p);
    this.cine.look.copy(l);
    this.cine.tlook.copy(l);
  }
  private cineTo(p: THREE.Vector3, l: THREE.Vector3, speed: number) {
    this.cine.tpos.copy(p);
    this.cine.tlook.copy(l);
    this.cine.speed = speed;
  }
  endCine() {
    this.cine.on = false;
  }
  endBridge() {
    this.game.stage = "leave";
    this.endCine();
    this.frozen = false;
    this.teleport(SPAWN.x, SPAWN.z, 0);
    this.laghrour.visible = false;
    this.saveCheckpoint("start", true);
    this.bark("ammar", "start", "احمله (امسك E). البلدة نائمة… لكن ليس كلّها.", "Pick him up (hold E). The town is asleep… not all of it.");
  }
  chooseRoute(r: Route) {
    const g = this.game;
    g.route = r;
    g.stage = "route";
    this.event("mc.route_chosen");
    this.endCine();
    this.frozen = false;
    this.saveCheckpoint("cp_mc_fork");
  }
  /** the loss scene finished: silence, dawn, narrator */
  endLoss() {
    this.event("mc.loss_scene_done");
    this.game.stage = "dawn";
    this.dawnTarget = 1;
    this.cineTo(new THREE.Vector3(SHELTER.x + 14, terrainHeight(SHELTER.x, SHELTER.z) + 9, SHELTER.z + 22), new THREE.Vector3(SHELTER.x - 60, terrainHeight(SHELTER.x, SHELTER.z) + 30, SHELTER.z - 140), 0.12);
  }
  finish(): MEnding {
    const g = this.game;
    g.stage = "ended";
    return { route: g.route ?? "valley", exhaustion: Math.round(g.exhaustion), doubt: g.doubt, minutes: Math.round(g.elapsed / 60), falls: g.falls, shots: g.shots, supplies: g.supplies.filter(Boolean).length, detected: g.detected };
  }

  // ======================= gameplay =======================
  private event(name: string) {
    if (this.game.events.includes(name)) return;
    this.game.events.push(name);
    this.opts.onEvent?.(name);
  }
  private bark(who: MSpeaker, key: string, ar: string, en: string, repeatAfter = 0) {
    const k = this.game.barks;
    if (k[key] && !repeatAfter) return;
    if (repeatAfter && this.barkCd > 0) return;
    k[key] = true;
    if (repeatAfter) this.barkCd = repeatAfter;
    this.opts.onBark?.(who, ar, en);
  }
  private panOf(p: THREE.Vector3) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return THREE.MathUtils.clamp(p.clone().sub(this.pos).normalize().dot(right), -1, 1);
  }
  private saveCheckpoint(id: string, silent = false) {
    this.checkpoint = { x: this.pos.x, z: this.pos.z, yaw: this.yaw, game: JSON.stringify(this.game), guards: this.pursuers?.snapshot() ?? [] };
    if (!silent) this.opts.onCheckpoint?.(id);
  }
  private restore() {
    const c = this.checkpoint!;
    const { falls, events, barks, shots } = this.game;
    Object.assign(this.game, JSON.parse(c.game), { falls, events, barks, shots, health: 100, hurtT: 99 });
    this.teleport(c.x, c.z, c.yaw);
    // the design doc: after a fail, Lakhdar lies on the ground beside you
    this.game.carrying = false;
    this.game.lakhdar = { x: c.x + Math.cos(c.yaw) * 1.2, z: c.z - Math.sin(c.yaw) * 1.2 };
    this.pursuers.reset(c.guards);
    this.ammar.trail = [];
    this.ammar.pos.set(c.x - Math.sin(c.yaw) * 2, 0, c.z - Math.cos(c.yaw) * 2);
    this.ammar.pos.y = terrainHeight(this.ammar.pos.x, this.ammar.pos.z);
    this.applyLakhdar();
  }
  private fail(why: "caught" | "killed") {
    if (this.frozen) return;
    this.frozen = true;
    this.failT = 2.8;
    this.game.falls++;
    this.opts.onFail?.(why);
  }
  private enemyShot(from: THREE.Vector3, to: THREE.Vector3, hit: boolean, dmg: number) {
    this.tracer(from, to, 0x9fd0ff);
    this.opts.audio?.shot(from.distanceTo(this.pos), this.panOf(from));
    if (hit && !this.frozen) {
      this.game.health -= dmg;
      this.game.hurtT = 0;
      this.opts.audio?.hurt();
      this.opts.onDamage?.();
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
    this.flash.position.copy(a);
    this.flash.intensity = 40;
  }
  private reload() {
    const g = this.game;
    if (g.carrying || g.reloading > 0 || g.ammo.mag >= 5 || g.ammo.reserve <= 0) return;
    g.reloading = 2.4;
    this.opts.audio?.reload();
  }
  private fire() {
    const g = this.game;
    if (this.frozen || g.carrying || g.reloading > 0 || g.fireCd > 0 || this.cine.on) return;
    if (g.ammo.mag <= 0) {
      this.opts.audio?.click();
      return;
    }
    g.ammo.mag--;
    g.fireCd = 1;
    g.shots++;
    const o = this.camera.getWorldPosition(new THREE.Vector3()), d = this.camera.getWorldDirection(new THREE.Vector3());
    const sway = 0.004 + this.game.exhaustion * 0.0002 + coldAt(this.pos.x, this.pos.z) * 0.01;
    d.x += (Math.random() - 0.5) * sway * 2;
    d.y += (Math.random() - 0.5) * sway * 2;
    d.normalize();
    let wall = 150;
    for (let t = 0.5; t < 150; t += 0.5) {
      const p = o.clone().addScaledVector(d, t);
      if (p.y < terrainHeight(p.x, p.z)) {
        wall = t;
        break;
      }
    }
    const hit = this.pursuers.rayHit(o, d, wall);
    this.tracer(o.clone().addScaledVector(d, 0.6).add(new THREE.Vector3(0, -0.12, 0)), o.clone().addScaledVector(d, hit ? hit.t : wall), 0xffd9a0);
    this.opts.audio?.shot(0, 0, true);
    if (hit && this.pursuers.damage(hit.g, hit.head ? 250 : 120)) this.opts.onToast?.("سقط", "Down");
    this.pursuers.gunshot(this.pos.clone());
  }

  private lakhdarPos() {
    return new THREE.Vector3(this.game.lakhdar.x, terrainHeight(this.game.lakhdar.x, this.game.lakhdar.z), this.game.lakhdar.z);
  }
  private applyLakhdar() {
    const L = this.lakhdar;
    if (this.game.carrying) {
      L.visible = false;
      return;
    }
    L.visible = true;
    const p = this.lakhdarPos();
    const atFire = Math.hypot(p.x - LAKHDAR_REST.x, p.z - LAKHDAR_REST.z) < 0.5;
    L.position.copy(p);
    // sits slumped against whatever is there; by the fire he lies down
    L.rotation.set(atFire ? -Math.PI / 2 : -0.35, atFire ? Math.PI / 2 : this.yaw + Math.PI, 0, "YXZ");
    L.position.y += atFire ? 0.2 : -0.45;
  }
  private findAct() {
    const g = this.game, p = this.pos;
    const lk = this.lakhdarPos();
    const nearL = Math.hypot(p.x - lk.x, p.z - lk.z) < 2.2;
    if (g.stage === "shelter" || g.stage === "route") {
      if (g.carrying && Math.hypot(p.x - LAKHDAR_REST.x, p.z - LAKHDAR_REST.z) < 3.4 && g.stage === "shelter")
        return { id: "rest", ar: "ضع لخضر قرب النار", en: "Lay Lakhdar by the fire", hold: 1.2, run: () => this.layByFire() };
    }
    const atRock = !this.onRock && !this.climb && g.stage === "fork" && !g.climbed && Math.hypot(p.x - FORK.x, p.z - FORK.z) < FORK.r + 1.6;
    if (!g.carrying && nearL && !atRock && g.stage !== "loss" && g.stage !== "dawn")
      return { id: "pick", ar: "احمل لخضر", en: "Pick up Lakhdar", hold: 1.1, run: () => this.pickUp() };
    for (const [i, c] of [CACHE_VALLEY, CACHE_RIDGE].entries()) {
      if (g.supplies[i] || Math.hypot(p.x - c.x, p.z - c.z) > 1.8) continue;
      if (g.carrying) return { id: "cache", ar: "مخبأ مؤن — ضع لخضر أولاً", en: "A supply cache — set Lakhdar down first", blocked: true };
      return { id: "cache", ar: "خذ المؤن (ضمادة، خبز)", en: "Take the supplies (bandage, bread)", hold: 1.4, run: () => this.takeCache(i) };
    }
    const dF = Math.hypot(p.x - FORK.x, p.z - FORK.z);
    if (!this.onRock && !this.climb && dF < FORK.r + 1.6 && g.stage === "fork") {
      // carrying: you can't climb with him — the prompt is to set him down here first
      if (g.carrying) return { id: "drop", ar: "ضع لخضر عند الصخرة (لا تسلّق وأنت تحمله)", en: "Set Lakhdar down by the rock (no climbing while carrying)", hold: 0.6, run: () => this.putDown() };
      return { id: "rock", ar: "تسلّق صخرة المفترق", en: "Climb the fork rock", run: () => this.startClimb() };
    }
    if (g.carrying && g.stage !== "loss") return { id: "drop", ar: "ضع لخضر أرضاً", en: "Set Lakhdar down", hold: 0.6, run: () => this.putDown() };
    return null;
  }
  interact() {
    if (!this.active || this.frozen) return;
    if (this.act && !this.act.hold && !this.act.blocked) this.act.run?.();
  }
  private pickUp() {
    this.game.carrying = true;
    this.applyLakhdar();
    if (Math.random() < 0.35) this.bark("lakhdar", "pick" + Math.floor(this.game.elapsed), BARKS.lakhdarWeak.ar, BARKS.lakhdarWeak.en);
  }
  private putDown() {
    const g = this.game;
    g.carrying = false;
    const fx = this.pos.x - Math.sin(this.yaw) * 0.9, fz = this.pos.z - Math.cos(this.yaw) * 0.9;
    const ok = !solidAt(fx, fz, terrainHeight(fx, fz));
    g.lakhdar = ok ? { x: fx, z: fz } : { x: this.pos.x, z: this.pos.z };
    this.applyLakhdar();
  }
  private takeCache(i: number) {
    const g = this.game;
    g.supplies[i] = true;
    g.exhaustion = Math.max(0, g.exhaustion - 25);
    this.opts.onToast?.("ضمادة وخبز — شددتَ جرح لخضر", "Bandage and bread — you bound Lakhdar's wound");
  }
  private startClimb() {
    const top = new THREE.Vector3(FORK.x, terrainHeight(FORK.x, FORK.z) + FORK.h, FORK.z);
    this.climb = { from: this.pos.clone(), to: top, t: 0 };
  }
  private layByFire() {
    const g = this.game;
    g.carrying = false;
    g.lakhdar = { x: LAKHDAR_REST.x, z: LAKHDAR_REST.z };
    g.stage = "loss";
    this.applyLakhdar();
    this.saveCheckpoint("cp_camp");
    this.frozen = true;
    this.ammar.kneel = true;
    this.ammar.pos.set(LAKHDAR_REST.x + 1.0, 0, LAKHDAR_REST.z + 0.9);
    this.ammar.pos.y = terrainHeight(this.ammar.pos.x, this.ammar.pos.z);
    this.ammar.yaw = Math.atan2(LAKHDAR_REST.x - this.ammar.pos.x, LAKHDAR_REST.z - this.ammar.pos.z);
    this.teleport(FIRE.x + 1.4, FIRE.z + 1.6, Math.atan2(-(LAKHDAR_REST.x - FIRE.x - 1.4), -(LAKHDAR_REST.z - FIRE.z - 1.6)));
    const fy = terrainHeight(FIRE.x, FIRE.z);
    // through the open half of the front: Lakhdar by the back wall, Ammar kneeling, the fire to the right
    this.cineCut(new THREE.Vector3(SHELTER.x + 2.4, fy + 1.45, SHELTER.z + 4.4), new THREE.Vector3(LAKHDAR_REST.x + 0.6, fy + 0.35, LAKHDAR_REST.z));
    this.opts.onDialogue?.("loss");
  }

  private computeStim(crouch: boolean, moving: boolean, water: boolean): Stim {
    const chest = this.pos.clone().setY(this.pos.y + (crouch ? 0.8 : 1.3));
    const lantern = this.pursuers.guards.some((g) => g.lantern && g.alive && g.pos.distanceTo(chest) < 5);
    const fire = this.fireLight.position.distanceTo(chest) < 6;
    const lit = lantern || fire;
    // moon shadow: march toward the moon over the terrain
    let shadow = false;
    for (let t = 2; t < 60; t += 2.5) {
      const x = chest.x + MOON_DIR.x * t, y = chest.y + MOON_DIR.y * t, z = chest.z + MOON_DIR.z * t;
      if (terrainHeight(x, z) > y) {
        shadow = true;
        break;
      }
    }
    if (!shadow) shadow = !lineClear(chest.x, chest.y, chest.z, chest.x + MOON_DIR.x * 20, chest.y + MOON_DIR.y * 20, chest.z + MOON_DIR.z * 20, true);
    const bush = coverAt(this.pos.x, this.pos.z);
    this.visState = lit ? "lit" : (shadow || bush) && crouch ? "hidden" : shadow || crouch ? "shadow" : "lit";
    let v = lit ? 1.1 : shadow ? 0.32 : 0.7;
    v *= crouch ? 0.45 : 1;
    if (this.game.carrying) v *= 1.25; // two men are a bigger shape
    if (this.dawn > 0) v = Math.max(v, 0.4 + this.dawn * 0.6);
    const noise = water && moving ? (this.game.carrying ? 9 : 7) : 0;
    return { chest, feet: this.pos.clone(), visibility: v, concealed: crouch && (shadow || bush), noise, crouch, moving };
  }

  private blocked(x: number, z: number) {
    if (x < PLAY.minX || x > PLAY.maxX || z < PLAY.minZ || z > PLAY.maxZ) return "edge";
    if (innerMask(x, z) > 0.55) return "edge";
    if (solidAt(x, z, this.pos.y, RADIUS)) return "solid";
    const g = groundAt(x, z, this.pos.y), d = Math.hypot(x - this.pos.x, z - this.pos.z) || 1e-3;
    const rise = (g - this.pos.y) / d;
    if (this.onRock && g < this.pos.y - 0.3) return null; // stepping off the rock
    if (rise > (this.game.carrying ? SLOPE_CARRY : SLOPE_FREE) && g - this.pos.y > 0.02) return "steep";
    if (-rise > SLOPE_DOWN && this.pos.y - g > 0.6) return "edge";
    return this.gate(x, z);
  }
  /** story gates: no skipping the beats */
  private gate(x: number, z: number) {
    const g = this.game;
    const lk = this.lakhdarPos();
    if (!g.carrying && g.stage !== "loss" && Math.hypot(x - lk.x, z - lk.z) > 30 && Math.hypot(x - lk.x, z - lk.z) > Math.hypot(this.pos.x - lk.x, this.pos.z - lk.z)) {
      this.bark("ammar", "left", BARKS.leftBehind.ar, BARKS.leftBehind.en, 8);
      return "gate";
    }
    if (g.stage === "leave" && z < LEFT_TOWN.z - 2 && !g.carrying) {
      this.bark("ammar", "needcarry", BARKS.needCarry.ar, BARKS.needCarry.en, 8);
      return "gate";
    }
    const dF = Math.hypot(x - FORK.x, z - FORK.z);
    if ((g.stage === "leave" || g.stage === "fork") && z < -4 && dF > 10) {
      this.bark("ammar", "choose", BARKS.chooseFirst.ar, BARKS.chooseFirst.en, 8);
      return "gate";
    }
    if (g.route && dF > 14) {
      const nv = nearest(VALLEY_P, x, z).d, nr = nearest(RIDGE_P, x, z).d;
      const onOther = g.route === "valley" ? nr < 8 && nr < nv : nv < 12 && nv < nr;
      if (onOther && z > -100) {
        this.bark("ammar", "wrong", BARKS.wrongRoute.ar, BARKS.wrongRoute.en, 8);
        return "gate";
      }
    }
    return null;
  }

  private updatePlayer(dt: number) {
    const k = this.keys, g = this.game;
    if (this.climb) {
      this.climb.t += dt / 1.1;
      const t = Math.min(1, this.climb.t);
      this.pos.lerpVectors(this.climb.from, this.climb.to, t);
      this.pos.y += Math.sin(t * Math.PI) * 0.5;
      if (t >= 1) {
        this.climb = null;
        this.onRock = true;
        if (!g.climbed) {
          g.climbed = true;
          this.frozen = true;
          this.yaw = Math.atan2(-SHELTER.x, -SHELTER.z) + Math.PI;
          this.opts.onDialogue?.("fork");
        }
      }
      return { hs: 0, crouch: false, water: false };
    }
    let f = 0, s = 0;
    if (this.active && !this.frozen) {
      if (k.has("KeyW") || k.has("ArrowUp")) f += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) f -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) s += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) s -= 1;
      f -= this.touchMove.y;
      s += this.touchMove.x;
    }
    const crouch = this.active && (this.crouchToggle || k.has("KeyC") || k.has("ControlLeft"));
    const run = this.active && !g.carrying && !crouch && (k.has("ShiftLeft") || k.has("ShiftRight"));
    this.crouchAmt += ((crouch ? 1 : 0) - this.crouchAmt) * (1 - Math.exp(-dt * 8));
    const cold = coldAt(this.pos.x, this.pos.z);
    const tired = (1 - 0.3 * (g.exhaustion / 100)) * (1 - 0.15 * cold); // exhaustion, and the wind on the ridge
    const nr = nearest(RIDGE_P, this.pos.x, this.pos.z);
    const narrow = g.route === "ridge" && nr.d < 3 && nr.s > 40 && nr.s < RIDGE_P.len - 40;
    const base = g.carrying ? (crouch ? 1.15 : narrow ? 1.05 : 1.55) : crouch ? 1.3 : run ? 5.0 : 2.7;
    const water = inWater(this.pos.x, this.pos.z);
    const speed = base * tired * (water ? 0.8 : 1);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    this.vel.lerp(wish, 1 - Math.exp(-dt * (this.onGround ? 9 : 2)));
    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    const bx = this.blocked(this.pos.x + dx, this.pos.z);
    if (!bx) this.pos.x += dx;
    else this.vel.x = 0;
    const bz = this.blocked(this.pos.x, this.pos.z + dz);
    if (!bz) this.pos.z += dz;
    else this.vel.z = 0;
    if ((bx === "edge" || bz === "edge") && this.edgeT <= 0) {
      this.edgeT = 6;
      this.bark("ammar", "edge", BARKS.edge.ar, BARKS.edge.en, 10);
    }
    const ground = groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.onRock && ground < this.pos.y - 0.3) this.onRock = false;
    if (k.has("Space") && this.onGround && !g.carrying && this.active && !this.frozen) this.velY = 4.2;
    this.velY -= 14 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= ground || (this.velY <= 0 && this.pos.y - ground < 0.35 && this.onGround)) {
      this.pos.y = ground;
      this.velY = 0;
      this.onGround = true;
    } else this.onGround = false;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.2) {
      this.stepPhase += dt * hs * (g.carrying ? 2.6 : 2.3);
      const st = Math.floor(this.stepPhase / Math.PI);
      if (st !== this.lastStep) {
        this.lastStep = st;
        const sp = splatAt(this.pos.x, this.pos.z, 1);
        const surface: Surface = water ? "water" : sp[2] > 0.5 ? "stone" : sp[1] > 0.5 ? "gravel" : "dirt";
        this.opts.audio?.step(surface, crouch ? 0.35 : g.carrying ? 1 : 0.8);
      }
    }
    // exhaustion & cold: slows and shakes, never kills
    const carryLoad = g.carrying ? (hs > 0.3 ? 0.2 : 0.05) : hs > 0.3 ? (run ? 0.2 : 0) : -0.9;
    const fireNear = Math.hypot(this.pos.x - FIRE.x, this.pos.z - FIRE.z) < 5;
    g.exhaustion = THREE.MathUtils.clamp(g.exhaustion + dt * (carryLoad + cold * (g.carrying ? 0.6 : 0.3) + (narrow ? 0.15 : 0) - (fireNear ? 4 : 0)), 0, 100);
    return { hs, crouch, water };
  }

  private updateAmmar(dt: number) {
    const a = this.ammar, g = this.game;
    if (g.stage === "bridge" || g.stage === "loss" || g.stage === "dawn" || g.stage === "ended") {
      a.group.position.copy(a.pos);
      a.group.rotation.y = a.yaw;
      a.group.scale.y = a.kneel ? 0.7 : 1.03;
      return;
    }
    const last = a.trail[a.trail.length - 1];
    if (!last || Math.hypot(last[0] - this.pos.x, last[1] - this.pos.z) > 0.8) a.trail.push([this.pos.x, this.pos.z]);
    if (a.trail.length > 600) a.trail.shift();
    // stays with Lakhdar while he's on the ground; otherwise walks in the player's footsteps
    let tx: number, tz: number;
    if (!g.carrying) {
      const lk = this.lakhdarPos();
      tx = lk.x + 0.8;
      tz = lk.z + 0.6;
      a.kneel = Math.hypot(a.pos.x - tx, a.pos.z - tz) < 0.6;
    } else {
      a.kneel = false;
      // footsteps already behind Ammar (farther from the player than he is) are skipped
      const mine = Math.hypot(this.pos.x - a.pos.x, this.pos.z - a.pos.z);
      while (a.trail.length > 1 && (Math.hypot(a.trail[0][0] - a.pos.x, a.trail[0][1] - a.pos.z) < 0.6 || Math.hypot(a.trail[0][0] - this.pos.x, a.trail[0][1] - this.pos.z) > mine + 0.5)) a.trail.shift();
      const near = Math.hypot(this.pos.x - a.pos.x, this.pos.z - a.pos.z) < 2.6;
      if (near) {
        a.walk *= 0.9;
        a.group.position.copy(a.pos);
        a.group.rotation.y = a.yaw;
        a.group.scale.y = 1.03;
        return;
      }
      [tx, tz] = a.trail[0] ?? [this.pos.x, this.pos.z];
    }
    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 60) {
      a.pos.set(this.pos.x + 1.5, 0, this.pos.z + 1.5);
      a.trail = [];
    } else if (d > 0.15) {
      const behind = Math.hypot(this.pos.x - a.pos.x, this.pos.z - a.pos.z);
      const sp = Math.min(d, (behind > 4 || d > 6 ? 3.2 : 1.8) * dt);
      a.pos.x += (dx / d) * sp;
      a.pos.z += (dz / d) * sp;
      a.yaw += Math.atan2(Math.sin(Math.atan2(dx, dz) - a.yaw), Math.cos(Math.atan2(dx, dz) - a.yaw)) * Math.min(1, dt * 6);
      a.walk += sp * 3.3;
    }
    a.pos.y = groundAt(a.pos.x, a.pos.z, a.pos.y + 0.4);
    a.group.position.copy(a.pos);
    a.group.rotation.y = a.yaw;
    a.group.scale.y = a.kneel ? 0.7 : 1.03;
    const sw = Math.sin(a.walk) * 0.35;
    a.group.children[0].rotation.x = sw;
    a.group.children[1].rotation.x = -sw;
  }

  private updateGame(dt: number, pl: { hs: number; crouch: boolean; water: boolean }, sim: boolean) {
    const g = this.game;
    if (this.failT > 0) {
      this.failT -= dt;
      if (this.failT <= 0) {
        this.restore();
        this.frozen = false;
      }
    }
    this.barkCd -= dt;
    this.edgeT -= dt;
    if (!sim) return;
    g.elapsed += dt;
    if (g.fireCd > 0) g.fireCd -= dt;
    if (g.reloading > 0) {
      g.reloading -= dt;
      if (g.reloading <= 0) {
        const take = Math.min(5 - g.ammo.mag, g.ammo.reserve);
        g.ammo.mag += take;
        g.ammo.reserve -= take;
      }
    }
    g.hurtT += dt;
    if (g.hurtT > 6 && g.health < 100) g.health = Math.min(100, g.health + dt * 6);
    const moving = pl.hs > 0.3;
    this.stim = this.computeStim(pl.crouch, moving, pl.water);
    this.pursuers.update(dt, this.stim, pl.water);
    if (this.frozen) return;
    // beats
    const p = this.pos;
    if (g.stage === "leave" && g.carrying && p.z < LEFT_TOWN.z) {
      g.stage = "fork";
      this.event("mc.left_town");
      this.saveCheckpoint("cp_mc_left");
    }
    if (g.stage === "fork" && g.carrying && Math.hypot(p.x - FORK.x, p.z - FORK.z) < 6) this.bark("ammar", "rock", BARKS.putDownRock.ar, BARKS.putDownRock.en);
    if (g.stage === "route" && g.carrying) {
      const P = g.route === "valley" ? VALLEY_P : RIDGE_P, n = nearest(P, p.x, p.z);
      if (n.d < 10 && n.s > P.len - (g.route === "valley" ? 34 : 30)) {
        this.event(g.route === "valley" ? "mc.valley_crossed" : "mc.ridge_crossed");
        if (g.route === "valley") g.doubt += 20;
        else g.exhaustion = Math.min(100, g.exhaustion + 30);
        g.stage = "shelter";
        const b = g.route === "valley" ? BARKS.valleyDone : BARKS.ridgeDone;
        this.bark("ammar", "crossed", b.ar, b.en);
        window.setTimeout(() => this.bark("ammar", "near", BARKS.shelterNear.ar, BARKS.shelterNear.en), 4500);
      }
    }
    if (g.route && coldAt(p.x, p.z) > 0.6 && g.carrying) this.bark("ammar", "cold", BARKS.cold.ar, BARKS.cold.en);
    if (g.route === "valley" && Math.hypot(p.x - CACHE_VALLEY.x, p.z - CACHE_VALLEY.z) < 8) this.bark("ammar", "cache", BARKS.cache.ar, BARKS.cache.en);
    if (g.route === "ridge" && Math.hypot(p.x - CACHE_RIDGE.x, p.z - CACHE_RIDGE.z) < 8) this.bark("ammar", "cache", BARKS.cache.ar, BARKS.cache.en);
    this.lakhdarBarkT -= dt;
    if (this.lakhdarBarkT <= 0 && g.carrying) {
      this.lakhdarBarkT = 70 + Math.random() * 40;
      const lines = [
        ["…ما زال بعيداً؟", "…Is it still far?"],
        ["أسمع الماء… أم هو الدم في أذني؟", "I hear water… or is that the blood in my ears?"],
        ["اتركني يا صالح… أنقذ نفسك.", "Leave me, Salah… save yourself."],
        ["أمّي كانت تقول إن الجبل لا يخون أهله.", "My mother used to say the mountain doesn't betray its own."],
      ];
      const l = lines[Math.floor(Math.random() * lines.length)];
      this.opts.onBark?.("lakhdar", l[0], l[1]);
    }
    // interaction & holds
    this.act = this.findAct();
    const a = this.act;
    if (a && a.hold && !a.blocked && (this.keys.has("KeyE") || this.touchInteract)) {
      if (this.hold.id !== a.id) this.hold = { id: a.id, t: 0 };
      this.hold.t += dt;
      if (this.hold.t >= a.hold) {
        this.hold = { id: "", t: 0 };
        a.run?.();
      }
    } else this.hold = { id: "", t: 0 };
  }

  private hud(): MHud {
    const g = this.game;
    const [objAr, objEn] = OBJ[g.stage];
    let subAr: string | undefined, subEn: string | undefined;
    if (g.stage === "fork") {
      subAr = g.carrying ? "ضعه عند الصخرة (امسك E)، ثم تسلّق (E)" : "تسلّق الصخرة (E) — من فوق يُرى الطريقان والملجأ";
      subEn = g.carrying ? "Set him down at the rock (hold E), then climb (E)" : "Climb the rock (E) — both routes and the shelter are visible from the top";
    } else if (g.stage === "route") {
      subAr = g.route === "valley" ? "الوادي: الدورية على الضفة الشرقية والكلب يتبع الأثر — الماء يمحوه" : "الحافة: ريح وبرد — لا تقف طويلاً";
      subEn = g.route === "valley" ? "Valley: the patrol walks the east bank and the dog tracks you — water erases the trail" : "Ridge: wind and cold — don't stand still long";
    } else if (g.stage === "leave" && !g.carrying) {
      subAr = "امسك E قرب لخضر لحمله";
      subEn = "Hold E next to Lakhdar to carry him";
    }
    const a = this.act;
    return {
      stage: g.stage, objAr, objEn, subAr, subEn, carrying: g.carrying, exhaustion: g.exhaustion, cold: coldAt(this.pos.x, this.pos.z),
      health: Math.max(0, g.health), suspicion: this.pursuers.maxSuspicion(), dog: this.pursuers.dog.barking > 0 || this.pursuers.dog.state === "track",
      alarm: this.pursuers.alarm, visibility: this.visState,
      prompt: a ? { ar: a.ar, en: a.en, hold: !!a.hold, blocked: a.blocked } : null,
      hold: a?.hold && this.hold.id === a.id ? this.hold.t / a.hold : 0,
      ammo: g.carrying ? null : { mag: g.ammo.mag, reserve: g.ammo.reserve }, route: g.route, water: inWater(this.pos.x, this.pos.z),
      supplies: g.supplies.filter(Boolean).length,
    };
  }
  mapState(): MMapState {
    const lk = this.lakhdarPos();
    return {
      player: { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
      lakhdar: { x: lk.x, z: lk.z },
      ammar: { x: this.ammar.pos.x, z: this.ammar.pos.z },
      guards: this.pursuers.guards.filter((g) => g.alive && g.group.visible).map((g) => ({ x: g.pos.x, z: g.pos.z, yaw: g.yaw, alert: g.state === "alert" })),
      dog: { x: this.pursuers.dog.pos.x, z: this.pursuers.dog.pos.z },
      route: this.game.route,
    };
  }
  static layout() {
    return { PLAY, FORK, SHELTER, VALLEY, RIDGE, PATROL, OBSERVER, CACHE_VALLEY, CACHE_RIDGE, HOUSES, COLD_ZONES, SPAWN };
  }

  // ======================= frame =======================
  private drawOverlay() {
    const c = this.overlay;
    if (!c) return;
    const W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    const st = this.game.stage;
    if (!this.active || this.cine.on || st === "loss" || st === "dawn" || st === "ended" || st === "bridge") return;
    let target: { x: number; z: number; y?: number } | null = null;
    if (!this.game.carrying) {
      const lk = this.lakhdarPos();
      if (Math.hypot(lk.x - this.pos.x, lk.z - this.pos.z) > 4) target = { x: lk.x, z: lk.z, y: lk.y + 1 };
    }
    if (!target) {
      if (st === "fork" || st === "leave") target = { x: FORK.x, z: FORK.z, y: terrainHeight(0, 0) + 2.4 };
      else if (st === "shelter" || st === "route") target = { x: SHELTER.x, z: SHELTER.z, y: terrainHeight(SHELTER.x, SHELTER.z) + 2.6 };
    }
    if (!target) return;
    const v = new THREE.Vector3(target.x, target.y ?? terrainHeight(target.x, target.z) + 1.6, target.z).project(this.camera);
    let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
    if (v.z > 1) {
      x = W - x;
      y = H - 40;
    }
    x = THREE.MathUtils.clamp(x, 30, W - 30);
    y = THREE.MathUtils.clamp(y, 40, H - 40);
    const d = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    c.save();
    c.translate(x, y);
    c.rotate(Math.PI / 4);
    c.strokeStyle = this.game.carrying ? "rgba(255,225,170,0.8)" : "rgba(160,235,190,0.85)";
    c.lineWidth = 1.2;
    c.strokeRect(-6, -6, 12, 12);
    c.restore();
    c.fillStyle = "rgba(255,235,200,0.7)";
    c.font = "10px system-ui";
    c.textAlign = "center";
    c.fillText(`${Math.round(d)} m`, x, y + 20);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1), t = this.clock.elapsedTime;
    this.step(dt, t);
    this.render(dt, t);
  };
  private step(dt: number, t: number) {
    const sim = this.active && !this.frozen;
    const pl = sim || this.climb ? this.updatePlayer(dt) : { hs: 0, crouch: this.crouchAmt > 0.5, water: false };
    this.updateGame(dt, pl, sim);
    this.updateAmmar(dt);
    this.applyLakhdar();
    this.dawn += (this.dawnTarget - this.dawn) * (1 - Math.exp(-dt * 0.12));
    // camera
    const g = this.game, cold = coldAt(this.pos.x, this.pos.z);
    const bob = Math.min(pl.hs / 4, 1) * (g.carrying ? 1.5 : 1);
    const ex = g.exhaustion / 100;
    const eye = THREE.MathUtils.lerp(EYE, EYE_CROUCH, this.crouchAmt) - (g.carrying ? 0.08 : 0);
    const shake = ex * ex * 0.012 + cold * 0.004;
    this.camera.position.set(
      this.pos.x + Math.cos(this.stepPhase) * 0.035 * bob + Math.sin(t * 7.3) * shake,
      this.pos.y + eye + Math.abs(Math.sin(this.stepPhase)) * 0.07 * bob + Math.sin(t * (1.1 + ex * 1.8)) * (0.012 + ex * 0.03),
      this.pos.z + Math.cos(t * 6.1) * shake,
    );
    this.camera.rotation.set(this.pitch + Math.sin(t * 0.7) * (0.003 + ex * 0.01), this.yaw + Math.sin(t * 0.43) * (0.003 + ex * 0.008), Math.cos(this.stepPhase) * 0.008 * bob + (g.carrying ? 0.03 : 0), "YXZ");
    if (this.cine.on) {
      const k = 1 - Math.exp(-dt * this.cine.speed);
      this.cine.pos.lerp(this.cine.tpos, k);
      this.cine.look.lerp(this.cine.tlook, k);
      this.camera.position.copy(this.cine.pos);
      this.camera.lookAt(this.cine.look);
    }
    this.camera.updateMatrixWorld();
    this.viewGroup.visible = !this.cine.on && g.stage !== "loss" && g.stage !== "dawn";
    this.carryArm.visible = g.carrying;
    this.rifle.visible = !g.carrying;
  }
  private render(dt: number, t: number) {
    const g = this.game;
    // streaming
    this.chunkTimer -= dt;
    if (this.chunkTimer <= 0) {
      this.chunkTimer = 0.15;
      this.updateTerrain(1);
    }
    this.grassTimer -= dt;
    if (this.grassTimer <= 0) {
      this.grassTimer = 0.2;
      this.updateGrass(1);
    }
    this.treeTimer -= dt;
    if (this.treeTimer <= 0) {
      this.treeTimer = 0.5;
      this.updateTrees();
    }
    this.green.UT.value = t;
    // dawn
    const dwn = this.dawn;
    const hor = HORIZON.clone().lerp(DAWN_HORIZON, dwn);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(hor);
    fog.far = THREE.MathUtils.lerp(4000, 2600, dwn); // a little morning mist
    this.farMat.uniforms.uFogFar.value = fog.far;
    this.skyMat.uniforms.uHorizon.value.set(hor.r, hor.g, hor.b);
    this.skyMat.uniforms.uDawn.value = dwn;
    this.skyMat.uniforms.uTime.value = t;
    this.farMat.uniforms.uHorizon.value.copy(hor);
    this.farMat.uniforms.uDawn.value = dwn;
    (this.stars.material as THREE.PointsMaterial).opacity = 0.85 * (1 - dwn);
    this.moon.intensity = THREE.MathUtils.lerp(1.25, 0.5, dwn);
    this.moon.color.setRGB(THREE.MathUtils.lerp(0.64, 0.8, dwn), THREE.MathUtils.lerp(0.75, 0.8, dwn), THREE.MathUtils.lerp(1, 0.82, dwn));
    this.hemi.intensity = 0.65 + dwn * 1.4;
    this.hemi.color.setRGB(THREE.MathUtils.lerp(0.17, 0.62, dwn), THREE.MathUtils.lerp(0.31, 0.64, dwn), THREE.MathUtils.lerp(0.48, 0.68, dwn));
    this.moon.position.copy(this.pos).addScaledVector(MOON_DIR, 120);
    this.moon.target.position.copy(this.pos);
    this.skyGroup.position.set(this.camera.position.x, 0, this.camera.position.z);
    // fire
    const v = this.fireFlicker.update(t, dt);
    this.fireLight.intensity = 22 * v;
    this.fireSprites.forEach((s, i) => {
      s.position.y = terrainHeight(FIRE.x, FIRE.z) + 0.15 + ((i * 0.13 + t * 0.6) % 0.7);
      (s.material as THREE.SpriteMaterial).opacity = v * (1 - (s.position.y - terrainHeight(FIRE.x, FIRE.z)) / 0.9);
    });
    this.opts.audio?.setFire(Math.max(0, 1 - this.pos.distanceTo(this.fireLight.position) / 25) * 0.6);
    // cold: snow, wind, breath
    const cold = coldAt(this.pos.x, this.pos.z);
    this.snow.mat.uniforms.uTime.value = t;
    this.snow.mat.uniforms.uCenter.value.copy(this.camera.position);
    (this.snow.points.material as THREE.ShaderMaterial).visible = true;
    this.snow.points.visible = cold > 0.2 || g.stage === "dawn";
    this.opts.audio?.setWind(cold * 1.3 + (this.pos.y > PROFILE.end - 5 ? 0.3 : 0));
    this.breathT -= dt;
    if (this.breathT <= 0 && !this.cine.on) {
      this.breathT = 2.6 - g.exhaustion * 0.012;
      const b = this.breath.find((q) => q.life <= 0);
      if (b) {
        b.life = 1.6;
        b.s.visible = true;
        b.s.position.set((Math.random() - 0.5) * 0.1, -0.12, -0.55);
        b.s.scale.setScalar(0.25);
      }
    }
    for (const b of this.breath) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.s.position.y += dt * 0.08;
      b.s.position.z -= dt * 0.12;
      b.s.scale.addScalar(dt * 0.35);
      (b.s.material as THREE.SpriteMaterial).opacity = Math.max(0, b.life / 1.6) * (0.25 + cold * 0.35);
      if (b.life <= 0) b.s.visible = false;
    }
    for (const tr of this.tracers) {
      if (tr.life > 0) tr.life -= dt;
      tr.mat.opacity = Math.max(0, tr.life / 0.07) * 0.9;
    }
    this.flash.intensity *= Math.exp(-dt * 40);
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
  }
  private readyFired = false;

  /** test hook: deterministic logic steps (no rendering) */
  simulate(seconds: number, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) this.step(dt, this.clock.elapsedTime + t);
    this.opts.onHud?.(this.hud());
    return this.game.stage;
  }
  debug() {
    return { game: this.game, pursuers: this.pursuers, act: this.act, ammar: this.ammar, boxes: BOXES.length, profile: PROFILE };
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("pointerlockchange", this.onLock);
    window.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("touchend", this.onTouchEnd);
    window.removeEventListener("touchcancel", this.onTouchEnd);
    window.removeEventListener("resize", this.onResize);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.fx.dispose();
    this.renderer.dispose();
    BOXES.length = 0;
    delete (window as unknown as { __mountain?: MountainLevel }).__mountain;
  }
}
