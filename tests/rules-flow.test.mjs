import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, put, table} from './helpers/rules.mjs';
import {conserved} from './helpers/simulate.mjs';

const heal = {id: 'x-reheal', type: 'Response', cost: 1, reuse: 1, steps: [{op: 'heal', n: 1}]};

test('a player with a castable Reuse Response in the discard can act, so auto-pass waits', t => {
  define(t, heal);
  const g = table();
  g.active = 1;
  g.priority = 0;
  g.phase = 'afterAttack';
  assert.equal(g.canAct(0), false);
  compute(g, 0, 1);
  put(g, 0, 'x-reheal', 'grave');
  assert.equal(g.canAct(0), true);
});

test('a player with a pending choice can act; the other cannot', t => {
  define(t, {id: 'x-peek', type: 'Operation', cost: 0, steps: [{op: 'probe', n: 1}]});
  const g = table();
  g.play(0, put(g, 0, 'x-peek', 'hand').uid);
  g.pass(0);
  g.pass(1);
  assert.equal(g.canAct(0), true);
  assert.equal(g.canAct(1), false);
});

test('card conservation counts archived and stacked cards but not tokens', t => {
  define(t, {id: 'x-map', type: 'Operation', cost: 0, reuse: 0, steps: [{op: 'draw', n: 1}]});
  const g = table();
  const before = conserved(g, 0);
  g.createToken(0, 'pt-backdoor');
  const c = put(g, 0, 'x-map', 'grave');
  g.play(0, c.uid, null, {reuse: true});
  assert.equal(conserved(g, 0), before + 1);
  g.pass(0);
  g.pass(1);
  assert.equal(conserved(g, 0), before + 1);
});
