/**
 * hud.ts — DOM heads-up display + overlay screens. The DOM lives in src/pages/Home.tsx;
 * this module caches elements, updates them on change, and routes button actions to the game.
 */

export type HudAction =
  | "play" | "play2" | "continue" | "resume" | "retry" | "next" | "title" | "again" | "jump" | "mute"
  | "online" | "host" | "join" | "back" | "reroll" | "easy";

type OverlayName = "title" | "pause" | "gameover" | "clear" | "win" | "online";

const OVERLAY_IDS: Record<OverlayName, string> = {
  title: "ov-title",
  pause: "ov-pause",
  gameover: "ov-gameover",
  clear: "ov-clear",
  win: "ov-win",
  online: "ov-online",
};

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`HUD element #${id} missing from Home.tsx`);
  return e as T;
}

export class Hud {
  private onActionCb: ((a: HudAction) => void) | null = null;
  private unsub: Array<() => void> = [];
  private toastTimer: number | null = null;

  private hearts = el("hud-hearts");
  private stars = el("hud-stars");
  private score = el("hud-score");
  private level = el("hud-level");
  private time = el("hud-time");
  private coins = el("hud-coins");
  private buddies = el("hud-buddies");
  private magnet = el("hud-magnet");
  private toast = el("toast");
  private topbar = el("hud-top");
  private jumpBtn = el("btn-jump");
  private muteBtn = el("btn-mute");
  private room = el("hud-room");
  private stickerBar = el("sticker-bar");
  private onStickerCb: ((i: number) => void) | null = null;

  constructor() {
    const bind = (elm: HTMLElement, action: HudAction) => {
      const fn = (e: Event) => {
        e.preventDefault();
        this.onActionCb?.(action);
      };
      elm.addEventListener("click", fn);
      this.unsub.push(() => elm.removeEventListener("click", fn));
    };
    document.querySelectorAll<HTMLElement>("[data-action]").forEach((b) => {
      bind(b, b.dataset.action as HudAction);
    });
    bind(this.muteBtn, "mute");
    bind(this.jumpBtn, "jump");
  }

  dispose(): void {
    for (const off of this.unsub) off();
    this.unsub = [];
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
  }

  onAction(cb: (a: HudAction) => void): void {
    this.onActionCb = cb;
  }

  setHearts(n: number, max = 3): void {
    this.hearts.textContent = "♥".repeat(Math.max(0, n)) + "♡".repeat(Math.max(0, max - n));
  }
  setStars(taken: number, total: number): void {
    this.stars.textContent = `★ ${taken}/${total}`;
  }
  setCoins(n: number): void {
    this.coins.textContent = `◉ ${n}`;
  }
  setBuddies(emojis: string): void {
    this.buddies.textContent = emojis;
    this.buddies.style.display = emojis ? "" : "none";
  }
  setMagnet(secondsLeft: number | null): void {
    this.magnet.style.display = secondsLeft !== null ? "" : "none";
    if (secondsLeft !== null) this.magnet.textContent = `🧲 ${secondsLeft}s`;
  }
  setScore(n: number): void {
    this.score.textContent = `${n}`;
  }
  setLevel(name: string): void {
    this.level.textContent = name;
  }
  setTime(sec: number): void {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    this.time.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }
  setMuted(m: boolean): void {
    this.muteBtn.textContent = m ? "🔇" : "🔊";
  }
  setBest(n: number): void {
    el("title-best").textContent = n > 0 ? `Best score: ${n}` : "";
  }
  showContinue(show: boolean, levelName: string): void {
    const b = el("btn-continue");
    b.style.display = show ? "" : "none";
    if (show) b.textContent = `▶ Continue: ${levelName}`;
  }

  /** Top bar + jump button only make sense during play. */
  setPlayingUi(playing: boolean): void {
    this.topbar.style.display = playing ? "" : "none";
    this.jumpBtn.style.display = playing ? "" : "none";
    this.stickerBar.style.display = playing ? "" : "none";
  }

  /** Sticker buttons (built once from the preset list). */
  buildStickers(labels: string[], cb: (i: number) => void): void {
    this.onStickerCb = cb;
    this.stickerBar.textContent = "";
    labels.forEach((label, i) => {
      const b = document.createElement("button");
      b.className = "sticker-btn";
      b.textContent = label;
      b.setAttribute("aria-label", `Sticker ${i + 1}`);
      const fn = (e: Event) => { e.preventDefault(); this.onStickerCb?.(i); };
      b.addEventListener("click", fn);
      this.unsub.push(() => b.removeEventListener("click", fn));
      this.stickerBar.appendChild(b);
    });
  }

  /** Outfit color swatches on the title screen. */
  buildOutfits(colors: number[], selected: number, cb: (i: number) => void): void {
    this.buildChoices("outfits", colors.length, selected, cb, (b, i) => {
      b.style.background = `#${colors[i].toString(16).padStart(6, "0")}`;
      b.setAttribute("aria-label", `Outfit ${i + 1}`);
    });
  }

  /** Hat buttons on the title screen. */
  buildHats(labels: string[], selected: number, cb: (i: number) => void): void {
    this.buildChoices("hats", labels.length, selected, cb, (b, i) => {
      b.textContent = labels[i];
      b.classList.add("hat");
      b.setAttribute("aria-label", `Hat ${i + 1}`);
    });
  }

  /** Highlight the chosen swatch in a choice row ("outfits" / "hats"). */
  setChoice(boxId: string, selected: number): void {
    el(boxId).querySelectorAll(".swatch").forEach((b, i) => b.classList.toggle("on", i === selected));
  }

  private buildChoices(boxId: string, count: number, selected: number, cb: (i: number) => void,
    decorate: (b: HTMLButtonElement, i: number) => void): void {
    const box = el(boxId);
    box.textContent = "";
    for (let i = 0; i < count; i++) {
      const b = document.createElement("button");
      b.className = "swatch" + (i === selected ? " on" : "");
      decorate(b, i);
      const fn = (e: Event) => { e.preventDefault(); cb(i); };
      b.addEventListener("click", fn);
      this.unsub.push(() => b.removeEventListener("click", fn));
      box.appendChild(b);
    }
  }
  setKidName(name: string): void {
    el("kid-name").textContent = `Hi, ${name}!`;
  }
  setEasy(on: boolean): void {
    el("btn-easy").textContent = on ? "🧸 Easy mode: ON (hearts refill)" : "🔥 Easy mode: OFF";
  }
  setOnlineStatus(text: string): void {
    el("online-status").textContent = text;
  }
  joinCode(): string {
    return el<HTMLInputElement>("join-code").value;
  }
  /** Room code pill during online play (null hides it). */
  setRoom(text: string | null): void {
    this.room.style.display = text ? "" : "none";
    if (text) this.room.textContent = text;
  }

  showOverlay(name: OverlayName | null): void {
    for (const [key, id] of Object.entries(OVERLAY_IDS)) {
      document.getElementById(id)!.style.display = key === name ? "flex" : "none";
    }
  }

  fillClear(starsTaken: number, starsTotal: number, timeSec: number, bonus: number, total: number): void {
    el("clear-stars").textContent = `★ ${starsTaken}/${starsTotal}`;
    el("clear-time").textContent = `Time ${Math.floor(timeSec)}s`;
    el("clear-bonus").textContent = `Time bonus +${bonus}`;
    el("clear-total").textContent = `${total}`;
  }
  fillGameOver(score: number, best: number): void {
    el("go-score").textContent = `${score}`;
    el("go-best").textContent = `${best}`;
  }
  fillWin(score: number, best: number): void {
    el("win-score").textContent = `${score}`;
    el("win-best").textContent = `${best}`;
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add("show");
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 2200);
  }

  flashHurt(): void {
    const f = el("hurt-flash");
    f.classList.remove("show");
    void f.offsetWidth; // restart the CSS animation
    f.classList.add("show");
  }
}
