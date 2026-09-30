import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS, BY_ID, MECHANICS, mechanicsOf, edition, releasedTokens, SETS} from '../public/cards.mjs';
import {library, libraryGrid} from '../public/library.mjs';
import {about} from '../public/about.mjs';
import {guide} from '../public/guide.mjs';
import {Tutorial} from '../public/tutorial.mjs';
import * as arena from '../public/arena-view.mjs';
import {stackItem} from '../public/expansion-view.mjs';
import {hoverCard} from '../public/card-view.mjs';
import {lorePanel} from '../public/lore-panel.mjs';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

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
  while (g.stack.length) resolveTop(g); // Abilities need an empty stack
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

test('the stack names the chosen mode of a modal spell, for either player', () => {
  const g = table();
  compute(g, 0, 8);
  const foe = put(g, 1, 'b8'),
    mine = put(g, 0, 'r7');
  const bounce = put(g, 0, pt('Live Response'), 'hand');
  g.play(0, bounce.uid, null, {mode: 0, targets: {t: ref(foe.uid)}});
  const first = stackItem(state(g), g.stack.at(-1));
  assert.match(first, /Mode: Return an opposing unit to its owner’s hand/);
  assert.doesNotMatch(first, /Untap your unit/);
  const buff = put(g, 0, pt('Live Response'), 'hand');
  g.play(0, buff.uid, null, {mode: 1, targets: {t: ref(mine.uid)}});
  const second = stackItem(state(g), g.stack.at(-1));
  assert.match(second, /Mode: Untap your unit and give it \+0\/\+2/);
  assert.doesNotMatch(second, /Return an opposing unit/);
  // In versus the opponent's entry arrives as plain view data; the mode is public once cast.
  const theirs = {...structuredClone(g.stack.at(-1)), p: 1};
  assert.match(stackItem(state(g, {versus: {}}), theirs), /Opponent · Mode: Untap your unit and give it \+0\/\+2/);
  // A mode the card does not have names nothing rather than breaking the stack.
  assert.doesNotMatch(stackItem(state(g), {...theirs, opts: {...theirs.opts, mode: 7}}), /Mode:/);
});

test('animation snapshots and tutorial tracking ignore stack entries without a card', async () => {
  const g = table();
  compute(g, 0, 1);
  const u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  const guide = new Tutorial(true),
    before = guide.capture(g);
  g.activate(0, b.uid, 'boost', {targets: {t: ref(u.uid)}});
  assert.doesNotThrow(() => guide.observe(g, before));
  const {snapshot} = await import('../public/motion.mjs');
  globalThis.document ??= {querySelectorAll: () => [], querySelector: () => null};
  assert.doesNotThrow(() => snapshot(g));
});

test('a card without lore renders without “undefined”', () => {
  const bare = {...BY_ID[pt('Seed Access')], flavor: undefined, flavorBy: undefined, lesson: undefined};
  assert.doesNotMatch(lorePanel(bare), /undefined/);
  assert.match(lorePanel(bare), /arrive with its release/);
});

import {abilityWays, castWays, ready, readyIssue, toOptions, togglePick} from '../public/prepare.mjs';

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
    candidates: [{kind: 'card', uid: foe.uid, label: 'Forensic Investigator · Opponent’s · Unit'}],
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

test('ready with the game refuses picks the engine would refuse', t => {
  const g = table();
  compute(g, 0, 8);
  const a = put(g, 0, 'b7', 'grave'),
    z = put(g, 1, 'b1', 'grave');
  const creds = castWays(g, 0, put(g, 0, pt('Burn Credentials'), 'hand'))[0];
  const both = togglePick(creds, togglePick(creds, {}, 'g', 0), 'g', 1);
  assert.equal(ready(creds, both), true, 'by counts alone');
  assert.equal(ready(creds, both, g), false, 'one discard card from each player');
  assert.equal(ready(creds, togglePick(creds, {}, 'g', 0), g), true);

  const tool = g.createToken(1, 'pt-backdoor');
  const chain = castWays(g, 0, put(g, 0, pt('Break the Chain'), 'hand'))[1];
  let picks = togglePick(chain, {}, 't', 0);
  const mine = chain.selectors[1].candidates.findIndex(c => c.uid === a.uid);
  picks = togglePick(chain, picks, 'g', mine);
  assert.equal(ready(chain, picks), true);
  assert.equal(ready(chain, picks, g), false, 'archive card is not from the Tool’s controller');
  const theirs = chain.selectors[1].candidates.findIndex(c => c.uid === z.uid);
  assert.equal(ready(chain, togglePick(chain, {t: picks.t}, 'g', theirs), g), true);
  void tool;

  define(t, {
    id: 'x-swap',
    type: 'Operation',
    cost: 0,
    extraCost: {retire: {types: ['Unit']}},
    targets: [{key: 't', zone: 'field', side: 'any', types: ['Unit']}],
    steps: [{op: 'bounce', to: 't'}],
  });
  const u = put(g, 0, 'r7');
  const swap = castWays(g, 0, put(g, 0, 'x-swap', 'hand'))[0];
  const own = swap.selectors[0].candidates.findIndex(c => c.uid === u.uid);
  const same = togglePick(
    swap,
    togglePick(swap, {}, 't', own),
    'retire',
    swap.selectors[1].candidates.findIndex(c => c.uid === u.uid),
  );
  assert.equal(ready(swap, same), true);
  assert.equal(ready(swap, same, g), false, 'a card paying a cost is also a target');
});

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

test('a disabled ability or Reuse button points at the element that says why', () => {
  const g = table();
  compute(g, 0, 1);
  const i = g.createToken(0, 'pt-indicator');
  const html = cardActions(state(g), i, 'field');
  assert.match(html, /role="group" aria-label="Abilities"/);
  const id = html.match(/data-ability="analyze"[^>]*aria-describedby="([^"]+)"/)[1];
  assert.match(html, new RegExp(`<small[^>]*id="${id}"[^>]*>Needs 2 compute`));
  const map = put(g, 0, pt('Map Trust Relationships'), 'grave');
  const reuse = cardActions(state(g), map, 'grave');
  const rid = reuse.match(/id="reuse"[^>]*aria-describedby="([^"]+)"/)[1];
  assert.match(reuse, new RegExp(`<small[^>]*id="${rid}"`));
});

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

test('an ability preparation whose one way cannot be used names it and says why', () => {
  const g = table();
  const w = put(g, 0, pt('Analysis Workbench'));
  g.createToken(0, 'pt-indicator');
  const ways = abilityWays(g, 0, w);
  assert.ok(ways[0].issues.length, 'no compute, so the way has issues');
  const html = prepDialog(state(g), {kind: 'activate', uid: w.uid, zone: 'field', ways, way: 0, picks: {}});
  assert.match(html, /<h2>Draw two, then discard one — 2 compute, tap/);
  assert.doesNotMatch(html, /<h2>Cast /);
  assert.match(html, /id="reason-prep"[^>]*>[^<]*Needs 2 compute/);
  assert.match(html, /<button[^>]*id="prepConfirm"[^>]*disabled/);
});

test('reusing a card from the discard pile is titled Reuse, not Cast', () => {
  const g = table();
  compute(g, 0, 4);
  const map = put(g, 0, pt('Map Trust Relationships'), 'grave');
  const ways = castWays(g, 0, map, 'grave');
  const html = prepDialog(state(g), {kind: 'cast', uid: map.uid, zone: 'grave', ways, way: null, picks: {}});
  assert.match(html, /<h2>Reuse Map Trust Relationships<\/h2>/);
  const c = put(g, 0, pt('Coordinated Pressure'), 'hand');
  const cast = prepDialog(state(g), {
    kind: 'cast',
    uid: c.uid,
    zone: 'hand',
    ways: castWays(g, 0, c),
    way: null,
    picks: {},
  });
  assert.match(cast, /<h2>Cast Coordinated Pressure<\/h2>/);
});

test('a Persistent Threats card dialog names its own set', () => {
  const g = table();
  const c = put(g, 0, pt('Map Trust Relationships'), 'hand');
  assert.match(
    arena.cardDialog(state(g), c.id, c, 'hand'),
    /<div class="eyebrow">PERSISTENT THREATS \/ RED TEAM<\/div>/,
  );
  const fb = put(g, 0, 'r3', 'hand');
  assert.match(arena.cardDialog(state(g), fb.id, fb, 'hand'), /<div class="eyebrow">FIRST BREACH \/ RED TEAM<\/div>/);
});

test('tokens group only while they look the same, so a tapped one is never hidden in a stack', () => {
  const g = table();
  const a = [g.createToken(0, 'pt-backdoor'), g.createToken(0, 'pt-backdoor'), g.createToken(0, 'pt-backdoor')];
  a[1].tapped = true;
  let html = arena.zone(state(g), 0);
  // Untapped, tapped, untapped: the two untapped ones are sorted together, and the tapped one stays out of the group.
  assert.match(html, /class="token-group" role="group" aria-label="2 Backdoor tokens"/);
  assert.doesNotMatch(
    html.match(/<div class="token-group"[\s\S]*?<\/button><\/div>/)[0],
    new RegExp(`data-uid="${a[1].uid}"`),
  );
  for (const t of a) assert.match(html, new RegExp(`data-uid="${t.uid}"`));
  a[1].tapped = false;
  a[2].tapped = true;
  html = arena.zone(state(g), 0);
  assert.match(html, /class="token-group" role="group" aria-label="2 Backdoor tokens"/);
  assert.doesNotMatch(html, /aria-label="3 Backdoor tokens"/);
  const group = html.match(/<div class="token-group"[\s\S]*?<\/button><\/div>/)[0];
  assert.doesNotMatch(group, new RegExp(`data-uid="${a[2].uid}"`), 'the tapped one stands alone');
  assert.match(html, new RegExp(`class="card tile[^"]*tapped[^"]*"[^>]*data-uid="${a[2].uid}"`));
});

import {
  choiceCards,
  choiceReady,
  choiceIssue,
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
    assert.match(
      html,
      new RegExp(`<button[^>]*data-choice-toggle="${u}"[^>]*aria-pressed="false"[^>]*>Move to discard`),
    );
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
  assert.equal(theirs.pending.cards, undefined);
  assert.deepEqual(theirs.pending.options, []);
  assert.deepEqual(choiceCards(theirs), []);
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
  g.pending = pend('order', {
    options: [21, 22],
    min: 2,
    max: 2,
    prompt: 'Choose the order your abilities go on the stack. The first goes on first and resolves last.',
  });
  g.waiting = [
    {id: 21, p: 0, ability: {card: pt('Dormant Implant'), uid: 1, id: 'implant'}},
    {id: 22, p: 0, ability: {card: pt('Telemetry Curator'), uid: 2, id: 'collect'}},
  ];
  st = moveChoice(startChoice(g.pending), 22, -1);
  assert.deepEqual(choiceSelection(g, st), {order: [22, 21]});
  const order = choiceDialog(state(g), st);
  assert.match(order, /Dormant Implant \(Create a Backdoor\)/);
  // The engine's prompt already explains the order; the dialog says it once.
  assert.equal(order.match(/resolves last/g).length, 1);
  assert.match(order, /<h2>[^<]*resolves last\.<\/h2>/);
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

test('moving a kept Probe card steps over cards set aside for discard', () => {
  const g = table();
  const top = put(g, 0, 'r1', 'deck'),
    mid = put(g, 0, 'r7', 'deck'),
    bottom = put(g, 0, 'r7', 'deck');
  g.pending = {id: 9, actor: 0, kind: 'probe', private: true, prompt: 'Probe 3.', min: 0, max: 3};
  g.pending.options = [bottom.uid, mid.uid, top.uid];
  let st = toggleChoice(g, startChoice(g.pending), mid.uid);
  st = moveChoice(st, top.uid, -1);
  assert.deepEqual(choiceSelection(g, st).order, [top.uid, bottom.uid]);
});

test('a card set aside in a Probe keeps its button label and is marked pressed', () => {
  const g = probing();
  const [top] = g.pending.options;
  const html = choiceDialog(state(g), toggleChoice(g, startChoice(g.pending), top));
  assert.match(
    html,
    new RegExp(`<button[^>]*data-choice-toggle="${top}"[^>]*aria-pressed="true"[^>]*>Move to discard</button>`),
  );
  assert.doesNotMatch(html, /Keep on top/);
  assert.match(html, /\(to discard\)/);
});

test('once enough cards are picked to discard, the others are disabled but picked ones can be unpicked', () => {
  const g = table();
  const hand = [put(g, 0, 'r7', 'hand'), put(g, 0, 'r1', 'hand'), put(g, 0, 'r2', 'hand')];
  g.pending = {id: 9, actor: 0, kind: 'discard', private: true, prompt: 'Discard 1 card.', min: 1, max: 1};
  g.pending.options = hand.map(c => c.uid);
  const open = choiceDialog(state(g), startChoice(g.pending));
  for (const c of hand) assert.match(open, new RegExp(`<button data-choice-toggle="${c.uid}" aria-pressed="false">`));
  const st = toggleChoice(g, startChoice(g.pending), hand[1].uid);
  const html = choiceDialog(state(g), st);
  assert.match(html, new RegExp(`<button data-choice-toggle="${hand[1].uid}" aria-pressed="true">`));
  for (const c of [hand[0], hand[2]])
    assert.match(html, new RegExp(`<button data-choice-toggle="${c.uid}" aria-pressed="false" disabled>`));
});

test('target keys are escaped in the choice dialog', () => {
  const g = table();
  const u = put(g, 0, 'r7');
  g.pending = {
    id: 9,
    actor: 0,
    kind: 'targets',
    private: false,
    prompt: 'Choose.',
    min: 1,
    max: 1,
    options: [{key: 'a"b', optional: false, upTo: 0, candidates: [{kind: 'card', uid: u.uid}]}],
  };
  const html = choiceDialog(state(g), startChoice(g.pending));
  assert.match(html, /data-choice-pick="a&quot;b:0"/);
});

test('the log uses “an” before a token name that starts with a vowel', () => {
  const g = table();
  g.createToken(1, 'pt-indicator');
  g.createToken(0, 'pt-backdoor');
  assert.ok(g.log.some(l => /creates an Indicator\./.test(l)));
  assert.ok(g.log.some(l => /create a Backdoor\./.test(l)));
});

test('target candidates name whose they are and where, and cost candidates show their state', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, 'r7', 'grave');
  put(g, 1, 'b8', 'grave');
  const c = put(g, 0, pt('Burn Credentials'), 'hand');
  const ways = castWays(g, 0, c);
  const labels = ways[0].selectors[0].candidates.map(x => x.label);
  assert.match(labels.join('|'), /[^|]+ · Yours · Discard/);
  assert.match(labels.join('|'), /[^|]+ · Opponent’s · Discard/);
  const html = prepDialog(state(g), {kind: 'cast', uid: c.uid, zone: 'hand', ways, way: 0, picks: {}});
  assert.match(html, /data-pick="g:0"[^>]*>[^<]+ · Yours · Discard</);
  const mine = g.players[0].grave[0];
  g.pending = {id: 9, actor: 0, kind: 'targets', private: false, prompt: 'Choose.', min: 1, max: 1};
  g.pending.options = [{key: 'g', optional: false, upTo: 2, candidates: [ref(mine.uid)]}];
  assert.match(choiceDialog(state(g), startChoice(g.pending)), /data-choice-pick="g:0"[^>]*>[^<]+ · Yours · Discard</);
  g.pending = null;
  const w = put(g, 0, pt('Analysis Workbench'));
  const tapped = g.createToken(0, 'pt-indicator');
  tapped.tapped = true;
  tapped.locked = true;
  const hurt = abilityWays(g, 0, w)[0].selectors.find(s => s.key === 'retire');
  assert.equal(hurt.candidates[0].label, 'Indicator · tapped · skips next untap');
});

test('a rejected combination of targets says why, and Confirm points at the reason', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, 'r7', 'grave');
  put(g, 1, 'b8', 'grave');
  const c = put(g, 0, pt('Burn Credentials'), 'hand');
  const ways = castWays(g, 0, c);
  let picks = togglePick(ways[0], {}, 'g', 0);
  const one = prepDialog(state(g), {kind: 'cast', uid: c.uid, zone: 'hand', ways, way: 0, picks});
  assert.doesNotMatch(one, /id="prep-issue"/);
  assert.doesNotMatch(one, /id="prepConfirm"[^>]*disabled/);
  picks = togglePick(ways[0], picks, 'g', 1);
  assert.equal(readyIssue(ways[0], picks, g), 'Choose cards from a single player’s discard.');
  const html = prepDialog(state(g), {kind: 'cast', uid: c.uid, zone: 'hand', ways, way: 0, picks});
  assert.match(html, /<button[^>]*id="prepConfirm"[^>]*aria-describedby="prep-issue"[^>]*disabled/);
  assert.match(html, /id="prep-issue"[^>]*>Choose cards from a single player’s discard\.</);
  assert.doesNotMatch(html, /id="prep-issue"[^>]*role="status"|role="status"[^>]*id="prep-issue"/);
});

test('identical tokens split by a tapped one still group, with the tapped one alone', () => {
  const g = table();
  const fb = put(g, 0, 'r7');
  const i = [g.createToken(0, 'pt-indicator'), g.createToken(0, 'pt-indicator'), g.createToken(0, 'pt-indicator')];
  i[1].tapped = true;
  const html = arena.zone(state(g), 0);
  assert.equal(html.match(/class="token-group"/g).length, 1);
  const group = html.match(/<div class="token-group"[^>]*aria-label="2 Indicator tokens"[\s\S]*?<\/button><\/div>/)[0];
  for (const t of [i[0], i[2]]) assert.match(group, new RegExp(`data-uid="${t.uid}"`));
  assert.match(html, new RegExp(`<\\/div><button class="card tile[^"]*tapped[^"]*"[^>]*data-uid="${i[1].uid}"`));
  assert.ok(html.indexOf(`data-uid="${fb.uid}"`) < html.indexOf('token-group'), 'other cards keep their place first');
});

test('a pending target choice is ready only when the engine would accept it', t => {
  define(t, {
    id: 'x-sweep',
    type: 'Tool',
    abilities: [
      {
        kind: 'triggered',
        id: 'sweep',
        label: 'Sweep',
        targets: [{key: 'g', zone: 'grave', side: 'any', upTo: 2, onePlayer: true}],
        steps: [{op: 'archive', to: 'g'}],
      },
    ],
  });
  const g = table();
  const src = put(g, 0, 'x-sweep');
  const mine = put(g, 0, 'r7', 'grave'),
    theirs = put(g, 1, 'b8', 'grave');
  g.waiting = [{id: 21, p: 0, ability: {card: 'x-sweep', uid: src.uid, id: 'sweep'}}];
  g.pending = {
    id: 9,
    actor: 0,
    kind: 'targets',
    private: false,
    prompt: 'Choose.',
    min: 1,
    max: 1,
    data: {trigger: 21},
  };
  g.pending.options = [{key: 'g', optional: false, upTo: 2, candidates: [ref(mine.uid), ref(theirs.uid)]}];
  let st = pickChoiceTarget(g, startChoice(g.pending), 'g', 0);
  assert.equal(choiceReady(g, st), true, 'one card from one discard is fine');
  st = pickChoiceTarget(g, st, 'g', 1);
  assert.equal(choiceReady(g, st), false, 'cards from both discards are refused');
  assert.match(choiceDialog(state(g), st), /<button class="primary" id="choiceConfirm" disabled[ >]/);
});

test('Probe and order rows are numbered, counting only the cards that stay on top', async () => {
  const {readFile} = await import('node:fs/promises');
  const css = await readFile(new URL('../public/arena.css', import.meta.url), 'utf8');
  const rule = sel => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.()*:]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(rule('.choice-list'), /counter-reset:\s*choice/);
  assert.match(rule('.choice-list li:not(.to-discard)'), /counter-increment:\s*choice/);
  assert.match(rule('.choice-list li:not(.to-discard)::before'), /content:\s*counter\(choice\) '\.'/);
});

test('expansion cards explain the rules terms they use; First Breach cards are unchanged', () => {
  assert.deepEqual(mechanicsOf(BY_ID[pt('Map Trust Relationships')]), ['probe', 'reuse']);
  assert.deepEqual(mechanicsOf(BY_ID[pt('Burn the Channel')]), ['retire']);
  assert.deepEqual(mechanicsOf(BY_ID[pt('Seed Access')]), ['backdoor']);
  for (const c of CARDS.filter(c => c.set === 'first-breach')) assert.deepEqual(mechanicsOf(c), [], c.name);
  const g = table();
  const dialog = arena.cardDialog(state(g), pt('Map Trust Relationships'), null, '');
  assert.match(dialog, new RegExp(`<strong>Probe</strong><br>${MECHANICS.probe[1]}`));
  assert.match(dialog, /<strong>Reuse<\/strong>/);
  const fb = CARDS.find(c => c.set === 'first-breach' && c.type === 'Operation');
  assert.doesNotMatch(arena.cardDialog(state(g), fb.id, null, ''), /Probe|Reuse|Overclock|Retire|Archive/);
});

test('the Field Guide teaches Persistent Threats once it is released', () => {
  const on = guide({expansion: true}),
    off = guide({expansion: false});
  assert.match(on, /FIELD GUIDE \/ ALL SETS/);
  assert.match(on, /<h2>Persistent Threats<\/h2>/);
  for (const [name] of Object.values(MECHANICS)) assert.match(on, new RegExp(`<strong>${name}\\.</strong>`));
  assert.match(on, /Triggered abilities/);
  assert.match(on, /Make your choice/);
  assert.doesNotMatch(on, /no exile, token, or sideboard/);
  assert.match(off, /FIELD GUIDE \/ FIRST BREACH/);
  assert.doesNotMatch(off, /Persistent Threats/);
  assert.match(off, /There are no exile, token, or sideboard mechanics in this set\./);
});

import {EXPANSION_POOL} from '../public/cards.mjs';
import {choiceTip, expansionTip} from '../public/expansion-tips.mjs';

test('expansion tips follow what the player has, and never appear in a First Breach match', () => {
  const g = table();
  g.pool = EXPANSION_POOL;
  const fb = new Game('red', () => 0.5);
  assert.equal(expansionTip(fb), null);
  assert.equal(choiceTip(fb), null);
  g.phase = 'main1';
  g.players[0].field = g.players[0].field.filter(c => BY_ID[c.id].type !== 'Tool');
  put(g, 0, 'r7');
  assert.equal(expansionTip(g), null);
  g.createToken(0, 'pt-backdoor');
  assert.match(expansionTip(g), /<strong>Backdoors\.<\/strong>/);
  assert.match(arena.tutorialText(state(g)), /Backdoors/);
  g.players[1].archive.push(g.card(pt('Seed Access')));
  assert.match(expansionTip(g), /Backdoors/, 'your own tokens come before the archive');
});

test('a pending Probe gets its own tip, ahead of the stack tip', () => {
  const g = probing();
  g.pool = EXPANSION_POOL;
  assert.match(choiceTip(g), /<strong>Probe\.<\/strong>/);
  assert.match(arena.tutorialText(state(g)), /Probe/);
});

// Mark the expansion released (or not) for one test, restoring whatever it was.
const releaseFor = (t, released) => {
  const was = SETS['persistent-threats'].released;
  SETS['persistent-threats'].released = released;
  t.after(() => (SETS['persistent-threats'].released = was));
};
const filter = (extra = {}) => ({filter: {q: '', faction: 'all', type: 'all', set: 'all', ...extra}});

test('the header edition and library follow the released sets', t => {
  releaseFor(t, false);
  assert.equal(edition(), 'FIRST BREACH / 01');
  assert.deepEqual(releasedTokens(), []);
  assert.match(library(filter()), /Each starter contains 24 infrastructure/);
  releaseFor(t, true);
  assert.equal(edition(), 'PERSISTENT THREATS / 02');
  assert.equal(releasedTokens().length, 2);
  const html = library(filter());
  assert.match(html, /100 cards · 4 decks/, 'tokens are not counted as cards');
  assert.match(html, /First Breach decks have 24 infrastructure, 24 units and 12 other cards\./);
  assert.match(html, /First Breach \+ Persistent Threats decks have 24 infrastructure, 20 units and 16 other cards\./);
});

test('the library lists tokens, and search and filters apply to them', t => {
  releaseFor(t, true);
  assert.match(libraryGrid(filter()), /data-card="pt-backdoor"/);
  assert.match(libraryGrid(filter({q: 'backdoor'})), /data-card="pt-backdoor"/);
  assert.doesNotMatch(libraryGrid(filter({faction: 'blue'})), /data-card="pt-backdoor"/);
  assert.doesNotMatch(libraryGrid(filter({set: 'first-breach'})), /data-card="pt-indicator"/);
});

test('about counts the released cards', t => {
  releaseFor(t, false);
  assert.match(about(), /every one of the 50 cards/);
  releaseFor(t, true);
  assert.match(about(), /every one of the 100 cards/);
});

test('a choice that cannot be confirmed says why, and Confirm points at the reason', t => {
  define(t, {
    id: 'x-sweep2',
    type: 'Tool',
    abilities: [
      {
        kind: 'triggered',
        id: 'sweep',
        label: 'Sweep',
        targets: [{key: 'g', zone: 'grave', side: 'any', upTo: 2, onePlayer: true}],
        steps: [{op: 'archive', to: 'g'}],
      },
    ],
  });
  const g = table();
  const src = put(g, 0, 'x-sweep2');
  const mine = put(g, 0, 'r7', 'grave'),
    theirs = put(g, 1, 'b8', 'grave');
  g.waiting = [{id: 21, p: 0, ability: {card: 'x-sweep2', uid: src.uid, id: 'sweep'}}];
  g.pending = {
    id: 9,
    actor: 0,
    kind: 'targets',
    private: false,
    prompt: 'Choose.',
    min: 1,
    max: 1,
    data: {trigger: 21},
  };
  g.pending.options = [{key: 'g', optional: false, upTo: 2, candidates: [ref(mine.uid), ref(theirs.uid)]}];
  let st = pickChoiceTarget(g, startChoice(g.pending), 'g', 0);
  assert.equal(choiceIssue(g, st), null, 'one card from one discard is fine');
  assert.doesNotMatch(choiceDialog(state(g), st), /choice-issue/);
  st = pickChoiceTarget(g, st, 'g', 1);
  const issue = choiceIssue(g, st);
  assert.equal(typeof issue, 'string');
  const html = choiceDialog(state(g), st);
  assert.match(html, /<p class="action-reason" id="choice-issue">/);
  assert.match(
    html,
    /<button[^>]*id="choiceConfirm"[^>]*disabled[^>]*aria-describedby="choice-issue"|<button[^>]*id="choiceConfirm"[^>]*aria-describedby="choice-issue"[^>]*disabled/,
  );
});

test('the screen-reader status region sits inside the modal dialog, outside its body', async () => {
  const {readFileSync} = await import('node:fs');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(
    html,
    /<dialog id="modal">[\s\S]*<div id="modalBody"><\/div>\s*<div id="srStatus"[^>]*aria-live="polite"><\/div>\s*<\/dialog>/,
  );
});
