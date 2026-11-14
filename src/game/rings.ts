/**
 * rings.ts — golden hoops in the sky to fly through (helicopter, jet, or a kid on a balloon).
 * Each ring counts once per level; boot.ts scores them.
 */

import * as THREE from "three";

interface Ring { mesh: THREE.Mesh; passed: boolean }

const RADIUS = 2.6;

export class Rings {
  readonly group = new THREE.Group();
  private items: Ring[] = [];
  private geo = new THREE.TorusGeometry(RADIUS, 0.22, 10, 28);
  private mat = new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0x9a6b00, roughness: 0.35, metalness: 0.4 });
  private doneMat = new THREE.MeshStandardMaterial({ color: 0x9df2ff, emissive: 0x1a5a6a, roughness: 0.5, transparent: true, opacity: 0.45 });
  passed = 0;

  get total(): number {
    return this.items.length;
  }

  /** defs: x, y, z, heading (which way the hoop faces). */
  build(defs: [number, number, number, number][]): void {
    this.group.clear();
    this.passed = 0;
    this.items = defs.map(([x, y, z, h]) => {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = h;
      this.group.add(mesh);
      return { mesh, passed: false };
    });
  }

  update(t: number): void {
    for (const r of this.items) {
      if (!r.passed) r.mesh.scale.setScalar(1 + Math.sin(t * 3 + r.mesh.position.x) * 0.05);
    }
  }

  /** Mark the first unpassed ring that `pos` is inside; returns its center, or null. */
  tryPass(pos: THREE.Vector3): THREE.Vector3 | null {
    for (const r of this.items) {
      if (r.passed) continue;
      // generous: anywhere inside the hoop's sphere counts, from any direction
      if (r.mesh.position.distanceToSquared(pos) < (RADIUS + 0.4) * (RADIUS + 0.4)) {
        r.passed = true;
        r.mesh.material = this.doneMat;
        r.mesh.scale.setScalar(1);
        this.passed++;
        return r.mesh.position;
      }
    }
    return null;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.doneMat.dispose();
  }
}
