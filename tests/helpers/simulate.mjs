import {Game} from '../../public/engine.mjs';
import {BY_ID} from '../../public/cards.mjs';

// One complete seeded match: player 1 is the computer, player 0 casts the first legal card, attacks with
// everything and blocks with the first unit that can. Deterministic for a seed.
export function playOut(seed) {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const g = new Game(seed % 2 ? 'blue' : 'red', rng);
  g.keep();
  for (let steps = 0; steps < 10000 && g.winner === null; steps++) {
    if (g.actor() === 1) {
      g.aiAction();
      continue;
    }
    if (g.phase === 'attack') {
      g.attackers(
        0,
        g.players[0].field.filter(c => g.canAttack(0, c)).map(c => c.uid),
      );
      continue;
    }
    if (g.phase === 'block') {
      const assignments = {},
        bs = g.players[0].field.filter(c => BY_ID[c.id].type === 'Unit' && !c.tapped);
      for (const uid of g.attacks) {
        const a = g.find(uid);
        if (!a || a.zone !== 'field') continue;
        const i = bs.findIndex(b => g.canBlock(b, a.card));
        if (i >= 0) assignments[uid] = [bs.splice(i, 1)[0].uid];
      }
      g.blockers(0, assignments);
      continue;
    }
    if (g.phase === 'cleanup') {
      g.discard(g.players[0].hand.slice(0, g.players[0].hand.length - 7).map(c => c.uid));
      continue;
    }
    const cs = g.players[0].hand.filter(c => g.legal(0, c));
    let played = false;
    for (const c of cs) {
      const d = BY_ID[c.id];
      let ts = g.targets(0, c);
      if (d.target === 'unit' || d.target === 'support')
        ts = ts.filter(t => g.find(t.uid).p === (d.effect === 'buff' && d.powerBoost > 0 ? 0 : 1));
      if (d.target === 'spell') ts = ts.filter(t => g.stack.find(s => s.card?.uid === t.uid)?.p === 1);
      if (d.target && !ts.length) continue;
      g.play(0, c.uid, ts[0] || null);
      played = true;
      break;
    }
    if (!played) g.pass(0);
  }
  return g;
}

// A player's real cards wherever they are: tokens are not cards, and abilities on the stack are not either.
// A card being resolved leaves the stack and waits in the pending choice's frame until its steps finish.
export function conserved(g, p) {
  const q = g.players[p],
    resolving = g.pending?.frame?.entry;
  return (
    (resolving?.card && resolving.p === p ? 1 : 0) +
    q.deck.length +
    q.hand.length +
    q.field.filter(c => !BY_ID[c.id].token).length +
    q.grave.length +
    q.archive.length +
    g.stack.filter(s => s.card && s.p === p).length
  );
}

// A complete seeded match with the computer playing both seats. `check(g, step)` runs every `every` actions (25 by default).
export function aiMatch(
  seed,
  {faction = 'red', first = 0, pool = 'first-breach', mode = 'solo', every = 25, check = () => {}} = {},
) {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const g = new Game(faction, rng, {first, pool, mode});
  g.keep([], 0);
  if (mode === 'versus') g.keep([], 1);
  for (let step = 0; step < 20000 && g.winner === null; step++) {
    g.aiAction(g.actor());
    if (step % every === 0) check(g, step);
  }
  return g;
}
