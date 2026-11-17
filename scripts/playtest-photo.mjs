/**
 * playtest-photo.mjs — photo mode: C (and the 📸 button on a tablet) counts down, swings the
 * camera to face the kid, frames a postcard, pauses the game; saving needs the grown-up answer.
 *   P1 C starts a countdown          P2 the postcard opens and the game pauses
 *   P3 the postcard is a real image  P4 a wrong answer is refused, nothing saved
 *   P5 the right answer saves a .jpg P6 a second photo goes in the album, saving needs no new question
 *   P7 Keep playing resumes          P8 tablet: tapping 📸 opens the postcard
 * Screenshots: verification-shots/90-photo-*.png
 */
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
let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fails++;
};
const errors = [];
const shot = (page, name) => page.screenshot({ path: join(ROOT, `verification-shots/90-photo-${name}.png`) });

async function start(ctxOpts, level) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...ctxOpts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.evaluate(() => document.querySelector("[data-action=play]").click());
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  return { ctx, page };
}
const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; }, sel);
const opened = (page) => page.waitForFunction(() => { const e = document.getElementById("ov-photo"); return e && e.style.display !== "none"; }, null, { timeout: 15000 }).then(() => true, () => false);

try {
  // ── keyboard, Adventure Island ──
  {
    const { ctx, page } = await start({ viewport: { width: 1280, height: 720 } }, 9);
    await page.keyboard.press("KeyC");
    await page.waitForTimeout(250);
    const count = await page.evaluate(() => document.querySelector(".photo-count")?.textContent);
    check("P1 C starts a countdown", ["3", "2"].includes(count), `showing ${count}`);
    await shot(page, "countdown");
    const ok = await opened(page);
    const state = await page.evaluate(() => window.__gameDebug().state);
    check("P2 postcard opens and the game pauses", ok && state === "paused", `state ${state}`);
    const img = await page.evaluate(async () => {
      const im = document.querySelector(".photo-card");
      await im.decode().catch(() => {});
      return { w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(im.src.length * 0.75 / 1024) };
    });
    check("P3 postcard is a real image", img.w === 1200 && img.h > 700 && img.kb > 30, JSON.stringify(img));
    await page.waitForTimeout(400);
    await shot(page, "postcard");
    // save: wrong answer first
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.click("[data-photo=save]");
    check("P4a save asks the grown-up question", await shown(page, ".photo-gate"));
    await page.fill(".photo-gate-in", "1");
    await page.click("[data-photo=gate-ok]");
    await page.waitForTimeout(300);
    const status = await page.textContent(".photo-status");
    check("P4 wrong answer refused, nothing saved", downloads === 0 && /grown-up/.test(status), status);
    const q = await page.textContent(".photo-gate-q");
    const [a, b] = q.split("×").map((n) => Number(n.trim()));
    const dl = page.waitForEvent("download", { timeout: 8000 });
    await page.fill(".photo-gate-in", String(a * b));
    await page.click("[data-photo=gate-ok]");
    const file = await dl.then((d) => d.suggestedFilename(), () => "");
    check("P5 right answer saves a .jpg", /^sunny-star-photo-.*\.jpg$/.test(file), file);
    await shot(page, "saved");
    // keep playing, then a second photo
    await page.click("[data-photo=close]");
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => window.__gameDebug().state);
    check("P7 Keep playing resumes", back === "playing" && !(await shown(page, "#ov-photo")), back);
    await page.keyboard.down("KeyW"); await page.waitForTimeout(900); await page.keyboard.up("KeyW");
    await page.keyboard.press("KeyC");
    await opened(page);
    const thumbs = await page.locator(".photo-thumb").count();
    const dl2 = page.waitForEvent("download", { timeout: 8000 });
    await page.click("[data-photo=save]");
    const file2 = await dl2.then((d) => d.suggestedFilename(), () => "");
    check("P6 album has 2 photos; saving again needs no new question", thumbs === 2 && !!file2 && !(await shown(page, ".photo-gate")), `thumbs ${thumbs}`);
    await shot(page, "album");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    check("P7b Escape closes the album and resumes", (await page.evaluate(() => window.__gameDebug().state)) === "playing");
    await ctx.close();
  }
  // ── tablet, Sunshine City, on a horse-free street ──
  {
    const { ctx, page } = await start({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true }, 11);
    check("P8a 📸 button shows in play", await shown(page, "#btn-photo"));
    await page.dispatchEvent("#btn-photo", "pointerdown");
    const ok = await opened(page);
    check("P8 tapping 📸 opens the postcard", ok);
    await page.waitForTimeout(400);
    await shot(page, "tablet");
    await ctx.close();
  }
  // ── phone ──
  {
    const { ctx, page } = await start({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 12);
    await page.dispatchEvent("#btn-photo", "pointerdown");
    const ok = await opened(page);
    const fits = await page.evaluate(async () => {
      const p = document.querySelector(".photo-panel").getBoundingClientRect();
      const im = document.querySelector(".photo-card"); await im.decode().catch(() => {});
      return { inside: p.left >= 0 && p.right <= innerWidth + 1 && p.bottom <= innerHeight + 1, tall: im.naturalHeight > im.naturalWidth };
    });
    check("P9 phone: tall postcard opens and fits the screen", ok && fits.inside && fits.tall, JSON.stringify(fits));
    await page.waitForTimeout(400);
    await shot(page, "phone");
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
check("no page errors", errors.length === 0, errors.join("\n"));
console.log(fails ? `PLAYTEST-PHOTO FAILED (${fails})` : "PLAYTEST-PHOTO OK");
