/**
 * buddies.ts — collectible animal buddies. Each sleeps on a side island; walk up to adopt it,
 * and it hops along behind the player for the rest of the run.
 *
 *   bunny  🐰 "Hops"   — vacuums up nearby coins for you
 *   birdie 🐦 "Pip"    — unlocks glide (hold jump while falling)
 *   turtle 🐢 "Shelly" — +1 max heart
 */

import * as THREE from "three";

export type BuddyType = "bunny" | "birdie" | "turtle";

export const BUDDY_NAMES: Record<BuddyType, string> = {
  bunny: "Hops the Bunny",
  birdie: "Pip the Bird",
  turtle: "Shelly the Turtle",
};

interface BuddySpot {
  type: BuddyType;
  pos: THREE.Vector3;
  group: THREE.Group;
  taken: boolean;
}

interface Follower {
  type: BuddyType;
  group: THREE.Group;
  hopPhase: number;
}

function makeBuddyMesh(type: BuddyType): THREE.Group {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh) => { m.castShadow = true; g.add(m); return m; };
  const dark = new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.4 });

  if (type === "bunny") {
    const cream = new THREE.MeshStandardMaterial({ color: 0xfff1dc, flatShading: true, roughness: 0.8 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xffb3c6, roughness: 0.7 });
    const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), cream));
    body.position.y = 0.26;
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), cream));
    head.position.set(0, 0.52, 0.08);
    for (const sx of [-1, 1]) {
      const ear = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), cream));
      ear.position.set(0.08 * sx, 0.78, 0.04);
      ear.rotation.z = -0.2 * sx;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.12, 4, 6), pink);
      inner.position.z = 0.035;
      ear.add(inner);
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), dark));
      eye.position.set(0.07 * sx, 0.55, 0.22);
    }
    const tail = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true })));
    tail.position.set(0, 0.28, -0.24);
  } else if (type === "birdie") {
    const blue = new THREE.MeshStandardMaterial({ color: 0x5cb8ff, flatShading: true, roughness: 0.7 });
    const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), blue));
    body.scale.set(1, 0.9, 1.15);
    body.position.y = 0.28;
    const beak = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0xffa94d, flatShading: true })));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.3, 0.26);
    for (const sx of [-1, 1]) {
      const wing = add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), blue));
      wing.scale.set(0.4, 0.7, 1.1);
      wing.position.set(0.18 * sx, 0.32, 0);
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), dark));
      eye.position.set(0.08 * sx, 0.36, 0.2);
    }
    const tuft = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a9ae0, flatShading: true })));
    tuft.position.set(0, 0.48, 0.02);
  } else {
    const green = new THREE.MeshStandardMaterial({ color: 0x66d94e, flatShading: true, roughness: 0.7 });
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true, roughness: 0.9 });
    const shell = add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), shellMat));
    shell.position.y = 0.18;
    const belly = add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.12, 12), green));
    belly.position.y = 0.1;
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), green));
    head.position.set(0, 0.26, 0.3);
    for (const sx of [-1, 1]) {
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), dark));
      eye.position.set(0.05 * sx, 0.3, 0.4);
      const footF = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), green));
      footF.position.set(0.16 * sx, 0.06, 0.18);
      const footB = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), green));
      footB.position.set(0.16 * sx, 0.06, -0.14);
    }
  }
  return g;
}

export class Buddies {
  readonly group = new THREE.Group();
  spots: BuddySpot[] = [];
  active: Follower[] = [];

  build(defs: { type: BuddyType; x: number; y: number; z: number }[]): void {
    // drop the previous level's sleeping buddies; keep followers between levels
    this.group.clear();
    for (const f of this.active) this.group.add(f.group);
    this.spots = defs
      .filter((d) => !this.has(d.type)) // already-adopted buddies don't reappear
      .map((d) => {
        const g = makeBuddyMesh(d.type);
        g.position.set(d.x, d.y, d.z);
        this.group.add(g);
        return { type: d.type, pos: new THREE.Vector3(d.x, d.y, d.z), group: g, taken: false };
      });
  }

  has(type: BuddyType): boolean {
    return this.active.some((f) => f.type === type);
  }

  /** Adopt the first spot within reach; returns its type (for ability wiring + toast). */
  tryAdopt(pos: THREE.Vector3): BuddyType | null {
    for (const s of this.spots) {
      if (s.taken) continue;
      if (s.pos.distanceToSquared(pos) < 2.1) {
        s.taken = true;
        this.active.push({ type: s.type, group: s.group, hopPhase: Math.random() * 6 });
        return s.type;
      }
    }
    return null;
  }

  /** Followers trail behind the lead position with a springy hop. */
  update(dt: number, t: number, lead: THREE.Vector3, facing: number): void {
    let tx = lead.x;
    let tz = lead.z;
    let ty = lead.y;
    for (const f of this.active) {
      const p = f.group.position;
      const dx = tx - p.x;
      const dz = tz - p.z;
      const dist = Math.hypot(dx, dz);
      const speedMul = f.type === "turtle" ? 2.6 : 4.5;
      if (dist > 0.9) {
        const k = Math.min(1, dt * speedMul);
        p.x += dx * k;
        p.z += dz * k;
        f.group.rotation.y = Math.atan2(dx, dz);
      }
      // hop / flutter toward the target height
      const targetY = f.type === "birdie" ? ty + 0.7 : ty;
      const hover = f.type === "birdie" ? 0.15 : 0;
      const hop = dist > 1.2 ? Math.abs(Math.sin(t * 6 + f.hopPhase)) * 0.35 : 0;
      p.y += (targetY - p.y) * Math.min(1, dt * 5);
      f.group.position.y = p.y + hop + hover * Math.sin(t * 3 + f.hopPhase);
      // trail the next buddy behind this one
      tx = p.x - Math.sin(f.group.rotation.y) * 0.9;
      tz = p.z - Math.cos(f.group.rotation.y) * 0.9;
      ty = p.y;
    }
    // sleeping buddies bob gently
    for (const s of this.spots) {
      if (!s.taken) s.group.position.y = s.pos.y + Math.sin(t * 2 + s.pos.x) * 0.08;
    }
  }

  /** New run: everyone goes home. */
  resetRun(): void {
    this.active = [];
  }
}
