// Destruction FX: instanced billboard particles (dust / smoke / fire), rubble chips, blast light,
// missile with smoke trail, and Web Audio synthesis (explosion with distance delay, rumble, whistle).
import * as THREE from 'three';

const PVS = /* glsl */`
attribute vec3 iPos; attribute vec4 iData; attribute vec3 iCol; // iData: size, alpha, rotation, seed
varying vec2 vUv; varying float vA; varying vec3 vC; varying float vS;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.);
  float c = cos(iData.z), s = sin(iData.z);
  mv.xy += mat2(c, -s, s, c) * position.xy * iData.x;
  gl_Position = projectionMatrix * mv; vUv = uv; vA = iData.y; vC = iCol; vS = iData.w;
}`;
const DUST_FS = /* glsl */`
uniform vec3 uLight; varying vec2 vUv; varying float vA; varying vec3 vC; varying float vS;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
void main(){
  vec2 c = vUv * 2. - 1.; float r = dot(c, c); if (r > 1.) discard;
  float n = n2(vUv * 4. + vS * 17.) * .6 + n2(vUv * 9. - vS * 5.) * .4;
  float a = (1. - r) * (1. - r) * smoothstep(.15, .75, n + (1. - r) * .35) * vA;
  float shade = .75 + .35 * (1. - vUv.y);
  gl_FragColor = vec4(vC * uLight * shade, a);
}`;
const FIRE_FS = /* glsl */`
varying vec2 vUv; varying float vA; varying vec3 vC; varying float vS;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
void main(){
  vec2 c = vUv * 2. - 1.; float r = dot(c, c); if (r > 1.) discard;
  float n = n2(vUv * 5. + vS * 11.);
  float a = pow(1. - r, 1.5) * (0.6 + 0.6 * n) * vA;
  gl_FragColor = vec4(vC * a, a);
}`;

class ParticlePool {
  constructor(max, fragmentShader, blending) {
    this.max = max; this.n = 0; this.head = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 3); this.data = new Float32Array(max * 4); this.col = new Float32Array(max * 3);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iData', new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = max;
    this.uniforms = { uLight: { value: new THREE.Color(1, 1, 1) } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: PVS, fragmentShader, uniforms: this.uniforms, transparent: true, depthWrite: false, blending,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.userData.noAO = true;
    // simulation state
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max); this.buoy = new Float32Array(max); this.spin = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
  }
  emit(p, v, life, s0, s1, a0, drag, buoy, c0, c1 = c0) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.drag[i] = drag; this.buoy[i] = buoy; this.spin[i] = (Math.random() - 0.5) * 0.8;
    this.data[i * 4 + 2] = Math.random() * 6.28; this.data[i * 4 + 3] = Math.random();
    this.c0.set(c0, i * 3); this.c1.set(c1, i * 3);
  }
  update(dt) {
    const { pos, vel, data, col } = this;
    for (let i = 0; i < this.max; i++) {
      const ml = this.maxLife[i]; if (ml <= 0) continue;
      const l = (this.life[i] += dt), t = l / ml;
      if (t >= 1) { this.maxLife[i] = 0; data[i * 4 + 1] = 0; data[i * 4] = 0; continue; }
      const k = Math.exp(-this.drag[i] * dt), j = i * 3;
      vel[j] *= k; vel[j + 1] = vel[j + 1] * k + this.buoy[i] * dt; vel[j + 2] *= k;
      pos[j] += vel[j] * dt; pos[j + 1] = Math.max(0.3, pos[j + 1] + vel[j + 1] * dt); pos[j + 2] += vel[j + 2] * dt;
      data[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t));
      data[i * 4 + 1] = this.a0[i] * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      data[i * 4 + 2] += this.spin[i] * dt;
      for (let c = 0; c < 3; c++) col[j + c] = this.c0[j + c] + (this.c1[j + c] - this.c0[j + c]) * t;
    }
    const g = this.mesh.geometry;
    g.attributes.iPos.needsUpdate = true; g.attributes.iData.needsUpdate = true; g.attributes.iCol.needsUpdate = true;
  }
}

class Chips {
  constructor(max = 2500) {
    this.max = max; this.head = 0;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true });
    this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), mat, max);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.s = new Float32Array(max);
    this.life = new Float32Array(max); this.rot = new Float32Array(max * 4); this.ax = new Float32Array(max * 3); this.ang = new Float32Array(max); this.av = new Float32Array(max);
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, m); this.mesh.setColorAt(i, new THREE.Color(0.6, 0.58, 0.55)); }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._ax = new THREE.Vector3(); this._pp = new THREE.Vector3(); this._ss = new THREE.Vector3();
    this.active = 0;
  }
  emit(p, v, size, color) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.p.set([p.x, p.y, p.z], i * 3); this.v.set([v.x, v.y, v.z], i * 3); this.s[i] = size; this.life[i] = 14 + Math.random() * 8;
    const a = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.ax.set([a.x, a.y, a.z], i * 3); this.ang[i] = Math.random() * 6; this.av[i] = (Math.random() - 0.5) * 18;
    this.mesh.setColorAt(i, color); this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt, g) {
    let act = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      act++; this.life[i] -= dt;
      const j = i * 3, P = this.p, V = this.v, s = this.s[i];
      V[j + 1] -= g * dt; P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      if (P[j + 1] < s * 0.4) { P[j + 1] = s * 0.4; if (V[j + 1] < 0) V[j + 1] *= -0.3; V[j] *= 0.7; V[j + 2] *= 0.7; this.av[i] *= 0.7; }
      this.ang[i] += this.av[i] * dt;
      const fade = Math.min(1, this.life[i] / 2);
      this._q.setFromAxisAngle(this._ax.set(this.ax[j], this.ax[j + 1], this.ax[j + 2]), this.ang[i]);
      this._m.compose(this._pp.set(P[j], P[j + 1], P[j + 2]), this._q, this._ss.setScalar(s * fade));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.active = act;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class AudioFX {
  constructor() { this.ctx = null; this.enabled = true; }
  _ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this._noise = this._mkNoise(); } catch { this.enabled = false; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.enabled && this.ctx;
  }
  _mkNoise() {
    const n = this.ctx.sampleRate * 3, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < n; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; }
    return b;
  }
  explosion(distance = 100, size = 1) {
    if (!this._ensure()) return;
    const c = this.ctx, t0 = c.currentTime + Math.min(distance / 343, 2.5), vol = Math.min(1, 60 / (distance + 30)) * size;
    const src = c.createBufferSource(); src.buffer = this._noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400 / (1 + distance / 300), t0); f.frequency.exponentialRampToValueAtTime(90, t0 + 2.2);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    src.connect(f).connect(g).connect(c.destination); src.start(t0); src.stop(t0 + 3);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(62, t0); o.frequency.exponentialRampToValueAtTime(28, t0 + 1.2);
    og.gain.setValueAtTime(vol * 0.9, t0); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
    o.connect(og).connect(c.destination); o.start(t0); o.stop(t0 + 1.6);
  }
  rumble(distance = 100, dur = 4) {
    if (!this._ensure()) return;
    const c = this.ctx, t0 = c.currentTime + Math.min(distance / 343, 2.5), vol = Math.min(0.5, 30 / (distance + 40));
    const src = c.createBufferSource(); src.buffer = this._noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t0); src.stop(t0 + dur + 0.1);
  }
  whistle(dur) {
    if (!this._ensure()) return;
    const c = this.ctx, t0 = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1900, t0); o.frequency.exponentialRampToValueAtTime(520, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.06, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur);
  }
}

export class Effects {
  constructor(scene, lighting) {
    this.lighting = lighting;
    this.dust = new ParticlePool(5000, DUST_FS, THREE.NormalBlending);
    this.fire = new ParticlePool(900, FIRE_FS, THREE.AdditiveBlending);
    this.chips = new Chips(2500);
    this.flash = new THREE.PointLight(0xffa860, 0, 260, 1.6); // permanent (intensity 0) so shaders never recompile
    this.flashT = 0;
    this.group = new THREE.Group();
    this.group.add(this.dust.mesh, this.fire.mesh, this.chips.mesh, this.flash);
    scene.add(this.group);
    this.missiles = [];
    this.audio = new AudioFX();
    const body = new THREE.CylinderGeometry(0.25, 0.25, 3, 8).rotateX(Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.25, 0.8, 8).rotateX(Math.PI / 2).translate(0, 0, 1.9);
    this.missileGeo = [body, nose];
    this.missileMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35 });
    this.flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.8) });
    this._v = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  explosion(p, scale = 1) {
    const V = this._v, P = this._p;
    this.flash.position.copy(p).y += 4; this.flash.intensity = 4e4 * scale; this.flashT = 0.5;
    for (let i = 0; i < 70 * scale; i++) {
      V.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 22 * scale);
      this.fire.emit(P.copy(p).addScaledVector(V, 0.05), V, 0.5 + Math.random() * 0.7, 2 + Math.random() * 3, 7 + Math.random() * 9 * scale, 1, 3.5, 3, [5, 3.2, 1.2], [1.2, 0.25, 0.05]);
    }
    for (let i = 0; i < 160 * scale; i++) {
      const a = Math.random() * 6.28, sp = 4 + Math.random() * 18 * scale;
      V.set(Math.cos(a) * sp, Math.random() * 10 * scale, Math.sin(a) * sp);
      this.dust.emit(P.copy(p).addScaledVector(V, 0.05), V, 6 + Math.random() * 8, 3 + Math.random() * 4, 14 + Math.random() * 16 * scale, 0.75, 1.1, 0.8, [0.42, 0.4, 0.37], [0.6, 0.57, 0.52]);
    }
    for (let i = 0; i < 60 * scale; i++) { // ground ring
      const a = (i / (60 * scale)) * 6.28;
      V.set(Math.cos(a) * 26, 0.5, Math.sin(a) * 26);
      this.dust.emit(P.set(p.x, Math.max(1, p.y * 0.1), p.z), V, 5, 3, 12, 0.6, 1.6, 0.3, [0.5, 0.47, 0.43]);
    }
  }
  debrisDust(p, amount = 1) {
    const V = this._v;
    for (let i = 0; i < 6 * amount; i++) {
      V.set((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6);
      this.dust.emit(this._p.copy(p), V, 5 + Math.random() * 6, 2 + Math.random() * 2, 8 + Math.random() * 10, 0.55, 0.9, 0.6, [0.55, 0.52, 0.48], [0.62, 0.6, 0.56]);
    }
  }
  collapseCloud(box) { // big rolling cloud for a building collapse
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), V = this._v;
    const n = Math.min(900, 120 + s.x * s.z * 0.25);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, rr = Math.max(s.x, s.z) * (0.3 + Math.random() * 0.5);
      this._p.set(c.x + Math.cos(a) * rr, 1 + Math.random() * Math.min(10, s.y * 0.15), c.z + Math.sin(a) * rr);
      V.set(Math.cos(a) * (4 + Math.random() * 10), Math.random() * 3, Math.sin(a) * (4 + Math.random() * 10));
      this.dust.emit(this._p, V, 10 + Math.random() * 10, 6 + Math.random() * 6, 22 + Math.random() * 20, 0.6, 0.5, 0.35, [0.5, 0.47, 0.42], [0.66, 0.63, 0.58]);
    }
  }
  chipsBurst(p, n, size, color, speed = 12) {
    const V = this._v;
    for (let i = 0; i < n; i++) {
      V.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.chips.emit(this._p.set(p.x + (Math.random() - 0.5) * 2, p.y + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2), V, size * (0.3 + Math.random()), color);
    }
  }

  launchMissile(from, to, onHit) {
    const g = new THREE.Group();
    this.missileGeo.forEach((geo) => g.add(new THREE.Mesh(geo, this.missileMat)));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 8).rotateX(-Math.PI / 2).translate(0, 0, -2.6), this.flameMat); g.add(flame);
    g.position.copy(from); g.lookAt(to);
    this.group.add(g);
    const dur = Math.max(0.6, from.distanceTo(to) / 260);
    this.missiles.push({ g, from: from.clone(), to: to.clone(), t: 0, dur, onHit });
    this.audio.whistle(dur);
  }

  update(dt, gravity) {
    const n = this.lighting.uniforms.uNight.value, sunI = this.lighting.sun.intensity;
    this.dust.uniforms.uLight.value.setRGB(0.25 + sunI * 0.17, 0.25 + sunI * 0.16, 0.27 + sunI * 0.15).multiplyScalar(1 - n * 0.75);
    this.dust.update(dt); this.fire.update(dt); this.chips.update(dt, gravity);
    if (this.flashT > 0) { this.flashT -= dt; this.flash.intensity *= Math.exp(-dt * 9); if (this.flashT <= 0) this.flash.intensity = 0; }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]; m.t += dt;
      const u = Math.min(1, m.t / m.dur), e = Math.pow(u, 1.35);
      const prev = m.g.position.clone();
      m.g.position.lerpVectors(m.from, m.to, e);
      this.dust.emit(prev, this._v.set((Math.random() - 0.5), (Math.random() - 0.5) + 0.5, (Math.random() - 0.5)), 2.5 + Math.random() * 2, 0.8, 4, 0.5, 0.8, 0.4, [0.75, 0.75, 0.75], [0.6, 0.6, 0.6]);
      this.fire.emit(prev, this._v.set(0, 0, 0), 0.12, 1.2, 0.4, 1, 0, 0, [5, 2.6, 0.8], [2, 0.5, 0.1]);
      if (u >= 1) { this.group.remove(m.g); this.missiles.splice(i, 1); m.onHit(m.to); }
    }
  }
}
