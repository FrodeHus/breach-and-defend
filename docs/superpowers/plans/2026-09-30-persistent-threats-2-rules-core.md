# Persistent Threats, Plan 2: Rules Engine Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the engine every mechanic the expansion's cards need: tokens, retiring, the archive, conditional and granted keywords, lockdown, targeted multi-step effects, Overclock and modes, extra costs, activated and triggered abilities, choices that pause resolution (Probe, discard, soft counters, optional costs, trigger order and targets), and Reuse. First Breach must play exactly as before.

**Architecture:**
- Expansion cards describe their behaviour as plain data: target specs, cost specs and lists of effect steps. A new module, `public/rules.mjs`, reads that data. It finds candidate targets, re-checks them on resolution, runs steps through an `OPS` table, and applies choices through a `CHOICES` table.
- The `Game` class (`public/engine.mjs`) gains the state and entry points: a player `archive`, `pending` (the one open choice), an event `queue`, `waiting` triggers, per-turn `casts`, `activate()` and `choose()`.
- A resolving effect is a *frame*: `{entry, i, targets, ...}`. It is plain JSON, so it can pause on a choice, be saved, and resume.
- First Breach cards keep their existing `effect`/`target` code path untouched. A golden hash of 20 complete seeded First Breach matches, taken before any change, must hold after every task.

**Tech Stack:** Plain ES modules, no dependencies, `node --test` (Node ≥ 22), Prettier 3.9.9.

**Spec:** `docs/design/persistent-threats.md`, specifically "Mechanics and rules vocabulary" (Probe, Overclock, Reuse, tokens, supporting rules) and "Engine work required before release" items 2–7.

## Roadmap position

This is plan 2 of 6 (see Plan 1's roadmap). One change from that roadmap: `actionOptions()` (the list of legal actions for the interface) moves to Plan 5, where the interface that consumes it is built. The computer opponent in Plan 3 uses `rules.mjs`'s `candidates()` directly.

This plan adds **no real expansion cards**. Tests register small test-only card definitions. The two tokens are real, in the unreleased Persistent Threats set, and no deck contains them. Nothing changes for players.

## Global Constraints

- "Existing tests, saved matches and audits must not change." Every task keeps the First Breach golden test (Task 1) passing unchanged.
- First Breach saves keep their format. New state is left out of `toJSON()` while at its default: empty `archive`, `pending: null`, empty `queue` and `waiting`. `casts` is left out for the First Breach pool, because only expansion cards read it. Card objects gain the `kw`, `locked` and `used` fields only while they are set.
- Rules wording (spec):
  - "Tokens … never become reusable cards in hand or discard."
  - "Sacrifice [retire] paid as a cost happens before anyone responds; the cost is not refunded if the effect fails."
  - "With multiple targets, resolve against remaining legal targets; if every target is illegal, none of the spell's effects happen. … a spell deliberately cast with zero targets still resolves."
  - "The active player orders their simultaneous triggers first, then the other player places theirs above them."
  - "A trigger already on the stack survives removal of its source."
  - "'Only once each turn' applies per battlefield object, resets at every turn boundary, and counts the first qualifying event even if its trigger is countered."
  - "Doesn't untap during its controller's next untap step … Multiple such effects … all expire at that same step."
  - Reuse: "When a Reuse-cast card leaves the stack for any reason, put it into the archive."
  - "A countered card refunds neither payment."
  - Probe: "Probing an empty deck does not itself cause a loss."
  - "Activate only during your main phase while the stack is empty." "When activating an Infrastructure ability with a compute cost AND a tap cost, pay the compute with other ready Infrastructure."
  - "A token sacrificed [retired] to pay a cost cannot also be targeted."
- No new dependencies. Pure functions stay testable without a browser. Format only the files you change: `npx --yes prettier@3.9.9 --write <files>`. Other sessions may edit this checkout, so never run `npm run format`, and never stage files you didn't change.
- Commit messages: an imperative sentence in sentence case, with no prefix.

## Review Focus

1. **A choice is pending when the match is saved and restored.** Choosing on the restored game must give the same result. Tested in Task 7.
2. **A trigger's source leaves the battlefield before the trigger resolves.** The trigger still resolves, and steps aimed at `self` skip quietly. Tested in Task 6.
3. **A player concedes, or the match ends, while a choice is pending.** Concede clears the choice and nobody is left waiting. Tested in Task 7.
4. **A draw inside an effect empties the deck.** The match ends, and the effect's remaining steps don't run. Tested in Task 7.
5. **Malformed choices:** the wrong player, wrong shapes, duplicate or unknown uids, or non-arrays. These throw and leave the game exactly as it was. Tested in Task 7.

---

## File map

| File | Responsibility |
|---|---|
| `public/rules.mjs` (new) | `isRule`, `candidates`, `checkTargets`, `recheck`, `spellRule`, `ruleOf`, `abilityOf`, `retireOptions`, `archiveOptions`, `autoTargets`, `ON` (trigger matchers), `OPS` (effect steps), `CHOICES` (choice handlers) |
| `public/cards.mjs` | `SETS['persistent-threats']` (unreleased); `TOKENS` Backdoor and Indicator, added to `BY_ID` only |
| `public/engine.mjs` | Expansion state and serialization; tokens, `retire`, `archiveCard`, `bounce`, `counter`, `leaveStack`; `keywords`/`has`; lockdown; rule-card casting with options; `activate`; `emit`/`settle`/`place`; `choose`/`defaultChoice`; Reuse; `canAct` |
| `public/app.mjs` | Auto-pass uses `game.canAct(0)` |
| `tests/helpers/simulate.mjs` (new) | `playOut(seed)`, the seeded two-policy match driver |
| `tests/helpers/rules.mjs` (new) | `define`, `table`, `put`, `compute`, `resolveTop` for rules tests |
| `tests/first-breach-golden.test.mjs` (new) | The golden hash |
| `tests/rules-*.test.mjs` (new) | One file per task from Task 2 on |

### Card data schema (what `rules.mjs` reads)

```js
{
  // Existing fields: id, set, faction, name, cost, type, text, keywords, power, toughness, subtype…
  token: true,                                         // created during play, never in a deck
  entersTapped: true,                                  // Infrastructure
  when: [{keyword: 'rapid', if: {control: 'pt-backdoor'}}],   // conditional keywords
  // Operations and Responses written as rules (First Breach ones keep `effect`/`target`):
  targets: [TargetSpec], steps: [Step],
  modes: [{label, targets?, steps}],                   // instead of targets/steps: "choose one"
  overclock: {cost, steps, targets?, instead?: true},  // extra payment; `instead` replaces targets and steps
  extraCost: {retire: RetireSpec},                     // e.g. "As an additional cost, retire a Tool."
  reuse: 3,                                            // cast from discard for this much, then archive
  abilities: [
    {id, kind: 'activated', label, cost: {compute?, tap?, retire?: 'self' | RetireSpec, archive?: {types}},
     targets?, steps},
    {id, kind: 'triggered', label, on: 'enter' | 'defeated' | 'block' | 'hitsOpponent' | 'yourUnitsHit' |
     'youRetire' | 'youCastFromGrave' | 'opponentSecondCast' | 'yourEndStep', what?: RetireSpec, once?: true,
     targets?, steps},
  ],
}
// TargetSpec: {key, zone: 'field' | 'grave' | 'stack', side: 'you' | 'opponent' | 'any', types?: [type],
//              maxCost?, optional?: true, upTo?: n, onePlayer?: true}
// RetireSpec: {types?: [type], id?: cardId, other?: true}
// Step: {op, ...}. `to` names a target key, or 'self' for the entry's own source card.
```

Tests register definitions like these under ids starting with `x-`.

---

### Task 1: Pin First Breach behaviour with a golden hash

**Files:**
- Create: `tests/helpers/simulate.mjs`, `tests/first-breach-golden.test.mjs`
- Modify: `tests/engine.test.mjs:243-300` (the 100-match test uses the helper)

**Interfaces:**
- Produces: `playOut(seed): Game`, which plays one complete seeded match: player 1 uses `aiAction()`, player 0 uses a simple scripted policy.

This is a characterization test of existing behaviour. It passes on the first run by design; its job is to fail if any later task changes how First Breach plays. The hash was computed on `main` at `58cc7c6`.

- [ ] **Step 1: Create the driver**

`tests/helpers/simulate.mjs`:

```js
import {Game} from '../../public/engine.mjs';
import {BY_ID} from '../../public/cards.mjs';

// One complete seeded match: player 1 is the computer, player 0 casts the first legal card, attacks with
// everything and blocks with the first unit that can. Deterministic for a seed.
export function playOut(seed) {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const g = new Game(seed % 2 ? 'blue' : 'red', rng);
  g.keep();
  for (let steps = 0; steps < 10000 && g.winner === null; steps++) {
    if (g.actor() === 1) {
      g.aiAction();
      continue;
    }
    if (g.phase === 'attack') {
      g.attackers(
        0,
        g.players[0].field.filter(c => g.canAttack(0, c)).map(c => c.uid),
      );
      continue;
    }
    if (g.phase === 'block') {
      const assignments = {},
        bs = g.players[0].field.filter(c => BY_ID[c.id].type === 'Unit' && !c.tapped);
      for (const uid of g.attacks) {
        const a = g.find(uid);
        if (!a || a.zone !== 'field') continue;
        const i = bs.findIndex(b => g.canBlock(b, a.card));
        if (i >= 0) assignments[uid] = [bs.splice(i, 1)[0].uid];
      }
      g.blockers(0, assignments);
      continue;
    }
    if (g.phase === 'cleanup') {
      g.discard(g.players[0].hand.slice(0, g.players[0].hand.length - 7).map(c => c.uid));
      continue;
    }
    const cs = g.players[0].hand.filter(c => g.legal(0, c));
    let played = false;
    for (const c of cs) {
      const d = BY_ID[c.id];
      let ts = g.targets(0, c);
      if (d.target === 'unit' || d.target === 'support')
        ts = ts.filter(t => g.find(t.uid).p === (d.effect === 'buff' && d.powerBoost > 0 ? 0 : 1));
      if (d.target === 'spell') ts = ts.filter(t => g.stack.find(s => s.card?.uid === t.uid)?.p === 1);
      if (d.target && !ts.length) continue;
      g.play(0, c.uid, ts[0] || null);
      played = true;
      break;
    }
    if (!played) g.pass(0);
  }
  return g;
}
```

- [ ] **Step 2: Write the golden test**

`tests/first-breach-golden.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {playOut} from './helpers/simulate.mjs';

// The final saved state of 20 complete First Breach matches, hashed before the expansion rules existed.
// Any change here means First Breach plays or saves differently: find out why before touching the hash.
test('First Breach plays and saves exactly as before the expansion rules', () => {
  const h = createHash('sha256');
  for (let seed = 1; seed <= 20; seed++) h.update(JSON.stringify(playOut(seed).toJSON()));
  assert.equal(h.digest('hex'), '12396511784b14bcbfac506d2bf300c894c20f89b0a9877cfb1d359769cef8ba');
});
```

- [ ] **Step 3: Use the driver in the 100-match test**

In `tests/engine.test.mjs`, the test `'100 seeded complete matches preserve card counts and finish without deadlock'` builds its own `rng`, `Game` and loop. Replace everything from `let s = seed;` through the end of the `for (let steps …)` loop with:

```js
    const g = playOut(seed);
```

Add `import {playOut} from './helpers/simulate.mjs';` to the imports. Keep the assertions that follow the loop (`winner`, conservation, `wins`, `maxTurns`) unchanged.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS, including the new golden test.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write tests/helpers/simulate.mjs tests/first-breach-golden.test.mjs tests/engine.test.mjs
git add tests/helpers/simulate.mjs tests/first-breach-golden.test.mjs tests/engine.test.mjs
git commit -m "Pin how First Breach plays with a golden hash of seeded matches"
```

---

### Task 2: Tokens, retiring, the archive, and expansion state

**Files:**
- Modify: `public/cards.mjs` (`SETS`; `TOKENS` after `BY_ID`)
- Modify: `public/engine.mjs` (constructor; `remove`; new `bounce`, `createToken`, `retire`, `archiveCard`; legacy `bounce` case in `resolve`; `toJSON`/`fromJSON`)
- Create: `tests/helpers/rules.mjs`, `tests/rules-zones.test.mjs`

**Interfaces:**
- Produces:
  - `TOKENS.backdoor` (`pt-backdoor`) and `TOKENS.indicator` (`pt-indicator`), both in `BY_ID`.
  - `SETS['persistent-threats'] = {name: 'Persistent Threats', code: 'PT1', released: false}`.
  - `g.players[p].archive: card[]`, `g.pending`, `g.queue`, `g.waiting`, `g.casts`.
  - `g.createToken(p, id): card`, `g.retire(p, card)`, `g.archiveCard(p, card)`, `g.bounce(p, card)`, and `g.remove(p, card)`, which now makes tokens vanish.
  - `TRANSIENT = ['kw', 'locked', 'used']`, the card fields that never survive a zone change.
  - Test helpers `define(t, ...defs)`, `table()`, `put(g, p, id, zone)`, `compute(g, p, n)`, `resolveTop(g)`.

- [ ] **Step 1: Create the test helpers**

`tests/helpers/rules.mjs`:

```js
import {BY_ID} from '../../public/cards.mjs';
import {Game} from '../../public/engine.mjs';

// Registers test-only card definitions (ids starting with x-) for one test.
export function define(t, ...defs) {
  for (const d of defs) BY_ID[d.id] = {set: 'test', faction: 'red', cost: 0, text: '', name: d.id, ...d};
  t.after(() => defs.forEach(d => delete BY_ID[d.id]));
}

// Player 0 (red) in its first main phase with priority, empty hands and battlefields, and ten-card decks.
export function table() {
  const g = new Game('red');
  g.players.forEach((q, i) =>
    Object.assign(q, {
      hand: [],
      field: [],
      grave: [],
      deck: Array.from({length: 10}, () => g.card(i ? 'b1' : 'r1')),
      life: 20,
    }),
  );
  Object.assign(g, {phase: 'main1', kept: [true, true], active: 0, priority: 0, turn: 2});
  return g;
}

export function put(g, p, id, zone = 'field') {
  const c = g.card(id);
  if (zone === 'field') c.sick = false;
  g.players[p][zone].push(c);
  return c;
}
export const compute = (g, p, n) => Array.from({length: n}, () => put(g, p, p ? 'b0' : 'r0'));
// Both players pass once, so the top of the stack resolves.
export function resolveTop(g) {
  g.pass(g.priority);
  g.pass(g.priority);
}
```

- [ ] **Step 2: Write the failing tests**

`tests/rules-zones.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {BY_ID, CARDS, SETS, TOKENS} from '../public/cards.mjs';
import {Game} from '../public/engine.mjs';
import {put, table} from './helpers/rules.mjs';

test('the two tokens are Tools of the unreleased Persistent Threats set, and never deck cards', () => {
  assert.deepEqual(SETS['persistent-threats'], {name: 'Persistent Threats', code: 'PT1', released: false});
  for (const t of Object.values(TOKENS)) {
    assert.equal(BY_ID[t.id], t);
    assert.equal(t.type, 'Tool');
    assert.equal(t.cost, 0);
    assert.equal(t.token, true);
    assert.equal(t.set, 'persistent-threats');
    assert.ok(!CARDS.includes(t));
  }
  assert.deepEqual(
    Object.values(TOKENS).map(t => t.id),
    ['pt-backdoor', 'pt-indicator'],
  );
});

test('a created token is a battlefield object that vanishes when it leaves', () => {
  const g = table();
  const a = g.createToken(0, 'pt-backdoor'),
    b = g.createToken(0, 'pt-backdoor'),
    c = g.createToken(1, 'pt-indicator');
  assert.notEqual(a.uid, b.uid);
  assert.deepEqual(
    g.players[0].field.map(x => x.id),
    ['pt-backdoor', 'pt-backdoor'],
  );
  g.remove(0, a);
  g.bounce(0, b);
  g.retire(1, c);
  for (const q of g.players) {
    assert.equal(q.field.length, 0);
    assert.equal(q.hand.length, 0);
    assert.equal(q.grave.length, 0);
  }
});

test('retiring moves a card to its owner’s discard; archiving takes it out of the discard for good', () => {
  const g = table();
  const u = put(g, 0, 'r7');
  g.retire(0, u);
  assert.deepEqual(
    g.players[0].grave.map(x => x.uid),
    [u.uid],
  );
  g.archiveCard(0, u);
  assert.equal(g.players[0].grave.length, 0);
  assert.deepEqual(
    g.players[0].archive.map(x => x.uid),
    [u.uid],
  );
});

test('returning to hand makes a new object and clears everything that happened on the battlefield', () => {
  const g = table();
  const u = put(g, 0, 'r7'),
    old = u.uid;
  Object.assign(u, {tapped: true, damage: 2, bp: 1, kw: ['overflow'], locked: true, used: ['x']});
  g.bounce(0, u);
  const back = g.players[0].hand[0];
  assert.notEqual(back.uid, old);
  assert.deepEqual(back, {id: 'r7', uid: back.uid, tapped: false, sick: true, damage: 0, bp: 0, bt: 0});
});

test('expansion state is saved only when it is not empty', () => {
  const g = table();
  const json = g.toJSON();
  for (const k of ['pending', 'queue', 'waiting', 'casts']) assert.equal(Object.hasOwn(json, k), false, k);
  assert.equal(Object.hasOwn(json.players[0], 'archive'), false);
  const back = Game.fromJSON(json);
  assert.deepEqual(back.players[0].archive, []);
  assert.deepEqual(
    [back.pending, back.queue, back.waiting, back.casts],
    [null, [], [], [0, 0]],
  );
  const u = put(g, 0, 'r7', 'grave');
  g.archiveCard(0, u);
  assert.deepEqual(
    Game.fromJSON(g.toJSON()).players[0].archive.map(x => x.uid),
    [u.uid],
  );
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/rules-zones.test.mjs`
Expected: FAIL. `TOKENS` is not exported.

- [ ] **Step 4: Add the set and the tokens**

`public/cards.mjs`: add to `SETS`:

```js
  'persistent-threats': {name: 'Persistent Threats', code: 'PT1', released: false},
```

After `export const BY_ID = …`, add:

```js
// Tokens are created during play: they are looked up by id like cards, but are never in CARDS or a deck.
export const TOKENS = {
  backdoor: {
    id: 'pt-backdoor',
    set: 'persistent-threats',
    faction: 'red',
    name: 'Backdoor',
    cost: 0,
    type: 'Tool',
    token: true,
    text: '1 compute, retire this Tool: Target unit you control gets +2/+0 until end of turn. Activate only during your main phase while the stack is empty.',
    abilities: [
      {
        id: 'boost',
        kind: 'activated',
        label: 'Boost a unit',
        cost: {compute: 1, retire: 'self'},
        targets: [{key: 't', zone: 'field', side: 'you', types: ['Unit']}],
        steps: [{op: 'buff', to: 't', power: 2}],
      },
    ],
    art: 'cards/backdoor',
  },
  indicator: {
    id: 'pt-indicator',
    set: 'persistent-threats',
    faction: 'blue',
    name: 'Indicator',
    cost: 0,
    type: 'Tool',
    token: true,
    text: '2 compute, retire this Tool: Draw a card. Activate only during your main phase while the stack is empty.',
    abilities: [
      {id: 'analyze', kind: 'activated', label: 'Analyze', cost: {compute: 2, retire: 'self'}, steps: [{op: 'draw', n: 1}]},
    ],
    art: 'cards/indicator',
  },
};
for (const t of Object.values(TOKENS)) BY_ID[t.id] = t;
```

- [ ] **Step 5: Add the engine state and zone helpers**

`public/engine.mjs`: after the imports, add:

```js
// Card fields that only exist while an effect has set them. Nothing survives a zone change.
const TRANSIENT = ['kw', 'locked', 'used'];
```

In the constructor's player object, add `archive: [],` after `grave: [],`. After `this.blocks = {};`, add:

```js
    this.pending = null; // The one open choice: {id, actor, kind, private, prompt, min, max, options, data?, frame?}
    this.queue = []; // Events of the current action, turned into triggers by settle()
    this.waiting = []; // Triggers not yet on the stack
    this.casts = [0, 0]; // Cards each player has cast this turn
```

Replace `remove`:

```js
  remove(p, c) {
    this.players[p].field = this.players[p].field.filter(x => x.uid !== c.uid);
    const d = this.data(c);
    // Tokens stop existing when they leave the battlefield; they never reach a discard.
    if (d.token) this.note(`${d.name} is removed.`);
    else {
      this.players[p].grave.push(c);
      this.note(`${d.name} goes to discard.`);
    }
  }
  // Returning to hand makes a new object: nothing that happened on the battlefield follows the card.
  bounce(p, c) {
    this.players[p].field = this.players[p].field.filter(x => x.uid !== c.uid);
    if (this.data(c).token) return this.note(`${this.data(c).name} is removed.`);
    for (const k of TRANSIENT) delete c[k];
    Object.assign(c, {uid: ++this.uid, tapped: false, sick: true, damage: 0, bp: 0, bt: 0});
    this.players[p].hand.push(c);
  }
  createToken(p, id) {
    const c = this.card(id);
    this.players[p].field.push(c);
    this.note(`${this.label(p)} ${this.verb(p, 'create', 'creates')} a ${this.data(c).name}.`);
    return c;
  }
  // Retiring is not destruction: a permanent its controller gives up, as a cost or by choice.
  retire(p, c) {
    this.remove(p, c);
  }
  // The archive is public and final: nothing brings a card back from it.
  archiveCard(p, c) {
    this.players[p].grave = this.players[p].grave.filter(x => x.uid !== c.uid);
    this.players[p].archive.push(c);
    this.note(`${this.data(c).name} is archived.`);
  }
```

In `resolve`, replace the legacy `bounce` case body with a call to the helper:

```js
        case 'bounce':
          this.bounce(f.p, f.card);
          break;
```

(The old body set the same fields in the same order, so First Breach state is unchanged.)

- [ ] **Step 6: Save only non-empty expansion state**

Replace `toJSON`/`fromJSON`:

```js
  toJSON() {
    const {random, ...state} = this;
    // First Breach matches keep the pre-expansion format, so their saves, views and audit digests don't change.
    // Only expansion cards read cast counts, and the rest of the expansion state is saved only when not empty.
    if (state.pool === DEFAULT_POOL) {
      delete state.pool;
      delete state.casts;
    }
    if (state.pending === null) delete state.pending;
    if (!state.queue.length) delete state.queue;
    if (!state.waiting.length) delete state.waiting;
    state.players = state.players.map(({archive, ...q}) => (archive.length ? {...q, archive} : q));
    return structuredClone({...state, rng: random.state ?? null});
  }
  static fromJSON(json) {
    const {rng, ...state} = structuredClone(json);
    const g = Object.assign(Object.create(Game.prototype), state);
    g.pool ??= DEFAULT_POOL;
    g.pending ??= null;
    g.queue ??= [];
    g.waiting ??= [];
    g.casts ??= [0, 0];
    for (const q of g.players) q.archive ??= [];
    g.random = rng ? seededRandom(rng) : Math.random;
    return g;
  }
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test and the five new tests.

- [ ] **Step 8: Commit**

```bash
npx --yes prettier@3.9.9 --write public/cards.mjs public/engine.mjs tests/helpers/rules.mjs tests/rules-zones.test.mjs
git add public/cards.mjs public/engine.mjs tests/helpers/rules.mjs tests/rules-zones.test.mjs
git commit -m "Add tokens, retiring and the archive to the engine"
```

---

### Task 3: Conditional and granted keywords, and lockdown

**Files:**
- Modify: `public/engine.mjs` (new `keywords`, `has`, `holds`; `canAttack`, `attackers`, `canBlock`, `combat`, `aiAction` keyword checks; `endTurn`)
- Create: `tests/rules-keywords.test.mjs`

**Interfaces:**
- Consumes: `table`, `put`, `define` (Task 2).
- Produces:
  - `g.keywords(card): Set<string>` and `g.has(card, keyword): boolean`.
  - Card field `kw: string[]` (granted until end of turn), cleared at end of turn along with `used`.
  - Card field `locked: true` (skips its controller's next untap step).

- [ ] **Step 1: Write the failing tests**

`tests/rules-keywords.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {define, put, table} from './helpers/rules.mjs';

const loader = {
  id: 'x-loader',
  type: 'Unit',
  power: 2,
  toughness: 1,
  when: [{keyword: 'rapid', if: {control: 'pt-backdoor'}}],
};

test('a conditional keyword holds only while its condition does', t => {
  define(t, loader);
  const g = table();
  const u = put(g, 0, 'x-loader');
  u.sick = true;
  assert.equal(g.has(u, 'rapid'), false);
  assert.equal(g.canAttack(0, u), false);
  const b = g.createToken(0, 'pt-backdoor');
  assert.equal(g.has(u, 'rapid'), true);
  assert.equal(g.canAttack(0, u), true);
  g.remove(0, b);
  assert.equal(g.canAttack(0, u), false);
});

test('granted keywords last until end of turn and work in combat', () => {
  const g = table();
  const a = put(g, 0, 'r7'); // Lateral Mover 3/3
  const b = put(g, 1, 'b1'); // SOC Trainee 1/2
  a.kw = ['overflow'];
  g.phase = 'attack';
  g.attackers(0, [a.uid]);
  g.phase = 'block';
  g.priority = 1;
  g.blockers(1, {[a.uid]: [b.uid]});
  g.combat();
  assert.equal(g.players[1].life, 19, 'one damage tramples over the 2-toughness blocker');
  g.endTurn();
  assert.equal(Object.hasOwn(a, 'kw'), false);
});

test('a locked-down unit skips exactly one untap step of its controller', () => {
  const g = table();
  const u = put(g, 0, 'r7');
  Object.assign(u, {tapped: true, locked: true});
  g.active = 1;
  g.endTurn(); // player 0's turn starts: stays tapped, lock expires
  assert.equal(u.tapped, true);
  assert.equal(Object.hasOwn(u, 'locked'), false);
  assert.equal(u.sick, false);
  g.endTurn();
  g.endTurn(); // player 0's next turn
  assert.equal(u.tapped, false);
});

test('once-per-turn marks reset at every turn boundary', () => {
  const g = table();
  const u = put(g, 0, 'r7');
  u.used = ['x'];
  g.endTurn();
  assert.equal(Object.hasOwn(u, 'used'), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/rules-keywords.test.mjs`
Expected: FAIL. `g.has` is not a function.

- [ ] **Step 3: Implement keywords**

`public/engine.mjs`, after `stats()`:

```js
  // A card's keywords right now: printed ones, those granted until end of turn, and conditional ones.
  keywords(c) {
    const d = this.data(c),
      out = new Set([...(d.keywords ?? []), ...(c.kw ?? [])]);
    const p = this.players.findIndex(q => q.field.some(x => x.uid === c.uid));
    for (const w of d.when ?? []) if (p >= 0 && this.holds(p, w.if)) out.add(w.keyword);
    return out;
  }
  has(c, keyword) {
    return this.keywords(c).has(keyword);
  }
  holds(p, cond) {
    if (cond.control) return this.players[p].field.some(x => x.id === cond.control);
    return false;
  }
```

Replace each static keyword check with `has`:
- `canAttack`: `(!c.sick || d.keywords?.includes('rapid')) && !d.keywords?.includes('firewall')` becomes `(!c.sick || this.has(c, 'rapid')) && !this.has(c, 'firewall')`.
- `attackers`: `if (!this.data(c).keywords?.includes('alwaysOn')) c.tapped = true;` becomes `if (!this.has(c, 'alwaysOn')) c.tapped = true;`.
- `canBlock`: `(!a.keywords?.includes('stealth') || b.keywords?.some(k => ['stealth', 'detection'].includes(k)))` becomes `(!this.has(attacker, 'stealth') || this.has(blocker, 'stealth') || this.has(blocker, 'detection'))`.
- `combat`: `const trample = this.data(a.card).keywords?.includes('overflow');` becomes `const trample = this.has(a.card, 'overflow');`. `if (!wasBlocked || this.data(a.card).keywords?.includes('overflow'))` becomes `if (!wasBlocked || this.has(a.card, 'overflow'))`. `if (this.data(hit.source).keywords?.includes('recharge'))` becomes `if (this.has(hit.source, 'recharge'))`.
- `aiAction` attack filter: `this.data(c).keywords?.includes('alwaysOn')` becomes `this.has(c, 'alwaysOn')`.

`canAttack` still reads `d.type`, so keep its `const d = this.data(c)`. `canBlock` no longer needs `a`; keep `b` for `b.type`.

- [ ] **Step 4: Implement end of turn and lockdown**

In `endTurn`, the loop that clears damage becomes:

```js
    for (const p of this.players)
      for (const c of p.field) {
        c.damage = 0;
        c.bp = 0;
        c.bt = 0;
        delete c.kw;
        delete c.used;
      }
```

The untap loop becomes:

```js
    for (const c of p.field) {
      // A locked-down card skips this one untap step; the lock then expires.
      if (c.locked) delete c.locked;
      else c.tapped = false;
      c.sick = false;
      if (this.data(c).effect === 'upkeepHeal') p.life += this.data(c).amount;
    }
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/engine.mjs tests/rules-keywords.test.mjs
git add public/engine.mjs tests/rules-keywords.test.mjs
git commit -m "Support conditional and granted keywords and lockdown"
```

---

### Task 4: Rule cards: targets, steps, Overclock and modes

**Files:**
- Create: `public/rules.mjs`
- Modify: `public/engine.mjs` (`playIssues`, `play`, `resolve`, new `costOf`, `ruleIssues`, `resolveRule`, `run`, `finish`, `leaveStack`, `entryName`; `targets`/`targetName`/`aiAction` guards for stack entries without a card)
- Create: `tests/rules-spells.test.mjs`

**Interfaces:**
- Consumes: `createToken`, `bounce`, `archiveCard` (Task 2).
- Produces:
  - `rules.mjs`: `isRule(d)`, `candidates(g, p, spec)`, `checkTargets(g, p, specs, chosen)` (an error string or null), `recheck(g, p, specs, chosen) → {targets, fizzled}`, `spellRule(d, {mode, overclock}) → {targets, steps}`, `ruleOf(entry)`, `abilityOf({card, id})`, `refs(g, frame, to) → [{card, p, zone}]`, and `OPS`, a table of `(g, frame, step) → boolean` (true means the step paused for a choice).
  - Engine:
    - `playIssues(p, c, options)` and `play(p, uid, target, options)`, where options are `{overclock?, mode?, targets?, costUids?, reuse?}`.
    - Rule-spell stack entries `{card, p, target: null, opts: {targets, overclock?, mode?, reuse?}}`.
    - `g.run(frame): boolean` (true when finished) and `g.leaveStack(entry)`.
    - Frames are `{entry, i, targets, p, self, source: {id}}`.

- [ ] **Step 1: Write the failing tests**

`tests/rules-spells.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const opposingUnit = {key: 't', zone: 'field', side: 'opponent', types: ['Unit']};
const zap = {
  id: 'x-zap',
  type: 'Response',
  cost: 1,
  targets: [opposingUnit],
  steps: [{op: 'damage', to: 't', amount: 2}],
  overclock: {cost: 2, instead: true, steps: [{op: 'damage', to: 't', amount: 5}]},
};
const twin = {
  id: 'x-twin',
  type: 'Operation',
  cost: 1,
  modes: [
    {label: 'Draw', steps: [{op: 'draw', n: 1}]},
    {label: 'Hit', targets: [opposingUnit], steps: [{op: 'damage', to: 't', amount: 1}]},
  ],
};
const purge = {
  id: 'x-purge',
  type: 'Operation',
  cost: 0,
  targets: [opposingUnit, {key: 'g', zone: 'grave', side: 'any', upTo: 2, onePlayer: true}],
  steps: [
    {op: 'destroy', to: 't'},
    {op: 'archive', to: 'g'},
  ],
};
const sweep = {
  id: 'x-sweep',
  type: 'Operation',
  cost: 0,
  targets: [{key: 'g', zone: 'grave', side: 'any', upTo: 2}],
  steps: [{op: 'archive', to: 'g'}, {op: 'draw', n: 1}],
};
const codes = (g, c, o) => g.playIssues(0, c, o).map(i => i.code);

test('a rule spell damages a chosen opposing unit and goes to discard', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 3);
  const mine = put(g, 0, 'r7'),
    theirs = put(g, 1, 'b7');
  const c = put(g, 0, 'x-zap', 'hand');
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: {kind: 'card', uid: mine.uid}}}), /legal target/);
  assert.throws(() => g.play(0, c.uid, null, {}), /legal target/);
  g.play(0, c.uid, null, {targets: {t: {kind: 'card', uid: theirs.uid}}});
  assert.equal(g.mana(0), 2);
  assert.deepEqual(g.stack[0].opts, {targets: {t: {kind: 'card', uid: theirs.uid}}});
  resolveTop(g);
  assert.equal(theirs.damage, 2);
  assert.deepEqual(
    g.players[0].grave.map(x => x.id),
    ['x-zap'],
  );
});

test('with no legal target a rule spell cannot be cast', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 3);
  const c = put(g, 0, 'x-zap', 'hand');
  assert.deepEqual(codes(g, c), ['target']);
});

test('Overclock costs more and replaces the effect; it must be affordable', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 2);
  const theirs = put(g, 1, 'b7'),
    c = put(g, 0, 'x-zap', 'hand');
  assert.deepEqual(codes(g, c, {overclock: true}), ['compute']);
  compute(g, 0, 1);
  g.play(0, c.uid, null, {overclock: true, targets: {t: {kind: 'card', uid: theirs.uid}}});
  assert.equal(g.mana(0), 0);
  resolveTop(g);
  assert.ok(g.players[1].grave.some(x => x.uid === theirs.uid), '5 damage defeats Segmentation Gateway (1/5)');
  assert.deepEqual(codes(g, put(g, 0, 'r13', 'hand'), {overclock: true}), ['compute', 'overclock']);
});

test('a target that leaves before resolution makes the spell do nothing', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 1);
  const theirs = put(g, 1, 'b7'),
    c = put(g, 0, 'x-zap', 'hand');
  g.play(0, c.uid, null, {targets: {t: {kind: 'card', uid: theirs.uid}}});
  g.bounce(1, theirs);
  resolveTop(g);
  assert.deepEqual(
    g.players[0].grave.map(x => x.id),
    ['x-zap'],
  );
  assert.match(g.log[0], /no legal target/);
});

test('with several targets, the ones still legal are acted on', t => {
  define(t, purge);
  const g = table();
  const theirs = put(g, 1, 'b7'),
    dead = put(g, 1, 'b8', 'grave'),
    c = put(g, 0, 'x-purge', 'hand');
  g.play(0, c.uid, null, {
    targets: {t: {kind: 'card', uid: theirs.uid}, g: [{kind: 'card', uid: dead.uid}]},
  });
  g.remove(1, theirs);
  resolveTop(g);
  assert.deepEqual(
    g.players[1].archive.map(x => x.uid),
    [dead.uid],
  );
});

test('up-to targets can be zero, must be distinct and, when asked, from one player', t => {
  define(t, purge, sweep);
  const g = table();
  const a = put(g, 0, 'r7', 'grave'),
    b = put(g, 1, 'b7', 'grave'),
    theirs = put(g, 1, 'b8');
  const p = put(g, 0, 'x-purge', 'hand');
  const ref = uid => ({kind: 'card', uid});
  assert.throws(
    () => g.play(0, p.uid, null, {targets: {t: ref(theirs.uid), g: [ref(a.uid), ref(b.uid)]}}),
    /single player/,
  );
  assert.throws(() => g.play(0, p.uid, null, {targets: {t: ref(theirs.uid), g: [ref(b.uid), ref(b.uid)]}}), /up to 2/);
  const s = put(g, 0, 'x-sweep', 'hand');
  g.play(0, s.uid, null, {targets: {g: []}});
  resolveTop(g);
  assert.equal(g.players[0].hand.length, 2, 'zero chosen targets still resolves: it drew a card');
});

test('a modal spell needs a mode; each mode has its own targets', t => {
  define(t, twin);
  const g = table();
  compute(g, 0, 2);
  const c = put(g, 0, 'x-twin', 'hand');
  assert.deepEqual(codes(g, c), [], 'castable: the draw mode needs no target');
  assert.deepEqual(codes(g, c, {mode: 1}), ['target']);
  assert.deepEqual(codes(g, c, {mode: 5}), ['mode']);
  assert.throws(() => g.play(0, c.uid, null, {}), /Choose one of this card’s modes/);
  g.play(0, c.uid, null, {mode: 0});
  resolveTop(g);
  assert.equal(g.players[0].hand.length, 1);
});
```

`r13` is Credential Phishing (a First Breach Operation without Overclock), `b7` is Segmentation Gateway (1/5), and `b8` is Forensic Investigator (3/4). `compute(g, 0, n)` adds n ready Relay Nodes.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/rules-spells.test.mjs`
Expected: FAIL. The rule spells don't resolve, `opts` is undefined, and the Overclock issues are missing.

- [ ] **Step 3: Create `public/rules.mjs`**

```js
// Expansion rules as data. Cards describe targets, costs and effect steps as plain objects, and these functions
// read them. A resolving effect is a frame of plain JSON, so it can pause for a choice, be saved, and resume.
import {BY_ID} from './cards.mjs';

const data = c => BY_ID[c.id];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Operations and Responses written as rules; First Breach ones use `effect`/`target` instead.
export const isRule = d => !!(d.steps || d.modes);

export function abilityOf({card, id}) {
  return BY_ID[card].abilities.find(a => a.id === id);
}

// The targets and steps a spell uses for its chosen mode and Overclock.
export function spellRule(d, {mode = null, overclock = false} = {}) {
  const base = d.modes ? d.modes[mode] : d;
  let targets = base.targets ?? [],
    steps = base.steps ?? [];
  if (overclock) {
    const o = d.overclock;
    targets = o.instead ? (o.targets ?? targets) : [...targets, ...(o.targets ?? [])];
    steps = o.instead ? o.steps : [...steps, ...o.steps];
  }
  return {targets, steps};
}
// The rules an entry on the stack follows.
export function ruleOf(entry) {
  if (entry.ability) {
    const a = abilityOf(entry.ability);
    return {targets: a.targets ?? [], steps: a.steps};
  }
  return spellRule(data(entry.card), entry.opts);
}

export function candidates(g, p, spec) {
  if (spec.zone === 'stack')
    return g.stack
      .filter(s => s.card && spec.types.includes(data(s.card).type))
      .map(s => ({kind: 'spell', uid: s.card.uid}));
  const sides = spec.side === 'you' ? [p] : spec.side === 'opponent' ? [1 - p] : [0, 1];
  const zone = spec.zone === 'grave' ? 'grave' : 'field';
  return sides.flatMap(q =>
    g.players[q][zone]
      .filter(
        c =>
          (!spec.types || spec.types.includes(data(c).type)) &&
          (spec.maxCost == null || data(c).cost <= spec.maxCost),
      )
      .map(c => ({kind: 'card', uid: c.uid})),
  );
}
const legalTarget = (g, p, spec, t) => candidates(g, p, spec).some(c => same(c, t));

// Checks targets chosen when casting or activating. Returns what is wrong, or null.
export function checkTargets(g, p, specs, chosen) {
  if (!chosen || typeof chosen !== 'object' || Array.isArray(chosen)) return 'Choose a legal target.';
  for (const k of Object.keys(chosen)) if (!specs.some(s => s.key === k)) return 'Choose a legal target.';
  for (const spec of specs) {
    const v = chosen[spec.key];
    if (spec.upTo) {
      const list = v ?? [];
      if (!Array.isArray(list) || list.length > spec.upTo || new Set(list.map(t => JSON.stringify(t))).size !== list.length)
        return `Choose up to ${spec.upTo} targets.`;
      if (!list.every(t => legalTarget(g, p, spec, t))) return 'Choose legal targets.';
      if (spec.onePlayer && new Set(list.map(t => g.find(t.uid)?.p)).size > 1)
        return 'Choose cards from a single player’s discard.';
    } else if (v == null) {
      if (!spec.optional) return 'Choose a legal target.';
    } else if (!legalTarget(g, p, spec, v)) return 'Choose a legal target.';
  }
  return null;
}

// On resolution: keeps the targets that are still legal. `fizzled` when targets were chosen and none remain.
export function recheck(g, p, specs, chosen = {}) {
  const targets = {};
  let chose = false,
    left = false;
  for (const spec of specs) {
    const v = chosen[spec.key];
    if (v == null) continue;
    const list = spec.upTo ? v : [v];
    if (list.length) chose = true;
    const ok = list.filter(t => legalTarget(g, p, spec, t));
    if (ok.length) left = true;
    if (spec.upTo) targets[spec.key] = ok;
    else if (ok.length) targets[spec.key] = ok[0];
  }
  return {targets, fizzled: chose && !left};
}

// The cards a step acts on: a target key, or 'self' for the entry's own source (wherever it is now).
export function refs(g, frame, to) {
  if (to === 'self') {
    const f = g.find(frame.self);
    return f ? [f] : [];
  }
  const v = frame.targets[to];
  const list = v == null ? [] : Array.isArray(v) ? v : [v];
  return list.map(t => g.find(t.uid)).filter(Boolean);
}
const onField = (g, frame, to) => refs(g, frame, to).filter(x => x.zone === 'field');

// Effect steps. Each returns true when it paused for a choice (see CHOICES); the frame resumes after it.
export const OPS = {
  createToken: (g, f, s) => {
    for (let i = 0; i < (s.n ?? 1); i++) g.createToken(f.p, s.token);
  },
  draw: (g, f, s) => void g.draw(f.p, s.n),
  heal: (g, f, s) => {
    g.players[f.p].life += s.n;
  },
  damage: (g, f, s) => {
    for (const x of onField(g, f, s.to)) x.card.damage += s.amount;
  },
  damageAll: (g, f, s) => {
    for (const q of g.players) for (const c of q.field) if (data(c).type === 'Unit') c.damage += s.amount;
  },
  damageOpponent: (g, f, s) => void g.hurt(1 - f.p, s.n, f.source, f.p),
  buff: (g, f, s) => {
    for (const {card} of onField(g, f, s.to)) {
      card.bp += s.power ?? 0;
      card.bt += s.toughness ?? 0;
      if (s.keywords) card.kw = [...new Set([...(card.kw ?? []), ...s.keywords])];
    }
  },
  tap: (g, f, s) => {
    for (const {card} of onField(g, f, s.to)) {
      card.tapped = true;
      if (s.lock) card.locked = true;
    }
  },
  untap: (g, f, s) => {
    for (const {card} of onField(g, f, s.to)) card.tapped = false;
  },
  destroy: (g, f, s) => {
    for (const x of onField(g, f, s.to)) g.remove(x.p, x.card);
  },
  bounce: (g, f, s) => {
    for (const x of onField(g, f, s.to)) g.bounce(x.p, x.card);
  },
  archive: (g, f, s) => {
    for (const x of refs(g, f, s.to)) if (x.zone === 'grave') g.archiveCard(x.p, x.card);
  },
};
```

- [ ] **Step 4: Cast rule spells**

In `public/engine.mjs`, import the rules: `import {OPS, candidates, checkTargets, isRule, recheck, ruleOf, spellRule} from './rules.mjs';`.

Replace `playIssues` with:

```js
  playIssues(p, c, options = {}) {
    if (this.winner !== null)
      return [{code: 'finished', message: 'This match has ended. Start a new match to play cards.'}];
    if (!c || !this.players[p].hand.some(x => x.uid === c.uid))
      return [{code: 'not-in-hand', message: 'This card is not in your hand.'}];
    const d = this.data(c),
      issues = [];
    const add = (code, message) => issues.push({code, message});
    const locked = {
      opening: 'Keep your opening hand before playing cards.',
      cleanup: 'Finish discarding to seven cards before playing cards.',
      attack: 'Confirm or skip your attackers first. Responses can be cast in the following priority window.',
      block: 'Confirm your blocks first. Responses can be cast in the following priority window.',
    };
    if (locked[this.phase]) add(this.phase, locked[this.phase]);
    else {
      if (this.priority !== p) add('priority', 'Wait for your priority: the other player acts next.');
      if (d.type !== 'Response') {
        if (p !== this.active || !['main1', 'main2'].includes(this.phase))
          add('main-phase', `${d.type} cards can only be played during your Main I or Main II phase.`);
        if (this.stack.length)
          add('stack', `Wait for pending effects on the stack to resolve before playing a ${d.type} card.`);
      }
    }
    if (d.type === 'Infrastructure') {
      if (this.players[p].landPlayed)
        add('infrastructure-limit', 'You have already played infrastructure this turn. Wait until your next turn.');
    } else {
      const ready = this.mana(p),
        cost = this.costOf(d, options);
      if (ready < cost) {
        const total = this.players[p].field.filter(x => this.data(x).type === 'Infrastructure').length;
        add(
          'compute',
          `Needs ${cost} compute; only ${ready} available. ${total >= cost ? 'Tapped infrastructure becomes ready on your next turn.' : 'Build more infrastructure during your main phases, one per turn.'}`,
        );
      }
      if (d.target && !this.targets(p, c).length) {
        const missing = {
          unit: 'There are no units on the battlefield to target.',
          support: 'There are no Tools or Controls on the battlefield to target.',
          grave: 'There are no unit cards in your discard to recover.',
          spell:
            'There is no Response or Operation on the stack to counter. Units, Tools and Controls are not valid targets.',
        };
        add(`target-${d.target}`, missing[d.target] || 'There is no valid target for this card.');
      }
      if (options.overclock && !d.overclock) add('overclock', `${d.name} has no Overclock.`);
      else if (isRule(d)) issues.push(...this.ruleIssues(p, d, options));
    }
    return issues;
  }
  costOf(d, {overclock = false} = {}) {
    return d.cost + (overclock && d.overclock ? d.overclock.cost : 0);
  }
  // A rule card can be cast when some way of casting it (a mode, with or without Overclock) has its targets.
  ruleIssues(p, d, {mode = null, overclock = false} = {}) {
    if (d.modes && mode != null && !d.modes[mode])
      return [{code: 'mode', message: 'Choose one of this card’s modes.'}];
    const modes = d.modes ? (mode == null ? d.modes.map((_, i) => i) : [mode]) : [null];
    const reachable = modes.some(m =>
      spellRule(d, {mode: m, overclock}).targets.every(
        spec => spec.optional || spec.upTo || candidates(this, p, spec).length,
      ),
    );
    return reachable ? [] : [{code: 'target', message: 'There is no legal target for this card.'}];
  }
```

The only changes from the old version are the `options` parameter, `cost` replacing `d.cost` in the compute issue, and the last two lines of the `else` branch.

Replace `play`:

```js
  play(p, uid, target = null, options = {}) {
    const q = this.players[p],
      c = q.hand.find(c => c.uid === uid),
      issues = this.playIssues(p, c, options);
    if (issues.length) throw Error(issues.map(issue => issue.message).join(' '));
    const d = this.data(c);
    if (d.target && !this.targets(p, c).some(t => JSON.stringify(t) === JSON.stringify(target)))
      throw Error('Choose a legal target.');
    let opts = null;
    if (isRule(d)) {
      if (d.modes && options.mode == null) throw Error('Choose one of this card’s modes.');
      const problem = checkTargets(this, p, spellRule(d, options).targets, options.targets ?? {});
      if (problem) throw Error(problem);
      opts = {targets: structuredClone(options.targets ?? {})};
      if (options.overclock) opts.overclock = true;
      if (d.modes) opts.mode = options.mode;
    }
    q.hand = q.hand.filter(x => x.uid !== uid);
    if (d.type === 'Infrastructure') {
      q.field.push(c);
      q.landPlayed = true;
      this.note(`${this.label(p)} ${this.verb(p, 'play', 'plays')} ${d.name}.`);
      return;
    }
    this.pay(p, this.costOf(d, options));
    this.stack.push(opts ? {card: c, p, target: null, opts} : {card: c, p, target});
    this.events.push({name: d.name, lesson: d.lesson, faction: d.faction});
    this.passes = 0;
    this.note(
      `${this.label(p)} ${this.verb(p, 'cast', 'casts')} ${d.name}${opts?.overclock ? ', overclocked' : ''}${target ? ` → ${this.targetName(target)}` : ''}.`,
    );
  }
```

- [ ] **Step 5: Resolve rule entries**

At the top of `resolve`, change

```js
    const s = this.stack.pop(),
      {card, p, target} = s,
      d = this.data(card);
```

to

```js
    const s = this.stack.pop();
    if (s.ability || s.opts) return this.resolveRule(s);
    const {card, p, target} = s,
      d = this.data(card);
```

Then add after `resolve`:

```js
  resolveRule(s) {
    const {targets, fizzled} = recheck(this, s.p, ruleOf(s).targets, s.opts.targets);
    if (fizzled) {
      if (s.card) this.leaveStack(s);
      this.note(`${this.entryName(s)} has no legal target and does not resolve.`);
    } else
      this.run({
        entry: s,
        i: 0,
        targets,
        p: s.p,
        self: s.card?.uid ?? s.ability.uid,
        source: {id: s.card?.id ?? s.ability.card},
      });
    this.check();
  }
  // Runs an entry's steps from frame.i. A step that needs a choice sets `pending` and the frame waits in it.
  run(frame) {
    const {steps} = ruleOf(frame.entry);
    for (; frame.i < steps.length && this.winner === null; frame.i++) {
      const step = steps[frame.i];
      if (OPS[step.op](this, frame, step)) {
        frame.i++;
        this.pending.frame = frame;
        return false;
      }
    }
    this.finish(frame.entry);
    return true;
  }
  finish(entry) {
    if (entry.card) this.leaveStack(entry);
    this.note(`${this.entryName(entry)} resolves.`);
  }
  leaveStack(entry) {
    this.players[entry.p].grave.push(entry.card);
  }
  entryName(s) {
    return s.card ? this.data(s.card).name : `${BY_ID[s.ability.card].name} (${abilityOf(s.ability).label})`;
  }
```

Add `abilityOf` to the rules import.

- [ ] **Step 6: Guard code that assumed every stack entry has a card**

- `targets()`, for `d.target === 'spell'`: `.filter(s => ['Response', 'Operation'].includes(this.data(s.card).type))` becomes `.filter(s => s.card && ['Response', 'Operation'].includes(this.data(s.card).type))`.
- `targetName`: `const s = this.stack.find(s => s.card.uid === t.uid);` becomes `const s = this.stack.find(s => s.card?.uid === t.uid);`.
- The legacy `counter` case: `this.stack.findIndex(x => x.card.uid === target.uid)` becomes `this.stack.findIndex(x => x.card?.uid === target.uid)`.
- `aiAction`: `.find(s => s.p === 0 && ts.some(t => t.uid === s.card.uid))` becomes `.find(s => s.p === 0 && s.card && ts.some(t => t.uid === s.card.uid))`.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 8: Commit**

```bash
npx --yes prettier@3.9.9 --write public/rules.mjs public/engine.mjs tests/rules-spells.test.mjs
git add public/rules.mjs public/engine.mjs tests/rules-spells.test.mjs
git commit -m "Cast and resolve rule spells with targets, Overclock and modes"
```

---

### Task 5: Costs and activated abilities

**Files:**
- Modify: `public/rules.mjs` (`retireOptions`, `archiveOptions`, `pickedTargets`)
- Modify: `public/engine.mjs` (`activationIssues`, `activate`, `checkPicks`, `payCost`; extra spell costs in `playIssues`/`play`)
- Create: `tests/rules-costs.test.mjs`

**Interfaces:**
- Consumes: `checkTargets`, `candidates` (Task 4); `retire`, `archiveCard` (Task 2).
- Produces:
  - `g.activationIssues(p, uid, abilityId, options)` and `g.activate(p, uid, abilityId, options = {targets, costUids})`.
  - Ability stack entries `{ability: {card, uid, id}, p, target: null, opts: {targets}}`.
  - `costUids` lists the chosen cost cards in order: the one to retire, then the one to archive.
  - `rules.mjs`: `retireOptions(g, p, spec, sourceUid)`, `archiveOptions(g, p, spec)`.

- [ ] **Step 1: Write the failing tests**

`tests/rules-costs.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const relay = {
  id: 'x-relay',
  type: 'Infrastructure',
  abilities: [
    {
      id: 'cash',
      kind: 'activated',
      label: 'Cash out',
      cost: {compute: 3, tap: true, retire: 'self'},
      steps: [{op: 'createToken', token: 'pt-backdoor', n: 2}],
    },
  ],
};
const burn = {
  id: 'x-burn',
  type: 'Operation',
  cost: 2,
  extraCost: {retire: {types: ['Tool']}},
  targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit']}],
  steps: [{op: 'destroy', to: 't'}],
};
const swap = {
  id: 'x-swap',
  type: 'Operation',
  cost: 0,
  extraCost: {retire: {types: ['Unit']}},
  targets: [{key: 't', zone: 'field', side: 'any', types: ['Unit']}],
  steps: [{op: 'bounce', to: 't'}],
};
const ref = uid => ({kind: 'card', uid});

test('a Backdoor boosts a unit you control: it is retired and vanishes as the cost', () => {
  const g = table();
  compute(g, 0, 1);
  const u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  g.activate(0, b.uid, 'boost', {targets: {t: ref(u.uid)}});
  assert.equal(g.mana(0), 0);
  assert.ok(!g.players[0].field.includes(b));
  assert.equal(g.players[0].grave.length, 0);
  assert.equal(g.stack[0].ability.id, 'boost');
  resolveTop(g);
  assert.equal(g.stats(u, 0).power, 5);
});

test('an Indicator draws a card when analyzed', () => {
  const g = table();
  compute(g, 0, 2);
  const i = g.createToken(0, 'pt-indicator');
  g.activate(0, i.uid, 'analyze');
  resolveTop(g);
  assert.equal(g.players[0].hand.length, 1);
});

test('abilities are activated only in your own main phase with an empty stack and priority', () => {
  const g = table();
  compute(g, 0, 2);
  const i = g.createToken(0, 'pt-indicator');
  const codes = () => g.activationIssues(0, i.uid, 'analyze').map(x => x.code);
  g.phase = 'afterAttack';
  assert.deepEqual(codes(), ['main-phase']);
  g.phase = 'main1';
  g.active = 1;
  assert.deepEqual(codes(), ['main-phase']);
  g.active = 0;
  g.priority = 1;
  assert.deepEqual(codes(), ['main-phase']);
  g.priority = 0;
  assert.deepEqual(codes(), []);
  assert.deepEqual(
    g.activationIssues(0, i.uid, 'nope').map(x => x.code),
    ['no-ability'],
  );
});

test('an Infrastructure ability that taps it pays its compute with other infrastructure', t => {
  define(t, relay);
  const g = table();
  const r = put(g, 0, 'x-relay');
  compute(g, 0, 2);
  assert.deepEqual(
    g.activationIssues(0, r.uid, 'cash').map(x => x.code),
    ['compute'],
  );
  compute(g, 0, 1);
  g.activate(0, r.uid, 'cash');
  assert.equal(g.mana(0), 0);
  assert.ok(g.players[0].grave.some(x => x.uid === r.uid));
  resolveTop(g);
  assert.equal(g.players[0].field.filter(x => x.id === 'pt-backdoor').length, 2);
});

test('an extra retire cost must be chosen; a bad choice pays nothing', t => {
  define(t, burn);
  const g = table();
  compute(g, 0, 2);
  const theirs = put(g, 1, 'b7'),
    c = put(g, 0, 'x-burn', 'hand');
  assert.deepEqual(
    g.playIssues(0, c).map(x => x.code),
    ['retire'],
  );
  const b = g.createToken(0, 'pt-backdoor');
  const before = JSON.stringify(g.toJSON());
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: ref(theirs.uid)}, costUids: [theirs.uid]}), /retire/);
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: ref(theirs.uid)}}), /cards this cost needs/);
  assert.equal(JSON.stringify(g.toJSON()), before);
  g.play(0, c.uid, null, {targets: {t: ref(theirs.uid)}, costUids: [b.uid]});
  assert.ok(!g.players[0].field.includes(b));
  resolveTop(g);
  assert.ok(g.players[1].grave.some(x => x.uid === theirs.uid));
});

test('a card paying a cost cannot also be a target', t => {
  define(t, swap);
  const g = table();
  const u = put(g, 0, 'r7'),
    c = put(g, 0, 'x-swap', 'hand');
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: ref(u.uid)}, costUids: [u.uid]}), /also be a target/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/rules-costs.test.mjs`
Expected: FAIL. `g.activate` is not a function.

- [ ] **Step 3: Add the cost helpers to `rules.mjs`**

```js
// Permanents you could retire for a cost: {types?, id?, other?}; `other` excludes the card paying it.
export const retireOptions = (g, p, spec, sourceUid = null) =>
  g.players[p].field.filter(
    c =>
      (!spec.types || spec.types.includes(data(c).type)) &&
      (!spec.id || c.id === spec.id) &&
      !(spec.other && c.uid === sourceUid),
  );
export const archiveOptions = (g, p, spec) =>
  g.players[p].grave.filter(c => !spec.types || spec.types.includes(data(c).type));
// Every card uid named in a chosen-targets object.
export const pickedTargets = chosen =>
  Object.values(chosen ?? {})
    .flatMap(v => (Array.isArray(v) ? v : [v]))
    .map(t => t?.uid)
    .filter(u => u != null);
```

- [ ] **Step 4: Add activation and payment to the engine**

Extend the rules import with `abilityOf, archiveOptions, pickedTargets, retireOptions`. Add after `play`:

```js
  activationIssues(p, uid, abilityId) {
    if (this.winner !== null) return [{code: 'finished', message: 'This match has ended.'}];
    const src = this.players[p].field.find(c => c.uid === uid);
    const a = src && this.data(src).abilities?.find(x => x.id === abilityId && x.kind === 'activated');
    if (!a) return [{code: 'no-ability', message: 'This card has no such ability.'}];
    const issues = [],
      add = (code, message) => issues.push({code, message});
    if (this.priority !== p || p !== this.active || !['main1', 'main2'].includes(this.phase) || this.stack.length)
      add('main-phase', 'Abilities can only be activated during your main phase while the stack is empty.');
    const cost = a.cost ?? {};
    if (cost.tap && src.tapped) add('tapped', `${this.data(src).name} is tapped.`);
    // A tap cost on infrastructure uses it up, so its compute has to come from other infrastructure.
    const ready =
      this.mana(p) - (cost.tap && !src.tapped && this.data(src).type === 'Infrastructure' ? 1 : 0);
    if (ready < (cost.compute ?? 0)) add('compute', `Needs ${cost.compute} compute; only ${ready} available.`);
    issues.push(...this.costIssues(p, cost, uid));
    if ((a.targets ?? []).some(spec => !spec.optional && !spec.upTo && !candidates(this, p, spec).length))
      add('target', 'There is no legal target for this ability.');
    return issues;
  }
  costIssues(p, cost, sourceUid = null) {
    const issues = [];
    if (cost.retire && cost.retire !== 'self' && !retireOptions(this, p, cost.retire, sourceUid).length)
      issues.push({code: 'retire', message: 'You have nothing to retire for this cost.'});
    if (cost.archive && !archiveOptions(this, p, cost.archive).length)
      issues.push({code: 'archive', message: 'You have no card in your discard to archive for this cost.'});
    return issues;
  }
  activate(p, uid, abilityId, options = {}) {
    const issues = this.activationIssues(p, uid, abilityId);
    if (issues.length) throw Error(issues.map(i => i.message).join(' '));
    const src = this.players[p].field.find(c => c.uid === uid),
      d = this.data(src),
      a = d.abilities.find(x => x.id === abilityId),
      picks = options.costUids ?? [];
    const problem =
      checkTargets(this, p, a.targets ?? [], options.targets ?? {}) ??
      this.checkPicks(p, a.cost ?? {}, uid, picks, options.targets);
    if (problem) throw Error(problem);
    this.payCost(p, a.cost ?? {}, src, picks);
    this.stack.push({
      ability: {card: d.id, uid, id: abilityId},
      p,
      target: null,
      opts: {targets: structuredClone(options.targets ?? {})},
    });
    this.passes = 0;
    this.note(`${this.label(p)} ${this.verb(p, 'activate', 'activates')} ${d.name}: ${a.label}.`);
  }
  // Checks the chosen cost cards: the one to retire, then the one to archive, in that order.
  checkPicks(p, cost, sourceUid, picks, chosenTargets) {
    const retiring = cost.retire && cost.retire !== 'self';
    if (!Array.isArray(picks) || picks.length !== (retiring ? 1 : 0) + (cost.archive ? 1 : 0))
      return 'Choose the cards this cost needs.';
    let i = 0;
    if (retiring && !retireOptions(this, p, cost.retire, sourceUid).some(c => c.uid === picks[i++]))
      return 'Choose a card you can retire for this cost.';
    if (cost.archive && !archiveOptions(this, p, cost.archive).some(c => c.uid === picks[i++]))
      return 'Choose a card in your discard to archive for this cost.';
    const targeted = pickedTargets(chosenTargets);
    if (picks.some(u => targeted.includes(u)) || (cost.retire === 'self' && targeted.includes(sourceUid)))
      return 'A card paying a cost can’t also be a target.';
    return null;
  }
  // Pays every part of a cost at once, after everything has been checked. A tap cost is paid first, so the
  // source's own compute can't pay for it.
  payCost(p, cost, source, picks) {
    if (cost.tap) source.tapped = true;
    this.pay(p, cost.compute ?? 0);
    let i = 0;
    if (cost.retire === 'self') this.retire(p, source);
    else if (cost.retire) this.retire(p, this.players[p].field.find(c => c.uid === picks[i++]));
    if (cost.archive) this.archiveCard(p, this.players[p].grave.find(c => c.uid === picks[i++]));
  }
```

- [ ] **Step 5: Extra costs on spells**

In `playIssues`, directly after the Overclock/rule line (`if (options.overclock && !d.overclock) … else if (isRule(d)) …`), add:

```js
      if (d.extraCost) issues.push(...this.costIssues(p, d.extraCost));
```

In `play`, inside `if (isRule(d)) { … }`, after the `checkTargets` problem check, add:

```js
      const picks = options.costUids ?? [];
      const costProblem = d.extraCost ? this.checkPicks(p, d.extraCost, null, picks, options.targets) : null;
      if (costProblem) throw Error(costProblem);
```

After `this.pay(p, this.costOf(d, options));`, add:

```js
    if (d.extraCost) this.payCost(p, d.extraCost, null, options.costUids ?? []);
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 7: Commit**

```bash
npx --yes prettier@3.9.9 --write public/rules.mjs public/engine.mjs tests/rules-costs.test.mjs
git add public/rules.mjs public/engine.mjs tests/rules-costs.test.mjs
git commit -m "Activate abilities and pay retire, archive and tap costs"
```

---

### Task 6: Events and triggered abilities

**Files:**
- Modify: `public/rules.mjs` (`ON`, `autoTargets`, and `CHOICES` for `order` and `targets`)
- Modify: `public/engine.mjs` (`emit`, `settle`, `triggersFor`, `place`, `choose`; emit calls; settle calls; `actor`, `pass`, `playIssues`, `activationIssues`, `attackers`, `blockers` and `discard` respect `pending`; `casts` reset)
- Create: `tests/rules-triggers.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces:
  - Events `{type: 'enter'|'defeated'|'retire'|'cast'|'block'|'combatDamage'|'endStep', p, uid?, id?, cardType?, count?, fromGrave?}`.
  - `g.settle()`, run after every action.
  - `g.choose(p, selection)`.
  - Pending choice kinds `'order'` (selection `{order: [triggerId, …]}`) and `'targets'` (selection `{targets}`).
  - Waiting trigger `{id, p, ability: {card, uid, id}, targets?, ordered?}`.
  - `rules.mjs`: `ON`, `autoTargets(g, p, specs) → targets | 'none' | 'choose'`, and `CHOICES`.

- [ ] **Step 1: Write the failing tests**

`tests/rules-triggers.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const opposingUnit = {key: 't', zone: 'field', side: 'opponent', types: ['Unit']};
const trig = (id, on, steps, extra = {}) => ({id, kind: 'triggered', label: id, on, steps, ...extra});
const scout = {
  id: 'x-scout',
  type: 'Unit',
  cost: 1,
  power: 1,
  toughness: 1,
  abilities: [trig('e', 'enter', [{op: 'createToken', token: 'pt-backdoor'}])],
};
const cuff = {
  id: 'x-cuff',
  type: 'Unit',
  cost: 0,
  power: 1,
  toughness: 1,
  abilities: [trig('e', 'enter', [{op: 'tap', to: 't', lock: true}], {targets: [opposingUnit]})],
};
const canary = {
  id: 'x-canary',
  type: 'Unit',
  power: 0,
  toughness: 1,
  abilities: [trig('d', 'defeated', [{op: 'createToken', token: 'pt-indicator', n: 2}])],
};
const broker = {
  id: 'x-broker',
  type: 'Unit',
  power: 3,
  toughness: 2,
  abilities: [trig('r', 'youRetire', [{op: 'buff', to: 'self', power: 1}], {what: {types: ['Tool']}, once: true})],
};
const double = {
  id: 'x-double',
  type: 'Unit',
  power: 1,
  toughness: 1,
  abilities: [trig('a', 'enter', [{op: 'draw', n: 1}]), trig('b', 'enter', [{op: 'heal', n: 1}])],
};
const wipe = {id: 'x-wipe', type: 'Operation', cost: 0, steps: [{op: 'damageAll', amount: 5}]};
const validator = {
  id: 'x-validator',
  type: 'Control',
  abilities: [trig('v', 'opponentSecondCast', [{op: 'createToken', token: 'pt-indicator'}])],
};
const cheap = {id: 'x-cheap', type: 'Response', cost: 0, steps: [{op: 'heal', n: 1}]};
const raider = {
  id: 'x-raider',
  type: 'Unit',
  power: 2,
  toughness: 2,
  abilities: [trig('h', 'hitsOpponent', [{op: 'createToken', token: 'pt-backdoor'}], {once: true})],
};
const sentry = {
  id: 'x-sentry',
  type: 'Unit',
  power: 0,
  toughness: 5,
  abilities: [trig('b', 'block', [{op: 'createToken', token: 'pt-indicator'}])],
};
const command = {
  id: 'x-command',
  type: 'Control',
  abilities: [trig('end', 'yourEndStep', [{op: 'createToken', token: 'pt-backdoor'}])],
};
const ids = (g, p) => g.players[p].field.map(c => c.id);

test('an entry trigger goes on the stack when the unit enters, and resolves', t => {
  define(t, scout);
  const g = table();
  compute(g, 0, 1);
  g.play(0, put(g, 0, 'x-scout', 'hand').uid);
  resolveTop(g);
  assert.equal(g.stack.length, 1);
  assert.equal(g.stack[0].ability.id, 'e');
  assert.equal(g.priority, 0);
  resolveTop(g);
  assert.ok(ids(g, 0).includes('pt-backdoor'));
});

test('a trigger with no legal target is removed; one target is chosen for you; several ask', t => {
  define(t, cuff);
  const g = table();
  g.play(0, put(g, 0, 'x-cuff', 'hand').uid);
  resolveTop(g);
  assert.equal(g.stack.length, 0);
  const one = put(g, 1, 'b7');
  g.play(0, put(g, 0, 'x-cuff', 'hand').uid);
  resolveTop(g);
  assert.deepEqual(g.stack[0].opts.targets, {t: {kind: 'card', uid: one.uid}});
  resolveTop(g);
  assert.equal(one.tapped, true);
  assert.equal(one.locked, true);
  const two = put(g, 1, 'b8');
  g.play(0, put(g, 0, 'x-cuff', 'hand').uid);
  resolveTop(g);
  assert.equal(g.pending.kind, 'targets');
  assert.equal(g.actor(), 0);
  assert.throws(() => g.pass(0), /pending choice/);
  assert.throws(() => g.choose(1, {}), /no choice for you/);
  g.choose(0, {targets: {t: {kind: 'card', uid: two.uid}}});
  assert.equal(g.pending, null);
  assert.deepEqual(g.stack[0].opts.targets, {t: {kind: 'card', uid: two.uid}});
});

test('a defeated unit’s own trigger fires from the discard, and survives if the card moves on', t => {
  define(t, canary, wipe);
  const g = table();
  put(g, 0, 'x-canary');
  g.play(0, put(g, 0, 'x-wipe', 'hand').uid);
  resolveTop(g);
  assert.equal(g.stack.length, 1);
  g.archiveCard(0, g.players[0].grave.find(c => c.id === 'x-canary'));
  resolveTop(g);
  assert.equal(ids(g, 0).filter(i => i === 'pt-indicator').length, 2);
});

test('the active player’s simultaneous triggers go on the stack first, so they resolve last', t => {
  define(t, canary, wipe);
  const g = table();
  put(g, 1, 'x-canary');
  put(g, 0, 'x-canary');
  g.play(0, put(g, 0, 'x-wipe', 'hand').uid);
  resolveTop(g);
  assert.deepEqual(
    g.stack.map(s => s.p),
    [0, 1],
  );
});

test('one player’s simultaneous triggers are put in the order they choose', t => {
  define(t, double);
  const g = table();
  g.play(0, put(g, 0, 'x-double', 'hand').uid);
  resolveTop(g);
  assert.equal(g.pending.kind, 'order');
  const [a, b] = g.pending.options;
  assert.throws(() => g.choose(0, {order: [a]}), /every ability/);
  g.choose(0, {order: [b, a]});
  assert.deepEqual(
    g.stack.map(s => s.ability.id),
    ['b', 'a'],
  );
});

test('once each turn counts per object and resets at the turn boundary', t => {
  define(t, broker);
  const g = table();
  compute(g, 0, 2);
  const u = put(g, 0, 'x-broker'),
    b1 = g.createToken(0, 'pt-backdoor'),
    b2 = g.createToken(0, 'pt-backdoor');
  g.activate(0, b1.uid, 'boost', {targets: {t: {kind: 'card', uid: u.uid}}});
  assert.equal(g.stack.length, 2, 'the boost and one retire trigger');
  resolveTop(g);
  resolveTop(g);
  g.activate(0, b2.uid, 'boost', {targets: {t: {kind: 'card', uid: u.uid}}});
  assert.equal(g.stack.length, 1, 'no second trigger this turn');
  resolveTop(g);
  assert.equal(g.stats(u, 0).power, 3 + 1 + 2 + 2);
  g.endTurn();
  assert.equal(Object.hasOwn(u, 'used'), false);
});

test('an opponent’s second cast in a turn triggers once', t => {
  define(t, validator, cheap);
  const g = table();
  put(g, 1, 'x-validator');
  g.play(0, put(g, 0, 'x-cheap', 'hand').uid);
  assert.equal(g.stack.length, 1);
  g.play(0, put(g, 0, 'x-cheap', 'hand').uid);
  assert.equal(g.stack.length, 3);
  assert.equal(g.stack[2].p, 1);
  g.play(0, put(g, 0, 'x-cheap', 'hand').uid);
  assert.equal(g.stack.length, 4);
});

test('combat damage, blocks and end steps trigger', t => {
  define(t, raider, sentry, command);
  const g = table();
  const r = put(g, 0, 'x-raider'),
    r2 = put(g, 0, 'x-raider');
  put(g, 0, 'x-command');
  const s = put(g, 1, 'x-sentry');
  g.phase = 'attack';
  g.attackers(0, [r.uid, r2.uid]);
  g.pass(0);
  g.pass(1);
  g.blockers(1, {[r2.uid]: [s.uid]});
  assert.equal(g.stack[0].ability.id, 'b');
  resolveTop(g);
  g.pass(0);
  g.pass(1); // combat damage
  assert.equal(g.players[1].life, 18);
  assert.equal(g.stack.length, 1, 'only the unblocked raider hit');
  resolveTop(g);
  assert.ok(ids(g, 1).includes('pt-indicator'));
  assert.equal(ids(g, 0).filter(i => i === 'pt-backdoor').length, 1);
  while (g.phase !== 'end') g.pass(g.priority);
  assert.equal(g.stack[0]?.ability.id, 'end');
});

test('expansion state stays out of First Breach saves between actions', () => {
  const g = table();
  compute(g, 0, 1);
  g.play(0, put(g, 0, 'r1', 'hand').uid);
  const json = g.toJSON();
  for (const k of ['queue', 'waiting', 'pending', 'casts']) assert.equal(Object.hasOwn(json, k), false, k);
});
```

The combat test's passes follow the engine's phase order: `afterAttack` (both pass) → `block` → `afterBlock` (both pass) → combat damage → `endCombat`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/rules-triggers.test.mjs`
Expected: FAIL. No trigger reaches the stack.

- [ ] **Step 3: Add trigger matchers and choices to `rules.mjs`**

```js
// When a triggered ability triggers: (event, source card, its controller, ability) → boolean.
export const ON = {
  enter: (e, c) => e.type === 'enter' && e.uid === c.uid,
  defeated: (e, c) => e.type === 'defeated' && e.uid === c.uid,
  block: (e, c) => e.type === 'block' && e.uid === c.uid,
  hitsOpponent: (e, c) => e.type === 'combatDamage' && e.uid === c.uid,
  yourUnitsHit: (e, c, p) => e.type === 'combatDamage' && e.p === p,
  youRetire: (e, c, p, a) =>
    e.type === 'retire' &&
    e.p === p &&
    (!a.what?.types || a.what.types.includes(e.cardType)) &&
    (!a.what?.id || e.id === a.what.id),
  youCastFromGrave: (e, c, p) => e.type === 'cast' && e.p === p && e.fromGrave,
  opponentSecondCast: (e, c, p) => e.type === 'cast' && e.p !== p && e.count === 2,
  yourEndStep: (e, c, p) => e.type === 'endStep' && e.p === p,
};

// Targets a trigger can take without asking: none needed, or exactly one choice for each required target.
export function autoTargets(g, p, specs) {
  const targets = {};
  for (const spec of specs) {
    const options = candidates(g, p, spec);
    if (spec.optional || spec.upTo) {
      if (options.length) return 'choose';
      if (spec.upTo) targets[spec.key] = [];
    } else if (!options.length) return 'none';
    else if (options.length > 1) return 'choose';
    else targets[spec.key] = options[0];
  }
  return targets;
}

// Applies a selection to the pending choice `c`. Each throws before changing anything if the selection is wrong.
export const CHOICES = {
  order(g, c, sel) {
    const order = sel.order;
    if (
      !Array.isArray(order) ||
      order.length !== c.options.length ||
      new Set(order).size !== order.length ||
      !order.every(id => c.options.includes(id))
    )
      throw Error('Put every ability in order.');
    const chosen = order.map(id => ({...g.waiting.find(t => t.id === id), ordered: true}));
    g.waiting = [...chosen, ...g.waiting.filter(t => !order.includes(t.id))];
  },
  targets(g, c, sel) {
    const t = g.waiting.find(x => x.id === c.data.trigger);
    const problem = checkTargets(g, t.p, abilityOf(t.ability).targets ?? [], sel.targets ?? {});
    if (problem) throw Error(problem);
    t.targets = structuredClone(sel.targets ?? {});
  },
};
```

- [ ] **Step 4: Add events, settling and choosing to the engine**

Extend the rules import with `CHOICES, ON, autoTargets`. Add after `check()`:

```js
  emit(e) {
    this.queue.push(e);
  }
  // After every action: defeat units at zero toughness, then put abilities that triggered onto the stack.
  settle() {
    this.check();
    if (this.winner !== null || this.pending) return;
    for (const e of this.queue.splice(0)) this.waiting.push(...this.triggersFor(e));
    this.place();
  }
  triggersFor(e) {
    const found = [];
    const consider = (c, p) => {
      for (const a of this.data(c).abilities ?? []) {
        if (a.kind !== 'triggered' || !ON[a.on](e, c, p, a)) continue;
        // Counted when it triggers, even if the trigger is later countered or removed.
        if (a.once) {
          if (c.used?.includes(a.id)) continue;
          (c.used ??= []).push(a.id);
        }
        found.push({id: ++this.uid, p, ability: {card: c.id, uid: c.uid, id: a.id}});
      }
    };
    this.players.forEach((q, p) => q.field.forEach(c => consider(c, p)));
    // A card's own "when this is defeated" ability triggers from the discard it went to.
    if (e.type === 'defeated') {
      const f = this.find(e.uid);
      if (f?.zone === 'grave') consider(f.card, e.p);
    }
    return found;
  }
  // Puts waiting triggers on the stack: the active player's first (so they resolve last), each player's in the
  // order they choose. A trigger with no legal target is removed; one with a choice of targets asks.
  place() {
    let placed = false;
    while (this.waiting.length && !this.pending) {
      const p = this.waiting.some(t => t.p === this.active) ? this.active : 1 - this.active;
      const mine = this.waiting.filter(t => t.p === p);
      if (mine.length > 1 && !mine.every(t => t.ordered)) {
        this.pending = {
          id: ++this.uid,
          actor: p,
          kind: 'order',
          private: false,
          prompt: 'Choose the order your abilities go on the stack. The first goes on first and resolves last.',
          min: mine.length,
          max: mine.length,
          options: mine.map(t => t.id),
        };
        break;
      }
      const t = mine[0],
        specs = abilityOf(t.ability).targets ?? [];
      if (!t.targets) {
        const auto = autoTargets(this, p, specs);
        if (auto === 'choose') {
          this.pending = {
            id: ++this.uid,
            actor: p,
            kind: 'targets',
            private: false,
            prompt: `Choose targets for ${this.entryName({ability: t.ability})}.`,
            min: 1,
            max: 1,
            options: specs.map(spec => ({
              key: spec.key,
              optional: !!spec.optional,
              upTo: spec.upTo ?? 0,
              candidates: candidates(this, p, spec),
            })),
            data: {trigger: t.id},
          };
          break;
        }
        this.waiting = this.waiting.filter(x => x !== t);
        if (auto === 'none') {
          this.note(`${this.entryName({ability: t.ability})} has no legal target and is removed.`);
          continue;
        }
        t.targets = auto;
      } else this.waiting = this.waiting.filter(x => x !== t);
      this.stack.push({ability: t.ability, p, target: null, opts: {targets: t.targets}});
      this.note(`${this.entryName({ability: t.ability})} triggers.`);
      placed = true;
    }
    if (placed) {
      this.priority = this.active;
      this.passes = 0;
    }
  }
  choose(p, selection) {
    const c = this.pending;
    if (!c || c.actor !== p) throw Error('There is no choice for you to make.');
    CHOICES[c.kind](this, c, selection && typeof selection === 'object' ? selection : {});
    this.pending = null;
    if (c.frame && this.run(c.frame)) {
      this.priority = this.active;
      this.passes = 0;
    }
    this.settle();
  }
```

`choose` resumes a paused frame (Task 7 adds the kinds that pause). For `order` and `targets`, `settle()` continues placing triggers.

- [ ] **Step 5: Emit events**

- `remove(p, c)`: after the token/discard branch, add `if (d.type === 'Unit') this.emit({type: 'defeated', p, uid: c.uid});`.
- `retire(p, c)`: before `this.remove(p, c);`, add `this.emit({type: 'retire', p, uid: c.uid, id: c.id, cardType: this.data(c).type});`.
- `createToken`: before `return c;`, add `this.emit({type: 'enter', p, uid: c.uid});`.
- `resolve`, legacy permanent branch: after `this.players[p].field.push(card);`, add `this.emit({type: 'enter', p, uid: card.uid});`.
- `play`, Infrastructure branch: replace the block with
  ```js
    if (d.type === 'Infrastructure') {
      if (d.entersTapped) c.tapped = true;
      q.field.push(c);
      q.landPlayed = true;
      this.note(`${this.label(p)} ${this.verb(p, 'play', 'plays')} ${d.name}.`);
      this.emit({type: 'enter', p, uid: c.uid});
      this.settle();
      return;
    }
  ```
- `play`, after `this.passes = 0;`: add
  ```js
    this.casts[p]++;
    this.emit({type: 'cast', p, uid: c.uid, count: this.casts[p], fromGrave: false});
  ```
  and at the very end of `play`, add `this.settle();`.
- `activate`: at the end, add `this.settle();`.
- `blockers`: at the end, add `for (const uid of used) this.emit({type: 'block', p, uid}); this.settle();`.
- `combat`: in the `for (const hit of pending)` loop, after the player damage line, add `if (hit.target.kind === 'player' && n > 0) this.emit({type: 'combatDamage', p: hit.owner, uid: hit.source.uid});`. Replace the final `this.check();` with `this.settle();`.
- `advance`, `case 'main2'`: `this.phase = 'end';` becomes `this.phase = 'end'; this.emit({type: 'endStep', p: this.active});`. After the `switch`, after `this.passes = 0;`, add `this.settle();`.
- `resolve`: replace the final `this.check();` of the legacy path with `this.settle();`. In `resolveRule`, replace its `this.check();` with `this.settle();`.
- `endTurn`: after `this.casts` would otherwise carry over, reset with `this.casts = [0, 0];` next to `this.attacks = [];`. At the very end of `endTurn`, add `this.settle();`.

In a First Breach match `settle()` only runs `check()` and finds no triggers, so play is unchanged (the golden test proves it).

- [ ] **Step 6: Nothing else happens while a choice is open**

- `actor()`: first line `if (this.pending) return this.pending.actor;`.
- `pass(p)`: first line `if (this.pending) throw Error('Finish the pending choice first.');`.
- `attackers`, `blockers`, `discard`: add the same line first.
- `playIssues`: after the `not-in-hand` return, add `if (this.pending) return [{code: 'pending', message: 'Finish the pending choice first.'}];`.
- `activationIssues`: after the `finished` return, add the same.
- `concede(p)`: after setting `this.winner`, add `this.pending = null;`.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 8: Commit**

```bash
npx --yes prettier@3.9.9 --write public/rules.mjs public/engine.mjs tests/rules-triggers.test.mjs
git add public/rules.mjs public/engine.mjs tests/rules-triggers.test.mjs
git commit -m "Trigger abilities from events and let players order and target them"
```

---

### Task 7: Choices during resolution

**Files:**
- Modify: `public/rules.mjs` (`OPS.probe`, `OPS.discard`, `OPS.counterUnlessPay`, `OPS.optionalRetire`; `CHOICES.probe`, `.discard`, `.pay`, `.optional`)
- Modify: `public/engine.mjs` (`counter(i)`, and the legacy counter case uses it; `defaultChoice`; `aiAction` resolves its own choices)
- Create: `tests/rules-choices.test.mjs`

**Interfaces:**
- Consumes: `choose`, `pending`, and frames (Tasks 4 and 6).
- Produces:
  - Pending kinds and their selections:
    - `'probe'`: `{discard: [uid], order: [uid, top first]}`.
    - `'discard'`: `{uids: [uid]}`.
    - `'pay'`: `{pay: boolean}`.
    - `'optional'`: `{uid: number | null}`.
  - `g.defaultChoice(c = g.pending)`: the fixed automatic selection for any kind, used by the computer now and by play-a-friend timeouts in Plan 4.
  - `g.counter(stackIndex)`.

- [ ] **Step 1: Write the failing tests**

`tests/rules-choices.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const peek = {id: 'x-peek', type: 'Operation', cost: 0, steps: [{op: 'probe', n: 2}, {op: 'draw', n: 1}]};
const loot = {id: 'x-loot', type: 'Operation', cost: 0, steps: [{op: 'draw', n: 2}, {op: 'discard', n: 1}]};
const spoof = {
  id: 'x-spoof',
  type: 'Response',
  cost: 0,
  targets: [{key: 't', zone: 'stack', types: ['Response', 'Operation']}],
  steps: [{op: 'counterUnlessPay', to: 't', amount: 2, paid: [{op: 'createToken', token: 'pt-indicator'}]}],
};
const heal = {id: 'x-heal', type: 'Response', cost: 0, steps: [{op: 'heal', n: 3}]};
const handler = {
  id: 'x-handler',
  type: 'Unit',
  power: 1,
  toughness: 1,
  abilities: [
    {
      id: 'd',
      kind: 'triggered',
      label: 'Re-entry',
      on: 'defeated',
      steps: [{op: 'optionalRetire', what: {id: 'pt-backdoor'}, ifSelfIn: 'grave', then: [{op: 'draw', n: 1}]}],
    },
  ],
};
const deckTop = (g, p, n) =>
  g.players[p].deck
    .slice(-n)
    .reverse()
    .map(c => c.uid);

test('Probe shows the top cards privately; kept cards go back in the chosen order', t => {
  define(t, peek);
  const g = table();
  const [top, second] = deckTop(g, 0, 2);
  g.play(0, put(g, 0, 'x-peek', 'hand').uid);
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
  assert.equal(g.pending.private, true);
  assert.deepEqual(g.pending.options, [top, second]);
  assert.equal(g.actor(), 0);
  g.choose(0, {discard: [top], order: [second]});
  assert.deepEqual(
    g.players[0].grave.map(c => c.uid).slice(0, 1),
    [top],
  );
  assert.deepEqual(
    g.players[0].hand.map(c => c.uid),
    [second],
    'the draw after Probe took the kept card',
  );
  assert.equal(g.pending, null);
  assert.equal(g.priority, 0);
});

test('Probe with a short or empty deck looks at what is there and never loses the game', t => {
  define(t, {id: 'x-probe3', type: 'Operation', cost: 0, steps: [{op: 'probe', n: 3}]});
  const g = table();
  g.players[0].deck.splice(0, 9);
  g.play(0, put(g, 0, 'x-probe3', 'hand').uid);
  resolveTop(g);
  assert.equal(g.pending.options.length, 1);
  g.choose(0, {discard: g.pending.options, order: []});
  g.play(0, put(g, 0, 'x-probe3', 'hand').uid);
  resolveTop(g);
  assert.equal(g.pending, null);
  assert.equal(g.winner, null);
});

test('a malformed or unauthorised choice throws and changes nothing', t => {
  define(t, peek);
  const g = table();
  g.play(0, put(g, 0, 'x-peek', 'hand').uid);
  resolveTop(g);
  const [a, b] = g.pending.options,
    before = JSON.stringify(g.toJSON());
  for (const [p, sel] of [
    [1, {discard: [a], order: [b]}],
    [0, {discard: [a], order: [a]}],
    [0, {discard: [a]}],
    [0, {discard: 'x', order: [a, b]}],
    [0, {discard: [], order: [a, b, 999]}],
    [0, null],
  ])
    assert.throws(() => g.choose(p, sel));
  assert.equal(JSON.stringify(g.toJSON()), before);
});

test('a saved match resumes a pending choice with the same result', t => {
  define(t, peek);
  const g = table();
  g.play(0, put(g, 0, 'x-peek', 'hand').uid);
  resolveTop(g);
  const copy = Game.fromJSON(g.toJSON());
  const [a, b] = g.pending.options;
  g.choose(0, {discard: [b], order: [a]});
  copy.choose(0, {discard: [b], order: [a]});
  assert.deepEqual(copy.toJSON(), g.toJSON());
});

test('draw, then discard asks which card to discard', t => {
  define(t, loot);
  const g = table();
  put(g, 0, 'r13', 'hand');
  g.play(0, put(g, 0, 'x-loot', 'hand').uid);
  resolveTop(g);
  assert.equal(g.pending.kind, 'discard');
  assert.equal(g.pending.options.length, 3);
  const pick = g.pending.options[0];
  assert.throws(() => g.choose(0, {uids: []}));
  g.choose(0, {uids: [pick]});
  assert.equal(g.players[0].hand.length, 2);
  assert.ok(g.players[0].grave.some(c => c.uid === pick));
});

test('a soft counter asks the targeted spell’s controller to pay; paying keeps it and rewards the counter', t => {
  define(t, spoof, heal);
  const g = table();
  compute(g, 1, 2);
  g.active = 1;
  g.priority = 1;
  g.phase = 'main1';
  g.play(1, put(g, 1, 'x-heal', 'hand').uid);
  g.pass(1);
  const target = g.stack[0].card.uid;
  g.play(0, put(g, 0, 'x-spoof', 'hand').uid, null, {targets: {t: {kind: 'spell', uid: target}}});
  resolveTop(g);
  assert.equal(g.pending.kind, 'pay');
  assert.equal(g.actor(), 1);
  g.choose(1, {pay: true});
  assert.equal(g.mana(1), 0);
  assert.equal(g.stack.length, 1);
  assert.ok(g.players[0].field.some(c => c.id === 'pt-indicator'));
});

test('declining, or being unable, to pay counters the spell', t => {
  define(t, spoof, heal);
  for (const mana of [2, 0]) {
    const g = table();
    compute(g, 1, mana);
    g.active = 1;
    g.priority = 1;
    g.play(1, put(g, 1, 'x-heal', 'hand').uid);
    g.pass(1);
    g.play(0, put(g, 0, 'x-spoof', 'hand').uid, null, {targets: {t: {kind: 'spell', uid: g.stack[0].card.uid}}});
    resolveTop(g);
    if (mana) g.choose(1, {pay: false});
    assert.equal(g.pending, null);
    assert.equal(g.stack.length, 0);
    assert.ok(g.players[1].grave.some(c => c.id === 'x-heal'));
    assert.match(g.log.join('\n'), /x-heal is countered/);
  }
});

test('an optional retire inside a trigger is offered only when it can matter', t => {
  define(t, handler);
  const g = table();
  const h = put(g, 0, 'x-handler');
  g.createToken(0, 'pt-backdoor');
  h.damage = 5;
  g.settle();
  resolveTop(g);
  assert.equal(g.pending.kind, 'optional');
  g.choose(0, {uid: g.pending.options[0]});
  assert.equal(g.players[0].hand.length, 1);
  assert.ok(!g.players[0].field.some(c => c.id === 'pt-backdoor'));
  const h2 = put(g, 0, 'x-handler');
  g.createToken(0, 'pt-backdoor');
  h2.damage = 5;
  g.settle();
  g.archiveCard(0, g.players[0].grave.find(c => c.uid === h2.uid));
  resolveTop(g);
  assert.equal(g.pending, null, 'not offered: the card is no longer in the discard');
});

test('each choice has a fixed automatic answer, which the computer uses', t => {
  define(t, peek);
  const g = table();
  g.active = 1;
  g.priority = 1;
  g.play(1, put(g, 1, 'x-peek', 'hand').uid);
  g.pass(1);
  g.pass(0);
  assert.equal(g.actor(), 1);
  const opts = g.pending.options;
  assert.deepEqual(g.defaultChoice(), {discard: [], order: opts});
  g.aiAction();
  assert.equal(g.pending, null);
  assert.deepEqual(
    g.players[1].hand.map(c => c.uid),
    [opts[0]],
  );
});

test('conceding clears a pending choice; running out of cards mid-effect ends the match and the effect', t => {
  define(t, peek, {id: 'x-greedy', type: 'Operation', cost: 0, steps: [{op: 'draw', n: 20}, {op: 'heal', n: 5}]});
  const g = table();
  g.play(0, put(g, 0, 'x-peek', 'hand').uid);
  resolveTop(g);
  g.concede(0);
  assert.equal(g.pending, null);
  const h = table();
  h.play(0, put(h, 0, 'x-greedy', 'hand').uid);
  resolveTop(h);
  assert.equal(h.winner, 1);
  assert.equal(h.players[0].life, 20, 'the heal after the failed draw never happened');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/rules-choices.test.mjs`
Expected: FAIL. `OPS.probe` is not a function.

- [ ] **Step 3: Add the pausing steps and their choices to `rules.mjs`**

Add to `OPS`:

```js
  // Private: only the probing player learns these cards and the order they go back in.
  probe: (g, f, s) => {
    const top = g.players[f.p].deck.slice(-s.n).reverse();
    if (!top.length) return false;
    g.pending = {
      id: ++g.uid,
      actor: f.p,
      kind: 'probe',
      private: true,
      prompt: `Probe ${s.n}: put any of these into your discard, and the rest back on top in any order.`,
      min: 0,
      max: top.length,
      options: top.map(c => c.uid),
    };
    return true;
  },
  discard: (g, f, s) => {
    const hand = g.players[f.p].hand;
    if (hand.length <= s.n) {
      g.players[f.p].grave.push(...hand.splice(0));
      return false;
    }
    g.pending = {
      id: ++g.uid,
      actor: f.p,
      kind: 'discard',
      private: true,
      prompt: `Discard ${s.n} card${s.n === 1 ? '' : 's'}.`,
      min: s.n,
      max: s.n,
      options: hand.map(c => c.uid),
    };
    return true;
  },
  // "Counter target spell unless its controller pays N": that player decides; `paid` steps reward the caster.
  counterUnlessPay: (g, f, s) => {
    const t = f.targets[s.to],
      i = t ? g.stack.findIndex(x => x.card?.uid === t.uid) : -1;
    if (i < 0) return false;
    const q = g.stack[i].p;
    if (g.mana(q) < s.amount) {
      g.counter(i);
      return false;
    }
    g.pending = {
      id: ++g.uid,
      actor: q,
      kind: 'pay',
      private: false,
      prompt: `Pay ${s.amount} compute, or ${data(g.stack[i].card).name} is countered.`,
      min: 1,
      max: 1,
      options: [true, false],
      data: {uid: t.uid, amount: s.amount, paid: s.paid ?? []},
    };
    return true;
  },
  // "You may retire …. If you do, …": offered only when there is something to retire and it can still matter.
  optionalRetire: (g, f, s) => {
    if (s.ifSelfIn && g.find(f.self)?.zone !== s.ifSelfIn) return false;
    const options = retireOptions(g, f.p, s.what, f.self).map(c => c.uid);
    if (!options.length) return false;
    g.pending = {
      id: ++g.uid,
      actor: f.p,
      kind: 'optional',
      private: false,
      prompt: s.prompt ?? 'You may retire a card.',
      min: 0,
      max: 1,
      options: [...options, null],
      data: {then: s.then ?? []},
    };
    return true;
  },
```

`then` and `paid` steps run straight through: they must not contain steps that pause.

Add to `CHOICES`:

```js
  probe(g, c, sel) {
    const {discard, order} = sel;
    const all = Array.isArray(discard) && Array.isArray(order) ? [...discard, ...order] : null;
    if (!all || all.length !== c.options.length || new Set(all).size !== all.length || !all.every(u => c.options.includes(u)))
      throw Error('Put each probed card into your discard or back on top.');
    const q = g.players[c.actor],
      probed = q.deck.splice(q.deck.length - c.options.length);
    const byUid = u => probed.find(x => x.uid === u);
    q.deck.push(...[...order].reverse().map(byUid));
    q.grave.push(...discard.map(byUid));
    g.note(
      `${g.label(c.actor)} ${g.verb(c.actor, 'probe', 'probes')} ${c.options.length}${discard.length ? `, discarding ${discard.map(u => data(byUid(u)).name).join(', ')}` : ''}.`,
    );
  },
  discard(g, c, sel) {
    const uids = sel.uids;
    if (!Array.isArray(uids) || uids.length !== c.min || new Set(uids).size !== uids.length || !uids.every(u => c.options.includes(u)))
      throw Error(`Choose ${c.min} card${c.min === 1 ? '' : 's'} to discard.`);
    const q = g.players[c.actor];
    for (const u of uids) q.grave.push(...q.hand.splice(q.hand.findIndex(x => x.uid === u), 1));
  },
  pay(g, c, sel) {
    if (typeof sel.pay !== 'boolean') throw Error('Choose whether to pay.');
    const i = g.stack.findIndex(x => x.card?.uid === c.data.uid);
    if (!sel.pay) return g.counter(i);
    g.pay(c.actor, c.data.amount);
    g.note(`${g.label(c.actor)} ${g.verb(c.actor, 'pay', 'pays')} ${c.data.amount} compute.`);
    for (const step of c.data.paid) OPS[step.op](g, c.frame, step);
  },
  optional(g, c, sel) {
    if (!Object.hasOwn(sel, 'uid') || !c.options.includes(sel.uid)) throw Error('Choose a card to retire, or none.');
    if (sel.uid === null) return;
    g.retire(c.actor, g.players[c.actor].field.find(x => x.uid === sel.uid));
    for (const step of c.data.then) OPS[step.op](g, c.frame, step);
  },
```

`choose` clears `pending` after the handler returns, and the handler runs before the frame resumes. `c.frame` is set by `run()` when the step paused, so `paid`/`then` steps see the same targets as the resolving card.

- [ ] **Step 4: Counter helper, default choices, and the computer**

`public/engine.mjs`:

```js
  counter(i) {
    const other = this.stack.splice(i, 1)[0];
    this.leaveStack(other);
    this.note(`${this.data(other.card).name} is countered.`);
  }
  // The automatic answer to each kind of choice: for the computer, and for a play-a-friend clock running out.
  defaultChoice(c = this.pending) {
    switch (c.kind) {
      case 'probe':
        return {discard: [], order: [...c.options]};
      case 'discard':
        return {
          uids: c.options
            .map(u => this.find(u).card)
            .sort((a, b) => this.data(b).cost - this.data(a).cost)
            .slice(0, c.min)
            .map(x => x.uid),
        };
      case 'pay':
        return {pay: false};
      case 'optional':
        return {uid: null};
      case 'order':
        return {order: [...c.options]};
      case 'targets':
        return {
          targets: Object.fromEntries(
            c.options
              .filter(o => !o.optional && !o.upTo)
              .map(o => [o.key, [...o.candidates].sort((a, b) => a.uid - b.uid)[0]]),
          ),
        };
    }
  }
```

Replace the legacy `counter` case in `resolve` with:

```js
        case 'counter':
          this.counter(this.stack.findIndex(x => x.card?.uid === target.uid));
          break;
```

(For First Breach cards this pushes to the same discard with the same note, and the golden test proves it.)

In `aiAction`, right after `if (p !== 1 || this.winner !== null) return;`, add:

```js
    if (this.pending) return this.choose(1, this.defaultChoice());
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/rules.mjs public/engine.mjs tests/rules-choices.test.mjs
git add public/rules.mjs public/engine.mjs tests/rules-choices.test.mjs
git commit -m "Pause effects for Probe, discards, soft counters and optional costs"
```

---

### Task 8: Reuse from the discard

**Files:**
- Modify: `public/engine.mjs` (`playIssues` and `play` accept `{reuse: true}`, `costOf` uses the Reuse cost, `leaveStack` archives)
- Create: `tests/rules-reuse.test.mjs`

**Interfaces:**
- Consumes: `leaveStack`, `counter`, and the `cast` event (Tasks 4, 6 and 7).
- Produces:
  - `play(p, uid, null, {reuse: true, …})` casts a discard card with `reuse`, paying `d.reuse` (+ Overclock).
  - Entry `opts.reuse = true`, and any exit from the stack archives the card.
  - The `cast` event has `fromGrave: true`.

- [ ] **Step 1: Write the failing tests**

`tests/rules-reuse.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const map = {id: 'x-map', type: 'Operation', cost: 1, reuse: 3, steps: [{op: 'draw', n: 1}]};
const zap = {
  id: 'x-rezap',
  type: 'Response',
  cost: 1,
  reuse: 2,
  targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit']}],
  steps: [{op: 'damage', to: 't', amount: 1}],
};
const lotl = {
  id: 'x-lotl',
  type: 'Unit',
  power: 3,
  toughness: 3,
  abilities: [{id: 'l', kind: 'triggered', label: 'Loot', on: 'youCastFromGrave', once: true, steps: [{op: 'draw', n: 1}]}],
};

test('a Reuse card is cast from the discard for its Reuse cost, then archived', t => {
  define(t, map);
  const g = table();
  compute(g, 0, 3);
  const c = put(g, 0, 'x-map', 'grave');
  assert.deepEqual(
    g.playIssues(0, c).map(i => i.code),
    ['not-in-hand'],
  );
  assert.deepEqual(g.playIssues(0, c, {reuse: true}), []);
  g.play(0, c.uid, null, {reuse: true});
  assert.equal(g.mana(0), 0);
  assert.equal(g.stack[0].opts.reuse, true);
  resolveTop(g);
  assert.equal(g.players[0].grave.length, 0);
  assert.deepEqual(
    g.players[0].archive.map(x => x.uid),
    [c.uid],
  );
});

test('only Operations and Responses with Reuse can be cast from the discard', () => {
  const g = table();
  compute(g, 0, 5);
  const fb = put(g, 0, 'r13', 'grave');
  assert.deepEqual(
    g.playIssues(0, fb, {reuse: true}).map(i => i.code),
    ['reuse'],
  );
});

test('a card cast normally from hand still goes to the discard', t => {
  define(t, map);
  const g = table();
  compute(g, 0, 1);
  g.play(0, put(g, 0, 'x-map', 'hand').uid);
  resolveTop(g);
  assert.equal(g.players[0].grave.length, 1);
});

test('a Reuse cast is archived when countered or when its target is gone', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 2);
  compute(g, 1, 2);
  const theirs = put(g, 1, 'b7');
  const c = put(g, 0, 'x-rezap', 'grave');
  g.play(0, c.uid, null, {reuse: true, targets: {t: {kind: 'card', uid: theirs.uid}}});
  g.pass(0);
  const block = CARDS.find(x => x.name === 'Block Execution').id;
  g.play(1, put(g, 1, block, 'hand').uid, {kind: 'spell', uid: c.uid});
  resolveTop(g);
  assert.ok(g.players[0].archive.some(x => x.uid === c.uid));

  const h = table();
  compute(h, 0, 2);
  const unit = put(h, 1, 'b7'),
    d = put(h, 0, 'x-rezap', 'grave');
  h.play(0, d.uid, null, {reuse: true, targets: {t: {kind: 'card', uid: unit.uid}}});
  h.bounce(1, unit);
  resolveTop(h);
  assert.ok(h.players[0].archive.some(x => x.uid === d.uid));
});

test('casting from the discard triggers abilities that care, even if the card is then countered', t => {
  define(t, map, lotl);
  const g = table();
  compute(g, 0, 3);
  put(g, 0, 'x-lotl');
  g.play(0, put(g, 0, 'x-map', 'grave').uid, null, {reuse: true});
  assert.equal(g.stack.length, 2);
  assert.equal(g.stack[1].ability.id, 'l');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/rules-reuse.test.mjs`
Expected: FAIL. `playIssues` reports `not-in-hand` for Reuse casts.

- [ ] **Step 3: Implement Reuse**

In `playIssues`, replace the `not-in-hand` check with:

```js
    const zone = options.reuse ? 'grave' : 'hand';
    if (!c || !this.players[p][zone].some(x => x.uid === c.uid))
      return [
        {
          code: options.reuse ? 'not-in-discard' : 'not-in-hand',
          message: options.reuse ? 'This card is not in your discard.' : 'This card is not in your hand.',
        },
      ];
    if (options.reuse && (this.data(c).reuse == null || !['Operation', 'Response'].includes(this.data(c).type)))
      return [{code: 'reuse', message: `${this.data(c).name} can’t be cast from your discard.`}];
```

(Keep the `pending` check right after it.)

`costOf`:

```js
  costOf(d, {overclock = false, reuse = false} = {}) {
    return (reuse ? d.reuse : d.cost) + (overclock && d.overclock ? d.overclock.cost : 0);
  }
```

In `play`:
- Find the card in the right zone: `c = (options.reuse ? q.grave : q.hand).find(c => c.uid === uid)`.
- Remove it from that zone: replace `q.hand = q.hand.filter(x => x.uid !== uid);` with
  ```js
    if (options.reuse) q.grave = q.grave.filter(x => x.uid !== uid);
    else q.hand = q.hand.filter(x => x.uid !== uid);
  ```
- In the `isRule` block, after `if (d.modes) opts.mode = options.mode;`, add `if (options.reuse) opts.reuse = true;`.
- The cast event: `fromGrave: false` becomes `fromGrave: !!options.reuse`.

`leaveStack`:

```js
  leaveStack(entry) {
    const q = this.players[entry.p];
    // A card cast with Reuse is archived however it leaves the stack: resolved, countered or without targets.
    (entry.opts?.reuse ? q.archive : q.grave).push(entry.card);
  }
```

Reuse cards are always rule cards (`reuse` is only printed on Operations and Responses written as rules), so their entries always have `opts`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/engine.mjs tests/rules-reuse.test.mjs
git add public/engine.mjs tests/rules-reuse.test.mjs
git commit -m "Cast Reuse cards from the discard and archive them afterwards"
```

---

### Task 9: Auto-pass and card conservation

**Files:**
- Modify: `public/engine.mjs` (new `canAct`)
- Modify: `public/app.mjs:725` (auto-pass)
- Modify: `tests/helpers/simulate.mjs` (new `conserved`), `tests/engine.test.mjs` (the 100-match test uses it)
- Create: `tests/rules-flow.test.mjs`

**Interfaces:**
- Consumes: `playIssues` with `{reuse}` (Task 8), `pending` (Task 6).
- Produces:
  - `g.canAct(p): boolean`: true when p has a choice to make, a castable card in hand, or a castable Reuse card in the discard.
  - `conserved(g, p): number`: the player's real cards across deck, hand, battlefield (tokens excluded), discard, archive and the stack. Always 60.

- [ ] **Step 1: Write the failing tests**

`tests/rules-flow.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, put, table} from './helpers/rules.mjs';
import {conserved} from './helpers/simulate.mjs';

const heal = {id: 'x-reheal', type: 'Response', cost: 1, reuse: 1, steps: [{op: 'heal', n: 1}]};

test('a player with a castable Reuse Response in the discard can act, so auto-pass waits', t => {
  define(t, heal);
  const g = table();
  g.active = 1;
  g.priority = 0;
  g.phase = 'afterAttack';
  assert.equal(g.canAct(0), false);
  compute(g, 0, 1);
  put(g, 0, 'x-reheal', 'grave');
  assert.equal(g.canAct(0), true);
});

test('a player with a pending choice can act; the other cannot', t => {
  define(t, {id: 'x-peek', type: 'Operation', cost: 0, steps: [{op: 'probe', n: 1}]});
  const g = table();
  g.play(0, put(g, 0, 'x-peek', 'hand').uid);
  g.pass(0);
  g.pass(1);
  assert.equal(g.canAct(0), true);
  assert.equal(g.canAct(1), false);
});

test('card conservation counts archived and stacked cards but not tokens', t => {
  define(t, {id: 'x-map', type: 'Operation', cost: 0, reuse: 0, steps: [{op: 'draw', n: 1}]});
  const g = table();
  const before = conserved(g, 0);
  g.createToken(0, 'pt-backdoor');
  const c = put(g, 0, 'x-map', 'grave');
  g.play(0, c.uid, null, {reuse: true});
  assert.equal(conserved(g, 0), before + 1);
  g.pass(0);
  g.pass(1);
  assert.equal(conserved(g, 0), before + 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/rules-flow.test.mjs`
Expected: FAIL. `conserved` is not exported.

- [ ] **Step 3: Implement**

`public/engine.mjs`:

```js
  // Whether a player has anything to do right now: auto-pass skips their response windows otherwise.
  canAct(p) {
    if (this.pending) return this.pending.actor === p;
    const q = this.players[p];
    return (
      q.hand.some(c => this.legal(p, c)) ||
      q.grave.some(c => this.data(c).reuse != null && !this.playIssues(p, c, {reuse: true}).length)
    );
  }
```

`public/app.mjs` (the auto-pass line in `schedule`): replace `!game.players[0].hand.some(c => game.legal(0, c))` with `!game.canAct(0)`.

`tests/helpers/simulate.mjs`, add:

```js
// A player's real cards wherever they are: tokens are not cards, and abilities on the stack are not either.
export function conserved(g, p) {
  const q = g.players[p];
  return (
    q.deck.length +
    q.hand.length +
    q.field.filter(c => !BY_ID[c.id].token).length +
    q.grave.length +
    q.archive.length +
    g.stack.filter(s => s.card && s.p === p).length
  );
}
```

In `tests/engine.test.mjs`, the 100-match test's conservation assertion becomes `assert.equal(conserved(g, p), 60, …)` (import `conserved` next to `playOut`), replacing the inline `total` calculation.

- [ ] **Step 4: Run the whole suite and the checks**

Run: `npm test && npm run typecheck && npx --yes prettier@3.9.9 --check "public/**/*.{mjs,css,html}" "tests/**/*.mjs" serve.cjs`
Expected: all PASS.

- [ ] **Step 5: Check the app still plays**

Start a dev server for this worktree with `preview_start`. Port 4173 may belong to another session, so add a `.claude/launch.json` entry serving this worktree's `public/` with `python3 -m http.server` on a free port, as Plan 1 did. Play a training match through at least three turns, including combat, and check the console has no errors. Nothing should look or behave differently.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/engine.mjs public/app.mjs tests/helpers/simulate.mjs tests/engine.test.mjs tests/rules-flow.test.mjs
git add public/engine.mjs public/app.mjs tests/helpers/simulate.mjs tests/engine.test.mjs tests/rules-flow.test.mjs
git commit -m "Keep auto-pass and card counts correct with choices, tokens and the archive"
```

---

## Finishing

- [ ] Run `npm test && npm run typecheck` and the Prettier check on the branch tip. The golden test must still show the original hash.
- [ ] Use superpowers:finishing-a-development-branch.

## What Plan 3 builds on

Plan 3 writes the 50 cards in this schema. Where a card needs a step or trigger this plan doesn't have, Plan 3 adds it to `OPS`/`ON` with its card's tests. Examples:
- returning a card from discard to the battlefield or hand;
- tapping all opposing units;
- damage that depends on whether the target is tapped;
- returning the source card to hand.

The stack-entry shapes, pending kinds and `defaultChoice` defined here are what Plan 4 carries over the network.
