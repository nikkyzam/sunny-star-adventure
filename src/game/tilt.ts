/**
 * tilt.ts — a knight's ring course: small rings hanging from wooden posts in a row, at the height
 * of a rider on a horse. Gallop through each one (it rings and turns gold-bright); all of them in
 * one visit wins a prize. On foot the rings are too high, so they're for riders.
 *
 * world.ts builds it from a level's `knightRings`; boot.ts asks pass() each frame for each rider.
 */

import * as THREE from "three";

const R = 0.9; // ring radius: generous, it's for kids

interface Ring { centre: THREE.Vector3; normal: THREE.Vector3; ring: THREE.Mesh; passed: boolean; side: Map<object, number>; spin: number }

export class KnightRings {
  readonly group = new THREE.Group();
  private items: Ring[] = [];
  private readonly mat = new THREE.MeshStandardMaterial({ color: 0xc0c7d2, metalness: 0.7, roughness: 0.3 });
  private readonly done = new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xb07a00, metalness: 0.5, roughness: 0.3 });
  passed = 0;

  /** Each ring's middle (for tests). */
  get centres(): number[][] {
    return this.items.map((r) => r.centre.toArray());
  }

  get total(): number {
    return this.items.length;
  }

  /** defs: x, ground y, z, heading (which way riders go through). */
  build(defs: [number, number, number, number][]): void {
    this.group.clear();
    this.passed = 0;
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4f2a, roughness: 0.9 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.8 });
    const ribbon = new THREE.MeshStandardMaterial({ color: 0x4d7fd6, roughness: 0.8, side: THREE.DoubleSide });
    const ringGeo = new THREE.TorusGeometry(R, 0.07, 8, 28);
    this.items = defs.map(([x, y, z, h]) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = h;
      this.group.add(g);
      const cy = 1.75; // the middle of the ring: a rider's chest on a horse
      // a post to the side with an arm over the lane, and the ring hanging from it
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, cy + R + 0.6, 8), wood);
      post.position.set(1.7, (cy + R + 0.6) / 2, 0);
      g.add(post);
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.12, 8), stripe);
        band.position.set(1.7, 0.6 + k * 0.9, 0);
        g.add(band);
      }
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), wood);
      arm.position.set(0.85, cy + R + 0.55, 0);
      g.add(arm);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), wood);
      cord.position.set(0, cy + R + 0.27, 0);
      g.add(cord);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), ribbon);
      flag.position.set(1.95, cy + R + 0.45, 0);
      g.add(flag);
      // the ring turns to face the riders (the torus lies in its own XY plane)
      const ring = new THREE.Mesh(ringGeo, this.mat);
      ring.position.set(0, cy, 0);
      g.add(ring);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      g.updateMatrixWorld(true);
      return {
        centre: ring.getWorldPosition(new THREE.Vector3()),
        normal: new THREE.Vector3(0, 0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, h),
        ring, passed: false, side: new Map(), spin: 0,
      };
    });
  }

  update(t: number, dt: number): void {
    for (const r of this.items) {
      // hanging rings sway a little; a ring someone just went through spins
      r.spin = Math.max(0, r.spin - dt * 1.5);
      r.ring.rotation.y = Math.sin(t * 1.3 + r.centre.x) * 0.08 + r.spin * Math.sin(t * 20) * 0.6;
    }
  }

  /**
   * Has `who` (chest at `chest`) just gone through a ring? Returns the ring's number (1…) the first
   * time, 0 if they went through one already passed, -1 if nothing happened. Someone who doesn't
   * count (not on a horse) gets -2 for going through, and the ring stays to win.
   */
  pass(who: object, chest: THREE.Vector3, counts = true): number {
    let out = -1;
    this.items.forEach((r) => {
      const d = chest.clone().sub(r.centre);
      const along = d.dot(r.normal);
      const prev = r.side.get(who);
      r.side.set(who, along);
      if (prev === undefined || Math.sign(prev) === Math.sign(along) || Math.abs(along) > 2) return;
      const across = d.addScaledVector(r.normal, -along).length();
      if (across > R + 0.7) return; // generous: a galloping horse weaves, and the rider is wide
      r.spin = 1;
      if (!counts) { out = -2; return; }
      if (r.passed) { out = Math.max(out, 0); return; }
      r.passed = true;
      r.ring.material = this.done;
      this.passed++;
      out = this.passed;
    });
    return out;
  }
}
