/**
 * world.ts — floating-island level construction + collision queries + ambient animation.
 *
 * Nine hand-designed worlds (geometry is parametric, placed from level data):
 *   1. Sunny Meadow        — gentle gaps, teaches jump / stars / stomp (+ bunny buddy)
 *   2. Candy Canyon        — bridges, a moving platform (+ birdie buddy, circling bird)
 *   3. Rainbow Peak        — vertical climb, springs (+ hedgehogs, turtle buddy)
 *   4. Castle in the Clouds — cloud towers, trampolines, every creature
 *   5. Toy City            — big explorable city: solid buildings, roads, a drivable car,
 *                            and a parachute tower (free glide in this world)
 *   6. Frosty Mountain     — falling snow, a sliding ice bridge, a spring-launch climb
 *   7. Bubbly Beach        — sandy islands over the sea; party balloons float you to secret islands
 *   9. Moon Base           — low gravity, floating rocks, a moon buggy, aliens to talk to; reached by
 *                            rocket from Adventure Island
 *   8. Adventure Island    — one big open island to explore: village, forest, lookout hill, a beach
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

interface DiscDef { x: number; z: number; r: number; y: number; trees?: number; flowers?: number; rocks?: number; color?: number }
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
}
export interface BuildingDef {
  x: number; z: number; w: number; d: number; h: number; color: number;
  /** A house with an open doorway on its +Z side: kids can walk in and look around. */
  enter?: boolean;
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
  /** Toy pirate ships to sink with the sailboat's cannon: circle center x, z, radius, speed. */
  pirates?: ShipDef[];
  /** Snacks to eat (food.ts). */
  food?: FoodDef[];
  /** Gravity multiplier (1 = normal; the Moon is 0.3). */
  gravity?: number;
  /** Outer space: black sky, stars, the Earth overhead, no clouds. */
  space?: boolean;
  npcs?: NpcDef[];
  /** Bumpable things: cones, gift boxes, balls, and car boost pads / ramps (props.ts). */
  props?: PropDefs;
  /** Party balloons: touch one to float up for a few seconds. */
  balloons?: [number, number, number][];
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
  ],
  pirates: [[0, 50, 10, 0.22], [-48, 12, 8, -0.26], [46, -6, 6, 0.3]],
  heliSpawn: [13, 0, 10, Math.PI],
  jetSpawn: [-31, 0, -12, Math.PI],
  rocket: [-70, 0, -40.5],
  rings: [
    [0, 10, -20, 0], [20, 14, -40, 0.8], [46, 18, -66, 0], [6, 16, -72, 0], [-30, 20, -50, 0.8],
    [-66, 17, -60, 0], [-56, 9, -14, 1.57], [62, 14, 22, 0], [0, 24, 22, 1.57], [22, 31, 0, 1.57],
  ],
  rainbow: true,
  discs: [
    { x: 0, z: -20, r: 36, y: 0, color: SAND },                      // the beach
    { x: 0, z: -20, r: 28, y: 0.3, flowers: 26, rocks: 5 },           // the meadow
    // forest patches
    { x: -16, z: -8, r: 6, y: 0.34, trees: 6, flowers: 4 },
    { x: -24, z: -18, r: 5, y: 0.34, trees: 5, flowers: 3 },
    { x: 4, z: -40, r: 6, y: 0.34, trees: 6, flowers: 4 },
    { x: 23, z: -37, r: 4.5, y: 0.34, trees: 4, flowers: 3 },
    { x: -5, z: -3, r: 4, y: 0.34, trees: 3, flowers: 3 },
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
    { x: 42, z: -62, w: 4, d: 3.5, h: 3.2, color: 0xffa94d, enter: true },  // the Coconut Cove snack hut
    { x: -76, z: -63, w: 4, d: 4, h: 3.2, color: 0xc98a5b, enter: true },   // the Pine Island cabin
    { x: 64, z: 16, w: 3.5, d: 3.5, h: 6, color: 0xff9ecf }, // the Sunset Island tower
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
        "Sixteen friends live on these islands. Can you say hello to all of us?",
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
      name: "Farmer Fern", x: -13, y: 0.3, z: -13, outfit: 3, hat: 4, skin: 2,
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
      name: "Surfer Sky", x: 36, y: 0, z: -57, outfit: 1, hat: 4, skin: 2,
      lines: [
        "Welcome to Coconut Cove! You can walk or drive here over the sandy causeway.",
        "Climb the little hill for a star, and look inside the forest for treasure!",
      ],
    },
    {
      name: "Chef Chili", x: 45.5, y: 0.3, z: -61, outfit: 0, hat: 1, skin: 4,
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
      name: "Blorp", x: -3.5, y: 0, z: -24, outfit: 5, hat: 1, skin: 5,
      lines: [
        "Blorp says hi! Our moon base doors are open. Come inside!",
        "That blue ball in the sky is your home. Pretty, isn't it?",
      ],
    },
  ],
};
LEVELS.push(MOON);

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

  private portalTorus: THREE.Mesh | null = null;
  private portalDisc: THREE.Mesh | null = null;
  private clouds: THREE.Group[] = [];
  private snow: THREE.Points | null = null;
  private ocean: THREE.Mesh | null = null;
  private oceanY = -7;
  private waveAmp = 0.1;
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

  /** The walk-in house whose room contains pos, or null. */
  private houseAt(pos: THREE.Vector3): House | null {
    for (const h of this.houses) {
      if (pos.x > h.minX && pos.x < h.maxX && pos.z > h.minZ && pos.z < h.maxZ && pos.y < h.topY) return h;
    }
    return null;
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
  private buildHouse(b: BuildingDef, index: number, trimMat: THREE.Material, doorMat: THREE.Material, winMat: THREE.Material): void {
    const floorY = this.groundAt(b.x, b.z, 2)?.y ?? 0;
    const hw = b.w / 2, hd = b.d / 2;
    const doorTop = floorY + 2.1;
    const side = (b.w - DOORWAY) / 2;
    const g = new THREE.Group();
    const shell = new THREE.Group();
    const room = new THREE.Group();
    const flat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
    const box = (parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // ── outside ──
    const bodyMat = flat(b.color);
    box(shell, bodyMat, b.w, b.h, WALL, 0, b.h / 2, -hd + WALL / 2);                 // back
    box(shell, bodyMat, WALL, b.h, b.d - 2 * WALL, -hw + WALL / 2, b.h / 2, 0);      // left
    box(shell, bodyMat, WALL, b.h, b.d - 2 * WALL, hw - WALL / 2, b.h / 2, 0);       // right
    box(shell, bodyMat, side, b.h, WALL, -hw + side / 2, b.h / 2, hd - WALL / 2);    // front, left of the door
    box(shell, bodyMat, side, b.h, WALL, hw - side / 2, b.h / 2, hd - WALL / 2);     // front, right of the door
    box(shell, bodyMat, DOORWAY, b.h - doorTop, WALL, 0, (b.h + doorTop) / 2, hd - WALL / 2); // above the door
    box(shell, bodyMat, b.w - 0.02, 0.2, b.d - 0.02, 0, b.h - 0.1, 0);               // roof slab
    box(shell, trimMat, b.w + 0.3, 0.25, b.d + 0.3, 0, b.h + 0.12, 0);
    for (const sx of [-1, 1]) {
      box(shell, doorMat, 0.14, doorTop, 0.12, (DOORWAY / 2 + 0.07) * sx, doorTop / 2, hd + 0.03, false); // door frame
      if (side > 0.9) box(shell, winMat, Math.min(0.8, side - 0.3), 0.7, 0.06, (DOORWAY / 2 + side / 2) * sx, floorY + 1.45, hd + 0.03, false);
    }
    box(shell, doorMat, DOORWAY + 0.28, 0.14, 0.12, 0, doorTop + 0.07, hd + 0.03, false);

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
    // bed in the back-left corner
    if (iw >= 3.2 && id >= 3.2) {
      const bx = -hw + WALL + 0.55, bz = -hd + WALL + 0.95;
      box(room, flat(0xc98a5b), 1.0, 0.3, 1.8, bx, floorY + 0.2, bz);
      box(room, flat(RUG_COLORS[(index + 2) % RUG_COLORS.length]), 1.0, 0.14, 1.25, bx, floorY + 0.42, bz + 0.27);
      box(room, flat(0xffffff), 0.8, 0.14, 0.4, bx, floorY + 0.42, bz - 0.65);
      furniture(bx - 0.5, bx + 0.5, bz - 0.9, bz + 0.9, floorY + 0.6);
    }
    // bookshelf on the back wall, to the right
    {
      const sx = hw - WALL - 0.75, sz = -hd + WALL + 0.2;
      box(room, flat(0x8a5a33), 1.3, 1.5, 0.36, sx, floorY + 0.75, sz);
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 4; k++) {
          box(room, flat(RUG_COLORS[(index + r + k) % RUG_COLORS.length]), 0.2, 0.3, 0.06, sx - 0.42 + k * 0.28, floorY + 0.32 + r * 0.45, sz + 0.19, false);
        }
      }
      furniture(sx - 0.65, sx + 0.65, sz - 0.2, sz + 0.2, floorY + 1.5);
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
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xc98a5b, flatShading: true, roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true, roughness: 1 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: def.foliage, flatShading: true, roughness: 0.85 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xb8bec9, flatShading: true, roughness: 1 });

    // ── Islands ────────────────────────────────────────────────────────────
    for (const d of def.discs) {
      const island = new THREE.Group();
      const topGeo = new THREE.CylinderGeometry(d.r, d.r * 0.96, 0.4, 28);
      const top = new THREE.Mesh(topGeo, d.color === undefined ? grassMat
        : new THREE.MeshStandardMaterial({ color: d.color, flatShading: true, roughness: 0.95 }));
      top.position.y = -0.2;
      top.receiveShadow = true;
      top.castShadow = true;
      island.add(top);

      const depth = 2.4 + d.r * 0.35;
      const botGeo = new THREE.CylinderGeometry(d.r * 0.95, d.r * 0.25, depth, 28);
      const bot = new THREE.Mesh(botGeo, dirtMat);
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
        const tree = makeTree(trunkMat, foliageMat, 0.8 + rng() * 0.5);
        tree.position.set(d.x + Math.cos(a) * rr, d.y, d.z + Math.sin(a) * rr);
        tree.rotation.y = rng() * Math.PI * 2;
        this.group.add(tree);
      }
      const flowerCount = d.flowers ?? 0;
      for (let i = 0; i < flowerCount; i++) {
        const a = rng() * Math.PI * 2;
        const rr = d.r * (0.3 + rng() * 0.55);
        const flower = makeFlower(pick(rng, def.flowerColors));
        flower.position.set(d.x + Math.cos(a) * rr, d.y, d.z + Math.sin(a) * rr);
        this.group.add(flower);
      }
      const rockCount = d.rocks ?? 0;
      for (let i = 0; i < rockCount; i++) {
        const a = rng() * Math.PI * 2;
        const rr = d.r * (0.5 + rng() * 0.3);
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.25, 0), rockMat);
        rock.position.set(d.x + Math.cos(a) * rr, d.y + 0.15, d.z + Math.sin(a) * rr);
        rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        rock.castShadow = true;
        this.group.add(rock);
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
    if (def.roads) {
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a93a6, flatShading: true, roughness: 1 });
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xfff6e5, roughness: 0.9 });
      for (const r of def.roads) {
        const road = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.06, r.d), roadMat);
        road.position.set(r.x, 0.03, r.z);
        road.receiveShadow = true;
        this.group.add(road);
        // dashed center line
        const along = r.w > r.d ? "x" : "z";
        const len = along === "x" ? r.w : r.d;
        const dashes = Math.floor(len / 2.4);
        for (let i = 0; i < dashes; i++) {
          const dash = new THREE.Mesh(new THREE.BoxGeometry(along === "x" ? 1.1 : 0.16, 0.03, along === "x" ? 0.16 : 1.1), lineMat);
          const off = -len / 2 + 1.4 + i * 2.4;
          dash.position.set(r.x + (along === "x" ? off : 0), 0.075, r.z + (along === "x" ? 0 : off));
          this.group.add(dash);
        }
      }
      // fountain at the plaza center
      const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.5, 0.7, 20),
        new THREE.MeshStandardMaterial({ color: 0xb8bec9, flatShading: true, roughness: 0.9 }),
      );
      basin.position.set(0, 0.35, -8);
      basin.castShadow = true;
      this.group.add(basin);
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(1.9, 1.9, 0.15, 20),
        new THREE.MeshStandardMaterial({ color: 0x5cb8ff, roughness: 0.3 }),
      );
      water.position.set(0, 0.72, -8);
      this.group.add(water);
      // fountain rim is a tiny standable platform
      this.platforms.push({
        kind: "disc", x: 0, z: -8, r: 2.3, hw: 0, hd: 0, topY: 0.72, spring: 0,
        baseX: 0, baseZ: -8, dx: 0, dz: 0, mesh: basin, squashT: 0,
      });
      // and its sides are solid so you can't clip through the basin
      this.solids.push({ minX: -2.3, maxX: 2.3, minZ: -10.3, maxZ: -5.7, topY: 0.72 });
    }
    if (def.buildings) {
      const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.85 });
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a4a2b, flatShading: true, roughness: 0.9 });
      const winMat = new THREE.MeshStandardMaterial({ color: 0xfff6b8, flatShading: true, roughness: 0.4 });
      for (const [bi, b] of def.buildings.entries()) {
        if (b.enter) {
          this.buildHouse(b, bi, trimMat, doorMat, winMat);
          continue;
        }
        const g = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color: b.color, flatShading: true, roughness: 0.85 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), bodyMat);
        body.position.y = b.h / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.25, b.d + 0.3), trimMat);
        trim.position.y = b.h + 0.12;
        trim.castShadow = true;
        g.add(trim);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1), doorMat);
        door.position.set(0, 0.6, b.d / 2 + 0.03);
        g.add(door);
        // a couple of window strips on the front
        const rows = Math.max(1, Math.floor(b.h / 2.6));
        for (let i = 0; i < rows; i++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.62, 0.5, 0.06), winMat);
          win.position.set(0, 1.6 + i * 2.2, b.d / 2 + 0.03);
          g.add(win);
        }
        g.position.set(b.x, 0, b.z);
        this.group.add(g);
        // roof is landable
        this.platforms.push({
          kind: "box", x: b.x, z: b.z, r: 0, hw: b.w / 2 + 0.15, hd: b.d / 2 + 0.15, topY: b.h + 0.25, spring: 0,
          baseX: b.x, baseZ: b.z, dx: 0, dz: 0, mesh: g, squashT: 0,
        });
        // walls are solid
        this.solids.push({
          minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
          minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
          topY: b.h,
        });
      }
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
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 });
    const cloudCount = def.space ? 0 : def.buildings ? 10 : 6;
    for (let i = 0; i < cloudCount; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < puffs; j++) {
        const s = 0.9 + rng() * 1.2;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cloudMat);
        puff.position.set(j * 1.2 - puffs * 0.6, rng() * 0.5, rng() * 0.8 - 0.4);
        cloud.add(puff);
      }
      cloud.position.set((rng() - 0.5) * 110, 14 + rng() * 10, -rng() * 70 + 16);
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
          vertexColors: true, emissive: 0x06304e, roughness: 0.5, metalness: 0.05, flatShading: true,
          transparent: true, opacity: 0.93,
        }),
      );
      this.ocean.position.set(0, this.oceanY, -25);
      this.ocean.receiveShadow = true;
      this.group.add(this.ocean);
    }
    if (def.sea !== undefined) {
      // the sandy seabed: an invisible floor so kids wade instead of falling out of the world
      this.platforms.push({
        kind: "box", x: 0, z: -25, r: 0, hw: 400, hd: 400, topY: def.sea - 0.5, spring: 0,
        baseX: 0, baseZ: -25, dx: 0, dz: 0, mesh: new THREE.Object3D(), squashT: 0,
      });
    }

    // ── Space: stars all around and the Earth overhead ──
    if (def.space) {
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
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(22, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0x3f8fe0, fog: false }),
      );
      earth.position.set(70, 85, -150);
      this.group.add(earth);
      for (let i = 0; i < 7; i++) {
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

    scene.add(this.group);
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

  private disposeLevel(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
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

function makeTree(trunkMat: THREE.Material, foliageMat: THREE.Material, s: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.8 * s, 8), trunkMat);
  trunk.position.y = 0.4 * s;
  trunk.castShadow = true;
  g.add(trunk);
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.75 * s, 1.1 * s, 10), foliageMat);
  c1.position.y = 1.15 * s;
  c1.castShadow = true;
  g.add(c1);
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.55 * s, 0.9 * s, 10), foliageMat);
  c2.position.y = 1.75 * s;
  c2.castShadow = true;
  g.add(c2);
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
