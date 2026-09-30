import test from 'node:test';
import assert from 'node:assert/strict';
import {BY_ID, EXPANSION_POOL, POOLS, deck, releasedCards, releasedPools} from '../public/cards.mjs';
import {Game} from '../public/engine.mjs';
import {library} from '../public/library.mjs';
import {landing} from '../public/landing.mjs';

const names = list => {
  const out = {};
  for (const id of list) out[BY_ID[id].name] = (out[BY_ID[id].name] ?? 0) + 1;
  return out;
};
const twoEach = (...cards) => Object.fromEntries(cards.map(n => [n, 2]));

test('the expansion pool uses both sets and is not offered while the set is unreleased', () => {
  assert.equal(EXPANSION_POOL, 'first-breach+persistent-threats');
  assert.deepEqual(POOLS[EXPANSION_POOL].sets, ['first-breach', 'persistent-threats']);
  assert.equal(POOLS[EXPANSION_POOL].optIn, 'Persistent Threats');
  assert.deepEqual(releasedPools(), ['first-breach']);
  assert.ok(!releasedCards().some(c => c.set === 'persistent-threats'));
  assert.doesNotMatch(landing({mode: 'solo'}), /includeExpansion/);
  assert.doesNotMatch(library({filter: {q: '', faction: 'all', type: 'all', set: 'all'}}), /setFilter/);
});

test('Persistent Access is the design’s red list', () => {
  assert.deepEqual(names(deck('red', EXPANSION_POOL)), {
    'Relay Node': 20,
    ...twoEach(
      'Ghost Relay',
      'Reconnaissance Outpost',
      'Attack Surface Mapper',
      'Beachhead Scout',
      'Staged Loader',
      'Dormant Implant',
      'Access Broker',
      'Living-off-the-Land Operator',
      'Redundant Handler',
      'Coordinated Intrusion Lead',
      'Long-Haul Campaign',
      'Phishing Courier',
      'Map Trust Relationships',
      'Seed Access',
      'Burn the Channel',
      'Exploit the Handoff',
      'Signal Spoof',
      'Reopened Connection',
      'Exfiltration Buffer',
      'Distributed Command',
    ),
  });
});

test('Indicators to Action is the design’s blue list', () => {
  assert.deepEqual(names(deck('blue', EXPANSION_POOL)), {
    'Secure Datacenter': 20,
    ...twoEach(
      'Forensic Repository',
      'Instrumented Datacenter',
      'Alert Triage Analyst',
      'Canary Service',
      'Telemetry Curator',
      'Behavioral Monitor',
      'Case Analyst',
      'Lockdown Coordinator',
      'Restoration Lead',
      'Incident Commander',
      'Resilient Service Mesh',
      'Incident Responder',
      'Reconstruct the Timeline',
      'Preserve the Scene',
      'Scoped Remediation',
      'Verify Provenance',
      'Live Response',
      'Break the Chain',
      'Analysis Workbench',
      'Continuous Validation',
    ),
  });
});

test('a match on the expansion pool deals from the expansion decks', () => {
  const g = new Game('red', Math.random, {pool: EXPANSION_POOL});
  for (const q of g.players) assert.equal(q.deck.length + q.hand.length, 60);
  assert.ok([...g.players[0].deck, ...g.players[0].hand].some(c => BY_ID[c.id].set === 'persistent-threats'));
});
