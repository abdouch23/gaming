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
  float lit=step(h21(vec2(seed,3.3)),mix(.28,.48,night));
  vec3 lightCol=mix(vec3(1.,.78,.5),vec3(.85,.92,1.),step(.65,h21(vec2(seed,4.4))));
  return col*mix(vec3(.07),lightCol*mix(.75,2.4,night),lit)*mix(uDay,1.,night)+col*(1.-night)*uDay*.35;
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
uniform float uTaaFrame, uWeather, uDay, uNormalStr, uNight, uWet, uDetail, uPom[16], uPomOn, uLodDist, uLodBand;
flat varying float cLayer; flat varying vec4 cFacade; flat varying float cSeed;
varying vec2 cUv; varying vec3 cTint; varying vec3 cWP; varying vec3 cWN;
` + COMMON_GLSL;

const FRAG_SURFACE = /* glsl */`
float wRough, wMetal, wAO; vec3 wN, wEmis = vec3(0.);
{
  int Li = int(cLayer + .5); float Lf = float(Li);
  vec2 tuv = cUv / uTile[Li];
  vec3 N = normalize(cWN); float vert = 1. - abs(N.y), hor = smoothstep(.7, .95, N.y);
  float camD = length(cameraPosition - cWP);
  #if defined(LOD_DETAIL) || defined(LOD_FADEOUT)
  { // dithered cross-fade between LOD0 and LOD1 (complementary per pixel, no popping)
    float x = clamp((camD - (uLodDist - uLodBand)) / uLodBand, 0., 1.);
    // interleaved gradient noise, rotated every frame so TAA integrates it into a smooth blend
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))) + uTaaFrame * .61803);
    #ifdef LOD_DETAIL
    if (n < x) discard;
    #else
    if (n >= x) discard;
    #endif
  }
  #endif
  // parallax occlusion mapping: virtual micro-geometry on near surfaces (layer height in alb.a)
  float pomD = uPom[Li] * uPomOn;
  if (pomD > 0. && camD < 28.) {
    vec3 dp1 = dFdx(cWP), dp2 = dFdy(cWP); vec2 du1 = dFdx(cUv), du2 = dFdy(cUv);
    vec3 p2 = cross(dp2, N), p1 = cross(N, dp1);
    vec3 Tg = p2 * du1.x + p1 * du2.x, Bg = p2 * du1.y + p1 * du2.y;
    float im = inversesqrt(max(max(dot(Tg, Tg), dot(Bg, Bg)), 1e-12)); Tg *= im; Bg *= im;
    vec3 Vw = normalize(cameraPosition - cWP), Vt = vec3(dot(Vw, Tg), dot(Vw, Bg), dot(Vw, N));
    float fade = 1. - smoothstep(16., 28., camD);
    vec2 shift = Vt.xy / max(Vt.z, .2) * pomD / uTile[Li] * fade;
    vec2 gx = dFdx(tuv), gy = dFdy(tuv);
    float nL = mix(22., 8., camD / 28.), step1 = 1. / nL, cur = 0.;
    vec2 uvP = tuv, prevUv = tuv; float depthAt = 1. - textureGrad(uAlb, vec3(tuv, Lf), gx, gy).a, prevD = depthAt;
    for (int i = 0; i < 24; i++) {
      if (cur >= depthAt || float(i) >= nL) break;
      prevUv = uvP; prevD = depthAt - cur;
      uvP -= shift * step1; cur += step1;
      depthAt = 1. - textureGrad(uAlb, vec3(uvP, Lf), gx, gy).a;
    }
    float after = depthAt - cur, w = after / (after - prevD + 1e-5);
    tuv = mix(uvP, prevUv, clamp(w, 0., 1.));
  }
  vec4 gM = texture2D(uGrime, cWP.xz * (1. / 83.) + cWP.y * (1. / 131.));
  vec4 A = texture(uAlb, vec3(tuv, Lf)), Nn = texture(uNrm, vec3(tuv, Lf));
  if (uAnti[Li] > .5) { // anti-tiling: blend a rotated, rescaled second sample through a macro mask
    vec2 t2 = mat2(.8, -.6, .6, .8) * tuv * .63 + vec2(.37, .71);
    float b = smoothstep(.38, .62, gM.g);
    A = mix(A, texture(uAlb, vec3(t2, Lf)), b); Nn = mix(Nn, texture(uNrm, vec3(t2, Lf)), b);
  }
  // close-range detail: same layer at ~4.4x frequency, faded out with distance
  float dF = (1. - smoothstep(6., 34., camD)) * uDetail;
  if (dF > .01) {
    vec2 duv = mat2(.6, .8, -.8, .6) * tuv * 4.37 + .5;
    vec4 Ad = texture(uAlb, vec3(duv, Lf)), Nd = texture(uNrm, vec3(duv, Lf));
    A.rgb *= mix(1., .72 + .56 * Ad.a, dF * .55);
    Nn.rg = mix(Nn.rg, clamp(Nn.rg + (Nd.rg - .5) * .7, 0., 1.), dF);
    Nn.a *= mix(1., .8 + .2 * Nd.a, dF);
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
  float roofDirt = (1. - vert) * smoothstep(.45, .8, gB.g) * .7 * step(1., cWP.y);
  float cav = (1. - wAO) * 1.3;
  float dirt = clamp((streak * .85 + splash + roofDirt + cav * (Li == 9 ? .12 : .45)) * uWeather, 0., 1.); // 9 = asphalt
  dirt = clamp(dirt * (1.2 - hgt * .45), 0., 1.); // settles into low areas first
  alb = mix(alb, alb * vec3(.66, .6, .52), dirt * .7);
  wRough = clamp(wRough + dirt * .08 - streak * uWeather * .12, .04, 1.);
  float moss = (1. - smoothstep(0., 1.4, cWP.y)) * vert * smoothstep(.55, .78, gB.b) * uWeather * step(Lf, 2.5);
  alb = mix(alb, vec3(.12, .16, .07), moss * .6);
  float puddleBias = 0.;

  // ---- road surface: markings, crosswalks, stop lines, tyre tracks, oil, gutter grime
  if (cFacade.w < -.5) {
    int fl = int(-cFacade.w - 1. + .5);
    bool ave = (fl & 1) != 0, xa = (fl & 2) != 0, xb = (fl & 4) != 0;
    float u = cUv.x, v = cUv.y, len = cFacade.x, hw = cFacade.y * .5, lanes = cFacade.z;
    float park = cFacade.y >= 11. ? 2.5 : 0., laneW = (hw - park) / lanes, au = abs(u);
    float aa = max(fwidth(u), fwidth(v)) * .75 + .004;
    float dStart = v, dEnd = len - v;
    bool zoneA = xa && dStart < 5.2, zoneB = xb && dEnd < 5.2;
    // tyre tracks & oil drip line per driving lane
    if (au < hw - park) {
      float ll = mod(au, laneW) - laneW * .5;
      float tt = exp(-pow((abs(ll) - .85) / .33, 2.));
      float oil = exp(-pow(ll / .45, 2.)) * smoothstep(.35, .75, gB.g);
      alb *= (1. - .16 * tt) * (1. - .28 * oil);
      wRough = clamp(wRough - .14 * tt - .22 * oil, .05, 1.);
    } else alb *= .95 + .05 * gB.b; // parking lane: patchier
    float gut = smoothstep(hw - .9, hw - .1, au);
    alb = mix(alb, alb * vec3(.62, .58, .52), gut * .7); wRough = mix(wRough, .95, gut * .4); puddleBias += gut * .3;
    // paint
    float paintW = 0., paintY = 0.;
    float band12 = 1. - smoothstep(.06 - aa, .06 + aa, abs(au - .2));
    if (!zoneA && !zoneB) {
      if (ave) paintY = max(paintY, band12);
      else { float dash = step(fract(v / 9.), .38); paintY = max(paintY, (1. - smoothstep(.07 - aa, .07 + aa, au)) * dash); }
      for (int k = 1; k < 4; k++) {
        if (float(k) >= lanes) break;
        float x = float(k) * laneW, dash = step(fract(v / 9. + .3), .33);
        paintW = max(paintW, (1. - smoothstep(.065 - aa, .065 + aa, abs(au - x))) * dash);
      }
      if (park > 0.) paintW = max(paintW, 1. - smoothstep(.06 - aa, .06 + aa, abs(au - (hw - park))));
    }
    for (int e = 0; e < 2; e++) {
      bool on = e == 0 ? xa : xb; if (!on) continue;
      float d = e == 0 ? dStart : dEnd;
      // zebra crossing (bars parallel to traffic)
      float zebra = step(fract(u / 1.1 + .25), .5) * step(au, hw - .5);
      float inZ = smoothstep(.8 - aa, .8 + aa, d) * (1. - smoothstep(3.9 - aa, 3.9 + aa, d));
      paintW = max(paintW, zebra * inZ);
      // stop line on the approaching side (right-hand traffic)
      bool approach = e == 1 ? u > 0. : u < 0.;
      float sl = (1. - smoothstep(.22 - aa, .22 + aa, abs(d - 4.75))) * step(.1, au) * step(au, hw - park);
      if (approach) paintW = max(paintW, sl);
    }
    float wear = smoothstep(.15, .55, gB.b * .7 + texture2D(uGrime, vec2(u, v) / 2.1).g * .6);
    float paint = max(paintW, paintY) * wear;
    vec3 pc = paintY > paintW ? vec3(.8, .56, .1) : vec3(.82, .82, .78);
    alb = mix(alb, pc * (.85 + .15 * gB.a), paint);
    wRough = mix(wRough, .5, paint); wN = normalize(mix(wN, vec3(0., 0., 1.), paint * .7));
  }

  // ---- wetness and puddles (rain)
  if (uWet > .001) {
    float wetH = uWet * hor;
    alb *= mix(1., .58, wetH);
    wRough = mix(wRough, wRough * .35, wetH);
    float pm = gB.g * .55 + (1. - hgt) * .3 + puddleBias + texture2D(uGrime, cWP.xz / 31.).g * .3;
    float puddle = smoothstep(.9 - uWet * .42, .94 - uWet * .42, pm) * hor * step(cWP.y, .5);
    alb *= mix(1., .35, puddle); wRough = mix(wRough, .02, puddle); wN = normalize(mix(wN, vec3(0., 0., 1.), puddle)); wAO = mix(wAO, 1., puddle);
    float wetV = uWet * vert * (.35 + .65 * gS.r); alb *= mix(1., .75, wetV); wRough = mix(wRough, wRough * .6, wetV);
  }

  // ---- procedural windows for LOD and debris facades (cFacade.w > 0), pre-filtered:
  // edges are anti-aliased over one pixel footprint, and when the window grid approaches pixel size the
  // pattern fades into its average (frequency clamping) instead of producing moire.
  vec2 fwF = fwidth(fuv); float pxm = max(max(fwF.x, fwF.y), 1e-4); // metres per pixel (uniform control flow)
  if (cFacade.w > .5 && vert > .9) {
    vec2 cuv, cid, ws; float edge;
    facadeWindow(fuv, cFacade, cuv, cid, ws, edge);
    float rowH = cid.y < .5 ? cFacade.z : cFacade.y;
    float farF = smoothstep(.1, .35, pxm / min(cFacade.x, rowH));
    float cov = mix(smoothstep(-pxm, pxm, edge), ws.x * ws.y / (cFacade.x * rowH), farF);
    float frameK = mix(1. - smoothstep(.06 - pxm, .06 + pxm, edge), .22, farF);
    vec3 T = normalize(cross(vec3(0., 1., 0.), N)), V = normalize(cameraPosition - cWP);
    vec3 vT = vec3(dot(V, T), V.y, dot(V, N));
    float mirror = cFacade.w > 2.5 ? .55 : 0.;
    vec3 gE = interiorRoom(mix(clamp(cuv, 0., 1.), vec2(.5), farF), vT, h31(vec3(cid, cSeed)), ws, uNight) * (1. - mirror * .8);
    vec3 gA = mix(mix(vec3(.02), vec3(.1, .16, .22), mirror), vec3(.05), frameK);
    float gR = mix(.07, .45, frameK), gM = mix(mirror * .85, .6, frameK);
    float rv = (1. - farF) * (1. - clamp(-edge / .14, 0., 1.)) * (1. - cov); // reveal shadow around the opening
    alb *= mix(1., .55, rv); wAO *= mix(1., .7, rv);
    alb = mix(alb, gA, cov); wRough = mix(wRough, gR, cov); wMetal = mix(wMetal, gM, cov);
    wN = normalize(mix(wN, vec3(0., 0., 1.), cov)); wAO = mix(wAO, 1., cov);
    wEmis = gE * cov * (1. - frameK);
  }
  // specular anti-aliasing: normal-map variance across the pixel raises roughness (no sparkle at distance)
  { vec3 dn = fwidth(wN); wRough = sqrt(clamp(wRough * wRough + min(dot(dn, dn) * 2., .25), 0., 1.)); }
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
      uWeather: { value: 0.5 }, uDay: { value: 0.6 }, uNormalStr: { value: 1.0 }, uNight: lighting.uniforms.uNight, uWet: { value: 0 }, uDetail: { value: 1 },
      uTaaFrame: { value: 0 }, uPom: { value: pad16((d) => d.pom || 0) }, uPomOn: { value: 1 }, uLodDist: { value: 320 }, uLodBand: { value: 40 },
    };
    lib.onChange((l) => { this.u.uAlb.value = l.alb; this.u.uNrm.value = l.nrm; this.u.uGrime.value = l.grime; });
    this.world = this._world();
    this.worldDetail = this._world('LOD_DETAIL');   // LOD0 chunks
    this.worldFadeOut = this._world('LOD_FADEOUT'); // LOD1 chunks whose LOD0 is ready
    this.glass = this._glass();
  }

  _world(define) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, normalMap: CityMaterials._dn || (CityMaterials._dn = dummyNormal()), envMapIntensity: 0.55 });
    if (define) m.defines = { [define]: '' };
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
    m.customProgramCacheKey = () => 'city-world-v3' + (define || '');
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
      this.lighting.injectSAO(s);
    };
    m.customProgramCacheKey = () => 'city-glass-v3';
    return m;
  }
}
