/**
 * questdata.ts — the "find what was lost" quests, one per big world (see quests.ts for how they work).
 * Coordinates are world x / z; each giver is a villager in that level's npcs with `quest: id`.
 */

import type { QuestDef } from "./quests";

export const QUESTS: QuestDef[] = [
  {
    // Luke 15:4–6
    id: "lambs", level: "Adventure Island", giver: "Shepherd Sam", title: "The Lost Lambs", emoji: "🐑",
    model: "lamb", noun: "lamb",
    home: { x: 7, z: -11, look: "pen", sign: "🐑 Lost lambs? Ask me!" },
    intro: "Oh, I'm so glad you're here! Three of my little lambs wandered off. Will you help me find them?",
    finale: "All my lambs are safe! \"Rejoice with me; for I have found my sheep which was lost.\" (Luke 15:6) Jesus is like a good shepherd who looks for every lost one. Thank you, friend!",
    finds: [
      {
        name: "Snowy", pronoun: "her", trail: [-15, -14],
        clue: "Snowy loves hide-and-seek! She ran into the little woods west of here, past Farmer Fern's field. Follow her hoofprints, then search the bushes. Listen for a 'baa'!",
        puzzle: { t: "search", look: "bush", spots: [[-21.5, -15], [-27, -15.5], [-21, -21.5], [-26.5, -20.5], [-24, -23.5]], hidden: 3 },
      },
      {
        name: "Pebble", pronoun: "her", trail: [-50, -50],
        clue: "Keeper Kai saw Pebble trotting along the sandy path to Pine Island. There's an old well over there… oh dear, I hope she didn't fall in!",
        puzzle: { t: "crank", x: -65, z: -69.5 },
      },
      {
        name: "Clover", pronoun: "her", trail: [17, -15],
        clue: "Clover is a jumper! Grandma Gigi heard a 'baa' from up high in the village, near the blue house. How could a lamb get way up there? Maybe something bouncy can take you up too!",
        puzzle: { t: "reach", x: 23.8, z: -17.6, refY: 30 },
      },
    ],
  },
  {
    // Psalm 145:9
    id: "kittens", level: "Sunshine City", giver: "Granny Whiskers", title: "The Missing Kittens", emoji: "🐱",
    model: "kitten", noun: "kitten",
    home: { x: -7.5, z: 43.5, look: "basket", sign: "🐱 Lost kittens? Ask me!" },
    intro: "Oh my, oh my! My three kittens slipped out of their basket and ran off into the city. Could you help me bring them home?",
    finale: "All my kittens are home and cozy! \"The LORD is good to all: and his tender mercies are over all his works.\" (Psalm 145:9) God cares for every little creature, and so did you. Thank you, dear!",
    finds: [
      {
        name: "Mittens", pronoun: "her", trail: [-13, -7.5],
        clue: "Mittens loves boxes! I saw her paw prints going toward the crates behind the shops on the west side of the city, just past the fire station street. Look inside them and listen for a 'meow'!",
        puzzle: { t: "search", look: "crate", spots: [[-30, -7.6], [-27, -7.6], [-24, -7.6], [-21, -7.6], [-17.5, -7.6]], hidden: 1 },
      },
      {
        name: "Patches", pronoun: "him", trail: [12, 14],
        clue: "Patches always climbs too high! Someone heard a 'meow' from the roof of a tall building across the street from the plaza, on the east side. There's a trampoline right in front of it…",
        puzzle: { t: "reach", x: 19.5, z: 21, refY: 40 },
      },
      {
        name: "Tiger", pronoun: "her", trail: [0, -13],
        clue: "Tiger is playing chase with the puppies in Maple Park, north of the fountain! She's very fast, but she gets tired. Keep after her and catch her when she stops to rest!",
        puzzle: { t: "chase", x: 0, z: -24, r: 7 },
      },
    ],
  },
  {
    // Genesis 8:8–11
    id: "doves", level: "Noah's Ark", giver: "Shem", title: "Noah's Doves", emoji: "🕊️",
    model: "dove", noun: "dove",
    home: { x: -7.5, z: -11.5, look: "dovecote", sign: "🕊️ Lost doves? Ask me!" },
    intro: "My father Noah needs his doves, and three of them have flown off! Will you help me find them before we all go aboard?",
    finale: "All three doves are back! \"And the dove came in to him in the evening; and, lo, in her mouth was an olive leaf pluckt off.\" (Genesis 8:11) That's how Noah knew the flood was nearly over. Thank you!",
    finds: [
      {
        name: "Olive", pronoun: "her", trail: [-12, -12],
        clue: "Olive loves to sit up in the trees. Follow the white feathers to the little wood west of here, then look up in the trees. Listen for a soft 'coo'!",
        puzzle: { t: "trees", x: -22, z: -14, count: 5, hidden: 2 },
      },
      {
        name: "Pearl", pronoun: "her", trail: [-4, -16],
        clue: "Pearl wanted the best view on the whole island. Where is the highest place a dove could sit? Way up on top of the great ark! Find a way up there.",
        puzzle: { t: "reach", x: -1, z: -31, refY: 40 },
      },
      {
        name: "Sky", pronoun: "him", trail: [14, -6],
        clue: "Sky is a cheeky one! He's hopping about east of the little hill and flutters away when anyone comes close. He gets tired quickly though, so keep after him!",
        puzzle: { t: "chase", x: 24, z: -4, r: 4.5 },
      },
    ],
  },
  {
    // Jonah 1:5
    id: "cargo", level: "Jonah and the Big Fish", giver: "Sailor Sam", title: "The Lost Cargo", emoji: "📦",
    model: "crate", noun: "crate",
    home: { x: -6.5, z: 12.5, look: "pallet", sign: "📦 Lost cargo? Ask me!" },
    intro: "Ahoy! In the great storm we threw our cargo into the sea to make the ship lighter. Now the waves have washed it all over the place! Will you help me find three crates?",
    finale: "All the cargo is back! \"He maketh the storm a calm, so that the waves thereof are still.\" (Psalm 107:29) God stopped that storm, and you found our crates. Thank you, matey!",
    finds: [
      {
        name: "the fig crate", pronoun: "it", trail: [4, 9],
        clue: "The waves pushed the fig crate up onto the beach on the east side of Joppa and buried it in the sand! Dig in the sand mounds. You'll see something glint when you're close!",
        puzzle: { t: "search", look: "mound", spots: [[14, 2], [13, -6], [10, -10.5], [13.5, 7], [8.5, 12]], hidden: 2 },
      },
      {
        name: "the spice crate", pronoun: "it", trail: undefined,
        clue: "The spice crate floated far away, to the tiny island out at sea, west of where the big fish swims. You can't walk there. Take the boat at the end of the dock!",
        puzzle: { t: "reach", x: -30, z: 60, refY: 3 },
      },
      {
        name: "the wool crate", pronoun: "it", trail: [-6, 4],
        clue: "Someone found the wool crate on the shore and dragged it away. See the drag marks? Follow them and you'll find out which house they took it into!",
        puzzle: { t: "reach", x: -6, z: -5.5, refY: 1.5 },
      },
    ],
  },
  {
    // 1 Samuel 17:20, Psalm 23:1
    id: "sheep", level: "David and Goliath", giver: "Jesse", title: "David's Sheep", emoji: "🐑",
    model: "sheep", noun: "sheep",
    home: { x: -5, z: 4, look: "pen", sign: "🐑 David's sheep" },
    intro: "My son David left his sheep with a keeper to bring food to his brothers at the camp, and three of them wandered off! Will you find them for him?",
    finale: "All of David's sheep are safe! \"The LORD is my shepherd; I shall not want.\" (Psalm 23:1) David wrote that song. God takes care of us like a shepherd takes care of his sheep. Thank you!",
    finds: [
      {
        name: "Woolly", pronoun: "her", trail: [6, -38],
        clue: "Woolly went looking for juicy leaves in the thickets at the far south of the valley, past the little wood. Search the bushes there and listen for a 'baa'!",
        puzzle: { t: "search", look: "bush", spots: [[5, -46], [13.5, -45.5], [7.5, -53], [14, -52], [10, -57]], hidden: 3 },
      },
      {
        name: "Fluffy", pronoun: "him", trail: [4, -18],
        clue: "Fluffy crossed the brook and climbed all the way to the top of the hill on the Philistines' side! Don't worry, nobody there will hurt a little sheep. Go and bring him back.",
        puzzle: { t: "reach", x: 27, z: -24, refY: 3 },
      },
      {
        name: "Curly", pronoun: "her", trail: [-8, -32],
        clue: "Curly is skipping about in the valley south of King Saul's camp. She thinks it's a game! Chase her, and catch her when she runs out of puff.",
        puzzle: { t: "chase", x: -12, z: -42, r: 5 },
      },
    ],
  },
  {
    // Luke 15:8–9
    id: "coins", level: "Paradise Resort", giver: "Grandma Ruth", title: "The Lost Coins", emoji: "🪙",
    model: "coin", noun: "coin",
    home: { x: 8.8, z: 13.5, look: "table", sign: "🪙 Lost coins? Ask me!" },
    intro: "Oh dear me! I had ten silver coins and now three are missing. Jesus told a story about a woman just like me. She lit a lamp and swept the whole house until she found hers! Will you help me look?",
    finale: "All my coins are found! \"Rejoice with me; for I have found the piece which I had lost.\" (Luke 15:9) Jesus said heaven is that happy over every person who comes home to God. Thank you, sweetheart!",
    finds: [
      {
        name: "Shiny", pronoun: "it", trail: [-14, -18],
        clue: "Just like in Jesus' story, let's sweep the house! I was in the little cottage on the west side, near Manager Mia. Sweep the dusty corners inside until something shines!",
        puzzle: { t: "search", look: "dust", spots: [[-16, -25.5], [-12, -25.5], [-16, -22.8], [-12, -22.8], [-14, -24.2]], hidden: 1, refY: 2 },
      },
      {
        name: "Sparkle", pronoun: "it", trail: [4, 16],
        clue: "I took a nap on the beach and Sparkle must have rolled into the sand! Dig in the sand mounds along the beach. Getting warmer or colder will help you!",
        puzzle: { t: "search", look: "mound", spots: [[-13, 16], [-10, 22], [10, 17.5], [13, 22], [-6, 25]], hidden: 3 },
      },
      {
        name: "Twinkle", pronoun: "it", trail: [-4, -1],
        clue: "A seagull snatched Twinkle! I saw it drop the coin at the very top of the water slide. Climb the steps all the way up and take a look!",
        puzzle: { t: "reach", x: -12, z: -4, refY: 30 },
      },
    ],
  },
  {
    // Matthew 2:1–11
    id: "gifts", level: "Bethlehem", giver: "Wise Man Caspar", title: "The Wise Men's Gifts", emoji: "🎁",
    model: "gift", noun: "gift",
    home: { x: -16, z: -21.4, look: "rug", sign: "🎁 Lost gifts? Ask me!" },
    intro: "We followed the star all the way from the East to find the newborn King! But last night our camels got frightened, and our three gifts for Him were lost. Will you help us find them?",
    finale: "All three gifts are here, just in time! \"They presented unto him gifts; gold, and frankincense, and myrrh.\" (Matthew 2:11) But the greatest gift of all is Jesus Himself: God's gift to the whole world. Thank you, friend, and merry Christmas!",
    finds: [
      {
        name: "the gold", pronoun: "it", trail: [-15, -18],
        clue: "The gold was in a little golden box. My camel was munching the hay bales round the stable when it bumped the box off its saddle! Search the hay, and look for a golden glint.",
        puzzle: { t: "search", look: "hay", spots: [[-9.5, -28], [-8, -31.5], [-22.5, -30.5], [-23, -24.5], [-10.5, -21.5]], hidden: 2 },
      },
      {
        name: "the frankincense", pronoun: "it", trail: [4, -17],
        clue: "The frankincense smells sweet, like perfume. Last night I took it up to the inn's flat roof to look at the star, and I left it there! Houses in Bethlehem have stairs up the outside. Can you find a way up?",
        puzzle: { t: "reach", x: 2.5, z: -23.5, refY: 20 },
      },
      {
        name: "the myrrh", pronoun: "it", trail: [3, 6],
        clue: "The myrrh is in a little red flask. Melchior stopped for a drink at the old well inside the town gate, and… plop! It fell right in. King David once longed for a drink from the well of Bethlehem! Turn the crank to bring the bucket up.",
        puzzle: { t: "crank", x: 9, z: 6 },
      },
    ],
  },
];
