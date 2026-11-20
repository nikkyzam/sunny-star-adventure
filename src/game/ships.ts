/**
 * ships.ts — sea battles: toy pirate ships sail in circles out at sea, and the sailboat's cannon
 * can sink them. Three hits sinks a ship (it tips over and goes down in a cloud of bubbles);
 * a new one sails in a little later. Nobody is on board — they are toy ships.
 *
 * The cannon aims itself at a ship that is roughly ahead, so small kids can hit things.
 */

import * as THREE from "three";

export type ShipDef = [cx: number, cz: number, radius: number, speed: number];

export interface ShipEvent {
  type: "hit" | "sink" | "splash";
  x: number; y: number; z: number;
}

interface Ship {
  group: THREE.Group;
  cx: number; cz: number; r: number; speed: number;
  angle: number;
  hp: number;
  sinkT: number;     // > 0 while going down
  awayT: number;     // > 0 while gone, before a new ship sails in
}

interface Ball { mesh: THREE.Mesh; vel: THREE.Vector3 }

const HITS_TO_SINK = 3;
const BALL_SPEED = 24;
const GRAVITY = 18;
const RANGE = 48;
const SINK_TIME = 3;
const AWAY_TIME = 25;

function makePirateShip(): THREE.Group {
  const g = new THREE.Group();
  const flat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.8 });
  const wood = flat(0x6b4a2f), dark = flat(0x33323e);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(2.4, 1.1, 5.2), wood, 0, 0.35, 0);
  add(new THREE.BoxGeometry(2.6, 0.9, 1.5), wood, 0, 1.2, -1.9);                 // raised stern
  add(new THREE.BoxGeometry(2.7, 0.14, 5.4), flat(0xffd93d), 0, 0.95, 0);          // gold trim
  const bow = add(new THREE.ConeGeometry(1.2, 2, 4), wood, 0, 0.35, 3.5);
  bow.rotation.x = Math.PI / 2;
  bow.scale.set(1, 1, 0.46);
  for (const [z, h] of [[1, 5], [-1.2, 4.2]] as const) {
    add(new THREE.CylinderGeometry(0.09, 0.09, h, 8), wood, 0, 0.9 + h / 2, z);
    const sail = add(new THREE.BoxGeometry(2.6, h * 0.55, 0.08), flat(0xff4757), 0, 1.2 + h * 0.55, z + 0.15);
    sail.rotation.x = -0.12;
    add(new THREE.BoxGeometry(2.6, 0.22, 0.1), flat(0xffffff), 0, 1.2 + h * 0.55, z + 0.2); // stripe
  }
  const flag = add(new THREE.BoxGeometry(0.04, 0.5, 0.8), dark, 0, 6.1, 0.6);
  flag.castShadow = false;
  return g;
}

export class Fleet {
  readonly group = new THREE.Group();
  readonly events: ShipEvent[] = [];
  sunk = 0;

  private ships: Ship[] = [];
  private balls: Ball[] = [];
  private seaY = 0;
  private cooldown = 0;
  private ballGeo = new THREE.SphereGeometry(0.28, 10, 8);
  private ballMat = new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.5, metalness: 0.3 });

  build(defs: ShipDef[], seaY: number): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== this.ballGeo) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
    this.balls = [];
    this.sunk = 0;
    this.seaY = seaY;
    this.ships = defs.map(([cx, cz, r, speed], i) => {
      const group = makePirateShip();
      this.group.add(group);
      return { group, cx, cz, r, speed, angle: i * 2.1, hp: HITS_TO_SINK, sinkT: 0, awayT: 0 };
    });
  }

  get afloat(): number {
    return this.ships.filter((s) => s.sinkT <= 0 && s.awayT <= 0).length;
  }

  get total(): number {
    return this.ships.length;
  }

  /** The nearest ship that is afloat, within range and roughly ahead of (from, heading). */
  private target(from: THREE.Vector3, heading: number): Ship | null {
    let best: Ship | null = null;
    let bestD = RANGE;
    for (const s of this.ships) {
      if (s.sinkT > 0 || s.awayT > 0) continue;
      const dx = s.group.position.x - from.x, dz = s.group.position.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestD || d < 2) continue;
      // within about 35° of straight ahead
      if ((dx * Math.sin(heading) + dz * Math.cos(heading)) / d < 0.82) continue;
      best = s;
      bestD = d;
    }
    return best;
  }

  /** Fire a cannonball from a boat. Returns false while the cannon is reloading. */
  fire(from: THREE.Vector3, heading: number): boolean {
    if (this.cooldown > 0 || this.ships.length === 0) return false;
    this.cooldown = 0.55;
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.position.set(from.x + Math.sin(heading) * 2, from.y + 1.1, from.z + Math.cos(heading) * 2);
    mesh.castShadow = true;
    this.group.add(mesh);
    const vel = new THREE.Vector3(Math.sin(heading) * BALL_SPEED, 4, Math.cos(heading) * BALL_SPEED);
    const s = this.target(from, heading);
    if (s) {
      // aim where the ship will be when the ball gets there, and lob it to land on the deck
      const d0 = Math.hypot(s.group.position.x - mesh.position.x, s.group.position.z - mesh.position.z);
      const t = d0 / BALL_SPEED;
      const a = s.angle + s.speed * t;
      const tx = s.cx + Math.sin(a) * s.r, tz = s.cz + Math.cos(a) * s.r;
      const dx = tx - mesh.position.x, dz = tz - mesh.position.z;
      const d = Math.hypot(dx, dz) || 1;
      vel.set((dx / d) * BALL_SPEED, (GRAVITY * (d / BALL_SPEED)) / 2 + 0.6, (dz / d) * BALL_SPEED);
    }
    this.balls.push({ mesh, vel });
    return true;
  }

  update(dt: number, t: number): ShipEvent[] {
    const ev = this.events;
    ev.length = 0;
    this.cooldown -= dt;

    for (const s of this.ships) {
      if (s.awayT > 0) {
        s.awayT -= dt;
        if (s.awayT <= 0) {
          s.hp = HITS_TO_SINK;
          s.group.visible = true;
        }
        continue;
      }
      const p = s.group.position;
      if (s.sinkT > 0) {
        s.sinkT -= dt;
        const k = 1 - s.sinkT / SINK_TIME;
        p.y = this.seaY - k * 4;
        s.group.rotation.z = k * 0.9;
        if (Math.random() < dt * 12) ev.push({ type: "splash", x: p.x + (Math.random() - 0.5) * 3, y: this.seaY, z: p.z + (Math.random() - 0.5) * 3 });
        if (s.sinkT <= 0) {
          s.group.visible = false;
          s.awayT = AWAY_TIME;
        }
        continue;
      }
      s.angle += s.speed * dt;
      p.set(s.cx + Math.sin(s.angle) * s.r, this.seaY + Math.sin(t * 1.5 + s.cx) * 0.08, s.cz + Math.cos(s.angle) * s.r);
      // face along the circle (the way it is sailing)
      s.group.rotation.set(0, s.angle + (s.speed >= 0 ? Math.PI / 2 : -Math.PI / 2), Math.sin(t * 1.1 + s.cz) * 0.05);
    }

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.vel.y -= GRAVITY * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;
      let done = false;
      for (const s of this.ships) {
        if (s.sinkT > 0 || s.awayT > 0) continue;
        const dx = p.x - s.group.position.x, dz = p.z - s.group.position.z;
        if (dx * dx + dz * dz < 3.1 * 3.1 && p.y < this.seaY + 4.5) {
          s.hp--;
          done = true;
          if (s.hp <= 0) {
            s.sinkT = SINK_TIME;
            this.sunk++;
            ev.push({ type: "sink", x: s.group.position.x, y: this.seaY + 1, z: s.group.position.z });
          } else {
            ev.push({ type: "hit", x: p.x, y: p.y, z: p.z });
          }
          break;
        }
      }
      if (!done && p.y < this.seaY) {
        ev.push({ type: "splash", x: p.x, y: this.seaY, z: p.z });
        done = true;
      }
      if (done) {
        this.group.remove(b.mesh);
        this.balls.splice(i, 1);
      }
    }
    return ev;
  }

  dispose(): void {
    this.ballGeo.dispose();
    this.ballMat.dispose();
  }
}
