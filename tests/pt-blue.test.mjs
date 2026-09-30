import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../public/cards.mjs';
import {compute, fight, put, resolveTop, table} from './helpers/rules.mjs';

const pt = name => CARDS.find(c => c.name === name).id;
const fb = name => CARDS.find(c => c.name === name && c.set === 'first-breach').id;
const ref = uid => ({kind: 'card', uid});
const count = (g, p, id) => g.players[p].field.filter(c => c.id === id).length;
function deploy(g, p, name) {
  const c = put(g, p, pt(name), 'hand');
  g.play(p, c.uid);
  resolveTop(g);
  return c;
}

test('Forensic Repository enters tapped, and retires with 3 other compute for two Indicators', () => {
  const g = table();
  const played = put(g, 0, pt('Forensic Repository'), 'hand');
  g.play(0, played.uid);
  assert.equal(played.tapped, true);
  const repo = put(g, 0, pt('Forensic Repository'));
  compute(g, 0, 3);
  g.activate(0, repo.uid, 'preserve');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 2);
});

test('Instrumented Datacenter enters tapped and probes 1', () => {
  const g = table();
  const c = put(g, 0, pt('Instrumented Datacenter'), 'hand');
  g.play(0, c.uid);
  assert.equal(c.tapped, true);
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
});

test('Alert Triage Analyst is a 1/1 that probes 1 when it enters', () => {
  const g = table();
  compute(g, 0, 1);
  const c = deploy(g, 0, 'Alert Triage Analyst');
  assert.deepEqual(g.stats(c, 0), {power: 1, toughness: 1});
  resolveTop(g);
  assert.equal(g.pending.kind, 'probe');
});

test('Canary Service cannot attack and creates two Indicators when defeated', () => {
  const g = table();
  const c = put(g, 0, pt('Canary Service'));
  assert.equal(g.canAttack(0, c), false);
  c.damage = 3;
  g.settle();
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 2);
});

test('Telemetry Curator creates an Indicator when it enters', () => {
  const g = table();
  compute(g, 0, 2);
  deploy(g, 0, 'Telemetry Curator');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 1);
});

test('Behavioral Monitor has Detection and creates an Indicator when it blocks', () => {
  const g = table();
  const m = put(g, 0, pt('Behavioral Monitor'));
  g.active = 1;
  g.priority = 1;
  const a = put(g, 1, 'r5'); // Rogue Access Point, Stealth
  fight(g, [a.uid], {[a.uid]: [m.uid]});
  assert.equal(count(g, 0, 'pt-indicator'), 1);
});

test('Case Analyst gets +1/+1 the first time you retire an Indicator each turn', () => {
  const g = table();
  compute(g, 0, 4);
  const c = put(g, 0, pt('Case Analyst')),
    i1 = g.createToken(0, 'pt-indicator'),
    i2 = g.createToken(0, 'pt-indicator');
  g.activate(0, i1.uid, 'analyze');
  resolveTop(g);
  resolveTop(g);
  assert.deepEqual(g.stats(c, 0), {power: 3, toughness: 4});
  g.activate(0, i2.uid, 'analyze');
  assert.equal(g.stack.length, 1);
});

test('Lockdown Coordinator taps and locks down an opposing unit when it enters', () => {
  const g = table();
  compute(g, 0, 3);
  const foe = put(g, 1, 'b8');
  deploy(g, 0, 'Lockdown Coordinator');
  resolveTop(g);
  assert.deepEqual([foe.tapped, foe.locked], [true, true]);
});

test('Restoration Lead returns a unit card with cost 2 or less from your discard to hand', () => {
  const g = table();
  compute(g, 0, 4);
  const small = put(g, 0, 'r1', 'grave'),
    big = put(g, 0, 'r7', 'grave');
  deploy(g, 0, 'Restoration Lead');
  resolveTop(g);
  assert.ok(g.players[0].hand.some(c => c.id === 'r1'));
  assert.ok(g.players[0].grave.some(c => c.uid === big.uid));
  assert.ok(!g.players[0].grave.some(c => c.uid === small.uid));
});

test('Adaptive Perimeter has Always-on only while you control an Indicator', () => {
  const g = table();
  const a = put(g, 0, pt('Adaptive Perimeter'));
  assert.equal(g.has(a, 'alwaysOn'), false);
  assert.equal(g.has(a, 'detection'), true);
  g.createToken(0, 'pt-indicator');
  assert.equal(g.has(a, 'alwaysOn'), true);
});

test('Incident Commander untaps a unit you control when you retire an Indicator', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, pt('Incident Commander'));
  const u = put(g, 0, 'r7');
  u.tapped = true;
  const i = g.createToken(0, 'pt-indicator');
  g.activate(0, i.uid, 'analyze');
  assert.equal(g.pending.kind, 'targets');
  g.choose(0, {targets: {t: ref(u.uid)}});
  resolveTop(g);
  assert.equal(u.tapped, false);
});

test('Resilient Service Mesh is Always-on and creates two Indicators when it enters', () => {
  const g = table();
  compute(g, 0, 6);
  const m = deploy(g, 0, 'Resilient Service Mesh');
  resolveTop(g);
  assert.equal(count(g, 0, 'pt-indicator'), 2);
  assert.equal(g.has(m, 'alwaysOn'), true);
});

test('Analysis Workbench creates an Indicator, and spends one to draw two then discard one', () => {
  const g = table();
  compute(g, 0, 4);
  const w = deploy(g, 0, 'Analysis Workbench');
  resolveTop(g);
  const i = g.players[0].field.find(c => c.id === 'pt-indicator');
  put(g, 0, 'r13', 'hand');
  g.activate(0, w.uid, 'study', {costUids: [i.uid]});
  resolveTop(g);
  assert.equal(g.pending.kind, 'discard');
});

test('Recovery Runbook archives a unit card from your discard to gain 3 capacity', () => {
  const g = table();
  compute(g, 0, 2);
  const r = put(g, 0, pt('Recovery Runbook')),
    dead = put(g, 0, 'r7', 'grave');
  g.activate(0, r.uid, 'recover', {costUids: [dead.uid]});
  assert.ok(g.players[0].archive.some(c => c.uid === dead.uid));
  resolveTop(g);
  assert.equal(g.players[0].life, 23);
});

test('Continuous Validation creates an Indicator on an opponent’s second cast in a turn', () => {
  const g = table();
  put(g, 0, pt('Continuous Validation'));
  g.active = 1;
  g.priority = 1;
  compute(g, 1, 4);
  const logs = fb('Correlate Logs');
  g.play(1, put(g, 1, logs, 'hand').uid);
  resolveTop(g);
  g.play(1, put(g, 1, logs, 'hand').uid);
  assert.equal(g.stack.at(-1).ability?.id, 'signal');
});

test('Continuous Validation gains 1 capacity the first time you retire an Indicator each turn', () => {
  const g = table();
  compute(g, 0, 2);
  put(g, 0, pt('Continuous Validation'));
  g.activate(0, g.createToken(0, 'pt-indicator').uid, 'analyze');
  resolveTop(g);
  assert.equal(g.players[0].life, 21);
});
