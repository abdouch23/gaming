// Seamless, height-field driven PBR texture synthesis (runs inside Web Workers).
// Every map of a layer is derived from one height field in metres, so albedo / normal /
// roughness / AO stay registered (approach ported from Building_Generator_AAA's worker).
// Output per layer:  alb = RGBA8 (sRGB albedo, normalised height)
//                    nrm = RGBA8 (tangent normal XY, roughness, AO)
import { LAYER_DEFS, L } from '../materials/layers.js';

/* ---------------- hashing & periodic noise ---------------- */
export function hash3(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const rnd = (x, y, s) => hash3(x, y, s) / 4294967296;
const GX = [1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const GY = [0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];
const wrap = (i, p) => ((i % p) + p) % p;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// periodic gradient noise, quintic fade; period px,py in lattice cells. ~[-1,1]
export function pn(x, y, px, py, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const x0 = wrap(ix, px), x1 = wrap(ix + 1, px), y0 = wrap(iy, py), y1 = wrap(iy + 1, py);
  let h = hash3(x0, y0, s) & 7; const a = GX[h] * fx + GY[h] * fy;
  h = hash3(x1, y0, s) & 7; const b = GX[h] * (fx - 1) + GY[h] * fy;
  h = hash3(x0, y1, s) & 7; const c = GX[h] * fx + GY[h] * (fy - 1);
  h = hash3(x1, y1, s) & 7; const d = GX[h] * (fx - 1) + GY[h] * (fy - 1);
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 1.4;
}
// fbm over the unit tile (u,v in [0,1)), integer base frequency keeps it seamless
export function fbm(u, v, fx, fy, oct, s, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * pn(u * fx * f, v * fy * f, fx * f, fy * f, s + i * 131);
    norm += amp; amp *= gain; f *= 2;
  }
  return sum / norm;
}
// periodic Worley: writes F1, F2, cell id (0..1) into out
export function worley(u, v, fx, fy, s, out, jitter = 1) {
  const x = u * fx, y = v * fy, ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, wx = wrap(cx, fx), wy = wrap(cy, fy);
    const px = cx + 0.5 + (rnd(wx, wy, s) - 0.5) * jitter, py = cy + 0.5 + (rnd(wx, wy, s + 1) - 0.5) * jitter;
    const dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; id = rnd(wx, wy, s + 2); } else if (d < f2) f2 = d;
  }
  out[0] = f1; out[1] = f2; out[2] = id;
  return out;
}
// low-frequency fields are evaluated on a coarse periodic grid and sampled bilinearly
function coarse(G, fn) {
  const g = new Float32Array(G * G);
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) g[y * G + x] = fn(x / G, y / G);
  return (u, v) => {
    const x = u * G - 0.5, y = v * G - 0.5, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const x0 = wrap(ix, G), x1 = wrap(ix + 1, G), y0 = wrap(iy, G), y1 = wrap(iy + 1, G);
    const a = g[y0 * G + x0], b = g[y0 * G + x1], c = g[y1 * G + x0], d = g[y1 * G + x1];
    return mix(mix(a, b, fx), mix(c, d, fx), fy);
  };
}

/* ---------------- masonry bond ---------------- */
function makeBond(rows, minW, maxW, seed, running) {
  const R = [];
  for (let r = 0; r < rows; r++) {
    const w = []; let sum = 0, k = 0;
    while (sum < 1 - minW * 0.5) { const x = mix(minW, maxW, rnd(r, k++, seed)); w.push(x); sum += x; }
    const sc = 1 / sum; let acc = 0; const joints = w.map((x) => (acc += x * sc));
    joints[joints.length - 1] = 1;
    R.push({ off: running ? (r & 1) * 0.5 * (joints[0]) : rnd(r, 99, seed), joints });
  }
  return R;
}
// returns block id; out[0]=distance to vertical joint, out[1]=distance to horizontal joint (tile units)
function bondAt(u, v, B, out) {
  const rows = B.length, rv = v * rows, r = wrap(Math.floor(rv), rows), fv = rv - Math.floor(rv);
  const row = B[r]; let uu = u + row.off; uu -= Math.floor(uu);
  const J = row.joints; let k = 0; while (k < J.length - 1 && J[k] < uu) k++;
  const left = k ? J[k - 1] : 0, right = J[k];
  out[0] = Math.min(uu - left, right - uu); out[1] = Math.min(fv, 1 - fv) / rows;
  out[2] = (uu - left) / (right - left); out[3] = fv;
  return r * 977 + k;
}

/* ---------------- post: AO / cavity / normal ---------------- */
function boxBlurWrap(src, dst, N, r, tmp) {
  r = Math.max(1, Math.round(r)); const w = 1 / (2 * r + 1);
  for (let y = 0; y < N; y++) { // horizontal
    const o = y * N; let s = 0;
    for (let i = -r; i <= r; i++) s += src[o + wrap(i, N)];
    for (let x = 0; x < N; x++) { tmp[o + x] = s * w; s += src[o + wrap(x + r + 1, N)] - src[o + wrap(x - r, N)]; }
  }
  for (let x = 0; x < N; x++) { // vertical
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[wrap(i, N) * N + x];
    for (let y = 0; y < N; y++) { dst[y * N + x] = s * w; s += tmp[wrap(y + r + 1, N) * N + x] - tmp[wrap(y - r, N) * N + x]; }
  }
}
function blur(H, N, rPx, A, T) { boxBlurWrap(H, A, N, rPx, T); boxBlurWrap(A, A, N, rPx, T); boxBlurWrap(A, A, N, rPx, T); return A; }

/* ---------------- layer recipes ---------------- */
// Each recipe returns a per-pixel function writing o.h (metres), o.r,o.g,o.b (sRGB 0..1), o.ro (roughness)
const W = new Float32Array(3), W2 = new Float32Array(3), BO = new Float32Array(4);
const pal = (o, c, k = 1) => { o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; };

function recipe(layer, seed, M) {
  const S = seed * 7919 + layer * 101;
  switch (layer) {
    case L.BRICK: {
      const rows = 32, B = makeBond(rows, 1 / 11, 1 / 11, S, true);
      const stain = coarse(128, (u, v) => fbm(u, v, 3, 3, 4, S + 5));
      const reds = [[0.56, 0.24, 0.17], [0.63, 0.31, 0.21], [0.46, 0.2, 0.15], [0.68, 0.4, 0.28], [0.33, 0.15, 0.12], [0.58, 0.28, 0.2]];
      return (u, v, o) => {
        const id = bondAt(u, v, B, BO), eu = BO[0] * M, ev = BO[1] * M, e = Math.min(eu, ev);
        const jw = 0.0055, n = fbm(u, v, 64, 64, 3, S + 1);
        if (e < jw) { // mortar
          o.h = 0.0015 * n; pal(o, [0.6, 0.58, 0.54], 0.9 + 0.1 * n); o.ro = 0.95; return;
        }
        const prof = Math.sqrt(sstep(0, 0.006, e - jw));
        const c = reds[hash3(id, 3, S) % reds.length], k = 0.85 + 0.25 * rnd(id, 4, S) + 0.12 * n + 0.1 * stain(u, v);
        worley(u, v, 180, 180, S + 9, W);
        const pit = W[0] < 0.18 && rnd(id, 7, S) < 0.6 ? 0.0012 : 0;
        o.h = 0.011 * prof + 0.0009 * n - pit; pal(o, c, k);
        if (W[2] < 0.06) { o.r *= 0.7; o.g *= 0.7; o.b *= 0.7; } // burnt speckles
        o.ro = 0.8 + 0.1 * n;
      };
    }
    case L.LIMESTONE: case L.RUSTIC: {
      const rustic = layer === L.RUSTIC, rows = rustic ? 4 : 6;
      const B = makeBond(rows, rustic ? 0.3 : 0.24, rustic ? 0.55 : 0.48, S, true);
      const stain = coarse(128, (u, v) => fbm(u, v, 2, 2, 5, S + 3));
      return (u, v, o) => {
        const id = bondAt(u, v, B, BO), e = Math.min(BO[0], BO[1]) * M;
        const jw = rustic ? 0.012 : 0.004, bev = rustic ? 0.05 : 0.008;
        const n = fbm(u, v, rustic ? 24 : 40, rustic ? 24 : 40, 4, S + 1), st = stain(u, v);
        const tone = 0.92 + 0.1 * rnd(id, 1, S) + 0.06 * st;
        if (e < jw) { o.h = -0.002; pal(o, [0.62, 0.58, 0.5], 0.85); o.ro = 0.95; return; }
        const prof = rustic ? sstep(0, bev, e - jw) : Math.sqrt(sstep(0, bev, e - jw));
        worley(u, v, 90, 90, S + 4, W);
        const chip = (e - jw < 0.03 && W[0] < 0.35) ? 0.004 * (1 - W[0] / 0.35) : 0;
        o.h = (rustic ? 0.03 : 0.01) * prof + (rustic ? 0.004 : 0.0012) * n - chip;
        pal(o, rustic ? [0.68, 0.63, 0.55] : [0.76, 0.7, 0.6], tone);
        if (W[2] < 0.03) { o.r *= 0.85; o.g *= 0.83; o.b *= 0.8; } // fossil speckle
        o.ro = 0.72 + 0.12 * n + (chip ? 0.08 : 0);
      };
    }
    case L.PLASTER: {
      const big = coarse(128, (u, v) => fbm(u, v, 3, 3, 5, S));
      return (u, v, o) => {
        const n = fbm(u, v, 48, 48, 4, S + 1), tr = fbm(u, v, 12, 36, 3, S + 2);
        worley(u, v, 6, 6, S + 3, W);
        const crack = (W[1] - W[0] < 0.025 && big(u, v) > 0.25) ? 1 : 0;
        o.h = 0.0012 * n + 0.0018 * tr - crack * 0.0015;
        const k = 0.95 + 0.05 * big(u, v) + 0.025 * n - crack * 0.25;
        pal(o, [0.88, 0.86, 0.82], k); o.ro = 0.88 + 0.06 * n;
      };
    }
    case L.PRECAST: {
      const blot = coarse(128, (u, v) => fbm(u, v, 4, 4, 5, S));
      return (u, v, o) => {
        const pu = u * 2, pv = v * 2, fu = pu - Math.floor(pu), fv = pv - Math.floor(pv), pid = Math.floor(pu) + Math.floor(pv) * 2;
        const e = Math.min(fu, 1 - fu, fv, 1 - fv) * M / 2, n = fbm(u, v, 64, 64, 3, S + 1);
        // form-tie holes 3x2 per panel
        const hu = fu * 3, hv = fv * 2, du = (hu - Math.floor(hu) - 0.5) * 0.5, dv = (hv - Math.floor(hv) - 0.5) * 0.75;
        const hole = Math.sqrt(du * du + dv * dv) * M < 0.022 ? 1 : 0;
        worley(u, v, 220, 220, S + 2, W);
        const pore = W[0] < 0.12 ? 0.0008 : 0;
        if (e < 0.008) { o.h = -0.006; pal(o, [0.3, 0.3, 0.3]); o.ro = 0.6; return; }
        o.h = 0.001 * n - hole * 0.008 - pore + 0.004 * sstep(0, 0.01, e - 0.008);
        const k = 0.9 + 0.08 * blot(u, v) + 0.06 * rnd(pid, 1, S) + 0.03 * n - hole * 0.4;
        pal(o, [0.62, 0.61, 0.58], k); o.ro = 0.84 + 0.08 * n;
      };
    }
    case L.RUBBLE: {
      return (u, v, o) => {
        worley(u, v, 10, 10, S, W); worley(u, v, 80, 80, S + 1, W2);
        const n = fbm(u, v, 8, 8, 5, S + 2), facet = W[1] - W[0];
        const agg = W2[0] < 0.42 ? 1 : 0;
        o.h = 0.03 * n + 0.012 * Math.min(facet * 3, 1) + agg * 0.003 * (1 - W2[0] / 0.42);
        const g = agg ? (0.45 + 0.3 * W2[2]) : 0.55 + 0.05 * n;
        pal(o, agg ? [g * 1.02, g, g * 0.95] : [g, g * 0.98, g * 0.94]);
        o.ro = 0.95;
      };
    }
    case L.GRAVEL: {
      return (u, v, o) => {
        worley(u, v, 140, 140, S, W);
        const peb = Math.sqrt(clamp01(1 - W[0] / 0.55)), n = fbm(u, v, 16, 16, 4, S + 1);
        o.h = 0.008 * peb + 0.002 * n;
        const g = 0.27 + 0.22 * W[2] + 0.04 * n;
        pal(o, [g, g * 0.97, g * 0.93]); o.ro = 0.88;
      };
    }
    case L.CLAY: {
      const rows = 6, per = 8, moss = coarse(64, (u, v) => fbm(u, v, 3, 3, 4, S + 4));
      return (u, v, o) => {
        const rv = v * rows, r = Math.floor(rv), fv = rv - r, uu = u * per + (r & 1) * 0.5, c = Math.floor(uu), fu = uu - c;
        const id = wrap(r, rows) * 37 + wrap(c, per);
        const arc = Math.sin(Math.PI * fu), gap = sstep(0, 0.05, fu) * sstep(1, 0.95, fu);
        const n = fbm(u, v, 32, 32, 3, S + 1);
        o.h = (0.025 * Math.sqrt(arc) + 0.02 * (1 - fv)) * gap + 0.001 * n; // lip rises toward the row edge
        const k = 0.8 + 0.3 * rnd(id, 2, S) + 0.06 * n;
        pal(o, [0.62, 0.3, 0.18], k * (0.75 + 0.25 * fv));
        const m = sstep(0.3, 0.6, moss(u, v)) * (1 - arc) * 0.6;
        o.r = mix(o.r, 0.2, m); o.g = mix(o.g, 0.24, m); o.b = mix(o.b, 0.12, m);
        o.ro = 0.65 + 0.15 * n + m * 0.2;
      };
    }
    case L.ZINC: {
      const pat = coarse(64, (u, v) => fbm(u, v, 2, 6, 4, S));
      return (u, v, o) => {
        const su = u * 4, fu = su - Math.floor(su), d = Math.min(fu, 1 - fu) * M / 4;
        const seam = 1 - sstep(0.006, 0.014, d), n = fbm(u, v, 8, 8, 3, S + 1);
        o.h = 0.03 * seam + 0.0012 * n;
        const p = pat(u, v);
        pal(o, [0.55, 0.58, 0.6], 0.9 + 0.12 * p); o.ro = 0.38 + 0.12 * p + 0.08 * seam;
      };
    }
    case L.ASPHALT: {
      const wearM = coarse(128, (u, v) => fbm(u, v, 3, 3, 5, S + 3));
      const oil = coarse(128, (u, v) => fbm(u, v, 5, 5, 4, S + 4));
      const crackM = coarse(128, (u, v) => fbm(u, v, 2, 2, 4, S + 5));
      const W3 = new Float32Array(3);
      return (u, v, o) => {
        // aggregate: coarse stones (~2 cm) and fine sand, embedded in dark bitumen
        worley(u, v, 260, 260, S, W); worley(u, v, 720, 720, S + 1, W2);
        const wm = wearM(u, v), expose = 0.3 + 0.35 * sstep(-0.2, 0.5, wm);
        const stone = clamp01(1 - W[0] / expose), sand = clamp01(1 - W2[0] / 0.45);
        const n = fbm(u, v, 96, 96, 2, S + 2);
        let h = 0.0022 * Math.sqrt(stone) + 0.0006 * sand + 0.0003 * n;
        const tone = W[2] > 0.93 ? 0.62 : W[2] > 0.7 ? 0.36 : 0.26 + 0.08 * W[2];
        let g = stone > 0 ? mix(0.07, tone, Math.sqrt(stone)) : mix(0.06, 0.13, sand) + 0.02 * n;
        let ro = stone > 0 ? 0.62 : 0.86;
        // repair patches (axis-aligned rectangles of newer, darker asphalt)
        const pu = u * 3, pv = v * 3, cu = Math.floor(pu), cv = Math.floor(pv), fu = pu - cu, fv = pv - cv, pid = wrap(cu, 3) + wrap(cv, 3) * 3;
        const has = rnd(pid, 11, S) < 0.35, x0 = 0.1 + 0.3 * rnd(pid, 12, S), x1 = x0 + 0.25 + 0.3 * rnd(pid, 13, S), y0 = 0.1 + 0.3 * rnd(pid, 14, S), y1 = y0 + 0.2 + 0.35 * rnd(pid, 15, S);
        const inP = has && fu > x0 && fu < x1 && fv > y0 && fv < y1;
        if (inP) {
          g = stone > 0.4 ? mix(0.05, tone * 0.7, stone) : 0.055 + 0.015 * n; ro = 0.7; h = 0.0012 * stone + 0.001;
          const e = Math.min(fu - x0, x1 - fu, fv - y0, y1 - fv) * M / 3;
          if (e < 0.03) { g = 0.03; ro = 0.35; h += 0.0008; } // sealed seam
        }
        // alligator cracks in old surface + long sealed (tar) cracks
        worley(u, v, 14, 14, S + 6, W3);
        const cm = crackM(u, v);
        const cw = 0.018 * sstep(0.1, 0.45, cm);
        if (!inP && W3[1] - W3[0] < cw) { const k = 1 - (W3[1] - W3[0]) / cw; h -= 0.0015 * k; g *= 1 - 0.5 * k; ro = 0.95; }
        worley(u, v, 3, 3, S + 7, W3);
        if (W3[1] - W3[0] < 0.012 && cm < 0.1) { g = 0.025; ro = 0.3; h = Math.max(h, 0.0016); }
        const ol = sstep(0.4, 0.7, oil(u, v));
        g *= 1 - ol * 0.35; ro -= ol * 0.25;
        g *= 0.92 + 0.16 * sstep(-0.4, 0.6, wm); // sun-bleached areas
        o.h = h; pal(o, [g, g, g * 1.03]); o.ro = clamp01(ro);
      };
    }
    case L.PAVERS: { // 30x15 cm concrete pavers, running bond, with sand joints and stains
      const dirt = coarse(64, (u, v) => fbm(u, v, 3, 3, 4, S + 3));
      const gum = coarse(64, (u, v) => fbm(u, v, 9, 9, 3, S + 6));
      const rows = 13, cols = 6;
      return (u, v, o) => {
        const pv = v * rows, iv = Math.floor(pv), fv = pv - iv, pu = u * cols + (iv & 1) * 0.5, iu = Math.floor(pu), fu = pu - iu;
        const id = wrap(iu, cols) + wrap(iv, rows) * 7;
        const e = Math.min(Math.min(fu, 1 - fu) * M / cols, Math.min(fv, 1 - fv) * M / rows), n = fbm(u, v, 48, 48, 3, S + 1);
        if (e < 0.003) { o.h = -0.004; pal(o, [0.36, 0.33, 0.28], 0.9 + 0.1 * n); o.ro = 0.97; return; }
        const tilt = (rnd(id, 1, S) - 0.5) * 0.004 * (fu - 0.5) + (rnd(id, 2, S) - 0.5) * 0.004 * (fv - 0.5);
        worley(u, v, 220, 220, S + 9, W);
        o.h = 0.003 * Math.sqrt(sstep(0, 0.005, e - 0.003)) + tilt + 0.0005 * n - (W[0] < 0.12 ? 0.0004 : 0);
        const shade = [[0.64, 0.62, 0.58], [0.58, 0.56, 0.53], [0.7, 0.67, 0.62], [0.55, 0.5, 0.46]][hash3(id, 5, S) & 3];
        const k = 0.86 + 0.16 * rnd(id, 3, S) + 0.05 * n - 0.1 * sstep(0, 0.6, dirt(u, v));
        pal(o, shade, k);
        if (gum(u, v) > 0.55 && W[2] < 0.25) { o.r *= 0.55; o.g *= 0.55; o.b *= 0.55; } // gum / stains
        o.ro = 0.8 + 0.1 * n;
      };
    }
    case L.CURB: {
      return (u, v, o) => {
        worley(u, v, 120, 120, S, W);
        const n = fbm(u, v, 16, 16, 3, S + 1), e = Math.min(u, 1 - u) * M;
        const sp = W[2], g = sp < 0.12 ? 0.18 : sp > 0.9 ? 0.85 : 0.55 + 0.1 * n;
        o.h = 0.0006 * n - (e < 0.004 ? 0.003 : 0);
        pal(o, [g * 1.03, g, g * 0.98]); o.ro = 0.55 + 0.15 * n;
      };
    }
    case L.GRASS: {
      const dry = coarse(64, (u, v) => fbm(u, v, 3, 3, 4, S + 3));
      return (u, v, o) => {
        const b1 = fbm(u, v, 200, 60, 2, S), b2 = fbm(u, v, 60, 220, 2, S + 1), n = fbm(u, v, 12, 12, 4, S + 2);
        const blade = Math.max(b1, b2), d = sstep(0.1, 0.5, dry(u, v));
        o.h = 0.01 * blade + 0.004 * n;
        const k = 0.65 + 0.35 * clamp01(blade * 0.5 + 0.5);
        o.r = mix(0.2, 0.5, d) * k; o.g = mix(0.38, 0.45, d) * k; o.b = mix(0.1, 0.2, d) * k;
        if (n < -0.45) { o.r = 0.32; o.g = 0.26; o.b = 0.18; } // bare soil
        o.ro = 0.92;
      };
    }
    case L.METAL: {
      const rust = coarse(64, (u, v) => fbm(u, v, 4, 4, 5, S + 2));
      return (u, v, o) => {
        const sc = fbm(u, v, 4, 140, 2, S), n = fbm(u, v, 24, 24, 3, S + 1);
        const scratch = sc > 0.55 ? 1 : 0, r = sstep(0.45, 0.65, rust(u, v));
        o.h = 0.0003 * n - scratch * 0.0002 + r * 0.0008;
        pal(o, [0.085, 0.09, 0.095]);
        if (scratch) pal(o, [0.42, 0.43, 0.44]);
        o.r = mix(o.r, 0.32, r); o.g = mix(o.g, 0.16, r); o.b = mix(o.b, 0.08, r);
        o.ro = 0.35 + 0.1 * n + r * 0.5 - scratch * 0.1;
      };
    }
    case L.WOOD: {
      return (u, v, o) => {
        const pl = u * 6, ip = Math.floor(pl), fp = pl - ip, e = Math.min(fp, 1 - fp) * M / 6;
        const grain = fbm(u + rnd(ip, 1, S), v, 40, 3, 4, S), n = fbm(u, v, 30, 30, 2, S + 1);
        o.h = e < 0.003 ? -0.003 : 0.001 * grain + 0.0004 * n;
        const k = 0.75 + 0.2 * grain + 0.15 * rnd(ip, 2, S);
        pal(o, [0.46, 0.36, 0.26], k); o.ro = 0.8;
      };
    }
  }
  throw new Error('unknown layer ' + layer);
}

/* ---------------- main entry ---------------- */
export function synthesizeLayer(layer, N, seed = 1, onProgress) {
  const M = LAYER_DEFS[layer].meters, fn = recipe(layer, seed, M);
  const NN = N * N, H = new Float32Array(NN), A = new Float32Array(NN), T = new Float32Array(NN);
  const alb = new Uint8ClampedArray(NN * 4), nrm = new Uint8ClampedArray(NN * 4);
  const o = { h: 0, r: 0, g: 0, b: 0, ro: 0 };
  for (let y = 0; y < N; y++) {
    const v = (y + 0.5) / N;
    for (let x = 0; x < N; x++) {
      fn((x + 0.5) / N, v, o);
      const i = y * N + x, j = i * 4;
      H[i] = o.h; alb[j] = o.r * 255; alb[j + 1] = o.g * 255; alb[j + 2] = o.b * 255; nrm[j + 2] = o.ro * 255;
    }
    if (onProgress && (y & 63) === 0) onProgress(y / N * 0.8);
  }
  const texel = M / N, sc = (m) => m / texel;
  // multi-scale AO from height (cavities, crevices), curvature for edge wear / dirt
  const B1 = blur(H, N, sc(0.03), A, T), occ1 = new Float32Array(NN), cav = new Float32Array(NN);
  for (let i = 0; i < NN; i++) { occ1[i] = Math.max(0, B1[i] - H[i]); cav[i] = H[i] - B1[i]; }
  const B2 = blur(H, N, sc(0.15), A, T);
  let cmax = 1e-6; for (let i = 0; i < NN; i += 7) cmax = Math.max(cmax, Math.abs(cav[i]));
  let hmin = 1e9, hmax = -1e9; for (let i = 0; i < NN; i++) { if (H[i] < hmin) hmin = H[i]; if (H[i] > hmax) hmax = H[i]; }
  const hr = 1 / Math.max(1e-6, hmax - hmin);
  for (let i = 0; i < NN; i++) {
    const j = i * 4, ao = 1 - Math.min(0.85, 2.2 * occ1[i] / 0.03 + 1.2 * Math.max(0, B2[i] - H[i]) / 0.15);
    const c = cav[i] / cmax; // >0 convex edge, <0 crevice
    const k = (1 + Math.max(0, c) * 0.12) * (1 - Math.max(0, -c) * 0.25) * (0.75 + 0.25 * ao);
    alb[j] *= k; alb[j + 1] *= k; alb[j + 2] *= k; alb[j + 3] = (H[i] - hmin) * hr * 255;
    nrm[j + 3] = ao * 255;
    nrm[j + 2] = Math.min(255, nrm[j + 2] + Math.max(0, -c) * 20);
  }
  if (onProgress) onProgress(0.9);
  // tangent-space normal from the metric height field (central differences, wrapped)
  const ks = 1 / (2 * texel);
  for (let y = 0; y < N; y++) {
    const ym = wrap(y - 1, N) * N, yp = wrap(y + 1, N) * N, yo = y * N;
    for (let x = 0; x < N; x++) {
      const xm = wrap(x - 1, N), xp = wrap(x + 1, N);
      const dx = (H[yo + xp] - H[yo + xm]) * ks, dy = (H[yp + x] - H[ym + x]) * ks;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1), j = (yo + x) * 4;
      nrm[j] = (-dx * il * 0.5 + 0.5) * 255; nrm[j + 1] = (-dy * il * 0.5 + 0.5) * 255;
    }
  }
  return { alb, nrm };
}

// Weathering masks, world-projected in the material: R rain streaks, G dirt blotches, B fine grit, A macro variation
export function synthesizeGrime(N = 512, seed = 1) {
  const out = new Uint8ClampedArray(N * N * 4), S = seed * 31;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N, j = (y * N + x) * 4;
    const streak = clamp01(0.5 + 0.5 * fbm(u, v, 24, 2, 4, S) + 0.25 * fbm(u, v, 64, 4, 2, S + 1));
    out[j] = sstep(0.45, 0.85, streak) * 255;
    out[j + 1] = clamp01(0.5 + 0.6 * fbm(u, v, 4, 4, 6, S + 2)) * 255;
    out[j + 2] = clamp01(0.5 + 0.7 * fbm(u, v, 32, 32, 3, S + 3)) * 255;
    out[j + 3] = clamp01(0.5 + 0.5 * fbm(u, v, 2, 2, 5, S + 4)) * 255;
  }
  return out;
}
