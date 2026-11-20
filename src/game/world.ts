/**
 * world.ts — floating-island level construction + collision queries + ambient animation.
 *
 * Eleven hand-designed worlds (geometry is parametric, placed from level data):
 *   1. Sunny Meadow        — gentle gaps, teaches jump / stars / stomp (+ bunny buddy)
 *   2. Candy Canyon        — bridges, a moving platform (+ birdie buddy, circling bird)
 *   3. Rainbow Peak        — vertical climb, springs (+ hedgehogs, turtle buddy)
 *   4. Castle in the Clouds — cloud towers, trampolines, every creature
 *   5. Toy City            — big explorable city: solid buildings, roads, a drivable car,
 *                            and a parachute tower (free glide in this world)
 *   6. Frosty Mountain     — falling snow, a sliding ice bridge, a spring-launch climb
 *   7. Bubbly Beach        — sandy islands over the sea; party balloons float you to secret islands
 *  11. Moon Base           — low gravity, floating rocks, a moon buggy, aliens to talk to; reached by
 *                            rocket from Adventure Island
 *   8. Jungle Vines        — leafy climb with a sliding platform and a balloon to a treetop island
 *   9. Starlight Peak      — a night-time climb on springs under the stars
 *  10. Adventure Island    — one big open island to explore: village, forest, lookout hill, a beach
 *                            loop for the car, a sailboat to reach far islets, villagers to talk to
 *
 * Colliders are analytic (disc / box footprints with a top surface height) plus solid
 * wall boxes for buildings. Ground queries and wall pushes stay allocation-free.
 */

import * as THREE from "three";
import { mulberry32, pick } from "./rng";
import type { PropDefs } from "./props";
import type { FoodDef } from "./food";
import type { ShipDef } from "./ships";
import { makeTextSprite, disposeSprite } from "./social";
import { envReady, hasModel, brickTexture, Placer } from "./env";
import type { JobId } from "./jobs";
import type { TrafficLoop } from "./traffic";
import type { HerdDef } from "./critters";
import { buildBethlehem, type BethlehemDef } from "./bethlehem";
import { buildCastle, mergeByMaterial, type CastleDef, type CastleInfo } from "./castle";
import { currentSeason } from "./seasons";
import { Dragon } from "./dragon";
import { KnightRings } from "./tilt";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Something decorative to draw: by the code-built shapes, or by the models in env.ts once loaded. */
type Decor =
  | { t: "tree"; kind: number; x: number; y: number; z: number; rot: number; scale: number; v: number }
  | { t: "flower"; color: number; x: number; y: number; z: number; rot: number; v: number }
  | { t: "rock"; x: number; y: number; z: number; size: number; rx: number; ry: number; rz: number; v: number }
  | { t: "grass"; x: number; y: number; z: number; rot: number; v: number; sand: boolean }
  | { t: "building"; b: BuildingDef }
  /** A model from the city kit (planters, bollards…), only drawn once the models load. */
  | { t: "kit"; name: string; x: number; y: number; z: number; rot: number; scale: number };

export interface Platform {
  kind: "disc" | "box";
  x: number; z: number;      // current center (updated when moving)
  r: number;                 // disc radius
  hw: number; hd: number;    // box half extents
  topY: number;
  spring: number;            // 0 = solid ground; >0 = trampoline bounce power
  move?: { axis: "x" | "z"; amp: number; speed: number; phase: number };
  baseX: number; baseZ: number;
  dx: number; dz: number;    // delta moved this step (for carrying the player)
  mesh: THREE.Object3D;
  squashT: number;           // spring squash animation timer
}

export interface GroundHit {
  y: number;
  plat: Platform;
}

interface DiscDef {
  x: number; z: number; r: number; y: number; trees?: number; flowers?: number; rocks?: number; color?: number;
  /** City pavement: no grass tufts. */
  paved?: boolean;
}
interface BridgeDef { x: number; z: number; w: number; d: number; y: number; move?: { axis: "x" | "z"; amp: number; speed: number; phase?: number } }
interface SpringDef { x: number; z: number; y: number; power: number }
interface SlimeDef { ax: number; az: number; bx: number; bz: number; y: number; speed: number }
export interface BirdDef { cx: number; cy: number; cz: number; r: number; speed: number }
export interface BuddyDef { type: "bunny" | "birdie" | "turtle"; x: number; y: number; z: number }
export interface NpcDef {
  name: string;
  x: number; y: number; z: number;
  outfit: number; hat: number; skin: number;
  /** Said one after another each time the kid talks to them. */
  lines: string[];
  /** Sells something for coins (until it has been bought). */
  sells?: { id: string; price: number; what: string };
  /** Taller or smaller than everyone else (Goliath is 2.6). */
  scale?: number;
  /** Hands out a job (see jobs.ts). */
  job?: JobId;
  /** Runs a quest instead of plain lines (see lambs.ts). */
  quest?: string;
  /** Places their job uses: garden rows, litter, fishing spots, bus stops, drop rings… */
  spots?: [number, number, number][];
}
export interface BuildingDef {
  x: number; z: number; w: number; d: number; h: number; color: number;
  /** A house with an open doorway on its +Z side: kids can walk in and look around. */
  enter?: boolean;
  /** For sale: the door stays boarded up until the kid owns this id (bought from a villager). */
  lock?: string;
  /** A glass skyscraper instead of brick. */
  style?: "glass";
  /** A church (use with `enter`): a steeple with a cross outside; pews, a lectern and a cross inside. */
  church?: boolean;
}
interface RoadDef { x: number; z: number; w: number; d: number }

export interface LevelDef {
  name: string;
  sky: number;
  fog: number;
  grass: number;
  dirt: number;
  foliage: number;
  flowerColors: number[];
  spawn: [number, number, number];
  discs: DiscDef[];
  bridges: BridgeDef[];
  springs: SpringDef[];
  stars: [number, number, number][];
  slimes: SlimeDef[];
  checkpoints: [number, number, number][];
  portal: [number, number, number];
  rainbow?: boolean;
  // ── expansion content ──
  coins?: [number, number, number][];
  hearts?: [number, number, number][];
  magnets?: [number, number, number][];
  chests?: [number, number, number][];
  buddies?: BuddyDef[];
  birds?: BirdDef[];
  hedgehogs?: SlimeDef[];
  /** Toy City: buildings (solid + landable), roads (visual), car spawn, free glide. */
  buildings?: BuildingDef[];
  roads?: RoadDef[];
  carSpawn?: [number, number, number, number]; // x, y, z, heading
  freeGlide?: boolean;
  /** Falling snowflakes (decorative). */
  snow?: boolean;
  /** Sparkly sea far below the islands (decorative — falling in still costs a heart). */
  ocean?: boolean;
  /**
   * Water level of a real sea. Kids wade in it (a sandy seabed lies 0.5 below the surface, so
   * nobody drowns or loses a heart), the boat floats on it, and the car stays on dry land.
   */
  sea?: number;
  boatSpawn?: [number, number, number]; // x, z, heading
  heliSpawn?: [number, number, number, number]; // x, y, z, heading
  jetSpawn?: [number, number, number, number];
  /** A rocket to board: it flies to the Moon (or back to the island from a space level). */
  rocket?: [number, number, number];
  /** Golden hoops in the sky: x, y, z, heading. */
  rings?: [number, number, number, number][];
  /** A knight's ring course for riders: x, z, heading (y comes from the ground). */
  knightRings?: [number, number, number][];
  /** Toy pirate ships to sink with the sailboat's cannon: circle center x, z, radius, speed. */
  pirates?: ShipDef[];
  /** Snacks to eat (food.ts). */
  food?: FoodDef[];
  /** Gravity multiplier (1 = normal; the Moon is 0.3). */
  gravity?: number;
  /** Outer space: black sky, stars, the Earth overhead, no clouds. */
  space?: boolean;
  /** Night-time: stars in the sky. */
  night?: boolean;
  npcs?: NpcDef[];
  /** Bumpable things: cones, gift boxes, balls, and car boost pads / ramps (props.ts). */
  props?: PropDefs;
  /** Party balloons: touch one to float up for a few seconds. */
  balloons?: [number, number, number][];
  /** Where the plaza fountain stands (levels with roads). */
  fountain?: [number, number];
  /** Sky color overhead (the horizon is `sky`), and the light's colors: a sunset city glows warm. */
  skyTop?: number;
  light?: { sun: number; sky: number; ground: number };
  /** Street lamps and planters along every road. */
  streetlife?: boolean;
  /** A Ferris wheel: x, y, z and which way it faces. */
  ferris?: [number, number, number, number];
  /** Cars that drive around the city by themselves (traffic.ts). */
  traffic?: TrafficLoop[];
  /** Real animals that graze and wander in their own patch (critters.ts). */
  herds?: HerdDef[];
  /** Scripture scrolls to find: x, y, z and the reference of the library verse (verses.ts) written on it. */
  scrolls?: [number, number, number, string][];
  /** A great fish floating in the sea: x, z. Its back is a place to stand. */
  bigFish?: [number, number];
  /** The travel gate to the other places: x, z. Worlds with one can be travelled to and from. */
  station?: [number, number];
  /** More cars to drive, parked here: x, y, z, heading. */
  extraCars?: [number, number, number, number][];
  /** Kick scooters to ride: x, z, heading (they sit on the ground there). */
  scooters?: [number, number, number][];
  /** Sightseeing photo spots: the sight's name, where to stand (x, z) and the point to frame behind the kid. */
  photoSpots?: { name: string; at: [number, number]; look: [number, number, number] }[];
  /** A playground (slide, swings, roundabout, seesaw, sandbox): x, z of its middle. */
  playground?: [number, number];
  /** Beach umbrellas, each with a sun lounger: x, y, z, color. */
  umbrellas?: [number, number, number, number][];
  /** Camp tents: x, y, z, color. */
  tents?: [number, number, number, number][];
  /** Shallow water lying on the ground (a brook): flat blue strips. */
  brooks?: RoadDef[];
  /** Noah's ark: x, z of its middle (the hull runs along x; its deck is a platform to walk on). */
  ark?: [number, number];
  /** Christmas in Bethlehem: the town, the inn, the stable under the star, the shepherds' field. */
  bethlehem?: BethlehemDef;
  /** Castles to explore: walls to walk along, towers, a keep to climb (castle.ts). */
  castles?: CastleDef[];
}

export const LEVELS: LevelDef[] = [
  {
    name: "Sunny Meadow",
    sky: 0x8fd8ff, fog: 0xaee6ff,
    grass: 0x7ed957, dirt: 0xb07845, foliage: 0x3fa34d,
    flowerColors: [0xff6b9d, 0xffd93d, 0xff9f43, 0xffffff],
    spawn: [0, 0, 5],
    discs: [
      { x: 0, z: 0, r: 7, y: 0, trees: 3, flowers: 8 },
      { x: 0, z: -12, r: 4, y: 0.4, flowers: 4 },
      { x: 7, z: -19, r: 4.5, y: 1.0, trees: 2, flowers: 5 },
      { x: 0, z: -27, r: 5, y: 1.6, trees: 1, flowers: 5, rocks: 2 },
      { x: -8, z: -34, r: 4, y: 2.2, flowers: 4 },
      { x: 0, z: -42, r: 6, y: 2.8, trees: 2, flowers: 6 },
      // exploration side islands
      { x: 11, z: 2, r: 2.5, y: -0.2, flowers: 2 },   // bunny buddy island
      { x: 6, z: -33, r: 2.5, y: 1.9, flowers: 2 },   // treasure island
    ],
    bridges: [],
    springs: [{ x: 2.5, z: -28.5, y: 1.6, power: 16 }],
    stars: [
      [0, 1.2, 0], [0, 1.2, -4],
      [0, 1.6, -12],
      [4.5, 2.2, -16.5], [9.5, 2.2, -21.5], [7, 2.2, -19],
      [2.5, 5.5, -28.5],
      [-8, 3.4, -34],
      [0, 4.0, -39.5], [2.5, 4.0, -42],
    ],
    coins: [
      [0, 1.2, -2], [0, 1.2, -7],
      [0, 1.6, -10], [3, 1.6, -13.5],
      [5.5, 2.2, -18], [8.5, 2.2, -20],
      [10, 1.0, 2], [12, 1.0, 2.5],   // bunny island
      [5, 3.1, -32.5], [7, 3.1, -33.5], // treasure island
      [-4, 3.4, -35], [1.5, 4.0, -41],
    ],
    chests: [[6, 1.9, -33]],
    hearts: [[11, 1.0, 3]],
    magnets: [[-2.5, 4.0, -42.5]],
    buddies: [{ type: "bunny", x: 11, y: -0.2, z: 2 }],
    slimes: [
      { ax: 3.5, az: -19, bx: 10.5, bz: -19, y: 1.0, speed: 1.1 },
      { ax: -4, az: -42, bx: 4, bz: -42, y: 2.8, speed: 1.4 },
    ],
    checkpoints: [[-2, 1.6, -25.5]],
    portal: [0, 2.8, -44],
    rainbow: true,
    props: { balls: [[-3, 0, 1]] },
    food: [["apple", 12.5, 0.8, 1]],
  },
  {
    name: "Candy Canyon",
    food: [["cupcake", -9.5, 1.3, 2], ["icecream", 13, 2.8, -27]],
    sky: 0xffd6ec, fog: 0xffe4f3,
    grass: 0xff9ecf, dirt: 0xc96b9e, foliage: 0xff5fa2,
    flowerColors: [0xffffff, 0xfff06b, 0x9df2ff, 0xffb3ff],
    spawn: [0, 0, 4.5],
    discs: [
      { x: 0, z: 0, r: 6, y: 0, trees: 2, flowers: 8 },
      { x: 0, z: -16, r: 4, y: 0.5, flowers: 4 },
      { x: 14, z: -24, r: 4.5, y: 1.8, trees: 2, flowers: 5 },
      { x: 8, z: -31, r: 3.5, y: 2.6, flowers: 3 },
      { x: 0, z: -37, r: 6, y: 3.2, trees: 2, flowers: 6, rocks: 2 },
      // exploration side islands
      { x: -9, z: 1, r: 2.5, y: 0.3, flowers: 2 },    // treasure island
      { x: 9.5, z: -40, r: 2.5, y: 3.6, flowers: 2 }, // birdie buddy island
    ],
    bridges: [
      { x: 0, z: -10.5, w: 2.6, d: 7, y: 0.2 },
      { x: 6.5, z: -20.5, w: 3, d: 3, y: 1.2, move: { axis: "x", amp: 4, speed: 0.8 } },
    ],
    springs: [{ x: 15.5, z: -26, y: 1.8, power: 17 }],
    stars: [
      [0, 1.2, 0.5], [0, 1.2, -3.5],
      [0, 1.5, -9],
      [0, 1.7, -16],
      [3.5, 2.2, -19], [6.5, 2.8, -20.5],
      [12, 3.0, -23], [14.5, 3.0, -25],
      [15.5, 6.2, -26],
      [8, 3.8, -31],
      [-2, 4.4, -35], [2, 4.4, -38],
    ],
    coins: [
      [0, 1.2, -1.5], [0, 1.2, -5.5],
      [0, 1.5, -8], [0, 1.5, -12],
      [-9, 1.5, 1], [-9.8, 1.5, 0],   // treasure island
      [5.5, 2.6, -20.5], [7.5, 2.6, -20.5],
      [12.5, 3.0, -22], [15.5, 3.0, -24.5],
      [9.5, 4.8, -40], [8.7, 4.8, -39.3], // birdie island
    ],
    chests: [[-9, 0.3, 1]],
    hearts: [[8, 3.8, -32.5]],
    magnets: [[13, 3.0, -26.5]],
    buddies: [{ type: "birdie", x: 9.5, y: 3.6, z: -40 }],
    slimes: [
      { ax: -2.5, az: -16, bx: 2.5, bz: -16, y: 0.5, speed: 1.2 },
      { ax: 11.5, az: -24, bx: 16.5, bz: -24, y: 1.8, speed: 1.4 },
      { ax: -3, az: -37, bx: 3, bz: -37, y: 3.2, speed: 1.6 },
    ],
    birds: [{ cx: 6.5, cy: 3.4, cz: -20.5, r: 3, speed: 1.2 }],
    checkpoints: [[13, 1.8, -22.5]],
    portal: [0, 3.2, -40],
  },
  {
    name: "Rainbow Peak",
    sky: 0x87b0ff, fog: 0xb7ccff,
    grass: 0xa78bfa, dirt: 0x6d5bd0, foliage: 0x5eead4,
    flowerColors: [0xffe066, 0xffffff, 0xff9ecf, 0x9df2ff],
    spawn: [0, 0, 4.5],
    discs: [
      { x: 0, z: 0, r: 6, y: 0, trees: 2, flowers: 7 },
      { x: 0, z: -10, r: 3.5, y: 0.8, flowers: 3 },
      { x: 0, z: -16, r: 4, y: 4.2, flowers: 4, rocks: 1 },
      { x: 12, z: -24, r: 4.5, y: 5.8, trees: 1, flowers: 4 },
      { x: 6, z: -31, r: 3.5, y: 6.6, flowers: 3 },
      { x: 0, z: -46, r: 6, y: 10.8, trees: 2, flowers: 6 },
      // exploration side islands
      { x: -7, z: -17, r: 2.5, y: 4.0, flowers: 2 },   // treasure island
      { x: 9, z: -49, r: 2.5, y: 10.4, flowers: 2 },   // turtle buddy island
    ],
    bridges: [
      { x: 6, z: -20, w: 3, d: 3, y: 5.0, move: { axis: "z", amp: 3.5, speed: 1.0 } },
    ],
    springs: [
      { x: 0, z: -11.5, y: 0.8, power: 18 },
      { x: 6, z: -32.5, y: 6.6, power: 18 },
    ],
    stars: [
      [0, 1.2, 0], [0, 1.2, -3],
      [0, 2.0, -10],
      [0, 5.8, -13],
      [0, 5.4, -16], [2, 5.4, -18],
      [6, 6.2, -20],
      [10.5, 7.0, -22], [14, 7.0, -25.5],
      [6, 7.8, -31],
      [6, 11.6, -32.5],
      [-2, 12.0, -44],
    ],
    coins: [
      [0, 1.2, -1.5], [1.5, 1.2, -5],
      [0.5, 5.4, -14], [-1.5, 5.4, -17.5],
      [-7, 5.2, -17], [-7.8, 5.2, -16.2],  // treasure island
      [11, 7.0, -23], [13, 7.0, -25],
      [6, 7.8, -29.5],
      [9, 11.6, -49], [9.8, 11.6, -48.2],  // turtle island
      [2, 12.0, -45],
    ],
    chests: [[-7, 4.0, -17]],
    hearts: [[12, 7.0, -21.5]],
    magnets: [[6, 7.8, -29.5]],
    buddies: [{ type: "turtle", x: 9, y: 10.4, z: -49 }],
    slimes: [{ ax: -2.5, az: -16, bx: 2.5, bz: -16, y: 4.2, speed: 1.4 }],
    hedgehogs: [
      { ax: 10.5, az: -24, bx: 14, bz: -24, y: 5.8, speed: 0.9 },
      { ax: -3, az: -46, bx: 3, bz: -46, y: 10.8, speed: 1.1 },
    ],
    checkpoints: [[1.5, 4.2, -14.5], [12, 5.8, -26]],
    portal: [0, 10.8, -48],
    rainbow: true,
  },
  {
    name: "Castle in the Clouds",
    sky: 0xfff0d6, fog: 0xffe9c4,
    grass: 0xfdf6ec, dirt: 0xd9a441, foliage: 0xff9ecf,
    flowerColors: [0xffd93d, 0xff9ecf, 0x9df2ff, 0xffffff],
    spawn: [0, 0, 4.5],
    discs: [
      { x: 0, z: 0, r: 6, y: 0, trees: 2, flowers: 7 },
      { x: 0, z: -10.5, r: 3.5, y: 0.5, flowers: 3 },
      { x: 0, z: -21, r: 5, y: 1.2, trees: 2, flowers: 5 },
      { x: 7.5, z: -25, r: 2.5, y: 1.5, flowers: 2 },  // treasure island
      { x: -11, z: -31, r: 4.5, y: 2.8, trees: 1, flowers: 4 },
      { x: -4, z: -38, r: 4, y: 6.2, flowers: 4, rocks: 1 },
      { x: 3, z: -41, r: 2.5, y: 6.4, flowers: 2 },    // magnet island
      { x: -4, z: -46, r: 4, y: 7.0, flowers: 3 },
      { x: 0, z: -54, r: 7, y: 11.0, trees: 3, flowers: 7 },
    ],
    bridges: [
      { x: 0, z: -16.5, w: 2.6, d: 6, y: 0.8 },
      { x: -5, z: -27.5, w: 3, d: 3, y: 2.0, move: { axis: "x", amp: 4, speed: 0.9 } },
    ],
    springs: [
      { x: -9.5, z: -33, y: 2.8, power: 18 },
      { x: -4, z: -47.5, y: 7.0, power: 18 },
    ],
    stars: [
      [0, 1.2, 0], [0, 1.2, -3],
      [0, 1.7, -10.5],
      [0, 2.0, -16.5],
      [0, 2.4, -21], [2.5, 2.4, -23],
      [7.5, 2.7, -25],
      [-5, 3.2, -27.5],
      [-11, 4.0, -29], [-12.5, 4.0, -32.5],
      [-9.5, 7.9, -33],
      [-4, 7.4, -38],
      [-4, 8.2, -46],
      [2, 12.2, -52.5],
    ],
    coins: [
      [0, 1.2, -1.5], [0, 1.2, -5],
      [0, 1.7, -8.5], [0, 2.0, -14],
      [1.5, 2.4, -19.5], [-2, 2.4, -22.5],
      [7.5, 2.7, -24], [8.3, 2.7, -25.8],
      [-10, 4.0, -30], [-12, 4.0, -33.5],
      [3, 7.6, -41], [3.8, 7.6, -40.2],
      [1, 12.2, -51], [3.5, 12.2, -53.5],
    ],
    chests: [[7.5, 1.5, -25.8]],
    hearts: [[3, 12.2, -53]],
    magnets: [[3, 7.6, -41]],
    buddies: [],
    slimes: [
      { ax: -2.5, az: -21, bx: 2.5, bz: -21, y: 1.2, speed: 1.5 },
      { ax: -2, az: -54, bx: 2, bz: -54, y: 11.0, speed: 1.8 },
    ],
    hedgehogs: [{ ax: -13, az: -31, bx: -9, bz: -31, y: 2.8, speed: 1.0 }],
    birds: [{ cx: -4, cy: 8.2, cz: -38, r: 3, speed: 1.5 }],
    checkpoints: [[-2, 1.2, -19.5], [-11, 2.8, -28.5]],
    portal: [0, 11.0, -56.5],
  },
  {
    name: "Toy City",
    sky: 0xaee2ff, fog: 0xcfeaff,
    grass: 0xf2e3c6, dirt: 0xc9a26b, foliage: 0x3fa34d,
    flowerColors: [0xff6b9d, 0xffd93d, 0x9df2ff, 0xffffff],
    spawn: [0, 0, 18],
    freeGlide: true, // parachute town!
    carSpawn: [4, 0, 14, Math.PI],
    fountain: [0, -8],
    food: [["pizza", -10, 1.0, -1], ["icecream", 17, 1.0, 8], ["cupcake", 0, 1.5, -36], ["apple", -16, 1.0, -4]],
    props: {
      cones: [[-3, 0, 6.8], [-1, 0, 5.2], [1, 0, 6.8], [3, 0, 5.2], [-4, 0, -18.6], [0, 0, -18], [4, 0, -17.4]],
      boxes: [[-2, 0, 12], [-10, 0, -11], [8, 0, -14], [0, 0, -21.5], [18, 0, 5]],
      balls: [[-3, 0, 15], [3, 0, -13]],
      // the long east-bound lane: boost → ramp → fly into the cones → the pink house stops you
      boosts: [[-16, 0, 6, Math.PI / 2]],
      // the second ramp jumps the car into the fountain
      ramps: [[-11, 0, 6, Math.PI / 2], [0, 0, 2, Math.PI]],
    },
    discs: [
      { x: 0, z: 0, r: 24, y: 0, trees: 6, flowers: 14 },  // the city plaza
      { x: 0, z: -38, r: 8, y: 0.5, trees: 3, flowers: 8 }, // the park
    ],
    bridges: [{ x: 0, z: -29, w: 3.2, d: 10, y: 0.25 }],
    buildings: [
      { x: 7, z: -8, w: 4, d: 4, h: 5, color: 0xff6b9d },
      { x: -8, z: -6, w: 4, d: 4, h: 4, color: 0x5cb8ff },
      { x: -12, z: -16, w: 5, d: 4, h: 7, color: 0xffa94d },
      { x: 10, z: 4, w: 4, d: 5, h: 3.5, color: 0x7ed957 },
      { x: -6, z: 10, w: 5, d: 4, h: 6, color: 0xb197fc },
      { x: 12, z: -2, w: 3, d: 3, h: 3, color: 0xffd93d },
      { x: -14, z: 2, w: 4, d: 4, h: 5, color: 0x4ecbd9 },
      { x: 16, z: -6, w: 4, d: 4, h: 6.5, color: 0xff8c42 },
      { x: 6, z: 14, w: 4, d: 4, h: 3, color: 0xff9ecf },
      { x: 14, z: -14, w: 3, d: 3, h: 14, color: 0xfdf6ec }, // the parachute tower
    ],
    roads: [
      { x: 0, z: 6, w: 26, d: 3 },
      { x: 0, z: -18, w: 26, d: 3 },
      { x: -13, z: -6, w: 3, d: 21 },
      { x: 13, z: -6, w: 3, d: 21 },
      { x: 0, z: -6, w: 3, d: 21 },
    ],
    springs: [
      { x: 4.6, z: -8, y: 0, power: 18 },     // → rooftop (7,-8)
      { x: -5.4, z: -6, y: 0, power: 17 },    // → rooftop (-8,-6)
      { x: -9.4, z: -17.5, y: 0, power: 20 }, // → rooftop (-12,-16)
      { x: -6, z: 6.9, y: 0, power: 19 },     // → rooftop (-6,10)
      { x: 13.1, z: -6, y: 0, power: 19 },    // → rooftop (16,-6)
      { x: 11.4, z: -14, y: 0, power: 29 },   // → top of the parachute tower
    ],
    stars: [
      [0, 1.2, 14], [-6, 1.2, 6.5], [6, 1.2, -18.5], [-13, 1.2, -10],
      [7, 6.2, -8], [-8, 5.2, -6], [-12, 8.2, -16], [-6, 7.2, 10], [16, 7.7, -6],
      [14, 15.2, -14], [14, 16.4, -14],
      [0, 1.7, -29],
      [-3, 1.7, -37], [3, 1.7, -39],
    ],
    coins: [
      [-8, 1.0, 6], [8, 1.0, 6], [-11, 1.0, -18], [11, 1.0, -18],
      [-13, 1.0, -2], [13, 1.0, 2], [0, 1.0, -2], [0, 1.0, -12],
      [7, 6.2, -7], [-8, 5.2, -5], [-12, 8.2, -15], [16, 7.7, -5],
      [1.5, 1.7, -36], [-1.5, 1.7, -40],
    ],
    chests: [[7, 5, -8.8], [-3, 0.5, -40]],
    hearts: [[3, 1.7, -38]],
    magnets: [[-12, 8.2, -16.8]],
    buddies: [],
    slimes: [{ ax: -3, az: -38, bx: 3, bz: -38, y: 0.5, speed: 1.3 }],
    hedgehogs: [
      { ax: -13, az: -6, bx: -13, bz: 4, y: 0, speed: 1.0 },
      { ax: 13, az: -14, bx: 13, bz: -6, y: 0, speed: 1.0 },
    ],
    birds: [{ cx: 0, cy: 2.5, cz: -8, r: 5, speed: 1.3 }],
    checkpoints: [[0, 0, 12], [0, 0.5, -34]],
    portal: [0, 0.5, -42],
  },
  {
    name: "Frosty Mountain",
    food: [["icecream", 3, 1.0, 2], ["apple", 9.6, 1.2, -11], ["cupcake", 2, 8.4, -57]],
    sky: 0xcfe8ff, fog: 0xe6f3ff,
    grass: 0xf7fbff, dirt: 0x9fb8d6, foliage: 0x2f7d5b,
    flowerColors: [0x9df2ff, 0xffffff, 0xb197fc, 0xff9ecf],
    spawn: [0, 0, 5],
    snow: true,
    discs: [
      { x: 0, z: 0, r: 6, y: 0, trees: 3, flowers: 6 },
      { x: 0, z: -12, r: 3.5, y: 0.6, flowers: 3 },
      { x: 0, z: -27, r: 4.5, y: 1.8, trees: 2, flowers: 4, rocks: 1 },
      { x: 8, z: -34, r: 3.5, y: 5.6, flowers: 3 },
      { x: 0, z: -41, r: 3.5, y: 6.2, trees: 1, flowers: 3 },
      { x: 0, z: -56, r: 6, y: 7.4, trees: 3, flowers: 7 },
      // exploration side islands
      { x: -8, z: -27, r: 2.5, y: 1.6, flowers: 2 },  // treasure island
      { x: 9, z: -12, r: 2.5, y: 0.2, flowers: 2 },   // heart island
    ],
    bridges: [
      { x: 0, z: -19, w: 3, d: 3, y: 1.2, move: { axis: "x", amp: 3, speed: 0.9 } },  // sliding ice floe
      { x: 0, z: -47.5, w: 2.6, d: 6, y: 6.5 },  // walk straight on from the island before it
    ],
    springs: [{ x: 3, z: -29, y: 1.8, power: 18 }],
    stars: [
      [0, 1.2, -1], [0, 1.2, -4],
      [0, 1.8, -12],
      [0, 2.4, -19],
      [0, 3.0, -26],
      [-8, 2.8, -27],
      [3, 6.5, -29],
      [8, 6.8, -34],
      [0, 7.4, -41],
      [0, 7.7, -47.5],
      [-2, 8.6, -55], [2, 8.6, -57],
    ],
    coins: [
      [0, 1.2, -6], [0, 1.8, -10], [0, 1.8, -14],
      [9, 1.4, -11], [9.8, 1.4, -12.8],          // heart island
      [-1.5, 3.0, -28], [1.5, 3.0, -25],
      [-8.8, 2.8, -26.2], [-7.2, 2.8, -27.8],    // treasure island
      [7, 6.8, -33], [9, 6.8, -35],
      [0, 7.4, -43], [0, 7.7, -50],
      [3, 8.6, -54],
    ],
    chests: [[-8, 1.6, -27.5]],
    hearts: [[9, 1.4, -12]],
    magnets: [[8, 6.8, -35.5]],
    buddies: [],
    slimes: [{ ax: -3, az: -27, bx: 3, bz: -27, y: 1.8, speed: 1.3 }],
    hedgehogs: [{ ax: -3, az: -56, bx: 3, bz: -56, y: 7.4, speed: 1.1 }],
    birds: [{ cx: 4, cy: 7.6, cz: -38, r: 3, speed: 1.3 }],
    checkpoints: [[-2, 1.8, -24.5], [-1.5, 6.2, -39.5]],
    portal: [0, 7.4, -59.5],
    balloons: [[-3, 8.6, -58]],
  },
  {
    name: "Bubbly Beach",
    sky: 0x7fd6ff, fog: 0xbdeeff,
    grass: 0xffe6a7, dirt: 0xd9a066, foliage: 0x3fbf6b,
    flowerColors: [0xff6b9d, 0xffd93d, 0xffffff, 0x5cb8ff],
    spawn: [0, 0, 5],
    ocean: true,
    props: { balls: [[-3, 0, 1]], boxes: [[2, 1.4, -28]] },
    food: [["cupcake", -3.5, 1.0, 3], ["pizza", 0, 2.4, -24], ["apple", 9, 1.6, -13]],
    discs: [
      { x: 0, z: 0, r: 6, y: 0, trees: 2, flowers: 6 },
      { x: 0, z: -11, r: 3.5, y: 0.4, flowers: 3 },
      { x: -7, z: -18, r: 3.5, y: 1.0, flowers: 3, rocks: 1 },
      { x: 0, z: -26, r: 4.5, y: 1.4, trees: 2, flowers: 4 },
      { x: 0, z: -36, r: 3.5, y: 2.0, flowers: 3 },
      { x: 0, z: -52, r: 6, y: 3.0, trees: 3, flowers: 7 },
      // secret sky islands (balloon / spring)
      { x: 8, z: -30, r: 3.5, y: 7.5, trees: 1, flowers: 3 },
      { x: -6, z: -57, r: 3, y: 8.3, flowers: 3 },
      // side island
      { x: 9, z: -12, r: 2.5, y: 0.6, flowers: 2 },
    ],
    bridges: [
      { x: 0, z: -42.5, w: 3, d: 3, y: 2.4, move: { axis: "z", amp: 2, speed: 1.0 } },
    ],
    springs: [{ x: -3, z: -52, y: 3.0, power: 18 }],
    balloons: [[3.5, 1.5, 2], [4, 2.6, -27], [3, 4.2, -55]],  // the first one is a practice balloon
    stars: [
      [0, 1.2, -1], [0, 1.2, -4],
      [0, 1.6, -11],
      [-7, 2.2, -18],
      [0, 2.6, -24],
      [8, 8.7, -30], [9.5, 8.7, -31.5],
      [0, 3.2, -36],
      [0, 3.6, -42.5],
      [-2, 4.2, -51], [2, 4.2, -53],
      [-6, 9.5, -57],
    ],
    coins: [
      [0, 1.2, -7], [0, 1.6, -13],
      [-5.5, 2.2, -17], [-8.5, 2.2, -19],
      [-2, 2.6, -27], [2, 2.6, -25],
      [4, 4.5, -27], [4, 6.0, -27.5],          // a balloon ride trail
      [7, 8.7, -29], [8.5, 8.7, -28.2],
      [9, 1.8, -11], [9.8, 1.8, -12.8],
      [0, 4.2, -49], [-6.8, 9.5, -57.8],
    ],
    chests: [[7, 7.5, -31.5]],
    hearts: [[9, 1.8, -12]],
    magnets: [[-5.2, 9.5, -56.2]],
    buddies: [],
    slimes: [{ ax: -3, az: -26, bx: 3, bz: -26, y: 1.4, speed: 1.2 }],
    hedgehogs: [{ ax: -3, az: -50, bx: 3, bz: -50, y: 3.0, speed: 1.0 }],
    birds: [{ cx: 0, cy: 3.6, cz: -31, r: 3, speed: 1.2 }],
    checkpoints: [[-2, 1.4, -24], [-2, 3.0, -48]],
    portal: [0, 3.0, -56],
    rainbow: true,
  },
];

/** Two more sky worlds, played after Bubbly Beach. */
LEVELS.push(
  {
    name: "Jungle Vines",
    sky: 0xbff0c8, fog: 0xd4f5da,
    grass: 0x4fbf5a, dirt: 0x7a5a3a, foliage: 0x1f8a4c,
    flowerColors: [0xff4757, 0xffd93d, 0xff9ecf, 0xffffff],
    spawn: [0, 0, 4.5],
    discs: [
      { x: 0, z: 0, r: 6, y: 0, trees: 5, flowers: 8 },
      { x: 0, z: -11, r: 3.5, y: 0.6, trees: 2, flowers: 3 },
      { x: -7, z: -18, r: 3.5, y: 1.2, trees: 2, flowers: 3 },
      { x: 0, z: -26, r: 4.5, y: 1.8, trees: 3, flowers: 4, rocks: 1 },
      { x: 0, z: -41, r: 4, y: 2.6, trees: 2, flowers: 3 },
      { x: 8, z: -47, r: 3.5, y: 3.4, trees: 2, flowers: 3 },
      { x: 0, z: -55, r: 6, y: 4.0, trees: 4, flowers: 7 },
      { x: 9, z: -11, r: 2.5, y: 0.4, flowers: 2 },      // snack island
      { x: -8, z: -40, r: 3, y: 9, trees: 1, flowers: 3 }, // treetop island (ride the balloon)
    ],
    bridges: [{ x: 0, z: -33.5, w: 3, d: 3, y: 2.2, move: { axis: "x", amp: 3, speed: 0.9 } }],
    springs: [{ x: 2.5, z: -27.5, y: 1.8, power: 16 }],
    balloons: [[-2.5, 3.8, -41.5]],
    stars: [
      [0, 1.2, 0], [0, 1.2, -3.5],
      [0, 1.8, -11],
      [-7, 2.4, -18],
      [0, 3.0, -25], [2.5, 5.6, -27.5],
      [0, 3.4, -33.5],
      [1.5, 3.8, -41],
      [8, 4.6, -47],
      [-8, 10.2, -40],
      [-2, 5.2, -54], [2, 5.2, -56],
    ],
    coins: [
      [0, 1.2, -6], [0, 1.8, -9.5],
      [-3.5, 2.2, -14.5], [-7, 2.4, -19.5], [-3.5, 2.8, -22],
      [1.5, 3.0, -27], [0, 3.8, -39.5],
      [4, 4.2, -44], [8, 4.6, -48.5], [4, 5.0, -51],
      [9, 1.6, -10], [9.8, 1.6, -12],
      [-8.8, 10.2, -40.8], [0, 5.2, -52],
    ],
    chests: [[9, 0.4, -11.6], [-8, 9, -39]],
    hearts: [[-7, 2.4, -17]],
    magnets: [[8, 4.6, -46]],
    food: [["apple", 9, 1.4, -10.4], ["cupcake", -1.5, 3.0, -26]],
    buddies: [],
    slimes: [
      { ax: -2.5, az: -26, bx: 2.5, bz: -26, y: 1.8, speed: 1.3 },
      { ax: -3, az: -55, bx: 3, bz: -55, y: 4.0, speed: 1.5 },
    ],
    hedgehogs: [{ ax: -2, az: -41, bx: 2, bz: -41, y: 2.6, speed: 0.9 }],
    birds: [{ cx: 0, cy: 3.6, cz: -33.5, r: 3, speed: 1.2 }],
    checkpoints: [[-2, 1.8, -24], [-1.5, 2.6, -39.5]],
    portal: [0, 4.0, -58],
    props: { balls: [[-3, 0, 1]] },
  },
  {
    // the Rainbow Peak route mirrored, at night
    name: "Starlight Peak",
    sky: 0x1b1f4a, fog: 0x2a2f6a,
    grass: 0x6d5bd0, dirt: 0x3d3580, foliage: 0x9df2ff,
    flowerColors: [0xffe066, 0xffffff, 0x9df2ff, 0xff9ecf],
    spawn: [0, 0, 4.5],
    night: true,
    discs: [
      { x: 0, z: 0, r: 6, y: 0, trees: 2, flowers: 7 },
      { x: 0, z: -10, r: 3.5, y: 0.8, flowers: 3 },
      { x: 0, z: -16, r: 4, y: 4.2, flowers: 4, rocks: 1 },
      { x: -12, z: -24, r: 4.5, y: 5.8, trees: 1, flowers: 4 },
      { x: -6, z: -31, r: 3.5, y: 6.6, flowers: 3 },
      { x: 0, z: -46, r: 6, y: 10.8, trees: 2, flowers: 6 },
      { x: 7, z: -17, r: 2.5, y: 4.0, flowers: 2 },    // treasure island
      { x: -9, z: -49, r: 2.5, y: 10.4, flowers: 2 },  // ice cream island
    ],
    bridges: [{ x: -6, z: -20, w: 3, d: 3, y: 5.0, move: { axis: "z", amp: 3.5, speed: 1.0 } }],
    springs: [
      { x: 0, z: -11.5, y: 0.8, power: 18 },
      { x: -6, z: -32.5, y: 6.6, power: 18 },
    ],
    stars: [
      [0, 1.2, 0], [0, 1.2, -3],
      [0, 2.0, -10],
      [0, 5.8, -13],
      [0, 5.4, -16], [-2, 5.4, -18],
      [-6, 6.2, -20],
      [-10.5, 7.0, -22], [-14, 7.0, -25.5],
      [-6, 7.8, -31],
      [-6, 11.6, -32.5],
      [2, 12.0, -44],
    ],
    coins: [
      [0, 1.2, -1.5], [-1.5, 1.2, -5],
      [-0.5, 5.4, -14], [1.5, 5.4, -17.5],
      [7, 5.2, -17], [7.8, 5.2, -16.2],
      [-11, 7.0, -23], [-13, 7.0, -25],
      [-6, 7.8, -29.5],
      [-9, 11.6, -49], [-9.8, 11.6, -48.2],
      [-2, 12.0, -45],
    ],
    chests: [[7, 4.0, -17]],
    hearts: [[-12, 7.0, -21.5]],
    magnets: [[-6, 7.8, -29.5]],
    food: [["icecream", -9, 11.4, -49.6], ["apple", 7.6, 5.0, -17.8]],
    buddies: [],
    slimes: [{ ax: -2.5, az: -16, bx: 2.5, bz: -16, y: 4.2, speed: 1.4 }],
    hedgehogs: [
      { ax: -14, az: -24, bx: -10.5, bz: -24, y: 5.8, speed: 0.9 },
      { ax: -3, az: -46, bx: 3, bz: -46, y: 10.8, speed: 1.1 },
    ],
    checkpoints: [[-1.5, 4.2, -14.5], [-12, 5.8, -26]],
    portal: [0, 10.8, -48],
  },
);

/**
 * Ground patterns drawn in code: soft blotches and specks of lighter and darker tone, plus little
 * grass blades or sand grains. Values sit around white, so the material colour still sets the hue.
 */
const groundTex = new Map<string, THREE.CanvasTexture>();
function groundTexture(kind: "grass" | "sand" | "dirt" | "plain"): THREE.CanvasTexture {
  const hit = groundTex.get(kind);
  if (hit) return hit;
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  let seed = kind.length * 977 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = kind === "plain" ? "#f4f4f4" : "#e6e6e6";
  g.fillRect(0, 0, N, N);
  // wrap-around drawing so the tile repeats without seams
  const dot = (x: number, y: number, r: number, col: string) => {
    g.fillStyle = col;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      g.beginPath();
      g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  const blobs = kind === "plain" ? 30 : 90;
  for (let i = 0; i < blobs; i++) {
    const v = 0.78 + rnd() * 0.32;
    const k = Math.round(Math.min(1, v) * 255);
    dot(rnd() * N, rnd() * N, 8 + rnd() * 26, `rgba(${k},${k},${k},0.35)`);
  }
  if (kind === "grass") {
    // short blades, light and dark
    g.lineWidth = 1.4;
    for (let i = 0; i < 2200; i++) {
      const x = rnd() * N, y = rnd() * N, h = 3 + rnd() * 6, lean = (rnd() - 0.5) * 3;
      const k = Math.round((0.62 + rnd() * 0.5) * 255);
      g.strokeStyle = `rgba(${Math.min(255, k)},${Math.min(255, k + 12)},${Math.min(255, k - 8)},0.55)`;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + lean, y - h);
      g.stroke();
    }
  } else if (kind === "sand" || kind === "dirt") {
    for (let i = 0; i < (kind === "sand" ? 5000 : 2600); i++) {
      const k = Math.round((0.6 + rnd() * 0.55) * 255);
      g.fillStyle = `rgba(${Math.min(255, k)},${Math.min(255, k)},${Math.min(255, k)},0.5)`;
      const sz = kind === "sand" ? 1 + rnd() * 1.2 : 1 + rnd() * 2.5;
      g.fillRect(rnd() * N, rnd() * N, sz, sz);
    }
    if (kind === "dirt") for (let i = 0; i < 40; i++) dot(rnd() * N, rnd() * N, 2 + rnd() * 4, "rgba(120,120,120,0.5)"); // pebbles
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  groundTex.set(kind, t);
  return t;
}

/** The texture darkens a little on average, so grass gets a touch brighter and a bit less neon. */
function grassTone(hex: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(1, hsl.s * 0.82), Math.min(1, hsl.l * 1.08));
}

/** Guard Gus tells kids what the castle is dressed up for this time of year. */
function seasonGusLines(): string[] {
  const s = currentSeason();
  if (s === "harvest") return ["It's harvest time! Come to the thanksgiving table by the gate and say thank you to God."];
  if (s === "christmas") return ["Merry Christmas! There's a tree in the courtyard waiting for someone to light it."];
  if (s === "easter") return ["Happy Easter! Five painted eggs are hidden round the castle. Can you find them all?"];
  return [];
}

/** `n` points on a circle (for coin trails around the big island's beach). */
function ring(n: number, r: number, cx: number, cz: number, y: number, phase = 0): [number, number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r] as [number, number, number];
  });
}

const SAND = 0xffe6a7;

/**
 * Adventure Island: the middle of the main island is (0, -20); its beach ring is 28–36 from it.
 * Coconut Cove is a second island to the north-east, middle (46, -66), joined by a sandy causeway.
 * Pine Island is the big one to the north-west, middle (-70, -62), also joined by a causeway.
 * Sunset Island lies to the south-east, middle (62, 22), and can only be reached by boat.
 */
const ADVENTURE_ISLAND: LevelDef = {
  name: "Adventure Island",
  sky: 0x8fd8ff, fog: 0xc4ecff,
  grass: 0x7ed957, dirt: 0xc9a26b, foliage: 0x3fa34d,
  flowerColors: [0xff6b9d, 0xffd93d, 0xffffff, 0xb197fc, 0xff9f43],
  spawn: [0, 0, 12],
  sea: -0.5,
  boatSpawn: [9.4, 21, 0],
  carSpawn: [-6, 0, 11, Math.PI / 2],
  food: [
    ["pizza", 40.5, 1.3, -58.2], ["icecream", 43.5, 1.3, -58.2], ["cupcake", 47, 1.3, -59],   // the snack hut
    ["cupcake", -3, 1.0, 6], ["apple", -14, 1.3, -6], ["apple", 6, 1.3, -38], ["icecream", 28, 1.0, -22],
    ["apple", -78, 1.3, -57], ["icecream", -70, 1.3, -67], ["pizza", 60, 1.3, 20], ["cupcake", 30, 31, 3],
    // the royal banquet in Sunny Castle's courtyard
    ["apple", -30.2, 1.45, 16.95], ["cupcake", -29, 1.45, 16.95], ["icecream", -27.8, 1.45, 16.95], ["pizza", -26.6, 1.45, 16.95],
  ],
  pirates: [[0, 50, 10, 0.22], [-64, 20, 8, -0.26], [46, -6, 6, 0.3]],
  // Castle Isle, joined to the beach: the gate faces the dock
  castles: [{
    x: -27, z: 22, turn: 1, name: "Sunny Castle", stone: 0xe0d8c8, roof: 0x4d7fd6, flag: 0xff6b9d,
    // Sparky's tour: out over the dock, the Ferris wheel, the pizza beach, the lighthouse, the camp, and home
    dragon: [[-6, 20, 42], [34, 26, 36], [70, 30, 4], [55, 32, -44], [12, 34, -86], [-38, 34, -76], [-80, 30, -38], [-66, 26, 8], [-46, 18, 34]],
  }],
  // the knight's ring course on Castle Isle, in front of the castle's south side
  knightRings: [[-35, 36, Math.PI / 2], [-31, 36, Math.PI / 2], [-27, 36, Math.PI / 2], [-23, 36, Math.PI / 2], [-19, 36, Math.PI / 2]],
  playground: [8, -1],
  station: [-2.8, 16.4],
  extraCars: [[38, 0, -62, 0]],
  // kick scooters: by the spawn, by the castle gate, at Coconut Cove and in the village
  scooters: [[3, 13, Math.PI / 2], [-15, 33, 0], [46, -57.5, 0], [12, -15, Math.PI]],
  // sightseeing: stand on the footprints and take a photo with the sight behind you
  photoSpots: [
    { name: "Sunny Castle", at: [-9.5, 24], look: [-27, 5.5, 22] },
    { name: "the Village Church", at: [12, -29.5], look: [12, 3.2, -37.5] },
    { name: "the view from Lookout Hill", at: [-12, -29.6], look: [12, 2, -14] },
    { name: "the Lighthouse", at: [6, -73.6], look: [6, 6, -78] },
    { name: "Sunset Island's pink tower", at: [59.5, 19.5], look: [64, 3.5, 16] },
    { name: "the Rocket on Pine Island", at: [-70, -34.5], look: [-70, 3.2, -40.5] },
  ],
  heliSpawn: [13, 0, 10, Math.PI],
  jetSpawn: [-31, 0, -12, Math.PI],
  rocket: [-70, 0, -40.5],
  rings: [
    [0, 10, -20, 0], [20, 14, -40, 0.8], [46, 18, -66, 0], [6, 16, -72, 0], [-30, 20, -50, 0.8],
    [-66, 17, -60, 0], [-56, 9, -14, 1.57], [62, 14, 22, 0], [0, 24, 22, 1.57], [22, 31, 0, 1.57],
  ],
  rainbow: true,
  herds: [
    { kinds: ["donkey", "alpaca", "alpaca"], x: -3, z: -17, r: 4.5 },          // by Farmer Fern's field
    { kinds: ["cow", "cow", "bull", "horse_white", "horse"], x: 61, z: 25, r: 7 }, // the farm on East Isle
    { kinds: ["deer", "stag", "deer", "fox"], x: -73, z: -66, r: 8 },           // the woods on West Isle
    { kinds: ["horse_white", "horse"], x: -11.5, z: 28, r: 3 },                // ready to ride, by the castle gate
  ],
  discs: [
    { x: 0, z: -20, r: 36, y: 0, color: SAND },                      // the beach
    { x: 0, z: -20, r: 28, y: 0.3, flowers: 26, rocks: 5 },           // the meadow
    // forest patches
    { x: -16, z: -8, r: 6, y: 0.34, trees: 6, flowers: 4 },
    { x: -24, z: -18, r: 5, y: 0.34, trees: 5, flowers: 3 },
    { x: 4, z: -40, r: 6, y: 0.34, trees: 6, flowers: 4 },
    { x: 23, z: -37, r: 4.5, y: 0.34, trees: 4, flowers: 3 },
    { x: -5, z: -3, r: 4, y: 0.34, trees: 3, flowers: 3 },
    { x: -14, z: 2, r: 8, y: 0.34 },                                   // the mansion's lawn
    // Lookout Hill (terraces you can walk up)
    { x: -12, z: -32, r: 11, y: 0.6, flowers: 6 },
    { x: -12, z: -32, r: 9, y: 0.9, flowers: 4 },
    { x: -12, z: -32, r: 7, y: 1.2, rocks: 2 },
    { x: -12, z: -32, r: 5.2, y: 1.5, flowers: 3 },
    { x: -12, z: -32, r: 3.6, y: 1.8, flowers: 2 },
    // far islets: sail there!
    { x: -56, z: -14, r: 5, y: 0.2, rocks: 2, trees: 1, color: SAND },   // Treasure Rock
    { x: 54, z: -30, r: 6, y: 0.2, trees: 3, flowers: 4, color: SAND },  // Palm Cay
    { x: 6, z: -78, r: 5.5, y: 0.2, rocks: 2, color: SAND },             // Lighthouse Rock
    { x: 30, z: 15, r: 3, y: 0.1, color: SAND },                         // the sandbar
    { x: 30, z: 0, r: 7, y: 30, trees: 1, flowers: 5, color: 0xffffff }, // Cloud Island, high in the sky: fly there!
    { x: -38, z: 36, r: 5.5, y: 0.2, trees: 2, rocks: 1, color: SAND },  // Shell Islet
    // Castle Isle (the castle needs a clear meadow, so no trees or rocks in the middle)
    { x: -27, z: 22, r: 21, y: 0, color: SAND },
    { x: -27, z: 22, r: 17, y: 0.3 },
    { x: -40, z: 34, r: 3.5, y: 0.34, trees: 3, flowers: 3 },
    { x: -13.5, z: 31, r: 3, y: 0.34, flowers: 4 },
    // the causeway: overlapping sand discs, wide enough for the car
    { x: 26.5, z: -46.5, r: 3.5, y: 0, color: SAND },
    { x: 30, z: -50, r: 3.5, y: 0, color: SAND },
    { x: 33.5, z: -53.5, r: 3.5, y: 0, color: SAND },
    // Coconut Cove
    { x: 46, z: -66, r: 17, y: 0, color: SAND },
    { x: 46, z: -66, r: 12.5, y: 0.3, flowers: 12, rocks: 2 },
    { x: 51, z: -71, r: 4.5, y: 0.34, trees: 5, flowers: 2 },
    { x: 40, z: -72, r: 3.5, y: 0.34, trees: 3 },
    { x: 50, z: -60, r: 4, y: 0.6, flowers: 2 },
    { x: 50, z: -60, r: 2.6, y: 0.9 },
    // the west causeway to Pine Island
    { x: -32.2, z: -39.3, r: 3.5, y: 0, color: SAND },
    { x: -36.4, z: -41.8, r: 3.5, y: 0, color: SAND },
    { x: -40.6, z: -44.4, r: 3.5, y: 0, color: SAND },
    { x: -44.8, z: -46.9, r: 3.5, y: 0, color: SAND },
    { x: -49, z: -49.4, r: 3.5, y: 0, color: SAND },
    // Pine Island: forests, a cabin, and Pine Peak (terraces you can walk up)
    { x: -70, z: -62, r: 24, y: 0, color: SAND },
    { x: -70, z: -62, r: 19, y: 0.3, flowers: 14, rocks: 4 },
    { x: -78, z: -54, r: 6, y: 0.34, trees: 7, flowers: 3 },
    { x: -60, z: -73, r: 4, y: 0.34, trees: 5, flowers: 2 },
    { x: -81, z: -71, r: 4.5, y: 0.34, trees: 5 },
    { x: -66, z: -60, r: 6.5, y: 0.6, flowers: 3 },
    { x: -66, z: -60, r: 5.3, y: 0.9 },
    { x: -66, z: -60, r: 4.2, y: 1.2, rocks: 1 },
    { x: -66, z: -60, r: 3.2, y: 1.5 },
    { x: -66, z: -60, r: 2.3, y: 1.8 },
    { x: -66, z: -60, r: 1.5, y: 2.1 },
    // Sunset Island (boat only)
    { x: 62, z: 22, r: 18, y: 0, color: SAND },
    { x: 62, z: 22, r: 13, y: 0.3, flowers: 12, rocks: 2 },
    { x: 68, z: 27, r: 4.5, y: 0.34, trees: 5 },
    { x: 56, z: 16, r: 4, y: 0.34, trees: 4, flowers: 2 },
  ],
  bridges: [{ x: 6, z: 19, w: 2.4, d: 8, y: 0.1 }], // the dock
  buildings: [
    // the village: every house is open, walk in through the door
    { x: 17, z: -12, w: 4, d: 4, h: 3.5, color: 0xff9ecf, enter: true },
    { x: 23, z: -18, w: 4, d: 4, h: 4.2, color: 0x5cb8ff, enter: true },
    { x: 16, z: -27, w: 5, d: 4, h: 3.2, color: 0xffd93d, enter: true },
    { x: 23, z: -27, w: 3.5, d: 3.5, h: 5, color: 0xb197fc, enter: true },
    { x: 6, z: -78, w: 2.6, d: 2.6, h: 9, color: 0xfdf6ec }, // the lighthouse
    { x: -14, z: 2, w: 9, d: 7, h: 5, color: 0xfff1c9, enter: true, lock: "mansion" }, // the mansion (for sale)
    { x: 42, z: -62, w: 4, d: 3.5, h: 3.2, color: 0xffa94d, enter: true },  // the Coconut Cove snack hut
    { x: -76, z: -63, w: 4, d: 4, h: 3.2, color: 0xc98a5b, enter: true },   // the Pine Island cabin
    { x: 64, z: 16, w: 3.5, d: 3.5, h: 6, color: 0xff9ecf }, // the Sunset Island tower
    { x: 12, z: -37.5, w: 6, d: 7, h: 4.6, color: 0xfdf6ec, enter: true, church: true }, // the village church
  ],
  scrolls: [
    [12, 1.4, -39.5, "Psalm 122:1"],        // inside the church
    [-12, 3.0, -33.5, "Psalm 121:2"],       // on Lookout Hill
    [6, 1.3, -76, "Matthew 5:16"],          // by the lighthouse
    [-56, 1.3, -12.5, "Matthew 6:33"],      // Treasure Rock
    [30, 31.2, 3, "Psalm 19:1"],            // Cloud Island
    [-70, 1.4, -68, "Psalm 24:1"],          // Pine Island
    [-30.5, 9.9, 22, "Psalm 46:1"],         // the lookout on top of the castle keep
  ],
  springs: [
    { x: 20, z: -18, y: 0.3, power: 18 },   // → the blue house roof
    { x: 8.6, z: -78, y: 0.2, power: 25 },  // → the top of the lighthouse
    { x: 45.3, z: -63.4, y: 0.3, power: 16 }, // → the snack hut roof (beside it, clear of the door)
    { x: -72.8, z: -63, y: 0.3, power: 16 }, // → the cabin roof
    { x: 64, z: 19.2, y: 0.3, power: 21 },  // → the top of the tower
  ],
  balloons: [[-12, 3.0, -32], [52, 1.6, -32], [-66, 3.3, -60]],
  stars: [
    [0, 1.2, 9], [20, 1.2, 6], [33, 1.2, -20], [-33, 1.2, -20], [0, 1.2, -54],   // around the beach
    [14, 1.5, -21], [23, 5.7, -18], [27, 1.5, -23],                               // the village
    [-16, 1.6, -8], [4, 1.6, -40],                                               // the forest
    [-12, 3.0, -30.5], [-12, 9.5, -32],                                           // Lookout Hill and the sky above it
    [6, 1.3, 22],                                                                // the end of the dock
    [-56, 1.4, -14], [54, 1.4, -30], [56, 1.4, -27], [6, 10.6, -78], [30, 1.3, 15], // by boat
    [-38, 1.4, 36],                                                              // Shell Islet (by boat)
    [30, 1.2, -50], [46, 1.5, -66], [50, 2.1, -60], [42, 4.7, -62],              // the causeway and Coconut Cove
    [-40.6, 1.2, -44.4], [-66, 3.0, -58], [-66, 10, -60], [-78, 1.6, -54],        // Pine Island
    [-60, 1.6, -73], [-76, 4.7, -63], [-91, 1.2, -62],
    [58, 1.5, 26], [64, 7.5, 16], [68, 1.6, 27], [77, 1.2, 22], [62, 1.2, 37],    // Sunset Island (by boat)
    [17, 1.5, -12.2], [23, 1.5, -27.2], [-76, 1.5, -63.3],                        // inside houses
    [30, 31.2, -1], [33.5, 31.2, 3],                                              // Cloud Island (fly there)
  ],
  coins: [
    [-33, 5.8, 30], [-30, 5.8, 30], [-27, 5.8, 30], [-24, 5.8, 30], [-21, 5.8, 30], // along the castle wall walk
    ...ring(16, 32, 0, -20, 1.0, 0.2),
    [0, 1.3, 4], [0, 1.3, 0], [0, 1.3, -4], [0, 1.3, -8],
    [10, 1.3, -18], [19, 1.3, -22], [20, 1.3, -14],
    [-8, 1.6, -28], [-10, 2.2, -30],
    [-55, 1.4, -16], [-57.5, 1.4, -12.5], [52.5, 1.4, -28], [4, 1.4, -75.5], [8, 1.4, -80.5],
    [26.5, 1.2, -46.5], [33.5, 1.2, -53.5], [44, 1.5, -70], [48, 1.5, -68], [52, 1.5, -56],
    [-37, 1.4, 34], [-39.5, 1.4, 37.5],
    [-32.2, 1.2, -39.3], [-36.4, 1.2, -41.8], [-44.8, 1.2, -46.9], [-49, 1.2, -49.4],
    ...ring(10, 21.5, -70, -62, 1.0),
    ...ring(8, 15.5, 62, 22, 1.0),
    [15.2, 1.4, -26.6], [17, 1.4, -26.6], [42, 1.4, -61.8],                       // inside houses
  ],
  chests: [[-57.5, 0.2, -15.5], [-54.5, 0.2, -11.5], [6, 0.34, -42], [3.5, 0.2, -80], [51, 0.34, -71], [-38, 0.2, 38],
    [-81, 0.34, -71], [-60, 0.34, -73.8], [56, 0.34, 15], [27, 30, 2.5]],
  hearts: [[55, 1.4, -32.5], [70, 1.5, 18]],
  magnets: [[-24, 1.6, -18]],
  buddies: [],
  slimes: [
    { ax: -6, az: -14, bx: 6, bz: -14, y: 0.3, speed: 1.1 },
    { ax: -2, az: -47, bx: 9, bz: -47, y: 0.3, speed: 1.2 },
    { ax: 42, az: -67.5, bx: 49, bz: -67.5, y: 0.3, speed: 1.1 },
    { ax: -74, az: -50, bx: -66, bz: -50, y: 0.34, speed: 1.2 },
  ],
  checkpoints: [[2.5, 0, 10.5], [12, 0.3, -15], [-6, 0.3, -24], [35, 0, -55], [-49.5, 0, -48], [47.5, 0, 23]],
  portal: [0, 0.3, -20],
  props: {
    // the beach loop is the car's race track
    cones: [[20.6, 0, 4.5], [22.6, 0, 2.6], [24.5, 0, 0.6], [-22, 0, 3], [-24, 0, 1], [-52, 0, -58], [-53, 0, -61]],
    boxes: [[10, 0.3, -24], [-18, 0.3, -14], [30, 0, -34], [-30, 0, -34], [0, 0, -53], [-56, 0.2, -17],
      [48, 0.3, -63], [33, 0, -70], [-70, 0.3, -72], [-58, 0.3, -58], [62, 0.3, 28]],
    balls: [[3.5, 0, 9], [12, 0.3, -17], [47, 0.3, -64.5], [-70, 0.3, -52], [58, 0.3, 20]],
    boosts: [[30.1, 0, -9.1, 2.79]],          // on the east beach, pointing north along the shore
    ramps: [[0, 0, -52, -Math.PI / 2], [-70, 0, -84.5, -Math.PI / 2]], // north beach; Pine Island's north beach
  },
  npcs: [
    {
      name: "Captain Coral", x: 3.6, y: 0, z: 15, outfit: 1, hat: 0, skin: 1,
      lines: [
        "Ahoy! That's my sailboat by the dock. Hop in and sail away!",
        "Pirate ships are sailing out there! Point my boat at one and press JUMP to fire the cannon.",
        "Sail west to Treasure Rock. I hear there are chests full of treasure!",
        "Sunset Island is east of my dock. You can only get there by boat!",
        "The lighthouse is far to the north. Sail all the way around Coconut Cove to reach it!",
      ],
    },
    {
      name: "Mayor Maple", x: 12.5, y: 0.3, z: -19, outfit: 4, hat: 3, skin: 3,
      lines: [
        "Welcome to Adventure Island! Find every star to open the portal in the meadow.",
        "Every house in the village is open. Walk in through the door and look around!",
        "The red car is for everyone. Drive around the island, then over the causeways to Coconut Cove and Pine Island!",
        "Want to earn coins? Villagers with a 💼 by their name have jobs for you!",
        "Golden scrolls are hidden around the islands. Each one has a Bible verse on it!",
        "Twenty-three friends live on these islands. Can you say hello to all of us?",
      ],
    },
    {
      name: "Grandma Gigi", x: 23.6, y: 0.3, z: -18.9, outfit: 2, hat: 4, skin: 1,
      lines: [
        "Oh, a visitor! Come in, come in. Make yourself at home, dear.",
        "The pink house has a star inside. So does the tall purple one!",
        "Mind your head when you jump indoors!",
      ],
    },
    {
      name: "Guard Gus", x: -14.5, y: 0.3, z: 18.2, outfit: 0, hat: 0, skin: 1,
      lines: [
        "Welcome to Sunny Castle! The gate is open. Come on in!",
        "Climb the stairs inside the walls and walk all the way round the top.",
        "The tall tower is the keep. There's a scroll waiting at the very top!",
        "A castle keeps everyone safe inside. The Bible says God is our refuge and strength, like a mighty castle!",
        "Sparky the dragon lives on top of the keep. He's very friendly! Climb up and he'll fly you round the island.",
        "Ring the bell in the courtyard and watch the doves fly up!",
        "Try sitting on the throne! And there's a feast on the banquet table.",
        "Brave knights ride a horse through the five rings outside. Can you get them all?",
        "Climb up on the wall and whoosh down the big spiral slide into the hay!",
        "There's a box of fireworks on the wall over the gate. Give the handle a push!",
        "Try on the knight's helmet by the throne. Put on the armour of God!",
        "The coloured stones by the gate sing when you step on them. Follow the glowing one to play a song!",
        "The king hid five golden keys round the castle. Find them all to open his treasure chest by the keep!",
        "Have you met the peacocks? Walk up close and they'll show you their beautiful tails.",
        "Round the back of the castle there's a bouncy castle! Hop in and boing, higher and higher!",
        "Behind the castle is a catapult full of soft pom-pom balls. Wait till the target raft floats past, then fling!",
        "Smell that? The baker's oven is in the back corner. Bake a loaf of bread and eat it warm!",
        "There's a puppet show by the throne! Press the button and watch the story of Noah's Ark.",
        "The flower garden by the gate is fast asleep. Water the buds and see what happens!",
        "Have a go on the rope swing by the slide. Up, up, up into the sky!",
        "Down on the beach there's a fishing jetty. There are five kinds of fish to catch, and we always let them go!",
        "Build a sandcastle on the beach! But watch out for the waves…",
        ...seasonGusLines(),
      ],
    },
    {
      name: "Shepherd Sam", x: 4, y: 0.3, z: -9, outfit: 3, hat: 4, skin: 3, quest: "lambs",
      lines: ["My lambs! Have you seen my little lambs?"],
    },
    {
      name: "Farmer Fern", x: -13, y: 0.3, z: -13, outfit: 3, hat: 4, skin: 2, job: "farm",
      spots: [[-8, 0.3, -17.5], [-6, 0.3, -17.5], [-4, 0.3, -17.5], [-8, 0.3, -20.5], [-6, 0.3, -20.5], [-4, 0.3, -20.5]],
      lines: [
        "Hello there! Your pet loves this forest. Listen to it hop!",
        "Try dancing with the 7 key. Pets love to dance too!",
        "Smash the gift boxes you find. There are coins inside!",
      ],
    },
    {
      name: "Ranger Rio", x: -3.5, y: 0.3, z: -27, outfit: 5, hat: 0, skin: 4,
      lines: [
        "Climb Lookout Hill and grab the balloon. You can see the whole island from up there!",
        "There's a star way up in the sky above the hill. Only a balloon can reach it.",
        "The water is shallow, so you can wade. A boat is much faster, though!",
      ],
    },
    {
      name: "Pirate Pip", x: -53.6, y: 0.2, z: -15.6, outfit: 0, hat: 2, skin: 0,
      lines: [
        "Arr! You found Treasure Rock! Open my chests, they're for you!",
        "Palm Cay is far to the east, past the big island. Bring the boat!",
      ],
    },
    {
      name: "Keeper Kai", x: 8.2, y: 0.2, z: -75.4, outfit: 2, hat: 1, skin: 1,
      lines: [
        "You sailed all this way! Bounce on the spring to reach the top of my lighthouse.",
        "From the top you can see every island. There's a star up there too!",
      ],
    },
    {
      name: "Surfer Sky", x: 36, y: 0, z: -57, outfit: 1, hat: 4, skin: 2, job: "clean",
      spots: [[46, 0, -51.5], [58.6, 0, -58.8], [58.6, 0, -73.2], [46, 0, -80.5], [33.4, 0, -73.2], [33.4, 0, -58.8]],
      lines: [
        "Welcome to Coconut Cove! You can walk or drive here over the sandy causeway.",
        "Climb the little hill for a star, and look inside the forest for treasure!",
      ],
    },
    {
      name: "Chef Chili", x: 45.5, y: 0.3, z: -61, outfit: 0, hat: 1, skin: 4, job: "pizza",
      lines: [
        "Hi! This is my snack hut. Grab a snack out front. Pizza makes you GIANT!",
        "Ice cream makes you super fast, and cupcakes give you mega jumps. Snacks grow back!",
        "Bounce on the spring to reach the star on my roof!",
        "Kick the big ball around the meadow. Your pet will chase after you!",
      ],
    },
    {
      name: "Explorer Eli", x: -51.5, y: 0, z: -51, outfit: 3, hat: 0, skin: 3,
      lines: [
        "This is Pine Island, the biggest forest around. Two treasure chests are hiding in the trees!",
        "Walk up Pine Peak and grab the balloon. There's a star high in the sky!",
      ],
    },
    {
      name: "Camper Cleo", x: -72, y: 0.3, z: -66, outfit: 5, hat: 2, skin: 1,
      lines: [
        "Welcome to my cabin! The spring will bounce you up to the roof.",
        "Drive the car over here and try the ramp on the north beach!",
      ],
    },
    {
      name: "Fisher Finn", x: 46.5, y: 0, z: 20, outfit: 1, hat: 0, skin: 4,
      lines: [
        "Ahoy, sailor! Welcome to Sunset Island. Nobody can drive here, only boats!",
        "Stars hide on every beach of this island. Walk all the way around!",
      ],
    },
    {
      name: "Artist Ari", x: 60, y: 0.3, z: 24, outfit: 2, hat: 4, skin: 2,
      lines: [
        "Isn't the pink tower pretty? Bounce on the spring to get to the very top.",
        "I love your outfit! You can change it any time from the title screen.",
      ],
    },
    {
      name: "Agent Goldie", x: -9, y: 0.34, z: 7, outfit: 5, hat: 1, skin: 0,
      sells: { id: "mansion", price: 60, what: "mansion" },
      lines: [
        "Enjoy your mansion! It has a sofa, a big TV and a golden trophy.",
        "Coins you earn are saved, even when you stop playing. Jobs are a great way to earn them!",
      ],
    },
    {
      name: "Pilot Piper", x: 15.5, y: 0, z: 12.5, outfit: 4, hat: 0, skin: 2,
      lines: [
        "That's my helicopter! Hop in, then hold JUMP to go up. Let go to float back down.",
        "Fly through the golden rings in the sky. There are ten of them!",
        "There's an island up in the clouds. And a jet on the west beach, if you like going FAST.",
      ],
    },
    {
      name: "Astronaut Ada", x: -66.5, y: 0, z: -41.5, outfit: 1, hat: 0, skin: 3,
      lines: [
        "Ready for space? Hop in the rocket and blast off to the Moon!",
        "On the Moon you can jump super high. Everything is floaty up there!",
      ],
    },
    {
      name: "Pastor Paul", x: 14.6, y: 0.3, z: -32.4, outfit: 4, hat: 0, skin: 3, job: "care",
      lines: ["Welcome to our little church! Everyone is welcome here."],
    },
    // ── job givers ──
    {
      name: "Postie Pat", x: 11, y: 0.3, z: -9, outfit: 4, hat: 1, skin: 2, job: "mail",
      lines: ["Letters, letters everywhere! Want to help me deliver them?"],
    },
    {
      name: "Chief Blaze", x: 8, y: 0.3, z: -27, outfit: 0, hat: 3, skin: 3, job: "fire",
      lines: ["I'm the fire chief. Brave helpers wanted!"],
    },
    {
      name: "Driver Dee", x: -8.5, y: 0, z: 12.5, outfit: 3, hat: 1, skin: 1, job: "bus",
      spots: [[31.5, 0, -25.6], [18.4, 0, -46.2], [-13.5, 0, -49], [-30.9, 0, -28.3]],
      lines: ["Beep beep! The island bus needs a driver."],
    },
    {
      name: "Fisher Flo", x: 8, y: 0, z: 14.2, outfit: 1, hat: 4, skin: 0, job: "fish",
      spots: [[-20, -0.5, 26], [22, -0.5, 28], [-46, -0.5, 4], [40, -0.5, 2], [2, -0.5, 34]],
      lines: ["The fish are jumping today!"],
    },
    {
      name: "Cargo Cass", x: 10.5, y: 0, z: 7.5, outfit: 5, hat: 0, skin: 4, job: "cargo",
      spots: [[30, 30, 0], [6, 9.2, -78], [64, 6.3, 16], [-66, 2.1, -60], [-12, 1.8, -32]],
      lines: ["Parcels to fly! Can you fly a helicopter?"],
    },
    {
      name: "Diver Dot", x: -36.5, y: 0.2, z: 34.5, outfit: 2, hat: 0, skin: 0,
      lines: [
        "You found Shell Islet! Not many sailors come this far south.",
        "There's a treasure chest behind me. It's all yours!",
      ],
    },
  ],
};
LEVELS.push(ADVENTURE_ISLAND);

/** Moon Base: reached by rocket. Low gravity, so every jump is huge. */
const MOON: LevelDef = {
  name: "Moon Base",
  sky: 0x05061a, fog: 0x05061a,
  grass: 0xc3c8d4, dirt: 0x8a90a0, foliage: 0x8a90a0,
  flowerColors: [0xffffff],
  spawn: [0, 0, 8],
  gravity: 0.3,
  space: true,
  carSpawn: [5, 0, 8, Math.PI], // the moon buggy
  station: [-3, 5.5],
  food: [["cupcake", 3, 1.0, -5], ["icecream", -10, 1.0, -9], ["pizza", 14, 1.0, -14]],
  rocket: [-7, 0, 9],
  discs: [
    { x: 0, z: -14, r: 30, y: 0, rocks: 12 },
    // crater mounds
    { x: -12, z: -18, r: 6, y: 0.5 }, { x: -12, z: -18, r: 4, y: 1.0 }, { x: -12, z: -18, r: 2.4, y: 1.5 },
    { x: 12, z: -26, r: 7, y: 0.6 }, { x: 12, z: -26, r: 5, y: 1.2 }, { x: 12, z: -26, r: 3, y: 1.8, rocks: 1 },
    // floating rocks: easy to reach with moon jumps
    { x: 0, z: -22, r: 2.5, y: 4 },
    { x: 5, z: -28, r: 2.2, y: 8 },
    { x: -2, z: -34, r: 2.5, y: 12 },
    { x: 22, z: -6, r: 2.5, y: 5 },
  ],
  bridges: [],
  springs: [{ x: -18, z: -4, y: 0, power: 14 }], // a trampoline on the Moon goes a LONG way up
  buildings: [
    { x: -8, z: -30, w: 5, d: 4, h: 3.4, color: 0xf4f6fb, enter: true },
    { x: 10, z: -8, w: 4, d: 4, h: 3.4, color: 0xdfe6ee, enter: true },
  ],
  stars: [
    [0, 1.2, 2], [0, 1.2, -8],
    [-12, 2.9, -18], [12, 3.2, -26],
    [0, 5.4, -22], [5, 9.4, -28], [-2, 13.4, -34], [22, 6.4, -6],
    [-18, 10, -4],
    [-8, 1.5, -30.2], [10, 1.5, -8.2],
    [20, 1.2, -30], [-22, 1.2, -26], [0, 1.2, -38],
  ],
  coins: [...ring(12, 20, 0, -14, 1.0), [0, 1.2, -3], [0, 1.2, -13], [-18, 4, -4], [-18, 7, -4]],
  chests: [[13.5, 1.8, -27]],
  hearts: [[22, 6.4, -7]],
  magnets: [[-2, 13.4, -33]],
  buddies: [],
  slimes: [{ ax: -6, az: -12, bx: 6, bz: -12, y: 0, speed: 1.0 }],
  checkpoints: [[2.5, 0, -10]],
  portal: [0, 0, -41],
  props: {
    balls: [[4, 0, -2]],
    boxes: [[-4, 0, -16], [16, 0, -16], [-20, 0, -14]],
    ramps: [[0, 0, -28, Math.PI]],
  },
  npcs: [
    {
      name: "Zib", x: 3.2, y: 0, z: 3.5, outfit: 3, hat: 2, skin: 5,
      lines: [
        "Greetings, Earth kid! Welcome to the Moon. Try a jump. Whee!",
        "Hop up the floating rocks. The highest star is waaay up there.",
        "The moon buggy is fun on the ramp. It flies for ages!",
      ],
    },
    {
      name: "Blorp", x: -3.5, y: 0, z: -24, outfit: 5, hat: 1, skin: 5, job: "moon",
      spots: [[-6, 0, -6], [8, 0, -16], [-16, 0, -24], [18, 0, -14], [-20, 0, -10], [6, 0, -34]],
      lines: [
        "Blorp says hi! Our moon base doors are open. Come inside!",
        "That blue ball in the sky is your home. Pretty, isn't it?",
      ],
    },
  ],
};
LEVELS.push(MOON);

/** n coins in a row from (x0, z0) to (x1, z1). */
function line(n: number, x0: number, z0: number, x1: number, z1: number, y: number): [number, number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return [x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t] as [number, number, number];
  });
}

const PAVEMENT = 0xd6d0c4;
const PARK = 0x7ccf5a;

/**
 * Sunshine City: a seaside city at golden hour. A grid of streets with traffic, glass skyscrapers
 * you can bounce up to (and glide off), parks, shops, homes, a fire station, a pier with a boat,
 * a Ferris wheel on the beach, and a helicopter waiting on top of Sunshine Tower.
 *
 * Avenues run north–south at x = ±12, ±36 and streets east–west at z = ±12, ±36 (6 m wide), so the
 * blocks between them are 18 m across and centered on x, z ∈ {-24, 0, 24}.
 */
const SUNSHINE_CITY: LevelDef = {
  name: "Sunshine City",
  sky: 0xffb88c, skyTop: 0x4f7fd0, fog: 0xffd9b8,
  light: { sun: 0xffcf9a, sky: 0xffe6cc, ground: 0x9a8a7a },
  grass: PARK, dirt: 0xb8a68a, foliage: 0x3fa34d,
  flowerColors: [0xff6b9d, 0xffd93d, 0xffffff, 0xb197fc],
  spawn: [0, 0, 46],
  sea: -0.5,
  freeGlide: true, // glide off the skyscrapers!
  streetlife: true,
  fountain: [0, 0],
  carSpawn: [-12, 0, 46, Math.PI],
  station: [7, 48.5],
  extraCars: [[-24, 0, 42, Math.PI / 2], [28, 0, 42, -Math.PI / 2]],
  boatSpawn: [4.4, 75, 0],
  heliSpawn: [24, 40.3, -24, Math.PI],
  ferris: [64, -0.15, 0, Math.PI / 2],
  pirates: [[0, 104, 12, 0.2]],
  traffic: [
    // the outer ring road, keeping right
    { pts: [[37.5, 37.5], [37.5, -37.5], [-37.5, -37.5], [-37.5, 37.5]], cars: 5, speed: 7 },
    // the inner ring around the plaza, the other way round
    { pts: [[10.5, -10.5], [10.5, 10.5], [-10.5, 10.5], [-10.5, -10.5]], cars: 3, speed: 5.5 },
  ],
  herds: [{ kinds: ["shibainu", "husky"], x: 0, z: -24, r: 5 }], // dogs playing in Maple Park
  discs: [
    { x: 0, z: 0, r: 68, y: -0.15, color: SAND },                         // the beach all around
    { x: 0, z: 0, r: 60, y: 0, color: PAVEMENT, paved: true },             // the city
    { x: 0, z: -24, r: 8.6, y: 0.05, trees: 5, flowers: 12 },              // Maple Park
    { x: 0, z: 24, r: 8.6, y: 0.05, flowers: 10 },                         // the Fun Park
    { x: -24, z: 5.5, r: 3.2, y: 0.05, trees: 1, flowers: 3 },             // the fire station lawn
    { x: 50, z: -20, r: 4.5, y: 0.05, trees: 2, flowers: 3 }, { x: 50, z: 20, r: 4.5, y: 0.05, trees: 2, flowers: 3 },
    { x: -50, z: -20, r: 4.5, y: 0.05, trees: 2, flowers: 3 }, { x: -50, z: 20, r: 4.5, y: 0.05, trees: 2, flowers: 3 },
    { x: -48, z: -46, r: 3, y: 0.05, trees: 1 }, { x: 48, z: -46, r: 3, y: 0.05, trees: 1 },
  ],
  bridges: [{ x: 0, z: 72, w: 4, d: 12, y: 0.15 }], // the pier
  roads: [
    ...[-36, -12, 12, 36].map((x) => ({ x, z: 0, w: 6, d: 96 })),
    ...[-36, -12, 12, 36].map((z) => ({ x: 0, z, w: 96, d: 6 })),
  ],
  buildings: [
    // downtown: glass towers
    { x: 24, z: -24, w: 12, d: 12, h: 40, color: 0x8fd0ff, style: "glass" },  // Sunshine Tower (helipad on top)
    { x: -28, z: -28, w: 8, d: 8, h: 28, color: 0xc7a8ff, style: "glass" },
    { x: -20, z: -20, w: 6, d: 6, h: 18, color: 0x7ed9c4, style: "glass" },
    { x: 24, z: -46, w: 12, d: 6, h: 6, color: 0xc98a5b },                   // harbor warehouses
    { x: -24, z: -46, w: 12, d: 6, h: 6, color: 0x8a90a0 },
    // the civic block: fire station and post office (walk in)
    { x: -27, z: -3, w: 8, d: 6, h: 5, color: 0xff4757, enter: true },
    { x: -18.5, z: -3.5, w: 5, d: 5, h: 4.5, color: 0x5cb8ff, enter: true },
    // the east shops: pizza place (walk in), toy store, the long market
    { x: 20, z: -3, w: 5, d: 5, h: 4, color: 0xffa94d, enter: true },
    { x: 28, z: -3, w: 6, d: 6, h: 7, color: 0xff9ecf },
    { x: 24, z: 5.5, w: 14, d: 5, h: 6, color: 0x7ed957 },
    // homes (the lilac one is for sale) and apartments
    { x: -28, z: 21, w: 6, d: 6, h: 4.5, color: 0xffd93d, enter: true },
    { x: -19.5, z: 21, w: 5, d: 5, h: 4, color: 0xb197fc, enter: true, lock: "cityhouse" },
    { x: -24, z: 30, w: 14, d: 4, h: 9, color: 0xff9ecf },
    // shopping street
    { x: 19.5, z: 20.5, w: 7, d: 7, h: 9, color: 0xffd93d },
    { x: 28.5, z: 20.5, w: 7, d: 7, h: 12, color: 0x4ecbd9 },
    { x: 24, z: 29, w: 16, d: 6, h: 7, color: 0xff8c42 },
    { x: 50, z: 0, w: 7, d: 8, h: 5, color: 0xfdf6ec, enter: true, church: true },   // Sunshine Chapel, by the east beach
  ],
  scrolls: [
    [50, 1.3, -2.5, "Psalm 100:2"],          // inside the chapel
    [28, 41.6, -27.5, "Psalm 46:10"],        // on top of Sunshine Tower
    [0, 1.3, -30, "Psalm 23:1"],             // Maple Park
    [0, 1.4, 74, "Psalm 136:1"],             // the pier
    [-56, 1.1, -30, "Joshua 1:9"],           // the west beach
  ],
  springs: [
    { x: 24, z: -16.9, y: 0, power: 52 },     // → the top of Sunshine Tower (and the helicopter)
    { x: -22.9, z: -28, y: 0, power: 43 },    // → the lilac tower
    { x: -20, z: -15.9, y: 0, power: 35 },    // → the mint tower
    { x: 31.9, z: -3, y: 0, power: 24 },      // → the toy store
    { x: 19.5, z: 15.9, y: 0, power: 26 },    // → the yellow shop
    { x: 28.5, z: 15.9, y: 0, power: 30 },    // → the blue shop
    { x: -24, z: 26.9, y: 0, power: 26 },     // → the apartments
    { x: -4, z: 24, y: 0.05, power: 18 },     // Fun Park trampolines
    { x: 4, z: 24, y: 0.05, power: 14 },
  ],
  balloons: [[0, 1.6, 30]],
  rings: [
    [0, 22, -24, 0], [-24, 36, -24, 0.8], [24, 48, -24, 0], [36, 26, 0, 1.57],
    [0, 28, 24, 0], [-36, 22, 0, 1.57], [0, 32, -48, 0], [48, 18, 48, 0.8],
  ],
  stars: [
    // rooftops
    [20.5, 41.6, -20.5], [-28, 29.6, -28], [-20, 19.6, -20], [28, 8.6, -3], [19.5, 10.6, 20.5],
    [28.5, 13.6, 20.5], [24, 8.6, 29], [-24, 10.6, 30], [24, 7.6, -46],
    // streets and plazas
    [0, 2.1, 0], [-36, 1.2, 0], [36, 1.2, 0], [0, 1.2, -36], [24, 1.2, 12],
    // the parks
    [0, 1.3, -24], [-5, 1.3, -30], [3, 8.5, 30],
    // the pier and the beach
    [0, 1.4, 77], [63, 1.1, 12], [-63, 1.1, -10], [40, 1.1, -49], [-44, 1.1, 46],
    // inside the fire station and the pizza place
    [-27, 1.5, -3.5], [20, 1.5, -3.5],
  ],
  coins: [
    ...line(6, -30, 46, -18, 46, 1.0), ...line(6, 18, 46, 30, 46, 1.0),
    ...line(8, 36, 30, 36, -30, 1.0), ...line(8, -36, -30, -36, 30, 1.0),
    ...line(6, -9, -36, 9, -36, 1.0), ...ring(10, 5, 0, 0, 1.0),
    ...ring(8, 6.5, 0, -24, 1.05), ...line(5, 0, 67, 0, 77, 1.15),
    [24, 41.6, -27.5], [-26, 29.6, -26], [-24, 10.6, 31],
  ],
  chests: [[-30, 28.25, -30], [27.5, 40.25, -27.5], [1.4, 0.15, 77.6], [-58, -0.15, 30]],
  hearts: [[0, 1.3, -29], [-50, 1.3, 20]],
  magnets: [[19.5, 10.6, 22.5]],
  buddies: [],
  slimes: [{ ax: -5, az: -21, bx: 5, bz: -21, y: 0.05, speed: 1.1 }],
  checkpoints: [[3, 0, 42], [3, 0, 6.5], [27, 0, -14.5], [-14.5, 0, -24]],
  portal: [0, 0, -50],
  food: [["pizza", 18, 1.0, 1.8], ["icecream", 6, 1.05, 30], ["cupcake", -8, 1.0, 41], ["apple", -4, 1.05, -19], ["icecream", 1.2, 1.15, 70]],
  props: {
    balls: [[3, 0, 8], [-3, 0.05, 28]],
    boxes: [[-30, 0, 8], [30, 0, 9.5], [8, 0, -42], [-46, 0, 0], [46, 0, -8]],
    cones: [[-15.5, 0, 41], [-15.5, 0, 43], [-15.5, 0, 45]],
  },
  npcs: [
    {
      name: "Granny Whiskers", x: -5, y: 0, z: 42, outfit: 2, hat: 4, skin: 1, quest: "kittens",
      lines: ["Have you seen my kittens?"],
    },
    {
      name: "Mayor Marigold", x: 3, y: 0, z: 43.5, outfit: 4, hat: 3, skin: 2,
      lines: [
        "Welcome to Sunshine City! Find every star to open the portal by the harbor.",
        "The cars drive by themselves, and they always stop for kids. Still, look both ways!",
        "Bounce on the red trampolines to reach the rooftops, then glide down!",
        "There's a helicopter on top of Sunshine Tower. The big trampoline will get you up there!",
        "Villagers with a 💼 by their name have jobs for you. Earn coins!",
      ],
    },
    {
      name: "Officer Ollie", x: -9, y: 0, z: 31, outfit: 5, hat: 1, skin: 3,
      lines: [
        "Hello, citizen! The crosswalks are the white stripes. Very safe!",
        "The red car by the promenade is yours to drive. Stay on the roads!",
        "Have you seen the Ferris wheel on the east beach? It never stops turning.",
      ],
    },
    {
      name: "Musician Milo", x: 3.2, y: 0, z: 6.6, outfit: 2, hat: 4, skin: 4,
      lines: [
        "🎵 La la la! This fountain is my stage. Try dancing with the 7 key!",
        "Jump onto the fountain's edge. There's a star in the spray!",
      ],
    },
    {
      name: "Coach Kit", x: 6.5, y: 0.05, z: 21, outfit: 3, hat: 0, skin: 1,
      lines: [
        "Welcome to the Fun Park! The big trampoline sends you sky high.",
        "Grab the balloon and float up to the star!",
      ],
    },
    {
      name: "Agent Aria", x: -16.6, y: 0, z: 26.4, outfit: 5, hat: 1, skin: 2,
      sells: { id: "cityhouse", price: 80, what: "city house" },
      lines: [
        "Enjoy your city house! It's cozy inside.",
        "Coins you earn are saved. Jobs are a great way to earn more!",
      ],
    },
    {
      name: "Pastor Grace", x: 52.6, y: 0, z: 6, outfit: 2, hat: 0, skin: 1, job: "care",
      lines: ["Sunshine Chapel is open! Come in and sit a while."],
    },
    // ── job givers ──
    {
      name: "Chef Pepper", x: 22.6, y: 0, z: 1.4, outfit: 0, hat: 1, skin: 3, job: "pizza",
      lines: ["Hot pizza, coming up!"],
    },
    {
      name: "Postie Paz", x: -15.6, y: 0, z: 0.8, outfit: 4, hat: 1, skin: 0, job: "mail",
      lines: ["So many letters today!"],
    },
    {
      name: "Chief Ember", x: -23.6, y: 0, z: 1.4, outfit: 0, hat: 3, skin: 1, job: "fire",
      lines: ["The fire station is always ready!"],
    },
    {
      name: "Driver Dash", x: -15.2, y: 0, z: 47, outfit: 3, hat: 1, skin: 4, job: "bus",
      spots: [[37.5, 0, 24], [24, 0, -37.5], [-37.5, 0, -24], [-24, 0, 37.5]],
      lines: ["The city bus needs a driver!"],
    },
    {
      name: "Pilot Penny", x: 28, y: 0, z: -16.2, outfit: 1, hat: 0, skin: 2, job: "cargo",
      spots: [[-28, 28, -28], [-20, 18, -20], [28.5, 12, 20.5], [-24, 9, 30], [19.5, 9, 20.5]],
      lines: ["My helicopter is up on Sunshine Tower. Bounce up on the big trampoline!"],
    },
    {
      name: "Ranger Rosa", x: 7.5, y: 0.05, z: -19, outfit: 3, hat: 4, skin: 0, job: "clean",
      spots: [[-5, 0.05, -21], [4, 0.05, -28], [6, 0.05, -23], [-3, 0.05, -29.5], [0.5, 0.05, -17], [-6.5, 0.05, -26]],
      lines: ["Maple Park is my favorite place!"],
    },
    {
      name: "Fisher Fred", x: -1.2, y: 0.15, z: 68.5, outfit: 1, hat: 4, skin: 3, job: "fish",
      spots: [[-20, -0.5, 82], [20, -0.5, 84], [40, -0.5, 70], [-42, -0.5, 64], [0, -0.5, 90]],
      lines: ["The harbor is full of fish!"],
    },
  ],
};
LEVELS.push(SUNSHINE_CITY);

/**
 * Noah's Ark (Genesis 6–9): a green island with the great ark in the middle. Climb the ramp to the
 * deck, help Noah send the animals aboard two by two, and look for the rainbow.
 */
const ARK_ISLAND: LevelDef = {
  name: "Noah's Ark",
  sky: 0x9fd4ff, fog: 0xd4ecff,
  grass: 0x7ed957, dirt: 0xc9a26b, foliage: 0x3fa34d,
  flowerColors: [0xff6b9d, 0xffd93d, 0xffffff, 0xb197fc],
  spawn: [0, 0.3, 6],
  sea: -0.5,
  rainbow: true,
  ark: [0, -30],
  playground: [-18, -30],
  station: [-4.5, 8],
  herds: [
    // more animals waiting for the ark, two by two
    { kinds: ["cow", "bull", "donkey", "donkey"], x: -12, z: 2, r: 6 },
    { kinds: ["alpaca", "alpaca", "fox", "fox", "wolf", "wolf"], x: 18, z: -36, r: 6 },
  ],
  discs: [
    { x: 0, z: -20, r: 40, y: 0, color: SAND },
    { x: 0, z: -20, r: 33, y: 0.3, flowers: 24, rocks: 5 },
    { x: -22, z: -14, r: 6, y: 0.34, trees: 6, flowers: 3 },
    { x: 22, z: -18, r: 6, y: 0.34, trees: 6, flowers: 3 },
    { x: -14, z: -44, r: 5, y: 0.34, trees: 5 },
    { x: 16, z: -45, r: 5, y: 0.34, trees: 5 },
    { x: 14, z: 0, r: 5.5, y: 0.6, flowers: 3 }, { x: 14, z: 0, r: 4, y: 0.9 }, { x: 14, z: 0, r: 2.6, y: 1.2, flowers: 2 }, // a little hill
  ],
  bridges: [],
  springs: [{ x: -8, z: -24.6, y: 0.3, power: 21 }], // → straight up onto the deck
  balloons: [[14, 2.4, 0]],
  birds: [{ cx: 0, cy: 11, cz: -30, r: 9, speed: 0.9 }], // the dove
  stars: [
    [0, 1.5, 0], [-10, 1.5, -6], [10, 1.5, -12], [-22, 1.6, -14], [22, 1.6, -18],
    [14, 2.6, 0], [14, 9, 0],
    [0, 3.2, -21.5],                                 // halfway up the ramp
    [-8, 5.6, -30], [8, 5.6, -30], [0, 9.2, -30],    // the deck and the cabin roof
    [-14, 1.6, -44], [16, 1.6, -45], [0, 1.5, -50], [-34, 1.2, -20], [34, 1.2, -20],
  ],
  coins: [...ring(14, 26, 0, -20, 1.3), ...line(6, 0, -16.5, 0, -25.5, 3.0), ...line(6, -9, -30, -4, -30, 5.4), ...line(6, 4, -30, 9, -30, 5.4)],
  chests: [[9.5, 4.3, -32], [-30, 0, -40]],
  hearts: [[-9.5, 5.4, -28]],
  magnets: [],
  buddies: [],
  slimes: [],
  checkpoints: [[2.5, 0.3, 3], [3, 4.3, -28]],
  portal: [-14, 0.3, 2],
  food: [["apple", 6, 1.3, -6], ["apple", -6, 1.3, -40], ["cupcake", 20, 1.3, -30]],
  scrolls: [
    [0, 5.5, -27.5, "Genesis 1:1"],          // on the deck
    [14, 2.4, -1.5, "Psalm 136:1"],          // the little hill
    [-28, 1.3, -28, "Proverbs 3:5"],
    [26, 1.3, -40, "Isaiah 41:10"],
  ],
  npcs: [
    {
      name: "Noah", x: 3, y: 0.3, z: -11, outfit: 3, hat: 0, skin: 2, job: "ark",
      spots: [[-20, 0.3, -6], [21, 0.3, -8], [-25, 0.3, -32], [25, 0.3, -30], [0, 0.3, -48], [-8, 0.3, 4]],
      lines: ["God told me to build this ark. He always keeps his promises!"],
    },
    {
      name: "Shem", x: -4, y: 0.3, z: -14.5, outfit: 1, hat: 0, skin: 2, quest: "doves",
      lines: [
        "We built the ark out of gopher wood, just as God said. It took a very long time!",
        "Walk up the ramp to the deck. You can see the whole island from up there.",
      ],
    },
    {
      name: "Ham", x: 5.5, y: 4.3, z: -28.2, outfit: 0, hat: 0, skin: 3,
      lines: [
        "Two of every animal are coming aboard. The elephants take up a lot of room!",
        "It rained for forty days and forty nights, and God kept us all safe.",
      ],
    },
    {
      name: "Japheth", x: -22, y: 0.3, z: -24, outfit: 5, hat: 0, skin: 1,
      lines: [
        "Noah sent out a dove, and it came back with an olive leaf. The water was going down!",
        "See the rainbow? It is God's promise that he will never flood the whole earth again.",
      ],
    },
  ],
};
LEVELS.push(ARK_ISLAND);

/**
 * Paradise Resort: a beach hotel with a pool and a water slide, a tiki snack bar, a spa, palm
 * trees and umbrellas, a boat at the dock and a helicopter on the hotel roof.
 */
const RESORT: LevelDef = {
  name: "Paradise Resort",
  sky: 0x7fd4ff, fog: 0xcdeeff,
  grass: 0x7ed957, dirt: 0xc9a26b, foliage: 0x3fa34d,
  flowerColors: [0xff6b9d, 0xffd93d, 0xffffff, 0xff9f43],
  spawn: [0, 0.3, 12],
  sea: -0.5,
  freeGlide: true,
  boatSpawn: [3.4, 34, 0],
  playground: [-17, -8],
  station: [-4.5, 10.5],
  extraCars: [[8, 0.3, -17, 0]],
  props: { balls: [[3, 0.34, 3.5], [-12, 0.3, -5]], boxes: [[20, 0.3, -8], [-6, 0, 22]], cones: [[5, 0.3, -17], [11, 0.3, -17]] },
  heliSpawn: [4, 20.25, -30, Math.PI],
  pirates: [[0, 62, 10, 0.2]],
  discs: [
    { x: 0, z: -10, r: 40, y: 0, color: SAND },
    { x: 0, z: -14, r: 25, y: 0.3, flowers: 16 },
    { x: 0, z: -4, r: 9.5, y: 0.34, color: 0xf4efe6, paved: true },          // the pool deck
    { x: -29, z: 4, r: 4, y: 0.05, trees: 3, color: SAND }, { x: 29, z: 4, r: 4, y: 0.05, trees: 3, color: SAND },
    { x: -33, z: -22, r: 4, y: 0.05, trees: 3, color: SAND }, { x: 33, z: -22, r: 4, y: 0.05, trees: 3, color: SAND },
    { x: -16, z: 22, r: 3, y: 0.05, trees: 2, color: SAND }, { x: 16, z: 22, r: 3, y: 0.05, trees: 2, color: SAND },
  ],
  brooks: [{ x: 0, z: -4, w: 11, d: 7 }],                                     // the swimming pool
  umbrellas: [
    [-10, 0, 19, 0xff6b9d], [-4, 0, 21, 0xffd93d], [4, 0, 21, 0x5cb8ff], [10, 0, 19, 0x7ed957],
    [-22, 0, 12, 0xff9f43], [22, 0, 12, 0xb197fc], [-8.2, 0.34, -9.5, 0xffffff], [8.2, 0.34, 1.5, 0xffffff],
  ],
  bridges: [
    { x: 0, z: 32, w: 2.4, d: 8, y: 0.1 },                                    // the dock
    // the water slide: from the pink tower down into the pool
    ...Array.from({ length: 8 }, (_, i) => ({ x: -9.6 + i * 0.75, z: -4, w: 0.8, d: 1.6, y: 5.7 - i * 0.68 })),
  ],
  buildings: [
    { x: 0, z: -30, w: 16, d: 8, h: 20, color: 0xfff1c9, style: "glass" },    // the hotel
    { x: -14, z: -24, w: 6, d: 5, h: 4, color: 0xffd9a8, enter: true },       // the lobby
    { x: 14, z: -24, w: 5, d: 5, h: 4, color: 0x9df2ff, enter: true },        // the spa
    { x: 15, z: -6, w: 4, d: 3.5, h: 3, color: 0xffa94d, enter: true },       // the tiki snack bar
    { x: -12, z: -4, w: 3, d: 3, h: 6, color: 0xff9ecf },                     // the slide tower
  ],
  springs: [
    { x: -12, z: -1.4, y: 0.3, power: 21 },     // → the slide tower
    { x: 0, z: -24.9, y: 0.3, power: 38 },      // → the hotel roof (and the helicopter)
    { x: 5.5, z: 6.5, y: 0.3, power: 15 },      // a trampoline by the pool
  ],
  balloons: [[-20, 1.6, 16]],
  rings: [[0, 26, -30, 0], [20, 16, -10, 0.8], [-20, 16, -10, -0.8], [0, 12, 20, 0], [0, 18, 50, 0]],
  stars: [
    [0, 1.5, 6], [0, 1.4, -4], [-12, 7.6, -4], [-6.6, 4.9, -4], [0, 21.6, -27.5], [-6, 21.6, -31],
    [-14, 1.5, -24.3], [14, 1.5, -24.3], [15, 1.5, -6.3], [15, 4.6, -6],
    [0, 1.3, 35], [-29, 1.2, 4], [29, 1.2, 4], [-30, 1.1, -32], [30, 1.1, -32], [0, 1.1, 24],
  ],
  coins: [...ring(12, 7.5, 0, -4, 1.4), ...line(8, -14, 18, 14, 18, 1.0), ...line(5, 0, 29, 0, 35, 1.2), [-9.6, 7, -4], [-8.1, 5.6, -4], [-6.6, 4.3, -4]],
  chests: [[6.5, 20.25, -32], [-33, 0.05, -24]],
  hearts: [[-20, 1.3, -14]],
  magnets: [[20, 1.5, -14]],
  buddies: [],
  slimes: [],
  checkpoints: [[2.5, 0.3, 9], [3, 0.3, -18]],
  portal: [22, 0.3, -14],
  food: [["icecream", 12, 1.3, -4.5], ["pizza", 12, 1.3, -7], ["cupcake", -4, 1.4, 2], ["apple", -20, 1.3, -8]],
  scrolls: [
    [-14, 1.4, -25, "Psalm 118:24"],         // the lobby
    [3, 21.5, -32.5, "Psalm 19:1"],          // the hotel roof
    [-29, 1.2, 6, "Philippians 4:4"],
  ],
  npcs: [
    {
      name: "Manager Mia", x: -10.6, y: 0.3, z: -19.5, outfit: 4, hat: 0, skin: 2, job: "mail",
      lines: ["Welcome to Paradise Resort! So many welcome letters to hand out."],
    },
    {
      name: "Lifeguard Leo", x: 6.5, y: 0.34, z: -8.6, outfit: 0, hat: 1, skin: 3, job: "clean",
      spots: [[-14, 0, 22], [-6, 0, 24.5], [8, 0, 24], [18, 0, 20], [26, 0, 10], [-25, 0, 13]],
      lines: ["Walk, don't run by the pool! The slide tower has a trampoline beside it."],
    },
    {
      name: "Chef Coco", x: 12.4, y: 0.3, z: -9.6, outfit: 3, hat: 1, skin: 4, job: "pizza",
      lines: ["Room service! Fresh pizza for our guests."],
    },
    {
      name: "Captain Kai", x: -2.4, y: 0, z: 27, outfit: 1, hat: 4, skin: 1, job: "fish",
      spots: [[-22, -0.5, 44], [20, -0.5, 46], [0, -0.5, 52], [36, -0.5, 30], [-38, -0.5, 26]],
      lines: ["The resort boat is at the dock. Mind the pirate ship out there!"],
    },
    {
      name: "Pilot Skye", x: 4, y: 0.3, z: -22.6, outfit: 5, hat: 0, skin: 0, job: "cargo",
      spots: [[-12, 6, -4], [15, 3, -6], [14, 4, -24], [0, 2, 24], [-29, 2, 4]],
      lines: ["My helicopter is up on the hotel roof. The big trampoline will take you up!"],
    },
    {
      name: "Grandma Ruth", x: 6.5, y: 0, z: 13, outfit: 2, hat: 4, skin: 3, quest: "coins",
      lines: ["I've lost some of my silver coins!"],
    },
    {
      name: "Guest Gus", x: 3.2, y: 0, z: 20.4, outfit: 2, hat: 4, skin: 2,
      lines: [
        "Ahh, what a holiday! Have you tried the water slide yet?",
        "Jump off the hotel roof and hold JUMP to glide all the way to the beach!",
      ],
    },
  ],
};

/**
 * Jonah and the Big Fish (the book of Jonah): the harbor town of Joppa, a great fish out at sea,
 * and the city of Nineveh on the far shore. Sail there with God's message.
 */
const JONAH_SEA: LevelDef = {
  name: "Jonah and the Big Fish",
  sky: 0x8fd0ff, fog: 0xc8e8ff,
  grass: 0x7ed957, dirt: 0xc9a26b, foliage: 0x3fa34d,
  flowerColors: [0xff6b9d, 0xffd93d, 0xffffff],
  spawn: [0, 0.3, 4],
  sea: -0.5,
  boatSpawn: [3.4, 21, 0],
  bigFish: [0, 56],
  station: [-4, 6],
  extraCars: [[5, 0.3, 101, 0]],
  discs: [
    { x: 0, z: 0, r: 17, y: 0, color: SAND },                               // Joppa
    { x: 0, z: -1, r: 11.5, y: 0.3, trees: 3, flowers: 10, rocks: 2 },
    { x: 0, z: 112, r: 22, y: 0, color: SAND },                             // Nineveh
    { x: 0, z: 113, r: 16, y: 0.3, color: PAVEMENT, paved: true },
    { x: -30, z: 60, r: 5, y: 0.2, trees: 2, rocks: 1, color: SAND },       // a little islet on the way
  ],
  bridges: [{ x: 0, z: 19, w: 2.4, d: 8, y: 0.1 }, { x: 0, z: 88.5, w: 2.4, d: 6, y: 0.1 }], // the two docks
  buildings: [
    { x: -6, z: -5, w: 4, d: 4, h: 3.4, color: 0xffd93d, enter: true },
    { x: 6, z: -6, w: 4, d: 4, h: 3.8, color: 0x5cb8ff, enter: true },
    // Nineveh, "that great city"
    { x: -8, z: 108, w: 5, d: 5, h: 6, color: 0xe8c48a },
    { x: 8, z: 108, w: 5, d: 5, h: 8, color: 0xd9a066 },
    { x: -9, z: 119, w: 5, d: 6, h: 5, color: 0xf0d9a8 },
    { x: 9, z: 119, w: 5, d: 6, h: 7, color: 0xe8c48a },
    { x: 0, z: 124.5, w: 8, d: 4, h: 10, color: 0xffe2a8 },                 // the king's palace
  ],
  springs: [{ x: -8.6, z: 56, y: -0.9, power: 17 }, { x: 4.2, z: 124.5 - 3.2, y: 0.3, power: 24 }], // onto the fish; onto the palace
  stars: [
    [0, 1.5, -2], [-6, 1.5, -5.2], [6, 1.5, -6.2], [0, 1.3, 22],
    [0, 5.2, 56], [3, 5.2, 56], [10, 1.2, 56],                    // on the fish's back, and at its mouth
    [-30, 1.4, 60], [20, 1.0, 38], [-14, 1.0, 84],
    [0, 1.3, 90], [0, 1.6, 113], [-8, 7.4, 108], [0, 11.4, 124.5],
  ],
  coins: [...ring(10, 9, 0, -1, 1.3), ...line(6, 0, 16, 0, 22, 1.2), ...ring(8, 11, 0, 56, 0.6), ...ring(10, 12, 0, 113, 1.3)],
  chests: [[-30, 0.2, 62], [9, 0.3, 113]],
  hearts: [[-3, 5.2, 56]],
  magnets: [],
  buddies: [],
  slimes: [],
  checkpoints: [[2, 0.3, 8], [2.5, 0.3, 96]],
  portal: [0, 0.3, 116],
  food: [["apple", -3, 1.3, 6], ["icecream", 5, 1.3, 104]],
  scrolls: [
    [0, 5.2, 54.6, "Psalm 145:18"],          // on the fish's back
    [-10, 1.3, 0, "Psalm 46:1"],
    [0, 1.6, 100.5, "1 John 1:9"],
    [-30, 1.3, 58, "Jeremiah 33:3"],
  ],
  npcs: [
    {
      name: "Jonah", x: 2.6, y: 0.3, z: 9, outfit: 3, hat: 0, skin: 2, job: "jonah",
      spots: [[10, -0.5, 50], [3.4, -0.5, 84]],
      lines: ["God gave me a message for Nineveh. I ran away once. Never again!"],
    },
    {
      name: "Sailor Sam", x: -2.4, y: 0, z: 14.5, outfit: 1, hat: 4, skin: 4, quest: "cargo",
      lines: [
        "Jonah tried to sail away from God, and a mighty storm came up. But you can't hide from God!",
        "A great fish swallowed Jonah. He was inside it three days and three nights, and he prayed.",
        "The fish is out there, to the south. Bounce on the spring by its tail to stand on its back!",
      ],
    },
    {
      name: "King of Nineveh", x: 0, y: 0.3, z: 120.5, outfit: 4, hat: 3, skin: 3,
      lines: [
        "When I heard God's message, I took off my royal robe and told everyone to pray.",
        "God saw that we were sorry, and he forgave us. He is gracious and full of mercy!",
      ],
    },
    {
      name: "Nadia of Nineveh", x: -4, y: 0.3, z: 106, outfit: 2, hat: 0, skin: 1,
      lines: [
        "Nineveh is so big it takes three days to walk across!",
        "God cares about every person in this city, and all the animals too.",
      ],
    },
  ],
};
LEVELS.push(JONAH_SEA);

/**
 * David and Goliath (1 Samuel 17): the Valley of Elah. Israel's camp on one hill, the Philistines'
 * on the other, a brook between them, and a giant nobody dares to face. Except a shepherd boy.
 */
const ELAH: LevelDef = {
  name: "David and Goliath",
  sky: 0xa8d8ff, fog: 0xdbeeff,
  grass: 0x8fd060, dirt: 0xc9a26b, foliage: 0x3fa34d,
  flowerColors: [0xffd93d, 0xffffff, 0xff9f43],
  spawn: [-6, 0.3, 12],
  sea: -0.5,
  station: [-1.5, 14],
  herds: [{ kinds: ["donkey", "donkey"], x: -19, z: 11, r: 3.5 }], // Jesse's donkeys
  discs: [
    { x: 0, z: -20, r: 48, y: 0, color: SAND },
    { x: 0, z: -20, r: 43, y: 0.3, flowers: 22, rocks: 8 },
    // Israel's hill (west) and the Philistines' hill (east)
    { x: -26, z: -22, r: 13, y: 0.6, trees: 3 }, { x: -26, z: -22, r: 10.5, y: 0.9 }, { x: -26, z: -22, r: 8, y: 1.2 },
    { x: 26, z: -22, r: 13, y: 0.6, rocks: 3 }, { x: 26, z: -22, r: 10.5, y: 0.9 }, { x: 26, z: -22, r: 8, y: 1.2 },
    { x: -14, z: 6, r: 6, y: 0.34, trees: 5, flowers: 3 },                  // the sheep pasture
    { x: 10, z: -50, r: 6, y: 0.34, trees: 5 },
  ],
  brooks: [{ x: 0, z: -20, w: 3.4, d: 64 }],
  tents: [
    [-26, 1.2, -22, 0x5c8fd6], [-30, 1.2, -18, 0x5c8fd6], [-23, 1.2, -27, 0xdfe6ee], [-30.5, 1.2, -25.5, 0xdfe6ee],
    [26, 1.2, -22, 0xc0392b], [30, 1.2, -18, 0xc0392b], [23, 1.2, -27, 0x7d2a22], [30.5, 1.2, -25.5, 0x7d2a22],
  ],
  bridges: [],
  springs: [],
  balloons: [[26, 2.6, -15]],
  hedgehogs: [{ ax: -17, az: 4, bx: -11, bz: 4, y: 0.34, speed: 0.8 }],
  stars: [
    [-6, 1.5, 4], [-14, 1.6, 6], [0, 1.4, -2], [0, 1.4, -38], [0, 1.4, -50],
    [-26, 2.6, -17], [-20, 2.0, -22], [26, 2.6, -17], [26, 9, -15], [32, 2.0, -28],
    [10, 1.6, -50], [-36, 1.5, -40], [38, 1.5, -2], [14, 1.5, -8],
  ],
  coins: [...line(10, 0, 8, 0, -48, 1.2), ...ring(8, 6, -26, -22, 2.2), ...ring(8, 6, 26, -22, 2.2)],
  chests: [[-33, 1.2, -22], [33.5, 1.2, -22]],
  hearts: [[-14, 1.6, 8]],
  magnets: [],
  buddies: [],
  slimes: [],
  checkpoints: [[-4, 0.3, 8], [-12, 0.3, -16]],
  portal: [-30, 0.3, 0],
  food: [["apple", -12, 1.3, 4], ["apple", -22, 1.9, -14], ["cupcake", 16, 1.3, -40]],
  scrolls: [
    [-14, 1.4, 4.5, "Psalm 23:1"],           // the sheep pasture
    [-26, 2.4, -19, "Joshua 1:9"],           // Israel's camp
    [0, 1.3, -44, "Psalm 27:1"],
    [22, 1.3, -6, "2 Timothy 1:7"],
  ],
  npcs: [
    {
      name: "David", x: -8, y: 0.3, z: -12, outfit: 3, hat: 0, skin: 2, job: "david",
      spots: [[0, 0.3, -6], [0.6, 0.3, -14], [-0.5, 0.3, -26], [0.4, 0.3, -34], [-0.3, 0.3, -42], [0.2, 0.3, 2]],
      lines: ["I look after my father's sheep. God saved me from a lion and from a bear!"],
    },
    {
      name: "Goliath", x: 12, y: 0.3, z: -20, outfit: 0, hat: 0, skin: 3, scale: 2.6,
      lines: [
        "I am Goliath of Gath! Who will come out and face me?",
        "Nobody in Israel's whole army dares to come near me. Ha!",
      ],
    },
    {
      name: "King Saul", x: -23.5, y: 1.2, z: -19, outfit: 4, hat: 3, skin: 1,
      lines: [
        "For forty days that giant has shouted at us, and my soldiers are all afraid.",
        "I offered David my armor, but it was far too big for him. He trusts in God instead.",
      ],
    },
    {
      name: "Eliab", x: -14, y: 0.3, z: -28, outfit: 1, hat: 0, skin: 2,
      lines: [
        "I'm David's big brother. He only came to bring us bread and cheese!",
        "Goliath is over nine feet tall. But our God is bigger.",
      ],
    },
    {
      name: "Jesse", x: -11, y: 0.34, z: 9, outfit: 5, hat: 4, skin: 2, quest: "sheep",
      lines: [
        "David is my youngest son. He plays the harp and sings songs to God.",
        "People look at the outside. The LORD looks at the heart.",
      ],
    },
  ],
};
LEVELS.push(ELAH);
LEVELS.push(RESORT);

/** Christmas in Bethlehem (Luke 2, Matthew 2): a starry night, the town, the stable, the shepherds. */
const BETHLEHEM: LevelDef = {
  name: "Bethlehem",
  sky: 0x1d2656, fog: 0x2c3770,
  grass: 0xbfa772, dirt: 0x8a6d47, foliage: 0x5f8a3a,
  flowerColors: [0xffffff, 0xffe066, 0xff9ecf],
  spawn: [0, 0.3, 17],
  night: true,
  station: [-7, 17],
  bethlehem: {
    stable: [-16, -27],
    inn: [0, -22, 12, 6, 6.2],
    houses: [
      [-11, -2, 6, 5, 4.2, 0xe9d3a8, 1], [-11, -12, 5, 5, 3.8, 0xdcc08e, 0],
      [11, -2, 6, 5, 4.4, 0xf0dcb4, -1], [11, -12, 5, 6, 5.0, 0xe2c79a, 0],
      [-20, 2, 5, 5, 3.6, 0xd8bb8a, 0], [20, 2, 5, 5, 4.0, 0xe9d3a8, 0],
      [14, -28, 6, 5, 4.2, 0xdcc08e, 1],
    ],
    stalls: [[-4.5, -6, 0xd94f4f], [4.5, -6, 0x4f7fd9]],
    gate: [0, 10],
    flock: [23, 17, 8],
    fire: [18, 21],
    angel: [27, 5.5, 27],
  },
  herds: [{ kinds: ["cow", "donkey"], x: -16, z: -33, r: 2 }], // the ox and the donkey
  discs: [
    { x: 0, z: -4, r: 90, y: 0, color: 0xc4a46a },
    { x: 0, z: -6, r: 34, y: 0.3, flowers: 6, rocks: 5, trees: 6 },
    { x: 22, z: 20, r: 12, y: 0.34, flowers: 12, color: 0x7fa35a },              // the shepherds' field
    { x: 27, z: 27, r: 5, y: 1.0, color: 0x7fa35a },                             // the hill under the angel
  ],
  tents: [[-27, 0.3, -13, 0x7b3fa0], [-30, 0.3, -17.5, 0xd4a017], [-25.5, 0.3, -18.5, 0x2f6bb0]], // the Wise Men's camp
  bridges: [],
  springs: [],
  stars: [
    [0, 1.5, 4], [-6, 1.5, -2], [6, 1.5, -2], [11, 5.9, -2], [0, 7.6, -22], [-16, 5.4, -26],
    [22, 1.6, 14], [27, 2.3, 27], [-28, 1.5, -8], [28, 1.5, -10], [14, 5.6, -28], [0, 1.5, -30],
    [-6, 1.5, -14], [8, 1.5, -16],
  ],
  coins: [...line(8, 0, 14, 0, -15, 1.2), ...ring(6, 3, 18, 21, 1.4)],
  chests: [[-24, 0.3, 6], [25, 0.3, -18]],
  hearts: [[6, 1.5, 8]],
  magnets: [],
  buddies: [],
  slimes: [],
  checkpoints: [[0, 0.3, 4], [0, 0.3, -16]],
  portal: [25, 0.3, -27],
  food: [["apple", -4.5, 1.6, -5.4], ["apple", 4.5, 1.6, -5.4], ["cupcake", 3, 1.3, -17.5]],
  scrolls: [
    [-14, 1.4, -18, "Luke 2:11"],          // by the stable
    [20, 1.4, 16, "Luke 2:14"],            // the shepherds' field
    [-28, 1.4, -15, "Matthew 2:2"],        // the Wise Men's camp
    [-11, 5.6, -2, "Isaiah 9:6"],          // up on a roof
  ],
  npcs: [
    {
      name: "Mary", x: -17.6, y: 0.3, z: -26.4, outfit: 2, hat: 0, skin: 2,
      lines: [
        "This is my baby, Jesus. An angel told me He would be the Son of God.",
        "There was no room for us in the inn, so I laid Him in the manger.",
        "I keep all these wonderful things in my heart.",
      ],
    },
    {
      name: "Joseph", x: -14.4, y: 0.3, z: -26.6, outfit: 5, hat: 4, skin: 2,
      lines: [
        "We walked all the way from Nazareth to Bethlehem, because the king wanted everyone counted.",
        "The angel said, call His name JESUS: for He shall save His people from their sins.",
      ],
    },
    {
      name: "Wise Man Caspar", x: -12.8, y: 0.3, z: -20.6, outfit: 4, hat: 3, skin: 3, quest: "gifts",
      lines: [
        "We saw His star in the east, and we have come to worship Him!",
        "The star went before us, and it stopped right over this place.",
      ],
    },
    {
      name: "Wise Man Melchior", x: -19.6, y: 0.3, z: -20.8, outfit: 1, hat: 3, skin: 1,
      lines: [
        "We travelled for many, many nights, following the star across the desert.",
        "When we saw the star stop, we were filled with great joy!",
      ],
    },
    {
      name: "Wise Man Balthazar", x: -22, y: 0.3, z: -16.5, outfit: 3, hat: 3, skin: 2,
      lines: [
        "Our camels are resting by the tents. They are tired after such a long journey!",
        "Jesus is not only King of the Jews. He came for everyone in the whole world.",
      ],
    },
    {
      name: "Innkeeper Ezra", x: 2.6, y: 0.3, z: -17.6, outfit: 0, hat: 1, skin: 1,
      lines: [
        "So many people came to Bethlehem to be counted! Every room in my inn is full.",
        "I'm sorry I had no room for Mary and Joseph. But they could rest in my stable.",
        "Climb the stairs up to my roof if you like. You can see the whole town from up there!",
      ],
    },
    {
      name: "Shepherd Eli", x: 19.6, y: 0.34, z: 22.6, outfit: 3, hat: 4, skin: 2,
      lines: [
        "We were watching our flocks by night, and suddenly an angel of the Lord was standing right there!",
        "The angel said, \"Fear not: for, behold, I bring you good tidings of great joy, which shall be to all people.\"",
        "Then lots and lots of angels sang, \"Glory to God in the highest, and on earth peace!\"",
      ],
    },
    {
      name: "Shepherd Asa", x: 16.4, y: 0.34, z: 19.4, outfit: 1, hat: 4, skin: 3,
      lines: [
        "The angel said we'd find the baby wrapped in swaddling clothes, lying in a manger. And we did!",
        "We told everyone we met about Him. Go and see Him in the stable by the inn!",
      ],
    },
  ],
};
LEVELS.push(BETHLEHEM);

const RAINBOW_COLORS = [0xff5f6d, 0xffa94d, 0xffe066, 0x7ed957, 0x5cb8ff, 0xb197fc];

interface Solid {
  minX: number; maxX: number; minZ: number; maxZ: number; topY: number;
}

/** A walk-in house: its outside (`shell`) is hidden while a kid is inside, like a dollhouse. */
interface House {
  shell: THREE.Group;
  minX: number; maxX: number; minZ: number; maxZ: number;
  topY: number;
}

const WALL = 0.3;       // wall thickness of walk-in houses
const DOORWAY = 1.8;    // doorway width
const RUG_COLORS = [0xff6b9d, 0x5cb8ff, 0x7ed957, 0xb197fc, 0xffa94d, 0xffd93d];

export class World {
  readonly group = new THREE.Group();
  platforms: Platform[] = [];
  starSpots: [number, number, number][] = [];
  slimeSpecs: SlimeDef[] = [];
  spawn = new THREE.Vector3();
  portalPos = new THREE.Vector3();
  portalUnlocked = false;
  checkpoints: { pos: THREE.Vector3; flag: THREE.Mesh; taken: boolean }[] = [];
  def: LevelDef = LEVELS[0];
  solids: Solid[] = [];
  private houses: House[] = [];
  /** Where this world's travel gate stands (null: none). */
  stationPos: THREE.Vector3 | null = null;
  /** Little animations of this level's scenery (swings, dishes, shooting stars): called with time and dt. */
  private anim: ((t: number, dt: number) => void)[] = [];
  /** Walk-in houses' outside walls: they get the city kit's brick once it has loaded. */
  private houseWalls: { mat: THREE.MeshStandardMaterial; color: number }[] = [];
  private decor: Decor[] = [];
  private decorGroup = new THREE.Group();
  /** Ids of things the kid has bought (set by boot.ts before a level is built). */
  owned = new Set<string>();
  private locks = new Map<string, { gate: THREE.Group; sign: THREE.Sprite; solid: Solid }>();

  private portalTorus: THREE.Mesh | null = null;
  private portalDisc: THREE.Mesh | null = null;
  private clouds: THREE.Group[] = [];
  private snow: THREE.Points | null = null;
  private ocean: THREE.Mesh | null = null;
  private ferris: { wheel: THREE.Group; cabins: THREE.Object3D[]; gate: THREE.Vector3; facing: number } | null = null;
  /** Sparky, if this level's castle has a dragon. */
  dragon: Dragon | null = null;
  /** Castle bells a kid can ring. */
  bells: { pos: THREE.Vector3; ring: () => void }[] = [];
  /** Sightseeing photo spots on this level. */
  photoSpots: { name: string; at: THREE.Vector3; look: THREE.Vector3 }[] = [];
  /** Castle thrones a kid can sit on. */
  thrones: { seat: THREE.Vector3; facing: number }[] = [];
  /** Castle helter-skelters: where to get on, and the path down. */
  slides: { board: THREE.Vector3; path: THREE.CatmullRomCurve3 }[] = [];
  /** Castle fireworks crates. */
  fireworks: { pos: THREE.Vector3; launch: () => boolean }[] = [];
  /** Castle armour stands (the helmet to try on). */
  armours: { pos: THREE.Vector3 }[] = [];
  /** Castle singing stones. */
  chimes: { stones: THREE.Vector3[]; press: (i: number) => void; guide: (i: number) => void }[] = [];
  /** Castle treasure hunts (golden keys and the king's chest). */
  treasures: { keys: THREE.Vector3[]; take: (i: number) => void; chest: THREE.Vector3; open: () => void; reset: () => void }[] = [];
  /** Castle peacocks. */
  peacocks: { pos: THREE.Vector3[]; show: (i: number) => void }[] = [];
  /** Castle bouncy castles. */
  bouncies: CastleInfo["bouncy"][] = [];
  /** Castle catapults. */
  catapults: CastleInfo["catapult"][] = [];
  /** Castle bread ovens. */
  ovens: CastleInfo["oven"][] = [];
  /** Castle puppet theatres. */
  theatres: CastleInfo["theatre"][] = [];
  /** Castle flower gardens. */
  gardens: CastleInfo["garden"][] = [];
  /** Castle rope swings. */
  swings: CastleInfo["swing"][] = [];
  /** Castle fishing jetties. */
  fishings: CastleInfo["fishing"][] = [];
  /** Castle beach sandcastles. */
  sandcastles: CastleInfo["sandcastle"][] = [];
  /** Castle seasonal dressing (harvest, Christmas, Easter). */
  seasonals: CastleInfo["seasonal"][] = [];
  /** The knight's ring course, if this level has one. */
  tilt: KnightRings | null = null;
  /** How fast the Ferris wheel turns (1 = its normal slow turn; boot speeds it up to bring a rider down). */
  ferrisSpin = 1;
  private oceanY = -7;
  private waveAmp = 0.1;
  /** Surf along the beaches (one mesh for every island), and a frame counter for the water's normals. */
  private surf: THREE.Mesh | null = null;
  private waterTick = 0;
  private time = 0;

  /** Height of the sea's surface above its resting level at world (x, z) — the boat rides this. */
  waveAt(x: number, z: number): number {
    return this.ocean ? this.waveAmp * swell(x - this.ocean.position.x, z - this.ocean.position.z, this.time) : 0;
  }

  get gravity(): number {
    return this.def.gravity ?? 1;
  }

  /** Highest platform top under (x,z) that is not above refY + step allowance. */
  groundAt(x: number, z: number, refY: number): GroundHit | null {
    let best: GroundHit | null = null;
    for (const p of this.platforms) {
      if (p.topY > refY + 0.35) continue;
      let inside = false;
      if (p.kind === "disc") {
        const dx = x - p.x, dz = z - p.z;
        inside = dx * dx + dz * dz <= p.r * p.r;
      } else {
        inside = Math.abs(x - p.x) <= p.hw && Math.abs(z - p.z) <= p.hd;
      }
      if (inside && (!best || p.topY > best.y)) best = { y: p.topY, plat: p };
    }
    return best;
  }

  /** Pull a third-person camera in so no building stands between it and the kid (cam is changed). */
  clipCamera(target: THREE.Vector3, cam: THREE.Vector3): void {
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = target.x + (cam.x - target.x) * t, y = target.y + (cam.y - target.y) * t, z = target.z + (cam.z - target.z) * t;
      for (const s of this.solids) {
        if (y > s.topY + 0.3 || x < s.minX - 0.3 || x > s.maxX + 0.3 || z < s.minZ - 0.3 || z > s.maxZ + 0.3) continue;
        const k = Math.max(0.15, (i - 1) / steps);
        cam.set(target.x + (cam.x - target.x) * k, target.y + (cam.y - target.y) * k, target.z + (cam.z - target.z) * k);
        return;
      }
    }
  }

  /** The walk-in house whose room contains pos, or null. */
  private houseAt(pos: THREE.Vector3): House | null {
    for (const h of this.houses) {
      if (pos.x > h.minX && pos.x < h.maxX && pos.z > h.minZ && pos.z < h.maxZ && pos.y < h.topY) return h;
    }
    return null;
  }

  /** The kid bought it: take the boards off the door. */
  unlock(id: string): void {
    const l = this.locks.get(id);
    if (!l) return;
    l.gate.removeFromParent();
    disposeSprite(l.sign);
    this.solids = this.solids.filter((s) => s !== l.solid);
    this.locks.delete(id);
  }

  isInside(pos: THREE.Vector3): boolean {
    return this.houseAt(pos) !== null;
  }

  /** Open up (hide the outside of) every house that has one of these kids in it. */
  updateCutaway(kids: THREE.Vector3[]): void {
    for (const h of this.houses) h.shell.visible = !kids.some((k) => this.houseAt(k) === h);
  }

  /** Inside a house: the highest a kid's feet can go before their head meets the ceiling. */
  ceilingAt(pos: THREE.Vector3): number | null {
    const h = this.houseAt(pos);
    return h ? h.topY - 1.95 : null;
  }

  /**
   * A house kids can walk into: four walls with a doorway, a roof you can still land on, and a
   * furnished room. The outside is one group (`shell`) so it can be hidden while a kid is inside;
   * the room's own walls face inward only, so the ones between the camera and the kid vanish.
   */
  /** A sightseeing spot: painted footprints to stand on and a little camera sign facing the kid. */
  private buildPhotoSpot(ps: { name: string; at: [number, number]; look: [number, number, number] }): void {
    const [x, z] = ps.at;
    const y = this.groundAt(x, z, 8)?.y ?? 0;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    // face away from the sight (the way the kid stands for the photo)
    g.rotation.y = Math.atan2(x - ps.look[0], z - ps.look[2]);
    const paint = new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.9, depthWrite: false });
    const foot = new THREE.CircleGeometry(0.09, 12).scale(1, 1.9, 1).rotateX(-Math.PI / 2);
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(foot, paint);
      f.position.set(sx * 0.13, 0.03, 0);
      f.userData.hideInPhoto = true;
      g.add(f);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 32).rotateX(-Math.PI / 2), paint);
    ring.position.y = 0.025;
    ring.userData.hideInPhoto = true;
    g.add(ring);
    // a post with a camera sign, off to one side so it's not in the picture
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.9 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 8), wood);
    post.position.set(1.1, 0.65, 0.5);
    post.castShadow = true;
    post.userData.hideInPhoto = true;
    g.add(post);
    const sign = makeTextSprite("📸 Photo spot", { bg: "rgba(255,217,61,0.95)", fg: "#6b4300", size: 40, height: 0.42 });
    sign.position.set(1.1, 1.45, 0.5);
    g.add(sign);
    this.group.add(g);
    this.photoSpots.push({ name: ps.name, at: new THREE.Vector3(x, y, z), look: new THREE.Vector3(...ps.look) });
  }

  private buildHouse(b: BuildingDef, index: number, trimMat: THREE.Material, doorMat: THREE.Material, winMat: THREE.Material): void {
    const floorY = this.groundAt(b.x, b.z, 2)?.y ?? 0;
    const hw = b.w / 2, hd = b.d / 2;
    const doorTop = floorY + 2.1;
    const side = (b.w - DOORWAY) / 2;
    const g = new THREE.Group();
    const shell = new THREE.Group();
    const room = new THREE.Group();
    // one material per colour in this house, so its still parts can be joined into a few draws
    const flats = new Map<number, THREE.MeshStandardMaterial>();
    const flat = (color: number) => flats.get(color) ?? flats.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 })).get(color)!;
    const box = (parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // ── outside ──
    const bodyMat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.85 });
    this.houseWalls.push({ mat: bodyMat, color: b.color });
    // a wall: its texture repeats every 2.5 m whatever the wall's size, so bricks are the same size everywhere
    const brickWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = box(shell, bodyMat, w, h, d, x, y, z);
      const uv = m.geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4); // +x, -x, +y, -y, +z, -z
        const across = face < 2 ? d : w, up = face === 2 || face === 3 ? d : h;
        uv.setXY(i, uv.getX(i) * across / 2.5, uv.getY(i) * up / 2.5);
      }
    };
    brickWall(b.w, b.h, WALL, 0, b.h / 2, -hd + WALL / 2);                 // back
    brickWall(WALL, b.h, b.d - 2 * WALL, -hw + WALL / 2, b.h / 2, 0);      // left
    brickWall(WALL, b.h, b.d - 2 * WALL, hw - WALL / 2, b.h / 2, 0);       // right
    brickWall(side, b.h, WALL, -hw + side / 2, b.h / 2, hd - WALL / 2);    // front, left of the door
    brickWall(side, b.h, WALL, hw - side / 2, b.h / 2, hd - WALL / 2);     // front, right of the door
    brickWall(DOORWAY, b.h - doorTop, WALL, 0, (b.h + doorTop) / 2, hd - WALL / 2); // above the door
    box(shell, flat(0x6b5a4e), b.w - 0.02, 0.2, b.d - 0.02, 0, b.h - 0.1, 0);        // roof slab
    box(shell, trimMat, b.w + 0.3, 0.25, b.d + 0.3, 0, b.h + 0.12, 0);
    for (const sx of [-1, 1]) {
      box(shell, doorMat, 0.14, doorTop, 0.12, (DOORWAY / 2 + 0.07) * sx, doorTop / 2, hd + 0.03, false); // door frame
      if (side > 0.9) box(shell, winMat, Math.min(0.8, side - 0.3), 0.7, 0.06, (DOORWAY / 2 + side / 2) * sx, floorY + 1.45, hd + 0.03, false);
    }
    box(shell, doorMat, DOORWAY + 0.28, 0.14, 0.12, 0, doorTop + 0.07, hd + 0.03, false);
    if (b.church) {
      // a steeple over the door, with a cross on top
      const white = flat(0xfdf6ec), gold = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x6a4a00, metalness: 0.5, roughness: 0.35 });
      const tz = hd - 1.1;
      box(shell, white, 1.8, 2.6, 1.8, 0, b.h + 1.3, tz);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.6, 4).rotateY(Math.PI / 4), flat(0x8a5a33));
      spire.position.set(0, b.h + 3.9, tz);
      spire.castShadow = true;
      shell.add(spire);
      box(shell, gold, 0.16, 1.3, 0.16, 0, b.h + 5.7, tz);
      box(shell, gold, 0.8, 0.16, 0.16, 0, b.h + 5.9, tz);
      // a round window over the door
      const rose = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
      rose.position.set(0, doorTop + 0.9, hd + 0.02);
      shell.add(rose);
    }

    // ── inside ──
    const iw = b.w - 2 * WALL, id = b.d - 2 * WALL, ih = b.h - 0.2 - floorY;
    box(room, flat(0xe0b98a), iw, 0.04, id + WALL, 0, floorY + 0.02, WALL / 2, false); // floorboards (out to the doorstep)
    const paper = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color).lerp(new THREE.Color(0xffffff), 0.6), roughness: 0.95 });
    const wall = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      room.add(m);
    };
    const wy = floorY + ih / 2;
    wall(iw, ih, 0, wy, -hd + WALL + 0.01, 0);                         // back wall, faces the door
    wall(id, ih, -hw + WALL + 0.01, wy, 0, Math.PI / 2);
    wall(id, ih, hw - WALL - 0.01, wy, 0, -Math.PI / 2);
    for (const sx of [-1, 1]) wall(side - WALL, ih, (DOORWAY / 2 + (side - WALL) / 2) * sx, wy, hd - WALL - 0.01, Math.PI);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(Math.min(iw, id) * 0.3, 20), flat(RUG_COLORS[index % RUG_COLORS.length]));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, floorY + 0.05, 0.1);
    rug.receiveShadow = true;
    room.add(rug);
    box(room, flat(0x8a5a33), 1.4, 0.03, 0.7, 0, floorY + 0.02, hd + 0.5, false); // doormat

    const furniture = (minX: number, maxX: number, minZ: number, maxZ: number, top: number) => {
      this.solids.push({ minX: b.x + minX, maxX: b.x + maxX, minZ: b.z + minZ, maxZ: b.z + maxZ, topY: top });
    };
    if (b.church) {
      // a cross on the back wall, a lectern in front of it, and rows of pews with an aisle down the middle
      const wood = flat(0x8a5a33), gold = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x6a4a00, metalness: 0.5, roughness: 0.35 });
      box(room, gold, 0.16, 1.5, 0.08, 0, floorY + 2.2, -hd + WALL + 0.06, false);
      box(room, gold, 0.9, 0.16, 0.08, 0, floorY + 2.5, -hd + WALL + 0.06, false);
      box(room, wood, 0.7, 1.0, 0.45, 0, floorY + 0.5, -hd + WALL + 1.0);
      furniture(-0.35, 0.35, -hd + WALL + 0.78, -hd + WALL + 1.22, floorY + 1.0);
      const pewW = (iw - DOORWAY) / 2 - 0.15;
      for (let z = -hd + WALL + 2.4; z < hd - WALL - 1.0; z += 1.25) {
        for (const sx of [-1, 1]) {
          const px = (DOORWAY / 2 + pewW / 2 + 0.05) * sx;
          box(room, wood, pewW, 0.12, 0.45, px, floorY + 0.42, z);
          box(room, wood, pewW, 0.55, 0.1, px, floorY + 0.7, z + 0.22);
          furniture(px - pewW / 2, px + pewW / 2, z - 0.25, z + 0.3, floorY + 0.98);
        }
      }
    }
    // bed in the back-left corner
    if (!b.church && iw >= 3.2 && id >= 3.2) {
      const bx = -hw + WALL + 0.55, bz = -hd + WALL + 0.95;
      box(room, flat(0xc98a5b), 1.0, 0.3, 1.8, bx, floorY + 0.2, bz);
      box(room, flat(RUG_COLORS[(index + 2) % RUG_COLORS.length]), 1.0, 0.14, 1.25, bx, floorY + 0.42, bz + 0.27);
      box(room, flat(0xffffff), 0.8, 0.14, 0.4, bx, floorY + 0.42, bz - 0.65);
      furniture(bx - 0.5, bx + 0.5, bz - 0.9, bz + 0.9, floorY + 0.6);
    }
    // bookshelf on the back wall, to the right
    if (!b.church) {
      const sx = hw - WALL - 0.75, sz = -hd + WALL + 0.2;
      box(room, flat(0x8a5a33), 1.3, 1.5, 0.36, sx, floorY + 0.75, sz);
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 4; k++) {
          box(room, flat(RUG_COLORS[(index + r + k) % RUG_COLORS.length]), 0.2, 0.3, 0.06, sx - 0.42 + k * 0.28, floorY + 0.32 + r * 0.45, sz + 0.19, false);
        }
      }
      furniture(sx - 0.65, sx + 0.65, sz - 0.2, sz + 0.2, floorY + 1.5);
    }
    // big houses get a living room: sofa and TV on the right, dining table on the left
    if (iw >= 6 && !b.church) {
      const sofaX = hw - WALL - 0.6;
      box(room, flat(0x5cb8ff), 0.9, 0.45, 2.4, sofaX, floorY + 0.25, 0.4);
      box(room, flat(0x4a9be0), 0.3, 0.9, 2.4, sofaX + 0.3, floorY + 0.5, 0.4);
      furniture(sofaX - 0.45, sofaX + 0.45, -0.8, 1.6, floorY + 0.9);
      box(room, flat(0x33323e), 1.8, 1.0, 0.1, 0.6, floorY + 1.7, -hd + WALL + 0.08, false);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.85), new THREE.MeshBasicMaterial({ color: 0x9df2ff }));
      screen.position.set(0.6, floorY + 1.7, -hd + WALL + 0.14);
      room.add(screen);
      const tx = -hw + WALL + 2.4, tz = 1.2;
      box(room, flat(0xc98a5b), 1.8, 0.1, 1.1, tx, floorY + 0.75, tz);
      for (const [ox, oz] of [[-0.75, -0.4], [0.75, -0.4], [-0.75, 0.4], [0.75, 0.4]]) box(room, flat(0x8a5a33), 0.1, 0.75, 0.1, tx + ox, floorY + 0.38, tz + oz);
      furniture(tx - 0.9, tx + 0.9, tz - 0.55, tz + 0.55, floorY + 0.8);
      for (const ox of [-0.5, 0.5]) box(room, flat(0xff9ecf), 0.45, 0.45, 0.45, tx + ox, floorY + 0.25, tz + 1.0);
      // a golden trophy for the owner
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x6a4a00, metalness: 0.6, roughness: 0.3 }));
      cup.position.set(tx, floorY + 1.0, tz);
      room.add(cup);
    }
    // potted plant by the door
    {
      const px = hw - WALL - 0.4, pz = hd - WALL - 0.4;
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.28, 10), flat(0xd9795a));
      pot.position.set(px, floorY + 0.14, pz);
      room.add(pot);
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), flat(0x3fa34d));
      leaves.position.set(px, floorY + 0.55, pz);
      room.add(leaves);
    }

    this.houseDetail(shell, b, floorY, index);
    g.add(shell, room);
    g.position.set(b.x, 0, b.z);
    this.group.add(g);

    // roof is landable, walls are solid (with a gap for the doorway)
    this.platforms.push({
      kind: "box", x: b.x, z: b.z, r: 0, hw: hw + 0.15, hd: hd + 0.15, topY: b.h + 0.25, spring: 0,
      baseX: b.x, baseZ: b.z, dx: 0, dz: 0, mesh: g, squashT: 0,
    });
    const solid = (minX: number, maxX: number, minZ: number, maxZ: number) => {
      this.solids.push({ minX: b.x + minX, maxX: b.x + maxX, minZ: b.z + minZ, maxZ: b.z + maxZ, topY: b.h });
    };
    solid(-hw, hw, -hd, -hd + WALL);
    solid(-hw, -hw + WALL, -hd, hd);
    solid(hw - WALL, hw, -hd, hd);
    solid(-hw, -DOORWAY / 2, hd - WALL, hd);
    solid(DOORWAY / 2, hw, hd - WALL, hd);
    if (b.lock && !this.owned.has(b.lock)) {
      // for sale: boards across the doorway and a sign above it
      const gate = new THREE.Group();
      for (const y of [0.5, 1.1, 1.7]) box(gate, doorMat, DOORWAY + 0.2, 0.22, 0.1, 0, floorY + y, hd + 0.02);
      shell.add(gate);
      const sign = makeTextSprite("FOR SALE", { bg: "rgba(255,71,87,0.95)", fg: "#ffffff", size: 48, height: 0.7 });
      sign.position.set(0, doorTop + 0.7, hd + 0.3);
      g.add(sign);
      const blocked: Solid = { minX: b.x - DOORWAY / 2, maxX: b.x + DOORWAY / 2, minZ: b.z + hd - WALL, maxZ: b.z + hd, topY: b.h };
      this.solids.push(blocked);
      this.locks.set(b.lock, { gate, sign, solid: blocked });
    }
    // join the still parts (the shell hides as a whole when a kid walks in; the for-sale boards are their own group)
    mergeByMaterial(shell);
    mergeByMaterial(room);
    this.houses.push({
      shell,
      minX: b.x - hw + WALL - 0.05, maxX: b.x + hw - WALL + 0.05,
      minZ: b.z - hd + WALL - 0.05, maxZ: b.z + hd - 0.05,
      topY: b.h - 0.2,
    });
  }

  /** Push a circle (player/car) out of solid building walls horizontally. */
  resolveSolids(pos: THREE.Vector3, radius: number): void {
    for (const s of this.solids) {
      if (pos.y > s.topY - 0.25) continue; // above the roof: free to land
      const nx = Math.max(s.minX, Math.min(pos.x, s.maxX));
      const nz = Math.max(s.minZ, Math.min(pos.z, s.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-6) {
        // outside the box but within radius: push along the contact normal
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // center inside the box: push out along the smallest penetration axis
        const px = Math.min(pos.x - s.minX + radius, s.maxX + radius - pos.x);
        const pz = Math.min(pos.z - s.minZ + radius, s.maxZ + radius - pos.z);
        if (px < pz) pos.x = (pos.x - s.minX < s.maxX - pos.x) ? s.minX - radius : s.maxX + radius;
        else pos.z = (pos.z - s.minZ < s.maxZ - pos.z) ? s.minZ - radius : s.maxZ + radius;
      }
    }
  }

  buildLevel(index: number, scene: THREE.Scene): void {
    this.disposeLevel(scene);
    const def = LEVELS[index % LEVELS.length];
    this.def = def;
    const rng = mulberry32(1234 + index * 777);

    this.group.clear();
    this.platforms = [];
    this.clouds = [];
    this.checkpoints = [];
    this.solids = [];
    this.houses = [];
    this.houseWalls = [];
    this.anim = [];
    this.decor = [];
    this.dragon = null;
    this.bells = [];
    this.thrones = [];
    this.slides = [];
    this.fireworks = [];
    this.armours = [];
    this.chimes = [];
    this.treasures = [];
    this.peacocks = [];
    this.bouncies = [];
    this.catapults = [];
    this.ovens = [];
    this.theatres = [];
    this.gardens = [];
    this.swings = [];
    this.fishings = [];
    this.sandcastles = [];
    this.seasonals = [];
    this.tilt = null;
    for (const l of this.locks.values()) disposeSprite(l.sign);
    this.locks.clear();
    this.starSpots = def.stars.map((s) => [...s] as [number, number, number]);
    this.slimeSpecs = def.slimes;
    this.spawn.set(def.spawn[0], def.spawn[1], def.spawn[2]);
    this.portalPos.set(def.portal[0], def.portal[1], def.portal[2]);
    this.portalUnlocked = false;

    scene.background = new THREE.Color(def.sky);
    // open-sea levels need to see far islets
    scene.fog = def.space ? new THREE.Fog(def.fog, 70, 220) : def.sea !== undefined ? new THREE.Fog(def.fog, 90, 270) : new THREE.Fog(def.fog, 38, 110);

    const grassMat = new THREE.MeshStandardMaterial({ color: def.grass, flatShading: true, roughness: 0.9 });
    const dirtMat = new THREE.MeshStandardMaterial({ color: def.dirt, flatShading: true, roughness: 1 });
    const dirtMap = groundTexture("dirt").clone();
    dirtMap.needsUpdate = true;
    dirtMap.repeat.set(10, 2);
    const dirtSideMat = new THREE.MeshStandardMaterial({ color: def.dirt, map: dirtMap, roughness: 1 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xc98a5b, flatShading: true, roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true, roughness: 1 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: def.foliage, flatShading: true, roughness: 0.85 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xb8bec9, flatShading: true, roughness: 1 });

    // ── Islands ────────────────────────────────────────────────────────────
    for (const d of def.discs) {
      const island = new THREE.Group();
      const topGeo = new THREE.CylinderGeometry(d.r, d.r * 0.96, 0.4, 48);
      // real-looking ground: a grass or sand pattern repeating about every 3.5 m (it only varies the
      // brightness, so each world keeps its own colours)
      const sandy = d.color === SAND;
      const groundMap = groundTexture(d.color === undefined ? "grass" : sandy ? "sand" : "plain").clone();
      groundMap.needsUpdate = true;
      groundMap.repeat.set((d.r * 2) / 3.5, (d.r * 2) / 3.5);
      const top = new THREE.Mesh(topGeo, d.color === undefined
        ? new THREE.MeshStandardMaterial({ color: grassTone(def.grass), map: groundMap, roughness: 0.95 })
        : new THREE.MeshStandardMaterial({ color: d.color, map: groundMap, roughness: 0.95 }));
      top.position.y = -0.2;
      top.receiveShadow = true;
      top.castShadow = true;
      island.add(top);

      const depth = 2.4 + d.r * 0.35;
      const botGeo = new THREE.CylinderGeometry(d.r * 0.95, d.r * 0.25, depth, 28);
      const bot = new THREE.Mesh(botGeo, dirtSideMat);
      bot.position.y = -0.4 - depth / 2;
      bot.castShadow = true;
      island.add(bot);

      island.position.set(d.x, d.y, d.z);
      this.group.add(island);
      this.platforms.push({
        kind: "disc", x: d.x, z: d.z, r: d.r, hw: 0, hd: 0, topY: d.y, spring: 0,
        baseX: d.x, baseZ: d.z, dx: 0, dz: 0, mesh: island, squashT: 0,
      });

      const treeCount = d.trees ?? 0;
      for (let i = 0; i < treeCount; i++) {
        const a = rng() * Math.PI * 2;
        const rr = d.r * (0.45 + rng() * 0.35);
        // sandy islands grow palms; elsewhere a mix of pines and leafy trees (snow and space keep pines)
        const scale = 0.8 + rng() * 0.5;
        const kind = d.color === SAND ? 2 : def.snow || def.space || rng() < 0.55 ? 0 : 1;
        this.decor.push({ t: "tree", kind, x: d.x + Math.cos(a) * rr, y: d.y, z: d.z + Math.sin(a) * rr, rot: rng() * Math.PI * 2, scale, v: rng() });
      }
      const flowerCount = d.flowers ?? 0;
      for (let i = 0; i < flowerCount; i++) {
        const a = rng() * Math.PI * 2;
        const rr = d.r * (0.3 + rng() * 0.55);
        this.decor.push({ t: "flower", color: pick(rng, def.flowerColors), x: d.x + Math.cos(a) * rr, y: d.y, z: d.z + Math.sin(a) * rr, rot: rng() * Math.PI * 2, v: rng() });
      }
      const rockCount = d.rocks ?? 0;
      for (let i = 0; i < rockCount; i++) {
        const a = rng() * Math.PI * 2;
        const rr = d.r * (0.5 + rng() * 0.3);
        this.decor.push({ t: "rock", x: d.x + Math.cos(a) * rr, y: d.y, z: d.z + Math.sin(a) * rr, size: 0.3 + rng() * 0.25, rx: rng() * 3, ry: rng() * 3, rz: rng() * 3, v: rng() });
      }
      // grass tufts (only drawn with the nature models): lush meadows, a few on beaches, none on snow / the Moon
      if (!def.snow && !def.space && !def.night && !d.paved) {
        const sand = d.color === SAND;
        const tufts = Math.min(36, Math.round(d.r * d.r * (sand ? 0.02 : 0.16)));
        for (let i = 0; i < tufts; i++) {
          const a = rng() * Math.PI * 2;
          const rr = d.r * Math.sqrt(rng()) * 0.92;
          this.decor.push({ t: "grass", x: d.x + Math.cos(a) * rr, y: d.y, z: d.z + Math.sin(a) * rr, rot: rng() * Math.PI * 2, v: rng(), sand });
        }
      }
    }

    // ── Bridges / moving platforms ──
    for (const b of def.bridges) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.4, b.d), b.move
        ? new THREE.MeshStandardMaterial({ color: 0xffb347, flatShading: true, roughness: 0.8 })
        : woodMat);
      body.position.y = -0.2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      if (b.move) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(b.w * 0.7, 0.08, b.d * 0.7),
          new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.8 }),
        );
        stripe.position.y = 0.04;
        g.add(stripe);
      }
      g.position.set(b.x, b.y, b.z);
      this.group.add(g);
      this.platforms.push({
        kind: "box", x: b.x, z: b.z, r: 0, hw: b.w / 2, hd: b.d / 2, topY: b.y, spring: 0,
        move: b.move ? { axis: b.move.axis, amp: b.move.amp, speed: b.move.speed, phase: b.move.phase ?? 0 } : undefined,
        baseX: b.x, baseZ: b.z, dx: 0, dz: 0, mesh: g, squashT: 0,
      });
    }

    // ── City: roads (visual), buildings (solid + landable), fountain ──
    if (def.roads) this.buildStreets(def);
    if (def.buildings) {
      const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.85 });
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a4a2b, flatShading: true, roughness: 0.9 });
      const winMat = new THREE.MeshStandardMaterial({ color: 0xfff6b8, flatShading: true, roughness: 0.4 });
      for (const [bi, b] of def.buildings.entries()) {
        if (b.enter) {
          this.buildHouse(b, bi, trimMat, doorMat, winMat);
          continue;
        }
        this.decor.push({ t: "building", b });
        // roof is landable
        this.platforms.push({
          kind: "box", x: b.x, z: b.z, r: 0, hw: b.w / 2 + 0.15, hd: b.d / 2 + 0.15, topY: b.h + 0.25, spring: 0,
          baseX: b.x, baseZ: b.z, dx: 0, dz: 0, mesh: new THREE.Object3D(), squashT: 0,
        });
        // walls are solid
        this.solids.push({
          minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
          minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
          topY: b.h,
        });
      }
    }

    this.ferris = null;
    if (def.ferris) this.buildFerris(...def.ferris);
    if (def.ark) this.buildArk(def.ark[0], def.ark[1]);
    if (def.bethlehem) buildBethlehem({ group: this.group, platforms: this.platforms, solids: this.solids, anim: this.anim }, def.bethlehem, 0.3);
    for (const c of def.castles ?? []) {
      const info = buildCastle({ group: this.group, platforms: this.platforms, solids: this.solids, anim: this.anim }, c, c.y ?? 0.3);
      this.bells.push(info.bell);
      this.thrones.push(info.throne);
      this.slides.push(info.slide);
      this.fireworks.push(info.fireworks);
      this.armours.push(info.armour);
      this.chimes.push(info.chimes);
      this.treasures.push(info.treasure);
      this.peacocks.push(info.peacocks);
      this.bouncies.push(info.bouncy);
      this.catapults.push(info.catapult);
      this.ovens.push(info.oven);
      this.theatres.push(info.theatre);
      this.gardens.push(info.garden);
      this.swings.push(info.swing);
      this.fishings.push(info.fishing);
      this.sandcastles.push(info.sandcastle);
      this.seasonals.push(info.seasonal);
      if (c.dragon && !this.dragon) {
        const d = new Dragon(info.perch, info.facing, info.centre, c.dragon.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
        this.group.add(d.group);
        this.anim.push((t, dt) => d.update(t, dt));
        this.dragon = d;
      }
    }
    if (def.knightRings?.length) {
      const k = new KnightRings();
      k.build(def.knightRings.map(([x, z, h]) => [x, this.groundAt(x, z, 6)?.y ?? 0.3, z, h]));
      this.group.add(k.group);
      this.anim.push((t, dt) => k.update(t, dt));
      this.tilt = k;
    }
    if (def.bigFish) this.buildBigFish(def.bigFish[0], def.bigFish[1], def.sea ?? 0);
    for (const [tx, ty, tz, color] of def.tents ?? []) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.4, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 }));
      tent.position.set(tx, ty + 1.2, tz);
      tent.castShadow = true;
      this.group.add(tent);
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.3), new THREE.MeshStandardMaterial({ color: 0x4a3524, side: THREE.DoubleSide }));
      flap.position.set(tx, ty + 0.65, tz + 1.0);
      flap.rotation.x = -0.6;
      this.group.add(flap);
      this.solids.push({ minX: tx - 0.9, maxX: tx + 0.9, minZ: tz - 0.9, maxZ: tz + 0.9, topY: ty + 2 });
    }
    for (const [ux, uy, uz, color] of def.umbrellas ?? []) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0xf4f6fb, roughness: 0.5 }));
      pole.position.y = 1.2;
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 10), new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 }));
      shade.position.y = 2.5;
      shade.castShadow = true;
      const lounger = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 1.8), new THREE.MeshStandardMaterial({ color: 0xfdf6ec, roughness: 0.8 }));
      lounger.position.set(1.0, 0.2, 0);
      lounger.castShadow = true;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.8), lounger.material);
      back.position.set(1.0, 0.5, -0.75);
      back.rotation.x = 0.9;
      g.add(pole, shade, lounger, back);
      g.position.set(ux, uy, uz);
      this.group.add(g);
    }
    for (const w of def.brooks ?? []) {
      const y = (this.groundAt(w.x, w.z, 2)?.y ?? 0) + 0.04;
      const water = new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.04, w.d), new THREE.MeshStandardMaterial({ color: 0x5cb8ff, roughness: 0.2, transparent: true, opacity: 0.8 }));
      water.position.set(w.x, y, w.z);
      water.receiveShadow = true;
      this.group.add(water);
    }

    // ── Trampolines ──
    for (const s of def.springs) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 1.0, 0.3, 20),
        new THREE.MeshStandardMaterial({ color: 0xff4757, flatShading: true, roughness: 0.7 }),
      );
      base.position.y = 0.15;
      base.castShadow = true;
      g.add(base);
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.95, 0.22, 20),
        new THREE.MeshStandardMaterial({ color: 0xfff6e5, flatShading: true, roughness: 0.6 }),
      );
      pad.position.y = 0.42;
      pad.castShadow = true;
      g.add(pad);
      g.position.set(s.x, s.y, s.z);
      this.group.add(g);
      this.platforms.push({
        kind: "disc", x: s.x, z: s.z, r: 0.95, hw: 0, hd: 0, topY: s.y + 0.53, spring: s.power,
        baseX: s.x, baseZ: s.z, dx: 0, dz: 0, mesh: g, squashT: 0,
      });
    }

    // ── Checkpoint flags ──
    for (const [cx, cy, cz] of def.checkpoints) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
      );
      pole.position.y = 0.9;
      pole.castShadow = true;
      g.add(pole);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.45),
        new THREE.MeshStandardMaterial({ color: 0xdfe6ee, side: THREE.DoubleSide, roughness: 0.7 }),
      );
      flag.position.set(0.42, 1.45, 0);
      g.add(flag);
      g.position.set(cx, cy, cz);
      this.group.add(g);
      this.checkpoints.push({ pos: new THREE.Vector3(cx, cy, cz), flag, taken: false });
    }

    // ── Portal ──
    {
      const g = new THREE.Group();
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.22, 14, 36),
        new THREE.MeshStandardMaterial({ color: 0x9aa4b0, flatShading: true, roughness: 0.5, metalness: 0.3 }),
      );
      torus.position.y = 1.8;
      torus.castShadow = true;
      g.add(torus);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.3, 28),
        new THREE.MeshBasicMaterial({ color: 0x6b7684, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      disc.position.y = 1.8;
      g.add(disc);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.3, 0.3, 20),
        new THREE.MeshStandardMaterial({ color: 0xfff1c9, flatShading: true, roughness: 0.8 }),
      );
      base.position.y = 0.15;
      g.add(base);
      g.position.copy(this.portalPos);
      this.group.add(g);
      this.portalTorus = torus;
      this.portalDisc = disc;
    }

    // ── Clouds ──
    // fair-weather clouds: soft, smooth, flat underneath and piled up on top; one piece each
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xe4e8f0, emissiveIntensity: 0.62 });
    const cloudCount = def.space ? 0 : def.buildings ? 10 : 8;
    // clouds float above the tallest skyscraper
    const cloudY = Math.max(16, ...(def.buildings ?? []).map((b) => b.h + 8));
    for (let i = 0; i < cloudCount; i++) {
      const cloud = new THREE.Group();
      const puffs = 6 + Math.floor(rng() * 5);
      const span = 2.2 + rng() * 1.6;
      const parts: THREE.BufferGeometry[] = [];
      for (let j = 0; j < puffs; j++) {
        const k = j / (puffs - 1) - 0.5;                              // -0.5 … 0.5 along the cloud
        const s = (1.6 + rng() * 1.4) * (1 - Math.abs(k) * 0.9);     // biggest in the middle
        const g = new THREE.SphereGeometry(s, 16, 12);
        g.translate(k * span * puffs * 0.55, s * 0.35 + rng() * 0.6, (rng() - 0.5) * 2.2);
        parts.push(g);
      }
      const merged = mergeGeometries(parts);
      for (const pg of parts) pg.dispose();
      if (merged) {
        // a flat base, like real clouds sitting on a layer of air
        const pos = merged.getAttribute("position");
        for (let v = 0; v < pos.count; v++) if (pos.getY(v) < 0) pos.setY(v, pos.getY(v) * 0.25);
        merged.computeVertexNormals();
        const m = new THREE.Mesh(merged, cloudMat);
        cloud.add(m);
      }
      // high in the sky, above Sparky's route and the sky rings
      cloud.position.set((rng() - 0.5) * 190, cloudY + 22 + rng() * 14, -rng() * 130 + 35);
      cloud.scale.setScalar(1.6);
      this.group.add(cloud);
      this.clouds.push(cloud);
    }

    // ── Snow (decorative points that drift down and wrap around) ──
    this.snow = null;
    if (def.snow) {
      const count = 900;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (rng() - 0.5) * 70;
        pos[i * 3 + 1] = rng() * 26 - 4;
        pos[i * 3 + 2] = 10 - rng() * 80;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9 }));
      this.group.add(this.snow);
    }

    // ── Ocean (decorative sea far below) ──
    this.ocean = null;
    if (def.ocean || def.sea !== undefined) {
      this.oceanY = def.sea ?? -7;
      // a grid of flat-shaded facets whose corners rise and fall, so the water visibly rolls
      const open = def.sea !== undefined;
      const size = open ? 560 : 320;
      const seg = open ? 110 : 64;
      const geo = new THREE.PlaneGeometry(size, size, seg, seg);
      geo.rotateX(-Math.PI / 2);
      this.waveAmp = open ? 0.15 : 0.4;
      // per-corner colors: crests are light, troughs are deep blue
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 3), 3));
      this.ocean = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          // smooth, glossy water: the swells catch the sky like the real sea
          vertexColors: true, emissive: 0x04263f, roughness: 0.1, metalness: 0.3,
          transparent: true, opacity: 0.93,
        }),
      );
      this.ocean.position.set(0, this.oceanY, -25);
      this.ocean.receiveShadow = true;
      this.group.add(this.ocean);
    }
    // white surf where the sea meets each sandy beach
    this.surf = null;
    if (def.sea !== undefined) {
      const rings: THREE.BufferGeometry[] = [];
      for (const d of def.discs) {
        if (d.color !== SAND || d.y > 0.35 || d.r < 2.5) continue;
        const r = new THREE.RingGeometry(d.r * 0.985, d.r + 0.9, 64, 1).rotateX(-Math.PI / 2);
        r.translate(d.x, def.sea + 0.06, d.z);
        rings.push(r);
      }
      const merged = rings.length ? mergeGeometries(rings) : null;
      for (const r of rings) r.dispose();
      if (merged) {
        this.surf = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
        this.surf.renderOrder = 1;
        this.group.add(this.surf);
      }
    }
    if (def.sea !== undefined) {
      // the sandy seabed: an invisible floor so kids wade instead of falling out of the world
      this.platforms.push({
        kind: "box", x: 0, z: -25, r: 0, hw: 400, hd: 400, topY: def.sea - 0.5, spring: 0,
        baseX: 0, baseZ: -25, dx: 0, dz: 0, mesh: new THREE.Object3D(), squashT: 0,
      });
    }

    // ── Space: stars all around and the Earth overhead ──
    if (def.space || def.night) {
      const count = 1400;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        // random points on a big sphere (upper part only: below is the ground)
        const a = rng() * Math.PI * 2;
        const y = rng() * 1.1 - 0.1;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        pos[i * 3] = Math.cos(a) * r * 260;
        pos[i * 3 + 1] = y * 260;
        pos[i * 3 + 2] = Math.sin(a) * r * 260 - 14;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
      const earth = !def.space ? null : new THREE.Mesh(
        new THREE.SphereGeometry(22, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0x3f8fe0, fog: false }),
      );
      if (earth) {
        earth.position.set(70, 85, -150);
        this.group.add(earth);
      }
      for (let i = 0; earth && i < 7; i++) {
        const land = new THREE.Mesh(
          new THREE.SphereGeometry(5 + rng() * 5, 8, 6),
          new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffffff : 0x5ed48a, fog: false }),
        );
        // a blob lying on the Earth's near side
        const a = rng() * Math.PI * 2, e = 0.3 + rng() * 0.9;
        land.position.set(70 + Math.cos(a) * Math.sin(e) * 19.5, 85 + Math.sin(a) * Math.sin(e) * 19.5, -150 + Math.cos(e) * 19.5);
        land.scale.setScalar(0.6);
        this.group.add(land);
      }
    }

    // ── Sky: deeper blue overhead, fading to the horizon color ──
    if (!def.space && !def.night) {
      const skyGeo = new THREE.SphereGeometry(520, 24, 12);
      const horizon = new THREE.Color(def.sky).lerp(new THREE.Color(0xffffff), 0.35);
      const zenith = def.skyTop !== undefined ? new THREE.Color(def.skyTop) : new THREE.Color(def.sky).multiplyScalar(0.62);
      const pos = skyGeo.getAttribute("position");
      const colors = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        c.copy(horizon).lerp(zenith, Math.min(1, Math.max(0, pos.getY(i) / 380)));
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      skyGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      sky.position.set(0, -20, -25);
      sky.renderOrder = -1;
      this.group.add(sky);
      // the sun itself, with a soft glow around it (it sits where the sunlight comes from)
      const sunDir = new THREE.Vector3(18, 30, 28).normalize().multiplyScalar(430);
      const disc = new THREE.Mesh(new THREE.SphereGeometry(13, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfffbe6, fog: false, toneMapped: false }));
      disc.position.copy(sunDir);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(34, 16, 12),
        new THREE.MeshBasicMaterial({ color: def.light?.sun ?? 0xfff1c4, fog: false, transparent: true, opacity: 0.28, depthWrite: false }));
      glow.position.copy(sunDir);
      this.group.add(glow, disc);
    }

    if (def.space) this.buildSpaceDetail(rng);
    if (def.playground) this.buildPlayground(def.playground[0], def.playground[1]);
    this.stationPos = null;
    if (def.station) this.buildStation(def.station[0], def.station[1]);
    this.photoSpots = [];
    for (const ps of def.photoSpots ?? []) this.buildPhotoSpot(ps);

    // ── Rainbow (big, far, decorative) ──
    if (def.rainbow) {
      const rainbow = new THREE.Group();
      for (let i = 0; i < RAINBOW_COLORS.length; i++) {
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(20 + i * 0.9, 0.42, 8, 48, Math.PI),
          new THREE.MeshBasicMaterial({ color: RAINBOW_COLORS[i], transparent: true, opacity: 0.65 }),
        );
        rainbow.add(arc);
      }
      rainbow.position.set(this.portalPos.x, -3, this.portalPos.z - 26);
      this.group.add(rainbow);
    }

    this.decorGroup = new THREE.Group();
    this.group.add(this.decorGroup);
    this.buildDecor(def);
    this.textureHouses();

    scene.add(this.group);
  }

  /**
   * The outside details of a walk-in house: a stone base, corner boards, shuttered windows with
   * sills on the sides and back, flower boxes, an awning and a lamp by the door, and a chimney.
   * Everything of one material is merged into one mesh, so a house stays a handful of draw calls.
   */
  private houseDetail(shell: THREE.Group, b: BuildingDef, floorY: number, index: number): void {
    const hw = b.w / 2, hd = b.d / 2;
    const parts = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
    const accent = new THREE.Color(b.color).multiplyScalar(0.55).getHex();
    const mats: Record<string, () => THREE.Material> = {
      white: () => new THREE.MeshStandardMaterial({ color: 0xfdf6ec, roughness: 0.8 }),
      stone: () => new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 1, flatShading: true }),
      glass: () => new THREE.MeshStandardMaterial({ color: 0x9fd0f0, roughness: 0.08, metalness: 0.5 }),
      accent: () => new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8 }),
      wood: () => new THREE.MeshStandardMaterial({ color: 0x7a4a2b, roughness: 0.9 }),
      leaf: () => new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 0.9, flatShading: true }),
      bloom: () => new THREE.MeshStandardMaterial({ color: RUG_COLORS[index % RUG_COLORS.length], roughness: 0.8, flatShading: true }),
      lamp: () => new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffc861, emissiveIntensity: 0.9 }),
    };
    const add = (key: string, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0) => {
      let e = parts.get(key);
      if (!e) parts.set(key, (e = { mat: mats[key](), geos: [] }));
      if (rx) geo.rotateX(rx);
      if (ry) geo.rotateY(ry);
      geo.translate(x, y, z);
      e.geos.push(geo.index ? geo.toNonIndexed() : geo);
    };
    const boxAt = (key: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0) =>
      add(key, new THREE.BoxGeometry(w, h, d), x, y, z, ry, rx);

    // stone base (leaving the doorway open) and white corner boards
    boxAt("stone", b.w + 0.14, 0.4, 0.1, 0, floorY + 0.2, -hd - 0.02);
    for (const sx of [-1, 1]) {
      boxAt("stone", 0.1, 0.4, b.d + 0.14, sx * (hw + 0.02), floorY + 0.2, 0);
      const side = (b.w - DOORWAY) / 2;
      boxAt("stone", side, 0.4, 0.1, sx * (DOORWAY / 2 + side / 2), floorY + 0.2, hd + 0.02);
      for (const sz of [-1, 1]) boxAt("white", 0.16, b.h, 0.16, sx * hw, b.h / 2, sz * hd);
    }
    // a window: frame, pane, cross bars, sill and two shutters, on a wall facing (nx, nz)
    const windowAt = (x: number, y: number, z: number, ry: number) => {
      const fx = Math.sin(ry), fz = Math.cos(ry); // the way the wall faces
      const ax = Math.cos(ry), az = -Math.sin(ry); // along the wall
      boxAt("white", 1.1, 1.1, 0.08, x + fx * 0.03, y, z + fz * 0.03, ry);
      boxAt("glass", 0.9, 0.9, 0.06, x + fx * 0.07, y, z + fz * 0.07, ry);
      boxAt("white", 0.05, 0.9, 0.04, x + fx * 0.1, y, z + fz * 0.1, ry);
      boxAt("white", 0.9, 0.05, 0.04, x + fx * 0.1, y, z + fz * 0.1, ry);
      boxAt("white", 1.3, 0.08, 0.2, x + fx * 0.1, y - 0.6, z + fz * 0.1, ry);
      for (const s of [-1, 1]) boxAt("accent", 0.34, 1.1, 0.05, x + ax * s * 0.74 + fx * 0.04, y, z + az * s * 0.74 + fz * 0.04, ry);
    };
    const flowerBox = (x: number, y: number, z: number, ry: number) => {
      const fx = Math.sin(ry), fz = Math.cos(ry), ax = Math.cos(ry), az = -Math.sin(ry);
      boxAt("wood", 1.0, 0.2, 0.24, x + fx * 0.16, y, z + fz * 0.16, ry);
      for (const k of [-0.3, 0, 0.3]) {
        add("leaf", new THREE.IcosahedronGeometry(0.14, 0), x + fx * 0.16 + ax * k, y + 0.16, z + fz * 0.16 + az * k);
        add("bloom", new THREE.IcosahedronGeometry(0.09, 0), x + fx * 0.2 + ax * k, y + 0.27, z + fz * 0.2 + az * k);
      }
    };
    const wy = floorY + 1.55;
    const floors = b.h >= 5.6 ? 2 : 1;
    for (let f = 0; f < floors; f++) {
      const y = wy + f * 2.4;
      for (const sx of [-1, 1]) {
        const n = b.d >= 6 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const z = n === 1 ? 0 : (k - 0.5) * (b.d / 2);
          windowAt(sx * hw, y, z, sx * Math.PI / 2);
          if (f === 0) flowerBox(sx * hw, y - 0.72, z, sx * Math.PI / 2);
        }
      }
      const nb = b.w >= 5 ? 2 : 1;
      for (let k = 0; k < nb; k++) windowAt(nb === 1 ? 0 : (k - 0.5) * (b.w / 2), y, -hd, Math.PI);
      if (f > 0) for (const sx of [-1, 1]) if ((b.w - DOORWAY) / 2 > 0.9) windowAt(sx * (DOORWAY / 2 + (b.w - DOORWAY) / 4), y, hd, 0);
    }
    // by the door: a striped awning, a lamp, and flower boxes under the front windows
    if (!b.church) {
      for (let k = 0; k < 5; k++) boxAt(k % 2 ? "white" : "accent", (DOORWAY + 0.6) / 5, 0.06, 0.9, -(DOORWAY + 0.6) / 2 + (k + 0.5) * (DOORWAY + 0.6) / 5, floorY + 2.5, hd + 0.42, 0, 0.35);
      const side = (b.w - DOORWAY) / 2;
      if (side > 0.9) for (const sx of [-1, 1]) flowerBox(sx * (DOORWAY / 2 + side / 2), floorY + 1.0, hd, 0);
      // chimney
      boxAt("stone", 0.6, 1.1, 0.6, -hw + 0.8, b.h + 0.75, -hd + 0.8);
      boxAt("accent", 0.76, 0.14, 0.76, -hw + 0.8, b.h + 1.34, -hd + 0.8);
    }
    add("lamp", new THREE.SphereGeometry(0.11, 8, 6), DOORWAY / 2 + 0.3, floorY + 2.0, hd + 0.14);
    boxAt("wood", 0.06, 0.06, 0.16, DOORWAY / 2 + 0.3, floorY + 2.12, hd + 0.08);

    for (const e of parts.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(e.geos), e.mat);
      for (const g of e.geos) g.dispose();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      shell.add(mesh);
    }
  }

  /** The travel gate: a stone arch with a swirling light in it and a sign. Walk in to travel. */
  private buildStation(x: number, z: number): void {
    const y = this.groundAt(x, z, 2)?.y ?? 0;
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, flatShading: true, roughness: 0.95 });
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.6), stone);
      pillar.position.set(sx * 1.15, 1.3, 0);
      pillar.castShadow = true;
      g.add(pillar);
    }
    const top = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.28, 8, 16, Math.PI), stone);
    top.position.y = 2.6;
    top.castShadow = true;
    g.add(top);
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    swirl.position.y = 1.9;
    swirl.scale.y = 1.5;
    g.add(swirl);
    const sign = makeTextSprite("🧭 Travel", { bg: "rgba(41,98,255,0.95)", fg: "#ffffff", size: 44, height: 0.5 });
    sign.position.y = 4.3;
    g.add(sign);
    g.position.set(x, y, z);
    this.group.add(g);
    this.stationPos = new THREE.Vector3(x, y, z);
    this.anim.push((t) => {
      swirl.rotation.z = t * 0.8;
      (swirl.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 2.2) * 0.15;
    });
  }

  /**
   * A playground on a soft red surface: a slide with steps up the back, two swings, a roundabout
   * to stand on, a seesaw and a sandbox.
   */
  private buildPlayground(x: number, z: number): void {
    const y = this.groundAt(x, z, 2)?.y ?? 0;
    const g = new THREE.Group();
    const m = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
    const red = m(0xff4757), blue = m(0x2f80ed), yellow = m(0xffd93d), green = m(0x3fbf6b), steel = m(0xc9d1da, { metalness: 0.6, roughness: 0.35 }), wood = m(0xb9834f, { roughness: 0.9 });
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, parent: THREE.Object3D = g) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const plat = (px: number, pz: number, hw: number, hd: number, topY: number, mesh: THREE.Object3D) => this.platforms.push({
      kind: "box", x: x + px, z: z + pz, r: 0, hw, hd, topY: y + topY, spring: 0, baseX: x + px, baseZ: z + pz, dx: 0, dz: 0, mesh, squashT: 0,
    });
    // soft surface
    put(new THREE.BoxGeometry(11, 0.05, 9), m(0xd9785f, { roughness: 1 }), 0, 0.03, 0).castShadow = false;

    // slide: steps up the back (−z), a deck, and a chute down toward +x
    const sx = -3.4, sz = -1.6, DECK = 2.2;
    for (const [px, pz] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) put(new THREE.CylinderGeometry(0.07, 0.07, DECK + 1.1, 8), blue, sx + px, (DECK + 1.1) / 2, sz + pz);
    const deck = put(new THREE.BoxGeometry(1.7, 0.12, 1.7), yellow, sx, DECK - 0.06, sz);
    plat(sx, sz, 0.85, 0.85, DECK, deck);
    put(new THREE.ConeGeometry(1.3, 0.8, 4).rotateY(Math.PI / 4), red, sx, DECK + 1.5, sz);
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const top = DECK - (i + 1) * (DECK / (steps + 0.5));
      const st = put(new THREE.BoxGeometry(1.2, 0.1, 0.45), wood, sx, top - 0.05, sz - 0.85 - 0.22 - i * 0.45);
      plat(sx, sz - 1.07 - i * 0.45, 0.6, 0.23, top, st);
    }
    for (let i = 0; i < 6; i++) {
      const top = DECK - 0.3 - i * 0.34;
      const ch = put(new THREE.BoxGeometry(0.7, 0.1, 1.0), red, sx + 1.2 + i * 0.66, top - 0.05, sz);
      ch.rotation.z = -0.47;
      plat(sx + 1.2 + i * 0.66, sz, 0.36, 0.5, top, ch);
    }
    for (const s of [-1, 1]) {
      const rail = put(new THREE.BoxGeometry(4.4, 0.22, 0.06), yellow, sx + 2.85, DECK - 1.05, sz + s * 0.53);
      rail.rotation.z = -0.47;
    }

    // swings: an A-frame with two seats that swing back and forth
    const wx = 2.6, wz = -2.2, TOP = 2.7;
    put(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8).rotateZ(Math.PI / 2), steel, wx, TOP, wz);
    for (const s of [-1, 1]) for (const l of [-1, 1]) {
      const leg = put(new THREE.CylinderGeometry(0.06, 0.06, TOP + 0.25, 8), steel, wx + s * 1.8, TOP / 2, wz + l * 0.55);
      leg.rotation.x = -l * 0.4;
    }
    const swings: THREE.Group[] = [];
    for (const s of [-0.8, 0.8]) {
      const sw = new THREE.Group();
      sw.position.set(wx + s, TOP, wz);
      for (const c of [-0.25, 0.25]) put(new THREE.CylinderGeometry(0.015, 0.015, 2.0, 5), steel, c, -1.0, 0, sw).castShadow = false;
      put(new THREE.BoxGeometry(0.7, 0.06, 0.3), s < 0 ? red : green, 0, -2.0, 0, sw);
      g.add(sw);
      swings.push(sw);
    }
    // roundabout: a spinning disc with handles (stand on it)
    const rx = 2.8, rz = 2.2;
    const spin = new THREE.Group();
    spin.position.set(rx, 0, rz);
    put(new THREE.CylinderGeometry(1.4, 1.4, 0.14, 20), blue, 0, 0.28, 0, spin);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      put(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), yellow, Math.cos(a) * 1.1, 0.75, Math.sin(a) * 1.1, spin);
      put(new THREE.BoxGeometry(0.5, 0.02, 1.38), i % 2 ? red : yellow, Math.cos(a + 0.78) * 0.7, 0.36, Math.sin(a + 0.78) * 0.7, spin).rotation.y = -a - 0.78 + Math.PI / 2;
    }
    put(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), steel, 0, 0.6, 0, spin);
    g.add(spin);
    this.platforms.push({ kind: "disc", x: x + rx, z: z + rz, r: 1.4, hw: 0, hd: 0, topY: y + 0.35, spring: 0, baseX: x + rx, baseZ: z + rz, dx: 0, dz: 0, mesh: spin, squashT: 0 });
    // seesaw
    const ex = -2.6, ez = 2.4;
    put(new THREE.CylinderGeometry(0.3, 0.4, 0.55, 8), steel, ex, 0.28, ez);
    const plank = new THREE.Group();
    plank.position.set(ex, 0.6, ez);
    put(new THREE.BoxGeometry(3.4, 0.08, 0.36), green, 0, 0, 0, plank);
    for (const s of [-1, 1]) {
      put(new THREE.BoxGeometry(0.36, 0.06, 0.36), yellow, s * 1.45, 0.07, 0, plank);
      put(new THREE.TorusGeometry(0.13, 0.025, 6, 10, Math.PI), steel, s * 1.1, 0.06, 0, plank).rotation.y = Math.PI / 2;
    }
    g.add(plank);
    // sandbox with a bucket
    const bx = 0.2, bz = 0.4;
    put(new THREE.BoxGeometry(2.2, 0.1, 2.2), m(SAND, { roughness: 1 }), bx, 0.1, bz).castShadow = false;
    for (const [w, d, ox, oz] of [[2.5, 0.16, 0, -1.17], [2.5, 0.16, 0, 1.17], [0.16, 2.5, -1.17, 0], [0.16, 2.5, 1.17, 0]]) put(new THREE.BoxGeometry(w, 0.22, d), wood, bx + ox, 0.14, bz + oz);
    put(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 10), red, bx + 0.5, 0.28, bz - 0.3);
    put(new THREE.ConeGeometry(0.28, 0.3, 10), m(SAND, { roughness: 1 }), bx - 0.4, 0.3, bz + 0.3);
    // a bench
    put(new THREE.BoxGeometry(1.8, 0.08, 0.45), wood, 0, 0.5, 3.9);
    put(new THREE.BoxGeometry(1.8, 0.5, 0.08), wood, 0, 0.85, 4.15);
    for (const s of [-0.75, 0.75]) put(new THREE.BoxGeometry(0.08, 0.5, 0.4), steel, s, 0.25, 3.9);

    g.position.set(x, y, z);
    this.group.add(g);
    this.anim.push((t) => {
      swings[0].rotation.x = Math.sin(t * 1.9) * 0.5;
      swings[1].rotation.x = Math.sin(t * 1.7 + 1.3) * 0.38;
      spin.rotation.y = t * 0.7;
      plank.rotation.z = Math.sin(t * 1.3) * 0.2;
    });
  }

  /**
   * Deep space around the Moon: thousands of stars in three sizes and colors, the band of the
   * Milky Way, glowing nebulae, a ringed planet, the Sun, shooting stars and a satellite; and on
   * the ground craters, a lunar lander with a flag, glass garden domes, solar panels, a turning
   * radio dish and a lit path.
   */
  private buildSpaceDetail(rng: () => number): void {
    const far = (yMin = -0.15) => {
      const a = rng() * Math.PI * 2, yy = yMin + rng() * (1 - yMin), r = Math.sqrt(Math.max(0, 1 - yy * yy));
      return new THREE.Vector3(Math.cos(a) * r, yy, Math.sin(a) * r);
    };
    const points = (count: number, size: number, tint: (i: number) => THREE.Color, place: () => THREE.Vector3) => {
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const p = place().multiplyScalar(255), c = tint(i);
        pos.set([p.x, p.y, p.z - 14], i * 3);
        col.set([c.r, c.g, c.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true }));
      this.group.add(pts);
      return pts;
    };
    const tints = [0xffffff, 0xcfe3ff, 0xfff1c4, 0xffd0b0, 0xaecbff];
    points(2600, 1.3, () => new THREE.Color(tints[Math.floor(rng() * tints.length)]).multiplyScalar(0.55 + rng() * 0.45), () => far());
    const bright = points(260, 3.2, () => new THREE.Color(tints[Math.floor(rng() * tints.length)]), () => far());
    // the Milky Way: a dense, tilted band of faint stars
    const tilt = new THREE.Euler(0.9, 0.4, 0.3);
    points(2400, 1.1, () => new THREE.Color(0xdfe6ff).multiplyScalar(0.35 + rng() * 0.4), () => {
      const a = rng() * Math.PI * 2, spread = (rng() + rng() + rng() - 1.5) * 0.16;
      const v = new THREE.Vector3(Math.cos(a), spread, Math.sin(a)).normalize().applyEuler(tilt);
      return v.y > -0.15 ? v : v.multiplyScalar(-1);
    });
    this.anim.push((t) => { (bright.material as THREE.PointsMaterial).opacity = 0.8 + Math.sin(t * 2.3) * 0.2; }); // twinkle

    // nebulae: soft glowing clouds
    const cloudTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d")!;
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.4, "rgba(255,255,255,0.35)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    for (const [color, n, cx, cy, cz] of [[0x9b5cff, 9, -150, 120, -160], [0x2fd6c9, 7, 170, 70, -40], [0xff6fa8, 6, -60, 60, 190]] as const) {
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color, transparent: true, opacity: 0.16 + rng() * 0.12, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
        sp.position.set(cx + (rng() - 0.5) * 90, cy + (rng() - 0.5) * 50, cz + (rng() - 0.5) * 90);
        sp.scale.setScalar(50 + rng() * 70);
        this.group.add(sp);
      }
    }
    // the Sun, a ringed planet, and a glow of air around the Earth
    const basic = (color: number, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...extra });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), basic(0xfffbe6, { toneMapped: false }));
    sun.position.set(110, 150, 150);
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xfff1c4, transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sunGlow.position.copy(sun.position);
    sunGlow.scale.setScalar(90);
    const planet = new THREE.Group();
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(12, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe0b878, roughness: 0.9, fog: false })));
    for (const [r0, r1, c, o] of [[15, 19, 0xf2dcb0, 0.7], [20, 23.5, 0xcaa56a, 0.45]] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), basic(c, { side: THREE.DoubleSide, transparent: true, opacity: o }));
      ring.rotation.x = Math.PI / 2;
      planet.add(ring);
    }
    planet.position.set(-150, 70, -120);
    planet.rotation.set(0.5, 0, 0.35);
    const air = new THREE.Mesh(new THREE.SphereGeometry(23.6, 20, 14), basic(0x8fd0ff, { transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    air.position.set(70, 85, -150);
    this.group.add(sun, sunGlow, planet, air);
    // a shooting star every few seconds, and a satellite crossing the sky
    const streak = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 22), basic(0xffffff, { transparent: true }));
    streak.visible = false;
    const sat = new THREE.Group();
    sat.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.8), basic(0xdfe6ee)));
    for (const s of [-1, 1]) sat.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.3), basic(0x3a6fd8)).translateX(s * 2.4));
    this.group.add(streak, sat);
    let next = 3, from = new THREE.Vector3(), dir = new THREE.Vector3(), born = 0;
    this.anim.push((t) => {
      sat.position.set(Math.cos(t * 0.08) * 90, 55 + Math.sin(t * 0.05) * 6, -14 + Math.sin(t * 0.08) * 90);
      sat.rotation.y = t * 0.3;
      if (t > next) {
        from = far(0.25).multiplyScalar(170);
        dir = new THREE.Vector3(rng() - 0.5, -0.25 - rng() * 0.3, rng() - 0.5).normalize();
        born = t;
        next = t + 4 + rng() * 6;
      }
      const age = t - born;
      streak.visible = age < 0.9;
      if (!streak.visible) return;
      streak.position.copy(from).addScaledVector(dir, age * 140);
      streak.lookAt(streak.position.clone().add(dir));
      (streak.material as THREE.MeshBasicMaterial).opacity = 1 - age / 0.9;
    });

    // ── on the ground ──
    const groundY = (gx: number, gz: number) => this.groundAt(gx, gz, 0.2)?.y ?? null;
    // craters: a pale raised rim around a dark floor
    const rims: THREE.Matrix4[] = [], floors: THREE.Matrix4[] = [];
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2, rr = 4 + rng() * 24, size = 0.7 + rng() * 2.3;
      const cx = Math.cos(a) * rr, cz = -14 + Math.sin(a) * rr;
      if (groundY(cx, cz) !== 0 || Math.abs(cx) < 2.2) continue; // flat ground only, and keep the main path clear
      rims.push(new THREE.Matrix4().makeScale(size, 1, size).setPosition(cx, 0.03, cz));
      floors.push(new THREE.Matrix4().makeScale(size, 1, size).setPosition(cx, 0.025, cz));
    }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[]) => {
      const im = new THREE.InstancedMesh(geo, mat, ms.length);
      ms.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    };
    inst(new THREE.RingGeometry(0.78, 1, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdde1ea, roughness: 1 }), rims);
    inst(new THREE.CircleGeometry(0.8, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8e94a3, roughness: 1 }), floors);

    const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, parent: THREE.Object3D = this.group) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const gold = std(0xe2b23a, { metalness: 0.7, roughness: 0.35 }), grey = std(0xc9d1da, { metalness: 0.5, roughness: 0.4 }), dark = std(0x30343c);
    // the lunar lander, with its ladder, dish and flag
    const lander = new THREE.Group();
    lander.position.set(13, 0, 3);
    put(new THREE.CylinderGeometry(1.5, 1.5, 1.1, 8), gold, 0, 1.45, 0, lander);
    put(new THREE.CylinderGeometry(0.9, 1.25, 1.2, 8), grey, 0, 2.6, 0, lander);
    put(new THREE.BoxGeometry(0.6, 0.5, 0.1), dark, 0, 2.6, 1.02, lander);
    put(new THREE.ConeGeometry(0.7, 0.7, 10, 1, true), dark, 0, 0.7, 0, lander);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = put(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), grey, Math.cos(a) * 1.7, 0.85, Math.sin(a) * 1.7, lander);
      leg.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      put(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10), gold, Math.cos(a) * 2.3, 0.04, Math.sin(a) * 2.3, lander);
    }
    for (let k = 0; k < 5; k++) put(new THREE.BoxGeometry(0.5, 0.04, 0.06), grey, 0, 0.3 + k * 0.3, 1.62 + (4 - k) * 0.08, lander);
    const dish = put(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), grey, 0.5, 3.6, 0, lander);
    dish.rotation.x = Math.PI + 0.6;
    this.group.add(lander);
    this.solids.push({ minX: 11.4, maxX: 14.6, minZ: 1.4, maxZ: 4.6, topY: 3 });
    put(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), grey, 9.6, 1.2, 4.6);
    const flag = put(new THREE.PlaneGeometry(1.1, 0.7, 6, 1), new THREE.MeshStandardMaterial({ color: 0xfdf6ec, side: THREE.DoubleSide, roughness: 0.8 }), 10.17, 2.0, 4.6);
    put(new THREE.CircleGeometry(0.16, 5), new THREE.MeshBasicMaterial({ color: 0xffc93c, side: THREE.DoubleSide }), 10.17, 2.0, 4.62);
    flag.castShadow = false;
    // glass garden domes with plants growing inside
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    for (const [dx, dz] of [[-22, -18], [20, -21]]) {
      if (groundY(dx, dz) !== 0) continue;
      put(new THREE.SphereGeometry(2.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, dx, 0, dz).castShadow = false;
      put(new THREE.TorusGeometry(2.6, 0.12, 6, 28).rotateX(Math.PI / 2), grey, dx, 0.1, dz);
      put(new THREE.CylinderGeometry(2.4, 2.4, 0.12, 20), std(0x6b4a2b, { roughness: 1 }), dx, 0.06, dz).castShadow = false;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2, r = k === 0 ? 0 : 1.4;
        put(new THREE.ConeGeometry(0.35, 0.9 + (k % 3) * 0.3, 6), std(k % 2 ? 0x3fa34d : 0x7ed957, { flatShading: true }), dx + Math.cos(a) * r, 0.6, dz + Math.sin(a) * r);
      }
      this.solids.push({ minX: dx - 1.9, maxX: dx + 1.9, minZ: dz - 1.9, maxZ: dz + 1.9, topY: 2.4 });
    }
    // solar panels in two rows
    const cell = std(0x1f3f8f, { metalness: 0.8, roughness: 0.25 });
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
      const px = 15 + k * 2.3, pz = -2 - r * 3;
      put(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), grey, px, 0.5, pz);
      const panel = put(new THREE.BoxGeometry(2.0, 0.06, 1.3), cell, px, 1.1, pz);
      panel.rotation.x = -0.5;
      put(new THREE.BoxGeometry(2.06, 0.03, 0.04), grey, px, 1.1, pz).rotation.x = -0.5;
    }
    // a radio dish that slowly turns
    const mast = new THREE.Group();
    mast.position.set(-15, 0, 3);
    put(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 8), grey, 0, 1.2, 0, mast);
    const head = new THREE.Group();
    head.position.y = 2.5;
    const bowl = put(new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), grey, 0, 0, 0, head);
    bowl.rotation.x = Math.PI + 0.9;
    put(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), dark, 0, 0.5, 0.6, head).rotation.x = 0.9;
    mast.add(head);
    this.group.add(mast);
    this.solids.push({ minX: -15.4, maxX: -14.6, minZ: 2.6, maxZ: 3.4, topY: 2.4 });
    this.anim.push((t) => {
      head.rotation.y = t * 0.25;
      const p = flag.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 5 + t * 1.2) * 0.04 * (p.getX(i) + 0.55)); // (a flag on a wire, barely stirring)
      p.needsUpdate = true;
    });
    // lights along the path from the base to the portal
    const lamps: THREE.Matrix4[] = [];
    for (let lz = 4; lz >= -40; lz -= 6) for (const lx of [-2.4, 2.4]) if (groundY(lx, lz) === 0) lamps.push(new THREE.Matrix4().makeTranslation(lx, 0, lz));
    inst(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 6).translate(0, 0.35, 0), grey, lamps);
    inst(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.76, 0), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x6fd0ff, emissiveIntensity: 1.2 }), lamps);
  }

  /** Brick for the walk-in houses' outside walls, tinted with each house's color. */
  private textureHouses(): void {
    const brick = brickTexture();
    if (!brick) return;
    for (const h of this.houseWalls) {
      h.mat.map = brick;
      // (the grey brick reads darker than its color, so tint with a light pastel, as the city walls do)
      h.mat.color.set(h.color).lerp(new THREE.Color(0xffffff), 0.2).multiplyScalar(1.5);
      h.mat.needsUpdate = true;
    }
  }

  /** Redraw trees, plants, rocks and city buildings (call when the world models finish loading). */
  refreshDecor(): void {
    const free = (o: THREE.Object3D) => {
      // instanced model parts share geometry and materials with the loaded models: keep those
      if (o instanceof THREE.InstancedMesh) { o.dispose(); return; }
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose()); else m.dispose();
      }
      for (const c of o.children) free(c);
    };
    free(this.decorGroup);
    this.decorGroup.clear();
    this.buildDecor(this.def);
    this.textureHouses();
  }

  private buildDecor(def: LevelDef): void {
    const g = this.decorGroup;
    const models = envReady();
    const placer = new Placer();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true, roughness: 1 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: def.foliage, flatShading: true, roughness: 0.85 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xb8bec9, flatShading: true, roughness: 1 });
    // the big open island gets full-size trees; the small sky islands smaller ones
    const big = def.sea !== undefined;
    const frost = def.snow ? 0xe4f1f8 : undefined;
    const pickOf = (names: string[], v: number) => names[Math.min(names.length - 1, Math.floor(v * names.length))];

    for (const d of this.decor) {
      if (d.t === "tree") {
        if (models && d.kind !== 2) {
          // models are 7–9 m tall: scale to about the cartoon tree's height (a bit taller on the big island)
          // (the lighter tree models: 1.6k–4k triangles each)
          const name = pickOf(d.kind === 0 ? ["Pine_5", "Pine_1", "Pine_5"] : ["CommonTree_3", "CommonTree_5"], d.v);
          placer.add(name, d.x, d.y, d.z, { rotY: d.rot, scale: d.scale * (big ? 0.62 : 0.36), tint: frost, tintOnly: /Leaf|Leaves/ });
        } else {
          const tree = makeTree(trunkMat, foliageMat, d.kind === 2 ? d.scale * 1.5 : d.scale, d.kind);
          tree.position.set(d.x, d.y, d.z);
          tree.rotation.y = d.rot;
          g.add(tree);
        }
      } else if (d.t === "flower") {
        if (models) {
          const kinds: [string, number][] = [
            ["Flower_3_Group", 0.28], ["Fern_1", 0.45], ["Plant_1", 0.5], ["Clover_1", 0.45],
            ["Flower_3_Group", 0.28], ["Bush_Common", 0.38], ["Mushroom_Common", 0.9],
          ];
          const [name, sc] = kinds[Math.min(kinds.length - 1, Math.floor(d.v * kinds.length))];
          placer.add(name, d.x, d.y, d.z, { rotY: d.rot, scale: sc * (big ? 1.3 : 1), shadow: false, tint: frost, tintOnly: /Leaf|Leaves/ });
        } else {
          const flower = makeFlower(d.color);
          flower.position.set(d.x, d.y, d.z);
          g.add(flower);
        }
      } else if (d.t === "rock") {
        if (models) {
          const name = pickOf(["Rock_Medium_1", "Rock_Medium_2", "Rock_Medium_3"], d.v);
          placer.add(name, d.x, d.y, d.z, { rotY: d.ry, scale: d.size * 0.5, tint: def.space ? 0xb8bec9 : undefined });
        } else {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(d.size, 0), rockMat);
          rock.position.set(d.x, d.y + 0.15, d.z);
          rock.rotation.set(d.rx, d.ry, d.rz);
          rock.castShadow = true;
          g.add(rock);
        }
      } else if (d.t === "grass") {
        if (models) {
          const name = d.sand ? "Grass_Wispy_Tall" : pickOf(["Grass_Common_Short", "Grass_Common_Short", "Grass_Common_Tall", "Grass_Wispy_Tall"], d.v);
          placer.add(name, d.x, d.y, d.z, { rotY: d.rot, scale: (d.sand ? 0.28 : 0.32) * (0.8 + d.v * 0.5), shadow: false });
        }
      } else if (d.t === "kit") {
        placer.add(d.name, d.x, d.y, d.z, { rotY: d.rot, scale: d.scale });
      } else if (d.b.style === "glass") {
        g.add(glassTower(d.b));
      } else if (models && hasModel("Brick_Plain_3")) {
        this.facade(placer, d.b);
      } else {
        g.add(cartoonBuilding(d.b));
      }
    }
    trunkMat.dispose();
    foliageMat.dispose();
    rockMat.dispose();
    if (models) g.add(placer.build());
  }

  /**
   * Dress a building box in the city kit's wall panels (2 m wide, 3 m tall each): shop fronts and
   * a door on the ground floor, windowed brick above, corner columns, a cornice and a flat roof.
   * Panels stretch a little so each face is a whole number of them; the brick takes the building's
   * color. Collisions and the roof height stay exactly as before.
   */
  private facade(placer: Placer, b: BuildingDef): void {
    // (the grey brick texture reads darker than its color, so tint with a light pastel)
    const tint = new THREE.Color(b.color).lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(1.25).getHex();
    const brick = { tint, tintOnly: /Brick/ };
    const rows = Math.max(1, Math.round(b.h / 3));
    const sy = b.h / (rows * 3);
    const faces: { nx: number; nz: number; width: number; depth: number; rot: number; front: boolean }[] = [
      { nx: 0, nz: 1, width: b.w, depth: b.d / 2, rot: 0, front: true },
      { nx: 0, nz: -1, width: b.w, depth: b.d / 2, rot: Math.PI, front: false },
      { nx: 1, nz: 0, width: b.d, depth: b.w / 2, rot: Math.PI / 2, front: false },
      { nx: -1, nz: 0, width: b.d, depth: b.w / 2, rot: -Math.PI / 2, front: false },
    ];
    for (const f of faces) {
      const n = Math.max(1, Math.round(f.width / 2));
      const pw = f.width / n;
      // along the face: the panel's local +x direction after rotating
      const ax = Math.cos(f.rot), az = -Math.sin(f.rot);
      for (let i = 0; i < n; i++) {
        const along = -f.width / 2 + (i + 0.5) * pw;
        const x = b.x + f.nx * f.depth + ax * along;
        const z = b.z + f.nz * f.depth + az * along;
        for (let r = 0; r < rows; r++) {
          const y = r * 3 * sy;
          let name: string;
          if (r === 0) name = f.front && i === Math.floor(n / 2) ? "DoorFrame_Wooden" : f.front ? "Metal_FirstFloor_Window" : "Metal_FirstFloor_Wall";
          else if (r === rows - 1 && rows > 2) name = "Brick_TopTrim";
          else name = (i + r) % 2 === 0 ? "Brick_Window_Trim_Single" : "Brick_Window_Square_Single";
          const wide = name === "DoorFrame_Wooden" ? 2.3 : 2;
          placer.add(name, x, y, z, { rotY: f.rot, scale: [pw / wide, sy, 1], ...brick });
          if (name === "DoorFrame_Wooden") placer.add("Door_2", x + ax * 0.5 * (pw / 2), y, z + az * 0.5 * (pw / 2), { rotY: f.rot, scale: [pw / 2, sy, 1] });
        }
        // cornice along the top edge (its top lines up with the roof you can land on)
        placer.add("Cornice_Trim_Center", x, b.h - 0.75, z, { rotY: f.rot, scale: [pw / 2, 1, 1] });
      }
    }
    // corner columns, one per floor
    const corners: [number, number, number][] = [[1, 1, 0], [-1, 1, -Math.PI / 2], [1, -1, Math.PI / 2], [-1, -1, Math.PI]];
    for (const [cx, cz, rot] of corners) {
      for (let r = 0; r < rows; r++) {
        placer.add("Brick_CornerColumn_Center", b.x + cx * b.w / 2, r * 3 * sy, b.z + cz * b.d / 2, { rotY: rot, scale: [1, sy, 1], ...brick });
      }
    }
    // flat roof (the kit's roof sits 0.2 below its origin)
    placer.add("Roof_4x4", b.x, b.h + 0.45, b.z, { scale: [b.w / 4, 1, b.d / 4], shadow: false });
  }

  setPortalUnlocked(unlocked: boolean): void {
    this.portalUnlocked = unlocked;
    if (this.portalTorus) {
      const m = this.portalTorus.material as THREE.MeshStandardMaterial;
      m.color.set(unlocked ? 0xffc93c : 0x9aa4b0);
      m.emissive.set(unlocked ? 0xaa7700 : 0x000000);
    }
    if (this.portalDisc) {
      (this.portalDisc.material as THREE.MeshBasicMaterial).color.set(unlocked ? 0xffe27a : 0x6b7684);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    for (const a of this.anim) a(t, dt);
    for (const p of this.platforms) {
      if (p.move) {
        const off = Math.sin(t * p.move.speed + p.move.phase) * p.move.amp;
        const nx = p.move.axis === "x" ? p.baseX + off : p.baseX;
        const nz = p.move.axis === "z" ? p.baseZ + off : p.baseZ;
        p.dx = nx - p.x;
        p.dz = nz - p.z;
        p.x = nx;
        p.z = nz;
        p.mesh.position.x = nx;
        p.mesh.position.z = nz;
      } else {
        p.dx = 0;
        p.dz = 0;
      }
      if (p.squashT > 0) {
        p.squashT = Math.max(0, p.squashT - dt * 4);
        const s = 1 - 0.45 * Math.sin(p.squashT * Math.PI);
        p.mesh.scale.y = s;
      }
    }
    if (this.ferris) {
      this.ferris.wheel.rotation.z += dt * 0.12 * this.ferrisSpin;
      for (const c of this.ferris.cabins) c.rotation.z = -this.ferris.wheel.rotation.z;
    }
    for (const c of this.clouds) {
      c.position.x += dt * 0.6;
      if (c.position.x > 80) c.position.x = -80;
    }
    if (this.portalTorus) {
      this.portalTorus.rotation.y += dt * (this.portalUnlocked ? 1.6 : 0.15);
      if (this.portalDisc) this.portalDisc.rotation.z += dt * (this.portalUnlocked ? 2.4 : 0.1);
    }
    for (const cp of this.checkpoints) {
      cp.flag.rotation.y = Math.sin(t * 3 + cp.pos.x) * 0.25;
    }
    if (this.ocean) {
      // three sets of swells crossing each other, drifting toward the shore
      const attr = this.ocean.geometry.getAttribute("position") as THREE.BufferAttribute;
      const a = attr.array as Float32Array;
      const amp = this.waveAmp;
      const col = this.ocean.geometry.getAttribute("color") as THREE.BufferAttribute;
      const c = col.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        const h = swell(a[i], a[i + 2], t); // about -2.2 … 2.2
        a[i + 1] = amp * h;
        const k = Math.min(1, Math.max(0, 0.5 + h * 0.3)); // 0 = trough, 1 = crest
        c[i] = 0.02 + 0.2 * k;
        c[i + 1] = 0.22 + 0.36 * k;
        c[i + 2] = 0.55 + 0.35 * k;
      }
      attr.needsUpdate = true;
      col.needsUpdate = true;
      // smooth shading needs fresh normals as the swells roll (every other frame is plenty)
      if ((this.waterTick++ & 1) === 0) this.ocean.geometry.computeVertexNormals();
    }
    if (this.surf) {
      // the surf breathes in and out as the waves lap the sand
      (this.surf.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.22 * Math.sin(t * 1.3);
      this.surf.position.y = Math.sin(t * 1.3 + 1) * 0.04;
    }
    if (this.snow) {
      const attr = this.snow.geometry.getAttribute("position") as THREE.BufferAttribute;
      const a = attr.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1] -= dt * 1.4;
        a[i] += Math.sin(t + i) * dt * 0.3;
        if (a[i + 1] < -4) a[i + 1] = 22;
      }
      attr.needsUpdate = true;
    }
  }

  /**
   * Roads with dashed center lines and zebra crossings at every junction, the plaza fountain, and
   * (for big cities) street lamps and planters along the sidewalks. Lines, stripes and lamps are
   * instanced, so a whole grid of streets costs a few draw calls.
   */
  private buildStreets(def: LevelDef): void {
    const roads = def.roads ?? [];
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a93a6, flatShading: true, roughness: 1 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xfff6e5, roughness: 0.9 });
    for (const r of roads) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.06, r.d), roadMat);
      road.position.set(r.x, 0.03, r.z);
      road.receiveShadow = true;
      this.group.add(road);
    }
    const alongX = (r: RoadDef) => r.w > r.d;
    const inRoad = (x: number, z: number, r: RoadDef, pad = 0) => Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad;
    const marks: THREE.Matrix4[] = [];
    const mark = (x: number, z: number, sx: number, sz: number) => marks.push(new THREE.Matrix4().makeScale(sx, 1, sz).setPosition(x, 0.075, z));
    for (const r of roads) {
      const ax = alongX(r);
      const len = ax ? r.w : r.d;
      const dashes = Math.floor(len / 2.4);
      for (let i = 0; i < dashes; i++) {
        const off = -len / 2 + 1.4 + i * 2.4;
        const x = r.x + (ax ? off : 0), z = r.z + (ax ? 0 : off);
        if (roads.some((o) => alongX(o) !== ax && inRoad(x, z, o, 0.6))) continue; // no center line through junctions
        mark(x, z, ax ? 1.1 : 0.16, ax ? 0.16 : 1.1);
      }
    }
    // zebra crossings on every side of every junction
    for (const h of roads.filter(alongX)) {
      for (const v of roads.filter((r) => !alongX(r))) {
        if (!inRoad(v.x, h.z, h) || !inRoad(v.x, h.z, v)) continue;
        for (const sgn of [-1, 1]) {
          const zc = h.z + sgn * (h.d / 2 + 1.4);
          if (inRoad(v.x, zc, v)) for (let k = 0; k < 5; k++) mark(v.x - v.w / 2 + (k + 0.5) * (v.w / 5), zc, v.w / 10, 2.2);
          const xc = v.x + sgn * (v.w / 2 + 1.4);
          if (inRoad(xc, h.z, h)) for (let k = 0; k < 5; k++) mark(xc, h.z - h.d / 2 + (k + 0.5) * (h.d / 5), 2.2, h.d / 10);
        }
      }
    }
    if (marks.length) {
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.03, 1), lineMat, marks.length);
      marks.forEach((mm, i) => inst.setMatrixAt(i, mm));
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
    }

    if (def.fountain) {
      const [fx, fz] = def.fountain;
      const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.5, 0.7, 20),
        new THREE.MeshStandardMaterial({ color: 0xb8bec9, flatShading: true, roughness: 0.9 }),
      );
      basin.position.set(fx, 0.35, fz);
      basin.castShadow = true;
      this.group.add(basin);
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(1.9, 1.9, 0.15, 20),
        new THREE.MeshStandardMaterial({ color: 0x5cb8ff, roughness: 0.3 }),
      );
      water.position.set(fx, 0.72, fz);
      this.group.add(water);
      if (def.streetlife) {
        // big cities get a spouting jet in the middle
        const jet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.45, 2.6, 12, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.6, roughness: 0.2, depthWrite: false }),
        );
        jet.position.set(fx, 2.0, fz);
        this.group.add(jet);
      }
      // the rim is a tiny standable platform, and its sides are solid so you can't clip through
      this.platforms.push({
        kind: "disc", x: fx, z: fz, r: 2.3, hw: 0, hd: 0, topY: 0.72, spring: 0,
        baseX: fx, baseZ: fz, dx: 0, dz: 0, mesh: basin, squashT: 0,
      });
      this.solids.push({ minX: fx - 2.3, maxX: fx + 2.3, minZ: fz - 2.3, maxZ: fz + 2.3, topY: 0.72 });
    }

    if (!def.streetlife) return;
    // street lamps every 24 m along both sidewalks, with a planter halfway between each pair
    const clear = (x: number, z: number) =>
      !roads.some((o) => inRoad(x, z, o, 0.5)) &&
      !(def.buildings ?? []).some((b) => Math.abs(x - b.x) < b.w / 2 + 0.8 && Math.abs(z - b.z) < b.d / 2 + 0.8) &&
      (this.groundAt(x, z, 1)?.y ?? -1) >= 0;
    const lamps: [number, number][] = [];
    for (const r of roads) {
      const ax = alongX(r);
      const len = ax ? r.w : r.d;
      const side = (ax ? r.d : r.w) / 2 + 0.7;
      for (let off = -len / 2 + 6, k = 0; off <= len / 2 - 3; off += 6, k++) {
        if (k % 2 === 1) continue;
        const lamp = k % 4 === 0;
        for (const sgn of [-1, 1]) {
          const x = r.x + (ax ? off : sgn * side), z = r.z + (ax ? sgn * side : off);
          if (!clear(x, z)) continue;
          if (lamp) lamps.push([x, z]);
          else this.decor.push({ t: "kit", name: "Prop_Planter_Single", x, y: 0, z, rot: ax ? 0 : Math.PI / 2, scale: 1 });
        }
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, 4.2, 8).translate(0, 2.1, 0);
    const globeGeo = new THREE.SphereGeometry(0.18, 12, 8).translate(0, 4.3, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.6, metalness: 0.4 }), lamps.length);
    const globes = new THREE.InstancedMesh(globeGeo, new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffc861, emissiveIntensity: 0.7 }), lamps.length);
    const mm = new THREE.Matrix4();
    lamps.forEach(([x, z], i) => {
      mm.makeTranslation(x, 0, z);
      poles.setMatrixAt(i, mm);
      globes.setMatrixAt(i, mm);
    });
    poles.castShadow = true;
    poles.computeBoundingSphere();
    globes.computeBoundingSphere();
    this.group.add(poles, globes);
  }

  /** The great fish of the book of Jonah: body along x, mouth toward +x, a spout, and a back to stand on. */
  private buildBigFish(x: number, z: number, sea: number): void {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x3f6fa8, flatShading: true, roughness: 0.6 });
    const belly = new THREE.MeshStandardMaterial({ color: 0xcfe3f5, flatShading: true, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2b44, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
    body.scale.set(9, 3.6, 4.6);
    body.position.y = 0.6;
    body.castShadow = true;
    g.add(body);
    const under = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), belly);
    under.scale.set(8.2, 2.6, 4.2);
    under.position.set(0.6, -0.4, 0);
    g.add(under);
    for (const s of [-1, 1]) {
      const fluke = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4, 4), skin);
      fluke.position.set(-10.2, 1.6, s * 1.8);
      fluke.rotation.set(s * 0.9, 0, Math.PI / 2 + 0.5);
      fluke.castShadow = true;
      g.add(fluke);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), dark);
      eye.position.set(6.4, 1.6, s * 3.0);
      g.add(eye);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3, 4), skin);
      fin.position.set(2, -0.4, s * 4.6);
      fin.rotation.x = s * 1.9;
      g.add(fin);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    mouth.scale.set(2.2, 1.4, 3.2);
    mouth.rotation.z = -Math.PI / 2;
    mouth.position.set(7.4, 0.2, 0);
    g.add(mouth);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.12, 3.4, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.2 }));
    spout.position.set(3, 5.6, 0);
    g.add(spout);
    g.position.set(x, sea, z);
    this.group.add(g);
    const top = sea + 3.9;
    this.platforms.push({ kind: "box", x, z, r: 0, hw: 5.5, hd: 2.4, topY: top, spring: 0, baseX: x, baseZ: z, dx: 0, dz: 0, mesh: g, squashT: 0 });
    this.solids.push({ minX: x - 8, maxX: x + 8, minZ: z - 3.6, maxZ: z + 3.6, topY: top - 0.4 });
  }

  /**
   * Noah's ark: a long wooden hull lying along x with a walkable deck, a cabin with a roof you can
   * stand on, and a ramp of planks up its +z side.
   */
  private buildArk(x: number, z: number): void {
    const g = new THREE.Group();
    const L = 22, W = 7, DECK = 4.3, base = 0.3;
    const hull = new THREE.MeshStandardMaterial({ color: 0x9a6a3a, flatShading: true, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x6e4a26, flatShading: true, roughness: 0.95 });
    const light = new THREE.MeshStandardMaterial({ color: 0xc9a26b, flatShading: true, roughness: 0.9 });
    const add = (m: THREE.Material, w: number, h: number, d: number, px: number, py: number, pz: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(hull, L, DECK - base, W, 0, (DECK + base) / 2, 0);
    // plank lines along the sides, and a darker keel
    for (let k = 1; k < 4; k++) for (const sz of [-1, 1]) add(dark, L + 0.04, 0.08, 0.06, 0, base + k * 1.0, sz * (W / 2 + 0.02));
    add(dark, L + 1.2, 0.5, W - 1.5, 0, base + 0.25, 0);
    // pointed bow and stern
    for (const sx of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, DECK - base, 3), hull);
      end.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      end.scale.z = 1;
      end.position.set(sx * (L / 2 + W / 4 - 0.05), (DECK + base) / 2, 0);
      end.castShadow = true;
      g.add(end);
    }
    // deck rail
    for (const sz of [-1, 1]) add(dark, L, 0.12, 0.12, 0, DECK + 0.75, sz * (W / 2 - 0.1)).castShadow = false;
    for (let px = -L / 2 + 1; px <= L / 2 - 1; px += 2) {
      for (const sz of [-1, 1]) {
        if (sz > 0 && Math.abs(px) < 1.6) continue; // the gap where the ramp arrives
        add(dark, 0.12, 0.75, 0.12, px, DECK + 0.38, sz * (W / 2 - 0.1));
      }
    }
    // the cabin, with a pitched roof (its flat ridge is a place to stand)
    const CW = 8, CD = 3.4, CH = 3.2, cz = -0.9;
    add(light, CW, CH, CD, 0, DECK + CH / 2, cz);
    add(dark, CW + 0.6, 0.3, CD + 0.6, 0, DECK + CH + 0.15, cz);
    for (const wx of [-2.4, 0, 2.4]) add(dark, 0.9, 0.9, 0.08, wx, DECK + 1.9, cz + CD / 2 + 0.03).castShadow = false;
    g.position.set(x, 0, z);
    this.group.add(g);

    const flatPlat = (px: number, pz: number, hw: number, hd: number, topY: number, mesh: THREE.Object3D) => this.platforms.push({
      kind: "box", x: px, z: pz, r: 0, hw, hd, topY, spring: 0, baseX: px, baseZ: pz, dx: 0, dz: 0, mesh, squashT: 0,
    });
    flatPlat(x, z, L / 2 + 0.6, W / 2, DECK, g);                         // the deck
    flatPlat(x, z + cz, CW / 2 + 0.3, CD / 2 + 0.3, DECK + CH + 0.3, new THREE.Object3D()); // the cabin roof
    this.solids.push({ minX: x - L / 2 - 0.6, maxX: x + L / 2 + 0.6, minZ: z - W / 2, maxZ: z + W / 2, topY: DECK - 0.4 });
    this.solids.push({ minX: x - CW / 2, maxX: x + CW / 2, minZ: z + cz - CD / 2, maxZ: z + cz + CD / 2, topY: DECK + CH });

    // the ramp: planks stepping down from the deck to the meadow
    const steps = 12, rise = (DECK - 0.34) / steps;
    for (let i = 0; i < steps; i++) {
      const top = DECK - (i + 1) * rise;
      const pz = z + W / 2 + 0.45 + i * 0.9;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 0.92), i % 2 ? light : hull);
      plank.position.set(x, top - 0.08, pz);
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.group.add(plank);
      const post = new THREE.Mesh(new THREE.BoxGeometry(2.6, Math.max(0.1, top - 0.3), 0.3), dark);
      post.position.set(x, 0.3 + (top - 0.3) / 2 - 0.08, pz);
      this.group.add(post);
      flatPlat(x, pz, 1.5, 0.46, top, plank);
    }
  }

  /** Trees, rocks and flowers kids can shake, look under or pick (see interact.ts). */
  decorSpots(): { t: "tree" | "rock" | "flower"; x: number; y: number; z: number }[] {
    const out: { t: "tree" | "rock" | "flower"; x: number; y: number; z: number }[] = [];
    for (const d of this.decor) if (d.t === "tree" || d.t === "rock" || d.t === "flower") out.push({ t: d.t, x: d.x, y: d.y, z: d.z });
    return out;
  }

  /** Where kids get on the Ferris wheel (null when this level has none). */
  get ferrisGate(): THREE.Vector3 | null {
    return this.ferris?.gate ?? null;
  }

  get ferrisFacing(): number {
    return this.ferris?.facing ?? 0;
  }

  /** The gondola nearest the ground right now. */
  ferrisLowest(): number {
    if (!this.ferris) return -1;
    let best = 0, by = Infinity;
    const v = new THREE.Vector3();
    this.ferris.cabins.forEach((c, i) => {
      c.getWorldPosition(v);
      if (v.y < by) { by = v.y; best = i; }
    });
    return best;
  }

  /** Where a kid sits in gondola i (their feet), written into out. Returns the gondola's height above its lowest point (0 = at the gate). */
  ferrisSeat(i: number, out: THREE.Vector3): number {
    const f = this.ferris!;
    const c = f.cabins[i];
    c.updateWorldMatrix(true, false);
    out.set(0, -1.75, 0).applyMatrix4(c.matrixWorld);
    // the hub's height minus the radius is the lowest a gondola gets
    const hub = new THREE.Vector3();
    f.wheel.getWorldPosition(hub);
    const pivot = new THREE.Vector3();
    c.getWorldPosition(pivot);
    return pivot.y - (hub.y - 9);
  }

  /** A Ferris wheel that turns slowly; its gondolas hang level. Kids ride it from the gate (boot.ts). */
  private buildFerris(x: number, y: number, z: number, rot: number): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    const R = 9, hubY = R + 1.8;
    const steel = new THREE.MeshStandardMaterial({ color: 0xf4f6fb, roughness: 0.5, metalness: 0.3 });
    // A-frame legs on both sides
    for (const side of [-1, 1]) {
      for (const lean of [-1, 1]) {
        const foot = new THREE.Vector3(lean * 5, 0, side * 1.4);
        const top = new THREE.Vector3(0, hubY, side * 0.9);
        const len = foot.distanceTo(top);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, len, 8), steel);
        leg.position.copy(foot).add(top).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
        leg.castShadow = true;
        g.add(leg);
      }
    }
    const wheel = new THREE.Group();
    wheel.position.y = hubY;
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.5, metalness: 0.2 });
    for (const side of [-0.6, 0.6]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 6, 56), rimMat);
      rim.position.z = side;
      wheel.add(rim);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2, 14).rotateX(Math.PI / 2), steel);
    wheel.add(hub);
    const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, R, 0.08).translate(0, R / 2, 0), steel, 24);
    const cabins: THREE.Object3D[] = [];
    // open gondolas: a tub you sit in, four poles and a little roof (riders show above the rim)
    const tubGeo = new THREE.BoxGeometry(1.4, 0.55, 1.2).translate(0, -1.55, 0);
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5);
    const roofGeo = new THREE.CylinderGeometry(0.2, 0.9, 0.35, 8).translate(0, -0.2, 0);
    const hangGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5).translate(0, -0.05, 0);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const [k, side] of [[0, -0.6], [1, 0.6]] as const) {
        spokes.setMatrixAt(i * 2 + k, new THREE.Matrix4().makeRotationZ(a).setPosition(0, 0, side));
      }
      const cab = new THREE.Group();
      cab.position.set(Math.sin(a) * R, Math.cos(a) * R, 0);
      const color = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
      const body = new THREE.Mesh(tubGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
      body.castShadow = true;
      const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      cab.add(body, roof, new THREE.Mesh(hangGeo, steel));
      for (const [px, pz] of [[-0.62, -0.52], [0.62, -0.52], [-0.62, 0.52], [0.62, 0.52]]) {
        const pole = new THREE.Mesh(poleGeo, steel);
        pole.position.set(px, -0.85, pz);
        cab.add(pole);
      }
      wheel.add(cab);
      cabins.push(cab);
    }
    spokes.rotation.set(0, 0, 0);
    wheel.add(spokes);
    g.add(wheel);
    this.group.add(g);
    // the boarding gate: in front of the wheel, beside the ticket booth
    const gate = new THREE.Vector3(x - Math.sin(rot) * 2.2, y, z - Math.cos(rot) * 2.2);
    this.ferris = { wheel, cabins, gate, facing: rot + Math.PI };
    // the ticket booth, on the sea side so the gondolas pass by it
    const bx = x + Math.sin(rot) * 3.4, bz = z + Math.cos(rot) * 3.4;
    this.solids.push({ minX: bx - 1.2, maxX: bx + 1.2, minZ: bz - 1.2, maxZ: bz + 1.2, topY: y + 2 });
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 0.7 }));
    booth.position.set(bx, y + 1, bz);
    booth.castShadow = true;
    this.group.add(booth);
  }

  private disposeLevel(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      } else if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      }
    });
  }
}

/** Three sets of swells crossing each other (about -2.2 … 2.2), in the sea mesh's local x/z. */
function swell(x: number, z: number, t: number): number {
  return Math.sin(x * 0.33 + t * 1.5) + 0.7 * Math.sin(z * 0.27 - t * 1.2) + 0.5 * Math.sin((x + z) * 0.14 + t * 1.9);
}

/** The code-built building (used until the city models load). */
/** One window tile (a pane with a glint, in a pale frame), repeated up a glass tower. */
let windowTex: THREE.CanvasTexture | null = null;
function windowTexture(): THREE.CanvasTexture {
  if (windowTex) return windowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  x.fillStyle = "#eef2f6";
  x.fillRect(0, 0, 64, 64);
  const grad = x.createLinearGradient(0, 0, 64, 64);
  grad.addColorStop(0, "#bfe3ff");
  grad.addColorStop(0.55, "#4f86c0");
  grad.addColorStop(1, "#9fd0f5");
  x.fillStyle = grad;
  x.fillRect(4, 8, 56, 50);
  x.fillStyle = "rgba(255,255,255,0.45)";
  x.fillRect(9, 12, 5, 40);
  x.fillStyle = "#eef2f6";
  x.fillRect(31, 8, 2, 50);
  windowTex = new THREE.CanvasTexture(c);
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  windowTex.colorSpace = THREE.SRGBColorSpace;
  windowTex.anisotropy = 4;
  return windowTex;
}

/** A glass skyscraper: tinted window grid, a white lobby band with a door on its +z side, a
 *  parapet you can land on, roof machinery, and a helipad and antenna on the tallest. */
function glassTower(b: BuildingDef): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4); // +x, -x, +y, -y, +z, -z
    if (face === 2 || face === 3) { uv.setXY(i, 0.02, 0.02); continue; }
    const across = face < 2 ? b.d : b.w;
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(across / 2.5)), uv.getY(i) * Math.max(1, Math.round(b.h / 3.2)));
  }
  const tint = new THREE.Color(b.color).lerp(new THREE.Color(0xffffff), 0.3);
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: windowTexture(), color: tint, roughness: 0.2, metalness: 0.35 }));
  body.position.set(b.x, b.h / 2, b.z);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const trim = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8 });
  const lobby = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 3.2, b.d + 0.3), trim);
  lobby.position.set(b.x, 1.6, b.z);
  lobby.castShadow = true;
  g.add(lobby);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x2b3a4e, roughness: 0.2, metalness: 0.5 }));
  door.position.set(b.x, 1.25, b.z + b.d / 2 + 0.18);
  g.add(door);
  // the roof you land on is 0.25 above the walls: a parapet slab fills the gap
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.5, b.d + 0.3), trim);
  parapet.position.set(b.x, b.h, b.z);
  parapet.receiveShadow = true;
  g.add(parapet);
  const dark = new THREE.MeshStandardMaterial({ color: 0x8a90a0, roughness: 0.7 });
  const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), dark);
  ac.position.set(b.x - b.w / 2 + 1.2, b.h + 0.7, b.z - b.d / 2 + 1.2);
  ac.castShadow = true;
  g.add(ac);
  if (b.h >= 30) {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 7, 6), dark);
    antenna.position.set(b.x + b.w / 2 - 1, b.h + 3.7, b.z - b.d / 2 + 1);
    g.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4757 }));
    tip.position.set(b.x + b.w / 2 - 1, b.h + 7.3, b.z - b.d / 2 + 1);
    g.add(tip);
    // helipad
    const pad = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd93d }));
    pad.position.set(b.x, b.h + 0.27, b.z);
    g.add(pad);
    const hMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [w, d, ox] of [[0.3, 2.2, -0.6], [0.3, 2.2, 0.6], [1.2, 0.3, 0]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), hMat);
      bar.position.set(b.x + ox, b.h + 0.27, b.z);
      g.add(bar);
    }
  }
  return g;
}

function cartoonBuilding(b: BuildingDef): THREE.Group {
  const g = new THREE.Group();
  const flat = (color: number, rough = 0.85) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: rough });
  const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), flat(b.color));
  body.position.y = b.h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.25, b.d + 0.3), flat(0xffffff));
  trim.position.y = b.h + 0.12;
  trim.castShadow = true;
  g.add(trim);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1), flat(0x7a4a2b, 0.9));
  door.position.set(0, 0.6, b.d / 2 + 0.03);
  g.add(door);
  // a couple of window strips on the front
  const winMat = flat(0xfff6b8, 0.4);
  const rows = Math.max(1, Math.floor(b.h / 2.6));
  for (let i = 0; i < rows; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.62, 0.5, 0.06), winMat);
    win.position.set(0, 1.6 + i * 2.2, b.d / 2 + 0.03);
    g.add(win);
  }
  g.position.set(b.x, 0, b.z);
  return g;
}

/**
 * A tree. `kind` picks the shape: 0 = pine (stacked cones), 1 = leafy (round crown on a forked
 * trunk), 2 = palm (curved trunk, drooping fronds, coconuts).
 */
function makeTree(trunkMat: THREE.Material, foliageMat: THREE.Material, s: number, kind = 0): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (kind === 1) {
    add(new THREE.CylinderGeometry(0.11 * s, 0.19 * s, 1.1 * s, 8), trunkMat, 0, 0.55 * s, 0);
    for (const [bx, bz] of [[0.22, 0.05], [-0.18, 0.12]]) {
      const branch = add(new THREE.CylinderGeometry(0.05 * s, 0.08 * s, 0.6 * s, 6), trunkMat, bx * s, 1.2 * s, bz * s);
      branch.rotation.z = -bx * 2.4;
    }
    for (const [x, y, z, r] of [[0, 1.75, 0, 0.72], [0.45, 1.5, 0.1, 0.5], [-0.42, 1.55, -0.12, 0.52], [0.05, 1.5, 0.45, 0.46], [0, 2.2, -0.1, 0.48]]) {
      add(new THREE.IcosahedronGeometry(r * s, 1), foliageMat, x * s, y * s, z * s);
    }
  } else if (kind === 2) {
    // palm: a trunk in three leaning pieces
    let x = 0, y = 0;
    for (let k = 0; k < 3; k++) {
      const piece = add(new THREE.CylinderGeometry((0.1 - k * 0.012) * s, (0.13 - k * 0.012) * s, 0.75 * s, 7), trunkMat, x + 0.07 * s, y + 0.36 * s, 0);
      piece.rotation.z = -0.2;
      x += 0.15 * s;
      y += 0.72 * s;
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const frond = add(new THREE.ConeGeometry(0.2 * s, 1.4 * s, 4), foliageMat, x + Math.cos(a) * 0.55 * s, y - 0.12 * s, Math.sin(a) * 0.55 * s);
      frond.scale.z = 0.3;
      frond.rotation.set(0, -a, -Math.PI / 2 - 0.35, "YXZ");
    }
    const nut = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
    for (const a of [0.5, 2.6, 4.4]) add(new THREE.SphereGeometry(0.1 * s, 8, 6), nut, x + Math.cos(a) * 0.14 * s, y - 0.12 * s, Math.sin(a) * 0.14 * s);
  } else {
    add(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.8 * s, 8), trunkMat, 0, 0.4 * s, 0);
    add(new THREE.ConeGeometry(0.78 * s, 1.0 * s, 10), foliageMat, 0, 1.1 * s, 0);
    add(new THREE.ConeGeometry(0.6 * s, 0.9 * s, 10), foliageMat, 0, 1.65 * s, 0);
    add(new THREE.ConeGeometry(0.4 * s, 0.8 * s, 10), foliageMat, 0, 2.15 * s, 0);
  }
  return g;
}

function makeFlower(color: number): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 1 }),
  );
  stem.position.y = 0.2;
  g.add(stem);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 8),
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 }),
  );
  head.position.y = 0.44;
  head.castShadow = true;
  g.add(head);
  return g;
}
