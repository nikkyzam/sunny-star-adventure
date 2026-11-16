import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
const DIST = process.argv[2], OUT = process.argv[3];
const server = createServer(async (req, res) => {
  try { let raw = req.url.split("?")[0]; if (raw === "/") raw = "/index.html";
    const file = resolve(DIST, "." + decodeURIComponent(raw)); if (!file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { "content-type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[extname(file)] || "application/octet-stream" }); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); } });
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch({ args: ["--use-gl=swiftshader"] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } });
const errs = []; page.on("pageerror", (e) => errs.push(e.stack));
for (const [lvl, x, z, name] of JSON.parse(process.argv[4])) {
  await page.goto(`http://127.0.0.1:${server.address().port}/?level=${lvl}`);
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing");
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [x, z]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: join(OUT, name + ".png") });
  console.log(name, JSON.stringify(await page.evaluate(() => window.__perf())));
}
console.log("errors", errs.length, errs.join("|"));
await b.close(); server.close();
