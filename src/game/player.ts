/**
 * player.ts — the kid adventurer: parametric character mesh + kinematic platformer controller.
 *
 * Controller conventions (must stay in sync with scripts/verify-game.mjs):
 *   camera yaw 0 → forward is -Z, right is +X; W decreases z, D increases x.
 * Movement is camera-relative: boot.ts converts input axes to a world-space wish direction.
 *
 * Forgiving kid-friendly movement: coyote time, jump buffering, double jump, and an optional
 * glide/parachute (hold jump while falling — unlocked by the birdie buddy, free in Toy City).
 */

import * as THREE from "three";
import type { World, Platform } from "./world";

const SPEED = 7;
const ACCEL_GROUND = 70;
const ACCEL_AIR = 32;
const GRAVITY = 30;
const JUMP_VEL = 10.5;
const DOUBLE_JUMP_VEL = 9.2;
const MAX_FALL = 28;
const GLIDE_FALL = 2.2; // fall speed while gliding / parachuting
const COYOTE = 0.12;
const JUMP_BUFFER = 0.12;

export interface PlayerEvents {
  jumped: boolean;
  doubleJumped: boolean;
  landed: boolean;
  sprung: number; // bounce power, 0 = none
}

export interface KidPalette {
  jacket: number;
  cap: number;
  pants: number;
}

export class Player {
  readonly group = new THREE.Group();
  readonly events: PlayerEvents = { jumped: false, doubleJumped: false, landed: false, sprung: 0 };

  vel = new THREE.Vector3();
  onGround = false;
  invuln = 0;
  facing = Math.PI; // face -Z at spawn (looking "into" the level from the camera)
  glideEnabled = false; // birdie buddy / Toy City parachute
  glideActive = false;
  /** Set by the car: while riding, the controller physics is skipped and boot places the kid. */
  riding = false;

  private body = new THREE.Group();
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private legL!: THREE.Group;
  private legR!: THREE.Group;
  private canopy!: THREE.Mesh;
  private groundPlat: Platform | null = null;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpsLeft = 0;
  private squashT = 0;
  private runPhase = 0;
  private wasAirborne = false;

  constructor(palette: KidPalette = { jacket: 0xff8c42, cap: 0xff4757, pants: 0x4a69bd }) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xffd9b3, flatShading: true, roughness: 0.8 });
    const jacket = new THREE.MeshStandardMaterial({ color: palette.jacket, flatShading: true, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: palette.pants, flatShading: true, roughness: 0.85 });
    const capMat = new THREE.MeshStandardMaterial({ color: palette.cap, flatShading: true, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.4 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x7a4a2b, flatShading: true, roughness: 0.9 });
    const packMat = new THREE.MeshStandardMaterial({ color: 0x3fa34d, flatShading: true, roughness: 0.85 });

    const add = (m: THREE.Mesh, parent: THREE.Object3D = this.body) => {
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // legs (pivot at the hip so they can swing)
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.3, 4, 8);
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.13 * sx, 0.62, 0);
      add(new THREE.Mesh(legGeo, pants), hip).position.y = -0.22;
      const shoe = add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), shoeMat), hip);
      shoe.scale.set(1, 0.6, 1.4);
      shoe.position.set(0, -0.44, 0.05);
      this.body.add(hip);
      if (sx < 0) this.legL = hip; else this.legR = hip;
    }

    // torso
    const torso = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.36, 4, 12), jacket));
    torso.position.y = 0.92;

    // arms (pivot at the shoulder)
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.3, 4, 8);
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.31 * sx, 1.12, 0);
      add(new THREE.Mesh(armGeo, jacket), shoulder).position.y = -0.2;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), skin), shoulder).position.y = -0.4;
      this.body.add(shoulder);
      if (sx < 0) this.armL = shoulder; else this.armR = shoulder;
    }

    // backpack
    const pack = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.16), packMat));
    pack.position.set(0, 0.98, -0.3);

    // head
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), skin));
    head.position.y = 1.5;

    // cap: dome + brim
    const dome = add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat));
    dome.position.y = 1.56;
    const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 16, 1, false, -Math.PI / 2.6, Math.PI / 1.3), capMat));
    brim.position.set(0, 1.58, 0.12);
    brim.scale.set(1, 1, 1.25);

    // face
    for (const sx of [-1, 1]) {
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), dark));
      eye.position.set(0.1 * sx, 1.52, 0.235);
      const cheek = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffb3c6, roughness: 0.7 })));
      cheek.scale.set(1, 0.6, 0.6);
      cheek.position.set(0.17 * sx, 1.43, 0.2);
    }
    const nose = add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffb98a, roughness: 0.7 })));
    nose.position.set(0, 1.47, 0.26);

    // parachute canopy (hidden unless gliding)
    this.canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffd93d, flatShading: true, roughness: 0.7, side: THREE.DoubleSide }),
    );
    this.canopy.position.y = 2.0; // just above the raised hands, reads as "holding the chute"
    this.canopy.visible = false;
    this.body.add(this.canopy);

    this.group.add(this.body);
  }

  get pos(): THREE.Vector3 {
    return this.group.position;
  }

  /** True while a jump would succeed (grounded, coyote window, or an air jump left). */
  get canJump(): boolean {
    return this.onGround || this.coyote > 0 || this.jumpsLeft > 0;
  }

  /** Launch the kid (trampoline). Also refreshes one air jump. */
  bounce(power: number): void {
    this.vel.y = power;
    this.onGround = false;
    this.jumpsLeft = 1;
    this.squashT = 0;
  }

  respawn(x: number, y: number, z: number): void {
    this.pos.set(x, y + 0.05, z);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.groundPlat = null;
    this.jumpsLeft = 0;
    this.invuln = 2;
    this.riding = false;
    this.facing = Math.PI;
    this.group.rotation.y = this.facing;
    this.group.visible = true;
  }

  /**
   * One fixed step. wishX/wishZ is the normalized world-space move intent (camera-relative).
   * wantJump is true on the frame a jump press arrived; glideHeld while jump is held in the air.
   */
  update(dt: number, wishX: number, wishZ: number, wantJump: boolean, glideHeld: boolean, world: World): PlayerEvents {
    const e = this.events;
    e.jumped = false; e.doubleJumped = false; e.landed = false; e.sprung = 0;

    if (this.invuln > 0) this.invuln -= dt;

    // horizontal: accelerate toward wish velocity
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    this.vel.x += (wishX * SPEED - this.vel.x) * Math.min(1, accel * dt / SPEED);
    this.vel.z += (wishZ * SPEED - this.vel.z) * Math.min(1, accel * dt / SPEED);

    // gravity (+ glide / parachute)
    this.vel.y -= GRAVITY * dt;
    this.glideActive = this.glideEnabled && glideHeld && !this.onGround && this.vel.y < -GLIDE_FALL;
    if (this.glideActive) this.vel.y = -GLIDE_FALL;
    if (this.vel.y < -MAX_FALL) this.vel.y = -MAX_FALL;

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // solid walls (city buildings) push the kid out horizontally
    world.resolveSolids(this.pos, 0.38);

    // ground query against the pre-move height so step-ups work
    const ground = world.groundAt(this.pos.x, this.pos.z, prevY);
    if (this.vel.y <= 0 && ground && this.pos.y <= ground.y + 0.001) {
      this.pos.y = ground.y;
      if (ground.plat.spring > 0) {
        this.bounce(ground.plat.spring);
        e.sprung = ground.plat.spring;
        ground.plat.squashT = 1;
      } else {
        if (!this.onGround && this.wasAirborne) {
          e.landed = true;
          this.squashT = 1;
        }
        this.onGround = true;
        this.vel.y = 0;
        this.jumpsLeft = 2;
        this.coyote = COYOTE;
        this.groundPlat = ground.plat;
        // ride moving platforms
        this.pos.x += ground.plat.dx;
        this.pos.z += ground.plat.dz;
      }
    } else {
      this.onGround = false;
      this.coyote -= dt;
      if (this.groundPlat && !ground) this.groundPlat = null;
    }
    this.wasAirborne = !this.onGround;

    // jumping: buffered + coyote + double jump
    if (wantJump) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0) {
      if (this.onGround || this.coyote > 0) {
        this.vel.y = JUMP_VEL;
        this.jumpsLeft = 1;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.squashT = 0;
        e.jumped = true;
      } else if (this.jumpsLeft > 0) {
        this.vel.y = DOUBLE_JUMP_VEL;
        this.jumpsLeft = 0;
        this.jumpBuffer = 0;
        e.doubleJumped = true;
      }
    }

    this.animate(dt);
    return e;
  }

  private animate(dt: number): void {
    // face the travel direction (local +Z is the face)
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (!this.riding && hSpeed > 0.6) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 12);
      this.group.rotation.y = this.facing;
    }

    if (this.riding) {
      // sitting pose in the car
      this.legL.rotation.x = -1.4;
      this.legR.rotation.x = -1.4;
      this.armL.rotation.x = -0.7;
      this.armR.rotation.x = -0.7;
      this.armL.rotation.z = 0;
      this.armR.rotation.z = 0;
      this.body.position.y = 0;
    } else if (this.onGround && hSpeed > 0.6) {
      // run cycle
      this.runPhase += dt * 11;
      const sw = Math.sin(this.runPhase);
      this.legL.rotation.x = sw * 0.75;
      this.legR.rotation.x = -sw * 0.75;
      this.armL.rotation.x = -sw * 0.6;
      this.armR.rotation.x = sw * 0.6;
      this.armL.rotation.z = 0.1;
      this.armR.rotation.z = -0.1;
      this.body.position.y = Math.abs(Math.cos(this.runPhase)) * 0.07;
    } else if (!this.onGround) {
      if (this.glideActive) {
        // parachute: arms up holding the lines
        this.armL.rotation.z = 2.6;
        this.armR.rotation.z = -2.6;
        this.armL.rotation.x = 0;
        this.armR.rotation.x = 0;
        this.legL.rotation.x = 0.35;
        this.legR.rotation.x = 0.25;
      } else {
        const up = this.vel.y > 0;
        this.armL.rotation.z = up ? 0.7 : 0.3;
        this.armR.rotation.z = up ? -0.7 : -0.3;
        this.armL.rotation.x = 0;
        this.armR.rotation.x = 0;
        this.legL.rotation.x = up ? 0.45 : 0.2;
        this.legR.rotation.x = up ? 0.15 : 0.35;
      }
      this.body.position.y = 0;
    } else {
      // idle: gentle breathing, limbs back to rest
      this.body.position.y = 0;
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
      this.armL.rotation.x *= 0.8;
      this.armR.rotation.x *= 0.8;
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
    }

    // landing squash (decays)
    if (this.squashT > 0) {
      this.squashT = Math.max(0, this.squashT - dt * 5);
      const s = 1 - 0.25 * Math.sin(this.squashT * Math.PI);
      this.body.scale.set(2 - s, s, 2 - s);
      if (this.squashT === 0) this.body.scale.set(1, 1, 1);
    } else {
      this.body.scale.set(1, 1, 1);
    }

    // parachute canopy
    this.canopy.visible = this.glideActive;
    if (this.glideActive) this.canopy.rotation.y += dt * 0.8;

    // hurt blink
    this.group.visible = this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0;
  }
}
