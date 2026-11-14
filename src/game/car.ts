/**
 * car.ts — things kids ride: the Toy City car and the Adventure Island sailboat.
 *
 * Both share seats (one driver, one passenger — perfect for co-op), boarding with E, and the
 * driver's normal move keys. The car has arcade driving with wall bumps (world.resolveSolids),
 * ground follow, hops, boost pads and ramps. The boat floats at sea level, glides to a stop,
 * and is nudged back when it touches land.
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

const BOAT_ACCEL = 9;
const BOAT_MAX = 10;
const BOAT_REVERSE = 3;
const BOAT_DRAG = 2.5;    // boats glide
const BOAT_STEER = 1.7;

export type RideKind = "car" | "boat";

export class Car {
  readonly group = new THREE.Group();
  heading = 0;
  speed = 0;
  driver: Player | null = null;
  passenger: Player | null = null;
  fellOff = false; // set when the car drops off the world; boot handles the consequences
  /** Water level the boat floats on (set by placeBoat). */
  seaY = 0;
  /** Car only: ground lower than this is water — the shoreline acts as a soft wall. */
  shoreY: number | null = null;

  /** Where the driver sits relative to the ride's origin (friends online mirror this). */
  readonly seatZ: number;
  readonly seatY: number;

  private spawnPos = new THREE.Vector3();
  private spawnHeading = 0;
  private wheels: THREE.Mesh[] = [];
  private vy = 0;
  private boostT = 0;
  private bob = 0;

  constructor(readonly kind: RideKind = "car") {
    if (kind === "boat") {
      this.seatZ = 0.1;
      this.seatY = 0.18;
      this.buildBoat();
    } else {
      this.seatZ = 0.35;
      this.seatY = 0.62;
      this.buildCar();
    }
  }

  private buildCar(): void {
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

  private buildBoat(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0xc98a5b, flatShading: true, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x4a69bd, flatShading: true, roughness: 0.7 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xfff6e5, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.6), wood);
    hull.position.y = 0.1;
    hull.castShadow = true;
    this.group.add(hull);
    // pointed bow (forward is +Z, like the car)
    const bowShape = new THREE.Shape();
    bowShape.moveTo(-0.8, 0);
    bowShape.lineTo(0.8, 0);
    bowShape.lineTo(0, 1.2);
    bowShape.closePath();
    const bow = new THREE.Mesh(new THREE.ExtrudeGeometry(bowShape, { depth: 0.55, bevelEnabled: false }), wood);
    bow.rotation.x = Math.PI / 2; // shape +Y → boat +Z (the point), extrusion → down
    bow.position.set(0, 0.375, 1.3);
    bow.castShadow = true;
    this.group.add(bow);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 2.7), trim);
    rail.position.y = 0.42;
    this.group.add(rail);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 2.4), wood);
    deck.position.y = 0.43;
    this.group.add(deck);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), wood);
    mast.position.set(0, 2.0, 0.75);
    mast.castShadow = true;
    this.group.add(mast);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0);
    sailShape.lineTo(0, 2.5);
    sailShape.lineTo(-1.7, 0);
    sailShape.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), cloth);
    sail.rotation.y = Math.PI / 2 - 0.7; // swung out to catch the wind (and to be seen from behind)
    sail.position.set(0, 0.95, 0.65);
    sail.castShadow = true;
    this.group.add(sail);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xff4757, side: THREE.DoubleSide, roughness: 0.7 }),
    );
    flag.rotation.y = Math.PI / 2;
    flag.position.set(0, 3.45, 0.5);
    this.group.add(flag);
  }

  get pos(): THREE.Vector3 {
    return this.group.position;
  }

  place(x: number, y: number, z: number, heading: number): void {
    this.spawnPos.set(x, y, z);
    this.spawnHeading = heading;
    this.respawn();
  }

  /** Moor the boat on the water. */
  placeBoat(x: number, z: number, heading: number, seaY: number): void {
    this.seaY = seaY;
    this.place(x, seaY, z, heading);
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

  /** Empty both seats without moving anyone (level change). */
  clearRiders(): void {
    if (this.driver) this.driver.riding = false;
    if (this.passenger) this.passenger.riding = false;
    this.driver = null;
    this.passenger = null;
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

  /** Hop / ramp launch. Only the car, and only from the ground. Returns whether it took off. */
  jump(v: number): boolean {
    if (this.kind !== "car" || this.vy !== 0) return false;
    this.vy = v;
    this.pos.y += 0.06; // lift off the ground so the fall branch takes over
    return true;
  }

  /** Board: first free seat wins. Returns the seat taken, or null when full. */
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

  /** Step out next to the ride. */
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
    if (this.kind === "boat") {
      this.updateBoat(dt, axX, axZ, world);
      return;
    }
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
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    if (this.shoreY !== null) {
      const dry = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6);
      if (!dry || dry.y < this.shoreY) {
        this.pos.x = px;
        this.pos.z = pz;
        this.speed *= -0.3;
      }
    }

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

    this.seat(this.driver, this.seatZ);
    this.seat(this.passenger, -0.72);
  }

  private updateBoat(dt: number, axX: number, axZ: number, world: World): void {
    if (axZ > 0.1) this.speed = Math.min(BOAT_MAX, this.speed + BOAT_ACCEL * axZ * dt);
    else if (axZ < -0.1) this.speed = Math.max(-BOAT_REVERSE, this.speed - BOAT_ACCEL * 0.6 * dt);
    else {
      const slow = BOAT_DRAG * dt;
      if (Math.abs(this.speed) <= slow) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * slow;
    }
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 3) * Math.sign(this.speed || 1);
    this.heading -= axX * BOAT_STEER * steerAuthority * dt;

    // move, but never onto land: anything above the waterline pushes the boat back
    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    if (this.onLand(world, 1.5) || this.onLand(world, 0) || this.onLand(world, -1.2)) {
      this.pos.x = px;
      this.pos.z = pz;
      this.speed *= -0.3;
    }

    this.bob += dt;
    this.pos.y = this.seaY + Math.sin(this.bob * 1.8) * 0.06;
    this.group.rotation.set(Math.sin(this.bob * 1.3) * 0.03, this.heading, Math.sin(this.bob * 1.1) * 0.05, "YXZ");

    this.seat(this.driver, this.seatZ);
    this.seat(this.passenger, -0.8);
  }

  /** Is there land under the point `along` meters ahead of the boat's middle? */
  private onLand(world: World, along: number): boolean {
    const x = this.pos.x + Math.sin(this.heading) * along;
    const z = this.pos.z + Math.cos(this.heading) * along;
    const g = world.groundAt(x, z, this.seaY + 0.6);
    return g !== null && g.y > this.seaY - 0.3;
  }

  private seat(p: Player | null, localZ: number): void {
    if (!p) return;
    p.pos.set(
      this.pos.x + Math.sin(this.heading) * localZ,
      this.pos.y + this.seatY,
      this.pos.z + Math.cos(this.heading) * localZ,
    );
    p.vel.set(0, 0, 0);
    p.facing = this.heading;
    p.group.rotation.y = this.heading;
  }
}
