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

/** Hat choices shown on the title screen; index matches makeHat() in player.ts. */
export const HATS = ["🧢", "👑", "🐰", "🧙", "🌸"];

export const SKINS = [0xffd9b3, 0xf2c39a, 0xd9a273, 0xb07a50, 0x7d5236];

/** Pets that follow you everywhere; index matches makePet() in pets.ts (0 = no pet). */
export const PETS = ["🚫", "🐶", "🐱", "🐥", "🐲"];

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
  hat: number;
  skin: number;
  pet: number;
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

export function safeHat(v: unknown): number {
  return Number.isInteger(v) ? Math.abs(v as number) % HATS.length : 0;
}

export function safeSkin(v: unknown): number {
  return Number.isInteger(v) ? Math.abs(v as number) % SKINS.length : 0;
}

export function safePet(v: unknown): number {
  return Number.isInteger(v) ? Math.abs(v as number) % PETS.length : 0;
}

/** The full look of a kid: outfit colors plus skin tone. */
export function lookOf(outfit: number, skin: number): KidPalette {
  return { ...OUTFITS[outfit], skin: SKINS[skin] };
}

export function nameText(n: [number, number]): string {
  return `${NAME_ADJ[n[0]]} ${NAME_ANIMAL[n[1]]}`;
}

export function loadProfile(): Profile {
  const raw = storage.get<Partial<Profile> | null>(KEY, null);
  return {
    outfit: safeOutfit(raw?.outfit),
    hat: safeHat(raw?.hat),
    skin: safeSkin(raw?.skin),
    pet: raw?.pet === undefined ? 1 : safePet(raw.pet), // everyone starts with a puppy
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
