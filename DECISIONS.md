# Decisions log

A running record of what was added to Sunny Star Adventure, and why, for the decisions made
without stopping to ask. Newest first. Live game: https://nikkyzam.github.io/sunny-star-adventure/

## 2026-11-23: fixes from a code review of the realism work

- **The lighthouse star was hidden inside the new red dome.** It now floats on the gallery, beside the lantern room.
- **Kids could stand inside the lantern room.** The lantern is now solid. A kid landing near it is nudged out onto the gallery, and the very top of the dome is a little perch.
- **The cargo helicopter flew through the dome.** The Sky cargo drop over the lighthouse is now above the dome.
- **The lighthouse is round, but its collision was square.** It now uses a smaller box inside the round wall, so there's no invisible wall at the corners. The stone footing is tighter.
- **The lighthouse door and windows floated off the curved wall.** They're now bent onto the curve and sit flush.
- **The lighthouse beam only checked the time when the island loaded.** It now checks every couple of seconds, so it comes on at 5:30 pm even mid-game.
- **Front windows flickered against the door frame on narrow houses.** They're now sized to fit between the door frame and the corner, and sit just above the flower box.
- **Animals:** smoothing now keeps sharp features (eyes, hooves, ear rims) crisp and only rounds gentle curves.
- **Palm trees:** they share one set of pieces, and level changes no longer throw those away and rebuild them (less stutter on iPads).
- **Tidy-up:** removed an unused window material.
- **Tests:** the nature picture test now checks that the lighthouse star is reachable, and that a kid on top lands on the gallery or the dome, never inside the lantern.

## 2026-11-20 (later): a real lighthouse

- The lighthouse was a square grey brick block. It's now a real one:
  - a round tower that narrows as it rises, painted in red and white bands, on a stone footing
  - a blue arched door and small arched windows climbing round it
  - a railed iron gallery at the top, where kids still land after the spring
  - a glass lantern room with a glowing lamp, a red dome and a ball on top
- **Decided:** the lamp turns all the time, but its sweeping beam only shows in the golden evening, as with a real lighthouse. It fades out softly along its length.
- The tower's size, the spring to the top and Keeper Kai's quest are unchanged.
- The lighthouse postcard now aims higher, so the lantern is in the picture.

## 2026-11-20: real windows, a proper village church, real harvest dressing (realism, round 2)

**Windows that look like glass**
- Every house pane now shows the sky reflected (bright at the top, darker room behind) with two soft glints, instead of flat blue.
- The pale-yellow cards stuck either side of each front door were replaced by real framed windows with glass and glazing bars, sized to fit the wall.
- Flower boxes now hold a bushy row of small rounded leaves with flowers peeping out, instead of three faceted green blobs.

**The village church (and Sunshine Chapel) look like real churches**
- Tall round-topped stained-glass windows in stone surrounds, on the front and both sides. Each window has jewel-coloured panes, lead lines and a gold cross, and glows softly.
- A stained-glass rose window over the door.
- A stone arch over the doorway, with a carved wooden half-circle above the door.
- The steeple has arched belfry openings with louvres on all four sides, a moulded band, a taller eight-sided slate spire, and a gold cross on top.
- **Decided:** church windows are drawn in code (no image files), so the game stays small and works offline.

**Harvest dressing**
- The wheat sheaves were yellow cones that looked like giant crayons. Each is now about 46 real stalks pinched in at the string, splaying out at the feet and at the ears of wheat.
- Pumpkins have eight deep ribs, like real pumpkins.

**Nature**
- Palm trees were three straight cylinders with cone "leaves". Each is now a gently curving trunk of ringed bark, with a crown of eight long feathery fronds that arch and droop, and coconuts. The pieces are built once and shared, so palms cost no more to draw.
- Animals (horses, donkeys, cows, dogs, deer and the rest) were faceted "low-poly". Their coats are now smoothed when they load, so they look rounded and soft, and they still walk and gallop the same.
- Mushrooms were knee-high and grey. They're now a believable size.
- Bible-time robes and Bethlehem's rounded buildings use smooth shading now, so cloth folds look soft rather than cut from card.
- Grass is a touch less neon: a little more olive and less saturated, still bright and cheerful.
- **Kept stylised on purpose:** the rainbow, coins, stars and rings, because they're the game's playful landmarks.

## 2026-11-19 (evening): sightseeing, scooters, and a more real look (the user asked for these)

**Sightseeing photo spots 📸**
- There are six sights, each with painted footprints and a "📸 Photo spot" sign:
  - Sunny Castle
  - the Village Church
  - the view from Lookout Hill
  - the Lighthouse (by boat)
  - Sunset Island's pink tower (by boat)
  - the Rocket on Pine Island
- Stand on the footprints and press E. The kid turns round, the camera steps back so the sight rises up behind them, and a 3-2-1 countdown takes a postcard captioned with the sight's name.
- Each new sight gets a stamp in the passport (+5 coins). All six pays +25, with Psalm 24:1.
- The sign, ring and footprints hide during the photo so the picture is clean.
- The grown-ups' progress page lists the sights photographed.

**Kick scooters 🛴**
- Four colourful scooters are parked around Adventure Island: by the start, by the castle gate, at Coconut Cove and in the village.
- The kid stands on the deck (not seated), the scooter leans into turns, Space hops, and the 📣 button rings a bell instead of a horn.
- It's gentler than the car: a top speed of 8 m/s, against 13 for the car.
- **Decided:** scooters are single-rider, and you have to stand close (1.6 m) to hop on, so you don't board one by accident.

**Bicycles 🚲**
- Three bikes with spoked wheels, turning pedals and a wicker basket: by the start, by the church, and at the Pine Island cabin.
- The kid sits on the saddle with their hands on the bars. The bike leans into turns, and 📣 rings a bell.
- Top speed is 10 m/s, between the scooter (8) and the car (13). One rider only.

**A more real look**
- **Ground:** code-drawn grass and sand textures on every island, with blades, patches and grains, repeating about every 3.5 m, plus soil on the island sides. Grass colour is a touch softer and less neon.
- **Name tags:** villagers' name tags now show only when you're within about 10 m (they fade in), are hidden behind walls like real objects, and are a little smaller. Before, every name floated over everything, through walls, from any distance.
- **Castle:** all castle materials now use smooth shading instead of faceted low-poly.
- **Clouds:** soft, smooth fair-weather clouds with flat bottoms and piled-up tops, bigger and higher. Each cloud is one piece instead of 3 to 5 faceted balls.
- **Sea:** smooth, glossy water that catches the sky (before, it was faceted triangles), with white surf gently lapping round every sandy beach.
- **Scooter riders:** they hold the handlebar grips, leaning slightly forward, and the scooter is sized to the kids' height.
- **Postcards:** they no longer pick "Jesus wept" as their verse.
- **Creatures and toys:** smooth shading instead of facets for Sparky, pets, buddies, birds, hedgehogs, slimes, balls, pickups, chests, food, vehicles and ships.
- **Sparky:** rounder, with more detail in his body and head, and rounded joints so his tail bends smoothly.
- **Left faceted on purpose:** the world's rocks and terrain pieces. Low-detail rocks smooth-shaded look like lumpy potatoes, not stone.
- **Kept stylised on purpose:** collectables (coins, stars, sky rings). They are game pieces kids need to spot.

## Ideas to improve the whole game (ranked, 2026-11-19)

Most useful first. ✅ = done, 🔨 = being built now.

1. ✅ **Messages fit on screen.** Long messages, including every Bible verse, used to run off both sides of the screen and vanish after 2 seconds. They now wrap onto a few lines and stay up long enough to read, up to 8 seconds.
2. ✅ **Read to me 🗣️.** A button under the camera reads every message aloud, for kids who can't read yet.
   - It uses only the voice built into the device, so no text leaves it.
   - Off by default. The device remembers the choice.
3. ✅ **Castle sticker book.** There are 20 stickers, one for each castle activity.
   - A 🏰 counter in the top bar opens the book. Each sticker shows its name even before it's earned, so the book doubles as a to-do list.
   - A new sticker pops up in gold at the bottom of the screen.
   - Getting all 20 makes you a "Royal Explorer" and pays +50 coins.
   - Stickers are kept on the device only.
4. ✅ **"What can I do here?" sparkle.** Gold sparkles float over the nearest activity, within about 20 m, that this kid has no sticker for yet. Once the sticker is earned, the sparkles move on to the next thing.
5. ✅ **Smoother on iPads.** Measured with `scripts/perf-castle.mjs`. In the castle courtyard, draw calls went from about 1,650 to about 1,230 (−25%); at the gate, from about 1,690 to about 1,320.
   - **Castle:** still parts joined in a second pass, peacock feathers as painted cards, one-piece petals, and no shadows from tiny parts.
   - **Village houses:** each house's walls, roof and furniture are joined by colour. The dollhouse shell still hides as a whole when you walk in.
   - **Quest footprint trails:** a whole trail is one piece instead of up to 130.
   - **Left alone on purpose:** trees and plants are already instanced. Coins and stars move and get collected, so instancing them is riskier and they stay as they are.
6. ✅ **More puppet shows.** The theatre now takes turns between four shows:
   - **Noah's Ark** (Genesis 9:13)
   - **Jonah and the Big Fish** (Jonah 2:10)
   - **Daniel and the Lions** (Daniel 6:22), the gentle version, where an angel makes the lions fall asleep
   - **David the Shepherd Boy** (Psalm 23:1): his sheep, his harp, a lost lamb found, and a crown "one day"

   David's story is told through the shepherd side, not Goliath, to keep it gentle. Each Bible world already has its own David and Goliath job.
7. ✅ **A daily surprise.** The first play of each new day gives +10 coins and a "verse for today", which rotates through the verse library.
   - Days in a row earn +4 more each day, up to +30.
   - It's kept on the device only (no account), so it's safe and private.
   - The coins arrive at once, and the message comes a moment later so the controls tip doesn't hide it.
8. ✅ **Seasonal events.** The castle dresses up by the calendar, with no download or update needed. `?season=` in the address can force one.
   - **Harvest** (15 September to 30 November): pumpkins and wheat sheaves along the gate path, and a thanksgiving table. "Give thanks" shows Psalm 107:1 (+5 coins once per visit).
   - **Christmas** (1 December to 6 January): a tree by the well with presents, and fairy lights all round the battlements. "Light the tree" makes it glow, with Luke 2:11.
   - **Easter** (Palm Sunday to a week after Easter Sunday, worked out for each year): five painted eggs hidden round the castle (+5 each, +20 for all), with John 11:25.
   - It's harvest time right now, so players see the harvest dressing today.
9. ✅ **Grown-ups' progress page.** It's at the top of the parents' screen, behind the grown-up sum, under "📈 Progress on this device". It shows:
   - verses typed from memory, and which ones
   - worlds visited
   - castle stickers
   - Bible scrolls found
   - helper jobs done
   - days in a row
   - coins saved

   It's built only from what the device already remembers, and nothing is sent anywhere. It helps parents and teachers see the value, which matters for selling the game.
12. ✅ **Royal Explorer certificate.** Collecting all 20 castle stickers opens a printable certificate in the photo album: a crown, the 20 stickers, the date, and Matthew 25:21. The sticker book also gets a "🏆 Show my certificate" button.
   - **No name on it:** it has a blank line to write the child's name on once printed, so the game never asks for or stores a name.
   - **Saving is for grown-ups:** saving or printing goes through the same grown-up question as photos.
   - **Why:** it's something parents can print and show off, which helps word of mouth.
10. ✅ (gentle version) **Day and night.** Between 5:30 and 9 pm on the player's own clock, Adventure Island turns to a golden evening: a pink and lavender sky, a warm low sun, and rosy fog. `?time=dusk|day` can force it.
    - **No real darkness**, on purpose: small children must still see where they're going, and night-time already has its own world (Starlight Peak).
13. ✅ **Read to me covers villagers too.** What villagers say in their speech bubbles is read aloud, and long lines, such as a scroll's verse, stay up long enough to read (up to 10 seconds).
14. ✅ **Guard Gus knows the season.** He mentions the harvest table, the Christmas tree or the Easter eggs, depending on the time of year.
11. **Real-iPad test.** Still not done; it needs a real device.

**Why these first:**
- **Messages and Read to me** fix things that affected every player everywhere in the game. The cut-off verses were a real bug.
- **The sticker book and the sparkle** turn twenty separate castle toys into one adventure with a goal, which is what makes kids keep playing and parents see the value.

## 2026-11-19 — Sunny Castle, round 8: fishing jetty and sandcastle

**Added**
- **Fishing jetty.** A wooden jetty off the beach on the castle's south side.
  - Cast the line, watch the red bobber, then reel in when it bites.
  - There are five kinds of fish. Each one jumps up wriggling, then goes back in the sea, because we always let them go.
  - The first catch shows "I will make you fishers of people" (Matthew 4:19). Catching all five kinds pays +20 coins.
  - Too slow to reel in? "The fish got away! Cast again."
- **Sandcastle.** Built in four steps on the beach: a mound, a tower, four turrets, then a flag and shells.
  - Then a wave runs up the sand and washes it flat, with the wise and foolish builders (Matthew 7:24-27).
  - +10 coins the first time. Build it again as often as you like.

**Decisions**
- **Fish always go back.** That keeps it gentle; it's catching and admiring, not keeping.
- **The wave is the lesson.** The sandcastle washes away on purpose, because that's the parable. The castle melts softly rather than crashing, and building again is instant.

## 2026-11-19 — Sunny Castle, round 7: flower garden and rope swing

**Added**
- **Flower garden.** A raised bed of six sleepy buds outside the gate, to the right of the path.
  - Press E by a bud and a blue watering can flies over and sprinkles it. The bud grows tall and opens into a big flower: pink, yellow, purple, red, white or orange.
  - When all six bloom, three butterflies come, with +15 coins and "Consider the lilies of the field, how they grow" (Matthew 6:28).
- **Rope swing.** A wooden A-frame swing beside the helter-skelter.
  - Sit on it and it swings higher and higher, out over the meadow.
  - The first go shows "This is the day the Lord has made" (Psalm 118:24).
  - Push the stick, or press E / the hop-out button, to get off.

**Decisions**
- **One flower at a time.** The watering can waters one flower at a time, so kids see each one open. The garden pays once.
- **The swing pumps itself.** Small children can't time a pump, so it builds up on its own to a gentle top height of about 50°.
- **Placement.** The garden is in clear space by the gate, and the swing in the gap between the slide and the corner tower.

## 2026-11-19 — Sunny Castle, round 6: bread oven and puppet theatre

**Added**
- **Bread oven.** A brick dome oven with a fire and a smoking chimney, in the back-right corner of the courtyard. It sits between the keep stairs and the banquet table.
  - Press E to bake. After 4 seconds a bell rings and a golden loaf appears.
  - Eating the loaf gives +1 heart and "I am the bread of life" (John 6:35).
- **Puppet theatre.** A red booth with curtains, beside the throne, that plays Noah's Ark in about 17 seconds:
  - the ark sails in
  - the animals come two by two: giraffes, elephants and lions
  - the dove brings a leaf
  - a rainbow rises (Genesis 9:13)
  - Each scene shows a message. Watching the first show to the end pays +10 coins.

**Decisions**
- **Bread gives a heart, not coins.** It's food, like the apples, and it fits "bread of life".
- **One loaf at a time.** You have to eat it before baking another, which stops kids from spamming the oven.
- **Noah's Ark for the first show.** It's the best-known Bible story for small children, with animals and a rainbow and nothing frightening.
- **Only the first show pays.** Kids can rewatch as often as they like, but there's no coin farming.
- **Placement.** Both are tucked into empty corners of the courtyard. The golden key hidden behind the keep can still be reached.

## 2026-11-19 — Sunny Castle, round 5: bouncy castle and catapult

**Added**
- **Bouncy castle.** On the meadow behind the castle. Each bounce goes a bit higher, up to about 2.3 m.
  - The first bounce shows Acts 3:8.
  - Ten bounces in a row pays +5 coins, once per visit.
- **Pom-pom catapult.** Also behind the castle. It flings soft balls at a target raft drifting on the sea.
  - Each bullseye pays +5 coins; the first one shows Philippians 3:14.
  - A miss gives a tip to fling when the raft reaches the end of its trip.

**Decisions**
- **Soft pom-poms at a target.** Nothing is thrown at people or animals, to keep it gentle.
- **The raft moves.** That makes hitting it a timing skill rather than luck.
- **Fixed the bug the test found.** One press used to throw two balls.

## Earlier castle rounds (same week)
- **Round 4:** golden-key treasure hunt (5 keys, chest pays 60 coins, Matthew 6:21), and peacocks that fan their tails (Genesis 1:31).
- **Round 3:** armour-of-God helmet stand (Ephesians 6:11), and singing stones that play "Jesus Loves Me" (Psalm 96:1).
- **Round 2:** helter-skelter slide into the hay, and fireworks over the gate (Psalm 19:1).
- **Round 1:** throne and crown, royal banquet, knight's ring course on horseback (Joshua 1:9).

## Standing rules followed every round
- **Child safety:** no accounts, no free-text chat, no real names, and nothing uploaded. Grown-up features sit behind the maths gate.
- **Testing:** every new feature gets a picture test in `scripts/`. All playtests and picture tests are run before each deploy.
- **Not yet done:** nothing has been tried on a real iPad yet.
