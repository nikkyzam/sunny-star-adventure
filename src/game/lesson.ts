/**
 * lesson.ts — verses picked by a grown-up. A teacher or parent chooses this week's memory verses
 * from the library (verses.ts) and can add their own; the choice is saved on this device.
 *
 *   • "On this device": the picks replace the game's own level verses here, and kids can open the
 *     verse book any time to learn one for coins.
 *   • "Class": the teacher makes a room; every kid who joins with the code gets the same verses,
 *     and the teacher's screen shows who has typed which from memory.
 *
 * Child safety: only library verses travel to other devices, as positions in the library, never
 * as text. Verses a grown-up types in stay on the device they were typed on.
 */

import { storage } from "./storage";
import { LIBRARY, type Verse } from "./verses";

export const MAX_PICKS = 8;
export const MAX_OWN = 6;
/** A class fits more kids than a friends' room. */
export const CLASS_MAX_KIDS = 12;
/** Coins for typing a verse from memory for the first time ever. */
export const VERSE_PAY = 15;

export interface Plan {
  /** Use these verses on this device (false = the game's own verse for each level). */
  on: boolean;
  /** Library positions, in the order to learn them. */
  picks: number[];
  /** Verses typed in by a grown-up: this device only. */
  own: Verse[];
}

/** A list of library positions from storage or the network: whole numbers in range, no repeats. */
export function safePicks(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== "number" || !Number.isInteger(x) || x < 0 || x >= LIBRARY.length || out.includes(x)) continue;
    out.push(x);
    if (out.length >= MAX_PICKS) break;
  }
  return out;
}

const tidy = (s: unknown, max: number): string =>
  typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** A verse typed by a grown-up, tidied up; null when there isn't enough to learn. */
export function cleanOwn(ref: unknown, text: unknown): Verse | null {
  const r = tidy(ref, 40), t = tidy(text, 320);
  if (r.length < 2 || t.split(" ").length < 2) return null;
  return { ref: r, text: t };
}

export function loadPlan(): Plan {
  const raw = storage.get<Partial<Plan> | null>("lesson", null);
  const own = Array.isArray(raw?.own)
    ? raw.own.map((o) => cleanOwn(o?.ref, o?.text)).filter((o): o is Verse => o !== null).slice(0, MAX_OWN)
    : [];
  const picks = safePicks(raw?.picks);
  return { on: raw?.on === true && picks.length + own.length > 0, picks, own };
}

export function savePlan(p: Plan): void {
  storage.set("lesson", p);
}

/** The verses of a plan, library picks first. */
export function planVerses(p: Plan): Verse[] {
  return [...p.picks.map((i) => LIBRARY[i]), ...p.own];
}

/** Verses this kid has ever typed from memory on this device (they pay coins only once). */
export function loadMemorized(): Set<string> {
  const raw = storage.get<unknown>("memorized", []);
  return new Set(Array.isArray(raw) ? raw.filter((r): r is string => typeof r === "string").slice(0, 500) : []);
}

export function saveMemorized(s: Set<string>): void {
  storage.set("memorized", [...s]);
}

/** A sum only a grown-up is likely to know, to keep little fingers out of the teacher screen. */
export function makeGate(): { question: string; answer: number } {
  const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
  return { question: `${a} × ${b}`, answer: a * b };
}
