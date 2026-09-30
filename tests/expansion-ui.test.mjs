import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
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
  const g = table();
  const c = put(g, 0, pt('Seed Access'), 'hand');
  const el = {dataset: {card: c.id, zone: 'hand', uid: String(c.uid)}};
  assert.doesNotMatch(hoverCard(state(g), el), /undefined/);
  assert.doesNotMatch(lorePanel(CARDS.find(x => x.id === c.id)), /undefined/);
});

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
  assert.doesNotMatch(html, /class="token-group"/, 'untapped, tapped, untapped are three separate runs');
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
