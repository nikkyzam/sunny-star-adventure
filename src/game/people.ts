/**
 * people.ts — grown-up villagers from the Quaternius "Animated Men/Women Characters" packs (CC0),
 * converted by scripts/build-villagers.mjs into public/models/people/*.glb.
 *
 * Kids are the customizable human models (humans.ts); grown-ups are these: four men's and four
 * women's outfits, each tinted with the villager's own clothes colors and skin tone. They stand,
 * walk, run and clap (clapping is their happy "dance" when a kid talks to them), lean a little
 * into turns and turn their heads to look at a kid who comes close.
 *
 * If the files can't be loaded, villagers simply keep the kid models.
 */

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { BoneGuard, type Move } from "./humans";

export const ADULT_FILES = [
  "male_casual", "male_longsleeve", "male_shirt", "male_suit",
  "female_casual", "female_alternative", "female_dress", "female_tanktop",
] as const;
export type AdultKind = (typeof ADULT_FILES)[number];

/** Standing heights (m): a head taller than the kids. */
const HEIGHT = { male: 1.95, female: 1.85 };

interface PersonKit { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; scale: number; lift: number }
let kits: Map<AdultKind, PersonKit> | null = null;
let loading: Promise<boolean> | null = null;

export function peopleReady(): boolean {
  return kits !== null;
}

/** Start loading the grown-ups (once). Resolves true when makeAdult can be used. */
export function loadPeopleKit(): Promise<boolean> {
  if (loading) return loading;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/people/`;
  loading = Promise.all(ADULT_FILES.map((f) => loader.loadAsync(`${base}${f}.glb`))).then((files: GLTF[]) => {
    const map = new Map<AdultKind, PersonKit>();
    files.forEach((g, i) => {
      const kind = ADULT_FILES[i];
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene);
      const scale = HEIGHT[kind.startsWith("female") ? "female" : "male"] / Math.max(0.01, box.max.y - box.min.y);
      // short clip names: "HumanArmature|Man_Walk" → "Walk"
      const clips = new Map(g.animations.map((c) => [c.name.replace(/^.*\|(Man|Female)_/, ""), c]));
      map.set(kind, { scene: g.scene, clips, scale, lift: -box.min.y * scale });
    });
    kits = map;
    return true;
  }, (err) => {
    console.warn("grown-up villagers unavailable, using kid models", err);
    return false;
  });
  return loading;
}

/** Which clip plays for each move the game asks for. */
const CLIP: Record<Move, string> = {
  idle: "Idle", walk: "Walk", jog: "Run", sprint: "Run", jump: "Idle", fall: "Idle", land: "Idle",
  dance: "Clapping", drive: "Idle", sit: "Idle", swim: "Idle", float: "Idle", talk: "Idle", wave: "Clapping",
};
/** Speeds (m/s) at which the walk and run clips look right at grown-up size. */
const WALK_SPEED = 1.5, RUN_SPEED = 4.2;

export interface AdultLook {
  kind: AdultKind;
  skin: number;
  /** Shirt, dress or jacket; trousers; a second clothes color. */
  top: number;
  bottom: number;
  accent: number;
}

const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), Q4 = new THREE.Quaternion(), Q5 = new THREE.Quaternion();
const E1 = new THREE.Euler();

export class Adult {
  readonly root: THREE.Group;
  /** Hats go in here (laid out for the old cartoon head: center (0, 1.5, 0), radius 0.26). */
  readonly headAcc = Object.assign(new THREE.Group(), { name: "headAcc" });
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = "";
  private currentMove: Move = "idle";
  private owned: THREE.Material[] = [];
  private sleepT = 0;
  private fresh = false;
  private neck: THREE.Object3D | null;
  private head: THREE.Object3D | null;
  private lookYaw = 0;
  private readonly guard = new BoneGuard();
  private lookPitch = 0;

  constructor(private readonly kit: PersonKit, look: AdultLook) {
    this.root = new THREE.Group();
    const body = SkeletonUtils.clone(kit.scene);
    body.scale.multiplyScalar(kit.scale);
    body.position.y = kit.lift;
    this.root.add(body);
    // geometry is shared between villagers: cleanup code must not dispose anything in here
    this.root.userData.shared = true;

    const tint = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
      const n = /^(Skin)$/.test(m.name) ? look.skin
        : /^(Shirt|Dress|Jacket)$/.test(m.name) ? look.top
        : /^(Pants)$/.test(m.name) ? look.bottom
        : /^(Shirt2|LightJacket)$/.test(m.name) ? look.accent
        : null;
      const c = m.clone();
      if (n !== null) c.color.setHex(n);
      c.roughness = 0.8;
      c.metalness = 0;
      c.opacity = 1;
      c.transparent = false;
      this.owned.push(c);
      return c;
    };
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // skinned: bind-pose bounds don't follow the animation
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => tint(m as THREE.MeshStandardMaterial))
        : tint(mesh.material as THREE.MeshStandardMaterial);
    });

    this.neck = body.getObjectByName("Neck") ?? null;
    this.head = body.getObjectByName("Head") ?? null;
    if (this.head) {
      // hats: map the cartoon head (eyes at (0, 1.53, 0.243)) onto this head
      // eyes sit a little above and in front of the head bone
      this.root.updateMatrixWorld(true);
      const k = kit.scale * Math.max(0.01, new THREE.Box3().setFromObject(kit.scene).max.y - new THREE.Box3().setFromObject(kit.scene).min.y) / 1.95;
      const eye = this.root.worldToLocal(this.head.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.09 * k, 0.09 * k));
      const s = 0.5;
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(this.head.matrixWorld).invert().multiply(this.root.matrixWorld);
      this.head.add(holder);
      this.headAcc.scale.setScalar(s);
      this.headAcc.position.set(eye.x, eye.y - 1.53 * s + 0.04, eye.z - 0.243 * s);
      holder.add(this.headAcc);
    }

    this.mixer = new THREE.AnimationMixer(body);
    this.play("idle");
  }

  play(move: Move, timeScale = 1): void {
    this.currentMove = move;
    this.fadeTo(CLIP[move], timeScale);
  }

  /** On foot at `speed` m/s: stand, walk or run, with the steps timed to the speed. */
  moveAt(speed: number): void {
    if (speed < 0.3) this.play("idle");
    else if (speed < (WALK_SPEED + RUN_SPEED) / 2) { this.currentMove = "walk"; this.fadeTo("Walk", THREE.MathUtils.clamp(speed / WALK_SPEED, 0.5, 1.8)); }
    else { this.currentMove = "jog"; this.fadeTo("Run", THREE.MathUtils.clamp(speed / RUN_SPEED, 0.6, 2)); }
  }

  get move(): Move | null {
    return this.currentMove;
  }

  update(dt: number, near = true): void {
    this.fresh = false;
    if (near) {
      this.mixer.update(dt + this.sleepT);
      this.sleepT = 0;
      this.fresh = true;
      return;
    }
    this.sleepT += dt;
    if (this.sleepT > 0.2) {
      this.mixer.update(this.sleepT);
      this.sleepT = 0;
      this.fresh = true;
    }
  }

  /** Lean into turns and turn the head toward `look` (grown-ups stand on flat ground: no foot IK). */
  pose(dt: number, o: { turnRate: number; accel: number; grounded: boolean; look?: THREE.Vector3 | null; ground?: unknown; baseY?: number }): void {
    if (!this.fresh) return;
    const k = Math.min(1, dt * 8);
    const roll = o.grounded ? THREE.MathUtils.clamp(-o.turnRate * 0.05, -0.15, 0.15) : 0;
    this.root.rotation.z += (roll - this.root.rotation.z) * k;
    this.root.updateMatrixWorld(true);
    this.guard.restore();
    this.turnHead(dt, o.look ?? null);
    this.guard.commit();
  }

  debugFeet(_ground?: unknown): number[] {
    return [];
  }

  /** How far the head is turned from the body (radians, for tests). */
  headYaw(): number {
    const h = this.head;
    if (!h) return 0;
    const hq = h.getWorldQuaternion(new THREE.Quaternion());
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const rel = rq.invert().multiply(hq);
    return new THREE.Euler().setFromQuaternion(rel, "YXZ").y;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const m of this.owned) m.dispose();
    this.root.removeFromParent();
  }

  private fadeTo(clipName: string, timeScale: number): void {
    let a = this.actions.get(clipName);
    if (!a) {
      const clip = this.kit.clips.get(clipName) ?? this.kit.clips.get("Idle");
      if (!clip) return;
      a = this.mixer.clipAction(clip);
      this.actions.set(clipName, a);
    }
    a.timeScale = timeScale;
    if (this.current === clipName) return;
    const prev = this.actions.get(this.current);
    a.reset().setEffectiveWeight(1).play();
    if (prev) a.crossFadeFrom(prev, 0.25, false);
    else a.time = Math.random() * a.getClip().duration; // villagers out of step with each other
    this.current = clipName;
  }

  private turnHead(dt: number, look: THREE.Vector3 | null): void {
    if (!this.head || !this.neck) return;
    let yaw = 0, pitch = 0;
    if (look) {
      const hp = this.root.worldToLocal(this.head.getWorldPosition(V1));
      const tp = this.root.worldToLocal(V2.copy(look));
      const dx = tp.x - hp.x, dy = tp.y - hp.y, dz = tp.z - hp.z;
      const y = Math.atan2(dx, dz);
      if (Math.abs(y) < 1.9) {
        yaw = THREE.MathUtils.clamp(y, -1.0, 1.0);
        pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.5);
      }
    }
    const k = Math.min(1, dt * 4);
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    if (Math.abs(this.lookYaw) < 0.002 && Math.abs(this.lookPitch) < 0.002) return;
    const rootQ = this.root.getWorldQuaternion(Q1);
    for (const [bone, share] of [[this.neck, 0.4], [this.head, 0.6]] as const) {
      Q2.setFromEuler(E1.set(this.lookPitch * share, this.lookYaw * share, 0, "YXZ"));
      Q3.copy(rootQ).multiply(Q2).multiply(Q4.copy(rootQ).invert());
      this.guard.mark(bone);
      const world = bone.getWorldQuaternion(Q5).premultiply(Q3);
      const parent = bone.parent!.getWorldQuaternion(Q2);
      bone.quaternion.copy(parent.invert().multiply(world));
      bone.updateWorldMatrix(false, true);
    }
  }
}

/** A grown-up villager, or null if the models haven't loaded (yet). */
export function makeAdult(look: AdultLook): Adult | null {
  const kit = kits?.get(look.kind);
  return kit ? new Adult(kit, look) : null;
}

// ── who's who ──────────────────────────────────────────────────────────────

/** Villagers who are children (they keep the kid models), and aliens (cartoon, from the Moon). */
const KIDS = new Set(["David", "Zib", "Blorp"]);
const WOMEN = new Set([
  "Captain Coral", "Mayor Maple", "Grandma Gigi", "Farmer Fern", "Surfer Sky", "Camper Cleo", "Artist Ari",
  "Agent Goldie", "Pilot Piper", "Astronaut Ada", "Driver Dee", "Fisher Flo", "Cargo Cass", "Diver Dot",
  "Mayor Marigold", "Agent Aria", "Pastor Grace", "Postie Paz", "Pilot Penny", "Ranger Rosa", "Manager Mia",
  "Chef Coco", "Pilot Skye", "Nadia of Nineveh",
]);
/** Dressed up: suits and dresses. */
const SMART = /^(Mayor|Pastor|Agent|Manager|King)\b/;
const BEACH = /^(Surfer|Lifeguard|Diver)\b/;

/** Which grown-up body a villager gets, or null for children. */
export function adultKindFor(name: string): AdultKind | null {
  if (KIDS.has(name)) return null;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  if (WOMEN.has(name)) {
    if (SMART.test(name)) return "female_dress";
    if (BEACH.test(name)) return "female_tanktop";
    return (["female_casual", "female_alternative", "female_dress"] as const)[h % 3];
  }
  if (SMART.test(name)) return "male_suit";
  return (["male_casual", "male_longsleeve", "male_shirt"] as const)[h % 3];
}
