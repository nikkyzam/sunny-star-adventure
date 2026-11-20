/**
 * photo.ts — photo mode. The 📸 button swings the camera round to face the kid, counts down
 * 3-2-1 while the kid strikes a pose, then frames the shot as a postcard with a Bible verse.
 *
 * Child safety: the kid only ever sees the postcard and this play session's album. Saving or
 * sharing it (the share sheet on a tablet, a download on a computer) sits behind the same
 * grown-up maths question as the teacher screen. Nothing is uploaded anywhere; the album is
 * kept in memory only, so it is gone when the page closes. The postcard carries no name.
 */

import { LIBRARY, type Verse } from "./verses";
import { makeGate } from "./lesson";

const W = 1200;                 // postcard width (px)
const BORDER = 40;
const CAPTION_H = 230;
const ALBUM_MAX = 8;
const UNLOCK_MS = 10 * 60 * 1000; // after the maths question, saving stays open for 10 minutes

/** Short verses that read well under a photo (picked at random for each postcard). */
const SHORT: Verse[] = LIBRARY.filter((v) => v.text.length <= 110 && v.ref !== "John 11:35"); // (not "Jesus wept" on a happy postcard)
/** In Bethlehem the postcard carries a Christmas verse. */
const CHRISTMAS: Verse[] = LIBRARY.filter((v) => ["Luke 2:10", "Luke 2:11", "Luke 2:14", "Matthew 2:2", "Matthew 1:21"].includes(v.ref) && v.text.length <= 130);

export interface PhotoHooks {
  /** The postcard was taken; boot pauses the game while the album is open. */
  opened(): void;
  /** "Keep playing" (or Escape): boot resumes the game. */
  closed(): void;
  /** Tap sound etc. */
  sfx(id: "ui" | "star" | "unlock"): void;
}

export class PhotoMode {
  private album: string[] = [];          // postcard data URLs, newest first
  private shown = 0;
  private gate: { question: string; answer: number } | null = null;
  private unlockedUntil = 0;
  private root: HTMLDivElement;
  private img: HTMLImageElement;
  private strip: HTMLDivElement;
  private gateBox: HTMLDivElement;
  private gateQ: HTMLSpanElement;
  private gateIn: HTMLInputElement;
  private status: HTMLParagraphElement;
  private countEl: HTMLDivElement;
  private flashEl: HTMLDivElement;
  open = false;

  constructor(private readonly hooks: PhotoHooks) {
    const host = document.getElementById("ov-title")?.parentElement ?? document.body;
    this.countEl = div("photo-count");
    this.flashEl = div("photo-flash");
    host.append(this.countEl, this.flashEl);

    this.root = div("overlay photo-overlay");
    this.root.id = "ov-photo";
    this.root.style.display = "none";
    this.root.innerHTML = `
      <div class="panel photo-panel">
        <h2>Say cheese! 📸</h2>
        <img class="photo-card" alt="Your postcard" />
        <div class="photo-strip"></div>
        <div class="photo-gate" style="display:none">
          <p class="tagline">Grown-ups only: to save or share this picture, please answer</p>
          <p class="gate-q">What is <span class="photo-gate-q"></span>?</p>
          <div class="photo-gate-row">
            <input class="code-input photo-gate-in" inputmode="numeric" maxlength="3" autocomplete="off" aria-label="Answer" />
            <button class="big-btn primary" data-photo="gate-ok">✔ OK</button>
          </div>
        </div>
        <p class="stat-line photo-status"></p>
        <div class="btn-row photo-btns">
          <button class="big-btn" data-photo="save">💾 Save (grown-ups)</button>
          <button class="big-btn primary" data-photo="close">▶ Keep playing</button>
        </div>
      </div>`;
    host.append(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.img = q("img");
    this.strip = q(".photo-strip");
    this.gateBox = q(".photo-gate");
    this.gateQ = q(".photo-gate-q");
    this.gateIn = q(".photo-gate-in");
    this.status = q(".photo-status");
    this.root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-photo]");
      if (!b) return;
      e.preventDefault();
      b.blur();
      const what = b.dataset.photo;
      if (what === "close") this.close();
      else if (what === "save") this.askSave();
      else if (what === "gate-ok") this.checkGate();
      else if (what === "thumb") this.show(Number(b.dataset.i));
    });
    this.gateIn.addEventListener("keydown", (e) => {
      e.stopPropagation(); // typing digits must not send stickers or jump
      if (e.key === "Enter") this.checkGate();
    });
  }

  /** Big countdown numbers over the game ("" hides them). */
  count(text: string): void {
    this.countEl.textContent = text;
    this.countEl.classList.toggle("show", text !== "");
    if (text) {
      // restart the pop animation
      this.countEl.classList.remove("pop");
      void this.countEl.offsetWidth;
      this.countEl.classList.add("pop");
    }
  }

  /** Turn the rendered frame into a postcard and open the album on it. */
  take(frame: HTMLCanvasElement, place: string): void {
    this.count("");
    this.flashEl.classList.remove("go");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("go");
    const pool = place === "Bethlehem" && CHRISTMAS.length ? CHRISTMAS : SHORT;
    const verse = pool[Math.floor(Math.random() * pool.length)] ?? LIBRARY[0];
    this.root.querySelector("h2")!.textContent = "Say cheese! 📸";
    const url = postcard(frame, place, verse).toDataURL("image/jpeg", 0.9);
    this.album.unshift(url);
    if (this.album.length > ALBUM_MAX) this.album.length = ALBUM_MAX;
    this.show(0);
    this.gateBox.style.display = "none";
    this.status.textContent = this.album.length > 1 ? "Tap a little picture to see your other photos." : "";
    this.root.style.display = "";
    this.open = true;
    this.hooks.sfx("star");
    this.hooks.opened();
  }

  /** Put a ready-made card (the Royal Explorer certificate) in the album and open it. */
  showCard(card: HTMLCanvasElement, note: string): void {
    this.root.querySelector("h2")!.textContent = "Well done! 🏆";
    this.album.unshift(card.toDataURL("image/png"));
    if (this.album.length > ALBUM_MAX) this.album.length = ALBUM_MAX;
    this.show(0);
    this.gateBox.style.display = "none";
    this.status.textContent = note;
    this.root.style.display = "";
    this.open = true;
    this.hooks.sfx("star");
    this.hooks.opened();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.style.display = "none";
    this.gate = null;
    this.hooks.sfx("ui");
    this.hooks.closed();
  }

  /** Leaving the level / game: hide everything without resuming. */
  reset(): void {
    this.open = false;
    this.root.style.display = "none";
    this.count("");
  }

  private show(i: number): void {
    this.shown = Math.max(0, Math.min(i, this.album.length - 1));
    this.img.src = this.album[this.shown];
    this.strip.innerHTML = this.album.length > 1
      ? this.album.map((u, k) => `<button class="photo-thumb${k === this.shown ? " on" : ""}" data-photo="thumb" data-i="${k}"><img src="${u}" alt="Photo ${k + 1}" /></button>`).join("")
      : "";
  }

  private askSave(): void {
    this.hooks.sfx("ui");
    if (Date.now() < this.unlockedUntil) {
      void this.save();
      return;
    }
    this.gate = makeGate();
    this.gateQ.textContent = this.gate.question;
    this.gateIn.value = "";
    this.gateBox.style.display = "";
    this.status.textContent = "";
    this.gateIn.focus();
  }

  private checkGate(): void {
    if (!this.gate) return;
    if (Number(this.gateIn.value.trim()) !== this.gate.answer) {
      this.gate = makeGate();
      this.gateQ.textContent = this.gate.question;
      this.gateIn.value = "";
      this.status.textContent = "Not quite. Please ask a grown-up to help!";
      return;
    }
    this.gate = null;
    this.gateBox.style.display = "none";
    this.unlockedUntil = Date.now() + UNLOCK_MS;
    this.hooks.sfx("unlock");
    void this.save();
  }

  /** Tablets and phones: the share sheet (Save Image, Messages…). Computers: a download. */
  private async save(): Promise<void> {
    const url = this.album[this.shown];
    if (!url) return;
    const name = `sunny-star-photo-${new Date().toISOString().slice(0, 10)}.jpg`;
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], name, { type: "image/jpeg" });
      const touch = document.body.classList.contains("touch");
      if (touch && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Sunny Star Adventure" });
        this.status.textContent = "Shared! 💛";
        return;
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // the grown-up closed the share sheet
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    this.status.textContent = "Saved to your downloads! 💛";
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}

/** The postcard: the shot in a cream frame, a verse underneath, the game's name and the place. */
export function postcard(frame: HTMLCanvasElement, place: string, verse: Verse): HTMLCanvasElement {
  const photoW = W - BORDER * 2;
  // follows the screen: wide on a tablet or computer, tall on a phone held upright (so no heads are cut off)
  const photoH = Math.round(photoW * Math.min(1.3, Math.max(0.5625, frame.height / frame.width)));
  const H = BORDER + photoH + CAPTION_H;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const font = `"Comic Sans MS", "Chalkboard SE", "Baloo 2", "Segoe UI", sans-serif`;

  // card
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fffaf0");
  bg.addColorStop(1, "#fff1d6");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // the photo, cropped to fill, with rounded corners
  const sAspect = frame.width / frame.height, dAspect = photoW / photoH;
  let sx = 0, sy = 0, sw = frame.width, sh = frame.height;
  if (sAspect > dAspect) { sw = frame.height * dAspect; sx = (frame.width - sw) / 2; }
  else { sh = frame.width / dAspect; sy = (frame.height - sh) / 2; }
  g.save();
  roundRect(g, BORDER, BORDER, photoW, photoH, 26);
  g.clip();
  g.drawImage(frame, sx, sy, sw, sh, BORDER, BORDER, photoW, photoH);
  g.restore();
  g.lineWidth = 6;
  g.strokeStyle = "#ffffff";
  roundRect(g, BORDER, BORDER, photoW, photoH, 26);
  g.stroke();

  // a few stickers on the corners of the photo
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `64px ${font}`;
  g.fillText("⭐", BORDER + 18, BORDER + 18);
  g.font = `52px ${font}`;
  g.fillText("☀️", W - BORDER - 16, BORDER + 16);

  // the verse
  const top = BORDER + photoH;
  g.fillStyle = "#5b3fa0";
  let size = 34;
  let lines: string[] = [];
  for (; size >= 24; size -= 2) {
    g.font = `italic ${size}px ${font}`;
    lines = wrap(g, `“${verse.text}”`, W - BORDER * 4);
    if (lines.length <= 3) break;
  }
  const lineH = size * 1.25;
  const block = lines.length * lineH + 40;
  let y = top + (CAPTION_H - 56 - block) / 2 + lineH / 2 + 8;
  for (const line of lines) {
    g.fillText(line, W / 2, y);
    y += lineH;
  }
  g.font = `bold 26px ${font}`;
  g.fillStyle = "#8a6d3b";
  g.fillText(`— ${verse.ref}`, W / 2, y + 4);

  // footer: game name on the left, the place on the right
  const fy = H - 34;
  g.font = `bold 28px ${font}`;
  g.textAlign = "left";
  g.fillStyle = "#ff8c1a";
  g.fillText("☀️ Sunny Star Adventure", BORDER, fy);
  g.textAlign = "right";
  g.fillStyle = "#3d7bd9";
  g.font = `24px ${font}`;
  g.fillText(`📍 ${place}`, W - BORDER, fy);
  return c;
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
