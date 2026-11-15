/**
 * verses.ts — memory verses. One verse belongs to each level; after clearing the level the kid
 * reads it, then types it from memory before the next level opens (see boot.ts).
 *
 * LIBRARY is every verse the game knows, grouped by topic: a teacher or parent picks this week's
 * verses from it (lesson.ts). Kids' devices swap picks as positions in this list, so only ever add
 * new verses at the end.
 *
 * Text: King James Version (public domain).
 */

export interface Verse {
  ref: string;
  text: string;
}

export const TOPICS = [
  "God's love", "Trust and courage", "Praise and thanks", "God made everything",
  "God's Word", "Kind and obedient", "Jesus saves", "Prayer and promises",
] as const;

export interface LibraryVerse extends Verse {
  /** Position in TOPICS. */
  topic: number;
}

const v = (topic: number, ref: string, text: string): LibraryVerse => ({ topic, ref, text });

export const LIBRARY: LibraryVerse[] = [
  // ── the game's own level verses (levels 1–11, in this order) ──
  v(3, "Genesis 1:1", "In the beginning God created the heaven and the earth."),
  v(2, "Psalm 118:24", "This is the day which the LORD hath made; we will rejoice and be glad in it."),
  v(1, "Psalm 56:3", "What time I am afraid, I will trust in thee."),
  v(1, "Psalm 23:1", "The LORD is my shepherd; I shall not want."),
  v(5, "Ephesians 4:32a", "And be ye kind one to another."),
  v(2, "Psalm 136:1", "O give thanks unto the LORD; for he is good: for his mercy endureth for ever."),
  v(0, "1 John 4:19", "We love him, because he first loved us."),
  v(4, "Psalm 119:105", "Thy word is a lamp unto my feet, and a light unto my path."),
  v(1, "Philippians 4:13", "I can do all things through Christ which strengtheneth me."),
  v(0, "John 3:16", "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."),
  v(3, "Psalm 19:1", "The heavens declare the glory of God; and the firmament sheweth his handywork."),

  // ── God's love ──
  v(0, "1 John 4:8", "He that loveth not knoweth not God; for God is love."),
  v(0, "Romans 5:8", "But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us."),
  v(0, "John 15:12", "This is my commandment, That ye love one another, as I have loved you."),
  v(0, "1 John 4:7", "Beloved, let us love one another: for love is of God; and every one that loveth is born of God, and knoweth God."),
  v(0, "John 13:34", "A new commandment I give unto you, That ye love one another; as I have loved you, that ye also love one another."),
  v(0, "Lamentations 3:22-23", "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness."),
  v(0, "Romans 8:28", "And we know that all things work together for good to them that love God, to them who are the called according to his purpose."),

  // ── Trust and courage ──
  v(1, "Proverbs 3:5", "Trust in the LORD with all thine heart; and lean not unto thine own understanding."),
  v(1, "Proverbs 3:6", "In all thy ways acknowledge him, and he shall direct thy paths."),
  v(1, "Joshua 1:9", "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest."),
  v(1, "Isaiah 41:10", "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness."),
  v(1, "Psalm 46:1", "God is our refuge and strength, a very present help in trouble."),
  v(1, "Psalm 27:1", "The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?"),
  v(1, "2 Timothy 1:7", "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind."),
  v(1, "Psalm 121:2", "My help cometh from the LORD, which made heaven and earth."),
  v(1, "Nahum 1:7", "The LORD is good, a strong hold in the day of trouble; and he knoweth them that trust in him."),
  v(1, "Deuteronomy 31:6", "Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee."),
  v(1, "1 Peter 5:7", "Casting all your care upon him; for he careth for you."),
  v(1, "Isaiah 40:31", "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint."),

  // ── Praise and thanks ──
  v(2, "Psalm 100:1", "Make a joyful noise unto the LORD, all ye lands."),
  v(2, "Psalm 100:2", "Serve the LORD with gladness: come before his presence with singing."),
  v(2, "Psalm 150:6", "Let every thing that hath breath praise the LORD. Praise ye the LORD."),
  v(2, "1 Thessalonians 5:18", "In every thing give thanks: for this is the will of God in Christ Jesus concerning you."),
  v(2, "Philippians 4:4", "Rejoice in the Lord alway: and again I say, Rejoice."),
  v(2, "Psalm 34:8", "O taste and see that the LORD is good: blessed is the man that trusteth in him."),
  v(2, "Psalm 103:1", "Bless the LORD, O my soul: and all that is within me, bless his holy name."),
  v(2, "Psalm 122:1", "I was glad when they said unto me, Let us go into the house of the LORD."),

  // ── God made everything ──
  v(3, "Psalm 139:14", "I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well."),
  v(3, "Genesis 1:27", "So God created man in his own image, in the image of God created he him; male and female created he them."),
  v(3, "Psalm 24:1", "The earth is the LORD's, and the fulness thereof; the world, and they that dwell therein."),
  v(3, "John 1:3", "All things were made by him; and without him was not any thing made that was made."),

  // ── God's Word ──
  v(4, "Psalm 119:11", "Thy word have I hid in mine heart, that I might not sin against thee."),
  v(4, "2 Timothy 3:16", "All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness:"),
  v(4, "Matthew 4:4", "But he answered and said, It is written, Man shall not live by bread alone, but by every word that proceedeth out of the mouth of God."),
  v(4, "Isaiah 40:8", "The grass withereth, the flower fadeth: but the word of our God shall stand for ever."),
  v(4, "James 1:22", "But be ye doers of the word, and not hearers only, deceiving your own selves."),
  v(4, "Matthew 24:35", "Heaven and earth shall pass away, but my words shall not pass away."),

  // ── Kind and obedient ──
  v(5, "Ephesians 4:32", "And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ's sake hath forgiven you."),
  v(5, "Ephesians 6:1", "Children, obey your parents in the Lord: for this is right."),
  v(5, "Colossians 3:20", "Children, obey your parents in all things: for this is well pleasing unto the Lord."),
  v(5, "Exodus 20:12", "Honour thy father and thy mother: that thy days may be long upon the land which the LORD thy God giveth thee."),
  v(5, "Luke 6:31", "And as ye would that men should do to you, do ye also to them likewise."),
  v(5, "Matthew 5:16", "Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven."),
  v(5, "Matthew 22:37", "Jesus said unto him, Thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind."),
  v(5, "Galatians 5:22-23", "But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, Meekness, temperance: against such there is no law."),
  v(5, "Proverbs 15:1", "A soft answer turneth away wrath: but grievous words stir up anger."),
  v(5, "Colossians 3:23", "And whatsoever ye do, do it heartily, as to the Lord, and not unto men;"),
  v(5, "Psalm 133:1", "Behold, how good and how pleasant it is for brethren to dwell together in unity!"),
  v(5, "Proverbs 17:17", "A friend loveth at all times, and a brother is born for adversity."),
  v(5, "Micah 6:8", "He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?"),
  v(5, "1 Corinthians 10:31", "Whether therefore ye eat, or drink, or whatsoever ye do, do all to the glory of God."),
  v(5, "Proverbs 20:11", "Even a child is known by his doings, whether his work be pure, and whether it be right."),
  v(5, "1 Timothy 4:12", "Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity."),

  // ── Jesus saves ──
  v(6, "John 14:6", "Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me."),
  v(6, "Romans 3:23", "For all have sinned, and come short of the glory of God;"),
  v(6, "Romans 6:23", "For the wages of sin is death; but the gift of God is eternal life through Jesus Christ our Lord."),
  v(6, "Romans 10:9", "That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved."),
  v(6, "Acts 16:31", "And they said, Believe on the Lord Jesus Christ, and thou shalt be saved, and thy house."),
  v(6, "Ephesians 2:8", "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God:"),
  v(6, "John 8:12", "Then spake Jesus again unto them, saying, I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life."),
  v(6, "John 10:11", "I am the good shepherd: the good shepherd giveth his life for the sheep."),
  v(6, "Luke 2:11", "For unto you is born this day in the city of David a Saviour, which is Christ the Lord."),
  v(6, "Matthew 28:6", "He is not here: for he is risen, as he said. Come, see the place where the Lord lay."),
  v(6, "Matthew 19:14", "But Jesus said, Suffer little children, and forbid them not, to come unto me: for of such is the kingdom of heaven."),
  v(6, "1 John 1:9", "If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness."),
  v(6, "John 1:1", "In the beginning was the Word, and the Word was with God, and the Word was God."),
  v(6, "John 11:35", "Jesus wept."),
  v(6, "Hebrews 13:8", "Jesus Christ the same yesterday, and to day, and for ever."),
  v(6, "John 14:15", "If ye love me, keep my commandments."),
  v(6, "2 Corinthians 5:17", "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new."),
  v(6, "Luke 2:52", "And Jesus increased in wisdom and stature, and in favour with God and man."),
  v(6, "Mark 16:15", "And he said unto them, Go ye into all the world, and preach the gospel to every creature."),

  // ── Prayer and promises ──
  v(7, "Philippians 4:6", "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God."),
  v(7, "1 Thessalonians 5:17", "Pray without ceasing."),
  v(7, "Matthew 7:7", "Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you:"),
  v(7, "Jeremiah 33:3", "Call unto me, and I will answer thee, and shew thee great and mighty things, which thou knowest not."),
  v(7, "Psalm 145:18", "The LORD is nigh unto all them that call upon him, to all that call upon him in truth."),
  v(7, "Psalm 51:10", "Create in me a clean heart, O God; and renew a right spirit within me."),
  v(7, "Matthew 6:33", "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you."),
  v(7, "Psalm 4:8", "I will both lay me down in peace, and sleep: for thou, LORD, only makest me dwell in safety."),
  v(7, "Psalm 37:4", "Delight thyself also in the LORD; and he shall give thee the desires of thine heart."),
  v(7, "Jeremiah 29:11", "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end."),
  v(7, "Psalm 91:11", "For he shall give his angels charge over thee, to keep thee in all thy ways."),
  v(7, "Philippians 4:19", "But my God shall supply all your need according to his riches in glory by Christ Jesus."),
  v(7, "Psalm 46:10", "Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth."),
  v(7, "Numbers 6:24", "The LORD bless thee, and keep thee:"),
];

/** The game's own verses: verse i goes with level i (wrapping around). */
export const VERSES: Verse[] = LIBRARY.slice(0, 11);

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
