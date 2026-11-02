// Shared cinematic lighting system: noise textures, volumetric shaft shader,
// glow sprites, drifting particle field and the bloom + grade post stack.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Multi-octave value noise baked to a tiling canvas texture. */
export function noiseTexture(size: number, rng: () => number, map: (v: number) => number, octaves = 5): THREE.CanvasTexture {
  const grids: Float32Array[] = [];
  for (let o = 0; o < octaves; o++) {
    const g = 4 << o;
    const arr = new Float32Array(g * g);
    for (let i = 0; i < arr.length; i++) arr[i] = rng();
    grids.push(arr);
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, total = 0;
      for (let o = 0; o < octaves; o++) {
        const g = 4 << o;
        const fx = (x / size) * g, fy = (y / size) * g;
        const x0 = Math.floor(fx) % g, y0 = Math.floor(fy) % g;
        const x1 = (x0 + 1) % g, y1 = (y0 + 1) % g;
        const sx = fx - Math.floor(fx), sy = fy - Math.floor(fy);
        const ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
        const a = grids[o][y0 * g + x0], b = grids[o][y0 * g + x1];
        const c = grids[o][y1 * g + x0], d = grids[o][y1 * g + x1];
        v += amp * ((a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy);
        total += amp;
        amp *= 0.5;
      }
      const c = Math.max(0, Math.min(255, map(v / total) * 255));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export const NOISE_GLSL = /* glsl */ `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
`;

export const BASIC_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

const SHAFT_FRAG = /* glsl */ `
uniform float uTime; uniform float uIntensity; uniform vec3 uColor; uniform float uSoft; uniform float uSeed;
varying vec2 vUv;
${NOISE_GLSL}
void main(){
  float x = abs(vUv.x - 0.5) * 2.0;
  float side = 1.0 - smoothstep(uSoft, 1.0, x);
  side *= side;
  float vert = smoothstep(0.0, 0.18, vUv.y) * (0.55 + 0.45 * vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
  vec2 q = vec2(vUv.x * 2.5 + uSeed, vUv.y * 1.6 - uTime * 0.035);
  float n = fbm(q * 2.0 + fbm(q + uTime * 0.02));
  float streak = 0.75 + 0.25 * sin(vUv.x * 40.0 + uSeed * 7.0 + n * 3.0);
  float a = side * vert * (0.45 + 0.75 * n) * streak * uIntensity;
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

/** Additive volumetric slab — stack or billboard several to fake a light shaft. */
export function makeShaftMaterial(intensity: number, soft: number, seed: number, color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uColor: { value: new THREE.Color(color) },
      uSoft: { value: soft },
      uSeed: { value: seed },
    },
    vertexShader: BASIC_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

let glowTex: THREE.CanvasTexture | null = null;
function radialTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.45)");
  g.addColorStop(0.5, "rgba(255,255,255,0.1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Soft additive halo billboard (lantern glass, moon corona…). */
export function makeGlowSprite(color: THREE.ColorRepresentation, strength: number, size: number, fog = true) {
  const mat = new THREE.SpriteMaterial({
    map: radialTexture(),
    color: new THREE.Color(color).multiplyScalar(strength),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

const FIELD_VERT = /* glsl */ `
attribute float aSize; attribute float aSeed; attribute vec3 aColor;
uniform float uTime; uniform float uPixelRatio; uniform vec3 uCenter; uniform vec3 uBox; uniform vec3 uWind;
varying vec3 vColor; varying float vAlpha;
void main(){
  float t = uTime;
  vec3 p = position + uWind * t * (0.5 + aSeed);
  p += vec3(sin(t*0.31 + aSeed*20.0), sin(t*0.23 + aSeed*13.0)*0.6, cos(t*0.27 + aSeed*7.0)) * 0.6;
  vec3 origin = uCenter - uBox * 0.5;
  vec3 w = origin + mod(p - origin, uBox);
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  float edge = length((w - uCenter).xz) / (uBox.x * 0.5);
  float twinkle = 0.55 + 0.45 * sin(t * (0.8 + aSeed * 2.5) + aSeed * 60.0);
  vAlpha = twinkle * (1.0 - smoothstep(0.6, 1.0, edge)) * smoothstep(0.6, 3.0, -mv.z);
  vColor = aColor;
  gl_PointSize = min(aSize * uPixelRatio * (20.0 / -mv.z), 4.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}
`;

const FIELD_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = pow(smoothstep(0.5, 0.0, d), 1.6);
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;

/** Particles that wrap inside a box around the camera so they're always present. */
export function makeParticleField(count: number, box: THREE.Vector3, palette: { color: THREE.ColorRepresentation; weight: number; gain: number }[], pixelRatio: number, seed = 1234) {
  const rng = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seeds = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const total = palette.reduce((a, p) => a + p.weight, 0);
  const cols = palette.map((p) => new THREE.Color(p.color));
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng() * box.x;
    pos[i * 3 + 1] = rng() * box.y;
    pos[i * 3 + 2] = rng() * box.z;
    size[i] = 0.5 + Math.pow(rng(), 4) * 1.8;
    seeds[i] = rng();
    let r = rng() * total, k = 0;
    while (k < palette.length - 1 && r > palette[k].weight) r -= palette[k++].weight;
    col[i * 3] = cols[k].r * palette[k].gain;
    col[i * 3 + 1] = cols[k].g * palette[k].gain;
    col[i * 3 + 2] = cols[k].b * palette[k].gain;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: box.clone() },
      uWind: { value: new THREE.Vector3(0.25, -0.04, 0.05) },
    },
    vertexShader: FIELD_VERT,
    fragmentShader: FIELD_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uVignette: { value: 0.08 },
  },
  vertexShader: BASIC_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; uniform float uVignette;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float ca = length(d) * 0.0025;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + d * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - d * ca).b;
      d.x *= uAspect * 0.85;
      float vig = smoothstep(0.95, 0.15, length(d));
      col *= mix(uVignette, 1.0, vig);
      col = mix(col, col * vec3(0.82, 0.98, 1.12), 0.6);
      col += (rnd(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5) * 0.018;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export interface PostFX {
  composer: EffectComposer;
  setSize: (w: number, h: number) => void;
  render: (dt: number, t: number) => void;
  dispose: () => void;
}

/** Bloom → teal grade/vignette/grain → tone-mapped output. */
export function createPostFX(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opts: { low: boolean; bloom?: [number, number, number]; vignette?: number },
): PostFX {
  const w = window.innerWidth, h = window.innerHeight;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const s = opts.low ? 0.5 : 1;
  const [strength, radius, threshold] = opts.bloom ?? [0.7, 0.8, 0.18];
  const bloom = new UnrealBloomPass(new THREE.Vector2(w * s, h * s), strength, radius, threshold);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE_SHADER);
  grade.uniforms.uAspect.value = w / h;
  if (opts.vignette !== undefined) grade.uniforms.uVignette.value = opts.vignette;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer,
    setSize: (W, H) => {
      composer.setSize(W, H);
      grade.uniforms.uAspect.value = W / H;
    },
    render: (dt, t) => {
      grade.uniforms.uTime.value = t;
      composer.render(dt);
    },
    dispose: () => composer.dispose(),
  };
}

/** Irregular flame/filament flicker: steady breathing with occasional drops. */
export class Flicker {
  private drop = 0;
  private rate: number;
  private depth: number;
  constructor(rate = 0.9, depth = 0.4) {
    this.rate = rate;
    this.depth = depth;
  }
  update(t: number, dt: number) {
    if (this.drop > 0) this.drop -= dt;
    else if (Math.random() < dt * this.rate) this.drop = 0.04 + Math.random() * 0.12;
    const breathe = 0.9 + 0.06 * Math.sin(t * 9.3) * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 23.0);
    return this.drop > 0 ? 1 - this.depth + Math.random() * this.depth * 0.5 : breathe;
  }
}
