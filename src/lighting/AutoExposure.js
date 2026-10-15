// Eye adaptation (auto exposure), fully on the GPU: a 1x1 ping-pong target holds the adapted average
// log-luminance; this pass measures the HDR frame, adapts over time, and writes the exposed image.
// Runs before bloom so bloom thresholds see exposed values (as in Unreal's pipeline).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}';

export class AutoExposurePass extends Pass {
  constructor() {
    super();
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rts = [rt(), rt()]; this.cur = 0; this.snap = true;
    this.u = {
      tDiffuse: { value: null }, tPrev: { value: null }, uDt: { value: 0.016 }, uSnap: { value: 1 },
      uUp: { value: 2.2 }, uDown: { value: 1.1 }, uKey: { value: 0.092 }, uMinE: { value: 0.3 }, uMaxE: { value: 6 },
      tAdapt: { value: null },
    };
    // measure: center-weighted average of log luminance (16x16 taps), clamped so the sun disc can't dominate
    this.measure = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tDiffuse,tPrev;uniform float uDt,uSnap,uUp,uDown;varying vec2 v;
        void main(){float s=0.,w=0.;
          for(int j=0;j<16;j++)for(int i=0;i<16;i++){vec2 q=(vec2(float(i),float(j))+.5)/16.;
            float k=1.-.7*length((q-vec2(.5,.45))*vec2(1.,1.3));
            float l=dot(texture2D(tDiffuse,q).rgb,vec3(.2126,.7152,.0722));s+=log(clamp(l,1e-4,6.))*k;w+=k;}
          float cur=s/w,prev=texture2D(tPrev,vec2(.5)).r;
          float rate=cur>prev?uUp:uDown;
          gl_FragColor=vec4(uSnap>.5?cur:mix(prev,cur,1.-exp(-uDt*rate)),0.,0.,1.);}`,
    }));
    this.apply = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tDiffuse,tAdapt;uniform float uKey,uMinE,uMaxE;varying vec2 v;
        void main(){vec4 c=texture2D(tDiffuse,v);float avg=exp(texture2D(tAdapt,vec2(.5)).r);
          gl_FragColor=vec4(c.rgb*clamp(uKey/avg,uMinE,uMaxE),c.a);}`,
    }));
    this._t = performance.now();
  }

  reset() { this.snap = true; }

  render(renderer, writeBuffer, readBuffer) {
    const now = performance.now(), u = this.u;
    u.uDt.value = Math.min(0.25, (now - this._t) / 1000); this._t = now;
    u.tDiffuse.value = readBuffer.texture;
    u.tPrev.value = this.rts[this.cur].texture; u.uSnap.value = this.snap ? 1 : 0; this.snap = false;
    this.cur = 1 - this.cur;
    renderer.setRenderTarget(this.rts[this.cur]); this.measure.render(renderer);
    u.tAdapt.value = this.rts[this.cur].texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.apply.render(renderer);
  }

  setSize() {}
  dispose() { this.rts.forEach((r) => r.dispose()); this.measure.dispose(); this.apply.dispose(); }
}
