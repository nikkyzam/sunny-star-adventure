/**
 * castle.ts — a castle to explore, drawn in code: stone curtain walls with battlements and a
 * walkway along the top (stairs up from the courtyard), round towers bulging out at each corner
 * with pointed roofs and waving flags, a gatehouse with a raised portcullis and the castle's
 * name, and a tall keep in the courtyard with stairs up its side to a lookout on the roof.
 * Banners, torches, a well and a throne fill the courtyard.
 *
 * world.ts calls buildCastle() for each of a level's `castles`, handing over its scene group,
 * walkable platforms, solid boxes and per-frame animations (the flags).
 */

import * as THREE from "three";
import type { Platform } from "./world";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { textTexture } from "./bethlehem";
import { currentSeason, type Season } from "./seasons";

export interface CastleDef {
  x: number; z: number;
  /** Which way the gate faces, in quarter turns: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X. */
  turn?: number;
  /** Half the width of the courtyard (default 8). */
  size?: number;
  /** Colours: the stone, the tower roofs, the flags and banners. */
  stone?: number;
  roof?: number;
  flag?: number;
  /** Written over the gate. */
  name?: string;
  /** Ground height it stands on (default 0.3, a meadow). */
  y?: number;
  /** A friendly dragon lives on the keep and flies kids round this route (world points). */
  dragon?: [number, number, number][];
}

/** What a built castle offers the rest of the game. */
export interface CastleInfo {
  /** The middle of the keep's roof, and the way the gate faces. */
  perch: THREE.Vector3;
  facing: number;
  centre: THREE.Vector3;
  /** The bell in the courtyard: where it hangs, and ringing it (swings, doves fly up). */
  bell: { pos: THREE.Vector3; ring: () => void };
  /** The throne: the top of its cushion, and the way someone sitting on it faces. */
  throne: { seat: THREE.Vector3; facing: number };
  /** The helter-skelter: where to get on (on the wall walkway), and the slide's path (world points). */
  slide: { board: THREE.Vector3; path: THREE.CatmullRomCurve3 };
  /** The fireworks crate over the gate, and lighting it (false while the last lot is still going). */
  fireworks: { pos: THREE.Vector3; launch: () => boolean };
  /** The armour stand: a knight's helmet and a shield to try on. */
  armour: { pos: THREE.Vector3 };
  /** Singing stones in the courtyard: where each one is (low to high notes), one to press, one to glow. */
  chimes: { stones: THREE.Vector3[]; press: (i: number) => void; guide: (i: number) => void };
  /** The king's treasure hunt: golden keys to pick up (hide one when found) and the chest they open. */
  treasure: { keys: THREE.Vector3[]; take: (i: number) => void; chest: THREE.Vector3; open: () => void; reset: () => void };
  /** Peacocks strolling in the courtyard: where each is, and asking one to fan its tail. */
  peacocks: { pos: THREE.Vector3[]; show: (i: number) => void };
  /** The bouncy castle: its floor (a world box at floor height) and a wobble when someone bounces. */
  bouncy: { min: THREE.Vector3; max: THREE.Vector3; squish: () => void };
  /** The catapult: where to stand to fire it, firing (false while busy), and hearing where the ball lands. */
  /** The bread oven: where to stand, baking (false if busy or a loaf is waiting), and the loaf. */
  oven: { pos: THREE.Vector3; bake: () => boolean; baking: () => boolean; ready: () => boolean; take: () => void };
  /** The puppet theatre: where to watch, starting Noah's Ark (false if it's on), and which scene is on (-1 = none). */
  theatre: { pos: THREE.Vector3; play: () => boolean; scene: () => number; story: () => number };
  /** The flower garden: where each bud is, watering one (false if busy or done), how many have bloomed. */
  garden: { buds: THREE.Vector3[]; water: (i: number) => boolean; bloomed: () => number; watered: (i: number) => boolean; reset: () => void };
  /** The rope swing: the top bar's middle, the rope length, the way it swings out, and posing it (radians). */
  swing: { pivot: THREE.Vector3; rope: number; dir: THREE.Vector3; facing: number; set: (a: number) => void };
  /** The fishing jetty: where to stand, what the line is doing, casting, reeling in (the fish kind, or -1). */
  fishing: { pos: THREE.Vector3; state: () => "idle" | "wait" | "bite" | "catch"; cast: () => boolean; reel: () => number; gotAway: () => boolean };
  /** The sandcastle on the beach: where to stand, how built it is (0-4), building the next bit, and the wave. */
  sandcastle: { pos: THREE.Vector3; stage: () => number; washing: () => boolean; build: () => number; wash: () => void };
  /** The season's dressing: what it is, the spot to give thanks / light the tree, and Easter eggs to find. */
  seasonal: { kind: Season; spot: THREE.Vector3 | null; lightTree: () => void; eggs: THREE.Vector3[]; takeEgg: (i: number) => void; resetEggs: () => void };
  catapult: { pos: THREE.Vector3; raft: THREE.Vector3; aim: THREE.Vector3; fire: () => boolean; onLand: ((hit: boolean, close: boolean, at: THREE.Vector3) => void) | null };
}

interface Solid { minX: number; maxX: number; minZ: number; maxZ: number; topY: number }

export interface CastleWorld {
  group: THREE.Group;
  platforms: Platform[];
  solids: Solid[];
  anim: ((t: number, dt: number) => void)[];
}

/** Stone blocks in staggered rows, pale so each castle's stone colour tints it. */
let stoneTex: THREE.CanvasTexture | null = null;
function stoneTexture(): THREE.CanvasTexture {
  if (stoneTex) return stoneTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#9a958c"; // mortar
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = 4, rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 3, cw = 256 / cols, off = (r % 2) * cw / 2;
    for (let k = -1; k < cols; k++) {
      const x = k * cw + off, l = 200 + rnd() * 45;
      ctx.fillStyle = `rgb(${l},${l - 4 - rnd() * 6},${l - 12 - rnd() * 8})`;
      ctx.fillRect(x + 3, r * rh + 3, cw - 6, rh - 6);
      // a lighter top edge and a few speckles, so the blocks look chiselled
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x + 3, r * rh + 3, cw - 6, 4);
      for (let s = 0; s < 14; s++) {
        ctx.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.06})`;
        ctx.fillRect(x + 5 + rnd() * (cw - 12), r * rh + 6 + rnd() * (rh - 12), 3, 3);
      }
    }
  }
  stoneTex = new THREE.CanvasTexture(c);
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  stoneTex.colorSpace = THREE.SRGBColorSpace;
  stoneTex.anisotropy = 4;
  return stoneTex;
}

const UNIT = 2.2; // metres of wall per repeat of the stone texture

/** Box UVs in metres, so the blocks are the same size on every wall. */
function stoneBox(sx: number, sy: number, sz: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.getAttribute("uv");
  const dims: [number, number][] = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const v = f * 4 + i;
      uv.setXY(v, (uv.getX(v) * dims[f][0]) / UNIT, (uv.getY(v) * dims[f][1]) / UNIT);
    }
  }
  return g;
}
function stoneTower(r: number, h: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, 20, 1);
  const uv = g.getAttribute("uv");
  for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) * Math.PI * 2 * r) / UNIT, (uv.getY(v) * h) / UNIT);
  return g;
}

export function buildCastle(w: CastleWorld, c: CastleDef, base: number): CastleInfo {
  const S = c.size ?? 8;          // half the courtyard
  const H = 4.5;                  // wall height (the walkway on top)
  const T = 1.4;                  // wall thickness
  const G = 3.6, GH = 3.6;        // the gate opening
  const turn = ((c.turn ?? 0) % 4 + 4) % 4;
  const th = (turn * Math.PI) / 2, cos = Math.round(Math.cos(th)), sin = Math.round(Math.sin(th));
  const g = new THREE.Group();
  g.position.set(c.x, base, c.z);
  g.rotation.y = th;
  w.group.add(g);

  // local (x, z) → world, and boxes with their half sizes swapped on a quarter turn
  const wx = (lx: number, lz: number) => c.x + lx * cos + lz * sin;
  const wz = (lx: number, lz: number) => c.z - lx * sin + lz * cos;
  const swap = turn % 2 === 1;
  const solid = (lx: number, lz: number, hw: number, hd: number, top: number) => {
    const [a, b] = swap ? [hd, hw] : [hw, hd];
    const x = wx(lx, lz), z = wz(lx, lz);
    w.solids.push({ minX: x - a, maxX: x + a, minZ: z - b, maxZ: z + b, topY: base + top });
  };
  const plat = (lx: number, lz: number, hw: number, hd: number, top: number) => {
    const [a, b] = swap ? [hd, hw] : [hw, hd];
    const x = wx(lx, lz), z = wz(lx, lz);
    w.platforms.push({ kind: "box", x, z, r: 0, hw: a, hd: b, topY: base + top, spring: 0, baseX: x, baseZ: z, dx: 0, dz: 0, mesh: new THREE.Object3D(), squashT: 0 });
  };

  // one material per look, shared, so parts that look the same can be joined into one draw
  // (nothing may change a std() material later; things that glow or fade make their own)
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const std = (color: number | THREE.Color, rough = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const key = JSON.stringify([color instanceof THREE.Color ? color.getHex() : color, rough, extra], (_k, v) => (v && v.isTexture ? v.uuid : v && v.isColor ? v.getHex() : v));
    let m = mats.get(key);
    // smooth shading everywhere: faceted low-poly surfaces read as toy-like rather than real
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra, flatShading: false }); mats.set(key, m); }
    return m;
  };
  const stone = std(c.stone ?? 0xd9d2c3, 0.95, { map: stoneTexture() });
  const darkStone = std(new THREE.Color(c.stone ?? 0xd9d2c3).multiplyScalar(0.78).getHex(), 0.95, { map: stoneTexture() });
  const roofM = std(c.roof ?? 0x3f6fc4, 0.7, { flatShading: true });
  const flagM = std(c.flag ?? 0xff6b9d, 0.8, { side: THREE.DoubleSide });
  const wood = std(0x7a4f2a, 0.9);
  const iron = std(0x3a3a42, 0.5, { metalness: 0.5 });
  const gold = std(0xe8b830, 0.4, { metalness: 0.6, emissive: 0x3a2a00 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffb23e });
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const block = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => mesh(stoneBox(sx, sy, sz), m, x, y, z);

  // ── the flag: one cloth shared by every pole, rippling in the wind ──
  const cloth = new THREE.PlaneGeometry(1.5, 0.9, 10, 2);
  cloth.translate(0.75, 0, 0);
  const rest = Float32Array.from(cloth.getAttribute("position").array as Float32Array);
  w.anim.push((t) => {
    const p = cloth.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = rest[i * 3];
      p.setZ(i, Math.sin(t * 5 - x * 3.2) * 0.13 * x);
      p.setY(i, rest[i * 3 + 1] - x * x * 0.03);
    }
    p.needsUpdate = true;
    cloth.computeVertexNormals();
  });
  const flagPole = (x: number, y: number, z: number, h = 2.2) => {
    mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), wood, x, y + h / 2, z);
    mesh(new THREE.SphereGeometry(0.1, 8, 6), gold, x, y + h + 0.05, z);
    const f = new THREE.Mesh(cloth, flagM);
    f.userData.keep = true;
    f.position.set(x + 0.04, y + h - 0.5, z);
    g.add(f);
  };

  // battlements along a wall top: merlons on the outside edge
  const merlons = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 1.15));
    for (let i = 0; i <= n; i += 1) {
      if (i % 2 === 1) continue;
      const k = i / n;
      const along = x1 !== x0;
      block(stone, along ? 0.6 : 0.35, 0.65, along ? 0.35 : 0.6, x0 + (x1 - x0) * k, y + 0.32, z0 + (z1 - z0) * k);
    }
  };

  // ── the curtain walls: back, two sides, and the front either side of the gate ──
  const walls: [number, number, number, number][] = [
    [0, -S, 2 * S + T, T],                                    // back
    [-S, 0, T, 2 * S + T], [S, 0, T, 2 * S + T],              // sides
  ];
  const seg = S - G / 2;
  for (const sx of [-1, 1]) walls.push([sx * (G / 2 + seg / 2 + T / 4), S, seg + T / 2, T]); // front, either side of the gate
  for (const [x, z, sx, sz] of walls) {
    block(stone, sx, H, sz, x, H / 2, z);
    solid(x, z, sx / 2, sz / 2, H);
    plat(x, z, sx / 2, sz / 2, H);
  }
  // over the gate: the walkway carries on, the arch stays open below
  block(stone, G + 0.2, H - GH, T, 0, GH + (H - GH) / 2, S);
  plat(0, S, G / 2, T / 2, H);
  // a low parapet along the outside of the walkway (merlons on top); solid, so nobody walks off
  const outer = S + T / 2 - 0.15;
  for (const [x0, z0, x1, z1] of [[-S, -outer, S, -outer], [-outer, -S, -outer, S], [outer, -S, outer, S], [-S, outer, S, outer]] as const) {
    const along = z0 === z1;
    block(stone, along ? 2 * S + T : 0.3, 0.5, along ? 0.3 : 2 * S + T, (x0 + x1) / 2, H + 0.25, (z0 + z1) / 2);
    merlons(x0, z0, x1, z1, H + 0.5);
    solid((x0 + x1) / 2, (z0 + z1) / 2, along ? S + T / 2 : 0.15, along ? 0.15 : S + T / 2, H + 1.1);
  }

  // ── round towers bulging out at the corners, with pointed roofs and flags ──
  const TR = 1.9, TH = H + 3.2, off = 1.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (S + off), z = sz * (S + off);
    mesh(stoneTower(TR, TH), stone, x, TH / 2, z);
    // a ring of merlons and a band of darker stone under them
    mesh(stoneTower(TR + 0.15, 0.35), darkStone, x, TH - 0.15, z);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = block(stone, 0.5, 0.6, 0.35, x + Math.cos(a) * TR, TH + 0.3, z + Math.sin(a) * TR);
      m.rotation.y = -a + Math.PI / 2;
    }
    mesh(new THREE.ConeGeometry(TR + 0.35, 3.6, 16), roofM, x, TH + 0.45 + 1.8, z);
    flagPole(x, TH + 0.45 + 3.4, z, 1.6);
    // arrow-slit windows
    for (const y of [2.2, H + 1.2]) {
      const slit = mesh(new THREE.BoxGeometry(0.22, 0.9, 0.1), iron, x + sx * 0.0, y, z + sz * TR);
      slit.position.x = x - sx * Math.sin(0.6) * 0.4;
    }
    solid(x, z, TR * 0.72, TR * 0.72, TH + 0.6);
  }

  // ── the gatehouse: two little towers, the portcullis raised, the castle's name above ──
  for (const sx of [-1, 1]) {
    const x = sx * (G / 2 + 1.0), z = S + T / 2 + 0.9;
    mesh(stoneTower(1.1, H + 1.6), stone, x, (H + 1.6) / 2, z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const m = block(stone, 0.4, 0.5, 0.3, x + Math.cos(a) * 1.1, H + 1.85, z + Math.sin(a) * 1.1);
      m.rotation.y = -a + Math.PI / 2;
    }
    solid(x, z + 0.1, 0.8, 0.8, H + 1.6);
    // a torch either side of the gate
    torch(x - sx * 0.2, 2.6, z + 1.12);
  }
  // a frame of darker stone round the opening
  for (const sx of [-1, 1]) block(darkStone, 0.35, GH, 0.2, sx * (G / 2 + 0.12), GH / 2, S + T / 2 + 0.05);
  block(darkStone, G + 0.6, 0.35, 0.2, 0, GH + 0.05, S + T / 2 + 0.05);
  // the portcullis, raised: its iron teeth hang at the top of the gate
  for (let i = -3; i <= 3; i++) mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), iron, i * 0.48, GH - 0.45, S + T / 2 - 0.2);
  mesh(new THREE.BoxGeometry(G, 0.1, 0.1), iron, 0, GH - 0.15, S + T / 2 - 0.2);
  // wooden gate doors swung open against the walls inside
  for (const sx of [-1, 1]) {
    const door = mesh(new THREE.BoxGeometry(G / 2 - 0.1, GH - 0.3, 0.15), wood, sx * (G / 2 + 0.05), (GH - 0.3) / 2, S - T / 2 - 0.9);
    door.rotation.y = sx * Math.PI / 2;
    door.position.x = sx * (G / 2 - 0.05);
    for (const y of [0.7, 2.3]) mesh(new THREE.BoxGeometry(0.17, 0.12, G / 2 - 0.15), iron, sx * (G / 2 - 0.05), y, S - T / 2 - 0.9);
  }
  if (c.name) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.08), new THREE.MeshStandardMaterial({ map: textTexture(c.name, "#5e3b1f", "#ffe9a8"), roughness: 0.8 }));
    sign.position.set(0, GH + 0.6, S + T / 2 + 0.07);
    g.add(sign);
  }
  // a wooden bridge of planks leading up to the gate
  for (let i = 0; i < 7; i++) mesh(new THREE.BoxGeometry(G - 0.2, 0.08, 0.5), wood, 0, 0.04, S + T / 2 + 0.4 + i * 0.55);

  // ── banners on the inside walls and torches between them ──
  const bannerGeo = new THREE.PlaneGeometry(1.1, 2.0);
  for (const [x, z, ry] of [[S - T / 2 - 0.02, -3.4, -Math.PI / 2], [S - T / 2 - 0.02, 1.0, -Math.PI / 2]] as const) {
    const b = new THREE.Mesh(bannerGeo, flagM);
    b.position.set(x, H - 1.6, z);
    b.rotation.y = ry;
    g.add(b);
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.28, 5), gold);
    star.position.set(x + Math.sign(ry) * 0.01, H - 1.4, z);
    star.rotation.y = ry;
    g.add(star);
  }
  for (const z of [-1.2, 3.2]) torch(S - T / 2 - 0.15, 2.4, z);

  // ── stairs up the inside of the left wall, from the front to the walkway at the back ──
  {
    const sx = -S + T / 2 + 0.65;
    const z0 = S - T / 2 - 1.6, z1 = -S + T / 2 + 2.6;
    const n = Math.ceil(H / 0.3), depth = (z0 - z1) / n;
    for (let i = 0; i < n; i++) {
      const top = ((i + 1) * H) / n;
      const sz = z0 - depth * (i + 0.5);
      block(darkStone, 1.3, top, depth, sx, top / 2, sz);
      plat(sx, sz, 0.65, depth / 2, top);
      if (i > 1) solid(sx, sz, 0.65, depth / 2, top - (2 * H) / n);
    }
    // the landing at the top joins the walkway
    block(darkStone, 1.3, H, 2.4, sx, H / 2, z1 - 1.2);
    plat(sx, z1 - 1.2, 0.65, 1.2, H);
    solid(sx, z1 - 1.2, 0.65, 1.2, H);
  }

  // ── the keep: a tall square tower at the back, stairs up its right side to the lookout ──
  {
    const kw = 5, kd = 4.4, kh = 8.5, kz = -S + T / 2 + kd / 2 + 1.6;
    block(stone, kw, kh, kd, 0, kh / 2, kz);
    solid(0, kz, kw / 2, kd / 2, kh);
    plat(0, kz, kw / 2, kd / 2, kh);
    // a big wooden door, windows, and battlements round the roof
    mesh(new THREE.BoxGeometry(1.4, 2.4, 0.1), wood, 0, 1.2, kz + kd / 2 + 0.03);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), wood);
    top.position.set(0, 2.4, kz + kd / 2 + 0.03);
    g.add(top);
    const glass = std(0x2b3550, 0.3, { emissive: 0x1a2440 });
    for (const sx of [-1, 1]) for (const y of [3.6, 6.4]) mesh(new THREE.BoxGeometry(0.6, 1.0, 0.08), glass, sx * 1.4, y, kz + kd / 2 + 0.03);
    mesh(new THREE.BoxGeometry(0.6, 1.0, 0.08), glass, 0, 6.4, kz + kd / 2 + 0.03);
    for (const [x0, z0, x1, z1] of [[-kw / 2, kz - kd / 2, kw / 2, kz - kd / 2], [-kw / 2, kz + kd / 2, kw / 2, kz + kd / 2], [-kw / 2, kz - kd / 2, -kw / 2, kz + kd / 2]] as const) {
      const along = z0 === z1;
      block(stone, along ? kw : 0.3, 0.5, along ? 0.3 : kd, (x0 + x1) / 2, kh + 0.25, (z0 + z1) / 2);
      merlons(x0, z0, x1, z1, kh + 0.5);
      solid((x0 + x1) / 2, (z0 + z1) / 2, along ? kw / 2 : 0.15, along ? 0.15 : kd / 2, kh + 1.1);
    }
    flagPole(-kw / 2 + 0.5, kh, kz - kd / 2 + 0.5, 3.2);
    // stairs up the +X side, from the front corner to the roof at the back, then a landing
    const sx = kw / 2 + 0.7;
    const n = Math.ceil(kh / 0.3);
    const z0 = kz + kd / 2 + 4.2, z1 = kz - kd / 2 + 0.6;
    const depth = (z0 - z1) / n;
    for (let i = 0; i < n; i++) {
      const tp = ((i + 1) * kh) / n;
      const sz = z0 - depth * (i + 0.5);
      block(darkStone, 1.4, tp, depth, sx, tp / 2, sz);
      plat(sx, sz, 0.7, depth / 2, tp);
      if (i > 1) solid(sx, sz, 0.7, depth / 2, tp - (2 * kh) / n);
    }
    // a rail along the open side of the stairs, so it feels safe
    const railLen = Math.hypot(z0 - z1, kh);
    const rail = mesh(new THREE.BoxGeometry(0.1, 0.1, railLen), wood, sx + 0.68, kh / 2 + 0.85, (z0 + z1) / 2);
    rail.rotation.x = Math.atan2(kh, z0 - z1);
    // the throne by the keep door, under a canopy
    const tx = -kw / 2 - 1.6, tz = kz + kd / 2 + 1.2;
    const red = std(c.flag ?? 0xb0303a, 0.8);
    mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), stone, tx, 0.15, tz);
    mesh(new THREE.BoxGeometry(0.9, 0.5, 0.8), gold, tx, 0.55, tz);
    mesh(new THREE.BoxGeometry(0.9, 1.4, 0.15), gold, tx, 1.25, tz - 0.4);
    mesh(new THREE.BoxGeometry(0.75, 0.12, 0.65), red, tx, 0.86, tz + 0.02);
    mesh(new THREE.BoxGeometry(0.7, 1.1, 0.05), red, tx, 1.3, tz - 0.31);
    mesh(new THREE.ConeGeometry(0.16, 0.3, 5), gold, tx, 2.1, tz - 0.4);
    solid(tx, tz, 0.6, 0.5, 0.3);
  }

  // ── a royal banquet table between the keep stairs and the wall, with a bench, plates and candles ──
  {
    const x = S - T / 2 - 1.9, z0 = -3.6, z1 = 0.6, zc = (z0 + z1) / 2, len = z1 - z0;
    const cloth = std(0xfdf6e3, 0.9), runner = std(c.flag ?? 0xb0303a, 0.8);
    mesh(new THREE.BoxGeometry(1.1, 0.08, len), wood, x, 0.78, zc);
    mesh(new THREE.BoxGeometry(1.16, 0.02, len + 0.06), cloth, x, 0.83, zc);
    mesh(new THREE.BoxGeometry(0.36, 0.022, len + 0.1), runner, x, 0.845, zc);
    for (const dz of [-1, 1]) for (const dx of [-1, 1]) mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), wood, x + dx * 0.45, 0.39, zc + dz * (len / 2 - 0.2));
    // a bench along the wall side
    mesh(new THREE.BoxGeometry(0.4, 0.07, len), wood, x + 0.95, 0.46, zc);
    for (const dz of [-1, 1]) mesh(new THREE.BoxGeometry(0.34, 0.46, 0.08), wood, x + 0.95, 0.23, zc + dz * (len / 2 - 0.25));
    const plate = std(0xf2f2f2, 0.4), goblet = gold;
    for (let i = 0; i < 4; i++) {
      const pz = z0 + 0.5 + i * ((len - 1) / 3);
      mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.03, 14), plate, x + 0.3, 0.86, pz);
      mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.18, 8), goblet, x + 0.3, 0.95, pz + 0.27);
    }
    // candles (their flames flicker) and a big roast-free fruit bowl
    for (const pz of [z0 + 0.35, z1 - 0.35]) {
      mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10), gold, x, 0.87, pz);
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8), std(0xfff3d6, 0.7), x, 1.0, pz);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 6), flame);
      f.userData.keep = true;
      f.position.set(x, 1.18, pz);
      g.add(f);
      w.anim.push((t) => { f.scale.set(1, 0.8 + Math.sin(t * 11 + pz) * 0.2, 1); });
    }
    const bowl = mesh(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), gold, x - 0.05, 1.07, zc);
    bowl.scale.y = 0.6;
    for (const [dx, dz, col] of [[0, 0, 0xe63946], [0.09, 0.08, 0x8bc34a], [-0.08, 0.06, 0xffb703], [0.03, -0.1, 0x7b2cbf], [-0.06, -0.07, 0xe63946]] as const) {
      mesh(new THREE.SphereGeometry(0.07, 8, 6), std(col, 0.5), x - 0.05 + dx, 0.98 + 0.08, zc + dz);
    }
    solid(x, zc, 0.58, len / 2, 0.85);
    solid(x + 0.95, zc, 0.2, len / 2, 0.5);
  }

  // ── the well in the courtyard ──
  {
    const x = S - T / 2 - 2.2, z = 4.6;
    mesh(stoneTower(0.8, 0.8), stone, x, 0.4, z);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16).rotateX(-Math.PI / 2), std(0x3d7bd9, 0.2, { emissive: 0x0d2a55 }));
    water.position.set(x, 0.6, z);
    g.add(water);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), wood, x + sx * 0.75, 1.3, z);
    const roof = mesh(new THREE.ConeGeometry(1.05, 0.7, 4).rotateY(Math.PI / 4), roofM, x, 2.4, z);
    roof.scale.z = 0.8;
    solid(x, z, 0.8, 0.8, 0.8);
  }

  // cobbles in the courtyard
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(2 * S - T, 2 * S - T).rotateX(-Math.PI / 2), std(0xbdb3a2, 1, { map: stoneTexture() }));
  const uv = yard.geometry.getAttribute("uv");
  for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * (2 * S) / 1.4, uv.getY(v) * (2 * S) / 1.4);
  yard.position.y = 0.02;
  yard.receiveShadow = true;
  g.add(yard);

  mergeByMaterial(g);

  // ── a bell on a wooden frame by the gate path: ring it and doves fly up from the towers ──
  const bellAt = { x: -3.6, z: 4.2 };
  const swing = new THREE.Group();
  {
    const { x, z } = bellAt;
    const frame = std(0x6b4423, 0.9);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), frame, x + sx * 0.75, 1.3, z);
    mesh(new THREE.BoxGeometry(1.8, 0.2, 0.26), frame, x, 2.65, z);
    mesh(new THREE.ConeGeometry(1.2, 0.5, 4).rotateY(Math.PI / 4), roofM, x, 3.0, z).scale.z = 0.4;
    mesh(new THREE.BoxGeometry(1.0, 0.12, 0.6), stone, x, 0.06, z);
    swing.position.set(x, 2.55, z);
    g.add(swing);
    const bronze = std(0xd9a441, 0.35, { metalness: 0.7, emissive: 0x2a1a00 });
    const pts = [[0.05, 0], [0.18, -0.05], [0.24, -0.25], [0.3, -0.5], [0.42, -0.7], [0.44, -0.76], [0, -0.76]].map(([r, y]) => new THREE.Vector2(r, y));
    const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), bronze);
    bell.castShadow = true;
    swing.add(bell);
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), iron);
    clapper.position.y = -0.7;
    swing.add(clapper);
    // a rope to pull
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5), std(0xd8c39a));
    rope.position.set(0.25, -1.3, 0);
    swing.add(rope);
    solid(x, z, 0.85, 0.15, 2.7);
  }
  let swingT = 99;
  w.anim.push((_t, dt) => {
    swingT += dt;
    swing.rotation.z = Math.sin(swingT * 7) * 0.55 * Math.exp(-swingT * 0.9);
  });

  // doves: white birds that burst from the tower tops and the keep, circle up and fly away
  const doveBody = new THREE.SphereGeometry(0.13, 8, 6).scale(0.8, 0.75, 1.5);
  const doveWing = new THREE.PlaneGeometry(0.34, 0.16).translate(0.17, 0, 0).rotateX(-Math.PI / 2);
  const doveM = std(0xffffff, 0.6, { side: THREE.DoubleSide, emissive: 0x777777 });
  const beakM = std(0xffa53a);
  const doves: { o: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; v: THREE.Vector3; turn: number; age: number }[] = [];
  const roofs: [number, number, number][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) roofs.push([sx * (S + 1.6), H + 3.2 + 1.2, sz * (S + 1.6)]);
  roofs.push([0, 9.3, -S + T / 2 + 2.2 + 1.6]);
  w.anim.push((_t, dt) => {
    for (let i = doves.length - 1; i >= 0; i--) {
      const d = doves[i];
      d.age += dt;
      d.v.applyAxisAngle(THREE.Object3D.DEFAULT_UP, d.turn * dt);
      d.v.y = Math.max(0.6, d.v.y - dt * 0.5);
      d.o.position.addScaledVector(d.v, dt);
      d.o.rotation.y = Math.atan2(d.v.x, d.v.z);
      const flap = Math.sin(d.age * 22 + i) * 0.9;
      d.wl.rotation.z = flap;
      d.wr.rotation.z = -flap;
      if (d.age > 9) {
        w.group.remove(d.o);
        doves.splice(i, 1);
      }
    }
  });
  const release = () => {
    if (doves.length > 30) return;
    for (const [lx, ly, lz] of roofs) for (let k = 0; k < 3; k++) {
      const o = new THREE.Group();
      o.scale.setScalar(1.5);
      o.add(new THREE.Mesh(doveBody, doveM));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), doveM);
      head.position.set(0, 0.07, 0.2);
      o.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4).rotateX(Math.PI / 2), beakM);
      beak.position.set(0, 0.06, 0.3);
      o.add(beak);
      const wl = new THREE.Group(), wr = new THREE.Group();
      wl.add(new THREE.Mesh(doveWing, doveM));
      const m2 = new THREE.Mesh(doveWing, doveM);
      m2.scale.x = -1;
      wr.add(m2);
      o.add(wl, wr);
      o.position.set(wx(lx, lz) + (Math.random() - 0.5), base + ly + Math.random() * 0.5, wz(lx, lz) + (Math.random() - 0.5));
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 2;
      w.group.add(o);
      doves.push({ o, wl, wr, v: new THREE.Vector3(Math.sin(a) * sp, 2 + Math.random() * 1.5, Math.cos(a) * sp), turn: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6), age: 0 });
    }
  };

  // ── a helter-skelter outside the side wall: a striped tower with a slide spiralling round it ──
  // from a little deck on the walkway the chute crosses the wall, winds twice round the tower and
  // runs out into a big pile of hay
  const SX = S + 3.4, SZ = 0.4, SR = 2.1, ST = 1.2, TOPY = H + 1.35;
  const slidePts: THREE.Vector3[] = [new THREE.Vector3(S - 0.3, TOPY, SZ - SR), new THREE.Vector3(S + 1.6, TOPY - 0.2, SZ - SR)];
  {
    const turns = 2, y0 = TOPY - 0.45, y1 = 0.75, n = turns * 16;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 - (i / n) * turns * Math.PI * 2; // from the wall side, heading outward
      slidePts.push(new THREE.Vector3(SX + Math.cos(a) * SR, y0 + (y1 - y0) * (i / n), SZ - Math.sin(a) * SR));
    }
    slidePts.push(new THREE.Vector3(SX + 1.6, 0.55, SZ - SR), new THREE.Vector3(SX + 3.2, 0.4, SZ - SR));
  }
  const slideLocal = new THREE.CatmullRomCurve3(slidePts, false, "centripetal");
  {
    const chuteM = std(0xffc93c, 0.45, { side: THREE.DoubleSide });
    const chute = new THREE.Mesh(troughGeometry(slideLocal, 260, 0.5), chuteM);
    chute.castShadow = true;
    chute.receiveShadow = true;
    g.add(chute);
    // the tower: red and white bands, a pointed roof and a flag
    const bands = 9, bandH = (TOPY + 0.9) / bands;
    const red = std(0xe8434f, 0.7), white = std(0xfdf6e3, 0.7);
    for (let i = 0; i < bands; i++) mesh(new THREE.CylinderGeometry(ST, ST, bandH, 18), i % 2 ? white : red, SX, bandH * (i + 0.5), SZ);
    mesh(new THREE.ConeGeometry(ST + 0.5, 2.0, 18), roofM, SX, TOPY + 0.9 + 1.0, SZ);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), wood, SX, TOPY + 2.9 + 0.65, SZ);
    const pennant = mesh(new THREE.ConeGeometry(0.22, 0.8, 3).rotateZ(-Math.PI / 2), flagM, SX + 0.4, TOPY + 3.4, SZ);
    w.anim.push((t) => { pennant.rotation.x = Math.sin(t * 4) * 0.25; });
    // brackets from the tower out under the chute
    for (let i = 4; i < slidePts.length - 2; i += 2) {
      const pt = slidePts[i];
      const dx = pt.x - SX, dz = pt.z - SZ, d = Math.hypot(dx, dz);
      const arm = mesh(new THREE.BoxGeometry(d - ST + 0.1, 0.1, 0.1), wood, SX + (dx / d) * (ST + d) / 2, pt.y - 0.12, SZ + (dz / d) * (ST + d) / 2);
      arm.rotation.y = -Math.atan2(dz, dx);
    }
    // legs under the bridge over the wall, and a little deck to climb on at the top
    for (const dz of [-0.4, 0.4]) mesh(new THREE.CylinderGeometry(0.07, 0.07, TOPY, 6), wood, S + 1.5, TOPY / 2, SZ - SR + dz);
    const deck = std(0x9b6a3c, 0.9);
    mesh(new THREE.BoxGeometry(0.9, 0.3, 1.1), deck, S - 0.3, H + 0.15, SZ - SR);
    plat(S - 0.3, SZ - SR, 0.45, 0.55, H + 0.3);
    // a sign: "Slide!" with an arrow
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.36, 0.06), new THREE.MeshStandardMaterial({ map: textTexture("Slide!", "#e8434f", "#ffffff"), roughness: 0.8 }));
    sign.position.set(S - 0.3, H + 1.5, SZ - SR - 0.62);
    g.add(sign);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), wood, S - 0.3, H + 0.85, SZ - SR - 0.66);
    // the hay pile at the bottom
    const hay = std(0xe9c46a, 1, { flatShading: true });
    const end = slidePts[slidePts.length - 1];
    const pile = mesh(new THREE.IcosahedronGeometry(1.3, 1), hay, end.x + 1.1, 0.15, end.z);
    pile.scale.set(1.3, 0.55, 1.2);
    for (let i = 0; i < 6; i++) {
      const bale = mesh(new THREE.BoxGeometry(0.9, 0.5, 0.55), hay, end.x + 1.1 + Math.cos(i) * 1.7, 0.25, end.z + Math.sin(i * 2.1) * 1.5);
      bale.rotation.y = i * 1.3;
    }
    solid(SX, SZ, ST, ST, TOPY + 0.9);
  }

  // ── fireworks: a crate of rockets on the walkway over the gate. Light it and they shoot up
  // from the towers and burst in colours over the castle ──
  const fwAt = { x: 1.3, z: S - 0.15 };
  {
    const { x, z } = fwAt;
    const crate = std(0x8a5a2e, 0.9);
    mesh(new THREE.BoxGeometry(0.8, 0.5, 0.55), crate, x, H + 0.25, z);
    const cols = [0xff4757, 0x2f80ed, 0x3fbf6b, 0xffd93d, 0xb06bff];
    for (let i = 0; i < 5; i++) {
      const rx = x - 0.3 + i * 0.15, rz = z + (i % 2 ? 0.1 : -0.1);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6), std(cols[i], 0.6), rx, H + 0.7, rz);
      mesh(new THREE.ConeGeometry(0.07, 0.15, 6), std(0xffffff, 0.6), rx, H + 1.0, rz);
    }
    // a plunger to push
    mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), std(0xe8434f, 0.6), x + 0.65, H + 0.12, z);
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), iron, x + 0.65, H + 0.45, z);
    mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), iron, x + 0.65, H + 0.65, z);
  }
  const dot = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.9)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const PALETTE = [0xff4757, 0xffd93d, 0x2fd0ff, 0x3fbf6b, 0xff6bd6, 0xb06bff, 0xffa53a, 0xffffff];
  interface Rocket { o: THREE.Mesh; vy: number; wait: number; burstAt: number; color: number }
  interface Burst { pts: THREE.Points; vel: Float32Array; age: number }
  const rockets: Rocket[] = [];
  const bursts: Burst[] = [];
  const rocketGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6);
  const sparkM = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const pads: [number, number, number][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pads.push([sx * (S + 1.6), H + 3.2 + 0.7, sz * (S + 1.6)]);
  for (const sx of [-1, 1]) pads.push([sx * (G / 2 + 1.0), H + 1.9, S + T / 2 + 0.9]);
  const boom = (at: THREE.Vector3, color: number) => {
    const n = 90;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c1 = new THREE.Color(color), c2 = new THREE.Color(PALETTE[(PALETTE.indexOf(color) + 3) % PALETTE.length]);
    for (let i = 0; i < n; i++) {
      // an even sphere of sparks, the outer shell one colour and an inner ring another
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = i < 60 ? 7 + Math.random() * 1.2 : 3.5 + Math.random();
      vel.set([Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp], i * 3);
      pos.set([at.x, at.y, at.z], i * 3);
      (i < 60 ? c1 : c2).toArray(col, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.25, map: dot, vertexColors: true, transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    w.group.add(pts);
    bursts.push({ pts, vel, age: 0 });
  };
  w.anim.push((_t, dt) => {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (r.wait > 0) { r.wait -= dt; r.o.visible = r.wait <= 0; continue; }
      r.o.position.y += r.vy * dt;
      r.vy = Math.max(6, r.vy - dt * 6);
      if (Math.random() < 0.6) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 3), sparkM);
        s.position.copy(r.o.position);
        s.userData.age = 0;
        w.group.add(s);
        trail.push(s);
      }
      if (r.o.position.y >= r.burstAt) {
        boom(r.o.position, r.color);
        w.group.remove(r.o);
        rockets.splice(i, 1);
      }
    }
    for (let i = trail.length - 1; i >= 0; i--) {
      const s = trail[i];
      s.userData.age += dt;
      s.position.y -= dt * 0.6;
      s.scale.setScalar(Math.max(0.01, 1 - s.userData.age * 2));
      if (s.userData.age > 0.5) { w.group.remove(s); s.geometry.dispose(); trail.splice(i, 1); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.age += dt;
      const p = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      const drag = Math.exp(-dt * 1.6);
      for (let k = 0; k < p.count; k++) {
        b.vel[k * 3] *= drag; b.vel[k * 3 + 1] = b.vel[k * 3 + 1] * drag - dt * 2.2; b.vel[k * 3 + 2] *= drag;
        p.setXYZ(k, p.getX(k) + b.vel[k * 3] * dt, p.getY(k) + b.vel[k * 3 + 1] * dt, p.getZ(k) + b.vel[k * 3 + 2] * dt);
      }
      p.needsUpdate = true;
      const m = b.pts.material as THREE.PointsMaterial;
      m.opacity = Math.max(0, 1 - Math.max(0, b.age - 0.8) / 1.2) * (b.age > 1 ? 0.75 + 0.25 * Math.sin(b.age * 40 + i) : 1); // fade, with a twinkle
      if (b.age > 2) { w.group.remove(b.pts); b.pts.geometry.dispose(); m.dispose(); bursts.splice(i, 1); }
    }
  });
  const trail: THREE.Mesh[] = [];
  const launch = (): boolean => {
    if (rockets.length || bursts.length > 2) return false;
    pads.forEach(([lx, ly, lz], k) => {
      for (let j = 0; j < (k < 4 ? 2 : 1); j++) {
        const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        const o = new THREE.Mesh(rocketGeo, new THREE.MeshBasicMaterial({ color }));
        o.position.set(wx(lx, lz), base + ly, wz(lx, lz));
        o.visible = false;
        w.group.add(o);
        rockets.push({ o, vy: 16, wait: (j * 6 + k) * 0.28 + Math.random() * 0.1, burstAt: base + 17 + Math.random() * 7, color });
      }
    });
    return true;
  };

  // ── the armour of God: a wooden stand with a knight's helmet and a shield with a cross ──
  const armourAt = { x: -4.7, z: 2.3 };
  {
    const { x, z } = armourAt;
    const steel = std(0xc9d1da, 0.3, { metalness: 0.75, flatShading: true });
    const stand = new THREE.Group();
    stand.position.set(x, 0, z);
    stand.rotation.y = 0.5; // turned toward the gate
    g.add(stand);
    const put = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => mesh(geo, m, px, py, pz, stand);
    put(new THREE.CylinderGeometry(0.35, 0.4, 0.15, 10), wood, 0, 0.075, 0);
    put(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), wood, 0, 0.8, 0);
    put(new THREE.BoxGeometry(0.7, 0.07, 0.07), wood, 0, 1.25, 0);
    // a breastplate on the cross-bar and the helmet on top, plume and all
    put(new THREE.BoxGeometry(0.5, 0.55, 0.22), steel, 0, 1.12, 0.03);
    put(new THREE.SphereGeometry(0.22, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 1.55, 0);
    put(new THREE.SphereGeometry(0.16, 10, 8), wood, 0, 1.5, 0);
    put(new THREE.BoxGeometry(0.04, 0.16, 0.03), steel, 0, 1.47, 0.22);
    const plume = std(0xe8434f, 0.8);
    for (let k = 0; k < 4; k++) put(new THREE.CapsuleGeometry(0.04, 0.14, 4, 6), plume, 0, 1.8 + Math.sin(k * 0.8) * 0.04, 0.06 - k * 0.07).rotation.x = -0.4 - k * 0.3;
    // the shield of faith leaning on the post, with a gold cross
    const shield = put(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 20).rotateX(Math.PI / 2), std(0x2f6fd6, 0.6), 0.05, 0.5, 0.28);
    shield.scale.y = 1.25;
    shield.rotation.x = -0.15;
    put(new THREE.BoxGeometry(0.08, 0.5, 0.02), gold, 0.05, 0.52, 0.32).rotation.x = -0.15;
    put(new THREE.BoxGeometry(0.34, 0.08, 0.02), gold, 0.05, 0.6, 0.31).rotation.x = -0.15;
    solid(x, z, 0.35, 0.35, 1.8);
  }

  // ── singing stones: a row of coloured flagstones across the courtyard, low notes to high.
  // Step on one and it sings; the one that glows plays the next note of a song ──
  const CHIME_COLS = [0xff4757, 0xffa53a, 0xffd93d, 0x3fbf6b, 0x2fd0ff, 0x2f80ed, 0xb06bff, 0xff6bd6];
  const chimeStones: { m: THREE.Mesh; mat: THREE.MeshStandardMaterial; dip: number; lit: boolean }[] = [];
  const chimeZ = 4.95;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
  star.visible = false;
  star.userData.keep = true;
  g.add(star);
  CHIME_COLS.forEach((col, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, emissive: col, emissiveIntensity: 0.1 });
    const m = mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.1, 16), mat, -2.9 + i * 0.95, 0.05, chimeZ);
    m.userData.keep = true;
    chimeStones.push({ m, mat, dip: 0, lit: false });
  });
  w.anim.push((t, dt) => {
    for (const c of chimeStones) {
      c.dip = Math.max(0, c.dip - dt * 3);
      c.m.position.y = 0.05 - Math.sin(c.dip * Math.PI) * 0.04;
      c.mat.emissiveIntensity = 0.1 + c.dip * 0.9 + (c.lit ? 0.35 + Math.sin(t * 6) * 0.25 : 0);
      if (c.lit) {
        star.position.set(c.m.position.x, 0.75 + Math.sin(t * 4) * 0.12, chimeZ);
        star.rotation.y = t * 2;
      }
    }
  });

  // ── the king's treasure: five golden keys hidden round the castle, and a locked chest by the keep ──
  const keepZ = -S + T / 2 + 2.2 + 1.6;
  const keySpots: [number, number, number][] = [
    [-1.7, 8.5 + 0.7, keepZ - 1.5],            // up on the keep roof
    [-S, H + 0.7, -S + 0.6],                   // the far corner of the wall walk
    [S - T / 2 - 2.2, 1.35, 4.6],              // over the well
    [-4.6, 0.75, -S + T / 2 + 1.0],            // tucked behind the keep
    [SX + 4.6, 0.75, SZ - SR + 1.9],           // by the hay pile, outside
  ];
  const keyGeo = (() => {
    const parts = [
      new THREE.TorusGeometry(0.13, 0.04, 6, 14),
      new THREE.BoxGeometry(0.06, 0.38, 0.05).translate(0, -0.3, 0),
      new THREE.BoxGeometry(0.12, 0.05, 0.05).translate(0.07, -0.42, 0),
      new THREE.BoxGeometry(0.09, 0.05, 0.05).translate(0.06, -0.31, 0),
    ];
    const m = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    for (const p of parts) p.dispose();
    return m ?? new THREE.BoxGeometry(0.1, 0.4, 0.1);
  })();
  const keyM = std(0xffd23e, 0.3, { metalness: 0.6, emissive: 0x8a6400 });
  const keys = keySpots.map(([x, y, z]) => {
    const k = mesh(keyGeo, keyM, x, y, z);
    k.scale.setScalar(1.3);
    k.userData.keep = true;
    return k;
  });
  const chestAt = { x: 1.4, z: keepZ + 2.2 + 0.9 };
  const lid = new THREE.Group();
  const glow = new THREE.PointLight(0xffc94a, 0, 4);
  let openT = -1;
  {
    const { x, z } = chestAt;
    const chest = new THREE.Group();
    chest.position.set(x, 0, z);
    chest.rotation.y = -0.4;
    g.add(chest);
    const red = std(0x9c2a2a, 0.8);
    const put = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number, parent: THREE.Object3D = chest) => mesh(geo, m, px, py, pz, parent);
    put(new THREE.BoxGeometry(1.0, 0.55, 0.65), red, 0, 0.3, 0);
    for (const bx of [-0.35, 0.35]) put(new THREE.BoxGeometry(0.08, 0.57, 0.67), gold, bx, 0.3, 0);
    lid.position.set(0, 0.58, -0.33);
    chest.add(lid);
    put(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), red, 0, 0, 0.33, lid);
    for (const bx of [-0.35, 0.35]) put(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), gold, bx, 0, 0.33, lid);
    // a big padlock, and gold coins piled inside (seen when it opens)
    const lock = put(new THREE.BoxGeometry(0.2, 0.2, 0.08), gold, 0, 0.45, 0.36);
    lock.name = "lock";
    const coinM = std(0xffd23e, 0.3, { metalness: 0.6, emissive: 0x6a4a00 });
    for (let i = 0; i < 14; i++) put(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), coinM, (i % 5 - 2) * 0.17 + (i > 9 ? 0.08 : 0), 0.55 + Math.floor(i / 5) * 0.025, (Math.floor(i / 5) - 1) * 0.15).rotation.x = 0.3 * (i % 3 - 1);
    glow.position.set(0, 1.0, 0);
    chest.add(glow);
    solid(x, z, 0.55, 0.45, 0.85);
  }
  w.anim.push((t, dt) => {
    keys.forEach((k, i) => {
      if (!k.visible) return;
      k.rotation.y = t * 2 + i;
      k.position.y = keySpots[i][1] + Math.sin(t * 2.5 + i) * 0.12;
    });
    if (openT >= 0) {
      openT = Math.min(1, openT + dt * 1.5);
      lid.rotation.x = -openT * 1.9;
      glow.intensity = openT * 3;
    }
  });

  // ── peacocks strolling in the courtyard; come close and they fan their tails ──
  const peaM = std(0x1f7fb0, 0.5, { flatShading: true }), neckM = std(0x1747a6, 0.4, { flatShading: true, emissive: 0x081840 });
  // each feather is one painted card (blade and eye spot), so a whole tail is 15 draws, not 60
  const featherGeo = new THREE.PlaneGeometry(0.22, 1.0).translate(0, 0.5, 0);
  const featherM = new THREE.MeshStandardMaterial({ map: featherTexture(), roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5 });
  const pea = [0, 1].map((i) => {
    const o = new THREE.Group();
    const home = new THREE.Vector3(-1.5 + i * 2.6, 0, 2.0 + i * 1.0);
    o.position.copy(home);
    g.add(o);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8).scale(0.85, 0.8, 1.3), peaM);
    body.position.y = 0.5;
    o.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.45, 8), neckM);
    neck.position.set(0, 0.8, 0.2);
    neck.rotation.x = 0.25;
    o.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), neckM);
    head.position.set(0, 1.03, 0.26);
    o.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5).rotateX(Math.PI / 2), std(0xd9c39a));
    beak.position.set(0, 1.02, 0.36);
    o.add(beak);
    for (let k = -1; k <= 1; k++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 3), neckM);
      c.position.set(k * 0.03, 1.17, 0.24 - Math.abs(k) * 0.02);
      o.add(c);
    }
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 4), std(0x9a8a70));
      leg.position.set(sx * 0.07, 0.17, 0);
      o.add(leg);
    }
    // the tail: feathers on a pivot at the rump; folded they trail behind, fanned they stand in a half circle
    const tail = new THREE.Group();
    tail.position.set(0, 0.5, -0.22);
    o.add(tail);
    const feathers: THREE.Group[] = [];
    const N = 15;
    for (let k = 0; k < N; k++) {
      const f = new THREE.Group();
      const blade = new THREE.Mesh(featherGeo, featherM);
      blade.position.z = k * 0.002; // a hair apart, so the overlapping cards don't flicker
      f.add(blade);
      f.userData.a = ((k / (N - 1)) - 0.5) * Math.PI * 0.95;
      tail.add(f);
      feathers.push(f);
    }
    return { o, home, tail, feathers, fan: 0, want: 0, target: home.clone(), wait: Math.random() * 3, step: 0, pos: new THREE.Vector3() };
  });
  const peaWorld = pea.map(() => new THREE.Vector3());
  w.anim.push((t, dt) => {
    pea.forEach((p, i) => {
      p.want = Math.max(0, p.want - dt);
      const showing = p.want > 0;
      p.fan += ((showing ? 1 : 0) - p.fan) * Math.min(1, dt * 3);
      // stroll between spots in the open part of the yard, standing still while showing off
      if (!showing) {
        const d = p.target.clone().sub(p.o.position);
        d.y = 0;
        if (d.length() < 0.15) {
          p.wait -= dt;
          if (p.wait <= 0) {
            p.target.set(-3 + Math.random() * 4.8, 0, 0.8 + Math.random() * 3);
            p.wait = 1.5 + Math.random() * 3;
          }
        } else {
          const sp = 0.6 * dt;
          p.o.position.addScaledVector(d.normalize(), Math.min(sp, d.length()));
          const yaw = Math.atan2(d.x, d.z);
          p.o.rotation.y += Math.atan2(Math.sin(yaw - p.o.rotation.y), Math.cos(yaw - p.o.rotation.y)) * Math.min(1, dt * 5);
          p.step += dt * 9;
        }
      }
      p.o.position.y = Math.abs(Math.sin(p.step)) * 0.02;
      // the fan: each feather swings up from trailing behind to its place in the half circle
      p.tail.rotation.x = -1.35 + p.fan * 1.15;
      for (const f of p.feathers) {
        f.rotation.z = f.userData.a * (0.15 + p.fan * 0.85);
        f.scale.set(1 + p.fan * 0.3, 0.9 + p.fan * 0.5, 1);
      }
      if (showing) p.tail.rotation.z = Math.sin(t * 9) * 0.04 * p.fan; // a happy shimmer
      peaWorld[i].set(wx(p.o.position.x, p.o.position.z), base, wz(p.o.position.x, p.o.position.z));
    });
  });

  // ── a bouncy castle on the meadow behind the walls: pink and yellow, with puffy turrets. Its
  // floor springs kids up, higher with every bounce; the front is open to hop in and out ──
  const BX = -5, BZ = -13, BH = 2.1, BF = 0.55; // centre, half size, floor height
  const bouncy = new THREE.Group();
  bouncy.position.set(BX, 0, BZ);
  g.add(bouncy);
  let squishT = 0;
  {
    const puff = (color: number) => std(color, 0.45, { flatShading: false, emissive: new THREE.Color(color).multiplyScalar(0.08) });
    const pink = puff(0xff7eb6), yellow = puff(0xffd84a), blue = puff(0x5aa9ff), white = puff(0xfff6fb);
    const netM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => mesh(geo, m, x, y, z, bouncy);
    // the puffy floor and a step at the open front (+x)
    put(new THREE.BoxGeometry(BH * 2, BF, BH * 2), blue, 0, BF / 2, 0);
    const floor = put(new THREE.BoxGeometry(BH * 2 - 0.2, 0.12, BH * 2 - 0.2), yellow, 0, BF + 0.02, 0);
    floor.name = "floor";
    floor.userData.keep = true;
    put(new THREE.CapsuleGeometry(0.2, BH * 2 - 0.2, 4, 10).rotateX(Math.PI / 2), pink, BH + 0.25, 0.22, 0);
    // three puffy walls: a fat tube along the bottom, a see-through net, a fat tube on top
    const WALLH = 2.75;
    for (const [ax, az, along] of [[-BH, 0, false], [0, -BH, true], [0, BH, true]] as [number, number, boolean][]) {
      const len = BH * 2;
      for (const [y, r, m] of [[BF + 0.35, 0.32, pink], [BF + WALLH, 0.24, yellow]] as [number, number, THREE.Material][]) {
        const tube = new THREE.CapsuleGeometry(r, len - r * 2, 4, 12);
        if (along) tube.rotateZ(Math.PI / 2); else tube.rotateX(Math.PI / 2);
        put(tube, m, ax, y, az);
      }
      const net = new THREE.PlaneGeometry(len - 0.4, WALLH - 0.6);
      if (!along) net.rotateY(Math.PI / 2);
      const n = put(net, netM, ax, BF + 0.35 + (WALLH - 0.35) / 2, az);
      n.castShadow = false;
      // puffy stripes up the net, so it reads as one blown-up wall
      for (let k = 1; k < 4; k++) {
        const t = -BH + (k / 4) * len;
        put(new THREE.CylinderGeometry(0.1, 0.1, WALLH - 0.35, 8), k % 2 ? white : blue, along ? t : ax, BF + 0.35 + (WALLH - 0.35) / 2, along ? az : t);
      }
    }
    // turrets at the corners with pointy hats and little flags
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * BH, z = sz * BH;
      put(new THREE.CylinderGeometry(0.42, 0.48, 3.4, 14), sx > 0 ? yellow : pink, x, 1.7, z);
      put(new THREE.SphereGeometry(0.46, 14, 8), white, x, 3.4, z);
      put(new THREE.ConeGeometry(0.45, 0.9, 14), blue, x, 4.05, z);
      put(new THREE.SphereGeometry(0.1, 8, 6), yellow, x, 4.55, z);
    }
    // an arch over the open front with a big smiley star
    const arch = new THREE.TorusGeometry(BH - 0.1, 0.24, 10, 24, Math.PI).rotateY(Math.PI / 2);
    put(arch, pink, BH, 3.15, 0).scale.set(1, 0.5, 1);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.75), new THREE.MeshBasicMaterial({ map: textTexture("Bounce!", "#ff4f9a", "#fff6c2"), transparent: true }));
    sign.position.set(BH + 0.3, 3.75, 0);
    sign.rotation.y = Math.PI / 2;
    bouncy.add(sign);
    // walls kids can't bounce over; the floor is something to stand on
    for (const [ax, az, along] of [[-BH, 0, false], [0, -BH, true], [0, BH, true]] as [number, number, boolean][])
      solid(BX + ax, BZ + az, along ? BH + 0.4 : 0.35, along ? 0.35 : BH + 0.4, BF + WALLH + 0.3);
    plat(BX, BZ, BH - 0.1, BH - 0.1, BF + 0.08);
    plat(BX + BH + 0.25, BZ, 0.3, BH - 0.3, 0.42);
    w.anim.push((t, dt) => {
      squishT = Math.max(0, squishT - dt * 3);
      const k = Math.sin(squishT * Math.PI) * squishT;
      floor.position.y = BF + 0.02 - k * 0.12;
      bouncy.scale.set(1 + k * 0.025, 1 - k * 0.03 + Math.sin(t * 2.2) * 0.006, 1 + k * 0.025);
    });
  }

  // ── a catapult on the meadow behind the castle: it flings big soft pom-pom balls out to a
  // target raft bobbing on the sea. Time it right and the ball lands on the target ──
  const CX = 4, CZ = -12.6;            // the catapult (it throws toward -z)
  const LAND = -24.5;                  // where the balls come down (local z)
  const cat = new THREE.Group();
  cat.position.set(CX, 0, CZ);
  g.add(cat);
  const arm = new THREE.Group();
  arm.position.set(0, 0.85, 0);
  cat.add(arm);
  const ballM = std(0xff6bb5, 0.95, { flatShading: true });
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), ballM);
  ball.castShadow = true;
  ball.userData.keep = true;
  g.add(ball);
  const raft = new THREE.Group();
  g.add(raft);
  {
    const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = cat) => mesh(geo, m, x, y, z, parent);
    const dark = std(0x5a3a1c, 0.9);
    for (const sx of [-0.45, 0.45]) {
      put(new THREE.BoxGeometry(0.16, 0.2, 2.2), wood, sx, 0.45, 0);
      for (const sz of [-0.75, 0.75]) put(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14).rotateZ(Math.PI / 2), dark, sx * 1.25, 0.32, sz);
      // the upright that stops the arm, and the axle posts
      put(new THREE.BoxGeometry(0.14, 1.1, 0.14), wood, sx, 1.05, -0.55);
      put(new THREE.BoxGeometry(0.14, 0.55, 0.14), wood, sx, 0.75, 0);
    }
    for (const z of [-0.95, 0.95]) put(new THREE.BoxGeometry(1.0, 0.16, 0.16), wood, 0, 0.45, z);
    put(new THREE.BoxGeometry(1.06, 0.14, 0.18), std(0xc0392b, 0.6), 0, 1.6, -0.55); // padded crossbar
    put(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8).rotateZ(Math.PI / 2), iron, 0, 0.85, 0);
    // the arm with a cup on the end (it rests pointing back, cup low)
    put(new THREE.BoxGeometry(0.14, 0.12, 1.7), wood, 0, 0, 0.85, arm);
    const cup = put(new THREE.CylinderGeometry(0.3, 0.2, 0.2, 12, 1, true), dark, 0, 0.12, 1.65, arm);
    cup.material = std(0x5a3a1c, 0.9, { side: THREE.DoubleSide });
    put(new THREE.CircleGeometry(0.2, 12).rotateX(-Math.PI / 2), dark, 0, 0.03, 1.65, arm);
    // a basket of pom-pom balls beside it
    put(new THREE.CylinderGeometry(0.35, 0.28, 0.45, 12), std(0xc9a26b, 1), 1.1, 0.23, 0.6);
    const cols = [0xff6bb5, 0xffd84a, 0x5aa9ff, 0x7ee08a];
    for (let i = 0; i < 4; i++) put(new THREE.IcosahedronGeometry(0.15, 1), std(cols[i], 0.95, { flatShading: true }), 1.1 + (i % 2 - 0.5) * 0.18, 0.5 + (i > 1 ? 0.1 : 0), 0.6 + (i > 1 ? 0.08 : -0.08));
    solid(CX, CZ, 0.7, 1.1, 1.7);
    // the target: a round raft with red and white rings and a little flag
    const ringCols = [0xffffff, 0xe84a5f, 0xffffff, 0xe84a5f];
    put(new THREE.CylinderGeometry(1.35, 1.45, 0.3, 24), std(0x8a5a2e, 0.9), 0, 0, 0, raft);
    ringCols.forEach((c, i) => put(new THREE.CircleGeometry(1.25 - i * 0.3, 24).rotateX(-Math.PI / 2), std(c, 0.7), 0, 0.16 + i * 0.004, 0, raft));
    put(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), wood, 1.1, 0.7, 0, raft);
    const pennant = put(new THREE.ConeGeometry(0.22, 0.6, 3).rotateZ(-Math.PI / 2), std(0xffd84a, 0.7), 1.4, 1.25, 0, raft);
    pennant.scale.z = 0.2;
  }
  const armRest = 0.22, armUp = -2.1;                     // arm tilt: resting back, and thrown up against the crossbar
  arm.rotation.x = armRest;
  let fireT = -1, flyT = -1, splashed = false, thrown = false;
  const from = new THREE.Vector3(), cupAt = new THREE.Vector3();
  const raftZ = LAND, raftSwing = 4.2, raftPeriod = 7;
  const raftX = (t: number) => CX + Math.sin((t / raftPeriod) * Math.PI * 2) * raftSwing;
  let raftNow = 0;
  const FLY = 1.5;
  const catapult = {
    pos: new THREE.Vector3(wx(CX, CZ + 1.6), base, wz(CX, CZ + 1.6)),
    raft: new THREE.Vector3(),
    aim: new THREE.Vector3(wx(CX, LAND), base - 0.5, wz(CX, LAND)),
    fire: () => {
      if (fireT >= 0 || flyT >= 0) return false;
      fireT = 0;
      thrown = false;
      return true;
    },
    onLand: null as ((hit: boolean, close: boolean, at: THREE.Vector3) => void) | null,
  };
  w.anim.push((t, dt) => {
    raftNow = t;
    raft.position.set(raftX(t), -0.55 + Math.sin(t * 1.7) * 0.06 - base, raftZ);
    raft.rotation.z = Math.sin(t * 1.3) * 0.04;
    catapult.raft.set(wx(raft.position.x, raftZ), -0.5, wz(raft.position.x, raftZ));
    raft.rotation.x = Math.sin(t * 1.1) * 0.03;
    // the arm: snap forward, hold, wind slowly back; the ball sits in the cup until it's thrown
    if (fireT >= 0) {
      fireT += dt;
      const k = fireT < 0.22 ? fireT / 0.22 : fireT < 0.6 ? 1 : Math.max(0, 1 - (fireT - 0.6) / 1.6);
      arm.rotation.x = armRest + (armUp - armRest) * (fireT < 0.22 ? k * k : k);
      if (fireT >= 0.18 && !thrown) { thrown = true; flyT = 0; splashed = false; from.copy(ball.position); }
      if (fireT > 2.2) { fireT = -1; arm.rotation.x = armRest; }
    }
    if (flyT >= 0) {
      flyT += dt;
      const k = Math.min(1, flyT / FLY);
      // local positions (the castle group is turned, so work in its frame)
      const lx = from.x, lz = from.z + (LAND - from.z) * k;
      const y0 = from.y, y1 = -0.4 - base;
      ball.position.set(lx, y0 + (y1 - y0) * k + 4 * 4.2 * k * (1 - k), lz);
      ball.rotation.x -= dt * 8;
      if (k >= 1 && !splashed) {
        splashed = true;
        const dx = Math.abs(lx - raftX(raftNow));
        const at = new THREE.Vector3(wx(lx, LAND), base - 0.3, wz(lx, LAND));
        catapult.onLand?.(dx < 1.35, dx < 2.6, at);
      }
      if (flyT > FLY + 0.15) flyT = -1;
    }
    if (flyT < 0) {
      // back in the cup (it's a fresh ball from the basket)
      cupAt.set(0, 0.32, 1.65);
      arm.localToWorld(cupAt);
      g.worldToLocal(cupAt);
      ball.position.copy(cupAt);
    }
    ball.visible = !(flyT > FLY);
  });

  // ── a bread oven in the courtyard's back corner: a brick dome with a fire inside and a
  // chimney. Bake a loaf, wait while the smoke puffs, then eat it warm ──
  const OX = 5.7, OZ = -6.4;
  let bakeT = -1, loafReady = false;
  const loaf = new THREE.Group();
  const fire = new THREE.Group();
  const ovenGlow = new THREE.PointLight(0xff9a3c, 1.2, 4);
  const puffs: THREE.Mesh[] = [];
  {
    const brick = std(0xb5532f, 0.95, { flatShading: true });
    const dark = new THREE.MeshBasicMaterial({ color: 0x1a0d08 });
    mesh(new THREE.BoxGeometry(1.9, 0.9, 1.7), darkStone, OX, 0.45, OZ);
    const dome = mesh(new THREE.SphereGeometry(0.85, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), brick, OX, 0.9, OZ - 0.05);
    dome.scale.set(1, 0.95, 0.9);
    // the mouth: a dark arch on the front, with the fire glowing inside it
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.36, 14, 0, Math.PI), dark);
    mouth.position.set(OX, 0.92, OZ + 0.72);
    g.add(mouth);
    mesh(new THREE.TorusGeometry(0.4, 0.07, 6, 14, Math.PI), brick, OX, 0.92, OZ + 0.72);
    fire.position.set(OX, 0.93, OZ + 0.74);
    g.add(fire);
    const flameM = new THREE.MeshBasicMaterial({ color: 0xffb23e }), flameM2 = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), i % 2 ? flameM : flameM2);
      f.position.set((i - 1.5) * 0.09, 0.08, 0);
      fire.add(f);
    }
    ovenGlow.position.set(OX, 1.1, OZ + 1.1);
    g.add(ovenGlow);
    // the chimney at the back, and puffs of smoke
    mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), brick, OX + 0.45, 1.85, OZ - 0.5);
    const smokeM = new THREE.MeshStandardMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), smokeM.clone());
      p.userData.ph = i / 5;
      p.userData.keep = true;
      g.add(p);
      puffs.push(p);
    }
    // a wooden peel leaning on the side, and a sack of flour
    const peel = mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), wood, OX - 1.05, 0.75, OZ + 0.5);
    peel.rotation.z = 0.2;
    mesh(new THREE.BoxGeometry(0.3, 0.03, 0.35), wood, OX - 1.2, 0.1, OZ + 0.5).rotation.z = 0.2;
    const sack = mesh(new THREE.SphereGeometry(0.3, 10, 8), std(0xe8dcc0, 1), OX + 1.25, 0.28, OZ + 0.3);
    sack.scale.set(1, 1.2, 0.9);
    // the loaf: a golden cob on the ledge in front of the mouth (shown when it's baked)
    const crust = std(0xd9973f, 0.8, { flatShading: true });
    const cob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), crust);
    cob.scale.set(1.3, 0.75, 0.9);
    cob.castShadow = true;
    loaf.add(cob);
    for (let k = -1; k <= 1; k++) {
      const cut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.22), std(0xf3d9a0, 0.9));
      cut.position.set(k * 0.1, 0.15, 0);
      cut.rotation.y = 0.5;
      loaf.add(cut);
    }
    loaf.position.set(OX, 1.02, OZ + 0.95);
    loaf.visible = false;
    g.add(loaf);
    solid(OX, OZ, 0.95, 0.85, 1.9);
  }
  w.anim.push((t, dt) => {
    const baking = bakeT >= 0;
    if (baking) {
      bakeT += dt;
      if (bakeT >= 4) { bakeT = -1; loafReady = true; loaf.visible = true; loaf.scale.setScalar(0.01); }
    }
    if (loaf.visible && loaf.scale.x < 1) loaf.scale.setScalar(Math.min(1, loaf.scale.x + dt * 3));
    const roar = baking ? 1.8 : 1;
    fire.children.forEach((f, i) => { f.scale.set(roar, roar * (0.8 + Math.sin(t * 14 + i * 2) * 0.25), roar); });
    ovenGlow.intensity = (baking ? 3 : 1.2) + Math.sin(t * 11) * 0.3;
    for (const p of puffs) {
      const k = ((t * (baking ? 0.6 : 0.3)) + p.userData.ph) % 1;
      p.position.set(OX + 0.45 + Math.sin(k * 5 + p.userData.ph * 9) * 0.15, 2.35 + k * (baking ? 2.2 : 1.2), OZ - 0.5 - k * 0.3);
      p.scale.setScalar(0.6 + k * 1.6);
      (p.material as THREE.MeshStandardMaterial).opacity = (baking ? 0.7 : 0.35) * (1 - k);
    }
  });
  const oven = {
    pos: new THREE.Vector3(wx(OX, OZ + 1.8), base, wz(OX, OZ + 1.8)),
    bake: () => { if (bakeT >= 0 || loafReady) return false; bakeT = 0; return true; },
    baking: () => bakeT >= 0,
    ready: () => loafReady,
    take: () => { loafReady = false; loaf.visible = false; },
  };

  // ── a puppet theatre in the courtyard: press to watch Noah's Ark. The curtains open, the ark
  // sails in on the waves, the animals come two by two, the dove brings a leaf, and a rainbow ──
  const PX = -4.3, PZ = -3.8;
  const booth = new THREE.Group();
  booth.position.set(PX, 0, PZ);
  g.add(booth);
  let showT = -1;
  const stage = new THREE.Group();          // everything that moves in the show
  booth.add(stage);
  const curtains: THREE.Mesh[] = [];
  const ark = new THREE.Group(), dove = new THREE.Group(), bow = new THREE.Group();
  const waves: THREE.Mesh[] = [];
  const pairs: THREE.Group[] = [];
  {
    const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = booth) => mesh(geo, m, x, y, z, parent);
    const red = std(0xc0283a, 0.85), gold2 = std(0xe8b830, 0.5), paint = std(0x8fd8ff, 0.9);
    // the frame: a red skirt below, posts, a top board with the sign
    put(new THREE.BoxGeometry(2.2, 1.2, 0.7), red, 0, 0.6, 0);
    for (const sx of [-1, 1]) put(new THREE.BoxGeometry(0.2, 1.1, 0.7), red, sx * 1.0, 1.75, 0);
    put(new THREE.BoxGeometry(2.4, 0.5, 0.75), red, 0, 2.55, 0);
    put(new THREE.BoxGeometry(2.4, 0.06, 0.8), gold2, 0, 2.83, 0);
    put(new THREE.BoxGeometry(2.25, 0.05, 0.75), gold2, 0, 1.22, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.42), new THREE.MeshBasicMaterial({ map: textTexture("Puppet Show", "#c0283a", "#ffe9a8") }));
    sign.position.set(0, 2.55, 0.38);
    booth.add(sign);
    // the painted sky at the back of the stage
    put(new THREE.PlaneGeometry(1.85, 1.0), paint, 0, 1.72, -0.3);
    // the waves: three rows of blue humps that rock side to side
    const waveM = [std(0x2f7fd6, 0.6), std(0x4aa3f0, 0.6), std(0x2f7fd6, 0.6)];
    for (let i = 0; i < 3; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(-1.0, 0);
      for (let k = 0; k <= 8; k++) shape.lineTo(-1.0 + k * 0.25, 0.12 + (k % 2 ? 0.08 : 0));
      shape.lineTo(1.0, 0);
      const wv = put(new THREE.ShapeGeometry(shape), waveM[i], 0, 1.24, -0.15 + i * 0.12, stage);
      wv.userData.row = i;
      waves.push(wv);
    }
    // the ark: a brown hull with a little house and a window
    const hullM = std(0x8a5a2e, 0.9), roofM2 = std(0xc0392b, 0.8);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.12), hullM);
    hull.position.y = 0.15;
    ark.add(hull);
    const bowEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 3).rotateX(Math.PI / 2), hullM);
    bowEnd.position.set(0.5, 0.15, 0);
    ark.add(bowEnd);
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), std(0xd9a066, 0.9));
    house.position.set(-0.12, 0.37, 0);
    ark.add(house);
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.16, 4).rotateY(Math.PI / 4), roofM2);
    roof2.scale.set(1, 1, 0.3);
    roof2.position.set(-0.12, 0.56, 0);
    ark.add(roof2);
    ark.position.set(-1.6, 1.25, -0.08);
    stage.add(ark);
    // animals two by two: giraffes, elephants, lions (simple cut-outs that pop up on the deck)
    const animal = (kind: number) => {
      const a = new THREE.Group();
      const col = [0xf2c14e, 0x9aa3ad, 0xe0a040][kind];
      const m = std(col, 0.8, { flatShading: true });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m);
      body.scale.set(1.3, 1, 0.8);
      body.position.y = 0.07;
      a.add(body);
      if (kind === 0) {
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.18, 6), m);
        neck.position.set(0.05, 0.18, 0);
        neck.rotation.z = -0.3;
        a.add(neck);
        const hd = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), m);
        hd.position.set(0.1, 0.27, 0);
        a.add(hd);
      } else {
        const hd = new THREE.Mesh(new THREE.SphereGeometry(kind === 1 ? 0.055 : 0.05, 8, 6), m);
        hd.position.set(0.09, 0.1, 0);
        a.add(hd);
        if (kind === 1) {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.09, 5), m);
          trunk.position.set(0.14, 0.06, 0);
          a.add(trunk);
        } else {
          const mane = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.022, 5, 10), std(0xa0522d, 0.9));
          mane.position.set(0.09, 0.1, -0.01);
          mane.rotation.y = Math.PI / 2;
          a.add(mane);
        }
      }
      return a;
    };
    for (let k = 0; k < 3; k++) {
      const pr = new THREE.Group();
      for (const dx of [-0.07, 0.07]) {
        const a = animal(k);
        a.position.x = dx;
        a.scale.setScalar(k === 0 ? 0.9 : 1);
        pr.add(a);
      }
      pr.position.set(0.28 - k * 0.27, 0.26, 0.07);
      pr.scale.setScalar(0.01);
      ark.add(pr);
      pairs.push(pr);
    }
    // the dove with an olive leaf
    const white = std(0xffffff, 0.6);
    const db = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), white);
    db.scale.set(1.5, 1, 1);
    dove.add(db);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08), std(0xffffff, 0.6, { side: THREE.DoubleSide }));
      wing.position.set(0, 0.04, s * 0.04);
      wing.rotation.x = s * 0.6;
      wing.name = "wing";
      dove.add(wing);
    }
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), std(0x4caf50, 0.7));
    leaf.scale.set(1.6, 0.6, 0.6);
    leaf.position.set(0.1, -0.01, 0);
    dove.add(leaf);
    dove.visible = false;
    stage.add(dove);
    // the rainbow: coloured arcs behind everything
    [0xff4757, 0xff9f43, 0xffd93d, 0x3fbf6b, 0x2f80ed, 0x8e5be8].forEach((c, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.75 - i * 0.06, 0.03, 6, 30, Math.PI), new THREE.MeshBasicMaterial({ color: c }));
      bow.add(arc);
    });
    bow.position.set(0, 1.3, -0.26);
    bow.scale.setScalar(0.01);
    stage.add(bow);
    // the curtains: two red drapes that slide apart
    const drapeM = std(0x9e1b2e, 0.9, { side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const cgeo = new THREE.PlaneGeometry(0.95, 1.05, 6, 1).translate(-s * 0.475, 0, 0);
      const cp = cgeo.getAttribute("position");
      for (let k = 0; k < cp.count; k++) cp.setZ(k, Math.sin(cp.getX(k) * 18) * 0.03);
      cgeo.computeVertexNormals();
      const cm = new THREE.Mesh(cgeo, drapeM);
      cm.position.set(s * 0.95, 1.73, 0.3);
      cm.userData.keep = true;
      booth.add(cm);
      curtains.push(cm);
    }
    solid(PX, PZ, 1.2, 0.4, 2.9);
  }
  // Jonah and the big fish: a little boat on stormy waves, Jonah, a great blue fish, a beach and the sun
  const jBoat = new THREE.Group(), jonah = new THREE.Group(), whale = new THREE.Group(), shore = new THREE.Group(), sun = new THREE.Group();
  {
    const hullM = std(0xa0522d, 0.9);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.1), hullM);
    hull.position.y = 0.1;
    jBoat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 5), hullM);
    mast.position.set(0, 0.38, 0);
    jBoat.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28).translate(0.11, 0, 0), std(0xffffff, 0.7, { side: THREE.DoubleSide }));
    sail.position.set(0.01, 0.42, 0);
    jBoat.add(sail);
    // Jonah: a little figure in a blue robe with a brown beard
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), std(0x3d6fd6, 0.8));
    robe.position.y = 0.09;
    jonah.add(robe);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), std(0xe0b48a, 0.8));
    hd.position.y = 0.21;
    jonah.add(hd);
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), std(0x6b4a2b, 0.9));
    beard.position.set(0, 0.19, 0.02);
    jonah.add(beard);
    jonah.position.set(-0.1, 0.16, 0.03);
    jBoat.add(jonah);
    // the great fish: a big blue body, a tail, a smile and a spout
    const fishM = std(0x4a86e8, 0.6, { flatShading: true });
    const fb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8).scale(1.6, 0.85, 0.5), fishM);
    whale.add(fb);
    const ft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.3), fishM);
    ft.position.set(0.48, 0.08, 0);
    ft.rotation.z = 0.5;
    whale.add(ft);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), std(0x111111, 0.3));
    eye.position.set(-0.24, 0.07, 0.11);
    whale.add(eye);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 4, 10, Math.PI), std(0x1d3f8a, 0.6));
    smile.position.set(-0.3, -0.04, 0.1);
    smile.rotation.z = Math.PI;
    whale.add(smile);
    whale.position.set(0.1, 0.9, -0.02);
    stage.add(whale);
    // the dry land Jonah lands on, and the sun coming up
    const sandM = std(0xf2d48f, 1, { flatShading: true });
    const hill = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 0.3), sandM);
    shore.add(hill);
    const palm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.35, 5), std(0x8a5a2e, 0.9));
    palm.position.set(0.1, 0.3, 0);
    shore.add(palm);
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.08, 6), std(0x3f9e3a, 0.8));
    frond.position.set(0.1, 0.48, 0);
    shore.add(frond);
    shore.position.set(0.56, 1.24, 0.02);
    stage.add(shore);
    stage.add(jBoat);
    const sunM = new THREE.MeshBasicMaterial({ color: 0xffd93d });
    sun.add(new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), sunM));
    for (let k = 0; k < 8; k++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.09), sunM);
      const a = (k / 8) * Math.PI * 2;
      ray.position.set(Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0);
      ray.rotation.z = a - Math.PI / 2;
      sun.add(ray);
    }
    sun.position.set(-0.5, 1.3, -0.27);
    stage.add(sun);
  }
  // Daniel and the lions: Daniel praying at his window, the den, two lions who fall asleep, an angel
  const dan = new THREE.Group(), daniel = new THREE.Group(), den = new THREE.Group(), angel = new THREE.Group(), lions: THREE.Group[] = [];
  {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 8), std(0x8e5be8, 0.8));
    robe.position.y = 0.1;
    daniel.add(robe);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), std(0xc98f5e, 0.8));
    hd.position.y = 0.24;
    daniel.add(hd);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.047, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0x2b1d12, 0.9));
    hair.position.y = 0.245;
    daniel.add(hair);
    dan.add(daniel);
    // his window: a little arched frame on the painted sky
    const frameM = std(0xd9a066, 0.9);
    const win = new THREE.Group();
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.02), frameM);
      side.position.set(sx * 0.15, 0, 0);
      win.add(side);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 4, 12, Math.PI), frameM);
    arch.position.y = 0.17;
    win.add(arch);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.04), frameM);
    sill.position.y = -0.17;
    win.add(sill);
    win.position.set(-0.45, 1.75, -0.25);
    win.name = "window";
    dan.add(win);
    // the den: a dark rocky cave mouth
    const rock = std(0x7a6a58, 1, { flatShading: true });
    const cave = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, 0.85, 0.35), rock);
    den.add(cave);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.32, 14, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x2a1f18 }));
    hole.position.set(0, 0, 0.22);
    den.add(hole);
    den.position.set(0.2, 1.24, -0.2);
    dan.add(den);
    // two friendly lions
    const lionM = std(0xe0a040, 0.8, { flatShading: true }), maneM = std(0xa0522d, 0.9);
    for (const sx of [-1, 1]) {
      const l = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6).scale(1.5, 0.9, 0.8), lionM);
      body.position.y = 0.09;
      l.add(body);
      const mane = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), maneM);
      mane.position.set(sx * -0.15, 0.16, 0);
      l.add(mane);
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), lionM);
      face.position.set(sx * -0.19, 0.16, 0.03);
      l.add(face);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 4), lionM);
      tail.position.set(sx * 0.17, 0.14, 0);
      tail.rotation.z = sx * 0.8;
      l.add(tail);
      l.position.set(0.2 + sx * 0.42, 1.28, 0.02);
      dan.add(l);
      lions.push(l);
    }
    // the angel: a shining white robe, wings and a gold halo
    const glowM = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
    const ar = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 10), glowM);
    ar.position.y = 0.13;
    angel.add(ar);
    const ah = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), std(0xf2c79a, 0.8));
    ah.position.y = 0.3;
    angel.add(ah);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 4, 14), new THREE.MeshBasicMaterial({ color: 0xffd93d }));
    halo.position.y = 0.38;
    halo.rotation.x = Math.PI / 2;
    angel.add(halo);
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10).scale(0.7, 1.3, 1), glowM);
      wing.position.set(sx * 0.09, 0.2, -0.02);
      wing.rotation.z = sx * -0.4;
      wing.name = "wing";
      angel.add(wing);
    }
    angel.position.set(0.2, 1.5, 0.05);
    dan.add(angel);
    // a sandy floor for this story (the sea waves are hidden while it plays)
    const floorD = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.3), std(0xd9b77a, 1, { flatShading: true }));
    floorD.position.set(0, 1.22, 0);
    dan.add(floorD);
    dan.visible = false;
    stage.add(dan);
  }
  // David the shepherd boy: green hills, his sheep, his harp, a lost lamb found, and a crown for one day
  const dav = new THREE.Group(), david = new THREE.Group(), flock: THREE.Group[] = [], notes: THREE.Mesh[] = [];
  const lamb = new THREE.Group(), harp = new THREE.Group(), crown = new THREE.Group();
  {
    const hillM = std(0x6cc24a, 0.9, { flatShading: true });
    const hill = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.3), hillM);
    hill.position.set(0, 1.22, 0);
    dav.add(hill);
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.4, 0.45, 0.3), hillM);
    bump.position.set(0.4, 1.27, -0.18);
    dav.add(bump);
    // David: a green tunic, a brown belt, curly hair, and a shepherd's crook
    const tunic = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 8), std(0x3fa34d, 0.8));
    tunic.position.y = 0.1;
    david.add(tunic);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 8), std(0x6b4a2b, 0.9));
    belt.position.y = 0.12;
    david.add(belt);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), std(0xe0b48a, 0.8));
    hd.position.y = 0.24;
    david.add(hd);
    const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.048, 0), std(0xb5651d, 0.9));
    hair.position.set(0, 0.265, -0.01);
    david.add(hair);
    const crook = new THREE.Group();
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), std(0x8a5a2e, 0.9));
    staff.position.y = 0.18;
    crook.add(staff);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 8, Math.PI), std(0x8a5a2e, 0.9));
    hook.position.set(0.03, 0.36, 0);
    crook.add(hook);
    crook.position.set(0.08, 0, 0.02);
    crook.name = "crook";
    david.add(crook);
    // his harp: a golden frame with strings
    const goldH = std(0xe8b830, 0.4, { metalness: 0.5 });
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 4, 10, Math.PI * 1.3), goldH);
    frame.rotation.z = -0.4;
    harp.add(frame);
    for (let k = 0; k < 4; k++) {
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08 - k * 0.012, 3), std(0xffffff, 0.5));
      str.position.set(-0.03 + k * 0.02, -0.005, 0.005);
      harp.add(str);
    }
    harp.position.set(-0.07, 0.15, 0.04);
    harp.visible = false;
    david.add(harp);
    dav.add(david);
    // fluffy sheep, and one little lamb that wanders off
    const wool = std(0xfdfdf8, 0.95, { flatShading: true }), face = std(0x3a3030, 0.8);
    const sheep = (size: number) => {
      const sh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 * size, 1), wool);
      body.scale.set(1.3, 1, 0.9);
      body.position.y = 0.09 * size;
      sh.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.035 * size, 6, 5), face);
      head.position.set(0.1 * size, 0.11 * size, 0.01);
      sh.add(head);
      return sh;
    };
    for (let k = 0; k < 3; k++) {
      const sh = sheep(1);
      sh.position.set(-0.15 + k * 0.22, 1.28, 0.02 + (k % 2) * 0.05);
      dav.add(sh);
      flock.push(sh);
    }
    lamb.add(sheep(0.65));
    dav.add(lamb);
    // music notes that float up while he plays
    const noteM = new THREE.MeshBasicMaterial({ color: 0x2b2b6b });
    for (let k = 0; k < 4; k++) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4).scale(1.3, 1, 1), noteM);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.006), noteM);
      stem.position.set(0.024, 0.03, 0);
      n.add(stem);
      dav.add(n);
      notes.push(n);
    }
    // the crown (and stars coming out in the sky)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12, 1, true), std(0xffd23e, 0.3, { metalness: 0.6, side: THREE.DoubleSide, emissive: 0x6a4a00 }));
    crown.add(ring);
    for (let k = 0; k < 5; k++) {
      const pt = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 4), std(0xffd23e, 0.3, { metalness: 0.6, emissive: 0x6a4a00 }));
      const a = (k / 5) * Math.PI * 2;
      pt.position.set(Math.cos(a) * 0.06, 0.04, Math.sin(a) * 0.06);
      crown.add(pt);
    }
    dav.add(crown);
    const starM = new THREE.MeshBasicMaterial({ color: 0xfff3a0 });
    for (let k = 0; k < 6; k++) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), starM);
      st.position.set(-0.8 + k * 0.32, 1.9 + (k % 2) * 0.12, -0.26);
      st.name = "star";
      dav.add(st);
    }
    dav.visible = false;
    stage.add(dav);
  }
  const SHOW = 17;
  let story = 0, plays = 0;                 // 0 = Noah's Ark, 1 = Jonah, 2 = Daniel and the lions, 3 = David the shepherd boy
  const sceneAt = (s: number) => s < 1 ? 0 : s < 4.5 ? 1 : s < 9 ? 2 : s < 12 ? 3 : 4;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  w.anim.push((t, dt) => {
    for (const wv of waves) wv.position.x = Math.sin(t * (story === 1 && showT >= 0 ? 3.2 : 1.6) + wv.userData.row * 1.4) * (story === 1 && showT >= 0 && showT < 9 ? 0.1 : 0.06);
    const s = showT;
    if (s >= 0) showT += dt;
    if (showT > SHOW) showT = -1;
    // curtains open at the start and close at the end
    const open = s < 0 ? 0 : Math.min(1, s / 1, (SHOW - s) / 1.2);
    curtains.forEach((c, i) => { c.scale.x = 1 - open * 0.8; c.position.x = (i ? 1 : -1) * 0.95; });
    const noah = s >= 0 && story === 0, jon = s >= 0 && story === 1, dani = s >= 0 && story === 2, davi = s >= 0 && story === 3;
    dan.visible = dani;
    dav.visible = davi;
    for (const wv of waves) wv.visible = !dani && !davi;
    ark.visible = noah;
    dove.visible = noah && s > 9 && s < 15.5;
    bow.visible = noah;
    for (const p of pairs) p.visible = noah;
    jBoat.visible = jon && s < 9.5;
    whale.visible = jon && s > 5;
    shore.visible = jon && s > 10.5;
    sun.visible = jon && s > 12;
    if (s < 0) {
      ark.position.x = -1.6; bow.scale.setScalar(0.01);
      for (const p of pairs) p.scale.setScalar(0.01);
      jonah.visible = true;
      if (jonah.parent !== jBoat) { jBoat.add(jonah); jonah.position.set(-0.1, 0.16, 0.03); jonah.rotation.set(0, 0, 0); }
      return;
    }
    if (noah) {
      ark.position.x = -1.6 + clamp01((s - 1) / 3) * 1.6;
      ark.position.y = 1.25 + Math.sin(t * 2.2) * 0.02;
      ark.rotation.z = Math.sin(t * 1.8) * 0.05;
      pairs.forEach((p, k) => {
        const g2 = clamp01((s - (4.8 + k * 1.3)) / 0.35);
        p.scale.setScalar(Math.max(0.01, g2 * (1 + Math.sin(g2 * Math.PI) * 0.4)));
        p.position.y = 0.26 + (g2 > 0 ? Math.abs(Math.sin(t * 6 + k)) * 0.03 : 0);
      });
      if (dove.visible) {
        const k = Math.min(1, (s - 9) / 2.5);
        dove.position.set(-1.0 + k * 1.1, 2.05 - k * 0.4 + Math.sin(t * 8) * 0.02, 0.05);
        dove.children.forEach((c) => { if (c.name === "wing") c.rotation.x = Math.sign(c.position.z) * (0.4 + Math.sin(t * 20) * 0.5); });
      }
      bow.scale.setScalar(Math.max(0.01, Math.min(1, (s - 12) / 1.5)));
      return;
    }
    if (davi) {
      // 1: David and his sheep · 2: playing the harp, notes float up · 3: a lost lamb found · 4: a crown, stars out
      const walkIn = clamp01((s - 1) / 2);
      david.position.set(-1.2 + walkIn * 0.95, 1.28 + (walkIn < 1 ? Math.abs(Math.sin(t * 8)) * 0.02 : 0), 0.06);
      flock.forEach((sh, k) => {
        sh.visible = s > 1.4 + k * 0.4;
        sh.position.y = 1.28 + Math.abs(Math.sin(t * 3 + k * 1.7)) * 0.02;
        sh.rotation.y = Math.sin(t * 0.7 + k) * 0.3;
      });
      const playing = s > 4.5 && s < 9;
      const crook = david.getObjectByName("crook")!;
      harp.visible = playing;
      crook.visible = !playing;
      notes.forEach((n, k) => {
        n.visible = playing;
        const ph = ((s - 4.5) * 0.5 + k / 4) % 1;
        n.position.set(-0.2 + Math.sin(ph * 6 + k) * 0.08 + k * 0.03, 1.55 + ph * 0.5, 0.08);
      });
      // the lamb: wanders off to the far right, then trots back beside David (riding in his arms the last bit)
      lamb.visible = s > 1.4;
      const away = clamp01((s - 6) / 2.5), back = clamp01((s - 9.5) / 2);
      lamb.position.set(0.15 + away * 0.6 - back * 0.55, 1.28 + (back > 0 && back < 1 ? Math.abs(Math.sin(t * 9)) * 0.03 : 0), 0.08);
      lamb.rotation.y = back > 0 ? Math.PI : 0;
      crown.visible = s > 12;
      const ck = clamp01((s - 12) / 1);
      crown.position.set(-0.25, 1.9 - ck * 0.3 + Math.sin(t * 2) * 0.02, 0.08);
      crown.rotation.y = t * 1.2;
      dav.children.forEach((c) => { if (c.name === "star") { c.visible = s > 12.5; c.rotation.y = t * 2; } });
      return;
    }
    if (dani) {
      // 1: praying at the window · 2: into the den, the lions pad in · 3: the angel, the lions sleep · 4: out, safe
      const win = dan.getObjectByName("window")!;
      win.visible = s < 4.8;
      den.visible = s > 4.2;
      den.scale.setScalar(Math.max(0.01, clamp01((s - 4.2) / 0.5)));
      if (s < 4.6) {
        daniel.position.set(-0.45, 1.27, 0.03);
        daniel.rotation.z = 0;
        daniel.scale.set(1, 0.8 + Math.sin(t * 3) * 0.03, 1); // kneeling, bowing gently
      } else if (s < 12.4) {
        const k = clamp01((s - 4.6) / 0.8);
        daniel.position.set(-0.45 + k * 0.65, 1.27 - k * 0.04, 0.06);
        daniel.scale.set(1, 1, 1);
      } else {
        // lifted out: a happy hop back to the left
        const k = clamp01((s - 12.4) / 0.8);
        daniel.position.set(0.2 - k * 0.6, 1.27 + Math.sin(k * Math.PI) * 0.3 + (k >= 1 ? Math.abs(Math.sin(t * 6)) * 0.04 : 0), 0.06);
      }
      lions.forEach((l, i) => {
        const sx = i ? 1 : -1;
        l.visible = s > 5.6;
        const walk = clamp01((s - 5.6) / 1.2);
        const asleep = clamp01((s - 9.6) / 0.8);
        l.position.set(0.2 + sx * (0.9 - walk * 0.48), 1.28 - asleep * 0.04, 0.08);
        l.rotation.z = sx * asleep * 0.25;
        l.scale.set(1, 1 - asleep * 0.25 + (asleep < 1 ? Math.abs(Math.sin(t * 7)) * 0.05 : 0), 1);
      });
      angel.visible = s > 9 && s < 15.8;
      const ak = clamp01((s - 9) / 0.8);
      angel.position.set(0.2, 1.95 - ak * 0.45 + Math.sin(t * 2) * 0.02, 0.09);
      angel.children.forEach((c) => { if (c.name === "wing") c.rotation.y = Math.sin(t * 6) * 0.4; });
      return;
    }
    // Jonah: the boat tossed by the storm; overboard; swallowed; praying inside; out onto the sand
    const bx = -1.6 + clamp01((s - 1) / 2.5) * 1.3 + clamp01((s - 5.5) / 3) * 2.0;
    jBoat.position.set(bx, 1.27 + Math.sin(t * 5) * 0.04, -0.06);
    jBoat.rotation.z = Math.sin(t * 4) * 0.2;
    if (s > 4.6 && jonah.parent === jBoat) {
      // over the side he goes
      stage.add(jonah);
      jonah.position.set(bx - 0.1, 1.45, 0.04);
    }
    if (jonah.parent === stage) {
      if (s < 6.1) {
        const k = clamp01((s - 4.6) / 0.8);
        jonah.position.set(-0.4 - k * 0.05, 1.45 - k * 0.25, 0.04);
        jonah.rotation.z = k * 1.2;
        jonah.visible = true;
      } else if (s < 12.3) {
        jonah.visible = false;            // inside the fish
      } else {
        // spat out onto the beach in a happy arc
        const k = clamp01((s - 12.3) / 0.7);
        jonah.visible = true;
        jonah.rotation.z = (1 - k) * 2.5;
        jonah.position.set(0.12 + k * 0.42, 1.42 + Math.sin(k * Math.PI) * 0.35 + k * 0.03, 0.05);
      }
    }
    // the fish rises under Jonah, gulps, and floats; it swims over to the beach to let him out
    const rise = clamp01((s - 5.0) / 0.9);
    const toShore = clamp01((s - 11.2) / 1.0);
    whale.position.set(-0.4 + toShore * 0.25, 1.0 + rise * 0.42 + Math.sin(t * 2) * 0.02, -0.02);
    whale.rotation.z = Math.sin(t * 1.5) * 0.06 + (s > 9 && s < 12 ? Math.sin(t * 3) * 0.04 : 0);
    sun.position.y = 1.3 + clamp01((s - 12) / 2) * 0.6;
    sun.rotation.z = t * 0.4;
  });
  const theatre = {
    pos: new THREE.Vector3(wx(PX, PZ + 1.6), base, wz(PX, PZ + 1.6)),
    play: () => { if (showT >= 0) return false; story = plays % 4; plays++; showT = 0; return true; },
    scene: () => (showT < 0 ? -1 : sceneAt(showT)),
    story: () => story,
  };

  // ── a flower garden outside the gate: six sleepy buds in a raised bed. Water each one and it
  // opens into a big bloom; when all six are out, butterflies come ──
  const GX = 6.4, GZ = 12.6, GW = 2.2, GD = 1.0;  // centre, half width (along x), half depth
  const buds: { stem: THREE.Group; head: THREE.Group; petals: THREE.Mesh[]; grow: number; want: boolean }[] = [];
  const flies: THREE.Group[] = [];
  const can = new THREE.Group();
  let canT = -1, canAt = new THREE.Vector3();
  {
    const plank = std(0x9a6a3a, 0.9), soil = std(0x5a3d26, 1, { flatShading: true });
    mesh(new THREE.BoxGeometry(GW * 2 - 0.2, 0.3, GD * 2 - 0.2), soil, GX, 0.18, GZ);
    for (const s of [-1, 1]) {
      mesh(new THREE.BoxGeometry(GW * 2, 0.4, 0.12), plank, GX, 0.2, GZ + s * (GD - 0.06));
      mesh(new THREE.BoxGeometry(0.12, 0.4, GD * 2), plank, GX + s * (GW - 0.06), 0.2, GZ);
    }
    solid(GX, GZ, GW, GD, 0.4);
    const stemM = std(0x3f9e3a, 0.8), leafM = std(0x56b84a, 0.8, { side: THREE.DoubleSide });
    const cols = [0xff6b9d, 0xffd93d, 0xb197fc, 0xff4757, 0xffffff, 0xff9f43];
    for (let i = 0; i < 6; i++) {
      const x = GX - 1.4 + (i % 3) * 1.4, z = GZ + (i < 3 ? -0.45 : 0.45);
      const stem = new THREE.Group();
      stem.position.set(x, 0.33, z);
      g.add(stem);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1, 6).translate(0, 0.5, 0), stemM);
      stem.add(st);
      for (const s of [-1, 1]) {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4).scale(1.4, 0.25, 0.6), leafM);
        lf.position.set(s * 0.1, 0.25, 0);
        lf.rotation.z = s * 0.4;
        stem.add(lf);
      }
      const head = new THREE.Group();
      head.position.y = 1;
      stem.add(head);
      const petalM = std(cols[i], 0.6, { side: THREE.DoubleSide, emissive: new THREE.Color(cols[i]).multiplyScalar(0.12) });
      // seven petals in one piece (open); a closed bud sits on top until it's watered
      const petalGeo = mergeGeometries(Array.from({ length: 7 }, (_, k) =>
        new THREE.SphereGeometry(0.11, 8, 5).scale(0.55, 0.18, 1).translate(0, 0, 0.11).rotateY((k / 7) * Math.PI * 2)))!;
      const open = new THREE.Mesh(petalGeo, petalM);
      head.add(open);
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6).scale(0.8, 1.4, 0.8), std(cols[i], 0.6));
      bud.position.y = 0.06;
      head.add(bud);
      const petals = [open, bud];
      const mid = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std(0xffb02e, 0.6));
      mid.position.y = 0.02;
      head.add(mid);
      buds.push({ stem, head, petals, grow: 0, want: false });
    }
    // butterflies (they come when the garden is in bloom)
    const wingCols = [0xff9ecf, 0x7fc8ff, 0xffe066];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      const wm = std(wingCols[i], 0.6, { side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const wg = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10).scale(1, 1.3, 1).translate(s * 0.09, 0, 0), wm);
        wg.rotation.x = -Math.PI / 2;
        wg.name = s < 0 ? "L" : "R";
        b.add(wg);
      }
      b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4).rotateX(Math.PI / 2), std(0x333333)));
      b.visible = false;
      g.add(b);
      flies.push(b);
    }
    // the watering can on a post at the corner (it floats over a bud to water it)
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), wood, GX + GW + 0.25, 0.35, GZ - GD - 0.1);
    const tin = std(0x5fa8d3, 0.4, { metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.3, 12), tin);
    can.add(body);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.36, 6), tin);
    spout.position.set(0.22, 0.06, 0);
    spout.rotation.z = -1.0;
    can.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 4, 10, Math.PI), tin);
    handle.position.y = 0.15;
    can.add(handle);
    can.position.set(GX + GW + 0.25, 0.85, GZ - GD - 0.1);
    g.add(can);
  }
  const canHome = can.position.clone();
  const drops: THREE.Mesh[] = [];
  {
    const dm = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
    for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 3), dm); d.visible = false; d.userData.keep = true; g.add(d); drops.push(d); }
  }
  w.anim.push((t, dt) => {
    let open = 0;
    buds.forEach((b, i) => {
      if (b.want) b.grow = Math.min(1, b.grow + dt * 0.7);
      const k = b.grow;
      if (k >= 1) open++;
      b.stem.scale.set(1, 0.45 + k * 0.55, 1);
      b.stem.rotation.z = Math.sin(t * 1.5 + i) * 0.05;
      // the bud shrinks away as the open flower grows out of it
      const [petals, bud] = b.petals;
      petals.scale.set(0.05 + k * 0.95, 0.3 + k * 0.7, 0.05 + k * 0.95);
      bud.scale.setScalar(Math.max(0.01, 1 - k * 1.2));
      b.head.scale.setScalar(0.6 + k * 0.9);
    });
    // the watering can flies over, tips, and drips, then goes home
    if (canT >= 0) {
      canT += dt;
      const k = canT < 0.5 ? canT / 0.5 : canT < 1.6 ? 1 : Math.max(0, 1 - (canT - 1.6) / 0.5);
      can.position.lerpVectors(canHome, canAt, k);
      can.rotation.z = canT > 0.5 && canT < 1.6 ? -0.7 : 0;
      drops.forEach((d, i) => {
        d.visible = canT > 0.5 && canT < 1.6;
        const f = ((canT * 2 + i / 6) % 1);
        d.position.set(canAt.x + 0.3 + (i % 2) * 0.03, canAt.y - 0.1 - f * 0.6, canAt.z + (i % 3 - 1) * 0.03);
      });
      if (canT > 2.1) { canT = -1; can.position.copy(canHome); can.rotation.z = 0; }
    }
    const all = open === buds.length;
    flies.forEach((b, i) => {
      b.visible = all;
      if (!all) return;
      const a = t * (0.6 + i * 0.15) + i * 2.1;
      b.position.set(GX + Math.sin(a) * (GW - 0.3), 1.6 + Math.sin(t * 2 + i) * 0.25, GZ + Math.cos(a * 1.3) * (GD - 0.1));
      b.rotation.y = -a;
      const flap = Math.sin(t * 22 + i) * 0.9;
      for (const c of b.children) if (c.name) c.rotation.y = c.name === "L" ? flap : -flap;
    });
  });
  const garden = {
    buds: buds.map((b) => new THREE.Vector3(wx(b.stem.position.x, b.stem.position.z), base + 0.33, wz(b.stem.position.x, b.stem.position.z))),
    water: (i: number) => {
      const b = buds[i];
      if (!b || b.want || canT >= 0) return false;
      b.want = true;
      canT = 0;
      canAt.set(b.stem.position.x - 0.3, 1.5, b.stem.position.z);
      return true;
    },
    bloomed: () => buds.filter((b) => b.grow >= 1).length,
    watered: (i: number) => !!buds[i]?.want,
    reset: () => { for (const b of buds) { b.want = false; b.grow = 0; } },
  };

  // ── a rope swing on a wooden frame beside the castle: sit on it and swing out over the meadow ──
  const SWX = 12.8, SWZ = 5.5, ROPE = 2.3, PIV = 2.95;
  const swingG = new THREE.Group();          // turns round the top bar
  swingG.position.set(SWX, PIV, SWZ);
  g.add(swingG);
  {
    for (const s of [-1, 1]) for (const lean of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.2, 6), wood, SWX + lean * 0.55, 1.5, SWZ + s * 1.25);
      leg.rotation.z = lean * 0.36;
    }
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8).rotateX(Math.PI / 2), wood, SWX, PIV + 0.05, SWZ);
    const ropeM = std(0xd9c39a, 1);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.02, 0.02, ROPE, 4), ropeM, 0, -ROPE / 2, s * 0.32, swingG);
    mesh(new THREE.BoxGeometry(0.42, 0.06, 0.8), std(0xff6b9d, 0.7), 0, -ROPE, 0, swingG);
    for (const s of [-1, 1]) solid(SWX, SWZ + s * 1.25, 0.65, 0.12, 3.1);
  }
  const fwd = new THREE.Vector3(wx(1, 0) - wx(0, 0), 0, wz(1, 0) - wz(0, 0));
  const ropeSwing = {
    pivot: new THREE.Vector3(wx(SWX, SWZ), base + PIV, wz(SWX, SWZ)),
    rope: ROPE,
    dir: fwd,
    facing: Math.atan2(fwd.x, fwd.z),
    set: (a: number) => { swingG.rotation.z = a; },
  };

  // ── a little fishing jetty off the beach: cast the line, wait for the bobber to dip, reel in a
  // fish, have a look, and let it go. Five kinds to find ──
  const JZ = 5, J0 = -18.2, J1 = -25.0;     // the jetty runs out along -x
  const sea = -0.5 - base;                   // the sea's height, in the castle's frame
  const DECK = 0.1;
  const bobber = new THREE.Group();
  const rod = new THREE.Group();
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
  const fish = new THREE.Group();
  const FISH_COLS = [0xffa62b, 0x2f80ed, 0xff6b9d, 0x3fbf6b, 0xb06bff];
  const fishBody = new THREE.MeshStandardMaterial({ color: 0xffa62b, roughness: 0.4, flatShading: true });
  let fishState: "idle" | "wait" | "bite" | "catch" = "idle", fishT = 0, biteAt = 0, fishKind = 0;
  const bobAt = new THREE.Vector3(J1 - 2.4, sea + 0.05, JZ + 0.3);
  {
    const plank = std(0xa77b4f, 0.95), post = std(0x6b4a2b, 0.95);
    // the deck: one low step from the sand, then the long boards
    mesh(new THREE.BoxGeometry(1.0, 0.12, 1.5), plank, J0 - 0.5, -0.16, JZ);
    plat(J0 - 0.5, JZ, 0.5, 0.75, -0.1);
    const len = Math.abs(J1 - (J0 - 1));
    const cx = (J1 + J0 - 1) / 2;
    for (let i = 0; i < Math.round(len / 0.35); i++) mesh(new THREE.BoxGeometry(0.3, 0.1, 1.5), plank, J0 - 1.15 - i * 0.35, DECK - 0.05, JZ);
    plat(cx, JZ, len / 2, 0.75, DECK);
    for (let i = 0; i <= 3; i++) for (const s of [-1, 1]) {
      const x = J0 - 1.2 - (i / 3) * (len - 0.4);
      mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.6, 6), post, x, DECK - 0.6, JZ + s * 0.7);
    }
    // a rail on one side, and the rod in a holder at the end
    for (let i = 0; i <= 3; i++) mesh(new THREE.BoxGeometry(0.07, 0.75, 0.07), post, J0 - 1.3 - (i / 3) * (len - 0.6), DECK + 0.38, JZ - 0.7);
    mesh(new THREE.BoxGeometry(len - 0.5, 0.07, 0.07), post, cx - 0.1, DECK + 0.75, JZ - 0.7);
    for (const s of [-1, 1]) solid(cx, JZ + s * 0.82, len / 2, 0.08, DECK + 0.9);
    solid(J1 - 0.12, JZ, 0.08, 0.8, DECK + 0.9);
    rod.position.set(J1 + 0.3, DECK + 0.45, JZ + 0.55);
    g.add(rod);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 2.2, 6).translate(0, 1.1, 0), std(0x333a44, 0.5));
    rod.add(pole);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateZ(Math.PI / 2), std(0xd94a4a, 0.5));
    reel.position.set(0.05, 0.35, 0);
    rod.add(reel);
    rod.rotation.z = 0.5;
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), post, J1 + 0.3, DECK + 0.25, JZ + 0.55);
    // a bucket for the catch (it's always let go again)
    mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 12, 1, true), std(0x8fb3c9, 0.5, { side: THREE.DoubleSide, metalness: 0.3 }), J1 + 0.9, DECK + 0.15, JZ - 0.35);
    // the bobber: red top, white bottom
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe84a5f, 0.5));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xffffff, 0.5));
    bobber.add(top, bot);
    bobber.visible = false;
    g.add(bobber);
    line.visible = false;
    line.frustumCulled = false;
    g.add(line);
    // a fish to show off when it's caught
    const fb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6).scale(1.6, 0.9, 0.55), fishBody);
    fish.add(fb);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.3), fishBody);
    tail.position.x = -0.3;
    fish.add(tail);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), std(0x111111, 0.3));
      eye.position.set(0.17, 0.04, s * 0.07);
      fish.add(eye);
    }
    fish.visible = false;
    g.add(fish);
  }
  const tip = new THREE.Vector3();
  w.anim.push((t, dt) => {
    fishT += dt;
    // the rod: upright in its holder, swung out while fishing, bending on a bite
    const want = fishState === "idle" ? 0.5 : fishState === "bite" ? 1.0 + Math.sin(t * 30) * 0.08 : 0.85;
    rod.rotation.z += (want - rod.rotation.z) * Math.min(1, dt * 6);
    bobber.visible = fishState === "wait" || fishState === "bite";
    if (bobber.visible) {
      const fly = Math.min(1, fishT / 0.5);
      const dip = fishState === "bite" ? -0.12 + Math.sin(t * 18) * 0.06 : Math.sin(t * 2.5) * 0.02;
      bobber.position.set(bobAt.x, bobAt.y + dip + (fishState === "wait" && fly < 1 ? Math.sin(fly * Math.PI) * 1.2 : 0), bobAt.z);
      if (fishState === "wait" && fly < 1) bobber.position.x = rod.position.x + (bobAt.x - rod.position.x) * fly;
      if (fishState === "wait" && fishT > biteAt) { fishState = "bite"; fishT = 0; }
      if (fishState === "bite" && fishT > 2.6) { fishState = "idle"; fishT = 0; lost = true; }
    }
    tip.set(0, 2.2, 0);
    rod.localToWorld(tip);
    g.worldToLocal(tip);
    line.visible = bobber.visible || fish.visible;
    if (line.visible) {
      const pts = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const end = fish.visible ? fish.position : bobber.position;
      pts.setXYZ(0, tip.x, tip.y, tip.z);
      pts.setXYZ(1, end.x, end.y + 0.1, end.z);
      pts.needsUpdate = true;
    }
    // the catch: up it comes, wriggling, then back with a splash
    fish.visible = fishState === "catch";
    if (fish.visible) {
      const k = fishT;
      const up = k < 0.6 ? k / 0.6 : k < 2.2 ? 1 : Math.max(0, 1 - (k - 2.2) / 0.5);
      fish.position.set(bobAt.x + 1.2 * up, sea + up * 1.6, bobAt.z);
      fish.rotation.z = up < 1 ? -1.2 * (1 - up) : Math.sin(t * 14) * 0.35;
      fish.rotation.y = Math.sin(t * 9) * 0.3;
      if (k > 2.7) { fishState = "idle"; fishT = 0; }
    }
  });
  let lost = false;
  const fishing = {
    pos: new THREE.Vector3(wx(J1 + 0.7, JZ), base + DECK, wz(J1 + 0.7, JZ)),
    state: () => fishState,
    cast: () => {
      if (fishState !== "idle") return false;
      fishState = "wait";
      fishT = 0;
      biteAt = 2 + Math.random() * 2.5;
      lost = false;
      return true;
    },
    reel: () => {
      if (fishState !== "bite") return -1;
      fishState = "catch";
      fishT = 0;
      fishKind = Math.floor(Math.random() * FISH_COLS.length);
      fishBody.color.setHex(FISH_COLS[fishKind]);
      return fishKind;
    },
    /** true once after a fish got away (it was not reeled in in time). */
    gotAway: () => { const l = lost; lost = false; return l; },
  };

  // ── a sandcastle to build on the beach, a bit at a time. Then a wave comes up the sand… ──
  const SCX = -18.9, SCZ = -4;
  const sand = std(0xf2d48f, 1, { flatShading: true });
  const sandParts: THREE.Object3D[][] = [[], [], [], []];
  const sc = new THREE.Group();
  sc.position.set(SCX, -0.3, SCZ);
  g.add(sc);
  const wave = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 4.5), new THREE.MeshStandardMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.75, roughness: 0.2 }));
  wave.visible = false;
  wave.userData.keep = true;
  g.add(wave);
  let scStage = 0, washT = -1;
  {
    const put = (stage: number, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const o = mesh(geo, m, x, y, z, sc);
      o.visible = false;
      sandParts[stage].push(o);
      return o;
    };
    // 1: the base mound and a moat ring; 2: the middle tower; 3: four little towers; 4: a flag and shells
    put(0, new THREE.CylinderGeometry(0.75, 0.9, 0.3, 14), sand, 0, 0.15, 0);
    put(0, new THREE.TorusGeometry(1.05, 0.06, 4, 20).rotateX(Math.PI / 2), std(0x7cc6f2, 0.3), 0, 0.03, 0);
    put(1, new THREE.CylinderGeometry(0.32, 0.38, 0.55, 10), sand, 0, 0.57, 0);
    put(1, new THREE.ConeGeometry(0.34, 0.3, 10), sand, 0, 1.0, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      put(2, new THREE.CylinderGeometry(0.15, 0.18, 0.4, 8), sand, Math.cos(a) * 0.55, 0.5, Math.sin(a) * 0.55);
      put(2, new THREE.ConeGeometry(0.17, 0.2, 8), sand, Math.cos(a) * 0.55, 0.8, Math.sin(a) * 0.55);
    }
    put(3, new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), std(0x6b4a2b), 0, 1.35, 0);
    const fl = put(3, new THREE.PlaneGeometry(0.3, 0.18).translate(0.15, 0, 0), std(0xff6b9d, 0.7, { side: THREE.DoubleSide }), 0.01, 1.5, 0);
    fl.castShadow = false;
    const shellM = std(0xfff0e6, 0.6);
    for (let i = 0; i < 5; i++) put(3, new THREE.SphereGeometry(0.06, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), shellM, Math.cos(i * 1.3) * 0.82, 0.3, Math.sin(i * 1.3) * 0.82);
    // a bucket and spade beside it
    mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 10), std(0xff4757, 0.6), 1.1, 0.13, 0.7, sc);
    const spade = mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), std(0x2f80ed, 0.6), 1.2, 0.25, -0.6, sc);
    spade.rotation.z = 0.5;
  }
  w.anim.push((t, dt) => {
    sandParts.forEach((list, i) => list.forEach((o) => { o.visible = i < scStage; }));
    if (washT >= 0) {
      washT += dt;
      // the wave runs up the sand over the castle and back again; the castle melts flat
      const k = washT < 1.2 ? washT / 1.2 : Math.max(0, 1 - (washT - 1.6) / 1.0);
      wave.visible = washT < 2.6;
      wave.position.set(SCX - 3.2 + k * 4.4, -0.38, SCZ);
      wave.scale.set(1 + k, 1, 1);
      (wave.material as THREE.MeshStandardMaterial).opacity = 0.75 * Math.min(1, k * 3);
      if (washT > 0.9) sc.scale.set(1 + (washT - 0.9) * 0.2, Math.max(0.05, 1 - (washT - 0.9) * 1.6), 1 + (washT - 0.9) * 0.2);
      if (washT > 2.8) { washT = -1; scStage = 0; sc.scale.set(1, 1, 1); wave.visible = false; }
    }
  });
  const sandcastle = {
    pos: new THREE.Vector3(wx(SCX + 1.4, SCZ), base - 0.3, wz(SCX + 1.4, SCZ)),
    stage: () => scStage,
    washing: () => washT >= 0,
    build: () => { if (washT >= 0 || scStage >= 4) return -1; scStage++; return scStage; },
    wash: () => { if (washT < 0 && scStage > 0) washT = 0; },
  };

  // ── the season: harvest pumpkins and a thanksgiving table, a Christmas tree and lights, or Easter eggs ──
  const season = currentSeason();
  const seasonal = {
    kind: season,
    /** Where to stand to give thanks (harvest) or light the tree (Christmas). */
    spot: null as THREE.Vector3 | null,
    lightTree: () => {},
    eggs: [] as THREE.Vector3[],
    takeEgg: (_i: number) => {},
    resetEggs: () => {},
  };
  if (season === "harvest") {
    const pumpkinM = std(0xf28c28, 0.7, { flatShading: true }), stemM = std(0x4f7a2a, 0.9);
    const pumpkin = (x: number, z: number, sz: number) => {
      const p = mesh(new THREE.SphereGeometry(0.32 * sz, 12, 8).scale(1.15, 0.8, 1.15), pumpkinM, x, 0.24 * sz, z);
      p.rotation.y = x * 3.1;
      mesh(new THREE.CylinderGeometry(0.03 * sz, 0.04 * sz, 0.12 * sz, 5), stemM, x, 0.5 * sz, z);
    };
    for (const [x, z, sz] of [[-2.5, 11, 1], [-2.6, 12.6, 0.8], [-2.4, 14.2, 1.1], [2.5, 14.8, 0.9], [2.4, 16, 0.7], [-2.5, 15.6, 0.75]] as const) pumpkin(x, z, sz);
    // wheat sheaves tied with string
    const wheat = std(0xe8c35a, 1, { flatShading: true }), tie = std(0xa0522d, 0.9);
    for (const sx of [-1, 1]) {
      const x = sx * 2.5, z = 9.9 + (sx > 0 ? 3.6 : 7.2);
      mesh(new THREE.CylinderGeometry(0.28, 0.16, 0.9, 10), wheat, x, 0.45, z);
      mesh(new THREE.ConeGeometry(0.34, 0.45, 10), wheat, x, 1.1, z);
      mesh(new THREE.TorusGeometry(0.2, 0.03, 4, 12).rotateX(Math.PI / 2), tie, x, 0.6, z);
    }
    // the thanksgiving table: a cloth, a basket of apples, a loaf, grapes and a pumpkin pie
    const tx = -4.6, tz = 12.2;
    mesh(new THREE.BoxGeometry(1.0, 0.07, 1.9), wood, tx, 0.78, tz);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, 0.78, 0.08), wood, tx + dx * 0.42, 0.39, tz + dz * 0.85);
    mesh(new THREE.BoxGeometry(1.06, 0.02, 1.96), std(0xfff3dc, 0.9), tx, 0.825, tz);
    mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.18, 12, 1, true), std(0xb8864b, 1, { side: THREE.DoubleSide }), tx, 0.93, tz - 0.5);
    for (let k = 0; k < 5; k++) mesh(new THREE.SphereGeometry(0.08, 8, 6), std(k % 2 ? 0xd93a3a : 0x7cc04a, 0.6), tx + Math.cos(k * 1.3) * 0.1, 1.02 + (k > 2 ? 0.06 : 0), tz - 0.5 + Math.sin(k * 1.3) * 0.1);
    mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1.3, 0.6, 0.8), std(0xd9973f, 0.8, { flatShading: true }), tx, 0.9, tz + 0.1);
    for (let k = 0; k < 7; k++) mesh(new THREE.SphereGeometry(0.045, 6, 4), std(0x7b3fa0, 0.5), tx + (k % 3 - 1) * 0.07, 0.88 + Math.floor(k / 3) * 0.06, tz + 0.55 + (k % 2) * 0.05);
    mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.06, 14), std(0xd7792b, 0.8), tx + 0.2, 0.87, tz + 0.6);
    solid(tx, tz, 0.5, 0.95, 0.9);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshBasicMaterial({ map: textTexture("Harvest Thanks!", "#c2410c", "#fff3dc") }));
    sign.position.set(tx - 0.55, 1.55, tz);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), wood, tx - 0.56, 0.7, tz - 0.6);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), wood, tx - 0.56, 0.7, tz + 0.6);
    seasonal.spot = new THREE.Vector3(wx(tx + 1.0, tz), base, wz(tx + 1.0, tz));
  } else if (season === "christmas") {
    // a tall tree in the courtyard's front corner, ornaments, presents and a star to light up
    const tx = -4.7, tz = 6.2;
    mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.5, 8), wood, tx, 0.25, tz);
    const pine = std(0x1f7a3a, 0.8, { flatShading: true });
    for (const [y, r, h] of [[0.9, 1.0, 1.2], [1.6, 0.8, 1.0], [2.25, 0.55, 0.85]] as const) mesh(new THREE.ConeGeometry(r, h, 10), pine, tx, y, tz);
    const starTop = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0x6a5000, roughness: 0.3 }));
    starTop.position.set(tx, 2.8, tz);
    starTop.userData.keep = true;
    g.add(starTop);
    const bulbCols = [0xff4757, 0xffd93d, 0x2f80ed, 0x3fbf6b, 0xff9ecf];
    // each bulb keeps its own colour (instance colour × material colour): dim until the tree is lit
    const bulbM = new THREE.MeshBasicMaterial({ color: 0x555555 });
    const treeBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), bulbM, 26);
    const mtx = new THREE.Matrix4();
    for (let k = 0; k < 26; k++) {
      const y = 0.55 + (k / 26) * 1.9, r = 0.95 * (1 - (y - 0.4) / 2.4) + 0.05;
      const a = k * 2.4;
      mtx.makeTranslation(tx + Math.cos(a) * r, y, tz + Math.sin(a) * r);
      treeBulbs.setMatrixAt(k, mtx);
      treeBulbs.setColorAt(k, new THREE.Color(bulbCols[k % bulbCols.length]));
    }
    treeBulbs.userData.keep = true;
    g.add(treeBulbs);
    for (const [dx, dz, c] of [[0.75, -0.3, 0xff4757], [0.55, 0.45, 0x2f80ed], [0.85, 0.1, 0xffd93d]] as const) {
      mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), std(c, 0.6), tx + dx, 0.14, tz + dz);
      mesh(new THREE.BoxGeometry(0.36, 0.06, 0.08), std(0xffffff, 0.5), tx + dx, 0.29, tz + dz);
    }
    solid(tx, tz, 0.55, 0.55, 2.9);
    // fairy lights all along the inside of the walkway
    const along: THREE.Vector3[] = [];
    for (let k = 0; k <= 14; k++) {
      const v = -S + 0.8 + (k / 14) * (2 * S - 1.6);
      along.push(new THREE.Vector3(v, H + 0.12, -S + T / 2 + 0.05), new THREE.Vector3(v, H + 0.12, S - T / 2 - 0.05), new THREE.Vector3(-S + T / 2 + 0.05, H + 0.12, v), new THREE.Vector3(S - T / 2 - 0.05, H + 0.12, v));
    }
    const wallBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), along.length);
    along.forEach((p, k) => {
      mtx.makeTranslation(p.x, p.y, p.z);
      wallBulbs.setMatrixAt(k, mtx);
      wallBulbs.setColorAt(k, new THREE.Color(bulbCols[k % bulbCols.length]));
    });
    wallBulbs.userData.keep = true;
    g.add(wallBulbs);
    let lit = 0;
    const treeGlow = new THREE.PointLight(0xffe6a0, 0, 6);
    treeGlow.position.set(tx, 1.6, tz + 0.8);
    g.add(treeGlow);
    w.anim.push((t, dt) => {
      if (lit > 0) lit = Math.min(1, lit + dt * 1.5);
      bulbM.color.setScalar(0.33 + lit * (0.62 + Math.sin(t * 4) * 0.05));
      (starTop.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + lit * 2.5;
      starTop.rotation.y = t * 0.8;
      treeGlow.intensity = lit * 2.2;
    });
    seasonal.spot = new THREE.Vector3(wx(tx + 1.2, tz - 0.4), base, wz(tx + 1.2, tz - 0.4));
    seasonal.lightTree = () => { if (lit === 0) lit = 0.01; };
  } else if (season === "easter") {
    // five painted eggs hidden round the castle
    const spots: [number, number, number][] = [[3.5, 0.25, 11.0], [-1.8, 0.25, -12.4], [12.8, 0.25, 7.6], [6.8, 0.25, 3.5], [4.6, 0.25, -4.8]];
    const cols = [[0xff9ecf, 0xffffff], [0x7fc8ff, 0xffd93d], [0xb197fc, 0x7ee08a], [0xffd93d, 0xff6b9d], [0x7ee08a, 0x2f80ed]];
    const eggs = spots.map(([x, y, z], i) => {
      const e = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10).scale(1, 1.3, 1), std(cols[i][0], 0.5));
      e.add(shell);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16).rotateX(Math.PI / 2), std(cols[i][1], 0.5));
      e.add(band);
      e.position.set(x, y, z);
      g.add(e);
      return e;
    });
    w.anim.push((t) => eggs.forEach((e, i) => { if (e.visible) { e.rotation.y = t + i; e.position.y = spots[i][1] + Math.abs(Math.sin(t * 2 + i)) * 0.06; } }));
    seasonal.eggs = spots.map(([x, y, z]) => new THREE.Vector3(wx(x, z), base + y, wz(x, z)));
    seasonal.takeEgg = (i) => { if (eggs[i]) eggs[i].visible = false; };
    seasonal.resetEggs = () => { for (const e of eggs) e.visible = true; };
  }

  // everything built since the first pass: join the still parts again (the moving ones are kept)
  mergeByMaterial(g);
  for (const part of [bouncy, booth, cat, raft]) mergeByMaterial(part);
  // shadows only from things big enough to see them: tiny parts, feathers and puppets skip the shadow pass
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.castShadow) return;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const r = m.geometry.boundingSphere!.radius * Math.max(m.scale.x, m.scale.y, m.scale.z);
    if (r < 0.15) m.castShadow = false;
  });
  stage.traverse((o) => { o.castShadow = false; });
  for (const p of pea) for (const f of p.feathers) f.traverse((o) => { o.castShadow = false; });

  const kz = -S + T / 2 + 2.2 + 1.6;
  const thx = -2.5 - 1.6, thz = kz + 2.2 + 1.2;
  return {
    throne: { seat: new THREE.Vector3(wx(thx, thz + 0.02), base + 0.92, wz(thx, thz + 0.02)), facing: th },
    perch: new THREE.Vector3(wx(0, kz), base + 8.5, wz(0, kz)),
    facing: th,
    centre: new THREE.Vector3(c.x, base, c.z),
    bell: {
      pos: new THREE.Vector3(wx(bellAt.x, bellAt.z), base, wz(bellAt.x, bellAt.z)),
      ring: () => { swingT = 0; release(); },
    },
    slide: {
      board: new THREE.Vector3(wx(S - 0.3, SZ - SR), base + H, wz(S - 0.3, SZ - SR)),
      path: new THREE.CatmullRomCurve3(slidePts.map((p) => new THREE.Vector3(wx(p.x, p.z), base + p.y, wz(p.x, p.z))), false, "centripetal"),
    },
    fireworks: { pos: new THREE.Vector3(wx(fwAt.x, fwAt.z), base + H, wz(fwAt.x, fwAt.z)), launch },
    armour: { pos: new THREE.Vector3(wx(armourAt.x, armourAt.z), base, wz(armourAt.x, armourAt.z)) },
    treasure: {
      keys: keySpots.map(([x, y, z]) => new THREE.Vector3(wx(x, z), base + y, wz(x, z))),
      take: (i) => { if (keys[i]) keys[i].visible = false; },
      chest: new THREE.Vector3(wx(chestAt.x, chestAt.z), base, wz(chestAt.x, chestAt.z)),
      open: () => { if (openT < 0) openT = 0; },
      reset: () => { for (const k of keys) k.visible = true; openT = -1; lid.rotation.x = 0; glow.intensity = 0; },
    },
    peacocks: { pos: peaWorld, show: (i) => { if (pea[i]) pea[i].want = 2.5; } },
    bouncy: {
      min: new THREE.Vector3(Math.min(wx(BX - BH, BZ - BH), wx(BX + BH, BZ + BH)), base + BF, Math.min(wz(BX - BH, BZ - BH), wz(BX + BH, BZ + BH))),
      max: new THREE.Vector3(Math.max(wx(BX - BH, BZ - BH), wx(BX + BH, BZ + BH)), base + BF, Math.max(wz(BX - BH, BZ - BH), wz(BX + BH, BZ + BH))),
      squish: () => { squishT = 1; },
    },
    catapult,
    oven,
    theatre,
    garden,
    swing: ropeSwing,
    fishing,
    sandcastle,
    seasonal,
    chimes: {
      stones: chimeStones.map((c) => new THREE.Vector3(wx(c.m.position.x, chimeZ), base + 0.1, wz(c.m.position.x, chimeZ))),
      press: (i) => { if (chimeStones[i]) chimeStones[i].dip = 1; },
      guide: (i) => {
        chimeStones.forEach((c, k) => { c.lit = k === i; });
        star.visible = i >= 0 && i < chimeStones.length;
      },
    },
  };

  function torch(x: number, y: number, z: number): void {
    mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.5, 6), wood, x, y, z);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 6), flame);
    f.userData.keep = true;
    f.position.set(x, y + 0.38, z);
    g.add(f);
    const ph = x * 3.1 + z;
    w.anim.push((t) => { f.scale.set(1, 0.85 + Math.sin(t * 13 + ph) * 0.15 + Math.sin(t * 7.3 + ph) * 0.1, 1); });
  }
}

/** A peacock feather painted on a card: a green blade with a gold-and-blue eye near the tip. */
let featherTex: THREE.CanvasTexture | null = null;
function featherTexture(): THREE.CanvasTexture {
  if (featherTex) return featherTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const x = c.getContext("2d")!;
  // the blade: a long soft leaf shape with a darker stem
  x.fillStyle = "#2f9e5a";
  x.beginPath();
  x.moveTo(32, 256);
  x.bezierCurveTo(8, 190, 2, 60, 32, 4);
  x.bezierCurveTo(62, 60, 56, 190, 32, 256);
  x.fill();
  x.strokeStyle = "#1f6e3c";
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(32, 256);
  x.lineTo(32, 40);
  x.stroke();
  // the eye: green ring, gold, deep blue
  const ey = 256 * 0.12;
  for (const [r, col] of [[28, "#2fb37a"], [18, "#e8b830"], [11, "#1747a6"]] as const) {
    x.fillStyle = col;
    x.beginPath();
    x.ellipse(32, ey, r, r * 1.05, 0, 0, Math.PI * 2);
    x.fill();
  }
  featherTex = new THREE.CanvasTexture(c);
  featherTex.colorSpace = THREE.SRGBColorSpace;
  return featherTex;
}

/**
 * A slide's chute: a half-pipe following the curve (the curve runs along its bottom), open at the top.
 */
function troughGeometry(curve: THREE.Curve<THREE.Vector3>, segments: number, halfW: number): THREE.BufferGeometry {
  const M = 10;
  const pos: number[] = [], idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    curve.getPointAt(i / segments, c);
    curve.getTangentAt(i / segments, t);
    side.crossVectors(t, up).normalize();
    n.crossVectors(side, t).normalize();
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI;
      const p = c.clone().addScaledVector(side, -Math.cos(th) * halfW).addScaledVector(n, (1 - Math.sin(th)) * halfW * 0.9);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Hundreds of stones, merlons and planks: one mesh per material, so the castle draws quickly. */
export function mergeByMaterial(g: THREE.Group): void {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const o of g.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.keep || !m.visible || Array.isArray(m.material)) continue;
    (byMat.get(m.material) ?? byMat.set(m.material, []).get(m.material)!).push(m);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
      return geo;
    });
    const merged = mergeGeometries(geos);
    for (const x of geos) x.dispose();
    if (!merged) continue;
    for (const m of list) { g.remove(m); m.geometry.dispose(); }
    const one = new THREE.Mesh(merged, mat);
    one.castShadow = true;
    one.receiveShadow = true;
    g.add(one);
  }
}
