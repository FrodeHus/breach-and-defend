import test from 'node:test';
import assert from 'node:assert/strict';
import {Seat} from '../dist/remote.mjs';
import {versusGame, viewFor} from '../dist/protocol.mjs';

const CLOCK = {kind: 'opening', owner: null, left: 60000, paused: false};
function seat(options = {}) {
  const sent = [], g = versusGame('ab'.repeat(32), 'blue');
  const s = new Seat((action, seq) => sent.push({action, seq}), {now: () => 1000, ...options});
  s.update({view: viewFor(g, 1), clock: CLOCK});
  return {s, sent, g};
}

test('read-only queries answer from the guest view', () => {
  const {s} = seat();
  assert.equal(s.game.players[0].faction, 'red');
  assert.equal(s.game.players[0].hand.length, 7);
  assert.ok(s.game.players[1].hand.every(c => c.hidden));
  assert.deepEqual(s.clock, {...CLOCK, at: 1000});
  assert.ok(s.game.playIssues(0, s.game.players[0].hand[0]).some(i => i.code === 'opening'));
});

test('mutators send intents instead of changing local state', () => {
  const {s, sent} = seat(), before = JSON.stringify(s.game.toJSON());
  const bottom = [s.game.players[0].hand[0].uid];
  s.game.keep(bottom); s.game.play(0, 5, {kind: 'player', p: 1}); s.game.pass(0);
  s.game.attackers(0, [1]); s.game.blockers(0, {1: [2]}); s.game.discard([3]);
  s.game.mulligan(); s.game.concede(0);
  assert.deepEqual(sent.map(x => x.action), [
    {type: 'keep', bottom}, {type: 'play', uid: 5, target: {kind: 'player', p: 1}}, {type: 'pass'},
    {type: 'attackers', uids: [1]}, {type: 'blockers', assignments: {1: [2]}}, {type: 'discard', uids: [3]},
    {type: 'mulligan'}, {type: 'concede'},
  ]);
  assert.deepEqual(sent.map(x => x.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(JSON.stringify(s.game.toJSON()), before);
});

test('an acknowledged intent resolves after the new state is in place', async () => {
  const {s, g} = seat(), updates = [];
  s.onUpdate = (game, info) => updates.push([game, info]);
  const done = s.game.keep([]);
  g.keep([], 1);
  s.update({view: viewFor(g, 1), clock: null, ackSeq: 1});
  await done;
  assert.equal(s.game.kept[0], true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], s.game);
  assert.deepEqual(updates[0][1], {mine: true});
  assert.equal(s.clock, null);
});

test('a rejected intent rejects with the host message; other updates are not mine', async () => {
  const {s, g} = seat(), infos = [];
  s.onUpdate = (_, info) => infos.push(info);
  const pending = s.game.pass(0);
  s.reject(1, 'Wait for your turn to act.');
  await assert.rejects(pending, /Wait for your turn/);
  s.update({view: viewFor(g, 1)});
  assert.deepEqual(infos, [{mine: false}]);
});

test('dropping pending intents rejects all of them', async () => {
  const {s} = seat(), a = s.game.pass(0), b = s.game.pass(0);
  s.dropPending('Connection lost.');
  await assert.rejects(a, /Connection lost/);
  await assert.rejects(b, /Connection lost/);
});

test('a seat continues numbering from a saved sequence', () => {
  const {s, sent} = seat({seq: 41});
  s.game.pass(0);
  assert.equal(sent[0].seq, 42);
});
