/**
 * Процедурный звук на WebAudio: эффекты, музыка-секвенсор и фоновая атмосфера.
 * Внешние аудиофайлы не нужны. Если WebAudio недоступен — игра работает без звука.
 */
import type { MusicTrack, Theme } from '../data/levels';

export type Sfx =
  | 'step' | 'swing' | 'hit' | 'crit' | 'hurt' | 'pickup' | 'coin' | 'button' | 'hover' | 'door' | 'chest'
  | 'beacon' | 'levelup' | 'enemyDie' | 'shoot' | 'slam' | 'potion' | 'denied' | 'break' | 'portal'
  | 'alert' | 'roar' | 'save' | 'quest' | 'dash';

interface TrackDef {
  bpm: number;
  root: number;
  scale: number[];
  prog: number[];
  arp: number[];
  steps: number;
  padWave: OscillatorType;
  arpWave: OscillatorType;
  padVol: number;
  arpVol: number;
  bassVol: number;
  drums: boolean;
  cutoff: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

const TRACKS: Record<MusicTrack, TrackDef> = {
  menu: { bpm: 68, root: 57, scale: MINOR, prog: [0, 5, 3, 4], arp: [0, 2, 4, 2, 7, 4, 2, 4], steps: 8, padWave: 'sawtooth', arpWave: 'triangle', padVol: 0.05, arpVol: 0.05, bassVol: 0.08, drums: false, cutoff: 1100 },
  forest: { bpm: 82, root: 55, scale: DORIAN, prog: [0, 3, 6, 4], arp: [0, 4, 2, 4, 7, 4, 2, -1], steps: 8, padWave: 'triangle', arpWave: 'square', padVol: 0.06, arpVol: 0.025, bassVol: 0.07, drums: false, cutoff: 1500 },
  crypt: { bpm: 60, root: 50, scale: PHRYGIAN, prog: [0, 1, 0, 6], arp: [0, -1, 4, -1, 2, -1, -1, 7], steps: 8, padWave: 'sawtooth', arpWave: 'triangle', padVol: 0.05, arpVol: 0.04, bassVol: 0.09, drums: false, cutoff: 700 },
  citadel: { bpm: 92, root: 52, scale: HARM, prog: [0, 5, 3, 4], arp: [0, 2, 4, 7, 4, 2, 0, -1], steps: 8, padWave: 'sawtooth', arpWave: 'square', padVol: 0.05, arpVol: 0.022, bassVol: 0.09, drums: false, cutoff: 1000 },
  boss: { bpm: 138, root: 52, scale: HARM, prog: [0, 0, 5, 4], arp: [0, 2, 4, 2, 7, 4, 2, 4, 0, 2, 4, 2, 6, 4, 2, 4], steps: 16, padWave: 'sawtooth', arpWave: 'square', padVol: 0.04, arpVol: 0.028, bassVol: 0.11, drums: true, cutoff: 1800 },
  victory: { bpm: 96, root: 60, scale: MAJOR, prog: [0, 4, 5, 3], arp: [0, 2, 4, 7, 4, 2, 4, 7], steps: 8, padWave: 'triangle', arpWave: 'square', padVol: 0.06, arpVol: 0.03, bassVol: 0.07, drums: false, cutoff: 2200 },
};

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private musicVol = 0.5;
  private sfxVol = 0.7;
  private track: MusicTrack | null = null;
  private pendingTrack: MusicTrack | null = null;
  private seqTimer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private ambientNodes: AudioNode[] = [];
  private ambientTimer: number | null = null;
  private ambientType: Theme | null = null;
  private lastPlay = new Map<Sfx, number>();

  /** Состояние движка для тестов и отладки (только чтение). */
  debugState(): { context: string; track: MusicTrack | null; ambient: Theme | null; sequencer: boolean; musicVolume: number; sfxVolume: number } {
    return {
      context: this.ctx ? this.ctx.state : 'none',
      track: this.track,
      ambient: this.ambientType,
      sequencer: this.seqTimer !== null,
      musicVolume: this.musicVol,
      sfxVolume: this.sfxVol,
    };
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Вызывается по первому действию пользователя (политика автозапуска браузеров). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicFilter = this.ctx.createBiquadFilter();
        this.musicFilter.type = 'lowpass';
        this.musicFilter.frequency.value = 1200;
        // Эхо для атмосферы.
        const delay = this.ctx.createDelay(1);
        delay.delayTime.value = 0.33;
        const fb = this.ctx.createGain();
        fb.gain.value = 0.28;
        this.musicFilter.connect(this.musicBus);
        this.musicFilter.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(this.musicBus);
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const ch = this.noise.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.pendingTrack) {
        const t = this.pendingTrack;
        this.pendingTrack = null;
        this.playMusic(t);
      }
      if (this.ambientType && this.ambientNodes.length === 0) this.setAmbient(this.ambientType);
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.05);
  }

  // ---------- примитивы ----------
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, o: { slide?: number; delay?: number; attack?: number; dest?: AudioNode } = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.dest ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, vol: number, filter: BiquadFilterType, freq: number, o: { slide?: number; delay?: number; q?: number; dest?: AudioNode } = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest ?? this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- эффекты ----------
  play(name: Sfx): void {
    if (!this.ready) return;
    const now = performance.now();
    const minGap = name === 'step' ? 60 : name === 'coin' ? 40 : 25;
    if (now - (this.lastPlay.get(name) ?? 0) < minGap) return;
    this.lastPlay.set(name, now);
    const r = Math.random();
    switch (name) {
      case 'step': this.noiseBurst(0.05, 0.06, 'lowpass', 500 + r * 300); break;
      case 'swing': this.noiseBurst(0.13, 0.16, 'bandpass', 900, { slide: 3200, q: 2 }); break;
      case 'hit': this.tone(200, 0.09, 'square', 0.12, { slide: 60 }); this.noiseBurst(0.07, 0.14, 'lowpass', 2200); break;
      case 'crit': this.tone(320, 0.12, 'square', 0.13, { slide: 80 }); this.noiseBurst(0.1, 0.2, 'highpass', 1500); this.tone(1400, 0.08, 'triangle', 0.06, { delay: 0.02 }); break;
      case 'hurt': this.tone(320, 0.22, 'sawtooth', 0.15, { slide: 80 }); this.noiseBurst(0.12, 0.12, 'lowpass', 900); break;
      case 'pickup': this.tone(660, 0.08, 'square', 0.07); this.tone(990, 0.12, 'square', 0.07, { delay: 0.07 }); break;
      case 'coin': this.tone(1320 + r * 60, 0.05, 'square', 0.05); this.tone(1980, 0.09, 'square', 0.05, { delay: 0.05 }); break;
      case 'button': this.tone(520, 0.05, 'square', 0.06); break;
      case 'hover': this.tone(780, 0.025, 'square', 0.03); break;
      case 'door': this.noiseBurst(0.3, 0.18, 'lowpass', 500, { slide: 150 }); this.tone(110, 0.3, 'triangle', 0.14, { slide: 70 }); break;
      case 'chest': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, { delay: i * 0.08 })); break;
      case 'beacon':
        this.noiseBurst(1.2, 0.2, 'bandpass', 300, { slide: 2500, q: 0.8 });
        [220, 330, 440, 554, 659].forEach((f, i) => this.tone(f, 1.4, 'triangle', 0.07, { delay: i * 0.12, attack: 0.05 }));
        break;
      case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'square', 0.06, { delay: i * 0.07 })); break;
      case 'enemyDie': this.noiseBurst(0.35, 0.18, 'lowpass', 1500, { slide: 150 }); this.tone(220, 0.3, 'square', 0.08, { slide: 45 }); break;
      case 'shoot': this.tone(900, 0.18, 'sine', 0.08, { slide: 260 }); this.tone(450, 0.18, 'triangle', 0.05, { slide: 130 }); break;
      case 'slam': this.noiseBurst(0.6, 0.32, 'lowpass', 400, { slide: 60 }); this.tone(80, 0.55, 'sine', 0.35, { slide: 28 }); break;
      case 'potion': [400, 520, 680, 880].forEach((f, i) => this.tone(f, 0.1, 'sine', 0.08, { delay: i * 0.05 })); break;
      case 'denied': this.tone(160, 0.12, 'square', 0.08); this.tone(120, 0.18, 'square', 0.08, { delay: 0.1 }); break;
      case 'break': this.noiseBurst(0.18, 0.18, 'highpass', 1800); this.tone(700, 0.06, 'triangle', 0.06, { slide: 300 }); break;
      case 'portal': this.tone(180, 1.0, 'sine', 0.12, { slide: 900, attack: 0.1 }); this.noiseBurst(1.0, 0.1, 'bandpass', 400, { slide: 3000 }); break;
      case 'alert': this.tone(880, 0.06, 'square', 0.05); this.tone(1175, 0.09, 'square', 0.05, { delay: 0.06 }); break;
      case 'roar': this.noiseBurst(1.1, 0.3, 'lowpass', 700, { slide: 120 }); this.tone(95, 1.1, 'sawtooth', 0.16, { slide: 45 }); break;
      case 'save': this.tone(523, 0.25, 'sine', 0.09); this.tone(784, 0.35, 'sine', 0.09, { delay: 0.12 }); break;
      case 'quest': [587, 740, 880].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.08, { delay: i * 0.1 })); break;
      case 'dash': this.noiseBurst(0.3, 0.2, 'bandpass', 500, { slide: 2000, q: 1.5 }); break;
    }
  }

  // ---------- музыка ----------
  playMusic(track: MusicTrack | null): void {
    if (track === this.track && this.seqTimer !== null) return;
    this.stopMusic();
    this.track = track;
    if (!track) return;
    if (!this.ready) {
      this.pendingTrack = track;
      return;
    }
    const def = TRACKS[track];
    this.musicFilter.frequency.setTargetAtTime(def.cutoff, this.ctx!.currentTime, 0.2);
    this.nextTime = this.ctx!.currentTime + 0.1;
    this.step = 0;
    this.bar = 0;
    this.seqTimer = window.setInterval(() => this.schedule(), 50);
  }

  stopMusic(): void {
    if (this.seqTimer !== null) window.clearInterval(this.seqTimer);
    this.seqTimer = null;
    this.track = null;
  }

  private schedule(): void {
    if (!this.ctx || !this.track) return;
    if (this.ctx.state !== 'running') return;
    const def = TRACKS[this.track];
    const stepDur = 60 / def.bpm / (def.steps / 4);
    // Если вкладка «уснула», не догоняем пропущенные ноты.
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(def, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= def.steps) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private noteInScale(def: TrackDef, degree: number): number {
    const len = def.scale.length;
    const oct = Math.floor(degree / len);
    const idx = ((degree % len) + len) % len;
    return def.root + def.scale[idx] + oct * 12;
  }

  private playStep(def: TrackDef, step: number, t: number, stepDur: number): void {
    const ctx = this.ctx!;
    const chordRoot = def.prog[this.bar % def.prog.length];
    const dest = this.musicFilter;
    const delay = Math.max(0, t - ctx.currentTime);
    if (step === 0) {
      const barDur = stepDur * def.steps;
      for (const deg of [0, 2, 4]) {
        const f = midiToHz(this.noteInScale(def, chordRoot + deg) - 12);
        for (const det of [-6, 6]) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = def.padWave;
          osc.frequency.value = f;
          osc.detune.value = det;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(def.padVol / 2, t + barDur * 0.3);
          g.gain.linearRampToValueAtTime(0.0001, t + barDur * 1.02);
          osc.connect(g);
          g.connect(dest);
          osc.start(t);
          osc.stop(t + barDur * 1.05);
        }
      }
    }
    if (step % (def.steps / 2) === 0 || (def.drums && step % 4 === 2)) {
      this.tone(midiToHz(this.noteInScale(def, chordRoot) - 24), stepDur * 1.8, 'triangle', def.bassVol, { delay, dest });
    }
    const a = def.arp[step % def.arp.length];
    if (a >= 0) {
      // Небольшие вариации мелодии каждые 4 такта.
      const variation = this.bar % 4 === 3 && step % 4 === 3 ? 1 : 0;
      const f = midiToHz(this.noteInScale(def, chordRoot + a + variation) + 12);
      this.tone(f, stepDur * 0.9, def.arpWave, def.arpVol, { delay, dest });
    }
    if (def.drums) {
      if (step % 4 === 0) this.tone(140, 0.18, 'sine', 0.22, { delay, slide: 40, dest: this.musicBus });
      if (step % 2 === 1) this.noiseBurst(0.04, 0.05, 'highpass', 7000, { delay, dest: this.musicBus });
      if (step % 8 === 4) this.noiseBurst(0.14, 0.12, 'bandpass', 1800, { delay, dest: this.musicBus });
    }
  }

  // ---------- атмосфера ----------
  setAmbient(type: Theme | null): void {
    this.ambientType = type;
    for (const n of this.ambientNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* уже остановлен */
      }
      n.disconnect();
    }
    this.ambientNodes = [];
    if (this.ambientTimer !== null) window.clearInterval(this.ambientTimer);
    this.ambientTimer = null;
    if (!type || !this.ready) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    if (type === 'forest') {
      f.type = 'bandpass';
      f.frequency.value = 450;
      f.Q.value = 0.6;
      g.gain.value = 0.035;
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 0.025;
    } else if (type === 'crypt') {
      f.type = 'lowpass';
      f.frequency.value = 220;
      g.gain.value = 0.05;
      lfo.frequency.value = 0.05;
      lfoGain.gain.value = 0.02;
    } else {
      f.type = 'lowpass';
      f.frequency.value = 140;
      g.gain.value = 0.09;
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = 0.04;
    }
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start();
    lfo.start();
    this.ambientNodes.push(src, f, g, lfo, lfoGain);
    this.ambientTimer = window.setInterval(() => {
      if (!this.ready || Math.random() > 0.45) return;
      if (type === 'forest') {
        const base = 3800 + Math.random() * 900;
        for (let i = 0; i < 3; i++) this.tone(base, 0.03, 'sine', 0.012, { delay: i * 0.07 });
      } else if (type === 'crypt') {
        const f0 = 1200 + Math.random() * 900;
        this.tone(f0, 0.12, 'sine', 0.03, { slide: f0 * 0.5 });
        this.tone(f0 * 0.5, 0.12, 'sine', 0.012, { delay: 0.3, slide: f0 * 0.25 });
      } else {
        this.noiseBurst(0.04, 0.04, 'highpass', 3000 + Math.random() * 2000);
      }
    }, 900);
  }
}

export const audio = new AudioEngine();
