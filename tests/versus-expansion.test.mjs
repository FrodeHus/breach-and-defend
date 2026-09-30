import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS, EXPANSION_POOL} from '../public/cards.mjs';
import {
  actionFields,
  applyAction,
  choiceCommit,
  flip,
  hostChoices,
  playOptions,
  redactEntry,
  restoreChoices,
  sanitizeView,
  timeoutAction,
  viewFor,
} from '../public/protocol.mjs';
import {Seat} from '../public/remote.mjs';
import {aiMatch} from './helpers/simulate.mjs';
import {openedMatch} from './helpers/versus.mjs';
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

test('the match logs a guest play with only the option fields the engine reads', async () => {
  const m = await openedMatch(),
    g = m.game;
  Object.assign(g, {phase: 'main1', active: 1, priority: 1});
  compute(g, 1, 8);
  const foe = put(g, 0, 'b8');
  const c = put(g, 1, pt('Coordinated Pressure'), 'hand');
  const r = m.submit(
    1,
    {type: 'play', uid: c.uid, target: null, options: {overclock: true, junk: 'x', targets: {t: ref(foe.uid)}}},
    5000,
  );
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.entry.options, {overclock: true, targets: {t: ref(foe.uid)}});
  assert.equal(g.stack.at(-1).opts.overclock, true);
});

test('a First Breach play still logs exactly its own fields', async () => {
  const m = await openedMatch(),
    g = m.game;
  Object.assign(g, {phase: 'main1', active: 1, priority: 1});
  const c = put(g, 1, pt('Map Trust Relationships'), 'hand');
  compute(g, 1, 1);
  const r = m.submit(1, {type: 'play', uid: c.uid, target: null}, 5001);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(Object.keys(r.entry).sort(), ['by', 'n', 'seq', 'target', 'timeout', 'type', 'uid']);
});

// Every uid a player may not know: the other player's hand, both decks, minus what their own Probe shows them.
function hiddenUids(g, p) {
  const out = new Set();
  for (const q of g.players) for (const c of q.deck) out.add(c.uid);
  for (const c of g.players[1 - p].hand) out.add(c.uid);
  if (g.pending?.kind === 'probe' && g.pending.actor === p) for (const u of g.pending.options) out.delete(u);
  return out;
}
// Every uid a view reveals: any `uid` field, and the numbers in a pending choice's options.
function shownUids(v) {
  const out = [];
  const walk = x => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    for (const [k, val] of Object.entries(x)) {
      if (k === 'uid' && Number.isInteger(val)) out.push(val);
      else walk(val);
    }
  };
  walk(v);
  for (const o of v.pending?.options ?? []) if (Number.isInteger(o)) out.push(o);
  return out;
}
const everyView = (check, games = 4) => {
  for (let seed = 1; seed <= games; seed++)
    aiMatch(seed, {
      faction: seed % 2 ? 'red' : 'blue',
      first: seed & 1,
      pool: EXPANSION_POOL,
      mode: 'versus',
      every: 1,
      check: g => {
        for (const p of [0, 1]) check(g, p, viewFor(g, p));
      },
    });
};

test('views of expansion matches never reveal a hidden card', () => {
  let privateSeen = 0;
  everyView((g, p, v) => {
    if (p === 0 && g.pending?.private) privateSeen++;
    const hidden = hiddenUids(g, p);
    for (const u of shownUids(v)) assert.ok(!hidden.has(u), `view for ${p} reveals hidden uid ${u}`);
  });
  assert.ok(privateSeen > 0, 'the sweep must sample at least one private pending choice');
});

test('a view flips pending, waiting and stack entries for the second player, and flipping twice restores it', () => {
  everyView((g, p, v) => {
    const m = x => (p ? 1 - x : x);
    if (g.pending) {
      assert.equal(v.pending.actor, m(g.pending.actor));
      if (g.pending.frame) assert.equal(v.pending.resolving?.p, m(g.pending.frame.entry?.p));
    }
    (g.waiting ?? []).forEach((w, i) => assert.equal(v.waiting[i].p, m(w.p)));
    g.stack.forEach((e, i) => assert.equal(v.stack[i].p, m(e.p)));
    assert.deepEqual(flip(flip(v)), v);
  });
});

test('a private choice shows its chooser the cards and the other player only a count', () => {
  const g = table();
  compute(g, 0, 1);
  applyAction(g, 0, {type: 'play', uid: put(g, 0, pt('Map Trust Relationships'), 'hand').uid, target: null});
  resolveTop(g);
  const mine = viewFor(g, 0).pending,
    theirs = viewFor(g, 1).pending;
  assert.deepEqual(
    mine.cards.map(c => c.uid),
    g.pending.options,
  );
  assert.equal(
    mine.cards.every(c => typeof c.id === 'string'),
    true,
  );
  assert.deepEqual([theirs.options, theirs.count, theirs.actor], [[], 2, 1]);
  assert.equal(Object.hasOwn(theirs, 'cards'), false);
  for (const v of [mine, theirs]) {
    assert.equal(Object.hasOwn(v, 'frame'), false);
    assert.equal(v.resolving.card.id, pt('Map Trust Relationships'));
  }
  assert.equal(Object.hasOwn(viewFor(g, 0), 'queue'), false);
});

test('every view of complete expansion matches passes the guest’s check', () => {
  everyView((g, p, v) => assert.doesNotThrow(() => sanitizeView(v), `turn ${g.turn} view for ${p}`));
});

test('a host view with a malformed expansion shape is rejected', () => {
  const g = table();
  g.mode = 'versus';
  compute(g, 0, 1);
  applyAction(g, 0, {type: 'play', uid: put(g, 0, pt('Map Trust Relationships'), 'hand').uid, target: null});
  resolveTop(g);
  g.createToken(0, 'pt-backdoor');
  const good = viewFor(g, 1);
  assert.doesNotThrow(() => sanitizeView(good));
  const bad = [
    v => (v.pending.kind = 'steal'),
    v => (v.pending.prompt = '<img src=x>'),
    v => (v.pending.options = Array(100).fill(1)),
    v => (v.pending.extra = 1),
    v => (v.pending.count = -1),
    v => (v.pending.resolving.card.id = 'nope'),
    v => (v.pending.resolving.opts.overclock = 'yes'),
    v => (v.pending.resolving.opts.targets = {'<b>': {kind: 'card', uid: 1}}),
    v => (v.waiting = [{id: 1, p: 0, ability: {card: 'pt-backdoor', uid: 1, id: 'nope'}}]),
    v => (v.players[0].archive = [{hidden: true}]),
    v => (v.players[1].field.find(c => c.id === 'pt-backdoor').kw = ['flying']),
    v => (v.players[1].field.find(c => c.id === 'pt-backdoor').locked = false),
    v => v.stack.push({ability: {card: 'r1', uid: 1, id: 'x'}, opts: {targets: {}}, p: 0, target: null}),
    v => (v.queue = []),
  ];
  for (const [i, mutate] of bad.entries()) {
    const v = structuredClone(good);
    mutate(v);
    assert.throws(() => sanitizeView(v), /Invalid/, `mutation ${i}`);
  }
});

test('the host’s Probe answers are redacted in the guest’s log, then restored from the reveal', async () => {
  const log = [
    {type: 'pass', n: 1, by: 0, seq: null, timeout: false},
    {type: 'choose', selection: {discard: [], order: [9, 8]}, n: 2, by: 0, seq: null, timeout: false, secret: true},
    {type: 'choose', selection: {discard: [7], order: []}, n: 3, by: 1, seq: 4, timeout: false, secret: true},
    {type: 'choose', selection: {pay: true}, n: 4, by: 0, seq: null, timeout: false},
  ];
  const received = log.map(redactEntry);
  assert.equal(Object.hasOwn(received[1], 'selection'), false);
  assert.deepEqual(received[2], log[2], 'the guest’s own answers are not redacted');
  assert.deepEqual(received[3], log[3], 'only Probe answers are secret');
  assert.deepEqual(hostChoices(log), {2: {discard: [], order: [9, 8]}});
  assert.deepEqual(restoreChoices(received, hostChoices(log)), log);
  assert.equal(restoreChoices(received, {}), null);
  assert.equal(restoreChoices(received, {2: 'x'}), null);
  const a = await choiceCommit('s', 2, {discard: [], order: [9, 8]}),
    b = await choiceCommit('s', 2, {discard: [], order: [8, 9]});
  assert.notEqual(a, b);
});
