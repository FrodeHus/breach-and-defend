import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {seededRandom} from '../public/rng.mjs';
import {Tutorial} from '../public/tutorial.mjs';
import {landing} from '../public/landing.mjs';
import * as arena from '../public/arena-view.mjs';

test('landing offers a direct demo entry without choosing a side', () => {
  assert.match(landing(), /id="watchDemo"[^>]*>Watch demo/);
});

const state = game => ({
  game,
  versus: null,
  selected: new Set(),
  blocks: {},
  inspect: 'b3',
  guidance: new Tutorial(),
  demoPaused: false,
});

test('demo offers spectator controls and inspection without player actions', () => {
  const game = new Game('blue', seededRandom([1, 2, 3, 4]), {mode: 'demo'});
  game.keep([], 0);
  game.keep([], 1);
  const s = state(game);
  const board = arena.battlefield(s);
  assert.match(board, /DEMO MATCH/);
  assert.match(board, /id="demoPause"[^>]*>Pause demo/);
  assert.match(board, /id="demoRestart"/);
  assert.doesNotMatch(board, /id="advance"|id="pauseAll"|YOU \/|Drag to your battlefield/);
  assert.match(arena.battlefield({...s, demoPaused: true}), />Resume demo/);
  const c = game.players[0].hand[0];
  assert.doesNotMatch(arena.cardDialog(s, c.id, c, 'hand'), /id="cast"|id="reuse"|data-ability=/);
});

test('demo recap names the winning team and offers another demo', () => {
  const game = new Game('blue', seededRandom([1, 2, 3, 4]), {mode: 'demo'});
  game.winner = 1;
  const html = arena.recapView(state(game));
  assert.match(html, /DEMO MATCH \/ COMPLETE/);
  assert.match(html, /Red team wins/);
  assert.match(html, /Watch again/);
  assert.doesNotMatch(html, /your capacity|opponent capacity|Change faction/);
});

test('automatic demo plays both sides to completion in either card pool', async () => {
  const {createDemo, stepDemo} = await import('../public/demo.mjs');
  for (const pool of ['first-breach', 'first-breach+persistent-threats']) {
    for (let seed = 1; seed <= 5; seed++) {
      const game = createDemo(pool, seededRandom([seed, 2, 3, 4]));
      assert.deepEqual(game.kept, [true, true]);
      assert.notEqual(game.phase, 'opening');
      const before = game.toJSON();
      stepDemo(game, true);
      assert.deepEqual(game.toJSON(), before, 'pausing leaves the match untouched');
      const actors = new Set();
      for (let steps = 0; steps < 20000 && game.winner === null; steps++) {
        actors.add(game.actor());
        stepDemo(game);
      }
      assert.equal(actors.size, 2, 'both computers must act');
      assert.notEqual(game.winner, null, `${pool}, seed ${seed} must finish`);
      const ended = game.toJSON();
      stepDemo(game);
      assert.deepEqual(game.toJSON(), ended, 'completed demos stop');
    }
  }
});
