/**
 * quests.ts — "find what was lost" quests, one per big world (the data is in questdata.ts).
 *
 * A villager has lost three things (lambs, kittens, doves, sheep, cargo, coins). They give one clue
 * at a time, and each lost thing is behind a little problem the kid works out:
 *
 *   search — one of several bushes / crates / sand mounds / dusty corners / trees hides it. Every
 *            empty one says whether you are getting warmer 🔥 or colder ❄️.
 *   crank  — it fell down a well: turn the crank three times to bring the bucket up.
 *   reach  — it's somewhere hard to get to (a roof, an islet, the top of a slide): find a way there.
 *   chase  — it runs off when you come near, but it gets tired: catch it!
 *
 * Trails (hoofprints, paw prints, feathers, drag marks) lead toward each hiding place, and lost
 * animals call out when a kid comes near. Found animals follow the kid home; found things are
 * carried overhead. What's been brought home is saved, so a quest picks up where it was left.
 */

import * as THREE from "three";

export type FindModel = "lamb" | "sheep" | "kitten" | "dove" | "crate" | "coin";
export type SearchLook = "bush" | "crate" | "mound" | "dust" | "tree";
export type HomeLook = "pen" | "basket" | "dovecote" | "pallet" | "table";

export type Puzzle =
  | { t: "search"; look: SearchLook; spots: [number, number][]; hidden: number; refY?: number }
  /** Trees: the `count` trees nearest to (x, z) are the spots; it hides in the `hidden`-th nearest. */
  | { t: "trees"; x: number; z: number; count: number; hidden: number }
  | { t: "crank"; x: number; z: number }
  /** Sits at (x, z) on whatever is under refY (a roof: give a high refY). */
  | { t: "reach"; x: number; z: number; refY?: number }
  | { t: "chase"; x: number; z: number; r: number };

export interface FindDef {
  name: string;
  /** "her" / "him" / "it", for the lines. */
  pronoun: "her" | "him" | "it";
  clue: string;
  puzzle: Puzzle;
  /** A trail from (x, z) toward the hiding place. */
  trail?: [number, number];
}

export interface QuestDef {
  id: string;
  level: string;
  /** The villager who asks for help (their NpcDef has `quest: id`). */
  giver: string;
  title: string;
  emoji: string;
  model: FindModel;
  /** "lamb", "kitten"… for the lines. */
  noun: string;
  home: { x: number; z: number; look: HomeLook; sign: string };
  intro: string;
  finale: string;
  finds: FindDef[];
}

type State = "lost" | "found" | "home";

interface Find {
  def: FindDef;
  state: State;
  mesh: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  heading: number;
  phase: number;
  callT: number;
  /** In sight yet? (search and crank finds stay hidden until their puzzle is solved). */
  out: boolean;
  /** chase: running, resting, and how many dashes it has left in it. */
  dashT: number;
  restT: number;
  dashes: number;
}

interface Spot {
  pos: THREE.Vector3;
  mesh: THREE.Object3D | null;
  searched: boolean;
  shakeT: number;
  find: Find;
  hidden: boolean;
  look: SearchLook;
}

export interface QuestAction {
  label: string;
  icon: string;
  act(): QuestEvent[];
}

export type QuestEvent =
  | { type: "say"; who: string; text: string }
  | { type: "toast"; text: string }
  | { type: "sfx"; id: "baa" | "meow" | "coo" | "rustle" | "dig" | "ui" | "chest" | "coin" | "win" }
  | { type: "burst"; x: number; y: number; z: number; color: number }
  | { type: "reward"; coins: number; score: number }
  | { type: "complete"; title: string };

const CALL: Record<FindModel, "baa" | "meow" | "coo" | "coin"> = { lamb: "baa", sheep: "baa", kitten: "meow", dove: "coo", crate: "coin", coin: "coin" };
const HEARD: Record<FindModel, string> = { lamb: "'baa'", sheep: "'baa'", kitten: "'meow'", dove: "'coo'", crate: "glint", coin: "glint" };
const SEARCH_VERB: Record<SearchLook, [string, string]> = {
  bush: ["Search the bush", "🌿"], crate: ["Look in the crate", "📦"], mound: ["Dig in the sand", "🏖️"],
  dust: ["Sweep here", "🧹"], tree: ["Look up in the tree", "🌳"],
};
const carried = (m: FindModel) => m === "crate" || m === "coin";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export class Quests {
  readonly group = new THREE.Group();
  private def: QuestDef | null = null;
  private finds: Find[] = [];
  private spots: Spot[] = [];
  private well: { pos: THREE.Vector3; crank: THREE.Object3D; rope: THREE.Mesh; bucket: THREE.Object3D; turns: number; spin: number; find: Find } | null = null;
  private started = false;

  constructor(
    private readonly ground: (x: number, z: number, refY: number) => number,
    private readonly load: (id: string) => string[],
    private readonly save: (id: string, home: string[]) => void,
  ) {}

  /** Set up for a level. `trees` are the level's tree spots (for tree searches). */
  build(defs: QuestDef[], level: string, trees: { x: number; y: number; z: number }[]): void {
    this.clear();
    const def = defs.find((d) => d.level === level);
    if (!def) return;
    this.def = def;
    const home = this.load(def.id);
    this.started = home.length > 0;
    this.buildHome();
    def.finds.forEach((fd, i) => {
      const f = this.makeFind(fd, def.model);
      this.finds.push(f);
      if (home.includes(fd.name)) {
        f.state = "home";
        this.placeHome(f, i);
        return;
      }
      const p = fd.puzzle;
      if (fd.trail) this.trail(fd, p);
      if (p.t === "search") {
        p.spots.forEach(([x, z], k) => this.addSpot(x, this.ground(x, z, p.refY ?? 3), z, p.look, f, k === p.hidden));
        f.out = false;
      } else if (p.t === "trees") {
        const near = [...trees].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, p.count);
        near.forEach((t, k) => this.addSpot(t.x, t.y, t.z, "tree", f, k === Math.min(p.hidden, near.length - 1)));
        f.out = false;
      } else if (p.t === "crank") {
        this.buildWell(p.x, p.z, f);
        f.out = false;
      } else {
        f.mesh.position.set(p.x, this.ground(p.x, p.z, p.t === "reach" ? p.refY ?? 3 : 3), p.z);
      }
      f.mesh.visible = f.out;
    });
  }

  clear(): void {
    this.group.clear();
    this.def = null;
    this.finds = [];
    this.spots = [];
    this.well = null;
  }

  get isActive(): boolean {
    return this.def !== null;
  }

  get giver(): string | null {
    return this.def?.giver ?? null;
  }

  get homeCount(): number {
    return this.finds.filter((f) => f.state === "home").length;
  }

  /** For tests: where to go for the next lost thing (spots to search, the well, or the thing itself), and home. */
  debugTargets(): { what: string; x: number; y: number; z: number }[] {
    const f = this.finds.find((o) => o.state === "lost");
    if (!f || !this.def) return [];
    const out: { what: string; x: number; y: number; z: number }[] = [];
    for (const s of this.spots) if (s.find === f && !s.searched) out.push({ what: s.look, x: s.pos.x, y: s.pos.y, z: s.pos.z });
    if (this.well && this.well.find === f) out.push({ what: "well", x: this.well.pos.x, y: this.well.pos.y, z: this.well.pos.z });
    if (f.out) out.push({ what: f.def.puzzle.t, x: f.mesh.position.x, y: f.mesh.position.y, z: f.mesh.position.z });
    return out;
  }

  get homeSpot(): { x: number; z: number } | null {
    return this.def ? { x: this.def.home.x, z: this.def.home.z } : null;
  }

  /** The HUD line while the quest is on (null when finished, or before the giver has been met). */
  label(): string | null {
    const d = this.def;
    if (!d || !this.started) return null;
    const with_ = this.finds.find((f) => f.state === "found");
    if (with_) return `${d.emoji} Bring ${with_.def.name} back to ${d.giver}!`;
    const n = this.homeCount;
    if (n === this.finds.length) return null;
    return `${d.emoji} ${d.title}: ${n} of ${this.finds.length} found · ask ${d.giver} for a clue`;
  }

  /** What the quest giver says when a kid talks to them (null once it's all done: their own lines). */
  talk(): string | null {
    const d = this.def!;
    if (this.homeCount === this.finds.length && this.started) return null;
    this.started = true;
    const with_ = this.finds.find((f) => f.state === "found");
    if (with_) return carried(d.model)
      ? `You found ${with_.def.name}! Bring ${with_.def.pronoun} right here to me, please.`
      : `You found ${with_.def.name}! Bring ${with_.def.pronoun} home. ${with_.def.pronoun === "him" ? "He" : "She"}'ll follow you.`;
    const next = this.finds.find((f) => f.state === "lost");
    if (!next) return d.finale;
    const n = this.homeCount;
    return `${n === 0 ? d.intro + " " : `${n} of ${this.finds.length} found! `}Here's a clue: ${next.def.clue}`;
  }

  /** The quest thing a kid at pos can do something with, if any. */
  actionNear(pos: THREE.Vector3): QuestAction | null {
    const d = this.def;
    if (!d) return null;
    for (const f of this.finds) {
      if (f.state !== "lost" || !f.out) continue;
      const p = f.mesh.position;
      if (Math.hypot(p.x - pos.x, p.z - pos.z) < (f.def.puzzle.t === "chase" ? 1.5 : 1.7) && Math.abs(p.y - pos.y) < 1.6) {
        const verb = f.def.puzzle.t === "chase" ? "Catch" : carried(d.model) ? "Pick up" : "Help";
        return { label: `${verb} ${f.def.name}`, icon: d.emoji, act: () => this.found(f) };
      }
    }
    for (const s of this.spots) {
      if (s.searched || s.find.state !== "lost") continue;
      const reach = s.look === "tree" ? 1.9 : 1.6;
      if (Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) > reach || Math.abs(s.pos.y - pos.y) > 1.6) continue;
      const [label, icon] = SEARCH_VERB[s.look];
      return { label, icon, act: () => this.search(s) };
    }
    const w = this.well;
    if (w && w.turns < 3 && w.find.state === "lost" && Math.hypot(w.pos.x - pos.x, w.pos.z - pos.z) < 2.2) {
      return { label: w.turns === 0 ? "Turn the well crank" : "Keep turning!", icon: "🪣", act: () => this.crank() };
    }
    return null;
  }

  private search(s: Spot): QuestEvent[] {
    const d = this.def!;
    s.searched = true;
    s.shakeT = 0.6;
    const sound = s.look === "mound" || s.look === "dust" ? "dig" : "rustle";
    const colour = s.look === "mound" ? 0xf2d49b : s.look === "dust" ? 0xd9d2c5 : s.look === "crate" ? 0xc79a5f : 0x5fbf4a;
    const ev: QuestEvent[] = [{ type: "sfx", id: sound }, { type: "burst", x: s.pos.x, y: s.pos.y + (s.look === "tree" ? 2.4 : 0.6), z: s.pos.z, color: colour }];
    if (s.look === "mound" || s.look === "dust") s.mesh && (s.mesh.scale.y = 0.35);
    const f = s.find;
    if (s.hidden) {
      f.out = true;
      f.mesh.visible = true;
      f.mesh.position.set(s.pos.x + 0.8, this.ground(s.pos.x + 0.8, s.pos.z + 0.5, s.pos.y + 1), s.pos.z + 0.5);
      return [...ev, ...this.found(f)];
    }
    // warmer or colder: is the right spot near this one?
    const hid = this.spots.find((o) => o.find === f && o.hidden)!;
    const dist = Math.hypot(hid.pos.x - s.pos.x, hid.pos.z - s.pos.z);
    const heard = HEARD[d.model];
    const what = s.look === "tree" ? "Just leaves up here" : s.look === "mound" ? "Only sand and a shell 🐚" : s.look === "dust" ? "Just dust" : s.look === "crate" ? "Empty" : "Not in this bush";
    ev.push({ type: "sfx", id: CALL[d.model] === "coin" ? "ui" : CALL[d.model] }, {
      type: "toast",
      text: dist < 4.5
        ? `${what}… but you're getting warmer! 🔥 The ${heard} is really close now!`
        : `${what}. Getting colder… ❄️ Try somewhere else!`,
    });
    return ev;
  }

  private crank(): QuestEvent[] {
    const w = this.well!;
    w.turns++;
    w.spin = 1;
    const ev: QuestEvent[] = [{ type: "sfx", id: "ui" }];
    if (w.turns < 3) {
      const call = CALL[this.def!.model];
      if (call !== "coin") ev.push({ type: "sfx", id: call });
      ev.push({ type: "toast", text: w.turns === 1 ? "Creak… something is down in the well! Keep turning!" : "Almost up! One more turn! 🪣" });
      return ev;
    }
    const f = w.find;
    f.out = true;
    f.mesh.visible = true;
    f.mesh.position.set(w.pos.x + 1.2, this.ground(w.pos.x + 1.2, w.pos.z, w.pos.y + 1), w.pos.z);
    return [...ev, { type: "burst", x: w.pos.x, y: w.pos.y + 1.2, z: w.pos.z, color: 0xffffff }, ...this.found(f)];
  }

  private found(f: Find): QuestEvent[] {
    const d = this.def!;
    f.state = "found";
    f.out = true;
    f.mesh.visible = true;
    const p = f.mesh.position;
    const call = CALL[d.model];
    return [
      { type: "sfx", id: "chest" },
      ...(call !== "coin" ? [{ type: "sfx", id: call } as QuestEvent] : []),
      { type: "burst", x: p.x, y: p.y + 0.8, z: p.z, color: 0xffd93d },
      { type: "reward", coins: 0, score: 50 },
      { type: "toast", text: carried(d.model)
        ? `You found ${f.def.name}! ${d.emoji} Carry it back to ${d.giver}!`
        : `You found ${f.def.name}! ${d.emoji} ${f.def.pronoun === "him" ? "He" : "She"}'ll follow you. Lead ${f.def.pronoun} home to ${d.giver}!` },
    ];
  }

  /** Lost things call out, run off (chase) or wait; found ones follow their kid home. */
  update(dt: number, kids: THREE.Vector3[]): QuestEvent[] {
    const d = this.def;
    if (!d) return [];
    const ev: QuestEvent[] = [];
    const hx = d.home.x, hz = d.home.z;
    for (const f of this.finds) {
      const m = f.mesh, p = m.position;
      f.phase += dt;
      this.flap(f, dt);
      if (f.state === "lost") {
        // call out when a kid is getting close (a clue you can hear, or a glint you can see)
        f.callT -= dt;
        const near = kids.some((k) => k.distanceTo(p) < 14);
        if (near && f.callT <= 0) {
          f.callT = 3.5 + Math.random() * 2;
          const call = CALL[d.model];
          if (call !== "coin") ev.push({ type: "sfx", id: call });
          if (f.out) ev.push({ type: "burst", x: p.x, y: p.y + 0.9, z: p.z, color: call === "coin" ? 0xffe27a : 0xffffff });
        }
        if (f.def.puzzle.t === "chase" && f.out) this.runOff(f, kids, dt);
        else this.still(f);
        if (carried(d.model)) m.rotation.y += dt * 1.2;
        continue;
      }
      if (f.state === "found" && kids.length) {
        let k = kids[0];
        for (const o of kids) if (o.distanceToSquared(p) < k.distanceToSquared(p)) k = o;
        if (carried(d.model)) {
          // held up high over the kid's head
          p.set(k.x, k.y + 2.1 + Math.sin(f.phase * 4) * 0.06, k.z);
          m.rotation.y += dt * 2;
        } else {
          const dx = k.x - p.x, dz = k.z - p.z, dist = Math.hypot(dx, dz);
          if (dist > 25) p.set(k.x - 1, this.ground(k.x - 1, k.z, k.y + 1), k.z); // a boat ride: catch up
          else if (dist > 1.3) {
            const v = Math.min(7, dist * 2.2);
            p.x += (dx / dist) * v * dt;
            p.z += (dz / dist) * v * dt;
            f.heading = Math.atan2(dx, dz);
            this.walk(f, v);
          } else this.still(f);
          const gy = this.ground(p.x, p.z, p.y + 0.5);
          p.y = p.y > gy + 0.05 ? Math.max(gy, p.y - dt * 9) : gy;
          m.rotation.y = f.heading;
        }
        if (Math.hypot(p.x - hx, p.z - hz) < 3.4) ev.push(...this.arrive(f));
        continue;
      }
      // home: potter about near home
      if (!carried(d.model)) {
        const i = this.finds.indexOf(f);
        const a = f.phase * 0.25 + i * 2.1;
        const tx = hx + Math.cos(a) * 1.05, tz = hz + Math.sin(a) * 1.05;
        const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          p.x += (dx / dist) * Math.min(dist, dt * 0.6);
          p.z += (dz / dist) * Math.min(dist, dt * 0.6);
          f.heading = Math.atan2(dx, dz);
          this.walk(f, 0.6);
        }
        m.rotation.y = f.heading;
      }
    }
    for (const s of this.spots) {
      if (s.shakeT > 0 && s.mesh) {
        s.shakeT = Math.max(0, s.shakeT - dt);
        s.mesh.rotation.z = Math.sin(s.shakeT * 40) * 0.12 * s.shakeT;
      }
    }
    const w = this.well;
    if (w && w.spin > 0) {
      w.spin = Math.max(0, w.spin - dt);
      w.crank.rotation.x += dt * 9;
      const target = 0.35 + (Math.min(3, w.turns) / 3) * 0.95;
      w.bucket.position.y += (target - w.bucket.position.y) * Math.min(1, dt * 3);
      w.rope.scale.y = Math.max(0.05, (1.55 - w.bucket.position.y) / 1.2);
      w.rope.position.y = 1.55 - (1.55 - w.bucket.position.y) / 2;
    }
    return ev;
  }

  private arrive(f: Find): QuestEvent[] {
    const d = this.def!;
    f.state = "home";
    const i = this.finds.indexOf(f);
    this.placeHome(f, i);
    const home = this.finds.filter((o) => o.state === "home").map((o) => o.def.name);
    this.save(d.id, home);
    const left = this.finds.length - home.length;
    const ev: QuestEvent[] = [
      { type: "sfx", id: "win" },
      { type: "burst", x: d.home.x, y: this.ground(d.home.x, d.home.z, 3) + 1.4, z: d.home.z, color: 0xffd93d },
      { type: "reward", coins: 10, score: 100 },
    ];
    if (left > 0) {
      ev.push({ type: "say", who: d.giver, text: `${cap(f.def.name)} is back! Thank you! ${d.emoji} +10 coins. Only ${left} more to find. Talk to me for the next clue!` });
    } else {
      ev.push(
        { type: "reward", coins: 30, score: 300 },
        { type: "say", who: d.giver, text: `${d.finale} ${d.emoji} +40 coins` },
        { type: "complete", title: d.title },
      );
    }
    return ev;
  }

  /** chase: dash away from a kid who comes close, rest, and get slower with every dash. */
  private runOff(f: Find, kids: THREE.Vector3[], dt: number): void {
    const pz = f.def.puzzle as Extract<Puzzle, { t: "chase" }>;
    const p = f.mesh.position;
    let k: THREE.Vector3 | null = null, kd = Infinity;
    for (const o of kids) {
      const dd = Math.hypot(o.x - p.x, o.z - p.z);
      if (dd < kd) { kd = dd; k = o; }
    }
    if (f.restT > 0) {
      f.restT -= dt;
      this.still(f);
      f.mesh.rotation.z = Math.sin(f.phase * 12) * 0.05; // panting
      return;
    }
    if (f.dashT <= 0 && k && kd < 4 && Math.abs(k.y - p.y) < 2) f.dashT = 1.3;
    if (f.dashT > 0 && k) {
      f.dashT -= dt;
      const speed = 2.4 + f.dashes * 0.7; // fast at first, slower each time
      let ax = p.x - k.x, az = p.z - k.z;
      const l = Math.hypot(ax, az) || 1;
      ax /= l;
      az /= l;
      // at the edge of its patch: turn along it instead of leaving
      const cx = p.x - pz.x, cz = p.z - pz.z, cd = Math.hypot(cx, cz);
      if (cd > pz.r * 0.8 && ax * cx + az * cz > 0) {
        const tx = -cz / cd, tz = cx / cd, s = Math.sign(tx * ax + tz * az) || 1;
        ax = tx * s;
        az = tz * s;
      }
      p.x += ax * speed * dt;
      p.z += az * speed * dt;
      if (cd > pz.r) { p.x = pz.x + (cx / cd) * pz.r; p.z = pz.z + (cz / cd) * pz.r; }
      p.y = this.ground(p.x, p.z, p.y + 0.6);
      f.heading = Math.atan2(ax, az);
      f.mesh.rotation.y = f.heading;
      this.walk(f, speed);
      if (f.dashT <= 0) {
        f.dashes = Math.max(0, f.dashes - 1);
        f.restT = f.dashes > 0 ? 1.1 : 2.5;
      }
    } else this.still(f);
  }

  // ── models ────────────────────────────────────────────────────────────────

  private makeFind(def: FindDef, model: FindModel): Find {
    const g = new THREE.Group();
    const legs: THREE.Object3D[] = [];
    const wings: THREE.Object3D[] = [];
    if (model === "lamb" || model === "sheep") buildLamb(g, legs);
    else if (model === "kitten") buildKitten(g, legs, def.name);
    else if (model === "dove") buildDove(g, wings);
    else if (model === "crate") buildCrate(g);
    else buildCoin(g);
    if (model === "sheep") g.scale.setScalar(1.3);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.group.add(g);
    return { def, state: "lost", mesh: g, legs, wings, heading: Math.random() * 6, phase: Math.random() * 5, callT: 0, out: true, dashT: 0, restT: 0, dashes: 3 };
  }

  private walk(f: Find, v: number): void {
    const s = Math.sin(f.phase * (6 + v * 2)) * 0.6;
    f.legs.forEach((leg, i) => (leg.rotation.x = i === 0 || i === 3 ? s : -s));
    if (f.wings.length) f.mesh.position.y += Math.abs(Math.sin(f.phase * 9)) * 0.004; // doves hop
  }

  private still(f: Find): void {
    for (const leg of f.legs) leg.rotation.x *= 0.8;
  }

  private flap(f: Find, _dt: number): void {
    if (!f.wings.length) return;
    const busy = f.state === "found" || f.dashT > 0;
    const a = busy ? Math.sin(f.phase * 22) * 0.7 : Math.sin(f.phase * 2) * 0.05;
    f.wings[0].rotation.z = 0.2 + a;
    f.wings[1].rotation.z = -0.2 - a;
  }

  private placeHome(f: Find, i: number): void {
    const d = this.def!;
    const a = i * 2.1;
    const x = d.home.x + Math.cos(a) * 1.05, z = d.home.z + Math.sin(a) * 1.05;
    let y = this.ground(x, z, 3);
    if (d.home.look === "table") y += 0.78; // coins on the table top
    if (d.home.look === "pallet") y += 0.2 + i * 0.0;
    if (d.home.look === "dovecote") y += 1.75;
    if (carried(d.model)) f.mesh.position.set(d.home.x + (i - 1) * 0.42, y, d.home.z);
    else if (d.home.look === "dovecote") f.mesh.position.set(d.home.x + (i - 1) * 0.35, y, d.home.z + 0.25);
    else f.mesh.position.set(x, y, z);
    f.mesh.visible = true;
    f.out = true;
  }

  private addSpot(x: number, y: number, z: number, look: SearchLook, find: Find, hidden: boolean): void {
    const mesh = look === "tree" ? null : buildSpot(look);
    if (mesh) {
      mesh.position.set(x, y, z);
      this.group.add(mesh);
    }
    this.spots.push({ pos: new THREE.Vector3(x, y, z), mesh, searched: false, shakeT: 0, find, hidden, look });
  }

  /** The place found things are brought to, with a sign. */
  private buildHome(): void {
    const d = this.def!;
    const { x, z } = d.home;
    const y = this.ground(x, z, 3);
    const wood = new THREE.MeshStandardMaterial({ color: 0xa0703f, roughness: 0.9 });
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (d.home.look === "pen") {
      const r = 1.9, n = 12;
      for (let i = 0; i < n; i++) {
        if (i === 0) continue; // the opening
        const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), wood);
        post.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
        g.add(post);
        if (i === n - 1) continue;
        const len = 2 * r * Math.sin(Math.PI / n);
        for (const h of [0.3, 0.62]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.05), wood);
          rail.position.set(Math.cos((a + b) / 2) * r * Math.cos(Math.PI / n), h, Math.sin((a + b) / 2) * r * Math.cos(Math.PI / n));
          rail.rotation.y = -((a + b) / 2) + Math.PI / 2;
          g.add(rail);
        }
      }
      const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.45, 9), new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 1 }));
      hay.position.set(0.6, 0.22, -0.8);
      g.add(hay);
    } else if (d.home.look === "basket") {
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 0.45, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9925a, roughness: 1, side: THREE.DoubleSide }));
      basket.position.y = 0.22;
      const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 18), new THREE.MeshStandardMaterial({ color: 0xff9ecf, roughness: 1 }));
      cushion.position.y = 0.08;
      g.add(basket, cushion);
    } else if (d.home.look === "dovecote") {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8), wood);
      post.position.y = 0.8;
      const house = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: 0xfdf6ec, roughness: 0.8 }));
      house.position.y = 1.95;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.5, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 0.8 }));
      roof.position.y = 2.55;
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.4), wood);
      ledge.position.set(0, 1.62, 0.3);
      g.add(post, house, roof, ledge);
    } else if (d.home.look === "pallet") {
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 1.2), wood);
      pallet.position.y = 0.09;
      const net = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8c39a }));
      net.position.set(1.3, 0.05, 0.3);
      g.add(pallet, net);
    } else {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), wood);
      top.position.y = 0.75;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.75, 8), wood);
      leg.position.y = 0.37;
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.28, 10), new THREE.MeshStandardMaterial({ color: 0xc0786a, roughness: 0.7 }));
      jar.position.set(0.35, 0.92, -0.2);
      g.add(top, leg, jar);
    }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.group.add(g);
    // the sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.06), new THREE.MeshStandardMaterial({ map: signTexture(d.home.sign), roughness: 0.8 }));
    sign.position.set(x - 2.2, y + 1.3, z + 0.6);
    sign.rotation.y = 0.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), wood);
    pole.position.set(sign.position.x, y + 0.55, sign.position.z - 0.04);
    this.group.add(sign, pole);
  }

  /** Prints leading toward a hiding place (the last stretch only). */
  private trail(def: FindDef, p: Puzzle): void {
    const [fx, fz] = def.trail!;
    // toward the place (for a search: the middle of the spots, so the trail doesn't give it away)
    const tx = "x" in p ? p.x : p.spots.reduce((a, s) => a + s[0], 0) / p.spots.length;
    const tz = "z" in p ? p.z : p.spots.reduce((a, s) => a + s[1], 0) / p.spots.length;
    const model = this.def!.model;
    const color = model === "dove" ? 0xffffff : model === "crate" ? 0x7a5a3a : model === "coin" ? 0xffd93d : 0x4a3a2a;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: model === "coin" ? 0.8 : 0.55, depthWrite: false });
    const geo = model === "dove" ? new THREE.PlaneGeometry(0.09, 0.22).rotateX(-Math.PI / 2) : new THREE.CircleGeometry(model === "crate" ? 0.12 : 0.07, 8).rotateX(-Math.PI / 2);
    const dx = tx - fx, dz = tz - fz, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const stop = p.t === "reach" && (p.refY ?? 0) > 5 ? 3.5 : 1.8;
    const step = model === "dove" ? 1.4 : 0.55;
    for (let s = 0; s < len - stop; s += step) {
      const side = (Math.floor(s / step) % 2 ? 1 : -1) * 0.09;
      for (const half of model === "lamb" || model === "sheep" ? [-0.06, 0.06] : [0]) {
        const x = fx + ux * s - uz * side + ux * half, z = fz + uz * s + ux * side + uz * half;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, this.ground(x, z, 3) + 0.025, z);
        m.rotation.y = Math.atan2(ux, uz) + (model === "dove" ? s : 0);
        this.group.add(m);
      }
    }
  }

  /** An old stone well with a roof, a crank and a bucket on a rope. */
  private buildWell(x: number, z: number, find: Find): void {
    const y = this.ground(x, z, 3);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.95, side: THREE.DoubleSide });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.8, 16, 1, true), stone);
    ring.position.y = 0.4;
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
    bucket.position.y = 0.35;
    g.add(rope, bucket);
    this.group.add(g);
    this.well = { pos: new THREE.Vector3(x, y, z), crank, rope, bucket, turns: 0, spin: 0, find };
  }
}

// ── little models ─────────────────────────────────────────────────────────────

/** A fluffy cartoon lamb about knee high to a kid: woolly puffs, a dark face and legs. */
function buildLamb(g: THREE.Group, legs: THREE.Object3D[]): void {
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
  const legGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.3, 6).translate(0, -0.15, 0);
  for (const [x, z] of [[0.09, 0.16], [-0.09, 0.16], [0.09, -0.18], [-0.09, -0.18]]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(x, 0.3, z);
    g.add(leg);
    legs.push(leg);
  }
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd93d, metalness: 0.6, roughness: 0.3 }));
  bell.position.set(0, 0.48, 0.32);
  g.add(bell);
}

const KITTEN_COLORS: Record<string, [number, number]> = { Mittens: [0x3b3238, 0xffffff], Patches: [0xf4a259, 0xffffff], Tiger: [0xe08a3c, 0x9a5420] };

/** A small cartoon kitten: round body, big head, pointy ears, a curly tail. */
function buildKitten(g: THREE.Group, legs: THREE.Object3D[], name: string): void {
  const [c1, c2] = KITTEN_COLORS[name] ?? [0xb0a8a0, 0xffffff];
  const fur = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.9 });
  const fur2 = new THREE.MeshStandardMaterial({ color: c2, roughness: 0.9 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xffa3b8, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fur);
  body.scale.set(0.85, 0.8, 1.25);
  body.position.y = 0.24;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), fur2);
  belly.position.set(0, 0.2, 0.08);
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.2);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), fur);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), fur2);
  muzzle.position.set(0, -0.04, 0.11);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), pink);
  nose.position.set(0, -0.01, 0.17);
  head.add(skull, muzzle, nose);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x2b2b2b });
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), fur);
    ear.position.set(sx * 0.09, 0.14, -0.01);
    ear.rotation.z = -sx * 0.25;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeM);
    eye.position.set(sx * 0.06, 0.03, 0.125);
    head.add(ear, eye);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI * 1.2), fur);
  tail.position.set(0, 0.36, -0.22);
  tail.rotation.y = Math.PI / 2;
  g.add(body, belly, head, tail);
  const legGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.16, 6).translate(0, -0.08, 0);
  for (const [x, z] of [[0.07, 0.12], [-0.07, 0.12], [0.07, -0.12], [-0.07, -0.12]]) {
    const leg = new THREE.Mesh(legGeo, fur2);
    leg.position.set(x, 0.16, z);
    g.add(leg);
    legs.push(leg);
  }
}

/** A white dove with an olive sprig. */
function buildDove(g: THREE.Group, wings: THREE.Object3D[]): void {
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const beakM = new THREE.MeshStandardMaterial({ color: 0xf4a259, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), white);
  body.scale.set(0.85, 0.85, 1.35);
  body.position.y = 0.22;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), white);
  head.position.set(0, 0.36, 0.15);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6).rotateX(Math.PI / 2), beakM);
  beak.position.set(0, 0.35, 0.25);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.16), white);
  tail.position.set(0, 0.26, -0.24);
  tail.rotation.x = -0.3;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), eyeM);
    eye.position.set(sx * 0.055, 0.38, 0.21);
    g.add(eye);
  }
  // an olive leaf in its beak
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshStandardMaterial({ color: 0x6a994e, roughness: 0.8 }));
  leaf.scale.set(0.5, 0.25, 1.6);
  leaf.position.set(0.04, 0.34, 0.3);
  leaf.rotation.y = 0.6;
  g.add(body, head, beak, tail, leaf);
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.1, 0.27, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.2), white);
    wing.position.x = sx * 0.12;
    pivot.add(wing);
    g.add(pivot);
    wings.push(pivot);
  }
  const legM = new THREE.MeshStandardMaterial({ color: 0xe07a5f });
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), legM);
    leg.position.set(sx * 0.05, 0.06, 0.02);
    g.add(leg);
  }
}

/** A small wooden cargo crate with rope handles. */
function buildCrate(g: THREE.Group): void {
  const wood = new THREE.MeshStandardMaterial({ color: 0xb07845, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x7a4f2a, roughness: 0.9 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.42), wood);
  box.position.y = 0.21;
  g.add(box);
  for (const y of [0.05, 0.37]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.06, 0.44), dark);
    band.position.y = y;
    g.add(band);
  }
  const x = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.02), dark);
  x.position.set(0, 0.21, 0.215);
  x.rotation.z = 0.7;
  g.add(x);
}

/** A big shiny silver coin standing on its edge. */
function buildCoin(g: THREE.Group): void {
  const silver = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 0.9, roughness: 0.2, emissive: 0x333333 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20).rotateX(Math.PI / 2), silver);
  coin.position.y = 0.26;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20), silver);
  rim.position.y = 0.26;
  g.add(coin, rim);
}

/** The thing a search spot looks like. */
function buildSpot(look: SearchLook): THREE.Object3D {
  const g = new THREE.Group();
  if (look === "bush") {
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f9a3a, roughness: 0.95 });
    const leaf2 = new THREE.MeshStandardMaterial({ color: 0x57b247, roughness: 0.95 });
    const geo = new THREE.IcosahedronGeometry(0.55, 1);
    for (const [ox, oy, oz, s, m] of [[0, 0.5, 0, 1.2, leaf], [0.45, 0.4, 0.2, 0.9, leaf2], [-0.4, 0.42, -0.15, 0.95, leaf2], [0.1, 0.85, -0.1, 0.8, leaf]] as const) {
      const b = new THREE.Mesh(geo, m);
      b.position.set(ox, oy, oz);
      b.scale.setScalar(s);
      b.castShadow = true;
      g.add(b);
    }
  } else if (look === "crate") {
    const wood = new THREE.MeshStandardMaterial({ color: 0xa57944, roughness: 0.9 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.9), wood);
    box.position.y = 0.4;
    box.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.08, 0.94), new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.9 }));
    lid.position.y = 0.82;
    g.add(box, lid);
  } else if (look === "mound") {
    const sand = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8c98a, roughness: 1 }));
    sand.scale.y = 0.45;
    const shell = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0xffd6e0 }));
    shell.position.set(0.25, 0.16, 0.2);
    g.add(sand, shell);
  } else {
    // a little dust pile with a cobweb-grey puff
    const dust = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbdb5a6, roughness: 1 }));
    dust.scale.y = 0.3;
    g.add(dust);
  }
  return g;
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
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
