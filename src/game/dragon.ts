/**
 * dragon.ts — Sparky, a small, friendly dragon who lives on top of a castle's keep. He rests on the
 * roof (breathing, looking about, tail swishing) and now and then flies a lap round the towers.
 * A kid who climbs up can hop on his back: he takes off over the gate, flies a big loop round the
 * whole island and lands back on the keep. Drawn in code, low-poly, with flapping wings.
 *
 * world.ts makes one for a castle with a `dragon` route; boot.ts handles getting on and off.
 */

import * as THREE from "three";

const V = new THREE.Vector3(), V2 = new THREE.Vector3();

type State = "perch" | "lap" | "tour";

/** Where the rider sits, in the dragon's own space (feet on the roof at y 0, nose toward +Z). */
const SEAT = new THREE.Vector3(0, 1.55, -0.05);

export class Dragon {
  readonly group = new THREE.Group();
  state: State = "perch";
  /** How fast he's going (m/s), and where his wings are in a beat (radians), for the rider's hands. */
  speed = 0;
  flap = 0;

  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly wings: THREE.Group[] = [];
  private readonly tail: THREE.Group[] = [];
  private readonly legs: THREE.Group[] = [];
  private curve: THREE.CatmullRomCurve3 | null = null;
  private len = 0;
  private s = 0;
  private top = 0;
  private hurryUp = false;
  private restT = 0;
  private nextLap = 18;
  private fly = 0;        // 0 resting … 1 flying (eases)
  private heading: number;
  private roll = 0;
  private blinkT = 2;
  private readonly eyes: THREE.Object3D[] = [];

  constructor(readonly perch: THREE.Vector3, readonly facing: number, private readonly centre: THREE.Vector3,
    private readonly route: THREE.Vector3[]) {
    this.heading = facing;
    this.build();
    this.group.position.copy(perch);
    this.group.rotation.order = "YXZ";
    this.group.rotation.y = facing;
  }

  /** Close enough to climb on (only while he's resting on the keep). */
  canBoard(p: THREE.Vector3, reach = 3): boolean {
    return this.state === "perch" && this.fly < 0.05 && Math.hypot(p.x - this.perch.x, p.z - this.perch.z) < reach && Math.abs(p.y - this.perch.y) < 1.5;
  }

  /** Off you hop: beside him on the roof. */
  dropOff(out: THREE.Vector3): THREE.Vector3 {
    return out.set(1.5, 0, -0.4).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.facing).add(this.perch);
  }

  /** The rider's seat in the world (the top of the saddle). */
  seat(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld();
    return out.copy(SEAT).applyMatrix4(this.group.matrixWorld);
  }

  get yaw(): number {
    return this.heading;
  }

  /** The big flight round the island, with someone on his back. */
  startTour(): void {
    const up = this.out(6, 5), back = this.out(-14, 6);
    this.go("tour", [this.perch.clone(), up, ...this.route, back, this.perch.clone()], 11);
  }

  /** "Let's go home": he speeds up for the rest of the way. */
  hurry(): void {
    this.hurryUp = true;
  }

  update(t: number, dt: number): void {
    // ── where he is ──
    if (this.curve) {
      const dist = this.len - this.s;
      // gentle take-off and landing, full speed in between
      const ease = Math.min(1, 0.3 + this.s / 10) * Math.min(1, 0.15 + dist / 16);
      this.speed = this.top * ease * (this.hurryUp ? 2.2 : 1);
      this.s = Math.min(this.len, this.s + this.speed * dt);
      const u = this.s / this.len;
      this.curve.getPointAt(u, this.group.position);
      const tan = this.curve.getTangentAt(Math.min(u, 0.999), V);
      const flat = Math.hypot(tan.x, tan.z);
      const h = flat > 0.05 ? Math.atan2(tan.x, tan.z) : this.heading;
      let dh = h - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 6);
      const turn = dt > 0 ? dh / Math.max(dt, 1e-3) : 0;
      this.roll += (THREE.MathUtils.clamp(-turn * 0.12, -0.5, 0.5) - this.roll) * Math.min(1, dt * 3);
      this.group.rotation.x = -Math.atan2(tan.y, Math.max(flat, 0.2)) * 0.6 * Math.min(1, ease * 2);
      this.fly = Math.min(1, this.fly + dt * 2);
      if (this.s >= this.len) {
        this.curve = null;
        this.state = "perch";
        this.speed = 0;
        this.hurryUp = false;
        this.restT = 0;
        this.nextLap = 22 + Math.random() * 14;
        this.group.position.copy(this.perch);
      }
    } else {
      // resting: turn back to look out over the gate, fold up
      let dh = this.facing - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 3);
      this.roll *= 1 - Math.min(1, dt * 4);
      this.group.rotation.x *= 1 - Math.min(1, dt * 4);
      this.fly = Math.max(0, this.fly - dt * 1.5);
      this.restT += dt;
    }
    this.group.rotation.y = this.heading;
    this.group.rotation.z = this.roll;

    // ── how he moves ──
    const f = this.fly;
    const rising = this.curve ? THREE.MathUtils.clamp(this.curve.getTangentAt(Math.min(this.s / this.len, 0.999), V2).y * 3, 0, 1) : 0;
    // beats faster climbing; glides now and then when cruising
    const glide = this.curve && rising < 0.2 ? Math.max(0, Math.sin(t * 0.7)) * 0.8 : 0;
    this.flap += dt * (f > 0 ? 7 + rising * 4 : 1.2);
    const beat = Math.sin(this.flap) * (1 - glide);
    const open = 0.15 + f * 0.25;
    const rest = 1.0 + Math.sin(t * 0.9) * 0.05;
    this.wings.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      // resting: wings folded up along his back; flying: spread and beating
      w.rotation.z = side * THREE.MathUtils.lerp(rest, open + beat * 0.75, f);
      w.rotation.y = side * THREE.MathUtils.lerp(-0.9, 0, f);
    });
    // the body rises a little on each down-beat; breathing when resting
    this.body.position.y = f * -beat * 0.08;
    this.body.scale.y = 1 + (1 - f) * Math.sin(t * 2.2) * 0.025;
    this.tail.forEach((s, i) => {
      s.rotation.y = Math.sin(t * (f > 0 ? 3 : 1.6) - i * 0.7) * (0.12 + i * 0.03);
      s.rotation.x = f * (0.06 + Math.sin(this.flap - i * 0.5) * 0.05);
    });
    for (const l of this.legs) l.rotation.x = f * 1.1;
    // the head looks about when resting, forward (into the wind) when flying
    this.head.rotation.y = (1 - f) * (Math.sin(t * 0.45) * 0.5 + Math.sin(t * 1.3) * 0.12);
    this.head.rotation.x = (1 - f) * Math.sin(t * 0.6) * 0.08 - f * 0.15;
    // blink
    this.blinkT -= dt;
    const shut = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = shut ? 0.15 : 1;

    // ── now and then, a lap round the towers ──
    if (this.state === "perch" && this.restT > this.nextLap) this.lap();
  }

  /** A short lap round the castle, just for fun. */
  private lap(): void {
    const c = this.centre, r = 15, y = this.perch.y + 4;
    const pts = [this.perch.clone(), this.out(5, 4)];
    const a0 = Math.atan2(pts[1].x - c.x, pts[1].z - c.z);
    for (let k = 1; k <= 7; k++) {
      const a = a0 + (k / 8) * Math.PI * 2;
      pts.push(new THREE.Vector3(c.x + Math.sin(a) * r, y + Math.sin(k) * 1.5, c.z + Math.cos(a) * r));
    }
    pts.push(this.out(-11, 5), this.perch.clone());
    this.go("lap", pts, 9);
  }

  private go(state: State, pts: THREE.Vector3[], top: number): void {
    this.state = state;
    this.curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    this.len = this.curve.getLength();
    this.s = 0;
    this.top = top;
    this.hurryUp = false;
  }

  /** A point `ahead` metres in front of the perch (behind if negative) and `up` above it. */
  private out(ahead: number, up: number): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.facing) * ahead, up, Math.cos(this.facing) * ahead).add(this.perch);
  }

  // ── the model ───────────────────────────────────────────────────────────

  private build(): void {
    const m = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...extra });
    const green = m(0x3fbf7f), belly = m(0xffe3a0), spike = m(0xff9f43), horn = m(0xffd166),
      wingM = m(0x9b6bff, { side: THREE.DoubleSide }), white = m(0xffffff, { roughness: 0.3 }),
      black = m(0x1a1a24, { roughness: 0.2 }), saddle = m(0xd8343f), gold = m(0xf2c14e, { metalness: 0.4 }), pink = m(0xff8fb1);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    this.group.add(this.body);

    // a round body, a pale tummy, a saddle on top
    add(new THREE.SphereGeometry(0.7, 12, 9), green, 0, 1.0, 0).scale.set(0.78, 0.8, 1.45);
    add(new THREE.SphereGeometry(0.62, 12, 9), belly, 0, 0.88, 0.12).scale.set(0.72, 0.7, 1.35);
    add(new THREE.BoxGeometry(0.62, 0.1, 0.6), saddle, 0, 1.53, -0.05).rotation.x = 0.04;
    add(new THREE.BoxGeometry(0.66, 0.03, 0.64), gold, 0, 1.49, -0.05);
    add(new THREE.BoxGeometry(0.2, 0.18, 0.08), saddle, 0, 1.62, 0.24);
    // spikes down the back (not where the rider sits)
    for (const [z, y, s] of [[0.62, 1.42, 1], [-0.45, 1.5, 0.9], [-0.8, 1.38, 0.8]] as const) {
      add(new THREE.ConeGeometry(0.1 * s, 0.26 * s, 5), spike, 0, y, z).rotation.x = -0.4;
    }

    // neck and head, on one pivot so the whole thing turns
    this.head.position.set(0, 1.25, 0.8);
    this.body.add(this.head);
    const neck = add(new THREE.CylinderGeometry(0.2, 0.3, 0.9, 8), green, 0, 0.4, 0.28, this.head);
    neck.rotation.x = 0.65;
    add(new THREE.ConeGeometry(0.08, 0.2, 5), spike, 0, 0.62, 0.12, this.head).rotation.x = -0.5;
    const skull = new THREE.Group();
    skull.position.set(0, 0.9, 0.62);
    this.head.add(skull);
    add(new THREE.SphereGeometry(0.36, 12, 9), green, 0, 0, 0, skull).scale.set(1, 0.92, 1);
    add(new THREE.SphereGeometry(0.26, 10, 8), green, 0, -0.1, 0.32, skull).scale.set(1, 0.75, 1.1);
    add(new THREE.SphereGeometry(0.2, 10, 8), belly, 0, -0.17, 0.36, skull).scale.set(1.05, 0.5, 1.05);
    for (const sx of [-1, 1]) {
      add(new THREE.SphereGeometry(0.035, 6, 5), black, sx * 0.08, -0.04, 0.6, skull); // nostrils
      const eye = new THREE.Group();
      eye.position.set(sx * 0.17, 0.1, 0.24);
      skull.add(eye);
      add(new THREE.SphereGeometry(0.12, 10, 8), white, 0, 0, 0, eye);
      add(new THREE.SphereGeometry(0.068, 8, 6), black, sx * 0.01, 0.01, 0.08, eye);
      add(new THREE.SphereGeometry(0.022, 6, 4), white, sx * 0.03, 0.04, 0.135, eye); // the shine
      this.eyes.push(eye);
      add(new THREE.SphereGeometry(0.06, 6, 5), pink, sx * 0.24, -0.08, 0.2, skull).scale.set(1, 0.6, 0.5); // rosy cheeks
      const h = add(new THREE.ConeGeometry(0.06, 0.28, 6), horn, sx * 0.14, 0.3, -0.08, skull);
      h.rotation.set(-0.6, 0, sx * -0.25);
      const ear = add(new THREE.ConeGeometry(0.07, 0.2, 4), green, sx * 0.3, 0.12, -0.08, skull);
      ear.rotation.z = sx * -1.1;
    }

    // a tail of segments, each hanging from the last, ending in a spade
    let parent: THREE.Object3D = this.body;
    let pz = -0.95, py = 0.95;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, py, pz);
      parent.add(seg);
      const r = 0.3 * (1 - i / 7);
      const piece = add(new THREE.CylinderGeometry(r * 0.8, r, 0.42, 7), green, 0, -0.03, -0.2, seg);
      piece.rotation.x = Math.PI / 2 + 0.2;
      if (i % 2 === 0) add(new THREE.ConeGeometry(r * 0.35, r * 0.9, 4), spike, 0, r * 0.8, -0.2, seg).rotation.x = -0.4;
      this.tail.push(seg);
      parent = seg;
      pz = -0.38;
      py = -0.07;
    }
    const spade = add(new THREE.ConeGeometry(0.16, 0.34, 4), spike, 0, -0.06, -0.48, parent);
    spade.rotation.x = -Math.PI / 2;
    spade.scale.set(1, 1, 0.35);

    // four short legs with round feet
    for (const [x, z] of [[0.36, 0.55], [-0.36, 0.55], [0.38, -0.5], [-0.38, -0.5]] as const) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.62, z);
      this.body.add(leg);
      add(new THREE.CylinderGeometry(0.13, 0.15, 0.5, 7), green, 0, -0.3, 0, leg);
      add(new THREE.SphereGeometry(0.17, 8, 6), belly, 0, -0.56, 0.06, leg).scale.set(1, 0.55, 1.3);
      this.legs.push(leg);
    }

    // wings: an arm along the front edge, a purple skin behind it
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.25);
    shape.lineTo(0.9, 0.42);
    shape.lineTo(1.9, 0.3);
    shape.lineTo(1.55, -0.2);
    shape.quadraticCurveTo(1.25, -0.25, 1.05, -0.55);
    shape.quadraticCurveTo(0.75, -0.45, 0.5, -0.8);
    shape.quadraticCurveTo(0.25, -0.6, 0, -0.55);
    shape.lineTo(0, 0.25);
    const skin = new THREE.ShapeGeometry(shape, 4).rotateX(Math.PI / 2);
    for (const side of [1, -1]) {
      const w = new THREE.Group();
      w.position.set(side * 0.38, 1.3, 0.18);
      w.scale.x = side;
      this.body.add(w);
      add(skin, wingM, 0, 0, 0, w);
      const arm = add(new THREE.CylinderGeometry(0.05, 0.07, 1.95, 6), green, 0.95, 0.02, 0.33, w);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = 0.1;
      add(new THREE.ConeGeometry(0.05, 0.16, 5), horn, 1.95, 0.02, 0.3, w).rotation.z = -Math.PI / 2;
      this.wings.push(w);
    }
  }
}
