/**
 * shots-playground.mjs — Adventure Island's playground can be played on: sit on a swing and swing
 * higher, whoosh down the slide, ride the roundabout holding a handle, and seesaw with Teddy; blow bubbles from the tub on the bench and pop them.
 * Pictures: 99-play-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-play-${name}.png`);
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
  const hopOff = async () => { await page.keyboard.down("ArrowDown"); await page.waitForTimeout(250); await page.keyboard.up("ArrowDown"); await page.waitForTimeout(600); };
  let d = await dbg();
  const P = d.play;
  check(P && P.swings.length === 2 && P.slides.length === 1 && P.roundabouts.length === 1 && P.seesaws.length === 1, "the playground has 2 swings, a slide, a roundabout and a seesaw", JSON.stringify(P && { s: P.swings.length, sl: P.slides.length }));
  const gy = P.seesaws[0].seat[1] - 0.25;

  // 1) a swing: sit, swing higher, hop off
  const sw = P.swings[0].pivot;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z + 0.5, 3), [sw[0], sw[2]]);
  await page.waitForTimeout(900);
  d = await dbg();
  check(d.canMount === "swing", "next to a playground swing you can sit on it", `canMount ${d.canMount}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  let zs = [];
  for (let k = 0; k < 40; k++) { await page.waitForTimeout(120); zs.push((await dbg()).pz); }
  d = await dbg();
  check(d.mounted === "swing", "E sits on the swing", `mounted ${d.mounted}`);
  const reach = Math.max(...zs) - Math.min(...zs);
  check(reach > 1.0, "the swing swings the kid back and forth", `${reach.toFixed(2)} m`);
  await film([sw[0] + 5, gy + 1.8, sw[2] - 2], [sw[0], gy + 1.1, sw[2] - 0.5]);
  await hideToasts();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("swing") });
  await unfilm();
  await hopOff();
  check((await dbg()).mounted === null, "a push of the move keys hops off the swing");

  // 2) the slide: up on the deck, E, whoosh to the bottom
  const sl = P.slides[0];
  await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y + 1), [sl.board[0], sl.board[2], sl.board[1]]);
  await page.waitForTimeout(900);
  d = await dbg();
  check(d.canMount === "slide", "on the slide's deck you can slide", `canMount ${d.canMount}, y ${d.py?.toFixed?.(2)} vs deck ${sl.board[1].toFixed(2)}`);
  await page.keyboard.press("KeyE");
  await film([sl.board[0] + 3, gy + 2.6, sl.board[2] + 6], [sl.board[0] + 2.5, gy + 1, sl.board[2]]);
  await page.waitForTimeout(450);
  await hideToasts();
  await page.screenshot({ path: shot("slide") });
  await unfilm();
  let wasSliding = (await dbg()).play.sliding;
  await page.waitForTimeout(3000);
  d = await dbg();
  check(wasSliding, "E sits on the slide and goes down");
  check(!d.play.sliding && d.mounted === null && d.px > sl.end[0] - 1 && Math.abs(d.py - gy) < 0.6, "the kid lands at the bottom on their feet", `at ${d.px.toFixed(1)}, ${d.py.toFixed(2)} (end ${sl.end[0].toFixed(1)})`);

  // 3) the roundabout: hold a handle, go round, hop off
  const rb = P.roundabouts[0].centre;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 2.0, z, 3), [rb[0], rb[2]]);
  await page.waitForTimeout(900);
  d = await dbg();
  check(d.canMount === "roundabout", "by the roundabout you can climb on", `canMount ${d.canMount}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(6000);
  d = await dbg();
  check(d.mounted === "roundabout" && d.play.roundabouts[0].spin > 1.2, "it spins up with the kid holding on", `spin ${d.play.roundabouts[0].spin.toFixed(2)}, mounted ${d.mounted}`);
  check(d.play.laps >= 1, "round and round: a whole lap", `${d.play.laps} laps`);
  check(Math.hypot(d.px - rb[0], d.pz - rb[2]) < 1.2 && d.py > rb[1] - 0.15, "the kid stands on the disc", `${Math.hypot(d.px - rb[0], d.pz - rb[2]).toFixed(2)} m out`);
  await film([rb[0] + 4.5, rb[1] + 2.2, rb[2] + 3.5], [rb[0], rb[1] + 0.7, rb[2]]);
  await hideToasts();
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("roundabout") });
  await unfilm();
  // a quick tap: let go and step off (holding the key on would walk the kid about afterwards)
  await page.keyboard.down("ArrowDown"); await page.waitForTimeout(60); await page.keyboard.up("ArrowDown");
  await page.waitForTimeout(900);
  d = await dbg();
  check(d.mounted === null && Math.hypot(d.px - rb[0], d.pz - rb[2]) > 1.3, "hopping off steps off the edge", `${Math.hypot(d.px - rb[0], d.pz - rb[2]).toFixed(2)} m out`);

  // 4) the seesaw with Teddy
  const ss = P.seesaws[0].seat;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x - 0.6, z, 3), [ss[0], ss[2]]);
  await page.waitForTimeout(900);
  d = await dbg();
  check(d.canMount === "seesaw", "by the seesaw you can sit on it", `canMount ${d.canMount}`);
  await page.keyboard.press("KeyE");
  let ys = [];
  for (let k = 0; k < 30; k++) { await page.waitForTimeout(110); ys.push((await dbg()).py); }
  d = await dbg();
  const lift = Math.max(...ys) - Math.min(...ys);
  check(d.mounted === "seesaw" && lift > 0.6, "up and down on the seesaw", `${lift.toFixed(2)} m`);
  check(d.play.ups >= 1, "each bump at the bottom counts", `${d.play.ups}`);
  await film([ss[0] + 1.4, gy + 1.5, ss[2] + 4.2], [ss[0] + 1.4, gy + 0.6, ss[2]]);
  await hideToasts();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("seesaw") });
  await unfilm();
  await hopOff();
  check((await dbg()).mounted === null, "hop off the seesaw");
  // 5) bubbles: E at the tub blows a stream; walking into one pops it
  const tub = d.play.bubbles.tubs[0];
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z - 0.9, 3), [tub[0], tub[2]]);
  await page.waitForTimeout(900);
  d = await dbg();
  check(d.use === "Blow bubbles", "at the bench's tub you can blow bubbles", `offered "${d.use}"`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(2300);
  d = await dbg();
  check(d.play.bubbles.floating >= 8, "a stream of bubbles floats away", `${d.play.bubbles.floating} floating`);
  {
    const at = d.play.bubbles.at, n = at.length || 1;
    const c = at.reduce((s, b) => [s[0] + b[0] / n, s[1] + b[1] / n, s[2] + b[2] / n], [0, 0, 0]);
    // from the side, so both the kid and the bubbles are in the picture
    const mx = (c[0] + d.px) / 2, mz = (c[2] + d.pz) / 2, dx = c[0] - d.px, dz = c[2] - d.pz, L = Math.hypot(dx, dz) || 1;
    await film([mx - (dz / L) * 4.2, d.py + 1.7, mz + (dx / L) * 4.2], [mx, d.py + 1.3, mz]);
  }
  await hideToasts();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("bubbles") });
  await unfilm();
  // run into the lowest one
  const low = (await dbg()).play.bubbles.at.sort((a, b) => a[1] - b[1])[0];
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 3), [low[0], low[2]]);
  await page.waitForTimeout(600);
  d = await dbg();
  check(d.play.bubbles.popped >= 1, "running into a bubble pops it", `${d.play.bubbles.popped} popped (lowest was ${(low[1] - d.py).toFixed(2)} m up)`);
  check(errors.length === 0, "no page errors", errors[0]);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-PLAYGROUND FAILED (${fails})` : "SHOTS-PLAYGROUND OK");
process.exit(fails ? 1 : 0);
