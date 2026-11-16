/**
 * playtest-fly.mjs — the sky and space.
 *   H1 Hop in shows the helicopter      H2 holding Space climbs       H3 forward flies
 *   H4 flying through a ring counts     H5 letting go lands gently    H6 landing on Cloud Island
 *   R1 the rocket button appears        R2 blast-off arrives on the Moon
 *   R3 Moon jumps are much higher       R4 the rocket flies back to the island
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) { console.error("no dist — build first"); process.exit(1); }

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    let raw = req.url.split("?")[0];
    if (raw === "/") raw = "/index.html";
    const file = resolve(DIST, "." + decodeURIComponent(raw));
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-gl=swiftshader"],
});

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  const dbg = () => page.evaluate(() => { const d = window.__gameDebug(); return { ...d, placeCar: undefined, placeHeli: undefined, placeBoat: undefined, warp: undefined, groundAt: undefined }; });
  const level = () => page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
  await page.evaluate(() => window.__play("island"));
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });

  // the helicopter is parked at (13, 10)
  await page.evaluate(() => window.__gameDebug().warp(11, 11.5));
  await page.waitForTimeout(500);
  const label = await page.textContent("#btn-car");
  check("H1 Hop in shows the helicopter", label.includes("🚁"), label);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check("H1b E boards the helicopter", (await dbg()).heli.occupied === true);

  await page.keyboard.down("Space");
  await page.waitForTimeout(2500);
  const up = await dbg();
  check("H2 holding Space climbs", up.heli.y > 6, `height ${up.heli.y.toFixed(1)}`);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyW");
  const fwd = await dbg();
  check("H3 forward flies", Math.hypot(fwd.heli.x - up.heli.x, fwd.heli.z - up.heli.z) > 6, `moved ${Math.hypot(fwd.heli.x - up.heli.x, fwd.heli.z - up.heli.z).toFixed(1)}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/31-helicopter.png") });

  // line up with the ring over the meadow (0, 10, -20) and fly through it
  await page.keyboard.up("Space"); // level flight: it sinks a little on the way in
  await page.evaluate(() => window.__gameDebug().placeHeli(0, 12, -14, Math.PI));
  await page.keyboard.down("KeyW");
  await page.waitForFunction(() => window.__gameDebug().rings >= 1, null, { timeout: 8000 }).catch(() => {});
  await page.keyboard.up("KeyW");
  check("H4 flying through a ring counts", (await dbg()).rings >= 1, `rings=${(await dbg()).rings}`);

  // let go: it sinks and lands by itself
  await page.waitForFunction(() => { const d = window.__gameDebug(); return d.heli.y < 2.2; }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const down = await dbg();
  check("H5 letting go lands gently", down.heli.y < 2.2 && down.hearts === 3 && down.state === "playing", `y=${down.heli.y.toFixed(2)} hearts=${down.hearts}`);

  // Cloud Island is at (30, 30, 0): hover above it and let go
  await page.keyboard.down("Space");
  await page.waitForTimeout(600);
  await page.keyboard.up("Space");
  await page.evaluate(() => window.__gameDebug().placeHeli(30, 33, 1, 0));
  await page.waitForTimeout(2500);
  const cloud = await dbg();
  check("H6 landing on Cloud Island", Math.abs(cloud.heli.y - 30) < 0.2, `y=${cloud.heli.y.toFixed(2)}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/32-cloud-island.png") });
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);

  // rocket on Pine Island at (-70, -40.5)
  await page.evaluate(() => window.__gameDebug().warp(-68, -38.5));
  await page.waitForTimeout(500);
  const rl = await page.textContent("#btn-car");
  check("R1 the rocket button appears", rl.includes("🚀"), rl);
  // the Moon is a place a verse opens: the rocket asks for it first
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  const asked = await page.evaluate(() => getComputedStyle(document.getElementById("ov-verse")).display !== "none");
  check("R1b the rocket asks for a verse before a new place", asked);
  if (asked) {
    const verse = await page.textContent("#verse-text");
    await page.click("[data-action=verse-ready]");
    await page.fill("#verse-input", verse.toLowerCase().replace(/[^a-z0-9 ]/g, ""));
    await page.click("[data-action=verse-check]");
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(ROOT, "verification-shots/33-blast-off.png") });
  await page.waitForFunction(() => document.getElementById("hud-level")?.textContent?.includes("Moon"), null, { timeout: 12000 }).catch(() => {});
  check("R2 blast-off arrives on the Moon", (await level()).includes("Moon Base"), await level());
  await page.waitForTimeout(800);

  const g0 = await dbg();
  await page.keyboard.press("Space");
  let peak = g0.py;
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(80); peak = Math.max(peak, (await dbg()).py); }
  check("R3 Moon jumps are much higher", peak - g0.py > 4, `jumped ${(peak - g0.py).toFixed(1)}`);
  await page.waitForFunction(() => window.__gameDebug().onGround, null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: join(ROOT, "verification-shots/34-moon.png") });

  // and home again: the Moon's rocket is at (-7, 9)
  await page.evaluate(() => window.__gameDebug().warp(-5, 10.5));
  await page.waitForTimeout(500);
  await page.keyboard.press("KeyE");
  await page.waitForFunction(() => document.getElementById("hud-level")?.textContent?.includes("Adventure"), null, { timeout: 12000 }).catch(() => {});
  check("R4 the rocket flies back to the island", (await level()).includes("Adventure Island"), await level());

  check("Z1 zero page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `PLAYTEST-FLY FAILED (${failures})` : "PLAYTEST-FLY OK");
process.exit(failures ? 1 : 0);
