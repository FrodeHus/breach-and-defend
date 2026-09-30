import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {Tutorial} from '../public/tutorial.mjs';
import * as arena from '../public/arena-view.mjs';
import {stackItem} from '../public/expansion-view.mjs';
import {hoverCard} from '../public/card-view.mjs';
import {lorePanel} from '../public/lore-panel.mjs';
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
