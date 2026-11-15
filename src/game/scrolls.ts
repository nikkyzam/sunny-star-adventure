/**
 * scrolls.ts — scripture scrolls hidden around the worlds. Walk into one and it unrolls: the verse
 * written on it is read out in a speech box. Each scroll pays a few coins the first time it is found.
 */

import * as THREE from "three";

export interface Scroll {
  pos: THREE.Vector3;
  /** Position of its verse in the library (verses.ts). */
  verse: number;
  /** Seconds until it can be read again. */
  rest: number;
  mesh: THREE.Group;
}

const REACH = 1.4;

export class Scrolls {
  readonly group = new THREE.Group();
  items: Scroll[] = [];
  private paper = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0x8a6a1a, emissiveIntensity: 0.35, roughness: 0.8 });
  private wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
  private glow = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.35, depthWrite: false });
  private paperGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.7, 12).rotateZ(Math.PI / 2);
  private rodGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8).rotateZ(Math.PI / 2);
  private glowGeo = new THREE.SphereGeometry(0.6, 12, 8);

  build(defs: [number, number, number, number][]): void {
    this.group.clear();
    this.items = defs.map(([x, y, z, verse]) => {
      const mesh = new THREE.Group();
      const paper = new THREE.Mesh(this.paperGeo, this.paper);
      paper.castShadow = true;
      mesh.add(paper, new THREE.Mesh(this.rodGeo, this.wood), new THREE.Mesh(this.glowGeo, this.glow));
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return { pos: new THREE.Vector3(x, y, z), verse, rest: 0, mesh };
    });
  }

  update(dt: number, t: number): void {
    for (const s of this.items) {
      s.rest = Math.max(0, s.rest - dt);
      s.mesh.position.y = s.pos.y + Math.sin(t * 2 + s.pos.x) * 0.12;
      s.mesh.rotation.y += dt * 1.2;
    }
  }

  /** The scroll a kid at pos has just walked into (each rests a while after being read). */
  readNear(pos: THREE.Vector3): Scroll | null {
    for (const s of this.items) {
      if (s.rest > 0 || Math.abs(pos.y + 0.8 - s.pos.y) > 1.8) continue;
      const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
      if (dx * dx + dz * dz > REACH * REACH) continue;
      s.rest = 12;
      return s;
    }
    return null;
  }

  dispose(): void {
    this.group.clear();
    for (const d of [this.paper, this.wood, this.glow, this.paperGeo, this.rodGeo, this.glowGeo]) d.dispose();
  }
}
