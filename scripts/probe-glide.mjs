/**
 * probe-glide.mjs — diagnose canopy vs kid positions during a glide (process file).
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const SHOTS = join(ROOT, "verification-shots");
mkdirSync(SHOTS, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    let raw = req.url.split("?")[0];
    if (raw === "/") raw = "/index.html";
    try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
    const file = resolve(DIST, "." + raw);
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-gl=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${port}/?level=4`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
await page.waitForTimeout(400);
await page.keyboard.press("Space");
await page.waitForTimeout(500);

const dbg = () => page.evaluate(() => window.__gameDebug());
await page.keyboard.down("KeyS");
await page.keyboard.down("Space");
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(600);
  const d = await dbg();
  console.log(`t=${(i + 1) * 0.6}s py=${d.py.toFixed(2)} pz=${d.pz.toFixed(2)} state=${d.state}`);
  await page.screenshot({ path: join(SHOTS, `probe-glide-${i}.png`) });
}
await page.keyboard.up("Space");
await page.keyboard.up("KeyS");
await browser.close();
server.close();
console.log("PROBE OK");
