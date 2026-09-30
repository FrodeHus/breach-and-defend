# Persistent Threats, Plan 4: Play a Friend with the Expansion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make play-a-friend work with the expansion:
- expansion moves (options, abilities, choices) travel between the two browsers;
- each player sees only what they may see;
- the guest's check of host views accepts every legal expansion state;
- the host's private Probe choices stay secret until the match ends, then are audited;
- timeouts answer any pending choice.

First Breach matches keep their exact wire format, logs, digests and audits.

**Architecture:**
- **Protocol** (`public/protocol.mjs`): learns the new actions (`play` with options, `activate`, `choose`); how to flip a view with pending choices, waiting triggers and ability stack entries; how to redact a view; how to validate every expansion shape. It also learns to redact the host's Probe choices from the log. Those follow the mulligan-bottoms pattern: redacted live, committed with a hash salted by the host secret, revealed at the end, and restored and checked by the audit.
- **Match** (`public/match.mjs`): marks log entries that answer a Probe.
- **Session** (`public/session.mjs`): commits, reveals and stores those entries.
- **Seat** (`public/remote.mjs`): sends the new intents.
- **Engine** (`public/engine.mjs`): gives unreleased cards an empty lesson so their events validate.
- The interface for making choices is Plan 5. This plan is proven with the computer opponent driving both seats of a real host–guest session.

**Tech Stack:** Plain ES modules, no dependencies, `node --test` (Node ≥ 22), Prettier 3.9.9, `npm run typecheck` (covers protocol, session, match, remote and audit).

**Spec:** `docs/design/persistent-threats.md`, "Multiplayer (play a friend)". The Plan 2 and Plan 3 follow-ups for Plan 4, at the end of `docs/superpowers/plans/2026-09-30-persistent-threats-2-rules-core.md` and `…-3-cards.md`, are inputs.

## Global Constraints

- First Breach play-a-friend is unchanged: the same actions, log entries, views, digests, reveals and audits. Existing session, audit, protocol and match tests pass unchanged, and so does `tests/first-breach-golden.test.mjs`.
- Spec, hidden information:
  - Each player's deck and the opponent's hand stay hidden.
  - "Probe: the choosing player sees the probed cards; the opponent sees only that a choice is pending and which cards reached discard."
  - Host Probe choices are redacted in the guest's log, "committed to with a hash salted with the host secret, revealed at the end, and checked by the audit".
  - "Uids follow the public deck lists", so no hidden card's uid may appear anywhere in the other player's view or log.
- Spec, timeouts: "Every choice type needs one fixed automatic move, because the audit accepts only the exact `timeoutAction`" — use `game.defaultChoice()`, never `aiChoice()`.
- The guest's clock follows `actor()`: a pending choice belongs to its chooser.
- Peers are untrusted. Host views must match the exact shapes `viewFor` produces. Guest actions carry only whitelisted fields, and the engine checks their values.
- The set stays unreleased. Tests that open an expansion invite set `SETS['persistent-threats'].released = true` and restore it with `t.after`.
- Format only files you change (`npx --yes prettier@3.9.9 --write <files>`), never `npm run format`, and stage only your files. Commit messages: an imperative sentence in sentence case, no prefix.

## Review Focus

1. **The guest never learns the host's hidden cards before the reveal**: not the opponent's hand, either deck, or the host's probed cards and the order kept, whether through a view or a log entry. Tasks 2 and 4 walk every view and log entry of full matches.
2. **Records from before this change still audit.** A First Breach log has no secret entries, and its reveal has no `choices`: the audit is unchanged. Task 4.
3. **A malicious host view** is rejected: prototype keys, unknown choice kinds, oversized arrays, unknown ability ids, extra fields, or markup in prompts. Task 3.
4. **A malicious guest action**, such as a non-boolean `overclock`, unknown option keys, arrays where objects belong, or a choice for someone else, never crashes the host and leaves the match unchanged. Task 1.
5. **A timeout during any kind of pending choice** makes a legal move the audit accepts. Tasks 1 and 5.

---

## File map

| File | Change |
|---|---|
| `public/protocol.mjs` | `actionFields` (+`options`, `abilityId`, `selection`); `playOptions`; `applyAction` `play` options, `activate`, `choose`; `timeoutAction` for pending choices; `flip` for pending/waiting/ability entries; `viewFor` redaction (`pendingView`); `sanitizeView` expansion shapes and `LESSONS` with empty lessons; `redactEntry`/`choiceCommit`/`hostChoices`/`restoreChoices` |
| `public/remote.mjs` | Seat intents: `play` with options, `activate`, `choose` |
| `public/match.mjs` | Log entries answering a Probe are marked `secret: true` |
| `public/session.mjs` | Commits for secret host entries; `reveal()` includes `choices`; the guest stores them |
| `public/audit.mjs` | Restores and verifies revealed choices |
| `public/engine.mjs` | Cast events carry `lesson: d.lesson ?? ''` |
| `tests/helpers/policy.mjs` | `aiIntent(game, p)`: the computer's next move as an action object; `perform` handles `activate`/`choose` |
| `tests/helpers/simulate.mjs` | `aiMatch` accepts `mode: 'versus'` |
| `tests/versus-expansion.test.mjs` (new) | Tasks 1–3 |
| `tests/audit.test.mjs`, `tests/session.test.mjs`, `tests/match.test.mjs` | Tasks 4–5 |

---

### Task 1: Expansion actions over the wire

**Files:**
- Modify: `public/protocol.mjs` (`actionFields`, new `playOptions`, `applyAction`, `timeoutAction`)
- Modify: `public/remote.mjs` (`INTENTS`)
- Modify: `tests/helpers/policy.mjs` (`aiIntent`, `perform`)
- Create: `tests/versus-expansion.test.mjs`

**Interfaces:**
- Produces:
  - Action shapes `{type: 'play', uid, target, options?}`, `{type: 'activate', uid, abilityId, options}` and `{type: 'choose', selection}`.
  - `playOptions(o)`: keeps only `overclock === true`, `reuse === true`, `mode`, `targets` and `costUids`.
  - `timeoutAction(game, p)` returns `{type: 'choose', selection: game.defaultChoice()}` while a choice is pending.
  - `aiIntent(game, p)` returns the action object `game.aiAction(p)` would take, without changing `game`.

- [ ] **Step 1: Add the test helpers**

In `tests/helpers/policy.mjs`, add `import {Game} from '../../public/engine.mjs';` and:

```js
// The computer's next move as an action object: it plays on a copy whose move methods only record.
export function aiIntent(game, p) {
  if (game.phase === 'opening') return {type: 'keep', bottom: []};
  const copy = Game.fromJSON(game.toJSON());
  let action = {type: 'pass'};
  const capture = {
    mulligan: () => (action = {type: 'mulligan'}),
    keep: (bottom = []) => (action = {type: 'keep', bottom}),
    play: (q, uid, target = null, options) => (action = {type: 'play', uid, target, ...(options ? {options} : {})}),
    activate: (q, uid, abilityId, options = {}) => (action = {type: 'activate', uid, abilityId, options}),
    choose: (q, selection) => (action = {type: 'choose', selection}),
    pass: () => (action = {type: 'pass'}),
    attackers: (q, uids) => (action = {type: 'attackers', uids}),
    blockers: (q, assignments) => (action = {type: 'blockers', assignments}),
    discard: uids => (action = {type: 'discard', uids}),
  };
  for (const [name, fn] of Object.entries(capture)) copy[name] = fn;
  copy.aiAction(p);
  return action;
}
```

In `perform`, add:

```js
    case 'activate':
      return g.activate(p, a.uid, a.abilityId, a.options);
    case 'choose':
      return g.choose(p, a.selection);
```

and change the `play` case to `return g.play(p, a.uid, a.target, a.options);`.

- [ ] **Step 2: Write the failing tests**

`tests/versus-expansion.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {actionFields, applyAction, playOptions, timeoutAction} from '../public/protocol.mjs';
import {Seat} from '../public/remote.mjs';
import {compute, put, resolveTop, table} from './helpers/rules.mjs';

const pt = name => CARDS.find(c => c.name === name).id;
const ref = uid => ({kind: 'card', uid});

test('action fields keep options, ability ids and selections, and nothing else', () => {
  assert.deepEqual(
    actionFields({type: 'play', uid: 3, target: null, options: {overclock: true}, junk: 1}),
    {type: 'play', uid: 3, target: null, options: {overclock: true}},
  );
  assert.deepEqual(
    actionFields({type: 'activate', uid: 3, abilityId: 'boost', options: {}}),
    {type: 'activate', uid: 3, abilityId: 'boost', options: {}},
  );
  assert.deepEqual(actionFields({type: 'choose', selection: {pay: false}}), {type: 'choose', selection: {pay: false}});
  assert.deepEqual(actionFields({type: 'play', uid: 3, target: null}), {type: 'play', uid: 3, target: null});
});

test('play options from a peer keep only the fields the engine reads', () => {
  assert.deepEqual(playOptions(undefined), {});
  assert.deepEqual(playOptions([1]), {});
  assert.deepEqual(playOptions({overclock: 'yes', reuse: 1, extra: true}), {});
  assert.deepEqual(playOptions({overclock: true, reuse: true, mode: 1, targets: {t: ref(4)}, costUids: [5]}), {
    overclock: true,
    reuse: true,
    mode: 1,
    targets: {t: ref(4)},
    costUids: [5],
  });
});

test('applyAction plays with options, activates abilities and answers choices', () => {
  const g = table();
  compute(g, 0, 8);
  const foe = put(g, 1, 'b8');
  const c = put(g, 0, pt('Coordinated Pressure'), 'hand');
  applyAction(g, 0, {type: 'play', uid: c.uid, target: null, options: {overclock: true, targets: {t: ref(foe.uid)}}});
  assert.equal(g.stack[0].opts.overclock, true);
  resolveTop(g);
  const u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  applyAction(g, 0, {type: 'activate', uid: b.uid, abilityId: 'boost', options: {targets: {t: ref(u.uid)}}});
  assert.equal(g.stack[0].ability.id, 'boost');
  resolveTop(g);
  applyAction(g, 0, {type: 'play', uid: put(g, 0, pt('Map Trust Relationships'), 'hand').uid, target: null});
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
  assert.throws(() => applyAction(g, 1, {type: 'choose', selection: {discard: [], order: g.pending.options}}), /turn/);
  applyAction(g, 0, {type: 'choose', selection: {discard: [], order: g.pending.options}});
  assert.equal(g.pending, null);
});

test('malformed options from a peer are rejected by the engine and change nothing', () => {
  const g = table();
  compute(g, 0, 6);
  const c = put(g, 0, pt('Coordinated Pressure'), 'hand');
  const before = JSON.stringify(g.toJSON());
  for (const options of [
    {targets: 'x'},
    {targets: {t: 7}},
    {targets: {__proto__: {t: 1}}},
    {mode: 'constructor'},
    {costUids: 'all'},
  ])
    assert.throws(() => applyAction(g, 0, {type: 'play', uid: c.uid, target: null, options}));
  assert.throws(() => applyAction(g, 0, {type: 'activate', uid: 999, abilityId: 'boost', options: []}));
  assert.throws(() => applyAction(g, 0, {type: 'choose', selection: null}));
  assert.equal(JSON.stringify(g.toJSON()), before);
});

test('a timeout answers a pending choice with its fixed automatic move', () => {
  const g = table();
  compute(g, 0, 1);
  applyAction(g, 0, {type: 'play', uid: put(g, 0, pt('Map Trust Relationships'), 'hand').uid, target: null});
  resolveTop(g);
  const t = timeoutAction(g, 0);
  assert.deepEqual(t, {type: 'choose', selection: g.defaultChoice()});
  applyAction(g, 0, t);
  assert.equal(g.pending, null);
});

test('a seat sends expansion moves as intents', () => {
  const sent = [];
  const seat = new Seat(a => sent.push(a));
  seat.update({view: table().toJSON()});
  seat.game.play(0, 5, null, {overclock: true});
  seat.game.play(0, 6);
  seat.game.activate(0, 7, 'boost', {targets: {t: ref(8)}});
  seat.game.choose(0, {pay: true});
  assert.deepEqual(sent, [
    {type: 'play', uid: 5, target: null, options: {overclock: true}},
    {type: 'play', uid: 6, target: null},
    {type: 'activate', uid: 7, abilityId: 'boost', options: {targets: {t: ref(8)}}},
    {type: 'choose', selection: {pay: true}},
  ]);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/versus-expansion.test.mjs`
Expected: FAIL. `playOptions` is not exported.

- [ ] **Step 4: Implement**

`public/protocol.mjs`:

```js
export const actionFields = ({type, uid, target, uids, assignments, bottom, options, abilityId, selection}) =>
  Object.fromEntries(
    Object.entries({type, uid, target, uids, assignments, bottom, options, abilityId, selection}).filter(
      ([, v]) => v !== undefined,
    ),
  );

// From an untrusted peer: only the option fields the engine reads. The engine checks their values.
export function playOptions(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  if (o.overclock === true) out.overclock = true;
  if (o.reuse === true) out.reuse = true;
  for (const k of ['mode', 'targets', 'costUids']) if (Object.hasOwn(o, k)) out[k] = o[k];
  return out;
}
```

In `applyAction`:

```js
    case 'play':
      return game.play(by, a.uid, a.target ?? null, playOptions(a.options));
    case 'activate':
      return game.activate(by, a.uid, a.abilityId, playOptions(a.options));
    case 'choose':
      return game.choose(by, a.selection);
```

At the top of `timeoutAction`:

```js
  // A pending choice belongs to its chooser; the clock answers with the fixed automatic move.
  if (game.pending) return {type: 'choose', selection: game.defaultChoice()};
```

`public/remote.mjs`, in `INTENTS`:

```js
  play: (p, uid, target = null, options) => ({type: 'play', uid, target, ...(options ? {options} : {})}),
  activate: (p, uid, abilityId, options = {}) => ({type: 'activate', uid, abilityId, options}),
  choose: (p, selection) => ({type: 'choose', selection}),
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS. The existing session and audit tests are unchanged, because First Breach actions carry no new fields.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/protocol.mjs public/remote.mjs tests/helpers/policy.mjs tests/versus-expansion.test.mjs
git add public/protocol.mjs public/remote.mjs tests/helpers/policy.mjs tests/versus-expansion.test.mjs
git commit -m "Send expansion moves and choices between the two players"
```

---

### Task 2: Flipping and redacting expansion views

**Files:**
- Modify: `public/protocol.mjs` (`flip`, `viewFor`, new `pendingView`)
- Modify: `tests/helpers/simulate.mjs` (`aiMatch` `mode`)
- Modify: `tests/versus-expansion.test.mjs` (append)

**Interfaces:**
- Produces a view's `pending` shape: `{id, actor, kind, private, prompt, min, max, options, data?, resolving?, count?, cards?}`.
  - `resolving` is the stack entry being resolved (from `pending.frame.entry`).
  - `data` keeps only `{uid, amount}` for `pay` and `{trigger}` for `targets`.
  - A private choice seen by the other player has `options: []` and `count: n`.
  - The chooser of a Probe also gets `cards: [{id, uid}]`.
  - Views never carry `queue`, or a `frame` (the host resumes it).
- `aiMatch(seed, {mode: 'versus', …})` keeps both players' opening hands.

- [ ] **Step 1: Let the match driver play versus matches**

In `aiMatch`, add `mode = 'solo'` to the options, pass it to `new Game(faction, rng, {first, pool, mode})`, and replace `g.keep();` with:

```js
  g.keep([], 0);
  if (mode === 'versus') g.keep([], 1);
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/versus-expansion.test.mjs` (extend its imports with `EXPANSION_POOL` from cards, `flip`/`viewFor` from protocol, and `aiMatch` from `./helpers/simulate.mjs`):

```js
// Every uid a player may not know: the other player's hand, both decks, minus what their own Probe shows them.
function hiddenUids(g, p) {
  const out = new Set();
  for (const q of g.players) for (const c of q.deck) out.add(c.uid);
  for (const c of g.players[1 - p].hand) out.add(c.uid);
  if (g.pending?.kind === 'probe' && g.pending.actor === p) for (const u of g.pending.options) out.delete(u);
  return out;
}
// Every uid a view reveals: any `uid` field, and the numbers in a pending choice's options.
function shownUids(v) {
  const out = [];
  const walk = x => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    for (const [k, val] of Object.entries(x)) {
      if (k === 'uid' && Number.isInteger(val)) out.push(val);
      else walk(val);
    }
  };
  walk(v);
  for (const o of v.pending?.options ?? []) if (Number.isInteger(o)) out.push(o);
  return out;
}
const everyView = (check, games = 4) => {
  for (let seed = 1; seed <= games; seed++)
    aiMatch(seed, {
      faction: seed % 2 ? 'red' : 'blue',
      first: seed & 1,
      pool: EXPANSION_POOL,
      mode: 'versus',
      check: g => {
        for (const p of [0, 1]) check(g, p, viewFor(g, p));
      },
    });
};

test('views of expansion matches never reveal a hidden card', () => {
  everyView((g, p, v) => {
    const hidden = hiddenUids(g, p);
    for (const u of shownUids(v)) assert.ok(!hidden.has(u), `view for ${p} reveals hidden uid ${u}`);
  });
});

test('flipping a view twice gives it back, with pending, waiting and ability entries included', () => {
  everyView((g, p, v) => assert.deepEqual(flip(flip(v)), v));
});

test('a private choice shows its chooser the cards and the other player only a count', () => {
  const g = table();
  compute(g, 0, 1);
  applyAction(g, 0, {type: 'play', uid: put(g, 0, pt('Map Trust Relationships'), 'hand').uid, target: null});
  resolveTop(g);
  const mine = viewFor(g, 0).pending,
    theirs = viewFor(g, 1).pending;
  assert.deepEqual(
    mine.cards.map(c => c.uid),
    g.pending.options,
  );
  assert.equal(
    mine.cards.every(c => typeof c.id === 'string'),
    true,
  );
  assert.deepEqual([theirs.options, theirs.count, theirs.actor], [[], 2, 1]);
  assert.equal(Object.hasOwn(theirs, 'cards'), false);
  for (const v of [mine, theirs]) {
    assert.equal(Object.hasOwn(v, 'frame'), false);
    assert.equal(v.resolving.card.id, pt('Map Trust Relationships'));
  }
  assert.equal(Object.hasOwn(viewFor(g, 0), 'queue'), false);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/versus-expansion.test.mjs`
Expected: FAIL. Views leak Probe uids, have no `cards`/`count`, and don't flip `pending.actor`.

- [ ] **Step 4: Implement**

`public/protocol.mjs`:

```js
const flipEntry = s => ({...s, p: 1 - s.p, target: flipTarget(s.target)});
export function flip(state) {
  const f = structuredClone(state);
  f.players.reverse();
  f.mulls.reverse();
  f.kept.reverse();
  f.casts?.reverse();
  for (const k of ['active', 'priority', 'first', 'winner']) f[k] = other(f[k]);
  f.stack = f.stack.map(flipEntry);
  if (f.pending) {
    f.pending.actor = 1 - f.pending.actor;
    if (f.pending.resolving) f.pending.resolving = flipEntry(f.pending.resolving);
  }
  if (f.waiting) f.waiting = f.waiting.map(w => ({...w, p: 1 - w.p}));
  return f;
}

// What a player may see of the open choice. Never the other player's private options (they are hidden card
// uids), and never the resolving frame's internals: the host resumes it, and a view only needs the card.
function pendingView(state, p) {
  const {frame, data, ...c} = state.pending;
  if (frame?.entry) c.resolving = frame.entry;
  if (data && c.kind === 'pay') c.data = {uid: data.uid, amount: data.amount};
  if (data && c.kind === 'targets') c.data = {trigger: data.trigger};
  if (c.private && c.actor !== p) {
    c.count = c.options.length;
    c.options = [];
  } else if (c.kind === 'probe') {
    const deck = state.players[c.actor].deck;
    c.cards = c.options.map(u => ({id: deck.find(d => d.uid === u).id, uid: u}));
  }
  return c;
}

export function viewFor(game, p) {
  const {rng, uid, queue, ...state} = game.toJSON();
  state.uid = 0; // Sentinel: cards start at 1, never a card uid; allows Game.fromJSON to mint new cards.
  if (state.pending) state.pending = pendingView(state, p);
  state.players = state.players.map((q, i) => ({
    ...q,
    deck: q.deck.map(hidden),
    hand: i === p ? q.hand : q.hand.map(hidden),
  }));
  return p === 0 ? state : flip(state);
}
```

`queue` is always empty between actions (Plan 2's `settle` drains it). Views drop it so they never depend on that.

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS. First Breach views are unchanged, since they have no pending choice, waiting triggers or queue.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/protocol.mjs tests/helpers/simulate.mjs tests/versus-expansion.test.mjs
git add public/protocol.mjs tests/helpers/simulate.mjs tests/versus-expansion.test.mjs
git commit -m "Show each player only their own side of a private choice"
```

---

### Task 3: Checking expansion views from the host

**Files:**
- Modify: `public/protocol.mjs` (`LESSONS`, `sanitizeView`)
- Modify: `public/engine.mjs` (the cast event's lesson)
- Modify: `tests/versus-expansion.test.mjs` (append)

**Interfaces:**
- Produces a `sanitizeView` that accepts, with exact shapes:
  - optional view keys `pending`, `waiting`, `pool` and `casts`;
  - an optional player `archive`;
  - optional card fields `kw`, `locked` and `used`;
  - three stack-entry shapes: First Breach `{card, p, target}`, rule spell `{card, opts, p, target: null}`, and ability `{ability, opts, p, target: null}`.
- Events for unreleased cards carry `lesson: ''`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/versus-expansion.test.mjs` (import `sanitizeView`):

```js
test('every view of complete expansion matches passes the guest’s check', () => {
  everyView((g, p, v) => assert.doesNotThrow(() => sanitizeView(v), `turn ${g.turn} view for ${p}`));
});

test('a host view with a malformed expansion shape is rejected', () => {
  const g = table();
  g.mode = 'versus';
  compute(g, 0, 1);
  applyAction(g, 0, {type: 'play', uid: put(g, 0, pt('Map Trust Relationships'), 'hand').uid, target: null});
  resolveTop(g);
  g.createToken(0, 'pt-backdoor');
  const good = viewFor(g, 1);
  assert.doesNotThrow(() => sanitizeView(good));
  const bad = [
    v => (v.pending.kind = 'steal'),
    v => (v.pending.prompt = '<img src=x>'),
    v => (v.pending.options = Array(100).fill(1)),
    v => (v.pending.extra = 1),
    v => (v.pending.count = -1),
    v => (v.pending.resolving.card.id = 'nope'),
    v => (v.pending.resolving.opts.overclock = 'yes'),
    v => (v.pending.resolving.opts.targets = {'<b>': {kind: 'card', uid: 1}}),
    v => (v.waiting = [{id: 1, p: 0, ability: {card: 'pt-backdoor', uid: 1, id: 'nope'}}]),
    v => (v.players[0].archive = [{hidden: true}]),
    v => (v.players[1].field[1].kw = ['flying']),
    v => (v.players[1].field[1].locked = false),
    v => v.stack.push({ability: {card: 'r1', uid: 1, id: 'x'}, opts: {targets: {}}, p: 0, target: null}),
    v => (v.queue = []),
  ];
  for (const [i, mutate] of bad.entries()) {
    const v = structuredClone(good);
    mutate(v);
    assert.throws(() => sanitizeView(v), /Invalid/, `mutation ${i}`);
  }
});
```

In `bad`, `field[1]` of the flipped view is player 0's Backdoor from the guest's side. If the indices differ in practice, find the Backdoor with `.find(c => c.id === 'pt-backdoor')` instead; the point is a real expansion card object.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/versus-expansion.test.mjs`
Expected: FAIL. `sanitizeView` rejects the new keys (`view fields`) and expansion events (`event`).

- [ ] **Step 3: Give unreleased cards an empty lesson**

`public/engine.mjs`, in `play`: `this.events.push({name: d.name, lesson: d.lesson, faction: d.faction});` becomes `this.events.push({name: d.name, lesson: d.lesson ?? '', faction: d.faction});`. First Breach lessons are always strings, so nothing changes for them.

`public/protocol.mjs`: `const LESSONS = new Set(CARDS.map(c => JSON.stringify([c.name, c.lesson, c.faction])));` becomes `… [c.name, c.lesson ?? '', c.faction] …`.

- [ ] **Step 4: Validate expansion shapes**

`public/protocol.mjs`: import `KEYWORDS` from `./cards.mjs`. In `sanitizeView`, replace the `card` checker, the view-keys line, the stack loop and the player loop's `obj(q, PLAYER_KEYS, …)`, and add the new checkers. The complete new pieces:

```js
  const KEY = /^[a-z]{1,16}$/;
  const OPTIONAL_CARD_KEYS = ['kw', 'locked', 'used'];
  const card = (c, what) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) fail(what);
    obj(c, [...CARD_KEYS, ...OPTIONAL_CARD_KEYS.filter(k => Object.hasOwn(c, k))].sort(), what);
    if (typeof c.id !== 'string' || !Object.hasOwn(BY_ID, c.id)) fail(`${what} id`);
    int(c.uid, `${what} uid`, 1);
    bool(c.tapped, what);
    bool(c.sick, what);
    num(c.damage, what);
    num(c.bp, what);
    num(c.bt, what);
    if (Object.hasOwn(c, 'kw')) for (const k of arr(c.kw, what, 8)) if (!Object.hasOwn(KEYWORDS, k)) fail(`${what} keyword`);
    if (Object.hasOwn(c, 'locked') && c.locked !== true) fail(what);
    if (Object.hasOwn(c, 'used')) for (const k of arr(c.used, what, 8)) if (typeof k !== 'string' || !KEY.test(k)) fail(what);
  };
  const ref = (t, what) => {
    if (t?.kind === 'player') {
      obj(t, ['kind', 'p'], what);
      seat(t.p, what);
    } else if (t?.kind === 'card' || t?.kind === 'spell') {
      obj(t, ['kind', 'uid'], what);
      int(t.uid, what, 1);
    } else fail(what);
  };
  const targetMap = (m, what) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) fail(what);
    for (const [k, v] of Object.entries(m)) {
      if (!KEY.test(k)) fail(what);
      if (Array.isArray(v)) for (const t of arr(v, what, 4)) ref(t, what);
      else ref(v, what);
    }
  };
  const opts = (o, what) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail(what);
    if (Object.keys(o).some(k => !['targets', 'overclock', 'mode', 'reuse'].includes(k))) fail(`${what} options`);
    targetMap(o.targets, `${what} targets`);
    if (Object.hasOwn(o, 'overclock') && o.overclock !== true) fail(what);
    if (Object.hasOwn(o, 'reuse') && o.reuse !== true) fail(what);
    if (Object.hasOwn(o, 'mode') && (!Number.isInteger(o.mode) || o.mode < 0 || o.mode > 9)) fail(what);
  };
  const abilityRef = (a, what) => {
    obj(a, ['card', 'id', 'uid'], what);
    if (typeof a.card !== 'string' || !Object.hasOwn(BY_ID, a.card)) fail(what);
    if (!BY_ID[a.card].abilities?.some(x => x.id === a.id)) fail(what);
    int(a.uid, what, 1);
  };
  const entry = (s, what) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) fail(what);
    if (Object.hasOwn(s, 'ability')) {
      obj(s, ['ability', 'opts', 'p', 'target'], what);
      abilityRef(s.ability, what);
      opts(s.opts, what);
      if (s.target !== null) fail(what);
    } else if (Object.hasOwn(s, 'opts')) {
      obj(s, ['card', 'opts', 'p', 'target'], what);
      card(s.card, what);
      opts(s.opts, what);
      if (s.target !== null) fail(what);
    } else {
      obj(s, ['card', 'p', 'target'], what);
      card(s.card, what);
      if (s.target !== null) ref(s.target, `${what} target`);
    }
    seat(s.p, `${what} player`);
  };
  const KINDS = ['probe', 'discard', 'pay', 'optional', 'order', 'targets'];
  const pending = c => {
    const extra = ['data', 'resolving', 'count', 'cards'].filter(k => c && typeof c === 'object' && Object.hasOwn(c, k));
    obj(c, ['actor', 'id', 'kind', 'max', 'min', 'options', 'private', 'prompt', ...extra].sort(), 'pending');
    int(c.id, 'pending', 1);
    seat(c.actor, 'pending actor');
    if (!KINDS.includes(c.kind)) fail('pending kind');
    bool(c.private, 'pending');
    text(c.prompt, 'pending prompt');
    int(c.min, 'pending');
    int(c.max, 'pending');
    const options = arr(c.options, 'pending options', 60);
    if (c.kind === 'pay') {
      if (!options.every(o => typeof o === 'boolean')) fail('pending options');
    } else if (c.kind === 'optional') {
      for (const o of options) if (o !== null) int(o, 'pending option', 1);
    } else if (c.kind === 'targets') {
      for (const o of options) {
        obj(o, ['candidates', 'key', 'optional', 'upTo'], 'pending option');
        if (!KEY.test(o.key)) fail('pending option');
        bool(o.optional, 'pending option');
        int(o.upTo, 'pending option');
        for (const t of arr(o.candidates, 'pending option', 60)) ref(t, 'pending option');
      }
    } else for (const o of options) int(o, 'pending option', 1);
    if (Object.hasOwn(c, 'count')) {
      int(c.count, 'pending count');
      if (!c.private || options.length) fail('pending count');
    }
    if (Object.hasOwn(c, 'cards')) {
      if (c.kind !== 'probe') fail('pending cards');
      for (const x of arr(c.cards, 'pending cards', 10)) {
        obj(x, ['id', 'uid'], 'pending card');
        if (typeof x.id !== 'string' || !Object.hasOwn(BY_ID, x.id)) fail('pending card');
        int(x.uid, 'pending card', 1);
      }
    }
    if (Object.hasOwn(c, 'data')) {
      if (c.kind === 'pay') {
        obj(c.data, ['amount', 'uid'], 'pending data');
        int(c.data.amount, 'pending data');
        int(c.data.uid, 'pending data', 1);
      } else if (c.kind === 'targets') {
        obj(c.data, ['trigger'], 'pending data');
        int(c.data.trigger, 'pending data', 1);
      } else fail('pending data');
    }
    if (Object.hasOwn(c, 'resolving')) entry(c.resolving, 'resolving entry');
  };
```

The view-keys line becomes:

```js
  const optionalKeys = ['pool', 'casts', 'pending', 'waiting'].filter(
    k => !!view && typeof view === 'object' && Object.hasOwn(view, k),
  );
  obj(view, [...VIEW_KEYS, ...optionalKeys].sort(), 'view');
```

Keep the existing `pool` and `casts` value checks, now keyed off `optionalKeys.includes(...)`, and add:

```js
  if (Object.hasOwn(view, 'pending')) pending(view.pending);
  if (Object.hasOwn(view, 'waiting'))
    for (const w of arr(view.waiting, 'waiting', 20)) {
      const extra = ['ordered', 'targets'].filter(k => w && typeof w === 'object' && Object.hasOwn(w, k));
      obj(w, ['ability', 'id', 'p', ...extra].sort(), 'waiting');
      int(w.id, 'waiting', 1);
      seat(w.p, 'waiting');
      abilityRef(w.ability, 'waiting');
      if (Object.hasOwn(w, 'ordered') && w.ordered !== true) fail('waiting');
      if (Object.hasOwn(w, 'targets')) targetMap(w.targets, 'waiting targets');
    }
```

The stack loop becomes `for (const s of arr(view.stack, 'stack')) entry(s, 'stack entry');`. In the player loop:

```js
    obj(q, [...PLAYER_KEYS, ...(Object.hasOwn(q ?? {}, 'archive') ? ['archive'] : [])].sort(), 'player');
    …
    if (Object.hasOwn(q, 'archive')) for (const c of arr(q.archive, 'archive')) card(c, 'archive card');
```

Remove the old `pooled`/`counted` variables once `optionalKeys` replaces them. Keep every existing First Breach check as it is.

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS, including the existing protocol mutation tests and the golden test.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/protocol.mjs public/engine.mjs tests/versus-expansion.test.mjs
git add public/protocol.mjs public/engine.mjs tests/versus-expansion.test.mjs
git commit -m "Check every expansion shape in a host's view"
```

---

### Task 4: Keeping the host's Probe choices secret until the reveal

**Files:**
- Modify: `public/match.mjs` (`apply`: `secret` marker)
- Modify: `public/protocol.mjs` (`redactEntry`, new `choiceCommit`, `hostChoices`, `restoreChoices`)
- Modify: `public/session.mjs` (`redact`, `reveal`, guest `revealed`)
- Modify: `public/audit.mjs` (`choices` parameter; restore and verify)
- Modify: `tests/audit.test.mjs`, `tests/versus-expansion.test.mjs`

**Interfaces:**
- Produces:
  - Log entries `{…, secret: true}` for any `choose` that answers a Probe.
  - For the host's secret entries, the guest receives `{…, secret: true, selectionCommit}` without `selection`.
  - `reveal()` returns `{hostSecret, bottoms, choices: {n: selection}}`.
  - `audit({…, choices})` restores the choices and checks each commit.

- [ ] **Step 1: Write the failing tests**

Append to `tests/versus-expansion.test.mjs` (import `redactEntry`, `choiceCommit`, `hostChoices`, `restoreChoices`):

```js
test('the host’s Probe answers are redacted in the guest’s log, then restored from the reveal', async () => {
  const log = [
    {type: 'pass', n: 1, by: 0, seq: null, timeout: false},
    {type: 'choose', selection: {discard: [], order: [9, 8]}, n: 2, by: 0, seq: null, timeout: false, secret: true},
    {type: 'choose', selection: {discard: [7], order: []}, n: 3, by: 1, seq: 4, timeout: false, secret: true},
    {type: 'choose', selection: {pay: true}, n: 4, by: 0, seq: null, timeout: false},
  ];
  const received = log.map(redactEntry);
  assert.equal(Object.hasOwn(received[1], 'selection'), false);
  assert.deepEqual(received[2], log[2], 'the guest’s own answers are not redacted');
  assert.deepEqual(received[3], log[3], 'only Probe answers are secret');
  assert.deepEqual(hostChoices(log), {2: {discard: [], order: [9, 8]}});
  assert.deepEqual(restoreChoices(received, hostChoices(log)), log);
  assert.equal(restoreChoices(received, {}), null);
  assert.equal(restoreChoices(received, {2: 'x'}), null);
  const a = await choiceCommit('s', 2, {discard: [], order: [9, 8]}),
    b = await choiceCommit('s', 2, {discard: [], order: [8, 9]});
  assert.notEqual(a, b);
});
```

In `tests/audit.test.mjs`:
- Give `record` a pick parameter: `async function record(tamper = () => {}, seed = 1, pool = undefined, pick = choose)`, and use `pick(m.game, p)` where it calls `choose(m.game, p)`.
- Import `aiIntent` from `./helpers/policy.mjs`, `EXPANSION_POOL` from cards, and `choiceCommit`/`hostChoices`/`redactEntry` from protocol.

Then append:

```js
// What a guest really holds for an expansion match: the host's Probe answers redacted and committed.
async function expansionRecord(seed = 1) {
  const rec = await record(undefined, seed, EXPANSION_POOL, aiIntent);
  const full = rec.log;
  rec.log = await Promise.all(
    full.map(async e =>
      e.by === 0 && e.secret ? {...redactEntry(e), selectionCommit: await choiceCommit(rec.hostSecret, e.n, e.selection)} : e,
    ),
  );
  rec.choices = hostChoices(full);
  return rec;
}

test('an expansion match with secret host Probe answers verifies after the reveal', async () => {
  const rec = await expansionRecord();
  assert.ok(
    rec.log.some(e => e.by === 0 && e.secret),
    'the host probed at least once',
  );
  assert.deepEqual(await audit(rec), {result: 'verified'});
});

test('a host that changes a Probe answer after the match, or never reveals it, is caught', async () => {
  const rec = await expansionRecord();
  const n = Number(Object.keys(rec.choices)[0]);
  const changed = structuredClone(rec);
  const sel = changed.choices[n];
  changed.choices[n] = sel.order.length > 1 ? {...sel, order: [...sel.order].reverse()} : {discard: sel.order, order: sel.discard};
  assert.equal((await audit(changed)).result, 'tampered');
  assert.equal((await audit({...rec, choices: {}})).result, 'tampered');
});

test('a record from before secret answers audits exactly as before', async () => {
  const rec = await record();
  assert.equal(
    rec.log.some(e => e.secret),
    false,
  );
  assert.deepEqual(await audit(rec), {result: 'verified'});
});
```

If `expansionRecord(1)`'s host never probes, try seeds 2–5 and keep the first that does (the assertion makes the precondition explicit).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/versus-expansion.test.mjs tests/audit.test.mjs`
Expected: FAIL. The new exports don't exist, and no entry is marked `secret`.

- [ ] **Step 3: Mark Probe answers in the log**

`public/match.mjs`, in `apply`, before `applyAction`:

```js
    // A Probe answer names hidden cards: the guest sees the host's only after the match (see redactEntry).
    const secret = action?.type === 'choose' && this.game.pending?.kind === 'probe';
```

and the entry becomes `{...actionFields(action), n: this.log.length + 1, by, seq, timeout, ...(secret ? {secret: true} : {})}`.

- [ ] **Step 4: Redact, commit and restore**

`public/protocol.mjs`:

```js
export const redactEntry = e => {
  if (!e || e.by !== 0) return e;
  if (e.type === 'keep') {
    const {bottom, ...rest} = e;
    return {...rest, bottomCount: Array.isArray(bottom) ? bottom.length : 0};
  }
  // A host's Probe answer says which hidden cards it kept and in what order: the guest learns it at the reveal.
  if (e.secret) {
    const {selection, ...rest} = e;
    return rest;
  }
  return e;
};
export const choiceCommit = (hostSecret, n, selection) =>
  sha256Hex(`${hostSecret}:choice:${n}:${canonical(selection ?? null)}`);
export const hostChoices = log =>
  Object.fromEntries(log.filter(e => e.by === 0 && e.secret).map(e => [e.n, e.selection]));
// Returns the full log, or null when a redacted answer was not revealed.
export function restoreChoices(log, choices) {
  const out = [];
  for (const e of log) {
    if (!e || e.by !== 0 || !e.secret || Object.hasOwn(e, 'selection')) {
      out.push(e);
      continue;
    }
    const selection = choices && Object.hasOwn(choices, e.n) ? choices[e.n] : null;
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
    const {selectionCommit: _, ...rest} = e;
    out.push({...rest, selection});
  }
  return out;
}
```

(Keep the existing mulligan comment above `redactEntry`, extended with one line about Probe answers.)

`public/session.mjs`:
- Import `choiceCommit` and `hostChoices`.
- In the host constructor, next to `record.bottomCommits ??= {};`, add `record.choiceCommits ??= {};`.
- `redact`:

```js
  async redact(entry) {
    const out = redactEntry(entry);
    if (out?.bottomCount) {
      const commits = this.record.bottomCommits;
      commits[entry.n] ??= await bottomCommit(this.record.hostSecret, entry.n, entry.bottom);
      return {...out, bottomCommit: commits[entry.n]};
    }
    if (out?.secret && out.by === 0) {
      const commits = this.record.choiceCommits;
      commits[entry.n] ??= await choiceCommit(this.record.hostSecret, entry.n, entry.selection);
      return {...out, selectionCommit: commits[entry.n]};
    }
    return out;
  }
```

- `reveal()` returns `{hostSecret: this.record.hostSecret, bottoms: hostBottoms(this.match.log), choices: hostChoices(this.match.log)}`.
- The guest's `revealed(reveal)`: after it sets `r.bottoms`, add `r.choices = reveal?.choices && typeof reveal.choices === 'object' ? reveal.choices : null;`.

`public/audit.mjs`:
- Import `choiceCommit` and `restoreChoices`.
- Add `choices = null` to the parameters.
- After the bottoms check loop:

```js
  const restored = restoreChoices(log, choices);
  if (!restored)
    return tampered(1, 'Your opponent didn’t reveal the private choices they made during the match.');
  for (const [i, e] of log.entries()) {
    if (!e?.secret || e.by !== 0 || Object.hasOwn(e, 'selection')) continue;
    if (typeof e.selectionCommit !== 'string' || e.selectionCommit !== (await choiceCommit(hostSecret, e.n, restored[i].selection)))
      return tampered(1, 'Your opponent changed a private choice after making it.');
  }
```

Then replay `restored` instead of `log` (rename so the replay loop uses the fully restored log).

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS. First Breach records have no `secret` entries, so `restoreChoices` returns them unchanged.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/match.mjs public/protocol.mjs public/session.mjs public/audit.mjs tests/audit.test.mjs tests/versus-expansion.test.mjs
git add public/match.mjs public/protocol.mjs public/session.mjs public/audit.mjs tests/audit.test.mjs tests/versus-expansion.test.mjs
git commit -m "Keep the host's Probe choices secret until the match is audited"
```

---

### Task 5: A complete play-a-friend expansion match

**Files:**
- Modify: `tests/session.test.mjs`, `tests/match.test.mjs` (append)

This task proves the whole path end to end. The tests should pass against Tasks 1–4. A failure here is a real integration bug: fix its cause in the module at fault, add a focused regression test next to that module's tests, and never loosen these assertions.

- [ ] **Step 1: Write the tests**

Append to `tests/session.test.mjs` (import `SETS` and `EXPANSION_POOL` from cards, and `aiIntent` from `./helpers/policy.mjs`):

```js
test('a complete expansion match between two browsers ends verified for both', async t => {
  SETS['persistent-threats'].released = true;
  t.after(() => (SETS['persistent-threats'].released = false));
  const ctx = await start(await pair({pool: EXPANSION_POOL}));
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 6000, aiIntent);
  assert.notEqual(ctx.host.seat.game.winner, null, 'the match finished');
  await settle(ctx);
  assert.equal(ctx.guest.status, 'ended');
  assert.ok(
    ctx.host.match.log.some(e => e.type === 'choose'),
    'choices crossed the wire',
  );
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
  assert.deepEqual(ctx.host.audit, {result: 'verified'});
});
```

`drive` swallows rejected moves. If the match never finishes, log the rejected actions with a temporary `.catch(e => console.error(e))` while debugging, and remove it afterwards.

Append to `tests/match.test.mjs` (import `runningClock` if not already imported, plus `table`/`put`/`compute`/`resolveTop` from `./helpers/rules.mjs` and `CARDS`):

```js
test('a pending choice runs its chooser’s clock', () => {
  const g = table();
  g.pending = {id: 1, actor: 1, kind: 'pay', private: false, prompt: 'Pay 2', min: 1, max: 1, options: [true, false]};
  assert.equal(runningClock({turn: g.turn, turnLeft: 1, responseLeft: 1}, g, false), 'responseLeft');
  g.pending.actor = 0;
  assert.equal(runningClock({turn: g.turn, turnLeft: 1, responseLeft: 1}, g, false), 'turnLeft');
});
```

Append a timeout test to `tests/session.test.mjs`, next to the existing timeout tests, and follow their pattern for advancing the fake clock. In an expansion match, drive until the guest has a pending choice. Stop driving, advance the clock past `RESPONSE_MS` (or `TURN_MS` if the guest is active), and let the host expire it. Then assert:
- the last host log entry has `timeout: true` and `type: 'choose'`;
- its selection equals the `defaultChoice` of the game before the timeout;
- the match continues;
- the eventual audit is verified.

Structure the test the way the existing timeout tests in that file do, reusing their `fakeTime` helpers.

- [ ] **Step 2: Run the tests**

Run: `node --test tests/session.test.mjs tests/match.test.mjs`
Expected: PASS. If they fail, see the task introduction.

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx --yes prettier@3.9.9 --write tests/session.test.mjs tests/match.test.mjs
git add tests/session.test.mjs tests/match.test.mjs
git commit -m "Play a complete expansion match between two browsers"
```

---

## Finishing

- [ ] Run `npm test && npm run typecheck` and the Prettier check on the branch tip.
- [ ] Append a "Follow-ups" section to this plan for Plans 5 and 6. At minimum:
  - the interface for pending choices in versus (Plan 5);
  - the lobby and recap wording for a verified expansion match;
  - anything the reviews defer.
- [ ] Use superpowers:finishing-a-development-branch.
