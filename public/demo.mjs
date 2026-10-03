// Local spectator matches use the same rules and computer policy as training.
import {Game} from './engine.mjs';
import {DEFAULT_POOL} from './cards.mjs';

export function createDemo(pool = DEFAULT_POOL, random = Math.random) {
  const game = new Game('blue', random, {mode: 'demo', pool});
  game.keep([], 0);
  game.keep([], 1);
  return game;
}

export function stepDemo(game, paused = false) {
  if (paused || game.mode !== 'demo' || game.winner !== null) return;
  game.aiAction(game.actor());
}
