/**
 * playtest-fun.mjs — the "more fun" features: hats, dance, balloon float, Bubbly Beach.
 *   F1 hat choice persists and the kid wears it    F2 dance key runs without errors
 *   F3 Bubbly Beach (level 7) loads with its ocean  F4 a balloon lifts the kid well above the island
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) { console.error("no dist — build first"); process.exit(1); }

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    let raw = req.url.split("?")[0];
    if (raw === "/") raw = "/index.html";
    const file = resolve(DIST, "." + decodeURIComponent(raw));
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-gl=swiftshader"],
});

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/?level=6`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });

  await page.click("[data-action=dress]");
  await page.click("#hats .swatch:nth-child(2)");
  await page.click("#ov-dress [data-action=back]");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("game.profile") ?? "{}").hat);
  check("F1 crown chosen and saved", saved === 1, `hat=${saved}`);

  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  const lvl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
  check("F3 Bubbly Beach loads", lvl.includes("Bubbly Beach"), lvl);

  await page.keyboard.press("Digit7");
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(ROOT, "verification-shots/19-dance-crown.png") });
  check("F2 dance without errors", errors.length === 0, errors.join(" | "));

  // F4: the practice balloon sits on the first island at (3.5, 1.5, 2); spawn is (0, 0, 5)
  let maxY = 0;
  const holdUntil = async (key, pred, ms = 8000) => {
    await page.keyboard.down(key);
    const t = Date.now();
    while (Date.now() - t < ms) {
      const d = await page.evaluate(() => window.__gameDebug());
      maxY = Math.max(maxY, d.py);
      if (pred(d)) break;
      await page.waitForTimeout(60);
    }
    await page.keyboard.up(key);
  };
  await holdUntil("KeyW", (d) => d.pz < 2.9);
  await holdUntil("KeyD", (d) => d.px > 4.2 || d.py > 1);
  const t = Date.now();
  while (Date.now() - t < 2500) {
    const d = await page.evaluate(() => window.__gameDebug());
    maxY = Math.max(maxY, d.py);
    if (maxY > 4 && !globalThis.shot) { globalThis.shot = true; await page.screenshot({ path: join(ROOT, "verification-shots/20-balloon.png") }); }
    await page.waitForTimeout(100);
  }
  check("F4 balloon lifts the kid", maxY > 5, `max height ${maxY.toFixed(1)}`);
  check("Z1 zero page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `PLAYTEST-FUN FAILED (${failures})` : "PLAYTEST-FUN OK");
process.exit(failures ? 1 : 0);
