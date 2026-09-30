import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../public/engine.mjs';
import {CARDS} from '../public/cards.mjs';
import {dropHandCard} from '../public/card-drag.mjs';

function setup(name) {
  const game = new Game();
  game.phase = 'main1';
  const card = game.card(CARDS.find(c => c.name === name).id);
  game.players[0].hand = [card];
  return {game, card};
}

test('a valid battlefield drop plays the actual card once', () => {
  const {game, card} = setup('Secure Datacenter');
  assert.deepEqual(dropHandCard(game, card.uid, uid => game.play(0, uid)), []);
  assert.equal(game.players[0].hand.length, 0);
  assert.equal(game.players[0].field[0].uid, card.uid);
  assert.equal(game.players[0].landPlayed, true);
});

test('an unaffordable drop reports the reason without playing or spending', () => {
  const {game, card} = setup('Disrupt Infrastructure');
  const before = JSON.stringify(game);
  const issues = dropHandCard(game, card.uid, uid => game.play(0, uid));
  assert.match(issues.join(' '), /4 compute.*0 available/);
  assert.equal(JSON.stringify(game), before);
});

test('drop rechecks priority and rejects cards that left the hand', () => {
  const {game, card} = setup('Secure Datacenter');
  game.priority = 1;
  assert.match(dropHandCard(game, card.uid, () => assert.fail('must not play')).join(' '), /priority/i);
  game.priority = 0;
  game.players[0].hand = [];
  assert.match(dropHandCard(game, card.uid, () => assert.fail('must not play')).join(' '), /hand/i);
});

test('a targeted drop can open selection without paying until a target is chosen', () => {
  const {game, card} = setup('Emergency Patch');
  for (let i = 0; i < 5; i++) game.players[0].field.push(game.card('b0'));
  game.players[0].field.push(game.card('b2'));
  const before = JSON.stringify(game);
  let pending;
  assert.deepEqual(dropHandCard(game, card.uid, uid => { pending = uid; }), []);
  assert.equal(pending, card.uid);
  assert.equal(JSON.stringify(game), before);
  game.play(0, pending, game.targets(0, card)[0]);
  assert.equal(game.players[0].hand.length, 0);
  assert.equal(game.stack.length, 1);
});
