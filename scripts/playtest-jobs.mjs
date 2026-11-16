/**
 * playtest-jobs.mjs — jobs on Adventure Island.
 *   J1 Postie Pat hands out three letters   J2 delivering them pays 15 coins
 *   J3 fires need spraying, then pay        J4 carrots, then back to Farmer Fern to be paid
 *   J5 another boss won't switch you; asking your boss twice quits
 *   J6 the bus job only counts in the car   J7 sky cargo by helicopter   J8 fishing by boat
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
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(String(e)); if (errors.length === 1) console.log(e.stack); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  const dbg = () => page.evaluate(() => { const d = window.__gameDebug(); return { ...d, placeCar: undefined, placeHeli: undefined, placeBoat: undefined, warp: undefined, setBank: undefined, groundAt: undefined }; });
  const warp = (x, z, y) => page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y ?? undefined), [x, z, y ?? null]);
  const talk = async () => { await page.keyboard.press("KeyF"); await page.waitForTimeout(250); };
  const said = () => page.evaluate(() => document.getElementById("dialog-text").textContent);
  const pill = () => page.evaluate(() => { const e = document.getElementById("hud-job"); return e.style.display === "none" ? "" : e.textContent; });
  /** Wait until the job state matches (the game ticks in its own time). */
  const until = async (pred, ms = 5000) => {
    const t = Date.now();
    let d = await dbg();
    while (!pred(d) && Date.now() - t < ms) { await page.waitForTimeout(60); d = await dbg(); }
    return d;
  };
  const leftCount = (d) => (d.job ? d.job.left.length : 0);

  await page.evaluate(() => window.__play("island"));
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  await page.waitForTimeout(500);

  // ── J1/J2 mail: Postie Pat at (11, -9) ──
  await warp(11, -7.6);
  await page.waitForTimeout(300);
  await talk();
  let d = await dbg();
  check("J1 Postie Pat gives the mail job with three letters", d.job?.id === "mail" && d.job.left.length === 3 && d.job.left.every((s) => s.npc), JSON.stringify(d.job));
  check("J1b the job shows on the HUD", (await pill()).startsWith("✉️"), await pill());
  await page.screenshot({ path: join(ROOT, "verification-shots/40-job-mail.png") });
  const bank0 = d.bank;
  for (const s of d.job.left) {
    const before = leftCount(await dbg());
    await warp(s.x + 1.3, s.z + 0.4, s.y + 0.5);
    await until((x) => leftCount(x) < before);
  }
  d = await until((x) => x.job === null);
  check("J2 delivering every letter pays 15 coins", d.job === null && d.bank === bank0 + 15 && d.jobsDone === 1,
    `bank ${bank0} → ${d.bank}, jobsDone ${d.jobsDone}`);

  // ── J3 fire: Chief Blaze at (8, -27) ──
  await warp(8, -25.6);
  await page.waitForTimeout(300);
  await talk();
  d = await dbg();
  check("J3a Chief Blaze reports three fires", d.job?.id === "fire" && d.job.left.length === 3 && d.job.left.every((s) => s.hold > 0), JSON.stringify(d.job?.left));
  const fire = d.job.left[0];
  await warp(fire.x, fire.z + 5.2);
  await page.waitForTimeout(500);
  check("J3b a fire doesn't go out at a glance", leftCount(await dbg()) === 3);
  await page.screenshot({ path: join(ROOT, "verification-shots/41-job-fire.png") });
  d = await until((x) => leftCount(x) === 2, 8000);
  check("J3c spraying for a few seconds puts it out", leftCount(d) === 2);
  for (const s of d.job.left) {
    const before = leftCount(await dbg());
    await warp(s.x, s.z + 5.2);
    await until((x) => leftCount(x) < before, 8000);
  }
  d = await until((x) => x.job === null);
  check("J3 every fire out pays", d.job === null && d.jobsDone === 2, `jobsDone ${d.jobsDone}`);

  // ── J4 carrots: Farmer Fern at (-13, -13) ──
  await warp(-13, -11.6);
  await page.waitForTimeout(300);
  await talk();
  d = await dbg();
  check("J4a Farmer Fern asks for six carrots", d.job?.id === "farm" && d.job.left.length === 6, JSON.stringify(d.job?.left.length));
  for (const s of d.job.left) {
    const before = leftCount(await dbg());
    await warp(s.x, s.z);
    await until((x) => leftCount(x) < before || x.job?.reporting);
  }
  d = await until((x) => x.job?.reporting === true);
  check("J4b with every carrot picked, it's back to Fern", d.job?.reporting === true && (await pill()).includes("Farmer Fern"), await pill());
  const bank1 = d.bank;
  await warp(-13, -11);
  d = await until((x) => x.job === null);
  check("J4 reporting back to Fern pays 10", d.job === null && d.bank === bank1 + 10, `bank ${bank1} → ${d.bank}`);

  // ── J5 busy and quitting ──
  await warp(11, -7.6);
  await page.waitForTimeout(300);
  await talk(); // mail again
  await warp(8, -25.6);
  await page.waitForTimeout(300);
  await talk(); // Chief Blaze: busy
  d = await dbg();
  check("J5a another boss won't switch your job", d.job?.id === "mail" && (await said()).includes("busy"), await said());
  await warp(11, -7.6);
  await page.waitForTimeout(300);
  await talk();
  await talk();
  d = await dbg();
  check("J5 asking your boss twice stops the job", d.job === null && (await pill()) === "", JSON.stringify(d.job));

  // ── J6 bus: Driver Dee at (-8.5, 12.5); the car is parked at (-6, 11) ──
  await warp(-9.8, 13.4);
  await page.waitForTimeout(300);
  await talk();
  d = await dbg();
  check("J6a Driver Dee hands out bus stops for the car", d.job?.id === "bus" && d.job.left.length === 4 && d.job.left.every((s) => s.ride === "car"), JSON.stringify(d.job?.left));
  const stops = d.job.left;
  await warp(stops[0].x, stops[0].z);
  await page.waitForTimeout(600);
  check("J6b walking to a bus stop doesn't count", leftCount(await dbg()) === 4);
  await warp(-4.3, 11.5);
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check("J6c hop in the car", (await dbg()).car?.occupied === true);
  for (const s of stops) {
    const before = leftCount(await dbg());
    await page.evaluate((s) => window.__gameDebug().placeCar(s.x, s.z, 0), s);
    await until((x) => leftCount(x) < before || x.job?.reporting);
  }
  d = await until((x) => x.job?.reporting === true);
  check("J6d after the last stop, back to Dee", d.job?.reporting === true);
  await page.screenshot({ path: join(ROOT, "verification-shots/42-job-bus.png") });
  await page.evaluate(() => window.__gameDebug().placeCar(-6.2, 12.5, 0));
  d = await until((x) => x.job === null);
  check("J6 driving back to Dee pays", d.job === null && d.jobsDone === 4, `jobsDone ${d.jobsDone}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);

  // ── J7 sky cargo: Cargo Cass at (10.5, 7.5); the helicopter is parked at (13, 10) ──
  await warp(10.5, 9);
  await page.waitForTimeout(300);
  await talk();
  d = await dbg();
  check("J7a Cargo Cass hands out two drop rings for the helicopter", d.job?.id === "cargo" && d.job.left.length === 2 && d.job.left.every((s) => s.ride === "heli"), JSON.stringify(d.job?.left));
  const drops = d.job.left;
  await warp(11, 11.5);
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check("J7b hop in the helicopter", (await dbg()).heli?.occupied === true);
  for (const s of drops) {
    const before = leftCount(await dbg());
    await page.evaluate((s) => window.__gameDebug().placeHeli(s.x, s.y, s.z, 0), s);
    await until((x) => leftCount(x) < before || x.job === null);
  }
  d = await until((x) => x.job === null);
  check("J7 flying through both rings pays", d.job === null && d.jobsDone === 5, `jobsDone ${d.jobsDone}`);

  // ── J8 fishing: Fisher Flo at (8, 14.2); the boat is moored at (9.4, 21) ──
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  await page.evaluate(() => window.__play("island"));
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  await warp(7, 13.2);
  await page.waitForTimeout(300);
  await talk();
  d = await dbg();
  check("J8a Fisher Flo sends you out for three fish", d.job?.id === "fish" && d.job.left.length === 3 && d.job.left.every((s) => s.ride === "boat"), JSON.stringify(d.job?.left));
  const fish = d.job.left;
  await warp(6.3, 20.6);
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check("J8b hop in the boat", (await dbg()).boat?.occupied === true);
  for (const s of fish) {
    const before = leftCount(await dbg());
    await page.evaluate((s) => window.__gameDebug().placeBoat(s.x, s.z, 0), s);
    await until((x) => leftCount(x) < before || x.job?.reporting);
  }
  await page.screenshot({ path: join(ROOT, "verification-shots/43-job-fish.png") });
  d = await until((x) => x.job?.reporting === true);
  check("J8c with three fish caught, it's back to Flo", d.job?.reporting === true);
  await page.evaluate(() => window.__gameDebug().placeBoat(9, 16.4, 0));
  d = await until((x) => x.job === null);
  check("J8 sailing back to Flo pays", d.job === null && d.jobsDone === 6, `jobsDone ${d.jobsDone} boat ${JSON.stringify(d.boat)}`);

  check("J9 no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures === 0 ? "PLAYTEST-JOBS OK" : `PLAYTEST-JOBS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
