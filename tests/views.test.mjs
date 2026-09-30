import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {CARDS} from '../public/cards.mjs';
import {Tutorial} from '../public/tutorial.mjs';
import {card} from '../public/card-view.mjs';
import * as arena from '../public/arena-view.mjs';
import {library, libraryGrid, matches} from '../public/library.mjs';
import {esc} from '../public/html.mjs';

const state = (game, extra = {}) => ({
  game,
  versus: null,
  selected: new Set(),
  blocks: {},
  blocker: null,
  inspect: 'b3',
  inspectorOpen: false,
  loreSide: 'flavor',
  pauseAll: false,
  tutorial: false,
  guidance: new Tutorial(),
  filter: {q: '', faction: 'all', type: 'all'},
  ...extra,
});

test('esc covers every character that can break out of text or an attribute', () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
});

test('the library filters by faction, type and text, and says when nothing matches', () => {
  const blueUnits = CARDS.filter(c => matches(c, {q: '', faction: 'blue', type: 'Unit'}));
  assert.ok(blueUnits.length > 0 && blueUnits.every(c => c.faction === 'blue' && c.type === 'Unit'));
  assert.equal(
    CARDS.filter(c => matches(c, {q: CARDS[0].name.toUpperCase(), faction: 'all', type: 'all'}))[0],
    CARDS[0],
  );
  assert.match(
    libraryGrid(state(null, {filter: {q: 'no such card', faction: 'all', type: 'all'}})),
    /No matching cards/,
  );
  assert.equal((libraryGrid(state(null)).match(/data-card=/g) || []).length, CARDS.length);
  assert.match(
    library(state(null, {filter: {q: '"><img>', faction: 'all', type: 'all'}})),
    /value="&quot;&gt;&lt;img&gt;"/,
  );
});

test('the opening hand and battlefield render from state alone', () => {
  const game = new Game('blue', () => 0.5);
  const opening = arena.opening(state(game));
  assert.match(opening, /Plan your first move/);
  assert.equal((opening.match(/data-zone="opening"/g) || []).length, 7);
  game.keep();
  const board = arena.battlefield(state(game));
  assert.match(board, /id="advance"/);
  assert.match(board, /TRAINING MATCH/);
  assert.equal((board.match(/data-zone="hand"/g) || []).length, 7);
});

test('the recap escapes the match reason and lessons', () => {
  const game = new Game('red', () => 0.5);
  game.keep();
  game.winner = 0;
  game.reason = '<script>x</script>';
  game.events.push({name: '<b>n</b>', lesson: '<i>l</i>', faction: 'red'});
  const html = arena.recapView(state(game));
  assert.ok(!html.includes('<script>') && !html.includes('<b>n') && !html.includes('<i>l'));
  assert.match(html, /Operation successful/);
});

test('a card in hand shows whether it can be played', () => {
  const game = new Game('blue', () => 0.5);
  game.keep();
  const c = game.players[0].hand[0];
  assert.match(card(state(game), c, {zone: 'hand'}), new RegExp(`data-uid="${c.uid}"`));
  assert.match(arena.cardDialog(state(game), c.id, c, 'hand'), /id="cast"/);
});
