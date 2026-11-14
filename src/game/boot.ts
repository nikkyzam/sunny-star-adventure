/**
 * boot.ts — Sunny Star Adventure: orchestrates scene, world, players, systems and game flow.
 *
 * Contract with the React shell (src/pages/Home.tsx):
 *   startGame(canvas)  mounts renderer + loop onto an existing <canvas>
 *   stopGame()         tears everything down (loop, renderer, listeners, probe)
 * Calling startGame twice is safe: the previous session is stopped first, so React
 * StrictMode's double mount in dev never leaves two renderers alive.
 *
 * Self-check contract (scripts/verify-game.mjs): window.__gameProbe() returns P1 coordinates;
 * window.__GAME_READY__ flips true on the first rendered frame; Space starts a 1-player game
 * from the title; W moves forward (-Z) and D right (+X) at the default camera yaw.
 *
 * Modes: 1-player (WASD/arrows + Space), same-keyboard co-op (P1 WASD+Space, P2 arrows+Enter),
 * or online with friends via a room code (net.ts): each kid runs their own world; positions,
 * stickers, star pickups and level changes are shared. Online and easy mode never show game over.
 */

import * as THREE from "three";
import { GameLoop } from "./engine";
import { Input } from "./input";
import { AudioSystem } from "./audio";
import { GameStateMachine } from "./state";
import { World, LEVELS } from "./world";
import { Player } from "./player";
import { Stars } from "./stars";
import { Slimes } from "./slimes";
import { Birds } from "./birds";
import { Hedgehogs } from "./hedgehogs";
import { Pickups } from "./pickups";
import { Chests } from "./chests";
import { Buddies, BUDDY_NAMES } from "./buddies";
import { Car, makeRocket, type RideKind } from "./car";
import { Rings } from "./rings";
import { Foods } from "./food";
import { Fleet } from "./ships";
import { Props } from "./props";
import { Particles } from "./particles";
import { Hud } from "./hud";
import { storage, highScore } from "./storage";
import {
  OUTFITS, HATS, SKINS, PETS, loadProfile, saveProfile, rerollName, nameText, lookOf,
  safeName, safeOutfit, safeHat, safeSkin, safePet,
} from "./profile";
import { Pet } from "./pets";
import { Npcs } from "./npcs";
import { STICKERS, Bubble, makeTextSprite, disposeSprite } from "./social";
import { Net, MAX_KIDS, type NetMsg } from "./net";

declare global {
  interface Window {
    /** Player-coordinate probe — scripts/verify-game.mjs asserts direction mapping through it. */
    __gameProbe?: () => { x: number; y: number; z: number };
    /** Readiness signal — the self-check waits for it before screenshotting/asserting. */
    __GAME_READY__?: boolean;
    /** Perf probe — draw calls / triangles of the last rendered frame. */
    __perf?: () => { calls: number; triangles: number };
    /** Test hook — positions/state for the automated playtests. */
    __gameDebug?: () => {
      state: string;
      px: number; py: number; pz: number;
      p2x: number; p2y: number; p2z: number;
      players: number;
      canJump: boolean;
      stars: { x: number; y: number; z: number }[];
      portal: { x: number; y: number; z: number };
      portalUnlocked: boolean;
      hearts: number;
      coins: number;
      buddies: string[];
      chestsOpened: number;
      car: { x: number; y: number; z: number; occupied: boolean } | null;
      boat: { x: number; y: number; z: number; occupied: boolean } | null;
      heli: { x: number; y: number; z: number; occupied: boolean } | null;
      rings: number;
      food: number;
      shipsSunk: number;
      shipsAfloat: number;
      placeBoat: (x: number, z: number, heading: number) => void;
      big: number;
      npcsMet: number;
      inside: boolean;
      pet: { x: number; y: number; z: number } | null;
      onGround: boolean;
      slimes: { x: number; z: number }[];
      remotes: number;
      props: { cones: number; boxes: number };
      carSpeed: number;
      /** Test hooks: move the helicopter / the kid. */
      placeHeli: (x: number, y: number, z: number, heading: number) => void;
      warp: (x: number, z: number) => void;
      /** Test hook: park the car somewhere else. */
      placeCar: (x: number, z: number, heading: number) => void;
      groundAt: (x: number, z: number) => number | null;
    };
  }
}

const CAM_DIST = 8.2;
const KILL_Y = -12;
const UNLOCKED_KEY = "unlockedLevel";
const BUDDY_EMOJI: Record<string, string> = { bunny: "🐰", birdie: "🐦", turtle: "🐢" };
const P2_JUMP = "Enter";
const NET_SEND_EVERY = 4; // fixed steps between state packets (60 Hz / 4 = 15 Hz)
const REMOTE_TIMEOUT = 6; // seconds without a packet before a friend's kid is removed
const BALLOON_FLOAT = 3.5; // seconds a balloon carries a kid upward
const DANCE_KEY = "Digit7";

/** A friend's kid, driven by their network packets. */
interface Remote {
  p: Player;
  tag: THREE.Sprite;
  bubble: Bubble;
  seen: number;
  level: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  g: boolean; gl: boolean; r: boolean; f: number; fl: boolean; bg: boolean;
  /** Shown under a friend who is driving / sailing (their ride lives in their own game). */
  car: Car | null;
  /** Which ride they are in ("" when walking). */
  rk: RideKind | "";
  pet: Pet;
}

/** Untrusted number from the network: finite and inside the play space, else 0. */
function num(v: unknown, lim = 500): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0;
}

let session: { dispose: () => void } | null = null;

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame();

  // ── Renderer / scene / camera ────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff5dd, 1.7);
  sun.position.set(18, 30, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.002;
  sun.target.position.set(0, 0, -22);
  scene.add(sun);
  scene.add(sun.target);

  // ── Systems ──────────────────────────────────────────────────────────────
  const world = new World();
  const stars = new Stars();
  const slimes = new Slimes();
  const birds = new Birds();
  const hedgehogs = new Hedgehogs();
  const pickups = new Pickups();
  const chests = new Chests();
  const buddies = new Buddies();
  const car = new Car();
  const boat = new Car("boat");
  const heli = new Car("heli");
  const jet = new Car("jet");
  const rides = [car, boat, heli, jet];
  const RIDE_ICON: Record<RideKind, string> = { car: "🚗", boat: "⛵", heli: "🚁", jet: "✈️" };
  const rocket = makeRocket();
  rocket.visible = false;
  const rocketBase = new THREE.Vector3();
  let launchT = -1; // seconds since blast-off began (-1 = on the pad)
  const rings = new Rings();
  const foods = new Foods();
  const fleet = new Fleet();
  const props = new Props();
  const npcs = new Npcs();
  const pet = new Pet();
  const particles = new Particles();
  const hud = new Hud();
  const audio = new AudioSystem();
  const input = new Input(canvas);
  const sm = new GameStateMachine();

  const players: Player[] = [];
  const bubbles: Bubble[] = [];
  const blobs: THREE.Mesh[] = [];
  const blobGeo = new THREE.CircleGeometry(0.5, 20);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x1a2a1a, transparent: true, opacity: 0.28, depthWrite: false });

  scene.add(stars.group, slimes.group, birds.group, hedgehogs.group, pickups.group, chests.group, buddies.group, car.group, boat.group, heli.group, jet.group, rocket, rings.group, foods.group, fleet.group, props.group, npcs.group, pet.group, particles.points);

  // ── Run state ────────────────────────────────────────────────────────────
  let levelIdx = 0;
  let score = 0;
  let coinCount = 0;
  let levelStartScore = 0;
  let hearts = 3;
  let maxHearts = 3;
  let timer = 0;
  let lastShownSecond = -1;
  let lastMagnetSecond = -1;
  let magnetTimer = 0;
  let camYaw = 0;
  let camPitch = 0.42;
  let titleOrbit = 0;
  let shake = 0;
  let elapsed = 0;
  let pendingJump = false;
  let pendingJump2 = false;
  let portalHintCooldown = 0;
  let leashTimer = 0;
  let disposed = false;
  const profile = loadProfile();
  let net: Net | null = null;
  let connecting = false;
  let onlineMenuOpen = false;
  let dressOpen = false;
  let sendTick = 0;
  const remotes = new Map<string, Remote>();
  const respawn = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const scratch = new THREE.Vector3();

  hud.setMuted(audio.muted);
  hud.setBest(highScore.get());
  hud.setKidName(nameText(profile.name));
  hud.setEasy(profile.easy);
  hud.buildOutfits(OUTFITS.map((o) => o.jacket), profile.outfit, (i) => {
    profile.outfit = i;
    saveProfile(profile);
    hud.setChoice("outfits", i);
    previewKid();
    audio.sfx("ui");
  });
  hud.buildHats(HATS, profile.hat, (i) => {
    profile.hat = i;
    saveProfile(profile);
    hud.setChoice("hats", i);
    previewKid();
    audio.sfx("ui");
  });
  hud.buildSkins(SKINS, profile.skin, (i) => {
    profile.skin = i;
    saveProfile(profile);
    hud.setChoice("skins", i);
    previewKid();
    audio.sfx("ui");
  });
  hud.buildPets(PETS, profile.pet, (i) => {
    profile.pet = i;
    saveProfile(profile);
    hud.setChoice("pets", i);
    pet.setKind(i);
    pet.snapTo(players[0].pos.x, players[0].pos.y, players[0].pos.z);
    pet.cheer();
    audio.sfx(i === 0 ? "ui" : "pet");
  });
  // the last button in the sticker bar is the dance move
  hud.buildStickers([...STICKERS.map((st) => st.emoji), "💃"], (i) => (i < STICKERS.length ? sendSticker(i) : danceNow()));

  /** Live preview of a new outfit / skin / hat on the dress-up screen. */
  function previewKid(): void {
    if (!sm.is("title")) return;
    makePlayers(false);
    players[0].respawn(world.spawn.x, world.spawn.y, world.spawn.z);
    players[0].invuln = 0;
    players[0].dance();
  }

  /** The ride a kid is sitting in, or null. */
  function rideOf(p: Player): Car | null {
    return rides.find((v) => v.group.visible && v.has(p)) ?? null;
  }

  /** The closest ride a walking kid can reach (the boat is boarded from the dock, so it reaches further). */
  function rideInReach(): { ride: Car; kid: Player } | null {
    let best: { ride: Car; kid: Player } | null = null;
    let bestD = Infinity;
    for (const v of rides) {
      if (!v.group.visible) continue;
      const reach = v.kind === "car" ? 2.4 : 3.6;
      for (const p of players) {
        if (p.riding) continue;
        const d2 = v.pos.distanceToSquared(p.pos);
        if (d2 < reach * reach && d2 < bestD) { bestD = d2; best = { ride: v, kid: p }; }
      }
    }
    return best;
  }

  /** Where a pet should stand near (x, z): on the ground, or paddling at the water's surface. */
  function petGroundY(x: number, z: number, kidY: number): number {
    const g = world.groundAt(x, z, kidY + 0.4)?.y ?? kidY;
    return world.def.sea !== undefined ? Math.max(g, world.def.sea - 0.2) : g;
  }

  /** Easy mode and online play refill hearts instead of ending the game. */
  function forgiving(): boolean {
    return profile.easy || net !== null;
  }

  function computeMaxHearts(): number {
    return 3 + (buddies.has("turtle") ? 1 : 0);
  }

  function unlockedLevel(): number {
    const v = storage.get<number>(UNLOCKED_KEY, 0);
    return Math.min(Math.max(0, v), LEVELS.length - 1);
  }

  /** The big open-world level (the one with a sea). */
  function islandLevel(): number {
    return LEVELS.findIndex((l) => l.sea !== undefined);
  }

  function requestedStartLevel(): number {
    // ?level=N jumps straight into a level (used by the playtest harness; harmless for players)
    const raw = Number(new URLSearchParams(location.search).get("level") ?? "0");
    if (!Number.isFinite(raw)) return 0;
    return Math.min(Math.max(0, Math.floor(raw)), LEVELS.length - 1);
  }

  function makePlayers(coop: boolean): void {
    for (const p of players) {
      scene.remove(p.group);
    }
    for (const b of blobs) scene.remove(b);
    for (const b of bubbles) b.clear();
    players.length = 0;
    blobs.length = 0;
    bubbles.length = 0;
    const palettes = coop
      ? [lookOf(profile.outfit, profile.skin), lookOf((profile.outfit + 1) % OUTFITS.length, (profile.skin + 2) % SKINS.length)]
      : [lookOf(profile.outfit, profile.skin)];
    for (const pal of palettes) {
      const p = new Player(pal);
      if (players.length === 0) p.setHat(profile.hat);
      players.push(p);
      bubbles.push(new Bubble(p.group, 2.75));
      scene.add(p.group);
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blobs.push(blob);
      scene.add(blob);
    }
  }

  function loadLevel(i: number): void {
    levelIdx = i;
    world.buildLevel(i, scene);
    {
      const d = world.def;
      const watery = d.sea !== undefined || d.ocean === true;
      audio.setTrack(watery ? "island" : d.snow || d.space ? "snow" : d.carSpawn ? "city" : "meadow", d.sea !== undefined);
    }
    stars.build(world.starSpots);
    slimes.build(world.slimeSpecs);
    birds.build(world.def.birds ?? []);
    hedgehogs.build(world.def.hedgehogs ?? []);
    pickups.build(world.def.coins ?? [], world.def.hearts ?? [], world.def.magnets ?? [], world.def.balloons ?? []);
    chests.build(world.def.chests ?? []);
    buddies.build(world.def.buddies ?? []);
    props.build(world.def.props ?? {});
    world.setPortalUnlocked(false);

    maxHearts = computeMaxHearts();
    hearts = maxHearts;

    players.forEach((p, idx) => {
      p.respawn(world.spawn.x + idx * 1.4, world.spawn.y, world.spawn.z);
      p.glideEnabled = (world.def.freeGlide ?? false) || buddies.has("birdie");
    });
    respawn.copy(world.spawn);
    timer = 0;
    lastShownSecond = -1;
    magnetTimer = 0;
    leashTimer = 0;
    levelStartScore = score;
    camYaw = 0;
    camPitch = 0.42;

    // rides: nobody stays seated across a level load
    for (const v of rides) v.clearRiders();
    audio.engineStop();
    car.group.visible = world.def.carSpawn !== undefined;
    car.shoreY = world.def.sea !== undefined ? world.def.sea - 0.3 : null;
    if (world.def.carSpawn) {
      const [cx, cy, cz, ch] = world.def.carSpawn;
      car.place(cx, cy, cz, ch);
    }
    boat.group.visible = world.def.boatSpawn !== undefined && world.def.sea !== undefined;
    if (world.def.boatSpawn && world.def.sea !== undefined) {
      const [bx, bz, bh] = world.def.boatSpawn;
      boat.placeBoat(bx, bz, bh, world.def.sea);
    }

    for (const [v, at] of [[heli, world.def.heliSpawn], [jet, world.def.jetSpawn]] as const) {
      v.group.visible = at !== undefined;
      if (at) v.place(at[0], at[1], at[2], at[3]);
    }
    rocket.visible = world.def.rocket !== undefined;
    launchT = -1;
    if (world.def.rocket) {
      rocketBase.set(world.def.rocket[0], world.def.rocket[1], world.def.rocket[2]);
      rocket.position.copy(rocketBase);
    }
    rings.build(world.def.rings ?? []);
    foods.build(world.def.food ?? []);
    fleet.build(world.def.pirates ?? [], world.def.sea ?? 0);

    npcs.build(world.def.npcs ?? []);
    pet.setKind(profile.pet);
    pet.snapTo(world.spawn.x, world.spawn.y, world.spawn.z);

    hud.setHearts(hearts, maxHearts);
    hud.setStars(0, stars.total);
    hud.setCoins(coinCount);
    hud.setMagnet(null);
    hud.setScore(score);
    hud.setLevel(`${i + 1}. ${world.def.name}`);
    hud.setTime(0);
    hud.setBuddies(buddies.active.map((b) => BUDDY_EMOJI[b.type]).join(" "));
  }

  function startRun(level: number, coop: boolean): void {
    score = 0;
    coinCount = 0;
    levelStartScore = 0;
    buddies.resetRun();
    makePlayers(coop);
    loadLevel(level);
    onlineMenuOpen = false;
    dressOpen = false;
    sm.transition("playing");
    hud.showOverlay(null);
    hud.setPlayingUi(true);
    audio.startMusic();
    audio.sfx("ui");
    if (onTouch()) hud.showToast("👈 Left thumb moves · JUMP is on the right 👉");
  }

  function saveProgress(): void {
    const best = highScore.get();
    if (score > best) highScore.set(score);
    hud.setBest(highScore.get());
  }

  function levelComplete(): void {
    const timeBonus = Math.max(0, 180 - Math.floor(timer)) * 5;
    score += timeBonus;
    // never lower saved progress (replaying an early level must not re-lock later ones)
    storage.set(UNLOCKED_KEY, Math.max(unlockedLevel(), Math.min(levelIdx + 1, LEVELS.length - 1)));
    saveProgress();
    audio.sfx("portal");
    particles.burst(world.portalPos.x, world.portalPos.y + 1.8, world.portalPos.z, 0xffd93d, 40, 6, 1.1, 4);
    const last = levelIdx + 1 >= LEVELS.length;
    if (net) net.send(last ? { t: "win" } : { t: "level", i: levelIdx + 1 });
    if (last) {
      showWin();
    } else if (net) {
      // online: everyone hops to the next level together, no overlay in between
      friendsGoTo(levelIdx + 1, `🎉 Level clear! On to ${LEVELS[levelIdx + 1].name}!`);
    } else {
      hud.fillClear(stars.takenCount, stars.total, timer, timeBonus, score);
      hud.setPlayingUi(false);
      hud.showOverlay("clear");
      sm.transition("levelclear");
      audio.sfx("win");
    }
  }

  function showWin(): void {
    if (sm.is("paused")) resumePlay();
    hud.fillWin(score, highScore.get());
    hud.setPlayingUi(false);
    hud.showOverlay("win");
    sm.transition("win");
    audio.sfx("win");
  }

  function friendsGoTo(level: number, toast: string): void {
    storage.set(UNLOCKED_KEY, Math.max(unlockedLevel(), level));
    loadLevel(level);
    hud.showToast(toast);
    audio.sfx("win");
  }

  function gameOver(): void {
    saveProgress();
    hud.fillGameOver(score, highScore.get());
    hud.setPlayingUi(false);
    hud.showOverlay("gameover");
    sm.transition("gameover");
    audio.sfx("lose");
  }

  function loseHeart(kind: "enemy" | "fall", player?: Player, src?: THREE.Vector3): void {
    if (!sm.is("playing")) return; // a second hit in the same step after game over
    hearts--;
    hud.setHearts(hearts, maxHearts);
    hud.flashHurt();
    shake = Math.max(shake, 0.5);
    if (hearts <= 0) {
      if (!forgiving()) {
        gameOver();
        return;
      }
      hearts = maxHearts;
      hud.setHearts(hearts, maxHearts);
      hud.showToast("Hearts refilled — keep going! 💖");
    }
    if (kind === "fall") {
      audio.sfx("fall");
      if (player) player.respawn(respawn.x, respawn.y, respawn.z);
    } else if (player && src) {
      audio.sfx("hurt");
      const dx = player.pos.x - src.x;
      const dz = player.pos.z - src.z;
      const len = Math.hypot(dx, dz) || 1;
      player.vel.x = (dx / len) * 5.5;
      player.vel.z = (dz / len) * 5.5;
      player.vel.y = 5;
      player.invuln = 1.6;
    }
  }

  // ── Flow helpers (shared by buttons and the Space/Enter context action) ──
  function backToPlay(): void {
    sm.transition("playing");
    hud.showOverlay(null);
    hud.setPlayingUi(true);
    audio.sfx("ui");
  }

  function resumePlay(): void {
    if (sm.is("paused")) backToPlay();
  }

  function retryLevel(): void {
    if (!sm.is("gameover", "paused")) return;
    score = levelStartScore;
    loadLevel(levelIdx);
    backToPlay();
  }

  function nextLevel(): void {
    if (!sm.is("levelclear")) return;
    loadLevel(levelIdx + 1);
    backToPlay();
  }

  function toTitle(): void {
    if (!sm.is("paused", "gameover", "levelclear", "win")) return;
    leaveOnline();
    sm.transition("title");
    makePlayers(false);
    loadLevel(0);
    hud.showOverlay("title");
    hud.setPlayingUi(false);
    hud.setBest(highScore.get());
    hud.showContinue(unlockedLevel() > 0, LEVELS[unlockedLevel()].name);
    audio.sfx("ui");
  }

  function playAgain(): void {
    if (net) net.send({ t: "level", i: 0 });
    startRun(0, players.length === 2 && !net);
  }

  // ── Button / action routing ──────────────────────────────────────────────
  hud.onAction((a) => {
    switch (a) {
      case "play": startRun(requestedStartLevel(), false); break;
      case "play2": startRun(requestedStartLevel(), true); break;
      case "continue": if (sm.is("title")) startRun(unlockedLevel(), false); break;
      case "island":
        if (!sm.is("title")) break;
        startRun(islandLevel(), false);
        hud.showToast("🏝️ Explore! Talk to the villagers, sail the boat, drive the car");
        break;
      case "dress":
        if (!sm.is("title")) break;
        dressOpen = true;
        hud.showOverlay("dress");
        previewKid();
        audio.sfx("ui");
        break;
      case "talk": talk(); break;
      case "drive":
        if (!sm.is("title")) break;
        startRun(LEVELS.findIndex((l) => l.carSpawn), false);
        hud.showToast("🚗 Walk to the red car and hop in!");
        break;
      case "car": toggleCar(); break;
      case "honk": honk(); break;
      case "again": playAgain(); break;
      case "next": nextLevel(); break;
      case "retry": retryLevel(); break;
      case "resume": resumePlay(); break;
      case "title": toTitle(); break;
      case "jump": pendingJump = true; break;
      case "mute": hud.setMuted(audio.toggleMute()); break;
      case "reroll":
        rerollName(profile);
        saveProfile(profile);
        hud.setKidName(nameText(profile.name));
        audio.sfx("ui");
        break;
      case "easy":
        profile.easy = !profile.easy;
        saveProfile(profile);
        hud.setEasy(profile.easy);
        audio.sfx("ui");
        break;
      case "online":
        if (!sm.is("title")) break;
        onlineMenuOpen = true;
        hud.setOnlineStatus("");
        hud.showOverlay("online");
        audio.sfx("ui");
        break;
      case "back":
        onlineMenuOpen = false;
        dressOpen = false;
        hud.showOverlay("title");
        break;
      case "host": hostRoom(); break;
      case "join": joinRoom(); break;
    }
  });

  /** Space / Enter context action, by state. */
  function primaryAction(): void {
    if (sm.is("title")) {
      if (onlineMenuOpen || dressOpen) return; // those screens are waiting on a button, not Space
      const u = unlockedLevel();
      startRun(u > 0 ? u : requestedStartLevel(), false);
    } else if (sm.is("playing")) {
      pendingJump = true;
    } else if (sm.is("paused")) {
      resumePlay();
    } else if (sm.is("gameover")) {
      retryLevel();
    } else if (sm.is("levelclear")) {
      nextLevel();
    } else if (sm.is("win")) {
      toTitle();
    }
  }

  function togglePause(): void {
    if (sm.is("playing")) {
      sm.transition("paused");
      hud.showOverlay("pause");
      hud.setPlayingUi(false);
      audio.sfx("ui");
    } else {
      resumePlay();
    }
  }

  // ── Car: hop in / out, honk ──────────────────────────────────────────────
  /** Playing with fingers (tablet / phone): hints talk about the stick and buttons, not keys. */
  function onTouch(): boolean {
    return document.body.classList.contains("touch");
  }

  /** Any ride with an engine (everything but the sailboat) that has a driver. */
  function engineRide(): Car | undefined {
    return rides.find((v) => v.group.visible && v.kind !== "boat" && v.driver);
  }

  function nearRocket(): boolean {
    return rocket.visible && launchT < 0 && players.some((p) => !p.riding && rocketBase.distanceToSquared(p.pos) < 3.4 * 3.4);
  }

  /** Blast off: everyone climbs in, the rocket rises, and the next world loads (see step()). */
  function startLaunch(): void {
    for (const v of rides) for (const p of players) if (v.has(p)) v.exit(p);
    audio.engineStop();
    launchT = 0;
    for (const p of players) {
      p.riding = true; // skips the kid's own physics while they're inside
      p.group.visible = false;
    }
    hud.showToast("3… 2… 1… BLAST OFF! 🚀");
    audio.sfx("portal");
  }

  function toggleCar(): void {
    if (!sm.is("playing") || launchT >= 0) return;
    for (const v of rides) {
      const rider = v.group.visible ? players.find((p) => v.has(p)) : undefined;
      if (rider) {
        v.exit(rider);
        if (!engineRide()) audio.engineStop();
        audio.sfx("ui");
        return;
      }
    }
    const near = rideInReach();
    if (!near) {
      if (nearRocket()) startLaunch();
      return;
    }
    const seat = near.ride.board(near.kid);
    if (seat === "driver" && near.ride.flies) {
      audio.sfx("powerup");
      audio.engineStart();
      const what = near.ride.kind === "heli" ? "🚁 Hold JUMP to fly up, let go to come down" : "✈️ Go fast, then hold JUMP to take off";
      hud.showToast(onTouch() ? `${what} · stick steers` : `${what} · move keys steer · E hops out`);
    } else if (seat === "driver" && near.ride.kind === "boat") {
      audio.sfx("powerup");
      audio.sfx("splash");
      hud.showToast(onTouch() ? "⛵ Stick sails · JUMP fires the cannon at pirate ships!" : "⛵ Move keys sail · Space fires the cannon at pirate ships · E hops out");
    } else if (seat === "driver") {
      audio.sfx("honk");
      audio.engineStart();
      hud.showToast(onTouch() ? "🚗 Use the stick to drive · JUMP hops · 📣 honks" : "🚗 Move keys to drive · Space hops · H honks · E hops out");
    } else if (seat === "passenger") {
      audio.sfx("ui");
      hud.showToast("Enjoy the ride!");
    }
  }

  function honk(): void {
    const v = rides.find((r) => r.group.visible && r.driver);
    if (!sm.is("playing") || !v) return;
    audio.sfx("honk");
    particles.burst(v.pos.x, v.pos.y + 1.4, v.pos.z, 0xffe27a, 8, 2.5, 0.5, 3);
    net?.send({ t: "hk", L: levelIdx });
  }

  // ── Villagers ────────────────────────────────────────────────────────────
  function talk(): void {
    if (!sm.is("playing") || players[0].riding) return;
    const npc = npcs.nearest(players[0].pos);
    if (!npc) return;
    const said = npcs.talk(npc);
    hud.showDialog(said.name, said.text);
    audio.sfx("talk");
    if (!said.firstTime) return;
    // meeting someone new: a little welcome gift
    coinCount += 3;
    score += 30;
    hud.setCoins(coinCount);
    hud.setScore(score);
    audio.sfx("buddy");
    particles.burst(npc.p.pos.x, npc.p.pos.y + 1.6, npc.p.pos.z, 0xffc93c, 14, 3, 0.8, 4);
    if (npcs.metCount === npcs.items.length) {
      score += 200;
      hud.setScore(score);
      hud.showToast("You met everyone on the islands! 🎉 +200");
    }
  }

  // ── Stickers & dancing ───────────────────────────────────────────────────
  function danceNow(): void {
    if (!sm.is("playing") || players[0].riding) return;
    players[0].dance();
    pet.cheer();
    audio.sfx("buddy");
    if (pet.active) audio.sfx("pet");
    net?.send({ t: "d" });
  }

  function sendSticker(i: number): void {
    if (!sm.is("playing") || !STICKERS[i]) return;
    bubbles[0]?.show(i);
    if (STICKERS[i].emoji === "❤️" && pet.active) {
      pet.cheer();
      audio.sfx("pet");
    }
    audio.sfx("ui");
    net?.send({ t: "e", k: i });
  }

  // ── Online: rooms, friends' kids, shared stars and levels ───────────────
  function roomPill(): void {
    if (!net) hud.setRoom(null);
    else hud.setRoom(`🌐 ${net.code} · ${remotes.size + 1} kid${remotes.size ? "s" : ""}`);
  }

  function removeRemote(id: string): void {
    const r = remotes.get(id);
    if (!r) return;
    disposeSprite(r.tag);
    r.bubble.clear();
    if (r.car) scene.remove(r.car.group);
    scene.remove(r.pet.group);
    scene.remove(r.p.group);
    remotes.delete(id);
    roomPill();
  }

  function leaveOnline(): void {
    net?.dispose();
    net = null;
    for (const id of [...remotes.keys()]) removeRemote(id);
    hud.setRoom(null);
  }

  function takenStarIndices(): number[] {
    return stars.items.flatMap((st, i) => (st.taken ? [i] : []));
  }

  function onNetMessage(m: NetMsg): void {
    const from = typeof m.id === "string" ? m.id : "";
    switch (m.t) {
      case "s": {
        let r = remotes.get(from);
        if (!r) {
          if (remotes.size >= MAX_KIDS - 1 || !from) return;
          const p = new Player(lookOf(safeOutfit(m.o), safeSkin(m.sk)));
          p.setHat(safeHat(m.h));
          const tag = makeTextSprite(nameText(safeName(m.n)), { bg: "rgba(108,92,231,0.88)", fg: "#ffffff", size: 44, height: 0.4 });
          tag.position.y = 2.25;
          p.group.add(tag);
          p.pos.set(num(m.x), num(m.y), num(m.z));
          scene.add(p.group);
          r = { p, tag, bubble: new Bubble(p.group, 2.75), seen: elapsed, level: -1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: true, gl: false, r: false, f: 0, fl: false, bg: false, car: null, rk: "", pet: new Pet() };
          scene.add(r.pet.group);
          remotes.set(from, r);
          roomPill();
          hud.showToast(`${nameText(safeName(m.n))} is here! 👋`);
        }
        r.seen = elapsed;
        r.level = num(m.L);
        r.x = num(m.x); r.y = num(m.y); r.z = num(m.z);
        r.vx = num(m.vx, 40); r.vy = num(m.vy, 40); r.vz = num(m.vz, 40);
        r.g = m.g === true; r.gl = m.gl === true; r.r = m.r === true; r.f = num(m.f, 100); r.fl = m.fl === true; r.bg = m.bg === true;
        r.rk = m.rk === "car" || m.rk === "boat" || m.rk === "heli" || m.rk === "jet" ? m.rk : "";
        r.p.setHat(safeHat(m.h));
        r.pet.setKind(safePet(m.pt));
        break;
      }
      case "d": {
        const r = remotes.get(from);
        r?.p.dance();
        r?.pet.cheer();
        break;
      }
      case "hk":
        if (num(m.L) === levelIdx && sm.is("playing") && remotes.has(from)) audio.sfx("honk");
        break;
      case "e": {
        const k = num(m.k);
        if (Number.isInteger(k)) remotes.get(from)?.bubble.show(k);
        break;
      }
      case "star": {
        if (num(m.L) !== levelIdx || !sm.is("playing", "paused")) return;
        const got = stars.takeIndex(num(m.i));
        if (!got) return;
        hud.setStars(stars.takenCount, stars.total);
        audio.sfx("star");
        particles.burst(got.x, got.y, got.z, 0xffd93d, 18, 4, 0.8, 6);
        if (stars.allCollected) {
          world.setPortalUnlocked(true);
          audio.sfx("unlock");
          hud.showToast("Your team opened the portal! ✨");
        }
        break;
      }
      case "level": {
        const i = num(m.i);
        if (!Number.isInteger(i) || i < 0 || i >= LEVELS.length) return;
        if (sm.is("title", "win")) {
          // just joined (or the host pressed Play again): start on the room's level
          startRun(i, false);
          roomPill();
          hud.showToast(`Joined room ${net?.code ?? ""}! Say hi with the 👋 sticker`);
        } else if (i !== levelIdx) {
          if (sm.is("paused")) resumePlay();
          if (sm.is("playing")) friendsGoTo(i, `🎉 A friend opened the portal! On to ${LEVELS[i].name}!`);
        }
        if (Array.isArray(m.taken)) {
          for (const idx of m.taken) stars.takeIndex(num(idx));
          hud.setStars(stars.takenCount, stars.total);
          if (stars.allCollected) world.setPortalUnlocked(true);
        }
        break;
      }
      case "win":
        if (sm.is("playing", "paused")) showWin();
        break;
      case "bye":
        if (typeof m.who === "string") removeRemote(m.who);
        break;
    }
  }

  function wireNet(n: Net): void {
    n.onMessage = onNetMessage;
    n.onPeerJoined = (id) => n.sendTo(id, { t: "level", i: levelIdx, taken: takenStarIndices() });
    n.onPeerLeft = (id) => removeRemote(id);
    n.onHostLost = () => {
      leaveOnline();
      hud.showToast("The room closed — you can keep playing on your own!");
    };
  }

  function hostRoom(): void {
    if (connecting || net || !sm.is("title")) return;
    connecting = true;
    hud.setOnlineStatus("Making a room…");
    Net.host().then((n) => {
      connecting = false;
      if (disposed || !onlineMenuOpen) { n.dispose(); return; }
      net = n;
      wireNet(n);
      // friends meet on the big island unless the link asks for a level
      startRun(new URLSearchParams(location.search).has("level") ? requestedStartLevel() : islandLevel(), false);
      roomPill();
      hud.showToast(`Your room code is ${n.code} — tell your friends!`);
    }, (err: Error) => {
      connecting = false;
      hud.setOnlineStatus(err.message);
    });
  }

  function joinRoom(): void {
    if (connecting || net || !sm.is("title")) return;
    connecting = true;
    hud.setOnlineStatus("Looking for the room…");
    Net.join(hud.joinCode()).then((n) => {
      connecting = false;
      if (disposed || !onlineMenuOpen) { n.dispose(); return; }
      net = n;
      wireNet(n);
      hud.setOnlineStatus("Found it! Getting ready…"); // the host answers with the level to start on
    }, (err: Error) => {
      connecting = false;
      hud.setOnlineStatus(err.message);
    });
  }

  function sendState(): void {
    if (!net) return;
    const p = players[0];
    net.send({
      t: "s", L: levelIdx, n: profile.name, o: profile.outfit, sk: profile.skin, pt: profile.pet, rk: rideOf(p)?.kind ?? "",
      x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: p.vel.x, vy: p.vel.y, vz: p.vel.z,
      g: p.onGround, gl: p.glideActive, r: p.riding, f: p.facing, fl: p.floatT > 0, bg: p.bigT > 0, h: profile.hat,
    });
  }

  function updateRemotes(dt: number): void {
    for (const [id, r] of remotes) {
      if (elapsed - r.seen > REMOTE_TIMEOUT) {
        removeRemote(id);
        continue;
      }
      r.p.group.visible = r.level === levelIdx && sm.is("playing", "paused");
      // a driving / sailing friend gets a car or boat under them
      const driving = r.p.group.visible && r.r;
      const kind = r.rk || "car";
      if (driving && r.car?.kind !== kind) {
        if (r.car) scene.remove(r.car.group);
        r.car = new Car(kind);
        scene.add(r.car.group);
      }
      if (r.car) {
        r.car.group.visible = driving;
        if (driving) {
          // inverse of Car.seat(): the driver sits seatZ ahead of and seatY above the ride's origin
          r.car.pos.set(
            r.p.pos.x - Math.sin(r.f) * r.car.seatZ, r.p.pos.y - r.car.seatY, r.p.pos.z - Math.cos(r.f) * r.car.seatZ);
          r.car.group.rotation.y = r.f;
        }
      }
      r.pet.group.visible = r.p.group.visible;
      if (r.pet.group.visible) {
        r.pet.update(dt, elapsed, r.p.pos.x, petGroundY(r.pet.group.position.x, r.pet.group.position.z, r.p.pos.y), r.p.pos.z);
      }
      if (r.p.group.visible) r.p.applyRemote(dt, r.x, r.y, r.z, r.vx, r.vy, r.vz, r.g, r.gl, r.r, r.f, r.fl, r.bg);
      r.bubble.update(dt);
    }
  }

  const onBlur = () => { if (sm.is("playing")) togglePause(); };
  window.addEventListener("blur", onBlur);

  // ── Initial: title screen over level 1 (single preview player) ──────────
  makePlayers(false);
  loadLevel(0);
  hud.showOverlay("title");
  hud.setPlayingUi(false);
  hud.showContinue(unlockedLevel() > 0, LEVELS[unlockedLevel()].name);

  function activeP2(): Player | null {
    return players.length > 1 ? players[1] : null;
  }

  /** Trampoline effects, shared by top landings (ev.sprung) and side touches. */
  function springFx(p: Player): void {
    audio.sfx("boing");
    shake = Math.max(shake, 0.25);
    particles.burst(p.pos.x, p.pos.y, p.pos.z, 0xffe27a, 14, 3.5, 0.6, 8);
  }

  // ── Fixed-step update ────────────────────────────────────────────────────
  function step(dt: number): void {
    // camera look is always drained so menu drags can't snap the camera when play starts
    const look = input.consumeLook();

    // global keys, valid in every state
    if (input.consumeAction("Space")) primaryAction();
    if (input.consumeAction(P2_JUMP)) {
      if (sm.is("playing")) pendingJump2 = true;
      else primaryAction();
    }
    if (input.consumeAction("Escape") || input.consumeAction("KeyP")) togglePause();
    if (input.consumeAction("KeyM")) hud.setMuted(audio.toggleMute());
    for (let k = 0; k < STICKERS.length; k++) {
      if (input.consumeAction(`Digit${k + 1}`)) sendSticker(k);
    }
    if (input.consumeAction(DANCE_KEY)) danceNow();
    if (input.consumeAction("KeyE")) toggleCar();
    if (input.consumeAction("KeyH")) honk();
    if (input.consumeAction("KeyF")) talk();

    if (sm.is("paused")) return;

    // the world stays alive on every screen (title orbit, overlays, gameplay)
    elapsed += dt;
    world.update(dt);
    stars.update(elapsed);
    slimes.update(dt, elapsed);
    birds.update(dt, elapsed);
    hedgehogs.update(dt, elapsed);
    pickups.update(elapsed, dt);
    chests.update(dt);
    particles.update(dt);
    buddies.update(dt, elapsed, players[0].pos, players[0].facing);
    for (const b of bubbles) b.update(dt);
    updateRemotes(dt);
    npcs.update(dt, players[0].pos);
    world.updateCutaway(players.map((p) => p.pos));
    {
      const k = players[0];
      pet.update(dt, elapsed, k.pos.x, petGroundY(pet.group.position.x, pet.group.position.z, k.pos.y), k.pos.z);
    }

    if (sm.is("title") && dressOpen) {
      // dress-up: a close look at the kid, who stands in the top half above the panel
      const k = players[0];
      k.applyRemote(dt, k.pos.x, k.pos.y, k.pos.z, 0, 0, 0, true, false, false, k.facing, false);
      const a = Math.PI + Math.sin(elapsed * 0.6) * 0.45; // the kid faces -Z: look from that side
      camDesired.set(k.pos.x + Math.sin(a) * 4.6, k.pos.y + 1.5, k.pos.z + Math.cos(a) * 4.6);
      camera.position.lerp(camDesired, Math.min(1, dt * 4));
      camTarget.set(k.pos.x, k.pos.y - 0.1, k.pos.z);
      camera.lookAt(camTarget);
      return;
    }
    if (!sm.is("playing")) {
      // gentle title-screen camera orbit around the first island
      titleOrbit += dt * 0.12;
      const cx = world.spawn.x;
      const cz = world.spawn.z - 6;
      camDesired.set(cx + Math.sin(titleOrbit) * 11, 4.2, cz + Math.cos(titleOrbit) * 11);
      camera.position.lerp(camDesired, Math.min(1, dt * 2.5));
      camTarget.set(cx, 0.8, cz);
      camera.lookAt(camTarget);
      return;
    }

    // ── playing ──
    camYaw += look.yaw;
    camPitch = THREE.MathUtils.clamp(camPitch + look.pitch, -0.1, 1.05);

    // while driving or sailing the camera swings in behind the ride, so "up" is always "go"
    const myRide = players.length === 1 ? rideOf(players[0]) : null;
    if (myRide && myRide.driver === players[0]) {
      let d = myRide.heading + Math.PI - camYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      camYaw += d * Math.min(1, dt * 3);
    }

    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const p2 = activeP2();

    // per-player axes: in 1P mode arrows merge into P1; in co-op arrows belong to P2
    const axesOf = (idx: number) => {
      let mx: number, mz: number;
      if (idx === 0) {
        mx = p2 ? input.moveX : input.moveX + input.move2X;
        mz = p2 ? input.moveZ : input.moveZ + input.move2Z;
      } else {
        mx = input.move2X;
        mz = input.move2Z;
      }
      mx = THREE.MathUtils.clamp(mx, -1, 1);
      mz = THREE.MathUtils.clamp(mz, -1, 1);
      let wishX = fx * mz + rx * mx;
      let wishZ = fz * mz + rz * mx;
      const wl = Math.hypot(wishX, wishZ);
      if (wl > 1) { wishX /= wl; wishZ /= wl; }
      return { wishX, wishZ };
    };

    const jumpNow = pendingJump;
    const jump2Now = p2 ? pendingJump2 : false;
    pendingJump = false;
    pendingJump2 = false;

    // rides: driver input, riders skip their own controller
    for (const v of rides) {
      if (!v.group.visible) continue;
      if (!v.driver) {
        v.update(dt, 0, 0, world);
        continue;
      }
      const driverIdx = Math.max(0, players.indexOf(v.driver));
      v.lift = driverIdx === 1 ? input.isHeld(P2_JUMP) : input.isHeld("Space") || hud.jumpHeld;
      // the driver's jump key makes the car hop
      const pressed = driverIdx === 1 ? jump2Now : jumpNow;
      if (pressed && v.jump(7.5)) audio.sfx("jump");
      // the sailboat's jump key fires its cannon
      if (pressed && v.kind === "boat" && fleet.fire(v.pos, v.heading)) {
        audio.sfx("stomp");
        shake = Math.max(shake, 0.2);
        particles.burst(v.pos.x + Math.sin(v.heading) * 2.2, v.pos.y + 1.1, v.pos.z + Math.cos(v.heading) * 2.2, 0xffffff, 8, 3, 0.4, 2);
      }
      const a = axesOf(driverIdx);
      // camera-relative wish → ride-local: forward component accelerates, lateral steers
      const cfX = Math.sin(v.heading), cfZ = Math.cos(v.heading);
      const crX = Math.cos(v.heading), crZ = -Math.sin(v.heading);
      const fwd = a.wishX * cfX + a.wishZ * cfZ;
      const lat = a.wishX * crX + a.wishZ * crZ;
      // pushing sideways also drives forward, so the ride turns toward where the kid points
      // instead of sitting still; only pushing backwards reverses
      const mag = Math.hypot(a.wishX, a.wishZ);
      v.update(dt, -lat, fwd >= -0.5 * mag ? mag : fwd, world);
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.riding) continue;
      const a = axesOf(i);
      const wantJump = i === 0 ? jumpNow : jump2Now;
      const glideHeld = i === 0 ? input.isHeld("Space") || hud.jumpHeld : input.isHeld(P2_JUMP);
      // wading through the sea is slow (the boat is the fast way across)
      const wading = world.def.sea !== undefined && p.onGround && p.pos.y < world.def.sea - 0.2;
      const pace = wading ? 0.55 : 1;
      const ev = p.update(dt, a.wishX * pace, a.wishZ * pace, wantJump, glideHeld, world);
      npcs.pushOut(p.pos);
      if (wading && Math.random() < dt * 5 && Math.hypot(p.vel.x, p.vel.z) > 1) {
        particles.burst(p.pos.x, world.def.sea! + 0.05, p.pos.z, 0xdff6ff, 3, 1.5, 0.4, 3);
        audio.sfx("splash");
      }
      if (ev.jumped) audio.sfx("jump");
      if (ev.doubleJumped) {
        audio.sfx("doublejump");
        particles.burst(p.pos.x, p.pos.y + 0.1, p.pos.z, 0xffffff, 10, 2.5, 0.5, 6);
      }
      if (ev.landed) {
        audio.sfx("land");
        particles.burst(p.pos.x, p.pos.y + 0.05, p.pos.z, 0xfff3d6, 8, 2, 0.4, 7);
      }
      if (ev.sprung > 0) springFx(p);
    }

    // trampolines trigger on touch, not just on a top landing
    for (const p of players) {
      if (p.riding || p.vel.y > 0.5) continue;
      for (const plat of world.platforms) {
        if (plat.spring <= 0) continue;
        const dx = plat.x - p.pos.x;
        const dz = plat.z - p.pos.z;
        if (dx * dx + dz * dz > (plat.r + 0.25) * (plat.r + 0.25)) continue;
        if (p.pos.y > plat.topY + 0.25 || p.pos.y < plat.topY - 1.3) continue;
        p.bounce(plat.spring);
        plat.squashT = 1;
        springFx(p);
        break;
      }
    }

    timer += dt;
    const sec = Math.floor(timer);
    if (sec !== lastShownSecond) {
      lastShownSecond = sec;
      hud.setTime(sec);
    }

    // magnet power-up timer
    if (magnetTimer > 0) {
      magnetTimer -= dt;
      const ms = Math.ceil(magnetTimer);
      if (ms !== lastMagnetSecond) {
        lastMagnetSecond = ms;
        hud.setMagnet(ms > 0 ? ms : null);
      }
    }

    // pickups (coins / hearts / magnets): players + the bunny buddy vacuum + the car
    const collectRadius = magnetTimer > 0 ? 5 : 1.5;
    const handlePickupAt = (pos: THREE.Vector3, radius: number, type?: "coin" | "heart" | "magnet" | "balloon", who?: Player) => {
      scratch.copy(pos);
      scratch.y += 0.8;
      const got = pickups.collectNear(scratch, radius, type);
      if (!got) return false;
      if (got.type === "coin") {
        coinCount++;
        score += 10;
        hud.setCoins(coinCount);
        hud.setScore(score);
        audio.sfx("coin");
        particles.burst(got.base.x, got.base.y, got.base.z, 0xffc93c, 8, 2.5, 0.5, 5);
      } else if (got.type === "heart") {
        hearts = Math.min(maxHearts, hearts + 1);
        hud.setHearts(hearts, maxHearts);
        audio.sfx("powerup");
        hud.showToast("+1 ♥");
        particles.burst(got.base.x, got.base.y, got.base.z, 0xff4d6d, 14, 3, 0.7, 5);
      } else if (got.type === "balloon") {
        who?.startFloat(BALLOON_FLOAT);
        audio.sfx("boing");
        hud.showToast("Up, up and away! 🎈");
        particles.burst(got.base.x, got.base.y, got.base.z, 0xff9ecf, 12, 2.5, 0.6, 4);
      } else {
        magnetTimer = 8;
        lastMagnetSecond = -1;
        audio.sfx("powerup");
        hud.showToast("Star magnet! 🧲");
        particles.burst(got.base.x, got.base.y, got.base.z, 0xff4757, 16, 3.5, 0.8, 5);
      }
      return true;
    };
    for (const p of players) {
      if (p.riding) continue;
      handlePickupAt(p.pos, collectRadius);
      handlePickupAt(p.pos, collectRadius); // up to two per frame when crossing a cluster
      if (buddies.has("bunny")) handlePickupAt(p.pos, 3.2, "coin");
      handlePickupAt(p.pos, 1.3, "balloon", p);
    }
    for (const v of rides) {
      if (!v.group.visible || !v.occupied) continue;
      handlePickupAt(v.pos, 2.0, "coin");
      handlePickupAt(v.pos, 2.0, "coin");
    }

    // stars
    for (const p of players) {
      const got = p.riding
        ? stars.tryCollect((rideOf(p) ?? car).pos)
        : (magnetTimer > 0 ? stars.tryCollectFar(p.pos, 5) : stars.tryCollect(p.pos));
      if (got) {
        score += 100;
        hud.setScore(score);
        hud.setStars(stars.takenCount, stars.total);
        net?.send({ t: "star", L: levelIdx, i: stars.indexOf(got) });
        audio.sfx("star");
        particles.burst(got.x, got.y, got.z, 0xffd93d, 18, 4, 0.8, 6);
        if (stars.allCollected) {
          world.setPortalUnlocked(true);
          audio.sfx("unlock");
          hud.showToast("Portal unlocked! ✨");
        }
        break; // one star per frame is plenty
      }
    }

    // treasure chests (riders too: bump one with the car)
    for (const p of players) {
      const chest = chests.tryOpen(p.pos);
      if (chest) {
        score += 150;
        hud.setScore(score);
        audio.sfx("chest");
        hud.showToast("Treasure! +150 🎁");
        particles.burst(chest.pos.x, chest.pos.y + 0.8, chest.pos.z, 0xffc93c, 26, 4.5, 1.0, 6);
        break;
      }
    }

    // animal buddies: adopt on touch
    for (const p of players) {
      if (p.riding) continue;
      const adopted = buddies.tryAdopt(p.pos);
      if (adopted) {
        audio.sfx("buddy");
        particles.burst(p.pos.x, p.pos.y + 1, p.pos.z, 0xff9ecf, 22, 4, 0.9, 5);
        if (adopted === "birdie") {
          for (const pl of players) pl.glideEnabled = true;
          hud.showToast("🐦 Pip joined! Hold jump to glide!");
        } else if (adopted === "bunny") {
          hud.showToast("🐰 Hops joined! It vacuums up coins!");
        } else {
          maxHearts = computeMaxHearts();
          hearts = Math.min(maxHearts, hearts + 1);
          hud.setHearts(hearts, maxHearts);
          hud.showToast("🐢 Shelly joined! +1 max heart!");
        }
        hud.setBuddies(buddies.active.map((b) => BUDDY_EMOJI[b.type]).join(" "));
        break;
      }
    }

    // enemies: stomp from above, hurt from the side (spiked hedgehogs always hurt)
    const touchEnemy = (ex: number, ey: number, ez: number, spiky: boolean, stompFn: () => void): void => {
      if (!sm.is("playing")) return; // the run ended on an earlier hit this step
      for (const p of players) {
        if (p.riding) continue;
        const dx = ex - p.pos.x;
        const dz = ez - p.pos.z;
        if (dx * dx + dz * dz > 0.85 * 0.85) continue;
        const dy = p.pos.y - ey;
        if (!spiky && dy > 0.5 && p.vel.y < -0.5) {
          stompFn();
          p.vel.y = 9.5;
          score += 50;
          hud.setScore(score);
          audio.sfx("stomp");
          shake = Math.max(shake, 0.3);
          particles.burst(ex, ey + 0.4, ez, 0x66d94e, 20, 4, 0.8, 8);
        } else if (Math.abs(dy) < 1.1 && p.invuln <= 0) {
          loseHeart("enemy", p, scratch.set(ex, ey, ez));
        }
      }
      // the car squishes anything it hits at speed
      if (car.group.visible && car.occupied && Math.abs(car.speed) > 2) {
        const cdx = ex - car.pos.x;
        const cdz = ez - car.pos.z;
        const cdy = ey - car.pos.y;
        if (cdx * cdx + cdz * cdz < 2.1 && Math.abs(cdy) < 1.4) {
          stompFn();
          score += 50;
          hud.setScore(score);
          audio.sfx("stomp");
          shake = Math.max(shake, 0.35);
          particles.burst(ex, ey + 0.4, ez, 0xffd93d, 20, 4, 0.8, 8);
        }
      }
    };
    for (const s of slimes.items) {
      if (!s.alive) continue;
      touchEnemy(s.group.position.x, s.group.position.y, s.group.position.z, false, () => slimes.stomp(s));
    }
    for (const h of hedgehogs.items) {
      if (!h.alive) continue;
      touchEnemy(h.group.position.x, h.group.position.y, h.group.position.z, h.spikesOut, () => hedgehogs.stomp(h));
    }
    for (const b of birds.items) {
      if (!b.alive) continue;
      touchEnemy(b.group.position.x, b.group.position.y, b.group.position.z, false, () => birds.stomp(b));
    }
    if (!sm.is("playing")) return;

    // checkpoints
    for (const cp of world.checkpoints) {
      if (cp.taken) continue;
      const near = players.some((p) => cp.pos.distanceToSquared(p.pos) < 1.8); // riders count: drive through a flag
      if (near) {
        cp.taken = true;
        respawn.copy(cp.pos);
        (cp.flag.material as THREE.MeshStandardMaterial).color.set(0xffa94d);
        audio.sfx("checkpoint");
        hud.showToast("Checkpoint! 🚩");
        particles.burst(cp.pos.x, cp.pos.y + 1.5, cp.pos.z, 0xffa94d, 14, 3, 0.7, 6);
      }
    }

    // things to bump into (cones, gift boxes, balls) and car boost pads / ramps
    for (const e of props.update(dt, world, players, car.group.visible ? car : null)) {
      if (e.type === "cone") {
        score += 5;
        hud.setScore(score);
        audio.sfx("stomp");
        particles.burst(e.x, e.y, e.z, 0xff7a1a, 8, 3, 0.5, 6);
      } else if (e.type === "box") {
        score += 20;
        coinCount++;
        hud.setScore(score);
        hud.setCoins(coinCount);
        audio.sfx("chest");
        particles.burst(e.x, e.y, e.z, 0xff9ecf, 24, 5, 0.9, 6);
      } else if (e.type === "ball") {
        audio.sfx("land");
      } else if (e.type === "boost") {
        audio.sfx("powerup");
        shake = Math.max(shake, 0.3);
        hud.showToast("Zoom! 💨");
        particles.burst(e.x, e.y + 0.3, e.z, 0x29d3a2, 18, 5, 0.7, 2);
      } else {
        audio.sfx("doublejump");
        hud.showToast("Wheee! 🚗");
      }
    }

    // car: buttons, engine sound, falling off the world
    const inRide = rides.find((v) => v.group.visible && v.occupied);
    const byRide = inRide ? undefined : rideInReach()?.ride;
    const ride = inRide ?? byRide;
    if (launchT >= 0) hud.setCarUi(null);
    else if (ride) hud.setCarUi(inRide ? "out" : "in", RIDE_ICON[ride.kind]);
    else hud.setCarUi(nearRocket() ? "in" : null, "🚀");
    {
      const e = engineRide();
      if (e) audio.engineSet(Math.abs(e.speed) / (e.kind === "jet" ? 26 : 13) + (e.flies && e.inAir ? 0.5 : 0));
    }

    // sea battles: cannonballs, hits and sinking pirate ships
    for (const e of fleet.update(dt, elapsed)) {
      if (e.type === "splash") {
        particles.burst(e.x, e.y + 0.1, e.z, 0xdff6ff, 10, 4, 0.6, 6);
        audio.sfx("splash");
      } else if (e.type === "hit") {
        score += 20;
        hud.setScore(score);
        audio.sfx("stomp");
        shake = Math.max(shake, 0.25);
        hud.showToast("💥 Hit! Keep firing!");
        particles.burst(e.x, e.y, e.z, 0xffa94d, 18, 5, 0.7, 6);
      } else {
        score += 100;
        coinCount += 5;
        hud.setScore(score);
        hud.setCoins(coinCount);
        audio.sfx("chest");
        shake = Math.max(shake, 0.5);
        hud.showToast("🏴‍☠️ You sank a pirate ship! +100 and 5 coins");
        particles.burst(e.x, e.y, e.z, 0xffd93d, 40, 7, 1.2, 5);
      }
    }

    // snacks: eat one for a few seconds of something silly
    foods.update(elapsed, dt);
    for (const p of players) {
      if (p.riding) continue;
      const f = foods.eatNear(p.pos);
      if (!f) continue;
      score += 15;
      hud.setScore(score);
      audio.sfx("munch");
      particles.burst(f.base.x, f.base.y, f.base.z, 0xfff1a8, 12, 3, 0.6, 5);
      if (pet.active) pet.cheer();
      if (f.type === "apple") {
        hearts = Math.min(maxHearts, hearts + 1);
        hud.setHearts(hearts, maxHearts);
        hud.showToast("🍎 Yum! +1 ♥");
      } else if (f.type === "icecream") {
        p.speedT = 8;
        hud.showToast("🍦 Yum! Super speed!");
      } else if (f.type === "cupcake") {
        p.jumpT = 8;
        hud.showToast("🧁 Sugar rush! Mega jumps!");
      } else {
        p.bigT = 8;
        hud.showToast("🍕 So full… you're GIANT!");
      }
    }

    // sky rings: fly (or float) through them
    rings.update(elapsed);
    if (rings.total > 0) {
      const through = (pos: THREE.Vector3) => {
        const hit = rings.tryPass(pos);
        if (!hit) return;
        score += 50;
        hud.setScore(score);
        audio.sfx("checkpoint");
        particles.burst(hit.x, hit.y, hit.z, 0xffd93d, 24, 6, 0.9, 2);
        if (rings.passed === rings.total) {
          score += 300;
          hud.setScore(score);
          audio.sfx("win");
          hud.showToast("All the sky rings! You're an ace pilot! 🏆 +300");
        } else {
          hud.showToast(`Ring ${rings.passed}/${rings.total}! 💫`);
        }
      };
      for (const v of rides) if (v.group.visible && v.occupied) through(v.pos);
      for (const p of players) if (!p.riding) through(p.pos);
    }

    // rocket: rumble on the pad, rise faster and faster, then arrive in the next world
    if (launchT >= 0) {
      launchT += dt;
      const up = Math.max(0, launchT - 1);
      rocket.position.set(rocketBase.x + (Math.random() - 0.5) * 0.06, rocketBase.y + 4 * up * up, rocketBase.z);
      for (const p of players) p.pos.set(rocket.position.x, rocket.position.y + 2.4, rocket.position.z);
      shake = Math.max(shake, 0.35);
      particles.burst(rocket.position.x, rocket.position.y + 0.2, rocket.position.z, launchT < 1 ? 0xffffff : 0xffa94d, 6, 4, 0.7, 9);
      if (launchT > 4.4) {
        const moon = LEVELS.findIndex((l) => l.space);
        const to = world.def.space ? islandLevel() : moon;
        storage.set(UNLOCKED_KEY, Math.max(unlockedLevel(), to));
        net?.send({ t: "level", i: to });
        loadLevel(to);
        audio.sfx("win");
        hud.showToast(LEVELS[to].space ? "🌙 Welcome to the Moon! Jump and see how floaty it is!" : "🌍 Back on Adventure Island!");
        return;
      }
    }
    hud.setTalk(!players[0].riding && npcs.nearest(players[0].pos) !== null);
    if (car.group.visible) {
      if (car.fellOff) {
        if (car.driver) car.exit(car.driver);
        if (car.passenger) car.exit(car.passenger);
        car.respawn();
        audio.engineStop();
        loseHeart("fall");
        if (!sm.is("playing")) return;
        for (const p of players) p.respawn(respawn.x, respawn.y, respawn.z);
      }
    }

    // portal
    const pd = world.portalPos;
    let portalDistSq = Infinity;
    let allNear = true;
    for (const p of players) {
      const ddx = pd.x - p.pos.x;
      const ddy = pd.y - p.pos.y;
      const ddz = pd.z - p.pos.z;
      const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
      portalDistSq = Math.min(portalDistSq, d2);
      if (d2 > 5.3) allNear = false; // co-op: everyone must gather at the portal
    }
    if (world.portalUnlocked) {
      if (allNear && portalDistSq < 5.3) {
        levelComplete();
        return;
      }
      if (Math.random() < dt * 6) {
        particles.burst(pd.x, pd.y + 1.8, pd.z, 0xffe27a, 1, 1.2, 0.9, 1);
      }
      if (players.length > 1 && !allNear && portalDistSq < 5.3) {
        portalHintCooldown -= dt;
        if (portalHintCooldown <= 0) {
          portalHintCooldown = 2.5;
          hud.showToast("Both players to the portal! (T = teleport)");
        }
      }
    } else if (portalDistSq < 9) {
      portalHintCooldown -= dt;
      if (portalHintCooldown <= 0) {
        portalHintCooldown = 2.5;
        hud.showToast(`Collect ${stars.total - stars.takenCount} more ★ to open the portal!`);
      }
    }

    // co-op: stay together — long separation teleports the straggler
    if (players.length > 1) {
      const p1 = players[0], q = players[1];
      const sep = Math.hypot(p1.pos.x - q.pos.x, p1.pos.z - q.pos.z);
      if (input.consumeAction("KeyT")) {
        teleportToFriend(q, p1);
        leashTimer = 0;
      } else if (sep > 15) {
        leashTimer += dt;
        if (leashTimer > 2.5) {
          leashTimer = 0;
          teleportToFriend(q, p1);
          hud.showToast("Stay together! 💫");
        }
      } else {
        leashTimer = 0;
      }
    }

    // falling off the world
    for (const p of players) {
      if (!p.riding && p.pos.y < KILL_Y) {
        loseHeart("fall", p);
        if (!sm.is("playing")) return;
      }
    }

    // blob shadows follow the ground under each kid
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const blob = blobs[i];
      const g = world.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.4);
      if (g && !p.riding) {
        blob.visible = true;
        blob.position.set(p.pos.x, g.y + 0.03, p.pos.z);
        const h = THREE.MathUtils.clamp(1 - (p.pos.y - g.y) * 0.07, 0.35, 1);
        blob.scale.setScalar(h);
      } else {
        blob.visible = false;
      }
    }

    // third-person camera (midpoint + separation zoom in co-op; follows the car)
    const focus = scratch.set(0, 0, 0);
    let sep = 0;
    for (const p of players) {
      focus.x += p.pos.x;
      focus.y += p.pos.y;
      focus.z += p.pos.z;
    }
    focus.multiplyScalar(1 / players.length);
    if (players.length > 1) {
      sep = Math.hypot(players[0].pos.x - players[1].pos.x, players[0].pos.z - players[1].pos.z);
    }
    camTarget.set(focus.x, focus.y + 1.3, focus.z);
    const flyingRide = rides.find((v) => v.group.visible && v.flies && v.occupied);
    const dist = THREE.MathUtils.clamp(CAM_DIST + sep * 0.55, CAM_DIST, 17) + (flyingRide ? 5 : launchT >= 0 ? 8 : 0);
    const cpv = Math.cos(camPitch), spv = Math.sin(camPitch);
    camDesired.set(
      camTarget.x + Math.sin(camYaw) * cpv * dist,
      camTarget.y + spv * dist,
      camTarget.z + Math.cos(camYaw) * cpv * dist,
    );
    camera.position.lerp(camDesired, Math.min(1, dt * 9));
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.8);
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    }
    camera.lookAt(camTarget);

    if (net && ++sendTick % NET_SEND_EVERY === 0) sendState();
  }

  const loop = new GameLoop({
    update: (dt) => {
      step(dt);
      input.clearActions(); // presses not consumed this step must not fire later elsewhere
    },
    render: () => {
      renderer.render(scene, camera);
      window.__GAME_READY__ = true; // first rendered frame = the page is playable
    },
  });
  loop.start();

  function teleportToFriend(q: Player, p1: Player): void {
    // q joins p1: into the car as a passenger when p1 is driving, otherwise beside them
    if (car.group.visible && car.has(p1)) {
      if (!car.passenger) {
        car.board(q);
        return;
      }
      q.pos.set(p1.pos.x + 1.2, p1.pos.y + 0.1, p1.pos.z);
    } else if (car.group.visible && car.has(q)) {
      // q is in the car, p1 walks: bring the car-less friend in as passenger instead
      if (!car.passenger) car.board(p1);
      return;
    } else {
      q.pos.set(p1.pos.x + 1.2, p1.pos.y + 0.1, p1.pos.z);
      q.vel.set(0, 0, 0);
    }
  }

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  window.addEventListener("resize", onResize);

  // self-check probe: scripts/verify-game.mjs uses it for direction assertions
  window.__gameProbe = () => ({ x: players[0].pos.x, y: players[0].pos.y, z: players[0].pos.z });
  // perf probe: draw calls / triangles of the last frame (used by the playtest harness)
  window.__perf = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  // test hook: remaining stars / portal / state name (drives the full-clear playtest)
  window.__gameDebug = () => ({
    state: sm.state,
    px: players[0].pos.x, py: players[0].pos.y, pz: players[0].pos.z,
    p2x: players[1]?.pos.x ?? 0, p2y: players[1]?.pos.y ?? 0, p2z: players[1]?.pos.z ?? 0,
    players: players.length,
    canJump: players[0].canJump,
    stars: stars.items.filter((s) => !s.taken).map((s) => ({ x: s.base.x, y: s.base.y, z: s.base.z })),
    portal: { x: world.portalPos.x, y: world.portalPos.y, z: world.portalPos.z },
    portalUnlocked: world.portalUnlocked,
    hearts,
    coins: coinCount,
    buddies: buddies.active.map((b) => b.type),
    chestsOpened: chests.items.filter((c) => c.opened).length,
    car: car.group.visible
      ? { x: car.pos.x, y: car.pos.y, z: car.pos.z, occupied: car.occupied }
      : null,
    onGround: players[0].onGround,
    slimes: slimes.items.filter((s) => s.alive).map((s) => ({ x: s.group.position.x, z: s.group.position.z })),
    remotes: remotes.size,
    props: { cones: props.conesKnocked, boxes: props.boxesSmashed },
    heli: heli.group.visible ? { x: heli.pos.x, y: heli.pos.y, z: heli.pos.z, occupied: heli.occupied } : null,
    rings: rings.passed,
    food: foods.items.filter((f) => !f.taken).length,
    shipsSunk: fleet.sunk,
    shipsAfloat: fleet.afloat,
    placeBoat: (x: number, z: number, heading: number) => {
      boat.pos.set(x, boat.seaY, z);
      boat.heading = heading;
      boat.speed = 0;
      camYaw = heading + Math.PI;
    },
    big: players[0].group.scale.x,
    boat: boat.group.visible
      ? { x: boat.pos.x, y: boat.pos.y, z: boat.pos.z, occupied: boat.occupied }
      : null,
    npcsMet: npcs.metCount,
    inside: world.isInside(players[0].pos),
    pet: pet.active ? { x: pet.group.position.x, y: pet.group.position.y, z: pet.group.position.z } : null,
    carSpeed: car.speed,
    placeHeli: (x: number, y: number, z: number, heading: number) => {
      heli.pos.set(x, y, z);
      heli.heading = heading;
      heli.speed = 0;
      camYaw = heading + Math.PI;
    },
    warp: (x: number, z: number) => {
      const y = world.groundAt(x, z, 50)?.y ?? 0;
      players[0].respawn(x, y, z);
      players[0].invuln = 0;
    },
    placeCar: (x: number, z: number, heading: number) => {
      car.pos.set(x, world.groundAt(x, z, 50)?.y ?? 0, z);
      car.heading = heading;
      car.speed = 0;
      camYaw = heading + Math.PI;
    },
    groundAt: (x: number, z: number) => {
      const g = world.groundAt(x, z, players[0].pos.y + 0.4);
      return g ? g.y : null;
    },
  });

  session = {
    dispose: () => {
      disposed = true;
      leaveOnline();
      for (const b of bubbles) b.clear();
      loop.stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onBlur);
      input.dispose();
      audio.dispose();
      hud.dispose();
      particles.dispose();
      stars.dispose();
      pickups.dispose();
      rings.dispose();
      fleet.dispose();
      blobGeo.dispose();
      blobMat.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      renderer.dispose();
      delete window.__gameProbe;
      delete window.__perf;
      delete window.__gameDebug;
      window.__GAME_READY__ = false;
    },
  };
}

export function stopGame(): void {
  session?.dispose();
  session = null;
}
