import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS, TOKENS} from '../public/cards.mjs';
import {LORE} from '../public/lore.mjs';
import {lorePanel} from '../public/lore-panel.mjs';

// Expansion cards and tokens of one faction.
const expansion = faction => [
  ...CARDS.filter(c => c.set === 'persistent-threats' && c.faction === faction),
  ...Object.values(TOKENS).filter(t => t.faction === faction),
];
// The design: where a mechanic abstracts reality (Reuse, Overclock, tokens), the learning text says so.
const ABSTRACTED = /\b(Reuse|Overclock)\b/;

function checkFaction(faction) {
  for (const c of expansion(faction)) {
    assert.ok(LORE[c.name], `${c.name} has lore`);
    assert.ok(c.flavor.length >= 15 && c.flavor.length <= 80, `${c.name} flavor length ${c.flavor.length}`);
    assert.ok(c.flavorBy.length >= 5 && c.flavorBy.length <= 30, `${c.name} speaker length ${c.flavorBy.length}`);
    assert.ok(c.lesson.length >= 200 && c.lesson.length <= 480, `${c.name} learning length ${c.lesson.length}`);
    if (c.token || ABSTRACTED.test(c.text)) assert.match(c.lesson, /in the game/, `${c.name} names its abstraction`);
    const html = lorePanel(c);
    assert.doesNotMatch(html, /undefined|arrive with its release/, `${c.name} renders its lore`);
  }
}

test('red Persistent Threats cards and the Backdoor token have lore', () => checkFaction('red'));

test('the lore panel escapes expansion lore', () => {
  const html = lorePanel({...TOKENS.backdoor, flavor: '"<b>"', flavorBy: '<i>', lesson: '<script>x</script>'});
  assert.doesNotMatch(html, /<script>|<b>|<i>/);
});

test('blue Persistent Threats cards and the Indicator token have lore', () => checkFaction('blue'));

test('every flavor quote is its own, across both sets', () => {
  const quotes = Object.values(LORE).map(l => l.flavor);
  assert.equal(new Set(quotes).size, quotes.length);
});
