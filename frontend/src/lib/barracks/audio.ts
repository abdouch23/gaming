// Chapter II sound: Chapter I's night ambience + synthesized combat and alarm cues.
import { NightAudio } from "@/lib/night/audio";

export class BarracksAudio extends NightAudio {
  private siren: { osc: OscillatorNode; gain: GainNode } | null = null;
  private fire: { gain: GainNode } | null = null;

  private burst(t: number, opts: { dur: number; freq: number; q?: number; type?: BiquadFilterType; gain: number; pan?: number; wet?: number }) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    const p = ctx.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    s.connect(f).connect(g).connect(p);
    p.connect(this.master!);
    if (opts.wet) {
      const w = ctx.createGain();
      w.gain.value = opts.wet;
      p.connect(w).connect(this.reverb!);
    }
    s.start(t, Math.random() * 1.2, opts.dur + 0.05);
  }

  private ok() {
    return !!(this.ctx && this.running && this.white);
  }

  /** a rifle/pistol report; distance 0 = player's own weapon */
  shot(distance: number, pan = 0, heavy = false) {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const near = Math.max(0.08, 1 - distance / 120);
    this.burst(t, { dur: 0.09, freq: 1800 - distance * 10, q: 0.5, gain: 0.9 * near, pan, wet: 0.5 + (1 - near) });
    this.burst(t, { dur: heavy ? 0.5 : 0.35, freq: 140, q: 0.6, type: "lowpass", gain: 1.1 * near, pan, wet: 0.9 });
  }

  /** vehicle charges going off: a crack, a deep body and a long rolling tail */
  explosion() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.burst(t, { dur: 0.25, freq: 900, q: 0.4, gain: 1.2, wet: 1.2 });
    this.burst(t, { dur: 2.8, freq: 70, type: "lowpass", gain: 1.6, wet: 1.4 });
    this.burst(t + 0.35, { dur: 3.5, freq: 140, type: "lowpass", gain: 0.8, wet: 1.6 });
    this.burst(t + 0.9, { dur: 0.6, freq: 1400, q: 0.6, gain: 0.25, wet: 1 });
  }

  /** a tracking dog: distance in metres */
  dogBark(distance: number, pan = 0) {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime, k = Math.min(1, distance / 90);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.bark(t + i * (0.28 + Math.random() * 0.15), 420 + Math.random() * 80, pan, 0.15 + k * 0.8);
  }
  /** wind strength 0..1.5 (ridge gusts) */
  setWind(level: number) {
    if (!this.ctx || !this.windGain) return;
    this.windGain.gain.setTargetAtTime(0.18 + level * 0.32, this.ctx.currentTime, 1.2);
  }

  click() {
    if (!this.ok()) return;
    this.burst(this.ctx!.currentTime, { dur: 0.03, freq: 3200, q: 4, gain: 0.25 });
  }
  reload() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    for (const d of [0, 0.32, 0.9]) this.burst(t + d, { dur: 0.05, freq: 2400 - d * 800, q: 3, gain: 0.3 });
  }
  thud() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.burst(t, { dur: 0.22, freq: 180, type: "lowpass", gain: 0.9 });
    this.burst(t + 0.25, { dur: 0.3, freq: 300, type: "lowpass", gain: 0.5 });
  }
  hurt() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.burst(t, { dur: 0.18, freq: 90, type: "lowpass", gain: 1.2 });
    this.burst(t, { dur: 0.05, freq: 5000, q: 2, gain: 0.12 });
  }
  snip() {
    if (!this.ok()) return;
    this.burst(this.ctx!.currentTime, { dur: 0.04, freq: 4200, q: 6, gain: 0.35 });
  }
  /** metallic lock work — the noise the guards can hear */
  scrape() {
    if (!this.ok()) return;
    this.burst(this.ctx!.currentTime, { dur: 0.12, freq: 2900 + Math.random() * 900, q: 9, gain: 0.3 });
  }
  /** a single short alarm shout / whistle blast */
  shout(pan = 0) {
    if (!this.ok()) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(2300, t);
    o.frequency.linearRampToValueAtTime(2550, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    g.gain.setValueAtTime(0.07, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p);
    p.connect(this.master!);
    p.connect(this.reverb!);
    o.start(t);
    o.stop(t + 0.65);
  }
  /** an owl hoot from the player — the agreed signal */
  signal() {
    if (!this.ok()) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    for (const [d, len] of [[0, 0.3], [0.45, 0.55]] as const) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(420, t + d);
      o.frequency.linearRampToValueAtTime(370, t + d + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.09, t + d + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
      o.connect(g).connect(this.master!);
      g.connect(this.reverb!);
      o.start(t + d);
      o.stop(t + d + len + 0.05);
    }
  }

  setSiren(on: boolean) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && !this.siren) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 520;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.22;
      const lg = ctx.createGain();
      lg.gain.value = 260;
      lfo.connect(lg).connect(osc.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.06, t, 0.6);
      osc.connect(lp).connect(gain);
      gain.connect(this.master);
      gain.connect(this.reverb!);
      osc.start();
      lfo.start();
      this.siren = { osc, gain };
    } else if (!on && this.siren) {
      const s = this.siren;
      s.gain.gain.setTargetAtTime(0, t, 0.4);
      window.setTimeout(() => s.osc.stop(), 1500);
      this.siren = null;
    }
  }

  /** crackling diversion fire, loudness by distance */
  setFire(level: number) {
    if (!this.ctx || !this.master || !this.white) return;
    const ctx = this.ctx;
    if (!this.fire && level > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 900;
      f.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.master);
      src.start();
      this.fire = { gain };
    }
    if (this.fire) this.fire.gain.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.3);
  }

  override stop() {
    this.setSiren(false);
    this.setFire(0);
    super.stop();
  }
}
