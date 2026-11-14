/**
 * playtest-island.mjs — Adventure Island: dress-up, pets, villagers and the boat.
 *   A1 dress-up screen saves skin and pet        A2 Adventure Island button loads the big island
 *   A3 the pet follows the kid                   A4 Talk button + F talks to Captain Coral (gift)
 *   A5 Hop in appears on the dock, E boards      A6 sailing moves the boat out to sea
 *   A7 the boat stops at land instead of driving onto it
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
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  const dbg = () => page.evaluate(() => { const d = window.__gameDebug(); return { ...d, placeCar: undefined, groundAt: undefined }; });
  const visible = (sel) => page.evaluate((s) => document.querySelector(s)?.style.display !== "none", sel);
  const hold = async (key, pred, ms = 8000) => {
    await page.keyboard.down(key);
    const t = Date.now();
    while (Date.now() - t < ms) {
      if (pred(await dbg())) break;
      await page.waitForTimeout(50);
    }
    await page.keyboard.up(key);
  };

  // dress-up
  await page.click("[data-action=dress]");
  await page.waitForTimeout(600);
  await page.click("#skins .swatch:nth-child(4)");
  await page.click("#hats .swatch:nth-child(4)");
  await page.click("#pets .swatch:nth-child(5)");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(ROOT, "verification-shots/23-dress-up.png") });
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem("game.profile") ?? "{}"));
  check("A1 dress-up saves skin, hat and pet", prof.skin === 3 && prof.hat === 3 && prof.pet === 4, JSON.stringify(prof));
  await page.click("#ov-dress [data-action=back]");

  await page.click("[data-action=island]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  const lvl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
  const d0 = await dbg();
  check("A2 Adventure Island loads with a boat and a car", lvl.includes("Adventure Island") && d0.boat !== null && d0.car !== null, lvl);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(ROOT, "verification-shots/24-island-start.png") });

  // walk to Captain Coral at (3.6, 15); spawn is (0, 12)
  await hold("KeyD", (d) => d.px > 2.4);
  await hold("KeyS", (d) => d.pz > 13.6);
  await page.waitForTimeout(700);
  const d1 = await dbg();
  check("A3 the pet follows the kid", d1.pet !== null && Math.hypot(d1.pet.x - d1.px, d1.pet.z - d1.pz) < 4, JSON.stringify(d1.pet));
  check("A4a Talk button appears near a villager", await visible("#btn-talk"));
  const coins = d1.coins;
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(400);
  const said = await page.evaluate(() => document.getElementById("dialog").classList.contains("show") && document.getElementById("dialog-name").textContent);
  const d2 = await dbg();
  check("A4 F talks to Captain Coral and gives a gift", said === "Captain Coral" && d2.npcsMet === 1 && d2.coins >= coins + 3, `said=${said} met=${d2.npcsMet} coins=${coins}→${d2.coins}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/25-villager.png") });

  // onto the dock (x 4.8–7.2, z 15–23); the boat is moored at (9.4, 21)
  await hold("KeyD", (d) => d.px > 6.3);
  await hold("KeyS", (d) => d.pz > 20.6);
  await page.waitForTimeout(300);
  const label = await page.textContent("#btn-car");
  check("A5a Hop in shows the boat", (await visible("#btn-car")) && label.includes("⛵"), label);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(400);
  check("A5 E boards the boat", (await dbg()).boat.occupied === true);

  await page.waitForTimeout(1500); // the camera swings in behind the boat
  const z0 = (await dbg()).boat.z;
  await hold("KeyW", (d) => d.boat.z > z0 + 12, 6000);
  const d3 = await dbg();
  check("A6 sailing moves the boat out to sea", d3.boat.z - z0 > 8 && d3.hearts === d0.hearts, `moved ${(d3.boat.z - z0).toFixed(1)}, hearts ${d3.hearts}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/26-sailing.png") });

  // turn around and sail straight at the island: the boat must stop at the shore
  await hold("KeyA", () => false, 2400);
  await hold("KeyW", () => false, 6000);
  const d4 = await dbg();
  const under = await page.evaluate(([x, z]) => window.__gameDebug().groundAt(x, z), [d4.boat.x, d4.boat.z]);
  check("A7 the boat stays on the water", under !== null && under < -0.9 && d4.boat.y < 0,
    `boat at (${d4.boat.x.toFixed(1)}, ${d4.boat.z.toFixed(1)}), ground under it ${under}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/27-boat-at-shore.png") });

  check("Z1 zero page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `PLAYTEST-ISLAND FAILED (${failures})` : "PLAYTEST-ISLAND OK");
process.exit(failures ? 1 : 0);
