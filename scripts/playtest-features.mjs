/**
 * playtest-features.mjs — expansion-feature test (process file, deleted before delivery).
 * Verifies the new systems end to end with real key presses:
 *   G1 coins collect on the level-1 main path
 *   G2 bunny buddy adoption on its side island
 *   G3 treasure chest opens on its side island
 *   G4 Toy City: E boards the car, W drives it, E exits
 *   G5 Toy City: free glide — falling with Space held is a slow descent
 *   G6 co-op: "2 Players" button spawns a second kid, arrow keys move them
 *   G7 zero console errors
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) { console.error("no dist — build first"); process.exit(1); }
const SHOTS = join(ROOT, "verification-shots");
mkdirSync(SHOTS, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    let raw = req.url.split("?")[0];
    if (raw === "/") raw = "/index.html";
    try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
    const file = resolve(DIST, "." + raw);
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const dbg = () => page.evaluate(() => window.__gameDebug());

const held = new Set();
async function setKeys(dx, dz) {
  const want = new Set();
  if (dz < -0.25) want.add("KeyW");
  if (dz > 0.25) want.add("KeyS");
  if (dx > 0.25) want.add("KeyD");
  if (dx < -0.25) want.add("KeyA");
  for (const k of want) if (!held.has(k)) { held.add(k); await page.keyboard.down(k); }
  for (const k of [...held]) if (!want.has(k)) { held.delete(k); await page.keyboard.up(k); }
}
async function releaseAll() {
  for (const k of [...held]) { held.delete(k); await page.keyboard.up(k); }
}

async function steerTo(tx, ty, tz, timeoutMs, radius = 0.9) {
  const start = Date.now();
  let jumpedAt = 0;
  while (Date.now() - start < timeoutMs) {
    const d = await dbg();
    if (d.state !== "playing") { await releaseAll(); return false; }
    const dx = tx - d.px, dz = tz - d.pz;
    const dist = Math.hypot(dx, dz);
    if (dist < radius && Math.abs(ty - d.py) < 2.4) { await releaseAll(); return true; }
    if (dist < 2.0) {
      await releaseAll();
      const k1 = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "KeyD" : "KeyA") : (dz > 0 ? "KeyS" : "KeyW");
      await page.keyboard.down(k1);
      await page.waitForTimeout(70);
      await page.keyboard.up(k1);
      await page.waitForTimeout(140);
      continue;
    }
    await setKeys(dx, dz);
    if (d.canJump && dist > 0.6 && Date.now() - jumpedAt > 380) {
      const nx = dx / dist, nz = dz / dist;
      const ahead = await page.evaluate(
        ([x, z]) => window.__gameDebug().groundAt(x, z),
        [d.px + nx * 1.3, d.pz + nz * 1.3],
      );
      if (ahead === null || ahead < d.py - 0.5 || ahead > d.py + 0.4 || ty > d.py + 1.2) {
        await page.keyboard.press("Space");
        jumpedAt = Date.now();
        if (ty > d.py + 1.2 || ahead === null) {
          await page.waitForTimeout(210);
          await page.keyboard.press("Space");
        }
      }
    }
    await page.waitForTimeout(45);
  }
  await releaseAll();
  return false;
}

async function openLevel(n) {
  await page.goto(`http://127.0.0.1:${port}/?level=${n}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
}

// ── G1–G3: level 1 pickups / buddy / chest ───────────────────────
await openLevel(0);

// G1: walk forward along the main path; two coins sit at z=-2 and z=-7
await page.keyboard.down("KeyW");
await page.waitForTimeout(1600);
await page.keyboard.up("KeyW");
{
  const d = await dbg();
  check("G1 coins collected on the main path", d.coins >= 2, `coins=${d.coins}`);
}

// G2: the bunny lives on the side island at (11,-0.2,2) — hop the gap and adopt it
await steerTo(11, -0.2, 2, 20_000, 1.0);
await page.waitForTimeout(400);
{
  const d = await dbg();
  check("G2 bunny buddy adopted on its island", d.buddies.includes("bunny"), d.buddies.join(",") || "none");
}

// G3: treasure chest on the island at (6,1.9,-33) — routed via the main chain
for (const leg of [[0, 0, 0], [0, 0.4, -12], [7, 1.0, -19], [0, 1.6, -27]]) {
  await steerTo(leg[0], leg[1], leg[2], 20_000, 1.8);
}
await steerTo(6, 1.9, -33, 20_000, 0.9);
await page.waitForTimeout(400);
{
  const d = await dbg();
  check("G3 treasure chest opened", d.chestsOpened >= 1, `chests=${d.chestsOpened}`);
}

// ── G4–G5: Toy City car + glide ──────────────────────────────────
await openLevel(4);
{
  const d0 = await dbg();
  check("G4a car is parked in Toy City", d0.car !== null, JSON.stringify(d0.car));
}
await steerTo(4, 0, 14, 15_000, 1.6);
await page.keyboard.press("KeyE");
await page.waitForTimeout(400);
{
  const d = await dbg();
  check("G4b E boards the car", d.car?.occupied === true, JSON.stringify(d.car));
}
// drive: W is camera-forward (-z); the parked car faces -z, so it should roll forward
const before = await dbg();
await page.keyboard.down("KeyW");
await page.waitForTimeout(1300);
await page.keyboard.up("KeyW");
{
  const d = await dbg();
  const moved = before.car && d.car ? before.car.z - d.car.z : 0;
  check("G4c driving moves the car", moved > 2, `dz=${moved.toFixed(1)}`);
  await page.screenshot({ path: join(SHOTS, "08-car-driving.png") });
}
await page.keyboard.press("KeyE");
await page.waitForTimeout(400);
{
  const d = await dbg();
  check("G4d E exits the car", d.car?.occupied === false, JSON.stringify(d.car));
}

// G5: glide — walk off the plaza's south edge holding Space; descent should be slow
await steerTo(0, 0, 20, 15_000, 2.0);
await page.keyboard.down("KeyS");
await page.keyboard.down("Space");
await page.waitForTimeout(900); // walk off the rim, start falling
const g1 = await dbg();
await page.waitForTimeout(600);
const g2 = await dbg();
await page.keyboard.up("Space");
await page.keyboard.up("KeyS");
{
  const rate = (g1.py - g2.py) / 0.6; // units per second while gliding
  check("G5 glide slows the fall (≈2.2 u/s)", g2.py < g1.py && rate > 0.3 && rate < 5, `y ${g1.py.toFixed(1)}→${g2.py.toFixed(1)} (${rate.toFixed(1)} u/s)`);
  await page.screenshot({ path: join(SHOTS, "09-glide.png") });
}

// ── G6: co-op ────────────────────────────────────────────────────
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
await page.waitForTimeout(500);
await page.click('[data-action="play2"]');
await page.waitForTimeout(600);
{
  const d = await dbg();
  check("G6a 2-player mode spawns two kids", d.players === 2, `players=${d.players}`);
  const x0 = d.p2x;
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowRight");
  const d2 = await dbg();
  check("G6b arrow keys move player 2", d2.p2x - x0 > 0.5, `p2x ${x0.toFixed(1)}→${d2.p2x.toFixed(1)}`);
  await page.screenshot({ path: join(SHOTS, "10-coop.png") });
}

check("G7 zero console errors", errors.length === 0, errors[0] ?? "");

await browser.close();
server.close();
if (failures) { console.error(`PLAYTEST-FEATURES FAIL: ${failures} check(s) failed`); process.exit(1); }
console.log("PLAYTEST-FEATURES OK: coins/buddy/chest/car/glide/co-op verified");
