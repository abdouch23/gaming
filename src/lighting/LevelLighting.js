/**
 * LevelLighting — ported from "LevelLighting – reusable lighting kit" (three r160) and extended for a city:
 *  - procedural sky dome + PMREM sky IBL, sun with camera-following, texel-snapped shadow frustum
 *  - day/night cycle (sun/moon, sky gradient, stars, fog, night factor uniform for emissive windows & lamps)
 *  - live GI probe (throttled), geometry-derived contact AO (half-float top-down height map)
 *  - SSAO, screen-space colour bleed, bloom, SMAA, colour grade
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VS = 'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

// contact AO: samples the level's top-down height map around the shaded point (from the lighting kit)
export const SAO_GLSL = `uniform sampler2D uH;uniform vec4 uBox;uniform float uMinY,uYs,uR,uStr;
vec3 saoC(vec3 p,vec3 n){float R=uR;vec2 c=p.xz+n.xz*R;float occ=0.,ws=0.;
for(int i=0;i<16;i++){float f=float(i)+.5;float a=f*2.39996;float r=sqrt(f/16.)*R*.9;vec2 q=c+vec2(cos(a),sin(a))*r;
vec2 uv=vec2((q.x-uBox.x)/uBox.z,(uBox.y-q.y)/uBox.w);float H=texture2D(uH,uv).r*uYs+uMinY;float w=1.-r/R;
occ+=clamp((H-p.y-.2)/(R*.8),0.,1.)*w;ws+=w;}
occ/=ws;float gr=(1.-smoothstep(0.,R*.7,p.y-uMinY))*(1.-abs(n.y));
float ao=1.-uStr*clamp(occ*1.15+gr*.6,0.,1.)*.75;
return mix(vec3(.5,.36,.27),vec3(1.),smoothstep(.2,1.,ao));}`;

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class LevelLighting {
  constructor(renderer, scene, camera, opts = {}) {
    const o = this.opts = { shadowMap: 4096, probeSize: 128, probeDistance: 30, probeInterval: 1.2, aoMapSize: 2048, ...opts };
    const R = this.R = renderer, cam = this.cam = camera;
    this.scene = scene;
    this.params = {
      exposure: 0.68, bloom: 0.22, saturation: 1.1, bounce: 0.35, contactAO: 0.7, ssao: true, probe: true,
      time: 15.5, sunAzOffset: 0, shadowRadius: 220,
    };
    this.uniforms = { uNight: { value: 0 } }; // shared with city materials
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace;

    this.level = new THREE.Group(); this.level.name = 'level'; scene.add(this.level);
    this.sv = new THREE.Vector3(0, 1, 0); this.lastProbe = new THREE.Vector3(1e9, 0, 0); this._probeT = 0;
    this.focus = new THREE.Vector3();
    this._levelBox = new THREE.Box3(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 10, 50));

    // visible sky: gradient dome following the camera, with sun glow and night stars
    this.domeU = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() }, uNight: this.uniforms.uNight,
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.domeU,
      vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform vec3 uTop,uHor,uSun,uSunCol;uniform float uNight;varying vec3 p;
        float h3(vec3 x){return fract(sin(dot(x,vec3(127.1,311.7,74.7)))*43758.5453);}
        void main(){vec3 d=normalize(p);float h=clamp(d.y,0.,1.);vec3 c=mix(uHor,uTop,smoothstep(0.,.45,h));
        if(d.y<0.)c=uHor*mix(1.,.55,smoothstep(0.,-.2,d.y));
        float s=max(dot(d,normalize(uSun)),0.);c+=uSunCol*(pow(s,600.)*25.+pow(s,12.)*.25)*(1.-uNight);
        vec3 g=floor(d*420.);float st=step(.9985,h3(g))*smoothstep(.05,.3,d.y)*uNight;c+=vec3(st*1.6);
        gl_FragColor=vec4(c,1.);}`,
    }));
    this.dome.renderOrder = -1; this.dome.frustumCulled = false; scene.add(this.dome);

    // physical sky used only for the environment light
    this.sky = new Sky(); this.sky.scale.setScalar(4e5);
    const U = this.sky.material.uniforms; U.turbidity.value = 2.2; U.rayleigh.value = 2.4; U.mieCoefficient.value = 0.002; U.mieDirectionalG.value = 0.8;
    this.envScene = new THREE.Scene(); this.envScene.add(this.sky);
    this.pm = new THREE.PMREMGenerator(R);
    scene.fog = new THREE.Fog(0xbcd3ea, 500, 2600);

    // lights
    const s = this.sun = new THREE.DirectionalLight(0xfff0d8, 4.5); s.castShadow = true;
    s.shadow.mapSize.set(o.shadowMap, o.shadowMap); s.shadow.bias = -0.0003; s.shadow.radius = 2;
    this.hemi = new THREE.HemisphereLight(0xd8dce6, 0x8a7a68, 0.25);
    this.amb = new THREE.AmbientLight(0xffe0c0, 0.2);
    scene.add(s, s.target, this.hemi, this.amb);

    // live GI probe
    this.cubeRT = new THREE.WebGLCubeRenderTarget(o.probeSize, { type: THREE.HalfFloatType });
    this.cube = new THREE.CubeCamera(0.5, 3000, this.cubeRT); scene.add(this.cube);

    // contact-AO height map (half float: tall towers would band in 8 bit)
    this.sao = { uH: { value: null }, uBox: { value: new THREE.Vector4() }, uMinY: { value: 0 }, uYs: { value: 1 }, uR: { value: 4 }, uStr: { value: 0.7 } };
    this.hRT = new THREE.WebGLRenderTarget(o.aoMapSize, o.aoMapSize, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.sao.uH.value = this.hRT.texture;
    this.hMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: { y0: this.sao.uMinY, ys: this.sao.uYs },
      vertexShader: `uniform float y0,ys;varying float h;void main(){vec4 w=vec4(position,1.);
        #ifdef USE_INSTANCING
        w=instanceMatrix*w;
        #endif
        w=modelMatrix*w;h=(w.y-y0)/ys;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: 'varying float h;void main(){gl_FragColor=vec4(clamp(h,0.,1.),0.,0.,1.);}',
    });

    // post stack
    const sz = R.getSize(new THREE.Vector2()), pr = R.getPixelRatio();
    const comp = this.comp = new EffectComposer(R);
    comp.addPass(new RenderPass(scene, cam));
    const ssao = this.ssao = new SSAOPass(scene, cam, sz.x, sz.y);
    ssao.kernelRadius = 2.0; ssao.minDistance = 0.00002; ssao.maxDistance = 0.0025; comp.addPass(ssao);
    const base = ssao.render.bind(ssao);
    ssao.render = (...a) => { // keep thin / transparent helpers out of the normal pass
      const h = [], hide = (x) => { if (x.visible) { x.visible = false; h.push(x); } };
      scene.traverse((x) => { if (x.isPoints || x.isSprite || (x.material && !Array.isArray(x.material) && (x.material.transparent || x.material.alphaTest > 0 || x.material.colorWrite === false))) hide(x); });
      hide(this.dome); R.shadowMap.autoUpdate = false; base(...a); R.shadowMap.autoUpdate = true; h.forEach((x) => (x.visible = true));
    };
    this.bounceP = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, px: { value: new THREE.Vector2(1 / (sz.x * pr), 1 / (sz.y * pr)) }, bounce: { value: 0.6 } }, vertexShader: VS,
      fragmentShader: 'uniform sampler2D tDiffuse;uniform vec2 px;uniform float bounce;varying vec2 v;void main(){vec4 c=texture2D(tDiffuse,v);vec3 a=vec3(0.);float w=0.;for(int i=0;i<16;i++){float f=float(i)+.5;float t=f*2.39996;vec2 o=vec2(cos(t),sin(t))*sqrt(f/16.)*90.*px;vec3 s=texture2D(tDiffuse,v+o).rgb;float k=1.+dot(s,vec3(.33));a+=s*k;w+=k;}a/=w;float l=dot(c.rgb,vec3(.2126,.7152,.0722));float sh=1.-smoothstep(.05,.7,l);c.rgb+=a*bounce*sh*(c.rgb+.15);gl_FragColor=c;}',
    });
    comp.addPass(this.bounceP);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(sz.x, sz.y), 0.25, 0.5, 0.9); comp.addPass(this.bloom);
    this.smaa = new SMAAPass(sz.x * pr, sz.y * pr); comp.addPass(this.smaa);
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, sat: { value: 1.15 }, night: this.uniforms.uNight }, vertexShader: VS,
      fragmentShader: 'uniform sampler2D tDiffuse;uniform float sat,night;varying vec2 v;void main(){vec4 c=texture2D(tDiffuse,v);float d=distance(v,vec2(.5));c.rgb*=smoothstep(.95,.35,d)*.4+.6;float l=dot(c.rgb,vec3(.2126,.7152,.0722));float k=smoothstep(0.,.6,l);c.rgb=mix(vec3(l),c.rgb,sat*(1.+.1*(1.-k)));c.rgb*=mix(mix(vec3(1.06,.97,.86),vec3(.85,.95,1.15),night),vec3(1.03,1.,.95),k);c.rgb=(c.rgb-.18)*1.1+.18;gl_FragColor=vec4(max(c.rgb,0.),c.a);}',
    });
    comp.addPass(this.grade); comp.addPass(new OutputPass());

    this.setTime(this.params.time);
  }

  /* ---------- public API ---------- */
  /** Patch a MeshStandardMaterial-derived shader with contact AO (call from onBeforeCompile). */
  injectSAO(shader) {
    Object.assign(shader.uniforms, this.sao);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSaoP;varying vec3 vSaoN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 sp=vec4(transformed,1.);vec3 sn=objectNormal;
        #ifdef USE_INSTANCING
        sp=instanceMatrix*sp;sn=mat3(instanceMatrix)*sn;
        #endif
        vSaoP=(modelMatrix*sp).xyz;vSaoN=normalize(mat3(modelMatrix)*sn);}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSaoP;varying vec3 vSaoN;\n' + SAO_GLSL)
      .replace('#include <opaque_fragment>', 'outgoingLight*=saoC(vSaoP,normalize(vSaoN));\n#include <opaque_fragment>');
  }
  /** Patch plain standard materials (props) with contact AO. */
  patch(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      [].concat(o.material).forEach((m) => {
        if (!m || !m.isMeshStandardMaterial || m.userData.sao) return; m.userData.sao = 1;
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = (s, r) => { prev && prev.call(m, s, r); this.injectSAO(s); };
        const pk = m.customProgramCacheKey.bind(m);
        m.customProgramCacheKey = () => pk() + '|sao'; m.needsUpdate = true;
      });
    });
  }

  setBounds(box) { this._levelBox.copy(box); }
  setFocus(v) { this.focus.copy(v); }

  /** time in hours (0..24) drives sun, moon, sky, fog and the night factor */
  setTime(h) {
    const p = this.params; if (h !== undefined) p.time = h;
    const t = (p.time - 6) / 12; // 0 sunrise .. 1 sunset
    const elev = Math.sin(t * Math.PI) * 62; // degrees
    const az = 100 + t * 160 + p.sunAzOffset;
    const night = smooth(4, -6, elev);
    this.uniforms.uNight.value = night;
    this.sunEl = elev;

    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(elev);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - e, a);
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    // light direction: sun by day, moon by night
    if (night < 0.5) this.sv.copy(sunDir); else this.sv.setFromSphericalCoords(1, Math.PI / 2 - THREE.MathUtils.degToRad(42), a + Math.PI);
    if (this.sv.y < 0.08) { this.sv.y = 0.08; this.sv.normalize(); }

    const golden = smooth(25, 2, elev) * (1 - night);
    const sunCol = new THREE.Color().setHSL(0.09 - golden * 0.04, 1, 0.62 + 0.2 * Math.sin(Math.max(e, 0)) - golden * 0.1);
    const moonCol = new THREE.Color(0x8fa8d8);
    this.sun.color.copy(sunCol).lerp(moonCol, night);
    this.sun.intensity = THREE.MathUtils.lerp(4.5 * smooth(-2, 10, elev) + 0.001, 0.35, night);
    this.hemi.intensity = THREE.MathUtils.lerp(0.25, 0.1, night);
    this.amb.intensity = THREE.MathUtils.lerp(0.08, 0.05, night);
    this.hemi.color.setRGB(0.85, 0.86, 0.9).lerp(new THREE.Color(0.35, 0.45, 0.75), night);

    const dayTop = new THREE.Color(0.1, 0.38, 1.15), dayHor = new THREE.Color(0.55, 0.8, 1.25);
    const setTop = new THREE.Color(0.18, 0.25, 0.6), setHor = new THREE.Color(1.4, 0.62, 0.32);
    const nTop = new THREE.Color(0.004, 0.008, 0.025), nHor = new THREE.Color(0.02, 0.035, 0.07);
    const top = dayTop.clone().lerp(setTop, golden).lerp(nTop, night), hor = dayHor.clone().lerp(setHor, golden).lerp(nHor, night);
    this.domeU.uTop.value.copy(top); this.domeU.uHor.value.copy(hor);
    this.domeU.uSun.value.copy(sunDir); this.domeU.uSunCol.value.copy(sunCol);
    this.scene.fog.color.copy(hor).multiplyScalar(0.75);

    if (this.skyEnv) this.skyEnv.dispose();
    this.skyEnv = this.pm.fromScene(this.envScene);
    if (!this.probeEnv || !p.probe) this.scene.environment = this.skyEnv.texture;
    this.scene.environmentIntensity = 1;
    this.lastProbe.set(1e9, 0, 0);
  }

  rebuild() { this._buildSAO(); this.lastProbe.set(1e9, 0, 0); }
  resize(w, h) {
    this.comp.setSize(w, h); const pr = this.R.getPixelRatio();
    this.bounceP.uniforms.px.value.set(1 / (w * pr), 1 / (h * pr));
  }
  render(dt = 0.016) {
    const p = this.params, R = this.R, cam = this.cam, n = this.uniforms.uNight.value;
    R.toneMappingExposure = p.exposure * (1 + n * 0.9);
    this.bloom.strength = p.bloom * (1 + n * 1.6); this.bloom.threshold = THREE.MathUtils.lerp(0.9, 0.6, n);
    this.grade.uniforms.sat.value = p.saturation;
    this.bounceP.uniforms.bounce.value = p.bounce; this.sao.uStr.value = p.contactAO; this.ssao.enabled = p.ssao;
    this.dome.position.copy(cam.position); this.dome.scale.setScalar(cam.far * 0.8 / 500);
    this._fitShadow();
    this._probeT += dt;
    if (p.probe && this._probeT > this.opts.probeInterval && cam.position.distanceTo(this.lastProbe) > this.opts.probeDistance) this._probe();
    if (!p.probe && this.probeEnv) { this.probeEnv.dispose(); this.probeEnv = null; this.scene.environment = this.skyEnv.texture; }
    this.comp.render();
  }

  /* ---------- internals ---------- */
  _fitShadow() {
    // shadow frustum follows the camera focus; snapped to shadow texels to avoid shimmering
    const s = this.sun, r = this.params.shadowRadius, c = this.focus.clone();
    const fwd = this.sv.clone().negate(), up = Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize(), u2 = new THREE.Vector3().crossVectors(right, fwd);
    const texel = (2 * r) / this.opts.shadowMap;
    const x = Math.round(c.dot(right) / texel) * texel - c.dot(right), y = Math.round(c.dot(u2) / texel) * texel - c.dot(u2);
    c.addScaledVector(right, x).addScaledVector(u2, y);
    s.target.position.copy(c);
    const far = r * 2 + 600;
    Object.assign(s.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far });
    s.shadow.camera.updateProjectionMatrix(); s.shadow.normalBias = r * 0.0002;
    s.position.copy(this.sv).multiplyScalar(far * 0.5).add(c);
    s.target.updateMatrixWorld();
  }
  _probe() {
    const R = this.R, scene = this.scene; if (!this.skyEnv) return;
    this._probeT = 0;
    scene.environment = this.skyEnv.texture; this.cube.position.copy(this.cam.position);
    this.cube.position.y = Math.max(this.cube.position.y, 2);
    R.shadowMap.autoUpdate = false; this.cube.update(R, scene); R.shadowMap.autoUpdate = true;
    if (this.probeEnv) this.probeEnv.dispose();
    this.probeEnv = this.pm.fromCubemap(this.cubeRT.texture); scene.environment = this.probeEnv.texture; this.lastProbe.copy(this.cam.position);
  }
  _buildSAO() {
    const R = this.R, S = this.sao, b = this._levelBox; if (b.isEmpty()) return;
    const sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()), half = Math.max(sz.x, sz.z) / 2 + 1;
    S.uMinY.value = b.min.y; S.uYs.value = Math.max(sz.y, 0.1); S.uBox.value.set(c.x - half, c.z + half, half * 2, half * 2);
    const oc = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, sz.y + 4);
    oc.position.set(c.x, b.max.y + 2, c.z); oc.up.set(0, 0, -1); oc.lookAt(c.x, b.min.y, c.z); oc.updateMatrixWorld();
    const hidden = [], sw = [];
    this.level.traverse((o) => {
      if ((o.isPoints || o.userData.noAO) && o.visible) { o.visible = false; hidden.push(o); }
      else if (o.isMesh) { sw.push([o, o.material]); o.material = this.hMat; }
    });
    const cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha(), pr = R.getRenderTarget();
    R.setRenderTarget(this.hRT); R.setClearColor(0, 1); R.clear(); R.render(this.level, oc);
    R.setRenderTarget(pr); R.setClearColor(cc, ca);
    sw.forEach(([o, m]) => (o.material = m));
    hidden.forEach((o) => (o.visible = true));
  }
}
