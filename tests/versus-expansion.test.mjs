import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {actionFields, applyAction, playOptions, timeoutAction} from '../public/protocol.mjs';
import {Seat} from '../public/remote.mjs';
import {compute, put, resolveTop, table} from './helpers/rules.mjs';

const pt = name => CARDS.find(c => c.name === name).id;
const ref = uid => ({kind: 'card', uid});

test('action fields keep options, ability ids and selections, and nothing else', () => {
  assert.deepEqual(actionFields({type: 'play', uid: 3, target: null, options: {overclock: true}, junk: 1}), {
    type: 'play',
    uid: 3,
    target: null,
    options: {overclock: true},
  });
  assert.deepEqual(actionFields({type: 'activate', uid: 3, abilityId: 'boost', options: {}}), {
    type: 'activate',
    uid: 3,
    abilityId: 'boost',
    options: {},
  });
  assert.deepEqual(actionFields({type: 'choose', selection: {pay: false}}), {type: 'choose', selection: {pay: false}});
  assert.deepEqual(actionFields({type: 'play', uid: 3, target: null}), {type: 'play', uid: 3, target: null});
});

test('play options from a peer keep only the fields the engine reads', () => {
  assert.deepEqual(playOptions(undefined), {});
  assert.deepEqual(playOptions([1]), {});
  assert.deepEqual(playOptions({overclock: 'yes', reuse: 1, extra: true}), {});
  assert.deepEqual(playOptions({overclock: true, reuse: true, mode: 1, targets: {t: ref(4)}, costUids: [5]}), {
    overclock: true,
    reuse: true,
    mode: 1,
    targets: {t: ref(4)},
    costUids: [5],
  });
});

test('applyAction plays with options, activates abilities and answers choices', () => {
  const g = table();
  compute(g, 0, 8);
  const foe = put(g, 1, 'b8');
  const c = put(g, 0, pt('Coordinated Pressure'), 'hand');
  applyAction(g, 0, {type: 'play', uid: c.uid, target: null, options: {overclock: true, targets: {t: ref(foe.uid)}}});
  assert.equal(g.stack[0].opts.overclock, true);
  resolveTop(g);
  const u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  applyAction(g, 0, {type: 'activate', uid: b.uid, abilityId: 'boost', options: {targets: {t: ref(u.uid)}}});
  assert.equal(g.stack[0].ability.id, 'boost');
  resolveTop(g);
  applyAction(g, 0, {type: 'play', uid: put(g, 0, pt('Map Trust Relationships'), 'hand').uid, target: null});
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
  assert.throws(() => applyAction(g, 1, {type: 'choose', selection: {discard: [], order: g.pending.options}}), /turn/);
  applyAction(g, 0, {type: 'choose', selection: {discard: [], order: g.pending.options}});
  assert.equal(g.pending, null);
});

test('malformed options from a peer are rejected by the engine and change nothing', () => {
  const g = table();
  compute(g, 0, 6);
  const c = put(g, 0, pt('Coordinated Pressure'), 'hand');
  const before = JSON.stringify(g.toJSON());
  for (const options of [
    {targets: 'x'},
    {targets: {t: 7}},
    {targets: {__proto__: {t: 1}}},
    {mode: 'constructor'},
    {costUids: 'all'},
  ])
    assert.throws(() => applyAction(g, 0, {type: 'play', uid: c.uid, target: null, options}));
  assert.throws(() => applyAction(g, 0, {type: 'activate', uid: 999, abilityId: 'boost', options: []}));
  assert.throws(() => applyAction(g, 0, {type: 'choose', selection: null}));
  assert.equal(JSON.stringify(g.toJSON()), before);
});

test('a timeout answers a pending choice with its fixed automatic move', () => {
  const g = table();
  compute(g, 0, 1);
  applyAction(g, 0, {type: 'play', uid: put(g, 0, pt('Map Trust Relationships'), 'hand').uid, target: null});
  resolveTop(g);
  const t = timeoutAction(g, 0);
  assert.deepEqual(t, {type: 'choose', selection: g.defaultChoice()});
  applyAction(g, 0, t);
  assert.equal(g.pending, null);
});

test('a seat sends expansion moves as intents', () => {
  const sent = [];
  const seat = new Seat(a => sent.push(a));
  seat.update({view: table().toJSON()});
  seat.game.play(0, 5, null, {overclock: true});
  seat.game.play(0, 6);
  seat.game.activate(0, 7, 'boost', {targets: {t: ref(8)}});
  seat.game.choose(0, {pay: true});
  assert.deepEqual(sent, [
    {type: 'play', uid: 5, target: null, options: {overclock: true}},
    {type: 'play', uid: 6, target: null},
    {type: 'activate', uid: 7, abilityId: 'boost', options: {targets: {t: ref(8)}}},
    {type: 'choose', selection: {pay: true}},
  ]);
});
