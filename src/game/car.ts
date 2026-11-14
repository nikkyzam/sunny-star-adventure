/**
 * car.ts — the Toy City car: arcade driving, wall bumps via world.resolveSolids,
 * ground follow, and two seats (one driver, one passenger — perfect for co-op).
 * The driver controls with their normal move keys; E boards/exits.
 */

import * as THREE from "three";
import type { World } from "./world";
import type { Player } from "./player";

const ACCEL = 16;
const MAX_SPEED = 13;
const MAX_REVERSE = 5;
const DRAG = 7;           // passive slow-down per second
const STEER = 2.3;
const KILL_Y = -12;
const BOOST_SPEED = 18;   // top speed while a boost pad is active
const BOOST_TIME = 0.8;

export class Car {
  readonly group = new THREE.Group();
  heading = 0;
  speed = 0;
  driver: Player | null = null;
  passenger: Player | null = null;
  fellOff = false; // set when the car drops off the world; boot handles the consequences

  private spawnPos = new THREE.Vector3();
  private spawnHeading = 0;
  private wheels: THREE.Mesh[] = [];
  private vy = 0;
  private boostT = 0;

  constructor() {
    const red = new THREE.MeshStandardMaterial({ color: 0xff4757, flatShading: true, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfefff, flatShading: true, roughness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.5 });
    const light = new THREE.MeshStandardMaterial({ color: 0xfff6b8, emissive: 0x8a7a20, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.5, 2.2), red);
    body.position.y = 0.55;
    body.castShadow = true;
    this.group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 1.0), glass);
    cabin.position.set(0, 1.0, -0.25);
    cabin.castShadow = true;
    this.group.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 14);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.rotation.z = Math.PI / 2;
      w.position.set(0.62 * sx, 0.32, 0.72 * sz);
      w.castShadow = true;
      this.group.add(w);
      this.wheels.push(w);
    }
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), light);
      lamp.position.set(0.32 * sx, 0.55, 1.11);
      this.group.add(lamp);
    }
  }

  get pos(): THREE.Vector3 {
    return this.group.position;
  }

  place(x: number, y: number, z: number, heading: number): void {
    this.spawnPos.set(x, y, z);
    this.spawnHeading = heading;
    this.respawn();
  }

  respawn(): void {
    this.pos.copy(this.spawnPos);
    this.heading = this.spawnHeading;
    this.group.rotation.y = this.heading;
    this.speed = 0;
    this.vy = 0;
    this.boostT = 0;
    this.fellOff = false;
  }

  /** Wheels off the ground (after a hop or a ramp). */
  get airborne(): boolean {
    return this.vy !== 0;
  }

  get boosting(): boolean {
    return this.boostT > 0;
  }

  /** Boost pad: a burst of extra speed in the direction the car is facing. */
  boost(): void {
    this.boostT = BOOST_TIME;
    this.speed = BOOST_SPEED;
  }

  /** Hop / ramp launch. Only from the ground. Returns whether the car took off. */
  jump(v: number): boolean {
    if (this.vy !== 0) return false;
    this.vy = v;
    this.pos.y += 0.06; // lift off the ground so the fall branch takes over
    return true;
  }

  /** Board the car: first free seat wins. Returns the seat taken, or null when full. */
  board(p: Player): "driver" | "passenger" | null {
    if (this.driver === p || this.passenger === p) return null;
    // riders skip the controller, so a hurt-blink would freeze mid-flash: end it on boarding
    p.invuln = 0;
    p.group.visible = true;
    if (!this.driver) {
      this.driver = p;
      p.riding = true;
      return "driver";
    }
    if (!this.passenger) {
      this.passenger = p;
      p.riding = true;
      return "passenger";
    }
    return null;
  }

  /** Step out next to the car. */
  exit(p: Player): void {
    if (this.driver === p) this.driver = null;
    else if (this.passenger === p) this.passenger = null;
    else return;
    p.riding = false;
    const side = Math.sign(Math.random() - 0.5) || 1;
    p.pos.set(
      this.pos.x + Math.cos(this.heading) * 1.6 * side,
      this.pos.y + 0.1,
      this.pos.z - Math.sin(this.heading) * 1.6 * side,
    );
    p.vel.set(0, 0, 0);
  }

  has(p: Player): boolean {
    return this.driver === p || this.passenger === p;
  }
  get occupied(): boolean {
    return this.driver !== null || this.passenger !== null;
  }

  /** One fixed step. axes = the driver's move input (z forward, x steer). */
  update(dt: number, axX: number, axZ: number, world: World): void {
    // speed toward target
    if (this.boostT > 0) this.boostT -= dt;
    const max = this.boostT > 0 ? BOOST_SPEED : MAX_SPEED;
    if (axZ > 0.1) {
      if (this.speed < max) this.speed = Math.min(max, this.speed + ACCEL * axZ * dt);
    } else if (axZ < -0.1) this.speed = Math.max(-MAX_REVERSE, this.speed - ACCEL * 0.8 * dt);
    else {
      const slow = DRAG * dt;
      if (Math.abs(this.speed) <= slow) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * slow;
    }
    if (this.speed > max) this.speed = Math.max(max, this.speed - 25 * dt); // ease out of a boost
    // steering (only meaningful while moving)
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 4) * Math.sign(this.speed || 1);
    this.heading -= axX * STEER * steerAuthority * dt;
    this.group.rotation.y = this.heading;

    // move
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;

    // bump walls
    const bx = this.pos.x, bz = this.pos.z;
    world.resolveSolids(this.pos, 0.95);
    if (Math.abs(this.pos.x - bx) + Math.abs(this.pos.z - bz) > 0.001) this.speed *= 0.55;

    // ground follow / fall
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6);
    if (g && this.vy <= 0 && this.pos.y <= g.y + 0.02) {
      this.pos.y = g.y;
      this.vy = 0;
    } else if (!g || this.pos.y > g.y + 0.02) {
      this.vy -= 30 * dt;
      this.pos.y += this.vy * dt;
    }
    if (this.pos.y < KILL_Y) this.fellOff = true;

    // wheels
    const roll = (this.speed * dt) / 0.32;
    for (const w of this.wheels) w.rotation.x += roll;

    // seat the riders
    this.seat(this.driver, 0.35);
    this.seat(this.passenger, -0.72);
  }

  private seat(p: Player | null, localZ: number): void {
    if (!p) return;
    p.pos.set(
      this.pos.x + Math.sin(this.heading) * localZ,
      this.pos.y + 0.62,
      this.pos.z + Math.cos(this.heading) * localZ,
    );
    p.vel.set(0, 0, 0);
    p.facing = this.heading;
    p.group.rotation.y = this.heading;
  }
}
