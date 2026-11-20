/**
 * shots-castle-seasons.mjs — Sunny Castle dressed for each season: harvest thanks, a Christmas tree
 * to light, Easter eggs to find (?season=…). Pictures: verification-shots/99-season-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-season-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  const dbg = () => page.evaluate(() => window.__gameDebug());
  const fun = () => page.evaluate(() => window.__gameDebug().castleFun());
  const toast = () => page.evaluate(() => document.body.innerText);
  const film = (at, off) => page.evaluate(([t, o]) => {
    window.__filmCam = (cam) => { cam.position.set(t[0] + o[0], t[1] + o[1], t[2] + o[2]); cam.lookAt(t[0], t[1], t[2]); cam.fov = 45; };
  }, [at, off]);
  const unfilm = () => page.evaluate(() => { window.__filmCam = undefined; });
  const open = async (season) => {
    await page.goto(`http://127.0.0.1:${port}/?level=9&season=${season}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    await page.waitForTimeout(1500);
  };

  // ── harvest ──
  await open("harvest");
  let f = await fun();
  check(f.season?.kind === "harvest" && !!f.season.spot, "harvest dressing", JSON.stringify(f.season));
  let sp = f.season.spot;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [sp[0], sp[2]]);
  await page.waitForTimeout(600);
  let d = await dbg();
  check(d.use === "Give thanks", "a table to give thanks at", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check(/Psalm 107:1/.test(await toast()), "Psalm 107:1");
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 3, z - 4, 1), [sp[0], sp[2]]);
  await film([sp[0] + 1.5, 1.0, sp[2] + 1.2], [4.5, 2.6, -1.5]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("harvest") });
  await unfilm();

  // ── Christmas ──
  await open("christmas");
  f = await fun();
  check(f.season?.kind === "christmas", "Christmas dressing");
  sp = f.season.spot;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [sp[0], sp[2]]);
  await page.waitForTimeout(600);
  d = await dbg();
  check(d.use === "Light the tree", "a tree to light", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1200);
  f = await fun();
  check(f.season.lit && /Luke 2:11/.test(await toast()), "the tree is lit, Luke 2:11");
  // film the tree from the middle of the courtyard (the kid steps aside)
  await page.evaluate(() => window.__gameDebug().warp(-27, 22, 1));
  await film([sp[0] + 0.3, 1.5, sp[2] + 1.0], [-2.1, 1.2, -5.0]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("christmas") });
  await unfilm();

  // ── Easter ──
  await open("easter");
  f = await fun();
  check(f.season?.kind === "easter" && f.season.eggs.length === 5, "five Easter eggs");
  const e0 = f.season.eggs[0];
  await film([e0[0], e0[1], e0[2]], [2.2, 1.4, 1.6]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("egg") });
  await unfilm();
  for (const e of f.season.eggs) {
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [e[0], e[2]]);
    await page.waitForTimeout(500);
  }
  f = await fun();
  check(f.season.found === 5, "found all five", `found ${f.season.found}`);
  check(/John 11:25/.test(await toast()), "John 11:25");

  // ── no season: nothing extra ──
  await open("none");
  f = await fun();
  check(f.season?.kind === "none" && !f.season.spot, "plain castle out of season");
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-SEASONS FAILED (${fails})` : "SHOTS-CASTLE-SEASONS OK");
process.exit(fails ? 1 : 0);
