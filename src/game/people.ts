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
import { skinSkirt, skirtMesh } from "./skirt";
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
  /** Bible-times clothes over the outfit (robeFor). */
  robe?: RobeLook;
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

    const robe = look.robe;
    const tint = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
      const n = /^(Skin)$/.test(m.name) ? look.skin
        : /^(Shirt|Dress|Jacket)$/.test(m.name) ? look.top
        : /^(Pants)$/.test(m.name) ? look.bottom
        : /^(Shirt2|LightJacket)$/.test(m.name) ? look.accent
        : null;
      const c = m.clone();
      if (n !== null) c.color.setHex(n);
      if (robe && /^(Shirt|Dress|Jacket|Pants|Shirt2|LightJacket)$/.test(m.name)) c.color.setHex(robe.robe);
      if (robe && m.name === "Socks") c.color.setHex(0x6b4a2e); // sandal brown
      if (robe && robe.head !== "crown" && robe.head !== "bare" && m.name === "Hair") c.visible = false; // under the head cloth
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

    if (robe) this.dress(body, robe, look.kind);

    this.mixer = new THREE.AnimationMixer(body);
    this.play("idle");
  }

  /** Bible-times clothes: a long robe with a sash, a cloak for kings and travellers from afar,
   *  and a head cloth or veil. Each piece rides on a bone, laid out in the standing pose. */
  private dress(body: THREE.Object3D, robe: RobeLook, kind: AdultKind): void {
    this.root.updateMatrixWorld(true);
    const at = (name: string) => {
      const b = body.getObjectByName(name);
      return b ? this.root.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : null;
    };
    const anchor = (name: string): THREE.Object3D | null => {
      const bone = body.getObjectByName(name);
      if (!bone) return null;
      const h = new THREE.Group();
      h.matrixAutoUpdate = false;
      h.matrix.copy(bone.matrixWorld).invert().multiply(this.root.matrixWorld);
      bone.add(h);
      return h;
    };
    const hips = at("Hips"), neck = at("Neck"), head = at("Head"), knee = at("LowerLegL"), shL = at("UpperArmL"), shR = at("UpperArmR");
    if (!hips || !neck || !head || !knee || !shL || !shR) return;
    const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, side: THREE.DoubleSide, ...extra });
      this.owned.push(m);
      return m;
    };
    const add = (parent: THREE.Object3D | null, geo: THREE.BufferGeometry, m: THREE.Material, sz = 1) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.scale.z = sz;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.robe = true;
      parent?.add(mesh);
      return mesh;
    };
    const female = kind.startsWith("female");
    const k = hips.y / (female ? 0.95 : 1.0); // body size against a typical grown-up
    const w = Math.abs(shL.x - shR.x) * 0.5;   // half the shoulder width
    const robeM = mat(robe.robe), trimM = mat(robe.trim, robe.trim === GOLD ? { metalness: 0.5, roughness: 0.4, emissive: 0x3a2a00 } : {});
    const geo = robeGeos(kind, hips.y, knee.y, w, k);

    // the long skirt of the robe, from the waist to the ankles, with a band at the hem
    const hipsBone = anchor("Hips");
    add(hipsBone, geo.sash, trimM, 0.78).position.set(hips.x, hips.y, hips.z);
    // the skirt and hem swing with the legs (skirt.ts); without the bones, a stiff skirt on the hips
    const legs = { hips: body.getObjectByName("Hips"), legL: body.getObjectByName("UpperLegL"), legR: body.getObjectByName("UpperLegR") };
    let skin: THREE.SkinnedMesh | null = null;
    body.traverse((o) => { if (!skin && (o as THREE.SkinnedMesh).isSkinnedMesh && (o as THREE.SkinnedMesh).skeleton.bones.includes(legs.hips as THREE.Bone)) skin = o as THREE.SkinnedMesh; });
    const sk = skin as THREE.SkinnedMesh | null;
    if (sk && legs.legL instanceof THREE.Bone && legs.legR instanceof THREE.Bone && legs.hips instanceof THREE.Bone) {
      const bones = { hips: legs.hips, legL: legs.legL, legR: legs.legR };
      const sg = skinnedRobe(kind, geo, hips, (g) => skinSkirt(g, this.root, sk, bones, geo.waist, geo.hemY));
      for (const [g, m] of [[sg.skirt, robeM], [sg.hem, trimM]] as const) skirtMesh(g, m, sk, bones, true).userData.robe = true;
    } else {
      for (const piece of [add(hipsBone, geo.skirt, robeM, 0.78), add(hipsBone, geo.hem, trimM, 0.78)]) piece.position.set(hips.x, hips.y, hips.z);
    }
    // the cloak hangs from the shoulders down the back
    if (robe.cloak !== undefined) {
      const torso = anchor("Torso");
      const cloak = add(torso, geo.cloak, mat(robe.cloak), 0.8);
      cloak.position.set(hips.x, neck.y - 0.06 * k, neck.z - 0.02 * k);
      const collar = add(torso, geo.collar, trimM, 0.8);
      collar.position.set(hips.x, neck.y - 0.05 * k, neck.z - 0.01 * k);
    }
    // the head cloth (men) or veil (women), open at the face, fitted to the real head
    if (robe.head === "cloth" || robe.head === "veil") {
      const hb = anchor("Head");
      const fit = headFit(kind, body, this.root, head.y);
      const c = new THREE.Vector3(fit.x, fit.top - 0.085 * k, fit.z - 0.012 * k);
      const g2 = headGeos(kind, fit.r, k);
      const clothM = mat(robe.headColor);
      add(hb, g2.cap, clothM).position.copy(c);
      add(hb, robe.head === "veil" ? g2.veil : g2.drape, clothM).position.copy(c);
      add(hb, g2.band, robe.head === "cloth" ? mat(robe.trim === GOLD ? 0x3a2a1a : robe.trim) : clothM).position.set(c.x, c.y + 0.02 * k, c.z);
    }
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

// ── Bible-times clothes ────────────────────────────────────────────────────

export interface RobeLook {
  robe: number;
  /** Sash and hem (GOLD shines). */
  trim: number;
  /** A head cloth, a woman's veil, a crown (the hat), or nothing. */
  head: "cloth" | "veil" | "crown" | "bare";
  headColor: number;
  /** A cloak down the back: kings, the Wise Men, Mary's mantle is her veil. */
  cloak?: number;
}

const GOLD = 0xe8b830;
const LINEN = 0xeee4cc;

/** The people of the Bible worlds. (David is a boy: his tunic goes on a kid's model, humans.ts.) */
const ROBES: Record<string, RobeLook> = {
  // Noah's Ark
  "Noah": { robe: 0x8a6a4a, trim: LINEN, head: "cloth", headColor: 0xefe6d2 },
  "Shem": { robe: 0x5e7fa8, trim: 0xc9a46a, head: "cloth", headColor: 0xe9dfc8 },
  "Ham": { robe: 0xa8643c, trim: LINEN, head: "cloth", headColor: 0xdcc8a0 },
  "Japheth": { robe: 0x6f8a4e, trim: 0xd9c08a, head: "cloth", headColor: 0xe9dfc8 },
  // Jonah
  "Jonah": { robe: 0x9b7b56, trim: LINEN, head: "cloth", headColor: 0x4f6f8f },
  "Sailor Sam": { robe: 0x3d5a80, trim: LINEN, head: "cloth", headColor: 0xd94f4f },
  "King of Nineveh": { robe: 0x7b2d8b, trim: GOLD, head: "crown", headColor: 0, cloak: 0xa8323a },
  "Nadia of Nineveh": { robe: 0x2f8f8a, trim: 0xf0d080, head: "veil", headColor: 0xf0d080 },
  // David and Goliath
  "David": { robe: 0xe2cfa4, trim: 0xb5452f, head: "bare", headColor: 0 },
  "Goliath": { robe: 0x5a4a32, trim: 0xb08d57, head: "bare", headColor: 0 },
  "King Saul": { robe: 0x8b2d3a, trim: GOLD, head: "crown", headColor: 0, cloak: 0x4a2d7b },
  "Eliab": { robe: 0x8a7a5a, trim: 0xb04a3a, head: "cloth", headColor: 0xc94f3a },
  "Jesse": { robe: 0xc9b896, trim: 0x7a5a3a, head: "cloth", headColor: 0xf0eadc },
  // Bethlehem
  "Mary": { robe: 0xf1e7d6, trim: 0x3f6fc4, head: "veil", headColor: 0x3f6fc4 },
  "Joseph": { robe: 0x8b6a45, trim: LINEN, head: "cloth", headColor: 0xd8c49a },
  "Wise Man Caspar": { robe: 0x7b3fa0, trim: GOLD, head: "crown", headColor: 0, cloak: 0xd4a017 },
  "Wise Man Melchior": { robe: 0xd4a017, trim: GOLD, head: "crown", headColor: 0, cloak: 0x8b1e2e },
  "Wise Man Balthazar": { robe: 0x2f6bb0, trim: GOLD, head: "crown", headColor: 0, cloak: 0x6b2fa0 },
  "Innkeeper Ezra": { robe: 0xb5835a, trim: LINEN, head: "cloth", headColor: 0xeee5d0 },
  "Shepherd Eli": { robe: 0x9b8361, trim: 0x5a4632, head: "cloth", headColor: 0xd9cdb0 },
  "Shepherd Asa": { robe: 0x7d6a4f, trim: LINEN, head: "cloth", headColor: 0x8fa3b8 },
};

/** Bible-times clothes for this villager, or undefined for everyday clothes. */
export function robeFor(name: string): RobeLook | undefined {
  return ROBES[name];
}

/** Robe shapes are the same for everyone of one body: made once and shared. */
type RobeGeos = Record<"skirt" | "hem" | "sash" | "cloak" | "collar", THREE.BufferGeometry> & { waist: number; hemY: number };
const robeCache = new Map<string, RobeGeos>();
function robeGeos(kind: AdultKind, hipY: number, kneeY: number, w: number, k: number): RobeGeos {
  const key = kind;
  const hit = robeCache.get(key);
  if (hit) return hit;
  const female = kind.startsWith("female");
  const waist = hipY + (female ? 0.12 : 0.2) * k; // up to the shirt's hem, so no trousers show
  const r0 = w * (female ? 1.0 : 0.95);
  const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y - hipY)), 18);
  const hemY = 0.06 * k;
  const skirt = lathe([
    [r0 * 1.0, waist], [r0 * 1.06, (waist + hipY) / 2], [r0 * 1.1, hipY - 0.02 * k], [r0 * 1.11, hipY - (hipY - kneeY) * 0.3],
    [r0 * 1.12, (hipY + kneeY) / 2], [r0 * 1.17, hipY - (hipY - kneeY) * 0.75], [r0 * 1.22, kneeY],
    [r0 * 1.36, (kneeY + hemY) / 2], [r0 * 1.5, hemY + 0.08 * k], [r0 * 1.6, hemY],
  ]);
  const hem = new THREE.CylinderGeometry(r0 * 1.61, r0 * 1.63, 0.07 * k, 18, 1, true);
  hem.translate(0, hemY + 0.035 * k - hipY, 0);
  const sash = new THREE.TorusGeometry(r0 * 1.04, 0.032 * k, 6, 18);
  sash.rotateX(Math.PI / 2);
  sash.translate(0, waist - 0.04 * k - hipY, 0);
  // the cloak: an open cone round the back, from the shoulders to just above the hem
  const cloakH = waist + 0.42 * k - 0.16 * k;
  const cloak = new THREE.CylinderGeometry(w * 0.95, r0 * 1.75, cloakH, 14, 1, true, Math.PI - 1.35, 2.7);
  cloak.translate(0, -cloakH / 2, 0);
  const collar = new THREE.TorusGeometry(w * 0.72, 0.035 * k, 6, 16, Math.PI * 1.1);
  collar.rotateX(Math.PI / 2);
  collar.rotateY(Math.PI / 2 + Math.PI * 0.45);
  const out = { skirt, hem, sash, cloak, collar, waist, hemY };
  robeCache.set(key, out);
  return out;
}

/** The skirt and hem laid out in the body's space and skinned to its legs: once per body. */
const skinnedCache = new Map<string, { skirt: THREE.BufferGeometry; hem: THREE.BufferGeometry }>();
function skinnedRobe(kind: AdultKind, geo: RobeGeos, hips: THREE.Vector3, skin: (g: THREE.BufferGeometry) => THREE.BufferGeometry) {
  const hit = skinnedCache.get(kind);
  if (hit) return hit;
  // as the stiff pieces were placed: centred on the hips, a little flatter front to back
  const place = (g: THREE.BufferGeometry) => skin(g.clone().scale(1, 1, 0.78).translate(hips.x, hips.y, hips.z));
  const out = { skirt: place(geo.skirt), hem: place(geo.hem) };
  skinnedCache.set(kind, out);
  return out;
}

/** The real head of each body (the skin above the head bone, standing pose): top, middle, half width. */
const headCache = new Map<string, { top: number; x: number; z: number; r: number }>();
function headFit(kind: AdultKind, body: THREE.Object3D, root: THREE.Object3D, boneY: number) {
  const hit = headCache.get(kind);
  if (hit) return hit;
  let top = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const v = new THREE.Vector3();
  const toRoot = new THREE.Matrix4();
  body.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || (m.material as THREE.Material).name !== "Skin") return;
    toRoot.copy(root.matrixWorld).invert().multiply(m.matrixWorld);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      m.getVertexPosition(i, v).applyMatrix4(toRoot);
      if (v.y < boneY + 0.02) continue;
      top = Math.max(top, v.y);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
    }
  });
  const fit = Number.isFinite(top)
    ? { top, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, r: (maxX - minX) / 2 }
    : { top: boneY + 0.18, x: 0, z: 0, r: 0.11 };
  headCache.set(kind, fit);
  return fit;
}

const headGeoCache = new Map<string, Record<"cap" | "drape" | "veil" | "band", THREE.BufferGeometry>>();
function headGeos(kind: AdultKind, headR: number, k: number) {
  const hit = headGeoCache.get(kind);
  if (hit) return hit;
  const female = kind.startsWith("female");
  const hr = headR * 1.22 + 0.01 * k;
  const cap = new THREE.SphereGeometry(hr, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.scale(1, 0.95, 1.12);
  const open = 1.9; // the face stays open (radians at the front)
  const dH = 0.25 * k;
  const drape = new THREE.CylinderGeometry(hr, hr * 1.45, dH, 16, 1, true, open / 2, Math.PI * 2 - open);
  drape.scale(1, 1, 1.12);
  drape.translate(0, -dH / 2, 0);
  const vH = (female ? 0.62 : 0.5) * k;
  // the veil frames the face (open wider than the head cloth, so her face shows from the side too)
  const vOpen = 2.7;
  const veil = new THREE.CylinderGeometry(hr, hr * 1.9, vH, 16, 1, true, vOpen / 2, Math.PI * 2 - vOpen);
  veil.scale(1, 1, 1.12);
  veil.translate(0, -vH / 2, 0);
  const band = new THREE.TorusGeometry(hr * 1.01, 0.016 * k, 5, 18);
  band.rotateX(Math.PI / 2);
  band.scale(1, 1, 1.12);
  const out = { cap, drape, veil, band };
  headGeoCache.set(kind, out);
  return out;
}

// ── who's who ──────────────────────────────────────────────────────────────

/** Villagers who are children (they keep the kid models), and aliens (cartoon, from the Moon). */
const KIDS = new Set(["David", "Zib", "Blorp"]);
const WOMEN = new Set([
  "Captain Coral", "Mayor Maple", "Grandma Gigi", "Farmer Fern", "Surfer Sky", "Camper Cleo", "Artist Ari",
  "Agent Goldie", "Pilot Piper", "Astronaut Ada", "Driver Dee", "Fisher Flo", "Cargo Cass", "Diver Dot",
  "Mayor Marigold", "Agent Aria", "Pastor Grace", "Postie Paz", "Pilot Penny", "Ranger Rosa", "Manager Mia",
  "Chef Coco", "Pilot Skye", "Nadia of Nineveh", "Granny Whiskers", "Grandma Ruth", "Mary",
]);
/** Dressed up: suits and dresses. */
const SMART = /^(Mayor|Pastor|Agent|Manager|King|Wise)\b/;
const BEACH = /^(Surfer|Lifeguard|Diver)\b/;

/** Which grown-up body a villager gets, or null for children. */
export function adultKindFor(name: string): AdultKind | null {
  if (KIDS.has(name)) return null;
  if (ROBES[name]) return WOMEN.has(name) ? "female_dress" : "male_longsleeve";
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
