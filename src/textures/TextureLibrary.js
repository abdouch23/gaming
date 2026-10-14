// Worker-pool driven texture library: builds two DataArrayTextures (albedo+height, normal+rough+AO)
// holding every material layer, so the whole city shares one material and a handful of draw calls.
import * as THREE from 'three';
import { LAYER_COUNT } from '../materials/layers.js';
import { synthesizeLayer, synthesizeGrime } from './synth.js';

export function estimateVRAM(size) {
  return (2 * LAYER_COUNT * size * size * 4 * 4 / 3) / (1024 * 1024); // two arrays + mip chain, MB
}

export class TextureLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = 0;
    this.grime = null;
    this.alb = null;
    this.nrm = null;
    this.listeners = new Set();
    this._jobId = 0;
    this._workers = [];
    this._noWorker = false;
  }

  _makeWorkers(n) {
    this._workers.forEach((w) => w.terminate());
    this._workers = [];
    if (this._noWorker) return;
    try {
      for (let i = 0; i < n; i++) this._workers.push(new Worker(new URL('./texture.worker.js', import.meta.url), { type: 'module' }));
    } catch (e) {
      console.warn('Workers unavailable, using main thread', e);
      this._noWorker = true;
    }
  }

  _runOnWorker(w, msg, onProgress) {
    return new Promise((resolve, reject) => {
      w.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'progress') onProgress && onProgress(d.p);
        else if (d.type === 'done') resolve(d);
        else reject(new Error(d.msg));
      };
      w.onerror = (e) => reject(e);
      w.postMessage(msg);
    });
  }

  async _runSync(msg) {
    await new Promise((r) => setTimeout(r, 0));
    if (msg.kind === 'grime') return { data: synthesizeGrime(msg.size, msg.seed) };
    return synthesizeLayer(msg.layer, msg.size, msg.seed);
  }

  /** Generate every layer at the given resolution. onProgress(fraction, label) */
  async generate(size, seed = 1, onProgress = () => {}) {
    const t0 = performance.now();
    const cores = navigator.hardwareConcurrency || 4;
    // 4K layers need ~0.5 GB scratch per worker: generate them one at a time
    const poolSize = size >= 4096 ? 1 : size >= 2048 ? Math.min(2, cores) : Math.max(1, Math.min(4, cores - 1));
    this._makeWorkers(poolSize);

    const albData = new Uint8Array(size * size * 4 * LAYER_COUNT);
    const nrmData = new Uint8Array(size * size * 4 * LAYER_COUNT);
    const layerProg = new Float32Array(LAYER_COUNT + 1);
    const report = (label) => onProgress(layerProg.reduce((a, b) => a + b, 0) / (LAYER_COUNT + 1), label);

    const jobs = [{ kind: 'grime', size: 512, seed, slot: LAYER_COUNT }];
    for (let l = 0; l < LAYER_COUNT; l++) jobs.push({ kind: 'layer', layer: l, size, seed, slot: l });
    let grimeData = null;

    const handle = (job, res) => {
      if (job.kind === 'grime') grimeData = res.data;
      else {
        const off = job.layer * size * size * 4;
        albData.set(res.alb, off); nrmData.set(res.nrm, off);
      }
      layerProg[job.slot] = 1; report(job.kind === 'grime' ? 'masks' : 'layer ' + job.layer);
    };

    if (this._workers.length) {
      const queue = jobs.slice();
      await Promise.all(this._workers.map(async (w) => {
        while (queue.length) {
          const job = queue.shift();
          let res;
          try {
            res = await this._runOnWorker(w, { id: ++this._jobId, ...job }, (p) => { layerProg[job.slot] = p; report(); });
          } catch (e) {
            console.warn('worker failed, falling back to main thread', e);
            res = await this._runSync(job);
          }
          handle(job, res);
        }
      }));
      this._makeWorkers(0);
    } else {
      for (const job of jobs) handle(job, await this._runSync(job));
    }

    // average linear albedo per layer (Lumina's surface cache)
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    this.avgAlbedo = [];
    for (let l = 0; l < LAYER_COUNT; l++) {
      const off = l * size * size * 4, n = size * size, s = [0, 0, 0]; let k = 0;
      for (let i = 0; i < n; i += 97) { const j = off + i * 4; s[0] += lin(albData[j]); s[1] += lin(albData[j + 1]); s[2] += lin(albData[j + 2]); k++; }
      this.avgAlbedo.push(s.map((x) => x / k));
    }
    this._install(size, albData, nrmData, grimeData);
    this.genMs = performance.now() - t0;
    return this;
  }

  _install(size, albData, nrmData, grimeData) {
    const R = this.renderer, aniso = R.capabilities.getMaxAnisotropy();
    const mk = (data, srgb) => {
      const t = new THREE.DataArrayTexture(data, size, size, LAYER_COUNT);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true; t.anisotropy = Math.min(8, aniso);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      // the GPU owns the pixels after upload: drop the CPU copy (up to 1 GB at 4K)
      t.onUpdate = () => { t.image.data = null; };
      return t;
    };
    const newAlb = mk(albData, true), newNrm = mk(nrmData, false);
    const g = new THREE.DataTexture(grimeData, 512, 512, THREE.RGBAFormat, THREE.UnsignedByteType);
    g.wrapS = g.wrapT = THREE.RepeatWrapping; g.minFilter = THREE.LinearMipmapLinearFilter; g.magFilter = THREE.LinearFilter;
    g.generateMipmaps = true; g.anisotropy = 4; g.needsUpdate = true;

    const old = [this.alb, this.nrm, this.grime];
    this.alb = newAlb; this.nrm = newNrm; this.grime = g; this.size = size;
    this.listeners.forEach((fn) => fn(this));
    old.forEach((t) => t && t.dispose());
  }

  onChange(fn) { this.listeners.add(fn); if (this.alb) fn(this); }
}
