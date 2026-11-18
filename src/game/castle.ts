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

  const kz = -S + T / 2 + 2.2 + 1.6;
  return {
    perch: new THREE.Vector3(wx(0, kz), base + 8.5, wz(0, kz)),
    facing: th,
    centre: new THREE.Vector3(c.x, base, c.z),
    bell: {
      pos: new THREE.Vector3(wx(bellAt.x, bellAt.z), base, wz(bellAt.x, bellAt.z)),
      ring: () => { swingT = 0; release(); },
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
