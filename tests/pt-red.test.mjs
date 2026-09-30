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
