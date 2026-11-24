# Selling Shine Like Stars and showing ads

The game is ready for kid-safe ads, but they are **switched off** until you connect an ad account.
Nothing changes for players until you do.

## What's already built in

- **Ad breaks only at natural pauses:** between levels (after the memory verse), after "Try again", and
  when going back to the title. Never during play and never in online games.
- **Rate limits:** no ad in the first 2 minutes, then at most one every 3 minutes. The ad networks
  apply their own limits too.
- **Child-directed and non-personalized:** every ad request asks for no interest-based ads and no tracking.
- **Sound:** the game goes quiet during an ad and comes back after.
- **No reward ads:** there is no "watch an ad for coins" button. Regulators look hard at pressuring
  children to watch ads, so it's left out on purpose.
- **Pages ad networks ask for:** `parents.html` (For parents) and `privacy.html` (privacy policy), linked
  from the title screen.

## Choose how to make money (pick one)

### Option A: publish on a kids game portal (recommended to start)

[Poki](https://developers.poki.com) and [CrazyGames](https://developer.crazygames.com) host the game,
bring the players, run the ads, and pay you a share of the ad money. They handle most of the
children's-privacy rules for their own sites. You apply with a link to the game. If they accept it,
build their version:

```bash
VITE_ADS=poki npm run build          # or VITE_ADS=crazygames
```

Then upload the `dist` folder through their developer dashboard. Use their test or sandbox mode first.

### Option B: your own website with Google AdSense (H5 Games Ads)

1. **Get your own domain** (for example `sunnystargame.com`) and point GitHub Pages at it. AdSense won't
   approve a `github.io` address, and `ads.txt` has to sit at the root of your domain.
2. **Apply for AdSense**, then ask for **H5 Games Ads** (the in-game ad format). In AdSense, mark the site
   as **directed to children**.
3. **`ads.txt` is written for you** when the build has your publisher ID. Check that it matches the
   line AdSense shows you: `google.com, pub-…, DIRECT, f08c47fec0942fa0`.
4. **Build with your publisher ID**, using test ads first:

   ```bash
   VITE_ADS=adsense VITE_ADSENSE_CLIENT=ca-pub-0000000000000000 VITE_ADS_TEST=on npm run build
   ```

   When the test ads look right, build again without `VITE_ADS_TEST`.
5. **Turn it on for the live site:** on GitHub, go to the repository's **Settings → Secrets and variables →
   Actions → Variables** and add `VITE_ADS` = `adsense` and `VITE_ADSENSE_CLIENT` = your `ca-pub-…` ID
   (add `VITE_ADS_TEST` = `on` to try test ads first). The deploy workflow already passes these to
   the build, so the next push turns ads on. Delete the variables to turn ads off again.

## Before you charge money or turn ads on: checklist

- [ ] **Get legal advice on the privacy policy.** `privacy.html` describes what the game really does, but
      it's a draft, not legal advice. A children's game with ads falls under COPPA (US) and GDPR-K/UK
      Children's Code (EU/UK). Have a lawyer or a privacy service review it.
- [ ] **Set up a real contact.** The privacy policy currently points to GitHub Issues. Add a support email
      address before you launch commercially.
- [ ] **Run your own online-play server.** Online play uses PeerJS's free public server, which isn't meant
      for commercial traffic. Run your own PeerServer (one small app) and point `src/game/net.ts` at it.
- [ ] **Check the licenses.** Everything is fine for commercial use:
  - 3D models: Quaternius, CC0 (`public/models/LICENSE-*.txt`).
  - Music: Abstraction/Tallbeard, CC0 (`public/music/LICENSE-Abstraction.txt`). The author asks that
    the music not be resold unmodified or used for NFTs or AI training, and a tip on Patreon is a
    kind thank-you once the game earns money.
  - Code libraries: three.js, PeerJS and React, all MIT.
  - Bible verses: King James Version. It's public domain in most countries. In the UK it's under
    Crown patent, which in practice permits quoting it in a game.
- [ ] **Pick the game's name.** Search for trademarks on "Shine Like Stars" before you spend money on
      branding.

## Churches, schools and homeschool groups

The game has a verse class mode: a teacher picks the memory verses, starts a class with a room code,
and sees which child has typed which verse from memory (see `parents.html`). That makes it something
a children's ministry or homeschool co-op can use as curriculum, and those groups pay for curriculum.

- A simple way to sell it: a yearly license per church or group, sold from your own website, with the
  ad-free build. Nothing in the game checks a license yet, so today this would be on trust.
- Before selling to groups, run your own online-play server (see the checklist above). A class of 12
  on the free public server is fine for trying it out, not for paying customers.
- The built-in verses were typed in from the King James Version. Have someone proofread
  `src/game/verses.ts` against a printed Bible before a church relies on them.

## Selling the game itself

Instead of ads you can sell or license it:

- **Portals sometimes pay up front** for exclusive rights (Poki and CrazyGames both have programs).
- **App stores:** wrap the web game with Capacitor for the iPhone/iPad App Store and Google Play. Apple's
  Kids category doesn't allow third-party ads without strict review, so a paid app (no ads) is the
  simpler route there.
