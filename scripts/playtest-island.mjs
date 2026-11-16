/**
 * playtest-island.mjs — Adventure Island: dress-up, pets, villagers and the boat.
 *   A1 dress-up screen saves skin and pet        A2 Adventure Island button loads the big island
 *   A3 the pet follows the kid                   A4 Talk button + F talks to Captain Coral (gift)
 *   A5 Hop in appears on the dock, E boards      A6 sailing moves the boat out to sea
 *   A7 the boat stops at land instead of driving onto it
 *   A10 the kid walks into a village house; it opens up, and the star inside can be collected
 *   A12 the mansion is boarded up until bought with coins   A13 pizza delivery pays coins
 *   A11 the sailboat's cannon sinks a pirate ship
 *   A9 the car drives over the causeway to Pine Island
 *   A8 the causeways, Coconut Cove, Pine Island, Sunset Island and Shell Islet are land
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
  const dbg = () => page.evaluate(() => { const d = window.__gameDebug(); return { ...d, placeCar: undefined, placeHeli: undefined, placeBoat: undefined, warp: undefined, setBank: undefined, groundAt: undefined }; });
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

  // walk in small self-correcting steps (W/A/S/D at the default camera = -z/-x/+z/+x), so a busy
  // machine can't make the kid overshoot
  const walkTo = async (tx, tz, r = 0.7, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const d = await dbg();
      const dx = tx - d.px, dz = tz - d.pz;
      const dist = Math.hypot(dx, dz);
      if (dist < r) return true;
      const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "KeyD" : "KeyA") : (dz > 0 ? "KeyS" : "KeyW");
      await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(260, Math.max(50, dist * 55)));
      await page.keyboard.up(key);
      await page.waitForTimeout(40);
    }
    return false;
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

  await page.evaluate(() => window.__play("island"));
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  const lvl = await page.evaluate(() => document.getElementById("hud-level")?.textContent ?? "");
  const d0 = await dbg();
  check("A2 Adventure Island loads with a boat and a car", lvl.includes("Adventure Island") && d0.boat !== null && d0.car !== null, lvl);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(ROOT, "verification-shots/24-island-start.png") });

  // walk to Captain Coral at (3.6, 15); spawn is (0, 12)
  await walkTo(2.6, 13.8, 0.8);
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
  await walkTo(6.1, 16.4, 0.5);
  await walkTo(6.3, 20.6, 0.5);
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

  // sea battle: a pirate ship circles (0, 50) with radius 10; park facing it and fire the cannon
  check("A11a three pirate ships are sailing", (await dbg()).shipsAfloat === 3);
  await page.evaluate(() => window.__gameDebug().placeBoat(0, 30, 0));
  await page.waitForTimeout(600);
  for (let i = 0; i < 30 && (await dbg()).shipsSunk < 1; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(650);
  }
  const battle = await dbg();
  check("A11 the cannon sinks a pirate ship", battle.shipsSunk >= 1 && battle.shipsAfloat === 2, `sunk=${battle.shipsSunk} afloat=${battle.shipsAfloat} coins=${battle.coins}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/36-ship-battle.png") });
  await page.evaluate(() => window.__gameDebug().placeBoat(11, 30, Math.PI));
  await page.waitForTimeout(400);

  // turn around and sail straight at the island: the boat must stop at the shore
  await hold("KeyW", () => false, 6000);
  const d4 = await dbg();
  const under = await page.evaluate(([x, z]) => window.__gameDebug().groundAt(x, z), [d4.boat.x, d4.boat.z]);
  check("A7 the boat stays on the water", under !== null && under < -0.9 && d4.boat.y < 0,
    `boat at (${d4.boat.x.toFixed(1)}, ${d4.boat.z.toFixed(1)}), ground under it ${under}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/27-boat-at-shore.png") });

  // the bigger world: the causeway and Coconut Cove are solid ground, Shell Islet exists
  const land = await page.evaluate(() => {
    const g = window.__gameDebug().groundAt;
    return [g(30, -50), g(28.2, -48.2), g(46, -66), g(-38, 36), g(-40.6, -44.4), g(-34.3, -40.5), g(-47, -48.2), g(-70, -62), g(62, 22)];
  });
  check("A8 causeways and the new islands are land", land.every((y) => y !== null && y >= 0), JSON.stringify(land));
  // A10: walk into the pink village house (17, -12; its door faces +z at z = -10)
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  await page.evaluate(() => window.__play("island"));
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  const stars0 = (await dbg()).stars.length;
  await walkTo(9, 6, 1);
  await walkTo(17, -4, 1);
  // line up with the doorway (1.8 m wide) before walking in
  if (!(await walkTo(17, -8.4, 0.2, 12000))) {
    // a slow machine can leave the step-walker short of the doorway: stand in front of it instead
    await page.evaluate(() => window.__gameDebug().warp(17, -8.4));
    await page.waitForTimeout(300);
  }
  check("A10a outside the house counts as outside", (await dbg()).inside === false);
  await walkTo(17, -11.6, 0.6);
  await page.waitForTimeout(500);
  const dIn = await dbg();
  check("A10 the kid walks through the door into the house", dIn.inside === true && Math.abs(dIn.px - 17) < 1.5, `at (${dIn.px.toFixed(1)}, ${dIn.pz.toFixed(1)})`);
  check("A10b the star inside the house is collected", dIn.stars.length === stars0 - 1, `${stars0} → ${dIn.stars.length}`);
  await page.screenshot({ path: join(ROOT, "verification-shots/29-inside-house.png") });
  await page.keyboard.press("Space");
  await page.waitForTimeout(450);
  check("A10c jumping indoors stays under the ceiling", (await dbg()).inside === true);
  await walkTo(17, -8.4, 0.6);
  await walkTo(9, 6, 1.2);

  // A12: the mansion at (-14, 2) is for sale; Agent Goldie stands at (-9, 7)
  await page.evaluate(() => window.__gameDebug().warp(-14, 6.6));
  await walkTo(-14, 3.5, 0.5, 4000);
  check("A12a the mansion door is boarded up until bought", (await dbg()).inside === false);
  await page.evaluate(() => window.__gameDebug().setBank(5));
  await page.evaluate(() => window.__gameDebug().warp(-9, 8.6));
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  const poor = await dbg();
  check("A12b not enough coins: no sale", !poor.owned.includes("mansion"), await page.textContent("#dialog-text"));
  await page.evaluate(() => window.__gameDebug().setBank(100));
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  const rich = await dbg();
  check("A12 buying the mansion with coins", rich.owned.includes("mansion") && rich.bank === 40, `bank=${rich.bank} owned=${rich.owned}`);
  await page.evaluate(() => window.__gameDebug().warp(-14, 6.6));
  await walkTo(-14, 3.2, 0.6, 8000);
  await page.waitForTimeout(400);
  check("A12c the owner can walk into the mansion", (await dbg()).inside === true);
  await page.screenshot({ path: join(ROOT, "verification-shots/37-mansion.png") });

  // A13: pizza delivery from Chef Chili at (45.5, -61)
  await page.evaluate(() => window.__gameDebug().warp(46.6, -60));
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  const order = await dbg();
  check("A13a Chef Chili gives a pizza delivery job", order.jobTarget !== null, JSON.stringify(order.jobTarget));
  const bank0 = order.bank;
  await page.evaluate((t) => window.__gameDebug().warp(t.x + 1.2, t.z + 0.6), order.jobTarget);
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  const paid = await dbg();
  check("A13 delivering the pizza pays coins", paid.jobTarget === null && paid.bank >= bank0 + 10, `bank ${bank0} → ${paid.bank}`);
  await page.evaluate(() => window.__gameDebug().warp(9, 6));

  // A9: drive the car over the west causeway to Pine Island
  await walkTo(-4.3, 11.5, 0.8); // the car is parked at (-6, 11)
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  check("A9a E boards the car on the beach", (await dbg()).car.occupied === true);
  // park at the start of the causeway, pointing along it (toward Pine Island)
  await page.evaluate(() => window.__gameDebug().placeCar(-29, -37.4, Math.atan2(-0.858, -0.515)));
  await page.waitForTimeout(400);
  await hold("KeyW", (d) => d.car.x < -58, 9000);
  const d9 = await dbg();
  check("A9 the car drives over the causeway to Pine Island", d9.car.x < -55 && d9.car.y > -0.1 && d9.hearts === 3,
    `car at (${d9.car.x.toFixed(1)}, ${d9.car.y.toFixed(2)}, ${d9.car.z.toFixed(1)})`);
  await page.screenshot({ path: join(ROOT, "verification-shots/28-pine-island.png") });

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
