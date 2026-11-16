/** shots-rides.mjs — the kid in the car, boat and helicopter (verification-shots/8x-*.png). */
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
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-gl=swiftshader"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  for (const [x, z, name, ride] of [[-4.3, 11.5, "80-in-car", "car"], [11, 11.5, "81-in-heli", "heli"], [6.3, 20.6, "82-in-boat", "boat"]]) {
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [x, z]);
    await page.waitForTimeout(500);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(1500);
    const d = await page.evaluate(() => { const g = window.__gameDebug(); return { move: g.move, car: g.car?.occupied, heli: g.heli?.occupied, boat: g.boat?.occupied }; });
    console.log(name, JSON.stringify(d));
    await page.screenshot({ path: join(ROOT, `verification-shots/${name}.png`) });
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(800);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
