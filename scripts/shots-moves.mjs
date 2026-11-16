/** shots-moves.mjs — the new movement: speed-matched steps, leaning, head turns (verification-shots/6x-*.png). */
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--use-gl=swiftshader"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForFunction(() => window.__gameDebug().gaits.length > 0, null, { timeout: 30000 });
  console.log("gaits", JSON.stringify(await page.evaluate(() => window.__gameDebug().gaits)));
  const mv = () => page.evaluate(() => window.__gameDebug().move);
  console.log("standing:", await mv());
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  console.log("running:", await mv());
  await page.screenshot({ path: join(ROOT, "verification-shots/60-run.png") });
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(ROOT, "verification-shots/61-lean-turn.png") });
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(120);
  console.log("stopping:", await mv());
  await page.waitForTimeout(900);
  console.log("stopped:", await mv());
  // next to Farmer Fern: heads turn to each other
  await page.evaluate(() => window.__gameDebug().warp(-11.6, -11.8));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(ROOT, "verification-shots/62-look-at.png") });
  // on the terraced hill: feet on two different steps
  console.log("feet on flat ground:", JSON.stringify(await page.evaluate(() => window.__gameDebug().feet)));
  // stand across a step edge, facing along it (feet on two levels): [left, right, hips lowered by]
  for (const dx of [5.05, 5.2, 5.35, 6.85, 7.0, 7.15]) {
    await page.evaluate((dx) => window.__gameDebug().warp(-12 + dx, -32.6), dx);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(90);
    await page.keyboard.up("KeyW");
    await page.evaluate((dx) => window.__gameDebug().warp(-12 + dx, -32), dx);
    await page.waitForTimeout(1200);
    console.log(`step edge at +${dx}:`, JSON.stringify(await page.evaluate(() => window.__gameDebug().feet)));
  }
  await page.screenshot({ path: join(ROOT, "verification-shots/63-feet-on-steps.png") });
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
