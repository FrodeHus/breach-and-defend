import test from 'node:test';
import assert from 'node:assert/strict';
import {BY_ID, EXPANSION_POOL} from '../public/cards.mjs';
import {Game} from '../public/engine.mjs';
import {aiMatch, conserved} from './helpers/simulate.mjs';

// Saves mid-match, restores, and compares: tokens, the archive and pending choices must all survive.
const roundTrip = g => assert.deepEqual(Game.fromJSON(g.toJSON()).toJSON(), g.toJSON());
const check = label => (g, step) => {
  for (const p of [0, 1]) assert.equal(conserved(g, p), 60, `${label}: player ${p} cards at step ${step}`);
  roundTrip(g);
};

test('complete expansion matches finish for both factions and both starting players', () => {
  const seen = new Set();
  for (const faction of ['red', 'blue'])
    for (const first of [0, 1])
      for (let seed = 1; seed <= 5; seed++) {
        const label = `${faction} first=${first} seed=${seed}`;
        const g = aiMatch(seed, {faction, first, pool: EXPANSION_POOL, check: check(label)});
        assert.notEqual(g.winner, null, `${label} finished`);
        for (const p of [0, 1]) assert.equal(conserved(g, p), 60, `${label}: final card count`);
        for (const line of g.log) for (const c of Object.values(BY_ID)) if (line.includes(c.name)) seen.add(c.set);
      }
  assert.ok(seen.has('persistent-threats'), 'expansion cards were actually played');
});

test('the computer plays First Breach exactly as before when it plays both seats', () => {
  const g = aiMatch(3, {check: check('first-breach')});
  assert.notEqual(g.winner, null);
});
