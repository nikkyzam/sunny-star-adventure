/**
 * build-animals.mjs — turns two Quaternius packs (CC0) into small GLB files the game loads:
 *
 *   "Ultimate Animated Animals" (glTF)  → public/models/animals/<name>.glb  (one per animal)
 *   "Realistic Car Pack" (OBJ + MTL)    → public/models/cars.glb           (one node per car)
 *
 *   node scripts/build-animals.mjs <folder that holds the two extracted pack folders>
 *
 * Animals keep only the gentle clips (no attacks, hits or falling over); cars are read from the
 * OBJ files (flat colors from the MTL, no textures). Everything is meshopt-compressed.
 */
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, resample, meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node scripts/build-animals.mjs <download folder>"); process.exit(1); }
const pack = (prefix) => {
  const d = readdirSync(SRC).find((n) => n.startsWith(prefix));
  if (!d) throw new Error(`no "${prefix}…" folder in ${SRC}`);
  return join(SRC, d);
};
const OUT = join(fileURLToPath(new URL("../", import.meta.url)), "public/models");
mkdirSync(join(OUT, "animals"), { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

async function write(doc, name) {
  const out = join(OUT, name);
  await io.write(out, doc);
  console.log(`${name.padEnd(28)} ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

// ── animals ─────────────────────────────────────────────────────────────────
const KEEP = new Set(["Idle", "Walk", "Eating", "Gallop"]);
const ANIMALS = ["Alpaca", "Bull", "Cow", "Deer", "Donkey", "Fox", "Horse", "Horse_White", "Husky", "ShibaInu", "Stag", "Wolf"];
const animalDir = join(pack("Ultimate Animated Animals"), "glTF");
for (const name of ANIMALS) {
  const doc = await io.read(join(animalDir, `${name}.gltf`));
  for (const a of doc.getRoot().listAnimations()) if (!KEEP.has(a.getName())) a.dispose();
  await doc.transform(prune({ keepLeaves: true }), resample({ tolerance: 0.002 }), dedup(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  await write(doc, `animals/${name.toLowerCase()}.glb`);
}

// ── cars ────────────────────────────────────────────────────────────────────
const CARS = ["NormalCar1", "NormalCar2", "SportsCar", "SportsCar2", "SUV", "Taxi", "Cop"];
const carDir = join(pack("Realistic Car Pack"), "OBJ");

function readMtl(file) {
  const mats = new Map();
  let cur = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const [k, ...v] = line.trim().split(/\s+/);
    if (k === "newmtl") { cur = v.join(" "); mats.set(cur, [0.8, 0.8, 0.8]); }
    else if (k === "Kd" && cur) mats.set(cur, v.slice(0, 3).map(Number));
  }
  return mats;
}

/** OBJ → triangles grouped by material, flat normals from the file (or computed). */
function readObj(file) {
  const P = [], N = [], groups = new Map();
  let g = null;
  const use = (m) => { if (!groups.has(m)) groups.set(m, { pos: [], nor: [] }); g = groups.get(m); };
  use("default");
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const [k, ...v] = line.trim().split(/\s+/);
    if (k === "v") P.push(v.slice(0, 3).map(Number));
    else if (k === "vn") N.push(v.slice(0, 3).map(Number));
    else if (k === "usemtl") use(v.join(" "));
    else if (k === "f") {
      const idx = v.map((s) => {
        const [pi, , ni] = s.split("/");
        const p = Number(pi), n = ni ? Number(ni) : 0;
        return [p < 0 ? P.length + p : p - 1, n ? (n < 0 ? N.length + n : n - 1) : -1];
      });
      for (let i = 1; i + 1 < idx.length; i++) {
        const tri = [idx[0], idx[i], idx[i + 1]];
        const a = P[tri[0][0]], b = P[tri[1][0]], c = P[tri[2][0]];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const l = Math.hypot(...fn) || 1;
        fn = fn.map((x) => x / l);
        for (const [pi, ni] of tri) {
          g.pos.push(...P[pi]);
          g.nor.push(...(ni >= 0 ? N[ni] : fn));
        }
      }
    }
  }
  return groups;
}

{
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("cars");
  const matCache = new Map();
  for (const car of CARS) {
    const mtl = readMtl(join(carDir, `${car}.mtl`));
    const mesh = doc.createMesh(car);
    for (const [mname, data] of readObj(join(carDir, `${car}.obj`))) {
      if (data.pos.length === 0) continue;
      const kd = mtl.get(mname) ?? [0.8, 0.8, 0.8];
      const key = `${mname}|${kd.join(",")}`;
      if (!matCache.has(key)) {
        const shiny = /window|glass/i.test(mname);
        matCache.set(key, doc.createMaterial(mname).setBaseColorFactor([...kd, 1])
          .setRoughnessFactor(shiny ? 0.15 : /black|tire|tyre|grey/i.test(mname) ? 0.8 : 0.4)
          .setMetallicFactor(shiny ? 0.3 : 0.1));
      }
      const prim = doc.createPrimitive()
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(data.pos)).setBuffer(buffer))
        .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(data.nor)).setBuffer(buffer))
        .setMaterial(matCache.get(key));
      mesh.addPrimitive(prim);
    }
    scene.addChild(doc.createNode(car).setMesh(mesh));
  }
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  await write(doc, "cars.glb");
}
