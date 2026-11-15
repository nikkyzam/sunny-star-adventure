/**
 * input.ts — keyboard/mouse + touch input. **Control-mapping conventions are fixed** (the most
 * frequent playtest defect is a reversed direction mapping):
 *
 *   W / ArrowUp    = move forward (moveZ = +1)
 *   S / ArrowDown  = move backward (moveZ = -1)
 *   A / ArrowLeft  = move left (moveX = -1)
 *   D / ArrowRight = move right (moveX = +1)
 *
 *   Mouse moving right => camera/crosshair turns right (yaw decreases, right-handed convention;
 *                          if you need it inverted, explicitly enable INVERT_* in config)
 *   Mouse moving up    => camera looks up (pitch increases)
 *   Touch left stick   = same directions as WASD; right-side drag = same as mouse
 *
 * Touch uses Pointer Events (not Touch Events): they behave the same on iPad Safari, Android and
 * touch laptops, each finger is captured so it keeps steering when it slides off the canvas, and
 * a thumb-stick is drawn where the left thumb lands so kids can see what they are doing.
 *
 * When changing these conventions you must also update the direction assertions in scripts/verify-game.mjs.
 */

import { INPUT_CONFIG } from "./config";

const STICK_RADIUS = 56; // px of thumb travel for full speed

const KEYMAP_WASD: Record<string, [axis: "moveX" | "moveZ", dir: 1 | -1]> = {
  KeyW: ["moveZ", 1], KeyS: ["moveZ", -1], KeyA: ["moveX", -1], KeyD: ["moveX", 1],
};
const KEYMAP_ARROWS: Record<string, [axis: "moveX" | "moveZ", dir: 1 | -1]> = {
  ArrowUp: ["moveZ", 1], ArrowDown: ["moveZ", -1], ArrowLeft: ["moveX", -1], ArrowRight: ["moveX", 1],
};

export class Input {
  /** P1 axes (WASD): moveX ∈ [-1,1] (left negative, right positive), moveZ ∈ [-1,1] (backward negative, forward positive). */
  moveX = 0;
  moveZ = 0;
  /** P2 axes (arrow keys), used in same-keyboard co-op; in 1P mode boot merges them into P1. */
  move2X = 0;
  move2Z = 0;
  /** Camera delta for this frame (radians). Multiply by sensitivity and INVERT config when applying. */
  yawDelta = 0;
  pitchDelta = 0;
  /** Instantaneous actions (true on the frame the key is pressed; auto-cleared once consumed). */
  readonly actions = new Set<string>();
  private held = new Set<string>();
  private touchMoveId: number | null = null;
  private touchAimId: number | null = null;
  private touchMoveOrigin = { x: 0, y: 0 };
  private touchAimOrigin = { x: 0, y: 0 };
  private stickBase: HTMLElement | null = null;
  private stickKnob: HTMLElement | null = null;

  /** Listener teardown — collected at construction so dispose() can unwind every subscription. */
  private unsubscribe: Array<() => void> = [];

  constructor(private target: HTMLElement = document.body) {
    const on = <T extends Event>(
      el: Window | Document | HTMLElement,
      type: string,
      fn: (e: T) => void,
      opts?: AddEventListenerOptions,
    ) => {
      const handler = fn as EventListener;
      el.addEventListener(type, handler, opts);
      this.unsubscribe.push(() => el.removeEventListener(type, handler, opts));
    };

    on<KeyboardEvent>(window, "keydown", (e) => {
      if (e.repeat) return;
      // typing a room code or a memory verse is not gameplay
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.held.add(e.code); // all codes held (Space/Enter too — glide checks isHeld)
      this.actions.add(e.code); // e.g. "KeyE" / "Escape" / "Space" are consumed directly by code
      this.recomputeAxes();
    });
    on<KeyboardEvent>(window, "keyup", (e) => {
      this.held.delete(e.code);
      this.recomputeAxes();
    });
    // Focus loss must release everything: a keyup that happens while unfocused never arrives,
    // otherwise the character keeps walking by itself after Alt-Tab.
    on(window, "blur", () => this.resetAll());
    on(document, "visibilitychange", () => { if (document.hidden) this.resetAll(); });
    on<MouseEvent>(window, "mousemove", (e) => {
      if (document.pointerLockElement || e.buttons > 0) {
        const sx = INPUT_CONFIG.MOUSE_SENS_X * (INPUT_CONFIG.INVERT_X ? -1 : 1);
        const sy = INPUT_CONFIG.MOUSE_SENS_Y * (INPUT_CONFIG.INVERT_Y ? -1 : 1);
        // mouse right => camera right (yaw decreases in a right-handed system); mouse up => camera up (pitch increases)
        this.yawDelta -= e.movementX * sx;
        this.pitchDelta += -e.movementY * sy;
      }
    });
    on<PointerEvent>(target, "pointerdown", (e) => this.onFingerDown(e));
    on<PointerEvent>(target, "pointermove", (e) => this.onFingerMove(e));
    on<PointerEvent>(target, "pointerup", (e) => this.onFingerUp(e));
    on<PointerEvent>(target, "pointercancel", (e) => this.onFingerUp(e));
    // iOS: stop the long-press menu / magnifier and pinch-zoom from hijacking a held thumb
    on(target, "contextmenu", (e) => e.preventDefault());
    on(document, "gesturestart", (e) => e.preventDefault());
    this.stickBase = document.getElementById("stick-base");
    this.stickKnob = document.getElementById("stick-knob");
    if (window.matchMedia?.("(pointer: coarse)").matches) document.body.classList.add("touch");
  }

  /** Detach every listener and zero the axes — call it when the game is unmounted (see src/game/boot.ts). */
  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.actions.clear();
    this.resetAll();
  }

  private onFingerDown(e: PointerEvent): void {
    if (e.pointerType === "mouse") return; // the mouse orbits the camera through mousemove
    document.body.classList.add("touch"); // show the touch controls from the first touch on
    if (e.clientX < window.innerWidth / 2 && this.touchMoveId === null) {
      this.touchMoveId = e.pointerId;
      this.touchMoveOrigin = { x: e.clientX, y: e.clientY };
      this.drawStick(0, 0, true);
    } else if (this.touchAimId === null) {
      this.touchAimId = e.pointerId;
      this.touchAimOrigin = { x: e.clientX, y: e.clientY };
    } else {
      return;
    }
    // keep getting this finger's moves even if it slides over a button or off the canvas
    try { this.target.setPointerCapture(e.pointerId); } catch { /* not capturable: still works */ }
  }

  private onFingerMove(e: PointerEvent): void {
    if (e.pointerId === this.touchMoveId) {
      // left stick: push up = forward (+moveZ), push right = right (+moveX), exactly matching WASD
      let dx = e.clientX - this.touchMoveOrigin.x;
      let dy = e.clientY - this.touchMoveOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        // the stick follows a thumb that drags past its edge, so reversing is always quick
        this.touchMoveOrigin.x += dx * (1 - STICK_RADIUS / len);
        this.touchMoveOrigin.y += dy * (1 - STICK_RADIUS / len);
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      this.moveX = dx / STICK_RADIUS;
      this.moveZ = -dy / STICK_RADIUS;
      this.drawStick(dx, dy, true);
    } else if (e.pointerId === this.touchAimId) {
      const sx = INPUT_CONFIG.MOUSE_SENS_X * (INPUT_CONFIG.INVERT_X ? -1 : 1);
      const sy = INPUT_CONFIG.MOUSE_SENS_Y * (INPUT_CONFIG.INVERT_Y ? -1 : 1);
      this.yawDelta -= (e.clientX - this.touchAimOrigin.x) * sx * 0.5;
      this.pitchDelta += -(e.clientY - this.touchAimOrigin.y) * sy * 0.5;
      this.touchAimOrigin = { x: e.clientX, y: e.clientY };
    }
  }

  private onFingerUp(e: PointerEvent): void {
    // Each lifted finger releases only its own stick — lifting the aim hand must not kill movement.
    if (e.pointerId === this.touchMoveId) {
      this.touchMoveId = null;
      this.drawStick(0, 0, false);
      this.recomputeAxes(); // fall back to whatever the keyboard still holds (usually nothing)
    } else if (e.pointerId === this.touchAimId) {
      this.touchAimId = null;
    }
  }

  /** Move the on-screen thumb-stick: under the thumb while held, back to its corner when let go. */
  private drawStick(dx: number, dy: number, held: boolean): void {
    const base = this.stickBase, knob = this.stickKnob;
    if (!base || !knob) return;
    base.classList.toggle("held", held);
    if (held) {
      base.style.left = `${this.touchMoveOrigin.x}px`;
      base.style.top = `${this.touchMoveOrigin.y}px`;
    } else {
      base.style.left = "";
      base.style.top = "";
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private resetAll(): void {
    this.held.clear();
    this.touchMoveId = null;
    this.touchAimId = null;
    this.drawStick(0, 0, false);
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.recomputeAxes();
  }

  private recomputeAxes(): void {
    let x = 0, z = 0, x2 = 0, z2 = 0;
    for (const code of this.held) {
      const m1 = KEYMAP_WASD[code];
      if (m1) {
        if (m1[0] === "moveX") x += m1[1]; else z += m1[1];
      }
      const m2 = KEYMAP_ARROWS[code];
      if (m2) {
        if (m2[0] === "moveX") x2 += m2[1]; else z2 += m2[1];
      }
    }
    // while the touch stick is held it owns P1's axes; a key event must not zero it
    if (this.touchMoveId === null) {
      this.moveX = clamp(x, -1, 1);
      this.moveZ = clamp(z, -1, 1);
    }
    this.move2X = clamp(x2, -1, 1);
    this.move2Z = clamp(z2, -1, 1);
  }

  /** Is a key currently held down (e.g. Space for gliding / parachute). */
  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** Consume the camera delta before each frame render (take and zero it). */
  consumeLook(): { yaw: number; pitch: number } {
    const r = { yaw: this.yawDelta, pitch: this.pitchDelta };
    this.yawDelta = 0;
    this.pitchDelta = 0;
    return r;
  }

  /** Drop presses nobody consumed this step, so they can't fire later in another context. */
  clearActions(): void {
    this.actions.clear();
  }

  /** Consume an instantaneous action: was this key pressed during the current frame. */
  consumeAction(code: string): boolean {
    const has = this.actions.has(code);
    if (has) this.actions.delete(code);
    return has;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
