/**
 * particles.ts — pooled particle bursts on a single THREE.Points (additive blending:
 * fading a point to black makes it invisible, so no per-point alpha is needed).
 * Fixed pool, zero allocation in the hot loop.
 */

import * as THREE from "three";

const MAX = 240;

interface P {
  alive: boolean;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  r: number; g: number; b: number;
  gravity: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly geo: THREE.BufferGeometry;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly pool: P[] = [];
  private cursor = 0;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) {
      this.pos[i * 3 + 1] = -9999; // parked far below the world
      this.pool.push({ alive: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, r: 1, g: 1, b: 1, gravity: 0 });
    }
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  /** Spawn `count` particles at (x,y,z) with the given color, random directions, upward bias. */
  burst(x: number, y: number, z: number, color: number, count: number, speed = 4, life = 0.7, gravity = 9): void {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const p = this.pool[i];
      p.alive = true;
      p.maxLife = p.life = life * (0.6 + Math.random() * 0.6);
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const sp = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = up * speed;
      p.r = c.r; p.g = c.g; p.b = c.b;
      p.gravity = gravity;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.pos[i * 3 + 1] = -9999;
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      p.vy -= p.gravity * dt;
      this.pos[i * 3] += p.vx * dt;
      this.pos[i * 3 + 1] += p.vy * dt;
      this.pos[i * 3 + 2] += p.vz * dt;
      const f = p.life / p.maxLife;
      this.col[i * 3] = p.r * f;
      this.col[i * 3 + 1] = p.g * f;
      this.col[i * 3 + 2] = p.b * f;
    }
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
