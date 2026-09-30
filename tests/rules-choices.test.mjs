import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const peek = {
  id: 'x-peek',
  type: 'Operation',
  cost: 0,
  steps: [
    {op: 'probe', n: 2},
    {op: 'draw', n: 1},
  ],
};
const loot = {
  id: 'x-loot',
  type: 'Operation',
  cost: 0,
  steps: [
    {op: 'draw', n: 2},
    {op: 'discard', n: 1},
  ],
};
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
  assert.deepEqual(g.players[0].grave.map(c => c.uid).slice(0, 1), [top]);
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
  g.archiveCard(
    0,
    g.players[0].grave.find(c => c.uid === h2.uid),
  );
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
  define(t, peek, {
    id: 'x-greedy',
    type: 'Operation',
    cost: 0,
    steps: [
      {op: 'draw', n: 20},
      {op: 'heal', n: 5},
    ],
  });
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
