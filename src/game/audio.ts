// Tiny procedural sound engine (no assets, all WebAudio synthesis).
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  volume = 0.6;

  private ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  resume() {
    this.ensure();
  }

  private noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  dig(material: 'stone' | 'dirt' | 'wood' | 'sand' | 'glass' | 'plant' | 'wool') {
    switch (material) {
      case 'stone': this.noise(0.14, 620 + Math.random() * 180, 1.4, 0.35, 'bandpass'); break;
      case 'wood': this.noise(0.13, 380 + Math.random() * 120, 1.1, 0.35); this.tone(150, 0.07, 0.12, 'triangle'); break;
      case 'sand': this.noise(0.16, 2400 + Math.random() * 800, 0.8, 0.22, 'highpass'); break;
      case 'glass': this.noise(0.12, 4200, 2.5, 0.2, 'highpass'); this.tone(1800, 0.09, 0.08, 'triangle'); break;
      case 'plant': this.noise(0.1, 1600, 1.2, 0.16); break;
      case 'wool': this.noise(0.11, 300, 0.7, 0.18, 'lowpass'); break;
      default: this.noise(0.14, 260 + Math.random() * 120, 0.9, 0.3, 'lowpass');
    }
  }

  place() {
    this.noise(0.1, 420, 1.1, 0.3, 'lowpass');
    this.tone(220, 0.06, 0.1, 'triangle');
  }

  step() {
    this.noise(0.07, 240 + Math.random() * 200, 0.8, 0.09, 'lowpass');
  }

  splash() {
    this.noise(0.35, 900, 0.6, 0.25, 'lowpass');
  }

  click() {
    this.tone(660, 0.05, 0.06, 'square');
  }
}

export const sfx = new Sfx();
