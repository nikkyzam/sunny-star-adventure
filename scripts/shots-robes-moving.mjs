/** shots-robes.mjs — close-ups of the Bible characters in their robes (verification-shots/96-robes-*.png). */
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
// level, [name, ride?]
const SETS = [
  [14, [["David", true], ["King Saul"], ["Goliath"], ["Jesse"]]],
  [16, [["Mary"], ["Joseph"], ["Wise Man Caspar"]]],
  [12, [["Noah"]]],
];
const MOVES = [["walk", 1.5], ["run", 4.5]];
const only = process.argv[2] ? Number(process.argv[2]) : null;
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu"] });
const errors = [];
const shot = (name, what) => join(ROOT, `verification-shots/97-move-${name.replace(/\W+/g, "-").toLowerCase()}-${what}.png`);
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 600 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  const cam = (x, y, z, s, side) => page.evaluate(([x, y, z, s, side]) => {
    window.__filmCam = (cam, scene) => {
      scene.traverse((o) => { if (o.isSprite) o.visible = false; });
      if (side) cam.position.set(x + 3.6 * s, y + 1.1 * s, z + 0.3 * s);
      else cam.position.set(x + 1.0 * s, y + 1.2 * s, z + 3.6 * s);
      cam.lookAt(x, y + 0.85 * s, z);
      cam.fov = 40;
    };
  }, [x, y, z, s, side]);
  for (const [level, people] of SETS) {
    if (only !== null && only !== level) continue;
    for (const [name, ride] of people) {
      // a fresh level each time, so nobody is left mid-stride from the last one
      await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
      await page.click("[data-action=play]");
      await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
      await page.waitForTimeout(2500);
      const n = await page.evaluate(([lv, n]) => window.__gameDebug().levelDef(lv).npcs.find((x) => x.name === n), [level, name]);
      const s = n.scale ?? 1;
      // the kid stands well away so nobody turns to look at them
      await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 9, z + 9), [n.x, n.z]);
      for (const [move, speed] of MOVES) {
        await page.evaluate(([n, v]) => window.__gameDebug().npcPose(n, v), [name, speed]);
        await page.waitForTimeout(1200);
        for (const side of [false, true]) {
          await cam(n.x, n.y, n.z, s, side);
          for (let f = 0; f < 3; f++) {
            await page.waitForTimeout(110 + f * 37);
            await page.screenshot({ path: shot(name, `${move}-${side ? "side" : "front"}-${f}`) });
          }
        }
      }
      if (ride) {
        // near the animals first, so one is in reach
        const p = await page.evaluate((n) => window.__gameDebug().npcPose(n, 0, true), name);
        if (!p) { console.log("no animal for", name); continue; }
        await page.waitForTimeout(1500);
        const q = await page.evaluate((n) => window.__gameDebug().npcPose(n, 0, true), name) ?? p;
        for (const side of [false, true]) {
          await cam(q.x, q.y - 0.3, q.z, 1.1, side);
          await page.waitForTimeout(300);
          await page.screenshot({ path: shot(name, `ride-${side ? "side" : "front"}`) });
        }
      }
      await page.evaluate(() => { window.__filmCam = undefined; });
      console.log("done", name);
    }
  }
  // a player in the dress outfit, riding a horse on the island farm (skirt over the saddle)
  if (only === null || only === 9) {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 600 } });
    await ctx.addInitScript(() => {
      const raw = JSON.parse(localStorage.getItem("game.profile") || "{}");
      localStorage.setItem("game.profile", JSON.stringify({ ...raw, clothes: 1, body: 0 }));
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e.stack || e)));
    await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    const horse = await page.evaluate(() => window.__gameDebug().herds.find((h) => h.kind.startsWith("horse")));
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 1.2, z), [horse.x, horse.z]);
    await page.waitForTimeout(600);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(800);
    const kidCam = (side) => page.evaluate((side) => {
      window.__filmCam = (cam, scene, kid) => {
        scene.traverse((o) => { if (o.isSprite) o.visible = false; });
        const f = scene.userData.__f ?? 0;
        cam.position.set(kid.x + (side ? 3.2 : 1.2), kid.y + 1.4, kid.z + (side ? 0.6 : 3.2));
        cam.lookAt(kid.x, kid.y + 0.6, kid.z);
        cam.fov = 45;
      };
    }, side);
    for (const side of [false, true]) { await kidCam(side); await page.waitForTimeout(300); await page.screenshot({ path: shot("player-dress", `ride-${side ? "side" : "front"}`) }); }
    await page.evaluate(() => { window.__filmCam = undefined; });
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(2000);
    await kidCam(true);
    for (let f = 0; f < 3; f++) { await page.waitForTimeout(90); await page.screenshot({ path: shot("player-dress", `gallop-${f}`) }); }
    await page.keyboard.up("KeyW");
    await page.evaluate(() => { window.__filmCam = undefined; });
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(800);
    // and running on foot
    await page.keyboard.down("KeyW");
    await page.keyboard.down("ShiftLeft");
    await page.waitForTimeout(1200);
    await kidCam(true);
    for (let f = 0; f < 3; f++) { await page.waitForTimeout(90); await page.screenshot({ path: shot("player-dress", `run-${f}`) }); }
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
    console.log("done player dress", JSON.stringify(await page.evaluate(() => ({ move: window.__gameDebug().move, mounts: window.__gameDebug().mounts }))));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
