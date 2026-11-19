/**
 * shots-castle-more.mjs — the helter-skelter (get on from the wall, whoosh round, land in the hay) and
 * the fireworks over the gate. Pictures: verification-shots/99-more-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-more-${name}.png`);
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

  const f0 = await fun();
  const sl = f0.slides[0];
  check(!!sl && sl.len > 25, "a helter-skelter", sl ? `length ${sl.len.toFixed(1)} m, board ${sl.board.map((v) => v.toFixed(1))}, end ${sl.end.map((v) => v.toFixed(1))}` : "");
  const ground = await page.evaluate(([x, z]) => window.__gameDebug().groundAt(x, z), [sl.end[0], sl.end[2]]);
  check(ground !== null && Math.abs(sl.end[1] - ground - 0.1) < 0.6, "the slide runs out on dry ground", `chute end y ${sl.end[1].toFixed(2)}, ground ${ground?.toFixed(2)}`);
  // the whole thing from outside
  const [bx, by, bz] = sl.board;
  await film([sl.end[0] + 2, 3, (bz + sl.end[2]) / 2], [9, 5, -11]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("slide") });
  await unfilm();
  // up on the walkway by the deck
  await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y + 1), [bx, bz, by]);
  await page.waitForTimeout(700);
  let d = await dbg();
  check(Math.abs(d.py - by) < 0.8, "standing on the wall by the slide", `y ${d.py.toFixed(2)} vs ${by.toFixed(2)}`);
  check(d.mounts.length === 0, "not on anything yet");
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(150);
  let f = await fun();
  check(f.sliding !== null && f.seated, "E gets on the slide", `sliding ${f.sliding}`);
  // pictures on the way down, following the kid
  let lastY = 99, down = true, k = 0, shotsTaken = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    f = await fun();
    d = await dbg();
    if (f.sliding === null) break;
    if (d.py > lastY + 0.3) down = false;
    lastY = d.py;
    if (shotsTaken < 2 && f.sliding > 0.35 + shotsTaken * 0.3) {
      await page.evaluate(([x, y, z]) => {
        window.__filmCam = (cam) => { cam.position.set(x + 5, y + 2.5, z + 5); cam.lookAt(x, y + 0.6, z); cam.fov = 50; };
      }, [d.px, d.py, d.pz]);
      await page.waitForTimeout(60);
      await page.screenshot({ path: shot(`whee${shotsTaken}`) });
      await unfilm();
      shotsTaken++;
    }
    k++;
    await page.waitForTimeout(80);
  }
  const took = (Date.now() - t0) / 1000;
  check(f.sliding === null, "reaches the bottom", `${took.toFixed(1)} s`);
  check(down, "always going down");
  check(took > 3 && took < 15, "a good long whoosh, not too fast", `${took.toFixed(1)} s for ${sl.len.toFixed(0)} m`);
  await page.waitForTimeout(1200);
  d = await dbg();
  f = await fun();
  check(!d.kid.riding && !f.seated && d.mounts.length === 0, "off the slide, standing in the hay");
  check(Math.hypot(d.px - sl.end[0], d.pz - sl.end[2]) < 3 && Math.abs(d.py - ground) < 0.6, "landed by the hay pile", `at ${d.px.toFixed(1)}, ${d.py.toFixed(1)}, ${d.pz.toFixed(1)}`);
  check(/hay/i.test(await toast()), "a happy message at the bottom");
  await page.screenshot({ path: shot("hay") });

  // ── fireworks ──
  const [wx, wy, wz] = f.fireworks[0];
  await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z + 0.9, y + 1), [wx, wz, wy]);
  await page.waitForTimeout(700);
  d = await dbg();
  check(d.use === "Light the fireworks", "the fireworks crate is in reach", `use ${d.use}, y ${d.py.toFixed(2)}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(200);
  check(/heavens declare/.test(await toast()), "a fireworks message");
  const c = f0.thrones[0].seat;
  await film([c[0] + 3, 20, c[2]], [30, -12, 8]);
  await page.waitForTimeout(2300);
  await page.screenshot({ path: shot("fireworks1") });
  await page.waitForTimeout(800);
  await page.screenshot({ path: shot("fireworks2") });
  await unfilm();
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(200);
  check(/Wait for these/.test(await toast()), "can't light another lot until these finish");
  await page.waitForTimeout(5000);
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-MORE FAILED (${fails})` : "SHOTS-CASTLE-MORE OK");
process.exit(fails ? 1 : 0);
