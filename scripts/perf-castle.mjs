/** perf-castle.mjs — draw calls and triangles at Sunny Castle (node scripts/perf-castle.mjs dist). */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
const DIST = resolve(process.argv[2]);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try { let raw = req.url.split("?")[0]; if (raw === "/") raw = "/index.html";
    const file = resolve(DIST, "." + decodeURIComponent(raw));
    if (!file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.goto(`http://127.0.0.1:${server.address().port}/?level=9`, { waitUntil: "load" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
await page.click("[data-action=play]");
await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
await page.waitForTimeout(1500);
for (const [name, x, z] of [["courtyard", -24, 22], ["gate", -12, 22], ["behind", -44, 22]]) {
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [x, z]);
  await page.waitForTimeout(1200);
  const p = await page.evaluate(() => window.__perf());
  console.log(name, JSON.stringify(p));
}
// who owns the meshes: count visible meshes under each top-level child of the world group
await page.evaluate(() => { window.__filmCam = (cam, scene) => { window.__S = scene; }; });
await page.waitForTimeout(300);
const tally = await page.evaluate(() => {
  const S = window.__S; window.__filmCam = undefined;
  const out = [];
  const count = (o) => { let n = 0; o.traverseVisible((c) => { if (c.isMesh || c.isInstancedMesh || c.isPoints || c.isLine) n++; }); return n; };
  for (const c of S.children) {
    if (c.children.length > 20) for (const k of c.children) out.push([`${c.name || c.type}/${k.name || k.type}#${k.children.length}`, count(k), k.position.toArray().map((v) => +v.toFixed(0)).join(",")]);
    else out.push([c.name || c.type, count(c), ""]);
  }
  // inside the castle
  const castle = S.children.flatMap((c) => c.children).find((k) => Math.round(k.position.x) === -27 && Math.round(k.position.z) === 22 && k.children.length > 50);
  if (castle) {
    let loose = 0;
    for (const k of castle.children) {
      const n = count(k);
      if (k.isMesh) { loose++; continue; }
      if (n > 6) out.push([`  castle/${k.type}#${k.children.length}`, n, k.position.toArray().map((v) => +v.toFixed(1)).join(",")]);
    }
    out.push(["  castle loose meshes", loose, ""]);
  }
  // the biggest groups anywhere: what are they made of?
  const big = [];
  S.traverse((o) => { if (o.isGroup && o.children.length > 4) { let n = 0; let shad = 0; o.children.forEach((c) => { if (c.isMesh) { n++; if (c.castShadow) shad++; } }); if (n > 12) big.push([`  direct meshes ${o.name || "group"} @${o.getWorldPosition(new o.position.constructor()).toArray().map((v) => +v.toFixed(0))}`, n, `shadow ${shad}`]); } });
  big.sort((a, b) => b[1] - a[1]);
  out.push(...big.slice(0, 15));
  // materials: how many distinct, and meshes per material
  let meshes = 0; const mats = new Set();
  S.traverseVisible((o) => { if (o.isMesh) { meshes++; mats.add(o.material); } });
  out.push(["  visible meshes / distinct materials", meshes, mats.size]);
  return out.sort((a, b) => b[1] - a[1]).slice(0, 45);
});
for (const t of tally) console.log(t.join("  "));
// PROBE: node scripts/perf-castle.mjs dist probe.js
if (process.argv[3]) { await page.evaluate(() => { window.__filmCam = (cam, scene) => { window.__S = scene; }; }); await page.waitForTimeout(300); const { readFileSync } = await import("node:fs"); console.log(await page.evaluate(readFileSync(process.argv[3], "utf8"))); }
await browser.close(); server.close();
