/** shots-lambs.mjs — plays the Lost Lambs quest on Adventure Island, and pats/shakes things (verification-shots/87-*.png). */
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
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(4000);
  const dbg = () => page.evaluate(() => { const g = window.__gameDebug(); return { state: g.state, quest: g.quest, use: g.use, home: g.lambsHome, coins: g.coins, kid: g.kid }; });
  const dialog = () => page.evaluate(() => document.querySelector(".dialog.show")?.textContent ?? document.querySelector("#dialog")?.textContent ?? "");
  const toast = () => page.evaluate(() => document.querySelector("#toast, .toast")?.textContent ?? "");
  const warp = async (x, z) => { await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [x, z]); await page.waitForTimeout(500); };
  const E = async () => { await page.keyboard.press("KeyE"); await page.waitForTimeout(500); };
  // the shepherd
  await warp(4.5, -7.6);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(700);
  console.log("shepherd:", (await dialog()).slice(0, 160));
  await page.screenshot({ path: join(ROOT, "verification-shots/87-shepherd.png") });
  // Snowy: search bushes
  for (const [x, z] of [[-21.5, -15], [-27, -15.5], [-26.5, -20.5]]) {
    await warp(x + 1.2, z + 0.4);
    const d = await dbg();
    await E();
    console.log("bush", x, z, "use:", d.use, "→", await toast());
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(ROOT, "verification-shots/88-snowy-found.png") });
  console.log("after search", JSON.stringify(await dbg()));
  await warp(6.5, -8.5);
  await page.waitForTimeout(1500);
  console.log("snowy home?", JSON.stringify(await dbg()));
  // Pebble: the well
  await warp(-65, -67.6);
  await page.screenshot({ path: join(ROOT, "verification-shots/89-well.png") });
  for (let i = 0; i < 3; i++) { console.log("well use:", (await dbg()).use); await E(); await page.waitForTimeout(700); }
  await page.screenshot({ path: join(ROOT, "verification-shots/90-pebble.png") });
  console.log("after well", JSON.stringify(await dbg()));
  await warp(6.5, -8.5);
  await page.waitForTimeout(1500);
  console.log("pebble home?", JSON.stringify(await dbg()));
  // Clover: on the blue roof
  await warp(23.3, -17.2);
  console.log("roof", JSON.stringify(await dbg()));
  await page.screenshot({ path: join(ROOT, "verification-shots/91-clover-roof.png") });
  await E();
  await warp(6.5, -8.5);
  await page.waitForTimeout(2500);
  console.log("all home?", JSON.stringify(await dbg()), (await dialog()).slice(0, 120));
  await page.screenshot({ path: join(ROOT, "verification-shots/92-pen.png") });
  // scenery: pat an alpaca by Fern's field, shake a tree
  const a = await page.evaluate(() => window.__gameDebug().herds.find((h) => h.kind === "alpaca" || h.kind === "cow"));
  await warp(a.x + 1.1, a.z);
  console.log("near animal use:", (await dbg()).use);
  await page.evaluate(() => document.querySelector(".dialog.show") && document.querySelector(".dialog.show").classList.remove("show"));
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
