// City materials. One opaque material renders every building / road / debris surface by picking a
// layer of the shared texture arrays per vertex, and blends world-projected weathering masks on top.
import * as THREE from 'three';
import { LAYER_DEFS } from './layers.js';

const pad16 = (fn) => { const a = new Float32Array(16); LAYER_DEFS.forEach((d, i) => (a[i] = fn(d))); return a; };

export const COMMON_GLSL = /* glsl */`
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float h31(vec3 p){return h21(p.xy+vec2(p.z*17.13,p.z*3.71));}
// interior mapping: fake room behind a window. c = 0..1 position on the pane, vT = view vector in facade space
// (x along facade, y up, z out of the wall), ws = window size in metres. Returns emitted radiance.
vec3 interiorRoom(vec2 c, vec3 vT, float seed, vec2 ws, float night){
  vec3 d=-vT; d.x/=max(ws.x,.3); d.y/=max(ws.y,.3); d.z/=3.6;
  vec3 p=vec3(c,0.);
  float tx=d.x>0.?(1.-p.x)/max(d.x,1e-4):-p.x/min(d.x,-1e-4);
  float ty=d.y>0.?(1.-p.y)/max(d.y,1e-4):-p.y/min(d.y,-1e-4);
  float tz=1./max(-d.z,1e-4);
  float t=min(tx,min(ty,tz)); vec3 h=p+d*t;
  vec3 wall=mix(vec3(.82,.78,.7),vec3(.62,.7,.78),h21(vec2(seed,1.7)));
  wall=mix(wall,vec3(.75,.55,.42),step(.8,h21(vec2(seed,2.9))));
  vec3 floorC=mix(vec3(.35,.24,.15),vec3(.3,.3,.32),h21(vec2(seed,5.3)));
  vec3 col;
  if(t==tz){ col=wall*.9;
    float f=fract(h.x*1.7+seed*3.);if(h.y<.38&&f<.55)col*=.45; // furniture silhouettes
    if(h.y>.45&&h.y<.8&&abs(fract(h.x+seed)-.5)<.12)col=mix(col,vec3(.4,.35,.3),.6);
  } else if(t==ty){ col=d.y<0.?floorC*.6:vec3(.9)*(.75+.5*smoothstep(.25,.0,length(h.xz-vec2(.5,-.5))));
  } else col=wall*.72;
  col*=mix(1.,.45,clamp(-h.z,0.,1.));
  float blind=h21(vec2(seed,8.1))>.62?h21(vec2(seed,9.4))*.75:0.;
  if(c.y>1.-blind)col=vec3(.85,.82,.74)*(.9+.1*sin(c.y*120.));
  float lit=step(h21(vec2(seed,3.3)),mix(.05,.48,night));
  vec3 lightCol=mix(vec3(1.,.78,.5),vec3(.85,.92,1.),step(.65,h21(vec2(seed,4.4))));
  return col*mix(vec3(.07),lightCol*2.4,lit*night)+col*(1.-night)*.05;
}
// procedural window grid of the facade (LOD / debris surfaces). F = (bay, floorH, groundH, style)
float facadeWindow(vec2 f, vec4 F, out vec2 cuv, out vec2 cid, out vec2 ws, out float edge){
  float bay=F.x, fh=F.y, gh=F.z, st=F.w; float u=f.x, v=f.y;
  float fu=fract(u/bay), ci=floor(u/bay), fv, fi, ch, ww, wh, sill;
  if(v<gh){fi=0.;fv=v/gh;ch=gh;ww=.8;wh=.72;sill=.06;}
  else{fi=1.+floor((v-gh)/fh);fv=fract((v-gh)/fh);ch=fh;
    if(st<1.5){ww=.46;wh=.56;sill=.28;}else if(st<2.5){ww=.88;wh=.46;sill=.3;}else{ww=.96;wh=.8;sill=.1;}}
  vec2 lo=vec2(.5-ww*.5,sill), hi=vec2(.5+ww*.5,sill+wh), q=vec2(fu,fv);
  cuv=(q-lo)/(hi-lo); cid=vec2(ci,fi); ws=vec2(ww*bay,wh*ch);
  vec2 e=min(q-lo,hi-q)*vec2(bay,ch); edge=min(e.x,e.y);
  return step(0.,edge);
}
`;

const VERT_DECL = /* glsl */`
attribute float aLayer; attribute vec3 aTint; attribute vec4 aFacade; attribute float aSeed;
flat varying float cLayer; flat varying vec4 cFacade; flat varying float cSeed;
varying vec2 cUv; varying vec3 cTint; varying vec3 cWP; varying vec3 cWN;
`;
const VERT_BODY = /* glsl */`
{ vec4 wp=vec4(transformed,1.); vec3 wn=objectNormal;
  #ifdef USE_INSTANCING
  wp=instanceMatrix*wp; wn=mat3(instanceMatrix)*wn;
  #endif
  wp=modelMatrix*wp; cWP=wp.xyz; cWN=normalize(mat3(modelMatrix)*wn);
  cUv=uv; cLayer=aLayer; cTint=aTint; cFacade=aFacade; cSeed=aSeed; }
`;
const FRAG_DECL = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uAlb, uNrm; uniform sampler2D uGrime;
uniform float uTile[16], uMetal[16], uAnti[16];
uniform float uWeather, uNormalStr, uNight;
flat varying float cLayer; flat varying vec4 cFacade; flat varying float cSeed;
varying vec2 cUv; varying vec3 cTint; varying vec3 cWP; varying vec3 cWN;
` + COMMON_GLSL;

const FRAG_SURFACE = /* glsl */`
float wRough, wMetal, wAO; vec3 wN, wEmis = vec3(0.);
{
  int Li = int(cLayer + .5); float Lf = float(Li);
  vec2 tuv = cUv / uTile[Li];
  vec3 N = normalize(cWN); float vert = 1. - abs(N.y);
  vec4 gM = texture2D(uGrime, cWP.xz * (1. / 83.) + cWP.y * (1. / 131.));
  vec4 A = texture(uAlb, vec3(tuv, Lf)), Nn = texture(uNrm, vec3(tuv, Lf));
  if (uAnti[Li] > .5) { // anti-tiling: blend a rotated, rescaled second sample through a macro mask
    vec2 t2 = mat2(.8, -.6, .6, .8) * tuv * .63 + vec2(.37, .71);
    float b = smoothstep(.38, .62, gM.g);
    A = mix(A, texture(uAlb, vec3(t2, Lf)), b); Nn = mix(Nn, texture(uNrm, vec3(t2, Lf)), b);
  }
  vec3 alb = A.rgb * cTint * (.9 + .2 * gM.a);
  float hgt = A.a; wRough = Nn.b; wAO = Nn.a; wMetal = uMetal[Li];
  vec2 nxy = Nn.rg * 2. - 1.; wN = vec3(nxy * uNormalStr, sqrt(max(1. - dot(nxy, nxy), 0.)));

  // ---- weathering masks (world projected): rain streaks, ground splash, roof grime, cavity dirt, moss
  vec2 fuv = vec2(cUv.x, cWP.y);
  vec4 gS = texture2D(uGrime, vec2(fuv.x / 4.3, fuv.y / 17.));
  vec4 gB = texture2D(uGrime, (vert > .5 ? fuv : cWP.xz) / 7.3);
  float streak = gS.r * vert * smoothstep(1., 8., cWP.y);
  float splash = (1. - smoothstep(.2, 2.6, cWP.y)) * vert * (.45 + .55 * gB.g);
  float roofDirt = (1. - vert) * smoothstep(.45, .8, gB.g) * .7;
  float cav = (1. - wAO) * 1.3;
  float dirt = clamp((streak * .85 + splash + roofDirt + cav * .45) * uWeather, 0., 1.);
  dirt = clamp(dirt * (1.2 - hgt * .45), 0., 1.); // settles into low areas first
  alb = mix(alb, alb * vec3(.5, .45, .38), dirt * .8);
  wRough = clamp(wRough + dirt * .08 - streak * uWeather * .12, .04, 1.);
  float moss = (1. - smoothstep(0., 1.4, cWP.y)) * vert * smoothstep(.55, .78, gB.b) * uWeather * step(Lf, 2.5);
  alb = mix(alb, vec3(.12, .16, .07), moss * .6);

  // ---- procedural windows for LOD and debris facades (cFacade.w > 0)
  if (cFacade.w > .5 && vert > .9) {
    vec2 cuv, cid, ws; float edge;
    float m = facadeWindow(fuv, cFacade, cuv, cid, ws, edge);
    if (m > .5) {
      if (edge < .06) { alb = vec3(.05); wRough = .45; wMetal = .6; wN = vec3(0., 0., 1.); }
      else {
        vec3 T = normalize(cross(vec3(0., 1., 0.), N)), V = normalize(cameraPosition - cWP);
        vec3 vT = vec3(dot(V, T), V.y, dot(V, N));
        float mirror = cFacade.w > 2.5 ? .55 : 0.;
        wEmis = interiorRoom(cuv, vT, h31(vec3(cid, cSeed)), ws, uNight) * (1. - mirror * .8);
        alb = mix(vec3(.02), vec3(.1, .16, .22), mirror); wRough = .07; wMetal = mirror * .85; wN = vec3(0., 0., 1.); wAO = 1.;
      }
    } else if (edge > -.14) { float k = clamp(-edge / .14, 0., 1.); alb *= mix(.55, 1., k); wAO *= mix(.7, 1., k); } // reveal shadow
  }
  diffuseColor.rgb *= alb;
}
`;

function dummyNormal() {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  t.needsUpdate = true; return t;
}

export class CityMaterials {
  constructor(lib, lighting) {
    this.lib = lib; this.lighting = lighting;
    this.u = {
      uAlb: { value: null }, uNrm: { value: null }, uGrime: { value: null },
      uTile: { value: pad16((d) => d.meters) }, uMetal: { value: pad16((d) => d.metal) }, uAnti: { value: pad16((d) => d.anti) },
      uWeather: { value: 0.7 }, uNormalStr: { value: 1.0 }, uNight: lighting.uniforms.uNight,
    };
    lib.onChange((l) => { this.u.uAlb.value = l.alb; this.u.uNrm.value = l.nrm; this.u.uGrime.value = l.grime; });
    this.world = this._world();
    this.glass = this._glass();
  }

  _world() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, normalMap: dummyNormal(), envMapIntensity: 0.55 });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.u);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
        .replace('#include <map_fragment>', FRAG_SURFACE)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wRough;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = wMetal;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize(tbn * wN);')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += wEmis;')
        .replace('#include <aomap_fragment>', `reflectedLight.indirectDiffuse *= wAO; reflectedLight.indirectSpecular *= mix(1., wAO, .7);
          reflectedLight.directDiffuse *= mix(1., wAO, .35);`);
      this.lighting.injectSAO(s);
    };
    m.customProgramCacheKey = () => 'city-world-v1';
    return m;
  }

  // window panes of detailed buildings: reflective glass with interior mapping
  // attributes: uv = 0..1 on the pane, aFacade = (bayIndex, floorIndex, width, height), aSeed, aLayer = mirror amount, aTint = glass tint
  _glass() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, envMapIntensity: 0.9 });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.u);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
        .replace('#include <map_fragment>', `float gMirror = cLayer; vec3 gEmis;
          { vec3 N = normalize(cWN), T = normalize(cross(vec3(0., 1., 0.), N)), V = normalize(cameraPosition - cWP);
            vec3 vT = vec3(dot(V, T), V.y, dot(V, N));
            gEmis = interiorRoom(cUv, vT, h31(vec3(cFacade.xy, cSeed)), cFacade.zw, uNight) * (1. - gMirror * .8);
            vec2 e = min(cUv, 1. - cUv) * cFacade.zw; gEmis *= smoothstep(0., .06, min(e.x, e.y)) * .6 + .4; }
          diffuseColor.rgb = mix(vec3(.015, .018, .02), cTint * .28, gMirror);`)
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMirror * .85;')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += gEmis;');
    };
    m.customProgramCacheKey = () => 'city-glass-v1';
    return m;
  }
}
