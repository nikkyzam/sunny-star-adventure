/**
 * food.ts — snacks to find and eat. Each one does something fun for a few seconds:
 *   apple     +1 heart
 *   ice cream super speed
 *   cupcake   mega jumps
 *   pizza     grow giant
 * Snacks grow back after a while, so there is always something to eat.
 */

import * as THREE from "three";

export type FoodType = "apple" | "icecream" | "cupcake" | "pizza";
export type FoodDef = [FoodType, number, number, number];

interface Food {
  type: FoodType;
  base: THREE.Vector3;
  mesh: THREE.Group;
  taken: boolean;
  regrow: number;
  phase: number;
}

const REGROW = 20; // seconds until an eaten snack comes back

function flat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 });
}

function part(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function makeFood(type: FoodType): THREE.Group {
  const g = new THREE.Group();
  if (type === "apple") {
    part(g, new THREE.SphereGeometry(0.3, 10, 8), flat(0xff4757), 0, 0, 0).scale.y = 0.92;
    part(g, new THREE.CylinderGeometry(0.025, 0.025, 0.16, 5), flat(0x7a4a2b), 0, 0.32, 0);
    part(g, new THREE.SphereGeometry(0.09, 6, 5), flat(0x5ed48a), 0.09, 0.36, 0).scale.set(1.4, 0.4, 0.8);
  } else if (type === "icecream") {
    part(g, new THREE.ConeGeometry(0.2, 0.5, 10), flat(0xe0b070), 0, -0.2, 0).rotation.x = Math.PI;
    part(g, new THREE.SphereGeometry(0.23, 10, 8), flat(0xff9ecf), 0, 0.14, 0);
    part(g, new THREE.SphereGeometry(0.19, 10, 8), flat(0xfff6e5), 0, 0.4, 0);
    part(g, new THREE.SphereGeometry(0.06, 6, 6), flat(0xff4757), 0, 0.6, 0);
  } else if (type === "cupcake") {
    part(g, new THREE.CylinderGeometry(0.24, 0.17, 0.26, 10), flat(0xc98a5b), 0, -0.1, 0);
    part(g, new THREE.SphereGeometry(0.27, 10, 8), flat(0xb197fc), 0, 0.1, 0).scale.y = 0.75;
    part(g, new THREE.SphereGeometry(0.16, 8, 6), flat(0xd7c7ff), 0, 0.3, 0).scale.y = 0.8;
    part(g, new THREE.SphereGeometry(0.07, 6, 6), flat(0xff4757), 0, 0.45, 0);
  } else {
    // a slice of pizza, standing up so it reads from far away
    const slice = new THREE.Group();
    part(slice, new THREE.CylinderGeometry(0.55, 0.55, 0.07, 3, 1, false, 0, Math.PI * 2), flat(0xffd166), 0, 0, 0);
    part(slice, new THREE.BoxGeometry(0.95, 0.12, 0.12), flat(0xd9903d), 0, 0, 0.3);
    for (const [x, z] of [[0, -0.2], [-0.15, 0.08], [0.17, 0.1]]) {
      part(slice, new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8), flat(0xe0453a), x, 0.05, z);
    }
    slice.rotation.x = -Math.PI / 2.4;
    g.add(slice);
  }
  return g;
}

export class Foods {
  readonly group = new THREE.Group();
  items: Food[] = [];

  build(defs: FoodDef[]): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
    this.items = defs.map(([type, x, y, z], i) => {
      const mesh = makeFood(type);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return { type, base: new THREE.Vector3(x, y, z), mesh, taken: false, regrow: 0, phase: i * 1.3 };
    });
  }

  update(t: number, dt: number): void {
    for (const f of this.items) {
      if (f.taken) {
        if ((f.regrow -= dt) <= 0) {
          f.taken = false;
          f.mesh.visible = true;
        }
        continue;
      }
      f.mesh.rotation.y = t * 1.6 + f.phase;
      f.mesh.position.y = f.base.y + Math.sin(t * 2.4 + f.phase) * 0.12;
    }
  }

  /** Eat the first snack within reach of a kid standing at pos. */
  eatNear(pos: THREE.Vector3): Food | null {
    for (const f of this.items) {
      if (f.taken) continue;
      const dx = f.base.x - pos.x, dy = f.base.y - (pos.y + 0.8), dz = f.base.z - pos.z;
      if (dx * dx + dy * dy + dz * dz < 1.5) {
        f.taken = true;
        f.mesh.visible = false;
        f.regrow = REGROW;
        return f;
      }
    }
    return null;
  }
}
