/**
 * shots-castle-treasure.mjs — the king's treasure hunt (five golden keys, then the chest by the keep) and
 * the peacocks that fan their tails. Pictures: verification-shots/99-treasure-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-treasure-${name}.png`);
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

  let f = await fun();
  check(f.keys.length === 5 && !!f.chest, "five golden keys and a chest", JSON.stringify(f.keys.map((k) => k.map((v) => +v.toFixed(1)))));
  const [cx, cy, cz] = f.chest;
  // the chest is locked at first
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 1.2, z + 0.4, 2), [cx, cz]);
  await page.waitForTimeout(600);
  let d = await dbg();
  check(d.use === "Locked", "the chest is locked", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(200);
  check(/golden keys/.test(await toast()), "a hint about the keys");
  await film([cx, cy + 0.5, cz], [1.6, 1.2, 2.2]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("chest-locked") });
  await unfilm();
  // pick up each key, like a kid: stand where it is (warp to the ground or roof under it)
  for (let i = 0; i < f.keys.length; i++) {
    const [kx, ky, kz] = f.keys[i];
    if (i === 0) {
      await film([kx, ky, kz], [1.5, 0.8, 2.5]);
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot("key") });
      await unfilm();
    }
    await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y), [kx + 0.3, kz + 0.3, ky]);
    await page.waitForTimeout(500);
    const g = await fun();
    d = await dbg();
    check(g.found === i + 1, `golden key ${i + 1}`, `found ${g.found}, kid at y ${d.py.toFixed(2)}, key y ${ky.toFixed(2)}`);
  }
  check(/All five golden keys/.test(await toast()), "all the keys message");
  const bank0 = (await dbg()).bank;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 1.2, z + 0.4, 2), [cx, cz]);
  await page.waitForTimeout(600);
  d = await dbg();
  check(d.use === "Open the treasure", "now it can be opened", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1200);
  f = await fun();
  check(f.opened, "the chest opens");
  check(/Matthew 6:21/.test(await toast()), "Matthew 6:21");
  check((await dbg()).bank - bank0 >= 60, "60 coins of treasure", `+${(await dbg()).bank - bank0}`);
  await film([cx, cy + 0.5, cz], [1.6, 1.5, 2.2]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("chest-open") });
  await unfilm();
  d = await dbg();
  check(d.use !== "Open the treasure" && d.use !== "Locked", "nothing more to open");

  // ── peacocks ──
  const pk = f.peacocks;
  check(pk.length === 2, "two peacocks");
  const [px, py, pz] = pk[0];
  await film([px, py + 0.6, pz], [3.0, 1.2, -0.4]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("peacock-walking") });
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x - 0.2, z + 1.0, 2), [px, pz]);
  await page.waitForTimeout(1500);
  const q = (await fun()).peacocks[0];
  await film([q[0], q[1] + 0.8, q[2]], [2.8, 0.9, -0.9]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("peacock-fan") });
  await unfilm();
  d = await dbg();
  check(d.use === "Pat the peacock", "a peacock to pat", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(200);
  check(/very good/.test(await toast()), "Genesis 1:31");
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-TREASURE FAILED (${fails})` : "SHOTS-CASTLE-TREASURE OK");
process.exit(fails ? 1 : 0);
