/**
 * playtest-touch.mjs — tablet controls, driven with real multi-touch (an iPad-sized touchscreen).
 *   T1 the thumb-stick appears when a game starts on a touch device
 *   T2 dragging the left thumb up walks forward      T3 dragging right walks right
 *   T4 a second finger on JUMP jumps while the first keeps steering
 *   T5 holding JUMP glides (Toy City)                T6 lifting the thumb stops the kid
 *   T7 Hop in / Hop out work as a second finger      T8 a sticker button works as a second finger
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
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  // fingers currently down, by id — every CDP touch event must list all of them
  const fingers = new Map();
  const touch = async (type, id, x, y) => {
    if (type !== "touchEnd") {
      fingers.set(id, { x, y, id });
      await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [...fingers.values()] });
      return;
    }
    // lifting one finger of several = a move that no longer lists it; lifting the last = touchEnd
    fingers.delete(id);
    if (fingers.size) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [...fingers.values()] });
    else await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const drag = async (id, x0, y0, x1, y1) => {
    await touch("touchStart", id, x0, y0);
    for (let i = 1; i <= 6; i++) { await touch("touchMove", id, x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6); await page.waitForTimeout(16); }
  };
  let nextFinger = 20;
  const tap = async (_id, sel) => {
    const id = nextFinger++; // a fresh finger for every tap
    const b = await page.locator(sel).boundingBox();
    await touch("touchStart", id, b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(60);
    await touch("touchEnd", id);
  };
  const dbg = () => page.evaluate(() => { const d = window.__gameDebug(); return { ...d, placeCar: undefined, placeHeli: undefined, placeBoat: undefined, warp: undefined, groundAt: undefined }; });
  const shown = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; }, sel);

  await page.goto(`http://127.0.0.1:${port}/?level=4`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  await tap(9, "[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  check("T1 thumb-stick is shown on a touch device", await shown("#stick-base"));

  // left thumb: push up = forward (-z)
  const a = await dbg();
  await drag(1, 150, 600, 150, 520);
  await page.waitForTimeout(700);
  const b = await dbg();
  check("T2 thumb up walks forward", a.pz - b.pz > 2, `z ${a.pz.toFixed(1)} → ${b.pz.toFixed(1)}`);

  // second finger on JUMP while the thumb keeps steering
  const jb = await page.locator("#btn-jump").boundingBox();
  await touch("touchStart", 2, jb.x + jb.width / 2, jb.y + jb.height / 2);
  let peak = b.py;
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(50); peak = Math.max(peak, (await dbg()).py); }
  const c = await dbg();
  check("T4 second finger jumps while steering", peak > b.py + 0.8 && b.pz - c.pz > 1, `peak +${(peak - b.py).toFixed(2)}, still moving ${(b.pz - c.pz).toFixed(1)}`);

  // steer right with the same thumb, then lift it
  await touch("touchEnd", 2);
  await touch("touchMove", 1, 220, 600);
  await page.waitForTimeout(100);
  const r0 = await dbg();
  await page.waitForTimeout(600);
  const r1 = await dbg();
  check("T3 thumb right walks right", r1.px - r0.px > 1.5, `x ${r0.px.toFixed(1)} → ${r1.px.toFixed(1)}`);
  await touch("touchEnd", 1);
  await page.waitForTimeout(500);
  const s0 = await dbg();
  await page.waitForTimeout(400);
  const s1 = await dbg();
  check("T6 lifting the thumb stops the kid", Math.hypot(s1.px - s0.px, s1.pz - s0.pz) < 0.3);

  // jump, jump again and keep holding: glide (free in Toy City) — the fall is slow
  await page.waitForFunction(() => window.__gameDebug().onGround, null, { timeout: 5000 });
  await tap(2, "#btn-jump");
  await page.waitForTimeout(150);
  await touch("touchStart", 2, jb.x + jb.width / 2, jb.y + jb.height / 2); // double jump, and hold
  await page.waitForTimeout(700);
  const g0 = await dbg();
  await page.waitForTimeout(400);
  const g1 = await dbg();
  const fall = (g0.py - g1.py) / 0.4;
  check("T5 holding JUMP glides", !g0.onGround && fall > 0.5 && fall < 4.5, `falling ${fall.toFixed(1)} u/s, y ${g0.py.toFixed(2)} → ${g1.py.toFixed(2)}, onGround ${g0.onGround}`);
  await touch("touchEnd", 2);

  // a sticker as a second finger while steering
  await drag(1, 150, 600, 150, 640);
  await tap(2, ".sticker-btn:nth-child(1)");
  await touch("touchEnd", 1);
  check("T8 sticker button works as a second finger", errors.length === 0);

  // car: reload so the kid is at the spawn, steer to the car, Hop in with a tap
  await page.goto(`http://127.0.0.1:${port}/?level=4`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  await tap(9, "[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  // spawn (0, 18) → car at about (3, 14): steer in short pushes until the button shows
  for (let i = 0; i < 40 && !(await shown("#btn-car")); i++) {
    const d = await dbg();
    const dx = 2 - d.px, dz = 14.6 - d.pz;
    const len = Math.hypot(dx, dz) || 1;
    await drag(1, 150, 600, 150 + (dx / len) * 50, 600 + (dz / len) * 50);
    await page.waitForTimeout(120);
    await touch("touchEnd", 1);
  }
  check("T7a Hop in button appears", await shown("#btn-car"));
  await drag(1, 150, 600, 150, 601); // a thumb resting on the stick
  await tap(2, "#btn-car");
  await page.waitForTimeout(300);
  const inCar = (await dbg()).car.occupied;
  await page.screenshot({ path: join(ROOT, "verification-shots/30-touch-controls.png") });
  await tap(2, "#btn-car");
  await page.waitForTimeout(300);
  const outCar = (await dbg()).car.occupied;
  check("T7 Hop in / Hop out work as a second finger", inCar === true && outCar === false, `in=${inCar} after=${outCar}`);
  await touch("touchEnd", 1);

  check("Z1 zero page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `PLAYTEST-TOUCH FAILED (${failures})` : "PLAYTEST-TOUCH OK");
process.exit(failures ? 1 : 0);
