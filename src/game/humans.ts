/**
 * humans.ts — human-looking characters built from the Quaternius "Universal Base Characters" and
 * "Universal Animation Library" (CC0; slimmed by scripts/build-characters.mjs into public/models/).
 *
 * The free base bodies only wear underwear, so every character is dressed here before it is ever
 * shown: fitted clothing shells (top, bottoms, shoes) are cut from the body mesh by which bone
 * moves each vertex most, pushed out a little along the surface and skinned to the same skeleton,
 * so they move with every animation. The hips and chest are covered by every outfit. Dresses add
 * a flared skirt. Hair comes from the pack's hairstyles, recolored to the chosen hair color.
 *
 * If the files can't be loaded (offline, very old browser), loadHumanKit() resolves false and the
 * game keeps its code-built cartoon kids (player.ts).
 */

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

/** Hairstyle files, in the order of HAIR_STYLES in profile.ts. */
const HAIR_FILES = ["hair_simpleparted", "hair_long", "hair_buns", "hair_buzzed", "hair_buzzedfemale"];
const BODY_FILES = ["body_female", "body_male"];

/**
 * Average color of the pack's skin texture (a medium tan; its "light" and "dark" versions are
 * nearly identical). Each skin tone is made by scaling the texture so its average becomes the
 * chosen color: the face's painted detail (lips, shading) stays, the overall tone changes.
 */
const SKIN_TEXTURE_AVG = new THREE.Color().setRGB(167 / 255, 121 / 255, 88 / 255, THREE.SRGBColorSpace);

export interface HumanLook {
  body: number;       // 0 = girl, 1 = boy
  skinColor: number;  // the skin tone to show (sRGB hex)
  hair: number;       // index into HAIR_FILES
  hairColor: number;
  top: number;        // clothing colors
  bottom: number;
  accent: number;
  style: number;      // 0 jacket & trousers, 1 dress, 2 T-shirt & shorts, 3 dungarees
  /** Bible times (David): a knee-length shepherd's tunic with a sash, and sandals. */
  tunic?: { robe: number; trim: number };
}

/** One clip per state the game asks for (names from the animation library). */
export type Move =
  | "idle" | "walk" | "jog" | "sprint" | "jump" | "fall" | "land" | "dance" | "drive" | "sit"
  | "swim" | "float" | "talk" | "wave";
const CLIP: Record<Move, string> = {
  idle: "Idle_Loop", walk: "Walk_Loop", jog: "Jog_Fwd_Loop", sprint: "Sprint_Loop", jump: "Jump_Start",
  fall: "Jump_Loop", land: "Jump_Land", dance: "Dance_Loop", drive: "Driving_Loop", sit: "Sitting_Idle_Loop",
  swim: "Swim_Fwd_Loop", float: "Swim_Idle_Loop", talk: "Idle_Talking_Loop", wave: "Interact",
};
const ONCE = new Set<Move>(["jump", "land", "wave"]);

interface BodyKit {
  gltf: GLTF;
  /** Which part of the outfit each vertex belongs to (see regionOf). */
  regions: Uint8Array;
  /** Smoothed, welded normals (so clothing shells have no cracks at texture seams). */
  normals: Float32Array;
  bodyMeshName: string;
  /** Outfit pieces per style, built once and shared by every character. */
  outfits: Map<number, { geo: THREE.BufferGeometry; part: "top" | "bottom" | "shoes" }[]>;
}

interface Kit {
  bodies: BodyKit[];
  hairs: GLTF[];
  clips: Map<string, THREE.AnimationClip>;
  /** Walk, jog and sprint, slowest first, measured from the clips themselves. */
  gaits: Gait[];
}

/** A looping way of moving on foot, and how fast its feet travel over the ground. */
interface Gait {
  move: "walk" | "jog" | "sprint";
  clip: THREE.AnimationClip;
  /** Speed (body-model units per second) at which a planted foot doesn't slide. */
  speed: number;
  /** Clip time (0–1) when the left foot is furthest forward: lines the gaits' steps up. */
  offset: number;
}

/**
 * Measure a gait clip: play it on a copy of the body and watch the feet. While a foot is down it
 * slides backward at exactly the speed the body must move for it to look planted.
 */
function measureGait(scene: THREE.Object3D, clip: THREE.AnimationClip, fallback: number): { speed: number; offset: number } {
  const body = SkeletonUtils.clone(scene);
  const mixer = new THREE.AnimationMixer(body);
  mixer.clipAction(clip).play();
  const feet = ["foot_l", "foot_r"].map((n) => body.getObjectByName(n));
  let result = { speed: fallback, offset: 0 };
  if (feet[0] && feet[1]) {
    const N = 64, step = clip.duration / N;
    const inv = new THREE.Matrix4(), v = new THREE.Vector3();
    const ys: number[][] = [[], []], zs: number[][] = [[], []];
    for (let i = 0; i <= N; i++) {
      mixer.setTime(i * step);
      body.updateMatrixWorld(true);
      inv.copy(body.matrixWorld).invert();
      feet.forEach((f, k) => { f!.getWorldPosition(v).applyMatrix4(inv); ys[k].push(v.y); zs[k].push(v.z); });
    }
    // average backward slide over the frames where the foot is near its lowest (on the ground)
    let dist = 0, time = 0;
    for (let k = 0; k < 2; k++) {
      const lo = Math.min(...ys[k]), hi = Math.max(...ys[k]);
      const low = lo + (hi - lo) * 0.25;
      for (let i = 0; i < N; i++) {
        if (ys[k][i] <= low && ys[k][i + 1] <= low) { dist += zs[k][i] - zs[k][i + 1]; time += step; }
      }
    }
    const speed = time > 0 ? dist / time : 0;
    const front = zs[0].indexOf(Math.max(...zs[0]));
    result = { speed: Number.isFinite(speed) && speed > 0.3 ? speed : fallback, offset: front / N };
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(body);
  return result;
}

let kit: Kit | null = null;
let loading: Promise<boolean> | null = null;

/** Foot heights and positions through a clip, in the body's own frame (for tuning). */
export function gaitTrace(clipName: string, foot = "foot_l"): string {
  const clip = kit?.clips.get(clipName);
  if (!kit || !clip) return "";
  const body = SkeletonUtils.clone(kit.bodies[0].gltf.scene);
  const mixer = new THREE.AnimationMixer(body);
  mixer.clipAction(clip).play();
  const f = body.getObjectByName(foot)!, r = body.getObjectByName("root")!;
  const v = new THREE.Vector3(), w = new THREE.Vector3(), inv = new THREE.Matrix4();
  const rows: string[] = [];
  for (let i = 0; i <= 16; i++) {
    mixer.setTime((i * clip.duration) / 16);
    body.updateMatrixWorld(true);
    inv.copy(body.matrixWorld).invert();
    f.getWorldPosition(v).applyMatrix4(inv);
    r.getWorldPosition(w).applyMatrix4(inv);
    rows.push(`${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)} r${w.z.toFixed(2)}`);
  }
  return `${clip.duration.toFixed(2)}s scale ${body.scale.x} | ${rows.join(" ")} | tracks ${clip.tracks.filter((t) => /^(root|pelvis)\./.test(t.name)).map((t) => t.name).join(",")}`;
}

/** The measured gaits (for tests and tuning). */
export function gaitInfo(): { move: string; speed: number; offset: number }[] {
  return kit ? kit.gaits.map((g) => ({ move: g.move, speed: +g.speed.toFixed(2), offset: +g.offset.toFixed(2) })) : [];
}

export function humansReady(): boolean {
  return kit !== null;
}

/** Start loading the character files (once). Resolves true when human characters can be made. */
export function loadHumanKit(): Promise<boolean> {
  if (loading) return loading;
  const base = `${import.meta.env.BASE_URL}models/`;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gl = (name: string) => loader.loadAsync(`${base}${name}.glb`);
  loading = Promise.all([
    Promise.all(BODY_FILES.map(gl)),
    Promise.all(HAIR_FILES.map(gl)),
    gl("anims"),
  ]).then(([bodies, hairs, anims]) => {
    const clips = new Map(anims.animations.map((c) => [c.name, c]));
    const gaits: Gait[] = [];
    for (const [move, fallback] of [["walk", 1.4], ["jog", 3.3], ["sprint", 5.6]] as const) {
      const clip = clips.get(CLIP[move]);
      if (clip) gaits.push({ move, clip, ...measureGait(bodies[0].scene, clip, fallback) });
    }
    // keep walk < jog < sprint even if a clip measures oddly
    for (let i = 1; i < gaits.length; i++) gaits[i].speed = Math.max(gaits[i].speed, gaits[i - 1].speed * 1.15);
    kit = { bodies: bodies.map((g) => prepareBody(g)), hairs, clips, gaits };
    return true;
  }, (err) => {
    console.warn("human characters unavailable, using cartoon kids", err);
    return false;
  });
  return loading;
}

// ── outfit regions ─────────────────────────────────────────────────────────
const R_SKIN = 0, R_TORSO = 1, R_PELVIS = 2, R_UPPERARM = 3, R_LOWERARM = 4, R_THIGH = 5, R_CALF = 6, R_FOOT = 7;

function regionOf(bone: string): number {
  if (/^spine_0[123]$|^clavicle_/.test(bone)) return R_TORSO;
  if (bone === "pelvis" || bone === "root") return R_PELVIS;
  if (bone.startsWith("upperarm_")) return R_UPPERARM;
  if (bone.startsWith("lowerarm_")) return R_LOWERARM;
  if (bone.startsWith("thigh_")) return R_THIGH;
  if (bone.startsWith("calf_")) return R_CALF;
  if (/^(foot|ball)_/.test(bone)) return R_FOOT;
  return R_SKIN; // head, neck, hands
}

/** Which regions each piece covers, per style. Hips and chest are always covered. */
const STYLE_PIECES: Record<number, { part: "top" | "bottom" | "shoes"; regions: number[]; inflate: number }[]> = {
  0: [
    { part: "top", regions: [R_TORSO, R_UPPERARM, R_LOWERARM], inflate: 0.016 },
    { part: "bottom", regions: [R_PELVIS, R_THIGH, R_CALF], inflate: 0.014 },
    { part: "shoes", regions: [R_FOOT], inflate: 0.02 },
  ],
  1: [
    { part: "top", regions: [R_TORSO, R_PELVIS, R_UPPERARM], inflate: 0.016 },
    { part: "shoes", regions: [R_FOOT], inflate: 0.02 },
  ],
  2: [
    { part: "top", regions: [R_TORSO, R_UPPERARM], inflate: 0.016 },
    { part: "bottom", regions: [R_PELVIS, R_THIGH], inflate: 0.016 },
    { part: "shoes", regions: [R_FOOT], inflate: 0.02 },
  ],
  3: [
    { part: "top", regions: [R_TORSO, R_UPPERARM, R_LOWERARM], inflate: 0.012 },
    { part: "bottom", regions: [R_PELVIS, R_THIGH, R_CALF], inflate: 0.016 },
    { part: "shoes", regions: [R_FOOT], inflate: 0.02 },
  ],
};

function findBodyMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  let best: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const name = (o.material as THREE.Material).name;
    if (/Superhero/i.test(name)) best = o;
  });
  if (!best) throw new Error("body mesh not found");
  return best;
}

function prepareBody(gltf: GLTF): BodyKit {
  const mesh = findBodyMesh(gltf.scene);
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const si = geo.getAttribute("skinIndex");
  const sw = geo.getAttribute("skinWeight");
  const bones = mesh.skeleton.bones;

  // each vertex's region = the region of the bone that moves it most
  const regions = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bestW = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > bestW) { bestW = w; best = si.getComponent(i, k); }
    }
    regions[i] = regionOf(bones[best]?.name ?? "");
  }

  // weld normals by position so shells don't split along texture seams
  const sums = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const v = sums.get(k) ?? sums.set(k, new THREE.Vector3()).get(k)!;
    v.x += nor.getX(i); v.y += nor.getY(i); v.z += nor.getZ(i);
  }
  const normals = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = sums.get(key(i))!.clone().normalize();
    normals[i * 3] = v.x; normals[i * 3 + 1] = v.y; normals[i * 3 + 2] = v.z;
  }

  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.frustumCulled = false; // animated limbs leave the bind-pose bounds
    }
  });
  return { gltf, regions, normals, bodyMeshName: mesh.name, outfits: new Map() };
}

/** A copy of the body's triangles in `regions`, pushed out along the surface by `inflate`. */
function shell(bk: BodyKit, src: THREE.BufferGeometry, regions: number[], inflate: number): THREE.BufferGeometry {
  const want = new Set(regions);
  const pos = src.getAttribute("position");
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    out[i * 3] = pos.getX(i) + bk.normals[i * 3] * inflate;
    out[i * 3 + 1] = pos.getY(i) + bk.normals[i * 3 + 1] * inflate;
    out[i * 3 + 2] = pos.getZ(i) + bk.normals[i * 3 + 2] * inflate;
  }
  const idx = src.getIndex()!;
  const keep: number[] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (want.has(bk.regions[a]) && want.has(bk.regions[b]) && want.has(bk.regions[c])) keep.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(out, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(bk.normals, 3));
  g.setAttribute("skinIndex", src.getAttribute("skinIndex"));
  g.setAttribute("skinWeight", src.getAttribute("skinWeight"));
  g.setIndex(keep);
  return g;
}

function outfitFor(bk: BodyKit, style: number) {
  let o = bk.outfits.get(style);
  if (!o) {
    const src = findBodyMesh(bk.gltf.scene).geometry;
    o = (STYLE_PIECES[style] ?? STYLE_PIECES[0]).map((p) => ({ geo: shell(bk, src, p.regions, p.inflate), part: p.part }));
    bk.outfits.set(style, o);
  }
  return o;
}

/** An Object3D under `bone` whose children can be placed in the character's model space. */
function anchorAt(bone: THREE.Object3D, root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const a = new THREE.Group();
  a.matrixAutoUpdate = false;
  a.matrix.copy(bone.matrixWorld).invert().multiply(root.matrixWorld);
  bone.add(a);
  return a;
}

// ── a character ────────────────────────────────────────────────────────────

// scratch values (one character is posed at a time)
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const V5 = new THREE.Vector3(), V6 = new THREE.Vector3(), V7 = new THREE.Vector3();
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), Q4 = new THREE.Quaternion();
const Q5 = new THREE.Quaternion(), Q6 = new THREE.Quaternion();
const E1 = new THREE.Euler();

/**
 * Bones we turn by hand (head look, foot IK) are only safe to turn again once the animation has
 * set them afresh. Some clips leave a bone alone; then last frame's turn would still be there and
 * the next turn would add on top, frame after frame: a head that slowly spins round. So before
 * turning, put back what the bone was if the animation didn't touch it since our last turn.
 */
export class BoneGuard {
  private saved = new Map<THREE.Object3D, { before: THREE.Quaternion; after: THREE.Quaternion }>();

  /** Call before turning any bones this frame. */
  restore(): void {
    for (const [bone, s] of this.saved) {
      if (Math.abs(bone.quaternion.dot(s.after)) > 0.999999) bone.quaternion.copy(s.before);
      bone.updateMatrixWorld(true);
    }
  }

  /** Call just before turning a bone. */
  mark(bone: THREE.Object3D): void {
    let s = this.saved.get(bone);
    if (!s) this.saved.set(bone, (s = { before: new THREE.Quaternion(), after: new THREE.Quaternion() }));
    s.before.copy(bone.quaternion);
  }

  /** Call after all turning is done this frame. */
  commit(): void {
    for (const [bone, s] of this.saved) s.after.copy(bone.quaternion);
  }
}

/** Rotate a bone by `q` in world space (keeps its children attached). */
function turnBoneWorld(bone: THREE.Object3D, q: THREE.Quaternion): void {
  const world = bone.getWorldQuaternion(Q5);
  world.premultiply(q);
  const parent = bone.parent ? bone.parent.getWorldQuaternion(Q6) : Q6.identity();
  bone.quaternion.copy(parent.invert().multiply(world));
}

/** Bend the knee and swing the thigh so the foot lands on `target`; the foot keeps its angle. */
function solveLeg(thigh: THREE.Bone, calf: THREE.Bone, foot: THREE.Bone, target: THREE.Vector3): void {
  const footQ = foot.getWorldQuaternion(new THREE.Quaternion());
  const H = thigh.getWorldPosition(V5), K = calf.getWorldPosition(V6), A = foot.getWorldPosition(V7);
  const a = H.distanceTo(K), b = K.distanceTo(A);
  if (a < 1e-4 || b < 1e-4) return;
  const d = THREE.MathUtils.clamp(H.distanceTo(target), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const u = H.clone().sub(K), w = A.clone().sub(K);
  const now = u.angleTo(w);
  const want = Math.acos(THREE.MathUtils.clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  const n = u.cross(w);
  if (n.lengthSq() > 1e-10) {
    turnBoneWorld(calf, Q1.setFromAxisAngle(n.normalize(), want - now));
    calf.updateWorldMatrix(false, true);
  }
  const A2 = foot.getWorldPosition(V7);
  const from = A2.sub(thigh.getWorldPosition(V5)).normalize();
  const to = target.clone().sub(V5).normalize();
  turnBoneWorld(thigh, Q2.setFromUnitVectors(from, to));
  thigh.updateWorldMatrix(false, true);
  // the foot keeps the angle the animation gave it
  const parent = foot.parent!.getWorldQuaternion(Q3);
  foot.quaternion.copy(parent.invert().multiply(footQ));
  foot.updateWorldMatrix(false, true);
}

export class Human {
  readonly root: THREE.Group;
  /** Accessories built for the old cartoon head (center (0, 1.5, 0), radius 0.26) go in here. */
  readonly headAcc = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Move, THREE.AnimationAction>();
  private owned: THREE.Material[] = [];
  private sleepT = 0;

  constructor(look: HumanLook) {
    const k = kit!;
    const bk = k.bodies[look.body % k.bodies.length];
    this.root = SkeletonUtils.clone(bk.gltf.scene) as THREE.Group;
    // geometry is shared between characters: cleanup code must not dispose anything in here
    this.root.userData.shared = true;
    const body = findBodyMesh(this.root);
    const bones = new Map<string, THREE.Bone>();
    this.root.traverse((o) => { if (o instanceof THREE.Bone) bones.set(o.name, o); });

    // skin: scale the texture's tone to the chosen color (works in linear space, may go above 1)
    const want = new THREE.Color(look.skinColor);
    const skinMat = (body.material as THREE.MeshStandardMaterial).clone();
    // (a little extra: the texture's shading and normal map read darker than its average color)
    const boost = 1.15;
    skinMat.color.setRGB(want.r / SKIN_TEXTURE_AVG.r * boost, want.g / SKIN_TEXTURE_AVG.g * boost, want.b / SKIN_TEXTURE_AVG.b * boost);
    body.material = skinMat;
    this.owned.push(skinMat);

    // brows take the hair color; eyes stay as they are
    const hairColor = new THREE.Color(look.hairColor);
    this.root.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh) || o === body) return;
      const m = o.material as THREE.MeshStandardMaterial;
      if (/Hair/i.test(m.name)) {
        const c = m.clone();
        c.map = null;
        c.color.copy(hairColor).multiplyScalar(0.85);
        o.material = c;
        this.owned.push(c);
      }
    });

    // clothes
    const cloth = (color: number, rough = 0.85) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
      this.owned.push(m);
      return m;
    };
    const tunic = look.tunic;
    const colors = tunic ? { top: tunic.robe, bottom: tunic.robe, shoes: 0x6b4a2b }
      : { top: look.top, bottom: look.bottom, shoes: look.style === 1 ? look.accent : 0x3a3a44 };
    for (const piece of outfitFor(bk, tunic ? 1 : look.style)) {
      const m = new THREE.SkinnedMesh(piece.geo, cloth(colors[piece.part], piece.part === "shoes" ? 0.5 : 0.85));
      m.castShadow = true;
      m.frustumCulled = false;
      m.bind(body.skeleton, body.bindMatrix);
      m.position.copy(body.position);
      m.quaternion.copy(body.quaternion);
      m.scale.copy(body.scale);
      body.parent!.add(m);
    }

    // hair: the pack's hairstyle, bound to this character's skeleton
    const hg = k.hairs[look.hair % k.hairs.length];
    hg.scene.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh)) return;
      const mat = (o.material as THREE.MeshStandardMaterial).clone();
      mat.map = null;
      mat.color.copy(hairColor);
      mat.roughness = 0.7;
      this.owned.push(mat);
      const m = new THREE.SkinnedMesh(o.geometry, mat);
      m.castShadow = true;
      m.frustumCulled = false;
      const skel = new THREE.Skeleton(o.skeleton.bones.map((b) => bones.get(b.name)!), o.skeleton.boneInverses);
      m.position.copy(o.position);
      m.quaternion.copy(o.quaternion);
      m.scale.copy(o.scale);
      m.bind(skel, o.bindMatrix);
      body.parent!.add(m);
    });

    // dress: a flared skirt that turns with the hips
    const pelvis = bones.get("pelvis");
    if (look.style === 1 && pelvis) {
      const hips = anchorAt(pelvis, this.root);
      this.root.updateMatrixWorld(true);
      const waistY = new THREE.Vector3().setFromMatrixPosition(pelvis.matrixWorld).y + 0.12;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.33, 0.48, 20, 1, true), cloth(look.top));
      (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      skirt.position.y = waistY - 0.24;
      skirt.castShadow = true;
      hips.add(skirt);
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), cloth(look.accent));
      belt.rotation.x = Math.PI / 2;
      belt.position.y = waistY - 0.02;
      hips.add(belt);
    }

    // the shepherd's tunic: from the waist to just past the knee, a band at the hem, a sash
    if (tunic && pelvis) {
      const hips = anchorAt(pelvis, this.root);
      const y = (n: string) => { const b = bones.get(n); return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).y : 0; };
      const hipY = y("pelvis"), kneeY = y("calf_l") || hipY * 0.55;
      const waistY = hipY + 0.12, hemY = kneeY - 0.06;
      const robeM = cloth(tunic.robe), trimM = cloth(tunic.trim);
      robeM.side = THREE.DoubleSide;
      robeM.flatShading = true;
      const pts = [[0.165, waistY], [0.2, hipY], [0.26, (hipY + kneeY) / 2], [0.34, hemY]].map(([r, h]) => new THREE.Vector2(r, h));
      const add = (m: THREE.Mesh) => { m.castShadow = true; m.frustumCulled = false; m.scale.z = 1.0; hips.add(m); return m; };
      add(new THREE.Mesh(new THREE.LatheGeometry(pts, 20), robeM));
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.342, 0.346, 0.045, 20, 1, true), trimM)).position.y = hemY + 0.02;
      const sash = add(new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.022, 6, 20), trimM));
      sash.rotation.x = Math.PI / 2;
      sash.position.y = waistY - 0.025;
      const knot = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.025), trimM));
      knot.position.set(0.1, waistY - 0.09, 0.168);
      knot.rotation.z = 0.25;
    }

    // accessories: map the old cartoon head's coordinates onto this head
    const head = bones.get("Head");
    if (head) {
      const eyes = new THREE.Box3();
      this.root.updateMatrixWorld(true);
      this.root.traverse((o) => {
        if (o instanceof THREE.Mesh && /Eye/i.test((o.material as THREE.Material).name)) {
          o.geometry.computeBoundingBox();
          eyes.union(o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld));
        }
      });
      const eye = eyes.isEmpty() ? new THREE.Vector3(0, 1.67, 0.07) : eyes.getCenter(new THREE.Vector3());
      const s = 0.45;
      this.headAcc.scale.setScalar(s);
      // old eye center (0, 1.53, 0.243) lands on this character's eye center
      this.headAcc.position.set(eye.x, eye.y - 1.53 * s, eye.z - 0.243 * s);
      anchorAt(head, this.root).add(this.headAcc);
    }

    for (const n of ["thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r", "neck_01", "Head"] as const) {
      this.bone[n] = bones.get(n);
    }
    this.mixer = new THREE.AnimationMixer(this.root);
    this.play("idle");
  }

  /** Switch to a move (fades over; one-shot moves hold their last frame). Walk, jog and sprint go
   *  through moveAt, which picks and blends them by speed. */
  play(move: Move, timeScale = 1): void {
    if (move === "walk" || move === "jog" || move === "sprint") {
      const g = kit!.gaits.find((x) => x.move === move);
      this.moveAt((g ? g.speed * this.unit() : 1.6) * timeScale);
      return;
    }
    this.rate = timeScale;
    if (this.mode === move) return;
    this.mode = move;
    const a = this.action(move);
    if (a && ONCE.has(move)) a.reset();
  }

  /**
   * On foot at `speed` m/s: idle, walk, jog and sprint blend into each other, and the steps are
   * timed so a planted foot keeps still on the ground (no skating).
   */
  moveAt(speed: number): void {
    this.mode = "loco";
    this.wantSpeed = speed;
  }

  /** The move that shows most right now. */
  get move(): Move | null {
    if (this.mode !== "loco") return this.mode;
    let best: Move = "idle", bw = this.weight.get("idle") ?? 0;
    for (const g of kit!.gaits) {
      const w = this.weight.get(g.move) ?? 0;
      if (w > bw) { bw = w; best = g.move; }
    }
    return best;
  }

  /** Advance the animation. Far-away characters (`near` false) only update a few times a second. */
  update(dt: number, near = true): void {
    this.fresh = false;
    if (near) {
      this.tick(dt + this.sleepT);
      this.sleepT = 0;
      return;
    }
    this.sleepT += dt;
    if (this.sleepT > 0.2) {
      this.tick(this.sleepT);
      this.sleepT = 0;
    }
  }

  /**
   * After update: the touches that make movement look alive. Lean into turns and with speed
   * changes, keep both feet on uneven ground, and turn the head toward something interesting.
   * Only does anything on a frame when update() moved the bones.
   */
  pose(dt: number, o: {
    turnRate: number; accel: number; grounded: boolean;
    ground?: ((x: number, z: number) => number | null) | null; baseY: number;
    look?: THREE.Vector3 | null;
  }): void {
    if (!this.fresh) return;
    this.guard.restore();
    const speed = this.shownSpeed;
    // lean: into the turn (more when fast), forward when speeding up, back when stopping
    const roll = o.grounded ? THREE.MathUtils.clamp(-o.turnRate * speed * 0.035, -0.2, 0.2) : 0;
    const pitch = o.grounded ? THREE.MathUtils.clamp(o.accel * 0.012, -0.1, 0.12) : 0;
    const k = Math.min(1, dt * 8);
    this.root.rotation.z += (roll - this.root.rotation.z) * k;
    this.root.rotation.x += (pitch - this.root.rotation.x) * k;
    this.root.updateMatrixWorld(true);

    if (o.ground) this.plantFeet(dt, o.ground, o.baseY, o.grounded);
    this.turnHead(dt, o.look ?? null);
    this.guard.commit();
  }

  /** Each ankle's height above the ground under it (for tests). */
  debugFeet(ground: (x: number, z: number) => number | null): number[] {
    return [this.bone.foot_l, this.bone.foot_r].map((f) => {
      if (!f) return NaN;
      f.getWorldPosition(V1);
      const g = ground(V1.x, V1.z);
      return g === null ? NaN : +(V1.y - g).toFixed(3);
    }).concat([+this.drop.toFixed(3)]);
  }

  // ── inner workings ──────────────────────────────────────────────────────

  private mode: Move | "loco" = "idle";
  private rate = 1;
  private wantSpeed = 0;
  /** The speed the legs show (follows wantSpeed quickly, but not in a single frame). */
  private shownSpeed = 0;
  /** Where in the step cycle the feet are (0–1, shared by every gait so they blend in step). */
  private phase = 0;
  private weight = new Map<Move, number>();
  /** update() moved the bones this frame, so pose() may adjust them. */
  private fresh = false;
  private bone: Partial<Record<"thigh_l" | "calf_l" | "foot_l" | "thigh_r" | "calf_r" | "foot_r" | "neck_01" | "Head", THREE.Bone>> = {};
  private footOff = [0, 0];
  private drop = 0;
  private lookYaw = 0;
  private readonly guard = new BoneGuard();
  private lookPitch = 0;

  private action(move: Move): THREE.AnimationAction | null {
    let a = this.actions.get(move);
    if (!a) {
      const clip = kit!.clips.get(CLIP[move]);
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      if (ONCE.has(move)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      a.setEffectiveWeight(0);
      a.play();
      this.actions.set(move, a);
      this.weight.set(move, 0);
    }
    return a;
  }

  /** World units per model unit (the model sits inside a scaled kid). */
  private unit(): number {
    return this.root.getWorldScale(V1).y;
  }

  private tick(dt: number): void {
    const want = new Map<Move, number>();
    const gaits = kit!.gaits;
    if (this.mode === "loco" && gaits.length) {
      // the legs catch up with the body fast, but slow down over a short "stopping" step
      const diff = this.wantSpeed - this.shownSpeed;
      this.shownSpeed += THREE.MathUtils.clamp(diff, -16 * dt, 20 * dt);
      const unit = this.unit();
      const v = this.shownSpeed / unit; // in model units, like the gait speeds
      // which two gaits, and how far between them
      let a = 0, b = 0, t = 0;
      if (v >= gaits[gaits.length - 1].speed) a = b = gaits.length - 1;
      else {
        while (b < gaits.length - 1 && v > gaits[b].speed) b++;
        a = Math.max(0, b - 1);
        t = a === b ? 0 : THREE.MathUtils.clamp((v - gaits[a].speed) / (gaits[b].speed - gaits[a].speed), 0, 1);
      }
      // distance covered by one full step cycle, blended
      const stride = (g: Gait) => g.speed * g.clip.duration;
      const len = stride(gaits[a]) * (1 - t) + stride(gaits[b]) * t;
      // barely moving: mostly standing, legs shuffling gently
      const moving = THREE.MathUtils.clamp((v - 0.05) / (gaits[0].speed * 0.45), 0, 1);
      this.phase = (this.phase + (Math.max(v, gaits[0].speed * 0.35 * moving) / len) * dt) % 1;
      want.set("idle", 1 - moving);
      want.set(gaits[a].move, (want.get(gaits[a].move) ?? 0) + moving * (1 - t));
      if (b !== a) want.set(gaits[b].move, moving * t);
      for (const g of gaits) {
        const act = this.action(g.move);
        if (!act) continue;
        act.timeScale = 0;
        act.time = ((this.phase + g.offset) % 1) * g.clip.duration;
      }
    } else {
      // not on foot: the legs' speed fades so landing starts from a stand
      this.shownSpeed = Math.max(0, this.shownSpeed - 20 * dt);
      want.set(this.mode as Move, 1);
      const act = this.action(this.mode as Move);
      if (act) act.timeScale = this.rate;
    }
    if (want.has("idle")) {
      const idle = this.action("idle");
      if (idle) idle.timeScale = 1;
    }

    // fade every move toward its target weight, then share the weights out so they add up to 1
    const fade = Math.min(1, dt / 0.16);
    let sum = 0;
    for (const [m] of this.actions) {
      const w0 = this.weight.get(m) ?? 0;
      const w = w0 + ((want.get(m) ?? 0) - w0) * fade;
      this.weight.set(m, w < 0.002 ? 0 : w);
      sum += this.weight.get(m)!;
    }
    for (const [m, act] of this.actions) {
      const w = sum > 0 ? this.weight.get(m)! / sum : 0;
      act.enabled = w > 0;
      act.setEffectiveWeight(w);
    }
    this.mixer.update(dt);
    this.fresh = true;
  }

  /** Two-bone leg IK: lower the hips to the lower foot's ground, bend the other knee to reach its own. */
  private plantFeet(dt: number, ground: (x: number, z: number) => number | null, baseY: number, grounded: boolean): void {
    const legs = [["thigh_l", "calf_l", "foot_l"], ["thigh_r", "calf_r", "foot_r"]] as const;
    const k = Math.min(1, dt * 14);
    for (let i = 0; i < 2; i++) {
      const foot = this.bone[legs[i][2]];
      let off = 0;
      if (grounded && foot) {
        foot.getWorldPosition(V1);
        const g = ground(V1.x, V1.z);
        if (g !== null) off = THREE.MathUtils.clamp(g - baseY, -0.4, 0.35);
      }
      this.footOff[i] += (off - this.footOff[i]) * k;
    }
    const drop = Math.max(0, -Math.min(this.footOff[0], this.footOff[1]));
    this.drop = drop;
    const parentScale = this.root.parent ? this.root.parent.getWorldScale(V2).y : 1;
    this.root.position.y = -drop / parentScale;
    if (drop < 0.004 && Math.abs(this.footOff[0]) < 0.004 && Math.abs(this.footOff[1]) < 0.004) return;
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const [th, ca, fo] = legs[i];
      const thigh = this.bone[th], calf = this.bone[ca], foot = this.bone[fo];
      if (!thigh || !calf || !foot) continue;
      const target = foot.getWorldPosition(V3).add(V4.set(0, this.footOff[i] + drop, 0));
      this.guard.mark(thigh);
      this.guard.mark(calf);
      solveLeg(thigh, calf, foot, target);
    }
  }

  /** Turn the neck and head (a share each) toward `look`, if it's in front; back to straight if not. */
  private turnHead(dt: number, look: THREE.Vector3 | null): void {
    const head = this.bone.Head, neck = this.bone.neck_01;
    if (!head || !neck) return;
    let yaw = 0, pitch = 0;
    if (look) {
      const hp = this.root.worldToLocal(head.getWorldPosition(V1));
      const tp = this.root.worldToLocal(V2.copy(look));
      const dx = tp.x - hp.x, dy = tp.y - hp.y, dz = tp.z - hp.z;
      const y = Math.atan2(dx, dz);
      if (Math.abs(y) < 1.9) {
        yaw = THREE.MathUtils.clamp(y, -1.1, 1.1);
        pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.45, 0.5);
      }
    }
    const k = Math.min(1, dt * 4);
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    if (Math.abs(this.lookYaw) < 0.002 && Math.abs(this.lookPitch) < 0.002) return;
    const rootQ = this.root.getWorldQuaternion(Q1);
    for (const [bone, share] of [[neck, 0.4], [head, 0.6]] as const) {
      // the turn, in the character's own frame, carried into world space
      Q2.setFromEuler(E1.set(this.lookPitch * share, this.lookYaw * share, 0, "YXZ"));
      Q3.copy(rootQ).multiply(Q2).multiply(Q4.copy(rootQ).invert());
      this.guard.mark(bone);
      turnBoneWorld(bone, Q3);
      bone.updateWorldMatrix(false, true);
    }
  }

  /** How far the head is turned from the body (radians, for tests). */
  headYaw(): number {
    const h = this.bone.Head;
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
}

export function makeHuman(look: HumanLook): Human | null {
  return kit ? new Human(look) : null;
}
