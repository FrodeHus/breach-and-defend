import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../public/match.mjs';
import {CARDS} from '../public/cards.mjs';
import {applyAction, canonical, seedHex, unflipAction, versusGame} from '../public/protocol.mjs';
import {choose} from './helpers/policy.mjs';
import {act, fakeTime, newMatch, openedMatch} from './helpers/versus.mjs';

test('nothing happens until both players take the pledge', async () => {
  const m = await newMatch(),
    changes = [];
  m.onChange = c => changes.push(c);
  assert.match(m.submit(0, {type: 'keep'}).error, /pledge/);
  m.pledge(0);
  assert.equal(changes.length, 0);
  m.pledge(1);
  assert.equal(m.started, true);
  assert.deepEqual(changes, [{}]);
  assert.equal(m.submit(0, {type: 'keep'}).ok, true);
  assert.equal(changes[1].entry.type, 'keep');
  assert.equal(changes[1].entry.n, 1);
});

test('players cannot act out of turn, and a rejected action changes nothing', async () => {
  const m = await openedMatch(),
    a = m.game.actor(),
    b = 1 - a;
  const before = canonical(m.game.toJSON());
  assert.match(act(m, b, {type: 'pass'}).error, /Wait for your turn/);
  assert.equal(act(m, a, {type: 'blockers', assignments: {1: 5}}).ok, false);
  assert.equal(act(m, a, null).ok, false);
  assert.equal(canonical(m.game.toJSON()), before);
  assert.equal(m.log.length, 2);
});

test('guest targets are stored in host indices', async () => {
  const m = await openedMatch(),
    g = m.game;
  Object.assign(g, {phase: 'main1', active: 1, priority: 1});
  const id = name => CARDS.find(c => c.name === name).id;
  for (let i = 0; i < 10; i++) g.players[1].field.push(g.card(id('Relay Node')));
  const dos = g.card(id('Denial of Service'));
  g.players[1].hand.push(dos);
  const r = m.submit(1, {type: 'play', uid: dos.uid, target: {kind: 'player', p: 1}}, 2000);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.entry.target, {kind: 'player', p: 0});
  assert.deepEqual(m.game.stack.at(-1).target, {kind: 'player', p: 0});
});

test('a repeated guest intent is applied once', async () => {
  const m = await openedMatch();
  Object.assign(m.game, {phase: 'main1', active: 1, priority: 1});
  assert.equal(m.submit(1, {type: 'pass'}, 5000).ok, true);
  const length = m.log.length;
  assert.deepEqual(m.submit(1, {type: 'pass'}, 5000), {ok: true, duplicate: true});
  assert.equal(m.log.length, length);
});

test('while the guest is away only concede is accepted', async () => {
  const m = await openedMatch();
  m.connect(false);
  assert.match(act(m, m.game.actor(), {type: 'pass'}).error, /disconnected/);
  assert.equal(m.submit(0, {type: 'concede'}).ok, true);
  assert.equal(m.game.winner, 1);
  assert.equal(m.ended, true);
  assert.match(act(m, 1, {type: 'pass'}).error, /ended/);
});

test('the log replays to the same state from the seed', async () => {
  const m = await openedMatch();
  for (let i = 0; i < 200 && !m.ended; i++) {
    const p = m.game.actor(),
      a = choose(m.game, p);
    assert.equal(act(m, p, p === 1 ? unflipAction(a) : a).ok, true);
  }
  const replay = versusGame(await seedHex('a'.repeat(32), 'b'.repeat(32)), 'blue');
  for (const entry of m.log) applyAction(replay, entry.by, entry);
  assert.equal(canonical(replay.toJSON()), canonical(m.game.toJSON()));
});

test('a saved match restores its game, log and pledges, and waits for the guest', async () => {
  const m = await openedMatch();
  act(m, m.game.actor(), {type: 'pass'});
  const r = Match.fromJSON(JSON.parse(JSON.stringify(m.toJSON())), fakeTime());
  assert.equal(canonical(r.game.toJSON()), canonical(m.game.toJSON()));
  assert.deepEqual(r.log, m.log);
  assert.equal(r.lastSeq, m.lastSeq);
  assert.equal(r.started, true);
  assert.equal(r.guestConnected, false);
});
