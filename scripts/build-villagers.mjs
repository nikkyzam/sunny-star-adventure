/**
 * build-villagers.mjs — turns the Quaternius "Animated Men/Women Characters" packs (CC0, FBX)
 * into small GLB files for grown-up villagers: public/models/people/<name>.glb.
 *
 *   node scripts/build-villagers.mjs <folder holding the two extracted packs> [--inspect]
 *
 * FBX can't be read by gltf-transform, so a headless browser loads each file with three.js's
 * FBXLoader and exports it as GLB; then the gentle clips are kept and everything is compressed.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, resample, meshopt, weld, join as joinPrims, flatten } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

const SRC = process.argv[2];
const INSPECT = process.argv.includes("--inspect");
if (!SRC) { console.error("usage: node scripts/build-villagers.mjs <download folder> [--inspect]"); process.exit(1); }
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = join(ROOT, "public/models/people");
const TMP = join(ROOT, "node_modules/.cache/villagers");

const packs = readdirSync(SRC).filter((d) => /^Animated (Men|Women) Characters/.test(d));
const files = packs.flatMap((p) => readdirSync(join(SRC, p, "FBX")).filter((f) => f.endsWith(".fbx") && !f.startsWith("Smooth_")).map((f) => ({ pack: p, file: f })));

const MIME = { ".html": "text/html", ".js": "text/javascript", ".fbx": "application/octet-stream" };
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split("?")[0]);
    let file;
    if (url === "/") { res.writeHead(200, { "content-type": "text/html" }).end(PAGE); return; }
    if (url.startsWith("/three/")) file = resolve(ROOT, "node_modules/three", "." + url.slice(6));
    else if (url.startsWith("/fbx/")) file = resolve(SRC, "." + url.slice(4));
    else throw new Error("no");
    if (!file.startsWith(resolve(ROOT, "node_modules/three") + sep) && !file.startsWith(resolve(SRC) + sep)) throw new Error("outside");
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
const PAGE = `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
window.convert = async (path, inspect) => {
  const obj = await new FBXLoader().loadAsync(path);
  const box = new THREE.Box3().setFromObject(obj);
  const info = { clips: obj.animations.map((c) => c.name + ":" + c.duration.toFixed(2)), height: +(box.max.y - box.min.y).toFixed(3), scale: obj.scale.x,
    meshes: [], bones: [] };
  obj.traverse((o) => {
    if (o.isMesh) info.meshes.push(o.name + "[" + (Array.isArray(o.material) ? o.material : [o.material]).map((m) => m.name + (m.map ? "+tex" : "") + "#" + m.color.getHexString()).join(",") + "] v" + o.geometry.attributes.position.count);
    if (o.isBone) info.bones.push(o.name);
  });
  if (inspect) return info;
  // one part per color: gather each material's triangles together (the FBX interleaves them)
  obj.traverse((o) => {
    if (!o.isMesh || !Array.isArray(o.material) || !o.geometry.groups.length) return;
    const g = o.geometry;
    const byMat = new Map();
    for (const gr of g.groups) { if (!byMat.has(gr.materialIndex)) byMat.set(gr.materialIndex, []); byMat.get(gr.materialIndex).push(gr); }
    const order = [];
    const groups = [];
    for (const [mi, list] of byMat) {
      const start = order.length;
      for (const gr of list) for (let i = gr.start; i < gr.start + gr.count; i++) order.push(i);
      groups.push({ start, count: order.length - start, materialIndex: mi });
    }
    if (g.index) {
      const src = g.index.array;
      g.setIndex(order.map((i) => src[i]));
    } else {
      for (const name of Object.keys(g.attributes)) {
        const at = g.attributes[name], n = at.itemSize;
        const out = new at.array.constructor(order.length * n);
        order.forEach((v, k) => { for (let c = 0; c < n; c++) out[k * n + c] = at.array[v * n + c]; });
        g.setAttribute(name, new THREE.BufferAttribute(out, n, at.normalized));
      }
    }
    g.clearGroups();
    for (const gr of groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  });
  const glb = await new GLTFExporter().parseAsync(obj, { binary: true, animations: obj.animations, onlyVisible: false });
  const bytes = new Uint8Array(glb);
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { info, glb: btoa(s) };
};
window.ready = true;
</script>`;
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page:", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.ready === true);

// clips kept for villagers (no punching, guns or falling over)
const KEEP = /\|(Man|Female)_(Idle|Walk|Run|Clapping)$/;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
if (!INSPECT) { await mkdir(OUT, { recursive: true }); await mkdir(TMP, { recursive: true }); }
try {
  for (const { pack, file } of files) {
    const path = `/fbx/${encodeURIComponent(pack)}/FBX/${encodeURIComponent(file)}`;
    if (INSPECT) {
      const info = await page.evaluate(([p]) => window.convert(p, true), [path]);
      console.log(file, JSON.stringify({ ...info, bones: info.bones.length + " bones: " + info.bones.slice(0, 40).join(" ") }));
      continue;
    }
    const { info, glb } = await page.evaluate(([p]) => window.convert(p, false), [path]);
    const tmp = join(TMP, file.replace(".fbx", ".glb"));
    await writeFile(tmp, Buffer.from(glb, "base64"));
    const doc = await io.read(tmp);
    for (const a of doc.getRoot().listAnimations()) if (!KEEP.test(a.getName())) a.dispose();
    // the FBX marks every color fully transparent: make them solid
    for (const m of doc.getRoot().listMaterials()) {
      const c = m.getBaseColorFactor();
      m.setBaseColorFactor([c[0], c[1], c[2], 1]).setAlphaMode("OPAQUE");
    }
    // the exporter splits each body into hundreds of little pieces: join them, one per color
    await doc.transform(dedup(), flatten(), joinPrims({ keepNamed: false }), weld(), prune({ keepLeaves: true }), resample({ tolerance: 0.002 }), dedup(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
    const name = file.replace(".fbx", "").toLowerCase();
    const out = join(OUT, `${name}.glb`);
    await io.write(out, doc);
    console.log(`${name.padEnd(22)} ${(statSync(out).size / 1024).toFixed(0)} KB  ${doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0)} parts  clips: ${doc.getRoot().listAnimations().map((a) => a.getName()).join(", ")}  (height ${info.height})`);
  }
} finally {
  await browser.close();
  server.close();
  if (!INSPECT) await rm(TMP, { recursive: true, force: true });
}
