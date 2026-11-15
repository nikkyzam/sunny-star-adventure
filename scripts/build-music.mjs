/**
 * build-music.mjs — the game's songs: chosen loops from "Abstraction - Music Loop Bundle"
 * (Tallbeard Studios, CC0) copied into public/music/:
 *   <key>.ogg  (the original Vorbis stream, cover art removed: loops seamlessly; Chrome, Firefox, Safari 17+)
 *   <key>.m4a  (AAC: fallback for older Safari / iPads)
 * plus music.json with each loop's exact length, so encoder padding never adds a gap.
 *
 *   node scripts/build-music.mjs <folder with the extracted .ogg files>
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node scripts/build-music.mjs <folder>"); process.exit(1); }
const OUT = join(fileURLToPath(new URL("../", import.meta.url)), "public/music");
mkdirSync(OUT, { recursive: true });

// key → source file (moods from the bundle's own metadata: all rated "bright")
const SONGS = {
  title: "Interior Birdecorator Menu_LOOP.ogg",           // cozy jazz
  meadow: "Interior Birdecorator Explore_CUTE.ogg",       // gentle and cute
  candy: "Interior Birdecorator Explore_SILLY.ogg",       // the same tune, silly
  snow: "Interior Birdecorator Explore_FESTIVE.ogg",      // the same tune, with sleigh-bell sparkle
  island: "Interior Birdecorator Decorate.ogg",           // relaxed jazz for the big island
  beach: "Sketchbook 2024-05-01_02.ogg",                  // bouncy and silly
  jungle: "Sketchbook 2024-05-15.ogg",                    // silly jazz
  city: "Sketchbook 2024-05-29.ogg",                      // funk for Toy City
  night: "Sketchbook 2024-09-25.ogg",                     // calm lo-fi
  space: "Sketchbook 2024-06-26.ogg",                     // dreamy ambient
};

const run = (args) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
};
const probe = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration_ts,sample_rate", "-of", "json", file], { encoding: "utf8" });
  const s = JSON.parse(r.stdout).streams[0];
  return Number(s.duration_ts) / Number(s.sample_rate);
};

const manifest = {};
for (const [key, file] of Object.entries(SONGS)) {
  const src = join(SRC, file);
  const ogg = join(OUT, `${key}.ogg`), m4a = join(OUT, `${key}.m4a`);
  // -vn: drop the cover art embedded in the source files
  run(["-i", src, "-vn", "-map_metadata", "-1", "-c:a", "copy", ogg]);
  run(["-i", src, "-vn", "-map_metadata", "-1", "-c:a", "aac_at", "-b:a", "96k", "-movflags", "+faststart", m4a]);
  manifest[key] = { loop: Number(probe(src).toFixed(6)) };
  console.log(`${key.padEnd(7)} ${manifest[key].loop.toFixed(1).padStart(6)} s  ogg ${(statSync(ogg).size / 1024).toFixed(0)} KB  m4a ${(statSync(m4a).size / 1024).toFixed(0)} KB`);
}
writeFileSync(join(OUT, "music.json"), JSON.stringify(manifest, null, 2) + "\n");
copyFileSync(join(SRC, "_LICENSE.txt"), join(OUT, "LICENSE-Abstraction.txt"));
