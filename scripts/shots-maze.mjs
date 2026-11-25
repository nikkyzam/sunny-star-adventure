/**
 * shots-maze.mjs — Adventure Island's hedge maze and duck pond: the maze has one way in and a
 * winding path to a bell in the middle (reaching it rings the bell, +15 coins); at the pond a kid
 * can feed the ducks, who paddle over to the crumbs. Pictures: 99-maze-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-maze-${name}.png`);
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
  const film = (from, at) => page.evaluate(([f, a]) => { window.__filmCam = (c) => { c.position.set(f[0], f[1], f[2]); c.lookAt(a[0], a[1], a[2]); }; }, [from, at]);
  const unfilm = () => page.evaluate(() => { window.__filmCam = undefined; });
  let d = await dbg();
  const M = d.play.maze[0];
  check(!!M, "there's a hedge maze");
  const [ex, ey, ez] = M.entrance, [gx, gy, gz] = M.goal;
  // the path: every step between cells on the way is open, and it winds (not a straight line)
  const open = await page.evaluate((route) => {
    const g = window.__gameDebug();
    return route.slice(1).map(([x, z], i) => { const [px, pz] = route[i]; let ok = true; for (let k = 1; k < 10; k++) if (g.solidAt(px + (x - px) * k / 10, pz + (z - pz) * k / 10) !== null) ok = false; return ok; });
  }, M.route);
  check(open.every(Boolean), "the way to the bell is open all along", `${M.route.length} cells`);
  check(M.route.length >= 7, "it's a real maze: the path winds", `${M.route.length} cells`);
  const straight = await page.evaluate(([ax, az, bx, bz]) => { const g = window.__gameDebug(); for (let k = 1; k < 40; k++) if (g.solidAt(ax + (bx - ax) * k / 40, az + (bz - az) * k / 40) !== null) return true; return false; }, [ex, ez, gx, gz]);
  check(straight, "hedges block the straight way to the middle");
  // from above: the whole maze
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 3), [ex, ez]);
  await page.waitForTimeout(900);
  await film([gx + 2, gy + 14, gz + 12], [gx, gy, gz]);
  await hideToasts();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("above") });
  await unfilm();
  // walk in, then follow the path cell by cell (a short warp along each open step)
  const coins0 = d.coins;
  for (const [x, z] of M.route.slice(0, -1)) { await page.evaluate(([a, b]) => window.__gameDebug().warp(a, b, 3), [x, z]); await page.waitForTimeout(140); }
  d = await dbg();
  check(!d.play.maze[0].done, "the bell hasn't rung before the middle");
  await page.evaluate(([a, b]) => window.__gameDebug().warp(a + 0.5, b + 0.5, 3), [gx, gz]);
  await page.waitForTimeout(800);
  d = await dbg();
  check(d.play.maze[0].done && d.coins >= coins0 + 15, "reaching the middle rings the bell (+15 coins)", `coins ${coins0} → ${d.coins}`);
  await film([gx + 3.5, gy + 3.2, gz + 3.5], [gx, gy + 1.1, gz]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("bell") });
  await unfilm();

  // the duck pond
  const P = d.play.pond[0];
  const [cx, cy, cz] = P.centre;
  await page.evaluate(([x, z, r]) => window.__gameDebug().warp(x, z + r + 0.7, 3), [cx, cz, P.r]);
  await page.waitForTimeout(900);
  d = await dbg();
  check(d.use === "Feed the ducks", "at the pond's edge you can feed the ducks", `offered "${d.use}"`);
  const target = [cx, cz + P.r - 1.4];
  const far0 = Math.min(...d.play.pond[0].ducks.map(([x, z]) => Math.hypot(x - target[0], z - target[1])));
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(3500);
  d = await dbg();
  const far1 = Math.max(...d.play.pond[0].ducks.map(([x, z]) => Math.hypot(x - target[0], z - target[1])));
  check(d.play.pond[0].eating && d.play.pond[0].feeds === 1, "crumbs go in and the ducks start eating");
  check(far1 < 1.0, "all three ducks paddle over to the crumbs", `nearest was ${far0.toFixed(2)} m, now all within ${far1.toFixed(2)} m`);
  await film([cx + 3.2, cy + 2.2, cz + P.r + 2.6], [cx, cy + 0.3, cz + 0.8]);
  await hideToasts();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("ducks") });
  await unfilm();
  check(errors.length === 0, "no page errors", errors[0]);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-MAZE FAILED (${fails})` : "SHOTS-MAZE OK");
process.exit(fails ? 1 : 0);
