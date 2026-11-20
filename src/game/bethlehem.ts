/**
 * bethlehem.ts — the scenery of Christmas in Bethlehem (Luke 2, Matthew 2), drawn in code:
 *
 *   the town gate with its name, flat-roofed stone houses (some with outside stairs up to the
 *   roof, like real houses of the time), the inn, market stalls with lanterns, the stable with
 *   the manger and baby Jesus, the great star above it with a soft beam of light, the shepherds'
 *   field with a flock, a campfire and an angel over the hill.
 *
 * world.ts calls buildBethlehem() for a level with `bethlehem` set, handing over its scene group,
 * walkable platforms, solid boxes and per-frame animations.
 */

import * as THREE from "three";
import type { Platform } from "./world";
import { buildLamb } from "./quests";

export interface BethlehemDef {
  /** The stable (open side faces +Z): x, z. The star shines above it. */
  stable: [number, number];
  /** Flat-roofed houses: x, z, width, depth, height, colour, stairs (1 = up the +X side, -1 = -X, 0 = none). */
  houses: [number, number, number, number, number, number, number][];
  /** The inn: x, z, width, depth, height (stairs up its +X side). */
  inn: [number, number, number, number, number];
  /** Market stalls: x, z, awning colour. */
  stalls: [number, number, number][];
  /** The town gate (an arch facing +Z): x, z. */
  gate: [number, number];
  /** Sheep grazing in the shepherds' field: x, z, how many. */
  flock: [number, number, number];
  /** The shepherds' campfire: x, z. */
  fire: [number, number];
  /** The angel over the field: x, y, z. */
  angel: [number, number, number];
}

interface Solid { minX: number; maxX: number; minZ: number; maxZ: number; topY: number }

export interface BethlehemWorld {
  group: THREE.Group;
  platforms: Platform[];
  solids: Solid[];
  anim: ((t: number, dt: number) => void)[];
}

const STONE = [0xe9d3a8, 0xdcc08e, 0xf0dcb4, 0xe2c79a, 0xd8bb8a];

export function buildBethlehem(w: BethlehemWorld, b: BethlehemDef, base: number): void {
  const g = new THREE.Group();
  w.group.add(g);
  const std = (color: number, rough = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  const box = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const plat = (x: number, z: number, hw: number, hd: number, topY: number) => w.platforms.push({
    kind: "box", x, z, r: 0, hw, hd, topY, spring: 0, baseX: x, baseZ: z, dx: 0, dz: 0, mesh: new THREE.Object3D(), squashT: 0,
  });
  const solid = (x: number, z: number, hw: number, hd: number, topY: number) =>
    w.solids.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, topY });
  const glowWin = std(0xffd27a, 0.5, { emissive: 0xffb23e, emissiveIntensity: 0.9 });
  const doorMat = std(0x5a3a22);
  const wood = std(0x8a5a33);
  const darkWood = std(0x5e3b1f);

  // ── houses: stone boxes with a parapet, a dark doorway, warm windows, and maybe stairs ──
  const house = (x: number, z: number, wd: number, dp: number, h: number, color: number, stairs: number, inn = false) => {
    const wall = std(color);
    box(wall, wd, h, dp, x, base + h / 2, z);
    // the parapet round the flat roof
    const lip = std(new THREE.Color(color).multiplyScalar(0.9).getHex());
    for (const sz of [-1, 1]) box(lip, wd + 0.1, 0.35, 0.2, x, base + h + 0.17, z + sz * (dp / 2 - 0.05));
    for (const sx of [-1, 1]) {
      if (sx === stairs) continue; // the side the stairs arrive on stays open
      box(lip, 0.2, 0.35, dp, x + sx * (wd / 2 - 0.05), base + h + 0.17, z);
    }
    box(doorMat, 1.1, 1.9, 0.08, x, base + 0.95, z + dp / 2 + 0.03);
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), doorMat);
    arch.position.set(x, base + 1.9, z + dp / 2 + 0.03);
    g.add(arch);
    const floors = Math.max(1, Math.floor(h / 2.8));
    for (let f = 0; f < floors; f++) {
      for (const sx of [-1, 1]) {
        if (wd < 4.5 && f === 0) continue;
        box(glowWin, 0.6, 0.7, 0.06, x + sx * wd * 0.3, base + (f === 0 ? 2.0 : 1.9 + f * 2.6), z + dp / 2 + 0.03).castShadow = false;
      }
      if (f > 0) box(glowWin, 0.6, 0.7, 0.06, x, base + 1.9 + f * 2.6, z + dp / 2 + 0.03).castShadow = false;
    }
    if (inn) {
      // a wooden balcony and a hanging sign
      box(wood, wd * 0.7, 0.15, 0.9, x, base + 2.9, z + dp / 2 + 0.45);
      for (const sx of [-1, 1]) box(wood, 0.12, 2.9, 0.12, x + sx * wd * 0.33, base + 1.45, z + dp / 2 + 0.85);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.08), new THREE.MeshStandardMaterial({ map: textTexture("🏠 The Inn", "#f6e7c8", "#5e3b1f"), roughness: 0.8 }));
      sign.position.set(x, base + 3.5, z + dp / 2 + 0.95);
      g.add(sign);
    }
    solid(x, z, wd / 2, dp / 2, base + h);
    plat(x, z, wd / 2, dp / 2, base + h);
    if (stairs) {
      // steps up the side, from the front corner to the roof at the back
      // (each step is lower than the 0.35 a kid can step up; each is solid below the step before it,
      // so nobody walks through the staircase, but it never blocks the next step up)
      const sx = x + stairs * (wd / 2 + 0.65);
      const span = dp - 0.3;
      const n = Math.ceil(h / 0.3);
      const depth = span / n;
      const stepMat = std(new THREE.Color(color).multiplyScalar(0.94).getHex());
      for (let i = 0; i < n; i++) {
        const top = base + ((i + 1) * h) / n;
        const sz = z + dp / 2 - 0.15 - depth * (i + 0.5);
        box(stepMat, 1.2, top - base, depth, sx, base + (top - base) / 2, sz);
        plat(sx, sz, 0.6, depth / 2, top);
        if (i > 1) solid(sx, sz, 0.6, depth / 2, top - (2 * h) / n); // (a step is shallower than a kid is wide)
      }
    }
  };
  for (const [x, z, wd, dp, h, color, stairs] of b.houses) house(x, z, wd, dp, h, color, stairs);
  {
    const [x, z, wd, dp, h] = b.inn;
    house(x, z, wd, dp, h, 0xd9b98a, 1, true);
  }

  // ── market stalls with striped awnings and a lantern ──
  for (const [x, z, color] of b.stalls) {
    const top = std(color);
    box(wood, 2.4, 0.9, 1.2, x, base + 0.45, z);
    for (const sx of [-1, 1]) box(darkWood, 0.1, 2.3, 0.1, x + sx * 1.15, base + 1.15, z - 0.55);
    for (const sx of [-1, 1]) box(darkWood, 0.1, 2.0, 0.1, x + sx * 1.15, base + 1.0, z + 0.55);
    const awn = box(top, 2.7, 0.08, 1.6, x, base + 2.2, z);
    awn.rotation.x = 0.2;
    for (const [k, c] of [[-0.6, 0xff9f43], [0, 0x7ed957], [0.6, 0xff6b9d]] as const) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), std(c, 0.6));
      fruit.position.set(x + k, base + 1.05, z + 0.2);
      g.add(fruit);
    }
    lantern(g, x + 1.15, base + 2.05, z + 0.7);
    solid(x, z, 1.2, 0.6, base + 0.9);
  }

  // ── the town gate: two stone towers and an arch with the town's name ──
  {
    const [x, z] = b.gate;
    const stone = std(0xcdb48a);
    for (const sx of [-1, 1]) {
      box(stone, 1.6, 5, 1.6, x + sx * 3.2, base + 2.5, z);
      box(std(0xbfa57a), 1.9, 0.4, 1.9, x + sx * 3.2, base + 5.2, z);
      solid(x + sx * 3.2, z, 0.8, 0.8, base + 5);
      lantern(g, x + sx * 2.3, base + 3.2, z + 0.9);
    }
    box(stone, 8, 0.9, 1.4, x, base + 5.4, z);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshStandardMaterial({ map: textTexture("⭐ BETHLEHEM ⭐", "#cdb48a", "#5e3b1f"), roughness: 0.9 }));
    name.position.set(x, base + 5.4, z + 0.71);
    g.add(name);
  }

  // ── the stable: a wooden shelter, open at the front, with the manger ──
  {
    const [x, z] = b.stable;
    const W = 7.5, D = 5, H = 3.6;
    const plank = std(0x8b5e34);
    box(plank, W, H, 0.25, x, base + H / 2, z - D / 2);                       // back wall
    for (const sx of [-1, 1]) box(plank, 0.25, H, D, x + sx * W / 2, base + H / 2, z);
    for (const sx of [-1, 1]) box(darkWood, 0.3, H + 0.2, 0.3, x + sx * (W / 2), base + (H + 0.2) / 2, z + D / 2);
    const roof = box(std(0x6b4a2b), W + 1, 0.25, D + 1.2, x, base + H + 0.3, z + 0.1);
    roof.rotation.x = -0.12;
    // straw on the roof and on the floor
    box(std(0xe2bf5a, 1), W + 0.8, 0.12, D + 1, x, base + H + 0.48, z + 0.1).rotation.x = -0.12;
    box(std(0xe2c26a, 1), W - 0.4, 0.06, D - 0.3, x, base + 0.03, z).receiveShadow = true;
    // the manger, with baby Jesus wrapped in swaddling clothes (Luke 2:7, 12)
    const manger = new THREE.Group();
    manger.position.set(x, base, z - 0.6);
    g.add(manger);
    for (const sx of [-1, 1]) {
      const legA = box(wood, 0.1, 0.8, 0.1, sx * 0.55, 0.35, 0.25, manger);
      legA.rotation.z = sx * 0.3;
      const legB = box(wood, 0.1, 0.8, 0.1, sx * 0.55, 0.35, -0.25, manger);
      legB.rotation.z = sx * 0.3;
    }
    const trough = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 1.3, 4, 1, true).rotateZ(Math.PI / 2).rotateX(Math.PI / 4), std(0x9a6a3a, 0.9, { side: THREE.DoubleSide }));
    trough.position.y = 0.78;
    trough.scale.set(1, 0.7, 1);
    manger.add(trough);
    box(std(0xf0cf6a, 1), 1.1, 0.12, 0.5, 0, 0.82, 0, manger);
    const cloth = std(0xfdf8ee, 0.8, { emissive: 0xfff2c0, emissiveIntensity: 0.35 });
    const baby = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.38, 6, 10).rotateZ(Math.PI / 2), cloth);
    baby.position.set(0.05, 0.98, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), std(0xe8b48a, 0.7));
    head.position.set(-0.32, 1.0, 0);
    manger.add(baby, head);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 20).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    halo.position.set(-0.36, 1.08, 0);
    manger.add(halo);
    // warm light in the stable
    const warm = new THREE.PointLight(0xffc56b, 18, 12, 1.6);
    warm.position.set(x, base + 2.6, z + 0.3);
    g.add(warm);
    lantern(g, x - W / 2 + 0.5, base + 2.4, z + D / 2 - 0.3);
    // walls are solid; the roof is a place to stand
    solid(x, z - D / 2, W / 2, 0.15, base + H);
    for (const sx of [-1, 1]) solid(x + sx * W / 2, z, 0.15, D / 2, base + H);
    plat(x, z + 0.1, W / 2 + 0.5, D / 2 + 0.6, base + H + 0.5);
    solid(x, z - 0.6, 0.7, 0.35, base + 1.0); // the manger

    // ── the star, high above the stable, and its beam ──
    const star = new THREE.Group();
    star.position.set(x, 26, z);
    g.add(star);
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 === 0 ? 2.4 : 1.0;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xfff4b8, fog: false });
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelSegments: 1 }).center(), starMat);
    star.add(body);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(16);
    glow.userData.keepInPhoto = true;
    star.add(glow);
    const beamH = 26 - base - H;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 3.6, beamH, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    );
    beam.position.set(x, base + H + beamH / 2, z);
    g.add(beam);
    w.anim.push((t) => {
      body.rotation.y = Math.sin(t * 0.5) * 0.5;
      glow.material.opacity = 0.75 + Math.sin(t * 2.2) * 0.2;
    });
  }

  // ── the shepherds' field: a flock, a campfire, and the angel over the hill ──
  {
    const [fx, fz, n] = b.flock;
    const lambs: { m: THREE.Group; legs: THREE.Object3D[]; a: number; r: number; s: number }[] = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Group();
      const legs: THREE.Object3D[] = [];
      buildLamb(m, legs);
      m.scale.setScalar(i % 3 === 0 ? 1.35 : 1.1);
      m.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      g.add(m);
      lambs.push({ m, legs, a: (i / n) * Math.PI * 2, r: 2 + (i % 3) * 1.4, s: 0.08 + (i % 4) * 0.03 });
    }
    w.anim.push((t) => {
      for (const l of lambs) {
        // amble slowly round the field, nibbling
        const a = l.a + t * l.s;
        l.m.position.set(fx + Math.cos(a) * l.r, base + 0.04, fz + Math.sin(a) * l.r);
        l.m.rotation.y = -a;
        const step = Math.sin(t * 5 + l.a * 3) * 0.4;
        l.legs.forEach((leg, k) => (leg.rotation.x = k === 0 || k === 3 ? step : -step));
      }
    });
    const [cx, cz] = b.fire;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), std(0x8d8478));
      rock.position.set(cx + Math.cos(a) * 0.65, base + 0.12, cz + Math.sin(a) * 0.65);
      g.add(rock);
    }
    for (let i = 0; i < 3; i++) {
      const log = box(darkWood, 0.9, 0.14, 0.14, cx, base + 0.12, cz);
      log.rotation.y = (i / 3) * Math.PI;
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.9 });
    const flames = [0, 1, 2].map((i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 - i * 0.04, 0.7 - i * 0.12, 7), i === 2 ? new THREE.MeshBasicMaterial({ color: 0xfff1a0 }) : flameMat);
      f.position.set(cx + (i - 1) * 0.1, base + 0.5, cz);
      g.add(f);
      return f;
    });
    const fireLight = new THREE.PointLight(0xff9a3c, 14, 10, 1.6);
    fireLight.position.set(cx, base + 1.2, cz);
    g.add(fireLight);
    solid(cx, cz, 0.6, 0.6, base + 0.4);
    // logs to sit on
    for (const [ox, oz] of [[1.6, 0.3], [-1.4, 0.8]] as const) box(darkWood, 1.3, 0.3, 0.35, cx + ox, base + 0.15, cz + oz).rotation.y = ox > 0 ? 1.4 : 0.4;

    const [ax, ay, az] = b.angel;
    const angel = new THREE.Group();
    angel.position.set(ax, ay, az);
    g.add(angel);
    const robe = std(0xffffff, 0.6, { emissive: 0xfff6d8, emissiveIntensity: 0.55 });
    const gown = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.0, 12), robe);
    gown.position.y = 1.0;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), std(0xf1c9a5, 0.6, { emissive: 0x6a4a30, emissiveIntensity: 0.2 }));
    face.position.y = 2.25;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf2d46b, 0.6, { emissive: 0x8a6a10, emissiveIntensity: 0.4 }));
    hair.position.y = 2.3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    ring.position.y = 2.75;
    angel.add(gown, face, hair, ring);
    const wingMat = std(0xfdfcff, 0.5, { emissive: 0xe8f0ff, emissiveIntensity: 0.5, side: THREE.DoubleSide });
    const wings: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), wingMat);
      wing.scale.set(0.35, 1.1, 0.12);
      wing.position.set(sx * 0.7, 1.75, -0.3);
      wing.rotation.z = sx * -0.5;
      angel.add(wing);
      wings.push(wing);
    }
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.6, 4, 8), robe);
      arm.position.set(sx * 0.55, 1.95, 0.15);
      arm.rotation.z = sx * 2.4; // arms raised: "Glory to God in the highest"
      angel.add(arm);
    }
    const aGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff7d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    aGlow.scale.setScalar(6);
    aGlow.position.y = 1.6;
    aGlow.userData.keepInPhoto = true;
    angel.add(aGlow);
    w.anim.push((t) => {
      angel.position.y = ay + Math.sin(t * 1.2) * 0.35;
      angel.rotation.y = Math.sin(t * 0.3) * 0.4;
      wings.forEach((wg, k) => (wg.rotation.y = (k ? -1 : 1) * (0.3 + Math.sin(t * 2.4) * 0.25)));
      const flick = 0.85 + Math.sin(t * 17) * 0.1 + Math.sin(t * 7.3) * 0.08;
      flames.forEach((f, k) => (f.scale.y = flick + k * 0.05));
      fireLight.intensity = 12 + flick * 4;
    });
  }
}

/** A small hanging oil lantern with a warm glow. */
function lantern(g: THREE.Group, x: number, y: number, z: number): void {
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.6 }));
  frame.position.set(x, y, z);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  light.position.set(x, y, z);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb84a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.6);
  glow.position.set(x, y, z);
  glow.userData.keepInPhoto = true;
  g.add(frame, light, glow);
}

let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function textTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fg;
  ctx.font = `bold 52px "Comic Sans MS", "Chalkboard SE", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { STONE };
