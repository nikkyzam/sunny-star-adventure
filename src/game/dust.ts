/**
 * dust.ts — soft little puffs kicked up by feet on sand or dirt, and a bigger ring of them when a kid
 * lands hard. Unlike the sparkly particles (which glow), these are ordinary see-through puffs that
 * grow, drift and fade, so they read as real dust rather than magic.
 */
import * as THREE from "three";

const MAX = 40;

let puffTex: THREE.CanvasTexture | null = null;
function puffTexture(): THREE.CanvasTexture {
  if (puffTex) return puffTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

interface Puff { s: THREE.Sprite; life: number; max: number; vx: number; vy: number; vz: number; size: number }

export class Dust {
  readonly group = new THREE.Group();
  private pool: Puff[] = [];
  private next = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      s.userData.hideInPhoto = false;
      this.group.add(s);
      this.pool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0.3 });
    }
  }

  /** One puff at a footstep (x, y, z), drifting back from the way the kid runs (dx, dz). */
  step(x: number, y: number, z: number, color: number, dx = 0, dz = 0): void {
    this.spawn(x, y + 0.14, z, color, -dx * 0.25 + (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.2, -dz * 0.25 + (Math.random() - 0.5) * 0.3, 0.3, 0.6);
  }

  /** A ring of puffs where a kid lands; `power` 0–1 sets how big. */
  land(x: number, y: number, z: number, color: number, power: number): void {
    const n = 4 + Math.round(power * 6);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 0.8 + power * 1.4;
      this.spawn(x + Math.cos(a) * 0.25, y + 0.16, z + Math.sin(a) * 0.25, color, Math.cos(a) * sp, 0.2 + Math.random() * 0.25, Math.sin(a) * sp, 0.36 + power * 0.2, 0.7 + power * 0.3);
    }
  }

  private spawn(x: number, y: number, z: number, color: number, vx: number, vy: number, vz: number, size: number, life: number): void {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % MAX;
    p.s.position.set(x, y, z);
    (p.s.material as THREE.SpriteMaterial).color.set(color);
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.size = size;
    p.life = p.max = life;
    p.s.visible = true;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const t = 1 - p.life / p.max; // 0 → 1 over its life
      // drift, slowing down as the air catches it
      const drag = Math.max(0, 1 - dt * 3);
      p.vx *= drag; p.vz *= drag; p.vy *= drag;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.size * (0.6 + t * 1.6));
      (p.s.material as THREE.SpriteMaterial).opacity = 0.75 * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
  }

  /** How many puffs are in the air (for tests). */
  active(): number {
    return this.pool.filter((p) => p.life > 0).length;
  }

  dispose(): void {
    for (const p of this.pool) p.s.material.dispose();
    this.group.removeFromParent();
  }
}
