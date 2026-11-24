/**
 * shots-balloon.mjs — the hot-air balloon on Adventure Island: climb in with E, it rises with the
 * burner roaring, drifts high over the island, floats back down when asked and lands on its field,
 * and the kid climbs out beside it. Pictures: 99-balloon-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-balloon-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9&time=day`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 120000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const hideToasts = () => page.evaluate(() => document.querySelectorAll(".toast, #hud-toast, #toast").forEach((t) => (t.style.visibility = "hidden")));
  const dbg = () => page.evaluate(() => window.__gameDebug());

  const b = (await dbg()).balloon;
  check(!!b && b.state === "parked", "a balloon waits on its field", JSON.stringify(b));
  if (!b) throw new Error("no balloon");

  // 1) on the field: a picture from the side
  await page.evaluate(({ x, z }) => window.__gameDebug().warp(x + 2.2, z + 1.5, 2), b);
  await page.waitForTimeout(1500);
  await page.evaluate(({ x, z }) => { window.__filmCam = (c) => { c.position.set(x + 9, 3.2, z + 9); c.lookAt(x, 4.2, z); }; }, b);
  await hideToasts();
  await page.waitForTimeout(800);
  await page.screenshot({ path: shot("field") });
  await page.evaluate(() => { window.__filmCam = undefined; });

  // 2) climb in
  await page.evaluate(({ x, z }) => window.__gameDebug().warp(x + 1.6, z, 2), b);
  await page.waitForTimeout(800);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(500);
  let d = await dbg();
  check(d.mounted === "balloon" && d.balloon.state === "flight", "E climbs into the basket and it takes off", `mounted ${d.mounted}, ${d.balloon.state}`);

  // 3) it rises high, carrying the kid in the basket
  let top = 0, inBasket = true;
  for (let k = 0; k < 60; k++) {
    await page.waitForTimeout(250);
    d = await dbg();
    top = Math.max(top, d.py);
    if (d.mounted !== "balloon") { inBasket = false; break; }
    if (top > 20) break;
  }
  check(top > 18, "it rises high over the island", `${top.toFixed(1)} m`);
  check(inBasket, "the kid stays in the basket");
  await hideToasts();
  await page.screenshot({ path: shot("up-high") });
  // a picture from beside the balloon, island below
  await page.evaluate(() => { const g = window.__gameDebug(); window.__filmCam = (c) => { const d = window.__gameDebug(); c.position.set(d.px + 7, d.py + 5, d.pz + 8); c.lookAt(d.px, d.py + 2.5, d.pz); }; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot("flying") });
  await page.evaluate(() => { window.__filmCam = undefined; });

  // 4) ask to go down: it hurries home and lands on the field; the kid climbs out
  await page.keyboard.press("KeyE");
  let landed = false;
  for (let k = 0; k < 200; k++) {
    await page.waitForTimeout(250);
    d = await dbg();
    if (d.mounted !== "balloon") { landed = true; break; }
  }
  await page.waitForTimeout(600);
  d = await dbg();
  check(landed && d.balloon.state === "parked", "E floats it back down and it lands", `state ${d.balloon.state}`);
  check(Math.hypot(d.px - b.x, d.pz - b.z) < 3.5 && d.py < 1.5, "the kid climbs out beside it on the field", `(${d.px.toFixed(1)}, ${d.py.toFixed(1)}, ${d.pz.toFixed(1)})`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  check((await dbg()).mounted === "balloon", "and can go up again");
  check(errors.length === 0, "no page errors", errors[0]);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-BALLOON FAILED (${fails})` : "SHOTS-BALLOON OK");
process.exit(fails ? 1 : 0);
