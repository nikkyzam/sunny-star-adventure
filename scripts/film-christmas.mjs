/**
 * film-christmas.mjs — films the 36-second "Christmas in Bethlehem" video for parents to share
 * (upright 1080×1920 for phones: WhatsApp status, Reels, TikTok, Facebook).
 *
 *   npm run build && node scripts/film-christmas.mjs [out.mp4]
 *
 * The page runs on a pretend clock: the script moves time on by exactly 1/30 s, draws the frame,
 * adds the captions on a 2D canvas, and pipes the picture to ffmpeg. So the video is smooth
 * however slow the computer is. Music: the game's own "night" song (CC0, Abstraction).
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const OUT = resolve(process.argv[2] ?? join(ROOT, "public/video/christmas-in-bethlehem.mp4"));
const FPS = 30;
const LENGTH = 36;
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

const ff = spawn("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-i", join(ROOT, "public/music/night.m4a"),
  "-filter_complex", `[1:a]atrim=0:${LENGTH},afade=t=in:d=0.8,afade=t=out:st=${LENGTH - 2.5}:d=2.5[a]`,
  "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "128k", "-shortest", OUT,
], { stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise((r) => ff.on("close", r));

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  // the pretend clock: real time drives loading, then the script takes over
  await page.addInitScript(() => {
    let t = 0;
    let cbs = [];
    performance.now = () => t;
    window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
    window.cancelAnimationFrame = () => {};
    window.__tick = (ms) => {
      t += ms;
      const list = cbs;
      cbs = [];
      for (const cb of list) cb(t);
    };
    window.__auto = true;
    setInterval(() => { if (window.__auto) window.__tick(1000 / 60); }, 16);
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 120000 });
  await page.evaluate(() => document.querySelector("[data-action=christmas]").click());
  await page.waitForFunction(() => window.__gameDebug?.().state === "playing", null, { timeout: 60000 });
  await page.waitForTimeout(6000); // models and the first toast settle
  await page.evaluate(() => window.__gameDebug().warp(0, 17));
  await page.waitForTimeout(1500);

  // ── the director, inside the page ──
  await page.evaluate(() => {
    window.__auto = false;
    const W = 1080, H = 1920;
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const g = out.getContext("2d");
    const FONT = `"Chalkboard SE", "Comic Sans MS", "Baloo 2", sans-serif`;
    const lerp = (a, b, k) => a + (b - a) * k;
    const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
    const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
    const game = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const follow = { p: null, l: null };
    let frozen = null;         // the last game frame, kept under the postcard
    let card = null;           // the postcard image
    window.__dir = { shot: "", t: 0, snapAt: -1 };

    /** Where the camera is at time T (seconds into the video); null = the game's own camera. */
    const shots = {
      star(T) {             // 0–5: from the star down to the town gate
        const k = ease(T / 5);
        return { pos: mix([3, 3.5, 36], [1.2, 2.6, 24.5], k), look: mix([-16, 24, -27], [-1.5, 4.5, -8], ease((T - 0.6) / 4)), fov: 55 };
      },
      walk(T, kid) {         // 5–10: the kid walks in through the gate
        const want = [kid.x + 1.4, kid.y + 2.1, kid.z + 5.2], look = [kid.x - 0.2, kid.y + 1.4, kid.z - 4];
        if (!follow.p || T < 5.05) { follow.p = want; follow.l = look; }
        follow.p = mix(follow.p, want, 0.12);
        follow.l = mix(follow.l, look, 0.12);
        return { pos: follow.p, look: follow.l, fov: 58 };
      },
      field(T) {             // 10–15.5: the shepherds' field and the angel
        const k = ease((T - 10) / 5.5), a = lerp(-2.45, -2.0, k);
        return { pos: [24 + Math.cos(a) * 12, lerp(2.6, 3.6, k), 23 + Math.sin(a) * 12], look: [24.5, lerp(2.2, 3.4, k), 23.5], fov: 55 };
      },
      stable(T) {            // 15.5–22: push in to the manger
        const k = ease((T - 15.5) / 6.5);
        return { pos: mix([-15.2, 3.4, -13.5], [-15.7, 2.0, -20.6], k), look: mix([-16, 2.2, -27], [-16, 1.0, -27.2], k), fov: 54 };
      },
      wise(T, kid) {         // 22–27: the kid runs to the Wise Men
        const k = ease((T - 22) / 5);
        return { pos: [lerp(-2.2, -3.6, k), lerp(2.6, 2.4, k), lerp(-14.6, -16, k)], look: [lerp(kid.x, -15, k * 0.6), 1.3, lerp(kid.z, -19.5, k * 0.6)], fov: 55 };
      },
      photo() { return null; },
      end(T) {               // 31.5–36: looking up at the star over the stable
        const k = ease((T - 31.5) / 4.5);
        return { pos: [lerp(-11, -12, k), lerp(1.6, 1.4, k), lerp(-2, -4, k)], look: [-16, lerp(12, 21, k), -27], fov: 66 };
      },
    };
    window.__filmCam = (camera, scene, kid) => {
      scene.traverse((o) => { if (o.isSprite && !o.userData.keepInPhoto) o.visible = false; }); // name tags off
      const s = shots[window.__dir.shot]?.(window.__dir.t, kid);
      if (!s) {
        // the game's camera (the selfie shot): undo the stretch-to-fill aspect only
        return;
      }
      camera.position.set(...s.pos);
      camera.lookAt(...s.look);
      camera.fov = s.fov;
    };

    function pill(text, y, size, { bg = "rgba(20, 24, 70, 0.78)", fg = "#fff", alpha = 1, pad = 34 } = {}) {
      if (alpha <= 0) return;
      g.save();
      g.globalAlpha = alpha;
      g.font = `bold ${size}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const lines = wrap(text, W - 160);
      const lh = size * 1.22;
      const w = Math.max(...lines.map((l) => g.measureText(l).width)) + pad * 2;
      const h = lines.length * lh + pad * 1.2;
      const top = y - h / 2 + (1 - alpha) * 30;
      g.fillStyle = bg;
      round(W / 2 - w / 2, top, w, h, 40);
      g.fill();
      g.fillStyle = fg;
      lines.forEach((l, i) => g.fillText(l, W / 2, top + pad * 0.6 + lh * (i + 0.5)));
      g.restore();
    }
    function words(text, y, size, color, alpha = 1, italic = false) {
      if (alpha <= 0) return;
      g.save();
      g.globalAlpha = alpha;
      g.font = `${italic ? "italic " : "bold "}${size}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = "rgba(0,0,0,0.55)";
      g.shadowBlur = 18;
      g.fillStyle = color;
      wrap(text, W - 140).forEach((l, i) => g.fillText(l, W / 2, y + i * size * 1.25));
      g.restore();
    }
    function wrap(text, maxW) {
      const out = [];
      let line = "";
      for (const w of text.split(" ")) {
        const next = line ? `${line} ${w}` : w;
        if (g.measureText(next).width > maxW && line) { out.push(line); line = w; } else line = next;
      }
      if (line) out.push(line);
      return out;
    }
    function round(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    /** fade in at a, out at b */
    const fade = (T, a, b, d = 0.35) => Math.max(0, Math.min(1, (T - a) / d, (b - T) / d));

    window.__frame = (T, shot) => {
      window.__dir.shot = shot;
      window.__dir.t = T;
      window.__tick(1000 / 30);
      if (shot === "photo" && document.querySelector("#ov-photo")?.style.display !== "none") {
        if (!card) {
          card = new Image();
          card.src = document.querySelector("#ov-photo img.photo-card").src;
          frozen = document.createElement("canvas");
          frozen.width = W; frozen.height = H;
          frozen.getContext("2d").drawImage(game, 0, 0, W, H);
          window.__dir.snapAt = T;
        }
      }
      if (frozen && shot === "photo") g.drawImage(frozen, 0, 0);
      else g.drawImage(game, 0, 0, W, H);

      // little name in the corner the whole way through
      g.save();
      g.font = `bold 34px ${FONT}`;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.shadowColor = "rgba(0,0,0,0.6)";
      g.shadowBlur = 12;
      g.fillStyle = "#ffd257";
      if (shot !== "end") g.fillText("☀️ Sunny Star Adventure", 44, 96);
      g.restore();

      const CAP = 1360; // captions sit above the buttons the apps put at the bottom
      if (shot === "star") {
        words("This Advent…", 560, 92, "#fff3c4", fade(T, 0.4, 2.5));
        words("Follow the star to Bethlehem ⭐", 540, 84, "#fff3c4", fade(T, 2.7, 5.2));
      } else if (shot === "walk") {
        pill("Explore the little town of Bethlehem", CAP, 60, { alpha: fade(T, 5.3, 10) });
      } else if (shot === "field") {
        pill("Hear the angel's good news with the shepherds", CAP, 58, { alpha: fade(T, 10.3, 15.5) });
        words("“Glory to God in the highest”  Luke 2:14", CAP + 150, 40, "#fff3c4", fade(T, 11.2, 15.3), true);
      } else if (shot === "stable") {
        pill("Visit baby Jesus in the manger", CAP, 62, { alpha: fade(T, 15.8, 22) });
        words("“For unto you is born this day… a Saviour, which is Christ the Lord.”", CAP + 160, 40, "#fff3c4", fade(T, 16.8, 21.8), true);
        words("Luke 2:11", CAP + 270, 34, "#ffd257", fade(T, 16.8, 21.8));
      } else if (shot === "wise") {
        pill("Help the Wise Men find their lost gifts 🎁", CAP, 60, { alpha: fade(T, 22.3, 27) });
        words("gold · frankincense · myrrh", CAP + 140, 44, "#ffd257", fade(T, 23.2, 26.8));
      } else if (shot === "photo") {
        const since = window.__dir.snapAt < 0 ? -1 : T - window.__dir.snapAt;
        if (since < 0) {
          // our own countdown in time with the game's (its numbers are on the web page, not the picture)
          const n = 3 - Math.floor((T - 27.15) / 0.6);
          if (n >= 1 && n <= 3) words(String(n), 760, 260, "#ffffff", 1);
        } else {
          g.fillStyle = `rgba(10, 14, 40, ${Math.min(0.55, since * 2)})`;
          g.fillRect(0, 0, W, H);
          if (card.complete && card.naturalWidth) {
            const k = ease(Math.min(1, since / 0.45));
            const cw = 900, ch = (cw * card.naturalHeight) / card.naturalWidth;
            g.save();
            g.translate(W / 2, lerp(H + ch, 820, k));
            g.rotate((-3 * Math.PI) / 180 * k);
            g.shadowColor = "rgba(0,0,0,0.45)";
            g.shadowBlur = 40;
            g.drawImage(card, -cw / 2, -ch / 2, cw, ch);
            g.restore();
          }
          if (since < 0.25) { g.fillStyle = `rgba(255,255,255,${1 - since / 0.25})`; g.fillRect(0, 0, W, H); }
        }
        pill("Snap a Christmas postcard 📸", 1500, 60, { alpha: fade(T, 27.2, 31.5) });
      } else if (shot === "end") {
        const a = fade(T, 31.7, 99, 0.6);
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, `rgba(12, 16, 50, ${0.15 * a})`);
        grad.addColorStop(0.45, `rgba(12, 16, 50, ${0.55 * a})`);
        grad.addColorStop(1, `rgba(12, 16, 50, ${0.85 * a})`);
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
        words("⭐ Christmas in Bethlehem ⭐", 820, 60, "#ffd257", a);
        words("a free Christmas world in", 950, 46, "#ffffff", fade(T, 32.2, 99, 0.6));
        words("☀️ Sunny Star Adventure", 1020, 66, "#ffffff", fade(T, 32.2, 99, 0.6));
        words("Bible stories · quests · no sign-up · no chat", 1140, 38, "#cfe0ff", fade(T, 32.8, 99, 0.6));
        pill("Play free in your browser", 1290, 50, { bg: "#ff8c1a", alpha: fade(T, 33.3, 99, 0.6) });
        words("nikkyzam.github.io/sunny-star-adventure", 1410, 38, "#ffffff", fade(T, 33.3, 99, 0.6));
      }
      return out.toDataURL("image/jpeg", 0.9);
    };
  });

  const key = (k, down) => page.keyboard[down ? "down" : "up"](k);
  const SHOTS = [[0, "star"], [5, "walk"], [10, "field"], [15.5, "stable"], [22, "wise"], [27, "photo"], [31.5, "end"]];
  const N = LENGTH * FPS;
  for (let f = 0; f < N; f++) {
    const T = f / FPS;
    const shot = SHOTS.filter(([t]) => T >= t).at(-1)[1];
    // what the kid does at the start of each shot
    if (f === 5 * FPS) { await page.evaluate(() => window.__gameDebug().warp(0, 19)); await key("ArrowUp", true); }
    if (f === 10 * FPS) { await key("ArrowUp", false); await page.evaluate(() => window.__gameDebug().warp(20.5, 23.5)); }
    if (f === 15.5 * FPS) await page.evaluate(() => window.__gameDebug().warp(-6, -12));
    if (f === 22 * FPS) { await page.evaluate(() => window.__gameDebug().warp(-5, -17.5)); await key("ArrowLeft", true); }
    if (f === Math.round(24 * FPS)) await key("ArrowLeft", false);
    if (f === 27 * FPS - 12) { await page.evaluate(() => window.__gameDebug().warp(-16, -22.2)); await key("ArrowDown", true); }
    if (f === 27 * FPS - 6) await key("ArrowDown", false);
    if (f === 27 * FPS + 4) { await key("c", true); await key("c", false); }
    if (f === Math.round(31.5 * FPS)) {
      await page.evaluate(() => document.querySelector("[data-photo=close]")?.click());
      await page.evaluate(() => window.__gameDebug().warp(-6, -12));
    }
    const url = await page.evaluate(([T, shot]) => window.__frame(T, shot), [T, shot]);
    const buf = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 90 === 0) console.log(`${T.toFixed(0)}s ${shot}`);
  }
} finally {
  ff.stdin.end();
  await ffDone;
  await browser.close();
  server.close();
}
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "no errors");
console.log("wrote", OUT);
