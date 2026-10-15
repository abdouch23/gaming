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
import { Lumina, LUMINA_GLSL, LUMINA_APPLY } from './Lumina.js';
import { AutoExposurePass } from './AutoExposure.js';
import { TAAPass } from './TAA.js';

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
      exposure: 1, autoExposure: true, bloom: 0.3, saturation: 1.2, bounce: 0, contactAO: 0.45, ssao: false, probe: false,
      time: 17.0, sunAzOffset: 0, shadowRadius: 220,
      aa: 'taa', sharpen: 0.35, lumina: true, gi: 1, spec: 1, fog: 1, godRays: 1, glare: 1, clouds: 1,
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
      uSunCol: { value: new THREE.Color() }, uNight: this.uniforms.uNight, uClouds: { value: 1 }, uTime: { value: 0 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.domeU,
      vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform vec3 uTop,uHor,uSun,uSunCol;uniform float uNight,uClouds,uTime;varying vec3 p;
        float h3(vec3 x){return fract(sin(dot(x,vec3(127.1,311.7,74.7)))*43758.5453);}
        float h2(vec2 q){q=fract(q*vec2(123.34,456.21));q+=dot(q,q+45.32);return fract(q.x*q.y);}
        float vn(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+1.),f.x),f.y);}
        float fbm(vec2 q){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(q);q=q*2.03+vec2(1.7,9.2);a*=.5;}return s;}
        void main(){vec3 d=normalize(p);float h=clamp(d.y,0.,1.);vec3 c=mix(uHor,uTop,smoothstep(0.,.45,h));
        if(d.y<0.)c=uHor*mix(1.,.55,smoothstep(0.,-.2,d.y));
        float s=max(dot(d,normalize(uSun)),0.);c+=uSunCol*(pow(s,600.)*25.+pow(s,12.)*.25+pow(s,3.)*.12)*(1.-uNight);
        if(d.y>0.&&uClouds>0.){ // two-layer fbm clouds, lit from the sun side (silver lining)
          vec2 cp=d.xz/(d.y+.12)*1.6+vec2(uTime*.004,uTime*.0015);
          float n=fbm(cp)*.65+fbm(cp*2.7+3.1)*.35, cov=smoothstep(.5,.78,n)*smoothstep(0.,.18,d.y)*uClouds;
          float thick=smoothstep(.55,.95,n);
          vec3 lit=mix(uHor*1.15+vec3(.15),uSunCol*1.8+uHor*.4,pow(s,5.)*.8+.2)*(1.-thick*.45);
          c=mix(c,mix(lit,vec3(.02,.025,.04),uNight*.9),cov);}
        vec3 g=floor(d*420.);float st=step(.9985,h3(g))*smoothstep(.05,.3,d.y)*uNight;c+=vec3(st*1.6);
        gl_FragColor=vec4(c,1.);}`,
    }));
    this.dome.renderOrder = -1; this.dome.frustumCulled = false; scene.add(this.dome);

    // physical sky used only for the environment light
    this.sky = new Sky(); this.sky.scale.setScalar(4e5);
    const U = this.sky.material.uniforms; U.turbidity.value = 2.2; U.rayleigh.value = 2.4; U.mieCoefficient.value = 0.002; U.mieDirectionalG.value = 0.8;
    this.envScene = new THREE.Scene(); this.envScene.add(this.sky);
    this.pm = new THREE.PMREMGenerator(R);
    scene.fog = null; // atmosphere is a post pass (height fog + god rays)
    this.fogColor = new THREE.Color();

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
    this.lumina = new Lumina(R, this.sao);
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
      hide(this.dome); R.shadowMap.autoUpdate = false;
      if (this.params.ssao) base(...a);
      else { // depth/normal only, pass the image through
        const [renderer, writeBuffer, readBuffer] = a;
        ssao.overrideVisibility(); ssao.renderOverride(renderer, ssao.normalMaterial, ssao.normalRenderTarget, 0x7777ff, 1.0); ssao.restoreVisibility();
        ssao.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture; ssao.copyMaterial.blending = THREE.NoBlending;
        ssao.renderPass(renderer, ssao.copyMaterial, writeBuffer);
      }
      R.shadowMap.autoUpdate = true; h.forEach((x) => (x.visible = true));
    };
    // atmosphere: analytic height fog + god rays marched through Lumina's shadow-height map
    this.atmo = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, uLmS: { value: null }, uBox: { value: null }, // linked after ShaderPass clones
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Vector3() }, uFogCol: { value: new THREE.Vector3() },
        uDens: { value: 0.0016 }, uFall: { value: 70 }, uRay: { value: 1 }, uFrame: { value: 0 }, uTopY: { value: 200 },
      }, vertexShader: VS,
      fragmentShader: `uniform sampler2D tDiffuse,tDepth,uLmS;uniform vec4 uBox;uniform mat4 uInvProj,uCamWorld;uniform vec3 uCamPos,uSunDir,uSunCol,uFogCol;
        uniform float uDens,uFall,uRay,uFrame,uTopY;varying vec2 v;
        float lit(vec3 p){vec2 uv=vec2((p.x-uBox.x)/uBox.z,(uBox.y-p.z)/uBox.w);if(p.y>uTopY||uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)return 1.;
          float S=texture2D(uLmS,uv).r;return smoothstep(S-1.,S+1.,p.y);}
        void main(){vec4 c=texture2D(tDiffuse,v);float z=texture2D(tDepth,v).r;
          vec4 vp=uInvProj*vec4(v*2.-1.,z*2.-1.,1.);vp/=vp.w;vec3 wp=(uCamWorld*vec4(vp.xyz,1.)).xyz;
          vec3 rd=wp-uCamPos;float dist=length(rd);rd/=dist;bool sky=z>.99999;if(sky)dist=2500.;
          float k=rd.y/uFall,y0=max(uCamPos.y,0.);
          float od=uDens*exp(-y0/uFall)*(abs(k)>1e-5?(1.-exp(-k*dist))/k:dist);
          float T=exp(-od);
          float mu=dot(rd,uSunDir),g=.62,ph=(1.-g*g)/(12.566*pow(1.+g*g-2.*g*mu,1.5));
          float L=min(dist,320.),acc=0.,ws=0.,j=fract(52.9829189*fract(dot(gl_FragCoord.xy+uFrame*5.588,vec2(.06711056,.00583715))));
          for(int i=0;i<20;i++){float t=(float(i)+j)/20.*L;vec3 q=uCamPos+rd*t;float w=exp(-max(q.y,0.)/uFall);acc+=lit(q)*w;ws+=w;}
          float litF=(acc/max(ws,1e-4)*L+max(dist-L,0.))/dist;
          vec3 ins=uFogCol+uSunCol*ph*litF*uRay*3.;
          c.rgb=c.rgb*T+ins*(1.-T);gl_FragColor=c;}`,
    });
    comp.addPass(this.atmo);
    // TAA on the HDR image after fog, before exposure / bloom (stable input for bloom)
    this.taa = new TAAPass(cam, ssao.normalRenderTarget.depthTexture); comp.addPass(this.taa);
    this.autoExp = new AutoExposurePass(); comp.addPass(this.autoExp);
    this.bounceP = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, px: { value: new THREE.Vector2(1 / (sz.x * pr), 1 / (sz.y * pr)) }, bounce: { value: 0.6 } }, vertexShader: VS,
      fragmentShader: 'uniform sampler2D tDiffuse;uniform vec2 px;uniform float bounce;varying vec2 v;void main(){vec4 c=texture2D(tDiffuse,v);vec3 a=vec3(0.);float w=0.;for(int i=0;i<16;i++){float f=float(i)+.5;float t=f*2.39996;vec2 o=vec2(cos(t),sin(t))*sqrt(f/16.)*90.*px;vec3 s=texture2D(tDiffuse,v+o).rgb;float k=1.+dot(s,vec3(.33));a+=s*k;w+=k;}a/=w;float l=dot(c.rgb,vec3(.2126,.7152,.0722));float sh=1.-smoothstep(.05,.7,l);c.rgb+=a*bounce*sh*(c.rgb+.15);gl_FragColor=c;}',
    });
    comp.addPass(this.bounceP); this.bounceP.enabled = false;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(sz.x, sz.y), 0.25, 0.5, 0.9); comp.addPass(this.bloom);
    this.smaa = new SMAAPass(sz.x * pr, sz.y * pr); comp.addPass(this.smaa);
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, sat: { value: 1.15 }, night: this.uniforms.uNight, tDepth: { value: null },
        uSunUV: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Vector3() }, uGlare: { value: 1 }, uAspect: { value: 1 } }, vertexShader: VS,
      fragmentShader: 'uniform sampler2D tDiffuse,tDepth;uniform float sat,night,uGlare,uAspect;uniform vec3 uSunUV,uSunCol;varying vec2 v;'
        + 'vec3 glare(){if(uSunUV.z<=0.||uGlare<=0.)return vec3(0.);float vis=0.;for(int i=0;i<9;i++){vec2 o=vec2(float(i%3)-1.,float(i/3)-1.)*.012;vis+=step(.99999,texture2D(tDepth,uSunUV.xy+o).r);}vis/=9.;if(vis<=0.)return vec3(0.);'
        + 'vec2 d=(v-uSunUV.xy)*vec2(uAspect,1.);float r=length(d);vec3 g=uSunCol*(exp(-r*9.)*.35+exp(-r*2.5)*.08+exp(-abs(d.y)*260.)*exp(-abs(d.x)*3.)*.12);'
        + 'vec2 axis=vec2(.5)-uSunUV.xy;for(int k=1;k<4;k++){vec2 gp=uSunUV.xy+axis*(float(k)*.55);float gr=length((v-gp)*vec2(uAspect,1.));g+=uSunCol*vec3(.35,.5,.8)*smoothstep(.05,.0,abs(gr-.03*float(k)))*.04;}'
        + 'return g*vis*uSunUV.z*uGlare;}'
        + 'void main(){vec4 c=texture2D(tDiffuse,v);c.rgb+=glare();float d=distance(v,vec2(.5));c.rgb*=mix(.8,1.,smoothstep(1.,.35,d));float l=dot(c.rgb,vec3(.2126,.7152,.0722));float k=smoothstep(0.,.6,l);c.rgb=mix(vec3(l),c.rgb,sat*(1.+.1*(1.-k)));c.rgb*=mix(mix(vec3(1.05,.97,.88),vec3(.85,.95,1.15),night),mix(vec3(1.09,1.,.87),vec3(1.,1.,1.02),night),k);c.rgb=.18*pow(max(c.rgb,0.)/.18,vec3(1.14));gl_FragColor=vec4(c.rgb,c.a);}',
    });
    comp.addPass(this.grade); comp.addPass(new OutputPass());
    // ShaderPass clones uniforms (render-target textures become null, shared objects get copied): re-link them
    const depth = ssao.normalRenderTarget.depthTexture;
    this.atmo.uniforms.tDepth.value = depth; this.atmo.uniforms.uLmS.value = this.lumina.S.texture; this.atmo.uniforms.uBox = this.sao.uBox;
    this.grade.uniforms.tDepth.value = depth; this.grade.uniforms.night = this.uniforms.uNight;

    this.setTime(this.params.time);
  }

  /* ---------- public API ---------- */
  /** Patch a MeshStandardMaterial-derived shader with contact AO (call from onBeforeCompile). */
  injectSAO(shader) {
    Object.assign(shader.uniforms, this.sao, this.lumina.u);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSaoP;varying vec3 vSaoN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 sp=vec4(transformed,1.);vec3 sn=objectNormal;
        #ifdef USE_INSTANCING
        sp=instanceMatrix*sp;sn=mat3(instanceMatrix)*sn;
        #endif
        vSaoP=(modelMatrix*sp).xyz;vSaoN=normalize(mat3(modelMatrix)*sn);}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSaoP;varying vec3 vSaoN;\n' + SAO_GLSL + LUMINA_GLSL)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('vDirectionalShadowCoord[ i ] ) : 1.0;',
        'vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? lmFarShadow( vDirectionalShadowCoord[ i ], vSaoP, normalize( vSaoN ) ) : 1.0;'))
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + LUMINA_APPLY)
      .replace('vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;',
        '{ vec3 saoK = saoC(vSaoP, normalize(vSaoN)); reflectedLight.indirectDiffuse *= saoK; reflectedLight.indirectSpecular *= saoK; }\nvec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;');
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
    this.fogColor.copy(hor).multiplyScalar(0.75);

    if (this.skyEnv) this.skyEnv.dispose();
    this.skyEnv = this.pm.fromScene(this.envScene);
    if (!this.probeEnv || !p.probe) this.scene.environment = this.skyEnv.texture;
    this.scene.environmentIntensity = 1;
    this.lastProbe.set(1e9, 0, 0);
  }

  /** SSAOPass caches near/far at construction; call after changing the camera's clip planes */
  resetExposure() { this.autoExp.reset(); }
  syncCamera() {
    for (const m of [this.ssao.ssaoMaterial, this.ssao.depthRenderMaterial]) { m.uniforms.cameraNear.value = this.cam.near; m.uniforms.cameraFar.value = this.cam.far; }
  }
  rebuild() {
    this._buildSAO(); this.lumina.rebuild(); this.lumina.updateSun(this.sv, true);
    this.lumina.updateCaches(this.cam.position, true); // complete gather once; later updates are progressive
    this.lastProbe.set(1e9, 0, 0);
  }
  resize(w, h) {
    this.comp.setSize(w, h); const pr = this.R.getPixelRatio();
    this.bounceP.uniforms.px.value.set(1 / (w * pr), 1 / (h * pr));
  }
  render(dt = 0.016) {
    const p = this.params, R = this.R, cam = this.cam, n = this.uniforms.uNight.value;
    // auto: exposure compensation on top of eye adaptation; manual: fixed exposure as before
    this.autoExp.enabled = p.autoExposure;
    this.autoExp.u.uMaxE.value = THREE.MathUtils.lerp(6, 1.6, n);
    R.toneMappingExposure = p.autoExposure ? p.exposure : p.exposure * 0.62 * (1 + n * 0.9);
    this.bloom.strength = p.bloom * (1 + n * 1.6); this.bloom.threshold = THREE.MathUtils.lerp(0.9, 0.6, n);
    this.grade.uniforms.sat.value = p.saturation;
    this.bounceP.uniforms.bounce.value = p.bounce; this.bounceP.enabled = p.bounce > 0; this.sao.uStr.value = p.contactAO;
    this._updateLumina(dt);
    this.dome.position.copy(cam.position); this.dome.scale.setScalar(cam.far * 0.8 / 500);
    this._fitShadow();
    this._probeT += dt;
    if (p.probe && this._probeT > this.opts.probeInterval && cam.position.distanceTo(this.lastProbe) > this.opts.probeDistance) this._probe();
    if (!p.probe && this.probeEnv) { this.probeEnv.dispose(); this.probeEnv = null; this.scene.environment = this.skyEnv.texture; }
    const taa = p.aa === 'taa';
    this.taa.enabled = taa; this.smaa.enabled = p.aa === 'smaa'; this.taa.su.uSharp.value = p.sharpen;
    if (taa) { R.getDrawingBufferSize(this._dbs || (this._dbs = new THREE.Vector2())); this.taa.begin(this._dbs.x, this._dbs.y); }
    this.comp.render();
    if (taa) this.taa.end(); else this.taa.reset();
  }

  _updateLumina(dt) {
    const p = this.params, Lm = this.lumina, u = Lm.u, cam = this.cam, n = this.uniforms.uNight.value;
    u.uLmOn.value = p.lumina ? 1 : 0; u.uLmGI.value = p.gi; u.uLmSpec.value = p.spec;
    // with Lumina the analytic fill lights are replaced by traced sky + bounce
    this.hemi.visible = this.amb.visible = !p.lumina;
    Lm.setLighting(this.sv, this.sun.color, this.sun.intensity, this.domeU.uTop.value, this.domeU.uHor.value, n);
    if (p.lumina) { Lm.updateSun(this.sv); Lm.updateCaches(cam.position); }
    this.domeU.uClouds.value = p.clouds; this.domeU.uTime.value += dt;
    // atmosphere
    const A = this.atmo.uniforms; this.atmo.enabled = p.fog > 0;
    A.uInvProj.value.copy(cam.projectionMatrixInverse); A.uCamWorld.value.copy(cam.matrixWorld); A.uCamPos.value.copy(cam.position);
    A.uSunDir.value.copy(this.sv); A.uSunCol.value.copy(u.uLmSunE.value).multiplyScalar(n > 0.5 ? 0.05 : 0.07);
    const hor = this.domeU.uHor.value; A.uFogCol.value.set(hor.r, hor.g, hor.b).multiplyScalar(0.4).lerp(u.uLmSunE.value.clone().multiplyScalar(0.08), 0.45);
    A.uDens.value = 0.0005 * p.fog; A.uRay.value = p.lumina ? p.godRays : 0; A.uFrame.value = (A.uFrame.value + 1) % 64; A.uTopY.value = u.uLmTopY.value;
    // sun glare
    const G = this.grade.uniforms, sp = this.sv.clone().multiplyScalar(1000).add(cam.position).project(cam);
    const on = sp.z < 1 && Math.abs(sp.x) < 1.2 && Math.abs(sp.y) < 1.2 && this.sv.dot(cam.getWorldDirection(new THREE.Vector3())) > 0;
    G.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, on ? (1 - n) * THREE.MathUtils.smoothstep(this.sunEl, -1, 6) : 0);
    G.uSunCol.value.copy(u.uLmSunE.value).multiplyScalar(0.12); G.uGlare.value = p.glare; G.uAspect.value = cam.aspect;
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
    s.shadow.camera.updateProjectionMatrix(); s.shadow.normalBias = texel * 1.6; // scales with shadow texel size (acne at wide frusta)
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
