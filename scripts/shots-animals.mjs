/** shots-animals.mjs — screenshots of the real animals, pets and city cars (verification-shots/5x-*.png). */
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
  // [level, warp x, z, name, wait ms]
  [9, -3, -9, "50-farm-animals"],
  [9, 61, 33, "51-east-isle-farm"],
  [12, -12, 10, "52-ark-herd"],
  [12, -20, 2, "53-ark-horses"],
  [11, 0, -14, "54-park-dogs"],
  [11, 0, 40, "55-city-cars"],
  [14, -19, 18, "56-elah-donkeys"],
];
try {
  for (const [lvl, x, z, name] of shots) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
    page.on("console", (m) => { if (m.type() === "warning" && /unavailable/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${port}/?level=${lvl}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [x, z]);
    await page.waitForTimeout(6000);
    const d = await page.evaluate(() => { const g = window.__gameDebug(); return { herds: g.herds, traffic: g.traffic?.length, pet: g.pet }; });
    console.log(name, JSON.stringify(d).slice(0, 400));
    await page.screenshot({ path: join(ROOT, `verification-shots/${name}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
