/**
 * profile.ts — the kid's look and name, plus kid-friendly settings (persisted locally).
 *
 * Names are never typed: they're built from two word lists and sent over the network as
 * indices, so nobody can put real names or unkind words above another kid's head.
 */

import type { KidPalette } from "./player";
import { storage } from "./storage";

export const OUTFITS: KidPalette[] = [
  { jacket: 0xff8c42, cap: 0xff4757, pants: 0x4a69bd },
  { jacket: 0x4ecbd9, cap: 0x4a69bd, pants: 0x6d5bd0 },
  { jacket: 0xff6b9d, cap: 0xb197fc, pants: 0x5cb8ff },
  { jacket: 0x7ed957, cap: 0xffd93d, pants: 0x8a5a33 },
  { jacket: 0xb197fc, cap: 0xff9ecf, pants: 0x4a3b6b },
  { jacket: 0xffd93d, cap: 0x5cb8ff, pants: 0x3fa34d },
];

export const NAME_ADJ = [
  "Bouncy", "Happy", "Sunny", "Zippy", "Giggly", "Sparkly", "Brave", "Fluffy",
  "Speedy", "Jolly", "Cosmic", "Silly", "Wiggly", "Snuggly", "Super", "Twinkly",
];
export const NAME_ANIMAL = [
  "Panda", "Bunny", "Otter", "Kitten", "Puppy", "Dino", "Koala", "Penguin",
  "Fox", "Owl", "Duckling", "Hedgehog", "Dolphin", "Tiger", "Llama", "Unicorn",
];

export interface Profile {
  outfit: number;
  name: [number, number];
  easy: boolean;
}

const KEY = "profile";

function randomName(): [number, number] {
  return [Math.floor(Math.random() * NAME_ADJ.length), Math.floor(Math.random() * NAME_ANIMAL.length)];
}

/** Clamp anything (local storage or a network message) to a valid name pair. */
export function safeName(v: unknown): [number, number] {
  const a = Array.isArray(v) ? v : [];
  const i = Number.isInteger(a[0]) ? (a[0] as number) : 0;
  const j = Number.isInteger(a[1]) ? (a[1] as number) : 0;
  return [Math.abs(i) % NAME_ADJ.length, Math.abs(j) % NAME_ANIMAL.length];
}

export function safeOutfit(v: unknown): number {
  return Number.isInteger(v) ? Math.abs(v as number) % OUTFITS.length : 0;
}

export function nameText(n: [number, number]): string {
  return `${NAME_ADJ[n[0]]} ${NAME_ANIMAL[n[1]]}`;
}

export function loadProfile(): Profile {
  const raw = storage.get<Partial<Profile> | null>(KEY, null);
  return {
    outfit: safeOutfit(raw?.outfit),
    name: raw?.name ? safeName(raw.name) : randomName(),
    easy: raw?.easy ?? true, // the youngest players shouldn't meet a game-over screen by default
  };
}

export function saveProfile(p: Profile): void {
  storage.set(KEY, p);
}

export function rerollName(p: Profile): void {
  p.name = randomName();
}
