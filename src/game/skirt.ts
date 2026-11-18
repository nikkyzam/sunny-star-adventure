/**
 * skirt.ts — long clothes that move with the legs. A robe or dress built as a stiff shape would
 * have the legs poke straight through it when someone walks, runs or sits on a donkey. Instead
 * each point of the skirt is tied to the hips near the waist and, further down, more and more to
 * the thigh on its own side, so the cloth swings with the stride and drapes over the knees.
 */

import * as THREE from "three";

const M = new THREE.Matrix4(), T = new THREE.Matrix4(), BI = new THREE.Matrix4();
const P = new THREE.Vector3(), L = new THREE.Vector3();

export interface SkirtBones {
  hips: THREE.Bone;
  legL: THREE.Bone;
  legR: THREE.Bone;
}

/**
 * Turn a skirt shape laid out in `root`'s space (the standing pose, as it looks right now) into
 * geometry skinned to `mesh`'s skeleton. `waistY` / `hemY` are root-space heights; `maxLeg` is how
 * much of the hem follows the thighs (the rest stays with the hips, so the cloth doesn't split).
 */
export function skinSkirt(geo: THREE.BufferGeometry, root: THREE.Object3D, mesh: THREE.SkinnedMesh, bones: SkirtBones,
  waistY: number, hemY: number, maxLeg = 0.85): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const skel = mesh.skeleton;
  const idx = [bones.hips, bones.legL, bones.legR].map((b) => skel.bones.indexOf(b));
  if (idx.some((i) => i < 0)) return geo;
  // where each leg is across the body, in root space
  const lx = root.worldToLocal(bones.legL.getWorldPosition(L)).x;
  const rx = root.worldToLocal(bones.legR.getWorldPosition(L)).x;
  const mid = (lx + rx) / 2, span = Math.max(0.02, Math.abs(lx - rx) * 0.6);
  // bone matrices as the skinning shader will use them
  const boneM = idx.map((i) => new THREE.Matrix4().multiplyMatrices(skel.bones[i].matrixWorld, skel.boneInverses[i]));
  BI.copy(mesh.bindMatrix).invert();

  const g = geo.clone();
  const pos = g.getAttribute("position");
  const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    P.fromBufferAttribute(pos, v);
    const t = THREE.MathUtils.clamp((waistY - P.y) / Math.max(0.01, waistY - hemY), 0, 1);
    const leg = maxLeg * THREE.MathUtils.smoothstep(t, 0.05, 0.75);
    // which leg: sharp at the sides, an even share at the very front and back
    const side = THREE.MathUtils.smoothstep((P.x - mid) * Math.sign(lx - rx), -span, span);
    const w = [1 - leg, leg * side, leg * (1 - side)];
    si.set(idx, v * 4);
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

/** A skinned skirt piece, riding on `mesh`'s skeleton. */
export function skirtMesh(geo: THREE.BufferGeometry, mat: THREE.Material, mesh: THREE.SkinnedMesh): THREE.SkinnedMesh {
  const m = new THREE.SkinnedMesh(geo, mat);
  m.castShadow = true;
  m.frustumCulled = false;
  m.bind(mesh.skeleton, mesh.bindMatrix);
  mesh.parent!.add(m);
  return m;
}
