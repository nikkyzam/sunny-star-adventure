/**
 * gardenfun.ts — two quieter outdoor treats for Adventure Island:
 *  - a hedge maze: low hedges (a small kid can just peep over, and the camera can see in), one way
 *    in, and a golden bell in the very middle to find.
 *  - a duck pond: a mother duck and her ducklings paddle round among lily pads; a kid at the edge
 *    can throw them some crumbs and they hurry over, quacking.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CastleWorld } from "./castle";
import { mulberry32 } from "./rng";

export interface HedgeMaze {
  centre: THREE.Vector3;
  /** Just outside the way in. */
  entrance: THREE.Vector3;
  /** The bell in the middle. */
  goal: THREE.Vector3;
  cell: number;
  /** Is (x, z) inside the middle cell? */
  inGoal(x: number, z: number): boolean;
  /** Ring the bell (it swings for a moment). */
  ring(): void;
  /** The way from the entrance to the bell, cell middles in order (for tests and hints). */
  route: THREE.Vector3[];
}

export interface DuckPond {
  centre: THREE.Vector3;
  r: number;
  /** Throw crumbs onto the water at `at`: the ducks paddle over. */
  feed(at: THREE.Vector3): void;
  ducks(): THREE.Vector3[];
  /** True while ducks are still paddling to crumbs (they quack on the way). */
  eating(): boolean;
}

const std = (color: number, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

let leafTex: THREE.CanvasTexture | null = null;
/** Little leaves in many greens, for the hedges. */
function leafTexture(): THREE.CanvasTexture {
  if (leafTex) return leafTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#2f7d32";
  x.fillRect(0, 0, 128, 128);
  const rnd = mulberry32(7);
  const greens = ["#3f9a3c", "#256b2a", "#4fae48", "#1f5e25", "#5cbf52"];
  for (let i = 0; i < 900; i++) {
    x.fillStyle = greens[Math.floor(rnd() * greens.length)];
    x.beginPath();
    x.ellipse(rnd() * 128, rnd() * 128, 2 + rnd() * 3, 1.2 + rnd() * 2, rnd() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.wrapS = leafTex.wrapT = THREE.RepeatWrapping;
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

/** A box whose texture repeats once per metre (so long and short hedges look the same). */
function hedgeBox(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  const n = geo.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const su = ax > 0.5 ? d : w, sv = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  geo.translate(x, y, z);
  return geo;
}

/** A perfect maze (every cell reachable, one way between any two) carved from the way in. */
function carve(N: number, mid: number, seed: number): { east: boolean[][]; south: boolean[][] } {
  const east = Array.from({ length: N }, () => Array<boolean>(N).fill(true));
  const south = Array.from({ length: N }, () => Array<boolean>(N).fill(true));
  const seen = Array.from({ length: N }, () => Array<boolean>(N).fill(false));
  const rnd = mulberry32(seed);
  const stack: [number, number][] = [[mid, N - 1]];
  seen[mid][N - 1] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([di, dj]) => [i + di, j + dj, di, dj] as const)
      .filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen[a][b]);
    if (!next.length) { stack.pop(); continue; }
    const [a, b, di, dj] = next[Math.floor(rnd() * next.length)];
    if (di === 1) east[i][j] = false;
    if (di === -1) east[a][b] = false;
    if (dj === 1) south[i][j] = false;
    if (dj === -1) south[a][b] = false;
    seen[a][b] = true;
    stack.push([a, b]);
  }
  return { east, south };
}

/** The cells from the way in (middle of the +z edge) to the middle, breadth-first. */
function solve(N: number, mid: number, east: boolean[][], south: boolean[][]): [number, number][] {
  const open = (i: number, j: number, a: number, b: number) =>
    a === i + 1 ? !east[i][j] : a === i - 1 ? !east[a][b] : b === j + 1 ? !south[i][j] : !south[a][b];
  const prev = new Map<string, [number, number] | null>([[`${mid},${N - 1}`, null]]);
  const q: [number, number][] = [[mid, N - 1]];
  while (q.length) {
    const [i, j] = q.shift()!;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= N || b >= N || prev.has(`${a},${b}`) || !open(i, j, a, b)) continue;
      prev.set(`${a},${b}`, [i, j]);
      q.push([a, b]);
    }
  }
  const out: [number, number][] = [];
  for (let k: [number, number] | null = [mid, mid]; k; k = prev.get(`${k[0]},${k[1]}`) ?? null) out.unshift(k);
  return out;
}

/** A square hedge maze of 5×5 cells (wide paths for small kids) round (cx, cz) on ground y; the way in faces +z. */
export function buildHedgeMaze(w: CastleWorld, cx: number, cz: number, y: number, seed = 31): HedgeMaze {
  const N = 5, C = 2.0, T = 0.45, H = 1.1;
  const ox = cx - (N * C) / 2, oz = cz - (N * C) / 2;
  const mid = (N - 1) / 2;
  // walls: east[i][j] is the wall on the +x side of cell (i, j); south[i][j] on its +z side.
  // Carve a maze from the way in; try seeds until the way to the bell properly winds about.
  let east: boolean[][] = [], south: boolean[][] = [], cells: [number, number][] = [];
  for (let s = seed; s < seed + 200; s++) {
    ({ east, south } = carve(N, mid, s));
    cells = solve(N, mid, east, south);
    if (cells.length >= 11) break;
  }
  const geos: THREE.BufferGeometry[] = [];
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const wx = Math.abs(x1 - x0) + T, wz = Math.abs(z1 - z0) + T;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    geos.push(hedgeBox(wx, H, wz, mx, H / 2, mz));
    // an invisible taller fence above the hedge, so the maze can't be skipped by hopping over
    w.solids.push({ minX: mx - wx / 2, maxX: mx + wx / 2, minZ: mz - wz / 2, maxZ: mz + wz / 2, topY: y + 3.2 });
  };
  // outer walls (with the way in at the middle of the +z side)
  wall(ox, oz, ox + N * C, oz);
  wall(ox, oz, ox, oz + N * C);
  wall(ox + N * C, oz, ox + N * C, oz + N * C);
  wall(ox, oz + N * C, ox + mid * C, oz + N * C);
  wall(ox + (mid + 1) * C, oz + N * C, ox + N * C, oz + N * C);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i < N - 1 && east[i][j]) wall(ox + (i + 1) * C, oz + j * C, ox + (i + 1) * C, oz + (j + 1) * C);
    if (j < N - 1 && south[i][j]) wall(ox + i * C, oz + (j + 1) * C, ox + (i + 1) * C, oz + (j + 1) * C);
  }
  const g = new THREE.Group();
  g.position.y = y;
  w.group.add(g);
  const hedge = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: leafTexture(), roughness: 0.95, color: 0xffffff }));
  hedge.castShadow = true;
  hedge.receiveShadow = true;
  g.add(hedge);
  for (const geo of geos) geo.dispose();
  // a gravel path inside, a sign and two flower pots by the way in
  const path = new THREE.Mesh(new THREE.PlaneGeometry(N * C, N * C).rotateX(-Math.PI / 2), std(0xe2d2b0, 1));
  path.position.set(cx, 0.025, cz);
  path.receiveShadow = true;
  g.add(path);
  const inX = ox + (mid + 0.5) * C, inZ = oz + N * C;
  for (const s of [-1, 1]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.45, 12), std(0xc96a3a, 0.8));
    pot.position.set(inX + s * 1.25, 0.22, inZ + 0.7);
    pot.castShadow = true;
    g.add(pot);
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), std([0xff6b9d, 0xffd93d, 0xffffff, 0xb197fc, 0xff9f43][k], 0.6));
      f.position.set(inX + s * 1.25 + Math.cos(k * 1.26) * 0.15, 0.5 + (k % 2) * 0.06, inZ + 0.7 + Math.sin(k * 1.26) * 0.15);
      g.add(f);
    }
  }
  {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), std(0x7a5230, 0.9));
    post.position.set(inX + 2.1, 0.7, inZ + 0.9);
    g.add(post);
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = "#f6e7c8"; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = "#7a5230"; x.lineWidth = 10; x.strokeRect(5, 5, 246, 118);
    x.fillStyle = "#2f6d2f"; x.font = "bold 40px sans-serif"; x.textAlign = "center";
    x.fillText("MAZE", 128, 58);
    x.font = "bold 26px sans-serif"; x.fillStyle = "#7a5230";
    x.fillText("find the bell 🔔", 128, 100);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
    board.position.set(inX + 2.1, 1.3, inZ + 0.96);
    g.add(board);
  }
  // the middle: a little golden bell on a white arch
  const gx = ox + (mid + 0.5) * C, gz = oz + (mid + 0.5) * C;
  const white = std(0xffffff, 0.6), gold = std(0xffc83d, 0.3, { metalness: 0.7 });
  // the arch stands across the way the path comes in, so a kid walks straight under the bell
  const inAlongX = cells.length > 1 && cells[cells.length - 2][0] !== mid;
  const lx = inAlongX ? 0 : 0.45, lz = inAlongX ? 0.45 : 0;
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), white);
    leg.position.set(gx + s * lx, 0.75, gz + s * lz);
    g.add(leg);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 20, Math.PI), white);
  arch.position.set(gx, 1.5, gz);
  arch.rotation.y = inAlongX ? Math.PI / 2 : 0;
  g.add(arch);
  const bell = new THREE.Group();
  bell.position.set(gx, 1.88, gz);
  bell.rotation.y = arch.rotation.y;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.32, 16, 1, true), gold);
  body.position.y = -0.2;
  (body.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  bell.add(body);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gold);
  crown.position.y = -0.04;
  bell.add(crown);
  const clap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), gold);
  clap.position.y = -0.36;
  bell.add(clap);
  g.add(bell);
  let ringT = 9;
  w.anim.push((_t, dt) => {
    ringT += dt;
    bell.rotation.z = Math.sin(ringT * 9) * 0.6 * Math.exp(-ringT * 1.2);
  });
  for (const s of [-1, 1]) w.solids.push({ minX: gx + s * lx - 0.07, maxX: gx + s * lx + 0.07, minZ: gz + s * lz - 0.07, maxZ: gz + s * lz + 0.07, topY: y + 1.5 });

  const route = cells.map(([i, j]) => new THREE.Vector3(ox + (i + 0.5) * C, y, oz + (j + 0.5) * C));

  return {
    centre: new THREE.Vector3(cx, y, cz),
    entrance: new THREE.Vector3(inX, y, inZ + 1.2),
    goal: new THREE.Vector3(gx, y, gz),
    cell: C,
    inGoal: (x, z) => Math.abs(x - gx) < C / 2 && Math.abs(z - gz) < C / 2,
    ring: () => { ringT = 0; },
    route,
  };
}

/** A round duck pond at (x, z) on ground y, with a low stone edge, lily pads, reeds and three ducks. */
export function buildDuckPond(w: CastleWorld, x: number, z: number, y: number): DuckPond {
  const R = 2.6;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  w.group.add(g);
  const water = new THREE.Mesh(new THREE.CircleGeometry(R, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4aa8d8, roughness: 0.08, metalness: 0.2, emissive: 0x0d3550, emissiveIntensity: 0.3 }));
  water.position.y = 0.08;
  water.receiveShadow = true;
  g.add(water);
  const bed = new THREE.Mesh(new THREE.CircleGeometry(R + 0.2, 40).rotateX(-Math.PI / 2), std(0x6b5a3a, 1));
  bed.position.y = 0.03;
  g.add(bed);
  // the stone edge: round grey stones, low enough to step over
  const stones: THREE.BufferGeometry[] = [];
  const rnd = mulberry32(5);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const s = 0.24 + rnd() * 0.1;
    const st = new THREE.IcosahedronGeometry(s, 0).scale(1.3, 0.7, 1);
    st.rotateY(-a);
    st.translate(Math.cos(a) * (R + 0.15), 0.12, Math.sin(a) * (R + 0.15));
    stones.push(st);
  }
  const edge = new THREE.Mesh(mergeGeometries(stones), std(0x9a968c, 0.95, { flatShading: true }));
  edge.castShadow = true;
  edge.receiveShadow = true;
  g.add(edge);
  for (const s of stones) s.dispose();
  // lily pads with a pink flower or two
  const pad = std(0x3f9a3c, 0.6, { side: THREE.DoubleSide });
  for (const [px, pz, pr, flower] of [[1.2, -0.6, 0.32, 1], [-0.9, 1.1, 0.28, 0], [-1.4, -0.9, 0.36, 1], [0.4, 1.6, 0.25, 0], [1.7, 0.7, 0.27, 0]] as const) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(pr, 14, 0.3, Math.PI * 2 - 0.3).rotateX(-Math.PI / 2), pad);
    p.position.set(px, 0.095, pz);
    g.add(p);
    if (flower) {
      for (let k = 0; k < 6; k++) {
        const pet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.5, 2), std(0xff9ec7, 0.5));
        pet.position.set(px + Math.cos(k) * 0.06, 0.15, pz + Math.sin(k) * 0.06);
        pet.rotation.y = -k;
        g.add(pet);
      }
      const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), std(0xffd93d, 0.5));
      ctr.position.set(px, 0.17, pz);
      g.add(ctr);
    }
  }
  // reeds and bulrushes at the back
  const reed = std(0x6a9e3a, 0.9), rush = std(0x6b4423, 0.9);
  for (let i = 0; i < 9; i++) {
    const a = -2.2 + i * 0.17 + rnd() * 0.08;
    const rr = R - 0.1 + rnd() * 0.25, h = 0.8 + rnd() * 0.5;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, h, 4), reed);
    stem.position.set(Math.cos(a) * rr, h / 2, Math.sin(a) * rr);
    stem.rotation.z = (rnd() - 0.5) * 0.2;
    g.add(stem);
    if (i % 2 === 0) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), rush);
      top.position.set(stem.position.x, h - 0.05, stem.position.z);
      g.add(top);
    }
  }

  // the ducks: Mother Duck and two yellow ducklings
  const makeDuck = (big: boolean) => {
    const d = new THREE.Group();
    const s = big ? 1 : 0.55;
    const bodyM = std(big ? 0xf4f1e8 : 0xffe066, 0.6), beakM = std(0xff9f1c, 0.5), eyeM = std(0x111111, 0.3);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 12, 8).scale(1, 0.75, 1.45), bodyM);
    body.position.y = 0.1 * s;
    d.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.16 * s, 6).rotateX(-Math.PI / 2 - 0.6), bodyM);
    tail.position.set(0, 0.2 * s, -0.3 * s);
    d.add(tail);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11 * s, 12, 8), big ? std(0x2e7d4f, 0.5) : bodyM);
    head.position.set(0, 0.33 * s, 0.22 * s);
    d.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045 * s, 0.13 * s, 6).rotateX(Math.PI / 2).scale(1, 0.5, 1), beakM);
    beak.position.set(0, 0.31 * s, 0.36 * s);
    d.add(beak);
    for (const e of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s + 0.004, 6, 4), eyeM);
      eye.position.set(e * 0.075 * s, 0.36 * s, 0.29 * s);
      d.add(eye);
    }
    if (big) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 14).rotateX(Math.PI / 2), std(0xffffff, 0.5));
      ring.position.set(0, 0.25, 0.2);
      d.add(ring);
    }
    d.traverse((o) => { o.castShadow = true; });
    g.add(d);
    return d;
  };
  const ducks = [makeDuck(true), makeDuck(false), makeDuck(false)];
  const pos = ducks.map((_, i) => new THREE.Vector2(Math.cos(i * 0.5) * 1.5, Math.sin(i * 0.5) * 1.5));
  const head = ducks.map(() => 0);
  let food: THREE.Vector2 | null = null, foodT = 0;
  const crumbs = new THREE.Group();
  g.add(crumbs);
  const crumbM = std(0xd9b26f, 0.9), crumbGeo = new THREE.BoxGeometry(0.04, 0.02, 0.04);
  const world = ducks.map(() => new THREE.Vector3());
  w.anim.push((t, dt) => {
    foodT = Math.max(0, foodT - dt);
    if (foodT === 0 && food) { food = null; crumbs.clear(); }
    ducks.forEach((d, i) => {
      // usually: mother leads a slow circle, ducklings follow in a line behind her
      let want: THREE.Vector2;
      if (food) want = new THREE.Vector2(food.x + Math.cos(i * 2.1) * 0.28, food.y + Math.sin(i * 2.1) * 0.28);
      else if (i === 0) want = new THREE.Vector2(Math.cos(t * 0.22) * 1.55, Math.sin(t * 0.22) * 1.55);
      else want = pos[i - 1].clone();
      const to = want.clone().sub(pos[i]);
      const dist = to.length();
      const keep = !food && i > 0 ? 0.45 : 0.05;
      if (dist > keep) {
        const sp = (food ? 0.9 : i === 0 ? 0.34 : 0.5) * Math.min(1, (dist - keep) * 2);
        pos[i].addScaledVector(to.normalize(), sp * dt);
        const wantH = Math.atan2(to.x, to.y);
        let dh = wantH - head[i];
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        head[i] += dh * Math.min(1, dt * 4);
      }
      // stay on the water
      if (pos[i].length() > R - 0.35) pos[i].setLength(R - 0.35);
      d.position.set(pos[i].x, 0.06 + Math.sin(t * 2.4 + i) * 0.015, pos[i].y);
      d.rotation.y = head[i];
      // dabbling for crumbs: tip forward now and then
      d.rotation.x = food && dist < 0.4 ? Math.max(0, Math.sin(t * 5 + i * 2)) * 0.7 : 0;
      world[i].set(x + pos[i].x, y + 0.1, z + pos[i].y);
    });
  });
  // the edge can be stepped over (it's low), so no solids: kids can paddle in the shallow pond

  return {
    centre: new THREE.Vector3(x, y, z),
    r: R,
    feed: (at) => {
      const local = new THREE.Vector2(at.x - x, at.z - z);
      if (local.length() > R - 0.5) local.setLength(R - 0.5);
      food = local;
      foodT = 6;
      crumbs.clear();
      for (let k = 0; k < 10; k++) {
        const c = new THREE.Mesh(crumbGeo, crumbM);
        c.position.set(local.x + (Math.random() - 0.5) * 0.5, 0.1, local.y + (Math.random() - 0.5) * 0.5);
        c.rotation.y = Math.random() * 3;
        crumbs.add(c);
      }
    },
    ducks: () => world,
    eating: () => food !== null,
  };
}
