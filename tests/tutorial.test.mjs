import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {CARDS} from '../public/cards.mjs';
import {Tutorial} from '../public/tutorial.mjs';

function add(g, p, type, zone = 'hand') {
  const definition = CARDS.find(c => c.faction === g.players[p].faction && c.type === type);
  const card = g.card(definition.id);
  g.players[p][zone].push(card);
  return card;
}
function act(t, g, fn) {
  const before = t.capture(g);
  fn();
  t.observe(g, before);
}
function resolve(g) { g.pass(g.priority); g.pass(g.priority); }

test('guidance requires explicit opt-in and exit releases response pauses', () => {
  const g = new Game();
  const off = new Tutorial();
  assert.equal(off.step(g), null);
  act(off, g, () => g.keep());
  assert.equal(off.completed.size, 0);
  const on = new Tutorial(true);
  g.phase = 'main1';
  g.stack.push({card: g.card('b3'), p: 0});
  assert.equal(on.shouldPause(g), true);
  on.exit();
  assert.equal(on.step(g), null);
  assert.equal(on.shouldPause(g), false);
  assert.equal(new Tutorial().step(new Game()), null);
});

for (const faction of ['blue', 'red']) {
  test(`${faction}: learns from real actions, including priority, attack and defense`, () => {
    const g = new Game(faction), t = new Tutorial(true);
    assert.equal(t.step(g).id, 'opening');
    act(t, g, () => g.mulligan());
    assert.equal(t.completed.size, 0);
    act(t, g, () => g.keep([g.players[0].hand[0].uid]));
    assert.ok(t.completed.has('opening'));
    resolve(g); resolve(g);
    g.players[0].hand = [];
    const land = add(g, 0, 'Infrastructure');
    const unit = add(g, 0, 'Unit');
    assert.equal(t.step(g).id, 'infrastructure');
    assert.ok(t.step(g).targets.includes(`[data-zone="hand"][data-uid="${land.uid}"]`));
    act(t, g, () => g.play(0, land.uid));
    assert.ok(t.completed.has('infrastructure'));
    assert.equal(t.step(g).id, 'unit');
    act(t, g, () => g.play(0, unit.uid));
    assert.ok(t.completed.has('unit'));
    assert.equal(t.step(g).id, 'response');
    assert.equal(t.shouldPause(g), true);
    act(t, g, () => g.pass(0));
    assert.ok(t.completed.has('response'));
    assert.equal(t.shouldPause(g), false);
    g.pass(1);
    unit.sick = false;
    g.phase = 'attack';
    assert.equal(t.step(g).id, 'attack');
    act(t, g, () => g.attackers(0, [unit.uid]));
    assert.ok(t.completed.has('attack'));
    const enemy = add(g, 1, 'Unit', 'field');
    enemy.sick = false;
    g.active = 1; g.phase = 'attack';
    act(t, g, () => g.attackers(1, [enemy.uid]));
    g.phase = 'block'; unit.tapped = false;
    assert.equal(t.step(g).id, 'block');
    act(t, g, () => g.blockers(0, {[enemy.uid]: [unit.uid]}));
    assert.equal(t.completed.size, 6);
    assert.equal(t.step(g).id, 'complete');
  });
}

test('empty hands, unavailable attackers and computer actions never fabricate progress', () => {
  const g = new Game(), t = new Tutorial(true);
  g.phase = 'main1'; g.players[0].hand = [];
  assert.ok(t.step(g).targets.includes('#advance'));
  assert.equal(t.completed.size, 0);
  g.phase = 'attack';
  act(t, g, () => g.attackers(0, []));
  assert.equal(t.completed.has('attack'), false);
  g.active = 1; g.phase = 'main1'; g.priority = 1;
  const land = add(g, 1, 'Infrastructure');
  act(t, g, () => g.play(1, land.uid));
  assert.equal(t.completed.size, 0);
  assert.equal(t.shouldPause(g), false);
});

test('defending without a legal blocker can advance and match end cannot strand the guide', () => {
  const g = new Game(), t = new Tutorial(true);
  g.active = 1; g.phase = 'attack';
  const attacker = add(g, 1, 'Unit', 'field'); attacker.sick = false;
  g.attackers(1, [attacker.uid]); g.phase = 'block';
  assert.equal(t.step(g).id, 'block');
  assert.ok(t.step(g).targets.includes('#advance'));
  act(t, g, () => g.blockers(0, {}));
  assert.ok(t.completed.has('block'));
  g.winner = 1;
  assert.equal(t.step(g).id, 'ended');
  assert.equal(t.shouldPause(g), false);
});
