/**
 * ads.ts — optional, kid-safe ad breaks.
 *
 * Nothing here runs unless the site is built with an ad provider:
 *   VITE_ADS=adsense  VITE_ADSENSE_CLIENT=ca-pub-…   Google H5 Games Ads (your own site)
 *   VITE_ADS=poki                                     the Poki SDK (when the game is published on Poki)
 *   VITE_ADS=crazygames                               the CrazyGames SDK (when published on CrazyGames)
 * and VITE_ADS_TEST=on shows test ads only.
 *
 * The rules, whichever provider:
 *   • ads only at natural pauses (between levels, after a game over, back to the title), never
 *     while a kid is playing, and never in online play (friends would be left waiting);
 *   • none in the first two minutes, then at most one every three minutes (providers cap too);
 *   • requests are tagged child-directed and non-personalized (no interest-based ads, no tracking);
 *   • the game's sound is muted for the ad and comes back after;
 *   • no "watch an ad for a reward" buttons.
 */

type Provider = "none" | "adsense" | "poki" | "crazygames";

const PROVIDERS: Provider[] = ["none", "adsense", "poki", "crazygames"];
const asked = ((import.meta.env.VITE_ADS as string | undefined) || "none").toLowerCase() as Provider;
const PROVIDER: Provider = PROVIDERS.includes(asked) ? asked : "none";
const ADSENSE_CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined) ?? "";
const TEST = import.meta.env.VITE_ADS_TEST === "on";

const FIRST_AD_AFTER = 120; // seconds of play before the first ad
const BETWEEN_ADS = 180; // seconds between ads
const AD_TIMEOUT = 60; // never leave the game waiting longer than this for an ad that never ends

type BreakKind = "next" | "browse";

interface PokiSdk {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
}
interface CrazySdk {
  init(): Promise<void>;
  ad: { requestAd(kind: "midgame", cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }): void };
  game: { gameplayStart(): void; gameplayStop(): void; loadingStop?(): void };
}
interface AdBreakOpts {
  type: string;
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: () => void;
}

declare global {
  interface Window {
    PokiSDK?: PokiSdk;
    CrazyGames?: { SDK: CrazySdk };
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
    adBreak?: (o: AdBreakOpts) => void;
    adConfig?: (o: Record<string, unknown>) => void;
  }
}

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

class Ads {
  readonly provider: Provider = PROVIDER === "adsense" && !ADSENSE_CLIENT ? "none" : PROVIDER;
  private ready = false;
  private startedAt = performance.now() / 1000;
  private lastAd = -Infinity;
  private busy = false;

  get enabled(): boolean {
    return this.provider !== "none";
  }

  /** Load the provider's SDK (once). The game never waits on this: if it fails, there are just no ads. */
  async init(): Promise<void> {
    if (!this.enabled || this.ready) return;
    try {
      if (this.provider === "adsense") {
        const attrs: Record<string, string> = { crossorigin: "anonymous", "data-tag-for-child-directed-treatment": "1" };
        if (TEST) attrs["data-adbreak-test"] = "on";
        const q = (window.adsbygoogle = window.adsbygoogle || []);
        q.requestNonPersonalizedAds = 1;
        window.adBreak = (o) => { q.push(o); };
        window.adConfig = (o) => { q.push(o); };
        await loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`, attrs);
        window.adConfig({ preloadAdBreaks: "on", sound: "on" });
      } else if (this.provider === "poki") {
        await loadScript("https://game-cdn.poki.com/scripts/v2/poki-sdk.js");
        await window.PokiSDK?.init();
      } else if (this.provider === "crazygames") {
        await loadScript("https://sdk.crazygames.com/crazygames-sdk-v3.js");
        await window.CrazyGames?.SDK.init();
      }
      this.ready = true;
    } catch (err) {
      console.warn("ads unavailable", err);
    }
  }

  /** The game has loaded (portals want to know). */
  loadingFinished(): void {
    if (!this.ready) return;
    if (this.provider === "poki") window.PokiSDK?.gameLoadingFinished();
    if (this.provider === "crazygames") window.CrazyGames?.SDK.game.loadingStop?.();
  }

  gameplayStart(): void {
    if (!this.ready) return;
    if (this.provider === "poki") window.PokiSDK?.gameplayStart();
    if (this.provider === "crazygames") window.CrazyGames?.SDK.game.gameplayStart();
  }

  gameplayStop(): void {
    if (!this.ready) return;
    if (this.provider === "poki") window.PokiSDK?.gameplayStop();
    if (this.provider === "crazygames") window.CrazyGames?.SDK.game.gameplayStop();
  }

  /**
   * A natural pause: maybe show an ad, then carry on. `mute` is called with true when an ad starts
   * and false when it ends. Resolves when the game can continue (straight away if there's no ad).
   */
  async pause(kind: BreakKind, name: string, mute: (on: boolean) => void): Promise<void> {
    const now = performance.now() / 1000;
    if (!this.ready || this.busy || now - this.startedAt < FIRST_AD_AFTER || now - this.lastAd < BETWEEN_ADS) return;
    this.busy = true;
    let muted = false;
    const start = () => { if (!muted) { muted = true; mute(true); } };
    try {
      await Promise.race([
        this.show(kind, name, start),
        new Promise<void>((r) => setTimeout(r, AD_TIMEOUT * 1000)),
      ]);
    } catch (err) {
      console.warn("ad break failed", err);
    } finally {
      if (muted) {
        this.lastAd = performance.now() / 1000;
        mute(false);
      }
      this.busy = false;
    }
  }

  private show(kind: BreakKind, name: string, onStart: () => void): Promise<void> {
    if (this.provider === "poki") return window.PokiSDK!.commercialBreak(onStart);
    if (this.provider === "crazygames") {
      return new Promise((resolve) => {
        window.CrazyGames!.SDK.ad.requestAd("midgame", { adStarted: onStart, adFinished: () => resolve(), adError: () => resolve() });
      });
    }
    return new Promise((resolve) => {
      window.adBreak!({ type: kind, name, beforeAd: onStart, adBreakDone: () => resolve() });
    });
  }
}

export const ads = new Ads();
