/**
 * playtest-drive.mjs — driving and bumping into things in Toy City.
 *   D1 "Drive in Toy City" starts on the car level     D2 Hop in button appears next to the car
 *   D3 the button boards the car                       D4 Space makes the car hop
 *   D5 driving forward knocks a cone                   D6 boost pad speeds the car up
 *   D7 the ramp launches the car                       D8 pushing sideways turns and drives
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
  const dbg = () => page.evaluate(() => { const d = window.__gameDebug(); return { ...d, placeCar: undefined, groundAt: undefined }; });
  const visible = (sel) => page.evaluate((s) => document.querySelector(s)?.style.display !== "none", sel);

  await page.click("[data-action=drive]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  const lvl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
  check("D1 Drive button starts Toy City", lvl.includes("Toy City") && (await dbg()).car !== null, lvl);

  // sample the game while a key is held; returns the peak car height and speed seen
  const hold = async (key, pred, ms = 6000) => {
    let maxY = -99, maxSpeed = 0;
    if (key) await page.keyboard.down(key);
    const t = Date.now();
    while (Date.now() - t < ms) {
      const d = await dbg();
      if (d.car) maxY = Math.max(maxY, d.car.y);
      maxSpeed = Math.max(maxSpeed, d.carSpeed);
      if (pred(d)) break;
      await page.waitForTimeout(50);
    }
    if (key) await page.keyboard.up(key);
    return { maxY, maxSpeed };
  };

  // walk from the spawn (0, 18) to the car parked at about (3, 14)
  check("D2a no car button far from the car", !(await visible("#btn-car")));
  await hold("KeyW", (d) => d.pz < 14.6);
  await hold("KeyD", (d) => d.px > 1.4);
  await page.waitForTimeout(200);
  const label = await page.textContent("#btn-car");
  check("D2 Hop in button appears", (await visible("#btn-car")) && label.includes("Hop in"), label);
  await page.click("#btn-car");
  await page.waitForTimeout(300);
  check("D3 button boards the car", (await dbg()).car.occupied === true && (await page.textContent("#btn-car")).includes("Hop out"));
  check("D3b honk button shows while driving", await visible("#btn-honk"));
  await page.keyboard.press("KeyH");

  await page.keyboard.press("Space");
  const hop = await hold(null, () => false, 700);
  check("D4 Space hops the car", hop.maxY > 0.4, `peak ${hop.maxY.toFixed(2)}`);

  // forward (-z) from (4, 14): the cone at (3, 5.2) is in the way
  await hold("KeyW", (d) => d.car.z < 3);
  check("D5 driving knocks a cone", (await dbg()).props.cones >= 1, `cones=${(await dbg()).props.cones}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/21-driving-cones.png") });

  // the stunt lane: boost pad at x=-16, ramp at x=-11, heading east (+x)
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__gameDebug().placeCar(-20, 6, Math.PI / 2));
  const before = (await dbg()).props.cones;
  const run = await hold("KeyD", (d) => d.car.x > 5, 5000);
  check("D6 boost pad speeds the car up", run.maxSpeed > 15, `peak speed ${run.maxSpeed.toFixed(1)}`);
  check("D7 ramp launches the car", run.maxY > 1.2, `peak height ${run.maxY.toFixed(2)}`);
  await page.waitForTimeout(600);
  check("D7b more cones knocked on landing", (await dbg()).props.cones > before, `cones=${(await dbg()).props.cones}`);

  // from a standstill facing east, pushing "up" (-z) must turn the car and drive it
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__gameDebug().placeCar(-6, 16, Math.PI / 2));
  await page.waitForTimeout(300);
  const z0 = (await dbg()).car.z;
  await hold("KeyW", () => false, 1500);
  const z1 = (await dbg()).car.z;
  check("D8 pushing sideways turns and drives", z0 - z1 > 3, `moved ${(z0 - z1).toFixed(1)} toward -z`);
  await page.screenshot({ path: join(ROOT, "verification-shots/22-driving.png") });

  const end = await dbg();
  check("Z0 still playing with the car on the island", end.state === "playing" && end.car.y > -1, `state=${end.state} y=${end.car.y.toFixed(1)}`);
  check("Z1 zero page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `PLAYTEST-DRIVE FAILED (${failures})` : "PLAYTEST-DRIVE OK");
process.exit(failures ? 1 : 0);
