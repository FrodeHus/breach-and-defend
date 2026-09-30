import test from 'node:test';
import assert from 'node:assert/strict';
import {seededRandom} from '../public/rng.mjs';

const seed = Uint8Array.from({length: 16}, (_, i) => i * 7 + 1);

test('the same seed yields the same sequence in [0, 1)', () => {
  const xs = Array.from({length: 1000}, seededRandom(seed));
  assert.deepEqual(Array.from({length: 1000}, seededRandom(seed)), xs);
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.ok(new Set(xs).size > 990);
});

test('a different seed yields a different sequence', () => {
  const other = seed.map(b => b ^ 0xff);
  assert.notDeepEqual(Array.from({length: 10}, seededRandom(other)), Array.from({length: 10}, seededRandom(seed)));
});

test('saved state resumes the sequence exactly', () => {
  const a = seededRandom(seed);
  for (let i = 0; i < 50; i++) a();
  const b = seededRandom(JSON.parse(JSON.stringify(a.state)));
  assert.deepEqual(Array.from({length: 20}, b), Array.from({length: 20}, a));
});

test('short seeds are rejected', () => {
  assert.throws(() => seededRandom(new Uint8Array(8)), /16 bytes/);
});
