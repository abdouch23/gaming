// Temporal anti-aliasing (Unreal-style TAA): sub-pixel Halton jitter, depth-based reprojection
// (camera motion), 5-tap Catmull-Rom history, YCoCg variance clipping, tonemapped blending, and a
// contrast-limited sharpen. Also resolves stochastic effects (LOD dither, fog jitter, alpha-tested leaves).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}';
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const JITTER = Array.from({ length: 16 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

const RESOLVE = /* glsl */`
uniform sampler2D tDiffuse, tHistory, tDepth;
uniform mat4 uInvProj, uCamWorld, uPrevVP;
uniform vec2 uRes; uniform float uValid, uAlpha;
varying vec2 v;
vec3 toYC(vec3 c) { return vec3(dot(c, vec3(.25, .5, .25)), dot(c, vec3(.5, 0., -.5)), dot(c, vec3(-.25, .5, -.25))); }
vec3 fromYC(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
vec3 tm(vec3 c) { return c / (1. + max(c.r, max(c.g, c.b))); }          // reversible tonemap (Karis)
vec3 itm(vec3 c) { return c / max(1. - max(c.r, max(c.g, c.b)), 1e-4); }
vec3 histCR(vec2 uv) { // 5-tap Catmull-Rom: sharp history without ringing
  vec2 sp = uv * uRes, tp = floor(sp - .5) + .5, f = sp - tp;
  vec2 w0 = f * (-.5 + f * (1. - .5 * f)), w1 = 1. + f * f * (-2.5 + 1.5 * f), w2 = f * (.5 + f * (2. - 1.5 * f)), w3 = f * f * (-.5 + .5 * f);
  vec2 w12 = w1 + w2, o12 = w2 / w12;
  vec2 t0 = (tp - 1.) / uRes, t3 = (tp + 2.) / uRes, t12 = (tp + o12) / uRes;
  vec3 r = texture2D(tHistory, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y)
         + texture2D(tHistory, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
         + texture2D(tHistory, t12).rgb * (w12.x * w12.y)
         + texture2D(tHistory, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
         + texture2D(tHistory, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
  return r / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
}
vec3 clipBox(vec3 q, vec3 mn, vec3 mx) {
  vec3 c = .5 * (mx + mn), e = .5 * (mx - mn) + 1e-4, d = q - c, a = abs(d / e);
  float m = max(a.x, max(a.y, a.z));
  return m > 1. ? c + d / m : q;
}
void main() {
  vec2 px = 1. / uRes;
  vec3 cur = texture2D(tDiffuse, v).rgb;
  if (uValid < .5) { gl_FragColor = vec4(cur, 1.); return; }
  vec3 m1 = vec3(0.), m2 = vec3(0.); float dMin = 1.; vec2 oMin = vec2(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec3 s = toYC(tm(texture2D(tDiffuse, v + o * px).rgb)); m1 += s; m2 += s * s;
    float d = texture2D(tDepth, v + o * px).r; if (d < dMin) { dMin = d; oMin = o; }
  }
  vec3 mu = m1 / 9., sig = sqrt(max(m2 / 9. - mu * mu, 0.));
  // reproject the closest-depth neighbour (keeps silhouettes stable)
  vec2 uvD = v + oMin * px;
  vec4 vp = uInvProj * vec4(uvD * 2. - 1., dMin * 2. - 1., 1.); vp /= vp.w;
  vec4 pc = uPrevVP * (uCamWorld * vec4(vp.xyz, 1.));
  vec2 vel = (pc.xy / pc.w * .5 + .5) - uvD, prevUV = v + vel;
  if (pc.w <= 0. || any(lessThan(prevUV, vec2(0.))) || any(greaterThan(prevUV, vec2(1.)))) { gl_FragColor = vec4(cur, 1.); return; }
  vec3 h = toYC(tm(max(histCR(prevUV), 0.)));
  h = clipBox(h, mu - sig * 1.15, mu + sig * 1.15);
  float a = mix(uAlpha, .35, clamp(length(vel * uRes) / 14., 0., 1.));
  gl_FragColor = vec4(itm(fromYC(mix(h, toYC(tm(cur)), a))), 1.);
}`;

const SHARPEN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uRes; uniform float uSharp; varying vec2 v;
void main() {
  vec2 px = 1. / uRes;
  vec3 c = texture2D(tSrc, v).rgb, n = texture2D(tSrc, v + vec2(0., px.y)).rgb, s = texture2D(tSrc, v - vec2(0., px.y)).rgb;
  vec3 e = texture2D(tSrc, v + vec2(px.x, 0.)).rgb, w = texture2D(tSrc, v - vec2(px.x, 0.)).rgb;
  vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
  gl_FragColor = vec4(clamp(c + (c - (n + s + e + w) * .25) * uSharp, mn, mx), 1.); // no halos beyond local range
}`;

export class TAAPass extends Pass {
  constructor(camera, depthTexture) {
    super();
    this.camera = camera; this.frame = 0; this.cur = 0; this.valid = false;
    this.unjit = new THREE.Matrix4(); this.prevVP = new THREE.Matrix4(); this.prevPos = new THREE.Vector3(1e9, 0, 0);
    this.hist = [null, null]; this.size = new THREE.Vector2();
    this.u = {
      tDiffuse: { value: null }, tHistory: { value: null }, tDepth: { value: depthTexture },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2(1, 1) }, uValid: { value: 0 }, uAlpha: { value: 0.1 },
    };
    this.su = { tSrc: { value: null }, uRes: this.u.uRes, uSharp: { value: 0.35 } };
    this.resolve = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: RESOLVE, depthTest: false, depthWrite: false }));
    this.sharpen = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.su, vertexShader: VS, fragmentShader: SHARPEN, depthTest: false, depthWrite: false }));
  }

  reset() { this.valid = false; }

  /** jitter the projection matrix by a sub-pixel Halton offset (w, h = drawing-buffer size) */
  begin(w, h) {
    const cam = this.camera, P = cam.projectionMatrix, j = JITTER[this.frame % JITTER.length];
    this.unjit.copy(P);
    P.elements[8] += (2 * j[0]) / w; P.elements[9] += (2 * j[1]) / h;
    cam.projectionMatrixInverse.copy(P).invert();
  }
  end() {
    this.camera.projectionMatrix.copy(this.unjit);
    this.camera.projectionMatrixInverse.copy(this.unjit).invert();
  }

  setSize(w, h) {
    if (this.size.x === w && this.size.y === h) return;
    this.size.set(w, h); this.u.uRes.value.set(w, h);
    this.hist.forEach((r) => r && r.dispose());
    this.hist = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
    this.valid = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera, u = this.u;
    if (!this.hist[0]) this.setSize(readBuffer.width, readBuffer.height);
    if (cam.position.distanceTo(this.prevPos) > 20) this.valid = false; // teleport / city rebuild
    u.tDiffuse.value = readBuffer.texture; u.tHistory.value = this.hist[this.cur].texture;
    u.uInvProj.value.copy(cam.projectionMatrixInverse); u.uCamWorld.value.copy(cam.matrixWorld);
    u.uPrevVP.value.copy(this.prevVP); u.uValid.value = this.valid ? 1 : 0;
    const next = 1 - this.cur;
    renderer.setRenderTarget(this.hist[next]); this.resolve.render(renderer);
    this.su.tSrc.value = this.hist[next].texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.sharpen.render(renderer);
    this.cur = next; this.valid = true; this.frame++;
    this.prevVP.multiplyMatrices(this.unjit, cam.matrixWorldInverse); this.prevPos.copy(cam.position);
  }

  dispose() { this.hist.forEach((r) => r && r.dispose()); this.resolve.dispose(); this.sharpen.dispose(); }
}
