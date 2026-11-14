/**
 * shots-expansion.mjs — capture screenshots of the expansion content (process file).
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) { console.error("no dist — build first"); process.exit(1); }
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

async function shot(level, name, setup) {
  await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  if (setup) await setup();
  await page.screenshot({ path: join(SHOTS, name) });
  console.log("shot", name);
}

// kid close-up: walk toward the camera a moment
await shot(0, "11-kid-closeup.png", async () => {
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyS");
  await page.waitForTimeout(200);
});
// bunny buddy island
await shot(0, "12-bunny-island.png", async () => {
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1400);
  await page.keyboard.up("KeyD");
});
// castle in the clouds
await shot(3, "13-castle.png", async () => {
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1200);
  await page.keyboard.up("KeyW");
});
// toy city overview (from spawn looking across the plaza)
await shot(4, "14-toycity.png", async () => {
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1000);
  await page.keyboard.up("KeyW");
});
// parachute tower + glide: ride the tower spring then hold Space
await shot(4, "15-parachute.png", async () => {
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(2600);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(1800);
  await page.keyboard.up("KeyW");
  await page.keyboard.down("Space"); // glide on the way down
  await page.waitForTimeout(1500);
  await page.keyboard.up("Space");
});

await browser.close();
server.close();
console.log("SHOTS OK");
