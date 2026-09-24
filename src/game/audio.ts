// Every sound is synthesised with Web Audio. No samples ship with the game.

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private engineGain!: GainNode;
  private engineOsc: OscillatorNode[] = [];
  private engineFilter!: BiquadFilterNode;
  private surfGain!: GainNode;
  private windGain!: GainNode;
  private noise!: AudioBuffer;
  private nextBeat = 0;
  private beat = 0;
  private musicTimer: number | null = null;

  muted = false;
  musicOn = true;
  volume = 0.8;
  musicVolume = 0.5;
  night = 0;

  /** Must run inside a user gesture, or the browser keeps the context suspended. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.applyLevels();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Brown-ish noise: surf and wind want low-end weight, not hiss.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }

    // Engine: two detuned oscillators through a low-pass whose cutoff follows throttle.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.sfx);
    for (const [type, det] of [['sawtooth', 0], ['square', 7]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = det;
      o.frequency.value = 30;
      o.connect(this.engineFilter);
      o.start();
      this.engineOsc.push(o);
    }

    this.surfGain = this.loopNoise(500, 'lowpass', 0.25);
    this.windGain = this.loopNoise(900, 'bandpass', 0);

    this.nextBeat = ctx.currentTime + 0.2;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 100);
  }

  private loopNoise(freq: number, type: BiquadFilterType, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.sfx);
    src.start();
    return g;
  }

  applyLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicOn ? this.musicVolume * 0.5 : 0, t, 0.2);
  }

  /** Called every frame. rpm drives pitch; speed drives wind. */
  drive(rpm: number, throttle: number, speedMs: number, time: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = rpm / 30; // four-cylinder firing frequency
    this.engineOsc[0]!.frequency.setTargetAtTime(f, t, 0.05);
    this.engineOsc[1]!.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(250 + Math.max(0, throttle) * 900 + f * 2, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + Math.max(0, throttle) * 0.05, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.35, (speedMs / 28) ** 2 * 0.35), t, 0.2);
    // Surf swells and recedes on a slow cycle.
    this.surfGain.gain.setTargetAtTime(0.12 + 0.12 * (0.5 + 0.5 * Math.sin(time * 0.8)), t, 0.3);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, freq: number, type: BiquadFilterType, vol: number, sweepTo?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  horn(long = false): void {
    const d = long ? 0.9 : 0.28;
    this.tone(415, d, 'square', 0.08);
    this.tone(523, d, 'square', 0.07);
  }

  squawk(): void {
    this.tone(900, 0.5, 'sawtooth', 0.12, 0, 380);
    this.tone(1250, 0.35, 'square', 0.05, 0.04, 600);
    this.burst(0.4, 1800, 'bandpass', 0.35);
  }

  pickup(golden: boolean): void {
    const notes = golden ? [784, 988, 1175, 1568] : [880, 1320];
    notes.forEach((n, i) => this.tone(n, 0.25, 'sine', 0.12, i * 0.06));
  }

  achievement(): void {
    [523, 659, 784, 1047].forEach((n, i) => this.tone(n, 0.35, 'triangle', 0.1, i * 0.09));
  }

  crash(): void {
    this.burst(0.5, 900, 'lowpass', 1.2, 120);
    this.tone(70, 0.4, 'sine', 0.4, 0, 35);
  }

  jump(): void {
    this.burst(0.35, 400, 'bandpass', 0.6, 2000);
  }

  land(): void {
    this.tone(90, 0.2, 'sine', 0.3, 0, 45);
    this.burst(0.2, 300, 'lowpass', 0.6);
  }

  splash(): void {
    this.burst(0.8, 2500, 'lowpass', 0.9, 300);
  }

  click(): void {
    this.tone(1200, 0.05, 'square', 0.03);
  }

  // Generative music: a slow pentatonic progression with a pad, bass and plucked arp.
  // Night thins it out and drops it lower.
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn || this.muted) {
      if (ctx) this.nextBeat = ctx.currentTime + 0.2;
      return;
    }
    const spb = 60 / 84 / 2; // eighth notes at 84 bpm
    const chords = [
      [0, 4, 7, 11],
      [9, 12, 16, 19],
      [5, 9, 12, 16],
      [7, 11, 14, 17],
    ];
    const penta = [0, 2, 4, 7, 9, 12, 14, 16];
    while (this.nextBeat < ctx.currentTime + 0.3) {
      const bar = Math.floor(this.beat / 8) % chords.length;
      const step = this.beat % 8;
      const root = 50 - Math.round(this.night * 3); // D3, sliding down at night
      const hz = (semi: number) => 440 * 2 ** ((root + semi - 69) / 12);
      const t = this.nextBeat - ctx.currentTime;
      const chord = chords[bar]!;
      if (step === 0) {
        for (const s of chord) this.pad(hz(s + 12), spb * 8, t);
        this.musicNote(hz(chord[0]! - 12), spb * 6, 'triangle', 0.12, t);
      }
      const density = 0.55 - this.night * 0.3;
      if (Math.random() < density) {
        const s = penta[Math.floor(Math.random() * penta.length)]! + chord[0]!;
        this.musicNote(hz(s + 24), spb * 1.8, 'sine', 0.07, t);
      }
      this.nextBeat += spb;
      this.beat++;
    }
  }

  private musicNote(freq: number, dur: number, type: OscillatorType, vol: number, when: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + Math.max(0, when);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(freq: number, dur: number, when: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + Math.max(0, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900 - this.night * 400;
    g.connect(f).connect(this.music);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  dispose(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
