/**
 * shots-zipline.mjs — Adventure Island's zip line and splash pad: the tower's steps climb up, E on
 * the deck grabs the handle and whizzes the kid down the cable to the mat, the trolley rolls back up;
 * the splash pad's jets splash a kid standing in them, and the big button sends them all up high.
 * Pictures: 99-zip-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-zip-${name}.png`);
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
  const Z = d.play.zip.ziplines[0];
  check(!!Z && Z.ready, "there's a zip line, ready to ride");
  const [bx, by, bz] = Z.board;
  const gy = by - 4.5;

  // the tower and cable, from the side
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 20), [bx, bz]);
  await page.waitForTimeout(1200);
  d = await dbg();
  check(Math.abs(d.py - by) < 0.3, "a kid can stand on the deck", `y ${d.py.toFixed(2)} vs deck ${by.toFixed(2)}`);
  // the steps (measured from up on the deck, so they all count): each one higher than the last, all the way up to the deck
  const steps = await page.evaluate(([x, z]) => { const g = window.__gameDebug(); const out = []; for (let i = 13; i >= 0; i--) out.push(g.groundAt(x - 0.55 - 1.25 - 0.25 - i * 0.5, z)); return out; }, [bx, bz]);
  const climbs = steps.every((h, i) => i === 0 || h > steps[i - 1] + 0.2);
  check(climbs && steps[0] - gy < 0.6 && by - steps[13] < 0.5, "the tower's steps climb evenly to the deck", steps.map((h) => h?.toFixed(1)).join(" "));

  check(d.canMount === "zip", "on the deck you can grab the zip line", `canMount ${d.canMount}`);
  await film([bx + 6, gy + 5, bz + 11], [bx + 4, gy + 4, bz]);
  await hideToasts();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("tower") });
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(150);
  let lowest = 99, mid = false, t0 = Date.now();
  let prog = [];
  for (let k = 0; k < 60; k++) {
    await page.waitForTimeout(150);
    d = await dbg();
    if (d.play.zip.riding === null) break;
    prog.push(d.play.zip.riding);
    const g = await page.evaluate(([x, z]) => window.__gameDebug().groundAt(x, z), [d.px, d.pz]);
    lowest = Math.min(lowest, d.py - g);
    if (!mid && d.play.zip.riding > 0.4) {
      mid = true;
      await film([d.px + 1, d.py + 1.2, d.pz + 5.5], [d.px, d.py + 1.2, d.pz]);
      await hideToasts();
      await page.waitForTimeout(80);
      await page.screenshot({ path: shot("riding") });
      await unfilm();
    }
  }
  const secs = (Date.now() - t0) / 1000;
  check(prog.length > 5 && prog.every((u, i) => i === 0 || u >= prog[i - 1]), "E grabs the handle and the kid whizzes down the cable", `${prog.length} samples, ${secs.toFixed(1)} s`);
  check(lowest > 0.3, "the kid hangs clear of the ground all the way", `lowest ${lowest.toFixed(2)} m`);
  await page.waitForTimeout(800);
  d = await dbg();
  const end = Z.end;
  check(d.mounted === null && Math.abs(d.px - end[0]) < 3 && d.py - gy < 0.8, "they let go at the end and land on the mat", `at ${d.px.toFixed(1)}, ${d.py.toFixed(2)}; end ${end[0].toFixed(1)}`);
  check(!(await dbg()).play.zip.ziplines[0].ready, "the trolley stays down while it rolls back");
  await page.waitForTimeout(7000);
  check((await dbg()).play.zip.ziplines[0].ready, "the trolley rolls itself back up for the next go");

  // the splash pad
  const SP = d.play.splash.pads[0];
  const [cx, cy, cz] = SP.centre;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 3), [cx, cz]);
  await page.waitForTimeout(5000);
  d = await dbg();
  check(d.play.splash.wet >= 1, "standing in the middle fountain gets you splashed", `${d.play.splash.wet} splashes`);
  check(d.play.splash.pads[0].jets.some((j) => j[2] > 0.5), "the jets are shooting water");
  const [ux, , uz] = SP.button;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 0.9, z, 3), [ux, uz]);
  await page.waitForTimeout(900);
  d = await dbg();
  check(d.use === "Press the big button", "by the red button you can press it", `offered "${d.use}"`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(900);
  d = await dbg();
  const P2 = d.play.splash.pads[0];
  check(P2.boosted && P2.jets.every((j) => j[2] > 1.8), "the button sends every jet up high", P2.jets.map((j) => j[2].toFixed(1)).join(" "));
  await film([cx + 6, cy + 3, cz - 6.5], [cx, cy + 1.2, cz]);
  await hideToasts();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("splash") });
  await unfilm();
  check(errors.length === 0, "no page errors", errors[0]);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-ZIPLINE FAILED (${fails})` : "SHOTS-ZIPLINE OK");
process.exit(fails ? 1 : 0);
