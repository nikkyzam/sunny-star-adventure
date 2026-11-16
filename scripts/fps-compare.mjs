/**
 * fps-compare.mjs — frame rate and draw calls on the busiest places, with the CPU throttled to
 * mimic a school iPad or Chromebook. Compares two builds side by side.
 *
 *   node scripts/fps-compare.mjs <dist A> [<dist B>]
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const serve = async (dir) => {
  const DIST = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let raw = req.url.split("?")[0]; if (raw === "/") raw = "/index.html";
      const file = resolve(DIST, "." + decodeURIComponent(raw));
      if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }).end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, r));
  return server;
};
const PLACES = [[9, "Adventure Island", [-3, -9]], [11, "Sunshine City", [0, 40]], [12, "Noah's Ark", [-6, 8]], [14, "David and Goliath", [-12, 2]]];
const THROTTLE = Number(process.env.THROTTLE ?? 4);
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu"] });
const results = {};
for (const dir of process.argv.slice(2)) {
  const server = await serve(dir);
  const port = server.address().port;
  for (const [lvl, name, [x, z]] of PLACES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${port}/?level=${lvl}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [x, z]);
    await page.waitForTimeout(8000); // let every model arrive
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
    await page.keyboard.down("KeyW");
    const fps = await page.evaluate(() => new Promise((res) => {
      let frames = 0, worst = 0, last = performance.now();
      const t0 = last;
      const tick = () => {
        const now = performance.now();
        worst = Math.max(worst, now - last);
        last = now;
        frames++;
        if (now - t0 < 5000) requestAnimationFrame(tick); else res({ fps: frames / ((now - t0) / 1000), worst });
      };
      requestAnimationFrame(tick);
    }));
    await page.keyboard.up("KeyW");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const perf = await page.evaluate(() => window.__perf());
    (results[name] ??= []).push(`${fps.fps.toFixed(0)} fps (worst frame ${fps.worst.toFixed(0)} ms), ${perf.calls} draws`);
    await page.close();
  }
  server.close();
}
await browser.close();
console.log(`CPU slowed ${THROTTLE}×; columns: ${process.argv.slice(2).map((d) => d.split("/").slice(-2).join("/")).join("  |  ")}`);
for (const [name, cols] of Object.entries(results)) console.log(`${name.padEnd(18)} ${cols.join("  |  ")}`);
