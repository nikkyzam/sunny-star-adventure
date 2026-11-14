/**
 * pickups.ts — coins (+10), heart pickups (heal 1), and star-magnet power-ups.
 * Shared geometries/materials; per-pickup meshes, spin & bob in update.
 */

import * as THREE from "three";

export type PickupType = "coin" | "heart" | "magnet";

interface Pickup {
  type: PickupType;
  base: THREE.Vector3;
  mesh: THREE.Mesh;
  taken: boolean;
  phase: number;
}

function makeHeartGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.35);
  s.bezierCurveTo(-0.55, 0.05, -0.4, 0.5, 0, 0.28);
  s.bezierCurveTo(0.4, 0.5, 0.55, 0.05, 0, -0.35);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  geo.center();
  return geo;
}

export class Pickups {
  readonly group = new THREE.Group();
  items: Pickup[] = [];
  coinsTaken = 0;

  private coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18);
  private coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x7a5a00, metalness: 0.5, roughness: 0.3, flatShading: true });
  private heartGeo = makeHeartGeometry();
  private heartMat = new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0x7a1030, roughness: 0.4, flatShading: true });
  private magnetGeo = new THREE.TorusGeometry(0.32, 0.13, 10, 18, Math.PI);
  private magnetMat = new THREE.MeshStandardMaterial({ color: 0xff4757, emissive: 0x5a0a12, roughness: 0.5, flatShading: true });

  build(coins: [number, number, number][], hearts: [number, number, number][], magnets: [number, number, number][]): void {
    this.group.clear();
    this.items = [];
    this.coinsTaken = 0;
    const add = (type: PickupType, mesh: THREE.Mesh, x: number, y: number, z: number) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.items.push({ type, base: new THREE.Vector3(x, y, z), mesh, taken: false, phase: this.items.length * 0.9 });
    };
    for (const [x, y, z] of coins) {
      const m = new THREE.Mesh(this.coinGeo, this.coinMat);
      m.rotation.x = Math.PI / 2;
      add("coin", m, x, y, z);
    }
    for (const [x, y, z] of hearts) add("heart", new THREE.Mesh(this.heartGeo, this.heartMat), x, y, z);
    for (const [x, y, z] of magnets) add("magnet", new THREE.Mesh(this.magnetGeo, this.magnetMat), x, y, z);
  }

  update(t: number): void {
    for (const p of this.items) {
      if (p.taken) continue;
      if (p.type === "coin") {
        p.mesh.rotation.z = t * 2.6 + p.phase;
      } else if (p.type === "heart") {
        const s = 1 + Math.sin(t * 4 + p.phase) * 0.12;
        p.mesh.scale.setScalar(s);
        p.mesh.rotation.y = t * 1.6 + p.phase;
      } else {
        p.mesh.rotation.y = t * 2 + p.phase;
        p.mesh.rotation.z = Math.PI + Math.sin(t * 2) * 0.15;
      }
      p.mesh.position.y = p.base.y + Math.sin(t * 2.2 + p.phase) * 0.15;
    }
  }

  /** Collect the first untaken pickup (optionally of one type) within radius of pos. */
  collectNear(pos: THREE.Vector3, radius: number, type?: PickupType): Pickup | null {
    const r2 = radius * radius;
    for (const p of this.items) {
      if (p.taken || (type && p.type !== type)) continue;
      const dx = p.mesh.position.x - pos.x;
      const dy = p.mesh.position.y - pos.y;
      const dz = p.mesh.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz < r2) {
        p.taken = true;
        p.mesh.visible = false;
        if (p.type === "coin") this.coinsTaken++;
        return p;
      }
    }
    return null;
  }

  dispose(): void {
    this.coinGeo.dispose();
    this.coinMat.dispose();
    this.heartGeo.dispose();
    this.heartMat.dispose();
    this.magnetGeo.dispose();
    this.magnetMat.dispose();
  }
}
