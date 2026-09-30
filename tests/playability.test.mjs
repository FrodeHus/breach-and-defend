import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {CARDS} from '../public/cards.mjs';

function setup(name) {
  const g = new Game();
  g.phase = 'main1';
  g.players[0].hand = [];
  const c = g.card(CARDS.find(c => c.name === name).id);
  g.players[0].hand.push(c);
  return {g, c};
}
function compute(g, n) {
  for (let i = 0; i < n; i++) g.players[0].field.push(g.card(CARDS.find(c => c.name === 'Secure Datacenter').id));
}
const codes = (g, c) => g.playIssues(0, c).map(issue => issue.code);

test('unaffordable operations report required and ready compute and reject with the same reason', () => {
  const {g, c} = setup('Disrupt Infrastructure');
  compute(g, 3);
  g.players[0].field[0].tapped = true;
  assert.deepEqual(codes(g, c), ['compute']);
  assert.match(g.playIssues(0, c)[0].message, /4 compute.*2 available/);
  assert.throws(() => g.play(0, c.uid), /4 compute.*2 available/);
  compute(g, 2);
  assert.deepEqual(codes(g, c), []);
  assert.equal(g.legal(0, c), true);
});

test('operations explain main-phase timing and pending effects, while responses may react', () => {
  const {g, c} = setup('Correlate Logs');
  compute(g, 5);
  g.active = 1;
  g.phase = 'afterAttack';
  assert.deepEqual(codes(g, c), ['main-phase']);
  g.active = 0;
  g.phase = 'main1';
  const response = g.card(CARDS.find(c => c.name === 'Restore Backup').id);
  g.players[0].hand.push(response);
  g.stack.push({card: g.card('r2'), p: 1});
  assert.deepEqual(codes(g, c), ['stack']);
  assert.deepEqual(codes(g, response), []);
  g.priority = 1;
  assert.deepEqual(codes(g, response), ['priority']);
});

for (const [name, code, pattern] of [
  ['Emergency Patch', 'target-unit', /no units on the battlefield/i],
  ['Configuration Audit', 'target-support', /no Tools or Controls/i],
  ['Clean Rebuild', 'target-grave', /no unit cards in your discard/i],
  ['Block Execution', 'target-spell', /no Response or Operation on the stack/i],
])
  test(`${name} explains its missing target alongside insufficient compute`, () => {
    const {g, c} = setup(name);
    assert.deepEqual(codes(g, c), ['compute', code]);
    assert.match(g.playIssues(0, c)[1].message, pattern);
    compute(g, 5);
    assert.deepEqual(codes(g, c), [code]);
    if (code === 'target-unit') g.players[1].field.push(g.card('r2'));
    if (code === 'target-support') g.players[1].field.push(g.card(CARDS.find(c => c.type === 'Tool').id));
    if (code === 'target-grave') g.players[0].grave.push(g.card('b2'));
    if (code === 'target-spell') {
      g.stack.push({card: g.card('r2'), p: 1});
      assert.deepEqual(codes(g, c), [code]); // A unit spell cannot be countered by this card.
      g.stack.push({card: g.card(CARDS.find(c => c.type === 'Operation').id), p: 1});
    }
    assert.deepEqual(codes(g, c), []);
    assert.equal(g.legal(0, c), true);
  });

test('special phases, ended matches and cards outside the hand explain their blockers', () => {
  const {g, c} = setup('Restore Backup');
  compute(g, 2);
  for (const phase of ['opening', 'attack', 'block', 'cleanup']) {
    g.phase = phase;
    assert.deepEqual(codes(g, c), [phase]);
    assert.equal(g.legal(0, c), false);
  }
  g.phase = 'main1';
  g.winner = 0;
  assert.deepEqual(codes(g, c), ['finished']);
  g.winner = null;
  g.players[0].hand = [];
  assert.deepEqual(codes(g, c), ['not-in-hand']);
});

test('infrastructure still obeys its one-per-turn limit without compute cost', () => {
  const {g, c} = setup('Secure Datacenter');
  assert.deepEqual(codes(g, c), []);
  g.players[0].landPlayed = true;
  assert.deepEqual(codes(g, c), ['infrastructure-limit']);
});
