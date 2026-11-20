/**
 * shots-sights.mjs — sightseeing photo spots on Adventure Island: stand on the footprints, the
 * camera frames the sight behind you, and a stamp goes in the passport. Pictures: 99-sight-*.png.
 * DIST=dist-x to test another build.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, process.env.DIST ?? "dist");
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
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu"] });
const errors = [];
let fails = 0;
const check = (ok, what, info = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${info ? " — " + info : ""}`); if (!ok) fails++; };
const shot = (name) => join(ROOT, `verification-shots/99-sight-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9&time=day`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const dbg = () => page.evaluate(() => window.__gameDebug());
  const toast = () => page.evaluate(() => document.body.innerText);
  let d = await dbg();
  check(d.sights.length === 6, "six sights to photograph", d.sights.map((s) => s.name).join(" · "));
  for (const [i, s] of d.sights.entries()) {
    await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y + 1), [s.x, s.z, s.y]);
    await page.waitForTimeout(700);
    const u = (await dbg()).use;
    if (u !== "Sightseeing photo") { check(false, `photo spot: ${s.name}`, `use ${u}`); continue; }
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(2900);
    const open = await page.evaluate(() => document.getElementById("ov-photo").style.display !== "none");
    check(open, `a postcard of ${s.name}`);
    // the postcard itself, big
    const src = await page.evaluate(() => document.querySelector("#ov-photo .photo-card").src);
    const b64 = src.split(",")[1];
    const { writeFile } = await import("node:fs/promises");
    await writeFile(shot(`card-${i}`).replace(".png", ".jpg"), Buffer.from(b64, "base64"));
    await page.click("[data-photo=close]");
    await page.waitForTimeout(500);
  }
  d = await dbg();
  check(d.sightsSeen.length === 6, "all six stamps in the passport", d.sightsSeen.join(", "));
  check(/every sight/.test(await toast()), "Psalm 24:1 for every sight");
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-SIGHTS FAILED (${fails})` : "SHOTS-SIGHTS OK");
process.exit(fails ? 1 : 0);
