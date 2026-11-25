/**
 * waterplay.ts — two big outdoor toys for Adventure Island:
 *  - a zip line: climb the wooden tower's steps, grab the handle, and whizz down the cable across
 *    the meadow to a soft landing; the trolley rolls itself back up for the next kid.
 *  - a splash pad: water jets that dance up and down in turn round a big middle fountain, and a
 *    big red button that makes them all shoot up high together.
 */
import * as THREE from "three";
import type { CastleWorld } from "./castle";

export interface ZipLine {
  /** Where a kid stands on the tower's deck to grab the handle. */
  board: THREE.Vector3;
  /** The cable (the handle's path), top to bottom. */
  path: THREE.CatmullRomCurve3;
  len: number;
  /** Which way the ride faces (radians, like a kid's facing). */
  facing: number;
  /** How far below the cable a hanging kid's feet are. */
  hang: number;
  ready(): boolean;
  /** The trolley follows a kid down: `u` is 0 at the top, 1 at the bottom. */
  ride(u: number): void;
  /** The kid let go: the trolley rolls itself back up to the tower. */
  release(): void;
  /** Where the handle is now (for the kid's hand). */
  handle(out: THREE.Vector3): THREE.Vector3;
}

export interface SplashPad {
  centre: THREE.Vector3;
  r: number;
  /** Each jet: where it is and how high its water shoots right now (0 = off). */
  jets: { x: number; z: number; h: number }[];
  button: THREE.Vector3;
  press(): boolean;
  boosted(): boolean;
}

const std = (color: number, rough = 0.7, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * A zip line running along +x: the tower stands at (x0, z) on ground y0 and the landing at (x1, z)
 * on ground y1. The tower's steps climb up from the −x side.
 */
export function buildZipLine(w: CastleWorld, x0: number, x1: number, z: number, y0: number, y1: number): ZipLine {
  const g = new THREE.Group();
  w.group.add(g);
  const wood = std(0xb07a46, 0.9), dark = std(0x7a5230, 0.9), steel = std(0xc9d1da, 0.35, { metalness: 0.6 }), red = std(0xff4757, 0.5), yellow = std(0xffd93d, 0.6), green = std(0x3fbf6b, 0.6);
  const H = 4.5;                       // deck height
  const top = y0 + H;
  const plat = (x: number, zz: number, hw: number, hd: number, topY: number, mesh: THREE.Object3D) => w.platforms.push({
    kind: "box", x, z: zz, r: 0, hw, hd, topY, spring: 0, baseX: x, baseZ: zz, dx: 0, dz: 0, mesh, squashT: 0,
  });

  // the tower: four posts, a deck with railings on three sides, a pointed roof
  for (const [px, pz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    addMesh(g, new THREE.BoxGeometry(0.22, H + 2.6, 0.22), wood, x0 + px, y0 + (H + 2.6) / 2, z + pz);
    w.solids.push({ minX: x0 + px - 0.12, maxX: x0 + px + 0.12, minZ: z + pz - 0.12, maxZ: z + pz + 0.12, topY: y0 + H + 2.6 });
  }
  for (const [px, pz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    const brace = addMesh(g, new THREE.BoxGeometry(0.1, 3.2, 0.1), dark, x0 + px * 0.5, y0 + H / 2 - 0.3, z + pz);
    brace.rotation.z = px > 0 ? 0.6 : -0.6;
  }
  const deck = addMesh(g, new THREE.BoxGeometry(2.5, 0.16, 2.5), wood, x0, top - 0.08, z);
  plat(x0, z, 1.25, 1.25, top, deck);
  for (const s of [-1, 1]) {
    addMesh(g, new THREE.BoxGeometry(2.4, 0.08, 0.08), dark, x0, top + 0.9, z + s * 1.15);
    addMesh(g, new THREE.BoxGeometry(2.4, 0.5, 0.04), std(0xe8d5b0, 0.9), x0, top + 0.45, z + s * 1.15);
    w.solids.push({ minX: x0 - 1.25, maxX: x0 + 1.25, minZ: z + s * 1.15 - 0.06, maxZ: z + s * 1.15 + 0.06, topY: top + 1.0 });
  }
  const roof = addMesh(g, new THREE.ConeGeometry(2.1, 1.3, 4).rotateY(Math.PI / 4), red, x0, y0 + H + 3.2, z);
  roof.castShadow = true;
  // a flag on top
  addMesh(g, new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), steel, x0, y0 + H + 4.3, z);
  const flag = addMesh(g, new THREE.PlaneGeometry(0.6, 0.38), std(0x2f80ed, 0.7, { side: THREE.DoubleSide }), x0 + 0.3, y0 + H + 4.6, z, false);

  // the steps up the back (toward −x): an easy climb, no jumping needed
  const STEPS = 14, rise = H / (STEPS + 0.5), run = 0.5;
  for (let i = 0; i < STEPS; i++) {
    const t = top - (i + 1) * rise;
    const sx = x0 - 1.25 - run / 2 - i * run;
    const st = addMesh(g, new THREE.BoxGeometry(run, 0.12, 1.2), i % 2 ? wood : dark, sx, t - 0.06, z);
    plat(sx, z, run / 2, 0.6, t, st);
    if (t - y0 > 0.4) addMesh(g, new THREE.BoxGeometry(0.1, t - y0, 0.1), dark, sx, y0 + (t - y0) / 2, z + 0.55);
  }
  {
    // hand rails beside the steps
    const len = STEPS * run, ang = Math.atan2(H, len);
    for (const s of [-1, 1]) {
      const rail = addMesh(g, new THREE.BoxGeometry(Math.hypot(len, H), 0.07, 0.07), yellow, x0 - 1.25 - len / 2, y0 + H / 2 + 0.85, z + s * 0.66);
      rail.rotation.z = ang; // only to hold: kids walk up between them
    }
  }

  // the cable: from the tower's front post down across the meadow, sagging a little
  const startY = top + 2.6, endY = y1 + 2.6;
  const a = new THREE.Vector3(x0 + 0.9, startY, z), b = new THREE.Vector3(x1 - 0.6, endY, z);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const p = a.clone().lerp(b, u);
    p.y -= Math.sin(Math.PI * u) * 0.9;
    pts.push(p);
  }
  const path = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 80, 0.025, 5), steel));
  // a cross bar on the tower holding the top of the cable
  addMesh(g, new THREE.BoxGeometry(0.2, 0.2, 2.5), wood, x0 + 1.1, startY + 0.1, z);
  // the landing post, its bumper, and a soft mat to land on
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.2, endY - y1 + 0.6, 10), wood, x1 + 0.2, y1 + (endY - y1 + 0.6) / 2, z);
  w.solids.push({ minX: x1 + 0.02, maxX: x1 + 0.38, minZ: z - 0.18, maxZ: z + 0.18, topY: endY + 0.6 });
  addMesh(g, new THREE.CylinderGeometry(0.25, 0.25, 0.4, 12).rotateZ(Math.PI / 2), red, x1 - 0.1, endY, z);
  addMesh(g, new THREE.BoxGeometry(5, 0.12, 2.4), green, x1 - 3.2, y1 + 0.06, z, false);
  addMesh(g, new THREE.BoxGeometry(5.2, 0.06, 2.6), yellow, x1 - 3.2, y1 + 0.02, z, false);

  // the trolley: two little wheels on the cable and a T-handle hanging below
  const trolley = new THREE.Group();
  addMesh(trolley, new THREE.BoxGeometry(0.34, 0.14, 0.1), steel, 0, 0, 0);
  for (const s of [-1, 1]) addMesh(trolley, new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10).rotateX(Math.PI / 2), dark, s * 0.11, 0.05, 0);
  for (const s of [-1, 1]) {
    const strap = addMesh(trolley, new THREE.BoxGeometry(0.03, 0.42, 0.03), std(0x333a44, 0.6), 0, -0.25, s * 0.18);
    strap.rotation.x = s * -0.38;
  }
  addMesh(trolley, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8).rotateX(Math.PI / 2), yellow, 0, -0.45, 0);
  g.add(trolley);

  const len = path.getLength();
  let state: "ready" | "ride" | "back" = "ready";
  let u = 0;
  const place = () => {
    path.getPointAt(u, trolley.position);
    trolley.position.y -= 0.02;
    const tan = path.getTangentAt(u);
    trolley.rotation.z = Math.atan2(tan.y, tan.x);
  };
  place();
  w.anim.push((t, dt) => {
    flag.rotation.y = Math.sin(t * 2.3) * 0.25;
    if (state === "back") {
      u = Math.max(0, u - dt * 0.28);
      if (u === 0) state = "ready";
      place();
    } else if (state === "ready") {
      // it sways a little while it waits
      place();
      trolley.rotation.x = Math.sin(t * 1.7) * 0.06;
    }
  });

  return {
    board: new THREE.Vector3(x0 + 0.55, top, z),
    path,
    len,
    facing: Math.PI / 2,
    hang: 1.9,
    ready: () => state === "ready",
    ride: (k) => { state = "ride"; u = Math.min(1, Math.max(0, k)); place(); trolley.rotation.x = 0; },
    release: () => { state = "back"; },
    handle: (out) => out.copy(trolley.position).add(new THREE.Vector3(0, -0.45, 0)),
  };
}

/** A round splash pad at (x, z) on ground y: eight jets in a ring, a big one in the middle, and a button. */
export function buildSplashPad(w: CastleWorld, x: number, z: number, y: number): SplashPad {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  w.group.add(g);
  const R = 3.4;
  // the pad: blue with a sunny yellow ring and wet-looking shine
  addMesh(g, new THREE.CylinderGeometry(R, R + 0.1, 0.08, 40), std(0x4fb3ff, 0.25, { metalness: 0.1 }), 0, 0.04, 0, false);
  addMesh(g, new THREE.TorusGeometry(2.1, 0.07, 6, 40).rotateX(Math.PI / 2), std(0xffd93d, 0.5), 0, 0.09, 0, false);
  addMesh(g, new THREE.TorusGeometry(R, 0.12, 6, 48).rotateX(Math.PI / 2), std(0xffffff, 0.6), 0, 0.08, 0, false);
  const water = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x6cc7ff, emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
  const nozzle = std(0xc9d1da, 0.35, { metalness: 0.6 });
  const jetsAt: [number, number][] = [[0, 0]];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; jetsAt.push([Math.cos(a) * 2.1, Math.sin(a) * 2.1]); }
  const cols: THREE.Mesh[] = [];
  const colGeo = new THREE.CylinderGeometry(0.05, 0.12, 1, 10, 1, true).translate(0, 0.5, 0);
  for (const [jx, jz] of jetsAt) {
    addMesh(g, new THREE.CylinderGeometry(0.09, 0.11, 0.06, 10), nozzle, jx, 0.1, jz, false);
    const c = new THREE.Mesh(colGeo, water);
    c.position.set(jx, 0.1, jz);
    c.renderOrder = 2;
    g.add(c);
    cols.push(c);
  }
  // spray: little drops falling off the top of every jet
  const DROPS = 7;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), water, jetsAt.length * DROPS);
  drops.frustumCulled = false;
  drops.renderOrder = 2;
  g.add(drops);
  // the button: a big red mushroom on a yellow post at the edge
  const bx = 0, bz = R + 0.6;
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.15, 0.8, 10), std(0xffd93d, 0.5), bx, 0.4, bz);
  const cap = addMesh(g, new THREE.SphereGeometry(0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xff4757, 0.35), bx, 0.8, bz);
  w.solids.push({ minX: x + bx - 0.15, maxX: x + bx + 0.15, minZ: z + bz - 0.15, maxZ: z + bz + 0.15, topY: y + 1.0 });

  const jets = jetsAt.map(([jx, jz]) => ({ x: x + jx, z: z + jz, h: 0 }));
  let boostT = 0;
  const m4 = new THREE.Matrix4();
  w.anim.push((t, dt) => {
    boostT = Math.max(0, boostT - dt);
    const boost = Math.min(1, boostT / 0.6);
    cap.position.y = 0.8 - (boostT > 3.4 ? 0.08 : 0);
    jets.forEach((j, i) => {
      // the middle one pulses big every few seconds; the ring takes turns, chasing round
      let h = i === 0 ? Math.max(0, Math.sin(t * 0.9)) * 2.6 : Math.max(0, Math.sin(t * 1.6 - i * 0.79)) * 1.6;
      h = h * (1 - boost) + (i === 0 ? 3.4 : 2.3 + Math.sin(t * 9 + i) * 0.1) * boost;
      j.h = h;
      const c = cols[i];
      c.visible = h > 0.05;
      c.scale.set(1, Math.max(0.01, h), 1);
      const [jx, jz] = jetsAt[i];
      for (let k = 0; k < DROPS; k++) {
        const p = (t * 1.1 + k / DROPS + i * 0.13) % 1;
        const a = k * 2.4 + i;
        const r = 0.15 + p * 0.55;
        const dy = h > 0.1 ? h + 0.1 + p * 0.5 - p * p * (h + 0.7) : -5;
        m4.makeTranslation(jx + Math.cos(a) * r, Math.max(0.12, dy), jz + Math.sin(a) * r);
        drops.setMatrixAt(i * DROPS + k, dy < 0.12 ? m4.makeScale(0, 0, 0) : m4);
      }
    });
    drops.instanceMatrix.needsUpdate = true;
  });

  return {
    centre: new THREE.Vector3(x, y, z),
    r: R,
    jets,
    button: new THREE.Vector3(x + bx, y, z + bz),
    press: () => { if (boostT > 0.8) return false; boostT = 4; return true; },
    boosted: () => boostT > 0,
  };
}
