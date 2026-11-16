/**
 * lessonui.ts — the DOM for the grown-up check, the teacher screen and the verse book
 * (their shells live in src/pages/Home.tsx). boot.ts owns the state and calls these to redraw.
 */

import { LIBRARY, TOPICS, type Verse } from "./verses";
import { MAX_PICKS, type Plan } from "./lesson";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing from Home.tsx`);
  return e as T;
}

function button(cls: string, text: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = text;
  b.addEventListener("click", (e) => { e.preventDefault(); b.blur(); onTap(); });
  return b;
}

function row(cls: string, ...kids: (HTMLElement | string)[]): HTMLDivElement {
  const d = document.createElement("div");
  d.className = cls;
  d.append(...kids);
  return d;
}

function span(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

// ── Grown-up check ─────────────────────────────────────────────────────────

export function showGate(question: string, onEnter: () => void): void {
  el("gate-question").textContent = question;
  el("gate-status").textContent = "";
  const input = el<HTMLInputElement>("gate-answer");
  input.value = "";
  input.onkeydown = (e) => { if (e.key === "Enter") onEnter(); };
}

export function gateAnswer(): number {
  return Number(el<HTMLInputElement>("gate-answer").value.trim());
}

export function setGateStatus(text: string): void {
  el("gate-status").textContent = text;
}

// ── Teacher screen ─────────────────────────────────────────────────────────

export interface TeachHandlers {
  togglePick(index: number): void;
  removeOwn(index: number): void;
}

let topic = -1; // -1 = every topic

export function drawTeach(plan: Plan, h: TeachHandlers): void {
  const total = plan.picks.length + plan.own.length;
  el("teach-count").textContent = total ? `(${total})` : "";

  const picked = el("teach-picked");
  picked.textContent = "";
  if (total === 0) picked.append(span("teach-empty", "None yet. Tap ➕ on a verse below."));
  plan.picks.forEach((i, n) => {
    picked.append(row("teach-row on",
      span("teach-n", `${n + 1}`), span("teach-ref", LIBRARY[i].ref), span("teach-text", LIBRARY[i].text),
      button("teach-btn remove", "✕", () => h.togglePick(i))));
  });
  plan.own.forEach((v, n) => {
    picked.append(row("teach-row on own",
      span("teach-n", `${plan.picks.length + n + 1}`), span("teach-ref", v.ref), span("teach-text", v.text),
      span("teach-tag", "this device"), button("teach-btn remove", "✕", () => h.removeOwn(n))));
  });

  const chips = el("teach-topics");
  chips.textContent = "";
  ["All", ...TOPICS].forEach((name, k) => {
    chips.append(button("teach-chip" + (k - 1 === topic ? " on" : ""), name, () => { topic = k - 1; drawTeach(plan, h); }));
  });

  const lib = el("teach-library");
  lib.textContent = "";
  const full = plan.picks.length >= MAX_PICKS;
  LIBRARY.forEach((v, i) => {
    if (topic >= 0 && v.topic !== topic) return;
    const on = plan.picks.includes(i);
    const b = button("teach-btn" + (on ? " remove" : ""), on ? "✓" : "➕", () => h.togglePick(i));
    b.disabled = !on && full;
    b.setAttribute("aria-label", `${on ? "Remove" : "Add"} ${v.ref}`);
    lib.append(row("teach-row" + (on ? " on" : ""), span("teach-ref", v.ref), span("teach-text", v.text), b));
  });

  el("btn-family").textContent = plan.on ? "🏠 Turn off on this device" : "🏠 Use on this device";
}

export function ownInput(): { ref: string; text: string } {
  return { ref: el<HTMLInputElement>("own-ref").value, text: el<HTMLTextAreaElement>("own-text").value };
}

export function clearOwnInput(): void {
  el<HTMLInputElement>("own-ref").value = "";
  el<HTMLTextAreaElement>("own-text").value = "";
}

/** Put the class link in its box, selected, ready to copy by hand if the clipboard is closed. */
export function showClassLink(url: string): void {
  const box = el<HTMLInputElement>("class-link");
  box.style.display = "";
  box.value = url;
  box.select();
}

export function setTeachStatus(text: string): void {
  el("teach-status").textContent = text;
}

/** The title-screen button says whether this device's verses are on. */
export function setTeachButton(plan: Plan, fromLink = 0): void {
  const n = plan.picks.length + plan.own.length;
  el("btn-teach").textContent = fromLink
    ? `📖 Your teacher's ${fromLink} verse${fromLink === 1 ? " is" : "s are"} on`
    : plan.on
    ? `📖 Your ${n} verse${n === 1 ? " is" : "s are"} on · change`
    : "👩‍🏫 Teachers & parents: pick the verses";
}

// ── Travel gate ────────────────────────────────────────────────────────────

export interface TravelRow { label: string; here: boolean; open: boolean }

export function drawTravel(rows: TravelRow[], onPick: (i: number) => void): void {
  const list = el("travel-list");
  list.textContent = "";
  rows.forEach((r, i) => {
    const b = button("book-verse" + (r.open ? " done" : ""), "", () => onPick(i));
    b.disabled = r.here;
    b.append(span("book-tick", r.here ? "📍" : r.open ? "🔓" : "🔒"), span("teach-ref", r.label),
      span("book-go", r.here ? "You are here" : r.open ? "Go ➜" : "Say a verse ➜"));
    list.append(b);
  });
}

// ── Verse book ─────────────────────────────────────────────────────────────

export interface BoardRow {
  name: string;
  /** One tick per class verse. */
  done: boolean[];
  here: boolean;
}

export function drawBook(verses: Verse[], done: (v: Verse) => boolean, note: string, onPick: (i: number) => void,
  klass: { code: string; rows: BoardRow[] } | null): void {
  el("book-note").textContent = note;
  const list = el("book-list");
  list.textContent = "";
  verses.forEach((v, i) => {
    const ok = done(v);
    const b = button("book-verse" + (ok ? " done" : ""), "", () => onPick(i));
    b.append(span("book-tick", ok ? "✅" : "⭕"), span("teach-ref", v.ref), span("book-go", ok ? "Practice again" : "Learn it ➜"));
    list.append(b);
  });

  el("book-class").style.display = klass ? "" : "none";
  if (!klass) return;
  el("book-code").textContent = `· room code ${klass.code} · ticks follow the order of the verses above`;
  const board = el("book-board");
  board.textContent = "";
  if (klass.rows.length === 0) {
    board.append(span("teach-empty", `No kids yet. They press "Play with friends" and type ${klass.code}.`));
    return;
  }
  for (const r of klass.rows) {
    const got = r.done.filter(Boolean).length;
    board.append(row("board-row" + (r.here ? "" : " gone"),
      span("board-name", r.here ? r.name : `${r.name} (left)`),
      span("board-ticks", r.done.map((d) => (d ? "✅" : "⬜")).join(" ")),
      span("board-count", `${got}/${r.done.length}`)));
  }
}
