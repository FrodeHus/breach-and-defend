import test from 'node:test';
import assert from 'node:assert/strict';
import {BY_ID} from '../public/cards.mjs';
import {MATCHUPS, interval, playtest, report, setupMatch} from './helpers/playtest.mjs';

test('a First Breach side really plays its starter', () => {
  const g = setupMatch(1, MATCHUPS['PT red vs FB blue'], 0);
  const cards = p => [...g.players[p].deck, ...g.players[p].hand];
  assert.equal(cards(1).length, 60);
  assert.ok(cards(1).every(c => BY_ID[c.id].set === 'first-breach'));
  assert.equal(g.players[1].hand.length, 7);
  assert.ok(cards(0).some(c => BY_ID[c.id].set === 'persistent-threats'));
});

test('every matchup finishes and reports the design’s metrics', () => {
  const rows = playtest([1]);
  assert.deepEqual(
    rows.map(r => r.matchup),
    Object.keys(MATCHUPS),
  );
  for (const r of rows) {
    assert.equal(r.games, 2);
    assert.equal(r.stalled, 0, `${r.matchup} stalled`);
    for (const k of ['turns', 'tokensMade', 'tokensUnspent', 'reuseCasts', 'overclocks', 'choices'])
      assert.ok(Number.isFinite(r[k]) && r[k] >= 0, `${r.matchup} ${k}`);
  }
  assert.match(report(rows), /\| PT vs PT \| 2 \|/);
});

test('win-rate intervals are sensible', () => {
  assert.deepEqual(interval(0, 0), [0, 0]);
  const [lo, hi] = interval(50, 100);
  assert.ok(lo < 50 && hi > 50 && lo >= 35 && hi <= 65);
});
