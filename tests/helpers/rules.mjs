import {BY_ID} from '../../public/cards.mjs';
import {Game} from '../../public/engine.mjs';

// Registers test-only card definitions (ids starting with x-) for one test.
export function define(t, ...defs) {
  for (const d of defs) BY_ID[d.id] = {set: 'test', faction: 'red', cost: 0, text: '', name: d.id, ...d};
  t.after(() => defs.forEach(d => delete BY_ID[d.id]));
}

// Player 0 (red) in its first main phase with priority, empty hands and battlefields, and ten-card decks.
export function table() {
  const g = new Game('red');
  g.players.forEach((q, i) =>
    Object.assign(q, {
      hand: [],
      field: [],
      grave: [],
      deck: Array.from({length: 10}, () => g.card(i ? 'b1' : 'r1')),
      life: 20,
    }),
  );
  Object.assign(g, {phase: 'main1', kept: [true, true], active: 0, priority: 0, turn: 2});
  return g;
}

export function put(g, p, id, zone = 'field') {
  const c = g.card(id);
  if (zone === 'field') c.sick = false;
  g.players[p][zone].push(c);
  return c;
}
export const compute = (g, p, n) => Array.from({length: n}, () => put(g, p, p ? 'b0' : 'r0'));
// Both players pass once, so the top of the stack resolves.
export function resolveTop(g) {
  g.pass(g.priority);
  g.pass(g.priority);
}
// One combat for the active player: declare, let the defender block, resolve block triggers, deal damage.
// Leaves the game in endCombat with any combat-damage triggers on the stack.
export function fight(g, uids, blocks = {}) {
  g.phase = 'attack';
  g.attackers(g.active, uids);
  while (g.phase === 'afterAttack') g.pass(g.priority);
  g.blockers(1 - g.active, blocks);
  while (g.stack.length) resolveTop(g);
  g.pass(g.priority);
  g.pass(g.priority);
}
