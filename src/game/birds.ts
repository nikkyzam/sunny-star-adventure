/**
 * birds.ts — circling bird enemies: they fly a loop, wings flapping.
 * Hazard from the side, stompable from above (worth +50 and a bounce).
 */

import * as THREE from "three";

export interface Bird {
  cx: number; cy: number; cz: number; r: number; speed: number;
  angle: number;
  alive: boolean;
  squashT: number;
  group: THREE.Group;
  body: THREE.Mesh;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
}

const BODY_COLORS = [0xff8c42, 0xb197fc];

export class Birds {
  readonly group = new THREE.Group();
  items: Bird[] = [];

  build(defs: { cx: number; cy: number; cz: number; r: number; speed: number }[]): void {
    this.group.clear();
    this.items = defs.map((d, i) => {
      const g = new THREE.Group();
      const color = BODY_COLORS[i % BODY_COLORS.length];
      const bodyMat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), bodyMat);
      body.scale.set(1, 0.85, 1.2);
      body.castShadow = true;
      g.add(body);
      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.22, 8),
        new THREE.MeshStandardMaterial({ color: 0xffd93d, flatShading: true }),
      );
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.02, 0.42);
      g.add(beak);
      const wingGeo = new THREE.BoxGeometry(0.5, 0.06, 0.3);
      const wingL = new THREE.Mesh(wingGeo, bodyMat);
      wingL.position.set(-0.42, 0.08, 0);
      g.add(wingL);
      const wingR = new THREE.Mesh(wingGeo, bodyMat);
      wingR.position.set(0.42, 0.08, 0);
      g.add(wingR);
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
        );
        eye.position.set(0.14 * sx, 0.12, 0.28);
        g.add(eye);
        const pupil = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0x33323e, roughness: 0.3 }),
        );
        pupil.position.set(0.14 * sx, 0.12, 0.33);
        g.add(pupil);
      }
      this.group.add(g);
      return {
        ...d, angle: Math.random() * Math.PI * 2, alive: true, squashT: 0,
        group: g, body, wingL, wingR,
      };
    });
  }

  update(dt: number, t: number): void {
    for (const b of this.items) {
      if (!b.alive) {
        if (b.squashT > 0) {
          b.squashT = Math.max(0, b.squashT - dt * 2.5);
          b.group.scale.setScalar(Math.max(0.05, b.squashT));
          b.group.rotation.z += dt * 9;
          if (b.squashT === 0) b.group.visible = false;
        }
        continue;
      }
      b.angle += (b.speed * dt / b.r) * 1.6;
      const x = b.cx + Math.cos(b.angle) * b.r;
      const z = b.cz + Math.sin(b.angle) * b.r;
      const y = b.cy + Math.sin(t * 2.2 + b.r) * 0.4;
      b.group.position.set(x, y, z);
      // face travel direction (tangent of the circle)
      b.group.rotation.y = Math.atan2(-Math.sin(b.angle), Math.cos(b.angle)) + Math.PI / 2;
      const flap = Math.sin(t * 11 + b.r * 3) * 0.7;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }
  }

  stomp(b: Bird): void {
    b.alive = false;
    b.squashT = 1;
  }
}
