/**
 * chests.ts — hidden treasure chests on side islands. Walk into one to pop the lid
 * and collect a bonus (+150). One-shot per level.
 */

import * as THREE from "three";

interface Chest {
  pos: THREE.Vector3;
  group: THREE.Group;
  lid: THREE.Group;
  opened: boolean;
  openT: number;
}

export class Chests {
  readonly group = new THREE.Group();
  items: Chest[] = [];

  build(spots: [number, number, number][]): void {
    this.group.clear();
    this.items = spots.map(([x, y, z]) => {
      const g = new THREE.Group();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true, roughness: 0.9 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.5, roughness: 0.35, flatShading: true });

      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), woodMat);
      base.position.y = 0.25;
      base.castShadow = true;
      g.add(base);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.64), goldMat);
      band.position.y = 0.28;
      g.add(band);

      const lid = new THREE.Group();
      lid.position.set(0, 0.5, -0.3); // hinge at the back
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.6), woodMat);
      lidMesh.position.set(0, 0.14, 0.3);
      lidMesh.castShadow = true;
      lid.add(lidMesh);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.08), goldMat);
      latch.position.set(0, 0.05, 0.62);
      lid.add(latch);
      g.add(lid);

      g.position.set(x, y, z);
      this.group.add(g);
      return { pos: new THREE.Vector3(x, y, z), group: g, lid, opened: false, openT: 0 };
    });
  }

  /** Open the first unopened chest within reach; returns it (for score/burst) or null. */
  tryOpen(pos: THREE.Vector3): Chest | null {
    for (const c of this.items) {
      if (c.opened) continue;
      if (c.pos.distanceToSquared(pos) < 1.7) {
        c.opened = true;
        c.openT = 0.0001;
        return c;
      }
    }
    return null;
  }

  update(dt: number): void {
    for (const c of this.items) {
      if (c.openT > 0 && c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt * 2.2);
        c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.openT, 3));
      }
    }
  }
}
