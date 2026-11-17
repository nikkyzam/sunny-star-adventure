/**
 * interact.ts — little things to do with the scenery (E / the action button):
 *   shake a tree (leaves fly, the first shake drops a coin or an apple),
 *   look under a rock (a bug, a shiny pebble…), pick a flower (hearts and a sweet smell).
 * Each spot gives its small reward once per visit to a level; after that it's just for fun.
 */

import * as THREE from "three";

export type SpotKind = "tree" | "rock" | "flower";

interface Spot {
  t: SpotKind;
  x: number; y: number; z: number;
  used: boolean;
}

/** How close a kid has to stand (from the middle of the thing). */
const REACH: Record<SpotKind, number> = { tree: 1.7, rock: 1.3, flower: 0.9 };

const UNDER_ROCK = [
  "A ladybug! 🐞 She waves hello with her tiny legs.",
  "A wiggly worm 🪱, helping the garden grow!",
  "A shiny pebble ✨. You put it in your pocket.",
  "A sleepy beetle 🪲. Shh, let him rest!",
  "An ant parade 🐜🐜🐜, carrying crumbs home.",
  "A snail 🐌, slowly going on an adventure.",
];
const FROM_TREE = [
  "An apple fell down! 🍎 Crunch!",
  "Leaves everywhere! 🍃 And a coin fell out!",
  "A bird says tweet! 🐦 Sorry for shaking your house!",
  "A pinecone bonks the ground 🌰",
];

export interface SpotAction {
  label: string;
  icon: string;
  t: SpotKind;
  x: number; y: number; z: number;
  /** What happened: a line to show and how many coins it gave. */
  act(): { text: string; coins: number };
}

export class Spots {
  private spots: Spot[] = [];
  private n = 0;

  build(list: { t: SpotKind; x: number; y: number; z: number }[]): void {
    this.spots = list.map((s) => ({ ...s, used: false }));
  }

  /** The nearest thing within reach of pos, or null. */
  near(pos: THREE.Vector3): SpotAction | null {
    let best: Spot | null = null, bd = Infinity;
    for (const s of this.spots) {
      if (Math.abs(s.y - pos.y) > 1.6) continue;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < REACH[s.t] && d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    const s = best;
    const label = s.t === "tree" ? "Shake the tree" : s.t === "rock" ? "Look under the rock" : "Smell the flower";
    const icon = s.t === "tree" ? "🌳" : s.t === "rock" ? "🪨" : "🌸";
    return {
      label, icon, t: s.t, x: s.x, y: s.y, z: s.z,
      act: () => {
        const first = !s.used;
        s.used = true;
        const i = this.n++;
        if (s.t === "flower") return { text: first ? "Mmm, it smells so sweet! 🌸" : "Still smells lovely 🌼", coins: 0 };
        if (s.t === "rock") return { text: first ? UNDER_ROCK[i % UNDER_ROCK.length] : "Just dirt now. The bug went home! 🏡", coins: first && i % 3 === 2 ? 1 : 0 };
        return { text: first ? FROM_TREE[i % FROM_TREE.length] : "Rustle rustle… nothing else up there 🍃", coins: first ? 1 : 0 };
      },
    };
  }
}
