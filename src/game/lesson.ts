/**
 * lesson.ts — verses picked by a grown-up. A teacher or parent chooses this week's memory verses
 * from the library (verses.ts) and can add their own; the choice is saved on this device.
 *
 *   • "On this device": the picks replace the game's own level verses here, and kids can open the
 *     verse book any time to learn one for coins.
 *   • "Class": the teacher makes a room; every kid who joins with the code gets the same verses,
 *     and the teacher's screen shows who has typed which from memory.
 *
 * Child safety: through the game, only library verses travel to other devices, as positions in the
 * library, never as text. Verses a grown-up types in reach a class only inside the class link the
 * grown-up shares themselves (email, a message to parents): the link carries the verses, and a
 * device that opened it uses them. In a class room, kids only ever say "I did verse number 3".
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

// ── The class link ───────────────────────────────────────────────────────────

/** A short fingerprint of typed-in verses, so a class room can tell a kid has the same ones. */
export function ownHash(own: Verse[]): number {
  let h = 2166136261;
  for (const ch of JSON.stringify(own.map((v) => [v.ref, v.text]))) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

/** The plan as text for a link's ?class= part (URL-safe base64 of compact JSON). */
export function encodePlan(p: Plan): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ p: p.picks, o: p.own.map((v) => [v.ref, v.text]) }));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The plan carried by a page address (?class=…), or null. Everything in it is untrusted. */
export function planFromLink(search: string): Plan | null {
  const raw = new URLSearchParams(search).get("class");
  if (!raw || raw.length > 6000) return null;
  try {
    const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as { p?: unknown; o?: unknown };
    const own = Array.isArray(data.o)
      ? data.o.map((o) => (Array.isArray(o) ? cleanOwn(o[0], o[1]) : null)).filter((o): o is Verse => o !== null).slice(0, MAX_OWN)
      : [];
    const picks = safePicks(data.p);
    return picks.length + own.length > 0 ? { on: true, picks, own } : null;
  } catch {
    return null;
  }
}
