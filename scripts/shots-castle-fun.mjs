/**
 * shots-castle-fun.mjs — the throne (sit, crown, stand up), the banquet table (eat a snack), and the
 * knight's ring course (ride a horse through all the rings). Pictures: verification-shots/99-fun-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-fun-${name}.png`);
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

  // ── the throne ──
  const f0 = await fun();
  const t = f0.thrones[0];
  const [sx, sy, sz] = t.seat;
  const fx = Math.sin(t.facing), fz = Math.cos(t.facing);
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 3), [sx + fx * 1.2, sz + fz * 1.2]);
  await page.waitForTimeout(700);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1500);
  let f = await fun();
  check(f.seated && (await dbg()).mounts.includes("throne"), "E sits on the throne");
  check(f.hat === 1, "a crown goes on", `hat ${f.hat}`);
  check(/King of kings/.test(await toast()), "a royal welcome");
  await film([sx, sy + 0.75, sz], [fx * 2.4 + fz * 0.8, 0.5, fz * 2.4 - fx * 0.8]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("throne") });
  await unfilm();
  // stand up by walking (toward the gate)
  const key = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? "KeyD" : "KeyA") : (fz > 0 ? "KeyS" : "KeyW");
  await page.keyboard.down(key);
  await page.waitForTimeout(500);
  await page.keyboard.up(key);
  await page.waitForTimeout(300);
  f = await fun();
  check(!f.seated && !(await dbg()).kid.riding && f.hat === 1, "walking stands up, the crown stays on");

  // ── the banquet: walk along the table, a snack is in reach ──
  await page.evaluate(() => window.__gameDebug().warp(-31.5, 18.6, 3));
  await page.waitForTimeout(600);
  await film([-28.4, 1.0, 16.6], [4.6, 1.6, 0.9]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("banquet") });
  await unfilm();
  await page.evaluate(() => window.__gameDebug().warp(-26.6, 17.55, 3));
  await page.waitForTimeout(1200);
  f = await fun();
  check(f.big > 1.05 || /giant|big|pizza/i.test(await toast()), "the pizza on the banquet table can be eaten", `scale ${f.big.toFixed(2)}`);
  await page.waitForTimeout(9000); // back to normal size

  // ── the knight's rings: mount a horse by the gate, ride to the start, gallop down the line ──
  const rings = f.rings;
  check(rings.length === 5, "five knight's rings", JSON.stringify(rings.map((r) => r.map((v) => +v.toFixed(1)))));
  await film([rings[2][0], rings[2][1] - 0.8, rings[2][2]], [-2, 2.5, 12]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("rings") });
  await unfilm();
  await page.evaluate(() => window.__gameDebug().warp(-12.5, 28.5));
  await page.waitForTimeout(800);
  let mounted = false;
  for (let tries = 0; tries < 8 && !mounted; tries++) {
    const h = (await fun()).horse;
    if (h) await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 1.2, z), [h[0], h[2]]);
    await page.waitForTimeout(300);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(500);
    mounted = (await dbg()).mounts.includes("animal");
  }
  check(mounted, "on a horse");
  // ride like a player: the move keys point the horse (W north, S south, A west, D east)
  const held = new Set();
  const hold = async (want) => {
    for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const rideTo = async (tx, tz, r, ms) => {
    const t0 = Date.now();
    let ok = false;
    while (Date.now() - t0 < ms) {
      const d = await dbg();
      const dx = tx - d.px, dz = tz - d.pz;
      if (Math.hypot(dx, dz) < r) { ok = true; break; }
      const want = [];
      if (Math.abs(dx) > 0.5 * Math.abs(dz)) want.push(dx > 0 ? "KeyD" : "KeyA");
      if (Math.abs(dz) > 0.5 * Math.abs(dx)) want.push(dz > 0 ? "KeyS" : "KeyW");
      await hold(want);
      await page.waitForTimeout(50);
    }
    await hold([]);
    return ok;
  };
  const z = rings[0][2];
  // like a kid: gallop west through the rings; any missed, come back round on the lane beside and try again
  let chestOff = [], runs = 0, lead = true;
  const bank0 = (await dbg()).bank;
  for (; runs < 4 && (await fun()).passed < 5; runs++) {
    if (runs === 0) lead = (await rideTo(-11, z - 2, 1.6, 30000)) && lead;
    else lead = (await rideTo(rings[0][0] - 3, z + 2.2, 1.6, 20000)) && (await rideTo(rings[4][0] + 4, z + 2.2, 1.6, 30000)) && lead;
    lead = (await rideTo(rings[4][0] + 6, z, 1.2, 20000)) && lead;
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) {
      const d = await dbg();
      if (d.px < rings[0][0] - 2.5) break;
      const off = d.pz - z;
      await hold(Math.abs(off) > 0.25 ? ["KeyA", off > 0 ? "KeyW" : "KeyS"] : ["KeyA"]);
      rings.forEach((r, i) => { if (Math.abs(d.px - r[0]) < 0.5) chestOff.push(`${runs}/${i}: up ${(d.py + 1.0 - r[1]).toFixed(2)} side ${(d.pz - r[2]).toFixed(2)}`); });
      await page.waitForTimeout(Math.abs(off) > 0.25 ? 60 : 40);
    }
    await hold([]);
  }
  console.log(`      (${runs} run(s) round the course${lead ? "" : ", some turns cut short"})`);
  await page.waitForTimeout(400);
  f = await fun();
  check(f.passed === 5, "galloped through all five rings", `passed ${f.passed}, rider chest vs ring middle ${JSON.stringify(chestOff)}`);
  const won = (await dbg()).bank - bank0;
  check(won >= 4 * 5 + 30, "coins for each ring and a prize for all of them", `+${won}`);
  await page.screenshot({ path: shot("knight") });
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-FUN FAILED (${fails})` : "SHOTS-CASTLE-FUN OK");
process.exit(fails ? 1 : 0);
