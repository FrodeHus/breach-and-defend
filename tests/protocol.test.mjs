import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.mjs';
import {CARDS, BY_ID} from '../dist/cards.mjs';
import {viewFor, flip, flipTarget, unflipAction, applyAction, timeoutAction, canonical, digest, versusGame, seedHex, sha256Hex, randomHex, actionFields} from '../dist/protocol.mjs';

const SEED = 'ab'.repeat(32);
const opened = () => { const g = versusGame(SEED, 'blue'); g.keep([], 0); g.keep([], 1); return g; };
const uidsIn = value => {
  const found = new Set();
  JSON.stringify(value, (key, x) => { if (key === 'uid' && typeof x === 'number') found.add(x); return x; });
  return found;
};

test('versusGame is deterministic and takes the first player from the seed', () => {
  assert.deepEqual(versusGame(SEED, 'blue').toJSON(), versusGame(SEED, 'blue').toJSON());
  assert.equal(versusGame(SEED, 'blue').first, 0xab & 1);
  assert.equal(versusGame(SEED, 'blue').mode, 'versus');
  assert.notDeepEqual(versusGame('cd'.repeat(32), 'blue').players[0].hand, versusGame(SEED, 'blue').players[0].hand);
});

test('hash and seed helpers', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const seed = await seedHex('11', '22');
  assert.match(seed, /^[0-9a-f]{64}$/);
  assert.notEqual(seed, await seedHex('11', '23'));
  assert.match(randomHex(), /^[0-9a-f]{32}$/);
});

test('a guest view hides the host hand and both decks, and puts the guest at index 0', () => {
  const g = opened(), v = viewFor(g, 1);
  assert.equal(v.players[0].faction, 'red');
  assert.equal(v.players[1].faction, 'blue');
  assert.deepEqual(v.players[0].hand, g.players[1].hand);
  assert.equal(v.players[1].hand.length, g.players[0].hand.length);
  assert.ok(v.players[1].hand.every(c => canonical(c) === '{"hidden":true}'));
  assert.ok(v.players.every((q, i) => q.deck.length === g.players[1 - i].deck.length && q.deck.every(c => c.hidden)));
  assert.equal('rng' in v, false);
  const seen = uidsIn(v);
  for (const c of [...g.players[0].hand, ...g.players[0].deck, ...g.players[1].deck]) assert.equal(seen.has(c.uid), false);
});

test('a card returned to the host hand stays hidden under its new uid', () => {
  const g = opened();
  const unit = g.card(CARDS.find(c => c.faction === 'blue' && c.type === 'Unit').id);
  g.players[0].field.push(unit);
  assert.ok(uidsIn(viewFor(g, 1)).has(unit.uid));
  g.players[0].field = [];
  unit.uid = ++g.uid;
  g.players[0].hand.push(unit);
  assert.equal(uidsIn(viewFor(g, 1)).has(unit.uid), false);
});

test('the host view is redacted but not flipped; flip is its own inverse', () => {
  const g = opened();
  g.stack.push({card: g.card('r2'), p: 1, target: {kind: 'player', p: 0}});
  const v0 = viewFor(g, 0), v1 = viewFor(g, 1);
  assert.equal(v0.players[0].faction, 'blue');
  assert.ok(v0.players[1].hand.every(c => c.hidden));
  assert.equal(v1.stack[0].p, 0);
  assert.deepEqual(v1.stack[0].target, {kind: 'player', p: 1});
  assert.equal(v1.active, 1 - g.active);
  assert.equal(v1.first, 1 - g.first);
  assert.deepEqual(v1.kept, [...g.kept].reverse());
  assert.deepEqual(flip(flip(v1)), v1);
  assert.deepEqual(flipTarget({kind: 'card', uid: 5}), {kind: 'card', uid: 5});
});

test('a view rebuilds into a Game that answers the interface queries', () => {
  const g = opened(), local = Game.fromJSON(viewFor(g, 1));
  assert.equal(local.actor(), g.actor() === 1 ? 0 : 1);
  for (const c of local.players[0].hand) {
    const real = g.players[1].hand.find(x => x.uid === c.uid);
    assert.deepEqual(local.playIssues(0, c), g.playIssues(1, real));
  }
});

test('viewFor sets uid to 0 (sentinel for minting new cards)', () => {
  const g = opened(), v = viewFor(g, 1);
  assert.equal(v.uid, 0);
  assert.equal(Game.fromJSON(v).uid, 0);
});

test('guest targets translate back to host indices', () => {
  assert.deepEqual(unflipAction({type: 'play', uid: 4, target: {kind: 'player', p: 1}}), {type: 'play', uid: 4, target: {kind: 'player', p: 0}});
  assert.deepEqual(unflipAction({type: 'pass'}), {type: 'pass'});
  assert.deepEqual(actionFields({type: 'pass', n: 3, by: 1, seq: 9}), {type: 'pass'});
});

test('applyAction enforces turn order and rejects unknown players and actions', () => {
  const g = versusGame(SEED, 'blue');
  applyAction(g, 1, {type: 'keep', bottom: []});
  applyAction(g, 0, {type: 'keep'});
  const a = g.actor(), b = 1 - a;
  assert.throws(() => applyAction(g, b, {type: 'pass'}), /Wait for your turn/);
  assert.throws(() => applyAction(g, a, {type: 'hack'}), /Unknown action/);
  assert.throws(() => applyAction(g, 2, {type: 'pass'}), /Unknown player/);
  applyAction(g, a, {type: 'pass'});
  assert.equal(g.actor(), b);
});

test('timeouts keep, skip attacks and blocks, discard the costliest cards, or pass', () => {
  const g = versusGame(SEED, 'blue');
  g.mulligan(0);
  const keep = timeoutAction(g, 0);
  assert.equal(keep.type, 'keep');
  assert.equal(keep.bottom.length, 1);
  assert.equal(BY_ID[g.find(keep.bottom[0]).card.id].cost, Math.max(...g.players[0].hand.map(c => BY_ID[c.id].cost)));
  applyAction(g, 0, keep);
  applyAction(g, 1, timeoutAction(g, 1));
  assert.equal(g.phase, 'upkeep');
  assert.deepEqual(timeoutAction(g, g.actor()), {type: 'pass'});
  g.phase = 'attack';
  assert.deepEqual(timeoutAction(g, g.active), {type: 'attackers', uids: []});
  g.phase = 'block';
  assert.deepEqual(timeoutAction(g, 1 - g.active), {type: 'blockers', assignments: {}});
  g.phase = 'cleanup';
  const q = g.players[g.active], top = CARDS.filter(c => c.faction === q.faction).sort((x, y) => y.cost - x.cost)[0];
  while (q.hand.length < 9) q.hand.push(g.card(top.id));
  const discard = timeoutAction(g, g.active);
  assert.equal(discard.uids.length, 2);
  assert.ok(discard.uids.every(uid => BY_ID[g.find(uid).card.id].cost === top.cost));
});

test('canonical JSON ignores key order; digests pinpoint the changed section', async () => {
  assert.equal(canonical({b: 1, a: [2, {d: 3, c: undefined}]}), '{"a":[2,{"d":3}],"b":1}');
  const v = viewFor(opened(), 1), d = await digest(v);
  const changed = structuredClone(v);
  changed.players[1].life += 1;
  const e = await digest(changed);
  assert.notEqual(e.all, d.all);
  assert.equal(e.you, d.you);
  assert.notEqual(e.foe, d.foe);
  assert.equal(e.table, d.table);
});
