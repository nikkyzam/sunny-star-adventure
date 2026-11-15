/**
 * jobs.ts — work for coins, Wobbly Life style. Villagers with 💼 on their name tag hand out a job:
 * deliver pizza or letters, put out fires, pick carrots, clean the beach, catch fish, drive the bus,
 * fly parcels in the helicopter, or gather moon crystals.
 *
 * A job is a list of stops. Reach a stop (in the right ride, if it asks for one) to tick it off;
 * some jobs show every stop at once, others one at a time behind a beam of light. A few end with
 * "come back to me", and the coins are paid when the last stop is done.
 */

import * as THREE from "three";
import type { RideKind } from "./car";
import type { Particles } from "./particles";
import { makeTextSprite, disposeSprite } from "./social";

export type JobId = "pizza" | "mail" | "fire" | "farm" | "clean" | "fish" | "bus" | "cargo" | "moon";

type Item = "carrot" | "bottle" | "fish" | "crystal" | "fire" | "busstop" | "drop";

export interface Stop {
  x: number; y: number; z: number;
  /** How close counts: sideways, and up or down. */
  r: number; ry: number;
  /** Only counts while riding this. */
  ride?: RideKind;
  /** Seconds to stay in reach (spraying a fire). */
  hold?: number;
  /** The villager this stop is for. */
  npc?: string;
  item?: Item;
}

export interface Villager { name: string; x: number; y: number; z: number }

export interface JobContext {
  boss: Villager;
  /** Everyone else on this level. */
  villagers: Villager[];
  /** Places the boss's job uses (garden rows, beach litter, fishing spots, bus stops…). */
  spots: [number, number, number][];
  /** Houses near the boss (for fires). */
  houses: { x: number; z: number; w: number; d: number; top: number }[];
  ground: (x: number, z: number, y: number) => number;
}

interface JobDef {
  emoji: string;
  title: string;
  pay: number;
  color: number;
  /** One stop at a time behind a beam, or every stop at once in any order. */
  ordered: boolean;
  /** After the last stop, go back to the boss to be paid. */
  report?: boolean;
  intro: (stops: Stop[]) => string;
  /** The HUD line while working. */
  label: (left: Stop[], total: number) => string;
  /** Said by a villager something was delivered to. */
  got?: string;
  thanks: string;
  make: (c: JobContext) => Stop[];
}

const NEAR_BOSS = 45;

function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const names = (s: Stop[]) => s.map((t) => t.npc).join(", ");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const fromSpots = (c: JobContext, n: number, item: Item, r: number, ry: number, o: { ride?: RideKind; inOrder?: boolean; lift?: number } = {}): Stop[] =>
  (o.inOrder ? c.spots : shuffle(c.spots)).slice(0, n).map(([x, y, z]) => ({ x, y: c.ground(x, z, y + 1) + (o.lift ?? 0), z, r, ry, ride: o.ride, item }));
const toVillager = (v: Villager, r = 2.6): Stop => ({ x: v.x, y: v.y, z: v.z, r, ry: 2.5, npc: v.name });

export const JOBS: Record<JobId, JobDef> = {
  pizza: {
    emoji: "🍕", title: "Pizza delivery", pay: 10, color: 0xffd93d, ordered: true,
    intro: (s) => `Order up! Please take this pizza to ${s[0].npc}. Follow the yellow beam of light. Walk, drive, sail or fly!`,
    label: (left) => `🍕 Pizza for ${left[0]?.npc ?? ""}`,
    got: "Mmm, pizza! Thank you! 🍕",
    thanks: "Hot pizza, happy customer!",
    make: (c) => [toVillager(shuffle(c.villagers)[0])],
  },
  mail: {
    emoji: "✉️", title: "Mail carrier", pay: 15, color: 0x5cb8ff, ordered: false,
    intro: (s) => `You're the mail carrier today! Bring these letters to ${names(s)}. Follow the blue beams.`,
    label: (left) => `✉️ Letters for ${names(left)}`,
    got: "A letter for me? How exciting! Thank you! ✉️",
    thanks: "Every letter delivered!",
    make: (c) => shuffle(c.villagers.filter((v) => Math.hypot(v.x - c.boss.x, v.z - c.boss.z) < NEAR_BOSS)).slice(0, 3).map((v) => toVillager(v)),
  },
  fire: {
    emoji: "🔥", title: "Firefighter", pay: 15, color: 0xff6b3d, ordered: false,
    intro: (s) => `Help! ${plural(s.length, "house is", "houses are")} on fire! Run over and stand close to spray water until the flames go out. 🚒`,
    label: (left) => `🔥 Fires left: ${left.length} · stand close to spray`,
    thanks: "You put out every fire! You're a hero!",
    // (only low buildings: a fire on a skyscraper roof would be out of sight)
    make: (c) => shuffle(c.houses.filter((h) => h.top < 14 && Math.hypot(h.x - c.boss.x, h.z - c.boss.z) < NEAR_BOSS)).slice(0, 3)
      .map((h) => ({ x: h.x, y: h.top, z: h.z, r: Math.max(h.w, h.d) / 2 + 4.5, ry: 40, hold: 2.5, item: "fire" as const })),
  },
  farm: {
    emoji: "🥕", title: "Farmer", pay: 10, color: 0xff9f43, ordered: false, report: true,
    intro: (s) => `My carrots are ready! Pull up all ${s.length} in the garden, then bring them back to me.`,
    label: (left, total) => `🥕 Carrots ${total - left.length}/${total}`,
    thanks: "Crunchy carrots! Thank you, farmer!",
    make: (c) => fromSpots(c, 6, "carrot", 1.3, 2),
  },
  clean: {
    emoji: "🧹", title: "Beach cleanup", pay: 10, color: 0x7ed957, ordered: false, report: true,
    intro: (s) => `Oh no, litter on my beach! Pick up the ${s.length} bottles, then come back to me.`,
    label: (left, total) => `🧹 Bottles ${total - left.length}/${total}`,
    thanks: "The beach is sparkly clean! Thank you!",
    make: (c) => fromSpots(c, 5, "bottle", 1.4, 2),
  },
  fish: {
    emoji: "🎣", title: "Fishing", pay: 15, color: 0x5cb8ff, ordered: false, report: true,
    intro: (s) => `Hop in the boat and sail to the jumping fish. Catch ${s.length}, then bring them back here!`,
    label: (left, total) => `🎣 Fish ${total - left.length}/${total} · sail to the splashes`,
    thanks: "What a catch! 🐟",
    make: (c) => fromSpots(c, 3, "fish", 3.6, 3, { ride: "boat" }),
  },
  bus: {
    emoji: "🚌", title: "Bus driver", pay: 15, color: 0xffd93d, ordered: true, report: true,
    intro: (s) => `All aboard! Drive the red car to all ${s.length} bus stops, one after another. Follow the beam!`,
    label: (left, total) => `🚌 Bus stop ${total - left.length + 1} of ${total}`,
    thanks: "Great driving! The passengers loved it!",
    make: (c) => fromSpots(c, c.spots.length, "busstop", 4.2, 3, { ride: "car", inOrder: true }),
  },
  cargo: {
    emoji: "📦", title: "Sky cargo", pay: 20, color: 0xb197fc, ordered: true,
    intro: (s) => `Fly my helicopter through the ${s.length} purple drop rings to deliver the parcels. Hold JUMP to climb!`,
    label: (left, total) => `📦 Drop ring ${total - left.length + 1} of ${total} · fly the 🚁`,
    thanks: "Parcels delivered by air!",
    make: (c) => fromSpots(c, 2, "drop", 6, 4.5, { ride: "heli", lift: 2.5 }),
  },
  moon: {
    emoji: "💎", title: "Crystal hunter", pay: 15, color: 0xb197fc, ordered: false, report: true,
    intro: (s) => `Blorp needs shiny moon crystals! Find ${s.length}, then bring them back to Blorp.`,
    label: (left, total) => `💎 Crystals ${total - left.length}/${total}`,
    thanks: "Ooh, sparkly! Blorp loves them!",
    make: (c) => fromSpots(c, 5, "crystal", 1.5, 2.5),
  },
};

interface Live {
  stop: Stop;
  /** The thing at the stop (a carrot, a fire…), if any. */
  obj: THREE.Object3D | null;
  beam: THREE.Mesh;
  /** Seconds sprayed so far (fires). */
  held: number;
  phase: number;
}

export type JobEvent =
  | { type: "stop"; stop: Stop }
  | { type: "report"; boss: string }
  | { type: "done"; pay: number; thanks: string; boss: string }
  | { type: "needRide"; ride: RideKind };

export interface Kid { pos: THREE.Vector3; ride: RideKind | null }

const UP = new THREE.Vector3(0, 1, 0);

export class Jobs {
  readonly group = new THREE.Group();
  id: JobId | null = null;
  boss: Villager | null = null;
  private live: Live[] = [];
  private total = 0;
  /** Every stop is done: now walk back to the boss. */
  reporting = false;
  private beamMat: THREE.MeshBasicMaterial | null = null;
  private readonly beamGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 14, 1, true).translate(0, 0.5, 0);
  private readonly arrow = new THREE.Group();
  private readonly arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd93d, depthTest: false, transparent: true, opacity: 0.9 });
  private sprayT = 0;
  /** Shared meshes for the things at stops, made the first time they're needed. */
  private kit = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }>();
  private signs: THREE.Sprite[] = [];

  constructor(private readonly fx: Particles) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 12).rotateX(Math.PI / 2), this.arrowMat);
    cone.renderOrder = 10;
    this.arrow.add(cone);
    this.arrow.visible = false;
    this.group.add(this.arrow);
  }

  get def(): JobDef | null {
    return this.id ? JOBS[this.id] : null;
  }

  /** Stops still to do (the trip back to the boss counts as one). */
  get left(): Stop[] {
    return this.live.map((l) => l.stop);
  }

  label(): string {
    const def = this.def;
    if (!def) return "";
    if (this.reporting) return `${def.emoji} Back to ${this.boss?.name}!`;
    return def.label(this.left, this.total);
  }

  /** What the boss says if you talk to them mid-job. */
  busyText(): string {
    const def = this.def;
    if (!def) return "";
    if (this.reporting) return "You're done? Come closer and I'll pay you!";
    const left = this.left;
    if (left[0]?.npc) return def.ordered ? `${left[0].npc} is still waiting. Follow the beam of light!` : `Still to go: ${names(left)}. Follow the beams!`;
    return `The ${def.title.toLowerCase()} job isn't finished yet. Follow the beams of light!`;
  }

  /** Start a shift. Returns what the boss says. */
  start(id: JobId, c: JobContext): string {
    this.clear();
    const def = JOBS[id];
    const stops = def.make(c);
    if (stops.length === 0) return "Hmm, there's no work today. Come back later!";
    this.id = id;
    this.boss = c.boss;
    this.total = stops.length;
    this.beamMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.arrowMat.color.setHex(def.color);
    for (const s of stops) this.addStop(s);
    return def.intro(stops);
  }

  clear(): void {
    for (const l of this.live) this.removeVisual(l);
    this.live = [];
    this.beamMat?.dispose();
    this.beamMat = null;
    this.id = null;
    this.boss = null;
    this.reporting = false;
    this.arrow.visible = false;
  }

  dispose(): void {
    this.clear();
    this.beamGeo.dispose();
    this.arrowMat.dispose();
    (this.arrow.children[0] as THREE.Mesh).geometry.dispose();
    for (const k of this.kit.values()) { k.geo.dispose(); k.mat.dispose(); }
    this.kit.clear();
  }

  update(dt: number, t: number, kids: Kid[]): JobEvent[] {
    const def = this.def;
    if (!def || kids.length === 0) return [];
    const ev: JobEvent[] = [];
    const targets = def.ordered || this.reporting ? this.live.slice(0, 1) : this.live.slice();
    let sprayed = false; // one hose: a single fire at a time
    for (const l of targets) {
      const s = l.stop;
      let reach: Kid | null = null;
      let wrongRide = false;
      for (const k of kids) {
        const dx = k.pos.x - s.x, dz = k.pos.z - s.z;
        if (dx * dx + dz * dz > s.r * s.r || Math.abs(k.pos.y - s.y) > s.ry) continue;
        if (!s.ride || k.ride === s.ride) { reach = k; break; }
        wrongRide = true;
      }
      if (!reach) {
        l.held = Math.max(0, l.held - dt * 0.5); // fires creep back if you walk away
        if (wrongRide && s.ride) ev.push({ type: "needRide", ride: s.ride });
        continue;
      }
      if (s.hold && l.held < s.hold) {
        if (sprayed) continue;
        sprayed = true;
        l.held += dt;
        this.spray(reach.pos, s, dt);
        if (l.held < s.hold) continue;
      }
      this.removeVisual(l);
      this.live.splice(this.live.indexOf(l), 1);
      if (this.reporting) {
        ev.push({ type: "done", pay: def.pay, thanks: def.thanks, boss: this.boss?.name ?? "" });
        this.clear();
        return ev;
      }
      ev.push({ type: "stop", stop: s });
      if (def.ordered) break; // the next stop counts from the next frame
    }
    if (this.live.length === 0 && this.id) {
      if (def.report && this.boss) {
        this.reporting = true;
        this.addStop({ ...toVillager(this.boss, 3.4), npc: undefined });
        ev.push({ type: "report", boss: this.boss.name });
      } else {
        ev.push({ type: "done", pay: def.pay, thanks: def.thanks, boss: this.boss?.name ?? "" });
        this.clear();
        return ev;
      }
    }
    this.animate(dt, t, kids[0].pos, def.ordered || this.reporting);
    return ev;
  }

  // ── Visuals ─────────────────────────────────────────────────────────────────

  private addStop(s: Stop): void {
    const tall = this.def!.ordered || this.reporting || !!s.npc || s.item === "fire";
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat!);
    beam.position.set(s.x, s.y + (s.npc || this.reporting ? 2.4 : 0), s.z);
    beam.scale.set(1, tall ? 40 : 7, 1);
    beam.renderOrder = 2;
    this.group.add(beam);
    const obj = s.item ? this.makeItem(s.item) : null;
    if (obj) {
      obj.position.set(s.x, s.y, s.z);
      this.group.add(obj);
    }
    this.live.push({ stop: s, obj, beam, held: 0, phase: Math.random() * Math.PI * 2 });
  }

  private removeVisual(l: Live): void {
    this.group.remove(l.beam);
    if (!l.obj) return;
    this.group.remove(l.obj);
    const sprites: THREE.Sprite[] = [];
    l.obj.traverse((o) => { if (o instanceof THREE.Sprite) sprites.push(o); });
    for (const o of sprites) {
      disposeSprite(o);
      this.signs.splice(this.signs.indexOf(o), 1);
    }
  }

  private part(key: string, geo: () => THREE.BufferGeometry, mat: () => THREE.Material): THREE.Mesh {
    let k = this.kit.get(key);
    if (!k) this.kit.set(key, (k = { geo: geo(), mat: mat() }));
    const m = new THREE.Mesh(k.geo, k.mat);
    m.castShadow = true;
    return m;
  }

  private makeItem(item: Item): THREE.Object3D {
    const g = new THREE.Group();
    const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
    const basic = (color: number, opacity = 1) => () => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide });
    switch (item) {
      case "carrot": {
        const root = this.part("carrot", () => new THREE.ConeGeometry(0.13, 0.5, 9).rotateX(Math.PI), std(0xff8a1f));
        root.position.y = 0.12;
        g.add(root);
        for (let i = 0; i < 3; i++) {
          const leaf = this.part("leaf", () => new THREE.ConeGeometry(0.05, 0.34, 5), std(0x3fa34d));
          leaf.position.set(Math.sin(i * 2.1) * 0.05, 0.5, Math.cos(i * 2.1) * 0.05);
          leaf.rotation.set(Math.cos(i * 2.1) * 0.4, 0, -Math.sin(i * 2.1) * 0.4);
          g.add(leaf);
        }
        const dirt = this.part("dirt", () => new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2), std(0x6b4a2b));
        dirt.position.y = 0.02;
        dirt.castShadow = false;
        g.add(dirt);
        break;
      }
      case "bottle": {
        const body = this.part("bottle", () => new THREE.CylinderGeometry(0.1, 0.1, 0.36, 10), std(0x5fd3a0, { roughness: 0.15, transparent: true, opacity: 0.85 }));
        const neck = this.part("neck", () => new THREE.CylinderGeometry(0.04, 0.06, 0.14, 8).translate(0, 0.25, 0), std(0x5fd3a0, { roughness: 0.15 }));
        const holder = new THREE.Group();
        holder.add(body, neck);
        holder.rotation.z = Math.PI / 2;
        holder.position.y = 0.1;
        g.add(holder);
        break;
      }
      case "fish": {
        const foam = this.part("foam", () => new THREE.RingGeometry(0.9, 1.5, 24).rotateX(-Math.PI / 2), basic(0xffffff, 0.6));
        foam.position.y = 0.55;
        foam.castShadow = false;
        g.add(foam);
        const fish = new THREE.Group();
        const body = this.part("fishBody", () => new THREE.SphereGeometry(0.25, 12, 8).scale(1.6, 0.8, 0.55), std(0xff9f43, { roughness: 0.3 }));
        const tail = this.part("fishTail", () => new THREE.ConeGeometry(0.2, 0.3, 4).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), std(0xff6b3d));
        fish.add(body, tail);
        fish.name = "fish";
        g.add(fish);
        break;
      }
      case "crystal": {
        const c = this.part("crystal", () => new THREE.OctahedronGeometry(0.32).scale(1, 1.6, 1), std(0xc9a7ff, { emissive: 0x7b4dff, emissiveIntensity: 0.8, roughness: 0.2, flatShading: true }));
        c.position.y = 0.6;
        c.name = "spin";
        g.add(c);
        break;
      }
      case "fire": {
        for (let i = 0; i < 5; i++) {
          const outer = this.part("flame", () => new THREE.ConeGeometry(0.55, 1.7, 8).translate(0, 0.85, 0), basic(0xff6b1f));
          const inner = this.part("flameIn", () => new THREE.ConeGeometry(0.32, 1.1, 8).translate(0, 0.55, 0), basic(0xffd23d));
          const a = (i / 5) * Math.PI * 2;
          const f = new THREE.Group();
          f.add(outer, inner);
          outer.castShadow = inner.castShadow = false;
          f.position.set(i === 0 ? 0 : Math.cos(a) * 1.1, 0, i === 0 ? 0 : Math.sin(a) * 1.1);
          f.name = "flame";
          g.add(f);
        }
        break;
      }
      case "busstop": {
        const post = this.part("post", () => new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8).translate(0, 1.2, 0), std(0x8a90a0));
        post.position.x = 3.6;
        g.add(post);
        const sign = makeTextSprite("🚌 BUS STOP", { bg: "rgba(41,98,255,0.95)", fg: "#ffffff", size: 40, height: 0.55 });
        sign.position.set(3.6, 2.6, 0);
        this.signs.push(sign);
        g.add(sign);
        const pad = this.part("pad", () => new THREE.RingGeometry(3.4, 3.9, 36).rotateX(-Math.PI / 2), basic(0xffd93d, 0.75));
        pad.position.y = 0.06;
        pad.castShadow = false;
        g.add(pad);
        break;
      }
      case "drop": {
        const ring = this.part("dropRing", () => new THREE.TorusGeometry(3.4, 0.22, 8, 36).rotateX(Math.PI / 2), basic(0xb197fc));
        ring.castShadow = false;
        ring.name = "pulse";
        g.add(ring);
        const box = this.part("parcel", () => new THREE.BoxGeometry(0.7, 0.55, 0.7), std(0xc98a5b));
        box.name = "spin";
        g.add(box);
        break;
      }
    }
    return g;
  }

  private spray(from: THREE.Vector3, s: Stop, dt: number): void {
    this.sprayT -= dt;
    if (this.sprayT > 0) return;
    this.sprayT = 0.07;
    const f = Math.random();
    const y0 = from.y + 1.1;
    // a stream of droplets from the kid to the flames, and steam where it lands
    this.fx.burst(from.x + (s.x - from.x) * f, y0 + (s.y + 0.6 - y0) * f + Math.sin(f * Math.PI) * 1.5, from.z + (s.z - from.z) * f, 0x8fd8ff, 3, 1.2, 0.35, 4);
    this.fx.burst(s.x + (Math.random() - 0.5) * 2, s.y + 1, s.z + (Math.random() - 0.5) * 2, 0xe8eef2, 2, 1.2, 0.9, -3);
  }

  private animate(dt: number, t: number, kid: THREE.Vector3, oneBeam: boolean): void {
    let nearest: Live | null = null;
    let nearD = Infinity;
    for (const l of this.live) {
      const pulse = 0.85 + Math.sin(t * 3 + l.phase) * 0.15;
      l.beam.scale.x = l.beam.scale.z = pulse;
      const d = Math.hypot(l.stop.x - kid.x, l.stop.z - kid.z);
      if (d < nearD) { nearD = d; nearest = l; }
      if (!l.obj) continue;
      const lt = t + l.phase;
      for (const o of l.obj.children) {
        if (o.name === "spin") o.rotation.y += dt * 1.6;
        else if (o.name === "pulse") o.scale.setScalar(1 + Math.sin(lt * 3) * 0.06);
        else if (o.name === "flame") {
          // fires shrink as they're sprayed
          const left = l.stop.hold ? 1 - (l.held / l.stop.hold) * 0.85 : 1;
          o.scale.set(left, left * (1 + Math.sin(lt * 11 + o.position.x * 3) * 0.18), left);
        } else if (o.name === "fish") {
          const k = (lt * 0.9) % 1;
          const up = k < 0.45 ? Math.sin((k / 0.45) * Math.PI) : 0;
          o.visible = up > 0;
          o.position.set((k / 0.45 - 0.5) * 1.6, 0.4 + up * 1.4, 0);
          o.rotation.z = -Math.cos((k / 0.45) * Math.PI) * 0.9;
        }
      }
      if (l.stop.item === "fire" && Math.random() < dt * 4) {
        this.fx.burst(l.stop.x, l.stop.y + 1.8, l.stop.z, 0x6b6b6b, 1, 0.8, 1.6, -2.5); // smoke
      }
      if (l.stop.item === "fish" && Math.random() < dt * 2) {
        this.fx.burst(l.stop.x, l.stop.y + 0.6, l.stop.z, 0xdff6ff, 6, 2.5, 0.5, 6);
      }
    }
    // an arrow over the kid's head points at the nearest stop (or the next one in order)
    const target = oneBeam ? this.live[0] : nearest;
    const dist = target ? Math.hypot(target.stop.x - kid.x, target.stop.z - kid.z) : 0;
    this.arrow.visible = !!target && dist > 9;
    if (target && this.arrow.visible) {
      this.arrow.position.set(kid.x, kid.y + 2.9 + Math.sin(t * 4) * 0.12, kid.z);
      this.arrow.setRotationFromAxisAngle(UP, Math.atan2(target.stop.x - kid.x, target.stop.z - kid.z));
    }
  }
}
