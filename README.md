# Sunny Star Adventure ⭐🪂

A cheerful 3D platformer for kids, playable in the browser. Guide a little adventurer across
floating sky islands, a big Toy City, snowy Frosty Mountain and sunny Bubbly Beach — collect
every golden star, ride party balloons, adopt animal buddies, drive the car, parachute off the
tower, and **play online with friends**!

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

## Adventure Island 🏝️

The eighth world is one big open island you can reach straight from the title screen. It's also
where friends meet when someone makes a room.

- **Explore**: a village, a forest, Lookout Hill and a beach all the way around. Sandy causeways
  (wide enough for the car) lead to **Coconut Cove** (snack hut, little hill, forest) and to
  **Pine Island** (big forests, a cabin and Pine Peak). **Sunset Island** (pink tower) can only be
  reached by boat. Five small islands lie further out (Treasure Rock, Palm Cay, Lighthouse Rock,
  Shell Islet and a sandbar).
- **Sail the boat** ⛵: walk onto the dock and press `E` (or the Hop in button). The boat can't
  run aground, and the water is shallow everywhere, so nobody can drown or lose a heart at sea.
  Wading works too, it's just slow.
- **Drive the car** 🚗 around the beach loop: cones to knock over, a boost pad and a ramp.
- **Go inside the houses** 🏠: the four village houses, the Pine Island cabin and the snack hut
  have open doors. Walk in and the house opens up like a dollhouse so you can see the room:
  a bed, a bookshelf, a rug, and sometimes a star, coins or someone to talk to.
- **Talk to the villagers** 💬: walk up to one and press `F` (or the Talk button). Seventeen friends
  live on the islands; each has a few things to say and a small gift the first time you meet.
  Villagers only say fixed, friendly lines. There is no typed chat anywhere in the game.
- 40 stars to find, including one on top of the lighthouse and one high in the sky.

## Flying and space 🚁✈️🚀

- **Helicopter** (by the dock on Adventure Island): hop in, hold jump to go up, let go to float
  back down. It can hover, land anywhere, and floats on the sea.
- **Jet** (west beach): fast. Get some speed, then hold jump to take off.
- **Sky rings**: ten golden hoops to fly through, with a prize for all ten.
- **Cloud Island**: a little island high in the sky with stars and a chest. Only flyers reach it.
- **Rocket** (Pine Island): hop in to blast off to **Moon Base**, the ninth world. Gravity is low,
  so every jump is huge: floating rocks to climb, a moon buggy with a ramp, a moon base to walk
  into, and two aliens to talk to. The Moon's rocket flies you home.
- Friends online see your helicopter or jet, and come along when someone takes the rocket.

## Memory verses 📖

After each level, a Bible verse appears. The kid reads it, taps **I know it!**, the verse hides,
and they type it from memory. The next level opens only when the verse is right.

- Capitals and punctuation don't matter, and one slip in a long word is forgiven.
- After a wrong try, the words they got turn green and the rest show as blanks.
- **Peek at the verse** shows it again, as often as needed.
- Playing online, the kid who reaches the portal says the verse, then everyone moves on together.
- Verses are from the King James Version (public domain) and live in `src/game/verses.ts`, one
  per level. Edit that file to change verses or use another translation.
- The title-screen shortcuts (Adventure Island, Drive in Toy City), Continue and the rocket are
  not gated; only finishing a level through its portal is.

## Coins, a job and a mansion 💰

- **Coins are saved** in this browser between play sessions (the ◉ number at the top is your
  piggy bank).
- **Pizza delivery**: talk to Chef Chili at the snack hut on Coconut Cove. He hands you a pizza
  for one of the villagers; a yellow beam of light marks where to go. Drive, sail or fly there
  and talk to them: 10 coins per delivery, as often as you like.
- Other ways to earn: coins lying around, gift boxes, meeting villagers, sinking pirate ships.
- **The mansion** on Adventure Island is for sale. Talk to Agent Goldie outside it: 60 coins and
  it's yours forever, with a sofa, a big TV, a dining table and a golden trophy inside.

## Ship battles 🏴‍☠️

Three toy pirate ships sail in circles off Adventure Island. Board the sailboat, point it roughly
at one, and press jump (Space or the JUMP button) to fire the cannon. The cannon aims itself at a
ship that's ahead of you. Three hits and the ship tips over and sinks: +100 points and 5 coins.
A new ship sails in a little later. Nobody is on board; they're toy ships.

## Food 🍕

Snacks float around every world. Walk into one to eat it:

| Snack | What it does (for 8 seconds) |
| --- | --- |
| 🍎 Apple | +1 heart |
| 🍦 Ice cream | Super speed |
| 🧁 Cupcake | Mega jumps |
| 🍕 Pizza | You grow giant |

Snacks grow back after 20 seconds, and your pet cheers when you eat. Chef Chili's snack hut on
Coconut Cove has one of each out front.

## Driving 🚗

- **Drive in Toy City** on the title screen goes straight to the car level.
- Walk up to the car and press `E`, or tap **Hop in**. Tap **Hop out** to leave.
- Your move keys drive. The camera stays behind you, so up is always "go".
- `Space` makes the car hop. `H` (or the 📣 button) honks.
- Things to hit: cones, gift boxes (coins inside), big balls to push around, a boost pad and
  ramps. Balls and gift boxes can be bumped on foot too.
- Friends online see your car or boat and hear your honk.

## Human characters 🧍

Kids, friends and villagers are human models with real walking, running, jumping, dancing,
driving and swimming animations. Everyone is always fully dressed: outfits are fitted over the
body so they move with it.

- Dress-up choices: girl or boy body, clothes (jacket and trousers, dress, T-shirt and shorts,
  dungarees), outfit color, skin tone, five hairstyles, hair color, glasses, hats and a pet.
- The models load in the background. Until then (or if they can't load) the game shows its
  cartoon kids.
- Models and animations: Quaternius, *Universal Base Characters* and *Universal Animation
  Library* (free versions, CC0). `scripts/build-characters.mjs` turns the downloaded packs into
  the small files in `public/models/`.

## A real-looking world 🌳🏙️

Trees, bushes, ferns, flowers, grass, mushrooms and rocks come from Quaternius' *Stylized Nature
MegaKit*, and Toy City's buildings are dressed in wall panels, shop fronts, doors, cornices and
roofs from the *Downtown City MegaKit* (free versions, CC0). The brick takes each building's
color. Gameplay shapes didn't change: rooftops, collisions and jumps are exactly where they were.

- `scripts/build-world.mjs` packs the chosen models into `public/models/nature.glb` and
  `city.glb` (shared, shrunk textures; compressed geometry).
- Scenery is drawn in instanced batches per 40 m square, so off-screen batches are skipped.
- If the files can't load, the game draws its own code-built scenery.

## Make it yours

- **Dress up** 🎨 on the title screen: outfit colors, skin tone, hats, and a pet.
- **Pets**: puppy 🐶, kitten 🐱, duckling 🐥 or baby dragon 🐲. Your pet follows you everywhere,
  paddles behind the boat, and does a happy spin when you dance or send a ❤️. Friends online
  see your pet.

- **Hats**: cap 🧢, crown 👑, bunny ears 🐰, wizard hat 🧙 or flower 🌸. Friends online see your hat.
- **Dance** 💃: press `7` or the dance button. Friends online see it too.
- **Easy mode** (on by default): running out of hearts refills them instead of ending the game,
  so the youngest players never hit a game-over screen. Turn it off for a challenge.
  Online play is always forgiving.

## How to play

- **Objective**: collect all ★ in each world to unlock the golden portal, then jump into it.
  11 worlds: Sunny Meadow → Candy Canyon → Rainbow Peak → Castle in the Clouds → **Toy City** →
  **Frosty Mountain** (falling snow, a sliding ice floe and a spring-launch climb) →
  **Bubbly Beach** (sandy islands over a sparkly sea, with secret sky islands) →
  **Jungle Vines** (leafy climb, a balloon to a treetop island) → **Starlight Peak** (a climb on
  springs at night) →
  **Adventure Island** (the big open world, see above) → **Moon Base** (by rocket).
- **Party balloons** 🎈 (Bubbly Beach, and one on Frosty Mountain): touch one to float up for a
  few seconds, then steer to a secret island. Balloons grow back, so you can ride again.
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
| `E` / Hop in button | Board / exit the car or the boat |
| Mouse drag | Orbit camera |
| `Esc` / `P` | Pause |
| `M` / 🔊 button | Mute |
| `1`–`6` / sticker buttons | Show a sticker above your kid (seen by friends online) |
| `7` / 💃 button | Dance |
| `F` / 💬 Talk button | Talk to a villager |
| `H` / 📣 button | Honk (while driving) |
| Big ⬆ JUMP button | Jump; keep holding to glide |

**On a tablet or phone**: put your left thumb anywhere on the left half of the screen and a
thumb-stick appears under it; drag to move. Tap **JUMP** with your other thumb (it works while
you steer), drag on the right half to turn the camera, and use the on-screen Hop in, Talk, 📣
and sticker buttons.

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
- **Music**: real recorded loops, one per world (cozy jazz on the title screen and the big island,
  cute / silly / festive versions of one tune for the meadow, candy and snow worlds, funk for Toy
  City, lo-fi at night, dreamy ambient on the Moon). They come from *Abstraction - Music Loop
  Bundle* (Tallbeard Studios, CC0); `scripts/build-music.mjs` copies the chosen songs into
  `public/music/` as OGG (seamless loops) plus M4A for older iPads. Each world downloads only its
  own song, and songs cross-fade when you change worlds. Until a song arrives (or if it can't),
  the old synthesized tunes play.
- **Sound effects** are synthesized at runtime with Web Audio (`src/game/audio.ts`); mute is
  remembered.
- **Pooled particles** on a single additive `THREE.Points` — zero allocation in the hot loop.
- Perf: ~150–200 draw calls / ~10–19k triangles in the busiest scenes; 60 fps measured on
  Apple M2.

## Test hooks

`window.__gameProbe()` (player position), `window.__perf()` (draw calls / triangles) and
`window.__gameDebug()` (state, stars, slimes, ground sampler) exist for the automated smoke test
(`npm run verify`, Playwright). `?level=N` in the URL starts directly on level N+1.
`node scripts/playtest-online.mjs` plays two browsers together through a real room code
(needs internet). `node scripts/playtest-fun.mjs` checks hats, dancing, balloons and Bubbly Beach;
`playtest-drive.mjs` checks the car; `playtest-fly.mjs` the helicopter, rings and rocket;
`playtest-touch.mjs` tablet controls with real multi-touch; `playtest-island.mjs` checks dress-up, pets, villagers and the boat.
