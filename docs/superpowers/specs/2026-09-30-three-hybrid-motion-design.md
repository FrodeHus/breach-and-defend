# Three.js hybrid card motion — design

Date: 2026-09-30
Status: Draft for review

## Goal

Make cards feel physical while they move: a card in flight is a lit 3D slab with visible thickness, a soft shadow and a real flip, and damage lands with a 3D burst of shards and sparks. At rest nothing changes: the DOM cards stay the only interactive, accessible representation, and the rules engine, tests and input handling are untouched.

The look was agreed on in a side-by-side mockup (CSS 3D vs three.js hybrid) built during the design discussion.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Library | three.js r170, vendored as `public/vendor/three.module.min.js` with its MIT licence; no CDN, CSP stays `script-src 'self'` |
| Loading | Lazy: imported after the first arena render; until it is ready, or if it cannot run, today's CSS animations play |
| Model | Hybrid: the DOM card is hidden while a 3D stand-in moves, then shown again where it lands |
| Card faces | Drawn on canvas from card data (`card-faces.mjs`), colours read from the live element's computed style |
| In scope | Combat lunge + damage FX; play / draw / return to hand; destroy (shatter); spell damage and damage to players |
| Out of scope | 3D hover preview (fly-up), 3D at rest (tilt on hover, idle board), the opening-hand and library screens |

## Constraints found in the code

- Every visual update already runs through two calls in `app.mjs`: `combat(before, game)` before `render()`, then `transitions(before, game)` after it, with `before = snapshot(game)`. This holds for local moves, AI moves and versus updates (`drainRemote`). Both are capped by `within(…, ANIMATION_MS)`.
- `motion.mjs` already uses the hybrid pattern with DOM ghosts (`ghost()`): hide the real card, animate a copy, restore in `finally`.
- `snapshot()` records zones and rects, but not card damage or player life, so spell damage and player damage are invisible to motion today.
- Player life is `game.players[p].life`; unit damage is `card.damage`.
- Hand cards use the compact full-card look (title, cost, art, type, stats); battlefield cards use the art tile (`card-view.mjs` `tile()`).
- CONTRIBUTING allows only PeerJS as a runtime third-party script; it must be updated to allow three.js.
- `tests/syntax.test.mjs` runs `node --check` on every `public/*.mjs`; the vendored file is `.js` in a subfolder, so it is not included. Prettier only formats `public/**/*.{mjs,css,html}`.

## Architecture

```
app.mjs ──► motion.mjs ── changes(before, after) ──► events (pure, tested)
                │
                ├─ stage3d.ready()? ──yes──► stage3d.mjs (three.js, one overlay canvas)
                │                              ├─ fly / lunge / burst / shatter
                │                              └─ card-faces.mjs (canvas face textures)
                └────────────────────no──► existing CSS/WAAPI animations (unchanged)
```

### `public/stage3d.mjs` (new)

Owns everything three.js.

- `init()`: idempotent. Skips when `prefers-reduced-motion` matches. Otherwise `import('./vendor/three.module.min.js')`, creates a `WebGLRenderer({alpha:true, antialias:true})` on a fixed, full-viewport `<canvas class="stage3d" aria-hidden="true">` with `pointer-events:none`, pixel ratio capped at 2. Any failure leaves `ready()` false.
- `ready()`: true once initialised and while the WebGL context is alive. A `webglcontextlost` event or any error thrown by an animation sets it false for the rest of the session.
- Camera: a perspective camera looking straight down, with the distance chosen so the plane `z = 0` maps 1:1 to CSS pixels of the viewport (the mockup's `fov = 30°`, `z = (innerHeight/2)/tan(15°)`). Recomputed on resize. Lighting: ambient plus one shadow-casting directional light from the upper left, and a transparent `ShadowMaterial` floor, as in the mockup.
- Render loop only runs while an animation or particle is alive, and stops when idle.
- Animations (each returns a promise, is time-boxed, and restores the DOM in `finally`):
  - `fly(el, {from, to, faces, flip})` — arcing flight from rect `from` to rect `to`, cross-fading face A→B in flight, optional flip (face-down → face-up or the reverse).
  - `lunge(el, target, {color, onImpact})` — wind-up, strike and return; calls `onImpact` at the strike keyframe.
  - `burst(rect, {color, amount, knock})` — shards, sparks, shockwave ring, 0/1 glyphs, point-light flash; with `knock`, the struck element is swapped for a stand-in that is knocked back and flashes. Shows the HTML "-N" label.
  - `shatter(el, {color})` — card flashes, breaks into lit shards, fades.
  - `discard(el, pileRect)` — flip-and-slide into the discard pile.
- Card slab: bevelled `ExtrudeGeometry` from a rounded rect sized to the element's rect, front and back faces as `ShapeGeometry` with remapped UVs, clear-coated front material. Geometries are cached per size.

### `public/card-faces.mjs` (new)

Pure-ish canvas drawing; no three.js dependency.

- `handFace(card, el)`, `tileFace(card, el, {damage})`, `backFace(faction)` — each returns a canvas (or `OffscreenCanvas` where available) sized from the element's rect × pixel ratio.
- Colours, border and fonts are read from `getComputedStyle(el)` (plus its `.art`, `.tile-name`, `.tile-pt` children), so theme or faction changes need no code change.
- Art comes from the same `art/cards/<id>.webp` URLs the DOM uses (already in the browser cache). A face is drawn only after its image has decoded; if it isn't ready within the animation's budget, the CSS path is used for that animation.
- Cache keyed by `card id + face kind + size + hurt state`; cleared when the viewport resizes.

### `public/motion.mjs` (changed)

- The rules part of `snapshot()` moves into a pure `state(game)` (zones, `damage` per field uid, `life` per player); `snapshot()` = `state(game)` + DOM rects.
- New pure function `changes(before, after)` returns events: `enter {uid, zone, owner, from}`, `leave {uid, from, to, destroyed}`, `damaged {uid, amount}`, `playerHit {p, amount}`. `transitions()` and `combat()` consume these instead of diffing inline.
- `combat()` and `transitions()`: for each event, use the `stage3d` variant when `stage3d.ready()`, else the existing CSS code path (kept as is). A throw in a 3D animation falls back to the CSS animation for that event.

### `public/app.mjs` (changed)

- Call `stage3d.init()` once after the first arena `render()`. No other changes: the existing `combat()`/`transitions()` calls and their `within(…)` caps stay.

## Choreography

Timings match today's CSS durations so match pacing does not change (play ≈ 620 ms, lunge ≈ 790 ms incl. return, depart ≈ 650 ms).

| Moment | 3D behaviour |
|---|---|
| Play from hand | Lifts, arcs to the board slot (peak ≈ 150 px), tilts toward the camera, wobbles on landing; hand face cross-fades to tile face |
| Opponent play (hidden hand) | Starts face-down at the opponent panel, flips face-up in flight, lands as a tile |
| Draw | Leaves the deck pile face-down, arcs to its hand slot, flips face-up (stays face-down for the opponent) |
| Return to hand (bounce) | Reverse of play; tile face cross-fades to hand face |
| Attack | Wind-up, lunge to the blocker or the defending player panel, spring back; burst on impact in the attacker's faction colour; struck unit gets knock-back + flash |
| Spell damage / player hit | Burst (no lunge) on the struck card or player panel, triggered by `damaged` / `playerHit` events |
| Destroyed | Flash, shatter into lit shards that spill across the board, fade (replaces the dissolve) |
| Discarded / countered | Flip and slide into the discard pile |

Motion curves are pure functions of `t` in `stage3d.mjs` (exported for tests): `arc(from, to, t)`, `lungeKeys(t)`, `flip(t)`, `spring(state, target, dt)`.

## Error handling

- Load, WebGL creation or context loss → `ready()` false → CSS path. The game never waits on 3D.
- Every 3D animation is capped with `settle`/`within`, and its `finally` restores DOM visibility and removes stand-ins and particles.
- Hidden tab mid-animation → the animation jumps to its end state.
- A throw in one 3D animation → that event replays with the CSS animation and `ready()` turns off for the session.

## Accessibility

- The canvas is `aria-hidden` with `pointer-events:none`. The DOM cards never leave the document (only `visibility` changes during flight), so focus, screen-reader labels and keyboard input are unaffected.
- `prefers-reduced-motion`: three.js is never loaded; existing reduced-motion behaviour applies.
- The damage number is HTML text with the existing styles.

## Testing

Node (`npm test`), no WebGL:

- `tests/motion.test.mjs`: `changes()` — enter from hand/deck/hidden hand, leave to grave destroyed vs discarded, bounce, `damaged` from spell and combat, `playerHit`, no events when nothing changed; `state(game)` records damage and life from a real `Game`.
- `tests/stage3d.test.mjs`: curves (`arc` starts and ends exactly on its endpoints and peaks mid-way; `lungeKeys` reaches the target at the impact key; `flip` ends at a half turn); screen ↔ world mapping round-trips; `init()` resolves with `ready() === false` when reduced motion is requested or the import fails (injected loader).
- `syntax.test.mjs` already covers the new `.mjs` files.

Browser (manual, in the preview): each moment for the local player and the AI; a versus match; the tutorial; a narrow (mobile) viewport; reduced motion (no three.js request in the network log); forcing a load failure (CSS path still plays).

## Docs

- CONTRIBUTING: name three.js (vendored in `public/vendor/`, MIT) as the second allowed runtime library, and state the fallback rule (every 3D animation must have a CSS path).
- `public/vendor/three.LICENSE`: the three.js MIT licence.
- README: credit three.js if there is a credits/attribution section.
