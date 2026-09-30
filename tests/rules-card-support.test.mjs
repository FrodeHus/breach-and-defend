import test from 'node:test';
import assert from 'node:assert/strict';
import {compute, define, fight, put, resolveTop, table} from './helpers/rules.mjs';

const ref = uid => ({kind: 'card', uid});
const yours = {key: 't', zone: 'grave', side: 'you', types: ['Unit']};

test('recover returns a discard card to hand or to the battlefield as a new object', t => {
  define(
    t,
    {id: 'x-raise', type: 'Operation', cost: 0, targets: [yours], steps: [{op: 'recover', to: 't', zone: 'hand'}]},
    {
      id: 'x-revive',
      type: 'Operation',
      cost: 0,
      targets: [yours],
      steps: [{op: 'recover', to: 't', zone: 'field', tapped: true}],
    },
  );
  const g = table();
  const a = put(g, 0, 'r7', 'grave'),
    b = put(g, 0, 'r8', 'grave'),
    oldA = a.uid,
    oldB = b.uid;
  Object.assign(b, {damage: 3, kw: ['overflow']});
  g.play(0, put(g, 0, 'x-raise', 'hand').uid, null, {targets: {t: ref(a.uid)}});
  resolveTop(g);
  assert.ok(g.players[0].hand.some(c => c.id === 'r7' && c.uid !== oldA));
  g.play(0, put(g, 0, 'x-revive', 'hand').uid, null, {targets: {t: ref(b.uid)}});
  resolveTop(g);
  const back = g.players[0].field.find(c => c.id === 'r8');
  assert.notEqual(back.uid, oldB);
  assert.deepEqual([back.tapped, back.sick, back.damage, Object.hasOwn(back, 'kw')], [true, true, 0, false]);
});

test('tapAll taps and can lock every opposing unit, and nothing of yours', t => {
  define(t, {id: 'x-freeze', type: 'Operation', cost: 0, steps: [{op: 'tapAll', side: 'opponent', lock: true}]});
  const g = table();
  const mine = put(g, 0, 'r7'),
    a = put(g, 1, 'b1'),
    b = put(g, 1, 'b8'),
    tool = put(g, 1, 'b22');
  g.play(0, put(g, 0, 'x-freeze', 'hand').uid);
  resolveTop(g);
  assert.deepEqual([a.tapped, a.locked, b.tapped, b.locked], [true, true, true, true]);
  assert.equal(mine.tapped, false);
  assert.equal(tool.tapped, false, 'only units');
});

test('damage can be larger against a tapped target', t => {
  define(t, {
    id: 'x-handoff',
    type: 'Response',
    cost: 0,
    targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit']}],
    steps: [{op: 'damage', to: 't', amount: 2, tappedAmount: 4}],
  });
  const g = table();
  const ready = put(g, 1, 'b7'),
    busy = put(g, 1, 'b7');
  busy.tapped = true;
  for (const u of [ready, busy]) {
    g.play(0, put(g, 0, 'x-handoff', 'hand').uid, null, {targets: {t: ref(u.uid)}});
    resolveTop(g);
  }
  assert.deepEqual([ready.damage, busy.damage], [2, 4]);
});

test('an end-step trigger can require having attacked with at least two units', t => {
  define(t, {
    id: 'x-regroup',
    type: 'Control',
    abilities: [
      {
        id: 'r',
        kind: 'triggered',
        label: 'Regroup',
        on: 'yourEndStep',
        if: {attackedWith: 2},
        steps: [{op: 'createToken', token: 'pt-backdoor'}],
      },
    ],
  });
  for (const n of [1, 2]) {
    const g = table();
    put(g, 0, 'x-regroup');
    const units = [put(g, 0, 'r7'), put(g, 0, 'r7')].slice(0, n);
    fight(
      g,
      units.map(u => u.uid),
    );
    while (g.phase !== 'end') g.pass(g.priority);
    assert.equal(g.stack.length, n === 2 ? 1 : 0, `${n} attackers`);
  }
});

test('an unknown condition is a card-data error, not a silent false', t => {
  define(t, {id: 'x-odd', type: 'Unit', power: 1, toughness: 1, when: [{keyword: 'rapid', if: {nope: 1}}]});
  const g = table();
  const u = put(g, 0, 'x-odd');
  assert.throws(() => g.has(u, 'rapid'), /Unknown condition/);
});

test('an archive target can be required to come from the discard of another target’s controller', t => {
  define(t, {
    id: 'x-chain',
    type: 'Response',
    cost: 0,
    targets: [
      {key: 't', zone: 'field', side: 'any', types: ['Tool', 'Control']},
      {key: 'g', zone: 'grave', side: 'any', upTo: 2, sameOwnerAs: 't'},
    ],
    steps: [
      {op: 'destroy', to: 't'},
      {op: 'archive', to: 'g'},
    ],
  });
  const g = table();
  const tool = put(g, 1, 'b22'),
    theirs = put(g, 1, 'b7', 'grave'),
    mine = put(g, 0, 'r7', 'grave');
  const c = put(g, 0, 'x-chain', 'hand');
  assert.throws(
    () => g.play(0, c.uid, null, {targets: {t: ref(tool.uid), g: [ref(mine.uid)]}}),
    /controller’s discard/,
  );
  g.play(0, c.uid, null, {targets: {t: ref(tool.uid), g: [ref(theirs.uid)]}});
  resolveTop(g);
  assert.ok(g.players[1].archive.some(x => x.uid === theirs.uid));
});

test('only rule cards can be cast with Reuse', t => {
  define(t, {id: 'x-old', type: 'Operation', cost: 0, reuse: 1, effect: 'draw', amount: 1});
  const g = table();
  compute(g, 0, 1);
  const c = put(g, 0, 'x-old', 'grave');
  assert.deepEqual(
    g.playIssues(0, c, {reuse: true}).map(i => i.code),
    ['reuse'],
  );
});

test('a card castable only with Overclock is castable when Overclock is affordable', t => {
  define(t, {
    id: 'x-scoped',
    type: 'Operation',
    cost: 3,
    targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit'], maxCost: 3}],
    steps: [{op: 'destroy', to: 't'}],
    overclock: {
      cost: 2,
      instead: true,
      targets: [{key: 't', zone: 'field', side: 'opponent', types: ['Unit']}],
      steps: [{op: 'destroy', to: 't'}],
    },
  });
  const g = table();
  put(g, 1, 'r11'); // Ransomware Engine, cost 5
  const c = put(g, 0, 'x-scoped', 'hand');
  compute(g, 0, 3);
  assert.deepEqual(
    g.playIssues(0, c).map(i => i.code),
    ['target'],
  );
  compute(g, 0, 2);
  assert.deepEqual(g.playIssues(0, c), []);
});

test('a once-per-turn trigger firing from the discard leaves no mark on the card', t => {
  define(t, {
    id: 'x-last',
    type: 'Unit',
    power: 1,
    toughness: 1,
    abilities: [{id: 'd', kind: 'triggered', label: 'Last', on: 'defeated', once: true, steps: [{op: 'heal', n: 1}]}],
  });
  const g = table();
  const u = put(g, 0, 'x-last');
  u.damage = 1;
  g.settle();
  assert.equal(g.stack.length, 1);
  assert.equal(Object.hasOwn(u, 'used'), false);
});
