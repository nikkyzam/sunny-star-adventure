/**
 * shots-stickers.mjs — the Sunny Castle sticker book, long messages that wrap, and the Read to me
 * button. Pictures: verification-shots/99-stickers-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-stickers-${name}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  const dbg = () => page.evaluate(() => window.__gameDebug());
  const fun = () => page.evaluate(() => window.__gameDebug().castleFun());
  const film = (at, off) => page.evaluate(([t, o]) => {
    window.__filmCam = (cam) => { cam.position.set(t[0] + o[0], t[1] + o[1], t[2] + o[2]); cam.lookAt(t[0], t[1], t[2]); cam.fov = 45; };
  }, [at, off]);
  const unfilm = () => page.evaluate(() => { window.__filmCam = undefined; });
  const toast = () => page.evaluate(() => document.body.innerText);

  // ── the daily surprise: the first play today paid a gift and saved the day ──
  const daily = await page.evaluate(() => JSON.parse(localStorage.getItem("game.daily") || "null"));
  check(daily && daily.streak === 1, "a daily surprise the first time today", JSON.stringify(daily));
  check(/Daily surprise! \+10 coins/.test(await toast()), "the gift message with a verse");

  // ── the sticker pill shows on Adventure Island (it has the castle) ──
  const pill = () => page.evaluate(() => { const e = document.getElementById("hud-castle"); return { shown: e.style.display !== "none", text: e.textContent }; });
  let p = await pill();
  check(p.shown && p.text === "🏰 0/20", "a castle sticker counter", JSON.stringify(p));
  check(await page.evaluate(() => document.getElementById("btn-read").style.display !== "none"), "a Read to me button");
  // ring the bell: first sticker
  const f = await fun();
  const bellAt = await page.evaluate(() => window.__gameDebug().castleFun().stones[0]);
  const bells = await page.evaluate(() => { const w = window.__gameDebug(); return w.castleFun(); });
  // the bell is near the stones; find "Ring the bell" by walking a little search round the first stone
  let rang = false;
  for (const [dx, dz] of [[0, -1], [1, -1], [-1, -1], [0, -2], [1, 0], [-1, 0], [0.5, -1.5], [-0.5, -1.5], [1.5, -0.5]]) {
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 1), [bellAt[0] + dx, bellAt[2] + dz]);
    await page.waitForTimeout(250);
    if ((await dbg()).use === "Ring the bell") { rang = true; break; }
  }
  check(rang, "found the bell");
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  p = await pill();
  check(p.text === "🏰 1/20", "a sticker for ringing the bell", p.text);
  await page.waitForTimeout(900);
  const gd = (await fun()).guide;
  check(!!gd && gd !== "bell", "the sparkle points at something new", `guide ${gd}`);
  check(/New castle sticker: Ring the bell/.test(await page.evaluate(() => document.getElementById("sticker-pop").textContent)), "the sticker pops up");
  // the long verse message wraps inside the screen
  const box = await page.evaluate(() => { const r = document.getElementById("toast").getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height, w: innerWidth }; });
  check(box.l >= 0 && box.r <= box.w && box.h > 40, "the long message wraps and fits", JSON.stringify(box));
  await page.screenshot({ path: shot("pop") });
  // open the book
  await page.click("#hud-castle");
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => [document.querySelectorAll("#sticker-grid .sticker").length, document.querySelectorAll("#sticker-grid .sticker.got").length]);
  check(n[0] === 20 && n[1] === 1, "the book has 20 stickers, 1 got", JSON.stringify(n));
  await page.screenshot({ path: shot("book") });
  await page.click("#sticker-close");
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.getElementById("sticker-book").style.display === "none"), "the book closes");
  // it's remembered on reload (and pretend the last visit was yesterday, two days running)
  await page.evaluate(() => {
    const d = new Date(); const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    localStorage.setItem("game.daily", JSON.stringify({ last: `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`, streak: 2 }));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  p = await pill();
  check(p.text === "🏰 1/20", "the sticker is remembered", p.text);
  await page.waitForTimeout(600);
  check(/3 days in a row/.test(await toast()) && /\+18 coins/.test(await toast()), "a streak bonus the next day", (await toast()).slice(0, 0));
  // Read to me toggles (and is remembered)
  await page.click("#btn-read");
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.getElementById("btn-read").classList.contains("on") && localStorage.getItem("game.readAloud") === "1"), "Read to me turns on");
  check(/Read to me|reading voice/.test(await toast()), "it says so");
  await page.click("#btn-read");
  check(await page.evaluate(() => !document.getElementById("btn-read").classList.contains("on")), "and off again");
  // ── the grown-ups' progress summary (behind the sum) ──
  const gp = page;
  await gp.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await gp.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
  await gp.click("[data-action=teach]");
  const q = await gp.evaluate(() => document.querySelector("#gate-question").textContent);
  const [a, b] = q.split("×").map((n) => Number(n.trim()));
  await gp.fill("#gate-answer", String(a * b));
  await gp.click("[data-action=gate-ok]");
  await gp.waitForTimeout(300);
  await gp.evaluate(() => { document.getElementById("teach-progress-box").open = true; });
  const prog = await gp.evaluate(() => document.getElementById("teach-progress").innerText);
  check(/Sunny Castle stickers: 1 of 20/.test(prog) && /Days in a row: 3/.test(prog) && /Worlds visited/.test(prog), "a progress summary for grown-ups", prog.replace(/\n/g, " | ").slice(0, 160));
  await gp.screenshot({ path: shot("progress") });
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-STICKERS FAILED (${fails})` : "SHOTS-STICKERS OK");
process.exit(fails ? 1 : 0);
