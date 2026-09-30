// AI-vs-AI playtests for the balance report: the design's metrics per matchup. A measurement, not a correctness test.
import {BY_ID, EXPANSION_POOL, deck} from '../../public/cards.mjs';
import {Game} from '../../public/engine.mjs';

export const MATCHUPS = {
  'PT vs PT': {red: 'pt', blue: 'pt'},
  'PT red vs FB blue': {red: 'pt', blue: 'fb'},
  'FB red vs PT blue': {red: 'fb', blue: 'pt'},
};
const lcg = seed => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
};

// Player 0 is red. A First Breach side gets its starter deck and an opening hand drawn from it.
export function setupMatch(seed, {red, blue}, first) {
  const g = new Game('red', lcg(seed), {first, pool: EXPANSION_POOL});
  [red, blue].forEach((kind, p) => {
    if (kind !== 'fb') return;
    const P = g.players[p];
    P.deck = g.shuffle(deck(P.faction).map(id => g.card(id)));
    P.hand = [];
    g.draw(p, 7);
  });
  return g;
}

export function playtestMatch(seed, sides, first, maxSteps = 20000) {
  const g = setupMatch(seed, sides, first);
  const m = {tokens: [0, 0], reuse: [0, 0], overclock: [0, 0], casts: [0, 0], choices: 0};
  const createToken = g.createToken.bind(g),
    emit = g.emit.bind(g),
    play = g.play.bind(g);
  g.createToken = (p, id) => (m.tokens[p]++, createToken(p, id));
  g.emit = e => {
    if (e.type === 'cast') {
      m.casts[e.p]++;
      if (e.fromGrave) m.reuse[e.p]++;
    }
    return emit(e);
  };
  g.play = (p, uid, target, options) => {
    if (options?.overclock) m.overclock[p]++;
    return play(p, uid, target, options);
  };
  g.keep([], 0);
  let seen = null;
  for (let step = 0; step < maxSteps && g.winner === null; step++) {
    if (g.pending && g.pending.id !== seen) {
      m.choices++;
      seen = g.pending.id;
    }
    g.aiAction(g.actor());
  }
  const unspent = g.players.map(P => P.field.filter(c => BY_ID[c.id].token).length);
  return {winner: g.winner, first, turns: g.turn, stalled: g.winner === null, unspent, ...m};
}

const sum = pair => pair[0] + pair[1];
export function playtest(seeds, matchups = MATCHUPS) {
  return Object.entries(matchups).map(([matchup, sides]) => {
    const games = seeds.flatMap(seed => [0, 1].map(first => playtestMatch(seed, sides, first)));
    const done = games.filter(g => !g.stalled);
    const avg = f => done.reduce((a, g) => a + f(g), 0) / Math.max(done.length, 1);
    return {
      matchup,
      games: games.length,
      stalled: games.length - done.length,
      redWins: done.filter(g => g.winner === 0).length,
      firstWins: done.filter(g => g.winner === g.first).length,
      turns: avg(g => g.turns),
      tokensMade: avg(g => sum(g.tokens)),
      tokensUnspent: avg(g => sum(g.unspent)),
      reuseCasts: avg(g => sum(g.reuse)),
      overclocks: avg(g => sum(g.overclock)),
      choices: avg(g => g.choices),
    };
  });
}

// A 95% Wilson interval for k wins in n games, in whole percent.
export function interval(k, n) {
  if (!n) return [0, 0];
  const z = 1.96,
    p = k / n,
    d = 1 + (z * z) / n,
    c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.round((c - h) * 100), Math.round((c + h) * 100)];
}

const pct = (k, n) => {
  const [lo, hi] = interval(k, n);
  return `${n ? Math.round((100 * k) / n) : 0}% (${lo}–${hi})`;
};
export function report(rows) {
  const head =
    '| Matchup | Games | Stalled | Red wins | First player wins | Turns | Tokens made | Tokens unspent | Reuse casts | Overclocks | Choices |\n|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|';
  const body = rows.map(r => {
    const n = r.games - r.stalled;
    return `| ${r.matchup} | ${r.games} | ${r.stalled} | ${pct(r.redWins, n)} | ${pct(r.firstWins, n)} | ${r.turns.toFixed(1)} | ${r.tokensMade.toFixed(1)} | ${r.tokensUnspent.toFixed(1)} | ${r.reuseCasts.toFixed(1)} | ${r.overclocks.toFixed(1)} | ${r.choices.toFixed(1)} |`;
  });
  return [head, ...body].join('\n');
}
