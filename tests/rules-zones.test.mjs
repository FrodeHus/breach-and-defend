import test from 'node:test';
import assert from 'node:assert/strict';
import {BY_ID, CARDS, SETS, TOKENS} from '../public/cards.mjs';
import {Game} from '../public/engine.mjs';
import {put, table} from './helpers/rules.mjs';

test('the two tokens are Tools of the unreleased Persistent Threats set, and never deck cards', () => {
  assert.deepEqual(SETS['persistent-threats'], {name: 'Persistent Threats', code: 'PT1', released: false});
  for (const t of Object.values(TOKENS)) {
    assert.equal(BY_ID[t.id], t);
    assert.equal(t.type, 'Tool');
    assert.equal(t.cost, 0);
    assert.equal(t.token, true);
    assert.equal(t.set, 'persistent-threats');
    assert.ok(!CARDS.includes(t));
  }
  assert.deepEqual(
    Object.values(TOKENS).map(t => t.id),
    ['pt-backdoor', 'pt-indicator'],
  );
});

test('a created token is a battlefield object that vanishes when it leaves', () => {
  const g = table();
  const a = g.createToken(0, 'pt-backdoor'),
    b = g.createToken(0, 'pt-backdoor'),
    c = g.createToken(1, 'pt-indicator');
  assert.notEqual(a.uid, b.uid);
  assert.deepEqual(
    g.players[0].field.map(x => x.id),
    ['pt-backdoor', 'pt-backdoor'],
  );
  g.remove(0, a);
  g.bounce(0, b);
  g.retire(1, c);
  for (const q of g.players) {
    assert.equal(q.field.length, 0);
    assert.equal(q.hand.length, 0);
    assert.equal(q.grave.length, 0);
  }
});

test('retiring moves a card to its owner’s discard; archiving takes it out of the discard for good', () => {
  const g = table();
  const u = put(g, 0, 'r7');
  g.retire(0, u);
  assert.deepEqual(
    g.players[0].grave.map(x => x.uid),
    [u.uid],
  );
  g.archiveCard(0, u);
  assert.equal(g.players[0].grave.length, 0);
  assert.deepEqual(
    g.players[0].archive.map(x => x.uid),
    [u.uid],
  );
});

test('returning to hand makes a new object and clears everything that happened on the battlefield', () => {
  const g = table();
  const u = put(g, 0, 'r7'),
    old = u.uid;
  Object.assign(u, {tapped: true, damage: 2, bp: 1, kw: ['overflow'], locked: true, used: ['x']});
  g.bounce(0, u);
  const back = g.players[0].hand[0];
  assert.notEqual(back.uid, old);
  assert.deepEqual(back, {id: 'r7', uid: back.uid, tapped: false, sick: true, damage: 0, bp: 0, bt: 0});
});

test('expansion state is saved only when it is not empty', () => {
  const g = table();
  const json = g.toJSON();
  for (const k of ['pending', 'queue', 'waiting', 'casts']) assert.equal(Object.hasOwn(json, k), false, k);
  assert.equal(Object.hasOwn(json.players[0], 'archive'), false);
  const back = Game.fromJSON(json);
  assert.deepEqual(back.players[0].archive, []);
  assert.deepEqual([back.pending, back.queue, back.waiting, back.casts], [null, [], [], [0, 0]]);
  const u = put(g, 0, 'r7', 'grave');
  g.archiveCard(0, u);
  assert.deepEqual(
    Game.fromJSON(g.toJSON()).players[0].archive.map(x => x.uid),
    [u.uid],
  );
});

test('effect fields never survive a move to discard, the archive, or back from discard', () => {
  const stale = {kw: ['overflow'], locked: true, used: ['x']};
  const has = c => ['kw', 'locked', 'used'].some(k => Object.hasOwn(c, k));
  const g = table();
  const a = put(g, 0, 'r7');
  Object.assign(a, structuredClone(stale));
  g.remove(0, a);
  assert.equal(has(a), false);
  Object.assign(a, structuredClone(stale));
  g.archiveCard(0, a);
  assert.equal(has(a), false);
  const b = put(g, 0, 'r7');
  Object.assign(b, structuredClone(stale));
  g.retire(0, b);
  assert.equal(has(b), false);
  Object.assign(b, structuredClone(stale));
  const r = g.card(CARDS.find(c => c.name === 'Rebuild Foothold').id);
  g.stack.push({p: 0, card: r, target: {kind: 'card', uid: b.uid}});
  g.resolve();
  const back = g.players[0].hand[0];
  assert.ok(back, 'recovered to hand');
  assert.equal(has(back), false);
});
