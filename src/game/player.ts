/**
 * player.ts — the kid adventurer: parametric character mesh + kinematic platformer controller.
 *
 * Controller conventions (must stay in sync with scripts/verify-game.mjs):
 *   camera yaw 0 → forward is -Z, right is +X; W decreases z, D increases x.
 * Movement is camera-relative: boot.ts converts input axes to a world-space wish direction.
 *
 * Forgiving kid-friendly movement: coyote time, jump buffering, double jump, and an optional
 * glide/parachute (hold jump while falling — unlocked by the birdie buddy, free in Toy City),
 * balloon float (a gentle rise for a few seconds), a dance move, and a choice of hats.
 */

import * as THREE from "three";
import type { World, Platform } from "./world";
import { makeHuman, type Human, type Move } from "./humans";

/** How long reaching out to use something takes (s). */
const REACH_TIME = 0.75;
const REACH_V = new THREE.Vector3();
import { makeAdult, type Adult, type AdultKind, type RobeLook } from "./people";

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
const FLOAT_RISE = 3.2;   // upward speed while holding a balloon
const DANCE_TIME = 2;

/** Hat choices (index 0 = just the cap). Order must match HATS in profile.ts. */
function makeHat(i: number): THREE.Group | null {
  const g = new THREE.Group();
  const mat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 });
  if (i === 1) {
    // crown
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x6a4a00, metalness: 0.5, roughness: 0.35, flatShading: true });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 10, 1, true), gold);
    band.material.side = THREE.DoubleSide;
    band.position.y = 1.87;
    g.add(band);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 6), gold);
      spike.position.set(Math.cos(a) * 0.2, 2.0, Math.sin(a) * 0.2);
      g.add(spike);
    }
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat(0xff4d6d));
    gem.position.set(0, 1.88, 0.21);
    g.add(gem);
  } else if (i === 2) {
    // bunny ears
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), mat(0xffffff));
      ear.position.set(0.11 * sx, 2.02, -0.02);
      ear.rotation.z = -0.18 * sx;
      g.add(ear);
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 6), mat(0xffb3c6));
      inner.position.set(0.11 * sx, 2.02, 0.035);
      inner.rotation.z = -0.18 * sx;
      g.add(inner);
    }
  } else if (i === 3) {
    // wizard hat
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), mat(0x6c5ce7));
    brim.position.y = 1.8;
    g.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.62, 14), mat(0x6c5ce7));
    cone.position.y = 2.12;
    cone.rotation.z = 0.12;
    g.add(cone);
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0x806000 }));
    star.position.set(0.04, 2.1, 0.2);
    g.add(star);
  } else if (i === 4) {
    // flower tucked on the side of the cap
    const petalMat = mat(0xff6b9d);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), petalMat);
      petal.position.set(0.24 + Math.cos(a) * 0.07, 1.74 + Math.sin(a) * 0.07, 0.06);
      g.add(petal);
    }
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffd93d));
    mid.position.set(0.24, 1.74, 0.1);
    g.add(mid);
  } else if (i === 5) {
    // a knight's helmet: an open-face dome with a nose guard, cheek pieces and a red plume
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9d1da, metalness: 0.75, roughness: 0.3, flatShading: true });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    dome.position.y = 1.59;
    g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.03, 6, 20).rotateX(Math.PI / 2), steel);
    rim.position.y = 1.6;
    g.add(rim);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.03), steel);
    nose.position.set(0, 1.54, 0.315);
    g.add(nose);
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.2), steel);
      cheek.position.set(0.3 * sx, 1.5, 0.06);
      g.add(cheek);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.5), mat(0xffc93c));
    ridge.position.set(0, 1.89, 0);
    g.add(ridge);
    const plumeM = mat(0xe8434f);
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 6), plumeM);
      f.position.set(0, 1.97 + Math.sin(k * 0.7) * 0.06, 0.08 - k * 0.09);
      f.rotation.x = -0.4 - k * 0.3;
      g.add(f);
    }
  } else {
    return null;
  }
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return g;
}

/** Glasses in the cartoon head's coordinates (0 = none, 1 round, 2 sunglasses, 3 red). */
function makeGlasses(kind: number): THREE.Group | null {
  if (kind <= 0) return null;
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: kind === 2 ? 0x1b1b22 : kind === 3 ? 0xff4d6d : 0x33323e, roughness: 0.4 });
  const lens = kind === 2
    ? new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.2 })
    : new THREE.MeshStandardMaterial({ color: 0xcfefff, roughness: 0.1, transparent: true, opacity: 0.35 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  for (const sx of [-1, 1]) {
    add(new THREE.TorusGeometry(0.068, 0.012, 6, 18), frame, 0.1 * sx, 1.53, 0.265);
    add(new THREE.CircleGeometry(0.066, 16), lens, 0.1 * sx, 1.53, 0.266);
    add(new THREE.BoxGeometry(0.012, 0.012, 0.26), frame, 0.172 * sx, 1.535, 0.14);
  }
  add(new THREE.BoxGeometry(0.07, 0.012, 0.012), frame, 0, 1.535, 0.268);
  return g;
}

/** The baseball cap (worn when no other hat is chosen), in the cartoon head's coordinates. */
function makeCap(color: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.283, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
  dome.position.y = 1.56;
  dome.castShadow = true;
  g.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 16, 1, false, -Math.PI / 2.6, Math.PI / 1.3), m);
  brim.position.set(0, 1.58, 0.13);
  brim.scale.set(1, 1, 1.25);
  brim.castShadow = true;
  g.add(brim);
  return g;
}

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
  skin?: number;
  /** Hair color and style (0 short, 1 ponytail, 2 pigtails, 3 curly, 4 long). */
  hair?: number;
  hairStyle?: number;
  /** 0 none, 1 round glasses, 2 sunglasses, 3 red glasses. */
  glasses?: number;
  /** Clothes: 0 jacket & trousers, 1 dress, 2 T-shirt & shorts, 3 dungarees. */
  style?: number;
  /** Human body (0 girl, 1 boy), used when human characters are loaded. */
  body?: number;
  /** A grown-up villager's body (people.ts), used once those models are loaded. */
  adult?: AdultKind | null;
  /** Bible-times clothes for a grown-up villager. */
  robe?: RobeLook;
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
  /** On an animal's back (set by the herd): its speed and stride, so the hands hold the reins. */
  saddle: { speed: number; phase: number; bar?: boolean } | null = null;
  /** Seconds of balloon float left (0 = not floating). */
  floatT = 0;
  /** Seconds of dance left. */
  danceT = 0;
  /** Snack effects (seconds left): ice cream = fast, cupcake = big jumps, pizza = giant. */
  speedT = 0;
  jumpT = 0;
  bigT = 0;

  private body = new THREE.Group();
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private legL!: THREE.Group;
  private legR!: THREE.Group;
  private canopy!: THREE.Mesh;
  private balloon!: THREE.Group;
  private hat: THREE.Group | null = null;
  /** The human-looking model (humans.ts), or null for the code-built cartoon kid. */
  private human: Human | Adult | null = null;
  /** A grown-up (their own hair: no kid's cap). */
  private grownUp = false;
  /** No kid's cap: grown-ups have their own hair, and David's curls go uncovered. */
  private noCap = false;
  /** Where hats, glasses and the cap go: the cartoon body, or the human's head. */
  private headParent: THREE.Object3D = this.body;
  /** Far from the camera: animate less often. */
  near = true;
  /** Something nearby worth a look (a villager, an animal, a friend): the head turns to it. */
  lookTarget: THREE.Vector3 | null = null;
  /** How hard the last landing was (0–1, for dust), set on the frame the kid lands. */
  landPower = 0;
  /** Landing squat: how deep (m) and how far through it (s). */
  private squatDepth = 0;
  private squatT = 9;
  /** Reaching out to use something: where, and how far through the reach (s). */
  private reachAt: THREE.Vector3 | null = null;
  private reachT = 9;
  /** Ground height under a point, so feet can stand on steps and edges (set by update). */
  groundFn: ((x: number, z: number) => number | null) | null = null;
  private lastFacing = 0;
  private lastSpeed = 0;
  private turnRate = 0;
  private accelRate = 0;
  private cap = new THREE.Group();
  private lids: THREE.Mesh[] = [];
  private blinkT = 1 + Math.random() * 3;
  private hatIndex = 0;
  /** Sitting down (on a throne): the riding flag keeps physics off, this picks the sitting pose. */
  seated = false;
  /** Riding standing up (a scooter): keep the standing pose instead of sitting. */
  standRide = false;
  private groundPlat: Platform | null = null;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpsLeft = 0;
  private squashT = 0;
  private runPhase = 0;
  private wasAirborne = false;

  constructor(palette: KidPalette = { jacket: 0xff8c42, cap: 0xff4757, pants: 0x4a69bd }) {
    const adult = palette.adult ? makeAdult({ kind: palette.adult, skin: palette.skin ?? 0xd9a273, top: palette.jacket, bottom: palette.pants, accent: palette.cap, robe: palette.robe }) : null;
    this.grownUp = adult !== null;
    this.noCap = this.grownUp || !!palette.robe;
    this.human = adult ?? makeHuman({
      body: palette.body ?? 0, skinColor: palette.skin ?? 0xffd9b3, hair: palette.hairStyle ?? 0, hairColor: palette.hair ?? 0x5a3a22,
      top: palette.style === 3 ? palette.cap : palette.jacket, bottom: palette.pants, accent: palette.cap, style: palette.style ?? 0,
      tunic: palette.robe ? { robe: palette.robe.robe, trim: palette.robe.trim } : undefined,
    });
    if (this.human) {
      this.body.add(this.human.root);
      this.headParent = this.human.headAcc;
      const glasses = makeGlasses(palette.glasses ?? 0);
      if (glasses) this.headParent.add(glasses);
      this.cap.add(makeCap(palette.cap));
      this.cap.position.y = 0.07; // sits higher on the human head, clear of the eyes
      this.headParent.add(this.cap);
      this.cap.visible = !this.noCap;
    } else {
      this.buildToy(palette);
    }

    // parachute canopy (hidden unless gliding)
    this.canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffd93d, flatShading: true, roughness: 0.7, side: THREE.DoubleSide }),
    );
    this.canopy.position.y = this.human ? 2.45 : 2.0; // just above the raised hands, reads as "holding the chute"
    this.canopy.visible = false;
    this.body.add(this.canopy);

    // party balloon (shown while floating)
    this.balloon = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.35 }));
    ball.scale.y = 1.15;
    ball.position.y = 2.75;
    this.balloon.add(ball);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    string.position.set(0.15, 1.9, 0);
    string.rotation.z = 0.15;
    this.balloon.add(string);
    this.balloon.position.set(0.2, this.human ? 0.35 : 0, 0);
    this.balloon.visible = false;
    this.body.add(this.balloon);

    this.group.add(this.body);
  }

  /** The code-built cartoon kid (used until / unless the human models load). */
  private buildToy(palette: KidPalette): void {
    // smooth-shaded so faces and clothes look soft rather than faceted
    const soft = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
    const skin = soft(palette.skin ?? 0xffd9b3, 0.7);
    const jacket = soft(palette.jacket);
    const pants = soft(palette.pants, 0.85);
    const capMat = soft(palette.cap, 0.7);
    const hairMat = soft(palette.hair ?? 0x5a3a22, 0.9);
    const dark = soft(0x2b2a33, 0.4);
    const white = soft(0xffffff, 0.5);
    const shoeMat = soft(0x7a4a2b, 0.9);
    const packMat = soft(0x3fa34d, 0.85);
    const style = palette.style ?? 0;        // 0 jacket & trousers, 1 dress, 2 T-shirt & shorts, 3 dungarees
    const bareLegs = style === 1 || style === 2;
    const bareArms = style === 1 || style === 2;
    const top = style === 3 ? capMat : jacket; // dungarees show the shirt underneath

    const add = (m: THREE.Mesh, parent: THREE.Object3D = this.body) => {
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const orb = (r: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => {
      const mesh = add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m), parent);
      mesh.position.set(x, y, z);
      return mesh;
    };

    // legs (pivot at the hip so they can swing)
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.3, 4, 10);
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.13 * sx, 0.62, 0);
      add(new THREE.Mesh(legGeo, bareLegs ? skin : pants), hip).position.y = -0.22;
      if (style === 2) add(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.24, 12), pants), hip).position.y = -0.08; // shorts
      if (bareLegs) add(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.1, 10), white), hip).position.y = -0.36;      // sock
      const shoe = orb(0.11, shoeMat, 0, -0.44, 0.05, hip);
      shoe.scale.set(1, 0.6, 1.45);
      const sole = add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.33), white), hip);
      sole.position.set(0, -0.5, 0.05);
      this.body.add(hip);
      if (sx < 0) this.legL = hip; else this.legR = hip;
    }

    // torso, collar and neck
    const torso = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.36, 6, 16), top));
    torso.position.y = 0.92;
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.12, 12), skin));
    neck.position.y = 1.27;
    const collar = add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), top));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.2;
    if (style === 0) {
      // zip and pockets on the jacket
      const zip = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.46, 0.02), white));
      zip.position.set(0, 0.95, 0.238);
      for (const sx of [-1, 1]) {
        const pocket = add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.02), capMat));
        pocket.position.set(0.12 * sx, 0.8, 0.225);
      }
    } else if (style === 1) {
      // dress: a flared skirt and a ribbon belt
      const skirt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.46, 0.5, 18), jacket));
      skirt.position.y = 0.58;
      const belt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 18), capMat));
      belt.position.y = 0.82;
      const bow = orb(0.06, capMat, 0, 0.82, 0.25);
      bow.scale.set(1.8, 1, 0.6);
    } else if (style === 2) {
      // T-shirt: a star on the front
      const badge = orb(0.07, capMat, 0, 1.0, 0.225);
      badge.scale.z = 0.3;
    } else {
      // dungarees: bib, straps and a waistband
      const bib = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.05), pants));
      bib.position.set(0, 0.98, 0.215);
      const waist = add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.2, 16), pants));
      waist.position.y = 0.72;
      for (const sx of [-1, 1]) {
        const strap = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.04), pants));
        strap.position.set(0.11 * sx, 1.17, 0.19);
        orb(0.025, white, 0.11 * sx, 1.09, 0.245);
      }
    }

    // arms (pivot at the shoulder): sleeve, cuff, hand and thumb
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.3, 4, 10);
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.31 * sx, 1.12, 0);
      add(new THREE.Mesh(armGeo, bareArms ? skin : top), shoulder).position.y = -0.2;
      if (bareArms) orb(0.095, top, 0, -0.04, 0, shoulder).scale.y = 1.2; // short sleeve
      else add(new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.05, 10), white), shoulder).position.y = -0.36;
      orb(0.075, skin, 0, -0.42, 0, shoulder);
      orb(0.03, skin, 0, -0.41, 0.07, shoulder);
      this.body.add(shoulder);
      if (sx < 0) this.armL = shoulder; else this.armR = shoulder;
    }

    // backpack
    const pack = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.16), packMat));
    pack.position.set(0, 0.98, -0.3);
    const flap = add(new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.12, 0.17), soft(0x2f8a3d)));
    flap.position.set(0, 1.11, -0.3);

    // head: ears, eyes that blink, eyebrows, nose, a smile and rosy cheeks
    const head = orb(0.26, skin, 0, 1.5, 0);
    head.scale.y = 1.04;
    for (const sx of [-1, 1]) {
      orb(0.06, skin, 0.255 * sx, 1.49, -0.01).scale.set(0.5, 1, 0.8);
      const eyeX = 0.1 * sx;
      orb(0.062, white, eyeX, 1.53, 0.215).scale.set(1, 1.15, 0.5);
      orb(0.036, soft(0x4a3222, 0.4), eyeX, 1.53, 0.243).scale.z = 0.4;
      orb(0.02, dark, eyeX, 1.53, 0.256).scale.z = 0.4;
      orb(0.01, white, eyeX + 0.012, 1.545, 0.262);
      const lid = orb(0.066, skin, eyeX, 1.53, 0.218);
      lid.scale.set(1, 1.15, 0.55);
      lid.castShadow = false;
      lid.visible = false;
      this.lids.push(lid);
      const brow = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.02), hairMat));
      brow.position.set(eyeX, 1.625, 0.232);
      brow.rotation.z = -0.12 * sx;
      const cheek = orb(0.045, soft(0xffb3c6, 0.7), 0.17 * sx, 1.43, 0.2);
      cheek.scale.set(1, 0.6, 0.6);
    }
    orb(0.035, soft(new THREE.Color(palette.skin ?? 0xffd9b3).multiplyScalar(0.92).getHex(), 0.7), 0, 1.47, 0.26);
    const smile = add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.013, 6, 14, Math.PI), soft(0xb5524a, 0.6)));
    smile.rotation.set(-0.2, 0, Math.PI);
    smile.position.set(0, 1.42, 0.235);

    // hair: a dome over the top and back of the head, plus the chosen style
    const dome = add(new THREE.Mesh(new THREE.SphereGeometry(0.275, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat));
    dome.position.y = 1.535;
    dome.rotation.x = -0.32; // tilted back so the forehead shows
    // human hairstyles: short, long, buns, buzz, pixie → cartoon shapes
    const hairStyle = [0, 4, 2, 0, 3][palette.hairStyle ?? 0] ?? 0;
    if (hairStyle === 1) {
      // ponytail
      orb(0.1, hairMat, 0, 1.56, -0.29);
      const tail = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 4, 8), hairMat));
      tail.position.set(0, 1.38, -0.36);
      tail.rotation.x = 0.35;
    } else if (hairStyle === 2) {
      // pigtails
      for (const sx of [-1, 1]) {
        orb(0.095, hairMat, 0.28 * sx, 1.48, -0.06);
        const tail = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), hairMat));
        tail.position.set(0.31 * sx, 1.3, -0.06);
        tail.rotation.z = 0.25 * sx;
      }
    } else if (hairStyle === 3) {
      // curly: puffs all around the sides and back
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * 0.15 + (k / 8) * Math.PI * 1.7; // skips the face
        orb(0.115, hairMat, Math.sin(a) * 0.24, 1.56 + (k % 2) * 0.07, -Math.cos(a) * 0.24 - 0.02);
      }
    } else if (hairStyle === 4) {
      // long hair down the back
      const long = orb(0.27, hairMat, 0, 1.33, -0.11);
      long.scale.set(1.02, 1.3, 0.72);
    }

    const glasses = makeGlasses(palette.glasses ?? 0);
    if (glasses) this.body.add(glasses);

    // cap (worn when no other hat is chosen)
    this.cap.add(makeCap(palette.cap));
    this.body.add(this.cap);
  }

  /** The hat being worn (0 = cap only). */
  get hat_(): number {
    return this.hatIndex;
  }

  /** Swap the hat (0 = cap only). */
  setHat(i: number): void {
    if (i === this.hatIndex) return;
    if (this.hat) {
      this.hat.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.hat.removeFromParent();
    }
    this.hatIndex = i;
    this.hat = makeHat(i);
    if (this.hat) this.headParent.add(this.hat);
    // the cap comes off for a crown, wizard hat or bunny ears; a flower tucks onto it
    this.cap.visible = !this.noCap && (i === 0 || i === 4);
  }

  /** Grab a balloon: rise gently for a few seconds. */
  startFloat(seconds: number): void {
    this.floatT = seconds;
    this.onGround = false;
    this.glideActive = false;
  }

  dance(): void {
    if (!this.riding) this.danceT = DANCE_TIME;
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
    this.glideActive = false;
    this.floatT = 0;
    this.danceT = 0;
    this.speedT = 0;
    this.jumpT = 0;
    this.bigT = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
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
    if (!this.groundFn) this.groundFn = (x, z) => world.groundAt(x, z, this.pos.y + 0.5)?.y ?? null;
    e.jumped = false; e.doubleJumped = false; e.landed = false; e.sprung = 0;

    if (this.invuln > 0) this.invuln -= dt;

    // horizontal: accelerate toward wish velocity
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    if (this.speedT > 0) this.speedT -= dt;
    if (this.jumpT > 0) this.jumpT -= dt;
    if (this.bigT > 0) this.bigT -= dt;
    const speed = SPEED * (this.speedT > 0 ? 1.6 : 1);
    this.vel.x += (wishX * speed - this.vel.x) * Math.min(1, accel * dt / SPEED);
    this.vel.z += (wishZ * speed - this.vel.z) * Math.min(1, accel * dt / SPEED);

    // gravity (+ balloon float / glide / parachute)
    if (this.floatT > 0) {
      this.floatT -= dt;
      this.vel.y += (FLOAT_RISE - this.vel.y) * Math.min(1, dt * 3);
      if (this.floatT <= 0) this.jumpsLeft = Math.max(this.jumpsLeft, 1); // let go: one air jump to steer
    } else {
      this.vel.y -= GRAVITY * world.gravity * dt;
    }
    this.glideActive = this.glideEnabled && glideHeld && !this.onGround && this.vel.y < -GLIDE_FALL;
    if (this.glideActive) this.vel.y = -GLIDE_FALL;
    if (this.vel.y < -MAX_FALL) this.vel.y = -MAX_FALL;

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // indoors: don't jump through the ceiling
    const ceil = world.ceilingAt(this.pos);
    if (ceil !== null && this.pos.y > ceil) {
      this.pos.y = ceil;
      if (this.vel.y > 0) this.vel.y = 0;
    }

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
          // soak it up in the knees: a hop barely dips, a big drop crouches right down
          const impact = THREE.MathUtils.clamp((-this.vel.y - 5) / 13, 0, 1);
          this.landPower = impact;
          if (impact > 0.02) { this.squatDepth = 0.05 + impact * 0.2; this.squatT = 0; }
        }
        this.onGround = true;
        this.vel.y = 0;
        this.jumpsLeft = 2;
        this.coyote = COYOTE;
        this.groundPlat = ground.plat;
        // ride moving platforms (re-check walls: the carry must not push the kid into a building)
        if (ground.plat.dx !== 0 || ground.plat.dz !== 0) {
          this.pos.x += ground.plat.dx;
          this.pos.z += ground.plat.dz;
          world.resolveSolids(this.pos, 0.38);
        }
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
        this.vel.y = JUMP_VEL * (this.jumpT > 0 ? 1.4 : 1);
        this.jumpsLeft = 1;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.squashT = 0;
        e.jumped = true;
      } else if (this.jumpsLeft > 0) {
        this.vel.y = DOUBLE_JUMP_VEL * (this.jumpT > 0 ? 1.4 : 1);
        this.jumpsLeft = 0;
        this.jumpBuffer = 0;
        e.doubleJumped = true;
      }
    }

    this.animate(dt);
    return e;
  }

  /**
   * Online friends: no physics, just follow the state their game sent us and animate to match.
   * The position eases toward the target so 15 Hz updates still look smooth.
   */
  applyRemote(dt: number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
    onGround: boolean, glide: boolean, riding: boolean, facing: number, floating: boolean, big = false): void {
    this.floatT = floating ? 1 : 0;
    this.bigT = big ? 1 : 0;
    const dx = x - this.pos.x, dy = y - this.pos.y, dz = z - this.pos.z;
    if (dx * dx + dy * dy + dz * dz > 36) this.pos.set(x, y, z); // teleport / respawn: snap
    else {
      const k = Math.min(1, dt * 12);
      this.pos.set(this.pos.x + dx * k, this.pos.y + dy * k, this.pos.z + dz * k);
    }
    this.vel.set(vx, vy, vz);
    this.onGround = onGround;
    this.glideActive = glide;
    this.riding = riding;
    if (riding) {
      this.facing = facing;
      this.group.rotation.y = facing;
    }
    this.animate(dt);
  }

  /**
   * Reach out with the right hand to use something: toward `at` if given (and close), else toward
   * a spot just in front at tummy height.
   */
  reach(at?: THREE.Vector3 | null): void {
    this.reachT = 0;
    this.reachAt = at && at.distanceTo(this.pos) < 2.2 ? at.clone() : null;
  }

  /** Inside a ride (the ride moves the kid): keep the seated, steering animation going. */
  rideTick(dt: number): void {
    this.vel.set(0, 0, 0);
    this.animate(dt);
  }

  /** How far the head is turned from the body (for tests). */
  debugHeadYaw(): number {
    return this.human?.headYaw() ?? 0;
  }

  /** The right hand's distance in front of the kid (m, for tests): bigger while reaching out. */
  debugHandOut(): number {
    const h = this.human?.handPos();
    if (!h) return NaN;
    return +((h.x - this.pos.x) * Math.sin(this.facing) + (h.z - this.pos.z) * Math.cos(this.facing)).toFixed(3);
  }

  /** What the human model shows right now (for tests). */
  debugMove(): string {
    return this.human?.move ?? "";
  }

  /** Ankle heights above the ground under each foot (for tests). */
  debugFeet(): number[] {
    return this.human && this.groundFn ? this.human.debugFeet(this.groundFn) : [];
  }

  /** The landing squat right now: down fast (0.07 s), then back up over a third of a second. */
  private squatNow(dt: number): number {
    if (this.squatT > 1) return 0;
    this.squatT += dt;
    const t = this.squatT;
    const env = t < 0.07 ? t / 0.07 : Math.max(0, 1 - (t - 0.07) / 0.33);
    return this.squatDepth * env * env * (3 - 2 * env);
  }

  /** The reach right now: out and back over REACH_TIME, holding a moment at full stretch. */
  private reachNow(dt: number): { at: THREE.Vector3; w: number } | null {
    if (this.reachT >= REACH_TIME) return null;
    this.reachT += dt;
    const t = Math.min(1, this.reachT / REACH_TIME);
    const w = t < 0.35 ? t / 0.35 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    const at = this.reachAt
      ? REACH_V.copy(this.reachAt)
      : REACH_V.set(Math.sin(this.facing) * 0.5 - Math.cos(this.facing) * 0.18, 0.85, Math.cos(this.facing) * 0.5 + Math.sin(this.facing) * 0.18).add(this.pos);
    return { at, w: w * w * (3 - 2 * w) * 0.85 };
  }

  /** Pick the human's animation from what the kid is doing. */
  private animateHuman(dt: number, hSpeed: number): void {
    const h = this.human!;
    let move: Move;
    let rate = 1;
    if (this.danceT > 0) {
      this.danceT = Math.max(0, this.danceT - dt);
      move = "dance";
    } else if (this.riding) {
      move = this.seated ? "sit" : this.standRide ? "idle" : "drive";
    } else if (!this.onGround) {
      move = this.glideActive || this.floatT > 0 ? "float" : this.vel.y > 2 && h.move !== "fall" ? "jump" : "fall";
    } else {
      move = "walk"; // on foot: idle, walk, jog and sprint blend by speed
    }
    if (move === "walk") h.moveAt(hSpeed);
    else h.play(move, rate);
    h.update(dt, this.near);
    // how fast the kid is turning and speeding up, smoothed (for leaning)
    if (dt > 0) {
      let df = this.facing - this.lastFacing;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      const k = Math.min(1, dt * 10);
      this.turnRate += (THREE.MathUtils.clamp(df / dt, -8, 8) - this.turnRate) * k;
      this.accelRate += (THREE.MathUtils.clamp((hSpeed - this.lastSpeed) / dt, -40, 40) - this.accelRate) * k;
    }
    this.lastFacing = this.facing;
    this.lastSpeed = hSpeed;
    if (this.near) {
      const grounded = this.onGround && !this.riding && this.danceT <= 0;
      h.pose(dt, {
        turnRate: grounded ? this.turnRate : 0, accel: grounded ? this.accelRate : 0, grounded,
        ground: this.groundFn, baseY: this.pos.y, look: this.riding ? null : this.reachT < REACH_TIME ? (this.reachAt ?? this.lookTarget) : this.lookTarget,
        saddle: this.riding ? this.saddle : null,
        squat: grounded ? this.squatNow(dt) : 0,
        reach: this.riding ? null : this.reachNow(dt),
      });
    }

    // pizza: grow giant, then shrink back
    const size = this.group.scale.x + ((this.bigT > 0 ? 1.7 : 1) - this.group.scale.x) * Math.min(1, dt * 5);
    this.group.scale.setScalar(size);

    this.balloon.visible = this.floatT > 0;
    if (this.balloon.visible) this.balloon.rotation.z = Math.sin(this.floatT * 3) * 0.08;
    this.canopy.visible = this.glideActive;
    if (this.glideActive) this.canopy.rotation.y += dt * 0.8;

    // hurt blink
    this.group.visible = this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0;
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

    if (this.human) {
      this.animateHuman(dt, hSpeed);
      return;
    }

    if (this.riding && !this.standRide) {
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
    // dance: spin, wave both arms, bounce (overrides the pose above)
    if (this.danceT > 0) {
      this.danceT = Math.max(0, this.danceT - dt);
      const k = DANCE_TIME - this.danceT;
      const w = Math.sin(k * 12);
      this.body.rotation.y = this.danceT > 0 ? k * 6.5 : 0;
      this.armL.rotation.set(0, 0, 2.3 + w * 0.5);
      this.armR.rotation.set(0, 0, -2.3 - w * 0.5);
      this.legL.rotation.x = w * 0.4;
      this.legR.rotation.x = -w * 0.4;
      this.body.position.y = Math.abs(w) * 0.15;
    }

    // blink now and then
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    const shut = this.blinkT < 0.13;
    for (const lid of this.lids) lid.visible = shut;

    // pizza: grow giant, then shrink back
    const size = this.group.scale.x + ((this.bigT > 0 ? 1.7 : 1) - this.group.scale.x) * Math.min(1, dt * 5);
    this.group.scale.setScalar(size);

    this.balloon.visible = this.floatT > 0;
    if (this.balloon.visible && this.danceT <= 0) this.armR.rotation.set(0, 0, -2.8); // holding the string
    if (this.balloon.visible) this.balloon.rotation.z = Math.sin(this.runPhase + this.floatT * 3) * 0.08;
    this.canopy.visible = this.glideActive;
    if (this.glideActive) this.canopy.rotation.y += dt * 0.8;

    // hurt blink
    this.group.visible = this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0;
  }
}
