/**
 * playtest-city.mjs — Sunshine City.
 *   C1 the title button opens the city, with its song      C2 the ground: city, beach, pier, rooftops
 *   C3 traffic drives around                               C4 a car waits for a kid in its lane
 *   C5 the big trampoline flings a kid above Sunshine Tower C6 the helicopter waits on the roof
 *   C7 a city job (pizza) pays                             C8 it draws in a sensible budget
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
  await page.goto(`http://127.0.0.1:${port}/?level=11`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  const dbg = () => page.evaluate(() => { const d = window.__gameDebug(); return { ...d, placeCar: undefined, placeHeli: undefined, placeBoat: undefined, warp: undefined, setBank: undefined, groundAt: undefined }; });
  const warp = (x, z) => page.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [x, z]);
  const until = async (pred, ms = 5000) => {
    const t = Date.now();
    let d = await dbg();
    while (!pred(d) && Date.now() - t < ms) { await page.waitForTimeout(60); d = await dbg(); }
    return d;
  };

  await page.click("[data-action=play]"); // (a real tap, so the music may start)
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  await page.mouse.click(400, 220); // (music starts on the first real tap)
  await page.waitForTimeout(2000);
  const lvl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
  let d = await dbg();
  check("C1 the city button opens Sunshine City with the city song", lvl.includes("Sunshine City") && d.song === "city", `${lvl} / ${d.song}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/50-city-start.png") });

  // C2: stand on the city, the beach, the pier and the rooftops
  const heightAt = async (x, z) => { await warp(x, z); await page.waitForTimeout(250); return (await dbg()).py; };
  const ground = {
    city: await heightAt(-6, 40), beach: await heightAt(0, 64), pier: await heightAt(0, 75),
    tower: await heightAt(24, -24), shop: await heightAt(28.5, 20.5),
  };
  check("C2 the city, beach, pier and rooftops are solid", Math.abs(ground.city) < 0.1 && Math.abs(ground.beach + 0.15) < 0.1 && Math.abs(ground.pier - 0.15) < 0.1
    && Math.abs(ground.tower - 40.25) < 0.2 && Math.abs(ground.shop - 12.25) < 0.2, JSON.stringify(ground));
  await page.screenshot({ path: join(ROOT, "verification-shots/51-city-rooftop.png") });

  // C3: traffic moves
  const t0 = d.traffic;
  await page.waitForTimeout(1500);
  const t1 = (await dbg()).traffic;
  const moved = t1.filter((c, i) => Math.hypot(c.x - t0[i].x, c.z - t0[i].z) > 1).length;
  check("C3 city traffic drives around", t0.length === 8 && moved >= 6, `${t0.length} cars, ${moved} moved`);

  // C4: stand in the lane of the inner ring (x = 10.5 heading +z) in front of a car, and it waits
  await warp(10.5, 6);
  await page.waitForTimeout(300);
  d = await dbg();
  // wait until some car on that lane has come up behind the kid
  d = await until((x) => x.traffic.some((c) => Math.abs(c.x - 10.5) < 0.6 && c.z < x.pz && x.pz - c.z < 9), 15000);
  await page.waitForTimeout(2500);
  d = await dbg();
  const behind = d.traffic.filter((c) => Math.abs(c.x - 10.5) < 0.6 && c.z < d.pz && d.pz - c.z < 12);
  check("C4 a car stops for a kid in its lane", behind.length > 0 && behind.every((c) => d.pz - c.z > 2.3 && c.v < 0.5),
    JSON.stringify(behind.map((c) => ({ gap: +(d.pz - c.z).toFixed(1), v: +c.v.toFixed(2) }))));
  await page.screenshot({ path: join(ROOT, "verification-shots/52-city-traffic.png") });

  // C5: the big trampoline by Sunshine Tower (24, -16.9)
  await warp(24, -16.9);
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    const p = (await dbg()).py;
    peak = Math.max(peak, p);
    if (i > 5 && p < peak - 3) break;
    await page.waitForTimeout(80);
  }
  check("C5 the big trampoline flings a kid above Sunshine Tower", peak > 41, `peak ${peak.toFixed(1)}`);

  // C6: the helicopter is parked on the roof
  d = await dbg();
  check("C6 the helicopter waits on top of Sunshine Tower", d.heli && Math.abs(d.heli.y - 40.25) < 0.4 && Math.hypot(d.heli.x - 24, d.heli.z + 24) < 1, JSON.stringify(d.heli));

  // C7: Chef Pepper's pizza job
  await warp(21.2, 1.4);
  await page.waitForTimeout(300);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  d = await dbg();
  check("C7a Chef Pepper hands out a pizza", d.job?.id === "pizza", JSON.stringify(d.job));
  const target = d.job.left[0];
  const bank0 = d.bank;
  await warp(target.x + 1.3, target.z + 0.4);
  d = await until((x) => x.job === null, 6000);
  check("C7 delivering it in the city pays", d.job === null && d.bank >= bank0 + 10, `bank ${bank0} → ${d.bank} (${target.npc})`);

  // C8: draw calls and triangles from the spawn, looking at the skyline
  await warp(0, 46);
  await page.waitForTimeout(1500);
  const perf = await page.evaluate(() => window.__perf());
  check("C8 the city draws within budget", perf.calls < 1100 && perf.triangles < 900000, JSON.stringify(perf));
  await page.screenshot({ path: join(ROOT, "verification-shots/53-city-skyline.png") });

  // ── Paradise Resort ──
  await page.goto(`http://127.0.0.1:${port}/?level=15`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  await page.click("[data-action=play]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  await page.mouse.click(400, 220);
  await page.waitForTimeout(2000);
  const rl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
  d = await dbg();
  check("R1 the Resort button opens Paradise Resort with the beach song", rl.includes("Paradise Resort") && d.song === "beach", `${rl} / ${d.song}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/54-resort.png") });
  const rg = { hotel: await heightAt(0, -30), tower: await heightAt(-12, -4), slideTop: await heightAt(-9.6, -4), slideEnd: await heightAt(-4.35, -4), pool: await heightAt(2, -4), dock: await heightAt(0, 34) };
  check("R2 hotel roof, slide tower, slide, pool deck and dock are solid", Math.abs(rg.hotel - 20.25) < 0.2 && Math.abs(rg.tower - 6.25) < 0.2 && Math.abs(rg.slideTop - 5.7) < 0.2
    && Math.abs(rg.slideEnd - 0.94) < 0.2 && Math.abs(rg.pool - 0.34) < 0.1 && Math.abs(rg.dock - 0.1) < 0.1, JSON.stringify(rg));
  // slide down: from the tower top, walk +x (D) and end up at the pool
  await warp(-11, -4);
  await page.keyboard.down("KeyD");
  d = await until((x) => x.px > -3, 15000);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(500);
  d = await dbg();
  check("R3 the water slide carries a kid down into the pool", d.px > -3.5 && d.py < 1, `x ${d.px.toFixed(1)} y ${d.py.toFixed(2)}`);
  d = await dbg();
  check("R4 the helicopter waits on the hotel roof", d.heli && Math.abs(d.heli.y - 20.25) < 0.4, JSON.stringify(d.heli));
  await warp(0, 8);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(ROOT, "verification-shots/55-resort-pool.png") });

  // ── Travel: places are linked by gates, and a verse opens each new one ──
  const ctx2 = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const tp = await ctx2.newPage();
  tp.on("pageerror", (e) => errors.push(String(e)));
  const tdbg = () => tp.evaluate(() => { const d = window.__gameDebug(); return { state: d.state, places: d.places, station: d.station, level: document.getElementById("hud-level").textContent }; });
  const open2 = async () => {
    await tp.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await tp.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  };
  const shown2 = (sel) => tp.evaluate((s) => getComputedStyle(document.querySelector(s)).display !== "none", sel);
  const toGate = async () => {
    const st = (await tdbg()).station;
    await tp.evaluate(([x, z]) => window.__gameDebug().warp(x + 8, z), [st.x, st.z]);
    await tp.waitForTimeout(300);
    await tp.evaluate(([x, z]) => window.__gameDebug().warp(x, z), [st.x, st.z]);
    await tp.waitForFunction(() => getComputedStyle(document.getElementById("ov-travel")).display !== "none", null, { timeout: 5000 }).catch(() => {});
  };
  await open2();
  check("T1 the title has no place buttons any more", (await tp.locator("[data-action=city], [data-action=island], [data-action=resort], [data-action=ark]").count()) === 0);
  await tp.click("[data-action=play]");
  await tp.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  let t = await tdbg();
  check("T2 Play starts on Adventure Island, the only place open", t.level.includes("Adventure Island") && t.places.join() === "Adventure Island", `${t.level} · ${t.places}`);
  await toGate();
  const rows = await tp.evaluate(() => [...document.querySelectorAll("#travel-list .book-verse")].map((b) => b.textContent));
  check("T3 the travel gate lists every place, locked until a verse", (await shown2("#ov-travel")) && rows.length === 8 && rows.some((r) => r.includes("Sunshine City") && r.includes("Say a verse"))
    && rows.some((r) => r.includes("Adventure Island") && r.includes("You are here")), rows.join(" | "));
  await tp.screenshot({ path: join(ROOT, "verification-shots/56-travel-gate.png") });
  await tp.click("#travel-list .book-verse:has-text('Sunshine City')");
  check("T4a a locked place asks for its verse", await shown2("#ov-verse"));
  await tp.click("[data-action=verse-ready]");
  await tp.fill("#verse-input", "i do not know it");
  await tp.click("[data-action=verse-check]");
  await tp.waitForTimeout(300);
  check("T4b a wrong verse does not open the way", (await tdbg()).level.includes("Adventure Island") && (await shown2("#ov-verse")));
  await tp.click("[data-action=verse-peek]");
  const tv = await tp.textContent("#verse-text");
  await tp.click("[data-action=verse-ready]");
  await tp.fill("#verse-input", tv.toLowerCase().replace(/[^a-z0-9 ]/g, ""));
  await tp.click("[data-action=verse-check]");
  await tp.waitForFunction(() => document.getElementById("hud-level").textContent.includes("Sunshine City"), null, { timeout: 10000 }).catch(() => {});
  t = await tdbg();
  check("T4 the right verse opens Sunshine City and takes you there", t.level.includes("Sunshine City") && t.places.includes("Sunshine City") && t.state === "playing", `${t.level} · ${t.places}`);
  await open2();
  await tp.click("[data-action=play]");
  await tp.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  check("T5 Play carries on from the last place", (await tdbg()).level.includes("Sunshine City"), (await tdbg()).level);
  await toGate();
  await tp.click("#travel-list .book-verse:has-text('Adventure Island')");
  await tp.waitForFunction(() => document.getElementById("hud-level").textContent.includes("Adventure Island"), null, { timeout: 10000 }).catch(() => {});
  check("T6 an open place needs no verse", (await tdbg()).level.includes("Adventure Island") && !(await shown2("#ov-verse")));
  await ctx2.close();

  check("C9 no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures === 0 ? "PLAYTEST-CITY OK" : `PLAYTEST-CITY FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
