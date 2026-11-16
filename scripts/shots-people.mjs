/** shots-people.mjs — grown-up villagers (verification-shots/7x-*.png). */
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
const shots = [
  // [level, warp x, z, name]
  [11, 52.6, 9.5, "70-pastor-grace"],
  [11, 3, 47, "71-mayor-marigold"],
  [12, 3, -7.5, "72-noah"],
  [14, -22.5, -16.6, "73-king-saul"],
  [14, 12, -12.5, "74-goliath"],
  [9, -13, -9.5, "75-farmer-fern"],
];
try {
  for (const [lvl, x, z, name] of shots) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on("pageerror", (e) => errors.push(`${name}: ${e.stack || e}`));
    page.on("console", (m) => { if (/unavailable/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${port}/?level=${lvl}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [x, z]);
    await page.waitForTimeout(7000);
    await page.keyboard.press("KeyF"); // say hello: grown-ups clap
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(ROOT, `verification-shots/${name}.png`) });
    await page.close();
    console.log("shot", name);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
