# Persistent Threats, Plan 1: Card Sets and Match Card Pools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "which cards are in this match" a first-class, saved and audited match setting. First Breach stays the only released pool and behaves exactly as today; the plumbing is ready for the Persistent Threats pool.

**Architecture:**
- The catalog (`public/cards.mjs`) gains a `SETS` registry (with a `released` flag), a `set` field on every card, and a `POOLS` registry mapping a pool id to its sets and deck builder.
- `Game` takes a `pool` option and records it. It leaves the pool out of its JSON when it is the default, so First Breach saves, views, digests and audits stay byte-identical.
- The pool travels through the same paths as `hostFaction`: invite record → `welcome` message → guest record → `Match.create` → `versusGame` → `audit`.
- Views show set codes and derived counts. The start screen shows an opt-in checkbox only when a second pool is released, so nothing visible changes yet.

**Tech Stack:** Plain ES modules in `public/`, no dependencies, `node --test` (Node ≥ 22), Prettier 3.9.9, TypeScript `checkJs` via `npm run typecheck`.

**Spec:** `docs/design/persistent-threats.md`, specifically the sections "Opting in and mixing sets", "Engine work required before release" item 1, and "Multiplayer (play a friend)" → Match setup.

## Roadmap

The design covers six subsystems, so it is split into six plans. Each plan leaves `main` releasable, with First Breach unchanged and the expansion hidden. Plans 2–6 are written when their turn comes, against the code as it is then.

1. **Card sets and match card pools** (this plan). Sets, pools, the `pool` option, pool-aware invites and audits, set codes in views, and the hidden opt-in checkbox.
2. **Rules engine core.** Stack entries without cards, triggered and activated abilities, event batches, atomic costs (tap/retire/archive), serializable `pendingChoice` and `choose()`, tokens, the archive, zone-change identity, per-turn tracking, lockdown, dynamic keywords, auto-pass awareness, and `actionOptions()`. Tested with the tokens plus small test-only card definitions.
3. **Persistent Threats cards and decks.** All 50 card definitions (`released: false`) with rules tests per card, the two decks and the `first-breach+persistent-threats` pool, and the computer opponent's new decisions.
4. **Multiplayer for the expansion.** `activate`/`choose` actions, `actionFields`, flip/unflip of nested targets and choices, `sanitizeView` shapes, Probe redaction with commit and reveal, clocks for pending choices, `timeoutAction` defaults, and audit coverage.
5. **Expansion interface.** Token activation, Overclock/mode/cost preparation, discard/Reuse and archive viewers, Probe dialog, ability stack entries in `arena-view`/`motion`/`tutorial`, soft-counter prompt, drag rules, and accessibility.
6. **Content and release.** `LORE` for 50 cards and 2 tokens, art and prompts, the Field Guide section and rules-scope update, optional advanced lessons, playtest harness results, and then flipping `released: true`.

## Global Constraints

- The First Breach pool is the default and "behaves exactly as it does today: the same starter decks, the same deck-list order, and therefore the same shuffles for the same seed. Existing tests, saved matches and audits must not change."
- "The pool is fixed when the match is created and applies to both players."
- "The opt-in stays hidden until all 50 cards and both tokens have their lore and art." In code, the opt-in shows only for pools whose sets are all `released: true`.
- "The tutorial teaches First Breach only. While **Guide my first game** is checked, the expansion checkbox is disabled and says why."
- The preference is "remembered per browser" through the existing never-throwing `createStore` (`public/storage.mjs`).
- Card footers show the set code: `FB1` for First Breach, `PT1` for Persistent Threats (`RED / FB1`).
- First Breach card IDs `r0`–`r24` and `b0`–`b24` never change.
- Set counts and deck descriptions are derived from the catalog, not hardcoded.
- No new dependencies. Views stay pure string functions. Run `npm run format` before each commit; `npm test`, `npm run typecheck` and `npm run format:check` must pass.
- Commit messages follow the repo style: an imperative sentence in sentence case, with no `feat:`-style prefix.

## Review Focus

1. **Saved matches from before this change** (game JSON and guest records with no `pool` field) must resume, render and audit as `verified`. Tested in Task 2 (`fromJSON` without `pool`) and Task 3 (audit record without `pool`).
2. **A host offering a pool this browser doesn't know** (a newer version, or a tampered invite) must stop the guest with a clear error, not crash or silently play the wrong decks. Tested in Task 4.
3. **A stored preference naming an unknown or unreleased pool** must fall back to First Breach. Tested in Task 1 (`playablePool`).
4. **A guided first game while the expansion preference is on** must still be First Breach. Tested in Task 1 (`playablePool` with `guided`) and wired in Task 6.
5. **A view that spells out the default pool** (`pool: 'first-breach'`) must be rejected, so there is one canonical encoding and First Breach digests never change. Tested in Task 3.

---

## File map

| File | Change |
|---|---|
| `public/cards.mjs` | `SETS`, `set` field, explicit IDs, optional lore for unreleased sets, `POOLS`, `DEFAULT_POOL`, `poolReleased`, `releasedPools`, `releasedCards`, `playablePool`, `deck(faction, pool)` |
| `public/engine.mjs` | `pool` constructor option; `toJSON` omits the default; `fromJSON` restores it |
| `public/protocol.mjs` | `versusGame(seed, hostFaction, pool)`; `sanitizeView` accepts an optional non-default `pool` |
| `public/match.mjs` | `Match.create` passes `pool` |
| `public/audit.mjs` | Replays with the record's `pool`; unknown pool → unverified |
| `public/session.mjs` | Host record and `welcome` carry `pool`; guest validates and stores it; `session.pool` |
| `public/versus-ui.mjs` | `unknown-pool` error; lobby shows a non-default pool |
| `public/card-view.mjs` | Footer uses the card's set code |
| `public/library.mjs` | Released cards only; derived counts; set filter when more than one set is released |
| `public/arena-view.mjs` | Match eyebrow names the pool |
| `public/landing.mjs` | Derived card count; expansion opt-in checkbox |
| `public/app.mjs` | Pool preference, set filter state, passing the pool to `Game` and `HostSession.create` |
| `tests/catalog.test.mjs` | New: sets, pools, decks |
| `tests/engine.test.mjs`, `tests/lore-panel.test.mjs`, `tests/views.test.mjs` | Iterate released cards; new pool, view and landing tests |
| `tests/protocol.test.mjs`, `tests/audit.test.mjs`, `tests/session.test.mjs`, `tests/versus-ui.test.mjs`, `tests/landing.test.mjs` | Pool coverage |

Tests that need a second pool register a temporary one and remove it afterwards. Each `node --test` file runs in its own process, so this never leaks between files:

```js
import {POOLS} from '../public/cards.mjs';
const mirror = t => {
  POOLS.mirror = {name: 'Mirror', optIn: 'Mirror', sets: ['first-breach'], deck: f => [...POOLS['first-breach'].deck(f)].reverse()};
  t.after(() => delete POOLS.mirror);
};
```

---

### Task 1: Sets and pools in the catalog

**Files:**
- Modify: `public/cards.mjs` (the `add` function at the top, `R`/`B` helpers, and the `deck` export near the end)
- Create: `tests/catalog.test.mjs`
- Modify: `tests/engine.test.mjs:25-32`, `tests/lore-panel.test.mjs:6-12`

**Interfaces:**
- Produces:
  - `SETS: {[id]: {name: string, code: string, released: boolean}}`; `SETS['first-breach'] = {name: 'First Breach', code: 'FB1', released: true}`
  - every card has `set: string`
  - `DEFAULT_POOL = 'first-breach'`
  - `POOLS: {[id]: {name: string, optIn?: string, sets: string[], deck: (faction) => string[]}}`
  - `poolReleased(id): boolean`, `releasedPools(): string[]`, `releasedCards(): card[]`
  - `playablePool(choice, {guided = false} = {}): string`
  - `deck(faction, pool = DEFAULT_POOL): string[]`, which throws `Unknown card pool: <id>.` for unknown ids

- [ ] **Step 1: Write the failing tests**

Create `tests/catalog.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  BY_ID,
  CARDS,
  DEFAULT_POOL,
  POOLS,
  SETS,
  deck,
  playablePool,
  poolReleased,
  releasedCards,
  releasedPools,
} from '../public/cards.mjs';

const mirror = t => {
  POOLS.mirror = {name: 'Mirror', optIn: 'Mirror', sets: ['first-breach'], deck: f => [...POOLS['first-breach'].deck(f)].reverse()};
  t.after(() => delete POOLS.mirror);
};
const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');

test('every card belongs to a known set and First Breach ids are unchanged', () => {
  for (const c of CARDS) assert.ok(Object.hasOwn(SETS, c.set), `${c.name} set`);
  assert.deepEqual(SETS['first-breach'], {name: 'First Breach', code: 'FB1', released: true});
  assert.equal(CARDS.filter(c => c.set === 'first-breach').length, 50);
  assert.equal(BY_ID.r0.name, 'Relay Node');
  assert.equal(BY_ID.r24.name, 'Disable Safeguard');
  assert.equal(BY_ID.b0.name, 'Secure Datacenter');
  assert.equal(BY_ID.b24.name, 'Configuration Audit');
});

test('the default pool builds exactly the shipped First Breach starters', () => {
  assert.equal(DEFAULT_POOL, 'first-breach');
  // Hashes of the deck lists before sets existed: any change would change every seeded shuffle.
  assert.equal(sha(deck('red')), '71cd4634db8b69fd87402a504897df657b308772b58937d352ef5524344c8795');
  assert.equal(sha(deck('blue')), '664645c93cc145e09909f95aa39dc530eb85cdba53e9962a62aad3a653a5bc9d');
  for (const f of ['red', 'blue']) assert.deepEqual(deck(f, DEFAULT_POOL), deck(f));
  assert.throws(() => deck('red', 'nope'), /Unknown card pool: nope\./);
  assert.throws(() => deck('red', '__proto__'), /Unknown card pool/);
});

test('every pool deck is legal: one faction, 60 cards, at most two of each non-basic card', () => {
  for (const [id, pool] of Object.entries(POOLS))
    for (const f of ['red', 'blue']) {
      const list = pool.deck(f);
      assert.equal(list.length, 60, `${id} ${f} size`);
      const basic = CARDS.find(c => c.set === 'first-breach' && c.faction === f && c.type === 'Infrastructure').id;
      const counts = Object.groupBy(list, x => x);
      for (const [cardId, copies] of Object.entries(counts)) {
        assert.equal(BY_ID[cardId].faction, f, `${id} ${f} ${cardId} faction`);
        if (cardId !== basic) assert.ok(copies.length <= 2, `${id} ${f} ${cardId} copies`);
      }
    }
});

test('only pools whose sets are all released are offered', t => {
  assert.deepEqual(releasedPools(), ['first-breach']);
  assert.equal(poolReleased('nope'), false);
  mirror(t);
  assert.deepEqual(releasedPools(), ['first-breach', 'mirror']);
  SETS.hidden = {name: 'Hidden', code: 'HD1', released: false};
  POOLS.later = {name: 'Later', sets: ['first-breach', 'hidden'], deck: POOLS['first-breach'].deck};
  t.after(() => {
    delete SETS.hidden;
    delete POOLS.later;
  });
  assert.equal(poolReleased('later'), false);
  assert.ok(!releasedPools().includes('later'));
});

test('released cards are the cards of released sets', () => {
  assert.deepEqual(
    releasedCards().map(c => c.id),
    CARDS.filter(c => SETS[c.set].released).map(c => c.id),
  );
});

test('a stored or chosen pool falls back to First Breach unless it is released and the game is not guided', t => {
  assert.equal(playablePool(undefined), 'first-breach');
  assert.equal(playablePool(null), 'first-breach');
  assert.equal(playablePool('nope'), 'first-breach');
  assert.equal(playablePool({}), 'first-breach');
  mirror(t);
  assert.equal(playablePool('mirror'), 'mirror');
  assert.equal(playablePool('mirror', {guided: true}), 'first-breach');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/catalog.test.mjs`
Expected: FAIL. Imports such as `SETS` and `POOLS` are not exported.

- [ ] **Step 3: Implement the catalog changes**

In `public/cards.mjs`, replace the header through the `R`/`B` helpers:

```js
// Original teaching set. Mechanics are abstractions, not operational instructions.
import {LORE} from './lore.mjs';
// A set stays out of the library and the start screen until `released`: every card has lore and art by then.
export const SETS = {
  'first-breach': {name: 'First Breach', code: 'FB1', released: true},
};
const cards = [];
function add(set, faction, name, cost, type, text, extra = {}) {
  // First Breach ids come from position and must never shift; later sets give explicit ids.
  const id = extra.id ?? faction[0] + cards.filter(c => c.faction === faction && c.set === 'first-breach').length;
  const lore = LORE[name];
  if (!lore && SETS[set].released) throw Error(`${name} has no lore.`);
  cards.push({
    id,
    set,
    faction,
    name,
    cost,
    type,
    text,
    flavor: lore?.flavor,
    flavorBy: lore?.by,
    lesson: lore?.learn,
    ...extra,
    art: `cards/${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`,
  });
}
const R = (...a) => add('first-breach', 'red', ...a),
  B = (...a) => add('first-breach', 'blue', ...a);
```

Replace the `deck` export:

```js
// The shipped starters: 24 infrastructure, two of each unit, one of everything else. Order matters: seeded shuffles
// start from it, so changing it would change every saved and audited match.
function starter(faction) {
  const own = cards.filter(c => c.faction === faction && c.set === 'first-breach');
  return [
    ...Array(24).fill(own[0].id),
    ...own.filter(c => c.type === 'Unit').flatMap(c => [c.id, c.id]),
    ...own.filter(c => !['Unit', 'Infrastructure'].includes(c.type)).map(c => c.id),
  ];
}
export const DEFAULT_POOL = 'first-breach';
// A match's card pool: which sets it uses and the deck each faction plays. `optIn` names it on the start screen.
export const POOLS = {
  'first-breach': {name: 'First Breach', sets: ['first-breach'], deck: starter},
};
export const poolReleased = id =>
  typeof id === 'string' && Object.hasOwn(POOLS, id) && POOLS[id].sets.every(s => SETS[s]?.released);
export const releasedPools = () => Object.keys(POOLS).filter(poolReleased);
export const releasedCards = () => cards.filter(c => SETS[c.set].released);
// Guided games teach First Breach, and a stored choice may name a pool this version no longer offers.
export const playablePool = (choice, {guided = false} = {}) =>
  !guided && poolReleased(choice) ? choice : DEFAULT_POOL;
export function deck(faction, pool = DEFAULT_POOL) {
  if (typeof pool !== 'string' || !Object.hasOwn(POOLS, pool)) throw Error(`Unknown card pool: ${pool}.`);
  return POOLS[pool].deck(faction);
}
```

- [ ] **Step 4: Point existing whole-catalog tests at released cards**

In `tests/engine.test.mjs`, replace the first test (lines 25–32):

```js
test('50 illustrated First Breach cards; each faction has a legal 60-card starter', () => {
  assert.equal(CARDS.filter(c => c.set === 'first-breach').length, 50);
  for (const f of ['red', 'blue']) {
    assert.equal(deck(f).length, 60);
    assert.equal(CARDS.filter(c => c.set === 'first-breach' && c.faction === f).length, 25);
  }
  for (const c of releasedCards()) assert.ok(fs.existsSync(new URL(`../public/art/${c.art}.webp`, import.meta.url)));
});
```

and change its import to `import {CARDS, BY_ID, deck, releasedCards} from '../public/cards.mjs';`.

In `tests/lore-panel.test.mjs`, import `releasedCards` instead of `CARDS`, iterate `for (const c of releasedCards())` in the first test, and use `const card = releasedCards()[0];` in the second.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, including the six new catalog tests.

- [ ] **Step 6: Commit**

```bash
npm run format
git add public/cards.mjs tests/catalog.test.mjs tests/engine.test.mjs tests/lore-panel.test.mjs
git commit -m "Give cards a set and decks a card pool"
```

---

### Task 2: The match's card pool in the engine

**Files:**
- Modify: `public/engine.mjs:1` (import), `:33-46` (constructor), `:589-598` (`toJSON`/`fromJSON`)
- Test: `tests/engine.test.mjs` (append)

**Interfaces:**
- Consumes: `deck(faction, pool)` and `DEFAULT_POOL` from Task 1.
- Produces:
  - `new Game(faction, random, {first, mode, pool = DEFAULT_POOL})` and a `game.pool` string.
  - `toJSON()` has no `pool` key when the pool is the default, and `pool: <id>` otherwise.
  - `Game.fromJSON(json).pool` is always set, defaulting to `DEFAULT_POOL`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine.test.mjs`. Add `POOLS` to the cards import, and add `import {seededRandom} from '../public/rng.mjs';` to the imports at the top.

```js
test('a match records its card pool; First Breach saves keep the pre-expansion format', t => {
  const g = new Game('blue', seededRandom([1, 2, 3, 4]));
  assert.equal(g.pool, 'first-breach');
  assert.equal(Object.hasOwn(g.toJSON(), 'pool'), false);
  assert.equal(Game.fromJSON(g.toJSON()).pool, 'first-breach');

  const same = new Game('blue', seededRandom([1, 2, 3, 4]), {pool: 'first-breach'});
  assert.deepEqual(same.toJSON(), g.toJSON());

  POOLS.mirror = {name: 'Mirror', sets: ['first-breach'], deck: f => [...POOLS['first-breach'].deck(f)].reverse()};
  t.after(() => delete POOLS.mirror);
  const m = new Game('blue', seededRandom([1, 2, 3, 4]), {pool: 'mirror'});
  assert.equal(m.toJSON().pool, 'mirror');
  assert.equal(Game.fromJSON(m.toJSON()).pool, 'mirror');
  assert.notDeepEqual(
    m.players[0].hand.map(c => c.id),
    g.players[0].hand.map(c => c.id),
    'the pool decides the decks',
  );
  assert.throws(() => new Game('blue', Math.random, {pool: 'nope'}), /Unknown card pool/);
});

test('a save from before card pools resumes as First Breach', () => {
  const json = new Game().toJSON();
  delete json.pool;
  assert.equal(Game.fromJSON(json).pool, 'first-breach');
});
```

If the hand comparison happens to be equal for this seed, change the seed to `[5, 6, 7, 8]`. The point is that the mirror deck is dealt from a different list.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/engine.test.mjs`
Expected: FAIL. `g.pool` is `undefined`.

- [ ] **Step 3: Implement**

`public/engine.mjs`:

```js
import {BY_ID, DEFAULT_POOL, deck} from './cards.mjs';
```

Constructor:

```js
  constructor(faction = 'blue', random = Math.random, {first = 0, mode = 'solo', pool = DEFAULT_POOL} = {}) {
    this.random = random;
    this.mode = mode;
    this.pool = pool;
    this.first = first;
    this.uid = 0;
    this.players = [faction, faction === 'blue' ? 'red' : 'blue'].map(f => ({
      faction: f,
      life: 20,
      deck: this.shuffle(deck(f, pool).map(id => this.card(id))),
```

(the rest is unchanged). `toJSON`/`fromJSON`:

```js
  toJSON() {
    const {random, ...state} = this;
    // First Breach matches keep the pre-expansion format, so their saves, views and audit digests don't change.
    if (state.pool === DEFAULT_POOL) delete state.pool;
    return structuredClone({...state, rng: random.state ?? null});
  }
  static fromJSON(json) {
    const {rng, ...state} = structuredClone(json);
    const g = Object.assign(Object.create(Game.prototype), state);
    g.pool ??= DEFAULT_POOL;
    g.random = rng ? seededRandom(rng) : Math.random;
    return g;
  }
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS. The versus, audit and session tests are unchanged because First Breach JSON has no `pool` key.

- [ ] **Step 5: Commit**

```bash
npm run format
git add public/engine.mjs tests/engine.test.mjs
git commit -m "Record the card pool on a match"
```

---

### Task 3: Card pool in versus setup, view checks and the audit

**Files:**
- Modify: `public/protocol.mjs:1-5` (imports), `:27-30` (`versusGame`), `:194-252` (`sanitizeView`)
- Modify: `public/match.mjs:29-32` (`Match.create`)
- Modify: `public/audit.mjs:57-66` (`audit` parameters), `:88` (`versusGame` call)
- Test: `tests/protocol.test.mjs`, `tests/audit.test.mjs`

**Interfaces:**
- Consumes: `DEFAULT_POOL`, `POOLS` (Task 1); `Game` `pool` option (Task 2).
- Produces:
  - `versusGame(seed, hostFaction, pool = DEFAULT_POOL)`.
  - `Match.create({hostFaction, hostSecret, guestSecret, seedCommit, pool = DEFAULT_POOL}, options)`.
  - `audit({..., pool = DEFAULT_POOL})` returns `unverified` for an unknown pool.
  - `sanitizeView` accepts a view with or without `pool`. When present, it must be a known pool other than the default.

- [ ] **Step 1: Write the failing tests**

Append to `tests/protocol.test.mjs`. Add `POOLS` to its cards import, add `sanitizeView`, `versusGame` and `viewFor` to its protocol import if missing, and add `import {Game} from '../public/engine.mjs';` if missing.

```js
const mirror = t => {
  POOLS.mirror = {name: 'Mirror', sets: ['first-breach'], deck: f => [...POOLS['first-breach'].deck(f)].reverse()};
  t.after(() => delete POOLS.mirror);
};
const SEED = 'ab'.repeat(32);

test('a First Breach view has no pool key, so its digests are unchanged', () => {
  const view = viewFor(versusGame(SEED, 'blue'), 1);
  assert.equal(Object.hasOwn(view, 'pool'), false);
  assert.doesNotThrow(() => sanitizeView(view));
  assert.throws(() => sanitizeView({...view, pool: 'first-breach'}), /Invalid view: pool/);
});

test('an expansion view carries its pool, and an unknown pool is rejected', t => {
  mirror(t);
  const g = versusGame(SEED, 'blue', 'mirror');
  assert.equal(g.pool, 'mirror');
  const view = viewFor(g, 1);
  assert.equal(view.pool, 'mirror');
  assert.doesNotThrow(() => sanitizeView(view));
  assert.equal(Game.fromJSON(view).pool, 'mirror');
  assert.throws(() => sanitizeView({...view, pool: 'nope'}), /Invalid view: pool/);
  assert.throws(() => sanitizeView({...view, pool: '__proto__'}), /Invalid/);
  assert.throws(() => sanitizeView({...view, pool: 7}), /Invalid view: pool/);
});
```

In `tests/audit.test.mjs`, give `record` a pool parameter. Change its signature to `async function record(tamper = () => {}, seed = 1, pool = undefined)`, pass `pool` inside the `Match.create` state object (`{hostFaction: 'blue', hostSecret, guestSecret, seedCommit: await sha256Hex(hostSecret), pool}`), and add `...(pool ? {pool} : {})` to the returned object. Then append the tests below (add `import {POOLS} from '../public/cards.mjs';`):

```js
test('an expansion match verifies with its pool and is caught if audited with another', async t => {
  POOLS.mirror = {name: 'Mirror', sets: ['first-breach'], deck: f => [...POOLS['first-breach'].deck(f)].reverse()};
  t.after(() => delete POOLS.mirror);
  const rec = await record(undefined, 1, 'mirror');
  assert.equal(rec.pool, 'mirror');
  assert.deepEqual(await audit(rec), {result: 'verified'});
  const {pool, ...withoutPool} = rec;
  assert.equal((await audit(withoutPool)).result, 'tampered');
});

test('a record from before card pools audits as First Breach; an unknown pool is unverified', async () => {
  const rec = await record();
  assert.equal(Object.hasOwn(rec, 'pool'), false);
  assert.deepEqual(await audit(rec), {result: 'verified'});
  assert.equal((await audit({...rec, pool: 'nope'})).result, 'unverified');
});
```

`Match.create` must tolerate `pool: undefined` (the default parameter covers it).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/protocol.test.mjs tests/audit.test.mjs`
Expected: FAIL. `versusGame` ignores the pool, and `sanitizeView` rejects the `pool` key as unknown view fields.

- [ ] **Step 3: Implement**

`public/protocol.mjs`: import `DEFAULT_POOL` and `POOLS` along with `BY_ID` and `CARDS`.

```js
export function versusGame(seed, hostFaction, pool = DEFAULT_POOL) {
  const bytes = hexBytes(seed);
  return new Game(hostFaction, seededRandom(bytes.slice(0, 16)), {mode: 'versus', first: bytes[16] & 1, pool});
}
```

In `sanitizeView`, replace `obj(view, VIEW_KEYS, 'view');` with:

```js
  // The default pool is never spelled out (Game.toJSON omits it), so there is one encoding and old digests hold.
  const pooled = Object.hasOwn(view, 'pool');
  obj(view, pooled ? [...VIEW_KEYS, 'pool'].sort() : VIEW_KEYS, 'view');
  if (pooled && (typeof view.pool !== 'string' || !Object.hasOwn(POOLS, view.pool) || view.pool === DEFAULT_POOL))
    fail('pool');
```

This must come after `safeKeys(view)`, which already rejects `__proto__` keys.

`public/match.mjs`, `Match.create`:

```js
  static async create({hostFaction, hostSecret, guestSecret, seedCommit, pool}, options) {
    const game = versusGame(await seedHex(hostSecret, guestSecret), hostFaction, pool);
```

(`versusGame`'s default parameter handles `undefined`.)

`public/audit.mjs`: add `import {POOLS} from './cards.mjs';` and a `pool = 'first-breach'` field to the `audit` parameter destructuring. Right after the completeness check (`if (!guestSecret || !digests[0] ...)`), add:

```js
  if (typeof pool !== 'string' || !Object.hasOwn(POOLS, pool))
    return unverified('This match used cards this version of the game doesn’t have.');
```

Change the replay line to `const game = versusGame(await seedHex(hostSecret, guestSecret), hostFaction, pool);`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add public/protocol.mjs public/match.mjs public/audit.mjs tests/protocol.test.mjs tests/audit.test.mjs
git commit -m "Carry the card pool through versus views and the audit"
```

---

### Task 4: The invite carries the card pool

**Files:**
- Modify: `public/session.mjs:77-90` (`HostSession.create`), `:110` (constructor), `:253-260` (`welcome` message), `:288-295` (`seeded`), `:394-410` (guest record defaults), `:419` (guest constructor), `:520-530` (guest `welcome` handler)
- Modify: `public/versus-ui.mjs:5-15` (`ERRORS`), `:19-35` (lobby `waiting` and `pledge`)
- Test: `tests/session.test.mjs`, `tests/versus-ui.test.mjs`

**Interfaces:**
- Consumes: `DEFAULT_POOL`, `POOLS` (Task 1); `Match.create({..., pool})` (Task 3).
- Produces:
  - `HostSession.create({net, store, hostFaction, pool = DEFAULT_POOL, ...})`, which throws `Unknown card pool: <id>.` for unknown pools.
  - `record.pool` on both sides; `session.pool: string` on `HostSession` and `GuestSession`.
  - A `welcome` message with a `pool` field.
  - A guest error code `'unknown-pool'`.
  - `lobby(session)` shows `session.pool` when it is not the default.

- [ ] **Step 1: Write the failing tests**

In `tests/session.test.mjs`, give `pair` a `pool` option. Change the destructuring to `{..., seed = 1, clock = fakeTime(), pool} = {}` and add `pool` to the `HostSession.create` call. Import `POOLS` from `../public/cards.mjs`. Then append:

```js
const mirror = t => {
  POOLS.mirror = {name: 'Mirror', sets: ['first-breach'], deck: f => [...POOLS['first-breach'].deck(f)].reverse()};
  t.after(() => delete POOLS.mirror);
};

test('the invite carries the card pool to the guest, and the match verifies', async t => {
  mirror(t);
  const ctx = await start(await pair({pool: 'mirror'}));
  assert.equal(ctx.host.pool, 'mirror');
  assert.equal(ctx.guest.pool, 'mirror');
  assert.equal(ctx.guest.seat.game.pool, 'mirror');
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 80);
  if (ctx.host.seat.game.winner === null) await ctx.host.seat.game.concede(0);
  await settle(ctx);
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
});

test('a First Breach invite reports its pool and a pre-pool host record still works', async () => {
  const ctx = await pair();
  assert.equal(ctx.host.pool, 'first-breach');
  assert.equal(ctx.guest.pool, 'first-breach');
});

test('a guest offered a pool it does not know stops with a clear error', async t => {
  mirror(t);
  const net = fakeNet();
  const host = await HostSession.create({net, store: store(), hostFaction: 'blue', pool: 'mirror', clock: fakeTime()});
  delete POOLS.mirror; // This guest's version of the game doesn't have the pool.
  const guest = await GuestSession.join({net, store: store(), matchId: host.matchId, retry});
  await settle({host, guest, net});
  assert.equal(guest.status, 'error');
  assert.equal(guest.error, 'unknown-pool');
  assert.equal(host.match, null, 'no match was seeded');
});

test('a host cannot open an invite for an unknown pool', async () => {
  await assert.rejects(
    HostSession.create({net: fakeNet(), store: store(), hostFaction: 'blue', pool: 'nope', clock: fakeTime()}),
    /Unknown card pool/,
  );
});
```

The `settle` helper already ignores a missing `guest.settled` if the guest stops. If `settle` throws "never went quiet" because the host keeps a connection open, pass `{host, guest, net}` exactly as shown; the host stays in `waiting`/`pledge`, which is quiet.

Append to `tests/versus-ui.test.mjs` (add `import {POOLS} from '../public/cards.mjs';`):

```js
test('the lobby names a non-default card pool before the pledge, and explains an unknown one', t => {
  POOLS.mirror = {name: 'First Breach + Mirror', sets: ['first-breach'], deck: POOLS['first-breach'].deck};
  t.after(() => delete POOLS.mirror);
  assert.doesNotMatch(ui.lobby({status: 'pledge', pool: 'first-breach'}), /class="lobby-pool"/);
  assert.match(ui.lobby({status: 'pledge', pool: 'mirror'}), /class="lobby-pool">Cards: First Breach \+ Mirror</);
  assert.match(ui.lobby({status: 'waiting', pool: 'mirror'}, {url: 'u'}), /Cards: First Breach \+ Mirror/);
  assert.match(ui.lobby({status: 'error', error: 'unknown-pool'}), /cards this version of the game doesn’t have/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/session.test.mjs tests/versus-ui.test.mjs`
Expected: FAIL. `host.pool` is `undefined`, and there is no `unknown-pool` error text.

- [ ] **Step 3: Implement the host side**

`public/session.mjs`: import `{DEFAULT_POOL, POOLS}` from `./cards.mjs`.

`HostSession.create`:

```js
  static async create({net, store, hostFaction, pool = DEFAULT_POOL, matchId = newMatchId(), clock, random = randomHex}) {
    if (typeof pool !== 'string' || !Object.hasOwn(POOLS, pool)) throw Error(`Unknown card pool: ${pool}.`);
    const hostSecret = random();
    const record = {
      hostFaction,
      pool,
      hostSecret,
```

In the constructor, next to `this.faction = record.hostFaction;`, add a comment and the field:

```js
    // Records saved before card pools existed are First Breach matches.
    this.pool = record.pool ?? DEFAULT_POOL;
```

`welcome` message: add `pool: this.pool,` after `hostFaction: r.hostFaction,`.

`seeded`: pass it to the match with `{hostFaction: r.hostFaction, pool: this.pool, hostSecret: r.hostSecret, guestSecret, seedCommit: r.seedCommit}`.

- [ ] **Step 4: Implement the guest side**

Add `pool: null,` to the guest record defaults, after `hostFaction: null,`. Next to `this.faction = this.record.hostFaction && other(...)`, add:

```js
    this.pool = this.record.pool ?? DEFAULT_POOL;
```

In the `welcome` case, validate before storing anything or sending the seed:

```js
      case 'welcome': {
        if (r.hostToken && msg.hostToken !== r.hostToken) return this.impostor();
        // A host from before card pools sends none: that is First Breach.
        const pool = msg.pool ?? DEFAULT_POOL;
        if (typeof pool !== 'string' || !Object.hasOwn(POOLS, pool)) {
          this.dispose(true);
          return this.set('error', {error: 'unknown-pool'});
        }
        Object.assign(r, {
          guestToken: msg.guestToken,
          hostToken: msg.hostToken,
          seedCommit: msg.seedCommit,
          hostFaction: msg.hostFaction,
          pool,
        });
        this.pool = pool;
```

Keep the rest of the case unchanged, and close the added block `}` after its final `return`. The guest's `audit(r)` call now receives `r.pool` through the record. `dispose(true)` removes the guest's saved record and closes the connection, as the existing `'full'` error does, so a reload doesn't retry a match this version can't play.

- [ ] **Step 5: Implement the lobby**

`public/versus-ui.mjs`: import `{DEFAULT_POOL, POOLS}` from `./cards.mjs`. Add to `ERRORS`:

```js
  'unknown-pool':
    'This match uses cards this version of the game doesn’t have. Reload the page to update, then open the link again.',
```

Inside `lobby`, before the `switch`:

```js
  const pool =
    session.pool && session.pool !== DEFAULT_POOL
      ? `<p class="lobby-pool">Cards: ${esc(POOLS[session.pool]?.name ?? session.pool)}</p>`
      : '';
```

Insert `${pool}` at the start of the body string of the `waiting` and `pledge` cases.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run format
git add public/session.mjs public/versus-ui.mjs tests/session.test.mjs tests/versus-ui.test.mjs
git commit -m "Send the card pool with a play-a-friend invite"
```

---

### Task 5: Set codes and catalog-derived counts in the views

**Files:**
- Modify: `public/card-view.mjs:70` (footer)
- Modify: `public/library.mjs` (whole file)
- Modify: `public/arena-view.mjs:99` (match eyebrow)
- Modify: `public/landing.mjs:39-49` (hero card count)
- Modify: `public/app.mjs:48` (`filter` state), `FIELDS` (`setFilter`)
- Test: `tests/views.test.mjs`, `tests/landing.test.mjs`

**Interfaces:**
- Consumes: `SETS`, `POOLS`, `releasedCards`, `DEFAULT_POOL` (Task 1); `game.pool` (Task 2).
- Produces:
  - Library `filter` state has a `set` field (`'all'` or a set id). `matches(c, {q, faction, type, set = 'all'})`.
  - A `#setFilter` select, rendered only when more than one set is released.

- [ ] **Step 1: Write the failing tests**

In `tests/views.test.mjs`, add `releasedCards`, `SETS` and `POOLS` to the cards import. In the existing library test, change the count assertion to `releasedCards().length`, then append:

```js
test('cards show their set code', () => {
  assert.match(card(state(null), 'r1'), /RED \/ FB1/);
  assert.match(card(state(null), 'b1'), /BLUE \/ FB1/);
});

test('the library shows released sets only, with counts from the catalog and a set filter once there are two', t => {
  const html = library(state(null));
  assert.match(html, new RegExp(`${releasedCards().length} cards · 2 starter decks`));
  assert.doesNotMatch(html, /id="setFilter"/);
  assert.doesNotMatch(html, /shared by thematic card families/);
  SETS.extra = {name: 'Extra', code: 'EX1', released: true};
  t.after(() => delete SETS.extra);
  const two = library(state(null));
  assert.match(two, /id="setFilter"/);
  assert.match(two, /<option value="extra" >Extra<\/option>/);
  const fb = CARDS.find(c => c.set === 'first-breach');
  assert.equal(matches(fb, {q: '', faction: 'all', type: 'all', set: 'extra'}), false);
  assert.equal(matches(fb, {q: '', faction: 'all', type: 'all', set: 'first-breach'}), true);
  assert.equal(matches(fb, {q: '', faction: 'all', type: 'all'}), true);
});

test('the match eyebrow names the card pool', t => {
  assert.match(arena.battlefield(state(new Game())), /FIRST BREACH \/ TRAINING MATCH/);
  POOLS.mirror = {name: 'First Breach + Mirror', sets: ['first-breach'], deck: POOLS['first-breach'].deck};
  t.after(() => delete POOLS.mirror);
  const g = new Game('blue', Math.random, {pool: 'mirror'});
  assert.equal(arena.poolEyebrow(g), 'FIRST BREACH + MIRROR');
  assert.equal(arena.poolEyebrow(new Game()), 'FIRST BREACH');
});
```

`card(s, id)` is `card-view.mjs`'s export; check that `state(null)` has what it needs, as the existing library test calls it through `libraryGrid`. In `tests/landing.test.mjs`, append:

```js
import {releasedCards} from '../public/cards.mjs';
test('the hero counts the released cards', () => {
  assert.match(landing(), new RegExp(`${releasedCards().length} cards · every card teaches`));
});
```

(Move the import to the top of the file with the others.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/views.test.mjs tests/landing.test.mjs`
Expected: FAIL. `poolEyebrow` is not exported and there is no set filter.

- [ ] **Step 3: Implement the card footer**

`public/card-view.mjs`: import `SETS` alongside the existing cards import. In the footer, replace `${d.faction.toUpperCase()} / FB1` with `${d.faction.toUpperCase()} / ${SETS[d.set].code}`.

- [ ] **Step 4: Implement the library**

Replace `public/library.mjs`:

```js
// public/library.mjs
// Card library view. Pure strings, so it can be tested without a browser.
import {SETS, releasedCards, releasedPools} from './cards.mjs';
import {esc} from './html.mjs';
import {card} from './card-view.mjs';

const releasedSets = () => Object.keys(SETS).filter(id => SETS[id].released);
export function library(s) {
  const {filter} = s;
  const sets = releasedSets(),
    decks = releasedPools().length * 2;
  const setFilter =
    sets.length > 1
      ? `<select id="setFilter" aria-label="Filter by set"><option value="all">All sets</option>${sets.map(id => `<option value="${id}" ${filter.set === id ? 'selected' : ''}>${esc(SETS[id].name)}</option>`).join('')}</select>`
      : '';
  const eyebrow = sets.length > 1 ? 'ALL SETS' : `${SETS[sets[0]].name.toUpperCase()} / COMPLETE SET`;
  return `<div class="library"><div class="library-head"><div><div class="eyebrow">${eyebrow}</div><h1>Card library.</h1></div><span class="pill">${releasedCards().length} cards · ${decks} ${decks === 2 ? 'starter decks' : 'decks'}</span></div><p class="muted">Explore the rules, learn the security concept, and plan your next play.</p><div class="filters"><input id="search" type="search" placeholder="Search names, rules, or security concepts…" aria-label="Search cards" value="${esc(filter.q)}"><select id="factionFilter" aria-label="Filter by faction"><option value="all">Both factions</option><option value="blue" ${filter.faction === 'blue' ? 'selected' : ''}>Blue team</option><option value="red" ${filter.faction === 'red' ? 'selected' : ''}>Red team</option></select><select id="typeFilter" aria-label="Filter by card type"><option value="all">All card types</option>${['Infrastructure', 'Unit', 'Response', 'Operation', 'Tool', 'Control'].map(t => `<option ${filter.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>${setFilter}</div><div id="libraryGrid" class="grid"></div><p class="footer-note">Each starter contains 24 infrastructure, two copies of each of its 12 units, and one copy of each of its 12 other cards.</p></div>`;
}
export const matches = (c, {q, faction, type, set = 'all'}) =>
  (faction === 'all' || c.faction === faction) &&
  (type === 'all' || c.type === type) &&
  (set === 'all' || c.set === set) &&
  `${c.name} ${c.text} ${c.lesson ?? ''}`.toLowerCase().includes(q.toLowerCase());
export function libraryGrid(s) {
  const cs = releasedCards().filter(c => matches(c, s.filter));
  return cs.length
    ? cs.map(c => card(s, c.id)).join('')
    : '<p class="muted">No matching cards. Try another search or filter.</p>';
}
```

The option markup must produce `<option value="extra" >Extra</option>` for the test: an empty `selected` slot leaves a single space before `>`. If Prettier or your template differs, adjust the test's regex to the actual markup rather than the other way round. What matters is that the option exists.

The footer deck description stays First Breach-specific until Plan 6 writes the expansion deck text.

- [ ] **Step 5: Implement the eyebrow and the hero count**

`public/arena-view.mjs`: import `POOLS` from `./cards.mjs` (extend the existing import) and add:

```js
export const poolEyebrow = game => (POOLS[game.pool]?.name ?? POOLS['first-breach'].name).toUpperCase();
```

In `battlefield(s)`'s markup, replace `FIRST BREACH / ${versus ? 'VERSUS' : 'TRAINING'} MATCH` with `${poolEyebrow(game)} / ${versus ? 'VERSUS' : 'TRAINING'} MATCH`.

`public/landing.mjs`: import `releasedCards` from `./cards.mjs` and replace the hard-coded `50 cards · every card teaches` with `${releasedCards().length} cards · every card teaches`.

- [ ] **Step 6: Wire the set filter in the app**

`public/app.mjs`: change the filter state to `let filter = {q: '', faction: 'all', type: 'all', set: 'all'};` and add to `FIELDS`:

```js
  setFilter: e => {
    filter.set = e.target.value;
    libraryCards();
  },
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Check it in the browser**

Start the dev server with the `preview_start` tool (add a `.claude/launch.json` entry running `npm start` if there isn't one; `serve.cjs` prints its port). Open the library and a training match. Confirm: card footers read `RED / FB1`, the pill reads "50 cards · 2 starter decks", there is no set filter, and the match eyebrow reads "FIRST BREACH / TRAINING MATCH".

- [ ] **Step 9: Commit**

```bash
npm run format
git add public/card-view.mjs public/library.mjs public/arena-view.mjs public/landing.mjs public/app.mjs tests/views.test.mjs tests/landing.test.mjs
git commit -m "Show set codes and derive card counts from the catalog"
```

---

### Task 6: The expansion opt-in on the start screen

**Files:**
- Modify: `public/landing.mjs:39-49`
- Modify: `public/app.mjs` (state near `:44-47`, `start()` near `:290-300`, `hostMatch()` near `:614`, `render` call near `:368`, `FIELDS`)
- Modify: `public/landing.css` (an opt-in style that reuses `.tutorial-opt-in`)
- Test: `tests/landing.test.mjs`

**Interfaces:**
- Consumes: `DEFAULT_POOL`, `POOLS`, `releasedPools`, `playablePool` (Task 1); the `Game` `pool` option (Task 2); `HostSession.create({pool})` (Task 4).
- Produces:
  - `landing({mode, guide, pool = DEFAULT_POOL, pools = releasedPools()})` renders `#includeExpansion` when `pools` contains a non-default pool with an `optIn` label.
  - The preference lives in the store key `pref:pool`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/landing.test.mjs`, adding `POOLS` to the cards import:

```js
test('no expansion opt-in while First Breach is the only released pool', () => {
  assert.doesNotMatch(landing({mode: 'solo'}), /includeExpansion/);
  assert.doesNotMatch(landing({mode: 'friend'}), /includeExpansion/);
});

test('a released expansion adds an opt-in in both modes, disabled while the guided game is chosen', t => {
  POOLS.mirror = {name: 'First Breach + Mirror', optIn: 'Mirror', sets: ['first-breach'], deck: POOLS['first-breach'].deck};
  t.after(() => delete POOLS.mirror);
  const pools = ['first-breach', 'mirror'];
  const off = landing({mode: 'solo', pools});
  assert.match(off, /<input id="includeExpansion" type="checkbox" value="mirror"\s+aria-describedby="expansionOffer">/);
  assert.match(off, /<strong>Include Mirror<\/strong>/);
  assert.match(off, /Both players use decks that mix First Breach with Mirror\./);
  assert.match(landing({mode: 'solo', pools, pool: 'mirror'}), /id="includeExpansion" type="checkbox" value="mirror" checked/);
  const guided = landing({mode: 'solo', pools, pool: 'mirror', guide: true});
  assert.match(guided, /id="includeExpansion" type="checkbox" value="mirror" checked disabled/);
  assert.match(guided, /Guided games use First Breach cards only\./);
  assert.match(landing({mode: 'friend', pools}), /id="includeExpansion"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/landing.test.mjs`
Expected: the second test FAILS with no `includeExpansion` in the markup. The first passes already, which is expected.

- [ ] **Step 3: Implement the checkbox markup**

`public/landing.mjs`: import `{DEFAULT_POOL, POOLS, releasedCards, releasedPools}` from `./cards.mjs`, and change the signature to `export function landing({mode = 'solo', guide = false, pool = DEFAULT_POOL, pools = releasedPools()} = {})`. Before `const extra`, add:

```js
  // The one released expansion pool, if any: offered as an opt-in; guided games always use First Breach.
  const expansion = pools.find(id => id !== DEFAULT_POOL && POOLS[id]?.optIn);
  const optIn = expansion
    ? `<label class="tutorial-opt-in expansion-opt-in"><input id="includeExpansion" type="checkbox" value="${expansion}" ${pool === expansion ? 'checked' : ''} ${guide && !friend ? 'disabled' : ''} aria-describedby="expansionOffer"><span><strong>Include ${POOLS[expansion].optIn}</strong><small id="expansionOffer">${guide && !friend ? 'Guided games use First Breach cards only.' : `Both players use decks that mix First Breach with ${POOLS[expansion].optIn}.`}</small></span></label>`
    : '';
```

Then append `${optIn}` right after `${extra}` in the "Choose your side" step head.

Check the whitespace in the test regexes against the real output: an unchecked, enabled box renders `value="mirror"  aria-describedby` (two spaces), which `\s+` accepts. A checked, disabled box renders `checked disabled`.

- [ ] **Step 4: Style it**

`public/landing.css`: find the `.tutorial-opt-in` rule. The new label reuses that class, so it inherits the layout. Add only spacing so the two labels stack cleanly:

```css
.expansion-opt-in {
  margin-top: 0.5rem;
}
.expansion-opt-in input:disabled + span {
  opacity: 0.6;
}
```

- [ ] **Step 5: Wire the preference in the app**

`public/app.mjs`: extend the cards import with `DEFAULT_POOL` and `playablePool`. Near `guideChoice`, add:

```js
let poolChoice = playablePool(store.get('pref:pool'));
```

`store` is created at the top of the file (`const store = createStore();`), so declare `poolChoice` after it. In `render`'s landing call, pass `pool: poolChoice`: `landing({mode: startMode, guide: guideChoice, pool: poolChoice})`.

In `start(f, optIn = false)`, replace `game = new Game(f);` with:

```js
  const pool = playablePool(poolChoice, {guided: optIn});
  store.set('pref:pool', poolChoice); // Rewritten on each start, so the weekly storage prune keeps it.
  game = new Game(f, undefined, {pool});
```

In `hostMatch(f)`, pass the pool: `HostSession.create({net, store, hostFaction: f, pool: playablePool(poolChoice)})`.

In `FIELDS`, add the checkbox handler, and update the existing `guideFirstGame` handler so it disables the opt-in in place (re-rendering would lose focus):

```js
  includeExpansion: e => {
    poolChoice = e.target.checked ? e.target.value : DEFAULT_POOL;
    store.set('pref:pool', poolChoice);
  },
  guideFirstGame: e => {
    guideChoice = e.target.checked;
    const box = $('#includeExpansion');
    if (!box) return;
    box.disabled = guideChoice;
    $('#expansionOffer').textContent = guideChoice
      ? 'Guided games use First Breach cards only.'
      : `Both players use decks that mix First Breach with ${POOLS[box.value].optIn}.`;
  },
```

Import `POOLS` too. `$` is the app's existing query helper.

- [ ] **Step 6: Run the whole suite and the static checks**

Run: `npm test && npm run typecheck && npm run format:check`
Expected: all PASS.

- [ ] **Step 7: Check it in the browser**

With the dev server running, open the start screen in both modes and confirm there is no expansion checkbox. Then add this line at the end of `public/cards.mjs`, temporarily and without committing it:

```js
POOLS.preview = {name: 'First Breach + Preview', optIn: 'Preview', sets: ['first-breach'], deck: starter};
```

Reload and confirm:
- the checkbox appears in both modes;
- checking "Guide my first game" disables it and changes its note;
- with the box checked and guidance off, starting a training match shows "FIRST BREACH + PREVIEW / TRAINING MATCH";
- after a reload, the box is still checked.

Take a screenshot as proof, then **remove the temporary line** and confirm `git diff public/cards.mjs` is empty.

- [ ] **Step 8: Commit**

```bash
npm run format
git add public/landing.mjs public/landing.css public/app.mjs tests/landing.test.mjs
git commit -m "Offer released expansions as an opt-in on the start screen"
```

---

## Finishing

- [ ] Run `npm test && npm run typecheck && npm run format:check` on the branch tip.
- [ ] Run a full solo match and a two-tab play-a-friend match to completion in the browser, and confirm the play-a-friend recap says **Verified — fair match**.
- [ ] Use superpowers:finishing-a-development-branch to open the PR.
