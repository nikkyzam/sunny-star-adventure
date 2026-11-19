/**
 * stickers.ts — the Sunny Castle sticker book: one sticker for each thing to do at the castle.
 * Kept on this device only (localStorage), so a kid's collection lasts between visits.
 */

import { storage } from "./storage";

export const CASTLE_STICKERS = [
  { id: "throne", icon: "👑", name: "Sit on the throne" },
  { id: "feast", icon: "🍰", name: "Eat at the royal banquet" },
  { id: "bell", icon: "🔔", name: "Ring the bell" },
  { id: "rings", icon: "🏇", name: "Ride through all the rings" },
  { id: "dragon", icon: "🐉", name: "Fly with Sparky" },
  { id: "slide", icon: "🛝", name: "Whoosh down the slide" },
  { id: "fireworks", icon: "🎆", name: "Light the fireworks" },
  { id: "helmet", icon: "🛡️", name: "Wear the knight's helmet" },
  { id: "song", icon: "🎵", name: "Play the singing stones" },
  { id: "treasure", icon: "💰", name: "Open the king's treasure" },
  { id: "peacock", icon: "🦚", name: "Pat a peacock" },
  { id: "bouncy", icon: "🎈", name: "Ten bounces in a row" },
  { id: "catapult", icon: "🎯", name: "Hit the target raft" },
  { id: "bread", icon: "🍞", name: "Bake and eat bread" },
  { id: "puppets", icon: "🎭", name: "Watch the puppet show" },
  { id: "garden", icon: "🌸", name: "Make the garden bloom" },
  { id: "swing", icon: "🌳", name: "Ride the rope swing" },
  { id: "fish", icon: "🐟", name: "Catch a fish" },
  { id: "fish5", icon: "🐠", name: "Catch all five fish" },
  { id: "sandcastle", icon: "🏖️", name: "Build a sandcastle" },
] as const;

export type StickerId = (typeof CASTLE_STICKERS)[number]["id"];

const KEY = "castleStickers";

export class StickerBook {
  private got = new Set<string>(storage.get<string[]>(KEY, []));

  has(id: StickerId): boolean { return this.got.has(id); }
  get count(): number { return CASTLE_STICKERS.filter((s) => this.got.has(s.id)).length; }
  get total(): number { return CASTLE_STICKERS.length; }

  /** Stick one in. True if it's new. */
  award(id: StickerId): boolean {
    if (this.got.has(id)) return false;
    this.got.add(id);
    storage.set(KEY, [...this.got]);
    return true;
  }
}
