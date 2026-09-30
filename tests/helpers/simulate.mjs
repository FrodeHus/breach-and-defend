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
