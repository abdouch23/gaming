import * as THREE from "three";
import {
  mulberry32, noiseTexture, NOISE_GLSL, makeShaftMaterial, makeGlowSprite, makeParticleField, createPostFX, Flicker,
  type PostFX,
} from "@/lib/lighting";
import {
  MAP, DITCH, HOUSES, SPAWN, CULVERT, CROSSROADS, SPRING, ROCK, ROCK_TOP, PLATFORMS, BASE_PLATFORM_COUNT,
  baseHeight, terrainHeight, pathDist, polyDist, groundAt, zoneAt, smoothstep, splatAt,
  type V2, type Zone, type House,
} from "@/lib/night/world";
import { makeZahra, makeAmmar } from "@/lib/night/figures";
import { createGreenKit } from "@/lib/ported/greenworld";
import type { createAdobeKit } from "@/lib/ported/adobe";
import { buildHouses } from "@/lib/night/houses";
import { Gendarmerie, type Stimulus } from "@/lib/night/guards";
import type { Surface } from "@/lib/night/audio";

export type Stage = "reach_culvert" | "reach_zahra" | "observe" | "deliver" | "ended";
export interface HudState {
  clock: string;
  stage: Stage;
  objAr: string;
  objEn: string;
  subAr?: string;
  subEn?: string;
  suspicion: number;
  visibility: "hidden" | "shadow" | "lit";
  prompt: { ar: string; en: string } | null;
  observe: number;
  hasMessage: boolean;
}
export interface Ending { holds: boolean; trust: number; catches: number; observed: boolean; clock: string }

const OBJECTIVES: Record<Stage, [string, string]> = {
  reach_culvert: ["تسلّل إلى القنطرة دون أن يراك الدرك", "Slip down to the culvert unseen"],
  reach_zahra: ["اصعد إلى بيت زهرة، وتجنّب ضوء الفوانيس", "Reach Zahra's house, avoid the lantern light"],
  observe: ["راقب الدورية منحنياً من أعلى الصخرة الشرقية", "Crouch atop the Eastern Rock and watch the patrol"],
  deliver: ["أوصل الرسالة إلى عمّار عند العين قبل الفجر", "Deliver the message to Ammar at the spring before dawn"],
  ended: ["", ""],
};
const START_MIN = 23 * 60 + 12;
const DAWN_ELAPSED = 5 * 60 + 33; // 04:45
const SEC_PER_MIN = 2.5;

export interface LevelOptions {
  onHud?: (h: HudState) => void;
  onDialogue?: (who: "zahra" | "ammar") => void;
  onCaught?: (reason: "caught" | "dawn") => void;
  onEnding?: (e: Ending) => void;
  onCheckpoint?: (name: string) => void;
  lowPower: boolean;
  onReady?: () => void;
  onZone?: (z: Zone | null) => void;
  onActiveChange?: (active: boolean) => void;
  onStep?: (surface: Surface, loudness: number) => void;
}

const MOON_DIR = new THREE.Vector3(0.35, 0.42, -0.84).normalize();
const HORIZON = new THREE.Color().setRGB(0.035, 0.075, 0.11);
const EYE_STAND = 1.65;
const EYE_CROUCH = 1.0;
const RADIUS = 0.32;

const SKY_FRAG = /* glsl */ `
uniform vec3 uMoonDir; uniform float uTime; uniform vec3 uHorizon;
varying vec3 vDir;
${NOISE_GLSL}
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 zen = vec3(0.003, 0.007, 0.016);
  vec3 col = mix(uHorizon, zen, pow(smoothstep(-0.02, 0.65, h), 0.6));
  float m = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.25, 0.4, 0.62) * pow(m, 10.0) * 0.22 + vec3(0.5, 0.7, 1.0) * pow(m, 180.0) * 0.5;
  vec2 uv = d.xz / (d.y + 0.18) * 1.4 + vec2(uTime * 0.004, uTime * 0.001);
  float c = smoothstep(0.48, 0.82, fbm(uv * 1.2));
  float lit = 0.35 + 1.6 * pow(m, 5.0);
  col = mix(col, vec3(0.045, 0.08, 0.12) * lit, c * 0.75 * smoothstep(0.0, 0.25, h));
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Lantern { light: THREE.PointLight; glass: THREE.MeshStandardMaterial; glow: THREE.Sprite; haze: THREE.Sprite; flicker: Flicker; base: number }
interface Shaft { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; base: number }
interface Idle { obj: THREE.Object3D; phase: number }

export class NightLevel {
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

  private moon!: THREE.DirectionalLight;
  private skyGroup = new THREE.Group();
  private skyMat!: THREE.ShaderMaterial;
  private lanterns: Lantern[] = [];
  private shafts: Shaft[] = [];
  private idles: Idle[] = [];
  private embers: THREE.MeshStandardMaterial[] = [];
  private dust!: ReturnType<typeof makeParticleField>;

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
  private jumpQueued = false;
  private active = false;
  readonly isTouch: boolean;
  private moveTouch: { id: number; x: number; y: number } | null = null;
  private lookTouch: { id: number; x: number; y: number } | null = null;
  private touchMove = new THREE.Vector2();
  private zoneTimer = 0;
  private zoneId: string | null = "__init";
  private readyFired = false;

  // ported kits + game state
  private green: ReturnType<typeof createGreenKit>;
  private adobe!: ReturnType<typeof createAdobeKit>;
  private patches = new Map<string, { lv: number; meshes: THREE.Mesh[] }>();
  private grassTimer = 0;
  private occluders: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();
  private guards!: Gendarmerie;
  private zahraPos = new THREE.Vector3();
  private ammarPos = new THREE.Vector3();
  private gate: THREE.Group | null = null;
  private gatePlatform: (typeof PLATFORMS)[number] | null = null;
  readonly game = { stage: "reach_culvert" as Stage, trust: 5, promise: false, observed: false, hasMessage: false, catches: 0, elapsed: 0, observe: 0 };
  private checkpoint = { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, ...this.game };
  private frozen = false;
  private caughtUntil = 0;
  private caughtReason: "caught" | "dawn" = "caught";
  private crouchToggle = false;
  private senseTimer = 0;
  private hudTimer = 0;
  private stim: Stimulus | null = null;
  private visState: HudState["visibility"] = "shadow";
  private prompt: HudState["prompt"] = null;
  private markerEl: HTMLElement | null = null;
  private markerDist: HTMLElement | null = null;

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
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.FogExp2(HORIZON.clone(), 0.021);
    this.camera = new THREE.PerspectiveCamera(w < h ? 80 : 68, w / h, 0.05, 700);

    this.green = createGreenKit({
      height: terrainHeight,
      splat: splatAt,
      quality: this.low ? 0.3 : 0.65,
      sunDir: MOON_DIR,
      skyTop: new THREE.Color().setRGB(0.003, 0.007, 0.016),
      skyHor: HORIZON.clone(),
      wind: 0.8,
    });
    this.buildEnvironment();
    this.buildSky();
    this.buildTerrain();
    this.buildWater();
    this.buildVillage();
    this.buildWalls();
    this.buildCulvert();
    this.buildRock();
    this.buildSpring();
    this.buildVegetation();
    this.buildLights();
    this.buildFigures();
    this.buildMoonShafts();
    this.dust = makeParticleField(
      this.low ? 700 : 1600,
      new THREE.Vector3(50, 16, 50),
      [
        { color: 0xb5d4ff, weight: 0.82, gain: 0.55 },
        { color: 0x6fb4ff, weight: 0.12, gain: 0.6 },
        { color: 0xffc27a, weight: 0.06, gain: 0.5 },
      ],
      this.renderer.getPixelRatio(),
    );
    this.dust.mat.uniforms.uWind.value.set(0.7, -0.05, 0.18);
    this.scene.add(this.dust.points);

    this.fx = createPostFX(this.renderer, this.scene, this.camera, { low: this.low, bloom: [0.75, 0.7, 0.22], vignette: 0.12 });

    this.pos.set(SPAWN.x, groundAt(SPAWN.x, SPAWN.z).y, SPAWN.z);
    this.camera.position.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    this.updateGrass(Infinity);
    this.bindInput();
    (window as unknown as { __night?: NightLevel }).__night = this;
    this.loop();
  }

  // ---------------- builders ----------------
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
      uniforms: { uMoonDir: { value: MOON_DIR }, uTime: { value: 0 }, uHorizon: { value: new THREE.Vector3(HORIZON.r, HORIZON.g, HORIZON.b) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), this.skyMat);
    dome.renderOrder = -10;
    this.skyGroup.add(dome);

    // stars
    const rng = mulberry32(5);
    const n = 1400;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * Math.PI * 2, y = 0.06 + Math.pow(rng(), 0.7) * 0.94;
      const r = Math.sqrt(1 - y * y);
      p[i * 3] = Math.cos(u) * r * 480;
      p[i * 3 + 1] = y * 480;
      p[i * 3 + 2] = Math.sin(u) * r * 480;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(0xa8c4ea).multiplyScalar(0.9), size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
    this.skyGroup.add(stars);

    // moon + corona
    const moon = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdbe8ff).multiplyScalar(5), fog: false }));
    moon.position.copy(MOON_DIR).multiplyScalar(420);
    moon.lookAt(0, 0, 0);
    const corona = makeGlowSprite(0x7fa8e8, 0.55, 110, false);
    corona.position.copy(moon.position);
    const corona2 = makeGlowSprite(0x2f5c90, 0.25, 360, false);
    corona2.position.copy(moon.position);
    this.skyGroup.add(moon, corona, corona2);

    // distant Aurès ridges
    const ridge = (radius: number, amp: number, base: number, col: THREE.Color, seed: number) => {
      const r = mulberry32(seed);
      const N = 160;
      const phases = [r() * 6, r() * 6, r() * 6];
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        let hgt = base + amp * (0.5 + 0.5 * Math.sin(a * 3 + phases[0])) + amp * 0.45 * Math.sin(a * 7 + phases[1]) + amp * 0.18 * Math.sin(a * 19 + phases[2]);
        hgt += amp * 0.8 * Math.max(0, -Math.cos(a - Math.PI * 1.5)); // higher to the north
        const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        pos.push(x, -30, z, x, hgt, z);
        if (i < N) {
          const k = i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, fog: false, side: THREE.DoubleSide }));
    };
    this.skyGroup.add(ridge(300, 34, 12, new THREE.Color().setRGB(0.018, 0.036, 0.054), 11));
    this.skyGroup.add(ridge(200, 22, 6, new THREE.Color().setRGB(0.008, 0.016, 0.026), 12));
    this.scene.add(this.skyGroup);
  }

  private buildTerrain() {
    const seg = this.low ? 1.4 : 0.8;
    const W = 180, D = 145;
    const geo = new THREE.PlaneGeometry(W, D, Math.round(W / seg), Math.round(D / seg));
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -2.5);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const n = geo.attributes.normal as THREE.BufferAttribute;
    const splat = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const w = splatAt(p.getX(i), p.getZ(i), n.getY(i));
      splat[i * 4] = w[0];
      splat[i * 4 + 1] = w[1];
      splat[i * 4 + 2] = w[2];
    }
    geo.setAttribute("aSplat", new THREE.BufferAttribute(splat, 4));
    const mesh = new THREE.Mesh(geo, this.green.tMat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /** Stream grass/flower patches (ported LOD scheme) around the camera. */
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

  private ribbon(poly: V2[], width: number, yAt: (x: number, z: number) => number, step = 0.6) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < poly.length - 1; i++) {
      const a = new THREE.Vector2(...poly[i]), b = new THREE.Vector2(...poly[i + 1]);
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
      for (let k = 0; k < n; k++) pts.push(a.clone().lerp(b, k / n));
    }
    pts.push(new THREE.Vector2(...poly[poly.length - 1]));
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let len = 0;
    pts.forEach((pt, i) => {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      const t = next.clone().sub(prev).normalize();
      const nx = -t.y * width * 0.5, nz = t.x * width * 0.5;
      if (i > 0) len += pt.distanceTo(pts[i - 1]);
      pos.push(pt.x + nx, yAt(pt.x + nx, pt.y + nz), pt.y + nz, pt.x - nx, yAt(pt.x - nx, pt.y - nz), pt.y - nz);
      uv.push(0, len / width, 1, len / width);
      if (i < pts.length - 1) {
        const k = i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  private buildWater() {
    const g = this.ribbon(DITCH, 1.0, (x, z) => baseHeight(x, z) - 0.72);
    const mat = new THREE.MeshStandardMaterial({ color: 0x030a10, roughness: 0.06, metalness: 0.4, envMapIntensity: 2.2 });
    const water = new THREE.Mesh(g, mat);
    water.receiveShadow = true;
    this.scene.add(water);
  }

  private stoneMaterial(seed: number, tint: number) {
    const map = noiseTexture(this.low ? 64 : 128, mulberry32(seed), (v) => 0.55 + (v - 0.5) * 1.3, 5);
    map.repeat.set(2, 2);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ color: tint, map, bumpMap: map, bumpScale: 4, roughness: 0.94, envMapIntensity: 0.4 });
  }

  private add(mesh: THREE.Mesh, cast = true, receive = true) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.scene.add(mesh);
    return mesh;
  }

  private buildVillage() {
    const { built, kit } = buildHouses(this.scene, HOUSES, this.low);
    this.adobe = kit;
    built.forEach((b, i) => {
      this.occluders.push(b.group);
      if (HOUSES[i].zahra) this.zahraPos.copy(b.doorstep);
    });
  }

  private faceOf(h: House) {
    switch (h.door) {
      case "n": return { nx: 0, nz: -1, tx: 1, tz: 0, depth: h.d, span: h.w };
      case "s": return { nx: 0, nz: 1, tx: 1, tz: 0, depth: h.d, span: h.w };
      case "e": return { nx: 1, nz: 0, tx: 0, tz: 1, depth: h.w, span: h.d };
      default: return { nx: -1, nz: 0, tx: 0, tz: 1, depth: h.w, span: h.d };
    }
  }

  private buildWalls() {
    const WALLS: V2[][] = [
      [[-42, 35], [-30, 31], [-18, 29]],
      [[-12, 27], [2, 23.5], [14, 21]],
      [[24, 17], [44, 12]],
      [[-15, -10], [-15, -34]],
      [[31, -2], [31, -27]],
      [[-40, 12], [-34, -6], [-30, -20]],
    ];
    const pieces: { x: number; z: number; a: number }[] = [];
    for (const wall of WALLS) {
      for (let i = 0; i < wall.length - 1; i++) {
        const [ax, az] = wall[i], [bx, bz] = wall[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.ceil(len / 1.5);
        const a = Math.atan2(bx - ax, bz - az);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          if (Math.random() < 0.08) continue; // collapsed gaps
          if (Math.abs(x + 15) < 0.5 && Math.abs(z + 20) < 1.4) continue; // Zahra's hidden passage
          pieces.push({ x, z, a });
        }
      }
    }
    const mat = this.stoneMaterial(51, 0x6e665a);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.9, 1.6), mat, pieces.length);
    const dummy = new THREE.Object3D();
    pieces.forEach((p, i) => {
      const g = terrainHeight(p.x, p.z);
      dummy.position.set(p.x, g + 0.3, p.z);
      dummy.rotation.set((Math.random() - 0.5) * 0.06, p.a, (Math.random() - 0.5) * 0.06);
      dummy.scale.set(1, 0.85 + Math.random() * 0.3, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      PLATFORMS.push({ minX: p.x - 0.55, maxX: p.x + 0.55, minZ: p.z - 0.55, maxZ: p.z + 0.55, top: () => g + 0.72 });
    });
    inst.castShadow = inst.receiveShadow = true;
    this.scene.add(inst);
    this.occluders.push(inst);
    // the hidden passage: a weathered plank gate that Zahra unbars on a promise
    const gx = -15, gz = -20, gg = terrainHeight(gx, gz);
    this.gate = new THREE.Group();
    this.gate.position.set(gx, gg, gz - 1.25);
    for (let i = 0; i < 5; i++) {
      const plank = new THREE.Mesh(this.adobe.slab(0.12, 1.5 + (i % 2) * 0.12, 0.5, 0.012), this.adobe.Wo);
      plank.position.set(0, 0.75, 0.25 + i * 0.5);
      plank.castShadow = true;
      this.gate.add(plank);
    }
    this.scene.add(this.gate);
    this.gatePlatform = { minX: gx - 0.4, maxX: gx + 0.4, minZ: gz - 1.3, maxZ: gz + 1.3, top: () => gg + 2.2 };
    PLATFORMS.push(this.gatePlatform);
  }

  private openGate() {
    if (!this.gate || !this.gatePlatform) return;
    this.gate.rotation.y = -1.45;
    const i = PLATFORMS.indexOf(this.gatePlatform);
    if (i >= 0) PLATFORMS.splice(i, 1);
    this.gatePlatform = null;
  }

  private buildCulvert() {
    const mat = this.stoneMaterial(61, 0x7a7266);
    const top = groundAt(CULVERT.x, CULVERT.z).y;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 2.8), mat);
    slab.position.set(CULVERT.x, top - 0.2, CULVERT.z);
    this.add(slab);
    for (const s of [-1, 1]) {
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.45, 0.3), mat);
      parapet.position.set(CULVERT.x, top + 0.2, CULVERT.z + s * 1.3);
      this.add(parapet);
      PLATFORMS.push({ minX: CULVERT.x - 2.3, maxX: CULVERT.x + 2.3, minZ: CULVERT.z + s * 1.3 - 0.15, maxZ: CULVERT.z + s * 1.3 + 0.15, top: () => top + 0.8 });
    }
    // dark arch mouth under the slab
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.0, 16, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x040506, roughness: 1, side: THREE.DoubleSide }));
    arch.rotation.z = Math.PI / 2;
    arch.rotation.y = Math.PI / 2;
    arch.position.set(CULVERT.x, top - 0.95, CULVERT.z);
    this.scene.add(arch);
    this.addLanternPost(new THREE.Vector3(CULVERT.x + 2.3, 0, CULVERT.z + 1.9), 0.4);
  }

  private buildRock() {
    const k = this.green;
    const g0 = baseHeight(ROCK.x, ROCK.z);
    const body = new THREE.Mesh(k.mkRock(3.1, 56, 40), k.rockMat);
    body.scale.set(4.6, 8.2, 4.4);
    body.position.set(ROCK.x, g0 - 0.4, ROCK.z);
    this.add(body);
    const cap = new THREE.Mesh(k.mkRock(8.3, 40, 28), k.rockMat);
    cap.scale.set(3.3, 1.2, 3.3);
    cap.position.set(ROCK.x, ROCK_TOP - 0.75, ROCK.z);
    this.add(cap);
    this.occluders.push(body, cap);
    const rng = mulberry32(9);
    const small = [0, 1, 2, 3].map((v) => k.mkRock(v * 13.7 + 1, 22, 16));
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      if (Math.cos(a) < -0.6) continue; // keep the western ramp clear
      const m = new THREE.Mesh(small[i % 4], k.rockMat);
      m.scale.set(1.6 + rng() * 1.4, 1.4 + rng() * 2.2, 1.6 + rng() * 1.4);
      m.position.set(ROCK.x + Math.cos(a) * 3.6, g0 - 0.2, ROCK.z + Math.sin(a) * 3.6);
      m.rotation.y = rng() * 6;
      this.add(m);
    }
    for (let i = 0; i < 8; i++) {
      const x = 41 + i * 0.85;
      const y = groundAt(x, ROCK.z).y;
      const m = new THREE.Mesh(small[i % 4], k.rockMat);
      const h = Math.max(0.6, y - baseHeight(x, ROCK.z) + 0.5);
      m.scale.set(0.9, h, 1.5);
      m.position.set(x, y - h * 0.85, ROCK.z + (rng() - 0.5) * 0.3);
      m.rotation.y = rng();
      this.add(m);
    }
  }

  private buildSpring() {
    const mat = this.stoneMaterial(71, 0x7d7568);
    const g = baseHeight(SPRING.x, SPRING.z);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.6, 20), mat);
    basin.position.set(SPRING.x, g + 0.2, SPRING.z);
    this.add(basin);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshStandardMaterial({ color: 0x02080c, roughness: 0.03, metalness: 0.5, envMapIntensity: 2.5 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(SPRING.x, g + 0.51, SPRING.z);
    this.add(water, false, true);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.6), mat);
    back.position.set(SPRING.x, g + 0.6, SPRING.z - 1.8);
    this.add(back);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f42, metalness: 0.7, roughness: 0.4 }));
    spout.rotation.x = Math.PI / 2;
    spout.position.set(SPRING.x, g + 0.95, SPRING.z - 1.3);
    this.scene.add(spout);
    PLATFORMS.push({ minX: SPRING.x - 1.3, maxX: SPRING.x + 1.3, minZ: SPRING.z - 1.3, maxZ: SPRING.z + 1.3, top: () => g + 0.5 });
    PLATFORMS.push({ minX: SPRING.x - 1.6, maxX: SPRING.x + 1.6, minZ: SPRING.z - 2.1, maxZ: SPRING.z - 1.5, top: () => g + 1.4 });
  }

  private buildVegetation() {
    const rng = mulberry32(2024);
    const ok = (x: number, z: number, clear: number) => {
      if (x < MAP.minX + 2 || x > MAP.maxX - 2 || z < MAP.minZ + 1 || z > MAP.maxZ - 2) return false;
      if (pathDist(x, z) < clear || polyDist(x, z, DITCH) < 2) return false;
      if (Math.hypot(x - ROCK.x, z - ROCK.z) < 9 || Math.hypot(x - SPRING.x, z - SPRING.z) < 3.5) return false;
      if (Math.hypot(x - CULVERT.x, z - CULVERT.z) < 6 || Math.hypot(x - CROSSROADS.x, z - CROSSROADS.z) < 6) return false;
      return !HOUSES.some((h) => Math.abs(x - h.x) < h.w / 2 + 2 && Math.abs(z - h.z) < h.d / 2 + 2);
    };
    const pick = (n: number, clear: number, near?: { x: number; z: number; r: number }) => {
      const out: { x: number; z: number }[] = [];
      let guard = 0;
      while (out.length < n && guard++ < n * 60) {
        const x = near ? near.x + (rng() - 0.5) * near.r * 2 : MAP.minX + rng() * (MAP.maxX - MAP.minX);
        const z = near ? near.z + (rng() - 0.5) * near.r * 2 : MAP.minZ + rng() * (MAP.maxZ - MAP.minZ);
        if (ok(x, z, clear)) out.push({ x, z });
      }
      return out;
    };
    const dummy = new THREE.Object3D();

    // ported procedural trees: holm oaks, Aurès cedars (conifers) and scrub bushes
    const k = this.green;
    const species = [
      { c: false, seed: 11, P: k.OAK, bark: 0, leaf: 0, w: 0.3, s: [0.5, 0.75] },
      { c: false, seed: 37, P: { ...k.OAK, H: 8.5, wob: 0.3, n0: 6 }, bark: 0, leaf: 0, w: 0.2, s: [0.5, 0.7] },
      { c: true, seed: 7, P: k.CONI, bark: 2, leaf: 4, w: 0.22, s: [0.55, 0.85] },
      { c: true, seed: 19, P: { ...k.CONI, H: 15, rad: 3.5 }, bark: 2, leaf: 4, w: 0.1, s: [0.5, 0.7] },
      { c: false, seed: 3, P: k.BUSH, bark: 0, leaf: 0, w: 0.18, s: [0.8, 1.3] },
    ];
    const spots = [...pick(this.low ? 40 : 70, 3), ...pick(8, 2.5, { x: 6, z: -38, r: 9 })];
    const lists: { x: number; z: number }[][] = species.map(() => []);
    for (const t of spots) {
      let r = rng() * species.reduce((a, b) => a + b.w, 0), i = 0;
      while (i < species.length - 1 && r > species[i].w) r -= species[i++].w;
      if (species[i].c && t.z > 20 && rng() < 0.6) i = 0; // cedars favour the cold northern slope
      lists[i].push(t);
    }
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
        const sc = sp.s[0] + rng() * (sp.s[1] - sp.s[0]);
        dummy.position.set(t.x, g - 0.2, t.z);
        dummy.rotation.set(0, rng() * Math.PI * 2, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        bark.setMatrixAt(i, dummy.matrix);
        leaves.setMatrixAt(i, dummy.matrix);
        if (si !== 4) PLATFORMS.push({ minX: t.x - 0.3, maxX: t.x + 0.3, minZ: t.z - 0.3, maxZ: t.z + 0.3, top: () => g + 3 });
      });
      bark.castShadow = leaves.castShadow = true;
      bark.receiveShadow = leaves.receiveShadow = true;
      this.scene.add(bark, leaves);
    });

    // prickly pear clusters (الهندية) around the houses
    const pads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2c3a26, roughness: 0.7, envMapIntensity: 0.6 }), 14 * 9);
    let pi = 0;
    pick(14, 2, { x: 10, z: -16, r: 26 }).forEach((c) => {
      const g = terrainHeight(c.x, c.z);
      for (let k = 0; k < 9; k++) {
        dummy.position.set(c.x + (rng() - 0.5) * 0.9, g + 0.2 + rng() * 0.8, c.z + (rng() - 0.5) * 0.9);
        dummy.rotation.set(rng() * 0.6, rng() * 6, rng() * 0.6);
        dummy.scale.set(0.55, 0.72, 0.16);
        dummy.updateMatrix();
        pads.setMatrixAt(pi++, dummy.matrix);
      }
    });
    pads.count = pi;
    pads.castShadow = true;
    this.scene.add(pads);

    // scattered stones (ported procedural rock meshes)
    const rockGeos = [0, 1, 2, 3].map((v) => k.mkRock(v * 13.7 + 1, 22, 16));
    const spotsR = pick(this.low ? 90 : 160, 1.2);
    rockGeos.forEach((geo, gi) => {
      const mine = spotsR.filter((_, i) => i % 4 === gi);
      const inst = new THREE.InstancedMesh(geo, k.rockMat, mine.length);
      mine.forEach((t, i) => {
        const sc = 0.15 + Math.pow(rng(), 2.2) * 0.8;
        dummy.position.set(t.x, terrainHeight(t.x, t.z) - 0.18 * sc, t.z);
        dummy.rotation.set(0, rng() * 6, 0);
        dummy.scale.set(sc * (0.9 + 0.5 * rng()), sc * (0.55 + 0.35 * rng()), sc);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.castShadow = inst.receiveShadow = true;
      this.scene.add(inst);
    });
  }

  private addLanternLight(p: THREE.Vector3, intensity: number, distance: number, hazeStrength: number, glass: THREE.MeshStandardMaterial | null) {
    const light = new THREE.PointLight(0xff9440, intensity, distance, 2);
    light.position.copy(p);
    this.scene.add(light);
    const glow = makeGlowSprite(0xffb066, 1.6, 1.4);
    glow.position.copy(p);
    const haze = makeGlowSprite(0xff8a3a, hazeStrength * 0.2, 9);
    haze.position.copy(p);
    this.scene.add(glow, haze);
    this.lanterns.push({ light, glass: glass ?? new THREE.MeshStandardMaterial(), glow, haze, flicker: new Flicker(0.7, 0.35), base: intensity });
  }

  private addLanternPost(at: THREE.Vector3, rot: number) {
    const g = groundAt(at.x, at.z).y;
    const wood = new THREE.MeshStandardMaterial({ color: 0x1d150e, roughness: 0.9 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.7 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.5, 8), wood);
    post.position.set(at.x, g + 1.25, at.z);
    this.add(post);
    const ax = Math.sin(rot) * 0.45, az = Math.cos(rot) * 0.45;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.55), wood);
    arm.position.set(at.x + ax * 0.5, g + 2.42, at.z + az * 0.5);
    arm.rotation.y = rot;
    this.add(arm);
    const glass = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa555, emissiveIntensity: 6 });
    const lampPos = new THREE.Vector3(at.x + ax, g + 2.12, at.z + az);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.26, 8), glass);
    lamp.position.copy(lampPos);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.14, 8), iron);
    cap.position.copy(lampPos).add(new THREE.Vector3(0, 0.2, 0));
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.3, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0x15171a, wireframe: true }));
    cage.position.copy(lampPos);
    this.scene.add(lamp, cap, cage);
    PLATFORMS.push({ minX: at.x - 0.15, maxX: at.x + 0.15, minZ: at.z - 0.15, maxZ: at.z + 0.15, top: () => g + 2.6 });
    this.addLanternLight(lampPos, 16, 15, 1, glass);
  }

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0x0b1a2c, 0.5));
    this.scene.add(new THREE.HemisphereLight(0x2a4d78, 0x07080a, 0.6));
    const moon = new THREE.DirectionalLight(0x9dbdff, 1.25);
    moon.castShadow = true;
    const s = this.low ? 1024 : 2048;
    moon.shadow.mapSize.set(s, s);
    const cam = moon.shadow.camera;
    cam.left = cam.bottom = -32;
    cam.right = cam.top = 32;
    cam.near = 1;
    cam.far = 160;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.04;
    this.scene.add(moon, moon.target);
    this.moon = moon;
    this.addLanternPost(new THREE.Vector3(CROSSROADS.x + 1.9, 0, CROSSROADS.z + 1.5), -0.6);
  }

  private place(obj: THREE.Object3D, x: number, z: number, rotY: number) {
    obj.position.set(x, groundAt(x, z).y, z);
    obj.rotation.y = rotY;
    this.scene.add(obj);
    this.idles.push({ obj, phase: Math.random() * 10 });
  }

  private buildFigures() {
    this.place(makeZahra(), this.zahraPos.x, this.zahraPos.z, 0.2 + Math.PI);
    this.ammarPos.set(SPRING.x + 2.2, 0, SPRING.z + 1.0);
    this.place(makeAmmar(), this.ammarPos.x, this.ammarPos.z, -0.5);
    this.ammarPos.y = groundAt(this.ammarPos.x, this.ammarPos.z).y;
    // Ammar's shielded oil lamp, set on the basin rim
    const lampAt = new THREE.Vector3(SPRING.x + 1.25, baseHeight(SPRING.x, SPRING.z) + 0.62, SPRING.z + 0.55);
    const lampGlass = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa04a, emissiveIntensity: 6 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 8), lampGlass);
    lamp.position.copy(lampAt);
    this.scene.add(lamp);
    this.addLanternLight(lampAt.clone().add(new THREE.Vector3(0, 0.1, 0)), 2.6, 7, 0.6, lampGlass);
    this.guards = new Gendarmerie(this.scene);
  }

  private buildMoonShafts() {
    const spots: [number, number, number, number][] = [
      [-58, -38, 6, 0.05],
      [48, -46, 7, 0.06],
      [-12, -68, 9, 0.06],
      [64, 26, 5, 0.04],
    ];
    spots.forEach(([x, z, w, inten], i) => {
      const mat = makeShaftMaterial(inten, 0.0, i * 2.7, 0x7fb0e6);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 60), mat);
      mesh.position.set(x, terrainHeight(x, z), z).addScaledVector(MOON_DIR, 28);
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.shafts.push({ mesh, mat, base: inten });
    });
  }

  // ---------------- input ----------------
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.code;
    this.keys.add(k);
    if (k === "KeyE" && this.active) this.interact();
    if (k === "Space") {
      this.jumpQueued = true;
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseMove = (e: MouseEvent) => {
    if (!this.active || this.isTouch) return;
    this.yaw -= e.movementX * 0.0021;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0021, -1.45, 1.45);
  };
  private onLockChange = () => {
    const locked = document.pointerLockElement === this.canvas;
    this.setActive(locked);
  };
  private onTouchStart = (e: TouchEvent) => {
    if (!this.active) return;
    for (const t of Array.from(e.changedTouches)) {
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
  };

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
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
    }
    this.opts.onActiveChange?.(v);
  }

  /** Enter play: pointer-lock on desktop, direct touch control on mobile. */
  enter() {
    if (this.isTouch) {
      this.setActive(true);
      return;
    }
    const req = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    // Headless/unsupported environments: still let the player move with the keyboard
    if (req && typeof req.catch === "function") req.catch(() => this.setActive(true));
  }

  pause() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.setActive(false);
  }

  /** Dev/test helper. */
  teleport(x: number, z: number, yaw?: number, pitch = 0) {
    this.pos.set(x, groundAt(x, z).y, z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = pitch;
  }

  // ---------------- gameplay ----------------
  setMarkerEl(el: HTMLElement | null, dist: HTMLElement | null) {
    this.markerEl = el;
    this.markerDist = dist;
  }

  setCrouchToggle(v: boolean) {
    this.crouchToggle = v;
  }

  private blocked(from: THREE.Vector3, dir: THREE.Vector3, far: number) {
    this.ray.set(from, dir);
    this.ray.far = far;
    return this.ray.intersectObjects(this.occluders, true).length > 0;
  }

  private los = (from: THREE.Vector3, to: THREE.Vector3) => {
    const d = to.clone().sub(from);
    const len = d.length();
    return !this.blocked(from, d.normalize(), len - 0.3);
  };

  private computeStimulus(pl: { hs: number; ground: { surface: Surface }; crouch: boolean; run: boolean }): Stimulus {
    const chest = this.pos.clone().setY(this.pos.y + (pl.crouch ? 0.8 : 1.3));
    const lit = this.lanterns.some((l) => l.light.position.distanceTo(chest) < l.light.distance * 0.45) || this.guards.handLantern.position.distanceTo(chest) < 4.5;
    const shadow = !lit && this.blocked(chest, MOON_DIR, 60);
    this.visState = lit ? "lit" : shadow ? (pl.crouch ? "hidden" : "shadow") : pl.crouch ? "shadow" : "lit";
    let vis = lit ? 1.1 : shadow ? 0.3 : 0.7;
    vis *= pl.crouch ? 0.45 : pl.run ? 1.3 : 1;
    const moving = pl.hs > 0.3;
    const loud = pl.ground.surface === "gravel" || pl.ground.surface === "water";
    const noise = !moving || pl.crouch ? 0 : loud ? (pl.run ? 14 : 6.5) : pl.run ? 6 : 0;
    return { player: chest, visibility: vis, concealed: pl.crouch && shadow, noise, los: this.los };
  }

  private snapshot() {
    this.checkpoint = { x: this.pos.x, z: this.pos.z, yaw: this.yaw, ...this.game };
  }

  private saveCheckpoint(name: string) {
    this.snapshot();
    this.opts.onCheckpoint?.(name);
  }

  private restoreCheckpoint() {
    const c = this.checkpoint;
    const catches = this.game.catches;
    Object.assign(this.game, { ...c, catches: this.game.catches, elapsed: Math.min(c.elapsed, DAWN_ELAPSED - 60), observe: 0 });
    delete (this.game as Record<string, unknown>).x;
    delete (this.game as Record<string, unknown>).z;
    delete (this.game as Record<string, unknown>).yaw;
    this.game.catches = catches;
    this.teleport(c.x, c.z, c.yaw);
    this.guards.reset();
    this.frozen = false;
  }

  private targetFor(stage: Stage): THREE.Vector3 | null {
    switch (stage) {
      case "reach_culvert": return new THREE.Vector3(CULVERT.x, groundAt(CULVERT.x, CULVERT.z).y + 1.2, CULVERT.z);
      case "reach_zahra": return this.zahraPos.clone().setY(this.zahraPos.y + 1.6);
      case "observe": return new THREE.Vector3(ROCK.x, ROCK_TOP + 1, ROCK.z);
      case "deliver": return this.ammarPos.clone().setY(this.ammarPos.y + 1.9);
      default: return null;
    }
  }

  /** E / tap: talk to Zahra or hand the message to Ammar. */
  interact() {
    if (!this.prompt || this.frozen) return;
    const who = this.game.stage === "reach_zahra" ? "zahra" : "ammar";
    this.frozen = true;
    this.opts.onDialogue?.(who);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  resolveZahra(choice: "promise" | "rush") {
    const g = this.game;
    g.hasMessage = true;
    g.promise = choice === "promise";
    if (g.promise) {
      g.trust += 3;
      this.openGate();
    }
    g.stage = g.promise ? "observe" : "deliver";
    this.frozen = false;
    this.saveCheckpoint("zahra");
  }

  finishAmmar() {
    const g = this.game;
    const trust = g.trust + (g.catches === 0 ? 2 : 0);
    g.stage = "ended";
    this.opts.onEnding?.({ holds: g.observed && trust >= 10, trust, catches: g.catches, observed: g.observed, clock: this.clockString() });
  }

  clockString() {
    const m = (START_MIN + Math.floor(this.game.elapsed)) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  private updateGame(dt: number, t: number, pl: { hs: number; ground: { surface: Surface }; crouch: boolean; run: boolean }, sim: boolean) {
    const g = this.game;
    if (this.caughtUntil > 0 && performance.now() >= this.caughtUntil) {
      this.caughtUntil = 0;
      this.restoreCheckpoint();
    }
    if (sim && g.stage !== "ended") {
      g.elapsed += dt / SEC_PER_MIN;
      this.senseTimer -= dt;
      if (this.senseTimer <= 0) {
        this.senseTimer = 0.1;
        this.stim = this.computeStimulus(pl);
      }
      if (this.guards.update(dt, t, this.stim) || g.elapsed >= DAWN_ELAPSED) {
        this.caughtReason = g.elapsed >= DAWN_ELAPSED ? "dawn" : "caught";
        if (this.caughtReason === "caught") g.catches++;
        this.frozen = true;
        this.caughtUntil = performance.now() + 2800;
        this.vel.set(0, 0, 0);
        this.opts.onCaught?.(this.caughtReason);
      }
      // stage logic
      const here = this.pos;
      if (g.stage === "reach_culvert" && Math.hypot(here.x - CULVERT.x, here.z - CULVERT.z) < 6) g.stage = "reach_zahra";
      this.prompt = null;
      if (g.stage === "reach_zahra" && here.distanceTo(this.zahraPos) < 2.8) this.prompt = { ar: "تحدّث إلى زهرة", en: "Talk to Zahra" };
      if (g.hasMessage && here.distanceTo(this.ammarPos) < 2.8) this.prompt = { ar: "سلّم الرسالة لعمّار", en: "Give Ammar the message" };
      if (g.stage === "observe" && !g.observed) {
        const onTop = here.y > ROCK_TOP - 0.7 && Math.hypot(here.x - ROCK.x, here.z - ROCK.z) < 3.6;
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd);
        const to = this.guards.patrolPos().clone().setY(this.guards.patrolPos().y + 1).sub(this.camera.position);
        const watching = to.length() < 75 && fwd.angleTo(to.normalize()) < 0.42;
        if (onTop && pl.crouch && watching) g.observe = Math.min(1, g.observe + dt / 6);
        if (g.observe >= 1) {
          g.observed = true;
          g.trust += 4;
          g.stage = "deliver";
          this.saveCheckpoint("rock");
        }
      }
    } else if (!sim) {
      this.guards.update(0, t, null);
    }

    // objective marker (screen-projected)
    const target = this.targetFor(g.stage);
    if (this.markerEl) {
      if (target && this.active) {
        const v = target.clone().project(this.camera);
        const behind = v.z > 1;
        let x = behind ? -v.x : v.x, y = behind ? -1 : v.y;
        x = THREE.MathUtils.clamp(x, -0.92, 0.92);
        y = THREE.MathUtils.clamp(y, -0.85, 0.85);
        this.markerEl.style.opacity = "1";
        this.markerEl.style.transform = `translate(${((x + 1) / 2) * window.innerWidth}px, ${((1 - y) / 2) * window.innerHeight}px)`;
        if (this.markerDist) this.markerDist.textContent = `${Math.round(target.distanceTo(this.pos))} m`;
      } else this.markerEl.style.opacity = "0";
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      const [objAr, objEn] = OBJECTIVES[g.stage];
      const sub = g.stage === "observe" ? { subAr: "أو سلّم الرسالة الآن دون تحقّق — ممر زهرة مفتوح في الجدار الغربي", subEn: "or deliver now, unverified — Zahra's passage is open in the west wall" } : {};
      this.opts.onHud?.({
        clock: this.clockString(), stage: g.stage, objAr, objEn, ...sub,
        suspicion: this.guards.maxSuspicion(), visibility: this.visState, prompt: this.prompt,
        observe: g.observe, hasMessage: g.hasMessage,
      });
    }
  }

  // ---------------- simulation ----------------
  private blockedAt(x: number, z: number) {
    if (x < MAP.minX || x > MAP.maxX || z < MAP.minZ || z > MAP.maxZ) return true;
    const limit = this.pos.y + (this.onGround ? 0.55 : 0.35);
    for (const [ox, oz] of [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
      if (groundAt(x + ox, z + oz).y > limit) return true;
    }
    return false;
  }

  private updatePlayer(dt: number) {
    const k = this.keys;
    let f = 0, s = 0;
    if (this.active) {
      if (k.has("KeyW") || k.has("ArrowUp")) f += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) f -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) s += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) s -= 1;
      f -= this.touchMove.y;
      s += this.touchMove.x;
    }
    const crouch = this.active && (this.crouchToggle || k.has("KeyC") || k.has("ControlLeft") || k.has("ControlRight"));
    const run = this.active && (k.has("ShiftLeft") || k.has("ShiftRight")) && !crouch;
    this.crouchAmt += ((crouch ? 1 : 0) - this.crouchAmt) * (1 - Math.exp(-dt * 9));
    const speed = crouch ? 1.35 : run ? 5.4 : 2.7;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    this.vel.lerp(wish, 1 - Math.exp(-dt * (this.onGround ? 10 : 2)));

    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    if (!this.blockedAt(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    else this.vel.x = 0;
    if (!this.blockedAt(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    else this.vel.z = 0;

    const ground = groundAt(this.pos.x, this.pos.z);
    if (this.jumpQueued && this.onGround && this.active) this.velY = 4.4;
    this.jumpQueued = false;
    this.velY -= 14 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= ground.y || (this.velY <= 0 && this.pos.y - ground.y < 0.3 && this.onGround)) {
      if (!this.onGround && this.velY < -3) this.opts.onStep?.(ground.surface, 1.2);
      this.pos.y = ground.y;
      this.velY = 0;
      this.onGround = true;
    } else this.onGround = false;

    // head bob + footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.2) {
      this.stepPhase += dt * hs * (run ? 1.9 : 2.3);
      const step = Math.floor(this.stepPhase / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.opts.onStep?.(ground.surface, crouch ? 0.35 : run ? 1.3 : 0.8);
      }
    }
    return { hs, ground, crouch, run };
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const sim = this.active && !this.frozen;
    const pl = sim ? this.updatePlayer(dt) : { hs: 0, ground: groundAt(this.pos.x, this.pos.z), crouch: false, run: false };
    const hs = pl.hs;
    this.updateGame(dt, t, pl, sim);
    this.green.UT.value = t;
    this.grassTimer -= dt;
    if (this.grassTimer <= 0) {
      this.grassTimer = 0.25;
      this.updateGrass(2);
    }

    const bobAmp = Math.min(hs / 5, 1) * (1 - this.crouchAmt * 0.5);
    const eye = THREE.MathUtils.lerp(EYE_STAND, EYE_CROUCH, this.crouchAmt);
    const breathe = Math.sin(t * 1.1) * 0.012;
    this.camera.position.set(
      this.pos.x + Math.cos(this.stepPhase) * 0.03 * bobAmp,
      this.pos.y + eye + Math.abs(Math.sin(this.stepPhase)) * 0.06 * bobAmp + breathe,
      this.pos.z,
    );
    this.camera.rotation.set(this.pitch + Math.sin(t * 0.7) * 0.003, this.yaw + Math.sin(t * 0.43) * 0.003, Math.cos(this.stepPhase) * 0.006 * bobAmp, "YXZ");

    // moon shadow frustum follows the player
    this.moon.position.copy(this.pos).addScaledVector(MOON_DIR, 80);
    this.moon.target.position.copy(this.pos);
    this.skyGroup.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.skyMat.uniforms.uTime.value = t;

    // lanterns
    for (const l of this.lanterns) {
      const v = l.flicker.update(t, dt);
      l.light.intensity = l.base * v;
      l.glass.emissiveIntensity = 6 * v;
      l.glow.material.opacity = v;
      l.haze.material.opacity = 0.7 + 0.3 * v;
    }
    for (const e of this.embers) e.emissiveIntensity = 3 + 4 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.9), 6);

    // moon shafts: cylindrical billboards around the moon axis
    const toCam = new THREE.Vector3(), right = new THREE.Vector3(), normal = new THREE.Vector3(), m = new THREE.Matrix4();
    for (const s of this.shafts) {
      toCam.copy(this.camera.position).sub(s.mesh.position);
      const along = toCam.dot(MOON_DIR);
      const dist = Math.sqrt(Math.max(0, toCam.lengthSq() - along * along)); // distance to the beam axis
      normal.copy(toCam).addScaledVector(MOON_DIR, -toCam.dot(MOON_DIR)).normalize();
      right.crossVectors(MOON_DIR, normal).normalize();
      m.makeBasis(right, MOON_DIR, normal).setPosition(s.mesh.position);
      s.mesh.matrix.copy(m);
      s.mat.uniforms.uTime.value = t;
      s.mat.uniforms.uIntensity.value = s.base * smoothstep(30, 55, dist) * (1 + 0.1 * Math.sin(t * 0.3 + s.base * 50));
    }

    for (const i of this.idles) {
      i.obj.scale.y = 1 + Math.sin(t * 1.3 + i.phase) * 0.006;
      i.obj.rotation.z = Math.sin(t * 0.5 + i.phase) * 0.012;
    }

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

    this.fx.render(dt, t);
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
    delete (window as unknown as { __night?: NightLevel }).__night;
    PLATFORMS.length = BASE_PLATFORM_COUNT;
  }
}
