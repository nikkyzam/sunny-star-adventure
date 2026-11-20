/**
 * shots-scooter.mjs — kick scooters on Adventure Island: hop on, scoot, lean, hop
 * off. Pictures: verification-shots/99-scooter-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-scooter-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9&time=day`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const dbg = () => page.evaluate(() => window.__gameDebug());
  const toast = () => page.evaluate(() => document.body.innerText);
  let d = await dbg();
  check(d.scooters.length === 4, "four scooters parked round the island", JSON.stringify(d.scooters.map((s) => [+s.x.toFixed(1), +s.y.toFixed(2), +s.z.toFixed(1)])));
  const s0 = d.scooters[0];
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [s0.x + 0.6, s0.z + 0.6]);
  await page.waitForTimeout(600);
  // close-up of the parked scooter
  await page.evaluate(([x, y, z]) => { window.__filmCam = (cam) => { cam.position.set(x + 1.6, y + 1.0, z + 1.4); cam.lookAt(x, y + 0.4, z); cam.fov = 45; }; }, [s0.x, s0.y, s0.z]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("parked") });
  await page.evaluate(() => { window.__filmCam = undefined; });
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  d = await dbg();
  check(d.scooters[0].ridden && d.kid.riding, "on the scooter");
  check(/scoot/.test(await toast()), "a scooter message");
  const x0 = d.kid.x, z0 = d.kid.z;
  await page.keyboard.down("KeyW");
  let top = 0;
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(100); top = Math.max(top, (await dbg()).scooters[0].speed); }
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(500);
  // riding shot, from the side
  const r = (await dbg()).scooters[0];
  await page.evaluate(([x, y, z]) => { window.__filmCam = (cam) => { cam.position.set(x + 2.8, y + 1.5, z + 2.4); cam.lookAt(x, y + 0.9, z); cam.fov = 45; }; }, [r.x, r.y, r.z]);
  await page.waitForTimeout(150);
  await page.screenshot({ path: shot("riding") });
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyW");
  await page.evaluate(() => { window.__filmCam = undefined; });
  d = await dbg();
  const moved = Math.hypot(d.kid.x - x0, d.kid.z - z0);
  check(moved > 6, "scooted along", `${moved.toFixed(1)} m`);
  check(top > 5 && top <= 8.01, "a gentle top speed", `${top.toFixed(1)} m/s`);
  check(Math.abs(d.kid.y - d.scooters[0].y - 0.21) < 0.05, "standing on the deck", `kid ${d.kid.y.toFixed(2)} deck ${d.scooters[0].y.toFixed(2)}`);
  await page.waitForTimeout(1500);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  d = await dbg();
  check(!d.kid.riding && !d.scooters[0].ridden, "hopped off");
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-SCOOTER FAILED (${fails})` : "SHOTS-SCOOTER OK");
process.exit(fails ? 1 : 0);
