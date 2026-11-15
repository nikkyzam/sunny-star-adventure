/**
 * Home.tsx — the page that hosts the game canvas + HUD/overlay DOM.
 *
 * React only owns the DOM shell (canvas + HUD overlay); everything inside the
 * render loop lives under src/game/ and never re-renders React. Start the game
 * in an effect and tear it down in the cleanup so React StrictMode's
 * mount → unmount → mount cycle does not leak a second renderer or loop.
 *
 * HUD elements are addressed by id from src/game/hud.ts — keep ids in sync.
 */

import { useEffect, useRef } from 'react'
import { startGame, stopGame } from '@/game/boot'

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    startGame(canvas)
    return () => stopGame()
  }, [])

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />

      <div id="ui-overlay">
        {/* top status bar (during play) */}
        <div id="hud-top">
          <span id="hud-hearts" className="hud-pill hearts">♥♥♥</span>
          <span id="hud-stars" className="hud-pill stars">★ 0/0</span>
          <span id="hud-coins" className="hud-pill coins">◉ 0</span>
          <span id="hud-buddies" className="hud-pill buddies" style={{ display: 'none' }} />
          <span id="hud-magnet" className="hud-pill magnet" style={{ display: 'none' }} />
          <span id="hud-job" className="hud-pill job" style={{ display: 'none' }} />
          <span id="hud-level" className="hud-pill level">1</span>
          <span id="hud-time" className="hud-pill">0:00</span>
          <span id="hud-score" className="hud-pill score">0</span>
          <span id="hud-room" className="hud-pill room" style={{ display: 'none' }} />
        </div>

        <button id="btn-mute" className="round-btn" aria-label="Mute">🔊</button>
        {/* touch thumb-stick: drawn where the left thumb lands (src/game/input.ts moves it) */}
        <div id="stick-base" className="stick-base"><div id="stick-knob" className="stick-knob" /></div>
        <button id="btn-jump" className="jump-btn" aria-label="Jump">⬆ JUMP</button>
        {/* car controls: shown next to the car / while riding (touch-friendly E and H) */}
        <button id="btn-car" className="car-btn" style={{ display: 'none' }} />
        <button id="btn-honk" className="car-btn honk" aria-label="Honk" style={{ display: 'none' }}>📣</button>
        {/* villagers: shown when one is close (touch-friendly F) */}
        <button id="btn-talk" className="car-btn talk" style={{ display: 'none' }}>💬 Talk</button>
        <div id="dialog" className="dialog">
          <span id="dialog-name" className="dialog-name" />
          <span id="dialog-text" />
        </div>

        {/* preset stickers (no free-text chat): keys 1–6 or tap */}
        <div id="sticker-bar" className="sticker-bar" style={{ display: 'none' }} />

        <div id="toast" />
        <div id="hurt-flash" />

        {/* title screen */}
        <div id="ov-title" className="overlay">
          <div className="panel title-panel">
            <h1 className="game-title">Sunny Star Adventure</h1>
            <p className="tagline">Explore sky islands, Toy City, the big Adventure Island and Sunshine City — collect every ★, bring your pet, sail the boat, drive the car, meet the villagers and play with friends!</p>
            <div className="kid-setup">
              <div className="name-row">
                <span id="kid-name" className="kid-name" />
                <button className="mini-btn" data-action="reroll" aria-label="Pick a new name">🎲</button>
              </div>
              <button className="mini-btn wide" data-action="dress">🎨 Dress up &amp; pick a pet</button>
              <button id="btn-easy" className="mini-btn wide" data-action="easy" />
            </div>
            <div className="btn-col">
              <button className="big-btn primary" data-action="play">▶ Play</button>
              <button className="big-btn primary2" data-action="online">🌐 Play with friends</button>
              <div className="btn-pair">
                <button className="big-btn island" data-action="island">🏝️ Adventure Island</button>
                <button className="big-btn city" data-action="city">🏙️ Sunshine City</button>
              </div>
              <button className="big-btn" data-action="drive">🚗 Drive in Toy City</button>
              <button className="big-btn" data-action="play2">👥 2 Players (same keyboard)</button>
              <button id="btn-continue" className="big-btn" data-action="continue" style={{ display: 'none' }}>▶ Continue</button>
            </div>
            <p id="title-best" className="best" />
            <a className="parents-link" href="parents.html" target="_blank" rel="noopener">👪 For parents · Privacy</a>
            <div className="controls-help">
              <span>🕹️ P1: WASD + Space (jump ×2, hold = glide)</span>
              <span>👥 P2: Arrows + Enter</span>
              <span>🖱️ Drag — camera · E — car / boat (Space hop, H honk) · F — talk</span>
              <span>T — teleport to friend</span>
              <span>📱 Tablet: left thumb moves, tap JUMP, drag right side to look</span>
              <span>1–6 — stickers · 7 — dance 💃 · Esc — pause · M — mute</span>
            </div>
          </div>
        </div>

        {/* dress-up: the kid stands above this panel while you choose */}
        <div id="ov-dress" className="overlay clear" style={{ display: 'none' }}>
          <div className="panel dress-panel">
            <div className="choice-row"><span>Body</span><div id="bodies" className="outfits" /></div>
            <div className="choice-row"><span>Clothes</span><div id="clothes" className="outfits" /></div>
            <div className="choice-row"><span>Color</span><div id="outfits" className="outfits" /></div>
            <div className="choice-row"><span>Skin</span><div id="skins" className="outfits" /></div>
            <div className="choice-row"><span>Hair</span><div id="hairstyles" className="outfits" /></div>
            <div className="choice-row"><span>Hair color</span><div id="haircolors" className="outfits" /></div>
            <div className="choice-row"><span>Glasses</span><div id="glasses" className="outfits" /></div>
            <div className="choice-row"><span>Hat</span><div id="hats" className="outfits" /></div>
            <div className="choice-row"><span>Pet</span><div id="pets" className="outfits" /></div>
            <button className="big-btn primary" data-action="back">✔ Done</button>
          </div>
        </div>

        {/* online: make or join a room */}
        <div id="ov-online" className="overlay" style={{ display: 'none' }}>
          <div className="panel">
            <h2>Play with friends 🌐</h2>
            <div className="btn-col">
              <button className="big-btn primary" data-action="host">🏠 Make a room</button>
              <p className="tagline">…or type your friend's room code:</p>
              <input id="join-code" className="code-input" maxLength={8} placeholder="FROG42"
                autoComplete="off" autoCapitalize="characters" spellCheck={false} />
              <button className="big-btn primary2" data-action="join">🚪 Join room</button>
            </div>
            <p id="online-status" className="stat-line" />
            <div className="btn-col">
              <button className="big-btn" data-action="back">⬅ Back</button>
            </div>
          </div>
        </div>

        {/* pause */}
        <div id="ov-pause" className="overlay" style={{ display: 'none' }}>
          <div className="panel">
            <h2>Paused</h2>
            <div className="btn-col">
              <button className="big-btn primary" data-action="resume">▶ Resume</button>
              <button className="big-btn" data-action="retry">↻ Restart level</button>
              <button className="big-btn" data-action="title">🏠 Title</button>
            </div>
          </div>
        </div>

        {/* level clear */}
        <div id="ov-clear" className="overlay" style={{ display: 'none' }}>
          <div className="panel">
            <h2 className="rainbow-text">Level Clear! 🎉</h2>
            <p className="stat-line"><span id="clear-stars" /> · <span id="clear-time" /></p>
            <p className="stat-line bonus" id="clear-bonus" />
            <p className="stat-line total">Score <span id="clear-total" /></p>
            <div className="btn-col">
              <button className="big-btn primary" data-action="next">Next level ➜</button>
              <button className="big-btn" data-action="title">🏠 Title</button>
            </div>
          </div>
        </div>

        {/* memory verse: read it, then type it from memory to open the next level */}
        <div id="ov-verse" className="overlay" style={{ display: 'none' }}>
          <div className="panel verse-panel">
            <h2>Memory verse 📖</h2>
            <p id="verse-ref" className="verse-ref" />
            <p id="verse-text" className="verse-text" />
            <div id="verse-learn" className="btn-col">
              <p className="tagline">Read it a few times. When you know it by heart, type it from memory!</p>
              <button className="big-btn primary" data-action="verse-ready">✍️ I know it!</button>
            </div>
            <div id="verse-type" className="btn-col" style={{ display: 'none' }}>
              <textarea id="verse-input" className="verse-input" rows={3} placeholder="Type the verse here…"
                autoComplete="off" autoCapitalize="sentences" spellCheck={false} />
              <p id="verse-feedback" className="verse-feedback" />
              <button className="big-btn primary" data-action="verse-check">✔ Check</button>
              <button className="big-btn" data-action="verse-peek">👀 Peek at the verse</button>
            </div>
          </div>
        </div>

        {/* game over */}
        <div id="ov-gameover" className="overlay" style={{ display: 'none' }}>
          <div className="panel">
            <h2>Oh no! Out of hearts 💔</h2>
            <p className="stat-line total">Score <span id="go-score" /></p>
            <p className="stat-line">Best <span id="go-best" /></p>
            <div className="btn-col">
              <button className="big-btn primary" data-action="retry">↻ Try again</button>
              <button className="big-btn" data-action="title">🏠 Title</button>
            </div>
          </div>
        </div>

        {/* win */}
        <div id="ov-win" className="overlay" style={{ display: 'none' }}>
          <div className="panel">
            <h2 className="rainbow-text">You did it! 🌈⭐</h2>
            <p className="tagline">Sunny saved the sky islands and collected every star!</p>
            <p className="stat-line total">Final score <span id="win-score" /></p>
            <p className="stat-line">Best <span id="win-best" /></p>
            <div className="btn-col">
              <button className="big-btn primary" data-action="again">▶ Play again</button>
              <button className="big-btn" data-action="title">🏠 Title</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
