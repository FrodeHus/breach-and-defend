import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {compute, fight, put, resolveTop, table} from './helpers/rules.mjs';

const pt = name => CARDS.find(c => c.name === name).id;
const ref = uid => ({kind: 'card', uid});
const count = (g, p, id) => g.players[p].field.filter(c => c.id === id).length;
// Casts a unit, Tool or Control from hand and lets it enter.
function deploy(g, p, name) {
  const c = put(g, p, pt(name), 'hand');
  g.play(p, c.uid);
  resolveTop(g);
  return c;
}

test('Ghost Relay enters tapped, and retires with 3 other compute for two Backdoors', () => {
  const g = table();
  const played = put(g, 0, pt('Ghost Relay'), 'hand');
  g.play(0, played.uid);
  assert.equal(played.tapped, true);
  const relay = put(g, 0, pt('Ghost Relay'));
  compute(g, 0, 3);
  g.activate(0, relay.uid, 'cash');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 2);
  assert.ok(g.players[0].grave.some(c => c.uid === relay.uid));
});

test('Reconnaissance Outpost enters tapped and probes 1', () => {
  const g = table();
  const c = put(g, 0, pt('Reconnaissance Outpost'), 'hand');
  g.play(0, c.uid);
  assert.equal(c.tapped, true);
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
  assert.equal(g.pending.options.length, 1);
});

test('Attack Surface Mapper is a 1/1 that probes 1 when it enters', () => {
  const g = table();
  compute(g, 0, 1);
  const c = deploy(g, 0, 'Attack Surface Mapper');
  assert.deepEqual(g.stats(c, 0), {power: 1, toughness: 1});
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
});

test('Beachhead Scout creates a Backdoor when it hits the opponent', () => {
  const g = table();
  const s = put(g, 0, pt('Beachhead Scout'));
  fight(g, [s.uid]);
  assert.equal(g.players[1].life, 18);
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 1);
});

test('Staged Loader has Rapid deploy only while you control a Backdoor', () => {
  const g = table();
  const l = put(g, 0, pt('Staged Loader'));
  l.sick = true;
  assert.equal(g.canAttack(0, l), false);
  g.createToken(0, 'pt-backdoor');
  assert.equal(g.canAttack(0, l), true);
  assert.deepEqual(g.stats(l, 0), {power: 2, toughness: 1});
});

test('Dead-Drop Courier has Stealth and probes 1 when defeated', () => {
  const g = table();
  const c = put(g, 0, pt('Dead-Drop Courier'));
  assert.equal(g.canBlock(put(g, 1, 'b1'), c), false);
  assert.equal(g.canBlock(put(g, 1, 'b2'), c), true, 'Endpoint Sensor has Detection');
  g.remove(0, c);
  g.settle();
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
});

test('Access Broker gets +1/+0 the first time you retire a Tool each turn', () => {
  const g = table();
  compute(g, 0, 2);
  const b = put(g, 0, pt('Access Broker')),
    t1 = g.createToken(0, 'pt-backdoor'),
    t2 = g.createToken(0, 'pt-backdoor');
  g.activate(0, t1.uid, 'boost', {targets: {t: ref(b.uid)}});
  resolveTop(g);
  resolveTop(g);
  assert.equal(g.stats(b, 0).power, 3 + 1 + 2);
  g.activate(0, t2.uid, 'boost', {targets: {t: ref(b.uid)}});
  assert.equal(g.stack.length, 1);
});

test('Dormant Implant creates a Backdoor when it enters', () => {
  const g = table();
  compute(g, 0, 3);
  deploy(g, 0, 'Dormant Implant');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 1);
});

test('Living-off-the-Land Operator draws then discards when you cast from your discard', () => {
  const g = table();
  put(g, 0, pt('Living-off-the-Land Operator'));
  put(g, 0, 'r13', 'hand');
  compute(g, 0, 3);
  const m = put(g, 0, pt('Map Trust Relationships'), 'grave');
  g.play(0, m.uid, null, {reuse: true});
  assert.equal(g.stack.at(-1).ability.id, 'loot');
  resolveTop(g);
  assert.equal(g.pending.kind, 'discard');
});

test('Redundant Handler returns to hand when defeated if you retire a Backdoor', () => {
  const g = table();
  const h = put(g, 0, pt('Redundant Handler'));
  const b = g.createToken(0, 'pt-backdoor');
  h.damage = 4;
  g.settle();
  resolveTop(g);
  assert.equal(g.pending.kind, 'optional');
  g.choose(0, {uid: b.uid});
  assert.ok(g.players[0].hand.some(c => c.id === pt('Redundant Handler')));
  assert.equal(count(g, 0, 'pt-backdoor'), 0);
});

test('Coordinated Intrusion Lead spends a Backdoor for +1/+0 and Overflow', () => {
  const g = table();
  compute(g, 0, 1);
  const lead = put(g, 0, pt('Coordinated Intrusion Lead')),
    u = put(g, 0, 'r7'),
    b = g.createToken(0, 'pt-backdoor');
  g.activate(0, lead.uid, 'surge', {targets: {t: ref(u.uid)}, costUids: [b.uid]});
  resolveTop(g);
  assert.equal(g.stats(u, 0).power, 4);
  assert.equal(g.has(u, 'overflow'), true);
});

test('Long-Haul Campaign has Overflow and creates two Backdoors when it enters', () => {
  const g = table();
  compute(g, 0, 6);
  const c = deploy(g, 0, 'Long-Haul Campaign');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 2);
  assert.equal(g.has(c, 'overflow'), true);
});

test('Disposable Cache creates a Backdoor, and retires another Tool to draw two then discard one', () => {
  const g = table();
  compute(g, 0, 4);
  const cache = deploy(g, 0, 'Disposable Cache');
  resolveTop(g);
  const b = g.players[0].field.find(c => c.id === 'pt-backdoor');
  put(g, 0, 'r13', 'hand');
  g.activate(0, cache.uid, 'cycle', {costUids: [b.uid]});
  resolveTop(g);
  assert.equal(g.pending.kind, 'discard');
  assert.equal(g.pending.options.length, 3);
});

test('Exfiltration Buffer draws once when your units hit the opponent', () => {
  const g = table();
  put(g, 0, pt('Exfiltration Buffer'));
  const a = put(g, 0, 'r7'),
    b = put(g, 0, 'r7');
  fight(g, [a.uid, b.uid]);
  assert.equal(g.stack.length, 1);
  resolveTop(g);
  assert.equal(g.players[0].hand.length, 1);
});

test('Distributed Command pings on your first Tool retirement each turn', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, pt('Distributed Command'));
  const u = put(g, 0, 'r7'),
    t1 = g.createToken(0, 'pt-backdoor'),
    t2 = g.createToken(0, 'pt-backdoor');
  g.activate(0, t1.uid, 'boost', {targets: {t: ref(u.uid)}});
  resolveTop(g);
  resolveTop(g);
  assert.equal(g.players[1].life, 19);
  g.activate(0, t2.uid, 'boost', {targets: {t: ref(u.uid)}});
  assert.equal(g.stack.length, 1);
});

test('Distributed Command creates a Backdoor at your end step only after attacking with two units', () => {
  for (const n of [1, 2]) {
    const g = table();
    put(g, 0, pt('Distributed Command'));
    const units = [put(g, 0, 'r7'), put(g, 0, 'r7')].slice(0, n);
    fight(
      g,
      units.map(u => u.uid),
    );
    while (g.phase !== 'end') g.pass(g.priority);
    assert.equal(g.stack.length, n === 2 ? 1 : 0);
    if (n === 2) assert.equal(g.stack[0].ability.id, 'regroup');
  }
});

const castSpell = (g, p, name, options = {}) => {
  const c = put(g, p, pt(name), 'hand');
  g.play(p, c.uid, null, options);
  return c;
};

test('Map Trust Relationships probes 2, and can be reused from the discard for 3', () => {
  const g = table();
  compute(g, 0, 1);
  castSpell(g, 0, 'Map Trust Relationships');
  resolveTop(g);
  assert.equal(g.pending.options.length, 2);
  g.choose(0, g.defaultChoice());
  compute(g, 0, 3);
  const c = g.players[0].grave.find(x => x.id === pt('Map Trust Relationships'));
  g.play(0, c.uid, null, {reuse: true});
  resolveTop(g);
  g.choose(0, g.defaultChoice());
  assert.ok(g.players[0].archive.some(x => x.uid === c.uid));
});

test('Seed Access creates two Backdoors', () => {
  const g = table();
  compute(g, 0, 2);
  castSpell(g, 0, 'Seed Access');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-backdoor'), 2);
});

test('Coordinated Pressure deals 4 to an opposing unit, or 6 overclocked', () => {
  const g = table();
  compute(g, 0, 8);
  const a = put(g, 1, 'b8'),
    b = put(g, 1, 'b7');
  castSpell(g, 0, 'Coordinated Pressure', {targets: {t: ref(a.uid)}});
  resolveTop(g);
  assert.ok(
    g.players[1].grave.some(c => c.uid === a.uid),
    '4 defeats a 3/4',
  );
  castSpell(g, 0, 'Coordinated Pressure', {overclock: true, targets: {t: ref(b.uid)}});
  resolveTop(g);
  assert.ok(
    g.players[1].grave.some(c => c.uid === b.uid),
    '6 defeats a 1/5',
  );
});

test('Burn the Channel retires a Tool to destroy an opposing unit', () => {
  const g = table();
  compute(g, 0, 2);
  const target = put(g, 1, 'b8');
  const c = put(g, 0, pt('Burn the Channel'), 'hand');
  assert.deepEqual(
    g.playIssues(0, c).map(i => i.code),
    ['retire'],
  );
  const b = g.createToken(0, 'pt-backdoor');
  g.play(0, c.uid, null, {targets: {t: ref(target.uid)}, costUids: [b.uid]});
  resolveTop(g);
  assert.ok(g.players[1].grave.some(x => x.uid === target.uid));
});

test('Cascading Outage deals 2 to every unit, or 4 overclocked, including yours', () => {
  const g = table();
  compute(g, 0, 10);
  const mine = put(g, 0, 'r7'),
    small = put(g, 1, 'b1'),
    big = put(g, 1, 'b8');
  castSpell(g, 0, 'Cascading Outage');
  resolveTop(g);
  assert.deepEqual([mine.damage, big.damage], [2, 2]);
  assert.ok(g.players[1].grave.some(x => x.uid === small.uid));
  g.endTurn();
  g.endTurn();
  g.phase = 'main1';
  castSpell(g, 0, 'Cascading Outage', {overclock: true});
  resolveTop(g);
  assert.ok(g.players[0].grave.some(x => x.uid === mine.uid));
  assert.ok(g.players[1].grave.some(x => x.uid === big.uid));
});

test('Adaptive Payload gives +2/+0, or +2/+2 and Overflow overclocked', () => {
  const g = table();
  compute(g, 0, 4);
  const u = put(g, 0, 'r7');
  castSpell(g, 0, 'Adaptive Payload', {targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.deepEqual(g.stats(u, 0), {power: 5, toughness: 3});
  castSpell(g, 0, 'Adaptive Payload', {overclock: true, targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.deepEqual(g.stats(u, 0), {power: 7, toughness: 5});
  assert.equal(g.has(u, 'overflow'), true);
});

test('Exploit the Handoff deals 2, or 4 to a tapped unit', () => {
  const g = table();
  compute(g, 0, 4);
  const ready = put(g, 1, 'b7'),
    busy = put(g, 1, 'b7');
  busy.tapped = true;
  castSpell(g, 0, 'Exploit the Handoff', {targets: {t: ref(ready.uid)}});
  resolveTop(g);
  castSpell(g, 0, 'Exploit the Handoff', {targets: {t: ref(busy.uid)}});
  resolveTop(g);
  assert.deepEqual([ready.damage, busy.damage], [2, 4]);
});

test('Signal Spoof counters unless its controller pays 2, then probes 1', () => {
  const g = table();
  g.active = 1;
  g.priority = 1;
  compute(g, 1, 4);
  const logs = put(g, 1, CARDS.find(c => c.name === 'Correlate Logs').id, 'hand');
  g.play(1, logs.uid);
  g.pass(1);
  compute(g, 0, 2);
  castSpell(g, 0, 'Signal Spoof', {targets: {t: {kind: 'spell', uid: logs.uid}}});
  resolveTop(g);
  assert.equal(g.pending.kind, 'pay');
  g.choose(1, {pay: false});
  assert.ok(g.players[1].grave.some(c => c.uid === logs.uid));
  assert.equal(g.pending.kind, 'probe');
  assert.equal(g.pending.actor, 0);
});

test('Reopened Connection returns your unit to hand and draws; Reuse archives it', () => {
  const g = table();
  compute(g, 0, 6);
  const u = put(g, 0, 'r7');
  const c = castSpell(g, 0, 'Reopened Connection', {targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.ok(g.players[0].hand.some(x => x.id === 'r7'));
  assert.equal(g.players[0].hand.length, 2);
  const v = put(g, 0, 'r7');
  g.play(0, c.uid, null, {reuse: true, targets: {t: ref(v.uid)}});
  resolveTop(g);
  assert.ok(g.players[0].archive.some(x => x.uid === c.uid));
});

test('Burn Credentials archives up to two cards from one player’s discard, then probes 1', () => {
  const g = table();
  compute(g, 0, 2);
  const a = put(g, 1, 'b7', 'grave'),
    b = put(g, 1, 'b8', 'grave'),
    mine = put(g, 0, 'r7', 'grave');
  const c = put(g, 0, pt('Burn Credentials'), 'hand');
  assert.throws(() => g.play(0, c.uid, null, {targets: {g: [ref(a.uid), ref(mine.uid)]}}), /single player/);
  g.play(0, c.uid, null, {targets: {g: [ref(a.uid), ref(b.uid)]}});
  resolveTop(g);
  assert.equal(g.players[1].archive.length, 2);
  assert.equal(g.pending.kind, 'probe');
});
