/**
 * playtest-clear.mjs — full-clear end-to-end test (process file, deleted before delivery).
 * Closed-loop bot: steers the bunny with real key presses toward every remaining star
 * (positions read from window.__gameDebug), then through the unlocked portal.
 * Asserts: all 10 stars collected → portal unlocks → levelclear overlay → Next button →
 * level 2 starts → 3 falls → gameover overlay. Screenshots both overlays.
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
const page = await browser.newPage({ viewport: { width: 800, height: 450 } /* small: these tests time key presses, and software-rendered foliage is slow */ });
// easy mode (the default) refills hearts instead of game over — this run checks the hard path
await page.addInitScript(() => localStorage.setItem("game.profile", JSON.stringify({ outfit: 0, name: [0, 0], easy: false })));
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/?level=0`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
await page.waitForTimeout(600);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const dbg = () => page.evaluate(() => window.__gameDebug());
const probe = () => page.evaluate(() => window.__gameProbe());
const overlayVisible = (id) =>
  page.evaluate((i) => document.getElementById(i)?.style.display !== "none", id);

// camera yaw stays 0 (no mouse input): W = -z, S = +z, A = -x, D = +x
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

async function waitSlimeClear(tx, tz, timeoutMs = 8000) {
  // park until no alive slime is near the target (or give up and dash anyway)
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const d = await dbg();
    if (!d.slimes.some((s) => Math.hypot(s.x - tx, s.z - tz) < 3.2)) return;
    await page.waitForTimeout(120);
  }
}

// island chain of level 1 — the designed path; the bot must follow it instead of beelining
const ROUTE = [
  { x: 0, y: 0, z: 0, r: 7 },
  { x: 0, y: 0.4, z: -12, r: 4 },
  { x: 7, y: 1.0, z: -19, r: 4.5 },
  { x: 0, y: 1.6, z: -27, r: 5 },
  { x: -8, y: 2.2, z: -34, r: 4 },
  { x: 0, y: 2.8, z: -42, r: 6 },
];
function islandOf(x, z) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < ROUTE.length; i++) {
    const d = Math.hypot(ROUTE[i].x - x, ROUTE[i].z - z) / ROUTE[i].r;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

async function steerTo(tx, ty, tz, timeoutMs, radius = 0.9) {
  const start = Date.now();
  let jumpedAt = 0;
  let lastLog = 0;
  while (Date.now() - start < timeoutMs) {
    const d = await dbg(); // one round trip carries position + state
    const px = d.px, py = d.py, pz = d.pz;
    if (Date.now() - lastLog > 900) {
      lastLog = Date.now();
      console.log(`    pos=(${px.toFixed(1)},${py.toFixed(1)},${pz.toFixed(1)}) target=(${tx},${ty},${tz}) hearts=${d.hearts} state=${d.state}`);
    }
    if (d.state !== "playing") { await releaseAll(); return false; }
    const dx = tx - px, dz = tz - pz;
    const dist = Math.hypot(dx, dz);
    if (dist < radius && Math.abs(ty - py) < 2.4) { await releaseAll(); return true; }
    if (dist < 2.0) {
      // final approach: short taps instead of held keys — software-GL input latency
      // otherwise makes the bot oscillate ±2 units around the target and walk off edges
      await releaseAll();
      const k1 = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "KeyD" : "KeyA") : (dz > 0 ? "KeyS" : "KeyW");
      await page.keyboard.down(k1);
      await page.waitForTimeout(70);
      await page.keyboard.up(k1);
      await page.waitForTimeout(140);
      continue;
    }
    await setKeys(dx, dz);
    // hop over a slime that blocks the path (landing on top stomps it)
    if (d.canJump && Date.now() - jumpedAt > 400) {
      const near = d.slimes.find((s) => Math.hypot(s.x - px, s.z - pz) < 2.1);
      if (near) {
        await page.keyboard.press("Space");
        jumpedAt = Date.now();
        continue;
      }
    }
    // edge-aware hop (grounded OR inside coyote time): jump before a gap, a step-up,
    // or for higher targets. Look far enough ahead that one poll interval can't skip the band.
    if (d.canJump && dist > 0.6 && Date.now() - jumpedAt > 380) {
      const nx = dx / dist, nz = dz / dist;
      const ahead = await page.evaluate(
        ([x, z]) => window.__gameDebug().groundAt(x, z),
        [px + nx * 1.3, pz + nz * 1.3],
      );
      if (ahead === null || ahead < py - 0.5 || ahead > py + 0.4 || ty > py + 1.2) {
        await page.keyboard.press("Space");
        jumpedAt = Date.now();
        // second press mid-air = double jump for wide gaps / high ledges
        if (ty > py + 1.2 || ahead === null) {
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

/** Navigate to a target by hopping island-to-island along the designed chain (never beeline over voids). */
async function gotoRouted(tx, ty, tz, timeoutPerLeg = 20_000) {
  const targetIsland = islandOf(tx, tz);
  for (;;) {
    const d = await dbg();
    if (d.state !== "playing") return false;
    const cur = islandOf(d.px, d.pz);
    if (cur < targetIsland) {
      const n = ROUTE[cur + 1];
      const ok = await steerTo(n.x, n.y, n.z, timeoutPerLeg, 1.6);
      if (!ok) return false;
    } else {
      return await steerTo(tx, ty, tz, timeoutPerLeg, 0.9);
    }
  }
}

// ── D: full clear of level 1 ─────────────────────────────────────
await page.keyboard.press("Space"); // start
await page.waitForTimeout(400);
// (a slow first frame can swallow the key: fall back to the Play button)
if ((await dbg()).state !== "playing") {
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 10000 }).catch(() => {});
}

const globalStart = Date.now();
let checkpointDone = false;
let retries = 0;
while (Date.now() - globalStart < 240_000) {
  const d = await dbg();
  if (d.state === "gameover") {
    // the bot ran out of hearts — retry and keep going (stars reset, timeout still applies)
    retries++;
    await releaseAll();
    await page.click('#ov-gameover [data-action="retry"]');
    await page.waitForTimeout(500);
    checkpointDone = false;
    if (retries > 8) break;
    continue;
  }
  if (d.state !== "playing") break;
  if (d.stars.length === 0) break;
  // path order: follow the island chain from high z to low z
  d.stars.sort((a, b) => b.z - a.z);
  const s = d.stars[0];
  console.log(`  … steering to (${s.x},${s.y},${s.z}) — ${d.stars.length} stars left, hearts=${d.hearts}`);
  // stars on the slime-patrolled island C: wait for the slime to wander off first
  if (s.x > 3 && s.z > -23 && s.z < -15) await waitSlimeClear(s.x, s.z);
  // touch the checkpoint on island D before crossing to the second half of the level,
  // so a later fall respawns forward instead of replaying the slime island
  if (!checkpointDone && s.z < -23) {
    await gotoRouted(-2, 1.6, -25.5);
    checkpointDone = true;
    continue;
  }
  await gotoRouted(s.x, s.y, s.z);
}
await releaseAll();

let d = await dbg();
check("D1 all 10 stars collected", d.stars.length === 0, `${10 - d.stars.length}/10 collected, hearts=${d.hearts}`);
check("D2 portal unlocked", d.portalUnlocked === true);

if (d.stars.length === 0 && d.state === "playing") {
  await gotoRouted(d.portal.x, d.portal.y, d.portal.z);
  await releaseAll();
  await page.waitForTimeout(600);
  d = await dbg();
  check("D3 entering portal → levelclear", d.state === "levelclear", d.state);
  await page.screenshot({ path: join(SHOTS, "06-levelclear.png") });

  if (d.state === "levelclear") {
    await page.click('#ov-clear [data-action="next"]');
    await page.waitForTimeout(300);
    // the memory verse gate: read, then type it from memory
    const verse = await page.textContent("#verse-text");
    const ref = await page.textContent("#verse-ref");
    check("V1 a memory verse is shown after the level", ref === "Genesis 1:1" && verse.startsWith("In the beginning"), `${ref}: ${verse}`);
    await page.click('[data-action="verse-ready"]');
    const hidden = await page.evaluate(() => document.getElementById("verse-text").style.display === "none");
    check("V2 the verse is hidden while typing", hidden);
    await page.fill("#verse-input", "In the beginning God made the sky");
    await page.click('[data-action="verse-check"]');
    await page.waitForTimeout(200);
    let lvl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
    const fb = await page.textContent("#verse-feedback");
    check("V3 a wrong verse does not open the next level", lvl.includes("Sunny Meadow") && fb.includes("In the beginning God") && fb.includes("___"), fb);
    await page.screenshot({ path: join(SHOTS, "38-verse-feedback.png") });
    // capitals and punctuation don't matter, and one slip in a long word is forgiven
    await page.fill("#verse-input", "in the begining god created the heaven and the earth");
    await page.click('[data-action="verse-check"]');
    await page.waitForTimeout(500);
    lvl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
    check("D4 typing the verse starts level 2", lvl.includes("Candy Canyon"), lvl);
  }
}

// ── E: game over by falling 3 times on level 2 ───────────────────
d = await dbg();
if (d.state === "playing") {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(1300);
    await page.keyboard.up("KeyA");
    await page.waitForTimeout(1800);
  }
  d = await dbg();
  check("E1 3 falls → gameover", d.state === "gameover", `state=${d.state} hearts=${d.hearts}`);
  check("E2 gameover overlay visible", await overlayVisible("ov-gameover"));
  await page.screenshot({ path: join(SHOTS, "07-gameover.png") });
  // retry from gameover
  await page.click('#ov-gameover [data-action="retry"]');
  await page.waitForTimeout(400);
  d = await dbg();
  check("E3 Retry button restarts the level", d.state === "playing" && d.hearts === 3, `${d.state} hearts=${d.hearts}`);
}

check("F1 zero console errors", errors.length === 0, errors[0] ?? "");

await browser.close();
server.close();
if (failures) { console.error(`PLAYTEST-CLEAR FAIL: ${failures} check(s) failed`); process.exit(1); }
console.log("PLAYTEST-CLEAR OK: full level-1 clear + game over verified");
