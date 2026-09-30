import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {CARDS, BY_ID, POOLS} from '../public/cards.mjs';
import {
  viewFor,
  flip,
  flipTarget,
  unflipAction,
  applyAction,
  timeoutAction,
  canonical,
  digest,
  versusGame,
  seedHex,
  sha256Hex,
  randomHex,
  actionFields,
  sanitizeView,
  redactEntry,
  hostBottoms,
  restoreBottoms,
} from '../public/protocol.mjs';

const SEED = 'ab'.repeat(32);
const opened = () => {
  const g = versusGame(SEED, 'blue');
  g.keep([], 0);
  g.keep([], 1);
  return g;
};
const uidsIn = value => {
  const found = new Set();
  JSON.stringify(value, (key, x) => {
    if (key === 'uid' && typeof x === 'number') found.add(x);
    return x;
  });
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
  const g = opened(),
    v = viewFor(g, 1);
  assert.equal(v.players[0].faction, 'red');
  assert.equal(v.players[1].faction, 'blue');
  assert.deepEqual(v.players[0].hand, g.players[1].hand);
  assert.equal(v.players[1].hand.length, g.players[0].hand.length);
  assert.ok(v.players[1].hand.every(c => canonical(c) === '{"hidden":true}'));
  assert.ok(v.players.every((q, i) => q.deck.length === g.players[1 - i].deck.length && q.deck.every(c => c.hidden)));
  assert.equal('rng' in v, false);
  const seen = uidsIn(v);
  for (const c of [...g.players[0].hand, ...g.players[0].deck, ...g.players[1].deck])
    assert.equal(seen.has(c.uid), false);
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
  const v0 = viewFor(g, 0),
    v1 = viewFor(g, 1);
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
  const g = opened(),
    local = Game.fromJSON(viewFor(g, 1));
  assert.equal(local.actor(), g.actor() === 1 ? 0 : 1);
  for (const c of local.players[0].hand) {
    const real = g.players[1].hand.find(x => x.uid === c.uid);
    assert.deepEqual(local.playIssues(0, c), g.playIssues(1, real));
  }
});

test('viewFor sets uid to 0 (sentinel for minting new cards)', () => {
  const g = opened(),
    v = viewFor(g, 1);
  assert.equal(v.uid, 0);
  assert.equal(Game.fromJSON(v).uid, 0);
});

test('guest targets translate back to host indices', () => {
  assert.deepEqual(unflipAction({type: 'play', uid: 4, target: {kind: 'player', p: 1}}), {
    type: 'play',
    uid: 4,
    target: {kind: 'player', p: 0},
  });
  assert.deepEqual(unflipAction({type: 'pass'}), {type: 'pass'});
  assert.deepEqual(actionFields({type: 'pass', n: 3, by: 1, seq: 9}), {type: 'pass'});
});

test('applyAction enforces turn order and rejects unknown players and actions', () => {
  const g = versusGame(SEED, 'blue');
  applyAction(g, 1, {type: 'keep', bottom: []});
  applyAction(g, 0, {type: 'keep'});
  const a = g.actor(),
    b = 1 - a;
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
  const q = g.players[g.active],
    top = CARDS.filter(c => c.faction === q.faction).sort((x, y) => y.cost - x.cost)[0];
  while (q.hand.length < 9) q.hand.push(g.card(top.id));
  const discard = timeoutAction(g, g.active);
  assert.equal(discard.uids.length, 2);
  assert.ok(discard.uids.every(uid => BY_ID[g.find(uid).card.id].cost === top.cost));
});

test('canonical JSON ignores key order; digests pinpoint the changed section', async () => {
  assert.equal(canonical({b: 1, a: [2, {d: 3, c: undefined}]}), '{"a":[2,{"d":3}],"b":1}');
  const v = viewFor(opened(), 1),
    d = await digest(v);
  const changed = structuredClone(v);
  changed.players[1].life += 1;
  const e = await digest(changed);
  assert.notEqual(e.all, d.all);
  assert.equal(e.you, d.you);
  assert.notEqual(e.foe, d.foe);
  assert.equal(e.table, d.table);
});

// Plays whole matches through the referee, returning every view each player was sent.
async function views(games = 6) {
  const {Match} = await import('../public/match.mjs');
  const {choose} = await import('./helpers/policy.mjs');
  const {fakeTime} = await import('./helpers/versus.mjs');
  const out = [];
  for (let g = 0; g < games; g++) {
    const m = await Match.create(
      {
        hostFaction: g % 2 ? 'red' : 'blue',
        hostSecret: (g + 1).toString(16).padStart(32, '0'),
        guestSecret: 'b'.repeat(32),
        seedCommit: '',
      },
      fakeTime(),
    );
    m.connect(true);
    m.pledge(0);
    m.pledge(1);
    if (g % 2) {
      m.submit(0, {type: 'mulligan'});
      m.submit(1, {type: 'mulligan'}, 1);
    }
    let seq = 1;
    for (let i = 0; i < 3000 && !m.ended; i++) {
      const p = m.game.phase === 'opening' ? (m.game.kept[0] ? 1 : 0) : m.game.actor();
      let a = choose(m.game, p);
      if (a.type === 'keep')
        a = {type: 'keep', bottom: m.game.players[p].hand.slice(0, m.game.mulls[p]).map(c => c.uid)};
      if (g % 3 === 0 && a.type === 'attackers' && i < 800) a = {...a, uids: []}; // long games, big views
      m.submit(p, a, p === 1 ? ++seq : null);
      out.push(m.view(1), m.view(0));
    }
    if (!m.ended) m.submit(0, {type: 'concede'});
    out.push(m.view(1), m.view(0));
  }
  return out;
}

test('sanitizeView accepts every view an honest referee sends, through to the end of long matches', async () => {
  const all = await views();
  assert.ok(
    all.some(v => v.turn >= 20),
    'late-game views are covered',
  );
  assert.ok(all.some(v => v.winner !== null));
  for (const v of all) assert.equal(sanitizeView(JSON.parse(JSON.stringify(v))) !== undefined, true);
});

test('sanitizeView rejects markup, unknown values, extra fields and prototype keys', async () => {
  const base = viewFor(versusGame('ab'.repeat(32), 'blue'), 1);
  const bad = [
    v => {
      v.reason = '<img src=x onerror=alert(1)>';
    },
    v => {
      v.reason = 'x'.repeat(5000);
    },
    v => {
      v.log.push('</p><script>1</script>');
    },
    v => {
      v.players[0].faction = 'red" onclick="x';
    },
    v => {
      v.players[1].faction = v.players[0].faction;
    },
    v => {
      v.players[0].hand[0].id = 'nope';
    },
    v => {
      v.players[0].hand[0].uid = '1"><b>';
    },
    v => {
      v.players[0].hand[0].damage = Infinity;
    },
    v => {
      v.players[0].hand[0].extra = 1;
    },
    v => {
      v.players[1].hand[0] = {hidden: true, uid: 3};
    },
    v => {
      v.players[1].hand[0] = base.players[0].hand[0];
    },
    v => {
      v.players[0].deck[0] = {hidden: 'yes'};
    },
    v => {
      v.phase = 'toString';
    },
    v => {
      v.phase = '<x>';
    },
    v => {
      v.mode = 'solo';
    },
    v => {
      v.turn = '2';
    },
    v => {
      v.turn = NaN;
    },
    v => {
      v.winner = 2;
    },
    v => {
      v.players = {};
    },
    v => {
      v.stack = [{card: base.players[0].hand[0], p: 0, target: {kind: 'player', p: 1, x: '<b>'}}];
    },
    v => {
      v.blocks = {'1<b>': [2]};
    },
    v => {
      v.events = [{name: '<b>', lesson: 'x', faction: 'red'}];
    },
    v => {
      v.play = 1;
    },
    v => Object.assign(v, JSON.parse('{"__proto__": {"polluted": true}}')),
    v => {
      v.players[0].field = [JSON.parse('{"constructor": 1}')];
    },
    v => {
      v.blocks = JSON.parse('{"prototype": []}');
    },
    () => null,
    () => [],
  ];
  for (const [i, mutate] of bad.entries()) {
    const v = structuredClone(base);
    const out = mutate(v);
    assert.throws(() => sanitizeView(out === undefined ? v : out), /Invalid/, `mutation ${i}`);
  }
  assert.equal({}.polluted, undefined);
  const card = base.players[0].hand[0];
  const ok = structuredClone(base);
  ok.stack = [
    {card, p: 0, target: {kind: 'player', p: 1}},
    {card, p: 1, target: {kind: 'card', uid: 4}},
    {card, p: 1, target: null},
  ];
  ok.blocks = {12: [3, 4]};
  ok.attacks = [12];
  ok.winner = 'draw';
  assert.doesNotThrow(() => sanitizeView(ok));
});

test('host keep entries are redacted to a count and restored from the revealed bottoms', () => {
  const log = [
    {type: 'mulligan', n: 1, by: 0, seq: null, timeout: false},
    {type: 'keep', bottom: [5], n: 2, by: 0, seq: null, timeout: false},
    {type: 'keep', bottom: [60], n: 3, by: 1, seq: 1, timeout: false},
    {type: 'keep', n: 4, by: 0, seq: null, timeout: false},
  ];
  const sent = log.map(redactEntry);
  assert.deepEqual(sent[1], {type: 'keep', bottomCount: 1, n: 2, by: 0, seq: null, timeout: false});
  assert.deepEqual(sent[2], log[2], 'the guest’s own keep is not redacted');
  assert.equal(sent[3].bottomCount, 0);
  assert.equal(JSON.stringify(sent).includes('[5]'), false);
  const bottoms = hostBottoms(log);
  assert.deepEqual(bottoms, {2: [5], 4: []});
  assert.deepEqual(restoreBottoms(sent, bottoms), [log[0], log[1], log[2], {...log[3], bottom: []}]);
  assert.deepEqual(restoreBottoms(sent, {2: [5]})[3].bottom, [], 'an empty bottom need not be revealed');
  assert.equal(restoreBottoms(sent, {2: [5, 6]}), null);
  assert.equal(restoreBottoms(sent, {2: []}), null);
  assert.equal(restoreBottoms(sent, {2: ['5']}), null);
  assert.equal(restoreBottoms(sent, null), null);
  assert.equal(redactEntry(null), null);
});

const mirror = t => {
  POOLS.mirror = {name: 'Mirror', sets: ['first-breach'], deck: f => [...POOLS['first-breach'].deck(f)].reverse()};
  t.after(() => delete POOLS.mirror);
};

test('a First Breach view has no pool key, so its digests are unchanged', () => {
  const view = viewFor(versusGame(SEED, 'blue'), 1);
  assert.equal(Object.hasOwn(view, 'pool'), false);
  assert.doesNotThrow(() => sanitizeView(view));
  assert.throws(() => sanitizeView({...view, pool: 'first-breach'}), /Invalid view: pool/);
});

test('an expansion view carries its pool, and an unknown pool is rejected', t => {
  mirror(t);
  const g = versusGame(SEED, 'blue', 'mirror');
  assert.equal(g.pool, 'mirror');
  const view = viewFor(g, 1);
  assert.equal(view.pool, 'mirror');
  assert.doesNotThrow(() => sanitizeView(view));
  assert.equal(Game.fromJSON(view).pool, 'mirror');
  assert.throws(() => sanitizeView({...view, pool: 'nope'}), /Invalid view: pool/);
  assert.throws(() => sanitizeView({...view, pool: '__proto__'}), /Invalid/);
  assert.throws(() => sanitizeView({...view, pool: 7}), /Invalid view: pool/);
});
