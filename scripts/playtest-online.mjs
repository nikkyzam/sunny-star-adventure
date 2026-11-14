/**
 * playtest-online.mjs — two browsers play together through a room code (needs internet:
 * PeerJS's public signalling server brokers the WebRTC link).
 *   H1 host makes a room and gets a code      J1 guest joins with that code
 *   S1 each sees the other's kid              S2 stickers reach the friend
 *   S3 a star picked up by the host vanishes for the guest
 *   E1 easy mode / online: running out of hearts refills them instead of game over
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

async function kid(profile) {
  // separate contexts = separate localStorage, like two different kids' computers
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript((p) => localStorage.setItem("game.profile", JSON.stringify(p)), profile);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
  return { page, errors };
}
const dbg = (page) => page.evaluate(() => window.__gameDebug());
const text = (page, id) => page.evaluate((i) => document.getElementById(i)?.textContent ?? "", id);

try {
  const host = await kid({ outfit: 0, name: [0, 0], easy: true });
  const guest = await kid({ outfit: 2, name: [3, 5], easy: true });

  await host.page.click("[data-action=online]");
  await host.page.click("[data-action=host]");
  await host.page.waitForFunction(() => document.getElementById("hud-room")?.textContent?.includes("🌐"), null, { timeout: 15000 });
  const room = await text(host.page, "hud-room");
  const code = room.match(/🌐 (\w+)/)?.[1] ?? "";
  check("H1 host made a room", code.length >= 4 && (await dbg(host.page)).state === "playing", room);

  await guest.page.click("[data-action=online]");
  await guest.page.fill("#join-code", code.toLowerCase());
  await guest.page.click("[data-action=join]");
  await guest.page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 15000 });
  check("J1 guest joined and started", true, await text(guest.page, "hud-room"));

  await host.page.waitForFunction(() => window.__gameDebug().remotes === 1, null, { timeout: 8000 }).catch(() => {});
  await guest.page.waitForFunction(() => window.__gameDebug().remotes === 1, null, { timeout: 8000 }).catch(() => {});
  check("S1 both kids see each other", (await dbg(host.page)).remotes === 1 && (await dbg(guest.page)).remotes === 1);
  check("S1b room pill counts 2 kids", (await text(guest.page, "hud-room")).includes("2 kids"), await text(guest.page, "hud-room"));

  await host.page.keyboard.press("Digit1");
  await guest.page.waitForTimeout(500);
  await guest.page.screenshot({ path: join(ROOT, "verification-shots/16-online-sticker.png") });
  check("S2 sticker sent without errors", host.errors.length === 0 && guest.errors.length === 0);

  // host walks forward into the first stars (W = -Z); the guest should lose them too
  const before = (await dbg(guest.page)).stars.length;
  await host.page.keyboard.down("KeyW");
  await host.page.waitForTimeout(900);
  await host.page.keyboard.up("KeyW");
  await guest.page.waitForTimeout(600);
  const hostLeft = (await dbg(host.page)).stars.length;
  const guestLeft = (await dbg(guest.page)).stars.length;
  check("S3 shared stars", hostLeft < before && guestLeft === hostLeft, `before=${before} host=${hostLeft} guest=${guestLeft}`);

  // E1: online is forgiving — walk off the island edge repeatedly, never a game over
  for (let i = 0; i < 3; i++) {
    await guest.page.keyboard.down("KeyD");
    await guest.page.waitForTimeout(2600);
    await guest.page.keyboard.up("KeyD");
  }
  const g = await dbg(guest.page);
  check("E1 no game over online", g.state === "playing" && g.hearts > 0, `state=${g.state} hearts=${g.hearts}`);

  await guest.page.screenshot({ path: join(ROOT, "verification-shots/17-online-guest.png") });
  await host.page.screenshot({ path: join(ROOT, "verification-shots/18-online-host.png") });

  check("Z1 zero page errors", host.errors.length === 0 && guest.errors.length === 0, [...host.errors, ...guest.errors].join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `PLAYTEST-ONLINE FAILED (${failures})` : "PLAYTEST-ONLINE OK");
process.exit(failures ? 1 : 0);
