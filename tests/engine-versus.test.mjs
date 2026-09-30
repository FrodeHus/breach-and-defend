import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {CARDS} from '../public/cards.mjs';
import {seeded, choose, perform} from './helpers/policy.mjs';

const versus = (first = 0, n = 3) => new Game('blue', seeded(n), {mode: 'versus', first});

test('solo mode is unchanged: only player 0 keeps and goes first', () => {
  const g = new Game('red');
  assert.equal(g.mode, 'solo');
  assert.equal(g.actor(), 0);
  assert.equal(g.mulligans, 0);
  g.keep();
  assert.equal(g.phase, 'upkeep');
  assert.equal(g.active, 0);
  assert.match(g.log[0], /^You take the first turn/);
});

test('versus: both players keep, in any order, before the first turn', () => {
  const g = versus(1);
  assert.equal(g.actor(), 0);
  g.mulligan(1);
  assert.deepEqual(g.mulls, [0, 1]);
  assert.equal(g.mulligans, 0);
  g.keep([], 0);
  assert.equal(g.phase, 'opening');
  assert.equal(g.actor(), 1);
  assert.throws(() => g.keep([], 0), /Choose/);
  assert.throws(() => g.mulligan(0), /No mulligan/);
  assert.throws(() => g.keep([], 1), /Choose 1/);
  const bottom = g.players[1].hand[0];
  g.keep([bottom.uid], 1);
  assert.equal(g.phase, 'upkeep');
  assert.equal(g.active, 1);
  assert.equal(g.priority, 1);
  assert.equal(g.players[1].deck[0].uid, bottom.uid);
  assert.match(g.log[0], /^Red team takes the first turn/);
});

test('versus: the first player skips their first draw', () => {
  const g = versus(1);
  g.keep([], 0); g.keep([], 1);
  const hand = g.players[1].hand.length;
  g.pass(1); g.pass(0);
  assert.equal(g.phase, 'draw');
  assert.equal(g.players[1].hand.length, hand);
});

test('versus log text names factions instead of You/Computer', () => {
  const g = versus(0);
  g.keep([], 0); g.keep([], 1);
  g.phase = 'main1';
  const land = g.card(CARDS.find(c => c.faction === 'blue' && c.type === 'Infrastructure').id);
  g.players[0].hand.push(land);
  g.play(0, land.uid);
  assert.match(g.log[0], /^Blue team plays /);
  assert.equal(g.targetName({kind: 'player', p: 1}), 'Red team capacity');
  assert.ok(g.log.every(line => !/\b(You|Computer)\b/.test(line)), g.log.join('\n'));
});

test('concede ends the match for the other player', () => {
  const g = versus(0);
  g.concede(1);
  assert.equal(g.winner, 0);
  assert.match(g.reason, /Red team left the match/);
  assert.throws(() => g.concede(0), /already ended/);
});

test('60 seeded versus matches finish and conserve cards with either first player', () => {
  for (let n = 1; n <= 60; n++) {
    const g = new Game(n % 2 ? 'blue' : 'red', seeded(n), {mode: 'versus', first: n % 2});
    for (let i = 0; i < 10000 && g.winner === null; i++) { const p = g.actor(); perform(g, p, choose(g, p)); }
    assert.notEqual(g.winner, null, `seed ${n} did not finish`);
    for (let p = 0; p < 2; p++) {
      const q = g.players[p];
      assert.equal(q.deck.length + q.hand.length + q.field.length + q.grave.length + g.stack.filter(s => s.p === p).length, 60, `seed ${n} player ${p}`);
    }
  }
});

test('toJSON/fromJSON restores a match mid-turn and continues identically', () => {
  const g = new Game('blue', seeded(9), {mode: 'versus', first: 1});
  for (let i = 0; i < 120 && g.winner === null; i++) { const p = g.actor(); perform(g, p, choose(g, p)); }
  g.stack.push({card: g.card(CARDS.find(c => c.type === 'Operation').id), p: g.active, target: {kind: 'player', p: 1 - g.active}});
  const json = JSON.parse(JSON.stringify(g.toJSON()));
  const r = Game.fromJSON(json);
  assert.ok(r instanceof Game);
  assert.deepEqual(r.toJSON(), g.toJSON());
  assert.equal(r.mulligans, g.mulligans);
  for (let i = 0; i < 300 && g.winner === null; i++) { const p = g.actor(), a = choose(g, p); perform(g, p, a); perform(r, p, a); }
  assert.deepEqual(r.toJSON(), g.toJSON());
  r.players[0].life = -5;
  assert.notEqual(json.players[0].life, -5, 'a restored game must not share objects with its source');
});

test('solo games save without RNG state and restore with Math.random', () => {
  const json = new Game('red').toJSON();
  assert.equal(json.rng, null);
  assert.equal(Game.fromJSON(json).random, Math.random);
});
