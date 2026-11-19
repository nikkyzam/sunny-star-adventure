/**
 * audio.ts — music, synthesized sound effects, sea ambience and the mute toggle (remembered in
 * localStorage).
 *
 * Music: real recorded loops ("Abstraction - Music Loop Bundle", Tallbeard Studios, CC0; picked
 * and copied by scripts/build-music.mjs into public/music/), one per world, streamed when the
 * world opens and cross-faded when it changes. OGG (seamless loops) where the browser plays it,
 * otherwise M4A. While a song loads — or if it can't — four synthesized 16-bar tunes (meadow /
 * island / city / snow) play instead. Sound effects are all synthesized.
 */

export type SfxId =
  | "jump" | "doublejump" | "land" | "boing" | "stomp" | "star" | "hurt"
  | "portal" | "checkpoint" | "ui" | "win" | "lose" | "unlock" | "fall"
  | "coin" | "chest" | "buddy" | "powerup" | "honk" | "splash" | "talk" | "pet" | "munch" | "baa" | "rustle" | "meow" | "coo" | "dig" | "bell" | "roar" | "whee" | "fireworks";

export type TrackId = "meadow" | "island" | "city" | "snow";

/** Recorded songs in public/music/ (see scripts/build-music.mjs). */
export type SongId = "title" | "meadow" | "candy" | "snow" | "island" | "beach" | "jungle" | "city" | "night" | "space";

const SONG_VOLUME = 0.6;
const SONG_FADE = 1.2; // seconds of cross-fade between songs

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
  private songWanted: SongId | null = null;
  private song: { id: SongId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private songCache = new Map<SongId, Promise<{ buffer: AudioBuffer; loop: number } | null>>();
  private manifest: Promise<Record<string, { loop: number }> | null> | null = null;
  private musicOn = false;
  /** Start the music on the first tap / key press (browsers block sound before that). */
  autoStart = false;
  muted = false;

  // browsers require a first user interaction before the AudioContext can start
  private readonly unlock = () => {
    this.ensureCtx();
    this.detachUnlock();
    if (this.autoStart) this.startMusic();
  };

  constructor() {
    this.muted = readMuted();
    // iOS only lets sound start from the end of a touch, so listen for that too
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("touchend", this.unlock);
    window.addEventListener("click", this.unlock);
    window.addEventListener("keydown", this.unlock);
  }

  private detachUnlock(): void {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("touchend", this.unlock);
    window.removeEventListener("click", this.unlock);
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
    this.song?.src.stop();
    this.song = null;
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
      this.master.gain.value = this.muted || this.adMuted ? 0 : 0.5;
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
    if (this.master) this.master.gain.value = this.muted || this.adMuted ? 0 : 0.5;
    return this.muted;
  }

  private adMuted = false;

  /** Silence everything while an ad plays (the kid's own mute choice is left alone). */
  setAdMute(on: boolean): void {
    this.adMuted = on;
    if (this.master) this.master.gain.value = this.muted || on ? 0 : 0.5;
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

  /** The recorded song playing now (null while the built-in tune plays or music is off). */
  get playingSong(): SongId | null {
    return this.song?.id ?? null;
  }

  /** Pick the recorded song for a world (or the title screen); cross-fades if music is on. */
  setSong(id: SongId): void {
    this.songWanted = id;
    if (this.musicOn) void this.playSong(id);
  }

  /** Fetch and decode a song once (OGG where supported, otherwise M4A). */
  private loadSong(id: SongId): Promise<{ buffer: AudioBuffer; loop: number } | null> {
    let p = this.songCache.get(id);
    if (p) return p;
    const base = `${import.meta.env.BASE_URL}music/`;
    this.manifest ??= fetch(`${base}music.json`).then((r) => (r.ok ? r.json() : null), () => null);
    const ogg = typeof Audio !== "undefined" && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== "";
    const decode = async (ext: string) => {
      const res = await fetch(`${base}${id}.${ext}`);
      if (!res.ok) throw new Error(`${id}.${ext}: ${res.status}`);
      return this.ensureCtx().decodeAudioData(await res.arrayBuffer());
    };
    p = (async () => {
      try {
        const info = (await this.manifest)?.[id];
        let buffer: AudioBuffer;
        try {
          buffer = await decode(ogg ? "ogg" : "m4a");
        } catch {
          buffer = await decode("m4a"); // some browsers claim OGG but can't decode it
        }
        return { buffer, loop: Math.min(buffer.duration, info?.loop ?? buffer.duration) };
      } catch (err) {
        console.warn("song unavailable, using the built-in tune", err);
        return null;
      }
    })();
    this.songCache.set(id, p);
    return p;
  }

  private async playSong(id: SongId): Promise<void> {
    if (this.song?.id === id) return;
    const got = await this.loadSong(id);
    // still wanted, music still on, and nothing changed while it loaded?
    if (!got || this.disposed || !this.musicOn || this.songWanted !== id || this.song?.id === id) return;
    const ctx = this.ensureCtx();
    if (!this.master) return;
    const now = ctx.currentTime;
    const old = this.song;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + SONG_FADE);
      old.src.stop(now + SONG_FADE + 0.05);
    }
    const src = ctx.createBufferSource();
    src.buffer = got.buffer;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = got.loop; // the exact loop length: encoder padding never adds a gap
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(SONG_VOLUME, now + SONG_FADE);
    src.connect(gain).connect(this.master);
    src.start(now);
    this.song = { id, src, gain };
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

  /** A singing stone: a bright bell-like note, step `i` of the C major scale (0 = middle C). */
  note(i: number): void {
    if (this.disposed || this.muted) return;
    const ctx = this.ensureCtx();
    if (!this.master) return;
    const t = ctx.currentTime;
    const f = 523.25 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12][Math.max(0, Math.min(7, i))] / 12);
    this.blip("sine", f, f, t, 0.9, 0.2);
    this.blip("sine", f * 2, f * 2, t, 0.4, 0.06);
    this.blip("triangle", f * 3, f * 3, t, 0.15, 0.03);
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
      case "munch":
        for (let i = 0; i < 3; i++) this.blip("square", 190 - i * 20, 120, t + i * 0.09, 0.06, 0.14);
        this.blip("triangle", 520, 880, t + 0.3, 0.12, 0.16);
        break;
      case "baa":
        // a wobbly little lamb's "baa-a-a"
        for (let i = 0; i < 6; i++) this.blip("sawtooth", i % 2 ? 470 : 520, i % 2 ? 500 : 470, t + i * 0.06, 0.07, i === 0 ? 0.09 : 0.07);
        this.blip("triangle", 980, 940, t, 0.36, 0.05);
        break;
      case "meow":
        // a little rising-then-falling "mew"
        this.blip("triangle", 700, 1100, t, 0.12, 0.12);
        this.blip("triangle", 1100, 650, t + 0.12, 0.2, 0.1);
        break;
      case "bell":
        // a deep church bell: a strike with ringing overtones, twice
        for (const k of [0, 0.9]) {
          this.blip("sine", 392, 390, t + k, 2.2, 0.22);
          this.blip("sine", 784, 780, t + k, 1.4, 0.1);
          this.blip("sine", 1176, 1170, t + k, 0.9, 0.06);
          this.blip("triangle", 470, 468, t + k, 1.6, 0.06);
        }
        break;
      case "roar":
        // a happy little dragon "rawr!" and a whoosh of wings
        this.blip("sawtooth", 260, 420, t, 0.12, 0.12);
        this.blip("sawtooth", 420, 200, t + 0.12, 0.3, 0.12);
        this.blip("triangle", 140, 60, t + 0.35, 0.4, 0.18);
        break;
      case "whee":
        // a slide whistle going up and swooping down
        this.blip("sine", 500, 1400, t, 0.35, 0.12);
        this.blip("sine", 1400, 420, t + 0.35, 0.9, 0.1);
        break;
      case "fireworks":
        // whistles going up, then a pop and a crackle each (timed with the rockets: 0.28 s apart, ~1.3 s up)
        for (let k = 0; k < 10; k++) {
          const at = t + k * 0.28 + (k >= 6 ? 0.1 : 0);
          this.blip("sine", 700, 1700, at, 1.1, 0.025);
          this.blip("sine", 140, 45, at + 1.3, 0.35, 0.22);
          this.hiss("bandpass", 3000, 1200, at + 1.3, 0.5, 0.08);
          for (let c = 0; c < 4; c++) this.blip("square", 2000 + Math.random() * 1500, 1500, at + 1.55 + c * 0.07 + Math.random() * 0.05, 0.02, 0.025);
        }
        break;
      case "coo":
        this.blip("sine", 420, 380, t, 0.18, 0.14);
        this.blip("sine", 380, 340, t + 0.22, 0.28, 0.12);
        break;
      case "dig":
        for (let i = 0; i < 3; i++) this.blip("square", 260 - i * 30, 110, t + i * 0.1, 0.06, 0.08);
        break;
      case "rustle":
        for (let i = 0; i < 5; i++) this.blip("square", 1800 + Math.random() * 1400, 900, t + i * 0.045, 0.03, 0.05);
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

  /** Start the music: the world's recorded song, with the built-in tune until it has loaded. */
  startMusic(): void {
    if (this.disposed) return;
    const ctx = this.ensureCtx();
    this.musicOn = true;
    if (this.songWanted) void this.playSong(this.songWanted);
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
    if (this.song) {
      // a recorded song is playing: the built-in tune waits, ready if a later song can't load
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      return;
    }
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
