/** shots-robes.mjs — close-ups of the Bible characters in their robes (verification-shots/96-robes-*.png). */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
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
// level, people to look at
const SETS = [
  [16, ["Mary", "Joseph", "Wise Man Caspar", "Wise Man Melchior", "Shepherd Eli", "Innkeeper Ezra"]],
  [12, ["Noah", "Shem"]],
  [14, ["King Saul", "Jesse", "Goliath"]],
  [13, ["Jonah", "Nadia of Nineveh"]],
];
const only = process.argv[2] ? Number(process.argv[2]) : null;
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  for (const [level, names] of SETS) {
    if (only !== null && only !== level) continue;
    await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    for (const name of names) {
      const n = await page.evaluate(([lv, n]) => window.__gameDebug().levelDef(lv).npcs.find((x) => x.name === n), [level, name]);
      // stand the kid a little way off so the villager turns to face the camera side
      await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [n.x + 0.5, n.z + 3.2]);
      await page.waitForTimeout(1500);
      await page.evaluate(([x, y, z, s]) => {
        window.__filmCam = (cam, scene) => {
          scene.traverse((o) => { if (o.isSprite && !o.userData.keepInPhoto) o.visible = false; });
          cam.position.set(x + 1.2 * s, y + 1.3 * s, z + 3.4 * s);
          cam.lookAt(x, y + 1.0 * s, z);
          cam.fov = 45;
        };
      }, [n.x, n.y, n.z, n.scale ?? 1]);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(ROOT, `verification-shots/96-robes-${name.replace(/\W+/g, "-").toLowerCase()}.png`) });
      await page.evaluate(() => { window.__filmCam = undefined; });
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
