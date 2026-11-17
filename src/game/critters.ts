/**
 * critters.ts — real animated animals and city cars from the Quaternius packs (CC0), packed by
 * scripts/build-animals.mjs into public/models/animals/*.glb and public/models/cars.glb.
 *
 * Animals load one file per kind, only when a level asks for them. Each one wanders in its own
 * patch of grass: it grazes, looks around, strolls to a new spot, and trots away from a kid who
 * runs right up to it. Nothing here ever hurts anyone.
 *
 * If a file can't be loaded, the animal simply isn't shown and the cars keep their simple shape.
 */

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

export type AnimalKind =
  | "alpaca" | "bull" | "cow" | "deer" | "donkey" | "fox" | "horse" | "horse_white" | "husky" | "shibainu" | "stag" | "wolf";

/** Standing height (m) each kind is scaled to. */
const HEIGHT: Record<AnimalKind, number> = {
  alpaca: 1.7, bull: 1.6, cow: 1.55, deer: 1.45, donkey: 1.4, fox: 0.55, horse: 1.85, horse_white: 1.85,
  husky: 0.75, shibainu: 0.6, stag: 2.0, wolf: 0.9,
};

/** Walking speed (m/s) at the scaled size; trotting is about 2.5×. */
const WALK: Record<AnimalKind, number> = {
  alpaca: 0.9, bull: 0.8, cow: 0.75, deer: 1.0, donkey: 0.8, fox: 0.9, horse: 1.1, horse_white: 1.1,
  husky: 1.0, shibainu: 0.9, stag: 1.0, wolf: 1.0,
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const base = () => `${import.meta.env.BASE_URL}models/`;

interface AnimalKit {
  scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; scale: number; lift: number;
  /** World speed (m/s) at which the hooves/paws stay planted, for the walk and the gallop. */
  walk: number; gallop: number;
}

/**
 * How fast a planted foot slides back in a clip (model units/s), watching the rig's foot targets.
 * Moving the body at that speed makes the feet look glued to the ground.
 */
function footSpeed(scene: THREE.Object3D, clip: THREE.AnimationClip | undefined): number {
  if (!clip) return 0;
  const body = SkeletonUtils.clone(scene);
  const mixer = new THREE.AnimationMixer(body);
  mixer.clipAction(clip).play();
  const feet = ["IKFrontLeg.L", "IKFrontLeg.R", "IKBackLeg.L", "IKBackLeg.R"].map((n) => body.getObjectByName(n)).filter((f): f is THREE.Object3D => !!f);
  const N = 48, step = clip.duration / N;
  const inv = new THREE.Matrix4(), v = new THREE.Vector3();
  const ys = feet.map(() => [] as number[]), zs = feet.map(() => [] as number[]);
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * step);
    body.updateMatrixWorld(true);
    inv.copy(body.matrixWorld).invert();
    feet.forEach((f, k) => { f.getWorldPosition(v).applyMatrix4(inv); ys[k].push(v.y); zs[k].push(v.z); });
  }
  const speeds: number[] = [];
  feet.forEach((_, k) => {
    const low = Math.min(...ys[k]) + (Math.max(...ys[k]) - Math.min(...ys[k])) * 0.08;
    for (let i = 0; i < N; i++) if (ys[k][i] <= low && ys[k][i + 1] <= low) speeds.push(Math.abs(zs[k][i + 1] - zs[k][i]) / step);
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(body);
  speeds.sort((a, b) => a - b);
  const mid = speeds[Math.floor(speeds.length / 2)];
  return Number.isFinite(mid) ? mid : 0;
}
const kits = new Map<AnimalKind, Promise<AnimalKit | null>>();

/** Load one kind of animal (once). Resolves null if it can't be loaded. */
export function loadAnimal(kind: AnimalKind): Promise<AnimalKit | null> {
  let p = kits.get(kind);
  if (!p) {
    p = loader.loadAsync(`${base()}animals/${kind}.glb`).then((g: GLTF) => {
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene);
      const h = Math.max(0.01, box.max.y - box.min.y);
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          m.castShadow = true;
          m.frustumCulled = false; // skinned: the bind-pose bounds don't follow the animation
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat.isMeshStandardMaterial) { mat.roughness = Math.max(mat.roughness, 0.75); mat.metalness = 0; }
        }
      });
      const scale = HEIGHT[kind] / h;
      const clips = new Map(g.animations.map((c) => [c.name, c]));
      // measured foot speeds, with sensible limits in case a clip measures oddly
      const walk = THREE.MathUtils.clamp(footSpeed(g.scene, clips.get("Walk")) * scale || WALK[kind], WALK[kind] * 0.5, WALK[kind] * 2);
      const gallop = THREE.MathUtils.clamp(footSpeed(g.scene, clips.get("Gallop")) * scale || walk * 2.6, walk * 1.5, walk * 6);
      return { scene: g.scene, clips, scale, lift: -box.min.y * scale, walk, gallop };
    }, (err) => {
      console.warn(`animal ${kind} unavailable`, err);
      return null;
    });
    kits.set(kind, p);
  }
  return p;
}

/** A fresh animated copy of an animal. */
export interface AnimalModel {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  play(name: "Idle" | "Walk" | "Eating" | "Gallop", fade?: number): void;
  /** Walk or gallop moving at `speed` m/s: picks the gait and times the steps to match. */
  moveAt(speed: number, fade?: number): void;
  readonly walk: number;
  readonly gallop: number;
}

export function makeAnimal(kit: AnimalKit, scaleBy = 1): AnimalModel {
  const root = new THREE.Group();
  const body = SkeletonUtils.clone(kit.scene);
  body.scale.setScalar(kit.scale * scaleBy);
  body.position.y = kit.lift * scaleBy;
  root.add(body);
  const mixer = new THREE.AnimationMixer(body);
  let cur: THREE.AnimationAction | null = null;
  let curName = "";
  const walk = kit.walk * scaleBy, gallop = kit.gallop * scaleBy;
  return {
    root, mixer, walk, gallop,
    moveAt(speed, fade = 0.3) {
      if (speed < 0.05) { this.play("Idle", fade); return; }
      const fast = speed > (walk + gallop) / 2;
      this.play(fast ? "Gallop" : "Walk", fade);
      if (cur) cur.timeScale = THREE.MathUtils.clamp(speed / (fast ? gallop : walk), 0.4, 3);
    },
    play(name, fade = 0.35) {
      if (name === curName) return;
      const clip = kit.clips.get(name) ?? kit.clips.get("Idle");
      if (!clip) return;
      const next = mixer.clipAction(clip);
      next.reset().setEffectiveWeight(1).play();
      next.timeScale = 1;
      if (cur) cur.crossFadeTo(next, fade, false);
      // different animals out of step with each other
      if (!cur) next.time = Math.random() * clip.duration;
      cur = next;
      curName = name;
    },
  };
}

// ── herds ──────────────────────────────────────────────────────────────────

export interface HerdDef {
  /** Which animals, one entry per animal. */
  kinds: AnimalKind[];
  /** The middle and radius of the patch they keep to. */
  x: number;
  z: number;
  r: number;
}

interface Beast {
  kind: AnimalKind;
  m: AnimalModel;
  home: HerdDef;
  /** Where it's strolling to, if anywhere. */
  goal: THREE.Vector2 | null;
  mode: "idle" | "eat" | "walk" | "trot";
  t: number;
  heading: number;
  radius: number;
  /** Current speed (m/s): animals speed up and slow down instead of jumping to a speed. */
  v: number;
  /** The kid riding it, if any (horses, donkeys and alpacas only). */
  rider: Rider | null;
  /** Height above the ground while hopping (ridden only). */
  hop: number;
  vy: number;
}

/** What a kid on an animal's back needs (the Player class has all of these). */
export interface Rider {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  facing: number;
  group: THREE.Object3D;
}

/** Animals a kid can climb onto, and how high their back is (a share of their height). */
const BACK: Partial<Record<AnimalKind, number>> = { horse: 0.6, horse_white: 0.6, donkey: 0.56, alpaca: 0.5 };
/** Top riding speed (m/s). A running kid does about 5. */
const RIDE_TOP: Partial<Record<AnimalKind, number>> = { horse: 12, horse_white: 12, donkey: 8.5, alpaca: 8 };
export const RIDE_EMOJI: Partial<Record<AnimalKind, string>> = { horse: "🐴", horse_white: "🐴", donkey: "🫏", alpaca: "🦙" };

/** Callbacks a ridden animal uses to stay out of walls and deep water. */
export interface RideWorld {
  collide(pos: THREE.Vector3, radius: number): void;
  /** True where the animal can't go (deep water). */
  blocked(x: number, z: number): boolean;
}

export class Herds {
  readonly group = new THREE.Group();
  private beasts: Beast[] = [];
  private gen = 0;
  private tmp = new THREE.Vector2();

  constructor(private readonly ground: (x: number, z: number) => number) {}

  /** Fill the level's patches. Animals pop in as their files arrive. */
  build(herds: HerdDef[]): void {
    this.clear();
    const gen = this.gen;
    for (const h of herds) {
      h.kinds.forEach((kind, i) => {
        loadAnimal(kind).then((kit) => {
          if (!kit || gen !== this.gen) return;
          const m = makeAnimal(kit);
          const a = (i / h.kinds.length) * Math.PI * 2 + h.x;
          const d = h.r * (0.35 + 0.4 * ((i * 7) % 5) / 5);
          const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
          m.root.position.set(x, this.ground(x, z), z);
          const heading = a + Math.PI / 2;
          m.root.rotation.y = heading;
          m.play(i % 2 ? "Eating" : "Idle", 0);
          this.group.add(m.root);
          this.beasts.push({ kind, m, home: h, goal: null, mode: i % 2 ? "eat" : "idle", t: 2 + ((i * 1.7) % 5), heading, radius: HEIGHT[kind] * 0.35, v: 0, rider: null, hop: 0, vy: 0 });
        });
      });
    }
  }

  clear(): void {
    this.gen++;
    for (const b of this.beasts) if (b.rider) this.dismount(b.rider);
    for (const b of this.beasts) b.m.mixer.stopAllAction();
    this.beasts = [];
    this.group.clear();
  }

  get count(): number {
    return this.beasts.length;
  }

  positions(): { kind: AnimalKind; x: number; z: number; mode: string }[] {
    return this.beasts.map((b) => ({ kind: b.kind, x: b.m.root.position.x, z: b.m.root.position.z, mode: b.mode }));
  }

  /** `kids` are the players' positions: animals shy away from a kid who runs right up. */
  update(dt: number, kids: THREE.Vector3[], camera?: THREE.Camera): void {
    for (const b of this.beasts) {
      const p = b.m.root.position;
      if (b.rider) {
        b.m.root.rotation.y = b.heading;
        b.m.mixer.update(dt);
        continue;
      }
      // the nearest kid
      let near: THREE.Vector3 | null = null, nd = Infinity;
      for (const k of kids) {
        const d = Math.hypot(k.x - p.x, k.z - p.z);
        if (d < nd) { nd = d; near = k; }
      }
      if (near && nd < 2.6 && b.mode !== "trot" && Math.abs(near.y - p.y) < 2) {
        // trot a few steps away, staying in the patch
        const ax = p.x - near.x, az = p.z - near.z, l = Math.hypot(ax, az) || 1;
        this.tmp.set(p.x + (ax / l) * 4, p.z + (az / l) * 4);
        this.clampHome(b, this.tmp);
        b.goal = this.tmp.clone();
        b.mode = "trot";
      }

      b.t -= dt;
      if (b.goal) {
        const dx = b.goal.x - p.x, dz = b.goal.y - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.3 || b.t < -12) {
          b.goal = null;
          b.v = 0;
          this.rest(b);
        } else {
          const want = Math.atan2(dx, dz);
          let dh = want - b.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          b.heading += dh * Math.min(1, dt * 3);
          // ease into the stride, slow for sharp turns and when arriving
          const top = b.mode === "trot" ? Math.min(b.m.gallop, b.m.walk * 3.2) : b.m.walk;
          const wantV = top * (Math.abs(dh) > 1.2 ? 0.35 : 1) * Math.min(1, 0.35 + dist / 1.5);
          b.v += THREE.MathUtils.clamp(wantV - b.v, -3 * dt, 2.5 * dt);
          p.x += Math.sin(b.heading) * b.v * dt;
          p.z += Math.cos(b.heading) * b.v * dt;
          b.m.moveAt(b.v, 0.25);
        }
      } else if (b.t <= 0) {
        // stroll somewhere new in the patch
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * b.home.r;
        b.goal = new THREE.Vector2(b.home.x + Math.cos(a) * r, b.home.z + Math.sin(a) * r);
        b.mode = "walk";
        b.t = 0;
      }
      // keep apart from the rest of the herd
      for (const o of this.beasts) {
        if (o === b) continue;
        const q = o.m.root.position;
        const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz), min = b.radius + o.radius + 0.3;
        if (d > 0.001 && d < min) { p.x += (dx / d) * (min - d) * 0.5; p.z += (dz / d) * (min - d) * 0.5; }
      }
      const gy = this.ground(p.x, p.z);
      p.y += (gy - p.y) * Math.min(1, dt * 10);
      b.m.root.rotation.y = b.heading;
      // only animate what might be seen
      if (!camera || p.distanceToSquared(camera.position) < 70 * 70) b.m.mixer.update(dt);
    }
  }

  // ── riding ────────────────────────────────────────────────────────────────

  /** The nearest free animal a kid at pos can climb onto (within reach), or null. */
  mountable(pos: THREE.Vector3, reach: number): AnimalKind | null {
    return this.nearestRideable(pos, reach)?.kind ?? null;
  }

  private nearestRideable(pos: THREE.Vector3, reach: number): Beast | null {
    let best: Beast | null = null, bd = reach;
    for (const b of this.beasts) {
      if (b.rider || BACK[b.kind] === undefined) continue;
      const p = b.m.root.position;
      if (Math.abs(pos.y - p.y) > 1.5) continue;
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Climb onto the nearest rideable animal. Returns its kind, or null if none is close. */
  mount(rider: Rider, reach: number): AnimalKind | null {
    const b = this.nearestRideable(rider.pos, reach);
    if (!b) return null;
    b.rider = rider;
    b.goal = null;
    b.v = 0;
    b.hop = 0;
    b.vy = 0;
    b.mode = "walk";
    b.m.play("Idle", 0.2);
    this.seat(b);
    return b.kind;
  }

  /** The animal this kid is sitting on, if any. */
  ridden(rider: Rider): AnimalKind | null {
    return this.beasts.find((b) => b.rider === rider)?.kind ?? null;
  }

  /** Slide off to the animal's side. Returns false if the kid wasn't riding. */
  dismount(rider: Rider): boolean {
    const b = this.beasts.find((x) => x.rider === rider);
    if (!b) return false;
    b.rider = null;
    b.v = 0;
    b.hop = 0;
    const p = b.m.root.position;
    p.y = this.ground(p.x, p.z);
    const side = b.radius + 0.6;
    rider.pos.set(p.x + Math.cos(b.heading) * side, p.y + 0.1, p.z - Math.sin(b.heading) * side);
    rider.vel.set(0, 0, 0);
    this.rest(b);
    b.t = 1.5;
    return true;
  }

  /**
   * The rider steers: (wishX, wishZ) is where the stick points in the world, its length how fast.
   * Push gently to walk, all the way to gallop. Jump makes the animal leap (over fences and logs).
   */
  steer(rider: Rider, wishX: number, wishZ: number, jump: boolean, dt: number, world: RideWorld): { leapt: boolean; speed: number } {
    const b = this.beasts.find((x) => x.rider === rider);
    if (!b) return { leapt: false, speed: 0 };
    const p = b.m.root.position;
    const mag = Math.min(1, Math.hypot(wishX, wishZ));
    let dh = 0;
    if (mag > 0.1) {
      const want = Math.atan2(wishX, wishZ);
      dh = want - b.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      b.heading += THREE.MathUtils.clamp(dh, -dt * 3.2, dt * 3.2);
    }
    // a real gallop: horses are the fastest way across an island (faster than a running kid)
    const top = RIDE_TOP[b.kind] ?? 8;
    const wantV = mag * top * (Math.abs(dh) > 2 ? 0.3 : 1);
    b.v += THREE.MathUtils.clamp(wantV - b.v, -9 * dt, 7 * dt);
    const ox = p.x, oz = p.z;
    p.x += Math.sin(b.heading) * b.v * dt;
    p.z += Math.cos(b.heading) * b.v * dt;
    if (world.blocked(p.x, p.z)) { p.x = ox; p.z = oz; b.v *= 0.5; }
    const was = p.y;
    p.y = this.ground(p.x, p.z) + b.hop;
    world.collide(p, b.radius);
    let leapt = false;
    if (jump && b.hop === 0) { b.vy = 6; leapt = true; }
    if (b.hop > 0 || b.vy > 0) {
      b.vy -= 18 * dt;
      b.hop = Math.max(0, b.hop + b.vy * dt);
      if (b.hop === 0) b.vy = 0;
    }
    const gy = this.ground(p.x, p.z);
    // smooth small steps, follow a leap exactly
    p.y = b.hop > 0 ? gy + b.hop : was + (gy - was) * Math.min(1, dt * 12);
    for (const o of this.beasts) {
      if (o === b) continue;
      const q = o.m.root.position;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), min = b.radius + o.radius + 0.2;
      if (d > 0.001 && d < min && Math.abs(q.y - p.y) < 1.5) { q.x = p.x + (dx / d) * min; q.z = p.z + (dz / d) * min; }
    }
    if (b.hop > 0) b.m.play("Gallop", 0.15);
    else b.m.moveAt(b.v, 0.25);
    this.seat(b);
    return { leapt, speed: b.v };
  }

  /** Put the rider on the animal's back. */
  private seat(b: Beast): void {
    const r = b.rider!;
    const p = b.m.root.position, h = HEIGHT[b.kind];
    const back = h * (BACK[b.kind] ?? 0.6) - 0.45; // the kid's seated hips sit ~0.45 above their feet
    // a little bob in time with the stride
    const bob = b.v > 0.3 ? Math.abs(Math.sin(performance.now() / (b.v > b.m.walk * 2 ? 110 : 200))) * 0.06 : 0;
    r.pos.set(p.x - Math.sin(b.heading) * h * 0.06, p.y + back + bob, p.z - Math.cos(b.heading) * h * 0.06);
    r.vel.set(0, 0, 0);
    r.facing = b.heading;
    r.group.rotation.y = b.heading;
  }

  /** The nearest animal within reach (ridden ones too), for petting. */
  nearestKind(pos: THREE.Vector3, reach: number): AnimalKind | null {
    let best: Beast | null = null, bd = reach;
    for (const b of this.beasts) {
      const p = b.m.root.position;
      const d = Math.hypot(pos.x - p.x, pos.z - p.z) - b.radius;
      if (d < bd && Math.abs(pos.y - p.y) < 1.5) { bd = d; best = b; }
    }
    return best?.kind ?? null;
  }

  /** A kid pats the nearest animal: it stops, turns to look at them and stays a while. */
  pet(pos: THREE.Vector3, reach: number): AnimalKind | null {
    let best: Beast | null = null, bd = reach;
    for (const b of this.beasts) {
      if (b.rider) continue;
      const p = b.m.root.position;
      const d = Math.hypot(pos.x - p.x, pos.z - p.z) - b.radius;
      if (d < bd && Math.abs(pos.y - p.y) < 1.5) { bd = d; best = b; }
    }
    if (!best) return null;
    const p = best.m.root.position;
    best.goal = null;
    best.v = 0;
    best.mode = "idle";
    best.t = 4;
    best.heading = Math.atan2(pos.x - p.x, pos.z - p.z);
    best.m.play("Idle", 0.25);
    return best.kind;
  }

  /** The head of the nearest animal within `maxD` of pos, written into `out` (null if none). */
  nearestHead(pos: THREE.Vector3, maxD: number, out: THREE.Vector3): THREE.Vector3 | null {
    let best: Beast | null = null, bd = maxD;
    for (const b of this.beasts) {
      const d = b.m.root.position.distanceTo(pos);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return null;
    const p = best.m.root.position, h = HEIGHT[best.kind];
    return out.set(p.x + Math.sin(best.heading) * h * 0.45, p.y + h * 0.8, p.z + Math.cos(best.heading) * h * 0.45);
  }

  /** Animals are solid: nudge a kid (or ride) at pos out of any animal it overlaps. */
  pushOut(pos: THREE.Vector3, radius: number): void {
    for (const b of this.beasts) {
      const p = b.m.root.position;
      if (pos.y > p.y + HEIGHT[b.kind] || pos.y < p.y - 1) continue;
      const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz), min = b.radius + radius;
      if (d > 0.001 && d < min) { pos.x = p.x + (dx / d) * min; pos.z = p.z + (dz / d) * min; }
    }
  }

  private rest(b: Beast): void {
    const eat = Math.random() < 0.55;
    b.mode = eat ? "eat" : "idle";
    b.t = 3 + Math.random() * 6;
    b.m.play(eat ? "Eating" : "Idle");
  }

  private clampHome(b: Beast, v: THREE.Vector2): void {
    const dx = v.x - b.home.x, dz = v.y - b.home.z, d = Math.hypot(dx, dz);
    if (d > b.home.r) { v.x = b.home.x + (dx / d) * b.home.r; v.y = b.home.z + (dz / d) * b.home.r; }
  }
}

// ── city cars ──────────────────────────────────────────────────────────────

export const CAR_MODELS = ["NormalCar1", "NormalCar2", "SportsCar", "SportsCar2", "SUV", "Taxi", "Cop"] as const;

let cars: Map<string, THREE.Object3D> | null = null;
let carsLoading: Promise<boolean> | null = null;

/** Start loading the city cars (once). Resolves true when carModel() can be used. */
export function loadCarKit(): Promise<boolean> {
  if (carsLoading) return carsLoading;
  carsLoading = loader.loadAsync(`${base()}cars.glb`).then((g) => {
    const map = new Map<string, THREE.Object3D>();
    for (const name of CAR_MODELS) {
      const node = g.scene.getObjectByName(name);
      if (!node) continue;
      node.position.set(0, 0, 0);
      node.updateMatrixWorld(true);
      // face +Z (the way traffic drives): the headlights are at the front
      let front = 0;
      node.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        if (/Headlights/.test((m.material as THREE.Material).name)) {
          m.geometry.computeBoundingBox();
          front = m.geometry.boundingBox!.getCenter(new THREE.Vector3()).z;
          const mat = (m.material as THREE.MeshStandardMaterial);
          mat.emissive = new THREE.Color(0xffe680);
          mat.emissiveIntensity = 0.5;
        }
        if (/BlueLights/.test((m.material as THREE.Material).name)) {
          const mat = (m.material as THREE.MeshStandardMaterial);
          mat.emissive = new THREE.Color(0x3d7bff);
          mat.emissiveIntensity = 0.8;
        }
      });
      const holder = new THREE.Group();
      holder.add(node);
      if (front < 0) node.rotation.y = Math.PI;
      map.set(name, holder);
    }
    cars = map;
    return map.size > 0;
  }, (err) => {
    console.warn("city cars unavailable", err);
    return false;
  });
  return carsLoading;
}

/** A copy of city car `i` (wraps around the list), about 4.2 m long, wheels on y = 0. */
export function carModel(i: number): THREE.Object3D | null {
  if (!cars || cars.size === 0) return null;
  const list = [...cars.values()];
  return list[((i % list.length) + list.length) % list.length].clone();
}
