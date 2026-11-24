/**
 * kites.ts — a kite stall on the beach. A kid takes a kite (E) and it flies on a string from their
 * hand: it hangs low when they stand still, climbs and pulls out behind them when they run (more
 * wind over it), swoops gently side to side, and does a loop-the-loop when they jump. The string
 * sags in a soft curve. E at the stall puts it back; it also goes back by itself if the kid gets in
 * something, or wanders right away from the beach.
 *
 * Drawn in code: diamond kites with a cross spar and a tail of little bows.
 */

import * as THREE from "three";

const COLORS: [number, number][] = [[0xff5f6d, 0xffd23f], [0x3fa7ff, 0xffffff], [0x7bd46b, 0xff9f43], [0xb197fc, 0xfff1a8]];
const STRING_PTS = 14;
const TAIL_BOWS = 6;
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();

interface Flying {
  kite: THREE.Group;
  tail: THREE.Object3D[];
  line: THREE.Line;
  pos: THREE.Vector3;   // where the kite is
  vel: THREE.Vector3;
  climb: number;        // 0 … 1: how much wind it has (from the kid's speed)
  loop: number;         // a loop-the-loop in progress (radians left to turn), 0 when none
  spin: number;         // how far round the loop it is
  t: number;
}

export class Kites {
  readonly group = new THREE.Group();
  /** Where the stall is (kids stand here to take or give back a kite). */
  stall: THREE.Vector3 | null = null;
  private readonly flying = new Map<object, Flying>();
  private readonly owned: { dispose(): void }[] = [];
  private shown: THREE.Group[] = [];   // the kites hanging on the stall
  private next = 0;
  /** Which way the sea breeze blows (radians, like a facing): kites fly out downwind of the hand. */
  private windDir = 0;

  build(at: [number, number, number, number] | undefined): void {
    this.clear();
    if (!at) return;
    const [x, y, z, ry] = at;
    this.stall = new THREE.Vector3(x, y, z);
    this.windDir = ry; // the stall looks inland, the way the sea breeze blows
    const stall = new THREE.Group();
    stall.position.set(x, y, z);
    stall.rotation.y = ry;
    this.group.add(stall);
    // a little wooden frame with a striped awning, kites hanging along the front
    const wood = this.mat(new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.85 }));
    const awning = this.mat(new THREE.MeshStandardMaterial({ map: awningTex(), roughness: 0.8, side: THREE.DoubleSide }));
    const post = this.geo(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 8));
    for (const [px, pz] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) {
      const m = new THREE.Mesh(post, wood);
      m.position.set(px, 1.2, pz);
      m.castShadow = true;
      stall.add(m);
    }
    const roof = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(2.6, 1.4, 1, 1)), awning);
    roof.rotation.x = -Math.PI / 2 + 0.25;
    roof.position.set(0, 2.45, 0);
    roof.castShadow = true;
    stall.add(roof);
    const counter = new THREE.Mesh(this.geo(new THREE.BoxGeometry(2.3, 0.08, 0.9)), wood);
    counter.position.set(0, 0.95, 0.05);
    counter.castShadow = true;
    stall.add(counter);
    const bar = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6)), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 2.15, 0.52);
    stall.add(bar);
    for (let k = 0; k < 4; k++) {
      const kite = this.makeKite(k).group;
      kite.scale.setScalar(0.55);
      kite.position.set(-0.85 + k * 0.57, 1.72, 0.56);
      kite.rotation.y = Math.PI;
      stall.add(kite);
      this.shown.push(kite);
    }
  }

  /** Can this kid take a kite here (or give one back)? */
  near(p: THREE.Vector3): boolean {
    return !!this.stall && Math.hypot(p.x - this.stall.x, p.z - this.stall.z) < 2.2 && Math.abs(p.y - this.stall.y) < 1.5;
  }

  has(who: object): boolean {
    return this.flying.has(who);
  }

  /** Hand a kite to `who`, who's at `from`; it starts just above and behind them. */
  take(who: object, from: THREE.Vector3): void {
    if (this.flying.has(who)) return;
    const k = this.next++ % COLORS.length;
    const { group, tail } = this.makeKite(k);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(STRING_PTS * 3), 3));
    const line = new THREE.Line(geo, this.lineMat());
    line.frustumCulled = false;
    this.group.add(group, line);
    const pos = from.clone().add(V.set(0, 2.5, 0));
    group.position.copy(pos);
    this.flying.set(who, { kite: group, tail, line, pos, vel: new THREE.Vector3(), climb: 0, loop: 0, spin: 0, t: Math.random() * 10 });
    if (this.shown[k % this.shown.length]) this.shown[k % this.shown.length].visible = false;
  }

  /** Give the kite back (it disappears; the one on the stall shows again). */
  giveBack(who: object): void {
    const f = this.flying.get(who);
    if (!f) return;
    this.flying.delete(who);
    f.kite.removeFromParent();
    f.line.removeFromParent();
    f.line.geometry.dispose();
    for (const s of this.shown) s.visible = true;
    // any kite still out keeps its stall hook empty
    let i = 0;
    for (const _ of this.flying) this.shown[i++ % this.shown.length].visible = false;
  }

  /** A loop-the-loop (when the kid jumps). */
  trick(who: object): void {
    const f = this.flying.get(who);
    if (f && f.loop <= 0) f.loop = Math.PI * 2;
  }

  /** How high above the kid their kite is (m), or null (for tests). */
  height(who: object, from: THREE.Vector3): number | null {
    const f = this.flying.get(who);
    return f ? +(f.pos.y - from.y).toFixed(2) : null;
  }

  /** Where `who`'s kite is (for the head to look up at it). */
  kitePos(who: object): THREE.Vector3 | null {
    return this.flying.get(who)?.pos ?? null;
  }

  /**
   * Fly each kite: `hand` is where the string is held, `speed` how fast the kid is running. The kite
   * sits downwind of the hand (inland, where the sea breeze blows it, so kids can see it), on the end
   * of its string, higher the more wind; running pulls more air over it, so it climbs.
   */
  fly(who: object, hand: THREE.Vector3, speed: number, dt: number): void {
    const f = this.flying.get(who);
    if (!f) return;
    f.t += dt;
    // a steady sea breeze, plus the wind the kid makes by running
    const wind = THREE.MathUtils.clamp(0.35 + speed / 6, 0, 1);
    f.climb += (wind - f.climb) * Math.min(1, dt * 0.8);
    const L = 6 + f.climb * 4;                       // the string pays out as it climbs
    const elev = 0.25 + f.climb * 0.3;               // radians above level (kept low enough to stay in view)
    const sway = Math.sin(f.t * 0.9) * 0.35 + Math.sin(f.t * 2.3) * 0.08;
    const back = this.windDir + sway;
    const want = V.set(Math.sin(back) * Math.cos(elev) * L, Math.sin(elev) * L, Math.cos(back) * Math.cos(elev) * L).add(hand);
    want.y = Math.max(want.y, hand.y + 1.2);
    // spring toward where the wind holds it, with a little bob
    const k = 2.2;
    f.vel.addScaledVector(V2.copy(want).sub(f.pos), k * dt).multiplyScalar(Math.max(0, 1 - dt * 1.8));
    f.vel.y += Math.sin(f.t * 3.1) * 0.25 * dt;
    f.pos.addScaledVector(f.vel, dt);
    // never further than the string allows
    const d = f.pos.distanceTo(hand);
    if (d > L * 1.05) f.pos.sub(hand).multiplyScalar((L * 1.05) / d).add(hand);
    f.kite.position.copy(f.pos);
    // face the kid (the wind comes from them), nose up into the wind, rolling with the sway
    f.kite.lookAt(hand.x, f.pos.y, hand.z);
    f.kite.rotateX(-0.5 - f.climb * 0.2);
    f.kite.rotateZ(sway * 0.6);
    if (f.loop > 0) {
      const step = Math.min(f.loop, dt * 7);
      f.loop -= step;
      f.spin += step;
      f.kite.rotateZ(f.spin);
      if (f.loop <= 0) f.spin = 0;
    }
    // the tail streams and wiggles behind
    f.tail.forEach((b, i) => {
      b.position.x = Math.sin(f.t * 5 - i * 0.9) * 0.06 * (i + 1);
    });
    // the string: a soft sag from hand to kite
    const arr = (f.line.geometry.getAttribute("position") as THREE.BufferAttribute);
    const sag = 0.12 * L * (1 - f.climb * 0.5);
    for (let i = 0; i < STRING_PTS; i++) {
      const u = i / (STRING_PTS - 1);
      V3.copy(hand).lerp(f.pos, u);
      V3.y -= Math.sin(u * Math.PI) * sag;
      arr.setXYZ(i, V3.x, V3.y, V3.z);
    }
    arr.needsUpdate = true;
  }

  /** Everyone holding a kite. */
  holders(): object[] {
    return [...this.flying.keys()];
  }

  clear(): void {
    for (const who of [...this.flying.keys()]) this.giveBack(who);
    this.group.clear();
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.lineMatCache = null;
    this.shown = [];
    this.stall = null;
  }

  // ── the kites ────────────────────────────────────────────────────────────
  private makeKite(k: number): { group: THREE.Group; tail: THREE.Object3D[] } {
    const [a, b] = COLORS[k % COLORS.length];
    const g = new THREE.Group();
    // the sail: a diamond of four triangles in two colours (taller below the cross spar)
    const top = 0.42, bot = 0.78, half = 0.4;
    const tri = (pts: number[], c: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      geo.computeVertexNormals();
      this.owned.push(geo);
      const m = new THREE.Mesh(geo, this.mat(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide })));
      m.castShadow = true;
      g.add(m);
    };
    tri([0, top, 0, -half, 0, 0.03, 0, 0, 0.06], a);
    tri([0, top, 0, 0, 0, 0.06, half, 0, 0.03], b);
    tri([-half, 0, 0.03, 0, -bot, 0, 0, 0, 0.06], b);
    tri([0, 0, 0.06, 0, -bot, 0, half, 0, 0.03], a);
    // spars
    const spar = this.mat(new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }));
    const s1 = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.012, 0.012, top + bot, 5)), spar);
    s1.position.set(0, (top - bot) / 2, 0.035);
    g.add(s1);
    const s2 = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.012, 0.012, half * 2, 5)), spar);
    s2.rotation.z = Math.PI / 2;
    s2.position.z = 0.035;
    g.add(s2);
    // the tail: a string of little bows
    const bowGeo = this.geo(new THREE.ConeGeometry(0.06, 0.14, 3));
    const tail: THREE.Object3D[] = [];
    let parent: THREE.Object3D = g;
    for (let i = 0; i < TAIL_BOWS; i++) {
      const bow = new THREE.Group();
      bow.position.y = i === 0 ? -bot - 0.12 : -0.2;
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(bowGeo, this.mat(new THREE.MeshStandardMaterial({ color: i % 2 ? a : b, roughness: 0.7 })));
        c.rotation.z = side * Math.PI / 2;
        c.position.x = side * 0.06;
        bow.add(c);
      }
      parent.add(bow);
      tail.push(bow);
      parent = bow;
    }
    return { group: g, tail };
  }

  private lineMatCache: THREE.LineBasicMaterial | null = null;
  private lineMat(): THREE.LineBasicMaterial {
    if (!this.lineMatCache) this.lineMatCache = this.mat(new THREE.LineBasicMaterial({ color: 0xf5f0e6 }));
    return this.lineMatCache;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.owned.push(m);
    return m;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.owned.push(g);
    return g;
  }
}

let awning: THREE.CanvasTexture | null = null;
function awningTex(): THREE.CanvasTexture {
  if (awning) return awning;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 32;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? "#ffffff" : "#3fa7ff";
    g.fillRect(i * 16, 0, 16, 32);
  }
  awning = new THREE.CanvasTexture(c);
  awning.colorSpace = THREE.SRGBColorSpace;
  return awning;
}
