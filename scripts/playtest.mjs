/**
 * playtest.mjs — deep interaction playtest (process file, deleted before delivery).
 * Drives the built game in a real browser and asserts the core loop end to end:
 * title → play → collect stars → jump → fall & lose heart & respawn → pause via Esc →
 * resume via button → restart via button → mute → busiest-scene perf counters.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) { console.error("no dist — build first"); process.exit(1); }
const SHOTS = join(ROOT, "verification-shots");
mkdirSync(SHOTS, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    let raw = req.url.split("?")[0];
    if (raw === "/") raw = "/index.html";
    try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
    const file = resolve(DIST, "." + raw);
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

async function newGamePage(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
  await page.waitForTimeout(600);
  return { page, errors };
}

const hudText = (page, id) => page.evaluate((i) => document.getElementById(i)?.textContent ?? "", id);
const overlayVisible = (page, id) =>
  page.evaluate((i) => document.getElementById(i)?.style.display !== "none", id);
const probe = (page) => page.evaluate(() => window.__gameProbe());

// ── Scenario A: core loop on level 1 ─────────────────────────────
{
  const { page, errors } = await newGamePage("/");

  await page.keyboard.press("Space"); // start
  await page.waitForTimeout(400);
  check("A1 Space starts the game", await overlayVisible(page, "ov-title") === false);

  const p0 = await probe(page);
  // walk forward through the star trail (stars at z=0 and z=-4 are dead ahead of spawn)
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1400);
  await page.keyboard.up("KeyW");
  const starsTxt = await hudText(page, "hud-stars");
  const scoreTxt = await hudText(page, "hud-score");
  check("A2 walking forward collects stars", /★ [12]\/10/.test(starsTxt), starsTxt);
  check("A3 score increases with stars", Number(scoreTxt) >= 100, scoreTxt);

  // jump: probe y must rise well above ground
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  const pJump = await probe(page);
  check("A4 jump lifts the bunny", pJump.y > p0.y + 0.4, `y=${pJump.y.toFixed(2)} vs ${p0.y.toFixed(2)}`);

  // fall off the side: hold A (left) just long enough to walk off the island once —
  // release before the respawn so the still-held key can't cause a second fall
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(1300);
  await page.keyboard.up("KeyA");
  await page.waitForTimeout(1600); // fall + respawn
  const hearts = await hudText(page, "hud-hearts");
  const pAfter = await probe(page);
  check("A5 falling costs a heart", hearts === "♥♥♡", hearts);
  check("A6 respawn back on the island", pAfter.y > -1 && Math.hypot(pAfter.x, pAfter.z - 5) < 8, JSON.stringify(pAfter));

  // pause via Esc, resume via button
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("A7 Esc pauses", await overlayVisible(page, "ov-pause"));
  await page.click('[data-action="resume"]');
  await page.waitForTimeout(200);
  check("A8 Resume button works", (await overlayVisible(page, "ov-pause")) === false);

  // pause again, restart level via button
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.click('[data-action="retry"]');
  await page.waitForTimeout(400);
  const hearts2 = await hudText(page, "hud-hearts");
  const stars2 = await hudText(page, "hud-stars");
  check("A9 Restart resets hearts", hearts2 === "♥♥♥", hearts2);
  check("A10 Restart resets stars", stars2 === "★ 0/10", stars2);

  // mute toggle via M and via button
  await page.keyboard.press("KeyM");
  await page.waitForTimeout(100);
  const mute1 = await hudText(page, "btn-mute");
  await page.click("#btn-mute");
  await page.waitForTimeout(100);
  const mute2 = await hudText(page, "btn-mute");
  check("A11 mute toggles (M + button)", mute1 === "🔇" && mute2 === "🔊", `${mute1}/${mute2}`);

  // quit to title, title shows again
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.click('[data-action="title"]');
  await page.waitForTimeout(200);
  check("A12 quit to title", await overlayVisible(page, "ov-title"));

  check("A13 zero console errors", errors.length === 0, errors[0] ?? "");
  await page.close();
}

// ── Scenario B: level 3 busiest scene + perf counters ────────────
{
  const { page, errors } = await newGamePage("/?level=2");
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  const lvl = await hudText(page, "hud-level");
  check("B1 ?level=2 starts Rainbow Peak", lvl.includes("Rainbow Peak"), lvl);

  // hop around a bit to animate everything, then measure + screenshot
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyW");
  await page.keyboard.press("Space");
  await page.waitForTimeout(600);
  const perf = await page.evaluate(() => window.__perf());
  check("B2 draw calls in budget (<300)", perf.calls < 300, `calls=${perf.calls} tris=${perf.triangles}`);
  await page.screenshot({ path: join(SHOTS, "04-level3-busy.png") });
  check("B3 zero console errors", errors.length === 0, errors[0] ?? "");
  await page.close();
}

// ── Scenario C: level 2 (moving platform / candy) screenshot ─────
{
  const { page, errors } = await newGamePage("/?level=1");
  await page.keyboard.press("Space");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, "05-level2.png") });
  check("C1 zero console errors", errors.length === 0, errors[0] ?? "");
  await page.close();
}

await browser.close();
server.close();
if (failures) { console.error(`PLAYTEST FAIL: ${failures} check(s) failed`); process.exit(1); }
console.log("PLAYTEST OK: all checks passed");
