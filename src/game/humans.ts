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
}

let kit: Kit | null = null;
let loading: Promise<boolean> | null = null;

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
    kit = {
      bodies: bodies.map((g) => prepareBody(g)),
      hairs,
      clips: new Map(anims.animations.map((c) => [c.name, c])),
    };
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

export class Human {
  readonly root: THREE.Group;
  /** Accessories built for the old cartoon head (center (0, 1.5, 0), radius 0.26) go in here. */
  readonly headAcc = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Move, THREE.AnimationAction>();
  private current: Move | null = null;
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
    const colors = { top: look.top, bottom: look.bottom, shoes: look.style === 1 ? look.accent : 0x3a3a44 };
    for (const piece of outfitFor(bk, look.style)) {
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

    this.mixer = new THREE.AnimationMixer(this.root);
    this.play("idle");
  }

  /** Switch to a move (cross-fades; one-shot moves hold their last frame). */
  play(move: Move, timeScale = 1): void {
    let a = this.actions.get(move);
    if (!a) {
      const clip = kit!.clips.get(CLIP[move]);
      if (!clip) return;
      a = this.mixer.clipAction(clip);
      if (ONCE.has(move)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(move, a);
    }
    a.timeScale = timeScale;
    if (this.current === move) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    a.reset().play();
    if (prev) a.crossFadeFrom(prev, 0.18, false);
    this.current = move;
  }

  get move(): Move | null {
    return this.current;
  }

  /** Advance the animation. Far-away characters (`near` false) only update a few times a second. */
  update(dt: number, near = true): void {
    if (near) {
      this.mixer.update(dt + this.sleepT);
      this.sleepT = 0;
      return;
    }
    this.sleepT += dt;
    if (this.sleepT > 0.2) {
      this.mixer.update(this.sleepT);
      this.sleepT = 0;
    }
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
