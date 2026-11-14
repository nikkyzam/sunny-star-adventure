/**
 * audio.ts — Web Audio synthesized SFX + looping music + sea ambience + mute toggle (remembered
 * in localStorage). No audio asset files at all — everything is synthesized at runtime.
 *
 * Music: four tunes (meadow / island / city / snow), each 16 bars with an A and a B section,
 * built from chord progressions so every note fits its chord. Each has a lead, bass, soft chord
 * pad and a light beat.
 */

export type SfxId =
  | "jump" | "doublejump" | "land" | "boing" | "stomp" | "star" | "hurt"
  | "portal" | "checkpoint" | "ui" | "win" | "lose" | "unlock" | "fall"
  | "coin" | "chest" | "buddy" | "powerup" | "honk" | "splash" | "talk" | "pet";

export type TrackId = "meadow" | "island" | "city" | "snow";

const MUTE_KEY = "game.muted";

// localStorage can throw (storage disabled, private mode, third-party storage blocked
// inside a preview iframe) — a game must never fail to start because of that.
function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeMuted(v: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    // not persisted this session; the in-memory flag still works
  }
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** One bar: the chord (scale degree of its root, 0 = I) and the lead pattern played over it. */
interface Bar { chord: number; pat: number[] }

interface Track {
  bpm: number;
  root: number;          // MIDI note of the scale's tonic (bass register)
  scale: number[];
  lead: OscillatorType;
  leadDecay: number;     // note length as a fraction of an eighth (short = plucky)
  stabs: boolean;        // off-beat chord plucks (island feel)
  busyHats: boolean;     // hi-hat on every off-beat eighth (city feel)
  bars: Bar[];
}

// Lead patterns: 8 eighth-note steps, each an index into the bar's chord tones
// (0 = root, 1 = third, 2 = fifth, 3 = root an octave up, ...) or -1 for a rest.
const P_BOUNCE = [0, -1, 1, -1, 2, -1, 1, -1];
const P_CLIMB = [0, 1, 2, 3, 2, 1, 2, -1];
const P_SKIP = [2, -1, 1, 2, 3, -1, 2, -1];
const P_FALL = [3, -1, 2, -1, 1, -1, 0, -1];
const P_HOLD = [3, -1, -1, 2, 1, -1, 0, -1];
const P_SWAY = [0, -1, -1, 1, 2, -1, 1, -1];
const P_LILT = [2, -1, 1, -1, -1, 0, 1, -1];
const P_END = [0, -1, 2, -1, 3, -1, -1, -1];

function bars(chords: number[], pats: number[][]): Bar[] {
  return chords.map((chord, i) => ({ chord, pat: pats[i % pats.length] }));
}

const TRACKS: Record<TrackId, Track> = {
  // sky islands: bright and bouncy (I–V–vi–IV, then a IV–V–iii–vi bridge)
  meadow: {
    bpm: 126, root: 48, scale: MAJOR, lead: "triangle", leadDecay: 0.95, stabs: false, busyHats: false,
    bars: [
      ...bars([0, 4, 5, 3], [P_BOUNCE]),
      ...bars([0, 4, 5, 3], [P_SKIP, P_CLIMB]),
      ...bars([3, 4, 2, 5], [P_CLIMB, P_FALL]),
      ...bars([3, 4, 0, 0], [P_SKIP, P_HOLD, P_BOUNCE, P_END]),
    ],
  },
  // beach and open sea: laid-back, with off-beat plucks
  island: {
    bpm: 104, root: 43, scale: MAJOR, lead: "sine", leadDecay: 0.7, stabs: true, busyHats: false,
    bars: [
      ...bars([0, 3, 4, 0], [P_SWAY, P_LILT]),
      ...bars([0, 3, 4, 4], [P_SWAY, P_LILT, P_SKIP, P_FALL]),
      ...bars([5, 3, 0, 4], [P_LILT, P_SWAY]),
      ...bars([5, 3, 4, 0], [P_BOUNCE, P_SKIP, P_FALL, P_END]),
    ],
  },
  // Toy City: quick and busy
  city: {
    bpm: 138, root: 41, scale: MAJOR, lead: "triangle", leadDecay: 0.6, stabs: false, busyHats: true,
    bars: [
      ...bars([0, 5, 3, 4], [P_CLIMB, P_SKIP]),
      ...bars([0, 5, 3, 4], [P_SKIP, P_BOUNCE, P_CLIMB, P_FALL]),
      ...bars([3, 4, 0, 5], [P_FALL, P_CLIMB]),
      ...bars([3, 4, 0, 0], [P_SKIP, P_CLIMB, P_BOUNCE, P_END]),
    ],
  },
  // Frosty Mountain: slow, bell-like, minor key
  snow: {
    bpm: 92, root: 45, scale: MINOR, lead: "sine", leadDecay: 1.6, stabs: false, busyHats: false,
    bars: [
      ...bars([0, 5, 2, 6], [P_BOUNCE, P_HOLD]),
      ...bars([0, 5, 2, 6], [P_FALL, P_BOUNCE]),
      ...bars([3, 0, 5, 6], [P_HOLD, P_SWAY]),
      ...bars([3, 0, 5, 0], [P_BOUNCE, P_FALL, P_HOLD, P_END]),
    ],
  },
};

/** Frequency of scale degree `deg` (can exceed 6: wraps up an octave) above the track's root. */
function degFreq(tr: Track, deg: number, octave: number): number {
  const midi = tr.root + 12 * octave + tr.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Chord tone `i` of the triad on scale degree `chord` (0 root, 1 third, 2 fifth, 3 octave...). */
function chordTone(chord: number, i: number): number {
  return chord + 2 * (i % 3) + 7 * Math.floor(i / 3);
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private track: Track = TRACKS.meadow;
  private noise: AudioBuffer | null = null;
  private sea: { src: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;
  private wantSea = false;
  private lastSplash = 0;
  private disposed = false;
  muted = false;

  // browsers require a first user interaction before the AudioContext can start
  private readonly unlock = () => {
    this.ensureCtx();
    this.detachUnlock();
  };

  constructor() {
    this.muted = readMuted();
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
  }

  private detachUnlock(): void {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
  }

  /**
   * Release everything: unlock listeners, the music scheduler and the AudioContext.
   * Call it from your teardown path (stopGame) next to input.dispose() — otherwise React
   * StrictMode's double mount / HMR leaks one AudioContext per mount, and Chrome caps a
   * page at about six of them.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachUnlock();
    this.stopMusic();
    this.engineStop();
    this.seaStop();
    this.master?.disconnect();
    this.master = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // one second of white noise, reused for hi-hats, splashes and the sea
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = n.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeMuted(this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** One enveloped oscillator blip. */
  private blip(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A filtered burst of noise (hi-hat, splash). `f0`→`f1` sweeps the filter. */
  private hiss(kind: BiquadFilterType, f0: number, f1: number, t0: number, dur: number, gain: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = kind;
    filter.frequency.setValueAtTime(f0, t0);
    filter.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  /** Pick the tune for a world. Takes effect at once; the sea ambience follows `sea`. */
  setTrack(id: TrackId, sea = false): void {
    this.wantSea = sea;
    if (!sea) this.seaStop();
    if (this.track === TRACKS[id]) return;
    this.track = TRACKS[id];
    this.step = 0;
  }

  /** Gentle waves: looping low noise whose volume swells slowly. */
  private seaStart(): void {
    if (this.sea || !this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const depth = this.ctx.createGain();
    depth.gain.value = 0.035;
    lfo.connect(depth).connect(gain.gain);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    this.sea = { src, lfo };
  }

  private seaStop(): void {
    this.sea?.src.stop();
    this.sea?.lfo.stop();
    this.sea = null;
  }

  sfx(id: SfxId): void {
    if (this.disposed || this.muted) return; // muted: no context is created either
    const ctx = this.ensureCtx();
    if (!this.master) return;
    const t = ctx.currentTime;
    switch (id) {
      case "jump": this.blip("triangle", 300, 620, t, 0.14, 0.22); break;
      case "doublejump": this.blip("triangle", 420, 900, t, 0.14, 0.2); break;
      case "land": this.blip("sine", 180, 120, t, 0.08, 0.12); break;
      case "boing": this.blip("sine", 180, 900, t, 0.28, 0.3); this.blip("triangle", 90, 450, t, 0.28, 0.18); break;
      case "stomp": this.blip("square", 300, 80, t, 0.14, 0.25); this.blip("sine", 600, 900, t + 0.05, 0.12, 0.15); break;
      case "star":
        this.blip("sine", 880, 880, t, 0.09, 0.22);
        this.blip("sine", 1318.5, 1318.5, t + 0.07, 0.14, 0.22);
        break;
      case "hurt": this.blip("sawtooth", 320, 90, t, 0.25, 0.28); break;
      case "fall": this.blip("sawtooth", 500, 60, t, 0.5, 0.25); break;
      case "portal":
        this.blip("sine", 523, 523, t, 0.12, 0.2); this.blip("sine", 659, 659, t + 0.1, 0.12, 0.2);
        this.blip("sine", 784, 784, t + 0.2, 0.12, 0.2); this.blip("sine", 1046, 1568, t + 0.3, 0.4, 0.22);
        break;
      case "checkpoint": this.blip("sine", 660, 660, t, 0.1, 0.2); this.blip("sine", 990, 990, t + 0.09, 0.18, 0.2); break;
      case "unlock":
        this.blip("triangle", 523, 523, t, 0.1, 0.2); this.blip("triangle", 784, 784, t + 0.09, 0.1, 0.2);
        this.blip("triangle", 1046, 1046, t + 0.18, 0.25, 0.22);
        break;
      case "ui": this.blip("sine", 440, 520, t, 0.05, 0.15); break;
      case "coin": this.blip("sine", 988, 1319, t, 0.08, 0.16); break;
      case "chest":
        this.blip("triangle", 523, 523, t, 0.1, 0.2); this.blip("triangle", 659, 659, t + 0.08, 0.1, 0.2);
        this.blip("triangle", 1046, 1319, t + 0.16, 0.3, 0.2);
        break;
      case "buddy":
        this.blip("sine", 659, 659, t, 0.1, 0.2); this.blip("sine", 880, 880, t + 0.08, 0.1, 0.2);
        this.blip("sine", 1109, 1109, t + 0.16, 0.22, 0.2);
        break;
      case "powerup": this.blip("triangle", 440, 880, t, 0.2, 0.22); this.blip("sine", 880, 1760, t + 0.1, 0.2, 0.15); break;
      case "splash":
        if (t - this.lastSplash < 0.28) break; // wading triggers this a lot
        this.lastSplash = t;
        this.hiss("lowpass", 2400, 500, t, 0.22, 0.12);
        break;
      case "talk":
        // friendly babble: a few quick notes at random pitches
        for (let i = 0; i < 4; i++) {
          const f = 380 + Math.random() * 320;
          this.blip("triangle", f, f * (0.9 + Math.random() * 0.25), t + i * 0.075, 0.06, 0.13);
        }
        break;
      case "pet":
        this.blip("triangle", 720, 1150, t, 0.09, 0.16);
        this.blip("triangle", 820, 1300, t + 0.13, 0.1, 0.16);
        break;
      case "honk": this.blip("square", 392, 392, t, 0.12, 0.2); this.blip("square", 392, 392, t + 0.16, 0.18, 0.2); break;
      case "win":
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.blip("triangle", f, f, t + i * 0.11, 0.22, 0.22));
        break;
      case "lose":
        [392, 330, 262, 196].forEach((f, i) => this.blip("sawtooth", f, f * 0.9, t + i * 0.16, 0.22, 0.18));
        break;
    }
  }

  /** Start the current track's loop (scheduled a little ahead of time). */
  startMusic(): void {
    if (this.disposed) return;
    const ctx = this.ensureCtx();
    if (this.musicTimer !== null) return;
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 100);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Car engine loop: pitch follows speed. */
  engineStart(): void {
    if (this.disposed) return;
    const ctx = this.ensureCtx();
    if (this.engineOsc || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 70;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  engineSet(speedNorm: number): void {
    if (this.engineOsc && this.ctx) {
      this.engineOsc.frequency.setTargetAtTime(70 + speedNorm * 150, this.ctx.currentTime, 0.08);
    }
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.05, this.ctx.currentTime, 0.1);
    }
  }

  engineStop(): void {
    this.engineOsc?.stop();
    this.engineOsc = null;
    this.engineGain = null;
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.master || this.disposed) return;
    if (this.wantSea) this.seaStart();
    const tr = this.track;
    const STEP_DUR = 60 / tr.bpm / 2; // one eighth note
    while (this.nextNoteTime < this.ctx.currentTime + 0.3) {
      const t = this.nextNoteTime;
      const s = this.step % 8;
      const bar = tr.bars[Math.floor(this.step / 8) % tr.bars.length];

      // lead: chord tones, two octaves above the bass — one octave for chords that sit high
      // in the scale, so the tune never gets shrill
      const tone = bar.pat[s];
      if (tone >= 0) {
        const high = tr.root + 24 + tr.scale[bar.chord % 7] > 74;
        const f = degFreq(tr, chordTone(bar.chord, tone), high ? 1 : 2);
        this.blip(tr.lead, f, f, t, STEP_DUR * tr.leadDecay, 0.085);
      }
      // bass: root on beat 1, fifth on beat 3
      if (s === 0 || s === 4) {
        const f = degFreq(tr, chordTone(bar.chord, s === 0 ? 0 : 2), 0);
        this.blip("sine", f, f, t, STEP_DUR * 1.8, 0.15);
      }
      // pad: the bar's chord, very soft
      if (s === 0) {
        for (let i = 0; i < 3; i++) {
          const f = degFreq(tr, chordTone(bar.chord, i), 1);
          this.blip("sine", f, f, t, STEP_DUR * 7.5, 0.028);
        }
      }
      // off-beat chord plucks
      if (tr.stabs && (s === 2 || s === 6)) {
        for (let i = 1; i < 3; i++) {
          const f = degFreq(tr, chordTone(bar.chord, i), 1);
          this.blip("triangle", f, f, t, STEP_DUR * 0.5, 0.035);
        }
      }
      // beat: soft kick on 1 and 3, hi-hat on the off-beats
      if (s === 0 || s === 4) this.blip("sine", 120, 45, t, 0.12, 0.16);
      if (s === 2 || s === 6 || (tr.busyHats && s % 2 === 1)) this.hiss("highpass", 7000, 9000, t, 0.04, 0.035);

      this.nextNoteTime += STEP_DUR;
      this.step = (this.step + 1) % (tr.bars.length * 8);
    }
  }
}
