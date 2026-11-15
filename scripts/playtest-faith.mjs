/**
 * playtest-faith.mjs — churches, kind deeds, scripture scrolls and Noah's Ark.
 *   F1 the Noah's Ark button opens the ark island   F2 the ramp leads up to the deck
 *   F3 Noah's job: six pairs of animals, then back to Noah for pay
 *   F4 a scroll shows its verse and pays once       F5 the village church can be walked into
 *   F6 Pastor Paul's food baskets pay               F7 Sunshine City has a chapel
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

  await page.click("[data-action=ark]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const lvl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
  check("F1 the Noah's Ark button opens the ark island", lvl.includes("Noah's Ark"), lvl);
  await page.screenshot({ path: join(ROOT, "verification-shots/70-ark.png") });

  // F2: walk up the ramp (it runs from z = -16 up to the deck at z = -26.5)
  await warp(0, -14.5);
  await page.waitForTimeout(300);
  await page.keyboard.down("KeyW");
  let d = await until((x) => x.pz < -28, 20000);
  await page.keyboard.up("KeyW");
  check("F2 the ramp leads up onto the deck", d.pz < -27 && Math.abs(d.py - 4.3) < 0.2, `at z ${d.pz.toFixed(1)}, y ${d.py.toFixed(2)}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/71-ark-deck.png") });

  // F3: Noah at (3, -11)
  await warp(3, -9.6);
  await page.waitForTimeout(300);
  await talk();
  d = await dbg();
  check("F3a Noah asks for six pairs of animals", d.job?.id === "ark" && d.job.left.length === 6, JSON.stringify(d.job?.left.length));
  await warp(d.job.left[0].x + 3, d.job.left[0].z + 3);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(ROOT, "verification-shots/72-ark-animals.png") });
  for (const s of d.job.left) {
    const before = leftCount(await dbg());
    await warp(s.x, s.z + 0.8);
    await until((x) => leftCount(x) < before || x.job?.reporting);
  }
  d = await until((x) => x.job?.reporting === true);
  const bank0 = d.bank;
  await warp(3, -9.2);
  d = await until((x) => x.job === null);
  check("F3 with every pair aboard, Noah pays 20", d.job === null && d.bank === bank0 + 20, `bank ${bank0} → ${d.bank}`);

  // F4: the scroll on the little hill
  const sc = (await page.evaluate(() => window.__gameDebug().scrolls)).find((s) => s.ref === "Psalm 136:1");
  const found0 = await page.evaluate(() => window.__gameDebug().scrollsFound);
  const bank1 = (await dbg()).bank;
  await warp(sc.x, sc.z);
  await page.waitForTimeout(600);
  const name = await page.evaluate(() => document.getElementById("dialog-name").textContent);
  const verse = await said();
  d = await dbg();
  check("F4 a scroll shows its verse and pays 5 coins", name.includes("Psalm 136:1") && verse.startsWith("O give thanks") && d.bank === bank1 + 5
    && (await page.evaluate(() => window.__gameDebug().scrollsFound)) === found0 + 1, `${name}: ${verse} · bank ${bank1} → ${d.bank}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/73-scroll.png") });

  // F5/F6: Adventure Island's church (12, -37.5; door at z = -34) and Pastor Paul (14.6, -32.4)
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  await page.click("[data-action=island]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  await warp(12, -28);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(ROOT, "verification-shots/74-church.png") });
  await warp(12, -33);
  await page.waitForTimeout(300);
  await page.keyboard.down("KeyW");
  d = await until((x) => x.pz < -35.6, 10000);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(500);
  d = await dbg();
  check("F5 the village church can be walked into", d.inside === true && d.pz < -34.5, `at z ${d.pz.toFixed(1)} inside ${d.inside}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/75-church-inside.png") });
  await warp(14.6, -31);
  await page.waitForTimeout(300);
  await talk();
  d = await dbg();
  check("F6a Pastor Paul hands out three food baskets", d.job?.id === "care" && d.job.left.length === 3 && d.job.left.every((s) => s.npc), JSON.stringify(d.job));
  const bank2 = d.bank;
  for (const s of d.job.left) {
    const before = leftCount(await dbg());
    await warp(s.x + 1.3, s.z + 0.4, s.y + 0.5);
    await until((x) => leftCount(x) < before);
  }
  d = await until((x) => x.job === null);
  check("F6 delivering the baskets pays 15", d.job === null && d.bank === bank2 + 15, `bank ${bank2} → ${d.bank}`);

  // F7: Sunshine Chapel
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  await page.click("[data-action=city]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  await warp(50, 0);
  await page.waitForTimeout(300);
  const roof = (await dbg()).py;
  await warp(50, 9);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(ROOT, "verification-shots/76-chapel.png") });
  check("F7 Sunshine City has a chapel with five scrolls around town", Math.abs(roof - 5.25) < 0.2 && (await page.evaluate(() => window.__gameDebug().scrolls.length)) === 5, `roof ${roof}`);

  check("F9 no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures === 0 ? "PLAYTEST-FAITH OK" : `PLAYTEST-FAITH FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
