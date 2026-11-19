/**
 * shots-castle-armour.mjs — the armour stand (put on the knight's helmet) and the singing stones (play
 * "Jesus Loves Me" by following the glowing stone). Pictures: verification-shots/99-armour-*.png.
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
const shot = (name) => join(ROOT, `verification-shots/99-armour-${name}.png`);
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

  const f0 = await fun();
  const [ax, ay, az] = f0.armour[0];
  check(f0.hat !== 5, "not wearing the helmet yet");
  // the stand, close up
  await film([ax, ay + 1.1, az], [2.2, 0.5, 2.2]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("stand") });
  await unfilm();
  await page.evaluate(([x, z]) => window.__gameDebug().warp(x + 0.9, z + 0.7, 3), [ax, az]);
  await page.waitForTimeout(700);
  let d = await dbg();
  check(d.use === "Put on the helmet", "the helmet is in reach", `use ${d.use}`);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(300);
  let f = await fun();
  check(f.hat === 5, "the knight's helmet goes on", `hat ${f.hat}`);
  check(/armour of God/.test(await toast()), "Ephesians 6:11");
  d = await dbg();
  check(d.use !== "Put on the helmet", "no helmet offered once it's on", `use ${d.use}`);
  await page.evaluate(() => {
    window.__filmCam = (cam, _s, kid) => { cam.position.set(kid.x + 1.4, kid.y + 1.9, kid.z + 1.4); cam.lookAt(kid.x, kid.y + 1.55, kid.z); cam.fov = 40; };
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("helmet") });
  await unfilm();

  // ── the singing stones: follow the glowing one through the song ──
  const stones = f.stones;
  check(stones.length === 8, "eight singing stones");
  const SONG = [4, 2, 2, 1, 2, 4, 4, 5, 5, 7, 5, 5, 4, 4];
  const bank0 = d.bank;
  const off = async () => { await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z - 1.3, 2), [stones[0][0], stones[0][2]]); await page.waitForTimeout(250); };
  let prev = -1, wrong = 0;
  for (let i = 0; i < SONG.length; i++) {
    f = await fun();
    if (f.songAt !== i) wrong++;
    if (SONG[i] === prev) await off();
    const s = stones[SONG[i]];
    await page.evaluate(([x, z]) => window.__gameDebug().warp(x, z, 2), [s[0], s[2]]);
    await page.waitForTimeout(350);
    prev = SONG[i];
    if (i === 6) {
      await film([stones[4][0], 0.4, stones[4][2]], [-5, 3.5, 4]);
      await page.waitForTimeout(150);
      await page.screenshot({ path: shot("stones") });
      await unfilm();
    }
  }
  check(wrong === 0, "each step was the next note", `${wrong} out of step`);
  await page.waitForTimeout(300);
  f = await fun();
  check(f.songAt === 0, "the song starts over when it's done", `at ${f.songAt}`);
  check(/Jesus loves me/.test(await toast()), "a song message");
  const won = (await dbg()).bank - bank0;
  check(won >= 25, "25 coins for the song", `+${won}`);
  check(errors.length === 0, "no page errors", errors[0] ?? "");
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `SHOTS-CASTLE-ARMOUR FAILED (${fails})` : "SHOTS-CASTLE-ARMOUR OK");
process.exit(fails ? 1 : 0);
