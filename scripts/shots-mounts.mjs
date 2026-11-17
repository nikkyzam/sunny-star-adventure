/** shots-mounts.mjs — riding a horse and the Ferris wheel (verification-shots/8x-*.png). */
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
  const start = async (level) => {
    await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    await page.waitForTimeout(4000);
  };
  const dbg = () => page.evaluate(() => { const g = window.__gameDebug(); return { move: g.move, mounts: g.mounts, kid: g.kid }; });
  // a horse on the island farm
  await start(9);
  const horse = await page.evaluate(() => window.__gameDebug().herds.find((h) => h.kind.startsWith("horse")));
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 1.2, z), [horse.x, horse.z]);
  await page.waitForTimeout(600);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(800);
  console.log("on horse", JSON.stringify(await dbg()));
  await page.screenshot({ path: join(ROOT, "verification-shots/83-horse-still.png") });
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2500);
  console.log("galloping", JSON.stringify(await dbg()));
  await page.screenshot({ path: join(ROOT, "verification-shots/84-horse-gallop.png") });
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(800);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(600);
  console.log("off horse", JSON.stringify(await dbg()));
  // the Ferris wheel in Sunshine City
  await start(11);
  await page.evaluate(() => window.__gameDebug().warp(61.8, 0));
  await page.waitForTimeout(600);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(800);
  console.log("ferris board", JSON.stringify(await dbg()));
  await page.screenshot({ path: join(ROOT, "verification-shots/85-ferris-board.png") });
  await page.waitForTimeout(12000);
  console.log("ferris up", JSON.stringify(await dbg()));
  await page.screenshot({ path: join(ROOT, "verification-shots/86-ferris-up.png") });
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(9000);
  console.log("ferris after down", JSON.stringify(await dbg()));
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
