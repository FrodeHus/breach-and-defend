# Persistent Threats, Plan 3: The Cards, Decks and Computer Opponent

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write all 50 Persistent Threats cards as rule data, each with a rules test. Build the expansion card pool with its two decks. Teach the computer opponent to play the new cards. Prove complete seeded matches on the expansion pool finish without deadlocks or lost cards. The set stays unreleased, so players see nothing yet.

**Architecture:**
- The card data lives in a new module, `public/persistent-threats.mjs`: plain objects in the schema from Plan 2, with no imports. `public/cards.mjs` registers them into `CARDS`/`BY_ID` under the unreleased `persistent-threats` set, with their explicit `pt-r01`… ids.
- The few engine features the cards need that Plan 2 didn't have come first:
  - returning a card from discard;
  - tapping all opposing units;
  - damage that depends on whether the target is tapped;
  - an end-step condition;
  - a dependent archive target.
- The computer opponent is generalised to `aiAction(p)`. It gains plans for rule cards, token abilities and choices, while First Breach play stays byte-identical (the golden test).

**Tech Stack:** Plain ES modules, no dependencies, `node --test` (Node ≥ 22), Prettier 3.9.9.

**Spec:** `docs/design/persistent-threats.md`: "Red cards", "Blue cards", "Persistent Threats decks", "Balance review and release checks". The Plan 2 follow-ups at the end of `docs/superpowers/plans/2026-09-30-persistent-threats-2-rules-core.md` are part of this plan's input.

## Global Constraints

- IDs `pt-r01`…`pt-r25` and `pt-b01`…`pt-b25` in the design's order. First Breach ids `r0`–`r24`/`b0`–`b24` never change.
- The set stays `released: false`. No lore, art or interface work (Plans 5 and 6), and nothing changes for players.
- Card counts per faction: 2 Infrastructure, 10 Units, 5 Operations, 5 Responses, 2 Tools, 1 Control.
- Game terms are Backdoor, Indicator, Probe, Overclock, Reuse, retire, archive, and "is defeated". Keywords are Rapid deploy (`rapid`), Always-on (`alwaysOn`), Stealth, Detection, Overflow, Recharge and Firewall.
- Deck rules: one faction, exactly 60 cards, at most two copies of each card other than the faction's basic First Breach Infrastructure. The deck lists are exactly the design's tables.
- tests/first-breach-golden.test.mjs must pass unchanged after every task.
- Format only files you change (`npx --yes prettier@3.9.9 --write <files>`). Never run `npm run format`, and stage only your files. Other sessions edit the main checkout, so work only in this worktree.
- Commit messages: an imperative sentence in sentence case, with no prefix.

## Review Focus

1. **No card can stall a match.** A trigger or ability with no sensible target, or a choice the computer must make, never deadlocks. Tested by Task 8's seeded matches, which fail on any exception or unfinished match.
2. **Saving and restoring mid-match**, with tokens, archive and pending choices present, yields identical state. Task 8 round-trips every 25 actions.
3. **A card returned from discard is a new object**: new uid, new-arrival delay, nothing carried over. Tested in Tasks 1 and 5.
4. **Card conservation across full matches with tokens and the archive:** 60 real cards per player at every checkpoint. Tested in Task 8.
5. **The unreleased set is offered nowhere**: not in the library, the start screen or the released pools. Tested in Task 6.

---

## File map

| File | Responsibility |
|---|---|
| `public/persistent-threats.mjs` (new) | The 50 card definitions as plain data |
| `public/cards.mjs` | Registers the definitions; the `first-breach+persistent-threats` pool and its deck recipes |
| `public/rules.mjs` | New steps `recover` and `tapAll`; `damage.tappedAmount`; the `sameOwnerAs` target constraint |
| `public/engine.mjs` | `recover()`; `holds()` supports `attackedWith` and throws on unknown conditions; trigger `if`; once-per-turn only on the battlefield; Reuse requires a rule card; Overclock-only reachability; `aiAction(p)` and its helpers |
| `tests/helpers/rules.mjs` | `fight(g, uids, blocks)` |
| `tests/helpers/simulate.mjs` | `aiMatch(seed, options)` |
| `tests/rules-card-support.test.mjs` (new) | Task 1 |
| `tests/pt-red.test.mjs`, `tests/pt-blue.test.mjs` (new) | One test per card |
| `tests/pt-pool.test.mjs`, `tests/pt-ai.test.mjs`, `tests/pt-matches.test.mjs` (new) | Tasks 6–8 |

---

### Task 1: Engine support the cards need

**Files:**
- Modify: `public/rules.mjs` (`OPS.damage`, new `OPS.recover` and `OPS.tapAll`; `checkTargets` `sameOwnerAs`)
- Modify: `public/engine.mjs` (`holds`; `triggersFor`; new `recover()`; `playIssues` Reuse check; `ruleIssues`)
- Modify: `tests/helpers/rules.mjs` (add `fight`)
- Create: `tests/rules-card-support.test.mjs`

**Interfaces:**
- Produces:
  - Step `{op: 'recover', to, zone: 'hand' | 'field', tapped?}`, which moves discard cards as new objects. Recovered units are sick, and entering the battlefield emits `enter`.
  - Step `{op: 'tapAll', side: 'opponent' | 'you', lock?}`, which acts on units only.
  - `{op: 'damage', to, amount, tappedAmount?}`.
  - Target spec `sameOwnerAs: key`: every card of an `upTo` spec must belong to the owner of the card chosen for `key`.
  - Ability `if: cond` on triggered abilities, checked when the trigger would trigger.
  - `holds(p, {attackedWith: n})`: p is the active player and declared at least n attackers this turn. Unknown conditions throw.
  - `g.recover(p, card, zone, {tapped})`.
  - Test helper `fight(g, attackerUids, blocks = {})`: runs one full combat from declare-attackers to `endCombat`, resolving block triggers on the way.

- [ ] **Step 1: Add the `fight` helper**

Append to `tests/helpers/rules.mjs`:

```js
// One combat for the active player: declare, let the defender block, resolve block triggers, deal damage.
// Leaves the game in endCombat with any combat-damage triggers on the stack.
export function fight(g, uids, blocks = {}) {
  g.phase = 'attack';
  g.attackers(g.active, uids);
  while (g.phase === 'afterAttack') g.pass(g.priority);
  g.blockers(1 - g.active, blocks);
  while (g.stack.length) resolveTop(g);
  g.pass(g.priority);
  g.pass(g.priority);
}
```

- [ ] **Step 2: Write the failing tests**

`tests/rules-card-support.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, fight, put, resolveTop, table} from './helpers/rules.mjs';

const ref = uid => ({kind: 'card', uid});
const yours = {key: 't', zone: 'grave', side: 'you', types: ['Unit']};

test('recover returns a discard card to hand or to the battlefield as a new object', t => {
  define(
    t,
    {id: 'x-raise', type: 'Operation', cost: 0, targets: [yours], steps: [{op: 'recover', to: 't', zone: 'hand'}]},
    {
      id: 'x-revive',
      type: 'Operation',
      cost: 0,
      targets: [yours],
      steps: [{op: 'recover', to: 't', zone: 'field', tapped: true}],
    },
  );
  const g = table();
  const a = put(g, 0, 'r7', 'grave'),
    b = put(g, 0, 'r8', 'grave'),
    oldA = a.uid,
    oldB = b.uid;
  Object.assign(b, {damage: 3, kw: ['overflow']});
  g.play(0, put(g, 0, 'x-raise', 'hand').uid, null, {targets: {t: ref(a.uid)}});
  resolveTop(g);
  assert.ok(g.players[0].hand.some(c => c.id === 'r7' && c.uid !== oldA));
  g.play(0, put(g, 0, 'x-revive', 'hand').uid, null, {targets: {t: ref(b.uid)}});
  resolveTop(g);
  const back = g.players[0].field.find(c => c.id === 'r8');
  assert.notEqual(back.uid, oldB);
  assert.deepEqual(
    [back.tapped, back.sick, back.damage, Object.hasOwn(back, 'kw')],
    [true, true, 0, false],
  );
});

test('tapAll taps and can lock every opposing unit, and nothing of yours', t => {
  define(t, {id: 'x-freeze', type: 'Operation', cost: 0, steps: [{op: 'tapAll', side: 'opponent', lock: true}]});
  const g = table();
  const mine = put(g, 0, 'r7'),
    a = put(g, 1, 'b1'),
    b = put(g, 1, 'b8'),
    tool = put(g, 1, 'b22');
  g.play(0, put(g, 0, 'x-freeze', 'hand').uid);
  resolveTop(g);
  assert.deepEqual(
    [a.tapped, a.locked, b.tapped, b.locked],
    [true, true, true, true],
  );
  assert.equal(mine.tapped, false);
  assert.equal(tool.tapped, false, 'only units');
});

test('damage can be larger against a tapped target', t => {
  define(t, {
    id: 'x-handoff',
    type: 'Response',
    cost: 0,
    targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit']}],
    steps: [{op: 'damage', to: 't', amount: 2, tappedAmount: 4}],
  });
  const g = table();
  const ready = put(g, 1, 'b7'),
    busy = put(g, 1, 'b7');
  busy.tapped = true;
  for (const u of [ready, busy]) {
    g.play(0, put(g, 0, 'x-handoff', 'hand').uid, null, {targets: {t: ref(u.uid)}});
    resolveTop(g);
  }
  assert.deepEqual(
    [ready.damage, busy.damage],
    [2, 4],
  );
});

test('an end-step trigger can require having attacked with at least two units', t => {
  define(t, {
    id: 'x-regroup',
    type: 'Control',
    abilities: [
      {
        id: 'r',
        kind: 'triggered',
        label: 'Regroup',
        on: 'yourEndStep',
        if: {attackedWith: 2},
        steps: [{op: 'createToken', token: 'pt-backdoor'}],
      },
    ],
  });
  for (const n of [1, 2]) {
    const g = table();
    put(g, 0, 'x-regroup');
    const units = [put(g, 0, 'r7'), put(g, 0, 'r7')].slice(0, n);
    fight(
      g,
      units.map(u => u.uid),
    );
    while (g.phase !== 'end') g.pass(g.priority);
    assert.equal(g.stack.length, n === 2 ? 1 : 0, `${n} attackers`);
  }
});

test('an unknown condition is a card-data error, not a silent false', t => {
  define(t, {id: 'x-odd', type: 'Unit', power: 1, toughness: 1, when: [{keyword: 'rapid', if: {nope: 1}}]});
  const g = table();
  const u = put(g, 0, 'x-odd');
  assert.throws(() => g.has(u, 'rapid'), /Unknown condition/);
});

test('an archive target can be required to come from the discard of another target’s controller', t => {
  define(t, {
    id: 'x-chain',
    type: 'Response',
    cost: 0,
    targets: [
      {key: 't', zone: 'field', side: 'any', types: ['Tool', 'Control']},
      {key: 'g', zone: 'grave', side: 'any', upTo: 2, sameOwnerAs: 't'},
    ],
    steps: [{op: 'destroy', to: 't'}, {op: 'archive', to: 'g'}],
  });
  const g = table();
  const tool = put(g, 1, 'b22'),
    theirs = put(g, 1, 'b7', 'grave'),
    mine = put(g, 0, 'r7', 'grave');
  const c = put(g, 0, 'x-chain', 'hand');
  assert.throws(
    () => g.play(0, c.uid, null, {targets: {t: ref(tool.uid), g: [ref(mine.uid)]}}),
    /controller’s discard/,
  );
  g.play(0, c.uid, null, {targets: {t: ref(tool.uid), g: [ref(theirs.uid)]}});
  resolveTop(g);
  assert.ok(g.players[1].archive.some(x => x.uid === theirs.uid));
});

test('only rule cards can be cast with Reuse', t => {
  define(t, {id: 'x-old', type: 'Operation', cost: 0, reuse: 1, effect: 'draw', amount: 1});
  const g = table();
  compute(g, 0, 1);
  const c = put(g, 0, 'x-old', 'grave');
  assert.deepEqual(
    g.playIssues(0, c, {reuse: true}).map(i => i.code),
    ['reuse'],
  );
});

test('a card castable only with Overclock is castable when Overclock is affordable', t => {
  define(t, {
    id: 'x-scoped',
    type: 'Operation',
    cost: 3,
    targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit'], maxCost: 3}],
    steps: [{op: 'destroy', to: 't'}],
    overclock: {
      cost: 2,
      instead: true,
      targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit']}],
      steps: [{op: 'destroy', to: 't'}],
    },
  });
  const g = table();
  put(g, 1, 'r11'); // Ransomware Engine, cost 5
  const c = put(g, 0, 'x-scoped', 'hand');
  compute(g, 0, 3);
  assert.deepEqual(
    g.playIssues(0, c).map(i => i.code),
    ['target'],
  );
  compute(g, 0, 2);
  assert.deepEqual(g.playIssues(0, c), []);
});

test('a once-per-turn trigger firing from the discard leaves no mark on the card', t => {
  define(t, {
    id: 'x-last',
    type: 'Unit',
    power: 1,
    toughness: 1,
    abilities: [
      {id: 'd', kind: 'triggered', label: 'Last', on: 'defeated', once: true, steps: [{op: 'heal', n: 1}]},
    ],
  });
  const g = table();
  const u = put(g, 0, 'x-last');
  u.damage = 1;
  g.settle();
  assert.equal(g.stack.length, 1);
  assert.equal(Object.hasOwn(u, 'used'), false);
});
```

`b22` is Immutable Backup (a First Breach Tool) and `r11` is Ransomware Engine (cost 5). Check both with `BY_ID` before relying on them; if the index differs, look them up by name.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/rules-card-support.test.mjs`
Expected: FAIL. `OPS[step.op] is not a function` for `recover`/`tapAll`, plus the other assertions.

- [ ] **Step 4: Implement the rules additions**

In `public/rules.mjs`, replace `OPS.damage` and add two steps next to it:

```js
  damage: (g, f, s) => {
    for (const x of onField(g, f, s.to))
      x.card.damage += s.tappedAmount != null && x.card.tapped ? s.tappedAmount : s.amount;
  },
  // Leaving the discard makes a new object: a unit returned to the battlefield is a new arrival.
  recover: (g, f, s) => {
    for (const x of refs(g, f, s.to)) if (x.zone === 'grave') g.recover(x.p, x.card, s.zone, {tapped: !!s.tapped});
  },
  tapAll: (g, f, s) => {
    const q = s.side === 'you' ? f.p : 1 - f.p;
    for (const c of g.players[q].field)
      if (data(c).type === 'Unit') {
        c.tapped = true;
        if (s.lock) c.locked = true;
      }
  },
```

In `checkTargets`, inside the `if (spec.upTo) { … }` branch, after the `onePlayer` check, add:

```js
      if (spec.sameOwnerAs) {
        const anchor = chosen[spec.sameOwnerAs],
          owner = anchor ? g.find(anchor.uid)?.p : undefined;
        if (list.some(t => g.find(t.uid)?.p !== owner))
          return 'Choose cards from that permanent’s controller’s discard.';
      }
```

- [ ] **Step 5: Implement the engine additions**

`holds`:

```js
  holds(p, cond) {
    if (cond.control) return this.players[p].field.some(x => x.id === cond.control);
    if (cond.attackedWith) return p === this.active && this.attacks.length >= cond.attackedWith;
    throw Error(`Unknown condition: ${JSON.stringify(cond)}.`);
  }
```

`triggersFor`: give `consider` a third parameter `onField = true`, and use it:

```js
    const consider = (c, p, onField = true) => {
      for (const a of this.data(c).abilities ?? []) {
        if (a.kind !== 'triggered' || !ON[a.on](e, c, p, a)) continue;
        if (a.if && !this.holds(p, a.if)) continue;
        // Counted when it triggers, even if the trigger is later countered or removed. Only battlefield objects
        // have a turn to count in; a card triggering from the discard is not marked.
        if (a.once && onField) {
          if (c.used?.includes(a.id)) continue;
          (c.used ??= []).push(a.id);
        }
        found.push({id: ++this.uid, p, ability: {card: c.id, uid: c.uid, id: a.id}});
      }
    };
```

and the discard call becomes `consider(f.card, e.p, false);`.

Add after `archiveCard`:

```js
  // Leaving the discard makes a new object, like returning to hand.
  recover(p, c, zone, {tapped = false} = {}) {
    const q = this.players[p];
    q.grave = q.grave.filter(x => x.uid !== c.uid);
    clearTransient(c);
    Object.assign(c, {uid: ++this.uid, tapped: zone === 'field' && tapped, sick: true, damage: 0, bp: 0, bt: 0});
    (zone === 'field' ? q.field : q.hand).push(c);
    this.note(`${this.data(c).name} returns to ${zone === 'field' ? 'the battlefield' : 'its owner’s hand'}.`);
    if (zone === 'field') this.emit({type: 'enter', p, uid: c.uid});
  }
```

In `playIssues`, the Reuse check becomes:

```js
    if (
      options.reuse &&
      (this.data(c).reuse == null ||
        !['Operation', 'Response'].includes(this.data(c).type) ||
        !isRule(this.data(c)))
    )
```

`ruleIssues`: take `reuse` too, and count Overclock when the player can afford it:

```js
  ruleIssues(p, d, {mode = null, overclock = false, reuse = false} = {}) {
    if (d.modes && mode != null && !(Number.isInteger(mode) && mode >= 0 && mode < d.modes.length))
      return [{code: 'mode', message: 'Choose one of this card’s modes.'}];
    const modes = d.modes ? (mode == null ? d.modes.map((_, i) => i) : [mode]) : [null];
    // Overclock can widen the targets (a bigger unit), so it counts when the player can afford it.
    const ways = overclock
      ? [true]
      : d.overclock && this.mana(p) >= this.costOf(d, {overclock: true, reuse})
        ? [false, true]
        : [false];
    const reachable = modes.some(m =>
      ways.some(o =>
        spellRule(d, {mode: m, overclock: o}).targets.every(
          spec => spec.optional || spec.upTo || candidates(this, p, spec).length,
        ),
      ),
    );
    return reachable ? [] : [{code: 'target', message: 'There is no legal target for this card.'}];
  }
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 7: Commit**

```bash
npx --yes prettier@3.9.9 --write public/rules.mjs public/engine.mjs tests/helpers/rules.mjs tests/rules-card-support.test.mjs
git add public/rules.mjs public/engine.mjs tests/helpers/rules.mjs tests/rules-card-support.test.mjs
git commit -m "Add the engine steps and conditions the expansion cards need"
```

---

### Task 2: Red permanents

**Files:**
- Create: `public/persistent-threats.mjs`
- Modify: `public/cards.mjs` (register the definitions)
- Create: `tests/pt-red.test.mjs`

**Interfaces:**
- Consumes: `fight` and the new steps (Task 1).
- Produces:
  - `PERSISTENT_THREATS`: an array of `{id, faction, name, cost, type, text, …}` in design order.
  - The shared helpers inside the module: `BACKDOOR`, `INDICATOR`, `probe`, `token`, `trig`, `act`, `opposingUnit`, `yourUnit`, `stackSpell`.
  - Ability ids used by later tests. Red: `cash`, `scan`, `map`, `foothold`, `drop`, `trade`, `implant`, `loot`, `reenter`, `surge`, `campaign`, `stash`, `cycle`, `exfil`, `pressure`, `regroup`.

- [ ] **Step 1: Write the failing tests**

`tests/pt-red.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {compute, fight, put, resolveTop, table} from './helpers/rules.mjs';

const pt = name => CARDS.find(c => c.name === name).id;
const ref = uid => ({kind: 'card', uid});
const count = (g, p, id) => g.players[p].field.filter(c => c.id === id).length;
// Casts a unit, Tool or Control from hand and lets it enter.
function deploy(g, p, name) {
  const c = put(g, p, pt(name), 'hand');
  g.play(p, c.uid);
  resolveTop(g);
  return c;
}

test('Ghost Relay enters tapped, and retires with 3 other compute for two Backdoors', () => {
  const g = table();
  const played = put(g, 0, pt('Ghost Relay'), 'hand');
  g.play(0, played.uid);
  assert.equal(played.tapped, true);
  const relay = put(g, 0, pt('Ghost Relay'));
  compute(g, 0, 3);
  g.activate(0, relay.uid, 'cash');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 2);
  assert.ok(g.players[0].grave.some(c => c.uid === relay.uid));
});

test('Reconnaissance Outpost enters tapped and probes 1', () => {
  const g = table();
  const c = put(g, 0, pt('Reconnaissance Outpost'), 'hand');
  g.play(0, c.uid);
  assert.equal(c.tapped, true);
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
  assert.equal(g.pending.options.length, 1);
});

test('Attack Surface Mapper is a 1/1 that probes 1 when it enters', () => {
  const g = table();
  compute(g, 0, 1);
  const c = deploy(g, 0, 'Attack Surface Mapper');
  assert.deepEqual(g.stats(c, 0), {power: 1, toughness: 1});
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
});

test('Beachhead Scout creates a Backdoor when it hits the opponent', () => {
  const g = table();
  const s = put(g, 0, pt('Beachhead Scout'));
  fight(g, [s.uid]);
  assert.equal(g.players[1].life, 18);
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 1);
});

test('Staged Loader has Rapid deploy only while you control a Backdoor', () => {
  const g = table();
  const l = put(g, 0, pt('Staged Loader'));
  l.sick = true;
  assert.equal(g.canAttack(0, l), false);
  g.createToken(0, 'pt-backdoor');
  assert.equal(g.canAttack(0, l), true);
  assert.deepEqual(g.stats(l, 0), {power: 2, toughness: 1});
});

test('Dead-Drop Courier has Stealth and probes 1 when defeated', () => {
  const g = table();
  const c = put(g, 0, pt('Dead-Drop Courier'));
  assert.equal(g.canBlock(put(g, 1, 'b1'), c), false);
  assert.equal(g.canBlock(put(g, 1, 'b2'), c), true, 'Endpoint Sensor has Detection');
  g.remove(0, c);
  g.settle();
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
});

test('Access Broker gets +1/+0 the first time you retire a Tool each turn', () => {
  const g = table();
  compute(g, 0, 2);
  const b = put(g, 0, pt('Access Broker')),
    t1 = g.createToken(0, 'pt-backdoor'),
    t2 = g.createToken(0, 'pt-backdoor');
  g.activate(0, t1.uid, 'boost', {targets: {t: ref(b.uid)}});
  resolveTop(g);
  resolveTop(g);
  assert.equal(g.stats(b, 0).power, 3 + 1 + 2);
  g.activate(0, t2.uid, 'boost', {targets: {t: ref(b.uid)}});
  assert.equal(g.stack.length, 1);
});

test('Dormant Implant creates a Backdoor when it enters', () => {
  const g = table();
  compute(g, 0, 3);
  deploy(g, 0, 'Dormant Implant');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 1);
});

test('Living-off-the-Land Operator draws then discards when you cast from your discard', () => {
  const g = table();
  put(g, 0, pt('Living-off-the-Land Operator'));
  put(g, 0, 'r13', 'hand');
  compute(g, 0, 3);
  const m = put(g, 0, pt('Map Trust Relationships'), 'grave');
  g.play(0, m.uid, null, {reuse: true});
  assert.equal(g.stack.at(-1).ability.id, 'loot');
  resolveTop(g);
  assert.equal(g.pending.kind, 'discard');
});

test('Redundant Handler returns to hand when defeated if you retire a Backdoor', () => {
  const g = table();
  const h = put(g, 0, pt('Redundant Handler'));
  const b = g.createToken(0, 'pt-backdoor');
  h.damage = 4;
  g.settle();
  resolveTop(g);
  assert.equal(g.pending.kind, 'optional');
  g.choose(0, {uid: b.uid});
  assert.ok(g.players[0].hand.some(c => c.id === pt('Redundant Handler')));
  assert.equal(count(g, 0, 'pt-backdoor'), 0);
});

test('Coordinated Intrusion Lead spends a Backdoor for +1/+0 and Overflow', () => {
  const g = table();
  compute(g, 0, 1);
  const lead = put(g, 0, pt('Coordinated Intrusion Lead')),
    u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  g.activate(0, lead.uid, 'surge', {targets: {t: ref(u.uid)}, costUids: [b.uid]});
  resolveTop(g);
  assert.equal(g.stats(u, 0).power, 4);
  assert.equal(g.has(u, 'overflow'), true);
});

test('Long-Haul Campaign has Overflow and creates two Backdoors when it enters', () => {
  const g = table();
  compute(g, 0, 6);
  const c = deploy(g, 0, 'Long-Haul Campaign');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 2);
  assert.equal(g.has(c, 'overflow'), true);
});

test('Disposable Cache creates a Backdoor, and retires another Tool to draw two then discard one', () => {
  const g = table();
  compute(g, 0, 4);
  const cache = deploy(g, 0, 'Disposable Cache');
  resolveTop(g);
  const b = g.players[0].field.find(c => c.id === 'pt-backdoor');
  put(g, 0, 'r13', 'hand');
  g.activate(0, cache.uid, 'cycle', {costUids: [b.uid]});
  resolveTop(g);
  assert.equal(g.pending.kind, 'discard');
  assert.equal(g.pending.options.length, 3);
});

test('Exfiltration Buffer draws once when your units hit the opponent', () => {
  const g = table();
  put(g, 0, pt('Exfiltration Buffer'));
  const a = put(g, 0, 'r7'),
    b = put(g, 0, 'r7');
  fight(g, [a.uid, b.uid]);
  assert.equal(g.stack.length, 1);
  resolveTop(g);
  assert.equal(g.players[0].hand.length, 1);
});

test('Distributed Command pings on your first Tool retirement each turn', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, pt('Distributed Command'));
  const u = put(g, 0, 'r7'),
    t1 = g.createToken(0, 'pt-backdoor'),
    t2 = g.createToken(0, 'pt-backdoor');
  g.activate(0, t1.uid, 'boost', {targets: {t: ref(u.uid)}});
  resolveTop(g);
  resolveTop(g);
  assert.equal(g.players[1].life, 19);
  g.activate(0, t2.uid, 'boost', {targets: {t: ref(u.uid)}});
  assert.equal(g.stack.length, 1);
});

test('Distributed Command creates a Backdoor at your end step only after attacking with two units', () => {
  for (const n of [1, 2]) {
    const g = table();
    put(g, 0, pt('Distributed Command'));
    const units = [put(g, 0, 'r7'), put(g, 0, 'r7')].slice(0, n);
    fight(
      g,
      units.map(u => u.uid),
    );
    while (g.phase !== 'end') g.pass(g.priority);
    assert.equal(g.stack.length, n === 2 ? 1 : 0);
    if (n === 2) assert.equal(g.stack[0].ability.id, 'regroup');
  }
});
```

This file refers to Map Trust Relationships, which is added in Task 3. Until then the LotL test fails on the lookup; that is expected. Confirm every other test in the file fails first for a missing card, then passes after Step 3. The LotL test must pass once Task 3 lands.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/pt-red.test.mjs`
Expected: FAIL. `Cannot read properties of undefined (reading 'id')`, because the cards don't exist.

- [ ] **Step 3: Create the card module with the red permanents**

`public/persistent-threats.mjs`:

```js
// Persistent Threats cards as rule data (see public/rules.mjs for what each field means). Plain data only:
// cards.mjs registers these under the persistent-threats set, and nothing here imports the engine.
export const BACKDOOR = 'pt-backdoor',
  INDICATOR = 'pt-indicator';
const probe = n => ({op: 'probe', n});
const token = (id, n = 1) => ({op: 'createToken', token: id, n});
const trig = (id, label, on, steps, extra = {}) => ({id, kind: 'triggered', label, on, steps, ...extra});
const act = (id, label, cost, steps, extra = {}) => ({id, kind: 'activated', label, cost, steps, ...extra});
const opposingUnit = {key: 't', zone: 'field', side: 'opponent', types: ['Unit']};
const yourUnit = {key: 't', zone: 'field', side: 'you', types: ['Unit']};
const stackSpell = {key: 't', zone: 'stack', types: ['Response', 'Operation']};
const red = (id, name, cost, type, text, extra = {}) => ({id, faction: 'red', name, cost, type, text, ...extra});
const blue = (id, name, cost, type, text, extra = {}) => ({id, faction: 'blue', name, cost, type, text, ...extra});
const unit = (subtype, power, toughness, extra = {}) => ({subtype, power, toughness, ...extra});

export const PERSISTENT_THREATS = [
  red(
    'pt-r01',
    'Ghost Relay',
    0,
    'Infrastructure',
    'Enters tapped. Tap: Add 1 compute. 3 compute, Tap, retire Ghost Relay: Create two Backdoors.',
    {
      entersTapped: true,
      abilities: [
        act('cash', 'Retire for two Backdoors', {compute: 3, tap: true, retire: 'self'}, [token(BACKDOOR, 2)]),
      ],
    },
  ),
  red(
    'pt-r02',
    'Reconnaissance Outpost',
    0,
    'Infrastructure',
    'Enters tapped. Tap: Add 1 compute. When this enters, Probe 1.',
    {entersTapped: true, abilities: [trig('scan', 'Probe 1', 'enter', [probe(1)])]},
  ),
  red('pt-r03', 'Attack Surface Mapper', 1, 'Unit', 'When this enters, Probe 1.', {
    ...unit('Operator', 1, 1),
    abilities: [trig('map', 'Probe 1', 'enter', [probe(1)])],
  }),
  red(
    'pt-r04',
    'Beachhead Scout',
    2,
    'Unit',
    'Whenever this deals combat damage to the opponent, create a Backdoor. This triggers only once each turn.',
    {
      ...unit('Operator', 2, 1),
      abilities: [trig('foothold', 'Create a Backdoor', 'hitsOpponent', [token(BACKDOOR)], {once: true})],
    },
  ),
  red('pt-r05', 'Staged Loader', 2, 'Unit', 'Has Rapid deploy while you control a Backdoor.', {
    ...unit('Malware', 2, 1),
    when: [{keyword: 'rapid', if: {control: BACKDOOR}}],
  }),
  red('pt-r06', 'Dead-Drop Courier', 3, 'Unit', 'Stealth. When this is defeated, Probe 1.', {
    ...unit('Network', 2, 1),
    keywords: ['stealth'],
    abilities: [trig('drop', 'Probe 1', 'defeated', [probe(1)])],
  }),
  red(
    'pt-r07',
    'Access Broker',
    3,
    'Unit',
    'Whenever you retire a Tool, this gets +1/+0 until end of turn. This triggers only once each turn.',
    {
      ...unit('Identity', 3, 2),
      abilities: [
        trig('trade', '+1/+0', 'youRetire', [{op: 'buff', to: 'self', power: 1}], {
          what: {types: ['Tool']},
          once: true,
        }),
      ],
    },
  ),
  red('pt-r08', 'Dormant Implant', 3, 'Unit', 'When this enters, create a Backdoor.', {
    ...unit('Malware', 2, 3),
    abilities: [trig('implant', 'Create a Backdoor', 'enter', [token(BACKDOOR)])],
  }),
  red(
    'pt-r09',
    'Living-off-the-Land Operator',
    4,
    'Unit',
    'Whenever you cast a card from your discard, draw a card, then discard a card. This triggers only once each turn.',
    {
      ...unit('Operator', 3, 3),
      abilities: [
        trig(
          'loot',
          'Draw, then discard',
          'youCastFromGrave',
          [
            {op: 'draw', n: 1},
            {op: 'discard', n: 1},
          ],
          {once: true},
        ),
      ],
    },
  ),
  red(
    'pt-r10',
    'Redundant Handler',
    4,
    'Unit',
    'When this is defeated, if this card is still in your discard, you may retire a Backdoor. If you do, return this card to your hand.',
    {
      ...unit('Operator', 3, 4),
      abilities: [
        trig('reenter', 'Return to hand', 'defeated', [
          {
            op: 'optionalRetire',
            what: {id: BACKDOOR},
            ifSelfIn: 'grave',
            prompt: 'Retire a Backdoor to return Redundant Handler to your hand?',
            then: [{op: 'recover', to: 'self', zone: 'hand'}],
          },
        ]),
      ],
    },
  ),
  red(
    'pt-r11',
    'Coordinated Intrusion Lead',
    5,
    'Unit',
    '1 compute, retire a Backdoor: Target unit you control gets +1/+0 and Overflow until end of turn.',
    {
      ...unit('Operator', 4, 4),
      abilities: [
        act(
          'surge',
          '+1/+0 and Overflow',
          {compute: 1, retire: {id: BACKDOOR}},
          [{op: 'buff', to: 't', power: 1, keywords: ['overflow']}],
          {targets: [yourUnit]},
        ),
      ],
    },
  ),
  red('pt-r12', 'Long-Haul Campaign', 6, 'Unit', 'Overflow. When this enters, create two Backdoors.', {
    ...unit('Operator', 5, 5),
    keywords: ['overflow'],
    abilities: [trig('campaign', 'Create two Backdoors', 'enter', [token(BACKDOOR, 2)])],
  }),
  // pt-r13 … pt-r22 (red Operations and Responses) are added in Task 3, between these units and the Tools.
  red(
    'pt-r23',
    'Disposable Cache',
    2,
    'Tool',
    'When this enters, create a Backdoor. 2 compute, Tap, retire another Tool: Draw two cards, then discard a card.',
    {
      abilities: [
        trig('stash', 'Create a Backdoor', 'enter', [token(BACKDOOR)]),
        act('cycle', 'Draw two, then discard one', {compute: 2, tap: true, retire: {types: ['Tool'], other: true}}, [
          {op: 'draw', n: 2},
          {op: 'discard', n: 1},
        ]),
      ],
    },
  ),
  red(
    'pt-r24',
    'Exfiltration Buffer',
    3,
    'Tool',
    'Whenever one or more units you control deal combat damage to the opponent, draw a card. This triggers only once each turn.',
    {abilities: [trig('exfil', 'Draw a card', 'yourUnitsHit', [{op: 'draw', n: 1}], {once: true})]},
  ),
  red(
    'pt-r25',
    'Distributed Command',
    4,
    'Control',
    'Whenever you retire a Tool, deal 1 damage to the opponent. This triggers only once each turn. At the beginning of your end step, if you attacked with at least two units this turn, create a Backdoor.',
    {
      abilities: [
        trig('pressure', '1 damage to the opponent', 'youRetire', [{op: 'damageOpponent', n: 1}], {
          what: {types: ['Tool']},
          once: true,
        }),
        trig('regroup', 'Create a Backdoor', 'yourEndStep', [token(BACKDOOR)], {if: {attackedWith: 2}}),
      ],
    },
  ),
];
```

`blue`, `INDICATOR`, `opposingUnit` and `stackSpell` are unused until later tasks. Keep them; unused constants are legal.

- [ ] **Step 4: Register the cards**

In `public/cards.mjs`, import the data: `import {PERSISTENT_THREATS} from './persistent-threats.mjs';`. After the last First Breach `B(…)` call and before `export const CARDS = cards;`, add:

```js
// The Persistent Threats cards: unreleased (no lore or art yet), with their own stable ids.
for (const {faction, name, cost, type, text, ...extra} of PERSISTENT_THREATS)
  add('persistent-threats', faction, name, cost, type, text, extra);
```

`add()` already takes `extra.id` for explicit ids and skips lore for unreleased sets. The Plan 1 test `every card belongs to a known set and First Breach ids are unchanged` must still pass.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/pt-red.test.mjs`
Expected: every test PASSES except the Living-off-the-Land test, which needs Task 3's Map Trust Relationships.

Run: `npm test`
Expected: PASS apart from that one test, and the golden test still passes.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/persistent-threats.mjs public/cards.mjs tests/pt-red.test.mjs
git add public/persistent-threats.mjs public/cards.mjs tests/pt-red.test.mjs
git commit -m "Add the red Persistent Threats permanents"
```

---

### Task 3: Red Operations and Responses

**Files:**
- Modify: `public/persistent-threats.mjs` (insert `pt-r13`…`pt-r22` where the Task 2 comment says)
- Modify: `tests/pt-red.test.mjs` (append)

**Interfaces:**
- Consumes: the helpers inside `persistent-threats.mjs` (Task 2); `recover`/`damage.tappedAmount` (Task 1).
- Produces: ten red rule spells in design order.

- [ ] **Step 1: Write the failing tests**

Append to `tests/pt-red.test.mjs`:

```js
const castSpell = (g, p, name, options = {}) => {
  const c = put(g, p, pt(name), 'hand');
  g.play(p, c.uid, null, options);
  return c;
};

test('Map Trust Relationships probes 2, and can be reused from the discard for 3', () => {
  const g = table();
  compute(g, 0, 1);
  castSpell(g, 0, 'Map Trust Relationships');
  resolveTop(g);
  assert.equal(g.pending.options.length, 2);
  g.choose(0, g.defaultChoice());
  compute(g, 0, 3);
  const c = g.players[0].grave.find(x => x.id === pt('Map Trust Relationships'));
  g.play(0, c.uid, null, {reuse: true});
  resolveTop(g);
  g.choose(0, g.defaultChoice());
  assert.ok(g.players[0].archive.some(x => x.uid === c.uid));
});

test('Seed Access creates two Backdoors', () => {
  const g = table();
  compute(g, 0, 2);
  castSpell(g, 0, 'Seed Access');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 2);
});

test('Coordinated Pressure deals 4 to an opposing unit, or 6 overclocked', () => {
  const g = table();
  compute(g, 0, 8);
  const a = put(g, 1, 'b8'),
    b = put(g, 1, 'b7');
  castSpell(g, 0, 'Coordinated Pressure', {targets: {t: ref(a.uid)}});
  resolveTop(g);
  assert.ok(g.players[1].grave.some(c => c.uid === a.uid), '4 defeats a 3/4');
  castSpell(g, 0, 'Coordinated Pressure', {overclock: true, targets: {t: ref(b.uid)}});
  resolveTop(g);
  assert.ok(g.players[1].grave.some(c => c.uid === b.uid), '6 defeats a 1/5');
});

test('Burn the Channel retires a Tool to destroy an opposing unit', () => {
  const g = table();
  compute(g, 0, 2);
  const target = put(g, 1, 'b8');
  const c = put(g, 0, pt('Burn the Channel'), 'hand');
  assert.deepEqual(
    g.playIssues(0, c).map(i => i.code),
    ['retire'],
  );
  const b = g.createToken(0, 'pt-backdoor');
  g.play(0, c.uid, null, {targets: {t: ref(target.uid)}, costUids: [b.uid]});
  resolveTop(g);
  assert.ok(g.players[1].grave.some(x => x.uid === target.uid));
});

test('Cascading Outage deals 2 to every unit, or 4 overclocked, including yours', () => {
  const g = table();
  compute(g, 0, 10);
  const mine = put(g, 0, 'r7'),
    small = put(g, 1, 'b1'),
    big = put(g, 1, 'b8');
  castSpell(g, 0, 'Cascading Outage');
  resolveTop(g);
  assert.deepEqual(
    [mine.damage, big.damage],
    [2, 2],
  );
  assert.ok(g.players[1].grave.some(x => x.uid === small.uid));
  g.endTurn();
  g.endTurn();
  g.phase = 'main1';
  castSpell(g, 0, 'Cascading Outage', {overclock: true});
  resolveTop(g);
  assert.ok(g.players[0].grave.some(x => x.uid === mine.uid));
  assert.ok(g.players[1].grave.some(x => x.uid === big.uid));
});

test('Adaptive Payload gives +2/+0, or +2/+2 and Overflow overclocked', () => {
  const g = table();
  compute(g, 0, 4);
  const u = put(g, 0, 'r7');
  castSpell(g, 0, 'Adaptive Payload', {targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.deepEqual(g.stats(u, 0), {power: 5, toughness: 3});
  castSpell(g, 0, 'Adaptive Payload', {overclock: true, targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.deepEqual(g.stats(u, 0), {power: 7, toughness: 5});
  assert.equal(g.has(u, 'overflow'), true);
});

test('Exploit the Handoff deals 2, or 4 to a tapped unit', () => {
  const g = table();
  compute(g, 0, 4);
  const ready = put(g, 1, 'b7'),
    busy = put(g, 1, 'b7');
  busy.tapped = true;
  castSpell(g, 0, 'Exploit the Handoff', {targets: {t: ref(ready.uid)}});
  resolveTop(g);
  castSpell(g, 0, 'Exploit the Handoff', {targets: {t: ref(busy.uid)}});
  resolveTop(g);
  assert.deepEqual(
    [ready.damage, busy.damage],
    [2, 4],
  );
});

test('Signal Spoof counters unless its controller pays 2, then probes 1', () => {
  const g = table();
  g.active = 1;
  g.priority = 1;
  compute(g, 1, 4);
  const logs = put(g, 1, CARDS.find(c => c.name === 'Correlate Logs').id, 'hand');
  g.play(1, logs.uid);
  g.pass(1);
  compute(g, 0, 2);
  castSpell(g, 0, 'Signal Spoof', {targets: {t: {kind: 'spell', uid: logs.uid}}});
  resolveTop(g);
  assert.equal(g.pending.kind, 'pay');
  g.choose(1, {pay: false});
  assert.ok(g.players[1].grave.some(c => c.uid === logs.uid));
  assert.equal(g.pending.kind, 'probe');
  assert.equal(g.pending.actor, 0);
});

test('Reopened Connection returns your unit to hand and draws; Reuse archives it', () => {
  const g = table();
  compute(g, 0, 6);
  const u = put(g, 0, 'r7');
  const c = castSpell(g, 0, 'Reopened Connection', {targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.ok(g.players[0].hand.some(x => x.id === 'r7'));
  assert.equal(g.players[0].hand.length, 2);
  const v = put(g, 0, 'r7');
  g.play(0, c.uid, null, {reuse: true, targets: {t: ref(v.uid)}});
  resolveTop(g);
  assert.ok(g.players[0].archive.some(x => x.uid === c.uid));
});

test('Burn Credentials archives up to two cards from one player’s discard, then probes 1', () => {
  const g = table();
  compute(g, 0, 2);
  const a = put(g, 1, 'b7', 'grave'),
    b = put(g, 1, 'b8', 'grave'),
    mine = put(g, 0, 'r7', 'grave');
  const c = put(g, 0, pt('Burn Credentials'), 'hand');
  assert.throws(() => g.play(0, c.uid, null, {targets: {g: [ref(a.uid), ref(mine.uid)]}}), /single player/);
  g.play(0, c.uid, null, {targets: {g: [ref(a.uid), ref(b.uid)]}});
  resolveTop(g);
  assert.equal(g.players[1].archive.length, 2);
  assert.equal(g.pending.kind, 'probe');
});
```

`Correlate Logs` is First Breach's blue draw-two Operation.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test tests/pt-red.test.mjs`
Expected: the ten new tests FAIL on the missing cards. The LotL test from Task 2 also still fails.

- [ ] **Step 3: Add the red spells**

In `public/persistent-threats.mjs`, replace the comment `// pt-r13 … pt-r22 …` with:

```js
  red('pt-r13', 'Map Trust Relationships', 1, 'Operation', 'Probe 2. Reuse 3.', {steps: [probe(2)], reuse: 3}),
  red('pt-r14', 'Seed Access', 2, 'Operation', 'Create two Backdoors.', {steps: [token(BACKDOOR, 2)]}),
  red(
    'pt-r15',
    'Coordinated Pressure',
    3,
    'Operation',
    'Deal 4 damage to target opposing unit. Overclock 2: Deal 6 damage instead.',
    {
      targets: [opposingUnit],
      steps: [{op: 'damage', to: 't', amount: 4}],
      overclock: {cost: 2, instead: true, steps: [{op: 'damage', to: 't', amount: 6}]},
    },
  ),
  red(
    'pt-r16',
    'Burn the Channel',
    2,
    'Operation',
    'As an additional cost, retire a Tool. Destroy target opposing unit.',
    {extraCost: {retire: {types: ['Tool']}}, targets: [opposingUnit], steps: [{op: 'destroy', to: 't'}]},
  ),
  red(
    'pt-r17',
    'Cascading Outage',
    4,
    'Operation',
    'Deal 2 damage to every unit. Overclock 2: Deal 4 damage to every unit instead.',
    {
      steps: [{op: 'damageAll', amount: 2}],
      overclock: {cost: 2, instead: true, steps: [{op: 'damageAll', amount: 4}]},
    },
  ),
  red(
    'pt-r18',
    'Adaptive Payload',
    1,
    'Response',
    'Target unit you control gets +2/+0 until end of turn. Overclock 2: It gets +2/+2 and Overflow until end of turn instead.',
    {
      targets: [yourUnit],
      steps: [{op: 'buff', to: 't', power: 2}],
      overclock: {
        cost: 2,
        instead: true,
        steps: [{op: 'buff', to: 't', power: 2, toughness: 2, keywords: ['overflow']}],
      },
    },
  ),
  red(
    'pt-r19',
    'Exploit the Handoff',
    2,
    'Response',
    'Deal 2 damage to target opposing unit, or 4 damage if it is tapped as this resolves.',
    {targets: [opposingUnit], steps: [{op: 'damage', to: 't', amount: 2, tappedAmount: 4}]},
  ),
  red(
    'pt-r20',
    'Signal Spoof',
    2,
    'Response',
    'Counter target Response or Operation unless its controller pays 2 compute. Probe 1.',
    {targets: [stackSpell], steps: [{op: 'counterUnlessPay', to: 't', amount: 2}, probe(1)]},
  ),
  red(
    'pt-r21',
    'Reopened Connection',
    2,
    'Response',
    'Return target unit you control to its owner’s hand. Draw a card. Reuse 4.',
    {
      targets: [yourUnit],
      steps: [
        {op: 'bounce', to: 't'},
        {op: 'draw', n: 1},
      ],
      reuse: 4,
    },
  ),
  red(
    'pt-r22',
    'Burn Credentials',
    1,
    'Response',
    'Archive up to two target cards from a single player’s discard. Probe 1.',
    {
      targets: [{key: 'g', zone: 'grave', side: 'any', upTo: 2, onePlayer: true}],
      steps: [{op: 'archive', to: 'g'}, probe(1)],
    },
  ),
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, including every `pt-red` test (LotL now included) and the golden test.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/persistent-threats.mjs tests/pt-red.test.mjs
git add public/persistent-threats.mjs tests/pt-red.test.mjs
git commit -m "Add the red Persistent Threats Operations and Responses"
```

---

### Task 4: Blue permanents

**Files:**
- Modify: `public/persistent-threats.mjs` (append `pt-b01`…`pt-b12` and `pt-b23`…`pt-b25`, leaving a comment where `pt-b13`…`pt-b22` go)
- Create: `tests/pt-blue.test.mjs`

**Interfaces:**
- Produces: blue ability ids `preserve`, `scan`, `triage`, `alarm`, `collect`, `observe`, `analyze`, `lockdown`, `restore`, `coordinate`, `mesh`, `study`, `recover`, `signal`, `verify`.

- [ ] **Step 1: Write the failing tests**

`tests/pt-blue.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {compute, fight, put, resolveTop, table} from './helpers/rules.mjs';

const pt = name => CARDS.find(c => c.name === name).id;
const fb = name => CARDS.find(c => c.name === name && c.set === 'first-breach').id;
const ref = uid => ({kind: 'card', uid});
const count = (g, p, id) => g.players[p].field.filter(c => c.id === id).length;
function deploy(g, p, name) {
  const c = put(g, p, pt(name), 'hand');
  g.play(p, c.uid);
  resolveTop(g);
  return c;
}

test('Forensic Repository enters tapped, and retires with 3 other compute for two Indicators', () => {
  const g = table();
  const played = put(g, 0, pt('Forensic Repository'), 'hand');
  g.play(0, played.uid);
  assert.equal(played.tapped, true);
  const repo = put(g, 0, pt('Forensic Repository'));
  compute(g, 0, 3);
  g.activate(0, repo.uid, 'preserve');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 2);
});

test('Instrumented Datacenter enters tapped and probes 1', () => {
  const g = table();
  const c = put(g, 0, pt('Instrumented Datacenter'), 'hand');
  g.play(0, c.uid);
  assert.equal(c.tapped, true);
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
});

test('Alert Triage Analyst is a 1/1 that probes 1 when it enters', () => {
  const g = table();
  compute(g, 0, 1);
  const c = deploy(g, 0, 'Alert Triage Analyst');
  assert.deepEqual(g.stats(c, 0), {power: 1, toughness: 1});
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
});

test('Canary Service cannot attack and creates two Indicators when defeated', () => {
  const g = table();
  const c = put(g, 0, pt('Canary Service'));
  assert.equal(g.canAttack(0, c), false);
  c.damage = 3;
  g.settle();
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 2);
});

test('Telemetry Curator creates an Indicator when it enters', () => {
  const g = table();
  compute(g, 0, 2);
  deploy(g, 0, 'Telemetry Curator');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 1);
});

test('Behavioral Monitor has Detection and creates an Indicator when it blocks', () => {
  const g = table();
  const m = put(g, 0, pt('Behavioral Monitor'));
  g.active = 1;
  g.priority = 1;
  const a = put(g, 1, 'r5'); // Rogue Access Point, Stealth
  fight(g, [a.uid], {[a.uid]: [m.uid]});
  assert.equal(count(g, 0, 'pt-indicator'), 1);
});

test('Case Analyst gets +1/+1 the first time you retire an Indicator each turn', () => {
  const g = table();
  compute(g, 0, 4);
  const c = put(g, 0, pt('Case Analyst')),
    i1 = g.createToken(0, 'pt-indicator'),
    i2 = g.createToken(0, 'pt-indicator');
  g.activate(0, i1.uid, 'analyze');
  resolveTop(g);
  resolveTop(g);
  assert.deepEqual(g.stats(c, 0), {power: 3, toughness: 4});
  g.activate(0, i2.uid, 'analyze');
  assert.equal(g.stack.length, 1);
});

test('Lockdown Coordinator taps and locks down an opposing unit when it enters', () => {
  const g = table();
  compute(g, 0, 3);
  const foe = put(g, 1, 'b8');
  deploy(g, 0, 'Lockdown Coordinator');
  resolveTop(g);
  assert.deepEqual(
    [foe.tapped, foe.locked],
    [true, true],
  );
});

test('Restoration Lead returns a unit card with cost 2 or less from your discard to hand', () => {
  const g = table();
  compute(g, 0, 4);
  const small = put(g, 0, 'r1', 'grave'),
    big = put(g, 0, 'r7', 'grave');
  deploy(g, 0, 'Restoration Lead');
  resolveTop(g);
  assert.ok(g.players[0].hand.some(c => c.id === 'r1'));
  assert.ok(g.players[0].grave.some(c => c.uid === big.uid));
  assert.ok(!g.players[0].grave.some(c => c.uid === small.uid));
});

test('Adaptive Perimeter has Always-on only while you control an Indicator', () => {
  const g = table();
  const a = put(g, 0, pt('Adaptive Perimeter'));
  assert.equal(g.has(a, 'alwaysOn'), false);
  assert.equal(g.has(a, 'detection'), true);
  g.createToken(0, 'pt-indicator');
  assert.equal(g.has(a, 'alwaysOn'), true);
});

test('Incident Commander untaps a unit you control when you retire an Indicator', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, pt('Incident Commander'));
  const u = put(g, 0, 'r7');
  u.tapped = true;
  const i = g.createToken(0, 'pt-indicator');
  g.activate(0, i.uid, 'analyze');
  assert.equal(g.pending.kind, 'targets');
  g.choose(0, {targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.equal(u.tapped, false);
});

test('Resilient Service Mesh is Always-on and creates two Indicators when it enters', () => {
  const g = table();
  compute(g, 0, 6);
  const m = deploy(g, 0, 'Resilient Service Mesh');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 2);
  assert.equal(g.has(m, 'alwaysOn'), true);
});

test('Analysis Workbench creates an Indicator, and spends one to draw two then discard one', () => {
  const g = table();
  compute(g, 0, 4);
  const w = deploy(g, 0, 'Analysis Workbench');
  resolveTop(g);
  const i = g.players[0].field.find(c => c.id === 'pt-indicator');
  put(g, 0, 'r13', 'hand');
  g.activate(0, w.uid, 'study', {costUids: [i.uid]});
  resolveTop(g);
  assert.equal(g.pending.kind, 'discard');
});

test('Recovery Runbook archives a unit card from your discard to gain 3 capacity', () => {
  const g = table();
  compute(g, 0, 2);
  const r = put(g, 0, pt('Recovery Runbook')),
    dead = put(g, 0, 'r7', 'grave');
  g.activate(0, r.uid, 'recover', {costUids: [dead.uid]});
  assert.ok(g.players[0].archive.some(c => c.uid === dead.uid));
  resolveTop(g);
  assert.equal(g.players[0].life, 23);
});

test('Continuous Validation creates an Indicator on an opponent’s second cast in a turn', () => {
  const g = table();
  put(g, 0, pt('Continuous Validation'));
  g.active = 1;
  g.priority = 1;
  compute(g, 1, 4);
  const logs = fb('Correlate Logs');
  g.play(1, put(g, 1, logs, 'hand').uid);
  resolveTop(g);
  g.play(1, put(g, 1, logs, 'hand').uid);
  assert.equal(g.stack.at(-1).ability?.id, 'signal');
});

test('Continuous Validation gains 1 capacity the first time you retire an Indicator each turn', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, pt('Continuous Validation'));
  g.activate(0, g.createToken(0, 'pt-indicator').uid, 'analyze');
  resolveTop(g);
  assert.equal(g.players[0].life, 21);
});
```

`r5` is Rogue Access Point (Stealth). Confirm it with `BY_ID.r5.name`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/pt-blue.test.mjs`
Expected: FAIL on the missing cards.

- [ ] **Step 3: Add the blue permanents**

Append to `PERSISTENT_THREATS`, after `pt-r25`:

```js
  blue(
    'pt-b01',
    'Forensic Repository',
    0,
    'Infrastructure',
    'Enters tapped. Tap: Add 1 compute. 3 compute, Tap, retire Forensic Repository: Create two Indicators.',
    {
      entersTapped: true,
      abilities: [
        act('preserve', 'Retire for two Indicators', {compute: 3, tap: true, retire: 'self'}, [token(INDICATOR, 2)]),
      ],
    },
  ),
  blue(
    'pt-b02',
    'Instrumented Datacenter',
    0,
    'Infrastructure',
    'Enters tapped. Tap: Add 1 compute. When this enters, Probe 1.',
    {entersTapped: true, abilities: [trig('scan', 'Probe 1', 'enter', [probe(1)])]},
  ),
  blue('pt-b03', 'Alert Triage Analyst', 1, 'Unit', 'When this enters, Probe 1.', {
    ...unit('Analyst', 1, 1),
    abilities: [trig('triage', 'Probe 1', 'enter', [probe(1)])],
  }),
  blue('pt-b04', 'Canary Service', 2, 'Unit', 'Firewall. When this is defeated, create two Indicators.', {
    ...unit('Service', 0, 3),
    keywords: ['firewall'],
    abilities: [trig('alarm', 'Create two Indicators', 'defeated', [token(INDICATOR, 2)])],
  }),
  blue('pt-b05', 'Telemetry Curator', 2, 'Unit', 'When this enters, create an Indicator.', {
    ...unit('Analyst', 1, 2),
    abilities: [trig('collect', 'Create an Indicator', 'enter', [token(INDICATOR)])],
  }),
  blue(
    'pt-b06',
    'Behavioral Monitor',
    3,
    'Unit',
    'Detection. Whenever this blocks, create an Indicator. This triggers only once each turn.',
    {
      ...unit('Service', 1, 4),
      keywords: ['detection'],
      abilities: [trig('observe', 'Create an Indicator', 'block', [token(INDICATOR)], {once: true})],
    },
  ),
  blue(
    'pt-b07',
    'Case Analyst',
    3,
    'Unit',
    'Whenever you retire an Indicator, this gets +1/+1 until end of turn. This triggers only once each turn.',
    {
      ...unit('Analyst', 2, 3),
      abilities: [
        trig('analyze', '+1/+1', 'youRetire', [{op: 'buff', to: 'self', power: 1, toughness: 1}], {
          what: {id: INDICATOR},
          once: true,
        }),
      ],
    },
  ),
  blue(
    'pt-b08',
    'Lockdown Coordinator',
    3,
    'Unit',
    'When this enters, tap target opposing unit. That unit doesn’t untap during its controller’s next untap step.',
    {
      ...unit('Analyst', 2, 2),
      abilities: [
        trig('lockdown', 'Lock down a unit', 'enter', [{op: 'tap', to: 't', lock: true}], {targets: [opposingUnit]}),
      ],
    },
  ),
  blue(
    'pt-b09',
    'Restoration Lead',
    4,
    'Unit',
    'When this enters, return target unit card with printed cost 2 or less from your discard to your hand.',
    {
      ...unit('Analyst', 3, 3),
      abilities: [
        trig('restore', 'Recover a small unit', 'enter', [{op: 'recover', to: 't', zone: 'hand'}], {
          targets: [{key: 't', zone: 'grave', side: 'you', types: ['Unit'], maxCost: 2}],
        }),
      ],
    },
  ),
  blue('pt-b10', 'Adaptive Perimeter', 4, 'Unit', 'Detection. Has Always-on while you control an Indicator.', {
    ...unit('Service', 2, 5),
    keywords: ['detection'],
    when: [{keyword: 'alwaysOn', if: {control: INDICATOR}}],
  }),
  blue(
    'pt-b11',
    'Incident Commander',
    5,
    'Unit',
    'Always-on. Whenever you retire an Indicator, untap target unit you control. This triggers only once each turn.',
    {
      ...unit('Analyst', 4, 4),
      keywords: ['alwaysOn'],
      abilities: [
        trig('coordinate', 'Untap a unit', 'youRetire', [{op: 'untap', to: 't'}], {
          what: {id: INDICATOR},
          once: true,
          targets: [yourUnit],
        }),
      ],
    },
  ),
  blue('pt-b12', 'Resilient Service Mesh', 6, 'Unit', 'Always-on. When this enters, create two Indicators.', {
    ...unit('Service', 4, 6),
    keywords: ['alwaysOn'],
    abilities: [trig('mesh', 'Create two Indicators', 'enter', [token(INDICATOR, 2)])],
  }),
  // pt-b13 … pt-b22 (blue Operations and Responses) are added in Task 5, between these units and the Tools.
  blue(
    'pt-b23',
    'Analysis Workbench',
    2,
    'Tool',
    'When this enters, create an Indicator. 2 compute, Tap, retire an Indicator: Draw two cards, then discard a card.',
    {
      abilities: [
        trig('collect', 'Create an Indicator', 'enter', [token(INDICATOR)]),
        act('study', 'Draw two, then discard one', {compute: 2, tap: true, retire: {id: INDICATOR}}, [
          {op: 'draw', n: 2},
          {op: 'discard', n: 1},
        ]),
      ],
    },
  ),
  blue(
    'pt-b24',
    'Recovery Runbook',
    3,
    'Tool',
    '2 compute, Tap, archive a unit card from your discard: Gain 3 operational capacity.',
    {
      abilities: [
        act('recover', 'Gain 3 capacity', {compute: 2, tap: true, archive: {types: ['Unit']}}, [{op: 'heal', n: 3}]),
      ],
    },
  ),
  blue(
    'pt-b25',
    'Continuous Validation',
    4,
    'Control',
    'Whenever an opponent casts their second card in a turn, create an Indicator. Whenever you retire an Indicator, gain 1 operational capacity. This second ability triggers only once each turn.',
    {
      abilities: [
        trig('signal', 'Create an Indicator', 'opponentSecondCast', [token(INDICATOR)]),
        trig('verify', 'Gain 1 capacity', 'youRetire', [{op: 'heal', n: 1}], {what: {id: INDICATOR}, once: true}),
      ],
    },
  ),
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/persistent-threats.mjs tests/pt-blue.test.mjs
git add public/persistent-threats.mjs tests/pt-blue.test.mjs
git commit -m "Add the blue Persistent Threats permanents"
```

---

### Task 5: Blue Operations and Responses, and the set's shape

**Files:**
- Modify: `public/persistent-threats.mjs` (insert `pt-b13`…`pt-b22`)
- Modify: `tests/pt-blue.test.mjs` (append)
- Create: `tests/pt-set.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/pt-blue.test.mjs`:

```js
const castSpell = (g, p, name, options = {}) => {
  const c = put(g, p, pt(name), 'hand');
  g.play(p, c.uid, null, options);
  return c;
};

test('Reconstruct the Timeline probes 2 then draws; Reuse costs 4 and archives', () => {
  const g = table();
  compute(g, 0, 6);
  const c = castSpell(g, 0, 'Reconstruct the Timeline');
  resolveTop(g);
  const [top] = g.pending.options;
  g.choose(0, {discard: [], order: g.pending.options});
  assert.deepEqual(
    g.players[0].hand.map(x => x.uid),
    [top],
  );
  g.play(0, c.uid, null, {reuse: true});
  resolveTop(g);
  g.choose(0, g.defaultChoice());
  assert.ok(g.players[0].archive.some(x => x.uid === c.uid));
});

test('Preserve the Scene creates two Indicators', () => {
  const g = table();
  compute(g, 0, 2);
  castSpell(g, 0, 'Preserve the Scene');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 2);
});

test('Scoped Remediation destroys a unit costing 3 or less, or any unit overclocked', () => {
  const g = table();
  const small = put(g, 1, 'r1'),
    big = put(g, 1, 'r11');
  compute(g, 0, 3);
  const c = put(g, 0, pt('Scoped Remediation'), 'hand');
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: ref(big.uid)}}), /legal target/);
  g.play(0, c.uid, null, {targets: {t: ref(small.uid)}});
  resolveTop(g);
  assert.ok(g.players[1].grave.some(x => x.uid === small.uid));
  g.endTurn();
  g.endTurn();
  g.phase = 'main1';
  compute(g, 0, 2);
  castSpell(g, 0, 'Scoped Remediation', {overclock: true, targets: {t: ref(big.uid)}});
  resolveTop(g);
  assert.ok(g.players[1].grave.some(x => x.uid === big.uid));
});

test('Restore Trusted State returns a unit costing 3 or less tapped, or ready overclocked, as a new arrival', () => {
  const g = table();
  compute(g, 0, 10);
  const a = put(g, 0, 'r7', 'grave'),
    b = put(g, 0, 'r7', 'grave'),
    big = put(g, 0, 'r11', 'grave');
  const oldA = a.uid;
  const c = put(g, 0, pt('Restore Trusted State'), 'hand');
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: ref(big.uid)}}), /legal target/);
  g.play(0, c.uid, null, {targets: {t: ref(a.uid)}});
  resolveTop(g);
  const back = g.players[0].field.find(x => x.id === 'r7');
  assert.notEqual(back.uid, oldA);
  assert.deepEqual(
    [back.tapped, back.sick, g.canAttack(0, back)],
    [true, true, false],
  );
  castSpell(g, 0, 'Restore Trusted State', {overclock: true, targets: {t: ref(b.uid)}});
  resolveTop(g);
  assert.equal(g.players[0].field.filter(x => x.id === 'r7' && !x.tapped).length, 1);
});

test('Emergency Segmentation taps and locks down every opposing unit', () => {
  const g = table();
  compute(g, 0, 4);
  const mine = put(g, 0, 'r7'),
    a = put(g, 1, 'b1'),
    b = put(g, 1, 'b8');
  castSpell(g, 0, 'Emergency Segmentation');
  resolveTop(g);
  assert.deepEqual(
    [a.tapped, a.locked, b.tapped, b.locked, mine.tapped],
    [true, true, true, true, false],
  );
});

test('Verify Provenance counters unless paid; if paid, it creates an Indicator', () => {
  const g = table();
  g.active = 1;
  g.priority = 1;
  compute(g, 1, 4);
  const logs = put(g, 1, fb('Correlate Logs'), 'hand');
  g.play(1, logs.uid);
  g.pass(1);
  compute(g, 0, 2);
  castSpell(g, 0, 'Verify Provenance', {targets: {t: {kind: 'spell', uid: logs.uid}}});
  resolveTop(g);
  g.choose(1, {pay: true});
  assert.equal(g.stack.length, 1);
  assert.equal(count(g, 0, 'pt-indicator'), 1);
});

test('Live Response returns an opposing unit, or untaps yours with +0/+2', () => {
  const g = table();
  compute(g, 0, 4);
  const foe = put(g, 1, 'b8'),
    mine = put(g, 0, 'r7');
  mine.tapped = true;
  castSpell(g, 0, 'Live Response', {mode: 0, targets: {t: ref(foe.uid)}});
  resolveTop(g);
  assert.ok(g.players[1].hand.some(x => x.id === 'b8'));
  castSpell(g, 0, 'Live Response', {mode: 1, targets: {t: ref(mine.uid)}});
  resolveTop(g);
  assert.equal(mine.tapped, false);
  assert.equal(g.stats(mine, 0).toughness, 5);
});

test('Break the Chain destroys a Tool or Control, and overclocked archives from its controller’s discard', () => {
  const g = table();
  compute(g, 0, 4);
  const tool = put(g, 1, fb('Immutable Backup')),
    a = put(g, 1, 'b7', 'grave'),
    mine = put(g, 0, 'r7', 'grave');
  const c = put(g, 0, pt('Break the Chain'), 'hand');
  assert.throws(
    () => g.play(0, c.uid, null, {overclock: true, targets: {t: ref(tool.uid), g: [ref(mine.uid)]}}),
    /controller’s discard/,
  );
  g.play(0, c.uid, null, {overclock: true, targets: {t: ref(tool.uid), g: [ref(a.uid)]}});
  resolveTop(g);
  assert.ok(g.players[1].grave.some(x => x.uid === tool.uid));
  assert.ok(g.players[1].archive.some(x => x.uid === a.uid));
});

test('Clean-Room Analysis archives up to two cards from one discard and gains 2 capacity', () => {
  const g = table();
  compute(g, 0, 1);
  const a = put(g, 1, 'b7', 'grave'),
    b = put(g, 1, 'b8', 'grave');
  castSpell(g, 0, 'Clean-Room Analysis', {targets: {g: [ref(a.uid), ref(b.uid)]}});
  resolveTop(g);
  assert.equal(g.players[1].archive.length, 2);
  assert.equal(g.players[0].life, 22);
});

test('Continuity Plan gives +0/+3 and an Indicator; Reuse costs 4 and archives', () => {
  const g = table();
  compute(g, 0, 6);
  const u = put(g, 0, 'r7');
  const c = castSpell(g, 0, 'Continuity Plan', {targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.equal(g.stats(u, 0).toughness, 6);
  assert.equal(count(g, 0, 'pt-indicator'), 1);
  g.play(0, c.uid, null, {reuse: true, targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.ok(g.players[0].archive.some(x => x.uid === c.uid));
});
```

`tests/pt-set.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS, SETS} from '../public/cards.mjs';

const set = CARDS.filter(c => c.set === 'persistent-threats');

test('Persistent Threats has 50 cards with the design’s ids, in order, and stays unreleased', () => {
  assert.equal(SETS['persistent-threats'].released, false);
  assert.deepEqual(
    set.map(c => c.id),
    [
      ...Array.from({length: 25}, (_, i) => `pt-r${String(i + 1).padStart(2, '0')}`),
      ...Array.from({length: 25}, (_, i) => `pt-b${String(i + 1).padStart(2, '0')}`),
    ],
  );
  assert.equal(new Set(CARDS.map(c => c.name)).size, CARDS.length, 'names are unique across both sets');
});

test('each faction has 2 Infrastructure, 10 Units, 5 Operations, 5 Responses, 2 Tools and 1 Control', () => {
  for (const faction of ['red', 'blue']) {
    const byType = Object.groupBy(
      set.filter(c => c.faction === faction),
      c => c.type,
    );
    assert.deepEqual(
      Object.fromEntries(Object.entries(byType).map(([t, cs]) => [t, cs.length])),
      {Infrastructure: 2, Unit: 10, Operation: 5, Response: 5, Tool: 2, Control: 1},
      faction,
    );
  }
});

test('every expansion card is written as rules the engine can read', () => {
  for (const c of set) {
    if (['Operation', 'Response'].includes(c.type)) assert.ok(c.steps || c.modes, `${c.name} has steps`);
    if (c.type === 'Unit') assert.ok(c.power >= 0 && c.toughness > 0 && c.subtype, `${c.name} stats`);
    for (const a of c.abilities ?? []) assert.ok(a.id && a.label && a.steps?.length, `${c.name} ability ${a.id}`);
    assert.ok(c.text.length > 10, `${c.name} text`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/pt-blue.test.mjs tests/pt-set.test.mjs`
Expected: FAIL on the missing blue spells; `pt-set` fails on the id list.

- [ ] **Step 3: Add the blue spells**

Replace the comment `// pt-b13 … pt-b22 …` with:

```js
  blue('pt-b13', 'Reconstruct the Timeline', 2, 'Operation', 'Probe 2, then draw a card. Reuse 4.', {
    steps: [probe(2), {op: 'draw', n: 1}],
    reuse: 4,
  }),
  blue('pt-b14', 'Preserve the Scene', 2, 'Operation', 'Create two Indicators.', {steps: [token(INDICATOR, 2)]}),
  blue(
    'pt-b15',
    'Scoped Remediation',
    3,
    'Operation',
    'Destroy target opposing unit with printed cost 3 or less. Overclock 2: You may target and destroy any opposing unit instead.',
    {
      targets: [{...opposingUnit, maxCost: 3}],
      steps: [{op: 'destroy', to: 't'}],
      overclock: {cost: 2, instead: true, targets: [opposingUnit], steps: [{op: 'destroy', to: 't'}]},
    },
  ),
  blue(
    'pt-b16',
    'Restore Trusted State',
    4,
    'Operation',
    'Return target unit card with printed cost 3 or less from your discard to the battlefield tapped. Overclock 2: Return it ready instead.',
    {
      targets: [{key: 't', zone: 'grave', side: 'you', types: ['Unit'], maxCost: 3}],
      steps: [{op: 'recover', to: 't', zone: 'field', tapped: true}],
      overclock: {cost: 2, instead: true, steps: [{op: 'recover', to: 't', zone: 'field'}]},
    },
  ),
  blue(
    'pt-b17',
    'Emergency Segmentation',
    4,
    'Operation',
    'Tap all opposing units. They don’t untap during their controller’s next untap step.',
    {steps: [{op: 'tapAll', side: 'opponent', lock: true}]},
  ),
  blue(
    'pt-b18',
    'Verify Provenance',
    2,
    'Response',
    'Counter target Response or Operation unless its controller pays 2 compute. If they pay, create an Indicator.',
    {targets: [stackSpell], steps: [{op: 'counterUnlessPay', to: 't', amount: 2, paid: [token(INDICATOR)]}]},
  ),
  blue(
    'pt-b19',
    'Live Response',
    2,
    'Response',
    'Choose one — Return target opposing unit to its owner’s hand; or untap target unit you control and it gets +0/+2 until end of turn.',
    {
      modes: [
        {label: 'Return an opposing unit to its owner’s hand', targets: [opposingUnit], steps: [{op: 'bounce', to: 't'}]},
        {
          label: 'Untap your unit and give it +0/+2',
          targets: [yourUnit],
          steps: [
            {op: 'untap', to: 't'},
            {op: 'buff', to: 't', toughness: 2},
          ],
        },
      ],
    },
  ),
  blue(
    'pt-b20',
    'Break the Chain',
    2,
    'Response',
    'Destroy target Tool or Control. Overclock 2: Also archive up to two target cards from that permanent’s controller’s discard.',
    {
      targets: [{key: 't', zone: 'field', side: 'any', types: ['Tool', 'Control']}],
      steps: [{op: 'destroy', to: 't'}],
      overclock: {
        cost: 2,
        targets: [{key: 'g', zone: 'grave', side: 'any', upTo: 2, sameOwnerAs: 't'}],
        steps: [{op: 'archive', to: 'g'}],
      },
    },
  ),
  blue(
    'pt-b21',
    'Clean-Room Analysis',
    1,
    'Response',
    'Archive up to two target cards from a single player’s discard. Gain 2 operational capacity.',
    {
      targets: [{key: 'g', zone: 'grave', side: 'any', upTo: 2, onePlayer: true}],
      steps: [
        {op: 'archive', to: 'g'},
        {op: 'heal', n: 2},
      ],
    },
  ),
  blue(
    'pt-b22',
    'Continuity Plan',
    2,
    'Response',
    'Target unit you control gets +0/+3 until end of turn. Create an Indicator. Reuse 4.',
    {targets: [yourUnit], steps: [{op: 'buff', to: 't', toughness: 3}, token(INDICATOR)], reuse: 4},
  ),
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/persistent-threats.mjs tests/pt-blue.test.mjs tests/pt-set.test.mjs
git add public/persistent-threats.mjs tests/pt-blue.test.mjs tests/pt-set.test.mjs
git commit -m "Add the blue Persistent Threats Operations and Responses"
```

---

### Task 6: The expansion card pool and its decks

**Files:**
- Modify: `public/cards.mjs` (`POOLS`)
- Create: `tests/pt-pool.test.mjs`

**Interfaces:**
- Produces: `POOLS['first-breach+persistent-threats'] = {name: 'First Breach + Persistent Threats', optIn: 'Persistent Threats', sets: ['first-breach', 'persistent-threats'], deck}`. It is exported as `EXPANSION_POOL`, the pool id string.

- [ ] **Step 1: Write the failing tests**

`tests/pt-pool.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {BY_ID, EXPANSION_POOL, POOLS, deck, releasedCards, releasedPools} from '../public/cards.mjs';
import {Game} from '../public/engine.mjs';
import {library} from '../public/library.mjs';
import {landing} from '../public/landing.mjs';

const names = list => {
  const out = {};
  for (const id of list) out[BY_ID[id].name] = (out[BY_ID[id].name] ?? 0) + 1;
  return out;
};
const twoEach = (...cards) => Object.fromEntries(cards.map(n => [n, 2]));

test('the expansion pool uses both sets and is not offered while the set is unreleased', () => {
  assert.equal(EXPANSION_POOL, 'first-breach+persistent-threats');
  assert.deepEqual(POOLS[EXPANSION_POOL].sets, ['first-breach', 'persistent-threats']);
  assert.equal(POOLS[EXPANSION_POOL].optIn, 'Persistent Threats');
  assert.deepEqual(releasedPools(), ['first-breach']);
  assert.ok(!releasedCards().some(c => c.set === 'persistent-threats'));
  assert.doesNotMatch(landing({mode: 'solo'}), /includeExpansion/);
  assert.doesNotMatch(library({filter: {q: '', faction: 'all', type: 'all', set: 'all'}}), /setFilter/);
});

test('Persistent Access is the design’s red list', () => {
  assert.deepEqual(names(deck('red', EXPANSION_POOL)), {
    'Relay Node': 20,
    ...twoEach(
      'Ghost Relay',
      'Reconnaissance Outpost',
      'Attack Surface Mapper',
      'Beachhead Scout',
      'Staged Loader',
      'Dormant Implant',
      'Access Broker',
      'Living-off-the-Land Operator',
      'Redundant Handler',
      'Coordinated Intrusion Lead',
      'Long-Haul Campaign',
      'Phishing Courier',
      'Map Trust Relationships',
      'Seed Access',
      'Burn the Channel',
      'Exploit the Handoff',
      'Signal Spoof',
      'Reopened Connection',
      'Exfiltration Buffer',
      'Distributed Command',
    ),
  });
});

test('Indicators to Action is the design’s blue list', () => {
  assert.deepEqual(names(deck('blue', EXPANSION_POOL)), {
    'Secure Datacenter': 20,
    ...twoEach(
      'Forensic Repository',
      'Instrumented Datacenter',
      'Alert Triage Analyst',
      'Canary Service',
      'Telemetry Curator',
      'Behavioral Monitor',
      'Case Analyst',
      'Lockdown Coordinator',
      'Restoration Lead',
      'Incident Commander',
      'Resilient Service Mesh',
      'Incident Responder',
      'Reconstruct the Timeline',
      'Preserve the Scene',
      'Scoped Remediation',
      'Verify Provenance',
      'Live Response',
      'Break the Chain',
      'Analysis Workbench',
      'Continuous Validation',
    ),
  });
});

test('a match on the expansion pool deals from the expansion decks', () => {
  const g = new Game('red', Math.random, {pool: EXPANSION_POOL});
  for (const q of g.players) assert.equal(q.deck.length + q.hand.length, 60);
  assert.ok(
    [...g.players[0].deck, ...g.players[0].hand].some(c => BY_ID[c.id].set === 'persistent-threats'),
  );
});
```

The Plan 1 catalog test `every pool deck is legal` now checks the new pool too.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/pt-pool.test.mjs`
Expected: FAIL. `EXPANSION_POOL` is not exported.

- [ ] **Step 3: Add the pool**

In `public/cards.mjs`, after the `POOLS` declaration:

```js
// The design's two mixed decks: 24 infrastructure, 20 units and 16 other cards each.
const RECIPES = {
  red: [
    ['Relay Node', 20],
    ...[
      'Ghost Relay',
      'Reconnaissance Outpost',
      'Attack Surface Mapper',
      'Beachhead Scout',
      'Staged Loader',
      'Dormant Implant',
      'Access Broker',
      'Living-off-the-Land Operator',
      'Redundant Handler',
      'Coordinated Intrusion Lead',
      'Long-Haul Campaign',
      'Phishing Courier',
      'Map Trust Relationships',
      'Seed Access',
      'Burn the Channel',
      'Exploit the Handoff',
      'Signal Spoof',
      'Reopened Connection',
      'Exfiltration Buffer',
      'Distributed Command',
    ].map(n => [n, 2]),
  ],
  blue: [
    ['Secure Datacenter', 20],
    ...[
      'Forensic Repository',
      'Instrumented Datacenter',
      'Alert Triage Analyst',
      'Canary Service',
      'Telemetry Curator',
      'Behavioral Monitor',
      'Case Analyst',
      'Lockdown Coordinator',
      'Restoration Lead',
      'Incident Commander',
      'Resilient Service Mesh',
      'Incident Responder',
      'Reconstruct the Timeline',
      'Preserve the Scene',
      'Scoped Remediation',
      'Verify Provenance',
      'Live Response',
      'Break the Chain',
      'Analysis Workbench',
      'Continuous Validation',
    ].map(n => [n, 2]),
  ],
};
const idOf = name => cards.find(c => c.name === name).id;
export const EXPANSION_POOL = 'first-breach+persistent-threats';
POOLS[EXPANSION_POOL] = {
  name: 'First Breach + Persistent Threats',
  optIn: 'Persistent Threats',
  sets: ['first-breach', 'persistent-threats'],
  deck: faction => RECIPES[faction].flatMap(([name, n]) => Array(n).fill(idOf(name))),
};
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, including the Plan 1 catalog tests and the golden test.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/cards.mjs tests/pt-pool.test.mjs
git add public/cards.mjs tests/pt-pool.test.mjs
git commit -m "Add the Persistent Threats card pool with its two decks"
```

---

### Task 7: The computer opponent plays the new cards

**Files:**
- Modify: `public/engine.mjs` (`aiAction(p = 1)`; new `aiChoice`, `aiPlan`, `aiTargets`, `aiWorthIt`, `aiAbility`)
- Create: `tests/pt-ai.test.mjs`

**Interfaces:**
- Consumes: the rules helpers `candidates`, `spellRule`, `isRule`, `retireOptions`, `archiveOptions`, `pickedTargets` (add any not yet imported to the engine's rules import).
- Produces:
  - `g.aiAction(p = 1)`, which plays for any seat. `app.mjs` keeps calling `aiAction()` for player 1.
  - `g.aiChoice()`: the computer's answer to its pending choice.

- [ ] **Step 1: Write the failing tests**

`tests/pt-ai.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {compute, put, resolveTop, table} from './helpers/rules.mjs';

const pt = name => CARDS.find(c => c.name === name).id;
// Player 1's main phase with priority.
function computerTurn() {
  const g = table();
  Object.assign(g, {active: 1, priority: 1});
  return g;
}

test('the computer plays for either seat', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, pt('Seed Access'), 'hand');
  g.aiAction(0);
  assert.equal(g.stack[0]?.card.id, pt('Seed Access'));
});

test('the computer casts untargeted expansion Operations in its main phase', () => {
  const g = computerTurn();
  compute(g, 1, 2);
  put(g, 1, pt('Preserve the Scene'), 'hand');
  g.aiAction();
  assert.equal(g.stack[0].card.id, pt('Preserve the Scene'));
});

test('the computer aims removal at the opponent’s most expensive unit it can defeat', () => {
  const g = computerTurn();
  compute(g, 1, 3);
  put(g, 0, 'r1');
  const big = put(g, 0, 'r7'); // 3/3: 4 damage defeats it
  put(g, 1, pt('Coordinated Pressure'), 'hand');
  g.aiAction();
  assert.deepEqual(g.stack[0].opts.targets, {t: {kind: 'card', uid: big.uid}});
});

test('the computer counters the opponent’s spell with a soft counter, and pays for its own', () => {
  const g = table();
  compute(g, 0, 2);
  const draw = put(g, 0, 'r16', 'hand'); // Open Source Recon
  g.play(0, draw.uid);
  g.pass(0);
  compute(g, 1, 2);
  put(g, 1, pt('Verify Provenance'), 'hand');
  g.aiAction();
  assert.deepEqual(g.stack.at(-1).opts.targets, {t: {kind: 'spell', uid: draw.uid}});
});

test('the computer answers its own pending choices', () => {
  const g = computerTurn();
  compute(g, 1, 2);
  put(g, 1, pt('Reconstruct the Timeline'), 'hand');
  g.aiAction();
  g.pass(1);
  g.pass(0);
  assert.equal(g.pending?.actor, 1);
  g.aiAction();
  assert.equal(g.pending, null);
});

test('the computer boosts an attacker with a Backdoor before combat, and analyzes Indicators after', () => {
  const g = computerTurn();
  compute(g, 1, 3);
  const u = put(g, 1, 'r7');
  const b = g.createToken(1, 'pt-backdoor');
  g.aiAction();
  assert.equal(g.stack[0]?.ability?.id, 'boost');
  assert.deepEqual(g.stack[0].opts.targets, {t: {kind: 'card', uid: u.uid}});
  assert.ok(!g.players[1].field.includes(b));
  resolveTop(g);
  g.phase = 'main2';
  const i = g.createToken(1, 'pt-indicator');
  g.aiAction();
  assert.equal(g.stack[0]?.ability?.id, 'analyze');
  assert.ok(!g.players[1].field.includes(i));
});

test('the computer never retires its own infrastructure for tokens', () => {
  const g = computerTurn();
  g.phase = 'main2';
  put(g, 1, pt('Forensic Repository'));
  compute(g, 1, 3);
  g.aiAction();
  assert.equal(g.stack.length, 0);
});
```

`r16` is Open Source Recon (red, draw two, cost 2). Confirm with `BY_ID.r16.name`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/pt-ai.test.mjs`
Expected: FAIL. `aiAction(0)` does nothing, and rule cards are never cast.

- [ ] **Step 3: Generalise `aiAction` to any seat**

Change the signature to `aiAction(p = 1)` and replace the opening lines:

```js
  aiAction(p = 1) {
    if (this.actor() !== p || this.winner !== null) return;
    if (this.pending) return this.choose(p, this.aiChoice());
    const q = 1 - p,
      me = this.players[p],
      foe = this.players[q];
```

Through the rest of the method, replace each hard-coded seat:
- `this.discard(…)` is unchanged.
- `this.canAttack(1, c)` → `this.canAttack(p, c)`; `this.stats(c, 1)` → `this.stats(c, p)`; `this.attackers(1, …)` → `this.attackers(p, …)`.
- In blocking: `this.stats(a.card, 0)` → `this.stats(a.card, q)`; every `this.stats(b, 1)`/`this.stats(c, 1)` → `this.stats(…, p)`; `this.blockers(1, …)` → `this.blockers(p, …)`.
- `this.legal(1, c)` → `this.legal(p, c)`; `this.active === 1` → `this.active === p`; `this.targets(1, c)` → `this.targets(p, c)`.
- `s.p === 0` → `s.p === q`; `this.find(t.uid)?.p === 0` → `=== q`; `this.stats(this.find(t.uid).card, 0)` → `(…, q)`; `this.active === 0` → `this.active === q`.
- `f.p === (d.powerBoost > 0 ? 1 : 0)` → `f.p === (d.powerBoost > 0 ? p : q)`.

In the main-phase Infrastructure pick, prefer infrastructure that enters ready:

```js
      selected = legal
        .filter(c => this.data(c).type === 'Infrastructure')
        .sort((a, b) => !!this.data(a).entersTapped - !!this.data(b).entersTapped)[0];
```

(`sort` is stable, so a First Breach hand picks the same card as before.)

Replace the method's last two lines (`if (selected) this.play(1, …); else this.pass(1);`) with:

```js
    if (selected) return this.play(p, selected.uid, target);
    // Expansion cards: a rule spell with a useful plan, one cast again from the discard, then an ability.
    for (const c of legal) {
      if (!isRule(this.data(c))) continue;
      const plan = this.aiPlan(p, c, main);
      if (plan) return this.play(p, c.uid, null, plan);
    }
    for (const c of me.grave) {
      if (this.data(c).reuse == null || !isRule(this.data(c))) continue;
      const plan = this.aiPlan(p, c, main, true);
      if (plan) return this.play(p, c.uid, null, {...plan, reuse: true});
    }
    const ability = main && this.aiAbility(p);
    if (ability) return this.activate(p, ability.uid, ability.id, ability.options);
    this.pass(p);
  }
```

- [ ] **Step 4: Add the helpers**

After `aiAction`:

```js
  // The computer's answer to its own pending choice: the fixed default, except that it pays when asked
  // (it is only asked when it can) and takes an optional retire.
  aiChoice() {
    const c = this.pending;
    if (c.kind === 'pay') return {pay: true};
    if (c.kind === 'optional') return {uid: c.options[0]};
    return this.defaultChoice(c);
  }
  // A way to cast a rule card that does something useful now: {mode?, overclock?, targets, costUids}, or null.
  aiPlan(p, c, main, reuse = false) {
    const d = this.data(c);
    for (const mode of d.modes ? d.modes.map((_, i) => i) : [null])
      for (const overclock of d.overclock ? [true, false] : [false]) {
        const o = {mode, overclock, reuse};
        if (this.playIssues(p, c, o).length) continue;
        const rule = spellRule(d, o),
          targets = this.aiTargets(p, rule);
        if (!targets || !this.aiWorthIt(p, d, rule, targets, main)) continue;
        const costUids = [];
        if (d.extraCost?.retire) {
          const pick = retireOptions(this, p, d.extraCost.retire).sort(
            (a, b) => !!this.data(b).token - !!this.data(a).token || this.data(a).cost - this.data(b).cost,
          )[0];
          if (!pick || pickedTargets(targets).includes(pick.uid)) continue;
          costUids.push(pick.uid);
        }
        return {...(d.modes ? {mode} : {}), ...(overclock ? {overclock} : {}), targets, costUids};
      }
    return null;
  }
  // Targets chosen by what the steps do to them: harm the opponent's best, help your own units in combat,
  // recover your best card. null when a required target has no sensible choice.
  aiTargets(p, rule) {
    const targets = {},
      own = t => this.find(t.uid)?.p === p,
      cost = t => this.data(this.find(t.uid).card).cost,
      byCost = (a, b) => cost(b) - cost(a),
      fighting = t => this.attacks.includes(t.uid) || Object.values(this.blocks).flat().includes(t.uid);
    for (const spec of rule.targets) {
      const ops = rule.steps.filter(s => s.to === spec.key).map(s => s.op);
      let options = candidates(this, p, spec);
      if (spec.zone === 'stack')
        options = options.filter(t => this.stack.find(s => s.card?.uid === t.uid)?.p !== p).reverse();
      else if (spec.zone === 'grave')
        options = ops.includes('recover') ? options.filter(own).sort(byCost) : options.filter(t => !own(t));
      else if (ops.some(op => op === 'buff' || op === 'untap'))
        options = options.filter(t => own(t) && this.phase === 'afterBlock' && fighting(t));
      else if (spec.side === 'you') options = [];
      else {
        options = options.filter(t => !own(t)).sort(byCost);
        const hit = rule.steps.find(s => s.op === 'damage' && s.to === spec.key);
        if (hit)
          options = options.filter(t => {
            const u = this.find(t.uid).card;
            const amount = hit.tappedAmount != null && u.tapped ? hit.tappedAmount : hit.amount;
            return this.stats(u, 1 - p).toughness - u.damage <= amount;
          });
      }
      if (spec.upTo) {
        let list = options;
        const ownerOf = t => this.find(t.uid).p;
        if (spec.sameOwnerAs) list = targets[spec.sameOwnerAs] ? list.filter(t => ownerOf(t) === ownerOf(targets[spec.sameOwnerAs])) : [];
        if (spec.onePlayer && list.length) list = list.filter(t => ownerOf(t) === ownerOf(list[0]));
        targets[spec.key] = list.slice(0, spec.upTo);
      } else if (options.length) targets[spec.key] = options[0];
      else if (!spec.optional) return null;
    }
    return targets;
  }
  aiWorthIt(p, d, rule, targets, main) {
    const ops = rule.steps.map(s => s.op);
    const wipe = rule.steps.find(s => s.op === 'damageAll');
    if (wipe) {
      const lost = q =>
        this.players[q].field
          .filter(c => this.data(c).type === 'Unit' && this.stats(c, q).toughness - c.damage <= wipe.amount)
          .reduce((sum, c) => sum + this.data(c).cost, 0);
      return main && lost(1 - p) > lost(p);
    }
    if (ops.includes('tapAll'))
      return (
        this.phase === 'main1' &&
        this.players[1 - p].field.filter(c => this.data(c).type === 'Unit' && !c.tapped).length >= 2
      );
    const aimed = Object.values(targets).some(v => (Array.isArray(v) ? v.length : v));
    if (rule.targets.length) return aimed;
    return main;
  }
  // An activated ability worth using now: boosts before combat, everything else after it. Infrastructure that
  // retires itself would lose a compute source for good, so the computer leaves it.
  aiAbility(p) {
    for (const c of this.players[p].field) {
      const d = this.data(c);
      for (const a of d.abilities ?? []) {
        if (a.kind !== 'activated' || this.activationIssues(p, c.uid, a.id).length) continue;
        const cost = a.cost ?? {};
        if (cost.retire === 'self' && d.type === 'Infrastructure') continue;
        if (a.steps.some(s => s.op === 'heal') && this.players[p].life > 14) continue;
        if (a.steps.some(s => s.op === 'buff') !== (this.phase === 'main1')) continue;
        const targets = {};
        let ok = true;
        for (const spec of a.targets ?? []) {
          const attackers = candidates(this, p, spec)
            .filter(t => this.canAttack(p, this.find(t.uid).card))
            .sort((x, y) => this.stats(this.find(y.uid).card, p).power - this.stats(this.find(x.uid).card, p).power);
          if (!attackers.length) ok = false;
          else targets[spec.key] = attackers[0];
        }
        if (!ok) continue;
        const picks = [];
        if (cost.retire && cost.retire !== 'self') {
          const r = retireOptions(this, p, cost.retire, c.uid)[0];
          if (!r) continue;
          picks.push(r.uid);
        }
        if (cost.archive) {
          const r = archiveOptions(this, p, cost.archive)[0];
          if (!r) continue;
          picks.push(r.uid);
        }
        if (picks.some(u => pickedTargets(targets).includes(u))) continue;
        return {uid: c.uid, id: a.id, options: {targets, costUids: picks}};
      }
    }
    return null;
  }
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. The golden test stays unchanged, because a First Breach hand never reaches the new branches.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/engine.mjs tests/pt-ai.test.mjs
git add public/engine.mjs tests/pt-ai.test.mjs
git commit -m "Teach the computer opponent to play the expansion cards"
```

---

### Task 8: Complete seeded matches on the expansion pool

**Files:**
- Modify: `tests/helpers/simulate.mjs` (add `aiMatch`)
- Create: `tests/pt-matches.test.mjs`

**Interfaces:**
- Consumes: `aiAction(p)` (Task 7), `EXPANSION_POOL` (Task 6), `conserved` (Plan 2).
- Produces: `aiMatch(seed, {faction, first, pool, check})` returns the finished game. `check(g, step)` runs every 25 actions.

- [ ] **Step 1: Add the driver**

Append to `tests/helpers/simulate.mjs`:

```js
// A complete seeded match with the computer playing both seats. `check(g, step)` runs every 25 actions.
export function aiMatch(seed, {faction = 'red', first = 0, pool = 'first-breach', check = () => {}} = {}) {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const g = new Game(faction, rng, {first, pool});
  g.keep();
  for (let step = 0; step < 20000 && g.winner === null; step++) {
    g.aiAction(g.actor());
    if (step % 25 === 0) check(g, step);
  }
  return g;
}
```

- [ ] **Step 2: Write the tests**

`tests/pt-matches.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {BY_ID, EXPANSION_POOL} from '../public/cards.mjs';
import {Game} from '../public/engine.mjs';
import {aiMatch, conserved} from './helpers/simulate.mjs';

// Saves mid-match, restores, and compares: tokens, the archive and pending choices must all survive.
const roundTrip = g => assert.deepEqual(Game.fromJSON(g.toJSON()).toJSON(), g.toJSON());
const check = label => (g, step) => {
  for (const p of [0, 1]) assert.equal(conserved(g, p), 60, `${label}: player ${p} cards at step ${step}`);
  roundTrip(g);
};

test('complete expansion matches finish for both factions and both starting players', () => {
  const seen = new Set();
  for (const faction of ['red', 'blue'])
    for (const first of [0, 1])
      for (let seed = 1; seed <= 5; seed++) {
        const label = `${faction} first=${first} seed=${seed}`;
        const g = aiMatch(seed, {faction, first, pool: EXPANSION_POOL, check: check(label)});
        assert.notEqual(g.winner, null, `${label} finished`);
        for (const p of [0, 1]) assert.equal(conserved(g, p), 60, `${label}: final card count`);
        for (const line of g.log) for (const c of Object.values(BY_ID)) if (line.includes(c.name)) seen.add(c.set);
      }
  assert.ok(seen.has('persistent-threats'), 'expansion cards were actually played');
});

test('the computer plays First Breach exactly as before when it plays both seats', () => {
  const g = aiMatch(3, {check: check('first-breach')});
  assert.notEqual(g.winner, null);
});
```

This test passes against the finished Tasks 1–7; it is a system check rather than a unit under construction. If it fails, the failure is a real bug: a deadlock, a lost card, or a save that doesn't round-trip. Fix the cause in the card data or engine code, add a focused regression test next to the relevant card test, and never loosen these assertions.

- [ ] **Step 3: Run the tests**

Run: `node --test tests/pt-matches.test.mjs`
Expected: PASS. If a seed fails, reproduce it alone and fix the cause. Common suspects:
- a trigger whose targets leave no legal choice;
- an ability the computer re-activates forever;
- a choice whose `aiChoice` answer `choose` rejects.

Run: `npm test`
Expected: PASS, including the golden test.

- [ ] **Step 4: Commit**

```bash
npx --yes prettier@3.9.9 --write tests/helpers/simulate.mjs tests/pt-matches.test.mjs
git add tests/helpers/simulate.mjs tests/pt-matches.test.mjs
git commit -m "Play complete seeded matches on the expansion pool"
```

---

## Finishing

- [ ] Run `npm test && npm run typecheck` and the Prettier check on the branch tip. The golden test must show the original hash.
- [ ] Append to this plan a short "Follow-ups" section for Plans 4–6. Include everything the reviews defer, and the balance observations from Task 8 (win rates by faction and seat over the 20 matches, and whether any card never got cast).
- [ ] Use superpowers:finishing-a-development-branch.
