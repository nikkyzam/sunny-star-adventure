/**
 * hud.ts — DOM heads-up display + overlay screens. The DOM lives in src/pages/Home.tsx;
 * this module caches elements, updates them on change, and routes button actions to the game.
 */

export type HudAction =
  | "play" | "play2" | "continue" | "resume" | "retry" | "next" | "title" | "again" | "jump" | "mute"
  | "online" | "host" | "join" | "back" | "reroll" | "easy" | "drive" | "car" | "honk"
  | "dress" | "island" | "city" | "ark" | "talk" | "verse-ready" | "verse-check" | "verse-peek"
  | "teach" | "gate-ok" | "class-start" | "family" | "own-add" | "book" | "book-close" | "class-link";

type OverlayName = "title" | "pause" | "gameover" | "clear" | "win" | "online" | "dress" | "verse" | "gate" | "teach" | "book";

const OVERLAY_IDS: Record<OverlayName, string> = {
  title: "ov-title",
  pause: "ov-pause",
  gameover: "ov-gameover",
  clear: "ov-clear",
  win: "ov-win",
  online: "ov-online",
  dress: "ov-dress",
  verse: "ov-verse",
  gate: "ov-gate",
  teach: "ov-teach",
  book: "ov-book",
};

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`HUD element #${id} missing from Home.tsx`);
  return e as T;
}

/** A clicked button keeps keyboard focus, so the next Space / Enter would click it again. */
function unfocus(e: Event): void {
  (e.currentTarget as HTMLElement | null)?.blur();
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
  private job = el("hud-job");
  private toast = el("toast");
  private topbar = el("hud-top");
  private jumpBtn = el("btn-jump");
  private muteBtn = el("btn-mute");
  private room = el("hud-room");
  private carBtn = el("btn-car");
  private honkBtn = el("btn-honk");
  private carMode: string | null = null;
  private talkBtn = el("btn-talk");
  private bookBtn = el("btn-book");
  private bookText: string | null = null;
  private talkShown = false;
  private dialog = el("dialog");
  private dialogTimer: number | null = null;
  private stickerBar = el("sticker-bar");
  private onStickerCb: ((i: number) => void) | null = null;
  /** True while a finger is holding the on-screen jump button (hold = glide). */
  jumpHeld = false;

  constructor() {
    const bind = (elm: HTMLElement, action: HudAction) => {
      const fn = (e: Event) => {
        e.preventDefault();
        unfocus(e);
        this.onActionCb?.(action);
      };
      elm.addEventListener("click", fn);
      this.unsub.push(() => elm.removeEventListener("click", fn));
    };
    document.querySelectorAll<HTMLElement>("[data-action]").forEach((b) => {
      bind(b, b.dataset.action as HudAction);
    });
    bind(this.muteBtn, "mute");
    // In-game buttons act on press, not on click: iPad sends no click for a second finger while
    // the other thumb is steering, and a click waits for the finger to lift.
    const press = (elm: HTMLElement, action: HudAction) => {
      const fn = (e: Event) => {
        e.preventDefault();
        this.onActionCb?.(action);
      };
      elm.addEventListener("pointerdown", fn);
      this.unsub.push(() => elm.removeEventListener("pointerdown", fn));
    };
    press(this.carBtn, "car");
    press(this.honkBtn, "honk");
    press(this.talkBtn, "talk");
    press(this.bookBtn, "book");
    // jump: press to jump, keep holding to glide
    const jumpDown = (e: PointerEvent) => {
      e.preventDefault();
      this.jumpHeld = true;
      try { this.jumpBtn.setPointerCapture(e.pointerId); } catch { /* fine without capture */ }
      this.onActionCb?.("jump");
    };
    const jumpUp = () => { this.jumpHeld = false; };
    this.jumpBtn.addEventListener("pointerdown", jumpDown);
    this.jumpBtn.addEventListener("pointerup", jumpUp);
    this.jumpBtn.addEventListener("pointercancel", jumpUp);
    this.unsub.push(() => {
      this.jumpBtn.removeEventListener("pointerdown", jumpDown);
      this.jumpBtn.removeEventListener("pointerup", jumpUp);
      this.jumpBtn.removeEventListener("pointercancel", jumpUp);
    });
    const noMenu = (e: Event) => e.preventDefault(); // iOS long-press menu on a held button
    document.addEventListener("contextmenu", noMenu);
    this.unsub.push(() => document.removeEventListener("contextmenu", noMenu));
  }

  dispose(): void {
    for (const off of this.unsub) off();
    this.unsub = [];
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    if (this.dialogTimer !== null) clearTimeout(this.dialogTimer);
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
  /** The delivery job in progress (null hides it). */
  setJob(text: string | null): void {
    this.job.style.display = text ? "" : "none";
    if (text) this.job.textContent = text;
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
    document.body.classList.toggle("playing", playing);
    if (!playing) this.jumpHeld = false;
    this.stickerBar.style.display = playing ? "" : "none";
    this.bookBtn.style.display = playing && this.bookText ? "" : "none";
    if (!playing) {
      this.setCarUi(null);
      this.setTalk(false);
      this.dialog.classList.remove("show");
    }
  }

  /** Ride buttons: "in" = a kid is next to the car / boat, "out" = riding, null = hidden. */
  setCarUi(mode: "in" | "out" | null, icon = "🚗"): void {
    const key = mode ? mode + icon : null;
    if (key === this.carMode) return;
    this.carMode = key;
    this.carBtn.style.display = mode ? "" : "none";
    this.honkBtn.style.display = mode === "out" ? "" : "none";
    if (mode) this.carBtn.textContent = mode === "in" ? `${icon} Hop in` : "🚪 Hop out";
  }

  /** Talk button: shown while a villager is within reach. */
  setTalk(show: boolean): void {
    if (show === this.talkShown) return;
    this.talkShown = show;
    this.talkBtn.style.display = show ? "" : "none";
  }

  /** The verse book button, e.g. "📖 1/3" (null hides it: no grown-up's verses are on). */
  setBook(text: string | null): void {
    this.bookText = text;
    if (text) this.bookBtn.textContent = text;
    this.bookBtn.style.display = text && document.body.classList.contains("playing") ? "" : "none";
  }

  /** Memory verse screen: show the verse to learn. `fromBook` adds a way back to the verse book. */
  showVerse(ref: string, text: string, fromBook = false): void {
    el("verse-back").style.display = fromBook ? "" : "none";
    el("verse-ref").textContent = ref;
    el("verse-text").textContent = text;
    el<HTMLTextAreaElement>("verse-input").value = "";
    el("verse-feedback").textContent = "";
    this.verseStage(false);
  }

  /** typing = true hides the verse and shows the box to type it in; false shows the verse again. */
  verseStage(typing: boolean): void {
    el("verse-text").style.display = typing ? "none" : "";
    el("verse-learn").style.display = typing ? "none" : "";
    el("verse-type").style.display = typing ? "" : "none";
    if (typing) el<HTMLTextAreaElement>("verse-input").focus();
  }

  verseInput(): string {
    return el<HTMLTextAreaElement>("verse-input").value;
  }

  /** After a wrong try: the verse with the words they got in green and the rest as blanks. */
  setVerseFeedback(note: string, words: { word: string; ok: boolean }[]): void {
    const box = el("verse-feedback");
    box.textContent = "";
    for (const w of words) {
      const span = document.createElement("span");
      span.className = w.ok ? "got" : "miss";
      span.textContent = w.ok ? w.word : "_".repeat(Math.max(3, w.word.length));
      box.append(span, " ");
    }
    const p = document.createElement("span");
    p.className = "note";
    p.textContent = note;
    box.append(p);
  }

  /** A villager's speech box (hides itself after a few seconds). */
  showDialog(name: string, text: string, ms = 5200): void {
    el("dialog-name").textContent = name;
    el("dialog-text").textContent = text;
    this.dialog.classList.add("show");
    if (this.dialogTimer !== null) clearTimeout(this.dialogTimer);
    this.dialogTimer = window.setTimeout(() => this.dialog.classList.remove("show"), ms);
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
      b.addEventListener("pointerdown", fn);
      this.unsub.push(() => b.removeEventListener("pointerdown", fn));
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

  /** Skin-tone swatches on the dress-up screen. */
  buildSkins(colors: number[], selected: number, cb: (i: number) => void): void {
    this.buildChoices("skins", colors.length, selected, cb, (b, i) => {
      b.style.background = `#${colors[i].toString(16).padStart(6, "0")}`;
      b.setAttribute("aria-label", `Skin tone ${i + 1}`);
    });
  }

  /** Pet buttons on the dress-up screen. */
  buildPets(labels: string[], selected: number, cb: (i: number) => void): void {
    this.buildChoices("pets", labels.length, selected, cb, (b, i) => {
      b.textContent = labels[i];
      b.classList.add("hat");
      b.setAttribute("aria-label", i === 0 ? "No pet" : `Pet ${i}`);
    });
  }

  /** A row of color swatches (hair colors). */
  buildColors(boxId: string, colors: number[], selected: number, cb: (i: number) => void): void {
    this.buildChoices(boxId, colors.length, selected, cb, (b, i) => {
      b.style.background = `#${colors[i].toString(16).padStart(6, "0")}`;
      b.setAttribute("aria-label", `Color ${i + 1}`);
    });
  }

  /** A row of emoji or word buttons (clothes, glasses, hair styles). */
  buildLabels(boxId: string, labels: string[], selected: number, cb: (i: number) => void, wordy = false): void {
    this.buildChoices(boxId, labels.length, selected, cb, (b, i) => {
      b.textContent = labels[i];
      b.classList.add(wordy ? "word" : "hat");
      b.setAttribute("aria-label", labels[i]);
    });
  }

  /** Highlight the chosen swatch in a choice row ("outfits" / "skins" / "hats" / "pets"). */
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
      const fn = (e: Event) => { e.preventDefault(); unfocus(e); cb(i); };
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
