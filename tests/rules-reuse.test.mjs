import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const map = {id: 'x-map', type: 'Operation', cost: 1, reuse: 3, steps: [{op: 'draw', n: 1}]};
const zap = {
  id: 'x-rezap',
  type: 'Response',
  cost: 1,
  reuse: 2,
  targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit']}],
  steps: [{op: 'damage', to: 't', amount: 1}],
};
const lotl = {
  id: 'x-lotl',
  type: 'Unit',
  power: 3,
  toughness: 3,
  abilities: [
    {id: 'l', kind: 'triggered', label: 'Loot', on: 'youCastFromGrave', once: true, steps: [{op: 'draw', n: 1}]},
  ],
};

test('a Reuse card is cast from the discard for its Reuse cost, then archived', t => {
  define(t, map);
  const g = table();
  compute(g, 0, 3);
  const c = put(g, 0, 'x-map', 'grave');
  assert.deepEqual(
    g.playIssues(0, c).map(i => i.code),
    ['not-in-hand'],
  );
  assert.deepEqual(g.playIssues(0, c, {reuse: true}), []);
  g.play(0, c.uid, null, {reuse: true});
  assert.equal(g.mana(0), 0);
  assert.equal(g.stack[0].opts.reuse, true);
  resolveTop(g);
  assert.equal(g.players[0].grave.length, 0);
  assert.deepEqual(
    g.players[0].archive.map(x => x.uid),
    [c.uid],
  );
});

test('only Operations and Responses with Reuse can be cast from the discard', () => {
  const g = table();
  compute(g, 0, 5);
  const fb = put(g, 0, 'r13', 'grave');
  assert.deepEqual(
    g.playIssues(0, fb, {reuse: true}).map(i => i.code),
    ['reuse'],
  );
});

test('a card cast normally from hand still goes to the discard', t => {
  define(t, map);
  const g = table();
  compute(g, 0, 1);
  g.play(0, put(g, 0, 'x-map', 'hand').uid);
  resolveTop(g);
  assert.equal(g.players[0].grave.length, 1);
});

test('a Reuse cast is archived when countered or when its target is gone', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 2);
  compute(g, 1, 2);
  const theirs = put(g, 1, 'b7');
  const c = put(g, 0, 'x-rezap', 'grave');
  g.play(0, c.uid, null, {reuse: true, targets: {t: {kind: 'card', uid: theirs.uid}}});
  g.pass(0);
  const block = CARDS.find(x => x.name === 'Block Execution').id;
  g.play(1, put(g, 1, block, 'hand').uid, {kind: 'spell', uid: c.uid});
  resolveTop(g);
  assert.ok(g.players[0].archive.some(x => x.uid === c.uid));

  const h = table();
  compute(h, 0, 2);
  const unit = put(h, 1, 'b7'),
    d = put(h, 0, 'x-rezap', 'grave');
  h.play(0, d.uid, null, {reuse: true, targets: {t: {kind: 'card', uid: unit.uid}}});
  h.bounce(1, unit);
  resolveTop(h);
  assert.ok(h.players[0].archive.some(x => x.uid === d.uid));
});

test('casting from the discard triggers abilities that care, even if the card is then countered', t => {
  define(t, map, lotl);
  const g = table();
  compute(g, 0, 3);
  put(g, 0, 'x-lotl');
  g.play(0, put(g, 0, 'x-map', 'grave').uid, null, {reuse: true});
  assert.equal(g.stack.length, 2);
  assert.equal(g.stack[1].ability.id, 'l');
});
