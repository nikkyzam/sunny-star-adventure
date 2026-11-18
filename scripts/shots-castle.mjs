/** shots-robes.mjs — close-ups of the Bible characters in their robes (verification-shots/96-robes-*.png). */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, process.env.DIST || "dist");
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
/** shots-castle.mjs — Sunny Castle on Adventure Island: views from outside and inside, and a walk up to the walls and the keep. */
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu"] });
const errors = [];
const shot = (n) => join(ROOT, `verification-shots/98-castle-${n}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  const level = await (async () => {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    return page.evaluate(() => { for (let i = 0; i < 40; i++) { const d = window.__gameDebug().levelDef(i); if (!d) break; if (d.name === "Adventure Island") return i; } return -1; });
  })();
  await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  const view = (name, pos, look) => page.evaluate(([p, l]) => {
    window.__filmCam = (cam, scene) => { cam.position.set(...p); cam.lookAt(...l); cam.fov = 55; };
  }, [pos, look]).then(() => page.waitForTimeout(500)).then(() => page.screenshot({ path: shot(name) }));
  await page.evaluate(() => window.__gameDebug().warp(-12, 22));
  await page.waitForTimeout(1500);
  await view("from-dock", [6, 7, 14], [-24, 4, 22]);
  await view("gate", [-6, 3.5, 17], [-19, 3.5, 22]);
  await view("aerial", [-2, 30, 44], [-27, 2, 22]);
  await view("courtyard", [-18.5, 2.2, 22], [-31, 3, 22]);
  await view("keep-top", [-27, 12.5, 27], [-30.5, 9, 22]);
  await page.evaluate(() => { window.__filmCam = undefined; });
  // play it: walk in through the gate, up the stairs, along the wall
  const dbg = () => page.evaluate(() => { const g = window.__gameDebug(); return [g.px.toFixed(1), g.py.toFixed(2), g.pz.toFixed(1)].join(","); });
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  // through the gate: from in front of it, walk -X (world). Find where the camera puts "forward": use warp + aim
  await page.evaluate(() => window.__gameDebug().warp(-13, 22));
  await page.waitForTimeout(800);
  console.log("before gate", await dbg());
  // stand at the foot of the wall stairs (local -S+T/2+0.65, z0 → world)
  await page.evaluate(() => window.__gameDebug().warp(-27 + 5.6, 22 + 6.65));
  await page.waitForTimeout(800);
  console.log("stairs foot", await dbg());
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    const before = await dbg();
    await hold(k, 500);
    console.log(k, before, "→", await dbg());
  }
  // straight onto the wall walk and the keep roof by warping, check the ground heights there
  for (const [n, x, z, near] of [["wall walk", -27, 30, 6], ["over the gate", -19, 22, 6], ["keep roof", -30.5, 22, 10], ["courtyard", -24, 22, 1]]) {
    await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y), [x, z, near]);
    await page.waitForTimeout(700);
    console.log(n, await dbg());
    if (n === "wall walk") { await hold("ArrowLeft", 900); console.log("  walked along the wall", await dbg()); }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
