# Three.js Hybrid Card Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While cards move (play, draw, bounce, attack, destroy, discard) and when damage lands, show lit 3D stand-ins and a 3D damage burst via three.js, falling back to today's CSS animations whenever 3D is unavailable.

**Architecture:** `motion.mjs` keeps deciding *what* animates: a pure `changes(before, after)` turns two rules snapshots into events. For each event it calls a 3D animation in `stage3d.mjs` (one see-through WebGL canvas over the page) when `stage3d.ready()`, else the existing CSS animation. The DOM card is hidden only while its stand-in moves and is always restored. Card faces for the stand-ins are drawn on canvas by `card-faces.mjs`.

**Tech Stack:** Plain ES modules, no build step, `node --test`; three.js r170 vendored as `public/vendor/three.module.min.js`.

**Spec:** `docs/superpowers/specs/2026-09-30-three-hybrid-motion-design.md`

**Spec amendments made while planning (both are refinements, not scope changes):**
1. Motion curves and screen↔world mapping live in a small pure module `public/stage3d-curves.mjs` (imported and re-used by `stage3d.mjs`) so Node tests can import them without three.js.
2. Card-face colours come from a hidden probe card element (`<div class="card blue">…`) read with `getComputedStyle`, not from the live card element: the live hand element is already gone from the DOM when a played card is animated (render happens first). Theme changes still carry over automatically.

## Global Constraints

- No npm dependencies, no build step; `public/` is the published site. Only new third-party file: `public/vendor/three.module.min.js` (three.js **r170**, sha256 `08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7`) plus `public/vendor/three.LICENSE`.
- CSP in `public/index.html` must stay `script-src 'self' https://cdn.jsdelivr.net/npm/peerjs@1.5.5/` — do not add a CDN.
- three.js is loaded with dynamic `import()` only after the first arena render; never when `prefers-reduced-motion: reduce` matches.
- Every 3D animation has a CSS path; a failing 3D animation replays with CSS and turns 3D off for the session (`stage3d.fail`).
- The DOM cards are never removed for animation; only `style.visibility` changes, and it is always restored in `finally`.
- Timings stay close to today's: play/draw ≈ 620 ms, lunge ≈ 790 ms, depart ≈ 650 ms. `app.mjs` keeps its `within(…, ANIMATION_MS)` caps.
- New modules must import cleanly in Node (no DOM or `matchMedia` access at module top level) so `tests/syntax.test.mjs` and unit tests work.
- Code style: match surrounding code (ES modules, 2-space, single quotes, arrow helpers, terse comments explaining *why*). Run `npm run format` before each commit (Prettier 3.9.9 via npx).
- Commit messages: short imperative sentence, no prefix, like the repo history (e.g. "Show the turn control as a terminal session").

## Review Focus

1. An animation that times out or throws must leave no DOM card hidden and no 3D stand-in on screen → `standIn` tests in Task 4 (resolve, throw, timeout, abort flag).
2. Many hits at once (several attackers, a board wipe) must not grow particles without bound or stall → `budget()` test in Task 3; bursts use it in Task 7.
3. Card art that is slow or fails to load must not block an animation; the face is drawn without art → `art()` timeout/failure tests in Task 5.
4. Reduced motion, a missing WebGL context or a failed import must never request/keep 3D and must leave the CSS path working → `init()` tests in Task 4; browser check in Task 9.
5. Damage that goes *down* (healing, end-of-turn reset) or a unit that enters already damaged must not trigger a damage burst → `changes()` tests in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `public/vendor/three.module.min.js` (new) | Vendored three.js r170 (self-contained ES module) |
| `public/vendor/three.LICENSE` (new) | three.js MIT licence |
| `serve.cjs` (modify) | Serve `.js` as JavaScript so the vendored module loads locally |
| `public/stage3d-curves.mjs` (new) | Pure math: easing, screen↔world mapping, flight/flip/lunge/knock curves, particle budget |
| `public/stage3d.mjs` (new) | three.js lifecycle, overlay canvas, render loop, card slabs, `standIn`, and the animations `fly`, `lunge`, `burst`, `shatter` |
| `public/card-faces.mjs` (new) | Canvas faces (hand card, tile, back) from card data + page CSS colours; art loading with timeout; cache |
| `public/motion.mjs` (modify) | `state()`, `changes()`; `combat()`/`transitions()` dispatch each event to 3D or CSS |
| `public/app.mjs` (modify) | Call `stage3d.init()` after an arena render |
| `public/style.css` (modify) | `.stage3d` canvas and `.damage-float` label styles |
| `tests/motion.test.mjs` (modify) | `state()`/`changes()` tests |
| `tests/stage3d.test.mjs` (new) | Curves, mapping, budget, `init()` fallbacks, `standIn` |
| `tests/card-faces.test.mjs` (new) | `wrap`, `faceKey`, `art` timeout/failure |
| `CONTRIBUTING.md`, `README.md` (modify) | Allow three.js as second runtime library; list new modules; credit three.js |

---

### Task 1: Vendor three.js and document it

**Files:**
- Create: `public/vendor/three.module.min.js`, `public/vendor/three.LICENSE`
- Modify: `serve.cjs:5-14`, `CONTRIBUTING.md` (Style section), `README.md` (module list ≈ line 95, licence section ≈ line 122)

**Interfaces:**
- Produces: `./vendor/three.module.min.js` importable from `public/*.mjs` via `import('./vendor/three.module.min.js')`, served as `text/javascript` locally and on GitHub Pages.

- [ ] **Step 1: Download the pinned build and licence**

```bash
mkdir -p public/vendor
curl -sSfL -o public/vendor/three.module.min.js https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js
curl -sSfL -o public/vendor/three.LICENSE https://cdn.jsdelivr.net/npm/three@0.170.0/LICENSE
shasum -a 256 public/vendor/three.module.min.js
```

Expected: `08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7  public/vendor/three.module.min.js`. If the hash differs, stop and report.

- [ ] **Step 2: Add a test that pins the vendored file**

Append to `tests/syntax.test.mjs`:

```js
test('vendored three.js is the pinned r170 build with its licence', () => {
  const dir = new URL('../public/vendor/', import.meta.url);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(new URL('three.module.min.js', dir))).digest('hex');
  assert.equal(hash, '08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7');
  assert.match(fs.readFileSync(new URL('three.LICENSE', dir), 'utf8'), /MIT License/);
});
```

and add `import crypto from 'node:crypto';` to its imports. Also add a test that the dev server serves `.js`:

```js
test('the dev server serves .js files as JavaScript', () => {
  assert.match(fs.readFileSync(new URL('../serve.cjs', import.meta.url), 'utf8'), /'\.js': 'text\/javascript; charset=utf-8'/);
});
```

- [ ] **Step 3: Run the tests; the server test fails**

Run: `node --test tests/syntax.test.mjs`
Expected: the vendored-file test PASSES, the `.js` server test FAILS.

- [ ] **Step 4: Serve `.js` in `serve.cjs`**

In the `mime` object add after the `.mjs` line:

```js
  '.js': 'text/javascript; charset=utf-8',
```

- [ ] **Step 5: Document the dependency**

In `CONTRIBUTING.md`, replace the sentence starting "The only runtime third-party script is PeerJS" with:

```md
  The only runtime third-party code is PeerJS (loaded from a pinned CDN URL
  in `public/net.mjs`) for play-a-friend, and three.js (vendored at
  `public/vendor/three.module.min.js`, r170, MIT) for 3D card motion. three.js
  is loaded lazily and every 3D animation must keep a CSS fallback in
  `public/motion.mjs`. Avoid adding more.
```

In `README.md`, in the module list near line 95 add a bullet:

```md
- `public/motion.mjs`, `stage3d.mjs`, `stage3d-curves.mjs`, `card-faces.mjs`: card motion — rules diff, 3D stand-ins and damage effects (three.js, vendored in `public/vendor/`), with CSS fallbacks.
```

(If `motion.mjs` is already listed in another bullet, add the three new files to that bullet instead of creating a duplicate.) In the licence section near line 122 add:

```md
- **three.js** (`public/vendor/three.module.min.js`) is © three.js authors, [MIT](public/vendor/three.LICENSE).
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Check the module is served**

Run: `node serve.cjs & sleep 1; curl -sI http://127.0.0.1:4173/vendor/three.module.min.js | grep -i content-type; kill %1`
Expected: `Content-Type: text/javascript; charset=utf-8`

- [ ] **Step 8: Commit**

```bash
npm run format
git add public/vendor serve.cjs tests/syntax.test.mjs CONTRIBUTING.md README.md
git commit -m "Vendor three.js r170 for 3D card motion"
```

---

### Task 2: Rules diff — `state()` and `changes()` in motion.mjs

**Files:**
- Modify: `public/motion.mjs` (`snapshot`, `transitions`; extract `enter`, `departing`)
- Test: `tests/motion.test.mjs`

**Interfaces:**
- Produces:
  - `state(game) → {cards: Map<uid,{zone,owner}>, damage: Map<uid,number>, life: number[]}` (zones: `hand`, `field`, `grave`, `stack`; `damage` only for field cards).
  - `snapshot(game)` returns `{...state(game), visual, phase, attacks, blocks, active, decks, graves, players}` (same fields as before plus `damage`, `life`).
  - `changes(before, after) → Event[]` where before/after are `state`-shaped. Event shapes, in this order (card events in `after.cards` iteration order, then damage, then life):
    - `{type:'enter', uid, owner, zone, from}` — `from` is the old zone or `null`
    - `{type:'leave', uid, owner, from, fromOwner, destroyed}` — moved to `grave`; `destroyed` = came from `field`
    - `{type:'damaged', uid, amount}` — a field card present before and after whose damage rose
    - `{type:'playerHit', p, amount}` — a player's life fell
  - Internal (used by Tasks 6–8): `enter(before, e, item, game)` CSS entry animation, `departing(before, e, game) → {el, r} | null`, `depart(from, target, destroyed)` (existing).

- [ ] **Step 1: Write the failing tests**

Add to `tests/motion.test.mjs`:

```js
import {Game} from '../public/engine.mjs';
import {CARDS} from '../public/cards.mjs';
import {state, changes} from '../public/motion.mjs';

const cardId = name => CARDS.find(c => c.name === name).id;
function table() {
  const g = new Game();
  g.players.forEach(p => Object.assign(p, {hand: [], field: [], grave: [], life: 20}));
  g.stack = [];
  return g;
}
const put = (g, p, zone, name) => {
  const c = g.card(cardId(name));
  g.players[p][zone].push(c);
  return c;
};
const move = (g, p, c, from, to) => {
  g.players[p][from] = g.players[p][from].filter(x => x !== c);
  g.players[p][to].push(c);
};

test('state records zones, unit damage and player capacity', () => {
  const g = table(),
    u = put(g, 0, 'field', 'SOC Trainee');
  u.damage = 2;
  g.players[1].life = 17;
  const s = state(g);
  assert.deepEqual(s.cards.get(u.uid), {zone: 'field', owner: 0});
  assert.equal(s.damage.get(u.uid), 2);
  assert.deepEqual(s.life, [20, 17]);
});

test('changes reports cards drawn, played and bounced', () => {
  const g = table(),
    u = put(g, 0, 'hand', 'SOC Trainee'),
    b = put(g, 1, 'field', 'Recon Operator');
  const before = state(g);
  move(g, 0, u, 'hand', 'field');
  move(g, 1, b, 'field', 'hand');
  const drawn = put(g, 0, 'hand', 'Threat Hunter');
  assert.deepEqual(changes(before, state(g)), [
    {type: 'enter', uid: drawn.uid, owner: 0, zone: 'hand', from: null},
    {type: 'enter', uid: u.uid, owner: 0, zone: 'field', from: 'hand'},
    {type: 'enter', uid: b.uid, owner: 1, zone: 'hand', from: 'field'},
  ]);
});

test('changes tells destroyed units from discarded cards', () => {
  const g = table(),
    u = put(g, 0, 'field', 'SOC Trainee'),
    h = put(g, 1, 'hand', 'Recon Operator');
  const before = state(g);
  move(g, 0, u, 'field', 'grave');
  move(g, 1, h, 'hand', 'grave');
  assert.deepEqual(changes(before, state(g)), [
    {type: 'leave', uid: u.uid, owner: 0, from: 'field', fromOwner: 0, destroyed: true},
    {type: 'leave', uid: h.uid, owner: 1, from: 'hand', fromOwner: 1, destroyed: false},
  ]);
});

test('changes reports new damage and lost capacity, never healing or units entering hurt', () => {
  const g = table(),
    u = put(g, 0, 'field', 'SOC Trainee'),
    healed = put(g, 1, 'field', 'Recon Operator');
  healed.damage = 1;
  const before = state(g);
  u.damage = 1;
  healed.damage = 0;
  g.players[1].life -= 3;
  g.players[0].life += 2;
  const fresh = put(g, 1, 'field', 'Payload Runner');
  fresh.damage = 1;
  assert.deepEqual(changes(before, state(g)), [
    {type: 'enter', uid: fresh.uid, owner: 1, zone: 'field', from: null},
    {type: 'damaged', uid: u.uid, amount: 1},
    {type: 'playerHit', p: 1, amount: 3},
  ]);
});

test('changes is empty when nothing moved', () => {
  const g = table();
  put(g, 0, 'field', 'SOC Trainee');
  assert.deepEqual(changes(state(g), state(g)), []);
});
```

(Merge the new imports with the existing import lines at the top of the file.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/motion.test.mjs`
Expected: FAIL — `state` / `changes` are not exported.

- [ ] **Step 3: Implement `state`, `changes`, and route `snapshot`/`transitions` through them**

In `public/motion.mjs`, replace the body of `snapshot` and add the two functions above it:

```js
// Rules-side view of the table: where every card is, how hurt each unit is, and each player's capacity.
export function state(game) {
  const cards = new Map(),
    damage = new Map();
  game.players.forEach((p, owner) =>
    ['hand', 'field', 'grave'].forEach(zone =>
      p[zone].forEach(c => {
        cards.set(c.uid, {zone, owner});
        if (zone === 'field') damage.set(c.uid, c.damage || 0);
      }),
    ),
  );
  game.stack.forEach(s => s.card && cards.set(s.card.uid, {zone: 'stack', owner: s.p}));
  return {cards, damage, life: game.players.map(p => p.life)};
}
// What happened between two states, as events the animations react to. Healing and end-of-turn resets are not events.
export function changes(before, after) {
  const events = [];
  for (const [uid, now] of after.cards) {
    const old = before.cards.get(uid);
    if (now.zone === 'grave' && old && old.zone !== 'grave')
      events.push({type: 'leave', uid, owner: now.owner, from: old.zone, fromOwner: old.owner, destroyed: old.zone === 'field'});
    else if (now.zone !== 'grave' && (!old || old.zone !== now.zone))
      events.push({type: 'enter', uid, owner: now.owner, zone: now.zone, from: old?.zone ?? null});
  }
  for (const [uid, hurt] of after.damage) {
    const was = before.damage?.get(uid);
    if (was !== undefined && hurt > was) events.push({type: 'damaged', uid, amount: hurt - was});
  }
  after.life.forEach((life, p) => {
    const was = before.life?.[p];
    if (was !== undefined && life < was) events.push({type: 'playerHit', p, amount: was - life});
  });
  return events;
}
export function snapshot(game) {
  const visual = new Map(nodes().map(el => [Number(el.dataset.motionUid), {el, r: rect(el)}]));
  return {
    ...state(game),
    visual,
    phase: game.phase,
    attacks: [...game.attacks],
    blocks: structuredClone(game.blocks),
    active: game.active,
    decks: [0, 1].map(p => rect($(`[data-player="${p}"] .deck-pile`))),
    graves: [0, 1].map(p => rect($(`[data-grave="${p}"]`))),
    players: [0, 1].map(p => rect($(`[data-player="${p}"]`))),
  };
}
```

Then replace the whole `transitions` function with the event-driven version below, moving its two inline blocks into named functions **without changing their animation code**:

```js
// The card leaving play, or a stand-in at the opponent's panel when it left their hidden hand.
function departing(before, e, game) {
  const from = before.visual.get(e.uid);
  if (from || e.from !== 'hand' || e.fromOwner !== 1 || !before.players[1]) return from || null;
  const el = document.createElement('div');
  el.className = 'card hidden-card ' + game.players[e.fromOwner].faction;
  const r = before.players[1];
  return {el, r: {left: r.left + r.width / 2, top: r.top, width: 90, height: 125}};
}
function enter(before, e, item, game) {
  const origin =
      before.visual.get(e.uid)?.r || (e.zone === 'hand' ? before.decks?.[e.owner] : null) || before.players[e.owner],
    a = center(item.r),
    b = origin ? center(origin) : {x: a.x - 90, y: a.y + 80};
  const g = ghost(item);
  item.el.style.visibility = 'hidden';
  g.classList.add('entry-card');
  const back = document.createElement('div');
  back.className = 'card-back ' + game.players[e.owner].faction;
  g.append(back);
  return animate(
    g,
    [
      {
        transform: `perspective(850px) translate3d(${b.x - a.x}px,${b.y - a.y}px,0) rotateY(180deg) rotateZ(-10deg) scale(.7)`,
        opacity: 0,
      },
      {offset: 0.18, opacity: 1},
      {
        offset: 0.7,
        transform: 'perspective(850px) translate3d(0,-12px,70px) rotateY(20deg) rotateZ(2deg) scale(1.05)',
        opacity: 1,
      },
      {transform: 'perspective(850px) translate3d(0,0,0) rotateY(0) rotateZ(0) scale(1)', opacity: 1},
    ],
    620,
  ).finally(() => {
    g.remove();
    item.el.style.visibility = '';
  });
}
export async function transitions(before, game) {
  if (still()) return;
  const after = snapshot(game),
    jobs = [];
  for (const e of changes(before, after)) {
    if (e.type === 'leave') {
      const from = departing(before, e, game);
      if (from) jobs.push(depart(from, after.graves[e.owner], e.destroyed));
    } else if (e.type === 'enter') {
      const item = after.visual.get(e.uid);
      if (item) jobs.push(enter(before, e, item, game));
    }
  }
  await Promise.all(jobs);
}
```

Note: the old code only animated `enter` when a DOM node existed (`item`) — that is preserved. `damaged`/`playerHit` events are ignored until Task 7.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all PASS (including the existing motion tests).

- [ ] **Step 5: Browser smoke check (behaviour must be unchanged)**

Start the preview (`.claude/launch.json` entry `game`, port 4173), start a Blue match, keep the hand, play an infrastructure card and a unit, go to combat and attack once. Expected: the same CSS entry/combat/destroy animations as before, no console errors.

- [ ] **Step 6: Commit**

```bash
npm run format
git add public/motion.mjs tests/motion.test.mjs
git commit -m "Derive card motion from a rules diff"
```

---

### Task 3: Pure curves and mapping — `stage3d-curves.mjs`

**Files:**
- Create: `public/stage3d-curves.mjs`
- Test: `tests/stage3d.test.mjs`

**Interfaces:**
- Produces (all pure, no DOM):
  - `ease(t)`, `lerp(a, b, t)`, `clamp01(t)`
  - `cameraDistance(height, fov = 30) → number`
  - `toWorld(x, y, z, view) → {x, y, z}` and `toScreen({x, y, z}, view) → {x, y}` where `view = {width, height, distance}`
  - `arc(from, to, t, {height = 150, tilt = 0.45}) → pose` with `from/to = {x, y, rz?}`, `pose = {x, y, z, rx, ry, rz}`
  - `flip(t, from = 0) → {ry, z}`
  - `IMPACT = 0.56`, `lungeKeys(t) → {k, z, rx}` (`k` 0 = home, 1 = strike point)
  - `knock(t) → number` (0 at start, 1 at t = 0.06, decays toward 0)
  - `MAX_PARTICLES = 400`, `budget(live, wanted) → number`

- [ ] **Step 1: Write the failing tests**

Create `tests/stage3d.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arc,
  flip,
  lungeKeys,
  IMPACT,
  knock,
  budget,
  MAX_PARTICLES,
  cameraDistance,
  toWorld,
  toScreen,
} from '../public/stage3d-curves.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('arc starts and lands exactly on its endpoints and peaks mid-flight', () => {
  const from = {x: 10, y: 400, rz: -0.06},
    to = {x: 300, y: 120, rz: 0};
  const a = arc(from, to, 0),
    b = arc(from, to, 1),
    mid = arc(from, to, 0.5, {height: 150});
  assert.deepEqual([a.x, a.y, a.z], [10, 400, 0]);
  near(b.x, 300);
  near(b.y, 120);
  near(b.z, 0);
  near(b.rz, 0);
  near(b.rx, 0);
  near(mid.z, 150);
});

test('flip turns half a revolution and lands flat', () => {
  near(flip(0).ry, 0);
  near(flip(1).ry, Math.PI);
  near(flip(1, Math.PI).ry, 2 * Math.PI);
  near(flip(0).z, 0);
  near(flip(1).z, 0);
});

test('lunge reaches the strike point at the impact key and returns home', () => {
  assert.deepEqual(lungeKeys(0), {k: 0, z: 0, rx: 0});
  near(lungeKeys(IMPACT).k, 1);
  near(lungeKeys(1).k, 0);
  near(lungeKeys(1).z, 0);
});

test('knock snaps to full strength and settles', () => {
  near(knock(0), 0);
  near(knock(0.06), 1);
  assert.ok(Math.abs(knock(0.9)) < 0.02);
});

test('screen and world coordinates round-trip at any height', () => {
  const view = {width: 1200, height: 800, distance: cameraDistance(800)};
  for (const z of [0, 40, 250]) {
    const s = toScreen(toWorld(137, 612, z, view), view);
    near(s.x, 137, 1e-6);
    near(s.y, 612, 1e-6);
  }
  const c = toWorld(600, 400, 0, view);
  near(c.x, 0);
  near(c.y, 0);
});

test('particle budget never exceeds the cap', () => {
  assert.equal(budget(0, 50), 50);
  assert.equal(budget(MAX_PARTICLES - 10, 50), 10);
  assert.equal(budget(MAX_PARTICLES + 5, 50), 0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/stage3d.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `public/stage3d-curves.mjs`**

```js
// Pure motion math for the 3D stand-ins: no DOM, no three.js, so Node can test it.
export const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = t => Math.max(0, Math.min(1, t));

// The camera looks straight down from `distance`, chosen so the plane z = 0 maps 1:1 to CSS pixels.
export const cameraDistance = (height, fov = 30) => height / 2 / Math.tan((fov * Math.PI) / 360);
export function toWorld(x, y, z, view) {
  const f = (view.distance - z) / view.distance;
  return {x: (x - view.width / 2) * f, y: (view.height / 2 - y) * f, z};
}
export function toScreen(p, view) {
  const f = view.distance / (view.distance - p.z);
  return {x: view.width / 2 + p.x * f, y: view.height / 2 - p.y * f};
}

// Flight between two card centres: lifts, tilts toward the viewer, and wobbles as it lands.
export function arc(from, to, t, {height = 150, tilt = 0.45} = {}) {
  t = clamp01(t);
  const p = ease(t),
    s = Math.sin(Math.PI * p),
    dir = to.y < from.y ? 1 : -1,
    land = t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI * 2) * ((1 - t) / 0.2) * 0.07 : 0;
  return {
    x: lerp(from.x, to.x, p),
    y: lerp(from.y, to.y, p),
    z: s * height,
    rx: tilt * s * dir + land,
    ry: 0,
    rz: lerp(from.rz || 0, to.rz || 0, p) + 0.18 * s,
  };
}
// Half a turn about the vertical axis, lifting the card clear of the table mid-way.
export function flip(t, from = 0) {
  t = clamp01(t);
  return {ry: from + Math.PI * ease(t), z: Math.sin(Math.PI * t) * 70};
}
// Attack keyframes [t, k, z, rx]: wind up, strike at IMPACT, spring home.
export const IMPACT = 0.56;
const LUNGE = [
  [0, 0, 0, 0],
  [0.42, -0.1, 45, -0.35],
  [IMPACT, 1, 6, 0.45],
  [1, 0, 0, 0],
];
export function lungeKeys(t) {
  t = clamp01(t);
  let i = 0;
  while (i < LUNGE.length - 2 && LUNGE[i + 1][0] < t) i++;
  const a = LUNGE[i],
    b = LUNGE[i + 1],
    q = ease((t - a[0]) / (b[0] - a[0]));
  return {k: lerp(a[1], b[1], q), z: lerp(a[2], b[2], q), rx: lerp(a[3], b[3], q)};
}
// Knock-back strength over time (seconds): a sharp hit, then a damped wobble.
export const knock = t => (t < 0.06 ? t / 0.06 : Math.exp(-(t - 0.06) * 6) * Math.cos((t - 0.06) * 20));
// Many simultaneous hits share one pool; new bursts get whatever room is left.
export const MAX_PARTICLES = 400;
export const budget = (live, wanted) => Math.max(0, Math.min(wanted, MAX_PARTICLES - live));
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/stage3d.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add public/stage3d-curves.mjs tests/stage3d.test.mjs
git commit -m "Add motion curves for 3D card stand-ins"
```

---

### Task 4: `stage3d.mjs` core — lazy load, canvas, render loop, slabs, `standIn`

**Files:**
- Create: `public/stage3d.mjs`
- Modify: `public/app.mjs` (import + one call in `render()`), `public/style.css` (append)
- Test: `tests/stage3d.test.mjs`

**Interfaces:**
- Consumes: `stage3d-curves.mjs` (`cameraDistance`, `toWorld`).
- Produces (used by Tasks 6–8):
  - `init({load?, reduced?, doc?}) → Promise<boolean>` (idempotent; memoised)
  - `ready() → boolean`, `fail(err)`, `resetStage()` (tests only)
  - `standIn(els, fn, ms, {schedule?, cancel?}) → Promise` — hides `els` (`style.visibility='hidden'`), calls `fn(ctl)` where `ctl = {aborted: false}`, resolves with fn's value or `undefined` after `ms`; in `finally` sets `ctl.aborted = true` and restores `els`. Rejects if `fn` rejects (after restoring).
  - `frame(update)` — `update(dt)` runs every animation frame until it returns `false`.
  - `place(object3d, pose)` — pose in screen px + radians (`{x, y, z, rx, ry, rz}`).
  - `slab(rect, {front, next?, back, edge?, radius?}) → {group, a, b, mix(t), dispose()}` — `front/next/back` are canvases; `a`/`b` are the front meshes.
  - `center(rect) → {x, y}`, `T` (card thickness px), and the three.js namespace via `three()` for Tasks 7–8.

- [ ] **Step 1: Write the failing tests**

Append to `tests/stage3d.test.mjs`:

```js
import {init, ready, resetStage, standIn} from '../public/stage3d.mjs';

function manualClock() {
  const timers = new Set();
  return {
    schedule: (fn, ms) => {
      const h = {fn, ms};
      timers.add(h);
      return h;
    },
    cancel: h => timers.delete(h),
    fire() {
      for (const h of [...timers]) {
        timers.delete(h);
        h.fn();
      }
    },
  };
}
const el = () => ({style: {visibility: ''}});

test('init never loads three.js when reduced motion is requested', async () => {
  resetStage();
  let loaded = false;
  assert.equal(await init({reduced: true, load: async () => (loaded = true)}), false);
  assert.equal(loaded, false);
  assert.equal(ready(), false);
});

test('init stays off when the import or WebGL fails', async () => {
  resetStage();
  assert.equal(await init({reduced: false, load: () => Promise.reject(new Error('offline'))}), false);
  assert.equal(ready(), false);
  resetStage();
  const doc = {createElement: () => ({className: '', setAttribute() {}, addEventListener() {}}), body: {append() {}}};
  const load = async () => ({
    WebGLRenderer: class {
      constructor() {
        throw new Error('no webgl');
      }
    },
  });
  assert.equal(await init({reduced: false, load, doc}), false);
  assert.equal(ready(), false);
});

test('standIn hides cards while running and restores them after it resolves', async () => {
  const a = el();
  let seen;
  const v = await standIn([a, null], () => {
    seen = a.style.visibility;
    return 7;
  }, 1000);
  assert.equal(seen, 'hidden');
  assert.equal(v, 7);
  assert.equal(a.style.visibility, '');
});

test('standIn restores cards when the animation throws', async () => {
  const a = el();
  await assert.rejects(
    standIn([a], () => Promise.reject(new Error('boom')), 1000),
    /boom/,
  );
  assert.equal(a.style.visibility, '');
});

test('standIn gives up after its time limit, restores cards and aborts the animation', async () => {
  const a = el(),
    clock = manualClock();
  let ctl;
  const run = standIn(
    [a],
    c => {
      ctl = c;
      return new Promise(() => {});
    },
    500,
    clock,
  );
  await Promise.resolve();
  assert.equal(a.style.visibility, 'hidden');
  clock.fire();
  assert.equal(await run, undefined);
  assert.equal(a.style.visibility, '');
  assert.equal(ctl.aborted, true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/stage3d.test.mjs`
Expected: FAIL — `stage3d.mjs` not found.

- [ ] **Step 3: Implement `public/stage3d.mjs` core**

```js
// One see-through WebGL canvas over the page. While a card moves, a lit 3D stand-in takes its place;
// the DOM card is only hidden meanwhile and is always shown again. Loaded lazily; the game never needs it.
import {cameraDistance, toWorld} from './stage3d-curves.mjs';

export const T = 4; // card thickness, px
let THREE = null,
  renderer = null,
  scene = null,
  camera = null,
  sun = null,
  floor = null,
  canvas = null,
  starting = null,
  failed = false,
  running = false,
  last = 0,
  view = {width: 1, height: 1, distance: 1};
const updaters = new Set(),
  shapes = new Map();

export const ready = () => !!renderer && !failed;
export const three = () => THREE;
export const center = r => ({x: r.left + r.width / 2, y: r.top + r.height / 2});
export function fail(err) {
  if (!failed) console.warn('3D card motion is off:', err);
  failed = true;
  updaters.clear();
  if (canvas) canvas.hidden = true;
}
export function resetStage() {
  starting = null;
  failed = false;
  renderer = null;
  updaters.clear();
}
export function init({load = () => import('./vendor/three.module.min.js'), reduced, doc = globalThis.document} = {}) {
  starting ??= (async () => {
    if (reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    try {
      THREE = await load();
      canvas = doc.createElement('canvas');
      canvas.className = 'stage3d';
      canvas.setAttribute('aria-hidden', 'true');
      renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
      canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        fail(new Error('WebGL context lost'));
      });
      doc.body.append(canvas);
      build();
      addEventListener('resize', resize);
      return true;
    } catch (err) {
      renderer = null;
      fail(err);
      return false;
    }
  })();
  return starting;
}
function build() {
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 10, 10000);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow, {radius: 14, blurSamples: 20, bias: -0.0005});
  scene.add(sun, sun.target);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({opacity: 0.32}));
  floor.receiveShadow = true;
  scene.add(floor);
  resize();
}
function resize() {
  const width = innerWidth,
    height = innerHeight;
  view = {width, height, distance: cameraDistance(height)};
  camera.aspect = width / height;
  camera.far = view.distance * 4;
  camera.position.set(0, 0, view.distance);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  floor.scale.set(width * 2, height * 2, 1);
  sun.position.set(-0.3 * width, 0.45 * height, view.distance);
  Object.assign(sun.shadow.camera, {left: -width, right: width, top: height, bottom: -height, near: 10, far: view.distance * 3});
  sun.shadow.camera.updateProjectionMatrix();
}
// Runs update(dt) every frame until it returns false; the loop and rendering stop when nothing is left.
export function frame(update) {
  updaters.add(update);
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(tick);
}
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const u of [...updaters]) {
    try {
      if (u(dt) === false) updaters.delete(u);
    } catch (err) {
      fail(err);
    }
  }
  if (failed) return void (running = false);
  renderer.render(scene, camera);
  if (updaters.size) requestAnimationFrame(tick);
  else running = false;
}
// Positions an object from a screen-space pose (CSS px, radians); z is height above the table.
export function place(obj, {x, y, z = 0, rx = 0, ry = 0, rz = 0}) {
  const p = toWorld(x, y, z, view);
  obj.position.set(p.x, p.y, p.z + T / 2);
  obj.rotation.set(rx, ry, -rz);
}
export const world = (x, y, z = 0) => toWorld(x, y, z, view);
// Hides the DOM cards while fn animates their stand-ins, and always shows them again, even on error or overrun.
export async function standIn(els, fn, ms, {schedule = setTimeout, cancel = clearTimeout} = {}) {
  const list = els.filter(Boolean),
    ctl = {aborted: false};
  let timer;
  for (const el of list) el.style.visibility = 'hidden';
  try {
    return await Promise.race([Promise.resolve().then(() => fn(ctl)), new Promise(r => (timer = schedule(r, ms)))]);
  } finally {
    cancel(timer);
    ctl.aborted = true;
    for (const el of list) el.style.visibility = '';
  }
}
function geometry(w, h, r) {
  const key = `${Math.round(w)}x${Math.round(h)}x${r}`;
  if (shapes.has(key)) return shapes.get(key);
  const s = new THREE.Shape(),
    x = w / 2,
    y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  const bevel = 0.8,
    body = new THREE.ExtrudeGeometry(s, {
      depth: T - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.6,
      bevelSegments: 3,
      curveSegments: 10,
    });
  body.translate(0, 0, -(T - 2 * bevel) / 2);
  const face = new THREE.ShapeGeometry(s, 10),
    pos = face.attributes.position,
    uv = face.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + x) / w, (pos.getY(i) + y) / h);
  const g = {body, face};
  shapes.set(key, g);
  return g;
}
export function texture(source) {
  const t = new THREE.CanvasTexture(source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// A card-shaped slab sized to a DOM rect. `next` is a second front face that mix(t) fades in (hand look → tile look).
export function slab(rect, {front, next = null, back, edge = 0x1d3a44, radius = 8}) {
  const {body, face} = geometry(rect.width, rect.height, radius),
    group = new THREE.Group();
  group.rotation.order = 'ZXY';
  const shell = new THREE.Mesh(body, new THREE.MeshStandardMaterial({color: edge, roughness: 0.55, metalness: 0.25}));
  shell.castShadow = true;
  const skin = src =>
    new THREE.Mesh(
      face,
      new THREE.MeshPhysicalMaterial({map: texture(src), roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, transparent: true}),
    );
  const a = skin(front),
    b = next ? skin(next) : null,
    rear = skin(back);
  a.position.z = T / 2 + 0.05;
  rear.rotation.y = Math.PI;
  rear.position.z = -T / 2 - 0.05;
  group.add(shell, a, rear);
  if (b) {
    b.position.z = T / 2 + 0.1;
    b.material.opacity = 0;
    group.add(b);
  }
  scene.add(group);
  return {
    group,
    a,
    b,
    mix(t) {
      if (b) b.material.opacity = t;
    },
    dispose() {
      scene.remove(group);
      for (const m of [shell, a, b, rear])
        if (m) {
          m.material.map?.dispose();
          m.material.dispose();
        }
    },
  };
}
export const add = obj => scene.add(obj);
export const remove = obj => scene.remove(obj);
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/stage3d.test.mjs`
Expected: PASS.

- [ ] **Step 5: Start 3D after arena renders, and style the canvas**

In `public/app.mjs` add to the imports:

```js
import {init as init3d} from './stage3d.mjs';
```

In `render()`, directly after the line `if (view === 'arena' && game) arrows(blocks);` add:

```js
  if (view === 'arena' && game) init3d(); // Lazy: three.js loads after the first arena render, or never.
```

Append to `public/style.css` next to the `.motion-ghost` rules (keep the same stacking level as `.motion-ghost`, `z-index: 40`):

```css
/* The 3D stand-in layer: covers the viewport, never takes input, invisible when idle. */
.stage3d {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 40;
  pointer-events: none;
}
```

- [ ] **Step 6: Browser check**

Reload the `game` preview, start a match. Check: network log shows one request for `vendor/three.module.min.js` after the arena renders (none on the landing page); `document.querySelector('canvas.stage3d')` exists; no console errors; the board is still clickable (the canvas does not block input). With reduced motion emulated (Chrome DevTools → Rendering → prefers-reduced-motion, or `resize_window` is not enough — use `javascript_tool` to check `matchMedia('(prefers-reduced-motion: reduce)').matches` and reload), no request for three.js is made.

- [ ] **Step 7: Commit**

```bash
npm run format
git add public/stage3d.mjs public/app.mjs public/style.css tests/stage3d.test.mjs
git commit -m "Load a 3D stage for card motion after the arena renders"
```

---

### Task 5: Card faces — `card-faces.mjs`

**Files:**
- Create: `public/card-faces.mjs`
- Test: `tests/card-faces.test.mjs`

**Interfaces:**
- Consumes: `BY_ID`, `SETS` from `public/cards.mjs` (card fields used: `name`, `cost`, `type`, `faction`, `set`, `art`, `power`, `toughness`).
- Produces:
  - `faceKey(id, kind, w, h, extra = '') → string`
  - `wrap(text, width, measure) → string[]`
  - `art(url, ms = 400, {load?, schedule?}) → Promise<Image|null>` — cached per URL; `null` if not ready in `ms` or failed.
  - `faces({id, faction, from, to, width, height, stats}) → Promise<{from, to, back}>` of canvases. `from`/`to` ∈ `'hand' | 'tile'`. `stats` = `{power, toughness, damage}` or `null` (card data used). Unknown/hidden `id` → all three are the faction back.

- [ ] **Step 1: Write the failing tests**

Create `tests/card-faces.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {faceKey, wrap, art} from '../public/card-faces.mjs';

test('faceKey separates kinds, sizes and states', () => {
  assert.equal(faceKey('b3', 'tile', 96.4, 128, '2/3/1'), 'b3|tile|96x128|2/3/1');
  assert.notEqual(faceKey('b3', 'tile', 96, 128), faceKey('b3', 'hand', 96, 128));
});

test('wrap breaks text into lines that fit', () => {
  const measure = s => s.length * 10;
  assert.deepEqual(wrap('Network Sentinel of the deep', 100, measure), ['Network', 'Sentinel', 'of the deep']);
  assert.deepEqual(wrap('', 100, measure), []);
  assert.deepEqual(wrap('Supercalifragilistic', 50, measure), ['Supercalifragilistic']);
});

test('art resolves the image when it loads in time', async () => {
  const img = {};
  assert.equal(await art('t1.webp', 400, {load: async () => img, schedule: () => 0}), img);
});

test('art gives up with null when the image is slow or broken', async () => {
  let fire;
  const slow = art('t2.webp', 400, {load: () => new Promise(() => {}), schedule: fn => (fire = fn)});
  fire();
  assert.equal(await slow, null);
  assert.equal(await art('t3.webp', 400, {load: () => Promise.reject(new Error('404')), schedule: () => 0}), null);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/card-faces.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `public/card-faces.mjs`**

```js
// Canvas faces for the 3D stand-ins: the compact hand card, the battlefield tile and the card back.
// Drawn from card data; colours are read from the page's own CSS through a hidden probe card, so theme changes carry over.
import {BY_ID, SETS} from './cards.mjs';

const images = new Map(),
  cache = new Map(),
  palettes = new Map(),
  SCALE = 2,
  CACHE_LIMIT = 120;
export const faceKey = (id, kind, w, h, extra = '') => `${id}|${kind}|${Math.round(w)}x${Math.round(h)}|${extra}`;
export function wrap(text, width, measure) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
const decode = src => {
  const i = new Image();
  i.src = src;
  return i.decode().then(() => i);
};
// The decoded image, or null when it is not ready within ms: the face is then drawn without art rather than waiting.
export function art(url, ms = 400, {load = decode, schedule = setTimeout} = {}) {
  if (!images.has(url)) images.set(url, load(url).catch(() => null));
  return Promise.race([images.get(url), new Promise(r => schedule(() => r(null), ms))]);
}
function palette(faction) {
  if (palettes.has(faction)) return palettes.get(faction);
  const probe = document.createElement('div');
  probe.className = `card ${faction}`;
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden';
  probe.innerHTML =
    '<div class="card-top"><span class="card-title">x</span><span class="cost">1</span></div><div class="card-bottom"><span>x</span><span class="stats">1/1</span></div>';
  document.body.append(probe);
  const css = sel => getComputedStyle(sel ? probe.querySelector(sel) : probe);
  const p = {
    bg: css().backgroundColor,
    border: css().borderTopColor,
    title: css('.card-title').color,
    muted: css('.card-bottom').color,
    costBg: css('.cost').backgroundColor,
    costLine: css('.cost').borderTopColor,
    stat: css('.stats').color,
    statBg: css('.stats').backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue(`--${faction}`).trim() || css().borderTopColor,
  };
  probe.remove();
  palettes.set(faction, p);
  return p;
}
function surface(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * SCALE);
  c.height = Math.round(h * SCALE);
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  return {c, g};
}
function cover(g, img, x, y, w, h, py = 0.3) {
  const s = Math.max(w / img.width, h / img.height);
  g.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) * py, img.width * s, img.height * s);
}
function frame(g, w, h, r, color, width = 2) {
  g.beginPath();
  g.roundRect(width / 2, width / 2, w - width, h - width, r);
  g.lineWidth = width;
  g.strokeStyle = color;
  g.stroke();
}
function badge(g, text, hurt, right, bottom, size, p) {
  g.font = `700 ${size}px 'DM Sans', sans-serif`;
  const [pow, tough] = text.split('/'),
    w = g.measureText(text).width + size * 0.8,
    h = size * 1.35;
  g.beginPath();
  g.roundRect(right - w, bottom - h, w, h, 4);
  g.fillStyle = p.statBg === 'rgba(0, 0, 0, 0)' ? '#f7fafc' : p.statBg;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = p.stat;
  g.stroke();
  const x = right - w + size * 0.4,
    y = bottom - h * 0.28;
  g.fillStyle = p.stat;
  g.fillText(`${pow}/`, x, y);
  g.fillStyle = hurt ? '#c94350' : p.stat;
  g.fillText(tough, x + g.measureText(`${pow}/`).width, y);
}
function hand(d, w, h, img, p) {
  const {c, g} = surface(w, h),
    pad = w * 0.06,
    fs = Math.max(9, w * 0.085);
  g.beginPath();
  g.roundRect(0, 0, w, h, 7);
  g.fillStyle = p.bg;
  g.fill();
  frame(g, w, h, 7, p.accent);
  g.fillStyle = p.title;
  g.font = `700 ${fs}px 'Barlow Condensed', sans-serif`;
  wrap(d.name, w - pad * 2 - fs * 1.6, t => g.measureText(t).width)
    .slice(0, 2)
    .forEach((line, i) => g.fillText(line, pad, pad + fs * (i + 1)));
  const r = fs * 0.72,
    cx = w - pad - r,
    cy = pad + r;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = p.costBg === 'rgba(0, 0, 0, 0)' ? p.bg : p.costBg;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = p.costLine;
  g.stroke();
  g.fillStyle = p.title;
  g.font = `600 ${fs * 0.75}px 'DM Sans', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(d.type === 'Infrastructure' ? '◇' : String(d.cost), cx, cy + 0.5);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const top = pad + fs * 2.3,
    artH = h * 0.52;
  g.save();
  g.beginPath();
  g.roundRect(pad, top, w - pad * 2, artH, 4);
  g.clip();
  if (img) cover(g, img, pad, top, w - pad * 2, artH, 0.5);
  else {
    g.fillStyle = p.border;
    g.fill();
  }
  g.restore();
  const fb = Math.max(8, w * 0.065);
  g.font = `500 ${fb}px 'DM Sans', sans-serif`;
  g.fillStyle = p.muted;
  g.fillText(`${d.faction.toUpperCase()} / ${SETS[d.set]?.code ?? ''}`, pad, h - pad);
  if (d.type === 'Unit') badge(g, `${d.power}/${d.toughness}`, false, w - pad, h - pad * 0.6, fb * 1.25, p);
  return c;
}
function tile(d, w, h, img, p, stats) {
  const {c, g} = surface(w, h);
  g.save();
  g.beginPath();
  g.roundRect(0, 0, w, h, 10);
  g.clip();
  g.fillStyle = '#203b4c';
  g.fillRect(0, 0, w, h);
  if (img) cover(g, img, 0, 0, w, h);
  const fs = Math.max(9, w * 0.13);
  g.fillStyle = '#0d1a22c7';
  g.fillRect(0, 0, w, fs * 1.55);
  g.fillStyle = '#fff';
  g.font = `600 ${fs}px 'Barlow Condensed', sans-serif`;
  g.fillText(wrap(d.name, w * 0.9, t => g.measureText(t).width)[0] ?? '', w * 0.07, fs * 1.15);
  g.restore();
  frame(g, w, h, 10, p.accent);
  if (d.type === 'Unit') {
    const s = stats || {power: d.power, toughness: d.toughness, damage: 0};
    badge(g, `${s.power}/${s.toughness - (s.damage || 0)}`, (s.damage || 0) > 0, w - 4, h - 4, Math.max(9, w * 0.12), {
      ...p,
      stat: '#182b3a',
      statBg: '#f7fafc',
    });
  }
  return c;
}
function back(faction, w, h, img, p) {
  const {c, g} = surface(w, h);
  g.save();
  g.beginPath();
  g.roundRect(0, 0, w, h, 8);
  g.clip();
  g.fillStyle = '#192d35';
  g.fillRect(0, 0, w, h);
  if (img) cover(g, img, 0, 0, w, h, 0.5);
  g.restore();
  frame(g, w, h, 8, p.accent);
  return c;
}
function cached(key, draw) {
  if (cache.has(key)) return cache.get(key);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  const c = draw();
  cache.set(key, c);
  return c;
}
let sized = false;
export async function faces({id, faction, from = 'hand', to = 'tile', width, height, stats = null}) {
  if (!sized) {
    sized = true;
    addEventListener('resize', () => cache.clear());
  }
  const d = BY_ID[id],
    side = d?.faction || faction,
    p = palette(side),
    backImg = await art(`art/${side}-card-back.png`),
    rear = cached(faceKey(side, 'back', width, height, backImg ? '' : 'plain'), () => back(side, width, height, backImg, p));
  if (!d) return {from: rear, to: rear, back: rear};
  const img = await art(`art/${d.art}.webp`),
    state = stats ? `${stats.power}/${stats.toughness}/${stats.damage || 0}` : '',
    draw = kind =>
      cached(faceKey(id, kind, width, height, `${kind === 'tile' ? state : ''}${img ? '' : '|noart'}`), () =>
        kind === 'tile' ? tile(d, width, height, img, p, stats) : hand(d, width, height, img, p),
      );
  return {from: draw(from), to: draw(to), back: rear};
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Browser check of the faces**

In the running match, run in the preview console (`javascript_tool`):

```js
const {faces} = await import('/card-faces.mjs');
const f = await faces({id: document.querySelector('.hand [data-card]').dataset.card, faction: 'blue', from: 'hand', to: 'tile', width: 110, height: 150});
[f.from, f.to, f.back].forEach((c, i) => Object.assign(document.body.appendChild(c).style, {position: 'fixed', left: `${20 + i * 130}px`, top: '20px', width: '110px', zIndex: 99}));
```

Screenshot: hand face, tile face and back must be recognisable (name, cost, art, stats; art tile with name bar and P/T; faction back). Remove the canvases afterwards (`document.querySelectorAll('body > canvas:not(.stage3d)').forEach(c => c.remove())`).

- [ ] **Step 6: Commit**

```bash
npm run format
git add public/card-faces.mjs tests/card-faces.test.mjs
git commit -m "Draw card faces for 3D stand-ins"
```

---

### Task 6: 3D play, draw and return to hand

**Files:**
- Modify: `public/stage3d.mjs` (add `fly`), `public/motion.mjs` (3D branch for `enter` events)

**Interfaces:**
- Consumes: `standIn`, `slab`, `frame`, `place`, `center` (Task 4); `arc`, `ease`, `lerp`, `clamp01` (Task 3); `faces` (Task 5); `changes` events (Task 2).
- Produces:
  - `fly({els, from, to, faces, flip = null, duration = 620}) → Promise` — `from`/`to` are DOM rects; `flip` ∈ `null | 'up' | 'down'` (`'up'`: starts face-down; `'down'`: ends face-down).
  - In `motion.mjs`: `fallback(job, css)`, `kindOf(zone)`, `statsOf(game, uid)`, `enter3d(before, e, item, game)` (reused by Tasks 7–8).

- [ ] **Step 1: Add `fly` to `public/stage3d.mjs`**

Add to the curves import: `arc, ease, lerp, clamp01`. Then append:

```js
// Flies a stand-in between two rects, cross-fading from one face to the other; the slab is sized to `to`.
export function fly({els, from, to, faces, flip = null, duration = 620}) {
  return standIn(
    els,
    ctl =>
      new Promise(resolve => {
        const s = slab(to, {front: faces.from, next: faces.to, back: faces.back}),
          a = {...center(from), rz: from.rz || 0},
          b = center(to),
          sx = from.width / to.width,
          sy = from.height / to.height;
        let t = 0;
        const done = () => {
          s.dispose();
          resolve();
          return false;
        };
        frame(dt => {
          if (ctl.aborted) return done();
          t = Math.min(1, t + (dt * 1000) / duration);
          const pose = arc(a, b, t),
            k = ease(t);
          if (flip) pose.ry = flip === 'up' ? Math.PI * (1 - k) : Math.PI * k;
          place(s.group, pose);
          s.group.scale.set(lerp(sx, 1, k), lerp(sy, 1, k), 1);
          s.mix(clamp01((t - 0.25) / 0.4));
          if (t >= 1) return done();
        });
      }),
    duration + 400,
  );
}
```

- [ ] **Step 2: Route `enter` events to 3D in `public/motion.mjs`**

Add imports:

```js
import * as stage3d from './stage3d.mjs';
import {faces} from './card-faces.mjs';
```

Add helpers above `transitions`:

```js
// A failed 3D animation replays with CSS; stage3d switches itself off after the first failure.
const fallback = (job, css) =>
  job.catch(err => {
    stage3d.fail(err);
    return css();
  });
const kindOf = zone => (zone === 'field' ? 'tile' : 'hand');
function statsOf(game, uid) {
  const f = game.find?.(uid);
  return f?.card ? {...game.stats(f.card, f.p), damage: f.card.damage || 0} : null;
}
async function enter3d(before, e, item, game) {
  const old = before.visual.get(e.uid)?.r,
    origin = old || (e.zone === 'hand' ? before.decks?.[e.owner] : null) || before.players[e.owner];
  if (!origin) return;
  const f = await faces({
    id: item.el.dataset.card,
    faction: game.players[e.owner].faction,
    from: kindOf(e.from),
    to: kindOf(e.zone),
    width: item.r.width,
    height: item.r.height,
    stats: e.zone === 'field' ? statsOf(game, e.uid) : null,
  });
  await stage3d.fly({els: [item.el], from: origin, to: item.r, faces: f, flip: old ? null : 'up'});
}
```

In `transitions`, change the `enter` branch to:

```js
    } else if (e.type === 'enter') {
      const item = after.visual.get(e.uid);
      if (item)
        jobs.push(stage3d.ready() ? fallback(enter3d(before, e, item, game), () => enter(before, e, item, game)) : enter(before, e, item, game));
    }
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS (motion/stage3d modules still import in Node).

- [ ] **Step 4: Browser verification**

In the `game` preview start a match (use slow motion by temporarily running `document.getAnimations` is not applicable — instead take screenshots ~250 ms after each action via `javascript_tool` + `computer screenshot`). Check each, with no console errors:
1. Play infrastructure and a unit from hand: a lit slab arcs from the hand to the board, its face turns from hand card to tile, and the real tile appears where it lands (no double image, no jump).
2. End the turn: the computer's plays arrive face-down from its panel and flip face-up; your draw leaves the deck face-down and flips up into the hand.
3. If a bounce card is available (library: effect `bounce`), use it on a unit: tile face turns back into a hand card.
4. Resize the window mid-match, play another card: it still lands exactly on the tile.

- [ ] **Step 5: Commit**

```bash
npm run format
git add public/stage3d.mjs public/motion.mjs
git commit -m "Fly played, drawn and returned cards as 3D stand-ins"
```

---

### Task 7: 3D attack lunge and damage burst (combat, spells, players)

**Files:**
- Modify: `public/stage3d.mjs` (add particles, `lunge`, `burst`), `public/motion.mjs` (`combat`, hit events in `transitions`), `public/style.css` (`.damage-float`)

**Interfaces:**
- Consumes: Task 3 `lungeKeys`, `IMPACT`, `knock`, `budget`, `MAX_PARTICLES`; Task 4 core; Task 5 `faces`; Task 6 `fallback`, `statsOf`.
- Produces:
  - `lunge({els, from, to, faces, onImpact, duration = 790}) → Promise`
  - `burst({rect, faction, amount = 0, knock = null}) → Promise` — `knock = {els, faces}` swaps the struck DOM card for a knocked-back stand-in; resolves in ≈ 450 ms (particles keep going on their own).
  - `combat()` sets `before.fought = true` when it animates; `transitions()` skips `damaged`/`playerHit` events when `before.fought`.

- [ ] **Step 1: Add particles, `lunge` and `burst` to `public/stage3d.mjs`**

Add to the curves import: `lungeKeys, IMPACT, knock, budget, MAX_PARTICLES`. Then append:

```js
const FX = {blue: ['#71dfd2', '#3fb8c9', '#eed7a1', '#ffffff'], red: ['#fb827b', '#ff5a50', '#eed7a1', '#ffffff']};
const rnd = (a, b) => a + Math.random() * (b - a);
const shards = [],
  sparks = [];
let pool = null,
  glyphTex = null;
// One shared instanced pool per particle kind keeps many simultaneous bursts to two draw calls.
function particles() {
  if (pool) return pool;
  const mesh = (geo, mat) => {
    const m = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    m.count = 0;
    m.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_PARTICLES; i++) m.setColorAt(i, white);
    scene.add(m);
    return m;
  };
  pool = {
    shard: mesh(new THREE.BoxGeometry(3.5, 3.5, 3.5), new THREE.MeshStandardMaterial({roughness: 0.35, metalness: 0.15})),
    spark: mesh(new THREE.BoxGeometry(1.4, 1.4, 1), new THREE.MeshBasicMaterial()),
    m: new THREE.Object3D(),
    col: new THREE.Color(),
    aim: new THREE.Vector3(),
    light: new THREE.PointLight(0xffffff, 0, 500, 1),
    running: false,
  };
  pool.shard.castShadow = true;
  scene.add(pool.light);
  return pool;
}
function stepParticles(dt) {
  const {shard, spark, m, col, aim} = pool;
  for (const list of [shards, sparks]) for (let i = list.length - 1; i >= 0; i--) if ((list[i].t += dt) >= list[i].life) list.splice(i, 1);
  shards.forEach((p, i) => {
    p.vz -= 520 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.z < 2) {
      p.z = 2;
      p.vz *= -0.35;
      p.vx *= 0.7;
      p.vy *= 0.7;
      p.vr *= 0.6;
    }
    p.r += p.vr * dt;
    m.position.set(p.x, p.y, p.z);
    m.rotation.set(p.r, p.r * 0.7, p.r * 0.3);
    m.scale.setScalar(p.s * Math.min(1, (1 - p.t / p.life) * 3));
    m.updateMatrix();
    shard.setMatrixAt(i, m.matrix);
    shard.setColorAt(i, col.set(p.c));
  });
  sparks.forEach((p, i) => {
    const d = Math.pow(0.03, dt);
    p.vx *= d;
    p.vy *= d;
    p.vz *= d;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const v = Math.hypot(p.vx, p.vy, p.vz),
      f = 1 - p.t / p.life;
    m.position.set(p.x, p.y, p.z);
    m.rotation.set(0, 0, 0);
    m.lookAt(aim.set(p.x + p.vx, p.y + p.vy, p.z + p.vz));
    m.scale.set(f, f, Math.max(1, v * 0.06) * f);
    m.updateMatrix();
    spark.setMatrixAt(i, m.matrix);
    spark.setColorAt(i, col.set(p.c));
  });
  for (const [mesh, list] of [
    [shard, shards],
    [spark, sparks],
  ]) {
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  return (pool.running = shards.length + sparks.length > 0);
}
function startParticles() {
  if (pool.running) return;
  pool.running = true;
  frame(stepParticles);
}
// Shards chipped off a card's face, thrown away from `origin`.
function chip(rect, origin, pal, wanted, lift = 1) {
  const c = world(origin.x, origin.y),
    hw = rect.width / 2,
    hh = rect.height / 2,
    mid = center(rect);
  for (let i = 0, n = budget(shards.length, wanted); i < n; i++) {
    const w = world(mid.x + rnd(-hw, hw) * 0.9, mid.y + rnd(-hh, hh) * 0.9);
    shards.push({
      x: w.x,
      y: w.y,
      z: T + 2,
      vx: (w.x - c.x) * rnd(1.2, 2.6) + rnd(-40, 40),
      vy: (w.y - c.y) * rnd(0.8, 1.8) + rnd(30, 110),
      vz: rnd(140, 380) * lift,
      r: rnd(0, 6),
      vr: rnd(-14, 14),
      s: rnd(0.6, 1.4),
      c: pal[i % 3],
      life: rnd(1, 1.7),
      t: 0,
    });
  }
}
function spray(origin, pal, wanted) {
  const c = world(origin.x, origin.y);
  for (let i = 0, n = budget(sparks.length, wanted); i < n; i++) {
    const a = rnd(0, Math.PI * 2),
      v = rnd(180, 380);
    sparks.push({x: c.x, y: c.y, z: 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(30, 280), c: i % 4 ? pal[i % 3] : '#ffffff', life: rnd(0.25, 0.6), t: 0});
  }
}
// A thin shockwave ring with a dark rim so it reads on the light board.
function ring(origin, color) {
  const c = world(origin.x, origin.y),
    glow = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 96), new THREE.MeshBasicMaterial({color, transparent: true, depthWrite: false})),
    rim = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.02, 96), new THREE.MeshBasicMaterial({color: 0x0c1115, transparent: true, depthWrite: false}));
  glow.position.set(c.x, c.y, 1.5);
  rim.position.set(c.x, c.y, 1);
  scene.add(rim, glow);
  let t = 0;
  frame(dt => {
    const u = (t += dt) / 0.5;
    if (u >= 1) {
      for (const m of [glow, rim]) {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
      return false;
    }
    const r = 14 + (1 - Math.pow(1 - u, 3)) * 80;
    glow.scale.set(r, r * 0.85, 1);
    rim.scale.set(r, r * 0.85, 1);
    glow.material.opacity = 1 - u;
    rim.material.opacity = 0.35 * (1 - u);
  });
}
function glyphs(rect, pal) {
  glyphTex ??= ['0', '1'].map(ch => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = "700 52px 'Barlow Condensed', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#0c1115';
    g.strokeText(ch, 32, 34);
    g.fillStyle = '#fff';
    g.fillText(ch, 32, 34);
    return texture(c);
  });
  const mid = center(rect),
    list = Array.from({length: 8}, (_, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: glyphTex[i % 2], color: pal[i % 2], transparent: true, depthWrite: false})),
        w = world(mid.x + rnd(-0.35, 0.35) * rect.width, mid.y + rnd(-0.3, 0.3) * rect.height);
      s.scale.set(15, 15, 1);
      scene.add(s);
      return {s, x: w.x, y: w.y, z: rnd(20, 70), vx: rnd(-30, 30), vy: rnd(30, 80), life: rnd(0.6, 1), t: 0};
    });
  frame(dt => {
    for (const g of list) {
      g.t += dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.s.position.set(g.x, g.y, g.z);
      g.s.material.opacity = Math.max(0, 1 - g.t / g.life) * (Math.random() < 0.2 ? 0.25 : 1);
    }
    if (list.some(g => g.t < g.life)) return;
    for (const g of list) {
      scene.remove(g.s);
      g.s.material.dispose();
    }
    return false;
  });
}
// One reused light: adding and removing lights would make three.js recompile every material mid-animation.
function flash(origin, color) {
  const c = world(origin.x, origin.y),
    light = pool.light;
  light.color.set(color);
  light.position.set(c.x, c.y, 70);
  let t = 0;
  frame(dt => {
    light.intensity = 700 * Math.exp(-(t += dt) * 12);
    if (t < 0.5) return;
    light.intensity = 0;
    return false;
  });
}
// The floating "-N" stays HTML so it is crisp; it is decorative (the tile's own P/T carries the information).
function floatDamage(rect, amount) {
  const d = document.createElement('div');
  d.className = 'damage-float';
  d.textContent = `-${amount}`;
  d.setAttribute('aria-hidden', 'true');
  d.style.left = `${rect.left + rect.width * 0.72}px`;
  d.style.top = `${rect.top + rect.height * 0.15}px`;
  document.body.append(d);
  d.animate(
    [
      {transform: 'translateY(8px) scale(.6)', opacity: 0},
      {transform: 'translateY(-6px) scale(1.15)', opacity: 1, offset: 0.2},
      {transform: 'translateY(-34px) scale(1)', opacity: 0},
    ],
    {duration: 1000, easing: 'ease-out', fill: 'forwards'},
  );
  setTimeout(() => d.remove(), 1100);
}
function knockBack(rect, {els, faces}, color) {
  return standIn(
    els,
    ctl =>
      new Promise(resolve => {
        const s = slab(rect, {front: faces.to, back: faces.back}),
          c = center(rect);
        s.a.material.emissive = new THREE.Color(color);
        let t = 0;
        frame(dt => {
          t += dt;
          if (ctl.aborted || t >= 0.45) {
            s.dispose();
            resolve();
            return false;
          }
          const k = knock(t * 2);
          place(s.group, {x: c.x + (t < 0.1 ? rnd(-2.5, 2.5) : 0), y: c.y - 8 * k, z: 14 * Math.max(k, 0), rx: -0.4 * k, rz: 0.07 * k});
          s.a.material.emissiveIntensity = 0.55 * Math.exp(-t * 28);
        });
      }),
    900,
  );
}
// Damage landing on a card or player panel, in the attacker's colours.
export function burst({rect, faction, amount = 0, knock: struck = null}) {
  const pal = FX[faction] || FX.blue,
    mid = center(rect),
    origin = {x: mid.x, y: mid.y + rect.height * 0.35};
  particles();
  chip(rect, origin, pal, 50);
  spray(origin, pal, 70);
  startParticles();
  ring(origin, pal[0]);
  glyphs(rect, pal);
  flash(origin, pal[0]);
  if (amount) floatDamage(rect, amount);
  return struck ? knockBack(rect, struck, pal[0]) : new Promise(r => setTimeout(r, 360));
}
// Attack: wind up, strike toward the target (onImpact fires at the strike), spring home.
export function lunge({els, from, to, faces, onImpact, duration = 790}) {
  return standIn(
    els,
    ctl =>
      new Promise(resolve => {
        const s = slab(from, {front: faces.from, back: faces.back}),
          a = center(from),
          b = center(to),
          tip = {x: lerp(a.x, b.x, 0.6), y: lerp(a.y, b.y, 0.6)},
          dir = b.y < a.y ? 1 : -1;
        let t = 0,
          hit = false;
        frame(dt => {
          if (!ctl.aborted) {
            t = Math.min(1, t + (dt * 1000) / duration);
            const k = lungeKeys(t);
            place(s.group, {x: lerp(a.x, tip.x, k.k), y: lerp(a.y, tip.y, k.k), z: k.z, rx: k.rx * dir});
            if (!hit && t >= IMPACT) {
              hit = true;
              onImpact?.();
            }
            if (t < 1) return;
          }
          s.dispose();
          resolve();
          return false;
        });
      }),
    duration + 400,
  );
}
```

- [ ] **Step 2: Style the damage label**

Append to `public/style.css` after `.stage3d`:

```css
.damage-float {
  position: fixed;
  z-index: 41;
  pointer-events: none;
  font: 700 2rem/1 'Barlow Condensed', sans-serif;
  color: #fff;
  -webkit-text-stroke: 1px #0c1115;
  text-shadow: 0 2px 0 #0c1115;
}
```

- [ ] **Step 3: Use them in `combat()` and for spell/player damage**

In `public/motion.mjs`, rename the body of the existing per-attacker animation into a CSS function and dispatch per attacker. Replace `combat` with:

```js
const factionOf = el => (el?.classList.contains('red') ? 'red' : 'blue');
async function lungeCss(from, destinations) {
  const g = ghost(from);
  from.el.style.visibility = 'hidden';
  try {
    for (const target of destinations) {
      if (!target.r) continue;
      const a = center(from.r),
        b = center(target.r),
        x = b.x - a.x,
        y = b.y - a.y;
      await animate(
        g,
        [
          {transform: 'perspective(800px) translate3d(0,0,0) rotateX(0)'},
          {
            transform: `perspective(800px) translate3d(${x * 0.9}px,${y * 0.9}px,65px) rotateX(${y > 0 ? -14 : 14}deg) rotateZ(-4deg)`,
          },
        ],
        310,
      );
      await Promise.all([
        impact(target.r),
        target.el
          ? animate(
              target.el,
              [
                {transform: 'translateX(0)'},
                {transform: 'translateX(9px) rotate(4deg)'},
                {transform: 'translateX(-5px)'},
                {transform: 'translateX(0)'},
              ],
              260,
            )
          : Promise.resolve(),
      ]);
      await animate(g, [{transform: `translate(${x * 0.9}px,${y * 0.9}px) scale(1.06)`}, {transform: 'translate(0,0) scale(1)'}], 220);
    }
  } finally {
    g.remove();
    from.el.style.visibility = '';
  }
}
async function lunge3d(from, destinations, uid, game, hits) {
  const size = {width: from.r.width, height: from.r.height},
    faction = factionOf(from.el),
    f = await faces({id: from.el.dataset.card, faction, from: 'tile', to: 'tile', ...size, stats: statsOf(game, uid)});
  for (const target of destinations) {
    if (!target.r) continue;
    const knock = target.el
      ? {
          els: [target.el],
          faces: await faces({
            id: target.el.dataset.card,
            faction: factionOf(target.el),
            from: 'tile',
            to: 'tile',
            width: target.r.width,
            height: target.r.height,
            stats: statsOf(game, target.uid),
          }),
        }
      : null;
    let landed = Promise.resolve();
    await stage3d.lunge({
      els: [from.el],
      from: from.r,
      to: target.r,
      faces: f,
      onImpact: () => (landed = stage3d.burst({rect: target.r, faction, amount: hits.get(target.key) || 0, knock})),
    });
    await landed;
  }
}
export async function combat(before, game) {
  if (before.phase !== 'afterBlock' || game.phase !== 'endCombat' || still()) return;
  before.fought = true; // transitions() leaves the damage from this combat to these animations
  const hits = new Map(
    changes(before, state(game))
      .filter(e => e.type === 'damaged' || e.type === 'playerHit')
      .map(e => [e.type === 'damaged' ? e.uid : `p${e.p}`, e.amount]),
  );
  await Promise.all(
    before.attacks.map(async uid => {
      const from = before.visual.get(uid);
      if (!from) return;
      const targets = (before.blocks[uid] || [])
        .map(id => ({...before.visual.get(id), uid: id, key: id}))
        .filter(t => t.r);
      const defender = 1 - before.active,
        destinations = targets.length ? targets : [{r: before.players[defender], key: `p${defender}`}];
      return stage3d.ready()
        ? fallback(lunge3d(from, destinations, uid, game, hits), () => lungeCss(from, destinations))
        : lungeCss(from, destinations);
    }),
  );
}
```

In `transitions`, add a final branch for hit events (spell damage and non-combat player damage):

```js
    } else if (!before.fought) {
      const r = e.type === 'damaged' ? after.visual.get(e.uid)?.r : after.players[e.p];
      if (!r) continue;
      const el = e.type === 'damaged' ? after.visual.get(e.uid).el : null;
      jobs.push(
        stage3d.ready()
          ? fallback(hit3d(r, el, e, game), () => impact(r))
          : impact(r),
      );
    }
```

and add above `transitions`:

```js
// Spell damage and damage to a player: the burst without a lunge, in the colours of whoever is not being hit.
async function hit3d(r, el, e, game) {
  const victim = e.type === 'damaged' ? game.find?.(e.uid)?.p : e.p,
    faction = game.players[victim === 0 ? 1 : 0]?.faction || 'blue',
    knock = el
      ? {
          els: [el],
          faces: await faces({
            id: el.dataset.card,
            faction: factionOf(el),
            from: 'tile',
            to: 'tile',
            width: r.width,
            height: r.height,
            stats: statsOf(game, e.uid),
          }),
        }
      : null;
  await stage3d.burst({rect: r, faction, amount: e.amount, knock});
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Browser verification**

In the `game` preview (build a board with a few units over two turns; use the library to find `damage`-effect Operations):
1. Attack with a unit into an empty board: the attacker lunges at the opponent panel; burst of shards/sparks/ring/digits in your colour; "-N" floats; the capacity number drops. Attacker lands back exactly on its tile.
2. Attack into a blocker: the blocker is knocked back and flashes; its P/T shows the damage after the move.
3. Several attackers at once: all lunge in parallel, no stutter, no card left hidden afterwards (`document.querySelectorAll('[data-motion-uid][style*="hidden"]').length === 0` after the move).
4. Cast a damage Operation on a unit and on the opponent: burst without a lunge on the target / on the panel.
5. Take the AI's attacks: bursts in red.
6. Force a failure: `javascript_tool` → `(await import('/stage3d.mjs')).fail(new Error('test'))`, then attack: the CSS lunge + impact ring play, no errors.

- [ ] **Step 6: Commit**

```bash
npm run format
git add public/stage3d.mjs public/motion.mjs public/style.css
git commit -m "Animate attacks and damage with 3D bursts"
```

---

### Task 8: 3D destroy (shatter) and discard

**Files:**
- Modify: `public/stage3d.mjs` (add `shatter`), `public/motion.mjs` (`leave` events)

**Interfaces:**
- Consumes: Task 7 particle helpers (`particles`, `chip`, `startParticles`, `FX`), Task 6 `fly`, `fallback`, `kindOf`.
- Produces: `shatter({rect, faces, faction}) → Promise` (≈ 640 ms); `leave3d(from, pile, e, game)` in motion.

- [ ] **Step 1: Add `shatter` to `public/stage3d.mjs`**

```js
// A destroyed card flashes, then breaks into shards that spill across the board.
export function shatter({rect, faces, faction}) {
  const pal = FX[faction] || FX.blue;
  return standIn(
    [],
    ctl =>
      new Promise(resolve => {
        const s = slab(rect, {front: faces.from, back: faces.back}),
          c = center(rect);
        s.a.material.emissive = new THREE.Color(pal[0]);
        place(s.group, {x: c.x, y: c.y});
        let t = 0;
        frame(dt => {
          t += dt;
          s.a.material.emissiveIntensity = Math.min(1, t / 0.18) * 0.8;
          place(s.group, {x: c.x + rnd(-1.5, 1.5), y: c.y, z: t * 30});
          if (!ctl.aborted && t < 0.18) return;
          s.dispose();
          if (!ctl.aborted) {
            particles();
            chip(rect, {x: c.x, y: c.y + rect.height}, [pal[0], pal[1], '#203b4c'], 60, 0.6);
            startParticles();
          }
          setTimeout(resolve, 460);
          return false;
        });
      }),
    1100,
  );
}
```

- [ ] **Step 2: Route `leave` events in `public/motion.mjs`**

Add above `transitions`:

```js
async function leave3d(from, pile, e, game) {
  const f = await faces({
    id: from.el.dataset?.card,
    faction: game.players[e.fromOwner].faction,
    from: kindOf(e.from),
    to: kindOf(e.from),
    width: from.r.width,
    height: from.r.height,
    stats: null,
  });
  if (e.destroyed) return stage3d.shatter({rect: from.r, faces: f, faction: game.players[e.fromOwner].faction});
  if (pile) return stage3d.fly({els: [], from: from.r, to: pile, faces: f, flip: 'down', duration: 650});
}
```

and change the `leave` branch in `transitions` to:

```js
    if (e.type === 'leave') {
      const from = departing(before, e, game),
        pile = after.graves[e.owner];
      if (from)
        jobs.push(
          stage3d.ready()
            ? fallback(leave3d(from, pile, e, game), () => depart(from, pile, e.destroyed))
            : depart(from, pile, e.destroyed),
        );
    } else if …
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Browser verification**

1. A unit dies in combat: after the lunge/burst, it flashes and shatters; shards bounce and fade; no ghost image remains.
2. Cast an Operation (it resolves to the discard pile): the card flips and slides into your discard pile.
3. Destroy effect (`destroy`) on an opponent Tool/unit: shatter.
4. The computer discards/plays an Operation from its hidden hand: a card back slides into its discard pile.

- [ ] **Step 5: Commit**

```bash
npm run format
git add public/stage3d.mjs public/motion.mjs
git commit -m "Shatter destroyed cards and flip discards into the pile in 3D"
```

---

### Task 9: Whole-feature verification and cleanup

**Files:**
- Modify: only files needing fixes found here.

- [ ] **Step 1: Full checks**

Run: `npm test && npm run typecheck && npm run format:check`
Expected: all PASS.

- [ ] **Step 2: Browser matrix** (preview `game`; record a screenshot for each)

1. Full solo match turn cycle as Blue and as Red: play, draw, attack, block, spell damage, destroy, discard — no console errors, no card left hidden (`document.querySelectorAll('#app [style*="visibility: hidden"]').length === 0` after each move).
2. Tutorial (landing → tutorial): lessons still highlight targets; animations run.
3. Versus: two tabs via the invite flow (if the PeerJS broker is reachable on this network; if not, note it and skip) — the guest sees 3D motion for the host's moves.
4. Narrow viewport (`resize_window` preset `mobile`, reload): stand-ins land on the right tiles; reset to `desktop` afterwards.
5. Reduced motion: no request for `vendor/three.module.min.js`; CSS behaviour as before.
6. Load failure: block the vendor file (rename it temporarily or `javascript_tool` → `(await import('/stage3d.mjs')).fail(new Error('x'))` before the first move) — game plays with CSS animations.
7. Performance: with DevTools Performance or `performance.now()` sampling during a 4-attacker combat, frames stay under ~33 ms on this machine.

- [ ] **Step 3: Fix anything found, re-run Step 1, commit**

```bash
npm run format
git add -A public tests
git commit -m "Polish 3D card motion after verification"
```

(Skip the commit if nothing changed.)
