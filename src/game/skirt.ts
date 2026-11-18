/**
 * skirt.ts — long clothes that move like cloth. A robe or dress built as a stiff shape would have
 * the legs poke straight through it when someone walks, runs or sits on a donkey; one glued to the
 * thighs splits into trouser legs. Instead the skirt hangs from the hips on two "cloth" bones (one
 * per side) that only half follow the legs' stride, but fully follow both legs lifting together
 * (sitting on a saddle). They lag a moment behind and trail back in the wind of moving, with a little
 * bounce when someone stops — so the hem swings and settles the way fabric does.
 */

import * as THREE from "three";

const M = new THREE.Matrix4(), T = new THREE.Matrix4(), BI = new THREE.Matrix4();
const P = new THREE.Vector3(), L = new THREE.Vector3(), V = new THREE.Vector3(), S = new THREE.Vector3();
const Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), HQ = new THREE.Quaternion(), ID = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export interface SkirtBones {
  hips: THREE.Bone;
  legL: THREE.Bone;
  legR: THREE.Bone;
}

/** How much of each kind of leg movement the cloth takes on. */
const TOGETHER = 0.85;  // both legs forward (sitting) or back
const STRIDE = 0.55;    // one leg forward, one back (walking, running)
const FOLLOW = 16;      // how quickly the cloth catches up with the legs (per second)
const DRAG = 0.035;     // trailing back, radians per metre per second of speed
const DRAG_MAX = 0.32;
const SPREAD = 0.3;     // legs apart (astride a saddle): the cloth still hangs down at the sides
const SPRING = 80, DAMP = 9; // a soft spring: settles with a small bounce

/** A cloth bone: sits at the top of a thigh, under the hips, and is moved by its rig each frame. */
class ClothBone extends THREE.Bone {
  rig?: ClothRig;
  override updateMatrixWorld(force?: boolean) {
    this.rig?.drive(this);
    super.updateMatrixWorld(force);
  }
}

class ClothRig {
  readonly skeleton: THREE.Skeleton;
  private readonly cloth: [ClothBone, ClothBone];
  private readonly rest: [THREE.Quaternion, THREE.Quaternion];
  private readonly cur = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly target = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly tilt = new THREE.Vector3();
  private readonly tiltV = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3();
  /** The body's side-to-side axis, in the hips' space: turning round it is a leg going forward or back. */
  private readonly sideAxis = new THREE.Vector3();
  private last = -1;
  private stamp = -1;

  constructor(private readonly bones: SkirtBones, skel: THREE.Skeleton) {
    const hi = skel.bones.indexOf(bones.hips);
    const hipsInv = skel.boneInverses[hi];
    const make = (leg: THREE.Bone) => {
      // the thigh in the hips' space, in the pose the body was modelled in
      const rel = new THREE.Matrix4().multiplyMatrices(hipsInv, M.copy(skel.boneInverses[skel.bones.indexOf(leg)]).invert());
      const off = new THREE.Vector3(), rest = new THREE.Quaternion();
      rel.decompose(off, rest, S);
      const b = new ClothBone();
      b.name = `cloth_${leg.name}`;
      b.position.copy(off);
      bones.hips.add(b);
      return { b, rest, inv: new THREE.Matrix4().makeTranslation(-off.x, -off.y, -off.z).multiply(hipsInv) };
    };
    const l = make(bones.legL), r = make(bones.legR);
    this.cloth = [l.b, r.b];
    this.rest = [l.rest, r.rest];
    hipsInv.decompose(V, Q, S);
    this.sideAxis.set(1, 0, 0).applyQuaternion(Q).normalize();
    this.skeleton = new THREE.Skeleton([bones.hips, l.b, r.b], [hipsInv.clone(), l.inv, r.inv]);
    // only the left bone drives (it updates first); the right one just takes what was worked out
    l.b.rig = this;
    r.b.rig = this;
  }

  /** The thigh's turn away from its modelled pose, in the hips' space (from the local turns, fresh this frame). */
  private legTurn(leg: THREE.Bone, rest: THREE.Quaternion, out: THREE.Quaternion) {
    out.copy(leg.quaternion);
    for (let p = leg.parent; p && p !== this.bones.hips; p = p.parent) out.premultiply(p.quaternion);
    return out.multiply(Q2.copy(rest).invert());
  }

  drive(b: ClothBone) {
    const side = b === this.cloth[0] ? 0 : 1;
    if (side === 0) this.step();
    // the hips' turn in the world, to put the trailing-back tilt into the hips' space
    this.bones.hips.matrixWorld.decompose(V, HQ, S);
    const tl = this.tilt.length();
    Q.setFromAxisAngle(tl > 1e-5 ? L.copy(this.tilt).divideScalar(tl) : UP, tl);
    b.quaternion.copy(HQ).invert().multiply(Q).multiply(HQ).multiply(this.cur[side]);
  }

  /** Once a frame: follow the legs (a moment late) and swing with the body's movement. */
  private step() {
    const now = performance.now() / 1000;
    if (now === this.stamp) return;
    this.stamp = now;
    const dl = this.legTurn(this.bones.legL, this.rest[0], new THREE.Quaternion());
    const dr = this.legTurn(this.bones.legR, this.rest[1], new THREE.Quaternion());
    const both = new THREE.Quaternion().slerpQuaternions(dl, dr, 0.5);
    const bothInv = both.clone().invert();
    const together = ID.clone().slerp(both, TOGETHER);
    for (const [i, d] of [[0, dl], [1, dr]] as const) {
      const stride = Q.copy(bothInv).multiply(d);
      const t = this.target[i].copy(together).multiply(Q2.copy(ID).slerp(stride, STRIDE));
      // keep the forward / back part, soften the part that spreads the cloth sideways
      const ax = this.sideAxis, dp = t.x * ax.x + t.y * ax.y + t.z * ax.z;
      const twist = Q.set(ax.x * dp, ax.y * dp, ax.z * dp, t.w).normalize();
      const spread = Q2.copy(t).multiply(twist.clone().invert());
      t.copy(ID.clone().slerp(spread, SPREAD)).multiply(twist);
    }
    this.bones.hips.getWorldPosition(P);
    const dt = this.last < 0 ? 0 : Math.min(0.05, now - this.last);
    this.last = now;
    if (dt <= 0 || P.distanceTo(this.lastPos) > 3) {
      // first frame, or a jump to somewhere new: no swinging from the old place
      this.cur[0].copy(this.target[0]);
      this.cur[1].copy(this.target[1]);
      this.tilt.set(0, 0, 0);
      this.tiltV.set(0, 0, 0);
      this.lastPos.copy(P);
      return;
    }
    const k = 1 - Math.exp(-FOLLOW * dt);
    this.cur[0].slerp(this.target[0], k);
    this.cur[1].slerp(this.target[1], k);
    // the wind of moving: tip the hem back, against the way the body goes
    V.subVectors(P, this.lastPos).divideScalar(dt);
    this.lastPos.copy(P);
    V.y = 0;
    const speed = V.length();
    const want = L.crossVectors(UP, V);
    if (speed > 1e-3) want.multiplyScalar(Math.min(DRAG_MAX, speed * DRAG) / speed);
    // soft spring towards it: swings out, settles with a little bounce
    S.subVectors(want, this.tilt).multiplyScalar(SPRING).addScaledVector(this.tiltV, -DAMP);
    this.tiltV.addScaledVector(S, dt);
    this.tilt.addScaledVector(this.tiltV, dt);
  }
}

/** Every body gets one rig, shared by all its skirt pieces. */
const rigs = new WeakMap<THREE.SkinnedMesh, ClothRig>();
function rigFor(mesh: THREE.SkinnedMesh, bones: SkirtBones): ClothRig | null {
  let r = rigs.get(mesh);
  if (r) return r;
  const skel = mesh.skeleton;
  if ([bones.hips, bones.legL, bones.legR].some((b) => skel.bones.indexOf(b) < 0)) return null;
  r = new ClothRig(bones, skel);
  rigs.set(mesh, r);
  return r;
}

/**
 * Turn a skirt shape laid out in `root`'s space (the standing pose, as it looks right now) into
 * geometry skinned to the cloth bones. `waistY` / `hemY` are root-space heights; `maxLeg` is how
 * much of the hem hangs from the cloth bones (the rest stays with the hips, so the cloth doesn't split).
 */
export function skinSkirt(geo: THREE.BufferGeometry, root: THREE.Object3D, mesh: THREE.SkinnedMesh, bones: SkirtBones,
  waistY: number, hemY: number, maxLeg = 0.9): THREE.BufferGeometry {
  const rig = rigFor(mesh, bones);
  if (!rig) return geo;
  root.updateMatrixWorld(true);
  const skel = rig.skeleton;
  // where each leg is across the body, in root space
  const lx = root.worldToLocal(bones.legL.getWorldPosition(L)).x;
  const rx = root.worldToLocal(bones.legR.getWorldPosition(L)).x;
  const mid = (lx + rx) / 2, span = Math.max(0.02, Math.abs(lx - rx) * 0.8);
  // bone matrices as the skinning shader will use them
  const boneM = skel.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skel.boneInverses[i]));
  BI.copy(mesh.bindMatrix).invert();

  const g = geo.clone();
  const pos = g.getAttribute("position");
  const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    P.fromBufferAttribute(pos, v);
    const t = THREE.MathUtils.clamp((waistY - P.y) / Math.max(0.01, waistY - hemY), 0, 1);
    const leg = maxLeg * THREE.MathUtils.smoothstep(t, 0.0, 0.7);
    // which side: firm at the sides, an even share at the very front and back
    const side = THREE.MathUtils.smoothstep((P.x - mid) * Math.sign(lx - rx), -span, span);
    const w = [1 - leg, leg * side, leg * (1 - side)];
    si.set([0, 1, 2, 0], v * 4);
    sw.set([w[0], w[1], w[2], 0], v * 4);
    // put the point where the skinning will carry it back to its place in this pose
    M.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const a = M.elements, b = boneM[k].elements;
      for (let e = 0; e < 16; e++) a[e] += b[e] * w[k];
    }
    T.copy(M).invert();
    P.applyMatrix4(root.matrixWorld).applyMatrix4(T).applyMatrix4(BI);
    pos.setXYZ(v, P.x, P.y, P.z);
  }
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  g.computeVertexNormals();
  return g;
}

/** A skinned skirt piece, hanging on `mesh`'s cloth bones. */
export function skirtMesh(geo: THREE.BufferGeometry, mat: THREE.Material, mesh: THREE.SkinnedMesh, bones: SkirtBones): THREE.SkinnedMesh {
  const m = new THREE.SkinnedMesh(geo, mat);
  m.castShadow = true;
  m.frustumCulled = false;
  const rig = rigFor(mesh, bones);
  m.bind(rig ? rig.skeleton : mesh.skeleton, mesh.bindMatrix);
  mesh.parent!.add(m);
  return m;
}
