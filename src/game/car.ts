/**
 * car.ts — things kids ride: the car, the sailboat, the helicopter and the jet (plus the rocket
 * model, which boot.ts launches).
 *
 * Aircraft: hold jump to climb, let go to sink gently and land anywhere (they float on the sea).
 * The helicopter can hover and turn on the spot; the jet is fast and keeps moving in the air.
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

const SKY_LIMIT = 48;      // how high aircraft can climb

export type RideKind = "car" | "boat" | "heli" | "jet";

/** Per-aircraft handling. */
const FLIGHT = {
  heli: { max: 12, reverse: 4, accel: 10, turn: 1.9, climb: 7, sink: 3.2, minAir: 0, bank: 0.25 },
  jet: { max: 26, reverse: 0, accel: 14, turn: 1.25, climb: 8, sink: 2.6, minAir: 11, bank: 0.6 },
} as const;

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
  private rotors: THREE.Object3D[] = [];
  /** Aircraft: the driver is holding "up" this step (set by boot before update). */
  lift = false;

  constructor(readonly kind: RideKind = "car", private readonly paintColor = 0xff4757) {
    if (kind === "boat") {
      this.seatZ = 0.1;
      this.seatY = 0.18;
      this.buildBoat();
    } else if (kind === "heli") {
      this.seatZ = 0.35;
      this.seatY = 0.5;
      this.buildHeli();
    } else if (kind === "jet") {
      this.seatZ = 0.5;
      this.seatY = 0.55;
      this.buildJet();
    } else {
      this.seatZ = 0.35;
      this.seatY = 0.62;
      this.buildCar();
    }
  }

  private buildCar(): void {
    // an open-top car: body, bonnet, boot, doors, windscreen, seats, bumpers, lights, spoked wheels
    const paint = new THREE.MeshStandardMaterial({ color: this.paintColor, roughness: 0.35, metalness: 0.25 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xe9edf3, roughness: 0.3, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x26252d, roughness: 0.7 });
    const seat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfefff, roughness: 0.1, transparent: true, opacity: 0.45 });
    const lamp = new THREE.MeshStandardMaterial({ color: 0xfff6b8, emissive: 0xffe680, emissiveIntensity: 0.7, roughness: 0.3 });
    const brake = new THREE.MeshStandardMaterial({ color: 0xff2b3a, emissive: 0x8a0a12, roughness: 0.4 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(1.24, 0.34, 2.36), paint, 0, 0.5, 0);                      // floor pan
    add(new THREE.BoxGeometry(1.2, 0.26, 0.62), paint, 0, 0.78, 0.86);                   // bonnet
    add(new THREE.BoxGeometry(1.2, 0.26, 0.42), paint, 0, 0.78, -0.96);                  // boot
    const nose = add(new THREE.CylinderGeometry(0.13, 0.13, 1.2, 12), paint, 0, 0.78, 1.17);
    nose.rotation.z = Math.PI / 2;                                                       // rounded front edge
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.1, 0.34, 1.22), paint, 0.57 * sx, 0.82, -0.14);        // door
      add(new THREE.BoxGeometry(0.03, 0.03, 0.14), trim, 0.63 * sx, 0.86, -0.1);         // door handle
      add(new THREE.BoxGeometry(0.12, 0.08, 0.14), paint, 0.68 * sx, 1.02, 0.5);         // wing mirror
      add(new THREE.SphereGeometry(0.11, 12, 10), lamp, 0.42 * sx, 0.74, 1.2).scale.z = 0.5;
      add(new THREE.BoxGeometry(0.26, 0.1, 0.05), brake, 0.42 * sx, 0.76, -1.18);
      add(new THREE.BoxGeometry(0.2, 0.012, 0.6), trim, 0.22 * sx, 0.915, 0.86);         // bonnet stripes
    }
    add(new THREE.BoxGeometry(1.32, 0.13, 0.14), trim, 0, 0.42, 1.2);                    // bumpers
    add(new THREE.BoxGeometry(1.32, 0.13, 0.14), trim, 0, 0.42, -1.2);
    add(new THREE.BoxGeometry(0.56, 0.12, 0.04), dark, 0, 0.62, 1.245);                  // grille
    add(new THREE.BoxGeometry(0.4, 0.13, 0.03), trim, 0, 0.6, -1.215);                   // number plate
    const screen = add(new THREE.BoxGeometry(1.1, 0.4, 0.04), glass, 0, 1.08, 0.6);
    screen.rotation.x = -0.32;
    screen.castShadow = false;
    add(new THREE.BoxGeometry(1.16, 0.04, 0.05), trim, 0, 1.275, 0.537);                 // windscreen frame
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.44, 0.05), trim, 0.56 * sx, 1.08, 0.6).rotation.x = -0.32;
    add(new THREE.BoxGeometry(0.9, 0.5, 0.12), seat, 0, 0.98, 0.06);                     // driver's seat back
    add(new THREE.BoxGeometry(0.9, 0.5, 0.12), seat, 0, 0.98, -0.98);                    // back seat
    add(new THREE.BoxGeometry(1.02, 0.1, 1.2), seat, 0, 0.7, -0.4);                      // seat cushions
    const wheel = add(new THREE.TorusGeometry(0.13, 0.025, 8, 16), dark, 0, 1.0, 0.44);  // steering wheel
    wheel.rotation.x = -0.9;

    const tyreGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18);
    const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.26, 12);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const w = add(tyreGeo, dark, 0.64 * sx, 0.33, 0.74 * sz);
      w.rotation.z = Math.PI / 2;
      add(hubGeo, trim, 0, 0, 0, w).castShadow = false;
      for (let k = 0; k < 4; k++) {
        // spokes, so you can see the wheels turn
        const spoke = add(new THREE.BoxGeometry(0.05, 0.27, 0.3), dark, 0, 0, 0, w);
        spoke.rotation.y = (k / 4) * Math.PI;
        spoke.castShadow = false;
      }
      this.wheels.push(w);
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

    // a little cannon on the bow
    const iron = new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.5, metalness: 0.4 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.9, 10), iron);
    barrel.rotation.x = Math.PI / 2 - 0.25;
    barrel.position.set(0, 0.72, 1.75);
    barrel.castShadow = true;
    this.group.add(barrel);

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

  private buildHeli(): void {
    const flat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 });
    const yellow = flat(0xffc93c), dark = flat(0x33323e), white = flat(0xffffff);
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfefff, roughness: 0.2, transparent: true, opacity: 0.55 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    add(new THREE.SphereGeometry(0.9, 14, 10), yellow, 0, 1.05, -0.1).scale.set(0.95, 0.85, 1.35);   // cabin
    add(new THREE.SphereGeometry(0.78, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.12, 0.45).rotation.x = Math.PI / 2.4; // bubble
    add(new THREE.CylinderGeometry(0.16, 0.08, 2.4, 8), yellow, 0, 1.2, -2.1).rotation.x = Math.PI / 2; // tail boom
    add(new THREE.BoxGeometry(0.08, 0.7, 0.45), white, 0, 1.5, -3.15);                                  // tail fin
    add(new THREE.BoxGeometry(1.3, 0.1, 0.5), white, 0, 0.72, -0.1);                                    // stripe
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), dark, 0.62 * sx, 0.12, 0).rotation.x = Math.PI / 2; // skid
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), dark, 0.55 * sx, 0.38, 0.5);
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), dark, 0.55 * sx, 0.38, -0.6);
    }
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), dark, 0, 2.0, -0.1);                            // mast
    const rotor = new THREE.Group();
    rotor.position.set(0, 2.25, -0.1);
    add(new THREE.BoxGeometry(5.2, 0.05, 0.28), dark, 0, 0, 0, rotor);
    add(new THREE.BoxGeometry(0.28, 0.05, 5.2), dark, 0, 0, 0, rotor);
    this.group.add(rotor);
    const tail = new THREE.Group();
    tail.position.set(0.12, 1.5, -3.15);
    add(new THREE.BoxGeometry(0.04, 0.9, 0.12), dark, 0, 0, 0, tail);
    add(new THREE.BoxGeometry(0.04, 0.12, 0.9), dark, 0, 0, 0, tail);
    this.group.add(tail);
    this.rotors = [rotor, tail];
  }

  private buildJet(): void {
    const flat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5 });
    const white = flat(0xf4f6fb), blue = flat(0x4a69bd), red = flat(0xff4757), dark = flat(0x33323e);
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfefff, roughness: 0.2, transparent: true, opacity: 0.55 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    add(new THREE.CapsuleGeometry(0.55, 3.4, 6, 12), white, 0, 0.95, 0).rotation.x = Math.PI / 2;        // fuselage
    add(new THREE.ConeGeometry(0.42, 1.1, 12), red, 0, 0.95, 2.7).rotation.x = Math.PI / 2;              // nose
    add(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.25, 0.7).scale.set(0.9, 1, 1.7); // canopy
    add(new THREE.BoxGeometry(6.2, 0.1, 1.3), blue, 0, 0.85, -0.1);                                      // wings
    add(new THREE.BoxGeometry(2.4, 0.08, 0.7), blue, 0, 1.0, -2.0);                                      // tailplane
    add(new THREE.BoxGeometry(0.1, 1.1, 0.9), red, 0, 1.6, -2.0);                                        // fin
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 10), dark, 1.5 * sx, 0.62, 0.1).rotation.x = Math.PI / 2; // engine
      add(new THREE.BoxGeometry(0.3, 0.12, 1.3), red, 3.0 * sx, 0.9, -0.1);                              // wingtip
      add(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10), dark, 0.9 * sx, 0.18, -0.4).rotation.z = Math.PI / 2; // wheel
    }
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), dark, 0, 0.16, 1.6).rotation.z = Math.PI / 2;
  }

  get flies(): boolean {
    return this.kind === "heli" || this.kind === "jet";
  }

  /** Off the ground (aircraft) or mid-hop (car). */
  get inAir(): boolean {
    return this.flying;
  }
  private flying = false;

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
    if (this.kind === "heli" || this.kind === "jet") {
      this.updateFlight(dt, axX, axZ, world, FLIGHT[this.kind]);
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
      this.vy -= 30 * world.gravity * dt;
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
    this.pos.y = this.seaY + world.waveAt(this.pos.x, this.pos.z) * 0.8; // ride the swells
    this.group.rotation.set(Math.sin(this.bob * 1.3) * 0.03, this.heading, Math.sin(this.bob * 1.1) * 0.05, "YXZ");

    this.seat(this.driver, this.seatZ);
    this.seat(this.passenger, -0.8);
  }

  private updateFlight(dt: number, axX: number, axZ: number, world: World, f: typeof FLIGHT[keyof typeof FLIGHT]): void {
    // where it can rest: the ground under it, or the sea's surface (aircraft float)
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6);
    const sea = world.def.sea;
    const floor = Math.max(g ? g.y : -Infinity, sea !== undefined ? sea : -Infinity);
    const grounded = floor > -Infinity && this.pos.y <= floor + 0.02;

    // speed: the jet never stops in the air
    if (axZ > 0.1) this.speed = Math.min(f.max, this.speed + f.accel * axZ * dt);
    else if (axZ < -0.1) this.speed = Math.max(-f.reverse, this.speed - f.accel * dt);
    else {
      const slow = (grounded ? 9 : 4) * dt;
      if (Math.abs(this.speed) <= slow) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * slow;
    }
    if (!grounded && this.speed < f.minAir) this.speed = Math.min(f.minAir, this.speed + f.accel * dt);

    // turning: aircraft turn freely in the air, like a car on the ground
    const authority = grounded ? Math.min(1, Math.abs(this.speed) / 4) * Math.sign(this.speed || 1) : 1;
    this.heading -= axX * f.turn * authority * dt;

    // climb while "up" is held (the jet needs some speed first); otherwise sink gently
    const canClimb = this.driver !== null && this.lift && (this.kind === "heli" || this.speed > 7);
    const targetVy = canClimb ? f.climb : grounded ? 0 : -f.sink;
    this.vy += (targetVy - this.vy) * Math.min(1, dt * 3);

    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.pos.y = Math.min(SKY_LIMIT, this.pos.y + this.vy * dt);
    world.resolveSolids(this.pos, 1.2);
    if (floor > -Infinity && this.pos.y <= floor) {
      this.pos.y = floor;
      if (this.vy < 0) this.vy = 0;
    }
    if (this.pos.y < KILL_Y) this.fellOff = true;
    this.flying = !grounded;

    // lean into turns and forward speed
    const spin = this.driver ? (this.flying || this.lift ? 28 : 12) : 0;
    if (this.rotors[0]) this.rotors[0].rotation.y += spin * dt;
    if (this.rotors[1]) this.rotors[1].rotation.x += spin * dt;
    const roll = this.flying ? -axX * f.bank : 0;
    const pitch = this.flying ? (this.kind === "heli" ? this.speed * 0.02 : -this.vy * 0.04) : 0;
    this.group.rotation.set(pitch, this.heading, roll, "YXZ");

    this.seat(this.driver, this.seatZ);
    this.seat(this.passenger, this.kind === "jet" ? -0.5 : -0.45);
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

/** The rocket (a model only — boot.ts handles boarding and blast-off). Stands 5 tall on its fins. */
export function makeRocket(): THREE.Group {
  const g = new THREE.Group();
  const flat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5 });
  const white = flat(0xf4f6fb), red = flat(0xff4757), dark = flat(0x33323e);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(new THREE.CylinderGeometry(0.85, 0.95, 3.2, 14), white, 0, 2.3, 0);
  add(new THREE.ConeGeometry(0.85, 1.6, 14), red, 0, 4.7, 0);
  add(new THREE.CylinderGeometry(0.87, 0.87, 0.3, 14), red, 0, 1.5, 0);
  add(new THREE.CylinderGeometry(0.5, 0.75, 0.6, 12), dark, 0, 0.45, 0);
  const win = add(new THREE.SphereGeometry(0.36, 12, 10), new THREE.MeshStandardMaterial({ color: 0x9df2ff, emissive: 0x1a5a6a, roughness: 0.2 }), 0, 3.1, 0.72);
  win.scale.z = 0.4;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const fin = add(new THREE.BoxGeometry(0.12, 1.5, 1.0), red, Math.sin(a) * 1.15, 0.9, Math.cos(a) * 1.15);
    fin.rotation.y = a;
  }
  return g;
}
