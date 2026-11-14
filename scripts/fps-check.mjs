/**
 * fps-check.mjs — hardware-GPU frame rate + draw-call budget across the busiest levels
 * (process file, deleted before delivery).
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, sep, extname } from "node:path";
const DIST = resolve("dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    let raw = req.url.split("?")[0]; if (raw === "/") raw = "/index.html";
    const file = resolve(DIST, "." + raw);
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
// headless Chrome with hardware GL (Metal via ANGLE) — no swiftshader
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${port}/?level=0`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
const gl = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const g = c.getContext("webgl2") || c.getContext("webgl");
  const ext = g.getExtension("WEBGL_debug_renderer_info");
  return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
console.log("GPU renderer:", gl);

for (const level of [2, 3, 4]) {
  await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  await page.keyboard.down("KeyW"); // busiest moment: moving while everything animates
  const fps = await page.evaluate(() => new Promise((res) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else res(frames / 4); };
    requestAnimationFrame(tick);
  }));
  await page.keyboard.up("KeyW");
  const perf = await page.evaluate(() => window.__perf());
  console.log(`level ${level}: ${fps.toFixed(1)} fps, ${perf.calls} draw calls, ${perf.triangles} tris`);
}
await browser.close();
server.close();
