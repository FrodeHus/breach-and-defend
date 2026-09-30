import test from 'node:test';
import assert from 'node:assert/strict';
import {Match, TURN_MS, RESPONSE_MS, OPENING_MS} from '../public/match.mjs';
import {BY_ID} from '../public/cards.mjs';
import {act, fakeTime, openedMatch, startedMatch} from './helpers/versus.mjs';

test('opening hands are kept automatically after 60 s, bottoming the costliest cards', async () => {
  const time = fakeTime(),
    m = await startedMatch(time);
  act(m, 0, {type: 'mulligan'});
  const worst = Math.max(...m.game.players[0].hand.map(c => BY_ID[c.id].cost));
  time.advance(OPENING_MS - 1);
  assert.equal(m.game.phase, 'opening');
  time.advance(1);
  assert.equal(m.game.phase, 'upkeep');
  assert.deepEqual(
    m.log.filter(e => e.type === 'keep').map(e => [e.by, e.timeout]),
    [
      [0, true],
      [1, true],
    ],
  );
  assert.equal(BY_ID[m.game.players[0].deck[0].id].cost, worst);
});

test('the active player gets 90 s per turn, then auto-passes for the rest of it', async () => {
  const time = fakeTime(),
    m = await openedMatch(time),
    a = m.game.active;
  time.advance(TURN_MS - 1);
  assert.equal(m.log.length, 2);
  time.advance(1);
  assert.equal(m.log.at(-1).by, a);
  assert.equal(m.log.at(-1).type, 'pass');
  assert.equal(m.log.at(-1).timeout, true);
  for (let i = 0; i < 40 && m.game.turn === 1; i++) time.advance(RESPONSE_MS);
  assert.equal(m.game.turn, 2);
  assert.ok(m.log.slice(2).every(e => e.timeout));
});

test('each response gets 20 s and does not use the active player’s turn clock', async () => {
  const time = fakeTime(),
    m = await openedMatch(time),
    a = m.game.active,
    b = 1 - a;
  time.advance(10_000);
  act(m, a, {type: 'pass'});
  assert.deepEqual(m.clockFor(b), {kind: 'response', owner: 0, left: RESPONSE_MS, paused: false});
  time.advance(RESPONSE_MS - 1);
  assert.equal(m.log.at(-1).timeout, false);
  act(m, b, {type: 'pass'});
  assert.deepEqual(m.clockFor(a), {kind: 'turn', owner: 0, left: TURN_MS - 10_000, paused: false});
  assert.equal(m.clockFor(b).owner, 1);
});

test('clocks pause while the guest is disconnected and resume with the time left', async () => {
  const time = fakeTime(),
    m = await openedMatch(time);
  time.advance(30_000);
  m.connect(false);
  assert.equal(m.clockFor(0).paused, true);
  time.advance(10 * 60_000);
  assert.equal(m.log.length, 2);
  m.connect(true);
  assert.equal(m.clockFor(0).left, TURN_MS - 30_000);
});

test('a restored match keeps the banked clock time', async () => {
  const time = fakeTime(),
    m = await openedMatch(time);
  time.advance(30_000);
  const r = Match.fromJSON(JSON.parse(JSON.stringify(m.toJSON())), time);
  m.stop();
  r.connect(true);
  assert.equal(r.clockFor(0).left, TURN_MS - 30_000);
});

test('the clock stops when the match ends', async () => {
  const time = fakeTime(),
    m = await openedMatch(time);
  m.submit(0, {type: 'concede'});
  assert.equal(m.timer, null);
  assert.deepEqual(m.clockFor(0), {kind: null, owner: null, left: null, paused: false});
});

test('default timers work where setTimeout must not be called as a method, as in browsers', async () => {
  const {setTimeout: realSet, clearTimeout: realClear} = globalThis;
  const strict = real =>
    function (...args) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return real(...args);
    };
  const saved = (
    await Match.create({hostFaction: 'blue', hostSecret: '0'.repeat(32), guestSecret: '1'.repeat(32), seedCommit: ''})
  ).toJSON();
  globalThis.setTimeout = strict(realSet);
  globalThis.clearTimeout = strict(realClear);
  let m;
  try {
    m = Match.fromJSON(saved); // Default options are read now, while the strict timers are installed.
    assert.doesNotThrow(() => {
      m.connect(true);
      m.pledge(0);
      m.pledge(1);
    });
    assert.ok(m.clock.running, 'the opening clock is running');
    assert.doesNotThrow(() => m.stop());
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
    try {
      m?.stop();
    } catch {
      realClear(m.timer);
    }
  }
});
