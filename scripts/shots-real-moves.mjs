/**
 * shots-real-moves.mjs — the kids move more like real children: knees bend to soak up a landing
 * (deeper after a big drop), sand puffs up round the feet, running on sand kicks up little puffs
 * (none on grass), the hand reaches out when using something, comes up to the mouth when eating, and pats animals. Pictures: 99-moves-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-moves-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9&time=day`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  // clear any welcome toast so it doesn't cover the pictures
  await page.evaluate(() => document.querySelectorAll(".toast, #hud-toast").forEach((t) => (t.style.display = "none")));
  const dbg = () => page.evaluate(() => window.__gameDebug());

  // 1) a jump on Palm Cay's sand: the knees bend as the kid lands, the hips sink, sand puffs out
  const cam = { c: [58.2, 1.5, -33.6], l: [55, 0.8, -31] };
  await page.evaluate(({ c, l }) => { window.__filmCam = (camera) => { camera.position.set(...c); camera.lookAt(...l); }; }, cam);
  await page.evaluate(() => window.__gameDebug().warp(55, -31, 2));
  await page.waitForTimeout(1200);
  await page.keyboard.press("Space");
  let maxDrop = 0, maxDust = 0, shotTaken = false, landedAt = -1, wasUp = false;
  for (let k = 0; k < 120; k++) {
    const d = await dbg();
    if (d.py > 0.6) wasUp = true;
    if (wasUp && landedAt < 0 && Math.abs(d.py - 0.2) < 0.05) landedAt = k;
    if (landedAt >= 0) {
      maxDrop = Math.max(maxDrop, d.feet?.[2] ?? 0);
      maxDust = Math.max(maxDust, d.dust ?? 0);
      if (!shotTaken && k - landedAt >= 5) { await page.screenshot({ path: shot("landing") }); shotTaken = true; }
      if (k - landedAt > 18) break;
    }
    await page.waitForTimeout(15);
  }
  check(landedAt >= 0, "the kid lands on the sand");
  check(maxDrop > 0.06, "landing bends the knees (the hips sink)", `deepest ${maxDrop.toFixed(3)} m`);
  check(maxDust >= 5, "sand puffs out round the feet", `${maxDust} puffs`);
  await page.waitForTimeout(800);
  const settled = (await dbg()).feet?.[2] ?? 0;
  check(settled < 0.05, "and the kid stands up straight again", `drop ${settled.toFixed(3)}`);

  await page.evaluate(() => { window.__filmCam = undefined; });
  // 2) running across the sand kicks up little puffs
  await page.evaluate(() => window.__gameDebug().warp(20, 6, 2));
  await page.waitForTimeout(1500);
  await page.keyboard.down("ArrowUp");
  let runDust = 0;
  for (let k = 0; k < 20; k++) { runDust = Math.max(runDust, (await dbg()).dust ?? 0); await page.waitForTimeout(60); }
  await page.screenshot({ path: shot("running-sand") });
  await page.keyboard.up("ArrowUp");
  check(runDust >= 2, "running on sand kicks up puffs", `${runDust} puffs`);
  await page.evaluate(() => { window.__filmCam = undefined; });

  // 3) …but not on the village grass
  await page.evaluate(() => window.__gameDebug().warp(14, -22, 1));
  await page.waitForTimeout(2500);
  await page.keyboard.down("ArrowLeft");
  let grassDust = 0;
  for (let k = 0; k < 16; k++) { grassDust = Math.max(grassDust, (await dbg()).dust ?? 0); await page.waitForTimeout(60); }
  await page.keyboard.up("ArrowLeft");
  check(grassDust === 0, "no sand puffs on the grass", `${grassDust} puffs`);

  // 4) using something: the hand reaches out (the church photo spot)
  await page.evaluate(() => window.__gameDebug().warp(12, -29.5, 1));
  await page.waitForTimeout(1500);
  const before = (await dbg()).handOut;
  await page.keyboard.press("KeyE");
  let reachOut = -9;
  for (let k = 0; k < 12; k++) { reachOut = Math.max(reachOut, (await dbg()).handOut); await page.waitForTimeout(40); }
  check(Number.isFinite(before) && reachOut - before > 0.1, "the hand reaches out to use something", `${before} → ${reachOut} m in front`);
  await page.waitForTimeout(3500);

  // 5) eating a snack: the hand comes up to the mouth
  // (the photo spot opened a postcard: close it to play on)
  if ((await dbg()).state !== "playing") await page.click("[data-photo=close]").catch(() => {});
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 15000 }).catch(() => {});
  const food = (await dbg()).foodAt?.[0];
  check(!!food, "there's a snack to eat on Palm Cay");
  if (food) {
    const restHead = (await dbg()).handHead;
    await page.evaluate(([x, y, z]) => window.__gameDebug().warp(x, z, y + 1), food);
    let eating = false, closest = 9;
    for (let k = 0; k < 40; k++) {
      const d = await dbg();
      if (d.gesture === "eat") eating = true;
      if (eating && d.handHead < closest) { closest = d.handHead; if (closest < 0.33) await page.screenshot({ path: shot("eating") }); }
      if (eating && k > 25) break;
      await page.waitForTimeout(30);
    }
    check(eating, "eating a snack starts the eating gesture", `state ${(await dbg()).state}, food left ${(await dbg()).food}`);
    check(closest < 0.4 && closest < restHead - 0.12, "the hand comes up to the mouth", `${restHead} → ${closest} m from the head`);
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll(".toast, #hud-toast").forEach((t) => (t.style.display = "none")));
  }

  // 6) patting an animal: the hand goes out and pats (a cow: E next to a donkey or horse means a ride)
  const herd = (await dbg()).herds?.find((h) => h.kind === "cow" && h.mode === "eat") ?? (await dbg()).herds?.find((h) => h.kind === "cow");
  if (herd) {
    await page.evaluate(({ x, z }) => window.__gameDebug().warp(x + 0.9, z, 2), herd);
    await page.waitForTimeout(400);
    const pre = await dbg();
    await page.keyboard.press("KeyE");
    let patting = false;
    for (let k = 0; k < 30; k++) {
      const d = await dbg();
      if (d.gesture === "pat") { if (!patting) setTimeout(() => page.screenshot({ path: shot("patting") }).catch(() => {}), 450); patting = true; }
      await page.waitForTimeout(30);
    }
    check(patting, "E next to an animal pats it", `${herd.kind}; offered "${pre.use}", riding ${(await dbg()).riding}`);
  } else console.log("(no animals on Palm Cay: pat check skipped)");
  check(errors.length === 0, "no page errors", errors[0]);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-REAL-MOVES FAILED (${fails})` : "SHOTS-REAL-MOVES OK");
process.exit(fails ? 1 : 0);
