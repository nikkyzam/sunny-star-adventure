/**
 * audio.ts — Web Audio synthesized SFX + cheerful looping music + mute toggle (remembered in localStorage).
 * No audio asset files at all — everything is synthesized at runtime.
 */

export type SfxId =
  | "jump" | "doublejump" | "land" | "boing" | "stomp" | "star" | "hurt"
  | "portal" | "checkpoint" | "ui" | "win" | "lose" | "unlock" | "fall"
  | "coin" | "chest" | "buddy" | "powerup" | "honk";

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

// C-major frequencies used by the melody loop
const N = {
  G2: 98.0, A2: 110.0, C3: 130.81, F2: 87.31,
  B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77, C6: 1046.5,
} as const;

// 32 eighth-note steps: I – V – vi – IV, twice. 0 = rest.
const LEAD: number[] = [
  N.C5, 0, N.E5, 0, N.G5, 0, N.E5, 0,
  N.D5, 0, N.B4, 0, N.D5, 0, N.G5, 0,
  N.E5, 0, N.A5, 0, N.G5, 0, N.E5, 0,
  N.F5, 0, N.A5, 0, N.C6, 0, N.G5, 0,
];
// one bass root per bar (8 steps)
const BASS: number[] = [N.C3, N.G2, N.A2, N.F2];

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
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
      case "honk": this.blip("square", 392, 392, t, 0.12, 0.2); this.blip("square", 392, 392, t + 0.16, 0.18, 0.2); break;
      case "win":
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.blip("triangle", f, f, t + i * 0.11, 0.22, 0.22));
        break;
      case "lose":
        [392, 330, 262, 196].forEach((f, i) => this.blip("sawtooth", f, f * 0.9, t + i * 0.16, 0.22, 0.18));
        break;
    }
  }

  /** Cheerful 4-bar chiptune loop (I–V–vi–IV), scheduled ahead of time. */
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
    const STEP_DUR = 60 / 132 / 2; // eighth note at 132 BPM
    while (this.nextNoteTime < this.ctx.currentTime + 0.3) {
      const s = this.step % 32;
      const lead = LEAD[s];
      if (lead > 0) this.blip("triangle", lead, lead, this.nextNoteTime, STEP_DUR * 0.95, 0.1);
      if (s % 4 === 0) {
        const bass = BASS[Math.floor(s / 8)];
        this.blip("sine", bass, bass, this.nextNoteTime, STEP_DUR * 1.8, 0.16);
      }
      this.nextNoteTime += STEP_DUR;
      this.step = (this.step + 1) % 32;
    }
  }
}
