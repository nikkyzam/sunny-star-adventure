/**
 * props.ts — things to bump into, on foot or in the car:
 *   cones       knock them flying (+5)
 *   gift boxes  smash them open (+20 and a coin)
 *   balls       big beach balls to kick or ram around; they roll, bounce and come back
 *   boost pads  the car gets a burst of speed (driving the way the arrows point)
 *   ramps       the car jumps (driving up the slope)
 * Props are local to each kid's game (not synced online). update() reports what happened this
 * step through a reused event list; boot.ts turns events into score, sound and particles.
 */

import * as THREE from "three";
import type { World } from "./world";
import type { Player } from "./player";
import type { Car } from "./car";

export interface PropDefs {
  cones?: [number, number, number][];
  boxes?: [number, number, number][];
  balls?: [number, number, number][];
  boosts?: [number, number, number, number][]; // x, y, z, heading (arrow direction)
  ramps?: [number, number, number, number][];
}

export interface PropEvent {
  type: "cone" | "box" | "ball" | "boost" | "ramp";
  x: number; y: number; z: number;
}

interface Cone { mesh: THREE.Mesh; vel: THREE.Vector3; flying: boolean; done: boolean }
interface Box { mesh: THREE.Mesh; smashed: boolean }
interface Ball { mesh: THREE.Mesh; vel: THREE.Vector3; home: THREE.Vector3; kickCd: number }
interface Pad { mesh: THREE.Object3D; heading: number; cooldown: number }

const BALL_R = 0.6;
const GRAVITY = 30;
const BOX_COLORS = [0xff6b9d, 0x5cb8ff, 0x7ed957, 0xb197fc, 0xffa94d];
const BALL_COLORS = [0xff4757, 0x5cb8ff, 0xffd93d];

export class Props {
  readonly group = new THREE.Group();
  readonly events: PropEvent[] = [];
  conesKnocked = 0;
  boxesSmashed = 0;

  private cones: Cone[] = [];
  private boxes: Box[] = [];
  private balls: Ball[] = [];
  private boosts: Pad[] = [];
  private ramps: Pad[] = [];

  build(defs: PropDefs): void {
    this.disposeMeshes();
    this.cones = [];
    this.boxes = [];
    this.balls = [];
    this.boosts = [];
    this.ramps = [];
    this.conesKnocked = 0;
    this.boxesSmashed = 0;

    const add = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
      o.position.set(x, y, z);
      this.group.add(o);
      return o;
    };

    for (const [x, y, z] of defs.cones ?? []) {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.7, 10),
        new THREE.MeshStandardMaterial({ color: 0xff7a1a, flatShading: true, roughness: 0.7 }),
      );
      mesh.castShadow = true;
      this.cones.push({ mesh: add(mesh, x, y + 0.35, z), vel: new THREE.Vector3(), flying: false, done: false });
    }

    (defs.boxes ?? []).forEach(([x, y, z], i) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshStandardMaterial({ color: BOX_COLORS[i % BOX_COLORS.length], flatShading: true, roughness: 0.7 }),
      );
      mesh.castShadow = true;
      const ribbon = new THREE.Mesh(
        new THREE.BoxGeometry(0.94, 0.94, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xfff6e5, flatShading: true, roughness: 0.6 }),
      );
      mesh.add(ribbon);
      this.boxes.push({ mesh: add(mesh, x, y + 0.45, z), smashed: false });
    });

    (defs.balls ?? []).forEach(([x, y, z], i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_R, 12, 8),
        new THREE.MeshStandardMaterial({ color: BALL_COLORS[i % BALL_COLORS.length], flatShading: true, roughness: 0.5 }),
      );
      mesh.castShadow = true;
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(BALL_R * 0.99, 0.07, 6, 18),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
      );
      mesh.add(band);
      add(mesh, x, y + BALL_R, z);
      this.balls.push({ mesh, vel: new THREE.Vector3(), home: mesh.position.clone(), kickCd: 0 });
    });

    for (const [x, y, z, h] of defs.boosts ?? []) {
      const g = new THREE.Group();
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.06, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x29d3a2, emissive: 0x0a6a4a, flatShading: true, roughness: 0.5 }),
      );
      g.add(pad);
      for (const off of [-0.55, 0.25]) {
        const arrow = new THREE.Mesh(
          new THREE.ConeGeometry(0.55, 0.8, 3),
          new THREE.MeshStandardMaterial({ color: 0xfff6b8, emissive: 0x8a7a20, flatShading: true }),
        );
        arrow.rotation.x = Math.PI / 2; // point along +Z (the pad's forward)
        arrow.scale.z = 0.15;
        arrow.position.set(0, 0.06, off);
        g.add(arrow);
      }
      g.rotation.y = h;
      this.boosts.push({ mesh: add(g, x, y + 0.1, z), heading: h, cooldown: 0 });
    }

    for (const [x, y, z, h] of defs.ramps ?? []) {
      const g = new THREE.Group();
      const wedge = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.12, 2.2),
        new THREE.MeshStandardMaterial({ color: 0xffa94d, flatShading: true, roughness: 0.7 }),
      );
      wedge.rotation.x = -0.32; // rises toward +Z
      wedge.position.y = 0.36;
      wedge.castShadow = true;
      g.add(wedge);
      for (const sx of [-1, 1]) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.14, 2.2),
          new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }),
        );
        stripe.rotation.x = -0.32;
        stripe.position.set(0.9 * sx, 0.37, 0);
        g.add(stripe);
      }
      g.rotation.y = h;
      this.ramps.push({ mesh: add(g, x, y, z), heading: h, cooldown: 0 });
    }
  }

  /** One fixed step. `car` is null when the level has none. */
  update(dt: number, world: World, players: Player[], car: Car | null): PropEvent[] {
    const ev = this.events;
    ev.length = 0;
    const carOn = car !== null && car.occupied;
    const carFast = carOn && Math.abs(car.speed) > 1.5;

    // cones: knocked by a moving car or a kid running into them
    for (const c of this.cones) {
      const p = c.mesh.position;
      if (c.flying) {
        c.vel.y -= GRAVITY * dt;
        p.addScaledVector(c.vel, dt);
        c.mesh.rotation.x += dt * 9;
        c.mesh.rotation.z += dt * 6;
        const g = world.groundAt(p.x, p.z, p.y + 0.2);
        if (g && c.vel.y < 0 && p.y <= g.y + 0.2) {
          // come to rest lying on its side
          p.y = g.y + 0.2;
          c.mesh.rotation.set(Math.PI / 2, 0, c.mesh.rotation.z);
          c.flying = false;
        } else if (p.y < -20) {
          c.mesh.visible = false;
          c.flying = false;
        }
        continue;
      }
      if (c.done) continue;
      let hitX = 0, hitZ = 0, power = 0;
      if (carFast && near(p, car.pos, 1.5, 1.5)) {
        hitX = p.x - car.pos.x; hitZ = p.z - car.pos.z; power = 5 + Math.abs(car.speed) * 0.6;
      } else {
        for (const k of players) {
          if (!k.riding && near(p, k.pos, 0.6, 1.2) && Math.hypot(k.vel.x, k.vel.z) > 1) {
            hitX = p.x - k.pos.x; hitZ = p.z - k.pos.z; power = 4;
            break;
          }
        }
      }
      if (power > 0) {
        const len = Math.hypot(hitX, hitZ) || 1;
        c.vel.set((hitX / len) * power, 4 + power * 0.5, (hitZ / len) * power);
        c.flying = true;
        c.done = true;
        this.conesKnocked++;
        ev.push({ type: "cone", x: p.x, y: p.y, z: p.z });
      }
    }

    // gift boxes: smashed by the car or by a kid touching them
    for (const b of this.boxes) {
      if (b.smashed) continue;
      const p = b.mesh.position;
      b.mesh.rotation.y += dt * 0.8;
      let hit = carFast && near(p, car.pos, 1.7, 1.6);
      if (!hit) hit = players.some((k) => !k.riding && near(p, k.pos, 0.95, 1.4));
      if (hit) {
        b.smashed = true;
        b.mesh.visible = false;
        this.boxesSmashed++;
        ev.push({ type: "box", x: p.x, y: p.y, z: p.z });
      }
    }

    // balls: kicked by kids, rammed by the car; roll, bounce off walls, respawn when lost
    for (const b of this.balls) {
      const p = b.mesh.position;
      b.kickCd -= dt;
      let kx = 0, kz = 0, kick = 0;
      if (carOn && near(p, car.pos, 1.7, 1.6)) {
        kx = p.x - car.pos.x; kz = p.z - car.pos.z; kick = Math.max(5, Math.abs(car.speed) * 1.4);
      } else {
        for (const k of players) {
          if (!k.riding && near(p, k.pos, BALL_R + 0.45, 1.5)) {
            kx = p.x - k.pos.x; kz = p.z - k.pos.z; kick = Math.max(5, Math.hypot(k.vel.x, k.vel.z) * 1.4);
            break;
          }
        }
      }
      if (kick > 0) {
        const len = Math.hypot(kx, kz) || 1;
        b.vel.x = (kx / len) * kick;
        b.vel.z = (kz / len) * kick;
        if (b.kickCd <= 0) {
          b.vel.y = Math.max(b.vel.y, 3 + kick * 0.25);
          b.kickCd = 0.3;
          ev.push({ type: "ball", x: p.x, y: p.y, z: p.z });
        }
      }
      b.vel.y -= GRAVITY * dt;
      const bx = p.x, bz = p.z;
      p.addScaledVector(b.vel, dt);
      const mx = p.x, mz = p.z;
      world.resolveSolids(p, BALL_R);
      if (p.x !== mx) b.vel.x *= -0.6; // bounced off a wall
      if (p.z !== mz) b.vel.z *= -0.6;
      const g = world.groundAt(p.x, p.z, p.y - BALL_R + 0.3);
      if (g && b.vel.y <= 0 && p.y - BALL_R <= g.y) {
        p.y = g.y + BALL_R;
        b.vel.y = b.vel.y < -3 ? -b.vel.y * 0.5 : 0;
        const drag = Math.max(0, 1 - dt * 1.2);
        b.vel.x *= drag;
        b.vel.z *= drag;
      }
      // roll
      b.mesh.rotation.z -= ((p.x - bx) / BALL_R);
      b.mesh.rotation.x += ((p.z - bz) / BALL_R);
      if (p.y < -14) {
        p.copy(b.home);
        b.vel.set(0, 0, 0);
      }
    }

    // boost pads and ramps: car only, and only when driving the way they point — a pad never
    // launches a car backwards off the island
    for (const pad of this.boosts) {
      pad.cooldown -= dt;
      if (carOn && pad.cooldown <= 0 && car.speed > 1 && Math.cos(car.heading - pad.heading) > 0.4
        && near(pad.mesh.position, car.pos, 1.7, 1)) {
        car.boost();
        pad.cooldown = 1.5;
        ev.push({ type: "boost", x: car.pos.x, y: car.pos.y, z: car.pos.z });
      }
    }
    for (const pad of this.ramps) {
      pad.cooldown -= dt;
      if (carOn && pad.cooldown <= 0 && car.speed > 5 && Math.cos(car.heading - pad.heading) > 0.5
        && near(pad.mesh.position, car.pos, 1.6, 1)) {
        if (car.jump(6 + car.speed * 0.3)) {
          pad.cooldown = 1;
          ev.push({ type: "ramp", x: car.pos.x, y: car.pos.y, z: car.pos.z });
        }
      }
    }
    return ev;
  }

  private disposeMeshes(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
  }
}

/** Within `r` horizontally and `h` vertically. */
function near(a: THREE.Vector3, b: THREE.Vector3, r: number, h: number): boolean {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz < r * r && Math.abs(a.y - b.y) < h;
}
