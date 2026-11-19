/**
 * shots-castle-garden.mjs — the flower garden by Sunny Castle's gate (water six buds, butterflies come)
 * and the rope swing. Pictures: verification-shots/99-garden-*.png.
 * DIST=dist-x to test another build.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, process.env.DIST ?? "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    let raw = req.url.split("?")[0];
    if (raw === "/") raw = "/index.html";
    const file = resolve(DIST, "." + decodeURIComponent(raw));
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu"] });
const errors = [];
let fails = 0;
const check = (ok, what, info = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${info ? " — " + info : ""}`); if (!ok) fails++; };
const shot = (name) => join(ROOT, `verification-shots/99-garden-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const dbg = () => page.evaluate(() => window.__gameDebug());
  const fun = () => page.evaluate(() => window.__gameDebug().castleFun());
  const film = (at, off) => page.evaluate(([t, o]) => {
    window.__filmCam = (cam) => { cam.position.set(t[0] + o[0], t[1] + o[1], t[2] + o[2]); cam.lookAt(t[0], t[1], t[2]); cam.fov = 45; };
  }, [at, off]);
  const unfilm = () => page.evaluate(() => { window.__filmCam = undefined; });
  const toast = () => page.evaluate(() => document.body.innerText);

  // ── the garden ──
  let f = await fun();
  check(f.buds.length === 6, "six buds", JSON.stringify(f.buds.map((b) => b.map((v) => +v.toFixed(1)))));
  const mid = f.buds.reduce((a, b) => [a[0] + b[0] / 6, a[1] + b[1] / 6, a[2] + b[2] / 6], [0, 0, 0]);
  await film([mid[0], mid[1] + 0.6, mid[2]], [2.8, 2.4, -3.5]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("buds") });
  // water each bud, standing beside it (the gate side is +X; the bed runs along Z here)
  for (let i = 0; i < 6; i++) {
    const b = f.buds[i];
    // stand off the bed's edge nearest this bud
    const side = i < 3 ? 1 : -1;
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [b[0] + side * 1.3, b[2]]);
    await page.waitForTimeout(500);
    const d = await dbg();
    if (d.use !== "Water the flower") { check(false, `bud ${i} to water`, `use ${d.use} at ${b}`); continue; }
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(i === 2 ? 1000 : 2300);
    if (i === 2) { await page.screenshot({ path: shot("watering") }); await page.waitForTimeout(1300); }
  }
  await page.waitForTimeout(1800);
  f = await fun();
  check(f.bloomed === 6, "all six in bloom", `bloomed ${f.bloomed}`);
  check(/butterflies/.test(await toast()), "Matthew 6:28 and butterflies");
  await page.evaluate(() => window.__gameDebug().warp(-17, 30, 1));
  await film([mid[0], mid[1] + 0.9, mid[2]], [2.6, 1.8, -3.2]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot("bloom") });
  await unfilm();

  // ── the swing ──
  const sw = f.swing;
  check(!!sw, "a swing");
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x - 0.3, z + 0.4, 1), [sw.pivot[0], sw.pivot[2]]);
  await page.waitForTimeout(600);
  let d = await dbg();
  check(d.canMount === "swing", "the swing to sit on", `canMount ${d.canMount}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  f = await fun();
  check(f.swinging, "on the swing");
  check(/Psalm 118:24/.test(await toast()), "Psalm 118:24");
  await page.waitForTimeout(4500);
  let lo = 99, hi = -99;
  for (let i = 0; i < 25; i++) { const q = await dbg(); lo = Math.min(lo, q.pz); hi = Math.max(hi, q.pz); await page.waitForTimeout(60); }
  check(hi - lo > 1.5, "swings back and forth", `${(hi - lo).toFixed(2)}`);
  await film([sw.pivot[0], sw.pivot[1] - 1.4, sw.pivot[2]], [5.5, 0.4, 0.6]);
  for (let i = 0; i < 30; i++) {
    const q = await dbg();
    if (q.pz < sw.pivot[2] - 1.3) break;
    await page.waitForTimeout(40);
  }
  await page.screenshot({ path: shot("swing") });
  await unfilm();
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  f = await fun();
  check(!f.swinging, "hops off the swing");
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-GARDEN FAILED (${fails})` : "SHOTS-CASTLE-GARDEN OK");
process.exit(fails ? 1 : 0);
