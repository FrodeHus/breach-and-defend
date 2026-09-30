import test from 'node:test';
import assert from 'node:assert/strict';
import {define, put, table} from './helpers/rules.mjs';

const loader = {
  id: 'x-loader',
  type: 'Unit',
  power: 2,
  toughness: 1,
  when: [{keyword: 'rapid', if: {control: 'pt-backdoor'}}],
};

test('a conditional keyword holds only while its condition does', t => {
  define(t, loader);
  const g = table();
  const u = put(g, 0, 'x-loader');
  u.sick = true;
  assert.equal(g.has(u, 'rapid'), false);
  assert.equal(g.canAttack(0, u), false);
  const b = g.createToken(0, 'pt-backdoor');
  assert.equal(g.has(u, 'rapid'), true);
  assert.equal(g.canAttack(0, u), true);
  g.remove(0, b);
  assert.equal(g.canAttack(0, u), false);
});

test('granted keywords last until end of turn and work in combat', () => {
  const g = table();
  const a = put(g, 0, 'r7'); // Lateral Mover 3/3
  const b = put(g, 1, 'b1'); // SOC Trainee 1/2
  a.kw = ['overflow'];
  g.phase = 'attack';
  g.attackers(0, [a.uid]);
  g.phase = 'block';
  g.priority = 1;
  g.blockers(1, {[a.uid]: [b.uid]});
  g.combat();
  assert.equal(g.players[1].life, 19, 'one damage tramples over the 2-toughness blocker');
  g.endTurn();
  assert.equal(Object.hasOwn(a, 'kw'), false);
});

test('a locked-down unit skips exactly one untap step of its controller', () => {
  const g = table();
  const u = put(g, 0, 'r7');
  Object.assign(u, {tapped: true, locked: true});
  g.active = 1;
  g.endTurn(); // player 0's turn starts: stays tapped, lock expires
  assert.equal(u.tapped, true);
  assert.equal(Object.hasOwn(u, 'locked'), false);
  assert.equal(u.sick, false);
  g.endTurn();
  g.endTurn(); // player 0's next turn
  assert.equal(u.tapped, false);
});

test('once-per-turn marks reset at every turn boundary', () => {
  const g = table();
  const u = put(g, 0, 'r7');
  u.used = ['x'];
  g.endTurn();
  assert.equal(Object.hasOwn(u, 'used'), false);
});
