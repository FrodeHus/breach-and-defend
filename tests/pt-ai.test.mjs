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
