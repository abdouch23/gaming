// Synthesized night ambience for the douar: wind, distant dogs, an owl, footsteps. No external assets.

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function makeNoise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

export type Surface = "gravel" | "dirt" | "stone" | "water";

export class NightAudio {
  protected ctx: AudioContext | null = null;
  protected master: GainNode | null = null;
  protected reverb: ConvolverNode | null = null;
  protected white: AudioBuffer | null = null;
  protected timers: number[] = [];
  protected running = false;
  protected windGain: GainNode | null = null;

  protected build(ctx: AudioContext) {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 3.5, 3);
    const rg = ctx.createGain();
    rg.gain.value = 0.7;
    reverb.connect(rg).connect(master);
    this.white = makeNoise(ctx, 2, false);

    // Wind: brown noise through a wandering band-pass, slowly swelling and panning
    const wind = ctx.createBufferSource();
    wind.buffer = makeNoise(ctx, 8, true);
    wind.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 450;
    bp.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.28;
    const pan = ctx.createStereoPanner();
    wind.connect(bp).connect(wg).connect(pan).connect(master);
    wind.start();
    const lfo = (freq: number, amount: number, target: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = amount;
      o.connect(g).connect(target);
      o.start();
    };
    lfo(0.06, 260, bp.frequency);
    lfo(0.09, 0.14, wg.gain);
    lfo(0.03, 0.6, pan.pan);

    // Thin whistle over ridges
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.white;
    hiss.loop = true;
    const hb = ctx.createBiquadFilter();
    hb.type = "bandpass";
    hb.frequency.value = 1700;
    hb.Q.value = 9;
    const hg = ctx.createGain();
    hg.gain.value = 0.02;
    hiss.connect(hb).connect(hg).connect(master);
    hiss.start();
    lfo(0.04, 500, hb.frequency);
    lfo(0.07, 0.018, hg.gain);

    this.master = master;
    this.windGain = wg;
    this.reverb = reverb;
  }

  protected schedule(fn: () => void, min: number, max: number) {
    const id = window.setTimeout(() => {
      if (!this.running) return;
      fn();
      this.schedule(fn, min, max);
    }, min + Math.random() * (max - min));
    this.timers.push(id);
  }

  protected bark(t: number, pitch: number, pan: number, distance: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(pitch * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.7, t + 0.14);
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 850;
    f.Q.value = 1.4;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600 - distance * 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * (1 - distance * 0.6), t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(f);
    n.connect(ng).connect(f);
    f.connect(lp).connect(g).connect(p);
    p.connect(this.reverb!);
    const dry = ctx.createGain();
    dry.gain.value = 0.25;
    p.connect(dry).connect(this.master!);
    o.start(t);
    o.stop(t + 0.25);
    n.start(t, Math.random());
    n.stop(t + 0.25);
  }

  private dogs = () => {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const pitch = 300 + Math.random() * 260;
    const pan = Math.random() * 1.8 - 0.9;
    const dist = 0.5 + Math.random() * 0.5;
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.bark(t0 + i * (0.32 + Math.random() * 0.3), pitch * (0.95 + Math.random() * 0.1), pan, dist);
  };

  private owl = () => {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const pan = Math.random() * 1.4 - 0.7;
    for (const [dt, len] of [[0, 0.35], [0.55, 0.7]] as const) {
      const t = t0 + dt;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(390, t);
      o.frequency.linearRampToValueAtTime(350, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p);
      p.connect(this.reverb!);
      p.connect(this.master!);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  };

  /** One footstep; loudness 0..1.5 (crouch → run). */
  step(surface: Surface, loudness: number) {
    const ctx = this.ctx;
    if (!ctx || !this.running || !this.white) return;
    const t = ctx.currentTime;
    const grains = surface === "gravel" ? 4 : surface === "water" ? 2 : 1;
    for (let i = 0; i < grains; i++) {
      const s = ctx.createBufferSource();
      s.buffer = this.white;
      const f = ctx.createBiquadFilter();
      if (surface === "gravel") {
        f.type = "bandpass";
        f.frequency.value = 2200 + Math.random() * 1800;
        f.Q.value = 0.9;
      } else if (surface === "stone") {
        f.type = "bandpass";
        f.frequency.value = 1100;
        f.Q.value = 2.5;
      } else if (surface === "water") {
        f.type = "bandpass";
        f.frequency.value = 700 + Math.random() * 600;
        f.Q.value = 4;
      } else {
        f.type = "lowpass";
        f.frequency.value = 520;
      }
      const g = ctx.createGain();
      const start = t + i * 0.018 + Math.random() * 0.01;
      const peak = (surface === "gravel" ? 0.22 : surface === "dirt" ? 0.5 : 0.25) * loudness;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + (surface === "dirt" ? 0.12 : 0.06));
      s.connect(f).connect(g).connect(this.master!);
      s.start(start, Math.random() * 1.5, 0.2);
    }
  }

  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.build(this.ctx);
    }
    await this.ctx.resume();
    if (this.running) return;
    this.running = true;
    const t = this.ctx.currentTime;
    this.master!.gain.cancelScheduledValues(t);
    this.master!.gain.setTargetAtTime(0.9, t, 0.8);
    this.schedule(this.dogs, 5000, 16000);
    this.schedule(this.owl, 18000, 40000);
  }

  stop() {
    this.running = false;
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.25);
    }
  }

  dispose() {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
  }
}
