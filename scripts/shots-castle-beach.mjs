/**
 * shots-castle-beach.mjs — the fishing jetty on Castle Isle's beach (cast, wait, reel in) and the
 * sandcastle a wave washes away. Pictures: verification-shots/99-beach-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-beach-${name}.png`);
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

  // ── fishing ──
  let f = await fun();
  check(!!f.fishing && !!f.sandcastle, "a jetty and a sandcastle spot", JSON.stringify([f.fishing, f.sandcastle]));
  const j = f.fishing.pos;
  await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y + 0.5), [j[0], j[2], j[1]]);
  await page.waitForTimeout(800);
  let d = await dbg();
  check(Math.abs(d.py - j[1]) < 0.3, "standing on the jetty", `y ${d.py.toFixed(2)} vs ${j[1].toFixed(2)}`);
  check(d.use === "Cast the line", "a line to cast", `use ${d.use}`);
  const waitFor = async (st, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await fun()).fishing.state === st) return true; await page.waitForTimeout(60); } return false; };
  let caught = 0, verse = false;
  for (let n = 0; n < 2; n++) {
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(200);
    if (n === 0) {
      check(/Plop/.test(await toast()), "plop");
      await film([j[0], j[1] + 0.3, j[2] + 2.6], [4.2, 2.0, -0.6]);
    }
    const bit = await waitFor("bite", 7000);
    check(bit, `fish ${n + 1} bites`);
    if (n === 0) await page.screenshot({ path: shot("bite") });
    d = await dbg();
    check(d.use === "Reel it in!", "reel it in", `use ${d.use}`);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(900);
    if (n === 0) { await page.screenshot({ path: shot("catch") }); verse = /Matthew 4:19/.test(await toast()); }
    if (/caught/.test(await toast())) caught++;
    await waitFor("idle", 4000);
    await page.waitForTimeout(300);
  }
  check(caught === 2, "two fish caught", `${caught}`);
  check(verse, "Matthew 4:19");
  // one that gets away
  await page.keyboard.press("KeyE");
  await waitFor("bite", 7000);
  const away = await waitFor("idle", 4000);
  await page.waitForTimeout(200);
  check(away && /got away/.test(await toast()), "a fish that got away");
  await unfilm();

  // ── the sandcastle ──
  const s = f.sandcastle.pos;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 0.5), [s[0], s[2]]);
  await page.waitForTimeout(700);
  d = await dbg();
  check(d.use === "Build the sandcastle", "a sandcastle to build", `use ${d.use}`);
  for (let i = 0; i < 4; i++) { await page.keyboard.press("KeyE"); await page.waitForTimeout(300); }
  f = await fun();
  check(f.sandcastle.stage === 4, "all four parts", `stage ${f.sandcastle.stage}`);
  check(/here comes a wave/.test(await toast()), "a wave is coming");
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x - 2.5, z - 1, 0.5), [s[0], s[2]]);
  await film([s[0], s[1] + 0.5, s[2] + 1.4], [3.2, 2.0, -2.2]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("sandcastle") });
  await page.waitForTimeout(2400);
  await page.screenshot({ path: shot("wave") });
  f = await fun();
  check(f.sandcastle.washing, "the wave washes it");
  check(/rock/.test(await toast()), "Matthew 7:24-27");
  await page.waitForTimeout(3000);
  f = await fun();
  check(f.sandcastle.stage === 0 && !f.sandcastle.washing, "ready to build again");
  await unfilm();
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-BEACH FAILED (${fails})` : "SHOTS-CASTLE-BEACH OK");
process.exit(fails ? 1 : 0);
