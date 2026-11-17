/**
 * lambs.ts — "The Lost Lambs", a search-and-rescue quest on Adventure Island (after Luke 15:4–6).
 *
 * Shepherd Sam has lost three lambs. He gives one clue at a time; each lamb is hidden behind a
 * little problem the kid has to work out:
 *
 *   Snowy  — hiding in one of the bushes in the west woods. Search the bushes (E): the empty ones
 *            say whether the "baa" sounds closer or farther away.
 *   Pebble — fell into the old well on Pine Island. Turn the crank (E) three times to raise the bucket.
 *   Clover — stuck on the roof of the blue house in the village. Find a way up (the trampoline!).
 *
 * Little hoofprints lead toward every hiding place, and a lost lamb bleats when a kid comes near.
 * A found lamb follows the kid home to the pen beside the shepherd. Found lambs are saved, so the
 * quest picks up where it was left.
 */

import * as THREE from "three";

export type LambName = "Snowy" | "Pebble" | "Clover";

interface LambDef {
  name: LambName;
  /** Where the lamb is hidden; y (if given) is the height to look down from (a roof). */
  x: number; z: number; y?: number;
  /** The shepherd's clue. */
  clue: string;
  /** Hoofprints: from (fx, fz) toward the hiding place. */
  fx: number; fz: number;
}

/** The shepherd and his pen. */
export const SHEPHERD = { x: 4, z: -9 };
const PEN = { x: 7, z: -11, r: 2.1 };

const LAMBS: LambDef[] = [
  {
    name: "Snowy", x: -26.5, z: -20.5, fx: -15, fz: -14,
    clue: "Snowy loves hide-and-seek! She ran into the little woods west of here, past Farmer Fern's field. Look for her hoofprints, then search the bushes. Listen for a 'baa'!",
  },
  {
    name: "Pebble", x: -65, z: -69.5, fx: -50, fz: -50,
    clue: "Keeper Kai saw Pebble trotting along the sandy path to Pine Island. There's an old well by the cabin there… oh dear, I hope she didn't fall in!",
  },
  {
    name: "Clover", x: 23.8, z: -17.6, y: 30, fx: 17, fz: -15,
    clue: "Clover is a jumper! Grandma Gigi heard a 'baa' from up high in the village, near the blue house. How could a lamb get way up there? Maybe a bouncy something can take you up too!",
  },
];

/** The bushes in the west woods; Snowy hides in the one at index SNOWY_BUSH. */
const BUSHES: [number, number][] = [[-21.5, -15], [-27, -15.5], [-21, -21.5], [-26.5, -20.5], [-24, -23.5]];
const SNOWY_BUSH = 3;
const WELL = { x: -65, z: -69.5 };

type LambState = "lost" | "found" | "home";

interface Bush {
  pos: THREE.Vector3;
  mesh: THREE.Object3D;
  searched: boolean;
  shakeT: number;
}

interface Lamb {
  def: LambDef;
  state: LambState;
  mesh: THREE.Group;
  legs: THREE.Object3D[];
  heading: number;
  phase: number;
  bleatT: number;
  /** Shown once its puzzle is solved (Snowy and Pebble start out of sight). */
  out: boolean;
}

export interface QuestAction {
  label: string;
  icon: string;
  /** Do it; returns what the game should say/do. */
  act(): QuestEvent[];
}

export type QuestEvent =
  | { type: "say"; text: string }
  | { type: "toast"; text: string }
  | { type: "sfx"; id: "baa" | "rustle" | "ui" | "chest" | "powerup" | "win" | "checkpoint" }
  | { type: "burst"; x: number; y: number; z: number; color: number }
  | { type: "found"; name: LambName }
  | { type: "home"; name: LambName; left: number };

export class LostLambs {
  readonly group = new THREE.Group();
  private lambs: Lamb[] = [];
  private bushes: Bush[] = [];
  private well: { pos: THREE.Vector3; crank: THREE.Object3D; rope: THREE.Mesh; bucket: THREE.Object3D; turns: number; spin: number } | null = null;
  private active = false;
  private startedAt = false;

  constructor(
    private readonly ground: (x: number, z: number, refY: number) => number,
    private readonly save: (found: LambName[]) => void,
  ) {}

  /** Set up for a level: only Adventure Island has the quest. `home` = lambs already brought back. */
  build(level: string, home: LambName[]): void {
    this.clear();
    this.active = level === "Adventure Island";
    if (!this.active) return;
    this.startedAt = home.length > 0;
    this.buildPen();
    for (const def of LAMBS) {
      const done = home.includes(def.name);
      const lamb = this.makeLamb(def);
      lamb.state = done ? "home" : "lost";
      if (done) this.placeInPen(lamb, LAMBS.indexOf(def));
      else {
        const y = this.ground(def.x, def.z, def.y ?? 3);
        lamb.mesh.position.set(def.x, y, def.z);
        lamb.out = def.name === "Clover";
        lamb.mesh.visible = lamb.out;
        this.hoofprints(def);
      }
      this.lambs.push(lamb);
    }
    this.buildBushes();
    this.buildWell(home.includes("Pebble"));
  }

  clear(): void {
    this.group.clear();
    this.lambs = [];
    this.bushes = [];
    this.well = null;
    this.active = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** How many lambs are back in the pen. */
  get homeCount(): number {
    return this.lambs.filter((l) => l.state === "home").length;
  }

  /** The HUD line while the quest is on (null when done or not here). */
  label(): string | null {
    if (!this.active || !this.startedAt) return null;
    const following = this.lambs.find((l) => l.state === "found");
    if (following) return `🐑 Lead ${following.def.name} back to Shepherd Sam's pen!`;
    const left = this.lambs.filter((l) => l.state !== "home").length;
    if (left === 0) return null;
    return `🐑 Lost lambs found: ${3 - left} of 3 · ask Shepherd Sam for a clue`;
  }

  /** What Shepherd Sam says. */
  shepherd(): string {
    this.startedAt = true;
    const following = this.lambs.find((l) => l.state === "found");
    if (following) return `You found ${following.def.name}! Bring her here to the pen. She'll follow you.`;
    const next = this.lambs.find((l) => l.state === "lost");
    const home = this.homeCount;
    if (!next) return "All my lambs are safe! \"Rejoice with me; for I have found my sheep which was lost.\" (Luke 15:6) Thank you, friend! 🐑";
    const start = home === 0 ? "Oh, I'm so glad you're here! I had my little flock, and three lambs wandered off. Will you help me find them? " : `${home} of 3 home! `;
    return `${start}Here's a clue: ${next.def.clue}`;
  }

  /** The quest thing within reach of a kid, if any. */
  actionNear(pos: THREE.Vector3): QuestAction | null {
    if (!this.active) return null;
    for (const lamb of this.lambs) {
      if (lamb.state !== "lost" || !lamb.out) continue;
      if (lamb.mesh.position.distanceTo(pos) < 1.6) return { label: `Help ${lamb.def.name}`, icon: "🐑", act: () => this.find(lamb, pos) };
    }
    for (const b of this.bushes) {
      if (b.searched || Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) > 1.8 || Math.abs(b.pos.y - pos.y) > 1.5) continue;
      return { label: "Search the bush", icon: "🌿", act: () => this.search(b, pos) };
    }
    const w = this.well;
    if (w && w.turns < 3 && Math.hypot(w.pos.x - pos.x, w.pos.z - pos.z) < 2.2) {
      return { label: w.turns === 0 ? "Turn the well crank" : "Keep turning!", icon: "🪣", act: () => this.crank(pos) };
    }
    return null;
  }

  private search(b: Bush, pos: THREE.Vector3): QuestEvent[] {
    b.searched = true;
    b.shakeT = 0.6;
    const ev: QuestEvent[] = [{ type: "sfx", id: "rustle" }, { type: "burst", x: b.pos.x, y: b.pos.y + 0.7, z: b.pos.z, color: 0x5fbf4a }];
    const snowy = this.lambs.find((l) => l.def.name === "Snowy");
    if (this.bushes.indexOf(b) === SNOWY_BUSH && snowy && snowy.state === "lost") {
      snowy.out = true;
      snowy.mesh.visible = true;
      snowy.mesh.position.set(b.pos.x + 0.9, b.pos.y, b.pos.z + 0.6);
      ev.push({ type: "sfx", id: "baa" }, ...this.find(snowy, pos));
      return ev;
    }
    if (!snowy || snowy.state !== "lost") {
      ev.push({ type: "toast", text: "Just leaves and a ladybug 🐞" });
      return ev;
    }
    // hot or cold: is the hidden bush nearer than this one?
    const hid = this.bushes[SNOWY_BUSH].pos;
    const d = Math.hypot(hid.x - b.pos.x, hid.z - b.pos.z);
    ev.push({ type: "sfx", id: "baa" }, {
      type: "toast",
      text: d < 4.5 ? "Not here… but that 'baa' sounds really close now! 🔥" : "Not here. The 'baa' sounds a little farther away… try another bush ❄️",
    });
    return ev;
  }

  private crank(pos: THREE.Vector3): QuestEvent[] {
    const w = this.well!;
    w.turns++;
    w.spin = 1;
    const ev: QuestEvent[] = [{ type: "sfx", id: "ui" }];
    if (w.turns < 3) {
      ev.push({ type: "sfx", id: "baa" }, { type: "toast", text: w.turns === 1 ? "Creak… something says 'baa' from down in the well! Keep turning!" : "Almost up! One more turn! 🪣" });
      return ev;
    }
    const pebble = this.lambs.find((l) => l.def.name === "Pebble");
    if (pebble && pebble.state === "lost") {
      pebble.out = true;
      pebble.mesh.visible = true;
      pebble.mesh.position.set(w.pos.x + 1.2, this.ground(w.pos.x + 1.2, w.pos.z, w.pos.y + 1), w.pos.z);
      ev.push({ type: "sfx", id: "baa" }, { type: "burst", x: w.pos.x, y: w.pos.y + 1.2, z: w.pos.z, color: 0xffffff }, ...this.find(pebble, pos));
    }
    return ev;
  }

  private find(lamb: Lamb, _kid: THREE.Vector3): QuestEvent[] {
    lamb.state = "found";
    lamb.out = true;
    lamb.mesh.visible = true;
    const p = lamb.mesh.position;
    return [
      { type: "sfx", id: "chest" },
      { type: "burst", x: p.x, y: p.y + 0.8, z: p.z, color: 0xffd93d },
      { type: "found", name: lamb.def.name },
      { type: "toast", text: `You found ${lamb.def.name}! 🐑 She'll follow you. Lead her home to Shepherd Sam!` },
    ];
  }

  /** Lambs bleat, wiggle, follow their kid and go into the pen. `kids` are the players' positions. */
  update(dt: number, kids: THREE.Vector3[]): QuestEvent[] {
    if (!this.active) return [];
    const ev: QuestEvent[] = [];
    for (const lamb of this.lambs) {
      const m = lamb.mesh, p = m.position;
      lamb.phase += dt;
      if (lamb.state === "lost") {
        // bleat when a kid is getting close (a clue you can hear)
        const near = kids.some((k) => k.distanceTo(p) < 14);
        lamb.bleatT -= dt;
        if (near && lamb.bleatT <= 0) {
          lamb.bleatT = 3.5 + Math.random() * 2;
          ev.push({ type: "sfx", id: "baa" });
          if (lamb.out) ev.push({ type: "burst", x: p.x, y: p.y + 1, z: p.z, color: 0xffffff });
        }
        this.legsStill(lamb);
        m.rotation.z = Math.sin(lamb.phase * 3) * 0.04;
        continue;
      }
      if (lamb.state === "found" && kids.length) {
        // follow the nearest kid, a step behind
        let k = kids[0];
        for (const o of kids) if (o.distanceToSquared(p) < k.distanceToSquared(p)) k = o;
        const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz);
        const gy = this.ground(p.x, p.z, p.y + 0.5);
        if (d > 25) {
          // left far behind (a boat ride): catch up by magic hop
          p.set(k.x - 1, this.ground(k.x - 1, k.z, k.y + 1), k.z);
        } else if (d > 1.3) {
          const v = Math.min(7, d * 2.2);
          p.x += (dx / d) * v * dt;
          p.z += (dz / d) * v * dt;
          lamb.heading = Math.atan2(dx, dz);
          this.legsWalk(lamb, v);
        } else this.legsStill(lamb);
        // fall off roofs and step up hills
        p.y = p.y > gy + 0.05 ? Math.max(gy, p.y - dt * 9) : gy;
        m.rotation.y = lamb.heading;
        // home!
        if (Math.hypot(p.x - PEN.x, p.z - PEN.z) < PEN.r + 2.6) {
          lamb.state = "home";
          this.placeInPen(lamb, LAMBS.indexOf(lamb.def));
          const left = this.lambs.filter((l) => l.state !== "home").length;
          this.save(this.lambs.filter((l) => l.state === "home").map((l) => l.def.name));
          ev.push({ type: "home", name: lamb.def.name, left }, { type: "burst", x: PEN.x, y: 1.4, z: PEN.z, color: 0xffd93d });
        }
        continue;
      }
      // home: graze and wander a little in the pen
      const i = LAMBS.indexOf(lamb.def);
      const a = lamb.phase * 0.25 + i * 2.1;
      const tx = PEN.x + Math.cos(a) * PEN.r * 0.5, tz = PEN.z + Math.sin(a) * PEN.r * 0.5;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        p.x += (dx / d) * Math.min(d, dt * 0.6);
        p.z += (dz / d) * Math.min(d, dt * 0.6);
        lamb.heading = Math.atan2(dx, dz);
        this.legsWalk(lamb, 0.6);
      }
      m.rotation.y = lamb.heading;
    }
    for (const b of this.bushes) {
      if (b.shakeT > 0) {
        b.shakeT = Math.max(0, b.shakeT - dt);
        b.mesh.rotation.z = Math.sin(b.shakeT * 40) * 0.12 * b.shakeT;
      }
    }
    const w = this.well;
    if (w && w.spin > 0) {
      w.spin = Math.max(0, w.spin - dt);
      w.crank.rotation.x += dt * 9;
      // the bucket comes up a third of the way per turn
      const target = 0.35 + (Math.min(3, w.turns) / 3) * 0.95;
      w.bucket.position.y += (target - w.bucket.position.y) * Math.min(1, dt * 3);
      w.rope.scale.y = Math.max(0.05, (1.55 - w.bucket.position.y) / 1.2);
      w.rope.position.y = 1.55 - (1.55 - w.bucket.position.y) / 2;
    }
    return ev;
  }

  // ── models ────────────────────────────────────────────────────────────────

  /** A fluffy cartoon lamb about knee high to a kid: woolly puffs, a dark face and legs. */
  private makeLamb(def: LambDef): Lamb {
    const g = new THREE.Group();
    const wool = new THREE.MeshStandardMaterial({ color: 0xfbf8f2, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b3238, roughness: 0.8 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xffb3c6, roughness: 0.8 });
    const puff = new THREE.IcosahedronGeometry(0.2, 1);
    const body = new THREE.Group();
    body.position.y = 0.42;
    for (const [x, y, z, s] of [[0, 0, 0, 1.25], [0, 0.07, 0.18, 1], [0, 0.07, -0.18, 1], [0.13, 0.03, 0, 0.95], [-0.13, 0.03, 0, 0.95], [0, 0.15, 0, 0.9], [0, 0, -0.3, 0.7]] as const) {
      const m = new THREE.Mesh(puff, wool);
      m.position.set(x, y, z);
      m.scale.setScalar(s);
      m.castShadow = true;
      body.add(m);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.2, 0.34);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), dark);
    face.scale.set(0.9, 1, 1.15);
    const tuft = new THREE.Mesh(puff, wool);
    tuft.scale.setScalar(0.55);
    tuft.position.set(0, 0.12, -0.02);
    const eyeW = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark);
      ear.scale.set(1.6, 0.6, 0.9);
      ear.position.set(sx * 0.15, 0.04, -0.03);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), pink);
      inner.scale.set(1.5, 0.5, 0.5);
      inner.position.set(sx * 0.16, 0.04, 0.0);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeW);
      eye.position.set(sx * 0.06, 0.04, 0.11);
      head.add(ear, inner, eye);
    }
    head.add(face, tuft);
    body.add(head);
    g.add(body);
    const legs: THREE.Object3D[] = [];
    const legGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.3, 6).translate(0, -0.15, 0);
    for (const [x, z] of [[0.09, 0.16], [-0.09, 0.16], [0.09, -0.18], [-0.09, -0.18]]) {
      const leg = new THREE.Mesh(legGeo, dark);
      leg.position.set(x, 0.3, z);
      g.add(leg);
      legs.push(leg);
    }
    // a little name bell on a ribbon
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd93d, metalness: 0.6, roughness: 0.3 }));
    bell.position.set(0, 0.48, 0.32);
    g.add(bell);
    this.group.add(g);
    return { def, state: "lost", mesh: g, legs, heading: Math.random() * 6, phase: Math.random() * 5, bleatT: 0, out: true };
  }

  private legsWalk(l: Lamb, v: number): void {
    const s = Math.sin(l.phase * (6 + v * 2)) * 0.6;
    l.legs.forEach((leg, i) => (leg.rotation.x = (i === 0 || i === 3 ? s : -s)));
  }

  private legsStill(l: Lamb): void {
    for (const leg of l.legs) leg.rotation.x *= 0.8;
  }

  private placeInPen(l: Lamb, i: number): void {
    const a = i * 2.1;
    const x = PEN.x + Math.cos(a) * PEN.r * 0.5, z = PEN.z + Math.sin(a) * PEN.r * 0.5;
    l.mesh.position.set(x, this.ground(x, z, 2), z);
    l.mesh.visible = true;
    l.out = true;
  }

  /** A round wooden pen with a gate gap facing the shepherd. */
  private buildPen(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0xa0703f, roughness: 0.9 });
    const y = this.ground(PEN.x, PEN.z, 2);
    const n = 14;
    const gap = Math.atan2(SHEPHERD.z - PEN.z, SHEPHERD.x - PEN.x);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let da = a - gap;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 0.35) continue; // the opening
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), wood);
      post.position.set(PEN.x + Math.cos(a) * PEN.r, y + 0.4, PEN.z + Math.sin(a) * PEN.r);
      post.castShadow = true;
      this.group.add(post);
      const b = ((i + 1) / n) * Math.PI * 2;
      let db = b - gap;
      while (db > Math.PI) db -= Math.PI * 2;
      while (db < -Math.PI) db += Math.PI * 2;
      if (Math.abs(db) < 0.35) continue;
      const mx = PEN.x + Math.cos((a + b) / 2) * PEN.r * Math.cos(Math.PI / n), mz = PEN.z + Math.sin((a + b) / 2) * PEN.r * Math.cos(Math.PI / n);
      const len = 2 * PEN.r * Math.sin(Math.PI / n);
      for (const h of [0.3, 0.62]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.05), wood);
        rail.position.set(mx, y + h, mz);
        rail.rotation.y = -((a + b) / 2) + Math.PI / 2;
        this.group.add(rail);
      }
    }
    // a hay pile and a water trough inside
    const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.45, 9), new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 1 }));
    hay.position.set(PEN.x + 0.7, y + 0.22, PEN.z - 0.9);
    this.group.add(hay);
    // a sign: "Lost lambs"
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.06), new THREE.MeshStandardMaterial({ map: signTexture("🐑 Lost lambs? Ask me!"), roughness: 0.8 }));
    sign.position.set(SHEPHERD.x - 1.2, this.ground(SHEPHERD.x, SHEPHERD.z, 2) + 1.3, SHEPHERD.z - 0.4);
    sign.rotation.y = 0.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), wood);
    pole.position.set(sign.position.x, sign.position.y - 0.6, sign.position.z - 0.04);
    this.group.add(sign, pole);
  }

  /** Small dark hoofprints leading toward a hiding place (the last stretch only). */
  private hoofprints(def: LambDef): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0x4a3a2a, transparent: true, opacity: 0.55, depthWrite: false });
    const geo = new THREE.CircleGeometry(0.07, 8).rotateX(-Math.PI / 2);
    const dx = def.x - def.fx, dz = def.z - def.fz, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const stop = def.y !== undefined ? 3.5 : 1.8; // a roof: the prints end at the trampoline side
    for (let s = 0; s < len - stop; s += 0.55) {
      const side = (Math.floor(s / 0.55) % 2 ? 1 : -1) * 0.09;
      for (const half of [-0.06, 0.06]) {
        const x = def.fx + ux * s - uz * side + ux * half, z = def.fz + uz * s + ux * side + uz * half;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, this.ground(x, z, 2) + 0.025, z);
        this.group.add(m);
      }
    }
  }

  private buildBushes(): void {
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f9a3a, roughness: 0.95 });
    const leaf2 = new THREE.MeshStandardMaterial({ color: 0x57b247, roughness: 0.95 });
    const geo = new THREE.IcosahedronGeometry(0.55, 1);
    for (const [x, z] of BUSHES) {
      const y = this.ground(x, z, 2);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      for (const [ox, oy, oz, s, m] of [[0, 0.5, 0, 1.2, leaf], [0.45, 0.4, 0.2, 0.9, leaf2], [-0.4, 0.42, -0.15, 0.95, leaf2], [0.1, 0.85, -0.1, 0.8, leaf]] as const) {
        const b = new THREE.Mesh(geo, m);
        b.position.set(ox, oy, oz);
        b.scale.setScalar(s);
        b.castShadow = true;
        g.add(b);
      }
      this.group.add(g);
      this.bushes.push({ pos: new THREE.Vector3(x, y, z), mesh: g, searched: false, shakeT: 0 });
    }
  }

  /** An old stone well with a roof, a crank and a bucket on a rope. */
  private buildWell(done: boolean): void {
    const y = this.ground(WELL.x, WELL.z, 2);
    const g = new THREE.Group();
    g.position.set(WELL.x, y, WELL.z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.95 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.8, 16, 1, true), stone);
    ring.position.y = 0.4;
    (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 6, 18).rotateX(Math.PI / 2), stone);
    rim.position.y = 0.8;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.2 }));
    water.position.y = 0.15;
    g.add(ring, rim, water);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), wood);
      post.position.set(sx * 0.95, 0.95, 0);
      g.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.7, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }));
    roof.position.y = 2.2;
    roof.castShadow = true;
    g.add(roof);
    const crank = new THREE.Group();
    crank.position.set(0, 1.6, 0);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 8).rotateZ(Math.PI / 2), wood);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), wood);
    handle.position.set(1.1, -0.18, 0);
    crank.add(axle, handle);
    g.add(crank);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), new THREE.MeshStandardMaterial({ color: 0xd8c39a }));
    rope.position.y = 0.95;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.26, 10), wood);
    bucket.position.y = done ? 1.3 : 0.35;
    g.add(rope, bucket);
    this.group.add(g);
    this.well = { pos: new THREE.Vector3(WELL.x, y, WELL.z), crank, rope, bucket, turns: done ? 3 : 0, spin: done ? 0.01 : 0 };
  }
}

function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 104;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f6e7c8";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#8a5a33";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
  ctx.fillStyle = "#5e3b1f";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
