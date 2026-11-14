# Sunny Star Adventure ⭐🪂

A cheerful 3D platformer for kids, playable in the browser. Guide a little adventurer across
floating sky islands, a big Toy City and snowy Frosty Mountain — collect every golden star,
adopt animal buddies, drive the car, parachute off the tower, and **play online with friends**!

## Play with friends online 🌐

No accounts and no passwords: kids play together with a **room code**.

1. One kid presses **🌐 Play with friends → 🏠 Make a room**. A code like `TIGER22` appears at the top.
2. Friends open the same game link, press **🌐 Play with friends**, type the code, and press **🚪 Join room**.
3. Up to 6 kids explore the same world together. Stars are shared (anyone can grab one for the
   team), and when someone jumps into the open portal, everyone moves on to the next world.

To keep it kid-safe, there's **no typing chat**. Kids talk with 6 preset **stickers** (👋 ⭐ 👉 🆘 🎉 ❤️,
keys `1`–`6` or the sticker buttons). Names are made-up fun names like "Bouncy Panda" (🎲 rolls a
new one), never real names. Online play uses WebRTC through the free public PeerJS service. Game
data goes directly between the players' browsers, and nothing is stored on a server.

## Make it yours

- **Outfit colors**: tap a color dot on the title screen.
- **Easy mode** (on by default): running out of hearts refills them instead of ending the game,
  so the youngest players never hit a game-over screen. Turn it off for a challenge.
  Online play is always forgiving.

## How to play

- **Objective**: collect all ★ in each world to unlock the golden portal, then jump into it.
  6 worlds: Sunny Meadow → Candy Canyon → Rainbow Peak → Castle in the Clouds → **Toy City** →
  **Frosty Mountain** (falling snow, a sliding ice floe and a spring-launch climb).
- **Hearts**: you have 3 ♥ per level. Falling off an island or bumping an enemy from the side
  costs one — but **landing on an enemy squishes it** (+50) and bounces you into the air!
  Watch out for **hedgehogs**: their spikes always hurt, wait for them to retract.
- **Coins** are worth +10, **heart pickups** heal 1 ♥, and the **star magnet** 🧲 pulls stars
  to you for 8 seconds. **Treasure chests** on hidden side islands are worth +150!
- **Animal buddies** join you when you touch them and follow you between worlds:
  - 🐰 **Hops** the bunny (Sunny Meadow) — vacuums up nearby coins
  - 🐦 **Pip** the birdie (Candy Canyon) — unlocks the **parachute**: hold jump while falling to glide
  - 🐢 **Shelly** the turtle (Rainbow Peak) — +1 max heart
- **Toy City**: climb onto the rooftops (trampolines launch you up), **drive the car** with
  `E`, and ride the giant spring to the top of the **parachute tower** — gliding is free for
  everyone in this world!
- **Trampolines** launch you to high places. **Checkpoint flags** save your respawn spot.
- Score: 100 per star + coins/treasure/stomps + time bonus. Best score and level progress are
  saved in this browser's `localStorage` (per-browser only; clearing browser data resets them).

### Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move player 1 (camera-relative) |
| `Space` | P1 jump — again mid-air to **double jump**, hold while falling to **glide** (once unlocked) |
| Arrow keys + `Enter` | Player 2 (same-keyboard co-op: pick **👥 2 Players** on the title screen) |
| `T` | Teleport to your friend (co-op) |
| `E` | Board / exit the car (Toy City) |
| Mouse drag | Orbit camera |
| `Esc` / `P` | Pause |
| `M` / 🔊 button | Mute |
| `1`–`6` / sticker buttons | Show a sticker above your kid (seen by friends online) |
| Big ⬆ JUMP button | Jump (touch friendly) |

In co-op both kids share hearts and must gather at the portal together — wander too far apart
and the game teleports the straggler back.

## Run it

```bash
npm install   # once
npm run dev   # dev server (Vite)
npm run build # production build → dist/
```

The production build is fully static (`base: "./"`), so `dist/` can be hosted anywhere.
Every push to `main` deploys to **GitHub Pages** through `.github/workflows/deploy.yml`.

## Systems & techniques

- **Three.js** parametric world: islands, bridges, city buildings, roads, fountain, rainbow,
  trees, flowers, clouds — all generated from level data (`src/game/world.ts`), flat-shaded
  cartoon look, no asset files.
- **Kinematic controller** (`src/game/player.ts`): analytic disc/box colliders + solid-wall
  push-out, coyote time, jump buffering, double jump, parachute glide, squash & stretch,
  hurt knockback + invincibility blink.
- **Drivable car** (`src/game/car.ts`): arcade accel/steer, wall bumps, ground follow,
  driver + passenger seats for co-op rides, squishes enemies at speed.
- **Interacting systems**: stars gate the portal; buddies grant verbs (vacuum / glide / heart);
  slimes, birds and hedgehogs each demand a different answer; springs chain into double jumps.
- **Fixed-timestep loop** (60 Hz) decoupled from frame rate (`src/game/engine.ts`).
- **Web Audio synth**: all SFX + a chiptune I–V–vi–IV music loop synthesized at runtime
  (`src/game/audio.ts`), autoplay-compliant, persistent mute.
- **Pooled particles** on a single additive `THREE.Points` — zero allocation in the hot loop.
- Perf: ~150–200 draw calls / ~10–19k triangles in the busiest scenes; 60 fps measured on
  Apple M2.

## Test hooks

`window.__gameProbe()` (player position), `window.__perf()` (draw calls / triangles) and
`window.__gameDebug()` (state, stars, slimes, ground sampler) exist for the automated smoke test
(`npm run verify`, Playwright). `?level=N` in the URL starts directly on level N+1.
`node scripts/playtest-online.mjs` plays two browsers together through a real room code
(needs internet).
