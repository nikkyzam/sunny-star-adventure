/**
 * shots-castle-bounce.mjs — the bouncy castle behind Sunny Castle (higher every bounce) and the
 * catapult that flings pom-poms at a raft on the sea. Pictures: verification-shots/99-bounce-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-bounce-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const dbg = () => page.evaluate(() => window.__gameDebug());
  const fun = () => page.evaluate(() => window.__gameDebug().castleFun());
  const film = (at, off) => page.evaluate(([t, o]) => {
    window.__filmCam = (cam) => { cam.position.set(t[0] + o[0], t[1] + o[1], t[2] + o[2]); cam.lookAt(t[0], t[1], t[2]); cam.fov = 45; };
  }, [at, off]);
  const unfilm = () => page.evaluate(() => { window.__filmCam = undefined; });
  const toast = () => page.evaluate(() => document.body.innerText);


  // ── the bouncy castle ──
  const f = await fun();
  check(f.bouncy.length === 1, "a bouncy castle", JSON.stringify(f.bouncy));
  const b = f.bouncy[0];
  const bx = (b.min[0] + b.max[0]) / 2, bz = (b.min[2] + b.max[2]) / 2, by = b.min[1];
  await film([bx, by + 1.5, bz], [0.5, 4.5, -10]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("castle") });
  await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y + 0.6), [bx, bz, by]);
  let top = 0, most = 0;
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(80);
    const [d, g] = await Promise.all([dbg(), fun()]);
    top = Math.max(top, d.py);
    most = Math.max(most, g.bounces);
    if (i === 30) { await film([bx, by + 2, bz], [0.5, 2.5, -7]); }
    if (i === 34) await page.screenshot({ path: shot("boing") });
  }
  await unfilm();
  check(most >= 5, "bounces again and again", `run ${most}`);
  check(/leaping/.test(await toast()) || most >= 10, "Acts 3:8");
  console.log("  top y", top);

  // ── the catapult ──
  let g = await fun();
  const c = g.catapults[0];
  check(!!c, "a catapult");
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [c.pos[0], c.pos[2]]);
  await page.waitForTimeout(800);
  let d = await dbg();
  check(d.use === "Fling a pom-pom", "a catapult to fire", `use ${d.use}`);
  // a quick miss first (fire when the raft is passing the middle, so the ball lands behind it)
  const off = async () => { const k = (await fun()).catapults[0]; return Math.hypot(k.raft[0] - k.aim[0], k.raft[2] - k.aim[2]); };
  for (let i = 0; i < 200 && (await off()) > 0.5; i++) await page.waitForTimeout(30);
  await page.keyboard.press("KeyE");
  await film([c.aim[0], 1.5, c.aim[2]], [(c.pos[0] - c.aim[0]) * 0.9, 6, (c.pos[2] - c.aim[2]) * 0.9 + 4]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("fling") });
  await page.waitForTimeout(1600);
  check((await fun()).catHits === 0, "fired at the middle, it misses");
  check(/Splash|close/.test(await toast()), "a splash and a tip");
  // now the trick: fire when the raft is at the end of its trip
  await page.waitForTimeout(800);
  let prev = await off(), hit = false, verse = false;
  for (let tries = 0; tries < 3 && !hit; tries++) {
    for (let i = 0; i < 300; i++) {
      await page.waitForTimeout(25);
      const o = await off();
      if (o > 3 && o < prev) break;
      prev = o;
    }
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("hit") });
    for (let i = 0; i < 20 && !hit; i++) {
      await page.waitForTimeout(100);
      hit = (await fun()).catHits > 0;
    }
    if (hit) verse = /Philippians 3:14/.test(await toast());
    await page.waitForTimeout(700);
  }
  await unfilm();
  await page.waitForTimeout(2500);
  const hits = (await fun()).catHits;
  check(hit && hits === 1, "fired at the right moment, it hits the raft (once)", `hits ${hits}`);
  check(verse, "Philippians 3:14");
  // the catapult from the side, with the kid stepped away
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x - 4, z + 4, 1), [c.pos[0], c.pos[2]]);
  await film([c.pos[0], 1.0, c.pos[2]], [-1.2, 2.2, 5.8]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("catapult") });
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-BOUNCE FAILED (${fails})` : "SHOTS-CASTLE-BOUNCE OK");
process.exit(fails ? 1 : 0);
