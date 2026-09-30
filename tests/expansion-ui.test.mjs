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
