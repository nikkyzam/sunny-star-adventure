/**
 * bubbles.ts — soap bubbles from the playground's bubble tub. A kid blows a stream of them; they
 * wobble, drift up on the breeze with a rainbow shimmer, and pop when a kid runs or jumps into
 * them (or after a while on their own).
 */
import * as THREE from "three";

const TINTS = [0xffd1ec, 0xd1f0ff, 0xe6ffd6, 0xfff3c4, 0xe8dcff, 0xc9fff4];

interface Bubble { m: THREE.Mesh; v: THREE.Vector3; r: number; t: number; life: number; wob: number }

export class Bubbles {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.SphereGeometry(1, 18, 12);
  private readonly mats = TINTS.map((c) => new THREE.MeshPhongMaterial({
    color: c, emissive: c, emissiveIntensity: 0.4, specular: 0xffffff, shininess: 160,
    transparent: true, opacity: 0.42, depthWrite: false,
  }));
  /** The little shine on each bubble, where the sun catches it. */
  private readonly glint = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  private readonly glintGeo = new THREE.SphereGeometry(0.22, 8, 6);
  private list: Bubble[] = [];
  private queue = 0;
  private qT = 0;
  private readonly from = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  /** Bubbles popped by kids since the level began. */
  popped = 0;

  constructor() {
    this.group.name = "bubbles";
  }

  /** Blow a stream of bubbles from `from`, heading along `facing` (radians, like the kid's). */
  blow(from: THREE.Vector3, facing: number): void {
    this.from.copy(from);
    this.ahead.set(Math.sin(facing), 0, Math.cos(facing));
    this.queue = 10;
    this.qT = 0.25; // a breath in first
  }

  /** How many bubbles are floating right now. */
  get count(): number { return this.list.length; }

  /** Where the bubbles are (for tests). */
  positions(): number[][] { return this.list.map((b) => b.m.position.toArray()); }

  /**
   * Move them on; any that touch a kid pop. `kids` are feet positions; `onPop` gets each popped
   * bubble's position and whether a kid did it.
   */
  update(dt: number, t: number, kids: THREE.Vector3[], onPop: (at: THREE.Vector3, byKid: boolean) => void): void {
    if (this.queue > 0) {
      this.qT -= dt;
      while (this.qT <= 0 && this.queue > 0) {
        this.qT += 0.15;
        this.queue--;
        this.spawn();
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.t += dt;
      // slow down in the air, float up a little, drift on the breeze, wobble
      b.v.multiplyScalar(Math.exp(-1.4 * dt));
      b.v.y += (0.32 - b.v.y) * Math.min(1, dt * 0.8);
      b.m.position.addScaledVector(b.v, dt);
      b.m.position.x += Math.sin(t * 0.7 + b.wob) * 0.12 * dt;
      b.m.position.z += Math.cos(t * 0.6 + b.wob * 1.3) * 0.12 * dt;
      const grow = Math.min(1, b.t / 0.25);
      const w = Math.sin(t * 6 + b.wob) * 0.06;
      b.m.scale.set(b.r * grow * (1 + w), b.r * grow * (1 - w), b.r * grow * (1 + w));
      let byKid = false;
      if (b.t > 0.5) for (const k of kids) {
        const dy = b.m.position.y - k.y;
        if (dy > -0.2 - b.r && dy < 1.75 + b.r && Math.hypot(b.m.position.x - k.x, b.m.position.z - k.z) < 0.45 + b.r) { byKid = true; break; }
      }
      if (byKid || b.t > b.life) {
        onPop(b.m.position, byKid);
        if (byKid) this.popped++;
        this.group.remove(b.m);
        this.list.splice(i, 1);
      }
    }
  }

  private spawn(): void {
    if (this.list.length >= 30) return;
    const r = 0.06 + Math.random() * 0.08;
    const m = new THREE.Mesh(this.geo, this.mats[Math.floor(Math.random() * this.mats.length)]);
    m.position.copy(this.from);
    m.scale.setScalar(0.01);
    m.renderOrder = 2;
    const g = new THREE.Mesh(this.glintGeo, this.glint);
    g.position.set(-0.45, 0.55, 0.45);
    g.scale.set(1, 0.6, 1);
    g.renderOrder = 3;
    m.add(g);
    const side = (Math.random() - 0.5) * 1.4;
    const v = new THREE.Vector3(
      this.ahead.x * (1.3 + Math.random()) + this.ahead.z * side,
      0.2 + Math.random() * 0.6,
      this.ahead.z * (1.3 + Math.random()) - this.ahead.x * side,
    );
    this.list.push({ m, v, r, t: 0, life: 9 + Math.random() * 5, wob: Math.random() * 6 });
    this.group.add(m);
  }

  /** Pop them all silently (level change). */
  clear(): void {
    for (const b of this.list) this.group.remove(b.m);
    this.list = [];
    this.queue = 0;
    this.popped = 0;
  }
}
