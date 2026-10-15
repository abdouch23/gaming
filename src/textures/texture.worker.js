import { synthesizeLayer, synthesizeGrime } from './synth.js';

self.onmessage = (e) => {
  const { id, kind, layer, size, seed } = e.data;
  try {
    const t0 = performance.now();
    if (kind === 'grime') {
      const data = synthesizeGrime(size, seed);
      self.postMessage({ id, type: 'done', data, ms: performance.now() - t0 }, [data.buffer]);
      return;
    }
    const out = synthesizeLayer(layer, size, seed, (p) => self.postMessage({ id, type: 'progress', p }));
    self.postMessage({ id, type: 'done', alb: out.alb, nrm: out.nrm, ms: performance.now() - t0 }, [out.alb.buffer, out.nrm.buffer]);
  } catch (err) {
    self.postMessage({ id, type: 'error', msg: String(err && err.stack || err) });
  }
};
