/** check-heads.mjs — watches every head for 12 s on a few worlds and flags any that turn too far or keep turning. */
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
let bad = 0;
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  for (const level of [9, 11, 12, 14, 15]) {
    await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    // walk about so heads have things to look at
    const max = new Map(), flips = new Map(), last = new Map();
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < 12000) {
      if (k++ % 10 === 0) { await page.keyboard.up("KeyW"); await page.keyboard.up("KeyD"); await page.keyboard.down(k % 20 ? "KeyW" : "KeyD"); }
      const h = await page.evaluate(() => window.__gameDebug().heads());
      h.forEach(([n, y], i) => {
        const key = `${i}:${n}`;
        max.set(key, Math.max(max.get(key) ?? 0, Math.abs(y)));
        const l = last.get(key);
        if (l !== undefined && Math.abs(y - l) > 1.5) flips.set(key, (flips.get(key) ?? 0) + 1);
        last.set(key, y);
      });
      await page.waitForTimeout(100);
    }
    await page.keyboard.up("KeyW"); await page.keyboard.up("KeyD");
    const worst = [...max].filter(([, v]) => v > 1.35);
    const jumpy = [...flips];
    bad += worst.length + jumpy.length;
    console.log(`level ${level}: ${max.size} heads, too far: ${JSON.stringify(worst.map(([k, v]) => [k, +v.toFixed(2)]))}, jumps: ${JSON.stringify(jumpy)}`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
console.log(bad ? "HEADS BAD" : "HEADS OK");
