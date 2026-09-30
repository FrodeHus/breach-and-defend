import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS, SETS} from '../public/cards.mjs';

const set = CARDS.filter(c => c.set === 'persistent-threats');

test('Persistent Threats has 50 cards with the design’s ids, in order, and stays unreleased', () => {
  assert.equal(SETS['persistent-threats'].released, false);
  assert.deepEqual(
    set.map(c => c.id),
    [
      ...Array.from({length: 25}, (_, i) => `pt-r${String(i + 1).padStart(2, '0')}`),
      ...Array.from({length: 25}, (_, i) => `pt-b${String(i + 1).padStart(2, '0')}`),
    ],
  );
  assert.equal(new Set(CARDS.map(c => c.name)).size, CARDS.length, 'names are unique across both sets');
});

test('each faction has 2 Infrastructure, 10 Units, 5 Operations, 5 Responses, 2 Tools and 1 Control', () => {
  for (const faction of ['red', 'blue']) {
    const byType = Object.groupBy(
      set.filter(c => c.faction === faction),
      c => c.type,
    );
    assert.deepEqual(
      Object.fromEntries(Object.entries(byType).map(([t, cs]) => [t, cs.length])),
      {Infrastructure: 2, Unit: 10, Operation: 5, Response: 5, Tool: 2, Control: 1},
      faction,
    );
  }
});

test('every expansion card is written as rules the engine can read', () => {
  for (const c of set) {
    if (['Operation', 'Response'].includes(c.type)) assert.ok(c.steps || c.modes, `${c.name} has steps`);
    if (c.type === 'Unit') assert.ok(c.power >= 0 && c.toughness > 0 && c.subtype, `${c.name} stats`);
    for (const a of c.abilities ?? []) assert.ok(a.id && a.label && a.steps?.length, `${c.name} ability ${a.id}`);
    assert.ok(c.text.length > 10, `${c.name} text`);
  }
});
