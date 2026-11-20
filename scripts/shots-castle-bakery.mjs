/**
 * shots-castle-bakery.mjs — the bread oven in Sunny Castle (bake a loaf, eat it) and the puppet
 * theatre that plays Noah's Ark. Pictures: verification-shots/99-bakery-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-bakery-${name}.png`);
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


  // ── the bread oven ──
  let f = await fun();
  check(!!f.oven && !!f.theatre, "an oven and a puppet theatre", JSON.stringify([f.oven, f.theatre]));
  const o = f.oven.pos;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [o[0], o[2]]);
  await page.waitForTimeout(800);
  let d = await dbg();
  check(d.use === "Bake bread", "bread to bake", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(500);
  f = await fun();
  check(f.oven.baking, "it's baking");
  check(/oven/.test(await toast()), "a baking message");
  d = await dbg();
  check(d.use === "Baking…", "says baking while it bakes", `use ${d.use}`);
  // film the oven (it faces +X here: the stand point is 1.8 in front of it), with the kid stepped aside
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 0.5, z + 1.6, 1), [o[0], o[2]]);
  await film([o[0] - 1.8, 1.3, o[2]], [3.6, 1.6, 1.4]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot("oven-baking") });
  await page.waitForTimeout(2600);
  f = await fun();
  check(f.oven.ready && !f.oven.baking, "the bread is ready");
  check(/bread is ready/.test(await toast()), "a ding when it's ready");
  await page.screenshot({ path: shot("oven-loaf") });
  await unfilm();
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [o[0], o[2]]);
  await page.waitForTimeout(600);
  d = await dbg();
  check(d.use === "Eat the bread", "bread to eat", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check(/bread of life/.test(await toast()), "John 6:35");
  f = await fun();
  check(!f.oven.ready, "the loaf is eaten");

  // ── the puppet theatre ──
  const t = f.theatre.pos;
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [t[0], t[2]]);
  await page.waitForTimeout(800);
  d = await dbg();
  check(d.use === "Start the puppet show", "a puppet show to start", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  // step aside and film the booth (1.6 behind the watch point, facing +X)
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 0.6, z + 1.8, 1), [t[0], t[2]]);
  await film([t[0] - 1.6, 1.75, t[2]], [3.4, 0.6, 0.5]);
  const shots = [[3, "ark"], [7.4, "animals"], [10.8, "dove"], [14.4, "rainbow"]];
  const seen = new Set();
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < 18500) {
    const sc = (await fun()).theatre.scene;
    if (sc >= 0) seen.add(sc);
    const el = (Date.now() - t0) / 1000;
    if (k < shots.length && el > shots[k][0]) { await page.screenshot({ path: shot(shots[k][1]) }); k++; }
    await page.waitForTimeout(150);
  }
  await unfilm();
  check(seen.size === 5, "five scenes", [...seen].join(","));
  check(/Hooray/.test(await toast()), "the end, hooray");

  // the second show is Jonah and the big fish
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [t[0], t[2]]);
  await page.waitForTimeout(700);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check((await fun()).theatre.story === 1, "the next show is Jonah");
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 0.6, z + 1.8, 1), [t[0], t[2]]);
  await film([t[0] - 1.6, 1.75, t[2]], [3.4, 0.6, 0.5]);
  const jshots = [[2.6, "jonah-storm"], [5.4, "jonah-gulp"], [10, "jonah-fish"], [13.6, "jonah-shore"]];
  const t1 = Date.now();
  let jk = 0, jonahSeen = false;
  while (Date.now() - t1 < 18000) {
    const el = (Date.now() - t1) / 1000;
    if (jk < jshots.length && el > jshots[jk][0]) { await page.screenshot({ path: shot(jshots[jk][1]) }); jk++; }
    if (/second chances/.test(await toast())) jonahSeen = true;
    await page.waitForTimeout(150);
  }
  await unfilm();
  check(jonahSeen, "Jonah 2:10");

  // and the third is Daniel and the lions
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [t[0], t[2]]);
  await page.waitForTimeout(700);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check((await fun()).theatre.story === 2, "the third show is Daniel");
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 0.6, z + 1.8, 1), [t[0], t[2]]);
  await film([t[0] - 1.6, 1.75, t[2]], [3.4, 0.6, 0.5]);
  const dshots = [[2.6, "daniel-pray"], [7.6, "daniel-den"], [11, "daniel-angel"], [14.2, "daniel-safe"]];
  const t2 = Date.now();
  let dk = 0, danSeen = false;
  while (Date.now() - t2 < 18000) {
    const el = (Date.now() - t2) / 1000;
    if (dk < dshots.length && el > dshots[dk][0]) { await page.screenshot({ path: shot(dshots[dk][1]) }); dk++; }
    if (/Daniel 6:22/.test(await toast())) danSeen = true;
    await page.waitForTimeout(150);
  }
  await unfilm();
  check(danSeen, "Daniel 6:22");

  // and the fourth is David the shepherd boy
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [t[0], t[2]]);
  await page.waitForTimeout(700);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check((await fun()).theatre.story === 3, "the fourth show is David");
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 0.6, z + 1.8, 1), [t[0], t[2]]);
  await film([t[0] - 1.6, 1.75, t[2]], [3.4, 0.6, 0.5]);
  const vshots = [[3.4, "david-sheep"], [6.5, "david-harp"], [10.6, "david-lamb"], [14.2, "david-crown"]];
  const t3 = Date.now();
  let vk = 0, davSeen = false;
  while (Date.now() - t3 < 18000) {
    const el = (Date.now() - t3) / 1000;
    if (vk < vshots.length && el > vshots[vk][0]) { await page.screenshot({ path: shot(vshots[vk][1]) }); vk++; }
    if (/Psalm 23:1/.test(await toast())) davSeen = true;
    await page.waitForTimeout(150);
  }
  await unfilm();
  check(davSeen, "Psalm 23:1");
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-BAKERY FAILED (${fails})` : "SHOTS-CASTLE-BAKERY OK");
process.exit(fails ? 1 : 0);
