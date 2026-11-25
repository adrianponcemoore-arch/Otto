// Fully synthesized audio (Web Audio API) — no audio files to download.
//  * motor whine: detuned saw + square through a resonant low-pass, pitch rises with speed
//  * tires: looped noise through a band-pass whose shape depends on the surface
//  * wind + rain beds, and one-shot SFX for gameplay events
const SURF = {
  asphalt:  { f: 700,  q: 0.6, g: 0.45, crunch: 0 },
  concrete: { f: 900,  q: 0.7, g: 0.5,  crunch: 0.1 },
  gravel:   { f: 2600, q: 0.5, g: 1.1,  crunch: 0.9 },
  dirt:     { f: 380,  q: 0.8, g: 0.9,  crunch: 0.4 },
  grass:    { f: 1500, q: 0.4, g: 0.55, crunch: 0.3 },
  wet:      { f: 4200, q: 0.3, g: 1.0,  crunch: 0 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ready = false;
  }

  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // motor
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    this.motorFilter = ctx.createBiquadFilter(); this.motorFilter.type = 'lowpass'; this.motorFilter.Q.value = 6;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    const o2g = ctx.createGain(); o2g.gain.value = 0.35;
    this.osc1.connect(this.motorFilter); this.osc2.connect(o2g).connect(this.motorFilter);
    this.motorFilter.connect(this.motorGain).connect(this.master);
    this.osc1.start(); this.osc2.start();

    // tires
    this.tireFilter = ctx.createBiquadFilter(); this.tireFilter.type = 'bandpass';
    this.tireGain = ctx.createGain(); this.tireGain.gain.value = 0;
    this.crunchGain = ctx.createGain(); this.crunchGain.gain.value = 1;
    this.crunchLfo = ctx.createOscillator(); this.crunchLfo.type = 'square'; this.crunchLfo.frequency.value = 23;
    this.crunchDepth = ctx.createGain(); this.crunchDepth.gain.value = 0;
    this.crunchLfo.connect(this.crunchDepth).connect(this.crunchGain.gain);
    this.crunchLfo.start();
    noise().connect(this.tireFilter);
    this.tireFilter.connect(this.crunchGain).connect(this.tireGain).connect(this.master);

    // wind
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    noise().connect(this.windFilter).connect(this.windGain).connect(this.master);

    // rain bed
    this.rainFilter = ctx.createBiquadFilter(); this.rainFilter.type = 'highpass'; this.rainFilter.frequency.value = 2500;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    noise().connect(this.rainFilter).connect(this.rainGain).connect(this.master);

    // charging hum
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    const hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 120;
    const humLfo = ctx.createOscillator(); humLfo.frequency.value = 3;
    const humLfoG = ctx.createGain(); humLfoG.gain.value = 30;
    humLfo.connect(humLfoG).connect(hum.frequency);
    hum.connect(this.humGain).connect(this.master);
    hum.start(); humLfo.start();

    this.ready = true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  /** Continuous layers, call every frame while riding. */
  updateRide({ speed, motorLoad, motorOn, turbo, surface, wet, rain, charging, airborne }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, k = 0.06;
    const f = 140 + speed * 42 * (turbo ? 1.12 : 1);
    this.osc1.frequency.setTargetAtTime(f, t, k);
    this.osc2.frequency.setTargetAtTime(f * 2.005, t, k);
    this.motorFilter.frequency.setTargetAtTime(500 + speed * 160 + motorLoad * 1500, t, k);
    this.motorGain.gain.setTargetAtTime(motorOn ? 0.025 + motorLoad * 0.07 : 0.004 * Math.min(1, speed / 5), t, 0.08);

    const s = SURF[wet && (surface === 'asphalt' || surface === 'concrete') ? 'wet' : surface] || SURF.asphalt;
    const sp = Math.min(1, speed / 14);
    this.tireFilter.frequency.setTargetAtTime(s.f * (0.7 + sp * 0.6), t, 0.05);
    this.tireFilter.Q.value = s.q;
    this.crunchDepth.gain.setTargetAtTime(s.crunch * 0.8, t, 0.05);
    this.crunchLfo.frequency.setTargetAtTime(10 + speed * 4, t, 0.05);
    this.tireGain.gain.setTargetAtTime(airborne ? 0 : s.g * sp * 0.22, t, 0.04);

    this.windGain.gain.setTargetAtTime(Math.max(0, (speed - 5) / 15) ** 2 * 0.25, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 60, t, 0.1);
    this.rainGain.gain.setTargetAtTime(rain * 0.12, t, 0.3);
    this.humGain.gain.setTargetAtTime(charging ? 0.05 : 0, t, 0.1);
  }

  silenceRide() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const g of [this.motorGain, this.tireGain, this.windGain, this.humGain]) g.gain.setTargetAtTime(0, t, 0.05);
  }

  setAmbientRain(rain) {
    if (!this.ready) return;
    this.rainGain.gain.setTargetAtTime(rain * 0.08, this.ctx.currentTime, 0.3);
  }

  // ------------------------------------------------------------- one-shots
  _tone(freq, dur, { type = 'sine', gain = 0.2, at = 0, slide = 0 } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noise(dur, { gain = 0.3, freq = 800, type = 'lowpass', at = 0 } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  sfx(name, k = 1) {
    switch (name) {
      case 'click': this._tone(900, 0.05, { type: 'square', gain: 0.05 }); break;
      case 'assist': this._tone(520 + k * 220, 0.09, { type: 'triangle', gain: 0.12 }); this._tone(780 + k * 220, 0.12, { type: 'triangle', gain: 0.1, at: 0.06 }); break;
      case 'pickup': [660, 880, 1320].forEach((f, i) => this._tone(f, 0.18, { type: 'triangle', gain: 0.14, at: i * 0.07 })); break;
      case 'deliver': [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.3, { type: 'triangle', gain: 0.14, at: i * 0.08 })); this._tone(1568, 0.5, { gain: 0.06, at: 0.32 }); break;
      case 'coin': this._tone(1200, 0.08, { type: 'square', gain: 0.06 }); this._tone(1800, 0.15, { type: 'square', gain: 0.05, at: 0.06 }); break;
      case 'crash': this._noise(0.5, { gain: 0.6 * Math.min(1.5, k), freq: 900 }); this._tone(90, 0.35, { type: 'sine', gain: 0.5, slide: -50 }); this._noise(0.25, { gain: 0.2, freq: 3000, type: 'highpass', at: 0.05 }); break;
      case 'scrape': this._noise(0.25, { gain: 0.15, freq: 2500, type: 'bandpass' }); break;
      case 'bump': this._tone(70, 0.12, { gain: 0.25 * Math.min(1, k), slide: -30 }); this._noise(0.08, { gain: 0.1 * k, freq: 600 }); break;
      case 'land': this._tone(60, 0.18, { gain: 0.35 * Math.min(1, k), slide: -25 }); this._noise(0.12, { gain: 0.15, freq: 500 }); break;
      case 'hop': this._noise(0.18, { gain: 0.1, freq: 1800, type: 'bandpass' }); break;
      case 'lowbat': this._tone(880, 0.12, { type: 'square', gain: 0.07 }); this._tone(660, 0.16, { type: 'square', gain: 0.07, at: 0.15 }); break;
      case 'empty': this._tone(440, 0.4, { type: 'sawtooth', gain: 0.08, slide: -300 }); break;
      case 'charge': this._tone(700, 0.1, { type: 'sine', gain: 0.1 }); this._tone(1050, 0.18, { type: 'sine', gain: 0.1, at: 0.08 }); break;
      case 'honk': this._tone(370, 0.35, { type: 'square', gain: 0.06 }); this._tone(466, 0.35, { type: 'square', gain: 0.05 }); break;
      case 'tick': this._tone(1400, 0.04, { type: 'square', gain: 0.04 }); break;
      case 'go': this._tone(1046, 0.35, { type: 'triangle', gain: 0.15 }); break;
      case 'fail': [392, 330, 262].forEach((f, i) => this._tone(f, 0.3, { type: 'triangle', gain: 0.12, at: i * 0.15 })); break;
      case 'star': this._tone(1320 + k * 200, 0.25, { type: 'triangle', gain: 0.12 }); break;
    }
  }
}
