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
          <span id="hud-level" className="hud-pill level">1</span>
          <span id="hud-time" className="hud-pill">0:00</span>
          <span id="hud-score" className="hud-pill score">0</span>
        </div>

        <button id="btn-mute" className="round-btn" aria-label="Mute">🔊</button>
        <button id="btn-jump" className="jump-btn" aria-label="Jump">⬆ JUMP</button>

        <div id="toast" />
        <div id="hurt-flash" />

        {/* title screen */}
        <div id="ov-title" className="overlay">
          <div className="panel title-panel">
            <h1 className="game-title">Sunny Star Adventure</h1>
            <p className="tagline">Explore floating islands and Toy City — collect every ★, find treasure and animal buddies, drive the car, parachute off the tower!</p>
            <div className="btn-col">
              <button className="big-btn primary" data-action="play">▶ Play</button>
              <button className="big-btn primary2" data-action="play2">👥 2 Players</button>
              <button id="btn-continue" className="big-btn" data-action="continue" style={{ display: 'none' }}>▶ Continue</button>
            </div>
            <p id="title-best" className="best" />
            <div className="controls-help">
              <span>🕹️ P1: WASD + Space (jump ×2, hold = glide)</span>
              <span>👥 P2: Arrows + Enter</span>
              <span>🖱️ Drag — camera · E — car · T — teleport to friend</span>
              <span>Esc — pause · M — mute</span>
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
