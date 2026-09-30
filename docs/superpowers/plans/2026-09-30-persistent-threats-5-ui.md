# Persistent Threats, Plan 5: The Expansion Interface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person play the expansion in the browser, solo or with a friend:
- choose how to cast a card (mode, Overclock, Reuse) with its total cost, targets and cost cards;
- activate token and card abilities from an explicit button;
- answer every pending choice (Probe, discard, pay, optional retire, trigger order, trigger targets);
- see ability entries on the stack, tokens, locked-down units, granted keywords and the archive.

First Breach looks and plays exactly as before.

**Architecture:**
- **Two new pure modules** turn engine state into interface data:
  - `public/prepare.mjs` builds, for each card or ability, the ways to cast or activate it: options, total cost, blocking issues and the selectors the player must fill. It also turns picks into engine options. This is the `actionOptions` role the Plan 2 roadmap moved here.
  - `public/choices.mjs` holds the state of an open choice (what's selected and in what order) and turns it into a `choose()` selection.
- **One new view module**, `public/expansion-view.mjs`, renders the preparation dialog, the choice dialog, card-dialog actions and the archive.
- `arena-view.mjs`, `card-view.mjs`, `motion.mjs`, `tutorial.mjs` and `app.mjs` gain small, targeted changes.
- Everything in the three new modules is pure and unit-tested. The DOM wiring in `app.mjs` is verified in the browser.

**Tech Stack:** Plain ES modules and CSS, no dependencies, `node --test` (Node ≥ 22), Prettier 3.9.9, the in-app browser for verification.

**Spec:** `docs/design/persistent-threats.md`, "Presentation and accessibility". The Plan 3 and Plan 4 follow-ups for Plan 5, at the end of `docs/superpowers/plans/2026-09-30-persistent-threats-3-cards.md` and `…-4-versus.md`, are inputs.

## Global Constraints

- First Breach is unchanged. Hand, battlefield, stack, dialogs and command bar render identical markup for First Breach states (existing view tests must pass unchanged), and the cast flow for First Breach cards stays the existing target dialog. `tests/first-breach-golden.test.mjs` passes.
- Spec wording:
  - "Casting a card with Overclock offers **Standard — total cost** and **Overclocked — total cost**, with the resulting rules visible. Choose targets and sacrifice/archive costs before committing resources. Canceling this preparation spends nothing."
  - "Dragging a card or token to the battlefield never silently chooses escalation, mode, or a sacrifice. Reuse the existing target picker for required decisions. Already-played tokens activate from an explicit button, not by dragging them as if they were hand cards."
  - "The discard viewer marks playable Replay [Reuse] cards, displays total costs, and explains missing timing, compute, or targets. Provide a separate read-only archive viewer."
  - "Probe displays only to the choosing player; support move-to-discard, reorder, and confirm with keyboard and touch controls."
  - "Pause automatic passing while a choice is pending. Include 'choose not to pay' for soft counters."
  - "Keep card text, counters, and status visible … Show modified stats, 'skips next untap', token identity, and activation availability. Never rely on color alone."
  - "Group identical tokens visually with a count, but let players inspect and select each individual token when paying a cost."
- Every control is a real `<button>` or form control, reachable by keyboard, with text or an `aria-label`. State is never shown by colour alone.
- Numbers from a host's view (`count`, `min`, `max`) are only printed, never looped over. The Plan 4 follow-up says a malicious host can make them huge.
- Lore, art, the Field Guide and advanced lessons are Plan 6. Cards without lore must render without the text "undefined".
- The set stays unreleased. Browser checks use a temporary local `released: true` in `public/cards.mjs` that is **never committed**; check `git diff` is clean before each commit.
- Format only files you change (`npx --yes prettier@3.9.9 --write <files>`), never `npm run format`, never `git stash`, and stage only your files. Commit messages: an imperative sentence in sentence case, no prefix.

## Review Focus

1. **The match can never stall on the interface.** A pending choice for the player always has a way to be answered, even after its dialog is closed, and auto-pass never skips it. Tasks 5 and 6.
2. **Cancelling a preparation or closing a dialog spends nothing and changes nothing.** Tasks 4 and 6.
3. **Screen-reader and keyboard users can do everything.** Every new control is a labelled button, and choosing a way, picking targets and reordering Probe cards all work without a pointer. Tasks 4–6.
4. **A card or token without lore, art or a `.card` field** (ability entries, tokens, unreleased cards) never breaks rendering or animation. Task 1.
5. **Play-a-friend.** The same dialogs work on the guest's seat, and the other player's private choice shows only "choosing…", never cards. Tasks 5 and 6.

---

## File map

| File | Change |
|---|---|
| `public/prepare.mjs` (new) | `castWays`, `abilityWays`, `togglePick`, `ready`, `toOptions` |
| `public/choices.mjs` (new) | `choiceCards`, `startChoice`, `toggleChoice`, `moveChoice`, `pickChoiceTarget`, `choiceReady`, `choiceSelection` |
| `public/expansion-view.mjs` (new) | `stackItem`, `prepDialog`, `choiceDialog`, `cardActions`, `archiveDialog`, `tokenGroups` |
| `public/arena-view.mjs` | Stack uses `stackItem`; archive pile; card dialog appends `cardActions`; discard dialog passes `zone: 'grave'`; hint and button for pending choices; tokens grouped in `zone` |
| `public/card-view.mjs` | Live keywords, "skips next untap", token type, "ability ready" badge; hover preview without flavor; Reuse cards marked playable in the discard |
| `public/lore-panel.mjs` | A card without lore renders a short notice |
| `public/motion.mjs`, `public/tutorial.mjs` | Ignore stack entries without a card |
| `public/app.mjs` | The preparation flow, choice flow, card-dialog action buttons, discard/archive clicks, and `advance` opening a pending choice |
| `public/arena.css` | Styles for the new dialogs, token groups, archive pile and badges |
| `tests/expansion-ui.test.mjs` (new) | Tasks 1–5 |

Shared test setup for `tests/expansion-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {Tutorial} from '../public/tutorial.mjs';
import {compute, put, resolveTop, table} from './helpers/rules.mjs';

const pt = name => CARDS.find(c => c.name === name).id;
const ref = uid => ({kind: 'card', uid});
const state = (game, extra = {}) => ({
  game,
  versus: null,
  selected: new Set(),
  blocks: {},
  blocker: null,
  inspect: 'b3',
  inspectorOpen: false,
  loreSide: 'flavor',
  pauseAll: false,
  tutorial: false,
  guidance: new Tutorial(),
  filter: {q: '', faction: 'all', type: 'all'},
  ...extra,
});
```

---

### Task 1: Ability entries and cards without lore

**Files:**
- Create: `public/expansion-view.mjs` (`stackItem`)
- Modify: `public/arena-view.mjs` (the stack uses `stackItem`)
- Modify: `public/motion.mjs` (`snapshot`), `public/tutorial.mjs` (`observe`)
- Modify: `public/card-view.mjs` (`hoverCard`), `public/lore-panel.mjs` (`lorePanel`)
- Create: `tests/expansion-ui.test.mjs`

**Interfaces:**
- Produces `stackItem(s, entry)`, which renders any stack entry. For a First Breach entry the markup is byte-identical to today's.

- [ ] **Step 1: Write the failing tests**

`tests/expansion-ui.test.mjs`: add the shared setup above, then:

```js
import * as arena from '../public/arena-view.mjs';
import {stackItem} from '../public/expansion-view.mjs';
import {hoverCard} from '../public/card-view.mjs';
import {lorePanel} from '../public/lore-panel.mjs';
import {Tutorial as T} from '../public/tutorial.mjs';

test('the stack shows abilities, Overclock and Reuse, and First Breach entries exactly as before', () => {
  const g = table();
  compute(g, 0, 8);
  const foe = put(g, 1, 'b8');
  const fb = put(g, 0, 'r14', 'hand'); // Exploit Window
  g.play(0, fb.uid, {kind: 'card', uid: foe.uid});
  assert.equal(
    stackItem(state(g), g.stack[0]),
    `<div class="stack-item" data-motion-uid="${fb.uid}"><strong>Exploit Window</strong>You → Forensic Investigator</div>`,
  );
  const u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  g.activate(0, b.uid, 'boost', {targets: {t: ref(u.uid)}});
  const html = stackItem(state(g), g.stack.at(-1));
  assert.match(html, /Backdoor \(Boost a unit\)/);
  assert.match(html, /Ability/);
  assert.match(html, /→ Lateral Mover/);
  assert.doesNotMatch(html, /data-motion-uid/);
  assert.match(arena.battlefield(state(g)), /Backdoor \(Boost a unit\)/);
  while (g.stack.length) resolveTop(g); // Operations need an empty stack
  const cp = put(g, 0, pt('Coordinated Pressure'), 'hand');
  g.play(0, cp.uid, null, {overclock: true, targets: {t: ref(foe.uid)}});
  assert.match(stackItem(state(g), g.stack.at(-1)), /Overclocked/);
});

test('animation snapshots and tutorial tracking ignore stack entries without a card', async () => {
  const g = table();
  compute(g, 0, 1);
  const u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  const guide = new T(true),
    before = guide.capture(g);
  g.activate(0, b.uid, 'boost', {targets: {t: ref(u.uid)}});
  assert.doesNotThrow(() => guide.observe(g, before));
  const {snapshot} = await import('../public/motion.mjs');
  globalThis.document ??= {querySelectorAll: () => [], querySelector: () => null};
  assert.doesNotThrow(() => snapshot(g));
});

test('a card without lore renders without “undefined”', () => {
  const g = table();
  const c = put(g, 0, pt('Seed Access'), 'hand');
  const el = {dataset: {card: c.id, zone: 'hand', uid: String(c.uid)}};
  assert.doesNotMatch(hoverCard(state(g), el), /undefined/);
  assert.doesNotMatch(lorePanel(CARDS.find(x => x.id === c.id)), /undefined/);
});
```

`r14` is Exploit Window and `b8` is Forensic Investigator. If `motion.mjs`'s `snapshot` needs more DOM than the stub provides (`nodes()`, `rect()`), stub exactly what it calls, or test it with a tiny fake game whose stack holds one ability entry. The assertion is that it doesn't throw on an entry without `card`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: FAIL. `expansion-view.mjs` doesn't exist, and `snapshot` or `observe` throw on `s.card.uid`.

- [ ] **Step 3: Implement**

`public/expansion-view.mjs`:

```js
// public/expansion-view.mjs
// Interface markup for the expansion's rules: stack entries, preparing a cast or activation, pending choices,
// card-dialog actions and the archive. Pure strings, so it can be tested without a browser.
import {esc} from './html.mjs';

const who = (s, p) => (p === 0 ? 'You' : s.versus ? 'Opponent' : 'Computer');

// Any stack entry. A First Breach spell renders exactly as it always has.
export function stackItem(s, e) {
  const {game} = s;
  const targets = e.opts
    ? Object.values(e.opts.targets ?? {})
        .flat()
        .map(t => game.targetName(t))
    : e.target
      ? [game.targetName(e.target)]
      : [];
  const tags = [e.ability && 'Ability', e.opts?.overclock && 'Overclocked', e.opts?.reuse && 'Reuse'].filter(Boolean);
  return `<div class="stack-item${e.ability ? ' ability' : ''}"${e.card ? ` data-motion-uid="${e.card.uid}"` : ''}><strong>${esc(game.entryName(e))}</strong>${who(s, e.p)}${tags.length ? ` · ${tags.join(' · ')}` : ''}${targets.length ? ' → ' + targets.map(esc).join(', ') : ''}</div>`;
}
```

In `arena-view.mjs`, import `stackItem` and replace the `.map(s => \`<div class="stack-item" …\`)` callback in `battlefield` with `.map(e => stackItem(s, e))`. (The callback's parameter used to shadow `s`; renaming it is part of the change.)

`motion.mjs` `snapshot`: `game.stack.forEach(s => cards.set(s.card.uid, …))` becomes `game.stack.forEach(s => s.card && cards.set(s.card.uid, {zone: 'stack', owner: s.p}));`.

`tutorial.mjs` `observe`: `g.stack.filter(s => s.p === 0 && before.hand.has(s.card.uid))` becomes `g.stack.filter(s => s.p === 0 && s.card && before.hand.has(s.card.uid))`.

`card-view.mjs` `hoverCard`: render the flavor blockquote only when `d.flavor` is set: `${d.flavor ? `<blockquote class="preview-flavor">“${esc(d.flavor)}”</blockquote>` : ''}`.

`lore-panel.mjs` `lorePanel`: at the top, add:

```js
  // Unreleased cards have no story yet; say so rather than print "undefined".
  if (!d.lesson)
    return `<section class="lore ${d.faction}" aria-label="${esc(d.name)} story and lesson"><p class="muted">This card’s story and security lesson arrive with its release.</p></section>`;
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, including the existing view tests, which are unchanged for First Breach.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/expansion-view.mjs public/arena-view.mjs public/motion.mjs public/tutorial.mjs public/card-view.mjs public/lore-panel.mjs tests/expansion-ui.test.mjs
git add public/expansion-view.mjs public/arena-view.mjs public/motion.mjs public/tutorial.mjs public/card-view.mjs public/lore-panel.mjs tests/expansion-ui.test.mjs
git commit -m "Show ability entries on the stack and cards without lore"
```

---

### Task 2: Preparing casts and activations as data

**Files:**
- Create: `public/prepare.mjs`
- Modify: `tests/expansion-ui.test.mjs` (append)

**Interfaces:**
- Produces:
  - `castWays(game, p, card, zone = 'hand')` returns `Way[]`, or `[]` for a First Breach card.
  - `abilityWays(game, p, card)` returns `Way[]`, one per activated ability, each with an `abilityId`.
  - A `Way` is `{key, label, options, totalCost, issues: [{code, message}], selectors: Selector[], abilityId?}`.
  - A `Selector` is `{key, kind: 'target' | 'retire' | 'archive', label, min, max, many, candidates: [{kind, uid, label}]}`.
  - `togglePick(way, picks, selectorKey, index)` returns new picks, where picks are `{[selectorKey]: number[]}` of candidate indexes.
  - `ready(way, picks)` returns a boolean.
  - `toOptions(way, picks)` returns engine options `{...way.options, targets, costUids}`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/expansion-ui.test.mjs`:

```js
import {abilityWays, castWays, ready, toOptions, togglePick} from '../public/prepare.mjs';

test('a card with Overclock offers Standard and Overclocked, each with its total cost and targets', () => {
  const g = table();
  compute(g, 0, 4);
  const foe = put(g, 1, 'b8');
  const c = put(g, 0, pt('Coordinated Pressure'), 'hand');
  const ways = castWays(g, 0, c);
  assert.deepEqual(
    ways.map(w => [w.label, w.totalCost]),
    [
      ['Standard', 3],
      ['Overclocked', 5],
    ],
  );
  assert.deepEqual(ways[0].issues, []);
  assert.deepEqual(
    ways[1].issues.map(i => i.code),
    ['compute'],
  );
  assert.deepEqual(ways[0].selectors[0], {
    key: 't',
    kind: 'target',
    label: 'Choose a target',
    min: 1,
    max: 1,
    many: false,
    candidates: [{kind: 'card', uid: foe.uid, label: 'Forensic Investigator'}],
  });
  assert.equal(ready(ways[0], {}), false);
  const picks = togglePick(ways[0], {}, 't', 0);
  assert.equal(ready(ways[0], picks), true);
  assert.deepEqual(toOptions(ways[0], picks), {targets: {t: ref(foe.uid)}, costUids: []});
});

test('a way with no legal target explains why, so Overclock-only casts are steered, not chosen silently', () => {
  const g = table();
  compute(g, 0, 5);
  put(g, 1, 'r11'); // cost 5: only Overclock reaches it
  const ways = castWays(g, 0, put(g, 0, pt('Scoped Remediation'), 'hand'));
  assert.deepEqual(
    ways[0].issues.map(i => i.code),
    ['target'],
  );
  assert.deepEqual(ways[1].issues, []);
});

test('modes, extra retire costs, up-to targets and Reuse all become selectors and options', () => {
  const g = table();
  compute(g, 0, 8);
  const foe = put(g, 1, 'b8'),
    mine = put(g, 0, 'r7');
  mine.tapped = true;
  const live = castWays(g, 0, put(g, 0, pt('Live Response'), 'hand'));
  assert.deepEqual(
    live.map(w => w.label),
    ['Return an opposing unit to its owner’s hand', 'Untap your unit and give it +0/+2'],
  );
  assert.deepEqual(live[1].options, {mode: 1});
  const b = g.createToken(0, 'pt-backdoor');
  const burn = castWays(g, 0, put(g, 0, pt('Burn the Channel'), 'hand'))[0];
  assert.deepEqual(
    burn.selectors.map(s => [s.key, s.kind]),
    [
      ['t', 'target'],
      ['retire', 'retire'],
    ],
  );
  let picks = togglePick(burn, {}, 't', 0);
  picks = togglePick(burn, picks, 'retire', 0);
  assert.deepEqual(toOptions(burn, picks), {targets: {t: ref(foe.uid)}, costUids: [b.uid]});
  const a = put(g, 1, 'b7', 'grave'),
    z = put(g, 1, 'b1', 'grave');
  const creds = castWays(g, 0, put(g, 0, pt('Burn Credentials'), 'hand'))[0];
  assert.equal(creds.selectors[0].many, true);
  assert.equal(ready(creds, {}), true, 'up to two: zero is allowed');
  picks = togglePick(creds, togglePick(creds, {}, 'g', 0), 'g', 1);
  assert.deepEqual(toOptions(creds, picks).targets, {g: [ref(a.uid), ref(z.uid)]});
  const map = put(g, 0, pt('Map Trust Relationships'), 'grave');
  const reuse = castWays(g, 0, map, 'grave');
  assert.deepEqual(
    reuse.map(w => [w.label, w.totalCost, w.options]),
    [['Reuse', 3, {reuse: true}]],
  );
  assert.deepEqual(castWays(g, 0, put(g, 0, 'r14', 'hand')), [], 'First Breach cards keep their own flow');
});

test('abilities are ways too, with compute, tap and cost-card selectors', () => {
  const g = table();
  compute(g, 0, 2);
  const w = put(g, 0, pt('Analysis Workbench'));
  const i = g.createToken(0, 'pt-indicator');
  const [collect] = abilityWays(g, 0, w);
  assert.equal(collect.abilityId, 'study');
  assert.equal(collect.totalCost, 2);
  assert.deepEqual(
    collect.selectors.map(s => [s.kind, s.candidates.map(c => c.uid)]),
    [['retire', [i.uid]]],
  );
  const [analyze] = abilityWays(g, 0, i);
  assert.deepEqual([analyze.abilityId, analyze.selectors, analyze.issues], ['analyze', [], []]);
  assert.deepEqual(abilityWays(g, 0, put(g, 0, 'r7')), []);
});
```

`Analysis Workbench`'s ability id is `study` (Plan 3). Its first ability (`collect`) is triggered, not activated, so it isn't listed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: FAIL. `prepare.mjs` doesn't exist.

- [ ] **Step 3: Implement**

`public/prepare.mjs`:

```js
// public/prepare.mjs
// How a player can cast a card or activate an ability right now, as data the interface renders: each way with its
// total cost, what blocks it, and the choices (targets and cost cards) it needs. Nothing here changes the game.
import {BY_ID} from './cards.mjs';
import {archiveOptions, candidates, isRule, retireOptions, spellRule} from './rules.mjs';

const targetSelector = (game, p, spec) => ({
  key: spec.key,
  kind: 'target',
  label: spec.upTo ? `Choose up to ${spec.upTo}` : spec.optional ? 'Choose a target (optional)' : 'Choose a target',
  min: spec.upTo || spec.optional ? 0 : 1,
  max: spec.upTo || 1,
  many: !!spec.upTo,
  candidates: candidates(game, p, spec).map(t => ({...t, label: game.targetName(t)})),
});
const cardSelector = (game, kind, cards) => ({
  key: kind,
  kind,
  label: kind === 'retire' ? 'Retire as a cost' : 'Archive as a cost',
  min: 1,
  max: 1,
  many: false,
  candidates: cards.map(c => ({kind: 'card', uid: c.uid, label: BY_ID[c.id].name})),
});
// A way the player can't complete says why, even when the engine would only object once targets are chosen.
function explain(way) {
  if (!way.issues.some(i => i.code === 'target') && way.selectors.some(s => s.min > 0 && !s.candidates.length))
    way.issues.push({code: 'target', message: 'There is no legal choice for this way.'});
  return way;
}

export function castWays(game, p, c, zone = 'hand') {
  const d = BY_ID[c.id];
  if (!isRule(d)) return [];
  const reuse = zone === 'grave';
  const modes = d.modes ? d.modes.map((m, i) => [i, m.label]) : [[null, null]];
  const ways = [];
  for (const [mode, modeLabel] of modes)
    for (const overclock of d.overclock ? [false, true] : [false]) {
      const options = {
        ...(mode != null ? {mode} : {}),
        ...(overclock ? {overclock: true} : {}),
        ...(reuse ? {reuse: true} : {}),
      };
      const rule = spellRule(d, {mode, overclock});
      const selectors = rule.targets.map(spec => targetSelector(game, p, spec));
      if (d.extraCost?.retire) selectors.push(cardSelector(game, 'retire', retireOptions(game, p, d.extraCost.retire)));
      ways.push(
        explain({
          key: `${mode ?? 'base'}-${overclock ? 'overclock' : 'standard'}${reuse ? '-reuse' : ''}`,
          label:
            [modeLabel, d.overclock ? (overclock ? 'Overclocked' : 'Standard') : null, reuse ? 'Reuse' : null]
              .filter(Boolean)
              .join(' · ') || 'Cast',
          options,
          totalCost: game.costOf(d, options),
          issues: game.playIssues(p, c, options),
          selectors,
        }),
      );
    }
  return ways;
}

export function abilityWays(game, p, c) {
  const d = BY_ID[c.id];
  return (d.abilities ?? [])
    .filter(a => a.kind === 'activated')
    .map(a => {
      const cost = a.cost ?? {};
      const selectors = (a.targets ?? []).map(spec => targetSelector(game, p, spec));
      if (cost.retire && cost.retire !== 'self')
        selectors.push(cardSelector(game, 'retire', retireOptions(game, p, cost.retire, c.uid)));
      if (cost.archive) selectors.push(cardSelector(game, 'archive', archiveOptions(game, p, cost.archive)));
      return explain({
        key: a.id,
        abilityId: a.id,
        label: a.label,
        options: {},
        totalCost: cost.compute ?? 0,
        issues: game.activationIssues(p, c.uid, a.id),
        selectors,
      });
    });
}

// Picks are candidate indexes per selector. A single-choice selector replaces its pick; a multi one toggles within max.
export function togglePick(way, picks, key, index) {
  const sel = way.selectors.find(s => s.key === key);
  if (!sel || !sel.candidates[index]) return picks;
  const now = picks[key] ?? [];
  const next = now.includes(index)
    ? now.filter(i => i !== index)
    : sel.max === 1
      ? [index]
      : now.length < sel.max
        ? [...now, index]
        : now;
  return {...picks, [key]: next};
}
export const ready = (way, picks) =>
  !way.issues.length &&
  way.selectors.every(s => (picks[s.key] ?? []).length >= s.min && (picks[s.key] ?? []).length <= s.max);
export function toOptions(way, picks) {
  const targets = {},
    costUids = [];
  for (const s of way.selectors) {
    const chosen = (picks[s.key] ?? []).map(i => s.candidates[i]).map(({kind, uid}) => ({kind, uid}));
    if (s.kind === 'target') {
      if (s.many) targets[s.key] = chosen;
      else if (chosen.length) targets[s.key] = chosen[0];
    } else costUids.push(...chosen.map(t => t.uid));
  }
  return {...way.options, targets, costUids};
}
```

`costUids` follows the engine's order (retire, then archive) because the selectors are pushed in that order.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/prepare.mjs tests/expansion-ui.test.mjs
git add public/prepare.mjs tests/expansion-ui.test.mjs
git commit -m "Describe how each expansion card and ability can be cast"
```

---

### Task 3: Expansion cards on the table

**Files:**
- Modify: `public/card-view.mjs` (`tile`, `card`)
- Modify: `public/arena-view.mjs` (`zone`, `playerBar`, `cardDialog`, `graveDialog`)
- Modify: `public/expansion-view.mjs` (`tokenGroups`, `cardActions`, `archiveDialog`)
- Modify: `public/arena.css`
- Modify: `tests/expansion-ui.test.mjs` (append)

**Interfaces:**
- Consumes: `castWays` and `abilityWays` (Task 2).
- Produces:
  - `cardActions(s, card, zone)`: for your battlefield cards, one button per activated ability, `data-ability="<id>"`, showing the total cost and any blocking reason. For a Reuse card in your discard, a `#reuse` button showing the Reuse cost and any blocking reason.
  - `archiveDialog(s, p)`.
  - `tokenGroups(s, cards, p)`: identical tokens grouped, with a count.
  - An archive pile button, `data-archive="<p>"`, that appears only when that archive has cards.

- [ ] **Step 1: Write the failing tests**

Append to `tests/expansion-ui.test.mjs`:

```js
import {archiveDialog, cardActions} from '../public/expansion-view.mjs';
import {card} from '../public/card-view.mjs';

test('battlefield tiles show live keywords, lockdown, token identity and ready abilities, never by colour alone', () => {
  const g = table();
  compute(g, 0, 1);
  const loader = put(g, 0, pt('Staged Loader'));
  const locked = put(g, 1, 'b8');
  Object.assign(locked, {tapped: true, locked: true});
  const b = g.createToken(0, 'pt-backdoor');
  const s = state(g);
  assert.match(card(s, loader, {zone: 'field', p: 0}), /aria-label="[^"]*rapid/);
  assert.match(card(s, locked, {zone: 'field', p: 1}), /skips next untap/);
  const tile = card(s, b, {zone: 'field', p: 0});
  assert.match(tile, /class="tile-kind">Token</);
  assert.match(tile, /ability ready/);
  assert.match(card(s, b, {detail: true}), /Tool · Token/);
});

test('identical tokens are grouped with a count, and each stays its own button', () => {
  const g = table();
  const tokens = [g.createToken(0, 'pt-backdoor'), g.createToken(0, 'pt-backdoor'), g.createToken(0, 'pt-indicator')];
  const html = arena.zone(state(g), 0);
  assert.match(html, /class="token-group" role="group" aria-label="2 Backdoor tokens"/);
  for (const t of tokens) assert.match(html, new RegExp(`data-uid="${t.uid}"`));
});

test('a card dialog offers each ability and Reuse with cost and reason, and First Breach dialogs are unchanged', () => {
  const g = table();
  compute(g, 0, 1);
  const i = g.createToken(0, 'pt-indicator');
  const actions = cardActions(state(g), i, 'field');
  assert.match(actions, /<button[^>]*data-ability="analyze"[^>]*disabled/);
  assert.match(actions, /Analyze · 2 compute/);
  assert.match(actions, /Needs 2 compute/);
  const map = put(g, 0, pt('Map Trust Relationships'), 'grave');
  compute(g, 0, 2);
  assert.match(cardActions(state(g), map, 'grave'), /<button[^>]*id="reuse"[^>]*>Reuse · 3 compute</);
  assert.equal(cardActions(state(g), put(g, 0, 'r7'), 'field'), '');
  assert.equal(cardActions(state(g), put(g, 1, 'b7', 'grave'), 'grave'), '', 'not your discard');
});

test('the archive has its own read-only pile and viewer, shown only when it has cards', () => {
  const g = table();
  assert.doesNotMatch(arena.playerBar(state(g), 0), /data-archive/);
  const c = put(g, 0, 'r7', 'grave');
  g.archiveCard(0, c);
  assert.match(arena.playerBar(state(g), 0), /data-archive="0"[^>]*aria-label="View your archive, 1 card/);
  const html = archiveDialog(state(g), 0);
  assert.match(html, /Your archive/);
  assert.doesNotMatch(html, /<button[^>]*id="reuse"/);
});

test('your discard marks castable Reuse cards and lets you open them', () => {
  const g = table();
  compute(g, 0, 3);
  put(g, 0, pt('Map Trust Relationships'), 'grave');
  assert.match(arena.graveDialog(state(g), 0), /class="card red[^"]*playable[^"]*"[^>]*data-zone="grave"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: FAIL. There is no `tokenGroups`, `cardActions` or `archiveDialog`, and the tiles don't show token or lockdown state.

- [ ] **Step 3: Implement the card changes**

`public/card-view.mjs`, in `tile`:
- Read live keywords. At the top, add `const kws = game && p !== null ? [...game.keywords(c)] : d.keywords ?? [];` and pass `game` in (add it to `tile`'s arguments from `card`, which has `s.game`). Use `kws` wherever the tile used `d.keywords` (icons and `aria-label`).
- `sick` becomes `d.type === 'Unit' && c.sick && !kws.includes('rapid')`.
- Add `c.locked && 'skips next untap'` to `states`, and an ability badge when any activated ability is ready. Add `const readyAbility = p === 0 && game && (d.abilities ?? []).some(a => a.kind === 'activated' && !game.activationIssues(0, c.uid, a.id).length);`, push `readyAbility && 'ability ready'` to `states`, add class `can-activate` when true, and render `<span class="tile-ready" aria-hidden="true">⚡</span>` in it.
- `tile-kind` shows `${d.token ? 'Token' : d.type}`.

In `card` (the non-tile markup):
- The type line becomes `${d.type}${d.token ? ' · Token' : ''}${d.subtype ? ' · ' + d.subtype : ''}`.
- The status for a locked field card adds `if (c.locked) status.push('Skips next untap');`. The new-arrival check uses `game && p !== null ? game.has(c, 'rapid') : d.keywords?.includes('rapid')`.
- The `playable` class also applies to a Reuse card in your discard:

  ```js
  const reusable = game && zone === 'grave' && live && game.players[0].grave.some(x => x.uid === c.uid) && d.reuse != null && !game.playIssues(0, c, {reuse: true}).length;
  ```

  Then use `${(game && zone === 'hand' && game.legal(0, c)) || reusable ? 'playable' : ''}`.

For First Breach cards these produce identical markup: `keywords(c)` equals the printed keywords, there is no `locked` or `token`, and no First Breach card has activated abilities.

- [ ] **Step 4: Implement the view additions**

`public/expansion-view.mjs`, append:

```js
import {BY_ID} from './cards.mjs';
import {card} from './card-view.mjs';
import {abilityWays, castWays} from './prepare.mjs';

// The battlefield row: identical tokens in a labelled group with a count; every card keeps its own button.
export function tokenGroups(s, cards, p) {
  const out = [];
  for (let i = 0; i < cards.length; ) {
    const c = cards[i],
      d = BY_ID[c.id];
    let j = i + 1;
    if (d.token) while (j < cards.length && cards[j].id === c.id) j++;
    const run = cards.slice(i, j);
    out.push(
      run.length > 1
        ? `<div class="token-group" role="group" aria-label="${run.length} ${esc(d.name)} tokens"><span class="token-count" aria-hidden="true">×${run.length}</span>${run.map(x => card(s, x, {zone: 'field', p})).join('')}</div>`
        : card(s, c, {zone: 'field', p}),
    );
    i = j;
  }
  return out.join('');
}

const reason = issues => (issues.length ? `<small class="action-reason">${esc(issues[0].message)}</small>` : '');
// Buttons for what the player can do with this card beyond casting it from hand: abilities, and Reuse.
export function cardActions(s, c, zone) {
  const {game} = s;
  if (!game || !c?.uid) return '';
  if (zone === 'field' && game.players[0].field.some(x => x.uid === c.uid)) {
    const ways = abilityWays(game, 0, c);
    if (!ways.length) return '';
    return `<div class="card-actions" aria-label="Abilities">${ways
      .map(
        w =>
          `<button class="primary" data-ability="${w.abilityId}" ${w.issues.length ? 'disabled' : ''}>${esc(w.label)} · ${w.totalCost} compute</button>${reason(w.issues)}`,
      )
      .join('')}</div>`;
  }
  if (zone === 'grave' && game.players[0].grave.some(x => x.uid === c.uid)) {
    const ways = castWays(game, 0, c, 'grave');
    if (!ways.length || BY_ID[c.id].reuse == null) return '';
    const cheapest = Math.min(...ways.map(w => w.totalCost)),
      usable = ways.some(w => !w.issues.length);
    return `<div class="card-actions"><button class="primary" id="reuse" ${usable ? '' : 'disabled'}>Reuse · ${cheapest} compute</button>${usable ? '' : reason(ways[0].issues)}</div>`;
  }
  return '';
}

export function archiveDialog(s, p) {
  const {game} = s;
  const cards = game.players[p].archive ?? [];
  return `<h2>${p === 0 ? 'Your' : 'Opponent’s'} archive</h2><p class="muted">Archived cards are out of the game for good. Nothing returns them.</p><div class="grid">${cards.map(c => card(s, c)).join('') || '<p>No archived cards.</p>'}</div>`;
}
```

(Move the `esc` and new imports to the top of the file with the existing one.)

`public/arena-view.mjs`:
- In `zone`, replace `field.map(c => card(s, c, {zone: 'field', p})).join('')` with `tokenGroups(s, [...field.filter(c => !BY_ID[c.id].token), ...field.filter(c => BY_ID[c.id].token).sort((a, b) => a.id.localeCompare(b.id))], p)`. First Breach fields have no tokens, so their order and markup are unchanged.
- In `playerBar`, after the discard pile button, add the archive pile when it has cards:

  ```js
  ${q.archive?.length ? `<button class="pile archive-pile" data-archive="${p}" aria-label="View ${p === 0 ? 'your' : 'opponent’s'} archive, ${q.archive.length} card${q.archive.length === 1 ? '' : 's'}"><b>${q.archive.length}</b><span>Archive</span></button>` : ''}
  ```

- In `cardDialog`, append `${cardActions(s, c, zone)}` after the hand's cast button block, inside the same `<div>`.
- In `graveDialog`, `card(s, c)` becomes `card(s, c, {zone: 'grave'})`.

`public/arena.css`: add styles for:
- `.token-group` (inline-flex; each tile after the first overlaps by about 60% with a negative left margin);
- `.token-count` (a small badge);
- `.tile-ready` (a corner badge; the aria-label already carries the meaning, so the badge may be icon-only);
- `.card-actions` (a vertical stack with gaps), and `.action-reason` (muted small text under a disabled button);
- `.archive-pile` (styled like `.discard-pile`, visually distinct).

Keep everything within the existing CSS variables and naming.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. The existing view tests are unchanged.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/card-view.mjs public/arena-view.mjs public/expansion-view.mjs public/arena.css tests/expansion-ui.test.mjs
git add public/card-view.mjs public/arena-view.mjs public/expansion-view.mjs public/arena.css tests/expansion-ui.test.mjs
git commit -m "Show tokens, lockdown, abilities and the archive on the table"
```

---

### Task 4: The preparation dialog for casting and activating

**Files:**
- Modify: `public/expansion-view.mjs` (`prepDialog`)
- Modify: `public/app.mjs` (the `prep` state; `chooseTarget`, `prepare`, `showPrep`, `confirmPrep`; `showCard` wiring for `[data-ability]` and `#reuse`; the modal click delegate; discard and archive clicks; `close`)
- Modify: `public/arena.css`
- Modify: `tests/expansion-ui.test.mjs` (append)

**Interfaces:**
- Consumes: `castWays`, `abilityWays`, `togglePick`, `ready`, `toOptions` (Task 2); `cardActions` (Task 3).
- Produces:
  - `prepDialog(s, prep)`, where `prep = {kind: 'cast' | 'activate', uid, zone, ways, way: index | null, picks}`.
  - Controls: way buttons `data-way="<i>"` with `aria-pressed`; candidate buttons `data-pick="<selectorKey>:<index>"` with `aria-pressed`; `#prepConfirm` (disabled until `ready`) and `#prepCancel`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/expansion-ui.test.mjs`:

```js
import {prepDialog} from '../public/expansion-view.mjs';

test('the preparation dialog shows each way with its total cost, rules and reason, and confirms only when complete', () => {
  const g = table();
  compute(g, 0, 4);
  const foe = put(g, 1, 'b8');
  const c = put(g, 0, pt('Coordinated Pressure'), 'hand');
  const ways = castWays(g, 0, c);
  let prep = {kind: 'cast', uid: c.uid, zone: 'hand', ways, way: null, picks: {}};
  let html = prepDialog(state(g), prep);
  assert.match(html, /<button[^>]*data-way="0"[^>]*aria-pressed="false"[^>]*>Standard — 3 compute/);
  assert.match(html, /<button[^>]*data-way="1"[^>]*disabled[^>]*>Overclocked — 5 compute/);
  assert.match(html, /Needs 5 compute/);
  assert.match(html, /Deal 4 damage/, 'the rules are visible');
  assert.match(html, /<button[^>]*id="prepConfirm"[^>]*disabled/);
  assert.match(html, /<button[^>]*id="prepCancel"/);
  prep = {...prep, way: 0};
  html = prepDialog(state(g), prep);
  assert.match(html, /data-way="0"[^>]*aria-pressed="true"/);
  assert.match(html, /<button[^>]*data-pick="t:0"[^>]*aria-pressed="false"[^>]*>Forensic Investigator/);
  prep = {...prep, picks: togglePick(ways[0], {}, 't', 0)};
  assert.doesNotMatch(prepDialog(state(g), prep), /id="prepConfirm"[^>]*disabled/);
  assert.equal(foe.damage, 0, 'preparing changes nothing');
});

test('an ability preparation shows what it costs, including the card it retires', () => {
  const g = table();
  compute(g, 0, 2);
  const w = put(g, 0, pt('Analysis Workbench'));
  g.createToken(0, 'pt-indicator');
  const ways = abilityWays(g, 0, w);
  const html = prepDialog(state(g), {kind: 'activate', uid: w.uid, zone: 'field', ways, way: 0, picks: {}});
  assert.match(html, /Draw two, then discard one — 2 compute, tap/);
  assert.match(html, /Retire as a cost/);
  assert.match(html, /data-pick="retire:0"[^>]*>Indicator/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: FAIL. `prepDialog` is not exported.

- [ ] **Step 3: Implement the dialog markup**

Append to `public/expansion-view.mjs`:

```js
const costText = (way, ability) =>
  `${way.totalCost} compute${ability?.cost?.tap ? ', tap' : ''}${ability?.cost?.retire === 'self' ? ', retire this' : ''}`;
// Choosing how to cast or activate: a way, then its targets and cost cards. Nothing is spent until Confirm.
export function prepDialog(s, prep) {
  const {game} = s;
  const found = game.find(prep.uid),
    d = BY_ID[found?.card.id ?? ''] ?? {};
  const ability = prep.kind === 'activate' ? d.abilities?.find(a => a.id === prep.ways[0]?.abilityId) : null;
  const way = prep.way == null ? null : prep.ways[prep.way];
  const ways =
    prep.kind === 'activate'
      ? ''
      : `<div class="prep-ways" role="group" aria-label="How to cast">${prep.ways
          .map(
            (w, i) =>
              `<button data-way="${i}" aria-pressed="${prep.way === i}" ${w.issues.length ? 'disabled' : ''}>${esc(w.label)} — ${w.totalCost} compute</button>${reason(w.issues)}`,
          )
          .join('')}</div>`;
  const selectors = way
    ? way.selectors
        .map(
          sel =>
            `<fieldset class="prep-selector"><legend>${esc(sel.label)}</legend>${
              sel.candidates.length
                ? sel.candidates
                    .map(
                      (c, i) =>
                        `<button data-pick="${sel.key}:${i}" aria-pressed="${(prep.picks[sel.key] ?? []).includes(i)}">${esc(c.label)}</button>`,
                    )
                    .join('')
                : '<p class="muted">Nothing to choose.</p>'
            }</fieldset>`,
        )
        .join('')
    : '';
  const title =
    prep.kind === 'activate' && way ? `${esc(way.label)} — ${costText(way, ability)}` : `Cast ${esc(d.name ?? '')}`;
  const canConfirm = way && ready(way, prep.picks);
  return `<div class="eyebrow">${prep.kind === 'activate' ? 'ACTIVATE' : prep.zone === 'grave' ? 'REUSE FROM DISCARD' : 'CAST'} / ${esc((d.name ?? '').toUpperCase())}</div><h2>${title}</h2><p class="muted">${esc(d.text ?? '')}</p>${ways}${way?.issues.length && prep.kind === 'activate' ? reason(way.issues) : ''}${selectors}<div class="toolbar"><button class="primary" id="prepConfirm" ${canConfirm ? '' : 'disabled'}>Confirm${way ? ` · ${way.totalCost} compute` : ''}</button><button id="prepCancel">Cancel</button></div>`;
}
```

Import `ready` from `./prepare.mjs` alongside the existing imports.

- [ ] **Step 4: Wire the flow in `app.mjs`**

- Import `castWays`, `abilityWays`, `togglePick`, `ready`, `toOptions` from `./prepare.mjs`; `isRule` from `./rules.mjs`; and `* as expansion` from `./expansion-view.mjs`.
- Next to the other UI state, add `let prep = null;`.
- `close()` also clears it: `prep = null;` before `modal.close();`. The modal `cancel` listener also sets `prep = null`.
- `chooseTarget(uid, zone = 'hand')`: find the card in `game.players[0][zone === 'grave' ? 'grave' : 'hand']`. If `isRule(BY_ID[c.id])`, call `prepare({kind: 'cast', uid, zone, ways: castWays(game, 0, c, zone)})` and return. Otherwise keep the existing First Breach path unchanged.
- Add:

  ```js
  // Preparing a cast or activation: pick a way, then targets and cost cards. Cancelling spends nothing.
  function prepare(p) {
    const usable = p.ways.map((w, i) => (w.issues.length ? -1 : i)).filter(i => i >= 0);
    prep = {...p, way: usable.length === 1 ? usable[0] : null, picks: {}};
    showPrep();
  }
  function showPrep() {
    dialog(expansion.prepDialog(ui(), prep));
    $('#prepConfirm:not([disabled])')?.focus() ?? $('#modalBody button:not([disabled])')?.focus();
  }
  function confirmPrep() {
    const way = prep?.ways[prep.way];
    if (!way || !ready(way, prep.picks)) return;
    const {kind, uid} = prep,
      options = toOptions(way, prep.picks);
    prep = null;
    modal.close();
    action(() =>
      kind === 'cast' ? game.play(0, uid, null, options) : game.activate(0, uid, way.abilityId, options),
    );
  }
  ```

- Add one delegated listener for dialog controls (the modal body's content is replaced on each render):

  ```js
  $('#modalBody').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !prep) return;
    if (b.dataset.way !== undefined) {
      prep = {...prep, way: Number(b.dataset.way), picks: {}};
      return showPrep();
    }
    if (b.dataset.pick !== undefined) {
      const [key, i] = b.dataset.pick.split(':');
      prep = {...prep, picks: togglePick(prep.ways[prep.way], prep.picks, key, Number(i))};
      return showPrep();
    }
    if (b.id === 'prepConfirm') return confirmPrep();
    if (b.id === 'prepCancel') return close();
  });
  ```

- `showCard(id, uid, zone)`: after the dialog opens, wire the card-dialog actions:

  ```js
  document.querySelectorAll('#modalBody [data-ability]').forEach(
    b =>
      (b.onclick = () => {
        const c = game.players[0].field.find(x => x.uid === uid);
        const way = c && abilityWays(game, 0, c).find(w => w.abilityId === b.dataset.ability);
        if (way) prepare({kind: 'activate', uid, zone: 'field', ways: [way]});
      }),
  );
  if ($('#reuse')) $('#reuse').onclick = () => chooseTarget(uid, 'grave');
  ```

- In the document click handler for `[data-card]`, before the `if (view === 'library' || !uid || modal.open)` branch, add: `if (modal.open && uid && zone === 'grave') return showCard(id, uid, 'grave');`. Add `archive: p => dialog(expansion.archiveDialog(ui(), Number(p)))` to `DATA_BUTTONS`.
- Dragging stays as it is: `dropHandCard(game, uid, chooseTarget)` now opens the preparation dialog for rule cards, so a drop never chooses a way, target or cost by itself.

- [ ] **Step 5: Style it**

`public/arena.css`:
- `.prep-ways` and `.prep-selector`: button grids that wrap;
- `[aria-pressed="true"]`: a visible pressed state (border plus a ✓ via `::before`), so selection never relies on colour alone;
- disabled way buttons: dimmed, with `.action-reason` beneath.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Check it in the browser**

In your working copy only, set `released: true` for `persistent-threats` in `public/cards.mjs`. Start a preview (add a `.claude/launch.json` entry serving this worktree's `public/` with `python3 -m http.server` on a free port; see Plans 1–3). Start a training match with **Include Persistent Threats** checked, and verify with real clicks:
1. Casting a card with Overclock opens the dialog with both ways and total costs. A way that can't be afforded is disabled with its reason.
2. Picking a target enables Confirm, and Confirm casts it. The stack shows "Overclocked" when chosen.
3. Cancel closes the dialog and spends nothing: compute and hand are unchanged.
4. Dragging such a card from hand onto the battlefield opens the same dialog.
5. Clicking a Backdoor opens its card dialog, **Boost a unit · 1 compute** prepares the activation, and confirming it puts the ability on the stack.
6. In your discard, a Reuse card is marked playable. **Reuse · N compute** opens the preparation dialog.
7. The archive pile appears once a card is archived and opens a read-only viewer.
8. Keyboard only: Tab to a way, a target and Confirm; Space and Enter work.

Check the console for errors, take a screenshot as proof, then **revert `cards.mjs`** and confirm `git diff public/cards.mjs` is empty.

- [ ] **Step 8: Commit**

```bash
npx --yes prettier@3.9.9 --write public/expansion-view.mjs public/app.mjs public/arena.css tests/expansion-ui.test.mjs
git diff --quiet public/cards.mjs && git add public/expansion-view.mjs public/app.mjs public/arena.css tests/expansion-ui.test.mjs
git commit -m "Prepare expansion casts and activations in a dialog before paying"
```

---

### Task 5: Answering pending choices

**Files:**
- Create: `public/choices.mjs`
- Modify: `public/expansion-view.mjs` (`choiceDialog`)
- Modify: `public/arena-view.mjs` (`hint`, `buttonAction`)
- Modify: `public/app.mjs` (the `choice` state, `openChoice`, `submitChoice`, choice controls in the modal delegate, `advance`, `schedule`)
- Modify: `public/arena.css`
- Modify: `tests/expansion-ui.test.mjs` (append)

**Interfaces:**
- Produces:
  - `choices.mjs`:
    - `choiceCards(game)`: the probed cards `[{uid, id}]`, taken from `pending.cards` (a versus view) or by looking uids up in the deck (solo).
    - `startChoice(pending)` returns `{id, kind, discard: [], order: [...options], picks: {}}`.
    - `toggleChoice(game, state, uid)`: toggles a Probe card into or out of discard, or picks a discard card up to `min`.
    - `moveChoice(state, value, delta)`: reorders `order`.
    - `pickChoiceTarget(game, state, key, index)`.
    - `choiceReady(game, state)` and `choiceSelection(game, state)`.
  - `choiceDialog(s, state)`. Its controls:
    - `data-choice-toggle="<uid>"`, `data-choice-up`/`data-choice-down="<value>"`, `data-choice-pick="<key>:<i>"`;
    - `data-pay="yes"` / `data-pay="no"` and `data-optional="<uid>"` / `data-optional=""`;
    - `#choiceConfirm`.
  - While a choice is yours, `buttonAction` gives **Make your choice**, and `hint` shows the prompt.

- [ ] **Step 1: Write the failing tests**

Append to `tests/expansion-ui.test.mjs`:

```js
import {
  choiceCards,
  choiceReady,
  choiceSelection,
  moveChoice,
  pickChoiceTarget,
  startChoice,
  toggleChoice,
} from '../public/choices.mjs';
import {choiceDialog} from '../public/expansion-view.mjs';
import {viewFor} from '../public/protocol.mjs';
import {Game} from '../public/engine.mjs';

function probing() {
  const g = table();
  compute(g, 0, 1);
  g.play(0, put(g, 0, pt('Map Trust Relationships'), 'hand').uid);
  resolveTop(g);
  return g;
}

test('a Probe can move cards to discard and reorder the rest, and turns into a legal selection', () => {
  const g = probing();
  let st = startChoice(g.pending);
  const [top, second] = g.pending.options;
  assert.deepEqual(
    choiceCards(g).map(c => c.uid),
    [top, second],
  );
  st = moveChoice(st, second, -1);
  assert.deepEqual(st.order, [second, top]);
  st = toggleChoice(g, st, second);
  assert.deepEqual(choiceSelection(g, st), {discard: [second], order: [top]});
  assert.equal(choiceReady(g, st), true);
  g.choose(0, choiceSelection(g, st));
  assert.equal(g.pending, null);
});

test('the Probe dialog lists the cards with keyboard-operable discard and move buttons', () => {
  const g = probing();
  const st = startChoice(g.pending);
  const html = choiceDialog(state(g), st);
  assert.match(html, /Probe 2/);
  assert.match(html, /Resolving: Map Trust Relationships/);
  for (const u of g.pending.options) {
    assert.match(html, new RegExp(`<button[^>]*data-choice-toggle="${u}"[^>]*aria-pressed="false"[^>]*>Move to discard`));
    assert.match(html, new RegExp(`data-choice-up="${u}"[^>]*aria-label="Move [^"]+ up"`));
  }
  assert.match(html, /<button[^>]*id="choiceConfirm"/);
});

test('a versus guest sees its own probed cards; nobody sees the other player’s', () => {
  const g = probing();
  g.mode = 'versus';
  const mine = Game.fromJSON(viewFor(g, 0)),
    theirs = Game.fromJSON(viewFor(g, 1));
  assert.deepEqual(
    choiceCards(mine).map(c => c.uid),
    g.pending.options,
  );
  assert.equal(theirs.pending.actor, 1);
  assert.match(arena.hint(state(theirs, {versus: {}})), /opponent is choosing/i);
});

test('discard, pay, optional, order and targets each have their own controls', () => {
  const g = table();
  const pend = (kind, extra) => ({
    id: 9,
    actor: 0,
    kind,
    private: false,
    prompt: 'Choose.',
    min: 1,
    max: 1,
    options: [],
    ...extra,
  });
  const hand = [put(g, 0, 'r7', 'hand'), put(g, 0, 'r1', 'hand')];
  g.pending = pend('discard', {options: hand.map(c => c.uid)});
  let st = toggleChoice(g, startChoice(g.pending), hand[1].uid);
  assert.deepEqual(choiceSelection(g, st), {uids: [hand[1].uid]});
  assert.match(choiceDialog(state(g), st), /data-choice-toggle/);
  g.pending = pend('pay', {options: [true, false], data: {uid: 1, amount: 2}});
  const pay = choiceDialog(state(g), startChoice(g.pending));
  assert.match(pay, /<button[^>]*data-pay="yes"[^>]*>Pay 2 compute/);
  assert.match(pay, /<button[^>]*data-pay="no"[^>]*>Don’t pay/);
  const b = g.createToken(0, 'pt-backdoor');
  g.pending = pend('optional', {options: [b.uid, null]});
  const opt = choiceDialog(state(g), startChoice(g.pending));
  assert.match(opt, new RegExp(`data-optional="${b.uid}"[^>]*>Retire Backdoor`));
  assert.match(opt, /data-optional=""[^>]*>Don’t retire/);
  g.pending = pend('order', {options: [21, 22], min: 2, max: 2});
  g.waiting = [
    {id: 21, p: 0, ability: {card: pt('Dormant Implant'), uid: 1, id: 'implant'}},
    {id: 22, p: 0, ability: {card: pt('Telemetry Curator'), uid: 2, id: 'collect'}},
  ];
  st = moveChoice(startChoice(g.pending), 22, -1);
  assert.deepEqual(choiceSelection(g, st), {order: [22, 21]});
  assert.match(choiceDialog(state(g), st), /Dormant Implant \(Create a Backdoor\)/);
  const u = put(g, 0, 'r7');
  g.pending = pend('targets', {
    options: [{key: 't', optional: false, upTo: 0, candidates: [{kind: 'card', uid: u.uid}]}],
    data: {trigger: 21},
  });
  st = startChoice(g.pending);
  assert.equal(choiceReady(g, st), false);
  st = pickChoiceTarget(g, st, 't', 0);
  assert.deepEqual(choiceSelection(g, st), {targets: {t: {kind: 'card', uid: u.uid}}});
});

test('while a choice is yours the command bar asks for it, and never offers to pass', () => {
  const g = probing();
  assert.equal(arena.buttonAction(state(g)).label, 'Make your choice');
  assert.match(arena.hint(state(g)), /Probe 2/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: FAIL. `choices.mjs` doesn't exist.

- [ ] **Step 3: Implement the choice state**

`public/choices.mjs`:

```js
// public/choices.mjs
// The state of a pending choice the player is answering (which cards go where, in what order, which targets),
// and the selection it becomes. Pure: the dialog renders it, and app.mjs sends the selection with game.choose.
import {BY_ID} from './cards.mjs';

// The probed cards, top first. A versus view sends them as pending.cards; a local game finds them in the deck.
export function choiceCards(game) {
  const c = game.pending;
  if (!c || c.kind !== 'probe') return [];
  if (c.cards) return c.cards;
  const deck = game.players[c.actor].deck;
  return c.options.map(uid => ({uid, id: deck.find(x => x.uid === uid)?.id}));
}
export const startChoice = pending => ({
  id: pending.id,
  kind: pending.kind,
  discard: [],
  order: ['probe', 'order'].includes(pending.kind) ? [...pending.options] : [],
  picks: {},
});
export function toggleChoice(game, st, uid) {
  const c = game.pending;
  if (c.kind === 'probe') {
    if (!c.options.includes(uid)) return st;
    return st.discard.includes(uid)
      ? {...st, discard: st.discard.filter(u => u !== uid)}
      : {...st, discard: [...st.discard, uid]};
  }
  if (c.kind === 'discard') {
    if (!c.options.includes(uid)) return st;
    const now = st.picks.discard ?? [];
    const next = now.includes(uid) ? now.filter(u => u !== uid) : now.length < c.min ? [...now, uid] : now;
    return {...st, picks: {...st.picks, discard: next}};
  }
  return st;
}
export function moveChoice(st, value, delta) {
  const i = st.order.indexOf(value),
    j = i + delta;
  if (i < 0 || j < 0 || j >= st.order.length) return st;
  const order = [...st.order];
  [order[i], order[j]] = [order[j], order[i]];
  return {...st, order};
}
export function pickChoiceTarget(game, st, key, index) {
  const spec = game.pending.options.find(o => o.key === key);
  if (!spec?.candidates[index]) return st;
  const now = st.picks[key] ?? [],
    max = spec.upTo || 1;
  const next = now.includes(index)
    ? now.filter(i => i !== index)
    : max === 1
      ? [index]
      : now.length < max
        ? [...now, index]
        : now;
  return {...st, picks: {...st.picks, [key]: next}};
}
export function choiceSelection(game, st) {
  const c = game.pending;
  switch (c.kind) {
    case 'probe':
      return {discard: [...st.discard], order: st.order.filter(u => !st.discard.includes(u))};
    case 'discard':
      return {uids: [...(st.picks.discard ?? [])]};
    case 'order':
      return {order: [...st.order]};
    case 'targets': {
      const targets = {};
      for (const o of c.options) {
        const chosen = (st.picks[o.key] ?? []).map(i => o.candidates[i]);
        if (o.upTo) targets[o.key] = chosen;
        else if (chosen.length) targets[o.key] = chosen[0];
      }
      return {targets};
    }
    default:
      return null;
  }
}
export function choiceReady(game, st) {
  const c = game.pending;
  if (c.kind === 'discard') return (st.picks.discard ?? []).length === c.min;
  if (c.kind === 'targets') return c.options.every(o => o.optional || o.upTo || (st.picks[o.key] ?? []).length === 1);
  return ['probe', 'order'].includes(c.kind);
}
export const cardName = id => BY_ID[id]?.name ?? 'Hidden card';
```

- [ ] **Step 4: Implement the dialog and command bar**

Append to `public/expansion-view.mjs` (import `choiceCards`, `choiceReady` and `cardName` from `./choices.mjs`):

```js
const move = (value, name, first, last) =>
  `<button data-choice-up="${value}" aria-label="Move ${esc(name)} up" ${first ? 'disabled' : ''}>↑</button><button data-choice-down="${value}" aria-label="Move ${esc(name)} down" ${last ? 'disabled' : ''}>↓</button>`;
// The player's pending choice. Pay and optional answer at once; the others confirm.
export function choiceDialog(s, st) {
  const {game} = s;
  const c = game.pending;
  const resolving = c.resolving ?? c.frame?.entry;
  let body = '',
    confirm = true;
  if (c.kind === 'probe') {
    const cards = choiceCards(game);
    const kept = st.order.filter(u => !st.discard.includes(u));
    body = `<p class="muted">Top of your deck first. Kept cards go back in this order.</p><ol class="choice-list">${st.order
      .map(u => {
        const name = cardName(cards.find(x => x.uid === u)?.id),
          out = st.discard.includes(u),
          k = kept.indexOf(u);
        return `<li class="${out ? 'to-discard' : ''}"><span>${esc(name)}${out ? ' <small>(to discard)</small>' : ''}</span><button data-choice-toggle="${u}" aria-pressed="${out}">${out ? 'Keep on top' : 'Move to discard'}</button>${out ? '' : move(u, name, k === 0, k === kept.length - 1)}</li>`;
      })
      .join('')}</ol>`;
  } else if (c.kind === 'discard') {
    body = `<div class="choice-grid">${c.options
      .map(u => {
        const f = game.find(u),
          on = (st.picks.discard ?? []).includes(u);
        return `<button data-choice-toggle="${u}" aria-pressed="${on}">${esc(cardName(f?.card.id))}</button>`;
      })
      .join('')}</div><p class="muted">Selected ${(st.picks.discard ?? []).length} of ${esc(String(c.min))}.</p>`;
  } else if (c.kind === 'pay') {
    confirm = false;
    body = `<div class="toolbar"><button class="primary" data-pay="yes">Pay ${esc(String(c.data?.amount ?? ''))} compute</button><button data-pay="no">Don’t pay</button></div>`;
  } else if (c.kind === 'optional') {
    confirm = false;
    body = `<div class="toolbar">${c.options
      .map(u =>
        u === null
          ? '<button data-optional="">Don’t retire</button>'
          : `<button class="primary" data-optional="${u}">Retire ${esc(cardName(game.find(u)?.card.id))}</button>`,
      )
      .join('')}</div>`;
  } else if (c.kind === 'order') {
    body = `<p class="muted">The first goes on the stack first and resolves last.</p><ol class="choice-list">${st.order
      .map((id, i) => {
        const w = game.waiting.find(t => t.id === id),
          name = w ? game.entryName({ability: w.ability}) : 'Ability';
        return `<li><span>${esc(name)}</span>${move(id, name, i === 0, i === st.order.length - 1)}</li>`;
      })
      .join('')}</ol>`;
  } else if (c.kind === 'targets') {
    body = c.options
      .map(
        o =>
          `<fieldset class="prep-selector"><legend>${o.upTo ? `Choose up to ${o.upTo}` : 'Choose a target'}</legend>${o.candidates
            .map(
              (t, i) =>
                `<button data-choice-pick="${o.key}:${i}" aria-pressed="${(st.picks[o.key] ?? []).includes(i)}">${esc(game.targetName(t))}</button>`,
            )
            .join('')}</fieldset>`,
      )
      .join('');
  }
  return `<div class="eyebrow">YOUR CHOICE</div><h2>${esc(c.prompt)}</h2>${resolving ? `<p class="muted">Resolving: ${esc(game.entryName(resolving))}</p>` : ''}${body}${confirm ? `<div class="toolbar"><button class="primary" id="choiceConfirm" ${choiceReady(game, st) ? '' : 'disabled'}>Confirm</button></div>` : ''}`;
}
```

`public/arena-view.mjs`:
- In `hint`, just after the winner line, add:

  ```js
  if (game.pending) {
    if (game.pending.actor === 0) return `Make a choice: ${esc(game.pending.prompt)}`;
    return versus ? 'Your opponent is choosing…' : 'Computer is choosing…';
  }
  ```

  It must come before the `actor() === 1` line, so a versus guest sees "opponent is choosing".
- In `buttonAction`, first line: `if (game.pending?.actor === 0) return {label: 'Make your choice', command: 'choose'};`.

- [ ] **Step 5: Wire it in `app.mjs`**

Import from `./choices.mjs`. Add `let choice = null, choiceClosed = null;` to the UI state.

```js
// A pending choice opens by itself once; closing it to look at the board is fine, and "Make your choice" reopens it.
function openChoice() {
  if (!game?.pending || game.pending.actor !== 0) return;
  if (choice?.id !== game.pending.id) choice = startChoice(game.pending);
  dialog(expansion.choiceDialog(ui(), choice));
  $('#modalBody button:not([disabled])')?.focus();
}
function submitChoice(selection) {
  choice = null;
  modal.close();
  action(() => game.choose(0, selection));
}
```

- In `close()`, remember a closed choice: `if (choice) choiceClosed = choice.id;`.
- In the modal delegate, before the `prep` branch:

  ```js
  if (choice && game?.pending?.id === choice.id) {
    const ds = b.dataset;
    if (ds.pay) return submitChoice({pay: ds.pay === 'yes'});
    if (ds.optional !== undefined) return submitChoice({uid: ds.optional === '' ? null : Number(ds.optional)});
    if (ds.choiceToggle) choice = toggleChoice(game, choice, Number(ds.choiceToggle));
    else if (ds.choiceUp) choice = moveChoice(choice, Number(ds.choiceUp), -1);
    else if (ds.choiceDown) choice = moveChoice(choice, Number(ds.choiceDown), 1);
    else if (ds.choicePick) {
      const [key, i] = ds.choicePick.split(':');
      choice = pickChoiceTarget(game, choice, key, Number(i));
    } else if (b.id === 'choiceConfirm') return submitChoice(choiceSelection(game, choice));
    else return;
    return openChoice();
  }
  ```

  Guard `b.disabled` as the `prep` branch does. Move the shared `const b = …; if (!b || b.disabled) return;` to the top of the delegate.
- `advance()`: first line `if (game?.pending?.actor === 0) return openChoice();`.
- `schedule()`: after the early-return guards (animating, modal open, and so on) and before the `actor() === 1` branch, add:

  ```js
  if (game.pending?.actor === 0) {
    if (choiceClosed !== game.pending.id) openChoice();
    return;
  }
  ```

  Auto-pass never runs while a choice is yours.
- Solo, the computer answers its own choices through `aiAction` (Plan 3); the `actor() === 1` branch already covers it. Versus, the guest's seat game intercepts `choose` (Plan 4), so `submitChoice` works unchanged.

`public/arena.css`: add `.choice-list` (rows with the name and buttons aligned; `to-discard` rows get a strike-through and the "(to discard)" label, not just colour) and `.choice-grid`.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Check it in the browser**

With the temporary `released: true` (never committed), in a training match with the expansion:
1. Play Reconnaissance Outpost, or cast Map Trust Relationships. The Probe dialog opens by itself, showing the probed cards, **Move to discard**, and ↑/↓ controls. Confirm applies it: moved cards appear in your discard, and the next draw is the top kept card.
2. Close a Probe dialog with Escape. **Make your choice** is in the command bar, auto-pass doesn't skip it, and clicking it reopens the dialog.
3. A soft counter against your spell (play red; the blue computer may cast Verify Provenance) asks **Pay 2 compute** or **Don’t pay**. If that doesn't come up naturally, set it up by casting a spell while the computer holds Verify Provenance. Note in the report how you reached it.
4. Keyboard only: answer a Probe with Tab, Space and Enter.
5. At mobile width (375px), the dialogs fit with no horizontal scroll.

Check the console for errors, screenshot a Probe dialog, **revert `cards.mjs`**, and confirm `git diff public/cards.mjs` is empty.

- [ ] **Step 8: Commit**

```bash
npx --yes prettier@3.9.9 --write public/choices.mjs public/expansion-view.mjs public/arena-view.mjs public/app.mjs public/arena.css tests/expansion-ui.test.mjs
git diff --quiet public/cards.mjs && git add public/choices.mjs public/expansion-view.mjs public/arena-view.mjs public/app.mjs public/arena.css tests/expansion-ui.test.mjs
git commit -m "Answer Probe, discard, pay, retire, order and target choices"
```

---

### Task 6: A full walkthrough

**Files:** as needed, to fix what the walkthrough finds. Each fix comes with a unit test where the logic is pure.

This is a verification task. Play the expansion as a person would, and fix anything that stalls, misleads or breaks. A fix goes in the module at fault, with a regression test in `tests/expansion-ui.test.mjs` when the logic is pure. Never loosen an assertion.

- [ ] **Step 1: Solo, both factions**

With the temporary `released: true` (never committed), play two training matches with the expansion, one as red and one as blue. Each should last at least eight turns, or reach a result. Use every kind of interaction at least once:
- a cast with a mode;
- a cast with Overclock;
- a cast with an extra retire cost (Burn the Channel);
- a Reuse cast;
- a Backdoor boost;
- an Indicator analysis;
- a tap-and-retire Tool ability (Disposable Cache or Analysis Workbench);
- a Probe;
- a discard after drawing;
- a trigger target choice (Lockdown Coordinator or Incident Commander);
- viewing the archive.

For each, note in the report whether it worked, and what you fixed if it didn't.

- [ ] **Step 2: Play a friend**

Open two tabs (host and guest) on the preview. Create an expansion invite from the start screen with the checkbox on, join, take the pledge, and play until each side has answered at least one choice. Confirm three things:
- the other player's private choice shows only "Your opponent is choosing…";
- the guest's dialogs work the same as the host's;
- after a concede, the recap shows **Verified — fair match**.

- [ ] **Step 3: Accessibility pass**

With a keyboard only, cast a prepared card and answer a Probe. Check every new control has a visible focus ring, and that pressed or selected state shows as text or a ✓ glyph as well as colour. Check the 375px width.

- [ ] **Step 4: First Breach regression**

Play three turns of a plain First Breach match (checkbox off). Its hand, battlefield, stack and dialogs look exactly as before, and there are no console errors.

- [ ] **Step 5: Wrap up**

**Revert `cards.mjs`** and confirm `git diff public/cards.mjs` is empty. Run `npm test`, `npm run typecheck` and the Prettier check. Commit any fixes, each with its own message, and screenshots go in the report, not the repo. Append a short "Walkthrough" section to this plan listing what was verified and fixed.

---

## Finishing

- [ ] Run `npm test && npm run typecheck` and the Prettier check on the branch tip.
- [ ] Append a "Follow-ups" section to this plan for Plan 6 (lore, art prompts, the Field Guide, lessons and release), including anything the reviews defer.
- [ ] Use superpowers:finishing-a-development-branch.
