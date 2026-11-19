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

  const std = (color: number, rough = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
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
  g.add(star);
  CHIME_COLS.forEach((col, i) => {
    const mat = std(col, 0.5, { emissive: col, emissiveIntensity: 0.1 });
    const m = mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.1, 16), mat, -2.9 + i * 0.95, 0.05, chimeZ);
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
function mergeByMaterial(g: THREE.Group): void {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const o of g.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.keep || Array.isArray(m.material)) continue;
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
