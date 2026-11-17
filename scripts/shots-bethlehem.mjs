/** shots-bethlehem.mjs — a look round Christmas in Bethlehem (verification-shots/95-bethlehem-*.png). */
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.screenshot({ path: join(ROOT, "verification-shots/95-bethlehem-title.png") });
  await page.evaluate(() => document.querySelector("[data-action=christmas]").click());
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log("level", await page.evaluate(() => window.__gameDebug().levelDef?.name ?? document.querySelector("#hud-level").textContent));
  await page.screenshot({ path: join(ROOT, "verification-shots/95-bethlehem-gate.png") });
  // (x, z, how long to walk "into the screen" afterwards, name)
  for (const [x, z, name] of [[-16, -15, "stable"], [20, 30, "field"], [0, -8, "square"]]) {
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [x, z]);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: join(ROOT, `verification-shots/95-bethlehem-${name}.png`) });
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
