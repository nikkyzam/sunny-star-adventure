/**
 * verses.ts — memory verses. One verse belongs to each level; after clearing the level the kid
 * reads it, then types it from memory before the next level opens (see boot.ts).
 *
 * Text: King James Version (public domain). To use other verses or another translation, edit
 * this list — nothing else needs to change. Verse i goes with level i (wrapping around).
 */

export interface Verse {
  ref: string;
  text: string;
}

export const VERSES: Verse[] = [
  { ref: "Genesis 1:1", text: "In the beginning God created the heaven and the earth." },
  { ref: "Psalm 118:24", text: "This is the day which the LORD hath made; we will rejoice and be glad in it." },
  { ref: "Psalm 56:3", text: "What time I am afraid, I will trust in thee." },
  { ref: "Psalm 23:1", text: "The LORD is my shepherd; I shall not want." },
  { ref: "Ephesians 4:32", text: "And be ye kind one to another." },
  { ref: "Psalm 136:1", text: "O give thanks unto the LORD; for he is good: for his mercy endureth for ever." },
  { ref: "1 John 4:19", text: "We love him, because he first loved us." },
  { ref: "Psalm 119:105", text: "Thy word is a lamp unto my feet, and a light unto my path." },
  { ref: "Philippians 4:13", text: "I can do all things through Christ which strengtheneth me." },
  {
    ref: "John 3:16",
    text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
  },
  { ref: "Psalm 19:1", text: "The heavens declare the glory of God; and the firmament sheweth his handywork." },
];

export function verseFor(level: number): Verse {
  return VERSES[((level % VERSES.length) + VERSES.length) % VERSES.length];
}

/** Lower-case words only: capitals, punctuation and extra spaces never count against a kid. */
function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
}

/** Same word, or (for longer words) one slip of the finger away from it. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  // edit distance ≤ 1
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export interface Grade {
  ok: boolean;
  /** The verse's own words in order, each marked right (typed, in order) or still missing. */
  words: { word: string; ok: boolean }[];
}

/**
 * Check what the kid typed against the verse. Every word of the verse must be there, in order;
 * capitals and punctuation are ignored and small spelling slips in long words are forgiven.
 */
export function grade(typed: string, verse: Verse): Grade {
  const want = words(verse.text);
  const got = words(typed);
  // longest common subsequence (with forgiving word matching) marks which verse words were typed
  const n = want.length, m = got.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = sameWord(want[i], got[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const hit = new Array<boolean>(n).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (sameWord(want[i], got[j])) { hit[i] = true; i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  // show the verse's original spelling (with its capitals) in the feedback
  const shown = verse.text.replace(/[^A-Za-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  return {
    ok: hit.every(Boolean) && m <= n + 2,
    words: shown.map((word, i) => ({ word, ok: hit[i] })),
  };
}
