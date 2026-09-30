import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const relay = {
  id: 'x-relay',
  type: 'Infrastructure',
  abilities: [
    {
      id: 'cash',
      kind: 'activated',
      label: 'Cash out',
      cost: {compute: 3, tap: true, retire: 'self'},
      steps: [{op: 'createToken', token: 'pt-backdoor', n: 2}],
    },
  ],
};
const burn = {
  id: 'x-burn',
  type: 'Operation',
  cost: 2,
  extraCost: {retire: {types: ['Tool']}},
  targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit']}],
  steps: [{op: 'destroy', to: 't'}],
};
const swap = {
  id: 'x-swap',
  type: 'Operation',
  cost: 0,
  extraCost: {retire: {types: ['Unit']}},
  targets: [{key: 't', zone: 'field', side: 'any', types: ['Unit']}],
  steps: [{op: 'bounce', to: 't'}],
};
const ref = uid => ({kind: 'card', uid});

test('a Backdoor boosts a unit you control: it is retired and vanishes as the cost', () => {
  const g = table();
  compute(g, 0, 1);
  const u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  g.activate(0, b.uid, 'boost', {targets: {t: ref(u.uid)}});
  assert.equal(g.mana(0), 0);
  assert.ok(!g.players[0].field.includes(b));
  assert.equal(g.players[0].grave.length, 0);
  assert.equal(g.stack[0].ability.id, 'boost');
  resolveTop(g);
  assert.equal(g.stats(u, 0).power, 5);
});

test('an Indicator draws a card when analyzed', () => {
  const g = table();
  compute(g, 0, 2);
  const i = g.createToken(0, 'pt-indicator');
  g.activate(0, i.uid, 'analyze');
  resolveTop(g);
  assert.equal(g.players[0].hand.length, 1);
});

test('abilities are activated only in your own main phase with an empty stack and priority', () => {
  const g = table();
  compute(g, 0, 2);
  const i = g.createToken(0, 'pt-indicator');
  const codes = () => g.activationIssues(0, i.uid, 'analyze').map(x => x.code);
  g.phase = 'afterAttack';
  assert.deepEqual(codes(), ['main-phase']);
  g.phase = 'main1';
  g.active = 1;
  assert.deepEqual(codes(), ['main-phase']);
  g.active = 0;
  g.priority = 1;
  assert.deepEqual(codes(), ['main-phase']);
  g.priority = 0;
  assert.deepEqual(codes(), []);
  assert.deepEqual(
    g.activationIssues(0, i.uid, 'nope').map(x => x.code),
    ['no-ability'],
  );
});

test('an Infrastructure ability that taps it pays its compute with other infrastructure', t => {
  define(t, relay);
  const g = table();
  const r = put(g, 0, 'x-relay');
  compute(g, 0, 2);
  assert.deepEqual(
    g.activationIssues(0, r.uid, 'cash').map(x => x.code),
    ['compute'],
  );
  compute(g, 0, 1);
  g.activate(0, r.uid, 'cash');
  assert.equal(g.mana(0), 0);
  assert.ok(g.players[0].grave.some(x => x.uid === r.uid));
  resolveTop(g);
  assert.equal(g.players[0].field.filter(x => x.id === 'pt-backdoor').length, 2);
});

test('an extra retire cost must be chosen; a bad choice pays nothing', t => {
  define(t, burn);
  const g = table();
  compute(g, 0, 2);
  const theirs = put(g, 1, 'b7'),
    c = put(g, 0, 'x-burn', 'hand');
  assert.deepEqual(
    g.playIssues(0, c).map(x => x.code),
    ['retire'],
  );
  const b = g.createToken(0, 'pt-backdoor');
  const before = JSON.stringify(g.toJSON());
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: ref(theirs.uid)}, costUids: [theirs.uid]}), /retire/);
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: ref(theirs.uid)}}), /cards this cost needs/);
  assert.equal(JSON.stringify(g.toJSON()), before);
  g.play(0, c.uid, null, {targets: {t: ref(theirs.uid)}, costUids: [b.uid]});
  assert.ok(!g.players[0].field.includes(b));
  resolveTop(g);
  assert.ok(g.players[1].grave.some(x => x.uid === theirs.uid));
});

test('a card paying a cost cannot also be a target', t => {
  define(t, swap);
  const g = table();
  const u = put(g, 0, 'r7'),
    c = put(g, 0, 'x-swap', 'hand');
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: ref(u.uid)}, costUids: [u.uid]}), /also be a target/);
});
