import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, put, resolveTop, table} from './helpers/rules.mjs';

const opposingUnit = {key: 't', zone: 'field', side: 'opponent', types: ['Unit']};
const trig = (id, on, steps, extra = {}) => ({id, kind: 'triggered', label: id, on, steps, ...extra});
const scout = {
  id: 'x-scout',
  type: 'Unit',
  cost: 1,
  power: 1,
  toughness: 1,
  abilities: [trig('e', 'enter', [{op: 'createToken', token: 'pt-backdoor'}])],
};
const cuff = {
  id: 'x-cuff',
  type: 'Unit',
  cost: 0,
  power: 1,
  toughness: 1,
  abilities: [trig('e', 'enter', [{op: 'tap', to: 't', lock: true}], {targets: [opposingUnit]})],
};
const canary = {
  id: 'x-canary',
  type: 'Unit',
  power: 0,
  toughness: 1,
  abilities: [trig('d', 'defeated', [{op: 'createToken', token: 'pt-indicator', n: 2}])],
};
const broker = {
  id: 'x-broker',
  type: 'Unit',
  power: 3,
  toughness: 2,
  abilities: [trig('r', 'youRetire', [{op: 'buff', to: 'self', power: 1}], {what: {types: ['Tool']}, once: true})],
};
const double = {
  id: 'x-double',
  type: 'Unit',
  power: 1,
  toughness: 1,
  abilities: [trig('a', 'enter', [{op: 'draw', n: 1}]), trig('b', 'enter', [{op: 'heal', n: 1}])],
};
const wipe = {id: 'x-wipe', type: 'Operation', cost: 0, steps: [{op: 'damageAll', amount: 5}]};
const validator = {
  id: 'x-validator',
  type: 'Control',
  abilities: [trig('v', 'opponentSecondCast', [{op: 'createToken', token: 'pt-indicator'}])],
};
const cheap = {id: 'x-cheap', type: 'Response', cost: 0, steps: [{op: 'heal', n: 1}]};
const raider = {
  id: 'x-raider',
  type: 'Unit',
  power: 2,
  toughness: 2,
  abilities: [trig('h', 'hitsOpponent', [{op: 'createToken', token: 'pt-backdoor'}], {once: true})],
};
const sentry = {
  id: 'x-sentry',
  type: 'Unit',
  power: 0,
  toughness: 5,
  abilities: [trig('b', 'block', [{op: 'createToken', token: 'pt-indicator'}])],
};
const command = {
  id: 'x-command',
  type: 'Control',
  abilities: [trig('end', 'yourEndStep', [{op: 'createToken', token: 'pt-backdoor'}])],
};
const ids = (g, p) => g.players[p].field.map(c => c.id);

test('an entry trigger goes on the stack when the unit enters, and resolves', t => {
  define(t, scout);
  const g = table();
  compute(g, 0, 1);
  g.play(0, put(g, 0, 'x-scout', 'hand').uid);
  resolveTop(g);
  assert.equal(g.stack.length, 1);
  assert.equal(g.stack[0].ability.id, 'e');
  assert.equal(g.priority, 0);
  resolveTop(g);
  assert.ok(ids(g, 0).includes('pt-backdoor'));
});

test('a trigger with no legal target is removed; one target is chosen for you; several ask', t => {
  define(t, cuff);
  const g = table();
  g.play(0, put(g, 0, 'x-cuff', 'hand').uid);
  resolveTop(g);
  assert.equal(g.stack.length, 0);
  const one = put(g, 1, 'b7');
  g.play(0, put(g, 0, 'x-cuff', 'hand').uid);
  resolveTop(g);
  assert.deepEqual(g.stack[0].opts.targets, {t: {kind: 'card', uid: one.uid}});
  resolveTop(g);
  assert.equal(one.tapped, true);
  assert.equal(one.locked, true);
  const two = put(g, 1, 'b8');
  g.play(0, put(g, 0, 'x-cuff', 'hand').uid);
  resolveTop(g);
  assert.equal(g.pending.kind, 'targets');
  assert.equal(g.actor(), 0);
  assert.throws(() => g.pass(0), /pending choice/);
  assert.throws(() => g.choose(1, {}), /no choice for you/);
  g.choose(0, {targets: {t: {kind: 'card', uid: two.uid}}});
  assert.equal(g.pending, null);
  assert.deepEqual(g.stack[0].opts.targets, {t: {kind: 'card', uid: two.uid}});
});

test('a defeated unit’s own trigger fires from the discard, and survives if the card moves on', t => {
  define(t, canary, wipe);
  const g = table();
  put(g, 0, 'x-canary');
  g.play(0, put(g, 0, 'x-wipe', 'hand').uid);
  resolveTop(g);
  assert.equal(g.stack.length, 1);
  g.archiveCard(
    0,
    g.players[0].grave.find(c => c.id === 'x-canary'),
  );
  resolveTop(g);
  assert.equal(ids(g, 0).filter(i => i === 'pt-indicator').length, 2);
});

test('the active player’s simultaneous triggers go on the stack first, so they resolve last', t => {
  define(t, canary, wipe);
  const g = table();
  put(g, 1, 'x-canary');
  put(g, 0, 'x-canary');
  g.play(0, put(g, 0, 'x-wipe', 'hand').uid);
  resolveTop(g);
  assert.deepEqual(
    g.stack.map(s => s.p),
    [0, 1],
  );
});

test('one player’s simultaneous triggers are put in the order they choose', t => {
  define(t, double);
  const g = table();
  g.play(0, put(g, 0, 'x-double', 'hand').uid);
  resolveTop(g);
  assert.equal(g.pending.kind, 'order');
  const [a, b] = g.pending.options;
  assert.throws(() => g.choose(0, {order: [a]}), /every ability/);
  g.choose(0, {order: [b, a]});
  assert.deepEqual(
    g.stack.map(s => s.ability.id),
    ['b', 'a'],
  );
});

test('once each turn counts per object and resets at the turn boundary', t => {
  define(t, broker);
  const g = table();
  compute(g, 0, 2);
  const u = put(g, 0, 'x-broker'),
    b1 = g.createToken(0, 'pt-backdoor'),
    b2 = g.createToken(0, 'pt-backdoor');
  g.activate(0, b1.uid, 'boost', {targets: {t: {kind: 'card', uid: u.uid}}});
  assert.equal(g.stack.length, 2, 'the boost and one retire trigger');
  resolveTop(g);
  resolveTop(g);
  g.activate(0, b2.uid, 'boost', {targets: {t: {kind: 'card', uid: u.uid}}});
  assert.equal(g.stack.length, 1, 'no second trigger this turn');
  resolveTop(g);
  assert.equal(g.stats(u, 0).power, 3 + 1 + 2 + 2);
  g.endTurn();
  assert.equal(Object.hasOwn(u, 'used'), false);
});

test('an opponent’s second cast in a turn triggers once', t => {
  define(t, validator, cheap);
  const g = table();
  put(g, 1, 'x-validator');
  g.play(0, put(g, 0, 'x-cheap', 'hand').uid);
  assert.equal(g.stack.length, 1);
  g.play(0, put(g, 0, 'x-cheap', 'hand').uid);
  assert.equal(g.stack.length, 3);
  assert.equal(g.stack[2].p, 1);
  g.play(0, put(g, 0, 'x-cheap', 'hand').uid);
  assert.equal(g.stack.length, 4);
});

test('combat damage, blocks and end steps trigger', t => {
  define(t, raider, sentry, command);
  const g = table();
  const r = put(g, 0, 'x-raider'),
    r2 = put(g, 0, 'x-raider');
  put(g, 0, 'x-command');
  const s = put(g, 1, 'x-sentry');
  g.phase = 'attack';
  g.attackers(0, [r.uid, r2.uid]);
  g.pass(0);
  g.pass(1);
  g.blockers(1, {[r2.uid]: [s.uid]});
  assert.equal(g.stack[0].ability.id, 'b');
  resolveTop(g);
  g.pass(0);
  g.pass(1); // combat damage
  assert.equal(g.players[1].life, 18);
  assert.equal(g.stack.length, 1, 'only the unblocked raider hit');
  resolveTop(g);
  assert.ok(ids(g, 1).includes('pt-indicator'));
  assert.equal(ids(g, 0).filter(i => i === 'pt-backdoor').length, 1);
  while (g.phase !== 'end') g.pass(g.priority);
  assert.equal(g.stack[0]?.ability.id, 'end');
});

test('expansion state stays out of First Breach saves between actions', () => {
  const g = table();
  compute(g, 0, 1);
  g.play(0, put(g, 0, 'r1', 'hand').uid);
  const json = g.toJSON();
  for (const k of ['queue', 'waiting', 'pending', 'casts']) assert.equal(Object.hasOwn(json, k), false, k);
});
