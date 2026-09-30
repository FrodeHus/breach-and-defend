import {BY_ID} from '../../public/cards.mjs';
import {Game} from '../../public/engine.mjs';
import {seededRandom} from '../../public/rng.mjs';

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

// The computer's next move as an action object: it plays on a copy whose move methods only record.
export function aiIntent(game, p) {
  if (game.phase === 'opening') return {type: 'keep', bottom: []};
  const copy = Game.fromJSON(game.toJSON());
  let action = {type: 'pass'};
  const capture = {
    mulligan: () => (action = {type: 'mulligan'}),
    keep: (bottom = []) => (action = {type: 'keep', bottom}),
    play: (q, uid, target = null, options) => (action = {type: 'play', uid, target, ...(options ? {options} : {})}),
    activate: (q, uid, abilityId, options = {}) => (action = {type: 'activate', uid, abilityId, options}),
    choose: (q, selection) => (action = {type: 'choose', selection}),
    pass: () => (action = {type: 'pass'}),
    attackers: (q, uids) => (action = {type: 'attackers', uids}),
    blockers: (q, assignments) => (action = {type: 'blockers', assignments}),
    discard: uids => (action = {type: 'discard', uids}),
  };
  for (const [name, fn] of Object.entries(capture)) copy[name] = fn;
  copy.aiAction(p);
  return action;
}

// Calls the engine method for an action. Seat games return the intent promise from here.
export function perform(g, p, a) {
  switch (a.type) {
    case 'mulligan':
      return g.mulligan(p);
    case 'keep':
      return g.keep(a.bottom, p);
    case 'play':
      return g.play(p, a.uid, a.target, a.options);
    case 'activate':
      return g.activate(p, a.uid, a.abilityId, a.options);
    case 'choose':
      return g.choose(p, a.selection);
    case 'pass':
      return g.pass(p);
    case 'attackers':
      return g.attackers(p, a.uids);
    case 'blockers':
      return g.blockers(p, a.assignments);
    case 'discard':
      return g.discard(a.uids);
    case 'concede':
      return g.concede(p);
  }
}
