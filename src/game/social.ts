/**
 * social.ts — name tags and sticker bubbles that float above a kid.
 * Preset stickers only (no free-text chat): keys 1–6 or the on-screen sticker bar.
 */

import * as THREE from "three";

export const STICKERS = [
  { emoji: "👋", text: "Hi!" },
  { emoji: "⭐", text: "Wow!" },
  { emoji: "👉", text: "Follow me!" },
  { emoji: "🆘", text: "Help!" },
  { emoji: "🎉", text: "Yay!" },
  { emoji: "❤️", text: "Friends!" },
] as const;

const BUBBLE_LIFE = 2.6;

/** Billboard sprite with rounded-pill text drawn on a canvas. */
export function makeTextSprite(text: string, opts: { bg: string; fg: string; size: number; height: number }): THREE.Sprite {
  const font = `800 ${opts.size}px system-ui, "Segoe UI", sans-serif`;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  const pad = opts.size * 0.6;
  const w = Math.ceil(ctx.measureText(text).width + pad * 2);
  const h = Math.ceil(opts.size * 1.7);
  c.width = w;
  c.height = h;
  ctx.font = font;
  ctx.fillStyle = opts.bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = opts.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + opts.size * 0.06);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  sprite.scale.set((opts.height * w) / h, opts.height, 1);
  return sprite;
}

export function disposeSprite(s: THREE.Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
  s.removeFromParent();
}

/** One sticker bubble per kid; a new sticker replaces the old one. */
export class Bubble {
  private sprite: THREE.Sprite | null = null;
  private life = 0;

  constructor(private parent: THREE.Object3D, private y: number) {}

  show(index: number): void {
    const s = STICKERS[index];
    if (!s) return;
    this.clear();
    this.sprite = makeTextSprite(`${s.emoji} ${s.text}`, { bg: "rgba(255,255,255,0.95)", fg: "#4a3b6b", size: 56, height: 0.62 });
    this.sprite.position.y = this.y;
    this.parent.add(this.sprite);
    this.life = BUBBLE_LIFE;
  }

  update(dt: number): void {
    if (!this.sprite) return;
    this.life -= dt;
    const t = BUBBLE_LIFE - this.life;
    const pop = Math.min(1, t * 6);
    this.sprite.position.y = this.y + Math.sin(t * 4) * 0.04;
    this.sprite.material.opacity = Math.min(1, this.life * 2) * pop;
    if (this.life <= 0) this.clear();
  }

  clear(): void {
    if (this.sprite) disposeSprite(this.sprite);
    this.sprite = null;
  }
}
