import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const opposingUnit = {key: 't', zone: 'field', side: 'opponent', types: ['Unit']};
const zap = {
  id: 'x-zap',
  type: 'Response',
  cost: 1,
  targets: [opposingUnit],
  steps: [{op: 'damage', to: 't', amount: 2}],
  overclock: {cost: 2, instead: true, steps: [{op: 'damage', to: 't', amount: 5}]},
};
const twin = {
  id: 'x-twin',
  type: 'Operation',
  cost: 1,
  modes: [
    {label: 'Draw', steps: [{op: 'draw', n: 1}]},
    {label: 'Hit', targets: [opposingUnit], steps: [{op: 'damage', to: 't', amount: 1}]},
  ],
};
const purge = {
  id: 'x-purge',
  type: 'Operation',
  cost: 0,
  targets: [opposingUnit, {key: 'g', zone: 'grave', side: 'any', upTo: 2, onePlayer: true}],
  steps: [
    {op: 'destroy', to: 't'},
    {op: 'archive', to: 'g'},
  ],
};
const sweep = {
  id: 'x-sweep',
  type: 'Operation',
  cost: 0,
  targets: [{key: 'g', zone: 'grave', side: 'any', upTo: 2}],
  steps: [
    {op: 'archive', to: 'g'},
    {op: 'draw', n: 1},
  ],
};
const codes = (g, c, o) => g.playIssues(0, c, o).map(i => i.code);

test('a rule spell damages a chosen opposing unit and goes to discard', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 3);
  const mine = put(g, 0, 'r7'),
    theirs = put(g, 1, 'b7');
  const c = put(g, 0, 'x-zap', 'hand');
  assert.throws(() => g.play(0, c.uid, null, {targets: {t: {kind: 'card', uid: mine.uid}}}), /legal target/);
  assert.throws(() => g.play(0, c.uid, null, {}), /legal target/);
  g.play(0, c.uid, null, {targets: {t: {kind: 'card', uid: theirs.uid}}});
  assert.equal(g.mana(0), 2);
  assert.deepEqual(g.stack[0].opts, {targets: {t: {kind: 'card', uid: theirs.uid}}});
  resolveTop(g);
  assert.equal(theirs.damage, 2);
  assert.deepEqual(
    g.players[0].grave.map(x => x.id),
    ['x-zap'],
  );
});

test('with no legal target a rule spell cannot be cast', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 3);
  const c = put(g, 0, 'x-zap', 'hand');
  assert.deepEqual(codes(g, c), ['target']);
});

test('Overclock costs more and replaces the effect; it must be affordable', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 2);
  const theirs = put(g, 1, 'b7'),
    c = put(g, 0, 'x-zap', 'hand');
  assert.deepEqual(codes(g, c, {overclock: true}), ['compute']);
  compute(g, 0, 1);
  g.play(0, c.uid, null, {overclock: true, targets: {t: {kind: 'card', uid: theirs.uid}}});
  assert.equal(g.mana(0), 0);
  resolveTop(g);
  assert.ok(
    g.players[1].grave.some(x => x.uid === theirs.uid),
    '5 damage defeats Segmentation Gateway (1/5)',
  );
  assert.deepEqual(codes(g, put(g, 0, 'r13', 'hand'), {overclock: true}), ['compute', 'overclock']);
});

test('a target that leaves before resolution makes the spell do nothing', t => {
  define(t, zap);
  const g = table();
  compute(g, 0, 1);
  const theirs = put(g, 1, 'b7'),
    c = put(g, 0, 'x-zap', 'hand');
  g.play(0, c.uid, null, {targets: {t: {kind: 'card', uid: theirs.uid}}});
  g.bounce(1, theirs);
  resolveTop(g);
  assert.deepEqual(
    g.players[0].grave.map(x => x.id),
    ['x-zap'],
  );
  assert.match(g.log[0], /no legal target/);
});

test('with several targets, the ones still legal are acted on', t => {
  define(t, purge);
  const g = table();
  const theirs = put(g, 1, 'b7'),
    dead = put(g, 1, 'b8', 'grave'),
    c = put(g, 0, 'x-purge', 'hand');
  g.play(0, c.uid, null, {
    targets: {t: {kind: 'card', uid: theirs.uid}, g: [{kind: 'card', uid: dead.uid}]},
  });
  g.remove(1, theirs);
  resolveTop(g);
  assert.deepEqual(
    g.players[1].archive.map(x => x.uid),
    [dead.uid],
  );
});

test('up-to targets can be zero, must be distinct and, when asked, from one player', t => {
  define(t, purge, sweep);
  const g = table();
  const a = put(g, 0, 'r7', 'grave'),
    b = put(g, 1, 'b7', 'grave'),
    theirs = put(g, 1, 'b8');
  const p = put(g, 0, 'x-purge', 'hand');
  const ref = uid => ({kind: 'card', uid});
  assert.throws(
    () => g.play(0, p.uid, null, {targets: {t: ref(theirs.uid), g: [ref(a.uid), ref(b.uid)]}}),
    /single player/,
  );
  assert.throws(() => g.play(0, p.uid, null, {targets: {t: ref(theirs.uid), g: [ref(b.uid), ref(b.uid)]}}), /up to 2/);
  const s = put(g, 0, 'x-sweep', 'hand');
  g.play(0, s.uid, null, {targets: {g: []}});
  resolveTop(g);
  assert.equal(g.players[0].hand.length, 2, 'zero chosen targets still resolves: it drew a card');
});

test('a modal spell needs a mode; each mode has its own targets', t => {
  define(t, twin);
  const g = table();
  compute(g, 0, 2);
  const c = put(g, 0, 'x-twin', 'hand');
  assert.deepEqual(codes(g, c), [], 'castable: the draw mode needs no target');
  assert.deepEqual(codes(g, c, {mode: 1}), ['target']);
  assert.deepEqual(codes(g, c, {mode: 5}), ['mode']);
  assert.throws(() => g.play(0, c.uid, null, {}), /Choose one of this card’s modes/);
  g.play(0, c.uid, null, {mode: 0});
  resolveTop(g);
  assert.equal(g.players[0].hand.length, 1);
});
