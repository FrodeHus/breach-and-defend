import {BY_ID} from '../../dist/cards.mjs';
import {seededRandom} from '../../dist/rng.mjs';

export const seeded = n => seededRandom(Uint8Array.from({length: 16}, (_, i) => (i + 1) * n));

// A simple deterministic player: keeps, casts untargeted cards, attacks with everything, never blocks.
export function choose(g, p) {
  const me = g.players[p];
  if (g.phase === 'opening') return {type: 'keep', bottom: []};
  if (g.phase === 'attack') return {type: 'attackers', uids: me.field.filter(c => g.canAttack(p, c)).map(c => c.uid)};
  if (g.phase === 'block') return {type: 'blockers', assignments: {}};
  if (g.phase === 'cleanup') return {type: 'discard', uids: me.hand.slice(0, me.hand.length - 7).map(c => c.uid)};
  const card = me.hand.find(c => g.legal(p, c) && !BY_ID[c.id].target);
  return card ? {type: 'play', uid: card.uid, target: null} : {type: 'pass'};
}

// Calls the engine method for an action. Seat games return the intent promise from here.
export function perform(g, p, a) {
  switch (a.type) {
    case 'mulligan': return g.mulligan(p);
    case 'keep': return g.keep(a.bottom, p);
    case 'play': return g.play(p, a.uid, a.target);
    case 'pass': return g.pass(p);
    case 'attackers': return g.attackers(p, a.uids);
    case 'blockers': return g.blockers(p, a.assignments);
    case 'discard': return g.discard(a.uids);
    case 'concede': return g.concede(p);
  }
}
