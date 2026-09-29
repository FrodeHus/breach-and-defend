# Invite-Link Two-Player Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the arena a landing page with a game-mode selector (approved mockup: https://claude.ai/artifact/B5S6tR4GagucDmcd5wkwae), and let two people play Breach & Defend in separate browsers through an invite link, on a static GitHub Pages site, with clocks, reconnects, an honor pledge, and a post-match fairness audit.

**Architecture:** The host browser runs the only real `Game` inside a `Match` referee; the guest sends intents over a PeerJS WebRTC data channel and receives redacted, perspective-flipped views. Both browsers drive the unchanged arena UI through a `Seat`, a `Game` rebuilt from the latest view whose mutating methods send intents. A jointly generated seed (commit–reveal) plus an action log lets the guest replay and verify the whole match when it ends.

**Tech Stack:** Vanilla ES modules in `dist/` (no build step), Node ≥ 22 built-in test runner, Web Crypto (`crypto.subtle`), PeerJS 1.5.5 from jsDelivr with SRI, `localStorage`.

**Spec:** `docs/superpowers/specs/2026-09-29-invite-multiplayer-design.md`

## Global Constraints

- No npm dependencies, no build step. Everything the site serves lives in `dist/`. GitHub Pages publishes `dist/` only.
- Tests run with `npm test` (`node --test tests/*.test.mjs`). Helpers live in `tests/helpers/` so the glob doesn't pick them up.
- Only external stylesheet: Google Fonts (Chakra Petch 500/600/700, DM Sans 400/500/700). Only external script: `https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js`, integrity `sha384-x0YgkOr/3UOZP2CRDxGW9e0Q+2Qjyr3uJrm4xU32Y7ZCNAo7Cc7bjhrZMi/dwczu`, loaded only when a versus match starts.
- Solo mode behavior, log text and all existing tests stay unchanged.
- Clocks are fixed: opening 60 s, turn 90 s (active player, per turn), response 20 s (non-active player, per decision).
- Invite link `…/#join=<matchId>`; host URL `…/#host=<matchId>`; `matchId` is 16 characters from `a–z2–7`; PeerJS host id `bnd-<matchId>`.
- Storage keys `bnd:host:<matchId>` and `bnd:guest:<matchId>`; records older than 7 days are pruned.
- In versus mode, log text names factions ("Blue team plays …") and never says "You"/"Computer".
- Out of scope: chat, spectators, rematch, configurable clocks, TURN relay, tutorial or AI in versus.
- New modules use the readable 2-space style of `dist/card-drag.mjs`; edits inside `dist/engine.mjs` and `dist/app.mjs` keep those files' dense one-line style.

## Review Focus

1. **Card uids leaking from the opponent's hand.** Deck lists are public and uids are assigned in deck-list order, so a uid reveals the card. A guest view must never contain a uid from the host's hand, including cards that return to the hand. Test in Task 4.
2. **Host and guest in the same browser**, e.g. two tabs while testing or clicking your own link. Their storage records must not collide. Test in Task 11.
3. **Connection drops while an intent is in flight.** The intent must be rejected with a clear message, never applied twice, and the state must resync on reconnect. Tests in Tasks 5 and 11.
4. **Site storage blocked or full**, e.g. in private mode. The match must still work, with the invite panel warning it can't survive a reload. Tests in Tasks 9 and 12.
5. **The match ends while the guest is offline**, e.g. the host concedes during a pause. On reconnect the guest must still get the reveal and run the audit. Test in Task 11.

---

## File Structure

| File | Responsibility |
|---|---|
| `dist/rng.mjs` (new) | Seeded, serializable PRNG (sfc32) |
| `dist/engine.mjs` (modify) | Versus options, two-player opening, faction log labels, concede, save/restore |
| `dist/protocol.mjs` (new) | Pure helpers shared by host and audit: seed, views (redact + flip), actions, timeouts, hashing |
| `dist/match.mjs` (new) | Host referee: validation, action log, pledge gate, pause, clocks, persistence |
| `dist/audit.mjs` (new) | Guest-side replay verifier |
| `dist/remote.mjs` (new) | `Seat`: a view-backed `Game` whose mutators send intents |
| `dist/storage.mjs` (new) | Safe `localStorage` wrapper with memory fallback and pruning |
| `dist/net.mjs` (new) | PeerJS transport (`listen`, `dial`) |
| `dist/session.mjs` (new) | Host/guest handshake, tokens, reconnect, reveal, audit exchange |
| `dist/versus-ui.mjs` (new) | HTML strings for lobby, honor dialog, clock, audit line |
| `dist/versus.css` (new) | Styles for the above |
| `dist/landing.mjs`, `dist/landing.css` (new) | Start screen: splash hero, game-mode selector, side picker (approved mockup) |
| `art-source/`, `dist/art/splash-*` (new) | Original splash art (not shipped) and its web sizes |
| `dist/app.mjs`, `dist/index.html` (modify) | Header wordmark; wire the landing page and versus sessions into the arena |
| `tests/helpers/policy.mjs`, `tests/helpers/versus.mjs`, `tests/helpers/fake-net.mjs` (new) | Deterministic player, fake clock/storage, in-memory transport |
| `README.md` (modify) | Document the feature |

---

### Task 1: Seeded random number generator

**Files:**
- Create: `dist/rng.mjs`
- Test: `tests/rng.test.mjs`

**Interfaces:**
- Produces: `seededRandom(seed: Uint8Array(≥16) | number[4]) → (() => number in [0,1))` with a read-only `.state: number[4]` property; `seededRandom(fn.state)` resumes the sequence.

- [ ] **Step 1: Write the failing test**

```js
// tests/rng.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {seededRandom} from '../dist/rng.mjs';

const seed = Uint8Array.from({length: 16}, (_, i) => i * 7 + 1);

test('the same seed yields the same sequence in [0, 1)', () => {
  const xs = Array.from({length: 1000}, seededRandom(seed));
  assert.deepEqual(Array.from({length: 1000}, seededRandom(seed)), xs);
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.ok(new Set(xs).size > 990);
});

test('a different seed yields a different sequence', () => {
  const other = seed.map(b => b ^ 0xff);
  assert.notDeepEqual(Array.from({length: 10}, seededRandom(other)), Array.from({length: 10}, seededRandom(seed)));
});

test('saved state resumes the sequence exactly', () => {
  const a = seededRandom(seed);
  for (let i = 0; i < 50; i++) a();
  const b = seededRandom(JSON.parse(JSON.stringify(a.state)));
  assert.deepEqual(Array.from({length: 20}, b), Array.from({length: 20}, a));
});

test('short seeds are rejected', () => {
  assert.throws(() => seededRandom(new Uint8Array(8)), /16 bytes/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/rng.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/rng.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// dist/rng.mjs
// sfc32: fast, and its whole state is four 32-bit numbers, so a match can be saved and replayed exactly.
export function seededRandom(seed) {
  let [a, b, c, d] = Array.isArray(seed) ? seed : fromBytes(seed);
  const random = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  Object.defineProperty(random, 'state', {get: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0]});
  return random;
}

function fromBytes(bytes) {
  const u = new Uint8Array(bytes);
  if (u.length < 16) throw Error('A seed needs 16 bytes.');
  const view = new DataView(u.buffer, u.byteOffset, 16);
  return [0, 4, 8, 12].map(i => view.getUint32(i));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/rng.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add dist/rng.mjs tests/rng.test.mjs
git commit -m "feat: add seeded, serializable random number generator"
```

---

### Task 2: Engine versus mode

**Files:**
- Modify: `dist/engine.mjs` (constructor line 5, `label` line 10, `mulligan`/`keep` lines 16–17, `play` line 49, `targetName` line 50, `attackers` line 58, `blockers` line 60, `advance` line 63, `endTurn` line 65, `actor` line 66)
- Create: `tests/helpers/policy.mjs`
- Test: `tests/engine-versus.test.mjs`

**Interfaces:**
- Consumes: `seededRandom` (Task 1)
- Produces:
  - `new Game(faction, random, {first = 0, mode = 'solo' | 'versus'} = {})`
  - New fields: `game.mode`, `game.first`, `game.mulls: [n, n]`, `game.kept: [bool, bool]`.
  - `get mulligans()` returns `mulls[0]`, for the existing UI and tutorial.
  - `mulligan(p = 0)`, `keep(bottom = [], p = 0)`, `concede(p)`, `verb(p, you, they)`.
  - `actor()` during `opening` returns the first player who hasn't kept.
  - Test helpers:
    - `seeded(n) → random`
    - `choose(game, p) → action`, which returns `{type, …}`
    - `perform(game, p, action)`, which calls the matching engine method.

- [ ] **Step 1: Create the test helper**

```js
// tests/helpers/policy.mjs
import {BY_ID} from '../../dist/cards.mjs';
import {seededRandom} from '../../dist/rng.mjs';

export const seeded = n => seededRandom(Uint8Array.from({length: 16}, (_, i) => (i + 1) * n));

// A simple deterministic player: keeps, casts untargeted cards, attacks with everything, never blocks.
export function choose(g, p) {
  const me = g.players[p];
  if (g.phase === 'opening') return {type: 'keep', bottom: []};
  if (g.phase === 'attack') return {type: 'attackers', uids: me.field.filter(c => g.canAttack(p, c)).map(c => c.uid)};
  if (g.phase === 'block') return {type: 'blockers', assignments: {}};
  if (g.phase === 'cleanup') return {type: 'discard', uids: me.hand.slice(0, me.hand.length - 7).map(c => c.uid)};
  const card = me.hand.find(c => g.legal(p, c) && !BY_ID[c.id].target);
  return card ? {type: 'play', uid: card.uid, target: null} : {type: 'pass'};
}

// Calls the engine method for an action. Seat games return the intent promise from here.
export function perform(g, p, a) {
  switch (a.type) {
    case 'mulligan': return g.mulligan(p);
    case 'keep': return g.keep(a.bottom, p);
    case 'play': return g.play(p, a.uid, a.target);
    case 'pass': return g.pass(p);
    case 'attackers': return g.attackers(p, a.uids);
    case 'blockers': return g.blockers(p, a.assignments);
    case 'discard': return g.discard(a.uids);
    case 'concede': return g.concede(p);
  }
}
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/engine-versus.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {CARDS} from '../dist/cards.mjs';
import {seeded, choose, perform} from './helpers/policy.mjs';

const versus = (first = 0, n = 3) => new Game('blue', seeded(n), {mode: 'versus', first});

test('solo mode is unchanged: only player 0 keeps and goes first', () => {
  const g = new Game('red');
  assert.equal(g.mode, 'solo');
  assert.equal(g.actor(), 0);
  assert.equal(g.mulligans, 0);
  g.keep();
  assert.equal(g.phase, 'upkeep');
  assert.equal(g.active, 0);
  assert.match(g.log[0], /^You take the first turn/);
});

test('versus: both players keep, in any order, before the first turn', () => {
  const g = versus(1);
  assert.equal(g.actor(), 0);
  g.mulligan(1);
  assert.deepEqual(g.mulls, [0, 1]);
  assert.equal(g.mulligans, 0);
  g.keep([], 0);
  assert.equal(g.phase, 'opening');
  assert.equal(g.actor(), 1);
  assert.throws(() => g.keep([], 0), /Choose/);
  assert.throws(() => g.mulligan(0), /No mulligan/);
  assert.throws(() => g.keep([], 1), /Choose 1/);
  const bottom = g.players[1].hand[0];
  g.keep([bottom.uid], 1);
  assert.equal(g.phase, 'upkeep');
  assert.equal(g.active, 1);
  assert.equal(g.priority, 1);
  assert.equal(g.players[1].deck[0].uid, bottom.uid);
  assert.match(g.log[0], /^Red team takes the first turn/);
});

test('versus: the first player skips their first draw', () => {
  const g = versus(1);
  g.keep([], 0); g.keep([], 1);
  const hand = g.players[1].hand.length;
  g.pass(1); g.pass(0);
  assert.equal(g.phase, 'draw');
  assert.equal(g.players[1].hand.length, hand);
});

test('versus log text names factions instead of You/Computer', () => {
  const g = versus(0);
  g.keep([], 0); g.keep([], 1);
  g.phase = 'main1';
  const land = g.card(CARDS.find(c => c.faction === 'blue' && c.type === 'Infrastructure').id);
  g.players[0].hand.push(land);
  g.play(0, land.uid);
  assert.match(g.log[0], /^Blue team plays /);
  assert.equal(g.targetName({kind: 'player', p: 1}), 'Red team capacity');
  assert.ok(g.log.every(line => !/\b(You|Computer)\b/.test(line)), g.log.join('\n'));
});

test('concede ends the match for the other player', () => {
  const g = versus(0);
  g.concede(1);
  assert.equal(g.winner, 0);
  assert.match(g.reason, /Red team left the match/);
  assert.throws(() => g.concede(0), /already ended/);
});

test('60 seeded versus matches finish and conserve cards with either first player', () => {
  for (let n = 1; n <= 60; n++) {
    const g = new Game(n % 2 ? 'blue' : 'red', seeded(n), {mode: 'versus', first: n % 2});
    for (let i = 0; i < 10000 && g.winner === null; i++) { const p = g.actor(); perform(g, p, choose(g, p)); }
    assert.notEqual(g.winner, null, `seed ${n} did not finish`);
    for (let p = 0; p < 2; p++) {
      const q = g.players[p];
      assert.equal(q.deck.length + q.hand.length + q.field.length + q.grave.length + g.stack.filter(s => s.p === p).length, 60, `seed ${n} player ${p}`);
    }
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/engine-versus.test.mjs`
Expected: FAIL. `g.mode` is undefined, `g.mulls` is undefined, and `g.concede` is not a function.

- [ ] **Step 4: Edit `dist/engine.mjs`**

Apply these exact replacements:

1. Line 1: after `import {BY_ID,deck} from './cards.mjs';` add a new line `import {seededRandom} from './rng.mjs';` (used in Task 3).
2. `constructor(faction='blue',random=Math.random){this.random=random;this.uid=0;` → `constructor(faction='blue',random=Math.random,{first=0,mode='solo'}={}){this.random=random;this.mode=mode;this.first=first;this.uid=0;`
3. `this.active=0;this.priority=0;this.phase='opening';` → `this.active=first;this.priority=first;this.phase='opening';`
4. `this.passes=0;this.mulligans=0;this.attacks=[];` → `this.passes=0;this.mulls=[0,0];this.kept=[false,mode==='solo'];this.attacks=[];`
5. Replace the line ` label(p){return p===0?'You':'Computer';}` with:
```js
 label(p){return this.mode==='solo'?(p===0?'You':'Computer'):this.players[p].faction==='blue'?'Blue team':'Red team';}
 verb(p,you,they){return this.mode==='solo'&&p===0?you:they;}
 get mulligans(){return this.mulls[0];}
```
6. Replace the whole `mulligan(){…}` line with:
```js
 mulligan(p=0){if(this.phase!=='opening'||this.kept[p]||this.mulls[p]>=7)throw Error('No mulligan available.');const q=this.players[p];q.deck=this.shuffle([...q.deck,...q.hand]);q.hand=[];this.draw(p,7);const n=++this.mulls[p];this.note(this.mode==='solo'?`Mulligan ${n}: keep seven, then put ${n} on the bottom.`:`${this.label(p)} takes mulligan ${n}.`);}
```
7. Replace the whole `keep(bottom=[]){…}` line with:
```js
 keep(bottom=[],p=0){const n=this.mulls[p],q=this.players[p];if(this.phase!=='opening'||this.kept[p]||!Array.isArray(bottom)||bottom.length!==n||new Set(bottom).size!==n||bottom.some(uid=>!q.hand.some(c=>c.uid===uid)))throw Error(`Choose ${n} cards to put on the bottom.`);for(const uid of bottom){const i=q.hand.findIndex(c=>c.uid===uid);q.deck.unshift(...q.hand.splice(i,1));}this.kept[p]=true;if(this.mode!=='solo')this.note(`${this.label(p)} keeps their opening hand.`);if(!this.kept.every(Boolean))return;this.phase='upkeep';this.note(this.mode==='solo'?'You take the first turn. The starting player skips their first draw.':`${this.label(this.first)} takes the first turn and skips their first draw.`);}
```
8. In `play`: `${p===0?"play":"plays"}` → `${this.verb(p,'play','plays')}` and `${p===0?"cast":"casts"}` → `${this.verb(p,'cast','casts')}`.
9. In `targetName`: `if(t.kind==='player')return t.p===0?'your capacity':'computer capacity';` → ``if(t.kind==='player')return this.mode==='solo'?(t.p===0?'your capacity':'computer capacity'):`${this.label(t.p)} capacity`;``
10. In `attackers`: `${p===0?"attack":"attacks"}` → `${this.verb(p,'attack','attacks')}` and `${p===0?"do":"does"}` → `${this.verb(p,'do','does')}`.
11. In `blockers`: `${p===0?"assign":"assigns"}` → `${this.verb(p,'assign','assigns')}`.
12. In `advance`: `if(!(this.turn===1&&this.active===0))` → `if(!(this.turn===1&&this.active===this.first))`.
13. In `endTurn`: `${this.active===0?"untap and begin":"untaps and begins"}` → `${this.verb(this.active,'untap and begin','untaps and begins')}`.
14. Replace the `actor()` line with:
```js
 actor(){if(this.phase==='opening')return this.kept[0]?1:0;if(['attack','cleanup'].includes(this.phase))return this.active;if(this.phase==='block')return 1-this.active;return this.priority;}
 concede(p){if(this.winner!==null)throw Error('The match has already ended.');this.winner=1-p;this.reason=`${this.label(p)} left the match.`;this.note(this.reason);}
```

- [ ] **Step 5: Run the new and existing tests**

Run: `node --test tests/engine-versus.test.mjs && npm test`
Expected: all PASS, including the existing engine, tutorial, playability, drag and preview suites.

- [ ] **Step 6: Commit**

```bash
git add dist/engine.mjs tests/helpers/policy.mjs tests/engine-versus.test.mjs
git commit -m "feat: add versus mode to the engine (two-player opening, faction log, concede)"
```

---

### Task 3: Engine save and restore

**Files:**
- Modify: `dist/engine.mjs` (add two methods after `concede`)
- Test: `tests/engine-versus.test.mjs` (append)

**Interfaces:**
- Consumes: `seededRandom` (Task 1).
- Produces:
  - `game.toJSON() → plain object`. This is every own field except `random`, plus `rng: number[4] | null`.
  - `Game.fromJSON(json) → Game`. The RNG resumes from `rng`, or falls back to `Math.random` when `rng` is null. The input isn't aliased.

- [ ] **Step 1: Append the failing tests**

```js
test('toJSON/fromJSON restores a match mid-turn and continues identically', () => {
  const g = new Game('blue', seeded(9), {mode: 'versus', first: 1});
  for (let i = 0; i < 120 && g.winner === null; i++) { const p = g.actor(); perform(g, p, choose(g, p)); }
  g.stack.push({card: g.card(CARDS.find(c => c.type === 'Operation').id), p: g.active, target: {kind: 'player', p: 1 - g.active}});
  const json = JSON.parse(JSON.stringify(g.toJSON()));
  const r = Game.fromJSON(json);
  assert.ok(r instanceof Game);
  assert.deepEqual(r.toJSON(), g.toJSON());
  assert.equal(r.mulligans, g.mulligans);
  for (let i = 0; i < 300 && g.winner === null; i++) { const p = g.actor(), a = choose(g, p); perform(g, p, a); perform(r, p, a); }
  assert.deepEqual(r.toJSON(), g.toJSON());
  r.players[0].life = -5;
  assert.notEqual(json.players[0].life, -5, 'a restored game must not share objects with its source');
});

test('solo games save without RNG state and restore with Math.random', () => {
  const json = new Game('red').toJSON();
  assert.equal(json.rng, null);
  assert.equal(Game.fromJSON(json).random, Math.random);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/engine-versus.test.mjs`
Expected: FAIL. `g.toJSON is not a function`.

- [ ] **Step 3: Add to `dist/engine.mjs`, directly after the `concede(p){…}` line**

```js
 toJSON(){const {random,...state}=this;return structuredClone({...state,rng:random.state??null});}
 static fromJSON(json){const {rng,...state}=structuredClone(json);const g=Object.assign(Object.create(Game.prototype),state);g.random=rng?seededRandom(rng):Math.random;return g;}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/engine-versus.test.mjs && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add dist/engine.mjs tests/engine-versus.test.mjs
git commit -m "feat: save and restore games including RNG state"
```

---

### Task 4: Shared protocol helpers

**Files:**
- Create: `dist/protocol.mjs`
- Test: `tests/protocol.test.mjs`

**Interfaces:**
- Consumes: `Game` with `toJSON`/`fromJSON` and the `mode`/`first` options (Tasks 2–3), `seededRandom` (Task 1), and `BY_ID` from `cards.mjs`.
- Produces (all pure, except that the hashing functions are async):
  - **Encoding and randomness**
    - `hex(bytes) → string`
    - `hexBytes(hex) → Uint8Array`
    - `randomHex(n = 16) → string`, which is 2n hex characters
    - `sha256Hex(text) → Promise<string>`, which is 64 hex characters
    - `canonical(value) → string`, which is key-sorted JSON that drops `undefined`
  - **Seed and game creation**
    - `seedHex(hostSecret, guestSecret) → Promise<string>`
    - `versusGame(seedHex, hostFaction) → Game`. Byte 16 of the seed decides the first player (`& 1`).
  - **Views**
    - `flipTarget(target)`
    - `flip(state)`
    - `viewFor(game, p) → view`, which is redacted and has player `p` at index 0
    - `digest(view) → Promise<{all, you, foe, table}>`
  - **Actions**
    - `unflipAction(action)`
    - `actionFields(action) → {type, uid?, target?, uids?, assignments?, bottom?}`
    - `applyAction(game, by, action)`, which throws on illegal or out-of-turn actions
    - `timeoutAction(game, p) → action`

- [ ] **Step 1: Write the failing tests**

```js
// tests/protocol.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {CARDS, BY_ID} from '../dist/cards.mjs';
import {viewFor, flip, flipTarget, unflipAction, applyAction, timeoutAction, canonical, digest, versusGame, seedHex, sha256Hex, randomHex, actionFields} from '../dist/protocol.mjs';

const SEED = 'ab'.repeat(32);
const opened = () => { const g = versusGame(SEED, 'blue'); g.keep([], 0); g.keep([], 1); return g; };
const uidsIn = value => {
  const found = new Set();
  JSON.stringify(value, (key, x) => { if (key === 'uid' && typeof x === 'number') found.add(x); return x; });
  return found;
};

test('versusGame is deterministic and takes the first player from the seed', () => {
  assert.deepEqual(versusGame(SEED, 'blue').toJSON(), versusGame(SEED, 'blue').toJSON());
  assert.equal(versusGame(SEED, 'blue').first, 0xab & 1);
  assert.equal(versusGame(SEED, 'blue').mode, 'versus');
  assert.notDeepEqual(versusGame('cd'.repeat(32), 'blue').players[0].hand, versusGame(SEED, 'blue').players[0].hand);
});

test('hash and seed helpers', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const seed = await seedHex('11', '22');
  assert.match(seed, /^[0-9a-f]{64}$/);
  assert.notEqual(seed, await seedHex('11', '23'));
  assert.match(randomHex(), /^[0-9a-f]{32}$/);
});

test('a guest view hides the host hand and both decks, and puts the guest at index 0', () => {
  const g = opened(), v = viewFor(g, 1);
  assert.equal(v.players[0].faction, 'red');
  assert.equal(v.players[1].faction, 'blue');
  assert.deepEqual(v.players[0].hand, g.players[1].hand);
  assert.equal(v.players[1].hand.length, g.players[0].hand.length);
  assert.ok(v.players[1].hand.every(c => canonical(c) === '{"hidden":true}'));
  assert.ok(v.players.every((q, i) => q.deck.length === g.players[1 - i].deck.length && q.deck.every(c => c.hidden)));
  assert.equal('rng' in v, false);
  const seen = uidsIn(v);
  for (const c of [...g.players[0].hand, ...g.players[0].deck, ...g.players[1].deck]) assert.equal(seen.has(c.uid), false);
});

test('a card returned to the host hand stays hidden under its new uid', () => {
  const g = opened();
  const unit = g.card(CARDS.find(c => c.faction === 'blue' && c.type === 'Unit').id);
  g.players[0].field.push(unit);
  assert.ok(uidsIn(viewFor(g, 1)).has(unit.uid));
  g.players[0].field = [];
  unit.uid = ++g.uid;
  g.players[0].hand.push(unit);
  assert.equal(uidsIn(viewFor(g, 1)).has(unit.uid), false);
});

test('the host view is redacted but not flipped; flip is its own inverse', () => {
  const g = opened();
  g.stack.push({card: g.card('r2'), p: 1, target: {kind: 'player', p: 0}});
  const v0 = viewFor(g, 0), v1 = viewFor(g, 1);
  assert.equal(v0.players[0].faction, 'blue');
  assert.ok(v0.players[1].hand.every(c => c.hidden));
  assert.equal(v1.stack[0].p, 0);
  assert.deepEqual(v1.stack[0].target, {kind: 'player', p: 1});
  assert.equal(v1.active, 1 - g.active);
  assert.equal(v1.first, 1 - g.first);
  assert.deepEqual(v1.kept, [...g.kept].reverse());
  assert.deepEqual(flip(flip(v1)), v1);
  assert.deepEqual(flipTarget({kind: 'card', uid: 5}), {kind: 'card', uid: 5});
});

test('a view rebuilds into a Game that answers the interface queries', () => {
  const g = opened(), local = Game.fromJSON(viewFor(g, 1));
  assert.equal(local.actor(), g.actor() === 1 ? 0 : 1);
  for (const c of local.players[0].hand) {
    const real = g.players[1].hand.find(x => x.uid === c.uid);
    assert.deepEqual(local.playIssues(0, c), g.playIssues(1, real));
  }
});

test('guest targets translate back to host indices', () => {
  assert.deepEqual(unflipAction({type: 'play', uid: 4, target: {kind: 'player', p: 1}}), {type: 'play', uid: 4, target: {kind: 'player', p: 0}});
  assert.deepEqual(unflipAction({type: 'pass'}), {type: 'pass'});
  assert.deepEqual(actionFields({type: 'pass', n: 3, by: 1, seq: 9}), {type: 'pass'});
});

test('applyAction enforces turn order and rejects unknown players and actions', () => {
  const g = versusGame(SEED, 'blue');
  applyAction(g, 1, {type: 'keep', bottom: []});
  applyAction(g, 0, {type: 'keep'});
  const a = g.actor(), b = 1 - a;
  assert.throws(() => applyAction(g, b, {type: 'pass'}), /Wait for your turn/);
  assert.throws(() => applyAction(g, a, {type: 'hack'}), /Unknown action/);
  assert.throws(() => applyAction(g, 2, {type: 'pass'}), /Unknown player/);
  applyAction(g, a, {type: 'pass'});
  assert.equal(g.actor(), b);
});

test('timeouts keep, skip attacks and blocks, discard the costliest cards, or pass', () => {
  const g = versusGame(SEED, 'blue');
  g.mulligan(0);
  const keep = timeoutAction(g, 0);
  assert.equal(keep.type, 'keep');
  assert.equal(keep.bottom.length, 1);
  assert.equal(BY_ID[g.find(keep.bottom[0]).card.id].cost, Math.max(...g.players[0].hand.map(c => BY_ID[c.id].cost)));
  applyAction(g, 0, keep);
  applyAction(g, 1, timeoutAction(g, 1));
  assert.equal(g.phase, 'upkeep');
  assert.deepEqual(timeoutAction(g, g.actor()), {type: 'pass'});
  g.phase = 'attack';
  assert.deepEqual(timeoutAction(g, g.active), {type: 'attackers', uids: []});
  g.phase = 'block';
  assert.deepEqual(timeoutAction(g, 1 - g.active), {type: 'blockers', assignments: {}});
  g.phase = 'cleanup';
  const q = g.players[g.active], top = CARDS.filter(c => c.faction === q.faction).sort((x, y) => y.cost - x.cost)[0];
  while (q.hand.length < 9) q.hand.push(g.card(top.id));
  const discard = timeoutAction(g, g.active);
  assert.equal(discard.uids.length, 2);
  assert.ok(discard.uids.every(uid => BY_ID[g.find(uid).card.id].cost === top.cost));
});

test('canonical JSON ignores key order; digests pinpoint the changed section', async () => {
  assert.equal(canonical({b: 1, a: [2, {d: 3, c: undefined}]}), '{"a":[2,{"d":3}],"b":1}');
  const v = viewFor(opened(), 1), d = await digest(v);
  const changed = structuredClone(v);
  changed.players[1].life += 1;
  const e = await digest(changed);
  assert.notEqual(e.all, d.all);
  assert.equal(e.you, d.you);
  assert.notEqual(e.foe, d.foe);
  assert.equal(e.table, d.table);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/protocol.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/protocol.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// dist/protocol.mjs
// Shared by the host referee and the guest's audit, so both apply identical rules and redaction.
import {Game} from './engine.mjs';
import {BY_ID} from './cards.mjs';
import {seededRandom} from './rng.mjs';

export const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
export const hexBytes = h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16));
export const randomHex = (n = 16) => hex(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256Hex(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

// Key-sorted JSON, so a view hashes the same on both machines regardless of property order.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(x => canonical(x ?? null)).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export const seedHex = (hostSecret, guestSecret) => sha256Hex(`${hostSecret}:${guestSecret}`);
export function versusGame(seed, hostFaction) {
  const bytes = hexBytes(seed);
  return new Game(hostFaction, seededRandom(bytes.slice(0, 16)), {mode: 'versus', first: bytes[16] & 1});
}

const other = p => (p === 0 || p === 1 ? 1 - p : p);
export const flipTarget = t => (t?.kind === 'player' ? {...t, p: 1 - t.p} : t);
export function flip(state) {
  const f = structuredClone(state);
  f.players.reverse(); f.mulls.reverse(); f.kept.reverse();
  for (const k of ['active', 'priority', 'first', 'winner']) f[k] = other(f[k]);
  f.stack = f.stack.map(s => ({...s, p: 1 - s.p, target: flipTarget(s.target)}));
  return f;
}

// Deck lists are public and uids follow deck-list order, so hidden cards must never carry a uid.
const hidden = () => ({hidden: true});
export function viewFor(game, p) {
  const {rng, ...state} = game.toJSON();
  state.players = state.players.map((q, i) => ({...q, deck: q.deck.map(hidden), hand: i === p ? q.hand : q.hand.map(hidden)}));
  return p === 0 ? state : flip(state);
}

export const unflipAction = a => (a.type === 'play' ? {...a, target: flipTarget(a.target ?? null)} : a);
export const actionFields = ({type, uid, target, uids, assignments, bottom}) =>
  Object.fromEntries(Object.entries({type, uid, target, uids, assignments, bottom}).filter(([, v]) => v !== undefined));

const list = x => (Array.isArray(x) ? x : []);
const ANY_ORDER = ['mulligan', 'keep', 'concede'];
export function applyAction(game, by, a) {
  if (by !== 0 && by !== 1) throw Error('Unknown player.');
  if (!ANY_ORDER.includes(a.type) && game.actor() !== by) throw Error('Wait for your turn to act.');
  switch (a.type) {
    case 'mulligan': return game.mulligan(by);
    case 'keep': return game.keep(list(a.bottom), by);
    case 'play': return game.play(by, a.uid, a.target ?? null);
    case 'pass': return game.pass(by);
    case 'attackers': return game.attackers(by, list(a.uids));
    case 'blockers': return game.blockers(by, a.assignments && typeof a.assignments === 'object' ? a.assignments : {});
    case 'discard': return game.discard(list(a.uids));
    case 'concede': return game.concede(by);
    default: throw Error('Unknown action.');
  }
}

const byCost = (a, b) => BY_ID[b.id].cost - BY_ID[a.id].cost;
export function timeoutAction(game, p) {
  const hand = game.players[p].hand;
  if (game.phase === 'opening') return {type: 'keep', bottom: [...hand].sort(byCost).slice(0, game.mulls[p]).map(c => c.uid)};
  if (game.phase === 'attack') return {type: 'attackers', uids: []};
  if (game.phase === 'block') return {type: 'blockers', assignments: {}};
  if (game.phase === 'cleanup') return {type: 'discard', uids: [...hand].sort(byCost).slice(0, hand.length - 7).map(c => c.uid)};
  return {type: 'pass'};
}

// Short per-section hashes let the audit say what diverged without storing every view.
export async function digest(view) {
  const [all, you, foe, table] = await Promise.all(
    [view, view.players[0], view.players[1], {...view, players: null}].map(x => sha256Hex(canonical(x))));
  return {all, you: you.slice(0, 12), foe: foe.slice(0, 12), table: table.slice(0, 12)};
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/protocol.test.mjs`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add dist/protocol.mjs tests/protocol.test.mjs
git commit -m "feat: add shared versus protocol (views, actions, timeouts, hashing)"
```

---

### Task 5: Match referee

**Files:**
- Create: `dist/match.mjs`
- Create: `tests/helpers/versus.mjs`
- Test: `tests/match.test.mjs`

**Interfaces:**
- Consumes: `Game` (Tasks 2–3); `applyAction`, `unflipAction`, `actionFields`, `viewFor`, `versusGame`, `seedHex` (Task 4).
- Produces:
  - **Creating and restoring**
    - `Match.create({hostFaction, hostSecret, guestSecret, seedCommit}, {now, schedule, cancel}?) → Promise<Match>`
    - `Match.fromJSON(json, options) → Match`, which starts with `guestConnected = false`
  - **State**
    - Fields: `game`, `log: entry[]`, `lastSeq`, `pledged: [bool, bool]`, `guestConnected`, `timer`
    - Getters: `started` and `ended`
    - A log entry is `{type, …actionFields, n, by, seq, timeout}`
  - **Methods**
    - `pledge(p)`
    - `connect(on)`
    - `submit(by, action, seq = null) → {ok: true, entry} | {ok: true, duplicate: true} | {ok: false, error}`. Guest (`by === 1`) actions arrive in guest perspective and are un-flipped here.
    - `apply(by, action, seq, timeout)`, used internally and by the clocks
    - `view(p)`
    - `toJSON()`
  - **Callback:** `onChange(info)` fires with `{}` when the match starts and `{entry}` after each applied action.
  - **Clock methods:** `retime()`, `stop()` and `clockFor(p)` exist as stubs here and are implemented in Task 6.
  - **Test helpers:**
    - `fakeTime()` returns `{now, schedule, cancel, advance(ms)}`.
    - `newMatch(time)`, `startedMatch(time)` and `openedMatch(time)` return matches that are created, then pledged, then have both hands kept.
    - `act(m, p, action)` submits with an auto-incremented guest `seq`.

- [ ] **Step 1: Create the test helper**

```js
// tests/helpers/versus.mjs
import {Match} from '../../dist/match.mjs';

// Deterministic stand-in for Date.now/setTimeout/clearTimeout.
export function fakeTime() {
  let t = 0;
  const timers = new Set();
  return {
    now: () => t,
    schedule(fn, ms) { const h = {fn, at: t + Math.max(0, ms)}; timers.add(h); return h; },
    cancel(h) { timers.delete(h); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter(h => h.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due);
        t = due.at;
        due.fn();
      }
      t = end;
    },
  };
}

let seq = 1000;
export const act = (m, p, action) => m.submit(p, action, p === 1 ? ++seq : null);

export async function newMatch(time = fakeTime()) {
  const m = await Match.create({hostFaction: 'blue', hostSecret: 'a'.repeat(32), guestSecret: 'b'.repeat(32), seedCommit: 'c'.repeat(64)}, time);
  m.connect(true);
  return m;
}
export async function startedMatch(time) {
  const m = await newMatch(time);
  m.pledge(0); m.pledge(1);
  return m;
}
export async function openedMatch(time) {
  const m = await startedMatch(time);
  act(m, 0, {type: 'keep'}); act(m, 1, {type: 'keep'});
  return m;
}
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/match.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../dist/match.mjs';
import {CARDS} from '../dist/cards.mjs';
import {applyAction, canonical, seedHex, unflipAction, versusGame} from '../dist/protocol.mjs';
import {choose} from './helpers/policy.mjs';
import {act, fakeTime, newMatch, openedMatch} from './helpers/versus.mjs';

test('nothing happens until both players take the pledge', async () => {
  const m = await newMatch(), changes = [];
  m.onChange = c => changes.push(c);
  assert.match(m.submit(0, {type: 'keep'}).error, /pledge/);
  m.pledge(0);
  assert.equal(changes.length, 0);
  m.pledge(1);
  assert.equal(m.started, true);
  assert.deepEqual(changes, [{}]);
  assert.equal(m.submit(0, {type: 'keep'}).ok, true);
  assert.equal(changes[1].entry.type, 'keep');
  assert.equal(changes[1].entry.n, 1);
});

test('players cannot act out of turn, and a rejected action changes nothing', async () => {
  const m = await openedMatch(), a = m.game.actor(), b = 1 - a;
  const before = canonical(m.game.toJSON());
  assert.match(act(m, b, {type: 'pass'}).error, /Wait for your turn/);
  assert.equal(act(m, a, {type: 'blockers', assignments: {1: 5}}).ok, false);
  assert.equal(act(m, a, null).ok, false);
  assert.equal(canonical(m.game.toJSON()), before);
  assert.equal(m.log.length, 2);
});

test('guest targets are stored in host indices', async () => {
  const m = await openedMatch(), g = m.game;
  Object.assign(g, {phase: 'main1', active: 1, priority: 1});
  const id = name => CARDS.find(c => c.name === name).id;
  for (let i = 0; i < 10; i++) g.players[1].field.push(g.card(id('Relay Node')));
  const dos = g.card(id('Denial of Service'));
  g.players[1].hand.push(dos);
  const r = m.submit(1, {type: 'play', uid: dos.uid, target: {kind: 'player', p: 1}}, 7);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.entry.target, {kind: 'player', p: 0});
  assert.deepEqual(m.game.stack.at(-1).target, {kind: 'player', p: 0});
});

test('a repeated guest intent is applied once', async () => {
  const m = await openedMatch();
  Object.assign(m.game, {phase: 'main1', active: 1, priority: 1});
  assert.equal(m.submit(1, {type: 'pass'}, 5000).ok, true);
  const length = m.log.length;
  assert.deepEqual(m.submit(1, {type: 'pass'}, 5000), {ok: true, duplicate: true});
  assert.equal(m.log.length, length);
});

test('while the guest is away only concede is accepted', async () => {
  const m = await openedMatch();
  m.connect(false);
  assert.match(act(m, m.game.actor(), {type: 'pass'}).error, /disconnected/);
  assert.equal(m.submit(0, {type: 'concede'}).ok, true);
  assert.equal(m.game.winner, 1);
  assert.equal(m.ended, true);
  assert.match(act(m, 1, {type: 'pass'}).error, /ended/);
});

test('the log replays to the same state from the seed', async () => {
  const m = await openedMatch();
  for (let i = 0; i < 200 && !m.ended; i++) {
    const p = m.game.actor(), a = choose(m.game, p);
    assert.equal(act(m, p, p === 1 ? unflipAction(a) : a).ok, true);
  }
  const replay = versusGame(await seedHex('a'.repeat(32), 'b'.repeat(32)), 'blue');
  for (const entry of m.log) applyAction(replay, entry.by, entry);
  assert.equal(canonical(replay.toJSON()), canonical(m.game.toJSON()));
});

test('a saved match restores its game, log and pledges, and waits for the guest', async () => {
  const m = await openedMatch();
  act(m, m.game.actor(), {type: 'pass'});
  const r = Match.fromJSON(JSON.parse(JSON.stringify(m.toJSON())), fakeTime());
  assert.equal(canonical(r.game.toJSON()), canonical(m.game.toJSON()));
  assert.deepEqual(r.log, m.log);
  assert.equal(r.lastSeq, m.lastSeq);
  assert.equal(r.started, true);
  assert.equal(r.guestConnected, false);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/match.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/match.mjs'`.

- [ ] **Step 4: Write the implementation**

```js
// dist/match.mjs
import {Game} from './engine.mjs';
import {actionFields, applyAction, seedHex, unflipAction, versusGame, viewFor} from './protocol.mjs';

// Host-side referee: every change to a versus match, from either player, goes through here.
export class Match {
  static async create({hostFaction, hostSecret, guestSecret, seedCommit}, options) {
    const game = versusGame(await seedHex(hostSecret, guestSecret), hostFaction);
    return new Match({hostFaction, hostSecret, guestSecret, seedCommit, game: game.toJSON()}, options);
  }
  static fromJSON(json, options) { return new Match(json, options); }

  constructor(state, {now = Date.now, schedule = setTimeout, cancel = clearTimeout} = {}) {
    const {hostFaction, hostSecret, guestSecret, seedCommit} = state;
    Object.assign(this, {hostFaction, hostSecret, guestSecret, seedCommit, now, schedule, cancel});
    this.game = Game.fromJSON(state.game);
    this.log = state.log ?? [];
    this.lastSeq = state.lastSeq ?? 0;
    this.pledged = state.pledged ?? [false, false];
    this.guestConnected = false;
    this.timer = null;
    this.onChange = () => {};
  }

  get started() { return this.pledged[0] && this.pledged[1]; }
  get ended() { return this.game.winner !== null; }

  pledge(p) {
    if (this.pledged[p]) return;
    this.pledged[p] = true;
    if (this.started) { this.retime(); this.onChange({}); }
  }

  connect(on) {
    this.guestConnected = on;
    this.retime();
  }

  submit(by, action, seq = null) {
    if (by === 1 && seq !== null && seq <= this.lastSeq) return {ok: true, duplicate: true};
    const error = !this.started ? 'Both players must take the pledge first.'
      : this.ended ? 'The match has ended.'
      : !this.guestConnected && action?.type !== 'concede' ? 'Your opponent is disconnected. The match is paused until they return.'
      : !action || typeof action !== 'object' ? 'Unknown action.'
      : null;
    if (error) return {ok: false, error};
    const result = this.apply(by, by === 1 ? unflipAction(action) : action, seq, false);
    if (result.ok && by === 1 && seq !== null) this.lastSeq = seq;
    return result;
  }

  // Applies atomically: an engine error restores the exact previous state.
  apply(by, action, seq, timeout) {
    const before = this.game.toJSON();
    try { applyAction(this.game, by, action); }
    catch (e) { this.game = Game.fromJSON(before); return {ok: false, error: e.message}; }
    const entry = {...actionFields(action), n: this.log.length + 1, by, seq, timeout};
    this.log.push(entry);
    this.retime(true);
    this.onChange({entry});
    return {ok: true, entry};
  }

  view(p) { return viewFor(this.game, p); }

  // Clock stubs; Task 6 replaces these three methods.
  retime() {}
  stop() {}
  clockFor() { return null; }

  toJSON() {
    const {hostFaction, hostSecret, guestSecret, seedCommit, log, lastSeq, pledged} = this;
    return structuredClone({v: 1, hostFaction, hostSecret, guestSecret, seedCommit, log, lastSeq, pledged, game: this.game.toJSON()});
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/match.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add dist/match.mjs tests/helpers/versus.mjs tests/match.test.mjs
git commit -m "feat: add host-side match referee with action log and pledge gate"
```

---

### Task 6: Match clocks

**Files:**
- Modify: `dist/match.mjs`
- Test: `tests/clock.test.mjs`

**Interfaces:**
- Consumes: `timeoutAction` (Task 4), `Match` (Task 5)
- Produces:
  - Constants: `TURN_MS = 90_000`, `RESPONSE_MS = 20_000`, `OPENING_MS = 60_000`.
  - `match.clock = {turn, turnLeft, responseLeft, openingLeft, running: null | {kind, since}}`
  - `match.retime(fresh = false)` starts whichever clock applies; `fresh` resets the response clock.
  - `match.stop()` banks the elapsed time and cancels the timer.
  - `match.clockFor(p) → {kind: 'opening' | 'turn' | 'response' | null, owner: 0 | 1 | null, left: ms | null, paused: bool}`. `owner` is in `p`'s perspective, where 0 means "you".
  - `toJSON()` now includes `clock`, with time banked.

- [ ] **Step 1: Write the failing tests**

```js
// tests/clock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Match, TURN_MS, RESPONSE_MS, OPENING_MS} from '../dist/match.mjs';
import {BY_ID} from '../dist/cards.mjs';
import {act, fakeTime, openedMatch, startedMatch} from './helpers/versus.mjs';

test('opening hands are kept automatically after 60 s, bottoming the costliest cards', async () => {
  const time = fakeTime(), m = await startedMatch(time);
  act(m, 0, {type: 'mulligan'});
  const worst = Math.max(...m.game.players[0].hand.map(c => BY_ID[c.id].cost));
  time.advance(OPENING_MS - 1);
  assert.equal(m.game.phase, 'opening');
  time.advance(1);
  assert.equal(m.game.phase, 'upkeep');
  assert.deepEqual(m.log.filter(e => e.type === 'keep').map(e => [e.by, e.timeout]), [[0, true], [1, true]]);
  assert.equal(BY_ID[m.game.players[0].deck[0].id].cost, worst);
});

test('the active player gets 90 s per turn, then auto-passes for the rest of it', async () => {
  const time = fakeTime(), m = await openedMatch(time), a = m.game.active;
  time.advance(TURN_MS - 1);
  assert.equal(m.log.length, 2);
  time.advance(1);
  assert.equal(m.log.at(-1).by, a);
  assert.equal(m.log.at(-1).type, 'pass');
  assert.equal(m.log.at(-1).timeout, true);
  for (let i = 0; i < 40 && m.game.turn === 1; i++) time.advance(RESPONSE_MS);
  assert.equal(m.game.turn, 2);
  assert.ok(m.log.slice(2).every(e => e.timeout));
});

test('each response gets 20 s and does not use the active player’s turn clock', async () => {
  const time = fakeTime(), m = await openedMatch(time), a = m.game.active, b = 1 - a;
  time.advance(10_000);
  act(m, a, {type: 'pass'});
  assert.deepEqual(m.clockFor(b), {kind: 'response', owner: 0, left: RESPONSE_MS, paused: false});
  time.advance(RESPONSE_MS - 1);
  assert.equal(m.log.at(-1).timeout, false);
  act(m, b, {type: 'pass'});
  assert.deepEqual(m.clockFor(a), {kind: 'turn', owner: 0, left: TURN_MS - 10_000, paused: false});
  assert.equal(m.clockFor(b).owner, 1);
});

test('clocks pause while the guest is disconnected and resume with the time left', async () => {
  const time = fakeTime(), m = await openedMatch(time);
  time.advance(30_000);
  m.connect(false);
  assert.equal(m.clockFor(0).paused, true);
  time.advance(10 * 60_000);
  assert.equal(m.log.length, 2);
  m.connect(true);
  assert.equal(m.clockFor(0).left, TURN_MS - 30_000);
});

test('a restored match keeps the banked clock time', async () => {
  const time = fakeTime(), m = await openedMatch(time);
  time.advance(30_000);
  const r = Match.fromJSON(JSON.parse(JSON.stringify(m.toJSON())), time);
  m.stop();
  r.connect(true);
  assert.equal(r.clockFor(0).left, TURN_MS - 30_000);
});

test('the clock stops when the match ends', async () => {
  const time = fakeTime(), m = await openedMatch(time);
  m.submit(0, {type: 'concede'});
  assert.equal(m.timer, null);
  assert.deepEqual(m.clockFor(0), {kind: null, owner: null, left: null, paused: false});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/clock.test.mjs`
Expected: FAIL. `TURN_MS` isn't exported and the phase stays `opening`.

- [ ] **Step 3: Edit `dist/match.mjs`**

Change the protocol import to also bring in `timeoutAction`:

```js
import {actionFields, applyAction, seedHex, timeoutAction, unflipAction, versusGame, viewFor} from './protocol.mjs';

export const TURN_MS = 90_000, RESPONSE_MS = 20_000, OPENING_MS = 60_000;
const freshClock = () => ({turn: 1, turnLeft: TURN_MS, responseLeft: RESPONSE_MS, openingLeft: OPENING_MS, running: null});
```

In the constructor, after `this.timer = null;` add:

```js
    this.clock = state.clock ? {...state.clock, running: null} : freshClock();
```

Replace the three stub methods and their comment with:

```js
  // Banks the time used so far, then starts whichever clock now applies.
  retime(fresh = false) {
    this.stop();
    const g = this.game, c = this.clock;
    if (!this.started || !this.guestConnected || this.ended) return;
    let kind = 'openingLeft';
    if (g.phase !== 'opening') {
      if (c.turn !== g.turn) Object.assign(c, {turn: g.turn, turnLeft: TURN_MS});
      kind = g.actor() === g.active ? 'turnLeft' : 'responseLeft';
      if (kind === 'responseLeft' && fresh) c.responseLeft = RESPONSE_MS;
    }
    c.running = {kind, since: this.now()};
    this.timer = this.schedule(() => this.expire(), c[kind]);
  }

  stop() {
    const c = this.clock, r = c.running;
    if (r) c[r.kind] = Math.max(0, c[r.kind] - (this.now() - r.since));
    c.running = null;
    this.cancel(this.timer);
    this.timer = null;
  }

  expire() {
    this.stop();
    const g = this.game;
    const late = g.phase === 'opening' ? [0, 1].filter(p => !g.kept[p]) : [g.actor()];
    for (const p of late) if (!this.ended) this.apply(p, timeoutAction(this.game, p), null, true);
  }

  clockFor(p) {
    const c = this.clock, r = c.running;
    if (!r) return {kind: null, owner: null, left: null, paused: this.started && !this.ended && !this.guestConnected};
    const actor = this.game.phase === 'opening' ? null : this.game.actor();
    return {kind: r.kind.replace('Left', ''), owner: actor === null ? null : p === 0 ? actor : 1 - actor, left: Math.max(0, c[r.kind] - (this.now() - r.since)), paused: false};
  }
```

Replace `toJSON()` with:

```js
  toJSON() {
    const {hostFaction, hostSecret, guestSecret, seedCommit, log, lastSeq, pledged} = this;
    const clock = {...this.clock, running: null}, r = this.clock.running;
    if (r) clock[r.kind] = Math.max(0, clock[r.kind] - (this.now() - r.since));
    return structuredClone({v: 1, hostFaction, hostSecret, guestSecret, seedCommit, log, lastSeq, pledged, clock, game: this.game.toJSON()});
  }
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/clock.test.mjs tests/match.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add dist/match.mjs tests/clock.test.mjs
git commit -m "feat: add opening, turn and response clocks with auto-actions and pause"
```

---

### Task 7: Post-match audit

**Files:**
- Create: `dist/audit.mjs`
- Test: `tests/audit.test.mjs`

**Interfaces:**
- Consumes: Everything in `protocol.mjs` (Task 4), and `Match` in tests (Tasks 5–6).
- Produces: `audit({seedCommit, hostSecret, guestSecret, hostFaction, log, digests, sent}) → Promise<{result: 'verified'} | {result: 'tampered', turn, reason} | {result: 'unverified', reason}>`.
  - `digests[i]` is the `digest()` of the guest view after log entry `i`, where index 0 is the start. Entries may be missing in the middle, but `digests[0]` and `digests[log.length]` are required.
  - `sent[seq]` is the intent the guest sent, in guest perspective.

- [ ] **Step 1: Write the failing tests**

```js
// tests/audit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {audit} from '../dist/audit.mjs';
import {Match} from '../dist/match.mjs';
import {digest, randomHex, sha256Hex, unflipAction, viewFor} from '../dist/protocol.mjs';
import {choose} from './helpers/policy.mjs';
import {fakeTime} from './helpers/versus.mjs';

// Plays a full match the way the guest would record it. `tamper` simulates a cheating host.
async function record(tamper = () => {}) {
  const hostSecret = randomHex(), guestSecret = randomHex();
  const m = await Match.create({hostFaction: 'blue', hostSecret, guestSecret, seedCommit: await sha256Hex(hostSecret)}, fakeTime());
  const views = [], sent = {};
  let seq = 0;
  m.onChange = ({entry}) => { views[entry ? entry.n : 0] = m.view(1); };
  m.connect(true); m.pledge(0); m.pledge(1);
  for (let i = 0; i < 1500 && !m.ended; i++) {
    tamper(m, i);
    const p = m.game.actor(), a = choose(m.game, p);
    if (p === 1) { sent[++seq] = unflipAction(a); assert.equal(m.submit(1, sent[seq], seq).ok, true); }
    else assert.equal(m.submit(0, a).ok, true);
  }
  if (!m.ended) m.submit(0, {type: 'concede'});
  return {seedCommit: m.seedCommit, hostSecret, guestSecret, hostFaction: 'blue', log: structuredClone(m.log), sent, digests: await Promise.all(views.map(digest))};
}

test('an honest match verifies, even with gaps in the middle of the record', async () => {
  const rec = await record();
  assert.deepEqual(await audit(rec), {result: 'verified'});
  rec.digests[5] = null;
  assert.deepEqual(await audit(rec), {result: 'verified'});
});

test('a seed that does not match the commitment is tampering', async () => {
  const rec = await record();
  const r = await audit({...rec, hostSecret: randomHex()});
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /committed/);
});

test('no reveal or an incomplete record is unverified', async () => {
  const rec = await record();
  assert.equal((await audit({...rec, hostSecret: null})).result, 'unverified');
  const r = await audit({...rec, digests: rec.digests.slice(0, 5)});
  assert.equal(r.result, 'unverified');
  assert.match(r.reason, /incomplete/);
});

test('a stacked guest deck is caught when the guest draws', async () => {
  const rec = await record((m, i) => {
    if (i !== 20) return;
    const deck = m.game.players[1].deck, top = deck.length - 1;
    const j = deck.findIndex(c => c.id !== deck[top].id);
    [deck[top], deck[j]] = [deck[j], deck[top]];
  });
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /Your cards/);
});

test('an edited host capacity is caught', async () => {
  const rec = await record((m, i) => { if (i === 30) m.game.players[0].life += 5; });
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /opponent’s cards or capacity/);
});

test('an opening hand that is not the fair shuffle is caught', async () => {
  const rec = await record();
  const other = await record();
  const r = await audit({...rec, digests: [other.digests[0], ...rec.digests.slice(1)]});
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /opening hand/);
});

test('an illegal host move and a forged guest move are caught', async () => {
  const rec = await record();
  const illegal = structuredClone(rec.log);
  const k = illegal.findIndex(e => e.by === 0 && e.type === 'pass');
  illegal[k] = {...illegal[k], type: 'play', uid: 99999};
  assert.match((await audit({...rec, log: illegal})).reason, /rules do not allow/);
  const forged = structuredClone(rec.log);
  const f = forged.findIndex(e => e.by === 1 && !e.timeout && e.type === 'pass');
  forged[f] = {...forged[f], type: 'concede'};
  assert.match((await audit({...rec, log: forged})).reason, /never made/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/audit.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/audit.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// dist/audit.mjs
import {actionFields, applyAction, canonical, digest, seedHex, sha256Hex, unflipAction, versusGame, viewFor} from './protocol.mjs';

const PARTS = {you: 'Your cards or capacity', foe: 'Your opponent’s cards or capacity', table: 'The turn, stack or combat state'};
const same = (a, b) => canonical(actionFields(a)) === canonical(actionFields(b));

// Replays a finished match from the revealed seed and compares it with what this player actually saw.
export async function audit({seedCommit, hostSecret, guestSecret, hostFaction, log = [], digests = [], sent = {}}) {
  const unverified = reason => ({result: 'unverified', reason});
  const tampered = (turn, reason) => ({result: 'tampered', turn, reason});
  if (!hostSecret) return unverified('Your opponent left before revealing the match seed.');
  if (!guestSecret || !digests[0] || !digests[log.length]) return unverified('Your saved record of this match is incomplete.');
  if (await sha256Hex(hostSecret) !== seedCommit) return tampered(1, 'The revealed seed does not match the one your opponent committed to.');

  const game = versusGame(await seedHex(hostSecret, guestSecret), hostFaction);
  const compare = async (i, turn) => {
    const want = digests[i];
    if (!want) return null; // Not seen live (e.g. while reconnecting); later views still cover this state.
    const got = await digest(viewFor(game, 1));
    if (got.all === want.all) return null;
    const part = ['you', 'foe', 'table'].find(k => got[k] !== want[k]) ?? 'table';
    return tampered(turn, i === 0 && part === 'you' ? 'Your opening hand differs from a fair shuffle.' : `${PARTS[part]} differ from a fair replay.`);
  };

  let problem = await compare(0, 1);
  for (const [i, entry] of log.entries()) {
    if (problem) return problem;
    const turn = game.turn;
    if (entry.n !== i + 1) return unverified('Your saved record of this match is incomplete.');
    if (entry.by === 1 && !entry.timeout && !(sent[entry.seq] && same(unflipAction(sent[entry.seq]), entry))) {
      return tampered(turn, 'A move was recorded for you that you never made.');
    }
    try { applyAction(game, entry.by, entry); }
    catch { return tampered(turn, 'Your opponent made a move the rules do not allow.'); }
    problem = await compare(i + 1, turn);
  }
  return problem ?? {result: 'verified'};
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/audit.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add dist/audit.mjs tests/audit.test.mjs
git commit -m "feat: add post-match replay audit"
```

---

### Task 8: Seat (view-backed game for the UI)

**Files:**
- Create: `dist/remote.mjs`
- Test: `tests/remote.test.mjs`

**Interfaces:**
- Consumes: `Game.fromJSON` (Task 3); `viewFor`/`versusGame` in tests (Task 4).
- Produces: `new Seat(send(action, seq), {seq = 0, now = Date.now})`.
  - `seat.update({view, clock?, ackSeq?})` sets the new `seat.game` and `seat.clock = {...clock, at}`. It then calls `onUpdate(game, {mine})`, and then resolves the pending intent `ackSeq`.
  - `seat.reject(seq, message)`
  - `seat.dropPending(message)`
  - On `seat.game`, the methods `mulligan`, `keep`, `play`, `pass`, `attackers`, `blockers`, `discard` and `concede` each return a Promise and send an intent. The UI doesn't need to pass player indices; they're ignored.

- [ ] **Step 1: Write the failing tests**

```js
// tests/remote.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Seat} from '../dist/remote.mjs';
import {versusGame, viewFor} from '../dist/protocol.mjs';

const CLOCK = {kind: 'opening', owner: null, left: 60000, paused: false};
function seat(options = {}) {
  const sent = [], g = versusGame('ab'.repeat(32), 'blue');
  const s = new Seat((action, seq) => sent.push({action, seq}), {now: () => 1000, ...options});
  s.update({view: viewFor(g, 1), clock: CLOCK});
  return {s, sent, g};
}

test('read-only queries answer from the guest view', () => {
  const {s} = seat();
  assert.equal(s.game.players[0].faction, 'red');
  assert.equal(s.game.players[0].hand.length, 7);
  assert.ok(s.game.players[1].hand.every(c => c.hidden));
  assert.deepEqual(s.clock, {...CLOCK, at: 1000});
  assert.ok(s.game.playIssues(0, s.game.players[0].hand[0]).some(i => i.code === 'opening'));
});

test('mutators send intents instead of changing local state', () => {
  const {s, sent} = seat(), before = JSON.stringify(s.game.toJSON());
  const bottom = [s.game.players[0].hand[0].uid];
  s.game.keep(bottom); s.game.play(0, 5, {kind: 'player', p: 1}); s.game.pass(0);
  s.game.attackers(0, [1]); s.game.blockers(0, {1: [2]}); s.game.discard([3]);
  s.game.mulligan(); s.game.concede(0);
  assert.deepEqual(sent.map(x => x.action), [
    {type: 'keep', bottom}, {type: 'play', uid: 5, target: {kind: 'player', p: 1}}, {type: 'pass'},
    {type: 'attackers', uids: [1]}, {type: 'blockers', assignments: {1: [2]}}, {type: 'discard', uids: [3]},
    {type: 'mulligan'}, {type: 'concede'},
  ]);
  assert.deepEqual(sent.map(x => x.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(JSON.stringify(s.game.toJSON()), before);
});

test('an acknowledged intent resolves after the new state is in place', async () => {
  const {s, g} = seat(), updates = [];
  s.onUpdate = (game, info) => updates.push([game, info]);
  const done = s.game.keep([]);
  g.keep([], 1);
  s.update({view: viewFor(g, 1), clock: null, ackSeq: 1});
  await done;
  assert.equal(s.game.kept[0], true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], s.game);
  assert.deepEqual(updates[0][1], {mine: true});
  assert.equal(s.clock, null);
});

test('a rejected intent rejects with the host message; other updates are not mine', async () => {
  const {s, g} = seat(), infos = [];
  s.onUpdate = (_, info) => infos.push(info);
  const pending = s.game.pass(0);
  s.reject(1, 'Wait for your turn to act.');
  await assert.rejects(pending, /Wait for your turn/);
  s.update({view: viewFor(g, 1)});
  assert.deepEqual(infos, [{mine: false}]);
});

test('dropping pending intents rejects all of them', async () => {
  const {s} = seat(), a = s.game.pass(0), b = s.game.pass(0);
  s.dropPending('Connection lost.');
  await assert.rejects(a, /Connection lost/);
  await assert.rejects(b, /Connection lost/);
});

test('a seat continues numbering from a saved sequence', () => {
  const {s, sent} = seat({seq: 41});
  s.game.pass(0);
  assert.equal(sent[0].seq, 42);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/remote.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/remote.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// dist/remote.mjs
import {Game} from './engine.mjs';

const INTENTS = {
  mulligan: () => ({type: 'mulligan'}),
  keep: (bottom = []) => ({type: 'keep', bottom}),
  play: (p, uid, target = null) => ({type: 'play', uid, target}),
  pass: () => ({type: 'pass'}),
  attackers: (p, uids) => ({type: 'attackers', uids}),
  blockers: (p, assignments) => ({type: 'blockers', assignments}),
  discard: uids => ({type: 'discard', uids}),
  concede: () => ({type: 'concede'}),
};

// A player's seat in a versus match: a Game rebuilt from the host's latest view,
// whose rule queries work locally and whose moves are sent to the host as intents.
export class Seat {
  constructor(send, {seq = 0, now = Date.now} = {}) {
    Object.assign(this, {send, seq, now});
    this.pending = new Map();
    this.game = null;
    this.clock = null;
    this.onUpdate = () => {};
  }

  update({view, clock = null, ackSeq = null}) {
    const game = Game.fromJSON(view);
    for (const [name, intent] of Object.entries(INTENTS)) game[name] = (...args) => this.act(intent(...args));
    this.game = game;
    this.clock = clock && {...clock, at: this.now()};
    const mine = this.pending.get(ackSeq);
    this.pending.delete(ackSeq);
    this.onUpdate(game, {mine: !!mine});
    mine?.resolve();
  }

  reject(seq, message) {
    const pending = this.pending.get(seq);
    this.pending.delete(seq);
    pending?.reject(Error(message));
  }

  dropPending(message) {
    for (const seq of [...this.pending.keys()]) this.reject(seq, message);
  }

  act(action) {
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(seq, {resolve, reject}); // Before send: the host's seat answers synchronously.
      this.send(action, seq);
    });
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/remote.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add dist/remote.mjs tests/remote.test.mjs
git commit -m "feat: add Seat, a view-backed game that sends moves as intents"
```

---

### Task 9: Safe storage

**Files:**
- Create: `dist/storage.mjs`
- Modify: `tests/helpers/versus.mjs` (add `memoryBackend`)
- Test: `tests/storage.test.mjs`

**Interfaces:**
- Produces: `createStore(backend = globalThis.localStorage, now = Date.now) → {available, get(key), set(key, value), remove(key), prune()}`.
  - Keys are stored as `bnd:<key>`.
  - Values are JSON-wrapped as `{savedAt, value}`.
  - If the backend is missing, throws or is full, the store falls back to memory.
  - Test helper: `memoryBackend()`, a Map-backed Storage whose `.map` is exposed.

- [ ] **Step 1: Add the helper to `tests/helpers/versus.mjs`**

```js
export function memoryBackend() {
  const map = new Map();
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: k => void map.delete(k),
    key: i => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/storage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../dist/storage.mjs';
import {memoryBackend} from './helpers/versus.mjs';

const DAY = 24 * 60 * 60 * 1000;

test('values round-trip under a bnd: prefix; host and guest keys are independent', () => {
  const backend = memoryBackend(), s = createStore(backend);
  assert.equal(s.available, true);
  s.set('host:abc', {a: 1}); s.set('guest:abc', {b: 2});
  assert.deepEqual(s.get('host:abc'), {a: 1});
  assert.deepEqual(s.get('guest:abc'), {b: 2});
  assert.ok(backend.map.has('bnd:host:abc'));
  s.remove('host:abc');
  assert.equal(s.get('host:abc'), null);
  assert.deepEqual(s.get('guest:abc'), {b: 2});
});

test('a throwing or missing backend falls back to memory and reports unavailable', () => {
  const denied = () => { throw Error('denied'); };
  for (const backend of [{getItem: denied, setItem: denied, removeItem: denied, key: () => null, length: 0}, null]) {
    const s = createStore(backend);
    assert.equal(s.available, false);
    s.set('host:x', {a: 1});
    assert.deepEqual(s.get('host:x'), {a: 1});
    s.prune();
  }
});

test('a full backend keeps the latest value in memory', () => {
  const backend = memoryBackend(), setItem = backend.setItem;
  backend.setItem = (k, v) => { if (k !== 'bnd:probe') throw Error('QuotaExceededError'); setItem(k, v); };
  const s = createStore(backend);
  s.set('host:x', {big: true});
  assert.deepEqual(s.get('host:x'), {big: true});
});

test('prune removes records older than seven days and unreadable ones only', () => {
  let now = 0;
  const backend = memoryBackend(), s = createStore(backend, () => now);
  s.set('host:old', 1);
  now = 8 * DAY;
  s.set('guest:new', 2);
  backend.setItem('bnd:junk', '{');
  backend.setItem('other', 'x');
  s.prune();
  assert.equal(s.get('host:old'), null);
  assert.equal(s.get('guest:new'), 2);
  assert.equal(backend.getItem('bnd:junk'), null);
  assert.equal(backend.getItem('other'), 'x');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/storage.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/storage.mjs'`.

- [ ] **Step 4: Write the implementation**

```js
// dist/storage.mjs
const PREFIX = 'bnd:', WEEK = 7 * 24 * 60 * 60 * 1000;
const safe = fn => { try { return fn(); } catch { return undefined; } };

// localStorage that never throws: private mode, blocked storage or a full quota fall back to memory.
export function createStore(backend = globalThis.localStorage, now = Date.now) {
  const available = !!safe(() => { backend.setItem(PREFIX + 'probe', '1'); backend.removeItem(PREFIX + 'probe'); return true; });
  const memory = new Map();
  const parse = raw => { try { return raw ? JSON.parse(raw).value : null; } catch { return null; } };
  return {
    available,
    get(key) {
      return parse(memory.get(key) ?? (available ? safe(() => backend.getItem(PREFIX + key)) : null));
    },
    set(key, value) {
      const raw = JSON.stringify({savedAt: now(), value});
      if (available && safe(() => (backend.setItem(PREFIX + key, raw), true))) memory.delete(key);
      else memory.set(key, raw);
    },
    remove(key) {
      memory.delete(key);
      if (available) safe(() => backend.removeItem(PREFIX + key));
    },
    prune() {
      if (!available) return;
      safe(() => {
        for (let i = backend.length - 1; i >= 0; i--) {
          const key = backend.key(i);
          if (!key?.startsWith(PREFIX)) continue;
          let old = true;
          try { old = now() - JSON.parse(backend.getItem(key)).savedAt > WEEK; } catch {}
          if (old) backend.removeItem(key);
        }
      });
    },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/storage.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add dist/storage.mjs tests/storage.test.mjs tests/helpers/versus.mjs
git commit -m "feat: add safe localStorage wrapper with memory fallback and pruning"
```

---

### Task 10: PeerJS transport and in-memory fake

**Files:**
- Create: `dist/net.mjs`
- Create: `tests/helpers/fake-net.mjs`
- Test: `tests/net.test.mjs`

**Interfaces:**
- Produces (the same contract for `net.mjs` and `fakeNet()`):
  - `listen(matchId, {onconnection(conn)}) → Promise<{close()}>` rejects with `code: 'id-taken' | 'server'`.
  - `dial(matchId) → Promise<conn>` rejects with `code: 'host-offline' | 'no-connection' | 'server'`.
  - `conn = {send(msg), close(), onmessage(msg), onclose()}`. Messages are JSON, arrive in order, and `onclose` fires once on both ends.
  - `net.mjs` also exports `peerId(matchId)`, `netError(code)` and `loadPeer()`.
  - `fakeNet()` also exports `dropAll()`.

- [ ] **Step 1: Write the fake (test helper)**

```js
// tests/helpers/fake-net.mjs
// In-memory stand-in for dist/net.mjs with the same listen/dial/connection contract.
export function fakeNet() {
  const hosts = new Map(), live = new Set();
  const fail = code => Object.assign(Error(code), {code});
  function end() {
    const c = {
      open: true,
      onmessage() {},
      onclose() {},
      send(msg) {
        if (!c.open) return;
        const copy = JSON.parse(JSON.stringify(msg));
        queueMicrotask(() => { if (c.peer.open) c.peer.onmessage(copy); });
      },
      close() {
        if (!c.open) return;
        c.open = c.peer.open = false;
        live.delete(c); live.delete(c.peer);
        queueMicrotask(() => { c.onclose(); c.peer.onclose(); });
      },
    };
    return c;
  }
  return {
    async listen(matchId, {onconnection}) {
      if (hosts.has(matchId)) throw fail('id-taken');
      hosts.set(matchId, onconnection);
      return {close: () => { if (hosts.get(matchId) === onconnection) hosts.delete(matchId); }};
    },
    async dial(matchId) {
      const onconnection = hosts.get(matchId);
      if (!onconnection) throw fail('host-offline');
      const guest = end(), host = end();
      guest.peer = host; host.peer = guest;
      live.add(guest); live.add(host);
      queueMicrotask(() => onconnection(host));
      return guest;
    },
    dropAll() { for (const c of [...live]) c.close(); },
  };
}
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/net.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {peerId, netError, loadPeer} from '../dist/net.mjs';
import {fakeNet} from './helpers/fake-net.mjs';

const flush = () => new Promise(r => setImmediate(r));

test('net.mjs names peers per match and reuses an already loaded PeerJS', async () => {
  assert.equal(peerId('abcdefghijklmnop'), 'bnd-abcdefghijklmnop');
  assert.equal(netError('server').code, 'server');
  class Peer {}
  globalThis.Peer = Peer;
  try { assert.equal(await loadPeer(), Peer); } finally { delete globalThis.Peer; }
});

test('the fake transport honours the contract', async () => {
  const net = fakeNet(), got = {host: [], guest: []};
  let hostConn, closes = 0;
  await net.listen('m', {onconnection: c => { hostConn = c; c.onmessage = m => got.host.push(m); c.onclose = () => closes++; }});
  await assert.rejects(net.listen('m', {onconnection() {}}), e => e.code === 'id-taken');
  await assert.rejects(net.dial('nope'), e => e.code === 'host-offline');
  const guest = await net.dial('m');
  guest.onmessage = m => got.guest.push(m);
  guest.onclose = () => closes++;
  guest.send({type: 'hello', n: 1});
  await flush();
  hostConn.send({type: 'welcome'});
  await flush();
  assert.deepEqual(got, {host: [{type: 'hello', n: 1}], guest: [{type: 'welcome'}]});
  net.dropAll();
  await flush();
  assert.equal(closes, 2);
  guest.send({type: 'late'});
  await flush();
  assert.equal(got.host.length, 1);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/net.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/net.mjs'`.

- [ ] **Step 4: Write `dist/net.mjs`**

```js
// dist/net.mjs
// Peer-to-peer transport over PeerJS. PeerJS loads only when a versus match starts.
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
const PEERJS_SRI = 'sha384-x0YgkOr/3UOZP2CRDxGW9e0Q+2Qjyr3uJrm4xU32Y7ZCNAo7Cc7bjhrZMi/dwczu';
const CONNECT_MS = 20_000, ID_RETRY_MS = 3_000, ID_WAIT_MS = 30_000;

export const peerId = matchId => `bnd-${matchId}`;
export const netError = code => Object.assign(Error(code), {code});

let loading = null;
export function loadPeer() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  return (loading ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), {src: PEERJS_URL, integrity: PEERJS_SRI, crossOrigin: 'anonymous'});
    script.onload = () => resolve(globalThis.Peer);
    script.onerror = () => { loading = null; script.remove(); reject(netError('server')); };
    document.head.append(script);
  }));
}

function wrap(conn, onClosed = () => {}) {
  let closed = false;
  const c = {send: msg => { if (conn.open) conn.send(msg); }, close: () => conn.close(), onmessage() {}, onclose() {}};
  const done = () => { if (closed) return; closed = true; onClosed(); c.onclose(); };
  conn.on('data', msg => c.onmessage(msg));
  conn.on('close', done);
  conn.on('error', done);
  return c;
}

export async function listen(matchId, {onconnection}) {
  const Peer = await loadPeer(), started = Date.now();
  for (;;) {
    try { return await register(Peer, matchId, onconnection); }
    catch (e) {
      // A reloaded host tab can briefly find its own old id still registered.
      if (e.code !== 'id-taken' || Date.now() - started > ID_WAIT_MS) throw e;
      await new Promise(r => setTimeout(r, ID_RETRY_MS));
    }
  }
}

function register(Peer, matchId, onconnection) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerId(matchId));
    let open = false;
    peer.on('open', () => { open = true; resolve({close: () => peer.destroy()}); });
    peer.on('connection', conn => conn.on('open', () => onconnection(wrap(conn))));
    peer.on('disconnected', () => { if (open && !peer.destroyed) peer.reconnect(); });
    peer.on('error', e => {
      if (open) return;
      peer.destroy();
      reject(netError(e.type === 'unavailable-id' ? 'id-taken' : 'server'));
    });
  });
}

export async function dial(matchId) {
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let settled = false;
    const fail = code => { if (settled) return; settled = true; clearTimeout(timer); peer.destroy(); reject(netError(code)); };
    const timer = setTimeout(() => fail('no-connection'), CONNECT_MS);
    peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'host-offline' : ['network', 'server-error', 'socket-error'].includes(e.type) ? 'server' : 'no-connection'));
    peer.on('open', () => {
      const conn = peer.connect(peerId(matchId), {reliable: true, serialization: 'json'});
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(wrap(conn, () => peer.destroy()));
      });
    });
  });
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/net.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add dist/net.mjs tests/helpers/fake-net.mjs tests/net.test.mjs
git commit -m "feat: add PeerJS transport and in-memory test transport"
```

---

### Task 11: Host and guest sessions

**Files:**
- Create: `dist/session.mjs`
- Test: `tests/session.test.mjs`

**Interfaces:**
- Consumes:
  - `Match` (Tasks 5–6)
  - `Seat` (Task 8)
  - `audit` (Task 7)
  - `digest`, `randomHex` and `sha256Hex` (Task 4)
  - `createStore` (Task 9)
  - the `net` contract (Task 10)
- Produces:
  - **Match ids:** `newMatchId() → 16 chars`, `validMatchId(id) → bool`.
  - **Creating sessions:**
    - `HostSession.create({net, store, hostFaction, matchId?, clock?})`
    - `HostSession.resume({net, store, matchId, clock?})` rejects with `code: 'unknown-match'`.
    - `GuestSession.join({net, store, matchId, retry?})` rejects with a net error code on a first join. A returning guest goes to `reconnecting` instead.
  - **Common to both sessions:**
    - `role`, `matchId`, `faction`
    - `status`, which is one of `'connecting' | 'waiting' | 'pledge' | 'pledged' | 'playing' | 'paused' | 'reconnecting' | 'ended' | 'cancelled' | 'error'`
    - `error`, `audit`, `seat`, `onStatus(session)`
    - `pledge()`, `leave()`, `dispose(removeRecord = true)`
  - **Guest only:** `settled() → Promise`, which waits for queued host messages.
  - **Messages:** as listed in the spec, plus `resume.started`, `resume.log` and `resume.reveal`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {HostSession, GuestSession, newMatchId, validMatchId} from '../dist/session.mjs';
import {createStore} from '../dist/storage.mjs';
import {fakeNet} from './helpers/fake-net.mjs';
import {fakeTime, memoryBackend} from './helpers/versus.mjs';
import {choose, perform} from './helpers/policy.mjs';

const flush = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const retry = () => new Promise(r => setImmediate(r));
const store = () => createStore(memoryBackend());
const settle = async ({guest}) => { await flush(); await guest.settled(); await flush(); };

async function pair({hostStore = store(), guestStore = store(), net = fakeNet()} = {}) {
  const host = await HostSession.create({net, store: hostStore, hostFaction: 'blue', clock: fakeTime()});
  const waiting = host.status;
  const guest = await GuestSession.join({net, store: guestStore, matchId: host.matchId, retry});
  const ctx = {host, guest, net, hostStore, guestStore, waiting};
  await settle(ctx);
  return ctx;
}
async function start(ctx) {
  ctx.host.pledge(); ctx.guest.pledge();
  await settle(ctx);
  return ctx;
}
async function keepBoth(ctx) {
  await ctx.guest.seat.game.keep([]);
  await ctx.host.seat.game.keep([]);
  await settle(ctx);
}
// Each seat plays the simple policy whenever it is that seat's move.
async function drive(ctx, seats, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    const s = seats().find(s => s.game && s.game.winner === null && (s.game.phase === 'opening' ? !s.game.kept[0] : s.game.actor() === 0));
    if (!s) return;
    await Promise.resolve(perform(s.game, 0, choose(s.game, 0))).catch(() => {});
    await settle(ctx);
  }
}

test('match ids are 16 base32 characters', () => {
  assert.ok(validMatchId(newMatchId()));
  assert.equal(validMatchId('ABC'), false);
});

test('host and guest connect, pledge, and see mirrored, redacted views', async () => {
  const ctx = await pair();
  assert.equal(ctx.waiting, 'waiting');
  assert.equal(ctx.host.status, 'pledge');
  assert.equal(ctx.guest.status, 'pledge');
  assert.equal(ctx.guest.faction, 'red');
  ctx.host.pledge();
  await settle(ctx);
  assert.equal(ctx.host.status, 'pledged');
  ctx.guest.pledge();
  await settle(ctx);
  assert.equal(ctx.host.status, 'playing');
  assert.equal(ctx.guest.status, 'playing');
  assert.equal(ctx.host.seat.game.players[0].faction, 'blue');
  assert.equal(ctx.guest.seat.game.players[0].faction, 'red');
  assert.ok(ctx.guest.seat.game.players[1].hand.every(c => c.hidden));
  assert.ok(ctx.host.seat.game.players[1].hand.every(c => c.hidden));
});

test('guest moves reach the host', async () => {
  const ctx = await start(await pair());
  await ctx.guest.seat.game.keep([]);
  assert.equal(ctx.host.seat.game.kept[1], true);
});

test('a third browser opening the link is turned away', async () => {
  const ctx = await pair();
  const intruder = await GuestSession.join({net: ctx.net, store: store(), matchId: ctx.host.matchId, retry});
  await settle({guest: intruder});
  assert.equal(intruder.status, 'error');
  assert.equal(intruder.error, 'full');
  assert.equal(ctx.host.status, 'pledge');
});

test('an intent lost in a dropped connection is rejected, not applied, and play resumes', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  const before = ctx.host.match.log.length;
  const lost = ctx.guest.seat.game.pass(0);
  ctx.net.dropAll();
  await assert.rejects(lost, /Connection lost/);
  await settle(ctx);
  assert.equal(ctx.guest.status, 'playing');
  assert.equal(ctx.host.status, 'playing');
  assert.equal(ctx.host.match.log.length, before);
});

test('host and guest in the same browser keep separate records', async () => {
  const shared = store();
  const ctx = await start(await pair({hostStore: shared, guestStore: shared}));
  await keepBoth(ctx);
  assert.ok(shared.get(`host:${ctx.host.matchId}`).match);
  assert.equal(shared.get(`guest:${ctx.host.matchId}`).log.length, 2);
});

test('the host can reload mid-match; an impostor host is refused', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  const log = ctx.host.match.log.length;
  ctx.host.dispose(false);
  await flush();
  assert.equal(ctx.guest.status, 'reconnecting');
  const host = await HostSession.resume({net: ctx.net, store: ctx.hostStore, matchId: ctx.host.matchId, clock: fakeTime()});
  await settle(ctx);
  assert.equal(host.status, 'playing');
  assert.equal(ctx.guest.status, 'playing');
  assert.equal(host.match.log.length, log);

  host.dispose(true);
  await flush();
  const impostor = await HostSession.create({net: ctx.net, store: store(), hostFaction: 'blue', matchId: ctx.host.matchId, clock: fakeTime()});
  await settle(ctx);
  assert.equal(ctx.guest.status, 'error');
  assert.equal(ctx.guest.error, 'impostor');
  impostor.dispose();
});

test('leaving during the pledge cancels the match for both and clears storage', async () => {
  const ctx = await pair();
  ctx.guest.leave();
  await flush();
  assert.equal(ctx.guest.status, 'cancelled');
  assert.equal(ctx.host.status, 'cancelled');
  assert.equal(ctx.guestStore.get(`guest:${ctx.host.matchId}`), null);
  assert.equal(ctx.hostStore.get(`host:${ctx.host.matchId}`), null);
});

test('a full match with a guest reload mid-game ends verified for both', async () => {
  const ctx = await start(await pair());
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 60);
  ctx.guest.dispose(false);
  await flush();
  assert.equal(ctx.host.status, 'paused');
  ctx.guest = await GuestSession.join({net: ctx.net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle(ctx);
  assert.equal(ctx.guest.status, 'playing');
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat]);
  if (ctx.host.seat.game.winner === null) await ctx.host.seat.game.concede(0);
  await settle(ctx);
  assert.equal(ctx.guest.status, 'ended');
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
  assert.deepEqual(ctx.host.audit, {result: 'verified'});
});

test('a match that ends while the guest is away is revealed and audited on return', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  ctx.guest.dispose(false);
  await flush();
  await ctx.host.seat.game.concede(0);
  assert.equal(ctx.host.status, 'ended');
  const guest = await GuestSession.join({net: ctx.net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle({guest});
  assert.equal(guest.seat.game.winner, 0);
  assert.equal(guest.status, 'ended');
  assert.deepEqual(guest.audit, {result: 'verified'});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/session.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/session.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// dist/session.mjs
import {Match} from './match.mjs';
import {Seat} from './remote.mjs';
import {audit} from './audit.mjs';
import {digest, randomHex, sha256Hex} from './protocol.mjs';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const newMatchId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => ALPHABET[b & 31]).join('');
export const validMatchId = id => /^[a-z2-7]{16}$/.test(id ?? '');
const failure = code => Object.assign(Error(code), {code});
const other = faction => (faction === 'blue' ? 'red' : 'blue');
const backoff = n => new Promise(r => setTimeout(r, Math.min(10_000, 1000 * 2 ** n)));

class Session {
  status = 'connecting';
  error = null;
  audit = null;
  closed = false;
  onStatus = () => {};
  set(status, extra = {}) { Object.assign(this, extra, {status}); this.onStatus(this); }
}

// The host owns the Match. Its own moves go straight to the referee; the guest's arrive over the network.
export class HostSession extends Session {
  role = 'host';

  static async create({net, store, hostFaction, matchId = newMatchId(), clock}) {
    const hostSecret = randomHex();
    const record = {hostFaction, hostSecret, seedCommit: await sha256Hex(hostSecret), guestToken: randomHex(), hostToken: randomHex(), joined: false, match: null, audit: null};
    return new HostSession({net, store, matchId, record, clock}).open();
  }

  static async resume({net, store, matchId, clock}) {
    const record = store.get(`host:${matchId}`);
    if (!record) throw failure('unknown-match');
    return new HostSession({net, store, matchId, record, clock}).open();
  }

  constructor({net, store, matchId, record, clock}) {
    super();
    Object.assign(this, {net, store, matchId, record, clockOptions: clock, conn: null, match: null, queue: Promise.resolve()});
    this.faction = record.hostFaction;
    this.audit = record.audit;
    this.seat = new Seat((action, seq) => {
      const result = this.match ? this.match.submit(0, action, seq) : {ok: false, error: 'The match has not started yet.'};
      if (!result.ok) this.seat.reject(seq, result.error);
    });
    if (record.match) this.attach(Match.fromJSON(record.match, clock));
  }

  async open() {
    this.save();
    this.listener = await this.net.listen(this.matchId, {onconnection: conn => this.connection(conn)});
    this.refresh();
    return this;
  }

  attach(match) {
    this.match = match;
    match.onChange = ({entry} = {}) => this.changed(entry ?? null);
    this.updateSeat();
  }

  updateSeat(ackSeq = null) {
    this.seat.update({view: this.match.view(0), clock: this.match.clockFor(0), ackSeq});
  }

  refresh() {
    if (this.closed || ['cancelled', 'error'].includes(this.status)) return;
    const m = this.match;
    this.set(!m ? 'waiting' : m.ended ? 'ended' : !m.pledged[0] ? 'pledge' : !m.started ? 'pledged' : m.guestConnected ? 'playing' : 'paused');
  }

  connection(conn) {
    conn.onmessage = msg => { this.queue = this.queue.then(() => this.fromGuest(conn, msg)).catch(() => {}); };
    conn.onclose = () => {
      if (this.closed || this.conn !== conn) return;
      this.conn = null;
      if (this.match) { this.match.connect(false); this.updateSeat(); this.save(); }
      this.refresh();
    };
  }

  send(msg) { this.conn?.send(msg); }

  async fromGuest(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') return this.hello(conn, msg);
    if (conn !== this.conn) return;
    switch (msg.type) {
      case 'seed': return this.seeded(msg.guestSecret);
      case 'pledge': this.match?.pledge(1); this.save(); return this.refresh();
      case 'intent': return this.intent(msg);
      case 'audit': this.record.audit = this.audit = msg.result ?? null; this.save(); return this.refresh();
      case 'leave': this.dispose(); return this.set('cancelled');
    }
  }

  hello(conn, {guestToken}) {
    const r = this.record;
    if (r.joined && guestToken !== r.guestToken) { conn.send({type: 'error', code: 'full'}); conn.close(); return; }
    if (this.conn && this.conn !== conn) this.conn.close();
    this.conn = conn;
    if (!this.match) {
      r.joined = true;
      this.save();
      conn.send({type: 'welcome', guestToken: r.guestToken, hostToken: r.hostToken, seedCommit: r.seedCommit, hostFaction: r.hostFaction});
      return;
    }
    const m = this.match;
    m.connect(true);
    this.updateSeat();
    conn.send({...this.viewMessage(), type: 'resume', hostToken: r.hostToken, log: m.log, started: m.started, pledged: m.pledged[1], reveal: m.ended ? r.hostSecret : null});
    this.save();
    this.refresh();
  }

  async seeded(guestSecret) {
    if (this.match || !/^[0-9a-f]{32}$/.test(guestSecret ?? '')) return;
    const r = this.record;
    this.attach(await Match.create({hostFaction: r.hostFaction, hostSecret: r.hostSecret, guestSecret, seedCommit: r.seedCommit}, this.clockOptions));
    this.match.connect(!!this.conn);
    this.save();
    this.refresh();
  }

  intent({seq, action}) {
    if (!Number.isInteger(seq)) return;
    const result = this.match ? this.match.submit(1, action, seq) : {ok: false, error: 'The match has not started yet.'};
    if (!result.ok) this.send({type: 'reject', seq, error: result.error});
    else if (result.duplicate) this.send(this.viewMessage(null, seq));
  }

  changed(entry) {
    this.send(this.viewMessage(entry, entry?.by === 1 ? entry.seq : null));
    this.updateSeat(entry?.by === 0 ? entry.seq : null);
    if (this.match.ended) this.send({type: 'reveal', hostSecret: this.record.hostSecret});
    this.save();
    this.refresh();
  }

  viewMessage(entry = null, ackSeq = null) {
    return {type: 'view', entry, ackSeq, view: this.match.view(1), clock: this.match.clockFor(1)};
  }

  pledge() { this.match?.pledge(0); this.save(); this.refresh(); }

  leave() {
    if (this.match?.started && !this.match.ended) return this.seat.game.concede(0);
    const ended = !!this.match?.ended;
    if (!ended) this.send({type: 'leave'});
    this.dispose();
    if (!ended) this.set('cancelled');
  }

  dispose(removeRecord = true) {
    if (this.closed) return;
    this.match?.stop();
    if (removeRecord) this.store.remove(`host:${this.matchId}`); else this.save();
    this.closed = true;
    this.listener?.close();
    this.conn?.close();
  }

  save() {
    if (this.closed) return;
    this.record.match = this.match?.toJSON() ?? null;
    this.store.set(`host:${this.matchId}`, this.record);
  }
}

// The guest never holds hidden state. It records what it saw so it can audit the host at the end.
export class GuestSession extends Session {
  role = 'guest';

  static async join({net, store, matchId, retry = backoff}) {
    const s = new GuestSession({net, store, matchId, retry});
    try { await s.connect(); }
    catch (e) {
      if (!s.record.guestToken) throw e;
      s.set('reconnecting');
      s.reconnect();
    }
    return s;
  }

  constructor({net, store, matchId, retry}) {
    super();
    Object.assign(this, {net, store, matchId, retry, conn: null, queue: Promise.resolve(), attempts: 0});
    this.record = store.get(`guest:${matchId}`) ?? {guestToken: null, hostToken: null, seedCommit: null, hostFaction: null, guestSecret: null, pledged: false, seq: 0, sent: {}, log: [], digests: [], hostSecret: null, audit: null};
    this.faction = this.record.hostFaction && other(this.record.hostFaction);
    this.audit = this.record.audit;
    this.seat = new Seat((action, seq) => {
      if (!this.conn) return this.seat.reject(seq, 'Reconnecting to your opponent…');
      this.record.sent[seq] = action;
      this.record.seq = seq;
      this.save();
      this.conn.send({type: 'intent', seq, action});
    }, {seq: this.record.seq});
  }

  async connect() {
    const conn = await this.net.dial(this.matchId);
    if (this.closed) return conn.close();
    this.conn = conn;
    this.attempts = 0;
    conn.onmessage = msg => { this.queue = this.queue.then(() => this.fromHost(msg)).catch(() => {}); };
    conn.onclose = () => this.lost(conn);
    conn.send({type: 'hello', guestToken: this.record.guestToken});
  }

  lost(conn) {
    if (this.closed || this.conn !== conn) return;
    this.conn = null;
    this.seat.dropPending('Connection lost. Reconnecting…');
    this.set('reconnecting');
    this.reconnect();
  }

  async reconnect() {
    while (!this.closed && !this.conn) {
      await this.retry(this.attempts++);
      try { await this.connect(); } catch { /* The host may be reloading; keep trying. */ }
    }
  }

  async fromHost(msg) {
    const r = this.record;
    switch (msg?.type) {
      case 'error':
        this.dispose(msg.code === 'full');
        return this.set('error', {error: msg.code});
      case 'welcome':
        if (r.hostToken && msg.hostToken !== r.hostToken) return this.impostor();
        Object.assign(r, {guestToken: msg.guestToken, hostToken: msg.hostToken, seedCommit: msg.seedCommit, hostFaction: msg.hostFaction});
        r.guestSecret ??= randomHex();
        this.faction = other(r.hostFaction);
        this.save();
        this.conn.send({type: 'seed', guestSecret: r.guestSecret});
        if (r.pledged) this.conn.send({type: 'pledge'});
        return this.set(r.pledged ? 'pledged' : 'pledge');
      case 'resume':
        if (msg.hostToken !== r.hostToken) return this.impostor();
        if (r.pledged && !msg.pledged && !msg.started) this.conn.send({type: 'pledge'});
        if (msg.started) {
          for (const entry of msg.log.slice(r.log.length)) r.log.push(entry);
          r.digests[r.log.length] ??= await digest(msg.view);
        }
        this.save();
        this.seat.update(msg);
        if (msg.reveal) return this.revealed(msg.reveal);
        return this.set(!msg.started ? (r.pledged ? 'pledged' : 'pledge') : 'playing');
      case 'view': {
        const {entry} = msg;
        if (entry) {
          // A missing message means the channel broke; reconnecting resends the whole log.
          if (entry.n !== r.log.length + 1) { this.conn?.close(); return; }
          r.log.push(entry);
          r.digests[entry.n] = await digest(msg.view);
        } else if (!r.log.length) r.digests[0] ??= await digest(msg.view);
        this.save();
        this.seat.update(msg);
        if (this.status !== 'ended') this.set('playing');
        return;
      }
      case 'reject': return this.seat.reject(msg.seq, msg.error);
      case 'reveal': return this.revealed(msg.hostSecret);
      case 'leave': this.dispose(); return this.set('cancelled');
    }
  }

  async revealed(hostSecret) {
    const r = this.record;
    if (!r.audit) {
      r.hostSecret = hostSecret;
      r.audit = await audit(r);
      this.save();
    }
    this.audit = r.audit;
    this.conn?.send({type: 'audit', result: r.audit});
    this.set('ended');
  }

  impostor() { this.dispose(false); this.set('error', {error: 'impostor'}); }

  pledge() {
    this.record.pledged = true;
    this.save();
    this.conn?.send({type: 'pledge'});
    this.set('pledged');
  }

  leave() {
    if (this.status === 'playing' && this.seat.game?.winner === null) return this.seat.game.concede(0);
    const ended = this.status === 'ended';
    if (!ended) this.conn?.send({type: 'leave'});
    this.dispose();
    if (!ended) this.set('cancelled');
  }

  dispose(removeRecord = true) {
    if (this.closed) return;
    if (removeRecord) this.store.remove(`guest:${this.matchId}`); else this.save();
    this.closed = true;
    this.conn?.close();
  }

  save() { if (!this.closed) this.store.set(`guest:${this.matchId}`, this.record); }

  settled() { return this.queue; }
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/session.test.mjs`
Expected: PASS (10 tests). If a test hangs, check that every `HostSession` gets `clock: fakeTime()`, because real `setTimeout` clocks keep Node alive.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add dist/session.mjs tests/session.test.mjs
git commit -m "feat: add host and guest sessions with tokens, reconnect, reveal and audit"
```

---

### Task 12: Versus UI markup and styles

**Files:**
- Create: `dist/versus-ui.mjs`
- Create: `dist/versus.css`
- Test: `tests/versus-ui.test.mjs`

**Interfaces:**
- Consumes: Session shape (Task 11): `status`, `error`, `audit`, `seat.clock`.
- Produces pure string functions:
  - **Text helpers**
    - `ERRORS` and `errorMessage(code)`
    - `clockText(clock, now)`
    - `auditLine(audit)`
  - **Markup**
    - `honorDialog({team})`, which uses `#pledge` and `#pledgeLeave`
    - `matchStatus(session, now)`, which uses `#versusClock`
    - `lobby(session, {url, canShare, storageOk})`
  - **Element ids** used by `lobby()`: `#inviteLink`, `#copyInvite`, `#shareInvite`, `#cancelVersus`, `#showPledge`, `#versusHome` and `#versusRetry`.
  - The start-screen mode selector is Task 13's job, not this module's.

- [ ] **Step 1: Write the failing tests**

```js
// tests/versus-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../dist/versus-ui.mjs';

test('the invite lobby escapes the link, offers share only when supported, and warns without storage', () => {
  const html = ui.lobby({status: 'waiting'}, {url: 'https://x.test/#join=a"b', canShare: false, storageOk: false});
  assert.match(html, /value="https:\/\/x\.test\/#join=a&quot;b"/);
  assert.match(html, /id="copyInvite"/);
  assert.doesNotMatch(html, /shareInvite/);
  assert.match(html, /can’t survive a reload/);
  assert.match(ui.lobby({status: 'waiting'}, {url: 'u', canShare: true, storageOk: true}), /id="shareInvite"/);
});

test('each lobby state has a way forward', () => {
  assert.match(ui.lobby({status: 'pledge'}), /id="showPledge"/);
  assert.match(ui.lobby({status: 'pledged'}), /Waiting for your opponent to take the pledge/);
  assert.match(ui.lobby({status: 'reconnecting'}), /id="cancelVersus"/);
  assert.match(ui.lobby({status: 'cancelled'}), /id="versusHome"/);
  assert.match(ui.lobby({status: 'connecting'}), /Connecting/);
  const full = ui.lobby({status: 'error', error: 'full'});
  assert.match(full, /already has two players/);
  assert.doesNotMatch(full, /versusRetry/);
  assert.match(ui.lobby({status: 'error', error: 'server'}), /id="versusRetry"/);
});

test('every error code has a message, with a fallback', () => {
  for (const code of ['server', 'no-connection', 'host-offline', 'unknown-match', 'full', 'id-taken', 'impostor']) assert.ok(ui.errorMessage(code).length > 20, code);
  assert.equal(ui.errorMessage('weird'), ui.ERRORS['no-connection']);
});

test('the honor dialog explains the audit and asks for the pledge', () => {
  const html = ui.honorDialog({team: 'Red team'});
  assert.match(html, /An honor game/);
  assert.match(html, /RED TEAM/);
  assert.match(html, /id="pledge"/);
  assert.match(html, /id="pledgeLeave"/);
  assert.match(html, /Peeking doesn’t/);
});

test('clock text counts down from when the clock arrived', () => {
  assert.equal(ui.clockText({kind: 'turn', owner: 0, left: 90000, at: 0, paused: false}, 5500), 'Your turn · 1:25');
  assert.equal(ui.clockText({kind: 'response', owner: 1, left: 20000, at: 0, paused: false}, 0), 'Opponent’s response · 0:20');
  assert.equal(ui.clockText({kind: 'opening', owner: null, left: 1000, at: 0, paused: false}, 5000), 'Opening hands · 0:00');
  assert.equal(ui.clockText({kind: null, paused: true}, 0), 'Clock paused');
  assert.equal(ui.clockText(null, 0), '');
  assert.match(ui.matchStatus({status: 'paused', seat: {clock: null}}, 0), /Opponent disconnected/);
  assert.match(ui.matchStatus({status: 'reconnecting', seat: {clock: null}}, 0), /reconnecting/);
});

test('audit lines cover every result and escape reasons', () => {
  assert.match(ui.auditLine(null), /Verifying/);
  assert.match(ui.auditLine({result: 'verified'}), /Verified/);
  assert.match(ui.auditLine({result: 'tampered', turn: 4, reason: '<b>x</b>'}), /turn 4\. &lt;b&gt;x&lt;\/b&gt;/);
  assert.match(ui.auditLine({result: 'unverified', reason: 'gone'}), /Unverified\. gone/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/versus-ui.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/versus-ui.mjs'`.

- [ ] **Step 3: Write `dist/versus-ui.mjs`**

```js
// dist/versus-ui.mjs
// Markup for play-a-friend screens. Pure strings, so it can be tested without a browser.
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const ERRORS = {
  server: 'Couldn’t reach the matchmaking server. Try again, or play the computer.',
  'no-connection': 'Couldn’t connect to your opponent directly. Some networks block peer-to-peer games.',
  'host-offline': 'This match isn’t available. Ask your friend for a new link.',
  'unknown-match': 'This match isn’t available. Ask your friend for a new link.',
  full: 'This match already has two players.',
  'id-taken': 'This match is still open in another tab, or is closing. Wait a few seconds and try again.',
  impostor: 'Couldn’t confirm this is the same opponent as before, so the match was stopped.',
};
export const errorMessage = code => ERRORS[code] ?? ERRORS['no-connection'];
const RETRY = ['server', 'no-connection', 'id-taken', 'host-offline'];

export function lobby(session, {url = '', canShare = false, storageOk = true} = {}) {
  const page = (title, body, actions) => `<section class="versus-lobby" aria-live="polite"><div class="eyebrow">FOUNDATIONS / PLAY A FRIEND</div><h1>${title}</h1>${body}<div class="toolbar">${actions}</div></section>`;
  const home = '<button id="versusHome">Back to arena</button>';
  switch (session.status) {
    case 'waiting':
      return page('Send this link to your opponent.',
        `<p class="muted">They’ll play the other faction. Keep this tab open until they join.</p><div class="invite-link"><label class="sr-only" for="inviteLink">Invite link</label><input id="inviteLink" readonly value="${esc(url)}"><button class="primary" id="copyInvite">Copy link</button>${canShare ? '<button id="shareInvite">Share…</button>' : ''}</div>${storageOk ? '' : '<p class="notice">This browser is blocking site storage, so this match can’t survive a reload. Keep this tab open.</p>'}<p class="muted" role="status">Waiting for your opponent…</p>`,
        '<button id="cancelVersus">Cancel match</button>');
    case 'pledge':
      return page('Your opponent is here.', '<p class="muted">Both players take the honor pledge before the match starts.</p>', '<button class="primary" id="showPledge">Take the pledge</button><button id="cancelVersus">Leave match</button>');
    case 'pledged':
      return page('Pledge taken.', '<p class="muted" role="status">Waiting for your opponent to take the pledge…</p>', '<button id="cancelVersus">Leave match</button>');
    case 'reconnecting':
      return page('Reconnecting…', '<p class="muted" role="status">Trying to reach your opponent. This page continues automatically.</p>', '<button id="cancelVersus">Leave match</button>');
    case 'cancelled':
      return page('Match cancelled.', '<p class="muted">The match ended before it started.</p>', home);
    case 'error':
      return page('Couldn’t continue the match.', `<p>${esc(errorMessage(session.error))}</p>`, `${RETRY.includes(session.error) ? '<button class="primary" id="versusRetry">Try again</button>' : ''}${home}`);
    default:
      return page('Connecting…', '<p class="muted" role="status">Setting up a direct connection.</p>', '<button id="cancelVersus">Cancel</button>');
  }
}

export function honorDialog({team}) {
  return `<div class="honor"><div class="eyebrow">BEFORE YOU PLAY · YOU ARE ${esc(team).toUpperCase()}</div><h2>An honor game</h2><p>This is a hacking game running in a web browser. Of course it can be hacked — devtools are one keypress away, and you both know it.</p><p>So here’s the deal: no peeking at hidden cards, no editing the page, no stacking the deck. Red team, keep your exploits on the cards. Blue team, prove the controls work.</p><p>When the match ends, it is audited: tampering with the deck or the game state shows up in the recap. Peeking doesn’t — that part runs on honor.</p><div class="toolbar"><button class="primary" id="pledge">I solemnly swear to play fair</button><button id="pledgeLeave">Leave match</button></div></div>`;
}

export function clockText(clock, now) {
  if (!clock) return '';
  if (clock.paused) return 'Clock paused';
  if (clock.left == null) return '';
  const s = Math.ceil(Math.max(0, clock.left - (now - clock.at)) / 1000);
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const who = clock.kind === 'opening' ? 'Opening hands'
    : clock.owner === 0 ? (clock.kind === 'turn' ? 'Your turn' : 'Your response')
    : clock.kind === 'turn' ? 'Opponent’s turn' : 'Opponent’s response';
  return `${who} · ${time}`;
}

export function matchStatus(session, now) {
  const banner = session.status === 'paused' ? 'Opponent disconnected — waiting for them to return. Clocks are paused.'
    : session.status === 'reconnecting' ? 'Connection lost — reconnecting to your opponent…' : '';
  return `<div class="versus-status"><span id="versusClock" class="versus-clock">${esc(clockText(session.seat?.clock, now))}</span>${banner ? `<span class="versus-banner" role="status">${banner}</span>` : ''}</div>`;
}

export function auditLine(audit) {
  if (!audit) return '<p class="audit" role="status">Verifying the match…</p>';
  if (audit.result === 'verified') return '<p class="audit verified" role="status">✓ Verified: fair match. A replay from the revealed seed matched every move.</p>';
  if (audit.result === 'tampered') return `<p class="audit tampered" role="status">Tampering detected at turn ${Number(audit.turn) || '?'}. ${esc(audit.reason ?? '')}</p>`;
  return `<p class="audit unverified" role="status">Unverified. ${esc(audit.reason ?? '')}</p>`;
}
```

- [ ] **Step 4: Write `dist/versus.css`**

```css
.versus-lobby{max-width:640px;margin:48px auto;padding:0 16px}
.invite-link{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
.invite-link input{flex:1 1 260px;min-width:0;font:inherit;padding:10px 12px;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px}
.versus-status{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px}
.versus-clock{font-variant-numeric:tabular-nums;border:1px solid var(--line);border-radius:20px;padding:5px 12px;font-size:.8rem}
.versus-clock:empty{display:none}
.versus-banner{color:var(--gold);font-size:.85rem}
.honor h2{margin-top:0}
.honor .toolbar{margin-top:18px}
.audit{margin:14px 0;font-weight:600}
.audit.verified{color:var(--blue)}
.audit.tampered{color:var(--red)}
.audit.unverified{color:var(--gold)}
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/versus-ui.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add dist/versus-ui.mjs dist/versus.css tests/versus-ui.test.mjs
git commit -m "feat: add play-a-friend lobby, honor dialog, clock and audit markup"
```

---

### Task 13: Landing page with splash hero and game-mode selector

This implements the approved mockup, version 3 with angled shapes (https://claude.ai/artifact/B5S6tR4GagucDmcd5wkwae):

- **Header:** a text wordmark replaces the logo image.
- **Hero:** the full-width splash art, with a one-line tagline where it fades into the page.
- **Step 01, Choose a mode:** two selectable cards, **Vs. computer** and **Play a friend**.
- **Step 02, Choose your side:** Blue and Red cards with their emblems. The buttons read "Play … →" in computer mode and "Invite as … →" in friend mode.
- **Mode-specific detail:** computer mode shows the "Guide my first game" checkbox; friend mode shows a note that the friend gets the other side.
- **Colours:** the landing view is dark, including the header, to match the splash art. The arena and other views keep their current light theme.
- **Fonts:** Chakra Petch for headings, DM Sans for body text.

**Files:**
- Create: `art-source/breach-and-defend-splash.png` (moved out of `dist/` so Pages doesn't ship the 2.4 MB original)
- Create: `dist/art/splash-960.webp`, `dist/art/splash-1732.webp`, `dist/art/splash-1280.jpg`
- Create: `dist/landing.mjs`, `dist/landing.css`
- Modify: `dist/index.html` (header wordmark, stylesheet and font links, drop the logo preload)
- Test: `tests/landing.test.mjs`

**Interfaces:**
- Produces:
  - `landing({mode = 'solo' | 'friend', guide = false}) → html`. The markup keeps the ids and data attributes `app.mjs` already binds, and adds new ones for the mode switch:
    - Mode cards: `button[data-mode][aria-pressed]`
    - Solo mode: the `#guideFirstGame` checkbox, with its description `#tutorialOffer`, and faction buttons `button[data-start="blue"|"red"]`
    - Friend mode: faction buttons `button[data-invite="blue"|"red"]`
  - `MODES`, the mode list, exported for tests.
  - CSS classes: `body.landing-view` (set by `app.mjs` in Task 14) turns on the dark landing theme for the header and page.

- [ ] **Step 1: Produce the web images**

The original splash is at `dist/art/breach-and-defend-splash.png` (1732 × 908, untracked). `cwebp` is at `/opt/homebrew/bin/cwebp`.

```bash
mkdir -p art-source
mv dist/art/breach-and-defend-splash.png art-source/breach-and-defend-splash.png
cwebp -quiet -q 80 art-source/breach-and-defend-splash.png -o dist/art/splash-1732.webp
cwebp -quiet -q 78 -resize 960 0 art-source/breach-and-defend-splash.png -o dist/art/splash-960.webp
sips -s format jpeg -s formatOptions 78 -Z 1280 art-source/breach-and-defend-splash.png --out dist/art/splash-1280.jpg
ls -la dist/art/splash-*
```

Expected: three files. Each WebP should be well under 400 KB and the JPEG under 300 KB. If one is larger, lower `-q` or `formatOptions` by 5 and rerun.

- [ ] **Step 2: Write the failing tests**

```js
// tests/landing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {landing, MODES} from '../dist/landing.mjs';

test('computer mode: mode pressed, tutorial opt-in, and Play buttons wired to data-start', () => {
  const html = landing({mode: 'solo'});
  assert.match(html, /data-mode="solo" aria-pressed="true"/);
  assert.match(html, /data-mode="friend" aria-pressed="false"/);
  assert.match(html, /id="guideFirstGame" type="checkbox"  aria-describedby="tutorialOffer"/);
  assert.match(html, /data-start="blue">Play Blue team →/);
  assert.match(html, /data-start="red">Play Red team →/);
  assert.doesNotMatch(html, /data-invite/);
  assert.match(landing({mode: 'solo', guide: true}), /id="guideFirstGame" type="checkbox" checked/);
});

test('friend mode: Invite buttons wired to data-invite and no tutorial opt-in', () => {
  const html = landing({mode: 'friend'});
  assert.match(html, /data-mode="friend" aria-pressed="true"/);
  assert.match(html, /data-invite="blue">Invite as Blue team →/);
  assert.match(html, /data-invite="red">Invite as Red team →/);
  assert.doesNotMatch(html, /guideFirstGame|data-start/);
  assert.match(html, /Your friend gets the other side/);
});

test('the hero serves responsive splash images that exist, with text alternatives', () => {
  const html = landing();
  assert.match(html, /srcset="art\/splash-960\.webp 960w, art\/splash-1732\.webp 1732w"/);
  assert.match(html, /<img src="art\/splash-1280\.jpg" alt="Breach &amp; Defend: [^"]+" width="1732" height="908"/);
  for (const file of ['splash-960.webp', 'splash-1732.webp', 'splash-1280.jpg']) {
    assert.ok(fs.existsSync(new URL(`../dist/art/${file}`, import.meta.url)), file);
  }
  assert.equal(fs.existsSync(new URL('../dist/art/breach-and-defend-splash.png', import.meta.url)), false, 'the 2.4 MB original must not ship');
});

test('both modes are real buttons with headings for each step, in focusable slots', () => {
  const html = landing();
  assert.equal((html.match(/<div class="mode-slot"><button type="button" class="mode-card"/g) || []).length, 2);
  assert.equal((html.match(/<div class="side-frame"><article class="side /g) || []).length, 2);
  assert.match(html, /<button class="primary slant" data-start="blue">/);
  assert.deepEqual(MODES.map(m => m.id), ['solo', 'friend']);
  assert.equal((html.match(/<button type="button" class="mode-card"/g) || []).length, 2);
  assert.match(html, /<h2 id="modeTitle">Choose a mode<\/h2>/);
  assert.match(html, /<h2 id="sideTitle">Choose your side<\/h2>/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/landing.test.mjs`
Expected: FAIL. `Cannot find module '.../dist/landing.mjs'`.

- [ ] **Step 4: Write `dist/landing.mjs`**

```js
// dist/landing.mjs
// Arena start screen: splash hero, then mode and side. Pure strings, so it can be tested without a browser.
export const MODES = [
  {id: 'solo', eyebrow: 'TRAINING', title: 'Vs. computer', body: 'Learn the rules against a local opponent that only sees the public board. Turn on the guided first game if you are new.', tags: ['1 player', '15–25 min', 'Works offline']},
  {id: 'friend', eyebrow: 'NEW · INVITE LINK', title: 'Play a friend', body: 'Send a link and play in two browsers, no account needed. Both players take an honor pledge, and every match is audited for tampering when it ends.', tags: ['2 players', '90 s turns', 'Reconnects if you reload']},
];
const SIDES = [
  {id: 'blue', eyebrow: 'DEFEND &amp; DISRUPT', name: 'Blue team', text: 'Build resilient defenses. Investigate threats. Take back control.'},
  {id: 'red', eyebrow: 'INFILTRATE &amp; PRESSURE', name: 'Red team', text: 'Find the opening. Build your foothold. Push the advantage.'},
];
const ICONS = {
  solo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8M12 16v4M9 9h.01M15 9h.01M9 12h6"/></svg>',
  friend: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c.8-3 2.8-5 5-5s4.2 2 5 5M14 18.5c.5-2 1.7-3.5 3-3.5s2.6 1.5 3 3.5"/></svg>',
};

export function landing({mode = 'solo', guide = false} = {}) {
  const friend = mode === 'friend';
  // Clipped shapes can't show an outline, so each card sits in a slot that glows on keyboard focus.
  const modeCard = m => `<div class="mode-slot"><button type="button" class="mode-card" data-mode="${m.id}" aria-pressed="${m.id === mode}"><span class="mode-inner"><span class="mode-head"><span class="mode-icon">${ICONS[m.id]}</span><span class="mode-name"><span class="eyebrow">${m.eyebrow}</span><strong>${m.title}</strong></span><span class="mode-radio" aria-hidden="true"></span></span><span class="mode-body">${m.body}</span><span class="tags">${m.tags.map(t => `<span class="tag">${t}</span>`).join('')}</span></span></button></div>`;
  const side = s => `<div class="side-frame"><article class="side ${s.id}"><img src="art/${s.id}-emblem.png" alt="" width="96" height="96"><div class="side-copy"><div class="eyebrow">${s.eyebrow}</div><h3>${s.name}</h3><p>${s.text}</p></div><button class="primary slant" ${friend ? 'data-invite' : 'data-start'}="${s.id}">${friend ? 'Invite as' : 'Play'} ${s.name} →</button></article></div>`;
  const extra = friend
    ? '<p class="side-note">Your friend gets the other side. You’ll get a link to send them.</p>'
    : `<label class="tutorial-opt-in"><input id="guideFirstGame" type="checkbox" ${guide ? 'checked' : ''} aria-describedby="tutorialOffer"><span><strong>Guide my first game</strong><small id="tutorialOffer">Six hands-on lessons as you play either faction. Exit anytime.</small></span></label>`;
  return `<div class="landing"><section class="hero" aria-label="Breach &amp; Defend"><picture><source type="image/webp" srcset="art/splash-960.webp 960w, art/splash-1732.webp 1732w" sizes="100vw"><img src="art/splash-1280.jpg" alt="Breach &amp; Defend: the red team and the blue team face off across a card table" width="1732" height="908" fetchpriority="high"></picture><div class="hero-copy"><p class="hero-lead">A red-versus-blue card game for learning how attacks unfold — and how good defenses change the outcome.</p><p class="hero-sub">50 cards · every card teaches a real security concept</p></div></section><section class="landing-step" aria-labelledby="modeTitle"><div class="step-head"><span class="step-num">01</span><h2 id="modeTitle">Choose a mode</h2></div><div class="mode-grid">${MODES.map(modeCard).join('')}</div></section><section class="landing-step" aria-labelledby="sideTitle"><div class="step-head"><span class="step-num">02</span><h2 id="sideTitle">Choose your side</h2>${extra}</div><div class="side-grid">${SIDES.map(side).join('')}</div></section><footer class="landing-foot"><span>01 Play infrastructure / 02 Deploy units / 03 Attack &amp; respond</span><span>Original learning game · each card includes a security lesson</span></footer></div>`;
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/landing.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Write `dist/landing.css`**

The landing view is dark and self-contained. `body.landing-view` is toggled by `app.mjs` (Task 14). The selectors beat `header.css`'s `body>header` rules.

```css
/* Header wordmark: every view. */
body>header .brand.wordmark{flex:0 0 auto;width:auto;height:auto;align-self:center;font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:1.125rem;letter-spacing:.06em;color:#12303d;text-decoration:none;white-space:nowrap}
body>header .brand.wordmark span{color:#96610b}

/* Dark landing theme (matches the splash art). */
body.landing-view{--bg:#0c1115;--panel:#131c23;--line:#2b3942;--muted:#a0b0bb;--text:#edf3f4;--blue:#71dfd2;--red:#fb827b;--gold:#eed7a1;background:var(--bg);color:var(--text)}
body.landing-view>header{background:var(--bg);border-bottom-color:var(--line);box-shadow:none}
body.landing-view>header:after{display:none}
body.landing-view>header .brand.wordmark{color:var(--text)}
body.landing-view>header .brand.wordmark span{color:var(--gold)}
body.landing-view>header .nav{color:var(--muted)}
body.landing-view>header .nav:hover{background:var(--panel);border-color:var(--line)}
body.landing-view>header .nav.active{background:var(--panel);border-color:var(--line);color:var(--text);box-shadow:none}
body.landing-view>header .nav span{background:transparent;border:1px solid var(--line);color:var(--muted)}
body.landing-view>header .edition{color:var(--muted)}
body.landing-view main{padding:0;max-width:none}

.landing{display:flex;flex-direction:column;gap:44px;padding-bottom:48px;font-family:'DM Sans',sans-serif}
.landing h2,.landing h3,.mode-name strong{font-family:'Chakra Petch',sans-serif;font-weight:600;letter-spacing:0}
.hero{position:relative;overflow:hidden;height:clamp(260px,43vw,620px)}
.hero img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 18%}
.hero:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,color-mix(in srgb,var(--bg) 85%,transparent) 85%,var(--bg))}
.hero-copy{position:absolute;left:16px;right:16px;bottom:36px;z-index:1;text-align:center}
.hero-lead{margin:0 auto;max-width:720px;font-size:1.375rem;font-weight:500;line-height:1.4}
.hero-sub{margin:10px 0 0;font-size:.875rem;color:var(--muted)}
.landing-step,.landing-foot{width:min(1200px,100% - 32px);margin:0 auto;box-sizing:border-box}
.step-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:14px;margin-bottom:18px}
.step-head h2{margin:0;font-size:1.875rem}
.step-num{font-family:'Chakra Petch',sans-serif;font-size:.875rem;font-weight:600;color:var(--gold);letter-spacing:.12em}
.step-head .tutorial-opt-in,.step-head .side-note{margin:0 0 0 auto}
.landing .tutorial-opt-in{padding:10px 14px;background:var(--panel);border-color:var(--line);color:var(--text)}
.landing .tutorial-opt-in small{color:var(--muted)}
.landing .tutorial-opt-in input{accent-color:var(--blue)}
.side-note{color:var(--muted)}
.mode-grid,.side-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
/* Angled shapes (approved mockup v3): notched mode cards, blade-cut faction panels, slanted buttons, diamond selector. */
.mode-card,.mode-inner{clip-path:polygon(26px 0,100% 0,100% calc(100% - 26px),calc(100% - 26px) 100%,0 100%,0 26px)}
.side-frame,.side{clip-path:polygon(0 0,calc(100% - 34px) 0,100% 34px,100% 100%,34px 100%,0 calc(100% - 34px))}
.slant{clip-path:polygon(14px 0,100% 0,calc(100% - 14px) 100%,0 100%)}
.mode-slot{display:flex}
.mode-slot:focus-within{filter:drop-shadow(0 0 2px var(--gold)) drop-shadow(0 0 6px color-mix(in srgb,var(--gold) 50%,transparent))}
.mode-card{display:block;width:100%;padding:2px;border:0;background:var(--line);color:var(--text);font:inherit;text-align:left;cursor:pointer}
.mode-card:focus-visible{outline:none}
.mode-card[aria-pressed="true"]{background:var(--gold)}
.mode-inner{position:relative;display:flex;flex-direction:column;gap:16px;align-items:flex-start;height:100%;box-sizing:border-box;padding:28px 34px;background:var(--panel)}
.mode-inner:before{content:'';position:absolute;top:0;right:44px;width:64px;height:3px;background:var(--line)}
.mode-card[aria-pressed="true"] .mode-inner{background:#17242c}
.mode-card[aria-pressed="true"] .mode-inner:before{background:var(--gold)}
.mode-head{display:flex;align-items:center;gap:14px;width:100%}
.mode-icon{width:52px;height:52px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--bg);border:1px solid var(--line);color:var(--muted);clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.mode-card[aria-pressed="true"] .mode-icon{color:var(--gold);border-color:var(--gold)}
.mode-icon svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.mode-name{display:flex;flex-direction:column;gap:2px;flex-grow:1}
.mode-name strong{font-size:1.625rem}
.mode-radio{width:18px;height:18px;margin-right:4px;flex-shrink:0;box-sizing:border-box;transform:rotate(45deg);border:2px solid #51646f}
.mode-card[aria-pressed="true"] .mode-radio{border-color:var(--gold);background:radial-gradient(var(--gold) 0 3px,transparent 4px)}
.mode-body{font-size:1rem;line-height:1.55;color:#c9d4db}
.side-frame{padding:2px;background:var(--line)}
.side{display:flex;gap:22px;align-items:center;height:100%;box-sizing:border-box;padding:26px 42px 26px 30px;background:var(--panel)}
.side.blue{border-top:4px solid var(--blue)}
.side.red{border-top:4px solid var(--red)}
.side img{width:96px;height:96px;flex-shrink:0}
.side-copy{flex-grow:1}
.side h3{margin:4px 0 8px;font-size:1.75rem}
.side p{margin:0;color:#c9d4db;line-height:1.5}
.side.blue .eyebrow{color:var(--blue)}
.side.red .eyebrow{color:var(--red)}
.side .primary{flex-shrink:0;min-height:48px;padding:13px 32px;border:0;border-radius:0;font-weight:700}
.side .primary:focus-visible{outline:none;filter:drop-shadow(0 0 3px var(--gold))}
.side.blue .primary{background:var(--blue);color:#0b1c20}
.side.red .primary{background:var(--red);color:#2a0d0b}
.landing-foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px 24px;padding-top:22px;border-top:1px solid var(--line);font-size:.8125rem;color:var(--muted)}
@media(max-width:760px){
  .mode-grid,.side-grid{grid-template-columns:minmax(0,1fr)}
  .hero-copy{position:static;padding:4px 16px 0}
  .hero-lead{font-size:1.0625rem}
  .hero-sub{display:none}
  .landing{gap:32px}
  .step-head h2{font-size:1.5rem}
  .step-head .tutorial-opt-in,.step-head .side-note{margin:0;flex-basis:100%}
  .mode-card,.mode-inner{clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px)}
  .side-frame,.side{clip-path:polygon(0 0,calc(100% - 24px) 0,100% 24px,100% 100%,24px 100%,0 calc(100% - 24px))}
  .mode-inner,.side{padding:18px 22px}
  .side{flex-wrap:wrap}
  .side img{width:64px;height:64px}
  .side .primary{flex-basis:100%;justify-content:center}
}
```

Note on the small-screen layout: `.hero-copy` becomes static, so the tagline sits under the image as in the mobile mockup. For that, the hero's `overflow:hidden` and fixed height must not clip it. Also add:

```css
@media(max-width:760px){.hero{height:auto;overflow:visible}.hero img{height:300px}.hero:after{height:300px;inset:0 0 auto}}
```

- [ ] **Step 7: Update `dist/index.html`**

1. Replace
```html
<a class="brand" href="./" aria-label="Breach & Defend home"><img class="brand-logo" src="art/breach-and-defend-logo.png" alt="Breach & Defend" width="210" height="105" fetchpriority="high"></a>
```
with
```html
<a class="brand wordmark" href="./" aria-label="Breach & Defend home">BREACH <span>&amp;</span> DEFEND</a>
```
2. Remove `<link rel="preload" as="image" href="art/breach-and-defend-logo.png">`.
3. Replace `<link rel="stylesheet" href="card-drag.css">` with `<link rel="stylesheet" href="card-drag.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=DM+Sans:wght@400;500;700&display=swap"><link rel="stylesheet" href="landing.css">`.

- [ ] **Step 8: Run the full suite and commit**

Run: `npm test`
Expected: all PASS.

```bash
git add art-source/breach-and-defend-splash.png dist/art/splash-960.webp dist/art/splash-1732.webp dist/art/splash-1280.jpg dist/landing.mjs dist/landing.css dist/index.html tests/landing.test.mjs
git commit -m "feat: landing page with splash hero and game-mode selector"
```

---

### Task 14: Wire the landing page and versus sessions into the arena

**Files:**
- Modify: `dist/app.mjs`, `dist/index.html`

**Interfaces:**
- Consumes:
  - `HostSession` and `GuestSession` (Task 11)
  - `net.mjs` (Task 10)
  - `createStore` (Task 9)
  - `versus-ui.mjs` (Task 12)
  - `landing` (Task 13)
  - `Seat.onUpdate(game, {mine})` and seat-game mutators that return promises (Task 8)
- Produces: No new exports. In the browser:
  - The landing page's mode selector switches between Play and Invite buttons.
  - "Invite as …" creates a match and shows the link.
  - `#join=` joins a match and `#host=` resumes one.
  - The arena plays against a person, with clocks and an audit recap.

Apply each replacement to `dist/app.mjs` exactly. Every "old" string occurs once in the file.

- [ ] **Step 1: Imports and state**

1. After `import {snapshot,combat,transitions,arrows} from './motion.mjs';` add the line:
```js
import {HostSession,GuestSession} from './session.mjs';import * as net from './net.mjs';import {createStore} from './storage.mjs';import * as versusUi from './versus-ui.mjs';import {landing} from './landing.mjs';
```
2. Replace `filter={q:'',faction:'all',type:'all'};` with:
```js
filter={q:'',faction:'all',type:'all'};
let versus=null,remoteQueue=[],startMode='solo';const store=createStore();store.prune();
```

- [ ] **Step 2: Let `action()` await intents and apply remote updates in order**

1. Replace `try{fn();if(game)guidance.observe(game,lessonBefore);` with `try{const pending=fn();if(pending?.then)await pending;if(game)guidance.observe(game,lessonBefore);`
2. Replace `if(game?.winner!==null&&game&&!resultShown){resultShown=true;recap();}cardPreview.refresh();schedule();}}` with:
```js
if(game?.winner!==null&&game&&!resultShown){resultShown=true;recap();}cardPreview.refresh();schedule();drainRemote();}}
function remoteUpdate(g,{mine}){if(mine&&animating){game=g;return;}remoteQueue.push(g);drainRemote();}
async function drainRemote(){if(animating||!remoteQueue.length)return;const next=remoteQueue.shift();const before=game&&view==='arena'&&document.querySelector('.table')?snapshot(game):null;game=next;animating=true;document.body.classList.add('animating');try{if(before)await combat(before,game);if(view==='arena')render();if(before)await transitions(before,game);}finally{animating=false;document.body.classList.remove('animating');if(game?.winner!==null&&game&&!resultShown){resultShown=true;recap();}cardPreview.refresh();schedule();drainRemote();}}
```

- [ ] **Step 3: The landing page replaces the old start screen**

1. Replace `function start(f,optIn=false){cardPreview.dismiss(true);` with `function start(f,optIn=false){if(versus)leaveVersus();cardPreview.dismiss(true);`
2. Replace the entire line that begins `function startScreen(){return ` (it ends with `</div>`;}`) with:
```js
function startScreen(){return landing({mode:startMode,guide:guideChoice});}
```
3. In `render()`, replace `document.body.classList.toggle("match-playing",view==="arena"&&!!game&&game.phase!=="opening");` with `document.body.classList.toggle("match-playing",view==="arena"&&!!game&&game.phase!=="opening");document.body.classList.toggle("landing-view",view==="arena"&&!game&&!versus);`

- [ ] **Step 4: Opening hand in versus**

1. Replace `You play first and skip your first draw.</p><div class="notice">` with:
```js
${!versus||game.first===0?'You play first and skip your first draw.':'Your opponent plays first. You draw on your first turn.'}</p>${versus?versusUi.matchStatus(versus,Date.now()):''}<div class="notice">
```
2. Replace
``<div class="toolbar"><button class="primary" id="keep" ${selected.size!==game.mulligans?'disabled':''}>Keep hand${game.mulligans?` · Bottom ${game.mulligans}`:''}</button><button id="mulligan" ${game.mulligans===7?'disabled':''}>Mulligan${game.mulligans?` (${game.mulligans})`:''}</button><button id="quit">Choose another faction</button></div>``
with
``${versus&&game.kept[0]?'<p class="notice" role="status">Hand kept. Waiting for your opponent to keep theirs…</p>':`<div class="toolbar"><button class="primary" id="keep" ${selected.size!==game.mulligans?'disabled':''}>Keep hand${game.mulligans?` · Bottom ${game.mulligans}`:''}</button><button id="mulligan" ${game.mulligans===7?'disabled':''}>Mulligan${game.mulligans?` (${game.mulligans})`:''}</button><button id="quit">${versus?'Leave match':'Choose another faction'}</button></div>`}``

- [ ] **Step 5: Opponent wording, clock and recap**

1. Replace `${p===0?'YOU':'COMPUTER'}` with `${p===0?'YOU':versus?'OPPONENT':'COMPUTER'}`.
2. Replace `aria-label="${p===0?'Your':'Computer'} capacity` with `aria-label="${p===0?'Your':versus?'Opponent':'Computer'} capacity`.
3. Replace `if(game.actor()===1)return 'Computer is considering its next move…';` with `if(game.actor()===1)return versus?'Waiting for your opponent…':'Computer is considering its next move…';`.
4. Replace `<div class="eyebrow">FOUNDATIONS / TRAINING MATCH</div><h2>Turn ${game.turn} <span class="muted">/ ${PHASE_NAMES[game.phase]}</span></h2></div>` with `<div class="eyebrow">FOUNDATIONS / ${versus?'VERSUS':'TRAINING'} MATCH</div><h2>Turn ${game.turn} <span class="muted">/ ${PHASE_NAMES[game.phase]}</span></h2>${versus?versusUi.matchStatus(versus,Date.now()):''}</div>`.
5. Replace `${s.p===0?'You':'Computer'}` with `${s.p===0?'You':versus?'Opponent':'Computer'}`.
6. Replace `<div class="eyebrow">TRAINING MATCH / COMPLETE</div>` with `<div class="eyebrow">${versus?'VERSUS':'TRAINING'} MATCH / COMPLETE</div>`.
7. Replace `<button class="primary" id="rematch">Play again</button> <button id="chooseSide">Change faction</button></div>` with ``${versus?`<div id="auditResult">${versusUi.auditLine(versus.audit)}</div><button class="primary" id="versusDone">Back to arena</button>`:'<button class="primary" id="rematch">Play again</button> <button id="chooseSide">Change faction</button>'}</div>``.
8. Replace `$('#rematch').onclick=()=>start(game.players[0].faction);$('#chooseSide').onclick=()=>{modal.close();game=null;render();};}` with `if($('#rematch'))$('#rematch').onclick=()=>start(game.players[0].faction);if($('#chooseSide'))$('#chooseSide').onclick=()=>{modal.close();game=null;render();};if($('#versusDone'))$('#versusDone').onclick=leaveVersus;}`.

- [ ] **Step 6: Render the lobby, bind the landing and lobby buttons, and make leaving concede**

1. Replace `app.innerHTML=view==='library'?library():view==='guide'?guide():!game?startScreen():` with `app.innerHTML=view==='library'?library():view==='guide'?guide():versus&&!versusReady()?versusUi.lobby(versus,{url:inviteUrl(),canShare:!!navigator.share,storageOk:store.available}):!game?startScreen():`.
2. Replace `document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>start(b.dataset.start,guideChoice));` with `document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>start(b.dataset.start,guideChoice));document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{startMode=b.dataset.mode;render();document.querySelector(`[data-mode="${startMode}"]`)?.focus({preventScroll:true});});document.querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>hostMatch(b.dataset.invite));bindLobby();`.
3. Replace `$('#mulligan').onclick=()=>action(()=>{game.mulligan();selected.clear();});` with `$('#mulligan').onclick=()=>action(()=>{selected.clear();return game.mulligan();});`.
4. Replace `$('#quit').onclick=()=>{if(game.phase==='opening'){game=null;render();return;}dialog('<h2>Leave this match?</h2><p>Your current match will end. You can start a new match as either faction.</p><div class="toolbar"><button id="leave" class="primary">Leave match</button><button id="stay">Keep playing</button></div>');$('#leave').onclick=()=>{game=null;modal.close();render();};$('#stay').onclick=close;};` with:
```js
$('#quit').onclick=()=>{if(versus&&versus.status!=='playing'){leaveVersus();return;}if(game.phase==='opening'&&!versus){game=null;render();return;}dialog(`<h2>Leave this match?</h2><p>${versus?'Leaving concedes the match to your opponent.':'Your current match will end. You can start a new match as either faction.'}</p><div class="toolbar"><button id="leave" class="primary">Leave match</button><button id="stay">Keep playing</button></div>`);$('#leave').onclick=()=>{modal.close();if(versus){action(()=>game.concede(0));return;}game=null;render();};$('#stay').onclick=close;};
```
5. Replace `function advance(){action(()=>{if(game.phase==='attack')game.attackers(0,[...selected]);else if(game.phase==='block')game.blockers(0,blocks);else if(game.phase==='cleanup')game.discard([...selected]);else game.pass(0);});}` with `function advance(){action(()=>{if(game.phase==='attack')return game.attackers(0,[...selected]);if(game.phase==='block')return game.blockers(0,blocks);if(game.phase==='cleanup')return game.discard([...selected]);return game.pass(0);});}`.

- [ ] **Step 7: Versus session glue and the scheduler**

Replace `function schedule(){clearTimeout(timer);if(animating||` with:

```js
function versusReady(){return !!(versus?.seat&&game&&['playing','paused','reconnecting','ended'].includes(versus.status));}
function inviteUrl(){return versus?.role==='host'&&versus.matchId?`${location.origin}${location.pathname}#join=${versus.matchId}`:'';}
async function openVersus(role,open){if(versus)return;versus={role,status:'connecting'};game=null;view='arena';render();try{bindVersus(await open());}catch(e){versus={role,status:'error',error:e.code||'no-connection'};render();}}
function hostMatch(f){openVersus('host',async()=>{const s=await HostSession.create({net,store,hostFaction:f});history.replaceState(null,'',`#host=${s.matchId}`);return s;});}
function routeVersus(){const m=/^#(host|join)=([a-z2-7]{16})$/.exec(location.hash);if(!m||versus)return false;openVersus(m[1],()=>m[1]==='host'?HostSession.resume({net,store,matchId:m[2]}):GuestSession.join({net,store,matchId:m[2]}));return true;}
function bindVersus(s){versus=s;guidance=new Tutorial(false);resultShown=false;selected.clear();blocks={};blocker=null;remoteQueue=[];if(s.seat.game)game=s.seat.game;s.seat.onUpdate=remoteUpdate;s.onStatus=versusStatus;versusStatus();}
function versusStatus(){if(!versus)return;if(['cancelled','error'].includes(versus.status))game=null;if(versus.status!=='pledge'&&$('#pledge'))modal.close();if(versus.status==='pledge'&&!modal.open)honor();if($('#auditResult'))$('#auditResult').innerHTML=versusUi.auditLine(versus.audit);render();schedule();}
function honor(){dialog(versusUi.honorDialog({team:label(versus.faction)}));$('#pledge').onclick=()=>{modal.close();versus.pledge();};$('#pledgeLeave').onclick=leaveVersus;}
function bindLobby(){if($('#copyInvite'))$('#copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(inviteUrl());toast('Invite link copied.');}catch{$('#inviteLink').select();toast('Press Ctrl+C or ⌘C to copy the link.');}};if($('#shareInvite'))$('#shareInvite').onclick=()=>navigator.share({title:'Breach & Defend',text:'Play me in Breach & Defend',url:inviteUrl()}).catch(()=>{});if($('#showPledge'))$('#showPledge').onclick=honor;for(const id of ['cancelVersus','versusHome'])if($('#'+id))$('#'+id).onclick=leaveVersus;if($('#versusRetry'))$('#versusRetry').onclick=()=>location.reload();}
function leaveVersus(){const s=versus;versus=null;game=null;remoteQueue=[];startMode=s?'friend':startMode;s?.leave?.();history.replaceState(null,'',location.pathname+location.search);if(modal.open)modal.close();render();}
function schedule(){clearTimeout(timer);if(versus&&versus.status!=='playing')return;if(animating||
```

Then replace `if(actor===1){timer=setTimeout(()=>action(()=>game.aiAction()),450);return;}` with `if(actor===1){if(!versus)timer=setTimeout(()=>action(()=>game.aiAction()),450);return;}`.

- [ ] **Step 8: Boot routing and the clock ticker**

Replace
```js
try{Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});}catch{}}}
render();
```
with
```js
try{Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});}catch{}}}
window.addEventListener('hashchange',routeVersus);
setInterval(()=>{const el=$('#versusClock');if(el&&versus?.seat?.clock)el.textContent=versusUi.clockText(versus.seat.clock,Date.now());},250);
if(!routeVersus())render();
```

- [ ] **Step 9: Load the versus stylesheet**

In `dist/index.html`:
- Replace `<link rel="stylesheet" href="landing.css">` with `<link rel="stylesheet" href="landing.css"><link rel="stylesheet" href="versus.css">`.
- Replace `Play either faction against a computer opponent.` with `Play either faction against a computer opponent or a friend.`

- [ ] **Step 10: Syntax check and tests**

Run: `node --check dist/app.mjs && npm test`
Expected: no syntax errors, and all tests PASS.

- [ ] **Step 11: Smoke-test in the browser**

1. Run `node serve.cjs` and open `http://127.0.0.1:4173/` in the Browser pane.
2. **Landing page.** Check it against the mockup at desktop width and at `resize_window` preset `mobile`:
   - dark header with the wordmark
   - the splash hero
   - the mode cards switch, and the Play and Invite buttons follow
   - the guide checkbox appears only in computer mode
   - no horizontal scroll
3. **Solo still works.** Pick Vs. computer and then Blue. The arena switches back to the light theme. Keep, play a card, and let the computer take a turn.
4. **Guided first game.** Check "Guide my first game" and start. The tutorial panel appears.
5. **Friend mode.** Choose Play a friend, then Invite as Blue team. The invite link appears.
6. **Two tabs.** Open the link in a second tab. Both tabs show the honor dialog. Pledge in both, keep both hands, and play one full turn each.
7. **Console.** Confirm `read_console_messages` shows no errors.
8. **Reset.** Set `resize_window` back to the `desktop` preset.

- [ ] **Step 12: Commit**

```bash
git add dist/app.mjs dist/index.html
git commit -m "feat: wire the landing page and play-a-friend into the arena"
```

---

### Task 15: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`, `dist/app.mjs` (field guide text only)

- [ ] **Step 1: Update the field guide**

In `dist/app.mjs` replace `<li>Matches run in this browser tab. Reloading starts over. There are no accounts or online multiplayer matches in this edition.</li>` with `<li>Computer matches run in this browser tab; reloading starts over. Play-a-friend matches connect two browsers directly with an invite link and survive a reload. There are no accounts, matchmaking or spectators.</li>`.

Also replace `<li><strong>Keep seven cards.</strong> Mulligans redraw seven; when you keep, put one card on the bottom for each mulligan. You play first and skip your first draw.</li>` with `<li><strong>Keep seven cards.</strong> Mulligans redraw seven; when you keep, put one card on the bottom for each mulligan. Against the computer you play first; against a friend a fair coin flip decides. The first player skips their first draw.</li>`.

- [ ] **Step 2: Update `README.md`**

- In **Deliberate simplifications**, replace `No colored mana, planeswalkers, first strike, tokens, exile, sideboards, deck editor, multiplayer, or saved matches are included. Reloading resets the current match.` with `No colored mana, planeswalkers, first strike, tokens, exile, sideboards, deck editor, or saved computer matches are included. Reloading resets a computer match.`
- Replace the intro sentence `Play red or blue against a local computer opponent.` with `Play red or blue against a local computer opponent, or against a friend through an invite link.`
- Add this section after **Browse and play cards**:

```markdown
## Play a friend

On the arena start screen, choose **Play a friend**, pick your side and send the link to your opponent. They play the other faction. Both players accept a short honor pledge, then a fair coin flip, made from secrets both browsers contribute, decides who goes first.

- **Connection:** Browsers connect directly with WebRTC through the free public PeerJS signaling server. No accounts, keys or backend are required, so this works on GitHub Pages. Some corporate or mobile networks block direct connections; there is no relay server.
- **Clocks:** 60 seconds to keep an opening hand, 90 seconds per turn, and 20 seconds per response. When time runs out the game passes, skips attacks or blocks, or discards the costliest cards for you.
- **Reconnecting:** Either player can reload or lose connection and continue. The match pauses, including the clocks, until both are back. Leaving the match concedes.
- **Fair play:** The host's browser runs the rules. The guest never receives hidden cards, so the guest cannot cheat. When the match ends, the guest's browser replays every move from the revealed seed and the recap shows **Verified**, **Tampering detected**, or **Unverified**. Tampering with decks, hands or capacity is caught. Peeking at the other hand is not, which is what the honor pledge is for.
```

- In **Validation**, append: `Versus tests cover the seeded RNG, save/restore, redaction and perspective flipping, the referee, clocks, the replay audit (including five tampering kinds), storage fallbacks, and complete host/guest matches over an in-memory transport with reloads, dropped connections, impostor hosts and a third player. Landing-page tests check both modes' controls and that the web-sized splash images exist.`
- In **Source layout**, add these two lines:
  - `` - `dist/landing.mjs`: start screen with the splash hero and the game-mode selector. The original splash art lives in `art-source/`; `dist/art/splash-*` are the web sizes. ``
  - `` - `dist/protocol.mjs`, `match.mjs`, `audit.mjs`, `remote.mjs`, `session.mjs`, `net.mjs`, `storage.mjs`, `versus-ui.mjs`: play-a-friend (shared rules, host referee, audit, guest seat, sessions, PeerJS transport, storage, markup). ``

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 4: End-to-end browser check**

Run `node serve.cjs`. Use two Browser pane tabs, or a second browser profile to also test separate storage. Check each item and record the results:

1. **Invite.** Host chooses **Play a friend**, then **Invite as Red team**. The link appears and **Copy link** copies it.
2. **Join.** The guest opens the link. Both see the honor dialog. The guest's dialog says "YOU ARE BLUE TEAM".
3. **Pledge.** One player pledges and sees "Waiting for your opponent to take the pledge". When the second pledges, both reach the opening hand.
4. **Mulligan.** The guest mulligans once and keeps with one card on the bottom. The host keeps. The first player matches on both screens.
5. **A full turn.** Play a full turn each, including one attack with a block. Card animations run and the log reads "Red team …"/"Blue team …" on both sides.
6. **Clock.** Watch it count down and switch to "Opponent's response" when priority passes.
7. **Host reload.** The guest shows "Connection lost — reconnecting". After the host reloads, the match continues with the same board.
8. **Guest reload.** The host shows "Opponent disconnected — clocks paused". After the guest reloads, the match continues.
9. **Third tab.** Opening the link in a third tab or profile gives "This match already has two players."
10. **Timeout.** Let a response clock run out and confirm the game passes automatically.
11. **Concede.** One player uses **Leave match** to concede. Both see the recap. The guest's recap shows **Verified** first, then the host's.
12. **Back to the landing page.** After **Back to arena**, the landing page returns with **Play a friend** still selected.
13. **Mobile.** Resize to mobile width and confirm the landing page, invite lobby and honor dialog fit without horizontal scrolling.
14. **Console.** Confirm `read_console_messages` shows no errors in either tab.

- [ ] **Step 5: Commit**

```bash
git add README.md dist/app.mjs
git commit -m "docs: document play-a-friend mode and the new landing page"
```

---

## Known Limitations Carried From the Spec

- The host can peek at the guest's hand. It can also time its own timeouts, or claim a guest timeout slightly early. Neither is detectable.
- There's no TURN relay, and the public PeerJS server has no uptime guarantee.
- If the host clears site data, the match is lost.
