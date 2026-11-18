/**
 * shots-dragon.mjs — Sparky the dragon on Sunny Castle's keep, a ride round Adventure Island, and the
 * courtyard bell with its doves. Checks the ride starts, ends back on the keep roof, and the bell rings.
 * Pictures: verification-shots/99-dragon-*.png.  DIST=dist-x to test another build.
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
const shot = (name) => join(ROOT, `verification-shots/99-dragon-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const dbg = () => page.evaluate(() => window.__gameDebug());
  const d0 = await page.evaluate(() => window.__gameDebug().dragon());
  check(!!d0 && d0.state === "perch", "Sparky rests on the keep", JSON.stringify(d0 && d0.perch.map((v) => +v.toFixed(1))));
  const [px, py, pz] = d0.perch;

  // a film camera looking at a point from an offset
  const film = (target, off) => page.evaluate(([t, o]) => {
    window.__filmCam = (cam) => {
      const p = typeof t === "string" ? window.__gameDebug().dragon() : null;
      const at = p ? [p.x, p.y + 1, p.z] : t;
      cam.position.set(at[0] + o[0], at[1] + o[1], at[2] + o[2]);
      cam.lookAt(at[0], at[1], at[2]);
      cam.fov = 45;
    };
  }, [target, off]);

  // on the keep roof, beside him
  await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y), [px, pz - 1.6, py + 2]);
  await page.waitForTimeout(800);
  let k = (await dbg()).kid;
  check(Math.abs(k.y - py) < 0.4, "kid stands on the keep roof", `y ${k.y.toFixed(2)} vs ${py.toFixed(2)}`);
  await film([px, py + 1.2, pz], [7, 3.5, -5]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("perch") });
  await film([px, py + 1.4, pz], [3.2, 0.6, 0.6]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("face") });
  await page.evaluate(() => { window.__filmCam = undefined; });

  // hop on
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(600);
  let g = await dbg();
  check(g.mounts.includes("dragon") && g.kid.riding, "E climbs onto Sparky", JSON.stringify(g.mounts));
  await page.waitForTimeout(3500);
  const d1 = await page.evaluate(() => window.__gameDebug().dragon());
  check(d1.state === "tour" && d1.y > py + 4, "he takes off with the kid", `y ${d1.y.toFixed(1)}`);
  g = await dbg();
  check(Math.hypot(g.kid.x - d1.x, g.kid.z - d1.z) < 1.5, "the kid rides on his back", `${g.kid.x.toFixed(1)},${g.kid.z.toFixed(1)}`);
  await page.screenshot({ path: shot("ride-game-cam") });
  // chase shots along the way
  let n = 0;
  for (const off of [[-4, 2.5, -5], [5, 1, 3], [0, 6, -9]]) {
    await page.waitForTimeout(5000);
    await film("dragon", off);
    await page.waitForTimeout(250);
    await page.screenshot({ path: shot(`fly-${n++}`) });
    await page.evaluate(() => { window.__filmCam = undefined; });
  }
  // lowest he got above the ground below him, through the flight
  let low = Infinity, t0 = Date.now(), landed = false;
  while (Date.now() - t0 < 90000) {
    const s = await page.evaluate(() => {
      const d = window.__gameDebug().dragon();
      return { ...d, clear: window.__gameDebug().viewClear([d.x, d.y - 0.2, d.z], [d.x, d.y - 60, d.z]) };
    });
    if (s.state === "tour" && Math.hypot(s.x - px, s.z - pz) > 12) low = Math.min(low, s.clear ?? 99);
    if (s.state !== "tour") { landed = true; break; }
    await page.waitForTimeout(250);
  }
  check(landed, "Sparky lands again", `${((Date.now() - t0) / 1000).toFixed(0)}s more`);
  check(low > 6, "he flies well clear of everything below", `lowest ${low === Infinity ? "open sky" : low.toFixed(1) + " m"}`);
  await page.waitForTimeout(800);
  g = await dbg();
  check(!g.kid.riding && !g.mounts.includes("dragon") && Math.abs(g.kid.y - py) < 0.6, "the kid hops off on the keep roof", `y ${g.kid.y.toFixed(2)}`);

  // the bell
  const [bx, by, bz] = d0.bells[0];
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 3), [bx + 1.1, bz + 0.2]);
  await page.waitForTimeout(800);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1900);
  const toast = await page.evaluate(() => document.body.innerText);
  check(/Ding-dong/.test(toast), "E rings the bell");
  await film([px, py + 3, pz], [bx + 4 - px, by + 4 - py - 3, bz + 2 - pz]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("doves") });
  await page.evaluate(() => { window.__filmCam = undefined; });
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-DRAGON FAILED (${fails})` : "SHOTS-DRAGON OK");
process.exit(fails ? 1 : 0);
