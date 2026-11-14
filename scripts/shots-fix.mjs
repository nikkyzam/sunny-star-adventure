/**
 * shots-fix.mjs — retake co-op + parachute canopy shots (process file).
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

// co-op: wait out the spawn invulnerability blink so both kids are solid
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
await page.waitForTimeout(400);
await page.click('[data-action="play2"]');
await page.waitForTimeout(2600);
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(500);
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(300);
await page.screenshot({ path: join(SHOTS, "10-coop.png") });
console.log("shot 10-coop");

// parachute canopy: hold Space while falling off the plaza rim
await page.goto(`http://127.0.0.1:${port}/?level=4`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
await page.waitForTimeout(400);
await page.keyboard.press("Space");
await page.waitForTimeout(2400); // invuln out, then walk off the south rim
await page.keyboard.down("KeyS");
await page.keyboard.down("Space");
await page.waitForTimeout(2100);
await page.screenshot({ path: join(SHOTS, "09-glide.png") });
await page.keyboard.up("Space");
await page.keyboard.up("KeyS");
console.log("shot 09-glide");

await browser.close();
server.close();
console.log("SHOTS-FIX OK");
