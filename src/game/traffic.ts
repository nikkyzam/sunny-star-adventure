/**
 * traffic.ts — cars that drive around the city on their own, keeping to their lane in a loop.
 * They are gentle: a car slows down and waits for any kid, ride or car in front of it, and kids
 * are nudged aside rather than hurt. Each car is three meshes (body, cabin and the dark parts).
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { carModel } from "./critters";

export interface TrafficLoop {
  /** Lane corners in driving order; the loop closes back to the first. */
  pts: [number, number][];
  cars: number;
  /** Cruising speed, m/s. */
  speed: number;
}

interface TCar {
  group: THREE.Group;
  loop: { pts: THREE.Vector2[]; lens: number[]; total: number };
  s: number;
  v: number;
  top: number;
  heading: number;
  /** Which city car model it wears; `dressed` once the real model replaced the simple shape. */
  look: number;
  dressed: boolean;
}

const COLORS = [0xff4757, 0x5cb8ff, 0xffd93d, 0x7ed957, 0xffffff, 0xb197fc, 0xff9f43, 0x2f3542];
const LOOK_AHEAD = 6;
const HALF_LEN = 2.0;
const HALF_WID = 0.95;

export class Traffic {
  readonly group = new THREE.Group();
  cars: TCar[] = [];
  private bodyGeo: THREE.BufferGeometry;
  private cabinGeo: THREE.BufferGeometry;
  private darkGeo: THREE.BufferGeometry;
  private cabinMat = new THREE.MeshStandardMaterial({ color: 0xcfe6f5, roughness: 0.15, metalness: 0.3 });
  private darkMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.8 });
  private bodyMats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.25 }));
  private fwd = new THREE.Vector2();

  constructor() {
    this.bodyGeo = new THREE.BoxGeometry(1.9, 0.62, 4.0).translate(0, 0.62, 0);
    this.cabinGeo = new THREE.BoxGeometry(1.6, 0.6, 2.1).translate(0, 1.22, -0.2);
    const wheels: THREE.BufferGeometry[] = [];
    for (const x of [-0.92, 0.92]) {
      for (const z of [-1.3, 1.3]) wheels.push(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12).rotateZ(Math.PI / 2).translate(x, 0.36, z));
    }
    // bumpers
    wheels.push(new THREE.BoxGeometry(1.95, 0.22, 0.2).translate(0, 0.42, 2.02), new THREE.BoxGeometry(1.95, 0.22, 0.2).translate(0, 0.42, -2.02));
    this.darkGeo = mergeGeometries(wheels.map((g) => g.toNonIndexed()));
    for (const g of wheels) g.dispose();
  }

  build(loops: TrafficLoop[], groundY = 0): void {
    this.clear();
    let k = 0;
    for (const l of loops) {
      const pts = l.pts.map(([x, z]) => new THREE.Vector2(x, z));
      const lens = pts.map((p, i) => p.distanceTo(pts[(i + 1) % pts.length]));
      const total = lens.reduce((a, b) => a + b, 0);
      const loop = { pts, lens, total };
      for (let i = 0; i < l.cars; i++) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(this.bodyGeo, this.bodyMats[k++ % this.bodyMats.length]);
        const cabin = new THREE.Mesh(this.cabinGeo, this.cabinMat);
        const dark = new THREE.Mesh(this.darkGeo, this.darkMat);
        body.castShadow = cabin.castShadow = true;
        group.add(body, cabin, dark);
        group.position.y = groundY;
        this.group.add(group);
        const car: TCar = { group, loop, s: (i / l.cars) * total, v: 0, top: l.speed * (0.85 + ((k * 37) % 10) / 33), heading: 0, look: k * 3 + i, dressed: false };
        this.dress(car);
        this.place(car);
        car.group.rotation.y = car.heading;
        this.cars.push(car);
      }
    }
  }

  /** Swap the simple shape for a real city car, if the models have loaded. */
  private dress(c: TCar): void {
    if (c.dressed) return;
    const m = carModel(c.look);
    if (!m) return;
    c.group.clear();
    c.group.add(m);
    c.dressed = true;
  }

  /** The city car models just arrived: dress every car that's already driving. */
  dressAll(): void {
    for (const c of this.cars) this.dress(c);
  }

  clear(): void {
    this.group.clear();
    this.cars = [];
  }

  dispose(): void {
    this.clear();
    this.bodyGeo.dispose();
    this.cabinGeo.dispose();
    this.darkGeo.dispose();
    this.cabinMat.dispose();
    this.darkMat.dispose();
    for (const m of this.bodyMats) m.dispose();
  }

  /** Where on its loop a car is: sets its position and the heading it wants. */
  private place(c: TCar): void {
    const { pts, lens } = c.loop;
    let s = c.s;
    let i = 0;
    while (s > lens[i]) { s -= lens[i]; i = (i + 1) % pts.length; }
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const t = lens[i] > 0 ? s / lens[i] : 0;
    c.group.position.x = a.x + (b.x - a.x) * t;
    c.group.position.z = a.y + (b.y - a.y) * t;
    c.heading = Math.atan2(b.x - a.x, b.y - a.y);
  }

  /** Drive on. `blockers` are kids and rides: a car waits while one is in front of it. */
  update(dt: number, blockers: THREE.Vector3[]): void {
    for (const c of this.cars) {
      const p = c.group.position;
      this.fwd.set(Math.sin(c.group.rotation.y), Math.cos(c.group.rotation.y));
      let blocked = false;
      const ahead = (x: number, z: number) => {
        const dx = x - p.x, dz = z - p.z;
        const along = dx * this.fwd.x + dz * this.fwd.y;
        const side = Math.abs(dx * this.fwd.y - dz * this.fwd.x);
        return along > 0 && along < HALF_LEN + LOOK_AHEAD && side < HALF_WID + 1.0;
      };
      for (const b of blockers) if (ahead(b.x, b.z)) { blocked = true; break; }
      if (!blocked) {
        for (const o of this.cars) if (o !== c && ahead(o.group.position.x, o.group.position.z)) { blocked = true; break; }
      }
      const want = blocked ? 0 : c.top;
      c.v += Math.sign(want - c.v) * Math.min(Math.abs(want - c.v), (blocked ? 14 : 4) * dt);
      c.s = (c.s + c.v * dt) % c.loop.total;
      this.place(c);
      // turn smoothly into the new street
      let d = c.heading - c.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      c.group.rotation.y += d * Math.min(1, dt * 6);
    }
  }

  /** Cars are solid: nudge something at pos (a kid, a ride) out of any car it overlaps. */
  pushOut(pos: THREE.Vector3, radius: number): boolean {
    let hit = false;
    for (const c of this.cars) {
      const p = c.group.position;
      if (pos.y > p.y + 1.6) continue; // jumping on top is fine
      const sin = Math.sin(c.group.rotation.y), cos = Math.cos(c.group.rotation.y);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      // into the car's own frame: lx across, lz along
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      const ox = HALF_WID + radius - Math.abs(lx), oz = HALF_LEN + radius - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      hit = true;
      let nx = lx, nz = lz;
      if (ox < oz) nx = Math.sign(lx || 1) * (HALF_WID + radius);
      else nz = Math.sign(lz || 1) * (HALF_LEN + radius);
      pos.x = p.x + nx * cos + nz * sin;
      pos.z = p.z - nx * sin + nz * cos;
    }
    return hit;
  }
}
