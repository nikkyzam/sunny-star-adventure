/**
 * stars.ts — collectible golden stars: spin + bob, collected by proximity.
 * Shared geometry/material; per-star meshes (≤12 per level).
 */

import * as THREE from "three";

function makeStarGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const R = 0.5, r = 0.21;
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  geo.center();
  return geo;
}

interface StarItem {
  base: THREE.Vector3;
  mesh: THREE.Mesh;
  taken: boolean;
  phase: number;
}

export class Stars {
  readonly group = new THREE.Group();
  items: StarItem[] = [];
  total = 0;
  takenCount = 0;

  private geo = makeStarGeometry();
  private mat = new THREE.MeshStandardMaterial({
    color: 0xffd93d,
    emissive: 0x9a6b00,
    roughness: 0.35,
    metalness: 0.4,
    flatShading: true,
  });

  build(spots: [number, number, number][]): void {
    this.group.clear();
    this.items = spots.map(([x, y, z], i) => {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.group.add(mesh);
      return { base: new THREE.Vector3(x, y, z), mesh, taken: false, phase: i * 0.7 };
    });
    this.total = this.items.length;
    this.takenCount = 0;
  }

  update(t: number): void {
    for (const s of this.items) {
      if (s.taken) continue;
      s.mesh.rotation.y = t * 2.2 + s.phase;
      s.mesh.position.y = s.base.y + Math.sin(t * 2 + s.phase) * 0.18;
    }
  }

  /** Collect any star within reach of pos; returns its position (for a particle burst) or null. */
  tryCollect(pos: THREE.Vector3): THREE.Vector3 | null {
    return this.collectWithin(pos, 1.45);
  }

  /** Magnet power-up: same collection with a bigger radius. */
  tryCollectFar(pos: THREE.Vector3, radius: number): THREE.Vector3 | null {
    return this.collectWithin(pos, radius * radius);
  }

  private collectWithin(pos: THREE.Vector3, r2: number): THREE.Vector3 | null {
    for (const s of this.items) {
      if (s.taken) continue;
      const dx = s.mesh.position.x - pos.x;
      const dy = s.mesh.position.y - (pos.y + 0.8);
      const dz = s.mesh.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz < r2) {
        s.taken = true;
        s.mesh.visible = false;
        this.takenCount++;
        return s.base;
      }
    }
    return null;
  }

  /** A friend online picked up star #i. Returns its position, or null if it was already gone. */
  takeIndex(i: number): THREE.Vector3 | null {
    const s = this.items[i];
    if (!s || s.taken) return null;
    s.taken = true;
    s.mesh.visible = false;
    this.takenCount++;
    return s.base;
  }

  indexOf(base: THREE.Vector3): number {
    return this.items.findIndex((s) => s.base === base);
  }

  get allCollected(): boolean {
    return this.takenCount >= this.total;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
