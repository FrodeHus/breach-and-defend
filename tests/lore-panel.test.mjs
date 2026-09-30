import test from 'node:test';
import assert from 'node:assert/strict';
import {releasedCards} from '../public/cards.mjs';
import {lorePanel} from '../public/lore-panel.mjs';

test('every card has a flavor quote with attribution and a learning text', () => {
  for (const c of releasedCards()) {
    assert.ok(c.flavor?.length > 10, `${c.name} flavor`);
    assert.ok(c.flavorBy?.length, `${c.name} attribution`);
    assert.ok(c.lesson?.length > 100, `${c.name} learning text`);
  }
});

test('lore panel shows the chosen side and labels the flip button for the other', () => {
  const card = releasedCards()[0];
  const flavor = lorePanel(card);
  assert.match(flavor, /data-side="flavor"/);
  assert.match(flavor, /class="lore-face lore-learn" hidden/);
  assert.match(flavor, /aria-label="Show learning text"/);
  const learn = lorePanel(card, 'learn');
  assert.match(learn, /class="lore-face lore-flavor" hidden/);
  assert.match(learn, /aria-label="Show flavor text"/);
});

test('lore panel escapes card text', () => {
  const html = lorePanel({name: '<x>', faction: 'red', flavor: '"a" & b', flavorBy: '<i>', lesson: '<script>'});
  assert.doesNotMatch(html, /<script>|<i>|<x>/);
});
