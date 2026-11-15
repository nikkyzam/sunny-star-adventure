/**
 * playtest-class.mjs — verses picked by a grown-up.
 * On one device (no internet needed):
 *   L1 the grown-up check keeps kids out          L2 picking library verses and adding your own
 *   L3 "Use on this device" turns the verse book on in play
 *   L4 typing a verse from memory ticks it and pays coins once
 *   L5 the level gate uses the picked verses      L6 the picks survive a reload; turning off hides the book
 * A class (needs internet: PeerJS's public server brokers the link; skipped if it can't be reached):
 *   K1 the teacher starts a class and gets a code K2 a kid who joins gets the teacher's verses
 *   K3 the teacher's board lists the kid          K4 a verse the kid types shows up on the board
 *   K5 a typed-in verse is not sent to the class
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
let skipped = "";
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

/** A separate browser profile = a separate device. */
async function device(profile, query = "") {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => { errors.push(String(e)); if (errors.length === 1) console.log(e.stack); });
  if (profile) await page.addInitScript((p) => { if (!localStorage.getItem("game.profile")) localStorage.setItem("game.profile", JSON.stringify(p)); }, profile);
  const open = async () => {
    await page.goto(`http://127.0.0.1:${port}/${query}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 60000 });
  };
  await open();
  return { page, errors, open, ctx };
}
const dbg = (page) => page.evaluate(() => { const d = window.__gameDebug(); return { state: d.state, bank: d.bank, verse: d.verse, lesson: d.lesson, board: d.board, remotes: d.remotes }; });
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel);
const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; }, sel);

/** Answer the grown-up sum (reads it off the screen, like a grown-up would). */
async function passGate(page) {
  const q = await text(page, "#gate-question");
  const [a, b] = q.split("×").map((n) => Number(n.trim()));
  await page.fill("#gate-answer", String(a * b));
  await page.click("[data-action=gate-ok]");
}

/** Type the verse on screen from memory. */
async function typeVerse(page) {
  const verse = await text(page, "#verse-text");
  await page.click("[data-action=verse-ready]");
  await page.fill("#verse-input", verse.toLowerCase().replace(/[^a-z0-9 ]/g, ""));
  await page.click("[data-action=verse-check]");
  await page.waitForTimeout(300);
}

try {
  // ── one device ─────────────────────────────────────────────────────────────
  const home = await device(null);
  const page = home.page;

  await page.click("[data-action=teach]");
  await page.fill("#gate-answer", "7");
  await page.click("[data-action=gate-ok]");
  check("L1a a wrong answer stays out of the teacher screen", (await shown(page, "#ov-gate")) && !(await shown(page, "#ov-teach")), await text(page, "#gate-status"));
  await passGate(page);
  check("L1 the right answer opens the teacher screen", await shown(page, "#ov-teach"));

  await page.click('button[aria-label="Add John 11:35"]');
  await page.click('button[aria-label="Add 1 Thessalonians 5:17"]');
  await page.click(".teach-own summary");
  await page.fill("#own-ref", "Psalm 23:4a");
  await page.fill("#own-text", "Yea, though I walk through the valley");
  await page.click("[data-action=own-add]");
  const picked = await page.evaluate(() => [...document.querySelectorAll("#teach-picked .teach-ref")].map((e) => e.textContent));
  check("L2 two library verses and one of your own are picked", picked.join("|") === "John 11:35|1 Thessalonians 5:17|Psalm 23:4a", picked.join("|"));
  await page.screenshot({ path: join(ROOT, "verification-shots/60-teacher-screen.png") });

  await page.click("[data-action=family]");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("game.lesson") ?? "{}"));
  check("L3a Use on this device saves the plan", saved.on === true && saved.picks?.length === 2 && saved.own?.length === 1, JSON.stringify(saved));
  await page.click("#ov-teach [data-action=back]");
  check("L3b the title shows the verses are on", (await text(page, "#btn-teach")).includes("3 verses are on"), await text(page, "#btn-teach"));

  await page.click("[data-action=island]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  check("L3 the verse book button shows in play", (await shown(page, "#btn-book")) && (await text(page, "#btn-book")).includes("0/3"), await text(page, "#btn-book"));

  let d = await dbg(page);
  check("L5 the level gate uses a picked verse", d.lesson.refs.includes(d.verse.ref), `${d.verse.ref} of ${d.lesson.refs.join(", ")}`);

  const bank0 = d.bank;
  await page.click("#btn-book");
  await page.waitForTimeout(200);
  check("L4a the book opens with the three verses", (await shown(page, "#ov-book")) && (await page.locator(".book-verse").count()) === 3 && (await dbg(page)).state === "paused");
  await page.screenshot({ path: join(ROOT, "verification-shots/61-verse-book.png") });
  await page.click(".book-verse >> nth=0");
  check("L4b tapping a verse shows it to learn", (await shown(page, "#ov-verse")) && (await text(page, "#verse-ref")) === "John 11:35" && (await shown(page, "#verse-back")));
  await typeVerse(page);
  d = await dbg(page);
  check("L4 typing it from memory ticks it and pays coins", (await shown(page, "#ov-book")) && d.lesson.done.includes("John 11:35") && d.bank === bank0 + 15
    && (await page.locator(".book-verse.done").count()) === 1, `bank ${bank0} → ${d.bank}`);
  await page.click(".book-verse >> nth=0");
  await typeVerse(page);
  check("L4c practicing it again pays nothing more", (await dbg(page)).bank === bank0 + 15);
  // the grown-up's own verse works too
  await page.click(".book-verse >> nth=2");
  await typeVerse(page);
  check("L4d a typed-in verse can be learned too", (await dbg(page)).lesson.done.includes("Psalm 23:4a"));
  await page.click("[data-action=book-close]");
  await page.waitForTimeout(200);
  check("L4e back in the game the button counts 2/3", (await dbg(page)).state === "playing" && (await text(page, "#btn-book")).includes("2/3"), await text(page, "#btn-book"));

  // reload: the plan stays, today's ticks start over, and an old verse doesn't pay twice
  await home.open();
  check("L6a the picks survive a reload", (await text(page, "#btn-teach")).includes("3 verses are on"));
  await page.click("[data-action=island]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  const bank1 = (await dbg(page)).bank;
  await page.click("#btn-book");
  await page.click(".book-verse >> nth=0");
  await typeVerse(page);
  check("L6b a verse learned before pays no coins the next day", (await dbg(page)).bank === bank1 && (await dbg(page)).lesson.done.length === 1);

  // turn it off again
  await home.open();
  await page.click("[data-action=teach]");
  await passGate(page);
  await page.click("[data-action=family]");
  await page.click("#ov-teach [data-action=back]");
  await page.click("[data-action=island]");
  await page.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 });
  d = await dbg(page);
  check("L6 turning it off hides the book and brings back the game's own verse", !(await shown(page, "#btn-book")) && d.lesson.refs.length === 0 && d.verse.ref === "John 3:16", d.verse.ref);
  check("L7 no page errors on one device", home.errors.length === 0, home.errors.join(" | "));
  await home.ctx.close();

  // ── a class ────────────────────────────────────────────────────────────────
  const teacher = await device({ outfit: 0, name: [0, 0], easy: true });
  const kid = await device({ outfit: 2, name: [3, 5], easy: true });
  const tp = teacher.page, kp = kid.page;

  await tp.click("[data-action=teach]");
  await passGate(tp);
  await tp.click('button[aria-label="Add John 11:35"]');
  await tp.click('button[aria-label="Add Psalm 56:3"]');
  await tp.click(".teach-own summary");
  await tp.fill("#own-ref", "My verse");
  await tp.fill("#own-text", "This one stays on the teacher's device");
  await tp.click("[data-action=own-add]");
  await tp.click("[data-action=class-link]");
  const link = await tp.inputValue("#class-link");
  check("K0 the class link carries the plan", /\?class=[\w-]+$/.test(link), link.slice(-60));
  await tp.click("[data-action=class-start]");
  const made = await tp.waitForFunction(() => document.getElementById("hud-room")?.textContent?.includes("🏫"), null, { timeout: 20000 }).then(() => true, () => false);
  if (!made) {
    skipped = `couldn't reach the matchmaking server (${await text(tp, "#teach-status")})`;
  } else {
    const code = (await text(tp, "#hud-room")).match(/🏫 (\w+)/)?.[1] ?? "";
    let t = await dbg(tp);
    check("K1 the teacher starts a class and gets a room code", code.length >= 4 && t.state === "playing" && t.lesson.host && t.lesson.refs.join("|") === "John 11:35|Psalm 56:3|My verse", `${code}: ${t.lesson.refs.join(", ")}`);

    await kp.click("[data-action=online]");
    await kp.fill("#join-code", code);
    await kp.click("[data-action=join]");
    const joined = await kp.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 }).then(() => true, () => false);
    if (!joined) {
      skipped = `the kid couldn't join the class room (${await text(kp, "#online-status")})`;
    } else {
      let k = await dbg(kp);
      check("K2 a kid who joins gets the teacher's verses", k.lesson.room && k.lesson.refs.join("|") === "John 11:35|Psalm 56:3" && (await text(kp, "#btn-book")).includes("0/2"), k.lesson.refs.join(", "));
      check("K5 the teacher's typed-in verse is not sent to the class", !k.lesson.refs.includes("My verse"));

      await tp.waitForFunction(() => window.__gameDebug().board.length === 1, null, { timeout: 10000 }).catch(() => {});
      t = await dbg(tp);
      check("K3 the teacher's board lists the kid", t.board.length === 1 && t.board[0].done.join() === "false,false,false" && t.board[0].here, JSON.stringify(t.board));

      await kp.click("#btn-book");
      await kp.click(".book-verse >> nth=1");
      await typeVerse(kp);
      await tp.waitForFunction(() => window.__gameDebug().board[0]?.done[1] === true, null, { timeout: 10000 }).catch(() => {});
      t = await dbg(tp);
      check("K4 a verse the kid types shows up on the teacher's board", t.board[0]?.done.join() === "false,true,false", JSON.stringify(t.board));
      // the kid keeps the book open for a while: they must not drop off the teacher's board
      await kp.waitForTimeout(8000);
      t = await dbg(tp);
      check("K4c a kid reading the verse book stays in the class", t.board.length === 1 && t.board[0].here && t.remotes === 1, JSON.stringify(t.board));

      await tp.click("#btn-book");
      await tp.waitForTimeout(300);
      const boardText = await text(tp, "#book-board");
      check("K4b the teacher's verse book shows the class and its code", (await shown(tp, "#book-class")) && boardText.includes("1/3") && (await text(tp, "#book-code")).includes(code), boardText);
      await tp.screenshot({ path: join(ROOT, "verification-shots/62-class-board.png") });
      await kp.screenshot({ path: join(ROOT, "verification-shots/63-class-kid.png") });
      await tp.click("[data-action=book-close]");

      // a second kid opened the teacher's class link first: they get the typed-in verse too
      const kid2 = await device({ outfit: 4, name: [5, 2], easy: true }, link.slice(link.indexOf("?")));
      const k2 = kid2.page;
      check("K6a the class link turns the teacher's verses on", (await text(k2, "#btn-teach")).includes("teacher's 3 verses"), await text(k2, "#btn-teach"));
      await k2.click("[data-action=online]");
      await k2.fill("#join-code", code);
      await k2.click("[data-action=join]");
      await k2.waitForFunction(() => window.__gameDebug().state === "playing", null, { timeout: 20000 }).catch(() => {});
      const d2 = await dbg(k2);
      check("K6 a kid with the class link gets the typed-in verse in class", d2.lesson.room && d2.lesson.refs.join("|") === "John 11:35|Psalm 56:3|My verse", d2.lesson.refs.join(", "));
      await k2.click("#btn-book");
      await k2.click(".book-verse >> nth=2");
      await typeVerse(k2);
      await tp.waitForFunction(() => window.__gameDebug().board.some((r) => r.done[2] === true), null, { timeout: 10000 }).catch(() => {});
      t = await dbg(tp);
      check("K7 their typed-in verse ticks on the teacher's board", t.board.length === 2 && t.board.some((r) => r.done.join() === "false,false,true"), JSON.stringify(t.board));
      check("K8 no page errors for the second kid", kid2.errors.length === 0, kid2.errors.join(" | "));
    }
  }
  check("K9 no page errors in class", teacher.errors.length === 0 && kid.errors.length === 0, [...teacher.errors, ...kid.errors].join(" | "));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  server.close();
}
if (skipped) console.log(`SKIPPED the class-room checks: ${skipped}`);
console.log(failures ? `PLAYTEST-CLASS FAILED (${failures})` : skipped ? "PLAYTEST-CLASS OK (one-device checks only)" : "PLAYTEST-CLASS OK");
process.exit(failures ? 1 : 0);
