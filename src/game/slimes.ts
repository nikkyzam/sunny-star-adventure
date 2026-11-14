/**
 * slimes.ts — bouncy slime enemies patrolling between two points.
 * Hazard from the side, trampoline from the top (stomping squishes them and bounces the player).
 */

import * as THREE from "three";

interface SlimeSpec {
  ax: number; az: number; bx: number; bz: number; y: number; speed: number;
}

export interface Slime {
  ax: number; az: number; bx: number; bz: number; y: number;
  speed: number;
  t: number;          // ping-pong parameter 0..1
  dir: 1 | -1;
  alive: boolean;
  squashT: number;    // >0 while playing the squish animation
  group: THREE.Group;
  body: THREE.Mesh;
  hopPhase: number;
}

const BODY_COLORS = [0x66d94e, 0x4ecbd9, 0xc96bff];

export class Slimes {
  readonly group = new THREE.Group();
  items: Slime[] = [];

  build(specs: SlimeSpec[]): void {
    this.group.clear();
    this.items = specs.map((s, i) => {
      const g = new THREE.Group();
      const color = BODY_COLORS[i % BODY_COLORS.length];
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 12),
        new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55 }),
      );
      body.scale.set(1, 0.72, 1);
      body.position.y = 0.36;
      body.castShadow = true;
      g.add(body);

      // eyes on the front (+Z, rotated to face travel direction in update)
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
        );
        eye.position.set(0.17 * sx, 0.5, 0.38);
        g.add(eye);
        const pupil = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.3 }),
        );
        pupil.position.set(0.17 * sx, 0.5, 0.48);
        g.add(pupil);
      }

      g.position.set(s.ax, s.y, s.az);
      this.group.add(g);
      return {
        ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, y: s.y,
        speed: s.speed, t: Math.random(), dir: 1 as const, alive: true,
        squashT: 0, group: g, body, hopPhase: Math.random() * 6,
      };
    });
  }

  update(dt: number, time: number): void {
    for (const s of this.items) {
      if (!s.alive) {
        if (s.squashT > 0) {
          s.squashT = Math.max(0, s.squashT - dt * 3.2);
          const k = s.squashT;
          s.group.scale.set(1 + (1 - k) * 0.8, Math.max(0.05, k * 0.7), 1 + (1 - k) * 0.8);
          if (s.squashT === 0) s.group.visible = false;
        }
        continue;
      }
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
      s.t += (s.speed * dt / len) * s.dir;
      if (s.t > 1) { s.t = 1; s.dir = -1; }
      else if (s.t < 0) { s.t = 0; s.dir = 1; }
      const x = s.ax + (s.bx - s.ax) * s.t;
      const z = s.az + (s.bz - s.az) * s.t;
      const hop = Math.abs(Math.sin(time * 5 + s.hopPhase));
      s.group.position.set(x, s.y + hop * 0.35, z);
      // squash & stretch with the hop
      const sy = 0.72 + hop * 0.25;
      s.body.scale.set(1 + (0.72 - sy + 0.28) * 0.4, sy / 0.72 * 0.72, 1 + (0.72 - sy + 0.28) * 0.4);
      // face travel direction
      const vx = (s.bx - s.ax) * s.dir;
      const vz = (s.bz - s.az) * s.dir;
      if (Math.abs(vx) + Math.abs(vz) > 0.001) {
        s.group.rotation.y = Math.atan2(vx, vz);
      }
    }
  }

  /** Mark a slime as stomped (squish animation, then it disappears). */
  stomp(s: Slime): void {
    s.alive = false;
    s.squashT = 1;
  }
}
