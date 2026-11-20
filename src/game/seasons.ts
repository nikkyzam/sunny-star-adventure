/**
 * seasons.ts — which season the castle dresses up for, from today's date:
 *   harvest    15 September – 30 November   pumpkins, sheaves and a thanksgiving table by the gate
 *   christmas  1 December – 6 January       a lit tree in the courtyard, lights along the battlements
 *   easter     Palm Sunday – a week after Easter Sunday   painted eggs hidden round the castle
 * `?season=harvest|christmas|easter|none` in the address overrides it (for testing and for fun).
 */

export type Season = "harvest" | "christmas" | "easter" | "none";

/** Easter Sunday (Gregorian), by the "Anonymous Gregorian" computus. */
export function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function seasonFor(now: Date): Season {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  if ((m === 12) || (m === 1 && d <= 6)) return "christmas";
  const easter = easterSunday(y);
  const day = new Date(y, m - 1, d).getTime(), e = easter.getTime(), DAY = 86400000;
  if (day >= e - 7 * DAY && day <= e + 7 * DAY) return "easter";
  if ((m === 9 && d >= 15) || m === 10 || m === 11) return "harvest";
  return "none";
}

export function currentSeason(): Season {
  try {
    const q = new URLSearchParams(location.search).get("season");
    if (q === "harvest" || q === "christmas" || q === "easter" || q === "none") return q;
  } catch { /* no location (tests in node) */ }
  return seasonFor(new Date());
}

/** A golden evening on Adventure Island when it's evening where the kid is (`?time=dusk|day` overrides). */
export function isDusk(now = new Date()): boolean {
  try {
    const q = new URLSearchParams(location.search).get("time");
    if (q === "dusk") return true;
    if (q === "day") return false;
  } catch { /* no location */ }
  const h = now.getHours() + now.getMinutes() / 60;
  return h >= 17.5 && h < 21;
}
