/** playtest-quests.mjs — plays every world's find-what-was-lost quest from the first clue to the finale. */
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
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-gl=swiftshader"] });
const errors = [];
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${info}`); if (!ok) failed++; };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/?level=9`, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  for (const [level, tag] of [[9, "lambs"], [11, "kittens"], [12, "doves"], [13, "cargo"], [14, "sheep"], [15, "coins"]]) {
    if (only && !only.includes(level)) continue;
    await page.goto(`http://127.0.0.1:${port}/?level=${level}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 90000 });
    await page.click("[data-action=play]");
    await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const g = () => page.evaluate(() => { const d = window.__gameDebug(); return { quest: d.quest, use: d.use, home: d.questHome, t: d.questTargets(), hs: d.questHomeSpot, giver: d.questGiver, kid: d.kid, coins: d.coins }; });
    const warp = async (x, z, y) => { await page.evaluate(([x, z, y]) => window.__gameDebug().warp(x, z, y), [x, z, y]); await page.waitForTimeout(350); };
    const E = async () => { await page.keyboard.press("KeyE"); await page.waitForTimeout(350); };
    let s = await g();
    check(`${tag}: quest is here`, s.giver !== null, `giver ${s.giver}`);
    const npc = await page.evaluate((n) => window.__gameDebug().levelDef(window.__gameDebug().level ?? 0)?.npcs?.find((x) => x.name === n), s.giver);
    // talk to the giver
    const gpos = await page.evaluate((n) => { const d = window.__gameDebug(); for (let i = 0; i < 20; i++) { const l = d.levelDef(i); const v = l?.npcs?.find((x) => x.name === n); if (v) return v; } return null; }, s.giver);
    await warp(gpos.x + 1.1, gpos.z + 0.6, gpos.y + 2);
    await page.keyboard.press("KeyF");
    await page.waitForTimeout(500);
    const said = await page.evaluate(() => document.getElementById("dialog")?.textContent ?? "");
    check(`${tag}: giver gives a clue`, said.includes("clue"), said.slice(0, 90));
    for (let n = 0; n < 3; n++) {
      s = await g();
      const first = s.t[0];
      let tries = 0;
      // search spots / the well / the thing
      while (tries++ < 40) {
        s = await g();
        if (!s.t.length || (s.quest && s.quest.includes("Bring"))) break;
        const t = s.t[0];
        if (t.what === "chase") {
          await warp(t.x + 0.3, t.z, t.y + 1.5);
          await page.keyboard.press("KeyE");
          await page.waitForTimeout(250);
          continue;
        }
        const off = t.what === "tree" ? 1.2 : t.what === "well" ? 1.6 : 0.9;
        await warp(t.x + off, t.z, t.y + 1.5);
        await E();
      }
      s = await g();
      check(`${tag}: find ${n + 1} found`, s.quest && s.quest.includes("Bring"), `${first?.what} → ${s.quest} (tries ${tries})`);
      await page.screenshot({ path: join(ROOT, `verification-shots/q-${tag}-found${n + 1}.png`) });
      await warp(s.hs.x + 1.5, s.hs.z + 1.5, 3);
      for (let w = 0; w < 12; w++) { await page.waitForTimeout(500); s = await g(); if (s.home === n + 1) break; }
      check(`${tag}: find ${n + 1} brought home`, s.home === n + 1, `home ${s.home}`);
    }
    await page.waitForTimeout(400);
    const fin = await page.evaluate(() => document.getElementById("dialog")?.textContent ?? "");
    check(`${tag}: finale`, /\(\w+ \d+:\d+\)/.test(fin), fin.slice(0, 100));
    await page.screenshot({ path: join(ROOT, `verification-shots/q-${tag}-home.png`) });
  }
} finally {
  await browser.close();
  server.close();
}
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 500));
console.log(failed ? `PLAYTEST-QUESTS FAILED (${failed})` : "PLAYTEST-QUESTS OK");
