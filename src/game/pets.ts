/**
 * pets.ts — a pet that follows its kid everywhere: puppy, kitten, duckling or baby dragon.
 * Pets are chosen on the dress-up screen, show up for friends online, hop along behind you,
 * and do a happy spin when you dance or send a heart.
 */

import * as THREE from "three";
import { loadAnimal, makeAnimal, type AnimalKind, type AnimalModel } from "./critters";

/** Pets that have a real animated model (shown once it has loaded; the blocky one until then). */
const REAL: Partial<Record<number, AnimalKind>> = { 1: "shibainu", 5: "husky" };

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Build a pet mesh facing +Z. `kind` is an index into PETS (profile.ts); 0 = none. */
function makePet(kind: number): THREE.Group | null {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.4 });
  const eyes = (y: number, z: number, dx: number) => {
    for (const sx of [-1, 1]) part(g, new THREE.SphereGeometry(0.035, 6, 6), dark, dx * sx, y, z);
  };
  if (kind === 1 || kind === 5) {
    // puppy (5: a grey husky puppy)
    const fur = mat(kind === 5 ? 0xb8bec9 : 0xd9a066), ear = mat(kind === 5 ? 0x4a4f5c : 0x8a5a33);
    part(g, new THREE.CapsuleGeometry(0.17, 0.3, 4, 8), fur, 0, 0.3, 0).rotation.x = Math.PI / 2;
    part(g, new THREE.SphereGeometry(0.19, 10, 8), fur, 0, 0.5, 0.3);
    part(g, new THREE.SphereGeometry(0.09, 8, 6), mat(0xfff1dc), 0, 0.45, 0.46);
    part(g, new THREE.SphereGeometry(0.035, 6, 6), dark, 0, 0.48, 0.54);
    for (const sx of [-1, 1]) {
      part(g, new THREE.BoxGeometry(0.08, 0.2, 0.12), ear, 0.17 * sx, 0.52, 0.27).rotation.z = 0.25 * sx;
      part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), fur, 0.11 * sx, 0.1, 0.18);
      part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), fur, 0.11 * sx, 0.1, -0.18);
    }
    part(g, new THREE.CylinderGeometry(0.03, 0.045, 0.25, 6), fur, 0, 0.45, -0.33).rotation.x = -0.7;
    eyes(0.56, 0.46, 0.08);
  } else if (kind === 2) {
    // kitten
    const fur = mat(0x9aa4b0), pink = mat(0xffb3c6);
    part(g, new THREE.CapsuleGeometry(0.15, 0.26, 4, 8), fur, 0, 0.27, 0).rotation.x = Math.PI / 2;
    part(g, new THREE.SphereGeometry(0.18, 10, 8), fur, 0, 0.46, 0.27);
    part(g, new THREE.SphereGeometry(0.03, 6, 6), pink, 0, 0.44, 0.45);
    for (const sx of [-1, 1]) {
      part(g, new THREE.ConeGeometry(0.07, 0.14, 4), fur, 0.11 * sx, 0.66, 0.26);
      part(g, new THREE.CylinderGeometry(0.04, 0.04, 0.18, 6), fur, 0.09 * sx, 0.09, 0.16);
      part(g, new THREE.CylinderGeometry(0.04, 0.04, 0.18, 6), fur, 0.09 * sx, 0.09, -0.16);
    }
    part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), fur, 0, 0.5, -0.32).rotation.x = -0.35;
    eyes(0.5, 0.42, 0.075);
  } else if (kind === 3) {
    // duckling
    const yellow = mat(0xffe066), orange = mat(0xff9f43);
    part(g, new THREE.SphereGeometry(0.2, 10, 8), yellow, 0, 0.25, 0).scale.set(1, 0.9, 1.2);
    part(g, new THREE.SphereGeometry(0.14, 10, 8), yellow, 0, 0.5, 0.14);
    part(g, new THREE.ConeGeometry(0.06, 0.14, 6), orange, 0, 0.48, 0.3).rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) {
      part(g, new THREE.SphereGeometry(0.1, 8, 6), yellow, 0.19 * sx, 0.27, -0.02).scale.set(0.4, 0.8, 1.1);
      part(g, new THREE.BoxGeometry(0.1, 0.03, 0.14), orange, 0.08 * sx, 0.02, 0.04);
    }
    eyes(0.55, 0.25, 0.07);
  } else if (kind === 4) {
    // baby dragon
    const green = mat(0x5ed48a), belly = mat(0xfff1a8), wing = mat(0xb197fc);
    part(g, new THREE.SphereGeometry(0.22, 10, 8), green, 0, 0.3, 0).scale.set(1, 1.05, 1.15);
    part(g, new THREE.SphereGeometry(0.15, 8, 6), belly, 0, 0.26, 0.12);
    part(g, new THREE.SphereGeometry(0.17, 10, 8), green, 0, 0.6, 0.2);
    part(g, new THREE.BoxGeometry(0.16, 0.1, 0.16), green, 0, 0.56, 0.36);
    for (const sx of [-1, 1]) {
      part(g, new THREE.ConeGeometry(0.035, 0.12, 5), belly, 0.08 * sx, 0.8, 0.16);
      const w = part(g, new THREE.ConeGeometry(0.16, 0.34, 3), wing, 0.26 * sx, 0.5, -0.08);
      w.rotation.z = -1.1 * sx;
      w.scale.z = 0.25;
      part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.14, 6), green, 0.1 * sx, 0.07, 0.06);
    }
    part(g, new THREE.ConeGeometry(0.08, 0.4, 6), green, 0, 0.22, -0.36).rotation.x = -1.9;
    for (let i = 0; i < 3; i++) part(g, new THREE.ConeGeometry(0.035, 0.09, 4), wing, 0, 0.56 - i * 0.07, -0.1 - i * 0.09);
    eyes(0.66, 0.34, 0.085);
  } else {
    return null;
  }
  return g;
}

export class Pet {
  readonly group = new THREE.Group();
  private mesh: THREE.Group | null = null;
  private kind = 0;
  private phase = Math.random() * 6;
  private happyT = 0;
  private placed = false;
  /** The real animated pet, once loaded (its meshes are shared, so never disposed here). */
  private real: AnimalModel | null = null;
  private lastX = 0;
  private lastZ = 0;
  private speed = 0;

  /** Change the pet (0 = none). */
  setKind(kind: number): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.real = null;
    if (this.mesh && this.mesh.userData.shared) {
      this.group.remove(this.mesh);
    } else if (this.mesh) {
      this.mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.group.remove(this.mesh);
    }
    this.mesh = makePet(kind);
    if (this.mesh) this.group.add(this.mesh);
    const real = REAL[kind];
    if (real) {
      loadAnimal(real).then((kit) => {
        if (!kit || this.kind !== kind || !this.mesh) return;
        // swap the blocky pet for the real one
        this.mesh.traverse((o) => {
          if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
        });
        this.group.remove(this.mesh);
        const m = makeAnimal(kit, kind === 5 ? 0.85 : 0.9);
        m.play("Idle", 0);
        m.root.userData.shared = true;
        this.mesh = m.root;
        this.real = m;
        this.group.add(m.root);
      });
    }
  }

  get active(): boolean {
    return this.mesh !== null;
  }

  /** A happy spin with a little jump (dance, heart sticker, new pet). */
  cheer(): void {
    this.happyT = 1.2;
  }

  /** Jump straight to the kid (new level, respawn). */
  snapTo(x: number, y: number, z: number): void {
    this.group.position.set(x + 0.9, y, z + 0.6);
    this.placed = true;
  }

  /** Trail behind the kid with a springy hop. `groundY` is the kid's feet height. */
  update(dt: number, t: number, kx: number, groundY: number, kz: number): void {
    if (!this.mesh) return;
    const p = this.group.position;
    if (!this.placed) this.snapTo(kx, groundY, kz);
    const dx = kx - p.x, dz = kz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 14) {
      this.snapTo(kx, groundY, kz); // teleports, portals, boat rides
    } else if (dist > 1.1) {
      const k = Math.min(1, dt * (dist > 4 ? 6 : 3.6));
      p.x += dx * k;
      p.z += dz * k;
      this.group.rotation.y = Math.atan2(dx, dz);
    }
    p.y += (groundY - p.y) * Math.min(1, dt * 6);
    if (this.real && dt > 0) {
      // steps timed to how fast the pet really moved this frame
      const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ) / dt;
      this.speed += (Math.min(moved, 12) - this.speed) * Math.min(1, dt * 8);
      this.real.moveAt(this.speed < 0.3 ? 0 : this.speed, 0.2);
      this.real.mixer.update(dt);
    }
    this.lastX = p.x;
    this.lastZ = p.z;
    const hop = this.real ? 0 : dist > 1.3 ? Math.abs(Math.sin(t * 8 + this.phase)) * 0.22 : 0;
    this.mesh.position.y = hop;
    if (this.happyT > 0) {
      this.happyT = Math.max(0, this.happyT - dt);
      this.mesh.rotation.y = this.happyT * 10;
      this.mesh.position.y = Math.abs(Math.sin(this.happyT * 9)) * 0.35;
      if (this.happyT === 0) this.mesh.rotation.y = 0;
    }
  }
}
