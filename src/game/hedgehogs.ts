/**
 * hedgehogs.ts — spiky patrol enemies with a timing twist: their spikes pop in and out.
 * Spikes IN  → stompable (side touch still hurts).
 * Spikes OUT → untouchable: any contact hurts. Watch the rhythm!
 */

import * as THREE from "three";

export interface Hedgehog {
  ax: number; az: number; bx: number; bz: number; y: number;
  speed: number;
  t: number;
  dir: 1 | -1;
  alive: boolean;
  squashT: number;
  spikesOut: boolean;
  phase: number;
  group: THREE.Group;
  body: THREE.Mesh;
  spikes: THREE.Group;
}

const CYCLE = 3.8;        // seconds per in/out cycle
const OUT_AT = 0.55;      // fraction of the cycle with spikes out

export class Hedgehogs {
  readonly group = new THREE.Group();
  items: Hedgehog[] = [];

  build(specs: { ax: number; az: number; bx: number; bz: number; y: number; speed: number }[]): void {
    this.group.clear();
    this.items = specs.map((s, i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0x9c6b4f, flatShading: true, roughness: 0.9 }),
      );
      body.scale.set(1, 0.75, 1.1);
      body.position.y = 0.34;
      body.castShadow = true;
      g.add(body);

      // spikes
      const spikes = new THREE.Group();
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, flatShading: true, roughness: 0.8 });
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 6), spikeMat);
        spike.position.set(Math.cos(a) * 0.3, 0.5 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.32);
        spike.rotation.z = -Math.cos(a) * 0.7;
        spike.rotation.x = Math.sin(a) * 0.7;
        spikes.add(spike);
      }
      g.add(spikes);

      // face
      const snout = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xc9a06b, flatShading: true, roughness: 0.8 }),
      );
      snout.position.set(0, 0.28, 0.44);
      g.add(snout);
      const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.4 }),
      );
      nose.position.set(0, 0.3, 0.55);
      g.add(nose);
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.4 }),
        );
        eye.position.set(0.13 * sx, 0.42, 0.36);
        g.add(eye);
      }

      g.position.set(s.ax, s.y, s.az);
      this.group.add(g);
      return {
        ...s, t: Math.random(), dir: 1 as const, alive: true, squashT: 0,
        spikesOut: false, phase: i * 1.7, group: g, body, spikes,
      };
    });
  }

  update(dt: number, time: number): void {
    for (const h of this.items) {
      if (!h.alive) {
        if (h.squashT > 0) {
          h.squashT = Math.max(0, h.squashT - dt * 3.2);
          const k = h.squashT;
          h.group.scale.set(1 + (1 - k) * 0.8, Math.max(0.05, k * 0.7), 1 + (1 - k) * 0.8);
          if (h.squashT === 0) h.group.visible = false;
        }
        continue;
      }
      const len = Math.hypot(h.bx - h.ax, h.bz - h.az) || 1;
      h.t += (h.speed * dt / len) * h.dir;
      if (h.t > 1) { h.t = 1; h.dir = -1; }
      else if (h.t < 0) { h.t = 0; h.dir = 1; }
      h.group.position.set(
        h.ax + (h.bx - h.ax) * h.t,
        h.y,
        h.az + (h.bz - h.az) * h.t,
      );
      const vx = (h.bx - h.ax) * h.dir;
      const vz = (h.bz - h.az) * h.dir;
      if (Math.abs(vx) + Math.abs(vz) > 0.001) h.group.rotation.y = Math.atan2(vx, vz);

      // spikes pop in and out on a rhythm
      const out = ((time + h.phase) % CYCLE) / CYCLE > OUT_AT;
      if (out !== h.spikesOut) h.spikesOut = out;
      const target = out ? 1 : 0.15;
      const cur = h.spikes.scale.x;
      h.spikes.scale.setScalar(cur + (target - cur) * Math.min(1, dt * 10));
    }
  }

  stomp(h: Hedgehog): void {
    h.alive = false;
    h.squashT = 1;
  }
}
