/**
 * shots-nature.mjs — close-ups of the natural things made more real: palms on Palm Cay, the horses
 * by the castle, and the village church. Pictures: 99-nature-*.png. DIST=dist-x to test another build.
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
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9&time=day`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const film = async (name, kid, cam, look) => {
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 3), kid);
    await page.waitForTimeout(1200);
    await page.evaluate(([c, l]) => {
      window.__filmCam = (camera) => { camera.position.set(...c); camera.lookAt(...l); };
    }, [cam, look]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(ROOT, `verification-shots/99-nature-${name}.png`) });
    await page.evaluate(() => { window.__filmCam = undefined; });
  };
  await film("palms", [52, -27], [50, 3.2, -22], [54, 2.2, -30]);
  await film("lighthouse", [6, -74], [13, 5, -66], [6, 6, -78]);
  await film("lighthouse-door", [9, -74], [7.6, 1.6, -73.8], [6, 1.2, -76.6]);
  // the lighthouse star floats on the gallery, clear of the lantern room and the dome
  const ls = (await page.evaluate(() => window.__gameDebug().stars)).find((st) => Math.hypot(st.x - 6, st.z + 78) < 3 && st.y > 8);
  check(!!ls && Math.hypot(ls.x - 6, ls.z + 78) > 0.9 && ls.y < 10.45, "the lighthouse star is on the gallery, not inside the dome", ls ? `${ls.x},${ls.y},${ls.z}` : "none");
  // a kid dropped onto the middle of the top ends up on the gallery, outside the lantern room
  await page.evaluate(() => window.__gameDebug().warp(6.05, -78.05, 10.9));
  await page.waitForTimeout(1500);
  const top = await page.evaluate(() => { const d = window.__gameDebug(); return { x: d.px, y: d.py, z: d.pz }; });
  const off = Math.hypot(top.x - 6, top.z + 78);
  await page.evaluate(() => window.__gameDebug().warp(6.45, -78.1, 9.9));
  await page.waitForTimeout(1500);
  const top2 = await page.evaluate(() => { const d = window.__gameDebug(); return { x: d.px, y: d.py, z: d.pz }; });
  const off2 = Math.hypot(top2.x - 6, top2.z + 78);
  check(off2 > 0.75 && Math.abs(top2.y - 9.25) < 0.4, "a kid landing beside the lantern is nudged out onto the gallery", `off ${off2.toFixed(2)} y ${top2.y.toFixed(2)}`);
  check((off > 0.75 && Math.abs(top.y - 9.25) < 0.4) || top.y > 10.9, "a kid on top stands on the gallery or the dome, never inside the lantern", `off ${off.toFixed(2)} y ${top.y.toFixed(2)}`);
  await page.goto(`http://127.0.0.1:${port}/?level=9&time=dusk`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await film("lighthouse-dusk", [6, -74], [14, 6, -64], [6, 7, -78]);
  await film("church", [12, -29], [12, 2.6, -28], [12, 3.6, -37.5]);
  await film("horse", [-8, 31], [-7.5, 1.8, 32.5], [-11.5, 0.9, 28]);
  check(errors.length === 0, "no page errors", errors[0]);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-NATURE FAILED (${fails})` : "SHOTS-NATURE OK");
process.exit(fails ? 1 : 0);
