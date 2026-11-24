/**
 * shots-kites.mjs — the kite stall on Adventure Island's beach: E takes a kite, it flies on a string
 * from the hand, climbs higher when the kid runs, loops when they jump, and E at the stall gives it
 * back. Pictures: 99-kites-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-kites-${name}.png`);
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
  const STALL = [23, 3];

  // 1) at the stall: "Fly a kite"
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x - 1.3, z - 1.3, 2), STALL);
  await page.waitForTimeout(1200);
  let d = await dbg();
  check(d.use === "Fly a kite", "the kite stall offers a kite", `offered "${d.use}"`);
  await page.evaluate(([x, z]) => { window.__filmCam = (c) => { c.position.set(x - 6, 2.4, z - 4); c.lookAt(x, 1.4, z); }; }, STALL);
  await hideToasts();
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot("stall") });
  await page.evaluate(() => { window.__filmCam = undefined; });
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(2500);
  d = await dbg();
  check(d.kite !== null, "E takes a kite and it flies", `${d.kite} m up`);
  const still = d.kite ?? 0;
  // 2) running: it climbs higher (run inland, up the beach)
  await page.keyboard.down("ArrowUp");
  let high = 0;
  for (let k = 0; k < 30; k++) { await page.waitForTimeout(120); high = Math.max(high, (await dbg()).kite ?? 0); }
  await hideToasts();
  await page.screenshot({ path: shot("running") });
  await page.keyboard.up("ArrowUp");
  // on open sand, from the side: the kid, the string and the kite out on the breeze
  await page.evaluate(() => window.__gameDebug().warp(25.8, 0.2, 2));
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__filmCam = (c) => { const g = window.__gameDebug(); c.position.set(g.px + 6.4 - 2, g.py + 2.2, g.pz - 6.4 - 2); c.lookAt(g.px - 2.5, g.py + 2.6, g.pz - 2.5); }; });
  await hideToasts();
  await page.waitForTimeout(700);
  await page.screenshot({ path: shot("flying") });
  await page.evaluate(() => { window.__filmCam = undefined; });
  check(high > still + 0.8, "running makes the kite climb higher", `${still} → ${high} m`);
  check(still > 1.2, "even standing still it flies above the kid", `${still} m`);

  // 3) a jump: no errors from the loop-the-loop, kite still flying
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  check((await dbg()).kite !== null, "a jump loops the kite and it keeps flying");

  // 4) back at the stall: E gives it back
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x - 1.3, z - 1.3, 2), STALL);
  await page.waitForTimeout(1000);
  d = await dbg();
  check(d.use === "Give the kite back", "at the stall you can give it back", `offered "${d.use}"`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(500);
  check((await dbg()).kite === null, "E gives the kite back");
  check(errors.length === 0, "no page errors", errors[0]);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-KITES FAILED (${fails})` : "SHOTS-KITES OK");
process.exit(fails ? 1 : 0);
